import { useEffect, useRef, useState } from 'react'
import { LocalVideoTrack } from 'livekit-client'
import { BackgroundProcessor } from '@livekit/track-processors'
import { ProcessadorDeFundo } from '../../core/live/recorte/ProcessadorDeFundo'
import { imagemDoFundo } from '../../core/live/fundos'

/**
 * Laboratório do recorte: a mesma câmera, lado a lado, no recorte da
 * biblioteca (antigo) e no da casa (novo). ?tela=recorte&fundo=<id>&modo=desfoque
 */
function Saida({ faixa, titulo }: { faixa: MediaStreamTrack | null; titulo: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current && faixa) ref.current.srcObject = new MediaStream([faixa]) }, [faixa])
  return (
    <figure style={{ margin: 0, display: 'grid', gap: 6 }}>
      <video ref={ref} autoPlay playsInline muted style={{ width: '100%', aspectRatio: '16 / 9', background: '#000', borderRadius: 10 }} />
      <figcaption style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 700 }}>{titulo}</figcaption>
    </figure>
  )
}

export default function LabRecorte() {
  const [orig, setOrig] = useState<MediaStreamTrack | null>(null)
  const [antigo, setAntigo] = useState<MediaStreamTrack | null>(null)
  const [novo, setNovo] = useState<MediaStreamTrack | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    const q = new URLSearchParams(location.search)
    const fundo = q.get('fundo') ?? 'monograma-gf'
    const desfoque = q.get('modo') === 'desfoque'
    const url = imagemDoFundo(fundo)
    let vivo = true
    ;(async () => {
      const f = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
      const t = f.getVideoTracks()[0]
      if (!vivo) return
      setOrig(t)
      const a = new LocalVideoTrack(t.clone(), undefined, true)
      await a.setProcessor(BackgroundProcessor(desfoque ? { mode: 'background-blur', blurRadius: 14 } : { mode: 'virtual-background', imagePath: url }))
      setAntigo(a.mediaStreamTrack)
      const n = new LocalVideoTrack(t.clone(), undefined, true)
      const proc = new ProcessadorDeFundo(desfoque ? { modo: 'desfoque' } : { modo: 'imagem', url })
      ;(window as unknown as { __recorte: unknown }).__recorte = proc
      await n.setProcessor(proc)
      setNovo(n.mediaStreamTrack)
    })().catch((e) => setErro(String(e?.message ?? e)))
    return () => { vivo = false }
  }, [])
  return (
    <div style={{ padding: 20, display: 'grid', gap: 14 }}>
      {erro && <p style={{ color: 'var(--down)' }}>{erro}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <Saida faixa={orig} titulo="Câmera original" />
        <Saida faixa={antigo} titulo="Recorte antigo (biblioteca)" />
        <Saida faixa={novo} titulo="Recorte novo (GlobalFly)" />
      </div>
    </div>
  )
}
