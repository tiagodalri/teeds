/**
 * Operações manuais no modo simulado (12/11/2026).
 *
 * A boleta e a Multitela compram por aqui quando o modo simulado está ligado:
 *  - a cotação é a da Deriv (proposal pela linha pública, que não compra nada):
 *    o pagamento é o mesmo que a corretora daria;
 *  - o preço é o do mercado de verdade (ticks públicos do ativo), então o
 *    gráfico, a entrada e a saída batem com o que se vê na tela;
 *  - o dinheiro é o do saldo simulado: a entrada sai na compra, o pagamento
 *    entra se ganhar.
 * Nada é comprado na Deriv, nada vai ao banco nem ao Monitoramento.
 *
 * Contratos aceitos: Comprar/Vender (CALL/PUT, com ou sem barreira) e os de
 * dígito. Os demais recusam com aviso, para nunca simular errado.
 */
import { useSyncExternalStore } from 'react'
import { publicSocket } from '../deriv/client'
import { requestProposal, type OpenContract } from '../deriv/trading'
import { subscribeTicks } from '../deriv/market'
import { contratoManual, entradaManual, operacaoTerminou } from '../som'
import { modoSimuladoAtivo, saldoSimuladoAgora, somarAoSaldoSimulado, somarNoLivro } from './modoSimulado'

const TIPOS_DE_DIGITO = ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD']
const TIPOS_DE_DIRECAO = ['CALL', 'PUT', 'CALLE', 'PUTE']
export const tipoSimulavel = (tipo: string) => TIPOS_DE_DIGITO.includes(tipo) || TIPOS_DE_DIRECAO.includes(tipo)

const SEGUNDOS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 }
const r2 = (x: number) => Math.round(x * 100) / 100

interface EmAndamento {
  c: OpenContract
  duracao: number
  unidade: string
  /** Barreira como veio do pedido: "+0.25" (relativa), "1234.5" (absoluta) ou o dígito. */
  barreiraPedida?: string
  ticksDesdeEntrada: number
  ultimo: number | null
  /** Variação típica de um tick (para estimar quanto a posição vale antes do fim). */
  passos: number[]
  parar: () => void
}

const contratos = new Map<number, OpenContract>()
const andamento = new Map<number, EmAndamento>()
let foto: OpenContract[] = []
const ouvintes = new Set<() => void>()
let proximoId = 7_000_000_000_000 + Math.floor(Math.random() * 1_000_000)

function avisar() {
  foto = [...contratos.values()].sort((a, b) => b.purchaseTime - a.purchaseTime)
  ouvintes.forEach((f) => f())
}
/** Para as provas: a lista de agora, sem React. */
export const contratosSimuladosAgora = () => foto
export function useContratosSimulados(): OpenContract[] {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => foto, () => foto)
}
/** O modo desligou: para de acompanhar e esquece as posições simuladas. */
export function limparContratosSimulados(): void {
  andamento.forEach((a) => a.parar())
  andamento.clear()
  contratos.clear()
  avisar()
}

const digitoDe = (preco: number, casas: number) => { const t = preco.toFixed(casas); return Number(t[t.length - 1]) }
function ganha(tipo: string, saida: number, barreira: number, casas: number): boolean {
  const d = digitoDe(saida, casas)
  switch (tipo) {
    case 'CALL': return saida > barreira
    case 'PUT': return saida < barreira
    case 'CALLE': return saida >= barreira
    case 'PUTE': return saida <= barreira
    case 'DIGITMATCH': return d === barreira
    case 'DIGITDIFF': return d !== barreira
    case 'DIGITOVER': return d > barreira
    case 'DIGITUNDER': return d < barreira
    case 'DIGITEVEN': return d % 2 === 0
    case 'DIGITODD': return d % 2 === 1
    default: return false
  }
}
function barreiraDe(a: EmAndamento, entrada: number): number {
  const tipo = a.c.contractType
  const b = a.barreiraPedida
  if (TIPOS_DE_DIGITO.includes(tipo)) return Number(b ?? 0)
  if (b === undefined || b === '') return entrada
  return /^[+-]/.test(b) ? entrada + Number(b) : Number(b)
}
/** Chance de ganhar daqui até o fim, só para o "quanto vale agora" da posição. */
function chanceAgora(a: EmAndamento, spot: number, agora: number): number {
  const c = a.c
  if (c.entrySpot === null) return 0.5
  if (TIPOS_DE_DIGITO.includes(c.contractType)) {
    const todos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    return todos.filter((d) => ganha(c.contractType, Number(`0.${d}`), c.barrier ?? 0, 1)).length / 10
  }
  const restante = a.unidade === 't' ? Math.max(1, a.duracao - a.ticksDesdeEntrada) : Math.max(1, (c.expiryTime - agora) / 2)
  const media = a.passos.length ? a.passos.reduce((s, x) => s + x * x, 0) / a.passos.length : 0
  const sigma = Math.sqrt(media) * Math.sqrt(restante) || 1e-9
  const z = (spot - (c.barrier ?? c.entrySpot)) / sigma
  const p = 1 / (1 + Math.exp(-1.7 * z))
  return /^PUT/.test(c.contractType) ? 1 - p : p
}

function liquidar(a: EmAndamento, saida: number, epoch: number) {
  a.parar()
  andamento.delete(a.c.contractId)
  const c = a.c
  const venceu = ganha(c.contractType, saida, c.barrier ?? (c.entrySpot ?? saida), c.pipSize)
  const lucro = venceu ? r2(c.payout - c.buyPrice) : -c.buyPrice
  if (venceu) somarAoSaldoSimulado(c.payout)
  const final: OpenContract = {
    ...c, status: venceu ? 'won' : 'lost', isExpired: true, isValidToSell: false, exitSpot: saida, currentSpot: saida,
    profit: lucro, bidPrice: venceu ? c.payout : 0, profitPercentage: r2((lucro / c.buyPrice) * 100),
  }
  contratos.set(c.contractId, final)
  avisar()
  // como a lista de posições da conta: a encerrada sai em 7 s (a tela guarda a cópia dela no gráfico e no placar)
  setTimeout(() => { if (contratos.get(c.contractId)?.status !== 'open') { contratos.delete(c.contractId); avisar() } }, 7000)
  operacaoTerminou(c.contractId, lucro)
  somarNoLivro('manuais', {
    quando: new Date(epoch * 1000).toISOString(), origem: 'manual', id: 'manual', nome: 'Manual', ativo: c.symbol,
    tipo: c.contractType, entrada: c.buyPrice, pagamento: venceu ? c.payout : 0, resultado: lucro, ganhou: venceu,
  })
}

/**
 * A compra simulada. Devolve o mesmo que a compra de verdade devolve à tela
 * (id, valor pago, pagamento). Recusa se o modo não estiver ligado.
 */
export async function comprarSimulado(pedido: {
  simbolo: string; tipo: string; valor: number; moeda: string
  duration: number; durationUnit: string; barrier?: string
}): Promise<{ contractId: number; buyPrice: number; payout: number }> {
  if (!modoSimuladoAtivo()) throw new Error('O modo simulado está desligado.')
  if (!tipoSimulavel(pedido.tipo)) throw new Error('Este tipo de contrato ainda não tem operação simulada. Use Comprar/Vender ou os dígitos.')
  const pedirCotacao = () => requestProposal(publicSocket, {
    symbol: pedido.simbolo, contractType: pedido.tipo, amount: pedido.valor, currency: pedido.moeda,
    duration: pedido.duration, durationUnit: pedido.durationUnit, ...(pedido.barrier !== undefined ? { barrier: pedido.barrier } : {}),
  })
  // a linha pública pode estar abrindo (ou reconectando): espera até ~6 s antes de desistir
  let p: Awaited<ReturnType<typeof requestProposal>> | null = null
  for (let tentativa = 0; !p; tentativa++) {
    try { p = await pedirCotacao() } catch (e) {
      if (!/LinhaFechada/.test((e as Error).message) || tentativa >= 12) throw e
      if (tentativa === 0) { const parar = subscribeTicks(pedido.simbolo, () => {}, publicSocket); setTimeout(parar, 8000) }
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  if (p.askPrice > saldoSimuladoAgora() + 1e-9) throw new Error('InsufficientBalance: saldo simulado insuficiente para esta entrada.')
  somarAoSaldoSimulado(-p.askPrice)
  const agora = Math.floor(Date.now() / 1000)
  const id = proximoId++
  const porTempo = pedido.durationUnit !== 't'
  const c: OpenContract = {
    contractId: id, symbol: pedido.simbolo, contractType: pedido.tipo, buyPrice: p.askPrice, bidPrice: p.askPrice, payout: p.payout,
    profit: 0, profitPercentage: 0, status: 'open', isValidToSell: false, motivoSemVenda: 'No modo simulado a posição vai até o vencimento.',
    isExpired: false, entrySpot: null, currentSpot: null, exitSpot: null,
    barrier: TIPOS_DE_DIGITO.includes(pedido.tipo) && pedido.barrier !== undefined ? Number(pedido.barrier) : null,
    longcode: p.longcode, shortcode: '', currency: pedido.moeda, purchaseTime: agora, startTime: agora,
    expiryTime: porTempo ? agora + pedido.duration * (SEGUNDOS[pedido.durationUnit] ?? 1) : agora + pedido.duration * 2,
    pipSize: 2, pipSizeInformado: false, appMarkup: p.appMarkup,
  }
  const a: EmAndamento = { c, duracao: pedido.duration, unidade: pedido.durationUnit, barreiraPedida: pedido.barrier, ticksDesdeEntrada: 0, ultimo: null, passos: [], parar: () => {} }
  contratos.set(id, c)
  andamento.set(id, a)
  contratoManual(id)
  entradaManual()
  avisar()
  a.parar = subscribeTicks(pedido.simbolo, (t) => {
    const atual = andamento.get(id)
    if (!atual || !t.epoch || t.epoch <= atual.c.purchaseTime) return
    const casas = t.pipSize || atual.c.pipSize
    if (atual.ultimo !== null) atual.passos = [...atual.passos, t.quote - atual.ultimo].slice(-40)
    // o fim de um contrato por tempo é o último preço até o vencimento
    if (porTempo && atual.c.entrySpot !== null && t.epoch > atual.c.expiryTime) { liquidar(atual, atual.ultimo ?? t.quote, atual.c.expiryTime); return }
    atual.ultimo = t.quote
    if (atual.c.entrySpot === null) {
      const barreira = barreiraDe(atual, t.quote)
      atual.c = { ...atual.c, entrySpot: t.quote, currentSpot: t.quote, pipSize: casas, pipSizeInformado: true, barrier: barreira, startTime: t.epoch,
        ...(porTempo ? {} : { expiryTime: t.epoch + atual.duracao * 2 }) }
    } else {
      atual.ticksDesdeEntrada += 1
      if (!porTempo && atual.ticksDesdeEntrada >= atual.duracao) { liquidar(atual, t.quote, t.epoch); return }
      if (porTempo && t.epoch === atual.c.expiryTime) { liquidar(atual, t.quote, t.epoch); return }
      atual.c = { ...atual.c, currentSpot: t.quote }
    }
    const valeAgora = r2(atual.c.payout * chanceAgora(atual, t.quote, t.epoch))
    atual.c = { ...atual.c, bidPrice: valeAgora, profit: r2(valeAgora - atual.c.buyPrice), profitPercentage: r2(((valeAgora - atual.c.buyPrice) / atual.c.buyPrice) * 100) }
    contratos.set(id, atual.c)
    avisar()
  }, publicSocket)
  return { contractId: id, buyPrice: p.askPrice, payout: p.payout }
}
