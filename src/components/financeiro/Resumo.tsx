/* Resumo: os números do período, o mês a mês, para onde foi e de onde veio, o que vence e o saldo das contas. */
import { useMemo, useState } from 'react'
import {
  dataCurta, diasEntre, ehEntrada, hoje, mesAMes, nomeDoMes, porCategoria, reais, reaisCurto, resumir, saldosDasContas, situacaoDe,
  type DadosFin, type Lancamento, type Periodo,
} from '../../core/teeds/financeiro'
import { Icone } from '../Icone'
import { Vazio } from './ui'

/** O resultado do mês embaixo da barra, curto para caber: "1,1 mil", "−820", "12 mil". */
const compacto = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? '−' : ''
  if (a >= 1e6) return `${s}${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1e3) return `${s}${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: a >= 1e4 ? 0 : 1 })} mil`
  return `${s}${Math.round(a).toLocaleString('pt-BR')}`
}
const pct = (v: number) => `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

export function Resumo({ dados, periodo, rotuloPeriodo, podeEditar, aoNovo, aoAbrir, aoPagar, aoIr }: {
  dados: DadosFin; periodo: Periodo; rotuloPeriodo: string; podeEditar: boolean
  aoNovo: (tipo: 'despesa' | 'receita') => void
  aoAbrir: (l: Lancamento) => void
  aoPagar: (l: Lancamento) => void
  aoIr: (aba: 'lancamentos' | 'divisao' | 'cadastros', filtro?: 'pagar' | 'receber' | 'vencidos') => void
}) {
  const r = useMemo(() => resumir(dados, periodo), [dados, periodo])
  const meses = useMemo(() => mesAMes(dados, periodo.ate > hoje() ? hoje() : periodo.ate, 12), [dados, periodo.ate])
  const despesas = useMemo(() => porCategoria(dados, periodo, 'despesa'), [dados, periodo])
  const receitas = useMemo(() => porCategoria(dados, periodo, 'receita'), [dados, periodo])
  const contas = useMemo(() => saldosDasContas(dados).filter((c) => c.conta.ativo), [dados])
  const [abertos, setAbertos] = useState<'pagar' | 'receber'>('pagar')
  const hojeDia = hoje()
  const emAberto = useMemo(() => dados.lancamentos.filter((l) => !l.pago_em && ehEntrada(l.tipo) === (abertos === 'receber')).sort((a, b) => a.vencimento.localeCompare(b.vencimento)), [dados.lancamentos, abertos])
  const maxMes = Math.max(1, ...meses.map((m) => Math.max(m.entradas, m.saidas)))
  const temMeses = meses.some((m) => m.entradas || m.saidas)

  if (!dados.lancamentos.length) {
    return <section className="fin-cartao fin-comeco">
      <Vazio icone={<Icone nome="financeiro" />} titulo="Nenhum lançamento ainda"
        texto={<>Comece pelo que já aconteceu: os anúncios pagos, as ferramentas, o markup que entrou. Os números deste resumo aparecem conforme você lança.</>}
        acoes={podeEditar ? <>
          <button className="fin-btn primario" onClick={() => aoNovo('despesa')}><Icone nome="mais" />Lançar despesa</button>
          <button className="fin-btn" onClick={() => aoNovo('receita')}><Icone nome="mais" />Lançar receita</button>
          <button className="fin-btn texto" onClick={() => aoIr('cadastros')}>Cadastrar sócios e contas</button>
        </> : undefined} />
    </section>
  }

  const situacaoTxt = (l: Lancamento) => {
    const d = diasEntre(hojeDia, l.vencimento)
    return d < 0 ? `Venceu há ${-d} ${d === -1 ? 'dia' : 'dias'}` : d === 0 ? 'Vence hoje' : d === 1 ? 'Vence amanhã' : `Vence em ${dataCurta(l.vencimento)}`
  }

  return <div className="fin-resumo">
    <div className="fin-kpis">
      <article className="fin-kpi fin-entra"><span>Receitas</span><strong>{reais(r.entradas)}</strong><small>Recebido · {rotuloPeriodo}</small></article>
      <article className="fin-kpi fin-sai"><span>Despesas</span><strong>{reais(r.saidas)}</strong><small>Pago · {rotuloPeriodo}</small></article>
      <article className={`fin-kpi destaque ${r.resultado < 0 ? 'negativo' : 'positivo'}`}><span>Resultado</span><strong>{reais(r.resultado)}</strong>
        <small>{r.margem != null ? `Margem de ${pct(r.margem)}` : r.resultado < 0 ? 'Sem receita no período' : 'Receitas menos despesas'}</small></article>
      <button type="button" className={`fin-kpi ${r.nReceberVencido ? 'alerta' : ''}`} onClick={() => aoIr('lancamentos', 'receber')}><span>A receber</span><strong>{reais(r.aReceber)}</strong>
        <small>{r.nReceberVencido ? `${reais(r.aReceberVencido)} atrasado` : 'Tudo em dia'}</small></button>
      <button type="button" className={`fin-kpi ${r.nPagarVencido ? 'perigo' : ''}`} onClick={() => aoIr('lancamentos', 'pagar')}><span>A pagar</span><strong>{reais(r.aPagar)}</strong>
        <small>{r.nPagarVencido ? `${r.nPagarVencido} ${r.nPagarVencido === 1 ? 'conta vencida' : 'contas vencidas'} · ${reais(r.aPagarVencido)}` : 'Nada vencido'}</small></button>
      <article className="fin-kpi"><span>Saldo nas contas</span><strong>{reais(r.saldoContas)}</strong><small>Hoje · {contas.length} {contas.length === 1 ? 'conta' : 'contas'}</small></article>
    </div>
    {(r.aportes > 0 || r.retiradas > 0) && <p className="fin-nota-socios">
      No período os sócios colocaram <b>{reais(r.aportes)}</b> e tiraram <b>{reais(r.retiradas)}</b>. Isso não entra no resultado.
      <button type="button" onClick={() => aoIr('divisao')}>Ver a divisão</button></p>}

    <div className="fin-grade-2 larga">
      <section className="fin-cartao">
        <header><div><span className="fin-rot">Últimos 12 meses</span><h3>Receitas e despesas mês a mês</h3></div>
          <div className="fin-legenda"><span className="fin-entra">Receitas</span><span className="fin-sai">Despesas</span></div></header>
        {temMeses ? <div className="fin-meses" role="img" aria-label="Receitas e despesas dos últimos 12 meses">
          {meses.map((m) => <div key={m.mes} className={m.mes === hojeDia.slice(0, 7) ? 'atual' : ''} title={`${nomeDoMes(m.mes)} · receitas ${reais(m.entradas)} · despesas ${reais(m.saidas)} · resultado ${reais(m.resultado)}`}>
            <span className="fin-meses-barras">
              <i className="fin-entra" style={{ height: `${m.entradas / maxMes * 100}%` }} />
              <i className="fin-sai" style={{ height: `${m.saidas / maxMes * 100}%` }} />
            </span>
            <b className={m.resultado < 0 ? 'negativo' : m.resultado > 0 ? 'positivo' : ''}>{m.entradas || m.saidas ? compacto(m.resultado) : '—'}</b>
            <small>{nomeDoMes(m.mes, true).split(' ')[0]}</small>
          </div>)}
        </div> : <p className="fin-cartao-vazio">Os meses aparecem aqui quando houver lançamentos pagos.</p>}
      </section>

      <section className="fin-cartao">
        <header><div><span className="fin-rot">Hoje</span><h3>Saldo nas contas</h3></div>
          <button type="button" className="fin-link" onClick={() => aoIr('cadastros')}>Contas</button></header>
        <ul className="fin-contas-lista">
          {contas.map((c) => <li key={c.conta.id} style={{ ['--fin-cor' as string]: c.conta.cor }}>
            <i className="fin-ponto" /><span><b>{c.conta.nome}</b><small>{c.entradas || c.saidas ? `Entrou ${reaisCurto(c.entradas)} · saiu ${reaisCurto(c.saidas)}` : 'Sem movimento'}</small></span>
            <strong className={c.saldo < 0 ? 'negativo' : ''}>{reais(c.saldo)}</strong>
          </li>)}
          {!contas.length && <li className="fin-cartao-vazio">Nenhuma conta cadastrada.</li>}
        </ul>
      </section>
    </div>

    <div className="fin-grade-2">
      {([['despesa', 'Para onde foi o dinheiro', despesas], ['receita', 'De onde veio o dinheiro', receitas]] as const).map(([t, titulo, lista]) => <section key={t} className="fin-cartao">
        <header><div><span className="fin-rot">{t === 'despesa' ? 'Despesas' : 'Receitas'} por categoria · {rotuloPeriodo}</span><h3>{titulo}</h3></div>
          <strong className={`fin-total ${t === 'despesa' ? 'fin-sai' : 'fin-entra'}`}>{reais(lista.reduce((s, x) => s + x.valor, 0))}</strong></header>
        {lista.length ? <ul className="fin-categorias">
          {lista.slice(0, 8).map((c) => <li key={c.id ?? '-'} style={{ ['--fin-cor' as string]: c.cor }}>
            <span className="fin-categorias-nome"><i className="fin-ponto" /><b>{c.nome}</b><small>{c.n} {c.n === 1 ? 'lançamento' : 'lançamentos'}</small></span>
            <span className="fin-categorias-valor"><b>{reais(c.valor)}</b><small>{pct(c.parte)}</small></span>
            <span className="fin-categorias-barra"><i style={{ width: `${Math.max(2, c.parte * 100)}%` }} /></span>
          </li>)}
          {lista.length > 8 && <li className="fin-categorias-mais">E mais {lista.length - 8} {lista.length - 8 === 1 ? 'categoria' : 'categorias'}, somando {reais(lista.slice(8).reduce((s, x) => s + x.valor, 0))}</li>}
        </ul> : <p className="fin-cartao-vazio">{t === 'despesa' ? 'Nenhuma despesa paga' : 'Nenhuma receita recebida'} no período.</p>}
      </section>)}
    </div>

    <section className="fin-cartao">
      <header><div><span className="fin-rot">Em aberto</span><h3>Contas a pagar e a receber</h3></div>
        <div className="fin-cab-acoes">
          <div className="fin-seg pequeno" role="tablist" aria-label="Em aberto">
            <button type="button" role="tab" aria-selected={abertos === 'pagar'} className={abertos === 'pagar' ? 'on' : ''} onClick={() => setAbertos('pagar')}>A pagar</button>
            <button type="button" role="tab" aria-selected={abertos === 'receber'} className={abertos === 'receber' ? 'on' : ''} onClick={() => setAbertos('receber')}>A receber</button>
          </div>
          <button type="button" className="fin-link" onClick={() => aoIr('lancamentos', abertos)}>Ver todos</button>
        </div></header>
      {emAberto.length ? <ul className="fin-abertos">
        {emAberto.slice(0, 8).map((l) => {
          const s = situacaoDe(l, hojeDia)
          return <li key={l.id} className={s}>
            <button type="button" className="fin-abertos-info" onClick={() => aoAbrir(l)}>
              <span className="fin-abertos-dia"><b>{l.vencimento.slice(8)}</b><small>{nomeDoMes(l.vencimento.slice(0, 7), true).split(' ')[0]}</small></span>
              <span><b>{l.descricao}</b><small className={s === 'vencido' ? 'vencido' : ''}>{situacaoTxt(l)}{l.contraparte ? ` · ${l.contraparte}` : ''}</small></span>
            </button>
            <strong className={ehEntrada(l.tipo) ? 'fin-entra' : 'fin-sai'}>{reais(l.valor)}</strong>
            {podeEditar && <button type="button" className="fin-btn pequeno" onClick={() => aoPagar(l)}><Icone nome="certo" />{ehEntrada(l.tipo) ? 'Recebido' : 'Pago'}</button>}
          </li>
        })}
      </ul> : <p className="fin-cartao-vazio">{abertos === 'pagar' ? 'Nenhuma conta a pagar.' : 'Nada a receber.'}</p>}
      {emAberto.length > 8 && <p className="fin-cartao-pe">E mais {emAberto.length - 8}. <button type="button" className="fin-link" onClick={() => aoIr('lancamentos', abertos)}>Ver todos</button></p>}
    </section>
  </div>
}
