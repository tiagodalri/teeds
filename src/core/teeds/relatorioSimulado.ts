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
import { MARCA } from '../../marca'
import { escadaDoRobo } from '../deriv/escada'
import { parametrosPadrao, type ParametrosDoRobo } from '../deriv/parametros'

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
/** ganhos: só na divisão automática — quantas operações essa I.A. ganhou (cada uma com o seu acerto). */
export interface LinhaDeIa { ia: string; operacoes: number; resultado: number; ganhos?: number }
export interface Cenario {
  versao: 3
  /** O nome que aparece na faixa do relatório simulado. */
  nome: string
  periodo: PeriodoSimulado
  /** O número grande do relatório, em dólar (negativo = perda). */
  resultado: number
  operacoes: number
  /** % de operações ganhas. */
  acerto: number
  ias: LinhaDeIa[]
  /** Divide operações e resultado entre as I.A. sozinho (com oscilação: cada uma com o seu acerto). */
  dividirSozinho: boolean
  /** Muda a cada "Sortear outra divisão": a mesma estrutura com outra divisão entre as I.A. */
  sorteioDivisao?: number
  /** A entrada inicial (o nível 0 do gale). Com a entrada automática, é só o ponto de partida. */
  entrada: number
  /**
   * 09/11/2026, Tiago: "esse resultado não está sendo respeitado nas próximas etapas". Ligada (ou ausente),
   * a entrada é calculada para as operações fecharem no resultado pedido; desligada, vale `entrada`.
   */
  entradaAutomatica?: boolean
  /** Quanto o ganho paga sobre a entrada, em % (95 = ganha US$ 0,95 a cada US$ 1). */
  payout: number
  /** Martingale: depois de cada perda a entrada é a anterior × multiplicador, até `gales` vezes; ganhou, volta à inicial. */
  gale: boolean
  multiplicador: number
  /** Até quantos gales. Perdeu no último, aceita a perda e volta à entrada inicial. */
  gales: number
  /** A maior sequência de perdas seguidas. */
  sequencia: number
  iaDaSequencia: string
  momento: Momento
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
const MARCA_IA = MARCA.vocabularioIA ? 'I.A.' : 'robô'

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
/**
 * A escada do martingale: a entrada de cada nível (0 = a inicial, 1 = 1º gale…),
 * cada uma = a anterior × multiplicador, arredondada a centavos como a Deriv exige.
 */
export function escadaDoGale(c: Pick<Cenario, 'entrada' | 'gale' | 'multiplicador' | 'gales'>): number[] {
  const E = Math.max(0.35, r2(c.entrada || 1))
  const G = c.gale ? Math.max(0, Math.min(15, Math.round(c.gales))) : 0
  const m = Math.max(1, c.multiplicador || 1)
  const escada = [E]
  for (let k = 1; k <= G; k++) escada.push(Math.max(0.35, r2(escada[k - 1] * m)))
  return escada
}
/** A entrada de cada perda de uma sequência de `n` perdas (perdeu no último gale, volta à inicial). */
export const entradasDaSequencia = (escada: number[], n: number) => Array.from({ length: Math.max(0, n) }, (_, j) => escada[j % escada.length])

/* -------------------------------------------- como cada I.A. opera de verdade */

/**
 * 09/11/2026, Tiago: "a gente não faz entrada fixa com o robô; tem que pegar como funciona cada um —
 * a multiplicação do martingale, o payout que ele já tem na plataforma. Não tenho que preencher isso,
 * já tem que vir pré-setado. A não ser nas operações manuais."
 * As I.A. sobem a MESMA escada do motor (escadaDoRobo, com as regras publicadas no painel de controle
 * dos robôs; sem catálogo, o padrão do código). Só a Manual usa payout e gale preenchidos.
 */
export interface DegrauDaIa { valor: number; lucro: number }
let regrasPublicadas: Record<string, ParametrosDoRobo> = {}
let versaoDasRegras = 0
/** O painel passa as regras em vigor (catálogo); devolve um número que muda quando elas mudam. */
export function definirRegrasDasIas(itens: Array<{ id: string; parametros?: ParametrosDoRobo }> | null): number {
  const novas: Record<string, ParametrosDoRobo> = {}
  for (const i of itens ?? []) if (i.parametros) novas[i.id] = i.parametros
  if (JSON.stringify(novas) !== JSON.stringify(regrasPublicadas)) { regrasPublicadas = novas; versaoDasRegras++ }
  return versaoDasRegras
}
export const ehRobo = (ia: string) => iaDoSimulador(ia).origem !== 'manual'
const escadas = new Map<string, DegrauDaIa[]>()
/** A escada de uma I.A.: o degrau 0 é a entrada; cada perda sobe um. Na Manual, payout e gale do cenário. */
export function escadaDaIa(c: Cenario, ia: string): DegrauDaIa[] {
  const base = Math.max(0.35, r2(c.entrada || 1))
  if (!ehRobo(ia)) {
    const p = Math.max(0.01, (c.payout || 95) / 100)
    return escadaDoGale(c).map((valor) => ({ valor, lucro: r2(valor * p) }))
  }
  const chave = `${ia}|${base}|${versaoDasRegras}`
  let e = escadas.get(chave)
  if (!e) {
    e = escadaDoRobo(ia, base, 40, 'conservador', regrasPublicadas[ia] ?? parametrosPadrao(ia)).filter((d) => !d.esgotada).map((d) => ({ valor: d.valor, lucro: d.lucro }))
    if (!e.length) e = [{ valor: base, lucro: 0 }]
    escadas.set(chave, e)
  }
  return e
}
/** As entradas de uma sequência de `n` perdas numa I.A. (passou do último degrau, volta à entrada). */
export const entradasDaSequenciaNaIa = (c: Cenario, ia: string, n: number) => entradasDaSequencia(escadaDaIa(c, ia).map((d) => d.valor), n)
/** A maior entrada que o relatório vai mostrar: o degrau mais alto que a pior sequência alcança. */
export const maiorEntradaDoCenario = (c: Cenario) => Math.max(...entradasDaSequenciaNaIa(c, c.iaDaSequencia, Math.max(1, Math.round(c.sequencia)) + 1))
/** Algum robô na lista, ou a Manual com gale: a ordem dos ganhos e perdas muda o resultado. */
const temEscada = (c: Cenario, ias: LinhaDeIa[]) => ias.some((l) => escadaDaIa(c, l.ia).length > 1)

const divisaoLigada = (c: Cenario) => c.dividirSozinho && c.ias.length > 1

/**
 * A divisão automática (09/11/2026, Tiago: "não pode ser igualzinho, tem que oscilar; às vezes uma dá
 * prejuízo e as outras fecham positivo, mas o total fecha"): cada I.A. recebe uma fatia diferente das
 * operações e um acerto próprio em volta do acerto geral. O resultado de cada uma NÃO é sorteado aqui:
 * sai das operações dela (payout e gale de verdade); o gerador só acerta o total.
 * O sorteio depende só da estrutura (não do resultado pedido), como no gerador das operações.
 */
function divisaoAutomatica(c: Cenario): LinhaDeIa[] {
  const n = c.ias.length
  const N = Math.max(0, Math.round(c.operacoes))
  const rnd = sorteio(sementeDe(JSON.stringify(['divisao', c.ias.map((l) => l.ia), N, c.acerto, c.sequencia, c.iaDaSequencia, c.sorteioDivisao ?? 0])))
  // operações: fatias diferentes (de ~0,55× a ~1,45× da média), toda I.A. com pelo menos uma
  let ops = repartir(N, c.ias.map(() => 0.55 + rnd() * 0.9))
  if (N >= n) ops = ops.map((o) => Math.max(1, o))
  let sobraOps = ops.reduce((s, x) => s + x, 0) - N
  for (let i = 0; sobraOps > 0 && i < 4 * n; i++) { const m = ops.indexOf(Math.max(...ops)); ops[m]--; sobraOps-- }
  // ganhos: cada I.A. com um acerto próprio, até ~35% acima ou abaixo do geral
  const W = Math.min(N, Math.max(0, Math.round((N * Math.min(100, Math.max(0, c.acerto))) / 100)))
  const L = N - W
  const S = L ? Math.min(L, Math.max(1, Math.round(c.sequencia || 1))) : 0
  const k = Math.max(0, c.ias.findIndex((l) => l.ia === c.iaDaSequencia))
  const teto = ops.map((o, i) => Math.max(0, o - (i === k ? Math.min(S, o) : 0))) // a I.A. da pior sequência precisa das perdas dela
  const ganhos = repartir(W, ops.map((o) => o * (0.65 + rnd() * 0.7))).map((g, i) => Math.min(g, teto[i]))
  let falta = W - ganhos.reduce((s, x) => s + x, 0)
  for (let volta = 0; falta > 0 && volta < 10 * N + 10; volta++) {
    const com = ganhos.map((g, i) => (g < teto[i] ? i : -1)).filter((i) => i >= 0)
    if (!com.length) break
    ganhos[com[Math.floor(rnd() * com.length)]]++; falta--
  }
  return c.ias.map((l, i) => ({ ia: l.ia, operacoes: ops[i], resultado: 0, ganhos: ganhos[i] }))
}

/** As I.A. com operações e resultado. Na divisão automática, o resultado de cada uma é o das operações geradas. */
let memoria: { chave: string; valor: LinhaDeIa[] } | null = null
export function iasDoCenario(c: Cenario): LinhaDeIa[] {
  if (!divisaoLigada(c)) {
    if (c.ias.length === 1) return [{ ia: c.ias[0].ia, operacoes: Math.round(c.operacoes), resultado: r2(c.resultado) }]
    return c.ias
  }
  const chave = JSON.stringify([c, hojeIso(), versaoDasRegras])
  if (memoria?.chave === chave) return memoria.valor
  const ops = operacoesDoCenario(c)
  const valor = divisaoAutomatica(c).map((l) => {
    const dela = ops.filter((o) => o.id === iaDoSimulador(l.ia).id)
    return { ...l, operacoes: dela.length, resultado: r2(dela.reduce((s, o) => s + o.resultado, 0)), ganhos: dela.filter((o) => o.ganhou).length }
  })
  memoria = { chave, valor }
  return valor
}

/* ------------------------------------------------------- cenários prontos */

const base = (p: Partial<Cenario>): Cenario => ({
  versao: 3, nome: 'Meu cenário', periodo: { tipo: 'dia', data: hojeIso() }, resultado: 10, operacoes: 30, acerto: 63,
  ias: [{ ia: 'goreme', operacoes: 30, resultado: 10 }], dividirSozinho: true, entrada: 1, payout: 95, gale: false, multiplicador: 2.1, gales: 2,
  sequencia: 3, iaDaSequencia: 'goreme', momento: 'meio', horaDe: 9, horaAte: 17, saldo: 1000, depositos: 0, saques: 0, ...p,
})
export function cenariosProntos(): Array<{ id: string; tom: 'sobe' | 'cai' | 'neutro'; cenario: Cenario }> {
  const hoje = hojeIso()
  // 09/11/2026: refeitos com a escada real de cada I.A. (Raptor e Falcon, entrada US$ 1,00) e a divisão
  // automática; os resultados são os que essas regras dão, então fecham exatos em qualquer dia.
  // Não respeitou e Devolveu: a sequência cai na Falcon, que sobe ~2,9× por perda.
  const duas = [{ ia: 'goreme', operacoes: 0, resultado: 0 }, { ia: 'falcon', operacoes: 0, resultado: 0 }]
  return [
    { id: 'respeitou', tom: 'sobe', cenario: base({
      nome: 'Respeitou o gerenciamento', periodo: { tipo: 'ultimos', dias: 30 }, resultado: 139.99, operacoes: 680, acerto: 62, horaDe: 9, horaAte: 17,
      ias: duas, dividirSozinho: true, entradaAutomatica: false, entrada: 1, sequencia: 3, iaDaSequencia: 'falcon', momento: 'meio', saldo: 1284.6, depositos: 1000, saques: 150 }) },
    { id: 'meta', tom: 'sobe', cenario: base({
      nome: 'Dia de meta', periodo: { tipo: 'dia', data: hoje }, resultado: 10.06, operacoes: 30, acerto: 70, horaDe: 9, horaAte: 9,
      ias: duas, dividirSozinho: true, entradaAutomatica: false, entrada: 1, sequencia: 2, iaDaSequencia: 'falcon', momento: 'meio', saldo: 1011 }) },
    { id: 'stop', tom: 'neutro', cenario: base({
      nome: 'Dia de stop, respeitado', periodo: { tipo: 'dia', data: hoje }, resultado: -10.36, operacoes: 26, acerto: 38, horaDe: 9, horaAte: 10,
      ias: duas, dividirSozinho: true, entradaAutomatica: false, entrada: 1, sequencia: 3, iaDaSequencia: 'falcon', momento: 'fim', saldo: 989.64 }) },
    { id: 'nao-respeitou', tom: 'cai', cenario: base({
      nome: 'Não respeitou o gerenciamento', periodo: { tipo: 'dia', data: hoje }, resultado: -1187.01, operacoes: 120, acerto: 52, horaDe: 9, horaAte: 23,
      ias: duas, dividirSozinho: true, entradaAutomatica: false, entrada: 2, sequencia: 7, iaDaSequencia: 'falcon', momento: 'fim', saldo: 812.4 }) },
    { id: 'devolveu', tom: 'cai', cenario: base({
      // sobe com a recuperação e devolve tudo numa sequência de 6 perdas na Falcon
      nome: 'Bateu a meta e devolveu', periodo: { tipo: 'dia', data: hoje }, resultado: -165.01, operacoes: 90, acerto: 62, horaDe: 9, horaAte: 19,
      ias: duas, dividirSozinho: true, entradaAutomatica: false, entrada: 1, sequencia: 6, iaDaSequencia: 'falcon', momento: 'fim', saldo: 899 }) },
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

interface Rascunho { ia: number; dia: number; ganhou: boolean; entrada: number; resultado: number; daSequencia: boolean }

/**
 * As operações do cenário. Fecham com o que foi respondido: resultado e
 * operações (no total e de cada I.A.), acerto, maior sequência de perdas,
 * maior entrada e maior ganho. Quando uma resposta não combina com as outras
 * (ex.: perder muito com entrada pequena), a prévia do editor avisa.
 */
export function operacoesDoCenario(c: Cenario, agora = new Date()): OperacaoSimulada[] {
  return gerar(comEntrada(c, agora), agora, true)
}

/**
 * A entrada que faz as operações fecharem no resultado pedido. O resultado das I.A. cresce junto com a
 * entrada (a escada de cada uma é proporcional a ela), então a conta é uma regra de três com as operações
 * sem ajuste, repetida até parar de mudar; o ajuste fino das posições fecha os centavos.
 * Null quando nenhuma entrada chega lá (ex.: pedir ganho com um acerto que só dá perda).
 */
const entradas = new Map<string, number | null>()
function entradaQueFecha(c: Cenario, agora: Date): number | null {
  const chave = JSON.stringify([{ ...c, entrada: 0, nome: '' }, diasDoCenario(c, agora), versaoDasRegras])
  if (entradas.has(chave)) return entradas.get(chave)!
  const R = r2(c.resultado)
  const total = (E: number, ajustar: boolean) => r2(gerar({ ...c, entrada: E }, agora, ajustar).reduce((t, o) => t + o.resultado, 0))
  const limite = (x: number) => Math.min(50000, Math.max(0.35, Math.round(x * 100) / 100))
  let E: number | null = null
  if (Math.abs(R) >= 0.005) {
    // 1) a regra de três com as operações sem ajuste (rápida); se elas vão para o outro lado,
    //    tenta com o ajuste das posições (a recuperação pode virar o resultado)
    let atual = 1
    let T = total(1, false)
    if (!(T * R > 0)) T = total(1, true)
    if (T * R > 0) {
      E = atual
      for (let volta = 0; volta < 6; volta++) {
        const nova = limite((atual * R) / T)
        E = nova
        if (Math.abs(nova - atual) < 0.005) break
        atual = nova
        T = total(atual, false)
        if (!(T * R > 0)) break
      }
      // 2) com o ajuste: se ainda ficou longe, corrige a entrada pelo que o ajuste conseguiu,
      //    ficando sempre com a entrada que chegou mais perto
      let melhor = { E: E as number, d: Math.abs(total(E, true) - R) }
      let tentativa = E as number
      for (let volta = 0; volta < 3 && melhor.d >= 0.005; volta++) {
        const Tt = total(tentativa, true)
        if (!(Tt * R > 0)) break
        const nova = limite((tentativa * R) / Tt)
        if (Math.abs(nova - tentativa) < 0.005) break
        tentativa = nova
        const d = Math.abs(total(tentativa, true) - R)
        if (d < melhor.d) melhor = { E: tentativa, d }
      }
      // 3) os centavos: entradas vizinhas mudam os valores da escada; uma delas costuma fechar exato
      const centro = melhor.E
      for (let k = 1; k <= 6 && melhor.d >= 0.005; k++) {
        const vizinha = limite(centro + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.01)
        const d = Math.abs(total(vizinha, true) - R)
        if (d < melhor.d) melhor = { E: vizinha, d }
      }
      E = melhor.E
    }
  }
  if (entradas.size > 200) entradas.clear()
  entradas.set(chave, E)
  return E
}
/** A entrada que o cenário usa: a calculada (automática) ou a preenchida. */
export function entradaDoCenario(c: Cenario, agora = new Date()): number {
  const fixa = Math.max(0.35, r2(c.entrada || 1))
  if (c.entradaAutomatica === false) return fixa
  return entradaQueFecha(c, agora) ?? fixa
}
/** O cenário com a entrada que ele usa de verdade (para a tela mostrar escadas e riscos certos). */
export const comEntrada = (c: Cenario, agora = new Date()): Cenario => {
  const e = entradaDoCenario(c, agora)
  return e === c.entrada ? c : { ...c, entrada: e }
}

function gerar(c: Cenario, agora: Date, ajustar: boolean): OperacaoSimulada[] {
  const automatica = divisaoLigada(c)
  const ias = (automatica ? divisaoAutomatica(c) : iasDoCenario(c)).filter((l) => l.operacoes > 0)
  // o sorteio depende só da estrutura (não do resultado pedido): mudar o alvo não embaralha a tela de novo
  // o período entra pelo formato (tipo e dias), não pelas datas: um modelo de "hoje" dá a mesma tela amanhã
  const rnd = sorteio(sementeDe(JSON.stringify([[c.periodo.tipo, diasDoCenario(c, agora)], c.operacoes, c.acerto, ias.map((l) => [l.ia, l.operacoes]), c.sequencia, c.iaDaSequencia, c.momento, c.horaDe, c.horaAte, c.payout, c.gale, c.multiplicador, c.gales])))
  const N = ias.reduce((s, l) => s + Math.round(l.operacoes), 0)
  if (!N) return []
  const W = Math.min(N, Math.max(0, Math.round((N * Math.min(100, Math.max(0, c.acerto))) / 100)))
  const L = N - W
  const S = L ? Math.min(L, Math.max(1, Math.round(c.sequencia || 1))) : 0

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
    // divisão automática: cada I.A. com o acerto que a divisão sorteou; na mão, o acerto do total
    // (também quando a divisão automática foi aceita com "Usar": as linhas guardam os ganhos)
    const alvo = ias.every((l) => l.ganhos != null && l.ganhos <= l.operacoes) && ias.reduce((t, l) => t + (l.ganhos ?? 0), 0) === W
      ? ias.map((l) => l.ganhos ?? 0) : repartir(W, ias.map((l) => l.operacoes))
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

  // ---------- o gerenciamento de verdade, I.A. por I.A.: cada robô sobe a escada de recuperação dele
  // (a do motor, com o payout que ele compra); a Manual, o gale preenchido. Ganhou, volta à entrada;
  // passou do último degrau, aceita a perda e volta à entrada. Cada dia começa na entrada.
  const degraus = ias.map((l) => escadaDaIa(c, l.ia))
  const posIa: number[][] = ias.map(() => [])
  linha.forEach((x, pos) => posIa[x.ia].push(pos))
  const naSequencia = (pos: number) => S > 0 && pos >= inicio && pos < inicio + S
  const entradasDe = (i: number) => {
    const e: DegrauDaIa[] = []
    const d = degraus[i], G = d.length - 1
    let nivel = 0, dia = -1
    for (const pos of posIa[i]) {
      if (linha[pos].dia !== dia) { dia = linha[pos].dia; nivel = 0 }
      e.push(d[nivel])
      nivel = seq[pos] ? 0 : nivel >= G ? 0 : nivel + 1
    }
    return e
  }
  // a mesma conta de entradasDe, sem montar lista (roda milhares de vezes no ajuste)
  const resultadoDe = (i: number) => {
    const d = degraus[i], G = d.length - 1, ps = posIa[i]
    let t = 0, nivel = 0, dia = -1
    for (let j = 0; j < ps.length; j++) {
      const pos = ps[j]
      if (linha[pos].dia !== dia) { dia = linha[pos].dia; nivel = 0 }
      const g = d[nivel]
      if (seq[pos]) { t += g.lucro; nivel = 0 } else { t -= g.valor; nivel = nivel >= G ? 0 : nivel + 1 }
    }
    return r2(t)
  }
  const maiorSerie = () => { let m = 0, a = 0; for (const g of seq) { a = g ? 0 : a + 1; if (a > m) m = a } return m }
  /** Depois de virar `pos` em perda: a série de perdas em volta dela não passa da pior sequência. */
  const serieOk = (pos: number) => { let n = 1; for (let k = pos - 1; k >= 0 && !seq[k]; k--) n++; for (let k = pos + 1; k < seq.length && !seq[k]; k++) n++; return n <= S }

  // o resultado de cada I.A. sai da ordem dos ganhos e perdas (com gale, onde caem as perdas muda tudo):
  // troca um ganho e uma perda de lugar (fora da pior sequência, sem criar sequência maior) enquanto isso
  // aproximar do resultado pedido. O payout não muda: cada ganho paga entrada × payout, em centavos.
  if (ajustar && automatica && temEscada(c, ias)) {
    // divisão automática: só o total precisa fechar; cada I.A. fica com o que as operações dela deram.
    // Sem gale o total é conta fixa (ganhos × entrada × payout − perdas × entrada): trocar de lugar não muda nada.
    const R = r2(c.resultado)
    const porIa = ias.map((_, i) => resultadoDe(i))
    let dist = Math.abs(R - r2(porIa.reduce((s, x) => s + x, 0)))
    // troca um ganho e uma perda de lugar, na mesma I.A. ou entre duas (o acerto de cada uma oscila junto)
    const livres = (ganhou: boolean) => seq.map((g, pos) => (g === ganhou && !naSequencia(pos) ? pos : -1)).filter((pos) => pos >= 0)
    const g = livres(true), pe = livres(false)
    for (let volta = 0, parado = 0; g.length && pe.length && volta < 12000 * ias.length && parado < 2500 * ias.length; volta++) {
      if (dist < 0.005) break
      const ga = Math.floor(rnd() * g.length), pb = Math.floor(rnd() * pe.length)
      const a = g[ga], b = pe[pb], ia = linha[a].ia, ib = linha[b].ia
      seq[a] = false; seq[b] = true
      const ok = serieOk(a)
      const novoA = ok ? resultadoDe(ia) : 0, novoB = ok && ib !== ia ? resultadoDe(ib) : novoA
      const nova = ok ? Math.abs(R - r2(porIa.reduce((s, x, j) => s + (j === ia ? novoA : j === ib ? novoB : x), 0))) : Infinity
      // aceita também a troca que empata (anda de lado): perto do alvo, o gale em centavos precisa de espaço para achar o valor exato
      if (nova <= dist && nova < Infinity) {
        parado = nova < dist ? 0 : parado + 1
        dist = nova; porIa[ia] = novoA; porIa[ib] = novoB
        g[ga] = b; pe[pb] = a
      } else { seq[a] = true; seq[b] = false; parado++ }
    }
    // os centavos: as trocas ao acaso param perto (a poucos centavos). Aqui a busca é dirigida: mede o efeito
    // de várias trocas ganho/perda e procura uma, ou duas somadas, que dê exatamente os centavos que faltam.
    const soma = () => r2(porIa.reduce((t, x) => t + x, 0))
    const trocar = (pares: Array<[number, number]>, ida: boolean) => {
      for (const [a, b] of pares) { seq[a] = !ida; seq[b] = ida }
      const mexidas = new Set(pares.flatMap(([a, b]) => [linha[a].ia, linha[b].ia]))
      for (const i of mexidas) porIa[i] = resultadoDe(i)
    }
    for (let rodada = 0; rodada < 14 && dist >= 0.005 && g.length && pe.length; rodada++) {
      const base = soma()
      const falta = Math.round((R - base) * 100)
      const cands: Array<{ a: number; b: number; dc: number }> = []
      const porEfeito = new Map<number, number[]>()
      for (let k = 0; k < 700; k++) {
        const a = g[Math.floor(rnd() * g.length)], b = pe[Math.floor(rnd() * pe.length)]
        const ia = linha[a].ia, ib = linha[b].ia
        seq[a] = false; seq[b] = true
        const nA = resultadoDe(ia), nB = ib !== ia ? resultadoDe(ib) : nA
        seq[a] = true; seq[b] = false
        const dc = Math.round((r2(porIa.reduce((t, x, q) => t + (q === ia ? nA : q === ib ? nB : x), 0)) - base) * 100)
        cands.push({ a, b, dc })
        const l = porEfeito.get(dc) ?? []; l.push(cands.length - 1); porEfeito.set(dc, l)
      }
      const tentar = (pares: Array<[number, number]>) => {
        trocar(pares, true)
        if (Math.abs(R - soma()) < 0.005 && pares.every(([a]) => serieOk(a))) {
          for (const [a, b] of pares) { g[g.indexOf(a)] = b; pe[pe.indexOf(b)] = a }
          dist = Math.abs(R - soma()); return true
        }
        trocar(pares, false); return false
      }
      let fechou = false, tentativas = 0
      for (const x of porEfeito.get(falta) ?? []) { if (tentar([[cands[x].a, cands[x].b]])) { fechou = true; break } }
      for (let x = 0; !fechou && x < cands.length && tentativas < 1500; x++) {
        for (const y of porEfeito.get(falta - cands[x].dc) ?? []) {
          const p1 = cands[x], p2 = cands[y]
          if (y === x || p1.a === p2.a || p1.b === p2.b) continue
          tentativas++
          if (tentar([[p1.a, p1.b], [p2.a, p2.b]])) { fechou = true; break }
        }
      }
      // sem par desta vez: a próxima rodada sorteia outras trocas
    }
  } else if (ajustar && !automatica) ias.forEach((l, i) => {
    const R = r2(l.resultado)
    let dist = Math.abs(R - resultadoDe(i))
    const ganhos = () => posIa[i].filter((pos) => seq[pos] && !naSequencia(pos))
    const perdas = () => posIa[i].filter((pos) => !seq[pos] && !naSequencia(pos))
    for (let volta = 0, parado = 0; volta < 3000 && parado < 400; volta++) {
      if (dist < 0.005) break
      const g = ganhos(), pe = perdas()
      if (!g.length || !pe.length) break
      const a = g[Math.floor(rnd() * g.length)], b = pe[Math.floor(rnd() * pe.length)]
      seq[a] = false; seq[b] = true
      const nova = serieOk(a) ? Math.abs(R - resultadoDe(i)) : Infinity
      if (nova < dist) { dist = nova; parado = 0 } else { seq[a] = true; seq[b] = false; parado++ }
    }
  })

  const ops: Rascunho[] = linha.map((x, pos) => ({ ia: x.ia, dia: x.dia, ganhou: seq[pos] ?? true, entrada: 0, resultado: 0, daSequencia: naSequencia(pos) }))
  ias.forEach((_, i) => {
    const e = entradasDe(i)
    posIa[i].forEach((pos, j) => { const o = ops[pos]; o.entrada = e[j].valor; o.resultado = o.ganhou ? e[j].lucro : -e[j].valor })
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
    // 08/11/2026 (print do Tiago, "erro de cálculo no gale"): o tremor de até 20 s trocava a ordem quando as
    // operações ficavam a ~1 s uma da outra, e a escada do gale aparecia quebrada no relatório. Agora o tremor
    // é menor que a metade do intervalo: a ordem do horário é sempre a ordem em que o gale foi calculado.
    const passoMs = ((b - a) * 36e5) / l2.length
    l2.forEach((o, j) => {
      const h = a + ((j + 0.5) / l2.length) * (b - a)
      const quando = new Date(dias[d].getTime() + h * 36e5 + Math.floor(rnd() * Math.min(20000, passoMs * 0.45)))
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
  /** O resultado que cada I.A. fez de verdade com essas regras. */
  porIa: LinhaDeIa[]
  /** O resultado pedido não fecha com payout e gale: o mais perto é `resultado`. */
  naoFechou: boolean
  /** Sem gale, o acerto que daria o resultado pedido (null = já fecha ou não existe). */
  acertoSugerido: number | null
  /** A entrada usada (a calculada, na automática). */
  entrada: number
  /** Entrada automática e nenhuma entrada fecha: com esse acerto o resultado vai para o outro lado. */
  sinalTrocado: boolean
  avisos: string[]
}
/** Os números que o relatório vai mostrar, e onde eles não batem com as respostas. */
export function previaDoCenario(c: Cenario, agora = new Date()): Previa {
  const ops = operacoesDoCenario(c, agora)
  const r = relatorioDoCenario(ops, { ...faixaDoCenario(c, agora), filtros: {} }, agora)
  const ganhos = ops.filter((o) => o.ganhou && o.entrada > 0)
  const retorno = ganhos.length ? ganhos.reduce((s, o) => s + o.resultado / o.entrada, 0) / ganhos.length : 0
  const porIa = iasDoCenario(c).filter((l) => l.operacoes > 0).map((l) => ({ ia: l.ia, operacoes: ops.filter((o) => o.id === l.ia).length, resultado: r2(ops.filter((o) => o.id === l.ia).reduce((s, o) => s + o.resultado, 0)) }))
  const naoFechou = Math.abs(r.total.resultado - c.resultado) > 0.005 || porIa.some((l, i) => Math.abs(l.resultado - iasDoCenario(c).filter((x) => x.operacoes > 0)[i].resultado) > 0.005)
  const p: Previa = { resultado: r.total.resultado, operacoes: r.total.operacoes, ganhas: r.total.ganhas, maiorEntrada: r.opcoes.entradaMax, maiorGanho: r.total.maiorGanho, maiorPerda: r.total.maiorPerda, sequencia: r.sequencias.perdas, retorno, porIa, naoFechou, acertoSugerido: null, entrada: entradaDoCenario(c, agora), sinalTrocado: c.entradaAutomatica !== false && Math.abs(c.resultado) >= 0.005 && entradaQueFecha(c, agora) === null, avisos: [] }
  const dinheiro = (x: number) => `${x < 0 ? '−' : ''}US$ ${Math.abs(x).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (naoFechou) {
    const soManual = c.ias.every((l) => !ehRobo(l.ia))
    // só Manual e sem gale: o resultado é conta direta (ganhas × entrada × payout − perdidas × entrada)
    if (soManual && !c.gale) {
      const E = p.entrada, pg = (c.payout || 95) / 100, N = Math.round(c.operacoes)
      const w = (c.resultado / E + N) / (1 + pg)
      if (w >= 0 && w <= N) p.acertoSugerido = Math.round((w / N) * 1000) / 10
    }
    const regras = soManual
      ? `Com payout de ${c.payout}%${c.gale ? `, gale × ${String(c.multiplicador).replace('.', ',')} até ${c.gales} ${c.gales === 1 ? 'vez' : 'vezes'}` : ' e entrada fixa'}`
      : `Com a escada de recuperação de cada ${MARCA_IA} e entrada de ${dinheiro(p.entrada)}`
    if (p.sinalTrocado) p.avisos.push(`Com ${String(c.acerto).replace('.', ',')}% de acerto, essas operações fecham ${c.resultado > 0 ? 'no negativo' : 'no positivo'} com qualquer entrada. Para ${c.resultado > 0 ? 'um ganho, aumente' : 'uma perda, diminua'} o acerto no passo Resultado, ou use o resultado calculado.`)
    else p.avisos.push(`${regras}, o resultado mais perto de ${dinheiro(c.resultado)} é ${dinheiro(p.resultado)}.`
      + (p.acertoSugerido != null ? ` Para chegar em ${dinheiro(c.resultado)} o acerto precisa ser perto de ${String(p.acertoSugerido).replace('.', ',')}%.` : ' Mude o acerto, a quantidade de operações ou a entrada, ou use o resultado calculado.'))
  }
  if (p.operacoes - p.ganhas > 0 && p.sequencia !== Math.round(c.sequencia)) p.avisos.push(`A maior sequência de perdas ficou em ${p.sequencia}: com esse acerto ${p.sequencia > c.sequencia ? 'não há ganhos suficientes para separar as perdas' : 'não há perdas suficientes'}.`)
  return p
}

/* --------------------------------------- o cenário guardado no aparelho */

export function lerCenario(chave: string): Cenario | null {
  try {
    const c = JSON.parse(localStorage.getItem(chave) || 'null') as Cenario | null
    if (c && c.versao === 3 && Array.isArray(c.ias) && c.periodo) return c
  } catch { /* sem armazenamento */ }
  return null
}
