/**
 * Teste de carga dos robôs (20/10/2026): o motor de verdade (TeedsSocket +
 * MotorTeeds + PublicadorEspelho) contra a Deriv falsa (deriv-falsa.mjs).
 * Cada robô: a própria conexão de operação (como contas diferentes), os
 * ticks do R_75 pela conexão pública compartilhada, o espelho do
 * Monitoramento com escritores de mentira e a "tela" do cliente pedindo o
 * estado a cada 2 s. Robôs da GlobalFly em rodízio.
 *
 *   ROBOS=100 DURACAO=90 node carga-robos.mjs
 */
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { createServer } from 'node:http'
import { DERIV } from '../../src/core/deriv/config'

const N = Number(process.env.ROBOS ?? 50)
const DURACAO = Number(process.env.DURACAO ?? 90) * 1000
const URL = 'ws://127.0.0.1:9701'
;(DERIV.ws as { public: string }).public = URL // antes de carregar o cliente

const { TeedsSocket } = await import('../../src/core/deriv/client')
const { MotorTeeds } = await import('../../src/core/deriv/engine')
const { ESTRATEGIAS_LOCAIS } = await import('../../src/core/deriv/strategies')
const { parametrosPadrao } = await import('../../src/core/deriv/parametros')
const { PublicadorEspelho } = await import('../../servidor/src/espelho')

const IDS = ['goreme', 'falcon', 'legacy', 'superior5', 'ag2']
const atraso = monitorEventLoopDelay({ resolution: 10 }); atraso.enable()
let escritas = 0, bytes = 0, telas = 0, telaMs = 0
// cada gravação é um POST HTTPS de verdade (como para o Supabase), num receptor local com TLS
const gravar = async (corpo: unknown) => {
  const texto = JSON.stringify(corpo); escritas++; bytes += texto.length
  await fetch('https://127.0.0.1:9702/rest/v1/x', { method: 'POST', headers: { 'content-type': 'application/json', apikey: 'x', authorization: 'Bearer x' }, body: texto }).then((r) => r.arrayBuffer()).catch(() => undefined)
}
const esc = {
  evento: async (_s: unknown, ev: unknown) => gravar(ev),
  foto: async (_s: unknown, f: unknown) => gravar(f),
  pulso: async (_s: unknown, p: unknown) => gravar(p),
}

const motores: Array<InstanceType<typeof MotorTeeds>> = []
const timers: Array<ReturnType<typeof setInterval>> = []
for (let i = 0; i < N; i++) {
  const id = IDS[i % IDS.length]
  const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === id)!
  const p = parametrosPadrao(id)
  const config = { valorInicial: 1, valorAoVencer: 1, fatorGale: 2, galeApos: 1, valorMaximo: 0, takeProfit: 0, stopLoss: 0, maxOperacoes: 0, parametros: p, parametrosVersao: 1 }
  const socket = new TeedsSocket({ url: URL, appId: 'teste' })
  socket.connect()
  const motor = new MotorTeeds({ socket, estrategia, config: config as never, symbol: 'R_75', moeda: 'USD', pipSize: 4 })
  const espelho = new PublicadorEspelho({ id: `carga-${String(i).padStart(4, '0')}-0000-0000-000000000000`, user_id: `u${i}`, marca: 'globalfly' } as never, config as never, () => socket.state, esc as never, () => true)
  let ops = 0
  motor.escutar((e) => {
    espelho.aoEstado(e)
    // operação nova fechou: grava no banco (registrarOperacao), uma por operação
    if (e.operacoes > ops) { ops = e.operacoes; void gravar(e.historico?.[0] ?? {}) }
  })
  motores.push(motor)
  // liga em ondas, como gente apertando play (10 por segundo)
  setTimeout(() => motor.ligar(), Math.floor(i / 10) * 1000 + 500)
}

// as telas dos clientes pedem o estado por HTTP a cada 2 s (quem pede é o processo da Deriv falsa)
createServer((q, res) => {
  const t0 = performance.now()
  const i = Number((q.url ?? '').split('/').pop())
  const m = motores[i]
  res.writeHead(m ? 200 : 404, { 'content-type': 'application/json' })
  res.end(m ? JSON.stringify(m.estadoAtual) : '{}')
  telas++; telaMs += performance.now() - t0
}).listen(9703, '127.0.0.1')

const inicio = Date.now()
const amostra = setInterval(() => {
  const ops = motores.reduce((t, m) => t + (m.estadoAtual.operacoes ?? 0), 0)
  const ligados = motores.filter((m) => m.estadoAtual.rodando).length
  console.log(`${Math.round((Date.now() - inicio) / 1000)}s · ${ligados}/${N} ligados · ${ops} operações · atraso do motor p95 ${(atraso.percentile(95) / 1e6).toFixed(0)} ms (máx ${(atraso.max / 1e6).toFixed(0)} ms) · escritas/s ${(escritas / ((Date.now() - inicio) / 1000)).toFixed(1)}`)
}, 15000)

setTimeout(() => {
  clearInterval(amostra); timers.forEach(clearInterval)
  const s = (Date.now() - inicio) / 1000
  const ops = motores.reduce((t, m) => t + (m.estadoAtual.operacoes ?? 0), 0)
  const falhas = motores.filter((m) => m.estadoAtual.falha || m.estadoAtual.motivoParada).length
  console.log(`RESUMO ${N} robôs: ${ops} operações em ${s.toFixed(0)} s (${(ops / N / (s / 60)).toFixed(1)}/robô/min) · atraso do motor p50 ${(atraso.percentile(50) / 1e6).toFixed(0)} ms, p95 ${(atraso.percentile(95) / 1e6).toFixed(0)} ms, p99 ${(atraso.percentile(99) / 1e6).toFixed(0)} ms · tela ${(telaMs / Math.max(1, telas)).toFixed(2)} ms/pedido · ${falhas} parados com motivo`)
  motores.forEach((m) => { try { m.desligar('fim do teste') } catch { /* ok */ } })
  setTimeout(() => process.exit(0), 1500)
}, DURACAO)
