import { TeedsSocket } from './client'
import { precisaoInformada } from './types'
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
  /** Por que a Deriv não deixa encerrar agora (texto dela, em inglês). */
  motivoSemVenda: string | null
  isExpired: boolean
  entrySpot: number | null
  currentSpot: number | null
  exitSpot: number | null
  barrier: number | null
  longcode: string
  shortcode: string
  currency: string
  purchaseTime: number
  startTime: number
  expiryTime: number
  pipSize: number
  pipSizeInformado?: boolean
  /**
   * O markup que a Deriv registrou neste contrato (`app_markup_amount`).
   *
   * A documentacao so garante esse campo na resposta de `proposal`. Os robos
   * compram sem proposal, para nao perder tempo — entao aqui ele pode nao
   * vir. Quando nao vem, fica `null`: melhor um vazio honesto do que 3% do
   * pagamento fingindo ser medicao.
   */
  appMarkup: number | null
  /** Só nos multiplicadores (MULTUP/MULTDOWN): o multiplicador e os limites de saída em vigor. */
  mult?: DadosDoMultiplicador
}

/** Um limite de saída do multiplicador: o valor em dinheiro e o preço do ativo em que ele dispara. */
export interface LimiteDeSaida { valor: number; preco: number | null }
export interface DadosDoMultiplicador {
  multiplicador: number
  takeProfit: LimiteDeSaida | null
  stopLoss: LimiteDeSaida | null
  /** Onde a Deriv fecha sozinha: a perda chegou ao valor de entrada. */
  stopOut: LimiteDeSaida | null
  /** Cancelamento contratado: até quando dá para desistir e receber a entrada de volta (epoch s). */
  cancelamentoAte: number | null
  comissao: number | null
}

const limiteDe = (l: any): LimiteDeSaida | null => {
  if (!l || l.order_amount === null || l.order_amount === undefined) return null
  const preco = l.value === null || l.value === undefined || l.value === '' ? null : Number(l.value)
  return { valor: Math.abs(Number(l.order_amount)), preco: Number.isFinite(preco) ? preco : null }
}
function dadosDoMultiplicador(p: Record<string, any>): DadosDoMultiplicador | undefined {
  if (!/^MULT(UP|DOWN)$/.test(p.contract_type ?? '')) return undefined
  const lo = p.limit_order ?? {}
  return {
    multiplicador: Number(p.multiplier ?? 0),
    takeProfit: limiteDe(lo.take_profit),
    stopLoss: limiteDe(lo.stop_loss),
    stopOut: limiteDe(lo.stop_out),
    cancelamentoAte: p.cancellation?.date_expiry ? Number(p.cancellation.date_expiry) : null,
    comissao: p.commission === undefined || p.commission === null ? null : Number(p.commission),
  }
}
export const ehMultiplicador = (c: { contractType: string }) => /^MULT(UP|DOWN)$/.test(c.contractType)

export function toOpenContract(p: Record<string, any>): OpenContract {
  const num = (v: any) => (v === null || v === undefined || v === '' ? null : Number(v))
  return {
    contractId: Number(p.contract_id),
    symbol: p.underlying_symbol ?? '',
    contractType: p.contract_type ?? '',
    buyPrice: Number(p.buy_price ?? 0),
    bidPrice: Number(p.bid_price ?? p.buy_price ?? 0),
    payout: Number(p.payout ?? 0),
    appMarkup: num(p.app_markup_amount ?? p.contract_details?.app_markup_amount),
    profit: Number(p.profit ?? 0),
    profitPercentage: Number(p.profit_percentage ?? 0),
    status: p.status ?? 'open',
    isValidToSell: p.is_valid_to_sell === 1,
    motivoSemVenda: p.is_valid_to_sell === 1 ? null : (p.validation_error ? String(p.validation_error) : null),
    isExpired: p.is_expired === 1,
    entrySpot: num(p.entry_spot),
    currentSpot: num(p.current_spot),
    exitSpot: num(p.exit_spot),
    barrier: num(p.barrier),
    longcode: p.longcode ?? '',
    shortcode: p.shortcode ?? '',
    currency: p.currency ?? 'USD',
    purchaseTime: Number(p.purchase_time ?? 0),
    startTime: Number(p.date_start ?? p.purchase_time ?? 0),
    expiryTime: Number(p.date_expiry ?? p.expiry_time ?? 0),
    pipSize: precisaoInformada(p.pip_size) ?? (p.underlying_symbol === 'R_75' ? 4 : 2),
    pipSizeInformado: precisaoInformada(p.pip_size) !== null,
    mult: dadosDoMultiplicador(p),
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
      // sem saldo na mensagem: NaN (nunca um zero falso no topo)
      balance: t.balance === undefined || t.balance === null ? Number.NaN : Number(t.balance),
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
  const res = await socket.send({ buy: proposalId, price }, 20_000, { imediato: true })
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

/**
 * Compra direto, sem cotar antes.
 *
 * O caminho normal e proposal -> buy: duas idas e voltas ate a Deriv. Num
 * contrato de 1 tick num indice de 1 segundo, essa espera custa o tick que
 * disparou a entrada. A Deriv aceita `buy: "1"` com os mesmos parametros do
 * proposal, resolvendo tudo numa chamada so — e o robo entra no tick certo.
 *
 * `precoMaximo` protege contra deslizamento: a compra e recusada se o custo
 * subir acima dele.
 */
export async function comprarDireto(
  socket: TeedsSocket,
  params: {
    symbol: string
    contractType: string
    amount: number
    duration: number
    durationUnit: string
    currency: string
    barrier?: string
  },
  precoMaximo?: number,
): Promise<BuyReceipt> {
  const res = await socket.send({
    buy: '1',
    price: precoMaximo ?? params.amount,
    parameters: {
      amount: params.amount,
      basis: 'stake',
      contract_type: params.contractType,
      currency: params.currency,
      duration: params.duration,
      duration_unit: params.durationUnit,
      underlying_symbol: params.symbol,
      ...(params.barrier !== undefined ? { barrier: params.barrier } : {}),
    },
  }, 20_000, { imediato: true })
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

/**
 * Central de contratos abertos.
 *
 * `proposal_open_contract` com `subscribe` e **sem** contract_id devolve um
 * stream de todos os contratos da conta. Uma assinatura so, compartilhada,
 * no lugar de uma por contrato — que era o que estourava o teto de 100
 * assinaturas da Deriv e deixava o robo esperando para sempre.
 */
type OuvinteContrato = (c: OpenContract) => void

interface CanalContratos {
  ouvintes: Set<OuvinteContrato>
  parar: (() => void) | null
  encerrar: ReturnType<typeof setTimeout> | null
}

const canaisContrato = new WeakMap<TeedsSocket, CanalContratos>()

export function assinarContratos(
  socket: TeedsSocket,
  onContrato: OuvinteContrato,
  onFalha?: (msg: string) => void,
): () => void {
  let canal = canaisContrato.get(socket)
  if (!canal) {
    canal = { ouvintes: new Set(), parar: null, encerrar: null }
    canaisContrato.set(socket, canal)
  }
  const c = canal
  c.ouvintes.add(onContrato)
  if (c.encerrar) { clearTimeout(c.encerrar); c.encerrar = null }

  if (!c.parar) {
    c.parar = socket.subscribe({ proposal_open_contract: 1 }, (msg) => {
      if (msg.error) {
        onFalha?.(msg.error.message)
        return
      }
      const p = msg.proposal_open_contract as Record<string, any> | undefined
      if (!p || !p.contract_id) return
      const contrato = toOpenContract(p)
      c.ouvintes.forEach((fn) => {
        try { fn(contrato) } catch { /* um ouvinte quebrado nao derruba os outros */ }
      })
    })
  }

  return () => {
    c.ouvintes.delete(onContrato)
    if (c.ouvintes.size > 0 || c.encerrar) return
    c.encerrar = setTimeout(() => {
      c.encerrar = null
      if (c.ouvintes.size > 0) return
      c.parar?.()
      c.parar = null
      canaisContrato.delete(socket)
    }, 5_000)
  }
}

/** Pergunta o estado de um contrato, sem abrir assinatura. */
export async function buscarContrato(
  socket: TeedsSocket,
  contractId: number,
): Promise<OpenContract> {
  const res = await socket.send({ proposal_open_contract: 1, contract_id: contractId })
  const p = res.proposal_open_contract as Record<string, any> | undefined
  if (!p || !p.contract_id) throw new Error('Contrato não encontrado')
  return toOpenContract(p)
}

/** Vende um contrato aberto. price 0 = a mercado. */
export async function sellContract(
  socket: TeedsSocket,
  contractId: number,
  price = 0,
): Promise<{ soldFor: number; balanceAfter: number; transactionId: number }> {
  const res = await socket.send({ sell: contractId, price }, 20_000, { imediato: true })
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

/** O markup do app que a Deriv informa na cotação: em contract_details (esquema oficial) ou no topo. */
function markupDaCotacao(p: Record<string, any>): number | null {
  const v = p.contract_details?.app_markup_amount ?? p.app_markup_amount
  return v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v)
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
): Promise<{ id: string; askPrice: number; payout: number; longcode: string; appMarkup: number | null }> {
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
  }, 20_000, { imediato: true })
  const p = res.proposal as Record<string, any>
  return {
    id: String(p.id),
    askPrice: Number(p.ask_price),
    payout: Number(p.payout),
    longcode: String(p.longcode ?? ''),
    // o markup oficial deste contrato, quando a Deriv informa na proposta
    // o esquema oficial da Deriv põe o markup dentro de contract_details ("The markup amount charged
    // on a client's stake amount"); até 30/10/2026 lia-se só no topo e nunca vinha (markup_oficial sempre false)
    appMarkup: markupDaCotacao(p),
  }
}

/* ------------------------------------------------------------ multiplicadores (30/10/2026) */

/** O que a Deriv aceita de multiplicador neste ativo; null = o ativo não tem multiplicador. */
export async function faixaDoMultiplicador(socket: TeedsSocket, simbolo: string): Promise<{ multiplicadores: number[]; cancelamentos: string[] } | null> {
  const res = await socket.send({ contracts_for: simbolo })
  const lista = ((res.contracts_for as any)?.available ?? []) as Array<Record<string, any>>
  const m = lista.find((c) => c.contract_type === 'MULTUP')
  if (!m) return null
  return {
    multiplicadores: ((m.multiplier_range ?? []) as unknown[]).map(Number).filter((n) => n > 0),
    cancelamentos: ((m.cancellation_range ?? []) as unknown[]).map(String),
  }
}

export interface CotacaoMultiplicador {
  id: string
  /** O que sai da conta: a entrada mais o cancelamento, se contratado. */
  askPrice: number
  comissao: number
  stopOut: LimiteDeSaida | null
  takeProfit: LimiteDeSaida | null
  stopLoss: LimiteDeSaida | null
  custoDoCancelamento: number | null
  appMarkup: number | null
  minimo: number | null
  maximo: number | null
}

/**
 * Cota um multiplicador. Sem prazo: a Deriv fecha sozinha quando a perda chega
 * à entrada (stop out), no take profit, no stop loss, ou quando a pessoa fecha.
 * Cancelamento e take profit/stop loss não andam juntos (regra da Deriv).
 */
export async function cotarMultiplicador(
  socket: TeedsSocket,
  params: { symbol: string; tipo: 'MULTUP' | 'MULTDOWN'; amount: number; currency: string; multiplier: number; takeProfit?: number | null; stopLoss?: number | null; cancellation?: string | null },
): Promise<CotacaoMultiplicador> {
  const limite: Record<string, number> = {}
  if (params.takeProfit) limite.take_profit = params.takeProfit
  if (params.stopLoss) limite.stop_loss = params.stopLoss
  const res = await socket.send({
    proposal: 1, amount: params.amount, basis: 'stake', contract_type: params.tipo, currency: params.currency,
    underlying_symbol: params.symbol, multiplier: params.multiplier,
    ...(params.cancellation ? { cancellation: params.cancellation } : Object.keys(limite).length ? { limit_order: limite } : {}),
  }, 20_000, { imediato: true })
  const p = res.proposal as Record<string, any>
  const lo = p.limit_order ?? {}
  const num = (v: any) => (v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
  return {
    id: String(p.id),
    askPrice: Number(p.ask_price),
    comissao: Number(p.commission ?? 0),
    stopOut: limiteDe(lo.stop_out), takeProfit: limiteDe(lo.take_profit), stopLoss: limiteDe(lo.stop_loss),
    custoDoCancelamento: num(p.cancellation?.ask_price),
    appMarkup: markupDaCotacao(p),
    minimo: num(p.validation_params?.stake?.min ?? p.contract_details?.minimum_stake),
    maximo: num(p.validation_params?.stake?.max ?? p.contract_details?.maximum_stake),
  }
}

/** Muda (ou tira, com null) o take profit e o stop loss de um multiplicador aberto. */
export async function atualizarLimites(socket: TeedsSocket, contractId: number, limites: { takeProfit: number | null; stopLoss: number | null }): Promise<void> {
  await socket.send({ contract_update: 1, contract_id: contractId, limit_order: { take_profit: limites.takeProfit, stop_loss: limites.stopLoss } }, 20_000, { imediato: true })
}

/** Desiste do multiplicador dentro do prazo do cancelamento contratado: a entrada volta. */
export async function cancelarContrato(socket: TeedsSocket, contractId: number): Promise<{ devolvido: number }> {
  const res = await socket.send({ cancel: contractId }, 20_000, { imediato: true })
  return { devolvido: Number((res.cancel as any)?.sold_for ?? 0) }
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
