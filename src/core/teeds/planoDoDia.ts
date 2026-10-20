/**
 * O plano do dia que a pessoa monta no Gerenciamento (20/10/2026): meta e
 * limite de perda em dólar, guardados NESTE aparelho para a home mostrar a
 * barra do dia. Continua consultivo: nada vai para os robôs nem para a conta.
 */
import { MARCA } from '../../marca'

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

const CHAVE = `${MARCA.id}.plano-do-dia`

export function planoDoDia(): PlanoDoDia | null {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE) || 'null') as PlanoDoDia | null
    return p && Number.isFinite(p.metaUsd) && Number.isFinite(p.limiteUsd) ? p : null
  } catch { return null }
}

export function guardarPlanoDoDia(p: Omit<PlanoDoDia, 'em'>): void {
  try { localStorage.setItem(CHAVE, JSON.stringify({ ...p, em: new Date().toISOString() })) } catch { /* sem armazenamento: vale só agora */ }
}
