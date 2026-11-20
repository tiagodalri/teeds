/*
  Previsão do fechamento do mês com o Revenue Share da Deriv (20/11/2026, Tiago: "o Revenue Share varia todo dia e fecha
  no último dia do mês... quero um campo 'Revenue Share até o momento', um para o Projeto Naor e outro para o Projeto
  Victor, e ver quanto teriam a receber no total se o mês fechasse com aquele valor").

  À esquerda, o valor parcial de cada projeto (salvo no banco ao sair do campo, vale em todos os aparelhos). À direita,
  a conta: receitas reais do mês + Revenue Share = receitas previstas; − despesas = resultado previsto; e quanto cada
  pessoa leva, pela mesma divisão dos projetos. Nada disso entra nos totais reais do Resumo.
*/
import { useEffect, useMemo, useState } from 'react'
import { FinTrancado, nomeDoMes, preverComRevShare, reais, type DadosFin, type FinApi, type Periodo, type Projeto, type RevShare } from '../../core/teeds/financeiro'
import { Avatar, escreverValor, lerValor } from './ui'

const usd = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' }).replace('US$', 'US$ ')
const quando = (iso: string) => {
  const d = new Date(iso), hoje = new Date()
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const ontem = new Date(hoje.getTime() - 864e5).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  return dia === hoje.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) ? `hoje às ${hora}` : dia === ontem ? `ontem às ${hora}` : `em ${dia.slice(0, 5)} às ${hora}`
}

export function PrevisaoRevShare({ api, dados, todos, projeto, periodo, mes, podeEditar, aoMudar, aoTrancar }: {
  api: FinApi
  /** os dados com o filtro de projeto da tela */
  dados: DadosFin
  /** sem filtro: para saber quais projetos têm campo */
  todos: DadosFin
  projeto: string
  periodo: Periodo
  /** 'AAAA-MM-01' */
  mes: string
  podeEditar: boolean
  aoMudar: (mensagem: string) => void
  aoTrancar: () => void
}) {
  const doMes = useMemo(() => todos.revshare.filter((x) => x.mes === mes), [todos.revshare, mes])
  // os campos: projetos de parceiro com receita no mês ou com valor já informado (o Douglas sem movimento não aparece)
  const campos = useMemo(() => todos.projetos.filter((pr) => {
    if (!pr.parceiro || (projeto && projeto !== pr.id)) return false
    if (doMes.some((x) => x.projeto_id === pr.id)) return true
    return pr.ativo && todos.lancamentos.some((l) => l.projeto_id === pr.id && l.tipo === 'receita' && l.pago_em && l.pago_em >= periodo.de && l.pago_em <= periodo.ate)
  }).sort((a, b) => a.ordem - b.ordem), [todos, doMes, projeto, periodo])
  const linhas = useMemo(() => doMes.filter((x) => campos.some((c) => c.id === x.projeto_id)), [doMes, campos])
  const prev = useMemo(() => preverComRevShare(dados, periodo, linhas), [dados, periodo, linhas])
  const [cotacao, setCotacao] = useState<number | null>(null)
  useEffect(() => { let vivo = true; void api.cotacao().then((c) => { if (vivo) setCotacao(c) }); return () => { vivo = false } }, [api])

  if (!campos.length || projeto === 'geral') return null
  const fechado = periodo.ate < new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

  return <section className="fin-cartao fin-rs">
    <header>
      <div><span className="fin-rot">Previsão · {nomeDoMes(mes.slice(0, 7))}</span><h3>Fechamento do mês com o Revenue Share</h3></div>
      <span className="fin-rs-selo">Previsão</span>
    </header>
    <div className="fin-rs-corpo">
      <div className="fin-rs-campos">
        <p className="fin-rs-dica">{fechado ? 'O mês já fechou. Quando a Deriv pagar, lance o valor como receita e apague daqui.' : 'Revenue Share até o momento, como está no painel de afiliado da Deriv. Atualize todo dia.'}</p>
        {campos.map((pr) => <CampoRevShare key={pr.id} api={api} projeto={pr} mes={mes} linha={doMes.find((x) => x.projeto_id === pr.id) ?? null}
          cotacao={cotacao} podeEditar={podeEditar} aoMudar={aoMudar} aoTrancar={aoTrancar} />)}
      </div>

      <div className="fin-rs-conta">
        <dl>
          <div><dt>Receitas do mês<small>Já recebidas</small></dt><dd>{reais(prev.receitas)}</dd></div>
          <div><dt>Revenue Share informado</dt><dd className="fin-rs-mais">+ {reais(prev.revShare)}</dd></div>
          <div className="soma"><dt>Receitas previstas</dt><dd className="fin-entra">{reais(prev.receitasPrevistas)}</dd></div>
          <div><dt>Despesas do mês</dt><dd className="fin-sai">− {reais(prev.despesas)}</dd></div>
          <div className="total"><dt>Resultado previsto</dt><dd className={prev.resultadoPrevisto < 0 ? 'fin-sai' : 'fin-entra'}>{reais(prev.resultadoPrevisto)}</dd></div>
        </dl>
        {prev.pessoas.length > 0 && <>
          <span className="fin-rot fin-rs-rot">Quanto cada um leva se o mês fechar assim</span>
          <ul className="fin-rs-pessoas">
            {prev.pessoas.map((x) => <li key={x.quem} style={{ ['--fin-cor' as string]: x.cor }}>
              <span className="fin-rs-quem"><Avatar nome={x.nome} cor={x.cor} tamanho={30} /><span><b>{x.nome}</b><small>{x.socio ? 'Sócio' : 'Parceiro'}</small></span></span>
              <strong className={x.previsto < 0 ? 'fin-sai' : ''}>{reais(x.previsto)}</strong>
              <small className="fin-rs-de">Até agora {reais(x.agora)}{x.doRevShare !== 0 && <> · <em>+ {reais(x.doRevShare)} do Revenue Share</em></>}</small>
            </li>)}
          </ul>
        </>}
      </div>
    </div>
    <p className="fin-cartao-pe">É uma previsão: o Revenue Share informado não entra nas receitas, no resultado nem no saldo acima. A divisão é a mesma dos projetos (aba Divisão).</p>
  </section>
}

function CampoRevShare({ api, projeto, mes, linha, cotacao, podeEditar, aoMudar, aoTrancar }: {
  api: FinApi; projeto: Projeto; mes: string; linha: RevShare | null; cotacao: number | null; podeEditar: boolean
  aoMudar: (mensagem: string) => void; aoTrancar: () => void
}) {
  const [moeda, setMoeda] = useState<RevShare['moeda']>(linha?.moeda ?? 'USD')
  const [texto, setTexto] = useState(linha ? escreverValor(linha.valor) : '')
  const [estado, setEstado] = useState<'parado' | 'salvando' | 'erro'>('parado')
  const [erro, setErro] = useState<string | null>(null)
  // chegou um valor novo do banco (outro aparelho, ou depois de salvar): o campo acompanha
  useEffect(() => { setTexto(linha ? escreverValor(linha.valor) : ''); setMoeda(linha?.moeda ?? 'USD') }, [linha?.valor, linha?.moeda, linha?.atualizado_em]) // eslint-disable-line react-hooks/exhaustive-deps

  const valor = lerValor(texto)
  const cot = moeda === 'USD' ? (linha?.moeda === 'USD' && valor === linha.valor ? linha.cotacao : cotacao ?? linha?.cotacao ?? null) : null
  const emReais = valor == null ? null : moeda === 'USD' ? (cot ? valor * cot : null) : valor
  const mudou = (valor ?? null) !== (linha?.valor ?? null) || (valor != null && moeda !== linha?.moeda)

  const salvar = async () => {
    if (!mudou || estado === 'salvando') return
    if (valor != null && valor < 0) { setErro('O valor não pode ser negativo.'); setEstado('erro'); return }
    if (valor != null && moeda === 'USD' && !cot) { setErro('Sem cotação do dólar agora. Digite em R$ ou tente de novo.'); setEstado('erro'); return }
    setEstado('salvando'); setErro(null)
    try {
      await api.salvarRevShare(projeto.id, mes, valor, moeda, cot)
      setEstado('parado')
      aoMudar(valor == null ? `Revenue Share do ${projeto.nome} apagado.` : `Revenue Share do ${projeto.nome} salvo.`)
    } catch (e) {
      if (e instanceof FinTrancado) { aoTrancar(); return }
      setErro((e as Error).message); setEstado('erro')
    }
  }

  const id = `fin-rs-${projeto.id}`
  return <div className={`fin-rs-campo${estado === 'erro' ? ' erro' : ''}`} style={{ ['--fin-cor' as string]: projeto.cor }}>
    <label htmlFor={id}><i className="fin-ponto" /><b>{projeto.nome}</b></label>
    {podeEditar ? <div className="fin-rs-linha">
      <span className="fin-input-valor">
        <button type="button" className="fin-rs-moeda" title={moeda === 'USD' ? 'Em dólar. Tocar para digitar em reais' : 'Em reais. Tocar para digitar em dólar'}
          aria-label={moeda === 'USD' ? 'Moeda: dólar. Trocar para real' : 'Moeda: real. Trocar para dólar'} onClick={() => setMoeda((m) => m === 'USD' ? 'BRL' : 'USD')}>{moeda === 'USD' ? 'US$' : 'R$'}</button>
        <input id={id} inputMode="decimal" placeholder="0,00" value={texto} autoComplete="off"
          onChange={(e) => { setTexto(e.target.value.replace(/[^\d.,]/g, '')); if (estado === 'erro') { setEstado('parado'); setErro(null) } }}
          onBlur={() => void salvar()} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
      </span>
      {mudou && <button type="button" className="fin-btn pequeno primario" onMouseDown={(e) => e.preventDefault()} onClick={() => void salvar()} disabled={estado === 'salvando'}>{estado === 'salvando' ? 'Salvando…' : 'Salvar'}</button>}
    </div> : <strong className="fin-rs-leitura">{linha ? (linha.moeda === 'USD' ? usd(linha.valor) : reais(linha.valor)) : '—'}</strong>}
    <small className="fin-rs-sub">
      {erro ? <span className="fin-sai">{erro}</span> : <>
        {moeda === 'USD' && emReais != null && <>{reais(emReais)} · US$ 1 = {reais(cot ?? 0)}</>}
        {!mudou && linha && <>{moeda === 'USD' && emReais != null ? ' · ' : ''}Atualizado {quando(linha.atualizado_em)}</>}
        {!mudou && !linha && 'Nada informado ainda'}
        {mudou && podeEditar && <>{moeda === 'USD' && emReais != null ? ' · ' : ''}Não salvo</>}
      </>}
    </small>
  </div>
}

