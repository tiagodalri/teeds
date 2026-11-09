import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as PE } from 'react'
import { createPortal } from 'react-dom'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  ehMonograma, fotoDoPerfil, haQuanto, registrar, REACOES, BOTAO_PADRAO,
  type Enquadramento, type PerfilDeStories, type Story, type TipoDeEvento,
} from '../../core/teeds/stories'
import './stories.css'

/**
 * A tela cheia do story, no jeito do Instagram (08/11/2026):
 *  - toque à direita avança, à esquerda volta; segurar pausa e esconde tudo;
 *  - arrastar para o lado troca de bolinha (com o giro de cubo); para baixo fecha;
 *  - no computador o story fica no meio, com as bolinhas vizinhas dos lados e setas;
 *  - teclado: ← → espaço M Esc.
 * Cada passo vira um evento para as métricas (visto, até onde assistiu,
 * avançou, voltou, pulou, saiu, pausou, clicou, reagiu, respondeu, compartilhou).
 */

export interface PropsDoVisualizador {
  perfis: PerfilDeStories[]
  perfilInicial: number
  sessao: SessaoTeeds | null
  aoFechar: () => void
  /** Avisa a fileira que o story foi visto (o anel muda ao fechar). */
  aoVer?: (perfil: string, story: string) => void
  aoBotao?: (s: Story) => void
  /** O link de compartilhar deste story. */
  linkDe?: (s: Story) => string
  /** Equipe: vê para quem é cada story e o atalho para as métricas. */
  equipe?: boolean
  aoMetricas?: (s: Story) => void
  /** Prévia do painel: não grava nada e fica rodando. */
  previa?: boolean
}

const SOM = 'stories.som'
const somLigado = () => { try { return localStorage.getItem(SOM) === '1' } catch { return false } }
const guardarSom = (v: boolean) => { try { localStorage.setItem(SOM, v ? '1' : '0') } catch { /* sem armazenamento */ } }

/** Onde começa a bolinha: no primeiro story que a pessoa ainda não viu. */
const primeiroNaoVisto = (p: PerfilDeStories) => Math.max(0, p.itens.findIndex((s) => !s.visto))

export function estiloDaMidia(e: Enquadramento | undefined): CSSProperties {
  const x = e?.x ?? 50, y = e?.y ?? 50, z = e?.zoom ?? 1
  return { objectPosition: `${x}% ${y}%`, transform: z !== 1 ? `scale(${z})` : undefined, transformOrigin: `${x}% ${y}%` }
}

const rotuloDoPublico = (s: Story): string | null => {
  const p = s.publico
  if (!p) return null
  if (p.so_admins) return 'Só admins'
  if (p.todos) return 'Todos'
  const partes: string[] = []
  if (p.subplanos?.length) partes.push(p.subplanos.map((x) => x[0].toUpperCase() + x.slice(1)).join(' e '))
  if (p.parceiros?.length) partes.push(p.parceiros.map((x) => (x === 'direto' ? 'Direto' : `/${x}`)).join(' e '))
  return partes.length ? `Só ${partes.join(' · ')}` : 'Todos'
}

export function Avatar({ foto, nome, tamanho = 32 }: { foto: string | null; nome: string; tamanho?: number }) {
  const url = fotoDoPerfil(foto)
  return (
    <span className={`sto-av ${ehMonograma(foto) ? 'mono' : ''}`} style={{ width: tamanho, height: tamanho }}>
      {url ? <img src={url} alt="" draggable={false} /> : <b>{nome.slice(0, 1).toUpperCase()}</b>}
    </span>
  )
}

const Ico = ({ d, cheio }: { d: string; cheio?: boolean }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={cheio ? 'cheio' : undefined}><path d={d} /></svg>
)
const I = {
  fechar: 'M6 6l12 12M18 6L6 18',
  pausa: 'M8 5v14M16 5v14',
  play: 'M7 4.5v15l12.5-7.5z',
  somOn: 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 010 7M19.5 5.5a9 9 0 010 13',
  somOff: 'M4 9h4l5-4v14l-5-4H4zM17 9.5l5 5M22 9.5l-5 5',
  enviar: 'M21.5 2.5L10.8 13.2M21.5 2.5l-7 19-3.7-8.3L2.5 9.5z',
  coracao: 'M12 20.5s-8-4.9-8-11A4.5 4.5 0 0112 7a4.5 4.5 0 018 2.5c0 6.1-8 11-8 11z',
  seta: 'M9 6l6 6-6 6',
  voltar: 'M15 6l-6 6 6 6',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
  grafico: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
}

export function VisualizadorDeStories(props: PropsDoVisualizador) {
  const { perfis, sessao, aoFechar, aoVer, aoBotao, linkDe, equipe, aoMetricas, previa } = props
  const [pi, setPi] = useState(props.perfilInicial)
  const [si, setSi] = useState(() => primeiroNaoVisto(perfis[props.perfilInicial]))
  const [pausado, setPausado] = useState(false)
  const [segurando, setSegurando] = useState(false)
  const [mudo, setMudo] = useState(() => !somLigado())
  const [pediuSom, setPediuSom] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [arrasto, setArrasto] = useState<{ dx: number; dy: number; eixo: 'x' | 'y' | null } | null>(null)
  const [entrada, setEntrada] = useState<'dir' | 'esq' | null>(null)
  const [saindo, setSaindo] = useState(false)
  const [folha, setFolha] = useState(false)
  const [respondendo, setRespondendo] = useState(false)
  const [resposta, setResposta] = useState('')
  const [recado, setRecado] = useState<string | null>(null)
  const [voando, setVoando] = useState<Array<{ id: number; e: string; x: number }>>([])
  const [menu, setMenu] = useState(false)
  const [pc, setPc] = useState(() => window.matchMedia('(min-width: 768px) and (pointer: fine)').matches)

  const perfil = perfis[pi]
  const story: Story | undefined = perfil?.itens[si]
  const barra = useRef<HTMLElement | null>(null)
  const video = useRef<HTMLVideoElement | null>(null)
  const relogio = useRef({ inicio: 0, acumulado: 0, maior: 0 })
  const fimDoItem = useRef<(motivo: TipoDeEvento | 'fim') => void>(() => undefined)
  const pausouRegistrado = useRef(false)
  const toque = useRef<{ x: number; y: number; t: number; segurou: boolean; timer: number } | null>(null)
  const larguraCard = useRef(400)
  const card = useRef<HTMLDivElement | null>(null)

  const parado = pausado || segurando || folha || respondendo || menu || carregando || !!arrasto || saindo

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px) and (pointer: fine)')
    const ver = () => setPc(mq.matches)
    mq.addEventListener('change', ver)
    return () => mq.removeEventListener('change', ver)
  }, [])

  // a página atrás não rola com o story aberto
  useEffect(() => {
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = antes }
  }, [])

  const avisar = useCallback((t: string) => { setRecado(t); window.setTimeout(() => setRecado((r) => (r === t ? null : r)), 2200) }, [])

  /* ------------------------------------------------ tempo e progresso */
  const segundos = () => {
    if (!story) return 0
    if (story.tipo === 'video' && video.current) return video.current.currentTime || 0
    const r = relogio.current
    return (r.acumulado + (r.inicio ? performance.now() - r.inicio : 0)) / 1000
  }
  const duracao = () => {
    if (!story) return 6
    const v = video.current
    return story.tipo === 'video' && v && isFinite(v.duration) && v.duration > 0 ? v.duration : story.duracao
  }

  // o relógio da foto anda só quando nada está parado
  useEffect(() => {
    if (!story || story.tipo !== 'imagem') return
    const r = relogio.current
    if (parado) { if (r.inicio) { r.acumulado += performance.now() - r.inicio; r.inicio = 0 } }
    else if (!r.inicio) r.inicio = performance.now()
  }, [parado, story])

  // o vídeo acompanha o estado
  useEffect(() => {
    const v = video.current
    if (!v || !story || story.tipo !== 'video') return
    if (parado && !carregando) v.pause()
    else if (!parado) {
      v.muted = mudo
      v.play().catch(() => {
        // sem gesto recente o navegador não deixa tocar com som: toca mudo e oferece o som
        if (!v.muted) { v.muted = true; setMudo(true); setPediuSom(true); void v.play().catch(() => undefined) }
      })
    }
  }, [parado, carregando, mudo, story])

  // a barra de progresso: desenhada direto, sem re-render a cada quadro
  useEffect(() => {
    let raf = 0
    const passo = () => {
      const s = segundos(), d = duracao()
      relogio.current.maior = Math.max(relogio.current.maior, s)
      if (barra.current) barra.current.style.transform = `scaleX(${Math.min(1, s / d)})`
      if (!parado && s >= d - 0.04 && (story?.tipo !== 'video')) { fimDoItem.current('fim'); return }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }) // roda a cada render: o laço lê o estado mais novo

  /* ------------------------------------------------ troca de item */
  const ir = useCallback((npi: number, nsi: number, motivo: TipoDeEvento | 'fim', direcao?: 'dir' | 'esq') => {
    if (story && !previa) {
      const s = relogio.current.maior || segundos()
      void registrar(sessao, story.id, 'progresso', null, motivo === 'fim' ? duracao() : s)
      if (motivo !== 'fim' && motivo !== 'progresso') void registrar(sessao, story.id, motivo)
    }
    if (npi < 0) { setSi(0); reiniciar(); return }
    if (npi >= perfis.length) { fechar(true); return }
    if (npi !== pi && direcao) setEntrada(direcao)
    setPi(npi); setSi(nsi)
    reiniciar()
  }, [story, pi, perfis.length, sessao, previa]) // eslint-disable-line react-hooks/exhaustive-deps

  function reiniciar() {
    relogio.current = { inicio: 0, acumulado: 0, maior: 0 }
    pausouRegistrado.current = false
    setCarregando(true); setFolha(false); setMenu(false)
    if (barra.current) barra.current.style.transform = 'scaleX(0)'
  }

  const proximo = (motivo: TipoDeEvento | 'fim' = 'avancou') => {
    if (previa && perfil.itens.length === 1 && perfis.length === 1) { if (video.current) video.current.currentTime = 0; reiniciar(); setCarregando(false); return }
    if (si < perfil.itens.length - 1) ir(pi, si + 1, motivo)
    else ir(pi + 1, primeiroNaoVisto(perfis[pi + 1] ?? perfil), motivo === 'avancou' ? 'avancou' : motivo, 'dir')
  }
  const anterior = () => {
    if (si > 0) ir(pi, si - 1, 'voltou')
    else if (pi > 0) ir(pi - 1, perfis[pi - 1].itens.length - 1, 'voltou', 'esq')
    else { if (video.current) video.current.currentTime = 0; relogio.current = { inicio: 0, acumulado: 0, maior: 0 } }
  }
  const pularPerfil = (dir: 1 | -1) => {
    const n = pi + dir
    if (n < 0) return
    ir(n, n < perfis.length ? primeiroNaoVisto(perfis[n]) : 0, 'pulou', dir > 0 ? 'dir' : 'esq')
  }
  fimDoItem.current = (motivo) => proximo(motivo === 'fim' ? 'fim' : (motivo as TipoDeEvento))

  function fechar(acabou = false) {
    if (saindo) return
    if (story && !previa) {
      void registrar(sessao, story.id, 'progresso', null, relogio.current.maior || segundos())
      if (!acabou) void registrar(sessao, story.id, 'saiu')
    }
    setSaindo(true)
    window.setTimeout(aoFechar, 180)
  }

  // visto: ao começar cada story
  useEffect(() => {
    if (!story || previa) return
    void registrar(sessao, story.id, 'visto')
    aoVer?.(perfil.id, story.id)
  }, [story?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // pré-carrega o próximo (foto ou vídeo), para não travar ao avançar
  useEffect(() => {
    const prox = perfil?.itens[si + 1] ?? perfis[pi + 1]?.itens[primeiroNaoVisto(perfis[pi + 1])]
    if (!prox) return
    if (prox.tipo === 'imagem') { const i = new Image(); i.src = prox.midia; return }
    const v = document.createElement('video'); v.preload = 'auto'; v.muted = true; v.src = prox.midia
    return () => { v.removeAttribute('src'); v.load() }
  }, [pi, si]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!entrada) return; const t = window.setTimeout(() => setEntrada(null), 420); return () => window.clearTimeout(t) }, [entrada, pi])

  /* ------------------------------------------------ teclado */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (respondendo) { if (e.key === 'Escape') { setRespondendo(false); (document.activeElement as HTMLElement)?.blur() } return }
      if (e.key === 'Escape') { if (folha) setFolha(false); else if (menu) setMenu(false); else fechar() }
      else if (e.key === 'ArrowRight') proximo()
      else if (e.key === 'ArrowLeft') anterior()
      else if (e.key === ' ') { e.preventDefault(); setPausado((p) => !p) }
      else if (e.key.toLowerCase() === 'm') alternarSom()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  function alternarSom() {
    const novo = !mudo
    setMudo(novo); setPediuSom(false); guardarSom(!novo)
    if (video.current) { video.current.muted = novo; if (!novo) void video.current.play().catch(() => undefined) }
  }

  /* ------------------------------------------------ toques e arrasto */
  useLayoutEffect(() => { if (card.current) larguraCard.current = card.current.getBoundingClientRect().width || 400 })

  function aoTocar(e: PE<HTMLDivElement>) {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('button, input, a, .sto-folha, .sto-menu')) return
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* ponteiro já solto */ }
    const t = { x: e.clientX, y: e.clientY, t: performance.now(), segurou: false, timer: 0 }
    t.timer = window.setTimeout(() => {
      t.segurou = true; setSegurando(true)
      if (!pausouRegistrado.current && story && !previa) { pausouRegistrado.current = true; void registrar(sessao, story.id, 'pausou') }
    }, 220)
    toque.current = t
  }
  function aoMover(e: PE<HTMLDivElement>) {
    const t = toque.current
    if (!t) return
    const dx = e.clientX - t.x, dy = e.clientY - t.y
    if (!arrasto && Math.hypot(dx, dy) < 10) return
    window.clearTimeout(t.timer)
    if (segurando && !arrasto) return
    const eixo = arrasto?.eixo ?? (Math.abs(dx) > Math.abs(dy) ? 'x' : 'y')
    if (pc && eixo === 'x') return
    setArrasto({ dx: eixo === 'x' ? dx : 0, dy: eixo === 'y' ? Math.max(0, dy) : 0, eixo })
  }
  function aoSoltar(e: PE<HTMLDivElement>) {
    const t = toque.current
    toque.current = null
    if (!t) return
    window.clearTimeout(t.timer)
    if (arrasto) {
      const w = larguraCard.current
      if (arrasto.eixo === 'y' && arrasto.dy > 110) { setArrasto(null); fechar(); return }
      if (arrasto.eixo === 'x' && Math.abs(arrasto.dx) > w * 0.22) {
        setArrasto(null)
        if (arrasto.dx < 0) { if (pi < perfis.length - 1) pularPerfil(1); else fechar(true) } else pularPerfil(-1)
        return
      }
      setArrasto(null); return
    }
    if (t.segurou) { setSegurando(false); return }
    // mede pelo palco (parado), não pelo cartão: no giro de cubo o cartão está deslocado
    const el = e.currentTarget as HTMLElement
    const r = (el.parentElement ?? el).getBoundingClientRect()
    if (e.clientX - r.left < r.width * 0.3) anterior(); else proximo()
  }

  /* ------------------------------------------------ ações */
  function botao() {
    if (!story) return
    if (!previa) void registrar(sessao, story.id, 'clique')
    setPausado(true)
    aoBotao?.(story)
  }
  function reagir(emoji: string) {
    if (!story) return
    if (!previa) void registrar(sessao, story.id, 'reacao', emoji)
    const id = Date.now() + Math.random()
    setVoando((v) => [...v, ...Array.from({ length: 6 }, (_, i) => ({ id: id + i, e: emoji, x: 18 + Math.random() * 64 }))])
    window.setTimeout(() => setVoando((v) => v.filter((x) => x.id < id || x.id > id + 6)), 1500)
    if (story) story.reacao = emoji
    setRespondendo(false); (document.activeElement as HTMLElement)?.blur?.()
    avisar('Reação enviada')
  }
  function responder() {
    const texto = resposta.trim()
    if (!texto || !story) return
    if (!previa) void registrar(sessao, story.id, 'resposta', texto)
    setResposta(''); setRespondendo(false); (document.activeElement as HTMLElement)?.blur?.()
    avisar('Enviada para a equipe. A resposta chega no Suporte.')
  }
  async function compartilhar() {
    if (!story) return
    const url = linkDe?.(story) ?? location.href
    const texto = story.titulo ? `${story.titulo} · ${perfil.nome}` : `Story de ${perfil.nome}`
    if (!previa) void registrar(sessao, story.id, 'compartilhou')
    if (navigator.share && !pc) {
      setPausado(true)
      try { await navigator.share({ title: texto, text: texto, url }) } catch { /* fechou a folha */ }
      setPausado(false)
      return
    }
    setFolha(true)
  }
  async function copiar() {
    if (!story) return
    const url = linkDe?.(story) ?? location.href
    try { await navigator.clipboard.writeText(url); avisar('Link copiado') } catch { avisar(url) }
  }

  if (!perfil || !story) return null

  const media = story.tipo === 'video'
    ? <video key={story.id} ref={video} className="sto-midia" src={story.midia} poster={story.capa ?? undefined} playsInline muted={mudo} preload="auto"
        style={estiloDaMidia(story.enquadramento)}
        onLoadedData={() => setCarregando(false)} onCanPlay={() => setCarregando(false)} onWaiting={() => setCarregando(true)} onPlaying={() => setCarregando(false)}
        onEnded={() => { if (!parado) proximo('fim') }} onError={() => { setCarregando(false); avisar('Este vídeo não carregou. Toque para seguir.') }} />
    : <img key={story.id} className={`sto-midia ${parado ? '' : 'anda'}`} src={story.midia} alt="" draggable={false} style={{ ...estiloDaMidia(story.enquadramento), animationDuration: `${story.duracao + 2}s` }}
        onLoad={() => setCarregando(false)} onError={() => setCarregando(false)} />

  const publico = equipe ? rotuloDoPublico(story) : null
  const transformaCard: CSSProperties | undefined = arrasto
    ? arrasto.eixo === 'y'
      ? { transform: `translateY(${arrasto.dy}px) scale(${1 - Math.min(arrasto.dy, 400) / 1600})`, transition: 'none' }
      : { transform: `perspective(900px) translateX(${arrasto.dx * 0.35}px) rotateY(${(arrasto.dx / larguraCard.current) * -38}deg)`, transformOrigin: arrasto.dx < 0 ? 'right center' : 'left center', transition: 'none' }
    : undefined

  const vizinho = (k: number) => {
    const p = perfis[k]
    if (!p) return null
    const s = p.itens[primeiroNaoVisto(p)]
    const novo = p.itens.some((x) => !x.visto)
    return (
      <button type="button" className={`sto-vizinho ${k < pi ? 'esq' : 'dir'}`} onClick={() => pularPerfil(k < pi ? -1 : 1)} aria-label={`Stories de ${p.nome}`}>
        {s.tipo === 'imagem' || s.capa ? <img src={s.capa ?? s.midia} alt="" draggable={false} style={estiloDaMidia(s.enquadramento)} /> : <video src={s.midia} muted preload="metadata" />}
        <span className="sto-vizinho-q">
          <span className={`sto-anel ${novo ? '' : 'visto'}`}><Avatar foto={p.foto} nome={p.nome} tamanho={52} /></span>
          <b>{p.nome}</b><small>{haQuanto(s.quando)}</small>
        </span>
      </button>
    )
  }

  const conteudo = (
    <div className={`sto-v ${pc ? 'pc' : 'cel'} ${saindo ? 'saindo' : ''} ${segurando ? 'segurando' : ''} ${respondendo ? 'respondendo' : ''}`} role="dialog" aria-modal="true" aria-label={`Stories de ${perfil.nome}`}
      onClick={(e) => { if (pc && e.target === e.currentTarget) fechar() }}>
      {pc && <div className="sto-fundo" aria-hidden="true">{story.tipo === 'imagem' || story.capa ? <img src={story.capa ?? story.midia} alt="" /> : null}</div>}
      {pc && <button type="button" className="sto-fechar-pc" onClick={() => fechar()} aria-label="Fechar"><Ico d={I.fechar} /></button>}
      {pc && vizinho(pi - 1)}

      <div className={`sto-palco ${entrada ? `entra-${entrada}` : ''}`} key={perfil.id}>
        {pc && (pi > 0 || si > 0) && <button type="button" className="sto-seta esq" onClick={anterior} aria-label="Anterior"><Ico d={I.voltar} /></button>}
        <div ref={card} className="sto-card" style={transformaCard}
          onPointerDown={aoTocar} onPointerMove={aoMover} onPointerUp={aoSoltar} onPointerCancel={() => { toque.current = null; setArrasto(null); setSegurando(false) }}
          onContextMenu={(e) => e.preventDefault()}>
          <div className="sto-midia-caixa">{media}</div>
          <i className="sto-sombra cima" /><i className="sto-sombra baixo" />

          <div className="sto-ui topo">
            <div className="sto-barras">
              {perfil.itens.map((s, i) => (
                <i key={s.id}><b ref={i === si ? (el) => { barra.current = el } : undefined} style={{ transform: `scaleX(${i < si ? 1 : 0})` }} /></i>
              ))}
            </div>
            <div className="sto-cab">
              <Avatar foto={perfil.foto} nome={perfil.nome} />
              <span className="sto-quem">
                <b>{perfil.nome}</b>
                {perfil.oficial && <svg className="sto-selo" viewBox="0 0 24 24" aria-label="Perfil oficial"><path d="M12 2l2.4 1.8 3-.2.9 2.9 2.5 1.7-1 2.8 1 2.8-2.5 1.7-.9 2.9-3-.2L12 22l-2.4-1.8-3 .2-.9-2.9-2.5-1.7 1-2.8-1-2.8 2.5-1.7.9-2.9 3 .2z" /><path className="v" d="M8 12.2l2.6 2.6L16.2 9" /></svg>}
                <small>{haQuanto(story.quando)}</small>
                {publico && <em className="sto-publico">{publico}</em>}
              </span>
              <span className="sto-acoes">
                {story.tipo === 'video' && <button type="button" onClick={alternarSom} aria-label={mudo ? 'Ligar o som' : 'Desligar o som'}><Ico d={mudo ? I.somOff : I.somOn} /></button>}
                {pc && <button type="button" onClick={() => setPausado((p) => !p)} aria-label={pausado ? 'Continuar' : 'Pausar'}><Ico d={pausado ? I.play : I.pausa} cheio={pausado} /></button>}
                {equipe && !previa && <button type="button" onClick={() => setMenu((m) => !m)} aria-label="Mais opções"><Ico d={I.mais} /></button>}
                {!pc && <button type="button" onClick={() => fechar()} aria-label="Fechar"><Ico d={I.fechar} /></button>}
              </span>
            </div>
            {pediuSom && mudo && <button type="button" className="sto-pede-som" onClick={alternarSom}><Ico d={I.somOff} />Toque para ouvir</button>}
          </div>

          {menu && (
            <div className="sto-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenu(false); aoMetricas?.(story) }}><Ico d={I.grafico} />Ver métricas</button>
              <button type="button" role="menuitem" onClick={() => { setMenu(false); void copiar() }}><Ico d={I.copiar} />Copiar link</button>
            </div>
          )}

          {carregando && <span className="sto-girando" aria-label="Carregando" />}

          {(story.chip || story.titulo || story.subtitulo) && (
            <div className={`sto-texto ${story.botao ? 'com-botao' : ''}`}>
              {story.chip && <span className="sto-chip">{story.chip}</span>}
              {story.titulo && <h2>{story.titulo}</h2>}
              {story.subtitulo && <p>{story.subtitulo}</p>}
            </div>
          )}

          {voando.map((v) => <span key={v.id} className="sto-voa" style={{ left: `${v.x}%`, animationDelay: `${(v.id % 1) * 300}ms` }}>{v.e}</span>)}

          <div className="sto-ui pe">
            {story.botao && (
              <button type="button" className="sto-cta" onClick={botao}>
                {story.botao.texto || BOTAO_PADRAO[story.botao.tipo]}<Ico d={I.seta} />
              </button>
            )}
            <div className="sto-linha">
                {story.responder ? (
                  <form className={`sto-resp ${respondendo ? 'aberta' : ''}`} onSubmit={(e) => { e.preventDefault(); responder() }}>
                    <input value={resposta} onChange={(e) => setResposta(e.target.value)} maxLength={500}
                      onFocus={() => setRespondendo(true)} onBlur={() => { if (!resposta.trim()) window.setTimeout(() => setRespondendo(false), 120) }}
                      placeholder={`Responder a ${perfil.nome}…`} aria-label={`Responder a ${perfil.nome}`} enterKeyHint="send" />
                    {resposta.trim() && <button type="submit" className="sto-enviar">Enviar</button>}
                  </form>
                ) : <span className="sto-resp vazio" />}
                {!respondendo && (
                  <>
                    <button type="button" className={`sto-icone ${story.reacao ? 'reagiu' : ''}`} onClick={() => reagir('💛')} aria-label="Curtir"><Ico d={I.coracao} cheio={!!story.reacao} /></button>
                    {story.compartilhar && <button type="button" className="sto-icone" onClick={() => void compartilhar()} aria-label="Compartilhar"><Ico d={I.enviar} /></button>}
                  </>
                )}
            </div>
          </div>

          {respondendo && (
            <div className="sto-reacoes" onPointerDown={(e) => e.preventDefault()}>
              <span>Reações rápidas</span>
              <div>{[...REACOES, '😍', '🚀'].map((r) => <button key={r} type="button" onClick={() => reagir(r)}>{r}</button>)}</div>
            </div>
          )}

          {folha && (
            <div className="sto-folha" onPointerDown={(e) => e.stopPropagation()}>
              <i className="alca" />
              <h3>Compartilhar este story</h3>
              <p>Quem abrir o link assiste e já vê o botão de cadastro.</p>
              <div className="sto-link"><span>{linkDe?.(story) ?? ''}</span><button type="button" onClick={() => void copiar()}>Copiar</button></div>
              <div className="sto-apps">
                <a href={`https://wa.me/?text=${encodeURIComponent(`${story.titulo ?? perfil.nome} ${linkDe?.(story) ?? ''}`)}`} target="_blank" rel="noopener noreferrer"><i className="wa">WA</i>WhatsApp</a>
                <a href={`https://t.me/share/url?url=${encodeURIComponent(linkDe?.(story) ?? '')}&text=${encodeURIComponent(story.titulo ?? '')}`} target="_blank" rel="noopener noreferrer"><i className="tg">TG</i>Telegram</a>
                <button type="button" onClick={() => void copiar()}><i>⧉</i>Copiar</button>
              </div>
              <button type="button" className="sto-folha-fechar" onClick={() => setFolha(false)}>Fechar</button>
            </div>
          )}

          {pausado && pc && <span className="sto-pausa" aria-hidden="true"><Ico d={I.play} cheio /></span>}
          {recado && <span className="sto-recado" role="status">{recado}</span>}
        </div>
        {pc && <button type="button" className="sto-seta dir" onClick={() => proximo()} aria-label="Próximo"><Ico d={I.seta} /></button>}
      </div>

      {pc && vizinho(pi + 1)}
    </div>
  )

  return createPortal(conteudo, document.body)
}
