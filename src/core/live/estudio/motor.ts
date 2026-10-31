/**
 * O motor do estúdio: desenha a cena no ar numa tela de 1920×1080, mistura
 * o som e entrega à Central duas faixas prontas (imagem e áudio finais), que
 * o botão "Começar transmissão" envia aos alunos.
 *
 * Fica no módulo, não na tela: sair da página não derruba o estúdio.
 *
 * O relógio é um Worker (e não o requestAnimationFrame): com a aba do
 * estúdio atrás de outra janela, o requestAnimationFrame para e a imagem dos
 * alunos congelaria. O Worker segue batendo 30 vezes por segundo.
 */
import { useSyncExternalStore } from 'react'
import { apagarArquivo, guardarArquivo, idsDosArquivos, lerArquivo, lerConfig, salvarConfig } from './arquivos'
import { cenasProntas } from './modelo'
import { criarMisturador, type Misturador } from './stinger'
import {
  ALTURA, CANAL_PADRAO, LARGURA, chaveDaCaptura, chaveDoAudio, novoId,
  type Canal, type Cena, type ConfigDoEstudio, type ConfigDoStinger, type EstiloDeTexto, type Fonte, type Monitoramento, type TipoDeFonte,
} from './tipos'

export type SituacaoDaCaptura = 'desligada' | 'ligando' | 'ok' | 'erro'

export interface InfoDoStinger { largura: number; altura: number; duracao: number; transparente: boolean | null }

export interface EstadoDoEstudio {
  pronto: boolean
  config: ConfigDoEstudio
  /** A fonte selecionada na cena em edição. */
  selecionada: string | null
  capturas: Record<string, SituacaoDaCaptura>
  errosDeCaptura: Record<string, string>
  /** Transição acontecendo agora (para onde vai). */
  transicao: { de: string; para: string } | null
  /** Teste do stinger rodando na prévia. */
  testando: boolean
  /** O navegador ainda não deixou tocar som (precisa de um clique). */
  somBloqueado: boolean
  stinger: { situacao: 'sem-arquivo' | 'carregando' | 'pronto' | 'erro'; info: InfoDoStinger | null; erro?: string }
  /** Muda quando um tamanho real fica conhecido (para a tela redesenhar as alças). */
  tamanhos: number
  aviso: string | null
}

let estado: EstadoDoEstudio = {
  pronto: false, config: null as unknown as ConfigDoEstudio, selecionada: null, capturas: {}, errosDeCaptura: {},
  transicao: null, testando: false, somBloqueado: false, stinger: { situacao: 'sem-arquivo', info: null }, tamanhos: 0, aviso: null,
}
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())
const mudar = (p: Partial<EstadoDoEstudio>) => { estado = { ...estado, ...p }; avisar() }
export const useEstudio = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => estado, () => estado)
export const estudioAgora = () => estado

/* ------------------------------------------------------------ guardar */

let timerSalvar: number | undefined
function mudarConfig(f: (c: ConfigDoEstudio) => ConfigDoEstudio): void {
  const nova = f(estado.config)
  if (nova === estado.config) return
  mudar({ config: nova })
  window.clearTimeout(timerSalvar)
  timerSalvar = window.setTimeout(() => { void salvarConfig(estado.config).catch(() => mudar({ aviso: 'Não consegui guardar as cenas neste computador.' })) }, 400)
  sincronizar()
}

export const cenaPorId = (id: string, c = estado.config): Cena | undefined => c.cenas.find((x) => x.id === id)
/** A cena que se edita: a da prévia no modo estúdio, a do ar fora dele. */
export const cenaEmEdicao = (c = estado.config): Cena | undefined => cenaPorId(c.modoEstudio ? c.previa : c.programa, c) ?? c.cenas[0]
const todasAsFontes = (c = estado.config) => c.cenas.flatMap((x) => x.fontes)

/* --------------------------------------------------------- as telas */

let saida: HTMLCanvasElement | null = null
let saidaCtx: CanvasRenderingContext2D | null = null
let previa: HTMLCanvasElement | null = null
let previaCtx: CanvasRenderingContext2D | null = null
let cenaA: HTMLCanvasElement | null = null
let cenaB: HTMLCanvasElement | null = null
let misturador: Misturador | null | undefined
let faixaDeVideo: MediaStreamTrack | null = null
/** Quantas telas mostram a prévia agora (só desenha a prévia se alguém olha). */
let olhandoPrevia = 0

const tela2d = (l: number, a: number) => {
  const c = document.createElement('canvas'); c.width = l; c.height = a
  return [c, c.getContext('2d', { alpha: false })!] as const
}

/** A tela do "Ao vivo": exatamente o que os alunos recebem. */
export const telaAoVivo = () => saida
/** A tela da prévia (metade do tamanho: só para olhar). */
export function telaDaPrevia(): HTMLCanvasElement | null { return previa }
export function olharPrevia(sim: boolean): void { olhandoPrevia = Math.max(0, olhandoPrevia + (sim ? 1 : -1)) }

/* ------------------------------------------------------------- o som */

let ctx: AudioContext | null = null
let paraAlunos: MediaStreamAudioDestinationNode | null = null
let fone: GainNode | null = null
interface CanalVivo { fader: GainNode; medidor: AnalyserNode; alunos: GainNode; fone: GainNode; amostra: Float32Array }
const canaisVivos = new Map<string, CanalVivo>()

function audio(): AudioContext {
  if (ctx) return ctx
  ctx = new AudioContext({ latencyHint: 'interactive', sampleRate: 48000 })
  paraAlunos = ctx.createMediaStreamDestination()
  paraAlunos.channelCount = 2
  fone = ctx.createGain()
  fone.connect(ctx.destination)
  ctx.addEventListener('statechange', () => mudar({ somBloqueado: ctx?.state !== 'running' }))
  mudar({ somBloqueado: ctx.state !== 'running' })
  return ctx
}

function canalVivo(chave: string): CanalVivo {
  let c = canaisVivos.get(chave)
  if (c) return c
  const a = audio()
  const fader = a.createGain(), medidor = a.createAnalyser(), alunos = a.createGain(), foneC = a.createGain()
  medidor.fftSize = 1024
  alunos.gain.value = 0; foneC.gain.value = 0
  fader.connect(medidor); fader.connect(alunos); fader.connect(foneC)
  alunos.connect(paraAlunos!); foneC.connect(fone!)
  c = { fader, medidor, alunos, fone: foneC, amostra: new Float32Array(medidor.fftSize) }
  canaisVivos.set(chave, c)
  return c
}

function desligarCanal(chave: string) {
  const c = canaisVivos.get(chave)
  if (!c) return
  for (const n of [c.fader, c.medidor, c.alunos, c.fone]) { try { n.disconnect() } catch { /* já solto */ } }
  canaisVivos.delete(chave)
}

/** Nível do canal agora, em dB (−60 = silêncio), já com o volume do canal. */
export function nivelDoCanal(chave: string): number {
  const c = canaisVivos.get(chave)
  if (!c) return -60
  c.medidor.getFloatTimeDomainData(c.amostra as Float32Array<ArrayBuffer>)
  let pico = 0
  for (let i = 0; i < c.amostra.length; i++) { const v = Math.abs(c.amostra[i]); if (v > pico) pico = v }
  return pico <= 0.001 ? -60 : Math.max(-60, 20 * Math.log10(pico))
}

/** Libera o som (o navegador só deixa depois de um clique). */
export async function liberarSom(): Promise<void> {
  await audio().resume().catch(() => undefined)
  mudar({ somBloqueado: audio().state !== 'running' })
}

export async function escolherSaidaDoFone(id: string): Promise<void> {
  mudarConfig((c) => ({ ...c, saidaDoFone: id }))
  const a = audio() as AudioContext & { setSinkId?: (id: string) => Promise<void> }
  await a.setSinkId?.(id).catch(() => mudar({ aviso: 'Não consegui trocar a saída do fone neste navegador.' }))
}
export const podeEscolherSaida = () => typeof (AudioContext.prototype as unknown as { setSinkId?: unknown }).setSinkId === 'function'

/* ------------------------------------------------------- as capturas */

interface Captura { stream: MediaStream; video: HTMLVideoElement | null }
const capturas = new Map<string, Captura>()
let bastidor: HTMLDivElement | null = null

/** Um cantinho fora da vista onde os vídeos ficam tocando (o navegador decodifica melhor se estão na página). */
function noBastidor(el: HTMLMediaElement) {
  if (!bastidor) {
    bastidor = document.createElement('div')
    bastidor.setAttribute('aria-hidden', 'true')
    bastidor.style.cssText = 'position:fixed;left:-4px;top:-4px;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1'
    document.body.appendChild(bastidor)
  }
  bastidor.appendChild(el)
}

function marcarCaptura(chave: string, s: SituacaoDaCaptura, erro?: string) {
  const errosDeCaptura = { ...estado.errosDeCaptura }
  if (erro) errosDeCaptura[chave] = erro; else delete errosDeCaptura[chave]
  mudar({ capturas: { ...estado.capturas, [chave]: s }, errosDeCaptura })
}

const MSG_PERMISSAO = 'O navegador não liberou. Permita a câmera, o microfone ou a tela no cadeado da barra de endereço.'

/** Liga a tela, a câmera ou o microfone de uma fonte (as cenas que usam o mesmo aparelho compartilham). */
export async function ligarCaptura(f: Fonte): Promise<void> {
  const chave = chaveDaCaptura(f)
  if (!chave || capturas.has(chave) || estado.capturas[chave] === 'ligando') return
  void liberarSom()
  marcarCaptura(chave, 'ligando')
  try {
    const md = navigator.mediaDevices
    const aparelho = (f.dispositivo ? { deviceId: { exact: f.dispositivo } } : {})
    let stream: MediaStream
    if (f.tipo === 'tela') {
      const comSom = todasAsFontes().some((x) => x.tipo === 'tela' && x.audioDaTela)
      stream = await md.getDisplayMedia({
        video: { frameRate: { ideal: 30, max: 30 }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: comSom ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false } : false,
        selfBrowserSurface: 'exclude', surfaceSwitching: 'include', systemAudio: comSom ? 'include' : 'exclude',
      } as DisplayMediaStreamOptions)
    } else if (f.tipo === 'camera') {
      stream = await md.getUserMedia({ video: { ...aparelho, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } } })
    } else {
      stream = await md.getUserMedia({ audio: { ...aparelho, echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
    }
    let video: HTMLVideoElement | null = null
    if (stream.getVideoTracks().length) {
      video = document.createElement('video')
      video.muted = true; video.playsInline = true; video.srcObject = new MediaStream(stream.getVideoTracks())
      noBastidor(video)
      video.addEventListener('loadedmetadata', () => { encaixarQuemUsa(chave); mudar({ tamanhos: estado.tamanhos + 1 }) })
      video.addEventListener('resize', () => mudar({ tamanhos: estado.tamanhos + 1 }))
      void video.play().catch(() => undefined)
    }
    const somDaCaptura = stream.getAudioTracks()
    const chaveSom = f.tipo === 'tela' ? 'tela' : f.tipo === 'microfone' ? chave : null
    if (somDaCaptura.length && chaveSom) {
      const no = audio().createMediaStreamSource(new MediaStream(somDaCaptura))
      no.connect(canalVivo(chaveSom).fader)
    }
    // parou pela barra do navegador ("Parar compartilhamento"): desliga aqui também
    stream.getTracks().forEach((t) => t.addEventListener('ended', () => { if (capturas.get(chave)?.stream === stream) desligarCaptura(chave) }))
    capturas.set(chave, { stream, video })
    marcarCaptura(chave, 'ok')
    if (f.tipo === 'tela' && todasAsFontes().some((x) => x.tipo === 'tela' && x.audioDaTela) && !somDaCaptura.length) {
      mudar({ aviso: 'A tela entrou sem o som do computador. No Mac, o Chrome só leva o som de uma aba; no Windows, marque "Compartilhar áudio do sistema".' })
    }
    sincronizar()
  } catch (e) {
    const m = e instanceof Error ? e.message : ''
    marcarCaptura(chave, 'erro', /Permission|NotAllowed|denied/i.test(m) ? MSG_PERMISSAO : /NotFound|Overconstrained/i.test(m) ? 'Não achei esse aparelho. Escolha outro nas propriedades.' : 'Não consegui ligar. Tente de novo.')
  }
}

export function desligarCaptura(chave: string): void {
  const c = capturas.get(chave)
  if (!c) return
  c.stream.getTracks().forEach((t) => t.stop())
  c.video?.remove()
  capturas.delete(chave)
  if (chave === 'tela') desligarCanal('tela')
  if (chave.startsWith('mic:')) desligarCanal(chave)
  marcarCaptura(chave, 'desligada')
}

/** Câmera e microfone já autorizados voltam sozinhos ao abrir o estúdio (a tela sempre pede um clique). */
async function religarAutorizados() {
  const pode = async (nome: 'camera' | 'microphone') => {
    try { return (await navigator.permissions.query({ name: nome as PermissionName })).state === 'granted' } catch { return false }
  }
  const [cam, mic] = await Promise.all([pode('camera'), pode('microphone')])
  const vistas = new Set<string>()
  for (const f of todasAsFontes()) {
    const chave = chaveDaCaptura(f)
    if (!chave || vistas.has(chave)) continue
    vistas.add(chave)
    if ((f.tipo === 'camera' && cam) || (f.tipo === 'microfone' && mic)) void ligarCaptura(f)
  }
}

/* --------------------------------------------- vídeos, músicas, imagens */

interface Midia { el: HTMLMediaElement; chave: string; url: string; doArquivo: boolean }
const midias = new Map<string, Midia>()
const imagens = new Map<string, { img: ImageBitmap; chave: string }>()
const carregandoImagem = new Set<string>()
const textos = new Map<string, { canvas: HTMLCanvasElement; chave: string }>()

async function urlDaFonte(f: { arquivo?: string; url?: string }): Promise<{ url: string; doArquivo: boolean } | null> {
  if (f.arquivo) {
    const a = await lerArquivo(f.arquivo).catch(() => undefined)
    return a ? { url: URL.createObjectURL(a.blob), doArquivo: true } : null
  }
  return f.url ? { url: f.url, doArquivo: false } : null
}

async function prepararMidia(f: Fonte) {
  const chave = f.arquivo ?? f.url ?? ''
  const atual = midias.get(f.id)
  if (atual && atual.chave === chave) { atual.el.loop = !!f.repetir; return }
  if (atual) descartarMidia(f.id)
  if (!chave) return
  midias.set(f.id, { el: document.createElement('audio'), chave, url: '', doArquivo: false }) // reserva (evita abrir duas vezes)
  const u = await urlDaFonte(f)
  if (!u) { midias.delete(f.id); mudar({ aviso: `O arquivo de "${f.nome}" não está neste computador. Envie de novo nas propriedades.` }); return }
  const el = document.createElement(f.tipo === 'video' ? 'video' : 'audio')
  el.preload = 'auto'; el.loop = !!f.repetir
  if (el instanceof HTMLVideoElement) el.playsInline = true
  el.src = u.url
  noBastidor(el)
  try { audio().createMediaElementSource(el).connect(canalVivo(`arq:${f.id}`).fader) } catch { /* sem som */ }
  el.addEventListener('loadedmetadata', () => { encaixarFonte(f.id); mudar({ tamanhos: estado.tamanhos + 1 }) })
  el.addEventListener('error', () => mudar({ aviso: `Não consegui abrir "${f.nomeDoArquivo ?? f.nome}". Use MP4 (H.264), WebM ou MP3.` }))
  midias.set(f.id, { el, chave, url: u.url, doArquivo: u.doArquivo })
  atualizarReproducao()
}

function descartarMidia(id: string) {
  const m = midias.get(id)
  if (!m) return
  m.el.pause(); m.el.removeAttribute('src'); m.el.load(); m.el.remove()
  if (m.doArquivo) URL.revokeObjectURL(m.url)
  midias.delete(id)
  desligarCanal(`arq:${id}`)
}

async function prepararImagem(f: Fonte) {
  const chave = f.arquivo ?? f.url ?? ''
  if (!chave || imagens.get(f.id)?.chave === chave || carregandoImagem.has(f.id)) return
  carregandoImagem.add(f.id)
  try {
    const blob = f.arquivo ? (await lerArquivo(f.arquivo))?.blob : await fetch(f.url!).then((r) => r.ok ? r.blob() : undefined)
    if (!blob) throw new Error('sem arquivo')
    const img = await createImageBitmap(blob)
    imagens.get(f.id)?.img.close()
    imagens.set(f.id, { img, chave })
    encaixarFonte(f.id)
    mudar({ tamanhos: estado.tamanhos + 1 })
  } catch {
    mudar({ aviso: `Não consegui abrir a imagem "${f.nomeDoArquivo ?? f.nome}". Use PNG, JPG ou WebP.` })
  } finally { carregandoImagem.delete(f.id) }
}

const familiaDaMarca = () => { try { return getComputedStyle(document.body).fontFamily || 'sans-serif' } catch { return 'sans-serif' } }
const familia = (t: EstiloDeTexto) => t.fonte === 'serifa' ? 'Georgia, "Times New Roman", serif' : t.fonte === 'mono' ? 'ui-monospace, Menlo, Consolas, monospace' : familiaDaMarca()

/** O texto vira uma imagem do tamanho exato das letras. */
function desenharTexto(t: EstiloDeTexto): HTMLCanvasElement {
  const css = `${t.negrito ? 700 : 400} ${t.tamanho}px ${familia(t)}`
  const linhas = (t.caixaAlta ? t.conteudo.toUpperCase() : t.conteudo).split('\n')
  const c = document.createElement('canvas')
  const x = c.getContext('2d')!
  const preparar = () => { x.font = css; (x as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${t.espacamento}px` }
  preparar()
  const larguras = linhas.map((l) => x.measureText(l).width)
  const alturaDaLinha = Math.ceil(t.tamanho * 1.22)
  const folga = Math.ceil(t.tamanho * 0.1)
  c.width = Math.max(1, Math.ceil(Math.max(0, ...larguras)) + folga * 2)
  c.height = Math.max(1, alturaDaLinha * linhas.length + folga * 2)
  preparar()
  x.fillStyle = t.cor; x.textBaseline = 'middle'
  linhas.forEach((l, i) => {
    const lx = t.alinhamento === 'centro' ? (c.width - larguras[i]) / 2 : t.alinhamento === 'direita' ? c.width - folga - larguras[i] : folga
    x.fillText(l, lx, folga + alturaDaLinha * i + alturaDaLinha / 2)
  })
  return c
}

function textoDa(f: Fonte): HTMLCanvasElement | null {
  if (!f.texto) return null
  const chave = JSON.stringify(f.texto) + familia(f.texto)
  const r = textos.get(f.id)
  if (r && r.chave === chave) return r.canvas
  const canvas = desenharTexto(f.texto)
  textos.set(f.id, { canvas, chave })
  return canvas
}

/** Depois que o texto muda, a caixa acompanha o tamanho novo das letras (mesma escala). */
function caixaDoTexto(f: Fonte, antes: { w: number; h: number } | null): Fonte {
  const c = textoDa(f)
  if (!c) return f
  const escala = antes && antes.h > 0 ? f.h / antes.h : f.h / c.height
  const w = c.width * escala, h = c.height * escala
  const x = f.texto?.alinhamento === 'centro' ? f.x + f.w / 2 - w / 2 : f.texto?.alinhamento === 'direita' ? f.x + f.w - w : f.x
  return { ...f, x, w, h }
}

/** O tamanho real da imagem de uma fonte (0 enquanto não se sabe). */
export function tamanhoNatural(f: Fonte): { w: number; h: number } {
  if (f.tipo === 'cor') return { w: f.w, h: f.h }
  const el = imagemDa(f)
  if (!el) return { w: 0, h: 0 }
  if (el instanceof HTMLVideoElement) return { w: el.videoWidth, h: el.videoHeight }
  return { w: el.width, h: el.height }
}

function imagemDa(f: Fonte): HTMLVideoElement | HTMLCanvasElement | ImageBitmap | null {
  switch (f.tipo) {
    case 'tela': case 'camera': {
      const v = capturas.get(chaveDaCaptura(f)!)?.video
      return v && v.readyState >= 2 ? v : null
    }
    case 'video': {
      const m = midias.get(f.id)?.el
      return m instanceof HTMLVideoElement && m.readyState >= 2 ? m : null
    }
    case 'imagem': return imagens.get(f.id)?.img ?? null
    case 'texto': return textoDa(f)
    default: return null
  }
}

/* ------------------------------------------------------------ encaixar */

function caixaAjustada(nw: number, nh: number, modo: 'ajustar' | 'canto' | 'esticar') {
  if (modo === 'esticar') return { x: 0, y: 0, w: LARGURA, h: ALTURA }
  if (modo === 'canto') {
    const w = 480, h = Math.round(w * nh / nw)
    return { x: LARGURA - w - 40, y: ALTURA - h - 40, w, h }
  }
  const e = Math.min(LARGURA / nw, ALTURA / nh)
  const w = Math.round(nw * e), h = Math.round(nh * e)
  return { x: Math.round((LARGURA - w) / 2), y: Math.round((ALTURA - h) / 2), w, h }
}

function encaixar(f: Fonte): Fonte {
  if (!f.encaixar) return f
  const n = tamanhoNatural(f)
  if (!n.w || !n.h) return f
  return { ...f, ...caixaAjustada(n.w, n.h, f.encaixar), recorte: { esq: 0, topo: 0, dir: 0, baixo: 0 }, encaixar: null }
}

function encaixarFonte(id: string) {
  mudarConfig((c) => {
    let mudou = false
    const cenas = c.cenas.map((cena) => ({ ...cena, fontes: cena.fontes.map((f) => { if (f.id !== id) return f; const g = encaixar(f); if (g !== f) mudou = true; return g }) }))
    return mudou ? { ...c, cenas } : c
  })
}
function encaixarQuemUsa(chave: string) {
  mudarConfig((c) => {
    let mudou = false
    const cenas = c.cenas.map((cena) => ({ ...cena, fontes: cena.fontes.map((f) => { if (chaveDaCaptura(f) !== chave) return f; const g = encaixar(f); if (g !== f) mudou = true; return g }) }))
    return mudou ? { ...c, cenas } : c
  })
}

/* ----------------------------------------------------------- desenhar */

function desenharCena(x: CanvasRenderingContext2D, cena: Cena | undefined) {
  x.fillStyle = '#000'
  x.fillRect(0, 0, LARGURA, ALTURA)
  if (!cena) return
  for (let i = cena.fontes.length - 1; i >= 0; i--) {
    const f = cena.fontes[i]
    if (!f.visivel || f.w <= 0 || f.h <= 0) continue
    if (f.tipo === 'cor') { x.fillStyle = f.cor || '#000'; x.fillRect(f.x, f.y, f.w, f.h); continue }
    const img = imagemDa(f)
    if (!img) continue
    const { w: nw, h: nh } = tamanhoNatural(f)
    const { esq, topo, dir, baixo } = f.recorte
    const sw = nw - esq - dir, sh = nh - topo - baixo
    if (sw <= 0 || sh <= 0) continue
    try {
      if (f.espelhar) {
        x.save(); x.translate(f.x + f.w, f.y); x.scale(-1, 1)
        x.drawImage(img, esq, topo, sw, sh, 0, 0, f.w, f.h)
        x.restore()
      } else x.drawImage(img, esq, topo, sw, sh, f.x, f.y, f.w, f.h)
    } catch { /* quadro ainda não pronto */ }
  }
}

/* -------------------------------------------------------- transições */

interface TransicaoViva {
  de: string; para: string; tipo: 'corte' | 'esmaecer' | 'stinger'
  inicio: number; duracao: number
  /** Só na prévia: o "Testar" do stinger (nada vai aos alunos). */
  teste: boolean
}
let transicao: TransicaoViva | null = null
let stingerEl: HTMLVideoElement | null = null
let stingerChave = ''
let stingerUrl = ''

/** Onde está a transição (0 a 1), e se a cena nova já entrou no lugar da antiga (sem máscara). */
function progresso(t: TransicaoViva, agora: number): number {
  if (t.tipo === 'stinger' && stingerEl && stingerEl.duration > 0) {
    if (stingerEl.ended) return 1
    return Math.min(1, stingerEl.currentTime / stingerEl.duration)
  }
  return t.duracao > 0 ? Math.min(1, (agora - t.inicio) / t.duracao) : 1
}

function terminarTransicao() {
  const t = transicao
  transicao = null
  stingerEl?.pause()
  if (!t) return
  if (t.teste) { mudar({ testando: false }); return }
  mudarConfig((c) => ({ ...c, programa: t.para }))
  mudar({ transicao: null })
}

/** Leva a cena para o ar, com a transição escolhida. */
export function transicionar(para?: string): void {
  const c = estado.config
  const alvo = para ?? c.previa
  if (!cenaPorId(alvo) || alvo === c.programa || (transicao && !transicao.teste)) return
  if (transicao?.teste) terminarTransicao()
  void liberarSom()
  reiniciarMidiasDa(alvo)
  const tipo = c.transicao === 'stinger' && stingerProntoParaUsar() ? 'stinger' : c.transicao === 'corte' ? 'corte' : 'esmaecer'
  if (tipo === 'corte') { mudarConfig((x) => ({ ...x, programa: alvo })); return }
  transicao = { de: c.programa, para: alvo, tipo, inicio: performance.now(), duracao: tipo === 'esmaecer' ? Math.max(50, c.duracaoMs) : 0, teste: false }
  if (tipo === 'stinger') tocarStinger();
  mudar({ transicao: { de: c.programa, para: alvo } })
  sincronizar()
}

/** "Testar transição": o stinger roda só na prévia e no fone, nunca para os alunos. */
export function testarStinger(): void {
  if (transicao || !stingerProntoParaUsar()) return
  const c = estado.config
  void liberarSom()
  const outra = c.cenas.find((x) => x.id !== c.previa)?.id ?? c.previa
  transicao = { de: c.previa, para: outra, tipo: 'stinger', inicio: performance.now(), duracao: 0, teste: true }
  tocarStinger()
  mudar({ testando: true })
}

function tocarStinger() {
  if (!stingerEl) return
  stingerEl.currentTime = 0
  void stingerEl.play().catch(() => { if (transicao?.tipo === 'stinger') { transicao.tipo = 'esmaecer'; transicao.duracao = 300; transicao.inicio = performance.now() } })
}

const stingerProntoParaUsar = () => !!stingerEl && estado.stinger.situacao === 'pronto'

async function prepararStinger(s: ConfigDoStinger) {
  const chave = s.arquivo ?? s.url ?? ''
  if (chave === stingerChave) return
  stingerChave = chave
  if (stingerEl) { stingerEl.pause(); stingerEl.remove(); stingerEl = null; desligarCanal('stinger') }
  if (stingerUrl) { URL.revokeObjectURL(stingerUrl); stingerUrl = '' }
  if (!chave) { mudar({ stinger: { situacao: 'sem-arquivo', info: null } }); return }
  mudar({ stinger: { situacao: 'carregando', info: null } })
  const u = await urlDaFonte(s)
  if (chave !== stingerChave) return
  if (!u) { mudar({ stinger: { situacao: 'erro', info: null, erro: 'O arquivo do stinger não está neste computador. Envie de novo.' } }); return }
  if (u.doArquivo) stingerUrl = u.url
  const el = document.createElement('video')
  el.preload = 'auto'; el.playsInline = true; el.src = u.url
  noBastidor(el)
  try { audio().createMediaElementSource(el).connect(canalVivo('stinger').fader) } catch { /* sem som */ }
  el.addEventListener('ended', () => { if (transicao?.tipo === 'stinger') terminarTransicao() })
  el.addEventListener('error', () => mudar({ stinger: { situacao: 'erro', info: null, erro: 'Este formato não abre no navegador. Use WebM (VP9, com transparência) ou MP4 (H.264).' } }))
  el.addEventListener('loadeddata', () => {
    const info: InfoDoStinger = { largura: el.videoWidth, altura: el.videoHeight, duracao: el.duration, transparente: null }
    mudar({ stinger: { situacao: 'pronto', info } })
    // tem transparência? Olha um quadro perto do começo, na metade do stinger
    const olhar = () => {
      el.removeEventListener('seeked', olhar)
      try {
        const cv = document.createElement('canvas')
        cv.width = 64; cv.height = 36
        const g = cv.getContext('2d', { willReadFrequently: true })!
        const lado = estado.config.stinger.layout === 'lado-a-lado' ? 2 : 1
        const pilha = estado.config.stinger.layout === 'empilhado' ? 2 : 1
        g.clearRect(0, 0, 64, 36)
        g.drawImage(el, 0, 0, el.videoWidth / lado, el.videoHeight / pilha, 0, 0, 64, 36)
        const d = g.getImageData(0, 0, 64, 36).data
        let transparente = false
        for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { transparente = true; break }
        if (estado.stinger.info) mudar({ stinger: { situacao: 'pronto', info: { ...estado.stinger.info, transparente } } })
      } catch { /* sem leitura */ }
      el.currentTime = 0
    }
    el.addEventListener('seeked', olhar)
    el.currentTime = Math.min(el.duration * 0.05, 0.1)
  }, { once: true })
  stingerEl = el
}

/* -------------------------------------------------------- reprodução */

/** Vídeos e músicas tocam só nas cenas no ar, na prévia e na que está entrando. */
function cenasAtivas(): Set<string> {
  const c = estado.config
  const s = new Set<string>([c.programa])
  if (c.modoEstudio) s.add(c.previa)
  if (transicao) { s.add(transicao.de); s.add(transicao.para) }
  return s
}

function atualizarReproducao() {
  const ativas = cenasAtivas()
  const tocando = new Set<string>()
  for (const cena of estado.config.cenas) {
    if (!ativas.has(cena.id)) continue
    for (const f of cena.fontes) if ((f.tipo === 'video' || f.tipo === 'musica') && f.visivel) tocando.add(f.id)
  }
  for (const [id, m] of midias) {
    if (!m.url) continue
    if (tocando.has(id)) { if (m.el.paused && !(m.el.ended && !m.el.loop)) void m.el.play().catch(() => undefined) }
    else if (!m.el.paused) m.el.pause()
  }
}

function reiniciarMidiasDa(cenaId: string) {
  for (const f of cenaPorId(cenaId)?.fontes ?? []) {
    if (!f.reiniciar) continue
    const m = midias.get(f.id)
    if (m?.url) { m.el.currentTime = 0; void m.el.play().catch(() => undefined) }
  }
}

/* --------------------------------------------------------- o som, ao vivo */

const audiosDa = (cenaId: string | undefined) => {
  const s = new Set<string>()
  for (const f of (cenaId ? cenaPorId(cenaId)?.fontes : undefined) ?? []) { const k = chaveDoAudio(f); if (k && f.visivel) s.add(k) }
  return s
}

const configDoCanal = (chave: string): Canal => estado.config.canais[chave] ?? (chave.startsWith('arq:') ? { ...CANAL_PADRAO, monitor: 'ambos' } : CANAL_PADRAO)

function atualizarSom(agora: number) {
  if (!ctx) return
  const c = estado.config
  const t = transicao && !transicao.teste ? transicao : null
  const noAr = audiosDa(t ? t.de : c.programa)
  const entrando = t ? audiosDa(t.para) : new Set<string>()
  const naPrevia = c.modoEstudio && c.ouvirPrevia ? audiosDa(c.previa) : new Set<string>()
  let p = 0, tp = 0.5
  if (t) {
    p = progresso(t, agora)
    const dur = t.tipo === 'stinger' && stingerEl ? stingerEl.duration * 1000 : t.duracao
    tp = t.tipo === 'stinger' && dur > 0 ? Math.min(0.999, Math.max(0.001, c.stinger.pontoMs / dur)) : 0.5
  }
  const cruzado = !t || t.tipo !== 'stinger' || c.stinger.fadeAudio === 'cruzado'
  const quando = ctx.currentTime
  for (const [chave, vivo] of canaisVivos) {
    if (chave === 'stinger') {
      const s = c.stinger
      vivo.fader.gain.setTargetAtTime(s.mudo ? 0 : s.volume, quando, 0.01)
      const teste = !!transicao?.teste
      vivo.alunos.gain.setTargetAtTime(!teste && s.monitor !== 'fone' ? 1 : 0, quando, 0.01)
      vivo.fone.gain.setTargetAtTime(teste || s.monitor !== 'alunos' ? 1 : 0, quando, 0.01)
      continue
    }
    const cfg = configDoCanal(chave)
    let f: number
    const a = noAr.has(chave), b = entrando.has(chave)
    if (!t) f = a ? 1 : 0
    else if (a && b) f = 1 // o mesmo microfone nas duas cenas: a voz não dobra nem some
    else if (a) f = cruzado ? 1 - p : p < tp ? 1 - p / tp : 0
    else if (b) f = cruzado ? p : p < tp ? 0 : (p - tp) / (1 - tp)
    else f = 0
    const previaSo = !a && !b && naPrevia.has(chave) ? 1 : 0
    vivo.fader.gain.setTargetAtTime(cfg.mudo ? 0 : cfg.volume, quando, 0.01)
    vivo.alunos.gain.setTargetAtTime(cfg.monitor !== 'fone' ? f : 0, quando, 0.015)
    vivo.fone.gain.setTargetAtTime(Math.max(cfg.monitor !== 'alunos' ? f : 0, previaSo), quando, 0.015)
  }
}

/* -------------------------------------------------------------- o relógio */

let relogio: Worker | null = null
let batidas = 0

function bater() {
  const agora = performance.now()
  const c = estado.config
  if (!saidaCtx || !c) return
  if (transicao && (progresso(transicao, agora) >= 1 || agora - transicao.inicio > (transicao.tipo === 'stinger' ? ((stingerEl?.duration || 3) * 1000 + 1500) : transicao.duracao + 500))) terminarTransicao()
  const t = transicao
  // a saída (os alunos)
  if (t && !t.teste) misturar(t, agora, saidaCtx)
  else desenharCena(saidaCtx, cenaPorId(c.programa))
  ;(faixaDeVideo as (MediaStreamTrack & { requestFrame?: () => void }) | null)?.requestFrame?.()
  // a prévia (só se alguém está olhando)
  if (previaCtx && olhandoPrevia > 0 && c.modoEstudio) {
    previaCtx.setTransform(0.5, 0, 0, 0.5, 0, 0)
    if (t?.teste) misturar(t, agora, previaCtx)
    else desenharCena(previaCtx, cenaPorId(c.previa))
    previaCtx.setTransform(1, 0, 0, 1, 0, 0)
  }
  atualizarSom(agora)
  if (++batidas % 15 === 0) atualizarReproducao()
}

function misturar(t: TransicaoViva, agora: number, alvo: CanvasRenderingContext2D) {
  if (!cenaA) { [cenaA] = tela2d(LARGURA, ALTURA); [cenaB] = tela2d(LARGURA, ALTURA) }
  const xa = cenaA!.getContext('2d')!, xb = cenaB!.getContext('2d')!
  const p = progresso(t, agora)
  if (t.tipo === 'esmaecer') {
    desenharCena(alvo, cenaPorId(t.de))
    desenharCena(xb, cenaPorId(t.para))
    alvo.globalAlpha = p; alvo.drawImage(cenaB!, 0, 0); alvo.globalAlpha = 1
    return
  }
  if (misturador === undefined) misturador = criarMisturador(LARGURA, ALTURA)
  const s = estado.config.stinger
  const el = stingerEl
  if (!misturador || !el || el.readyState < 2) { desenharCena(alvo, cenaPorId(p < 0.5 ? t.de : t.para)); return }
  desenharCena(xa, cenaPorId(t.de))
  desenharCena(xb, cenaPorId(t.para))
  const corte = el.currentTime * 1000 >= s.pontoMs ? 1 : 0
  if (misturador.desenhar(cenaA!, cenaB!, el, s.layout, s.inverter, corte)) alvo.drawImage(misturador.canvas, 0, 0)
  else desenharCena(alvo, cenaPorId(corte ? t.para : t.de))
}

function ligarRelogio() {
  if (relogio) return
  const codigo = 'let t=0;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}'
  relogio = new Worker(URL.createObjectURL(new Blob([codigo], { type: 'text/javascript' })))
  relogio.onmessage = bater
  relogio.postMessage(1000 / 30)
}

/** Toda mudança de cena ou fonte passa por aqui: prepara o que faltar e solta o que sobrou. */
function sincronizar() {
  const c = estado.config
  if (!c || !estado.pronto) return
  const vivas = new Set<string>()
  for (const f of todasAsFontes(c)) {
    vivas.add(f.id)
    if (f.tipo === 'video' || f.tipo === 'musica') void prepararMidia(f)
    else if (f.tipo === 'imagem') void prepararImagem(f)
  }
  for (const id of [...midias.keys()]) if (!vivas.has(id)) descartarMidia(id)
  for (const [id, i] of [...imagens]) if (!vivas.has(id)) { i.img.close(); imagens.delete(id) }
  for (const id of [...textos.keys()]) if (!vivas.has(id)) textos.delete(id)
  // capturas que nenhuma cena usa mais: desliga
  const usadas = new Set(todasAsFontes(c).map(chaveDaCaptura).filter(Boolean) as string[])
  for (const chave of [...capturas.keys()]) if (!usadas.has(chave)) desligarCaptura(chave)
  // canais: os de áudio em uso; o resto sai
  const somEmUso = new Set(todasAsFontes(c).map(chaveDoAudio).filter(Boolean) as string[])
  for (const chave of [...canaisVivos.keys()]) {
    if (chave === 'stinger' || chave.startsWith('arq:')) continue
    if (!somEmUso.has(chave) && !capturas.has(chave)) desligarCanal(chave)
  }
  void prepararStinger(c.stinger)
  atualizarReproducao()
}

/* -------------------------------------------------------------- começar */

let iniciando: Promise<void> | null = null

/** Abre o estúdio (uma vez): lê as cenas guardadas ou monta as prontas. */
export function iniciarEstudio(): Promise<void> {
  iniciando ??= (async () => {
    let config = await lerConfig()
    if (!config || config.versao !== 1 || !config.cenas?.length) { config = cenasProntas(); void salvarConfig(config).catch(() => undefined) }
    ;[saida, saidaCtx] = tela2d(LARGURA, ALTURA)
    ;[previa, previaCtx] = tela2d(LARGURA / 2, ALTURA / 2)
    saida.className = 'es-tela'; previa.className = 'es-tela'
    const fluxo = (saida as HTMLCanvasElement & { captureStream(f?: number): MediaStream }).captureStream(0)
    faixaDeVideo = fluxo.getVideoTracks()[0]
    audio()
    mudar({ config, pronto: true })
    if (config.saidaDoFone) void escolherSaidaDoFone(config.saidaDoFone)
    // textos com a fonte da marca já carregada (senão saem na fonte do sistema)
    void document.fonts?.ready.then(() => {
      textos.clear()
      mudarConfig((c) => ({ ...c, cenas: c.cenas.map((cena) => ({ ...cena, fontes: cena.fontes.map((f) => f.tipo === 'texto' ? caixaDoTexto(f, null) : f) })) }))
    })
    sincronizar()
    ligarRelogio()
    void religarAutorizados()
    void limparArquivosSoltos()
  })()
  return iniciando
}

/** As duas faixas finais: o que o botão "Começar transmissão" manda aos alunos. */
export function saidaDoEstudio(): { video: MediaStreamTrack; audio: MediaStreamTrack } | null {
  if (!faixaDeVideo || !paraAlunos) return null
  return { video: faixaDeVideo, audio: paraAlunos.stream.getAudioTracks()[0] }
}

/** Arquivos guardados que nenhuma cena (nem o stinger) usa mais. */
async function limparArquivosSoltos() {
  const usados = new Set([...todasAsFontes().map((f) => f.arquivo), estado.config.stinger.arquivo].filter(Boolean) as string[])
  for (const id of await idsDosArquivos()) if (!usados.has(id)) void apagarArquivo(id)
}

/* ============================================================ edição */

export function fecharAviso(): void { mudar({ aviso: null }) }
export function selecionar(id: string | null): void { mudar({ selecionada: id }) }

/* ---------------------------------------------------------------- cenas */

/** Clicar numa cena: no modo estúdio vai para a prévia; fora dele, vai ao ar. */
export function escolherCena(id: string): void {
  if (estado.config.modoEstudio) { mudarConfig((c) => ({ ...c, previa: id })); mudar({ selecionada: null }); return }
  mudar({ selecionada: null })
  transicionar(id)
}

export function criarCena(nome: string): void {
  const cena: Cena = { id: novoId(), nome: nome.trim() || `Cena ${estado.config.cenas.length + 1}`, fontes: [] }
  mudarConfig((c) => ({ ...c, cenas: [...c.cenas, cena], previa: c.modoEstudio ? cena.id : c.previa }))
  if (!estado.config.modoEstudio) transicionar(cena.id)
}

export function renomearCena(id: string, nome: string): void {
  const n = nome.trim()
  if (!n) return
  mudarConfig((c) => ({ ...c, cenas: c.cenas.map((x) => (x.id === id ? { ...x, nome: n.slice(0, 40) } : x)) }))
}

export function duplicarCena(id: string): void {
  const original = cenaPorId(id)
  if (!original) return
  const canais: Record<string, Canal> = {}
  const fontes = original.fontes.map((f) => {
    const nova = { ...f, id: novoId(), recorte: { ...f.recorte }, texto: f.texto ? { ...f.texto } : undefined }
    const cfg = estado.config.canais[`arq:${f.id}`]
    if (cfg) canais[`arq:${nova.id}`] = { ...cfg }
    return nova
  })
  const copia: Cena = { id: novoId(), nome: `${original.nome} (cópia)`.slice(0, 40), fontes }
  mudarConfig((c) => {
    const i = c.cenas.findIndex((x) => x.id === id)
    const cenas = [...c.cenas]; cenas.splice(i + 1, 0, copia)
    return { ...c, cenas, canais: { ...c.canais, ...canais } }
  })
}

export function apagarCena(id: string): boolean {
  const c = estado.config
  if (c.cenas.length <= 1 || id === c.programa) return false
  const sobra = c.cenas.filter((x) => x.id !== id)
  mudarConfig((x) => ({ ...x, cenas: sobra, previa: x.previa === id ? (sobra.find((s) => s.id !== x.programa) ?? sobra[0]).id : x.previa }))
  void limparArquivosSoltos()
  return true
}

export function moverCena(id: string, passo: -1 | 1): void {
  mudarConfig((c) => {
    const i = c.cenas.findIndex((x) => x.id === id), j = i + passo
    if (i < 0 || j < 0 || j >= c.cenas.length) return c
    const cenas = [...c.cenas];[cenas[i], cenas[j]] = [cenas[j], cenas[i]]
    return { ...c, cenas }
  })
}

export function ligarModoEstudio(sim: boolean): void {
  mudarConfig((c) => ({ ...c, modoEstudio: sim, previa: sim && c.previa === c.programa ? (c.cenas.find((x) => x.id !== c.programa)?.id ?? c.previa) : c.previa }))
  mudar({ selecionada: null })
}

export function mudarTransicao(p: Partial<Pick<ConfigDoEstudio, 'transicao' | 'duracaoMs' | 'ouvirPrevia'>>): void {
  mudarConfig((c) => ({ ...c, ...p }))
}

/* --------------------------------------------------------------- fontes */

function naCenaEmEdicao(f: (fontes: Fonte[]) => Fonte[]) {
  const alvo = cenaEmEdicao()
  if (!alvo) return
  mudarConfig((c) => ({ ...c, cenas: c.cenas.map((x) => (x.id === alvo.id ? { ...x, fontes: f(x.fontes) } : x)) }))
}

const MIDIA_ACEITA: Partial<Record<TipoDeFonte, RegExp>> = { video: /^video\//, musica: /^audio\//, imagem: /^image\// }

/** Guarda um arquivo enviado neste computador e devolve o id. */
export async function enviarArquivo(arquivo: File): Promise<string> {
  const id = novoId()
  await guardarArquivo(id, { nome: arquivo.name, tipo: arquivo.type, blob: arquivo })
  return id
}

export async function adicionarFonte(tipo: TipoDeFonte, extra: Partial<Fonte> = {}, arquivo?: File): Promise<string | null> {
  const cena = cenaEmEdicao()
  if (!cena) return null
  if (arquivo && MIDIA_ACEITA[tipo] && !MIDIA_ACEITA[tipo]!.test(arquivo.type)) {
    mudar({ aviso: tipo === 'video' ? 'Escolha um arquivo de vídeo (MP4 ou WebM).' : tipo === 'musica' ? 'Escolha um arquivo de áudio (MP3, M4A ou WAV).' : 'Escolha uma imagem (PNG, JPG ou WebP).' })
    return null
  }
  const doArquivo = arquivo ? { arquivo: await enviarArquivo(arquivo), nomeDoArquivo: arquivo.name } : {}
  const iguais = cena.fontes.filter((f) => f.tipo === tipo).length
  const base: Record<TipoDeFonte, string> = { tela: 'Tela', camera: 'Câmera', microfone: 'Microfone', video: 'Vídeo', musica: 'Música', imagem: 'Imagem', texto: 'Texto', cor: 'Cor' }
  const nome = arquivo ? arquivo.name.replace(/\.[^.]+$/, '').slice(0, 40) : `${base[tipo]}${iguais ? ` ${iguais + 1}` : ''}`
  let f: Fonte = {
    id: novoId(), tipo, nome, visivel: true, bloqueada: false, x: 0, y: 0, w: LARGURA, h: ALTURA,
    recorte: { esq: 0, topo: 0, dir: 0, baixo: 0 },
    encaixar: tipo === 'camera' && cena.fontes.some((x) => x.tipo === 'tela') ? 'canto' : ['tela', 'camera', 'video', 'imagem'].includes(tipo) ? 'ajustar' : null,
    ...(tipo === 'video' || tipo === 'musica' ? { repetir: tipo === 'musica', reiniciar: tipo === 'video' } : {}),
    ...(tipo === 'texto' ? { texto: { conteudo: 'Seu texto', tamanho: 96, cor: '#ffffff', negrito: true, fonte: 'marca' as const, alinhamento: 'centro' as const, espacamento: 0, caixaAlta: false } } : {}),
    ...(tipo === 'cor' ? { cor: '#05080f' } : {}),
    ...(tipo === 'camera' || tipo === 'microfone' ? { dispositivo: '' } : {}),
    ...doArquivo, ...extra,
  }
  if (tipo === 'texto') { f = { ...f, w: 600, h: 120 }; f = caixaDoTexto(f, null); f = { ...f, x: (LARGURA - f.w) / 2, y: (ALTURA - f.h) / 2 } }
  // a cor de fundo entra por baixo de tudo; o resto, por cima
  naCenaEmEdicao((fontes) => (tipo === 'cor' ? [...fontes, f] : [f, ...fontes]))
  if (tipo === 'video' || tipo === 'musica') mudarConfig((c) => ({ ...c, canais: { ...c.canais, [`arq:${f.id}`]: { ...CANAL_PADRAO, monitor: 'ambos' } } }))
  if (tipo === 'microfone' && !estado.config.canais[chaveDoAudio(f)!]) mudarConfig((c) => ({ ...c, canais: { ...c.canais, [chaveDoAudio(f)!]: { ...CANAL_PADRAO } } }))
  mudar({ selecionada: f.id })
  if (tipo === 'camera' || tipo === 'microfone' || tipo === 'tela') void ligarCaptura(f)
  return f.id
}

export function apagarFonte(id: string): void {
  naCenaEmEdicao((fontes) => fontes.filter((f) => f.id !== id))
  if (estado.selecionada === id) mudar({ selecionada: null })
  void limparArquivosSoltos()
}

/** Muda uma fonte (em qualquer cena). Texto novo: a caixa acompanha o tamanho das letras. */
export function atualizarFonte(id: string, p: Partial<Fonte>): void {
  mudarConfig((c) => ({
    ...c,
    cenas: c.cenas.map((cena) => ({
      ...cena,
      fontes: cena.fontes.map((f) => {
        if (f.id !== id) return f
        if (p.texto && f.texto) {
          const antes = textoDa(f)
          const medidas = antes ? { w: antes.width, h: antes.height } : null
          return caixaDoTexto({ ...f, ...p, texto: { ...f.texto, ...p.texto } }, medidas)
        }
        return { ...f, ...p }
      }),
    })),
  }))
}

/** Troca o aparelho (câmera/microfone) de uma fonte: a captura antiga sai se ninguém mais usa. */
export function trocarAparelho(f: Fonte, dispositivo: string): void {
  const nova = { ...f, dispositivo }
  atualizarFonte(f.id, { dispositivo })
  if (f.tipo === 'microfone') {
    const de = chaveDoAudio(f)!, para = chaveDoAudio(nova)!
    if (!estado.config.canais[para]) mudarConfig((c) => ({ ...c, canais: { ...c.canais, [para]: { ...(c.canais[de] ?? CANAL_PADRAO) } } }))
  }
  void ligarCaptura(nova)
}

export async function trocarArquivo(f: Fonte, arquivo: File): Promise<void> {
  if (MIDIA_ACEITA[f.tipo] && !MIDIA_ACEITA[f.tipo]!.test(arquivo.type)) { mudar({ aviso: 'Esse arquivo não combina com esta fonte.' }); return }
  const id = await enviarArquivo(arquivo)
  atualizarFonte(f.id, { arquivo: id, url: undefined, nomeDoArquivo: arquivo.name, encaixar: f.tipo === 'imagem' || f.tipo === 'video' ? 'ajustar' : null })
  void limparArquivosSoltos()
}

/** Muda a ordem das camadas na cena em edição. */
export function moverFonte(id: string, para: 'cima' | 'baixo' | 'topo' | 'fundo'): void {
  naCenaEmEdicao((fontes) => {
    const i = fontes.findIndex((f) => f.id === id)
    if (i < 0) return fontes
    const lista = [...fontes]
    const [f] = lista.splice(i, 1)
    const j = para === 'topo' ? 0 : para === 'fundo' ? lista.length : para === 'cima' ? Math.max(0, i - 1) : Math.min(lista.length, i + 1)
    lista.splice(j, 0, f)
    return lista
  })
}

/** Os atalhos de "Transformar" do OBS. */
export function transformar(id: string, como: 'ajustar' | 'esticar' | 'centralizar' | 'original' | 'espelhar' | 'sem-recorte'): void {
  const f = todasAsFontes().find((x) => x.id === id)
  if (!f) return
  if (como === 'espelhar') { atualizarFonte(id, { espelhar: !f.espelhar }); return }
  if (como === 'centralizar') { atualizarFonte(id, { x: Math.round((LARGURA - f.w) / 2), y: Math.round((ALTURA - f.h) / 2) }); return }
  const n = tamanhoNatural(f)
  if (f.tipo === 'cor') { atualizarFonte(id, { x: 0, y: 0, w: LARGURA, h: ALTURA }); return }
  if (!n.w || !n.h) return
  if (como === 'sem-recorte') {
    const ex = f.w / Math.max(1, n.w - f.recorte.esq - f.recorte.dir), ey = f.h / Math.max(1, n.h - f.recorte.topo - f.recorte.baixo)
    atualizarFonte(id, { recorte: { esq: 0, topo: 0, dir: 0, baixo: 0 }, x: f.x - f.recorte.esq * ex, y: f.y - f.recorte.topo * ey, w: n.w * ex, h: n.h * ey })
    return
  }
  const cw = n.w - f.recorte.esq - f.recorte.dir, ch = n.h - f.recorte.topo - f.recorte.baixo
  if (como === 'original') { atualizarFonte(id, { w: cw, h: ch }); return }
  atualizarFonte(id, caixaAjustada(cw, ch, como === 'esticar' ? 'esticar' : 'ajustar'))
}

/* ----------------------------------------------------------------- mixer */

export function ajustarCanal(chave: string, p: Partial<Canal>): void {
  mudarConfig((c) => ({ ...c, canais: { ...c.canais, [chave]: { ...configDoCanal(chave), ...p } } }))
}
export const canalDe = configDoCanal

export interface LinhaDoMixer { chave: string; nome: string; tipo: TipoDeFonte | 'stinger'; noAr: boolean; ligado: boolean }

/** Os canais do mixer: um por microfone (mesmo usado em várias cenas), tela com som, cada vídeo e música, e o stinger. */
export function canaisDoMixer(c = estado.config): LinhaDoMixer[] {
  const linhas = new Map<string, LinhaDoMixer>()
  const noAr = audiosDa(c.programa)
  for (const cena of c.cenas) {
    for (const f of cena.fontes) {
      const k = chaveDoAudio(f)
      if (!k || linhas.has(k)) continue
      linhas.set(k, { chave: k, nome: k === 'tela' ? 'Som da tela' : f.nome, tipo: f.tipo, noAr: noAr.has(k), ligado: f.tipo === 'microfone' || k === 'tela' ? estado.capturas[chaveDaCaptura(f)!] === 'ok' : true })
    }
  }
  const lista = [...linhas.values()].sort((a, b) => (a.tipo === 'microfone' ? -1 : 0) - (b.tipo === 'microfone' ? -1 : 0))
  if (c.stinger.arquivo || c.stinger.url) lista.push({ chave: 'stinger', nome: 'Stinger', tipo: 'stinger', noAr: false, ligado: true })
  return lista
}

/* ---------------------------------------------------------------- stinger */

export function ajustarStinger(p: Partial<ConfigDoStinger>): void {
  mudarConfig((c) => ({ ...c, stinger: { ...c.stinger, ...p } }))
}

export async function enviarStinger(arquivo: File): Promise<void> {
  if (!/^video\//.test(arquivo.type) && !/\.(webm|mp4|mov|m4v)$/i.test(arquivo.name)) { mudar({ aviso: 'O stinger precisa ser um vídeo (WebM ou MP4).' }); return }
  const id = await enviarArquivo(arquivo)
  mudarConfig((c) => ({ ...c, transicao: 'stinger', stinger: { ...c.stinger, arquivo: id, url: undefined, nomeDoArquivo: arquivo.name } }))
  void limparArquivosSoltos()
}

export function tirarStinger(): void {
  mudarConfig((c) => ({ ...c, transicao: c.transicao === 'stinger' ? 'esmaecer' : c.transicao, stinger: { ...c.stinger, arquivo: undefined, url: undefined, nomeDoArquivo: undefined } }))
  void limparArquivosSoltos()
}

/* ----------------------------------------------------- monitor flutuante */

let monitorEl: HTMLVideoElement | null = null
/**
 * O "Ao vivo" numa janelinha por cima de tudo (picture-in-picture): quem
 * opera em outra janela continua vendo o que os alunos recebem, e o
 * navegador não economiza a aba do estúdio.
 */
export async function abrirMonitorFlutuante(): Promise<boolean> {
  if (!faixaDeVideo || !document.pictureInPictureEnabled) return false
  if (!monitorEl) {
    monitorEl = document.createElement('video')
    monitorEl.muted = true; monitorEl.playsInline = true
    monitorEl.srcObject = new MediaStream([faixaDeVideo])
    noBastidor(monitorEl)
  }
  try {
    await monitorEl.play()
    await monitorEl.requestPictureInPicture()
    return true
  } catch { return false }
}

/* ------------------------------------------------------------- aparelhos */

export async function listarAparelhos(tipo: MediaDeviceKind): Promise<MediaDeviceInfo[]> {
  try { return (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === tipo && d.deviceId !== 'default' && d.deviceId !== 'communications') } catch { return [] }
}

export type { Monitoramento }
