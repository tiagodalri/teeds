import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Mensagem de voz do chat da equipe (17/11/2026). Grava com o MediaRecorder
 * (AAC em .m4a quando o navegador sabe, que toca em todo lugar; senão Opus em
 * .webm) e mede o volume a cada 100 ms para desenhar a onda do balão.
 */
export interface Gravacao { blob: Blob; duracao: number; ondas: number[] }
export type EstadoDoGravador = 'parado' | 'pedindo' | 'gravando'

export const MAXIMO_DE_AUDIO_S = 5 * 60
const BARRAS = 48

const TIPOS = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus']
const tipoQueGrava = () => (typeof MediaRecorder === 'undefined' ? undefined : TIPOS.find((t) => { try { return MediaRecorder.isTypeSupported(t) } catch { return false } }))
export const gravaAudio = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined'

/** As amostras de volume viram 48 barrinhas de 2 a 31. */
export function ondasDe(amostras: number[], barras = BARRAS): number[] {
  if (!amostras.length) return Array(barras).fill(3)
  const out: number[] = []
  for (let i = 0; i < barras; i++) {
    const de = Math.floor((i * amostras.length) / barras)
    const ate = Math.max(de + 1, Math.floor(((i + 1) * amostras.length) / barras))
    const fatia = amostras.slice(de, ate)
    out.push(fatia.reduce((s, x) => s + x, 0) / fatia.length)
  }
  const max = Math.max(...out, 0.02)
  return out.map((v) => Math.max(2, Math.min(31, Math.round((v / max) * 31))))
}

export function useGravador(aoPassarDoLimite: () => void) {
  const [estado, setEstado] = useState<EstadoDoGravador>('parado')
  const [segundos, setSegundos] = useState(0)
  const [nivel, setNivel] = useState(0)
  const r = useRef<{
    rec: MediaRecorder | null; stream: MediaStream | null; ctx: AudioContext | null; pedacos: Blob[]; amostras: number[]
    inicio: number; relogio: number | null; cancelado: boolean; fim: ((g: Gravacao | null) => void) | null
  }>({ rec: null, stream: null, ctx: null, pedacos: [], amostras: [], inicio: 0, relogio: null, cancelado: false, fim: null })
  const limite = useRef(aoPassarDoLimite)
  limite.current = aoPassarDoLimite

  const soltar = useCallback(() => {
    const x = r.current
    if (x.relogio) { clearInterval(x.relogio); x.relogio = null }
    x.stream?.getTracks().forEach((t) => t.stop()); x.stream = null
    void x.ctx?.close().catch(() => undefined); x.ctx = null
    x.rec = null
    setEstado('parado'); setSegundos(0); setNivel(0)
  }, [])

  /** Liga o microfone. Chame direto do toque (o iPhone exige). Falso: sem permissão ou sem suporte. */
  const iniciar = useCallback(async (): Promise<boolean> => {
    const x = r.current
    if (x.rec || estado !== 'parado') return false
    if (!gravaAudio()) throw new Error('Este navegador não grava áudio.')
    setEstado('pedindo')
    x.cancelado = false; x.pedacos = []; x.amostras = []
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    } catch (e) {
      setEstado('parado')
      const nome = (e as { name?: string }).name
      throw new Error(nome === 'NotAllowedError' ? 'O microfone está bloqueado. Libere o microfone para o app nos ajustes do aparelho.' : 'Não consegui ligar o microfone.')
    }
    // soltou antes de o microfone ligar (a permissão demorou): não grava
    if (x.cancelado) { stream.getTracks().forEach((t) => t.stop()); setEstado('parado'); return false }
    x.stream = stream
    const tipo = tipoQueGrava()
    const rec = new MediaRecorder(stream, { ...(tipo ? { mimeType: tipo } : {}), audioBitsPerSecond: 48_000 })
    x.rec = rec
    rec.ondataavailable = (e) => { if (e.data.size) x.pedacos.push(e.data) }
    rec.onstop = () => {
      const duracao = Math.max(1, Math.round((Date.now() - x.inicio) / 1000))
      const blob = new Blob(x.pedacos, { type: (rec.mimeType || tipo || 'audio/mp4').split(';')[0] })
      const ondas = ondasDe(x.amostras)
      const fim = x.fim; x.fim = null
      const cancelado = x.cancelado
      soltar()
      fim?.(cancelado || !blob.size ? null : { blob, duracao, ondas })
    }
    // o volume, para a onda
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const fonte = ctx.createMediaStreamSource(stream)
      const an = ctx.createAnalyser(); an.fftSize = 512
      fonte.connect(an)
      x.ctx = ctx
      const buf = new Uint8Array(an.fftSize)
      x.relogio = window.setInterval(() => {
        an.getByteTimeDomainData(buf)
        let soma = 0
        for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; soma += v * v }
        const rms = Math.sqrt(soma / buf.length)
        x.amostras.push(rms); setNivel(Math.min(1, rms * 4))
        const s = Math.floor((Date.now() - x.inicio) / 1000)
        setSegundos(s)
        if (s >= MAXIMO_DE_AUDIO_S) limite.current()
      }, 100)
    } catch {
      x.relogio = window.setInterval(() => {
        const s = Math.floor((Date.now() - x.inicio) / 1000)
        setSegundos(s); x.amostras.push(0.3)
        if (s >= MAXIMO_DE_AUDIO_S) limite.current()
      }, 100)
    }
    x.inicio = Date.now()
    rec.start(250)
    setEstado('gravando')
    try { navigator.vibrate?.(12) } catch { /* sem vibração */ }
    return true
  }, [estado, soltar])

  /** Para e devolve o áudio (nulo se foi curto demais). */
  const parar = useCallback((): Promise<Gravacao | null> => new Promise((ok) => {
    const x = r.current
    if (!x.rec) { x.cancelado = true; ok(null); return }
    x.fim = ok
    try { x.rec.requestData() } catch { /* nada */ }
    try { x.rec.stop() } catch { soltar(); ok(null) }
  }), [soltar])

  const cancelar = useCallback(() => {
    const x = r.current
    x.cancelado = true
    if (!x.rec) { if (estado !== 'parado') setEstado('parado'); return }
    x.fim = null
    try { x.rec.stop() } catch { soltar() }
  }, [estado, soltar])

  useEffect(() => () => { r.current.cancelado = true; try { r.current.rec?.stop() } catch { /* nada */ } ; r.current.stream?.getTracks().forEach((t) => t.stop()) }, [])

  return { estado, segundos, nivel, iniciar, parar, cancelar }
}
