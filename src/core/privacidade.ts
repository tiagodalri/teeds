import { useSyncExternalStore } from 'react'
import { MARCA } from '../marca'

/**
 * "Ocultar valores" (o olhinho dos bancos, 20/10/2026): esconde saldo e
 * resultados na home e no topo. Fica guardado neste aparelho e vale em todas
 * as abas abertas ao mesmo tempo.
 */
const CHAVE = `${MARCA.id}.valoresOcultos`
const ler = () => { try { return localStorage.getItem(CHAVE) === '1' } catch { return false } }
let ocultos = ler()
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

export const MASCARA = '••••••'

export function alternarValores(): void {
  ocultos = !ocultos
  try { localStorage.setItem(CHAVE, ocultos ? '1' : '0') } catch { /* só nesta aba */ }
  avisar()
}

function assinar(f: () => void) {
  ouvintes.add(f)
  const outraAba = (e: StorageEvent) => { if (e.key === CHAVE) { ocultos = ler(); avisar() } }
  window.addEventListener('storage', outraAba)
  return () => { ouvintes.delete(f); window.removeEventListener('storage', outraAba) }
}

export function useValoresOcultos(): boolean {
  return useSyncExternalStore(assinar, () => ocultos, () => false)
}
