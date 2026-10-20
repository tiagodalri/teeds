/**
 * Fundo da câmera do apresentador, trocado no próprio navegador.
 *
 * O recorte é o da casa (`recorte/ProcessadorDeFundo.ts`, 18/10/2026): IA do
 * MediaPipe com contorno guiado pela imagem, estabilidade no tempo, luz do
 * ambiente na borda e ajuste de cor. Substituiu o da biblioteca, que deixava
 * halo branco e cara de recortado. Para o realismo máximo, o guia do OBS
 * (pasta "Fundos para live") continua valendo.
 *
 * A arte do monograma é gerada por scripts/fundo-monograma-gf.mjs.
 */
import type { LocalVideoTrack } from 'livekit-client'
import type { ModoDoFundo, ProcessadorDeFundo } from './recorte/ProcessadorDeFundo'
import { MARCA } from '../../marca'

export interface Fundo {
  id: string
  nome: string
}

/*
  20/10/2026 (pedido do Tiago, mais objetivo): só duas opções além de "sem
  fundo": desfocar o fundo real, ou a arte com o monograma GF. Os fundos de
  Dubai, estúdios e restaurantes saíram.
*/
export const FUNDOS: Fundo[] = [
  { id: 'monograma-gf', nome: 'Monograma GF' },
]

/** 'nenhum' = câmera como está; 'desfoque' = fundo real desfocado; ou o id de um fundo. */
export type EscolhaDeFundo = 'nenhum' | 'desfoque' | string

const base = () => `${location.origin}${import.meta.env.BASE_URL}fundos-globalfly/`
export const imagemDoFundo = (id: string) => `${base()}${id}.jpg`
export const miniaturaDoFundo = (id: string) => `${base()}${id}-mini.jpg`

export const fundosDisponiveis = (): boolean => {
  try {
    return typeof HTMLCanvasElement !== 'undefined' && 'captureStream' in HTMLCanvasElement.prototype &&
      !!document.createElement('canvas').getContext('webgl2')
  } catch { return false }
}

const CHAVE = `${MARCA.id}.aovivo.fundo`
/** A escolha guardada; um fundo que não existe mais (Dubai, estúdios) vira "sem fundo". */
export function fundoGuardado(): EscolhaDeFundo {
  let e: string | null = null
  try { e = localStorage.getItem(CHAVE) } catch { /* sem armazenamento */ }
  return e === 'desfoque' || FUNDOS.some((f) => f.id === e) ? e! : 'nenhum'
}
export function guardarFundo(e: EscolhaDeFundo) { try { localStorage.setItem(CHAVE, e) } catch { /* vale só agora */ } }

/*
  Rapidez (20/10/2026): o recorte (MediaPipe, ~1 MB de código e o modelo de
  IA) só é baixado por quem liga um fundo. Antes vinha junto com o "Ao vivo"
  de todo mundo, inclusive de quem só assiste.
*/
let modulo: Promise<typeof import('./recorte/ProcessadorDeFundo')> | null = null
const carregarRecorte = () => (modulo ??= import('./recorte/ProcessadorDeFundo'))
/** Começa a baixar o recorte e a IA antes de a câmera ligar (a sala abriu). */
export function prepararFundo(): void {
  void carregarRecorte().then((m) => m.prepararIA()).catch(() => undefined)
}

const processadores = new WeakMap<LocalVideoTrack, ProcessadorDeFundo>()

/** Aplica (ou tira) o fundo numa câmera. Troca na hora, sem piscar. */
export async function aplicarFundo(faixa: LocalVideoTrack, escolha: EscolhaDeFundo): Promise<void> {
  guardarFundo(escolha)
  const atual = processadores.get(faixa)
  if (escolha === 'nenhum') {
    if (atual) { await faixa.stopProcessor(); processadores.delete(faixa) }
    return
  }
  const opcoes: ModoDoFundo = escolha === 'desfoque' ? { modo: 'desfoque' } : { modo: 'imagem', url: imagemDoFundo(escolha) }
  if (atual) { await atual.mudar(opcoes); return }
  const { ProcessadorDeFundo: Processador } = await carregarRecorte()
  const p = new Processador(opcoes)
  await faixa.setProcessor(p)
  processadores.set(faixa, p)
}
