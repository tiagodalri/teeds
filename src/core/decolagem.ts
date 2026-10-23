import { useSyncExternalStore } from 'react'
import { naPagina } from './escala'

/**
 * A decolagem (21/10/2026, pedido do Tiago): ao entrar na conta, um avião
 * sai do botão "Entrar", sobe na diagonal do monograma deixando o rastro de
 * ouro, o Azul GF cobre a tela atrás dele e a plataforma aparece quando o
 * céu abre.
 *
 * O voo atravessa a troca de telas (login → carregando → início), então
 * mora fora delas: o App avisa quando decolar e quando a casa está pronta,
 * e o componente Decolagem (na raiz) desenha.
 */

export interface Voo {
  /** Muda a cada decolagem: é a chave da animação. */
  id: number
  /** Centro do botão que disparou, de onde o avião sai. */
  origem: { x: number; y: number } | null
  nome: string | null
  /** A plataforma já está na tela por baixo: pode abrir o céu. */
  pronto: boolean
}

let voo: Voo | null = null
let embarque: { x: number; y: number } | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

/** O login guarda o ponto do botão ao enviar: quando o voo começar, a tela de login já saiu. */
export function marcarEmbarque(el: Element | null): void {
  if (!el) return
  const r = el.getBoundingClientRect()
  // em px da página (a escala do computador: core/escala.ts)
  embarque = { x: naPagina(r.left + r.width / 2), y: naPagina(r.top + r.height / 2) }
}

export function decolar(nome: string | null): void {
  voo = { id: Date.now(), origem: embarque, nome, pronto: false }
  embarque = null
  avisar()
}

/** A tela de destino está desenhada (o App não está mais "abrindo"). */
export function liberarPouso(): void {
  if (!voo || voo.pronto) return
  voo = { ...voo, pronto: true }
  avisar()
}

export function terminarVoo(): void {
  voo = null
  avisar()
}

export function useVoo(): Voo | null {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => voo, () => null)
}
