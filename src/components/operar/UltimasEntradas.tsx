/**
 * "Suas últimas entradas" (22/10/2026): as operações manuais encerradas nesta
 * sessão, na coluna do Operar. Cada uma com o preço que fechou e o último
 * dígito em destaque, para o cliente conferir o dígito que valeu.
 */
import type { OpenContract } from '../../core/deriv/trading'
import { dinheiroComSinal } from '../../core/dinheiro'
import { PrecoComDigito } from '../preco/PrecoComDigito'
import { NOMES_DE_CONTRATO } from '../PositionCard'

const hora = (epoch: number) => new Date(epoch * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

export function UltimasEntradas({ operacoes, nomeDoAtivo, markupDe }: { operacoes: OpenContract[]; nomeDoAtivo: (simbolo: string) => string; markupDe?: (c: OpenContract) => number }) {
  // modo CEO: o markup de cada entrada e o total da lista
  const totalMarkup = markupDe ? operacoes.reduce((t, c) => t + markupDe(c), 0) : 0
  return (
    <section className="bl-ultimas" aria-label="Suas últimas entradas">
      <header><span className="bl-rot">Suas últimas entradas</span>{markupDe ? <small className="bl-ult-markup-total" title="Markup gerado por estas entradas">Markup US$ {totalMarkup.toFixed(2).replace('.', ',')}</small> : <small>{operacoes.length}</small>}</header>
      <ol>
        {operacoes.map((c) => {
          const subiu = /^(CALL|HIGHER|MULTUP)$/.test(c.contractType)
          const comDirecao = /^(CALL|PUT|HIGHER|LOWER|MULTUP|MULTDOWN)$/.test(c.contractType)
          const ganhou = c.profit >= 0
          return (
            <li key={c.contractId} className={ganhou ? 'ganho' : 'perda'}>
              <span className="bl-ult-hora">{hora(c.startTime)}</span>
              <span className="bl-ult-nome">
                <b>{comDirecao && <i aria-hidden="true">{subiu ? '▲ ' : '▼ '}</i>}{NOMES_DE_CONTRATO[c.contractType] ?? c.contractType}</b>
                <small>{nomeDoAtivo(c.symbol)}</small>
              </span>
              <span className="bl-ult-preco" title="Preço de saída: o último dígito é o que valeu">
                {c.exitSpot !== null ? <PrecoComDigito valor={c.exitSpot} casas={c.pipSize} tom={ganhou ? 'ganho' : 'perda'} /> : '—'}
              </span>
              <b className="bl-ult-res">{dinheiroComSinal(c.profit, c.currency)}{markupDe && <small className="bl-ult-markup">markup {markupDe(c).toFixed(2).replace('.', ',')}</small>}</b>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
