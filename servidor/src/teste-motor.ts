/**
 * Provas do motor: o que desliga o robo e o que nao desliga.
 *
 *   cd servidor && npm run motor
 *
 * O robo so pode parar por tres motivos: a pessoa pediu, bateu num limite
 * que ela definiu, ou a Deriv recusou por algo que nao vai mudar sozinho.
 * Qualquer outra parada e defeito. Esta prova fixa a fronteira entre recusa
 * definitiva e passageira, que e o que decide isso.
 */
import { MotorTeeds, recusaDefinitiva, type Contexto } from '../../src/core/deriv/engine'
import { SUPERIOR_5, THE_PALM } from '../../src/core/deriv/strategies'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) certos++
  else { errados++; console.error(`✕ ${nome}: esperava ${esperado}, veio ${deu}`) }
}
conferir('saldo insuficiente desliga', recusaDefinitiva('[InsufficientBalance] Your account balance is insufficient to buy this contract.'), true)
conferir('token invalido desliga', recusaDefinitiva('[InvalidToken] The token is invalid.'), true)
conferir('mercado fechado desliga', recusaDefinitiva('[MarketIsClosed] This market is presently closed.'), true)
conferir('limite de requisicoes NAO desliga', recusaDefinitiva('[RateLimit] You have reached the rate limit.'), false)
conferir('conexao caiu NAO desliga', recusaDefinitiva('WebSocket is not open: readyState 3'), false)
conferir('tempo esgotado NAO desliga', recusaDefinitiva('A Deriv não respondeu à compra a tempo'), false)
conferir('erro generico NAO desliga', recusaDefinitiva('[ContractCreationFailure] Unable to create contract, please try again.'), false)

const memoria: Record<string, unknown> = {}
const contexto = (digitos: number[]): Contexto => ({
  digitos, perdasSeguidas: 0, vitoriasSeguidas: 0, operacoes: 0,
  resultado: 0, prejuizoDaSequencia: 0, memoria,
  config: { valorInicial: 1, valorAoVencer: 1, fatorGale: .95, galeApos: 1, valorMaximo: 0, takeProfit: 10, stopLoss: 10, maxOperacoes: 0 },
})
const vinteQuatroSemNove = Array.from({ length: 24 }, (_, i) => i % 9)
conferir('Palm arma Under 9 depois do loss virtual', THE_PALM.entrar(contexto([...vinteQuatroSemNove, 9])), true)
conferir('Palm entra na fase base real', memoria.fasePalm, 'base-real')
conferir('Palm compra Under 9 na base', THE_PALM.contrato?.(contexto([...vinteQuatroSemNove, 9])).barreira, 9)

const metadeBaixa = [...Array(12).fill(0), ...Array(12).fill(7), 8]
THE_PALM.aposResultado?.({ ...contexto(metadeBaixa), ganhou: false, contractType: 'DIGITUNDER', digitoSaida: 8 })
conferir('Palm libera recuperacao com 0-4 em 48% e loss 5-9', memoria.fasePalm, 'recuperacao-real')
conferir('Palm troca o contrato real para Under 5', THE_PALM.contrato?.(contexto(metadeBaixa)).barreira, 5)
conferir('Palm calcula primeira recuperacao pelo payout de 92,33%', THE_PALM.proximoValor({
  valorAtual: 1, valorInicial: 1, valorAoVencer: 1, ganhou: false, lucro: -1,
  perdasSeguidas: 1, prejuizoDaSequencia: 1, retornoLiquidoPorUnidade: .09,
  config: contexto([]).config, memoria, contractType: 'DIGITUNDER',
}), 2.14)
THE_PALM.aposResultado?.({ ...contexto(metadeBaixa), ganhou: true, contractType: 'DIGITUNDER', digitoSaida: 2 })
conferir('Palm volta ao virtual depois de recuperar', memoria.fasePalm, 'aquecendo')

/* ------------------------------------------------------------------ *
 * Desligar é imediato.
 *
 * A pessoa clica em Desligar: nenhuma entrada nova sai, esteja o robô na
 * base ou no meio de uma recuperação. O único rastro que fica é o contrato
 * já comprado — e ele tem de aparecer liquidado na sessão, não sumir.
 * ------------------------------------------------------------------ */
function socketFalso() {
  const canais: Record<string, (m: any) => void> = {}
  const contagem = { compras: 0 }
  const socket: any = {
    status: 'open', onStatus: () => () => {}, reconectarAgora: () => {}, disconnect: () => {},
    subscribe: (req: any, cb: (m: any) => void) => {
      const chave = req.ticks ? 'ticks' : 'contratos'
      canais[chave] = cb
      return () => { delete canais[chave] }
    },
    send: async (req: any) => {
      if (req.ticks_history) throw new Error('sem histórico no teste')
      if (req.buy) {
        contagem.compras += 1
        return { buy: { contract_id: contagem.compras, transaction_id: 1, buy_price: req.parameters.amount, payout: Number((req.parameters.amount * 2.9225).toFixed(2)), balance_after: 100, purchase_time: 1 } }
      }
      return {}
    },
  }
  return { socket, canais, contagem }
}
const respirar = () => new Promise((r) => setTimeout(r, 5))
const config = { valorInicial: 1, valorAoVencer: 1, fatorGale: .05, galeApos: 3, valorMaximo: 0, takeProfit: 100, stopLoss: 100, maxOperacoes: 0 }

async function provasDeParada() {
  {
    const { socket, canais, contagem } = socketFalso()
    const motor = new MotorTeeds({ socket, estrategia: SUPERIOR_5, config, symbol: '1HZ75V', moeda: 'USD', pipSize: 2 })
    motor.ligar()
    await respirar()
    canais.ticks({ tick: { symbol: '1HZ75V', quote: 100.12, epoch: 1, pip_size: 2 } })
    await respirar(); await respirar()
    conferir('P1 o tick comprou (contrato aberto)', [contagem.compras, motor.estadoAtual.emCurso?.contractId, motor.estadoAtual.emOperacao], [1, 1, true])

    motor.desligar('você pediu para parar')
    const e1 = motor.estadoAtual
    conferir('P2 desligar derruba rodando na hora, mantendo o contrato aberto', [e1.rodando, e1.emOperacao, e1.motivoParada], [false, true, 'você pediu para parar'])

    canais.ticks?.({ tick: { symbol: '1HZ75V', quote: 100.15, epoch: 2, pip_size: 2 } })
    await respirar(); await respirar()
    conferir('P3 depois do desligar nenhum tick compra', contagem.compras, 1)

    canais.contratos({ proposal_open_contract: { contract_id: 1, status: 'won', profit: 1.92, is_expired: 1, entry_spot: 100.12, exit_spot: 100.19, current_spot: 100.19, payout: 2.92, buy_price: 1, contract_type: 'DIGITOVER' } })
    await respirar()
    const e2 = motor.estadoAtual
    conferir('P4 o contrato aberto liquida e entra na sessão', [e2.operacoes, e2.vitorias, Number(e2.resultado.toFixed(2)), e2.historico.length, e2.historico[0]?.contractId], [1, 1, 1.92, 1, 1])
    conferir('P5 e só então a sessão fecha de vez', [e2.rodando, e2.emOperacao, e2.emCurso, e2.aguardando], [false, false, null, 'sessão encerrada'])
    const digitosAntes = e2.digitos.length
    canais.ticks?.({ tick: { symbol: '1HZ75V', quote: 100.21, epoch: 3, pip_size: 2 } })
    await respirar()
    conferir('P6 fechada, não ouve mais o mercado', [motor.estadoAtual.digitos.length, contagem.compras], [digitosAntes, 1])
  }
  {
    const { socket, canais, contagem } = socketFalso()
    const motor = new MotorTeeds({ socket, estrategia: SUPERIOR_5, config, symbol: '1HZ75V', moeda: 'USD', pipSize: 2 })
    motor.ligar()
    await respirar()
    motor.desligar('você pediu para parar')
    const e = motor.estadoAtual
    conferir('P7 sem contrato aberto, desligar fecha tudo no mesmo instante', [e.rodando, e.emOperacao, e.emCurso], [false, false, null])
    canais.ticks?.({ tick: { symbol: '1HZ75V', quote: 100.12, epoch: 1, pip_size: 2 } })
    await respirar(); await respirar()
    conferir('P8 e nada mais compra', contagem.compras, 0)
  }
  {
    // Desligou no meio de uma recuperação: a próxima entrada do martingale não sai.
    const { socket, canais, contagem } = socketFalso()
    const motor = new MotorTeeds({ socket, estrategia: SUPERIOR_5, config: { ...config, galeApos: 1 }, symbol: '1HZ75V', moeda: 'USD', pipSize: 2 })
    motor.ligar()
    await respirar()
    canais.ticks({ tick: { symbol: '1HZ75V', quote: 100.12, epoch: 1, pip_size: 2 } })
    await respirar(); await respirar()
    motor.desligar('você pediu para parar')
    canais.contratos({ proposal_open_contract: { contract_id: 1, status: 'lost', profit: -1, is_expired: 1, entry_spot: 100.12, exit_spot: 100.13, current_spot: 100.13, payout: 2.92, buy_price: 1, contract_type: 'DIGITOVER' } })
    await respirar(); await respirar()
    const e = motor.estadoAtual
    conferir('P9 perda liquidada depois do desligar não emenda a recuperação', [contagem.compras, e.derrotas, e.perdasSeguidas, e.rodando, e.emOperacao], [1, 1, 1, false, false])
  }
}

provasDeParada().then(() => {
  console.log(`\n${certos} certos, ${errados} errados`)
  process.exit(errados ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(1) })
