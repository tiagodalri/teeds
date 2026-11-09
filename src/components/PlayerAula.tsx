import { useCallback, useEffect, useRef, useState } from 'react'
import './aulas/sala-de-aula.css'

/**
 * O player da sala de aula, com os próprios controles.
 *
 * O `<video>` nativo funciona, mas veste a cara do navegador: barra cinza,
 * menu de três pontos, nada da marca. Aqui os controles são nossos — barra
 * na cor do módulo, velocidade, atalhos de teclado, tela cheia — e o player
 * sabe o que uma aula precisa: retomar de onde parou, avisar quando foi
 * assistida e puxar a próxima quando termina.
 *
 * 08/11/2026 (Tiago subiu as aulas da GlobalFly no YouTube): o mesmo player
 * toca YouTube. Os controles do YouTube ficam escondidos (controls=0) e os
 * nossos mandam no vídeo pela API do player; uma película por cima do
 * quadro segura o clique, para ninguém sair da aula para o YouTube. Como a
 * API diz o tempo a cada instante, a medição de quem assistiu (segundos de
 * verdade, até onde chegou, concluída) vale igual ao MP4.
 * Vimeo continua em iframe com os controles dele.
 */

export interface ProximaAula { titulo: string; abrir: () => void }

interface Props {
  /** O arquivo (.mp4). Com `youtube`, fica vazio. */
  src: string
  /** O id do vídeo no YouTube: toca pelo YouTube com os nossos controles. */
  youtube?: string
  /** Volta ao começo sozinho quando termina (ex.: depoimentos). */
  repetir?: boolean
  /** Vídeo em pé (9:16): o corte que esconde os botões do YouTube vai para as laterais. */
  vertical?: boolean
  titulo: string
  /** Onde a pessoa parou da última vez (segundos); 0 = do começo. */
  posicaoInicial?: number
  /** Chamado de tempos em tempos com a fração assistida (0..1) e o tempo em segundos. */
  aoAvancar?: (fracao: number, segundos: number) => void
  aoTocar?: (tocando: boolean) => void
  proxima?: ProximaAula | null
  /** O texto do quadro final quando não há próxima aula (padrão: fim do curso). */
  textoDoFim?: string
  /** Pular para um ponto do vídeo (os tópicos da aula). `vez` muda a cada clique, para repetir o mesmo ponto. */
  pularPara?: { segundos: number; vez: number } | null
  /** Vídeo obrigatório (pop-up de boas-vindas, 08/11/2026, pedido do Victor): começa sozinho
   *  (sem som se o navegador não deixar, com o aviso para ativar), sem pular, sem adiantar e sem velocidade. */
  obrigatorio?: boolean
  /** O vídeo chegou ao fim. */
  aoTerminar?: () => void
  /** O vídeo não abriu (quem chama não pode deixar a pessoa presa). */
  aoErro?: () => void
}

const VELOCIDADES = [1, 1.25, 1.5, 2]
const CONTAGEM = 5
type VideoSafari = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
}

/** O que os controles pedem ao vídeo, seja o <video> ou o player do YouTube. */
interface Motor {
  tocar(): void
  pausar(): void
  parado(): boolean
  terminou(): boolean
  tempo(): number
  duracao(): number
  ir(segundos: number): void
  mudo(): boolean
  silenciar(m: boolean): void
  velocidade(x: number): void
}

interface PlayerYT {
  playVideo(): void; pauseVideo(): void; seekTo(s: number, longe: boolean): void
  getCurrentTime(): number; getDuration(): number; getPlayerState(): number; getVideoLoadedFraction(): number
  mute(): void; unMute(): void; isMuted(): boolean; setPlaybackRate(x: number): void; destroy(): void
}
// sem "Window &": a live de lançamento já declara um YT mais curto na janela
type JanelaComYT = {
  YT?: { Player: new (el: HTMLElement, op: Record<string, unknown>) => PlayerYT }
  onYouTubeIframeAPIReady?: () => void
}
let apiDoYoutube: Promise<boolean> | null = null
function carregarApiDoYoutube(): Promise<boolean> {
  const w = window as unknown as JanelaComYT
  if (w.YT?.Player) return Promise.resolve(true)
  apiDoYoutube ??= new Promise<boolean>((pronto) => {
    const antes = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => { antes?.(); pronto(true) }
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const s = document.createElement('script')
      s.src = 'https://www.youtube.com/iframe_api'
      s.async = true
      s.onerror = () => { apiDoYoutube = null; s.remove(); pronto(false) }
      document.head.appendChild(s)
    }
    window.setTimeout(() => { if (!w.YT?.Player) apiDoYoutube = null; pronto(!!w.YT?.Player) }, 15_000)
  })
  return apiDoYoutube
}
// estados do player do YouTube
const YT_FIM = 0, YT_TOCANDO = 1, YT_PAUSADO = 2, YT_CARREGANDO = 3

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60), r = Math.floor(s % 60)
  const h = Math.floor(m / 60)
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

export function PlayerAula({ src, youtube, repetir = false, vertical = false, textoDoFim = 'Você chegou ao fim do curso.', titulo, posicaoInicial = 0, aoAvancar, aoTocar, proxima, pularPara, obrigatorio = false, aoTerminar, aoErro }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const quadroYT = useRef<HTMLDivElement>(null)
  const yt = useRef<PlayerYT | null>(null)
  const ehYT = !!youtube
  const [jaTocou, setJaTocou] = useState(false)
  const [erroVideo, setErroVideo] = useState('')
  const [cheiaFalsa, setCheiaFalsa] = useState(false)
  const barra = useRef<HTMLDivElement>(null)
  const [tocando, setTocando] = useState(false)
  const [tempo, setTempo] = useState(0)
  const [duracao, setDuracao] = useState(0)
  const [carregado, setCarregado] = useState(0)
  const [mudo, setMudo] = useState(false)
  const [velocidade, setVelocidade] = useState(1)
  const [menuVel, setMenuVel] = useState(false)
  const [cheia, setCheia] = useState(false)
  const [erroCheia, setErroCheia] = useState('')
  const [visivel, setVisivel] = useState(true)
  const [esperando, setEsperando] = useState(false)
  const [acabou, setAcabou] = useState(false)
  const [contagem, setContagem] = useState<number | null>(null)
  const [arrastando, setArrastando] = useState(false)
  const sumir = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retomou = useRef(false)
  // tocou sem som porque o navegador não deixou com som: o aviso "Toque para ativar o som"
  const [precisaSom, setPrecisaSom] = useState(false)
  const obrig = useRef(obrigatorio); obrig.current = obrigatorio
  const pessoaSilenciou = useRef(false)

  /* ------------------------------------- o motor: <video> ou YouTube */
  const motor = useRef<Motor | null>(null)
  if (!ehYT) {
    motor.current = {
      tocar: () => { const v = video.current; if (v) void v.play().catch(() => undefined) },
      pausar: () => video.current?.pause(),
      parado: () => video.current?.paused ?? true,
      terminou: () => video.current?.ended ?? false,
      tempo: () => video.current?.currentTime ?? 0,
      duracao: () => video.current?.duration || 0,
      ir: (x) => { const v = video.current; if (v) v.currentTime = x },
      mudo: () => video.current?.muted ?? false,
      silenciar: (m) => { const v = video.current; if (v) v.muted = m },
      velocidade: (x) => { const v = video.current; if (v) v.playbackRate = x },
    }
  } else {
    // yt.current só existe depois do onReady: antes disso os comandos não fazem nada
    const p = () => yt.current
    motor.current = {
      tocar: () => p()?.playVideo?.(),
      pausar: () => p()?.pauseVideo?.(),
      parado: () => { const e = p()?.getPlayerState?.(); return e !== YT_TOCANDO && e !== YT_CARREGANDO },
      terminou: () => p()?.getPlayerState?.() === YT_FIM,
      tempo: () => p()?.getCurrentTime?.() ?? 0,
      duracao: () => p()?.getDuration?.() || 0,
      // pausado, o relógio não lê o tempo: a barra acompanha o pulo aqui
      ir: (x) => { const y = p(); if (!y?.seekTo) return; y.seekTo(x, true); setTempo(x) },
      mudo: () => p()?.isMuted?.() ?? false,
      silenciar: (m) => { const y = p(); if (y) { if (m) y.mute?.(); else y.unMute?.() } },
      velocidade: (x) => p()?.setPlaybackRate?.(x),
    }
  }

  // um tópico da aula foi clicado: o vídeo vai até ele e toca
  useEffect(() => {
    const m = motor.current
    if (!m || !pularPara) return
    m.ir(Math.max(0, pularPara.segundos))
    m.tocar()
  }, [pularPara])

  /* ------------------------------------------------ controles somem sozinhos */
  const acordar = useCallback(() => {
    setVisivel(true)
    if (sumir.current) clearTimeout(sumir.current)
    sumir.current = setTimeout(() => { if (motor.current && !motor.current.parado()) setVisivel(false) }, 2600)
  }, [])
  useEffect(() => () => { if (sumir.current) clearTimeout(sumir.current) }, [])

  /* ------------------------------------------------------------- ações */
  const alternar = useCallback(() => {
    const m = motor.current; if (!m) return
    if (m.terminou()) m.ir(0)
    if (m.parado()) m.tocar(); else m.pausar()
    acordar()
  }, [acordar])
  const pular = useCallback((s: number) => {
    const m = motor.current; if (!m) return
    const d = m.duracao()
    m.ir(Math.min(Math.max(0, m.tempo() + s), d || m.tempo() + s)); acordar()
  }, [acordar])
  const irPara = (fracao: number) => {
    const m = motor.current; if (!m) return
    const d = m.duracao(); if (!d) return
    const x = Math.min(Math.max(0, fracao), 1) * d
    m.ir(x)
    setTempo(x)
  }
  const rever = () => { const m = motor.current; if (m) { m.ir(0); m.tocar() } }
  const telaCheia = useCallback(async () => {
    const c = caixa.current
    if (!c) return
    if (ehYT) {
      // YouTube: a caixa inteira vai para a tela cheia (os nossos controles juntos).
      // iPhone não deixa um elemento qualquer ir para a tela cheia: ocupa a janela toda.
      setErroCheia('')
      try {
        if (document.fullscreenElement) await document.exitFullscreen()
        else if (cheiaFalsa) setCheiaFalsa(false)
        else if (c.requestFullscreen && document.fullscreenEnabled) await c.requestFullscreen()
        else setCheiaFalsa(true)
      } catch { setCheiaFalsa((x) => !x) }
      return
    }
    const v = video.current as VideoSafari | null
    if (!v) return
    setErroCheia('')
    try {
      if (v.webkitDisplayingFullscreen && v.webkitExitFullscreen) v.webkitExitFullscreen()
      else if (document.fullscreenElement) await document.exitFullscreen()
      else if (v.webkitEnterFullscreen && !document.fullscreenEnabled) v.webkitEnterFullscreen()
      else if (c.requestFullscreen) {
        try { await c.requestFullscreen() }
        catch (erro) { if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); else throw erro }
      } else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen()
      else throw new Error('Fullscreen indisponível')
    } catch {
      v.controls = true
      setErroCheia('Não foi possível abrir a tela cheia. Inicie o vídeo e tente novamente pelos controles do vídeo.')
      setVisivel(true)
    }
  }, [ehYT, cheiaFalsa])
  const mudar = useCallback(() => { const m = motor.current; if (m) { const novo = !m.mudo(); m.silenciar(novo); setMudo(novo); pessoaSilenciou.current = novo; if (!novo) setPrecisaSom(false) } }, [])
  const ativarSom = () => { const m = motor.current; if (!m) return; m.silenciar(false); setMudo(false); setPrecisaSom(false); if (m.parado()) m.tocar(); acordar() }
  const trocarVelocidade = (x: number) => { motor.current?.velocidade(x); setVelocidade(x); setMenuVel(false) }

  /* -------------------------------------------- eventos (os dois motores) */
  // Os avisos do vídeo chamam sempre a versão atual destas funções: o player do
  // YouTube não pode nascer de novo a cada desenho da tela.
  const retomar = () => {
    const m = motor.current, d = m?.duracao() ?? 0
    // Retoma de onde parou, mas não se a pessoa já tinha praticamente terminado.
    if (m && !retomou.current && d && posicaoInicial > 5 && posicaoInicial < d * 0.95) m.ir(posicaoInicial)
    if (d) retomou.current = true
  }
  const ev = useRef({ tempo: () => {}, meta: () => {}, carregou: (_s: number) => {}, tocar: () => {}, pausar: () => {}, fim: () => {}, esperar: () => {}, seguir: () => {} })
  ev.current = {
    tempo: () => {
      const m = motor.current; if (!m) return
      const t = m.tempo(), d = m.duracao()
      setTempo(t)
      if (d) aoAvancar?.(t / d, t)
    },
    meta: () => { const d = motor.current?.duracao() ?? 0; if (d) setDuracao(d); if (!ehYT) retomar() },
    carregou: (seg: number) => setCarregado(seg),
    tocar: () => {
      setTocando(true); setJaTocou(true); setAcabou(false); setContagem(null); setEsperando(false); aoTocar?.(true); acordar()
      if (ehYT) { const d = motor.current?.duracao() ?? 0; if (d) setDuracao(d); retomar() }
    },
    pausar: () => { setTocando(false); setVisivel(true); aoTocar?.(false) },
    fim: () => {
      if (repetir) { motor.current?.ir(0); motor.current?.tocar(); return }
      setTocando(false); setAcabou(true); setVisivel(true); aoTocar?.(false); if (proxima) setContagem(CONTAGEM)
      if (obrigatorio) {
        // o botão de fechar aparece fora do vídeo: sai da tela cheia para ele ficar à vista
        setCheiaFalsa(false)
        if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
      }
      aoTerminar?.()
    },
    esperar: () => setEsperando(true),
    seguir: () => setEsperando(false),
  }

  // MP4: os eventos do <video>
  useEffect(() => {
    const v = video.current; if (!v || ehYT) return
    const e = () => ev.current
    const aoTempo = () => e().tempo()
    const aoMeta = () => e().meta()
    const aoProgresso = () => { try { if (v.buffered.length) e().carregou(v.buffered.end(v.buffered.length - 1)) } catch { /* nada */ } }
    const aoTocar_ = () => e().tocar()
    const aoPausar = () => { if (!v.ended) e().pausar() }
    const aoFim = () => e().fim()
    const aoEsperar = () => e().esperar()
    const aoSeguir = () => e().seguir()
    v.addEventListener('timeupdate', aoTempo); v.addEventListener('loadedmetadata', aoMeta); v.addEventListener('durationchange', aoMeta)
    v.addEventListener('progress', aoProgresso); v.addEventListener('play', aoTocar_); v.addEventListener('pause', aoPausar)
    v.addEventListener('ended', aoFim); v.addEventListener('waiting', aoEsperar); v.addEventListener('playing', aoSeguir); v.addEventListener('canplay', aoSeguir)
    return () => {
      v.removeEventListener('timeupdate', aoTempo); v.removeEventListener('loadedmetadata', aoMeta); v.removeEventListener('durationchange', aoMeta)
      v.removeEventListener('progress', aoProgresso); v.removeEventListener('play', aoTocar_); v.removeEventListener('pause', aoPausar)
      v.removeEventListener('ended', aoFim); v.removeEventListener('waiting', aoEsperar); v.removeEventListener('playing', aoSeguir); v.removeEventListener('canplay', aoSeguir)
    }
  }, [src, ehYT])

  // YouTube: o player da API, com os controles dele escondidos; o tempo é lido 4x por segundo
  useEffect(() => {
    if (!youtube || !quadroYT.current) return
    let vivo = true
    let relogio = 0
    let criado: PlayerYT | null = null
    const alvo = document.createElement('div')
    quadroYT.current.replaceChildren(alvo)
    setErroVideo('')
    void carregarApiDoYoutube().then((ok) => {
      const w = window as unknown as JanelaComYT
      if (!vivo) return
      if (!ok || !w.YT?.Player) { setErroVideo('O vídeo não carregou. Confira a sua internet e abra a aula de novo.'); return }
      criado = new w.YT.Player(alvo, {
        videoId: youtube, width: '100%', height: '100%',
        host: 'https://www.youtube-nocookie.com',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, modestbranding: 1, playsinline: 1, rel: 0, cc_load_policy: 0, origin: window.location.origin },
        events: {
          onReady: (e: { target: PlayerYT }) => {
            if (!vivo) return
            yt.current = e.target
            ev.current.meta()
            if (obrig.current) {
              // obrigatório: toca sozinho; se o navegador barrar o som, toca mudo e pede o toque para ouvir
              e.target.playVideo()
              const conferir = () => {
                const p = yt.current; if (!vivo || !p?.getPlayerState) return
                const st = p.getPlayerState()
                if (st !== YT_TOCANDO && st !== YT_CARREGANDO && st !== YT_FIM) { p.mute(); p.playVideo(); setMudo(true); setPrecisaSom(true) }
                else if (p.isMuted()) { setMudo(true); setPrecisaSom(true) }
              }
              // mais tarde, ainda parado (nem carregando): tenta de novo, mudo
              const insistir = () => {
                const p = yt.current; if (!vivo || !p?.getPlayerState) return
                const st = p.getPlayerState()
                if (st !== YT_TOCANDO && st !== YT_FIM && st !== YT_PAUSADO) { p.mute(); p.playVideo(); setMudo(true); setPrecisaSom(true) }
              }
              window.setTimeout(conferir, 1500); window.setTimeout(conferir, 4000); window.setTimeout(insistir, 9000)
            }
            relogio = window.setInterval(() => {
              const p = yt.current; if (!p?.getPlayerState) return
              const d = p.getDuration?.() || 0
              if (d) { setDuracao(d); ev.current.carregou((p.getVideoLoadedFraction?.() || 0) * d) }
              if (p.getPlayerState() === YT_TOCANDO) {
                ev.current.tempo()
                // o próprio YouTube às vezes toca mudo para conseguir começar sozinho: pede o toque para ouvir
                if (obrig.current && !pessoaSilenciou.current && p.isMuted?.()) { setMudo(true); setPrecisaSom(true) }
              }
            }, 250)
          },
          onStateChange: (e: { data: number }) => {
            if (!vivo) return
            if (e.data === YT_TOCANDO) ev.current.tocar()
            else if (e.data === YT_PAUSADO) { ev.current.seguir(); ev.current.pausar() }
            else if (e.data === YT_FIM) { ev.current.seguir(); ev.current.tempo(); ev.current.fim() }
            else if (e.data === YT_CARREGANDO) ev.current.esperar()
          },
          onError: () => { if (vivo) setErroVideo('Este vídeo não abriu agora. Recarregue a página ou fale com o suporte.') },
        },
      })
    })
    return () => {
      vivo = false
      window.clearInterval(relogio)
      try { (yt.current ?? criado)?.destroy() } catch { /* já fechou */ }
      yt.current = null
    }
  }, [youtube])

  // MP4 obrigatório: o autoPlay com som pode ser barrado; então toca mudo e pede o toque para ouvir
  useEffect(() => {
    const v = video.current; if (!v || ehYT || !obrigatorio) return
    void v.play().catch(() => { v.muted = true; setMudo(true); setPrecisaSom(true); void v.play().catch(() => undefined) })
  }, [src, ehYT, obrigatorio])
  useEffect(() => { if (erroVideo) aoErro?.() }, [erroVideo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Trocou de aula: zera o estado e deixa o novo vídeo retomar a própria posição.
  useEffect(() => { retomou.current = false; setAcabou(false); setContagem(null); setTempo(0); setCarregado(0); setEsperando(false); setJaTocou(false) }, [src, youtube])

  // tela cheia de mentira (iPhone com YouTube): Esc sai e a página não rola por baixo
  useEffect(() => {
    if (!cheiaFalsa) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setCheiaFalsa(false) }
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.body.classList.add('com-cheia-falsa')
    document.addEventListener('keydown', tecla)
    return () => { document.body.style.overflow = antes; document.body.classList.remove('com-cheia-falsa'); document.removeEventListener('keydown', tecla) }
  }, [cheiaFalsa])

  useEffect(() => {
    const v = video.current
    const f = () => setCheia(document.fullscreenElement === caixa.current)
    const entrar = () => setCheia(true)
    const sair = () => { setCheia(false); acordar() }
    document.addEventListener('fullscreenchange', f)
    v?.addEventListener('webkitbeginfullscreen', entrar)
    v?.addEventListener('webkitendfullscreen', sair)
    return () => {
      document.removeEventListener('fullscreenchange', f)
      v?.removeEventListener('webkitbeginfullscreen', entrar)
      v?.removeEventListener('webkitendfullscreen', sair)
    }
  }, [acordar])

  /* ------------------------------------------- próxima aula em 5, 4, 3… */
  useEffect(() => {
    if (contagem == null) return
    if (contagem <= 0) { proxima?.abrir(); return }
    const t = setTimeout(() => setContagem((c) => (c == null ? null : c - 1)), 1000)
    return () => clearTimeout(t)
  }, [contagem, proxima])

  /* ------------------------------------------------------ atalhos */
  useEffect(() => {
    const aoTecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case ' ': case 'k': e.preventDefault(); alternar(); break
        case 'ArrowLeft': case 'j': if (obrigatorio) return; e.preventDefault(); pular(-10); break
        case 'ArrowRight': case 'l': if (obrigatorio) return; e.preventDefault(); pular(10); break
        case 'f': e.preventDefault(); telaCheia(); break
        case 'm': e.preventDefault(); mudar(); break
        default: return
      }
    }
    document.addEventListener('keydown', aoTecla); return () => document.removeEventListener('keydown', aoTecla)
  }, [alternar, pular, telaCheia, mudar, obrigatorio])

  /* --------------------------------------------- arrastar na barra */
  const fracaoDoEvento = (e: { clientX: number }) => {
    const b = barra.current; if (!b) return 0
    const r = b.getBoundingClientRect(); return (e.clientX - r.left) / r.width
  }
  const iniciarArraste = (e: React.PointerEvent) => {
    e.preventDefault(); setArrastando(true); irPara(fracaoDoEvento(e))
    const mover = (ev: PointerEvent) => irPara(fracaoDoEvento(ev))
    const soltar = () => { setArrastando(false); window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
    window.addEventListener('pointermove', mover); window.addEventListener('pointerup', soltar)
  }

  const pct = duracao ? (tempo / duracao) * 100 : 0
  const pctCarregado = duracao ? (carregado / duracao) * 100 : 0

  return (
    <div ref={caixa} className={`cine-player ${visivel || !tocando ? 'com-controles' : 'sem-controles'} ${cheia || cheiaFalsa ? 'cheia' : ''}${cheiaFalsa ? ' cheia-falsa' : ''}${ehYT ? ' yt' : ''}${ehYT && vertical ? ' yt-vertical' : ''}`}
      onMouseMove={acordar} onMouseLeave={() => { if (tocando) setVisivel(false) }} onClick={(e) => { if (e.target === e.currentTarget) alternar() }}>
      {ehYT ? (
        <>
          <div ref={quadroYT} className="cine-yt" />
          {/* antes do primeiro play o toque vai para o próprio YouTube (o iPhone só deixa tocar assim);
              depois, a película segura o clique: ninguém sai da aula para o YouTube */}
          {jaTocou && <div className="cine-escudo" onClick={alternar} onDoubleClick={telaCheia} aria-hidden />}
        </>
      ) : (
        <video ref={video} src={src} playsInline preload="metadata" autoPlay onClick={alternar} onDoubleClick={telaCheia} />
      )}
      {erroCheia && <p className="cine-erro-cheia" role="status">{erroCheia}</p>}
      {erroVideo && <p className="cine-erro-cheia" role="alert">{erroVideo}</p>}

      {esperando && !acabou && jaTocou && <div className="cine-carregando" aria-hidden><i /></div>}

      {precisaSom && mudo && !acabou && (
        <button type="button" className="cine-som" onClick={(e) => { e.stopPropagation(); ativarSom() }}>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>
          Toque para ativar o som
        </button>
      )}

      {!tocando && !acabou && (!ehYT || jaTocou) && (
        <button className="cine-play-grande" onClick={alternar} aria-label="Reproduzir">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        </button>
      )}

      {acabou && (
        <div className="cine-fim">
          <span className="rot">{obrigatorio ? 'Vídeo concluído' : 'Aula concluída'}</span>
          {proxima ? (
            <>
              <h3>Próxima: {proxima.titulo}</h3>
              {contagem != null ? <p>Começa em <b>{contagem}</b> s</p> : <p>&nbsp;</p>}
              <div>
                <button className="cine-fim-ir" onClick={() => { setContagem(null); proxima.abrir() }}>Assistir agora →</button>
                <button className="cine-fim-ficar" onClick={() => { setContagem(null); rever() }}>Rever esta aula</button>
                {contagem != null && <button className="cine-fim-ficar cine-fim-cancelar" onClick={() => setContagem(null)}>Cancelar</button>}
              </div>
            </>
          ) : (
            <>
              <h3>{titulo}</h3>
              <p>{textoDoFim}</p>
              <div><button className="cine-fim-ir" onClick={rever}>{obrigatorio ? 'Rever o vídeo' : 'Rever esta aula'}</button></div>
            </>
          )}
        </div>
      )}

      {/* no fim da aula, os controles somem: por cima do quadro "Aula concluída" eles cobriam os botões (29/10/2026) */}
      {!acabou && <div className="cine-controles" onClick={(e) => e.stopPropagation()}>
        <div ref={barra} className={`cine-barra ${arrastando ? 'arrastando' : ''}${obrigatorio ? ' cine-barra-fixa' : ''}`} onPointerDown={obrigatorio ? undefined : iniciarArraste} role="slider" tabIndex={obrigatorio ? -1 : 0} aria-readonly={obrigatorio || undefined} aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={`${fmt(tempo)} de ${fmt(duracao)}`}
          onKeyDown={e => {
            const m = motor.current, d = m?.duracao() ?? 0
            if (obrigatorio || !m || !Number.isFinite(d) || !d) return
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
            e.preventDefault(); e.stopPropagation()
            m.ir(e.key === 'Home' ? 0 : e.key === 'End' ? d : Math.max(0, Math.min(d, m.tempo() + (e.key === 'ArrowRight' ? 5 : -5))))
            acordar()
          }}>
          <i className="cine-barra-carregado" style={{ width: `${pctCarregado}%` }} />
          <i className="cine-barra-visto" style={{ width: `${pct}%` }} />
          <b style={{ left: `${pct}%` }} />
        </div>
        <div className="cine-linha">
          <button onClick={alternar} aria-label={tocando ? 'Pausar' : 'Reproduzir'}>
            {tocando ? <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
              : <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>}
          </button>
          {!obrigatorio && <><button onClick={() => pular(-10)} aria-label="Voltar 10 segundos" className="cine-pular"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9l5 4" /><path d="M6 9h8a5 5 0 0 1 0 10h-3" /></svg><small>10</small></button>
          <button onClick={() => pular(10)} aria-label="Avançar 10 segundos" className="cine-pular"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m13 5 5 4-5 4" /><path d="M18 9h-8a5 5 0 0 0 0 10h3" /></svg><small>10</small></button></>}
          <button onClick={mudar} aria-label={mudo ? 'Ativar som' : 'Silenciar'}>
            {mudo ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" /></svg>
              : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>}
          </button>
          <span className="cine-tempo">{fmt(tempo)} <em>/</em> {fmt(duracao)}</span>
          <span className="cine-vao" />
          {!obrigatorio && <div className="cine-vel">
            <button onClick={() => setMenuVel((m) => !m)} aria-haspopup="menu" aria-expanded={menuVel}>{velocidade}x</button>
            {menuVel && <div role="menu">{VELOCIDADES.map((x) => <button key={x} role="menuitem" className={x === velocidade ? 'on' : ''} onClick={() => trocarVelocidade(x)}>{x}x{x === 1 ? ' · normal' : ''}</button>)}</div>}
          </div>}
          <button onClick={telaCheia} aria-label={cheia || cheiaFalsa ? 'Sair da tela cheia' : 'Tela cheia'}>
            {cheia || cheiaFalsa ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
              : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
          </button>
        </div>
      </div>}
    </div>
  )
}
