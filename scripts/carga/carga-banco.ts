/**
 * Teste de carga NO BANCO DE VERDADE (13/11/2026, depois da live de 12/11).
 *
 * Os testes v1/v2 usam um Supabase falso: medem o servidor, não o banco. O
 * que travou o play na live foi o banco (0,2 → 1,5–4 s por consulta), então
 * este liga N I.A. de verdade (motor + espelho + histórico) contra a Deriv
 * falsa, mas GRAVANDO no Supabase de produção, com S telas ouvindo as tabelas
 * do espelho pelo Realtime, e no meio dispara P "plays" ao mesmo tempo: as
 * mesmas leituras que o /api/sessao faz, em fila, com P clientes diferentes.
 *
 * Rodar SÓ sem ninguém operando (de madrugada), no servidor, com o .env dele:
 *   set -a; . /root/teeds/servidor/.env; set +a
 *   TESTE_USER=<uuid do admin> ROBOS=50 PLAYS=50 TELAS=20 RODADA=a node carga-banco.mjs
 * Tudo que ele grava leva sessao_ref 'carga-banco-<rodada>-…', marca teeds, demo,
 * e é apagado no fim (APAGAR=0 mantém para conferir).
 */
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { DERIV } from '../../src/core/deriv/config'

const N = Number(process.env.ROBOS ?? 50)
const PLAYS = Number(process.env.PLAYS ?? 50)
const TELAS = Number(process.env.TELAS ?? 20)
const AQUECER_S = Number(process.env.AQUECER ?? 60)
const RODADA = process.env.RODADA ?? 'x'
const MARCA_TESTE = process.env.MARCA_TESTE ?? 'teeds'
const TESTE_USER = process.env.TESTE_USER ?? ''
const URL_SB = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const CHAVE = process.env.SUPABASE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON = process.env.SUPABASE_ANON ?? ''
if (!URL_SB || !CHAVE || !TESTE_USER) { console.error('falta SUPABASE_URL, SUPABASE_SECRET ou TESTE_USER'); process.exit(1) }
;(DERIV.ws as { public: string }).public = 'ws://127.0.0.1:9701'

const { TeedsSocket } = await import('../../src/core/deriv/client')
const { MotorTeeds } = await import('../../src/core/deriv/engine')
const { ESTRATEGIAS_LOCAIS } = await import('../../src/core/deriv/strategies')
const { parametrosPadrao } = await import('../../src/core/deriv/parametros')
const { PublicadorEspelho } = await import('../../servidor/src/espelho')
const sb = await import('../../servidor/src/supabase')

const rest = async (caminho: string, init: RequestInit = {}) => {
  const r = await fetch(`${URL_SB}/rest/v1${caminho}`, { ...init, headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) } })
  if (!r.ok) throw new Error(`${r.status} ${caminho}: ${(await r.text()).slice(0, 200)}`)
  return r.status === 204 ? null : r.json().catch(() => null)
}
const pct = (l: number[], p: number) => { const s = [...l].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))] : 0 }
const resumo = (nome: string, l: number[]) => `${nome}: n=${l.length} p50 ${pct(l, 50).toFixed(2)} s · p95 ${pct(l, 95).toFixed(2)} s · máx ${Math.max(0, ...l).toFixed(2)} s`

/* ---------- o "play": as leituras do /api/sessao, em fila, para um cliente ---------- */
async function umPlay(userId: string): Promise<number> {
  const t0 = performance.now()
  const u = encodeURIComponent(userId)
  await rest(`/contas_deriv?select=conta_id&user_id=eq.${u}&marca=eq.globalfly`)
  await rest(`/deriv_autorizacoes?select=segredo,marca&user_id=eq.${u}&limit=1`)
  await rest(`/deriv_autorizacoes_apps?select=segredo,marca,app_id&user_id=eq.${u}&order=atualizado_em.desc`)
  await rest(`/chat_limites?select=*&user_id=eq.${u}&limit=1`)
  await rest('/rpc/teeds_robo_liberado', { method: 'POST', body: JSON.stringify({ p_user: userId, p_marca: 'globalfly', p_robo: 'legacy' }) })
  await rest('/rpc/teeds_simulador_permitido', { method: 'POST', body: JSON.stringify({ p_user: userId, p_marca: 'globalfly' }) })
  await rest(`/contas_deriv?select=user_id,tipo,moeda,marca&user_id=eq.${u}&limit=10`)
  return (performance.now() - t0) / 1000
}
async function rajada(clientes: string[]): Promise<number[]> { return Promise.all(clientes.map((c) => umPlay(c).catch(() => 99))) }

/* ---------- telas ouvindo o espelho pelo Realtime (como admins com o Monitoramento aberto) ---------- */
const telas: WebSocket[] = []
function abrirTelas() {
  for (let i = 0; i < TELAS; i++) {
    const ws = new WebSocket(`${URL_SB.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${ANON}&vsn=1.0.0`)
    ws.onopen = () => ws.send(JSON.stringify({ topic: `realtime:carga-${RODADA}-${i}`, event: 'phx_join', ref: '1', join_ref: '1', payload: { config: { broadcast: { self: false }, presence: { key: '' }, postgres_changes: [
      { event: '*', schema: 'public', table: 'sessoes_robos_ao_vivo', filter: 'marca=eq.teeds' },
      { event: '*', schema: 'public', table: 'pulsos_robos_ao_vivo', filter: 'marca=eq.teeds' },
      { event: 'INSERT', schema: 'public', table: 'eventos_robos_ao_vivo', filter: 'marca=eq.teeds' },
    ] }, access_token: ANON } }))
    const hb = setInterval(() => { if (ws.readyState === 1) ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: 'h' })) }, 25_000)
    ws.onclose = () => clearInterval(hb)
    telas.push(ws)
  }
}

/* ---------- as I.A. ---------- */
const atraso = monitorEventLoopDelay({ resolution: 10 }); atraso.enable()
const IDS = ['goreme', 'falcon', 'legacy', 'superior5', 'ag2']
const motores: Array<InstanceType<typeof MotorTeeds>> = []
const sessoes: string[] = []
let gravadas = 0, falhasDeGravacao = 0
const BASE_CONTRATO = 9_000_000_000_000 + (Date.now() % 1_000_000) * 1000

async function ligarTudo() {
  const socket = new TeedsSocket({ url: 'ws://127.0.0.1:9701', appId: 'teste' }); socket.connect()
  for (let i = 0; i < N; i++) {
    const id = IDS[i % IDS.length]
    const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === id)!
    const config = { valorInicial: 1, valorAoVencer: 1, fatorGale: 2, galeApos: 1, valorMaximo: 0, takeProfit: 0, stopLoss: 0, maxOperacoes: 0, parametros: parametrosPadrao(id), parametrosVersao: 1 }
    const [linha] = await rest('/sessoes_robos?select=id,user_id,parceiro', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
      sessao_ref: `carga-banco-${RODADA}-${i}`, user_id: TESTE_USER, marca: MARCA_TESTE, conta_id: 'VRTCCARGA', demo: true, moeda: 'USD',
      robo_id: id, robo_nome: `Carga ${id}`, ativo: 'R_75', origem: 'navegador', entrada_inicial: 1, entrada_atual: 1, stop_loss: 0, take_profit: 0, max_operacoes: 0, situacao: 'rodando',
    }) })
    const gravada = { id: linha.id, user_id: linha.user_id, marca: MARCA_TESTE, parceiro: linha.parceiro ?? null }
    sessoes.push(gravada.id)
    const motor = new MotorTeeds({ socket, estrategia, config: config as never, symbol: 'R_75', moeda: 'USD', pipSize: 4 })
    const espelho = new PublicadorEspelho(gravada as never, config as never, () => socket.state)
    let ja = 0
    motor.escutar((e) => {
      espelho.aoEstado(e)
      if (e.historico && e.historico.length > ja) {
        const novas = e.historico.slice(0, e.historico.length - ja).reverse(); ja = e.historico.length
        for (const op of novas) {
          sb.registrarOperacao(gravada as never, {
            contractId: BASE_CONTRATO + Number(op.contractId), contaId: 'VRTCCARGA', roboId: id, roboNome: `Carga ${id}`, ativo: 'R_75', tipoContrato: op.contractType, demo: true, moeda: 'USD',
            entrada: op.valor, pagamento: op.payout, resultado: op.lucro, ganhou: op.ganhou, markupDeriv: null, executadaEm: new Date(op.quando).toISOString(), seq: op.n,
            precoEntrada: op.entrada, digitoEntrada: op.digitoEntrada, precoSaida: op.saida, digitoSaida: op.digitoSaida, acumulado: Number(e.resultado.toFixed(2)),
          } as never, { operacoes: e.operacoes, ganhas: e.vitorias, perdidas: e.derrotas, resultado: e.resultado, movimentado: e.movimentado, proximaEntrada: e.valorAtual } as never)
            .then(() => { gravadas++ }, () => { falhasDeGravacao++ })
        }
      }
    })
    motores.push(motor)
  }
  motores.forEach((m) => m.ligar())   // todos no mesmo segundo, como na live
}

async function apagar() {
  if (process.env.APAGAR === '0' || !sessoes.length) return
  for (let i = 0; i < sessoes.length; i += 50) {
    const lista = `(${sessoes.slice(i, i + 50).join(',')})`
    for (const t of ['eventos_robos_ao_vivo', 'pulsos_robos_ao_vivo', 'sessoes_robos_ao_vivo', 'operacoes_robos']) await rest(`/${t}?sessao_id=in.${lista}`, { method: 'DELETE' }).catch((e) => console.warn('apagar', t, (e as Error).message))
    await rest(`/sessoes_robos?id=in.${lista}`, { method: 'DELETE' }).catch((e) => console.warn('apagar sessoes', (e as Error).message))
  }
}

/* ---------- roteiro ---------- */
const clientes: string[] = ((await rest(`/clientes?select=user_id&marca=eq.globalfly&order=criado_em.desc&limit=${PLAYS}`)) as Array<{ user_id: string }>).map((c) => c.user_id)
console.log(`rodada ${RODADA}: ${N} I.A., ${PLAYS} plays, ${TELAS} telas no Realtime`)
const calmo = await rajada(clientes)
console.log(resumo('  plays com o banco calmo', calmo))
abrirTelas()
await ligarTudo()
const amostras: number[] = []
const sonda = setInterval(() => { const t = performance.now(); rest(`/contas_deriv?select=conta_id&user_id=eq.${TESTE_USER}&limit=1`).then(() => amostras.push((performance.now() - t) / 1000), () => amostras.push(99)) }, 500)
await new Promise((r) => setTimeout(r, AQUECER_S * 1000))
const sobCarga = await rajada(clientes)
await new Promise((r) => setTimeout(r, 15_000))
clearInterval(sonda)
const ops = motores.reduce((t, m) => t + (m.estadoAtual.operacoes ?? 0), 0)
console.log(resumo(`  ${PLAYS} plays juntos com ${N} I.A. operando`, sobCarga))
console.log(resumo('  uma leitura simples, a cada 0,5 s, durante tudo', amostras))
console.log(`  operações: ${ops} (${(ops / N / ((AQUECER_S + 15) / 60)).toFixed(1)} por I.A. por minuto) · histórico gravado ${gravadas}, falhas ${falhasDeGravacao} · atraso do processo p95 ${(atraso.percentile(95) / 1e6).toFixed(0)} ms`)
motores.forEach((m) => { try { m.desligar('fim do teste') } catch { /* ok */ } })
telas.forEach((w) => { try { w.close() } catch { /* ok */ } })
await new Promise((r) => setTimeout(r, 4000))
await apagar()
console.log('  limpeza feita')
process.exit(0)
