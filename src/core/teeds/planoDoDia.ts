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
import type { SessaoTeeds } from './conta'

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
    const daConta = u.user_metadata?.[CAMPO_NA_CONTA]
    const aqui = planoDoDia()
    if (valido(daConta) && (!aqui || Date.parse(daConta.em) > Date.parse(aqui.em))) { guardarAqui(daConta); return daConta }
    // o aparelho tem um plano mais novo (ex.: feito antes da conta guardar): sobe para a conta
    if (aqui && (!valido(daConta) || Date.parse(aqui.em) > Date.parse(daConta.em))) enviarParaAConta(aqui, sessao)
    return aqui
  } catch { return planoDoDia() }
}
