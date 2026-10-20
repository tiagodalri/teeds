import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as PEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { Track } from 'livekit-client'
import {
  definirCantoDoPlayer, definirModoDoTreino, definirTamanhoDoTreino, mandarNoTreino, sairDoTreino, treinoTrocouDeTela, useTreino,
  cantoDoTreino, liberarSomDoTreino, type ModoDoTreino,
} from '../../core/live/treino'
import { falarComoApresentador, useSimulacao, type MensagemSimulada } from '../../core/live/simulacao'
import { Icone, abrirPorCima, podeAbrirPorCima, useCelular, useLargo } from './AoVivo'
import './aovivo.css'

/**
 * A sala de treino fora da página "Ao vivo" (20/10/2026, pedido do Tiago:
 * "tudo o que a live tem"): janela flutuante que se arrasta e gruda no
 * canto, miniatura no celular (com o chat numa folha), ao lado do gráfico
 * no computador largo, só o áudio, e janela por cima de outros apps.
 *
 * Vale para os dois lados: o GF Member continua assistindo enquanto opera,
 * e o admin continua no ar enquanto navega pela plataforma (a câmera, a tela
 * e a simulação ficam no módulo `treino.ts`, não na página).
 */

const fmt = (n: number) => n.toLocaleString('pt-BR')
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Liga uma faixa recebida a um <video>. */
export function VideoDaFaixa({ faixa, className }: { faixa: Track | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!faixa || !el) return
    faixa.attach(el)
    return () => { faixa.detach(el) }
  }, [faixa])
  if (!faixa) return null
  return <video ref={ref} className={className} autoPlay playsInline muted />
}
/** A câmera ou a tela do próprio admin (a câmera em espelho, como ele se vê). */
function VideoLocal({ fluxo, className, espelhar = false }: { fluxo: MediaStream | null; className: string; espelhar?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = fluxo }, [fluxo])
  if (!fluxo) return null
  return <video ref={ref} className={className} autoPlay playsInline muted style={espelhar ? { transform: 'scaleX(-1)' } : undefined} />
}
function AudioDaFaixa({ faixa }: { faixa: Track }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => { const el = ref.current; if (!el) return; faixa.attach(el); return () => { faixa.detach(el) } }, [faixa])
  return <audio ref={ref} autoPlay />
}
/** O som do ensaio: fica montado em qualquer modo (inclusive no "só o áudio"). */
export function SomDoTreino() {
  const t = useTreino()
  if (t.apresentador || t.fase === 'fora') return null
  return <>{t.audios.map((a) => <AudioDaFaixa key={a.sid ?? a.mediaStreamTrack.id} faixa={a} />)}</>
}

/** A imagem do ensaio, com o selo "Simulação" sempre por cima. */
export function PalcoDoTreino({ compacto = false, filhos }: { compacto?: boolean; filhos?: ReactNode }) {
  const t = useTreino()
  const sim = useSimulacao()
  const eu = t.apresentador
  const { tela, camera } = t.local
  const temImagem = eu ? !!tela || !!camera : !!t.tela || !!t.camera
  const publico = eu ? sim.publicoAgora : t.sim.publico
  const ativa = eu ? sim.ativa : t.sim.ativa
  return (
    <div className={`av-palco ${compacto ? 'compacto' : ''}`}>
      {eu ? (
        <>
          {tela ? <VideoLocal fluxo={tela} className="av-tela" /> : camera ? <VideoLocal fluxo={camera} className="av-tela av-so-camera" espelhar /> : null}
          {tela && camera && <VideoLocal fluxo={camera} className={`av-camera canto-${cantoDoTreino()}`} espelhar />}
        </>
      ) : (
        <>
          {t.tela ? <VideoDaFaixa faixa={t.tela} className="av-tela" /> : t.camera ? <VideoDaFaixa faixa={t.camera} className="av-tela av-so-camera" /> : null}
          {t.tela && t.camera && <VideoDaFaixa faixa={t.camera} className={`av-camera canto-${t.canto}`} />}
        </>
      )}
      {!temImagem && (
        <div className="av-espera tr-espera">
          {t.fase === 'conectando' ? <><i className="av-girando" aria-hidden />Entrando na transmissão…</>
            : t.fase === 'reconectando' ? <><i className="av-girando" aria-hidden />Reconectando…</>
              : eu ? <><b>Sua imagem aparece aqui</b>{!compacto && <span>Ligue a câmera ou a tela na sala de treino.</span>}</>
                : t.presente ? <><b>O apresentador está na sala</b>{!compacto && <span>A imagem aparece quando ele ligar a câmera ou a tela.</span>}</>
                  : <><b>A transmissão ainda não começou</b>{!compacto && <span>Deixe esta tela aberta: a imagem aparece aqui sozinha.</span>}</>}
        </div>
      )}
      <span className="tr-selo"><i aria-hidden />Simulação{ativa && <> · {fmt(publico)}{compacto ? '' : ' na sala (simulado)'}</>}</span>
      {!eu && t.somBloqueado && <button className="av-som" onClick={() => void liberarSomDoTreino()}>Toque para ativar o som</button>}
      {filhos}
    </div>
  )
}

/** As mensagens que esta pessoa vê: o membro, as que chegam; o admin, as da simulação. */
function useMensagens(): MensagemSimulada[] {
  const t = useTreino()
  const sim = useSimulacao()
  return t.apresentador ? sim.mensagens : t.mensagens
}

/** O chat do ensaio. O membro escreve só para o apresentador; o admin responde como apresentador. */
export function ChatDoTreino({ titulo = true }: { titulo?: boolean }) {
  const t = useTreino()
  const mensagens = useMensagens()
  const [texto, setTexto] = useState('')
  const lista = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const l = lista.current
    if (l && l.scrollHeight - l.scrollTop - l.clientHeight < 140) l.scrollTop = l.scrollHeight
  }, [mensagens.length])
  useEffect(() => { const l = lista.current; if (l) l.scrollTop = l.scrollHeight }, [])
  const eu = t.apresentador
  const pode = eu || (t.fase === 'conectada' && t.presente)
  const enviar = async () => {
    if (!texto.trim()) return
    if (eu) falarComoApresentador(texto); else await mandarNoTreino(texto)
    setTexto('')
  }
  return (
    <section className="av-chat tr-chat" aria-label="Chat ao vivo">
      {titulo && <div className="tr-chat-topo"><h2>Chat ao vivo</h2></div>}
      <div className="av-mensagens" ref={lista} role="log" aria-live="off">
        {mensagens.length === 0 && <p className="av-chat-vazio">{(eu ? true : t.sim.ativa) ? 'O chat está começando…' : 'As mensagens aparecem aqui quando a transmissão começar.'}</p>}
        {mensagens.map((m) => m.entrada ? (
          <p key={m.id} className="tr-entrada">{m.nome} entrou</p>
        ) : (
          <div key={m.id} className={`av-msg ${m.apresentador ? 'mod' : ''} ${m.minha ? 'tr-minha' : ''}`}>
            <p><b>{m.nome}{m.apresentador && <em>{eu ? 'você' : 'apresentador'}</em>}{m.minha && <em className="tr-tag-membro">você</em>}{eu && m.membro && <em className="tr-tag-membro">membro</em>}</b> {m.texto}</p>
            <time>{hora(m.hora)}</time>
          </div>
        ))}
      </div>
      <form className="av-escrever" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
        <label htmlFor={`tr-chat-campo-${titulo ? 'p' : 'm'}`} className="av-oculto">Mensagem</label>
        <input id={`tr-chat-campo-${titulo ? 'p' : 'm'}`} value={texto} maxLength={500} autoComplete="off" enterKeyHint="send"
          placeholder={eu ? 'Responda como apresentador' : pode ? 'Escreva para o apresentador' : 'O chat abre quando a transmissão começar'}
          disabled={!pode} onChange={(e) => setTexto(e.target.value)} />
        <button type="submit" disabled={!pode || !texto.trim()}>Enviar</button>
      </form>
    </section>
  )
}

/** Mensagens novas com o chat fechado (o número no botão "Chat"). */
function useNaoLidas(aberto: boolean): number {
  const mensagens = useMensagens()
  const ultimaVista = useRef<string | null>(mensagens[mensagens.length - 1]?.id ?? null)
  if (aberto) { ultimaVista.current = mensagens[mensagens.length - 1]?.id ?? null; return 0 }
  const i = mensagens.findIndex((m) => m.id === ultimaVista.current)
  return mensagens.slice(i + 1).filter((m) => !m.entrada).length
}

const LARGURA = { P: 260, M: 380, G: 540 } as const

/** Fora da página "Ao vivo": o ensaio acompanha a pessoa pelas telas. */
export default function PlayerDoTreino(props: { naPagina: boolean; abrirPagina: () => void }) {
  return createPortal(<Conteudo {...props} />, document.body)
}

function Conteudo({ naPagina, abrirPagina }: { naPagina: boolean; abrirPagina: () => void }) {
  const t = useTreino()
  const [chat, setChat] = useState(false)
  // na página o chat está à vista: o que foi lido lá não conta como novo no player
  const naoLidas = useNaoLidas(chat || naPagina)
  const [arrasto, setArrasto] = useState<{ x: number; y: number } | null>(null)
  const inicio = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const largo = useLargo()
  const celular = useCelular()
  const eu = t.apresentador

  useEffect(() => { treinoTrocouDeTela(naPagina) }, [naPagina])
  const modo: ModoDoTreino = t.modo === 'lado' && !largo ? 'flutuante' : t.modo
  useEffect(() => {
    document.body.classList.toggle('aovivo-lado', !naPagina && modo === 'lado' && t.fase !== 'fora')
    return () => document.body.classList.remove('aovivo-lado')
  }, [naPagina, modo, t.fase])
  // o membro saiu da página e o apresentador foi embora: fecha sozinho em 20 s
  useEffect(() => {
    if (naPagina || eu || t.presente || t.fase === 'conectando') return
    const id = window.setTimeout(() => void sairDoTreino(), 20_000)
    return () => window.clearTimeout(id)
  }, [naPagina, eu, t.presente, t.fase])

  if (naPagina || t.fase === 'fora') return <SomDoTreino />

  const fechar = () => { void sairDoTreino() }
  const pip = () => abrirPorCima(caixa.current)
  const temImagem = eu ? !!t.local.tela || !!t.local.camera : !!t.tela || !!t.camera
  const rotuloFechar = eu ? 'Encerrar a sala de treino' : 'Sair da transmissão'
  const descricao = eu ? `Sala de treino · ${t.membros} ${t.membros === 1 ? 'membro' : 'membros'}` : 'Sala de treino · ao vivo'

  if (modo === 'pilula') {
    return (
      <>
        <SomDoTreino />
        <div className="av-pilula" role="region" aria-label="Sala de treino minimizada">
          <i className="av-ponto" aria-hidden />
          <span onClick={() => definirModoDoTreino('flutuante', false)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') definirModoDoTreino('flutuante', false) }}>{descricao}</span>
          <button onClick={() => definirModoDoTreino('flutuante', false)} aria-label="Mostrar o vídeo" title="Mostrar o vídeo"><Icone nome="video" /></button>
          <button onClick={fechar} aria-label={rotuloFechar} title={rotuloFechar}><Icone nome="fechar" /></button>
        </div>
      </>
    )
  }

  const controles = (
    <div className="av-controles">
      {modo === 'flutuante' && (['P', 'M', 'G'] as const).map((tm) => (
        <button key={tm} className={t.tamanho === tm ? 'on' : ''} onClick={() => definirTamanhoDoTreino(tm)} aria-label={`Tamanho ${tm === 'P' ? 'pequeno' : tm === 'M' ? 'médio' : 'grande'}`}>{tm}</button>
      ))}
      {largo && <button onClick={() => definirModoDoTreino(modo === 'lado' ? 'flutuante' : 'lado', false)} title={modo === 'lado' ? 'Soltar como janela flutuante' : 'Encaixar ao lado do gráfico'} aria-label={modo === 'lado' ? 'Soltar como janela flutuante' : 'Encaixar ao lado do gráfico'}><Icone nome={modo === 'lado' ? 'solto' : 'lado'} /></button>}
      {podeAbrirPorCima() && temImagem && <button onClick={() => void pip()} title="Janela fora do navegador" aria-label="Janela fora do navegador"><Icone nome="pip" /></button>}
      <button onClick={abrirPagina} title="Abrir em tela grande" aria-label="Abrir em tela grande"><Icone nome="grande" /></button>
      <button onClick={() => definirModoDoTreino('pilula', false)} title={eu ? 'Minimizar' : 'Só o áudio'} aria-label={eu ? 'Minimizar' : 'Minimizar para só o áudio'}><Icone nome="audio" /></button>
      <button onClick={fechar} title={rotuloFechar} aria-label={rotuloFechar}><Icone nome="fechar" /></button>
    </div>
  )

  if (modo === 'lado') {
    return (
      <aside className="av-lado" aria-label="Sala de treino" ref={caixa}>
        <SomDoTreino />
        <div className="av-lado-video"><PalcoDoTreino compacto />{controles}</div>
        <div className="av-lado-info"><b>Sala de treino</b><span>{eu ? `${t.membros} ${t.membros === 1 ? 'membro assistindo' : 'membros assistindo'}` : 'ao vivo'}</span></div>
        <ChatDoTreino titulo={false} />
      </aside>
    )
  }

  // flutuante: arrasta pela imagem, solta e gruda no canto mais perto. No
  // celular é uma miniatura; o chat abre numa folha por baixo.
  const largura = celular
    ? Math.round(window.innerWidth * ({ P: 0.38, M: 0.48, G: 0.62 }[t.tamanho]))
    : Math.min(LARGURA[t.tamanho], window.innerWidth - 24)
  const margem = celular ? 10 : 16
  const posicao: CSSProperties = arrasto
    ? { left: arrasto.x, top: arrasto.y, width: largura }
    : {
      width: largura,
      ...(t.cantoPlayer.startsWith('sup') ? { top: `calc(var(--topo-h, 76px) + ${margem}px)` } : { bottom: `calc(${margem}px + var(--sab, 0px))` }),
      ...(t.cantoPlayer.endsWith('esq') ? { left: `calc(${margem}px + var(--sal, 0px))` } : { right: `calc(${margem}px + var(--sar, 0px))` }),
    }
  const descer = (e: PEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    const r = caixa.current!.getBoundingClientRect()
    inicio.current = { px: e.clientX, py: e.clientY, x: r.left, y: r.top }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const mover = (e: PEvent) => {
    if (!inicio.current) return
    const i = inicio.current
    setArrasto({ x: i.x + e.clientX - i.px, y: i.y + e.clientY - i.py })
  }
  const soltar = () => {
    if (!inicio.current) return
    inicio.current = null
    const r = caixa.current!.getBoundingClientRect()
    const meioX = r.left + r.width / 2, meioY = r.top + r.height / 2
    definirCantoDoPlayer(`${meioY < window.innerHeight / 2 ? 'sup' : 'inf'}-${meioX < window.innerWidth / 2 ? 'esq' : 'dir'}`)
    setArrasto(null)
  }
  const botaoChat = (
    <button className="av-chat-botao" onClick={() => setChat(!chat)} aria-expanded={chat}>
      Chat{naoLidas > 0 && !chat && <span className="av-badge">{naoLidas > 99 ? '99+' : naoLidas}</span>}
    </button>
  )
  const proximoTamanho = { P: 'M', M: 'G', G: 'P' } as const
  const barraMini = (
    <div className="av-mini-barra">
      {botaoChat}
      <button onClick={() => definirTamanhoDoTreino(proximoTamanho[t.tamanho])} aria-label="Mudar o tamanho da miniatura" title="Tamanho">{t.tamanho}</button>
      {podeAbrirPorCima() && temImagem && <button onClick={() => void pip()} aria-label="Janela fora do navegador" title="Janela fora do navegador"><Icone nome="pip" /></button>}
      <button onClick={abrirPagina} aria-label="Abrir em tela grande" title="Abrir em tela grande"><Icone nome="grande" /></button>
      <button onClick={() => definirModoDoTreino('pilula', false)} aria-label={eu ? 'Minimizar' : 'Minimizar para só o áudio'} title={eu ? 'Minimizar' : 'Só o áudio'}><Icone nome="audio" /></button>
      <button onClick={fechar} aria-label={rotuloFechar} title={rotuloFechar}><Icone nome="fechar" /></button>
    </div>
  )
  return (
    <>
      <div className={`av-flutuante ${t.cantoPlayer.startsWith('inf') ? 'embaixo' : ''} ${arrasto ? 'arrastando' : ''} ${celular ? `mini lado-${t.cantoPlayer.endsWith('esq') ? 'esq' : 'dir'}` : ''}`} style={posicao} ref={caixa} role="region" aria-label="Sala de treino">
        <SomDoTreino />
        <div className="av-flutuante-video" onPointerDown={descer} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
          <PalcoDoTreino compacto />
          {!celular && controles}
        </div>
        {celular ? barraMini : botaoChat}
        {chat && !celular && <div className="av-flutuante-chat"><ChatDoTreino titulo={false} /></div>}
      </div>
      {chat && celular && (
        <div className="av-folha-fundo" onClick={() => setChat(false)}>
          <div className="av-folha" role="dialog" aria-label="Chat da sala de treino" onClick={(e) => e.stopPropagation()}>
            <button className="av-folha-alca" aria-label="Fechar o chat" onClick={() => setChat(false)}><i aria-hidden /></button>
            <div className="av-folha-cabeca"><b>Sala de treino</b><span>{eu ? `${t.membros} ${t.membros === 1 ? 'membro' : 'membros'}` : 'ao vivo'}</span></div>
            <ChatDoTreino titulo={false} />
          </div>
        </div>
      )}
    </>
  )
}
