/**
 * O pixel da Meta do parceiro dentro da plataforma (02/11/2026, Tiago: "precisamos
 * cadastrar e rastrear TODOS os eventos"). Vale só na vitrine de quem tem pixel
 * (hoje o /n, do Naor) e nunca em teste local. É o mesmo pixel das páginas de
 * cadastro (captura-globalfly/captura.js), para o funil ficar inteiro num lugar só.
 *
 * Eventos daqui: PageView (abriu a plataforma), ViewContent (cada tela),
 * CompleteRegistration (criou conta pelo app), Entrou, AtivouNotificacoes,
 * AssistiuLive e AcessoLiberado.
 *
 * Correspondência avançada: o pixel leva e-mail, celular e nome de quem está logado (ou
 * de quem acabou de se cadastrar pelas páginas de cadastro, que guardam em gf-captacao),
 * e o código da Meta embaralha tudo no aparelho antes de enviar. O cadastro pelo app
 * também vai pelo servidor (supabase/functions/meta-conversoes), com o mesmo código.
 */
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import { vitrine } from './parceiro'

const PIXELS: Partial<Record<string, Record<string, string>>> = {
  globalfly: { n: '1625935188283999', v: '1104312792216322' },
}
/** O número do pixel do parceiro nesta plataforma, se ele tiver um. */
export const pixelDoParceiro = (marca: string, codigo: string): string | null => PIXELS[marca]?.[codigo] ?? null
const PADRAO = new Set(['PageView', 'ViewContent', 'Lead', 'CompleteRegistration', 'Contact', 'Schedule', 'Subscribe', 'InitiateCheckout', 'AddToCart', 'CustomizeProduct', 'StartTrial', 'AddPaymentInfo', 'Purchase', 'Search', 'AddToWishlist', 'SubmitApplication'])

type Fbq = ((...a: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue?: unknown[]; push?: unknown; loaded?: boolean; version?: string }
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

let pronto = false
const jaContou = new Set<string>()

/** Quem está usando, para o pixel reconhecer (a Meta embaralha antes de enviar). */
export interface QuemUsa { email?: string | null; nome?: string | null; telefone?: string | null }
let quem: QuemUsa = {}

function lerJson<T>(chave: string): T | null { try { return JSON.parse(localStorage.getItem(chave) ?? 'null') as T } catch { return null } }

function dadosDoPixel(): Record<string, string> {
  const cap = lerJson<{ email?: string; nome?: string; sobrenome?: string; tel?: string }>('gf-captacao') ?? {}
  const email = (quem.email || cap.email || '').trim().toLowerCase()
  const nomes = (quem.nome || [cap.nome, cap.sobrenome].filter(Boolean).join(' ')).trim().toLowerCase().split(/\s+/).filter(Boolean)
  const tel = (quem.telefone || cap.tel || '').replace(/\D/g, '')
  const visitante = lerJson<string>('globalfly.visitante')
  const u: Record<string, string> = { country: 'br' }
  if (email) u.em = email
  if (tel.length === 10 || tel.length === 11) u.ph = `55${tel}`
  if (nomes[0]) u.fn = nomes[0]
  if (nomes.length > 1) u.ln = nomes[nomes.length - 1]
  if (visitante) u.external_id = visitante
  return u
}

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
  window.fbq('init', id, dadosDoPixel())
  window.fbq('track', 'PageView')
  pronto = true
  return true
}

const cookie = (nome: string) => decodeURIComponent(document.cookie.match(new RegExp(`(?:^|; )${nome}=([^;]*)`))?.[1] ?? '')

/**
 * Manda um evento ao pixel do parceiro. `umaVez`: só a primeira vez nesta aba.
 * `email`: o cadastro pelo app, que vai também pelo servidor com o mesmo código.
 */
/** O código de uma conversão é da pessoa (o mesmo de captura.js, idDaPessoa): um e-mail, um cadastro na Meta. */
const CONVERSOES = new Set(['Lead', 'CompleteRegistration'])
export function idDaPessoa(email: string): string {
  const t = email.trim().toLowerCase()
  let a = 0x811c9dc5, b = 0x01000193
  for (let i = 0; i < t.length; i++) { const c = t.charCodeAt(i); a = Math.imul(a ^ c, 16777619) >>> 0; b = Math.imul(b ^ c, 2246822519) >>> 0 }
  return a.toString(36) + b.toString(36)
}

export function eventoDoPixel(nome: string, dados?: Record<string, unknown>, umaVez = false, email?: string): void {
  naJornada(nome, dados)
  try {
    if (!carregar() || !window.fbq) return
    const chave = `${nome}:${JSON.stringify(dados ?? {})}`
    if (umaVez && jaContou.has(chave)) return
    jaContou.add(chave)
    // 05/11/2026: cadastro e inscrição levam o código da pessoa (o mesmo das páginas de cadastro): a Meta junta os repetidos
    const codigo = email ? (CONVERSOES.has(nome) ? `${nome}-${idDaPessoa(email)}` : `${nome}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`) : undefined
    // o código só vai quando existe: um quarto argumento vazio faz o pixel engolir o evento
    if (codigo) window.fbq(PADRAO.has(nome) ? 'track' : 'trackCustom', nome, dados ?? {}, { eventID: codigo })
    else window.fbq(PADRAO.has(nome) ? 'track' : 'trackCustom', nome, dados ?? {})
    if (codigo && email) {
      void fetch(`${SUPABASE.url}/functions/v1/meta-conversoes`, {
        method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', apikey: SUPABASE.anonKey },
        body: JSON.stringify({ marca: MARCA.id, parceiro: vitrine(), evento: nome, event_id: codigo, email, url: location.origin + location.pathname,
          fbp: cookie('_fbp'), fbc: cookie('_fbc'), externo: lerJson<string>('globalfly.visitante') ?? '' }),
      }).catch(() => { /* o pixel do navegador já contou */ })
    }
  } catch { /* o pixel nunca atrapalha a plataforma */ }
}

/*
  Central de rastreio (04/11/2026): o que a pessoa faz na plataforma entra na mesma jornada das
  páginas de cadastro (captura.js, gf_rastro). Liga pelo id do navegador (globalfly.visitante) e
  pelo login: o banco só aceita navegador que já passou pelas páginas de cadastro.
*/
const NA_JORNADA: Record<string, string> = {
  Entrou: 'app-entrou', ViewContent: 'app-tela', CompleteRegistration: 'app-cadastro', AtivouNotificacoes: 'app-notificacoes',
  AssistiuLive: 'app-live', AcessoLiberado: 'app-liberado',
}
const jaNaJornada = new Set<string>()
function naJornada(nome: string, dados?: Record<string, unknown>): void {
  try {
    const evento = NA_JORNADA[nome]
    if (!evento || MARCA.id !== 'globalfly' || /^(localhost|127\.|\[::1\])/.test(location.hostname)) return
    const visitante = lerJson<string>('globalfly.visitante'), token = lerJson<{ token?: string }>(`${MARCA.id}.conta`)?.token
    if (!visitante || !token || token === 'lab') return
    const tela = typeof dados?.content_name === 'string' ? dados.content_name : ''
    // a mesma tela conta uma vez por aba
    const chave = `${evento}:${tela}`
    if (jaNaJornada.has(chave)) return
    jaNaJornada.add(chave)
    void fetch(`${SUPABASE.url}/rest/v1/rpc/gf_rastro_app`, {
      method: 'POST', keepalive: true,
      headers: { 'content-type': 'application/json', apikey: SUPABASE.anonKey, authorization: `Bearer ${token}` },
      body: JSON.stringify({ p_marca: MARCA.id, p_visitante: visitante, p_evento: evento, p_pagina: tela ? `${location.pathname} · ${tela}` : location.pathname }),
    }).catch(() => { /* a jornada nunca atrapalha a plataforma */ })
  } catch { /* idem */ }
}

/** Abre o pixel (PageView) quando a plataforma sabe quem está usando (ou que ninguém está logado). */
export const iniciarPixelDoParceiro = (usuario?: QuemUsa | null): void => {
  try { if (usuario) quem = usuario; carregar() } catch { /* idem */ }
}
