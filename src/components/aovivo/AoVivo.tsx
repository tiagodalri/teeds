import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PEvent } from 'react'
import { createPortal } from 'react-dom'
import { LocalVideoTrack, type Track } from 'livekit-client'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { apagarLive, conviteRecebido, criarLive, linkDaLive, listarLives, mudarLive, podeTreinar, type CantoDaCamera, type Live } from '../../core/live/api'
import { SalaDeTreino } from './SalaDeTreino'
import { SeletorDeFundo } from './SeletorDeFundo'
import { MARCA } from '../../marca'

const MARCA_PROSA = MARCA.prosa
import { FUNDOS } from '../../core/live/fundos'
import {
  abrirChat, aoTrocarDeTela, apagarMensagem, atualizarLive, definirFundo, definirModoLento, listarDispositivos, mostrarFaixa, posicionarCamera, renomearLive, trocarDispositivo, avisarFim, definirCanto, definirModo, definirTamanho, entrar, fixarMensagem,
  liberarSom, mandarMensagem, marcarChatAberto, sair, salaAgora, silenciarPessoa, transmitirCamera,
  simularSala, transmitirMicrofone, transmitirTela, useSala, type EstadoDaSala, type ModoDoPlayer,
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
function Som({ faixas }: { faixas: Track[] }) {
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

/** A imagem da live: a tela do apresentador, com a câmera num círculo no canto. */
function Palco({ s, compacto = false }: { s: EstadoDaSala; compacto?: boolean }) {
  const telaRef = useRef<HTMLDivElement>(null)
  const souEu = s.moderador && (s.transmitindo.tela || s.transmitindo.camera)
  const vazio = !s.tela && !s.camera
  return (
    <div className={`av-palco ${compacto ? 'compacto' : ''}`} ref={telaRef}>
      {s.tela ? <Video faixa={s.tela} className="av-tela" /> : s.camera ? <Video faixa={s.camera} className="av-tela av-so-camera" espelhar={souEu} /> : null}
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
      {s.somBloqueado && <button className="av-som" onClick={() => void liberarSom()}>Toque para ativar o som</button>}
    </div>
  )
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** O chat: mensagem fixada no topo, lista, campo. O moderador modera pelo menu de cada mensagem. */
function Chat({ s, aberto = true }: { s: EstadoDaSala; aberto?: boolean }) {
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
function Icone({ nome }: { nome: string }) {
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
  const largo = typeof window !== 'undefined' && window.innerWidth >= 1100

  useEffect(() => { aoTrocarDeTela(naPagina) }, [naPagina])
  const modo: ModoDoPlayer = s.modo === 'lado' && !largo ? 'flutuante' : s.modo
  useEffect(() => {
    document.body.classList.toggle('aovivo-lado', !naPagina && modo === 'lado' && s.fase !== 'fora')
    return () => document.body.classList.remove('aovivo-lado')
  }, [naPagina, modo, s.fase])

  if (naPagina || s.fase === 'fora') return <Som faixas={naPagina ? [] : s.audios} />

  const fechar = () => { void sair() }
  const pip = () => abrirPorCima(caixa.current)

  if (modo === 'pilula') {
    return (
      <>
        <Som faixas={s.audios} />
        <div className="av-pilula" role="region" aria-label="Transmissão ao vivo minimizada">
          <i className="av-ponto" aria-hidden />
          <span>Ao vivo · {s.espectadores} assistindo</span>
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
        <Chat s={s} />
      </aside>
    )
  }

  // flutuante: arrasta pela imagem, solta e gruda no canto mais perto
  const largura = Math.min(LARGURA[s.tamanho], window.innerWidth - 24)
  const posicao: CSSProperties = arrasto
    ? { left: arrasto.x, top: arrasto.y, width: largura }
    : { width: largura, ...(s.canto.startsWith('sup') ? { top: 88 } : { bottom: 16 }), ...(s.canto.endsWith('esq') ? { left: 16 } : { right: 16 }) }
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
  return (
    <div className={`av-flutuante ${s.canto.startsWith('inf') ? 'embaixo' : ''} ${arrasto ? 'arrastando' : ''}`} style={posicao} ref={caixa} role="region" aria-label="Transmissão ao vivo">
      <Som faixas={s.audios} />
      <div className="av-flutuante-video" onPointerDown={descer} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        <Palco s={s} compacto />
        {controles}
        {s.erro && s.fase === 'erro' && <div className="av-espera">{s.erro}</div>}
      </div>
      <button className="av-chat-botao" onClick={() => setChat(!chat)} aria-expanded={chat}>
        Chat{s.naoLidas > 0 && !chat && <span className="av-badge">{s.naoLidas > 99 ? '99+' : s.naoLidas}</span>}
      </button>
      {chat && <div className="av-flutuante-chat"><Chat s={s} aberto /></div>}
    </div>
  )
}

/* ============================================================== página */

const quando = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })
  : 'Data a definir'

function Contagem({ alvo }: { alvo: string | null }) {
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
function LinkDaLive({ live, compacto = false }: { live: Live; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const link = linkDaLive(live.id)
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
        <a className="av-botao-whats" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
      </div>
    </div>
  )
}

/** Cronômetro desde que a live entrou no ar (00:12:34). */
function Cronometro({ desde }: { desde: string | null }) {
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
  const fonte = (nome: 'tela' | 'camera' | 'microfone', rotulo: string, ligar: (v: boolean) => Promise<void>) => {
    const ligado = s.transmitindo[nome]
    return (
      <button className={`av-fonte ${ligado ? 'on' : ''}`} aria-pressed={ligado} disabled={!!ocupado}
        onClick={() => void fazer(nome, () => ligar(!ligado))}>
        <IconeFonte nome={nome} ligado={ligado} />
        <span><b>{rotulo}</b><small>{ocupado === nome ? 'abrindo…' : !ligado ? 'desligado' : nome === 'camera' && s.fundo !== 'nenhum' ? `no ar · ${s.fundo === 'desfoque' ? 'fundo desfocado' : FUNDOS.find((f) => f.id === s.fundo)?.nome ?? 'com fundo'}` : 'no ar'}</small></span>
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

/** Volume do microfone em tempo real (0 a 1), para o apresentador ver que está captando. */
function useNivel(faixa: Track | null): number {
  const [nivel, setNivel] = useState(0)
  useEffect(() => {
    const mst = faixa?.mediaStreamTrack
    if (!mst) { setNivel(0); return }
    const ctx = new AudioContext()
    const fonte = ctx.createMediaStreamSource(new MediaStream([mst]))
    const an = ctx.createAnalyser(); an.fftSize = 512
    fonte.connect(an)
    const dados = new Uint8Array(an.fftSize)
    let quadro = 0
    const medir = () => {
      an.getByteTimeDomainData(dados)
      let soma = 0
      for (const d of dados) { const x = (d - 128) / 128; soma += x * x }
      setNivel(Math.min(1, Math.sqrt(soma / dados.length) * 4))
      quadro = requestAnimationFrame(medir)
    }
    medir()
    return () => { cancelAnimationFrame(quadro); fonte.disconnect(); void ctx.close() }
  }, [faixa])
  return nivel
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
function PainelDeControle({ s }: { s: EstadoDaSala }) {
  const live = s.live!
  const [titulo, setTitulo] = useState(live.titulo)
  const [faixa, setFaixa] = useState(live.faixa ?? '')
  const [enviado, setEnviado] = useState<string | null>(null)
  const [aplicandoFundo, setAplicandoFundo] = useState(false)
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cams, setCams] = useState<MediaDeviceInfo[]>([])
  const nivel = useNivel(s.transmitindo.microfone ? s.microfoneLocal : null)
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
        <LinkDaLive live={live} compacto />
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
        <span className="av-medidor" role="meter" aria-label="Volume do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(nivel * 100)}><i style={{ width: `${Math.round(nivel * 100)}%` }} /></span>
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

/** A coluna do apresentador: o chat e o painel de controle, em abas. */
function ColunaDoApresentador({ s }: { s: EstadoDaSala }) {
  const [aba, setAba] = useState<'chat' | 'controles'>('chat')
  return (
    <div className="av-coluna">
      <div className="av-abas" role="tablist" aria-label="Chat e controles">
        <button role="tab" aria-selected={aba === 'chat'} className={aba === 'chat' ? 'on' : ''} onClick={() => setAba('chat')}>
          Chat{aba !== 'chat' && s.naoLidas > 0 && <span className="av-badge-aba">{s.naoLidas > 99 ? '99+' : s.naoLidas}</span>}
        </button>
        <button role="tab" aria-selected={aba === 'controles'} className={aba === 'controles' ? 'on' : ''} onClick={() => setAba('controles')}>Controles</button>
      </div>
      {aba === 'chat' ? <Chat s={s} aberto /> : <PainelDeControle s={s} />}
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
    if (!sessao) return
    try { setLives(await listarLives(sessao)); setErro(null) } catch (e) { setErro(e instanceof Error ? e.message : 'Não consegui carregar as lives.') }
  }, [sessao])
  useEffect(() => { void carregar(); const t = window.setInterval(() => void carregar(), 20000); return () => window.clearInterval(t) }, [carregar])
  const [treino, setTreino] = useState(false)
  const [treinando, setTreinando] = useState(false)
  useEffect(() => { if (sessao) void podeTreinar(sessao).then(setTreino) }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!sessao) return <div className="ger av-pagina"><p className="av-vazio">Entre na sua conta para ver as transmissões.</p></div>
  if (treinando) return <SalaDeTreino apresentador={(sessao.usuario.nome || '').trim().split(/\s+/)[0] || 'professor'} aoSair={() => setTreinando(false)} />
  if (s.fase !== 'fora' && s.live) return <SalaConectada s={s} sessao={sessao} aoMudar={() => void carregar()} />

  const noAr = lives?.find((l) => l.status === 'ao_vivo') ?? null
  const proximas = (lives ?? []).filter((l) => l.status === 'agendada')
  const convite = conviteRecebido()
  const convidadoPara = (l: Live) => !!convite && l.id.startsWith(convite)
  return (
    <div className="ger av-pagina">
      {erro && <p className="av-erro" role="alert">{erro}</p>}
      {s.erro && <p className={s.fase === 'erro' ? 'av-erro' : 'av-recado'} role="status">{s.erro}</p>}

      {noAr && (
        <section className={`av-destaque ${convidadoPara(noAr) ? 'convite' : ''}`}>
          {convidadoPara(noAr) && !admin && <span className="av-sobretitulo">Você foi convidado para esta live</span>}
          <span className="av-chip-vivo"><i aria-hidden />Ao vivo agora <Cronometro desde={noAr.iniciadaEm} /></span>
          <h2>{noAr.titulo}</h2>
          {noAr.descricao && <p>{noAr.descricao}</p>}
          <button className="av-botao-principal" onClick={() => void entrar(sessao, noAr)}>{admin ? 'Voltar ao estúdio' : 'Assistir agora'}</button>
        </section>
      )}

      {admin && !noAr && <PortaDoEstudio sessao={sessao} aoMudar={() => void carregar()} />}

      {treino && (
        <section className="tr-entrada-card" aria-labelledby="tr-titulo">
          <div>
            <span className="av-sobretitulo">Sala de treino</span>
            <h3 id="tr-titulo">Ensaie uma live com público e chat simulados</h3>
            <p>Só você vê. Use sua tela, câmera e microfone de verdade, controle o tamanho da sala e dispare momentos como meta batida, stop ou rodada de perguntas. A imagem leva o selo "Simulação".</p>
          </div>
          <button className="av-botao-secundario" onClick={() => setTreinando(true)}>Abrir sala de treino</button>
        </section>
      )}

      {!admin && !noAr && lives && proximas.length === 0 && (
        <section className="av-destaque calmo">
          <span className="av-sobretitulo">Ao vivo</span>
          <h2>Nenhuma transmissão no ar agora</h2>
          <p>Quando a próxima live for marcada, ela aparece aqui com a contagem regressiva. Na hora, o menu "Ao vivo" ganha um ponto vermelho.</p>
        </section>
      )}

      {proximas.length > 0 && (
        <section className="av-agenda" aria-labelledby="av-agenda-titulo">
          <h3 id="av-agenda-titulo">Próximas transmissões</h3>
          {proximas.map((l) => (
            <article key={l.id} className={`av-agendada ${convidadoPara(l) ? 'convite' : ''}`}>
              <div className="av-agendada-texto">{convidadoPara(l) && !admin && <small className="av-sobretitulo">Seu convite</small>}<b>{l.titulo}</b><span>{quando(l.inicioPrevisto)}</span></div>
              <Contagem alvo={l.inicioPrevisto} />
              {admin && (
                <div className="av-agendada-acoes">
                  <button className="av-botao-secundario" onClick={() => void entrar(sessao, l)}>Abrir estúdio</button>
                  <LinkDaLive live={l} compacto />
                  <button className="av-link perigo" onClick={async () => { if (window.confirm(`Apagar "${l.titulo}"?`)) { await apagarLive(sessao, l.id).catch(() => undefined); void carregar() } }}>Apagar</button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {!lives && !erro && <p className="av-vazio">Carregando…</p>}
    </div>
  )
}

/** A live aberta na página: mesa do apresentador (admin), palco grande e chat ao lado. */
function SalaConectada({ s, sessao, aoMudar }: { s: EstadoDaSala; sessao: SessaoTeeds; aoMudar: () => void }) {
  return (
    <div className="ger av-pagina av-com-palco">
      {s.moderador && <MesaDoApresentador s={s} sessao={sessao} aoMudar={aoMudar} />}
      {s.moderador && <LinkDaLive live={s.live!} />}
      {s.moderador ? null : (
        <div className="av-cabeca">
          <div>
            <h2>{s.live!.titulo}</h2>
            <p>{s.espectadores} assistindo agora</p>
          </div>
          <div className="av-modos" role="group" aria-label="Como continuar assistindo ao sair desta tela">
            <span>Ao sair desta tela, continuar:</span>
            <button className={salaAgora().modo === 'lado' ? 'on' : ''} onClick={() => definirModo('lado', false)}>Ao lado do gráfico</button>
            <button onClick={() => definirModo('flutuante', false)}>Em janela flutuante</button>
            <button onClick={() => definirModo('pilula', false)}>Só o áudio</button>
          </div>
        </div>
      )}
      <div className="av-palco-e-chat">
        <Palco s={s} />
        {s.moderador ? <ColunaDoApresentador s={s} /> : <Chat s={s} />}
      </div>
      {s.moderador ? null : (
        <div className="av-rodape-aluno">
          {podeAbrirPorCima() && (s.tela || s.camera) && (
            <button className="av-botao-secundario av-por-cima" onClick={() => void abrirPorCima(document.querySelector('.av-palco-e-chat'))}>
              Assistir por cima de outros apps
            </button>
          )}
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
export function LabAoVivo({ modo, moderador }: { modo: ModoDoPlayer | 'pagina' | 'porta' | 'ensaio'; moderador: boolean }) {
  const s = useSala()
  const sessaoFalsa = { token: '', refresh: '', expiraEm: 0, usuario: { id: 'lab', email: '', nome: 'Tiago' } } as unknown as SessaoTeeds
  if (modo === 'porta') return <div className="ger av-pagina"><PortaDoEstudio sessao={sessaoFalsa} aoMudar={() => undefined} /></div>
  useEffect(() => {
    const tela = faixaDeExemplo(1280, 720, (c, t) => {
      c.fillStyle = '#0b1726'; c.fillRect(0, 0, 1280, 720)
      c.strokeStyle = '#1d2c3f'; for (let x = 0; x < 1280; x += 80) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, 720); c.stroke() }
      for (let i = 0; i < 40; i++) {
        const base = 360 + Math.sin((i + t / 6) / 4) * 120, alta = Math.sin(i * 7.3 + t / 9) > 0
        c.fillStyle = alta ? '#2f8f72' : '#c95f5f'
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
      modo: modo === 'pagina' || modo === 'ensaio' ? 'palco' : modo,
      mensagens: [
        msg(9, 'Tiago', 'Meta da sessão de hoje: 5%. Limite de perda: 3%. Não passem disso.', true, true),
        msg(7, 'Ana', 'Boa noite, pessoal'), msg(6, 'Rui', 'Qual robô vocês vão usar hoje?'),
        msg(5, 'Tiago', 'Vamos acompanhar o Bombardier no Volatility 75.', true),
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
