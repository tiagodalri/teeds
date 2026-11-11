/**
 * As metas da Visão geral (11/11/2026, Tiago: "quero que tenha algumas metas configuráveis... meta de depósito
 * e meta de markup somente. E aí eu consigo configurar a meta e ver o avanço e quanto falta pra bater, numa
 * animação bem top!").
 *
 * Ele escolheu: metas do dia, da semana (segunda a domingo) e do mês, sempre no horário de Brasília; uma geral
 * (filtro "Todos") e, se quiser, uma própria de cada parceiro, que aparece quando o topo filtra por ele.
 *
 * O banco só guarda o valor da meta (painel_metas). O quanto já foi feito vem da mesma leitura dos blocos de
 * período (teeds_painel_periodo): o markup da contagem única e os depósitos das contas reais. Nada de conta nova.
 *
 * O cartão mostra o anel que enche, o número que conta, quanto falta, onde deveria estar agora (a marquinha no
 * anel) e para onde o ritmo leva até o fim do período. Quando a meta é batida, o anel brilha e solta confete.
 */
import { useEffect, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import { dinheiro } from '../../core/dinheiro'
import { diaDeBrasilia, instanteEmBrasilia, somarDias, ddmm, lerPeriodo, type AtalhoDoPeriodo, type PainelPeriodo } from './PeriodoDaVisaoGeral'
import './metas-visao-geral.css'

export type Horizonte = 'dia' | 'semana' | 'mes'
interface Meta { deposito: number | null; markup: number | null; atualizado_em?: string }
type Metas = Partial<Record<Horizonte, Meta>>

async function rpc<T>(sessao: SessaoTeeds, nome: string, corpo: object, erro: string): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) throw new Error(erro)
  return r.json()
}
const lerMetas = (s: SessaoTeeds, marca: string, parceiro: string) =>
  rpc<{ parceiro: string; metas: Metas }>(s, 'teeds_metas_painel', { p_marca: marca, p_parceiro: parceiro || null }, 'Não foi possível ler as metas agora.')
const salvarMeta = (s: SessaoTeeds, marca: string, parceiro: string, horizonte: Horizonte, deposito: number | null, markup: number | null) =>
  rpc<{ parceiro: string; metas: Metas }>(s, 'teeds_salvar_meta_painel',
    { p_marca: marca, p_parceiro: parceiro || null, p_horizonte: horizonte, p_deposito: deposito, p_markup: markup }, 'Não foi possível salvar a meta. Tente de novo.')

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const NOME: Record<Horizonte, string> = { dia: 'Dia', semana: 'Semana', mes: 'Mês' }

/** A janela do horizonte em Brasília: do começo até agora, e quando ele termina. */
export function janelaDaMeta(h: Horizonte, agora = Date.now()) {
  const hoje = diaDeBrasilia(agora)
  if (h === 'dia') {
    const de = instanteEmBrasilia(hoje)
    return { de, fim: instanteEmBrasilia(somarDias(hoje, 1)), rotulo: `Hoje, ${ddmm(hoje)}`, resta: 'até o fim do dia' }
  }
  if (h === 'semana') {
    const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay() // 0 = domingo
    const seg = somarDias(hoje, -((dow + 6) % 7)), dom = somarDias(seg, 6)
    return { de: instanteEmBrasilia(seg), fim: instanteEmBrasilia(somarDias(seg, 7)), rotulo: `Semana de ${ddmm(seg)} a ${ddmm(dom)}`, resta: 'até domingo' }
  }
  const ini = `${hoje.slice(0, 8)}01`
  const [a, m] = [Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7))]
  const prox = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`
  return { de: instanteEmBrasilia(ini), fim: instanteEmBrasilia(prox), rotulo: MESES[m - 1], resta: 'até o fim do mês' }
}

/** O horizonte que combina com o período escolhido no topo. */
export const horizonteDoPeriodo = (a: AtalhoDoPeriodo): Horizonte => (a === '7' ? 'semana' : a === '30' || a === 'mes' ? 'mes' : 'dia')

const usd = (v: number) => dinheiro(Number(v) || 0, 'USD')
/** "1.500,50" ou "1500.5" → 1500.5; vazio → null. */
function lerValor(t: string): number | null {
  const s = t.replace(/[^\d,.-]/g, '')
  if (!s) return null
  // vírgula = jeito brasileiro ("1.500,50"); só pontos em grupos de 3 = milhar ("1.200", "10.000"); senão, ponto decimal
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}
const paraCampo = (v: number | null | undefined) => (v ? v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '')

/** Um valor que sobe (ou desce) até o alvo, quadro a quadro, começando do zero na 1ª vez. */
function useAnimado(valor: number, dur = 1300) {
  const [mostrado, setMostrado] = useState(0)
  const de = useRef(0)
  useEffect(() => {
    const ini = de.current, fim = Number(valor) || 0
    if (ini === fim || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setMostrado(fim); de.current = fim; return }
    let quadro = 0
    const t0 = performance.now()
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3)
      const v = ini + (fim - ini) * e
      setMostrado(v); de.current = v
      if (k < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [valor, dur])
  return mostrado
}
/** O número que conta até o valor (o mesmo jeito do resto da Visão geral). */
function Contador({ valor, formato }: { valor: number; formato: (v: number) => string }) {
  return <>{formato(useAnimado(valor))}</>
}

const CONFETE = Array.from({ length: 22 }, (_, i) => ({
  ang: (i / 22) * 360 + (i % 3) * 7, dist: 70 + (i % 5) * 16, atraso: (i % 4) * 40, cor: i % 3,
}))

function Anel({ tipo, rotulo, feito, meta, frac, resta }: {
  tipo: 'deposito' | 'markup'; rotulo: string; feito: number; meta: number | null
  /** Quanto do período já passou (0 a 1): a marquinha de onde deveria estar agora. */
  frac: number; resta: string
}) {
  const pct = meta ? (feito / meta) * 100 : 0
  const batida = !!meta && feito >= meta
  // o anel começa vazio e enche (também a cada troca de período), quadro a quadro
  const cheio = useAnimado(Math.min(100, pct), 1600)
  // o confete sai uma vez quando a meta é batida (ao abrir já batida, ou ao bater com a tela aberta)
  const [festa, setFesta] = useState(0)
  const jaFesta = useRef(false)
  useEffect(() => {
    if (batida && !jaFesta.current) { jaFesta.current = true; const t = window.setTimeout(() => setFesta((n) => n + 1), 900); return () => window.clearTimeout(t) }
    if (!batida) jaFesta.current = false
  }, [batida])
  const C = 2 * Math.PI * 54
  const projecao = frac > 0.04 ? feito / frac : null
  const ang = frac * 360 - 90
  return (
    <div className={`vmt-meta ${tipo}${batida ? ' batida' : ''}${meta ? '' : ' sem-meta'}`}>
      <div className="vmt-anel" role="img" aria-label={meta ? `${rotulo}: ${Math.floor(pct)}% da meta` : `${rotulo}: sem meta`}>
        <svg viewBox="0 0 140 140" aria-hidden="true">
          <defs>
            <linearGradient id={`vmt-g-${tipo}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" className="g0" /><stop offset="100%" className="g1" />
            </linearGradient>
          </defs>
          <circle cx="70" cy="70" r="54" className="vmt-trilho" />
          <circle cx="70" cy="70" r="54" className="vmt-valor" stroke={`url(#vmt-g-${tipo})`}
            style={{ strokeDasharray: `${C}`, strokeDashoffset: `${C * (1 - cheio / 100)}` }} />
          {meta && !batida && frac > 0 && frac < 1 && (
            <circle className="vmt-agora" cx={70 + 54 * Math.cos((ang * Math.PI) / 180)} cy={70 + 54 * Math.sin((ang * Math.PI) / 180)} r="4.5" />
          )}
        </svg>
        <span className="vmt-centro">
          {meta ? <b><Contador valor={Math.min(pct, 999)} formato={(v) => `${Math.floor(v)}%${pct > 999 ? '+' : ''}`} /></b> : <b className="vmt-sem">—</b>}
          <small>{meta ? (batida ? 'meta batida' : 'da meta') : 'sem meta'}</small>
        </span>
        {batida && festa > 0 && (
          <span key={festa} className="vmt-confete" aria-hidden="true">
            {CONFETE.map((c, i) => (
              <i key={i} className={`c${c.cor}`} style={{ ['--ang' as string]: `${c.ang}deg`, ['--dist' as string]: `${c.dist}px`, animationDelay: `${c.atraso}ms` }} />
            ))}
          </span>
        )}
      </div>
      <div className="vmt-txt">
        <span className="vmt-rot">{rotulo}</span>
        <strong className="vmt-feito"><Contador valor={feito} formato={usd} /></strong>
        {meta ? <>
          <small>de <b>{usd(meta)}</b></small>
          {batida
            ? <p className="vmt-falta ok"><i aria-hidden="true">✦</i> Meta batida{feito > meta ? <> · <b>{usd(feito - meta)}</b> acima</> : null}</p>
            : <p className="vmt-falta">Faltam <b>{usd(meta - feito)}</b></p>}
          {!batida && projecao != null && (
            <small className={`vmt-ritmo ${projecao >= meta ? 'bom' : ''}`}>No ritmo de agora, fecha em <b>{usd(projecao)}</b> {resta}{projecao >= meta ? ': bate a meta' : ''}</small>
          )}
        </> : <small>Sem meta para este período</small>}
      </div>
    </div>
  )
}

export function MetasDaVisaoGeral({ sessao, marca, parceiro, nomeDoEscopo, atalho }: {
  sessao: SessaoTeeds
  marca: string
  /** O parceiro do topo ('' = todos, 'direto' = sem parceiro). */
  parceiro: string
  /** "Geral" ou "Naor /n": de quem é a meta mostrada. */
  nomeDoEscopo: string
  /** O período escolhido no topo: decide se abre na meta do dia, da semana ou do mês. */
  atalho: AtalhoDoPeriodo
}) {
  const [horizonte, setHorizonte] = useState<Horizonte>(horizonteDoPeriodo(atalho))
  useEffect(() => setHorizonte(horizonteDoPeriodo(atalho)), [atalho])
  const [metas, setMetas] = useState<Metas | null>(null)
  const [feito, setFeito] = useState<{ chave: string; dados: PainelPeriodo } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [campos, setCampos] = useState({ deposito: '', markup: '' })
  const [salvando, setSalvando] = useState(false)
  const [agora, setAgora] = useState(Date.now())
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const chave = `${marca}|${parceiro}|${horizonte}`

  useEffect(() => {
    let vivo = true
    setMetas(null); setEditando(false)
    lerMetas(sessaoRef.current, marca, parceiro).then((r) => { if (vivo) { setMetas(r.metas ?? {}); setErro(null) } })
      .catch((e) => { if (vivo) setErro((e as Error).message) })
    return () => { vivo = false }
  }, [marca, parceiro])

  // o quanto já foi feito no horizonte, relido a cada 15 s (como o resto da Visão geral)
  useEffect(() => {
    let vivo = true
    let t = 0
    const ler = () => {
      window.clearTimeout(t)
      const j = janelaDaMeta(horizonte)
      const ate = Date.now()
      void lerPeriodo(sessaoRef.current, marca, parceiro, j.de, ate)
        .then((d) => { if (vivo) { setFeito({ chave, dados: d }); setAgora(ate) } })
        .catch((e) => { if (vivo) setErro((e as Error).message) })
        .finally(() => { if (vivo) t = window.setTimeout(ler, document.visibilityState === 'hidden' ? 120_000 : 15_000) })
    }
    ler()
    return () => { vivo = false; window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const j = janelaDaMeta(horizonte, agora)
  const frac = Math.min(1, Math.max(0, (agora - j.de) / (j.fim - j.de)))
  const meta = metas?.[horizonte]
  const d = feito?.chave === chave ? feito.dados : null
  const dep = Number(d?.dinheiro.depositos ?? 0), mk = Number(d?.markup.total ?? 0)

  const abrir = () => { setCampos({ deposito: paraCampo(meta?.deposito), markup: paraCampo(meta?.markup) }); setEditando(true) }
  const salvar = async () => {
    setSalvando(true)
    try {
      const r = await salvarMeta(sessaoRef.current, marca, parceiro, horizonte, lerValor(campos.deposito), lerValor(campos.markup))
      setMetas(r.metas ?? {}); setEditando(false); setErro(null)
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  return (
    <section className={`vmt${d ? '' : ' vmt-lendo'}`} aria-label="Metas de depósitos e de markup">
      <header className="vmt-cab">
        <div className="vmt-titulo">
          <span className="vmt-sup">Metas · {nomeDoEscopo}</span>
          <h3>{j.rotulo}</h3>
        </div>
        <div className="vmt-acoes">
          <div className="vmt-abas" role="group" aria-label="Meta de qual período">
            {(Object.keys(NOME) as Horizonte[]).map((h) => (
              <button key={h} type="button" aria-pressed={horizonte === h} className={horizonte === h ? 'on' : ''} onClick={() => setHorizonte(h)}>{NOME[h]}</button>
            ))}
          </div>
          {!editando && (
            <button type="button" className="vmt-definir" onClick={abrir}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z M13.5 6.5l4 4" /></svg>
              {meta ? 'Editar meta' : 'Definir meta'}
            </button>
          )}
        </div>
      </header>

      {erro && <p className="vmt-erro" role="alert">{erro}</p>}

      {editando ? (
        <form className="vmt-form" onSubmit={(e) => { e.preventDefault(); void salvar() }}>
          <p className="vmt-form-txt">Meta {horizonte === 'dia' ? 'de cada dia' : horizonte === 'semana' ? 'de cada semana (segunda a domingo)' : 'de cada mês'} · vale para <b>{nomeDoEscopo === 'Geral' ? 'a plataforma toda (filtro Todos)' : nomeDoEscopo}</b>. Deixe em branco para ficar sem meta.</p>
          <div className="vmt-campos">
            <label><span>Meta de depósitos</span>
              <span className="vmt-entrada"><em>US$</em><input inputMode="decimal" autoComplete="off" placeholder="Ex.: 10.000" value={campos.deposito} onChange={(e) => setCampos({ ...campos, deposito: e.target.value })} /></span>
              <small>{NOME[horizonte] === 'Dia' ? 'Hoje' : 'Até agora'}: {usd(dep)}</small>
            </label>
            <label><span>Meta de markup</span>
              <span className="vmt-entrada"><em>US$</em><input inputMode="decimal" autoComplete="off" placeholder="Ex.: 500" value={campos.markup} onChange={(e) => setCampos({ ...campos, markup: e.target.value })} /></span>
              <small>{NOME[horizonte] === 'Dia' ? 'Hoje' : 'Até agora'}: {usd(mk)}</small>
            </label>
          </div>
          <div className="vmt-botoes">
            <button type="button" className="vmt-cancelar" onClick={() => setEditando(false)} disabled={salvando}>Cancelar</button>
            <button type="submit" className="vmt-salvar" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar meta'}</button>
          </div>
        </form>
      ) : metas === null ? (
        <div className="vmt-corpo"><i className="vg-esq grande" /><i className="vg-esq grande" /></div>
      ) : (
        <div className="vmt-corpo">
          <Anel key={`dep-${chave}`} tipo="deposito" rotulo="Depósitos" feito={dep} meta={meta?.deposito ?? null} frac={frac} resta={j.resta} />
          <Anel key={`mk-${chave}`} tipo="markup" rotulo="Markup em conta real" feito={mk} meta={meta?.markup ?? null} frac={frac} resta={j.resta} />
        </div>
      )}
      {!editando && meta && (
        <p className="vmt-pe"><i aria-hidden="true" /> A marquinha no anel é onde a meta deveria estar agora, pelo tempo que já passou. Horário de Brasília.</p>
      )}
    </section>
  )
}
