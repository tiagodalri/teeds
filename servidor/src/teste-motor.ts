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
import { definirTempoDaDeriv, fetchAccounts, fetchTradingSocketUrl, createAccount } from '../../src/core/deriv/account'
import { SUPERIOR_5, AG_2, FIRST_BLOCK, SECOND_BLOCK, SMART_03, THE_PALM, OMNI_OVER, OMNI_BULL, OMNI_BEAR, temModos } from '../../src/core/deriv/strategies'
import { escadaDoRobo } from '../../src/core/deriv/escada'
import { toOpenContract } from '../../src/core/deriv/trading'
import { precisaoInformada } from '../../src/core/deriv/types'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) certos++
  else { errados++; console.error(`✕ ${nome}: esperava ${esperado}, veio ${deu}`) }
}
conferir('precisão ausente não inventa duas casas', precisaoInformada(undefined), null)
conferir('precisão zero é válida', precisaoInformada(0), 0)
conferir('passo decimal é convertido', precisaoInformada(.0001), 4)
conferir('contrato sem pip preserva ausência', toOpenContract({underlying_symbol:'R_75'}).pipSizeInformado, false)
conferir('R75 sem pip tem quatro casas no cartão manual', toOpenContract({underlying_symbol:'R_75'}).pipSize, 4)
conferir('saldo insuficiente desliga', recusaDefinitiva('[InsufficientBalance] Your account balance is insufficient to buy this contract.'), true)
conferir('token invalido desliga', recusaDefinitiva('[InvalidToken] The token is invalid.'), true)
conferir('mercado fechado desliga', recusaDefinitiva('[MarketIsClosed] This market is presently closed.'), true)
conferir('limite de requisicoes NAO desliga', recusaDefinitiva('[RateLimit] You have reached the rate limit.'), false)
conferir('conexao caiu NAO desliga', recusaDefinitiva('WebSocket is not open: readyState 3'), false)
conferir('tempo esgotado NAO desliga', recusaDefinitiva('A Deriv não respondeu à compra a tempo'), false)
conferir('erro generico NAO desliga', recusaDefinitiva('[ContractCreationFailure] Unable to create contract, please try again.'), false)

const memoria: Record<string, unknown> = {}
// Provas de parada precisam de um robô que entre a cada tick: o AG7 sem a análise.
const AG7_DIRETO = { ...SUPERIOR_5, entradaContinua: true, entrar: () => true }
const contexto = (digitos: number[]): Contexto => ({
  digitos, perdasSeguidas: 0, vitoriasSeguidas: 0, operacoes: 0,
  resultado: 0, prejuizoDaSequencia: 0, memoria,
  config: { valorInicial: 1, valorAoVencer: 1, fatorGale: .95, galeApos: 1, valorMaximo: 0, takeProfit: 10, stopLoss: 10, maxOperacoes: 0 },
})
const vinteQuatroSemNove = Array.from({ length: 24 }, (_, i) => i % 9)
/*
  Recuperação desde a PRIMEIRA perda (22/09/2026, a pedido do Tiago).
  Antes o robô repetia o valor base até a terceira perda, e uma vitória
  logo depois de uma perda não cobria o prejuízo.
*/
const depoisDeUmaPerda = {
  valorAtual: .35, valorInicial: .35, valorAoVencer: .35, ganhou: false, lucro: -.35,
  perdasSeguidas: 1, prejuizoDaSequencia: .35, retornoLiquidoPorUnidade: .67 / .35,
  config: { ...contexto([]).config, galeApos: 1, fatorGale: .05 }, memoria: {},
}
for (const robo of [SUPERIOR_5, AG_2, SMART_03, FIRST_BLOCK, SECOND_BLOCK]) {
  // A entrada seguinte é a que RECUPERA: ganhando nela, o que volta cobre a
  // perda anterior. Em robô de pagamento alto ela pode até ser menor que a
  // base — o que importa é cobrir, não ser maior.
  const recupera = robo.proximoValor(depoisDeUmaPerda)
  conferir(`${robo.id} ganhar na entrada seguinte à 1ª perda cobre o prejuízo`, recupera * depoisDeUmaPerda.retornoLiquidoPorUnidade >= .35, true)
  conferir(`${robo.id} vitória volta à base`, robo.proximoValor({ ...depoisDeUmaPerda, ganhou: true }), .35)
  const escada = escadaDoRobo(robo.id, .35, 4)
  conferir(`${robo.id} a 1ª entrada é a base`, escada[0].valor, .35)
  conferir(`${robo.id} a 2ª entrada já é recuperação`, escada[1].recuperacao, true)
  conferir(`${robo.id} ganhar na 2ª cobre a perda da 1ª e sobra`, escada[1].lucro > escada[0].perdido, true)
  conferir(`${robo.id} ganhar na 4ª cobre as três perdas antes dela`, escada[3].lucro > escada[2].perdido, true)
}
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
  for (const exit of [45392.8479, 45405.1079, 45189.2330, null]) {
    const { socket, canais } = socketFalso()
    const motor = new MotorTeeds({ socket, estrategia: AG7_DIRETO, config: contexto([]).config, symbol: 'R_75', moeda: 'USD', pipSize: 4 })
    motor.ligar(); await respirar()
    canais.ticks({ tick: { symbol: 'R_75', quote: 45189.2337, epoch: 1, pip_size: 4 } })
    await respirar(); await respirar()
    motor.desligar('teste')
    canais.contratos({ proposal_open_contract: { contract_id: 1, status: 'won', profit: 1.92, is_expired: 1, entry_spot: 45189.2337, exit_spot: exit, current_spot: 99999.9991, payout: 2.92, buy_price: 1, contract_type: 'DIGITOVER' } })
    await respirar()
    const op = motor.estadoAtual.historico[0]
    conferir(`precisão real preservada ${exit}`, op?.pipSize, 4)
    conferir(`saída oficial sem cotação corrente ${exit}`, op?.saida, exit)
    conferir(`último dígito correto ${exit}`, op?.digitoSaida, exit === null ? null : Number(exit.toFixed(4).slice(-1)))
    conferir(`resultado da Deriv preservado ${exit}`, op?.lucro, 1.92)
  }
  {
    const { socket, canais, contagem } = socketFalso()
    const motor = new MotorTeeds({ socket, estrategia: AG7_DIRETO, config, symbol: '1HZ75V', moeda: 'USD', pipSize: 2 })
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
    const novo = socketFalso()
    const retomado = new MotorTeeds({socket: novo.socket, estrategia: AG7_DIRETO, config, symbol: '1HZ75V', moeda:'USD', pipSize:2})
    retomado.ligar(e2)
    conferir('Continuar preserva histórico e resultado', [retomado.estadoAtual.operacoes, retomado.estadoAtual.resultado, retomado.estadoAtual.historico.length], [1, 1.92, 1])
    conferir('Continuar preserva curva', retomado.estadoAtual.curva, e2.curva)
    retomado.desligar('teste')
    const bloqueado = new MotorTeeds({socket: novo.socket, estrategia: AG7_DIRETO, config:{...config,takeProfit:1}, symbol:'1HZ75V',moeda:'USD',pipSize:2})
    let recusou = false
    try { bloqueado.ligar(e2) } catch { recusou = true }
    conferir('Continuar não ignora meta acumulada', recusou, true)
    const digitosAntes = e2.digitos.length
    canais.ticks?.({ tick: { symbol: '1HZ75V', quote: 100.21, epoch: 3, pip_size: 2 } })
    await respirar()
    conferir('P6 fechada, não ouve mais o mercado', [motor.estadoAtual.digitos.length, contagem.compras], [digitosAntes, 1])
  }
  {
    const { socket, canais, contagem } = socketFalso()
    const motor = new MotorTeeds({ socket, estrategia: AG7_DIRETO, config, symbol: '1HZ75V', moeda: 'USD', pipSize: 2 })
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
    const motor = new MotorTeeds({ socket, estrategia: AG7_DIRETO, config: { ...config, galeApos: 1 }, symbol: '1HZ75V', moeda: 'USD', pipSize: 2 })
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

/* ------------------------------------------------------------------ *
 * A Deriv engasgando não pode deixar o "Iniciar robô" girando para sempre.
 * Uma chamada que não responde é cortada; quem pode repetir repete uma vez;
 * criar conta (que não pode ser feito em dobro) nunca repete.
 * ------------------------------------------------------------------ */
async function provasDaDeriv() {
  const original = globalThis.fetch
  const sessao: any = { accessToken: 't', appId: '1' }
  const ok = (dados: unknown) => new Response(JSON.stringify({ data: dados }), { status: 200 })
  const trava = (_: any, init?: RequestInit) => new Promise<Response>((_r, rejeitar) => {
    init?.signal?.addEventListener('abort', () => rejeitar(new Error('abortado')))
  })
  let chamadas = 0
  const falso = (respostas: Array<(u: any, i?: RequestInit) => Promise<Response>>) => {
    chamadas = 0
    globalThis.fetch = ((u: any, i?: RequestInit) => respostas[Math.min(chamadas++, respostas.length - 1)](u, i)) as typeof fetch
  }
  definirTempoDaDeriv(120)
  try {
    falso([trava, async () => ok([{ account_id: 'DOT1', balance: 10, account_type: 'demo' }])])
    const t0 = Date.now(); const contas = await fetchAccounts(sessao)
    conferir('D1 primeira chamada trava, a segunda responde: contas chegam', [contas[0]?.accountId, chamadas], ['DOT1', 2])
    conferir('D2 e sem esperar minutos (corte + nova tentativa)', Date.now() - t0 < 2000, true)

    falso([trava])
    let erro = ''
    try { await fetchAccounts(sessao) } catch (e) { erro = (e as Error).message }
    conferir('D3 travou duas vezes: erro claro, sem ficar pendurado', [chamadas, /não respondeu a tempo/.test(erro)], [2, true])

    falso([async () => new Response('{}', { status: 524 }), async () => ok([{ account_id: 'DOT2', account_type: 'demo' }])])
    conferir('D4 erro 524 da Deriv: repete e segue', (await fetchAccounts(sessao))[0]?.accountId, 'DOT2')

    falso([async () => new Response('{}', { status: 524 })])
    erro = ''; try { await fetchAccounts(sessao) } catch (e) { erro = (e as Error).message }
    conferir('D5 524 nas duas: avisa que a Deriv está instável', /instável/.test(erro) && /524/.test(erro), true)

    falso([async () => new Response(JSON.stringify({ errors: [{ message: 'Token inválido' }] }), { status: 401 })])
    erro = ''; try { await fetchAccounts(sessao) } catch (e) { erro = (e as Error).message }
    conferir('D6 recusa de verdade (401) não repete e traz a mensagem da Deriv', [chamadas, erro], [1, 'Token inválido'])

    falso([trava, async () => ok({ url: 'wss://x' })])
    conferir('D7 endereço de operação (OTP) também repete', await fetchTradingSocketUrl(sessao, 'DOT1'), 'wss://x')

    falso([trava, async () => ok({ account_id: 'NOVA' })])
    erro = ''; try { await createAccount(sessao) } catch (e) { erro = (e as Error).message }
    conferir('D8 criar conta nunca repete (não abre conta em dobro)', [chamadas, /não respondeu a tempo/.test(erro)], [1, true])
  } finally {
    globalThis.fetch = original
    definirTempoDaDeriv(12_000)
  }
}

/* ------------------------------------------------------------------ *
 * Robôs da OMNI com análise antes de entrar (21/09/2026).
 * ------------------------------------------------------------------ */
{
  const ctx = (digitos: number[]): Contexto => ({ digitos, perdasSeguidas: 0, vitoriasSeguidas: 0, operacoes: 0, resultado: 0, prejuizoDaSequencia: 0, memoria: {}, config: contexto([]).config })
  /*
    Entrada por loss virtual de 4 (22/09/2026): sai a leitura de percentual.
    Quatro dígitos seguidos que teriam perdido liberam a entrada; dentro da
    sequência o robô entra de novo sem analisar, até uma vitória fechá-la.
  */
  const emSequencia = (digitos: number[]) => ({ ...ctx(digitos), memoria: { emSequencia: true } })
  conferir('O1 OMNI Over: três dígitos que teriam perdido ainda esperam', OMNI_OVER.entrar(ctx([3, 3, 3])), false)
  conferir('O2 OMNI Over: quatro seguidos liberam a entrada', OMNI_OVER.entrar(ctx([3, 3, 3, 3])), true)
  conferir('O3 OMNI Over: um dígito dele no meio zera a contagem', OMNI_OVER.entrar(ctx([3, 3, 8, 3, 3, 3])), false)
  conferir('O4 OMNI Over: mesmo contrato do AG7 (acima de 6), com modos e entrada contínua', [OMNI_OVER.contractType, OMNI_OVER.barreira, temModos('omniover'), OMNI_OVER.entradaContinua], ['DIGITOVER', 6, true, true])
  conferir('O5 OMNI Over: na sequência entra sem analisar de novo', OMNI_OVER.entrar(emSequencia([8, 8, 8])), true)
  {
    const memoria: Record<string, unknown> = {}
    OMNI_OVER.aposResultado?.({ ...ctx([3, 3, 3, 3]), memoria, ganhou: false, contractType: 'DIGITOVER', digitoSaida: 3 })
    const abriu = memoria.emSequencia
    OMNI_OVER.aposResultado?.({ ...ctx([3, 3, 3, 8]), memoria, ganhou: true, contractType: 'DIGITOVER', digitoSaida: 8 })
    conferir('O6 OMNI Over: a perda mantém a sequência e a vitória fecha', [abriu, memoria.emSequencia], [true, false])
  }
  conferir('B1 OMNI Bull: um dígito da outra metade ainda espera', OMNI_BULL.entrar(ctx([2, 7])), false)
  conferir('B2 OMNI Bull: dois seguidos da outra metade (loss virtual) entra', OMNI_BULL.entrar(ctx([2, 7, 9])), true)
  conferir('B3 OMNI Bull: saiu dígito dele no meio, a contagem zera', OMNI_BULL.entrar(ctx([7, 1, 8])), false)
  conferir('B4 OMNI Bull: contrato abaixo de 5, sem modos', [OMNI_BULL.contractType, OMNI_BULL.barreira, temModos('omnibull')], ['DIGITUNDER', 5, false])
  conferir('B5 OMNI Bear: espelho, entra depois de 0 e 4 seguidos', [OMNI_BEAR.entrar(ctx([6, 0, 4])), OMNI_BEAR.entrar(ctx([6, 4])), OMNI_BEAR.contractType, OMNI_BEAR.barreira], [true, false, 'DIGITOVER', 4])
  conferir('T1 AG7 da Teeds: mesmo loss virtual do OMNI Over', [SUPERIOR_5.entrar(ctx([3, 3, 3])), SUPERIOR_5.entrar(ctx([3, 3, 3, 3])), AG_2.entrar(ctx([8, 8, 8, 8])), AG_2.entrar(ctx([8, 8, 8]))], [false, true, true, false])
  conferir('T2 First Block: loss virtual antes de entrar', [FIRST_BLOCK.entrar(ctx([2, 7])), FIRST_BLOCK.entrar(ctx([2, 7, 9])), FIRST_BLOCK.entradaContinua], [false, true, false])
  conferir('T3 Second Block: loss virtual espelhado', [SECOND_BLOCK.entrar(ctx([6, 4])), SECOND_BLOCK.entrar(ctx([6, 0, 4]))], [false, true])
  conferir('T4 AG7 recupera desde a primeira perda e mantém os modos', [SUPERIOR_5.proximoValor(depoisDeUmaPerda) * depoisDeUmaPerda.retornoLiquidoPorUnidade >= .35, temModos('superior5')], [true, true])
}

provasDeParada().then(provasDaDeriv).then(() => {
  console.log(`\n${certos} certos, ${errados} errados`)
  process.exit(errados ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(1) })
