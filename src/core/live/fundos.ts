/**
 * Fundo da câmera do apresentador, trocado no próprio navegador.
 *
 * O recorte é o da casa (`recorte/ProcessadorDeFundo.ts`, 18/10/2026): IA do
 * MediaPipe com contorno guiado pela imagem, estabilidade no tempo, luz do
 * ambiente na borda e ajuste de cor. Substituiu o da biblioteca, que deixava
 * halo branco e cara de recortado. Para o realismo máximo, o guia do OBS
 * (pasta "Fundos para live") continua valendo.
 *
 * Os fundos são os mesmos da pasta da Área de Trabalho, em Full HD e já com
 * o leve desfoque de câmera que faz parecer real.
 */
import type { LocalVideoTrack } from 'livekit-client'
import { ProcessadorDeFundo, type ModoDoFundo } from './recorte/ProcessadorDeFundo'
import { MARCA } from '../../marca'

export interface Fundo {
  id: string
  nome: string
  /** Quem fez a foto e a licença, quando a licença pede crédito. */
  credito?: string
}

export const FUNDOS: Fundo[] = [
  { id: 'estudio-noite', nome: 'Estúdio noite' },
  { id: 'mesa-operacoes', nome: 'Mesa de operações' },
  { id: 'estudio-dia', nome: 'Estúdio dia' },
  { id: 'dubai-noite', nome: 'Dubai à noite' },
  { id: 'dubai-downtown', nome: 'Dubai do alto' },
  { id: 'dubai-marina', nome: 'Dubai Marina', credito: 'Foto: Norlando Pobre, CC BY 2.0' },
  { id: 'dubai-por-do-sol', nome: 'Dubai, pôr do sol', credito: 'Foto: Sergei Gussev, CC BY 2.0' },
  { id: 'restaurante-clifford', nome: 'Restaurante Clifford', credito: 'Foto: Basile Morin, CC BY-SA 4.0' },
  { id: 'restaurante-azul', nome: 'Restaurante azul' },
  { id: 'restaurante-amantaka', nome: 'Restaurante Amantaka', credito: 'Foto: Basile Morin, CC BY-SA 4.0' },
  { id: 'lobby-lustre', nome: 'Lobby com lustre', credito: 'Foto: Basile Morin, CC BY-SA 4.0' },
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
export function fundoGuardado(): EscolhaDeFundo {
  try { return localStorage.getItem(CHAVE) || 'nenhum' } catch { return 'nenhum' }
}
function guardar(e: EscolhaDeFundo) { try { localStorage.setItem(CHAVE, e) } catch { /* vale só agora */ } }

const processadores = new WeakMap<LocalVideoTrack, ProcessadorDeFundo>()

/** Aplica (ou tira) o fundo numa câmera. Troca na hora, sem piscar. */
export async function aplicarFundo(faixa: LocalVideoTrack, escolha: EscolhaDeFundo): Promise<void> {
  guardar(escolha)
  const atual = processadores.get(faixa)
  if (escolha === 'nenhum') {
    if (atual) { await faixa.stopProcessor(); processadores.delete(faixa) }
    return
  }
  const opcoes: ModoDoFundo = escolha === 'desfoque' ? { modo: 'desfoque' } : { modo: 'imagem', url: imagemDoFundo(escolha) }
  if (atual) { await atual.mudar(opcoes); return }
  const p = new ProcessadorDeFundo(opcoes)
  await faixa.setProcessor(p)
  processadores.set(faixa, p)
}
