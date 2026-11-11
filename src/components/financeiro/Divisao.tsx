/* Divisão: como o resultado se divide entre os sócios e o acerto de cada um desde o início. */
import { useMemo } from 'react'
import { ROTULO_TIPO, dataCurta, devolucoes, diaDe, dividir, reais, type DadosFin, type Lancamento, type Periodo } from '../../core/teeds/financeiro'
import { Icone } from '../Icone'
import { Avatar, Vazio } from './ui'
import type { Rascunho } from './EditorLancamento'

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

export function Divisao({ dados, periodo, rotuloPeriodo, podeEditar, souDono, aoNovo, aoAbrir, aoIr }: {
  dados: DadosFin; periodo: Periodo; rotuloPeriodo: string; podeEditar: boolean; souDono: boolean
  aoNovo: (r: Rascunho) => void
  aoAbrir: (l: Lancamento) => void
  aoIr: () => void
}) {
  const d = useMemo(() => dividir(dados, periodo), [dados, periodo])
  const devol = useMemo(() => devolucoes(dados), [dados])
  const movimentos = useMemo(() => dados.lancamentos.filter((l) => l.socio_id).sort((a, b) => diaDe(b).localeCompare(diaDe(a))), [dados.lancamentos])
  const soc = new Map(dados.socios.map((s) => [s.id, s]))
  const ativos = d.linhas.filter((l) => l.socio.ativo)

  if (!dados.socios.length) {
    return <section className="fin-cartao"><Vazio icone={<Icone nome="parceiros" />} titulo="Cadastre os sócios"
      texto="Informe quem são os sócios e o percentual de cada um. A divisão do resultado e o acerto entre vocês aparecem aqui."
      acoes={<button className="fin-btn primario" onClick={aoIr}>{souDono ? 'Cadastrar sócios' : 'Ver cadastros'}</button>} /></section>
  }

  const diferenca = Math.round((d.somaPercentual - 100) * 100) / 100

  return <div className="fin-divisao">
    {diferenca !== 0 && <p className="fin-alerta" role="status"><Icone nome="info" />
      <span>Os percentuais dos sócios somam <b>{pct(d.somaPercentual)}</b>{diferenca < 0 ? `; faltam ${pct(-diferenca)} para fechar 100%` : `; passam ${pct(diferenca)} de 100%`}. A divisão abaixo usa os percentuais como estão.</span>
      {souDono && <button type="button" className="fin-link" onClick={aoIr}>Ajustar</button>}</p>}

    <section className="fin-cartao fin-divisao-topo">
      <div className="fin-divisao-resultado">
        <span className="fin-rot">Resultado · {rotuloPeriodo}</span>
        <strong className={d.resultadoPeriodo < 0 ? 'negativo' : 'positivo'}>{reais(d.resultadoPeriodo)}</strong>
        <small>Receitas menos despesas pagas no período. Desde o início: <b>{reais(d.resultadoTotal)}</b>.</small>
      </div>
      <div className="fin-divisao-barra" aria-label="Divisão entre os sócios">
        {ativos.map((l) => <span key={l.socio.id} style={{ ['--fin-cor' as string]: l.socio.cor, flexGrow: Math.max(l.socio.percentual, 0.5) }} title={`${l.socio.nome} · ${pct(l.socio.percentual)}`}>
          <b>{l.socio.nome.split(' ')[0]}</b><small>{pct(l.socio.percentual)}</small></span>)}
      </div>
    </section>

    <div className="fin-socios">
      {d.linhas.map((l) => {
        const deve = l.saldo < -0.004, recebe = l.saldo > 0.004
        return <article key={l.socio.id} className={`fin-cartao fin-socio${l.socio.ativo ? '' : ' arquivado'}`} style={{ ['--fin-cor' as string]: l.socio.cor }}>
          <header>
            <Avatar nome={l.socio.nome} cor={l.socio.cor} tamanho={42} />
            <div><h3>{l.socio.nome}</h3><small>{l.socio.ativo ? `${pct(l.socio.percentual)} do resultado` : 'Sócio arquivado'}</small></div>
          </header>
          <div className="fin-socio-parte"><span>Parte no resultado · {rotuloPeriodo}</span><strong className={l.parte < 0 ? 'negativo' : ''}>{reais(l.parte)}</strong></div>
          <dl className="fin-socio-conta">
            <div><dt>Parte acumulada desde o início</dt><dd>{reais(l.parteTotal)}</dd></div>
            <div><dt>Colocou no projeto<small>Aportes e despesas pagas do bolso</small></dt><dd className="fin-entra">+ {reais(l.colocou)}</dd></div>
            <div><dt>Já tirou<small>Retiradas e receitas na conta pessoal</small></dt><dd className="fin-sai">− {reais(l.tirou)}</dd></div>
          </dl>
          <div className={`fin-socio-saldo ${deve ? 'deve' : recebe ? 'recebe' : 'zerado'}`}>
            <span>{deve ? 'Deve ao projeto' : recebe ? 'Tem a receber' : 'Acerto em dia'}</span>
            <strong>{reais(Math.abs(l.saldo))}</strong>
          </div>
          {podeEditar && l.socio.ativo && <footer>
            <button type="button" className="fin-btn" onClick={() => aoNovo({ tipo: 'retirada', socio_id: l.socio.id, valor: recebe ? Math.round(l.saldo * 100) / 100 : undefined, descricao: `Retirada de ${l.socio.nome.split(' ')[0]}` })}>Registrar retirada</button>
            <button type="button" className="fin-btn" onClick={() => aoNovo({ tipo: 'aporte', socio_id: l.socio.id, valor: deve ? Math.round(-l.saldo * 100) / 100 : undefined, descricao: `Aporte de ${l.socio.nome.split(' ')[0]}` })}>Registrar aporte</button>
          </footer>}
        </article>
      })}
    </div>

    <p className="fin-explica"><Icone nome="info" />
      <span>O acerto supõe que todo o resultado é dividido. <b>Tem a receber</b> = parte acumulada + o que colocou − o que já tirou. Despesa paga do próprio bolso conta como dinheiro colocado; receita que caiu na conta pessoal conta como dinheiro já tirado.</span></p>

    {devol.length > 0 && <section className="fin-cartao">
      <header><div><span className="fin-rot">Gastos de projetos de parceiros pagos por sócios</span><h3>Parceiros devem aos sócios</h3></div></header>
      <ul className="fin-devolucoes">
        {devol.map((x) => <li key={`${x.parceiro.codigo}-${x.socio.id}`}>
          <span className="fin-devolucoes-quem"><Avatar nome={x.parceiro.nome} cor={x.parceiro.cor} tamanho={34} /><i aria-hidden="true">→</i><Avatar nome={x.socio.nome} cor={x.socio.cor} tamanho={34} />
            <span><b>{x.parceiro.nome.split(' ')[0]} deve a {x.socio.nome.split(' ')[0]}</b><small>Pagou {reais(x.devido)} · já devolveu {reais(x.devolvido)}</small></span></span>
          <strong className={x.saldo > 0.004 ? 'fin-sai' : 'fin-entra'}>{x.saldo > 0.004 ? reais(x.saldo) : 'Em dia'}</strong>
          {podeEditar && x.saldo > 0.004 && <button type="button" className="fin-btn pequeno" onClick={() => aoNovo({ tipo: 'devolucao', socio_id: x.socio.id, pago_por: x.parceiro.codigo, valor: x.saldo, descricao: `Devolução de ${x.parceiro.nome.split(' ')[0]} a ${x.socio.nome.split(' ')[0]}` })}>Registrar devolução</button>}
        </li>)}
      </ul>
    </section>}

    <section className="fin-cartao">
      <header><div><span className="fin-rot">Desde o início</span><h3>Movimentos dos sócios</h3></div><small>{movimentos.length} {movimentos.length === 1 ? 'movimento' : 'movimentos'}</small></header>
      {movimentos.length ? <ul className="fin-movimentos">
        {movimentos.slice(0, 60).map((m) => {
          const s = m.socio_id ? soc.get(m.socio_id) : null
          const colocou = m.tipo === 'aporte' || m.tipo === 'despesa'
          const legenda = m.tipo === 'devolucao' ? 'Recebeu devolução de parceiro' : m.tipo === 'despesa' && m.pago_fora ? 'Pagou gasto de projeto de parceiro' : m.tipo === 'despesa' ? 'Pagou do bolso' : m.tipo === 'receita' ? 'Recebeu na conta pessoal' : ROTULO_TIPO[m.tipo]
          return <li key={m.id}><button type="button" onClick={() => aoAbrir(m)}>
            <Avatar nome={s?.nome ?? '?'} cor={s?.cor} tamanho={32} />
            <span><b>{m.descricao}</b><small>{s?.nome} · {legenda} · {m.pago_em ? dataCurta(m.pago_em) : `Previsto ${dataCurta(m.vencimento)}`}</small></span>
            <strong className={colocou ? 'fin-entra' : 'fin-sai'}>{colocou ? '+' : '−'} {reais(m.valor)}</strong>
          </button></li>
        })}
      </ul> : <p className="fin-cartao-vazio">Nenhum aporte, retirada ou pagamento do próprio bolso ainda.</p>}
    </section>
  </div>
}
