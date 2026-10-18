/**
 * A sala da transmissão ao vivo: a conexão com o LiveKit, as faixas de
 * vídeo e áudio, o chat em tempo real e o jeito de assistir (palco, lado a
 * lado, flutuante, pílula).
 *
 * Fica num lugar só, fora do React, porque o player continua tocando quando
 * a pessoa troca de tela: o vídeo não pode morrer junto com a página.
 *
 * Atraso: WebRTC ponta a ponta (o mesmo das chamadas de vídeo), frações de
 * segundo. O chat vai pelo mesmo canal (dados da sala), então chega junto
 * com a imagem; o banco grava em paralelo, para o histórico e a moderação.
 */
import {
  ConnectionState, DataPacket_Kind, LocalParticipant, Participant, RemoteParticipant, Room, RoomEvent, Track,
  type LocalTrackPublication, type RemoteTrack, type RemoteTrackPublication,
} from 'livekit-client'
import { useSyncExternalStore } from 'react'
import type { SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'
import {
  gravarMensagem, historicoDoChat, moderarMensagem, mudarLive, pedirIngresso, silenciar as silenciarNoBanco,
  type CantoDaCamera, type Live, type MensagemDoChat,
} from './api'
import { marcarPlayerAtivo } from './presenca'

export type ModoDoPlayer = 'palco' | 'lado' | 'flutuante' | 'pilula'
export type TamanhoFlutuante = 'P' | 'M' | 'G'

export interface EstadoDaSala {
  fase: 'fora' | 'conectando' | 'conectada' | 'reconectando' | 'erro'
  erro: string | null
  live: Live | null
  moderador: boolean
  silenciado: boolean
  meuNome: string
  modo: ModoDoPlayer
  tamanho: TamanhoFlutuante
  /** Posição do flutuante: canto em que ele gruda. */
  canto: 'sup-esq' | 'sup-dir' | 'inf-esq' | 'inf-dir'
  tela: Track | null
  camera: Track | null
  audios: Track[]
  espectadores: number
  /** O maior número de pessoas assistindo ao mesmo tempo nesta sessão. */
  pico: number
  mensagens: MensagemDoChat[]
  naoLidas: number
  somBloqueado: boolean
  /** Do apresentador: o que está sendo transmitido agora. */
  transmitindo: { tela: boolean; camera: boolean; microfone: boolean }
  /** Do apresentador: a faixa do próprio microfone (para o medidor de volume). */
  microfoneLocal: Track | null
  /** Do apresentador: qual microfone e qual câmera estão em uso. */
  dispositivos: { microfone: string; camera: string }
}

const CHAVE_PREF = `${MARCA.id}.aovivo.preferencias`
const pref = (() => {
  try { return JSON.parse(localStorage.getItem(CHAVE_PREF) || '{}') as Partial<Pick<EstadoDaSala, 'tamanho' | 'canto'>> & { modoFora?: ModoDoPlayer } } catch { return {} }
})()

let estado: EstadoDaSala = {
  fase: 'fora', erro: null, live: null, moderador: false, silenciado: false, meuNome: '',
  modo: 'palco', tamanho: pref.tamanho ?? 'M', canto: pref.canto ?? 'inf-dir',
  tela: null, camera: null, audios: [], espectadores: 0, pico: 0, mensagens: [], naoLidas: 0, somBloqueado: false,
  transmitindo: { tela: false, camera: false, microfone: false },
  microfoneLocal: null, dispositivos: { microfone: '', camera: '' },
}
/** Como a pessoa prefere assistir quando sai da página "Ao vivo". */
let modoFora: ModoDoPlayer = pref.modoFora ?? 'flutuante'

const ouvintes = new Set<() => void>()
function mudar(parcial: Partial<EstadoDaSala>) {
  estado = { ...estado, ...parcial }
  if (estado.espectadores > estado.pico) estado = { ...estado, pico: estado.espectadores }
  ouvintes.forEach((f) => f())
}
function guardarPreferencias() {
  try { localStorage.setItem(CHAVE_PREF, JSON.stringify({ tamanho: estado.tamanho, canto: estado.canto, modoFora })) } catch { /* só nesta aba */ }
}

export function useSala(): EstadoDaSala {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => estado, () => estado)
}
export const salaAgora = () => estado

let sala: Room | null = null
let sessaoAtual: SessaoTeeds | null = null
let contador: number | undefined
let chatAberto = true

const TOPICO = 'chat'
type Pacote =
  | { t: 'msg'; id: string; texto: string; ts: string }
  | { t: 'apagar'; id: string }
  | { t: 'fixar'; id: string | null }
  | { t: 'fim' }
  | { t: 'chat'; aberto: boolean }
  | { t: 'camera'; canto: CantoDaCamera; tamanho?: 'p' | 'm' | 'g' }
  | { t: 'faixa'; texto: string | null }

const ehModerador = (p?: Participant) => {
  try { return Boolean(p?.metadata && JSON.parse(p.metadata).moderador) } catch { return false }
}

function faixas() {
  if (!sala) return
  let tela: Track | null = null, camera: Track | null = null
  const audios: Track[] = []
  const todos: Participant[] = [sala.localParticipant, ...sala.remoteParticipants.values()]
  for (const p of todos) {
    if (!ehModerador(p) && p !== sala.localParticipant) continue
    for (const pub of p.trackPublications.values()) {
      const t = pub.track
      if (!t || pub.isMuted) continue
      if (pub.source === Track.Source.ScreenShare) tela = t
      else if (pub.source === Track.Source.Camera) camera = t
      else if (t.kind === Track.Kind.Audio && p !== sala.localParticipant) audios.push(t)
    }
  }
  const lp = sala.localParticipant
  mudar({
    tela, camera, audios,
    transmitindo: {
      tela: lp.isScreenShareEnabled, camera: lp.isCameraEnabled, microfone: lp.isMicrophoneEnabled,
    },
    microfoneLocal: lp.getTrackPublication(Track.Source.Microphone)?.track ?? null,
    dispositivos: {
      microfone: sala.getActiveDevice('audioinput') ?? '',
      camera: sala.getActiveDevice('videoinput') ?? '',
    },
  })
}

function receber(mensagem: MensagemDoChat) {
  if (estado.mensagens.some((m) => m.id === mensagem.id)) return
  const mensagens = [...estado.mensagens, mensagem].slice(-300)
  mudar({ mensagens, naoLidas: chatAberto ? 0 : estado.naoLidas + 1 })
}

/** Entra na sala da live (o clique em "Assistir" ou "Abrir estúdio"). */
export async function entrar(sessao: SessaoTeeds, live: Live): Promise<void> {
  if (sala && estado.live?.id === live.id && estado.fase !== 'erro') return
  await sair()
  sessaoAtual = sessao
  marcarPlayerAtivo(true)
  mudar({ fase: 'conectando', erro: null, live, mensagens: [], naoLidas: 0 })
  try {
    const [ingresso, historico] = await Promise.all([
      pedirIngresso(sessao, live.id),
      historicoDoChat(sessao, live.id).catch(() => [] as MensagemDoChat[]),
    ])
    const r = new Room({
      adaptiveStream: true, // cada um recebe a resolução do tamanho em que está vendo
      dynacast: true, // o apresentador não manda camada que ninguém pede
      publishDefaults: {
        // tela de gráfico: nitidez antes de fluidez; 15 quadros bastam
        screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 },
      },
    })
    sala = r
    r.on(RoomEvent.TrackSubscribed, (_t: RemoteTrack, _p: RemoteTrackPublication, _rp: RemoteParticipant) => faixas())
      .on(RoomEvent.TrackUnsubscribed, () => faixas())
      .on(RoomEvent.TrackMuted, () => faixas())
      .on(RoomEvent.TrackUnmuted, () => faixas())
      .on(RoomEvent.LocalTrackPublished, (_p: LocalTrackPublication, _lp: LocalParticipant) => faixas())
      .on(RoomEvent.LocalTrackUnpublished, () => faixas())
      .on(RoomEvent.ParticipantConnected, () => mudar({ espectadores: Math.max(0, r.numParticipants - 1) }))
      .on(RoomEvent.ParticipantDisconnected, () => { mudar({ espectadores: Math.max(0, r.numParticipants - 1) }); faixas() })
      .on(RoomEvent.Reconnecting, () => mudar({ fase: 'reconectando' }))
      .on(RoomEvent.Reconnected, () => mudar({ fase: 'conectada' }))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => mudar({ somBloqueado: !r.canPlaybackAudio }))
      .on(RoomEvent.ParticipantPermissionsChanged, () => mudar({ silenciado: !r.localParticipant.permissions?.canPublishData }))
      .on(RoomEvent.Disconnected, () => { if (sala === r) { sala = null; mudar({ fase: 'fora', tela: null, camera: null, audios: [] }) } })
      .on(RoomEvent.DataReceived, (dados: Uint8Array, p?: RemoteParticipant, _k?: DataPacket_Kind, topico?: string) => {
        if (topico !== TOPICO || !p) return
        let pacote: Pacote
        try { pacote = JSON.parse(new TextDecoder().decode(dados)) } catch { return }
        if (pacote.t === 'msg') {
          receber({ id: pacote.id, userId: p.identity, nome: p.name || 'Aluno', texto: String(pacote.texto).slice(0, 500), doModerador: ehModerador(p), fixada: false, apagada: false, criadaEm: pacote.ts })
        } else if (ehModerador(p)) {
          if (pacote.t === 'apagar') mudar({ mensagens: estado.mensagens.filter((m) => m.id !== pacote.id) })
          else if (pacote.t === 'fixar') mudar({ mensagens: estado.mensagens.map((m) => ({ ...m, fixada: m.id === pacote.id })) })
          else if (pacote.t === 'fim') { void sair(); mudar({ erro: 'A transmissão terminou. Obrigado por assistir.' }) }
          else if (pacote.t === 'chat') atualizarLive({ chatAberto: Boolean(pacote.aberto) })
          else if (pacote.t === 'camera') atualizarLive({ cameraCanto: pacote.canto, ...(pacote.tamanho ? { cameraTamanho: pacote.tamanho } : {}) })
          else if (pacote.t === 'faixa') atualizarLive({ faixa: pacote.texto ? String(pacote.texto).slice(0, 120) : null })
        }
      })
    await r.connect(ingresso.url, ingresso.token, { autoSubscribe: true })
    await r.startAudio().catch(() => undefined)
    mudar({
      fase: 'conectada', moderador: ingresso.moderador, silenciado: ingresso.silenciado, meuNome: ingresso.nome,
      mensagens: historico.filter((m) => !m.apagada), espectadores: Math.max(0, r.numParticipants - 1),
      somBloqueado: !r.canPlaybackAudio,
    })
    faixas()
    window.clearInterval(contador)
    contador = window.setInterval(() => mudar({ espectadores: Math.max(0, r.numParticipants - 1) }), 5000)
  } catch (e) {
    sala = null
    mudar({ fase: 'erro', erro: e instanceof Error ? e.message : 'Não consegui entrar na transmissão.' })
  }
}

export async function sair(): Promise<void> {
  window.clearInterval(contador)
  const r = sala
  sala = null
  if (r) await r.disconnect().catch(() => undefined)
  mudar({ fase: 'fora', tela: null, camera: null, audios: [], espectadores: 0, transmitindo: { tela: false, camera: false, microfone: false } })
  marcarPlayerAtivo(false)
}

export async function liberarSom(): Promise<void> {
  await sala?.startAudio().catch(() => undefined)
  mudar({ somBloqueado: !(sala?.canPlaybackAudio ?? true) })
}

/* ------------------------------------------------------------- jeito de ver */

export function definirModo(modo: ModoDoPlayer, naPaginaAoVivo: boolean): void {
  if (!naPaginaAoVivo && modo !== 'palco') { modoFora = modo; guardarPreferencias() }
  mudar({ modo })
}
/** Ao sair da página "Ao vivo", o player vai para o jeito preferido de fora. */
export function aoTrocarDeTela(naPaginaAoVivo: boolean): void {
  if (estado.fase === 'fora') return
  mudar({ modo: naPaginaAoVivo ? 'palco' : modoFora })
}
export function definirTamanho(tamanho: TamanhoFlutuante): void { mudar({ tamanho }); guardarPreferencias() }
export function definirCanto(canto: EstadoDaSala['canto']): void { mudar({ canto }); guardarPreferencias() }
export function marcarChatAberto(aberto: boolean): void { chatAberto = aberto; if (aberto) mudar({ naoLidas: 0 }) }

/* ------------------------------------------------------------------- chat */

const enviar = async (pacote: Pacote) => {
  await sala?.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(pacote)), { reliable: true, topic: TOPICO })
}

/** Manda no chat: chega aos outros na hora, e o banco grava em paralelo. */
export async function mandarMensagem(texto: string): Promise<void> {
  const limpo = texto.trim().slice(0, 500)
  if (!limpo || !sala || !estado.live || !sessaoAtual) return
  if (estado.silenciado) throw new Error('O moderador pausou suas mensagens nesta transmissão.')
  if (!estado.live.chatAberto && !estado.moderador) throw new Error('O chat está fechado agora. Ele abre quando o moderador liberar.')
  const id = crypto.randomUUID()
  const ts = new Date().toISOString()
  // Grava primeiro só quando há modo lento: aí o banco é quem diz se pode.
  const gravar = gravarMensagem(sessaoAtual, { id, liveId: estado.live.id, nome: estado.meuNome, texto: limpo, doModerador: estado.moderador })
  if (estado.live.intervaloChat > 0 && !estado.moderador) await gravar
  else gravar.catch(() => undefined)
  await enviar({ t: 'msg', id, texto: limpo, ts })
  receber({ id, userId: sala.localParticipant.identity, nome: estado.meuNome, texto: limpo, doModerador: estado.moderador, fixada: false, apagada: false, criadaEm: ts })
}

export async function apagarMensagem(id: string): Promise<void> {
  if (!estado.moderador || !sessaoAtual) return
  mudar({ mensagens: estado.mensagens.filter((m) => m.id !== id) })
  await enviar({ t: 'apagar', id })
  await moderarMensagem(sessaoAtual, id, { apagada: true }).catch(() => undefined)
}

export async function fixarMensagem(id: string | null): Promise<void> {
  if (!estado.moderador || !sessaoAtual) return
  const anterior = estado.mensagens.find((m) => m.fixada)
  mudar({ mensagens: estado.mensagens.map((m) => ({ ...m, fixada: m.id === id })) })
  await enviar({ t: 'fixar', id })
  if (anterior && anterior.id !== id) await moderarMensagem(sessaoAtual, anterior.id, { fixada: false }).catch(() => undefined)
  if (id) await moderarMensagem(sessaoAtual, id, { fixada: true }).catch(() => undefined)
}

export async function silenciarPessoa(userId: string, calar = true): Promise<void> {
  if (!estado.moderador || !sessaoAtual || !estado.live) return
  await silenciarNoBanco(sessaoAtual, estado.live.id, userId, calar)
}

/** Abre ou fecha o chat para os alunos (o moderador continua escrevendo). */
export async function abrirChat(aberto: boolean): Promise<void> {
  if (!estado.moderador || !sessaoAtual || !estado.live) return
  atualizarLive({ chatAberto: aberto })
  await enviar({ t: 'chat', aberto })
  await mudarLive(sessaoAtual, estado.live.id, { chat_aberto: aberto })
}

/** Em que canto (e de que tamanho) o rosto do apresentador aparece, para todos. */
export async function posicionarCamera(canto: CantoDaCamera, tamanho: 'p' | 'm' | 'g' = estado.live?.cameraTamanho ?? 'm'): Promise<void> {
  if (!estado.moderador || !sessaoAtual || !estado.live) return
  atualizarLive({ cameraCanto: canto, cameraTamanho: tamanho })
  await enviar({ t: 'camera', canto, tamanho })
  await mudarLive(sessaoAtual, estado.live.id, { camera_canto: canto, camera_tamanho: tamanho })
}

/** O letreiro sobre o vídeo, como na TV. `null` tira a faixa. */
export async function mostrarFaixa(texto: string | null): Promise<void> {
  if (!estado.moderador || !sessaoAtual || !estado.live) return
  const limpo = texto?.trim().slice(0, 120) || null
  atualizarLive({ faixa: limpo })
  await enviar({ t: 'faixa', texto: limpo })
  await mudarLive(sessaoAtual, estado.live.id, { faixa: limpo })
}

/** Modo lento do chat: segundos entre duas mensagens do mesmo aluno (0 = livre). */
export async function definirModoLento(segundos: number): Promise<void> {
  if (!estado.moderador || !sessaoAtual || !estado.live) return
  atualizarLive({ intervaloChat: segundos })
  await mudarLive(sessaoAtual, estado.live.id, { intervalo_chat: segundos })
}

/** Muda o título da live (aparece para quem está na página "Ao vivo"). */
export async function renomearLive(titulo: string): Promise<void> {
  if (!estado.moderador || !sessaoAtual || !estado.live || !titulo.trim()) return
  atualizarLive({ titulo: titulo.trim().slice(0, 120) })
  await mudarLive(sessaoAtual, estado.live.id, { titulo: titulo.trim().slice(0, 120) })
}

/** Os microfones ou câmeras deste computador (os nomes só vêm depois da permissão). */
export async function listarDispositivos(tipo: 'audioinput' | 'videoinput'): Promise<MediaDeviceInfo[]> {
  try { return await Room.getLocalDevices(tipo, false) } catch { return [] }
}

/** Troca o microfone ou a câmera no meio da live, sem cair. */
export async function trocarDispositivo(tipo: 'audioinput' | 'videoinput', id: string): Promise<void> {
  if (!sala) return
  await sala.switchActiveDevice(tipo, id)
  faixas()
}

/** O apresentador avisa a sala que acabou (quem está assistindo vê o recado). */
export async function avisarFim(): Promise<void> {
  if (estado.moderador) await enviar({ t: 'fim' }).catch(() => undefined)
}

/* ------------------------------------------------------------ apresentador */

export async function transmitirTela(ligar: boolean): Promise<void> {
  if (!sala) return
  await sala.localParticipant.setScreenShareEnabled(ligar, {
    audio: false, contentHint: 'detail', selfBrowserSurface: 'exclude', surfaceSwitching: 'include',
    resolution: { width: 1920, height: 1080, frameRate: 15 },
  })
  faixas()
}
export async function transmitirCamera(ligar: boolean): Promise<void> {
  if (!sala) return
  await sala.localParticipant.setCameraEnabled(ligar, { resolution: { width: 640, height: 640, frameRate: 24 } })
  faixas()
}
export async function transmitirMicrofone(ligar: boolean): Promise<void> {
  if (!sala) return
  await sala.localParticipant.setMicrophoneEnabled(ligar, { echoCancellation: true, noiseSuppression: true, autoGainControl: true })
  faixas()
}

/** O apresentador mudou a live (começou, modo lento): a sala passa a saber. */
export function atualizarLive(parcial: Partial<Live>): void {
  if (estado.live) mudar({ live: { ...estado.live, ...parcial } })
}

/** Só para o laboratório: põe a sala num estado de exemplo, sem conectar. */
export function simularSala(parcial: Partial<EstadoDaSala>): void {
  marcarPlayerAtivo(true)
  mudar(parcial)
}

export const conexaoAtiva = () => sala?.state === ConnectionState.Connected
