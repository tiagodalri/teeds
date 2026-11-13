/**
 * Cenários da simulação (13/11/2026, Tiago: "eu defino qual I.A., valor da entrada, resultado esperado
 * e tempo da sessão; com base nisso você me dá 4 opções de cenários diferentes para eu selecionar, do
 * mais conservador ao mais agressivo, e eu vejo a prévia das operações como na tela real antes de
 * escolher. Nas I.A. que têm análise tudo precisa ser milimetricamente planejado, não pode ter falha").
 *
 * Cada cenário é uma sessão inteira, operação por operação, com a fita (ganhou/perdeu) gravada no
 * roteiro: a prévia e o play rodam a MESMA fita pelas contas do motor (Caixa), então o que se vê na
 * escolha é exatamente o que vai acontecer.
 *
 * Como uma sessão nasce:
 *  - roda a Caixa (escada, aparos, meta, stop e saldo de verdade) decidindo ganhou/perdeu com a chance
 *    real do contrato de cada I.A., levemente inclinada (no máximo ~2,5x nas chances) para caber no
 *    tempo pedido. Nunca passa disso: um cenário que exigiria mais aparece como inviável, com sugestão;
 *  - a maior sequência de perdas é o que separa os 4 cenários (mais tranquilo → mais arriscado): ela é
 *    colocada no momento pedido e as outras sequências ficam abaixo dela;
 *  - o tempo: nas I.A. que entram direto (Raptor, Falcon, Legacy) cada operação leva 2 ticks (4 s), então
 *    o tempo define a quantidade de operações. Nas que analisam antes de entrar (Gulf, Phenom, loss
 *    virtual) o tempo vira o ritmo da análise: os dígitos dos ticks de espera são escolhidos para a própria
 *    análise da I.A. confirmar a entrada no compasso certo (Ensaio.digitoDoRitmo);
 *  - depois de escolhida, a sessão é conferida de novo na Caixa (correr) e no Ensaio (tempoDaSessao).
 */
import {
  Caixa, chanceDePerder, configDoTrecho, correr, nomeDaIa, parametrosDa, previaDoRoteiro, roteiroEmBranco,
  sementeDe, sorteio, tempoDaSessao, digitosQueGanham, estrategiaDa, SEGUNDOS_POR_TICK,
  type Momento, type PontoDePartida, type Previa, type Roteiro, type Tempo, type Trecho,
} from './sessaoSimulada'
import type { ConfigEstrategia } from '../deriv/engine'
import type { Modo } from '../deriv/strategies'

export interface Pedido {
  ia: string
  modo: Modo
  saldo: number
  conta: 'real' | 'demo'
  entrada: number
  /** Positivo = lucro (a sessão bate a meta); negativo = prejuízo (bate o stop). */
  resultado: number
  minutos: number
  /** Quando vem a maior sequência de perdas (no lucro). */
  momento: Momento
  /** "Sortear outros": a mesma estrutura com outra sessão. */
  semente?: number
}

export interface Cenario {
  nivel: number
  roteiro: Roteiro
  previa: Previa
  tempo: Tempo
  resultado: number
  operacoes: number
  acerto: number
  meta: number
  stop: number
  maiorSequencia: number
  /** Soma das entradas perdidas na maior sequência. */
  perdidoNaSequencia: number
  /** A entrada que fechou a maior sequência (null: a sequência terminou no stop). */
  entradaQueRecuperou: number | null
  maiorEntrada: number
  /** O ponto mais baixo da sessão (resultado acumulado). */
  piorMomento: number
  /** O ponto mais alto antes do fim. */
  melhorMomento: number
  /** O saldo mínimo para a sessão acontecer igual (nenhuma compra recusada). */
  saldoMinimo: number
  saldoFinal: number
}

export type CampoSugerido = 'entrada' | 'minutos' | 'resultado'
export interface Sugestao { campo: CampoSugerido; valor: number }
export interface Resposta {
  cenarios: Cenario[]
  /** Por que não há cenário (ou há menos de 4). */
  problema: string | null
  sugestoes: Sugestao[]
}

const r2 = (x: number) => Math.round(x * 100) / 100
const ENTRADA_MINIMA = 0.35
/** Inclinação máxima das chances (em log-odds): 0,9 ≈ chances 2,5x melhores ou piores que as do contrato. */
const INCLINACAO_MAXIMA = 0.9
const SEGUNDOS_MAXIMOS_POR_OPERACAO = 75
const SEQUENCIA_MAXIMA = 16
const OPERACOES_MAXIMAS = 4000

/** Onde a maior sequência começa, em fração da sessão. */
const FAIXA_DO_MOMENTO: Record<Momento, [number, number]> = { comeco: [0.05, 0.3], meio: [0.3, 0.68], fim: [0.68, 0.95] }

const din = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Arredonda para cima num valor redondo de limite. */
export function redondoAcima(x: number): number {
  const passo = x < 20 ? 1 : x < 100 ? 5 : x < 1000 ? 10 : 50
  return Math.ceil(x / passo - 1e-9) * passo
}

/* ---------------------------------------------------------- o compasso */

interface Compasso {
  direta: boolean
  /** Segundos por operação no ritmo natural (direta: sempre 2 ticks). */
  sNat: number
  /** Dígitos de análise antes de cada entrada nova (loss virtual); 0 nas diretas. */
  L: number
  /** Depois de uma perda segue a sequência sem analisar (família do AG7). */
  segue: boolean
}
const compassos = new Map<string, Compasso>()

/** Quanto tempo cada operação leva nesta I.A.: medido no próprio Ensaio. */
function compassoDa(r: Roteiro): Compasso {
  const chave = JSON.stringify([r.ia, r.modo ?? null, parametrosDa(r.ia)])
  const pronto = compassos.get(chave)
  if (pronto) return pronto
  const q = chanceDePerder(r.ia)
  const rnd = sorteio(sementeDe(`compasso-${r.ia}`))
  const lista: boolean[] = []
  let seq = 0
  for (let i = 0; i < 160; i++) {
    const g = seq >= 6 ? true : rnd() >= (seq === 0 ? q.entrada : q.recuperacao)
    lista.push(g); seq = g ? 0 : seq + 1
  }
  const base: Roteiro = { ...r, saldo: 1e9, ritmo: null, trechos: [{ meta: 0, stop: 0, fim: 'desligou', resultado: 0, operacoes: 160, sequencia: 6, momento: 'meio' }], fita: [lista] }
  const nat = tempoDaSessao(base, [lista])
  const direta = nat.porOperacao <= 4.5
  const params = parametrosDa(r.ia)
  const L = direta ? 0 : Math.max(0, r.lossVirtual ?? params.entrada.lossVirtual ?? 0)
  const c: Compasso = { direta, sNat: nat.porOperacao, L, segue: params.entrada.sequenciaSemAnalise ?? true }
  compassos.set(chave, c)
  return c
}

/* ------------------------------------------------------------ a sessão */

const inclinar = (p: number, tau: number) => {
  const lo = Math.log(p / (1 - p)) - tau
  return 1 / (1 + Math.exp(-lo))
}

interface Sessao {
  lista: boolean[]
  n: number
  tipo: 'meta' | 'stop' | 'outro'
  resultado: number
  maior: number
  pico: number
  vale: number
  /** O stop que nunca apara uma entrada desta sessão. */
  stopNecessario: number
  saldoMinimo: number
  /** Em que operação começou a maior sequência (no lucro). */
  ondeS: number
}

type Forma =
  /** No lucro: a sequência de S perdas começa na operação `inicio` (num começo de ciclo); as outras ficam em até S. */
  | { tipo: 'meta'; S: number; inicio: number }
  /**
   * No prejuízo: a sequência final (a que leva ao stop) tem S perdas e começa quando a sessão passa de
   * `nMin` − S, com o resultado entre `pMin` e `pMax` (o quanto a sessão chegou a subir antes de cair).
   */
  | { tipo: 'stop'; S: number; nMin: number; pMin: number; pMax: number }
  /** Só para medir: sem sequência forçada, as naturais até `teto`. */
  | { tipo: 'livre'; teto: number }

/** As perdas acumuladas da escada saindo da base (sem stop): perdas[j] = j perdas seguidas. */
function perdasDaEscada(r: Roteiro, cfg: ConfigEstrategia): number[] {
  const cx = new Caixa(r.ia, 1e12)
  cx.ligar({ ...cfg, takeProfit: 0, stopLoss: 0 })
  const acc = [0]
  for (let j = 0; j < SEQUENCIA_MAXIMA + 4; j++) {
    const c = cx.comprar()
    if (!c) break
    acc.push(r2(acc[acc.length - 1] + c.valor))
    cx.liquidar(c, false, null)
    if (!cx.rodando) break
  }
  return acc
}

function simular(r: Roteiro, cfg: ConfigEstrategia, q: { entrada: number; recuperacao: number }, rnd: () => number, tau: number,
  forma: Forma, limite: number, escada: number[]): Sessao | null {
  const cx = new Caixa(r.ia, r.saldo)
  cx.ligar(cfg)
  const lista: boolean[] = []
  let seq = 0, maior = 0, n = 0, pico = 0, vale = 0, forcar = 0, deveGanhar = false, feito = false, colapso = false, ondeS = -1
  let stopNecessario = 0, saldoMinimo = 0
  /** No prejuízo: até quantas perdas seguidas cabem antes do stop, medido no começo do ciclo. */
  let cabeNoCiclo = Infinity
  const pe = inclinar(q.entrada, tau), pr = inclinar(q.recuperacao, tau)
  // as outras sequências ficam abaixo da maior: ela é única e vem no momento pedido
  const teto = forma.tipo === 'livre' ? forma.teto : forma.S - 1
  while (cx.rodando && n < limite) {
    // no prejuízo, a sequência final começa num começo de ciclo, quando cabe exatamente em S perdas
    if (forma.tipo === 'stop' && !colapso && seq === 0) {
      const falta = cx.resultado + cfg.stopLoss
      let m = 0
      while (m < escada.length - 1 && escada[m] < falta - 1e-9) m++
      if (escada[m] < falta - 1e-9) return null
      if (m > forma.S || cx.resultado > forma.pMax + 1e-9) return null
      if (m === forma.S && n + forma.S >= forma.nMin && cx.resultado >= forma.pMin - 1e-9) colapso = true
      // antes da queda final, nenhuma sequência encosta no stop: até a entrada que recupera precisa caber
      // inteira (aparada pelo stop ela não recupera, e a sessão afundaria antes da hora)
      cabeNoCiclo = Math.max(0, m - 2)
    }
    const antes = cx.resultado
    const c = cx.comprar()
    if (!c) break
    stopNecessario = Math.max(stopNecessario, r2(c.valor - Math.min(0, antes)))
    saldoMinimo = Math.max(saldoMinimo, r2(c.valor - antes))
    let ganhou: boolean
    if (colapso) ganhou = false
    else if (forcar > 0) { ganhou = false; forcar--; if (forcar === 0) deveGanhar = true }
    else if (deveGanhar) { ganhou = true; deveGanhar = false }
    else if (forma.tipo === 'meta' && !feito && seq === 0 && n >= forma.inicio) {
      feito = true; ganhou = false; forcar = forma.S - 1; ondeS = n
      if (forcar === 0) deveGanhar = true
    } else if (seq >= teto || seq >= cabeNoCiclo) ganhou = true
    else ganhou = rnd() >= (seq === 0 ? pe : pr)
    cx.liquidar(c, ganhou, null)
    lista.push(ganhou)
    n++
    seq = ganhou ? 0 : seq + 1
    if (seq > maior) maior = seq
    if (cx.resultado > pico) pico = cx.resultado
    if (cx.resultado < vale) vale = cx.resultado
  }
  const m = cx.motivo ?? ''
  const tipo = /^meta de lucro/i.test(m) ? 'meta' : /^limite de perda/i.test(m) ? 'stop' : 'outro'
  return { lista, n, tipo, resultado: cx.resultado, maior, pico, vale, stopNecessario, saldoMinimo, ondeS }
}

/** Lucro médio por operação com esta inclinação (sem meta nem stop), para acertar o tempo. */
function lucroPorOperacao(r: Roteiro, cfg: ConfigEstrategia, q: { entrada: number; recuperacao: number }, tau: number, teto: number, ops: number, semente: number): number {
  const livre = { ...r, saldo: 1e12 }
  const sem = { ...cfg, takeProfit: 0, stopLoss: 0 }
  let lucro = 0, feitas = 0
  for (let i = 0; i < 16; i++) {
    const s = simular(livre, sem, q, sorteio(semente + i * 7919), tau, { tipo: 'livre', teto }, ops, [])
    if (!s) continue
    lucro += s.resultado; feitas += s.n
  }
  return feitas ? lucro / feitas : 0
}

/** A inclinação que dá `alvo` de lucro por operação (null: nem no limite). */
function inclinacaoPara(alvo: number, medir: (tau: number) => number): { tau: number; fora: 'acima' | 'abaixo' | null } {
  const lo = medir(-INCLINACAO_MAXIMA), hi = medir(INCLINACAO_MAXIMA)
  if (alvo > hi) return { tau: INCLINACAO_MAXIMA, fora: 'acima' }
  if (alvo < lo) return { tau: -INCLINACAO_MAXIMA, fora: 'abaixo' }
  let a = -INCLINACAO_MAXIMA, b = INCLINACAO_MAXIMA
  for (let i = 0; i < 14; i++) {
    const m = (a + b) / 2
    if (medir(m) < alvo) a = m; else b = m
  }
  return { tau: (a + b) / 2, fora: null }
}

/* ------------------------------------------------------------- o pedido */

export function roteiroDoPedido(p: Pedido): Roteiro {
  return {
    ...roteiroEmBranco(), nome: `${nomeDaIa(p.ia)} · ${p.resultado >= 0 ? '+' : '−'}US$ ${Math.abs(p.resultado)} · ${p.minutos} min`,
    ia: p.ia, modo: p.modo, conta: p.conta, saldo: p.saldo, entrada: Math.max(ENTRADA_MINIMA, r2(p.entrada)),
    lossVirtual: null, valorMaximo: 0, ritmo: null, semente: p.semente ?? 1,
    trechos: [{ meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: p.momento, acerto: null }],
  }
}

/** O que impede o pedido antes de qualquer conta. */
export function conferirPedido(p: Pedido): string | null {
  if (!(p.saldo > 0)) return 'Informe o saldo da conta.'
  if (!(p.entrada >= ENTRADA_MINIMA)) return `A entrada mínima da corretora é ${din(ENTRADA_MINIMA)}.`
  if (p.entrada > p.saldo) return `A entrada (${din(p.entrada)}) é maior que o saldo da conta (${din(p.saldo)}).`
  if (!p.resultado) return 'Informe o resultado esperado.'
  if (p.resultado < 0 && -p.resultado > p.saldo) return `O prejuízo pedido (${din(-p.resultado)}) é maior que o saldo da conta (${din(p.saldo)}).`
  if (!(p.minutos >= 1)) return 'Informe o tempo da sessão.'
  if (p.minutos > 240) return 'O tempo máximo é de 4 horas.'
  return null
}

interface Tentativa { sessao: Sessao; nota: number }

/**
 * Uma sessão com a maior sequência = S, no tempo pedido. `rapida` = menos sorteios (só para testar
 * se o pedido é viável, nas sugestões).
 */
function sessaoCom(p: Pedido, r: Roteiro, S: number, alvo: { n: number; lo: number; hi: number; direta: boolean }, semente: number, rapida = false, faixa: [number, number] = [0, 1]): Sessao | null {
  const q = chanceDePerder(p.ia)
  const lucro = p.resultado > 0
  const t: Trecho = { meta: lucro ? p.resultado : 0, stop: lucro ? p.saldo : -p.resultado, fim: lucro ? 'meta' : 'stop', resultado: 0, operacoes: alvo.n, sequencia: S, momento: p.momento, acerto: null }
  const cfg = configDoTrecho(r, t)
  const escada = perdasDaEscada(r, cfg)
  if (escada.length - 1 < S) return null
  // a inclinação que leva a sessão a durar o pedido
  let ritmoAlvo: number
  let pMin = 0, pMax = Infinity
  if (lucro) ritmoAlvo = p.resultado / alvo.n
  else {
    // o pico antes de cair precisa estar na janela em que a queda leva exatamente S perdas
    const lo = Math.max(0, escada[S - 1] - t.stop), hi = escada[S] - t.stop
    if (hi < 0) return null
    pMin = lo + (hi - lo) * faixa[0]
    pMax = lo + (hi - lo) * faixa[1]
    ritmoAlvo = ((pMin + pMax) / 2) / Math.max(1, alvo.n - S)
  }
  const teto = S - 1
  const ops = Math.min(alvo.n, 600)
  const medir = (tau: number) => lucroPorOperacao(r, cfg, q, tau, teto, ops, semente)
  const inc = inclinacaoPara(ritmoAlvo, medir)
  // longe demais do que a I.A. faz (mesmo inclinando no limite): nem tenta
  if (inc.fora) {
    const limite = medir(inc.tau)
    if (inc.fora === 'acima' ? ritmoAlvo > limite * 2.5 + 1e-6 : ritmoAlvo < limite * 0.4 - 1e-6) return null
  }
  let tau = inc.tau
  const forma: Forma = lucro
    ? { tipo: 'meta', S, inicio: Math.round(alvo.n * (p.momento === 'comeco' ? 0.12 : p.momento === 'meio' ? 0.45 : 0.78)) }
    : { tipo: 'stop', S, nMin: alvo.n, pMin, pMax }
  const limite = Math.min(OPERACOES_MAXIMAS, Math.max(alvo.hi * 2, alvo.n + 60))
  let melhor: Tentativa | null = null
  const rodadas = rapida ? 2 : 5
  const porRodada = rapida ? 40 : 110
  for (let rodada = 0; rodada < rodadas; rodada++) {
    const ns: number[] = []
    for (let i = 0; i < porRodada; i++) {
      const rnd = sorteio(sementeDe(JSON.stringify([p.ia, p.modo, p.entrada, p.resultado, p.minutos, p.saldo, p.momento, S, faixa, semente, rodada, i])))
      const s = simular(r, cfg, q, rnd, tau, forma, limite, escada)
      if (!s) continue
      ns.push(s.n)
      if (s.tipo !== (lucro ? 'meta' : 'stop')) continue
      if (s.maior !== S) continue
      const foraDoTempo = alvo.direta ? Math.abs(s.n - alvo.n) : (s.n < alvo.lo ? alvo.lo - s.n : s.n > alvo.hi ? s.n - alvo.hi : 0) + Math.abs(s.n - alvo.n) * 0.02
      const longe = lucro ? ((s.resultado - p.resultado) / Math.max(ENTRADA_MINIMA, p.entrada)) * 3 : Math.abs(s.resultado - p.resultado) * 10
      // no lucro, a maior sequência no momento pedido (começo, meio ou perto do fim da sessão)
      const onde = lucro && s.ondeS >= 0 ? s.ondeS / s.n : 0.5
      const [a, b] = lucro ? FAIXA_DO_MOMENTO[p.momento] : [0, 1]
      const foraDoMomento = onde < a ? a - onde : onde > b ? onde - b : 0
      const nota = foraDoTempo * 4 + longe + foraDoMomento * 40
      if (!melhor || nota < melhor.nota) melhor = { sessao: s, nota }
    }
    const dentro = melhor && (alvo.direta ? Math.abs(melhor.sessao.n - alvo.n) <= Math.max(1, alvo.n * 0.005) : melhor.sessao.n >= alvo.lo && melhor.sessao.n <= alvo.hi)
    if (dentro && melhor!.nota < 2) break
    // corrige a inclinação pelo tempo que as sessões levaram
    if (ns.length) {
      const med = ns.sort((a, b) => a - b)[Math.floor(ns.length / 2)]
      const passo = 0.12 / (rodada + 1)
      if (lucro) tau = Math.max(-INCLINACAO_MAXIMA, Math.min(INCLINACAO_MAXIMA, tau + (med > alvo.n ? passo : -passo)))
      else tau = Math.max(-INCLINACAO_MAXIMA, Math.min(INCLINACAO_MAXIMA, tau + (med < alvo.n ? -passo : passo)))
    }
  }
  if (!melhor) return null
  const s = melhor.sessao
  // no tempo: direta até 2% (ou 2 operações); com análise, dentro da faixa de ritmo
  if (alvo.direta ? Math.abs(s.n - alvo.n) > Math.max(2, alvo.n * 0.02) : s.n < alvo.lo || s.n > alvo.hi) return null
  if (lucro) {
    const [a, b] = FAIXA_DO_MOMENTO[p.momento]
    const onde = s.ondeS / s.n
    if (onde < a - 0.03 || onde > b + 0.03) return null
  }
  // o ganho que passa da meta: no máximo uma entrada (o resultado fica colado no pedido)
  if (lucro && s.resultado - p.resultado > Math.max(0.6, p.entrada)) return null
  return s
}

function alvoDeOperacoes(p: Pedido, c: Compasso, r: Roteiro): { n: number; lo: number; hi: number; direta: boolean } {
  const T = p.minutos * 60
  const ticks = Math.round(T / SEGUNDOS_POR_TICK)
  // direta: 1 tick para a 1ª compra e 2 por operação (entrada e saída), uma emendada na outra
  if (c.direta) { const n = Math.max(2, Math.round((ticks - 1) / 2)); return { n, lo: n, hi: n, direta: true } }
  // com análise: cada operação 2 ticks + L ticks de análise a cada entrada nova (≈ 40% delas)
  const lo = Math.max(2, Math.ceil(T / SEGUNDOS_MAXIMOS_POR_OPERACAO)), hi = Math.max(lo, Math.floor(ticks / (2 + c.L * 0.45)))
  // o número de operações que a I.A. faria sozinha até o resultado (no prejuízo, o ritmo natural)
  let n = Math.round(T / c.sNat)
  if (p.resultado > 0) {
    const q = chanceDePerder(p.ia)
    const cfg = configDoTrecho(r, { meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' })
    const mu = lucroPorOperacao(r, cfg, q, 0, 8, 400, 99)
    if (mu > 0) n = Math.round(p.resultado / mu)
  }
  return { n: Math.min(hi, Math.max(lo, n)), lo, hi, direta: false }
}

/**
 * A agenda da análise (I.A. com loss virtual): quantos ticks antes de cada entrada nova, somando
 * exatamente o tempo pedido. Cada espera tem pelo menos L ticks (a contagem precisa completar) e o
 * resto se espalha como a espera natural do loss virtual (sorteada com a chance real dos dígitos).
 */
function agendaDaAnalise(c: Compasso, ia: string, lista: boolean[], T: number, semente: number, ajuste = 0): number[] | null {
  const novas = c.segue ? 1 + lista.slice(0, -1).filter(Boolean).length : lista.length
  const ticks = Math.round(T / SEGUNDOS_POR_TICK)
  const total = ticks - 2 * lista.length + ajuste
  const sobra = total - c.L * novas
  if (sobra < 0) return null
  const e = estrategiaDa(ia)
  const pPerde = 1 - digitosQueGanham(e.contractType, e.barreira).length / 10
  const rnd = sorteio(semente)
  const natural: number[] = []
  for (let k = 0; k < novas; k++) {
    // ticks até sair L dígitos seguidos que perderiam, depois de um que ganha
    let t = 0, seguidos = 0
    while (seguidos < c.L && t < 400) { t++; seguidos = rnd() < pPerde ? seguidos + 1 : 0 }
    natural.push(Math.max(0, t - c.L) + rnd() * 0.5)
  }
  const soma = natural.reduce((a, b) => a + b, 0) || 1
  const partes = natural.map((x) => (x / soma) * sobra)
  const inteiras = partes.map(Math.floor)
  let falta = sobra - inteiras.reduce((a, b) => a + b, 0)
  partes.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((a, b) => b.resto - a.resto).forEach(({ i }) => { if (falta > 0) { inteiras[i]++; falta-- } })
  return inteiras.map((x) => c.L + x)
}

interface OpcaoDeRisco { S: number; faixa: [number, number]; chave: number }

/**
 * As opções de risco, da mais tranquila à mais arriscada. No lucro, a maior sequência de perdas (até a
 * que o saldo aguenta). No prejuízo, a sequência que leva ao stop e o quanto a sessão subiu antes de
 * cair (em duas faixas por sequência).
 */
function opcoesDeRisco(p: Pedido, r: Roteiro, alvo: { n: number }): OpcaoDeRisco[] {
  const lista = sequenciasPossiveis(p, r, alvo)
  if (p.resultado > 0) return lista.map((S) => ({ S, faixa: [0, 1], chave: S }))
  const escada = perdasDaEscada(r, configDoTrecho(r, { meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' }))
  return lista.flatMap((S): OpcaoDeRisco[] => {
    const lo = Math.max(0, escada[S - 1] + p.resultado), hi = escada[S] + p.resultado
    // a janela do pico vira até 4 opções (subiu pouco … subiu bem antes de cair), cada uma com pelo
    // menos 20% do prejuízo de largura, para os cenários não saírem iguais
    const partes = Math.max(1, Math.min(4, Math.floor((hi - lo) / Math.max(0.01, -p.resultado * 0.2))))
    return Array.from({ length: partes }, (_, i) => ({ S, faixa: [i / partes, (i + 1) / partes] as [number, number], chave: S * 10 + i }))
  })
}

/** As sequências candidatas, da mais curta à mais longa que o saldo e a I.A. aguentam. */
function sequenciasPossiveis(p: Pedido, r: Roteiro, alvo: { n: number }): number[] {
  const lucro = p.resultado > 0
  const t: Trecho = { meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' }
  const escada = perdasDaEscada(r, configDoTrecho(r, t))
  if (!lucro) {
    let Smin = 1
    while (Smin < escada.length - 1 && escada[Smin] < -p.resultado - 1e-9) Smin++
    return Array.from({ length: 9 }, (_, i) => Smin + i).filter((S) => S <= Math.min(SEQUENCIA_MAXIMA, escada.length - 1))
  }
  // até onde a escada cabe no saldo (as perdas e a entrada que recupera)
  let Sfit = 0
  while (Sfit + 1 < escada.length - 1 && escada[Sfit + 2] <= p.saldo * 0.97) Sfit++
  // a sequência que a I.A. costuma ter nesse tamanho de sessão
  const q = chanceDePerder(p.ia)
  const rnd = sorteio(sementeDe(`seq-${p.ia}-${alvo.n}`))
  const maiores: number[] = []
  for (let i = 0; i < 300; i++) {
    let seq = 0, maior = 0
    for (let k = 0; k < alvo.n; k++) { const g = rnd() >= (seq === 0 ? q.entrada : q.recuperacao); seq = g ? 0 : seq + 1; if (seq > maior) maior = seq }
    maiores.push(maior)
  }
  maiores.sort((a, b) => a - b)
  const quantil = (x: number) => maiores[Math.min(maiores.length - 1, Math.floor(x * maiores.length))]
  const lo = Math.max(1, quantil(0.01) - 2), hi = Math.min(SEQUENCIA_MAXIMA, Math.max(lo + 3, quantil(0.98) + 1), Sfit)
  const lista: number[] = []
  for (let S = lo; S <= hi; S++) lista.push(S)
  return lista
}

/** Até 4 valores espalhados de uma lista (o primeiro e o último sempre). */
function espalhar<T>(xs: T[], k = 4): T[] {
  if (xs.length <= k) return xs
  return Array.from({ length: k }, (_, i) => xs[Math.round((i * (xs.length - 1)) / (k - 1))])
}

/** Monta o cenário a partir de uma sessão: limites redondos, conferência na Caixa e no Ensaio. */
function montarCenario(p: Pedido, r: Roteiro, s: Sessao, c: Compasso, partida: PontoDePartida | undefined): Cenario | null {
  const lucro = p.resultado > 0
  const maiorGanho = s.lista.length ? r2(p.entrada * 4) : 0
  const meta = lucro ? p.resultado : redondoAcima(Math.max(s.pico + maiorGanho + p.entrada, p.entrada * 10))
  // o stop de uma sessão de verdade: com folga sobre o que a sessão precisou (nunca apara uma entrada), até o saldo
  const stop = lucro ? Math.min(p.saldo, redondoAcima(Math.max(s.stopNecessario * 1.25, p.resultado * 0.5, p.entrada * 10))) : -p.resultado
  const trecho: Trecho = { meta, stop, fim: lucro ? 'meta' : 'stop', resultado: 0, operacoes: s.n, sequencia: s.maior, momento: p.momento, acerto: null }
  let roteiro: Roteiro = { ...r, trechos: [trecho], fita: [s.lista], ritmo: null }
  // conferência: a mesma sessão com os limites redondos
  const conf = correr(roteiro, [s.lista])
  const fim = conf.trechos[0]
  if (!fim || conf.ops.length !== s.n || fim.tipo !== (lucro ? 'meta' : 'stop') || Math.abs(fim.resultado - s.resultado) > 0.001) return null
  // o tempo: nas I.A. com análise, a agenda que faz a sessão durar exatamente o pedido
  const T = p.minutos * 60
  let tempo = tempoDaSessao(roteiro, [s.lista], partida)
  if (!c.direta) {
    const semente = sementeDe(JSON.stringify(['agenda', p.ia, p.minutos, s.n, p.semente ?? 1]))
    let ajuste = 0
    for (let i = 0; i < 3; i++) {
      const agenda = agendaDaAnalise(c, p.ia, s.lista, T, semente, ajuste)
      if (!agenda) return null
      roteiro = { ...roteiro, ritmo: Math.round((T / s.n) * 100) / 100, esperas: [agenda] }
      tempo = tempoDaSessao(roteiro, [s.lista], partida)
      const d = Math.round((T - tempo.segundos) / SEGUNDOS_POR_TICK)
      if (d === 0) break
      ajuste += d
    }
  }
  if (tempo.operacoes !== s.n || Math.abs(tempo.segundos - T) > (c.direta ? 4 : 0)) return null
  const previa = previaDoRoteiro(roteiro)
  const ops = previa.corrida.ops
  // a maior sequência: as entradas perdidas e a que fechou
  const desde = previa.maiorSequencia.desde
  const nS = previa.maiorSequencia.n
  const perdido = r2(ops.slice(desde, desde + nS).reduce((x, o) => x + o.valor, 0))
  const fechou = ops[desde + nS]
  return {
    nivel: 0, roteiro, previa, tempo,
    resultado: previa.resultado, operacoes: ops.length, acerto: ops.length ? Math.round((previa.ganhas / ops.length) * 100) : 0,
    meta, stop, maiorSequencia: nS, perdidoNaSequencia: perdido, entradaQueRecuperou: fechou && fechou.ganhou ? fechou.valor : null,
    maiorEntrada: previa.maiorEntrada, piorMomento: s.vale, melhorMomento: s.pico, saldoMinimo: s.saldoMinimo, saldoFinal: previa.saldoFinal,
  }
}

/** Os cenários do pedido (até 4), do mais tranquilo ao mais arriscado. */
export function montarCenarios(p: Pedido, partida?: PontoDePartida): Resposta {
  const erro = conferirPedido(p)
  if (erro) return { cenarios: [], problema: erro, sugestoes: [] }
  const r = roteiroDoPedido(p)
  const c = compassoDa(r)
  const alvo = alvoDeOperacoes(p, c, r)
  const semente = p.semente ?? 1
  const candidatas = opcoesDeRisco(p, r, alvo)
  const achadas: Array<{ chave: number; s: Sessao }> = []
  // primeiro as espalhadas; as que falharem, as vizinhas
  const espalhadas = espalhar(candidatas)
  const ordem = [...espalhadas, ...candidatas.filter((x) => !espalhadas.includes(x))]
  for (const o of ordem) {
    if (achadas.length >= 4) break
    const s = sessaoCom(p, r, o.S, alvo, semente, false, o.faixa)
    if (s) achadas.push({ chave: o.chave, s })
  }
  achadas.sort((a, b) => a.chave - b.chave)
  const cenarios: Cenario[] = []
  for (const a of achadas) {
    const cen = montarCenario(p, r, a.s, c, partida)
    if (cen) cenarios.push({ ...cen, nivel: cenarios.length })
  }
  if (cenarios.length) {
    const problema = cenarios.length < 4 ? `Com esses números ${cenarios.length === 1 ? 'só um cenário fecha' : `só ${cenarios.length} cenários fecham`}: o saldo, a entrada e o tempo deixam pouca variação de risco.` : null
    return { cenarios, problema, sugestoes: [] }
  }
  return { cenarios: [], ...diagnosticar(p, r, c, alvo) }
}

/* ---------------------------------------------------- quando não fecha */

/** Dá para fazer? (um cenário do meio, com menos sorteios). */
function viavel(p: Pedido): boolean {
  if (conferirPedido(p)) return false
  const r = roteiroDoPedido(p)
  const c = compassoDa(r)
  const alvo = alvoDeOperacoes(p, c, r)
  const cands = opcoesDeRisco(p, r, alvo)
  const meio = espalhar(cands, 3)
  for (const o of [meio[1] ?? meio[0], meio[0], meio[2]].filter((x) => x !== undefined)) {
    if (sessaoCom(p, r, o.S, alvo, 1, true, o.faixa)) return true
  }
  return false
}

const ENTRADAS = [0.35, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 100, 150, 200, 250, 300, 400, 500]
const MINUTOS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 210, 240]

/** O primeiro valor da lista (na ordem de `perto`, o mais próximo primeiro) que fecha. */
function primeiroQueFecha(lista: number[], perto: number, atual: number, ok: (v: number) => boolean, max = 7): number | null {
  const ordem = [...new Set(lista)].filter((v) => v !== atual && v > 0)
    .sort((a, b) => Math.abs(Math.log(a / perto)) - Math.abs(Math.log(b / perto)))
  for (const v of ordem.slice(0, max)) if (ok(v)) return v
  return null
}
const redondo = (x: number) => { const passo = x < 20 ? 1 : x < 100 ? 5 : x < 1000 ? 10 : 50; return Math.max(passo, Math.round(x / passo) * passo) }

function diagnosticar(p: Pedido, r: Roteiro, c: Compasso, alvo: { n: number; lo: number; hi: number }): { problema: string; sugestoes: Sugestao[] } {
  const q = chanceDePerder(p.ia)
  const cfg = configDoTrecho(r, { meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' })
  const lucro = p.resultado > 0
  const nome = nomeDaIa(p.ia)
  const sugestoes: Sugestao[] = []
  let problema: string
  if (lucro) {
    const mu0 = lucroPorOperacao(r, cfg, q, 0, 10, Math.min(alvo.n, 600), 6)
    const muAlto = lucroPorOperacao(r, cfg, q, INCLINACAO_MAXIMA * 0.8, 10, Math.min(alvo.hi, 600), 5)
    const muBaixo = lucroPorOperacao(r, cfg, q, -INCLINACAO_MAXIMA * 0.8, 10, Math.min(alvo.n, 600), 5)
    const maximo = muAlto * alvo.hi, minimo = muBaixo * alvo.lo
    if (p.resultado > maximo) problema = `Em ${p.minutos} min, com entrada de ${din(p.entrada)}, a ${nome} chega a uns ${din(Math.max(0, maximo))} no máximo. ${din(p.resultado)} não cabe nesse tempo.`
    else if (p.resultado < minimo) problema = `Em ${p.minutos} min, com entrada de ${din(p.entrada)}, a ${nome} passa de ${din(p.resultado)} bem antes do fim: a meta seria batida cedo demais.`
    else problema = `Com saldo de ${din(p.saldo)}, a ${nome} não segura a sessão até o fim: para levar ${p.minutos} min até ${din(p.resultado)} ela precisaria de sequências de perda maiores do que o saldo aguenta.`
    if (mu0 > 0) {
      // as contas da média, conferidas uma a uma
      const eEst = p.entrada * (p.resultado / alvo.n) / mu0
      const e = primeiroQueFecha(ENTRADAS.filter((v) => v <= p.saldo), eEst, p.entrada, (v) => viavel({ ...p, entrada: v }))
      if (e !== null) sugestoes.push({ campo: 'entrada', valor: e })
      const segundosPorOp = c.direta ? c.sNat : Math.max(c.sNat, (p.minutos * 60) / alvo.n)
      const tEst = (p.resultado / mu0) * segundosPorOp / 60
      const m = primeiroQueFecha(MINUTOS, tEst, p.minutos, (v) => viavel({ ...p, minutos: v }))
      if (m !== null) sugestoes.push({ campo: 'minutos', valor: m })
      const rEst = mu0 * alvo.n
      const base = redondo(rEst)
      const res = primeiroQueFecha([base, redondo(rEst * 0.85), redondo(rEst * 1.15), redondo(rEst * 0.7), redondo(rEst * 1.3)], rEst, p.resultado, (v) => viavel({ ...p, resultado: v }), 5)
      if (res !== null) sugestoes.push({ campo: 'resultado', valor: res })
    }
  } else {
    problema = `Não fecha uma sessão que termine em −${din(-p.resultado)} em ${p.minutos} min com entrada de ${din(p.entrada)}: antes de cair, a ${nome} subiria mais do que a queda devolve.`
    const e = primeiroQueFecha(ENTRADAS.filter((v) => v <= p.saldo), p.entrada, p.entrada, (v) => viavel({ ...p, entrada: v }), 9)
    if (e !== null) sugestoes.push({ campo: 'entrada', valor: e })
    const m = primeiroQueFecha(MINUTOS, p.minutos, p.minutos, (v) => viavel({ ...p, minutos: v }), 9)
    if (m !== null) sugestoes.push({ campo: 'minutos', valor: m })
    const perdas = [1.5, 2, 3, 0.7, 0.5].map((f) => redondo(-p.resultado * f)).filter((v) => v <= p.saldo)
    const res = primeiroQueFecha(perdas, -p.resultado, -p.resultado, (v) => viavel({ ...p, resultado: -v }), 5)
    if (res !== null) sugestoes.push({ campo: 'resultado', valor: -res })
  }
  return { problema, sugestoes }
}
