import type { TeedsSocket } from './client'

/**
 * Extrato da conta: tudo que entrou e saiu, incluindo depositos e saques.
 * Diferente do historico de operacoes, que so mostra contratos.
 */

export type TipoMovimento = 'buy' | 'sell' | 'deposit' | 'withdrawal'

export interface Movimento {
  id: number
  tipo: TipoMovimento | string
  valor: number
  saldoDepois: number
  quando: number
  descricao: string
  contratoId: number | null
  /** Qual aplicacao originou o movimento (a Teeds tem id proprio). */
  appId: string | null
  pagamento: number | null
}

const ROTULOS: Record<string, string> = {
  buy: 'Compra',
  sell: 'Venda',
  deposit: 'Depósito',
  withdrawal: 'Saque',
}

export function rotuloTipo(t: string): string {
  return ROTULOS[t] ?? t
}

export async function buscarExtrato(
  socket: TeedsSocket,
  opcoes: { limite?: number; pular?: number; tipo?: TipoMovimento | 'todos' } = {},
): Promise<{ movimentos: Movimento[]; total: number }> {
  const { limite = 50, pular = 0, tipo = 'todos' } = opcoes
  const pedido: Record<string, any> = {
    statement: 1,
    description: 1,
    limit: limite,
    offset: pular,
  }
  if (tipo !== 'todos') pedido.action_type = tipo

  const res = await socket.send(pedido)
  const s = res.statement as Record<string, any> | undefined
  const linhas = (s?.transactions ?? []) as Array<Record<string, any>>

  return {
    total: Number(s?.count ?? linhas.length),
    movimentos: linhas.map((t) => ({
      id: Number(t.transaction_id),
      tipo: t.action_type ?? '',
      valor: Number(t.amount ?? 0),
      saldoDepois: Number(t.balance_after ?? 0),
      quando: Number(t.transaction_time ?? 0),
      descricao: t.longcode ?? '',
      contratoId: t.contract_id != null ? Number(t.contract_id) : null,
      appId: t.app_id != null ? String(t.app_id) : null,
      pagamento: t.payout != null ? Number(t.payout) : null,
    })),
  }
}

/** Totais do extrato carregado. */
export function resumirExtrato(movs: Movimento[]) {
  let entradas = 0, saidas = 0, depositos = 0, saques = 0
  for (const m of movs) {
    if (m.valor > 0) entradas += m.valor
    else saidas += Math.abs(m.valor)
    if (m.tipo === 'deposit') depositos += m.valor
    if (m.tipo === 'withdrawal') saques += Math.abs(m.valor)
  }
  return {
    entradas, saidas, depositos, saques,
    liquido: entradas - saidas,
    movimentado: entradas + saidas,
    saldoFinal: movs.length ? movs[0].saldoDepois : 0,
  }
}
