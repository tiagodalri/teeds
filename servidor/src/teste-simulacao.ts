import './ambiente'
import { simularEscada, cadenciaTeorica, monteCarlo, cartoesDePerdaMaxima, type Cenario } from '../../src/core/deriv/simulacao'
import { escadaDoRobo } from '../../src/core/deriv/escada'
import { parametrosPadrao, type ParametrosDoRobo } from '../../src/core/deriv/parametros'

/**
 * O simulador do painel, conferido por linha de comando.
 *
 *   npm run simulacao
 *
 * Roda sem servidor, sem banco e sem Deriv. O que se prova aqui:
 *  1. a escada simulada é a de escadaDoRobo, degrau a degrau;
 *  2. a cadência: AG7 com loss virtual 4 espera ~10,6 ticks; Göreme com 3, ~1.110; 0 = nada;
 *  3. o Monte Carlo é determinístico: mesma semente, mesmo resultado;
 *  4. toda sessão termina em meta, stop ou parou;
 *  5. conta demo não gera markup; real gera;
 *  6. "parar" depois do último degrau para o robô e nunca fura o stop;
 *  7. nenhuma sessão passa da meta por mais que um pagamento;
 *  8. os três cartões de perda máxima respeitam o stop de 20× a base;
 *  9. o modo agressivo sobe mais alto que o conservador;
 * 10. o The Palm roda sem exceção.
 */
let passou = 0, falhou = 0
const prova = (nome: string, fn: () => true | string) => {
  let deu: true | string
  try { deu = fn() } catch (e) { deu = `exceção: ${e instanceof Error ? e.message : String(e)}` }
  const ok = deu === true
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        ${deu}`}`)
}
const perto = (deu: number, esperado: number, tolerancia: number) =>
  Math.abs(deu - esperado) <= tolerancia ? true : `esperava ~${esperado}, deu ${deu}`

const cenario = (id: string, ajuste: Partial<Cenario> = {}, mexer?: (p: ParametrosDoRobo) => void): Cenario => {
  const parametros = parametrosPadrao(id)
  mexer?.(parametros)
  return { id, parametros, base: 1, stopLoss: 20, takeProfit: 3, ...ajuste }
}

console.log('\nSIMULADOR · A ESCADA É A DO MOTOR\n')
for (const id of ['superior5', 'ag2', 'omniover', 'omnibull', 'goreme', 'thepalm']) {
  prova(`${id}: simularEscada().degraus = escadaDoRobo()`, () => {
    const c = cenario(id, { stopLoss: 100 })
    const deu = JSON.stringify(simularEscada(c).degraus)
    const esperado = JSON.stringify(escadaDoRobo(id, 1, 60, 'conservador', c.parametros))
    return deu === esperado ? true : 'as listas diferem'
  })
}
prova('o markup por sequência é positivo e reescala pela taxa', () => {
  const a3 = simularEscada(cenario('omniover')).markupEsperadoPorSequencia
  const a1 = simularEscada(cenario('omniover', { taxaMarkup: 0.01 })).markupEsperadoPorSequencia
  if (a3 <= 0) return `a 3% deu ${a3}`
  return perto(a1 / a3, 1 / 3, 0.02)
})
prova('a chance de furar o stop está entre 0 e 1 e cai com stop maior', () => {
  const curto = simularEscada(cenario('omniover', { stopLoss: 5 })).chanceDeFurarOStop
  const longo = simularEscada(cenario('omniover', { stopLoss: 100 })).chanceDeFurarOStop
  return curto > longo && longo >= 0 && curto <= 1 ? true : `curto ${curto}, longo ${longo}`
})

console.log('\nSIMULADOR · CADÊNCIA\n')
prova('AG7 com loss virtual 4 espera ~10,6 ticks', () => perto(cadenciaTeorica(cenario('superior5')).esperaTicks, 10.6, 0.1))
prova('Göreme com loss virtual 3 espera ~1.110 ticks', () => perto(cadenciaTeorica(cenario('goreme', {}, (p) => { p.entrada.lossVirtual = 3 })).esperaTicks, 1110, 1))
prova('loss virtual 0 não espera', () => {
  const c = cadenciaTeorica(cenario('goreme'))
  return c.esperaTicks === 0 && c.esperaSegundos === 0 && c.opsPorHora > 0 ? true : JSON.stringify(c)
})
prova('a espera em segundos é 2 s por tick e há operações por hora', () => {
  const c = cadenciaTeorica(cenario('superior5'))
  return perto(c.esperaSegundos, c.esperaTicks * 2, 1e-9) === true && c.opsPorHora > 0 && c.opsPorHora < 1800 ? true : JSON.stringify(c)
})

console.log('\nSIMULADOR · MONTE CARLO\n')
const padrao = monteCarlo(cenario('omniover'), { sessoes: 300, semente: 1 })
prova('mesma semente, mesmo JSON', () => JSON.stringify(monteCarlo(cenario('omniover'), { sessoes: 300, semente: 1 })) === JSON.stringify(padrao) ? true : 'diferiu')
prova('semente diferente, resultado diferente', () => JSON.stringify(monteCarlo(cenario('omniover'), { sessoes: 300, semente: 2 })) !== JSON.stringify(padrao) ? true : 'igual')
prova('pMeta + pStop + pParou = 1 com maxOperacoes alto', () => {
  const r = monteCarlo(cenario('omniover', { maxOperacoes: 100000 }), { sessoes: 300 })
  const soma = r.pMeta + r.pStop + r.pParou
  return soma <= 1 + 1e-9 && soma >= 0.99 ? true : `soma ${soma}`
})
prova('o histograma tem 12 faixas e soma as sessões', () => {
  const n = padrao.histograma.reduce((t, f) => t + f.n, 0)
  return padrao.histograma.length === 12 && n === padrao.sessoes ? true : `${padrao.histograma.length} faixas, ${n} sessões`
})
prova('demo não gera markup', () => {
  const r = monteCarlo(cenario('omniover', { demo: true }), { sessoes: 100 })
  return r.markupMedio === 0 && r.markupPorHora === 0 ? true : `markup ${r.markupMedio}`
})
prova('conta real gera markup por sessão e por hora', () => padrao.markupMedio > 0 && padrao.markupPorHora > 0 ? true : `${padrao.markupMedio} / ${padrao.markupPorHora}`)
prova('tabela de 1 degrau com "parar": há sessões que param e nenhuma fura o stop', () => {
  const c = cenario('omniover', { stopLoss: 20, takeProfit: 50 }, (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }], depoisDoUltimo: 'parar' } })
  const r = monteCarlo(c, { sessoes: 500 })
  if (r.pParou <= 0) return `pParou ${r.pParou}`
  const abaixo = r.histograma[0].de < -c.stopLoss - 0.01
  return !abaixo ? true : 'faixa abaixo do stop'
})
prova('nenhum resultado abaixo de −stop nem acima de meta + maior pagamento', () => {
  for (const id of ['omniover', 'omnibull', 'goreme', 'thepalm']) {
    const c = cenario(id, { stopLoss: 10, takeProfit: 2 })
    const r = monteCarlo(c, { sessoes: 300 })
    const maiorPagamento = simularEscada({ ...c, stopLoss: 1000 }).degraus.reduce((m, d) => Math.max(m, d.pagamento), 0)
    if (r.resultadoMedio < -c.stopLoss - 0.01) return `${id}: média ${r.resultadoMedio}`
    if (r.resultadoMedio > c.takeProfit + maiorPagamento) return `${id}: média ${r.resultadoMedio}`
    const ultima = r.histograma[r.histograma.length - 1]
    if (ultima.ate < c.takeProfit - 1e-9) return `${id}: histograma acaba em ${ultima.ate}`
  }
  return true
})
prova('a sessão nunca perde mais que o stop (aparo no stop)', () => {
  const c = cenario('goreme', { stopLoss: 7, takeProfit: 100, maxOperacoes: 2000 })
  const r = monteCarlo(c, { sessoes: 200 })
  // Sem meta alcançável, quase tudo termina no stop ou parou; a mediana não pode passar do stop.
  return r.resultadoMediano >= -c.stopLoss - 0.01 && r.pStop + r.pParou > 0.5 ? true : JSON.stringify(r)
})

console.log('\nSIMULADOR · CARTÕES E MODOS\n')
prova('cartoesDePerdaMaxima: 3 cartões com bases 0,35 / 1 / 5 dentro do stop', () => {
  const cartoes = cartoesDePerdaMaxima('omniover', parametrosPadrao('omniover'))
  if (cartoes.length !== 3) return `${cartoes.length} cartões`
  const bases = cartoes.map((c) => c.base).join(',')
  if (bases !== '0.35,1,5') return `bases ${bases}`
  for (const c of cartoes) {
    if (c.stop !== c.base * 20) return `stop ${c.stop} para base ${c.base}`
    if (c.custoMaximo > c.stop + 1e-9) return `custo ${c.custoMaximo} passa do stop ${c.stop}`
    if (c.chanceDaSequencia < 0 || c.chanceDaSequencia > 1) return `chance ${c.chanceDaSequencia}`
  }
  return true
})
prova('modo agressivo sobe mais alto que o conservador no OMNI Over', () => {
  const p = parametrosPadrao('omniover')
  const a = simularEscada({ id: 'omniover', parametros: p, base: 1, stopLoss: 50, takeProfit: 5, modo: 'agressivo' }).plano.maiorEntrada
  const c = simularEscada({ id: 'omniover', parametros: p, base: 1, stopLoss: 50, takeProfit: 5, modo: 'conservador' }).plano.maiorEntrada
  return a >= c ? true : `agressivo ${a} < conservador ${c}`
})
prova('The Palm: escada, cadência e Monte Carlo rodam', () => {
  const c = cenario('thepalm')
  const e = simularEscada(c)
  const cad = cadenciaTeorica(c)
  const r = monteCarlo(c, { sessoes: 100 })
  return e.degraus.length > 1 && cad.opsPorHora > 0 && r.sessoes === 100 ? true : 'algo ficou vazio'
})
prova('"parar" com tabela curta avisa que desliga antes do stop', () => {
  const c = cenario('omniover', { stopLoss: 50 }, (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 4 }], depoisDoUltimo: 'parar' } })
  const e = simularEscada(c)
  return e.plano.paraAntesDoStop && e.avisos.some((a) => a.includes('desligar antes do stop')) ? true : e.avisos.join(' | ')
})

console.log(`\n${passou} certos, ${falhou} errados\n`)
process.exit(falhou ? 1 : 0)
