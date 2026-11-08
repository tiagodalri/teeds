import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { playerDoVideo, type Material } from '../../core/teeds/aulas'
import {
  controleDasAulas, duracaoDoArquivo, duracaoLegivel, ehArquivoNosso, enviarArquivoDaAula, enviarMaterial, fracaoAssistida,
  LIMITE_MATERIAL_MB, listarVideosDasAulas, tamanhoLegivel, type AssistiuAula,
} from '../../core/teeds/aulasVideos'
import {
  contarAulas, CORES_DA_MARCA, enviarCapa, esquecerGradeEmCache, gradeDoCatalogo, lerGradeDoAdmin, NIVEIS, novoId, publicarGrade,
  quadroDoVideo, salvarRascunho, segundosDoTempo, todosOsIds, versoesDaGrade, acessoPadrao, modulosDoCurso, aulasDoCurso,
  type AssuntoGrade, type AulaGrade, type CursoGrade, type GradeAulas, type ModuloGrade, type PlanoEscolhido, type VersaoDaGrade,
} from '../../core/teeds/gradeAulas'
import { AcessoDoCursoPainel, AlunosDoCurso, CabecalhoDoCurso, InfoDoCurso, ListaDeCursos, type AbaDoCurso } from './EditorDoCurso'
import { listarPlanos } from '../../core/teeds/clientes'
import { MARCA } from '../../marca'
import { DEMONSTRACAO_EM_AULA_SEM_VIDEO } from '../../core/teeds/modulosAulas'
import { IconeFechar } from '../IconeFechar'
import { CapaDaAula } from './CapaDaAula'
import './editor-grade.css'

/**
 * Administração › Aulas (04/11/2026): o editor da grade inteira.
 *
 * Tiago: "conseguir criar módulos, assuntos, tópicos, aulas específicas,
 * descrições, subir o vídeo, visualizar um preview de como vai ficar antes de
 * salvar... rica em detalhes... tudo personalizável, configurável".
 *
 * À esquerda, a árvore (módulos > assuntos > aulas), com arrastar e soltar;
 * à direita, o que estiver selecionado. Toda mudança vai para o RASCUNHO
 * sozinha (o aluno não vê); a Prévia mostra a sala de verdade, no computador
 * ou no celular, com o rascunho; Publicar leva para os alunos e guarda a
 * versão no Histórico.
 */

type Sel = { tipo: 'modulo' | 'assunto' | 'aula'; id: string } | null
type AbaDaAula = 'conteudo' | 'video' | 'topicos' | 'materiais' | 'acesso' | 'alunos'
type Situacao = 'carregando' | 'salvo' | 'pendente' | 'salvando' | 'erro'

const LIMITE_VIDEO_MB = 1024
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '')
const origemDoVideo = (v: string) => {
  const p = playerDoVideo(v)
  if (!p) return 'Sem vídeo'
  if (ehArquivoNosso(v)) return 'Arquivo enviado'
  return p.tipo === 'vimeo' ? 'Vimeo' : p.tipo === 'mp4' ? 'MP4 externo' : /youtu/.test(v) ? 'YouTube' : 'Link'
}
/** datetime-local ⇄ ISO, no fuso de quem edita. */
const paraCampo = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
const doCampo = (v: string) => (v ? new Date(v).toISOString() : null)

function localizar(g: GradeAulas, id: string) {
  for (const [mi, m] of g.modulos.entries()) {
    if (m.id === id) return { m, mi }
    for (const [si, s] of m.assuntos.entries()) {
      if (s.id === id) return { m, mi, s, si }
      for (const [ai, a] of s.aulas.entries()) if (a.id === id) return { m, mi, s, si, a, ai }
    }
  }
  return null
}

/** A numeração contínua das aulas ("Aula 7"), como na sala. */
function numeracao(g: GradeAulas) {
  // cada curso conta as aulas dele, como na sala
  const n = new Map<string, number>(); const k = new Map<string, number>()
  for (const m of g.modulos) for (const s of m.assuntos) for (const a of s.aulas) { const c = m.curso ?? ''; const v = (k.get(c) ?? 0) + 1; k.set(c, v); n.set(a.id, v) }
  return n
}

export function EditorDaGrade({ sessao, marca = MARCA.id }: { sessao: SessaoTeeds; marca?: string }) {
  const [grade, setGrade] = useState<GradeAulas | null>(null)
  const [publicada, setPublicada] = useState<GradeAulas | null>(null)
  const [publicadaEm, setPublicadaEm] = useState<string | null>(null)
  const [rascunhoEm, setRascunhoEm] = useState<string | null>(null)
  const [situacao, setSituacao] = useState<Situacao>('carregando')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [sel, setSel] = useState<Sel>(null)
  const [aba, setAba] = useState<AbaDaAula>('conteudo')
  const [busca, setBusca] = useState('')
  const [fechados, setFechados] = useState<Set<string>>(new Set())
  const [controle, setControle] = useState<AssistiuAula[]>([])
  const [planos, setPlanos] = useState<PlanoEscolhido[]>([])
  const [modal, setModal] = useState<'previa' | 'publicar' | 'historico' | null>(null)
  // 06/11/2026: a porta é a lista de cursos; cada curso abre com as abas dele
  const [cursoAberto, setCursoAberto] = useState<string | null>(null)
  const [abaCurso, setAbaCurso] = useState<AbaDoCurso>('conteudo')
  const [alunosNoCurso, setAlunosNoCurso] = useState<Record<string, number>>({})
  const arrastando = useRef<string | null>(null)
  const [alvo, setAlvo] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultima = useRef<GradeAulas | null>(null)
  const gradeAtual = useRef<GradeAulas | null>(null)
  useEffect(() => { gradeAtual.current = grade }, [grade])

  /* ------------------------------------------------------------ carregar */
  useEffect(() => {
    let vivo = true
    void (async () => {
      try {
        const [doBanco, videos] = await Promise.all([lerGradeDoAdmin(sessao, marca), listarVideosDasAulas(sessao, marca)])
        if (!vivo) return
        const base = doBanco.rascunho ?? doBanco.publicada ?? gradeDoCatalogo(videos)
        setGrade(base); setPublicada(doBanco.publicada); setPublicadaEm(doBanco.publicadaEm); setRascunhoEm(doBanco.rascunhoEm)
        setSituacao('salvo')
      } catch (e) { if (vivo) { setErro((e as Error).message); setSituacao('erro') } }
    })()
    controleDasAulas(sessao, marca).then((c) => { if (vivo) setControle(c) }).catch(() => undefined)
    listarPlanos(sessao).then((l) => { if (vivo) setPlanos(l.filter((p) => p.marca === marca).map((p) => ({ id: p.id, nome: p.nome }))) }).catch(() => undefined)
    return () => { vivo = false }
  }, [sessao.usuario.id, marca]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------- rascunho salvo sozinho */
  const gravar = useCallback(async (g: GradeAulas) => {
    setSituacao('salvando')
    try { setRascunhoEm(await salvarRascunho(sessao, g, marca)); setSituacao(ultima.current === g ? 'salvo' : 'pendente') }
    catch (e) { setSituacao('erro'); setErro(`O rascunho não foi salvo: ${(e as Error).message}`) }
  }, [sessao, marca])
  const mudar = useCallback((fn: (g: GradeAulas) => void) => {
    const atual = gradeAtual.current
    if (!atual) return
    const nova = clone(atual); fn(nova)
    gradeAtual.current = nova; ultima.current = nova
    setGrade(nova); setSituacao('pendente')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (ultima.current) void gravar(ultima.current) }, 1200)
  }, [gravar])
  useEffect(() => {
    const sair = (e: BeforeUnloadEvent) => { if (situacao === 'pendente' || situacao === 'salvando') { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', sair)
    return () => window.removeEventListener('beforeunload', sair)
  }, [situacao])

  // no celular e no tablet o editor fica embaixo da lista: escolher um item leva até ele
  const painel = useRef<HTMLElement>(null)
  const escolher = (x: Sel) => {
    setSel(x)
    if (matchMedia('(max-width: 1100px)').matches) requestAnimationFrame(() => painel.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }))
  }
  const naoPublicado = useMemo(() => !!grade && JSON.stringify(grade) !== JSON.stringify(publicada), [grade, publicada])
  const numero = useMemo(() => (grade ? numeracao(grade) : new Map<string, number>()), [grade])
  const achadoBruto = grade && sel ? localizar(grade, sel.id) : null
  const achado = achadoBruto && (!cursoAberto || achadoBruto.m.curso === cursoAberto) ? achadoBruto : null

  /* ----------------------------------------------------------- ações */
  const ids = () => (grade ? todosOsIds(grade) : new Set<string>())
  const novaAula = (titulo = 'Nova aula'): AulaGrade => ({ id: novoId(titulo, ids()), titulo, descricao: '', video: '', duracao: '', topicos: [], materiais: [], links: [], publicado: true, nivel: 'Iniciante' })
  const addModulo = () => {
    const usados = ids(); const id = novoId('modulo', usados); const sid = novoId(`${id}-geral`, usados)
    const curso = cursoAberto ?? grade?.cursos?.[0]?.id
    mudar((g) => g.modulos.push({ id, curso, titulo: 'Novo módulo', chamada: '', cor: g.cursos?.find((c) => c.id === curso)?.cor ?? CORES_DA_MARCA[g.modulos.length % CORES_DA_MARCA.length], publicado: true, assuntos: [{ id: sid, titulo: '', aulas: [] }] }))
    setSel({ tipo: 'modulo', id })
  }
  const addAssunto = (mId: string) => {
    const id = novoId('assunto', ids())
    mudar((g) => { localizar(g, mId)?.m.assuntos.push({ id, titulo: 'Novo assunto', aulas: [] }) })
    setSel({ tipo: 'assunto', id }); setFechados((f) => { const n = new Set(f); n.delete(mId); return n })
  }
  const addAula = (sId: string) => {
    const a = novaAula()
    mudar((g) => { localizar(g, sId)?.s?.aulas.push(a) })
    setSel({ tipo: 'aula', id: a.id }); setAba('conteudo')
  }
  const mover = (id: string, d: -1 | 1) => mudar((g) => {
    const l = localizar(g, id); if (!l) return
    if (!l.s) {
      // módulo: troca com o vizinho do mesmo curso (a lista de módulos é uma só para todos os cursos)
      const irmaos = g.modulos.map((m, i) => ({ m, i })).filter((x) => x.m.curso === l.m.curso)
      const k = irmaos.findIndex((x) => x.m.id === id), viz = irmaos[k + d]
      if (!viz) return
      ;[g.modulos[l.mi], g.modulos[viz.i]] = [g.modulos[viz.i], g.modulos[l.mi]]
      return
    }
    const lista: unknown[] = l.a ? l.s!.aulas : l.m.assuntos
    const i = l.a ? l.ai! : l.si!
    const j = i + d; if (j < 0 || j >= lista.length) return
    ;[lista[i], lista[j]] = [lista[j], lista[i]]
  })
  const remover = (id: string) => {
    if (!grade) return
    const l = localizar(grade, id); if (!l) return
    const nome = l.a ? `a aula "${l.a.titulo}"` : l.s ? `o assunto "${l.s.titulo || 'sem nome'}" e as ${l.s.aulas.length} aulas dele` : `o módulo "${l.m.titulo}" e todas as ${l.m.assuntos.reduce((n, s) => n + s.aulas.length, 0)} aulas dele`
    if (!window.confirm(`Tirar ${nome} da grade? Fica só no rascunho até você publicar, e dá para trazer de volta pelo Histórico.`)) return
    mudar((g) => {
      const x = localizar(g, id); if (!x) return
      if (x.a) x.s!.aulas.splice(x.ai!, 1)
      else if (x.s) { x.m.assuntos.splice(x.si!, 1); if (!x.m.assuntos.length) x.m.assuntos.push({ id: novoId(`${x.m.id}-geral`, todosOsIds(g)), titulo: '', aulas: [] }) }
      else g.modulos.splice(x.mi, 1)
    })
    setSel(null)
  }
  const duplicar = (id: string) => {
    if (!grade) return
    const usados = ids()
    const novoDe = (a: AulaGrade): AulaGrade => { const c = clone(a); c.id = novoId(a.titulo, usados); usados.add(c.id); c.titulo = `${a.titulo} (cópia)`; return c }
    const l = localizar(grade, id); if (!l) return
    let foco = ''
    mudar((g) => {
      const x = localizar(g, id); if (!x) return
      if (x.a) { const c = novoDe(x.a); foco = c.id; x.s!.aulas.splice(x.ai! + 1, 0, c) }
      else if (!x.s) {
        const c = clone(x.m); c.id = novoId(x.m.titulo, usados); usados.add(c.id); c.titulo = `${x.m.titulo} (cópia)`
        c.assuntos = c.assuntos.map((s) => { const n = novoId(s.titulo || 'assunto', usados); usados.add(n); return { ...s, id: n, aulas: s.aulas.map(novoDe).map((a) => ({ ...a, titulo: a.titulo.replace(/ \(cópia\)$/, '') })) } })
        foco = c.id; g.modulos.splice(x.mi + 1, 0, c)
      }
    })
    if (foco) setSel({ tipo: l.a ? 'aula' : 'modulo', id: foco })
  }
  /** Arrastar e soltar: a aula vai para antes de outra aula, ou para o fim de um assunto. */
  const soltar = (destino: string) => {
    const origem = arrastando.current; arrastando.current = null; setAlvo(null)
    if (!origem || origem === destino) return
    mudar((g) => {
      const de = localizar(g, origem); if (!de?.a) return
      const [aula] = de.s!.aulas.splice(de.ai!, 1)
      const para = localizar(g, destino)
      if (para?.a) para.s!.aulas.splice(para.ai!, 0, aula)
      else if (para?.s) para.s.aulas.push(aula)
      else if (para) para.m.assuntos[para.m.assuntos.length - 1].aulas.push(aula)
      else de.s!.aulas.splice(de.ai!, 0, aula)
    })
  }
  const dnd = (id: string, arrastavel: boolean) => ({
    ...(arrastavel ? { draggable: true, onDragStart: (e: DragEvent) => { arrastando.current = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) }, onDragEnd: () => { arrastando.current = null; setAlvo(null) } } : {}),
    onDragOver: (e: DragEvent) => { if (arrastando.current) { e.preventDefault(); setAlvo(id) } },
    onDragLeave: () => setAlvo((a) => (a === id ? null : a)),
    onDrop: (e: DragEvent) => { e.preventDefault(); soltar(id) },
  })

  /* -------------------------------------------------------- cursos */
  const abrirCurso = (id: string | null, a: AbaDoCurso = 'conteudo') => {
    setCursoAberto(id); setAbaCurso(a); setBusca('')
    const primeira = id && grade ? modulosDoCurso(grade, id)[0]?.assuntos[0]?.aulas[0] : null
    setSel(primeira ? { tipo: 'aula', id: primeira.id } : id && grade ? (modulosDoCurso(grade, id)[0] ? { tipo: 'modulo', id: modulosDoCurso(grade, id)[0].id } : null) : null)
    window.scrollTo({ top: 0 })
  }
  const novoCurso = () => {
    const usados = ids(); const id = novoId('curso', usados); usados.add(id); const mid = novoId('modulo-1', usados); usados.add(mid); const sid = novoId(`${mid}-geral`, usados)
    const cor = CORES_DA_MARCA[(grade?.cursos?.length ?? 0) % CORES_DA_MARCA.length]
    mudar((g) => {
      g.cursos = g.cursos ?? []
      g.cursos.push({ id, titulo: 'Novo curso', descricao: '', sobre: '', cor, publicado: false, acesso: acessoPadrao() })
      g.modulos.push({ id: mid, curso: id, titulo: 'Módulo 1', chamada: '', cor, publicado: true, assuntos: [{ id: sid, titulo: '', aulas: [] }] })
    })
    setCursoAberto(id); setAbaCurso('info'); setSel({ tipo: 'modulo', id: mid })
    setAviso('Curso criado oculto: dê nome, capa e acesso, monte os módulos e mostre quando estiver pronto.')
  }
  const duplicarCurso = (cid: string) => {
    if (!grade) return
    const usados = ids(); const nid = novoId(`${cid}-copia`, usados); usados.add(nid)
    const novo = (base: string) => { const n = novoId(base, usados); usados.add(n); return n }
    mudar((g) => {
      const c = g.cursos?.find((x) => x.id === cid); if (!c) return
      const copia: CursoGrade = { ...clone(c), id: nid, titulo: `${c.titulo} (cópia)`, publicado: false, capaArquivo: null, acesso: { ...clone(c.acesso), cakto: [] } }
      g.cursos!.splice(g.cursos!.indexOf(c) + 1, 0, copia)
      for (const m of g.modulos.filter((x) => x.curso === cid)) {
        const cm = clone(m); cm.id = novo(m.titulo || 'modulo'); cm.curso = nid
        cm.assuntos = cm.assuntos.map((s) => ({ ...s, id: novo(s.titulo || 'assunto'), aulas: s.aulas.map((a) => ({ ...a, id: novo(a.titulo || 'aula') })) }))
        g.modulos.push(cm)
      }
    })
    setAviso('Cópia criada, oculta e sem produto da Cakto (um produto libera um curso só).')
  }
  const removerCurso = (cid: string) => {
    if (!grade || (grade.cursos?.length ?? 0) < 2) return
    const c = grade.cursos?.find((x) => x.id === cid); if (!c) return
    if (!window.confirm(`Excluir o curso "${c.titulo}" com ${modulosDoCurso(grade, cid).length} módulos e ${aulasDoCurso(grade, cid)} aulas? Fica só no rascunho até você publicar, e dá para trazer de volta pelo Histórico. Quem já comprou continua com a liberação guardada.`)) return
    mudar((g) => { g.cursos = g.cursos!.filter((x) => x.id !== cid); g.modulos = g.modulos.filter((m) => m.curso !== cid) })
    if (cursoAberto === cid) abrirCurso(null)
  }

  if (situacao === 'carregando' || !grade) {
    return <div className="eg"><div className="adm-vazio">{erro ?? 'Abrindo a grade das aulas…'}</div></div>
  }

  const curso = cursoAberto ? grade.cursos?.find((c) => c.id === cursoAberto) ?? null : null
  const doEscopo = curso ? modulosDoCurso(grade, curso.id) : grade.modulos
  const total = curso ? aulasDoCurso(grade, curso.id) : contarAulas(grade)
  const comVideo = doEscopo.reduce((n, m) => n + m.assuntos.reduce((k, s) => k + s.aulas.filter((a) => a.video).length, 0), 0)
  const idsDoEscopo = new Set(doEscopo.flatMap((m) => m.assuntos.flatMap((s) => s.aulas.map((a) => a.id))))
  const mudarCurso = (fn: (c: CursoGrade) => void) => mudar((g) => { const c = g.cursos?.find((x) => x.id === cursoAberto); if (c) fn(c) })
  const termo = busca.trim().toLowerCase()
  const bate = (a: AulaGrade) => !termo || `${a.titulo} ${a.descricao}`.toLowerCase().includes(termo)

  return (
    <div className="eg">
      {/* ---------------------------------------------------- barra do topo */}
      <header className="eg-topo">
        <div className="eg-topo-texto">
          <span className="rot">Área de membros</span>
          <h2>Cursos, módulos e aulas</h2>
          <p className={`eg-situacao ${situacao}`}>
            <i aria-hidden="true" />
            {situacao === 'salvando' ? 'Salvando o rascunho…' : situacao === 'pendente' ? 'Alterações ainda não salvas' : situacao === 'erro' ? 'O rascunho não foi salvo' : rascunhoEm ? `Rascunho salvo ${hora(rascunhoEm)}` : 'Nada alterado ainda'}
            <span>·</span>
            {naoPublicado
              ? <b>{publicada ? 'Há alterações que os alunos ainda não veem' : 'A sala ainda usa a grade antiga: publique para valer esta'}</b>
              : <b className="ok">Publicado {hora(publicadaEm)}: os alunos veem esta versão</b>}
          </p>
        </div>
        <div className="eg-topo-acoes">
          <button type="button" className="admin-secundario" onClick={() => setModal('historico')}>Histórico</button>
          {naoPublicado && publicada && <button type="button" className="admin-secundario" onClick={() => { if (window.confirm('Descartar o rascunho e voltar para o que está publicado?')) mudar((g) => { g.modulos = clone(publicada.modulos); g.cursos = clone(publicada.cursos ?? []); if (publicada.boasVindas) g.boasVindas = clone(publicada.boasVindas); else delete g.boasVindas }) }}>Descartar alterações</button>}
          <button type="button" className="admin-secundario eg-previa-btn" onClick={() => setModal('previa')}>Ver prévia</button>
          <button type="button" className="admin-primary" disabled={!naoPublicado || situacao === 'salvando'} onClick={() => setModal('publicar')}>Publicar para os alunos</button>
        </div>
      </header>
      {erro && <div className="ger-erro">{erro}<button onClick={() => setErro(null)}><IconeFechar /></button></div>}
      {aviso && <div className="admin-sucesso"><span>{aviso}</span><button onClick={() => setAviso(null)}><IconeFechar /></button></div>}

      {!curso && (
        <div className="eg-kpis">
          <article><span>Cursos</span><strong>{grade.cursos?.length ?? 1}</strong><small>{(grade.cursos ?? []).filter((c) => c.publicado).length} visíveis</small></article>
          <article><span>Módulos e aulas</span><strong>{grade.modulos.length} · {total}</strong></article>
          <article className={comVideo < total ? 'falta' : 'ok'}><span>Com vídeo</span><strong>{comVideo}</strong><small>{total - comVideo ? `${total - comVideo} sem vídeo` : 'todas com vídeo'}</small></article>
          <article><span>Alunos que assistiram</span><strong>{new Set(controle.map((c) => c.userId)).size}</strong></article>
        </div>
      )}

      {!curso && marca === 'globalfly' && (() => {
        const v = grade.boasVindas?.video ?? ''
        const p = playerDoVideo(v)
        const ok = !v || p?.tipo === 'mp4' || (p?.tipo === 'youtube' && !!p.id)
        return (
          <section className="eg-boas-vindas">
            <label>
              <span>Vídeo de boas-vindas <small>abre sozinho no primeiro acesso, antes do tour</small></span>
              <input value={v} placeholder="https://youtu.be/…  (vazio = a primeira aula do curso)"
                onChange={(e) => mudar((g) => { const x = e.target.value; if (x.trim()) g.boasVindas = { video: x }; else delete g.boasVindas })} />
              <small className={ok ? '' : 'falta'}>{!v ? 'Sem link próprio: o pop-up mostra a primeira aula com vídeo.' : ok ? `${origemDoVideo(v)}. Vale para os alunos depois de publicar.` : 'Esse link não é um vídeo do YouTube nem um MP4.'}</small>
            </label>
          </section>
        )
      })()}

      {!curso && <ListaDeCursos grade={grade} mudar={mudar} aoAbrir={(id, a) => abrirCurso(id, a)} aoNovo={novoCurso} aoDuplicar={duplicarCurso} aoRemover={removerCurso} />}

      {curso && (
        <CabecalhoDoCurso grade={grade} curso={curso} aba={abaCurso} setAba={setAbaCurso} aoVoltar={() => abrirCurso(null)} alunos={alunosNoCurso[curso.id] ?? null} />
      )}
      {curso && abaCurso === 'info' && <section className="ec-painel"><InfoDoCurso sessao={sessao} marca={marca} curso={curso} mudar={mudarCurso} setErro={setErro} aoRemover={() => removerCurso(curso.id)} /></section>}
      {curso && abaCurso === 'acesso' && <section className="ec-painel"><AcessoDoCursoPainel marca={marca} curso={curso} publicado={publicada?.cursos?.find((c) => c.id === curso.id) ?? null} planos={planos} mudar={mudarCurso} /></section>}
      {curso && abaCurso === 'alunos' && <section className="ec-painel"><AlunosDoCurso sessao={sessao} marca={marca} curso={curso} publicado={!!publicada?.cursos?.some((c) => c.id === curso.id)} aoContar={(n) => setAlunosNoCurso((x) => ({ ...x, [curso.id]: n }))} /></section>}

      {curso && abaCurso === 'conteudo' && <div className="eg-corpo">
        {/* ------------------------------------------------------ a árvore */}
        <nav className="eg-arvore" aria-label="Grade das aulas">
          <input className="eg-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar aula" aria-label="Procurar aula" />
          {doEscopo.map((m, mi) => {
            const fechado = fechados.has(m.id) && !termo
            return (
              <section key={m.id} className={`eg-mod ${sel?.id === m.id ? 'sel' : ''} ${alvo === m.id ? 'alvo' : ''}`} style={{ ['--cor' as string]: m.cor }}>
                <div className="eg-mod-cab" {...dnd(m.id, false)}>
                  <button type="button" className="eg-abre" aria-label={fechado ? 'Abrir módulo' : 'Fechar módulo'} onClick={() => setFechados((f) => { const n = new Set(f); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })}>{fechado ? '▸' : '▾'}</button>
                  <button type="button" className="eg-mod-nome" onClick={() => escolher({ tipo: 'modulo', id: m.id })}>
                    <small>Módulo {String(mi + 1).padStart(2, '0')}</small>
                    <b>{m.titulo || 'Módulo sem nome'}</b>
                  </button>
                  {!m.publicado && <em className="eg-chip oculto">Oculto</em>}
                  {m.liberarEm && <em className="eg-chip agenda" title={`Libera ${hora(m.liberarEm)}`}>Agendado</em>}
                  <span className="eg-ordem"><button type="button" onClick={() => mover(m.id, -1)} disabled={mi === 0} aria-label="Subir módulo">↑</button><button type="button" onClick={() => mover(m.id, 1)} disabled={mi === doEscopo.length - 1} aria-label="Descer módulo">↓</button></span>
                </div>
                {!fechado && (
                  <div className="eg-mod-corpo">
                    {m.assuntos.map((s, si) => (
                      <div key={s.id} className={`eg-ass ${s.titulo ? 'com-nome' : ''} ${alvo === s.id ? 'alvo' : ''}`}>
                        {(s.titulo || m.assuntos.length > 1) && (
                          <div className={`eg-ass-cab ${sel?.id === s.id ? 'sel' : ''}`} {...dnd(s.id, false)}>
                            <button type="button" onClick={() => escolher({ tipo: 'assunto', id: s.id })}><small>Assunto</small>{s.titulo || 'Sem nome (aulas direto no módulo)'}</button>
                            <span className="eg-ordem"><button type="button" onClick={() => mover(s.id, -1)} disabled={si === 0} aria-label="Subir assunto">↑</button><button type="button" onClick={() => mover(s.id, 1)} disabled={si === m.assuntos.length - 1} aria-label="Descer assunto">↓</button></span>
                          </div>
                        )}
                        <ol>
                          {s.aulas.filter(bate).map((a) => (
                            <li key={a.id} className={`eg-aula ${sel?.id === a.id ? 'sel' : ''} ${alvo === a.id ? 'alvo' : ''} ${a.publicado ? '' : 'oculta'}`} {...dnd(a.id, true)}>
                              <span className="eg-pega" aria-hidden="true">⋮⋮</span>
                              <button type="button" className="eg-aula-nome" onClick={() => escolher({ tipo: 'aula', id: a.id })}>
                                <i>{String(numero.get(a.id) ?? 0).padStart(2, '0')}</i>
                                <span><b>{a.titulo || 'Aula sem título'}</b><small>{a.video ? `${origemDoVideo(a.video)}${a.duracao ? ` · ${a.duracao}` : ''}` : 'Sem vídeo'}{a.topicos.length ? ` · ${a.topicos.length} tópicos` : ''}</small></span>
                              </button>
                              <span className="eg-sinais">
                                {!a.video && <em className="eg-chip falta" title="Sem vídeo">!</em>}
                                {!a.publicado && <em className="eg-chip oculto">Oculta</em>}
                                {(a.liberarEm || a.planos?.length) ? <em className="eg-chip agenda" title="Acesso com regra">🔒</em> : null}
                              </span>
                            </li>
                          ))}
                        </ol>
                        <button type="button" className="eg-mais" onClick={() => addAula(s.id)}>+ Aula{s.titulo ? ` em ${s.titulo}` : ''}</button>
                      </div>
                    ))}
                    <button type="button" className="eg-mais fraco" onClick={() => addAssunto(m.id)}>+ Assunto neste módulo</button>
                  </div>
                )}
              </section>
            )
          })}
          {!doEscopo.length && <p className="eg-dica">Este curso ainda não tem módulos.</p>}
          <button type="button" className="eg-novo-modulo" onClick={addModulo}>+ Novo módulo</button>
          <p className="eg-dica">Arraste as aulas pela alça ⋮⋮ para mudar a ordem ou levar para outro assunto ou módulo.</p>
        </nav>

        {/* ----------------------------------------------------- o editor */}
        <section className="eg-painel" ref={painel}>
          {!achado && <div className="eg-vazio"><b>Escolha um módulo, assunto ou aula na lista</b><p>Ou crie um módulo novo. Tudo fica no rascunho até você publicar.</p></div>}
          {achado && !achado.s && (
            <EditorDoModulo m={achado.m} numero={doEscopo.findIndex((x) => x.id === achado.m.id) + 1} planos={planos} mudar={(fn) => mudar((g) => { const x = localizar(g, achado.m.id); if (x) fn(x.m) })}
              aoAddAssunto={() => addAssunto(achado.m.id)} aoAddAula={() => addAula(achado.m.assuntos[achado.m.assuntos.length - 1].id)}
              aoDuplicar={() => duplicar(achado.m.id)} aoRemover={() => remover(achado.m.id)} />
          )}
          {achado?.s && !achado.a && (
            <EditorDoAssunto s={achado.s} m={achado.m} mudar={(fn) => mudar((g) => { const x = localizar(g, achado.s!.id); if (x?.s) fn(x.s) })}
              aoAddAula={() => addAula(achado.s!.id)} aoRemover={() => remover(achado.s!.id)} />
          )}
          {achado?.a && (
            <EditorDaAula key={achado.a.id} sessao={sessao} marca={marca} a={achado.a} m={achado.m} s={achado.s!} grade={grade} numero={numero.get(achado.a.id) ?? 0}
              aba={aba} setAba={setAba} planos={planos} controle={controle.filter((c) => c.aulaId === achado.a!.id)}
              mudar={(fn) => mudar((g) => { const x = localizar(g, achado.a!.id); if (x?.a) fn(x.a) })}
              aoMoverPara={(sId) => { arrastando.current = achado.a!.id; soltar(sId) }}
              aoDuplicar={() => duplicar(achado.a!.id)} aoRemover={() => remover(achado.a!.id)} setErro={setErro} />
          )}
        </section>
      </div>}

      {modal === 'previa' && <Previa grade={grade} planos={planos} aoFechar={() => setModal(null)} />}
      {modal === 'publicar' && (
        <Publicar grade={grade} publicada={publicada} aoFechar={() => setModal(null)} aoPublicar={async (nota) => {
          if (timer.current) clearTimeout(timer.current)
          const em = await publicarGrade(sessao, grade, nota, marca)
          esquecerGradeEmCache()
          setPublicada(clone(grade)); setPublicadaEm(em); setRascunhoEm(em); setSituacao('salvo'); setModal(null)
          setAviso('Publicado. A sala de aula já mostra esta versão para os alunos.')
        }} />
      )}
      {modal === 'historico' && <Historico sessao={sessao} marca={marca} aoFechar={() => setModal(null)} aoRestaurar={(g) => { mudar((x) => { x.modulos = clone(g.modulos); x.cursos = clone(g.cursos ?? []) }); setModal(null); setSel(null); setCursoAberto(null); setAviso('Versão trazida para o rascunho. Confira na prévia e publique para valer.') }} />}
    </div>
  )
}

/* ================================================================ módulo */

function Acesso({ publicado, liberarEm, planos, todos, mudar, rotulo }: {
  publicado: boolean; liberarEm?: string | null; planos?: PlanoEscolhido[]; todos: PlanoEscolhido[]; rotulo: string
  mudar: (x: { publicado?: boolean; liberarEm?: string | null; planos?: PlanoEscolhido[] }) => void
}) {
  const escolhidos = planos ?? []
  const resumo = !publicado ? `Ninguém vê ${rotulo === 'módulo' ? 'este módulo' : 'esta aula'}: está oculto${rotulo === 'aula' ? 'a' : ''}.`
    : [liberarEm && Date.parse(liberarEm) > Date.now() ? `Aparece trancad${rotulo === 'aula' ? 'a' : 'o'} até ${hora(liberarEm)}` : 'Libera na hora',
      escolhidos.length ? `só para ${escolhidos.map((p) => p.nome).join(', ')}` : 'para todos os planos'].join(', ') + '.'
  return (
    <div className="eg-acesso">
      <label className="eg-chave"><input type="checkbox" checked={publicado} onChange={(e) => mudar({ publicado: e.target.checked })} /><span><b>Visível para os alunos</b><small>Desligado, {rotulo === 'módulo' ? 'o módulo inteiro some' : 'a aula some'} da sala, mas continua aqui.</small></span></label>
      <label><span>Liberar a partir de</span><input type="datetime-local" value={paraCampo(liberarEm)} onChange={(e) => mudar({ liberarEm: doCampo(e.target.value) })} /><small>Vazio = libera assim que publicar. Antes da data, o aluno vê "Disponível em dd/mm" e não assiste.</small></label>
      <div className="eg-planos">
        <span>Planos com acesso</span>
        <div>
          <button type="button" className={!escolhidos.length ? 'on' : ''} onClick={() => mudar({ planos: [] })}>Todos</button>
          {todos.map((p) => {
            const on = escolhidos.some((x) => x.id === p.id)
            return <button type="button" key={p.id} className={on ? 'on' : ''} onClick={() => mudar({ planos: on ? escolhidos.filter((x) => x.id !== p.id) : [...escolhidos, p] })}>{p.nome}</button>
          })}
        </div>
        <small>Quem é de outro plano vê {rotulo === 'módulo' ? 'as aulas' : 'a aula'} com "Disponível no plano …". Administradores sempre assistem.</small>
      </div>
      <p className="eg-resumo-acesso">{resumo}</p>
    </div>
  )
}

function EditorDoModulo({ m, numero, planos, mudar, aoAddAssunto, aoAddAula, aoDuplicar, aoRemover }: {
  m: ModuloGrade; numero: number; planos: PlanoEscolhido[]; mudar: (fn: (m: ModuloGrade) => void) => void
  aoAddAssunto: () => void; aoAddAula: () => void; aoDuplicar: () => void; aoRemover: () => void
}) {
  const aulas = m.assuntos.reduce((n, s) => n + s.aulas.length, 0)
  return (
    <div className="eg-editor" style={{ ['--cor' as string]: m.cor }}>
      <header className="eg-editor-cab">
        <div><span className="rot">Módulo {String(numero).padStart(2, '0')}</span><h3>{m.titulo || 'Módulo sem nome'}</h3><small>{m.assuntos.filter((s) => s.titulo).length} assuntos · {aulas} aulas</small></div>
        <div className="eg-editor-acoes"><button type="button" className="admin-secundario" onClick={aoDuplicar}>Duplicar</button><button type="button" className="eg-perigo" onClick={aoRemover}>Excluir módulo</button></div>
      </header>
      <div className="eg-campos">
        <label className="largo"><span>Nome do módulo</span><input value={m.titulo} maxLength={80} onChange={(e) => mudar((x) => { x.titulo = e.target.value })} placeholder="Ex.: Gerenciamento e emocional" /></label>
        <label className="largo"><span>Frase de chamada</span><input value={m.chamada} maxLength={140} onChange={(e) => mudar((x) => { x.chamada = e.target.value })} placeholder="Aparece embaixo do nome, na sala" /></label>
        <label className="largo"><span>Descrição (opcional)</span><textarea rows={3} value={m.descricao ?? ''} maxLength={600} onChange={(e) => mudar((x) => { x.descricao = e.target.value })} placeholder="O que a pessoa aprende neste módulo" /></label>
        <div className="largo eg-cores">
          <span>Cor do módulo</span>
          <div>
            {CORES_DA_MARCA.map((c) => <button type="button" key={c} className={m.cor.toLowerCase() === c.toLowerCase() ? 'on' : ''} style={{ background: c }} aria-label={`Cor ${c}`} onClick={() => mudar((x) => { x.cor = c })} />)}
            <label className="eg-cor-livre" title="Outra cor"><input type="color" value={/^#[0-9a-f]{6}$/i.test(m.cor) ? m.cor : '#B78D39'} onChange={(e) => mudar((x) => { x.cor = e.target.value })} /><span>Outra</span></label>
          </div>
          <small>A cor marca a trilha, a luz das capas e a barra de progresso do módulo.</small>
        </div>
      </div>
      <h4 className="eg-sub">Quem vê este módulo</h4>
      <Acesso rotulo="módulo" publicado={m.publicado} liberarEm={m.liberarEm} planos={m.planos} todos={planos}
        mudar={(v) => mudar((x) => { if (v.publicado !== undefined) x.publicado = v.publicado; if (v.liberarEm !== undefined) x.liberarEm = v.liberarEm; if (v.planos) x.planos = v.planos })} />
      <div className="eg-rodape-acoes"><button type="button" className="admin-secundario" onClick={aoAddAssunto}>+ Assunto</button><button type="button" className="admin-primary" onClick={aoAddAula}>+ Aula neste módulo</button></div>
    </div>
  )
}

/* =============================================================== assunto */

function EditorDoAssunto({ s, m, mudar, aoAddAula, aoRemover }: { s: AssuntoGrade; m: ModuloGrade; mudar: (fn: (s: AssuntoGrade) => void) => void; aoAddAula: () => void; aoRemover: () => void }) {
  return (
    <div className="eg-editor" style={{ ['--cor' as string]: m.cor }}>
      <header className="eg-editor-cab">
        <div><span className="rot">Assunto · {m.titulo}</span><h3>{s.titulo || 'Sem nome'}</h3><small>{s.aulas.length} aulas</small></div>
        <div className="eg-editor-acoes"><button type="button" className="eg-perigo" onClick={aoRemover}>Excluir assunto</button></div>
      </header>
      <div className="eg-campos">
        <label className="largo"><span>Nome do assunto</span><input value={s.titulo} maxLength={80} onChange={(e) => mudar((x) => { x.titulo = e.target.value })} placeholder="Ex.: Depósitos e saques" /><small>Vazio: as aulas deste assunto aparecem direto no módulo, sem título.</small></label>
        <label className="largo"><span>Descrição (opcional)</span><textarea rows={3} value={s.descricao ?? ''} maxLength={400} onChange={(e) => mudar((x) => { x.descricao = e.target.value })} placeholder="Uma linha sobre o que este grupo de aulas cobre" /></label>
      </div>
      <div className="eg-rodape-acoes"><button type="button" className="admin-primary" onClick={aoAddAula}>+ Aula neste assunto</button></div>
    </div>
  )
}

/* ================================================================== aula */

function EditorDaAula({ sessao, marca, a, m, s, grade, numero, aba, setAba, planos, controle, mudar, aoMoverPara, aoDuplicar, aoRemover, setErro }: {
  sessao: SessaoTeeds; marca: string; a: AulaGrade; m: ModuloGrade; s: AssuntoGrade; grade: GradeAulas; numero: number
  aba: AbaDaAula; setAba: (a: AbaDaAula) => void; planos: PlanoEscolhido[]; controle: AssistiuAula[]
  mudar: (fn: (a: AulaGrade) => void) => void; aoMoverPara: (assuntoId: string) => void; aoDuplicar: () => void; aoRemover: () => void; setErro: (e: string | null) => void
}) {
  const [envio, setEnvio] = useState<{ nome: string; fracao: number; cancelar: () => void } | null>(null)
  const [enviandoCapa, setEnviandoCapa] = useState(false)
  const [enviandoMaterial, setEnviandoMaterial] = useState(false)
  const entradaVideo = useRef<HTMLInputElement>(null)
  const entradaCapa = useRef<HTMLInputElement>(null)
  const entradaMaterial = useRef<HTMLInputElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const player = playerDoVideo(a.video)
  const mp4 = player?.tipo === 'mp4'

  const escolherVideo = async (arquivo: File | undefined) => {
    if (!arquivo) return
    if (!/^video\//.test(arquivo.type)) { setErro('Escolha um arquivo de vídeo (MP4 é o mais seguro para todos os navegadores).'); return }
    if (arquivo.size > LIMITE_VIDEO_MB * 1048576) { setErro(`O arquivo tem ${(arquivo.size / 1048576).toFixed(0)} MB; o limite é ${LIMITE_VIDEO_MB} MB. Exporte menor ou cole um link.`); return }
    setErro(null)
    const segundos = await duracaoDoArquivo(arquivo)
    const { promessa, cancelar } = enviarArquivoDaAula(sessao, a.id, arquivo, (f) => setEnvio((e) => (e ? { ...e, fracao: f } : e)), marca)
    setEnvio({ nome: arquivo.name, fracao: 0, cancelar })
    try {
      const { caminho, url } = await promessa
      mudar((x) => { x.video = url; x.arquivo = caminho; if (segundos) x.duracao = duracaoLegivel(segundos) })
    } catch (e) { setErro((e as Error).message) } finally { setEnvio(null); if (entradaVideo.current) entradaVideo.current.value = '' }
  }
  const usarCapa = async (fonte: Blob) => {
    setEnviandoCapa(true); setErro(null)
    try { const { url, caminho } = await enviarCapa(sessao, a.id, fonte, marca); mudar((x) => { x.capa = url; x.capaArquivo = caminho }) }
    catch (e) { setErro((e as Error).message) } finally { setEnviandoCapa(false); if (entradaCapa.current) entradaCapa.current.value = '' }
  }
  const capturarQuadro = async () => {
    if (!video.current) return
    try { await usarCapa(await quadroDoVideo(video.current)) } catch (e) { setErro((e as Error).message) }
  }
  const adicionarMaterial = async (arquivo: File | undefined) => {
    if (!arquivo) return
    if (arquivo.size > LIMITE_MATERIAL_MB * 1048576) { setErro(`O arquivo tem ${(arquivo.size / 1048576).toFixed(0)} MB; o limite de cada material é ${LIMITE_MATERIAL_MB} MB.`); return }
    setEnviandoMaterial(true); setErro(null)
    try { const mat: Material = await enviarMaterial(sessao, a.id, arquivo, marca); mudar((x) => { x.materiais.push(mat) }) }
    catch (e) { setErro((e as Error).message) } finally { setEnviandoMaterial(false); if (entradaMaterial.current) entradaMaterial.current.value = '' }
  }
  const tempoAtual = () => (video.current ? duracaoDeRelogio(video.current.currentTime) : '')
  const addTopico = (tempo = '') => mudar((x) => { x.topicos.push({ id: Math.random().toString(36).slice(2, 8), titulo: '', tempo }) })

  const abas: Array<[AbaDaAula, string, string?]> = [
    ['conteudo', 'Conteúdo'], ['video', 'Vídeo', a.video ? '' : '!'], ['topicos', 'Tópicos', a.topicos.length ? String(a.topicos.length) : ''],
    ['materiais', 'Materiais e links', a.materiais.length + a.links.length ? String(a.materiais.length + a.links.length) : ''], ['acesso', 'Acesso'], ['alunos', 'Quem assistiu', controle.length ? String(controle.length) : ''],
  ]

  const reprodutor = (comControles = true) => (
    <div className="eg-video">
      {mp4 ? <video ref={video} src={player!.src} controls={comControles} preload="metadata" playsInline crossOrigin={ehArquivoNosso(a.video) ? 'anonymous' : undefined}
        onLoadedMetadata={(e) => { const d = (e.target as HTMLVideoElement).duration; if (!a.duracao && Number.isFinite(d)) mudar((x) => { x.duracao = duracaoLegivel(d) }) }} />
        : player ? <iframe src={player.src} title="Prévia do vídeo" allowFullScreen allow="encrypted-media; picture-in-picture" />
        : <div className="eg-video-vazio"><b>Sem vídeo ainda</b><small>Envie o arquivo ou cole o link do vídeo.</small></div>}
    </div>
  )

  return (
    <div className="eg-editor" style={{ ['--cor' as string]: m.cor }}>
      <header className="eg-editor-cab com-cartao">
        <div>
          <span className="rot">Aula {numero} · {m.titulo}{s.titulo ? ` · ${s.titulo}` : ''}</span>
          <h3>{a.titulo || 'Aula sem título'}</h3>
          <div className="eg-editor-acoes">
            <label className="eg-mover"><span>Mover para</span>
              <select value={s.id} onChange={(e) => aoMoverPara(e.target.value)}>
                {grade.modulos.filter((mm) => mm.curso === m.curso).map((mm) => <optgroup key={mm.id} label={mm.titulo || 'Módulo sem nome'}>{mm.assuntos.map((ss) => <option key={ss.id} value={ss.id}>{ss.titulo || `${mm.titulo} (sem assunto)`}</option>)}</optgroup>)}
              </select>
            </label>
            <button type="button" className="admin-secundario" onClick={aoDuplicar}>Duplicar</button>
            <button type="button" className="eg-perigo" onClick={aoRemover}>Excluir aula</button>
          </div>
        </div>
        {/* o cartão como o aluno vê, ao vivo */}
        <figure className="eg-cartao" aria-label="Como o cartão aparece na sala">
          <span className="eg-cartao-capa"><CapaDaAula aula={{ id: a.id, titulo: a.titulo, capa: a.capa }} cor={m.cor} numero={numero} alt="" />
            {a.duracao && <span className="eg-cartao-dur">{a.duracao}</span>}{!a.video && <em>{DEMONSTRACAO_EM_AULA_SEM_VIDEO ? 'Vídeo de exemplo' : 'Em breve'}</em>}</span>
          <figcaption><small>Aula {numero}</small><b>{a.titulo || 'Aula sem título'}</b></figcaption>
        </figure>
      </header>

      <div className="eg-abas" role="tablist">
        {abas.map(([id, nome, selo]) => <button key={id} role="tab" type="button" aria-selected={aba === id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)}>{nome}{selo ? <b className={selo === '!' ? 'falta' : ''}>{selo}</b> : null}</button>)}
      </div>

      {aba === 'conteudo' && (
        <div className="eg-campos">
          <label className="largo"><span>Título da aula</span><input value={a.titulo} maxLength={120} onChange={(e) => mudar((x) => { x.titulo = e.target.value })} placeholder="Ex.: Como sacar da corretora" /></label>
          <label className="largo"><span>Descrição</span><textarea rows={5} value={a.descricao} maxLength={1200} onChange={(e) => mudar((x) => { x.descricao = e.target.value })} placeholder="O que a pessoa vai aprender e por que esta aula importa" /><small>{a.descricao.length} de 1200 caracteres · aparece no cartão, na janela de detalhes e embaixo do vídeo.</small></label>
          <label><span>Nível</span><select value={a.nivel || 'Iniciante'} onChange={(e) => mudar((x) => { x.nivel = e.target.value })}>{NIVEIS.map((n) => <option key={n}>{n}</option>)}</select></label>
          <label><span>Duração no cartão</span><input value={a.duracao} maxLength={20} onChange={(e) => mudar((x) => { x.duracao = e.target.value })} placeholder="Ex.: 12 min" /><small>Preenchida sozinha quando o vídeo é enviado.</small></label>
          <div className="largo eg-capa">
            <span>Capa</span>
            <div className="eg-capa-linha">
              <span className="eg-capa-amostra"><CapaDaAula aula={{ id: a.id, titulo: a.titulo, capa: a.capa }} cor={m.cor} numero={numero} alt="" /></span>
              <div>
                <input ref={entradaCapa} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void usarCapa(f) }} />
                <button type="button" className="admin-primary" disabled={enviandoCapa} onClick={() => entradaCapa.current?.click()}>{enviandoCapa ? 'Enviando…' : a.capa ? 'Trocar a imagem' : 'Enviar uma imagem'}</button>
                {mp4 && <button type="button" className="admin-secundario" onClick={() => setAba('video')}>Usar um quadro do vídeo</button>}
                {a.capa && <button type="button" className="admin-secundario" onClick={() => mudar((x) => { x.capa = ''; x.capaArquivo = null })}>Voltar para a capa padrão</button>}
                <small>Formato em pé (2:3), como um pôster, fica melhor. JPG, PNG ou WebP; a imagem é reduzida sozinha. Sem imagem, a aula usa a capa padrão {a.capa ? '' : '(ao lado)'}.</small>
              </div>
            </div>
          </div>
        </div>
      )}

      {aba === 'video' && (
        <div className="eg-campos">
          <div className="largo eg-envio">
            <input ref={entradaVideo} type="file" accept="video/mp4,video/webm,video/quicktime,video/*" hidden onChange={(e) => void escolherVideo(e.target.files?.[0])} />
            {envio ? (
              <div className="eg-progresso">
                <div><span>Enviando {envio.nome}</span><b>{Math.round(envio.fracao * 100)}%</b></div>
                <i><u style={{ width: `${envio.fracao * 100}%` }} /></i>
                <button type="button" className="admin-secundario" onClick={envio.cancelar}>Cancelar envio</button>
              </div>
            ) : (
              <div className="eg-solta" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void escolherVideo(e.dataTransfer.files?.[0]) }}>
                <b>Arraste o vídeo para cá</b>
                <small>MP4 (H.264 + AAC), até {LIMITE_VIDEO_MB} MB. O espaço gratuito do banco é pequeno: para muitas aulas, prefira um link (Vimeo, YouTube não listado, Bunny).</small>
                <button type="button" className="admin-primary" onClick={() => entradaVideo.current?.click()}>{a.video ? 'Trocar o vídeo' : 'Escolher arquivo'}</button>
              </div>
            )}
          </div>
          <label className="largo"><span>Ou cole um link</span><input value={a.video} placeholder="https://youtube.com/…, https://vimeo.com/… ou …/aula.mp4" onChange={(e) => mudar((x) => { x.video = e.target.value; x.arquivo = ehArquivoNosso(e.target.value) ? x.arquivo : null })} /><small>{a.video ? `${origemDoVideo(a.video)}. ${mp4 || player?.tipo === 'youtube' ? 'Toca no player da plataforma e mede quanto cada aluno assistiu de fato.' : 'Com Vimeo não dá para medir quanto cada aluno assistiu: prefira YouTube (não listado) ou MP4.'}` : 'YouTube (não listado) ou MP4: nos dois medimos quanto cada aluno assistiu.'}</small></label>
          <label className="largo eg-chave"><input type="checkbox" checked={!!a.repetir} onChange={(e) => mudar((x) => { x.repetir = e.target.checked || undefined })} /><span><b>Repetir sem parar</b><small>O vídeo volta ao começo sozinho quando termina (bom para depoimentos).</small></span></label>
          <div className="largo">{reprodutor()}</div>
          {mp4 && (
            <div className="largo eg-video-acoes">
              <button type="button" className="admin-secundario" disabled={enviandoCapa} onClick={() => void capturarQuadro()}>{enviandoCapa ? 'Gravando a capa…' : 'Usar este quadro como capa'}</button>
              <button type="button" className="admin-secundario" onClick={() => { addTopico(tempoAtual()); setAba('topicos') }}>+ Tópico no ponto atual do vídeo</button>
              {a.video && <button type="button" className="eg-perigo" onClick={() => mudar((x) => { x.video = ''; x.arquivo = null })}>Tirar o vídeo da aula</button>}
            </div>
          )}
          <label><span>Duração no cartão</span><input value={a.duracao} maxLength={20} onChange={(e) => mudar((x) => { x.duracao = e.target.value })} placeholder="Ex.: 12 min" /></label>
        </div>
      )}

      {aba === 'topicos' && (
        <div className="eg-topicos">
          <p className="eg-explica">Os tópicos aparecem embaixo do vídeo, em "O que você vai ver nesta aula". Com o minuto preenchido e vídeo em MP4, o aluno clica e o vídeo pula para aquele ponto.</p>
          {mp4 && <div className="eg-topicos-video">{reprodutor()}<button type="button" className="admin-primary" onClick={() => addTopico(tempoAtual())}>+ Tópico no ponto atual do vídeo</button></div>}
          <ol>
            {a.topicos.map((t, i) => (
              <li key={t.id}>
                <input className="eg-tempo" value={t.tempo ?? ''} placeholder="0:00" aria-label="Minuto" maxLength={8}
                  onChange={(e) => mudar((x) => { x.topicos[i].tempo = e.target.value })}
                  aria-invalid={!!t.tempo && segundosDoTempo(t.tempo) == null} />
                <input value={t.titulo} placeholder="O que é explicado aqui" aria-label="Tópico" maxLength={140} onChange={(e) => mudar((x) => { x.topicos[i].titulo = e.target.value })} />
                {mp4 && <button type="button" title="Ir para este ponto" onClick={() => { const seg = segundosDoTempo(t.tempo); if (video.current && seg != null) { video.current.currentTime = seg; void video.current.play().catch(() => undefined) } }}>▶</button>}
                <button type="button" onClick={() => mudar((x) => { if (i > 0) [x.topicos[i - 1], x.topicos[i]] = [x.topicos[i], x.topicos[i - 1]] })} disabled={i === 0} aria-label="Subir">↑</button>
                <button type="button" onClick={() => mudar((x) => { if (i < x.topicos.length - 1) [x.topicos[i + 1], x.topicos[i]] = [x.topicos[i], x.topicos[i + 1]] })} disabled={i === a.topicos.length - 1} aria-label="Descer">↓</button>
                <button type="button" onClick={() => mudar((x) => { x.topicos.splice(i, 1) })} aria-label="Tirar o tópico"><IconeFechar /></button>
              </li>
            ))}
          </ol>
          {a.topicos.some((t) => t.tempo && segundosDoTempo(t.tempo) == null) && <p className="eg-alerta">Use o minuto no formato 3:40 ou 1:02:10.</p>}
          <div className="eg-rodape-acoes"><button type="button" className="admin-secundario" onClick={() => addTopico()}>+ Tópico</button>
            {a.topicos.some((t) => t.tempo) && <button type="button" className="admin-secundario" onClick={() => mudar((x) => { x.topicos.sort((p, q) => (segundosDoTempo(p.tempo) ?? 1e9) - (segundosDoTempo(q.tempo) ?? 1e9)) })}>Ordenar pelo minuto</button>}</div>
        </div>
      )}

      {aba === 'materiais' && (
        <div className="eg-campos">
          <div className="largo eg-lista">
            <span>Materiais para baixar</span>
            {a.materiais.map((mat, i) => (
              <div key={mat.url} className="eg-item">
                <i>{(mat.tipo || mat.url.split('.').pop() || 'arq').slice(0, 4).toUpperCase()}</i>
                <input value={mat.nome} aria-label="Nome do botão" onChange={(e) => mudar((x) => { x.materiais[i].nome = e.target.value })} />
                <small>{tamanhoLegivel(mat.tamanho)}</small>
                <button type="button" onClick={() => mudar((x) => { x.materiais.splice(i, 1) })} aria-label={`Tirar ${mat.nome}`}><IconeFechar /></button>
              </div>
            ))}
            <input ref={entradaMaterial} type="file" hidden accept=".pdf,.epub,.zip,.xlsx,.xls,.csv,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.txt" onChange={(e) => void adicionarMaterial(e.target.files?.[0])} />
            <button type="button" className="admin-secundario" disabled={enviandoMaterial} onClick={() => entradaMaterial.current?.click()}>{enviandoMaterial ? 'Enviando…' : '+ Adicionar arquivo'}</button>
            <small>PDF, e-book, planilha, documento, apresentação, imagem ou ZIP, até {LIMITE_MATERIAL_MB} MB cada. O nome é o texto do botão para o aluno.</small>
          </div>
          <div className="largo eg-lista">
            <span>Links da aula</span>
            <small>Abrir conta, depositar e a comunidade já aparecem em todas as aulas. Aqui entram os links extras desta.</small>
            {a.links.map((l, i) => (
              <div key={i} className="eg-item link">
                <input value={l.nome} placeholder="Nome do botão" aria-label="Nome do botão" onChange={(e) => mudar((x) => { x.links[i].nome = e.target.value })} />
                <input value={l.url} placeholder="https://…" aria-label="Endereço" aria-invalid={!!l.url && !/^https?:\/\//i.test(l.url)} onChange={(e) => mudar((x) => { x.links[i].url = e.target.value })} />
                <button type="button" onClick={() => mudar((x) => { x.links.splice(i, 1) })} aria-label="Tirar o link"><IconeFechar /></button>
              </div>
            ))}
            <button type="button" className="admin-secundario" onClick={() => mudar((x) => { x.links.push({ nome: '', url: '' }) })}>+ Adicionar link</button>
          </div>
        </div>
      )}

      {aba === 'acesso' && (
        <Acesso rotulo="aula" publicado={a.publicado} liberarEm={a.liberarEm} planos={a.planos} todos={planos}
          mudar={(v) => mudar((x) => { if (v.publicado !== undefined) x.publicado = v.publicado; if (v.liberarEm !== undefined) x.liberarEm = v.liberarEm; if (v.planos) x.planos = v.planos })} />
      )}

      {aba === 'alunos' && (
        controle.length ? (
          <div className="adm-tabela-aulas eg-alunos"><table>
            <thead><tr><th>Aluno</th><th>Plano</th><th>Abriu</th><th>Assistiu de fato</th><th>Chegou até</th><th>Situação</th></tr></thead>
            <tbody>{controle.map((c) => (
              <tr key={c.userId}>
                <td><b>{c.nome}</b><small>{c.email}</small></td><td>{c.plano || '—'}</td><td className="num">{c.aberturas}×</td>
                <td className="num">{c.duracaoSeg ? `${Math.round(fracaoAssistida(c) * 100)}%` : '—'}<small>{duracaoLegivel(c.segundos)}</small></td>
                <td className="num">{Math.round(c.posicaoMax * 100)}%</td>
                <td>{c.concluida ? <em className="adm-status ativo">Concluiu</em> : <em className="adm-status suspenso">Não concluiu</em>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <p className="adm-vazio">Ninguém abriu esta aula ainda.</p>
      )}
    </div>
  )
}

const duracaoDeRelogio = (seg: number) => { const t = Math.max(0, Math.floor(seg)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}` }

/* ================================================================ prévia */

type JanelaComPrevia = Window & { __previaAulas?: { grade: GradeAulas; plano: string | null } }

function Previa({ grade, planos, aoFechar }: { grade: GradeAulas; planos: PlanoEscolhido[]; aoFechar: () => void }) {
  const [tela, setTela] = useState<'computador' | 'celular'>('computador')
  const [plano, setPlano] = useState<string | null>(null)
  const quadro = useRef<HTMLIFrameElement>(null)
  // o quadro lê a grade daqui (mesmo site) e é avisado a cada mudança
  useEffect(() => {
    ;(window as JanelaComPrevia).__previaAulas = { grade, plano }
    quadro.current?.contentWindow?.postMessage({ tipo: 'previa-aulas' }, location.origin)
  }, [grade, plano])
  useEffect(() => () => { delete (window as JanelaComPrevia).__previaAulas }, [])
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [aoFechar])
  return (
    <div className="eg-previa" role="dialog" aria-modal="true" aria-label="Prévia da sala de aula">
      <header>
        <div><b>Prévia da sala de aula</b><small>É o rascunho, como o aluno vai ver. Nada aqui foi publicado.</small></div>
        <div className="eg-previa-controles">
          <div className="eg-seg" role="group" aria-label="Tamanho da tela">
            <button type="button" className={tela === 'computador' ? 'on' : ''} onClick={() => setTela('computador')}>Computador</button>
            <button type="button" className={tela === 'celular' ? 'on' : ''} onClick={() => setTela('celular')}>Celular</button>
          </div>
          {planos.length > 0 && (
            <label><span>Ver como</span><select value={plano ?? ''} onChange={(e) => setPlano(e.target.value || null)}>
              <option value="">Aluno de qualquer plano</option>
              {planos.map((p) => <option key={p.id} value={p.id}>Aluno do plano {p.nome}</option>)}
            </select></label>
          )}
          <button type="button" className="eg-fechar" onClick={aoFechar} aria-label="Fechar a prévia"><IconeFechar /></button>
        </div>
      </header>
      <div className={`eg-previa-palco ${tela}`}>
        <iframe ref={quadro} title="Prévia da sala de aula" src={`${import.meta.env.BASE_URL}?previa=aulas&tela=aulas`} />
      </div>
    </div>
  )
}

/* ============================================================== publicar */

function Publicar({ grade, publicada, aoFechar, aoPublicar }: { grade: GradeAulas; publicada: GradeAulas | null; aoFechar: () => void; aoPublicar: (nota: string) => Promise<void> }) {
  const [nota, setNota] = useState('')
  const [indo, setIndo] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const aulas = grade.modulos.flatMap((m) => m.assuntos.flatMap((s) => s.aulas.map((a) => ({ a, m }))))
  const antes = new Set((publicada?.modulos ?? []).flatMap((m) => m.assuntos.flatMap((s) => s.aulas.map((a) => a.id))))
  const agora = new Set(aulas.map((x) => x.a.id))
  const novas = aulas.filter((x) => !antes.has(x.a.id)).length
  const saem = [...antes].filter((id) => !agora.has(id)).length
  const semVideo = aulas.filter((x) => x.a.publicado && !x.a.video)
  const semTitulo = aulas.filter((x) => !x.a.titulo.trim())
  const linksRuins = aulas.filter((x) => x.a.links.some((l) => !l.nome.trim() || !/^https?:\/\//i.test(l.url)))
  const cursos = grade.cursos ?? []
  const vendidosSemProduto = cursos.filter((c) => c.acesso.modo === 'compra' && !c.acesso.cakto.length)
  const vendidosSemCheckout = cursos.filter((c) => c.acesso.modo === 'compra' && c.acesso.vitrine && !/^https:\/\//i.test(c.acesso.checkout))
  const planosVazios = cursos.filter((c) => c.acesso.modo === 'planos' && !c.acesso.planos.length)
  const cursoSemNome = cursos.filter((c) => !c.titulo.trim())
  const bloqueia = semTitulo.length > 0 || linksRuins.length > 0 || cursoSemNome.length > 0
  return (
    <div className="adm-modal-fundo" onMouseDown={aoFechar}>
      <section className="adm-modal eg-publicar" onMouseDown={(e) => e.stopPropagation()}>
        <header><div><span className="rot">Publicar</span><h3>Levar esta grade para os alunos</h3></div><button onClick={aoFechar} aria-label="Fechar"><IconeFechar /></button></header>
        <div className="eg-publicar-corpo">
          <ul className="eg-resumo">
            <li><b>{cursos.filter((c) => c.publicado).length}</b> {cursos.filter((c) => c.publicado).length === 1 ? 'curso visível' : 'cursos visíveis'}</li>
            <li><b>{grade.modulos.filter((m) => m.publicado).length}</b> módulos visíveis</li>
            <li><b>{aulas.filter((x) => x.a.publicado).length}</b> aulas visíveis</li>
            {publicada ? <><li><b>{novas}</b> aulas novas</li><li><b>{saem}</b> saem da sala</li></> : <li>Primeira publicação: a sala troca o catálogo antigo por esta grade</li>}
          </ul>
          {cursoSemNome.length > 0 && <p className="eg-alerta">Há curso sem nome. Dê um nome antes de publicar.</p>}
          {vendidosSemProduto.length > 0 && <div className="eg-aviso-suave"><b>{vendidosSemProduto.map((c) => c.titulo).join(', ')}: à venda sem produto da Cakto</b><small>Ninguém é liberado sozinho até você colar o ID do produto em Acesso e venda. Dá para liberar à mão na aba Alunos.</small></div>}
          {vendidosSemCheckout.length > 0 && <div className="eg-aviso-suave"><b>{vendidosSemCheckout.map((c) => c.titulo).join(', ')}: sem link do checkout</b><small>O curso aparece trancado sem o botão de compra.</small></div>}
          {planosVazios.length > 0 && <div className="eg-aviso-suave"><b>{planosVazios.map((c) => c.titulo).join(', ')}: nenhum plano escolhido</b><small>Só os administradores assistem.</small></div>}
          {semTitulo.length > 0 && <p className="eg-alerta">{semTitulo.length} {semTitulo.length === 1 ? 'aula está' : 'aulas estão'} sem título. Dê um nome antes de publicar.</p>}
          {linksRuins.length > 0 && <p className="eg-alerta">Há link sem nome ou sem https:// em: {linksRuins.map((x) => x.a.titulo).join(', ')}.</p>}
          {semVideo.length > 0 && (
            <div className="eg-aviso-suave"><b>{semVideo.length} {semVideo.length === 1 ? 'aula visível está' : 'aulas visíveis estão'} sem vídeo</b>
              <small>{DEMONSTRACAO_EM_AULA_SEM_VIDEO ? 'Elas abrem com o vídeo de exemplo.' : 'Elas aparecem como "Em breve".'} {semVideo.slice(0, 4).map((x) => x.a.titulo).join(' · ')}{semVideo.length > 4 ? ` e mais ${semVideo.length - 4}` : ''}</small></div>
          )}
          <label><span>O que mudou (opcional, aparece no Histórico)</span><textarea rows={2} value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} placeholder="Ex.: módulo de saques e 3 aulas novas" /></label>
          {falha && <p className="eg-alerta">{falha}</p>}
        </div>
        <footer>
          <span>Os alunos veem a mudança na próxima vez que abrirem as aulas.</span>
          <button disabled={indo || bloqueia} onClick={async () => { setIndo(true); setFalha(null); try { await aoPublicar(nota) } catch (e) { setFalha((e as Error).message); setIndo(false) } }}>{indo ? 'Publicando…' : 'Publicar agora'}</button>
        </footer>
      </section>
    </div>
  )
}

/* ============================================================= histórico */

function Historico({ sessao, marca, aoFechar, aoRestaurar }: { sessao: SessaoTeeds; marca: string; aoFechar: () => void; aoRestaurar: (g: GradeAulas) => void }) {
  const [lista, setLista] = useState<VersaoDaGrade[] | null>(null)
  const [falha, setFalha] = useState<string | null>(null)
  useEffect(() => { versoesDaGrade(sessao, marca).then(setLista).catch((e) => setFalha((e as Error).message)) }, [sessao, marca])
  return (
    <div className="adm-modal-fundo" onMouseDown={aoFechar}>
      <section className="adm-modal eg-historico" onMouseDown={(e) => e.stopPropagation()}>
        <header><div><span className="rot">Histórico</span><h3>Versões publicadas</h3></div><button onClick={aoFechar} aria-label="Fechar"><IconeFechar /></button></header>
        <div className="eg-publicar-corpo">
          {falha && <p className="eg-alerta">{falha}</p>}
          {!lista && !falha && <p className="adm-vazio">Lendo as versões…</p>}
          {lista && !lista.length && <p className="adm-vazio">Nada publicado por aqui ainda. Cada publicação fica guardada nesta lista.</p>}
          {lista?.map((v, i) => (
            <article key={v.id} className="eg-versao">
              <div><b>{hora(v.criadaEm)}{i === 0 ? ' · no ar agora' : ''}</b><small>{v.nota || 'Sem anotação'} · {v.cursos} {v.cursos === 1 ? 'curso' : 'cursos'} · {v.modulos} módulos · {v.aulas} aulas</small></div>
              <button type="button" className="admin-secundario" onClick={() => { if (window.confirm('Trazer esta versão para o rascunho? O rascunho atual é substituído (o que já foi publicado continua no histórico).')) aoRestaurar(v.grade) }}>Trazer para o rascunho</button>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
