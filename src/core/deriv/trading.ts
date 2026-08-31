import { TeedsSocket } from './client'
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
  buyPrice: number
  bidPrice: number
  profit: number
  profitPercentage: number
  status: string
  isValidToSell: boolean
  entrySpot: number | null
  currentSpot: number | null
  longcode: string
  purchaseTime: number
  expiryTime: number
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

/** Assina TODOS os contratos abertos da conta, com atualizacao continua. */
export function subscribeOpenContracts(
  socket: TeedsSocket,
  onContract: (c: OpenContract) => void,
): () => void {
  return socket.subscribe({ proposal_open_contract: 1 }, (msg: DerivMessage) => {
    if (msg.error || !msg.proposal_open_contract) return
    const p = msg.proposal_open_contract as Record<string, any>
    if (!p.contract_id) return
    onContract({
      contractId: Number(p.contract_id),
      symbol: p.underlying_symbol ?? '',
      contractType: p.contract_type ?? '',
      buyPrice: Number(p.buy_price ?? 0),
      bidPrice: Number(p.bid_price ?? 0),
      profit: Number(p.profit ?? 0),
      profitPercentage: Number(p.profit_percentage ?? 0),
      status: p.status ?? 'open',
      isValidToSell: p.is_valid_to_sell === 1,
      entrySpot: p.entry_spot != null ? Number(p.entry_spot) : null,
      currentSpot: p.current_spot != null ? Number(p.current_spot) : null,
      longcode: p.longcode ?? '',
      purchaseTime: Number(p.purchase_time ?? 0),
      expiryTime: Number(p.date_expiry ?? 0),
    })
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
