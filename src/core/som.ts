import { useSyncExternalStore } from 'react'
import { MARCA } from '../marca'

/**
 * Os sons das operações. Desde 23/10/2026 (Tiago, depois de pedir várias
 * vezes) são TRÊS momentos, e não um som a cada micro-operação do robô:
 *  - play: quando o robô liga (um toque curto subindo, de "decolou");
 *  - ganho: quando a sessão do robô bate a meta (o "cha-ching");
 *  - perda: quando a sessão bate o stop (duas notas graves descendo).
 * As entradas que o robô faz no meio do caminho ficam em silêncio. A
 * operação manual continua com o som do resultado de cada entrada: ali cada
 * entrada é uma decisão da pessoa, não uma rajada do robô.
 *
 * Sem arquivo de áudio: o som é sintetizado na hora (Web Audio), então não
 * pesa nada e não depende de rede. O "cha" do ganho é o estalo da gaveta (um
 * chiado curto e um baque grave) e o "ching" são duas batidas de sino
 * metálico, com parciais fora da série harmônica e um leve batimento entre
 * pares desafinados, que dá o brilho de moeda.
 *
 * Regras:
 *  - fim de sessão toca uma vez por sessão, e só se esta tela viu a sessão
 *    rodando (abrir a plataforma não toca o que já tinha acabado);
 *  - manual: uma vez por contrato, só o que foi comprado nesta tela;
 *  - vários resultados no mesmo instante viram um som só;
 *  - celular: o navegador só libera áudio depois do primeiro toque na tela;
 *    o iPhone respeita a chave do silencioso;
 *  - dá para desligar (menu do usuário); a escolha fica no aparelho.
 */

const CHAVE = `${MARCA.id}.somDasOperacoes`
const ler = () => { try { return localStorage.getItem(CHAVE) !== '0' } catch { return true } }
let ligado = ler()
const ouvintes = new Set<() => void>()

export function alternarSom(): void {
  ligado = !ligado
  try { localStorage.setItem(CHAVE, ligado ? '1' : '0') } catch { /* só nesta aba */ }
  ouvintes.forEach((f) => f())
  if (ligado) tocarSom('ganho', true)
}
export function useSomLigado(): boolean {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => ligado, () => true)
}

// ------------------------------------------------------------------ o áudio
let ctx: AudioContext | null = null
function contexto(): AudioContext | null {
  if (ctx) return ctx
  const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!C) return null
  try { ctx = new C() } catch { ctx = null }
  return ctx
}

/** O celular só libera o áudio dentro de um toque: o primeiro toque destrava (um silêncio de 1 amostra). */
function destravar() {
  const c = contexto()
  if (!c) return
  if (c.state !== 'running') void c.resume().catch(() => undefined)
  try {
    const b = c.createBuffer(1, 1, 22050)
    const s = c.createBufferSource()
    s.buffer = b; s.connect(c.destination); s.start(0)
  } catch { /* sem áudio, sem problema */ }
}
if (typeof window !== 'undefined') {
  const uma = () => destravar()
  for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, uma, { passive: true })
}

export type Som = 'ganho' | 'perda' | 'play'
const SINTESE: Record<Som, (c: BaseAudioContext, destino: AudioNode, t: number) => void> = {
  ganho: (c, d, t) => chaChing(c, d, t),
  perda: (c, d, t) => somDePerda(c, d, t),
  play: (c, d, t) => somDoPlay(c, d, t),
}
const ultimaVez: Record<string, number> = {}
/** Toca um som. `forcar` ignora o intervalo mínimo (o teste ao ligar o som). */
export function tocarSom(som: Som, forcar = false): void {
  if (!ligado || document.visibilityState === 'hidden') return
  // ganho e perda dividem o intervalo: resultados juntos viram um som só
  const grupo = som === 'play' ? 'play' : 'resultado'
  const agora = performance.now()
  if (!forcar && agora - (ultimaVez[grupo] ?? -1e9) < 350) return
  ultimaVez[grupo] = agora
  const c = contexto()
  if (!c) return
  if (c.state !== 'running') void c.resume().catch(() => undefined)
  SINTESE[som](c, c.destination, c.currentTime + 0.01)
}

/**
 * A saída de cada som: um ganho só. Sem compressor: o do navegador (joelho
 * largo e ganho de compensação automático) achatava a primeira nota de
 * cada som e inflava a segunda. Os volumes abaixo foram medidos para o pico
 * ficar perto de 0,7, alto no celular sem estourar no fone.
 */
function saidaDoSom(c: BaseAudioContext, destino: AudioNode, volume: number): GainNode {
  const saida = c.createGain()
  saida.gain.value = volume
  saida.connect(destino)
  return saida
}
function envelope(g: GainNode, inicio: number, pico: number, ataque: number, queda: number) {
  g.gain.setValueAtTime(0.0001, inicio)
  g.gain.exponentialRampToValueAtTime(pico, inicio + ataque)
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + ataque + queda)
}

let ruido: AudioBuffer | null = null
/** Um segundo de chiado branco, criado uma vez por contexto. */
function chiado(c: BaseAudioContext): AudioBuffer {
  if (ruido && ruido.sampleRate === c.sampleRate) return ruido
  const b = c.createBuffer(1, c.sampleRate, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  ruido = b
  return b
}

/** O cha-ching em si; separado para dar para gravar num OfflineAudioContext. */
export function chaChing(c: BaseAudioContext, destino: AudioNode, t: number): void {
  const saida = saidaDoSom(c, destino, 0.95)
  const chiar = (inicio: number, freq: number, q: number, pico: number, queda: number) => {
    const s = c.createBufferSource(); s.buffer = chiado(c)
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q
    const g = c.createGain(); envelope(g, inicio, pico, 0.003, queda)
    s.connect(f); f.connect(g); g.connect(saida)
    s.start(inicio, Math.random() * 0.5); s.stop(inicio + queda + 0.05)
  }
  /** Uma batida de sino: parciais de metal (razões fora da série harmônica), cada uma em par levemente desafinado. */
  const sino = (inicio: number, base: number, vol: number, sustento: number) => {
    const parciais: [number, number, number][] = [
      // razão, volume, quanto dura (fração do sustento): as agudas morrem antes
      [1, 1, 1], [2.32, 0.55, 0.7], [3.17, 0.42, 0.55], [4.53, 0.26, 0.4], [6.04, 0.14, 0.3],
    ]
    for (const [razao, v, dura] of parciais) {
      for (const desafino of [1, 1.0035]) {
        const o = c.createOscillator(); const g = c.createGain()
        o.type = 'sine'; o.frequency.value = base * razao * desafino
        envelope(g, inicio, vol * v * 0.5, 0.002, sustento * dura)
        o.connect(g); g.connect(saida)
        o.start(inicio); o.stop(inicio + sustento * dura + 0.05)
      }
    }
  }

  // "cha": a gaveta abrindo (baque grave + chiado metálico curto)
  const baque = c.createOscillator(); const gb = c.createGain()
  baque.type = 'sine'; baque.frequency.setValueAtTime(190, t); baque.frequency.exponentialRampToValueAtTime(70, t + 0.06)
  envelope(gb, t, 0.3, 0.002, 0.07)
  baque.connect(gb); gb.connect(saida); baque.start(t); baque.stop(t + 0.1)
  chiar(t, 3600, 0.7, 0.75, 0.11)
  chiar(t + 0.01, 7200, 1, 0.4, 0.08)

  // "ching": duas batidas de sino, a segunda mais aguda, e o chiado do metal vibrando
  sino(t + 0.085, 1975, 0.32, 1.1)
  sino(t + 0.155, 2637, 0.26, 0.95)
  chiar(t + 0.085, 9500, 2, 0.35, 0.4)
}

/**
 * O loss: duas notas descendo (sol, depois mi bemol, uma terça maior abaixo
 * com a segunda caindo um pouco no fim), em triângulo abafado por um filtro.
 * Mais baixo e mais curto que o ganho: informa, não pune.
 */
export function somDePerda(c: BaseAudioContext, destino: AudioNode, t: number): void {
  const saida = saidaDoSom(c, destino, 0.9)
  const abafar = c.createBiquadFilter(); abafar.type = 'lowpass'; abafar.frequency.value = 1400; abafar.Q.value = 0.5
  abafar.connect(saida)
  const nota = (inicio: number, freq: number, cai: number, vol: number, dura: number) => {
    for (const [tipo, v] of [['triangle', 1], ['sine', 0.6]] as const) {
      const o = c.createOscillator(); const g = c.createGain()
      o.type = tipo; o.frequency.setValueAtTime(freq, inicio)
      o.frequency.exponentialRampToValueAtTime(freq * cai, inicio + dura)
      envelope(g, inicio, vol * v, 0.012, dura)
      o.connect(g); g.connect(abafar)
      o.start(inicio); o.stop(inicio + dura + 0.05)
    }
  }
  nota(t, 392, 0.99, 0.4, 0.34)
  nota(t + 0.17, 311.13, 0.94, 0.4, 0.6)
}

/** O play: duas notas limpas subindo (quinta justa), curtas e suaves, com um leve brilho no fim. */
export function somDoPlay(c: BaseAudioContext, destino: AudioNode, t: number): void {
  const saida = saidaDoSom(c, destino, 0.55)
  const nota = (inicio: number, freq: number, pico: number, queda: number) => {
    for (const [razao, v] of [[1, 1], [2, 0.18], [3, 0.06]] as const) {
      const o = c.createOscillator(); const g = c.createGain()
      o.type = 'sine'; o.frequency.value = freq * razao
      envelope(g, inicio, pico * v, 0.006, queda)
      o.connect(g); g.connect(saida)
      o.start(inicio); o.stop(inicio + queda + 0.05)
    }
  }
  nota(t, 659.25, 0.5, 0.22)
  nota(t + 0.09, 987.77, 0.46, 0.5)
}

// ------------------------------------------------------------------ quem avisa que terminou
const tocados = new Set<number | string>()
const abertosVistos = new Set<number | string>()
const inicio = Date.now()

/** O contrato apareceu aberto nesta tela (Manual): o fim dele pode tocar. */
export function contratoAberto(id: number | string): void { abertosVistos.add(id) }

/**
 * Uma operação terminou: ganho toca o cha-ching, loss toca o som de perda,
 * empate fica em silêncio. `vistoAberto` diz se esta tela viu a operação
 * acontecer (para não tocar o passado ao abrir a plataforma).
 */
const manuais = new Set<number | string>()
/** O contrato foi comprado na boleta desta tela: o fim dele toca (os do robô não). */
export function contratoManual(id: number | string): void { manuais.add(id) }

export function operacaoTerminou(id: number | string, lucro: number, opcoes: { vistoAberto?: boolean; quando?: number } = {}): void {
  if (tocados.has(id)) return
  // contrato do robô: cada micro-operação fica em silêncio (o som é o do fim da sessão)
  if (!manuais.has(id)) return
  const viu = opcoes.vistoAberto ?? abertosVistos.has(id)
  const recente = opcoes.quando === undefined || opcoes.quando >= inicio - 2000
  // quem não viu a operação aberta não decide por ninguém: o outro caminho (o
  // histórico do robô, que viu) ainda pode tocar. Só fica marcada quando tocou
  // ou quando é do passado.
  if (!recente || !lucro) { tocados.add(id); return }
  if (!viu) return
  tocados.add(id)
  abertosVistos.delete(id)
  if (tocados.size > 2000) tocados.clear()
  tocarSom(lucro > 0 ? 'ganho' : 'perda')
}

/** O robô ligou: o som do play. */
export function roboLigou(): void { tocarSom('play') }

/**
 * O fim das sessões dos robôs: quem viu a sessão rodando nesta tela ouve o
 * ganho quando ela bate a meta e a perda quando bate o stop. Parada manual,
 * limite de operações ou recusa da corretora terminam em silêncio.
 */
const sessoesRodando = new Set<string>()
const sessoesTocadas = new Set<string>()
export function acompanharFimDasSessoes(lista: ReadonlyArray<{ id: string; estado?: { rodando?: boolean; emOperacao?: boolean; motivoParada?: string | null } | null }>): void {
  for (const s of lista) {
    const e = s.estado
    if (!e) continue
    if (e.rodando || e.emOperacao) { sessoesRodando.add(s.id); continue }
    if (!sessoesRodando.has(s.id) || sessoesTocadas.has(s.id)) continue
    sessoesRodando.delete(s.id)
    sessoesTocadas.add(s.id)
    const motivo = e.motivoParada ?? ''
    if (/meta de lucro/i.test(motivo)) tocarSom('ganho')
    else if (/limite de perda/i.test(motivo)) tocarSom('perda')
  }
}
