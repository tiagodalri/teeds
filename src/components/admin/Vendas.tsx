import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import './vendas.css'

/**
 * Vendas (10/11/2026, Tiago: "onde eu consigo verificar as vendas? Black, Prestige etc do Victor e
 * do Naor? precisamos dessa métrica na plataforma, bem pensado").
 *
 * Cada pedido que a Cakto avisou (`compras_cakto`, gravado pelo servidor no aviso de compra), agrupado
 * por pedido, com o cliente, o parceiro, a conta da Cakto que recebeu, a situação e o acesso. Leitura:
 * `teeds_vendas_planos`, no escopo de cada admin (o admin do parceiro só vê as vendas dos clientes dele).
 *
 * A conta da Cakto segue a regra do checkout da plataforma (subplanos.checkout_por_parceiro): quem veio
 * do Naor (/n) compra na Cakto do Naor; os outros, na do Victor. Valores em reais, como a Cakto cobra:
 * "valor pago" é o que saiu do cartão/PIX, com os juros do parcelamento; "preço" é o do plano.
 */

interface Evento { evento: string; acao: string; em: string }
interface Pedido {
  pedido: string; primeiro: string; ultimo: string; produto: string; produto_nome: string
  valor: number | null; email: string; user_id: string | null; eventos: Evento[]; expira_em: string | null
  reembolsada: boolean; chargeback: boolean; aprovada: boolean; renovada: boolean; cancelou_renovacao: boolean
  recusada: boolean; aguardando: boolean; abandono: boolean
  nome: string | null; parceiro: string | null; parceiro_nome: string | null; tem_cadastro: boolean
  conta: 'victor' | 'naor' | null; acesso_ativo: boolean
}
interface Painel {
  agora: string; parceiro: string | null; precos: Record<string, number>
  pedidos: Pedido[]; assinantes: Record<string, number>; base: number
}
type Situacao = 'aprovada' | 'reembolsada' | 'chargeback' | 'recusada' | 'aguardando' | 'abandono' | 'outra'
type Periodo = 'hoje' | 7 | 30 | 90 | 'tudo'
const PERIODOS: Array<[Periodo, string]> = [['hoje', 'Hoje'], [7, '7 dias'], [30, '30 dias'], [90, '90 dias'], ['tudo', 'Tudo']]

async function lerVendas(sessao: SessaoTeeds, marca: string, parceiro: string | null): Promise<Painel> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_vendas_planos`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error('Não foi possível ler as vendas agora.')
  return await r.json()
}

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const inteiro = (n: number) => n.toLocaleString('pt-BR')
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })
const diaSp = (iso: string | number) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const diaCurto = (dia: string) => new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

function situacao(p: Pedido): Situacao {
  if (p.chargeback) return 'chargeback'
  if (p.reembolsada) return 'reembolsada'
  if (p.aprovada) return 'aprovada'
  if (p.recusada) return 'recusada'
  if (p.aguardando) return 'aguardando'
  if (p.abandono) return 'abandono'
  return 'outra'
}
const ROTULO_SITUACAO: Record<Situacao, string> = {
  aprovada: 'Aprovada', reembolsada: 'Reembolsada', chargeback: 'Chargeback', recusada: 'Recusada',
  aguardando: 'Aguardando pagamento', abandono: 'Abandonou o checkout', outra: 'Outro aviso',
}
const ROTULO_EVENTO: Record<string, string> = {
  purchase_approved: 'Pagamento aprovado', subscription_created: 'Assinatura criada', subscription_renewed: 'Assinatura renovada',
  subscription_canceled: 'Renovação cancelada', subscription_cancelled: 'Renovação cancelada', subscription_resumed: 'Assinatura retomada',
  subscription_late_recovered: 'Atraso recuperado', refund: 'Reembolso', refunded: 'Reembolso', chargeback: 'Chargeback', chargedback: 'Chargeback',
  purchase_refused: 'Pagamento recusado', pix_gerado: 'PIX gerado', boleto_gerado: 'Boleto gerado', picpay_gerado: 'PicPay gerado',
  openfinance_nubank_gerado: 'Nubank gerado', checkout_abandonment: 'Abandonou o checkout', initiate_checkout: 'Abriu o checkout',
}
const plano = (p: Pedido) => p.produto === 'gf-black' ? 'black' : p.produto === 'gf-prestige' ? 'prestige' : 'outro'
const nomePlano = (p: Pedido) => p.produto === 'gf-black' ? 'Black' : p.produto === 'gf-prestige' ? 'Prestige' : p.produto_nome.replace(/^GF Member /, '')
const nomeConta = (c: Pedido['conta']) => c === 'naor' ? 'Cakto do Naor' : c === 'victor' ? 'Cakto do Victor' : 'Sem cadastro'
const seloParceiro = (p: Pedido) => p.parceiro ? `${(p.parceiro_nome ?? p.parceiro).split(' ')[0]} /${p.parceiro}` : p.tem_cadastro ? 'Direto' : 'Sem cadastro'

export function Vendas({ sessao, marca, parceiro, pedido = 0, onAbrirCliente }: {
  sessao: SessaoTeeds; marca: string; parceiro: string | null
  /** Sobe quando o Atualizar do topo do Admin é clicado: relê na hora. */
  pedido?: number
  onAbrirCliente?: (userId: string) => void
}) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [periodo, setPeriodo] = useState<Periodo>(30)
  const [busca, setBusca] = useState('')
  const [fPlano, setFPlano] = useState<'todos' | 'black' | 'prestige'>('todos')
  const [fConta, setFConta] = useState<'todas' | 'victor' | 'naor'>('todas')
  const [fSituacao, setFSituacao] = useState<'todas' | Situacao>('todas')
  const [ordem, setOrdem] = useState<'recente' | 'valor'>('recente')
  const [aberto, setAberto] = useState<string | null>(null)

  const ler = useCallback(async () => {
    setCarregando(true)
    try { setPainel(await lerVendas(sessao, marca, parceiro)); setErro(null) }
    catch (e) { setErro((e as Error).message) }
    finally { setCarregando(false) }
  }, [sessao.token, marca, parceiro]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void ler()
    const t = window.setInterval(() => { if (!document.hidden) void ler() }, 60_000)
    return () => window.clearInterval(t)
  }, [ler])
  useEffect(() => { if (pedido) void ler() }, [pedido]) // eslint-disable-line react-hooks/exhaustive-deps

  const agora = painel ? Date.parse(painel.agora) : Date.now()
  const hoje = diaSp(agora)
  const inicio = periodo === 'hoje' ? hoje : periodo === 'tudo' ? '0000-00-00' : diaSp(agora - (periodo - 1) * 864e5)
  const preco = (p: Pedido) => painel?.precos[p.produto] ?? null

  const doPeriodo = useMemo(() => (painel?.pedidos ?? []).filter((p) => diaSp(p.primeiro) >= inicio), [painel, inicio])
  const lista = useMemo(() => {
    const q = semAcento(busca.trim())
    const l = doPeriodo.filter((p) => (fPlano === 'todos' || plano(p) === fPlano)
      && (fConta === 'todas' || p.conta === fConta)
      && (fSituacao === 'todas' || situacao(p) === fSituacao)
      && (!q || semAcento(`${p.nome ?? ''} ${p.email} ${p.pedido}`).includes(q)))
    return ordem === 'valor' ? [...l].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0)) : l
  }, [doPeriodo, busca, fPlano, fConta, fSituacao, ordem])

  const numeros = useMemo(() => {
    const aprov = doPeriodo.filter((p) => situacao(p) === 'aprovada')
    const soma = (l: Pedido[]) => l.reduce((s, p) => s + (p.valor ?? 0), 0)
    const por = (f: (p: Pedido) => boolean) => { const l = aprov.filter(f); return { n: l.length, total: soma(l) } }
    const perdidas = doPeriodo.filter((p) => ['reembolsada', 'chargeback'].includes(situacao(p)))
    return {
      vendas: aprov.length, receita: soma(aprov),
      hoje: por((p) => diaSp(p.primeiro) === hoje),
      black: por((p) => plano(p) === 'black'), prestige: por((p) => plano(p) === 'prestige'),
      victor: { ...por((p) => p.conta === 'victor'), black: aprov.filter((p) => p.conta === 'victor' && plano(p) === 'black').length, prestige: aprov.filter((p) => p.conta === 'victor' && plano(p) === 'prestige').length },
      naor: { ...por((p) => p.conta === 'naor'), black: aprov.filter((p) => p.conta === 'naor' && plano(p) === 'black').length, prestige: aprov.filter((p) => p.conta === 'naor' && plano(p) === 'prestige').length },
      perdidas: { n: perdidas.length, total: soma(perdidas) },
      juros: aprov.reduce((s, p) => { const pr = preco(p); return s + (pr && p.valor ? Math.max(0, p.valor - pr) : 0) }, 0),
    }
  }, [doPeriodo, hoje]) // eslint-disable-line react-hooks/exhaustive-deps

  const barras = useMemo(() => {
    if (!painel) return null
    const aprov = doPeriodo.filter((p) => situacao(p) === 'aprovada')
    const primeiro = periodo === 'tudo' ? (aprov.length ? diaSp(aprov[aprov.length - 1].primeiro) : hoje) : inicio
    const dias: Array<{ dia: string; black: number; prestige: number; outro: number; n: number }> = []
    for (let t = Date.parse(`${primeiro}T12:00:00Z`); diaSp(t) <= hoje && dias.length < 120; t += 864e5) dias.push({ dia: diaSp(t), black: 0, prestige: 0, outro: 0, n: 0 })
    for (const p of aprov) { const d = dias.find((x) => x.dia === diaSp(p.primeiro)); if (d) { d[plano(p) as 'black' | 'prestige' | 'outro'] += p.valor ?? 0; d.n++ } }
    const max = Math.max(1, ...dias.map((d) => d.black + d.prestige + d.outro))
    return dias.length > 1 ? { dias, max } : null
  }, [painel, doPeriodo, periodo, inicio, hoje])

  const ativos = { black: painel?.assinantes['gf-black'] ?? 0, prestige: painel?.assinantes['gf-prestige'] ?? 0 }
  const pagantes = ativos.black + ativos.prestige
  const filtrando = busca.trim() !== '' || fPlano !== 'todos' || fConta !== 'todas' || fSituacao !== 'todas'
  const limpar = () => { setBusca(''); setFPlano('todos'); setFConta('todas'); setFSituacao('todas') }
  const rotuloPeriodo = PERIODOS.find(([p]) => p === periodo)?.[1] ?? ''
  const soUmaConta = !!painel?.parceiro

  return <div className="vnd">
    <div className="vnd-topo">
      <div className="rc-periodo">{PERIODOS.map(([p, r]) => <button key={String(p)} className={periodo === p ? 'on' : ''} onClick={() => setPeriodo(p)}>{r}</button>)}</div>
      <span>{carregando && !painel ? 'Lendo as vendas…' : 'As vendas chegam na hora, pelo aviso da Cakto · valores em reais'}</span>
    </div>

    <div className="vnd-kpis">
      <article className="vnd-kpi destaque"><span>Receita · {rotuloPeriodo}</span><strong>{painel ? reais(numeros.receita) : '—'}</strong>
        <small>{inteiro(numeros.vendas)} {numeros.vendas === 1 ? 'venda aprovada' : 'vendas aprovadas'}{numeros.vendas ? ` · ticket médio ${reais(numeros.receita / numeros.vendas)}` : ''}</small></article>
      <article className="vnd-kpi"><span>Hoje</span><strong>{painel ? reais(numeros.hoje.total) : '—'}</strong><small>{inteiro(numeros.hoje.n)} {numeros.hoje.n === 1 ? 'venda' : 'vendas'}</small></article>
      <button className={`vnd-kpi vnd-black ${fPlano === 'black' ? 'on' : ''}`} onClick={() => setFPlano((f) => f === 'black' ? 'todos' : 'black')}><span>Black</span><strong>{inteiro(numeros.black.n)}</strong><small>{reais(numeros.black.total)}</small></button>
      <button className={`vnd-kpi vnd-prestige ${fPlano === 'prestige' ? 'on' : ''}`} onClick={() => setFPlano((f) => f === 'prestige' ? 'todos' : 'prestige')}><span>Prestige</span><strong>{inteiro(numeros.prestige.n)}</strong><small>{reais(numeros.prestige.total)}</small></button>
      <article className="vnd-kpi"><span>Assinantes ativos agora</span><strong>{painel ? inteiro(pagantes) : '—'}</strong>
        <small>{ativos.black} Black · {ativos.prestige} Prestige{painel?.base ? ` · ${(pagantes / painel.base * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de ${inteiro(painel.base)} clientes` : ''}</small></article>
      <button className={`vnd-kpi ${numeros.perdidas.n ? 'perigo' : ''} ${fSituacao === 'reembolsada' ? 'on' : ''}`} onClick={() => setFSituacao((f) => f === 'reembolsada' ? 'todas' : 'reembolsada')}><span>Reembolsos e chargebacks</span><strong>{inteiro(numeros.perdidas.n)}</strong><small>{numeros.perdidas.n ? reais(numeros.perdidas.total) : 'nenhum no período'}</small></button>
    </div>

    {!soUmaConta && <div className="vnd-contas">
      {(['victor', 'naor'] as const).map((c) => <button key={c} className={`vnd-conta ${fConta === c ? 'on' : ''}`} onClick={() => setFConta((f) => f === c ? 'todas' : c)}>
        <span className="vnd-conta-nome"><i>{c === 'victor' ? 'V' : 'N'}</i><b>{nomeConta(c)}<small>{c === 'victor' ? 'Recebe as vendas do /v e dos clientes diretos' : 'Recebe as vendas de quem veio do /n'}</small></b></span>
        <span className="vnd-conta-num"><strong>{reais(numeros[c].total)}</strong><small>{numeros[c].n} {numeros[c].n === 1 ? 'venda' : 'vendas'} · {numeros[c].black} Black · {numeros[c].prestige} Prestige</small></span>
      </button>)}
    </div>}

    {barras && <section className="admin-card full vnd-dias">
      <header><div><span className="rot">Receita por dia · {rotuloPeriodo}</span><h3>{reais(numeros.receita)}{numeros.juros > 0 && <small className="vnd-juros">{reais(numeros.juros)} são juros do parcelamento</small>}</h3></div>
        <div className="vnd-legenda"><span className="black">Black</span><span className="prestige">Prestige</span></div></header>
      <div className="vnd-barras" style={{ gridTemplateColumns: `repeat(${barras.dias.length}, minmax(0, 1fr))` }}>
        {barras.dias.map((d, i) => {
          const total = d.black + d.prestige + d.outro
          const passo = barras.dias.length > 45 ? 10 : barras.dias.length > 15 ? 5 : 1
          return <div key={d.dia} title={`${diaCurto(d.dia)} · ${d.n} ${d.n === 1 ? 'venda' : 'vendas'} · ${reais(total)}`}>
            <span className="pilha">
              {d.outro > 0 && <i className="outro" style={{ height: `${d.outro / barras.max * 100}%` }} />}
              {d.prestige > 0 && <i className="prestige" style={{ height: `${d.prestige / barras.max * 100}%` }} />}
              {d.black > 0 && <i className="black" style={{ height: `${d.black / barras.max * 100}%` }} />}
            </span>
            <small>{i % passo === 0 || i === barras.dias.length - 1 ? diaCurto(d.dia) : ''}</small>
          </div>
        })}
      </div>
    </section>}

    <section className="admin-card full vnd-card">
      <header><div><span className="rot">Pedidos da Cakto · {rotuloPeriodo}</span><h3>Cada venda, quem comprou e a situação</h3></div>
        <small>{inteiro(lista.length)} {lista.length === 1 ? 'pedido' : 'pedidos'}</small></header>
      <div className="vnd-filtros">
        <label className="vnd-busca"><svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input placeholder="Buscar cliente: nome, e-mail ou pedido" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <label className="vnd-select"><span>Plano</span><select value={fPlano} onChange={(e) => setFPlano(e.target.value as typeof fPlano)}><option value="todos">Todos</option><option value="black">Black</option><option value="prestige">Prestige</option></select></label>
        {!soUmaConta && <label className="vnd-select"><span>Conta</span><select value={fConta} onChange={(e) => setFConta(e.target.value as typeof fConta)}><option value="todas">Victor e Naor</option><option value="victor">Cakto do Victor</option><option value="naor">Cakto do Naor</option></select></label>}
        <label className="vnd-select"><span>Situação</span><select value={fSituacao} onChange={(e) => setFSituacao(e.target.value as typeof fSituacao)}>
          <option value="todas">Todas</option>{(Object.keys(ROTULO_SITUACAO) as Situacao[]).filter((s) => s !== 'outra').map((s) => <option key={s} value={s}>{ROTULO_SITUACAO[s]}</option>)}</select></label>
        <label className="vnd-select"><span>Ordem</span><select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}><option value="recente">Mais recentes</option><option value="valor">Maior valor</option></select></label>
        {filtrando && <button className="vnd-limpar" onClick={limpar}>Limpar filtros</button>}
      </div>

      {erro && !painel && <div className="adm-vazio">{erro} Clique em Atualizar no topo para tentar de novo.</div>}
      {painel && (lista.length ? <div className="rc-tabela vnd-tab">
        <div className="cab"><span>Cliente</span><span>Plano</span><span>Valor pago</span><span>Conta</span><span>Quando</span><span>Situação</span><span>Acesso</span></div>
        {lista.map((p) => {
          const s = situacao(p); const pr = preco(p); const juros = pr && p.valor ? p.valor - pr : 0
          return <Fragment key={p.pedido}>
            <div className={aberto === p.pedido ? 'aberto' : ''}>
              <span><button type="button" className="vnd-quem" disabled={!p.user_id || !onAbrirCliente} onClick={() => p.user_id && onAbrirCliente?.(p.user_id)} title={p.user_id ? 'Abrir a ficha do cliente' : 'Comprou sem cadastro na plataforma'}>
                <i>{(p.nome || p.email || '?')[0].toUpperCase()}</i><b>{p.nome || 'Sem cadastro'}<small>{p.email} · {seloParceiro(p)}</small></b></button></span>
              <span><em className={`vnd-selo ${plano(p)}`}>{nomePlano(p)}</em></span>
              <span><b>{p.valor != null ? reais(p.valor) : '—'}</b><small>{pr != null ? (juros > 0.5 ? `preço ${reais(pr)} · ${reais(juros)} de juros` : `preço ${reais(pr)}`) : ''}</small></span>
              <span>{nomeConta(p.conta)}</span>
              <span>{dataHora(p.primeiro)}<small>{p.renovada ? 'com renovação' : ''}</small></span>
              <span><em className={`vnd-sit ${s}`}>{ROTULO_SITUACAO[s]}</em>{p.cancelou_renovacao && <small>não vai renovar</small>}</span>
              <span>{p.acesso_ativo ? <>Ativo{p.expira_em && <small>até {data(p.expira_em)}</small>}</> : s === 'aprovada' && !p.user_id ? <>Pendente<small>falta o cadastro</small></> : 'Sem acesso'}
                <button type="button" className="vnd-eventos" onClick={() => setAberto((a) => a === p.pedido ? null : p.pedido)} aria-expanded={aberto === p.pedido}>{aberto === p.pedido ? 'Fechar' : `${p.eventos.length} ${p.eventos.length === 1 ? 'aviso' : 'avisos'}`}</button></span>
            </div>
            {aberto === p.pedido && <div className="vnd-linha-eventos">
              <span className="rot">Avisos da Cakto · pedido {p.pedido}</span>
              <ol>{p.eventos.map((e, i) => <li key={i}><b>{ROTULO_EVENTO[e.evento] ?? e.evento}</b><small>{dataHora(e.em)}{e.acao === 'liberou' ? ' · liberou o acesso' : e.acao === 'renovou' ? ' · somou mais 1 ano' : e.acao === 'revogou' ? ' · tirou o acesso' : e.acao === 'sem-cadastro' ? ' · comprador sem cadastro' : ''}</small></li>)}</ol>
            </div>}
          </Fragment>
        })}
      </div> : <div className="adm-vazio">{filtrando ? 'Nenhuma venda com esses filtros.' : doPeriodo.length ? 'Nada aqui.' : 'Nenhuma venda nesse período.'}</div>)}
    </section>
  </div>
}
