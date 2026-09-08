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
import { recusaDefinitiva } from '../../src/core/deriv/engine'

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
console.log(`\n${certos} certos, ${errados} errados`)
process.exit(errados ? 1 : 0)
