/*
  Divisão por projeto (16/11/2026, Tiago: "primeiro pagamos as despesas do projeto e depois dividimos o resto...
  Precisava ter tipo uma previsão de quanto vai sobrar pra cada... do jeito mais intuitivo possível").

  Em cima, quanto cada pessoa leva (até agora ou a previsão do período). Embaixo, um cartão por projeto:
  receitas − despesas = lucro, a barra de quem leva quanto e, por pessoa, a parte do lucro + o que volta
  para quem pagou do bolso. O dono edita a divisão de cada projeto.
*/
import { useMemo, useState } from 'react'
import { partesDe, partilhar, pessoasDaPartilha, reais, type DadosFin, type FinApi, type Numeros, type Periodo, type ProjetoPartilhado } from '../../core/teeds/financeiro'
import { Avatar, Janela, Segmentado } from './ui'

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const primeiro = (nome: string) => nome.split(' ')[0]

export function Partilha({ api, dados, periodo, rotuloPeriodo, souDono, restrito = false, aoMudar }: {
  api: FinApi; dados: DadosFin; periodo: Periodo; rotuloPeriodo: string; souDono: boolean
  /** vê só alguns projetos: o rodapé fala do projeto, não de todos */
  restrito?: boolean
  aoMudar: (mensagem: string) => void
}) {
  const r = useMemo(() => partilhar(dados, periodo), [dados, periodo])
  const gente = useMemo(() => pessoasDaPartilha(dados), [dados])
  const temPrevisao = r.projetos.some((x) => x.ritmo || x.aberto.receitas || x.aberto.despesas)
  const [modo, setModo] = useState<'agora' | 'previsao'>('agora')
  const [editando, setEditando] = useState<ProjetoPartilhado | null>(null)
  const ver = modo === 'previsao' && temPrevisao ? 'previsao' : 'agora'
  const nome = (quem: string) => gente.get(quem)?.nome ?? 'Pessoa removida'
  const cor = (quem: string) => gente.get(quem)?.cor ?? '#94A3B8'
  const lucro = ver === 'agora' ? r.lucro : r.lucroPrevisto
  // projeto sem nada (nem realizado, nem previsto) vai para uma linha só no fim; pessoa sem nada some do topo
  const vazio = (n: Numeros) => !n.receitas && !n.despesas
  const comMovimento = r.projetos.filter((x) => !vazio(x.agora) || !vazio(x.previsao))
  const parados = r.projetos.filter((x) => vazio(x.agora) && vazio(x.previsao))
  const pessoas = r.pessoas.filter((x) => x.total || x.previsto)

  if (!r.projetos.length) return null

  return <div className="fin-partilha">
    <section className="fin-cartao fin-partilha-topo">
      <header>
        <div><span className="fin-rot">{ver === 'agora' ? `Até agora · ${rotuloPeriodo}` : `Previsão até o fim do período · ${rotuloPeriodo}`}</span><h3>Quanto cada um leva</h3></div>
        {temPrevisao && <Segmentado rotulo="Ver" className="pequeno" valor={modo} aoMudar={setModo} opcoes={[{ id: 'agora', nome: 'Até agora' }, { id: 'previsao', nome: 'Previsão' }]} />}
      </header>
      <div className="fin-partilha-pessoas">
        {pessoas.map((x) => {
          const v = ver === 'agora' ? x.total : x.previsto
          return <article key={x.quem} className="fin-partilha-pessoa" style={{ ['--fin-cor' as string]: x.cor }}>
            <div className="fin-partilha-quem"><Avatar nome={x.nome} cor={x.cor} tamanho={40} /><span><b>{x.nome}</b><small>{x.socio ? 'Sócio' : 'Parceiro'}</small></span></div>
            <strong className={v < 0 ? 'fin-sai' : ''}>{reais(v)}</strong>
            <ul>{x.porProjeto.filter((y) => (ver === 'agora' ? y.total : y.previsto) !== 0).map((y) => <li key={y.projeto?.id ?? 'geral'} style={{ ['--fin-cor' as string]: y.projeto?.cor ?? '#94A3B8' }}>
              <i className="fin-ponto" /><span>{y.projeto?.nome ?? 'Custo geral'}</span><b>{reais(ver === 'agora' ? y.total : y.previsto)}</b></li>)}</ul>
            {ver === 'agora' && x.reembolso > 0 && <small className="fin-partilha-nota">Inclui {reais(x.reembolso)} que pagou do bolso e volta para ele</small>}
          </article>
        })}
      </div>
      <p className="fin-partilha-rodape">
        {restrito ? (r.projetos.length === 1 ? 'Lucro do projeto' : 'Lucro dos seus projetos') : 'Lucro de todos os projetos'} {ver === 'agora' ? 'até agora' : 'na previsão'}: <b className={lucro < 0 ? 'fin-sai' : 'fin-entra'}>{reais(lucro)}</b>.
        {ver === 'previsao' ? ' A previsão soma o que já aconteceu, o resto do período no mesmo ritmo dos dias que já passaram e as contas em aberto até o fim do período.' : ' Primeiro volta para cada um o que pagou do bolso; o lucro (receitas menos despesas) é dividido pelos percentuais de cada projeto.'}
      </p>
    </section>

    <div className="fin-partilha-projetos">
      {comMovimento.map((pr) => <CartaoDoProjeto key={pr.projeto?.id ?? 'geral'} pr={pr} n={ver === 'agora' ? pr.agora : pr.previsao} previsao={ver === 'previsao'}
        nome={nome} cor={cor} souDono={souDono} aoEditar={() => setEditando(pr)} />)}
    </div>

    {parados.length > 0 && <p className="fin-partilha-parados">Sem movimento no período:
      {parados.map((pr) => <span key={pr.projeto?.id ?? 'geral'} style={{ ['--fin-cor' as string]: pr.projeto?.cor ?? '#94A3B8' }}><i className="fin-ponto" />{pr.projeto?.nome ?? 'Custo geral'}
        {souDono && <button type="button" className="fin-link" onClick={() => setEditando(pr)}>Editar divisão</button>}</span>)}</p>}

    {editando && <EditorDaDivisao api={api} dados={dados} pr={editando} aoFechar={() => setEditando(null)}
      aoSalvar={(m) => { setEditando(null); aoMudar(m) }} />}
  </div>
}

function CartaoDoProjeto({ pr, n, previsao, nome, cor, souDono, aoEditar }: {
  pr: ProjetoPartilhado; n: Numeros; previsao: boolean; nome: (q: string) => string; cor: (q: string) => string; souDono: boolean; aoEditar: () => void
}) {
  const titulo = pr.projeto?.nome ?? 'Custo geral'
  const comParte = n.pessoas.filter((x) => x.percentual > 0)
  const somaOk = Math.abs(pr.somaPercentual - 100) < 0.005
  return <article className="fin-cartao fin-partilha-projeto" style={{ ['--fin-cor' as string]: pr.projeto?.cor ?? '#94A3B8' }}>
    <header>
      <div><span className="fin-rot">{previsao ? 'Previsão' : 'Até agora'}</span><h3><i className="fin-ponto" />{titulo}</h3></div>
      {souDono && <button type="button" className="fin-btn pequeno" onClick={aoEditar}>Editar divisão</button>}
    </header>
    <div className="fin-partilha-conta">
      <span><small>Receitas</small><b className="fin-entra">{reais(n.receitas)}</b></span>
      <i aria-hidden="true">−</i>
      <span><small>Despesas</small><b className="fin-sai">{reais(n.despesas)}</b></span>
      <i aria-hidden="true">=</i>
      <span className="lucro"><small>Lucro para dividir</small><b className={n.lucro < 0 ? 'fin-sai' : ''}>{reais(n.lucro)}</b></span>
    </div>
    <div className="fin-partilha-barra" role="img" aria-label={comParte.map((x) => `${nome(x.quem)} ${pct(x.percentual)}`).join(', ')}>
      {comParte.map((x) => <span key={x.quem} style={{ flexGrow: x.percentual, ['--fin-cor' as string]: cor(x.quem) }}><b>{primeiro(nome(x.quem))}</b><small>{pct(x.percentual)}</small></span>)}
    </div>
    {!somaOk && <p className="fin-partilha-aviso">A divisão soma {pct(pr.somaPercentual)}. {souDono ? 'Ajuste em Editar divisão.' : 'Peça ao dono para ajustar.'}</p>}
    <table className="fin-partilha-tabela">
      <thead><tr><th>Pessoa</th><th>Parte do lucro</th><th>Volta do que pagou</th><th>Recebe</th></tr></thead>
      <tbody>{n.pessoas.map((x) => <tr key={x.quem}>
        <td><span className="fin-partilha-nome"><i className="fin-ponto" style={{ ['--fin-cor' as string]: cor(x.quem) }} />{nome(x.quem)}{x.percentual > 0 && <em>{pct(x.percentual)}</em>}</span></td>
        <td className={x.parte < 0 ? 'fin-sai' : ''}>{reais(x.parte)}</td>
        <td>{x.reembolso ? reais(x.reembolso) : <span className="fin-sem">—</span>}</td>
        <td><b className={x.total < 0 ? 'fin-sai' : ''}>{reais(x.total)}</b>{x.reembolso > 0 && <small className="fin-partilha-volta">{reais(x.reembolso)} de volta</small>}</td>
      </tr>)}</tbody>
    </table>
    {previsao && <p className="fin-partilha-nota">{pr.ritmo ? `No ritmo dos ${pr.ritmo.passados} dias com movimento, mais ${pr.ritmo.faltam} até o fim do período` : 'Sem ritmo para projetar (período fechado ou com poucos dias)'}{pr.aberto.receitas || pr.aberto.despesas ? `, com ${reais(pr.aberto.receitas)} a receber e ${reais(pr.aberto.despesas)} a pagar em aberto` : ''}.</p>}
  </article>
}

function EditorDaDivisao({ api, dados, pr, aoFechar, aoSalvar }: {
  api: FinApi; dados: DadosFin; pr: ProjetoPartilhado; aoFechar: () => void; aoSalvar: (m: string) => void
}) {
  const gente = useMemo(() => [...pessoasDaPartilha(dados).values()], [dados])
  const [linhas, setLinhas] = useState(() => {
    const atuais = new Map(partesDe(dados, pr.projeto?.id ?? null).map((x) => [x.quem, x.percentual]))
    return gente.map((g) => ({ quem: g.quem, nome: g.nome, cor: g.cor, socio: g.socio, texto: atuais.has(g.quem) ? String(atuais.get(g.quem)).replace('.', ',') : '' }))
  })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const num = (t: string) => { const v = Number(t.replace(',', '.')); return Number.isFinite(v) ? v : 0 }
  const soma = Math.round(linhas.reduce((s, x) => s + num(x.texto), 0) * 100) / 100
  const ok = Math.abs(soma - 100) < 0.005
  const titulo = pr.projeto?.nome ?? 'Custo geral'

  const salvar = async () => {
    if (!ok) { setErro('Os percentuais precisam somar 100%.'); return }
    setSalvando(true); setErro(null)
    try {
      await api.salvarPartes(pr.projeto?.id ?? null, linhas.filter((x) => num(x.texto) > 0).map((x) => ({ quem: x.quem, percentual: num(x.texto) })))
      aoSalvar(`Divisão de ${titulo} salva.`)
    } catch (e) { setErro((e as Error).message); setSalvando(false) }
  }

  return <Janela largura={480} titulo={`Divisão · ${titulo}`} sub="Quanto do lucro (depois das despesas) fica com cada um. Precisa somar 100%." aoFechar={aoFechar}
    rodape={<><span className={`fin-partilha-soma ${ok ? 'ok' : 'falta'}`}>Soma {pct(soma)}</span><span className="fin-rodape-espaco" />
      <button type="button" className="fin-btn" onClick={aoFechar} disabled={salvando}>Cancelar</button>
      <button type="button" className="fin-btn primario" onClick={() => void salvar()} disabled={salvando || !ok}>{salvando ? 'Salvando…' : 'Salvar'}</button></>}>
    <div className="fin-form">
      <ul className="fin-partilha-editar">
        {linhas.map((x, i) => <li key={x.quem}>
          <span className="fin-partilha-quem"><Avatar nome={x.nome} cor={x.cor} tamanho={34} /><span><b>{x.nome}</b><small>{x.socio ? 'Sócio' : 'Parceiro'}</small></span></span>
          <span className="fin-input-sufixo"><input inputMode="decimal" aria-label={`Percentual de ${x.nome}`} placeholder="0" value={x.texto} data-foco={i === 0 || undefined}
            onChange={(e) => { const t = e.target.value.replace(/[^\d,.]/g, ''); setLinhas((l) => l.map((y, j) => j === i ? { ...y, texto: t } : y)) }} /><em>%</em></span>
        </li>)}
      </ul>
      {erro && <p className="fin-erro" role="alert">{erro}</p>}
    </div>
  </Janela>
}
