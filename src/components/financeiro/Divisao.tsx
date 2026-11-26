/* Divisão: como o resultado se divide entre os sócios e o acerto de cada um desde o início. */
import { useMemo } from 'react'
import { ROTULO_TIPO, dataCurta, diaDe, dividir, reais, type DadosFin, type Lancamento, type Periodo } from '../../core/teeds/financeiro'
import { Icone } from '../Icone'
import { Avatar, Vazio } from './ui'
import type { Rascunho } from './EditorLancamento'
import { Partilha } from './Partilha'
import type { FinApi } from '../../core/teeds/financeiro'

export function Divisao({ api, restrito = false, dados, periodo, rotuloPeriodo, podeEditar, souDono, aoNovo, aoAbrir, aoIr, aoMudar }: {
  api: FinApi
  /** vê só alguns projetos: só a divisão desses projetos, sem o acerto entre os sócios */
  restrito?: boolean
  aoMudar: (mensagem: string) => void
  dados: DadosFin; periodo: Periodo; rotuloPeriodo: string; podeEditar: boolean; souDono: boolean
  aoNovo: (r: Rascunho) => void
  aoAbrir: (l: Lancamento) => void
  aoIr: () => void
}) {
  const d = useMemo(() => dividir(dados, periodo), [dados, periodo])
  // só o que já aconteceu (pago_em), como no acerto acima: uma assinatura mensal lançada para 12 meses
  // aparecia 12 vezes como "Pagou do bolso" (26/11/2026, Manychat do Victor), embora só a primeira estivesse paga
  const movimentos = useMemo(() => dados.lancamentos.filter((l) => l.socio_id && l.pago_em).sort((a, b) => diaDe(b).localeCompare(diaDe(a))), [dados.lancamentos])
  const soc = new Map(dados.socios.map((s) => [s.id, s]))

  if (restrito) return <div className="fin-divisao"><Partilha api={api} dados={dados} periodo={periodo} rotuloPeriodo={rotuloPeriodo} souDono={false} restrito aoMudar={aoMudar} /></div>

  if (!dados.socios.length) {
    return <section className="fin-cartao"><Vazio icone={<Icone nome="parceiros" />} titulo="Cadastre os sócios"
      texto="Informe quem são os sócios e o percentual de cada um. A divisão do resultado e o acerto entre vocês aparecem aqui."
      acoes={<button className="fin-btn primario" onClick={aoIr}>{souDono ? 'Cadastrar sócios' : 'Ver cadastros'}</button>} /></section>
  }

  return <div className="fin-divisao">
    <Partilha api={api} dados={dados} periodo={periodo} rotuloPeriodo={rotuloPeriodo} souDono={souDono} aoMudar={aoMudar} />
    <h2 className="fin-divisao-titulo">Acerto entre os sócios</h2>
    <p className="fin-divisao-sub">O que cada sócio já colocou e já tirou, contra a parte dele nos projetos desde o início.</p>

    <div className="fin-socios">
      {d.linhas.map((l) => {
        const deve = l.saldo < -0.004, recebe = l.saldo > 0.004
        return <article key={l.socio.id} className={`fin-cartao fin-socio${l.socio.ativo ? '' : ' arquivado'}`} style={{ ['--fin-cor' as string]: l.socio.cor }}>
          <header>
            <Avatar nome={l.socio.nome} cor={l.socio.cor} tamanho={42} />
            <div><h3>{l.socio.nome}</h3><small>{l.socio.ativo ? 'Sócio' : 'Sócio arquivado'}</small></div>
          </header>
          <div className="fin-socio-parte"><span>Parte nos projetos · {rotuloPeriodo}</span><strong className={l.parte < 0 ? 'negativo' : ''}>{reais(l.parte)}</strong></div>
          <dl className="fin-socio-conta">
            <div><dt>Parte nos projetos desde o início</dt><dd>{reais(l.parteTotal)}</dd></div>
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
      <span><b>Tem a receber</b> = parte nos projetos desde o início + o que colocou − o que já tirou. Despesa paga do próprio bolso conta como dinheiro colocado (o projeto devolve); receita que caiu na conta pessoal conta como dinheiro já tirado.</span></p>

    <section className="fin-cartao">
      <header><div><span className="fin-rot">Desde o início</span><h3>Movimentos dos sócios</h3></div><small>{movimentos.length} {movimentos.length === 1 ? 'movimento' : 'movimentos'}</small></header>
      {movimentos.length ? <ul className="fin-movimentos">
        {movimentos.slice(0, 60).map((m) => {
          const s = m.socio_id ? soc.get(m.socio_id) : null
          const colocou = m.tipo === 'aporte' || m.tipo === 'despesa'
          const legenda = m.tipo === 'devolucao' ? 'Recebeu devolução de parceiro' : m.tipo === 'despesa' && m.pago_fora ? 'Pagou gasto de projeto de parceiro (o projeto devolve)' : m.tipo === 'despesa' ? 'Pagou do bolso' : m.tipo === 'receita' ? 'Recebeu na conta pessoal' : ROTULO_TIPO[m.tipo]
          return <li key={m.id}><button type="button" onClick={() => aoAbrir(m)}>
            <Avatar nome={s?.nome ?? '?'} cor={s?.cor} tamanho={32} />
            <span><b>{m.descricao}</b><small>{s?.nome} · {legenda} · {dataCurta(m.pago_em!)}</small></span>
            <strong className={colocou ? 'fin-entra' : 'fin-sai'}>{colocou ? '+' : '−'} {reais(m.valor)}</strong>
          </button></li>
        })}
      </ul> : <p className="fin-cartao-vazio">Nenhum aporte, retirada ou pagamento do próprio bolso ainda.</p>}
    </section>
  </div>
}
