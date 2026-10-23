import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import {
  AREAS, MARCOS, PRIORIDADES, STATUS, diasEntre, hojeISO, somarDias,
  type Area, type Comentario, type Dados, type Marco, type Mudanca, type NovaTarefa, type OrgApi,
  type Pessoa, type Prioridade, type Status, type Tarefa, type TipoMarco,
} from '../../core/teeds/organizacao'
import './organizacao.css'

/*
  Central de organização da equipe (Administração > Organização, 23/10/2026).
  Pedido do Tiago: "um Trello da vida" com tarefas delegadas, prazo,
  importância, descrição e um calendário com as datas do lançamento, para
  ele e os dois Victor verem o que cada um tem para fazer no dia.
*/

type Vista = 'dia' | 'quadro' | 'calendario'
type FiltroPessoa = 'todos' | 'ninguem' | string

const COLUNAS: Status[] = ['a_fazer', 'fazendo', 'revisao', 'feito']
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const dataLonga = (iso: string) => {
  const [a, m, d] = iso.split('-').map(Number)
  const t = new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return t.charAt(0).toUpperCase() + t.slice(1)
}
const dataCurta = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const primeiroNome = (n: string) => (n.trim().split(/\s+/)[0] || n)
const iniciais = (n: string) => { const p = n.trim().split(/\s+/).filter(Boolean); return ((p[0]?.[0] ?? '?') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() }
const CORES_PESSOA = ['#B78D39', '#38BDF8', '#A78BFA', '#34D399', '#F472B6', '#FB923C']
const corDaPessoa = (equipe: Pessoa[], id: string | null) => {
  const i = equipe.findIndex((p) => p.id === id)
  return i < 0 ? '#64748B' : CORES_PESSOA[i % CORES_PESSOA.length]
}
const ordenar = (a: Tarefa, b: Tarefa) =>
  PRIORIDADES[a.prioridade].peso - PRIORIDADES[b.prioridade].peso
  || (a.prazo ?? '9999').localeCompare(b.prazo ?? '9999') || a.ordem - b.ordem

function Avatar({ pessoa, cor, tamanho = 22 }: { pessoa: Pessoa | undefined; cor: string; tamanho?: number }) {
  return (
    <span className="og-avatar" style={{ width: tamanho, height: tamanho, background: pessoa ? cor : 'transparent', fontSize: tamanho * 0.42 }}
      title={pessoa ? pessoa.nome : 'Sem responsável'} data-vazio={pessoa ? undefined : ''}>
      {pessoa ? iniciais(pessoa.nome) : '?'}
    </span>
  )
}

function Prazo({ prazo, feito }: { prazo: string | null; feito: boolean }) {
  if (!prazo) return null
  const falta = diasEntre(hojeISO(), prazo)
  const classe = feito ? 'ok' : falta < 0 ? 'atrasada' : falta === 0 ? 'hoje' : falta <= 2 ? 'perto' : ''
  const texto = feito ? dataCurta(prazo) : falta < 0 ? `Atrasada ${-falta}d` : falta === 0 ? 'Hoje' : falta === 1 ? 'Amanhã' : dataCurta(prazo)
  return <span className={`og-prazo ${classe}`} title={`Prazo: ${dataLonga(prazo)}`}>{texto}</span>
}

// ------------------------------------------------------------------ cartão de tarefa
function CartaoTarefa({ t, equipe, comentarios, aoAbrir, aoAlternar, arrastavel }: {
  t: Tarefa; equipe: Pessoa[]; comentarios: number; aoAbrir: () => void; aoAlternar: () => void; arrastavel?: boolean
}) {
  const pessoa = equipe.find((p) => p.id === t.responsavel)
  const feitos = t.checklist.filter((c) => c.feito).length
  const feito = t.status === 'feito'
  return (
    <article className={`og-cartao prio-${t.prioridade} ${feito ? 'feito' : ''}`} draggable={arrastavel}
      onDragStart={(e) => { e.dataTransfer.setData('text/org-tarefa', t.id); e.dataTransfer.effectAllowed = 'move' }}
      style={{ ['--area' as string]: AREAS[t.area].cor }}>
      <button type="button" className="og-check" aria-label={feito ? 'Marcar como não feita' : 'Marcar como feita'}
        aria-pressed={feito} onClick={(e) => { e.stopPropagation(); aoAlternar() }}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" /></svg>
      </button>
      <button type="button" className="og-cartao-corpo" onClick={aoAbrir}>
        <span className="og-cartao-topo">
          <span className="og-area">{AREAS[t.area].nome}</span>
          {(t.prioridade === 'urgente' || t.prioridade === 'alta') && <span className={`og-prio ${t.prioridade}`}>{PRIORIDADES[t.prioridade].nome}</span>}
        </span>
        <b className="og-cartao-titulo">{t.titulo}</b>
        <span className="og-cartao-pe">
          <Prazo prazo={t.prazo} feito={feito} />
          {t.checklist.length > 0 && <span className={`og-meta ${feitos === t.checklist.length ? 'completo' : ''}`} title="Checklist"><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2.5" /><path d="M5.2 8.2l2 2 3.6-4" /></svg>{feitos}/{t.checklist.length}</span>}
          {comentarios > 0 && <span className="og-meta" title="Comentários"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3.5h10a1 1 0 011 1v6a1 1 0 01-1 1H7l-3 2.5v-2.5H3a1 1 0 01-1-1v-6a1 1 0 011-1z" /></svg>{comentarios}</span>}
          <span className="og-cartao-dono"><Avatar pessoa={pessoa} cor={corDaPessoa(equipe, t.responsavel)} /></span>
        </span>
      </button>
    </article>
  )
}

// ------------------------------------------------------------------ janela da tarefa
function JanelaTarefa({ api, inicial, equipe, aoFechar, aoSalvar, aoApagar, aoVerComentarios }: {
  api: OrgApi; inicial: Tarefa | NovaTarefa & { id?: undefined }; equipe: Pessoa[]
  aoFechar: () => void; aoSalvar: (t: Tarefa) => void; aoApagar: (id: string) => void
  /** Os comentários carregados, para a central saber de que tarefa é cada um. */
  aoVerComentarios: (ids: string[], tarefaId: string) => void
}) {
  const [f, setF] = useState<NovaTarefa>({
    titulo: inicial.titulo, descricao: inicial.descricao, area: inicial.area, status: inicial.status,
    prioridade: inicial.prioridade, responsavel: inicial.responsavel, prazo: inicial.prazo, checklist: inicial.checklist,
  })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [novoItem, setNovoItem] = useState('')
  const [coms, setComs] = useState<Comentario[]>([])
  const [texto, setTexto] = useState('')
  const id = inicial.id
  const titulo = useRef<HTMLInputElement>(null)
  useEffect(() => { if (!id) titulo.current?.focus() }, [id])
  useEffect(() => {
    if (!id) return
    let vivo = true
    api.comentarios(id).then((c) => { if (vivo) { setComs(c); aoVerComentarios(c.map((x) => x.id), id) } }).catch(() => undefined)
    return () => { vivo = false }
  }, [api, id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [aoFechar])

  const salvar = async () => {
    if (!f.titulo.trim()) { setErro('Dê um título para a tarefa.'); titulo.current?.focus(); return }
    setSalvando(true); setErro(null)
    try {
      const t = id ? await api.alterarTarefa(id, f) : await api.criarTarefa(f)
      aoSalvar(t); aoFechar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const apagar = async () => {
    if (!id || !window.confirm('Apagar esta tarefa? Isso não tem volta.')) return
    try { await api.apagarTarefa(id); aoApagar(id); aoFechar() } catch (e) { setErro((e as Error).message) }
  }
  const comentar = async () => {
    if (!id || !texto.trim()) return
    try { const c = await api.comentar(id, texto); setComs((x) => [...x, c]); setTexto('') } catch (e) { setErro((e as Error).message) }
  }
  const nome = (uid: string | null) => equipe.find((p) => p.id === uid)?.nome ?? 'Alguém'
  const feitos = f.checklist.filter((c) => c.feito).length

  return (
    <div className="og-fundo" onMouseDown={aoFechar}>
      <section className="og-janela" role="dialog" aria-modal="true" aria-label={id ? 'Editar tarefa' : 'Nova tarefa'}
        onMouseDown={(e) => e.stopPropagation()} style={{ ['--area' as string]: AREAS[f.area].cor }}>
        <header className="og-janela-topo">
          <span className="og-area grande">{AREAS[f.area].nome}</span>
          <button type="button" className="og-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </header>
        <input ref={titulo} className="og-titulo-campo" value={f.titulo} placeholder="O que precisa ser feito?"
          onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={200} />

        <div className="og-campos">
          <label><span>Responsável</span>
            <select value={f.responsavel ?? ''} onChange={(e) => setF({ ...f, responsavel: e.target.value || null })}>
              <option value="">Sem responsável</option>
              {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <label><span>Prazo</span>
            <input type="date" value={f.prazo ?? ''} onChange={(e) => setF({ ...f, prazo: e.target.value || null })} />
          </label>
          <label><span>Importância</span>
            <select value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value as Prioridade })}>
              {(Object.keys(PRIORIDADES) as Prioridade[]).map((p) => <option key={p} value={p}>{PRIORIDADES[p].nome}</option>)}
            </select>
          </label>
          <label><span>Área</span>
            <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as Area })}>
              {(Object.keys(AREAS) as Area[]).map((a) => <option key={a} value={a}>{AREAS[a].nome}</option>)}
            </select>
          </label>
          <label><span>Situação</span>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Status })}>
              {COLUNAS.map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
            </select>
          </label>
        </div>

        <label className="og-bloco"><span>Descrição</span>
          <textarea value={f.descricao} rows={4} placeholder="Detalhes, links, o que é considerado pronto…"
            onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </label>

        <div className="og-bloco">
          <span>Checklist {f.checklist.length > 0 && <em>{feitos}/{f.checklist.length}</em>}</span>
          {f.checklist.length > 0 && <div className="og-barra"><i style={{ width: `${(feitos / f.checklist.length) * 100}%` }} /></div>}
          <ul className="og-checklist">
            {f.checklist.map((c, i) => (
              <li key={i} className={c.feito ? 'feito' : ''}>
                <label>
                  <input type="checkbox" checked={c.feito} onChange={() => setF({ ...f, checklist: f.checklist.map((x, j) => (j === i ? { ...x, feito: !x.feito } : x)) })} />
                  <span>{c.texto}</span>
                </label>
                <button type="button" aria-label="Remover item" onClick={() => setF({ ...f, checklist: f.checklist.filter((_, j) => j !== i) })}>×</button>
              </li>
            ))}
          </ul>
          <form className="og-add-item" onSubmit={(e) => { e.preventDefault(); if (novoItem.trim()) { setF({ ...f, checklist: [...f.checklist, { texto: novoItem.trim(), feito: false }] }); setNovoItem('') } }}>
            <input value={novoItem} placeholder="Adicionar item e Enter" onChange={(e) => setNovoItem(e.target.value)} maxLength={200} />
          </form>
        </div>

        {id && (
          <div className="og-bloco">
            <span>Comentários</span>
            <ul className="og-comentarios">
              {coms.map((c) => (
                <li key={c.id}>
                  <b>{primeiroNome(nome(c.autor))}</b>
                  <small>{new Date(c.criadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</small>
                  <p>{c.texto}</p>
                  {c.autor === api.euId && <button type="button" onClick={() => void api.apagarComentario(c.id).then(() => setComs((x) => x.filter((y) => y.id !== c.id)))}>Apagar</button>}
                </li>
              ))}
              {coms.length === 0 && <li className="vazio">Nenhum comentário ainda.</li>}
            </ul>
            <form className="og-add-item" onSubmit={(e) => { e.preventDefault(); void comentar() }}>
              <input value={texto} placeholder="Escrever um comentário e Enter" onChange={(e) => setTexto(e.target.value)} maxLength={4000} />
            </form>
          </div>
        )}

        {erro && <p className="og-erro">{erro}</p>}
        <footer className="og-janela-pe">
          {id ? <button type="button" className="og-btn perigo" onClick={() => void apagar()}>Apagar</button> : <span />}
          <span className="og-pe-acoes">
            <button type="button" className="og-btn" onClick={aoFechar}>Cancelar</button>
            <button type="button" className="og-btn ouro" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : id ? 'Salvar' : 'Criar tarefa'}</button>
          </span>
        </footer>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ janela do marco
function JanelaMarco({ api, inicial, aoFechar, aoSalvar, aoApagar }: {
  api: OrgApi; inicial: Marco | (Omit<Marco, 'id'> & { id?: undefined })
  aoFechar: () => void; aoSalvar: (m: Marco) => void; aoApagar: (id: string) => void
}) {
  const [f, setF] = useState({ titulo: inicial.titulo, descricao: inicial.descricao, data: inicial.data, hora: inicial.hora ?? '', tipo: inicial.tipo })
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const id = inicial.id
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [aoFechar])
  const salvar = async () => {
    if (!f.titulo.trim() || !f.data) { setErro('Preencha o título e a data.'); return }
    setSalvando(true); setErro(null)
    try {
      const dados = { ...f, hora: f.hora || null }
      const m = id ? await api.alterarMarco(id, dados) : await api.criarMarco(dados)
      aoSalvar(m); aoFechar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const apagar = async () => {
    if (!id || !window.confirm('Apagar este marco do calendário?')) return
    try { await api.apagarMarco(id); aoApagar(id); aoFechar() } catch (e) { setErro((e as Error).message) }
  }
  return (
    <div className="og-fundo" onMouseDown={aoFechar}>
      <section className="og-janela pequena" role="dialog" aria-modal="true" aria-label={id ? 'Editar marco' : 'Novo marco'}
        onMouseDown={(e) => e.stopPropagation()} style={{ ['--area' as string]: MARCOS[f.tipo].cor }}>
        <header className="og-janela-topo">
          <span className="og-area grande">Marco do calendário</span>
          <button type="button" className="og-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </header>
        <input className="og-titulo-campo" value={f.titulo} placeholder="Ex.: Live de lançamento" autoFocus={!id}
          onChange={(e) => setF({ ...f, titulo: e.target.value })} maxLength={200} />
        <div className="og-campos">
          <label><span>Data</span><input type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} /></label>
          <label><span>Hora (opcional)</span><input type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} /></label>
          <label><span>Tipo</span>
            <select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoMarco })}>
              {(Object.keys(MARCOS) as TipoMarco[]).map((t) => <option key={t} value={t}>{MARCOS[t].nome}</option>)}
            </select>
          </label>
        </div>
        <label className="og-bloco"><span>Descrição</span>
          <textarea value={f.descricao} rows={3} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </label>
        {erro && <p className="og-erro">{erro}</p>}
        <footer className="og-janela-pe">
          {id ? <button type="button" className="og-btn perigo" onClick={() => void apagar()}>Apagar</button> : <span />}
          <span className="og-pe-acoes">
            <button type="button" className="og-btn" onClick={aoFechar}>Cancelar</button>
            <button type="button" className="og-btn ouro" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : id ? 'Salvar' : 'Criar marco'}</button>
          </span>
        </footer>
      </section>
    </div>
  )
}

// ------------------------------------------------------------------ a central
export function Organizacao({ api, semTitulo = false }: { api: OrgApi; semTitulo?: boolean }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [vista, setVista] = useState<Vista>(() => {
    try { const v = localStorage.getItem('org.vista'); return v === 'quadro' || v === 'calendario' ? v : 'dia' } catch { return 'dia' }
  })
  const [pessoa, setPessoa] = useState<FiltroPessoa>(api.euId)
  const [areas, setAreas] = useState<Set<Area>>(new Set())
  const [busca, setBusca] = useState('')
  const hoje = hojeISO()
  const [dia, setDia] = useState(hoje)
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [tarefaAberta, setTarefaAberta] = useState<Tarefa | (NovaTarefa & { id?: undefined }) | null>(null)
  const [marcoAberto, setMarcoAberto] = useState<Marco | (Omit<Marco, 'id'> & { id?: undefined }) | null>(null)
  const [arrastandoSobre, setArrastandoSobre] = useState<Status | null>(null)
  const comentarioDaTarefa = useRef(new Map<string, string>())

  const trocarVista = (v: Vista) => { setVista(v); try { localStorage.setItem('org.vista', v) } catch { /* só nesta sessão */ } }

  const recarregar = useCallback(() => {
    api.carregar().then((d) => { setDados(d); setErro(null) }).catch((e) => setErro((e as Error).message))
  }, [api])
  useEffect(() => { recarregar() }, [recarregar])

  // o que os outros mudam chega aqui
  const aplicar = useCallback((m: Mudanca) => {
    setDados((d) => {
      if (!d) return d
      if (m.tipo === 'tarefa') {
        const tarefas = m.acao === 'apagou' ? d.tarefas.filter((t) => t.id !== m.id)
          : d.tarefas.some((t) => t.id === m.item.id) ? d.tarefas.map((t) => (t.id === m.item.id ? m.item : t)) : [...d.tarefas, m.item]
        return { ...d, tarefas }
      }
      if (m.tipo === 'marco') {
        const marcos = m.acao === 'apagou' ? d.marcos.filter((x) => x.id !== m.id)
          : d.marcos.some((x) => x.id === m.item.id) ? d.marcos.map((x) => (x.id === m.item.id ? m.item : x)) : [...d.marcos, m.item]
        return { ...d, marcos }
      }
      const cont = { ...d.contagemComentarios }
      if (m.acao === 'salvou') {
        if (!comentarioDaTarefa.current.has(m.item.id)) { cont[m.item.tarefaId] = (cont[m.item.tarefaId] ?? 0) + 1; comentarioDaTarefa.current.set(m.item.id, m.item.tarefaId) }
      } else {
        const tid = m.tarefaId ?? comentarioDaTarefa.current.get(m.id)
        if (tid && cont[tid]) cont[tid] -= 1
        comentarioDaTarefa.current.delete(m.id)
      }
      return { ...d, contagemComentarios: cont }
    })
  }, [])
  useEffect(() => api.acompanhar(aplicar), [api, aplicar])

  const salvarLocal = (t: Tarefa) => aplicar({ tipo: 'tarefa', acao: 'salvou', item: t })
  const alternarFeito = async (t: Tarefa) => {
    const status: Status = t.status === 'feito' ? 'a_fazer' : 'feito'
    salvarLocal({ ...t, status })
    try { salvarLocal(await api.alterarTarefa(t.id, { status })) } catch (e) { salvarLocal(t); setErro((e as Error).message) }
  }
  const moverPara = async (id: string, status: Status) => {
    const t = dados?.tarefas.find((x) => x.id === id)
    if (!t || t.status === status) return
    salvarLocal({ ...t, status })
    try { salvarLocal(await api.alterarTarefa(id, { status })) } catch (e) { salvarLocal(t); setErro((e as Error).message) }
  }

  const equipe = dados?.equipe ?? []
  const tarefas = dados?.tarefas ?? []
  const marcos = dados?.marcos ?? []
  const contagem = dados?.contagemComentarios ?? {}

  // filtros que valem em todas as visões
  const termo = busca.trim().toLowerCase()
  const filtradas = useMemo(() => tarefas.filter((t) => {
    if (pessoa === 'ninguem' ? t.responsavel !== null : pessoa !== 'todos' && t.responsavel !== pessoa) return false
    if (areas.size && !areas.has(t.area)) return false
    if (termo && !(`${t.titulo} ${t.descricao}`.toLowerCase().includes(termo))) return false
    return true
  }), [tarefas, pessoa, areas, termo])

  // números do topo (sobre as tarefas filtradas)
  const abertas = filtradas.filter((t) => t.status !== 'feito')
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < hoje)
  const paraHoje = abertas.filter((t) => t.prazo === hoje)
  const semana = abertas.filter((t) => t.prazo && t.prazo > hoje && t.prazo <= somarDias(hoje, 7))
  const concluidas7 = filtradas.filter((t) => t.status === 'feito' && t.concluidoEm && t.concluidoEm.slice(0, 10) >= somarDias(hoje, -7))

  // contagem regressiva até o próximo lançamento
  const proximoLancamento = marcos.filter((m) => m.tipo === 'lancamento' && m.data >= hoje).sort((a, b) => a.data.localeCompare(b.data))[0]
  const faltam = proximoLancamento ? diasEntre(hoje, proximoLancamento.data) : null

  const novaTarefa = (extra: Partial<NovaTarefa> = {}) => setTarefaAberta({
    titulo: '', descricao: '', area: areas.size === 1 ? [...areas][0] : 'geral', status: 'a_fazer', prioridade: 'media',
    responsavel: pessoa !== 'todos' && pessoa !== 'ninguem' ? pessoa : null, prazo: vista === 'dia' ? dia : null, checklist: [], ...extra,
  })
  const novoMarco = (data = vista === 'calendario' ? dia : hoje) => setMarcoAberto({ titulo: '', descricao: '', data, hora: null, tipo: 'outro' })

  if (erro && !dados) return <section className="og"><p className="og-erro">{erro}</p><button className="og-btn" onClick={recarregar}>Tentar de novo</button></section>
  if (!dados) return <section className="og"><p className="og-carregando">Carregando a central…</p></section>

  const nomePessoa = pessoa === 'todos' ? 'toda a equipe' : pessoa === 'ninguem' ? 'tarefas sem responsável' : pessoa === api.euId ? 'você' : primeiroNome(equipe.find((p) => p.id === pessoa)?.nome ?? '')

  // ---------------------------------------------------------------- visões
  const porArea = (lista: Tarefa[]) => {
    const g = new Map<Area, Tarefa[]>()
    for (const t of [...lista].sort(ordenar)) { if (!g.has(t.area)) g.set(t.area, []); g.get(t.area)!.push(t) }
    return [...g.entries()].sort((a, b) => Object.keys(AREAS).indexOf(a[0]) - Object.keys(AREAS).indexOf(b[0]))
  }
  const cartao = (t: Tarefa, arrastavel = false) => (
    <CartaoTarefa key={t.id} t={t} equipe={equipe} comentarios={contagem[t.id] ?? 0} arrastavel={arrastavel}
      aoAbrir={() => setTarefaAberta(t)} aoAlternar={() => void alternarFeito(t)} />
  )

  const marcosDoDia = (d: string) => marcos.filter((m) => m.data === d).sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? ''))
  const SeloMarco = ({ m }: { m: Marco }) => (
    <button type="button" className={`og-marco tipo-${m.tipo}`} style={{ ['--marco' as string]: MARCOS[m.tipo].cor }} onClick={() => setMarcoAberto(m)}
      title={m.descricao || m.titulo}>
      <i aria-hidden="true" />{m.hora && <time>{m.hora}</time>}<span>{m.titulo}</span>
    </button>
  )

  const agendaDoDia = (d: string, compacta = false) => {
    const doDia = filtradas.filter((t) => t.prazo === d)
    const grupos = porArea(doDia)
    const ms = marcosDoDia(d)
    return (
      <div className={`og-agenda ${compacta ? 'compacta' : ''}`}>
        {ms.length > 0 && <div className="og-agenda-marcos">{ms.map((m) => <SeloMarco key={m.id} m={m} />)}</div>}
        {grupos.length === 0 && <p className="og-vazio">Nada com prazo neste dia{pessoa !== 'todos' ? ` para ${nomePessoa}` : ''}.</p>}
        {grupos.map(([area, lista]) => (
          <section key={area} className="og-grupo" style={{ ['--area' as string]: AREAS[area].cor }}>
            <h4><i aria-hidden="true" />{AREAS[area].nome}<small>{lista.filter((t) => t.status !== 'feito').length} em aberto</small></h4>
            <div className="og-lista">{lista.map((t) => cartao(t))}</div>
          </section>
        ))}
      </div>
    )
  }

  const vistaDia = () => {
    const ehHoje = dia === hoje
    const atrasadasAte = abertas.filter((t) => t.prazo && t.prazo < dia)
    const proximos = abertas.filter((t) => t.prazo && t.prazo > dia && t.prazo <= somarDias(dia, 7)).sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? '') || ordenar(a, b))
    const semPrazo = abertas.filter((t) => !t.prazo).sort(ordenar)
    return (
      <div className="og-dia">
        <div className="og-dia-nav">
          <button type="button" className="og-btn icone" onClick={() => setDia(somarDias(dia, -1))} aria-label="Dia anterior">‹</button>
          <div className="og-dia-titulo">
            <h3>{ehHoje ? 'Hoje' : dia === somarDias(hoje, 1) ? 'Amanhã' : dataCurta(dia)}</h3>
            <span>{dataLonga(dia)}</span>
          </div>
          <button type="button" className="og-btn icone" onClick={() => setDia(somarDias(dia, 1))} aria-label="Próximo dia">›</button>
          {!ehHoje && <button type="button" className="og-btn" onClick={() => setDia(hoje)}>Voltar para hoje</button>}
          <input type="date" className="og-dia-data" value={dia} onChange={(e) => e.target.value && setDia(e.target.value)} aria-label="Escolher o dia" />
        </div>
        <div className="og-dia-grade">
          <div className="og-dia-principal">
            <h3 className="og-secao">O que precisa acontecer {ehHoje ? 'hoje' : 'neste dia'}</h3>
            {agendaDoDia(dia)}
          </div>
          <aside className="og-dia-lado">
            {atrasadasAte.length > 0 && (
              <section className="og-painel alerta">
                <h4>Atrasadas <b>{atrasadasAte.length}</b></h4>
                <div className="og-lista">{[...atrasadasAte].sort((a, b) => (a.prazo ?? '').localeCompare(b.prazo ?? '')).map((t) => cartao(t))}</div>
              </section>
            )}
            <section className="og-painel">
              <h4>Próximos 7 dias <b>{proximos.length}</b></h4>
              {proximos.length === 0 ? <p className="og-vazio">Nada nos próximos dias.</p> : <div className="og-lista">{proximos.map((t) => cartao(t))}</div>}
            </section>
            {semPrazo.length > 0 && (
              <section className="og-painel">
                <h4>Sem prazo <b>{semPrazo.length}</b></h4>
                <div className="og-lista">{semPrazo.map((t) => cartao(t))}</div>
              </section>
            )}
          </aside>
        </div>
      </div>
    )
  }

  const soltar = (s: Status) => (e: DragEvent) => { e.preventDefault(); setArrastandoSobre(null); const id = e.dataTransfer.getData('text/org-tarefa'); if (id) void moverPara(id, s) }
  const vistaQuadro = () => (
    <div className="og-quadro">
      {COLUNAS.map((s) => {
        const lista = filtradas.filter((t) => t.status === s).sort(s === 'feito' ? (a, b) => (b.concluidoEm ?? '').localeCompare(a.concluidoEm ?? '') : ordenar)
        return (
          <section key={s} className={`og-coluna col-${s} ${arrastandoSobre === s ? 'sobre' : ''}`}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (arrastandoSobre !== s) setArrastandoSobre(s) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastandoSobre(null) }}
            onDrop={soltar(s)}>
            <header><h4>{STATUS[s]}</h4><b>{lista.length}</b></header>
            <div className="og-coluna-lista">
              {lista.map((t) => cartao(t, true))}
              {lista.length === 0 && <p className="og-vazio">Arraste uma tarefa para cá.</p>}
            </div>
            {s !== 'feito' && <button type="button" className="og-add" onClick={() => novaTarefa({ status: s })}>+ Adicionar tarefa</button>}
          </section>
        )
      })}
    </div>
  )

  const vistaCalendario = () => {
    const [a, m] = mes.split('-').map(Number)
    const primeiro = new Date(a, m - 1, 1)
    const inicio = new Date(a, m - 1, 1 - primeiro.getDay())
    const celulas = Array.from({ length: 42 }, (_, i) => hojeISO(new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i)))
    const semanas = celulas[35].slice(0, 7) === mes ? 6 : 5
    const mudarMes = (n: number) => { const d = new Date(a, m - 1 + n, 1); setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`) }
    return (
      <div className="og-cal">
        <div className="og-cal-principal">
          <div className="og-dia-nav">
            <button type="button" className="og-btn icone" onClick={() => mudarMes(-1)} aria-label="Mês anterior">‹</button>
            <div className="og-dia-titulo"><h3>{MESES[m - 1]} {a}</h3></div>
            <button type="button" className="og-btn icone" onClick={() => mudarMes(1)} aria-label="Próximo mês">›</button>
            {mes !== hoje.slice(0, 7) && <button type="button" className="og-btn" onClick={() => { setMes(hoje.slice(0, 7)); setDia(hoje) }}>Hoje</button>}
            <span className="og-legenda">
              {(['lancamento', 'live', 'captacao', 'trafego', 'campanha', 'feriado'] as TipoMarco[]).map((t) => (
                <span key={t}><i style={{ background: MARCOS[t].cor }} />{MARCOS[t].nome}</span>
              ))}
            </span>
          </div>
          <div className="og-cal-grade" role="grid" aria-label={`${MESES[m - 1]} de ${a}`}>
            {DIAS_SEMANA.map((d) => <div key={d} className="og-cal-semana" role="columnheader">{d}</div>)}
            {celulas.slice(0, semanas * 7).map((d) => {
              const ms = marcosDoDia(d)
              const ts = filtradas.filter((t) => t.prazo === d).sort(ordenar)
              const fora = d.slice(0, 7) !== mes
              const abertasDia = ts.filter((t) => t.status !== 'feito')
              const mostrar = ts.slice(0, Math.max(0, 3 - ms.length))
              const atrasadaNoDia = d < hoje && abertasDia.length > 0
              return (
                <div key={d} role="gridcell" tabIndex={0}
                  className={`og-cal-dia ${fora ? 'fora' : ''} ${d === hoje ? 'hoje' : ''} ${d === dia ? 'sel' : ''} ${ms.some((x) => x.tipo === 'lancamento') ? 'lancamento' : ''}`}
                  onClick={() => setDia(d)} onKeyDown={(e) => { if (e.key === 'Enter') setDia(d) }}>
                  <span className="og-cal-num">{Number(d.slice(8))}{atrasadaNoDia && <i className="og-cal-alerta" title="Tarefas atrasadas" />}</span>
                  {ms.map((x) => (
                    <span key={x.id} className="og-cal-marco" style={{ ['--marco' as string]: MARCOS[x.tipo].cor }} title={x.titulo}>{x.titulo}</span>
                  ))}
                  {mostrar.map((t) => (
                    <span key={t.id} className={`og-cal-tarefa ${t.status === 'feito' ? 'feito' : ''}`} style={{ ['--area' as string]: AREAS[t.area].cor }} title={t.titulo}>{t.titulo}</span>
                  ))}
                  {ts.length > mostrar.length && <span className="og-cal-mais">+{ts.length - mostrar.length} tarefas</span>}
                </div>
              )
            })}
          </div>
        </div>
        <aside className="og-cal-lado">
          <div className="og-cal-lado-topo">
            <div><h3>{dia === hoje ? 'Hoje' : dataCurta(dia)}</h3><span>{dataLonga(dia)}</span></div>
          </div>
          <div className="og-cal-lado-acoes">
            <button type="button" className="og-btn" onClick={() => novaTarefa({ prazo: dia })}>+ Tarefa neste dia</button>
            <button type="button" className="og-btn" onClick={() => novoMarco(dia)}>+ Marco neste dia</button>
          </div>
          {agendaDoDia(dia, true)}
        </aside>
      </div>
    )
  }

  // ---------------------------------------------------------------- tela
  return (
    <section className="og">
      <header className={`og-topo ${semTitulo ? 'sem-titulo' : ''}`}>
        {!semTitulo && (
          <div>
            <span className="og-rot">Central da equipe</span>
            <h2>Organização</h2>
            <p>Tarefas, responsáveis, prazos e o calendário do lançamento. Tudo que um move aparece na hora para os outros.</p>
          </div>
        )}
        <div className="og-topo-lado">
          {proximoLancamento && faltam !== null && (
            <button type="button" className="og-contagem" onClick={() => { trocarVista('calendario'); setMes(proximoLancamento.data.slice(0, 7)); setDia(proximoLancamento.data) }}>
              <b>{faltam === 0 ? 'Hoje' : faltam}</b>
              <span>{faltam === 0 ? '' : faltam === 1 ? 'dia para' : 'dias para'} {proximoLancamento.titulo.toLowerCase()}<small>{dataLonga(proximoLancamento.data)}{proximoLancamento.hora ? `, ${proximoLancamento.hora}` : ''}</small></span>
            </button>
          )}
          <div className="og-topo-botoes">
            <button type="button" className="og-btn" onClick={() => novoMarco()}>+ Marco</button>
            <button type="button" className="og-btn ouro" onClick={() => novaTarefa()}>+ Nova tarefa</button>
          </div>
        </div>
      </header>

      <div className="og-kpis">
        <div className={atrasadas.length ? 'alerta' : ''}><span>Atrasadas</span><b>{atrasadas.length}</b></div>
        <div className={paraHoje.length ? 'destaque' : ''}><span>Para hoje</span><b>{paraHoje.length}</b></div>
        <div><span>Próximos 7 dias</span><b>{semana.length}</b></div>
        <div><span>Em aberto</span><b>{abertas.length}</b></div>
        <div className="ok"><span>Concluídas na semana</span><b>{concluidas7.length}</b></div>
      </div>

      <div className="og-barra-filtros">
        <div className="og-abas" role="tablist">
          {([['dia', 'Meu dia'], ['quadro', 'Quadro'], ['calendario', 'Calendário']] as [Vista, string][]).map(([v, n]) => (
            <button key={v} type="button" role="tab" aria-selected={vista === v} className={vista === v ? 'on' : ''} onClick={() => trocarVista(v)}>{n}</button>
          ))}
        </div>
        <div className="og-pessoas" aria-label="Filtrar por responsável">
          <button type="button" className={pessoa === 'todos' ? 'on' : ''} onClick={() => setPessoa('todos')}>Todos</button>
          {equipe.map((p) => (
            <button key={p.id} type="button" className={pessoa === p.id ? 'on' : ''} onClick={() => setPessoa(p.id)} title={p.nome}>
              <Avatar pessoa={p} cor={corDaPessoa(equipe, p.id)} tamanho={20} />{p.id === api.euId ? 'Eu' : primeiroNome(p.nome)}
              {p.id !== api.euId && equipe.filter((x) => primeiroNome(x.nome) === primeiroNome(p.nome)).length > 1 && <small>{p.nome.split(/\s+/).slice(-1)[0]}</small>}
            </button>
          ))}
          <button type="button" className={pessoa === 'ninguem' ? 'on' : ''} onClick={() => setPessoa('ninguem')}>Sem responsável</button>
        </div>
        <div className="og-areas" aria-label="Filtrar por área">
          {(Object.keys(AREAS) as Area[]).map((ar) => (
            <button key={ar} type="button" className={areas.has(ar) ? 'on' : ''} style={{ ['--area' as string]: AREAS[ar].cor }}
              onClick={() => setAreas((s) => { const n = new Set(s); n.has(ar) ? n.delete(ar) : n.add(ar); return n })}>
              <i aria-hidden="true" />{AREAS[ar].nome}
            </button>
          ))}
          <input className="og-busca" type="search" placeholder="Buscar tarefa" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar tarefa" />
        </div>
      </div>

      {erro && <p className="og-erro">{erro}</p>}
      {vista === 'dia' && vistaDia()}
      {vista === 'quadro' && vistaQuadro()}
      {vista === 'calendario' && vistaCalendario()}

      {tarefaAberta && (
        <JanelaTarefa api={api} inicial={tarefaAberta} equipe={equipe} aoFechar={() => setTarefaAberta(null)}
          aoSalvar={salvarLocal} aoApagar={(id) => aplicar({ tipo: 'tarefa', acao: 'apagou', id })}
          aoVerComentarios={(ids, tid) => ids.forEach((c) => comentarioDaTarefa.current.set(c, tid))} />
      )}
      {marcoAberto && (
        <JanelaMarco api={api} inicial={marcoAberto} aoFechar={() => setMarcoAberto(null)}
          aoSalvar={(m) => aplicar({ tipo: 'marco', acao: 'salvou', item: m })} aoApagar={(id) => aplicar({ tipo: 'marco', acao: 'apagou', id })} />
      )}
    </section>
  )
}
