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
