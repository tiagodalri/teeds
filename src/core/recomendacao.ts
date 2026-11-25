import { casasDecimais } from './deriv/types'
import { GF_SIGLA } from '../marca'

/**
 * A conta da "I.A. recomendada agora" (cartão da Início da GF), num lugar só: a tela e o
 * servidor (Assessor no WhatsApp, Assistente) usam ESTA função, então a resposta é sempre a mesma.
 * 25/11/2026, Tiago: "tem que sempre bater com o que está mostrando lá na plataforma".
 *
 * Os 100 ticks do 75 Index que terminam na marca da janela (:00 ou :30), contra a faixa de cada
 * I.A.; a que mais passou do normal é a recomendada. Leitura interna: nunca mostrar ticks nem
 * porcentagens ao cliente, e falar do que já aconteceu ("ficou alinhado"), nunca de chance maior.
 */
export const IAS_DA_RECOMENDACAO = [
  { id: 'goreme', nome: `${GF_SIGLA} Raptor`, curto: 'Raptor', ganha: (d: number) => d < 9, p: 0.9 },
  { id: 'falcon', nome: `${GF_SIGLA} Falcon`, curto: 'Falcon', ganha: (d: number) => d < 6, p: 0.6 },
  { id: 'legacy', nome: `${GF_SIGLA} Legacy`, curto: 'Legacy', ganha: (d: number) => d > 3, p: 0.6 },
  { id: 'superior5', nome: `${GF_SIGLA} Gulf`, curto: 'Gulf', ganha: (d: number) => d > 6, p: 0.3 },
  { id: 'ag2', nome: `${GF_SIGLA} Phenom`, curto: 'Phenom', ganha: (d: number) => d < 3, p: 0.3 },
] as const
export type IADaRecomendacao = (typeof IAS_DA_RECOMENDACAO)[number]

/** 30 minutos, nas marcas :00 e :30. */
export const JANELA_DA_RECOMENDACAO_S = 30 * 60
/** O começo da janela em que `ms` cai (milissegundos). */
export const inicioDaJanela = (ms: number, passoMs = JANELA_DA_RECOMENDACAO_S * 1000) => Math.floor(ms / passoMs) * passoMs
/** O pedido de ticks da janela que começou em `deMs`. */
export const pedidoDosTicks = (ate: number | 'latest') => ({ ticks_history: 'R_75', end: ate, count: 100, style: 'ticks' }) as const
/** Menos que isto a leitura não vale (a tela tenta de novo). */
export const MINIMO_DE_TICKS = 50

/** O último dígito de cada preço, com as casas do pip_size da resposta (igual ao gráfico). */
export function digitosDosPrecos(precos: unknown[], pipSize: unknown): number[] {
  const casas = pipSize === undefined ? 4 : casasDecimais(pipSize)
  return precos.map((p) => Number(Number(p).toFixed(casas).slice(-1)))
}

/** A ordem da leitura: quem mais passou do normal nos 100 ticks (a primeira é a recomendada). */
export function ordemDaRecomendacao(digitos: number[]): IADaRecomendacao[] {
  const n = digitos.length || 1
  return [...IAS_DA_RECOMENDACAO].map((ia) => ({ ia, z: (digitos.filter(ia.ganha).length - n * ia.p) / Math.sqrt(n * ia.p * (1 - ia.p)) }))
    .sort((a, b) => b.z - a.z).map((r) => r.ia)
}
