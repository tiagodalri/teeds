/**
 * Centro de estudo — o que o Modo CEO acrescenta à tela de Robôs.
 *
 * Aparece embaixo da área de acompanhamento, nas duas vistas (lista e
 * mosaico), e só para o dono da plataforma com o Modo CEO ligado. Lê os
 * mesmos estados que as cabines já leem: nada aqui pede dado novo ao
 * servidor.
 *
 * A pergunta que esta tela responde é a do dono, não a do operador: quanto
 * de markup cada robô gerou, quanto de dinheiro ele movimentou para gerar
 * isso, e com quanto risco operacional — tamanho da maior entrada, pior
 * sequência de negativas e o fundo do poço da curva.
 * (Pedido do Tiago, 22/09/2026.)
 */
import type { EstadoMotor } from '../core/deriv/engine'
import { markupDaOperacao } from '../core/deriv/markup'
import { CentroDeEstudoHistorico } from './CentroDeEstudoHistorico'
import type { SessaoTeeds } from '../core/teeds/conta'

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

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const pct = (v: number) => `${Math.round(v * 100)}%`
const assinado = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}`

/** Uma barra horizontal comparando um robô com o maior da mesa. */
function Barra({ parte, total, cor }: { parte: number; total: number; cor: string }) {
  const larg = total > 0 ? Math.max(2, (parte / total) * 100) : 0
  return (
    <span className="ce-barra" aria-hidden>
      <i style={{ width: `${larg}%`, background: cor }} />
    </span>
  )
}

export function CentroDeEstudo({ dados, moeda, sessao }: { dados: DadosEstudo[]; moeda: string; sessao?: SessaoTeeds | null }) {
  if (dados.length === 0 && !sessao) return null
  const ops = dados.reduce((t, d) => t + d.operacoes, 0)
  const markup = dados.reduce((t, d) => t + d.markup, 0)
  const medido = dados.reduce((t, d) => t + d.markupMedido, 0)
  const movimentado = dados.reduce((t, d) => t + d.movimentado, 0)
  const resultado = dados.reduce((t, d) => t + d.resultado, 0)
  const exposicao = dados.reduce((t, d) => t + d.exposicao, 0)
  const vitorias = dados.reduce((t, d) => t + d.vitorias, 0)
  const maiorMarkup = Math.max(...dados.map((d) => d.markup), 0)
  const semSessoes = dados.length === 0
  const maiorRisco = Math.max(...dados.map((d) => Math.max(d.maiorEntrada, d.drawdown)), 0)
  const demo = dados.some((d) => d.demo !== false)
  // Markup por mil dólares movimentados: compara robôs de tamanhos diferentes.
  const porMil = movimentado > 0 ? (markup / movimentado) * 1000 : 0

  return (
    <section className="ce" aria-label="Centro de estudo">
      <header className="ce-topo">
        <div>
          <span className="ce-eyebrow">Modo CEO</span>
          <h3>Centro de estudo</h3>
          <p>A plataforma do ponto de vista de quem é dono dela: o que está rodando agora e o que já passou por aqui. Só você vê isto.</p>
        </div>
        {demo && !semSessoes && <span className="ce-aviso">Tem sessão em conta de demonstração: o markup dela não é faturamento.</span>}
      </header>

      {!semSessoes && <>
        <h4 className="ce-secao">Agora nesta tela</h4>
      <div className="ce-tiles">
        <div className="ce-tile destaque">
          <i>Markup gerado</i>
          <b>{moeda} {cents(markup)}</b>
          <small>{medido > 0 ? `${cents(medido)} medido pela Deriv` : 'estimativa de 3% do pagamento'}</small>
        </div>
        <div className="ce-tile">
          <i>Volume movimentado</i>
          <b>{moeda} {num(movimentado)}</b>
          <small>{ops} {ops === 1 ? 'operação' : 'operações'} · {ops ? pct(vitorias / ops) : '—'} positivas</small>
        </div>
        <div className="ce-tile">
          <i>Markup por mil movimentados</i>
          <b>{moeda} {cents(porMil)}</b>
          <small>o mesmo robô rende isto a cada {moeda} 1.000 girados</small>
        </div>
        <div className="ce-tile">
          <i>Exposição agora</i>
          <b>{moeda} {num(exposicao)}</b>
          <small>{dados.filter((d) => d.rodando).length} de {dados.length} operando · resultado {assinado(resultado)}</small>
        </div>
      </div>

      <div className="ce-tabela">
        <table>
          <thead>
            <tr>
              <th scope="col">Robô</th>
              <th scope="col">Ops</th>
              <th scope="col">Acerto</th>
              <th scope="col">Entrada média</th>
              <th scope="col">Maior entrada</th>
              <th scope="col">Pior sequência</th>
              <th scope="col">Fundo do poço</th>
              <th scope="col">Movimentado</th>
              <th scope="col">Markup</th>
              <th scope="col">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {dados.map((d) => (
              <tr key={d.id}>
                <th scope="row">
                  <span className="ce-robo"><i style={{ background: d.cor }} aria-hidden />{d.nome}</span>
                  <small>{d.numero}{d.modo ? ` · ${d.modo}` : ''}{d.demo === false ? ' · real' : ' · demo'}</small>
                </th>
                <td>{d.operacoes}</td>
                <td>{d.operacoes ? pct(d.vitorias / d.operacoes) : '—'}</td>
                <td>{num(d.entradaMedia)}</td>
                <td className="ce-risco">{num(d.maiorEntrada)}<Barra parte={d.maiorEntrada} total={maiorRisco} cor="var(--account-demo)" /></td>
                <td className={d.piorSequencia >= 4 ? 'down' : ''}>{d.piorSequencia}</td>
                <td className="ce-risco">{num(d.drawdown)}<Barra parte={d.drawdown} total={maiorRisco} cor="var(--down)" /></td>
                <td>{num(d.movimentado)}</td>
                <td className="ce-markup">{cents(d.markup)}<Barra parte={d.markup} total={maiorMarkup} cor="var(--primary)" /></td>
                <td className={d.resultado >= 0 ? 'up' : 'down'}>{assinado(d.resultado)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </>}
      {!semSessoes && <p className="ce-nota">
        Markup: o valor que a Deriv informou em cada contrato; quando ela não informa, a estimativa de 3% do pagamento.
        Fundo do poço: a maior queda do topo da curva até o ponto mais baixo depois dele, dentro da sessão.
      </p>}
      {sessao && <CentroDeEstudoHistorico sessao={sessao} moeda={moeda} />}
    </section>
  )
}
