import { useSyncExternalStore } from 'react'
import { MARCA } from '../marca'

/**
 * "Modo cliente" do menu (27/10/2026, Tiago): o olhinho no menu do avatar,
 * só para administradores, esconde do menu lateral os itens que só o admin
 * tem (Administração, Laboratório de IA e Divulgação). Serve para gravar a
 * tela com o acesso parecendo o de um cliente. Só o menu muda: as permissões
 * continuam as mesmas. Fica guardado neste aparelho e vale nas abas abertas.
 */
const CHAVE = `${MARCA.id}.menuAdminOculto`
const ler = () => { try { return localStorage.getItem(CHAVE) === '1' } catch { return false } }
let oculto = ler()
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

/** As telas que somem do menu junto com os itens de admin. */
export const TELAS_DE_ADMIN = ['gestao', 'insights', 'monitoramento', 'laboratorio', 'divulgacao', 'multiplicadores'] as const

export function alternarMenuAdmin(): void {
  oculto = !oculto
  try { localStorage.setItem(CHAVE, oculto ? '1' : '0') } catch { /* só nesta aba */ }
  avisar()
}

function assinar(f: () => void) {
  ouvintes.add(f)
  const outraAba = (e: StorageEvent) => { if (e.key === CHAVE) { oculto = ler(); avisar() } }
  window.addEventListener('storage', outraAba)
  return () => { ouvintes.delete(f); window.removeEventListener('storage', outraAba) }
}

export function useMenuAdminOculto(): boolean {
  return useSyncExternalStore(assinar, () => oculto, () => false)
}
