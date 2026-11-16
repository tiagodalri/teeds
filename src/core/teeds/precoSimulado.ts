/**
 * O preço da tela no roteiro da manual (16/11/2026, Tiago: "operações simuladas também nas manuais; os
 * dígitos mudam só o último dígito do tick de saída; o Sobe/Desce entorta o preço nos ticks do contrato,
 * um desvio pequeno, dentro do movimento normal, e depois o gráfico volta a colar no preço real. Capricha.").
 *
 * Como funciona:
 *  - Cada operação manual simulada com resultado pedido ("ganha" ou "perde") é acompanhada aqui, tick a
 *    tick, com as mesmas regras da corretora simulada (entrada no 1º tick depois da compra, saída no N-ésimo
 *    tick ou no vencimento, barreira relativa ou absoluta).
 *  - Dígitos: só o tick de saída muda, e só o último dígito, para o dígito que dá o resultado pedido mais
 *    perto do verdadeiro (a diferença é de poucos pontos, num tick só). Se o dígito real já dá o resultado,
 *    nada muda.
 *  - Sobe/Desce: um desvio (o que a tela soma ao preço real) anda aos poucos durante o contrato, no tamanho
 *    de um tick normal do ativo, até deixar a saída do lado pedido com uma folga natural (sorteada no
 *    tamanho do movimento esperado). Se o mercado já está indo para o lado pedido, o desvio fica em zero.
 *    Depois da saída, o desvio volta a zero aos poucos e o gráfico cola de novo no preço real.
 *  - O mesmo tick mostra sempre o mesmo preço (gráfico, velas, dígitos, cotação, cabine, posição), e o
 *    histórico baixado depois traz os preços que a tela mostrou.
 * Só a tela vê isto (market.ts › *DaTela): os motores das I.A. de verdade seguem com o preço da Deriv.
 */
import { definirFiltroDaTela, fetchTickHistory } from '../deriv/market'
import type { Candle, Tick } from '../deriv/types'

export const TIPOS_DE_DIGITO = ['DIGITMATCH', 'DIGITDIFF', 'DIGITOVER', 'DIGITUNDER', 'DIGITEVEN', 'DIGITODD']
export const TIPOS_DE_DIRECAO = ['CALL', 'PUT', 'CALLE', 'PUTE']

export const digitoDe = (preco: number, casas: number) => { const t = preco.toFixed(casas); return Number(t[t.length - 1]) }
/** O contrato ganha com esta saída? (as regras da Deriv, as mesmas da corretora simulada) */
export function ganha(tipo: string, saida: number, barreira: number, casas: number): boolean {
  const d = digitoDe(saida, casas)
  switch (tipo) {
    case 'CALL': return saida > barreira
    case 'PUT': return saida < barreira
    case 'CALLE': return saida >= barreira
    case 'PUTE': return saida <= barreira
    case 'DIGITMATCH': return d === barreira
    case 'DIGITDIFF': return d !== barreira
    case 'DIGITOVER': return d > barreira
    case 'DIGITUNDER': return d < barreira
    case 'DIGITEVEN': return d % 2 === 0
    case 'DIGITODD': return d % 2 === 1
    default: return false
  }
}
/** A barreira do contrato a partir do preço de entrada ("+0.25" relativa, "1234.5" absoluta, ou o dígito). */
export function barreiraDe(tipo: string, pedida: string | undefined, entrada: number): number {
  if (TIPOS_DE_DIGITO.includes(tipo)) return Number(pedida ?? 0)
  if (pedida === undefined || pedida === '') return entrada
  return /^[+-]/.test(pedida) ? entrada + Number(pedida) : Number(pedida)
}

export type Desejo = 'ganha' | 'perde'
export interface ContratoPlanejado {
  id: number
  simbolo: string
  tipo: string
  /** Duração e unidade como na compra ('t' ticks, 's', 'm', 'h', 'd'). */
  duracao: number
  unidade: string
  barreiraPedida?: string
  /** Epoch (s) da compra: a entrada é o 1º tick depois dele. */
  compradoEm: number
  /** Epoch (s) do vencimento, nos contratos por tempo. */
  expiraEm: number
  desejo: Desejo
}

interface Acompanhado extends ContratoPlanejado {
  entrada: number | null
  barreira: number | null
  ticks: number
  /** Ticks que o contrato deve durar (por tempo: estimado pelo ritmo do ativo). */
  total: number
  /** Folga natural da saída para o lado pedido (preço). */
  folga: number
  saiu: boolean
}

interface EstadoDoAtivo {
  desvio: number
  ultimoEpoch: number
  ultimoReal: number | null
  passos: number[]
  intervalo: number
  casas: number
  /** O preço que a tela mostrou em cada epoch (enquanto houve roteiro no ativo). */
  mostrados: Map<number, number>
  /** Os ticks que a tela mostrou diferentes do real (para velas e histórico baixados depois). */
  alterados: { epoch: number; quote: number }[]
}

const estados = new Map<string, EstadoDoAtivo>()
const acompanhados = new Map<number, Acompanhado>()
const LIMITE_MEMORIA = 4000
let rnd = Math.random

/** Para as provas: um sorteio repetível. */
export function sortearCom(f: () => number): void { rnd = f }

const r = (x: number, casas: number) => Number(x.toFixed(casas))
const pipDe = (casas: number) => Math.pow(10, -casas)

function estadoDe(simbolo: string, casas = 2): EstadoDoAtivo {
  let e = estados.get(simbolo)
  if (!e) {
    e = { desvio: 0, ultimoEpoch: 0, ultimoReal: null, passos: [], intervalo: 2, casas, mostrados: new Map(), alterados: [] }
    estados.set(simbolo, e)
  }
  return e
}

/** O tamanho típico de um tick do ativo (desvio padrão dos últimos passos). */
function sigmaDe(e: EstadoDoAtivo, preco: number): number {
  if (e.passos.length >= 5) {
    const m = e.passos.reduce((s, x) => s + x * x, 0) / e.passos.length
    const s = Math.sqrt(m)
    if (s > 0) return s
  }
  return Math.max(pipDe(e.casas) * 3, preco * 0.00012)
}

/**
 * Uma operação manual simulada com resultado pedido. Chame logo depois da compra, antes do 1º tick.
 * Baixa os últimos ticks do ativo para conhecer o tamanho do movimento antes de mexer em qualquer coisa.
 */
export function planejarContrato(c: ContratoPlanejado): void {
  const e = estadoDe(c.simbolo)
  acompanhados.set(c.id, { ...c, entrada: null, barreira: null, ticks: 0, total: c.unidade === 't' ? c.duracao : 1, folga: 0, saiu: false })
  if (e.passos.length < 20) {
    void fetchTickHistory(c.simbolo, 120).then((ts) => {
      if (ts.length < 3) return
      const est = estadoDe(c.simbolo)
      const passos: number[] = []
      for (let i = 1; i < ts.length; i++) passos.push(ts[i].quote - ts[i - 1].quote)
      est.passos = [...passos, ...est.passos].slice(-80)
      const gaps = ts.slice(1).map((t, i) => t.epoch - ts[i].epoch).filter((g) => g > 0).sort((a, b) => a - b)
      if (gaps.length) est.intervalo = Math.min(10, Math.max(1, gaps[Math.floor(gaps.length / 2)]))
      if (ts[0].pipSize) est.casas = ts[0].pipSize
    }).catch(() => { /* segue com o que tiver */ })
  }
}

/** O contrato acabou (ou foi esquecido): para de acompanhar. */
export function esquecerContrato(id: number): void { acompanhados.delete(id) }

/** O modo simulado desligou: tudo volta ao preço real. */
export function limparPrecoSimulado(): void {
  acompanhados.clear()
  estados.clear()
}

/** Para as provas: o desvio de agora. */
export const desvioAgora = (simbolo: string) => estados.get(simbolo)?.desvio ?? 0

/** De que lado da barreira a saída tem que ficar: +1 acima, −1 abaixo. */
function ladoPedido(c: Acompanhado): 1 | -1 {
  const sobe = c.tipo === 'CALL' || c.tipo === 'CALLE'
  return (sobe === (c.desejo === 'ganha')) ? 1 : -1
}

/** O tick como a tela mostra. */
function processar(t: Tick): Tick {
  const e0 = estados.get(t.symbol)
  if (!e0) return t
  const ja = e0.mostrados.get(t.epoch)
  if (ja !== undefined) return comPreco(t, ja)
  // um tick mais velho do que o último que passou aqui, e que não passou: o real
  if (t.epoch <= e0.ultimoEpoch) return t
  const e = e0
  const casas = t.pipSize || e.casas
  e.casas = casas
  const pip = pipDe(casas)
  const real = t.quote
  if (e.ultimoReal !== null) e.passos = [...e.passos, real - e.ultimoReal].slice(-80)
  if (e.ultimoEpoch > 0) {
    const g = t.epoch - e.ultimoEpoch
    if (g > 0 && g <= 10) e.intervalo = e.intervalo * 0.8 + g * 0.2
  }
  const sigma = sigmaDe(e, real)
  const doAtivo = [...acompanhados.values()].filter((c) => c.simbolo === t.symbol && !c.saiu)

  // 1) onde cada contrato está neste tick
  const entrando: Acompanhado[] = []
  const direcao: { c: Acompanhado; restantes: number; exige: boolean }[] = []
  const digitosSaindo: Acompanhado[] = []
  for (const c of doAtivo) {
    if (c.entrada === null) {
      if (t.epoch > c.compradoEm) entrando.push(c)
      continue
    }
    c.ticks += 1
    const porTempo = c.unidade !== 't'
    const restantes = porTempo ? Math.max(0, Math.floor((c.expiraEm - t.epoch) / Math.max(1, e.intervalo))) : c.duracao - c.ticks
    // por tempo: qualquer tick perto do vencimento pode ser o último (um tick pode faltar): todos já do lado certo
    const exige = porTempo ? t.epoch >= c.expiraEm - 2 * Math.max(1, e.intervalo) : restantes <= 0
    if (TIPOS_DE_DIGITO.includes(c.tipo)) { if (!porTempo && restantes <= 0) digitosSaindo.push(c) }
    else direcao.push({ c, restantes, exige })
  }

  // 2) o desvio do Sobe/Desce: anda aos poucos até a folga natural; na saída, do lado certo sem exceção
  let novo = e.desvio
  if (direcao.length) {
    direcao.sort((a, b) => a.restantes - b.restantes)
    let lo = -Infinity, hi = Infinity          // faixa ideal (com a folga natural)
    let loX = -Infinity, hiX = Infinity        // faixa obrigatória (quem sai agora)
    for (const { c, exige } of direcao) {
      const lado = ladoPedido(c)
      const b = c.barreira as number
      const minimo = (c.tipo === 'CALLE' || c.tipo === 'PUTE') ? 0 : pip
      // o mercado já está do lado pedido (só o preço real, sem desvio): não empurra, só não deixa cruzar;
      // do lado errado: leva até a folga natural
      const naturalCerto = lado * (real - b) >= Math.max(pip * 2, sigma * 0.15)
      const folga = naturalCerto ? minimo + pip : c.folga
      const iLo = lado > 0 ? b + folga - real : -Infinity
      const iHi = lado < 0 ? b - folga - real : Infinity
      // duas posições que pedem lados opostos: vale a que sai primeiro
      if (Math.max(lo, iLo) <= Math.min(hi, iHi)) { lo = Math.max(lo, iLo); hi = Math.min(hi, iHi) }
      if (exige) {
        const xLo = lado > 0 ? b + minimo + pip * 0.5 - real : -Infinity
        const xHi = lado < 0 ? b - minimo - pip * 0.5 - real : Infinity
        if (Math.max(loX, xLo) <= Math.min(hiX, xHi)) { loX = Math.max(loX, xLo); hiX = Math.min(hiX, xHi) }
      }
    }
    // o desvio que a gente quer: o menor possível (zero quando o mercado já está indo para o lado pedido)
    const alvo = Math.min(Math.max(0, lo), hi)
    const restantes = Math.max(1, direcao[0].restantes)
    let passo = (alvo - e.desvio) / restantes
    // espera o mercado: enquanto o que falta cabe folgado nos ticks que restam, não mexe (ele costuma
    // corrigir sozinho); quando aperta, anda no tamanho de um tick normal (um pouco sorteado, sem rampa)
    if (Math.abs(passo) < sigma * 0.3 && restantes > 1) passo = 0
    const teto = sigma * (0.55 + 0.5 * rnd())
    if (Math.abs(passo) > teto) passo = Math.sign(passo) * teto
    novo = e.desvio + passo
    // quem sai agora fica do lado certo, custe o passo que custar (raro: o mercado deu um salto no fim)
    novo = Math.min(Math.max(novo, loX), hiX)
  } else if (e.desvio !== 0) {
    // sem contrato no ativo: volta a colar no preço real, aos poucos
    let passo = -e.desvio * (0.22 + 0.12 * rnd())
    const teto = sigma * 0.7
    if (Math.abs(passo) > teto) passo = Math.sign(passo) * teto
    novo = e.desvio + passo
    // uma fração de tick não se vê: cola no real
    if (Math.abs(novo) < Math.max(pip * 0.6, sigma * 0.12)) novo = 0
  }

  let mostrado = r(real + novo, casas)
  // o arredondamento não pode tirar a saída do lado certo
  for (const { c, exige } of direcao) {
    if (!exige) continue
    const certo = ganha(c.tipo, mostrado, c.barreira as number, casas) === (c.desejo === 'ganha')
    if (!certo) mostrado = r(mostrado + ladoPedido(c) * pip, casas)
  }

  // 3) dígitos: só o último dígito do tick de saída, o mais perto do verdadeiro que dá o resultado pedido
  const jaCertos: Acompanhado[] = []
  for (const c of digitosSaindo) {
    const quer = c.desejo === 'ganha'
    jaCertos.push(c)
    if (ganha(c.tipo, mostrado, c.barreira as number, casas) === quer) continue
    const atual = digitoDe(mostrado, casas)
    const opcoes = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
      .filter((d) => ganha(c.tipo, Number((d * pip).toFixed(casas)), c.barreira as number, casas) === quer)
      .map((d) => ({ d, dist: Math.abs(d - atual) + rnd() * 0.5 }))
      .sort((a, b) => a.dist - b.dist)
    for (const { d } of opcoes) {
      const candidato = r(mostrado + (d - atual) * pip, casas)
      // não pode estragar outro contrato que sai neste mesmo tick
      const ok = direcao.every(({ c: o, exige }) => !exige || ganha(o.tipo, candidato, o.barreira as number, casas) === (o.desejo === 'ganha'))
        && jaCertos.every((o) => ganha(o.tipo, candidato, o.barreira as number, casas) === (o.desejo === 'ganha'))
      if (ok) { mostrado = candidato; break }
    }
  }

  // 4) quem entra neste tick: a entrada é o preço que a tela mostra; a folga natural é sorteada agora
  for (const c of entrando) {
    c.entrada = mostrado
    c.barreira = barreiraDe(c.tipo, c.barreiraPedida, mostrado)
    c.total = c.unidade === 't' ? c.duracao : Math.max(1, Math.round((c.expiraEm - t.epoch) / Math.max(1, e.intervalo)))
    // quanto o preço costuma andar nesse prazo: a saída fica a uma distância parecida da barreira
    // (pequena: quando precisa entortar, para pouco além da barreira, como uma saída apertada de verdade)
    c.folga = Math.max(pip * 2, sigma * Math.sqrt(c.total) * (0.08 + 0.32 * rnd()))
  }
  // 5) quem sai neste tick
  for (const c of doAtivo) {
    if (c.entrada === null || entrando.includes(c)) continue
    const porTempo = c.unidade !== 't'
    if ((!porTempo && c.ticks >= c.duracao) || (porTempo && t.epoch >= c.expiraEm)) c.saiu = true
  }
  for (const [id, c] of acompanhados) if (c.saiu && t.epoch - c.compradoEm > 3600) acompanhados.delete(id)

  e.desvio = novo
  e.ultimoEpoch = t.epoch
  e.ultimoReal = real
  e.mostrados.set(t.epoch, mostrado)
  if (e.mostrados.size > LIMITE_MEMORIA) e.mostrados.delete(e.mostrados.keys().next().value as number)
  if (mostrado !== real) {
    e.alterados.push({ epoch: t.epoch, quote: mostrado })
    if (e.alterados.length > LIMITE_MEMORIA) e.alterados.shift()
  }
  return comPreco(t, mostrado)
}

function comPreco(t: Tick, quote: number): Tick {
  if (quote === t.quote) return t
  const d = quote - t.quote
  return { ...t, quote, ...(t.bid !== undefined ? { bid: t.bid + d } : {}), ...(t.ask !== undefined ? { ask: t.ask + d } : {}) }
}

function historico(simbolo: string, ticks: Tick[]): Tick[] {
  const e = estados.get(simbolo)
  if (!e || !e.mostrados.size) return ticks
  return ticks.map((t) => { const q = e.mostrados.get(t.epoch); return q === undefined ? t : comPreco(t, q) })
}

function vela(simbolo: string, granularidade: number, c: Candle, aoVivo: boolean): Candle {
  const e = estados.get(simbolo)
  if (!e || (!e.alterados.length && e.desvio === 0)) return c
  const fim = c.epoch + granularidade
  let { open, high, low, close } = c
  let primeiro: { epoch: number; quote: number } | null = null
  let ultimo: { epoch: number; quote: number } | null = null
  for (const a of e.alterados) {
    if (a.epoch < c.epoch || a.epoch >= fim) continue
    if (!primeiro) primeiro = a
    ultimo = a
    if (a.quote > high) high = a.quote
    if (a.quote < low) low = a.quote
  }
  if (aoVivo) {
    // a vela que está se formando fecha no último preço que a tela mostrou
    if (e.ultimoEpoch >= c.epoch && e.ultimoEpoch < fim) {
      const q = e.mostrados.get(e.ultimoEpoch)
      if (q !== undefined) close = q
    }
  } else if (ultimo && ultimo.epoch >= fim - 2 * Math.max(1, e.intervalo)) close = ultimo.quote
  if (primeiro && primeiro.epoch <= c.epoch + Math.max(1, e.intervalo)) open = primeiro.quote
  high = Math.max(high, open, close)
  low = Math.min(low, open, close)
  return { ...c, open, high, low, close }
}

definirFiltroDaTela({ tick: processar, historico, vela })
export const precoDaTela = processar
