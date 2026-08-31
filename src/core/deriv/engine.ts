import type { TeedsSocket } from './client'
import { subscribeTicks } from './market'
import { buyFromProposal, requestProposal, subscribeContract } from './trading'
import { ultimoDigito } from './digits'

/**
 * Motor de estrategias da Teeds.
 *
 * Os robos de servidor da Deriv so aceitam Martingale e D'Alembert com um
 * contrato fixo. Estrategias com filtro de entrada — "so entra se os tres
 * ultimos digitos forem X" — precisam de um motor proprio. Este roda no
 * navegador: enquanto a Teeds estiver aberta, ele opera.
 */

export interface Contexto {
  /** Ultimos digitos, do mais antigo para o mais recente. */
  digitos: number[]
  /** Perdas seguidas ate agora. */
  perdasSeguidas: number
  vitoriasSeguidas: number
  operacoes: number
  resultado: number
}

export interface Estrategia {
  id: string
  nome: string
  descricao: string
  origem?: string
  contractType: string
  barreira?: number
  ticks: number
  /** Decide se entra agora. */
  entrar: (c: Contexto) => boolean
  /** Texto do que o robo esta esperando, para mostrar na tela. */
  aguardando: (c: Contexto) => string
  /**
   * Estado da condicao de entrada, para a tela desenhar.
   * Cada item e um requisito: o valor lido e se ele passou.
   */
  progresso?: (c: Contexto) => { rotulo: string; itens: Array<{ valor: string; ok: boolean }> }
  /** Proximo valor apos o resultado de uma operacao. */
  proximoValor: (args: {
    valorAtual: number
    valorInicial: number
    valorAoVencer: number
    ganhou: boolean
    lucro: number
    perdasSeguidas: number
    config: ConfigEstrategia
  }) => number
}

export interface ConfigEstrategia {
  valorInicial: number
  valorAoVencer: number
  fatorGale: number
  galeApos: number
  valorMaximo: number
  takeProfit: number
  stopLoss: number
  maxOperacoes: number
}

export interface Registro {
  hora: number
  texto: string
  tipo: 'info' | 'compra' | 'ganho' | 'perda' | 'parada' | 'espera'
}

export interface EstadoMotor {
  rodando: boolean
  emOperacao: boolean
  operacoes: number
  vitorias: number
  derrotas: number
  perdasSeguidas: number
  resultado: number
  movimentado: number
  valorAtual: number
  aguardando: string
  motivoParada: string | null
  registros: Registro[]
  digitos: number[]
  /** Resultado acumulado depois de cada operacao, para desenhar a curva. */
  curva: number[]
  condicao: { rotulo: string; itens: Array<{ valor: string; ok: boolean }> } | null
  ultimoLucro: number | null
}

const VAZIO: EstadoMotor = {
  rodando: false, emOperacao: false, operacoes: 0, vitorias: 0, derrotas: 0,
  perdasSeguidas: 0, resultado: 0, movimentado: 0, valorAtual: 0,
  aguardando: '', motivoParada: null, registros: [], digitos: [],
  curva: [0], condicao: null, ultimoLucro: null,
}

export class MotorTeeds {
  private socket: TeedsSocket
  private estrategia: Estrategia
  private config: ConfigEstrategia
  private symbol: string
  private moeda: string
  private pipSize: number
  private pararTicks: (() => void) | null = null
  private pararContrato: (() => void) | null = null
  private ouvintes = new Set<(e: EstadoMotor) => void>()
  private estado: EstadoMotor = { ...VAZIO }
  private vitoriasSeguidas = 0

  constructor(opts: {
    socket: TeedsSocket
    estrategia: Estrategia
    config: ConfigEstrategia
    symbol: string
    moeda: string
    pipSize: number
  }) {
    this.socket = opts.socket
    this.estrategia = opts.estrategia
    this.config = opts.config
    this.symbol = opts.symbol
    this.moeda = opts.moeda
    this.pipSize = opts.pipSize
    this.estado.valorAtual = opts.config.valorInicial
  }

  escutar(fn: (e: EstadoMotor) => void): () => void {
    this.ouvintes.add(fn)
    fn(this.estado)
    return () => this.ouvintes.delete(fn)
  }

  private emitir() {
    const copia = { ...this.estado, registros: [...this.estado.registros] }
    this.ouvintes.forEach((f) => f(copia))
  }

  private registrar(texto: string, tipo: Registro['tipo'] = 'info') {
    this.estado.registros = [{ hora: Date.now() / 1000, texto, tipo }, ...this.estado.registros].slice(0, 200)
  }

  private get contexto(): Contexto {
    return {
      digitos: this.estado.digitos,
      perdasSeguidas: this.estado.perdasSeguidas,
      vitoriasSeguidas: this.vitoriasSeguidas,
      operacoes: this.estado.operacoes,
      resultado: this.estado.resultado,
    }
  }

  ligar() {
    if (this.estado.rodando) return
    this.estado = { ...VAZIO, rodando: true, valorAtual: this.config.valorInicial, digitos: [], curva: [0] }
    this.registrar(`Robô ligado — ${this.estrategia.nome}`, 'info')
    this.emitir()

    this.pararTicks = subscribeTicks(this.symbol, (t) => {
      const d = ultimoDigito(t.quote, t.pipSize || this.pipSize)
      this.estado.digitos = [...this.estado.digitos, d].slice(-60)
      if (!this.estado.rodando || this.estado.emOperacao) { this.emitir(); return }

      const ctx = this.contexto
      if (this.estrategia.entrar(ctx)) {
        void this.comprar()
      } else {
        this.estado.aguardando = this.estrategia.aguardando(ctx)
        this.estado.condicao = this.estrategia.progresso?.(ctx) ?? null
        this.emitir()
      }
    }, this.socket)
  }

  desligar(motivo = 'você desligou') {
    if (!this.estado.rodando) return
    this.estado.rodando = false
    this.estado.motivoParada = motivo
    this.pararTicks?.(); this.pararTicks = null
    this.pararContrato?.(); this.pararContrato = null
    this.registrar(`Robô parado — ${motivo}`, 'parada')
    this.emitir()
  }

  private async comprar() {
    this.estado.emOperacao = true
    this.estado.aguardando = 'comprando…'
    this.emitir()

    const valor = Math.min(
      Math.max(0.35, Number(this.estado.valorAtual.toFixed(2))),
      this.config.valorMaximo || Infinity,
    )

    try {
      const p = await requestProposal(this.socket, {
        symbol: this.symbol,
        contractType: this.estrategia.contractType,
        amount: valor,
        duration: this.estrategia.ticks,
        durationUnit: 't',
        currency: this.moeda,
        ...(this.estrategia.barreira !== undefined ? { barrier: String(this.estrategia.barreira) } : {}),
      })
      const recibo = await buyFromProposal(this.socket, p.id, p.askPrice)
      this.estado.movimentado += valor
      this.registrar(`Entrou com ${this.moeda} ${valor.toFixed(2)}`, 'compra')
      this.emitir()
      this.acompanhar(recibo.contractId, valor)
    } catch (e) {
      this.registrar(`Falha ao comprar: ${(e as Error).message}`, 'parada')
      this.estado.emOperacao = false
      this.emitir()
    }
  }

  private acompanhar(contractId: number, valor: number) {
    this.pararContrato?.()
    this.pararContrato = subscribeContract(this.socket, contractId, (c) => {
      if (c.status === 'open' && !c.isExpired) return
      this.pararContrato?.(); this.pararContrato = null

      const ganhou = c.status === 'won' || c.profit > 0
      this.estado.operacoes += 1
      this.estado.resultado += c.profit
      this.estado.emOperacao = false
      this.estado.ultimoLucro = c.profit
      this.estado.curva = [...this.estado.curva, this.estado.resultado].slice(-200)

      if (ganhou) {
        this.estado.vitorias += 1
        this.estado.perdasSeguidas = 0
        this.vitoriasSeguidas += 1
        this.registrar(`Ganhou ${this.moeda} ${c.profit.toFixed(2)}`, 'ganho')
      } else {
        this.estado.derrotas += 1
        this.estado.perdasSeguidas += 1
        this.vitoriasSeguidas = 0
        this.registrar(`Perdeu ${this.moeda} ${Math.abs(c.profit).toFixed(2)}`, 'perda')
      }

      this.estado.valorAtual = this.estrategia.proximoValor({
        valorAtual: valor,
        valorInicial: this.config.valorInicial,
        valorAoVencer: this.config.valorAoVencer,
        ganhou,
        lucro: c.profit,
        perdasSeguidas: this.estado.perdasSeguidas,
        config: this.config,
      })

      // freios
      if (this.config.takeProfit > 0 && this.estado.resultado >= this.config.takeProfit) {
        this.desligar(`meta de lucro atingida (${this.moeda} ${this.estado.resultado.toFixed(2)})`)
        return
      }
      if (this.config.stopLoss > 0 && this.estado.resultado <= -this.config.stopLoss) {
        this.desligar(`limite de perda atingido (${this.moeda} ${this.estado.resultado.toFixed(2)})`)
        return
      }
      if (this.config.maxOperacoes > 0 && this.estado.operacoes >= this.config.maxOperacoes) {
        this.desligar(`limite de ${this.config.maxOperacoes} operações`)
        return
      }
      if (this.config.valorMaximo > 0 && this.estado.valorAtual > this.config.valorMaximo) {
        this.desligar(`próxima entrada (${this.estado.valorAtual.toFixed(2)}) passaria do teto`)
        return
      }
      this.emitir()
    })
  }
}
