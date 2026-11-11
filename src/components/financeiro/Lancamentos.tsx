/* Lançamentos: a lista inteira com busca, filtros, totais do que está filtrado e exportação para planilha. */
import { useMemo, useState } from 'react'
import {
  ROTULO_TIPO, dataCurta, diaDe, parceiroDoProjeto, diasEntre, ehEntrada, hoje, nomeDoMes, paraCsv, reais, situacaoDe,
  type DadosFin, type Lancamento, type Periodo,
} from '../../core/teeds/financeiro'
import { Icone } from '../Icone'
import { Vazio } from './ui'

export type FiltroInicial = 'pagar' | 'receber' | 'vencidos' | null
type FTipo = 'todos' | 'receita' | 'despesa' | 'socios'
type FSituacao = 'todas' | 'pago' | 'aberto' | 'vencido'

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export function Lancamentos({ dados, periodo, rotuloPeriodo, filtroInicial, podeEditar, aoAbrir, aoPagar, aoNovo }: {
  dados: DadosFin; periodo: Periodo; rotuloPeriodo: string; filtroInicial: FiltroInicial; podeEditar: boolean
  aoAbrir: (l: Lancamento) => void
  aoPagar: (l: Lancamento) => void
  aoNovo: () => void
}) {
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState<FTipo>(filtroInicial === 'pagar' ? 'despesa' : filtroInicial === 'receber' ? 'receita' : 'todos')
  const [situacao, setSituacao] = useState<FSituacao>(filtroInicial === 'vencidos' ? 'vencido' : filtroInicial ? 'aberto' : 'todas')
  const [categoria, setCategoria] = useState('')
  const [conta, setConta] = useState('')
  // "Em aberto" e "Vencidos" olham todos os pendentes, não só os do período (a conta vencida em outubro ainda está para pagar)
  const [todoPeriodo, setTodoPeriodo] = useState(!!filtroInicial)
  const hojeDia = hoje()

  const cat = useMemo(() => new Map(dados.categorias.map((c) => [c.id, c])), [dados.categorias])
  const con = useMemo(() => new Map(dados.contas.map((c) => [c.id, c])), [dados.contas])
  const soc = useMemo(() => new Map(dados.socios.map((c) => [c.id, c])), [dados.socios])
  const pro = useMemo(() => new Map(dados.projetos.map((c) => [c.id, c])), [dados.projetos])
  const parceiroNome = (codigo: string | null) => dados.projetos.find((p) => p.parceiro === codigo)?.responsavel ?? 'Parceiro'

  const lista = useMemo(() => {
    const q = semAcento(busca.trim())
    return dados.lancamentos.filter((l) => {
      const dia = diaDe(l)
      const s = situacaoDe(l, hojeDia)
      if (!(todoPeriodo && situacao !== 'pago' && situacao !== 'todas') && (dia < periodo.de || dia > periodo.ate)) return false
      if (tipo === 'socios' ? l.tipo !== 'aporte' && l.tipo !== 'retirada' && !l.socio_id : tipo !== 'todos' && l.tipo !== tipo) return false
      if (situacao === 'pago' && s !== 'pago') return false
      if (situacao === 'aberto' && s === 'pago') return false
      if (situacao === 'vencido' && s !== 'vencido') return false
      if (categoria && l.categoria_id !== categoria) return false
      if (conta && l.conta_id !== conta) return false
      if (q && !semAcento(`${l.descricao} ${l.contraparte ?? ''} ${l.observacoes ?? ''} ${l.forma ?? ''} ${cat.get(l.categoria_id ?? '')?.nome ?? ''} ${soc.get(l.socio_id ?? '')?.nome ?? ''} ${pro.get(l.projeto_id ?? '')?.nome ?? ''} ${l.valor.toFixed(2).replace('.', ',')}`).includes(q)) return false
      return true
    }).sort((a, b) => diaDe(b).localeCompare(diaDe(a)) || b.criado_em.localeCompare(a.criado_em))
  }, [dados.lancamentos, busca, tipo, situacao, categoria, conta, periodo, todoPeriodo, hojeDia, cat, soc, pro])

  const totais = useMemo(() => {
    let entra = 0, sai = 0
    // o que foi pago por fora não passou pelo caixa: fica fora das entradas e saídas
    for (const l of lista) { if (l.pago_fora) continue; if (ehEntrada(l.tipo)) entra += l.valor; else sai += l.valor }
    return { entra, sai }
  }, [lista])

  // a lista vem em blocos por mês, com o total de cada um
  const porMes = useMemo(() => {
    const m = new Map<string, Lancamento[]>()
    for (const l of lista) { const k = diaDe(l).slice(0, 7); m.set(k, [...(m.get(k) ?? []), l]) }
    return [...m.entries()]
  }, [lista])

  const filtrando = !!busca.trim() || tipo !== 'todos' || situacao !== 'todas' || !!categoria || !!conta
  const limpar = () => { setBusca(''); setTipo('todos'); setSituacao('todas'); setCategoria(''); setConta(''); setTodoPeriodo(false) }
  const exportar = () => {
    const blob = new Blob([paraCsv(lista, dados)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `financeiro-${dados.lancamentos[0]?.marca ?? ''}-${periodo.de}-a-${periodo.ate}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }
  const situacaoTxt = (l: Lancamento) => {
    const s = situacaoDe(l, hojeDia)
    if (s === 'pago') return `${ehEntrada(l.tipo) ? 'Recebido' : 'Pago'} em ${dataCurta(l.pago_em!)}`
    const d = diasEntre(hojeDia, l.vencimento)
    return s === 'vencido' ? `Venceu há ${-d} ${d === -1 ? 'dia' : 'dias'}` : d === 0 ? 'Vence hoje' : `Vence em ${dataCurta(l.vencimento)}`
  }
  const categoriasUsadas = dados.categorias.filter((c) => c.ativo || dados.lancamentos.some((l) => l.categoria_id === c.id))

  return <section className="fin-cartao fin-lancamentos">
    <div className="fin-filtros">
      <label className="fin-busca"><Icone nome="buscar" />
        <input placeholder="Buscar lançamento" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar lançamentos" /></label>
      <div className="fin-seg" role="radiogroup" aria-label="Tipo">
        {([['todos', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas'], ['socios', 'Sócios']] as Array<[FTipo, string]>).map(([id, nome]) =>
          <button key={id} type="button" role="radio" aria-checked={tipo === id} className={tipo === id ? 'on' : ''} onClick={() => setTipo(id)}>{nome}</button>)}
      </div>
      <label className="fin-select"><span>Situação</span>
        <select value={situacao} onChange={(e) => { const v = e.target.value as FSituacao; setSituacao(v); if (v === 'pago' || v === 'todas') setTodoPeriodo(false) }}>
          <option value="todas">Todas</option><option value="pago">Pagos</option><option value="aberto">Em aberto</option><option value="vencido">Vencidos</option>
        </select></label>
      <label className="fin-select"><span>Categoria</span>
        <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas</option>
          <optgroup label="Despesas">{categoriasUsadas.filter((c) => c.tipo === 'saida').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
          <optgroup label="Receitas">{categoriasUsadas.filter((c) => c.tipo === 'entrada').map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</optgroup>
        </select></label>
      <label className="fin-select"><span>Conta</span>
        <select value={conta} onChange={(e) => setConta(e.target.value)}>
          <option value="">Todas</option>{dados.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></label>
      {filtrando && <button type="button" className="fin-link" onClick={limpar}>Limpar filtros</button>}
    </div>

    <div className="fin-totais">
      <span><small>Entradas</small><b className="fin-entra">{reais(totais.entra)}</b></span>
      <span><small>Saídas</small><b className="fin-sai">{reais(totais.sai)}</b></span>
      <span><small>Saldo</small><b className={totais.entra - totais.sai < 0 ? 'fin-sai' : ''}>{reais(totais.entra - totais.sai)}</b></span>
      <span className="fin-totais-n"><small>{todoPeriodo && situacao !== 'todas' && situacao !== 'pago' ? 'Todos os pendentes' : rotuloPeriodo}</small><b>{lista.length.toLocaleString('pt-BR')} {lista.length === 1 ? 'lançamento' : 'lançamentos'}</b></span>
      {(situacao === 'aberto' || situacao === 'vencido') && <label className="fin-check"><input type="checkbox" checked={todoPeriodo} onChange={(e) => setTodoPeriodo(e.target.checked)} /><span>Incluir os de outros períodos</span></label>}
      <button type="button" className="fin-btn pequeno" onClick={exportar} disabled={!lista.length}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>Planilha</button>
    </div>

    {lista.length ? <div className="fin-tabela" role="table" aria-label="Lançamentos">
      <div className="fin-tabela-cab" role="row"><span role="columnheader">Data</span><span role="columnheader">Descrição</span><span role="columnheader">Categoria</span><span role="columnheader">Conta</span><span role="columnheader">Situação</span><span role="columnheader">Valor</span><span role="columnheader"><span className="fin-esconder">Ações</span></span></div>
      {porMes.map(([mes, itens]) => {
        const e = itens.reduce((s, l) => s + (ehEntrada(l.tipo) ? l.valor : 0), 0), sa = itens.reduce((s, l) => s + (ehEntrada(l.tipo) ? 0 : l.valor), 0)
        return <div key={mes} role="rowgroup" className="fin-tabela-mes">
          <div className="fin-tabela-mes-cab" role="row"><b>{nomeDoMes(mes)}</b><small>{e ? <span className="fin-entra">+{reais(e)}</span> : null}{sa ? <span className="fin-sai">−{reais(sa)}</span> : null}</small></div>
          {itens.map((l) => {
            const s = situacaoDe(l, hojeDia)
            const c = l.categoria_id ? cat.get(l.categoria_id) : null
            const so = l.socio_id ? soc.get(l.socio_id) : null
            const entrada = ehEntrada(l.tipo)
            return <div key={l.id} role="row" className={`fin-linha ${s}`} onClick={() => aoAbrir(l)}
              onKeyDown={(ev) => { if (ev.key === 'Enter' && ev.target === ev.currentTarget) aoAbrir(l) }} tabIndex={0}>
              <span role="cell" className="fin-linha-dia"><b>{diaDe(l).slice(8)}</b><small>{nomeDoMes(diaDe(l).slice(0, 7), true).split(' ')[0]}</small></span>
              <span role="cell" className="fin-linha-desc"><b>{l.descricao}{l.anexos.length > 0 && <em className="fin-clipe" title={`${l.anexos.length} ${l.anexos.length === 1 ? 'comprovante' : 'comprovantes'}`} aria-label="Com comprovante"><svg viewBox="0 0 24 24"><path d="M20 11.5l-8.2 8.2a5 5 0 01-7.1-7.1l8.5-8.5a3.3 3.3 0 014.7 4.7l-8.5 8.5a1.7 1.7 0 01-2.4-2.4l7.8-7.8" /></svg></em>}</b>
                <small>{l.tipo === 'aporte' || l.tipo === 'retirada' ? ROTULO_TIPO[l.tipo] : l.contraparte || (l.forma ?? '')}{l.parcelas ? ` · ${l.parcela}/${l.parcelas}` : l.grupo ? ' · mensal' : ''}{l.projeto_id && pro.get(l.projeto_id) ? <em className="fin-de-projeto" style={{ ['--fin-cor' as string]: pro.get(l.projeto_id)!.cor }}>{pro.get(l.projeto_id)!.nome}</em> : null}</small></span>
              <span role="cell">{c ? <em className="fin-chip" style={{ ['--fin-cor' as string]: c.cor }}><i className="fin-ponto" />{c.nome}</em> : l.tipo === 'aporte' || l.tipo === 'retirada' ? <em className="fin-chip socio">Sócio</em> : <em className="fin-sem">Sem categoria</em>}</span>
              <span role="cell" className="fin-linha-conta">{l.tipo === 'devolucao' ? <><b>{parceiroNome(l.pago_por)}</b><small>Devolveu a {so?.nome.split(' ')[0] ?? 'um sócio'}</small></>
                : l.pago_por ? <><b>{parceiroNome(l.pago_por)}</b><small>Do bolso dele · ninguém devolve</small></>
                : l.pago_fora && so ? <><b>{so.nome}</b><small>{parceiroDoProjeto(dados, l.projeto_id)?.nome.split(' ')[0] ?? 'O parceiro'} devolve</small></>
                : l.pago_fora ? <><b>Por fora</b><small>Só no custo do projeto</small></>
                : so && l.tipo === 'despesa' && !l.conta_id ? <><b>{so.nome}</b><small>A plataforma devolve</small></>
                : so && (l.tipo === 'aporte' || l.tipo === 'retirada' || !l.conta_id)
                ? <><b>{so.nome}</b><small>{l.tipo === 'despesa' ? 'Do próprio bolso' : l.tipo === 'receita' ? 'Na conta pessoal' : l.conta_id ? con.get(l.conta_id)?.nome : ''}</small></>
                : l.conta_id ? <b>{con.get(l.conta_id)?.nome ?? '—'}</b> : <em className="fin-sem">—</em>}</span>
              <span role="cell"><em className={`fin-situacao ${s}`}>{situacaoTxt(l)}</em></span>
              <span role="cell" className={`fin-linha-valor ${l.pago_fora ? 'fora' : entrada ? 'fin-entra' : 'fin-sai'}`} title={l.pago_fora ? 'Não passou pelo caixa' : undefined}>{l.pago_fora ? '' : entrada ? '+' : '−'}{reais(l.valor)}</span>
              <span role="cell" className="fin-linha-acoes" onClick={(ev) => ev.stopPropagation()}>
                {podeEditar && s !== 'pago' && <button type="button" className="fin-btn pequeno" onClick={() => aoPagar(l)} title={entrada ? 'Marcar como recebido hoje' : 'Marcar como pago hoje'}><Icone nome="certo" />{entrada ? 'Recebido' : 'Pago'}</button>}
              </span>
            </div>
          })}
        </div>
      })}
    </div> : <Vazio titulo={filtrando ? 'Nada com esses filtros' : 'Nenhum lançamento no período'}
      texto={filtrando ? 'Mude os filtros ou o período no topo.' : 'Mude o período no topo ou lance algo novo.'}
      acoes={filtrando ? <button className="fin-btn" onClick={limpar}>Limpar filtros</button> : podeEditar ? <button className="fin-btn primario" onClick={aoNovo}><Icone nome="mais" />Novo lançamento</button> : undefined} />}
  </section>
}
