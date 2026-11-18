/**
 * Administração › Leads. 18/11/2026 (Victor Cordeiro: "acrescenta no campo de leads a opção de filtro de
 * ontem, últimos 15, personalizado etc. E também da onde o cara veio, porque já está na minha bio o link do
 * nosso site"): período (Tudo, Hoje, Ontem, 7, 15, 30 dias, Este mês, Personalizado, no dia de Brasília),
 * "De onde vieram" com a contagem de cada canal (clicar filtra) e a coluna "Veio de" em cada cadastro.
 * Os cartões seguem o período escolhido; "Novos hoje" é sempre o dia de hoje.
 */
import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import { listarLeads, origemCadastro, origemDosLeads, respostaDoQuestionario, veioDe, type CanalDoLead, type LeadCapturado, type PrimeiraVisita } from '../core/teeds/leads'
import { diaDeBrasilia, instanteEmBrasilia, somarDias, ddmm } from './admin/PeriodoDaVisaoGeral'
import './admin-leads.css'
import { celulaCsv, diaDeHoje, telefoneCsv } from '../core/planilha'
declare global { interface String { replaceAll(busca: string, substituto: string): string } }

type Atalho = 'tudo' | 'hoje' | 'ontem' | '7' | '15' | '30' | 'mes' | 'personalizado'
const ATALHOS: Array<[Atalho, string]> = [
  ['tudo', 'Tudo'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['15', '15 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['personalizado', 'Personalizado'],
]
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** [de, ate) em milissegundos e o texto do período; null em Tudo. */
function janela(atalho: Atalho, de: string, ate: string): { de: number; ate: number; rotulo: string } | null {
  const hoje = diaDeBrasilia(), ini = (d: string) => instanteEmBrasilia(d), fim = Date.now() + 60_000
  switch (atalho) {
    case 'tudo': return null
    case 'hoje': return { de: ini(hoje), ate: fim, rotulo: `Hoje, ${ddmm(hoje)}` }
    case 'ontem': { const o = somarDias(hoje, -1); return { de: ini(o), ate: ini(hoje), rotulo: `Ontem, ${ddmm(o)}` } }
    case '7': case '15': case '30': {
      const n = Number(atalho), d = somarDias(hoje, -(n - 1))
      return { de: ini(d), ate: fim, rotulo: `Últimos ${n} dias, de ${ddmm(d)} a ${ddmm(hoje)}` }
    }
    case 'mes': { const d = `${hoje.slice(0, 8)}01`; return { de: ini(d), ate: fim, rotulo: `${MESES[Number(hoje.slice(5, 7)) - 1]}, de ${ddmm(d)} a ${ddmm(hoje)}` } }
    case 'personalizado': {
      let a = de || somarDias(hoje, -6), b = ate || hoje
      if (b < a) [a, b] = [b, a]
      return { de: ini(a), ate: ini(somarDias(b, 1)), rotulo: a === b ? `Dia ${ddmm(a)}` : `De ${ddmm(a)} a ${ddmm(b)}` }
    }
  }
}

export function AdminLeads({ sessao, marca }: { sessao: SessaoTeeds; marca?: string }) {
  const [l, setL] = useState<LeadCapturado[]>([])
  const [visitas, setVisitas] = useState<Map<string, PrimeiraVisita>>(new Map())
  const [q, setQ] = useState('')
  const [f, setF] = useState('todos')
  const [e, setE] = useState('')
  const [atalho, setAtalho] = useState<Atalho>('tudo')
  const [de, setDe] = useState('')
  const [ate, setAte] = useState('')
  const [canal, setCanal] = useState<CanalDoLead | ''>('')
  useEffect(() => {
    listarLeads(sessao, marca).then(setL).catch((x) => setE(x.message))
    origemDosLeads(sessao, marca).then(setVisitas).catch(() => undefined)
  }, [sessao, marca])

  const hoje = diaDeBrasilia()
  const per = useMemo(() => janela(atalho, de, ate), [atalho, de, ate])
  const origemDe = useMemo(() => new Map(l.map((x) => [x.id, veioDe(x, visitas.get(x.id))])), [l, visitas])
  /** os do período (antes do canal, da temperatura e da busca): base dos cartões e da contagem por canal */
  const doPeriodo = useMemo(() => per ? l.filter((x) => { const t = Date.parse(x.convertidoEm); return t >= per.de && t < per.ate }) : l, [l, per])
  const canais = useMemo(() => {
    const c = new Map<CanalDoLead, { rotulo: string; n: number }>()
    for (const x of doPeriodo) { const o = origemDe.get(x.id)!; const a = c.get(o.canal); if (a) a.n++; else c.set(o.canal, { rotulo: o.rotulo, n: 1 }) }
    return [...c.entries()].sort((a, b) => b[1].n - a[1].n)
  }, [doPeriodo, origemDe])
  const v = useMemo(() => doPeriodo.filter((x) => {
    const o = origemDe.get(x.id)!
    return (!canal || o.canal === canal)
      && (f === 'todos' || x.temperatura === f || (f === 'ex' && x.exCliente === true) || (f === 'novo' && x.exCliente === false))
      && `${x.nome} ${x.email} ${x.telefone} ${x.campanha} ${origemCadastro(x.pagina)} ${o.rotulo} ${o.detalhe}`.toLowerCase().includes(q.toLowerCase())
  }), [doPeriodo, origemDe, canal, q, f])

  const hot = doPeriodo.filter((x) => x.temperatura === 'quente').length
  const novosHoje = l.filter((x) => diaDeBrasilia(Date.parse(x.convertidoEm)) === hoje).length
  const escolher = (a: Atalho) => {
    if (a === 'personalizado') { setDe((d) => d || somarDias(hoje, -6)); setAte((d) => d || hoje) }
    setAtalho(a)
  }

  const csv = () => {
    const s = 'Nome;E-mail;Telefone;Origem do cadastro;Veio de;Detalhe;Questionário;Temperatura;Pontuação;Campanha;Data\n' + v.map((x) => {
      const o = origemDe.get(x.id)!
      return [celulaCsv(x.nome), celulaCsv(x.email), telefoneCsv(x.telefone), ...[origemCadastro(x.pagina), o.rotulo, o.detalhe, respostaDoQuestionario(x) ?? '', x.temperatura, x.pontuacao, x.campanha || '', new Date(x.convertidoEm).toLocaleString('pt-BR')].map(celulaCsv)].join(';')
    }).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + s]))
    a.download = `leads-${diaDeHoje()}.csv`
    a.click()
  }

  return <div className="leads-admin">
    <div className="lp">
      <div className="lp-linha">
        <span className="lp-rot" id="lp-rot">Período</span>
        <div className="lp-atalhos" role="group" aria-labelledby="lp-rot">
          {ATALHOS.map(([id, texto]) => <button key={id} type="button" aria-pressed={atalho === id} className={atalho === id ? 'on' : ''} onClick={() => escolher(id)}>{texto}</button>)}
        </div>
      </div>
      {atalho === 'personalizado' && <div className="lp-datas">
        <label className="lp-campo"><span>De</span><input id="leads-de" type="date" value={de} max={hoje} onChange={(x) => x.target.value && setDe(x.target.value)} /></label>
        <label className="lp-campo"><span>Até</span><input id="leads-ate" type="date" value={ate} max={hoje} onChange={(x) => x.target.value && setAte(x.target.value)} /></label>
      </div>}
      <p className="lp-leg" aria-live="polite">{per ? <><b>{per.rotulo}</b> · horário de Brasília</> : <><b>Todo o período</b> · desde o primeiro cadastro</>}</p>
    </div>

    <div className="leads-kpis">
      <article><span>Interessados</span><b>{doPeriodo.length}</b><small>{per ? 'no período' : 'base capturada'}</small></article>
      <article className="quente"><span>Leads quentes</span><b>{hot}</b><small>{doPeriodo.length ? Math.round(hot / doPeriodo.length * 100) : 0}% {per ? 'do período' : 'da base'}</small></article>
      <article><span>Novos hoje</span><b>{novosHoje}</b><small>desde 00:00</small></article>
      <article><span>Tempo médio</span><b>{doPeriodo.length ? Math.round(doPeriodo.reduce((s, x) => s + x.tempo, 0) / doPeriodo.length) : 0}s</b><small>antes do cadastro</small></article>
    </div>

    <section className="admin-card full">
      <header><div><span className="rot">Central de interessados</span><h3>Leads capturados</h3></div><button onClick={csv}>Exportar CSV</button></header>
      {canais.length > 0 && <div className="lo" role="group" aria-label="De onde vieram">
        <span className="lo-rot">De onde vieram</span>
        <div className="lo-chips">
          <button type="button" className={canal === '' ? 'on' : ''} aria-pressed={canal === ''} onClick={() => setCanal('')}>Todos <b>{doPeriodo.length}</b></button>
          {canais.map(([id, c]) => <button key={id} type="button" className={`lo-${id}${canal === id ? ' on' : ''}`} aria-pressed={canal === id} onClick={() => setCanal(canal === id ? '' : id)}>
            <i aria-hidden="true" />{c.rotulo} <b>{c.n}</b><small>{Math.round(c.n / doPeriodo.length * 100)}%</small>
          </button>)}
        </div>
      </div>}
      <div className="leads-filtros">
        <input value={q} onChange={(x) => setQ(x.target.value)} placeholder="Buscar nome, e-mail, telefone, campanha ou origem" />
        <select value={f} onChange={(x) => setF(x.target.value)}>
          <option value="todos">Todas as temperaturas</option><option value="quente">Quentes</option><option value="morno">Mornos</option><option value="frio">Frios</option>
          {l.some((x) => x.exCliente !== null) && <><option value="ex">Ex-clientes</option><option value="novo">Nunca foram clientes</option></>}
        </select>
      </div>
      {e ? <p className="leads-erro">{e}</p> : <div className="leads-tabela">
        <div className="cab"><span>Interessado</span><span>Contato / origem</span><span>Temperatura</span><span>Engajamento</span><span>Veio de</span><span>Cadastro</span></div>
        {v.map((x) => {
          const o = origemDe.get(x.id)!
          return <div key={x.id}>
            <span><b>{x.nome}</b><small>{x.email}</small>{respostaDoQuestionario(x) && <small className={x.exCliente ? 'leads-ex' : 'leads-novo'}>{respostaDoQuestionario(x)}</small>}</span>
            <span><b>{x.telefone}</b><small>{origemCadastro(x.pagina)}</small></span>
            <span><em className={x.temperatura}>{x.temperatura}</em><small>{x.pontuacao}/100</small></span>
            <span><b>{x.tempo}s · {x.profundidade}%</b><small>{x.visitas} {x.visitas === 1 ? 'visita' : 'visitas'}</small></span>
            <span className={`lo-celula lo-${o.canal}`}><b><i aria-hidden="true" />{o.rotulo}</b><small title={o.detalhe}>{o.detalhe || '—'}</small></span>
            <span><b>{new Date(x.convertidoEm).toLocaleDateString('pt-BR')}</b><small>{new Date(x.convertidoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small></span>
          </div>
        })}
        {v.length === 0 && <p className="leads-vazio">Nenhum cadastro nesse filtro.</p>}
      </div>}
    </section>
  </div>
}
