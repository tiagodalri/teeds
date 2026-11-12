/**
 * Sessão simulada (12/11/2026, Tiago: "no dia a dia operacional surgem
 * situações e sequências boas ou ruins nas operações com as I.A. e não dá
 * para ficar arriscando a todo momento para esperar essas situações
 * acontecerem e gravar a aula. Preciso de um motor de operações simulado,
 * assim como o relatório: escolher a I.A., o resultado final, a quantidade
 * de operações, a maior sequência de perda, entrada, stop, gain").
 *
 * Só para administradores da marca. Nada sai deste navegador: nenhuma
 * compra na Deriv, nada no banco, nada no servidor, nada nos 10%.
 *
 * Duas peças:
 *  - `Caixa`: as contas do motor (engine.ts), operação por operação — piso
 *    da entrada, teto da plataforma, aparo no stop, saldo, escada de
 *    recuperação pela própria estratégia (`proximoValor`), meta e stop. A
 *    única diferença para o motor de verdade é QUEM decide se a operação
 *    ganhou: aqui é o roteiro.
 *  - `Ensaio`: o motor tick a tick, com um mercado inventado. Os dígitos
 *    saem de um passeio aleatório que começa no preço real do ativo; só o
 *    dígito de saída de cada contrato é escolhido, para bater com o roteiro.
 *    A estratégia decide quando entra (loss virtual, sequência, troca de
 *    contrato da Raptor) exatamente como no motor.
 *
 * A cabine (RobotLive) recebe um EstadoMotor igual ao do servidor, então a
 * tela é a mesma que o aluno vê. A tag "Sessão simulada" fica sempre à vista.
 */
import { ESTRATEGIAS_LOCAIS, nomeDoRoboNaMarca, type Modo } from '../deriv/strategies'
import type { ConfigEstrategia, Contexto, EstadoMotor, Estrategia, OperacaoMotor, Registro, EmCurso } from '../deriv/engine'
import { configDeReferencia, parametrosPadrao, type ParametrosDoRobo } from '../deriv/parametros'
import { PAGAMENTO_POR_DOLAR } from '../deriv/escada'
import { MARCA } from '../../marca'

/* ------------------------------------------------------------ as I.A. */

/** As I.A. da GlobalFly, na ordem da vitrine. */
export const IAS_DA_SESSAO = ['goreme', 'falcon', 'legacy', 'superior5', 'ag2'] as const
export const estrategiaDa = (id: string): Estrategia => ESTRATEGIAS_LOCAIS.find((e) => e.id === id) ?? ESTRATEGIAS_LOCAIS[0]
export const nomeDaIa = (id: string) => nomeDoRoboNaMarca(estrategiaDa(id), MARCA)

/** As regras em vigor de cada I.A. (catálogo); sem elas, o padrão do código. */
let regras: Record<string, ParametrosDoRobo> = {}
let versaoRegras = 0
export function definirRegrasDaSessao(itens: Array<{ id: string; parametros?: ParametrosDoRobo }> | null): number {
  const novas: Record<string, ParametrosDoRobo> = {}
  for (const i of itens ?? []) if (i.parametros) novas[i.id] = i.parametros
  if (JSON.stringify(novas) !== JSON.stringify(regras)) { regras = novas; versaoRegras++ }
  return versaoRegras
}
export const parametrosDa = (id: string): ParametrosDoRobo => regras[id] ?? parametrosPadrao(id)

/* --------------------------------------------------------- o roteiro */

export type Fim = 'meta' | 'stop' | 'desligou'
export type Momento = 'comeco' | 'meio' | 'fim'
/** Um trecho da sessão: do play até ela parar. O segundo é "religou depois". */
export interface Trecho {
  /** Meta de ganho da sessão (resultado acumulado). 0 = sem meta. */
  meta: number
  /** Limite de perda da sessão (resultado acumulado). 0 = sem limite. */
  stop: number
  fim: Fim
  /** Só quando desliga: o resultado acumulado da sessão nesse momento. */
  resultado: number
  /** Operações deste trecho. */
  operacoes: number
  /** A maior sequência de perdas deste trecho. */
  sequencia: number
  momento: Momento
  /** % de operações ganhas que o trecho deve ter. Vazio = o que a I.A. fizer. */
  acerto?: number | null
  /**
   * A sessão natural que a sugestão rodou (ganhou/perdeu de cada operação). Enquanto os números do
   * trecho forem os dela (mesma assinatura), o plano é exatamente essa sessão: o pedido fecha sempre.
   */
  natural?: { assinatura: string; resultados: boolean[] }
}
export interface Roteiro {
  versao: 1
  /** A sessão (modo simulado): editar mantém o id e reescreve as operações dela no relatório. */
  id?: string
  nome: string
  ia: string
  conta: 'real' | 'demo'
  /** Saldo da conta antes do play. */
  saldo: number
  /** A entrada do cliente (o degrau 0 da escada). */
  entrada: number
  trechos: Trecho[]
  /** Muda a cada "Sortear de novo": a mesma estrutura com outra ordem. */
  semente: number
  /** Ganhou/perdeu escolhido na fita, por trecho (substitui o gerador). */
  fita?: boolean[][]
  /** Modo da recuperação (só nas I.A. que têm o agressivo). */
  modo?: Modo
  /** Loss virtual escolhido (I.A. com loss virtual). Vazio = o publicado no painel. */
  lossVirtual?: number | null
  /** Valor máximo por entrada do cliente (0 = sem). */
  valorMaximo?: number
  /** Segundos em média entre uma operação e a outra. Vazio = o ritmo natural da I.A. no mercado. */
  ritmo?: number | null
}

const r2 = (x: number) => Math.round(x * 100) / 100
/** A Deriv devolve o pagamento em centavos; meio centavo sobe (o mesmo de escada.ts). */
const centavos = (v: number) => Math.round(v * 100 + 1e-6) / 100
const ENTRADA_MINIMA = 0.35
const MOEDA = 'USD'
const din = (v: number) => `${MOEDA} ${v.toFixed(2)}`

/** Sorteio com semente (mulberry32): o mesmo roteiro dá sempre a mesma sessão. */
export function sorteio(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function sementeDe(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/* ------------------------------------------- contratos de dígito */

/** Os dígitos que fazem o contrato ganhar. */
export function digitosQueGanham(tipo: string, b = 5): number[] {
  const todos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  switch (tipo) {
    case 'DIGITOVER': return todos.filter((d) => d > b)
    case 'DIGITUNDER': return todos.filter((d) => d < b)
    case 'DIGITMATCH': return [b]
    case 'DIGITDIFF': return todos.filter((d) => d !== b)
    case 'DIGITEVEN': return todos.filter((d) => d % 2 === 0)
    case 'DIGITODD': return todos.filter((d) => d % 2 === 1)
    default: return todos.filter((d) => d > 4)
  }
}
/** Pagamento bruto por US$ 1 (o medido na plataforma, ver escada.ts), pelo número de dígitos que ganham. */
export function pagamentoPorDolar(tipo: string, b?: number): number {
  const n = digitosQueGanham(tipo, b).length
  const P = PAGAMENTO_POR_DOLAR
  return n === 3 ? P.tresDigitos : n === 5 ? P.cincoDigitos : n === 6 ? P.seisDigitos : n === 9 ? P.noveDigitos : 1 + (10 / Math.max(1, n) - 1) * 0.94
}

/* ============================================================ a caixa */

export interface Compra { valor: number; payout: number; contractType: string; barreira?: number }
/** Uma operação já fechada, com tudo o que a revisão mostra. */
export interface OperacaoSimulada extends Compra { n: number; trecho: number; ganhou: boolean; lucro: number; resultado: number; saldo: number; degrau: number }

/**
 * As contas do motor, sem tick e sem Deriv. Cada linha aqui tem o seu par em
 * MotorTeeds (engine.ts: ligar, comprar, liquidar): quem mexer lá, mexe aqui.
 */
export class Caixa {
  readonly est: Estrategia
  config!: ConfigEstrategia
  rodando = false
  operacoes = 0
  vitorias = 0
  derrotas = 0
  perdasSeguidas = 0
  vitoriasSeguidas = 0
  resultado = 0
  movimentado = 0
  valorAtual = 0
  prejuizoDaSequencia = 0
  retorno = 1
  memoria: Record<string, unknown> = {}
  motivo: string | null = null
  saldo: number
  digitos: number[] = []
  /** Registros que o motor faria nesta conta (o Ensaio passa para a cabine). */
  avisos: Array<{ texto: string; tipo: Registro['tipo'] }> = []

  constructor(ia: string, saldo: number) {
    this.est = estrategiaDa(ia)
    this.saldo = saldo
  }

  get contexto(): Contexto {
    return {
      digitos: this.digitos, perdasSeguidas: this.perdasSeguidas, vitoriasSeguidas: this.vitoriasSeguidas,
      operacoes: this.operacoes, resultado: this.resultado, prejuizoDaSequencia: this.prejuizoDaSequencia,
      config: this.config, memoria: this.memoria,
    }
  }

  /** Liga (ou religa, continuando o placar). A escada sempre recomeça: é a regra do motor (30/09/2026). */
  ligar(config: ConfigEstrategia) {
    this.config = config
    this.rodando = true
    this.motivo = null
    this.perdasSeguidas = 0
    this.valorAtual = config.valorInicial
    this.prejuizoDaSequencia = 0
    this.retorno = 1
    this.memoria = {}
  }

  desligar(motivo: string) {
    if (!this.rodando) return
    this.rodando = false
    this.motivo = motivo
  }

  /** O comprar() do motor: a entrada com os aparos, ou o motivo de parar antes. */
  comprar(): Compra | null {
    if (!this.rodando) return null
    if (!Number.isFinite(this.valorAtual)) {
      this.avisos.push({ texto: 'A tabela de recuperação chegou ao fim: o robô parou conforme a configuração da plataforma.', tipo: 'parada' })
      this.desligar('tabela de recuperação esgotada')
      return null
    }
    const pisoDoCliente = Math.max(ENTRADA_MINIMA, this.config.valorAoVencer || 0)
    let desejado = Math.min(Math.max(pisoDoCliente, Number(this.valorAtual.toFixed(2))), this.config.valorMaximo || Infinity)
    const teto = this.config.parametros?.limites.valorMaximoPorEntrada ?? 0
    if (teto > 0 && desejado > teto) {
      const aparado = Math.max(ENTRADA_MINIMA, Number(teto.toFixed(2)))
      this.avisos.push({ texto: `Entrada reduzida de ${din(desejado)} para ${din(aparado)}: teto da plataforma para este robô.`, tipo: 'info' })
      desejado = aparado
    }
    const stop = this.config.stopLoss
    let valor = desejado
    if (stop > 0) {
      const folga = r2(stop + Math.min(0, this.resultado))
      if (folga < desejado) {
        if (folga >= ENTRADA_MINIMA) valor = Number(folga.toFixed(2))
        else {
          this.avisos.push({ texto: `Parou antes de furar o limite de perda: a próxima entrada de ${din(desejado)} passaria do stop de ${din(stop)}.`, tipo: 'parada' })
          this.desligar(`limite de perda protegido (${MOEDA} ${stop.toFixed(2)})`)
          return null
        }
      }
    }
    if (valor < desejado) this.avisos.push({ texto: `Entrada reduzida de ${din(desejado)} para ${din(valor)} para não passar do limite de perda.`, tipo: 'info' })
    // a corretora recusa a compra maior que o saldo (InsufficientBalance): o motor desliga dizendo isso
    if (valor > this.saldo + 1e-9) {
      this.avisos.push({ texto: `Compra recusada: saldo insuficiente (${din(this.saldo)}) para a entrada de ${din(valor)}`, tipo: 'parada' })
      this.desligar('a Deriv recusou a compra — saldo insuficiente na conta')
      return null
    }
    const c = this.est.contrato?.(this.contexto) ?? { contractType: this.est.contractType, barreira: this.est.barreira }
    const payout = centavos(valor * pagamentoPorDolar(c.contractType, c.barreira))
    const retorno = (payout - valor) / valor
    if (Number.isFinite(retorno) && retorno > 0) this.retorno = retorno
    this.movimentado = r2(this.movimentado + valor)
    this.saldo = r2(this.saldo - valor)
    return { valor, payout, contractType: c.contractType, ...(c.barreira !== undefined ? { barreira: c.barreira } : {}) }
  }

  /** O liquidar() do motor. Devolve o lucro da operação. */
  liquidar(compra: Compra, ganhou: boolean, digitoSaida: number | null): number {
    const lucro = ganhou ? r2(compra.payout - compra.valor) : -compra.valor
    if (ganhou) this.saldo = r2(this.saldo + compra.payout)
    this.operacoes += 1
    this.resultado = r2(this.resultado + lucro)
    if (ganhou) {
      this.vitorias += 1; this.perdasSeguidas = 0; this.prejuizoDaSequencia = 0; this.vitoriasSeguidas += 1
    } else {
      this.derrotas += 1; this.perdasSeguidas += 1; this.prejuizoDaSequencia = r2(this.prejuizoDaSequencia + compra.valor); this.vitoriasSeguidas = 0
    }
    this.est.aposResultado?.({ ...this.contexto, ganhou, contractType: compra.contractType, digitoSaida })
    this.valorAtual = this.est.proximoValor({
      valorAtual: compra.valor, valorInicial: this.config.valorInicial, valorAoVencer: this.config.valorAoVencer,
      ganhou, lucro, perdasSeguidas: this.perdasSeguidas, prejuizoDaSequencia: this.prejuizoDaSequencia,
      retornoLiquidoPorUnidade: this.retorno, config: this.config, memoria: this.memoria, contractType: compra.contractType,
    })
    // freios, na ordem do motor
    if (this.config.takeProfit > 0 && this.resultado >= this.config.takeProfit) this.desligar(`meta de lucro atingida (${MOEDA} ${this.resultado.toFixed(2)})`)
    else if (this.config.stopLoss > 0 && this.resultado <= -this.config.stopLoss) this.desligar(`limite de perda atingido (${MOEDA} ${this.resultado.toFixed(2)})`)
    else if (this.config.maxOperacoes > 0 && this.operacoes >= this.config.maxOperacoes) this.desligar(`limite de ${this.config.maxOperacoes} operações`)
    else if (this.config.valorMaximo > 0 && this.valorAtual > this.config.valorMaximo) this.desligar(`próxima entrada (${this.valorAtual.toFixed(2)}) passaria do teto`)
    else if (!Number.isFinite(this.valorAtual)) {
      this.avisos.push({ texto: 'A tabela de recuperação chegou ao fim: o robô parou conforme a configuração da plataforma.', tipo: 'parada' })
      this.desligar('tabela de recuperação esgotada')
    }
    return lucro
  }
}

/** A configuração de cada trecho: as regras em vigor da I.A. + entrada, meta e stop do roteiro. */
export function configDoTrecho(r: Roteiro, t: Trecho): ConfigEstrategia {
  const base = Math.max(ENTRADA_MINIMA, r2(r.entrada || 1))
  const cfg = configDeReferencia(parametrosDa(r.ia), base, r.modo ?? 'conservador')
  return {
    ...cfg, valorMaximo: Math.max(0, r.valorMaximo ?? 0),
    ...(r.lossVirtual !== undefined && r.lossVirtual !== null ? { lossVirtualCliente: r.lossVirtual } : {}),
    takeProfit: Math.max(0, t.meta || 0), stopLoss: Math.max(0, t.stop || 0),
  }
}

/* ========================================================= a corrida */

export interface FimDoTrecho { motivo: string; operacoes: number; resultado: number; tipo: 'meta' | 'stop' | 'desligou' | 'saldo' | 'outro' }
export interface Corrida {
  ops: OperacaoSimulada[]
  trechos: FimDoTrecho[]
  /** O trecho seguinte não pôde ligar (o limite já estava batido): o texto do porquê. */
  naoReligou: string | null
}

export function tipoDoMotivo(m: string): FimDoTrecho['tipo'] {
  return /^meta de lucro/i.test(m) ? 'meta' : /^limite de perda/i.test(m) ? 'stop' : /^voc[êe] desligou/i.test(m) ? 'desligou' : /saldo insuficiente/i.test(m) ? 'saldo' : 'outro'
}

/** Roda a caixa com os ganhou/perdeu de cada trecho. Acabou a lista e ela segue ligada: "você desligou". */
export function correr(r: Roteiro, resultados: boolean[][]): Corrida {
  const caixa = new Caixa(r.ia, r.saldo)
  const ops: OperacaoSimulada[] = []
  const trechos: FimDoTrecho[] = []
  let naoReligou: string | null = null
  r.trechos.forEach((t, k) => {
    if (naoReligou) return
    const cfg = configDoTrecho(r, t)
    if (k > 0 && ((cfg.takeProfit > 0 && caixa.resultado >= cfg.takeProfit) || (cfg.stopLoss > 0 && caixa.resultado <= -cfg.stopLoss))) {
      naoReligou = cfg.takeProfit > 0 && caixa.resultado >= cfg.takeProfit
        ? `Para religar, a nova meta precisa passar do resultado (${din(caixa.resultado)}).`
        : `Para religar, o novo limite de perda precisa passar do prejuízo (${din(-caixa.resultado)}).`
      return
    }
    caixa.ligar(cfg)
    for (const ganhou of resultados[k] ?? []) {
      const degrau = caixa.perdasSeguidas
      const c = caixa.comprar()
      if (!c) break
      const lucro = caixa.liquidar(c, ganhou, null)
      ops.push({ ...c, n: caixa.operacoes, trecho: k, ganhou, lucro, resultado: caixa.resultado, saldo: caixa.saldo, degrau })
      if (!caixa.rodando) break
    }
    caixa.desligar('você desligou')
    trechos.push({ motivo: caixa.motivo ?? 'você desligou', operacoes: ops.filter((o) => o.trecho === k).length, resultado: caixa.resultado, tipo: tipoDoMotivo(caixa.motivo ?? '') })
  })
  return { ops, trechos, naoReligou }
}

/* ======================================================== o gerador */

/**
 * A tabela de um ciclo: m perdas seguidas e depois o ganho, saindo da base.
 * `custo[m]` é o que as m perdas custam e `liquido[m]` o que o ciclo deixa
 * de lucro. É a mesma caixa, sem limite nenhum.
 */
function tabelaDosCiclos(r: Roteiro, maximo: number) {
  const custo: number[] = [0], liquido: number[] = [], entradas: number[] = []
  const t: Trecho = { meta: 0, stop: 0, fim: 'desligou', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' }
  for (let m = 0; m <= maximo; m++) {
    const cx = new Caixa(r.ia, 1e12)
    cx.ligar(configDoTrecho(r, t))
    let perdido = 0, cabe = true
    for (let j = 0; j < m && cabe; j++) { const c = cx.comprar(); if (!c) { cabe = false; break } perdido = r2(perdido + c.valor); cx.liquidar(c, false, null) }
    const c = cabe ? cx.comprar() : null
    // escada que passa do razoável (ou tabela que manda parar): o ciclo não existe
    if (!c) { liquido.push(-Infinity); entradas.push(0); custo.push(Infinity); continue }
    entradas.push(c.valor)
    custo.push(r2(perdido + c.valor))
    liquido.push(r2(c.payout - c.valor - perdido))
  }
  return { custo, liquido, entradas }
}

/** A chance de perder de cada I.A., na entrada e na recuperação (para a sessão parecer natural). */
function chanceDePerder(ia: string): { entrada: number; recuperacao: number } {
  const e = estrategiaDa(ia)
  const base = 1 - digitosQueGanham(e.contractType, e.barreira).length / 10
  if (ia === 'goreme') return { entrada: base, recuperacao: 0.7 }
  return { entrada: base, recuperacao: base }
}

export interface Plano { resultados: boolean[][]; avisos: string[] }

/** Uma sequência de perdas "natural" da I.A., no máximo `teto`. */
function sortearCiclo(rnd: () => number, q: { entrada: number; recuperacao: number }, teto: number): number {
  let m = 0
  if (rnd() < q.entrada) { m = 1; while (m < teto && rnd() < q.recuperacao) m++ }
  return Math.min(m, teto)
}

/**
 * Monta os ciclos (m perdas e um ganho) que somam `ops` operações e deixam
 * `alvo` de lucro, com um ciclo de exatamente `S` perdas (se `comS`).
 * Primeiro sorteia como a I.A. erraria de verdade; depois troca perdas de um
 * ciclo para outro, separa e junta ciclos (sempre o mesmo total de operações)
 * até o lucro chegar o mais perto possível do alvo.
 */
function montarCiclos(rnd: () => number, tab: ReturnType<typeof tabelaDosCiclos>, q: { entrada: number; recuperacao: number },
  ops: number, alvo: number, S: number, comS: boolean, tetoOutros: number): number[] {
  if (ops <= 0) return []
  const lucroDe = (cs: number[]) => cs.reduce((s, m) => s + tab.liquido[m], 0)
  const opsDe = (cs: number[]) => cs.reduce((s, m) => s + m + 1, 0)
  let ciclos: number[] = []
  const fixo = comS && S + 1 <= ops ? 0 : -1
  if (fixo === 0) ciclos.push(S)
  while (opsDe(ciclos) < ops) {
    const falta = ops - opsDe(ciclos)
    const m = Math.min(sortearCiclo(rnd, q, tetoOutros), falta - 1)
    ciclos.push(Math.max(0, m))
  }
  const livre = (i: number) => i !== fixo
  let soma = lucroDe(ciclos)
  let dif = Math.abs(soma - alvo)
  // busca dirigida: cada volta mede movimentos sorteados e fica com o melhor
  for (let volta = 0; volta < 4000 && dif > 0.004; volta++) {
    let melhor: { d: number; aplicar: () => void } | null = null
    for (let tentativa = 0; tentativa < 40; tentativa++) {
      const n = ciclos.length
      const tipo = rnd()
      if (tipo < 0.5 && n >= 2) {
        // passa uma perda do ciclo i para o j
        const i = Math.floor(rnd() * n), j = Math.floor(rnd() * n)
        if (i === j || !livre(i) || !livre(j) || ciclos[i] === 0 || ciclos[j] + 1 > tetoOutros) continue
        const novo = soma - tab.liquido[ciclos[i]] - tab.liquido[ciclos[j]] + tab.liquido[ciclos[i] - 1] + tab.liquido[ciclos[j] + 1]
        const d = Math.abs(novo - alvo)
        if (!melhor || d < melhor.d) melhor = { d, aplicar: () => { ciclos[i]--; ciclos[j]++ } }
      } else if (tipo < 0.75) {
        // separa um ciclo de m perdas em dois (a e m − 1 − a): mesmas operações, um ganho a mais
        const i = Math.floor(rnd() * n)
        if (!livre(i) || ciclos[i] < 1) continue
        const m = ciclos[i], a = Math.floor(rnd() * m), b = m - 1 - a
        const novo = soma - tab.liquido[m] + tab.liquido[a] + tab.liquido[b]
        const d = Math.abs(novo - alvo)
        if (!melhor || d < melhor.d) melhor = { d, aplicar: () => { ciclos.splice(i, 1, a, b) } }
      } else if (n >= 2) {
        // junta dois ciclos num só (a + b + 1 perdas): mesmas operações, um ganho a menos
        const i = Math.floor(rnd() * n), j = Math.floor(rnd() * n)
        if (i === j || !livre(i) || !livre(j)) continue
        const m = ciclos[i] + ciclos[j] + 1
        if (m > tetoOutros) continue
        const novo = soma - tab.liquido[ciclos[i]] - tab.liquido[ciclos[j]] + tab.liquido[m]
        const d = Math.abs(novo - alvo)
        if (!melhor || d < melhor.d) melhor = { d, aplicar: () => { const [x, y] = i > j ? [i, j] : [j, i]; ciclos.splice(x, 1); ciclos.splice(y, 1, m) } }
      }
    }
    if (!melhor) continue
    if (melhor.d < dif - 1e-9) {
      melhor.aplicar()
      soma = lucroDe(ciclos)
      dif = Math.abs(soma - alvo)
    } else if (volta > 600) break
  }
  ciclos = ciclos.filter((m) => m >= 0)
  return ciclos
}

/** Põe o ciclo da maior sequência no começo, no meio ou no fim; os outros embaralhados. */
function ordenar(rnd: () => number, ciclos: number[], S: number, momento: Momento, ultimoFixo: number | null): number[] {
  const lista = [...ciclos]
  const iS = lista.indexOf(S)
  const sCiclo = iS >= 0 ? lista.splice(iS, 1)[0] : null
  let fixoNoFim: number | null = null
  if (ultimoFixo !== null) { const i = lista.indexOf(ultimoFixo); if (i >= 0) fixoNoFim = lista.splice(i, 1)[0] }
  for (let i = lista.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [lista[i], lista[j]] = [lista[j], lista[i]] }
  if (sCiclo !== null) {
    const n = lista.length
    const pos = momento === 'comeco' ? Math.min(n, Math.floor(n * (0.05 + rnd() * 0.12)))
      : momento === 'meio' ? Math.floor(n * (0.42 + rnd() * 0.16))
      : fixoNoFim === null ? n : Math.max(0, n - Math.floor(rnd() * 2))
    lista.splice(pos, 0, sCiclo)
  }
  if (fixoNoFim !== null) lista.push(fixoNoFim)
  return lista
}

const emResultados = (ciclos: number[], aberta = 0) => [
  ...ciclos.flatMap((m) => [...Array.from({ length: m }, () => false), true]),
  ...Array.from({ length: aberta }, () => false),
]

/** Quanto o acerto obtido foge do pedido (cada ponto percentual pesa como meia operação a mais). */
function notaDoAcerto(ops: Array<{ ganhou: boolean }>, t: Trecho): number {
  if (t.acerto === undefined || t.acerto === null || !ops.length) return 0
  const pct = (ops.filter((o) => o.ganhou).length / ops.length) * 100
  const d = Math.abs(pct - t.acerto)
  return d < 0.5 ? 0 : d * 10
}

/** O que define a sessão de um trecho: se mudar, a sessão natural guardada deixa de valer. */
export function assinaturaDoTrecho(r: Roteiro, k: number): string {
  const sem = (t: Trecho) => ({ ...t, natural: t.natural?.assinatura ?? null })
  const t = r.trechos[k]
  return JSON.stringify([r.ia, r.entrada, r.saldo, r.modo ?? null, r.lossVirtual ?? null, r.valorMaximo ?? 0, versaoRegras, r.trechos.slice(0, k).map(sem), t.meta, t.stop, t.fim, t.operacoes, t.sequencia, t.momento, t.acerto ?? null, t.fim === 'desligou' ? t.resultado : 0])
}

/** Gera os ganhou/perdeu de cada trecho para fechar com o roteiro. */
export function planejar(r: Roteiro): Plano {
  if (r.fita) return { resultados: r.fita.map((f) => [...f]), avisos: [] }
  const avisos: string[] = []
  const resultados: boolean[][] = []
  const q = chanceDePerder(r.ia)
  const tab = tabelaDosCiclos(r, 40)
  let R0 = 0
  r.trechos.forEach((t, k) => {
    // a sessão natural da sugestão, se os números ainda são os dela
    if (t.natural && t.natural.assinatura === assinaturaDoTrecho(r, k)) {
      resultados.push([...t.natural.resultados])
      R0 = correr({ ...r, trechos: r.trechos.slice(0, k + 1) }, resultados).trechos[k]?.resultado ?? R0
      return
    }
    const N = Math.max(1, Math.round(t.operacoes))
    const S = Math.max(0, Math.min(38, Math.round(t.sequencia)))
    /** O lucro que a I.A. deixaria em `ops` operações errando do jeito dela (média de sorteios). */
    const natural = (rnd: () => number, ops: number, tetoM: number): number => {
      let lucro = 0, feitas = 0
      for (let i = 0; i < 400; i++) { const m = sortearCiclo(rnd, q, tetoM); lucro += tab.liquido[m]; feitas += m + 1 }
      return feitas ? (lucro / feitas) * ops : 0
    }
    /** Uma montagem do trecho; `folga` baixa o teto das outras sequências (para não baterem no stop antes). */
    const montar = (rnd: () => number, folga: number): boolean[] => {
      const teto = (s: number) => Math.max(0, s - 1 - folga)
      if (t.fim === 'meta') {
        // o último ganho é o que passa da meta: o total fica logo acima dela
        const ciclos = montarCiclos(rnd, tab, q, N, r2(t.meta - R0) + 0.01, S, S > 0, teto(S))
        return emResultados(ordenar(rnd, ciclos, S, t.momento, null))
      }
      if (t.fim === 'stop') {
        // a última sequência é a que leva ao stop: antes dela o resultado tem que estar na janela certa
        let Sf = Math.max(1, S)
        while (Sf < 38 && tab.custo[Sf] - t.stop < R0) Sf++
        const lo = r2(tab.custo[Sf - 1] - t.stop + ENTRADA_MINIMA), hi = r2(tab.custo[Sf] - t.stop)
        // dentro da janela, o mais perto do que a I.A. faria sozinha nessas operações (a fita fica natural)
        const alvoAntes = Math.min(hi, Math.max(lo, R0, r2(R0 + natural(rnd, Math.max(0, N - Sf), teto(Sf)))))
        const ciclos = montarCiclos(rnd, tab, q, Math.max(0, N - Sf), alvoAntes - R0, Sf, false, teto(Sf))
        return emResultados(ordenar(rnd, ciclos, -1, t.momento, null), Sf)
      }
      const T = r2(t.resultado)
      if (T >= R0) {
        const ciclos = montarCiclos(rnd, tab, q, N, T - R0, S, S > 0, teto(S))
        return emResultados(ordenar(rnd, ciclos, S, t.momento, null))
      }
      // desligou no negativo: no meio de uma sequência de perdas
      let m = Math.max(1, S)
      while (m < 38 && tab.custo[m] < R0 - T) m++
      const ciclos = montarCiclos(rnd, tab, q, Math.max(0, N - m), T + tab.custo[m] - R0, m, false, teto(m))
      return emResultados(ordenar(rnd, ciclos, -1, t.momento, null), m)
    }
    // algumas montagens; fica a que mais fecha com o pedido, conferida na caixa (com aparos e freios)
    let melhor: { lista: boolean[]; nota: number; resultado: number } | null = null
    for (let tentativa = 0; tentativa < 8; tentativa++) {
      const rnd = sorteio(sementeDe(JSON.stringify([r.ia, r.entrada, k, t, r.semente, tentativa])))
      const lista = montar(rnd, Math.floor(tentativa / 2))
      const corrida = correr({ ...r, trechos: r.trechos.slice(0, k + 1) }, [...resultados, lista])
      const fim = corrida.trechos[k]
      if (!fim) continue
      const dele = corrida.ops.filter((o) => o.trecho === k)
      let s = 0, maior = 0
      dele.forEach((o) => { s = o.ganhou ? 0 : s + 1; maior = Math.max(maior, s) })
      const nota = (fim.tipo === t.fim ? 0 : 10_000) + Math.abs(dele.length - N) * 20 + Math.abs(maior - S) * 50
        + (t.fim === 'desligou' ? Math.abs(fim.resultado - t.resultado) * 10 : 0) + notaDoAcerto(dele, t)
      if (!melhor || nota < melhor.nota) melhor = { lista, nota, resultado: fim.resultado }
      if (nota < 0.05) break
    }
    // reparo: troca ganhou/perdeu de uma operação (ou de duas vizinhas) conferindo na caixa, até fechar
    if (melhor && melhor.nota >= 0.05) {
      const avaliar = (lista: boolean[]) => {
        const corrida = correr({ ...r, trechos: r.trechos.slice(0, k + 1) }, [...resultados, lista])
        const fim = corrida.trechos[k]
        if (!fim) return { nota: Infinity, resultado: R0 }
        const dele = corrida.ops.filter((o) => o.trecho === k)
        let sq = 0, mx = 0
        dele.forEach((o) => { sq = o.ganhou ? 0 : sq + 1; mx = Math.max(mx, sq) })
        const nota = (fim.tipo === t.fim ? 0 : 10_000) + Math.abs(dele.length - N) * 20 + Math.abs(mx - S) * 50 + (t.fim === 'desligou' ? Math.abs(fim.resultado - t.resultado) * 10 : 0) + notaDoAcerto(dele, t)
        return { nota, resultado: fim.resultado }
      }
      const rnd = sorteio(sementeDe(JSON.stringify(['reparo', r.ia, k, t, r.semente])))
      let lista = [...melhor.lista]
      // a lista pode precisar de mais operações do que a montagem deu
      while (lista.length < N) lista.push(rnd() < 0.5)
      let atual = avaliar(lista)
      for (let volta = 0; volta < 1500 && atual.nota >= 0.05; volta++) {
        const nova = [...lista]
        const i = Math.floor(rnd() * nova.length)
        if (rnd() < 0.5 || i + 1 >= nova.length) nova[i] = !nova[i]
        else [nova[i], nova[i + 1]] = [nova[i + 1], nova[i]]
        const a = avaliar(nova)
        if (a.nota <= atual.nota) { lista = nova; atual = a }
      }
      melhor = { lista, nota: atual.nota, resultado: atual.resultado }
    }
    resultados.push(melhor?.lista ?? [])
    R0 = melhor?.resultado ?? R0
  })
  return { resultados, avisos }
}

/* ==================================================== a revisão */

export interface Previa {
  corrida: Corrida
  resultados: boolean[][]
  resultado: number
  saldoFinal: number
  operacoes: number
  ganhas: number
  maiorSequencia: { n: number; trecho: number; desde: number }
  maiorEntrada: number
  maiorGanho: number
  /** Duração no ritmo real do ativo (segundos). */
  duracao: number
  avisos: string[]
  /** Os números que não bateram com o pedido, com a sugestão de usar o que saiu. */
  diferencas: Array<{ trecho: number; campo: 'operacoes' | 'resultado' | 'sequencia' | 'fim' | 'acerto'; pedido: string; saiu: string; usar?: Partial<Trecho> }>
}

/** Segundos entre um tick e outro no ativo das I.A. (R_75: um a cada 2 s). */
export const SEGUNDOS_POR_TICK = 2

export function previaDoRoteiro(r: Roteiro): Previa {
  const plano = planejar(r)
  const corrida = correr(r, plano.resultados)
  const ops = corrida.ops
  let seq = 0, desde = 0, melhor = { n: 0, trecho: 0, desde: 0 }
  ops.forEach((o, i) => {
    if (o.ganhou) { seq = 0; return }
    if (seq === 0) desde = i
    seq++
    if (seq > melhor.n) melhor = { n: seq, trecho: o.trecho, desde }
  })
  const avisos = [...plano.avisos]
  if (corrida.naoReligou) avisos.push(corrida.naoReligou)
  const diferencas: Previa['diferencas'] = []
  r.trechos.forEach((t, k) => {
    const fimK = corrida.trechos[k]
    if (!fimK) return
    const dele = ops.filter((o) => o.trecho === k)
    const pedidoOps = Math.max(1, Math.round(t.operacoes))
    const tipoPedido = t.fim === 'desligou' ? 'desligou' : t.fim
    if (fimK.tipo !== tipoPedido && !(r.fita)) {
      const como = { meta: 'bate a meta', stop: 'bate o limite de perda', desligou: 'é desligada', saldo: 'para por falta de saldo', outro: 'para' }[fimK.tipo]
      diferencas.push({ trecho: k, campo: 'fim', pedido: t.fim, saiu: `Com estes números a sessão ${como} na operação ${fimK.operacoes} (${din(fimK.resultado)}).` })
    }
    if (dele.length !== pedidoOps && !r.fita) diferencas.push({ trecho: k, campo: 'operacoes', pedido: String(pedidoOps), saiu: String(dele.length), usar: { operacoes: dele.length } })
    if (t.fim === 'desligou' && Math.abs(fimK.resultado - t.resultado) > 0.004 && !r.fita) diferencas.push({ trecho: k, campo: 'resultado', pedido: din(t.resultado), saiu: din(fimK.resultado), usar: { resultado: fimK.resultado } })
    let s = 0, maior = 0
    dele.forEach((o) => { s = o.ganhou ? 0 : s + 1; maior = Math.max(maior, s) })
    if (t.acerto !== undefined && t.acerto !== null && dele.length && !r.fita) {
      const pct = Math.round((dele.filter((o) => o.ganhou).length / dele.length) * 100)
      if (Math.abs(pct - t.acerto) >= 1) diferencas.push({ trecho: k, campo: 'acerto', pedido: `${t.acerto}%`, saiu: `${pct}%`, usar: { acerto: pct } })
    }
    if (maior !== Math.round(t.sequencia) && !r.fita) diferencas.push({ trecho: k, campo: 'sequencia', pedido: String(Math.round(t.sequencia)), saiu: String(maior), usar: { sequencia: maior } })
  })
  // ticks: o 1º de cada operação é a entrada e o 2º a saída; as I.A. com loss virtual esperam alguns entre uma e outra
  const lv = r.lossVirtual ?? parametrosDa(r.ia).entrada.lossVirtual ?? 0
  const espera = estrategiaDa(r.ia).lossVirtualAjustavel && lv > 0 ? 5 : 0
  return {
    corrida, resultados: plano.resultados,
    resultado: ops.length ? ops[ops.length - 1].resultado : 0,
    saldoFinal: ops.length ? ops[ops.length - 1].saldo : r.saldo,
    operacoes: ops.length,
    ganhas: ops.filter((o) => o.ganhou).length,
    maiorSequencia: melhor,
    maiorEntrada: ops.reduce((m, o) => Math.max(m, o.valor), 0),
    maiorGanho: ops.reduce((m, o) => Math.max(m, o.lucro), 0),
    duracao: ops.length * (2 + espera) * SEGUNDOS_POR_TICK,
    avisos, diferencas,
  }
}

/** A escada da I.A. com a entrada do roteiro (para mostrar no editor). */
export function escadaDoRoteiro(r: Roteiro, passos = 10): number[] {
  return tabelaDosCiclos(r, passos - 1).entradas
}

/* ================================================ modelos prontos */

const trecho = (p: Partial<Trecho>): Trecho => ({ meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 60, sequencia: 4, momento: 'meio', ...p })
export const roteiroEmBranco = (): Roteiro => ({
  versao: 1, nome: 'Sessão simulada', ia: 'superior5', conta: 'real', saldo: 500, entrada: 1, semente: 1,
  trechos: [trecho({ meta: 20, stop: 50, fim: 'meta', operacoes: 40, sequencia: 4, momento: 'meio' })],
})
export interface Pronto { id: string; nome: string; tom: 'bom' | 'ruim' | 'neutro'; ensina: string; roteiro: Roteiro }
export function roteirosProntos(): Pronto[] {
  const base = roteiroEmBranco()
  const r = (p: Partial<Roteiro>): Roteiro => ({ ...base, ...p })
  return [
    { id: 'meta-rapida', nome: 'Meta batida rápido', tom: 'bom', ensina: 'Bateu a meta: é hora de desligar, não de dobrar.',
      roteiro: r({ nome: 'Meta batida rápido', ia: 'superior5', trechos: [trecho({ meta: 20, stop: 50, fim: 'meta', operacoes: 22, sequencia: 3, momento: 'meio' })] }) },
    { id: 'recuperou-no-fim', nome: 'Sequência longa e recuperação', tom: 'neutro', ensina: 'A recuperação fez o trabalho dela: respeitar a escada.',
      roteiro: r({ nome: 'Sequência longa e recuperação', ia: 'falcon', trechos: [trecho({ meta: 15, stop: 60, fim: 'meta', operacoes: 50, sequencia: 4, momento: 'fim' })] }) },
    { id: 'stop-respeitado', nome: 'Stop respeitado', tom: 'ruim', ensina: 'O dia ruim acabou no limite combinado. Amanhã tem outro.',
      roteiro: r({ nome: 'Stop respeitado', ia: 'superior5', trechos: [trecho({ meta: 30, stop: 40, fim: 'stop', operacoes: 45, sequencia: 9, momento: 'fim' })] }) },
    { id: 'devolveu', nome: 'Bateu a meta, continuou e devolveu', tom: 'ruim', ensina: 'A ganância depois da meta devolveu o dia inteiro.',
      roteiro: r({ nome: 'Bateu a meta, continuou e devolveu', ia: 'ag2', trechos: [
        trecho({ meta: 20, stop: 50, fim: 'meta', operacoes: 25, sequencia: 3, momento: 'meio' }),
        trecho({ meta: 60, stop: 50, fim: 'stop', operacoes: 40, sequencia: 10, momento: 'fim' }),
      ] }) },
    { id: 'desligou-na-recuperacao', nome: 'Desligou no meio da recuperação', tom: 'ruim', ensina: 'Desligar no meio da escada transforma uma sequência em prejuízo.',
      roteiro: r({ nome: 'Desligou no meio da recuperação', ia: 'goreme', trechos: [trecho({ meta: 20, stop: 60, fim: 'desligou', resultado: -6, operacoes: 35, sequencia: 3, momento: 'fim' })] }) },
  ]
}

/* ===================================================== o ensaio */

/** O preço em que o passeio começa (o último do ativo, quando a cotação pública responde). */
export interface PontoDePartida { preco: number; casas: number }

type FaseDoEnsaio = 'rodando' | 'entre' | 'fim'
interface ContratoEmVoo { compra: Compra; id: number; comprouEm: number; entrou: boolean; entrada: number | null; latencia: number; ganhou: boolean }

/**
 * O motor tick a tick. Começa no tick 0 e anda um tick por `passo()`. Para
 * voltar, cria-se outro e avança até o tick desejado (é tudo determinístico).
 */
export class Ensaio {
  readonly r: Roteiro
  readonly plano: boolean[][]
  private caixa: Caixa
  private rnd: () => number
  private preco: number
  private casas: number
  private sigma: number
  readonly t0: number
  /** O relógio da sessão (ms): o horário do tick real em 1×, ou 2 s por tick quando acelerada. */
  private relogio: number
  tick = 0
  trecho = 0
  fase: FaseDoEnsaio = 'rodando'
  /** Operação do plano em que o trecho está (índice). */
  private noPlano = 0
  private emVoo: ContratoEmVoo | null = null
  private estado: EstadoMotor
  private esperaAtual = 0
  private latencias: number[] = []
  private proximoId: number
  /** Chamado quando um trecho termina (meta, stop, desligou): o palco pausa ali. */
  aoFimDoTrecho: ((fim: FimDoTrecho, trecho: number) => void) | null = null
  /**
   * Ritmo pedido (segundos por operação): quantos ticks a I.A. analisa antes de cada entrada nova.
   * Os dígitos desses ticks são escolhidos para a análise da própria estratégia confirmar a entrada
   * nessa hora (o loss virtual completa no tick certo). Só com preço gerado (o real não se escolhe).
   */
  private esperaBase: number | null = null
  private esperaAlvo = 0

  constructor(r: Roteiro, plano: boolean[][], partida: PontoDePartida, t0: number) {
    this.r = r
    this.plano = plano
    this.caixa = new Caixa(r.ia, r.saldo)
    this.rnd = sorteio(sementeDe(JSON.stringify(['ticks', r.semente, r.ia])))
    this.preco = partida.preco
    this.casas = partida.casas
    // R_75: 75% ao ano, um tick a cada 2 s
    this.sigma = partida.preco * 0.75 * Math.sqrt(SEGUNDOS_POR_TICK / (365 * 86400))
    this.t0 = t0
    this.relogio = t0
    this.proximoId = 280_000_000_000 + Math.floor(this.rnd() * 9_000_000_000)
    if (r.ritmo && r.ritmo > 0) {
      // ticks de análise por entrada nova = (ritmo em ticks − os 2 do contrato) × operações ÷ entradas novas
      const ops = plano.reduce((s, l) => s + l.length, 0)
      const novas = plano.reduce((s, l) => s + 1 + l.slice(0, -1).filter(Boolean).length, 0) || 1
      this.esperaBase = Math.max(0, ((r.ritmo / SEGUNDOS_POR_TICK) - 2) * ops / novas)
    }
    this.estado = {
      rodando: false, emOperacao: false, operacoes: 0, vitorias: 0, derrotas: 0, perdasSeguidas: 0, resultado: 0, movimentado: 0,
      valorAtual: 0, aguardando: '', motivoParada: null, registros: [], digitos: [], curva: [0], condicao: null, ultimoLucro: null,
      historico: [], emCurso: null, ticksAnalisados: 0, latenciaMedia: null, falha: null, estrategia: null,
    }
    this.ligar()
  }

  get agora(): number { return this.relogio }
  get saldo(): number { return this.caixa.saldo }
  get operacoes(): number { return this.caixa.operacoes }

  private registrar(texto: string, tipo: Registro['tipo'] = 'info', ms = this.agora) {
    this.estado.registros = [{ hora: ms / 1000, texto, tipo }, ...this.estado.registros].slice(0, 200)
  }
  private passarAvisos() {
    for (const a of this.caixa.avisos.splice(0)) this.registrar(a.texto, a.tipo)
  }

  private normal(): number {
    const u = Math.max(1e-12, this.rnd()), v = this.rnd()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  /** O próximo preço; com `digito`, o último dígito é esse (só a última casa muda: menos que um pip de diferença). */
  private proximoPreco(digito?: number, real?: number): number {
    let p = real ?? this.preco + this.normal() * this.sigma
    if (digito !== undefined) {
      const txt = p.toFixed(this.casas)
      p = Number(txt.slice(0, -1) + String(digito))
    } else p = Number(p.toFixed(this.casas))
    this.preco = p
    return p
  }
  private digitoDe(p: number) { const t = p.toFixed(this.casas); return Number(t[t.length - 1]) }

  private ligar() {
    const t = this.r.trechos[this.trecho]
    const cfg = configDoTrecho(this.r, t)
    this.caixa.ligar(cfg)
    this.noPlano = 0
    this.esperaAtual = 0
    this.novaEspera()
    this.estado.rodando = true
    this.estado.motivoParada = null
    this.estado.perdasSeguidas = 0
    this.estado.valorAtual = cfg.valorInicial
    this.estado.ticksAnalisados = 0
    // o motor semeia com os últimos 60 dígitos do ativo
    const semente: number[] = []
    for (let i = 0; i < 60; i++) semente.push(this.digitoDe(this.proximoPreco()))
    this.caixa.digitos = semente
    this.estado.digitos = [...semente]
    this.registrar(`Robô ligado — ${nomeDaIa(this.r.ia)}`, 'info')
    this.atualizarEspera()
  }

  private atualizarEspera() {
    const ctx = this.caixa.contexto
    const e = this.caixa.est
    this.estado.aguardando = e.aguardando(ctx)
    this.estado.condicao = e.progresso?.(ctx) ?? null
    try { this.estado.estrategia = e.telemetria?.(ctx) ?? null } catch { this.estado.estrategia = null }
  }

  /** O plano deste trecho acabou: quem decide agora é "você desligou". */
  private get planoAcabou() { return this.noPlano >= (this.plano[this.trecho]?.length ?? 0) }

  private comprar() {
    if (this.planoAcabou) { this.desligar('você desligou'); return }
    const c = this.caixa.comprar()
    this.passarAvisos()
    if (!c) { this.fecharTrecho(); return }
    const latencia = Math.round(140 + this.rnd() * 260)
    this.latencias = [...this.latencias, latencia].slice(-30)
    this.estado.latenciaMedia = Math.round(this.latencias.reduce((s, x) => s + x, 0) / this.latencias.length)
    const id = this.proximoId; this.proximoId += 1 + Math.floor(this.rnd() * 40)
    const comprouEm = this.agora + latencia
    this.emVoo = { compra: c, id, comprouEm, entrou: false, entrada: null, latencia, ganhou: this.plano[this.trecho][this.noPlano] }
    this.noPlano += 1
    this.estado.emOperacao = true
    this.estado.movimentado = this.caixa.movimentado
    const emCurso: EmCurso = {
      contractId: id, valor: c.valor, payout: c.payout, entrada: null, digitoEntrada: null, spot: null, digitoAtual: null,
      lucro: 0, comprouEm, latencia, contractType: c.contractType, ...(c.barreira !== undefined ? { barreira: c.barreira } : {}),
    }
    this.estado.emCurso = emCurso
    this.estado.aguardando = 'comprando…'
    this.registrar(`Entrou com ${din(c.valor)} · pagamento ${din(c.payout)}`, 'compra', comprouEm)
  }

  private liquidar(saida: number) {
    const v = this.emVoo!
    this.emVoo = null
    const digitoSaida = this.digitoDe(saida)
    const lucro = this.caixa.liquidar(v.compra, v.ganhou, digitoSaida)
    this.passarAvisos()
    const op: OperacaoMotor = {
      n: this.caixa.operacoes, contractId: v.id, pipSize: this.casas, valor: v.compra.valor,
      entrada: v.entrada, saida, digitoEntrada: v.entrada !== null ? this.digitoDe(v.entrada) : null, digitoSaida,
      lucro, payout: v.compra.payout, markupDeriv: null, ganhou: v.ganhou, quando: this.agora, esperou: this.esperaAtual,
      contractType: v.compra.contractType, ...(v.compra.barreira !== undefined ? { barreira: v.compra.barreira } : {}),
    }
    const e = this.estado
    e.operacoes = this.caixa.operacoes
    e.vitorias = this.caixa.vitorias
    e.derrotas = this.caixa.derrotas
    e.perdasSeguidas = this.caixa.perdasSeguidas
    e.resultado = this.caixa.resultado
    e.movimentado = this.caixa.movimentado
    e.valorAtual = this.caixa.valorAtual
    e.ultimoLucro = lucro
    e.emOperacao = false
    e.emCurso = null
    e.curva = [...e.curva, e.resultado].slice(-200)
    e.historico = [op, ...e.historico]
    e.ticksAnalisados = 0
    this.esperaAtual = 0
    this.novaEspera()
    this.registrar(v.ganhou ? `Ganhou ${din(lucro)}` : `Perdeu ${din(Math.abs(lucro))}`, v.ganhou ? 'ganho' : 'perda')
    try { e.estrategia = this.caixa.est.telemetria?.(this.caixa.contexto) ?? null } catch { e.estrategia = null }
    if (!this.caixa.rodando) { this.fecharTrecho(); return }
    // desligou com o contrato no ar, ou o roteiro acabou: a pessoa desliga logo depois desta operação
    if (this.desligarDepois || this.planoAcabou) {
      const m = this.desligarDepois ?? 'você desligou'
      this.desligarDepois = null
      this.caixa.desligar(m)
      this.fecharTrecho()
      return
    }
    if (this.caixa.est.entradaContinua && this.caixa.est.entrar(this.caixa.contexto)) { this.comprar(); return }
    this.atualizarEspera()
  }

  /** Desligar pela tela (ou no fim do roteiro). Com contrato no ar, ele termina antes. */
  desligar(motivo = 'você desligou') {
    if (this.fase !== 'rodando') return
    if (this.emVoo) { this.desligarDepois = motivo; this.estado.aguardando = 'concluindo o contrato em andamento…'; return }
    this.caixa.desligar(motivo)
    this.fecharTrecho()
  }
  private desligarDepois: string | null = null

  private fecharTrecho() {
    const motivo = this.caixa.motivo ?? 'você desligou'
    this.estado.rodando = false
    this.estado.motivoParada = motivo
    this.estado.emOperacao = false
    this.estado.emCurso = null
    this.estado.aguardando = 'sessão encerrada'
    this.registrar(`Robô parado — ${motivo}`, 'parada')
    const fim: FimDoTrecho = { motivo, operacoes: this.caixa.operacoes, resultado: this.caixa.resultado, tipo: tipoDoMotivo(motivo) }
    const k = this.trecho
    this.fase = k + 1 < this.r.trechos.length ? 'entre' : 'fim'
    this.aoFimDoTrecho?.(fim, k)
  }

  /** O próximo trecho ("religou"). Recusa como o motor quando o limite novo já está batido. */
  religar(): string | null {
    if (this.fase !== 'entre') return null
    const t = this.r.trechos[this.trecho + 1]
    const cfg = configDoTrecho(this.r, t)
    const R = this.caixa.resultado
    if ((cfg.takeProfit > 0 && R >= cfg.takeProfit) || (cfg.stopLoss > 0 && R <= -cfg.stopLoss)) return 'O limite acumulado desta sessão já foi atingido. Revise os limites antes de continuar.'
    this.trecho += 1
    this.fase = 'rodando'
    this.ligar()
    return null
  }

  private novaEspera() {
    if (this.esperaBase === null) return
    this.esperaAlvo = Math.max(1, Math.round(this.esperaBase * (0.55 + this.rnd() * 0.9)))
  }
  /** O dígito do próximo tick para a entrada acontecer na hora do ritmo (a análise é a da estratégia). */
  private digitoDoRitmo(): number | undefined {
    if (this.esperaBase === null || !this.caixa.rodando || this.emVoo) return undefined
    const e = this.caixa.est
    const ctx = this.caixa.contexto
    const cfg = this.caixa.config
    const falta = this.esperaAlvo - (this.esperaAtual + 1)
    const L = e.medidor?.({ digitos: ctx.digitos, config: cfg })?.alvo ?? 0
    const ordem = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => this.rnd() - 0.5)
    const como = (d: number) => {
      const digitos = [...ctx.digitos, d].slice(-120)
      return { entra: e.entrar({ ...ctx, digitos }), conta: e.medidor?.({ digitos, config: cfg })?.valor ?? 0 }
    }
    if (falta <= 0) return ordem.find((d) => como(d).entra) ?? undefined
    // ainda não: a contagem vai subindo para completar exatamente no tick certo
    const quer = Math.max(0, L - falta)
    let melhor: number | undefined, dist = Infinity
    for (const d of ordem) {
      const c = como(d)
      if (c.entra) continue
      const x = Math.abs(c.conta - quer)
      if (x < dist) { dist = x; melhor = d }
    }
    return melhor
  }

  /**
   * Um tick do mercado. Com `real` (1×), é o tick de verdade do ativo: o mesmo horário e o mesmo
   * preço da Deriv; no tick de saída de um contrato só o último dígito muda para o do roteiro.
   * Sem ele (acelerada, ou pulando), um passeio aleatório do mesmo tamanho, 2 s por tick.
   */
  passo(real?: { preco: number; epoch: number }) {
    // parada, a sessão não assina mais o preço (como o motor): a fita fica onde parou
    if (this.fase !== 'rodando') return
    this.tick += 1
    this.relogio = real ? Math.max(this.relogio + 1, real.epoch * 1000) : this.relogio + SEGUNDOS_POR_TICK * 1000
    const v = this.emVoo
    // o tick de saída já sai com o dígito do roteiro
    let digito: number | undefined
    if (v && v.entrou) {
      const quem = digitosQueGanham(v.compra.contractType, v.compra.barreira)
      const lado = v.ganhou ? quem : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => !quem.includes(d))
      digito = lado[Math.floor(this.rnd() * lado.length)]
    }
    if (digito === undefined && !real) digito = this.digitoDoRitmo()
    const p = this.proximoPreco(digito, real?.preco)
    const d = this.digitoDe(p)
    this.caixa.digitos = [...this.caixa.digitos, d].slice(-120)
    this.estado.digitos = this.caixa.digitos
    if (v) {
      if (!v.entrou) {
        v.entrou = true
        v.entrada = p
        const ganhando = digitosQueGanham(v.compra.contractType, v.compra.barreira).includes(d)
        if (this.estado.emCurso) this.estado.emCurso = { ...this.estado.emCurso, entrada: p, digitoEntrada: d, spot: p, digitoAtual: d, lucro: ganhando ? r2(v.compra.payout - v.compra.valor) : -v.compra.valor }
        return
      }
      this.liquidar(p)
      return
    }
    if (!this.caixa.rodando) return
    this.estado.ticksAnalisados += 1
    this.esperaAtual += 1
    if (this.caixa.est.entrar(this.caixa.contexto)) this.comprar()
    else this.atualizarEspera()
  }

  /** O estado para a cabine (cópia rasa: a cabine nunca mexe nele). */
  foto(): EstadoMotor {
    return { ...this.estado, registros: [...this.estado.registros], digitos: [...this.estado.digitos] }
  }
}

/** Avança um ensaio novo até a operação `n` (para voltar ou pular para um marcador). */
export function ensaioAte(r: Roteiro, plano: boolean[][], partida: PontoDePartida, t0: number, ateOperacao: number, aoFim?: Ensaio['aoFimDoTrecho']): Ensaio {
  const e = new Ensaio(r, plano, partida, t0)
  e.aoFimDoTrecho = (fim, k) => aoFim?.(fim, k)
  for (let i = 0; i < 400_000 && e.fase !== 'fim' && e.operacoes < ateOperacao; i++) {
    if (e.fase === 'entre') { if (e.religar()) break; continue }
    e.passo()
  }
  return e
}

/* ===================================================== sugestão natural */

/**
 * Números que a I.A. faria sozinha para terminar do jeito pedido (12/11/2026, Tiago: "não está
 * respeitando"): roda a caixa com ganhos e perdas sorteados na chance real do contrato até a sessão
 * bater a meta (ou o stop), e devolve quantas operações levou e a pior sequência. Com eles o gerador
 * fecha exatamente. Para "desligou", uns 30 a 60 operações naturais e o resultado em que parou.
 */
export function sugerirTrecho(r: Roteiro, k: number, fim: Fim, semente = 1): Pick<Trecho, 'operacoes' | 'sequencia' | 'momento' | 'resultado' | 'natural'> | null {
  const q = chanceDePerder(r.ia)
  const anteriores = correr({ ...r, trechos: r.trechos.slice(0, k) }, planejar({ ...r, trechos: r.trechos.slice(0, k) }).resultados)
  const t = r.trechos[k]
  const alvo = t.acerto ?? null
  let escolhida: { pct: number; volta: ReturnType<typeof montarSugestao> } | null = null
  const montarSugestao = (numeros: { operacoes: number; sequencia: number; momento: Momento; resultado: number }, lista: boolean[]) => {
    const comNumeros: Roteiro = { ...r, trechos: r.trechos.map((x, i) => (i === k ? { ...x, fim, ...numeros, natural: undefined } : x)) }
    return { ...numeros, natural: { assinatura: assinaturaDoTrecho(comNumeros, k), resultados: lista } }
  }
  for (let tentativa = 0; tentativa < (alvo === null ? 40 : 160); tentativa++) {
    const rnd = sorteio(sementeDe(JSON.stringify(['sugestao', r.ia, r.entrada, k, fim, t.meta, t.stop, semente, tentativa])))
    const cx = new Caixa(r.ia, r.saldo)
    // o placar de antes de religar
    cx.resultado = anteriores.trechos[k - 1]?.resultado ?? 0
    cx.saldo = anteriores.ops.length ? anteriores.ops[anteriores.ops.length - 1].saldo : r.saldo
    cx.ligar(configDoTrecho(r, t))
    const limite = fim === 'desligou' ? 30 + Math.floor(rnd() * 31) : 3000
    let seq = 0, maior = 0, onde = 0, n = 0
    const lista: boolean[] = []
    while (cx.rodando && n < limite) {
      const c = cx.comprar()
      if (!c) break
      const p = cx.perdasSeguidas === 0 ? q.entrada : q.recuperacao
      const ganhou = rnd() >= p
      cx.liquidar(c, ganhou, null)
      lista.push(ganhou)
      n++
      seq = ganhou ? 0 : seq + 1
      if (seq > maior) { maior = seq; onde = n }
    }
    const tipo = cx.rodando ? 'desligou' : tipoDoMotivo(cx.motivo ?? '')
    if (tipo !== fim || n === 0) continue
    const momento: Momento = onde < n * 0.33 ? 'comeco' : onde < n * 0.7 ? 'meio' : 'fim'
    // os números da sessão (a do stop conta a maior de todas, como a revisão mostra)
    const numeros = { operacoes: n, sequencia: maior, momento, resultado: cx.resultado }
    if (alvo === null) return montarSugestao(numeros, lista)
    // com acerto pedido: entre as sessões naturais, a que mais chega perto dele
    const pct = (lista.filter(Boolean).length / n) * 100
    if (!escolhida || Math.abs(pct - alvo) < Math.abs(escolhida.pct - alvo)) escolhida = { pct, volta: montarSugestao(numeros, lista) }
    if (Math.abs(pct - alvo) < 0.5) break
  }
  return escolhida?.volta ?? null
}

/* ===================================================== o tempo da sessão */

export interface Tempo { ticks: number; segundos: number; porOperacao: number; operacoes: number }
/**
 * Roda o ensaio inteiro (religando entre os trechos) com o preço gerado, 2 s por tick, e mede quanto
 * a sessão dura de verdade. Com ritmo pedido é ele; sem, o ritmo natural da análise da I.A.
 */
export function tempoDaSessao(r: Roteiro, plano: boolean[][], partida: PontoDePartida = { preco: 61234.5678, casas: 4 }): Tempo {
  const e = new Ensaio(r, plano, partida, 0)
  let ticks = 0
  for (let i = 0; i < 400_000 && e.fase !== 'fim'; i++) {
    if (e.fase === 'entre') { if (e.religar()) break; continue }
    e.passo(); ticks++
  }
  const operacoes = e.operacoes
  const segundos = ticks * SEGUNDOS_POR_TICK
  return { ticks, segundos, porOperacao: operacoes ? segundos / operacoes : 0, operacoes }
}
