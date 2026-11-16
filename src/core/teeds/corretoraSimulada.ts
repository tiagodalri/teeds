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
 *
 * Encerrar antes (16/11/2026, Tiago: "nas reais eu consigo encerrar antes com pagamento parcial, positivo
 * ou negativo; nas simuladas também, como os alunos; o resultado simulado vem só no final"): como na
 * Deriv, o Comprar/Vender por tempo encerra a qualquer momento pelo valor de agora; os de ticks e os de
 * dígito vão até o fim. Encerrada antes, a operação sai do roteiro: o resultado é o parcial.
 */
import { useSyncExternalStore } from 'react'
import { publicSocket, type TeedsSocket } from '../deriv/client'
import { requestProposal, type OpenContract } from '../deriv/trading'
import { fetchServerTime, subscribeTicksDaTela as subscribeTicks, ultimoPreco } from '../deriv/market'
import { contratoManual, entradaManual, operacaoTerminou } from '../som'
import { modoSimuladoAtivo, saldoSimuladoAgora, somarAoSaldoSimulado, somarNoLivro } from './modoSimulado'
// o roteiro da manual (16/11/2026): o resultado pedido de cada operação, e o preço da tela que o cumpre
import { esquecerContrato, ganha, limparPrecoSimulado, planejarContrato, situacaoDoContrato, TIPOS_DE_DIGITO, TIPOS_DE_DIRECAO } from './precoSimulado'
import { anotarResultado, desfazerCompra, usarNaCompra } from './roteiroManual'

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
  /** O epoch do último tick contado (um tick repetido numa reconexão não conta de novo). */
  ultimoEpoch?: number
  /** Variação típica de um tick (para estimar quanto a posição vale antes do fim). */
  passos: number[]
  parar: () => void
  /**
   * O valor de encerrar pela cotação da Deriv (16/11/2026, Tiago: "os valores de encerrar antes batem com a
   * Deriv?"): a cada ~2 s, a cotação de um contrato equivalente (mesmo pagamento, mesma distância da
   * barreira, o tempo que falta), menos o desconto da Deriv ao recomprar, medido na própria compra.
   */
  cotacao: { valor: number; em: number; chance: number } | null
  /** Quando chegou o último tick (Date.now): sem preço recente, não encerra. */
  ultimoTickEm: number
  pedindo: boolean
  /** Meia diferença entre compra e venda da Deriv, em fração do pagamento (medida numa cotação no preço). */
  margem: number | null
  margemMedida: boolean
}

const contratos = new Map<number, OpenContract>()
const andamento = new Map<number, EmAndamento>()
let foto: OpenContract[] = []
const ouvintes = new Set<() => void>()
// ids que não repetem os de outro dia (a lista "Suas últimas entradas" separa pelo id)
let proximoId = 7_000_000_000_000 + (Date.now() % 1_000_000_000_000)

/*
  Revisão de 16/11/2026 (Tiago: "faça uma revisão detalhada e completa, estamos encontrando muitos gargalos").
  O relógio: a compra e o vencimento seguem a hora da Deriv (o epoch dos ticks), não a do computador. Um
  relógio alguns segundos atrasado fazia a entrada ser um tick anterior ao clique e o contrato vencer antes.
*/
let diferencaDoRelogio: number | null = null
function acertarRelogio(): void {
  void fetchServerTime(publicSocket).then((t) => { if (Number.isFinite(t) && t > 0) diferencaDoRelogio = t - Date.now() / 1000 }).catch(() => { /* fica com o dos ticks */ })
}
if (typeof window !== 'undefined') { acertarRelogio(); window.setInterval(acertarRelogio, 10 * 60_000) }
/** A hora da Deriv agora (s): pelo relógio acertado; sem ele, o do computador. */
const agoraNaDeriv = () => Date.now() / 1000 + (diferencaDoRelogio ?? 0)

/*
  O modo desligou no meio de uma compra (a cotação demora): a compra desiste antes de mexer no saldo.
  Cada limpeza muda a geração; a compra confere a dela depois da cotação.
*/
let geracao = 0

/*
  Posições abertas quando a página recarrega ou o modo desliga: a entrada volta ao saldo (a operação "não
  aconteceu"). Guardadas por aba (sessionStorage): recarregar devolve; outra aba não mexe nas desta.
*/
const CHAVE_ABERTAS = 'simulacao.manual.abertas'
function lerAbertas(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem(CHAVE_ABERTAS) || '{}') as Record<string, number> } catch { return {} }
}
function gravarAbertas(m: Record<string, number>): void {
  try { if (Object.keys(m).length) sessionStorage.setItem(CHAVE_ABERTAS, JSON.stringify(m)); else sessionStorage.removeItem(CHAVE_ABERTAS) } catch { /* sem armazenamento */ }
}
const anotarAberta = (id: number, entrada: number) => gravarAbertas({ ...lerAbertas(), [id]: entrada })
const tirarAberta = (id: number) => { const m = lerAbertas(); delete m[id]; gravarAbertas(m) }
if (typeof window !== 'undefined') {
  const sobraram = lerAbertas()
  const total = Object.values(sobraram).reduce((x, v) => x + (Number(v) || 0), 0)
  if (total > 0) somarAoSaldoSimulado(total)
  gravarAbertas({})
}

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
  geracao++
  // as abertas devolvem a entrada (sem isso, o saldo ficava menor e a posição sumia)
  andamento.forEach((a) => { a.parar(); if (a.c.status === 'open') somarAoSaldoSimulado(a.c.buyPrice) })
  andamento.clear()
  contratos.clear()
  gravarAbertas({})
  limparPrecoSimulado()
  avisar()
}

/** Segundos entre ticks do ativo: os "(1s)" têm um por segundo, os outros um a cada 2 s. */
const segundosPorTick = (simbolo: string) => (/^1HZ/.test(simbolo) ? 1 : 2)

/** Chance de ganhar daqui até o fim, só para o "quanto vale agora" da posição. */
function chanceAgora(a: EmAndamento, spot: number, agora: number): number {
  const c = a.c
  if (c.entrySpot === null) return 0.5
  if (TIPOS_DE_DIGITO.includes(c.contractType)) {
    const todos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    return todos.filter((d) => ganha(c.contractType, Number(`0.${d}`), c.barrier ?? 0, 1)).length / 10
  }
  const restante = a.unidade === 't' ? Math.max(1, a.duracao - a.ticksDesdeEntrada) : Math.max(1, (c.expiryTime - agora) / segundosPorTick(c.symbol))
  const media = a.passos.length ? a.passos.reduce((s, x) => s + x * x, 0) / a.passos.length : 0
  const sigma = Math.sqrt(media) * Math.sqrt(restante) || 1e-9
  const z = (spot - (c.barrier ?? c.entrySpot)) / sigma
  const p = 1 / (1 + Math.exp(-1.7 * z))
  return /^PUT/.test(c.contractType) ? 1 - p : p
}

function liquidar(a: EmAndamento, saida: number, epoch: number) {
  a.parar()
  andamento.delete(a.c.contractId)
  tirarAberta(a.c.contractId)
  const c = a.c
  const venceu = ganha(c.contractType, saida, c.barrier ?? (c.entrySpot ?? saida), c.pipSize)
  const lucro = venceu ? r2(c.payout - c.buyPrice) : -c.buyPrice
  if (venceu) somarAoSaldoSimulado(c.payout)
  esquecerContrato(c.contractId)
  anotarResultado(c.contractId, venceu, lucro)
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

/** O menor prazo que a Deriv cota no Comprar/Vender dos sintéticos (abaixo dele, vale o cálculo daqui). */
const PRAZO_MINIMO_DA_COTACAO = 15

/**
 * Pede à Deriv quanto vale a posição agora: a cotação de um contrato equivalente pelo pagamento dela, com a
 * barreira na mesma distância do preço que a tela mostra (com o roteiro, o preço da tela anda desviado do real,
 * e a Deriv cota a partir do real: a distância é o que vale). Sem comprar nada (linha pública).
 */
async function cotarVenda(a: EmAndamento, precoNaTela: number): Promise<void> {
  const c = a.c
  if (a.pedindo || c.barrier === null) return
  const restante = Math.floor(c.expiryTime - agoraNaDeriv())
  if (restante < PRAZO_MINIMO_DA_COTACAO) return
  a.pedindo = true
  // a chance no preço em que a cotação foi pedida: entre uma cotação e outra, o valor anda com o preço
  const chanceNaHora = chanceAgora(a, precoNaTela, agoraNaDeriv())
  const tipo = /^CALL/.test(c.contractType) ? 'CALL' : 'PUT'
  const casas = c.pipSize || 2
  const pedir = (barreira?: string) => requestProposal(publicSocket, {
    symbol: c.symbol, contractType: tipo, amount: c.payout, basis: 'payout', currency: c.currency,
    duration: restante, durationUnit: 's', ...(barreira !== undefined ? { barrier: barreira } : {}),
  })
  try {
    // o desconto ao recomprar: numa cotação no preço de agora (linha pública, sem o markup da plataforma, que
    // só entra na compra), o preço justo é metade do pagamento; o que passa disso é a margem da Deriv
    if (!a.margemMedida) {
      const base = (await pedir()).askPrice
      a.margem = Math.min(0.1, Math.max(0, base / c.payout - 0.5))
      a.margemMedida = true
    }
    const d = Number((c.barrier - precoNaTela).toFixed(casas))
    const barreira = Math.abs(d) < Math.pow(10, -casas) ? undefined : `${d > 0 ? '+' : '-'}${Math.abs(d).toFixed(casas)}`
    const p = await pedir(barreira)
    const valor = Math.min(c.payout, Math.max(0, r2(p.askPrice - 2 * (a.margem ?? 0) * c.payout)))
    a.cotacao = { valor, em: Date.now(), chance: chanceNaHora }
  } catch { /* segue com o cálculo daqui até a próxima */ } finally { a.pedindo = false }
}

/** Como na Deriv: só o Comprar/Vender por tempo encerra antes (ticks e dígitos vão até o fim). */
export const podeEncerrarAntes = (tipo: string, unidade: string) => TIPOS_DE_DIRECAO.includes(tipo) && unidade !== 't'

/**
 * Encerrar antes: vende pelo valor de agora (o mesmo que o cartão mostra), positivo ou negativo. Sai do
 * roteiro: o preço da tela volta a colar no real, e o resultado é o parcial.
 */
export function encerrarSimulado(contractId: number): { soldFor: number } {
  const a = andamento.get(contractId)
  if (!a || a.c.status !== 'open') throw new Error('Esta posição já fechou.')
  if (!a.c.isValidToSell) throw new Error(podeEncerrarAntes(a.c.contractType, a.unidade) ? 'Aguarde um instante: o preço ainda não chegou.' : 'Este contrato vai até o vencimento (ticks e dígitos não encerram antes).')
  // no vencimento (ou com o preço parado), a Deriv não recompra: o valor de agora seria de um preço velho
  if (agoraNaDeriv() >= a.c.expiryTime - 1) throw new Error('A operação já está vencendo: aguarde o resultado.')
  if (Date.now() - a.ultimoTickEm > 4000) throw new Error('Aguarde um instante: o preço do ativo não chegou agora.')
  a.parar()
  andamento.delete(contractId)
  tirarAberta(contractId)
  esquecerContrato(contractId)
  const c = a.c
  const venda = Math.max(0, r2(c.bidPrice))
  const lucro = r2(venda - c.buyPrice)
  somarAoSaldoSimulado(venda)
  const final: OpenContract = {
    ...c, status: 'sold', isExpired: false, isValidToSell: false, exitSpot: c.currentSpot,
    profit: lucro, bidPrice: venda, profitPercentage: r2((lucro / c.buyPrice) * 100),
  }
  contratos.set(contractId, final)
  avisar()
  setTimeout(() => { if (contratos.get(contractId)?.status !== 'open') { contratos.delete(contractId); avisar() } }, 7000)
  operacaoTerminou(contractId, lucro)
  anotarResultado(contractId, lucro > 0, lucro)
  somarNoLivro('manuais', {
    quando: new Date().toISOString(), origem: 'manual', id: 'manual', nome: 'Manual', ativo: c.symbol,
    tipo: c.contractType, entrada: c.buyPrice, pagamento: venda, resultado: lucro, ganhou: lucro > 0,
  })
  return { soldFor: venda }
}

/**
 * A compra simulada. Devolve o mesmo que a compra de verdade devolve à tela
 * (id, valor pago, pagamento). Recusa se o modo não estiver ligado.
 */
export async function comprarSimulado(pedido: {
  simbolo: string; tipo: string; valor: number; moeda: string
  duration: number; durationUnit: string; barrier?: string
  /**
   * A conexão da conta Deriv de quem está na tela, quando houver (16/11/2026, Tiago: "na boleta aparece que
   * se ganhar recebe 17,83, e na posição 19 e pouco"): a cotação pela conta inclui o markup da plataforma,
   * como a boleta e como o aluno recebe; a linha pública não tem markup e pagava a mais.
   */
  socket?: TeedsSocket | null
}): Promise<{ contractId: number; buyPrice: number; payout: number }> {
  if (!modoSimuladoAtivo()) throw new Error('O modo simulado está desligado.')
  if (!tipoSimulavel(pedido.tipo)) throw new Error('Este tipo de contrato ainda não tem operação simulada. Use Comprar/Vender ou os dígitos.')
  const minhaGeracao = geracao
  const pedirCotacao = () => requestProposal(pedido.socket ?? publicSocket, {
    symbol: pedido.simbolo, contractType: pedido.tipo, amount: pedido.valor, currency: pedido.moeda,
    duration: pedido.duration, durationUnit: pedido.durationUnit, ...(pedido.barrier !== undefined ? { barrier: pedido.barrier } : {}),
  })
  // a conexão pode estar abrindo (ou reconectando): espera até ~6 s antes de desistir
  let p: Awaited<ReturnType<typeof requestProposal>> | null = null
  for (let tentativa = 0; !p; tentativa++) {
    try { p = await pedirCotacao() } catch (e) {
      if (!/LinhaFechada/.test((e as Error).message) || tentativa >= 12) throw e
      await new Promise((r) => setTimeout(r, 500))
    }
  }
  // o modo desligou (ou limpou) durante a cotação: desiste sem mexer no saldo nem no roteiro
  if (!modoSimuladoAtivo() || geracao !== minhaGeracao) throw new Error('O modo simulado foi desligado durante a compra.')
  if (p.askPrice > saldoSimuladoAgora() + 1e-9) throw new Error('InsufficientBalance: saldo simulado insuficiente para esta entrada.')
  // a hora da compra é a da Deriv: o último tick já visto do ativo ou o relógio acertado, o que for maior
  const visto = ultimoPreco(pedido.simbolo, publicSocket)?.epoch ?? 0
  const agora = Math.max(visto, Math.floor(agoraNaDeriv()))
  const id = proximoId++
  const porTempo = pedido.durationUnit !== 't'
  const digito = TIPOS_DE_DIGITO.includes(pedido.tipo)
  const sPorTick = segundosPorTick(pedido.simbolo)
  // o código curto como o da Deriv: o cartão lê "_5T_" para mostrar "5 cotações" em vez de relógio
  const shortcode = porTempo ? '' : `${pedido.tipo}_${pedido.simbolo}_${p.payout}_${agora}_${pedido.duration}T_${digito ? (pedido.barrier ?? '0') : 'S0P'}_0`
  const c: OpenContract = {
    contractId: id, symbol: pedido.simbolo, contractType: pedido.tipo, buyPrice: p.askPrice, bidPrice: p.askPrice, payout: p.payout,
    profit: 0, profitPercentage: 0, status: 'open', isValidToSell: false,
    motivoSemVenda: podeEncerrarAntes(pedido.tipo, pedido.durationUnit) ? 'wait: aguardando o primeiro preço' : 'Este contrato vai até o vencimento (como na Deriv: ticks e dígitos não encerram antes).',
    isExpired: false, entrySpot: null, currentSpot: null, exitSpot: null,
    barrier: digito && pedido.barrier !== undefined ? Number(pedido.barrier) : null,
    longcode: p.longcode, shortcode, currency: pedido.moeda, purchaseTime: agora, startTime: agora,
    expiryTime: porTempo ? agora + pedido.duration * (SEGUNDOS[pedido.durationUnit] ?? 1) : agora + Math.max(1, pedido.duration) * sPorTick,
    pipSize: 2, pipSizeInformado: false, appMarkup: p.appMarkup,
  }
  const a: EmAndamento = { c, duracao: pedido.duration, unidade: pedido.durationUnit, barreiraPedida: pedido.barrier, ticksDesdeEntrada: 0, ultimo: null, passos: [], parar: () => {},
    // até medir a margem da Deriv (na 1ª cotação de venda), a típica dos sintéticos
    cotacao: null, pedindo: false, margem: 0.012, margemMedida: false, ultimoTickEm: 0 }
  // tudo o que pode falhar vem antes de debitar
  const doRoteiro = usarNaCompra(id)
  try {
    // a entrada e a saída saem do preço da tela (uma fonte só); "mercado" só acompanha
    planejarContrato({
      id, simbolo: pedido.simbolo, tipo: pedido.tipo, duracao: pedido.duration, unidade: pedido.durationUnit, barreiraPedida: pedido.barrier,
      compradoEm: agora, expiraEm: c.expiryTime, desejo: doRoteiro,
    })
    a.parar = subscribeTicks(pedido.simbolo, (t) => aoTick(id, t), publicSocket)
  } catch (e) {
    esquecerContrato(id)
    desfazerCompra(id)
    throw e
  }
  somarAoSaldoSimulado(-p.askPrice)
  anotarAberta(id, p.askPrice)
  contratos.set(id, c)
  andamento.set(id, a)
  contratoManual(id)
  entradaManual()
  avisar()
  // no vencimento, o "Encerrar agora" desliga mesmo sem tick novo
  if (porTempo) window.setTimeout(() => {
    const x = andamento.get(id)
    if (x && x.c.isValidToSell) { x.c = { ...x.c, isValidToSell: false, motivoSemVenda: 'wait: vencendo' }; contratos.set(id, x.c); avisar() }
  }, Math.max(0, (c.expiryTime - 1 - agoraNaDeriv()) * 1000))
  return { contractId: id, buyPrice: p.askPrice, payout: p.payout }
}

/** Cada tick do ativo (já com o preço da tela): a entrada e a saída vêm do preço da tela. */
function aoTick(id: number, t: { epoch: number; quote: number; pipSize: number }): void {
  const atual = andamento.get(id)
  if (!atual || !t.epoch) return
  const sit = situacaoDoContrato(id)
  if (!sit) return
  atual.ultimoTickEm = Date.now()
  const casas = t.pipSize || atual.c.pipSize
  if (sit.entrada !== null && atual.c.entrySpot === null) {
    atual.c = { ...atual.c, entrySpot: sit.entrada, currentSpot: sit.entrada, pipSize: casas, pipSizeInformado: true, barrier: sit.barreira, startTime: sit.epochEntrada ?? t.epoch }
  }
  if (sit.saiu) {
    if (sit.saida !== null) liquidar(atual, sit.saida, sit.epochSaida ?? t.epoch)
    return
  }
  if (atual.c.entrySpot === null || t.epoch < (sit.epochEntrada ?? 0)) { contratos.set(id, atual.c); avisar(); return }
  // um tick novo (repetido numa reconexão não conta de novo)
  if (t.epoch > (atual.ultimoEpoch ?? 0)) {
    if (atual.ultimo !== null) atual.passos = [...atual.passos, t.quote - atual.ultimo].slice(-40)
    if (t.epoch > (sit.epochEntrada ?? t.epoch)) atual.ticksDesdeEntrada += 1
    atual.ultimo = t.quote
    atual.ultimoEpoch = t.epoch
  }
  atual.c = { ...atual.c, currentSpot: t.quote }
  // como na Deriv: o Comprar/Vender por tempo pode encerrar antes, até perto do fim
  const vende = podeEncerrarAntes(atual.c.contractType, atual.unidade) && t.epoch < atual.c.expiryTime - 1 && agoraNaDeriv() < atual.c.expiryTime - 1
  // quanto vale agora: a cotação da Deriv (renovada a cada ~2,5 s); sem ela (últimos 15 s, ou falhou), o cálculo
  // daqui com o mesmo desconto da Deriv ao recomprar (maior no meio, some quando o resultado já está decidido)
  const chance = chanceAgora(atual, t.quote, t.epoch)
  const margem = atual.margem ?? 0
  let valeAgora = r2(Math.max(0, atual.c.payout * (chance - 2 * margem * 4 * chance * (1 - chance))))
  if (vende) {
    // a última cotação da Deriv, andando com o preço de cada tick desde que foi pedida
    if (atual.cotacao && Date.now() - atual.cotacao.em < 6000) {
      valeAgora = r2(Math.min(atual.c.payout, Math.max(0, atual.cotacao.valor + atual.c.payout * (chance - atual.cotacao.chance))))
    }
    if (!atual.cotacao || Date.now() - atual.cotacao.em > 2500) void cotarVenda(atual, t.quote)
  }
  atual.c = { ...atual.c, isValidToSell: vende, motivoSemVenda: vende ? null : atual.c.motivoSemVenda, bidPrice: valeAgora, profit: r2(valeAgora - atual.c.buyPrice), profitPercentage: r2(((valeAgora - atual.c.buyPrice) / atual.c.buyPrice) * 100) }
  contratos.set(id, atual.c)
  avisar()
}
