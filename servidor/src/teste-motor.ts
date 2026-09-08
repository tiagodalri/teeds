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
import { recusaDefinitiva, type Contexto } from '../../src/core/deriv/engine'
import { THE_PALM } from '../../src/core/deriv/strategies'

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
console.log(`\n${certos} certos, ${errados} errados`)
process.exit(errados ? 1 : 0)
