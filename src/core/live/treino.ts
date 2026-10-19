/**
 * Sala de treino transmitida (19/10/2026): o admin ensaia a live com público
 * e chat simulados, e os membros do plano "treino" assistem como se fossem
 * alunos. Pedido do Tiago: só admin inicia; o link é para os membros verem.
 *
 * Vai por uma sala própria do LiveKit (`treino-<marca>`), separada das lives
 * de verdade. O ingresso vem da função `live-token` (acao 'treino'), que só
 * aceita admin da marca e membro do plano; sem conta, ninguém entra, nem com
 * o link público ligado.
 *
 * O motor da simulação roda no navegador do admin (`simulacao.ts`); este
 * módulo repassa à sala o que ele produz (mensagens, público, momento) e
 * devolve ao admin o que os membros escrevem. Quem assiste vê sempre o selo
 * "Simulação" e o número marcado como simulado.
 */
import {
  LocalAudioTrack, LocalVideoTrack, Participant, RemoteParticipant, Room, RoomEvent, Track,
  type LocalTrackPublication,
} from 'livekit-client'
import { useSyncExternalStore } from 'react'
import { SUPABASE } from '../teeds/config'
import type { SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'
import type { CantoDaCamera } from './api'
import { mensagemDeMembro, ouvirSimulacao, simulacaoAgora, type MensagemSimulada, type Momento } from './simulacao'

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
  tela: Track | null
  camera: Track | null
  audios: Track[]
  canto: CantoDaCamera
  sim: { ativa: boolean; publico: number; momento: Momento | null; pausada: boolean }
  mensagens: MensagemSimulada[]
  somBloqueado: boolean
}

const INICIAL: EstadoDoTreino = {
  fase: 'fora', erro: null, apresentador: false, meuNome: '', membros: 0, nomes: [],
  presente: false, tela: null, camera: null, audios: [], canto: 'inf-dir',
  sim: { ativa: false, publico: 0, momento: null, pausada: false }, mensagens: [], somBloqueado: false,
}
let estado: EstadoDoTreino = INICIAL
const ouvintes = new Set<() => void>()
const mudar = (p: Partial<EstadoDoTreino>) => { estado = { ...estado, ...p }; ouvintes.forEach((f) => f()) }
export const useTreino = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => estado, () => estado)

const TOPICO = 'treino'
type Pacote =
  | { t: 'estado'; ativa: boolean; publico: number; momento: Momento | null; pausada: boolean; canto: CantoDaCamera }
  | { t: 'msgs'; lista: MensagemSimulada[] }
  | { t: 'historico'; lista: MensagemSimulada[] }
  | { t: 'limpar' }
  | { t: 'membro'; texto: string }

let sala: Room | null = null
let desligarEscuta: (() => void) | null = null
let timerEstado: number | undefined
let enviadas = new Set<string>()
let canto: CantoDaCamera = 'inf-dir'
const publicadas: Partial<Record<'tela' | 'camera' | 'mic', LocalVideoTrack | LocalAudioTrack>> = {}

const ehApresentador = (p?: Participant) => {
  try { return Boolean(p?.metadata && JSON.parse(p.metadata).moderador) } catch { return false }
}

async function pedirIngresso(sessao: SessaoTeeds): Promise<{ url: string; token: string; nome: string; moderador: boolean }> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/live-token`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'treino', marca: MARCA.id }),
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
  mudar({
    membros: membros.length, nomes: membros.map((p) => p.name || 'Membro').slice(0, 80),
    presente: estado.apresentador || !!quemTransmite, tela, camera, audios,
  })
}

/* --------------------------------------------- do admin para quem assiste */

function pacoteDeEstado(): Pacote {
  const s = simulacaoAgora()
  return { t: 'estado', ativa: s.ativa, publico: s.publicoAgora, momento: s.momento, pausada: s.pausada, canto }
}

/** Repassa à sala o que a simulação produziu (só as mensagens novas). */
function repassar() {
  const s = simulacaoAgora()
  if (s.mensagens.length === 0 && enviadas.size > 0) { enviadas = new Set(); void enviar({ t: 'limpar' }) }
  const novas = s.mensagens.filter((m) => !enviadas.has(m.id))
  if (novas.length) { novas.forEach((m) => enviadas.add(m.id)); void enviar({ t: 'msgs', lista: novas }) }
}

function comecarARepassar() {
  enviadas = new Set(simulacaoAgora().mensagens.map((m) => m.id))
  let ultimo = ''
  desligarEscuta = ouvirSimulacao(() => {
    repassar()
    const e = JSON.stringify(pacoteDeEstado())
    if (e !== ultimo) { ultimo = e; void enviar(JSON.parse(e)) }
  })
  // de tempos em tempos, o estado completo (quem perdeu um pacote se acerta)
  timerEstado = window.setInterval(() => void enviar(pacoteDeEstado()), 3000)
}

/* --------------------------------------------------------------- entrar */

/** Entra na sala de treino: o admin para transmitir, o membro para assistir. */
export async function entrarNoTreino(sessao: SessaoTeeds): Promise<void> {
  if (sala && estado.fase !== 'erro') return
  await sairDoTreino()
  mudar({ ...INICIAL, fase: 'conectando' })
  try {
    const ingresso = await pedirIngresso(sessao)
    const r = new Room({ adaptiveStream: true, dynacast: true })
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
          void enviar({ t: 'historico', lista: simulacaoAgora().mensagens.slice(-60) }, [p.identity])
          void enviar(pacoteDeEstado(), [p.identity])
        }
      })
      .on(RoomEvent.Reconnecting, () => mudar({ fase: 'reconectando' }))
      .on(RoomEvent.Reconnected, () => mudar({ fase: 'conectada' }))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => mudar({ somBloqueado: !r.canPlaybackAudio }))
      .on(RoomEvent.Disconnected, () => { if (sala === r) { sala = null; mudar({ fase: 'fora', tela: null, camera: null, audios: [], presente: false }) } })
      .on(RoomEvent.DataReceived, (dados: Uint8Array, p?: RemoteParticipant, _k?: unknown, topico?: string) => {
        if (topico !== TOPICO || !p) return
        let pacote: Pacote
        try { pacote = JSON.parse(new TextDecoder().decode(dados)) } catch { return }
        if (estado.apresentador) {
          // do membro: a mensagem entra no chat da simulação (e volta para todos)
          if (pacote.t === 'membro') mensagemDeMembro(p.name || 'Membro', String(pacote.texto))
          return
        }
        if (!ehApresentador(p)) return
        if (pacote.t === 'estado') {
          canto = pacote.canto
          mudar({ canto: pacote.canto, sim: { ativa: pacote.ativa, publico: pacote.publico, momento: pacote.momento, pausada: pacote.pausada } })
        } else if (pacote.t === 'msgs') {
          const ja = new Set(estado.mensagens.map((m) => m.id))
          mudar({ mensagens: [...estado.mensagens, ...pacote.lista.filter((m) => !ja.has(m.id))].slice(-200) })
        } else if (pacote.t === 'historico') {
          mudar({ mensagens: pacote.lista.slice(-200) })
        } else if (pacote.t === 'limpar') {
          mudar({ mensagens: [] })
        }
      })
    await r.connect(ingresso.url, ingresso.token, { autoSubscribe: true })
    await r.startAudio().catch(() => undefined)
    mudar({ fase: 'conectada', apresentador: ingresso.moderador, meuNome: ingresso.nome, somBloqueado: !r.canPlaybackAudio })
    if (ingresso.moderador) comecarARepassar()
    atualizarSala()
  } catch (e) {
    sala = null
    mudar({ fase: 'erro', erro: e instanceof Error ? e.message : 'Não consegui abrir a sala de treino.' })
  }
}

export async function sairDoTreino(): Promise<void> {
  desligarEscuta?.(); desligarEscuta = null
  window.clearInterval(timerEstado)
  for (const k of Object.keys(publicadas) as Array<keyof typeof publicadas>) delete publicadas[k]
  const r = sala
  sala = null
  if (r) await r.disconnect().catch(() => undefined)
  mudar({ ...INICIAL })
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
export async function publicarNoTreino(qual: 'tela' | 'camera' | 'mic', faixa: LocalVideoTrack | MediaStreamTrack | null): Promise<void> {
  if (!sala || !estado.apresentador) return
  const antiga = publicadas[qual]
  if (antiga) { await sala.localParticipant.unpublishTrack(antiga, false).catch(() => undefined); delete publicadas[qual] }
  if (!faixa) { atualizarSala(); return }
  const local = faixa instanceof LocalVideoTrack ? faixa
    : qual === 'mic' ? new LocalAudioTrack(faixa, undefined, true) : new LocalVideoTrack(faixa, undefined, true)
  const source = qual === 'tela' ? Track.Source.ScreenShare : qual === 'camera' ? Track.Source.Camera : Track.Source.Microphone
  await sala.localParticipant.publishTrack(local, { source, ...(qual === 'tela' ? { videoEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 } } : {}) })
  publicadas[qual] = local
  atualizarSala()
}

/** Em que canto o rosto aparece para quem assiste. */
export function cantoNoTreino(c: CantoDaCamera): void {
  canto = c
  if (estado.apresentador) void enviar(pacoteDeEstado())
}

/* --------------------------------------------------------- o membro fala */

export async function mandarNoTreino(texto: string): Promise<void> {
  const t = texto.trim().slice(0, 500)
  if (!t || !sala || estado.apresentador) return
  await enviar({ t: 'membro', texto: t })
}

/** Só para o laboratório: a visão de quem assiste, sem conectar. */
export function simularTreino(p: Partial<EstadoDoTreino>): void { mudar(p) }
