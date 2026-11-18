import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  duracaoCurta, horaCurta, iniciais, partesDoTexto, soEmoji, tomDe,
  type EquipeApi, type MensagemEq, type Midia,
} from '../../core/teeds/equipe'
import { Monograma } from '../marca/Monograma'

/* Os pedaços da tela do chat da equipe (17/11/2026): ícones, avatar, o balão
   (texto, foto, voz, reações, deslizar para responder, segurar para o menu),
   o menu da mensagem e o visualizador de fotos. */

export const I = {
  enviar: 'M3.4 20.4l17.45-7.48a1 1 0 000-1.84L3.4 3.6a1 1 0 00-1.39 1.2L4 11l9 1-9 1-1.99 6.2a1 1 0 001.39 1.2z',
  clipe: 'M20 11.5l-8.2 8.2a5 5 0 01-7-7L13 4.5a3.3 3.3 0 014.7 4.7l-8.2 8.2a1.7 1.7 0 01-2.4-2.4l7.6-7.6',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z',
  mic: 'M12 3a3 3 0 00-3 3v6a3 3 0 006 0V6a3 3 0 00-3-3zM5.5 11a6.5 6.5 0 0013 0M12 17.5V21',
  fechar: 'M6 6l12 12M18 6L6 18',
  voltar: 'M15 5l-7 7 7 7',
  conversa: 'M8 10h8M8 14h5M21 12a8.5 8.5 0 01-12.4 7.6L3 21l1.4-5.2A8.5 8.5 0 1121 12z',
  responder: 'M10 8L4 13l6 5M4 13h10a6 6 0 016 6',
  lixo: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
  editar: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  visto: 'M1.5 12.5l4 4L15 7M9.5 16.5l1 1L20.5 7',
  enviada: 'M5 12.5l4.2 4.2L19 7',
  relogio: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z',
  baixo: 'M6 9l6 6 6-6',
  cadeado: 'M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z',
  fixar: 'M9 4h6l-1 6 3 3v1H7v-1l3-3zM12 14v6',
  sino: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 20a2 2 0 004 0',
  baixar: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  mais: 'M12 5v14M5 12h14',
  play: 'M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z',
  pausa: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  seta: 'M12 19V5M6 11l6-6 6 6',
  alerta: 'M12 8v5M12 16h.01M10.3 3.9L2.4 17.5A2 2 0 004.1 20.5h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  ampliar: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  reduzir: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
}
export const Ic = ({ d, className, cheio }: { d: string; className?: string; cheio?: boolean }) => (
  <svg className={`${className ?? ''} ${cheio ? 'cheio' : ''}`} viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
)

export const toque = () => typeof matchMedia === 'function' && matchMedia('(hover: none)').matches
export const vibrar = (ms: number) => { try { navigator.vibrate?.(ms) } catch { /* sem vibração */ } }

export function Avatar({ nome, id, tamanho = 40, online, grupo }: { nome: string; id: string | null; tamanho?: number; online?: boolean; grupo?: boolean }) {
  return (
    <span className={`eq-avatar ${grupo ? 'grupo' : ''}`} style={{ width: tamanho, height: tamanho, ['--tom' as string]: tomDe(id) }}>
      {grupo ? <Monograma tamanho={Math.round(tamanho * 0.56)} /> : <b style={{ fontSize: Math.round(tamanho * 0.36) }}>{iniciais(nome)}</b>}
      {online && <i aria-label="online" />}
    </span>
  )
}

/** O endereço local de um print ou áudio (o do aparelho enquanto sobe; depois, o guardado). */
export function useMidia(api: EquipeApi, caminho: string | null, local?: string) {
  const [url, setUrl] = useState<string | null>(local ?? null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    if (local) { setUrl(local); return }
    if (!caminho) return
    let vivo = true
    api.abrirPrint(caminho).then((u) => vivo && setUrl(u)).catch(() => vivo && setErro(true))
    return () => { vivo = false }
  }, [caminho, local]) // eslint-disable-line react-hooks/exhaustive-deps
  return { url, erro }
}

function Foto({ api, m, aoAmpliar }: { api: EquipeApi; m: MensagemEq; aoAmpliar: (url: string, m: MensagemEq) => void }) {
  const { url, erro } = useMidia(api, m.anexo, m.local)
  const med = m.midia?.tipo === 'imagem' && m.midia.l > 0 && m.midia.a > 0 ? m.midia : null
  // a proporção reservada antes de carregar: a conversa não pula quando a foto chega
  const proporcao = med ? Math.min(Math.max(med.l / med.a, 0.56), 1.9) : 4 / 3
  if (erro) return <span className="eq-foto-erro"><Ic d={I.alerta} />Imagem indisponível</span>
  return (
    <button type="button" className={`eq-foto ${url ? '' : 'carregando'}`} style={{ aspectRatio: String(proporcao) }}
      onClick={(e) => { e.stopPropagation(); if (url) aoAmpliar(url, m) }} aria-label="Ver a foto">
      {url && <img src={url} alt="" draggable={false} />}
      {m.enviando && <span className="eq-foto-subindo"><span className="eq-girando" /></span>}
    </button>
  )
}

/* ------------------------------------------------ mensagem de voz */
let tocandoAgora: HTMLAudioElement | null = null
const VELOCIDADES = [1, 1.5, 2]
const CHAVE_VEL = 'equipe.velocidadeDoAudio'
const velGuardada = () => { try { const v = Number(localStorage.getItem(CHAVE_VEL)); return VELOCIDADES.includes(v) ? v : 1 } catch { return 1 } }
/** Terminou um áudio: se a mensagem seguinte também é de voz, toca ela (como no WhatsApp). */
function tocarSeguinte(id: string) {
  const todas = [...document.querySelectorAll<HTMLElement>('.eq-msg[data-id]')]
  const i = todas.findIndex((x) => x.dataset.id === id)
  const prox = i >= 0 ? todas[i + 1] : null
  prox?.querySelector<HTMLButtonElement>('.eq-voz-play:not(:disabled)')?.click()
}

function Voz({ api, m, minha, nome, id }: { api: EquipeApi; m: MensagemEq; minha: boolean; nome: string; id: string | null }) {
  const midia = m.midia?.tipo === 'audio' ? m.midia : null
  const { url, erro } = useMidia(api, m.anexo, m.local)
  const audio = useRef<HTMLAudioElement | null>(null)
  const [tocando, setTocando] = useState(false)
  const [pos, setPos] = useState(0)
  const [vel, setVel] = useState(velGuardada)
  const total = midia?.duracao || audio.current?.duration || 0
  const ondas = midia?.ondas?.length ? midia.ondas : Array(48).fill(6)

  useEffect(() => () => { audio.current?.pause() }, [])
  const garantir = () => {
    if (!url) return null
    if (!audio.current) {
      const a = new Audio(url)
      a.preload = 'auto'
      a.ontimeupdate = () => setPos(a.currentTime)
      a.onended = () => { setTocando(false); setPos(0); tocarSeguinte(m.id) }
      a.onpause = () => setTocando(false)
      a.onplay = () => setTocando(true)
      audio.current = a
    }
    return audio.current
  }
  const alternar = (e: React.MouseEvent) => {
    e.stopPropagation()
    const a = garantir(); if (!a) return
    if (!a.paused) { a.pause(); return }
    if (tocandoAgora && tocandoAgora !== a) tocandoAgora.pause()
    tocandoAgora = a
    a.playbackRate = vel
    void a.play().catch(() => setTocando(false))
  }
  const buscar = (e: React.PointerEvent<HTMLSpanElement>) => {
    e.stopPropagation()
    const a = garantir(); if (!a || !total) return
    const r = e.currentTarget.getBoundingClientRect()
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    a.currentTime = f * total; setPos(a.currentTime)
  }
  const trocarVel = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = VELOCIDADES[(VELOCIDADES.indexOf(vel) + 1) % VELOCIDADES.length]
    setVel(v); if (audio.current) audio.current.playbackRate = v
    try { localStorage.setItem(CHAVE_VEL, String(v)) } catch { /* sem armazenamento */ }
  }
  const progresso = total ? pos / total : 0

  return (
    <div className={`eq-voz ${tocando ? 'tocando' : ''}`}>
      {tocando || pos > 0
        ? <button type="button" className="eq-voz-vel" onClick={trocarVel} aria-label="Velocidade">{vel}×</button>
        : <span className="eq-voz-avatar"><Avatar nome={nome} id={id} tamanho={42} /><Ic d={I.mic} className={minha ? '' : 'dele'} /></span>}
      <button type="button" className="eq-voz-play" onClick={alternar} disabled={!url && !erro} aria-label={tocando ? 'Pausar' : 'Ouvir'}>
        {!url && !erro ? <span className="eq-girando" /> : <Ic d={tocando ? I.pausa : I.play} cheio />}
      </button>
      <span className="eq-voz-meio">
        <span className="eq-voz-onda" onPointerDown={buscar} role="slider" aria-label="Posição do áudio" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(pos)}>
          {ondas.map((h, i) => <i key={i} className={i / ondas.length < progresso ? 'ja' : ''} style={{ height: `${Math.max(12, (h / 31) * 100)}%` }} />)}
          <b style={{ left: `${progresso * 100}%` }} />
        </span>
        <small>{erro ? 'Áudio indisponível' : duracaoCurta(tocando || pos > 0 ? pos : total)}</small>
      </span>
    </div>
  )
}

/* ------------------------------------------------ o balão */
export interface AcoesDoBalao {
  menu: (m: MensagemEq, el: HTMLElement) => void
  responder: (m: MensagemEq) => void
  ampliar: (url: string, m: MensagemEq) => void
  irPara: (id: string) => void
  reenviar: (m: MensagemEq) => void
  reagir: (m: MensagemEq, emoji: string) => void
  verReacoes: (m: MensagemEq, el: HTMLElement) => void
}

interface PropsDoBalao {
  api: EquipeApi
  m: MensagemEq
  eu: string
  minha: boolean
  grupo: boolean
  primeiraDaSequencia: boolean
  ultimaDaSequencia: boolean
  nomeAutor: string
  citada: MensagemEq | null | undefined
  nomeCitada: string
  situacao: 'enviando' | 'falhou' | 'enviada' | 'entregue' | 'lida'
  destacada: boolean
  acoes: AcoesDoBalao
  /** Chegou (ou saiu) com a conversa aberta: entra animada. */
  nova?: boolean
}

const LONGO = 900
function Texto({ t }: { t: string }) {
  const [inteiro, setInteiro] = useState(false)
  const corte = !inteiro && t.length > LONGO ? t.slice(0, 700).replace(/\s+\S*$/, '') : null
  return <>{partesDoTexto(corte ?? t).map((p, i) => (p.link
    ? <a key={i} href={p.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{p.texto}</a>
    : <span key={i}>{p.texto}</span>))}
    {corte && <>… <button type="button" className="eq-ler-mais" onClick={(e) => { e.stopPropagation(); setInteiro(true) }}>Ler mais</button></>}</>
}

export const Balao = memo(function Balao(p: PropsDoBalao) {
  const { m, minha, grupo, acoes } = p
  const el = useRef<HTMLDivElement>(null)
  const balao = useRef<HTMLDivElement>(null)
  const [arrasto, setArrasto] = useState(0)
  const gesto = useRef<{ x: number; y: number; id: number; horizontal: boolean | null; segurar: number | null; abriu: boolean } | null>(null)
  const ehVoz = m.midia?.tipo === 'audio' && !!(m.anexo || m.local)
  const ehFoto = !ehVoz && !!(m.anexo || m.local)
  const grande = !m.apagada && !ehFoto && !ehVoz && soEmoji(m.texto)
  const reacoes = Object.entries(m.reacoes ?? {})
  const contagem = new Map<string, number>()
  for (const [, e] of reacoes) contagem.set(e, (contagem.get(e) ?? 0) + 1)
  const pode = !m.apagada && !m.enviando && !m.falhou

  // toque: segurar abre o menu; arrastar para a direita responde
  const aoDescer = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' || !pode) return
    gesto.current = {
      x: e.clientX, y: e.clientY, id: e.pointerId, horizontal: null, abriu: false,
      segurar: window.setTimeout(() => {
        if (!gesto.current) return
        gesto.current.abriu = true; gesto.current.segurar = null
        vibrar(14)
        if (balao.current) acoes.menu(m, balao.current)
      }, 430),
    }
  }
  const aoMover = (e: React.PointerEvent) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId || g.abriu) return
    const dx = e.clientX - g.x, dy = e.clientY - g.y
    if (g.horizontal === null && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      g.horizontal = Math.abs(dx) > Math.abs(dy) * 1.3 && dx > 0
      if (g.segurar) { clearTimeout(g.segurar); g.segurar = null }
    }
    if (g.horizontal) {
      const v = Math.max(0, Math.min(84, dx * 0.75))
      if (v >= 56 && arrasto < 56) vibrar(8)
      setArrasto(v)
    }
  }
  const aoSubir = (e: React.PointerEvent) => {
    const g = gesto.current
    if (!g || g.id !== e.pointerId) return
    if (g.segurar) clearTimeout(g.segurar)
    if (g.horizontal && arrasto >= 56) acoes.responder(m)
    gesto.current = null
    setArrasto(0)
  }
  useEffect(() => () => { if (gesto.current?.segurar) clearTimeout(gesto.current.segurar) }, [])

  const tique = minha && !m.apagada && (
    p.situacao === 'enviando' ? <Ic d={I.relogio} className="eq-tique" />
      : p.situacao === 'falhou' ? <Ic d={I.alerta} className="eq-tique falhou" />
        : <Ic d={p.situacao === 'enviada' ? I.enviada : I.visto} className={`eq-tique ${p.situacao === 'lida' ? 'lida' : ''}`} />)

  return (
    <div ref={el} data-id={m.id}
      className={`eq-msg ${minha ? 'minha' : 'dele'} ${p.primeiraDaSequencia ? 'primeira' : 'seguida'} ${p.ultimaDaSequencia ? 'ultima' : ''} ${m.falhou ? 'falhou' : ''} ${p.destacada ? 'destacada' : ''} ${reacoes.length ? 'com-reacoes' : ''} ${p.nova ? 'nova' : ''}`}
      onPointerDown={aoDescer} onPointerMove={aoMover} onPointerUp={aoSubir} onPointerCancel={aoSubir}
      onContextMenu={(e) => { if (!pode || toque()) { if (toque()) e.preventDefault(); return } e.preventDefault(); if (balao.current) acoes.menu(m, balao.current) }}>
      <span className="eq-msg-resposta-icone" style={{ opacity: arrasto / 56, transform: `scale(${0.6 + Math.min(1, arrasto / 56) * 0.4})` }} aria-hidden="true"><Ic d={I.responder} /></span>
      {!minha && grupo && (p.ultimaDaSequencia ? <Avatar nome={p.nomeAutor} id={m.autor} tamanho={30} /> : <span className="eq-msg-avatar-vazio" />)}
      <div ref={balao} className={`eq-balao ${grande ? 'so-emoji' : ''} ${ehFoto ? 'com-foto' : ''} ${ehVoz ? 'com-voz' : ''}`}
        style={{ ['--tom' as string]: tomDe(m.autor), transform: arrasto ? `translateX(${arrasto}px)` : undefined, transition: arrasto ? 'none' : undefined }}>
        {!minha && grupo && p.primeiraDaSequencia && !grande && <span className="eq-msg-nome">{p.nomeAutor}</span>}
        {m.apagada ? <p className="eq-apagada"><Ic d={I.lixo} />{minha ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}<span className="eq-espaco-hora" /></p> : (
          <>
            {m.respostaA && (
              <button type="button" className="eq-citada" style={{ ['--tom' as string]: tomDe(p.citada?.autor ?? null) }}
                onClick={(e) => { e.stopPropagation(); acoes.irPara(m.respostaA!) }}>
                <b>{p.nomeCitada}</b>
                <span>{p.citada ? (p.citada.apagada ? 'Mensagem apagada' : p.citada.midia?.tipo === 'audio' ? `🎤 Mensagem de voz (${duracaoCurta(p.citada.midia.duracao)})` : p.citada.texto || (p.citada.anexo ? '📷 Foto' : '')) : 'Mensagem mais antiga'}</span>
              </button>
            )}
            {ehFoto && <Foto api={p.api} m={m} aoAmpliar={acoes.ampliar} />}
            {ehVoz && <Voz api={p.api} m={m} minha={minha} nome={p.nomeAutor} id={m.autor} />}
            {m.texto && <p><Texto t={m.texto} /><span className={`eq-espaco-hora ${m.editadaEm ? 'editada' : ''} ${minha ? 'minha' : ''}`} /></p>}
            {!m.texto && ehFoto && <span className="eq-foto-sombra" aria-hidden="true" />}
          </>
        )}
        <span className={`eq-msg-hora ${ehFoto && !m.texto ? 'sobre-foto' : ''}`}>
          {m.editadaEm && !m.apagada && <em>editada</em>}
          {horaCurta(m.criadaEm)}
          {tique}
        </span>
        {pode && !toque() && (
          <button type="button" className="eq-msg-seta" onClick={(e) => { e.stopPropagation(); if (balao.current) acoes.menu(m, balao.current) }} aria-label="Opções da mensagem"><Ic d={I.baixo} /></button>
        )}
      </div>
      {pode && !toque() && (
        <button type="button" className="eq-msg-reagir" onClick={(e) => { e.stopPropagation(); if (balao.current) acoes.menu(m, balao.current) }} aria-label="Reagir">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 100-18 9 9 0 000 18zM8.5 14.5a4.5 4.5 0 007 0M9 9.5h.01M15 9.5h.01" /></svg>
        </button>
      )}
      {m.falhou && (
        <button type="button" className="eq-msg-falhou" onClick={(e) => { e.stopPropagation(); acoes.reenviar(m) }}>Não enviou · toque para tentar de novo</button>
      )}
      {reacoes.length > 0 && (
        <button type="button" className="eq-reacoes" onClick={(e) => { e.stopPropagation(); acoes.verReacoes(m, e.currentTarget) }} aria-label="Ver reações">
          {[...contagem.entries()].slice(0, 3).map(([e]) => <span key={e}>{e}</span>)}
          {reacoes.length > 1 && <b>{reacoes.length}</b>}
        </button>
      )}
    </div>
  )
})

/* ------------------------------------------------ o menu da mensagem */
export const REACOES = ['👍', '❤️', '😂', '😮', '😢', '🙏']
export const MAIS_REACOES = ['🔥', '👏', '✅', '💰', '🚀', '👀', '🎉', '💯', '✈️', '😅', '🤝', '❌', '😍', '🤔', '💪', '⚡', '📈', '🙌']

export interface ItemDoMenu { rotulo: string; d: string; perigo?: boolean; aoEscolher: () => void }

export function MenuDaMensagem({ ancora, minha, minhaReacao, itens, rodape, aoReagir, aoFechar }: {
  ancora: DOMRect; minha: boolean; minhaReacao?: string; itens: ItemDoMenu[]; rodape?: React.ReactNode
  aoReagir?: (emoji: string) => void; aoFechar: () => void
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [mais, setMais] = useState(false)
  useLayoutEffect(() => {
    const c = caixa.current; if (!c) return
    const w = c.offsetWidth, h = c.offsetHeight
    const vw = window.innerWidth, vh = window.visualViewport?.height ?? window.innerHeight
    let top = ancora.bottom + 8
    if (top + h > vh - 12) top = Math.max(12, ancora.top - h - 8)
    let left = minha ? ancora.right - w : ancora.left
    left = Math.min(Math.max(10, left), vw - w - 10)
    setPos({ top, left })
  }, [ancora, minha, mais])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar() } }
    document.addEventListener('keydown', esc, true)
    return () => document.removeEventListener('keydown', esc, true)
  }, [aoFechar])
  return (
    <div className="eq-menu-fundo" onPointerDown={(e) => { if (e.target === e.currentTarget) aoFechar() }} onContextMenu={(e) => { e.preventDefault(); aoFechar() }}>
      <div ref={caixa} className="eq-menu" role="menu" style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}>
        {aoReagir && (
          <div className={`eq-menu-reacoes ${mais ? 'aberto' : ''}`}>
            {(mais ? [...REACOES, ...MAIS_REACOES] : REACOES).map((e) => (
              <button key={e} type="button" className={minhaReacao === e ? 'minha' : ''} onClick={() => { vibrar(8); aoReagir(e) }} aria-label={`Reagir com ${e}`}>{e}</button>
            ))}
            {!mais && <button type="button" className="eq-menu-mais" onClick={() => setMais(true)} aria-label="Mais reações"><Ic d={I.mais} /></button>}
          </div>
        )}
        {itens.length > 0 && (
          <div className="eq-menu-itens">
            {itens.map((i) => (
              <button key={i.rotulo} type="button" role="menuitem" className={i.perigo ? 'perigo' : ''} onClick={i.aoEscolher}>
                <span>{i.rotulo}</span><Ic d={i.d} />
              </button>
            ))}
          </div>
        )}
        {rodape}
      </div>
    </div>
  )
}

/* ------------------------------------------------ ver as fotos em tela cheia (galeria da conversa) */
export function Visualizador({ api, fotos, inicial, tituloDe, subtituloDe, aoFechar }: {
  api: EquipeApi; fotos: MensagemEq[]; inicial: string
  tituloDe: (m: MensagemEq) => string; subtituloDe: (m: MensagemEq) => string; aoFechar: () => void
}) {
  const [indice, setIndice] = useState(() => Math.max(0, fotos.findIndex((f) => f.id === inicial)))
  const foto = fotos[indice] ?? fotos[0]
  const { url } = useMidia(api, foto?.anexo ?? null, foto?.local)
  const [escala, setEscala] = useState(1)
  const [desl, setDesl] = useState({ x: 0, y: 0 })
  const [arrasto, setArrasto] = useState({ x: 0, y: 0 })
  const pontos = useRef(new Map<number, { x: number; y: number }>())
  const inicio = useRef<{ dist: number; escala: number; x: number; y: number; desl: { x: number; y: number } } | null>(null)
  const ultimoToque = useRef(0)
  const eixo = useRef<'x' | 'y' | null>(null)

  const ir = (d: number) => {
    setIndice((i) => Math.min(fotos.length - 1, Math.max(0, i + d)))
    setEscala(1); setDesl({ x: 0, y: 0 })
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); aoFechar() }
      else if (e.key === 'ArrowLeft') { e.stopPropagation(); ir(-1) }
      else if (e.key === 'ArrowRight') { e.stopPropagation(); ir(1) }
    }
    document.addEventListener('keydown', tecla, true)
    return () => document.removeEventListener('keydown', tecla, true)
  }, [aoFechar]) // eslint-disable-line react-hooks/exhaustive-deps

  const dist = () => { const [a, b] = [...pontos.current.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0 }
  const aoDescer = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    pontos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    inicio.current = { dist: dist(), escala, x: e.clientX, y: e.clientY, desl }
    eixo.current = null
    if (pontos.current.size === 1) {
      const agora = Date.now()
      if (agora - ultimoToque.current < 280) { setEscala((s) => (s > 1 ? 1 : 2.5)); setDesl({ x: 0, y: 0 }); ultimoToque.current = 0 } else ultimoToque.current = agora
    }
  }
  const aoMover = (e: React.PointerEvent) => {
    if (!pontos.current.has(e.pointerId) || !inicio.current) return
    pontos.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const i = inicio.current
    if (pontos.current.size >= 2 && i.dist) { setEscala(Math.min(5, Math.max(1, (i.escala * dist()) / i.dist))); return }
    const dx = e.clientX - i.x, dy = e.clientY - i.y
    if (escala > 1) { setDesl({ x: i.desl.x + dx, y: i.desl.y + dy }); return }
    // sem zoom: para o lado troca de foto, para baixo fecha
    if (!eixo.current && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) eixo.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (eixo.current === 'x') setArrasto({ x: dx, y: 0 })
    else if (eixo.current === 'y') setArrasto({ x: 0, y: Math.max(0, dy) })
  }
  const aoSubir = (e: React.PointerEvent) => {
    pontos.current.delete(e.pointerId)
    if (arrasto.y > 110) { aoFechar(); return }
    if (arrasto.x < -70) ir(1); else if (arrasto.x > 70) ir(-1)
    setArrasto({ x: 0, y: 0 })
    if (escala <= 1.02) { setEscala(1); setDesl({ x: 0, y: 0 }) }
    const resto = [...pontos.current.values()][0]
    inicio.current = resto ? { dist: dist(), escala, x: resto.x, y: resto.y, desl } : null
  }
  if (!foto) return null
  return (
    <div className="eq-visualizador" role="dialog" aria-label="Foto" style={{ background: `rgba(2, 8, 20, ${Math.max(0.35, 0.96 - arrasto.y / 400)})` }}>
      <header>
        <button type="button" className="eq-icone-btn" onClick={aoFechar} aria-label="Fechar"><Ic d={I.voltar} /></button>
        <span><b>{tituloDe(foto)}</b><small>{subtituloDe(foto)}{fotos.length > 1 ? ` · ${indice + 1} de ${fotos.length}` : ''}</small></span>
        {url && <a className="eq-icone-btn" href={url} download="foto-da-equipe" aria-label="Baixar a foto"><Ic d={I.baixar} /></a>}
      </header>
      <div className="eq-visualizador-area" onPointerDown={aoDescer} onPointerMove={aoMover} onPointerUp={aoSubir} onPointerCancel={aoSubir}
        onWheel={(e) => setEscala((s) => Math.min(5, Math.max(1, s - e.deltaY * 0.002)))}>
        {url ? <img key={foto.id} src={url} alt="" draggable={false}
          style={{ transform: `translate(${desl.x + arrasto.x}px, ${desl.y + arrasto.y}px) scale(${escala * (1 - arrasto.y / 1500)})`, transition: pontos.current.size ? 'none' : undefined }} />
          : <span className="eq-girando" />}
        {indice > 0 && <button type="button" className="eq-galeria-seta esquerda" onClick={(e) => { e.stopPropagation(); ir(-1) }} onPointerDown={(e) => e.stopPropagation()} aria-label="Foto anterior"><Ic d={I.voltar} /></button>}
        {indice < fotos.length - 1 && <button type="button" className="eq-galeria-seta direita" onClick={(e) => { e.stopPropagation(); ir(1) }} onPointerDown={(e) => e.stopPropagation()} aria-label="Próxima foto"><Ic d={I.voltar} /></button>}
      </div>
      {foto.texto && <p className="eq-visualizador-legenda">{foto.texto}</p>}
    </div>
  )
}

/** A onda ao vivo enquanto grava (as últimas barrinhas). */
export function OndaAoVivo({ nivel }: { nivel: number }) {
  const [barras, setBarras] = useState<number[]>(() => Array(28).fill(0.08))
  const atual = useRef(nivel)
  atual.current = nivel
  // corre a cada 100 ms, mesmo com o volume parado
  useEffect(() => {
    const t = window.setInterval(() => setBarras((b) => [...b.slice(1), Math.max(0.08, atual.current)]), 100)
    return () => window.clearInterval(t)
  }, [])
  return <span className="eq-onda-viva" aria-hidden="true">{barras.map((v, i) => <i key={i} style={{ height: `${Math.round(v * 100)}%` }} />)}</span>
}

export type { Midia }
