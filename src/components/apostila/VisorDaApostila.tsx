import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MARCA } from '../../marca'
import { useVoltarFecha } from '../../core/telaDeApp'
import './visor-apostila.css'

/*
 * O visor da apostila (10/11/2026, o Victor relatou no celular: "não tem campo
 * de sair depois que abre, mesmo virando a tela não sai, só fechando a
 * plataforma").
 *
 * No app instalado (tela inicial) um link do mesmo site abre DENTRO do app,
 * sem barra do navegador: o PDF ocupava tudo e não havia como voltar. No
 * celular a apostila agora abre aqui, com o Fechar sempre visível no topo e o
 * voltar do aparelho fechando também. No computador segue abrindo o PDF numa
 * aba, como antes.
 *
 * As páginas são desenhadas com o pdf.js (carregado só quando abre) e só as
 * que estão perto da tela ficam desenhadas, para o celular não ficar sem
 * memória com as 46 páginas.
 */

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.min.js'
const WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js'

/* eslint-disable @typescript-eslint/no-explicit-any */
let carregando: Promise<any> | null = null
function pdfjs(): Promise<any> {
  const w = window as any
  if (w.pdfjsLib) return Promise.resolve(w.pdfjsLib)
  if (!carregando) carregando = new Promise((ok, erro) => {
    const s = document.createElement('script'); s.src = PDFJS; s.async = true
    s.onload = () => { if (w.pdfjsLib) { w.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; ok(w.pdfjsLib) } else erro(new Error('pdf.js')) }
    s.onerror = () => { carregando = null; erro(new Error('pdf.js')) }
    document.head.appendChild(s)
  })
  return carregando
}

/** Abre no visor quando é celular ou app instalado; no computador, deixa o link seguir. */
export function usarVisorDaApostila(): boolean {
  const app = matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
  const toque = matchMedia('(pointer: coarse)').matches
  return app || (toque && innerWidth < 1024)
}
export function abrirApostila(ev?: { preventDefault: () => void }): boolean {
  if (!MARCA.apostila || !usarVisorDaApostila()) return false
  ev?.preventDefault()
  window.dispatchEvent(new CustomEvent('plataforma:apostila'))
  return true
}

/** Fica montado no App; aparece quando alguém pede a apostila. */
export function VisorDaApostila() {
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    const abrir = () => setAberto(true)
    window.addEventListener('plataforma:apostila', abrir)
    return () => window.removeEventListener('plataforma:apostila', abrir)
  }, [])
  if (!aberto || !MARCA.apostila) return null
  return createPortal(<Visor url={MARCA.apostila} aoFechar={() => setAberto(false)} />, document.body)
}

function Visor({ url, aoFechar }: { url: string; aoFechar: () => void }) {
  const corpo = useRef<HTMLDivElement>(null)
  const [paginas, setPaginas] = useState<number[]>([]) // proporção altura/largura de cada página
  const [erro, setErro] = useState(false)
  const [atual, setAtual] = useState(1)
  const doc = useRef<any>(null)

  // voltar do aparelho fecha o visor (o mesmo padrão das outras telas cheias); trava a rolagem por trás
  useVoltarFecha(aoFechar)
  const fechar = aoFechar
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    addEventListener('keydown', esc)
    const antes = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { removeEventListener('keydown', esc); document.body.style.overflow = antes }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // abre o PDF (aos pedaços: o servidor aceita pedir partes do arquivo)
  useEffect(() => {
    let vivo = true
    pdfjs().then(async (lib) => {
      const d = await lib.getDocument({ url, rangeChunkSize: 262144, disableAutoFetch: true }).promise
      if (!vivo) { d.destroy(); return }
      doc.current = d
      const p1 = await d.getPage(1), v = p1.getViewport({ scale: 1 })
      setPaginas(Array.from({ length: d.numPages }, () => v.height / v.width))
    }).catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false; doc.current?.destroy?.(); doc.current = null }
  }, [url])

  // desenha só as páginas perto da tela e apaga as que ficaram longe
  useEffect(() => {
    const raiz = corpo.current
    if (!raiz || !paginas.length) return
    const desenhadas = new Map<number, any>()
    const desenhar = async (n: number, caixa: HTMLElement) => {
      if (desenhadas.has(n) || !doc.current) return
      desenhadas.set(n, null)
      try {
        const pg = await doc.current.getPage(n)
        const largura = caixa.clientWidth, dpr = Math.min(2, devicePixelRatio || 1)
        const v = pg.getViewport({ scale: (largura * dpr) / pg.getViewport({ scale: 1 }).width })
        const cv = document.createElement('canvas'); cv.width = Math.floor(v.width); cv.height = Math.floor(v.height)
        const tarefa = pg.render({ canvasContext: cv.getContext('2d'), viewport: v })
        desenhadas.set(n, tarefa)
        await tarefa.promise
        if (desenhadas.get(n) !== tarefa) return
        cv.className = 'vap-desenho'; caixa.replaceChildren(cv)
      } catch { desenhadas.delete(n) }
    }
    const apagar = (n: number, caixa: HTMLElement) => {
      const t = desenhadas.get(n); if (t?.cancel) t.cancel()
      desenhadas.delete(n); const cv = caixa.querySelector('canvas'); if (cv) { cv.width = 0; cv.height = 0 } caixa.replaceChildren()
    }
    const perto = new IntersectionObserver((es) => { for (const e of es) { const el = e.target as HTMLElement, n = Number(el.dataset.n); if (e.isIntersecting) void desenhar(n, el); else apagar(n, el) } }, { root: raiz, rootMargin: '1600px 0px' })
    const visivel = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) setAtual(Number((e.target as HTMLElement).dataset.n)) }, { root: raiz, threshold: 0.5 })
    raiz.querySelectorAll<HTMLElement>('.vap-pagina').forEach((el) => { perto.observe(el); visivel.observe(el) })
    return () => { perto.disconnect(); visivel.disconnect() }
  }, [paginas])

  return (
    <div className="vap" role="dialog" aria-modal="true" aria-label="Apostila">
      <header className="vap-topo">
        <button type="button" className="vap-fechar" onClick={fechar} aria-label="Fechar a apostila">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          <span>Fechar</span>
        </button>
        <b className="vap-titulo">Apostila do aluno{paginas.length ? <small>Página {atual} de {paginas.length}</small> : null}</b>
        <a className="vap-baixar" href={url} download={`Apostila ${MARCA.nome}.pdf`} aria-label="Baixar o PDF">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
          <span>Baixar</span>
        </a>
      </header>
      <div className="vap-corpo" ref={corpo}>
        {erro && (
          <div className="vap-erro">
            <p>Não consegui mostrar a apostila aqui.</p>
            <a className="vap-baixar grande" href={url} download={`Apostila ${MARCA.nome}.pdf`}>Baixar o PDF</a>
          </div>
        )}
        {!erro && !paginas.length && <div className="vap-carregando"><i aria-hidden="true" />Abrindo a apostila…</div>}
        {paginas.map((r, i) => <div key={i} className="vap-folha"><div className="vap-pagina" data-n={i + 1} style={{ paddingTop: `${r * 100}%` }} /></div>)}
      </div>
    </div>
  )
}
