/**
 * O roteiro da manual no modo simulado (16/11/2026, Tiago: "montar as operações simuladas também nas
 * manuais", e "os dois juntos": planejar antes e decidir na hora).
 *
 * - O roteiro é a lista das operações da aula: o resultado de cada uma (Ganha, Perde ou Mercado, que deixa
 *   o preço de verdade decidir) e a entrada sugerida. Fica salvo neste navegador até trocar ou apagar
 *   (dá para gravar de novo amanhã: "Recomeçar").
 * - Cada compra manual simulada (boleta ou Multitela) usa a próxima operação do roteiro.
 * - Na hora, o controle muda o resultado da próxima. Sem roteiro (ou depois do fim), vale a escolha do
 *   controle para as próximas ("Mercado" até mudar).
 * Só administradores, só no modo simulado; nada vai ao servidor.
 */
import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'

/*
  Liberado para todos os administradores (16/11/2026, Tiago: "libera essa modalidade de operações simuladas
  para todos os administradores, tanto das I.A. quanto da manual"). Antes, só o e-mail do Tiago. Quem pode
  é quem está no modo simulado (que já só existe para administradores confirmados).
*/
export const roteiroLiberadoPara = (_email?: string | null) => true
let liberado = false
/** O App diz se quem está na tela pode usar o roteiro (sem isso, toda compra simulada fica com o mercado). */
export function permitirRoteiroManual(pode: boolean): void { liberado = pode }

export type Resultado = 'ganha' | 'perde' | 'mercado'
export interface ItemDoRoteiro { resultado: Resultado; entrada: number }
export interface FeitaNoRoteiro {
  contractId: number
  /** Posição no roteiro (null: fora do roteiro, pela escolha do controle). */
  indice: number | null
  pedido: Resultado
  ganhou: boolean | null
  lucro: number | null
}
export interface EstadoDoRoteiro {
  itens: ItemDoRoteiro[]
  /** Quantas operações do roteiro já foram compradas. */
  feitas: number
  /** A escolha do controle quando não há operação do roteiro pela frente. */
  livre: Resultado
  /** As operações desta rodada (para o placar do controle). */
  rodada: FeitaNoRoteiro[]
  /** Pagamento estimado por acerto (para a prévia), em fração: 0.95 = 95%. */
  pagamento: number
}

const CHAVE = `${MARCA.id}.simulacao.manual`
const VAZIO: EstadoDoRoteiro = { itens: [], feitas: 0, livre: 'mercado', rodada: [], pagamento: 0.95 }

function ler(): EstadoDoRoteiro {
  try {
    const e = JSON.parse(localStorage.getItem(CHAVE) || 'null') as Partial<EstadoDoRoteiro> | null
    if (!e || !Array.isArray(e.itens)) return VAZIO
    return {
      itens: e.itens.filter((i) => i && ['ganha', 'perde', 'mercado'].includes(i.resultado) && Number.isFinite(i.entrada)),
      feitas: Math.max(0, Number(e.feitas) || 0),
      livre: e.livre && ['ganha', 'perde', 'mercado'].includes(e.livre) ? e.livre : 'mercado',
      rodada: Array.isArray(e.rodada) ? e.rodada.slice(-200) : [],
      pagamento: Number.isFinite(e.pagamento) && (e.pagamento as number) > 0 ? (e.pagamento as number) : 0.95,
    }
  } catch { return VAZIO }
}
let atual: EstadoDoRoteiro = typeof localStorage !== 'undefined' ? ler() : VAZIO
const ouvintes = new Set<() => void>()
function mudar(f: (e: EstadoDoRoteiro) => EstadoDoRoteiro) {
  atual = f(atual)
  try { localStorage.setItem(CHAVE, JSON.stringify(atual)) } catch { /* vale até recarregar */ }
  ouvintes.forEach((o) => o())
}
// outra aba mexeu no roteiro: esta acompanha
if (typeof window !== 'undefined') window.addEventListener('storage', (ev) => { if (ev.key === CHAVE) { atual = ler(); ouvintes.forEach((o) => o()) } })

export const roteiroAgora = () => atual
export function useRoteiroManual(): EstadoDoRoteiro {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => atual, () => atual)
}

/** A próxima operação: o que vai acontecer e a entrada sugerida (null fora do roteiro). */
export function proximaDoRoteiro(e = atual): { resultado: Resultado; entrada: number | null; indice: number | null } {
  if (e.feitas < e.itens.length) return { resultado: e.itens[e.feitas].resultado, entrada: e.itens[e.feitas].entrada, indice: e.feitas }
  return { resultado: e.livre, entrada: null, indice: null }
}

/** Salva o roteiro e começa do início. */
export function salvarRoteiro(itens: ItemDoRoteiro[], pagamento?: number): void {
  mudar((e) => ({ ...e, itens: itens.map((i) => ({ resultado: i.resultado, entrada: Math.round(i.entrada * 100) / 100 })), feitas: 0, rodada: [], ...(pagamento ? { pagamento } : {}) }))
}
export function apagarRoteiro(): void { mudar((e) => ({ ...e, itens: [], feitas: 0, rodada: [] })) }
export function recomecarRoteiro(): void { mudar((e) => ({ ...e, feitas: 0, rodada: [] })) }

/** O controle, na hora: muda o resultado da próxima (do roteiro) ou a escolha para as próximas (sem roteiro). */
export function decidirProxima(r: Resultado): void {
  mudar((e) => {
    if (e.feitas < e.itens.length) {
      const itens = e.itens.slice()
      itens[e.feitas] = { ...itens[e.feitas], resultado: r }
      return { ...e, itens }
    }
    return { ...e, livre: r }
  })
}

/** Uma compra manual simulada: usa a próxima do roteiro e anda uma casa. */
export function usarNaCompra(contractId: number): Resultado {
  if (!liberado) return 'mercado'
  const p = proximaDoRoteiro()
  mudar((e) => ({
    ...e,
    feitas: p.indice !== null ? e.feitas + 1 : e.feitas,
    rodada: [...e.rodada, { contractId, indice: p.indice, pedido: p.resultado, ganhou: null, lucro: null }].slice(-200),
  }))
  return p.resultado
}

/** A compra não chegou a acontecer (recusa da cotação, saldo): devolve a casa. */
export function desfazerCompra(contractId: number): void {
  mudar((e) => {
    const f = e.rodada.find((x) => x.contractId === contractId)
    if (!f) return e
    return { ...e, feitas: f.indice !== null ? Math.max(0, e.feitas - 1) : e.feitas, rodada: e.rodada.filter((x) => x !== f) }
  })
}

/** A operação fechou: guarda o resultado para o placar. */
export function anotarResultado(contractId: number, ganhou: boolean, lucro: number): void {
  mudar((e) => ({ ...e, rodada: e.rodada.map((x) => (x.contractId === contractId ? { ...x, ganhou, lucro } : x)) }))
}

/**
 * Monta um roteiro pelo resultado: n operações com a mesma entrada que fecham perto do valor pedido,
 * na ordem de uma sessão de verdade (as perdas espalhadas, sem sequência longa, a última ganhando quando o
 * resultado é positivo). Devolve quantas ganham e o resultado estimado.
 */
export function montarPeloResultado(n: number, entrada: number, alvo: number, pagamento: number, semente = Date.now()): { itens: ItemDoRoteiro[]; ganhos: number; estimado: number } {
  n = Math.max(1, Math.min(200, Math.round(n)))
  const ganhoPorAcerto = entrada * pagamento
  let ganhos = Math.round((alvo + n * entrada) / (ganhoPorAcerto + entrada))
  ganhos = Math.max(0, Math.min(n, ganhos))
  const perdas = n - ganhos
  let s = semente % 2147483647 || 1
  const sorteio = () => (s = (s * 48271) % 2147483647) / 2147483647
  // espalha as perdas: cada uma num pedaço da sessão, sorteada dentro dele
  const lugares = new Set<number>()
  const ultimaGanha = alvo >= 0 && ganhos > 0
  const espaco = ultimaGanha ? n - 1 : n
  for (let k = 0; k < perdas; k++) {
    const ini = Math.floor((k * espaco) / perdas)
    const fim = Math.max(ini, Math.floor(((k + 1) * espaco) / perdas) - 1)
    let i = ini + Math.floor(sorteio() * (fim - ini + 1))
    while (lugares.has(i) && i < espaco - 1) i++
    while (lugares.has(i) && i > 0) i--
    lugares.add(i)
  }
  const itens: ItemDoRoteiro[] = Array.from({ length: n }, (_, i) => ({ resultado: lugares.has(i) ? 'perde' : 'ganha', entrada }))
  // com entradas iguais quase nunca fecha exato: a última que ganha compensa a diferença (se couber)
  const comIguais = ganhos * ganhoPorAcerto - perdas * entrada
  const falta = alvo - comIguais
  const ultima = itens.map((x) => x.resultado).lastIndexOf('ganha')
  if (ultima >= 0 && Math.abs(falta) >= 0.01) {
    const nova = Math.round((entrada + falta / pagamento) * 100) / 100
    if (nova >= 0.35) itens[ultima] = { ...itens[ultima], entrada: nova }
  }
  const linhas = previaDoRoteiro(itens, pagamento, 0)
  const estimado = linhas.length ? linhas[linhas.length - 1].acumulado : 0
  return { itens, ganhos, estimado }
}

/** O resultado estimado de cada operação do roteiro (Mercado não entra na conta). */
export function previaDoRoteiro(itens: ItemDoRoteiro[], pagamento: number, saldo: number) {
  let acumulado = 0
  return itens.map((i) => {
    const lucro = i.resultado === 'ganha' ? Math.round(i.entrada * pagamento * 100) / 100 : i.resultado === 'perde' ? -i.entrada : null
    if (lucro !== null) acumulado = Math.round((acumulado + lucro) * 100) / 100
    return { ...i, lucro, acumulado, saldo: Math.round((saldo + acumulado) * 100) / 100 }
  })
}
