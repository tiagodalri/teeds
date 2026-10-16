/**
 * O app instalado, com cara de nativo (marcas com `appNativo`, hoje só a
 * GlobalFly).
 *
 * Três coisas moram aqui, fora do React de propósito:
 *  - o pedido de instalação do Chrome/Android (`beforeinstallprompt`), que
 *    chega UMA vez, logo no carregamento, antes de qualquer componente
 *    existir: se ninguém o guardar, o botão "Instalar" nunca funciona;
 *  - quem é o aparelho (iPhone/iPad instalam pelo menu Compartilhar);
 *  - a lembrança de "agora não", para o convite não insistir.
 */
import { emAppInstalado } from './deriv/auth'
import { MARCA } from '../marca'

interface PedidoDeInstalacao extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let pedido: PedidoDeInstalacao | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

if (typeof window !== 'undefined' && MARCA.appNativo) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // o convite é nosso, na hora certa, e não a barra do Chrome
    pedido = e as PedidoDeInstalacao
    avisar()
  })
  window.addEventListener('appinstalled', () => {
    pedido = null
    lembrarRecusa(3650) // instalou: não convida mais neste navegador
    avisar()
  })
}

export function ouvirInstalacao(f: () => void): () => void {
  ouvintes.add(f)
  return () => { ouvintes.delete(f) }
}

/** iPhone ou iPad (o iPad novo se apresenta como Mac, mas tem toque). */
export function ehIOS(): boolean {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}

/** Navegador embutido de rede social: dali não se instala nada. */
export function navegadorEmbutido(): boolean {
  return /FBAN|FBAV|Instagram|Line\/|TikTok|Twitter|LinkedInApp|WhatsApp/i.test(navigator.userAgent)
}

export type ComoInstalar = 'botao' | 'ios' | 'abrir-no-navegador' | null

/** O caminho de instalação que este aparelho aceita agora (null = nenhum). */
export function comoInstalar(): ComoInstalar {
  if (!MARCA.appNativo || emAppInstalado()) return null
  if (pedido) return 'botao'
  if (ehIOS()) return navegadorEmbutido() ? 'abrir-no-navegador' : 'ios'
  return null
}

export async function instalar(): Promise<boolean> {
  if (!pedido) return false
  const p = pedido
  await p.prompt()
  const { outcome } = await p.userChoice
  pedido = null
  avisar()
  return outcome === 'accepted'
}

const CHAVE = `${MARCA.id}.app.convite-recusado-ate`

export function lembrarRecusa(dias = 7): void {
  try { localStorage.setItem(CHAVE, String(Date.now() + dias * 864e5)) } catch { /* sem armazenamento */ }
}

export function conviteRecusado(): boolean {
  try { return Number(localStorage.getItem(CHAVE) || 0) > Date.now() } catch { return false }
}
