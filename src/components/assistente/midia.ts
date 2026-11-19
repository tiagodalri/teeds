import { useEffect, useRef, useState } from 'react'

/**
 * Áudio, foto e vídeo no Assistente (19/11/2026, Tiago: "mandar áudio, mandar imagem, mandar vídeo… se eu
 * mandar um áudio 'opera com Raptor, entrada de 1, meta de 10 e stop de 20', tem que virar operação").
 *
 * Tudo sai daqui já pequeno: o servidor que recebe é o mesmo que roda as I.A. dos clientes, com teto de
 * 2 MB por pedido (um pedido gigante já derrubou o motor). Por isso:
 *  - áudio: gravado em Opus (Chrome) ou AAC (iPhone), até 2 minutos (~0,5 MB);
 *  - foto: redesenhada em JPEG de no máximo 1600 px;
 *  - vídeo: não sobe inteiro (vídeo de celular passa de 20 MB). A tela tira 8 quadros espalhados pelo vídeo
 *    e manda só eles — é o que a I.A. precisa para ver o que aconteceu. O som do vídeo não vai.
 */

export const TETO_ENVIO = 1_700_000 // base64 somado, abaixo do 1,9 MB que o servidor aceita no chat
export const MAX_GRAVACAO_S = 120
export const MAX_IMAGENS = 6
const QUADROS_DO_VIDEO = 8

export function paraBase64(blob: Blob): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result).split(',')[1] ?? '')
    r.onerror = () => falha(new Error('Não consegui ler o arquivo.'))
    r.readAsDataURL(blob)
  })
}

function desenhar(fonte: CanvasImageSource, largura: number, altura: number, max: number, qualidade: number): Promise<Blob> {
  const escala = Math.min(1, max / Math.max(largura, altura))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(largura * escala))
  c.height = Math.max(1, Math.round(altura * escala))
  const g = c.getContext('2d')!
  g.fillStyle = '#fff'
  g.fillRect(0, 0, c.width, c.height)
  g.drawImage(fonte, 0, 0, c.width, c.height)
  return new Promise((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui preparar a imagem.'))), 'image/jpeg', qualidade))
}

async function carregarImagem(arquivo: Blob): Promise<{ fonte: CanvasImageSource; largura: number; altura: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const b = await createImageBitmap(arquivo)
      return { fonte: b, largura: b.width, altura: b.height }
    } catch { /* cai no <img> (Safari antigo) */ }
  }
  const url = URL.createObjectURL(arquivo)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    return { fonte: img, largura: img.naturalWidth, altura: img.naturalHeight }
  } catch {
    throw new Error('Este formato de imagem não abre aqui. Mande em JPG ou PNG (um print da tela serve).')
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

/** A foto em JPEG, do tamanho que cabe no envio. */
export async function imagemPronta(arquivo: Blob, max = 1600, qualidade = 0.82): Promise<Blob> {
  const { fonte, largura, altura } = await carregarImagem(arquivo)
  return desenhar(fonte, largura, altura, max, qualidade)
}

/** 8 quadros espalhados pelo vídeo (e o 1º serve de capa), com a duração. */
export async function quadrosDoVideo(arquivo: Blob): Promise<{ quadros: Blob[]; duracao: number }> {
  const url = URL.createObjectURL(arquivo)
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = url
  try {
    await new Promise<void>((ok, falha) => {
      v.onloadeddata = () => ok()
      v.onerror = () => falha(new Error('Este vídeo não abre aqui. Tente um vídeo gravado pelo celular (MP4 ou MOV).'))
      setTimeout(() => falha(new Error('O vídeo demorou demais para abrir.')), 20_000)
    })
    const duracao = Number.isFinite(v.duration) ? v.duration : 0
    const quadros: Blob[] = []
    const n = duracao > 1 ? QUADROS_DO_VIDEO : 1
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0 : (duracao * (i + 0.5)) / n
      if (Math.abs(v.currentTime - t) > 0.01) {
        await new Promise<void>((ok) => {
          const fim = () => { v.removeEventListener('seeked', fim); ok() }
          v.addEventListener('seeked', fim)
          v.currentTime = t
          setTimeout(fim, 4000)
        })
      }
      quadros.push(await desenhar(v, v.videoWidth || 640, v.videoHeight || 360, 720, 0.7))
    }
    return { quadros, duracao }
  } finally {
    v.removeAttribute('src')
    v.load()
    URL.revokeObjectURL(url)
  }
}

export const relogio = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/* ------------------------------------------------------------------ o gravador */

const FORMATOS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/aac']

export type Gravacao = { blob: Blob; mime: string; duracao: number; ondas: number[] }

/**
 * O microfone: grava, mostra o nível ao vivo (as barrinhas que mexem) e devolve o áudio com um resumo da
 * onda para o balão. Para sozinho nos 2 minutos.
 */
export function useGravador(aoPassarDoTempo: () => void) {
  const [gravando, setGravando] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const [niveis, setNiveis] = useState<number[]>([])
  const estado = useRef<{
    rec: MediaRecorder; fluxo: MediaStream; ctx: AudioContext | null; pedacos: Blob[]; inicio: number
    todas: number[]; quadro: number; relogio: number; mime: string
  } | null>(null)
  const passou = useRef(aoPassarDoTempo)
  passou.current = aoPassarDoTempo

  const suportado = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  function soltar() {
    const e = estado.current
    if (!e) return
    cancelAnimationFrame(e.quadro)
    clearInterval(e.relogio)
    e.fluxo.getTracks().forEach((t) => t.stop())
    void e.ctx?.close().catch(() => undefined)
    estado.current = null
    setGravando(false)
  }
  useEffect(() => soltar, [])

  async function comecar() {
    if (estado.current) return
    let fluxo: MediaStream
    try {
      fluxo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (e) {
      const nome = (e as Error).name
      throw new Error(nome === 'NotAllowedError' || nome === 'SecurityError'
        ? 'O navegador não deixou usar o microfone. Libere o microfone para este site (no cadeado ao lado do endereço) e tente de novo.'
        : 'Não achei um microfone neste aparelho.')
    }
    const mime = FORMATOS.find((f) => MediaRecorder.isTypeSupported?.(f)) ?? ''
    const rec = new MediaRecorder(fluxo, mime ? { mimeType: mime, audioBitsPerSecond: 32_000 } : undefined)
    const pedacos: Blob[] = []
    rec.ondataavailable = (ev) => { if (ev.data.size) pedacos.push(ev.data) }

    // o nível ao vivo
    let ctx: AudioContext | null = null
    let analisador: AnalyserNode | null = null
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctx()
      analisador = ctx.createAnalyser()
      analisador.fftSize = 512
      ctx.createMediaStreamSource(fluxo).connect(analisador)
    } catch { ctx = null }
    const buf = analisador ? new Uint8Array(analisador.fftSize) : null
    const todas: number[] = []
    let ultimo = 0
    const medir = (agora: number) => {
      const e = estado.current
      if (!e) return
      if (analisador && buf && agora - ultimo > 70) {
        ultimo = agora
        analisador.getByteTimeDomainData(buf)
        let soma = 0
        for (const x of buf) soma += ((x - 128) / 128) ** 2
        const nivel = Math.min(1, Math.sqrt(soma / buf.length) * 4.2)
        todas.push(nivel)
        setNiveis((a) => [...a.slice(-39), nivel])
      }
      e.quadro = requestAnimationFrame(medir)
    }
    rec.start(250)
    const inicio = Date.now()
    estado.current = {
      rec, fluxo, ctx, pedacos, inicio, todas, mime: rec.mimeType || mime || 'audio/webm',
      quadro: requestAnimationFrame(medir),
      relogio: window.setInterval(() => {
        const s = (Date.now() - inicio) / 1000
        setSegundos(s)
        if (s >= MAX_GRAVACAO_S) passou.current()
      }, 200),
    }
    setSegundos(0)
    setNiveis([])
    setGravando(true)
  }

  /** Para e devolve o áudio (null se nem chegou a gravar meio segundo). */
  async function terminar(): Promise<Gravacao | null> {
    const e = estado.current
    if (!e) return null
    const duracao = (Date.now() - e.inicio) / 1000
    await new Promise<void>((ok) => { e.rec.onstop = () => ok(); try { e.rec.stop() } catch { ok() } })
    const { pedacos, mime, todas } = e
    soltar()
    if (duracao < 0.6 || !pedacos.length) return null
    // a onda do balão: 36 barras, a média de cada trecho
    const ondas = Array.from({ length: 36 }, (_, i) => {
      const fatia = todas.slice(Math.floor((i * todas.length) / 36), Math.floor(((i + 1) * todas.length) / 36))
      return fatia.length ? fatia.reduce((s, x) => s + x, 0) / fatia.length : 0.08
    })
    return { blob: new Blob(pedacos, { type: mime }), mime, duracao, ondas }
  }

  function cancelar() {
    const e = estado.current
    if (!e) return
    try { e.rec.stop() } catch { /* já parado */ }
    soltar()
  }

  return { suportado, gravando, segundos, niveis, comecar, terminar, cancelar }
}
