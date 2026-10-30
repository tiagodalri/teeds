import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent as TeclaReact } from 'react'
import {
  AREAS, LIMITE_ANEXO, PRIORIDADES, STATUS, hojeISO, somarDias,
  type Anexo, type Area, type Comentario, type Evento, type ItemChecklist, type NovaTarefa, type OrgApi,
  type Pessoa, type Prioridade, type Status, type Tarefa,
} from '../../core/teeds/organizacao'
import { Avatar, corDaPessoa, dataCurta, dataLonga, nomeCurto, primeiroNome, quandoFoi, tamanhoLegivel } from './apoio'
import { TextoRico } from './textoRico'
import './janela-tarefa.css'

/*
  A janela da tarefa (refeita em 30/10/2026). Pedido do Tiago: a antiga era
  vaga — não dava para saber onde ia o título, só cabia um responsável, não
  ficava a data em que a tarefa foi aberta e a descrição era um campo cru.

  Agora, como nos gestores de tarefa que funcionam (Asana, Linear, ClickUp):
  - título com rótulo e exemplo; Ctrl/⌘ + Enter salva;
  - à direita, as propriedades: situação, responsáveis (vários), importância,
    área, início e prazo, e o registro de quem abriu e quando;
  - à esquerda, o conteúdo: descrição com formatação, subtarefas com dono e
    prazo, anexos (arrastar, colar print ou escolher) e a atividade, que junta
    os comentários e o histórico gravado pelo banco.
*/

const COLUNAS: Status[] = ['a_fazer', 'fazendo', 'revisao', 'feito']
const COR_STATUS: Record<Status, string> = { a_fazer: '#94A3B8', fazendo: '#38BDF8', revisao: '#B78D39', feito: '#34D399' }
const ehImagem = (tipo: string) => /^image\/(png|jpe?g|gif|webp|avif|heic|heif)$/i.test(tipo)
const extensao = (nome: string) => (nome.includes('.') ? nome.split('.').pop()!.slice(0, 4).toUpperCase() : 'ARQ')

type Rascunho = NovaTarefa
const rascunhoDe = (t: Tarefa | NovaTarefa): Rascunho => ({
  titulo: t.titulo, descricao: t.descricao, area: t.area, status: t.status, prioridade: t.prioridade,
  responsaveis: [...t.responsaveis], inicio: t.inicio, prazo: t.prazo, checklist: t.checklist.map((c) => ({ ...c })),
})
const igual = (a: Rascunho, b: Rascunho) => JSON.stringify(a) === JSON.stringify(b)

// ------------------------------------------------------------------ miniaturas dos anexos
function Miniatura({ api, a }: { api: OrgApi; a: Anexo }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { let vivo = true; api.abrirAnexo(a).then((u) => { if (vivo) setUrl(u) }).catch(() => undefined); return () => { vivo = false } }, [api, a])
  return url ? <img src={url} alt="" loading="lazy" /> : <span className="ot-anexo-carregando" />
}

// ------------------------------------------------------------------ a janela
export function JanelaTarefa({ api, inicial, equipe, aoFechar, aoSalvar, aoApagar, aoDuplicar, aoVerComentarios, aoVerAnexos }: {
  api: OrgApi; inicial: Tarefa | (NovaTarefa & { id?: undefined }); equipe: Pessoa[]
  aoFechar: () => void; aoSalvar: (t: Tarefa) => void; aoApagar: (id: string) => void
  /** Abre uma tarefa nova com os campos desta. */
  aoDuplicar: (copia: NovaTarefa) => void
  /** Os comentários e anexos já existentes, para a central saber de que tarefa é cada um
   *  (os novos chegam pelo Realtime e a central conta). */
  aoVerComentarios: (ids: string[], tarefaId: string) => void
  aoVerAnexos: (ids: string[], tarefaId: string) => void
}) {
  const [tarefa, setTarefa] = useState<Tarefa | null>(inicial.id ? inicial as Tarefa : null)
  const id = tarefa?.id
  const [f, setF] = useState<Rascunho>(() => rascunhoDe(inicial))
  const [base, setBase] = useState<Rascunho>(() => rascunhoDe(inicial))
  const sujo = !igual(f, base)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [editandoDescricao, setEditandoDescricao] = useState(!inicial.descricao.trim())
  const [novaSub, setNovaSub] = useState('')
  const [anexos, setAnexos] = useState<Anexo[]>([])
  const [pendentes, setPendentes] = useState<File[]>([])
  const [enviando, setEnviando] = useState(0)
  const [arrastando, setArrastando] = useState(false)
  const [coms, setComs] = useState<Comentario[]>([])
  const [eventos, setEventos] = useState<Evento[]>([])
  const [texto, setTexto] = useState('')

  const titulo = useRef<HTMLTextAreaElement>(null)
  const descricao = useRef<HTMLTextAreaElement>(null)
  const escolher = useRef<HTMLInputElement>(null)

  useEffect(() => { if (!inicial.id) titulo.current?.focus() }, [inicial.id])
  // o título cresce com o texto
  useEffect(() => {
    const ajustar = () => { const el = titulo.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px` } } // +2: a borda
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [f.titulo])

  // anexos, comentários e histórico da tarefa aberta
  useEffect(() => {
    if (!id) return
    let vivo = true
    api.anexos(id).then((a) => { if (vivo) { setAnexos(a); aoVerAnexos(a.map((x) => x.id), id) } }).catch(() => undefined)
    api.comentarios(id).then((c) => { if (vivo) { setComs(c); aoVerComentarios(c.map((x) => x.id), id) } }).catch(() => undefined)
    api.historico(id).then((e) => { if (vivo) setEventos(e) }).catch(() => undefined)
    return () => { vivo = false }
  }, [api, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fechar = useCallback(() => {
    if ((sujo || pendentes.length) && !window.confirm('Fechar sem salvar? O que você mudou nesta tarefa vai se perder.')) return
    aoFechar()
  }, [sujo, pendentes.length, aoFechar])

  // ----------------------------------------------------------- salvar
  const enviarArquivos = async (tid: string, arquivos: File[]) => {
    const falhas: string[] = []
    setEnviando((n) => n + arquivos.length)
    for (const arq of arquivos) {
      try { const a = await api.anexar(tid, arq); setAnexos((x) => [...x, a]) } catch (e) { falhas.push((e as Error).message) } finally { setEnviando((n) => n - 1) }
    }
    if (falhas.length) setErro(falhas.join(' '))
    return falhas.length === 0
  }

  const salvar = async () => {
    if (!f.titulo.trim()) { setErro('Escreva o título da tarefa: o que precisa estar pronto no fim.'); titulo.current?.focus(); return }
    if (f.inicio && f.prazo && f.inicio > f.prazo) { setErro('O início está depois do prazo. Ajuste uma das datas.'); return }
    setSalvando(true); setErro(null)
    try {
      const novaSub_ = novaSub.trim()
      const dados = novaSub_ ? { ...f, checklist: [...f.checklist, { texto: novaSub_, feito: false }] } : f
      const t = id ? await api.alterarTarefa(id, dados) : await api.criarTarefa(dados)
      aoSalvar(t)
      if (!id && pendentes.length) {
        const fila = pendentes
        setPendentes([])
        setTarefa(t); setBase(rascunhoDe(t)); setF(rascunhoDe(t)); setNovaSub('')
        // se algum arquivo falhar, a janela fica aberta (já como tarefa criada) para tentar de novo
        if (!(await enviarArquivos(t.id, fila))) return
      }
      aoFechar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }

  const apagar = async () => {
    if (!id || !window.confirm('Apagar esta tarefa, com subtarefas, anexos e comentários? Isso não tem volta.')) return
    try { await api.apagarTarefa(id); aoApagar(id); aoFechar() } catch (e) { setErro((e as Error).message) }
  }

  const duplicar = () => aoDuplicar({ ...f, titulo: `${f.titulo} (cópia)`, status: 'a_fazer', checklist: f.checklist.map((c) => ({ ...c, feito: false })) })

  // atalhos: Esc fecha, Ctrl/⌘ + Enter salva
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar() }
      else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void salvar() }
    }
    document.addEventListener('keydown', tecla)
    return () => document.removeEventListener('keydown', tecla)
  })

  // ----------------------------------------------------------- anexos
  const adicionarArquivos = (lista: FileList | File[]) => {
    const arquivos = [...lista].filter((a) => a.size > 0)
    const grandes = arquivos.filter((a) => a.size > LIMITE_ANEXO)
    const ok = arquivos.filter((a) => a.size <= LIMITE_ANEXO)
    setErro(grandes.length ? `${grandes.map((a) => `"${a.name}"`).join(', ')} passa${grandes.length > 1 ? 'm' : ''} de 25 MB. Coloque um link na descrição.` : null)
    if (!ok.length) return
    if (id) void enviarArquivos(id, ok)
    else setPendentes((p) => [...p, ...ok])
  }
  const colar = (e: ClipboardEvent) => {
    const arquivos = [...e.clipboardData.files]
    if (!arquivos.length) return
    e.preventDefault()
    adicionarArquivos(arquivos.map((a, i) => (a.name && a.name !== 'image.png' ? a : new File([a], `print-${new Date().toLocaleString('pt-BR').replace(/[/:, ]+/g, '-')}${i ? `-${i}` : ''}.${(a.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: a.type }))))
  }
  const soltar = (e: DragEvent) => { e.preventDefault(); setArrastando(false); if (e.dataTransfer.files.length) adicionarArquivos(e.dataTransfer.files) }
  const abrir = async (a: Anexo, baixar = false) => {
    try {
      const url = await api.abrirAnexo(a)
      const l = document.createElement('a')
      l.href = url; l.rel = 'noopener'
      if (baixar) l.download = a.nome; else l.target = '_blank'
      l.click()
    } catch (e) { setErro((e as Error).message) }
  }
  const tirarAnexo = async (a: Anexo) => {
    if (!window.confirm(`Remover "${a.nome}" da tarefa?`)) return
    try { await api.apagarAnexo(a); setAnexos((x) => x.filter((y) => y.id !== a.id)) } catch (e) { setErro((e as Error).message) }
  }

  // ----------------------------------------------------------- descrição: barra de formatação
  const formatar = (antes: string, depois = '', linha = false) => {
    const el = descricao.current
    if (!el) return
    const { selectionStart: a, selectionEnd: b, value: v } = el
    let novo: string; let ini: number; let fim: number
    if (linha) {
      // aplica no começo de cada linha selecionada
      const comeco = v.lastIndexOf('\n', a - 1) + 1
      const trecho = v.slice(comeco, b)
      const linhas = trecho.split('\n').map((l, i) => (antes === '1. ' ? `${i + 1}. ` : antes) + l)
      novo = v.slice(0, comeco) + linhas.join('\n') + v.slice(b)
      ini = comeco; fim = comeco + linhas.join('\n').length
    } else {
      const sel = v.slice(a, b) || (antes === '[' ? 'texto do link' : 'texto')
      const meio = antes === '[' ? `[${sel}](https://)` : `${antes}${sel}${depois}`
      novo = v.slice(0, a) + meio + v.slice(b)
      ini = a + (antes === '[' ? sel.length + 3 : antes.length); fim = antes === '[' ? ini + 8 : ini + sel.length
    }
    setF({ ...f, descricao: novo })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini, fim) })
  }
  const teclaDescricao = (e: TeclaReact<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); formatar('**', '**') }
    else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); formatar('_', '_') }
    else if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      // continua a lista na linha de baixo (e encerra com Enter numa linha vazia)
      const el = e.currentTarget
      const v = el.value; const a = el.selectionStart
      const linha = v.slice(v.lastIndexOf('\n', a - 1) + 1, a)
      const m = linha.match(/^(\s*)([-*•]|\d+[.)])\s+(.*)$/)
      if (!m) return
      e.preventDefault()
      if (!m[3].trim()) { const ini = a - linha.length; setF({ ...f, descricao: v.slice(0, ini) + v.slice(a) }); requestAnimationFrame(() => el.setSelectionRange(ini, ini)); return }
      const prox = /\d/.test(m[2]) ? `${parseInt(m[2], 10) + 1}${m[2].slice(-1)}` : m[2]
      const ins = `\n${m[1]}${prox} `
      setF({ ...f, descricao: v.slice(0, a) + ins + v.slice(el.selectionEnd) })
      requestAnimationFrame(() => el.setSelectionRange(a + ins.length, a + ins.length))
    }
  }

  // ----------------------------------------------------------- subtarefas
  const mudarSub = (i: number, campos: Partial<ItemChecklist>) => setF({ ...f, checklist: f.checklist.map((c, j) => (j === i ? { ...c, ...campos } : c)) })
  const moverSub = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= f.checklist.length) return
    const l = [...f.checklist]; [l[i], l[j]] = [l[j], l[i]]; setF({ ...f, checklist: l })
  }
  const feitos = f.checklist.filter((c) => c.feito).length

  // ----------------------------------------------------------- atividade
  const pessoa = (uid: string | null) => equipe.find((p) => p.id === uid)
  const nome = (uid: string | null) => { const p = pessoa(uid); return p ? (uid === api.euId ? 'Você' : nomeCurto(equipe, p)) : 'Alguém' }
  const nomes = (lista: string) => lista.split(',').filter(Boolean).map((u) => { const p = pessoa(u); return p ? nomeCurto(equipe, p) : 'alguém' })
  const descreverEvento = (e: Evento): string => {
    const data = (v: string | null) => (v ? dataCurta(v) : '')
    switch (e.acao) {
      case 'criou': return 'abriu a tarefa'
      case 'status': return `moveu de ${STATUS[e.de as Status] ?? e.de} para ${STATUS[e.para as Status] ?? e.para}`
      case 'prazo': return !e.para ? 'tirou o prazo' : !e.de ? `definiu o prazo para ${data(e.para)}` : `mudou o prazo de ${data(e.de)} para ${data(e.para)}`
      case 'inicio': return !e.para ? 'tirou a data de início' : `definiu o início para ${data(e.para)}`
      case 'prioridade': return `mudou a importância para ${PRIORIDADES[e.para as Prioridade]?.nome ?? e.para}`
      case 'area': return `mudou a área para ${AREAS[e.para as Area]?.nome ?? e.para}`
      case 'titulo': return 'renomeou a tarefa'
      case 'responsaveis': {
        const antes = (e.de ?? '').split(',').filter(Boolean); const depois = (e.para ?? '').split(',').filter(Boolean)
        const entrou = nomes(depois.filter((u) => !antes.includes(u)).join(',')); const saiu = nomes(antes.filter((u) => !depois.includes(u)).join(','))
        return [entrou.length ? `colocou ${entrou.join(' e ')}` : '', saiu.length ? `tirou ${saiu.join(' e ')}` : ''].filter(Boolean).join(' e ') || 'mudou a ordem dos responsáveis'
      }
    }
  }
  const atividade = useMemo(() => [
    ...coms.map((c) => ({ tipo: 'comentario' as const, quando: c.criadoEm, c })),
    ...eventos.map((e) => ({ tipo: 'evento' as const, quando: e.criadoEm, e })),
  ].sort((a, b) => a.quando.localeCompare(b.quando)), [coms, eventos])
  const comentar = async () => {
    if (!id || !texto.trim()) return
    try { const c = await api.comentar(id, texto); setComs((x) => [...x, c]); setTexto('') } catch (e) { setErro((e as Error).message) }
  }

  // ----------------------------------------------------------- registro (lado)
  const abertura = eventos.find((e) => e.acao === 'criou')
  const criadoEm = tarefa?.criadoEm ?? null
  const autor = abertura?.autor ?? tarefa?.criadoPor ?? null
  const hoje = hojeISO()
  const atalhosPrazo: [string, string][] = [['Hoje', hoje], ['Amanhã', somarDias(hoje, 1)], ['Em 7 dias', somarDias(hoje, 7)]]

  return (
    <div className="og-fundo ot-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <section className={`ot ${arrastando ? 'arrastando' : ''}`} role="dialog" aria-modal="true" aria-labelledby="ot-titulo-rot"
        style={{ ['--area' as string]: AREAS[f.area].cor }} onPaste={colar}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setArrastando(true) } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false) }} onDrop={soltar}>

        <header className="ot-topo">
          <div className="ot-trilha">
            <i aria-hidden="true" />
            <span>{AREAS[f.area].nome}</span>
            <span className="ot-sep" aria-hidden="true">/</span>
            <b>{id ? 'Tarefa' : 'Nova tarefa'}</b>
            {sujo && id && <em className="ot-nao-salvo">Alterações não salvas</em>}
          </div>
          <div className="ot-topo-acoes">
            {id && <button type="button" className="og-btn ot-btn-leve" onClick={duplicar} title="Abre uma tarefa nova com estes mesmos campos">Duplicar</button>}
            <button type="button" className="og-fechar" onClick={fechar} aria-label="Fechar">×</button>
          </div>
        </header>

        <div className="ot-rolagem">
          <div className="ot-titulo">
            <label id="ot-titulo-rot" htmlFor="ot-titulo">Título da tarefa</label>
            <textarea id="ot-titulo" ref={titulo} rows={1} value={f.titulo} maxLength={200}
              placeholder="Ex.: Gravar os 3 criativos da onda 2"
              onChange={(e) => setF({ ...f, titulo: e.target.value.replace(/\n/g, ' ') })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setEditandoDescricao(true); requestAnimationFrame(() => descricao.current?.focus()) } }} />
            <small>Comece com um verbo e diga o que precisa estar pronto no fim.</small>
          </div>

          <div className="ot-grade">
            {/* ------------------------------------------------ conteúdo */}
            <div className="ot-principal">
              <section className="ot-secao">
                <header>
                  <h3>Descrição</h3>
                  {f.descricao.trim() && (
                    <div className="ot-alternar" role="tablist" aria-label="Modo da descrição">
                      <button type="button" role="tab" aria-selected={editandoDescricao} className={editandoDescricao ? 'on' : ''} onClick={() => setEditandoDescricao(true)}>Escrever</button>
                      <button type="button" role="tab" aria-selected={!editandoDescricao} className={!editandoDescricao ? 'on' : ''} onClick={() => setEditandoDescricao(false)}>Ver</button>
                    </div>
                  )}
                </header>
                {editandoDescricao || !f.descricao.trim() ? (
                  <div className="ot-editor">
                    <div className="ot-ferramentas" role="toolbar" aria-label="Formatação">
                      <button type="button" onClick={() => formatar('**', '**')} title="Negrito (Ctrl/⌘ + B)"><b>N</b></button>
                      <button type="button" onClick={() => formatar('_', '_')} title="Itálico (Ctrl/⌘ + I)"><i>I</i></button>
                      <span aria-hidden="true" />
                      <button type="button" onClick={() => formatar('### ', '', true)} title="Subtítulo">T</button>
                      <button type="button" onClick={() => formatar('- ', '', true)} title="Lista">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3" cy="4" r="1.1" /><circle cx="3" cy="8" r="1.1" /><circle cx="3" cy="12" r="1.1" /><path d="M6 4h8M6 8h8M6 12h8" /></svg>
                      </button>
                      <button type="button" onClick={() => formatar('1. ', '', true)} title="Lista numerada">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 4h8M6 8h8M6 12h8" /><text x="1" y="5.6" fontSize="5">1</text><text x="1" y="9.6" fontSize="5">2</text><text x="1" y="13.6" fontSize="5">3</text></svg>
                      </button>
                      <button type="button" onClick={() => formatar('> ', '', true)} title="Destaque">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3v10M6 5h8M6 8h8M6 11h5" /></svg>
                      </button>
                      <span aria-hidden="true" />
                      <button type="button" onClick={() => formatar('[')} title="Link">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M7 9.2a2.6 2.6 0 003.7.1l2-2a2.6 2.6 0 00-3.7-3.7l-.9.9M9 6.8a2.6 2.6 0 00-3.7-.1l-2 2a2.6 2.6 0 003.7 3.7l.9-.9" /></svg>
                      </button>
                      <button type="button" onClick={() => escolher.current?.click()} title="Anexar arquivo">
                        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 7.5l-5.2 5.2a3.2 3.2 0 01-4.5-4.5L8.8 2.7a2.1 2.1 0 013 3L6.4 11.1a1 1 0 01-1.5-1.5L9.7 4.8" /></svg>
                      </button>
                    </div>
                    <textarea ref={descricao} value={f.descricao} rows={7}
                      placeholder={'O contexto, o passo a passo e o que é considerado pronto.\nEx.: Público: quem já respondeu o quiz. Formato: 3 vídeos de 30 s, 9:16.'}
                      onChange={(e) => setF({ ...f, descricao: e.target.value })} onKeyDown={teclaDescricao} />
                    <small className="ot-dica">**negrito**, _itálico_, "- " para lista e links colados viram clicáveis. Cole um print aqui e ele vira anexo.</small>
                  </div>
                ) : (
                  <button type="button" className="ot-descricao-vista" onClick={() => setEditandoDescricao(true)} title="Clique para editar">
                    <TextoRico texto={f.descricao} />
                  </button>
                )}
              </section>

              <section className="ot-secao">
                <header>
                  <h3>Subtarefas {f.checklist.length > 0 && <em>{feitos}/{f.checklist.length}</em>}</h3>
                  {f.checklist.length > 0 && <div className="og-barra ot-barra"><i style={{ width: `${(feitos / f.checklist.length) * 100}%` }} /></div>}
                </header>
                {f.checklist.length > 0 && (
                  <ul className="ot-subs">
                    {f.checklist.map((c, i) => {
                      const dono = equipe.find((p) => p.id === c.responsavel)
                      const atrasada = !c.feito && c.prazo && c.prazo < hoje
                      return (
                        <li key={i} className={c.feito ? 'feito' : ''}>
                          <input type="checkbox" checked={c.feito} onChange={() => mudarSub(i, { feito: !c.feito })} aria-label={`Marcar "${c.texto}" como ${c.feito ? 'não feita' : 'feita'}`} />
                          <input className="ot-sub-texto" value={c.texto} maxLength={200} onChange={(e) => mudarSub(i, { texto: e.target.value })} aria-label="Subtarefa" />
                          <label className="ot-sub-dono" title={dono ? `Responsável: ${dono.nome}` : 'Sem responsável'}>
                            <Avatar pessoa={dono} cor={corDaPessoa(equipe, c.responsavel ?? null)} tamanho={22} />
                            <select value={c.responsavel ?? ''} onChange={(e) => mudarSub(i, { responsavel: e.target.value || null })} aria-label="Responsável da subtarefa">
                              <option value="">Sem responsável</option>
                              {equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                            </select>
                          </label>
                          <label className={`ot-sub-prazo ${c.prazo ? 'tem' : ''} ${atrasada ? 'atrasada' : ''}`} title={c.prazo ? `Prazo: ${dataLonga(c.prazo)}` : 'Definir prazo'}>
                            <span>{c.prazo ? dataCurta(c.prazo) : <svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="2" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></svg>}</span>
                            <input type="date" value={c.prazo ?? ''} onChange={(e) => mudarSub(i, { prazo: e.target.value || null })} aria-label="Prazo da subtarefa"
                              onClick={(e) => { try { e.currentTarget.showPicker?.() } catch { /* o navegador abre do jeito dele */ } }} />
                          </label>
                          <span className="ot-sub-acoes">
                            <button type="button" onClick={() => moverSub(i, -1)} disabled={i === 0} aria-label="Subir">↑</button>
                            <button type="button" onClick={() => moverSub(i, 1)} disabled={i === f.checklist.length - 1} aria-label="Descer">↓</button>
                            <button type="button" onClick={() => setF({ ...f, checklist: f.checklist.filter((_, j) => j !== i) })} aria-label="Remover subtarefa">×</button>
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <form className="ot-add" onSubmit={(e) => { e.preventDefault(); if (novaSub.trim()) { setF({ ...f, checklist: [...f.checklist, { texto: novaSub.trim(), feito: false, responsavel: null, prazo: null }] }); setNovaSub('') } }}>
                  <span aria-hidden="true">+</span>
                  <input value={novaSub} placeholder="Adicionar subtarefa e apertar Enter" onChange={(e) => setNovaSub(e.target.value)} maxLength={200} aria-label="Nova subtarefa" />
                </form>
              </section>

              <section className="ot-secao">
                <header><h3>Anexos {(anexos.length + pendentes.length) > 0 && <em>{anexos.length + pendentes.length}</em>}</h3></header>
                {(anexos.length > 0 || pendentes.length > 0) && (
                  <ul className="ot-anexos">
                    {anexos.map((a) => (
                      <li key={a.id}>
                        <button type="button" className="ot-anexo-capa" onClick={() => void abrir(a)} title="Abrir">
                          {ehImagem(a.tipo) ? <Miniatura api={api} a={a} /> : <b>{extensao(a.nome)}</b>}
                        </button>
                        <span className="ot-anexo-info">
                          <button type="button" className="ot-anexo-nome" onClick={() => void abrir(a)} title={a.nome}>{a.nome}</button>
                          <small>{tamanhoLegivel(a.tamanho)} · {nome(a.autor)} · {quandoFoi(a.criadoEm)}</small>
                        </span>
                        <span className="ot-anexo-acoes">
                          <button type="button" onClick={() => void abrir(a, true)}>Baixar</button>
                          <button type="button" onClick={() => void tirarAnexo(a)} aria-label={`Remover ${a.nome}`}>×</button>
                        </span>
                      </li>
                    ))}
                    {pendentes.map((p, i) => (
                      <li key={`p${i}`} className="pendente">
                        <span className="ot-anexo-capa"><b>{extensao(p.name)}</b></span>
                        <span className="ot-anexo-info"><span className="ot-anexo-nome">{p.name}</span><small>{tamanhoLegivel(p.size)} · Vai junto quando criar a tarefa</small></span>
                        <span className="ot-anexo-acoes"><button type="button" onClick={() => setPendentes((x) => x.filter((_, j) => j !== i))} aria-label={`Tirar ${p.name}`}>×</button></span>
                      </li>
                    ))}
                  </ul>
                )}
                {enviando > 0 && <p className="ot-enviando"><i aria-hidden="true" />Enviando {enviando} {enviando === 1 ? 'arquivo' : 'arquivos'}…</p>}
                <button type="button" className="ot-soltar" onClick={() => escolher.current?.click()}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>
                  <span><b>Arraste arquivos, cole um print ou clique para escolher</b><small>Imagens, PDF, planilhas, vídeos curtos · até 25 MB cada</small></span>
                </button>
                <input ref={escolher} type="file" multiple hidden onChange={(e) => { if (e.target.files) adicionarArquivos(e.target.files); e.target.value = '' }} />
              </section>

              {id && (
                <section className="ot-secao">
                  <header><h3>Atividade</h3></header>
                  <ol className="ot-atividade">
                    {atividade.map((x) => x.tipo === 'evento' ? (
                      <li key={`e${x.e.id}`} className="ot-evento">
                        <i aria-hidden="true" />
                        <span><b>{nome(x.e.autor)}</b> {descreverEvento(x.e)} <time dateTime={x.e.criadoEm}>{quandoFoi(x.e.criadoEm)}</time></span>
                      </li>
                    ) : (
                      <li key={`c${x.c.id}`} className="ot-comentario">
                        <Avatar pessoa={pessoa(x.c.autor)} cor={corDaPessoa(equipe, x.c.autor)} tamanho={26} />
                        <div>
                          <p className="ot-comentario-cab"><b>{nome(x.c.autor)}</b><time dateTime={x.c.criadoEm}>{quandoFoi(x.c.criadoEm)}</time>
                            {x.c.autor === api.euId && <button type="button" onClick={() => void api.apagarComentario(x.c.id).then(() => setComs((l) => l.filter((y) => y.id !== x.c.id)))}>Apagar</button>}
                          </p>
                          <TextoRico texto={x.c.texto} />
                        </div>
                      </li>
                    ))}
                    {atividade.length === 0 && <li className="ot-evento"><i aria-hidden="true" /><span>Carregando…</span></li>}
                  </ol>
                  <form className="ot-comentar" onSubmit={(e) => { e.preventDefault(); void comentar() }}>
                    <Avatar pessoa={pessoa(api.euId)} cor={corDaPessoa(equipe, api.euId)} tamanho={26} />
                    <textarea value={texto} rows={2} maxLength={4000} placeholder="Escreva um comentário (Enter envia, Shift + Enter pula linha)"
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) { e.preventDefault(); void comentar() } }} />
                    <button type="submit" className="og-btn" disabled={!texto.trim()}>Comentar</button>
                  </form>
                </section>
              )}
            </div>

            {/* ------------------------------------------------ propriedades */}
            <aside className="ot-lado">
              <div className="ot-prop">
                <span className="ot-prop-rot">Situação</span>
                <div className="ot-situacao" role="radiogroup" aria-label="Situação">
                  {COLUNAS.map((s) => (
                    <button key={s} type="button" role="radio" aria-checked={f.status === s} className={f.status === s ? 'on' : ''}
                      style={{ ['--cor' as string]: COR_STATUS[s] }} onClick={() => setF({ ...f, status: s })}>
                      <i aria-hidden="true" />{STATUS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ot-prop">
                <span className="ot-prop-rot">Responsáveis <small>{f.responsaveis.length ? `${f.responsaveis.length} ${f.responsaveis.length === 1 ? 'pessoa' : 'pessoas'}` : 'Escolha um ou mais'}</small></span>
                <div className="ot-pessoas" role="group" aria-label="Responsáveis">
                  {equipe.map((p) => {
                    const on = f.responsaveis.includes(p.id)
                    return (
                      <button key={p.id} type="button" aria-pressed={on} className={on ? 'on' : ''}
                        onClick={() => setF({ ...f, responsaveis: on ? f.responsaveis.filter((x) => x !== p.id) : [...f.responsaveis, p.id] })}>
                        <Avatar pessoa={p} cor={corDaPessoa(equipe, p.id)} tamanho={24} />
                        <span className="ot-pessoa-nome">{p.id === api.euId ? `${primeiroNome(p.nome)} (você)` : p.nome}</span>
                        <svg className="ot-marca" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.4l3 3 6-6.6" /></svg>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="ot-prop">
                <span className="ot-prop-rot">Importância</span>
                <div className="ot-prioridade" role="radiogroup" aria-label="Importância">
                  {(['baixa', 'media', 'alta', 'urgente'] as Prioridade[]).map((p) => (
                    <button key={p} type="button" role="radio" aria-checked={f.prioridade === p} className={`p-${p} ${f.prioridade === p ? 'on' : ''}`}
                      onClick={() => setF({ ...f, prioridade: p })}>{PRIORIDADES[p].nome}</button>
                  ))}
                </div>
              </div>

              <label className="ot-prop">
                <span className="ot-prop-rot">Área</span>
                <span className="ot-area-sel">
                  <i aria-hidden="true" />
                  <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value as Area })}>
                    {(Object.keys(AREAS) as Area[]).map((a) => <option key={a} value={a}>{AREAS[a].nome}</option>)}
                  </select>
                </span>
              </label>

              <div className="ot-prop">
                <span className="ot-prop-rot">Datas</span>
                <div className="ot-datas">
                  <label><small>Início</small><input type="date" value={f.inicio ?? ''} max={f.prazo ?? undefined} onChange={(e) => setF({ ...f, inicio: e.target.value || null })} /></label>
                  <label><small>Prazo</small><input type="date" value={f.prazo ?? ''} min={f.inicio ?? undefined} onChange={(e) => setF({ ...f, prazo: e.target.value || null })} /></label>
                </div>
                <div className="ot-atalhos">
                  {atalhosPrazo.map(([r, d]) => <button key={r} type="button" className={f.prazo === d ? 'on' : ''} onClick={() => setF({ ...f, prazo: d })}>{r}</button>)}
                  {f.prazo && <button type="button" onClick={() => setF({ ...f, prazo: null })}>Sem prazo</button>}
                </div>
              </div>

              <div className="ot-registro">
                {criadoEm ? (
                  <>
                    <p><span>Aberta</span><b>{new Date(criadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })} às {new Date(criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</b></p>
                    <p><span>Por</span><b>{nome(autor)}</b></p>
                    {tarefa && tarefa.atualizadoEm !== tarefa.criadoEm && <p><span>Atualizada</span><b>{quandoFoi(tarefa.atualizadoEm)}</b></p>}
                    {tarefa?.concluidoEm && <p><span>Concluída</span><b>{quandoFoi(tarefa.concluidoEm)}</b></p>}
                  </>
                ) : (
                  <p><span>Aberta</span><b>Agora, por {nome(api.euId)}</b></p>
                )}
              </div>
            </aside>
          </div>
        </div>

        {arrastando && <div className="ot-soltar-aqui" aria-hidden="true"><b>Solte para anexar</b></div>}

        <footer className="ot-pe">
          {erro && <p className="og-erro ot-erro" role="alert">{erro}</p>}
          <div className="ot-pe-linha">
            {id ? <button type="button" className="og-btn perigo" onClick={() => void apagar()}>Apagar</button> : <span className="ot-atalho">Ctrl/⌘ + Enter cria a tarefa</span>}
            <span className="og-pe-acoes">
              <button type="button" className="og-btn" onClick={fechar}>Cancelar</button>
              <button type="button" className="og-btn ouro" disabled={salvando || enviando > 0} onClick={() => void salvar()}>
                {salvando ? 'Salvando…' : enviando > 0 ? 'Enviando arquivos…' : id ? 'Salvar' : 'Criar tarefa'}
              </button>
            </span>
          </div>
        </footer>
      </section>
    </div>
  )
}
