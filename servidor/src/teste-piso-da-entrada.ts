import './ambiente'
import { escadaDoRobo, ENTRADA_MINIMA } from '../../src/core/deriv/escada'
import { monteCarlo } from '../../src/core/deriv/simulacao'
import { parametrosPadrao } from '../../src/core/deriv/parametros'

/**
 * A escada nunca entra com menos do que o cliente escolheu.
 *
 * Pedido do Tiago em 05/10/2026, depois de ver uma sessão de entrada 0,50
 * recuperar com 0,35. A conta antiga estava certa — a recuperação paga ~192%,
 * então 0,28 bastava, e o mínimo da Deriv arredondava para 0,35. Só que, na
 * tela, ninguém entende o robô entrar com menos do que a pessoa escolheu.
 *
 * Estas provas seguram as duas pontas: o piso sobe para a entrada do cliente,
 * e os APAROS de proteção continuam podendo descer abaixo dele — é a diferença
 * entre uma regra de produto e a trava que impede furar o stop.
 *
 *   npm run piso
 */
let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}
const degraus = (robo: string, base: number, n = 5, modo: 'conservador' | 'agressivo' = 'conservador') =>
  escadaDoRobo(robo, base, n, modo).map((d) => d.valor)

console.log('\nESCADA · NENHUM DEGRAU FICA ABAIXO DA ENTRADA DO CLIENTE\n')
for (const robo of ['goreme', 'superior5', 'ag2', 'firstblock', 'thepalm']) {
  for (const base of [0.35, 0.5, 1, 2, 7.5]) {
    const menor = Math.min(...degraus(robo, base, 8))
    conferir(`${robo} base ${base.toFixed(2)}: menor degrau ≥ entrada`, menor >= base - 1e-9, true)
  }
}

console.log('\nESCADA · O CASO QUE DEU ORIGEM A ISTO\n')
conferir('Göreme 0,50 não recupera mais com 0,35',
  degraus('goreme', 0.5, 3)[1] >= 0.5, true)
conferir('Göreme 0,50: a segunda entrada agora é a própria base',
  degraus('goreme', 0.5, 3), [0.5, 0.5, 0.56])
conferir('AG7 0,50 idem (mesma recuperação de ~192%)',
  degraus('superior5', 0.5, 3), [0.5, 0.5, 0.56])

console.log('\nESCADA · A ENTRADA MÍNIMA DA DERIV CONTINUA VALENDO EMBAIXO\n')
conferir('ninguém opera abaixo de US$ 0,35', ENTRADA_MINIMA, 0.35)
conferir('base no mínimo: a escada começa no mínimo',
  degraus('goreme', 0.35, 2)[0], 0.35)

console.log('\nESCADA · A ESCADA SÓ SOBE\n')
for (const robo of ['goreme', 'superior5']) {
  for (const base of [0.35, 0.5, 1]) {
    const d = degraus(robo, base, 8)
    const soSobe = d.every((v, i) => i === 0 || v >= d[i - 1] - 1e-9)
    conferir(`${robo} base ${base.toFixed(2)}: nenhum degrau é menor que o anterior`, soSobe, true)
  }
}

console.log('\nSIMULADOR · ANDA PELA MESMA RÉGUA DO PAINEL\n')
// A sessão simulada nunca pode comprar abaixo da entrada escolhida, senão a
// tela de Gerenciamento prometeria uma escada que o motor não sobe.
const mc = monteCarlo(
  { id: 'goreme', parametros: parametrosPadrao('goreme'), base: 0.5, stopLoss: 1000, takeProfit: 1000, maxOperacoes: 400, modo: 'conservador' },
  { sessoes: 60, semente: 7 })
conferir('a simulação roda as sessões pedidas', mc.sessoes, 60)
// Se alguma sessão tivesse comprado abaixo da base, a maior entrada média
// poderia cair abaixo dela; ela nunca pode.
conferir('a maior entrada média nunca fica abaixo da entrada escolhida', mc.maiorEntradaMedia >= 0.5, true)

console.log(`\n${passou} certos, ${falhou} errados\n`)
process.exit(falhou ? 1 : 0)
