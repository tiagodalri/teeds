import { useEffect, useMemo, useState } from 'react'
import type { ContatoWpp, WhatsAppApi } from '../../core/teeds/whatsapp'
import type { FichaDoContato, LadoDoResultado } from '../../core/teeds/fichaDoCliente'
import './ficha-cliente.css'

/*
  A ficha do cliente na lateral do chat do Assessor (25/11/2026, Tiago: "TIPO PAINEL DA CIA, FICHA COMPLETA!
  INOVE! SURPREENDA! MODERNIZE! IMERSIVIDADE!"). Prefixo CSS fc-.

  Herói com a foto (a do WhatsApp; sem ela, a da plataforma; sem nenhuma, as iniciais) e a cor do plano,
  números grandes do dinheiro, os últimos 30 dias em barras, o desempenho, o engajamento (aulas, lives,
  acessos), o que comprou e a linha do tempo. Tipo de conta verdadeiro: é a tela do ADM.
*/

const usd = (v: number | null | undefined, sinal = false) => {
  if (v === null || v === undefined) return '—'
  const s = sinal ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : ''
  return `${s}US$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
const brl = (v: number | null) => (v === null ? '—' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const data = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—')
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
function haQuanto(iso: string | null | undefined): string {
  if (!iso) return '—'
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 90) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  const d = Math.round(s / 86400)
  return d < 45 ? `há ${d} dia${d > 1 ? 's' : ''}` : `há ${Math.round(d / 30)} meses`
}
const diasDesde = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)) : 0)
const tom = (v: number) => (v > 0 ? 'sobe' : v < 0 ? 'desce' : '')
const iniciais = (nome: string) => nome.replace(/^\+/, '').split(/\s+/).filter((p) => /\p{L}/u.test(p)).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
const PLANO: Record<string, string> = { gold: 'Gold', black: 'Black', prestige: 'Prestige' }

const ICONE: Record<string, string> = {
  cadastro: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  operacao: 'M4 17l5-5 4 4 7-8M15 8h5v5',
  deposito: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  saque: 'M12 20V8M7 13l5-5 5 5M5 4h14',
  compra: 'M6 7h12l-1 13H7zM9 7a3 3 0 0 1 6 0',
  live: 'M4 7h12v10H4zM16 10.5l4-2.5v8l-4-2.5',
  aula: 'M3 8l9-4 9 4-9 4zM7 10v5c0 1.5 2.2 3 5 3s5-1.5 5-3v-5',
  whatsapp: 'M4.2 19.8l1.2-3.9A8.2 8.2 0 1 1 8.4 18.7z',
  acesso: 'M12 7v5l3 2M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18z',
}
const Icone = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden><path d={d} /></svg>

function Anel({ parte, total, rotulo, valor, cor }: { parte: number; total: number; rotulo: string; valor: string; cor: string }) {
  const p = total > 0 ? Math.min(1, parte / total) : 0
  const C = 2 * Math.PI * 22
  return <div className="fc-anel" style={{ ['--cor' as string]: cor }}>
    <svg viewBox="0 0 52 52" aria-hidden><circle cx="26" cy="26" r="22" className="trilho" /><circle cx="26" cy="26" r="22" className="arco" strokeDasharray={`${C * p} ${C}`} /></svg>
    <b>{valor}</b><small>{rotulo}</small>
  </div>
}

function Barras({ dias, conta }: { dias: Array<{ dia: string; real: number; demo: number }>; conta: 'real' | 'demo' }) {
  const vals = dias.map((d) => d[conta])
  const max = Math.max(1, ...vals.map(Math.abs))
  const total = vals.reduce((t, v) => t + v, 0)
  return <div className="fc-barras-caixa">
    <div className="fc-barras" role="img" aria-label={`Resultado dos últimos 30 dias na conta ${conta}: ${usd(total, true)}`}>
      {dias.map((d) => { const v = d[conta]; return <span key={d.dia} className={tom(v)} style={{ ['--h' as string]: `${Math.max(v === 0 ? 0 : 6, (Math.abs(v) / max) * 100)}%` }} title={`${d.dia.split('-').reverse().slice(0, 2).join('/')} · ${usd(v, true)}`} /> })}
    </div>
    <div className="fc-barras-pe"><span>30 dias atrás</span><b className={tom(total)}>{usd(total, true)}</b><span>hoje</span></div>
  </div>
}

export function FichaDoCliente({ api, contato, onAbrirCliente }: { api: WhatsAppApi; contato: ContatoWpp; onAbrirCliente?: (userId: string) => void }) {
  const [d, setD] = useState<FichaDoContato | null | undefined>(undefined)
  const [conta, setConta] = useState<'real' | 'demo'>('real')
  const [verFaltam, setVerFaltam] = useState(false)
  const [fotoFalhou, setFotoFalhou] = useState(false)
  useEffect(() => {
    let vivo = true
    setD(undefined); setFotoFalhou(false)
    const ler = () => api.fichaCompleta?.(contato.id).then((x) => vivo && setD(x)).catch(() => vivo && setD(null))
    void ler()
    // os números andam (I.A. operando, saldo): relê a cada 45 s com a ficha aberta
    const t = setInterval(() => { if (!document.hidden) void ler() }, 45_000)
    return () => { vivo = false; clearInterval(t) }
  }, [api, contato.id, contato.userId])

  const f = d?.ficha ?? null
  const nome = f?.pessoa.nome || contato.nome || contato.waId
  const foto = !fotoFalhou ? (d?.fotoWhatsapp || f?.pessoa.fotoPlataforma || null) : (f?.pessoa.fotoPlataforma || null)
  const plano = f?.pessoa.subplano ?? 'gold'
  const lado: LadoDoResultado | null = f ? f.resultado[conta] : null
  const taxa = lado && lado.ganhas + lado.perdidas > 0 ? Math.round((lado.ganhas / (lado.ganhas + lado.perdidas)) * 100) : null
  const favorita = f?.resultado.porIa[0]?.nome ?? null
  const maxIa = useMemo(() => Math.max(1, ...(f?.resultado.porIa ?? []).map((x) => Math.abs(x[conta]))), [f, conta])
  useEffect(() => { if (f && f.resultado.real.operacoes === 0 && f.resultado.demo.operacoes > 0) setConta('demo') }, [f?.pessoa.userId]) // eslint-disable-line react-hooks/exhaustive-deps

  const hero = <section className={`fc-heroi plano-${plano}`}>
    {foto && <div className="fc-heroi-fundo" style={{ backgroundImage: `url("${foto}")` }} aria-hidden />}
    <div className="fc-heroi-brilho" aria-hidden />
    <div className="fc-avatar">
      {foto ? <img src={foto} alt="" onError={() => setFotoFalhou(true)} /> : <span>{iniciais(nome) || '?'}</span>}
      {f?.pessoa.online && <i className="fc-online" title="Na plataforma agora" />}
    </div>
    <h3>{nome}</h3>
    <p className="fc-tel">{contato.waId.replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '+55 ($1) $2-$3')}</p>
    {f && <div className="fc-selos">
      <span className={`fc-plano ${plano}`}>GF Member {PLANO[plano] ?? plano}</span>
      {f.pessoa.parceiroNome && <span className="fc-selo">via {f.pessoa.parceiroNome}</span>}
      <span className="fc-selo">{f.pessoa.online ? '● Online agora' : `Visto ${haQuanto(f.pessoa.vistoEm)}`}</span>
    </div>}
    {f && <p className="fc-desde">Cliente desde <b>{data(f.pessoa.criadoEm)}</b> · {diasDesde(f.pessoa.criadoEm)} dias{f.pessoa.cidade ? ` · ${f.pessoa.cidade}${f.pessoa.uf ? `/${f.pessoa.uf}` : ''}` : ''}</p>}
  </section>

  if (d === undefined) return <div className="fc">{hero}<div className="fc-carregando"><i /><i /><i /></div></div>
  if (!f) return <div className="fc">
    {hero}
    <section className="fc-bloco fc-sem-dono">
      <b>Número não confirmado</b>
      <p>Este WhatsApp ainda não foi confirmado em <i>Meu perfil</i>, então o Assessor não sabe de quem é a conta e não mexe em nada.</p>
      {d && d.talvez.length > 0 && <><span className="fc-rot">Pelo telefone do cadastro, pode ser</span>
        <ul className="fc-talvez">{d.talvez.map((t, i) => <li key={i}><b>{t.nome ?? 'Sem nome'}</b><small>{t.email}</small></li>)}</ul></>}
    </section>
  </div>

  const r = f.resultado, din = f.dinheiro
  const liquido = din.depositos - din.saques
  return <div className="fc">
    {hero}

    <div className="fc-acoes">
      <button onClick={() => void navigator.clipboard?.writeText(contato.waId)}>Copiar número</button>
      {f.pessoa.email && <button onClick={() => void navigator.clipboard?.writeText(f.pessoa.email!)}>Copiar e-mail</button>}
      {onAbrirCliente && <button className="ouro" onClick={() => onAbrirCliente(f.pessoa.userId)}>Ficha no ADM</button>}
    </div>

    {f.agora.length > 0 && <section className="fc-agora">
      <span className="fc-pulso" aria-hidden />
      <div><span className="fc-rot">Operando agora</span>
        {f.agora.map((a, i) => <p key={i}><b>{a.ia}</b> · {a.demo ? 'demo' : 'real'} · <em className={tom(a.resultado)}>{usd(a.resultado, true)}</em> em {a.operacoes} op. <small>desde {dataHora(a.desde)}</small></p>)}
      </div>
    </section>}

    <section className="fc-kpis">
      <div className="fc-kpi destaque"><span>Saldo real</span><b>{usd(din.saldoReal)}</b><small>{din.contaReal ?? 'sem conta real'}{din.saldoLidoEm ? ` · lido ${haQuanto(din.saldoLidoEm)}` : ''}</small></div>
      <div className="fc-kpi"><span>Resultado real</span><b className={tom(r.real.total)}>{usd(r.real.total, true)}</b><small>demo {usd(r.demo.total, true)}</small></div>
      <div className="fc-kpi ouro"><span>Markup gerado</span><b>{usd(din.markupReal)}</b><small>este mês {usd(din.markupMes)}</small></div>
      <div className="fc-kpi"><span>Depósitos</span><b>{usd(din.depositos)}</b><small>{din.qtdDepositos}× · saques {usd(din.saques)} · líquido {usd(liquido, true)}</small></div>
    </section>

    <section className="fc-bloco">
      <header className="fc-cab"><span className="fc-rot">Últimos 30 dias</span>
        <div className="fc-alterna" role="tablist">{(['real', 'demo'] as const).map((c) => <button key={c} role="tab" aria-selected={conta === c} className={conta === c ? 'on' : ''} onClick={() => setConta(c)}>{c === 'real' ? 'Real' : 'Demo'}</button>)}</div>
      </header>
      <Barras dias={r.dias30} conta={conta} />
    </section>

    {lado && <section className="fc-bloco">
      <span className="fc-rot">Desempenho na {conta === 'real' ? 'conta real' : 'demo'} · desde o começo</span>
      <div className="fc-desempenho">
        <Anel parte={lado.ganhas} total={lado.ganhas + lado.perdidas} valor={taxa === null ? '—' : `${taxa}%`} rotulo="de acerto" cor="var(--fc-verde)" />
        <dl>
          <div><dt>Operações</dt><dd>{lado.operacoes.toLocaleString('pt-BR')}</dd></div>
          <div><dt>Sessões de I.A.</dt><dd>{lado.sessoes}</dd></div>
          <div><dt>I.A. / Manual</dt><dd><span className={tom(lado.ia)}>{usd(lado.ia, true)}</span> · <span className={tom(lado.manual)}>{usd(lado.manual, true)}</span></dd></div>
          {favorita && <div><dt>I.A. favorita</dt><dd>{favorita}</dd></div>}
        </dl>
      </div>
      {r.porIa.length > 0 && <ul className="fc-ias">{r.porIa.slice(0, 5).map((x) => <li key={x.nome}>
        <span>{x.nome.replace(/^GF /, '')}</span>
        <i><em className={tom(x[conta])} style={{ width: `${Math.max(3, (Math.abs(x[conta]) / maxIa) * 100)}%` }} /></i>
        <b className={tom(x[conta])}>{usd(x[conta], true)}</b>
      </li>)}</ul>}
      <p className="fc-nota">Primeira operação {data(r.primeiraOperacao)} · última {haQuanto(r.ultimaOperacao)}</p>
    </section>}

    <section className="fc-bloco">
      <span className="fc-rot">Engajamento</span>
      <div className="fc-aneis">
        <Anel parte={f.aulas.concluidas} total={f.aulas.total} valor={`${f.aulas.concluidas}/${f.aulas.total}`} rotulo="aulas concluídas" cor="var(--fc-ouro)" />
        <Anel parte={f.lives.plataforma + f.lives.externasOnline} total={f.lives.plataformaTotal + f.lives.externasTotal} valor={String(f.lives.plataforma + f.lives.externasOnline)} rotulo="lives" cor="#7C6CF2" />
        <Anel parte={f.acessos.ultimos7} total={7} valor={`${f.acessos.ultimos7}/7`} rotulo="dias na semana" cor="var(--fc-verde)" />
      </div>
      <dl className="fc-lista">
        <div><dt>Aulas</dt><dd>{f.aulas.vistas} de {f.aulas.total} abertas · {f.aulas.minutos} min assistidos{f.aulas.ultimaTitulo ? ` · última: "${f.aulas.ultimaTitulo}" ${haQuanto(f.aulas.ultima)}` : ''}</dd></div>
        <div><dt>Lives</dt><dd>{f.lives.plataforma} de {f.lives.plataformaTotal} na plataforma{f.lives.minutos ? ` (${f.lives.minutos} min)` : ''} · online em {f.lives.externasOnline} de {f.lives.externasTotal} lives de fora</dd></div>
        <div><dt>Acessos</dt><dd>{f.acessos.total.toLocaleString('pt-BR')} entradas · {f.acessos.diasAtivos} dias ativos · {f.acessos.horas.toLocaleString('pt-BR')} h na plataforma{f.acessos.dispositivo ? ` · mais no ${f.acessos.dispositivo}` : ''}</dd></div>
        <div><dt>Assessor</dt><dd>{f.assessor.mensagens} mensagens · {f.assessor.iasLigadas} I.A. ligadas por conversa</dd></div>
        <div><dt>Suporte</dt><dd>{f.suporte.conversas ? `${f.suporte.conversas} atendimento${f.suporte.conversas > 1 ? 's' : ''}${f.suporte.abertas ? ` · ${f.suporte.abertas} aberto${f.suporte.abertas > 1 ? 's' : ''}` : ''}` : 'Nunca abriu atendimento'}</dd></div>
      </dl>
      {f.aulas.faltam.length > 0 && <button className="fc-link" onClick={() => setVerFaltam((v) => !v)}>{verFaltam ? 'Esconder' : `Ver as ${f.aulas.faltam.length} aulas que faltam concluir`}</button>}
      {verFaltam && <ol className="fc-faltam">{f.aulas.faltam.map((t) => <li key={t}>{t}</li>)}</ol>}
    </section>

    <section className="fc-bloco">
      <span className="fc-rot">Compras e produtos</span>
      {f.compras.length === 0 && f.produtos.length === 0
        ? <p className="fc-vazio">Nenhuma compra nem upgrade. Está no GF Member {PLANO[plano] ?? plano}{plano === 'gold' ? ', o plano de entrada' : ''}.</p>
        : <ul className="fc-compras">
          {f.compras.map((c, i) => <li key={`c${i}`}><Icone d={ICONE.compra} /><span><b>{c.produto}</b><small>{c.origem} · {data(c.quando)}{c.situacao ? ` · ${c.situacao}` : ''}</small></span><em>{brl(c.valor)}</em></li>)}
          {f.produtos.map((p, i) => <li key={`p${i}`} className={p.ativo ? '' : 'inativo'}><Icone d={ICONE.compra} /><span><b>{p.nome}</b><small>{p.ativo ? 'ativo' : 'encerrado'} · desde {data(p.desde)}{p.ate ? ` até ${data(p.ate)}` : ''}{p.origem ? ` · ${p.origem}` : ''}</small></span></li>)}
        </ul>}
      {f.faturas.length > 0 && <ul className="fc-compras">{f.faturas.map((x) => <li key={x.mes}><Icone d={ICONE.deposito} /><span><b>Compartilhamento {x.mes}</b><small>{x.situacao}</small></span><em>{brl(x.valor)}</em></li>)}</ul>}
    </section>

    <section className="fc-bloco">
      <span className="fc-rot">Linha do tempo</span>
      <ol className="fc-tempo">{f.linhaDoTempo.map((e, i) => <li key={i} className={e.tipo}><span className="fc-tempo-icone"><Icone d={ICONE[e.tipo] ?? ICONE.acesso} /></span><div><b>{e.texto}</b><small>{dataHora(e.quando)} · {haQuanto(e.quando)}</small></div></li>)}</ol>
    </section>

    <section className="fc-bloco fc-dados">
      <span className="fc-rot">Cadastro</span>
      <dl className="fc-lista">
        {f.pessoa.email && <div><dt>E-mail</dt><dd>{f.pessoa.email}</dd></div>}
        {f.pessoa.telefone && <div><dt>Telefone</dt><dd>{f.pessoa.telefone}</dd></div>}
        {f.pessoa.nascimento && <div><dt>Nascimento</dt><dd>{data(f.pessoa.nascimento)}</dd></div>}
        <div><dt>Acesso</dt><dd>{(f.pessoa.status ?? '—').replace(/^./, (x) => x.toUpperCase())}{f.pessoa.validade ? ` · até ${data(f.pessoa.validade)}` : ''}</dd></div>
        {din.contaDemo && <div><dt>Conta demo</dt><dd>{din.contaDemo} · {usd(din.saldoDemo)}</dd></div>}
        <div><dt>WhatsApp</dt><dd>{f.pessoa.whatsappConfirmadoEm ? `Confirmado ${data(f.pessoa.whatsappConfirmadoEm)}` : 'Não confirmado'}</dd></div>
      </dl>
    </section>
  </div>
}
