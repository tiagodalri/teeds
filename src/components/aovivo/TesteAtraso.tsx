import { useEffect, useState } from 'react'
import { LocalVideoTrack, Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client'

/**
 * Laboratório: mede o atraso REAL do vídeo pelo nosso servidor.
 *
 * Um "apresentador" publica um canvas que pinta o relógio (milissegundos) em
 * 32 quadradinhos preto/branco; um "aluno", na mesma página, recebe o vídeo
 * pelo servidor, lê os quadradinhos e compara com o relógio. Mesmo relógio
 * dos dois lados: a diferença é o atraso de ponta a ponta (captura,
 * codificação, ida ao servidor, volta, decodificação).
 *
 * Uso: laboratorio.html?tela=aovivo-atraso#pub=<ingresso>&sub=<ingresso>
 */
const URL_SALA = 'wss://motor.globalflytrade.com'
const BITS = 32, Q = 36

export default function TesteAtraso() {
  const [log, setLog] = useState<string[]>([])
  const [medidas, setMedidas] = useState<number[]>([])
  const [rota, setRota] = useState('')
  useEffect(() => {
    const h = new URLSearchParams(location.hash.slice(1))
    const pubTok = h.get('pub'), subTok = h.get('sub')
    if (!pubTok || !subTok) { setLog(['Faltam os ingressos no endereço (#pub=…&sub=…).']); return }
    const anotar = (t: string) => setLog((l) => [...l, `${new Date().toLocaleTimeString('pt-BR')} ${t}`])
    const pub = new Room(), sub = new Room({ adaptiveStream: false })
    let parar = false
    ;(async () => {
      const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
      const c = canvas.getContext('2d')!
      const pintar = () => {
        if (parar) return
        const t = Date.now() >>> 0
        c.fillStyle = '#0b1726'; c.fillRect(0, 0, 1280, 720)
        for (let i = 0; i < BITS; i++) { c.fillStyle = (t >>> (BITS - 1 - i)) & 1 ? '#fff' : '#000'; c.fillRect(i * Q, 0, Q, Q) }
        c.fillStyle = '#9cb1c7'; c.font = '600 40px sans-serif'; c.fillText(new Date().toISOString().slice(11, 23), 40, 400)
        requestAnimationFrame(pintar)
      }
      pintar()
      await pub.connect(URL_SALA, pubTok); anotar('apresentador conectado ao nosso servidor')
      await pub.localParticipant.publishTrack(new LocalVideoTrack(canvas.captureStream(30).getVideoTracks()[0]), { source: Track.Source.ScreenShare, simulcast: false })
      anotar('apresentador transmitindo')
      sub.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Video) return
        anotar('aluno recebendo o vídeo')
        const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.autoplay = true
        v.style.width = '420px'; document.getElementById('teste-atraso-video')?.appendChild(v)
        track.attach(v)
        const leitor = document.createElement('canvas'); leitor.width = 1280; leitor.height = Q
        const lc = leitor.getContext('2d', { willReadFrequently: true })!
        const ler = () => {
          if (parar) return
          if (v.videoWidth) {
            lc.drawImage(v, 0, 0, v.videoWidth, v.videoHeight * Q / 720, 0, 0, 1280, Q)
            let n = 0
            for (let i = 0; i < BITS; i++) { const p = lc.getImageData(i * Q + Q / 2, Q / 2, 1, 1).data; n = (n * 2) + (p[0] > 128 ? 1 : 0) }
            const atraso = ((Date.now() >>> 0) - (n >>> 0)) >>> 0
            if (atraso < 5000) setMedidas((m) => [...m.slice(-299), atraso])
          }
          ;(v as any).requestVideoFrameCallback ? (v as any).requestVideoFrameCallback(ler) : setTimeout(ler, 33)
        }
        ler()
        setTimeout(async () => {
          try {
            const pc = (sub as any).engine?.pcManager?.subscriber?.getStats ? await (sub as any).engine.pcManager.subscriber.getStats() : null
            pc?.forEach((s: any) => { if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') { const l = pc.get(s.localCandidateId); setRota(`${l?.protocol?.toUpperCase()} · ida e volta ${Math.round((s.currentRoundTripTime ?? 0) * 1000)} ms`) } })
          } catch { /* sem estatística */ }
        }, 4000)
      })
      await sub.connect(URL_SALA, subTok); anotar('aluno conectado ao nosso servidor')
    })().catch((e) => anotar(`ERRO: ${e?.message ?? e}`))
    return () => { parar = true; void pub.disconnect(); void sub.disconnect() }
  }, [])
  const ord = [...medidas].sort((a, b) => a - b)
  const q = (p: number) => ord.length ? ord[Math.min(ord.length - 1, Math.floor(p * ord.length))] : 0
  return (
    <div style={{ padding: 20, display: 'grid', gap: 12, color: 'var(--text)' }}>
      <h2 style={{ margin: 0 }}>Teste de atraso da transmissão</h2>
      <p id="teste-atraso-resultado" style={{ margin: 0, fontSize: 18 }}>
        {ord.length ? `Atraso do vídeo: mediana ${q(0.5)} ms · 90% abaixo de ${q(0.9)} ms · ${ord.length} quadros medidos` : 'Medindo…'}
      </p>
      {rota && <p id="teste-atraso-rota" style={{ margin: 0 }}>Rota da mídia: {rota}</p>}
      <div id="teste-atraso-video" />
      <pre style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{log.join('\n')}</pre>
    </div>
  )
}
