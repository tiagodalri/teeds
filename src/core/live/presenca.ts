/**
 * "Tem player de live aberto?" — sem carregar o LiveKit.
 *
 * O App pergunta isto para decidir se monta o player flutuante. Quem nunca
 * clicou em assistir não baixa a biblioteca de vídeo (ela é pesada); quem
 * clicou, mantém o player vivo entre as telas.
 */
import { useSyncExternalStore } from 'react'

let ativo = false
const ouvintes = new Set<() => void>()

export function marcarPlayerAtivo(sim: boolean): void {
  if (ativo === sim) return
  ativo = sim
  ouvintes.forEach((f) => f())
}

export function usePlayerAtivo(): boolean {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => ativo, () => ativo)
}

/*
  A sala de treino também acompanha a pessoa pelas telas (20/10/2026): o App
  monta o player do treino só quando há sala aberta, sem carregar o LiveKit.
*/
let treinoAtivo = false
const ouvintesTreino = new Set<() => void>()
export function marcarTreinoAtivo(sim: boolean): void {
  if (treinoAtivo === sim) return
  treinoAtivo = sim
  ouvintesTreino.forEach((f) => f())
}
export function useTreinoAtivo(): boolean {
  return useSyncExternalStore((f) => { ouvintesTreino.add(f); return () => { ouvintesTreino.delete(f) } }, () => treinoAtivo, () => treinoAtivo)
}
