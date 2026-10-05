import './ambiente'
import {
  contadorDeFalhas, deMolho, ehEngasgoDaDeriv, esquecerParaTeste,
  faltamSegundos, poremDeMolho, DESCANSO_MS, FALHAS_PARA_DESISTIR,
} from './deriv-instavel'

/**
 * A trava que tira as rotinas de fundo da frente quando a Deriv cai.
 *
 * Escrita depois de 05/10/2026, quando a Deriv ficou fora do ar por doze
 * minutos e a sincronia de comissões varreu os vinte clientes esperando o
 * tempo de cada um estourar — 492 s de martelada, no mesmo minuto em que o
 * play de um robô falhava na tela.
 *
 *   npm run instavel
 */
let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

console.log('\nSERVIDOR · QUEM É ENGASGO DE TEMPO E QUEM NÃO É\n')
conferir('"não respondeu a tempo" é engasgo',
  ehEngasgoDaDeriv(new Error('A Deriv não respondeu a tempo.')), true)
conferir('"não abriu a conexão" é engasgo',
  ehEngasgoDaDeriv(new Error('A Deriv não abriu a conexão de operação a tempo.')), true)
conferir('"Tempo esgotado ao aguardar resposta da Deriv (buy)" é engasgo',
  ehEngasgoDaDeriv(new Error('Tempo esgotado ao aguardar resposta da Deriv (buy)')), true)
// Estes são problema de UM cliente: a varredura tem que seguir nos outros.
conferir('saldo insuficiente NÃO é engasgo',
  ehEngasgoDaDeriv(new Error('[InsufficientBalance] Your account balance is insufficient.')), false)
conferir('autorização vencida NÃO é engasgo',
  ehEngasgoDaDeriv(new Error('A autorização deste cliente venceu.')), false)

console.log('\nSERVIDOR · TRÊS FALHAS SEGUIDAS ABORTAM A PASSADA\n')
esquecerParaTeste()
const c = contadorDeFalhas('teste')
const tempo = () => new Error('A Deriv não respondeu a tempo.')
conferir('a 1ª falha não aborta', c.falhou(tempo()), false)
conferir('a 2ª falha não aborta', c.falhou(tempo()), false)
conferir('a 3ª falha aborta', c.falhou(tempo()), true)
conferir('e as rotinas ficam de molho', deMolho(), true)

console.log('\nSERVIDOR · UM ACERTO NO MEIO ZERA A CONTA\n')
esquecerParaTeste()
const c2 = contadorDeFalhas('teste')
c2.falhou(tempo()); c2.falhou(tempo())
c2.acertou()
conferir('depois de um acerto, a falha seguinte é a 1ª de novo', c2.falhou(tempo()), false)
conferir('e ninguém foi posto de molho', deMolho(), false)

console.log('\nSERVIDOR · ERRO DE UM CLIENTE SÓ NÃO DERRUBA A VARREDURA\n')
esquecerParaTeste()
const c3 = contadorDeFalhas('teste')
const doCliente = () => new Error('[InsufficientBalance] sem saldo')
conferir('dez erros de saldo não abortam',
  [c3.falhou(doCliente()), c3.falhou(doCliente()), c3.falhou(doCliente()),
   c3.falhou(doCliente()), c3.falhou(doCliente())].some(Boolean), false)
conferir('e nada foi posto de molho', deMolho(), false)
// Mistura: erro de cliente no meio de engasgos também zera a sequência.
c3.falhou(tempo()); c3.falhou(tempo()); c3.falhou(doCliente())
conferir('erro de cliente entre engasgos também zera', c3.falhou(tempo()), false)

console.log('\nSERVIDOR · O DESCANSO TEM FIM\n')
esquecerParaTeste()
const agora = Date.now()
poremDeMolho('teste', agora)
conferir('de molho logo depois de desistir', deMolho(agora + 1_000), true)
conferir('faltam cerca de 5 min', Math.round(faltamSegundos(agora + 1_000) / 60), 5)
conferir('um segundo depois do descanso, já pode', deMolho(agora + DESCANSO_MS + 1_000), false)
conferir('e aí não falta mais nada', faltamSegundos(agora + DESCANSO_MS + 1_000), 0)
conferir('o limite continua sendo três', FALHAS_PARA_DESISTIR, 3)

esquecerParaTeste()
console.log(`\n${passou} certos, ${falhou} errados\n`)
process.exit(falhou ? 1 : 0)
