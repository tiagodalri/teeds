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
  /**
   * Loss virtual escolhido (0 = sem, até 12), nas I.A. que entram por loss virtual. Vazio = o publicado
   * no painel. Muda o tempo: a I.A. espera esse tanto de dígitos seguidos que teriam perdido antes de
   * cada entrada nova, então quanto maior, menos operações cabem na sessão.
   */
  lossVirtual?: number | null
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
  /** A sessão tem mais (ou menos) sequências de perda do que a I.A. costuma ter: foi montada para fechar o pedido. */
  trabalhada: boolean
  /** As entradas da maior sequência, na ordem (as perdas e, se houve, a que recuperou no fim). */
  escada: number[]
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
/**
 * Cada I.A. tem a sua conta (13/11/2026, Tiago: "com entrada de 0,50 na Raptor agressiva dá para bater
 * 411 em 45 min, é questão de saber trabalhar os números"; "o acerto deve ser sempre coerente com o
 * perfil do robô"; "faça esse cálculo estratégico para cada uma das I.A., tudo milimetricamente pensado
 * de acordo com a realidade delas").
 *
 * Uma sessão é feita de CICLOS: k perdas seguidas e o ganho que fecha. O que cada ciclo deixa sai da
 * escada de verdade da I.A. e do modo (`ciclosDaEscada`), e é bem diferente de uma para a outra:
 *  - Raptor: o ganho limpo (0 a 8) deixa 6% da entrada; perdeu, recupera no 7-8-9 (paga 192%). No
 *    conservador quem rende é o ciclo de UMA perda (+92%); no agressivo, as sequências fundas (+20% do
 *    que foi recuperado, e a escada cresce 1,6x por degrau);
 *  - Falcon e Legacy: o ganho limpo deixa 56%; a escada cresce 2,85x por degrau (recupera e sobra 10%
 *    da entrada), então o saldo limita a sequência e quem rende é o ganho limpo;
 *  - Gulf e Phenom: o ganho limpo deixa 192%; conservador recupera no zero a zero (+5%), agressivo +20%.
 *
 * O acerto é o do perfil: cada ciclo tem um ganho só, então acerto = 1 ÷ operações por ciclo. O gerador
 * fixa o acerto no do perfil da I.A. (dentro de uma faixa estreita) e escolhe a MISTURA de ciclos
 * (quantos de cada profundidade) que dá o lucro por operação pedido. Entre todas as misturas que fecham,
 * fica a mais parecida com a natural daquela I.A. (a de menor divergência: a natural inclinada pela
 * profundidade e pelo lucro do ciclo). Os limites são exatos: o mínimo e o máximo que qualquer mistura
 * alcança com aquele acerto e aquela maior sequência.
 */
const FAIXA_DO_ACERTO = [0, 0.02, -0.02, 0.04, -0.04, 0.06, -0.06]
/** Uma sessão sorteada fora disto em volta do perfil é descartada. */
const ACERTO_ACEITO = 0.1
/** Divergência (em nats) acima da qual a mistura já não parece a natural da I.A.: o cartão avisa. */
const DIVERGENCIA_HABITUAL = 0.1
const SEQUENCIA_MAXIMA = 20
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
  /**
   * Quantos ticks a I.A. espera, em média, por uma entrada nova no mercado de verdade: o tempo até saírem
   * L dígitos seguidos que teriam perdido (chance q cada um) = (1 − q^L) ÷ (q^L × (1 − q)).
   */
  espera: number
}
const compassos = new Map<string, Compasso>()

/** Quanto tempo cada operação leva nesta I.A.: medido no próprio Ensaio. */
function compassoDa(r: Roteiro): Compasso {
  const chave = JSON.stringify([r.ia, r.modo ?? null, r.lossVirtual ?? null, parametrosDa(r.ia)])
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
  const e = estrategiaDa(r.ia)
  const qd = 1 - digitosQueGanham(e.contractType, e.barreira).length / 10
  const espera = L > 0 ? (1 - Math.pow(qd, L)) / (Math.pow(qd, L) * (1 - qd)) : 0
  const c: Compasso = { direta, sNat: nat.porOperacao, L, segue: params.entrada.sequenciaSemAnalise ?? true, espera }
  compassos.set(chave, c)
  return c
}

/* ------------------------------------------------------------ a sessão */

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
  /** O quanto a mistura de ciclos se afasta da natural da I.A. (0 = a natural). */
  distancia: number
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

/** A mistura de ciclos de uma sessão: p[k] = a parte dos ciclos com k perdas antes do ganho que fecha. */
interface Mistura { p: number[]; distancia: number }

/**
 * O pouso na meta (no lucro): `liq[k]` é o que um ciclo de k perdas deixa e `folga` o quanto o último
 * ganho pode passar da meta. Perto dela, só entram os ciclos que não estouram o pedido.
 */
interface Pouso { liq: number[]; folga: number }

function simular(r: Roteiro, cfg: ConfigEstrategia, mi: Mistura, rnd: () => number,
  forma: Forma, limite: number, escada: number[], pouso: Pouso | null = null): Sessao | null {
  const cx = new Caixa(r.ia, r.saldo)
  cx.ligar(cfg)
  const lista: boolean[] = []
  let seq = 0, maior = 0, n = 0, pico = 0, vale = 0, forcar = 0, deveGanhar = false, feito = false, colapso = false, ondeS = -1
  let stopNecessario = 0, saldoMinimo = 0
  /** No prejuízo: até quantas perdas seguidas cabem antes do stop, medido no começo do ciclo. */
  let cabeNoCiclo = Infinity
  /** Quantas perdas o ciclo em andamento tem antes do ganho (sorteado da mistura no começo do ciclo). */
  let fundo = 0
  // as outras sequências ficam abaixo da maior: ela é única e vem no momento pedido
  const teto = forma.tipo === 'livre' ? forma.teto : forma.S - 1
  /**
   * A profundidade do próximo ciclo, sorteada da mistura (até onde cabe no stop). Perto da meta, um ciclo
   * que estouraria o pedido vira o mais fundo que ainda cabe: a sessão pousa sem se arrastar.
   */
  const sortearFundo = (resultado: number): number => {
    const ate = Math.min(teto, cabeNoCiclo, mi.p.length - 1)
    if (ate <= 0) return 0
    let total = 0
    for (let k = 0; k <= ate; k++) total += mi.p[k]
    let fundo = 0
    if (total > 0) {
      let x = rnd() * total
      fundo = ate
      for (let k = 0; k <= ate; k++) { x -= mi.p[k]; if (x <= 0) { fundo = k; break } }
    }
    if (!pouso || forma.tipo !== 'meta') return fundo
    const cabe = cfg.takeProfit - resultado + pouso.folga
    if (pouso.liq[fundo] <= cabe) return fundo
    // o que mais rende entre os que cabem; se nenhum cabe, o que menos passa
    let melhor = -1, menor = 0
    for (let k = 0; k <= ate; k++) {
      if (pouso.liq[k] <= cabe && (melhor < 0 || pouso.liq[k] > pouso.liq[melhor])) melhor = k
      if (pouso.liq[k] < pouso.liq[menor]) menor = k
    }
    return melhor >= 0 ? melhor : menor
  }
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
    else if (forma.tipo === 'meta' && !feito && seq === 0 && n >= forma.inicio
      && (!pouso || (pouso.liq[forma.S] ?? Infinity) <= cfg.takeProfit - antes + pouso.folga)) {
      feito = true; ganhou = false; forcar = forma.S - 1; ondeS = n
      if (forcar === 0) deveGanhar = true
    } else {
      if (seq === 0) fundo = sortearFundo(antes)
      ganhou = seq >= fundo || seq >= teto || seq >= cabeNoCiclo
    }
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
  return { lista, n, tipo, resultado: cx.resultado, maior, pico, vale, stopNecessario, saldoMinimo, ondeS, distancia: mi.distancia }
}

const textoDaEspera = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace('.', ',')} h`)

/**
 * Quanto a I.A. espera, em média, por uma entrada nova com este loss virtual (segundos, no mercado de
 * verdade): para a tela explicar a escolha. 0 = entra direto.
 */
export function esperaDoLossVirtual(ia: string, lossVirtual: number): number {
  if (lossVirtual <= 0) return 0
  const e = estrategiaDa(ia)
  const q = 1 - digitosQueGanham(e.contractType, e.barreira).length / 10
  return ((1 - Math.pow(q, lossVirtual)) / (Math.pow(q, lossVirtual) * (1 - q))) * SEGUNDOS_POR_TICK
}

/** O acerto natural da I.A.: um ganho por ciclo, e as perdas que as chances do contrato dão em média. */
export function acertoDoPerfil(ia: string): number {
  const q = chanceDePerder(ia)
  return 1 / (1 + q.entrada / (1 - q.recuperacao))
}

/**
 * A mistura natural da I.A.: a chance de o ciclo ter k perdas com as chances do contrato (perder na
 * entrada; continuar perdendo na recuperação), só até `teto` perdas.
 */
function misturaNatural(ia: string, teto: number): Mistura {
  const q = chanceDePerder(ia)
  const p = [1 - q.entrada]
  for (let k = 1; k <= teto; k++) p.push(q.entrada * Math.pow(q.recuperacao, k - 1) * (1 - q.recuperacao))
  const soma = p.reduce((a, b) => a + b, 0)
  return { p: p.map((x) => x / soma), distancia: 0 }
}

/** Lucro médio por operação com esta mistura (sem meta nem stop), medido na Caixa. */
function lucroPorOperacao(r: Roteiro, cfg: ConfigEstrategia, mi: Mistura, teto: number, ops: number, semente: number): number {
  const livre = { ...r, saldo: 1e12 }
  const sem = { ...cfg, takeProfit: 0, stopLoss: 0 }
  let lucro = 0, feitas = 0
  for (let i = 0; i < 16; i++) {
    const s = simular(livre, sem, mi, sorteio(semente + i * 7919), { tipo: 'livre', teto }, ops, [])
    if (!s) continue
    lucro += s.resultado; feitas += s.n
  }
  return feitas ? lucro / feitas : 0
}

/** O que cada ciclo deixa de lucro: m perdas seguidas e o ganho que fecha (a escada de verdade, sem limites). */
function ciclosDaEscada(r: Roteiro, cfg: ConfigEstrategia): number[] {
  const liq: number[] = []
  for (let m = 0; m <= SEQUENCIA_MAXIMA + 1; m++) {
    const cx = new Caixa(r.ia, 1e12)
    cx.ligar({ ...cfg, takeProfit: 0, stopLoss: 0 })
    let cabe = true
    for (let j = 0; j < m && cabe; j++) { const c = cx.comprar(); if (!c) { cabe = false; break } cx.liquidar(c, false, null); if (!cx.rodando) cabe = false }
    const c = cabe ? cx.comprar() : null
    if (!c) break
    cx.liquidar(c, true, null)
    liq.push(cx.resultado)
  }
  return liq
}

/**
 * O mínimo e o máximo de lucro por ciclo que QUALQUER mistura alcança com `m` perdas por ciclo em média
 * (ciclos de 0 a `teto` perdas). É uma conta exata: os extremos são sempre misturas de duas
 * profundidades (o contorno de cima e o de baixo da tabela dos ciclos).
 */
function limitesDaMistura(liq: number[], teto: number, m: number): { min: number; max: number } | null {
  const T = Math.min(teto, liq.length - 1)
  if (m < 0 || m > T) return null
  let min = Infinity, max = -Infinity
  for (let i = 0; i <= T; i++) for (let j = i; j <= T; j++) {
    if (i > m || j < m) continue
    const v = i === j ? liq[i] : liq[i] + ((liq[j] - liq[i]) * (m - i)) / (j - i)
    if (v < min) min = v
    if (v > max) max = v
  }
  return Number.isFinite(min) ? { min, max } : null
}

/**
 * A mistura mais parecida com a natural que tem `m` perdas por ciclo em média e deixa `L` de lucro por
 * ciclo: a natural inclinada pela profundidade (alfa) e pelo lucro do ciclo (beta). É a de menor
 * divergência entre todas as que fecham as duas contas.
 */
function inclinarMistura(nat: number[], liq: number[], teto: number, m: number, L: number): Mistura {
  const T = Math.min(teto, liq.length - 1, nat.length - 1)
  let esc = 1e-9
  for (let k = 0; k <= T; k++) esc = Math.max(esc, Math.abs(liq[k]))
  const logNat = nat.slice(0, T + 1).map((x) => Math.log(Math.max(1e-300, x)))
  const pesos = (alfa: number, beta: number): number[] => {
    const e: number[] = []
    let topo = -Infinity
    for (let k = 0; k <= T; k++) { const v = logNat[k] + alfa * k + (beta * liq[k]) / esc; e.push(v); if (v > topo) topo = v }
    let soma = 0
    const w = e.map((v) => { const x = Math.exp(v - topo); soma += x; return x })
    return w.map((x) => x / soma)
  }
  const media = (p: number[], f: (k: number) => number) => p.reduce((s, x, k) => s + x * f(k), 0)
  const alfaDe = (beta: number): number => {
    let a = -120, b = 120
    for (let i = 0; i < 48; i++) { const meio = (a + b) / 2; if (media(pesos(meio, beta), (k) => k) < m) a = meio; else b = meio }
    return (a + b) / 2
  }
  let a = -800, b = 800
  for (let i = 0; i < 56; i++) {
    const meio = (a + b) / 2
    if (media(pesos(alfaDe(meio), meio), (k) => liq[k]) < L) a = meio; else b = meio
  }
  const beta = (a + b) / 2
  const p = pesos(alfaDe(beta), beta)
  const distancia = p.reduce((s, x, k) => (x > 1e-12 ? s + x * Math.log(x / Math.max(1e-300, nat[k])) : s), 0)
  return { p, distancia }
}

interface Solucao {
  /** A mistura que fecha (null: o lucro pedido fica fora do que o acerto do perfil alcança). */
  mistura: Mistura | null
  /** O mínimo e o máximo de lucro por operação com o acerto do perfil e as sequências até `teto`. */
  min: number
  max: number
}
/**
 * A mistura de ciclos que dá `ritmo` de lucro por operação com o acerto do perfil da I.A. (o exato; se
 * não fechar, o mais próximo dentro da faixa). `null`: com as sequências limitadas a `teto`, o acerto do
 * perfil não existe (sequências rasas demais para aquela I.A.).
 */
function misturaPara(ritmo: number, liq: number[], teto: number, ia: string, soLimites = false, ordem: number[] = FAIXA_DO_ACERTO): Solucao | null {
  const perfil = acertoDoPerfil(ia)
  const T = Math.min(teto, liq.length - 1)
  const nat = misturaNatural(ia, T).p
  let min = Infinity, max = -Infinity
  let achada: Mistura | null = null
  let perto: { m: number; L: number; falta: number } | null = null
  for (const d of ordem) {
    const acerto = perfil + d
    if (acerto <= 0.01 || acerto >= 0.995) continue
    const m = 1 / acerto - 1
    const lim = limitesDaMistura(liq, T, m)
    if (!lim) continue
    const ops = m + 1
    if (lim.min / ops < min) min = lim.min / ops
    if (lim.max / ops > max) max = lim.max / ops
    const L = ritmo * ops
    if (L >= lim.min && L <= lim.max) { if (!achada && !soLimites) achada = inclinarMistura(nat, liq, T, m, L); continue }
    // fora por pouco: fica guardado o ponto mais próximo, um pouco para dentro do limite
    const borda = L < lim.min ? lim.min : lim.max
    const falta = Math.abs(L - borda) / Math.max(1e-9, Math.abs(L))
    if (!perto || falta < perto.falta) perto = { m, L: borda + (L < lim.min ? 1 : -1) * (lim.max - lim.min) * 0.02, falta }
  }
  if (!Number.isFinite(min)) return null
  if (!achada && !soLimites && perto && perto.falta <= 0.1) achada = inclinarMistura(nat, liq, T, perto.m, perto.L)
  return { mistura: achada, min, max }
}

/* ------------------------------------------------------------- o pedido */

export function roteiroDoPedido(p: Pedido): Roteiro {
  return {
    ...roteiroEmBranco(), nome: `${nomeDaIa(p.ia)} · ${p.resultado >= 0 ? '+' : '−'}US$ ${Math.abs(p.resultado)} · ${p.minutos} min`,
    ia: p.ia, modo: p.modo, conta: p.conta, saldo: p.saldo, entrada: Math.max(ENTRADA_MINIMA, r2(p.entrada)),
    lossVirtual: p.lossVirtual ?? null, valorMaximo: 0, ritmo: null, semente: p.semente ?? 1,
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
  if (p.lossVirtual != null && !(Number.isInteger(p.lossVirtual) && p.lossVirtual >= 0 && p.lossVirtual <= 12)) return 'O loss virtual vai de 0 (sem) a 12 dígitos.'
  if (!(p.minutos >= 1)) return 'Informe o tempo da sessão.'
  if (p.minutos > 240) return 'O tempo máximo é de 4 horas.'
  return null
}

interface Tentativa { sessao: Sessao; nota: number }

/**
 * Uma sessão com a maior sequência = S, no tempo pedido. `rapida` = menos sorteios (só para testar
 * se o pedido é viável, nas sugestões).
 */
function sessaoCom(p: Pedido, r: Roteiro, S: number, alvo: { n: number; lo: number; hi: number; direta: boolean }, semente: number, rapida = false, faixa: [number, number] = [0, 1], ordem: number[] = FAIXA_DO_ACERTO): Sessao | null {
  const lucro = p.resultado > 0
  const t: Trecho = { meta: lucro ? p.resultado : 0, stop: lucro ? p.saldo : -p.resultado, fim: lucro ? 'meta' : 'stop', resultado: 0, operacoes: alvo.n, sequencia: S, momento: p.momento, acerto: null }
  const cfg = configDoTrecho(r, t)
  const escada = perdasDaEscada(r, cfg)
  const liq = ciclosDaEscada(r, cfg)
  if (escada.length - 1 < S || liq.length - 1 < S) return null
  // o lucro por operação que leva a sessão a durar o pedido
  let ritmoAlvo: number
  let pMin = 0, pMax = Infinity
  if (lucro) {
    // a maior sequência (e a recuperação dela) já deixa a parte dela; o resto vem das outras operações
    const resto = p.resultado - liq[S]
    if (resto <= 0) return null
    ritmoAlvo = resto / Math.max(1, alvo.n - S - 1)
  } else {
    // o pico antes de cair precisa estar na janela em que a queda leva exatamente S perdas
    const lo = Math.max(0, escada[S - 1] - t.stop), hi = escada[S] - t.stop
    if (hi < 0) return null
    pMin = lo + (hi - lo) * faixa[0]
    pMax = lo + (hi - lo) * faixa[1]
    ritmoAlvo = ((pMin + pMax) / 2) / Math.max(1, alvo.n - S)
  }
  const teto = S - 1
  // nem trabalhando as sequências no limite: esta maior sequência não fecha
  const primeira = misturaPara(ritmoAlvo, liq, teto, p.ia, false, ordem)
  if (!primeira?.mistura) return null
  const perfil = acertoDoPerfil(p.ia)
  /** O acerto da sessão (no prejuízo, sem a queda final: ela é o fim da sessão, não o perfil). */
  const acertoDa = (x: Sessao) => {
    const ate = lucro ? x.n : Math.max(1, x.n - x.maior)
    let g = 0
    for (let i = 0; i < ate; i++) if (x.lista[i]) g++
    return g / ate
  }
  let mistura = primeira.mistura
  let fator = 1
  const forma: Forma = lucro
    ? { tipo: 'meta', S, inicio: Math.round(alvo.n * (p.momento === 'comeco' ? 0.12 : p.momento === 'meio' ? 0.45 : 0.78)) }
    : { tipo: 'stop', S, nMin: alvo.n, pMin, pMax }
  const limite = Math.min(OPERACOES_MAXIMAS, Math.max(alvo.hi * 2, alvo.n + 60))
  // o ganho que passa da meta: no máximo uma entrada (ou meio por cento do pedido)
  const passaAte = Math.max(0.6, p.entrada, p.resultado * 0.005)
  let melhor: Tentativa | null = null
  const rodadas = rapida ? 2 : 6
  const porRodada = rapida ? 40 : 110
  for (let rodada = 0; rodada < rodadas; rodada++) {
    const ns: number[] = []
    let passaram = 0, naoCairam = 0
    for (let i = 0; i < porRodada; i++) {
      const rnd = sorteio(sementeDe(JSON.stringify([p.ia, p.modo, p.lossVirtual ?? null, p.entrada, p.resultado, p.minutos, p.saldo, p.momento, S, faixa, ordem[0], semente, rodada, i])))
      const s = simular(r, cfg, mistura, rnd, forma, limite, escada, lucro ? { liq, folga: passaAte * 0.8 } : null)
      if (!s) { passaram++; continue }
      ns.push(s.n)
      if (s.tipo !== (lucro ? 'meta' : 'stop')) { naoCairam++; continue }
      if (s.maior !== S) continue
      // o acerto no perfil da I.A. (as sessões curtas variam um pouco mais)
      const foraDoPerfil = Math.abs(acertoDa(s) - perfil)
      if (foraDoPerfil > ACERTO_ACEITO + (s.n < 60 ? 0.04 : 0)) continue
      const foraDoTempo = alvo.direta ? Math.abs(s.n - alvo.n) : (s.n < alvo.lo ? alvo.lo - s.n : s.n > alvo.hi ? s.n - alvo.hi : 0) + Math.abs(s.n - alvo.n) * 0.02
      const longe = lucro ? ((s.resultado - p.resultado) / passaAte) * 3 : Math.abs(s.resultado - p.resultado) * 10
      // no lucro, a maior sequência no momento pedido (começo, meio ou perto do fim da sessão)
      const onde = lucro && s.ondeS >= 0 ? s.ondeS / s.n : 0.5
      const [a, b] = lucro ? FAIXA_DO_MOMENTO[p.momento] : [0, 1]
      const foraDoMomento = onde < a ? a - onde : onde > b ? onde - b : 0
      const nota = foraDoTempo * 4 + longe + foraDoMomento * 40 + foraDoPerfil * 20
      if (!melhor || nota < melhor.nota) melhor = { sessao: s, nota }
    }
    const dentro = melhor && (alvo.direta ? Math.abs(melhor.sessao.n - alvo.n) <= Math.max(1, alvo.n * 0.005) : melhor.sessao.n >= alvo.lo && melhor.sessao.n <= alvo.hi)
    if (dentro && melhor!.nota < 2) break
    // corrige o lucro por operação pelo que as sessões fizeram
    if (lucro) {
      if (!ns.length) break
      const med = ns.sort((a, b) => a - b)[Math.floor(ns.length / 2)]
      fator = Math.min(2.5, Math.max(0.4, fator * Math.min(1.5, Math.max(0.67, med / alvo.n))))
    } else {
      // subiu além da janela (ou nunca chegou nela): menos (ou mais) lucro antes da queda
      if (passaram > porRodada * 0.5) fator *= 0.88
      else if (naoCairam > porRodada * 0.5) fator *= 1.12
      else if (!ns.length) break
    }
    mistura = misturaPara(ritmoAlvo * fator, liq, teto, p.ia, false, ordem)?.mistura ?? mistura
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
  if (lucro && s.resultado - p.resultado > passaAte) return null
  return s
}

function alvoDeOperacoes(p: Pedido, c: Compasso, r: Roteiro): { n: number; lo: number; hi: number; direta: boolean } {
  const T = p.minutos * 60
  const ticks = Math.round(T / SEGUNDOS_POR_TICK)
  // direta: 1 tick para a 1ª compra e 2 por operação (entrada e saída), uma emendada na outra
  if (c.direta) { const n = Math.max(2, Math.round((ticks - 1) / 2)); return { n, lo: n, hi: n, direta: true } }
  /*
    Com análise: cada operação leva 2 ticks, e cada entrada nova (uma por ciclo, ou seja, uma a cada
    1 ÷ acerto operações) espera a análise. A espera média da sessão fica perto da real daquele loss
    virtual: entre metade e duas vezes e meia a média do mercado (e nunca menos que os L dígitos).
  */
  const acerto = acertoDoPerfil(p.ia)
  const novasPorOp = c.segue ? acerto : 1
  const hi0 = Math.floor(ticks / (2 + novasPorOp * Math.max(c.L, c.espera * 0.5)))
  const lo = Math.max(2, Math.ceil(ticks / (2 + novasPorOp * Math.max(c.L, c.espera * 2.5)))), hi = Math.max(lo, hi0)
  // o número de operações que a I.A. faria sozinha até o resultado (no prejuízo, o ritmo natural)
  let n = Math.round(T / c.sNat)
  if (p.resultado > 0) {
    const cfg = configDoTrecho(r, { meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' })
    const mu = lucroPorOperacao(r, cfg, misturaNatural(p.ia, 8), 8, 400, 99)
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
  // as que fecham pela conta dos ciclos: com a maior sequência = S, o resto da sessão consegue o que falta?
  const viaveis = sequenciasQueFecham(p, r, alvo.n, Sfit).map((v) => v.S)
  const dentro = viaveis.filter((S) => S >= lo && S <= hi)
  if (dentro.length >= 4) return dentro
  // poucas na faixa habitual da I.A.: entram as mais próximas dela (sequências mais fundas, ou mais rasas)
  const fora = viaveis.filter((S) => S < lo || S > hi).sort((a, b) => Math.min(Math.abs(a - lo), Math.abs(a - hi)) - Math.min(Math.abs(b - lo), Math.abs(b - hi)))
  return [...dentro, ...fora.slice(0, 7 - dentro.length)].sort((a, b) => a - b)
}

/** No lucro: para cada maior sequência que cabe no saldo, o mínimo e o máximo que a sessão alcança em `n` operações. */
function sequenciasQueFecham(p: Pedido, r: Roteiro, n: number, Sfit: number, todas = false): Array<{ S: number; min: number; max: number }> {
  const cfg = configDoTrecho(r, { meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' })
  const liq = ciclosDaEscada(r, cfg)
  const lista: Array<{ S: number; min: number; max: number }> = []
  for (let S = 1; S <= Math.min(SEQUENCIA_MAXIMA, Sfit, liq.length - 1); S++) {
    const resto = p.resultado - liq[S]
    const ops = Math.max(1, n - S - 1)
    const sol = misturaPara(resto / ops, liq, S - 1, p.ia, true)
    if (!sol) continue
    const min = liq[S] + sol.min * ops, max = liq[S] + sol.max * ops
    if (todas || (resto > 0 && p.resultado <= max * 1.05 && p.resultado >= min * 0.95)) lista.push({ S, min, max })
  }
  return lista
}

/** Até onde a escada cabe no saldo (as perdas e a entrada que recupera). */
function sequenciaQueCabe(p: Pedido, r: Roteiro): number {
  const escada = perdasDaEscada(r, configDoTrecho(r, { meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' }))
  let Sfit = 0
  while (Sfit + 1 < escada.length - 1 && escada[Sfit + 2] <= p.saldo * 0.97) Sfit++
  return Sfit
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
    const semente = sementeDe(JSON.stringify(['agenda', p.ia, p.lossVirtual ?? null, p.minutos, s.n, p.semente ?? 1]))
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
    trabalhada: s.distancia > DIVERGENCIA_HABITUAL,
    escada: ops.slice(desde, desde + nS + (fechou && fechou.ganhou ? 1 : 0)).map((o) => o.valor),
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
    // não fechou com estes sorteios: mais uma leva antes de desistir desta opção
    const s = sessaoCom(p, r, o.S, alvo, semente, false, o.faixa) ?? sessaoCom(p, r, o.S, alvo, semente + 7919, false, o.faixa)
    if (s) achadas.push({ chave: o.chave, s })
  }
  /*
    Menos de 4 maiores sequências fecham (na Falcon e na Legacy a escada cresce 2,85x por degrau e poucas
    cabem no saldo): as opções que faltam são a mesma maior sequência com outro jeito de chegar lá, mais
    sequências rasas (acerto um pouco abaixo do perfil) ou menos sequências, mais fundas (um pouco acima).
  */
  if (p.resultado > 0 && achadas.length > 0 && achadas.length < 4) {
    const acertoDe = (x: Sessao) => x.lista.filter(Boolean).length / x.n
    const bases = [...achadas].sort((a, b) => a.chave - b.chave)
    for (const [ordemDoAcerto, lado] of [[[-0.05, -0.03, -0.06], 0.3], [[0.05, 0.03, 0.06], 0.6]] as Array<[number[], number]>) {
      for (const base of bases) {
        if (achadas.length >= 4) break
        const s = sessaoCom(p, r, base.s.maior, alvo, semente, false, [0, 1], ordemDoAcerto)
        // só entra se for outra sessão de verdade: o acerto ou o pior momento mudam
        if (!s) continue
        const mesma = achadas.filter((a) => a.s.maior === s.maior)
        if (mesma.some((a) => Math.abs(acertoDe(a.s) - acertoDe(s)) < 0.03 && Math.abs(a.s.vale - s.vale) < Math.max(p.entrada * 1.5, Math.abs(a.s.vale) * 0.3))) continue
        achadas.push({ chave: base.chave + lado, s })
      }
    }
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
  const cfg = configDoTrecho(r, { meta: 0, stop: 0, fim: 'meta', resultado: 0, operacoes: 0, sequencia: 0, momento: 'meio' })
  const lucro = p.resultado > 0
  const nome = nomeDaIa(p.ia)
  const sugestoes: Sugestao[] = []
  let problema: string
  if (lucro) {
    // o que dá para alcançar trabalhando as sequências até onde o saldo aguenta
    const faixa = faixaDoLucro(p)
    const maximo = faixa?.max ?? 0, minimo = faixa?.min ?? Infinity
    const mu0 = lucroPorOperacao(r, cfg, misturaNatural(p.ia, 10), 10, Math.min(alvo.n, 600), 6)
    let eEst: number, tEst: number, rEst: number
    if (p.resultado > maximo) {
      problema = `Em ${p.minutos} min, com entrada de ${din(p.entrada)} e saldo de ${din(p.saldo)}, a ${nome} chega a uns ${din(Math.max(0, maximo))} no máximo, com o acerto do perfil dela (cerca de ${Math.round(acertoDoPerfil(p.ia) * 100)}%) e as sequências de perda mais fundas que o saldo aguenta. ${din(p.resultado)} não cabe nesse tempo.`
      const folga = Math.max(0.01, maximo * 0.6)
      eEst = p.entrada * (p.resultado / folga); tEst = p.minutos * (p.resultado / folga); rEst = folga
    } else if (p.resultado < minimo) {
      problema = `Em ${p.minutos} min, com entrada de ${din(p.entrada)}, a ${nome} faz pelo menos uns ${din(minimo)} com o acerto do perfil dela (cerca de ${Math.round(acertoDoPerfil(p.ia) * 100)}%). Uma meta de ${din(p.resultado)} seria batida bem antes do fim.`
      const folga = minimo * 1.5
      eEst = p.entrada * (p.resultado / folga); tEst = p.minutos * (p.resultado / folga); rEst = folga
    } else {
      problema = `Com saldo de ${din(p.saldo)}, entrada de ${din(p.entrada)} e ${p.minutos} min, a ${nome} alcança de ${din(Math.max(0, minimo))} a ${din(maximo)}, mas ${din(p.resultado)} fica num ponto que nenhuma sessão fechou no tempo exato.`
      const natural = Math.max(0.01, mu0 * alvo.n)
      eEst = p.entrada * (p.resultado / natural); tEst = p.minutos * (p.resultado / natural); rEst = natural
    }
    // com loss virtual, o tempo limita as operações: a pessoa precisa saber disso para ajustar
    if (!c.direta && c.L > 0) problema += ` Com loss virtual de ${c.L} ${c.L === 1 ? 'dígito' : 'dígitos'}, a ${nome} espera em média ${textoDaEspera(c.espera * SEGUNDOS_POR_TICK)} por entrada nova: cabem de ${alvo.lo} a ${alvo.hi} operações nesse tempo.`
    const e = primeiroQueFecha(ENTRADAS.filter((v) => v <= p.saldo), eEst, p.entrada, (v) => viavel({ ...p, entrada: v }))
    if (e !== null) sugestoes.push({ campo: 'entrada', valor: e })
    const m = primeiroQueFecha(MINUTOS, tEst, p.minutos, (v) => viavel({ ...p, minutos: v }))
    if (m !== null) sugestoes.push({ campo: 'minutos', valor: m })
    const res = primeiroQueFecha([redondo(rEst), redondo(rEst * 0.85), redondo(rEst * 1.15), redondo(rEst * 0.7), redondo(rEst * 1.3)], rEst, p.resultado, (v) => viavel({ ...p, resultado: v }), 5)
    if (res !== null) sugestoes.push({ campo: 'resultado', valor: res })
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

/**
 * O que a I.A. alcança de lucro com este saldo, esta entrada e este tempo, com o acerto do perfil dela
 * (a menor e a maior sessão que alguma mistura de ciclos fecha). `null`: nenhuma sequência cabe no saldo.
 */
export function faixaDoLucro(p: Pedido): { min: number; max: number } | null {
  const r = roteiroDoPedido(p)
  const alvo = alvoDeOperacoes(p, compassoDa(r), r)
  const Sfit = sequenciaQueCabe(p, r)
  const alto = sequenciasQueFecham(p, r, alvo.hi, Sfit, true), baixo = sequenciasQueFecham(p, r, alvo.lo, Sfit, true)
  if (!alto.length || !baixo.length) return null
  return { min: baixo.reduce((m, v) => Math.min(m, v.min), Infinity), max: alto.reduce((m, v) => Math.max(m, v.max), 0) }
}

/* ------------------------------------------------- o termômetro do risco */

/**
 * Um nível do termômetro (13/11/2026, Tiago: "quero um termômetro para arrastar a bolinha e definir o
 * quanto a operação é conservadora ou agressiva; conforme eu movo, o prejuízo acumulado e as maiores
 * entradas vão se adaptando, até o ponto que eu ache ideal"). Cada nível é uma maior sequência de perdas
 * que fecha o pedido: do menor risco que fecha até o que o saldo aguenta.
 */
export interface NivelDeRisco {
  /** Ordena os níveis (do mais tranquilo ao mais arriscado). */
  chave: number
  S: number
  faixa: [number, number]
  /** Variação da mesma sequência (acerto um pouco abaixo ou acima do perfil), quando poucas cabem no saldo. */
  ordem: number[] | null
}

/** Todos os níveis de risco que fecham o pedido pela conta dos ciclos (a sessão de cada um sai em `cenarioDoNivel`). */
export function niveisDeRisco(p: Pedido): NivelDeRisco[] {
  if (conferirPedido(p)) return []
  const r = roteiroDoPedido(p)
  const alvo = alvoDeOperacoes(p, compassoDa(r), r)
  if (p.resultado < 0) return opcoesDeRisco(p, r, alvo).map((o) => ({ chave: o.chave, S: o.S, faixa: o.faixa, ordem: null }))
  const viaveis = sequenciasQueFecham(p, r, alvo.n, sequenciaQueCabe(p, r)).map((v) => v.S)
  const niveis: NivelDeRisco[] = viaveis.map((S) => ({ chave: S, S, faixa: [0, 1], ordem: null }))
  // poucas sequências fecham (ou cabem no saldo): entre uma e outra, a mesma sequência com mais ciclos rasos
  // ou menos e mais fundos. O termômetro ganha marcas finas: muda o pior momento e o saldo exigido.
  if (niveis.length < 6) {
    for (const S of viaveis) {
      niveis.push({ chave: S + 0.3, S, faixa: [0, 1], ordem: [-0.05, -0.03, -0.06] })
      niveis.push({ chave: S + 0.6, S, faixa: [0, 1], ordem: [0.05, 0.03, 0.06] })
    }
  }
  return niveis.sort((a, b) => a.chave - b.chave)
}

/** A sessão de um nível, conferida (ou `null` se nenhuma fechou no tempo exato com o acerto do perfil). */
export function cenarioDoNivel(p: Pedido, nivel: NivelDeRisco, partida?: PontoDePartida): Cenario | null {
  const r = roteiroDoPedido(p)
  const c = compassoDa(r)
  const alvo = alvoDeOperacoes(p, c, r)
  const semente = p.semente ?? 1
  const ordem = nivel.ordem ?? FAIXA_DO_ACERTO
  const s = sessaoCom(p, r, nivel.S, alvo, semente, false, nivel.faixa, ordem) ?? sessaoCom(p, r, nivel.S, alvo, semente + 7919, false, nivel.faixa, ordem)
  return s ? montarCenario(p, r, s, c, partida) : null
}

/** Por que nenhum nível fecha, com os ajustes mais próximos que fecham (conferidos). */
export function diagnosticoDoPedido(p: Pedido): { problema: string; sugestoes: Sugestao[] } {
  const erro = conferirPedido(p)
  if (erro) return { problema: erro, sugestoes: [] }
  const r = roteiroDoPedido(p)
  const c = compassoDa(r)
  return diagnosticar(p, r, c, alvoDeOperacoes(p, c, r))
}
