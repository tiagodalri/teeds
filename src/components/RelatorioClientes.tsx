import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import {
  conferenciaComissao, operacoesDoCliente, relatorioClientes,
  type DiaConferencia, type LinhaRelatorioCliente, type OperacaoRoboRegistro,
} from '../core/teeds/clientes'

/**
 * Resultados por cliente — a tela que responde três perguntas do admin:
 * quanto cada cliente operou, quanto ganhou ou perdeu, e quanto rendeu de
 * comissão. Tudo agregado no banco (`teeds_relatorio_clientes`); o navegador
 * recebe uma linha por cliente, nunca o histórico inteiro.
 *
 * Dois números de comissão convivem aqui e nunca se misturam:
 *  - calculada: 3% do pagamento, cliente a cliente (nosso)
 *  - oficial:   o total do app por dia, que a Deriv informa (dela)
 * A Deriv não quebra por cliente, então a conferência é por dia.
 */

const usd = (v: number, sinal = false) =>
  `${sinal && v > 0 ? '+' : ''}US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inteiro = (v: number) => v.toLocaleString('pt-BR')
const diaBr = (iso: string | null) => iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'
const horaBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
const classe = (v: number) => v > 0 ? 'positivo' : v < 0 ? 'negativo' : ''

const PERIODOS = [7, 30, 90] as const
const MAX_LINHAS_EXTRATO = 400
/** O PostgREST devolve no maximo 1000 linhas por chamada — o extrato e "as ultimas 1000", nao "todas". */
const TETO_CONSULTA = 1000

export function RelatorioClientes({ sessao }: { sessao: SessaoTeeds }) {
  const [dias, setDias] = useState<number>(30)
  const [comDemo, setComDemo] = useState(true)
  const [linhas, setLinhas] = useState<LinhaRelatorioCliente[]>([])
  const [conferencia, setConferencia] = useState<DiaConferencia[]>([])
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<LinhaRelatorioCliente | null>(null)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    Promise.all([relatorioClientes(sessao, dias, comDemo), conferenciaComissao(sessao, dias)])
      .then(([r, c]) => { if (vivo) { setLinhas(r); setConferencia(c) } })
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [sessao.token, dias, comDemo])

  const totais = useMemo(() => {
    const ativos = linhas.filter((l) => l.operacoes > 0)
    return {
      clientes: ativos.length,
      operacoes: ativos.reduce((s, l) => s + l.operacoes, 0),
      resultado: ativos.reduce((s, l) => s + l.resultado, 0),
      comissao: ativos.reduce((s, l) => s + l.comissaoCalculada, 0),
      comissaoReal: ativos.reduce((s, l) => s + l.comissaoReal, 0),
      ganhando: ativos.filter((l) => l.resultado > 0).length,
      perdendo: ativos.filter((l) => l.resultado < 0).length,
      semResultado: ativos.reduce((s, l) => s + l.diasSemResultado, 0),
    }
  }, [linhas])

  const oficialTotal = conferencia.reduce((s, d) => s + d.oficial, 0)
  const calculadaTotal = conferencia.reduce((s, d) => s + d.calculada, 0)
  const temOficial = conferencia.some((d) => d.oficial > 0)

  return <>
    <div className="rc-filtros">
      <div className="rc-periodo">{PERIODOS.map((p) => <button key={p} className={dias === p ? 'on' : ''} onClick={() => setDias(p)}>{p} dias</button>)}</div>
      <label className="rc-demo"><input type="checkbox" checked={comDemo} onChange={(e) => setComDemo(e.target.checked)} /> Incluir contas de demonstração</label>
      {carregando && <span className="rc-carregando">atualizando…</span>}
    </div>

    <div className="adm-kpis">
      <article><span>Clientes que operaram</span><strong>{totais.clientes}</strong><small>{totais.ganhando} no lucro · {totais.perdendo} no prejuízo</small></article>
      <article><span>Operações · {dias} dias</span><strong>{inteiro(totais.operacoes)}</strong><small>{comDemo ? 'reais e demonstração' : 'só contas reais'}</small></article>
      <article className={totais.resultado >= 0 ? 'ok' : 'perigo'}><span>Resultado dos clientes</span><strong>{usd(totais.resultado, true)}</strong><small>o que eles ganharam ou perderam, somado</small></article>
      <article className="alerta"><span>Comissão calculada</span><strong>{usd(totais.comissao)}</strong><small>{usd(totais.comissaoReal)} em conta real</small></article>
    </div>

    {totais.semResultado > 0 && <div className="rc-aviso">
      <b>Resultado parcial.</b> {totais.semResultado} {totais.semResultado === 1 ? 'dia foi gravado' : 'dias foram gravados'} pela varredura antiga, que só conhecia a comissão — o resultado desses dias aparece como zero. Eles são recalculados quando o cliente abre a Gestão de novo.
    </div>}

    <section className="admin-card full">
      <header><div><span className="rot">Por cliente · {dias} dias</span><h3>Quem operou, quanto sobrou, quanto rendeu</h3></div><small>{linhas.length} {linhas.length === 1 ? 'cliente' : 'clientes'} na base</small></header>
      <div className="rc-tabela">
        <div className="cab"><span>Cliente</span><span>Contas</span><span>Operações</span><span>Entradas</span><span>Pagamentos</span><span>Resultado</span><span>Comissão</span><span>Robôs</span><span>Último dia</span></div>
        {linhas.filter((l) => l.operacoes > 0 || l.operacoesRobos > 0).map((l) => (
          <button key={l.userId} onClick={() => setAberto(l)}>
            <span className="adm-pessoa"><i>{(l.nome || l.email || '?')[0].toUpperCase()}</i><b>{l.nome || 'Sem nome'}<small>{l.email}</small></b></span>
            <span>{l.contas}{l.contasReais ? <small>{l.contasReais} real</small> : <small>só demo</small>}</span>
            <span>{inteiro(l.operacoes)}</span>
            <span>{usd(l.entradas)}</span>
            <span>{usd(l.pagamentos)}</span>
            <span className={classe(l.resultado)}>{usd(l.resultado, true)}{l.diasSemResultado > 0 && <small title="dias gravados pela varredura antiga, sem resultado">{l.diasSemResultado}d sem resultado</small>}</span>
            <strong>{usd(l.comissaoCalculada)}{l.comissaoReal !== l.comissaoCalculada && <small>{usd(l.comissaoReal)} real</small>}</strong>
            <span>{inteiro(l.operacoesRobos)}<small className={classe(l.resultadoRobos)}>{usd(l.resultadoRobos, true)}</small></span>
            <span>{diaBr(l.ultimoDia)}</span>
          </button>
        ))}
        {!carregando && !linhas.some((l) => l.operacoes > 0 || l.operacoesRobos > 0) && <div className="adm-vazio">Nenhum cliente operou nesse período.</div>}
      </div>
    </section>

    <section className="admin-card full rc-conferencia">
      <header>
        <div><span className="rot">Conferência · só conta real</span><h3>O nosso número e o da Deriv, dia a dia</h3></div>
        <div className="rc-totais"><span>calculada <b>{usd(calculadaTotal)}</b></span><span>oficial <b>{usd(oficialTotal)}</b></span>{temOficial && <span className={classe(calculadaTotal - oficialTotal)}>diferença <b>{usd(calculadaTotal - oficialTotal, true)}</b></span>}</div>
      </header>
      {!temOficial && <div className="rc-aviso neutro">
        <b>O total oficial ainda não foi gravado.</b> A Deriv só entrega esse número para o dono do app, pela aba <em>Comissões</em>. Abra ela com a sua conta uma vez por período e a coluna preenche — a comparação passa a ser automática daí em diante.
      </div>}
      {conferencia.length > 0 && <div className="rc-tabela dias">
        <div className="cab"><span>Dia</span><span>Calculada</span><span>Oficial</span><span>Diferença</span><span>%</span><span>Operações</span><span>Clientes</span></div>
        {conferencia.map((d) => (
          <div key={d.dia}>
            <span>{diaBr(d.dia)}</span>
            <span>{usd(d.calculada)}</span>
            <span>{d.oficial ? usd(d.oficial) : <small>—</small>}</span>
            <span className={d.oficial ? classe(d.diferenca) : ''}>{d.oficial ? usd(d.diferenca, true) : <small>—</small>}</span>
            <span>{d.diferencaPct === null ? <small>—</small> : `${d.diferencaPct > 0 ? '+' : ''}${d.diferencaPct.toFixed(2)}%`}</span>
            <span>{inteiro(d.operacoes)}</span>
            <span>{d.clientes}</span>
          </div>
        ))}
      </div>}
      {!carregando && conferencia.length === 0 && <div className="adm-vazio">Nenhuma operação em conta real nesse período.</div>}
    </section>

    {aberto && <ExtratoCliente sessao={sessao} cliente={aberto} dias={dias} fechar={() => setAberto(null)} />}
  </>
}

/** O extrato de um cliente: as operações dos robôs, uma a uma, com os dois markups. */
function ExtratoCliente({ sessao, cliente, dias, fechar }: { sessao: SessaoTeeds; cliente: LinhaRelatorioCliente; dias: number; fechar: () => void }) {
  const [ops, setOps] = useState<OperacaoRoboRegistro[] | null>(null)
  useEffect(() => {
    let vivo = true
    operacoesDoCliente(sessao, cliente.userId, dias).then((o) => vivo && setOps(o))
    return () => { vivo = false }
  }, [sessao.token, cliente.userId, dias])

  const resumo = useMemo(() => {
    const lista = ops ?? []
    const medidas = lista.filter((o) => o.markupDeriv !== null && o.markupDeriv !== undefined)
    return {
      vitorias: lista.filter((o) => o.ganhou).length,
      markupCalc: lista.reduce((s, o) => s + o.markup, 0),
      markupDeriv: medidas.reduce((s, o) => s + (o.markupDeriv ?? 0), 0),
      medidas: medidas.length,
      robos: [...new Set(lista.map((o) => o.roboNome))],
    }
  }, [ops])

  const visiveis = (ops ?? []).slice(0, MAX_LINHAS_EXTRATO)

  return <div className="adm-modal-fundo" onMouseDown={fechar}>
    <section className="adm-modal rc-extrato" onMouseDown={(e) => e.stopPropagation()}>
      <header>
        <div className="adm-pessoa"><i>{(cliente.nome || cliente.email || '?')[0].toUpperCase()}</i><b>{cliente.nome || 'Sem nome'}<small>{cliente.email}</small></b></div>
        <button onClick={fechar}>×</button>
      </header>
      <div className="adm-detail-kpis">
        <div><span>Operações · {dias}d</span><b>{inteiro(cliente.operacoes)}</b></div>
        <div><span>Resultado</span><b className={classe(cliente.resultado)}>{usd(cliente.resultado, true)}</b></div>
        <div><span>Comissão calculada</span><b>{usd(cliente.comissaoCalculada)}</b></div>
        <div><span>Contas</span><b>{cliente.contas} · {cliente.contasReais} real</b></div>
      </div>
      <div className="rc-extrato-corpo">
        <div className="rc-extrato-resumo">
          <span className="rot">Extrato dos robôs</span>
          {ops === null ? <p>Carregando…</p> : ops.length === 0
            ? <p>Nenhuma operação de robô registrada nesse período. O extrato operação a operação existe só para o que os robôs da Teeds executaram a partir de 04/09 — o que veio antes, ou foi manual, entra só nos totais do dia.</p>
            : <p>{ops.length >= TETO_CONSULTA ? <>últimas <b>{inteiro(ops.length)}</b> operações <small>(teto da consulta — o cliente tem {inteiro(cliente.operacoesRobos)} no período)</small></> : <>{inteiro(ops.length)} operações</>} · {resumo.vitorias} vitórias ({ops.length ? Math.round(resumo.vitorias / ops.length * 100) : 0}%) · {resumo.robos.join(', ')}<br />
              markup calculado <b>{usd(resumo.markupCalc)}</b> · markup medido pela Deriv <b>{resumo.medidas ? usd(resumo.markupDeriv) : '—'}</b> <small>({resumo.medidas} de {ops.length} operações com o valor da Deriv)</small></p>}
        </div>
        {visiveis.length > 0 && <div className="rc-tabela ops">
          <div className="cab"><span>Quando</span><span>Robô</span><span>Conta</span><span>Entrada → Pagamento</span><span>Resultado</span><span>Markup calc.</span><span>Markup Deriv</span></div>
          {visiveis.map((o) => (
            <div key={o.contractId}>
              <span>{horaBr(o.executadaEm)}</span>
              <span>{o.roboNome}<small>{o.ativo} · {o.tipoContrato}</small></span>
              <span>{o.contaId}<small>{o.demo ? 'demo' : 'real'}</small></span>
              <span>{o.entrada.toFixed(2)} → {o.pagamento.toFixed(2)}</span>
              <span className={o.ganhou ? 'positivo' : 'negativo'}>{o.resultado > 0 ? '+' : ''}{o.resultado.toFixed(2)}</span>
              <span>{o.markup.toFixed(4)}</span>
              <span>{o.markupDeriv === null || o.markupDeriv === undefined ? <small>não informado</small> : o.markupDeriv.toFixed(4)}</span>
            </div>
          ))}
          {(ops?.length ?? 0) > MAX_LINHAS_EXTRATO && <div className="adm-vazio">Mostrando as {MAX_LINHAS_EXTRATO} mais recentes de {inteiro(ops!.length)}.</div>}
        </div>}
      </div>
    </section>
  </div>
}
