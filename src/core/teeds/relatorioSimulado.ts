/**
 * Relatório simulado (06/11/2026, Tiago: "estou gravando as aulas e preciso
 * mostrar vários cenários de relatório: quem respeitou o gerenciamento, quem
 * não respeitou, os erros que não pode cometer").
 *
 * Só para administradores da marca. O admin preenche um cenário (o resultado
 * de cada I.A., como o resultado andou, algumas operações específicas) e a
 * aba Relatórios mostra exatamente aquilo, com os mesmos cartões e gráficos.
 *
 * Tudo acontece neste navegador: as operações são inventadas aqui e as contas
 * do relatório (o que o banco faz no teeds_meu_relatorio_v2) são refeitas
 * aqui. Nada é gravado, nada vai para o banco, nada entra nos 10%.
 */
import type { Filtros, RelatorioCompleto } from './relatorios'

export type Forma = 'constante' | 'meta' | 'stop' | 'devolveu' | 'insistiu'
export const FORMAS: Array<{ id: Forma; nome: string; descricao: string }> = [
  { id: 'meta', nome: 'Bateu a meta e parou', descricao: 'Poucas operações no começo do dia, termina num ganho' },
  { id: 'stop', nome: 'Bateu o stop e parou', descricao: 'As perdas vêm no fim e o dia para ali' },
  { id: 'constante', nome: 'Ritmo constante', descricao: 'Ganhos e perdas espalhados ao longo do dia' },
  { id: 'devolveu', nome: 'Subiu e devolveu', descricao: 'Chega a ganhar bem, não para e devolve com entradas maiores' },
  { id: 'insistiu', nome: 'Insistiu na perda', descricao: 'Segue operando até a noite, dobrando a entrada depois de cada perda' },
]

export interface IaDoSimulador { id: string; nome: string; origem: 'ia' | 'manual'; ativo: string; tipo: string }
/** As I.A. da GlobalFly, com o código que acha o logotipo (NomeDoRobo). */
export const IAS_DO_SIMULADOR: IaDoSimulador[] = [
  { id: 'goreme', nome: 'GF Raptor', origem: 'ia', ativo: 'R_75', tipo: 'DIGITOVER' },
  { id: 'falcon', nome: 'GF Falcon', origem: 'ia', ativo: 'R_100', tipo: 'DIGITUNDER' },
  { id: 'legacy', nome: 'GF Legacy', origem: 'ia', ativo: '1HZ100V', tipo: 'DIGITOVER' },
  { id: 'superior5', nome: 'GF Gulf', origem: 'ia', ativo: 'R_50', tipo: 'DIGITOVER' },
  { id: 'ag2', nome: 'GF Phenom', origem: 'ia', ativo: '1HZ75V', tipo: 'DIGITUNDER' },
  { id: 'manual', nome: 'Manual', origem: 'manual', ativo: 'R_100', tipo: 'CALL' },
]
export const iaDoSimulador = (id: string) => IAS_DO_SIMULADOR.find((x) => x.id === id) ?? IAS_DO_SIMULADOR[0]

export interface LinhaDeIa { ia: string; operacoes: number; acerto: number; resultado: number; entrada: number }
export interface OperacaoAvulsa { dia: number; hora: string; ia: string; entrada: number; resultado: number }
export interface Cenario {
  nome: string
  /** 1 = só hoje; 7 e 30 terminam hoje. */
  dias: 1 | 7 | 30
  forma: Forma
  ias: LinhaDeIa[]
  /** Operações escritas uma a uma; contam dentro do total da I.A. escolhida. */
  avulsas: OperacaoAvulsa[]
  saldo: number
  depositos: number
  saques: number
}

export const CENARIOS_PRONTOS: Array<{ id: string; tom: 'sobe' | 'cai' | 'neutro'; cenario: Cenario }> = [
  { id: 'respeitou', tom: 'sobe', cenario: {
    nome: 'Respeitou o gerenciamento', dias: 30, forma: 'constante', saldo: 1284.6, depositos: 1000, saques: 150,
    ias: [{ ia: 'goreme', operacoes: 420, acerto: 63, resultado: 96.8, entrada: 1 }, { ia: 'falcon', operacoes: 260, acerto: 61, resultado: 50.1, entrada: 1 }],
    avulsas: [] } },
  { id: 'meta', tom: 'sobe', cenario: {
    nome: 'Dia de meta', dias: 1, forma: 'meta', saldo: 1011, depositos: 0, saques: 0,
    ias: [{ ia: 'goreme', operacoes: 18, acerto: 72, resultado: 7.4, entrada: 1 }, { ia: 'falcon', operacoes: 12, acerto: 67, resultado: 3.6, entrada: 1 }],
    avulsas: [] } },
  { id: 'stop', tom: 'neutro', cenario: {
    nome: 'Dia de stop, respeitado', dias: 1, forma: 'stop', saldo: 993.5, depositos: 0, saques: 0,
    ias: [{ ia: 'goreme', operacoes: 16, acerto: 38, resultado: -4.3, entrada: 1 }, { ia: 'falcon', operacoes: 10, acerto: 40, resultado: -2.2, entrada: 1 }],
    avulsas: [] } },
  { id: 'nao-respeitou', tom: 'cai', cenario: {
    nome: 'Não respeitou o gerenciamento', dias: 1, forma: 'insistiu', saldo: 812.4, depositos: 0, saques: 0,
    ias: [{ ia: 'goreme', operacoes: 64, acerto: 52, resultado: -118.6, entrada: 1 }, { ia: 'falcon', operacoes: 38, acerto: 50, resultado: -54.2, entrada: 1 }, { ia: 'manual', operacoes: 6, acerto: 33, resultado: -15, entrada: 5 }],
    avulsas: [{ dia: 0, hora: '13:47', ia: 'manual', entrada: 20, resultado: -20 }] } },
  { id: 'devolveu', tom: 'cai', cenario: {
    nome: 'Bateu a meta e devolveu', dias: 1, forma: 'devolveu', saldo: 955.2, depositos: 0, saques: 0,
    ias: [{ ia: 'goreme', operacoes: 58, acerto: 57, resultado: -31.6, entrada: 1 }, { ia: 'falcon', operacoes: 30, acerto: 53, resultado: -13.2, entrada: 1 }],
    avulsas: [] } },
]
export const CENARIO_EM_BRANCO: Cenario = { nome: 'Meu cenário', dias: 1, forma: 'constante', saldo: 1000, depositos: 0, saques: 0, ias: [{ ia: 'goreme', operacoes: 20, acerto: 60, resultado: 5, entrada: 1 }], avulsas: [] }

/* ------------------------------------------------------------ operações */

export type OperacaoSimulada = RelatorioCompleto['ultimas'][number]

const r2 = (x: number) => Math.round(x * 100) / 100
const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Sorteio repetível: o mesmo cenário desenha sempre a mesma tela (a aula pode ser regravada). */
function sorteio(semente: number) {
  let s = semente >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function sementeDe(texto: string) { let h = 2166136261; for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619); return h >>> 0 }

/** `w` ganhos espalhados em `n` posições (com um tremor para não ficar desenhado). */
function espalhar(n: number, w: number, rnd: () => number): boolean[] {
  const s = Array<boolean>(n).fill(false)
  for (let j = 0; j < w; j++) s[Math.min(n - 1, Math.floor(((j + 0.5) * n) / w))] = true
  for (let i = 0; i < n - 1; i++) if (rnd() < 0.35) [s[i], s[i + 1]] = [s[i + 1], s[i]]
  return s
}
/** Perdas em sequências de 2 a 4 (quem insiste costuma perder em série). */
function emSequencias(n: number, w: number, rnd: () => number): boolean[] {
  const l = n - w, perdas: number[] = []
  for (let resto = l; resto > 0;) { const k = Math.min(resto, 2 + Math.floor(rnd() * 3)); perdas.push(k); resto -= k }
  const blocos = perdas.length + 1, ganhos = Array<number>(blocos).fill(0)
  for (let j = 0; j < w; j++) ganhos[Math.floor(rnd() * blocos)]++
  const s: boolean[] = []
  for (let b = 0; b < blocos; b++) { for (let j = 0; j < ganhos[b]; j++) s.push(true); if (b < perdas.length) for (let j = 0; j < perdas[b]; j++) s.push(false) }
  return s
}

function sequencia(forma: Forma, n: number, w: number, rnd: () => number): boolean[] {
  const l = n - w
  if (forma === 'insistiu') return emSequencias(n, w, rnd)
  if (forma === 'stop') {
    // termina numa sequência de perdas: foi ali que o stop bateu
    const fim = Math.min(l, 3)
    return [...espalhar(n - fim, w, rnd), ...Array<boolean>(fim).fill(false)]
  }
  if (forma === 'devolveu') {
    const corte = Math.round(n * 0.5)
    const antes = Math.max(w - (n - corte), Math.min(w, corte, Math.round(corte * 0.82)))
    return [...espalhar(corte, antes, rnd), ...emSequencias(n - corte, w - antes, rnd)]
  }
  if (forma === 'constante') {
    // embaralhado de verdade: num mês aparecem dias de stop, como na vida real
    const s = Array.from({ length: n }, (_, i) => i < w)
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [s[i], s[j]] = [s[j], s[i]] }
    return s
  }
  const s = espalhar(n, w, rnd)
  if (forma === 'meta' && w > 0 && !s[n - 1]) { const k = s.lastIndexOf(true); s[k] = false; s[n - 1] = true }
  return s
}

/** A janela do dia (em horas) de cada forma: quem insiste opera até a noite. */
const JANELA: Record<Forma, [number, number]> = { meta: [9, 10.4], stop: [9, 11], constante: [9, 18], devolveu: [9, 20], insistiu: [9, 23.6] }

/**
 * As operações do cenário. O total de cada I.A. (operações, acerto e
 * resultado) fecha exatamente com o que foi preenchido, centavo por centavo.
 */
export function operacoesDoCenario(c: Cenario, agora = new Date()): OperacaoSimulada[] {
  const rnd = sorteio(sementeDe(JSON.stringify(c)))
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const agoraH = (agora.getTime() - hoje.getTime()) / 36e5
  const [ini, fim] = JANELA[c.forma]
  const ops: Array<OperacaoSimulada & { pos?: number }> = []

  c.ias.forEach((linha, k) => {
    const ia = iaDoSimulador(linha.ia)
    const avulsas = c.avulsas.filter((a) => a.ia === linha.ia)
    const base = Math.max(0.35, linha.entrada || 1)
    const n = Math.max(0, Math.round(linha.operacoes) - avulsas.length)
    const totalW = Math.round((Math.round(linha.operacoes) * Math.min(100, Math.max(0, linha.acerto))) / 100)
    const w = Math.min(n, Math.max(0, totalW - avulsas.filter((a) => a.resultado > 0).length))
    let R = r2(linha.resultado - avulsas.reduce((s, a) => s + a.resultado, 0))
    if (!n) return
    const seq = sequencia(c.forma, n, w, rnd)
    // a entrada: fixa para quem respeita; dobra depois de cada perda para quem não respeita
    const dobra = c.forma === 'insistiu' || c.forma === 'devolveu'
    const desde = c.forma === 'devolveu' ? Math.round(n * 0.5) : 0
    let serie = 0
    const entradas = seq.map((ganhou, i) => {
      const e = dobra && i >= desde ? base * 2 ** Math.min(serie, 3) : base
      serie = ganhou ? 0 : serie + 1
      return e
    })
    const somaG = seq.reduce((s, g, i) => s + (g ? entradas[i] : 0), 0)
    let somaP = seq.reduce((s, g, i) => s + (g ? 0 : entradas[i]), 0)
    let q = 0.95
    if (!w) {
      // só perdas: o resultado decide o tamanho delas
      if (R < 0) { const f = -R / somaP; for (let i = 0; i < n; i++) entradas[i] *= f } else R = r2(-somaP)
    } else if (!somaP) {
      q = Math.max(0.05, R / somaG)
    } else {
      q = (R + somaP) / somaG
      // quem respeita mantém a entrada (o retorno se ajusta); quem dobra perde com entradas maiores
      if (q < (dobra ? 0.35 : 0.08)) {
        // perdeu mais do que as entradas explicam: as perdas foram com entrada maior
        q = 0.95; const f = (somaG * q - R) / somaP
        seq.forEach((g, i) => { if (!g) entradas[i] *= f }); somaP *= f
      } else if (q > 1.6) {
        q = 0.95; const f = (R + somaP) / (somaG * q)
        seq.forEach((g, i) => { if (g) entradas[i] *= f })
      }
    }
    const linhaOps = seq.map((ganhou, i) => {
      const entrada = r2(entradas[i])
      const resultado = ganhou ? r2(entrada * q) : -entrada
      return { ganhou, entrada, resultado }
    })
    // o centavo que sobra do arredondamento vai na última operação
    const sobra = r2(R - linhaOps.reduce((s, o) => s + o.resultado, 0))
    if (sobra) {
      const k2 = linhaOps.map((o) => o.ganhou).lastIndexOf(true)
      if (k2 >= 0) linhaOps[k2].resultado = r2(linhaOps[k2].resultado + sobra)
      else { const u = linhaOps[n - 1]; u.entrada = r2(u.entrada - sobra); u.resultado = -u.entrada }
    }
    linhaOps.forEach((o, i) => ops.push({
      quando: '', pos: (i + 0.5 + (rnd() - 0.5) * 0.6) / n + k * 1e-6, origem: ia.origem, id: ia.id, nome: ia.nome, ativo: ia.ativo, tipo: ia.tipo,
      entrada: o.entrada, pagamento: o.ganhou ? r2(o.entrada + o.resultado) : 0, resultado: o.resultado, ganhou: o.ganhou,
    }))
  })

  // o horário: a posição na sequência vira dia e hora dentro da janela
  const quandoDe = (diaAtras: number, horas: number) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diaAtras)
    return new Date(d.getTime() + Math.max(0, Math.min(23.99, horas)) * 36e5 + Math.floor(rnd() * 50) * 1000)
  }
  ops.sort((a, b) => (a.pos ?? 0) - (b.pos ?? 0))
  ops.forEach((o) => {
    const p = Math.min(0.9999, Math.max(0, o.pos ?? 0)) * c.dias
    const diaAtras = c.dias - 1 - Math.floor(p)
    let [a, b] = [ini, fim]
    // hoje o dia ainda não acabou: a janela termina agora
    if (diaAtras === 0 && b > agoraH) { b = Math.max(0.3, agoraH - 0.05); a = Math.min(a, Math.max(0, b - 1)) }
    o.quando = quandoDe(diaAtras, a + (p - Math.floor(p)) * (b - a)).toISOString()
    delete o.pos
  })
  for (const av of c.avulsas) {
    if (!c.ias.some((l) => l.ia === av.ia)) continue
    const ia = iaDoSimulador(av.ia)
    const [h, m] = (av.hora || '12:00').split(':').map(Number)
    const entrada = r2(Math.abs(av.entrada || 1)), resultado = r2(av.resultado)
    ops.push({
      quando: quandoDe(Math.min(c.dias - 1, Math.max(0, av.dia)), (h || 0) + (m || 0) / 60).toISOString(), origem: ia.origem, id: ia.id, nome: ia.nome, ativo: ia.ativo, tipo: ia.tipo,
      entrada, pagamento: resultado > 0 ? r2(entrada + resultado) : 0, resultado, ganhou: resultado > 0,
    })
  }
  return ops.sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
}

/* -------------------------------------------- as contas do relatório */

const passa = (o: OperacaoSimulada, f: Filtros) => {
  const d = new Date(o.quando), h = d.getHours()
  if (f.resultado && (f.resultado === 'ganhas') !== o.ganhou) return false
  if (f.estrategias?.length && !f.estrategias.includes(o.id)) return false
  if (f.ativos?.length && !f.ativos.includes(o.ativo)) return false
  if (f.tipos?.length && !f.tipos.includes(o.tipo)) return false
  if (f.dias?.length && !f.dias.includes(d.getDay())) return false
  if (f.horaDe != null || f.horaAte != null) {
    const de = f.horaDe ?? 0, ate = f.horaAte ?? 23
    if (de <= ate ? h < de || h > ate : h < de && h > ate) return false
  }
  if (f.entradaMin != null && o.entrada < f.entradaMin) return false
  if (f.entradaMax != null && o.entrada > f.entradaMax) return false
  return true
}

function agrupar<K extends string | number>(ops: OperacaoSimulada[], chave: (o: OperacaoSimulada) => K) {
  const m = new Map<K, { operacoes: number; ganhas: number; resultado: number; entradas: number; ex: OperacaoSimulada }>()
  for (const o of ops) {
    const k = chave(o), g = m.get(k) ?? { operacoes: 0, ganhas: 0, resultado: 0, entradas: 0, ex: o }
    g.operacoes++; g.ganhas += o.ganhou ? 1 : 0; g.resultado += o.resultado; g.entradas += o.entrada
    m.set(k, g)
  }
  return [...m.entries()].map(([k, g]) => ({ k, ex: g.ex, operacoes: g.operacoes, ganhas: g.ganhas, resultado: r2(g.resultado), entradas: r2(g.entradas) }))
}

/** O mesmo relatório que o banco devolve, feito com as operações simuladas. */
export function relatorioDoCenario(todas: OperacaoSimulada[], f: { de: string; ate: string; filtros: Filtros; limite?: number }, agora = new Date()): RelatorioCompleto {
  const dia = (o: OperacaoSimulada) => dataLocal(new Date(o.quando))
  const noPeriodo = todas.filter((o) => { const d = dia(o); return d >= f.de && d <= f.ate })
  const ops = noPeriodo.filter((o) => passa(o, f.filtros))
  const cron = ops.slice().sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando))

  let sg = 0, sp = 0, maxG = 0, maxP = 0, acum = 0, pico = 0, queda = 0, picoDaQueda = 0
  for (const o of cron) {
    if (o.ganhou) { sg++; sp = 0 } else { sp++; sg = 0 }
    maxG = Math.max(maxG, sg); maxP = Math.max(maxP, sp)
    acum += o.resultado; if (acum > pico) pico = acum
    if (pico - acum > queda) { queda = pico - acum; picoDaQueda = pico }
  }
  const soma = (l: OperacaoSimulada[], v: (o: OperacaoSimulada) => number) => r2(l.reduce((s, o) => s + v(o), 0))

  const [a, m, d] = f.de.split('-').map(Number)
  const largura = Math.round((Date.parse(`${f.ate}T12:00:00`) - Date.parse(`${f.de}T12:00:00`)) / 864e5) + 1
  const antDe = dataLocal(new Date(a, m - 1, d - largura)), antAte = dataLocal(new Date(a, m - 1, d - 1))
  const anterior = todas.filter((o) => { const x = dia(o); return x >= antDe && x <= antAte && passa(o, f.filtros) })
  const inicioMes = dataLocal(new Date(agora.getFullYear(), agora.getMonth(), 1))
  const doMes = todas.filter((o) => dia(o) >= inicioMes)

  const opcao = (l: ReturnType<typeof agrupar>, comNome: boolean) => l.sort((x, y) => y.operacoes - x.operacoes)
    .map((g) => ({ id: String(g.k), nome: comNome ? g.ex.nome : undefined, origem: comNome ? g.ex.origem : undefined, operacoes: g.operacoes }))
  const porOrdem = <T extends { operacoes: number }>(l: T[]) => l.sort((x, y) => y.operacoes - x.operacoes)

  return {
    de: f.de, ate: f.ate,
    total: {
      operacoes: ops.length, ganhas: ops.filter((o) => o.ganhou).length, resultado: soma(ops, (o) => o.resultado), entradas: soma(ops, (o) => o.entrada),
      pagamentos: soma(ops, (o) => o.pagamento), maiorGanho: ops.length ? Math.max(...ops.map((o) => o.resultado)) : 0, maiorPerda: ops.length ? Math.min(...ops.map((o) => o.resultado)) : 0,
      primeira: cron[0]?.quando ?? null, ultima: cron[cron.length - 1]?.quando ?? null,
      somaGanhos: soma(ops.filter((o) => o.resultado > 0), (o) => o.resultado), somaPerdas: soma(ops.filter((o) => o.resultado < 0), (o) => o.resultado),
    },
    anterior: { de: antDe, ate: antAte, operacoes: anterior.length, ganhas: anterior.filter((o) => o.ganhou).length, entradas: soma(anterior, (o) => o.entrada), resultado: soma(anterior, (o) => o.resultado) },
    sequencias: { ganhos: maxG, perdas: maxP },
    queda: { maior: r2(queda), pico: r2(picoDaQueda) },
    porDia: agrupar(ops, dia).sort((x, y) => (x.k < y.k ? -1 : 1)).map((g) => ({ dia: g.k, operacoes: g.operacoes, ganhas: g.ganhas, resultado: g.resultado, entradas: g.entradas })),
    porOrigem: porOrdem(agrupar(ops, (o) => o.id).map((g) => ({ origem: g.ex.origem, id: g.ex.id, nome: g.ex.nome, operacoes: g.operacoes, ganhas: g.ganhas, resultado: g.resultado, entradas: g.entradas }))),
    porAtivo: porOrdem(agrupar(ops, (o) => o.ativo).map((g) => ({ ativo: g.k, operacoes: g.operacoes, ganhas: g.ganhas, resultado: g.resultado, entradas: g.entradas }))),
    porTipo: porOrdem(agrupar(ops, (o) => o.tipo).map((g) => ({ tipo: g.k, operacoes: g.operacoes, ganhas: g.ganhas, resultado: g.resultado, entradas: g.entradas }))),
    porHora: agrupar(ops, (o) => new Date(o.quando).getHours()).sort((x, y) => x.k - y.k).map((g) => ({ hora: g.k, operacoes: g.operacoes, ganhas: g.ganhas, resultado: g.resultado, entradas: g.entradas })),
    porDiaSemana: agrupar(ops, (o) => new Date(o.quando).getDay()).map((g) => ({ dow: g.k, operacoes: g.operacoes, ganhas: g.ganhas, resultado: g.resultado, entradas: g.entradas })),
    contagem: ops.length,
    ultimas: ops.slice(0, f.limite ?? 500),
    opcoes: {
      estrategias: opcao(agrupar(noPeriodo, (o) => o.id), true), ativos: opcao(agrupar(noPeriodo, (o) => o.ativo), false), tipos: opcao(agrupar(noPeriodo, (o) => o.tipo), false),
      entradaMax: noPeriodo.length ? Math.max(...noPeriodo.map((o) => o.entrada)) : 0,
    },
    mes: { inicio: inicioMes, resultado: soma(doMes, (o) => o.resultado), operacoes: doMes.length },
  }
}

/** Depósitos e saques do cenário, no formato do extrato da corretora. */
export function dinheiroDoCenario(c: Cenario, agora = new Date()) {
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - (c.dias - 1), 8, 40).getTime() / 1000
  const movimentos: Array<{ tipo: 'deposit' | 'withdrawal'; valor: number; quando: number }> = []
  if (c.depositos > 0) movimentos.push({ tipo: 'deposit', valor: r2(c.depositos), quando: inicio })
  if (c.saques > 0) movimentos.push({ tipo: 'withdrawal', valor: r2(c.saques), quando: Math.min(agora.getTime() / 1000 - 600, inicio + (c.dias - 0.5) * 86400) })
  return { depositos: r2(Math.max(0, c.depositos)), saques: r2(Math.max(0, c.saques)), movimentos: movimentos.sort((x, y) => y.quando - x.quando) }
}

/* --------------------------------------- o cenário guardado no aparelho */

export function lerCenario(chave: string): Cenario | null {
  try {
    const c = JSON.parse(localStorage.getItem(chave) || 'null') as Cenario | null
    if (c && Array.isArray(c.ias) && [1, 7, 30].includes(c.dias) && FORMAS.some((x) => x.id === c.forma)) return { ...c, avulsas: Array.isArray(c.avulsas) ? c.avulsas : [] }
  } catch { /* sem armazenamento */ }
  return null
}
