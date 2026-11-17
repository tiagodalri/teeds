/**
 * A sessão simulada que está na tela, no formato de uma sessão do servidor (16/11/2026, Tiago: "quando
 * alguma I.A. está operando na sessão simulada e eu troco de aba, aquele cardzinho flutuante que mostra
 * as operações não aparece"). O palco publica aqui a cada passo; a aba das I.A. entrega para o App como
 * se fosse uma sessão viva, e a mini cabine flutuante mostra igual. O "Parar" da mini cabine chega ao
 * palco pelo evento `simulado:parar`.
 */
import { useSyncExternalStore } from 'react'
import type { SessaoViva } from './servidorRobos'

/*
  17/11/2026 (Tiago: "simular as 5 e não só uma"): várias sessões simuladas na tela ao mesmo tempo. Cada palco
  publica a sua pelo id; a lista sai na ordem em que as sessões entraram.
*/
const porId = new Map<string, SessaoViva>()
let lista: SessaoViva[] = []
const ouvintes = new Set<() => void>()

/** O palco publica a sessão dele a cada passo; `null` tira a sessão (o palco saiu da tela). */
export function publicarSessaoSimulada(id: string, s: SessaoViva | null): void {
  if (s) porId.set(id, s)
  else if (!porId.delete(id)) return
  lista = [...porId.values()]
  ouvintes.forEach((f) => f())
}
export function useSessoesSimuladasAoVivo(): SessaoViva[] {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => lista, () => lista)
}
export const ehSessaoSimulada = (id: string) => id.startsWith('simulada')
/** O "Parar" da mini cabine: desliga a sessão simulada desse id (sem id, todas). */
export const pedirParadaDaSimulada = (id?: string) => window.dispatchEvent(new CustomEvent('simulado:parar', { detail: { id: id ?? null } }))
