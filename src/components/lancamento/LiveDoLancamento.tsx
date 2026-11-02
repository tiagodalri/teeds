/**
 * A live de lançamento dentro da GlobalFly (funil de 02/11/2026).
 *
 * O vídeo é o YouTube não listado da transmissão (o link entra pelo painel do
 * lançamento, em Administração). O servidor de vídeo próprio divide o
 * processador com as I.A. e não aguenta uma live grande; o YouTube aguenta.
 *
 * A presença é marcada a cada 30 s enquanto o vídeo está tocando (API do
 * player do YouTube). Se a API não carregar, vale a tela à mostra. É essa
 * presença que decide quem ficou até o fim.
 */
import { useEffect, useRef, useState } from 'react'
import { MARCA } from '../../marca'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { idDoYoutube, marcarPresenca, type EstadoDaLive } from '../../core/teeds/lancamento'
import { eventoDoPixel } from '../../core/teeds/pixelDoParceiro'

interface PlayerYT { destroy(): void; getPlayerState?(): number }
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, op: Record<string, unknown>) => PlayerYT }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiDoYoutube: Promise<boolean> | null = null
function carregarApi(): Promise<boolean> {
  if (window.YT?.Player) return Promise.resolve(true)
  apiDoYoutube ??= new Promise<boolean>((pronto) => {
    const antes = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => { antes?.(); pronto(true) }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    s.onerror = () => { apiDoYoutube = null; pronto(false) }
    document.head.appendChild(s)
    window.setTimeout(() => pronto(!!window.YT?.Player), 12_000)
  })
  return apiDoYoutube
}

const TOCANDO = new Set([1, 3]) // tocando, carregando

export function LiveDoLancamento({ sessao, estado, aoFechar }: {
  sessao: SessaoTeeds
  estado: EstadoDaLive
  aoFechar: () => void
}) {
  const video = idDoYoutube(estado.youtube)
  const caixa = useRef<HTMLDivElement>(null)
  const tocando = useRef(false)
  const comApi = useRef(false)
  const [marcadaEm, setMarcadaEm] = useState<number | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const [chat, setChat] = useState(() => window.matchMedia('(min-width: 1100px)').matches)

  // o player
  useEffect(() => {
    if (!video || !caixa.current) return
    let player: PlayerYT | null = null
    let vivo = true
    const alvo = document.createElement('div')
    caixa.current.replaceChildren(alvo)
    void carregarApi().then((ok) => {
      if (!vivo) return
      comApi.current = ok && !!window.YT?.Player
      if (comApi.current) {
        player = new window.YT!.Player(alvo, {
          videoId: video, width: '100%', height: '100%',
          playerVars: { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1 },
          events: {
            onStateChange: (e: { data: number }) => {
              const antes = tocando.current
              tocando.current = TOCANDO.has(e.data)
              if (tocando.current && !antes) void marcar()
            },
          },
        })
      } else {
        const f = document.createElement('iframe')
        f.src = `https://www.youtube.com/embed/${video}?autoplay=1&playsinline=1&rel=0&modestbranding=1`
        f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'
        f.allowFullscreen = true
        f.title = 'Live de lançamento'
        caixa.current?.replaceChildren(f)
      }
    })
    return () => { vivo = false; try { player?.destroy() } catch { /* já fechou */ } }
  }, [video]) // eslint-disable-line react-hooks/exhaustive-deps

  async function marcar() {
    const vale = comApi.current ? tocando.current : document.visibilityState === 'visible'
    if (!vale) return
    try { if (await marcarPresenca(sessao)) { setMarcadaEm(Date.now()); eventoDoPixel('AssistiuLive', undefined, true) } } catch { /* tenta de novo em 30 s */ }
  }

  // a cada 30 s, enquanto a live toca
  useEffect(() => {
    const t = window.setInterval(() => { setAgora(Date.now()); void marcar() }, 30_000)
    const r = window.setInterval(() => setAgora(Date.now()), 5_000)
    return () => { window.clearInterval(t); window.clearInterval(r) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Esc fecha
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])

  const presente = marcadaEm !== null && agora - marcadaEm < 75_000
  const dominio = location.hostname

  return (
    <div className="tl-live tl-livre" role="dialog" aria-modal="true" aria-label="Live de lançamento">
      <header className="tl-live-topo">
        <span className="tl-selo tl-selo-vivo"><i aria-hidden="true" />Ao vivo</span>
        <b className="tl-live-titulo">Live de lançamento da {MARCA.prosa}</b>
        <span className={`tl-presenca${presente ? ' ok' : ''}`} role="status">
          <i aria-hidden="true" />{presente ? 'Presença marcada' : 'Dê o play para marcar a presença'}
        </span>
        <span className="tl-live-acoes">
          {video && <button type="button" className="tl-botao tl-botao-calmo tl-so-pc" onClick={() => setChat((c) => !c)}>{chat ? 'Esconder chat' : 'Mostrar chat'}</button>}
          <button type="button" className="tl-botao tl-botao-calmo" onClick={aoFechar}>Sair da live</button>
        </span>
      </header>
      <div className={`tl-live-corpo${chat && video ? ' com-chat' : ''}`}>
        <div className="tl-live-video">
          {video ? <div className="tl-live-player" ref={caixa} /> : (
            <div className="tl-live-espera"><b>A transmissão abre em instantes</b><span>Deixe esta tela aberta. O vídeo aparece aqui sozinho.</span></div>
          )}
          <p className="tl-live-nota">Fique até o fim: a {MARCA.prosa} é liberada para quem assistir à live inteira. Com esta tela fechada ou o vídeo pausado, a presença para de ser marcada.</p>
        </div>
        {chat && video && (
          <iframe className="tl-live-chat tl-so-pc" title="Chat da live"
            src={`https://www.youtube.com/live_chat?v=${video}&embed_domain=${encodeURIComponent(dominio)}`} />
        )}
      </div>
    </div>
  )
}
