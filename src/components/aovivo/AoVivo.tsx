import React, { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PEvent } from 'react'
import { createPortal } from 'react-dom'
import { LocalVideoTrack, type Track } from 'livekit-client'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { apagarLive, conviteRecebido, criarLive, esquecerTreinoPedido, linkDaLive, listarLives, mudarLive, podeTreinar, treinoPedido, type CantoDaCamera, type Live } from '../../core/live/api'
import { useTreino } from '../../core/live/treino'
import { mudarLinkPublico, useLinkPublico } from '../../core/live/config'
import { LinkDoTreino, SalaDeTreino } from './SalaDeTreino'
import { AssistirTreino } from './AssistirTreino'
import { MedidorDeVolume } from './MedidorDeVolume'
import { SeletorDeFundo } from './SeletorDeFundo'
import { LIVES_AO_VIVO, MARCA } from '../../marca'

const MARCA_PROSA = MARCA.prosa
import { FUNDOS } from '../../core/live/fundos'
import {
  abrirChat, aoTrocarDeTela, apagarMensagem, atualizarLive, definirFundo, definirModoLento, listarDispositivos, mostrarFaixa, posicionarCamera, renomearLive, trocarDispositivo, avisarFim, definirCanto, definirModo, definirTamanho, entrar, fixarMensagem,
  liberarSom, mandarMensagem, marcarChatAberto, reagir, sair, salaAgora, silenciarPessoa, transmitirCamera,
  simularSala, transmitirMicrofone, transmitirTela, useSala, REACOES, criarEnquete, encerrarEnquete, votar,
  type EstadoDaSala, type ModoDoPlayer, type Reacao,
} from '../../core/live/sala'
import './aovivo.css'

/* ===================================================================== peças */

/** Liga uma faixa de vídeo do LiveKit a um <video>. */
function Video({ faixa, className, espelhar = false }: { faixa: Track | null; className?: string; espelhar?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!faixa || !el) return
    faixa.attach(el)
    return () => { faixa.detach(el) }
  }, [faixa])
  if (!faixa) return null
  return <video ref={ref} className={className} autoPlay playsInline muted style={espelhar ? { transform: 'scaleX(-1)' } : undefined} />
}

/** O som da live: fica montado em qualquer modo (inclusive na pílula). */
export function Som({ faixas }: { faixas: Track[] }) {
  return <>{faixas.map((f) => <AudioDaFaixa key={f.sid ?? f.mediaStreamTrack.id} faixa={f} />)}</>
}
function AudioDaFaixa({ faixa }: { faixa: Track }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    faixa.attach(el)
    return () => { faixa.detach(el) }
  }, [faixa])
  return <audio ref={ref} autoPlay />
}

/**
 * Põe o vídeo numa janelinha por cima de outros apps (Android, computador) ou
 * no modo flutuante do iPhone. É o que deixa o aluno operar na corretora com
 * a live no canto.
 */
export async function abrirPorCima(raiz: HTMLElement | null): Promise<boolean> {
  const v = (raiz?.querySelector('video.av-tela') ?? raiz?.querySelector('video')) as (HTMLVideoElement & { webkitSetPresentationMode?: (m: string) => void; webkitSupportsPresentationMode?: (m: string) => boolean }) | null
  if (!v) return false
  try {
    if (document.pictureInPictureEnabled && !v.disablePictureInPicture) { await v.requestPictureInPicture(); return true }
    if (v.webkitSupportsPresentationMode?.('picture-in-picture')) { v.webkitSetPresentationMode?.('picture-in-picture'); return true }
  } catch { /* o navegador recusou */ }
  return false
}
export const podeAbrirPorCima = () => typeof document !== 'undefined' &&
  (document.pictureInPictureEnabled || 'webkitSupportsPresentationMode' in HTMLVideoElement.prototype)

/** Acompanha uma media query (a tela gira, a janela muda: o player acompanha). */
function useMedia(consulta: string): boolean {
  const [vale, setVale] = useState(() => typeof window !== 'undefined' && window.matchMedia(consulta).matches)
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const f = () => setVale(mq.matches)
    f(); mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [consulta])
  return vale
}
/** Tela larga: cabe o player encaixado ao lado do gráfico. */
export const useLargo = () => useMedia('(min-width: 1100px)')
/** Celular: o player flutuante vira uma miniatura e o chat abre numa folha. */
export const useCelular = () => useMedia('(max-width: 700px)')

const EMOJI: Record<Reacao, string> = { coracao: '❤️', fogo: '🔥', palmas: '👏', foguete: '🚀', cem: '💯' }
const NOME_REACAO: Record<Reacao, string> = { coracao: 'Coração', fogo: 'Fogo', palmas: 'Palmas', foguete: 'Foguete', cem: 'Cem por cento' }

/** As reações subindo pela imagem, como nas lives de rede social. */
function Reacoes({ s }: { s: EstadoDaSala }) {
  if (s.reacoes.length === 0) return null
  return (
    <div className="av-reacoes" aria-hidden>
      {s.reacoes.map((r) => <span key={r.id} className={`av-reacao ${r.minha ? 'minha' : ''}`} style={{ left: `${r.x}%` }}>{EMOJI[r.tipo]}</span>)}
    </div>
  )
}

/** A barra para reagir: coração, fogo, palmas, foguete, cem. */
function BarraDeReacoes({ s, compacta = false }: { s: EstadoDaSala; compacta?: boolean }) {
  const pode = s.fase === 'conectada' && s.live?.status === 'ao_vivo'
  return (
    <div className={`av-reagir ${compacta ? 'compacta' : ''}`} role="group" aria-label="Reagir">
      {REACOES.map((r) => (
        <button key={r} disabled={!pode} onClick={() => void reagir(r)} aria-label={NOME_REACAO[r]} title={NOME_REACAO[r]}>{EMOJI[r]}</button>
      ))}
    </div>
  )
}

/**
 * A enquete na tela de quem assiste: vota com um toque; depois vê as barras
 * subindo ao vivo. Para o apresentador, só as barras (ele vota pelo painel).
 */
export function CartaoEnquete({ s, compacto = false }: { s: EstadoDaSala; compacto?: boolean }) {
  const e = s.enquete
  const [recolhida, setRecolhida] = useState(false)
  // enquete nova chega aberta (mesmo que a anterior tenha sido recolhida)
  useEffect(() => { setRecolhida(false) }, [e?.id])
  if (!e) return null
  const total = e.votos.reduce((a, b) => a + b, 0)
  const podeVotar = e.aberta && e.meuVoto === null && !s.moderador && s.fase === 'conectada'
  const vencedora = !e.aberta && total > 0 ? e.votos.indexOf(Math.max(...e.votos)) : -1
  return (
    <section className={`av-enquete ${compacto ? 'compacta' : ''} ${e.aberta ? 'aberta' : 'fechada'} ${recolhida ? 'recolhida' : ''}`} aria-live="polite" aria-label="Enquete">
      <header>
        <span className="av-sobretitulo">{e.aberta ? 'Enquete ao vivo' : 'Resultado da enquete'}</span>
        <small>{total} {total === 1 ? 'voto' : 'votos'}</small>
        <button type="button" className="av-enquete-recolher" aria-expanded={!recolhida} aria-label={recolhida ? 'Mostrar a enquete' : 'Recolher a enquete'} onClick={() => setRecolhida(!recolhida)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={recolhida ? 'M6 9l6 6 6-6' : 'M18 15l-6-6-6 6'} /></svg>
        </button>
      </header>
      <p className="av-enquete-pergunta">{e.pergunta}</p>
      {!recolhida && <div className="av-enquete-opcoes" role={podeVotar ? 'group' : undefined}>
        {e.opcoes.map((o, i) => {
          const pct = total ? Math.round((e.votos[i] ?? 0) / total * 100) : 0
          return podeVotar ? (
            <button key={i} className="av-enquete-opcao votar" onClick={() => void votar(i)}>{o}</button>
          ) : (
            <div key={i} className={`av-enquete-opcao barra ${e.meuVoto === i ? 'minha' : ''} ${vencedora === i ? 'vencedora' : ''}`}>
              <i style={{ width: `${pct}%` }} aria-hidden />
              <span>{o}{e.meuVoto === i && <em>seu voto</em>}</span>
              <b>{pct}%</b>
            </div>
          )
        })}
      </div>}
    </section>
  )
}

/** Aviso discreto quando a conexão de quem assiste está ruim. */
function Qualidade({ s }: { s: EstadoDaSala }) {
  if (s.qualidade === 'boa' || s.qualidade === 'media' || s.fase !== 'conectada') return null
  return <span className="av-qualidade" role="status">{s.qualidade === 'perdida' ? 'Sem conexão' : 'Conexão fraca'}</span>
}

/** A imagem da live: a tela do apresentador, com a câmera num círculo no canto. */
function Palco({ s, compacto = false, filhos }: { s: EstadoDaSala; compacto?: boolean; filhos?: React.ReactNode }) {
  const telaRef = useRef<HTMLDivElement>(null)
  const souEu = s.moderador && (s.transmitindo.tela || s.transmitindo.camera)
  const vazio = !s.tela && !s.camera
  // Quem transmite a TELA INTEIRA não vê a própria tela aqui dentro: a prévia
  // apareceria dentro da tela compartilhada, num espelho infinito que muda a
  // imagem o tempo todo e pesa na codificação (19/10/2026). Os alunos veem normal.
  const [verPrevia, setVerPrevia] = useState(false)
  const telaInteira = s.moderador && s.transmitindo.tela && !compacto &&
    (s.tela?.mediaStreamTrack?.getSettings() as MediaTrackSettings & { displaySurface?: string } | undefined)?.displaySurface === 'monitor'
  const ocultarTela = telaInteira && !verPrevia
  // toque duplo na imagem manda um coração (quem assiste; o apresentador só vê)
  const coracao = () => { if (!s.moderador && !compacto) void reagir('coracao') }
  return (
    <div className={`av-palco ${compacto ? 'compacto' : ''}`} ref={telaRef} onDoubleClick={coracao}>
      {s.tela && ocultarTela ? (
        <div className="av-previa-oculta">
          <b>Sua tela inteira está no ar</b>
          <span>A prévia fica oculta aqui para não criar o efeito espelho e deixar o computador leve. Os alunos veem normalmente.</span>
          <button type="button" onClick={() => setVerPrevia(true)}>Mostrar prévia</button>
        </div>
      ) : s.tela ? <Video faixa={s.tela} className="av-tela" /> : s.camera ? <Video faixa={s.camera} className="av-tela av-so-camera" espelhar={souEu} /> : null}
      {s.tela && s.camera && <Video faixa={s.camera} className={`av-camera canto-${s.live?.cameraCanto ?? 'inf-dir'} tam-${s.live?.cameraTamanho ?? 'm'}`} espelhar={souEu} />}
      {s.live?.faixa && (
        <div className={`av-faixa ${(s.live.cameraCanto ?? 'inf-dir').startsWith('inf') && s.camera && s.tela ? `desvia-${s.live.cameraCanto}` : ''}`} role="status">
          <i aria-hidden /><span>{s.live.faixa}</span>
        </div>
      )}
      {vazio && (
        <div className="av-espera">
          {s.fase === 'conectando' ? <><i className="av-girando" aria-hidden />Entrando na transmissão…</>
            : s.fase === 'reconectando' ? <><i className="av-girando" aria-hidden />Reconectando…</>
              : s.moderador ? 'Ligue a tela ou a câmera para começar.' : 'Aguardando o apresentador.'}
        </div>
      )}
      {s.fase === 'reconectando' && !vazio && <div className="av-aviso-topo">Reconectando…</div>}
      {s.live?.status === 'ao_vivo' && <span className="av-selo"><i aria-hidden />Ao vivo</span>}
      <Qualidade s={s} />
      <Reacoes s={s} />
      {s.somBloqueado && <button className="av-som" onClick={() => void liberarSom()}>Toque para ativar o som</button>}
      {filhos}
    </div>
  )
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** O chat: mensagem fixada no topo, lista, campo. O moderador modera pelo menu de cada mensagem. */
export function Chat({ s, aberto = true }: { s: EstadoDaSala; aberto?: boolean }) {
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [menu, setMenu] = useState<string | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const lista = useRef<HTMLDivElement>(null)
  const fixada = s.mensagens.find((m) => m.fixada)
  useEffect(() => { marcarChatAberto(aberto); return () => marcarChatAberto(false) }, [aberto])
  useEffect(() => {
    const l = lista.current
    // só rola sozinho se a pessoa já estava no fim (não puxa quem está lendo lá em cima)
    if (l && l.scrollHeight - l.scrollTop - l.clientHeight < 120) fim.current?.scrollIntoView({ block: 'end' })
  }, [s.mensagens.length])
  const fechado = s.live?.chatAberto === false
  const podeEscrever = s.fase === 'conectada' && s.live?.status === 'ao_vivo' && !s.silenciado && (!fechado || s.moderador)
  const enviar = async () => {
    if (!texto.trim()) return
    setErro(null)
    try { await mandarMensagem(texto); setTexto('') } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível enviar.') }
  }
  return (
    <section className="av-chat" aria-label="Chat da transmissão">
      {fixada && (
        <div className="av-fixada">
          <small>Fixada pelo moderador</small>
          <p><b>{fixada.nome}</b> {fixada.texto}</p>
          {s.moderador && <button onClick={() => void fixarMensagem(null)}>Desafixar</button>}
        </div>
      )}
      <div className="av-mensagens" ref={lista} role="log" aria-live="polite">
        {s.mensagens.length === 0 && <p className="av-chat-vazio">As mensagens aparecem aqui. Diga oi para a turma.</p>}
        {s.mensagens.map((m) => (
          <div key={m.id} className={`av-msg ${m.doModerador ? 'mod' : ''}`}>
            <p><b>{m.nome}{m.doModerador && <em>moderador</em>}</b> {m.texto}</p>
            <time>{hora(m.criadaEm)}</time>
            {s.moderador && !m.doModerador && (
              <>
                <button className="av-msg-mais" aria-label="Moderar mensagem" onClick={() => setMenu(menu === m.id ? null : m.id)}>⋯</button>
                {menu === m.id && (
                  <div className="av-msg-menu" role="menu">
                    <button role="menuitem" onClick={() => { void fixarMensagem(m.id); setMenu(null) }}>Fixar no topo</button>
                    <button role="menuitem" onClick={() => { void apagarMensagem(m.id); setMenu(null) }}>Apagar</button>
                    <button role="menuitem" onClick={() => { void silenciarPessoa(m.userId); void apagarMensagem(m.id); setMenu(null) }}>Silenciar {m.nome}</button>
                  </div>
                )}
              </>
            )}
            {s.moderador && m.doModerador && (
              <button className="av-msg-mais" aria-label="Fixar mensagem" title="Fixar no topo" onClick={() => void fixarMensagem(m.id)}>⌃</button>
            )}
          </div>
        ))}
        <div ref={fim} />
      </div>
      {fechado && <p className="av-chat-fechado">{s.moderador ? 'Chat fechado para os alunos: só a equipe escreve.' : 'O chat está fechado agora. Você continua lendo as mensagens.'}</p>}
      <form className="av-escrever" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
        <label htmlFor="av-campo" className="av-oculto">Mensagem</label>
        <input id="av-campo" value={texto} maxLength={500} autoComplete="off"
          placeholder={s.silenciado ? 'O moderador pausou suas mensagens' : fechado && !s.moderador ? 'Chat fechado pelo moderador' : podeEscrever ? 'Escreva no chat' : 'O chat abre quando a live começar'}
          disabled={!podeEscrever} onChange={(e) => { setTexto(e.target.value); setErro(null) }} />
        <button type="submit" disabled={!podeEscrever || !texto.trim()} aria-label="Enviar">Enviar</button>
      </form>
      {erro && <p className="av-erro" role="alert">{erro}</p>}
    </section>
  )
}

/* ============================================================ player global */

/** Ícones dos controles do player (traço, herdam a cor). */
const ICONE: Record<string, string> = {
  lado: 'M3 5h18v14H3zM15 5v14',
  solto: 'M3 5h18v14H3zM12 12h7v5h-7z',
  pip: 'M3 5h18v12H3zM13 11h6v5h-6zM8 21h8',
  grande: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  audio: 'M4 10v4h4l5 4V6L8 10zM16.5 9a4 4 0 010 6',
  fechar: 'M6 6l12 12M18 6L6 18',
  video: 'M3 6h13v12H3zM16 10l5-3v10l-5-3',
}
export function Icone({ nome }: { nome: string }) {
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={ICONE[nome]} /></svg>
}

const LARGURA: Record<EstadoDaSala['tamanho'], number> = { P: 260, M: 380, G: 540 }

/**
 * O player que acompanha a pessoa pelas telas: lado a lado, flutuante ou
 * pílula. Na página "Ao vivo" ele some (lá o palco é a página inteira).
 */
export function PlayerGlobal(props: { naPagina: boolean; abrirPagina: () => void }) {
  // Vai direto no <body>: nenhum contêiner da página (largura, transform,
  // overflow) consegue prender ou esticar o player.
  return createPortal(<PlayerConteudo {...props} />, document.body)
}

function PlayerConteudo({ naPagina, abrirPagina }: { naPagina: boolean; abrirPagina: () => void }) {
  const s = useSala()
  const [chat, setChat] = useState(false)
  const [arrasto, setArrasto] = useState<{ x: number; y: number } | null>(null)
  const inicio = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const largo = useLargo()
  const celular = useCelular()

  useEffect(() => { aoTrocarDeTela(naPagina) }, [naPagina])
  const modo: ModoDoPlayer = s.modo === 'lado' && !largo ? 'flutuante' : s.modo
  useEffect(() => {
    document.body.classList.toggle('aovivo-lado', !naPagina && modo === 'lado' && s.fase !== 'fora')
    return () => document.body.classList.remove('aovivo-lado')
  }, [naPagina, modo, s.fase])

  // o som fica aqui em qualquer modo, inclusive na página (o palco só cuida da imagem)
  if (naPagina || s.fase === 'fora') return <Som faixas={s.fase === 'fora' ? [] : s.audios} />

  const fechar = () => { void sair() }
  const pip = () => abrirPorCima(caixa.current)

  if (modo === 'pilula') {
    return (
      <>
        <Som faixas={s.audios} />
        <div className="av-pilula" role="region" aria-label="Transmissão ao vivo minimizada">
          <i className="av-ponto" aria-hidden />
          <span onClick={() => definirModo('flutuante', false)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') definirModo('flutuante', false) }}>Ao vivo · {s.espectadores} assistindo</span>
          <button onClick={() => definirModo('flutuante', false)} aria-label="Mostrar o vídeo" title="Mostrar o vídeo"><Icone nome="video" /></button>
          <button onClick={fechar} aria-label="Sair da transmissão" title="Sair da transmissão"><Icone nome="fechar" /></button>
        </div>
      </>
    )
  }

  const controles = (
    <div className="av-controles">
      {modo === 'flutuante' && (['P', 'M', 'G'] as const).map((t) => (
        <button key={t} className={s.tamanho === t ? 'on' : ''} onClick={() => definirTamanho(t)} aria-label={`Tamanho ${t === 'P' ? 'pequeno' : t === 'M' ? 'médio' : 'grande'}`}>{t}</button>
      ))}
      {largo && <button onClick={() => definirModo(modo === 'lado' ? 'flutuante' : 'lado', false)} title={modo === 'lado' ? 'Soltar como janela flutuante' : 'Encaixar ao lado do gráfico'} aria-label={modo === 'lado' ? 'Soltar como janela flutuante' : 'Encaixar ao lado do gráfico'}><Icone nome={modo === 'lado' ? 'solto' : 'lado'} /></button>}
      {podeAbrirPorCima() && (s.tela || s.camera) && <button onClick={() => void pip()} title="Janela fora do navegador" aria-label="Janela fora do navegador"><Icone nome="pip" /></button>}
      <button onClick={abrirPagina} title="Abrir em tela grande" aria-label="Abrir em tela grande"><Icone nome="grande" /></button>
      <button onClick={() => definirModo('pilula', false)} title="Só o áudio" aria-label="Minimizar para só o áudio"><Icone nome="audio" /></button>
      <button onClick={fechar} title="Sair da transmissão" aria-label="Sair da transmissão"><Icone nome="fechar" /></button>
    </div>
  )

  if (modo === 'lado') {
    return (
      <aside className="av-lado" aria-label="Transmissão ao vivo" ref={caixa}>
        <Som faixas={s.audios} />
        <div className="av-lado-video"><Palco s={s} compacto />{controles}</div>
        <div className="av-lado-info"><b>{s.live?.titulo}</b><span>{s.espectadores} assistindo</span></div>
        <CartaoEnquete s={s} compacto />
        <Chat s={s} />
      </aside>
    )
  }

  // flutuante: arrasta pela imagem, solta e gruda no canto mais perto.
  // No celular é uma miniatura (como o player pequeno do YouTube): a pessoa
  // continua operando com a live no canto; o chat abre numa folha por baixo.
  const largura = celular
    ? Math.round(window.innerWidth * ({ P: 0.38, M: 0.48, G: 0.62 }[s.tamanho]))
    : Math.min(LARGURA[s.tamanho], window.innerWidth - 24)
  const margem = celular ? 10 : 16
  const posicao: CSSProperties = arrasto
    ? { left: arrasto.x, top: arrasto.y, width: largura }
    : {
      width: largura,
      ...(s.canto.startsWith('sup') ? { top: `calc(var(--topo-h, 76px) + ${margem}px)` } : { bottom: `calc(${margem}px + var(--sab, 0px))` }),
      ...(s.canto.endsWith('esq') ? { left: `calc(${margem}px + var(--sal, 0px))` } : { right: `calc(${margem}px + var(--sar, 0px))` }),
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
    definirCanto(`${meioY < window.innerHeight / 2 ? 'sup' : 'inf'}-${meioX < window.innerWidth / 2 ? 'esq' : 'dir'}`)
    setArrasto(null)
  }
  const botaoChat = (
    <button className="av-chat-botao" onClick={() => setChat(!chat)} aria-expanded={chat}>
      Chat{s.naoLidas > 0 && !chat && <span className="av-badge">{s.naoLidas > 99 ? '99+' : s.naoLidas}</span>}
    </button>
  )
  // no celular os controles ficam numa barra sob a miniatura (a imagem fica limpa e o dedo acerta)
  const proximoTamanho = { P: 'M', M: 'G', G: 'P' } as const
  const barraMini = (
    <div className="av-mini-barra">
      {botaoChat}
      <button onClick={() => definirTamanho(proximoTamanho[s.tamanho])} aria-label="Mudar o tamanho da miniatura" title="Tamanho">{s.tamanho}</button>
      {podeAbrirPorCima() && (s.tela || s.camera) && <button onClick={() => void pip()} aria-label="Janela fora do navegador" title="Janela fora do navegador"><Icone nome="pip" /></button>}
      <button onClick={abrirPagina} aria-label="Abrir em tela grande" title="Abrir em tela grande"><Icone nome="grande" /></button>
      <button onClick={() => definirModo('pilula', false)} aria-label="Minimizar para só o áudio" title="Só o áudio"><Icone nome="audio" /></button>
      <button onClick={fechar} aria-label="Sair da transmissão" title="Sair da transmissão"><Icone nome="fechar" /></button>
    </div>
  )
  return (
    <>
      <div className={`av-flutuante ${s.canto.startsWith('inf') ? 'embaixo' : ''} ${arrasto ? 'arrastando' : ''} ${celular ? `mini lado-${s.canto.endsWith('esq') ? 'esq' : 'dir'}` : ''}`} style={posicao} ref={caixa} role="region" aria-label="Transmissão ao vivo">
        <Som faixas={s.audios} />
        <div className="av-flutuante-video" onPointerDown={descer} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
          <Palco s={s} compacto />
          {!celular && controles}
          {s.erro && s.fase === 'erro' && <div className="av-espera">{s.erro}</div>}
        </div>
        {celular ? barraMini : botaoChat}
        {chat && !celular && <div className="av-flutuante-chat"><Chat s={s} aberto /></div>}
      </div>
      {chat && celular && (
        <div className="av-folha-fundo" onClick={() => setChat(false)}>
          <div className="av-folha" role="dialog" aria-label="Chat da transmissão" onClick={(e) => e.stopPropagation()}>
            <button className="av-folha-alca" aria-label="Fechar o chat" onClick={() => setChat(false)}><i aria-hidden /></button>
            <div className="av-folha-cabeca"><b>{s.live?.titulo}</b><span>{s.espectadores} assistindo</span></div>
            <CartaoEnquete s={s} compacto />
            <Chat s={s} aberto />
            <BarraDeReacoes s={s} compacta />
          </div>
        </div>
      )}
    </>
  )
}

/* ============================================================== página */

export const quando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
  : 'Data a definir'

export function Contagem({ alvo }: { alvo: string | null }) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  if (!alvo) return null
  const falta = Math.max(0, new Date(alvo).getTime() - agora)
  if (!falta) return <span className="av-contagem">começa em instantes</span>
  const d = Math.floor(falta / 864e5), h = Math.floor(falta / 36e5) % 24, m = Math.floor(falta / 6e4) % 60, seg = Math.floor(falta / 1e3) % 60
  const dois = (n: number) => String(n).padStart(2, '0')
  return <span className="av-contagem">{d > 0 ? `${d}d ` : ''}{dois(h)}:{dois(m)}:{dois(seg)}</span>
}

/**
 * O link de convite da live: aparece sempre que uma live é aberta, pronto
 * para copiar ou mandar no WhatsApp. Quem clica cai direto no "Ao vivo"
 * (mesmo se ainda precisar entrar na conta).
 */
function LinkDaLive({ live, compacto = false, sessao }: { live: Live; compacto?: boolean; sessao?: SessaoTeeds | null }) {
  const [copiado, setCopiado] = useState(false)
  const publico = useLinkPublico()
  const [mudando, setMudando] = useState(false)
  const link = linkDaLive(live.id)
  const podeCompartilharNativo = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const alternar = async () => {
    if (!sessao || publico === null) return
    setMudando(true)
    try { await mudarLinkPublico(sessao, !publico) } catch { /* a chave volta ao que estava */ }
    setMudando(false)
  }
  const texto = live.status === 'ao_vivo'
    ? `Estamos ao vivo na ${MARCA_PROSA}: ${live.titulo}. Entre por aqui: ${link}`
    : `Live na ${MARCA_PROSA}: ${live.titulo}${live.inicioPrevisto ? `, ${quando(live.inicioPrevisto)}` : ''}. Guarde o link: ${link}`
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link) } catch {
      const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setCopiado(true); window.setTimeout(() => setCopiado(false), 1800)
  }
  return (
    <div className={`av-link-live ${compacto ? 'compacto' : ''}`}>
      <div className="av-link-live-texto">
        <small>Link para compartilhar</small>
        <code title={link}>{link.replace(/^https?:\/\//, '')}</code>
      </div>
      <div className="av-link-live-acoes">
        <button className={`av-botao-mini ${copiado ? 'ok' : ''}`} onClick={() => void copiar()}>{copiado ? 'Copiado' : 'Copiar'}</button>
        {podeCompartilharNativo
          ? <button className="av-botao-whats" onClick={() => void navigator.share({ text: texto }).catch(() => undefined)}>Compartilhar</button>
          : <a className="av-botao-whats" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
      </div>
      {sessao && (
        <div className="av-link-publico">
          <button className={`av-chave-chat ${publico ? 'on' : ''}`} aria-pressed={!!publico} disabled={mudando || publico === null} onClick={() => void alternar()}>
            <i aria-hidden />{publico ? 'Link público' : 'Só alunos'}
          </button>
          <span>{publico === null ? 'Conferindo…' : publico ? 'Fase de testes: qualquer pessoa com o link assiste e usa a sala de treino, sem conta.' : 'Produção: só quem tem conta na plataforma entra pelo link.'}</span>
        </div>
      )}
    </div>
  )
}

/** Cronômetro desde que a live entrou no ar (00:12:34). */
export function Cronometro({ desde }: { desde: string | null }) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  if (!desde) return null
  const seg = Math.max(0, Math.floor((agora - new Date(desde).getTime()) / 1000))
  const dois = (n: number) => String(n).padStart(2, '0')
  return <span className="av-cronometro">{dois(Math.floor(seg / 3600))}:{dois(Math.floor(seg / 60) % 60)}:{dois(seg % 60)}</span>
}

const ICONE_FONTE: Record<string, string> = {
  tela: 'M3 5h18v12H3zM8 21h8M12 17v4',
  camera: 'M3 7h12v10H3zM15 11l6-3v8l-6-3',
  microfone: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3',
  desligado: 'M4 4l16 16',
}
function IconeFonte({ nome, ligado }: { nome: 'tela' | 'camera' | 'microfone'; ligado: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONE_FONTE[nome]} />{!ligado && <path d={ICONE_FONTE.desligado} />}
    </svg>
  )
}

/**
 * A mesa do apresentador, em cima do palco: o que está indo ao ar (tela,
 * câmera, microfone), o estado (ensaio ou ao vivo, com cronômetro) e o
 * botão grande de começar/encerrar. Embaixo do palco ficam os ajustes.
 */
function MesaDoApresentador({ s, sessao, aoMudar }: { s: EstadoDaSala; sessao: SessaoTeeds; aoMudar: () => void }) {
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const live = s.live!
  const noAr = live.status === 'ao_vivo'
  const fazer = async (nome: string, f: () => Promise<unknown>) => {
    setOcupado(nome); setErro(null)
    try { await f() } catch (e) {
      const m = e instanceof Error ? e.message : ''
      setErro(/Permission|NotAllowed|denied/i.test(m) ? 'O navegador não liberou o acesso. Permita a câmera, o microfone ou a tela no cadeado da barra de endereço.' : m || 'Não deu certo. Tente de novo.')
    }
    setOcupado(null)
  }
  const nada = !s.transmitindo.tela && !s.transmitindo.camera
  // celular não compartilha a tela (o navegador não tem como); a câmera e o microfone sim
  const podeTela = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  const fonte = (nome: 'tela' | 'camera' | 'microfone', rotulo: string, ligar: (v: boolean) => Promise<void>) => {
    const ligado = s.transmitindo[nome]
    const semSuporte = nome === 'tela' && !podeTela
    return (
      <button className={`av-fonte ${ligado ? 'on' : ''}`} aria-pressed={ligado} disabled={!!ocupado || semSuporte}
        title={semSuporte ? 'Compartilhar a tela só no computador' : undefined}
        onClick={() => void fazer(nome, () => ligar(!ligado))}>
        <IconeFonte nome={nome} ligado={ligado} />
        <span><b>{rotulo}</b><small>{semSuporte ? 'só no computador' : ocupado === nome ? 'abrindo…' : !ligado ? 'desligado' : nome === 'camera' && s.fundo !== 'nenhum' ? `no ar · ${s.fundo === 'desfoque' ? 'fundo desfocado' : FUNDOS.find((f) => f.id === s.fundo)?.nome ?? 'com fundo'}` : 'no ar'}</small></span>
      </button>
    )
  }
  return (
    <section className={`av-mesa ${noAr ? 'no-ar' : ''}`} aria-label="Mesa do apresentador">
      <div className="av-mesa-estado">
        {noAr
          ? <span className="av-chip-vivo"><i aria-hidden />Ao vivo <Cronometro desde={live.iniciadaEm} /></span>
          : <span className="av-chip-ensaio">Ensaio · só você vê</span>}
        <span className="av-mesa-publico"><b>{s.espectadores}</b> {s.espectadores === 1 ? 'aluno assistindo' : 'alunos assistindo'}</span>
      </div>
      <div className="av-mesa-fontes" role="group" aria-label="O que vai ao ar">
        {fonte('tela', 'Tela', transmitirTela)}
        {fonte('camera', 'Câmera', transmitirCamera)}
        {fonte('microfone', 'Microfone', transmitirMicrofone)}
      </div>
      <div className="av-mesa-acao">
        <button className={`av-chave-chat ${live.chatAberto ? 'on' : ''}`} aria-pressed={live.chatAberto}
          onClick={() => void fazer('chat', () => abrirChat(!live.chatAberto))}>
          <i aria-hidden />{live.chatAberto ? 'Chat aberto' : 'Chat fechado'}
        </button>
        {noAr ? (
          <button className="av-botao-encerrar" disabled={!!ocupado} onClick={() => {
            if (!window.confirm('Encerrar a transmissão para todos os alunos?')) return
            void fazer('fim', async () => {
              await avisarFim()
              await mudarLive(sessao, live.id, { status: 'encerrada', encerrada_em: new Date().toISOString() })
              await sair(); aoMudar()
            })
          }}>Encerrar transmissão</button>
        ) : (
          <button className="av-botao-iniciar" disabled={!!ocupado || nada} onClick={() => void fazer('inicio', async () => {
            const agora = new Date().toISOString()
            await mudarLive(sessao, live.id, { status: 'ao_vivo', iniciada_em: agora })
            atualizarLive({ status: 'ao_vivo', iniciadaEm: agora }); aoMudar()
          })}><i aria-hidden />Iniciar transmissão</button>
        )}
        {!noAr && nada && <small className="av-mesa-dica">Ligue a tela ou a câmera para liberar</small>}
      </div>
      {erro && <p className="av-erro" role="alert">{erro}</p>}
    </section>
  )
}

const CANTOS: Array<{ id: CantoDaCamera; rotulo: string }> = [
  { id: 'sup-esq', rotulo: 'Em cima, à esquerda' }, { id: 'sup-dir', rotulo: 'Em cima, à direita' },
  { id: 'inf-esq', rotulo: 'Embaixo, à esquerda' }, { id: 'inf-dir', rotulo: 'Embaixo, à direita' },
]

/** Mensagens prontas da equipe: um clique, com variação para não repetir igual. */
const MENSAGENS_DA_EQUIPE: Array<{ id: string; rotulo: string; textos: string[] }> = [
  { id: 'boas-vindas', rotulo: 'Boas-vindas', textos: [
    'Sejam bem-vindos! Contem no chat de onde estão assistindo hoje.',
    'Bem-vindos à live! Fiquem à vontade para mandar dúvidas por aqui.',
    'Que bom ter vocês aqui. Já vamos começar, deixem um oi no chat.',
  ] },
  { id: 'gestao', rotulo: 'Lembrete de gestão', textos: [
    'Lembrete: defina meta e limite de perda antes de ligar o robô. Bateu, para.',
    'Gestão primeiro: meta e limite definidos antes de qualquer entrada.',
    'Quem respeita o limite fica no jogo. Configurem meta e stop antes de começar.',
  ] },
  { id: 'meta', rotulo: 'Meta batida', textos: [
    'Meta batida, robô desligado. É assim que se protege o resultado.',
    'Bateu a meta, encerramos a sessão. Disciplina acima de tudo.',
  ] },
  { id: 'stop', rotulo: 'Stop atingido', textos: [
    'Stop atingido: faz parte. O limite existe para proteger a banca.',
    'Limite de perda respeitado. Amanhã tem mais, com cabeça fria.',
  ] },
  { id: 'lateral', rotulo: 'Mercado lento', textos: [
    'Mercado lateral agora. Paciência: às vezes a melhor entrada é não entrar.',
    'Mercado sem direção clara. Vamos aguardar o momento certo.',
  ] },
  { id: 'pausa', rotulo: 'Pausa rápida', textos: [
    'Pausa rápida de 5 minutos. Já voltamos!',
    'Vamos fazer um intervalo curto. Não saiam daí.',
  ] },
]

const SUGESTOES_DE_FAIXA = ['Meta do dia: 5% · Limite: 3%', 'Ao vivo: leitura de mercado', 'Dúvidas? Mande no chat']

/**
 * O painel de controle da live: tudo que se mexe durante a transmissão, num
 * lugar só, na coluna ao lado do vídeo (aba "Controles").
 */
function PainelDeControle({ s, sessao }: { s: EstadoDaSala; sessao: SessaoTeeds | null }) {
  const live = s.live!
  const [titulo, setTitulo] = useState(live.titulo)
  const [faixa, setFaixa] = useState(live.faixa ?? '')
  const [enviado, setEnviado] = useState<string | null>(null)
  const [aplicandoFundo, setAplicandoFundo] = useState(false)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const fixada = s.mensagens.find((m) => m.fixada)
  useEffect(() => {
    void listarDispositivos('audioinput').then(setMics)
    void listarDispositivos('videoinput').then(setCams)
  }, [s.transmitindo.microfone, s.transmitindo.camera])
  useEffect(() => { setFaixa(live.faixa ?? '') }, [live.faixa])

  const mandarPronta = async (id: string, textos: string[]) => {
    try { await mandarMensagem(textos[Math.floor(Math.random() * textos.length)]); setEnviado(id); window.setTimeout(() => setEnviado(null), 1600) } catch { /* o chat mostra o erro */ }
  }

  return (
    <div className="av-painel">
      <section className="av-painel-sec">
        <h4>Transmissão</h4>
        <div className="av-painel-numeros">
          <div><small>Agora</small><b>{s.espectadores}</b></div>
          <div><small>Pico</small><b>{s.pico}</b></div>
          <div><small>No ar há</small><b>{live.status === 'ao_vivo' ? <Cronometro desde={live.iniciadaEm} /> : '00:00:00'}</b></div>
        </div>
        <form className="av-painel-linha" onSubmit={(e) => { e.preventDefault(); void renomearLive(titulo) }}>
          <label htmlFor="av-p-titulo" className="av-oculto">Título da live</label>
          <input id="av-p-titulo" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
          <button type="submit" className="av-botao-mini" disabled={!titulo.trim() || titulo.trim() === live.titulo}>Salvar</button>
        </form>
        <LinkDaLive live={live} compacto sessao={sessao} />
        <p className="av-painel-calor"><b>{s.totalReacoes}</b> {s.totalReacoes === 1 ? 'reação da sala' : 'reações da sala'}</p>
      </section>

      <section className="av-painel-sec">
        <h4>Fundo da câmera</h4>
        <SeletorDeFundo valor={s.fundo} cameraLigada={s.transmitindo.camera} aplicando={aplicandoFundo}
          onEscolher={async (e) => { setAplicandoFundo(true); try { await definirFundo(e) } finally { setAplicandoFundo(false) } }} />
      </section>

      <section className="av-painel-sec">
        <h4>Chat</h4>
        <div className="av-painel-linha entre">
          <span>{live.chatAberto ? 'Alunos podem escrever' : 'Só a equipe escreve'}</span>
          <button className={`av-chave-chat ${live.chatAberto ? 'on' : ''}`} aria-pressed={live.chatAberto} onClick={() => void abrirChat(!live.chatAberto)}>
            <i aria-hidden />{live.chatAberto ? 'Aberto' : 'Fechado'}
          </button>
        </div>
        <div className="av-painel-linha entre">
          <label htmlFor="av-lento">Modo lento</label>
          <select id="av-lento" value={live.intervaloChat} onChange={(e) => void definirModoLento(Number(e.target.value))}>
            <option value={0}>Desligado</option><option value={5}>5 segundos</option>
            <option value={10}>10 segundos</option><option value={30}>30 segundos</option>
          </select>
        </div>
        {fixada && (
          <div className="av-painel-fixada">
            <small>Fixada</small><p>{fixada.texto}</p>
            <button className="av-link" onClick={() => void fixarMensagem(null)}>Desafixar</button>
          </div>
        )}
        <span className="av-painel-rotulo">Mensagens da equipe</span>
        <div className="av-prontas">
          {MENSAGENS_DA_EQUIPE.map((m) => (
            <button key={m.id} className={enviado === m.id ? 'enviado' : ''} disabled={s.live?.status !== 'ao_vivo'}
              title={s.live?.status !== 'ao_vivo' ? 'Disponível com a live no ar' : m.textos[0]} onClick={() => void mandarPronta(m.id, m.textos)}>
              {enviado === m.id ? 'Enviada' : m.rotulo}
            </button>
          ))}
        </div>
      </section>

      <section className="av-painel-sec">
        <h4>Na sala</h4>
        {s.nomes.length === 0
          ? <p className="av-painel-calor">Ninguém assistindo ainda.</p>
          : <div className="av-nomes">{s.nomes.slice(0, 40).map((n, i) => <span key={i}>{n}</span>)}{s.nomes.length > 40 && <span className="mais">e mais {s.nomes.length - 40}</span>}</div>}
      </section>

      <section className="av-painel-sec">
        <h4>Enquete</h4>
        <PainelDeEnquete s={s} />
      </section>

      <section className="av-painel-sec">
        <h4>Faixa na tela</h4>
        <form className="av-painel-linha" onSubmit={(e) => { e.preventDefault(); void mostrarFaixa(faixa) }}>
          <label htmlFor="av-p-faixa" className="av-oculto">Texto da faixa</label>
          <input id="av-p-faixa" value={faixa} maxLength={120} placeholder="Meta do dia: 5% · Limite: 3%" onChange={(e) => setFaixa(e.target.value)} />
          <button type="submit" className="av-botao-mini" disabled={!faixa.trim()}>Mostrar</button>
        </form>
        <div className="av-sugestoes">
          {SUGESTOES_DE_FAIXA.map((t) => <button key={t} onClick={() => { setFaixa(t); void mostrarFaixa(t) }}>{t}</button>)}
        </div>
        {live.faixa && <button className="av-link" onClick={() => void mostrarFaixa(null)}>Tirar a faixa da tela</button>}
      </section>

      <section className="av-painel-sec">
        <h4>Câmera na tela</h4>
        <div className="av-painel-linha entre">
          <span id="av-canto-rotulo">Canto</span>
          <div className="av-cantos" role="radiogroup" aria-labelledby="av-canto-rotulo">
            {CANTOS.map((c) => (
              <button key={c.id} role="radio" aria-checked={live.cameraCanto === c.id} aria-label={c.rotulo} title={c.rotulo}
                className={`c-${c.id} ${live.cameraCanto === c.id ? 'on' : ''}`} onClick={() => void posicionarCamera(c.id)}><i aria-hidden /></button>
            ))}
          </div>
        </div>
        <div className="av-painel-linha entre">
          <span>Tamanho</span>
          <div className="tr-seg" role="radiogroup" aria-label="Tamanho do rosto">
            {(['p', 'm', 'g'] as const).map((t) => (
              <button key={t} role="radio" aria-checked={live.cameraTamanho === t} className={live.cameraTamanho === t ? 'on' : ''}
                onClick={() => void posicionarCamera(live.cameraCanto, t)}>{t === 'p' ? 'Pequeno' : t === 'm' ? 'Médio' : 'Grande'}</button>
            ))}
          </div>
        </div>
      </section>

      <section className="av-painel-sec">
        <h4>Aparelhos</h4>
        <label htmlFor="av-mic" className="av-painel-rotulo">Microfone</label>
        <select id="av-mic" value={s.dispositivos.microfone} disabled={mics.length === 0} onChange={(e) => void trocarDispositivo('audioinput', e.target.value)}>
          {mics.length === 0 && <option value="">Ligue o microfone para escolher</option>}
          {mics.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microfone ${i + 1}`}</option>)}
        </select>
        <MedidorDeVolume faixa={s.transmitindo.microfone ? s.microfoneLocal?.mediaStreamTrack : null} />
        <label htmlFor="av-cam" className="av-painel-rotulo">Câmera</label>
        <select id="av-cam" value={s.dispositivos.camera} disabled={cams.length === 0} onChange={(e) => void trocarDispositivo('videoinput', e.target.value)}>
          {cams.length === 0 && <option value="">Ligue a câmera para escolher</option>}
          {cams.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Câmera ${i + 1}`}</option>)}
        </select>
      </section>

      {live.status !== 'ao_vivo' && <button className="av-link av-painel-sair" onClick={() => void sair()}>Sair do estúdio</button>}
    </div>
  )
}

const SUGESTOES_DE_ENQUETE: Array<{ rotulo: string; pergunta: string; opcoes: () => string[] }> = [
  { rotulo: 'Sim ou não', pergunta: 'Entenderam até aqui?', opcoes: () => ['Sim', 'Ainda não'] },
  { rotulo: 'Qual robô', pergunta: 'Qual robô vocês querem ver operando agora?', opcoes: () => MARCA.robos.slice(0, 4).map((id) => (MARCA.nomesDosRobos?.[id] ?? id).replace(new RegExp(`^(GF|${MARCA.prosa.split(' ')[0]})\\s+`, 'i'), '')) },
  { rotulo: 'Meta', pergunta: 'Qual meta diária vocês usam?', opcoes: () => ['Até 3%', '3% a 5%', 'Acima de 5%', 'Ainda não defini'] },
  { rotulo: 'Horário', pergunta: 'Em que horário vocês mais operam?', opcoes: () => ['Manhã', 'Tarde', 'Noite', 'Madrugada'] },
]

/** O apresentador abre, acompanha e encerra a enquete. */
function PainelDeEnquete({ s }: { s: EstadoDaSala }) {
  const [pergunta, setPergunta] = useState('')
  const [opcoes, setOpcoes] = useState(['', ''])
  const [erro, setErro] = useState<string | null>(null)
  const e = s.enquete
  const abrir = async () => {
    setErro(null)
    try { await criarEnquete(pergunta, opcoes); setPergunta(''); setOpcoes(['', '']) } catch (x) { setErro(x instanceof Error ? x.message : 'Não deu certo.') }
  }
  if (e) {
    return (
      <div className="av-painel-enquete">
        <CartaoEnquete s={s} compacto />
        <div className="av-painel-linha">
          {e.aberta
            ? <button className="av-botao-mini" onClick={() => void encerrarEnquete(false)}>Encerrar votação</button>
            : <button className="av-botao-mini" onClick={() => void encerrarEnquete(true)}>Tirar da tela</button>}
          {e.aberta && <button className="av-link" onClick={() => void encerrarEnquete(true)}>Cancelar</button>}
        </div>
      </div>
    )
  }
  return (
    <form className="av-painel-enquete" onSubmit={(ev) => { ev.preventDefault(); void abrir() }}>
      <div className="av-sugestoes">
        {SUGESTOES_DE_ENQUETE.map((su) => <button key={su.rotulo} type="button" onClick={() => { setPergunta(su.pergunta); setOpcoes(su.opcoes()); setErro(null) }}>{su.rotulo}</button>)}
      </div>
      <label htmlFor="av-enq-pergunta" className="av-oculto">Pergunta</label>
      <input id="av-enq-pergunta" value={pergunta} maxLength={160} placeholder="Pergunta para a sala" onChange={(ev) => setPergunta(ev.target.value)} />
      {opcoes.map((o, i) => (
        <div key={i} className="av-painel-linha">
          <input value={o} maxLength={60} placeholder={`Opção ${i + 1}`} aria-label={`Opção ${i + 1}`} onChange={(ev) => setOpcoes(opcoes.map((x, j) => (j === i ? ev.target.value : x)))} />
          {opcoes.length > 2 && <button type="button" className="av-link" aria-label="Tirar esta opção" onClick={() => setOpcoes(opcoes.filter((_, j) => j !== i))}>tirar</button>}
        </div>
      ))}
      <div className="av-painel-linha entre">
        {opcoes.length < 4 ? <button type="button" className="av-link" onClick={() => setOpcoes([...opcoes, ''])}>Mais uma opção</button> : <span />}
        <button type="submit" className="av-botao-mini" disabled={s.live?.status !== 'ao_vivo' || !pergunta.trim() || opcoes.filter((o) => o.trim()).length < 2}>Abrir enquete</button>
      </div>
      {erro && <p className="av-erro" role="alert">{erro}</p>}
    </form>
  )
}

/** A coluna do apresentador: o chat e o painel de controle, em abas. */
function ColunaDoApresentador({ s, sessao }: { s: EstadoDaSala; sessao: SessaoTeeds | null }) {
  const [aba, setAba] = useState<'chat' | 'controles'>('chat')
  return (
    <div className="av-coluna">
      <div className="av-abas" role="tablist" aria-label="Chat e controles">
        <button role="tab" aria-selected={aba === 'chat'} className={aba === 'chat' ? 'on' : ''} onClick={() => setAba('chat')}>
          Chat{aba !== 'chat' && s.naoLidas > 0 && <span className="av-badge-aba">{s.naoLidas > 99 ? '99+' : s.naoLidas}</span>}
        </button>
        <button role="tab" aria-selected={aba === 'controles'} className={aba === 'controles' ? 'on' : ''} onClick={() => setAba('controles')}>Controles</button>
      </div>
      {aba === 'chat' ? <><CartaoEnquete s={s} compacto /><Chat s={s} aberto /></> : <PainelDeControle s={s} sessao={sessao} />}
    </div>
  )
}

const tituloDeHoje = () => `Live de ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`

/** A porta do estúdio, para o admin: abrir agora, ou agendar. */
function PortaDoEstudio({ sessao, aoMudar }: { sessao: SessaoTeeds; aoMudar: () => void }) {
  const [titulo, setTitulo] = useState(tituloDeHoje)
  const [agendar, setAgendar] = useState(false)
  const [data, setData] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const abrirAgora = async () => {
    if (!titulo.trim()) { setErro('Dê um título para a live.'); return }
    setOcupado(true); setErro(null)
    try { const l = await criarLive(sessao, titulo.trim(), null); aoMudar(); await entrar(sessao, l) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui abrir o estúdio.') }
    setOcupado(false)
  }
  const salvarAgenda = async () => {
    if (!titulo.trim()) { setErro('Dê um título para a live.'); return }
    if (!data) { setErro('Escolha o dia e a hora.'); return }
    setOcupado(true); setErro(null)
    try { await criarLive(sessao, titulo.trim(), new Date(data).toISOString()); setAgendar(false); setData(''); setTitulo(tituloDeHoje()); aoMudar() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui agendar.') }
    setOcupado(false)
  }
  return (
    <section className="av-porta" aria-labelledby="av-porta-titulo">
      <div className="av-porta-texto">
        <span className="av-sobretitulo">Estúdio</span>
        <h2 id="av-porta-titulo">Transmita para os alunos, ao vivo</h2>
        <p>Você entra primeiro num ensaio, que só você vê. Quando a imagem estiver certa, um clique coloca todo mundo dentro.</p>
        <ol className="av-passos">
          <li><i>1</i><span><b>Abra o estúdio</b>Ensaio privado, sem ninguém assistindo.</span></li>
          <li><i>2</i><span><b>Ligue tela, câmera e microfone</b>Você vê exatamente o que os alunos vão ver.</span></li>
          <li><i>3</i><span><b>Inicie a transmissão</b>O menu "Ao vivo" acende para todos.</span></li>
        </ol>
      </div>
      <form className="av-porta-form" onSubmit={(e) => { e.preventDefault(); void (agendar ? salvarAgenda() : abrirAgora()) }}>
        <label htmlFor="av-titulo">Título da live</label>
        <input id="av-titulo" value={titulo} maxLength={120} onChange={(e) => { setTitulo(e.target.value); setErro(null) }} />
        {agendar && <>
          <label htmlFor="av-data">Dia e hora</label>
          <input id="av-data" type="datetime-local" value={data} onChange={(e) => { setData(e.target.value); setErro(null) }} />
        </>}
        {erro && <p className="av-erro" role="alert">{erro}</p>}
        <button type="submit" className="av-botao-principal" disabled={ocupado}>
          {ocupado ? 'Abrindo…' : agendar ? 'Agendar live' : 'Abrir estúdio agora'}
        </button>
        <button type="button" className="av-link" onClick={() => { setAgendar(!agendar); setErro(null) }}>
          {agendar ? 'Voltar: abrir agora' : 'Agendar para outro horário'}
        </button>
      </form>
    </section>
  )
}

/** A página "Ao vivo": o palco com chat para quem assiste, e o estúdio para o admin. */
export function AoVivoPage({ sessao, admin }: { sessao: SessaoTeeds | null; admin: boolean }) {
  const s = useSala()
  const [lives, setLives] = useState<Live[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const carregar = useMemo(() => async () => {
    if (!sessao || !LIVES_AO_VIVO) return // lives desligadas: nem pergunta ao banco
    try { setLives(await listarLives(sessao)); setErro(null) } catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui carregar as lives.') }
  }, [sessao])
  useEffect(() => { void carregar(); const t = window.setInterval(() => void carregar(), 20000); return () => window.clearInterval(t) }, [carregar])
  // null = ainda conferindo (evita piscar as abas para o GF Member)
  const [planoTreino, setPlanoTreino] = useState<boolean | null>(null)
  // a aba Sala de treino: o admin abre e transmite; o GF Member (plano "treino") assiste
  // (na fase de testes, com o link público ligado, qualquer pessoa assiste)
  const publico = useLinkPublico()
  const treino = admin || planoTreino === true || (LIVES_AO_VIVO && publico === true)
  // GF Member (20/10/2026): só a sala de treino, nenhuma transmissão ao vivo
  // (o banco também esconde as lives dele: teeds_pode_assistir).
  const soTreino = !admin && planoTreino === true
  const [treinando, setTreinando] = useState(false)
  // o admin saiu da página com o ensaio no ar: ao voltar, cai direto nele
  const tr = useTreino()
  const ensaioNoAr = admin && tr.apresentador && tr.fase !== 'fora'
  useEffect(() => { if (sessao) void podeTreinar(sessao).then(setPlanoTreino) }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // chegou pelo link da sala de treino: abre a aba (o membro já cai assistindo)
  useEffect(() => { if (treino && treinoPedido()) { esquecerTreinoPedido(); setAbaEstado('treino') } }, [treino])
  const CHAVE_ABA = `${MARCA.id}.aovivo.aba`
  const [aba, setAbaEstado] = useState<'transmissao' | 'treino'>(() => { try { return localStorage.getItem(CHAVE_ABA) === 'treino' ? 'treino' : 'transmissao' } catch { return 'transmissao' } })
  const setAba = (a: 'transmissao' | 'treino') => { setAbaEstado(a); try { localStorage.setItem(CHAVE_ABA, a) } catch { /* só agora */ } }

  if (!sessao) return <div className="ger av-pagina"><p className="av-vazio">Entre na sua conta para ver as transmissões.</p></div>
  if (soTreino) return <div className="ger av-pagina"><AssistirTreino sessao={sessao} /></div>
  if (!admin && planoTreino === null) return <div className="ger av-pagina"><p className="av-vazio">Carregando…</p></div>
  if (admin && (treinando || ensaioNoAr)) return <SalaDeTreino sessao={sessao} apresentador={(sessao.usuario.nome || '').trim().split(/\s+/)[0] || 'professor'} aoSair={() => setTreinando(false)} />
  if (LIVES_AO_VIVO && s.fase !== 'fora' && s.live) return <SalaConectada s={s} sessao={sessao} aoMudar={() => void carregar()} />
  // Lives desligadas (20/10/2026): o "Ao vivo" é só a sala de treino, sem abas
  if (!LIVES_AO_VIVO && !admin) return <div className="ger av-pagina"><p className="av-vazio">A sala de treino é exclusiva para membros GF Member.</p></div>

  const noAr = lives?.find((l) => l.status === 'ao_vivo') ?? null
  const proximas = (lives ?? []).filter((l) => l.status === 'agendada')
  const convite = conviteRecebido()
  const convidadoPara = (l: Live) => !!convite && l.id.startsWith(convite)
  const abaAtual = !LIVES_AO_VIVO ? 'treino' : treino ? aba : 'transmissao'
  return (
    <div className="ger av-pagina">
      {erro && <p className="av-erro" role="alert">{erro}</p>}
      {s.erro && <p className={s.fase === 'erro' ? 'av-erro' : 'av-recado'} role="status">{s.erro}</p>}

      {treino && LIVES_AO_VIVO && (
        <div className="av-hub-abas" role="tablist" aria-label="O que fazer">
          <button role="tab" aria-selected={abaAtual === 'transmissao'} className={abaAtual === 'transmissao' ? 'on' : ''} onClick={() => setAba('transmissao')}>
            <b>Transmissão ao vivo{noAr && <i className="av-hub-vivo" aria-label="no ar agora" />}</b>
            <small>{admin ? 'Para os alunos, de verdade' : 'Assistir as lives da equipe'}</small>
          </button>
          <button role="tab" aria-selected={abaAtual === 'treino'} className={abaAtual === 'treino' ? 'on' : ''} onClick={() => setAba('treino')}>
            <b>Sala de treino</b>
            <small>{admin ? 'Ensaio com público simulado; os membros assistem' : 'Assista o ensaio como aluno'}</small>
          </button>
        </div>
      )}

      {abaAtual === 'treino' && admin && (
        <section className="tr-porta" aria-labelledby="tr-porta-titulo">
          <div className="tr-porta-texto">
            <span className="av-sobretitulo">Sala de treino</span>
            <h2 id="tr-porta-titulo">Ensaie a live com os membros assistindo</h2>
            <p>Você usa sua tela, câmera e microfone de verdade diante de um público e de um chat simulados. Os membros GF Member entram pelo link e assistem como se fossem alunos; um membro não vê as mensagens dos outros. A imagem leva sempre o selo "GF Streaming".</p>
            <ol className="av-passos">
              <li><i>1</i><span><b>Abra a sala de treino</b>Só administradores abrem; ela já vem com os ajustes à mostra.</span></li>
              <li><i>2</i><span><b>Mande o link aos membros</b>Eles entram com a conta deles e esperam o ensaio começar.</span></li>
              <li><i>3</i><span><b>Ligue a câmera ou a tela e clique em Começar simulação</b>O público chega; dispare momentos como meta batida ou rodada de perguntas.</span></li>
            </ol>
          </div>
          <div className="tr-porta-acoes">
            <button className="av-botao-principal" onClick={() => setTreinando(true)}>Abrir sala de treino</button>
            <LinkDoTreino />
          </div>
        </section>
      )}

      {abaAtual === 'treino' && !admin && <AssistirTreino sessao={sessao} />}

      {abaAtual === 'transmissao' && noAr && (
        <section className={`av-destaque ${convidadoPara(noAr) ? 'convite' : ''}`}>
          {convidadoPara(noAr) && !admin && <span className="av-sobretitulo">Você foi convidado para esta live</span>}
          <span className="av-chip-vivo"><i aria-hidden />Ao vivo agora <Cronometro desde={noAr.iniciadaEm} /></span>
          <h2>{noAr.titulo}</h2>
          {noAr.descricao && <p>{noAr.descricao}</p>}
          <button className="av-botao-principal" onClick={() => void entrar(sessao, noAr)}>{admin ? 'Voltar ao estúdio' : 'Assistir agora'}</button>
        </section>
      )}

      {abaAtual === 'transmissao' && admin && !noAr && <PortaDoEstudio sessao={sessao} aoMudar={() => void carregar()} />}

      {abaAtual === 'transmissao' && !admin && !noAr && lives && proximas.length === 0 && (
        <section className="av-destaque calmo">
          <span className="av-sobretitulo">Ao vivo</span>
          <h2>Nenhuma transmissão no ar agora</h2>
          <p>Quando a próxima live for marcada, ela aparece aqui com a contagem regressiva. Na hora, o menu "Ao vivo" ganha um ponto vermelho.</p>
        </section>
      )}

      {abaAtual === 'transmissao' && proximas.length > 0 && (
        <section className="av-agenda" aria-labelledby="av-agenda-titulo">
          <h3 id="av-agenda-titulo">Próximas transmissões</h3>
          {proximas.map((l) => (
            <article key={l.id} className={`av-agendada ${convidadoPara(l) ? 'convite' : ''}`}>
              <div className="av-agendada-texto">{convidadoPara(l) && !admin && <small className="av-sobretitulo">Seu convite</small>}<b>{l.titulo}</b><span>{quando(l.inicioPrevisto)}</span></div>
              <Contagem alvo={l.inicioPrevisto} />
              {admin && (
                <div className="av-agendada-acoes">
                  <button className="av-botao-secundario" onClick={() => void entrar(sessao, l)}>Abrir estúdio</button>
                  <LinkDaLive live={l} compacto sessao={sessao} />
                  <button className="av-link perigo" onClick={async () => { if (window.confirm(`Apagar "${l.titulo}"?`)) { await apagarLive(sessao, l.id).catch(() => undefined); void carregar() } }}>Apagar</button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {abaAtual === 'transmissao' && !lives && !erro && <p className="av-vazio">Carregando…</p>}
    </div>
  )
}

/**
 * Tela cheia "de teatro": a imagem toma o aparelho inteiro, o chat vira uma
 * coluna translúcida (deitado) ou uma folha (em pé), as reações ficam à mão.
 * Funciona também no iPhone, que não tem tela cheia de elemento: é um
 * overlay fixo; onde dá, pede a tela cheia de verdade para sumir a barra.
 */
export function useTeatro(): [boolean, (v: boolean) => void] {
  const [cheia, setCheia] = useState(false)
  const alternar = (v: boolean) => {
    setCheia(v)
    const d = document as Document & { webkitExitFullscreen?: () => void }
    try {
      if (v && !document.fullscreenElement) void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined)
      else if (!v && document.fullscreenElement) void (document.exitFullscreen?.() ?? d.webkitExitFullscreen?.())
    } catch { /* o overlay já resolve */ }
  }
  useEffect(() => {
    if (!cheia) return
    const sync = () => { if (!document.fullscreenElement) setCheia(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') alternar(false) }
    document.addEventListener('fullscreenchange', sync)
    window.addEventListener('keydown', tecla)
    document.body.classList.add('av-teatro-aberto')
    return () => { document.removeEventListener('fullscreenchange', sync); window.removeEventListener('keydown', tecla); document.body.classList.remove('av-teatro-aberto') }
  }, [cheia]) // eslint-disable-line react-hooks/exhaustive-deps
  return [cheia, alternar]
}

export const ICONE_PALCO: Record<string, string> = {
  cheia: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5',
  sairCheia: 'M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5',
  chat: 'M4 5h16v11H9l-5 4z',
}

/** Os botões sobre a imagem para quem assiste: tela cheia e, nela, o chat. */
function BotoesDoPalco({ s, cheia, alternar, chat, setChat }: { s: EstadoDaSala; cheia: boolean; alternar: (v: boolean) => void; chat: boolean; setChat: (v: boolean) => void }) {
  const naoLidas = s.naoLidas
  // fica no canto oposto ao rosto do apresentador, para nunca cobrir ninguém
  const canto = s.tela && s.camera ? (s.live?.cameraCanto ?? 'inf-dir') : 'inf-esq'
  return (
    <div className={`av-botoes-palco ${canto === 'inf-dir' ? 'pos-sup-dir' : 'pos-inf-dir'}`}>
      {cheia && (
        <button onClick={() => setChat(!chat)} aria-pressed={chat} aria-label={chat ? 'Esconder o chat' : 'Mostrar o chat'} title={chat ? 'Esconder o chat' : 'Mostrar o chat'}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d={ICONE_PALCO.chat} /></svg>
          {!chat && naoLidas > 0 && <span className="av-badge">{naoLidas > 99 ? '99+' : naoLidas}</span>}
        </button>
      )}
      <button onClick={() => alternar(!cheia)} aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'} title={cheia ? 'Sair da tela cheia' : 'Tela cheia'}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={cheia ? ICONE_PALCO.sairCheia : ICONE_PALCO.cheia} /></svg>
      </button>
    </div>
  )
}

/** A live aberta na página: mesa do apresentador (admin), palco grande e chat ao lado. */
export function SalaConectada({ s, sessao, aoMudar, convidado = false }: { s: EstadoDaSala; sessao: SessaoTeeds | null; aoMudar: () => void; convidado?: boolean }) {
  const largo = useLargo()
  const [cheia, alternarCheia] = useTeatro()
  const [chatNoTeatro, setChatNoTeatro] = useState(true)
  const publico = useLinkPublico()
  const live = s.live!
  const [convidado2, setConvidado2] = useState(false)
  const podeConvidar = !s.moderador && publico === true
  const convidar = async () => {
    const texto = `Estamos ao vivo na ${MARCA_PROSA}: ${live.titulo}. Entre por aqui: ${linkDaLive(live.id)}`
    if (typeof navigator.share === 'function') { await navigator.share({ text: texto }).catch(() => undefined); return }
    try { await navigator.clipboard.writeText(linkDaLive(live.id)); setConvidado2(true); window.setTimeout(() => setConvidado2(false), 1800) } catch { /* sem área de transferência */ }
  }
  const souAluno = !s.moderador
  return (
    <div className={`ger av-pagina av-com-palco ${souAluno ? 'av-aluno' : ''}`}>
      {s.moderador && sessao && <MesaDoApresentador s={s} sessao={sessao} aoMudar={aoMudar} />}
      {s.moderador && <LinkDaLive live={live} sessao={sessao} />}
      {souAluno && (
        <div className="av-cabeca">
          <div>
            <h2>{live.titulo}</h2>
            <p>{s.espectadores} assistindo agora{convidado && <> · você entrou como convidado</>}</p>
          </div>
          {!convidado && <div className="av-modos" role="group" aria-label="Como continuar assistindo ao sair desta tela">
            <span>Ao sair desta tela, continuar:</span>
            {largo && <button className={salaAgora().modo === 'lado' ? 'on' : ''} onClick={() => definirModo('lado', false)}>Ao lado do gráfico</button>}
            <button onClick={() => definirModo('flutuante', false)}>{largo ? 'Em janela flutuante' : 'Em miniatura'}</button>
            <button onClick={() => definirModo('pilula', false)}>Só o áudio</button>
          </div>}
        </div>
      )}
      <div className={`av-palco-e-chat ${cheia ? 'av-teatro' : ''} ${cheia && !chatNoTeatro ? 'sem-chat' : ''}`}>
        <Palco s={s} filhos={souAluno ? <BotoesDoPalco s={s} cheia={cheia} alternar={alternarCheia} chat={chatNoTeatro} setChat={setChatNoTeatro} /> : undefined} />
        {s.moderador ? <ColunaDoApresentador s={s} sessao={sessao} /> : (
          <div className="av-lado-aluno">
            <CartaoEnquete s={s} compacto={cheia} />
            <Chat s={s} aberto={!cheia || chatNoTeatro} />
            <BarraDeReacoes s={s} compacta={cheia} />
          </div>
        )}
      </div>
      {souAluno && (
        <div className="av-rodape-aluno">
          {podeAbrirPorCima() && (s.tela || s.camera) && (
            <button className="av-botao-secundario av-por-cima" onClick={() => void abrirPorCima(document.querySelector('.av-palco-e-chat'))}>
              Assistir por cima de outros apps
            </button>
          )}
          {podeConvidar && <button className="av-botao-secundario" onClick={() => void convidar()}>{convidado2 ? 'Link copiado' : 'Convidar alguém'}</button>}
          <button className="av-link" onClick={() => void sair()}>Sair da transmissão</button>
        </div>
      )}
    </div>
  )
}

/* ============================================================ laboratório */

/** Uma "tela compartilhada" de mentira: um gráfico de velas andando num canvas. */
function faixaDeExemplo(largura: number, altura: number, desenhar: (c: CanvasRenderingContext2D, t: number) => void): Track {
  const canvas = document.createElement('canvas')
  canvas.width = largura; canvas.height = altura
  const c = canvas.getContext('2d')!
  let t = 0
  window.setInterval(() => { desenhar(c, t++) }, 1000 / 15)
  desenhar(c, 0)
  return new LocalVideoTrack(canvas.captureStream(15).getVideoTracks()[0])
}

/** ?tela=aovivo no laboratório: a sala cheia, com vídeo e chat de exemplo. */
export function LabAoVivo({ modo, moderador }: { modo: ModoDoPlayer | 'pagina' | 'porta' | 'ensaio' | 'inicio'; moderador: boolean }) {
  const s = useSala()
  const sessaoFalsa = { token: '', refresh: '', expiraEm: 0, usuario: { id: 'lab', email: '', nome: 'Tiago' } } as unknown as SessaoTeeds
  if (modo === 'porta') return <div className="ger av-pagina"><PortaDoEstudio sessao={sessaoFalsa} aoMudar={() => undefined} /></div>
  // a página de entrada do Ao vivo (abas Transmissão / Sala de treino); a lista de lives falha sem conta, é esperado
  if (modo === 'inicio') return <AoVivoPage sessao={sessaoFalsa} admin={moderador} />
  useEffect(() => {
    const tela = faixaDeExemplo(1280, 720, (c, t) => {
      c.fillStyle = '#0b1726'; c.fillRect(0, 0, 1280, 720)
      c.strokeStyle = '#1d2c3f'; for (let x = 0; x < 1280; x += 80) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 720); c.stroke() }
      for (let i = 0; i < 40; i++) {
        const base = 360 + Math.sin((i + t / 6) / 4) * 120, alta = Math.sin(i * 7.3 + t / 9) > 0
        c.fillStyle = alta ? '#16C784' : '#EA3943'
        c.fillRect(60 + i * 29, base - 40, 16, 80)
      }
      c.fillStyle = '#9cb1c7'; c.font = '600 22px sans-serif'; c.fillText('Volatility 75 (1s) · tela do professor', 40, 50)
    })
    const camera = faixaDeExemplo(480, 480, (c, t) => {
      c.fillStyle = '#29445f'; c.fillRect(0, 0, 480, 480)
      c.fillStyle = '#9cb1c7'; c.beginPath(); c.arc(240, 190 + Math.sin(t / 8) * 4, 90, 0, 7); c.fill()
      c.beginPath(); c.arc(240, 470, 170, Math.PI, 0); c.fill()
    })
    const agora = Date.now()
    const msg = (min: number, nome: string, texto: string, mod = false, fixada = false) => ({
      id: crypto.randomUUID(), userId: nome, nome, texto, doModerador: mod, fixada, apagada: false,
      criadaEm: new Date(agora - min * 60000).toISOString(),
    })
    simularSala({
      fase: 'conectada', erro: null, moderador, meuNome: 'Tiago', espectadores: 214, somBloqueado: false,
      live: { id: 'lab', titulo: 'Abertura da semana: leitura de mercado', descricao: null, status: modo === 'ensaio' ? 'agendada' : 'ao_vivo', inicioPrevisto: null, iniciadaEm: new Date(agora - 18 * 60000).toISOString(), encerradaEm: null, intervaloChat: 5, chatAberto: true, cameraCanto: 'inf-dir', cameraTamanho: 'm', faixa: null },
      tela, camera, audios: [], transmitindo: { tela: moderador, camera: moderador, microfone: moderador },
      nomes: ['Ana', 'Rui', 'Carla', 'Marcos', 'Bia', 'Edu', 'Convidado', 'Lívia', 'Pedro', 'Tati'],
      enquete: new URLSearchParams(location.search).has('enquete')
        ? { id: 'lab', pergunta: 'Qual robô vocês querem ver operando agora?', opcoes: ['Raptor', 'Gulf', 'Falcon', 'Phenom'], aberta: true, votos: [48, 31, 12, 9], meuVoto: null }
        : null,
      modo: modo === 'pagina' || modo === 'ensaio' ? 'palco' : modo,
      mensagens: [
        msg(9, 'Tiago', 'Meta da sessão de hoje: 5%. Limite de perda: 3%. Não passem disso.', true, true),
        msg(7, 'Ana', 'Boa noite, pessoal'), msg(6, 'Rui', 'Qual robô vocês vão usar hoje?'),
        msg(5, 'Tiago', 'Vamos acompanhar o Raptor no 75 Index.', true),
        msg(3, 'Carla', 'Entrei agora, perdi o começo'), msg(1, 'Marcos', 'Dá para ver o gráfico certinho aqui'),
      ],
    })
    // o player, ao montar fora da página, volta ao modo preferido; no laboratório vale o pedido
    const t = window.setTimeout(() => { if (modo !== 'pagina' && modo !== 'ensaio') definirModo(modo, false) }, 50)
    return () => window.clearTimeout(t)
  }, [modo, moderador])
  if (!s.live) return null
  if (modo === 'pagina' || modo === 'ensaio') return <SalaConectada s={s} sessao={sessaoFalsa} aoMudar={() => undefined} />
  return <PlayerGlobal naPagina={false} abrirPagina={() => undefined} />
}
