/**
 * Sala de treino transmitida (19/10/2026): o admin ensaia a live com público
 * e chat simulados, e os membros do plano GF Member assistem como se fossem
 * alunos. Pedido do Tiago: só admin inicia; o link é para os membros verem.
 *
 * Chat (20/10/2026, pedido do Tiago): um GF Member NÃO vê o que os outros
 * membros escrevem. Vê o público simulado, o apresentador e as próprias
 * mensagens. A mensagem do membro vai só para quem transmite (destino
 * explícito no LiveKit) e o repasse da simulação deixa de fora as mensagens
 * de membros; quem assiste ainda descarta qualquer mensagem marcada como de
 * membro que chegue (defesa dupla, caso um navegador antigo repasse).
 *
 * Vai por uma sala própria do LiveKit (`treino-<marca>`), separada das lives
 * de verdade. O ingresso vem da função `live-token` (acao 'treino'), que só
 * aceita admin da marca e GF Member (o link público não vale aqui).
 *
 * O motor da simulação roda no navegador do admin (`simulacao.ts`); este
 * módulo repassa à sala o que ele produz (mensagens, público, momento) e
 * devolve ao admin o que os membros escrevem. Quem assiste vê sempre o selo
 * "Simulação" e o número marcado como simulado.
 */
import {
  AudioPresets, LocalAudioTrack, LocalVideoTrack, Participant, RemoteParticipant, Room, RoomEvent, ScreenSharePresets, Track, VideoPresets,
  type LocalTrackPublication, type TrackPublishOptions,
} from 'livekit-client'
import { useSyncExternalStore } from 'react'
import { SUPABASE } from '../teeds/config'
import { sessaoGuardada, type SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'
import type { CantoDaCamera } from './api'
import { mensagemDeMembro, ouvirSimulacao, pararSimulacao, simulacaoAgora, type MensagemSimulada, type Momento } from './simulacao'
import { marcarTreinoAtivo } from './presenca'
import { aplicarFundo, fundoGuardado, guardarFundo, prepararFundo, type EscolhaDeFundo } from './fundos'
import { vitrine } from '../teeds/parceiro'
import { abrirTransmissao, gravarTransmissao, type Presenca } from './historico'

/**
 * Como a sala segue quando a pessoa sai da página "Ao vivo" (20/10/2026,
 * igual à live de verdade): ao lado do gráfico, janela flutuante (miniatura
 * no celular) ou só o áudio. Na página, é o palco grande.
 */
export type ModoDoTreino = 'palco' | 'lado' | 'flutuante' | 'pilula'
export type TamanhoDoTreino = 'P' | 'M' | 'G'
type Fonte = 'tela' | 'camera' | 'mic'

export interface EstadoDoTreino {
  fase: 'fora' | 'conectando' | 'conectada' | 'reconectando' | 'erro'
  erro: string | null
  /** Esta pessoa é quem transmite (admin). */
  apresentador: boolean
  meuNome: string
  /** Membros de verdade assistindo agora (sem contar quem transmite). */
  membros: number
  nomes: string[]
  /* o que quem assiste recebe */
  presente: boolean
  /** Nome de quem transmite (o admin), para o cabeçalho de quem assiste. */
  quemApresenta: string
  tela: Track | null
  camera: Track | null
  audios: Track[]
  canto: CantoDaCamera
  sim: { ativa: boolean; publico: number; momento: Momento | null; pausada: boolean; chatAberto: boolean }
  mensagens: MensagemSimulada[]
  somBloqueado: boolean
  /** Quem assiste: o apresentador encerrou a transmissão (até ele começar outra). */
  encerrada: boolean
  /* o player fora da página */
  modo: ModoDoTreino
  tamanho: TamanhoDoTreino
  cantoPlayer: CantoDaCamera
  /* o que o admin transmite (fica aqui, não na tela: navegar não derruba o ensaio) */
  local: Record<Fonte, MediaStream | null>
  fundo: EscolhaDeFundo
  aplicandoFundo: boolean
  /** O estúdio (cenas) é quem manda a imagem e o som (31/10/2026). */
  usandoEstudio: boolean
  /** Transmissão de teste: código do link privado (ninguém é avisado). */
  teste: string | null
  /** Para quais plataformas a live abre (null = todas). */
  vitrines: string[] | null
}

const CHAVE_PLAYER = `${MARCA.id}.treino.player`
function prefsDoPlayer(): Pick<EstadoDoTreino, 'tamanho' | 'cantoPlayer'> & { modoFora: ModoDoTreino } {
  let p: Partial<{ tamanho: TamanhoDoTreino; cantoPlayer: CantoDaCamera; modoFora: ModoDoTreino }> = {}
  try { p = JSON.parse(localStorage.getItem(CHAVE_PLAYER) || '{}') } catch { /* sem armazenamento */ }
  return { tamanho: p.tamanho ?? 'M', cantoPlayer: p.cantoPlayer ?? 'inf-dir', modoFora: p.modoFora ?? 'flutuante' }
}
let modoFora: ModoDoTreino = prefsDoPlayer().modoFora
function guardarPrefs() {
  try { localStorage.setItem(CHAVE_PLAYER, JSON.stringify({ tamanho: estado.tamanho, cantoPlayer: estado.cantoPlayer, modoFora })) } catch { /* idem */ }
}

const INICIAL: EstadoDoTreino = {
  fase: 'fora', erro: null, apresentador: false, meuNome: '', membros: 0, nomes: [],
  presente: false, quemApresenta: '', tela: null, camera: null, audios: [], canto: 'inf-dir',
  sim: { ativa: false, publico: 0, momento: null, pausada: false, chatAberto: true }, mensagens: [], somBloqueado: false, encerrada: false,
  modo: 'palco', tamanho: 'M', cantoPlayer: 'inf-dir',
  local: { tela: null, camera: null, mic: null }, fundo: 'nenhum', aplicandoFundo: false,
  usandoEstudio: false, teste: null, vitrines: null,
}
/** O estado do zero, mas com as preferências da pessoa e o que o admin já tem ligado. */
const zerado = (): EstadoDoTreino => {
  const { tamanho, cantoPlayer } = prefsDoPlayer()
  return {
    ...INICIAL, tamanho, cantoPlayer, local: estado?.local ?? INICIAL.local, fundo: fundoGuardado(),
    usandoEstudio: estado?.usandoEstudio ?? false, teste: estado?.teste ?? null, vitrines: estado?.vitrines ?? null,
  }
}
let estado: EstadoDoTreino = INICIAL
estado = zerado()
const ouvintes = new Set<() => void>()
const mudar = (p: Partial<EstadoDoTreino>) => { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()) }
export const useTreino = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => estado, () => estado)

const TOPICO = 'treino'
type Pacote =
  | { t: 'estado'; ativa: boolean; publico: number; momento: Momento | null; pausada: boolean; canto: CantoDaCamera; chatAberto?: boolean }
  | { t: 'msgs'; lista: MensagemSimulada[] }
  | { t: 'historico'; lista: MensagemSimulada[] }
  | { t: 'limpar' }
  | { t: 'membro'; texto: string }
  | { t: 'fim' }

let sala: Room | null = null
/** O código da transmissão de teste em que esta pessoa está (quem transmite ou quem abriu o link). */
let testeAtual: string | null = null
/** A Central transmite no teste (true); quem abre o link só assiste. */
let apresentarNoTeste = false
let desligarEscuta: (() => void) | null = null
let timerEstado: number | undefined
let enviadas = new Set<string>()
let canto: CantoDaCamera = 'inf-dir'
const publicadas: Partial<Record<'tela' | 'camera' | 'mic', LocalVideoTrack | LocalAudioTrack>> = {}

const ehApresentador = (p?: Participant) => {
  try { return Boolean(p?.metadata && JSON.parse(p.metadata).moderador) } catch { return false }
}

async function pedirIngresso(sessao: SessaoTeeds | null, nome: string): Promise<{ url: string; token: string; nome: string; moderador: boolean }> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/live-token`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao?.token ?? SUPABASE.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'treino', marca: MARCA.id, nome, vitrine: vitrine(), ...(testeAtual ? { teste: testeAtual, apresentar: apresentarNoTeste } : {}) }),
  })
  const dados = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(dados?.erro || `Não consegui abrir a sala de treino (${r.status}).`)
  return dados
}

const enviar = (p: Pacote, para?: string[]) =>
  sala?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(p)), { reliable: true, topic: TOPICO, ...(para ? { destinationIdentities: para } : {}) }).catch(() => undefined)

/** Quem está na sala (os membros) e, para quem assiste, as faixas de quem transmite. */
function atualizarSala() {
  if (!sala) return
  const remotos = [...sala.remoteParticipants.values()]
  const membros = remotos.filter((p) => !ehApresentador(p))
  let tela: Track | null = null, camera: Track | null = null
  const audios: Track[] = []
  const quemTransmite = remotos.find(ehApresentador)
  for (const pub of quemTransmite?.trackPublications.values() ?? []) {
    const t = pub.track
    if (!t || pub.isMuted) continue
    if (pub.source === Track.Source.ScreenShare) tela = t
    else if (pub.source === Track.Source.Camera) camera = t
    else if (t.kind === Track.Kind.Audio) audios.push(t)
  }
  if (estado.apresentador) anotarPresencas(membros.map((p) => ({ id: p.identity, nome: p.name || 'Membro' })))
  mudar({
    membros: membros.length, nomes: membros.map((p) => p.name || 'Membro').slice(0, 80),
    presente: estado.apresentador || !!quemTransmite, quemApresenta: quemTransmite?.name || '', tela, camera, audios,
  })
}

/* --------------------------------------------- do admin para quem assiste */

function pacoteDeEstado(): Pacote {
  const s = simulacaoAgora()
  return { t: 'estado', ativa: s.ativa, publico: s.publicoAgora, momento: s.momento, pausada: s.pausada, canto, chatAberto: s.chatAberto }
}

/** Repassa à sala o que a simulação produziu (só as mensagens novas). */
function repassar() {
  const s = simulacaoAgora()
  if (s.mensagens.length === 0 && enviadas.size > 0) { enviadas = new Set(); void enviar({ t: 'limpar' }) }
  const novas = s.mensagens.filter((m) => !enviadas.has(m.id))
  novas.forEach((m) => enviadas.add(m.id))
  // mensagem de membro fica só com o apresentador: os outros membros não a recebem
  const publicas = novas.filter((m) => !m.membro)
  if (publicas.length) void enviar({ t: 'msgs', lista: publicas })
}

function comecarARepassar() {
  enviadas = new Set(simulacaoAgora().mensagens.map((m) => m.id))
  let ultimo = ''
  let eraAtiva = simulacaoAgora().ativa
  desligarEscuta = ouvirSimulacao(() => {
    repassar()
    // Começar simulação = a transmissão começa; Encerrar = acaba, na hora (20/10/2026)
    const ativa = simulacaoAgora().ativa
    if (ativa !== eraAtiva) { eraAtiva = ativa; void (ativa ? republicarFontes() : encerrarTransmissao()); if (ativa) comecarRegistro(); else fecharRegistro() }
    conferirAnuncio()
    const e = JSON.stringify(pacoteDeEstado())
    if (e !== ultimo) { ultimo = e; void enviar(JSON.parse(e)) }
  })
  // de tempos em tempos, o estado completo (quem perdeu um pacote se acerta)
  timerEstado = window.setInterval(() => void enviar(pacoteDeEstado()), 3000)
}

/* ------------------------------------ avisar os GF Members que está no ar */

/*
  20/10/2026: com o admin transmitindo (câmera, tela, microfone ou simulação
  ligada), a plataforma de cada GF Member acende o selo vermelho do topo, o
  ponto do menu "Ao vivo" e o aviso "Live iniciada". O navegador do admin
  manda um pulso a cada 15 s (teeds_treino_pulso); se ele fechar sem avisar,
  o banco para de contar a sala como no ar 75 s depois.
*/
let timerAnuncio: number | undefined
let anunciado = false
/**
 * No ar = a simulação rodando. Antes de "Começar simulação", câmera e tela são
 * só a prévia do admin; ao "Encerrar", tudo sai do ar para os membros na hora.
 */
const estaNoAr = () => simulacaoAgora().ativa

function anunciar(noAr: boolean, aoFechar = false) {
  // o token mais novo (a sessão é renovada pelo app; o ensaio pode passar de 1 h)
  const s = sessaoGuardada()
  if (!s || (!noAr && !anunciado)) return
  // transmissão de teste: ninguém é avisado (31/10/2026)
  if (noAr && estado.teste) return
  anunciado = noAr
  void fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_treino_pulso`, {
    method: 'POST', keepalive: aoFechar,
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${s.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, p_no_ar: noAr, p_apresentador: estado.meuNome, p_vitrines: estado.vitrines }),
  }).catch(() => undefined)
}
/** Só quando muda (ligou ou desligou tudo); o pulso de 15 s mantém o resto. */
const conferirAnuncio = () => { if (estado.apresentador && !estado.teste && estaNoAr() !== anunciado) anunciar(estaNoAr()) }
const aoFecharAba = () => { anunciar(false, true); if (registro.id) gravarTransmissao(registro.id, resumoDoRegistro(true), true) }

function comecarAAnunciar() {
  window.clearInterval(timerAnuncio)
  timerAnuncio = window.setInterval(() => { if (!estado.teste && (anunciado || estaNoAr())) anunciar(estaNoAr()) }, 15_000)
  window.addEventListener('pagehide', aoFecharAba)
  conferirAnuncio()
}
function pararDeAnunciar() {
  window.clearInterval(timerAnuncio); timerAnuncio = undefined
  window.removeEventListener('pagehide', aoFecharAba)
  anunciar(false)
}

/* --------------------------------------------------------------- entrar */

/**
 * Entra na sala de treino: o admin para transmitir, o membro para assistir.
 * Sem conta (fase de testes), vai o nome que a pessoa digitou.
 */
export async function entrarNoTreino(sessao: SessaoTeeds | null, nome = '', comoCentral = false): Promise<void> {
  if (sala && estado.fase !== 'erro') return
  await desconectar()
  // a Central usa o teste que ela mesma ligou; quem assiste, o do link que abriu
  testeAtual = comoCentral ? (apresentarNoTeste ? testeAtual : null) : testeDoLink()
  mudar({ ...zerado(), fase: 'conectando' })
  try {
    const ingresso = await pedirIngresso(sessao, nome)
    // mesmas escolhas da live: H.264 no chip de vídeo, uma camada menor só
    const r = new Room({
      adaptiveStream: true, dynacast: true,
      publishDefaults: {
        videoCodec: 'h264',
        screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 },
        screenShareSimulcastLayers: [ScreenSharePresets.h360fps15],
        videoSimulcastLayers: [VideoPresets.h360],
        degradationPreference: 'maintain-resolution',
      },
    })
    sala = r
    r.on(RoomEvent.TrackSubscribed, atualizarSala)
      .on(RoomEvent.TrackUnsubscribed, atualizarSala)
      .on(RoomEvent.TrackMuted, atualizarSala)
      .on(RoomEvent.TrackUnmuted, atualizarSala)
      .on(RoomEvent.LocalTrackPublished, (_p: LocalTrackPublication) => atualizarSala())
      .on(RoomEvent.ParticipantDisconnected, atualizarSala)
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        atualizarSala()
        // quem chega no meio recebe as últimas mensagens e o estado
        if (estado.apresentador) {
          void enviar({ t: 'historico', lista: simulacaoAgora().mensagens.filter((m) => !m.membro).slice(-60) }, [p.identity])
          void enviar(pacoteDeEstado(), [p.identity])
        }
      })
      .on(RoomEvent.Reconnecting, () => mudar({ fase: 'reconectando' }))
      .on(RoomEvent.Reconnected, () => mudar({ fase: 'conectada' }))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => mudar({ somBloqueado: !r.canPlaybackAudio }))
      .on(RoomEvent.Disconnected, () => { if (sala === r) { sala = null; marcarTreinoAtivo(false); mudar({ fase: 'fora', tela: null, camera: null, audios: [], presente: false }) } })
      .on(RoomEvent.DataReceived, (dados: Uint8Array, p?: RemoteParticipant, _k?: unknown, topico?: string) => {
        if (topico !== TOPICO || !p) return
        let pacote: Pacote
        try { pacote = JSON.parse(new TextDecoder().decode(dados)) } catch { return }
        if (estado.apresentador) {
          // do membro: a mensagem entra no chat da simulação (e volta para todos)
          if (pacote.t === 'membro') { mensagemDeMembro(p.name || 'Membro', String(pacote.texto)); if (registro.inicio) registro.mensagens++ }
          return
        }
        if (!ehApresentador(p)) return
        if (pacote.t === 'estado') {
          canto = pacote.canto
          if (pacote.ativa && estado.encerrada) mudar({ encerrada: false })
          mudar({ canto: pacote.canto, sim: { ativa: pacote.ativa, publico: pacote.publico, momento: pacote.momento, pausada: pacote.pausada, chatAberto: pacote.chatAberto !== false } })
        } else if (pacote.t === 'msgs') {
          const ja = new Set(estado.mensagens.map((m) => m.id))
          mudar({ mensagens: [...estado.mensagens, ...pacote.lista.filter((m) => !m.membro && !ja.has(m.id))].slice(-200) })
        } else if (pacote.t === 'historico') {
          // o histórico chega sem as mensagens de membros; as minhas, já na tela, ficam
          const minhas = estado.mensagens.filter((m) => m.minha)
          mudar({ mensagens: [...pacote.lista.filter((m) => !m.membro), ...minhas].sort((a, b) => a.hora - b.hora).slice(-200) })
        } else if (pacote.t === 'fim') {
          mudar({ encerrada: true, sim: { ...estado.sim, ativa: false } })
        } else if (pacote.t === 'limpar') {
          mudar({ mensagens: [] })
        }
      })
    await r.connect(ingresso.url, ingresso.token, { autoSubscribe: true })
    await r.startAudio().catch(() => undefined)
    mudar({ fase: 'conectada', apresentador: ingresso.moderador, meuNome: ingresso.nome, somBloqueado: !r.canPlaybackAudio, teste: testeAtual })
    if (ingresso.moderador) { comecarARepassar(); comecarAAnunciar() }
    marcarTreinoAtivo(true)
    // o que o admin já tinha ligado antes de a sala abrir entra agora
    if (ingresso.moderador) await republicarFontes()
    atualizarSala()
  } catch (e) {
    sala = null
    mudar({ fase: 'erro', erro: e instanceof Error ? e.message : 'Não consegui abrir a sala de treino.' })
  }
}

/** Sai da sala do LiveKit (sem mexer no que o admin tem ligado). */
async function desconectar(): Promise<void> {
  if (estado.apresentador) pararDeAnunciar()
  desligarEscuta?.(); desligarEscuta = null
  window.clearInterval(timerEstado)
  for (const k of Object.keys(publicadas) as Array<keyof typeof publicadas>) delete publicadas[k]
  const r = sala
  sala = null
  if (r) await r.disconnect().catch(() => undefined)
  marcarTreinoAtivo(false)
}

/**
 * Sai de vez: desliga a sala, a simulação (admin) e câmera, tela e microfone.
 * É o "Sair" do player e da página; trocar de tela NÃO chama isto.
 */
export async function sairDoTreino(): Promise<void> {
  const eraApresentador = estado.apresentador
  if (eraApresentador && registro.inicio) fecharRegistro()
  await desconectar()
  if (eraApresentador) pararSimulacao()
  desligarFontesLocais()
  mudar({ ...zerado(), local: { tela: null, camera: null, mic: null } })
}

/* ------------------------------------------------- o player fora da página */

/** Na página, só guarda a preferência de fora; fora dela, muda o player na hora. */
export function definirModoDoTreino(modo: ModoDoTreino, naPagina: boolean): void {
  if (modo !== 'palco') { modoFora = modo; guardarPrefs() }
  if (!naPagina) mudar({ modo }); else ouvintes.forEach((f) => f())
}
/** Ao sair da página "Ao vivo", o player vai para o jeito preferido de fora. */
export function treinoTrocouDeTela(naPagina: boolean): void {
  if (estado.fase === 'fora') return
  mudar({ modo: naPagina ? 'palco' : modoFora })
}
export const modoForaDoTreino = () => modoFora
export function definirTamanhoDoTreino(tamanho: TamanhoDoTreino): void { mudar({ tamanho }); guardarPrefs() }
export function definirCantoDoPlayer(c: CantoDaCamera): void { mudar({ cantoPlayer: c }); guardarPrefs() }

/* ------------------------------------- câmera, tela e microfone do admin */

let cameraFaixa: LocalVideoTrack | null = null
let cameraBruta: MediaStreamTrack | null = null

function desligarFontesLocais() {
  for (const f of Object.values(estado.local)) f?.getTracks().forEach((t) => t.stop())
  cameraFaixa?.stop(); cameraFaixa = null; cameraBruta = null
}

/** Encerrou: câmera, tela e microfone saem do ar e quem assiste fica sabendo na hora. */
async function encerrarTransmissao() {
  await Promise.all((['tela', 'camera', 'mic'] as const).map((q) => publicarNoTreino(q, null)))
  void enviar({ t: 'fim' })
  conferirAnuncio()
}

/** Republica o que está ligado (começou a simulação, ou a sala abriu do zero). */
async function republicarFontes() {
  if (estudio) {
    await publicarNoTreino('camera', null)
    await publicarNoTreino('tela', estudio.video)
    await publicarNoTreino('mic', estudio.audio)
    return
  }
  const { tela, mic } = estado.local
  if (cameraFaixa) await publicarNoTreino('camera', cameraFaixa)
  if (tela) await publicarNoTreino('tela', tela.getVideoTracks()[0] ?? null)
  if (mic) await publicarNoTreino('mic', mic.getAudioTracks()[0] ?? null)
}

const mostrarCamera = (lt: LocalVideoTrack) => new MediaStream([lt.mediaStreamTrack])

/**
 * Liga ou desliga uma fonte do ensaio. Rápido de propósito (20/10/2026): a
 * câmera aparece na hora, sem esperar o fundo; o fundo entra logo depois,
 * quando a IA termina de carregar (e ela já começa a carregar ao abrir a sala).
 */
export async function alternarFonte(qual: Fonte): Promise<string | null> {
  const atual = estado.local[qual]
  if (atual) {
    void publicarCru(qual, null)
    atual.getTracks().forEach((t) => t.stop())
    if (qual === 'camera') { cameraFaixa?.stop(); cameraFaixa = null; cameraBruta = null }
    mudar({ local: { ...estado.local, [qual]: null } })
    return null
  }
  try {
    const f = qual === 'tela'
      ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 15 } }, audio: false, selfBrowserSurface: 'exclude', surfaceSwitching: 'include' } as DisplayMediaStreamOptions)
      : await navigator.mediaDevices.getUserMedia(qual === 'camera' ? { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 } } } : { audio: { echoCancellation: true, noiseSuppression: true } })
    // parou pela barra do navegador: o botão acompanha
    const bruta = f.getTracks()[0]
    bruta?.addEventListener('ended', () => {
      const ainda = qual === 'camera' ? cameraBruta === bruta : estado.local[qual] === f
      if (!ainda) return
      if (qual === 'camera') { cameraFaixa?.stop(); cameraFaixa = null; cameraBruta = null }
      mudar({ local: { ...estado.local, [qual]: null } })
      void publicarCru(qual, null)
    })
    if (qual === 'camera') {
      const lt = new LocalVideoTrack(f.getVideoTracks()[0], undefined, true)
      cameraFaixa = lt; cameraBruta = bruta
      mudar({ local: { ...estado.local, camera: mostrarCamera(lt) } })
      void publicarCru('camera', lt)
      if (estado.fundo !== 'nenhum') void trocarFundoDoTreino(estado.fundo)
    } else {
      mudar({ local: { ...estado.local, [qual]: f } })
      void publicarCru(qual, qual === 'tela' ? f.getVideoTracks()[0] : f.getAudioTracks()[0])
    }
    return null
  } catch {
    return 'O navegador não liberou o acesso. Permita a câmera, o microfone ou a tela no cadeado da barra de endereço.'
  }
}

/** Troca o fundo da câmera; os membros veem o fundo novo na mesma hora. */
export async function trocarFundoDoTreino(e: EscolhaDeFundo): Promise<void> {
  mudar({ fundo: e })
  const lt = cameraFaixa
  if (!lt) { guardarFundo(e); return }
  mudar({ aplicandoFundo: true })
  try { await aplicarFundo(lt, e); if (cameraFaixa === lt) mudar({ local: { ...estado.local, camera: mostrarCamera(lt) } }) } catch { /* segue sem fundo */ } finally { mudar({ aplicandoFundo: false }) }
}

/** Ao abrir a sala, a IA do fundo já começa a carregar (se houver fundo escolhido). */
export function prepararSalaDoAdmin(): void {
  if (fundoGuardado() !== 'nenhum') prepararFundo()
}

export async function liberarSomDoTreino(): Promise<void> {
  await sala?.startAudio().catch(() => undefined)
  mudar({ somBloqueado: !(sala?.canPlaybackAudio ?? true) })
}

/* ----------------------------------------------------- o admin transmite */

/**
 * Coloca (ou tira) na sala uma das fontes do ensaio. A sala de treino é dona
 * das próprias câmeras e telas; aqui só se publica o que ela já abriu.
 */
let filaDePublicacao: Promise<unknown> = Promise.resolve()
/** Câmera, tela e microfone avulsos: com o estúdio no comando, ficam só na prévia do admin. */
const publicarCru = (qual: 'tela' | 'camera' | 'mic', faixa: LocalVideoTrack | MediaStreamTrack | null) => (estudio ? Promise.resolve() : publicarNoTreino(qual, faixa))
export function publicarNoTreino(qual: 'tela' | 'camera' | 'mic', faixa: LocalVideoTrack | MediaStreamTrack | null): Promise<void> {
  const vez = filaDePublicacao.then(() => publicarAgora(qual, faixa)).catch(() => undefined)
  filaDePublicacao = vez
  return vez
}
async function publicarAgora(qual: 'tela' | 'camera' | 'mic', faixa: LocalVideoTrack | MediaStreamTrack | null): Promise<void> {
  if (!sala || !estado.apresentador) return
  // fora do ar, nada chega aos membros (fica só a prévia do admin)
  if (!estaNoAr()) faixa = null
  const antiga = publicadas[qual]
  if (antiga) { await sala.localParticipant.unpublishTrack(antiga, false).catch(() => undefined); delete publicadas[qual] }
  if (!faixa) { atualizarSala(); conferirAnuncio(); return }
  const local = faixa instanceof LocalVideoTrack ? faixa
    : qual === 'mic' ? new LocalAudioTrack(faixa, undefined, true) : new LocalVideoTrack(faixa, undefined, true)
  const source = qual === 'tela' ? Track.Source.ScreenShare : qual === 'camera' ? Track.Source.Camera : Track.Source.Microphone
  // A saída do estúdio: imagem de 1080p a 30 quadros (tem vídeo e transição) e
  // som de música em estéreo, sem cortar silêncio (o stinger e as músicas não podem picotar).
  const doEstudio = !!estudio && (faixa === estudio.video || faixa === estudio.audio || (local as LocalVideoTrack | LocalAudioTrack).mediaStreamTrack === estudio.video || (local as LocalVideoTrack | LocalAudioTrack).mediaStreamTrack === estudio.audio)
  const opcoes: TrackPublishOptions = { source }
  if (doEstudio && qual === 'tela') Object.assign(opcoes, { screenShareEncoding: { maxBitrate: 3_500_000, maxFramerate: 30 }, screenShareSimulcastLayers: [ScreenSharePresets.h360fps15, ScreenSharePresets.h720fps30], degradationPreference: 'balanced' })
  if (doEstudio && qual === 'mic') Object.assign(opcoes, { audioPreset: AudioPresets.musicHighQualityStereo, dtx: false, red: true, forceStereo: true })
  await sala.localParticipant.publishTrack(local, opcoes)
  publicadas[qual] = local
  atualizarSala()
  conferirAnuncio()
}

/** O canto escolhido pelo admin (vale entre as telas). */
export const cantoDoTreino = (): CantoDaCamera => canto

/** Em que canto o rosto aparece para quem assiste. */
export function cantoNoTreino(c: CantoDaCamera): void {
  canto = c
  if (estado.apresentador) void enviar(pacoteDeEstado())
}

/* --------------------------------------------------------- o membro fala */

export async function mandarNoTreino(texto: string): Promise<void> {
  const t = texto.trim().slice(0, 500)
  if (!t || !sala || estado.apresentador || !estado.sim.chatAberto) return
  // aparece na minha tela na hora; vai só para quem transmite
  const minha: MensagemSimulada = { id: `eu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, nome: estado.meuNome || 'Você', texto: t, apresentador: false, entrada: false, hora: Date.now(), membro: true, minha: true }
  mudar({ mensagens: [...estado.mensagens, minha].slice(-200) })
  const apresentadores = [...sala.remoteParticipants.values()].filter(ehApresentador).map((p) => p.identity)
  if (apresentadores.length) await enviar({ t: 'membro', texto: t }, apresentadores)
}

/** Só para o laboratório: a visão de quem assiste, sem conectar. */
export function simularTreino(p: Partial<EstadoDoTreino>): void { mudar(p) }

/* A Central ao vivo pedida pela Administração (23/10/2026): o menu leva para
   "Ao vivo" e a página já abre direto na Central, sem passar pela capa. */
let centralPedidaAgora = false
export function pedirCentral(): void { centralPedidaAgora = true }
/** Lê e consome o pedido. */
export function centralPedida(): boolean { const p = centralPedidaAgora; centralPedidaAgora = false; return p }

/* ------------------------------------------------- o estúdio (31/10/2026) */

let estudio: { video: MediaStreamTrack; audio: MediaStreamTrack } | null = null

/**
 * Liga (ou desliga) o estúdio de cenas como a fonte da transmissão: a imagem
 * e o som finais dele vão aos alunos no lugar da tela, câmera e microfone
 * avulsos. Fora do ar, nada chega aos membros (como antes).
 */
export async function usarEstudioNoTreino(saida: { video: MediaStreamTrack; audio: MediaStreamTrack } | null): Promise<void> {
  if (saida?.video === estudio?.video && saida?.audio === estudio?.audio) return
  estudio = saida
  mudar({ usandoEstudio: !!saida })
  if (saida) { await republicarFontes(); return }
  await Promise.all((['tela', 'camera', 'mic'] as const).map((q) => publicarNoTreino(q, null)))
  await republicarFontes()
}

/* -------------------------------------------- plataformas e teste (31/10) */

/** Para quais plataformas a próxima transmissão abre (null = todas). Só fora do ar. */
export function definirVitrinesDoTreino(v: string[] | null): void {
  if (estaNoAr()) return
  mudar({ vitrines: v && v.length ? [...v].sort() : null })
}

const CHAVE_TESTE = `${MARCA.id}.aovivo.teste`
/** Quem abriu o link de teste (?teste=código): vale nesta aba até sair. */
export function testeDoLink(): string | null {
  try {
    const q = new URLSearchParams(location.search).get('teste')
    if (q && /^[0-9a-f]{12}$/.test(q)) { sessionStorage.setItem(CHAVE_TESTE, q); return q }
    const g = sessionStorage.getItem(CHAVE_TESTE)
    return g && /^[0-9a-f]{12}$/.test(g) ? g : null
  } catch { return null }
}
export function esquecerTesteDoLink(): void {
  try { sessionStorage.removeItem(CHAVE_TESTE) } catch { /* nada guardado */ }
  if (!estado.apresentador) testeAtual = null
}

export const linkDoTeste = (codigo: string) => `${location.origin}${import.meta.env.BASE_URL}?treino=1&teste=${codigo}`

/**
 * Liga a transmissão de teste: a Central troca para uma sala só dela, com
 * um link privado. Ninguém é avisado (sem selo vermelho, sem "Live
 * iniciada"); só quem tem o link vê. Desligar volta para a sala de sempre.
 */
export async function trocarTeste(sessao: SessaoTeeds, ligar: boolean): Promise<string | null> {
  if (estaNoAr()) return 'Encerre a transmissão antes de trocar entre teste e de verdade.'
  let codigo: string | null = null
  if (ligar) {
    const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_criar_teste_ao_vivo`, {
      method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_marca: MARCA.id }),
    }).catch(() => null)
    codigo = r?.ok ? String(await r.json()) : null
    if (!codigo) return 'Não consegui criar o link de teste. Tente de novo.'
  }
  testeAtual = codigo
  apresentarNoTeste = !!codigo
  await desconectar()
  mudar({ teste: codigo, fase: 'fora' })
  await entrarNoTreino(sessao, '', true)
  return null
}

/* ------------------------------------- o histórico da transmissão (31/10) */

/*
  Quem transmite anota quem entrou e saiu (pela identidade da conta), o pico
  e as mensagens dos membros; grava o resumo a cada 30 s e no fim. Fica aqui
  (e não na tela) para continuar gravando com a Central fechada.
*/
const registro = {
  id: null as string | null,
  inicio: 0,
  pessoas: new Map<string, { nome: string; ms: number; entradas: number; desde: number | null }>(),
  pico: 0,
  mensagens: 0,
  timer: 0,
}

function anotarPresencas(agora: Array<{ id: string; nome: string }>) {
  if (!registro.inicio) return
  const t = Date.now()
  const ids = new Set(agora.map((p) => p.id))
  for (const p of agora) {
    const r = registro.pessoas.get(p.id) ?? { nome: p.nome, ms: 0, entradas: 0, desde: null }
    if (r.desde === null) { r.desde = t; r.entradas++ }
    r.nome = p.nome
    registro.pessoas.set(p.id, r)
  }
  for (const [id, r] of registro.pessoas) if (!ids.has(id) && r.desde !== null) { r.ms += t - r.desde; r.desde = null }
  registro.pico = Math.max(registro.pico, agora.length)
}

function resumoDoRegistro(fim = false) {
  const t = Date.now()
  const presencas: Presenca[] = [...registro.pessoas].map(([id, r]) => ({
    id, nome: r.nome, entradas: r.entradas, segundos: Math.round((r.ms + (r.desde !== null ? t - r.desde : 0)) / 1000),
  })).sort((a, b) => b.segundos - a.segundos)
  const total = presencas.reduce((s, p) => s + p.segundos, 0)
  return {
    pico: registro.pico, pessoas: presencas.length, mensagens: registro.mensagens, presencas,
    tempo_medio_s: presencas.length ? Math.round(total / presencas.length) : 0,
    ...(fim ? { encerrada_em: new Date().toISOString() } : {}),
  }
}

function comecarRegistro() {
  window.clearInterval(registro.timer)
  registro.id = null; registro.inicio = Date.now(); registro.pessoas = new Map(); registro.pico = 0; registro.mensagens = 0
  if (sala) anotarPresencas([...sala.remoteParticipants.values()].filter((p) => !ehApresentador(p)).map((p) => ({ id: p.identity, nome: p.name || 'Membro' })))
  void abrirTransmissao({ apresentador: estado.meuNome, teste: !!estado.teste, vitrines: estado.vitrines }).then((id) => { if (registro.inicio) registro.id = id })
  registro.timer = window.setInterval(() => { if (registro.id) gravarTransmissao(registro.id, resumoDoRegistro()) }, 30_000)
}

function fecharRegistro() {
  window.clearInterval(registro.timer)
  if (registro.id) gravarTransmissao(registro.id, resumoDoRegistro(true))
  registro.id = null; registro.inicio = 0
}
