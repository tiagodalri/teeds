/**
 * O pixel da Meta do parceiro dentro da plataforma (02/11/2026, Tiago: "precisamos
 * cadastrar e rastrear TODOS os eventos"). Vale só na vitrine de quem tem pixel
 * (hoje o /n, do Naor) e nunca em teste local. É o mesmo pixel das páginas de
 * cadastro (captura-globalfly/captura.js), para o funil ficar inteiro num lugar só.
 *
 * Eventos daqui: PageView (abriu a plataforma), ViewContent (cada tela),
 * CompleteRegistration (criou conta pelo app), Entrou, AtivouNotificacoes,
 * AssistiuLive e AcessoLiberado.
 */
import { MARCA } from '../../marca'
import { vitrine } from './parceiro'

const PIXELS: Partial<Record<string, Record<string, string>>> = {
  globalfly: { n: '1625935188283999' },
}
const PADRAO = new Set(['PageView', 'ViewContent', 'Lead', 'CompleteRegistration', 'Contact', 'Schedule', 'Subscribe'])

type Fbq = ((...a: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string }
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

let pronto = false
const jaContou = new Set<string>()

function carregar(): boolean {
  if (pronto) return true
  if (typeof window === 'undefined' || /^(localhost|127\.|\[::1\])/.test(location.hostname)) return false
  const id = PIXELS[MARCA.id]?.[vitrine()]
  if (!id) return false
  if (!window.fbq) {
    const f = function (...a: unknown[]) { f.callMethod ? f.callMethod(...a) : f.queue!.push(a) } as Fbq
    f.push = f; f.loaded = true; f.version = '2.0'; f.queue = []
    window.fbq = f; window._fbq = f
    const s = document.createElement('script'); s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js'
    document.head.appendChild(s)
  }
  window.fbq('init', id)
  window.fbq('track', 'PageView')
  pronto = true
  return true
}

/** Manda um evento ao pixel do parceiro. `umaVez`: só a primeira vez nesta aba. */
export function eventoDoPixel(nome: string, dados?: Record<string, unknown>, umaVez = false): void {
  try {
    if (!carregar() || !window.fbq) return
    const chave = `${nome}:${JSON.stringify(dados ?? {})}`
    if (umaVez && jaContou.has(chave)) return
    jaContou.add(chave)
    window.fbq(PADRAO.has(nome) ? 'track' : 'trackCustom', nome, dados ?? {})
  } catch { /* o pixel nunca atrapalha a plataforma */ }
}

/** Abre o pixel (PageView) logo que a plataforma carrega. */
export const iniciarPixelDoParceiro = (): void => { try { carregar() } catch { /* idem */ } }
