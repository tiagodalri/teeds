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
  AudioPresets, DisconnectReason, LocalAudioTrack, LocalVideoTrack, Participant, RemoteParticipant, Room, RoomEvent, ScreenSharePresets, Track, VideoPresets,
  type LocalTrackPublication, type TrackPublishOptions,
} from 'livekit-client'
import { useSyncExternalStore } from 'react'
import { SUPABASE } from '../teeds/config'
import { sessaoGuardada, type SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'
import type { CantoDaCamera } from './api'
import {
  espelharSimulacao, espelhando, executarComando, mensagemDeMembro, ouvirSimulacao, pararSimulacaoAqui, receberEspelho, simulacaoAgora, simulacaoLocalAtiva,
  type ComandoDaSimulacao, type EstadoDaSimulacao, type MensagemSimulada, type Momento,
} from './simulacao'
import { marcarTreinoAtivo } from './presenca'
import { marcarEmUso } from '../atualizacaoSegura'
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

/**
 * Uma pessoa da equipe no palco da live (26/11/2026, vários administradores juntos,
 * como no Meet): a câmera e a tela dela, cada uma no seu quadro, lado a lado.
 * A faixa é a recebida da sala (`Track`) ou, para a própria pessoa, a do aparelho dela.
 */
export interface PessoaNoPalco {
  id: string
  nome: string
  eu: boolean
  /** Quem comanda a live (o navegador onde o público, a I.A. e as telas rodam). */
  dono: boolean
  camera: Track | MediaStreamTrack | null
  tela: Track | MediaStreamTrack | null
  mic: boolean
  falando: boolean
}

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
  /** Para o admin (23/11/2026): outro administrador já está transmitindo nesta sala (o nome dele). */
  outroTransmitindo: string | null
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
  /* vários administradores na mesma live (26/11/2026) */
  /** Admin acompanhando (e ajudando a comandar) a live que outro administrador começou. */
  coApresentando: boolean
  /** Nome de quem comanda a live, para quem está no espelho. */
  dono: string
  /** O dono saiu ou caiu no meio da live (nome dele): outro administrador pode assumir. */
  donoSumiu: string | null
  /** Este administrador entrou no palco: a câmera, o microfone e a tela dele vão para a live. */
  noPalco: boolean
  /** Quem está no palco agora (o dono e quem entrou com ele). */
  palco: PessoaNoPalco[]
  /** A live mostra o palco lado a lado (tela de conversa com duas ou mais pessoas no palco). */
  grade: boolean
  /** A tela no ar é de conversa (Ao vivo, Só câmera): o palco lado a lado vale nela. */
  conversa: boolean
  /** O quadro que a equipe fixou para todos (`id:camera` ou `id:tela`). */
  fixadoParaTodos: string | null
  /** O quadro que esta pessoa fixou para si; '' = desfixou o da equipe; null = segue a equipe. */
  fixadoAqui: string | null
  /** Para a equipe: os membros de verdade na sala (a conta de cada um), para a ficha. */
  membrosNaSala: Array<{ id: string; nome: string }>
  /** Quando a live começou (para o markup "nesta live"); 0 = fora do ar. */
  inicioDaLive: number
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
  presente: false, quemApresenta: '', outroTransmitindo: null, tela: null, camera: null, audios: [], canto: 'inf-dir',
  sim: { ativa: false, publico: 0, momento: null, pausada: false, chatAberto: true }, mensagens: [], somBloqueado: false, encerrada: false,
  modo: 'palco', tamanho: 'M', cantoPlayer: 'inf-dir',
  local: { tela: null, camera: null, mic: null }, fundo: 'nenhum', aplicandoFundo: false,
  usandoEstudio: false, teste: null, vitrines: null,
  coApresentando: false, dono: '', donoSumiu: null, noPalco: false, palco: [], grade: false, conversa: true, fixadoParaTodos: null, fixadoAqui: null,
  membrosNaSala: [], inicioDaLive: 0,
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
const mudar = (p: Partial<EstadoDoTreino>) => {
  estado = { ...estado, ...p }
  // 24/11/2026: na sala (assistindo ou transmitindo), versão nova do site não recarrega a página sozinha
  const naSala = estado.fase !== 'fora'
  marcarEmUso('treino', naSala)
  void manterTelaAcesa(naSala)
  ouvintes.forEach((f) => f())
}

/* -------------------------------------------- tela acesa e volta sozinho */

let tranca: { release: () => Promise<void> } | null = null
let pedindoTranca = false
/** 24/11/2026: na sala, a tela do celular não apaga (o iPhone bloqueado para a câmera e derruba a live). */
async function manterTelaAcesa(ligar: boolean): Promise<void> {
  try {
    if (!ligar) { const t = tranca; tranca = null; await t?.release(); return }
    if (tranca || pedindoTranca || typeof document === 'undefined' || document.visibilityState !== 'visible') return
    pedindoTranca = true
    tranca = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request('screen') ?? null
    tranca && (tranca as unknown as EventTarget).addEventListener?.('release', () => { tranca = null })
  } catch { tranca = null /* sem suporte ou sem permissão: segue normal */ } finally { pedindoTranca = false }
}
/** Quem saiu de propósito (botão Sair) não volta sozinho. */
let saiuDeProposito = false
let tentativas = 0
let timerDeVolta: number | undefined
/** Caiu sem a pessoa pedir: tenta de novo, esperando um pouco mais a cada vez (até 6 vezes). */
function tentarVoltar(): boolean {
  if (saiuDeProposito || !ultimaEntrada || tentativas >= 6) return false
  tentativas++
  window.clearTimeout(timerDeVolta)
  timerDeVolta = window.setTimeout(() => { if (!sala && !saiuDeProposito && ultimaEntrada) void entrarNoTreino(ultimaEntrada.sessao, ultimaEntrada.nome, ultimaEntrada.comoCentral) }, Math.min(2000 * tentativas, 10_000))
  return true
}
if (typeof document !== 'undefined') {
  // voltou para o app (celular desbloqueado, aba de volta) ou a internet voltou: entra de novo na hora
  const voltar = () => {
    if (document.visibilityState !== 'visible') return
    if (sala) { void manterTelaAcesa(true); return }
    if (saiuDeProposito || !ultimaEntrada || (estado.fase !== 'fora' && estado.fase !== 'erro')) return
    tentativas = 0
    void entrarNoTreino(ultimaEntrada.sessao, ultimaEntrada.nome, ultimaEntrada.comoCentral)
  }
  document.addEventListener('visibilitychange', voltar)
  window.addEventListener('online', voltar)
}
/** O erro do navegador ("Failed to fetch", "Load failed") vira uma frase que a pessoa entende. */
const erroLegivel = (e: unknown, deNovo: boolean): string => {
  const m = e instanceof Error ? e.message : ''
  if (!m || /fetch|load failed|network|timeout|abort/i.test(m)) return deNovo ? 'Sem conexão com a sala. Tentando de novo…' : 'Sem conexão com a sala. Confira a internet e tente de novo.'
  return m
}
export const useTreino = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => estado, () => estado)

const TOPICO = 'treino'
/** Um comando do painel que outro administrador manda para o dono executar. */
export type ComandoDoPainel = ComandoDaSimulacao | { a: 'tela'; id: string } | { a: 'fixar'; chave: string | null }
type Pacote =
  | { t: 'estado'; ativa: boolean; publico: number; momento: Momento | null; pausada: boolean; canto: CantoDaCamera; chatAberto?: boolean; conversa?: boolean; fixado?: string | null }
  | { t: 'painel'; s: Partial<EstadoDaSimulacao>; programa: string | null; desde?: number }
  | { t: 'eq-msgs'; lista: MensagemSimulada[] }
  | { t: 'cmd'; c: ComandoDoPainel }
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
/** Este apresentador está mandando imagem agora (e não só com a Central aberta)? */
const mandaVideo = (p: Participant) => [...p.trackPublications.values()].some((pub) => pub.kind === Track.Kind.Video && !pub.isMuted && !ehDoPalco(pub.trackName))
/** As faixas do palco (câmera, tela e microfone de cada administrador), separadas da imagem da live. */
const ehDoPalco = (nome?: string) => !!nome && nome.startsWith('palco-')
const temPalco = (p: Participant) => [...p.trackPublications.values()].some((pub) => ehDoPalco(pub.trackName))
/**
 * 23/11/2026: com dois administradores na sala, o aluno seguia o primeiro que achava (que podia
 * nem estar transmitindo) e aceitava o "fora do ar" de quem só tinha a Central aberta.
 * Agora quem assiste segue o dono da live: quem manda vídeo ou quem disse por último que está no ar.
 */
let donoDaLive: string | null = null
/** Quando o dono disse por último que está no ar (outro só assume depois de 10 s de silêncio dele). */
let donoVistoEm = 0
function apresentadorQueVale(remotos: RemoteParticipant[]): RemoteParticipant | undefined {
  const apresentadores = remotos.filter(ehApresentador)
  return apresentadores.find((p) => p.identity === donoDaLive && mandaVideo(p))
    ?? apresentadores.find(mandaVideo) ?? apresentadores.find((p) => p.identity === donoDaLive) ?? apresentadores[0]
}
/** Para o admin: o último "estou no ar" de outro administrador (vale por 10 s). */
let outroAtivo: { id: string; nome: string; quando: number } | null = null
/** Outro administrador está no ar agora? (vídeo, ou disse que está há menos de 10 s) */
export function outroNoAr(): string | null {
  return donoRemoto()?.name || (donoRemoto() ? 'Outro administrador' : null)
}
/** Para o admin: o outro administrador que está comandando a live agora (ou ninguém). */
function donoRemoto(): RemoteParticipant | null {
  if (!sala || !estado.apresentador || simulacaoLocalAtiva()) return null
  const remotos = [...sala.remoteParticipants.values()]
  if (outroAtivo && Date.now() - outroAtivo.quando < 10_000) {
    const p = sala.remoteParticipants.get(outroAtivo.id)
    if (p) return p
  }
  return remotos.find((p) => ehApresentador(p) && mandaVideo(p)) ?? null
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
  const souDono = estado.apresentador && simulacaoLocalAtiva()
  // o admin que não comanda acompanha a live do dono (se houver) como quem assiste
  const donoAdmin = estado.apresentador && !souDono ? donoRemoto() : null
  const espelho = !!donoAdmin
  if (espelho !== espelhando()) espelharSimulacao(espelho ? enviarComando : null)
  if (espelho) { donoQueSumiu = null; ultimoDono = { id: donoAdmin.identity, nome: donoAdmin.name || 'Outro administrador' } }
  else if (estado.coApresentando && ultimoDono && !souDono) {
    // o dono saiu (ou caiu) no meio da live: dá para assumir daqui
    donoQueSumiu = ultimoDono.nome
    if (estado.noPalco) void sairDoPalcoAgora()
  }
  if (souDono) donoQueSumiu = null
  const quemTransmite = estado.apresentador ? donoAdmin ?? undefined : apresentadorQueVale(remotos)
  let tela: Track | null = null, camera: Track | null = null
  const audios: Track[] = []
  for (const pub of quemTransmite?.trackPublications.values() ?? []) {
    const t = pub.track
    if (!t || pub.isMuted || ehDoPalco(pub.trackName)) continue
    if (pub.source === Track.Source.ScreenShare) tela = t
    else if (pub.source === Track.Source.Camera) camera = t
    // o som da live: quem assiste ouve; o admin no espelho ouve a voz do dono pelo palco (o som das telas toca no painel dele)
    else if (t.kind === Track.Kind.Audio && !estado.apresentador) audios.push(t)
  }
  // ----- o palco: quem está com câmera, tela ou microfone junto do dono
  const conversa = souDono ? conversaLocal : estado.conversa
  const ativa = souDono || (estado.apresentador ? espelho : estado.sim.ativa)
  const donoId = souDono ? sala.localParticipant.identity : quemTransmite?.identity ?? null
  const outrosNoPalco = remotos.filter((p) => ehApresentador(p) && p.identity !== donoId && temPalco(p))
  const falando = new Set(sala.activeSpeakers.map((p) => p.identity))
  const daSala = (p: RemoteParticipant, dono: boolean): PessoaNoPalco => {
    const pub = (nome: string) => [...p.trackPublications.values()].find((x) => x.trackName === nome)
    const cam = pub('palco-camera'), tl = pub('palco-tela'), mic = pub('palco-mic')
    return {
      id: p.identity, nome: p.name || (dono ? 'Apresentador' : 'Equipe'), eu: false, dono,
      camera: cam && !cam.isMuted ? cam.track ?? null : null, tela: tl && !tl.isMuted ? tl.track ?? null : null,
      mic: !!mic && !mic.isMuted, falando: falando.has(p.identity),
    }
  }
  const eu = (dono: boolean): PessoaNoPalco => {
    const f = fontesDoPalco()
    return { id: sala!.localParticipant.identity, nome: estado.meuNome || 'Você', eu: true, dono, camera: f.camera, tela: f.tela, mic: !!f.mic && !f.micMudo, falando: falando.has(sala!.localParticipant.identity) }
  }
  const palco: PessoaNoPalco[] = []
  if (ativa && donoId) {
    if (souDono) palco.push(eu(true))
    else if (quemTransmite) palco.push(daSala(quemTransmite, true))
    if (espelho && estado.noPalco) palco.push(eu(false))
    for (const p of outrosNoPalco) palco.push(daSala(p, false))
  }
  const grade = ativa && conversa && palco.length >= 2
  // ----- o que cada um recebe das faixas do palco (o resto da sala nem baixa)
  for (const p of remotos) {
    if (!ehApresentador(p)) continue
    const noPalco = palco.some((x) => x.id === p.identity)
    for (const pub of p.trackPublications.values()) {
      if (!ehDoPalco(pub.trackName)) continue
      const micDoDono = pub.trackName === 'palco-mic' && p.identity === donoId
      const quer = estado.apresentador
        ? noPalco || p.identity === donoId
        : noPalco && grade && !micDoDono
      if (pub.isDesired !== quer) pub.setSubscribed(quer)
      const t = pub.track
      if (!t || pub.isMuted || t.kind !== Track.Kind.Audio) continue
      // a voz da equipe: o dono ouve quem está no palco; quem ajuda ouve o dono e os outros;
      // quem assiste ouve os convidados só na tela de conversa (o dono já vem no som da live)
      // (quem só acompanha a live na Central não ouve: no mesmo ambiente, o som voltaria pelo microfone do dono)
      if (estado.apresentador ? quer && (souDono || estado.noPalco) : quer && conversa) audios.push(t)
    }
  }
  if (estado.apresentador && souDono) anotarPresencas(membros.map((p) => ({ id: p.identity, nome: p.name || 'Membro' })))
  mudar({
    membros: membros.length, nomes: membros.map((p) => p.name || 'Membro').slice(0, 80),
    ...(estado.apresentador ? { membrosNaSala: membros.map((p) => ({ id: p.identity, nome: p.name || 'Membro' })).slice(0, 300) } : {}),
    inicioDaLive: souDono ? registro.inicio : espelho ? inicioDoDono : 0,
    presente: estado.apresentador || !!quemTransmite, quemApresenta: quemTransmite?.name || '', tela, camera, audios,
    outroTransmitindo: outroNoAr(),
    coApresentando: espelho, dono: donoAdmin?.name || (espelho ? 'Outro administrador' : ''), donoSumiu: donoQueSumiu,
    palco, grade, conversa,
    ...(souDono ? { fixadoParaTodos: fixadoDaEquipe } : {}),
  })
  sincronizarPalco()
}

/* ------------------------------------------ vários administradores (26/11/2026)
   O dono (quem começou) comanda: o público, a I.A. e as telas rodam no navegador dele.
   Os outros administradores entram no espelho: veem o que os alunos veem, mexem no
   mesmo painel (o comando vai para o dono) e, ao "Entrar no palco", a câmera, o
   microfone e a tela deles vão para a live, cada um no seu quadro (como no Meet). */

let ultimoDono: { id: string; nome: string } | null = null
/** No espelho: quando a live do dono começou (vem no painel dele). */
let inicioDoDono = 0
let donoQueSumiu: string | null = null
/** A tela no ar do dono é de conversa (o painel informa; no celular, sem telas, é sempre). */
let conversaLocal = true
let fixadoDaEquipe: string | null = null
/** Para o dono: põe no ar a tela que outro administrador escolheu (o painel registra). */
let telaPedida: ((id: string) => void) | null = null
/** No espelho: a tela que está no ar no dono (o painel marca). */
let programaDoDono: ((id: string) => void) | null = null
export function ligarTelasDoTreino(op: { porNoAr: (id: string) => void; marcarNoAr: (id: string) => void } | null): void {
  telaPedida = op?.porNoAr ?? null
  programaDoDono = op?.marcarNoAr ?? null
}
/** O painel avisa se a tela no ar é de conversa (vale para o palco lado a lado). */
export function informarTelaDoTreino(conversa: boolean): void {
  if (conversa === conversaLocal) return
  conversaLocal = conversa
  if (simulacaoLocalAtiva()) { void enviar(pacoteDeEstado()); atualizarSala() }
}

/** De onde vêm a câmera, a tela e o microfone do palco: do painel (estúdio) ou dos botões avulsos. */
type FontesDoPalco = { camera: MediaStreamTrack | null; tela: MediaStreamTrack | null; mic: MediaStreamTrack | null; micMudo: boolean }
let fontesDoPainel: (() => FontesDoPalco) | null = null
const fontesAvulsas = (): FontesDoPalco => ({
  camera: estado.local.camera?.getVideoTracks()[0] ?? null,
  tela: estado.local.tela?.getVideoTracks()[0] ?? null,
  mic: estado.local.mic?.getAudioTracks()[0] ?? null,
  micMudo: false,
})
const fontesDoPalco = (): FontesDoPalco => (fontesDoPainel ?? fontesAvulsas)()
/** O painel registra as fontes dele (e chama de novo, sem argumento, quando elas mudam). */
export function definirFontesDoPalco(f?: (() => FontesDoPalco) | null): void {
  if (f !== undefined) fontesDoPainel = f
  atualizarSala()
}

/** No espelho: o comando vai para o dono executar. */
function enviarComando(c: ComandoDoPainel): void {
  const id = ultimoDono?.id
  if (id) void enviar({ t: 'cmd', c }, [id])
}
/** Põe uma tela no ar: no dono, aqui; no espelho, pede ao dono. */
export function porTelaNoAr(id: string, aqui: (id: string) => void): void {
  if (estado.coApresentando) { enviarComando({ a: 'tela', id }); return }
  aqui(id)
}
/** Fixar um quadro só para mim (null = voltar a seguir a equipe; '' = nenhum). */
export function fixarAqui(chave: string | null): void { mudar({ fixadoAqui: chave }) }
/** Fixar um quadro para todos (só a equipe). */
export function fixarParaTodos(chave: string | null): void {
  if (!estado.apresentador) return
  if (estado.coApresentando) { enviarComando({ a: 'fixar', chave }); mudar({ fixadoAqui: null }); return }
  fixadoDaEquipe = chave
  mudar({ fixadoParaTodos: chave, fixadoAqui: null })
  if (simulacaoLocalAtiva()) void enviar(pacoteDeEstado())
}

/** Entra no palco da live que outro administrador comanda (câmera, microfone e tela vão junto). */
export function entrarNoPalco(): void {
  if (!estado.apresentador || !estado.coApresentando) return
  mudar({ noPalco: true })
  atualizarSala()
}
export function sairDoPalco(): Promise<void> { return sairDoPalcoAgora() }
async function sairDoPalcoAgora(): Promise<void> {
  if (estado.noPalco) mudar({ noPalco: false })
  await sincronizarPalcoAgora()
}

/** As faixas do palco que este navegador está mandando agora. */
const doPalco: Partial<Record<'camera' | 'tela' | 'mic', { local: LocalVideoTrack | LocalAudioTrack; bruta: MediaStreamTrack }>> = {}
let filaDoPalco: Promise<unknown> = Promise.resolve()
function sincronizarPalco() { filaDoPalco = filaDoPalco.then(sincronizarPalcoAgora).catch(() => undefined) }
async function sincronizarPalcoAgora(): Promise<void> {
  const r = sala
  // manda: o dono, só com outro administrador já no palco (sem ninguém, não gasta a internet dele à toa);
  // quem ajuda, depois de entrar no palco
  const convidadoNoPalco = r ? [...r.remoteParticipants.values()].some((p) => ehApresentador(p) && temPalco(p)) : false
  const manda = !!r && estado.apresentador && ((simulacaoLocalAtiva() && convidadoNoPalco) || (estado.coApresentando && estado.noPalco))
  const f = manda ? fontesDoPalco() : { camera: null, tela: null, mic: null, micMudo: false }
  for (const qual of ['camera', 'tela', 'mic'] as const) {
    const bruta = f[qual]
    const atual = doPalco[qual]
    if (atual && atual.bruta === bruta) {
      if (qual === 'mic' && atual.local.isMuted !== f.micMudo) await (f.micMudo ? atual.local.mute() : atual.local.unmute()).catch(() => undefined)
      continue
    }
    if (atual) { delete doPalco[qual]; if (r) await r.localParticipant.unpublishTrack(atual.local, false).catch(() => undefined) }
    if (!bruta || !r || sala !== r) continue
    const local = qual === 'mic' ? new LocalAudioTrack(bruta, undefined, true) : new LocalVideoTrack(bruta, undefined, true)
    doPalco[qual] = { local, bruta }
    const source = qual === 'tela' ? Track.Source.ScreenShare : qual === 'camera' ? Track.Source.Camera : Track.Source.Microphone
    try {
      await r.localParticipant.publishTrack(local, { name: `palco-${qual}`, source, ...(qual === 'tela' ? { simulcast: false, screenShareEncoding: { maxBitrate: 2_500_000, maxFramerate: 15 } } : {}) })
      if (qual === 'mic' && f.micMudo) await local.mute()
    } catch { if (doPalco[qual]?.local === local) delete doPalco[qual] }
  }
}

/* --------------------------------------------- do admin para quem assiste */

function pacoteDeEstado(): Pacote {
  const s = simulacaoAgora()
  return { t: 'estado', ativa: s.ativa, publico: s.publicoAgora, momento: s.momento, pausada: s.pausada, canto, chatAberto: s.chatAberto, conversa: conversaLocal, fixado: fixadoDaEquipe }
}
/** Para os outros administradores: o painel do dono (sem as mensagens, que vão à parte). */
function pacoteDoPainel(): Pacote {
  const { mensagens: _m, ...resto } = simulacaoAgora()
  return { t: 'painel', s: resto, programa: programaAtual?.() ?? null, desde: registro.inicio }
}
/** O painel diz qual tela está no ar (para o espelho dos outros administradores). */
let programaAtual: (() => string | null) | null = null
export function informarProgramaDoTreino(f: (() => string | null) | null): void { programaAtual = f }
const outrosAdministradores = () => (sala ? [...sala.remoteParticipants.values()].filter(ehApresentador).map((p) => p.identity) : [])
/** Avisa os outros administradores do painel e das mensagens (de 40 em 40: o pacote da sala é pequeno). */
function contarParaAEquipe(novas?: MensagemSimulada[]) {
  const ids = outrosAdministradores()
  if (!ids.length) return
  void enviar(pacoteDoPainel(), ids)
  const lista = novas ?? simulacaoAgora().mensagens.slice(-160)
  for (let i = 0; i < lista.length; i += 40) void enviar({ t: 'eq-msgs', lista: lista.slice(i, i + 40) }, ids)
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
  // os outros administradores veem tudo (as dos membros também: é o "Para a equipe" deles)
  if (novas.length) contarParaAEquipe(novas)
}

function comecarARepassar() {
  enviadas = new Set(simulacaoAgora().mensagens.map((m) => m.id))
  let ultimo = ''
  let ultimoPainel = ''
  let eraAtiva = simulacaoLocalAtiva()
  let eraNoArAntes = eraAtiva
  desligarEscuta = ouvirSimulacao(() => {
    // 26/11/2026: no espelho (live de outro administrador) este navegador não transmite nada
    if (espelhando()) { eraAtiva = false; eraNoArAntes = false; return }
    // Começar simulação = a transmissão começa; Encerrar = acaba, na hora (20/10/2026)
    const ativa = simulacaoLocalAtiva()
    // 23/11/2026: ao entrar no ar, o "estou no ar" vai antes das mensagens (quem assiste aceita só o dono)
    if (ativa && !eraNoArAntes) void enviar(pacoteDeEstado())
    // 24/11/2026: fora do ar não repassa mensagens nem "limpar" (outro admin pode estar no ar)
    if (ativa || eraNoArAntes) repassar()
    if (ativa !== eraAtiva) { eraAtiva = ativa; void (ativa ? republicarFontes() : encerrarTransmissao()); if (ativa) comecarRegistro(); else fecharRegistro() }
    conferirAnuncio()
    // 23/11/2026: fora do ar, este admin não fala com os alunos (outro pode estar transmitindo)
    if (!ativa && !eraNoArAntes) return
    eraNoArAntes = ativa
    const e = JSON.stringify(pacoteDeEstado())
    if (e !== ultimo) { ultimo = e; void enviar(JSON.parse(e)) }
    const pn = JSON.stringify(pacoteDoPainel())
    if (pn !== ultimoPainel && outrosAdministradores().length) { ultimoPainel = pn; void enviar(JSON.parse(pn), outrosAdministradores()) }
    if (ativa !== eraAtivaPalco) { eraAtivaPalco = ativa; atualizarSala() }
  })
  // de tempos em tempos, o estado completo (quem perdeu um pacote se acerta) — só no ar
  timerEstado = window.setInterval(() => {
    if (!estaNoAr()) return
    void enviar(pacoteDeEstado())
    const ids = outrosAdministradores()
    if (ids.length) void enviar(pacoteDoPainel(), ids)
  }, 3000)
}
let eraAtivaPalco = false

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
const estaNoAr = () => simulacaoLocalAtiva()

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
let ultimaEntrada: { sessao: SessaoTeeds | null; nome: string; comoCentral: boolean } | null = null
/** A Central volta para a sala depois de uma queda (o botão "Voltar à sala"). */
export function voltarATreinar(): Promise<void> | void { if (ultimaEntrada && !sala) return entrarNoTreino(ultimaEntrada.sessao, ultimaEntrada.nome, ultimaEntrada.comoCentral) }
let entrando: Promise<void> | null = null
export function entrarNoTreino(sessao: SessaoTeeds | null, nome = '', comoCentral = false): Promise<void> {
  // 24/11/2026: dois toques (ou a volta automática junto do botão) não abrem duas salas
  if (entrando) return entrando
  saiuDeProposito = false
  entrando = entrarDeVerdade(sessao, nome, comoCentral).finally(() => { entrando = null })
  return entrando
}
async function entrarDeVerdade(sessao: SessaoTeeds | null, nome: string, comoCentral: boolean): Promise<void> {
  if (sala && estado.fase !== 'erro') return
  ultimaEntrada = { sessao, nome, comoCentral }
  window.clearTimeout(timerDeVolta)
  await desconectar()
  // a Central usa o teste que ela mesma ligou; quem assiste, o do link que abriu
  testeAtual = comoCentral ? (apresentarNoTeste ? testeAtual : null) : testeDoLink()
  mudar({ ...zerado(), fase: 'conectando' })
  donoDaLive = null; donoVistoEm = 0; outroAtivo = null; ultimoDono = null; donoQueSumiu = null
  try {
    const ingresso = await pedirIngresso(sessao, nome)
    // mesmas escolhas da live: H.264 no chip de vídeo, uma camada menor só
    const r = new Room({
      adaptiveStream: true, dynacast: true,
      // 26/11/2026: a sala nunca desliga sozinha a câmera, o microfone ou a imagem das telas
      // (são do painel; ao cair e voltar, as mesmas faixas entram de novo)
      stopLocalTrackOnUnpublish: false,
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
      .on(RoomEvent.TrackPublished, atualizarSala)
      .on(RoomEvent.TrackUnpublished, atualizarSala)
      .on(RoomEvent.ParticipantDisconnected, atualizarSala)
      .on(RoomEvent.ActiveSpeakersChanged, atualizarSala)
      .on(RoomEvent.ParticipantConnected, (p: RemoteParticipant) => {
        atualizarSala()
        // quem chega no meio recebe as últimas mensagens e o estado
        if (estado.apresentador && estaNoAr()) {
          void enviar(pacoteDeEstado(), [p.identity])
          void enviar({ t: 'historico', lista: simulacaoAgora().mensagens.filter((m) => !m.membro).slice(-60) }, [p.identity])
          // outro administrador chegou: o painel e o chat inteiro, para ele ajudar a comandar
          if (ehApresentador(p)) {
            void enviar(pacoteDoPainel(), [p.identity])
            const todas = simulacaoAgora().mensagens.slice(-160)
            for (let i = 0; i < todas.length; i += 40) void enviar({ t: 'eq-msgs', lista: todas.slice(i, i + 40) }, [p.identity])
          }
        }
      })
      .on(RoomEvent.Reconnecting, () => mudar({ fase: 'reconectando' }))
      .on(RoomEvent.Reconnected, () => mudar({ fase: 'conectada' }))
      .on(RoomEvent.AudioPlaybackStatusChanged, () => mudar({ somBloqueado: !r.canPlaybackAudio }))
      .on(RoomEvent.Disconnected, (motivo?: DisconnectReason) => {
        if (sala !== r) return
        sala = null
        const transmitia = estado.apresentador
        // 06/11/2026: a Central ficava presa em "Abrindo a sala…" e a transmissão parava sem aviso.
        // 24/11/2026: quem assiste também volta sozinho (antes o player do aluno sumia no celular
        // depois de minimizar o app), e a volta tenta várias vezes, esperando mais a cada uma.
        if (motivo === DisconnectReason.CLIENT_INITIATED || saiuDeProposito) {
          marcarTreinoAtivo(false); mudar({ fase: 'fora', tela: null, camera: null, audios: [], presente: false }); return
        }
        if (motivo === DisconnectReason.DUPLICATE_IDENTITY) {
          marcarTreinoAtivo(false)
          mudar({ fase: 'erro', tela: null, camera: null, audios: [], presente: false, erro: transmitia
            ? 'A sua conta entrou na sala em outra aba ou aparelho, e a transmissão parou aqui. Para assistir ao teste, use outra conta.'
            : 'Você abriu a sala de treino em outra aba ou aparelho. Ela continua lá.' })
          return
        }
        if (tentarVoltar()) {
          // o player continua na tela (sem sumir) enquanto volta
          mudar({ fase: 'reconectando', tela: null, camera: null, audios: [], presente: false, erro: transmitia ? 'A conexão com a sala caiu. Tentando de novo…' : null })
          return
        }
        marcarTreinoAtivo(false)
        mudar({ fase: transmitia ? 'erro' : 'fora', tela: null, camera: null, audios: [], presente: false, erro: transmitia ? 'Não consegui voltar para a sala. Confira a internet e toque em Voltar à sala.' : null })
      })
      .on(RoomEvent.DataReceived, (dados: Uint8Array, p?: RemoteParticipant, _k?: unknown, topico?: string) => {
        if (topico !== TOPICO || !p) return
        let pacote: Pacote
        try { pacote = JSON.parse(new TextDecoder().decode(dados)) } catch { return }
        if (estado.apresentador) {
          // do membro: a mensagem entra no chat da simulação (e volta para todos)
          if (pacote.t === 'membro') { if (estaNoAr()) { mensagemDeMembro(p.name || 'Membro', String(pacote.texto)); if (registro.inicio) registro.mensagens++ } return }
          if (!ehApresentador(p)) return
          // de outro administrador: está no ar? (quem não comanda entra no espelho dele)
          if (pacote.t === 'estado') {
            outroAtivo = pacote.ativa ? { id: p.identity, nome: p.name || 'Outro administrador', quando: Date.now() } : (outroAtivo?.id === p.identity ? null : outroAtivo)
            // o dono encerrou de propósito: não é "caiu" (ninguém precisa assumir)
            if (!pacote.ativa && ultimoDono?.id === p.identity) ultimoDono = null
            if (pacote.ativa && espelhando()) mudar({ canto: pacote.canto, conversa: pacote.conversa !== false, fixadoParaTodos: pacote.fixado ?? null })
            atualizarSala()
            return
          }
          if (pacote.t === 'fim') { if (ultimoDono?.id === p.identity) { ultimoDono = null; outroAtivo = null; atualizarSala() } return }
          // o dono executa o comando que outro administrador deu no painel
          if (pacote.t === 'cmd' && estaNoAr()) {
            const c = pacote.c
            if (c.a === 'tela') telaPedida?.(c.id)
            else if (c.a === 'fixar') fixarParaTodos(c.chave)
            else executarComando(c)
            return
          }
          // o painel do dono no ar: entra no espelho antes de tudo (o histórico do chat vem logo atrás)
          if (pacote.t === 'painel' && pacote.s.ativa && !espelhando()) {
            outroAtivo = { id: p.identity, nome: p.name || 'Outro administrador', quando: Date.now() }
            atualizarSala()
          }
          // no espelho: o painel e o chat do dono
          if (!espelhando() || p.identity !== ultimoDono?.id) return
          if (pacote.t === 'painel') {
            outroAtivo = { id: p.identity, nome: p.name || 'Outro administrador', quando: Date.now() }
            receberEspelho(pacote.s)
            if (pacote.desde && pacote.desde !== inicioDoDono) { inicioDoDono = pacote.desde; mudar({ inicioDaLive: pacote.desde }) }
            if (pacote.programa) programaDoDono?.(pacote.programa)
          } else if (pacote.t === 'eq-msgs') {
            const atuais = simulacaoAgora().mensagens
            const ja = new Set(atuais.map((m) => m.id))
            const novas = pacote.lista.filter((m) => !ja.has(m.id))
            if (novas.length) receberEspelho({ mensagens: [...atuais, ...novas].sort((a, b) => a.hora - b.hora).slice(-300) })
          } else if (pacote.t === 'limpar') receberEspelho({ mensagens: [] })
          return
        }
        if (!ehApresentador(p)) return
        // vale só o dono da live. Quem diz que entrou no ar vira o dono, se o atual sumiu
        // (sem vídeo e sem dizer que está no ar há 10 s); assim dois no ar não ficam se alternando
        if (pacote.t === 'estado' && pacote.ativa) {
          const atual = donoDaLive ? r.remoteParticipants.get(donoDaLive) : undefined
          const atualSumiu = !atual || (!mandaVideo(atual) && Date.now() - donoVistoEm > 10_000)
          if (!donoDaLive || p.identity === donoDaLive || atualSumiu) { donoDaLive = p.identity; donoVistoEm = Date.now() }
        }
        const dono = apresentadorQueVale([...r.remoteParticipants.values()])
        if (dono && dono.identity !== p.identity) return
        if (pacote.t === 'estado') {
          canto = pacote.canto
          if (pacote.ativa && estado.encerrada) mudar({ encerrada: false })
          mudar({ canto: pacote.canto, conversa: pacote.conversa !== false, fixadoParaTodos: pacote.fixado ?? null, sim: { ativa: pacote.ativa, publico: pacote.publico, momento: pacote.momento, pausada: pacote.pausada, chatAberto: pacote.chatAberto !== false } })
          atualizarSala()
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
    if (ingresso.moderador && estaNoAr() && [...r.remoteParticipants.values()].some((p) => ehApresentador(p) && mandaVideo(p))) {
      // 23/11/2026: caiu da rede, e outro administrador assumiu a live enquanto isso
      pararSimulacaoAqui()
      mudar({ erro: 'Outro administrador assumiu a live enquanto você estava sem conexão. A sua transmissão foi encerrada.' })
    } else if (ingresso.moderador) await republicarFontes()
    atualizarSala()
    tentativas = 0
  } catch (e) {
    sala = null
    // 24/11/2026: sem internet na hora de voltar, tenta de novo sozinho (antes ficava no erro, em inglês)
    const deNovo = !saiuDeProposito && tentativas > 0 && tentarVoltar()
    mudar({ fase: deNovo ? 'reconectando' : 'erro', erro: erroLegivel(e, deNovo) })
  }
}

/** Sai da sala do LiveKit (sem mexer no que o admin tem ligado). */
async function desconectar(): Promise<void> {
  if (estado.apresentador) pararDeAnunciar()
  for (const k of Object.keys(doPalco) as Array<keyof typeof doPalco>) {
    const d = doPalco[k]
    delete doPalco[k]
    if (d && sala) await sala.localParticipant.unpublishTrack(d.local, false).catch(() => undefined)
  }
  espelharSimulacao(null)
  outroAtivo = null; ultimoDono = null; donoQueSumiu = null
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
  saiuDeProposito = true; window.clearTimeout(timerDeVolta); tentativas = 0
  const eraApresentador = estado.apresentador
  if (eraApresentador && registro.inicio) fecharRegistro()
  await desconectar()
  if (eraApresentador) pararSimulacaoAqui()
  fixadoDaEquipe = null
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
  // 06/11/2026: com as três camadas (360, 720 e 1080) o servidor recusava a imagem do estúdio ("no trackStreams
  // found for RID" e "publish time out" no LiveKit): as camadas anunciadas não batiam com as enviadas (a faixa
  // do canvas informa 0 quadros por segundo). Quem assistia via só "A transmissão começa em instantes".
  // Agora vai uma camada só, a de 1080p, como o OBS manda para a plataforma.
  if (doEstudio && qual === 'tela') Object.assign(opcoes, { simulcast: false, screenShareEncoding: { maxBitrate: 3_500_000, maxFramerate: 30 }, degradationPreference: 'balanced' })
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
  if (estado.apresentador && estaNoAr()) void enviar(pacoteDeEstado())
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
