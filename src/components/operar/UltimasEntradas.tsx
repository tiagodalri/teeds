/**
 * "Suas últimas entradas" (22/10/2026): as operações manuais encerradas nesta
 * sessão, na coluna do Operar. Cada uma com o preço que fechou e o último
 * dígito em destaque, para o cliente conferir o dígito que valeu.
 */
import type { OpenContract } from '../../core/deriv/trading'
import { dinheiroComSinal } from '../../core/dinheiro'
import { PrecoComDigito } from '../preco/PrecoComDigito'
import { NOMES_DE_CONTRATO } from '../PositionCard'

// na tabela o nome curto (a coluna é estreita): "Acima de 4" em vez de "Último dígito acima"
const CURTO: Record<string, (b: number | null) => string> = {
  DIGITOVER: (b) => b === null ? 'Dígito acima' : `Acima de ${b}`, DIGITUNDER: (b) => b === null ? 'Dígito abaixo' : `Abaixo de ${b}`,
  DIGITMATCH: (b) => b === null ? 'Dígito exato' : `Igual a ${b}`, DIGITDIFF: (b) => b === null ? 'Diferente' : `Diferente de ${b}`,
  DIGITEVEN: () => 'Par', DIGITODD: () => 'Ímpar',
}
const nomeCurto = (c: OpenContract) => CURTO[c.contractType]?.(c.barrier) ?? NOMES_DE_CONTRATO[c.contractType] ?? c.contractType
const hora = (epoch: number) => new Date(epoch * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

export function UltimasEntradas({ operacoes, nomeDoAtivo, markupDe }: { operacoes: OpenContract[]; nomeDoAtivo: (simbolo: string) => string; markupDe?: (c: OpenContract) => number }) {
  // modo CEO: o markup de cada entrada e o total da lista
  const totalMarkup = markupDe ? operacoes.reduce((t, c) => t + markupDe(c), 0) : 0
  // 26/10/2026 (Tiago: "uma tabelinha bem intuitiva, pras infos não ficarem jogadas"):
  // o resumo em cima e as entradas em colunas com cabeçalho
  const ganhos = operacoes.filter((c) => c.profit >= 0).length
  const resultado = operacoes.reduce((t, c) => t + c.profit, 0)
  const moeda = operacoes[0]?.currency ?? 'USD'
  return (
    <section className="bl-ultimas" aria-label="Suas últimas entradas">
      <header><span className="bl-rot">Suas últimas entradas</span>{markupDe && <small className="bl-ult-markup-total" title="Markup gerado por estas entradas">Markup US$ {totalMarkup.toFixed(2).replace('.', ',')}</small>}</header>
      <dl className="bl-ult-resumo">
        <div><dt>Entradas</dt><dd>{operacoes.length}</dd></div>
        <div><dt>Ganhos</dt><dd className="ganho">{ganhos}</dd></div>
        <div><dt>Perdas</dt><dd className="perda">{operacoes.length - ganhos}</dd></div>
        <div className="bl-ult-total"><dt>Resultado</dt><dd className={resultado >= 0 ? 'ganho' : 'perda'}>{dinheiroComSinal(resultado, moeda)}</dd></div>
      </dl>
      <div className="bl-ult-tabela">
        <table>
          <thead><tr><th scope="col">Hora</th><th scope="col">Operação</th><th scope="col" className="num" title="Preço de saída: o último dígito é o que valeu">Saída</th><th scope="col" className="num">Resultado</th></tr></thead>
          <tbody>
            {operacoes.map((c) => {
              const subiu = /^(CALL|HIGHER|MULTUP)$/.test(c.contractType)
              const comDirecao = /^(CALL|PUT|HIGHER|LOWER|MULTUP|MULTDOWN)$/.test(c.contractType)
              const ganhou = c.profit >= 0
              return (
                <tr key={c.contractId} className={ganhou ? 'ganho' : 'perda'}>
                  <td className="bl-ult-hora">{hora(c.startTime)}</td>
                  <td className="bl-ult-nome">
                    <b>{comDirecao && <i aria-hidden="true">{subiu ? '▲ ' : '▼ '}</i>}<span title={NOMES_DE_CONTRATO[c.contractType]}>{nomeCurto(c)}</span></b>
                    <small>{nomeDoAtivo(c.symbol)}</small>
                  </td>
                  <td className="bl-ult-preco num">{c.exitSpot !== null ? <PrecoComDigito valor={c.exitSpot} casas={c.pipSize} tom={ganhou ? 'ganho' : 'perda'} /> : '—'}</td>
                  <td className="num">
                    <b className="bl-ult-res">{dinheiroComSinal(c.profit, c.currency)}</b>
                    {markupDe && <small className="bl-ult-markup">markup {markupDe(c).toFixed(2).replace('.', ',')}</small>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
