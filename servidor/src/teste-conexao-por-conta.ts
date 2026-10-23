/**
 * Uma conexão por conta (23/10/2026): vários robôs na mesma conta dividem o
 * mesmo socket. Prova que, dividindo, cada robô continua vendo só o próprio
 * contrato, que o preço e o stream de contratos são assinados uma vez só e
 * que parar um robô não atrapalha os outros.
 *
 *   npm run conexao
 */
import { MotorTeeds } from '../../src/core/deriv/engine'
import { SUPERIOR_5 } from '../../src/core/deriv/strategies'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) certos++
  else { errados++; console.error(`✕ ${nome}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(deu)}`) }
}

/** Um socket falso que aceita várias assinaturas e conta cada pedido. */
function socketFalso() {
  const ouvintes: Record<string, Set<(m: any) => void>> = { ticks: new Set(), contratos: new Set() }
  const pedidos = { ticks: 0, contratos: 0, esquecidos: 0, compras: 0 }
  const socket: any = {
    state: 'open', status: 'open', onStatus: () => () => {}, reconectarAgora: () => {}, disconnect: () => {},
    subscribe: (req: any, cb: (m: any) => void) => {
      const tipo = req.ticks ? 'ticks' : 'contratos'
      pedidos[tipo] += 1
      ouvintes[tipo].add(cb)
      return () => { pedidos.esquecidos += 1; ouvintes[tipo].delete(cb) }
    },
    send: async (req: any) => {
      if (req.ticks_history) throw new Error('sem histórico no teste')
      if (req.buy) {
        pedidos.compras += 1
        return { buy: { contract_id: pedidos.compras, transaction_id: pedidos.compras, buy_price: req.parameters.amount, payout: Number((req.parameters.amount * 2.9225).toFixed(2)), balance_after: 100, purchase_time: 1 } }
      }
      return {}
    },
  }
  const tick = (quote: number, epoch: number) => ouvintes.ticks.forEach((cb) => cb({ tick: { symbol: 'R_75', quote, epoch, pip_size: 4 } }))
  const contrato = (id: number, ganhou: boolean, valor: number) => ouvintes.contratos.forEach((cb) => cb({ proposal_open_contract: {
    contract_id: id, status: ganhou ? 'won' : 'lost', profit: ganhou ? Number((valor * 1.9225).toFixed(2)) : -valor, is_expired: 1,
    entry_spot: 45189.2337, exit_spot: 45189.2391, current_spot: 45189.2391, payout: ganhou ? Number((valor * 2.9225).toFixed(2)) : 0, buy_price: valor, contract_type: 'DIGITOVER',
  } }))
  return { socket, pedidos, tick, contrato }
}

const respirar = () => new Promise((r) => setTimeout(r, 5))
const SEMPRE = { ...SUPERIOR_5, entradaContinua: true, entrar: () => true }
const config = (valor: number) => ({ valorInicial: valor, valorAoVencer: valor, fatorGale: .05, galeApos: 3, valorMaximo: 0, takeProfit: 100, stopLoss: 100, maxOperacoes: 0 })

{
  const f = socketFalso()
  const a = new MotorTeeds({ socket: f.socket, estrategia: SEMPRE, config: config(1), symbol: 'R_75', moeda: 'USD', pipSize: 4 })
  const b = new MotorTeeds({ socket: f.socket, estrategia: SEMPRE, config: config(2), symbol: 'R_75', moeda: 'USD', pipSize: 4 })
  const c = new MotorTeeds({ socket: f.socket, estrategia: SEMPRE, config: config(3), symbol: 'R_75', moeda: 'USD', pipSize: 4 })
  a.ligar(); b.ligar(); c.ligar()
  await respirar()
  conferir('C1 o preço é assinado uma vez só para os 3 robôs', f.pedidos.ticks, 1)
  conferir('C2 o stream de contratos é assinado uma vez só', f.pedidos.contratos, 1)

  f.tick(45189.2337, 1)
  await respirar(); await respirar()
  conferir('C3 os 3 robôs compraram no mesmo preço', f.pedidos.compras, 3)
  const ids = [a, b, c].map((m) => m.estadoAtual.emCurso?.contractId).sort()
  conferir('C4 cada robô guarda o próprio contrato', ids, [1, 2, 3])

  // o stream traz os contratos de todos: cada um pega só o seu
  const idDe = (m: MotorTeeds) => m.estadoAtual.emCurso!.contractId
  const [ia, ib, ic] = [idDe(a), idDe(b), idDe(c)]
  f.contrato(ib, false, 2)
  await respirar()
  conferir('C5 a perda do robô B não aparece no A nem no C', [a.estadoAtual.operacoes, b.estadoAtual.operacoes, c.estadoAtual.operacoes], [0, 1, 0])
  conferir('C6 o B registrou a perda dele', [b.estadoAtual.derrotas, b.estadoAtual.resultado], [1, -2])
  f.contrato(ia, true, 1); f.contrato(ic, true, 3)
  await respirar()
  conferir('C7 A e C liquidam com o próprio valor', [a.estadoAtual.resultado, c.estadoAtual.resultado], [1.92, 5.77])
  conferir('C8 nenhum robô contou contrato alheio', [a.estadoAtual.historico.length, b.estadoAtual.historico.length, c.estadoAtual.historico.length], [1, 1, 1])

  // parar um robô não derruba o preço nem os contratos dos outros
  // (com entrada contínua, cada um já recomprou quando o anterior liquidou)
  const comprasAntes = f.pedidos.compras
  const digitos = (m: MotorTeeds) => m.estadoAtual.digitos.length
  const [db, dc] = [digitos(b), digitos(c)]
  a.desligar('teste')
  await respirar()
  f.tick(45189.2344, 2)
  await respirar(); await respirar()
  conferir('C9 com o A parado, B e C seguem recebendo o preço', [digitos(b) - db, digitos(c) - dc], [1, 1])
  conferir('C10 o A parado não compra mais', [a.estadoAtual.rodando, f.pedidos.compras], [false, comprasAntes])
  const idB = b.estadoAtual.emCurso!.contractId
  f.contrato(idB, true, 2)
  await respirar()
  conferir('C11 o contrato do B ainda chega a ele depois do A parar', b.estadoAtual.historico.length, 2)
  b.desligar('teste'); c.desligar('teste')
}

console.log(`${certos} certos, ${errados} errados`)
if (errados) process.exit(1)
