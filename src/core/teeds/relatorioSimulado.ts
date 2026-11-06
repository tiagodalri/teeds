/**
 * Relatório simulado (06/11/2026, Tiago: "estou gravando as aulas e preciso
 * mostrar vários cenários de relatório: quem respeitou o gerenciamento, quem
 * não respeitou, os erros que não pode cometer").
 *
 * Só para administradores da marca. O admin responde, em passos, o que o
 * relatório tem que mostrar e a aba Relatórios mostra exatamente aquilo, com
 * os mesmos cartões e gráficos.
 *
 * 06/11/2026 (2), Tiago: "a experiência de preencher ainda está complicada...
 * primeiro tem que me perguntar de qual data; depois o resultado geral, a
 * quantidade de operações, a porcentagem de acerto; e as operações que
 * definiram o resultado: quantas perdas seguidas no máximo, a maior entrada,
 * o maior ganho". O cenário agora é feito dessas respostas, e o gerador monta
 * as operações que fecham com cada uma delas.
 *
 * Tudo acontece neste navegador: as operações são inventadas aqui e as contas
 * do relatório (o que o banco faz no teeds_meu_relatorio_v2) são refeitas
 * aqui. Nada é gravado, nada vai para o banco, nada entra nos 10%.
 */
import type { Filtros, RelatorioCompleto } from './relatorios'

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

export type PeriodoSimulado = { tipo: 'dia'; data: string } | { tipo: 'ultimos'; dias: 7 | 30 } | { tipo: 'intervalo'; de: string; ate: string }
export type Momento = 'comeco' | 'meio' | 'fim'
export interface LinhaDeIa { ia: string; operacoes: number; resultado: number }
export interface Cenario {
  versao: 2
  /** O nome que aparece na faixa do relatório simulado. */
  nome: string
  periodo: PeriodoSimulado
  /** O número grande do relatório, em dólar (negativo = perda). */
  resultado: number
  operacoes: number
  /** % de operações ganhas. */
  acerto: number
  ias: LinhaDeIa[]
  /** Divide operações e resultado entre as I.A. sozinho (proporcional). */
  dividirSozinho: boolean
  /** A entrada de sempre. */
  entrada: number
  /** A maior entrada do período (a exposição de risco); vem no fim da pior sequência. */
  maiorEntrada: number
  /** A maior sequência de perdas seguidas. */
  sequencia: number
  iaDaSequencia: string
  momento: Momento
  /** O maior ganho numa operação; null = o gerador escolhe. */
  maiorGanho: number | null
  /** O horário em que operou (até = a hora inteira, até :59). */
  horaDe: number
  horaAte: number
  saldo: number
  depositos: number
  saques: number
}

const r2 = (x: number) => Math.round(x * 100) / 100
const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const deData = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d) }
export const hojeIso = (agora = new Date()) => dataLocal(agora)

/** O intervalo de datas do cenário. */
export function faixaDoCenario(c: Cenario, agora = new Date()): { de: string; ate: string } {
  const p = c.periodo
  if (p.tipo === 'dia') return { de: p.data, ate: p.data }
  if (p.tipo === 'intervalo') return p.de <= p.ate ? { de: p.de, ate: p.ate } : { de: p.ate, ate: p.de }
  return { de: dataLocal(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - (p.dias - 1))), ate: dataLocal(agora) }
}
export const diasDoCenario = (c: Cenario, agora = new Date()) => {
  const { de, ate } = faixaDoCenario(c, agora)
  return Math.round((deData(ate).getTime() - deData(de).getTime()) / 864e5) + 1
}

/** Reparte `total` em partes inteiras proporcionais aos pesos (maior resto). */
function repartir(total: number, pesos: number[]): number[] {
  const soma = pesos.reduce((s, p) => s + p, 0) || 1
  const exatos = pesos.map((p) => (total * p) / soma)
  const partes = exatos.map(Math.floor)
  let falta = total - partes.reduce((s, x) => s + x, 0)
  exatos.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((a, b) => b.resto - a.resto).forEach(({ i }) => { if (falta > 0) { partes[i]++; falta-- } })
  return partes
}

/** As I.A. com operações e resultado (divididos sozinhos, se for o caso). */
export function iasDoCenario(c: Cenario): LinhaDeIa[] {
  if (!c.dividirSozinho || c.ias.length <= 1) {
    if (c.ias.length === 1) return [{ ia: c.ias[0].ia, operacoes: Math.round(c.operacoes), resultado: r2(c.resultado) }]
    return c.ias
  }
  const ops = repartir(Math.round(c.operacoes), c.ias.map(() => 1))
  // a I.A. da pior sequência carrega o que as entradas maiores perderam; o resto é proporcional às operações
  const S = Math.max(0, Math.round(c.sequencia)), E = Math.max(0.35, c.entrada || 1), Emax = Math.max(E, c.maiorEntrada || E)
  let extra = 0
  if (S > 0 && Emax > E) for (let j = 0; j < S; j++) extra += (S === 1 ? Emax : E * (Emax / E) ** (j / (S - 1))) - E
  if (c.resultado >= 0 || extra > Math.abs(c.resultado)) extra = 0
  const k = Math.max(0, c.ias.findIndex((l) => l.ia === c.iaDaSequencia))
  const res = ops.map((o, i) => r2(((c.resultado + extra) * o) / Math.max(1, c.operacoes) - (i === k ? extra : 0)))
  res[res.length - 1] = r2(c.resultado - res.slice(0, -1).reduce((s, x) => s + x, 0))
  return c.ias.map((l, i) => ({ ia: l.ia, operacoes: ops[i], resultado: res[i] }))
}

/* ------------------------------------------------------- cenários prontos */

const base = (p: Partial<Cenario>): Cenario => ({
  versao: 2, nome: 'Meu cenário', periodo: { tipo: 'dia', data: hojeIso() }, resultado: 10, operacoes: 30, acerto: 63,
  ias: [{ ia: 'goreme', operacoes: 30, resultado: 10 }], dividirSozinho: true, entrada: 1, maiorEntrada: 1, sequencia: 3, iaDaSequencia: 'goreme', momento: 'meio',
  maiorGanho: null, horaDe: 9, horaAte: 17, saldo: 1000, depositos: 0, saques: 0, ...p,
})
export function cenariosProntos(): Array<{ id: string; tom: 'sobe' | 'cai' | 'neutro'; cenario: Cenario }> {
  const hoje = hojeIso()
  return [
    { id: 'respeitou', tom: 'sobe', cenario: base({
      nome: 'Respeitou o gerenciamento', periodo: { tipo: 'ultimos', dias: 30 }, resultado: 146.9, operacoes: 680, acerto: 62, horaDe: 9, horaAte: 17,
      ias: [{ ia: 'goreme', operacoes: 420, resultado: 96.8 }, { ia: 'falcon', operacoes: 260, resultado: 50.1 }], dividirSozinho: false,
      entrada: 1, maiorEntrada: 1, sequencia: 5, iaDaSequencia: 'falcon', momento: 'meio', saldo: 1284.6, depositos: 1000, saques: 150 }) },
    { id: 'meta', tom: 'sobe', cenario: base({
      nome: 'Dia de meta', periodo: { tipo: 'dia', data: hoje }, resultado: 11, operacoes: 30, acerto: 70, horaDe: 9, horaAte: 9,
      ias: [{ ia: 'goreme', operacoes: 18, resultado: 7.4 }, { ia: 'falcon', operacoes: 12, resultado: 3.6 }], dividirSozinho: false,
      entrada: 1, maiorEntrada: 1, sequencia: 2, iaDaSequencia: 'falcon', momento: 'meio', saldo: 1011 }) },
    { id: 'stop', tom: 'neutro', cenario: base({
      nome: 'Dia de stop, respeitado', periodo: { tipo: 'dia', data: hoje }, resultado: -6.5, operacoes: 26, acerto: 38, horaDe: 9, horaAte: 10,
      ias: [{ ia: 'goreme', operacoes: 16, resultado: -4.3 }, { ia: 'falcon', operacoes: 10, resultado: -2.2 }], dividirSozinho: false,
      entrada: 1, maiorEntrada: 1, sequencia: 4, iaDaSequencia: 'falcon', momento: 'fim', saldo: 993.5 }) },
    { id: 'nao-respeitou', tom: 'cai', cenario: base({
      nome: 'Não respeitou o gerenciamento', periodo: { tipo: 'dia', data: hoje }, resultado: -1000, operacoes: 120, acerto: 52, horaDe: 9, horaAte: 23,
      ias: [{ ia: 'goreme', operacoes: 80, resultado: -700 }, { ia: 'falcon', operacoes: 40, resultado: -300 }], dividirSozinho: false,
      entrada: 5, maiorEntrada: 320, sequencia: 7, iaDaSequencia: 'goreme', momento: 'fim', saldo: 812.4 }) },
    { id: 'devolveu', tom: 'cai', cenario: base({
      // sobe uns US$ 26 com entrada de 1 e devolve tudo numa sequência de 7 perdas dobrando até 64
      nome: 'Bateu a meta e devolveu', periodo: { tipo: 'dia', data: hoje }, resultado: -101, operacoes: 90, acerto: 62, horaDe: 9, horaAte: 19,
      ias: [{ ia: 'goreme', operacoes: 60, resultado: -108 }, { ia: 'falcon', operacoes: 30, resultado: 7 }], dividirSozinho: false,
      entrada: 1, maiorEntrada: 64, sequencia: 7, iaDaSequencia: 'goreme', momento: 'fim', saldo: 899 }) },
  ]
}
export const cenarioEmBranco = () => base({})

/* ------------------------------------------------------------ operações */

export type OperacaoSimulada = RelatorioCompleto['ultimas'][number]

/** Sorteio repetível: o mesmo cenário desenha sempre a mesma tela (a aula pode ser regravada). */
function sorteio(semente: number) {
  let s = semente >>> 0
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
function sementeDe(texto: string) { let h = 2166136261; for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619); return h >>> 0 }

/**
 * Um trecho da sequência com `perdas` perdas em séries de no máximo `teto`,
 * separadas por ganhos. `ganhoNoInicio`/`ganhoNoFim`: o trecho encosta na pior
 * sequência e precisa de um ganho ali, para não emendar com ela.
 */
function trecho(tam: number, perdas: number, teto: number, ganhoNoInicio: boolean, ganhoNoFim: boolean, rnd: () => number): boolean[] {
  if (tam <= 0) return []
  const ganhos = tam - perdas
  if (!perdas) return Array<boolean>(tam).fill(true)
  if (!ganhos) return Array<boolean>(tam).fill(false)
  const bordas = (ganhoNoInicio ? 1 : 0) + (ganhoNoFim ? 1 : 0)
  const minSeries = Math.ceil(perdas / Math.max(1, teto))
  const maxSeries = Math.max(1, Math.min(perdas, ganhos - bordas + 1))
  const series = Math.max(1, Math.min(maxSeries, Math.max(minSeries, Math.round(perdas / (1.5 + rnd() * 0.4)))))
  const tamanhos = Array<number>(series).fill(1)
  for (let resto = perdas - series, guarda = 0; resto > 0 && guarda < 1e5; guarda++) {
    const k = Math.floor(rnd() * series)
    if (tamanhos[k] < teto || tamanhos.every((t) => t >= teto)) { tamanhos[k]++; resto-- }
  }
  // os ganhos nos espaços: entre as séries pelo menos 1, e nas bordas pedidas
  const vaos = Array<number>(series + 1).fill(0)
  for (let k = 1; k < series; k++) vaos[k] = 1
  if (ganhoNoInicio) vaos[0] = 1
  if (ganhoNoFim) vaos[series] = 1
  let sobra = ganhos - vaos.reduce((s, x) => s + x, 0)
  while (sobra > 0) { vaos[Math.floor(rnd() * (series + 1))]++; sobra-- }
  const s: boolean[] = []
  for (let k = 0; k <= series; k++) { for (let j = 0; j < vaos[k]; j++) s.push(true); if (k < series) for (let j = 0; j < tamanhos[k]; j++) s.push(false) }
  return s
}

interface Rascunho { ia: number; dia: number; ganhou: boolean; entrada: number; resultado: number; fixo: boolean; daSequencia: boolean }

/**
 * As operações do cenário. Fecham com o que foi respondido: resultado e
 * operações (no total e de cada I.A.), acerto, maior sequência de perdas,
 * maior entrada e maior ganho. Quando uma resposta não combina com as outras
 * (ex.: perder muito com entrada pequena), a prévia do editor avisa.
 */
export function operacoesDoCenario(c: Cenario, agora = new Date()): OperacaoSimulada[] {
  const rnd = sorteio(sementeDe(JSON.stringify(c)))
  const ias = iasDoCenario(c).filter((l) => l.operacoes > 0)
  const N = ias.reduce((s, l) => s + Math.round(l.operacoes), 0)
  if (!N) return []
  const W = Math.min(N, Math.max(0, Math.round((N * Math.min(100, Math.max(0, c.acerto))) / 100)))
  const L = N - W
  const S = L ? Math.min(L, Math.max(1, Math.round(c.sequencia || 1))) : 0
  const E = Math.max(0.35, r2(c.entrada || 1))
  const Emax = Math.max(E, r2(c.maiorEntrada || E))

  // os dias e quantas operações em cada um
  const { de, ate } = faixaDoCenario(c, agora)
  const dias: Date[] = []
  for (let d = deData(de); dataLocal(d) <= ate && dias.length < 400; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) dias.push(d)
  const pesoDia = dias.map(() => (dias.length > 1 ? 0.55 + rnd() * 0.9 : 1))

  // a ordem do dia: cada I.A. opera num bloco; a da pior sequência fica no começo ou no fim, se for o caso
  let k = ias.findIndex((l) => l.ia === c.iaDaSequencia)
  if (k < 0) k = ias.reduce((m, l, i) => (l.resultado < ias[m].resultado ? i : m), 0)
  const ordem = ias.map((_, i) => i).filter((i) => i !== k)
  if (c.momento === 'comeco') ordem.unshift(k); else if (c.momento === 'fim') ordem.push(k); else ordem.splice(Math.floor(ordem.length / 2), 0, k)
  const porIaDia = ias.map((l) => repartir(Math.round(l.operacoes), pesoDia))
  const linha: Array<{ ia: number; dia: number }> = []
  dias.forEach((_, d) => { for (const i of ordem) for (let j = 0; j < porIaDia[i][d]; j++) linha.push({ ia: i, dia: d }) })

  // onde entra a pior sequência
  const daK = linha.map((x, p) => (x.ia === k ? p : -1)).filter((p) => p >= 0)
  let inicio = 0
  if (S) {
    if (c.momento === 'fim') inicio = daK.length ? daK[daK.length - 1] - S + 1 : N - S
    else if (c.momento === 'comeco') inicio = daK.length ? daK[0] + Math.min(2, Math.max(0, daK.length - S)) : 0
    else inicio = daK.length ? daK[Math.floor(daK.length / 2)] - Math.floor(S / 2) : Math.floor((N - S) / 2)
    inicio = Math.max(0, Math.min(N - S, inicio))
  }

  // ganhos e perdas: antes da sequência, a sequência, depois dela
  const resto = L - S, antesTam = inicio, depoisTam = N - inicio - S
  let antesP = antesTam + depoisTam ? Math.round((resto * antesTam) / (antesTam + depoisTam)) : 0
  antesP = Math.min(antesP, Math.max(0, antesTam - 1), resto); antesP = Math.max(antesP, resto - Math.max(0, depoisTam - 1), 0)
  const depoisP = resto - antesP
  const teto = Math.max(1, S)
  const seq: boolean[] = [
    ...trecho(antesTam, antesP, teto, false, S > 0, rnd),
    ...Array<boolean>(S).fill(false),
    ...trecho(depoisTam, depoisP, teto, S > 0, false, rnd),
  ]

  // cada I.A. com o acerto do total: troca um ganho de quem tem demais por uma perda de quem tem de menos,
  // sem mexer na pior sequência e sem criar outra maior que ela
  if (ias.length > 1 && S) {
    const alvo = repartir(W, ias.map((l) => l.operacoes))
    const fora = (p: number) => p >= inicio && p < inicio + S
    const maiorSerie = () => { let m = 0, a = 0; for (const g of seq) { a = g ? 0 : a + 1; if (a > m) m = a } return m }
    for (let volta = 0; volta < 4 * N; volta++) {
      const tem = ias.map(() => 0); seq.forEach((g, p) => { if (g) tem[linha[p].ia]++ })
      const sobra = tem.findIndex((t, i) => t > alvo[i]), falta = tem.findIndex((t, i) => t < alvo[i])
      if (sobra < 0 || falta < 0) break
      const ganhos = linha.map((x, p) => (x.ia === sobra && seq[p] && !fora(p) ? p : -1)).filter((p) => p >= 0)
      const perdas = linha.map((x, p) => (x.ia === falta && !seq[p] && !fora(p) ? p : -1)).filter((p) => p >= 0)
      let trocou = false
      for (let t = 0; t < 12 && !trocou && ganhos.length && perdas.length; t++) {
        const g = ganhos[Math.floor(rnd() * ganhos.length)], l2 = perdas[Math.floor(rnd() * perdas.length)]
        seq[g] = false; seq[l2] = true
        if (maiorSerie() <= S) trocou = true; else { seq[g] = true; seq[l2] = false }
      }
      if (!trocou) break
    }
  }

  // entradas: a de sempre; na pior sequência ela sobe até a maior entrada
  const ops: Rascunho[] = linha.map((x, p) => {
    const naSeq = S > 0 && p >= inicio && p < inicio + S
    const j = p - inicio
    const entrada = naSeq && Emax > E ? (S === 1 ? Emax : E * (Emax / E) ** (j / (S - 1))) : E
    return { ia: x.ia, dia: x.dia, ganhou: seq[p] ?? true, entrada, resultado: 0, fixo: false, daSequencia: naSeq }
  })

  // o maior ganho: uma operação da I.A. que mais ganhou
  if (c.maiorGanho && c.maiorGanho > 0) {
    const melhor = ias.reduce((m, l, i) => (l.resultado / l.operacoes > ias[m].resultado / ias[m].operacoes ? i : m), 0)
    const cands = ops.map((o, p) => (o.ia === melhor && o.ganhou && !o.daSequencia ? p : -1)).filter((p) => p >= 0)
    if (cands.length) {
      const o = ops[cands[Math.floor(cands.length * 0.6)]]
      o.entrada = Math.min(Emax, Math.max(E, c.maiorGanho / 0.95)); o.resultado = r2(c.maiorGanho); o.fixo = true
    }
  }

  // o retorno de cada I.A. fecha o resultado dela; se não der com as entradas, as entradas sobem (até a maior)
  ias.forEach((l, i) => {
    const R = r2(l.resultado)
    const minhas = ops.filter((o) => o.ia === i)
    const perdas = minhas.filter((o) => !o.ganhou), livres = minhas.filter((o) => o.ganhou && !o.fixo)
    const fixos = minhas.filter((o) => o.fixo).reduce((s, o) => s + o.resultado, 0)
    const somaP = () => perdas.reduce((s, o) => s + o.entrada, 0)
    const somaG = () => livres.reduce((s, o) => s + o.entrada, 0)
    const subir = (l2: Rascunho[], falta: number) => {
      const folga = l2.filter((o) => !o.daSequencia).reduce((s, o) => s + (Emax - o.entrada), 0)
      if (folga <= 0 || falta <= 0) return falta
      const f = Math.min(1, falta / folga)
      for (const o of l2) if (!o.daSequencia) o.entrada += (Emax - o.entrada) * f
      return falta - folga * f
    }
    if (!livres.length) {
      // sem ganhos livres: as perdas pagam o resultado
      const falta = -(R - fixos) - somaP()
      if (falta > 0 && perdas.length) { const sobra = subir(perdas, falta); if (sobra > 0.005) { const f = (somaP() + sobra) / somaP(); perdas.forEach((o) => { o.entrada *= f }) } }
    } else {
      let q = (R + somaP() - fixos) / somaG()
      if (q < 0.1 && perdas.length) {
        subir(perdas, 0.9 * somaG() + fixos - R - somaP())
        q = (R + somaP() - fixos) / somaG()
        if (q < 0.05) { const f = (0.9 * somaG() + fixos - R) / somaP(); perdas.forEach((o) => { o.entrada *= f }); q = (R + somaP() - fixos) / somaG() }
      } else if (q > 2) {
        subir(livres, (R + somaP() - fixos) / 0.95 - somaG())
        q = (R + somaP() - fixos) / somaG()
      }
      for (const o of livres) { o.entrada = r2(o.entrada); o.resultado = r2(o.entrada * q) }
    }
    for (const o of perdas) { o.entrada = r2(o.entrada); o.resultado = -o.entrada }
    for (const o of minhas) if (o.ganhou && o.fixo) o.entrada = r2(o.entrada)
    // os centavos do arredondamento: um centavo em cada ganho, sem inflar nenhum
    let centavos = Math.round((R - minhas.reduce((s, o) => s + o.resultado, 0)) * 100)
    for (let j = 0; livres.length && centavos !== 0 && j < 100000; j++) {
      const o = livres[j % livres.length], passo = centavos > 0 ? 1 : -1
      if (passo < 0 && o.resultado <= 0.02) continue
      o.resultado = r2(o.resultado + passo / 100); centavos -= passo
    }
    const sobra = r2(R - minhas.reduce((s, o) => s + o.resultado, 0))
    if (sobra) {
      const alvo = livres.length ? livres[livres.length - 1] : perdas.filter((o) => !o.daSequencia).pop() ?? perdas[perdas.length - 1]
      if (alvo?.ganhou) alvo.resultado = r2(alvo.resultado + sobra)
      else if (alvo) { alvo.entrada = r2(alvo.entrada - sobra); alvo.resultado = -alvo.entrada }
    }
  })

  // o horário: as operações de cada dia, em ordem, dentro do horário escolhido
  const hojeIsoStr = dataLocal(agora)
  const agoraH = agora.getHours() + agora.getMinutes() / 60
  const porDia = new Map<number, Rascunho[]>()
  ops.forEach((o) => { const l2 = porDia.get(o.dia) ?? []; l2.push(o); porDia.set(o.dia, l2) })
  const saida: OperacaoSimulada[] = []
  porDia.forEach((l2, d) => {
    let a = Math.max(0, Math.min(23, c.horaDe)), b = Math.max(a, Math.min(23, c.horaAte)) + 0.98
    if (dataLocal(dias[d]) === hojeIsoStr && b > agoraH) { b = Math.max(0.3, agoraH - 0.05); a = Math.min(a, Math.max(0, b - 1)) }
    l2.forEach((o, j) => {
      const h = a + ((j + 0.5) / l2.length) * (b - a)
      const quando = new Date(dias[d].getTime() + h * 36e5 + Math.floor(rnd() * 20) * 1000)
      const ia = iaDoSimulador(ias[o.ia].ia)
      saida.push({ quando: quando.toISOString(), origem: ia.origem, id: ia.id, nome: ia.nome, ativo: ia.ativo, tipo: ia.tipo, entrada: o.entrada, pagamento: o.ganhou ? r2(o.entrada + o.resultado) : 0, resultado: o.resultado, ganhou: o.ganhou })
    })
  })
  return saida.sort((x, y) => Date.parse(y.quando) - Date.parse(x.quando))
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
  const { de, ate } = faixaDoCenario(c, agora)
  const inicio = new Date(deData(de).getTime() + 8.6 * 36e5).getTime() / 1000
  const fim = Math.min(agora.getTime() / 1000 - 600, deData(ate).getTime() / 1000 + 20 * 3600)
  const movimentos: Array<{ tipo: 'deposit' | 'withdrawal'; valor: number; quando: number }> = []
  if (c.depositos > 0) movimentos.push({ tipo: 'deposit', valor: r2(c.depositos), quando: inicio })
  if (c.saques > 0) movimentos.push({ tipo: 'withdrawal', valor: r2(c.saques), quando: Math.max(inicio + 60, fim) })
  return { depositos: r2(Math.max(0, c.depositos)), saques: r2(Math.max(0, c.saques)), movimentos: movimentos.sort((x, y) => y.quando - x.quando) }
}

/* ------------------------------------------- a prévia do que vai aparecer */

export interface Previa {
  resultado: number; operacoes: number; ganhas: number; maiorEntrada: number; maiorGanho: number; maiorPerda: number; sequencia: number
  /** Quanto cada ganho rendeu, em média, sobre a entrada (0,95 = 95%). */
  retorno: number
  avisos: string[]
}
/** Os números que o relatório vai mostrar, e onde eles não batem com as respostas. */
export function previaDoCenario(c: Cenario, agora = new Date()): Previa {
  const ops = operacoesDoCenario(c, agora)
  const r = relatorioDoCenario(ops, { ...faixaDoCenario(c, agora), filtros: {} }, agora)
  const ganhos = ops.filter((o) => o.ganhou && o.entrada > 0)
  const retorno = ganhos.length ? ganhos.reduce((s, o) => s + o.resultado / o.entrada, 0) / ganhos.length : 0
  const p: Previa = { resultado: r.total.resultado, operacoes: r.total.operacoes, ganhas: r.total.ganhas, maiorEntrada: r.opcoes.entradaMax, maiorGanho: r.total.maiorGanho, maiorPerda: r.total.maiorPerda, sequencia: r.sequencias.perdas, retorno, avisos: [] }
  const dinheiro = (x: number) => `US$ ${x.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (p.maiorEntrada > Math.max(c.entrada, c.maiorEntrada) + 0.01) p.avisos.push(`Para chegar nesse resultado as entradas precisaram passar da maior entrada: foram até ${dinheiro(p.maiorEntrada)}. Aumente a maior entrada ou o número de operações.`)
  if (c.maiorGanho && Math.abs(p.maiorGanho - c.maiorGanho) > 0.01) p.avisos.push(`O maior ganho ficou em ${dinheiro(p.maiorGanho)}, porque os outros ganhos precisaram ser maiores para fechar o resultado.`)
  if (p.operacoes - p.ganhas > 0 && p.sequencia !== Math.round(c.sequencia)) p.avisos.push(`A maior sequência de perdas ficou em ${p.sequencia}: com esse acerto ${p.sequencia > c.sequencia ? 'não há ganhos suficientes para separar as perdas' : 'não há perdas suficientes'}.`)
  if (ganhos.length && (retorno > 1.6 || retorno < 0.1)) p.avisos.push(`Cada ganho rendeu em média ${Math.round(retorno * 100)}% da entrada, o que foge do comum (perto de 95%). Ajuste o acerto, a entrada ou o resultado.`)
  return p
}

/* --------------------------------------- o cenário guardado no aparelho */

export function lerCenario(chave: string): Cenario | null {
  try {
    const c = JSON.parse(localStorage.getItem(chave) || 'null') as Cenario | null
    if (c && c.versao === 2 && Array.isArray(c.ias) && c.periodo) return c
  } catch { /* sem armazenamento */ }
  return null
}
