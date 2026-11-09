import { useEffect, useRef } from 'react'

/*
 * Arrastar para a direita na Início abre a câmera dos stories, como no Instagram
 * (09/11/2026, Tiago: "quando arrasta pro lado, da esquerda para a direita, já abre a câmera
 * automaticamente pra gravar... SOMENTE PARA ADMS").
 *
 * Só vale no celular (toque) e só enquanto a fileira de stories está na tela: a BarraDeStories
 * só existe para admin e some com o olhinho dos itens de admin, então o gesto segue a mesma regra.
 * Não rouba gestos de ninguém: começa só dentro da Início (.in), fora de campos, da fileira de
 * stories e de qualquer coisa que role de lado; e só trava quando o dedo vai claramente para a
 * direita (rolar a tela para baixo continua igual).
 *
 * O painel preto que entra pela esquerda é mexido direto no DOM (sem render a cada quadro).
 */
const BORDA_DO_SISTEMA = 14 // px na beirada esquerda que ficam para o próprio aparelho

function rolaDeLado(el: Element | null, ate: Element): boolean {
  for (let e = el; e && e !== ate; e = e.parentElement) {
    if (e.scrollWidth > e.clientWidth + 2) {
      const o = getComputedStyle(e).overflowX
      if (o === 'auto' || o === 'scroll') return true
    }
  }
  return false
}

export function useArrastarParaCamera(ligado: boolean, abrir: () => void, preparar?: () => void) {
  const painel = useRef<HTMLDivElement | null>(null)
  const abrirRef = useRef(abrir)
  abrirRef.current = abrir
  const prepararRef = useRef(preparar)
  prepararRef.current = preparar

  useEffect(() => {
    if (!ligado || typeof window === 'undefined' || !('ontouchstart' in window)) return
    let g: { x0: number; y0: number; dx: number; travado: boolean | null; amostras: Array<{ x: number; t: number }> } | null = null

    const pos = (dx: number, animar = false) => {
      const el = painel.current
      if (!el) return
      const w = window.innerWidth
      el.style.transition = animar ? 'transform .22s cubic-bezier(.2, .8, .2, 1)' : 'none'
      el.style.transform = `translate3d(${Math.min(dx, w) - w}px, 0, 0)`
      el.style.setProperty('--p', String(Math.min(1, dx / (w * 0.3))))
      if (dx > 0) el.style.visibility = 'visible'
    }
    const esconder = () => { const el = painel.current; if (el) { el.style.visibility = 'hidden'; pos(0) } }

    const inicio = (e: TouchEvent) => {
      g = null
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const alvo = e.target as Element | null
      const pagina = alvo?.closest?.('.in')
      if (!alvo || !pagina || !pagina.querySelector('.sto-faixa')) return
      if (t.clientX < BORDA_DO_SISTEMA) return
      if (alvo.closest('input, textarea, select, [contenteditable="true"], [data-sem-arrasto], .sto-fila')) return
      if (rolaDeLado(alvo, pagina)) return
      g = { x0: t.clientX, y0: t.clientY, dx: 0, travado: null, amostras: [{ x: t.clientX, t: performance.now() }] }
    }
    const mover = (e: TouchEvent) => {
      if (!g) return
      if (e.touches.length !== 1) { if (g.travado) pos(0, true); g = null; return }
      const t = e.touches[0]
      const dx = t.clientX - g.x0, dy = t.clientY - g.y0
      if (g.travado === null) {
        if (Math.hypot(dx, dy) < 10) return
        // só para a direita e bem mais de lado do que para cima/baixo; o resto é rolagem normal
        g.travado = dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.5
        if (!g.travado) { g = null; return }
        g.x0 = t.clientX - 1 // começa a puxar de onde travou, sem pulo
        prepararRef.current?.()
      }
      if (e.cancelable) e.preventDefault()
      g.dx = Math.max(0, t.clientX - g.x0)
      const agora = performance.now()
      g.amostras.push({ x: t.clientX, t: agora })
      while (g.amostras.length > 2 && agora - g.amostras[0].t > 120) g.amostras.shift()
      pos(g.dx)
    }
    const fim = () => {
      const a = g
      g = null
      if (!a?.travado) return
      const w = window.innerWidth
      const p0 = a.amostras[0], p1 = a.amostras[a.amostras.length - 1]
      const vel = p1.t > p0.t ? (p1.x - p0.x) / (p1.t - p0.t) : 0 // px por ms nos últimos ~120 ms
      const vai = a.dx > w * 0.32 || (a.dx > 60 && vel > 0.5)
      if (!vai) { pos(0, true); window.setTimeout(esconder, 260); return }
      pos(w, true)
      window.setTimeout(() => abrirRef.current(), 170)
      window.setTimeout(esconder, 1200) // o estúdio já está por cima
    }
    const cancelar = () => { if (g?.travado) { pos(0, true); window.setTimeout(esconder, 260) } g = null }

    document.addEventListener('touchstart', inicio, { passive: true })
    document.addEventListener('touchmove', mover, { passive: false })
    document.addEventListener('touchend', fim)
    document.addEventListener('touchcancel', cancelar)
    return () => {
      document.removeEventListener('touchstart', inicio)
      document.removeEventListener('touchmove', mover)
      document.removeEventListener('touchend', fim)
      document.removeEventListener('touchcancel', cancelar)
      esconder()
    }
  }, [ligado])

  return painel
}
