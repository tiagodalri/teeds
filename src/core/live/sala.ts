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
  ConnectionQuality, ConnectionState, DataPacket_Kind, DisconnectReason, LocalParticipant, Participant, RemoteParticipant, Room, RoomEvent,
  ScreenSharePresets, Track, type LocalTrackPublication, type RemoteTrack, type RemoteTrackPublication,
} from 'livekit-client'
import { useSyncExternalStore } from 'react'
import type { SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'
import {
  gravarMensagem, historicoDoChat, infoDoConvite, moderarMensagem, mudarLive, pedirIngresso, pedirIngressoConvidado,
  silenciar as silenciarNoBanco, type CantoDaCamera, type Ingresso, type Live, type MensagemDoChat,
} from './api'
import { marcarPlayerAtivo } from './presenca'
import { aplicarFundo, fundoGuardado, type EscolhaDeFundo } from './fundos'
import type { LocalVideoTrack } from 'livekit-client'

export type ModoDoPlayer = 'palco' | 'lado' | 'flutuante' | 'pilula'
export type TamanhoFlutuante = 'P' | 'M' | 'G'
/** Como está a conexão de quem assiste (ou transmite), para o aviso discreto. */
export type Qualidade = 'boa' | 'media' | 'fraca' | 'perdida'

/** As reações que sobem pela imagem (coração, fogo, palmas...). Os ids são os mesmos para todos. */
export const REACOES = ['coracao', 'fogo', 'palmas', 'foguete', 'cem'] as const
export type Reacao = typeof REACOES[number]
export interface ReacaoNaTela { id: number; tipo: Reacao; x: number; minha: boolean }

/** Uma enquete da equipe: pergunta, opções e a contagem (o apresentador é quem conta). */
export interface Enquete {
  id: string
  pergunta: string
  opcoes: string[]
  aberta: boolean
  votos: number[]
  /** O que esta pessoa votou (null = ainda não). */
  meuVoto: number | null
}

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
  /** Do apresentador: o fundo da câmera escolhido (vale também para a próxima live). */
  fundo: EscolhaDeFundo
  /** Entrou pelo link público, sem conta (fase de testes). */
  convidado: boolean
  /** A conexão desta pessoa com a sala. */
  qualidade: Qualidade
  /** Reações subindo pela imagem agora (as velhas somem sozinhas). */
  reacoes: ReacaoNaTela[]
  /** Quantas reações a sala mandou nesta sessão (o apresentador vê o calor da sala). */
  totalReacoes: number
  /** A enquete na tela agora (null = nenhuma). */
  enquete: Enquete | null
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
  fundo: typeof window === 'undefined' ? 'nenhum' : fundoGuardado(),
  convidado: false, qualidade: 'boa', reacoes: [], totalReacoes: 0, enquete: null,
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
/** Como voltar para a sala se a conexão cair (o ingresso vence; pede-se outro). */
let reentrada: (() => Promise<Ingresso>) | null = null
let tentativas = 0
let saindo = false
let contador: number | undefined
let chatAberto = true

const TOPICO = 'chat'
const TOPICO_REACAO = 'reacao'
type Pacote =
  | { t: 'msg'; id: string; texto: string; ts: string }
  | { t: 'apagar'; id: string }
  | { t: 'fixar'; id: string | null }
  | { t: 'fim' }
  | { t: 'chat'; aberto: boolean }
  | { t: 'camera'; canto: CantoDaCamera; tamanho?: 'p' | 'm' | 'g' }
  | { t: 'faixa'; texto: string | null }
  | { t: 'enquete'; id: string | null; pergunta?: string; opcoes?: string[]; aberta?: boolean; votos?: number[] }
  | { t: 'voto'; id: string; opcao: number }

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
  reentrada = () => pedirIngresso(sessao, live.id)
  await conectar(live, reentrada, () => historicoDoChat(sessao, live.id).catch(() => [] as MensagemDoChat[]))
}

/**
 * Entra pelo link público, sem conta (fase de testes): só assiste e conversa;
 * nada que escrever fica gravado. O nome é o que a pessoa digitou.
 */
export async function entrarComoConvidado(codigo: string, nome: string): Promise<void> {
  await sair()
  sessaoAtual = null
  mudar({ fase: 'conectando', erro: null, live: null, mensagens: [], naoLidas: 0, convidado: true })
  let ingresso: Ingresso
  try {
    ingresso = await pedirIngressoConvidado(codigo, nome)
  } catch (e) {
    mudar({ fase: 'erro', erro: e instanceof Error ? e.message : 'Não consegui entrar na transmissão.' })
    return
  }
  reentrada = () => pedirIngressoConvidado(codigo, nome)
  await conectar(ingresso.live!, async () => ingresso, async () => ingresso.historico ?? [])
}

async function conectar(live: Live, pedir: () => Promise<Ingresso>, historicoDe: () => Promise<MensagemDoChat[]>): Promise<void> {
  saindo = false
  marcarPlayerAtivo(true)
  mudar({ fase: 'conectando', erro: null, live, mensagens: [], naoLidas: 0, reacoes: [], totalReacoes: 0, qualidade: 'boa' })
  try {
    const [ingresso, historico] = await Promise.all([pedir(), historicoDe()])
    const r = new Room({
      adaptiveStream: true, // cada um recebe a resolução do tamanho em que está vendo
      dynacast: true, // o apresentador não manda camada que ninguém pede
      publishDefaults: {
        // tela de gráfico: nitidez antes de fluidez; 15 quadros bastam
        screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 },
        // camadas menores para quem vê no celular ou no flutuante (o servidor escolhe)
        screenShareSimulcastLayers: [ScreenSharePresets.h360fps15, ScreenSharePresets.h720fps15],
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
      .on(RoomEvent.ConnectionQualityChanged, (q: ConnectionQuality, p: Participant) => {
        if (p !== r.localParticipant) return
        mudar({ qualidade: q === ConnectionQuality.Excellent ? 'boa' : q === ConnectionQuality.Good ? 'media' : q === ConnectionQuality.Poor ? 'fraca' : q === ConnectionQuality.Lost ? 'perdida' : estado.qualidade })
      })
      .on(RoomEvent.Disconnected, (motivo?: DisconnectReason) => {
        if (sala !== r) return
        sala = null
        mudar({ fase: 'fora', tela: null, camera: null, audios: [] })
        // caiu sem a pessoa pedir (ingresso vencido, rede): volta sozinho, com um ingresso novo
        if (motivo === DisconnectReason.DUPLICATE_IDENTITY) { mudar({ erro: 'Você abriu esta live em outra aba ou aparelho. A transmissão continua lá.' }); marcarPlayerAtivo(false); return }
        const culpaNossa = saindo || motivo === DisconnectReason.CLIENT_INITIATED || motivo === DisconnectReason.ROOM_DELETED || motivo === DisconnectReason.PARTICIPANT_REMOVED
        if (!culpaNossa && estado.live && reentrada && tentativas < 3) {
          tentativas++
          const l = estado.live, pedirDeNovo = reentrada
          mudar({ fase: 'reconectando' })
          window.setTimeout(() => { if (!sala && !saindo) void conectar(l, pedirDeNovo, async () => estado.mensagens) }, 1500 * tentativas)
        }
      })
      .on(RoomEvent.DataReceived, (dados: Uint8Array, p?: RemoteParticipant, _k?: DataPacket_Kind, topico?: string) => {
        if (!p) return
        if (topico === TOPICO_REACAO) { receberReacao(new TextDecoder().decode(dados), false); return }
        if (topico !== TOPICO) return
        let pacote: Pacote
        try { pacote = JSON.parse(new TextDecoder().decode(dados)) } catch { return }
        if (pacote.t === 'msg') {
          receber({ id: pacote.id, userId: p.identity, nome: p.name || 'Aluno', texto: String(pacote.texto).slice(0, 500), doModerador: ehModerador(p), fixada: false, apagada: false, criadaEm: pacote.ts })
        } else if (pacote.t === 'voto') {
          if (estado.moderador) registrarVoto(p.identity, pacote.id, pacote.opcao)
        } else if (ehModerador(p)) {
          if (pacote.t === 'apagar') mudar({ mensagens: estado.mensagens.filter((m) => m.id !== pacote.id) })
          else if (pacote.t === 'fixar') mudar({ mensagens: estado.mensagens.map((m) => ({ ...m, fixada: m.id === pacote.id })) })
          else if (pacote.t === 'fim') { void sair(); mudar({ erro: 'A transmissão terminou. Obrigado por assistir.' }) }
          else if (pacote.t === 'chat') atualizarLive({ chatAberto: Boolean(pacote.aberto) })
          else if (pacote.t === 'camera') atualizarLive({ cameraCanto: pacote.canto, ...(pacote.tamanho ? { cameraTamanho: pacote.tamanho } : {}) })
          else if (pacote.t === 'faixa') atualizarLive({ faixa: pacote.texto ? String(pacote.texto).slice(0, 120) : null })
          else if (pacote.t === 'enquete') receberEnquete(pacote)
        }
      })
    await r.connect(ingresso.url, ingresso.token, { autoSubscribe: true })
    await r.startAudio().catch(() => undefined)
    tentativas = 0
    mudar({
      fase: 'conectada', moderador: ingresso.moderador, silenciado: ingresso.silenciado, meuNome: ingresso.nome,
      convidado: !!ingresso.convidado, live: ingresso.live ?? live,
      mensagens: historico.filter((m) => !m.apagada), espectadores: Math.max(0, r.numParticipants - 1),
      somBloqueado: !r.canPlaybackAudio,
    })
    faixas()
    void manterTelaAcesa(true)
    window.clearInterval(contador)
    contador = window.setInterval(() => mudar({ espectadores: Math.max(0, r.numParticipants - 1) }), 5000)
  } catch (e) {
    sala = null
    mudar({ fase: 'erro', erro: e instanceof Error ? e.message : 'Não consegui entrar na transmissão.' })
  }
}

/* ------------------------------------------------------- tela acesa (celular) */

let tranca: { release: () => Promise<void> } | null = null
/** Enquanto assiste, a tela do celular não apaga. Solta ao sair. */
async function manterTelaAcesa(ligar: boolean): Promise<void> {
  try {
    if (!ligar) { await tranca?.release(); tranca = null; return }
    if (tranca || document.visibilityState !== 'visible') return
    tranca = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null
    tranca && (tranca as unknown as EventTarget).addEventListener?.('release', () => { tranca = null })
  } catch { tranca = null /* sem suporte ou sem permissão: segue normal */ }
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && sala) void manterTelaAcesa(true) })
}

export async function sair(): Promise<void> {
  saindo = true
  reentrada = null
  tentativas = 0
  window.clearInterval(contador)
  const r = sala
  sala = null
  if (r) await r.disconnect().catch(() => undefined)
  window.clearInterval(timerEnquete)
  mudar({ fase: 'fora', tela: null, camera: null, audios: [], espectadores: 0, reacoes: [], enquete: null, transmitindo: { tela: false, camera: false, microfone: false } })
  void manterTelaAcesa(false)
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
  if (!limpo || !sala || !estado.live) return
  if (estado.silenciado) throw new Error('O moderador pausou suas mensagens nesta transmissão.')
  if (!estado.live.chatAberto && !estado.moderador) throw new Error('O chat está fechado agora. Ele abre quando o moderador liberar.')
  const id = crypto.randomUUID()
  const ts = new Date().toISOString()
  if (sessaoAtual) {
    // Grava primeiro só quando há modo lento: aí o banco é quem diz se pode.
    const gravar = gravarMensagem(sessaoAtual, { id, liveId: estado.live.id, nome: estado.meuNome, texto: limpo, doModerador: estado.moderador })
    if (estado.live.intervaloChat > 0 && !estado.moderador) await gravar
    else gravar.catch(() => undefined)
  } else if (estado.live.intervaloChat > 0) {
    // convidado no modo lento: a conta é feita aqui mesmo
    const eu = sala.localParticipant.identity
    const minhas = estado.mensagens.filter((m) => m.userId === eu)
    const ultima = minhas[minhas.length - 1]
    const falta = ultima ? estado.live.intervaloChat * 1000 - (Date.now() - new Date(ultima.criadaEm).getTime()) : 0
    if (falta > 0) throw new Error(`Modo lento: espere ${Math.ceil(falta / 1000)} s para mandar outra mensagem.`)
  }
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

/* ---------------------------------------------------------------- reações */

let contadorReacao = 0
let ultimaReacao = 0
function receberReacao(bruto: string, minha: boolean) {
  const tipo = bruto as Reacao
  if (!REACOES.includes(tipo)) return
  const nova: ReacaoNaTela = { id: ++contadorReacao, tipo, x: 8 + Math.random() * 84, minha }
  mudar({ reacoes: [...estado.reacoes, nova].slice(-40), totalReacoes: estado.totalReacoes + 1 })
  window.setTimeout(() => mudar({ reacoes: estado.reacoes.filter((r) => r.id !== nova.id) }), 2600)
}

/** Manda uma reação para a sala inteira (sobe pela imagem de todo mundo). */
export async function reagir(tipo: Reacao): Promise<void> {
  if (estado.fase !== 'conectada') return
  const agora = Date.now()
  if (agora - ultimaReacao < 150) return // dedo rápido não vira enxurrada
  ultimaReacao = agora
  receberReacao(tipo, true)
  try { navigator.vibrate?.(8) } catch { /* sem vibração */ }
  await sala?.localParticipant.publishData(new TextEncoder().encode(tipo), { reliable: false, topic: TOPICO_REACAO }).catch(() => undefined)
}

/* --------------------------------------------------------------- enquetes */

// Quem contou foi o apresentador: um voto por pessoa (o último vale).
const urnas = new Map<string, Map<string, number>>()
let timerEnquete: number | undefined

function contagem(id: string, total: number): number[] {
  const votos = new Array<number>(total).fill(0)
  for (const o of urnas.get(id)?.values() ?? []) if (o >= 0 && o < total) votos[o]++
  return votos
}

function registrarVoto(identidade: string, id: string, opcao: number) {
  const e = estado.enquete
  if (!e || e.id !== id || !e.aberta) return
  if (!urnas.has(id)) urnas.set(id, new Map())
  urnas.get(id)!.set(identidade, Math.floor(opcao))
  mudar({ enquete: { ...e, votos: contagem(id, e.opcoes.length) } })
}

/** Do apresentador para a sala, de tempos em tempos: quem entra no meio também vê a enquete. */
function transmitirEnquete() {
  const e = estado.enquete
  if (!e) { void enviar({ t: 'enquete', id: null }); return }
  void enviar({ t: 'enquete', id: e.id, pergunta: e.pergunta, opcoes: e.opcoes, aberta: e.aberta, votos: e.votos })
}

function receberEnquete(p: Extract<Pacote, { t: 'enquete' }>) {
  if (!p.id) { mudar({ enquete: null }); return }
  const atual = estado.enquete
  const meuVoto = atual?.id === p.id ? atual.meuVoto : null
  mudar({ enquete: { id: p.id, pergunta: String(p.pergunta ?? '').slice(0, 160), opcoes: (p.opcoes ?? []).slice(0, 4).map((o) => String(o).slice(0, 60)), aberta: !!p.aberta, votos: p.votos ?? [], meuVoto } })
}

/** O apresentador abre uma enquete (2 a 4 opções). Fica na tela de todos até ele tirar. */
export async function criarEnquete(pergunta: string, opcoes: string[]): Promise<void> {
  if (!estado.moderador) return
  const limpas = opcoes.map((o) => o.trim().slice(0, 60)).filter(Boolean).slice(0, 4)
  const p = pergunta.trim().slice(0, 160)
  if (!p || limpas.length < 2) throw new Error('Escreva a pergunta e pelo menos duas opções.')
  const id = crypto.randomUUID()
  urnas.set(id, new Map())
  mudar({ enquete: { id, pergunta: p, opcoes: limpas, aberta: true, votos: limpas.map(() => 0), meuVoto: null } })
  transmitirEnquete()
  window.clearInterval(timerEnquete)
  timerEnquete = window.setInterval(transmitirEnquete, 4000)
}

/** Fecha a votação (o resultado continua na tela) ou tira a enquete da tela. */
export async function encerrarEnquete(tirar = false): Promise<void> {
  if (!estado.moderador) return
  window.clearInterval(timerEnquete)
  if (tirar || !estado.enquete) { mudar({ enquete: null }); transmitirEnquete(); return }
  mudar({ enquete: { ...estado.enquete, aberta: false } })
  transmitirEnquete()
}

/** O voto de quem assiste (vai só para o apresentador contar). */
export async function votar(opcao: number): Promise<void> {
  const e = estado.enquete
  if (!e || !e.aberta || estado.fase !== 'conectada') return
  mudar({ enquete: { ...e, meuVoto: opcao } })
  try { navigator.vibrate?.(8) } catch { /* sem vibração */ }
  if (estado.moderador) { registrarVoto(sala?.localParticipant.identity ?? 'eu', e.id, opcao); return }
  await enviar({ t: 'voto', id: e.id, opcao }).catch(() => undefined)
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
  await sala.localParticipant.setCameraEnabled(ligar, { resolution: { width: 1280, height: 720, frameRate: 24 } })
  // a câmera volta com o fundo que estava escolhido
  if (ligar && estado.fundo !== 'nenhum') await definirFundo(estado.fundo).catch(() => undefined)
  faixas()
}

const cameraLocal = () => sala?.localParticipant.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined

/** Troca o fundo da câmera do apresentador (todos veem o resultado). */
export async function definirFundo(escolha: EscolhaDeFundo): Promise<void> {
  mudar({ fundo: escolha })
  const faixa = cameraLocal()
  if (faixa) await aplicarFundo(faixa, escolha)
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
