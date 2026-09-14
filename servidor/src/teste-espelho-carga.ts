/**
 * Prova de carga do publicador do espelho.
 *
 *   cd servidor && npm run espelho-carga
 *
 * Simula N sessões operando ao mesmo tempo contra escritores de mentira
 * (sem rede), com relógio real e o batimento real de 2 s: mede quantas
 * escritas o banco receberia por segundo, quantos bytes viajariam, e o
 * custo que o publicador impõe ao motor. Ao final, extrapola para 10, 100
 * e 1000 robôs. Os números são de laboratório: o que falta medir em
 * produção está listado em MONITORAMENTO.md.
 *
 * Perfil simulado por robô: 1 tick/s (V75 1s), uma compra a cada 6 ticks,
 * liquidação 2 ticks depois; 30 s de duração.
 */
import { PublicadorEspelho, type EscritoresDoEspelho } from './espelho'
import type { EstadoMotor, ConfigEstrategia } from '../../src/core/deriv/engine'
import { LIMITES } from '../../src/core/teeds/espelho'

const N = Number(process.env.SESSOES ?? 50)
const DURACAO_MS = Number(process.env.DURACAO_MS ?? 30_000)
const CONFIG: ConfigEstrategia = { valorInicial: 1, valorAoVencer: 1, fatorGale: .95, galeApos: 1, valorMaximo: 0, takeProfit: 10, stopLoss: 10, maxOperacoes: 0 }

const base = (): EstadoMotor => ({
  rodando: true, emOperacao: false, operacoes: 0, vitorias: 0, derrotas: 0, perdasSeguidas: 0, resultado: 0, movimentado: 0,
  valorAtual: 1, aguardando: 'lendo o mercado', motivoParada: null, registros: [], digitos: Array.from({ length: 30 }, (_, i) => i % 10), curva: [0], condicao: null,
  ultimoLucro: null, historico: [], emCurso: null, ticksAnalisados: 0, latenciaMedia: null, falha: null, estrategia: { fase: 'aquecendo', anterior: null, motivo: null, contrato: 'DIGITUNDER', barreira: 9, virtual: true, detalhes: { baixos: 12 } },
})
const tick = (e: EstadoMotor, d: number): EstadoMotor => ({ ...e, digitos: [...e.digitos, d].slice(-120), ticksAnalisados: e.ticksAnalisados + 1, aguardando: `lendo · ${e.ticksAnalisados}` })
const compra = (e: EstadoMotor, id: number): EstadoMotor => ({ ...e, emOperacao: true, emCurso: { contractId: id, valor: e.valorAtual, payout: e.valorAtual * 1.9, entrada: 100.1, digitoEntrada: 1, spot: null, digitoAtual: null, lucro: 0, comprouEm: Date.now(), latencia: 120, contractType: 'DIGITUNDER' } })
const liquida = (e: EstadoMotor, ganhou: boolean): EstadoMotor => {
  const c = e.emCurso!; const lucro = ganhou ? c.payout - c.valor : -c.valor
  return { ...e, emOperacao: false, emCurso: null, operacoes: e.operacoes + 1, vitorias: e.vitorias + (ganhou ? 1 : 0), derrotas: e.derrotas + (ganhou ? 0 : 1),
    perdasSeguidas: ganhou ? 0 : e.perdasSeguidas + 1, resultado: Number((e.resultado + lucro).toFixed(2)), movimentado: e.movimentado + c.valor, valorAtual: ganhou ? 1 : Number((c.valor * 2).toFixed(2)),
    curva: [...e.curva, Number((e.resultado + lucro).toFixed(2))], registros: [{ hora: Date.now(), tipo: ganhou ? 'ganho' : 'perda', texto: `${ganhou ? 'Ganhou' : 'Perdeu'} ${c.valor}` } as any, ...e.registros].slice(0, 20),
    historico: [{ n: e.operacoes + 1, contractId: c.contractId, valor: c.valor, entrada: c.entrada, saida: 100.2, digitoEntrada: 1, digitoSaida: ganhou ? 3 : 8, lucro, payout: c.payout, markupDeriv: null, ganhou, quando: Date.now(), esperou: 3, contractType: c.contractType }, ...e.historico] }
}

const total = { eventos: 0, fotos: 0, pulsos: 0, bytes: { eventos: 0, fotos: 0, pulsos: 0 } }
const esc: EscritoresDoEspelho = {
  evento: async (_s, ev) => { total.eventos += 1; total.bytes.eventos += JSON.stringify(ev).length },
  foto: async (_s, f) => { total.fotos += 1; total.bytes.fotos += JSON.stringify(f).length },
  pulso: async (_s, p) => { total.pulsos += 1; total.bytes.pulsos += JSON.stringify(p).length },
}

async function rodar() {
  console.log(`Carga: ${N} sessões por ${DURACAO_MS / 1000} s · batimento ${LIMITES.pulsoMs} ms`)
  const pubs: PublicadorEspelho[] = []
  const estados: EstadoMotor[] = []
  let custoMotorNs = 0n
  let chamadas = 0
  for (let i = 0; i < N; i++) {
    const s = { id: `sessao-${String(i).padStart(4, '0')}-0000-0000-000000000000`, user_id: `u${i}`, marca: i % 2 ? 'omni' : 'teeds' }
    pubs.push(new PublicadorEspelho(s, CONFIG, () => 'open', esc, () => true))
    estados.push(base())
    pubs[i].aoEstado(estados[i])
  }
  const inicio = Date.now()
  let passo = 0
  await new Promise<void>((fim) => {
    const relogio = setInterval(() => {
      passo += 1
      for (let i = 0; i < N; i++) {
        let e = estados[i]
        const fase = (passo + i) % 6
        if (fase === 0) e = compra(e, passo * 1000 + i)
        else if (fase === 2 && e.emCurso) e = liquida(e, (passo + i) % 3 !== 0)
        else e = tick(e, (passo * 7 + i) % 10)
        estados[i] = e
        const t0 = process.hrtime.bigint()
        pubs[i].aoEstado(e)
        custoMotorNs += process.hrtime.bigint() - t0
        chamadas += 1
      }
      if (Date.now() - inicio >= DURACAO_MS) { clearInterval(relogio); fim() }
    }, 1000)
  })
  const antesDoEncerrar = { ...total }
  const t0 = Date.now()
  await Promise.all(pubs.map((p) => p.encerrar()))
  const drenagemMs = Date.now() - t0
  const segundos = (Date.now() - inicio) / 1000

  const porSessaoPorSeg = { eventos: total.eventos / N / segundos, fotos: total.fotos / N / segundos, pulsos: total.pulsos / N / segundos }
  const escritasPorSeg = (total.eventos + total.fotos + total.pulsos) / segundos
  const bytesPorSeg = (total.bytes.eventos + total.bytes.fotos + total.bytes.pulsos) / segundos
  const medidas = pubs.reduce((a, p) => ({ pulsosIdenticos: a.pulsosIdenticos + p.medidas.pulsosIdenticos, coalescidos: a.coalescidos + p.medidas.coalescidos, falhas: a.falhas + p.medidas.falhas, estados: a.estados + p.medidas.estados }), { pulsosIdenticos: 0, coalescidos: 0, falhas: 0, estados: 0 })

  console.log(`\nEstados recebidos do motor: ${medidas.estados} · custo médio de aoEstado(): ${(Number(custoMotorNs) / chamadas / 1000).toFixed(1)} µs`)
  console.log(`Escritas: ${total.eventos} eventos · ${total.fotos} fotos · ${total.pulsos} pulsos (${medidas.pulsosIdenticos} pulsos idênticos evitados, ${medidas.coalescidos} coalescências)`)
  console.log(`Tamanho médio: evento ${(total.bytes.eventos / Math.max(1, total.eventos)).toFixed(0)} B · foto ${(total.bytes.fotos / Math.max(1, total.fotos)).toFixed(0)} B · pulso ${(total.bytes.pulsos / Math.max(1, total.pulsos)).toFixed(0)} B`)
  console.log(`Por sessão por segundo: ${porSessaoPorSeg.eventos.toFixed(2)} eventos · ${porSessaoPorSeg.fotos.toFixed(2)} fotos · ${porSessaoPorSeg.pulsos.toFixed(2)} pulsos (limite: ${(1000 / LIMITES.pulsoMs).toFixed(1)})`)
  console.log(`Agregado medido (${N} sessões): ${escritasPorSeg.toFixed(1)} escritas/s · ${(bytesPorSeg / 1024).toFixed(1)} KB/s`)
  console.log(`Drenagem no encerrar de ${N} sessões: ${drenagemMs} ms · escritas do encerramento: ${total.eventos + total.fotos + total.pulsos - (antesDoEncerrar.eventos + antesDoEncerrar.fotos + antesDoEncerrar.pulsos)}`)

  const porSessao = escritasPorSeg / N
  const bytesSessao = bytesPorSeg / N
  console.log('\nExtrapolação (mesmo perfil; escrita = 1 requisição REST ao PostgREST; leitura = 1 admin assinando a marca inteira):')
  for (const n of [10, 100, 1000]) {
    const w = porSessao * n; const b = bytesSessao * n
    console.log(`  ${String(n).padStart(4)} robôs → ${w.toFixed(1).padStart(7)} escritas/s · ${(b / 1024).toFixed(1).padStart(7)} KB/s para o banco · ${(b * 86400 / 1024 / 1024).toFixed(0).padStart(6)} MB/dia gravados · Realtime por admin ≈ ${(b / 1024).toFixed(1)} KB/s`)
  }
  // A regra "≤ 1 pulso por 2 s por sessão" vale para a operação; o encerramento acrescenta um pulso final por sessão.
  const pulsosOperando = antesDoEncerrar.pulsos / N / segundos
  const fotosOperando = antesDoEncerrar.fotos / N / segundos
  const ok = pulsosOperando <= 1000 / LIMITES.pulsoMs + 0.02 && fotosOperando <= 1000 / LIMITES.pulsoMs + 0.02 && medidas.falhas === 0
  console.log(`\n${ok ? 'OK' : 'FALHOU'}: em operação, pulso ${pulsosOperando.toFixed(2)}/s e foto ${fotosOperando.toFixed(2)}/s por sessão (limite ${(1000 / LIMITES.pulsoMs).toFixed(1)}/s) · falhas ${medidas.falhas}`)
  process.exit(ok ? 0 : 1)
}
rodar().catch((e) => { console.error(e); process.exit(1) })
