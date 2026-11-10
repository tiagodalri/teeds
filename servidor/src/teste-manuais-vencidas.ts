/**
 * Provas do fim das operações manuais vencidas (manuais-vencidas.ts), sem rede e sem banco.
 *
 *   cd servidor && npm run manuais-provas
 */
import { fimDaManual } from './manuais-vencidas'

let certos = 0, errados = 0
function prova(nome: string, ok: boolean, detalhe = '') {
  if (ok) certos++
  else { errados++; console.log(`✕ ${nome} ${detalhe}`) }
}
const agora = Date.UTC(2026, 10, 10, 20, 0, 0)

prova('aberto na Deriv não fecha', fimDaManual({ status: 'open', is_sold: 0, profit: 1.2 }, agora) === null)
prova('sem resposta não fecha', fimDaManual(undefined, agora) === null && fimDaManual(null, agora) === null)
prova('sem status e não vendido não fecha', fimDaManual({ profit: 3 }, agora) === null)

const ganhou = fimDaManual({ status: 'won', is_sold: 1, profit: 1.9512, sell_time: 1794343200 }, agora)
prova('won → ganhou', ganhou?.situacao === 'ganhou', JSON.stringify(ganhou))
prova('resultado com 2 casas', ganhou?.resultado === 1.95, JSON.stringify(ganhou))
prova('fim pela hora da venda', ganhou?.encerrada_em === new Date(1794343200 * 1000).toISOString(), JSON.stringify(ganhou))

const perdeu = fimDaManual({ status: 'lost', is_sold: 1, profit: -2.34, sell_time: 1794343100 }, agora)
prova('lost → perdeu, resultado negativo', perdeu?.situacao === 'perdeu' && perdeu.resultado === -2.34, JSON.stringify(perdeu))

const vendida = fimDaManual({ status: 'sold', is_sold: 1, profit: 0.4 }, agora)
prova('sold → vendida', vendida?.situacao === 'vendida' && vendida.resultado === 0.4, JSON.stringify(vendida))
prova('sem hora do fim usa agora', vendida?.encerrada_em === new Date(agora).toISOString(), JSON.stringify(vendida))

const outro = fimDaManual({ status: 'cancelled', is_sold: 1, profit: 0 }, agora)
prova('status desconhecido mas vendido → encerrada', outro?.situacao === 'encerrada' && outro.resultado === 0, JSON.stringify(outro))

const semLucro = fimDaManual({ status: 'won', is_sold: 1, profit: 'abc' }, agora)
prova('lucro inválido vira 0, nunca NaN', semLucro?.resultado === 0, JSON.stringify(semLucro))

const pelaExpiracao = fimDaManual({ status: 'lost', is_sold: 1, profit: -1, exit_tick_time: 1794343000 }, agora)
prova('sem sell_time usa a saída', pelaExpiracao?.encerrada_em === new Date(1794343000 * 1000).toISOString(), JSON.stringify(pelaExpiracao))

console.log(`${certos} certos, ${errados} errados`)
if (errados) process.exit(1)
