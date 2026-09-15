import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * O player da sala de aula, com os próprios controles.
 *
 * O `<video>` nativo funciona, mas veste a cara do navegador: barra cinza,
 * menu de três pontos, nada da marca. Aqui os controles são nossos — barra
 * na cor do módulo, velocidade, atalhos de teclado, tela cheia — e o player
 * sabe o que uma aula precisa: retomar de onde parou, avisar quando foi
 * assistida e puxar a próxima quando termina.
 *
 * Só vale para vídeo em arquivo (.mp4). YouTube e Vimeo vêm em iframe e
 * trazem os controles deles.
 */

export interface ProximaAula { titulo: string; abrir: () => void }

interface Props {
  src: string
  titulo: string
  /** Onde a pessoa parou da última vez (segundos); 0 = do começo. */
  posicaoInicial?: number
  /** Chamado de tempos em tempos com a fração assistida (0..1) e o tempo em segundos. */
  aoAvancar?: (fracao: number, segundos: number) => void
  aoTocar?: (tocando: boolean) => void
  proxima?: ProximaAula | null
}

const VELOCIDADES = [1, 1.25, 1.5, 2]
const CONTAGEM = 5
type VideoSafari = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void
  webkitExitFullscreen?: () => void
  webkitDisplayingFullscreen?: boolean
}

const fmt = (s: number) => {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60), r = Math.floor(s % 60)
  const h = Math.floor(m / 60)
  return h ? `${h}:${String(m % 60).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

export function PlayerAula({ src, titulo, posicaoInicial = 0, aoAvancar, aoTocar, proxima }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
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

  /* ------------------------------------------------ controles somem sozinhos */
  const acordar = useCallback(() => {
    setVisivel(true)
    if (sumir.current) clearTimeout(sumir.current)
    sumir.current = setTimeout(() => { if (video.current && !video.current.paused) setVisivel(false) }, 2600)
  }, [])
  useEffect(() => () => { if (sumir.current) clearTimeout(sumir.current) }, [])

  /* ------------------------------------------------------------- ações */
  const alternar = useCallback(() => {
    const v = video.current; if (!v) return
    if (v.ended) { v.currentTime = 0 }
    if (v.paused) void v.play().catch(() => {}); else v.pause()
    acordar()
  }, [acordar])
  const pular = useCallback((s: number) => {
    const v = video.current; if (!v) return
    v.currentTime = Math.min(Math.max(0, v.currentTime + s), v.duration || v.currentTime + s); acordar()
  }, [acordar])
  const irPara = (fracao: number) => {
    const v = video.current; if (!v || !v.duration) return
    v.currentTime = Math.min(Math.max(0, fracao), 1) * v.duration
    setTempo(v.currentTime)
  }
  const telaCheia = useCallback(async () => {
    const c = caixa.current, v = video.current as VideoSafari | null
    if (!c || !v) return
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
  }, [])
  const mudar = useCallback(() => { const v = video.current; if (v) { v.muted = !v.muted; setMudo(v.muted) } }, [])
  const trocarVelocidade = (x: number) => { const v = video.current; if (v) v.playbackRate = x; setVelocidade(x); setMenuVel(false) }

  /* ---------------------------------------------- eventos do <video> */
  useEffect(() => {
    const v = video.current; if (!v) return
    const aoTempo = () => {
      setTempo(v.currentTime)
      if (v.duration) aoAvancar?.(v.currentTime / v.duration, v.currentTime)
    }
    const aoMeta = () => {
      setDuracao(v.duration)
      // Retoma de onde parou, mas não se a pessoa já tinha praticamente terminado.
      if (!retomou.current && posicaoInicial > 5 && posicaoInicial < v.duration * 0.95) v.currentTime = posicaoInicial
      retomou.current = true
    }
    const aoProgresso = () => { try { if (v.buffered.length) setCarregado(v.buffered.end(v.buffered.length - 1)) } catch { /* nada */ } }
    const aoTocar_ = () => { setTocando(true); setAcabou(false); setContagem(null); aoTocar?.(true); acordar() }
    const aoPausar = () => { setTocando(false); setVisivel(true); aoTocar?.(false) }
    const aoFim = () => { setAcabou(true); setVisivel(true); aoTocar?.(false); if (proxima) setContagem(CONTAGEM) }
    const aoEsperar = () => setEsperando(true)
    const aoSeguir = () => setEsperando(false)
    v.addEventListener('timeupdate', aoTempo); v.addEventListener('loadedmetadata', aoMeta); v.addEventListener('durationchange', aoMeta)
    v.addEventListener('progress', aoProgresso); v.addEventListener('play', aoTocar_); v.addEventListener('pause', aoPausar)
    v.addEventListener('ended', aoFim); v.addEventListener('waiting', aoEsperar); v.addEventListener('playing', aoSeguir); v.addEventListener('canplay', aoSeguir)
    return () => {
      v.removeEventListener('timeupdate', aoTempo); v.removeEventListener('loadedmetadata', aoMeta); v.removeEventListener('durationchange', aoMeta)
      v.removeEventListener('progress', aoProgresso); v.removeEventListener('play', aoTocar_); v.removeEventListener('pause', aoPausar)
      v.removeEventListener('ended', aoFim); v.removeEventListener('waiting', aoEsperar); v.removeEventListener('playing', aoSeguir); v.removeEventListener('canplay', aoSeguir)
    }
  }, [src, posicaoInicial, aoAvancar, aoTocar, proxima, acordar])

  // Trocou de aula: zera o estado e deixa o novo vídeo retomar a própria posição.
  useEffect(() => { retomou.current = false; setAcabou(false); setContagem(null); setTempo(0); setCarregado(0); setEsperando(false) }, [src])

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
        case 'ArrowLeft': case 'j': e.preventDefault(); pular(-10); break
        case 'ArrowRight': case 'l': e.preventDefault(); pular(10); break
        case 'f': e.preventDefault(); telaCheia(); break
        case 'm': e.preventDefault(); mudar(); break
        default: return
      }
    }
    document.addEventListener('keydown', aoTecla); return () => document.removeEventListener('keydown', aoTecla)
  }, [alternar, pular, telaCheia, mudar])

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
    <div ref={caixa} className={`cine-player ${visivel || !tocando ? 'com-controles' : 'sem-controles'} ${cheia ? 'cheia' : ''}`}
      onMouseMove={acordar} onMouseLeave={() => { if (tocando) setVisivel(false) }} onClick={(e) => { if (e.target === e.currentTarget) alternar() }}>
      <video ref={video} src={src} playsInline preload="metadata" autoPlay onClick={alternar} onDoubleClick={telaCheia} />
      {erroCheia && <p className="cine-erro-cheia" role="status">{erroCheia}</p>}

      {esperando && !acabou && <div className="cine-carregando" aria-hidden><i /></div>}

      {!tocando && !acabou && (
        <button className="cine-play-grande" onClick={alternar} aria-label="Reproduzir">
          <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor"><path d="M8 5.5v13l11-6.5z" /></svg>
        </button>
      )}

      {acabou && (
        <div className="cine-fim">
          <span className="rot">Aula concluída</span>
          {proxima ? (
            <>
              <h3>Próxima: {proxima.titulo}</h3>
              {contagem != null ? <p>Começa em <b>{contagem}</b> s</p> : <p>&nbsp;</p>}
              <div>
                <button className="cine-fim-ir" onClick={() => { setContagem(null); proxima.abrir() }}>Assistir agora →</button>
                <button className="cine-fim-ficar" onClick={() => { setContagem(null); const v = video.current; if (v) { v.currentTime = 0; void v.play() } }}>Rever esta aula</button>
                {contagem != null && <button className="cine-fim-ficar" onClick={() => setContagem(null)}>Cancelar</button>}
              </div>
            </>
          ) : (
            <>
              <h3>{titulo}</h3>
              <p>Você chegou ao fim do curso.</p>
              <div><button className="cine-fim-ir" onClick={() => { const v = video.current; if (v) { v.currentTime = 0; void v.play() } }}>Rever esta aula</button></div>
            </>
          )}
        </div>
      )}

      <div className="cine-controles" onClick={(e) => e.stopPropagation()}>
        <div ref={barra} className={`cine-barra ${arrastando ? 'arrastando' : ''}`} onPointerDown={iniciarArraste} role="slider" tabIndex={0} aria-label="Progresso" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-valuetext={`${fmt(tempo)} de ${fmt(duracao)}`}
          onKeyDown={e => {
            const v = video.current
            if (!v || !Number.isFinite(v.duration)) return
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
            e.preventDefault(); e.stopPropagation()
            v.currentTime = e.key === 'Home' ? 0 : e.key === 'End' ? v.duration : Math.max(0, Math.min(v.duration, v.currentTime + (e.key === 'ArrowRight' ? 5 : -5)))
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
          <button onClick={() => pular(-10)} aria-label="Voltar 10 segundos" className="cine-pular"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9l5 4" /><path d="M6 9h8a5 5 0 0 1 0 10h-3" /></svg><small>10</small></button>
          <button onClick={() => pular(10)} aria-label="Avançar 10 segundos" className="cine-pular"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="m13 5 5 4-5 4" /><path d="M18 9h-8a5 5 0 0 0 0 10h3" /></svg><small>10</small></button>
          <button onClick={mudar} aria-label={mudo ? 'Ativar som' : 'Silenciar'}>
            {mudo ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM22 9l-6 6M16 9l6 6" /></svg>
              : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></svg>}
          </button>
          <span className="cine-tempo">{fmt(tempo)} <em>/</em> {fmt(duracao)}</span>
          <span className="cine-vao" />
          <div className="cine-vel">
            <button onClick={() => setMenuVel((m) => !m)} aria-haspopup="menu" aria-expanded={menuVel}>{velocidade}x</button>
            {menuVel && <div role="menu">{VELOCIDADES.map((x) => <button key={x} role="menuitem" className={x === velocidade ? 'on' : ''} onClick={() => trocarVelocidade(x)}>{x}x{x === 1 ? ' · normal' : ''}</button>)}</div>}
          </div>
          <button onClick={telaCheia} aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'}>
            {cheia ? <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
              : <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
          </button>
        </div>
      </div>
    </div>
  )
}
