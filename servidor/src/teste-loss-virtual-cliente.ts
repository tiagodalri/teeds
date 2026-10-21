/**
 * O loss virtual à escolha do cliente (21/10/2026): a escolha vem antes do
 * painel, 0 = sem loss virtual, e o servidor só aceita inteiros de 0 a 12.
 */
import { ESTRATEGIAS_LOCAIS } from '../../src/core/deriv/strategies'
import { parametrosPadrao } from '../../src/core/deriv/parametros'
import { montarConfig } from './sessoes'
import type { ConfigEstrategia } from '../../src/core/deriv/engine'

let certos = 0, errados = 0
const ok = (cond: boolean, nome: string) => { if (cond) certos++; else { errados++; console.log('✕', nome) } }

const ag7 = ESTRATEGIAS_LOCAIS.find((e) => e.id === 'superior5')!
ok(ag7.lossVirtualAjustavel === true, 'AG7 é ajustável')
ok(!ESTRATEGIAS_LOCAIS.find((e) => e.id === 'thepalm')?.lossVirtualAjustavel, 'The Palm não é ajustável')

const base: ConfigEstrategia = { valorInicial: 1, valorAoVencer: 1, fatorGale: 1, galeApos: 1, valorMaximo: 0, takeProfit: 10, stopLoss: 10, maxOperacoes: 0, parametros: parametrosPadrao('superior5') }
const ctx = (digitos: number[], config: ConfigEstrategia) => ({ digitos, memoria: {}, config } as unknown as Parameters<typeof ag7.entrar>[0])
// AG7 ganha com 7, 8 e 9: dígitos baixos são "loss virtual"
const tres = [8, 1, 2, 3]
ok(!ag7.entrar(ctx(tres, base)), 'padrão do painel (4): 3 seguidos não entra')
ok(ag7.entrar(ctx(tres, { ...base, lossVirtualCliente: 3 })), 'cliente escolheu 3: entra com 3')
ok(ag7.entrar(ctx([8], { ...base, lossVirtualCliente: 0 })), 'cliente escolheu sem: entra direto')
ok(!ag7.entrar(ctx(tres, { ...base, lossVirtualCliente: 6 })), 'cliente escolheu 6: 3 não basta')
ok(ag7.medidor?.(ctx(tres, { ...base, lossVirtualCliente: 6 }) as never)?.alvo === 6, 'medidor mostra o alvo do cliente')

const pedido = (lv: unknown) => montarConfig({ roboId: 'superior5', valorInicial: 1, stopLoss: 10, takeProfit: 10, config: { ...base, lossVirtualCliente: lv as number } } as never)
ok(pedido(5).lossVirtualCliente === 5, 'servidor aceita 5')
ok(pedido(0).lossVirtualCliente === 0, 'servidor aceita 0 (sem)')
ok(pedido(13).lossVirtualCliente === undefined, 'servidor recusa 13')
ok(pedido(2.5).lossVirtualCliente === undefined, 'servidor recusa fração')
ok(pedido('3').lossVirtualCliente === undefined, 'servidor recusa texto')

console.log(`\n${certos} certos, ${errados} errados`)
if (errados) process.exit(1)
