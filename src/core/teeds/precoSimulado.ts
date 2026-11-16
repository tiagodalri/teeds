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
 *  - A cor das velas nunca muda (16/11/2026, Tiago: "o resultado tem que bater, mas a cor da vela nunca pode
 *    mudar"): em todos os tempos do gráfico (1m a 1d), o último tick de cada vela fica do mesmo lado da
 *    abertura que o real; a vela que está se formando também, sempre que der.
 *  - O mesmo tick mostra sempre o mesmo preço (gráfico, velas, dígitos, cotação, cabine, posição), e o
 *    histórico baixado depois traz os preços que a tela mostrou.
 * Só a tela vê isto (market.ts › *DaTela): os motores das I.A. de verdade seguem com o preço da Deriv.
 */
import { definirFiltroDaTela, fetchCandles, fetchTickHistory } from '../deriv/market'
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
export function barreiraDe(tipo: string, pedida: string | undefined, entrada: number, casas?: number): number {
  if (TIPOS_DE_DIGITO.includes(tipo)) return Number(pedida ?? 0)
  if (pedida === undefined || pedida === '') return entrada
  const b = /^[+-]/.test(pedida) ? entrada + Number(pedida) : Number(pedida)
  // nas casas do ativo: 1234.81 + 0.25 não vira 1235.0600000000001 (o empate decide errado)
  return casas !== undefined ? Number(b.toFixed(casas)) : b
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
  /** O resultado pedido; "mercado": só acompanha (a entrada e a saída saem daqui, o preço não é mexido). */
  desejo: Desejo | 'mercado'
}

interface Acompanhado extends ContratoPlanejado {
  entrada: number | null
  epochEntrada: number | null
  barreira: number | null
  ticks: number
  /** Ticks que o contrato deve durar (por tempo: estimado pelo ritmo do ativo). */
  total: number
  /** Folga natural da saída para o lado pedido (preço). */
  folga: number
  saiu: boolean
  /** A saída (o preço que a tela mostrou no tick de saída) e o epoch dela. */
  saida: number | null
  epochSaida: number | null
  /** O último tick mostrado depois da entrada (nos por tempo, a saída é o último tick até o vencimento). */
  ultimoVisto: number | null
  ultimoVistoEpoch: number | null
}

/**
 * Onde a operação está, pelas regras da Deriv (conferidas em 16/11/2026 com operações reais do banco e o
 * histórico de ticks da Deriv): a entrada é o 1º tick depois da compra; Comprar/Vender de N ticks sai no
 * N-ésimo tick depois da entrada; dígitos de N ticks contam a entrada como o 1º (o de 1 tick sai na própria
 * entrada); por tempo, a saída é o último tick até o vencimento. A corretora simulada lê daqui (uma fonte
 * só: o tick que a tela ajustou é o mesmo que decide).
 */
export interface SituacaoDoContrato { entrada: number | null; epochEntrada: number | null; barreira: number | null; saida: number | null; epochSaida: number | null; saiu: boolean }
export function situacaoDoContrato(id: number): SituacaoDoContrato | null {
  const c = acompanhados.get(id)
  if (!c) return null
  return { entrada: c.entrada, epochEntrada: c.epochEntrada, barreira: c.barreira, saida: c.saida, epochSaida: c.epochSaida, saiu: c.saiu }
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
  /** Os ticks que passaram aqui, em ordem: epoch, real e mostrado (para as velas baixadas depois). */
  linha: { epoch: number[]; real: number[]; tela: number[] }
  /** Os ticks que a tela mostrou diferentes do real (para velas e histórico baixados depois). */
  alterados: { epoch: number; quote: number }[]
  /** A vela de agora em cada tempo do gráfico: onde começou e a abertura real e a mostrada. */
  velas: Map<number, Vela>
}
interface Vela { inicio: number; abertaReal: number; abertaMostrada: number }

/** Todos os tempos que um gráfico pode mostrar (a cor da vela vale em cada um). */
const TEMPOS_DE_VELA = [60, 120, 180, 300, 600, 900, 1800, 3600, 7200, 14400, 28800, 86400]
const buscando = new Set<string>()
/** A abertura da vela de agora num tempo, pela Deriv (quando o começo dela passou antes de acompanhar). */
function buscarAbertura(simbolo: string, g: number, inicio: number): void {
  const chave = `${simbolo}:${g}:${inicio}`
  if (buscando.has(chave)) return
  buscando.add(chave)
  void fetchCandles(simbolo, g as never, 1).then((vs) => {
    const v = vs[vs.length - 1]
    const e = estados.get(simbolo)
    if (!v || !e || v.epoch !== inicio || e.velas.get(g)?.inicio === inicio) { buscando.delete(chave); return }
    const primeiro = e.alterados.find((a) => a.epoch >= inicio && a.epoch < inicio + g)
    const mostrada = primeiro && primeiro.epoch <= inicio + Math.max(1, e.intervalo) * 1.5 ? primeiro.quote : v.open
    e.velas.set(g, { inicio, abertaReal: v.open, abertaMostrada: mostrada })
  }).catch(() => { buscando.delete(chave) /* tenta de novo no próximo tick dessa vela */ })
}

const estados = new Map<string, EstadoDoAtivo>()
const acompanhados = new Map<number, Acompanhado>()
// ~5 h de ticks de 1 s (números só): numa gravação longa, as velas antigas seguem com o preço que a tela mostrou
const LIMITE_MEMORIA = 20000
let rnd = Math.random

/** Para as provas: um sorteio repetível. */
export function sortearCom(f: () => number): void { rnd = f }

const r = (x: number, casas: number) => Number(x.toFixed(casas))
const pipDe = (casas: number) => Math.pow(10, -casas)

function estadoDe(simbolo: string, casas = 2): EstadoDoAtivo {
  let e = estados.get(simbolo)
  if (!e) {
    e = { desvio: 0, ultimoEpoch: 0, ultimoReal: null, passos: [], intervalo: 2, casas, mostrados: new Map(), linha: { epoch: [], real: [], tela: [] }, alterados: [], velas: new Map() }
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
  // as aberturas das velas de agora (para a cor de cada vela não mudar)
  const agora = Math.floor(Date.now() / 1000)
  for (const g of TEMPOS_DE_VELA) {
    const inicio = Math.floor(agora / g) * g
    if (e.velas.get(g)?.inicio !== inicio) buscarAbertura(c.simbolo, g, inicio)
  }
  // nos dígitos a barreira é o dígito escolhido, já na compra (o de 1 tick sai no tick da entrada)
  const barreira = TIPOS_DE_DIGITO.includes(c.tipo) ? Number(c.barreiraPedida ?? 0) : null
  acompanhados.set(c.id, { ...c, entrada: null, epochEntrada: null, barreira, ticks: 0, total: c.unidade === 't' ? c.duracao : 1, folga: 0, saiu: false, saida: null, epochSaida: null, ultimoVisto: null, ultimoVistoEpoch: null })
  if (e.passos.length < 20) {
    void fetchTickHistory(c.simbolo, 120).then((ts) => {
      if (ts.length < 3) return
      // (o modo pode ter desligado nesse meio-tempo: não recria o estado)
      const est = estados.get(c.simbolo)
      if (!est) return
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
  buscando.clear()
}

/** Quem está na tela perdeu o roteiro (trocou de usuário): as operações abertas seguem pelo mercado. */
export function abandonarPlanos(): void {
  for (const c of acompanhados.values()) c.desejo = 'mercado'
}

/** Para as provas: o desvio de agora. */
export const desvioAgora = (simbolo: string) => estados.get(simbolo)?.desvio ?? 0

/** De que lado da barreira a saída tem que ficar: +1 acima, −1 abaixo. */
function ladoPedido(c: Acompanhado): 1 | -1 {
  // (só chamado nas planejadas: "mercado" não entra nas faixas)
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
  // o tamanho do tick só com ticks seguidos (voltar ao ativo depois de minutos não vira um "tick" gigante)
  if (e.ultimoReal !== null && t.epoch - e.ultimoEpoch <= 3 * Math.max(1, e.intervalo)) e.passos = [...e.passos, real - e.ultimoReal].slice(-80)
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
    const porTempo = c.unidade !== 't'
    const digito = TIPOS_DE_DIGITO.includes(c.tipo)
    const planejado = c.desejo !== 'mercado'
    if (c.entrada === null) {
      if (t.epoch > c.compradoEm) {
        entrando.push(c)
        // dígito de 1 tick: a entrada já é a saída
        if (planejado && digito && !porTempo && c.duracao <= 1) digitosSaindo.push(c)
      }
      continue
    }
    // por tempo, depois do vencimento: a saída foi o tick anterior (passo 5)
    if (porTempo && t.epoch > c.expiraEm) continue
    c.ticks += 1
    const fim = digito ? c.duracao - 1 : c.duracao
    const restantes = porTempo ? Math.max(0, Math.floor((c.expiraEm - t.epoch) / Math.max(1, e.intervalo))) : fim - c.ticks
    // por tempo: qualquer tick perto do vencimento pode ser o último (um tick pode faltar): todos já do lado certo
    const exige = porTempo ? t.epoch >= c.expiraEm - 4 * Math.max(1, e.intervalo) : restantes <= 0
    if (!planejado) continue
    if (digito) { if (!porTempo && restantes <= 0) digitosSaindo.push(c) }
    else direcao.push({ c, restantes, exige })
  }

  // a cor das velas: em cada tempo, o lado da abertura em que o preço real está. No último tick possível de
  // cada vela é obrigatório (a vela fechada tem a cor do real); antes, é a preferência (a vela se formando)
  const novasVelas: { g: number; inicio: number }[] = []
  let corLo = -Infinity, corHi = Infinity, suaveLo = -Infinity, suaveHi = Infinity
  /** As travas de cor que valem neste tick (as de vela fechando), da vela menor para a maior. */
  const travas: { v: Vela; sobe: boolean }[] = []
  for (const g of TEMPOS_DE_VELA) {
    const inicio = Math.floor(t.epoch / g) * g
    const v = e.velas.get(g)
    if (!v || v.inicio !== inicio) {
      // a vela nova começou neste tick (o anterior passou aqui, na vela de antes): a abertura é este tick
      const viuOAnterior = e.ultimoEpoch > 0 ? e.ultimoEpoch < inicio && t.epoch - e.ultimoEpoch <= 3 * Math.max(1, e.intervalo) : t.epoch === inicio
      if (viuOAnterior) novasVelas.push({ g, inicio })
      else { e.velas.delete(g); buscarAbertura(t.symbol, g, inicio) }
      continue
    }
    const sobe = real >= v.abertaReal
    const oLo = sobe ? v.abertaMostrada - real : -Infinity
    const oHi = sobe ? Infinity : v.abertaMostrada - real - pip * 0.5
    const ultimoPossivel = t.epoch + 3.5 * Math.max(1, e.intervalo) >= inicio + g
    // duas velas pedindo lados opostos (abertas em preços diferentes): vale a menor, a que mais aparece
    if (ultimoPossivel) { if (Math.max(corLo, oLo) <= Math.min(corHi, oHi)) { corLo = Math.max(corLo, oLo); corHi = Math.min(corHi, oHi); travas.push({ v, sobe }) } }
    else if (Math.max(suaveLo, oLo) <= Math.min(suaveHi, oHi)) { suaveLo = Math.max(suaveLo, oLo); suaveHi = Math.min(suaveHi, oHi) }
  }
  const dentro = (x: number, a: number, b: number) => Math.min(Math.max(x, a), b)
  const corCerta = (preco: number) => travas.every(({ v, sobe }) => (preco >= v.abertaMostrada) === sobe)

  // 2) o desvio do Sobe/Desce: anda aos poucos até a folga natural; na saída, do lado certo sem exceção
  let novo = e.desvio
  let loX = -Infinity, hiX = Infinity        // faixa obrigatória (quem sai agora)
  if (direcao.length) {
    direcao.sort((a, b) => a.restantes - b.restantes)
    let lo = -Infinity, hi = Infinity          // faixa ideal (com a folga natural)
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
    // a cor das velas entra na faixa ideal quando cabe junto (a vela se formando segue a do real)
    for (const [a, b] of [[corLo, corHi], [suaveLo, suaveHi]]) if (Math.max(lo, a) <= Math.min(hi, b)) { lo = Math.max(lo, a); hi = Math.min(hi, b) }
    // o desvio que a gente quer: o menor possível (zero quando o mercado já está indo para o lado pedido)
    const alvo = Math.min(Math.max(0, lo), hi)
    const restantes = Math.max(1, direcao[0].restantes)
    let passo = (alvo - e.desvio) / restantes
    // espera o mercado: enquanto o que falta cabe folgado nos ticks que restam, não mexe (ele costuma
    // corrigir sozinho); quando aperta, anda no tamanho de um tick normal (um pouco sorteado, sem rampa)
    if (Math.abs(passo) < sigma * 0.3 && restantes > 1) passo = 0
    // (se o que falta não cabe em passos de um tick normal, espalha pelos ticks que restam: sem salto no fim)
    const teto = Math.max(sigma * (0.55 + 0.5 * rnd()), Math.abs(alvo - e.desvio) / restantes)
    if (Math.abs(passo) > teto) passo = Math.sign(passo) * teto
    novo = e.desvio + passo
  } else if (e.desvio !== 0) {
    // sem contrato no ativo: volta a colar no preço real, aos poucos, sem mudar a cor de vela nenhuma (a vela
    // que abriu com o preço desviado segue do lado certo da abertura dela; o resto da volta vem nas próximas)
    let aLo = corLo, aHi = corHi
    if (Math.max(aLo, suaveLo) <= Math.min(aHi, suaveHi)) { aLo = Math.max(aLo, suaveLo); aHi = Math.min(aHi, suaveHi) }
    const alvo = dentro(0, aLo, aHi)
    let passo = (alvo - e.desvio) * (0.22 + 0.12 * rnd())
    const teto = sigma * 0.7
    if (Math.abs(passo) > teto) passo = Math.sign(passo) * teto
    novo = e.desvio + passo
    // uma fração de tick não se vê: cola no real
    if (alvo === 0 && Math.abs(novo) < Math.max(pip * 0.6, sigma * 0.12)) novo = 0
  }
  // a vela se formando: do lado do real, se o passo couber; no último tick da vela: obrigatório
  if (Math.max(suaveLo, corLo) <= Math.min(suaveHi, corHi)) {
    const s2 = dentro(novo, Math.max(suaveLo, corLo), Math.min(suaveHi, corHi))
    if (Math.abs(s2 - novo) <= sigma * 0.6) novo = s2
  }
  // quem sai agora fica do lado certo, custe o passo que custar; a cor da vela que fecha também, quando
  // as duas cabem juntas (o resultado vem primeiro)
  if (Math.max(loX, corLo) <= Math.min(hiX, corHi)) novo = dentro(novo, Math.max(loX, corLo), Math.min(hiX, corHi))
  else novo = dentro(novo, loX, hiX)

  let mostrado = r(real + novo, casas)
  // o arredondamento não pode tirar a saída do lado certo, nem a vela da cor dela
  const saidaCerta = (preco: number) => direcao.every(({ c, exige }) => !exige || ganha(c.tipo, preco, c.barreira as number, casas) === (c.desejo === 'ganha'))
  if (!saidaCerta(mostrado) || !corCerta(mostrado)) {
    const perto = [mostrado + pip, mostrado - pip, mostrado + 2 * pip, mostrado - 2 * pip].map((x) => r(x, casas))
    mostrado = perto.find((x) => saidaCerta(x) && corCerta(x)) ?? (saidaCerta(mostrado) ? mostrado : perto.find((x) => saidaCerta(x)) ?? mostrado)
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
    // não pode estragar outro contrato que sai neste mesmo tick; e, sempre que der, nem a cor da vela
    const candidatos = opcoes.map(({ d }) => r(mostrado + (d - atual) * pip, casas))
      .filter((x) => jaCertos.every((o) => ganha(o.tipo, x, o.barreira as number, casas) === (o.desejo === 'ganha')))
    // o dígito pedido sempre; depois, sem estragar um Comprar/Vender que sai junto; depois, a cor da vela
    const escolhido = candidatos.find((x) => saidaCerta(x) && corCerta(x)) ?? candidatos.find((x) => saidaCerta(x)) ?? candidatos[0]
    if (escolhido !== undefined) mostrado = escolhido
  }

  // 4) quem entra neste tick: a entrada é o preço que a tela mostra; a folga natural é sorteada agora
  for (const c of entrando) {
    c.entrada = mostrado
    c.epochEntrada = t.epoch
    c.barreira = barreiraDe(c.tipo, c.barreiraPedida, mostrado, casas)
    c.total = c.unidade === 't' ? c.duracao : Math.max(1, Math.round((c.expiraEm - t.epoch) / Math.max(1, e.intervalo)))
    // quanto o preço costuma andar nesse prazo: a saída fica a uma distância parecida da barreira
    // (pequena: quando precisa entortar, para pouco além da barreira, como uma saída apertada de verdade)
    c.folga = Math.max(pip * 2, sigma * Math.sqrt(c.total) * (0.08 + 0.32 * rnd()))
  }
  // 5) quem sai neste tick
  const sair = (c: Acompanhado, preco: number | null, epoch: number | null) => { c.saiu = true; c.saida = preco; c.epochSaida = epoch }
  for (const c of doAtivo) {
    if (c.entrada === null) continue
    const porTempo = c.unidade !== 't'
    const digito = TIPOS_DE_DIGITO.includes(c.tipo)
    if (entrando.includes(c)) {
      if (digito && !porTempo && c.duracao <= 1) sair(c, mostrado, t.epoch)
      else { c.ultimoVisto = mostrado; c.ultimoVistoEpoch = t.epoch }
      continue
    }
    if (porTempo) {
      if (t.epoch === c.expiraEm) sair(c, mostrado, t.epoch)
      // passou do vencimento sem um tick nele: a saída é o último até o vencimento
      else if (t.epoch > c.expiraEm) sair(c, c.ultimoVisto, c.ultimoVistoEpoch)
      else { c.ultimoVisto = mostrado; c.ultimoVistoEpoch = t.epoch }
    } else if (c.ticks >= (digito ? c.duracao - 1 : c.duracao)) sair(c, mostrado, t.epoch)
    else { c.ultimoVisto = mostrado; c.ultimoVistoEpoch = t.epoch }
  }
  for (const [id, c] of acompanhados) if (c.saiu && t.epoch - c.compradoEm > 3600) acompanhados.delete(id)

  // as velas que começaram neste tick abrem no preço que a tela mostra
  for (const { g, inicio } of novasVelas) e.velas.set(g, { inicio, abertaReal: real, abertaMostrada: mostrado })

  e.desvio = novo
  e.ultimoEpoch = t.epoch
  e.ultimoReal = real
  e.mostrados.set(t.epoch, mostrado)
  if (e.mostrados.size > LIMITE_MEMORIA) e.mostrados.delete(e.mostrados.keys().next().value as number)
  e.linha.epoch.push(t.epoch); e.linha.real.push(real); e.linha.tela.push(mostrado)
  if (e.linha.epoch.length > LIMITE_MEMORIA) { e.linha.epoch.shift(); e.linha.real.shift(); e.linha.tela.shift() }
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

/** O 1º índice da linha com epoch >= x (busca binária). */
function indiceDe(ep: number[], x: number): number {
  let a = 0, b = ep.length
  while (a < b) { const m = (a + b) >> 1; if (ep[m] < x) a = m + 1; else b = m }
  return a
}

/**
 * A vela com os preços que a tela mostrou: os ticks que passaram aqui dentro dela trocam o real pelo mostrado.
 * Abertura e fechamento exatos quando o 1º e o último tick da vela passaram aqui; máxima e mínima: o extremo da
 * Deriv só vale se não foi de um tick que a tela mostrou diferente (o pavio nunca vai a um preço que não apareceu).
 */
function vela(simbolo: string, granularidade: number, c: Candle & { tickEpoch?: number }, aoVivo: boolean): Candle {
  const e = estados.get(simbolo)
  if (!e || !e.linha.epoch.length) return c
  // a vela ao vivo da Deriv traz o tick que a atualizou: passa pelo filtro (o mesmo preço do canal de ticks)
  if (aoVivo && c.tickEpoch) processar({ symbol: simbolo, epoch: c.tickEpoch, quote: c.close, pipSize: e.casas })
  const { epoch: ep, real, tela } = e.linha
  const fim = c.epoch + granularidade
  const i0 = indiceDe(ep, c.epoch), i1 = indiceDe(ep, fim)
  if (i0 >= i1) return c
  let mexeu = false
  for (let i = i0; i < i1; i++) if (tela[i] !== real[i]) { mexeu = true; break }
  if (!mexeu) return c
  const casas = e.casas, meio = Math.pow(10, -casas) / 2
  const passo = Math.max(1, e.intervalo)
  let { open, high, low, close } = c
  // abertura: o 1º tick da vela passou aqui (ele é o 1º da vela e o preço bate com o da Deriv)
  if (ep[i0] < c.epoch + 1.5 * passo && Math.abs(real[i0] - c.open) < meio) open = tela[i0]
  // fechamento: o último tick que passou aqui é o último da vela (ao vivo: o mais recente; fechada: perto do fim)
  const iu = i1 - 1
  if ((aoVivo || ep[iu] >= fim - 1.5 * passo) && Math.abs(real[iu] - c.close) < meio) close = tela[iu]
  let altoTela = -Infinity, baixoTela = Infinity, altoReal = -Infinity, baixoReal = Infinity
  for (let i = i0; i < i1; i++) {
    if (tela[i] > altoTela) altoTela = tela[i]
    if (tela[i] < baixoTela) baixoTela = tela[i]
    if (real[i] > altoReal) altoReal = real[i]
    if (real[i] < baixoReal) baixoReal = real[i]
  }
  // a máxima da Deriv veio de um tick que passou aqui: vale a máxima mostrada; senão, as duas juntas
  high = Math.abs(c.high - altoReal) < meio ? altoTela : Math.max(c.high, altoTela)
  low = Math.abs(c.low - baixoReal) < meio ? baixoTela : Math.min(c.low, baixoTela)
  high = Math.max(high, open, close)
  low = Math.min(low, open, close)
  return { ...c, open, high, low, close }
}

definirFiltroDaTela({ tick: processar, historico, vela })
export const precoDaTela = processar
