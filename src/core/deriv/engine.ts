import type { TeedsSocket } from './client'
import { fetchTickHistory, subscribeTicks } from './market'
import { assinarContratos, buscarContrato, comprarDireto } from './trading'
import type { OpenContract } from './trading'
import { marcarOrigem } from './robotNames'
import { ultimoDigito } from './digits'
import { recuperacaoDe, temModoAgressivo, type ParametrosDoRobo } from './parametros'
import type { Modo } from './strategies'

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
  /** Quanto a sequencia de perdas atual ja custou (numero positivo). */
  prejuizoDaSequencia: number
  config: ConfigEstrategia
  /** Estado privado desta execução; nunca é compartilhado entre clientes. */
  memoria: Record<string, unknown>
}

export interface ContratoEstrategia {
  contractType: string
  barreira?: number
}

/**
 * O que uma estratégia deixa observar de si — sem decidir nada.
 *
 * Existe para o espelho operacional e para o replay: fase virtual, análise
 * percentual, estratégia vigente e anterior, motivo da troca, barreira. É
 * leitura da memória da estratégia, feita depois da decisão; não muda
 * gatilho, cálculo, cadência nem escolha.
 */
export interface TelemetriaEstrategia {
  fase: string
  anterior: string | null
  motivo: string | null
  /** O contrato que a próxima entrada real usaria. */
  contrato: string | null
  barreira: number | null
  /** A estratégia está só observando (sem entrada real)? */
  virtual: boolean
  detalhes: Record<string, string | number | boolean>
}

/**
 * A condição de entrada em um número, para a cabine desenhar a régua.
 *
 * Existe só para a tela (22/09/2026): o motor nunca chama isto e nenhuma
 * decisão passa por aqui. É a mesma conta do `entrar`, dita em voz alta.
 *  - percentual: "7, 8 e 9 em 32% — entra a partir de 36%"
 *  - contagem: "loss virtual 1 de 2"
 */
export type Medidor =
  | { tipo: 'percentual'; valor: number; alvo: number; maximo: number; rotulo: string; amostra: number; janela: number }
  | { tipo: 'contagem'; valor: number; alvo: number; rotulo: string }

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
  /** O que a estratégia expõe de si para o espelho operacional. Só leitura. */
  telemetria?: (c: Contexto) => TelemetriaEstrategia
  /** Texto do que o robo esta esperando, para mostrar na tela. */
  aguardando: (c: Contexto) => string
  /**
   * Estado da condicao de entrada, para a tela desenhar.
   * Cada item e um requisito: o valor lido e se ele passou.
   */
  progresso?: (c: Contexto) => { rotulo: string; itens: Array<{ valor: string; ok: boolean }> }
  /**
   * A condição de entrada em um número, só para a tela. Ver `Medidor`.
   * Com `config` a leitura usa os parâmetros da sessão (loss virtual de 3
   * em vez de 4, por exemplo); sem ela, o padrão do robô.
   */
  medidor?: (c: Pick<Contexto, 'digitos'> & { config?: ConfigEstrategia }) => Medidor | null
  /**
   * Entra de novo assim que o contrato liquida, sem esperar o proximo tick.
   * Para estrategias sem filtro de entrada, que operam continuamente.
   */
  entradaContinua?: boolean
  /** Permite que uma estratégia adaptativa escolha o contrato a cada entrada. */
  contrato?: (c: Contexto) => ContratoEstrategia
  /** Atualiza a máquina de estados somente depois da liquidação confirmada. */
  aposResultado?: (c: Contexto & {
    ganhou: boolean
    contractType: string
    digitoSaida: number | null
  }) => void
  /** Proximo valor apos o resultado de uma operacao. */
  proximoValor: (args: {
    valorAtual: number
    valorInicial: number
    valorAoVencer: number
    ganhou: boolean
    lucro: number
    perdasSeguidas: number
    /** Soma das perdas da sequencia atual, em positivo. */
    prejuizoDaSequencia: number
    /** Lucro esperado para cada 1 unidade de entrada, já com margem de segurança. */
    retornoLiquidoPorUnidade: number
    config: ConfigEstrategia
    memoria: Record<string, unknown>
    contractType: string
  }) => number
}

export interface ConfigEstrategia {
  valorInicial: number
  valorAoVencer: number
  fatorGale: number
  galeApos: number
  /**
   * Parte do prejuízo da sequência que a recuperação exige como lucro, além
   * do piso `fatorGale × base`. É o que faz o modo agressivo "dar paulada":
   * quanto mais fundo a sequência, maior o lucro ao fechar. Ausente ou 0 = só o piso.
   */
  lucroSobrePrejuizo?: number
  valorMaximo: number
  takeProfit: number
  stopLoss: number
  maxOperacoes: number
  /*
    Os parâmetros publicados pelo painel para este robô nesta marca
    (22/09/2026). O motor lê daqui a cada decisão — loss virtual, escada,
    teto da plataforma. Ausente = o padrão do robô, como sempre foi.
  */
  parametros?: ParametrosDoRobo
  /** A versão publicada com que a sessão está rodando; null = padrão do código. */
  parametrosVersao?: number | null
  /** A sessão roda a versão em teste (só contas demo)? */
  parametrosTesteDemo?: boolean
  /** O modo que o cliente escolheu, explícito (antes era inferido pela margem). */
  modo?: Modo
}

/** O que o servidor manda quando o painel publica: o objeto inteiro e a versão. */
export interface ParametrosVigentes {
  parametros: ParametrosDoRobo
  versao: number | null
  testeDemo: boolean
}

/** Uma operacao ja encerrada, do jeito que a tela precisa mostrar. */
export interface OperacaoMotor {
  /** Precisão do ativo usado neste contrato; ausente nos registros antigos. */
  pipSize?: number
  n: number
  contractId: number
  valor: number
  entrada: number | null
  saida: number | null
  digitoEntrada: number | null
  digitoSaida: number | null
  lucro: number
  /** Pagamento potencial contratado, base exata do markup calculado. */
  payout: number
  /** O markup medido pela Deriv, quando ela informa. Null = nao medido. */
  markupDeriv: number | null
  ganhou: boolean
  quando: number
  /** Quantos ticks o robo esperou antes desta entrada. */
  esperou: number
  contractType: string
  barreira?: number
}

/** A operacao que esta correndo agora. */
export interface EmCurso {
  contractId: number
  valor: number
  payout: number
  entrada: number | null
  digitoEntrada: number | null
  spot: number | null
  digitoAtual: number | null
  lucro: number
  comprouEm: number
  /** Milissegundos entre decidir e a Deriv confirmar a compra. */
  latencia: number
  contractType: string
  barreira?: number
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
  /** Operacoes encerradas, da mais recente para a mais antiga. */
  historico: OperacaoMotor[]
  /** A operacao em andamento, quando ha uma. */
  emCurso: EmCurso | null
  /** Ticks analisados desde a ultima entrada — mostra que o robo esta vivo. */
  ticksAnalisados: number
  /** Media de milissegundos entre decidir e a compra ser confirmada. */
  latenciaMedia: number | null
  /**
   * A ultima recusa da Deriv, do jeito que ela veio.
   *
   * Sem isto na tela, uma compra recusada some: o robo parece rodando e
   * simplesmente nao entra, sem dizer por que.
   */
  falha: { texto: string; quando: number } | null
  /** O que a estratégia expõe de si (ver TelemetriaEstrategia). Só o espelho lê. */
  estrategia?: TelemetriaEstrategia | null
}

/** Recusas seguidas ate o robo desistir e se desligar, dizendo o motivo. */
/**
 * Quando uma compra recusada deve DESLIGAR o robô.
 *
 * Só quando a recusa não vai mudar sozinha: saldo insuficiente, autorização
 * inválida, conta bloqueada, mercado fechado. Todo o resto — oscilação da
 * conexão, limite de requisições, um "tente de novo" da Deriv — é passageiro:
 * o robô espera um pouco e volta. Desligar num tropeço desses era o que fazia
 * a sessão "parar do nada" sem ter batido em stop nenhum.
 */
export function recusaDefinitiva(texto: string): boolean {
  return /InsufficientBalance|InvalidToken|AuthorizationRequired|InvalidAccount|AccountDisabled|DisabledClient|MarketIsClosed|PermissionDenied/i.test(texto)
}
/** Recusas passageiras seguidas antes de desistir (com espera crescente entre elas). */
const LIMITE_FALHAS_PASSAGEIRAS = 12

/** Tempo sem nenhum tick que ja e motivo para desconfiar da conexao. */
const SILENCIO_MAXIMO_MS = 25_000

/**
 * Contrato aberto por mais tempo que isto merece uma consulta direta.
 * Um contrato de 1 tick liquida em ~1 s; passou de 4 s, algo se perdeu.
 */
const CONTRATO_PRESO_MS = 4_000
/** Desligado com contrato aberto: quanto tempo espera a liquidação antes de fechar de vez. */
const ENCERRAMENTO_MAXIMO_MS = 60_000

const VAZIO: EstadoMotor = {
  rodando: false, emOperacao: false, operacoes: 0, vitorias: 0, derrotas: 0,
  perdasSeguidas: 0, resultado: 0, movimentado: 0, valorAtual: 0,
  aguardando: '', motivoParada: null, registros: [], digitos: [],
  curva: [0], condicao: null, ultimoLucro: null,
  historico: [], emCurso: null, ticksAnalisados: 0, latenciaMedia: null,
  falha: null, estrategia: null,
}

export class MotorTeeds {
  private socket: TeedsSocket
  private estrategia: Estrategia
  private config: ConfigEstrategia
  private symbol: string
  private moeda: string
  private pipSize: number
  private pararTicks: (() => void) | null = null
  private pararContratos: (() => void) | null = null
  private ouvintes = new Set<(e: EstadoMotor) => void>()
  private estado: EstadoMotor = { ...VAZIO }
  private vitoriasSeguidas = 0
  private ultimoEpoch = 0
  private latencias: number[] = []
  private esperaAtual = 0
  /** Quanto a sequencia de perdas atual ja custou. Zera a cada vitoria. */
  private prejuizoDaSequencia = 0
  /** Atualizado em cada compra com o payout efetivamente contratado. */
  private retornoLiquidoPorUnidade = 1
  private ultimoTickEm = 0
  private contratoDesde = 0
  private valorEmCurso = 0
  private falhasSeguidas = 0
  /** Até quando o robô espera antes de tentar comprar de novo (recusa passageira). */
  private pausaAte = 0
  private memoria: Record<string, unknown> = {}
  private liquidados = new Set<number>()
  private vigia: ReturnType<typeof setInterval> | null = null
  /** Quando a pessoa desligou com um contrato ainda aberto: só espera ele liquidar. */
  private encerrandoDesde = 0

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

  /**
   * O que a estratégia expõe de si, para o espelho administrativo. É só
   * observação: nunca pode derrubar o robô nem mudar decisão nenhuma. Se a
   * telemetria lançar, o motor segue e o campo fica nulo — e o erro vai para
   * o registro técnico, uma vez, para não passar em silêncio.
   */
  private telemetriaSegura(ctx: Contexto): TelemetriaEstrategia | null {
    if (!this.estrategia.telemetria) return null
    try {
      return this.estrategia.telemetria(ctx) ?? null
    } catch (e) {
      if (!this.telemetriaFalhou) {
        this.telemetriaFalhou = true
        this.registrar(`Telemetria da estratégia falhou (${(e as Error).message}); o robô segue normalmente`, 'info')
      }
      return null
    }
  }
  private telemetriaFalhou = false

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
      prejuizoDaSequencia: this.prejuizoDaSequencia,
      config: this.config,
      memoria: this.memoria,
    }
  }

  ligar(anterior?: EstadoMotor) {
    if (this.estado.rodando) return
    if (anterior?.emOperacao || anterior?.rodando) throw new Error('Aguarde a conclusão da sessão antes de continuar.')
    if (anterior && ((this.config.takeProfit > 0 && anterior.resultado >= this.config.takeProfit) || (this.config.stopLoss > 0 && anterior.resultado <= -this.config.stopLoss) || (this.config.maxOperacoes > 0 && anterior.operacoes >= this.config.maxOperacoes))) throw new Error('O limite acumulado desta sessão já foi atingido. Revise os limites antes de continuar.')
    this.estado = { ...VAZIO, ...(anterior ? { operacoes: anterior.operacoes, vitorias: anterior.vitorias, derrotas: anterior.derrotas, resultado: anterior.resultado, movimentado: anterior.movimentado, historico: [...anterior.historico], curva: [...anterior.curva], registros: [...anterior.registros] } : {}), rodando: true, valorAtual: this.config.valorInicial, digitos: [], ...(!anterior ? { curva: [0] } : {}) }
    this.ultimoEpoch = 0
    this.latencias = []
    this.esperaAtual = 0
    this.prejuizoDaSequencia = 0
    this.memoria = {}
    this.liquidados = new Set()
    this.registrar(`Robô ligado — ${this.estrategia.nome}`, 'info')
    this.estado.aguardando = 'lendo o histórico do ativo…'
    this.emitir()

    // Sem isto o robo precisaria de tres ticks so para poder olhar a condicao.
    // Com o historico na mao ele ja pode entrar no primeiro tick que chegar.
    void this.semear()

    this.pararTicks = subscribeTicks(this.symbol, (t) => {
      // o mesmo tick pode chegar duas vezes (replay da central + stream)
      if (t.epoch && t.epoch === this.ultimoEpoch) return
      this.ultimoEpoch = t.epoch ?? 0

      this.ultimoTickEm = Date.now()
      const d = ultimoDigito(t.quote, t.pipSize || this.pipSize)
      this.estado.digitos = [...this.estado.digitos, d].slice(-120)
      if (!this.estado.rodando || this.estado.emOperacao) { this.emitir(); return }

      this.estado.ticksAnalisados += 1
      this.esperaAtual += 1

      const ctx = this.contexto
      if (this.estrategia.entrar(ctx)) {
        this.estado.estrategia = this.telemetriaSegura(ctx)
        void this.comprar()
      } else {
        this.estado.aguardando = this.estrategia.aguardando(ctx)
        this.estado.condicao = this.estrategia.progresso?.(ctx) ?? null
        this.estado.estrategia = this.telemetriaSegura(ctx)
        this.emitir()
      }
    }, this.socket)

    // Uma assinatura para todos os contratos da conta, em vez de uma por
    // operacao: e o que impede o teto de 100 assinaturas de estourar.
    this.pararContratos = assinarContratos(
      this.socket,
      (c) => this.receber(c),
      (erro) => this.registrar(`Stream de contratos recusado (${erro})`, 'info'),
    )

    // Vigia: um socket "meio aberto" nao dispara onclose, e o robo ficaria
    // esperando um preco que nunca chega. Silencio longo = reconecta.
    this.ultimoTickEm = Date.now()
    this.vigia = setInterval(() => {
      if (!this.estado.rodando) {
        // Desligado com contrato aberto: só confere se ele liquidou. Se a
        // Deriv não disser nada por muito tempo, fecha mesmo assim — a
        // sessão não pode ficar "encerrando" para sempre.
        const emCurso = this.estado.emCurso
        if (emCurso && this.contratoDesde && Date.now() - this.contratoDesde > CONTRATO_PRESO_MS) void this.conferirContrato(emCurso.contractId, emCurso.valor)
        if (this.encerrandoDesde && Date.now() - this.encerrandoDesde > ENCERRAMENTO_MAXIMO_MS) {
          this.estado.emOperacao = false
          this.estado.emCurso = null
          this.registrar('A Deriv não confirmou o contrato em andamento a tempo; a sessão fecha sem ele. Confira o resultado no extrato da Deriv.', 'parada')
          this.concluirParada()
        }
        return
      }
      const silencio = Date.now() - this.ultimoTickEm
      // contrato de 1 tick nao passa de meio minuto aberto: algo se perdeu
      if (this.contratoDesde && Date.now() - this.contratoDesde > CONTRATO_PRESO_MS) {
        const emCurso = this.estado.emCurso
        if (emCurso) void this.conferirContrato(emCurso.contractId, emCurso.valor)
      }
      if (silencio < SILENCIO_MAXIMO_MS) return
      this.ultimoTickEm = Date.now()
      this.registrar('Sem preço há um tempo — refazendo a conexão', 'info')
      this.estado.aguardando = 'sem sinal do mercado — reconectando'
      this.emitir()
      this.socket.reconectarAgora()
    }, 2_000)
  }

  /** Carrega os ultimos digitos do ativo para o robo comecar ja abastecido. */
  private async semear() {
    try {
      const ticks = await fetchTickHistory(this.symbol, 60, this.socket)
      if (!this.estado.rodando || this.estado.digitos.length >= 3) return
      const lidos = ticks.map((t) => ultimoDigito(t.quote, t.pipSize || this.pipSize))
      // o que ja chegou pelo stream tem prioridade: entra no fim
      this.estado.digitos = [...lidos, ...this.estado.digitos].slice(-120)
      const ctx = this.contexto
      this.estado.aguardando = this.estrategia.aguardando(ctx)
      this.estado.condicao = this.estrategia.progresso?.(ctx) ?? null
      this.estado.estrategia = this.telemetriaSegura(ctx)
      this.emitir()
    } catch {
      // sem historico o robo so demora alguns ticks a mais para se orientar
    }
  }

  /** O socket que este motor usa — serve para detectar troca de conta. */
  get conexao(): TeedsSocket {
    return this.socket
  }

  /** A configuração com que o motor está rodando (o mesmo objeto, atualizado no lugar). */
  get configuracao(): ConfigEstrategia {
    return this.config
  }

  /** Parâmetros publicados que esperam o contrato aberto liquidar. Só leitura. */
  get parametrosAguardando(): ParametrosVigentes | null {
    return this.parametrosPendentes
  }

  private parametrosPendentes: ParametrosVigentes | null = null

  /**
   * O painel publicou parâmetros novos para este robô (22/09/2026, "muda
   * na hora mediante aprovação").
   *
   * Nunca no meio de um contrato: com compra em andamento, fica pendente e
   * entra em `liquidar()`, antes da próxima entrada ser calculada. Sem
   * contrato aberto, entra agora — e, se o robô está numa sequência de
   * recuperação, a próxima entrada é recalculada pela regra nova a partir
   * do prejuízo real que já existe. Stop, meta, teto e entrada base do
   * cliente não são tocados.
   */
  atualizarParametros(vigente: ParametrosVigentes): void {
    if (this.estado.emOperacao || this.estado.emCurso) {
      this.parametrosPendentes = vigente
      return
    }
    this.aplicarParametros(vigente, true)
  }

  private aplicarParametros(v: ParametrosVigentes, agora: boolean) {
    // O modo é do cliente; se o robô deixou de oferecer o agressivo, cai para o conservador.
    const modoAtual: Modo = this.config.modo ?? ((this.config.lucroSobrePrejuizo ?? 0) > 0 ? 'agressivo' : 'conservador')
    const modo: Modo = modoAtual === 'agressivo' && temModoAgressivo(v.parametros) ? 'agressivo' : 'conservador'
    const rec = recuperacaoDe(v.parametros, modo)
    // No lugar, e não um objeto novo: o servidor e o espelho guardam a mesma referência.
    Object.assign(this.config, {
      parametros: v.parametros, parametrosVersao: v.versao, parametrosTesteDemo: v.testeDemo, modo,
      galeApos: rec.galeApos, fatorGale: rec.margem, lucroSobrePrejuizo: rec.sobrePrejuizo,
    })
    if (agora && this.estado.rodando) {
      if (this.estado.perdasSeguidas > 0) {
        this.estado.valorAtual = this.estrategia.proximoValor({
          valorAtual: this.estado.valorAtual,
          valorInicial: this.config.valorInicial,
          valorAoVencer: this.config.valorAoVencer,
          ganhou: false,
          lucro: 0,
          perdasSeguidas: this.estado.perdasSeguidas,
          prejuizoDaSequencia: this.prejuizoDaSequencia,
          retornoLiquidoPorUnidade: this.retornoLiquidoPorUnidade,
          config: this.config,
          memoria: this.memoria,
          contractType: this.estado.historico[0]?.contractType ?? this.estrategia.contractType,
        })
      } else {
        this.estado.valorAtual = this.config.valorAoVencer
      }
    }
    const rotulo = v.versao === null ? 'o padrão da plataforma' : `a versão ${v.versao}${v.testeDemo ? ' (teste no demo)' : ''}`
    this.registrar(`Parâmetros do robô atualizados para ${rotulo}.`, 'info')
    if (agora) {
      const ctx = this.contexto
      this.estado.estrategia = this.telemetriaSegura(ctx)
      if (this.estado.rodando && !this.estado.emOperacao) {
        this.estado.aguardando = this.estrategia.aguardando(ctx)
        this.estado.condicao = this.estrategia.progresso?.(ctx) ?? null
      }
      this.emitir()
    }
  }

  /** "Parar" no fim da tabela: a sessão fecha por decisão da plataforma, não do cliente. */
  private tabelaEsgotada() {
    this.estado.valorAtual = this.config.valorAoVencer
    const n = this.config.parametros?.recuperacao.escada.tipo === 'tabela' ? this.config.parametros.recuperacao.escada.degraus.length : 0
    this.registrar(`A tabela de recuperação chegou ao fim (${n} degraus sem vitória): o robô parou conforme a configuração da plataforma.`, 'parada')
    this.desligar('tabela de recuperação esgotada')
  }

  /** Leitura do estado atual, sem precisar assinar. */
  get estadoAtual(): EstadoMotor {
    return this.estado
  }

  /**
   * Desliga na hora.
   *
   * `rodando` cai imediatamente: nenhuma entrada nova sai daqui, esteja o
   * robô na base ou no meio de uma recuperação. A única coisa que continua
   * é o contrato já comprado — ele é da Deriv, não dá para desfazer; o motor
   * fica ouvindo só até ele liquidar, contabiliza e então fecha tudo. Antes,
   * desligar também cortava o stream de contratos, e a operação em andamento
   * sumia da sessão sem resultado.
   */
  desligar(motivo = 'você desligou') {
    if (!this.estado.rodando) return
    this.estado.rodando = false
    this.estado.motivoParada = motivo
    this.pausaAte = 0
    this.pararTicks?.(); this.pararTicks = null
    if (this.estado.emOperacao) {
      this.encerrandoDesde = Date.now()
      this.estado.aguardando = 'concluindo o contrato em andamento…'
      this.registrar(`Robô parado — ${motivo}. Concluindo o contrato em andamento.`, 'parada')
      this.emitir()
      return
    }
    this.fechar()
    this.registrar(`Robô parado — ${motivo}`, 'parada')
    this.emitir()
  }

  /** Solta o que ainda estava ligado à Deriv. Depois disto o motor não recebe mais nada. */
  private fechar() {
    this.encerrandoDesde = 0
    this.pararTicks?.(); this.pararTicks = null
    this.pararContratos?.(); this.pararContratos = null
    if (this.vigia) { clearInterval(this.vigia); this.vigia = null }
  }

  /** O contrato que ficou aberto no desligar acabou de liquidar: agora fecha de verdade. */
  private concluirParada() {
    this.estado.aguardando = 'sessão encerrada'
    this.fechar()
    this.registrar('Contrato concluído — sessão encerrada.', 'parada')
    this.emitir()
  }

  /** A menor entrada que a Deriv aceita nos indices de volatilidade. */
  private static readonly ENTRADA_MINIMA = 0.35

  /**
   * O quanto ainda cabe dentro do stop loss.
   *
   * O motor conferia o stop **depois** de cada operacao, entao a perda final
   * passava do limite — e com o martingale ligado passava muito: uma sessao
   * de AG7 com stop 2 fechou em -3,00, uma de AG2 com stop 20 fechou em
   * -21,31. Quem contratou um freio de 20 nao espera perder 21.
   *
   * Agora a entrada e aparada para caber no que resta. Se o que resta for
   * menor que a entrada minima da Deriv, nao da para operar sem furar o
   * limite: a sessao para, dizendo isso.
   */
  private valorQueCabeNoStop(desejado: number): { valor: number; cabe: boolean } {
    const stop = this.config.stopLoss
    if (!(stop > 0)) return { valor: desejado, cabe: true }

    // resultado e negativo quando ha prejuizo; a folga e o que falta para o stop
    const folga = stop + Math.min(0, this.estado.resultado)
    if (folga >= desejado) return { valor: desejado, cabe: true }
    if (folga >= MotorTeeds.ENTRADA_MINIMA) {
      return { valor: Number(folga.toFixed(2)), cabe: true }
    }
    return { valor: 0, cabe: false }
  }

  private async comprar() {
    if (!this.estado.rodando) return
    // Depois de uma recusa passageira, espera passar o intervalo antes de insistir.
    if (Date.now() < this.pausaAte) return
    // A tabela de recuperação acabou com "parar": não há próxima entrada.
    if (!Number.isFinite(this.estado.valorAtual)) { this.tabelaEsgotada(); return }
    let desejado = Math.min(
      Math.max(MotorTeeds.ENTRADA_MINIMA, Number(this.estado.valorAtual.toFixed(2))),
      this.config.valorMaximo || Infinity,
    )
    // O teto da plataforma (painel) só APARA: a entrada desce até ele e o
    // robô segue. O teto do cliente (valorMaximo) continua parando a sessão.
    const tetoDaPlataforma = this.config.parametros?.limites.valorMaximoPorEntrada ?? 0
    if (tetoDaPlataforma > 0 && desejado > tetoDaPlataforma) {
      const aparado = Math.max(MotorTeeds.ENTRADA_MINIMA, Number(tetoDaPlataforma.toFixed(2)))
      this.registrar(`Entrada reduzida de ${this.moeda} ${desejado.toFixed(2)} para ${this.moeda} ${aparado.toFixed(2)}: teto da plataforma para este robô.`, 'info')
      desejado = aparado
    }

    const { valor, cabe } = this.valorQueCabeNoStop(desejado)
    if (!cabe) {
      this.registrar(
        `Parou antes de furar o limite de perda: a próxima entrada de ${this.moeda} ` +
        `${desejado.toFixed(2)} passaria do stop de ${this.moeda} ${this.config.stopLoss.toFixed(2)}.`,
        'parada',
      )
      this.desligar(`limite de perda protegido (${this.moeda} ${this.config.stopLoss.toFixed(2)})`)
      return
    }
    if (valor < desejado) {
      this.registrar(
        `Entrada reduzida de ${this.moeda} ${desejado.toFixed(2)} para ${this.moeda} ` +
        `${valor.toFixed(2)} para não passar do limite de perda.`,
        'info',
      )
    }

    this.estado.emOperacao = true
    this.estado.aguardando = 'comprando…'
    this.emitir()

    const partiu = Date.now()
    const contrato = this.estrategia.contrato?.(this.contexto) ?? {
      contractType: this.estrategia.contractType,
      barreira: this.estrategia.barreira,
    }

    try {
      // Uma chamada so: no proposal->buy o tick que disparou a entrada ja
      // teria passado antes da compra chegar.
      const recibo = await comprarDireto(
        this.socket,
        {
          symbol: this.symbol,
          contractType: contrato.contractType,
          amount: valor,
          duration: this.estrategia.ticks,
          durationUnit: 't',
          currency: this.moeda,
          ...(contrato.barreira !== undefined ? { barrier: String(contrato.barreira) } : {}),
        },
        // teto de deslizamento: o custo nunca deve passar do valor da entrada
        Number((valor * 1.01).toFixed(2)),
      )

      // deixa a marca para o historico saber de quem foi a operacao
      marcarOrigem(recibo.contractId, this.estrategia.nome)

      const latencia = Date.now() - partiu
      this.latencias = [...this.latencias, latencia].slice(-30)
      this.estado.latenciaMedia = Math.round(
        this.latencias.reduce((t, n) => t + n, 0) / this.latencias.length,
      )
      this.estado.movimentado += recibo.buyPrice || valor
      this.estado.emCurso = {
        contractId: recibo.contractId,
        valor: recibo.buyPrice || valor,
        payout: recibo.payout,
        entrada: null,
        digitoEntrada: null,
        spot: null,
        digitoAtual: null,
        lucro: 0,
        comprouEm: Date.now(),
        latencia,
        contractType: contrato.contractType,
        ...(contrato.barreira !== undefined ? { barreira: contrato.barreira } : {}),
      }
      const custo = recibo.buyPrice || valor
      const retorno = custo > 0 ? (recibo.payout - custo) / custo : 0
      if (Number.isFinite(retorno) && retorno > 0) this.retornoLiquidoPorUnidade = retorno
      this.falhasSeguidas = 0
      this.estado.falha = null
      this.registrar(
        `Entrou com ${this.moeda} ${(recibo.buyPrice || valor).toFixed(2)} · pagamento ${this.moeda} ${recibo.payout.toFixed(2)}`,
        'compra',
      )
      this.emitir()
      this.acompanhar(recibo.contractId, recibo.buyPrice || valor)
    } catch (e) {
      const texto = (e as Error).message
      this.falhasSeguidas += 1
      this.estado.falha = { texto, quando: Date.now() }
      this.estado.emOperacao = false
      this.estado.emCurso = null
      this.registrar(`Compra recusada: ${texto}`, 'parada')

      // A pessoa desligou enquanto a compra estava no ar e ela não saiu: nada a concluir.
      if (!this.estado.rodando) { this.concluirParada(); return }

      // Recusa que nao vai mudar sozinha: desliga e diz o motivo exato.
      if (recusaDefinitiva(texto)) {
        this.desligar(`a Deriv recusou a compra — ${texto}`)
        return
      }
      // Recusa passageira: espera (2s, 4s, 6s... ate 30s) e tenta de novo.
      // So desiste depois de muitas seguidas — e ai diz quantas e por que.
      if (this.falhasSeguidas >= LIMITE_FALHAS_PASSAGEIRAS) {
        this.desligar(`a Deriv recusou ${LIMITE_FALHAS_PASSAGEIRAS} compras seguidas — ${texto}`)
        return
      }
      const espera = Math.min(30_000, 2_000 * this.falhasSeguidas)
      this.pausaAte = Date.now() + espera
      this.estado.aguardando = `a Deriv recusou a compra — tentando de novo em ${Math.round(espera / 1000)}s`
      this.emitir()
    }
  }

  /** Marca o inicio do acompanhamento. O stream ja esta aberto desde o ligar. */
  private acompanhar(contractId: number, valor: number) {
    this.contratoDesde = Date.now()
    this.valorEmCurso = valor
  }

  /** Recebe qualquer contrato da conta e reage se for o nosso. */
  private receber(c: OpenContract) {
    const emCurso = this.estado.emCurso
    if (!emCurso || c.contractId !== emCurso.contractId) return
    const casas = c.pipSizeInformado === false ? this.pipSize : (c.pipSize ?? this.pipSize)

    if (c.status === 'open' && !c.isExpired) {
      this.estado.emCurso = {
        ...emCurso,
        entrada: c.entrySpot,
        digitoEntrada: c.entrySpot !== null ? ultimoDigito(c.entrySpot, casas) : null,
        spot: c.currentSpot,
        digitoAtual: c.currentSpot !== null ? ultimoDigito(c.currentSpot, casas) : null,
        lucro: c.profit,
        payout: c.payout || emCurso.payout,
      }
      this.emitir()
      return
    }
    this.liquidar(c, c.contractId, this.valorEmCurso || emCurso.valor)
  }

  /**
   * Pergunta o estado de um contrato sem assinar nada.
   *
   * Rede de seguranca para quando o stream nao chega: um contrato de 1 tick
   * que passa de meio minuto aberto nao esta correndo, esta perdido.
   */
  private async conferirContrato(contractId: number, valor: number) {
    // Vale também com o robô já desligado: é o contrato que ficou aberto que se confere.
    if (this.estado.emCurso?.contractId !== contractId) return
    try {
      const c = await buscarContrato(this.socket, contractId)
      if (this.estado.emCurso?.contractId !== contractId) return
      if (c.status === 'open' && !c.isExpired) return
      this.liquidar(c, contractId, valor)
    } catch {
      // segue tentando no proximo ciclo do vigia
    }
  }

  private liquidar(c: OpenContract, contractId: number, valor: number) {
    // O stream e a consulta direta podem chegar juntos: cada contrato so
    // pode ser contabilizado uma vez.
    if (this.liquidados.has(contractId)) return
    this.liquidados.add(contractId)
    if (this.liquidados.size > 300) {
      this.liquidados = new Set([...this.liquidados].slice(-150))
    }
    this.contratoDesde = 0
    const casas = c.pipSizeInformado === false ? this.pipSize : (c.pipSize ?? this.pipSize)

      const ganhou = c.status === 'won' || c.profit > 0
      this.estado.operacoes += 1
      this.estado.resultado += c.profit
      this.estado.emOperacao = false
      this.estado.ultimoLucro = c.profit
      this.estado.curva = [...this.estado.curva, this.estado.resultado].slice(-200)

      const entrada = c.entrySpot ?? this.estado.emCurso?.entrada ?? null
      // A cotação corrente não comprova o preço de liquidação do contrato.
      const saida = c.exitSpot ?? null
      this.estado.historico = [
        {
          n: this.estado.operacoes,
          contractId,
          pipSize: casas,
          valor,
          entrada,
          saida,
          digitoEntrada: entrada !== null ? ultimoDigito(entrada, casas) : null,
          digitoSaida: saida !== null ? ultimoDigito(saida, casas) : null,
          lucro: c.profit,
          payout: this.estado.emCurso?.payout ?? c.payout ?? 0,
          markupDeriv: c.appMarkup ?? null,
          ganhou,
          quando: Date.now(),
          esperou: this.esperaAtual,
          contractType: this.estado.emCurso?.contractType ?? this.estrategia.contractType,
          ...(this.estado.emCurso?.barreira !== undefined ? { barreira: this.estado.emCurso.barreira } : {}),
        },
        ...this.estado.historico,
      ]
      this.esperaAtual = 0
      this.estado.ticksAnalisados = 0
      this.estado.emCurso = null

      if (ganhou) {
        this.estado.vitorias += 1
        this.estado.perdasSeguidas = 0
        this.prejuizoDaSequencia = 0
        this.vitoriasSeguidas += 1
        this.registrar(`Ganhou ${this.moeda} ${c.profit.toFixed(2)}`, 'ganho')
      } else {
        this.estado.derrotas += 1
        this.estado.perdasSeguidas += 1
        this.prejuizoDaSequencia += Math.abs(c.profit)
        this.vitoriasSeguidas = 0
        this.registrar(`Perdeu ${this.moeda} ${Math.abs(c.profit).toFixed(2)}`, 'perda')
      }

      const contratoLiquidado = this.estado.historico[0]?.contractType ?? this.estrategia.contractType
      this.estrategia.aposResultado?.({
        ...this.contexto,
        ganhou,
        contractType: contratoLiquidado,
        digitoSaida: saida !== null ? ultimoDigito(saida, casas) : null,
      })

      // A estratégia acabou de reagir ao resultado: o que ela expõe de si muda aqui.
      this.estado.estrategia = this.telemetriaSegura(this.contexto)

      // O painel publicou parâmetros novos enquanto este contrato corria:
      // entram AGORA, antes de calcular a próxima entrada — nunca no meio.
      if (this.parametrosPendentes) {
        const v = this.parametrosPendentes
        this.parametrosPendentes = null
        this.aplicarParametros(v, false)
      }

      this.estado.valorAtual = this.estrategia.proximoValor({
        valorAtual: valor,
        valorInicial: this.config.valorInicial,
        valorAoVencer: this.config.valorAoVencer,
        ganhou,
        lucro: c.profit,
        perdasSeguidas: this.estado.perdasSeguidas,
        prejuizoDaSequencia: this.prejuizoDaSequencia,
        retornoLiquidoPorUnidade: this.retornoLiquidoPorUnidade,
        config: this.config,
        memoria: this.memoria,
        contractType: contratoLiquidado,
      })

      // A pessoa já tinha desligado: este era o contrato que faltava concluir.
      if (!this.estado.rodando) { this.concluirParada(); return }

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
      // Tabela de recuperação com "parar": passou do último degrau sem vitória.
      // Freio próprio e explícito — não depende de o cliente ter definido teto.
      if (!Number.isFinite(this.estado.valorAtual)) { this.tabelaEsgotada(); return }

      this.emitir()

      // Sem filtro de entrada nao ha o que esperar: emenda a proxima assim
      // que esta liquida, em vez de perder um tick parado.
      if (this.estrategia.entradaContinua && this.estado.rodando) {
        const ctx = this.contexto
        if (this.estrategia.entrar(ctx)) void this.comprar()
      }
  }
}
