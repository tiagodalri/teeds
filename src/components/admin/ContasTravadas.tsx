import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import { SeloDoParceiro } from '../parceiros/SeloDoParceiro'
import './vendas.css'
import './contas-travadas.css'

/**
 * Contas travadas (GlobalFly, 16/11/2026, Tiago: "as pessoas receberam a notificação? teve alguém que
 * clicou em algum botão do modal?").
 *
 * Quem é Gold sem saldo na conta real (teeds_conta_travada), o que fez na janela "Libere a sua conta"
 * (liberacao_eventos, gravado pelo site), se recebeu e tocou a notificação dos travados e quem já liberou
 * desde que a trava entrou (liberacao_travados_inicio). Leitura: gf_painel_liberacao, no escopo do admin.
 */

type Tipo = 'abriu' | 'depositar' | 'conectar' | 'verificar' | 'black' | 'prestige' | 'suporte' | 'fechar'
interface Pessoa {
  user_id: string; nome: string | null; email: string | null; parceiro: string | null; parceiro_nome: string | null
  travada: boolean; subplano: string; saldo: number; conta_real: boolean; no_inicio: boolean
  cliques: Partial<Record<Tipo, number>> | null; primeiro: string | null; ultimo: string | null
  push_enviado: boolean; push_recebeu: boolean; push_clicou: boolean
}
interface Disparo { id: string; em: string; titulo: string; pessoas: number; aparelhos: number; receberam: number; clicaram: number }
interface Painel { agora: string; parceiro: string | null; inicio: string | null; travados_agora: number; pessoas: Pessoa[]; dias: Array<{ dia: string; tipo: Tipo; cliques: number; pessoas: number }>; push: Disparo[] }

const BOTOES: Array<[Tipo, string]> = [
  ['abriu', 'Viu a janela'], ['depositar', 'Depositar na Deriv'], ['conectar', 'Conectar a Deriv'], ['verificar', 'Já depositei'],
  ['black', 'Quero o Black'], ['prestige', 'Quero o Prestige'], ['suporte', 'Falar com o suporte'], ['fechar', 'Fechou a janela'],
]
const CAMINHOS: Tipo[] = ['depositar', 'conectar', 'verificar', 'black', 'prestige', 'suporte']

async function lerPainel(sessao: SessaoTeeds, marca: string, parceiro: string | null): Promise<Painel> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/gf_painel_liberacao`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error('Não foi possível ler as contas travadas agora.')
  return await r.json()
}

const inteiro = (n: number) => n.toLocaleString('pt-BR')
const pct = (a: number, b: number) => (b ? `${(a / b * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%` : '—')
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const usd = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })
const n = (p: Pessoa, t: Tipo) => p.cliques?.[t] ?? 0
const tocouCaminho = (p: Pessoa) => CAMINHOS.some((t) => n(p, t) > 0)
const liberou = (p: Pessoa) => p.no_inicio && !p.travada
const comoLiberou = (p: Pessoa) => (p.subplano === 'black' || p.subplano === 'prestige') ? `Upgrade ${p.subplano === 'black' ? 'Black' : 'Prestige'}` : p.saldo > 0 ? `Depositou · ${usd(p.saldo)}` : 'Liberado'

type FSit = 'todas' | 'travados' | 'liberaram'
type FInt = 'todas' | 'viram' | 'tocaram' | 'nada' | 'push'
const POR_PAGINA = 100

export function ContasTravadas({ sessao, marca, parceiro, pedido = 0, onAbrirCliente }: {
  sessao: SessaoTeeds; marca: string; parceiro: string | null; pedido?: number; onAbrirCliente?: (userId: string) => void
}) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [busca, setBusca] = useState('')
  const [fSit, setFSit] = useState<FSit>('todas')
  const [fInt, setFInt] = useState<FInt>('todas')
  const [mostrar, setMostrar] = useState(POR_PAGINA)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try { setPainel(await lerPainel(sessao, marca, parceiro)); setErro(null) } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }, [sessao, marca, parceiro])
  useEffect(() => { void carregar() }, [carregar, pedido])
  // ao vivo: relê a cada minuto
  useEffect(() => { const t = window.setInterval(() => { void carregar() }, 60_000); return () => window.clearInterval(t) }, [carregar])
  useEffect(() => { setMostrar(POR_PAGINA) }, [busca, fSit, fInt])

  const pessoas = painel?.pessoas ?? []
  const numeros = useMemo(() => {
    const inicio = pessoas.filter((p) => p.no_inicio).length
    const lib = pessoas.filter(liberou)
    const viram = pessoas.filter((p) => n(p, 'abriu') > 0)
    const tocaram = pessoas.filter(tocouCaminho)
    const libDepois = lib.filter((p) => n(p, 'abriu') > 0)
    const botoes = BOTOES.map(([t, rot]) => ({ t, rot, pessoas: pessoas.filter((p) => n(p, t) > 0).length, cliques: pessoas.reduce((s, p) => s + n(p, t), 0) }))
    return {
      inicio, liberaram: lib.length, deposito: lib.filter((p) => p.saldo > 0 && p.subplano === 'gold').length,
      upgrade: lib.filter((p) => p.subplano === 'black' || p.subplano === 'prestige').length,
      viram: viram.length, tocaram: tocaram.length, libDepois: libDepois.length, botoes,
      aberturas: pessoas.reduce((s, p) => s + n(p, 'abriu'), 0),
    }
  }, [pessoas])
  const push = painel?.push ?? []
  const pushTot = push.reduce((a, d) => ({ pessoas: a.pessoas + d.pessoas, receberam: a.receberam + d.receberam, clicaram: a.clicaram + d.clicaram }), { pessoas: 0, receberam: 0, clicaram: 0 })

  const lista = useMemo(() => {
    const q = semAcento(busca.trim())
    return pessoas.filter((p) =>
      (fSit === 'todas' || (fSit === 'travados' ? p.travada : liberou(p)))
      && (fInt === 'todas' || (fInt === 'viram' ? n(p, 'abriu') > 0 : fInt === 'tocaram' ? tocouCaminho(p) : fInt === 'push' ? p.push_clicou : n(p, 'abriu') === 0))
      && (!q || semAcento(`${p.nome ?? ''} ${p.email ?? ''}`).includes(q)))
  }, [pessoas, busca, fSit, fInt])
  const filtrando = busca.trim() !== '' || fSit !== 'todas' || fInt !== 'todas'
  const limpar = () => { setBusca(''); setFSit('todas'); setFInt('todas') }
  const maxBotao = Math.max(1, ...numeros.botoes.map((b) => b.pessoas))

  return <div className="vnd ctv">
    <div className="vnd-topo">
      <span>{carregando && !painel ? 'Lendo as contas travadas…' : `Gold sem saldo na conta real da Deriv${painel?.inicio ? ` · trava desde ${dataHora(painel.inicio)}` : ''} · atualiza a cada minuto`}</span>
    </div>

    <div className="vnd-kpis">
      <button className={`vnd-kpi perigo ${fSit === 'travados' ? 'on' : ''}`} onClick={() => setFSit((f) => f === 'travados' ? 'todas' : 'travados')}>
        <span>Travados agora</span><strong>{painel ? inteiro(painel.travados_agora) : '—'}</strong><small>{inteiro(numeros.inicio)} quando a trava entrou</small></button>
      <button className={`vnd-kpi destaque ${fSit === 'liberaram' ? 'on' : ''}`} onClick={() => setFSit((f) => f === 'liberaram' ? 'todas' : 'liberaram')}>
        <span>Liberaram</span><strong>{painel ? inteiro(numeros.liberaram) : '—'}</strong><small>{numeros.deposito} por depósito · {numeros.upgrade} por upgrade</small></button>
      <button className={`vnd-kpi ${fInt === 'viram' ? 'on' : ''}`} onClick={() => setFInt((f) => f === 'viram' ? 'todas' : 'viram')}>
        <span>Viram a janela</span><strong>{painel ? inteiro(numeros.viram) : '—'}</strong><small>{inteiro(numeros.aberturas)} {numeros.aberturas === 1 ? 'abertura' : 'aberturas'} no total</small></button>
      <button className={`vnd-kpi ${fInt === 'tocaram' ? 'on' : ''}`} onClick={() => setFInt((f) => f === 'tocaram' ? 'todas' : 'tocaram')}>
        <span>Tocaram em um caminho</span><strong>{painel ? inteiro(numeros.tocaram) : '—'}</strong><small>{pct(numeros.tocaram, numeros.viram)} de quem viu a janela</small></button>
      <article className="vnd-kpi"><span>Notificação recebida</span><strong>{painel ? inteiro(pushTot.receberam) : '—'}</strong>
        <small>{push.length ? `de ${inteiro(pushTot.pessoas)} ${pushTot.pessoas === 1 ? 'pessoa' : 'pessoas'} com o app` : 'Nenhum envio ainda'}</small></article>
      <button className={`vnd-kpi ${fInt === 'push' ? 'on' : ''}`} onClick={() => setFInt((f) => f === 'push' ? 'todas' : 'push')}>
        <span>Tocaram na notificação</span><strong>{painel ? inteiro(pushTot.clicaram) : '—'}</strong><small>{pct(pushTot.clicaram, pushTot.receberam)} de quem recebeu</small></button>
    </div>

    <div className="ctv-meio">
      <section className="admin-card ctv-botoes">
        <header><div><span className="rot">Janela "Libere a sua conta"</span><h3>Quem tocou em cada botão</h3></div><small>pessoas · toques</small></header>
        <ol>
          {numeros.botoes.map((b) => <li key={b.t} className={`ctv-b-${b.t}`}>
            <span>{b.rot}</span>
            <i aria-hidden="true"><b style={{ width: `${b.pessoas / maxBotao * 100}%` }} /></i>
            <strong>{inteiro(b.pessoas)}</strong><small>{inteiro(b.cliques)}</small>
          </li>)}
        </ol>
      </section>
      <section className="admin-card ctv-funil">
        <header><div><span className="rot">Do aviso à liberação</span><h3>O caminho dos travados</h3></div></header>
        <ol>
          {[
            ['Travados quando a trava entrou', numeros.inicio],
            ['Viram a janela', numeros.viram],
            ['Tocaram em um caminho', numeros.tocaram],
            ['Liberaram', numeros.liberaram],
          ].map(([rot, v], i, arr) => <li key={String(rot)}>
            <span>{rot}</span><strong>{inteiro(Number(v))}</strong>
            <small>{i === 0 ? '100%' : pct(Number(v), Number(arr[0][1]))}</small>
            <i aria-hidden="true"><b style={{ width: `${numeros.inicio ? Math.max(1.5, Number(v) / numeros.inicio * 100) : 0}%` }} /></i>
          </li>)}
        </ol>
        {push.length > 0 && <div className="ctv-push">
          <span className="rot">Notificações para os travados</span>
          {push.map((d) => <p key={d.id}><b>{d.titulo}</b><small>{dataHora(d.em)} · enviada para {inteiro(d.pessoas)} · recebida por {inteiro(d.receberam)} · tocada por {inteiro(d.clicaram)}</small></p>)}
        </div>}
      </section>
    </div>

    <section className="admin-card full vnd-card">
      <header><div><span className="rot">Pessoas</span><h3>Cada travado e o que fez</h3></div><small>{inteiro(lista.length)} {lista.length === 1 ? 'pessoa' : 'pessoas'}</small></header>
      <div className="vnd-filtros">
        <label className="vnd-busca"><svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input placeholder="Buscar cliente: nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <label className="vnd-select"><span>Situação</span><select value={fSit} onChange={(e) => setFSit(e.target.value as FSit)}>
          <option value="todas">Todas</option><option value="travados">Travados</option><option value="liberaram">Liberaram</option></select></label>
        <label className="vnd-select"><span>Na janela</span><select value={fInt} onChange={(e) => setFInt(e.target.value as FInt)}>
          <option value="todas">Todos</option><option value="viram">Viram a janela</option><option value="tocaram">Tocaram em um caminho</option><option value="nada">Ainda não viram</option><option value="push">Tocaram na notificação</option></select></label>
        {filtrando && <button className="vnd-limpar" onClick={limpar}>Limpar filtros</button>}
      </div>
      {erro && !painel && <div className="adm-vazio">{erro} Clique em Atualizar no topo para tentar de novo.</div>}
      {painel && (lista.length ? <div className="rc-tabela ctv-tab">
        <div className="cab"><span>Cliente</span><span>Situação</span><span>Janela</span><span>Botões tocados</span><span>Notificação</span><span>Última ação</span></div>
        {lista.slice(0, mostrar).map((p) => <div key={p.user_id}>
          <span><button type="button" className="vnd-quem" disabled={!onAbrirCliente} onClick={() => onAbrirCliente?.(p.user_id)} title="Abrir a ficha do cliente">
            <i>{(p.nome || p.email || '?')[0].toUpperCase()}</i><b>{p.nome || 'Sem nome'}<SeloDoParceiro codigo={p.parceiro} nome={p.parceiro_nome} /><small>{p.email}</small></b></button></span>
          <span>{p.travada ? <em className="vnd-sit reembolsada">Travado</em> : <em className="vnd-sit aprovada">{comoLiberou(p)}</em>}
            <small>{p.travada ? (p.conta_real ? 'Conta real zerada' : 'Sem conta real') : ''}</small></span>
          <span>{n(p, 'abriu') ? <><b>{n(p, 'abriu')}×</b><small>{p.primeiro ? `desde ${dataHora(p.primeiro)}` : ''}</small></> : <small>Ainda não viu</small>}</span>
          <span className="ctv-chips">{CAMINHOS.concat('fechar').filter((t) => n(p, t) > 0).map((t) => <em key={t} className={`ctv-chip ctv-b-${t}`}>{BOTOES.find(([x]) => x === t)?.[1]}{n(p, t) > 1 ? ` ×${n(p, t)}` : ''}</em>)}
            {!CAMINHOS.concat('fechar').some((t) => n(p, t) > 0) && <small>Nenhum</small>}</span>
          <span>{p.push_clicou ? <em className="vnd-sit aprovada">Tocou</em> : p.push_recebeu ? <em className="vnd-sit aguardando">Recebeu</em> : p.push_enviado ? <small>Enviada, sem confirmação</small> : <small>Sem o app</small>}</span>
          <span>{p.ultimo ? dataHora(p.ultimo) : <small>—</small>}</span>
        </div>)}
      </div> : <div className="adm-vazio">{filtrando ? 'Ninguém com esses filtros.' : 'Nenhuma conta travada.'}</div>)}
      {painel && lista.length > mostrar && <button type="button" className="ctv-mais" onClick={() => setMostrar((m) => m + POR_PAGINA)}>Mostrar mais {inteiro(Math.min(POR_PAGINA, lista.length - mostrar))} (faltam {inteiro(lista.length - mostrar)})</button>}
    </section>
  </div>
}
