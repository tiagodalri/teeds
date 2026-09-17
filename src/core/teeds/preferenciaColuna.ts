import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'

const evento = 'preferencia-coluna-admin'
function assinar(callback: () => void) {
  window.addEventListener(evento, callback)
  window.addEventListener('storage', callback)
  return () => {
    window.removeEventListener(evento, callback)
    window.removeEventListener('storage', callback)
  }
}
const memoria = new Map<string, boolean>()

/** Preferência visual por administrador e marca; nunca concede acesso. */
export function usePreferenciaColuna(usuario: string | null, autorizado: boolean) {
  const chave = `coluna-admin:${MARCA.id}:${usuario ?? ''}`
  const visivel = useSyncExternalStore(assinar, () => {
    if (!autorizado || !usuario) return false
    try { return localStorage.getItem(chave) !== 'oculta' }
    catch { return memoria.get(chave) ?? true }
  }, () => false)
  const alterar = (valor: boolean) => {
    if (!autorizado || !usuario) return
    memoria.set(chave, valor)
    try { localStorage.setItem(chave, valor ? 'visivel' : 'oculta') } catch { /* sessão atual */ }
    window.dispatchEvent(new Event(evento))
  }
  return [visivel, alterar] as const
}
