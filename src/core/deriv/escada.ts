/**
 * A escada de entradas de cada robô — a mesma que o motor sobe.
 *
 * Quem planeja — a tela Gerenciamento, o painel de controle, o material de
 * apoio — precisa dos mesmos números que o robô usa; senão promete ao aluno
 * uma escada que o robô não sobe. Por isso esta escada NÃO tem conta
 * própria: ela chama o `proximoValor` da própria estratégia, degrau a
 * degrau, com uma configuração de referência (22/09/2026). O que muda no
 * motor muda aqui no mesmo instante.
 *
 * Os pagamentos por dólar abaixo foram medidos nas operações dos robôs na
 * própria plataforma (R_75, um tick a cada ~2 s, 04 a 11/09/2026), então já
 * vêm com o markup de 3% da app descontado. A Deriv arredonda o pagamento
 * no centavo e o motor usa esse valor arredondado; a simulação arredonda
 * também — é isso que faz ela bater com a cabine centavo a centavo.
 *
 * Com `parametros` (o que o painel publicou), a escada pode ser uma tabela
 * ditada pelo admin, ter outro loss virtual, outro teto. Sem, é o padrão do
 * robô — o mesmo de sempre, com um acerto: o piso de US$ 0,35 que o motor
 * sempre aplicou e a escada antiga não (bases abaixo de 0,62 no AG7/AG2).
 */
import { configDeReferencia, parametrosPadrao, type ParametrosDoRobo } from './parametros'
import { tetoEfetivo } from './recuperacao'
import { TAXA_MARKUP } from './taxaMarkup'
import { ESTRATEGIAS_LOCAIS, type Modo } from './strategies'

/** Pagamento bruto (entrada + lucro) por US$ 1, conforme quantos dígitos ganham. */
export const PAGAMENTO_POR_DOLAR = {
  tresDigitos: 2.9225,   // AG7 (7 a 9) e AG2 (0 a 2)
  cincoDigitos: 1.8450,  // First e Second Block; The Palm na recuperação (0 a 4)
  seisDigitos: 1.5576,   // Smart 03 (4 a 9)
  noveDigitos: 1.0616,   // Göreme (0 a 8); The Palm na entrada
} as const

const P = PAGAMENTO_POR_DOLAR
const CONTRATOS: Record<string, { entrada: number; recuperacao: number; acerto: number; acertoRecuperacao: number }> = {
  superior5: { entrada: P.tresDigitos, recuperacao: P.tresDigitos, acerto: .3, acertoRecuperacao: .3 },
  ag2: { entrada: P.tresDigitos, recuperacao: P.tresDigitos, acerto: .3, acertoRecuperacao: .3 },
  smart03: { entrada: P.seisDigitos, recuperacao: P.seisDigitos, acerto: .6, acertoRecuperacao: .6 },
  goreme: { entrada: P.noveDigitos, recuperacao: P.noveDigitos, acerto: .9, acertoRecuperacao: .9 },
  firstblock: { entrada: P.cincoDigitos, recuperacao: P.cincoDigitos, acerto: .5, acertoRecuperacao: .5 },
  secondblock: { entrada: P.cincoDigitos, recuperacao: P.cincoDigitos, acerto: .5, acertoRecuperacao: .5 },
  thepalm: { entrada: P.noveDigitos, recuperacao: P.cincoDigitos, acerto: .9, acertoRecuperacao: .5 },
  omniover: { entrada: P.tresDigitos, recuperacao: P.tresDigitos, acerto: .3, acertoRecuperacao: .3 },
  omnibull: { entrada: P.cincoDigitos, recuperacao: P.cincoDigitos, acerto: .5, acertoRecuperacao: .5 },
  omnibear: { entrada: P.cincoDigitos, recuperacao: P.cincoDigitos, acerto: .5, acertoRecuperacao: .5 },
  superior5fixo: { entrada: P.tresDigitos, recuperacao: P.tresDigitos, acerto: .3, acertoRecuperacao: .3 },
}
const contratoDo = (id: string) => CONTRATOS[id] ?? CONTRATOS.superior5

/** A Deriv devolve o pagamento em centavos; meio centavo sobe. */
const centavos = (v: number) => Math.round(v * 100 + 1e-6) / 100
/** O markup é registrado com quatro casas, como em comissoes.ts. */
const quatroCasas = (v: number) => Math.round(v * 10000) / 10000

/** Lucro de cada US$ 1 que acerta, na entrada base (ex.: 1,92 no AG7). */
export function lucroPorDolar(id: string): number {
  return Number((contratoDo(id).entrada - 1).toFixed(3))
}

/** Chance de acerto de cada entrada base (0,3 = 3 dígitos em 10). */
export function chanceDeAcerto(id: string): number {
  return contratoDo(id).acerto
}

export interface Degrau {
  /** 1 = primeira entrada da sequência. */
  n: number
  valor: number
  /** O que volta se esta entrada acertar (entrada + lucro). */
  pagamento: number
  lucro: number
  recuperacao: boolean
  /** Soma de todas as entradas da sequência até esta, inclusive. */
  perdido: number
  /** Ganhar neste degrau cobre tudo o que foi perdido antes dele? (Sempre true no 1º.) */
  cobre: boolean
  /** A comissão da casa se este degrau for comprado: 3% do pagamento. */
  markup: number
  /**
   * Degrau virtual: a tabela acabou com "parar" — o robô desliga aqui em
   * vez de comprar. É sempre o último da lista e não tem valor.
   */
  esgotada: boolean
}

/** A entrada mínima da Deriv, a mesma do motor. */
export const ENTRADA_MINIMA = 0.35

/**
 * A sequência de entradas se o robô errar `passos` vezes seguidas.
 *
 * Sobe a escada chamando a própria estratégia (`proximoValor`), com os
 * mesmos aparos do motor: piso de US$ 0,35 e o teto da plataforma. Não
 * aplica o stop do cliente — quem apara pelo stop é `avaliarPlano`.
 */
export function escadaDoRobo(id: string, base: number, passos = 30, modo: Modo = 'conservador', parametros: ParametrosDoRobo = parametrosPadrao(id)): Degrau[] {
  const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === id) ?? ESTRATEGIAS_LOCAIS[0]
  const config = configDeReferencia(parametros, base, modo)
  const contrato = contratoDo(id)
  const palm = id === 'thepalm'
  const galeApos = config.galeApos
  const teto = tetoEfetivo(config)
  const memoria: Record<string, unknown> = {}
  const degraus: Degrau[] = []
  let perdido = 0
  // O motor começa com retorno 1 (engine.ts) e só o troca depois da primeira compra.
  let retorno = 1
  for (let i = 0; i < passos; i++) {
    const perdidoAntes = perdido
    let valor = i === 0 ? base : estrategia.proximoValor({
      valorAtual: degraus[i - 1].valor,
      valorInicial: base,
      valorAoVencer: base,
      ganhou: false,
      lucro: -degraus[i - 1].valor,
      perdasSeguidas: i,
      prejuizoDaSequencia: perdido,
      retornoLiquidoPorUnidade: retorno,
      config,
      memoria,
      contractType: 'DIGITUNDER',
    })
    if (!Number.isFinite(valor)) {
      degraus.push({ n: i + 1, valor: 0, pagamento: 0, lucro: 0, recuperacao: true, perdido: centavos(perdido), cobre: false, markup: 0, esgotada: true })
      break
    }
    // Os mesmos aparos do motor (comprar()): piso da Deriv e teto da plataforma.
    valor = Math.max(ENTRADA_MINIMA, Number(valor.toFixed(2)))
    if (teto > 0 && valor > teto) valor = Math.max(ENTRADA_MINIMA, Number(teto.toFixed(2)))
    const recuperacao = palm ? i > 0 : i >= galeApos
    const porDolar = palm ? (i > 0 ? contrato.recuperacao : contrato.entrada) : (recuperacao ? contrato.recuperacao : contrato.entrada)
    const pagamento = centavos(valor * porDolar)
    retorno = (pagamento - valor) / valor
    perdido += valor
    const lucro = centavos(pagamento - valor)
    degraus.push({
      n: i + 1, valor, pagamento, lucro, recuperacao, perdido: centavos(perdido),
      cobre: i === 0 ? true : lucro + 1e-9 >= perdidoAntes,
      markup: quatroCasas(pagamento * TAXA_MARKUP),
      esgotada: false,
    })
  }
  return degraus
}

export interface PlanoAvaliado {
  /** Os degraus que cabem no limite de perda. */
  cabem: Degrau[]
  /** O primeiro degrau que passaria do limite (o robô para antes dele). */
  proximo: Degrau | null
  errosSeguidos: number
  recuperacoes: number
  maiorEntrada: number
  /** Perdido com os degraus completos. */
  custo: number
  /** O que sobra até o limite depois dos degraus completos. */
  sobra: number
  /**
   * A entrada aparada: quando o próximo degrau não cabe, o motor entra com o
   * que sobra (se for pelo menos a entrada mínima) e, se errar, a sessão fecha
   * exatamente no stop. Null quando não sobra o mínimo — aí ele só para.
   */
  entradaAparada: number | null
  /** O pior caso da sessão: degraus completos + a entrada aparada. */
  custoMaximo: number
  /** A tabela de recuperação acaba com "parar" antes de o stop ser alcançado. */
  paraAntesDoStop: boolean
}

/** Quantos erros seguidos cabem num limite de perda, com a escada real do robô. */
export function avaliarPlano(id: string, base: number, limite: number, modo: Modo = 'conservador', parametros?: ParametrosDoRobo): PlanoAvaliado {
  const escada = escadaDoRobo(id, base, 60, modo, parametros)
  const cabem = escada.filter((d) => !d.esgotada && d.perdido <= limite + 1e-9)
  const custo = cabem[cabem.length - 1]?.perdido ?? 0
  const seguinte = escada[cabem.length] ?? null
  const paraAntesDoStop = seguinte?.esgotada === true
  const proximo = seguinte && !seguinte.esgotada ? seguinte : null
  const sobra = Math.max(0, Math.round((limite - custo) * 100) / 100)
  const entradaAparada = proximo && sobra >= ENTRADA_MINIMA ? sobra : null
  return {
    cabem,
    proximo,
    errosSeguidos: cabem.length,
    recuperacoes: cabem.filter((d) => d.recuperacao).length,
    maiorEntrada: cabem.reduce((m, d) => Math.max(m, d.valor), 0),
    custo,
    sobra,
    entradaAparada,
    custoMaximo: Math.round((custo + (entradaAparada ?? 0)) * 100) / 100,
    paraAntesDoStop,
  }
}

/** A maior entrada base que ainda aguenta `recuperacoes` recuperações no limite. */
export function maiorEntradaPara(id: string, recuperacoes: number, limite: number, modo: Modo = 'conservador', parametros?: ParametrosDoRobo): number | null {
  if (avaliarPlano(id, 0.35, limite, modo, parametros).recuperacoes < recuperacoes) return null
  let baixo = 35
  let alto = Math.max(35, Math.floor(limite * 100))
  while (baixo < alto) {
    const meio = Math.ceil((baixo + alto) / 2)
    if (avaliarPlano(id, meio / 100, limite, modo, parametros).recuperacoes >= recuperacoes) baixo = meio
    else alto = meio - 1
  }
  return baixo / 100
}

/** Chance de uma sequência de `erros` erros seguidos, a partir de uma entrada base. */
export function chanceDaSequencia(id: string, erros: number): number {
  const c = contratoDo(id)
  let chance = 1
  for (let i = 0; i < erros; i++) {
    const acerto = id === 'thepalm' && i > 0 ? c.acertoRecuperacao : c.acerto
    chance *= 1 - acerto
  }
  return chance
}

export interface MarkupDaEscada {
  /** A comissão de cada degrau, se ele for comprado. */
  porDegrau: number[]
  /** Se a sequência inteira for comprada (todos os degraus perdem). */
  sequencia: number
  /**
   * O que a casa espera receber por sequência: cada degrau pesado pela
   * chance de a sequência chegar até ele (o 1º sempre; o 2º só se o 1º perder…).
   */
  esperado: number
}

/** O markup que uma escada gera para a casa — por degrau, no pior caso e o esperado. */
export function markupDaEscada(id: string, degraus: Degrau[]): MarkupDaEscada {
  const porDegrau = degraus.filter((d) => !d.esgotada).map((d) => d.markup)
  const sequencia = quatroCasas(porDegrau.reduce((t, m) => t + m, 0))
  const esperado = quatroCasas(porDegrau.reduce((t, m, i) => t + chanceDaSequencia(id, i) * m, 0))
  return { porDegrau, sequencia, esperado }
}
