/**
 * Sessões simuladas guardadas para a próxima (16/11/2026, Tiago: "escolhi a Raptor, preenchi todos os
 * parâmetros; em vez de dar o play, quero deixar salvo para a próxima operação. Na próxima, com o modo
 * simulado ativo, clico nas I.A., seleciono a Raptor e os parâmetros já vêm preenchidos — entrada, meta,
 * tudo — e ao clicar em iniciar ele roda a operação que a gente planejou").
 *
 * Um plano por I.A., neste aparelho. Fica guardado até ser trocado por outro ou apagado: dá para gravar
 * a mesma aula várias vezes. Nada vai para o banco nem para o servidor.
 */
import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'
import type { Modo } from '../deriv/strategies'
import { configDoTrecho, type Roteiro } from './sessaoSimulada'

export interface PlanoSalvo {
  roteiro: Roteiro
  /** O que o preparo de verdade mostra já preenchido. */
  entrada: number
  meta: number
  stop: number
  modo: Modo
  lossVirtual: number | null
  salvoEm: number
}

const CHAVE = `${MARCA.id}.simulacao.planos`
let planos: Record<string, PlanoSalvo> = ler()
const ouvintes = new Set<() => void>()
function ler(): Record<string, PlanoSalvo> {
  try { const x = JSON.parse(localStorage.getItem(CHAVE) ?? '{}'); return x && typeof x === 'object' ? x : {} } catch { return {} }
}
function gravar(novos: Record<string, PlanoSalvo>) {
  planos = novos
  try { localStorage.setItem(CHAVE, JSON.stringify(novos)) } catch { /* só nesta aba */ }
  ouvintes.forEach((f) => f())
}

export function salvarPlano(roteiro: Roteiro): PlanoSalvo {
  const t = roteiro.trechos[0]
  const cfg = configDoTrecho(roteiro, t)
  const plano: PlanoSalvo = {
    roteiro, entrada: roteiro.entrada, meta: cfg.takeProfit, stop: cfg.stopLoss, modo: roteiro.modo ?? 'conservador',
    lossVirtual: roteiro.lossVirtual ?? null, salvoEm: Date.now(),
  }
  gravar({ ...planos, [roteiro.ia]: plano })
  return plano
}
export function apagarPlano(ia: string) {
  const { [ia]: _fora, ...resto } = planos
  void _fora
  gravar(resto)
}
export const planoSalvo = (ia: string | null | undefined): PlanoSalvo | null => (ia ? planos[ia] ?? null : null)
/** A I.A. da sessão salva mais recente (null = nenhuma sessão salva neste aparelho). */
export function iaDoPlanoMaisRecente(): string | null {
  let melhor: string | null = null
  for (const [ia, p] of Object.entries(planos)) if (p && Array.isArray(p.roteiro?.trechos) && p.roteiro.trechos.length > 0 && (melhor === null || (p.salvoEm ?? 0) > (planos[melhor].salvoEm ?? 0))) melhor = ia
  return melhor
}

export function usePlanosSalvos(): Record<string, PlanoSalvo> {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => planos, () => planos)
}
