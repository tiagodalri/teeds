/**
 * Provas do espelho operacional.
 *
 *   cd servidor && npm run espelho
 *
 * O que estas provas fixam (por bloco da revisão):
 *  1. ORDEM — uma única regra (`decidir`/`aplicarMensagem`) para foto,
 *     evento, pulso e reconciliação: antigo não regride, repetido é
 *     idempotente, pulso nunca substitui evento, lacuna pede foto,
 *     encerrada não volta a "rodando", sessões não se misturam.
 *  2. ENTREGA — a fila do publicador nunca perde nem reordena evento
 *     permanente; retenta com backoff e jitter; drena limitado no encerrar;
 *     não segura o motor; só 'conexao' cede sob pressão de memória.
 *  3. ESCRITAS — pulso no máximo 1 por 2 s por sessão e nunca idêntico.
 *  4. SAÚDE — faixas ao vivo/atenção/desatualizado por relógio local; RTT
 *     por mediana; desvio de relógio não vira latência.
 *  5. REPLAY — reconstrução fiel, lacunas detectadas, descrição de eventos
 *     lendo `historicoNovas` (ganho/perda/empate, dígitos, valor, acumulado).
 * 12. THE PALM — telemetria observável, determinística e sem mudar decisão;
 *     telemetria que lança não derruba o motor.
 */
import { PublicadorEspelho, espelhoHabilitado, type EscritoresDoEspelho } from './espelho'
import { MotorTeeds, type EstadoMotor, type ConfigEstrategia, type Contexto, type Estrategia } from '../../src/core/deriv/engine'
import { THE_PALM } from '../../src/core/deriv/strategies'
import {
  LIMITES, aplicarMensagem, decidir, delta, descreverEvento, idadeDaAtualizacao, integridadeDoHistorico, marcadorDoEvento, mascararConta, mascararEmail,
  ordenarEventos, reconstruir, resumirEstado, saudeDoSinal, tipoDoEvento, EstimadorDeDesvio, MedidorDeRtt,
  type EventoEspelho, type SessaoEspelho, type MensagemEspelho,
} from '../../src/core/teeds/espelho'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) certos++
  else { errados++; console.error(`✕ ${nome}\n   esperava ${JSON.stringify(esperado)}\n   veio     ${JSON.stringify(deu)}`) }
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))
conferir('desligamento impede novos publicadores', espelhoHabilitado('1'), false)
conferir('espelho habilitado sem desligamento', espelhoHabilitado(''), true)

/* ------------------------------------------------------------ fábricas */
const CONFIG: ConfigEstrategia = { valorInicial: 1, valorAoVencer: 1, fatorGale: .95, galeApos: 1, valorMaximo: 0, takeProfit: 10, stopLoss: 10, maxOperacoes: 0 }
const base = (): EstadoMotor => ({
  rodando: true, emOperacao: false, operacoes: 0, vitorias: 0, derrotas: 0, perdasSeguidas: 0, resultado: 0, movimentado: 0,
  valorAtual: 1, aguardando: 'lendo o mercado', motivoParada: null, registros: [], digitos: [1, 2, 3], curva: [0], condicao: null,
  ultimoLucro: null, historico: [], emCurso: null, ticksAnalisados: 0, latenciaMedia: null, falha: null, estrategia: null,
})
const tick = (e: EstadoMotor, d: number): EstadoMotor => ({ ...e, digitos: [...e.digitos, d].slice(-120), ticksAnalisados: e.ticksAnalisados + 1 })
const compra = (e: EstadoMotor, id: number, valor = 1): EstadoMotor => ({ ...e, emOperacao: true, emCurso: { contractId: id, valor, payout: 1.9, entrada: 100.1, digitoEntrada: 1, spot: null, digitoAtual: null, lucro: 0, comprouEm: Date.now(), latencia: 120, contractType: 'DIGITOVER' } })
const liquida = (e: EstadoMotor, ganhou: boolean, empate = false): EstadoMotor => {
  const c = e.emCurso!; const lucro = empate ? 0 : ganhou ? c.payout - c.valor : -c.valor
  return { ...e, emOperacao: false, emCurso: null, operacoes: e.operacoes + 1, vitorias: e.vitorias + (ganhou ? 1 : 0), derrotas: e.derrotas + (ganhou ? 0 : 1),
    perdasSeguidas: ganhou ? 0 : e.perdasSeguidas + 1, resultado: Number((e.resultado + lucro).toFixed(2)), movimentado: e.movimentado + c.valor, valorAtual: ganhou ? 1 : Number((c.valor * 2).toFixed(2)),
    curva: [...e.curva, Number((e.resultado + lucro).toFixed(2))],
    historico: [{ n: e.operacoes + 1, contractId: c.contractId, valor: c.valor, entrada: c.entrada, saida: 100.2, digitoEntrada: 1, digitoSaida: ganhou ? 7 : 2, lucro, payout: c.payout, markupDeriv: null, ganhou, quando: 1_700_000_000_000, esperou: 3, contractType: c.contractType }, ...e.historico] }
}

/** Escritores de mentira: gravam o que receberam e podem falhar ou travar sob comando. Nunca dormem de verdade. */
function escritoresFalsos(opcoes: { falhar?: (tipo: 'evento' | 'foto' | 'pulso') => boolean; travar?: boolean } = {}) {
  const gravado = { eventos: [] as any[], fotos: [] as any[], pulsos: [] as any[], tentativasEvento: 0, esperas: [] as number[] }
  let relogio = 1_000_000
  const talvez = async (tipo: 'evento' | 'foto' | 'pulso') => { if (opcoes.travar) await new Promise(() => {}); if (opcoes.falhar?.(tipo)) throw new Error('banco fora do ar') }
  const esc: EscritoresDoEspelho = {
    evento: async (_s, ev) => { gravado.tentativasEvento += 1; await talvez('evento'); if (gravado.eventos.some((x) => x.seq === ev.seq)) throw new Error('duplicate key 23505'); gravado.eventos.push(ev) },
    foto: async (_s, f) => { await talvez('foto'); gravado.fotos.push(f) },
    pulso: async (_s, p) => { await talvez('pulso'); gravado.pulsos.push(p) },
    agora: () => relogio,
    // Não dorme de verdade, mas cede o laço de eventos (como um setTimeout real cederia).
    dormir: async (ms) => { gravado.esperas.push(ms); relogio += ms; await new Promise((r) => setImmediate(r)) },
    aleatorio: () => 0.5,
  }
  return { esc, gravado, avancar: (ms: number) => { relogio += ms } }
}
const sessao = { id: 'aaaaaaaa-0000-0000-0000-000000000001', user_id: 'u1', marca: 'teeds' }
const sessaoB = { id: 'bbbbbbbb-0000-0000-0000-000000000002', user_id: 'u2', marca: 'teeds' }

const espelhoDe = (e: EstadoMotor, seq: number, extra: Partial<SessaoEspelho> = {}): SessaoEspelho => ({
  sessaoId: sessao.id, sessaoRef: 'r', marca: 'teeds', userId: 'u1', contaId: 'CR1', demo: true, moeda: 'USD', roboId: 'x', roboNome: 'X', ativo: '1HZ75V',
  config: CONFIG, seq, origemDoSeq: 'foto', estado: resumirEstado(e), situacao: 'rodando', emitidoEm: 1000 + seq, recebidoEm: 2000 + seq, atualizadaEm: '', criadaEm: '', ...extra,
})

async function provas() {
  /* -------------------------------------------------- significância */
  {
    const e0 = base()
    conferir('primeiro estado é abertura', tipoDoEvento(null, resumirEstado(e0)), 'abertura')
    conferir('tick não é evento', tipoDoEvento(resumirEstado(e0), resumirEstado(tick(e0, 5))), null)
    const e1 = compra(e0, 11)
    conferir('compra é evento', tipoDoEvento(resumirEstado(e0), resumirEstado(e1)), 'compra')
    const e2 = liquida(e1, false)
    conferir('liquidação é evento', tipoDoEvento(resumirEstado(e1), resumirEstado(e2)), 'liquidacao')
    conferir('entrada seguinte muda no delta', delta(resumirEstado(e1), resumirEstado(e2)).valorAtual, 2)
    const e3 = { ...e2, valorAtual: 3 }
    conferir('nova entrada é evento', tipoDoEvento(resumirEstado(e2), resumirEstado(e3)), 'entrada')
    const e4 = { ...e3, rodando: false, motivoParada: 'stop' }
    conferir('parada é evento', tipoDoEvento(resumirEstado(e3), resumirEstado(e4)), 'parada')
    const e5 = { ...e3, estrategia: { fase: 'recuperacao-real', anterior: 'base-real', motivo: 'x', contrato: 'DIGITUNDER', barreira: 5, virtual: false, detalhes: {} } }
    conferir('troca de estratégia é evento', tipoDoEvento(resumirEstado(e3), resumirEstado(e5)), 'estrategia')
    const dto = resumirEstado({ ...e2, digitos: Array.from({ length: 200 }, (_, i) => i % 10) })
    conferir('DTO corta a fita em 30', dto.digitos.length, LIMITES.digitos)
    conferir('markup da sessão usa 3% do payout sem esperar a Deriv', resumirEstado(e2).markupCalculado, .057)
    conferir('markup calculado viaja no delta da liquidação', delta(resumirEstado(e1), resumirEstado(e2)).markupCalculado, .057)
    conferir('DTO não tem chaves além das previstas', Object.keys(dto).every((k) => !/token|segredo|senha|auth|socket|memoria/i.test(k)), true)
    conferir('delta vazio quando nada mudou', delta(resumirEstado(e2), resumirEstado(e2)), {})
  }

  /* ================================== BLOCO 1: ordem, uma regra só */
  {
    const e0 = base(); const e1 = compra(e0, 11); const e2 = liquida(e1, true)
    let mapa = new Map<string, SessaoEspelho>()
    const r0 = aplicarMensagem(mapa, { origem: 'foto', sessao: espelhoDe(e0, 5) }); mapa = r0.sessoes
    // 1) evento antigo depois de uma foto mais nova é ignorado
    const antigo: EventoEspelho = { sessaoId: sessao.id, marca: 'teeds', seq: 4, tipo: 'compra', delta: { emCurso: resumirEstado(e1).emCurso }, emitidoEm: 1 }
    const r1 = aplicarMensagem(mapa, { origem: 'evento', evento: antigo, recebidoEm: 1 })
    conferir('B1.1 evento antigo (seq 4 < 5) é ignorado', [r1.decisao.aceitar, (r1.decisao as any).motivo, r1.sessoes.get(sessao.id)!.seq], [false, 'antiga', 5])
    // 2) evento repetido é idempotente
    const ev6: EventoEspelho = { sessaoId: sessao.id, marca: 'teeds', seq: 6, tipo: 'compra', delta: delta(resumirEstado(e0), resumirEstado(e1)), emitidoEm: 6 }
    mapa = aplicarMensagem(mapa, { origem: 'evento', evento: ev6, recebidoEm: 6 }).sessoes
    const r2 = aplicarMensagem(mapa, { origem: 'evento', evento: ev6, recebidoEm: 7 })
    conferir('B1.2 evento repetido não é reaplicado', [(r2.decisao as any).motivo, r2.sessoes === mapa, mapa.get(sessao.id)!.estado.emCurso?.contractId], ['repetida', true, 11])
    // 3) pulso com a mesma seq só toca campos efêmeros; não substitui o evento
    const r3 = aplicarMensagem(mapa, { origem: 'pulso', sessaoId: sessao.id, seq: 6, pulso: { fase: 'operando', digitos: [9, 9], ticksAnalisados: 50, aguardando: '', condicao: null, digitoAtual: 4, estrategia: null }, emitidoEm: 8, recebidoEm: 8 })
    const s3 = r3.sessoes.get(sessao.id)!
    conferir('B1.3 pulso da mesma seq atualiza fita e dígito, mantém contrato e origem', [(r3.decisao as any).motivo, s3.estado.digitos, s3.estado.emCurso?.digitoAtual, s3.estado.emCurso?.contractId, s3.origemDoSeq, s3.seq], ['mesma-seq-efemera', [9, 9], 4, 11, 'evento', 6])
    mapa = r3.sessoes
    // 4) pulso antigo é ignorado
    const r4 = aplicarMensagem(mapa, { origem: 'pulso', sessaoId: sessao.id, seq: 3, pulso: { fase: 'aguardando', digitos: [0], ticksAnalisados: 1, aguardando: '', condicao: null, digitoAtual: null, estrategia: null }, emitidoEm: 9, recebidoEm: 9 })
    conferir('B1.4 pulso antigo (seq 3 < 6) é ignorado', [(r4.decisao as any).motivo, r4.sessoes.get(sessao.id)!.estado.digitos], ['antiga', [9, 9]])
    // 5) lacuna: evento seq 9 quando temos 6 → pede a foto, não aplica delta
    const ev9: EventoEspelho = { sessaoId: sessao.id, marca: 'teeds', seq: 9, tipo: 'liquidacao', delta: delta(resumirEstado(e1), resumirEstado(e2)), emitidoEm: 9 }
    const r5 = aplicarMensagem(mapa, { origem: 'evento', evento: ev9, recebidoEm: 9 })
    conferir('B1.5 lacuna pede a foto completa e não aplica o delta', [(r5.decisao as any).motivo, r5.pedirFoto, r5.sessoes.get(sessao.id)!.seq], ['lacuna', [sessao.id], 6])
    // 6) a foto que chega depois (seq 9) realinha
    const r6 = aplicarMensagem(mapa, { origem: 'foto', sessao: espelhoDe(e2, 9) })
    conferir('B1.6 foto mais nova realinha (seq 9, operações 1)', [(r6.decisao as any).motivo, r6.sessoes.get(sessao.id)!.seq, r6.sessoes.get(sessao.id)!.estado.operacoes], ['nova', 9, 1])
    mapa = r6.sessoes
    // 7) parada: pulso atrasado não reabre
    const parada: EventoEspelho = { sessaoId: sessao.id, marca: 'teeds', seq: 10, tipo: 'parada', delta: { rodando: false, motivoParada: 'meta', fase: 'parado' }, emitidoEm: 10 }
    mapa = aplicarMensagem(mapa, { origem: 'evento', evento: parada, recebidoEm: 10 }).sessoes
    const r7 = aplicarMensagem(mapa, { origem: 'pulso', sessaoId: sessao.id, seq: 10, pulso: { fase: 'operando', digitos: [1], ticksAnalisados: 99, aguardando: '', condicao: null, digitoAtual: null, estrategia: null }, emitidoEm: 11, recebidoEm: 11 })
    conferir('B1.7 sessão encerrada rejeita pulso atrasado e continua encerrada', [(r7.decisao as any).motivo, r7.sessoes.get(sessao.id)!.situacao, r7.sessoes.get(sessao.id)!.estado.fase], ['encerrada', 'encerrada', 'parado'])
    // reconciliação (lista) com a mesma seq dizendo "rodando" não reabre
    const r7b = aplicarMensagem(mapa, { origem: 'lista', sessao: espelhoDe({ ...e2, rodando: false }, 10, { situacao: 'rodando' }) })
    conferir('B1.7b lista da mesma seq não reabre uma sessão encerrada', r7b.sessoes.get(sessao.id)!.situacao, 'encerrada')
    // 8) sessões diferentes não interferem
    const rB = aplicarMensagem(mapa, { origem: 'evento', evento: { ...ev6, sessaoId: sessaoB.id, seq: 1, tipo: 'abertura', delta: resumirEstado(e0) }, recebidoEm: 12 })
    conferir('B1.8 evento de sessão desconhecida pede foto e não toca nas outras', [(rB.decisao as any).motivo, rB.pedirFoto, rB.sessoes.get(sessao.id)!.seq], ['desconhecida', [sessaoB.id], 10])
    const rB2 = aplicarMensagem(mapa, { origem: 'foto', sessao: { ...espelhoDe(e0, 1), sessaoId: sessaoB.id } })
    conferir('B1.8b sequência é por sessão: seq 1 da B convive com seq 10 da A', [rB2.sessoes.get(sessaoB.id)!.seq, rB2.sessoes.get(sessao.id)!.seq], [1, 10])
    // decidir() diretamente: mesma seq, foto sobre evento é "mais completa"; foto sobre foto é repetida
    conferir('B1.9 foto da mesma seq sobre evento é aceita (mais completa)', decidir({ seq: 6, origemDoSeq: 'evento', situacao: 'rodando' }, { origem: 'foto', seq: 6 }), { aceitar: true, motivo: 'mesma-seq-mais-completa' })
    conferir('B1.10 foto da mesma seq sobre foto é repetida', decidir({ seq: 6, origemDoSeq: 'foto', situacao: 'rodando' }, { origem: 'lista', seq: 6 }), { aceitar: false, motivo: 'repetida' })
  }

  /* ================================== BLOCO 2: entrega confiável */
  {
    // 2.1 sai na hora, não no batimento
    const { esc, gravado } = escritoresFalsos()
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base(); pub.aoEstado(e); await dormir(5)
    conferir('B2.1 abertura gravada imediatamente (evento + foto)', [gravado.eventos.length, gravado.fotos.length], [1, 1])
    conferir('B2.1b abertura leva a configuração', gravado.eventos[0].config, CONFIG)
    e = compra(e, 21); pub.aoEstado(e); await dormir(5)
    conferir('B2.1c compra é o evento 2, gravado sem esperar o batimento', [gravado.eventos.length, gravado.eventos[1].seq, gravado.eventos[1].tipo], [2, 2, 'compra'])
    for (let i = 0; i < 5; i++) { e = tick(e, i); pub.aoEstado(e) }
    await dormir(5)
    conferir('B2.1d ticks não viram evento nem escrita imediata', [gravado.eventos.length, gravado.pulsos.length], [2, 0])
    await pub.encerrar()
    conferir('B2.1e encerrar grava a foto final como evento permanente e drena', [gravado.eventos[gravado.eventos.length - 1].tipo, pub.pendentes], ['foto', 0])
  }
  {
    // 2.2 falha do banco → retenta com backoff exponencial e jitter; ordem e completude preservadas
    let falhas = 3
    const { esc, gravado } = escritoresFalsos({ falhar: (t) => t === 'evento' && falhas-- > 0 })
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base(); pub.aoEstado(e)
    e = compra(e, 31); pub.aoEstado(e)
    e = liquida(e, true); pub.aoEstado(e)
    e = compra(e, 32); pub.aoEstado(e)
    e = liquida(e, false); pub.aoEstado(e)
    await dormir(20)
    conferir('B2.2 todos os 5 eventos permanentes chegaram apesar de 3 falhas', gravado.eventos.map((x: any) => x.tipo), ['abertura', 'compra', 'liquidacao', 'compra', 'liquidacao'])
    conferir('B2.2b em ordem e sem buraco', gravado.eventos.map((x: any) => x.seq), [1, 2, 3, 4, 5])
    conferir('B2.2c retentou (mais tentativas que gravações) e contou as falhas', [gravado.tentativasEvento > 5, pub.medidas.falhas], [true, 3])
    conferir('B2.2d backoff cresce (500·2^n com jitter 0,5+0,5 → 1000, 2000, 4000)', gravado.esperas, [1000, 2000, 4000])
    await pub.encerrar()
  }
  {
    // 2.3 jitter de verdade: com aleatório 0 e 1, a mesma tentativa espera diferente
    const a = escritoresFalsos({ falhar: (t) => t === 'evento' && a.gravado.tentativasEvento === 1 }); a.esc.aleatorio = () => 0
    const b = escritoresFalsos({ falhar: (t) => t === 'evento' && b.gravado.tentativasEvento === 1 }); b.esc.aleatorio = () => 1
    const pa = new PublicadorEspelho(sessao, CONFIG, () => 'open', a.esc, () => true); pa.aoEstado(base()); await dormir(5)
    const pb = new PublicadorEspelho(sessao, CONFIG, () => 'open', b.esc, () => true); pb.aoEstado(base()); await dormir(5)
    conferir('B2.3 jitter: mesma tentativa espera 500 ms (r=0) ou 1500 ms (r=1)', [a.gravado.esperas, b.gravado.esperas], [[500], [1500]])
    await pa.encerrar(); await pb.encerrar()
  }
  {
    // 2.4 nunca segura o motor
    const { esc } = escritoresFalsos({ travar: true })
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base()
    const t0 = performance.now()
    for (let i = 0; i < 200; i++) { e = i % 2 ? compra(e, 100 + i) : (e.emCurso ? liquida(e, true) : tick(e, i)); pub.aoEstado(e) }
    const gasto = performance.now() - t0
    conferir('B2.4 200 estados com o banco travado custam < 50 ms ao motor', gasto < 50, true)
    conferir('B2.4b nada explodiu com o banco travado', pub.medidas.estados, 200)
    void pub.encerrar()   // fica travado para sempre — a promessa não resolve, e isso não segura ninguém
  }
  {
    // 2.5 encerrar() com banco fora: drena até o prazo (2 min do relógio injetado) e registra o pendente
    const { esc, gravado } = escritoresFalsos({ falhar: (t) => t === 'evento' })
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base(); pub.aoEstado(e); e = compra(e, 41); pub.aoEstado(e)
    await dormir(5)
    await pub.encerrar()
    conferir('B2.5 drenagem limitada: estourou o prazo e registrou o pendente', [pub.medidas.drenagemEstourada, pub.medidas.pendentesAoEstourar >= 3, gravado.eventos.length], [true, true, 0])
    conferir('B2.5b as esperas somadas passam do prazo de 120 s e nenhuma passa de 30 s·1,0', [gravado.esperas.reduce((a, b) => a + b, 0) >= 120_000, Math.max(...gravado.esperas) <= 30_000], [true, true])
  }
  {
    // 2.6 sucesso tardio: o banco volta durante a drenagem → tudo gravado, em ordem
    let falhasSeguidas = 0
    const { esc, gravado } = escritoresFalsos({ falhar: (t) => t === 'evento' && ++falhasSeguidas <= 4 })   // volta na 5ª tentativa
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base(); pub.aoEstado(e); e = compra(e, 51); pub.aoEstado(e); e = liquida(e, false); pub.aoEstado(e)
    await pub.encerrar()
    conferir('B2.6 banco volta durante a drenagem: fila esvazia em ordem, incluindo a foto final', [gravado.eventos.map((x: any) => x.seq), gravado.eventos[gravado.eventos.length - 1].tipo, pub.pendentes, pub.medidas.drenagemEstourada], [[1, 2, 3, 4], 'foto', 0, false])
  }
  {
    // 2.7 pressão de memória: só 'conexao' é podado; eventos permanentes ficam
    const { esc } = escritoresFalsos({ travar: true })
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base(); pub.aoEstado(e)
    let conexao = 'open'
    const pubConexao = new PublicadorEspelho(sessao, CONFIG, () => conexao, esc, () => true)
    pubConexao.aoEstado(e)
    // 5100 alternâncias de conexão viram eventos 'conexao' (não permanentes)
    for (let i = 0; i < 5100; i++) { conexao = i % 2 ? 'open' : 'closed'; pubConexao.aoEstado(tick(e, i)) }
    // agora eventos permanentes chegam com a fila cheia
    e = compra(e, 61); pubConexao.aoEstado(e); e = liquida(e, true); pubConexao.aoEstado(e)
    conferir('B2.7 sob pressão, "conexao" é podado e o permanente ainda entra', [pubConexao.medidas.podados > 0, pubConexao.pendentes <= 5000 + 10, pubConexao.sequencia > 5100], [true, true, true])
    // sequência de 5000+ ticks com o banco travado: eventos permanentes nunca são descartados
    for (let i = 0; i < 6000; i++) { e = e.emCurso ? liquida(e, i % 2 === 0) : compra(e, 1000 + i); pub.aoEstado(e) }
    conferir('B2.7b 6000 eventos permanentes com banco travado: nenhum descartado', [pub.medidas.podados, pub.pendentes >= 6000], [0, true])
    void pub.encerrar(); void pubConexao.encerrar()
  }
  {
    // 2.8 isolamento entre sessões: a sessão A com banco travado não atrasa a B
    const travado = escritoresFalsos({ travar: true }); const bom = escritoresFalsos()
    const pa = new PublicadorEspelho(sessao, CONFIG, () => 'open', travado.esc, () => true)
    const pb = new PublicadorEspelho(sessaoB, CONFIG, () => 'open', bom.esc, () => true)
    pa.aoEstado(base()); pb.aoEstado(base()); await dormir(5)
    conferir('B2.8 sessão B grava normalmente enquanto a A está travada', [bom.gravado.eventos.length, travado.gravado.eventos.length], [1, 0])
    void pa.encerrar(); await pb.encerrar()
  }
  {
    // 2.9 evento duplicado no banco (23505) é tratado como sucesso
    const { esc, gravado } = escritoresFalsos()
    gravado.eventos.push({ seq: 1, tipo: 'abertura' })   // já estava lá (ex.: reinício do servidor)
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    pub.aoEstado(base()); await dormir(5)
    conferir('B2.9 duplicado no banco não gera falha nem retentativa', [pub.medidas.falhas, gravado.esperas.length, pub.pendentes], [0, 0, 0])
    await pub.encerrar()
  }
  {
    // 2.10 falha na FOTO retenta sem perder e não bloqueia os eventos seguintes
    let falhaFoto = 1
    const { esc, gravado } = escritoresFalsos({ falhar: (t) => t === 'foto' && falhaFoto-- > 0 })
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base(); pub.aoEstado(e); await dormir(5)
    e = compra(e, 71); pub.aoEstado(e); await dormir(5)
    await pub.encerrar()
    conferir('B2.10 foto falhou uma vez, evento seguinte gravado e a foto mais nova acabou entregue', [gravado.eventos.length >= 2, gravado.fotos.length >= 1, gravado.fotos[gravado.fotos.length - 1].seq], [true, true, 3])
  }

  /* ================================== BLOCO 3: menos escritas */
  {
    const { esc, gravado, avancar } = escritoresFalsos()
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base(); pub.aoEstado(e); await dormir(5)
    // 10 ticks em "meio segundo": nada escrito até o batimento
    for (let i = 0; i < 10; i++) { e = tick(e, i); pub.aoEstado(e) }
    await dormir(5)
    conferir('B3.1 ticks não escrevem nada sozinhos', gravado.pulsos.length, 0)
    ;(pub as any).bater(); await dormir(5)
    conferir('B3.2 o batimento leva a fita inteira num pulso só', [gravado.pulsos.length, gravado.pulsos[0].pulso.digitos.length, gravado.pulsos[0].pulso.ticksAnalisados], [1, 13, 10])
    // fotos: a da abertura sai na hora; a de uma compra logo depois espera a janela de 2 s e sai no batimento
    e = compra(e, 91); pub.aoEstado(e); await dormir(5)
    conferir('B3.2b foto de evento comum não sai antes da janela de 2 s (só a da abertura foi gravada)', gravado.fotos.length, 1)
    avancar(LIMITES.pulsoMs); (pub as any).bater(); await dormir(5)
    conferir('B3.2c passada a janela, o batimento descarrega a foto pendente (seq da compra)', [gravado.fotos.length, gravado.fotos[1].seq], [2, 2])
    ;(pub as any).bater(); await dormir(5)
    // (a compra acima mudou a fase → o batimento de B3.2c gravou o 2º pulso; o próximo, sem mudança, não grava)
    conferir('B3.3 sem mudança, não grava pulso idêntico', [gravado.pulsos.length, pub.medidas.pulsosIdenticos], [2, 1])
    avancar(LIMITES.pulsoMs * 5 + 1); (pub as any).bater(); await dormir(5)
    conferir('B3.4 presença: sem mudança, renova o carimbo uma vez a cada 10 s', gravado.pulsos.length, 3)
    conferir('B3.5 intervalo do batimento é 2 s (≤ 1 pulso por 2 s por sessão)', LIMITES.pulsoMs, 2000)
    await pub.encerrar()
  }

  /* ================================== BLOCO 4: saúde e latência */
  {
    const agora = 1_000_000
    const s = (recebidoHa: number) => ({ recebidoEm: agora - recebidoHa, situacao: 'rodando' as const })
    conferir('B4.1 ao vivo até 2,5 s (pulso de 2 s + folga)', saudeDoSinal(s(2400), agora), 'ao-vivo')
    conferir('B4.2 atenção entre 2,5 e 6 s', saudeDoSinal(s(3000), agora), 'atencao')
    conferir('B4.3 desatualizado acima de 6 s', saudeDoSinal(s(6100), agora), 'desatualizado')
    conferir('B4.4 encerrada não é medida', saudeDoSinal({ recebidoEm: 0, situacao: 'encerrada' }, agora), 'encerrada')
    conferir('B4.5 idade da atualização em décimos, nunca negativa', [idadeDaAtualizacao({ recebidoEm: agora - 1234 }, agora), idadeDaAtualizacao({ recebidoEm: agora + 500 }, agora)], [1.2, 0])
    // relógio do servidor 2 s adiantado ou atrasado NÃO muda a saúde (ela usa o relógio local)
    conferir('B4.6 desvio de ±2 s no carimbo do servidor não altera a saúde', [saudeDoSinal({ ...s(1000), emitidoEm: agora + 2000 } as any, agora), saudeDoSinal({ ...s(1000), emitidoEm: agora - 2000 } as any, agora)], ['ao-vivo', 'ao-vivo'])
    const r = new MedidorDeRtt(); r.registrar(120); r.registrar(90); r.registrar(400)
    conferir('B4.7 RTT é a mediana arredondada a 50 ms', r.mediana, 100)
    conferir('B4.8 RTT ignora valores inválidos', r.registrar(-5), 100)
    const d = new EstimadorDeDesvio(); d.registrar(5000, 3000); d.registrar(6000, 4100); d.registrar(7000, 4900)
    conferir('B4.9 desvio de relógio estimado (−2 s) sem virar latência negativa', d.desvioSegundos, -2)
    const d2 = new EstimadorDeDesvio(); d2.registrar(1, 2)
    conferir('B4.10 desvio só com 3+ amostras', d2.desvioSegundos, null)
  }

  /* ================================== BLOCO 5: replay */
  {
    const { esc, gravado } = escritoresFalsos()
    const pub = new PublicadorEspelho(sessao, CONFIG, () => 'open', esc, () => true)
    let e = base(); pub.aoEstado(e)
    for (let n = 0; n < 12; n++) {
      e = tick(e, n); pub.aoEstado(e)
      e = compra(e, 200 + n); pub.aoEstado(e)
      e = liquida(e, n % 3 !== 0, n === 5); pub.aoEstado(e)
    }
    e = { ...e, rodando: false, motivoParada: 'meta' }; pub.aoEstado(e)
    await pub.encerrar()
    const eventos: EventoEspelho[] = gravado.eventos.map((x: any) => ({ sessaoId: sessao.id, marca: 'teeds', seq: x.seq, tipo: x.tipo, delta: x.delta, emitidoEm: x.emitidoEm }))
    const passos = reconstruir(eventos)
    const final = passos[passos.length - 1].estado
    const esperado = resumirEstado(e)
    conferir('B5.1 replay termina na foto final da sessão', final, esperado)
    conferir('B5.2 replay conta as mesmas operações do resumo', [final.operacoes, final.vitorias, final.derrotas], [12, 8, 4])
    const penultimo = passos[passos.length - 2].estado
    conferir('B5.3 estado reconstruído por deltas bate a foto (histórico, curva, contadores)', [penultimo.operacoes, penultimo.historico.length, penultimo.curva[penultimo.curva.length - 1], penultimo.resultado], [esperado.operacoes, esperado.historico.length, esperado.curva[esperado.curva.length - 1], esperado.resultado])
    const liquidacoes = eventos.filter((x) => x.tipo === 'liquidacao')
    conferir('B5.4 liquidação viaja incremental (uma operação nova, sem a curva)', liquidacoes.every((x) => (x.delta.historicoNovas?.length ?? 0) === 1 && !('curva' in x.delta) && !('historico' in x.delta)), true)
    conferir('B5.5 evento de liquidação cabe em menos de 1 KB', Math.max(...liquidacoes.map((x) => JSON.stringify(x.delta).length)) < 1024, true)
    conferir('B5.6 nenhuma lacuna numa sessão íntegra', passos.every((p) => p.lacuna === 0), true)
    conferir('B5.6b integridade: completo', integridadeDoHistorico(eventos, passos, false, false), 'completo')
    const comBuraco = eventos.filter((x) => x.seq !== 5)
    const passos2 = reconstruir(comBuraco)
    conferir('B5.7 lacuna é detectada, não inventada', passos2.find((p) => p.evento.seq === 6)?.lacuna, 1)
    conferir('B5.7b integridade: lacunas', integridadeDoHistorico(comBuraco, passos2, false, false), 'lacunas')
    conferir('B5.7c depois da foto final o replay realinha', passos2[passos2.length - 1].estado, esperado)
    conferir('B5.7d sem abertura: começa na primeira foto e marca lacunas', integridadeDoHistorico(eventos.slice(1), reconstruir(eventos.slice(1)), false, false), 'lacunas')
    conferir('B5.7e integridade: carregando / indisponível / em andamento', [integridadeDoHistorico([], [], true, false), integridadeDoHistorico([], [], false, false), integridadeDoHistorico(eventos, passos, false, true)], ['carregando', 'indisponivel', 'em-andamento'])
    const bagunca = [...eventos.slice(3), eventos[1], eventos[0], eventos[2], eventos[2]]
    conferir('B5.8 ordenar: sem repetição e em ordem', ordenarEventos(bagunca).map((x) => x.seq), eventos.map((x) => x.seq))
    conferir('B5.8b ordenar: o que já foi aplicado não volta', ordenarEventos(bagunca, 10).map((x) => x.seq)[0], 11)
    // descrição dos eventos: lê historicoNovas
    const ganho = liquidacoes.find((x) => x.delta.historicoNovas![0].lucro > 0)!
    const perda = liquidacoes.find((x) => x.delta.historicoNovas![0].lucro < 0)!
    const empate = liquidacoes.find((x) => x.delta.historicoNovas![0].lucro === 0)!
    const dg = descreverEvento(ganho, 'USD'); const dp = descreverEvento(perda, 'USD'); const de = descreverEvento(empate, 'USD')
    conferir('B5.9 ganho descrito com valor, dígitos, acumulado e horário', [dg.startsWith('ganho +0,90 USD'), /valor USD 1,00/.test(dg), /dígitos 1 → 7/.test(dg), /acumulado [+−]\d/.test(dg), /\d{2}:\d{2}:\d{2}$/.test(dg)], [true, true, true, true, true])
    conferir('B5.9b perda descrita com sinal negativo e dígito de saída', [dp.startsWith('perda −'), /→ 2/.test(dp)], [true, true])
    conferir('B5.9c empate descrito como empate', de.startsWith('empate '), true)
    conferir('B5.9d marcadores: ganho/perda/compra/parada', [marcadorDoEvento(ganho), marcadorDoEvento(perda), marcadorDoEvento(eventos[1]), marcadorDoEvento(eventos.find((x) => x.tipo === 'parada')!)], ['ganho', 'perda', 'compra', 'parada'])
    conferir('B5.9e compra descrita com contrato, valor e dígito de entrada', descreverEvento(eventos[1], 'USD'), 'contrato 200 · USD 1,00 · entrada no dígito 1')
  }

  /* ================================== BLOCO 12: The Palm observável e determinístico */
  {
    const ctxDe = (memoria: Record<string, unknown>, digitos: number[]): Contexto => ({ digitos, perdasSeguidas: 0, vitoriasSeguidas: 0, operacoes: 0, resultado: 0, prejuizoDaSequencia: 0, memoria, config: CONFIG })
    const semNove = Array.from({ length: 24 }, (_, i) => i % 9)
    const metadeBaixa = [...Array(12).fill(0), ...Array(12).fill(7), 8]
    // a mesma sequência de decisões, com e sem chamar a telemetria, dá o mesmo resultado
    const rodar = (comTelemetria: boolean) => {
      const memoria: Record<string, unknown> = {}
      const saida: unknown[] = []
      const passo = (d: number[]) => { const c = ctxDe(memoria, d); if (comTelemetria) THE_PALM.telemetria!(c); saida.push(THE_PALM.entrar(c)); if (comTelemetria) THE_PALM.telemetria!(c); saida.push(THE_PALM.contrato?.(c)) }
      passo(semNove); passo([...semNove, 9])
      THE_PALM.aposResultado?.({ ...ctxDe(memoria, metadeBaixa), ganhou: false, contractType: 'DIGITUNDER', digitoSaida: 8 })
      passo(metadeBaixa)
      THE_PALM.aposResultado?.({ ...ctxDe(memoria, metadeBaixa), ganhou: true, contractType: 'DIGITUNDER', digitoSaida: 2 })
      passo(metadeBaixa); passo([...semNove, 9])
      return saida
    }
    conferir('B12.1 Palm: decisões idênticas com e sem telemetria (determinismo)', rodar(true), rodar(false))
    const memoria: Record<string, unknown> = {}
    conferir('B12.2 Palm: telemetria antes de tudo é virtual', THE_PALM.telemetria!(ctxDe(memoria, semNove)).virtual, true)
    conferir('B12.3 Palm: decisão original intacta (arma na base real)', THE_PALM.entrar(ctxDe(memoria, [...semNove, 9])), true)
    const t1 = THE_PALM.telemetria!(ctxDe(memoria, [...semNove, 9]))
    conferir('B12.4 Palm: fase base-real, vinda de aquecendo, com motivo', [t1.fase, t1.anterior, Boolean(t1.motivo), t1.barreira, t1.virtual], ['base-real', 'aquecendo', true, 9, false])
    THE_PALM.aposResultado?.({ ...ctxDe(memoria, metadeBaixa), ganhou: false, contractType: 'DIGITUNDER', digitoSaida: 8 })
    const t2 = THE_PALM.telemetria!(ctxDe(memoria, metadeBaixa))
    conferir('B12.5 Palm: troca para recuperação Under 5 com estratégia anterior e motivo', [t2.fase, t2.anterior, t2.barreira, t2.detalhes.estrategiaAtual, t2.detalhes.estrategiaAnterior, t2.detalhes.baixos], ['recuperacao-real', 'base-real', 5, 'Under 5', 'Under 9', 48])
    conferir('B12.6 Palm: contrato real segue Under 5 (decisão intacta)', THE_PALM.contrato?.(ctxDe(memoria, metadeBaixa)).barreira, 5)
    conferir('B12.7 Palm: telemetria chamada duas vezes seguidas devolve o mesmo (pura)', THE_PALM.telemetria!(ctxDe(memoria, metadeBaixa)), THE_PALM.telemetria!(ctxDe(memoria, metadeBaixa)))
    // telemetria que lança não derruba o motor: o estado sai com estrategia null e o robô segue
    const explosiva: Estrategia = { ...THE_PALM, id: 'explosiva', telemetria: () => { throw new Error('boom') } }
    const socketFalso: any = { status: 'open', onStatus: () => () => {}, send: () => {}, subscribe: () => () => {}, request: async () => ({}), reconectarAgora: () => {}, disconnect: () => {} }
    let estadoVisto: EstadoMotor | null = null
    let lancou = false
    try {
      const motor = new MotorTeeds({ socket: socketFalso, symbol: '1HZ75V', estrategia: explosiva, config: CONFIG, moeda: 'USD', contaId: 'CR1', demo: true } as any)
      motor.escutar((e) => { estadoVisto = e })
      ;(motor as any).estado.estrategia = (motor as any).telemetriaSegura((motor as any).contexto)
      ;(motor as any).emitir()
    } catch { lancou = true }
    conferir('B12.8 telemetria que lança não derruba o motor: estrategia fica null, sem exceção', [lancou, estadoVisto ? (estadoVisto as EstadoMotor).estrategia : 'sem estado'], [false, null])
  }

  /* ---------------------------------------------------- máscaras */
  conferir('e-mail mascarado', mascararEmail('arthur.lessa@gmail.com'), 'ar••••••@gmail.com')
  conferir('conta mascarada', mascararConta('CR1234567'), 'CR•••4567')
}

provas().then(() => {
  console.log(`\n${certos} certos, ${errados} errados`)
  process.exit(errados ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(1) })
