import { useCallback, useEffect, useRef, useState, type PointerEvent as PE } from 'react'
import { createPortal } from 'react-dom'
import { abrirImagem, canvasParaArquivo, ehImagem } from '../../core/imagem'
import { IconeFechar } from '../IconeFechar'
import './janela-da-capa.css'

/**
 * A janela de capa (16/11/2026, Tiago: "trocar a capa de cada aula, de cada curso…
 * experiência nível Apple"). Uma imagem entra por qualquer caminho (escolher, arrastar,
 * colar com ⌘V, miniatura do YouTube, quadro do vídeo), a pessoa enquadra no formato
 * do cartão (arrastar para mover, rolar ou pinçar para aproximar) e vê na hora como fica
 * no cartão e num quadro largo. O que sai é a imagem já recortada (800×1200 na aula,
 * 900×1200 no curso), pronta para enviar. Prefixo de CSS: jc-.
 */

export interface FonteExtra { rotulo: string; pegar: () => Promise<Blob> }

interface Props {
  titulo: string
  /** Largura / altura do cartão: 2/3 (aula) ou 3/4 (curso). */
  proporcao: number
  /** Texto e número desenhados por cima, como no cartão da sala. */
  legenda?: { titulo: string; numero?: string }
  /** Imagem que já abre na janela (ex.: a capa atual, para reenquadrar). */
  inicial?: Blob | null
  extras?: FonteExtra[]
  aoUsar: (imagem: Blob) => Promise<void>
  aoFechar: () => void
}

type Aberta = { url: string; w: number; h: number; blob: Blob }
const ZOOM_MAX = 4

export function JanelaDaCapa({ titulo, proporcao, legenda, inicial, extras = [], aoUsar, aoFechar }: Props) {
  const [img, setImg] = useState<Aberta | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [texto, setTexto] = useState(true)
  const [estado, setEstado] = useState<'livre' | 'abrindo' | 'enviando'>('livre')
  const [falha, setFalha] = useState<string | null>(null)
  const [sobre, setSobre] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const quadro = useRef<HTMLDivElement>(null)
  const arraste = useRef<{ x: number; y: number; px: number; py: number } | null>(null)
  const urlAtual = useRef<string | null>(null)

  /* ------------------------------------------------------------- abrir */
  const abrir = useCallback(async (b: Blob | null | undefined) => {
    if (!b) return
    if (!ehImagem(b)) { setFalha('Esse arquivo não é uma imagem. Use JPG, PNG, WEBP ou uma foto do iPhone.'); return }
    setEstado('abrindo'); setFalha(null)
    try {
      const a = await abrirImagem(b)
      // o que a tela mostra é um JPEG que todo navegador abre (HEIC já convertido), com no máximo
      // 3000 px no lado maior: o Safari do iPhone não desenha canvas de foto de 48 MP, e a capa sai com 1200
      const k = Math.min(1, 3000 / Math.max(a.w, a.h)), w = Math.max(1, Math.round(a.w * k)), h = Math.max(1, Math.round(a.h * k))
      const c = document.createElement('canvas'); c.width = w; c.height = h
      c.getContext('2d')!.drawImage(a.fonte, 0, 0, w, h); a.soltar()
      const pronto = await new Promise<Blob>((ok, nao) => c.toBlob((x) => (x ? ok(x) : nao(new Error('Não consegui abrir essa imagem.'))), 'image/jpeg', 0.95))
      if (urlAtual.current) URL.revokeObjectURL(urlAtual.current)
      const url = URL.createObjectURL(pronto); urlAtual.current = url
      setImg({ url, w: a.w, h: a.h, blob: pronto })
      setZoom(1); setPos({ x: 0, y: 0 })
    } catch (e) { setFalha((e as Error).message) } finally { setEstado('livre') }
  }, [])
  useEffect(() => { if (inicial) void abrir(inicial) }, [inicial, abrir])
  useEffect(() => () => { if (urlAtual.current) URL.revokeObjectURL(urlAtual.current) }, [])

  // colar (⌘V / Ctrl+V) uma imagem copiada de qualquer lugar
  useEffect(() => {
    const colar = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => ehImagem(x))
      if (f) { e.preventDefault(); void abrir(f) }
    }
    window.addEventListener('paste', colar)
    return () => window.removeEventListener('paste', colar)
  }, [abrir])

  /* -------------------------------------------------------- enquadrar */
  // a imagem cobre o quadro com zoom 1; tamanho em % do quadro
  const cobre = img ? Math.max(1 / (img.w / img.h / proporcao), 1) : 1
  const larg = img ? (img.w / img.h / proporcao) * cobre * zoom * 100 : 100 // % da largura do quadro
  const alt = img ? cobre * zoom * 100 : 100 // % da altura do quadro
  const folga = { x: Math.max(0, (larg - 100) / 200), y: Math.max(0, (alt - 100) / 200) }
  const prender = useCallback((p: { x: number; y: number }, f = folga) => ({ x: Math.min(f.x, Math.max(-f.x, p.x)), y: Math.min(f.y, Math.max(-f.y, p.y)) }), [folga.x, folga.y]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setPos((p) => prender(p)) }, [zoom, prender])

  const mudarZoom = useCallback((z: number) => setZoom(Math.min(ZOOM_MAX, Math.max(1, Math.round(z * 100) / 100))), [])
  useEffect(() => {
    const el = quadro.current
    if (!el) return
    const roda = (e: WheelEvent) => { e.preventDefault(); setZoom((z) => Math.min(ZOOM_MAX, Math.max(1, z * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0025))))) }
    el.addEventListener('wheel', roda, { passive: false })
    return () => el.removeEventListener('wheel', roda)
  }, [img])

  const baixar = (e: PE) => { if (!img) return; (e.target as Element).setPointerCapture?.(e.pointerId); arraste.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y } }
  const mover = (e: PE) => {
    const a = arraste.current, el = quadro.current
    if (!a || !el) return
    const r = el.getBoundingClientRect()
    setPos(prender({ x: a.px + (e.clientX - a.x) / r.width, y: a.py + (e.clientY - a.y) / r.height }))
  }
  const soltar = () => { arraste.current = null }

  /* ---------------------------------------------------------- usar */
  const usar = async () => {
    if (!img || estado !== 'livre') return
    setEstado('enviando'); setFalha(null)
    try {
      const H = 1200, W = Math.round(H * proporcao)
      const c = document.createElement('canvas'); c.width = W; c.height = H
      const ctx = c.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      const el = new Image(); el.src = img.url; await el.decode()
      const dw = (larg / 100) * W, dh = (alt / 100) * H
      ctx.drawImage(el, W / 2 - dw / 2 + pos.x * W, H / 2 - dh / 2 + pos.y * H, dw, dh)
      const { blob } = await canvasParaArquivo(c, 0.9)
      await aoUsar(blob)
    } catch (e) { setFalha((e as Error).message); setEstado('livre') }
  }

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && estado !== 'enviando') { e.preventDefault(); aoFechar(); return }
      if ((e.target as HTMLElement)?.closest?.('input, textarea, select, button, a')) return
      const passo = e.shiftKey ? 0.05 : 0.01
      if (e.key === 'ArrowLeft') setPos((p) => prender({ ...p, x: p.x - passo }))
      else if (e.key === 'ArrowRight') setPos((p) => prender({ ...p, x: p.x + passo }))
      else if (e.key === 'ArrowUp') setPos((p) => prender({ ...p, y: p.y - passo }))
      else if (e.key === 'ArrowDown') setPos((p) => prender({ ...p, y: p.y + passo }))
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(ZOOM_MAX, z + 0.1))
      else if (e.key === '-') setZoom((z) => Math.max(1, z - 0.1))
      else if (e.key === 'Enter' && img) void usar()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const estiloImg = { width: `${larg}%`, height: `${alt}%`, left: `${50 - larg / 2 + pos.x * 100}%`, top: `${50 - alt / 2 + pos.y * 100}%` }
  const foto = (classe: string) => img && <img className={classe} src={img.url} alt="" draggable={false} style={estiloImg} />
  const sobreposto = legenda && texto && (
    <span className="jc-legenda" aria-hidden="true">{legenda.numero && <small>{legenda.numero}</small>}<b>{legenda.titulo}</b></span>
  )

  return createPortal(
    <div className="jc-fundo" onMouseDown={() => estado !== 'enviando' && aoFechar()}>
      <section className="jc" role="dialog" aria-modal="true" aria-label={titulo} onMouseDown={(e) => e.stopPropagation()}
        onDragOver={(e) => { e.preventDefault(); setSobre(true) }} onDragLeave={(e) => { if (e.currentTarget === e.target) setSobre(false) }}
        onDrop={(e) => { e.preventDefault(); setSobre(false); void abrir([...e.dataTransfer.files].find((f) => ehImagem(f))) }}>
        <header className="jc-cab">
          <div><b>{titulo}</b><small>{img ? 'Arraste a imagem para enquadrar. Role ou pince para aproximar.' : 'Escolha, arraste ou cole (⌘V) uma imagem.'}</small></div>
          <button type="button" className="jc-x" onClick={aoFechar} disabled={estado === 'enviando'} aria-label="Fechar"><IconeFechar /></button>
        </header>

        <div className="jc-corpo">
          <div className="jc-palco">
            <div ref={quadro} className={`jc-quadro ${img ? 'com' : ''} ${sobre ? 'sobre' : ''}`} style={{ aspectRatio: String(proporcao) }}
              onPointerDown={baixar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
              onDoubleClick={() => { setZoom(1); setPos({ x: 0, y: 0 }) }}>
              {img ? <>{foto('jc-foto')}{sobreposto}<span className="jc-grade" aria-hidden="true" /></> : (
                <button type="button" className="jc-vazio" onClick={() => entrada.current?.click()}>
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></svg>
                  <b>{estado === 'abrindo' ? 'Abrindo a imagem…' : 'Solte a imagem aqui'}</b>
                  <small>Ou clique para escolher. JPG, PNG, WEBP ou foto do iPhone.</small>
                </button>
              )}
              {sobre && <span className="jc-solte">Solte para usar esta imagem</span>}
            </div>
            {img && (
              <div className="jc-zoom">
                <button type="button" onClick={() => mudarZoom(zoom - 0.1)} disabled={zoom <= 1} aria-label="Afastar">−</button>
                <input type="range" min={1} max={ZOOM_MAX} step={0.01} value={zoom} onChange={(e) => mudarZoom(Number(e.target.value))} aria-label="Aproximar" />
                <button type="button" onClick={() => mudarZoom(zoom + 0.1)} disabled={zoom >= ZOOM_MAX} aria-label="Aproximar">+</button>
                <button type="button" className="jc-link" onClick={() => { setZoom(1); setPos({ x: 0, y: 0 }) }}>Centralizar</button>
              </div>
            )}
          </div>

          <aside className="jc-lado">
            <div className="jc-fontes">
              <span className="jc-rot">De onde vem a imagem</span>
              <input ref={entrada} type="file" hidden accept="image/*,.heic,.heif" onChange={(e) => { void abrir(e.target.files?.[0]); e.target.value = '' }} />
              <button type="button" className="jc-fonte" onClick={() => entrada.current?.click()}><b>{img ? 'Escolher outra imagem' : 'Escolher no computador'}</b><small>Ou arraste para a janela, ou cole com ⌘V</small></button>
              {extras.map((x) => (
                <button key={x.rotulo} type="button" className="jc-fonte" disabled={estado !== 'livre'}
                  onClick={async () => { setEstado('abrindo'); setFalha(null); try { const b = await x.pegar(); setEstado('livre'); await abrir(b) } catch (e) { setFalha((e as Error).message); setEstado('livre') } }}>
                  <b>{x.rotulo}</b>
                </button>
              ))}
            </div>
            {img && (
              <div className="jc-previas">
                <span className="jc-rot">Como fica</span>
                <div className="jc-previas-par">
                  <figure><div className="jc-mini" style={{ aspectRatio: String(proporcao) }}>{foto('jc-foto')}{sobreposto}</div><figcaption>Cartão</figcaption></figure>
                  <figure className="jc-largo-fig"><div className="jc-largo"><img className="jc-largo-fundo" src={img.url} alt="" /><div className="jc-largo-poster" style={{ aspectRatio: String(proporcao) }}>{foto('jc-foto')}</div></div><figcaption>Quadro largo</figcaption></figure>
                </div>
                {legenda && <label className="jc-chave"><input type="checkbox" checked={texto} onChange={(e) => setTexto(e.target.checked)} /><span>Mostrar o título por cima</span></label>}
              </div>
            )}
            {falha && <p className="jc-falha" role="alert">{falha}</p>}
          </aside>
        </div>

        <footer className="jc-rodape">
          <small>{img ? `${img.w} × ${img.h} px${img.w < 600 ? ' · imagem pequena: pode ficar sem nitidez' : ''}` : 'A imagem é recortada no formato do cartão e reduzida sozinha.'}</small>
          <div>
            <button type="button" className="admin-secundario" onClick={aoFechar} disabled={estado === 'enviando'}>Cancelar</button>
            <button type="button" className="admin-primary" onClick={() => void usar()} disabled={!img || estado !== 'livre'}>{estado === 'enviando' ? 'Enviando…' : 'Usar esta capa'}</button>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  )
}

/** A miniatura de um vídeo do YouTube (a maior que existir). */
export async function miniaturaDoYouTube(id: string): Promise<Blob> {
  for (const nome of ['maxresdefault', 'sddefault', 'hqdefault']) {
    const r = await fetch(`https://i.ytimg.com/vi/${id}/${nome}.jpg`).catch(() => null)
    if (r?.ok) { const b = await r.blob(); if (b.size > 2000) return b }
  }
  throw new Error('Não achei a miniatura deste vídeo no YouTube.')
}

/** Baixa uma imagem que já está no ar (para reenquadrar a capa atual). */
export async function baixarImagem(src: string): Promise<Blob> {
  const r = await fetch(src, { cache: 'force-cache' })
  if (!r.ok) throw new Error('Não consegui abrir a capa atual.')
  return r.blob()
}

/** Um quadro de um vídeo MP4 (a 30% do vídeo), sem precisar abrir o player. */
export function quadroDeUmVideo(src: string, fracao = 0.3): Promise<Blob> {
  return new Promise((ok0, falha0) => {
    const v = document.createElement('video')
    const parar = () => { clearTimeout(t); v.removeAttribute('src'); v.load() }
    const ok = (b: Blob) => { parar(); ok0(b) }
    const falha = (e: Error) => { parar(); falha0(e) }
    const t = setTimeout(() => falha(new Error('O vídeo demorou demais para responder. Envie uma imagem.')), 15000)
    v.crossOrigin = 'anonymous'; v.muted = true; v.preload = 'auto'; v.playsInline = true
    const erro = () => falha(new Error('Este vídeo não permite tirar um quadro. Envie uma imagem.'))
    v.onerror = erro
    v.onloadedmetadata = () => { v.currentTime = Math.max(0.1, (Number.isFinite(v.duration) ? v.duration : 10) * fracao) }
    v.onseeked = () => {
      try {
        const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight
        c.getContext('2d')!.drawImage(v, 0, 0)
        c.toBlob((b) => (b ? ok(b) : erro()), 'image/jpeg', 0.92)
      } catch { erro() }
    }
    v.src = src
  })
}
