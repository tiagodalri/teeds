/**
 * A escada de entradas de cada robô — a mesma que o motor sobe.
 *
 * O motor calcula cada recuperação com o pagamento REAL da compra anterior
 * (`proximoValor` em strategies.ts). Quem planeja — a tela Gerenciamento, o
 * material de apoio — precisa dos mesmos números; senão promete ao aluno
 * uma escada que o robô não sobe.
 *
 * Os pagamentos por dólar abaixo foram medidos nas operações dos robôs na
 * própria plataforma (Volatility 75 (1s), 04 a 11/09/2026), então já vêm
 * com o markup de 3% da app descontado. A Deriv arredonda o pagamento no
 * centavo e o motor usa esse valor arredondado; a simulação arredonda
 * também — é isso que faz ela bater com a cabine centavo a centavo.
 */
import { recuperacaoDoRobo } from './strategies'

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
}
const contratoDo = (id: string) => CONTRATOS[id] ?? CONTRATOS.superior5

/** A Deriv devolve o pagamento em centavos; meio centavo sobe. */
const centavos = (v: number) => Math.round(v * 100 + 1e-6) / 100

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
}

/**
 * A sequência de entradas se o robô errar `passos` vezes seguidas.
 * Reproduz `proximoValor` do motor, degrau por degrau.
 */
export function escadaDoRobo(id: string, base: number, passos = 30): Degrau[] {
  const { galeApos, margem } = recuperacaoDoRobo(id)
  const contrato = contratoDo(id)
  const palm = id === 'thepalm'
  const degraus: Degrau[] = []
  let perdido = 0
  let retorno = 0
  for (let i = 0; i < passos; i++) {
    let valor: number
    let porDolar: number
    if (palm && i > 0) {
      // The Palm troca para "0 a 4" na recuperação. Antes da primeira compra
      // Under 5 o último retorno conhecido é o do Under 9: o motor usa 0,9233.
      const r = retorno > 0.5 ? retorno : 0.9233
      valor = Math.ceil(((perdido + Math.max(0.01, base * 0.95)) / Math.max(0.01, r * 0.99)) * 100) / 100
      porDolar = contrato.recuperacao
    } else if (palm || i < galeApos) {
      valor = base
      porDolar = contrato.entrada
    } else {
      valor = Math.ceil(((perdido + Math.max(0.01, base * margem)) / Math.max(0.01, retorno * 0.97)) * 100) / 100
      porDolar = contrato.recuperacao
    }
    const pagamento = centavos(valor * porDolar)
    retorno = (pagamento - valor) / valor
    perdido += valor
    degraus.push({
      n: i + 1, valor, pagamento, lucro: centavos(pagamento - valor),
      recuperacao: palm ? i > 0 : i >= galeApos, perdido: centavos(perdido),
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
}

/** A entrada mínima da Deriv, a mesma do motor. */
export const ENTRADA_MINIMA = 0.35

/** Quantos erros seguidos cabem num limite de perda, com a escada real do robô. */
export function avaliarPlano(id: string, base: number, limite: number): PlanoAvaliado {
  const escada = escadaDoRobo(id, base, 60)
  const cabem = escada.filter((d) => d.perdido <= limite + 1e-9)
  const custo = cabem[cabem.length - 1]?.perdido ?? 0
  const proximo = escada[cabem.length] ?? null
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
  }
}

/** A maior entrada base que ainda aguenta `recuperacoes` recuperações no limite. */
export function maiorEntradaPara(id: string, recuperacoes: number, limite: number): number | null {
  if (avaliarPlano(id, 0.35, limite).recuperacoes < recuperacoes) return null
  let baixo = 35
  let alto = Math.max(35, Math.floor(limite * 100))
  while (baixo < alto) {
    const meio = Math.ceil((baixo + alto) / 2)
    if (avaliarPlano(id, meio / 100, limite).recuperacoes >= recuperacoes) baixo = meio
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
