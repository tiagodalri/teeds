import { useEffect, useRef } from 'react'

/**
 * A barrinha do volume do microfone (19/10/2026).
 *
 * Antes, o volume vinha num estado do React atualizado a cada quadro de tela
 * (60 vezes por segundo): o painel inteiro do estúdio, e a sala de treino
 * inteira, se redesenhavam só para mexer esta barra, e o computador sentia.
 * Agora a medida mexe direto na largura da barra, 15 vezes por segundo, e
 * nada mais na tela é redesenhado.
 */
export function MedidorDeVolume({ faixa, rotulo = 'Volume do microfone' }: { faixa: MediaStreamTrack | null | undefined; rotulo?: string }) {
  const barra = useRef<HTMLElement>(null)
  const caixa = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = barra.current, cx = caixa.current
    if (!faixa || faixa.readyState === 'ended') { if (el) el.style.width = '0%'; return }
    const ctx = new AudioContext()
    const fonte = ctx.createMediaStreamSource(new MediaStream([faixa]))
    const an = ctx.createAnalyser(); an.fftSize = 512
    fonte.connect(an)
    const dados = new Uint8Array(an.fftSize)
    let ultimo = -1
    const t = window.setInterval(() => {
      an.getByteTimeDomainData(dados)
      let soma = 0
      for (let i = 0; i < dados.length; i++) { const x = (dados[i] - 128) / 128; soma += x * x }
      const nivel = Math.round(Math.min(1, Math.sqrt(soma / dados.length) * 4) * 100)
      if (nivel === ultimo) return
      ultimo = nivel
      if (el) el.style.width = `${nivel}%`
      if (cx) cx.setAttribute('aria-valuenow', String(nivel))
    }, 66)
    return () => { window.clearInterval(t); fonte.disconnect(); void ctx.close() }
  }, [faixa])
  return (
    <span ref={caixa} className="av-medidor" role="meter" aria-label={rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={0}>
      <i ref={barra} style={{ width: '0%' }} />
    </span>
  )
}
