import { PADRAO, conferir, sugerir } from './limites'

/**
 * As travas, conferidas por linha de comando.
 *
 * Roda sem servidor, sem banco e sem gastar um centavo de API — de
 * propósito. É assim que a gente descobre se o freio funciona antes de
 * confiar nele com dinheiro de cliente.
 *
 *   npm run travas
 */

let passou = 0, falhou = 0

function caso(nome: string, esperado: 'passa' | 'recusa', pedido: Parameters<typeof conferir>[0]) {
  const v = conferir(pedido, PADRAO)
  const deu = v.ok ? 'passa' : 'recusa'
  const certo = deu === esperado
  certo ? passou++ : falhou++
  const marca = certo ? '  ok  ' : ' FALHA'
  console.log(`${marca}  ${nome}`)
  if (!v.ok) console.log(`        → ${v.motivo}`)
  if (!certo) console.log(`        esperava ${esperado}, deu ${deu}`)
}

const real = { saldo: 2000, demo: false, moeda: 'USD', robosAtivos: 0 }
const demo = { saldo: 2240, demo: true, moeda: 'USD', robosAtivos: 0 }

console.log('\nCONTA REAL — saldo USD 2.000, limites padrão')
console.log('             entrada máx USD 5 · stop máx 25% do saldo · 2 robôs\n')

caso('entrada de 1, stop de 50', 'passa', { ...real, entrada: 1, stopLoss: 50, takeProfit: 50 })
caso('entrada de 5, no limite exato', 'passa', { ...real, entrada: 5, stopLoss: 100, takeProfit: 100 })
caso('entrada de 500 (o cliente editou o campo)', 'recusa', { ...real, entrada: 500, stopLoss: 500, takeProfit: 500 })
caso('stop de 1000 numa conta de 2000', 'recusa', { ...real, entrada: 2, stopLoss: 1000, takeProfit: 1000 })
caso('stop de 500, exatamente 25%', 'passa', { ...real, entrada: 2, stopLoss: 500, takeProfit: 500 })
caso('entrada maior que o stop', 'recusa', { ...real, entrada: 4, stopLoss: 3, takeProfit: 50 })
caso('sem stop', 'recusa', { ...real, entrada: 1, stopLoss: 0, takeProfit: 50 })
caso('entrada negativa', 'recusa', { ...real, entrada: -5, stopLoss: 50, takeProfit: 50 })
caso('terceiro robô ao mesmo tempo', 'recusa', { ...real, entrada: 1, stopLoss: 50, takeProfit: 50, robosAtivos: 2 })

console.log('\nCONTA DEMONSTRAÇÃO — dinheiro fictício, travas de valor não valem\n')
caso('stop de 5000 numa conta de 2240', 'passa', { ...demo, entrada: 1, stopLoss: 5000, takeProfit: 5000 })
caso('entrada de 500', 'passa', { ...demo, entrada: 500, stopLoss: 5000, takeProfit: 5000 })
caso('terceiro robô também na demo', 'recusa', { ...demo, entrada: 1, stopLoss: 50, takeProfit: 50, robosAtivos: 2 })

console.log('\nSUGESTÕES — o que o cartão nasce preenchido\n')
for (const [rotulo, saldo, ehDemo] of [['real 2.000', 2000, false], ['real 200', 200, false], ['demo 2.240', 2240, true]] as const) {
  const s = sugerir(saldo, ehDemo)
  const v = conferir({ ...s, saldo, demo: ehDemo, moeda: 'USD', robosAtivos: 0 }, PADRAO)
  console.log(`  ${rotulo.padEnd(12)} entrada ${String(s.entrada).padStart(6)} · stop ${String(s.stopLoss).padStart(7)} · ${v.ok ? 'passa na própria trava' : 'NAO PASSA — bug'}`)
  if (!v.ok) falhou++; else passou++
}

console.log(`\n${passou} certos, ${falhou} errados\n`)
process.exit(falhou ? 1 : 0)
