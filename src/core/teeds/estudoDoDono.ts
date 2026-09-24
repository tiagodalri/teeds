/**
 * Os números do dono, lidos das sessões abertas na tela.
 *
 * A tela de Robôs é do operador: o que está acontecendo agora. O Modo CEO
 * acrescenta ali só uma faixa fina com markup, exposição e volume — a
 * análise com período, gráficos e comparação entre plataformas mora na
 * Administração, em Centro de estudo. (Separação combinada com o Tiago em
 * 24/09/2026: antes era tudo na mesma tela e ficava confuso.)
 *
 * Nada aqui pede dado novo ao servidor: é o mesmo EstadoMotor que as
 * cabines já leem.
 */
import type { EstadoMotor } from '../deriv/engine'
import { markupDaOperacao } from '../deriv/markup'

export interface DadosEstudo {
  id: string
  nome: string
  cor: string
  numero: string
  modo: string | null
  demo: boolean | null
  rodando: boolean
  operacoes: number
  vitorias: number
  resultado: number
  movimentado: number
  markup: number
  /** Quanto da soma do markup veio medido pela Deriv (o resto é a estimativa de 3%). */
  markupMedido: number
  entradaMedia: number
  maiorEntrada: number
  /** A maior fila de negativas seguidas que a sessão já teve. */
  piorSequencia: number
  /** Maior queda do topo da curva até o fundo seguinte, em dinheiro. */
  drawdown: number
  /** Valor do contrato aberto agora, se houver. */
  exposicao: number
}

/** O que esta sessão tem a dizer ao centro de estudo. */
export function resumoDeEstudo(
  e: EstadoMotor,
  quem: { id: string; nome: string; cor: string; numero: string; modo: string | null; demo: boolean | null },
): DadosEstudo {
  let markup = 0, markupMedido = 0, soma = 0, maior = 0, fila = 0, pior = 0
  // O histórico vem do mais recente para o mais antigo; a fila de negativas
  // é a mesma de qualquer lado que se conte.
  for (const o of e.historico) {
    markup += markupDaOperacao(o)
    if (o.markupDeriv != null) markupMedido += o.markupDeriv
    soma += o.valor
    if (o.valor > maior) maior = o.valor
    if (o.ganhou) fila = 0
    else { fila++; if (fila > pior) pior = fila }
  }
  let topo = 0, drawdown = 0
  for (const v of [0, ...e.curva]) {
    if (v > topo) topo = v
    if (topo - v > drawdown) drawdown = topo - v
  }
  return {
    ...quem,
    rodando: e.rodando,
    operacoes: e.operacoes,
    vitorias: e.vitorias,
    resultado: e.resultado,
    movimentado: e.movimentado,
    markup, markupMedido,
    entradaMedia: e.historico.length ? soma / e.historico.length : 0,
    maiorEntrada: maior,
    piorSequencia: pior,
    drawdown,
    exposicao: e.emCurso?.valor ?? 0,
  }
}

