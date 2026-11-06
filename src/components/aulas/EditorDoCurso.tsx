import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  alunosDoCurso, aulasDoCurso, CORES_DA_MARCA, enviarCapa, liberarCurso, modulosDoCurso,
  type AlunoDoCurso, type CursoGrade, type GradeAulas, type ModoDoCurso, type PlanoEscolhido,
} from '../../core/teeds/gradeAulas'
import { MARCA } from '../../marca'
import { IconeFechar } from '../IconeFechar'
import { CapaDoCurso } from './VitrineDeCursos'
import './editor-curso.css'

/*
  Os cursos no painel (06/11/2026). A lista é a porta (como uma área de
  membros: capa, nome, módulos, aulas, acesso, situação); cada curso abre com
  as abas Conteúdo (a árvore de módulos e aulas do EditorDaGrade),
  Informações, Acesso e venda, e Alunos.
*/

export type AbaDoCurso = 'conteudo' | 'info' | 'acesso' | 'alunos'

/** O endereço que recebe os avisos de compra da Cakto (servidor da GlobalFly). */
export const WEBHOOK_DA_CAKTO = 'https://motor.globalflytrade.com/cakto/compra'
/** A venda pela Cakto existe só na GlobalFly (o webhook é dela). */
export const vendePelaCakto = (marca: string) => marca === 'globalfly'

const hora = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const dia = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '')
const paraCampo = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const doCampo = (v: string) => (v ? new Date(v).toISOString() : null)

export function resumoDoAcesso(c: CursoGrade): { texto: string; tom: 'todos' | 'planos' | 'compra' } {
  if (c.acesso.modo === 'planos') return { texto: c.acesso.planos.length ? `Planos: ${c.acesso.planos.map((p) => p.nome).join(', ')}` : 'Planos: nenhum escolhido', tom: 'planos' }
  if (c.acesso.modo === 'compra') return { texto: `Venda à parte${c.acesso.cakto.length ? '' : ' · sem produto'}`, tom: 'compra' }
  return { texto: 'Todos os alunos', tom: 'todos' }
}
function situacao(c: CursoGrade): { texto: string; tom: 'ok' | 'oculto' | 'agenda' } {
  if (!c.publicado) return { texto: 'Oculto', tom: 'oculto' }
  if (c.liberarEm && Date.parse(c.liberarEm) > Date.now()) return { texto: `Abre ${dia(c.liberarEm)}`, tom: 'agenda' }
  return { texto: 'Visível', tom: 'ok' }
}

/* ============================================================ a lista */

export function ListaDeCursos({ grade, aoAbrir, aoNovo, mudar, aoDuplicar, aoRemover }: {
  grade: GradeAulas; aoAbrir: (id: string, aba?: AbaDoCurso) => void; aoNovo: () => void
  mudar: (fn: (g: GradeAulas) => void) => void; aoDuplicar: (id: string) => void; aoRemover: (id: string) => void
}) {
  const cursos = grade.cursos ?? []
  const mover = (i: number, d: -1 | 1) => mudar((g) => { const l = g.cursos!; const j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]] })
  const arrastando = useRef<number | null>(null)
  const [alvo, setAlvo] = useState<number | null>(null)
  const soltar = (para: number) => {
    const de = arrastando.current; arrastando.current = null; setAlvo(null)
    if (de == null || de === para) return
    mudar((g) => { const l = g.cursos!; const [c] = l.splice(de, 1); l.splice(para, 0, c) })
  }
  return (
    <section className="ec-lista" aria-label="Cursos">
      <header className="ec-lista-topo">
        <div><h3>Cursos</h3><small>A ordem aqui é a ordem na vitrine dos alunos. Arraste pela alça ⋮⋮ ou use as setas.</small></div>
        <button type="button" className="admin-primary" onClick={aoNovo}>+ Novo curso</button>
      </header>
      <div className="ec-tabela" role="table" aria-label="Lista de cursos">
        <div className="ec-linha ec-cab" role="row">
          <span role="columnheader" aria-label="Ordem" /><span role="columnheader">Curso</span><span role="columnheader" className="num">Módulos</span><span role="columnheader" className="num">Aulas</span>
          <span role="columnheader">Acesso</span><span role="columnheader">Situação</span><span role="columnheader" className="ec-acoes-cab">Ações</span>
        </div>
        {cursos.map((c, i) => {
          const ac = resumoDoAcesso(c), st = situacao(c)
          const mods = modulosDoCurso(grade, c.id).length, aulas = aulasDoCurso(grade, c.id)
          return (
            <div key={c.id} role="row" className={`ec-linha ${alvo === i ? 'alvo' : ''} ${c.publicado ? '' : 'apagado'}`}
              draggable onDragStart={(e) => { arrastando.current = i; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id) }}
              onDragEnd={() => { arrastando.current = null; setAlvo(null) }}
              onDragOver={(e) => { if (arrastando.current != null) { e.preventDefault(); setAlvo(i) } }} onDrop={(e) => { e.preventDefault(); soltar(i) }}>
              <span className="ec-ordem" role="cell">
                <span className="ec-pega" aria-hidden="true">⋮⋮</span>
                <span className="ec-setas"><button type="button" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${c.titulo}`}>↑</button><button type="button" onClick={() => mover(i, 1)} disabled={i === cursos.length - 1} aria-label={`Descer ${c.titulo}`}>↓</button></span>
              </span>
              <button type="button" role="cell" className="ec-curso" onClick={() => aoAbrir(c.id)}>
                <span className="ec-mini" style={{ ['--vc' as string]: c.cor }}><CapaDoCurso curso={c} /></span>
                <span><b>{c.titulo || 'Curso sem nome'}</b><small>{c.descricao || 'Sem descrição'}</small></span>
              </button>
              <span role="cell" className="num" data-rot="Módulos">{mods}</span>
              <span role="cell" className="num" data-rot="Aulas">{aulas}</span>
              <span role="cell"><em className={`ec-pill ${ac.tom}`}>{ac.texto}</em></span>
              <span role="cell"><em className={`ec-pill ${st.tom}`}>{st.texto}</em></span>
              <span role="cell" className="ec-acoes">
                <button type="button" onClick={() => aoAbrir(c.id, 'conteudo')} title="Módulos e aulas">Conteúdo</button>
                <button type="button" onClick={() => aoAbrir(c.id, 'info')} title="Nome, capa, descrição">Editar</button>
                <button type="button" onClick={() => mudar((g) => { const x = g.cursos!.find((k) => k.id === c.id); if (x) x.publicado = !x.publicado })}>{c.publicado ? 'Ocultar' : 'Mostrar'}</button>
                <button type="button" onClick={() => aoDuplicar(c.id)}>Duplicar</button>
                <button type="button" className="perigo" disabled={cursos.length === 1} title={cursos.length === 1 ? 'A plataforma precisa de pelo menos um curso' : undefined} onClick={() => aoRemover(c.id)}>Excluir</button>
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ====================================================== o curso aberto */

export function CabecalhoDoCurso({ grade, curso, aba, setAba, aoVoltar, alunos }: {
  grade: GradeAulas; curso: CursoGrade; aba: AbaDoCurso; setAba: (a: AbaDoCurso) => void; aoVoltar: () => void; alunos: number | null
}) {
  const mods = modulosDoCurso(grade, curso.id).length, aulas = aulasDoCurso(grade, curso.id)
  const ac = resumoDoAcesso(curso), st = situacao(curso)
  const abas: Array<[AbaDoCurso, string, string?]> = [
    ['conteudo', 'Módulos e aulas', String(aulas)], ['info', 'Informações'], ['acesso', 'Acesso e venda'],
    ['alunos', 'Alunos', curso.acesso.modo === 'todos' ? '' : alunos == null ? '' : String(alunos)],
  ]
  return (
    <header className="ec-cab" style={{ ['--vc' as string]: curso.cor, ['--cor' as string]: curso.cor }}>
      <nav className="ec-migalha" aria-label="Caminho"><button type="button" onClick={aoVoltar}>← Cursos</button><span aria-hidden="true">/</span><b>{curso.titulo || 'Curso sem nome'}</b></nav>
      <div className="ec-cab-linha">
        <span className="ec-cab-capa"><CapaDoCurso curso={curso} /></span>
        <div className="ec-cab-texto">
          <span className="rot">Curso {(grade.cursos ?? []).findIndex((c) => c.id === curso.id) + 1} de {(grade.cursos ?? []).length}</span>
          <h3>{curso.titulo || 'Curso sem nome'}</h3>
          <p>{curso.descricao || 'Escreva uma descrição curta em Informações: ela aparece no cartão do curso.'}</p>
          <div className="ec-cab-pills"><em className={`ec-pill ${ac.tom}`}>{ac.texto}</em><em className={`ec-pill ${st.tom}`}>{st.texto}</em><small>{mods} {mods === 1 ? 'módulo' : 'módulos'} · {aulas} {aulas === 1 ? 'aula' : 'aulas'}</small></div>
        </div>
      </div>
      <div className="eg-abas" role="tablist">
        {abas.map(([id, nome, selo]) => <button key={id} role="tab" type="button" aria-selected={aba === id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}>{nome}{selo ? <b>{selo}</b> : null}</button>)}
      </div>
    </header>
  )
}

/* --------------------------------------------------------- informações */

export function InfoDoCurso({ sessao, marca, curso, mudar, setErro, aoRemover }: {
  sessao: SessaoTeeds; marca: string; curso: CursoGrade; mudar: (fn: (c: CursoGrade) => void) => void; setErro: (e: string | null) => void; aoRemover: () => void
}) {
  const entrada = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const usarCapa = async (f: File) => {
    setEnviando(true); setErro(null)
    try { const { url, caminho } = await enviarCapa(sessao, `curso-${curso.id}`, f, marca); mudar((c) => { c.capa = url; c.capaArquivo = caminho }) }
    catch (e) { setErro((e as Error).message) } finally { setEnviando(false); if (entrada.current) entrada.current.value = '' }
  }
  return (
    <div className="ec-duas">
      <div className="eg-campos">
        <label className="largo"><span>Nome do curso</span><input value={curso.titulo} maxLength={80} onChange={(e) => mudar((c) => { c.titulo = e.target.value })} placeholder="Ex.: Gestão inteligente de banca" /></label>
        <label className="largo"><span>Descrição curta</span><input value={curso.descricao} maxLength={140} onChange={(e) => mudar((c) => { c.descricao = e.target.value })} placeholder="Uma linha: aparece embaixo do cartão" /><small>{curso.descricao.length} de 140 caracteres.</small></label>
        <label className="largo"><span>Sobre o curso</span><textarea rows={5} value={curso.sobre ?? ''} maxLength={1500} onChange={(e) => mudar((c) => { c.sobre = e.target.value })} placeholder="O que a pessoa aprende, para quem é, o que leva no fim. Aparece na janela de quem ainda não tem acesso." /></label>
        <label><span>Selo no cartão (opcional)</span><input value={curso.selo ?? ''} maxLength={18} onChange={(e) => mudar((c) => { c.selo = e.target.value })} placeholder="Ex.: Novo, Lançamento, Bônus" /></label>
        <div className="eg-cores">
          <span>Cor do curso</span>
          <div>
            {CORES_DA_MARCA.map((cor) => <button type="button" key={cor} className={curso.cor.toLowerCase() === cor.toLowerCase() ? 'on' : ''} style={{ background: cor }} aria-label={`Cor ${cor}`} onClick={() => mudar((c) => { c.cor = cor })} />)}
            <label className="eg-cor-livre" title="Outra cor"><input type="color" value={/^#[0-9a-f]{6}$/i.test(curso.cor) ? curso.cor : '#B78D39'} onChange={(e) => mudar((c) => { c.cor = e.target.value })} /><span>Outra</span></label>
          </div>
        </div>
        <div className="largo eg-capa">
          <span>Capa do curso</span>
          <div className="eg-capa-linha">
            <span className="ec-capa-amostra" style={{ ['--vc' as string]: curso.cor }}><CapaDoCurso curso={curso} /></span>
            <div>
              <input ref={entrada} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void usarCapa(f) }} />
              <button type="button" className="admin-primary" disabled={enviando} onClick={() => entrada.current?.click()}>{enviando ? 'Enviando…' : curso.capa ? 'Trocar a imagem' : 'Enviar uma imagem'}</button>
              {curso.capa && <button type="button" className="admin-secundario" onClick={() => mudar((c) => { c.capa = ''; c.capaArquivo = null })}>Usar a capa desenhada</button>}
              <small>Em pé, 3:4 (ex.: 900 × 1200 px), como um pôster. JPG, PNG ou WebP: a imagem é reduzida sozinha. Sem imagem, o curso usa a capa desenhada com o nome e a cor.</small>
            </div>
          </div>
        </div>
        <div className="largo ec-perigo-zona">
          <span><b>Excluir o curso</b><small>Tira o curso e todos os módulos e aulas dele do rascunho. Dá para trazer de volta pelo Histórico até publicar outra versão.</small></span>
          <button type="button" className="eg-perigo" onClick={aoRemover}>Excluir curso</button>
        </div>
      </div>
      <PreviaDoCartao curso={curso} />
    </div>
  )
}

function PreviaDoCartao({ curso }: { curso: CursoGrade }) {
  return (
    <aside className="ec-previa" aria-label="Como o cartão aparece para o aluno">
      <span className="rot">Como o aluno vê</span>
      <div className="ec-previa-par">
        <figure>
          <span className="vc-capa ec-previa-capa" style={{ ['--vc' as string]: curso.cor }}>
            <CapaDoCurso curso={curso} />
            {curso.selo && <em className="vc-selo">{curso.selo}</em>}
            <span className="vc-sombra" aria-hidden="true" />
            <span className="vc-texto"><b>{curso.titulo || 'Curso sem nome'}</b><small>Liberado</small></span>
          </span>
          <figcaption>Com acesso</figcaption>
        </figure>
        {curso.acesso.modo !== 'todos' && (
          <figure className="vc-cartao trancado">
            <span className="vc-capa ec-previa-capa" style={{ ['--vc' as string]: curso.cor }}>
              <CapaDoCurso curso={curso} />
              {curso.selo && <em className="vc-selo">{curso.selo}</em>}
              <span className="vc-tranca"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5" /><path d="M8 10.5V7.5a4 4 0 018 0v3" /></svg></span>
              <span className="vc-sombra" aria-hidden="true" />
              <span className="vc-texto"><b>{curso.titulo || 'Curso sem nome'}</b><small className="vc-motivo">{curso.acesso.modo === 'compra' ? 'Vendido à parte' : 'Outro plano'}</small></span>
            </span>
            <figcaption>{curso.acesso.modo === 'compra' && !curso.acesso.vitrine ? 'Sem acesso: não aparece' : 'Sem acesso'}</figcaption>
          </figure>
        )}
      </div>
    </aside>
  )
}

/* ------------------------------------------------------ acesso e venda */

export function AcessoDoCursoPainel({ marca, curso, publicado, planos, mudar }: {
  marca: string; curso: CursoGrade; publicado: CursoGrade | null; planos: PlanoEscolhido[]; mudar: (fn: (c: CursoGrade) => void) => void
}) {
  const a = curso.acesso
  const [novoId, setNovoId] = useState('')
  const [copiado, setCopiado] = useState(false)
  const podeVender = vendePelaCakto(marca)
  const modos: Array<{ id: ModoDoCurso; titulo: string; texto: string; desligado?: boolean }> = [
    { id: 'todos', titulo: 'Todos os alunos', texto: 'Qualquer pessoa com acesso à plataforma assiste.' },
    { id: 'planos', titulo: 'Só alguns planos', texto: 'Quem é de outro plano vê o curso trancado.' },
    { id: 'compra', titulo: 'Vendido à parte', texto: podeVender ? 'Libera sozinho quando a pessoa compra na Cakto.' : 'A venda pela Cakto existe só na GlobalFly.', desligado: !podeVender },
  ]
  const ligadoNaCakto = !!publicado && publicado.acesso.modo === 'compra' && a.modo === 'compra'
    && JSON.stringify([...publicado.acesso.cakto].sort()) === JSON.stringify([...a.cakto].sort()) && publicado.acesso.vitalicio === a.vitalicio
  const addId = () => {
    const id = novoId.trim()
    if (!id) return
    // aceita o ID puro ou um link do painel da Cakto que o contenha
    const achado = id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0] ?? id
    mudar((c) => { if (!c.acesso.cakto.includes(achado)) c.acesso.cakto.push(achado) })
    setNovoId('')
  }
  const checkoutRuim = !!a.checkout && !/^https:\/\//i.test(a.checkout)
  const planosChips = (rotulo: string, nota: string) => (
    <div className="eg-planos">
      <span>{rotulo}</span>
      <div>
        {planos.map((p) => {
          const on = a.planos.some((x) => x.id === p.id)
          return <button type="button" key={p.id} className={on ? 'on' : ''} aria-pressed={on} onClick={() => mudar((c) => { c.acesso.planos = on ? c.acesso.planos.filter((x) => x.id !== p.id) : [...c.acesso.planos, p] })}>{p.nome}</button>
        })}
        {!planos.length && <small>Nenhum plano cadastrado nesta plataforma.</small>}
      </div>
      <small>{nota}</small>
    </div>
  )
  return (
    <div className="ec-acesso">
      <fieldset className="ec-modos">
        <legend>Quem assiste este curso</legend>
        {modos.map((m) => (
          <label key={m.id} className={`ec-modo ${a.modo === m.id ? 'on' : ''} ${m.desligado ? 'desligado' : ''}`}>
            <input type="radio" name={`modo-${curso.id}`} checked={a.modo === m.id} disabled={m.desligado} onChange={() => mudar((c) => { c.acesso.modo = m.id })} />
            <span><b>{m.titulo}</b><small>{m.texto}</small></span>
          </label>
        ))}
      </fieldset>

      {a.modo === 'planos' && planosChips('Planos com acesso', a.planos.length ? 'Administradores sempre assistem. Dá também para liberar alguém à mão na aba Alunos.' : 'Escolha pelo menos um plano: sem nenhum, só os administradores assistem.')}

      {a.modo === 'compra' && (
        <div className="ec-venda">
          <div className="eg-lista">
            <span>Produtos da Cakto que liberam este curso</span>
            <small>Cole o ID do produto (Cakto › Produtos › o produto › o código no endereço da página). Pode haver mais de um: oferta à vista, parcelada, combo.</small>
            {a.cakto.map((id, i) => (
              <div key={id} className="eg-item ec-id"><i>ID</i><code>{id}</code><button type="button" onClick={() => mudar((c) => { c.acesso.cakto.splice(i, 1) })} aria-label={`Tirar o produto ${id}`}><IconeFechar /></button></div>
            ))}
            <div className="ec-add-id">
              <input value={novoId} onChange={(e) => setNovoId(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addId() } }} placeholder="Ex.: 9df6023b-2178-4439-b33b-fdcea75c7043" aria-label="ID do produto na Cakto" />
              <button type="button" className="admin-secundario" onClick={addId} disabled={!novoId.trim()}>Adicionar</button>
            </div>
          </div>
          <label className="ec-campo"><span>Link do checkout</span><input value={a.checkout} onChange={(e) => mudar((c) => { c.acesso.checkout = e.target.value.trim() })} placeholder="https://pay.cakto.com.br/…" aria-invalid={checkoutRuim} /><small>{checkoutRuim ? 'O link precisa começar com https://.' : 'É o botão "Liberar meu acesso" para quem ainda não comprou.'}</small></label>
          <div className="ec-validade" role="radiogroup" aria-label="Validade do acesso">
            <span>Validade do acesso comprado</span>
            <div>
              <button type="button" role="radio" aria-checked={a.vitalicio} className={a.vitalicio ? 'on' : ''} onClick={() => mudar((c) => { c.acesso.vitalicio = true })}>Vitalício</button>
              <button type="button" role="radio" aria-checked={!a.vitalicio} className={!a.vitalicio ? 'on' : ''} onClick={() => mudar((c) => { c.acesso.vitalicio = false })}>1 ano (renovação soma mais 1)</button>
            </div>
          </div>
          <label className="eg-chave"><input type="checkbox" checked={a.vitrine} onChange={(e) => mudar((c) => { c.acesso.vitrine = e.target.checked })} /><span><b>Mostrar na vitrine para quem não comprou</b><small>Ligado: o curso aparece com cadeado e o botão de compra. Desligado: só quem comprou vê o curso.</small></span></label>
          {planosChips('Também liberado, sem comprar, para os planos', 'Opcional. Ex.: o Prestige já recebe este curso.')}

          <section className={`ec-gancho ${ligadoNaCakto ? 'ligado' : ''}`} aria-label="Liberação automática">
            <header><i aria-hidden="true" /><b>{ligadoNaCakto ? 'Liberação automática ligada' : a.cakto.length ? 'Publique para ligar a liberação automática' : 'Falta o produto da Cakto'}</b></header>
            <ol>
              <li>Na Cakto, crie (ou abra) o produto do curso e cole o ID dele acima.</li>
              <li>Em <b>Integrações › Webhooks</b>, edite o webhook da GlobalFly e marque também este produto. O endereço é sempre o mesmo:
                <span className="ec-url"><code>{WEBHOOK_DA_CAKTO}</code><button type="button" onClick={() => { void navigator.clipboard?.writeText(WEBHOOK_DA_CAKTO).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1400) }) }}>{copiado ? 'Copiado' : 'Copiar'}</button></span>
              </li>
              <li>Publique a grade. A partir daí, pagamento aprovado libera o curso na hora; estorno e chargeback tiram o acesso.</li>
            </ol>
            <small>Quem paga antes de ter cadastro na {MARCA.prosa} é liberado sozinho no momento em que se cadastra com o mesmo e-mail.</small>
          </section>
        </div>
      )}

      <div className="ec-agenda">
        <label className="eg-chave"><input type="checkbox" checked={curso.publicado} onChange={(e) => mudar((c) => { c.publicado = e.target.checked })} /><span><b>Curso visível</b><small>Desligado, o curso some da sala de todo mundo, mas continua aqui.</small></span></label>
        <label className="ec-campo"><span>Abrir a partir de</span><input type="datetime-local" value={paraCampo(curso.liberarEm)} onChange={(e) => mudar((c) => { c.liberarEm = doCampo(e.target.value) })} /><small>Vazio = abre assim que publicar. Antes disso, aparece com "Disponível em dd/mm".</small></label>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- alunos */

export function AlunosDoCurso({ sessao, marca, curso, publicado, aoContar }: { sessao: SessaoTeeds; marca: string; curso: CursoGrade; publicado: boolean; aoContar: (n: number) => void }) {
  const [lista, setLista] = useState<AlunoDoCurso[] | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [dias, setDias] = useState<string>('vitalicio')
  const [indo, setIndo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const carregar = () => alunosDoCurso(sessao, curso.id, marca).then((l) => { setLista(l); aoContar(l.filter((x) => x.ativo).length) }).catch((e) => setFalha((e as Error).message))
  useEffect(() => { setLista(null); void carregar() }, [curso.id, marca]) // eslint-disable-line react-hooks/exhaustive-deps
  if (curso.acesso.modo === 'todos') return <p className="adm-vazio ec-vazio">Este curso é para todos os alunos: não há lista própria. Para vender à parte ou restringir a planos, mude em <b>Acesso e venda</b>.</p>
  const liberar = async (alvo: string, sim: boolean) => {
    setIndo(true); setFalha(null); setAviso(null)
    try {
      const nome = await liberarCurso(sessao, curso, alvo, sim, sim ? (dias === 'vitalicio' ? null : Number(dias)) : null, marca)
      setAviso(sim ? `${nome} já pode assistir ${curso.titulo}.` : `Acesso de ${nome} retirado.`)
      if (sim) setEmail('')
      await carregar()
    } catch (e) { setFalha((e as Error).message) } finally { setIndo(false) }
  }
  const termo = busca.trim().toLowerCase()
  const vistos = (lista ?? []).filter((x) => !termo || `${x.nome} ${x.email}`.toLowerCase().includes(termo))
  const ativos = (lista ?? []).filter((x) => x.ativo).length
  return (
    <div className="ec-alunos">
      <form className="ec-liberar" onSubmit={(e) => { e.preventDefault(); if (/\S+@\S+\.\S+/.test(email)) void liberar(email, true) }}>
        <label><span>Liberar à mão</span><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail da conta do aluno" required /></label>
        <label><span>Por quanto tempo</span><select value={dias} onChange={(e) => setDias(e.target.value)}><option value="vitalicio">Para sempre</option><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">1 ano</option></select></label>
        <button type="submit" className="admin-primary" disabled={indo || !/\S+@\S+\.\S+/.test(email)}>{indo ? 'Liberando…' : 'Liberar acesso'}</button>
      </form>
      {!publicado && <p className="eg-aviso-suave"><b>O curso ainda não foi publicado</b><small>A liberação já fica gravada, mas o aluno só vê o curso depois que você publicar a grade.</small></p>}
      {aviso && <p className="admin-sucesso ec-ok"><span>{aviso}</span></p>}
      {falha && <p className="eg-alerta">{falha}</p>}
      <div className="ec-alunos-topo"><b>{ativos} {ativos === 1 ? 'aluno com acesso' : 'alunos com acesso'}</b>{(lista?.length ?? 0) > 6 && <input className="eg-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar por nome ou e-mail" aria-label="Procurar aluno" />}</div>
      {lista === null && !falha && <p className="adm-vazio">Lendo os alunos…</p>}
      {lista && !lista.length && <p className="adm-vazio">Ninguém tem este curso ainda. As compras aprovadas na Cakto e as liberações à mão aparecem aqui.</p>}
      {vistos.length > 0 && (
        <div className="adm-tabela-aulas"><table>
          <thead><tr><th>Aluno</th><th>Como entrou</th><th>Desde</th><th>Até</th><th>Situação</th><th /></tr></thead>
          <tbody>{vistos.map((x) => (
            <tr key={x.userId}>
              <td><b>{x.nome || 'Sem nome'}</b><small>{x.email}</small></td>
              <td>{x.origem === 'cakto' ? 'Compra na Cakto' : x.origem === 'manual' ? 'Liberado à mão' : x.origem}</td>
              <td className="num">{hora(x.concedidoEm)}</td>
              <td className="num">{x.expiraEm ? dia(x.expiraEm) : 'Para sempre'}</td>
              <td>{x.ativo ? <em className="adm-status ativo">Com acesso</em> : <em className="adm-status suspenso">Sem acesso</em>}</td>
              <td>{x.ativo
                ? <button type="button" className="eg-perigo" disabled={indo} onClick={() => { if (window.confirm(`Tirar o acesso de ${x.nome || x.email} a ${curso.titulo}?`)) void liberar(x.email, false) }}>Tirar acesso</button>
                : <button type="button" className="admin-secundario" disabled={indo} onClick={() => void liberar(x.email, true)}>Liberar de novo</button>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  )
}

export function Vazio({ children }: { children: ReactNode }) { return <p className="adm-vazio">{children}</p> }
