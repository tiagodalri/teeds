/*
  Desenho dos comprovantes em PDF (miniatura e prévia). O pdf.js (~1 MB) só é baixado quando um
  comprovante aparece na tela; a versão "legacy" roda também nos iPhones mais antigos.
*/
import type { PDFDocumentProxy } from 'pdfjs-dist'

type Biblioteca = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let biblioteca: Promise<Biblioteca> | null = null

function pdfjs(): Promise<Biblioteca> {
  // o "trabalhador" do pdf.js entra como um pedaço comum do site (mesmo versionamento dos outros),
  // não como arquivo solto: comprovante é 1–3 páginas, ler na própria página é rápido
  biblioteca ??= Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
  ]).then(([m, w]) => { (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = w; return m })
    .catch((e) => { biblioteca = null; throw e })
  return biblioteca
}

const abertos = new Map<string, Promise<PDFDocumentProxy>>()

/** Abre (uma vez só por chave) o PDF cujos bytes vêm de `dados`. */
export function abrirPdf(chave: string, dados: () => Promise<ArrayBuffer>): Promise<PDFDocumentProxy> {
  let p = abertos.get(chave)
  if (!p) {
    p = Promise.all([pdfjs(), dados()]).then(([m, b]) => m.getDocument({ data: new Uint8Array(b), isEvalSupported: false }).promise)
    p.catch(() => abertos.delete(chave))
    abertos.set(chave, p)
  }
  return p
}

// o pdf.js recusa dois desenhos ao mesmo tempo no mesmo canvas: o novo cancela o anterior
const tarefas = new WeakMap<HTMLCanvasElement, { cancel: () => void; promise: Promise<void> }>()
const pedidos = new WeakMap<HTMLCanvasElement, number>()

/** Desenha a página `n` (1 = primeira) no canvas, na largura pedida em px de tela. */
export async function desenharPagina(doc: PDFDocumentProxy, n: number, canvas: HTMLCanvasElement, largura: number): Promise<void> {
  const meu = (pedidos.get(canvas) ?? 0) + 1
  pedidos.set(canvas, meu)
  const anterior = tarefas.get(canvas)
  if (anterior) { anterior.cancel(); await anterior.promise.catch(() => undefined) }
  const pagina = await doc.getPage(n)
  if (pedidos.get(canvas) !== meu) return // um pedido mais novo assumiu este canvas
  const base = pagina.getViewport({ scale: 1 })
  const densidade = Math.min(window.devicePixelRatio || 1, 2.5)
  const escala = (largura / base.width) * densidade
  const vista = pagina.getViewport({ scale: escala })
  canvas.width = Math.floor(vista.width)
  canvas.height = Math.floor(vista.height)
  canvas.style.aspectRatio = `${base.width} / ${base.height}`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const tarefa = pagina.render({ canvasContext: ctx, viewport: vista })
  tarefas.set(canvas, tarefa)
  try { await tarefa.promise } finally { if (tarefas.get(canvas) === tarefa) tarefas.delete(canvas) }
}
