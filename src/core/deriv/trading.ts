import { TeedsSocket } from './client'
import { casasDecimais } from './types'
import type { Candle, DerivMessage } from './types'

/** Resultado de uma compra. */
export interface BuyReceipt {
  contractId: number
  transactionId: number
  buyPrice: number
  payout: number
  balanceAfter: number
  longcode: string
  purchaseTime: number
}

/** Contrato aberto, como a Teeds o representa. */
export interface OpenContract {
  contractId: number
  symbol: string
  contractType: string
  /** Valor investido. */
  buyPrice: number
  /** Quanto vale agora, se vendido. */
  bidPrice: number
  /** Quanto paga se ganhar. */
  payout: number
  profit: number
  profitPercentage: number
  status: string
  isValidToSell: boolean
  isExpired: boolean
  entrySpot: number | null
  currentSpot: number | null
  barrier: number | null
  longcode: string
  shortcode: string
  currency: string
  purchaseTime: number
  startTime: number
  expiryTime: number
  pipSize: number
}

function toOpenContract(p: Record<string, any>): OpenContract {
  const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v))
  return {
    contractId: Number(p.contract_id),
    symbol: p.underlying_symbol ?? '',
    contractType: p.contract_type ?? '',
    buyPrice: Number(p.buy_price ?? 0),
    bidPrice: Number(p.bid_price ?? p.buy_price ?? 0),
    payout: Number(p.payout ?? 0),
    profit: Number(p.profit ?? 0),
    profitPercentage: Number(p.profit_percentage ?? 0),
    status: p.status ?? 'open',
    isValidToSell: p.is_valid_to_sell === 1,
    isExpired: p.is_expired === 1,
    entrySpot: num(p.entry_spot),
    currentSpot: num(p.current_spot),
    barrier: num(p.barrier),
    longcode: p.longcode ?? '',
    shortcode: p.shortcode ?? '',
    currency: p.currency ?? 'USD',
    purchaseTime: Number(p.purchase_time ?? 0),
    startTime: Number(p.date_start ?? p.purchase_time ?? 0),
    expiryTime: Number(p.date_expiry ?? p.expiry_time ?? 0),
    pipSize: casasDecimais(p.pip_size),
  }
}

/** Lista os contratos abertos agora (fonte autoritativa ao conectar). */
export async function fetchPortfolio(socket: TeedsSocket): Promise<OpenContract[]> {
  const res = await socket.send({ portfolio: 1 })
  const lista = ((res.portfolio as any)?.contracts ?? []) as Array<Record<string, any>>
  return lista.map(toOpenContract)
}

/**
 * Acompanha UM contrato especifico em tempo real.
 * Assinar por contrato e mais confiavel do que assinar o portfolio inteiro:
 * cada contrato tem seu proprio fluxo, e a falha de um nao derruba os outros.
 */
export function subscribeContract(
  socket: TeedsSocket,
  contractId: number,
  onUpdate: (c: OpenContract) => void,
  onError?: (msg: string) => void,
): () => void {
  return socket.subscribe({ proposal_open_contract: 1, contract_id: contractId }, (msg) => {
    if (msg.error) { onError?.(msg.error.message); return }
    const p = msg.proposal_open_contract as Record<string, any> | undefined
    if (!p || !p.contract_id) return
    onUpdate(toOpenContract(p))
  })
}

/** Avisa sempre que uma transacao acontece (compra ou venda) na conta. */
export function subscribeTransactions(
  socket: TeedsSocket,
  onTransaction: (t: { action: string; contractId: number | null; amount: number; balance: number }) => void,
): () => void {
  return socket.subscribe({ transaction: 1 }, (msg) => {
    if (msg.error || !msg.transaction) return
    const t = msg.transaction as Record<string, any>
    onTransaction({
      action: t.action ?? '',
      contractId: t.contract_id != null ? Number(t.contract_id) : null,
      amount: Number(t.amount ?? 0),
      balance: Number(t.balance ?? 0),
    })
  })
}

export interface Balance {
  amount: number
  currency: string
  loginId: string
}

/** Compra um contrato a partir de uma proposta ja cotada. */
export async function buyFromProposal(
  socket: TeedsSocket,
  proposalId: string,
  price: number,
): Promise<BuyReceipt> {
  const res = await socket.send({ buy: proposalId, price })
  const b = res.buy as Record<string, any>
  return {
    contractId: Number(b.contract_id),
    transactionId: Number(b.transaction_id),
    buyPrice: Number(b.buy_price),
    payout: Number(b.payout),
    balanceAfter: Number(b.balance_after),
    longcode: String(b.longcode ?? ''),
    purchaseTime: Number(b.purchase_time),
  }
}

/** Vende um contrato aberto. price 0 = a mercado. */
export async function sellContract(
  socket: TeedsSocket,
  contractId: number,
  price = 0,
): Promise<{ soldFor: number; balanceAfter: number; transactionId: number }> {
  const res = await socket.send({ sell: contractId, price })
  const s = res.sell as Record<string, any>
  return {
    soldFor: Number(s.sold_for),
    balanceAfter: Number(s.balance_after),
    transactionId: Number(s.transaction_id),
  }
}

/** Assina o saldo da conta em tempo real. */
export function subscribeBalance(socket: TeedsSocket, onBalance: (b: Balance) => void): () => void {
  return socket.subscribe({ balance: 1 }, (msg: DerivMessage) => {
    if (msg.error || !msg.balance) return
    const b = msg.balance as Record<string, any>
    onBalance({ amount: Number(b.balance), currency: b.currency ?? 'USD', loginId: b.loginid ?? '' })
  })
}

/** Cotacao de um contrato dentro da conexao autenticada (devolve o id para comprar). */
export async function requestProposal(
  socket: TeedsSocket,
  params: {
    symbol: string
    contractType: string
    amount: number
    duration: number
    durationUnit: string
    currency: string
    /** Barreira - nos contratos de digito, o digito escolhido. */
    barrier?: string
  },
): Promise<{ id: string; askPrice: number; payout: number; longcode: string }> {
  const res = await socket.send({
    proposal: 1,
    amount: params.amount,
    basis: 'stake',
    contract_type: params.contractType,
    currency: params.currency,
    duration: params.duration,
    duration_unit: params.durationUnit,
    underlying_symbol: params.symbol,
    ...(params.barrier !== undefined ? { barrier: params.barrier } : {}),
  })
  const p = res.proposal as Record<string, any>
  return {
    id: String(p.id),
    askPrice: Number(p.ask_price),
    payout: Number(p.payout),
    longcode: String(p.longcode ?? ''),
  }
}

/** Historico de operacoes fechadas. */
export async function fetchProfitTable(
  socket: TeedsSocket,
  limit = 50,
): Promise<Array<Record<string, any>>> {
  const res = await socket.send({ profit_table: 1, description: 1, limit, sort: 'DESC' })
  const t = res.profit_table as Record<string, any> | undefined
  return (t?.transactions ?? []) as Array<Record<string, any>>
}

export type { Candle }
