import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import './acessos-ao-vivo.css'
import { SeloDoParceiro } from '../parceiros/SeloDoParceiro'

/**
 * Acessos ao vivo (10/11/2026, Tiago: "qtd de pessoas acessando nos últimos minutos, visitas
 * recentes, onlines atuais, detalhes").
 *
 * Uma leitura no banco (`teeds_acessos_ao_vivo`, no escopo de cada admin: o do parceiro só recebe
 * os clientes dele; administradores não contam) a cada 30 s com a aba visível. Três listas:
 *  - Online agora: quem deu sinal nos últimos 3 min (a presença grava a cada minuto com o app aberto);
 *  - Últimos acessos: uma linha por pessoa, do último acesso para trás, na janela escolhida;
 *  - Visitas: cada abertura do app (início, duração, aparelho), gravada por `teeds_registrar_visita`
 *    a partir de 10/11/2026 — antes disso só existe o último acesso de cada um.
 * Clicar em qualquer pessoa abre a ficha.
 */

interface Pessoa {
  user_id: string; nome: string | null; email: string | null; parceiro: string | null
  plano_id: string | null; plano: string | null; criado_em: string | null; visto_em: string
  total_acessos: number | null; tempo_total_segundos: number | null; cidade: string | null; regiao: string | null
  dispositivo: string | null; segundos_hoje: number; acessos_hoje: number
  visita_inicio?: string | null; visita_segundos?: number | null
}
interface Visita {
  sessao: string; user_id: string; nome: string | null; email: string | null; parceiro: string | null
  plano: string | null; criado_em: string | null; inicio: string; visto_em: string; segundos: number
  dispositivo: string | null; primeira: boolean
}
interface Painel {
  agora: string; parceiro: string | null
  online: number; m15: number; h1: number; h24: number
  hoje_pessoas: number; hoje_acessos: number; hoje_segundos: number; novos_hoje: number
  visitas_desde: string | null
  lista_online: Pessoa[]; recentes: Pessoa[]; visitas: Visita[]
  horas: Array<{ dia: string; hora: number; acessos: number }> | null
}

type Aba = 'online' | 'recentes' | 'visitas'
type Janela = 0.25 | 1 | 6 | 24 | 168
type Aparelho = 'todos' | 'celular' | 'computador' | 'tablet'
const JANELAS: Array<[Janela, string]> = [[0.25, '15 min'], [1, '1 hora'], [6, '6 horas'], [24, '24 horas'], [168, '7 dias']]
const ONLINE_MS = 3 * 60_000

async function lerPainel(sessao: SessaoTeeds, marca: string, parceiro: string | null, horas: number): Promise<Painel> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_acessos_ao_vivo`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_parceiro: parceiro || null, p_horas: Math.max(1, Math.ceil(horas)) }),
  })
  if (!r.ok) throw new Error('Não foi possível ler os acessos agora.')
  return await r.json()
}

const inteiro = (n: number) => n.toLocaleString('pt-BR')
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
function tempo(segundos: number | null | undefined): string {
  const s = Math.max(0, Math.round(segundos ?? 0))
  if (s < 60) return s ? 'menos de 1 min' : '—'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  return `${h} h ${String(m % 60).padStart(2, '0')}`
}
function haQuanto(iso: string | null | undefined, agora: number): string {
  if (!iso) return '—'
  const s = Math.max(0, Math.round((agora - Date.parse(iso)) / 1000))
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`
  const d = Math.floor(s / 86400)
  return `há ${d} ${d === 1 ? 'dia' : 'dias'}`
}
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const data = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' }) : '—'
const ehNovo = (criado: string | null, agora: number) => !!criado && agora - Date.parse(criado) < 86_400_000
const rotuloAparelho = (d: string | null) => d === 'celular' ? 'Celular' : d === 'computador' ? 'Computador' : d === 'tablet' ? 'Tablet' : '—'
/** O dia conta da meia-noite: quem entrou ontem e seguiu usando tem tempo hoje sem acesso novo. */
const hojeTexto = (x: { acessos_hoje: number; segundos_hoje: number }) => x.acessos_hoje
  ? `${x.acessos_hoje} ${x.acessos_hoje === 1 ? 'acesso' : 'acessos'} hoje`
  : x.segundos_hoje ? 'seguiu desde ontem' : 'não entrou hoje'
const seloParceiro = (p: string | null) => p ? `/${p}` : 'Direto'

function Aparelho({ d }: { d: string | null }) {
  return <span className="aov-aparelho">
    <svg viewBox="0 0 24 24" aria-hidden>{d === 'celular'
      ? <><rect x="7" y="3" width="10" height="18" rx="2.2" /><path d="M11 18h2" /></>
      : d === 'tablet' ? <><rect x="5" y="3" width="14" height="18" rx="2.2" /><path d="M11 18h2" /></>
      : <><rect x="3" y="5" width="18" height="11" rx="1.6" /><path d="M8 20h8M12 16v4" /></>}</svg>
    {rotuloAparelho(d)}
  </span>
}

function Quem({ p, agora, abrir }: { p: { user_id: string; nome: string | null; email: string | null; parceiro: string | null; criado_em: string | null; visto_em?: string }; agora: number; abrir?: (id: string) => void }) {
  const online = !!p.visto_em && agora - Date.parse(p.visto_em) < ONLINE_MS
  return <button type="button" className="aov-quem" onClick={() => abrir?.(p.user_id)} disabled={!abrir} title="Abrir a ficha do cliente">
    <i className={online ? 'on' : ''}>{(p.nome || p.email || '?')[0].toUpperCase()}</i>
    <b><span className="aov-nome"><span>{p.nome || 'Sem nome'}</span>{ehNovo(p.criado_em, agora) && <em className="aov-novo">Novo</em>}<SeloDoParceiro codigo={p.parceiro} /></span>
      <small>{p.email ?? 'sem e-mail'}</small></b>
  </button>
}

export function AcessosAoVivo({ sessao, marca, parceiro, pedido = 0, onAbrirCliente }: {
  /** Sobe quando o Atualizar do topo do Admin é clicado: relê na hora. */
  sessao: SessaoTeeds; marca: string; parceiro: string | null; pedido?: number; onAbrirCliente?: (userId: string) => void
}) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [lidoEm, setLidoEm] = useState(0)
  const [agora, setAgora] = useState(Date.now())
  const [aba, setAba] = useState<Aba>('online')
  const [janela, setJanela] = useState<Janela>(24)
  const [busca, setBusca] = useState('')
  const [aparelho, setAparelho] = useState<Aparelho>('todos')
  const [soNovos, setSoNovos] = useState(false)
  const [ordem, setOrdem] = useState<'recente' | 'tempo' | 'acessos'>('recente')

  const ler = useCallback(async () => {
    setCarregando(true)
    try { setPainel(await lerPainel(sessao, marca, parceiro, Math.max(1, janela))); setErro(null); setLidoEm(Date.now()) }
    catch (e) { setErro((e as Error).message) }
    finally { setCarregando(false) }
  }, [sessao.token, marca, parceiro, janela]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void ler()
    const t = window.setInterval(() => { if (!document.hidden) void ler() }, 30_000)
    return () => window.clearInterval(t)
  }, [ler])
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 15_000); return () => window.clearInterval(t) }, [])
  useEffect(() => { if (pedido) void ler() }, [pedido]) // eslint-disable-line react-hooks/exhaustive-deps

  const corte = agora - janela * 3_600_000
  const filtrar = <T extends { nome: string | null; email: string | null; dispositivo: string | null; criado_em: string | null }>(l: T[]) => {
    const q = semAcento(busca.trim())
    return l.filter((p) => (!q || semAcento(`${p.nome ?? ''} ${p.email ?? ''}`).includes(q))
      && (aparelho === 'todos' || p.dispositivo === aparelho)
      && (!soNovos || ehNovo(p.criado_em, agora)))
  }
  const online = useMemo(() => {
    const l = filtrar(painel?.lista_online ?? [])
    return ordem === 'tempo' ? [...l].sort((a, b) => (b.visita_segundos ?? 0) - (a.visita_segundos ?? 0))
      : ordem === 'acessos' ? [...l].sort((a, b) => (b.total_acessos ?? 0) - (a.total_acessos ?? 0)) : l
  }, [painel, busca, aparelho, soNovos, ordem, agora]) // eslint-disable-line react-hooks/exhaustive-deps
  const recentes = useMemo(() => {
    const l = filtrar((painel?.recentes ?? []).filter((p) => Date.parse(p.visto_em) >= corte))
    return ordem === 'tempo' ? [...l].sort((a, b) => b.segundos_hoje - a.segundos_hoje)
      : ordem === 'acessos' ? [...l].sort((a, b) => (b.total_acessos ?? 0) - (a.total_acessos ?? 0)) : l
  }, [painel, busca, aparelho, soNovos, ordem, corte]) // eslint-disable-line react-hooks/exhaustive-deps
  const visitas = useMemo(() => {
    const l = filtrar((painel?.visitas ?? []).filter((v) => Date.parse(v.visto_em) >= corte))
    return ordem === 'tempo' ? [...l].sort((a, b) => b.segundos - a.segundos) : l
  }, [painel, busca, aparelho, soNovos, ordem, corte]) // eslint-disable-line react-hooks/exhaustive-deps

  const barras = useMemo(() => {
    if (!painel?.horas) return null
    const hoje = new Date(Date.parse(painel.agora)).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const h = Array.from({ length: 24 }, (_, i) => ({ hora: i, hoje: 0, ontem: 0 }))
    for (const x of painel.horas) { const alvo = h[x.hora]; if (!alvo) continue; if (x.dia === hoje) alvo.hoje += x.acessos; else alvo.ontem += x.acessos }
    const max = Math.max(1, ...h.map((x) => Math.max(x.hoje, x.ontem)))
    const agoraH = Number(new Date(Date.parse(painel.agora)).toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }))
    return { h, max, agoraH, totalHoje: h.reduce((s, x) => s + x.hoje, 0), ontemAteAgora: h.filter((x) => x.hora <= agoraH).reduce((s, x) => s + x.ontem, 0) }
  }, [painel])

  const filtrando = busca.trim() !== '' || aparelho !== 'todos' || soNovos
  const limpar = () => { setBusca(''); setAparelho('todos'); setSoNovos(false) }
  const abrirRecentes = (j: Janela) => { setJanela(j); setAba('recentes') }
  const p = painel
  const media = p && p.hoje_pessoas ? p.hoje_segundos / p.hoje_pessoas : 0
  const segDesdeLeitura = lidoEm ? Math.max(0, Math.round((agora - lidoEm) / 1000)) : 0

  return <div className="aov">
    <div className="aov-status">
      <span className={`aov-vivo ${erro ? 'erro' : ''}`}><i />{erro ? 'Sem conexão com o banco' : 'Ao vivo'}</span>
      <span>{carregando && !p ? 'Lendo os acessos…' : lidoEm ? `Atualiza sozinho a cada 30 s · lido ${segDesdeLeitura < 20 ? 'agora' : `há ${segDesdeLeitura} s`}` : ''}</span>
    </div>

    <div className="aov-kpis">
      <button className={`aov-kpi destaque ${aba === 'online' ? 'on' : ''}`} onClick={() => setAba('online')}>
        <span><i className="aov-pulso" />Online agora</span><strong>{p ? inteiro(p.online) : '—'}</strong><small>com o app aberto nos últimos 3 min</small></button>
      <button className="aov-kpi" onClick={() => abrirRecentes(0.25)}><span>Últimos 15 min</span><strong>{p ? inteiro(p.m15) : '—'}</strong><small>pessoas que entraram ou seguem usando</small></button>
      <button className="aov-kpi" onClick={() => abrirRecentes(1)}><span>Última hora</span><strong>{p ? inteiro(p.h1) : '—'}</strong><small>pessoas</small></button>
      <button className="aov-kpi" onClick={() => abrirRecentes(24)}><span>Últimas 24 horas</span><strong>{p ? inteiro(p.h24) : '—'}</strong><small>pessoas</small></button>
      <article className="aov-kpi"><span>Hoje (desde 00h)</span><strong>{p ? inteiro(p.hoje_pessoas) : '—'}</strong><small>{p ? `${inteiro(p.hoje_acessos)} ${p.hoje_acessos === 1 ? 'acesso' : 'acessos'} · ${inteiro(p.novos_hoje)} ${p.novos_hoje === 1 ? 'cadastro novo' : 'cadastros novos'}` : ''}</small></article>
      <article className="aov-kpi"><span>Tempo médio hoje</span><strong>{p ? tempo(media) : '—'}</strong><small>por pessoa{p ? ` · ${tempo(p.hoje_segundos)} somados` : ''}</small></article>
    </div>

    {barras && <section className="admin-card full aov-horas">
      <header><div><span className="rot">Entradas por hora · horário de Brasília</span><h3>Hoje {inteiro(barras.totalHoje)} {barras.totalHoje === 1 ? 'entrada' : 'entradas'}<small className="aov-ontem">ontem até esta hora: {inteiro(barras.ontemAteAgora)}</small></h3></div>
        <div className="aov-legenda"><span className="hoje">Hoje</span><span className="ontem">Ontem</span></div></header>
      <div className="aov-barras" role="img" aria-label={`Entradas por hora: hoje ${barras.totalHoje}, ontem até esta hora ${barras.ontemAteAgora}`}>
        {barras.h.map((x) => <div key={x.hora} className={x.hora === barras.agoraH ? 'agora' : x.hora > barras.agoraH ? 'futuro' : ''} title={`${String(x.hora).padStart(2, '0')}h · hoje ${x.hoje} · ontem ${x.ontem}`}>
          <span className="pilha"><i className="ontem" style={{ height: `${x.ontem / barras.max * 100}%` }} /><i className="hoje" style={{ height: `${x.hoje / barras.max * 100}%` }} /></span>
          <small>{x.hora % 3 === 0 ? `${String(x.hora).padStart(2, '0')}h` : ''}</small>
        </div>)}
      </div>
    </section>}

    <section className="admin-card full aov-card">
      <header>
        <div><span className="rot">{aba === 'online' ? 'Agora' : aba === 'recentes' ? `Últimos ${JANELAS.find(([j]) => j === janela)?.[1]}` : `Visitas · últimos ${JANELAS.find(([j]) => j === janela)?.[1]}`}{p?.parceiro ? ` · só clientes ${seloParceiro(p.parceiro === 'direto' ? null : p.parceiro)}` : ''}</span>
          <h3>{aba === 'online' ? 'Quem está na plataforma agora' : aba === 'recentes' ? 'Quem acessou, do mais recente para trás' : 'Cada visita: quando entrou, quanto ficou'}</h3></div>
        <div className="rc-periodo aov-abas" role="tablist">
          {([['online', `Online agora${p ? ` (${p.online})` : ''}`], ['recentes', 'Últimos acessos'], ['visitas', 'Visitas']] as [Aba, string][]).map(([a, r]) =>
            <button key={a} role="tab" aria-selected={aba === a} className={aba === a ? 'on' : ''} onClick={() => setAba(a)}>{r}</button>)}
        </div>
      </header>

      <div className="aov-filtros">
        <label className="aov-busca"><svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input placeholder="Buscar cliente: nome ou e-mail" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        {aba !== 'online' && <div className="rc-periodo aov-janela">{JANELAS.map(([j, r]) => <button key={j} className={janela === j ? 'on' : ''} onClick={() => setJanela(j)}>{r}</button>)}</div>}
        <label className="aov-select"><span>Aparelho</span><select value={aparelho} onChange={(e) => setAparelho(e.target.value as Aparelho)}>
          <option value="todos">Todos</option><option value="celular">Celular</option><option value="computador">Computador</option><option value="tablet">Tablet</option></select></label>
        <label className="aov-select"><span>Ordem</span><select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}>
          <option value="recente">Mais recentes</option><option value="tempo">{aba === 'recentes' ? 'Mais tempo hoje' : 'Mais tempo nesta visita'}</option>{aba !== 'visitas' && <option value="acessos">Mais acessos no total</option>}</select></label>
        <button className={`aov-chip ${soNovos ? 'on' : ''}`} onClick={() => setSoNovos((v) => !v)} aria-pressed={soNovos}>Só cadastros novos (24 h)</button>
        {filtrando && <button className="aov-limpar" onClick={limpar}>Limpar filtros</button>}
      </div>

      {erro && !p && <div className="adm-vazio">{erro} Clique em Atualizar para tentar de novo.</div>}

      {aba === 'online' && p && (online.length ? <div className="rc-tabela aov-tab aov-online">
        <div className="cab"><span>Cliente</span><span>Nesta visita</span><span>Aparelho</span><span>Hoje</span><span>No total</span><span>Plano</span></div>
        {online.map((x) => <div key={x.user_id}>
          <span><Quem p={x} agora={agora} abrir={onAbrirCliente} /></span>
          <span><b>{x.visita_segundos != null ? tempo(x.visita_segundos) : '—'}</b><small>{x.visita_inicio ? `entrou às ${hora(x.visita_inicio)}` : `sinal ${haQuanto(x.visto_em, agora)}`}</small></span>
          <span><Aparelho d={x.dispositivo} /></span>
          <span>{tempo(x.segundos_hoje)}<small>{hojeTexto(x)}</small></span>
          <span className="aov-m-esconde">{inteiro(x.total_acessos ?? 0)} {(x.total_acessos ?? 0) === 1 ? 'acesso' : 'acessos'}<small>{tempo(x.tempo_total_segundos)} de uso</small></span>
          <span className="aov-m-esconde">{x.plano ?? x.plano_id ?? '—'}<small>desde {data(x.criado_em)}</small></span>
        </div>)}
      </div> : <div className="adm-vazio">{filtrando ? 'Ninguém online com esses filtros.' : 'Ninguém com o app aberto neste momento.'}</div>)}

      {aba === 'recentes' && p && (recentes.length ? <div className="rc-tabela aov-tab aov-recentes">
        <div className="cab"><span>Cliente</span><span>Último acesso</span><span>Hoje</span><span>No total</span><span>Aparelho hoje</span><span>Cadastro</span></div>
        {recentes.slice(0, 600).map((x) => <div key={x.user_id}>
          <span><Quem p={x} agora={agora} abrir={onAbrirCliente} /></span>
          <span><b>{haQuanto(x.visto_em, agora)}</b><small>{dataHora(x.visto_em)}</small></span>
          <span>{x.acessos_hoje || x.segundos_hoje ? tempo(x.segundos_hoje) : '—'}<small>{hojeTexto(x)}</small></span>
          <span className="aov-m-esconde">{inteiro(x.total_acessos ?? 0)} {(x.total_acessos ?? 0) === 1 ? 'acesso' : 'acessos'}<small>{tempo(x.tempo_total_segundos)} de uso</small></span>
          <span><Aparelho d={x.dispositivo} /></span>
          <span className="aov-m-esconde">{data(x.criado_em)}<small>{x.plano ?? x.plano_id ?? ''}</small></span>
        </div>)}
        {recentes.length > 600 && <div className="adm-vazio">Mostrando 600 de {inteiro(recentes.length)}. Use a busca ou uma janela menor.</div>}
      </div> : <div className="adm-vazio">{filtrando ? 'Ninguém nessa janela com esses filtros.' : 'Ninguém acessou nessa janela.'}</div>)}

      {aba === 'visitas' && p && <>
        <p className="aov-nota">Cada vez que alguém abre o app conta uma visita. O registro visita a visita começou {p.visitas_desde ? `em ${dataHora(p.visitas_desde)}` : 'agora'}; antes disso só existe o último acesso de cada pessoa (aba Últimos acessos).</p>
        {visitas.length ? <div className="rc-tabela aov-tab aov-visitas">
          <div className="cab"><span>Cliente</span><span>Entrou</span><span>Ficou</span><span>Situação</span><span>Aparelho</span></div>
          {visitas.slice(0, 600).map((v) => {
            const noAr = agora - Date.parse(v.visto_em) < ONLINE_MS
            return <div key={v.sessao}>
              <span><Quem p={v} agora={agora} abrir={onAbrirCliente} /></span>
              <span><b>{hora(v.inicio)}</b><small>{data(v.inicio)}{v.primeira ? ' · 1ª visita' : ''}</small></span>
              <span><b>{tempo(v.segundos)}</b></span>
              <span>{noAr ? <em className="aov-no-ar">No app agora</em> : <>Saiu às {hora(v.visto_em)}<small>{haQuanto(v.visto_em, agora)}</small></>}</span>
              <span><Aparelho d={v.dispositivo} /></span>
            </div>
          })}
          {visitas.length > 600 && <div className="adm-vazio">Mostrando 600 de {inteiro(visitas.length)}.</div>}
        </div> : <div className="adm-vazio">{filtrando ? 'Nenhuma visita com esses filtros.' : 'Nenhuma visita registrada nessa janela ainda.'}</div>}
      </>}
    </section>
  </div>
}
