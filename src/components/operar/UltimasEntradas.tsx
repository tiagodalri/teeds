/**
 * "Suas últimas entradas" (22/10/2026): as operações manuais encerradas nesta
 * sessão, na coluna do Operar. Cada uma com o preço que fechou e o último
 * dígito em destaque, para o cliente conferir o dígito que valeu.
 */
import type { OpenContract } from '../../core/deriv/trading'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { PrecoComDigito } from '../preco/PrecoComDigito'
import { nomeDaOperacao } from '../PositionCard'

// o mesmo nome das outras telas ("Acima de 4", "Compra"), vindo de um lugar só
const nomeCurto = (c: OpenContract) => nomeDaOperacao(c.contractType, c.barrier)
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
      <header><span className="bl-rot">Suas últimas entradas</span>{markupDe && <small className="bl-ult-markup-total" title="Markup gerado por estas entradas">Markup {dinheiro(totalMarkup, moeda)}</small>}</header>
      <dl className="bl-ult-resumo">
        <div><dt>Entradas</dt><dd>{operacoes.length}</dd></div>
        <div><dt>Ganhos</dt><dd className="ganho">{ganhos}</dd></div>
        <div><dt>Perdas</dt><dd className="perda">{operacoes.length - ganhos}</dd></div>
        <div className="bl-ult-total"><dt>Resultado</dt><dd className={resultado >= 0 ? 'ganho' : 'perda'}>{dinheiroComSinal(resultado, moeda)}</dd></div>
      </dl>
      <div className="bl-ult-tabela">
        <table>
          <thead><tr><th scope="col">Operação</th><th scope="col" className="num" title="Preço de saída: o último dígito é o que valeu">Saída</th><th scope="col" className="num">Resultado</th></tr></thead>
          <tbody>
            {operacoes.map((c) => {
              const subiu = /^(CALL|HIGHER|MULTUP)$/.test(c.contractType)
              const comDirecao = /^(CALL|PUT|HIGHER|LOWER|MULTUP|MULTDOWN)$/.test(c.contractType)
              const ganhou = c.profit >= 0
              return (
                <tr key={c.contractId} className={ganhou ? 'ganho' : 'perda'}>
                  <td className="bl-ult-nome">
                    <b>{comDirecao && <i aria-hidden="true" className={subiu ? 'sobe' : 'desce'}>{subiu ? '▲ ' : '▼ '}</i>}<span>{nomeCurto(c)}</span></b>
                    <small><span className="bl-ult-hora">{hora(c.startTime)}</span> · {nomeDoAtivo(c.symbol)}</small>
                  </td>
                  <td className="bl-ult-preco num">{c.exitSpot !== null ? <PrecoComDigito valor={c.exitSpot} casas={c.pipSize} tom={ganhou ? 'ganho' : 'perda'} /> : '—'}</td>
                  <td className="num">
                    <b className="bl-ult-res">{dinheiroComSinal(c.profit, c.currency)}</b>
                    {markupDe && <small className="bl-ult-markup">Markup {markupDe(c).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>}
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
