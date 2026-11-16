/**
 * "Suas últimas entradas" (22/10/2026): as operações manuais encerradas hoje,
 * na coluna do Operar. Cada uma com o preço que fechou e o último dígito em
 * destaque, para o cliente conferir o dígito que valeu.
 *
 * 16/11/2026 (Tiago escolheu o "A · Minimalista" do mockup): o resultado do dia
 * em cima com uma linha fina de ganhos x perdas; cada entrada em duas linhas
 * (nome e resultado; horário, ativo e saída), sem caixinhas nem pílulas. Cor só
 * no resultado e no último dígito. A lista guarda o dia (volta ao recarregar e
 * zera à meia-noite: ver App.tsx).
 */
import { useState } from 'react'
import type { OpenContract } from '../../core/deriv/trading'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { PrecoComDigito } from '../preco/PrecoComDigito'
import { nomeDaOperacao } from '../PositionCard'
import './ultimas-entradas.css'

// o mesmo nome das outras telas ("Acima de 4", "Compra"), vindo de um lugar só
const nomeCurto = (c: OpenContract) => nomeDaOperacao(c.contractType, c.barrier)
const hora = (epoch: number) => new Date(epoch * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** Quantas entradas a lista mostra fechada; "Ver todas" abre o dia inteiro. */
const NA_LISTA = 10

export function UltimasEntradas({ operacoes, nomeDoAtivo, markupDe }: { operacoes: OpenContract[]; nomeDoAtivo: (simbolo: string) => string; markupDe?: (c: OpenContract) => number }) {
  const [todas, setTodas] = useState(false)
  // `operacoes` é o dia inteiro, da mais recente para a mais antiga
  const naLista = todas ? operacoes : operacoes.slice(0, NA_LISTA)
  const totalMarkup = markupDe ? operacoes.reduce((t, c) => t + markupDe(c), 0) : 0
  const ganhos = operacoes.filter((c) => c.profit >= 0).length
  const perdas = operacoes.length - ganhos
  const resultado = operacoes.reduce((t, c) => t + c.profit, 0)
  const moeda = operacoes[0]?.currency ?? 'USD'
  const pctGanhos = operacoes.length ? (ganhos / operacoes.length) * 100 : 0
  return (
    <section className="bl-ultimas ulm" aria-label="Suas últimas entradas">
      <header><span className="bl-rot">Suas últimas entradas</span><small className="ulm-hoje" title="A lista guarda as entradas de hoje e recomeça à meia-noite">Hoje</small></header>
      <div className="ulm-resumo">
        <div>
          <span className="ulm-rot">Resultado do dia</span>
          <b className={`ulm-total ${resultado >= 0 ? 'ganho' : 'perda'}`}>{dinheiroComSinal(resultado, moeda)}</b>
        </div>
        <p className="ulm-contagem">
          {contar(operacoes.length, 'entrada', 'entradas')}<br />
          <span className={ganhos ? 'ganho' : undefined}>{contar(ganhos, 'ganho', 'ganhos')}</span> · <span className={perdas ? 'perda' : undefined}>{contar(perdas, 'perda', 'perdas')}</span>
        </p>
      </div>
      <div className="ulm-proporcao" aria-hidden="true">
        {ganhos > 0 && <i className="ganho" style={{ width: `${pctGanhos}%` }} />}
        {perdas > 0 && <i className="perda" style={{ width: `${100 - pctGanhos}%` }} />}
      </div>
      {markupDe && <p className="ulm-markup-dia" title="Markup gerado pelas entradas de hoje">Markup do dia <b>{dinheiro(totalMarkup, moeda)}</b></p>}
      <ol className="ulm-lista">
        {naLista.map((c) => {
          const subiu = /^(CALL|HIGHER|MULTUP)$/.test(c.contractType)
          const comDirecao = /^(CALL|PUT|HIGHER|LOWER|MULTUP|MULTDOWN)$/.test(c.contractType)
          const ganhou = c.profit >= 0
          return (
            <li key={c.contractId} className={ganhou ? 'ganho' : 'perda'}>
              <div className="ulm-l1">
                <span className="ulm-nome">{comDirecao && <i aria-hidden="true" className={subiu ? 'sobe' : 'desce'}>{subiu ? '▲' : '▼'}</i>}{nomeCurto(c)}</span>
                <b className="ulm-res">{dinheiroComSinal(c.profit, c.currency)}</b>
              </div>
              <div className="ulm-l2">
                <span className="ulm-quando"><span className="ulm-hora">{hora(c.startTime)}</span> · {nomeDoAtivo(c.symbol)}</span>
                <span className="ulm-saida" title="Preço de saída: o último dígito é o que valeu">{c.exitSpot !== null ? <PrecoComDigito valor={c.exitSpot} casas={c.pipSize} tom={ganhou ? 'ganho' : 'perda'} /> : '—'}</span>
              </div>
              {markupDe && <small className="ulm-markup">Markup {markupDe(c).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small>}
            </li>
          )
        })}
      </ol>
      {operacoes.length > NA_LISTA && (
        <button type="button" className="ulm-mais" onClick={() => setTodas((v) => !v)}>{todas ? 'Mostrar só as últimas 10' : `Ver todas (${operacoes.length})`}</button>
      )}
    </section>
  )
}
