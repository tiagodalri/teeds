import { useSyncExternalStore } from 'react'
import { MARCA } from '../marca'

/**
 * O som de "win" (21/10/2026, pedido do Tiago): toda operação que termina
 * com ganho toca uma moeda, no computador, no celular e no app instalado.
 *
 * Sem arquivo de áudio: a moeda é sintetizada na hora (Web Audio), então não
 * pesa nada e não depende de rede. Duas notas rápidas (si e mi, a "moeda"
 * clássica) com um brilho agudo que some em meio segundo.
 *
 * Regras:
 *  - uma vez por contrato: o Manual (aviso da corretora) e os robôs
 *    (histórico da sessão) podem contar a mesma operação; o número do
 *    contrato não deixa tocar duas vezes;
 *  - só toca o que terminou DEPOIS de a tela abrir (abrir a plataforma não
 *    dispara um monte de moedas do que já tinha acontecido);
 *  - várias vitórias no mesmo instante (vários robôs) viram uma moeda só;
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
  if (ligado) tocarMoeda(true)
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
  if (c.state === 'suspended') void c.resume().catch(() => undefined)
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

let ultimaVez = 0
/** A moeda. `forcar` toca mesmo com a regra de intervalo (o teste ao ligar o som). */
export function tocarMoeda(forcar = false): void {
  if (!ligado || document.visibilityState === 'hidden') return
  const agora = performance.now()
  if (!forcar && agora - ultimaVez < 350) return
  ultimaVez = agora
  const c = contexto()
  if (!c) return
  if (c.state === 'suspended') void c.resume().catch(() => undefined)
  const t = c.currentTime + 0.01
  const saida = c.createGain()
  saida.gain.value = 0.22
  // um compressor leve: alto o bastante no celular, sem estourar no fone
  const comp = c.createDynamicsCompressor()
  comp.threshold.value = -18; comp.ratio.value = 3
  saida.connect(comp); comp.connect(c.destination)

  const nota = (freq: number, inicio: number, dur: number, tipo: OscillatorType, vol: number) => {
    const o = c.createOscillator(); const g = c.createGain()
    o.type = tipo; o.frequency.setValueAtTime(freq, t + inicio)
    g.gain.setValueAtTime(0.0001, t + inicio)
    g.gain.exponentialRampToValueAtTime(vol, t + inicio + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + inicio + dur)
    o.connect(g); g.connect(saida)
    o.start(t + inicio); o.stop(t + inicio + dur + 0.02)
  }
  // si5 curto, mi6 longo: a moeda
  nota(987.77, 0, 0.09, 'square', 0.18)
  nota(987.77, 0, 0.09, 'triangle', 0.5)
  nota(1318.51, 0.075, 0.48, 'square', 0.14)
  nota(1318.51, 0.075, 0.5, 'triangle', 0.55)
  // o brilho do metal
  nota(2637.02, 0.08, 0.32, 'sine', 0.12)
  nota(3951.07, 0.09, 0.22, 'sine', 0.06)
}

// ------------------------------------------------------------------ quem avisa que terminou
const tocados = new Set<number | string>()
const abertosVistos = new Set<number | string>()
const inicio = Date.now()

/** O contrato apareceu aberto nesta tela (Manual): o fim dele pode tocar. */
export function contratoAberto(id: number | string): void { abertosVistos.add(id) }

/**
 * Uma operação terminou. `vistoAberto` diz se esta tela viu a operação
 * acontecer (para não tocar o passado ao abrir a plataforma).
 */
export function operacaoTerminou(id: number | string, lucro: number, opcoes: { vistoAberto?: boolean; quando?: number } = {}): void {
  if (tocados.has(id)) return
  const viu = opcoes.vistoAberto ?? abertosVistos.has(id)
  const recente = opcoes.quando === undefined || opcoes.quando >= inicio - 2000
  tocados.add(id)
  abertosVistos.delete(id)
  if (tocados.size > 2000) tocados.clear()
  if (lucro > 0 && viu && recente) tocarMoeda()
}
