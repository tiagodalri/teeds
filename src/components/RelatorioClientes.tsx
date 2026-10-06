import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import {
  conferenciaComissao, operacoesDoCliente, relatorioClientesPorConta,
  type DiaConferencia, type LinhaClientePorConta, type MedidasDaConta, type OperacaoRoboRegistro,
} from '../core/teeds/clientes'
import { MARCA } from '../marca'
import { IconeFechar } from './IconeFechar'

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

/*
  CONTA REAL E DEMONSTRAÇÃO NÃO SE SOMAM.

  Antes a tela tinha um "Incluir contas de demonstração" marcado por padrão, e
  os números saíam somados: a "Comissão calculada" anunciava US$ 23.547,45
  quando só US$ 25,38 eram de verdade — 685 operações reais contra 31.741 de
  demonstração no mesmo período. O destaque da tela era ficção.

  Agora são três escolhas explícitas, e o padrão é CONTA REAL: é o dinheiro que
  existe. Em "Lado a lado" nada é somado — cada número aparece duas vezes,
  rotulado, porque US$ 1 de demonstração não vale US$ 1.
*/
type Conta = 'real' | 'demo' | 'ambas'
const CONTAS: Array<[Conta, string]> = [['real', 'Conta real'], ['demo', 'Demonstração'], ['ambas', 'Lado a lado']]
/** O lado que manda nos totais e na ordenação quando os dois aparecem. */
const principal = (l: LinhaClientePorConta, conta: Conta): MedidasDaConta => conta === 'demo' ? l.demo : l.real
const operou = (m: MedidasDaConta) => m.operacoes > 0 || m.operacoesRobos > 0
const VAZIO: MedidasDaConta = { contas: 0, operacoes: 0, entradas: 0, pagamentos: 0, resultado: 0, comissao: 0, operacoesRobos: 0, resultadoRobos: 0, markupRobos: 0, ultimoDia: null }
const somaDoLado = (linhas: LinhaClientePorConta[], lado: 'real' | 'demo'): MedidasDaConta =>
  linhas.reduce((s, l) => {
    const m = l[lado]
    return { contas: s.contas + m.contas, operacoes: s.operacoes + m.operacoes, entradas: s.entradas + m.entradas,
      pagamentos: s.pagamentos + m.pagamentos, resultado: s.resultado + m.resultado, comissao: s.comissao + m.comissao,
      operacoesRobos: s.operacoesRobos + m.operacoesRobos, resultadoRobos: s.resultadoRobos + m.resultadoRobos,
      markupRobos: s.markupRobos + m.markupRobos, ultimoDia: null }
  }, { ...VAZIO })
const MAX_LINHAS_EXTRATO = 400
/** O PostgREST devolve no maximo 1000 linhas por chamada — o extrato e "as ultimas 1000", nao "todas". */
const TETO_CONSULTA = 1000

export function RelatorioClientes({ sessao }: { sessao: SessaoTeeds }) {
  const [dias, setDias] = useState<number>(30)
  /* Começa em conta real: é o dinheiro que existe. */
  const [conta, setConta] = useState<Conta>('real')
  const [linhas, setLinhas] = useState<LinhaClientePorConta[]>([])
  const [conferencia, setConferencia] = useState<DiaConferencia[]>([])
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<LinhaClientePorConta | null>(null)

  /* O período muda a consulta; a conta NÃO. Os dois lados vêm sempre do banco,
     separados, e trocar de conta só muda o que a tela mostra — sem ida à rede
     e sem chance de os números de um lado ficarem de outra consulta. */
  useEffect(() => {
    let vivo = true
    setCarregando(true)
    Promise.all([relatorioClientesPorConta(sessao, dias), conferenciaComissao(sessao, dias)])
      .then(([r, c]) => { if (vivo) { setLinhas(r); setConferencia(c) } })
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [sessao.token, dias])

  const totais = useMemo(() => {
    // Em "Lado a lado" quem opera dos dois jeitos conta uma vez só.
    const ativos = linhas.filter((l) => conta === 'ambas' ? (operou(l.real) || operou(l.demo)) : operou(principal(l, conta)))
    const lado = (l: 'real' | 'demo') => somaDoLado(ativos, l)
    const m = conta === 'demo' ? lado('demo') : lado('real')
    return {
      clientes: ativos.length,
      real: lado('real'), demo: lado('demo'), vendo: m,
      ganhando: ativos.filter((l) => principal(l, conta === 'ambas' ? 'real' : conta).resultado > 0).length,
      perdendo: ativos.filter((l) => principal(l, conta === 'ambas' ? 'real' : conta).resultado < 0).length,
      semResultado: ativos.reduce((s, l) => s + l.diasSemResultado, 0),
    }
  }, [linhas, conta])

  const visiveis = useMemo(() =>
    linhas.filter((l) => conta === 'ambas' ? (operou(l.real) || operou(l.demo)) : operou(principal(l, conta))),
    [linhas, conta])

  const oficialTotal = conferencia.reduce((s, d) => s + d.oficial, 0)
  const calculadaTotal = conferencia.reduce((s, d) => s + d.calculada, 0)
  const temOficial = conferencia.some((d) => d.oficial > 0)
  /* Só houve demonstração no período: não há comissão a conferir, e a
     ausência do número oficial está certa. */
  const soDemo = conferencia.length > 0 && conferencia.every((d) => d.soDemo)

  return <>
    <div className="rc-filtros">
      <div className="rc-periodo">{PERIODOS.map((p) => <button key={p} className={dias === p ? 'on' : ''} onClick={() => setDias(p)}>{p} dias</button>)}</div>
      <div className="rc-conta" role="group" aria-label="Tipo de conta">
        {CONTAS.map(([id, nome]) => <button key={id} className={conta === id ? 'on' : ''} aria-pressed={conta === id} onClick={() => setConta(id)}>{nome}</button>)}
      </div>
      {carregando && <span className="rc-carregando">atualizando…</span>}
    </div>

    <div className="adm-kpis">
      <article><span>Clientes que operaram</span><strong>{totais.clientes}</strong><small>{conta === 'demo' ? 'em demonstração' : `${totais.ganhando} no lucro · ${totais.perdendo} no prejuízo`}</small></article>
      {/* Cada cartão mostra UM mundo por vez. Em "Lado a lado" os dois aparecem
          na mesma ficha, um sobre o outro — nunca somados numa cifra só. */}
      <article><span>Operações · {dias} dias</span>
        <strong>{inteiro(totais.vendo.operacoes)}</strong>
        <small>{conta === 'ambas' ? `${inteiro(totais.demo.operacoes)} em demonstração` : conta === 'demo' ? 'dinheiro de mentira' : 'só contas reais'}</small></article>
      <article className={totais.vendo.resultado >= 0 ? 'ok' : 'perigo'}><span>Resultado dos clientes</span>
        <strong>{usd(totais.vendo.resultado, true)}</strong>
        <small>{conta === 'ambas' ? `${usd(totais.demo.resultado, true)} em demonstração` : conta === 'demo' ? 'resultado fictício' : 'o que ganharam ou perderam de verdade'}</small></article>
      <article className="alerta"><span>Comissão {conta === 'demo' ? 'simulada' : 'calculada'}</span>
        <strong>{usd(totais.vendo.comissao)}</strong>
        <small>{conta === 'ambas' ? `${usd(totais.demo.comissao)} seria em demonstração` : conta === 'demo' ? 'não entra no caixa' : 'comissão de verdade'}</small></article>
    </div>

    {totais.semResultado > 0 && <div className="rc-aviso">
      <b>Resultado parcial.</b> {totais.semResultado} {totais.semResultado === 1 ? 'dia foi gravado' : 'dias foram gravados'} pela varredura antiga, que só conhecia a comissão — o resultado desses dias aparece como zero. Eles são recalculados quando o cliente abre a Gestão de novo.
    </div>}

    <section className="admin-card full">
      <header><div><span className="rot">Por cliente · {dias} dias · {conta === 'real' ? 'conta real' : conta === 'demo' ? 'demonstração' : 'real e demonstração, lado a lado'}</span><h3>Quem operou, quanto sobrou, quanto rendeu</h3></div><small>{visiveis.length} {visiveis.length === 1 ? 'cliente' : 'clientes'}{linhas.length >= TETO_CONSULTA ? ` · lista cortada nos ${inteiro(TETO_CONSULTA)} primeiros` : ''}</small></header>
      <div className={`rc-tabela ${conta === 'ambas' ? 'lado-a-lado' : ''}`}>
        <div className="cab"><span>Cliente</span><span>Contas</span><span>Operações</span><span>Entradas</span><span>Pagamentos</span><span>Resultado</span><span>Comissão</span><span>Robôs</span><span>Último dia</span></div>
        {visiveis.map((l) => {
          const m = principal(l, conta === 'ambas' ? 'real' : conta)
          const d = l.demo
          const dois = conta === 'ambas'
          /* Em "Lado a lado" a segunda linha de cada célula é a demonstração,
             sempre com a tarja `rc-demo-val`: a cor cinza e o rótulo são o que
             impedem alguém de ler US$ 23 mil de mentira como receita. */
          const par = (real: string, demo: string, cls?: string) =>
            <>{<span className={cls}>{real}</span>}{dois && <small className="rc-demo-val">{demo}</small>}</>
          return (
          <button key={l.userId} onClick={() => setAberto(l)}>
            <span className="adm-pessoa"><i>{(l.nome || l.email || '?')[0].toUpperCase()}</i><b>{l.nome || 'Sem nome'}<small>{l.email}</small></b></span>
            <span>{dois ? par(`${m.contas} real`, String(d.contas)) : <>{m.contas}<small>{conta === 'demo' ? 'demo' : 'real'}</small></>}</span>
            <span>{par(inteiro(m.operacoes), inteiro(d.operacoes))}</span>
            <span>{par(usd(m.entradas), usd(d.entradas))}</span>
            <span>{par(usd(m.pagamentos), usd(d.pagamentos))}</span>
            <span>{par(usd(m.resultado, true), usd(d.resultado, true), classe(m.resultado))}{l.diasSemResultado > 0 && <small title="dias gravados pela varredura antiga, sem resultado">{l.diasSemResultado}d sem resultado</small>}</span>
            <strong>{par(usd(m.comissao), usd(d.comissao))}</strong>
            <span>{par(inteiro(m.operacoesRobos), inteiro(d.operacoesRobos))}</span>
            <span>{diaBr(conta === 'demo' ? d.ultimoDia : m.ultimoDia)}</span>
          </button>
        )})}
        {!carregando && !visiveis.length && <div className="adm-vazio">Nenhum cliente operou {conta === 'demo' ? 'em demonstração' : conta === 'real' ? 'em conta real' : ''} nesse período.</div>}
      </div>
    </section>

    <section className="admin-card full rc-conferencia">
      <header>
        <div><span className="rot">Conferência · só conta real</span><h3>O nosso número e o da Deriv, dia a dia</h3></div>
        <div className="rc-totais"><span>calculada <b>{usd(calculadaTotal)}</b></span><span>oficial <b>{usd(oficialTotal)}</b></span>{temOficial && <span className={classe(calculadaTotal - oficialTotal)}>diferença <b>{usd(calculadaTotal - oficialTotal, true)}</b></span>}</div>
      </header>
      {/*
        Falta o número oficial? Antes de acusar problema, é preciso saber por
        quê. Só uma das três razões é defeito.
      */}
      {!temOficial && (soDemo ? (
        <div className="rc-aviso neutro">
          <b>Nada a conferir ainda.</b> No período todo só houve operação em
          conta de demonstração, e demonstração não gera comissão. Assim que a
          primeira operação em conta real acontecer, a coluna oficial começa a
          preencher sozinha.
        </div>
      ) : (
        <div className="rc-aviso neutro">
          <b>O total oficial ainda não chegou.</b> A Deriv leva de uma a duas
          horas para publicar o número do dia — o de hoje quase sempre aparece
          vazio, e isso é atraso, não erro. Se um dia antigo continuar vazio,
          abra a aba <em>Comissões</em> uma vez: é ela que grava o número
          oficial, e só o dono do app consegue lê-lo.
        </div>
      ))}
      {conferencia.length > 0 && <div className="rc-tabela dias">
        <div className="cab"><span>Dia</span><span>Calculada</span><span>Oficial</span><span>Diferença</span><span>%</span><span>Operações</span><span>Clientes</span></div>
        {conferencia.map((d) => (
          <div key={d.dia}>
            <span>{diaBr(d.dia)}</span>
            <span>{usd(d.calculada)}</span>
            <span>{d.oficial ? usd(d.oficial) : <small>—</small>}</span>
            <span className={d.oficial ? classe(d.diferenca) : ''}>{d.oficial ? usd(d.diferenca, true) : <small>—</small>}</span>
            <span>{d.diferencaPct === null
              ? <small title={d.soDemo ? 'Só demonstração nesse dia — não gera comissão' : 'O número da Deriv ainda não chegou'}>—</small>
              : `${d.diferencaPct > 0 ? '+' : ''}${d.diferencaPct.toFixed(2)}%`}</span>
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
function ExtratoCliente({ sessao, cliente, dias, fechar }: { sessao: SessaoTeeds; cliente: LinhaClientePorConta; dias: number; fechar: () => void }) {
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
        <button onClick={fechar}><IconeFechar /></button>
      </header>
      <div className="adm-detail-kpis">
        <div><span>Operações · {dias}d</span><b>{inteiro(cliente.real.operacoes)}</b>{cliente.demo.operacoes > 0 && <small className="rc-demo-val">{inteiro(cliente.demo.operacoes)} em demonstração</small>}</div>
        <div><span>Resultado</span><b className={classe(cliente.real.resultado)}>{usd(cliente.real.resultado, true)}</b>{cliente.demo.operacoes > 0 && <small className="rc-demo-val">{usd(cliente.demo.resultado, true)} em demonstração</small>}</div>
        <div><span>Comissão de verdade</span><b>{usd(cliente.real.comissao)}</b>{cliente.demo.comissao > 0 && <small className="rc-demo-val">{usd(cliente.demo.comissao)} seria em demonstração</small>}</div>
        <div><span>Contas</span><b>{cliente.real.contas} real</b>{cliente.demo.contas > 0 && <small className="rc-demo-val">{cliente.demo.contas} demo</small>}</div>
      </div>
      <div className="rc-extrato-corpo">
        <div className="rc-extrato-resumo">
          <span className="rot">Extrato dos robôs</span>
          {ops === null ? <p>Carregando…</p> : ops.length === 0
            ? <p>Nenhuma operação de robô registrada nesse período. O extrato operação a operação existe só para o que os robôs da {MARCA.prosa} executaram a partir de 04/09 — o que veio antes, ou foi manual, entra só nos totais do dia.</p>
            : <p>{ops.length >= TETO_CONSULTA ? <>últimas <b>{inteiro(ops.length)}</b> operações <small>(teto da consulta — o cliente tem {inteiro(cliente.real.operacoesRobos + cliente.demo.operacoesRobos)} no período)</small></> : <>{inteiro(ops.length)} operações</>} · {resumo.vitorias} vitórias ({ops.length ? Math.round(resumo.vitorias / ops.length * 100) : 0}%) · {resumo.robos.join(', ')}<br />
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
