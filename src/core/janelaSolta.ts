/**
 * Janelas soltas (29/10/2026, Victor, mostrando o "Mãos livres" do Profit:
 * "deixar os robôs aqui em outra tela, sem ter que abrir outra guia... tela
 * livre que eu consigo movimentar"). A cabine das I.A.s e a operação manual
 * podem sair da plataforma para uma janela própria, sem abas nem barra, que a
 * pessoa arrasta para onde quiser — inclusive para outro monitor.
 *
 * Como funciona: a janela solta é a própria plataforma aberta com
 * `?janela=cabine` ou `?janela=manual`, mostrando só aquele painel. Cada
 * janela vive por conta própria (a conta, a conexão com a corretora, o
 * acompanhamento), então ela segue viva e em dia mesmo com a janela principal
 * minimizada ou escondida atrás de outro programa — o navegador desacelera a
 * aba escondida, e uma janela que dependesse dela congelaria junto.
 *
 * As janelas conversam por um canal do navegador: a principal sabe quais
 * estão abertas (o botão vira "Janela aberta") e um link de outra tela, clicado
 * na janela solta, abre na principal. O som do fim da sessão toca uma vez só,
 * mesmo com duas janelas acompanhando a mesma sessão (som.ts).
 *
 * Só no computador: no celular e no tablet não existe janela solta.
 */
import { useEffect, useState } from 'react'
import { MARCA } from '../marca'
import type { WorkspacePage } from '../components/WorkspaceNav'

export type QualJanela = 'cabine' | 'manual'

const QUAIS: readonly QualJanela[] = ['cabine', 'manual']

/** Esta aba é uma janela solta? E de qual painel. */
export const JANELA: QualJanela | null = (() => {
  if (typeof location === 'undefined') return null
  const j = new URLSearchParams(location.search).get('janela')
  return (QUAIS as readonly string[]).includes(j ?? '') ? (j as QualJanela) : null
})()

export const TELA_DA_JANELA: Record<QualJanela, WorkspacePage> = { cabine: 'robos', manual: 'operar' }

export const NOME_DA_JANELA: Record<QualJanela, string> = { cabine: MARCA.vocabularioIA ? 'Cabine das I.A.s' : 'Cabine dos robôs', manual: 'Operação manual' }

/** Computador de verdade: mouse e tela larga. É onde uma janela solta faz sentido. */
export function podeSoltarJanela(): boolean {
  if (JANELA || typeof window === 'undefined' || typeof matchMedia !== 'function') return false
  return matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)').matches
}

// ------------------------------------------------------------ onde ela abre
interface Geometria { x: number; y: number; l: number; a: number }
const chaveDaGeometria = (qual: QualJanela) => `${MARCA.id}.janela.${qual}`

function geometriaGuardada(qual: QualJanela): Geometria | null {
  try {
    const g = JSON.parse(localStorage.getItem(chaveDaGeometria(qual)) || 'null') as Geometria | null
    return g && [g.x, g.y, g.l, g.a].every(Number.isFinite) && g.l >= 360 && g.a >= 320 ? g : null
  } catch { return null }
}

/** Da primeira vez: a cabine à direita, alta; a manual à esquerda, larga. Depois, onde a pessoa deixou. */
function geometriaInicial(qual: QualJanela): Geometria {
  const guardada = geometriaGuardada(qual)
  if (guardada) return guardada
  const s = window.screen as Screen & { availLeft?: number; availTop?: number }
  const x0 = s.availLeft ?? 0, y0 = s.availTop ?? 0
  const largura = s.availWidth || 1440, altura = s.availHeight || 900
  if (qual === 'cabine') {
    const l = Math.min(1000, Math.max(720, Math.round(largura * 0.42)))
    const a = Math.round(altura * 0.92)
    return { x: x0 + largura - l - 16, y: y0 + Math.round((altura - a) / 2), l, a }
  }
  const l = Math.min(1320, Math.max(900, Math.round(largura * 0.56)))
  const a = Math.min(900, Math.round(altura * 0.86))
  return { x: x0 + 16, y: y0 + Math.round((altura - a) / 2), l, a }
}

// ------------------------------------------------------------ abrir
const nomeDaJanela = (qual: QualJanela) => `${MARCA.id}-janela-${qual}`
const abertasPorAqui = new Map<QualJanela, Window>()

function enderecoDaJanela(qual: QualJanela): string {
  const u = new URL(location.href)
  u.hash = ''
  for (const k of [...u.searchParams.keys()]) if (k !== 'v') u.searchParams.delete(k)
  u.searchParams.set('janela', qual)
  return u.toString()
}

const ehAJanela = (w: Window, qual: QualJanela) => {
  try { return new URL(w.location.href).searchParams.get('janela') === qual } catch { return false }
}

/**
 * Abre a janela solta (ou traz para a frente, se ela já está aberta).
 * Devolve false quando o navegador bloqueou a janela.
 */
export function abrirJanelaSolta(qual: QualJanela): boolean {
  const ja = abertasPorAqui.get(qual)
  if (ja && !ja.closed) { ja.focus(); return true }
  const g = geometriaInicial(qual)
  const recursos = `popup=yes,width=${g.l},height=${g.a},left=${g.x},top=${g.y}`
  // primeiro sem endereço: se a janela já existe (a principal recarregou e
  // esqueceu dela), o navegador devolve a mesma, sem recarregar a cabine
  let w: Window | null = null
  try { w = window.open('', nomeDaJanela(qual), recursos) } catch { w = null }
  if (!w) return false
  if (!ehAJanela(w, qual)) w.location.replace(enderecoDaJanela(qual))
  abertasPorAqui.set(qual, w)
  try { w.focus() } catch { /* o navegador decide o foco */ }
  return true
}

// ------------------------------------------------------------ o canal entre as janelas
type Mensagem =
  | { tipo: 'aberta' | 'fechada'; qual: QualJanela }
  | { tipo: 'quem' }
  | { tipo: 'ir'; tela: WorkspacePage }

let canal: BroadcastChannel | null = null
function oCanal(): BroadcastChannel | null {
  if (canal || typeof BroadcastChannel === 'undefined') return canal
  try { canal = new BroadcastChannel(`${MARCA.id}.janelas`) } catch { canal = null }
  return canal
}
const enviar = (m: Mensagem) => { try { oCanal()?.postMessage(m) } catch { /* canal fechado */ } }

/** Quais janelas soltas estão abertas agora (na janela principal). */
export function useJanelasAbertas(): ReadonlySet<QualJanela> {
  const [abertas, setAbertas] = useState<ReadonlySet<QualJanela>>(new Set())
  useEffect(() => {
    const c = oCanal()
    if (!c || JANELA) return
    const vistas = new Map<QualJanela, number>()
    const publicar = () => {
      const agora = Date.now()
      for (const [q, t] of vistas) if (agora - t > 12_000) vistas.delete(q)
      setAbertas((antes) => {
        const novas = new Set(vistas.keys())
        return novas.size === antes.size && [...novas].every((q) => antes.has(q)) ? antes : novas
      })
    }
    const ouvir = (e: MessageEvent<Mensagem>) => {
      const m = e.data
      if (m?.tipo === 'aberta') { vistas.set(m.qual, Date.now()); publicar() }
      else if (m?.tipo === 'fechada') { vistas.delete(m.qual); publicar() }
    }
    c.addEventListener('message', ouvir)
    enviar({ tipo: 'quem' })
    // a janela aberta por aqui avisa na hora quando fecha; as outras, pelo silêncio do canal
    const t = window.setInterval(() => {
      for (const [q, w] of abertasPorAqui) if (w.closed) { abertasPorAqui.delete(q); vistas.delete(q) }
      publicar()
    }, 1_000)
    return () => { c.removeEventListener('message', ouvir); window.clearInterval(t) }
  }, [])
  return abertas
}

/** Na janela principal: um link de outra tela, clicado numa janela solta, abre aqui. */
export function useIrPelasJanelas(ir: (tela: WorkspacePage) => void): void {
  useEffect(() => {
    const c = oCanal()
    if (!c || JANELA) return
    const ouvir = (e: MessageEvent<Mensagem>) => {
      if (e.data?.tipo === 'ir') { ir(e.data.tela); try { window.focus() } catch { /* o navegador decide */ } }
    }
    c.addEventListener('message', ouvir)
    return () => c.removeEventListener('message', ouvir)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}

/** Na janela solta: outra tela abre na plataforma (a principal, se estiver aberta). */
export function irNaPlataforma(tela: WorkspacePage): void {
  const principal = window.opener as Window | null
  let viva = false
  try { viva = !!principal && !principal.closed && principal.location.origin === location.origin } catch { viva = false }
  if (viva) { enviar({ tipo: 'ir', tela }); try { principal!.focus() } catch { /* o navegador decide */ } return }
  // sem a principal: esta janela vira a plataforma inteira, na tela pedida
  const u = new URL(location.href)
  u.searchParams.delete('janela')
  u.searchParams.set('tela', tela)
  location.assign(u.toString())
}

/** "Voltar à plataforma": fecha a janela solta e traz a principal para a frente. */
export function voltarAPlataforma(): void {
  const principal = window.opener as Window | null
  let viva = false
  try { viva = !!principal && !principal.closed && principal.location.origin === location.origin } catch { viva = false }
  if (viva) {
    try { principal!.focus() } catch { /* o navegador decide */ }
    window.close()
    return
  }
  const u = new URL(location.href)
  u.searchParams.delete('janela')
  location.assign(u.toString())
}

/**
 * Liga a janela solta (chamado uma vez, no começo, só quando JANELA existe):
 * o título da janela, o "estou aberta" para a principal e o lugar onde a
 * pessoa deixou a janela, para abrir ali da próxima vez.
 */
export function ligarJanelaSolta(): void {
  if (!JANELA) return
  const qual = JANELA
  document.documentElement.classList.add('janela-solta')
  document.title = `${NOME_DA_JANELA[qual]} · ${MARCA.prosa}`

  enviar({ tipo: 'aberta', qual })
  oCanal()?.addEventListener('message', (e: MessageEvent<Mensagem>) => { if (e.data?.tipo === 'quem') enviar({ tipo: 'aberta', qual }) })
  window.setInterval(() => enviar({ tipo: 'aberta', qual }), 4_000)
  window.addEventListener('pagehide', () => enviar({ tipo: 'fechada', qual }))

  // O window.open mede a altura sem a moldura e sem a barra de endereço (e cada
  // navegador desconta de um jeito): a janela abriria um pouco maior ou menor a
  // cada vez. Ao nascer, ela mesma se acerta no tamanho e no lugar guardados.
  const guardada = geometriaGuardada(qual)
  if (guardada) {
    try {
      if (window.outerWidth !== guardada.l || window.outerHeight !== guardada.a) window.resizeTo(guardada.l, guardada.a)
      if (window.screenX !== guardada.x || window.screenY !== guardada.y) window.moveTo(guardada.x, guardada.y)
    } catch { /* o navegador não deixa: fica como abriu */ }
  }

  // mover a janela não dispara evento nenhum: confere de tempos em tempos
  let ultima = guardada ? JSON.stringify(guardada) : ''
  const guardar = () => {
    const g: Geometria = { x: window.screenX, y: window.screenY, l: window.outerWidth, a: window.outerHeight }
    const s = JSON.stringify(g)
    if (s === ultima || g.l < 360 || g.a < 320) return
    ultima = s
    try { localStorage.setItem(chaveDaGeometria(qual), s) } catch { /* abre no lugar padrão */ }
  }
  window.setTimeout(guardar, 1_500)
  window.setInterval(guardar, 2_000)
  window.addEventListener('pagehide', guardar)
}
