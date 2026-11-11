/**
 * O plano do dia (20/10/2026): meta e limite de perda em dólar, para a home
 * mostrar o instrumento do dia. Continua consultivo: nada vai para os robôs.
 *
 * 21/10/2026: além deste aparelho, o plano vai para os dados da conta
 * (`user_metadata`, o mesmo lugar do nome no Meu perfil), um por marca.
 * Quem define no computador vê o mesmo plano no celular e no app. Vale o
 * mais novo (`em`): o aparelho só é sobrescrito por um plano mais recente.
 *
 * Dois caminhos gravam: a calculadora do Gerenciamento (com banca, entrada e
 * percentuais) e o instrumento da home (só meta e limite, em dólar).
 */
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import { sessaoGuardada, type SessaoTeeds } from './conta'

export interface PlanoDoDia {
  banca: string
  entrada: string
  limite: string
  meta: string
  percentual: boolean
  /** Já em dólar, prontos para a home. */
  metaUsd: number
  limiteUsd: number
  em: string
}

/*
  Um plano por pessoa NESTE aparelho (revisão de 21/10/2026): com a chave só
  da marca, quem entrasse depois no mesmo celular via o plano de quem saiu, e
  a sincronização ainda o subia para a conta errada. O App diz quem está
  logado (definirDonoDoPlano) antes de qualquer tela ler o plano.
*/
const LEGADO = `${MARCA.id}.plano-do-dia`
let dono: string | null = null
const chave = () => (dono ? `${LEGADO}.${dono}` : null)
export function definirDonoDoPlano(id: string | null | undefined): void {
  const novo = id || null
  if (novo === dono) return
  dono = novo
  const k = chave()
  if (!k) return
  // o plano de antes desta mudança (sem dono) passa a ser de quem entrar primeiro, uma vez
  try {
    const antigo = localStorage.getItem(LEGADO)
    if (antigo && !localStorage.getItem(k)) localStorage.setItem(k, antigo)
    if (antigo) localStorage.removeItem(LEGADO)
  } catch { /* sem armazenamento */ }
}
const CAMPO_NA_CONTA = `plano_do_dia_${MARCA.id}`
const valido = (p: unknown): p is PlanoDoDia => {
  const x = p as PlanoDoDia | null
  return !!x && Number.isFinite(x.metaUsd) && Number.isFinite(x.limiteUsd)
}

export function planoDoDia(): PlanoDoDia | null {
  const k = chave()
  if (!k) return null
  try {
    const p = JSON.parse(localStorage.getItem(k) || 'null')
    return valido(p) ? p : null
  } catch { return null }
}

function guardarAqui(p: PlanoDoDia) {
  const k = chave()
  if (!k) return
  try { localStorage.setItem(k, JSON.stringify(p)) } catch { /* sem armazenamento: vale só agora */ }
}

export function guardarPlanoDoDia(p: Omit<PlanoDoDia, 'em'>, sessao?: SessaoTeeds | null): PlanoDoDia {
  const completo = { ...p, em: new Date().toISOString() }
  guardarAqui(completo)
  if (sessao) enviarParaAConta(completo, sessao)
  return completo
}

function enviarParaAConta(p: PlanoDoDia, sessao: SessaoTeeds) {
  void fetch(`${SUPABASE.url}/auth/v1/user`, {
    method: 'PUT', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { [CAMPO_NA_CONTA]: p } }),
  }).catch(() => undefined)
}

/** O plano só com meta e limite (o instrumento da home), mantendo a banca e a entrada da calculadora. */
export function planoSimples(metaUsd: number, limiteUsd: number, sessao?: SessaoTeeds | null): PlanoDoDia {
  const antes = planoDoDia()
  const txt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
  return guardarPlanoDoDia({
    banca: antes?.banca ?? '1000', entrada: antes?.entrada ?? '0,35',
    // em dólar: a calculadora abre no modo valor (não percentual) com os mesmos números
    meta: txt(metaUsd), limite: txt(limiteUsd), percentual: false, metaUsd, limiteUsd,
  }, sessao)
}

/** Traz o plano da conta; se for mais novo que o deste aparelho, ele passa a valer aqui também. */
export async function sincronizarPlanoDoDia(sessao: SessaoTeeds): Promise<PlanoDoDia | null> {
  definirDonoDoPlano(sessao.usuario.id)
  try {
    const r = await fetch(`${SUPABASE.url}/auth/v1/user`, { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` } })
    if (!r.ok) return planoDoDia()
    const u = await r.json() as { user_metadata?: Record<string, unknown> }
    // outra pessoa entrou neste aparelho enquanto a resposta vinha: os dados não são dela
    if (dono !== sessao.usuario.id) return planoDoDia()
    // a última meta e o último limite de cada I.A. vêm na mesma leitura
    juntarComAConta(u.user_metadata?.[CAMPO_ULTIMOS], sessao)
    const daConta = u.user_metadata?.[CAMPO_NA_CONTA]
    const aqui = planoDoDia()
    if (valido(daConta) && (!aqui || Date.parse(daConta.em) > Date.parse(aqui.em))) { guardarAqui(daConta); return daConta }
    // o aparelho tem um plano mais novo (ex.: feito antes da conta guardar): sobe para a conta
    if (aqui && (!valido(daConta) || Date.parse(aqui.em) > Date.parse(daConta.em))) enviarParaAConta(aqui, sessao)
    return aqui
  } catch { return planoDoDia() }
}

/* ------------------------------------------------------------------
  A última meta e o último limite usados (11/11/2026, pedido do Tiago:
  "pausei, liguei de novo e voltou para o plano do dia").

  Antes, o preparo SEMPRE punha o plano do dia por cima. Agora:
  - cada I.A. lembra a meta e o limite com que foi ligada pela última vez,
    separado por conta demo e conta real (o da demo nunca vai para a real);
  - vale o mais novo: um plano do dia definido depois do último uso ganha
    (a 1ª operação depois do plano usa o plano); um uso depois do plano ganha
    (a próxima vem com o último valor);
  - fica neste aparelho e nos dados da conta (`user_metadata`, ao lado do
    plano), para o celular abrir igual ao computador. Sem tabela nova.
  A entrada (stake) não entra aqui: segue o último preparo, como antes.
  ------------------------------------------------------------------ */
export interface MetaEStop { meta: number; limite: number; em: string }
type Ultimos = { demo: Record<string, MetaEStop>; real: Record<string, MetaEStop> }
const CAMPO_ULTIMOS = `meta_stop_${MARCA.id}`
const chaveUltimos = () => (dono ? `${MARCA.id}.meta-stop.${dono}` : null)
/** Sem plano e sem uso anterior nesta I.A. e nesta conta: os valores de fábrica do painel. */
export const META_PADRAO = 5
export const LIMITE_PADRAO = 10

const registroValido = (x: unknown): x is MetaEStop => {
  const r = x as MetaEStop | null
  return !!r && Number.isFinite(r.meta) && r.meta >= 0 && Number.isFinite(r.limite) && r.limite >= 0 && typeof r.em === 'string' && Number.isFinite(Date.parse(r.em))
}
function limpar(x: unknown): Ultimos {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
  const lado = (v: unknown) => {
    const saida: Record<string, MetaEStop> = {}
    if (v && typeof v === 'object' && !Array.isArray(v)) for (const [id, r] of Object.entries(v)) if (registroValido(r)) saida[id] = { meta: r.meta, limite: r.limite, em: r.em }
    return saida
  }
  return { demo: lado(o.demo), real: lado(o.real) }
}
function lerUltimos(): Ultimos {
  const k = chaveUltimos()
  if (!k) return { demo: {}, real: {} }
  try { return limpar(JSON.parse(localStorage.getItem(k) || 'null')) } catch { return { demo: {}, real: {} } }
}
function guardarUltimosAqui(u: Ultimos) {
  const k = chaveUltimos()
  if (!k) return
  try { localStorage.setItem(k, JSON.stringify(u)) } catch { /* sem armazenamento: vale só a conta */ }
}
/** Junta dois registros: em cada I.A. e conta, fica o uso mais novo. */
function juntar(a: Ultimos, b: Ultimos): Ultimos {
  const lado = (x: Record<string, MetaEStop>, y: Record<string, MetaEStop>) => {
    const saida = { ...x }
    for (const [id, r] of Object.entries(y)) if (!saida[id] || Date.parse(r.em) > Date.parse(saida[id].em)) saida[id] = r
    return saida
  }
  return { demo: lado(a.demo, b.demo), real: lado(a.real, b.real) }
}
/** Este aparelho sabe de algum uso que a conta ainda não tem? */
const temNovidade = (junto: Ultimos, conta: Ultimos) =>
  (['demo', 'real'] as const).some((l) => Object.entries(junto[l]).some(([id, r]) => conta[l][id]?.em !== r.em))

/** O que veio da conta entra aqui; se este aparelho tem algo mais novo, sobe para a conta. */
function juntarComAConta(daConta: unknown, sessao: SessaoTeeds): void {
  // a resposta chegou depois de outra pessoa entrar neste aparelho: não mistura as duas
  if (dono !== sessao.usuario.id) return
  const conta = limpar(daConta)
  const aqui = lerUltimos()
  const junto = juntar(aqui, conta)
  guardarUltimosAqui(junto)
  if (temNovidade(junto, conta)) enviarUltimos(junto, sessao)
}
function enviarUltimos(u: Ultimos, sessao: SessaoTeeds) {
  void fetch(`${SUPABASE.url}/auth/v1/user`, {
    method: 'PUT', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { [CAMPO_ULTIMOS]: u } }),
  }).catch(() => undefined)
}
/** A sessão guardada, só se for de quem é dono dos dados deste aparelho agora. */
function sessaoDoDono(): SessaoTeeds | null {
  const s = sessaoGuardada()
  return s && dono && s.usuario.id === dono ? s : null
}

export type OrigemDaMetaEStop = 'plano' | 'ultimo' | 'padrao'
/**
 * A meta e o limite com que o preparo abre para esta I.A. nesta conta:
 * o mais novo entre o plano do dia e o último uso desta I.A. nesta conta.
 */
export function metaEStopDoPreparo(roboId: string, demo: boolean, daSessao?: { meta: number; limite: number } | null): { meta: number; limite: number; origem: OrigemDaMetaEStop } {
  const p = planoDoDia()
  const plano = p && p.metaUsd > 0 && p.limiteUsd > 0 ? p : null
  const ultimo = lerUltimos()[demo ? 'demo' : 'real'][roboId]
  if (ultimo && (!plano || !(Date.parse(plano.em) > Date.parse(ultimo.em)))) return { meta: ultimo.meta, limite: ultimo.limite, origem: 'ultimo' }
  if (plano) return { meta: plano.metaUsd, limite: plano.limiteUsd, origem: 'plano' }
  // "Continuar" de uma sessão ligada antes desta memória existir: os valores dela (mesma conta)
  if (daSessao && Number.isFinite(daSessao.meta) && Number.isFinite(daSessao.limite)) return { meta: daSessao.meta, limite: daSessao.limite, origem: 'ultimo' }
  return { meta: META_PADRAO, limite: LIMITE_PADRAO, origem: 'padrao' }
}

/**
 * A I.A. LIGOU (o servidor aceitou): estes passam a ser os valores dela nesta
 * conta, aqui e na conta da pessoa. `demo` é o que o servidor respondeu.
 */
export function lembrarMetaEStop(roboId: string, demo: boolean, meta: number, limite: number): void {
  if (!Number.isFinite(meta) || !Number.isFinite(limite)) return
  const u = lerUltimos()
  u[demo ? 'demo' : 'real'][roboId] = { meta, limite, em: new Date().toISOString() }
  guardarUltimosAqui(u)
  const sessao = sessaoDoDono()
  if (!sessao) return
  // lê a conta antes de gravar: o outro aparelho pode ter lembrado outra I.A. nesse meio-tempo
  void fetch(`${SUPABASE.url}/auth/v1/user`, { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` } })
    .then((r) => (r.ok ? r.json() as Promise<{ user_metadata?: Record<string, unknown> }> : null))
    // sem ler a conta, não grava por cima: apagaria o que outro aparelho guardou (sobe na próxima sincronização)
    .then((d) => { if (d) juntarComAConta(d.user_metadata?.[CAMPO_ULTIMOS], sessao) })
    .catch(() => undefined)
}

/** Ao abrir o preparo: traz o plano e os últimos valores da conta (feitos em outro aparelho). */
export async function sincronizarParaOPreparo(): Promise<void> {
  const sessao = sessaoDoDono()
  if (sessao) await sincronizarPlanoDoDia(sessao)
}
