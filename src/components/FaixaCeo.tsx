/**
 * A faixa do Modo CEO na tela de Robôs.
 *
 * Uma linha só, acima da área de acompanhamento: quanto as sessões abertas
 * geraram de markup, quanto está dentro de contratos neste instante e
 * quanto de dinheiro já girou. Nada além disso — a análise com período,
 * gráficos e comparação entre plataformas mora na Administração, em
 * "Centro de estudo".
 *
 * (Redesenho de 24/09/2026: antes esta tela carregava o centro de estudo
 * inteiro embaixo, e misturar a conta do dono com a mesa do operador
 * deixava as duas coisas confusas.)
 */
import type { DadosEstudo } from '../core/teeds/estudoDoDono'

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })

export function FaixaCeo({ dados, moeda }: { dados: DadosEstudo[]; moeda: string }) {
  if (dados.length === 0) return null
  const markup = dados.reduce((t, d) => t + d.markup, 0)
  const exposicao = dados.reduce((t, d) => t + d.exposicao, 0)
  const movimentado = dados.reduce((t, d) => t + d.movimentado, 0)
  const operacoes = dados.reduce((t, d) => t + d.operacoes, 0)
  const soDemo = dados.every((d) => d.demo !== false)

  return (
    <aside className="fceo" aria-label="Modo CEO: números desta tela">
      <span className="fceo-selo">Modo CEO</span>
      <span className="fceo-item destaque">
        <i>Markup destas sessões</i>
        <b>{moeda} {cents(markup)}</b>
      </span>
      <span className="fceo-item">
        <i>Exposição agora</i>
        <b>{moeda} {num(exposicao)}</b>
      </span>
      <span className="fceo-item">
        <i>Movimentado</i>
        <b>{moeda} {num(movimentado)}</b>
      </span>
      <span className="fceo-item">
        <i>Operações</i>
        <b>{operacoes.toLocaleString('pt-BR')}</b>
      </span>
      <small className="fceo-nota">
        {soDemo ? 'Conta de demonstração: este markup não é faturamento. ' : ''}
        O histórico, com gráficos e comparação entre plataformas, está em Administração · Centro de estudo.
      </small>
    </aside>
  )
}
