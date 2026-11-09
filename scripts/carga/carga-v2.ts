/**
 * Teste de carga v2 (08/11/2026, véspera da live da GlobalFly), baseado no carga-robos.ts de 20/10.
 * Variáveis: ROBOS, DURACAO (s), IDS (lista de estratégias, em rodízio),
 * POR_CONTA (quantos robôs dividem a mesma conexão de operação, como o mesmo
 * cliente), ONDA (robôs ligados por segundo; 100000 = todos de uma vez),
 * SEM_ESPELHO=1 (sem o monitoramento ao vivo).
 */
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { createServer } from 'node:http'
import { DERIV } from '../../src/core/deriv/config'

const N = Number(process.env.ROBOS ?? 50)
const DURACAO = Number(process.env.DURACAO ?? 90) * 1000
const IDS = (process.env.IDS ?? 'goreme,falcon,legacy,superior5,ag2').split(',')
const POR_CONTA = Math.max(1, Number(process.env.POR_CONTA ?? 1))
const ONDA = Math.max(1, Number(process.env.ONDA ?? 10))
const SEM_ESPELHO = process.env.SEM_ESPELHO === '1'
const URL = 'ws://127.0.0.1:9701'
;(DERIV.ws as { public: string }).public = URL

const { TeedsSocket } = await import('../../src/core/deriv/client')
const { MotorTeeds } = await import('../../src/core/deriv/engine')
const { ESTRATEGIAS_LOCAIS } = await import('../../src/core/deriv/strategies')
const { parametrosPadrao } = await import('../../src/core/deriv/parametros')
const { PublicadorEspelho } = await import('../../servidor/src/espelho')
const { criarLote } = await import('../../servidor/src/lote')
const LOTE = process.env.LOTE === '1'

const atraso = monitorEventLoopDelay({ resolution: 10 }); atraso.enable()
let escritas = 0, telas = 0, telaMs = 0, telaMax = 0
const gravar = async (corpo: unknown) => {
  const texto = JSON.stringify(corpo); escritas++
  await fetch('https://127.0.0.1:9702/rest/v1/x', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'x', authorization: 'Bearer x' }, body: texto }).then((r) => r.arrayBuffer()).catch(() => undefined)
}
const gravarLista = async (itens: unknown[]) => gravar(itens)
const lote = () => criarLote<any>({ enviar: gravarLista, enviarUm: gravar, chave: (l: any) => l.sessao_id ?? String(Math.random()) })
const [lEv, lFo, lPu] = [lote(), lote(), lote()]
const esc = LOTE
  ? { evento: async (s: any, ev: any) => lEv({ sessao_id: undefined, ...ev, s: s.id }), foto: async (s: any, f: any) => lFo({ sessao_id: s.id, ...f }), pulso: async (s: any, p: any) => lPu({ sessao_id: s.id, ...p }) }
  : { evento: async (_s: unknown, ev: unknown) => gravar(ev), foto: async (_s: unknown, f: unknown) => gravar(f), pulso: async (_s: unknown, p: unknown) => gravar(p) }

const motores: Array<InstanceType<typeof MotorTeeds>> = []
const sockets: Array<InstanceType<typeof TeedsSocket>> = []
for (let i = 0; i < N; i++) {
  const id = IDS[i % IDS.length]
  const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === id)!
  const p = parametrosPadrao(id)
  const config = { valorInicial: 1, valorAoVencer: 1, fatorGale: 2, galeApos: 1, valorMaximo: 0, takeProfit: 0, stopLoss: 0, maxOperacoes: 0, parametros: p, parametrosVersao: 1 }
  const conta = Math.floor(i / POR_CONTA)
  if (!sockets[conta]) { const s = new TeedsSocket({ url: URL, appId: 'teste' }); s.connect(); sockets[conta] = s }
  const socket = sockets[conta]
  const motor = new MotorTeeds({ socket, estrategia, config: config as never, symbol: 'R_75', moeda: 'USD', pipSize: 4 })
  const espelho = SEM_ESPELHO ? null : new PublicadorEspelho({ id: `carga-${String(i).padStart(4, '0')}-0000-0000-000000000000`, user_id: `u${conta}`, marca: 'globalfly' } as never, config as never, () => socket.state, esc as never, () => true)
  let ops = 0
  motor.escutar((e) => {
    espelho?.aoEstado(e)
    if (e.operacoes > ops) { ops = e.operacoes; void gravar(e.historico?.[0] ?? {}) }
  })
  motores.push(motor)
  setTimeout(() => motor.ligar(), Math.floor(i / ONDA) * 1000 + 500)
}

createServer((q, res) => {
  const t0 = performance.now()
  const i = Number((q.url ?? '').split('/').pop())
  const m = motores[i]
  res.writeHead(m ? 200 : 404, { 'content-type': 'application/json' })
  res.end(m ? JSON.stringify(m.estadoAtual) : '{}')
  const ms = performance.now() - t0; telas++; telaMs += ms; if (ms > telaMax) telaMax = ms
}).listen(9703, '127.0.0.1')

const inicio = Date.now()
const somaOps = () => motores.reduce((t, m) => t + (m.estadoAtual.operacoes ?? 0), 0)
let todosEm = 0, opsTodos = 0
const vigia = setInterval(() => {
  const ligados = motores.filter((m) => m.estadoAtual.rodando).length
  if (!todosEm && ligados >= N) { todosEm = Date.now(); opsTodos = somaOps(); atraso.reset() }
}, 250)

setTimeout(() => {
  clearInterval(vigia)
  const fim = Date.now()
  const ops = somaOps()
  const ligados = motores.filter((m) => m.estadoAtual.rodando).length
  const falhas = motores.filter((m) => m.estadoAtual.falha || m.estadoAtual.motivoParada).length
  const janela = todosEm ? (fim - todosEm) / 60000 : 0
  const ritmo = todosEm && janela > 0 ? ((ops - opsTodos) / N / janela).toFixed(1) : 'n/d'
  const ms = (v: number) => (v / 1e6).toFixed(0)
  console.log(`RESUMO ${N} robôs (${IDS.join('+')}, ${POR_CONTA}/conta, ${ONDA}/s${SEM_ESPELHO ? ', sem espelho' : ''}${LOTE ? ', em lote' : ''}): ${ops} operações · ${ligados}/${N} ligados no fim · todos ligados em ${todosEm ? ((todosEm - inicio) / 1000).toFixed(1) + ' s' : 'NUNCA'} · ritmo com todos ligados ${ritmo} op/robô/min · atraso p50 ${ms(atraso.percentile(50))} ms, p95 ${ms(atraso.percentile(95))} ms, p99 ${ms(atraso.percentile(99))} ms, máx ${ms(atraso.max)} ms · tela média ${(telaMs / Math.max(1, telas)).toFixed(2)} ms, máx ${telaMax.toFixed(0)} ms · gravações ${escritas} (${(escritas / ((fim - inicio) / 1000)).toFixed(0)}/s) · memória ${Math.round(process.memoryUsage().rss / 1048576)} MB · ${falhas} parados com motivo`)
  motores.forEach((m) => { try { m.desligar('fim do teste') } catch { /* ok */ } })
  setTimeout(() => process.exit(0), 1500)
}, DURACAO)
