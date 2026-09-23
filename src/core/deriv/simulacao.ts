/**
 * O simulador do painel de controle: o que uma regra faz ANTES de ser
 * publicada.
 *
 * Três perguntas, três funções, nenhuma com conta própria:
 *  - `simularEscada`: a escada que o motor subiria com esta regra, aparada
 *    no stop de referência, e o que ela vale para a casa (markup) e para o
 *    cliente numa sequência. Chama `escadaDoRobo`/`avaliarPlano` — os
 *    mesmos números da cabine, centavo a centavo.
 *  - `cadenciaTeorica`: quanto o loss virtual faz o robô esperar. Cartão
 *    separado da escada de propósito: "mais loss virtual" não pode parecer
 *    "mais markup".
 *  - `monteCarlo`: mil sessões hipotéticas com dígitos sorteados, seguindo
 *    a regra tick a tick (entrada por loss virtual, sequência sem análise,
 *    recuperação pela própria estratégia, aparos do motor). A semente é
 *    fixa: as MESMAS sessões para "hoje" e "novo", assim a diferença é só
 *    da regra e o número não dança enquanto o admin digita.
 *
 * Tudo puro: sem React, sem Date, sem Math.random. Dígitos sorteados ao
 * acaso não preveem o mercado — isto mostra o efeito da regra, não o
 * resultado do cliente. A conferência oficial é sempre a da Deriv.
 */
import { avisos, chanceDoContrato, configDeReferencia, digitosQueGanham, esperaMediaEmTicks, type ParametrosDoRobo } from './parametros'
import { ENTRADA_MINIMA, PAGAMENTO_POR_DOLAR, avaliarPlano, chanceDaSequencia, chanceDeAcerto, escadaDoRobo, markupDaEscada, type Degrau, type MarkupDaEscada, type PlanoAvaliado } from './escada'
import { proximaEntrada, proximaEntradaPalm, tetoEfetivo } from './recuperacao'
import { ESTRATEGIAS_LOCAIS, type Modo } from './strategies'
import { TAXA_MARKUP } from './taxaMarkup'

export interface Cenario { id: string; parametros: ParametrosDoRobo; base: number; stopLoss: number; takeProfit: number; maxOperacoes?: number; modo?: Modo; demo?: boolean; taxaMarkup?: number }
export interface EscadaSimulada { degraus: Degrau[]; plano: PlanoAvaliado; markup: MarkupDaEscada; markupEsperadoPorSequencia: number; resultadoEsperadoCliente: number; chanceDeFurarOStop: number; avisos: string[] }
export interface Cadencia { esperaTicks: number; esperaSegundos: number; opsPorSequencia: number; opsPorHora: number }
export interface ResultadoMonteCarlo { sessoes: number; pMeta: number; pStop: number; pParou: number; resultadoMedio: number; resultadoMediano: number; markupMedio: number; markupPorHora: number; operacoesMedias: number; maiorEntradaMedia: number; histograma: Array<{ de: number; ate: number; n: number }> }
export interface CartaoDePerdaMaxima { base: number; stop: number; custoMaximo: number; errosSeguidos: number; maiorEntrada: number; chanceDaSequencia: number; paraAntesDoStop: boolean }

/** R_75 tica a cada ~2 s (config.ts é R_75, não o índice de 1 s). */
const SEGUNDOS_POR_TICK = 2
/** Latência média entre o sinal e a compra, medida no motor. */
const LATENCIA_SEGUNDOS = 0.3
/** Uma sessão que não fecha em 5.000 ticks (~2h50) conta como "parou". */
const LIMITE_DE_TICKS = 5000
/** Faixas do histograma do resultado por sessão. */
const FAIXAS = 12

const centavos = (v: number) => Math.round(v * 100 + 1e-6) / 100
const quatroCasas = (v: number) => Math.round(v * 10000) / 10000
const usd = (v: number) => `US$ ${v.toFixed(2).replace('.', ',')}`

/** Conta demo não gera markup; fora dela, a taxa do cenário ou os 3% da app. */
const taxaDe = (c: Cenario) => (c.demo ? 0 : c.taxaMarkup ?? TAXA_MARKUP)

/**
 * O pagamento por dólar de um contrato, pela chance de acerto: é a mesma
 * tabela medida de escada.ts, só que escolhida pela chance (3 dígitos em
 * 10 → 2,9225 etc.). Nesta versão o contrato é fixo por robô, então os
 * quatro pontos cobrem todos.
 */
function pagamentoPorChance(chance: number): number {
  if (chance <= 0.3) return PAGAMENTO_POR_DOLAR.tresDigitos
  if (chance <= 0.5) return PAGAMENTO_POR_DOLAR.cincoDigitos
  if (chance <= 0.6) return PAGAMENTO_POR_DOLAR.seisDigitos
  return PAGAMENTO_POR_DOLAR.noveDigitos
}

/** O que decide um tick: com quais dígitos ganha e quanto paga. */
interface Fase { ganha: (d: number) => boolean; chance: number; porDolar: number }

/**
 * As fases do robô. Os robôs de dígito compram o mesmo contrato na base e
 * na recuperação; o The Palm alterna: Under 9 na base (9 em 10, paga
 * pouco) e Under 5 na recuperação (5 em 10) — como a escada de escada.ts.
 */
function fasesDo(c: Cenario): { base: Fase; recuperacao: Fase } {
  const ganham = digitosQueGanham(c.parametros.contrato)
  const base: Fase = { ganha: (d) => ganham.includes(d), chance: chanceDoContrato(c.parametros.contrato), porDolar: pagamentoPorChance(chanceDeAcerto(c.id)) }
  if (c.id !== 'thepalm') return { base, recuperacao: base }
  const chanceRecuperacao = 1 - chanceDaSequencia(c.id, 2) / chanceDaSequencia(c.id, 1)
  return { base, recuperacao: { ganha: (d) => d < 5, chance: chanceRecuperacao, porDolar: pagamentoPorChance(chanceRecuperacao) } }
}

/** O loss virtual não se aplica ao The Palm (ele tem a própria análise de 25 dígitos). */
const lossVirtualDe = (c: Cenario) => (c.id === 'thepalm' ? 0 : c.parametros.entrada.lossVirtual)

/* ------------------------------------------------------------------ *
 * Escada: por degrau e por sequência.
 * ------------------------------------------------------------------ */

export function simularEscada(c: Cenario): EscadaSimulada {
  const modo = c.modo ?? 'conservador'
  const taxa = taxaDe(c)
  const degraus = escadaDoRobo(c.id, c.base, 60, modo, c.parametros)
  const plano = avaliarPlano(c.id, c.base, c.stopLoss, modo, c.parametros)
  // Os degraus vêm com o markup a 3%; a taxa do cenário só reescala (0 no demo).
  const fator = taxa / TAXA_MARKUP
  const bruto = markupDaEscada(c.id, degraus)
  const markup: MarkupDaEscada = {
    porDegrau: bruto.porDegrau.map((m) => quatroCasas(m * fator)),
    sequencia: quatroCasas(bruto.sequencia * fator),
    esperado: quatroCasas(bruto.esperado * fator),
  }
  const n = plano.errosSeguidos
  // Por sequência: cada degrau que cabe pesa pela chance de a sequência
  // chegar até ele; o degrau N+1 é a entrada aparada, se houver.
  let markupEsperado = 0
  let resultadoEsperado = 0
  plano.cabem.forEach((d, i) => {
    const chegar = chanceDaSequencia(c.id, i)
    const fechar = chegar - chanceDaSequencia(c.id, i + 1)
    const perdidoAntes = i === 0 ? 0 : plano.cabem[i - 1].perdido
    markupEsperado += chegar * d.pagamento * taxa
    resultadoEsperado += fechar * (d.lucro - perdidoAntes)
  })
  const chanceDeFurarOStop = chanceDaSequencia(c.id, n)
  if (plano.entradaAparada !== null && plano.proximo) {
    const porDolar = plano.proximo.pagamento / plano.proximo.valor
    markupEsperado += chanceDeFurarOStop * centavos(plano.entradaAparada * porDolar) * taxa
  }
  resultadoEsperado -= chanceDeFurarOStop * plano.custoMaximo

  const lista = avisos(c.parametros, c.id, degraus)
  if (plano.paraAntesDoStop) {
    lista.push(`Com "parar" depois do último degrau, o robô vai desligar antes do stop do cliente: a tabela acaba com ${n} ${n === 1 ? 'perda seguida' : 'perdas seguidas'} (${usd(plano.custo)} perdidos) e o stop de referência é ${usd(c.stopLoss)}.`)
  }
  if (n === 0 && !plano.paraAntesDoStop) {
    lista.push(`A entrada base (${usd(c.base)}) já passa do stop de referência (${usd(c.stopLoss)}): a primeira entrada sai aparada.`)
  }
  return {
    degraus, plano, markup,
    markupEsperadoPorSequencia: quatroCasas(markupEsperado),
    resultadoEsperadoCliente: quatroCasas(resultadoEsperado),
    chanceDeFurarOStop,
    avisos: lista,
  }
}

/* ------------------------------------------------------------------ *
 * Cadência: o efeito do loss virtual, separado da escada.
 * ------------------------------------------------------------------ */

export function cadenciaTeorica(c: Cenario): Cadencia {
  const p = chanceDoContrato(c.parametros.contrato)
  const esperaTicks = esperaMediaEmTicks(lossVirtualDe(c), p)
  const opsPorSequencia = 1 / p
  // Com a sequência sem análise, a espera é paga uma vez por sequência;
  // sem ela, cada entrada exige o loss virtual inteiro de novo.
  const esperaPorOperacao = c.parametros.entrada.sequenciaSemAnalise ? esperaTicks / opsPorSequencia : esperaTicks
  const opsPorHora = Number.isFinite(esperaPorOperacao)
    ? 3600 / (SEGUNDOS_POR_TICK * (esperaPorOperacao + 1) + LATENCIA_SEGUNDOS)
    : 0
  return { esperaTicks, esperaSegundos: esperaTicks * SEGUNDOS_POR_TICK, opsPorSequencia, opsPorHora }
}

/* ------------------------------------------------------------------ *
 * Monte Carlo: sessões hipotéticas, tick a tick.
 * ------------------------------------------------------------------ */

/** PRNG mulberry32: rápido, determinístico, bom o bastante para dígitos 0–9. */
function mulberry32(semente: number): () => number {
  let a = semente >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Cada sessão tem a própria semente derivada da principal: a sessão k vê
 * os mesmos dígitos em "hoje" e em "novo" mesmo que uma regra consuma
 * mais ticks que a outra.
 */
const sementeDaSessao = (semente: number, k: number) =>
  (Math.imul(semente ^ 0x85ebca6b, 0x27d4eb2f) + Math.imul(k + 1, 0x9e3779b1)) >>> 0

interface SessaoSimulada { fim: 'meta' | 'stop' | 'parou'; resultado: number; operacoes: number; markup: number; maiorEntrada: number }

function simularSessao(c: Cenario, rnd: () => number): SessaoSimulada {
  const modo = c.modo ?? 'conservador'
  const config = configDeReferencia(c.parametros, c.base, modo)
  // A conta da próxima entrada é a da própria estratégia (a mesma que o
  // motor roda); sem estratégia local, a fórmula de recuperacao.ts.
  const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === c.id)
  const proximo = estrategia ? estrategia.proximoValor : (c.id === 'thepalm' ? proximaEntradaPalm : proximaEntrada)
  const fases = fasesDo(c)
  const teto = tetoEfetivo(config)
  const taxa = taxaDe(c)
  const lossVirtual = lossVirtualDe(c)
  const segue = c.parametros.entrada.sequenciaSemAnalise
  const maxOperacoes = c.maxOperacoes ?? 0
  const memoria: Record<string, unknown> = {}

  let resultado = 0, operacoes = 0, markup = 0, maiorEntrada = 0
  let perdasSeguidas = 0, prejuizo = 0, retorno = 1
  let valorAtual = c.base
  let contagem = 0        // dígitos seguidos que teriam perdido (o loss virtual)
  // `null as` para o TypeScript não travar o tipo em null: quem abre é `comprar()`, no fluxo do laço.
  let aberto = null as { valor: number; fase: Fase; pagamento: number } | null

  const fecharCom = (fim: SessaoSimulada['fim']): SessaoSimulada => ({ fim, resultado: centavos(resultado), operacoes, markup: quatroCasas(markup), maiorEntrada })

  // Os mesmos aparos do motor: piso da Deriv, teto da plataforma e o aparo
  // no stop (entra com o que sobra se der o mínimo; senão para).
  const comprar = (): { valor: number; fase: Fase; pagamento: number } | null => {
    let valor = Math.max(ENTRADA_MINIMA, Number(valorAtual.toFixed(2)))
    if (teto > 0 && valor > teto) valor = Math.max(ENTRADA_MINIMA, Number(teto.toFixed(2)))
    const sobra = centavos(c.stopLoss + resultado)
    if (valor > sobra + 1e-9) {
      if (sobra < ENTRADA_MINIMA) return null
      valor = sobra
    }
    const fase = perdasSeguidas > 0 ? fases.recuperacao : fases.base
    if (valor > maiorEntrada) maiorEntrada = valor
    return { valor, fase, pagamento: centavos(valor * fase.porDolar) }
  }
  const querEntrar = () => lossVirtual === 0 || contagem >= lossVirtual

  for (let tick = 0; tick < LIMITE_DE_TICKS; tick++) {
    const d = Math.floor(rnd() * 10)
    if (aberto) {
      const { valor, fase, pagamento } = aberto
      const ganhou = fase.ganha(d)
      operacoes++
      markup += pagamento * taxa
      if (ganhou) { resultado = centavos(resultado + pagamento - valor); perdasSeguidas = 0; prejuizo = 0 }
      else { resultado = centavos(resultado - valor); perdasSeguidas++; prejuizo = centavos(prejuizo + valor) }
      retorno = (pagamento - valor) / valor
      valorAtual = proximo({
        valorAtual: valor, valorInicial: c.base, valorAoVencer: c.base, ganhou,
        lucro: ganhou ? pagamento - valor : -valor,
        perdasSeguidas, prejuizoDaSequencia: prejuizo, retornoLiquidoPorUnidade: retorno,
        config, memoria, contractType: c.parametros.contrato.contractType,
      })
      aberto = null
      if (resultado >= c.takeProfit - 1e-9) return fecharCom('meta')
      if (resultado <= -c.stopLoss + 1e-9) return fecharCom('stop')
      if (maxOperacoes > 0 && operacoes >= maxOperacoes) return fecharCom('parou')
      // "Parar" depois do último degrau: o motor desliga em vez de comprar.
      if (!Number.isFinite(valorAtual)) return fecharCom('parou')
      if (segue && !ganhou) {
        // Sequência em andamento: entra na próxima sem contar de novo.
        aberto = comprar()
        if (!aberto) return fecharCom('parou')
        continue
      }
    }
    // O dígito que acabou de sair conta para o loss virtual, como na janela
    // do motor: uma vitória zera a contagem; uma perda a continua.
    contagem = fases.base.ganha(d) ? 0 : contagem + 1
    if (querEntrar()) {
      aberto = comprar()
      if (!aberto) return fecharCom('parou')
    }
  }
  return fecharCom('parou')
}

export function monteCarlo(c: Cenario, o: { sessoes?: number; semente?: number } = {}): ResultadoMonteCarlo {
  const sessoes = Math.max(1, Math.floor(o.sessoes ?? 1000))
  const semente = o.semente ?? 1
  const lista: SessaoSimulada[] = []
  for (let k = 0; k < sessoes; k++) lista.push(simularSessao(c, mulberry32(sementeDaSessao(semente, k))))

  const conta = (fim: SessaoSimulada['fim']) => lista.filter((s) => s.fim === fim).length
  const media = (f: (s: SessaoSimulada) => number) => lista.reduce((t, s) => t + f(s), 0) / sessoes
  const resultados = lista.map((s) => s.resultado).sort((a, b) => a - b)
  const meio = Math.floor(sessoes / 2)
  const mediana = sessoes % 2 ? resultados[meio] : (resultados[meio - 1] + resultados[meio]) / 2

  // Histograma: 12 faixas entre −stop e +meta; o que passar das pontas cai na faixa da ponta.
  const de = -c.stopLoss, ate = c.takeProfit
  const largura = (ate - de) / FAIXAS
  const histograma = Array.from({ length: FAIXAS }, (_, i) => ({ de: centavos(de + i * largura), ate: centavos(de + (i + 1) * largura), n: 0 }))
  for (const r of resultados) {
    const i = Math.min(FAIXAS - 1, Math.max(0, Math.floor((r - de) / largura)))
    histograma[i].n++
  }

  const operacoesMedias = media((s) => s.operacoes)
  const markupMedio = media((s) => s.markup)
  const { opsPorHora } = cadenciaTeorica(c)
  const horasPorSessao = opsPorHora > 0 ? operacoesMedias / opsPorHora : 0
  return {
    sessoes,
    pMeta: conta('meta') / sessoes,
    pStop: conta('stop') / sessoes,
    pParou: conta('parou') / sessoes,
    resultadoMedio: quatroCasas(media((s) => s.resultado)),
    resultadoMediano: quatroCasas(mediana),
    markupMedio: quatroCasas(markupMedio),
    markupPorHora: horasPorSessao > 0 ? quatroCasas(markupMedio / horasPorSessao) : 0,
    operacoesMedias: quatroCasas(operacoesMedias),
    maiorEntradaMedia: quatroCasas(media((s) => s.maiorEntrada)),
    histograma,
  }
}

/* ------------------------------------------------------------------ *
 * Os três cartões da confirmação de publicação.
 * ------------------------------------------------------------------ */

/** Perda máxima com base 0,35 / 1 / 5 e stop de 20× a base — a foto que vai na versão publicada. */
export function cartoesDePerdaMaxima(id: string, p: ParametrosDoRobo, modo: Modo = 'conservador'): CartaoDePerdaMaxima[] {
  return [0.35, 1, 5].map((base) => {
    const stop = centavos(base * 20)
    const plano = avaliarPlano(id, base, stop, modo, p)
    return {
      base, stop,
      custoMaximo: plano.custoMaximo,
      errosSeguidos: plano.errosSeguidos,
      maiorEntrada: plano.maiorEntrada,
      chanceDaSequencia: chanceDaSequencia(id, plano.errosSeguidos),
      paraAntesDoStop: plano.paraAntesDoStop,
    }
  })
}
