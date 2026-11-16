/**
 * A sessão simulada que está na tela, no formato de uma sessão do servidor (16/11/2026, Tiago: "quando
 * alguma I.A. está operando na sessão simulada e eu troco de aba, aquele cardzinho flutuante que mostra
 * as operações não aparece"). O palco publica aqui a cada passo; a aba das I.A. entrega para o App como
 * se fosse uma sessão viva, e a mini cabine flutuante mostra igual. O "Parar" da mini cabine chega ao
 * palco pelo evento `simulado:parar`.
 */
import { useSyncExternalStore } from 'react'
import type { SessaoViva } from './servidorRobos'

let atual: SessaoViva | null = null
const ouvintes = new Set<() => void>()

export function publicarSessaoSimulada(s: SessaoViva | null): void {
  atual = s
  ouvintes.forEach((f) => f())
}
export function useSessaoSimuladaAoVivo(): SessaoViva | null {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => atual, () => atual)
}
export const ehSessaoSimulada = (id: string) => id.startsWith('simulada')
export const pedirParadaDaSimulada = () => window.dispatchEvent(new CustomEvent('simulado:parar'))
