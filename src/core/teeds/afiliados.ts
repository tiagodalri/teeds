import type { SessaoTeeds } from './conta'
import { SERVIDOR } from './config'

/**
 * A conta de afiliado da Deriv de cada parceiro (09/11/2026).
 * Quem fala com a Deriv é o servidor (servidor/src/afiliados.ts); aqui só a tela.
 */

export interface ResumoDeAfiliado {
  cadastros: number
  contasReais: number
  primeiroDeposito: number
  primeiraOperacao: number
  operaram: number
  comissaoPaga: number
  comissaoPendente: number
  subafiliadosAtivos: number
  ganhoSubafiliados: number
}
export type SituacaoDoAfiliado = 'ok' | 'nao-e-afiliado' | 'reconectar' | 'erro'
export interface CartaoDeAfiliado {
  codigo: string
  nome: string
  conexao: null | { quem: string | null; souEu: boolean; desde: string; situacao: SituacaoDoAfiliado; detalhe: string | null; coletadoEm: string | null }
  total: ResumoDeAfiliado
  operaramNoPeriodo: number | null
  dias: Array<{ dia: string } & ResumoDeAfiliado>
}
export interface PainelDeAfiliados { cartoes: CartaoDeAfiliado[]; geral: boolean; meuCodigo: string | null }

async function chamar<T>(sessao: SessaoTeeds, caminho: string, corpo?: object): Promise<T> {
  const r = await fetch(`${SERVIDOR.url}${caminho}`, {
    method: corpo ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    ...(corpo ? { body: JSON.stringify(corpo) } : {}),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.erro || 'Não consegui falar com o servidor agora. Tente de novo em instantes.')
  return j as T
}

export const painelDeAfiliados = (sessao: SessaoTeeds, marca: string, de: string, ate: string) =>
  chamar<PainelDeAfiliados>(sessao, `/api/afiliados?marca=${encodeURIComponent(marca)}&de=${de}&ate=${ate}`)
export const vincularAfiliado = (sessao: SessaoTeeds, marca: string, parceiro: string) =>
  chamar<{ ok: true; resumo: ResumoDeAfiliado }>(sessao, '/api/afiliados/vincular', { marca, parceiro })
export const desvincularAfiliado = (sessao: SessaoTeeds, marca: string, parceiro: string) =>
  chamar<{ ok: true }>(sessao, '/api/afiliados/desvincular', { marca, parceiro })
export const atualizarAfiliados = (sessao: SessaoTeeds, marca: string) =>
  chamar<{ ok: true; contas: number; dias: number; defeitos: number }>(sessao, '/api/afiliados/atualizar', { marca })

export interface ApiDeAfiliados {
  painel: typeof painelDeAfiliados
  vincular: typeof vincularAfiliado
  desvincular: typeof desvincularAfiliado
  atualizar: typeof atualizarAfiliados
}
export const AFILIADOS_DO_SERVIDOR: ApiDeAfiliados = { painel: painelDeAfiliados, vincular: vincularAfiliado, desvincular: desvincularAfiliado, atualizar: atualizarAfiliados }
