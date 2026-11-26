import { useSyncExternalStore } from 'react'

/**
 * O volume de quem assiste a sala de treino (26/11/2026, pedido do Naor:
 * "liberar botão de aumentar ou diminuir áudio"). Vale para todos os <audio>
 * do ensaio, em qualquer modo (página, flutuante, ao lado, só o áudio), e
 * fica guardado no aparelho para a próxima transmissão.
 *
 * No iPhone/iPad o navegador não deixa a página mudar o volume (só o botão
 * do aparelho): lá o controle vira só o "sem som / com som".
 */

export type VolumeDoTreino = { nivel: number; mudo: boolean }

const CHAVE = 'teeds.treino.volume'

function ler(): VolumeDoTreino {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || '{}') as Partial<VolumeDoTreino>
    const nivel = typeof v.nivel === 'number' && v.nivel >= 0 && v.nivel <= 1 ? v.nivel : 1
    return { nivel, mudo: v.mudo === true }
  } catch { return { nivel: 1, mudo: false } }
}

let estado: VolumeDoTreino = ler()
const ouvintes = new Set<() => void>()

function trocar(novo: VolumeDoTreino) {
  estado = novo
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)) } catch { /* sem armazenamento */ }
  ouvintes.forEach((f) => f())
}

export const useVolumeDoTreino = () =>
  useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => estado, () => estado)

/** Arrastar o volume: subir do zero tira o "sem som"; ir a zero é ficar sem som. */
export function definirVolumeDoTreino(nivel: number) {
  const n = Math.min(1, Math.max(0, nivel))
  trocar({ nivel: n, mudo: n === 0 })
}

/** O botão do alto-falante: liga e desliga o som sem perder o nível escolhido. */
export function alternarMudoDoTreino() {
  const voltando = estado.mudo
  trocar({ nivel: voltando && estado.nivel === 0 ? 0.6 : estado.nivel, mudo: !voltando })
}

/** O navegador deixa a página mudar o volume? (iOS não deixa: `volume` é só leitura lá.) */
export const volumeAjustavel = (() => {
  if (typeof document === 'undefined') return true
  try { const a = document.createElement('audio'); a.volume = 0.5; return a.volume === 0.5 } catch { return true }
})()
