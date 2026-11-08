/**
 * A grade das aulas montada no painel (04/11/2026).
 *
 * Pedido do Tiago: "criar módulos, assuntos, tópicos, aulas específicas,
 * descrições, subir o vídeo, visualizar um preview de como vai ficar antes de
 * salvar... tudo personalizável, configurável". Até aqui a grade morava no
 * código (modulosAulas.ts) e o painel só trocava o vídeo de uma aula que já
 * existia.
 *
 * Como fica:
 *  - Módulo > Assunto > Aula. Toda aula tem tópicos (com o minuto no vídeo),
 *    materiais, links, capa, nível e as regras de acesso (publicada, data de
 *    liberação, planos). Um assunto sem título não aparece para o aluno: as
 *    aulas dele ficam direto no módulo.
 *  - A grade inteira é um documento por marca (tabela aulas_grade): o
 *    RASCUNHO, que só o admin vê e vai sendo salvo sozinho, e a PUBLICADA,
 *    que a sala de aula mostra. Publicar guarda uma versão para voltar atrás.
 *  - Enquanto nada for publicado, a sala segue com o catálogo do código. A
 *    primeira grade nasce dele, com os vídeos e materiais que o painel antigo
 *    gravou (aulas_videos): nada se perde na troca.
 *  - Os ids das aulas nunca mudam: o progresso dos alunos (aulas_progresso)
 *    e a capa do código dependem deles.
 */
import { useEffect, useState } from 'react'
import { MARCA } from '../../marca'
import { SUPABASE, autenticacaoConfigurada } from './config'
import type { SessaoTeeds } from './conta'
import { aoMudarModulos, modulosEmUso, MODULOS, usarModulosDaGrade, type LinkDaAula, type Material, type Modulo } from './aulas'
import type { VideoDaAula } from './aulasVideos'

/* ---------------------------------------------------------------- tipos */

export interface TopicoGrade { id: string; titulo: string; tempo?: string }
export interface PlanoEscolhido { id: string; nome: string }

export interface AulaGrade {
  id: string
  titulo: string
  descricao: string
  /** Link do vídeo (YouTube, Vimeo, .mp4) ou a URL pública do arquivo enviado. */
  video: string
  /** O caminho no bucket `aulas`, quando o vídeo foi enviado por aqui. */
  arquivo?: string | null
  duracao: string
  /** URL da capa enviada; vazio = a capa do código (pelo id) ou a capa desenhada. */
  capa?: string
  capaArquivo?: string | null
  topicos: TopicoGrade[]
  materiais: Material[]
  links: LinkDaAula[]
  publicado: boolean
  /** ISO. Antes disso a aula aparece com "Disponível em dd/mm" e não toca. */
  liberarEm?: string | null
  /** Vazio = todos os planos. */
  planos?: PlanoEscolhido[]
  nivel?: string
  /** O vídeo volta ao começo sozinho quando termina (ex.: depoimentos). */
  repetir?: boolean
  /** Vídeo em pé (9:16, como os depoimentos): o player corta as laterais, não o topo. */
  vertical?: boolean
}

export interface AssuntoGrade { id: string; titulo: string; descricao?: string; aulas: AulaGrade[] }

export interface ModuloGrade {
  id: string
  /** O curso deste módulo (06/11/2026). Vazio ou curso que sumiu = o primeiro curso. */
  curso?: string
  titulo: string
  chamada: string
  descricao?: string
  cor: string
  publicado: boolean
  liberarEm?: string | null
  planos?: PlanoEscolhido[]
  assuntos: AssuntoGrade[]
}

/**
 * Cursos (06/11/2026, pedido do Tiago: "área de membros bem profissional").
 * Curso > Módulo > Aula. Cada curso tem a sua regra de acesso:
 *  - todos: qualquer aluno da plataforma;
 *  - planos: só os planos escolhidos;
 *  - compra: vendido à parte na Cakto. Os IDs dos produtos da Cakto vão para o
 *    banco quando a grade é publicada (teeds_cursos_sincronizar) e a compra
 *    libera sozinha, pelo webhook que já existe. `planos` aqui = planos que
 *    também recebem o curso sem comprar.
 * Os módulos continuam numa lista só (`modulos`), cada um com o seu `curso`:
 * assim ids, progresso, versões e o resto da plataforma seguem iguais.
 */
export type ModoDoCurso = 'todos' | 'planos' | 'compra'
export interface AcessoDoCurso {
  modo: ModoDoCurso
  planos: PlanoEscolhido[]
  /** IDs dos produtos na Cakto que liberam este curso. */
  cakto: string[]
  /** Link do checkout, para o botão "Liberar acesso" de quem ainda não comprou. */
  checkout: string
  /** Compra libera para sempre (senão, 1 ano). */
  vitalicio: boolean
  /** Quem não tem acesso vê o curso trancado na vitrine (senão, o curso nem aparece). */
  vitrine: boolean
}
export interface CursoGrade {
  id: string
  titulo: string
  /** Uma linha, no cartão. */
  descricao: string
  /** O texto da página do curso (e da janela de quem ainda não tem acesso). */
  sobre?: string
  capa?: string
  capaArquivo?: string | null
  cor: string
  /** Selo no canto do cartão: "Novo", "Lançamento", "Bônus"... */
  selo?: string
  publicado: boolean
  liberarEm?: string | null
  acesso: AcessoDoCurso
}

export interface GradeAulas {
  versao: 1; cursos?: CursoGrade[]; modulos: ModuloGrade[]
  /** O vídeo do pop-up do primeiro acesso (GlobalFly, 08/11/2026). Vazio = a primeira aula com vídeo. */
  boasVindas?: { video: string }
}

export const NIVEIS = ['Iniciante', 'Intermediário', 'Avançado', 'Todos os níveis'] as const
export const CORES_DA_MARCA: string[] = MARCA.id === 'globalfly'
  ? ['#B78D39', '#9CB1C7', '#29445F', '#5B7C9D', '#2F8F72', '#C95F5F', '#8A6A2A', '#051528']
  : ['#d2a337', '#245E9E', '#138048', '#BF3A40', '#7A5AF8', '#0E9AA7', '#E07A1F', '#5F5D56']

/* ------------------------------------------------------------ utilidades */

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '')
/** Um id novo, legível e único na grade ("como-sacar-k3f9"). Nunca muda depois. */
export function novoId(titulo: string, existentes: Set<string>): string {
  const base = semAcento(titulo).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 32) || 'item'
  let id = base
  while (existentes.has(id)) id = `${base}-${Math.random().toString(36).slice(2, 6)}`
  return id
}
export const todosOsIds = (g: GradeAulas) => new Set([...(g.cursos ?? []).map((c) => c.id), ...g.modulos.flatMap((m) => [m.id, ...m.assuntos.flatMap((s) => [s.id, ...s.aulas.map((a) => a.id)])])])
export const ID_DO_CURSO_PADRAO = 'principal'
export const acessoPadrao = (): AcessoDoCurso => ({ modo: 'todos', planos: [], cakto: [], checkout: '', vitalicio: true, vitrine: true })
/** O primeiro curso: onde moram as aulas que já existiam antes dos cursos. */
export const cursoPadrao = (): CursoGrade => ({
  id: ID_DO_CURSO_PADRAO, titulo: `Formação ${MARCA.prosa}`, descricao: 'O treinamento completo, do primeiro acesso à operação.',
  cor: CORES_DA_MARCA[0], publicado: true, acesso: acessoPadrao(),
})
/** Os módulos de um curso, na ordem da grade. */
export const modulosDoCurso = (g: GradeAulas, cursoId: string) => g.modulos.filter((m) => m.curso === cursoId)
export const aulasDoCurso = (g: GradeAulas, cursoId: string) => modulosDoCurso(g, cursoId).reduce((n, m) => n + m.assuntos.reduce((k, s) => k + s.aulas.length, 0), 0)
export const contarAulas = (g: GradeAulas) => g.modulos.reduce((n, m) => n + m.assuntos.reduce((k, s) => k + s.aulas.length, 0), 0)

/** "3:40", "1:02:10" → segundos (null se não der para ler). */
export function segundosDoTempo(t: string | undefined): number | null {
  const m = (t ?? '').trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return (m[1] ? +m[1] * 3600 : 0) + +m[2] * 60 + +m[3]
}

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })

/* ------------------------------------------- a primeira grade: do código */

/** A grade que nasce do catálogo do código, com o que o painel antigo gravou por cima. */
export function gradeDoCatalogo(videos: Record<string, VideoDaAula> = {}): GradeAulas {
  return {
    versao: 1,
    cursos: [cursoPadrao()],
    modulos: MODULOS.map((m) => ({
      id: m.id, curso: ID_DO_CURSO_PADRAO, titulo: m.titulo, chamada: m.chamada, cor: m.cor, publicado: true,
      assuntos: [{
        id: `${m.id}-geral`, titulo: '',
        aulas: m.aulas.map((a) => {
          // o que o painel antigo gravou só valia publicado; o resto era a aula do código
          const v = videos[a.id]?.publicado ? videos[a.id] : undefined
          return {
            id: a.id, titulo: v?.titulo || a.titulo, descricao: v?.descricao || a.descricao,
            video: v?.video || a.video || '', arquivo: v?.arquivo ?? null, duracao: v?.duracao || a.duracao || '',
            topicos: [], materiais: v?.materiais.length ? v.materiais : a.materiais ?? [], links: v?.links.length ? v.links : a.links ?? [],
            publicado: true, nivel: 'Iniciante',
          }
        }),
      }],
    })),
  }
}

/** Confere e completa uma grade vinda do banco (campos que faltem viram o padrão). */
export function normalizarGrade(bruta: unknown): GradeAulas | null {
  const g = bruta as GradeAulas | null
  if (!g || !Array.isArray(g.modulos)) return null
  const txt = (v: unknown) => (typeof v === 'string' ? v : '')
  const cursos: CursoGrade[] = (Array.isArray(g.cursos) ? g.cursos : []).filter((c) => c && txt(c.id)).map((c) => {
    const a = (c.acesso ?? {}) as Partial<AcessoDoCurso>
    const modo: ModoDoCurso = a.modo === 'planos' || a.modo === 'compra' ? a.modo : 'todos'
    return {
      id: txt(c.id), titulo: txt(c.titulo), descricao: txt(c.descricao), sobre: txt(c.sobre), capa: txt(c.capa), capaArquivo: c.capaArquivo ?? null,
      cor: txt(c.cor) || CORES_DA_MARCA[0], selo: txt(c.selo), publicado: c.publicado !== false, liberarEm: c.liberarEm || null,
      acesso: {
        modo, planos: Array.isArray(a.planos) ? a.planos.filter((p) => p && p.id) : [],
        cakto: Array.isArray(a.cakto) ? a.cakto.map((x) => txt(x).trim()).filter(Boolean) : [],
        checkout: txt(a.checkout).trim(), vitalicio: a.vitalicio !== false, vitrine: a.vitrine !== false,
      },
    }
  })
  if (!cursos.length) cursos.push(cursoPadrao())
  const existe = new Set(cursos.map((c) => c.id))
  const videoDeBoasVindas = txt((g as { boasVindas?: { video?: unknown } }).boasVindas?.video).trim()
  return {
    versao: 1,
    ...(videoDeBoasVindas ? { boasVindas: { video: videoDeBoasVindas } } : {}),
    cursos,
    modulos: g.modulos.filter(Boolean).map((m) => ({
      id: txt(m.id), curso: existe.has(txt(m.curso)) ? txt(m.curso) : cursos[0].id, titulo: txt(m.titulo), chamada: txt(m.chamada), descricao: txt(m.descricao), cor: txt(m.cor) || CORES_DA_MARCA[0],
      publicado: m.publicado !== false, liberarEm: m.liberarEm || null, planos: Array.isArray(m.planos) ? m.planos : [],
      assuntos: (Array.isArray(m.assuntos) ? m.assuntos : []).filter(Boolean).map((s) => ({
        id: txt(s.id), titulo: txt(s.titulo), descricao: txt(s.descricao),
        aulas: (Array.isArray(s.aulas) ? s.aulas : []).filter(Boolean).map((a) => ({
          id: txt(a.id), titulo: txt(a.titulo), descricao: txt(a.descricao), video: txt(a.video), arquivo: a.arquivo ?? null,
          duracao: txt(a.duracao), capa: txt(a.capa), capaArquivo: a.capaArquivo ?? null,
          topicos: (Array.isArray(a.topicos) ? a.topicos : []).filter((t) => t && t.titulo).map((t) => ({ id: txt(t.id) || Math.random().toString(36).slice(2, 8), titulo: txt(t.titulo), tempo: txt(t.tempo) })),
          materiais: Array.isArray(a.materiais) ? a.materiais.filter((x) => x && x.url && x.nome) : [],
          links: Array.isArray(a.links) ? a.links.filter((x) => x && x.url && x.nome) : [],
          publicado: a.publicado !== false, liberarEm: a.liberarEm || null, planos: Array.isArray(a.planos) ? a.planos : [], nivel: txt(a.nivel),
          repetir: a.repetir === true || undefined,
          vertical: a.vertical === true || undefined,
        })),
      })),
    })),
  }
}

/* ------------------------------------------ da grade para a sala de aula */

export interface ContextoDaSala {
  /** O plano da pessoa (clientes.plano_id). */
  plano?: string | null
  /** Os cursos comprados (teeds_meus_cursos). undefined = ainda não sabido: curso vendido conta como trancado. */
  meusCursos?: ReadonlySet<string> | null
  /** Admin vê as aulas de qualquer plano e antes da data de liberação. */
  admin?: boolean | null
  agora?: number
}

/**
 * Os módulos que a sala de aula mostra: só o que está publicado; aula de
 * outro plano ou com data futura aparece trancada, com o motivo no cartão.
 */
export interface CursoNaSala {
  id: string; titulo: string; descricao: string; sobre: string; capa?: string; cor: string; selo?: string
  /** Pode assistir. */
  liberado: boolean
  /** Por que não pode (para o cartão e a janela). */
  motivo: string | null
  /** Vendido à parte e ainda não comprado: o botão de compra. */
  checkout: string | null
  modo: ModoDoCurso
  modulos: Modulo[]
  aulas: number
}

/** O acesso ao curso: null = liberado; senão, o motivo. */
function motivoDoCurso(c: CursoGrade, ctx: ContextoDaSala, agora: number): string | null {
  if (ctx.admin) return null
  if (c.liberarEm && Date.parse(c.liberarEm) > agora) return `Disponível em ${dataCurta(c.liberarEm)}`
  // comprou na Cakto ou o admin liberou à mão: vale em qualquer regra
  if (c.acesso.modo !== 'todos' && ctx.meusCursos?.has(c.id)) return null
  const temPlano = !!ctx.plano && c.acesso.planos.some((p) => p.id === ctx.plano)
  if (c.acesso.modo === 'planos' && c.acesso.planos.length && !temPlano) return `Disponível no plano ${c.acesso.planos.map((p) => p.nome).join(' ou ')}`
  if (c.acesso.modo === 'compra' && !temPlano && !ctx.meusCursos?.has(c.id)) return 'Curso vendido à parte'
  return null
}

/**
 * Os cursos que a sala mostra, na ordem da grade. Curso oculto não aparece;
 * curso sem acesso aparece trancado (ou some, se `vitrine` estiver desligada),
 * com as aulas listadas mas sem tocar.
 */
export function cursosParaSala(grade: GradeAulas, ctx: ContextoDaSala = {}): CursoNaSala[] {
  const agora = ctx.agora ?? Date.now()
  return (grade.cursos ?? []).filter((c) => c.publicado).map((c) => {
    const motivo = motivoDoCurso(c, ctx, agora)
    const modulos = modulosParaSala(grade, ctx, c.id)
    return {
      id: c.id, titulo: c.titulo, descricao: c.descricao, sobre: c.sobre ?? '', capa: c.capa || undefined, cor: c.cor, selo: c.selo || undefined,
      liberado: !motivo, motivo, checkout: motivo && c.acesso.modo === 'compra' && c.acesso.checkout ? c.acesso.checkout : null, modo: c.acesso.modo,
      modulos, aulas: modulos.reduce((n, m) => n + m.aulas.length, 0),
    }
  }).filter((c) => c.aulas > 0 && (c.liberado || ctx.admin || (grade.cursos ?? []).find((x) => x.id === c.id)?.acesso.vitrine !== false))
}

export function modulosParaSala(grade: GradeAulas, ctx: ContextoDaSala = {}, cursoId?: string): Modulo[] {
  const agora = ctx.agora ?? Date.now()
  // o curso vale por cima do módulo e da aula: curso oculto some; curso sem acesso tranca tudo
  const cursos = new Map((grade.cursos ?? []).map((c) => [c.id, c]))
  const doCurso = (id?: string) => { const c = id ? cursos.get(id) : undefined; return c ? motivoDoCurso(c, ctx, agora) : null }
  const cursoVisivel = (id?: string) => { const c = id ? cursos.get(id) : undefined; return !c || (c.publicado && (c.acesso.vitrine || !motivoDoCurso(c, ctx, agora))) }
  const motivo = (liberarEm?: string | null, planos?: PlanoEscolhido[]): string | null => {
    if (ctx.admin) return null
    if (liberarEm && Date.parse(liberarEm) > agora) return `Disponível em ${dataCurta(liberarEm)}`
    if (planos?.length && !planos.some((p) => p.id === ctx.plano)) return `Disponível no plano ${planos.map((p) => p.nome).join(' ou ')}`
    return null
  }
  return grade.modulos.filter((m) => m.publicado && (cursoId ? m.curso === cursoId : cursoVisivel(m.curso))).map((m) => {
    const doModulo = doCurso(m.curso) ?? motivo(m.liberarEm, m.planos)
    const assuntos = m.assuntos.map((s) => ({ ...s, aulas: s.aulas.filter((a) => a.publicado) })).filter((s) => s.aulas.length)
    return {
      id: m.id, titulo: m.titulo, chamada: m.chamada, descricao: m.descricao, cor: m.cor, daGrade: true,
      assuntos: assuntos.map((s) => ({ id: s.id, titulo: s.titulo, descricao: s.descricao })),
      aulas: assuntos.flatMap((s) => s.aulas.map((a) => ({
        id: a.id, titulo: a.titulo, descricao: a.descricao, video: a.video, duracao: a.duracao,
        materiais: a.materiais, links: a.links, capa: a.capa || undefined, nivel: a.nivel || undefined, repetir: a.repetir || undefined, vertical: a.vertical || undefined,
        topicos: a.topicos.map((t) => ({ titulo: t.titulo, tempo: t.tempo || undefined })),
        assunto: { id: s.id, titulo: s.titulo },
        bloqueio: doModulo ?? motivo(a.liberarEm, a.planos),
      }))),
    }
  }).filter((m) => m.aulas.length)
}

/* ----------------------------------------------------------------- banco */

function cabecalhos(token: string): Record<string, string> {
  return { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}
async function rest<T>(caminho: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, { ...init, headers: { ...cabecalhos(token), ...(init.headers as Record<string, string> ?? {}) } })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(corpo?.message || `Erro ${res.status} ao falar com o banco`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json().catch(() => undefined)) as T
}

/** A grade publicada da marca (null = ainda não há: vale o catálogo do código). */
export async function lerGradePublicada(sessao: SessaoTeeds | null | undefined, marca: string = MARCA.id): Promise<GradeAulas | null> {
  if (!sessao || !autenticacaoConfigurada()) return null
  try {
    const g = await rest<unknown>('/rpc/teeds_aulas_grade', sessao.token, { method: 'POST', body: JSON.stringify({ p_marca: marca }) })
    return normalizarGrade(g)
  } catch (e) {
    console.warn('[aulas] não li a grade publicada:', (e as Error).message)
    return null
  }
}

export interface GradeDoAdmin { rascunho: GradeAulas | null; rascunhoEm: string | null; publicada: GradeAulas | null; publicadaEm: string | null }
export async function lerGradeDoAdmin(sessao: SessaoTeeds, marca: string = MARCA.id): Promise<GradeDoAdmin> {
  const [l] = await rest<any[]>(`/aulas_grade?select=*&marca=eq.${encodeURIComponent(marca)}`, sessao.token)
  return { rascunho: normalizarGrade(l?.rascunho), rascunhoEm: l?.rascunho_em ?? null, publicada: normalizarGrade(l?.publicada), publicadaEm: l?.publicada_em ?? null }
}

/** Guarda o rascunho (o aluno não vê). */
export async function salvarRascunho(sessao: SessaoTeeds, grade: GradeAulas, marca: string = MARCA.id): Promise<string> {
  const em = new Date().toISOString()
  await rest('/aulas_grade?on_conflict=marca', sessao.token, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ marca, rascunho: grade, rascunho_em: em, rascunho_por: sessao.usuario.id }),
  })
  return em
}

/** Publica: a sala passa a mostrar esta grade, e a versão fica guardada. */
export async function publicarGrade(sessao: SessaoTeeds, grade: GradeAulas, nota: string, marca: string = MARCA.id): Promise<string> {
  return rest<string>('/rpc/teeds_aulas_publicar', sessao.token, { method: 'POST', body: JSON.stringify({ p_marca: marca, p_grade: grade, p_nota: nota || null }) })
}

export interface VersaoDaGrade { id: number; nota: string | null; criadaEm: string; aulas: number; modulos: number; cursos: number; grade: GradeAulas }
export async function versoesDaGrade(sessao: SessaoTeeds, marca: string = MARCA.id): Promise<VersaoDaGrade[]> {
  const linhas = await rest<any[]>(`/aulas_grade_versoes?select=id,nota,criada_em,grade&marca=eq.${encodeURIComponent(marca)}&order=criada_em.desc&limit=30`, sessao.token)
  return (linhas ?? []).map((l) => { const g = normalizarGrade(l.grade) ?? { versao: 1 as const, modulos: [] }; return { id: l.id, nota: l.nota, criadaEm: l.criada_em, grade: g, aulas: contarAulas(g), modulos: g.modulos.length, cursos: g.cursos?.length ?? 1 } })
}

/* --------------------------------------------------------------- cursos */

/** Os cursos que a pessoa comprou (ou que o admin liberou à mão). Falha = nenhum. */
export async function lerMeusCursos(sessao: SessaoTeeds | null | undefined, marca: string = MARCA.id): Promise<Set<string>> {
  if (!sessao || !autenticacaoConfigurada()) return new Set()
  try {
    const l = await rest<string[]>('/rpc/teeds_meus_cursos', sessao.token, { method: 'POST', body: JSON.stringify({ p_marca: marca }) })
    return new Set(Array.isArray(l) ? l : [])
  } catch { return new Set() }
}
let cacheCursos: { chave: string; promessa: Promise<Set<string>> } | null = null
export function meusCursosEmCache(sessao: SessaoTeeds | null | undefined): Promise<Set<string>> {
  const chave = `${MARCA.id}:${sessao?.usuario.id ?? ''}`
  if (!cacheCursos || cacheCursos.chave !== chave) cacheCursos = { chave, promessa: lerMeusCursos(sessao) }
  return cacheCursos.promessa
}

export interface AlunoDoCurso { userId: string; nome: string; email: string; origem: string; concedidoEm: string; expiraEm: string | null; ativo: boolean }
export async function alunosDoCurso(sessao: SessaoTeeds, cursoId: string, marca: string = MARCA.id): Promise<AlunoDoCurso[]> {
  const l = await rest<any[]>('/rpc/teeds_curso_alunos', sessao.token, { method: 'POST', body: JSON.stringify({ p_marca: marca, p_curso: cursoId }) })
  return (Array.isArray(l) ? l : []).map((x) => ({ userId: x.user_id, nome: x.nome ?? '', email: x.email ?? '', origem: x.origem ?? '', concedidoEm: x.concedido_em, expiraEm: x.expira_em, ativo: Boolean(x.ativo) }))
}
/** Libera (ou tira) o curso de alguém pelo e-mail. dias nulo = vitalício. */
export async function liberarCurso(sessao: SessaoTeeds, curso: { id: string; titulo: string }, email: string, liberar: boolean, dias: number | null, marca: string = MARCA.id): Promise<string> {
  const r = await rest<{ ok?: boolean; nome?: string; erro?: string }>('/rpc/teeds_curso_liberar', sessao.token, {
    method: 'POST', body: JSON.stringify({ p_marca: marca, p_curso: curso.id, p_titulo: curso.titulo, p_email: email, p_liberar: liberar, p_dias: dias }),
  })
  if (r?.erro) throw new Error(r.erro)
  return r?.nome ?? email
}

/* ---------------------------------------------------------------- capas */

/**
 * Envia a capa de uma aula: a imagem é reduzida no navegador (no máximo
 * 1200 px no lado maior, WebP) e vai para o bucket `materiais`, na pasta da
 * marca. Devolve a URL pública e o caminho (para apagar depois).
 */
export async function enviarCapa(sessao: SessaoTeeds, aulaId: string, fonte: Blob, marca: string = MARCA.id): Promise<{ url: string; caminho: string }> {
  const imagem = await createImageBitmap(fonte)
  const escala = Math.min(1, 1200 / Math.max(imagem.width, imagem.height))
  const tela = document.createElement('canvas')
  tela.width = Math.round(imagem.width * escala); tela.height = Math.round(imagem.height * escala)
  tela.getContext('2d')!.drawImage(imagem, 0, 0, tela.width, tela.height)
  const blob = await new Promise<Blob>((ok, falha) => tela.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui converter a imagem.'))), 'image/webp', 0.86))
  const caminho = `${marca}/capas/${aulaId}-${Date.now().toString(36)}.webp`
  const alvo = caminho.split('/').map(encodeURIComponent).join('/')
  const res = await fetch(`${SUPABASE.url}/storage/v1/object/materiais/${alvo}`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'image/webp', 'x-upsert': 'true' }, body: blob,
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || `Erro ${res.status} ao enviar a capa`)
  return { url: `${SUPABASE.url}/storage/v1/object/public/materiais/${alvo}`, caminho }
}

/** Um quadro do vídeo como imagem (para usar de capa). Só funciona com MP4 que permita leitura (o nosso bucket permite). */
export function quadroDoVideo(video: HTMLVideoElement): Promise<Blob> {
  const tela = document.createElement('canvas')
  tela.width = video.videoWidth; tela.height = video.videoHeight
  tela.getContext('2d')!.drawImage(video, 0, 0)
  return new Promise((ok, falha) => {
    try { tela.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui capturar o quadro.'))), 'image/jpeg', 0.92) }
    catch { falha(new Error('Este vídeo não permite capturar o quadro. Envie uma imagem.')) }
  })
}

/* ------------------------------------------------- a sala lê a grade */

let cache: { chave: string; promessa: Promise<GradeAulas | null> } | null = null
/** A grade publicada, lida uma vez por sessão (a sala, o início e a ficha usam a mesma). */
export function gradePublicadaEmCache(sessao: SessaoTeeds | null | undefined): Promise<GradeAulas | null> {
  const chave = `${MARCA.id}:${sessao?.usuario.id ?? ''}`
  if (!cache || cache.chave !== chave) cache = { chave, promessa: lerGradePublicada(sessao) }
  return cache.promessa
}
export const esquecerGradeEmCache = () => { cache = null; cacheCursos = null }

/**
 * Os módulos em uso fora da sala (início, ficha do cliente, insights): lê a
 * grade publicada uma vez e redesenha quando ela chega ou muda.
 */
export function useModulosEmUso(sessao: SessaoTeeds | null | undefined, ctx: ContextoDaSala = {}): Modulo[] {
  const [, redesenhar] = useState(0)
  useEffect(() => aoMudarModulos(() => redesenhar((n) => n + 1)), [])
  useEffect(() => {
    let vivo = true
    void Promise.all([gradePublicadaEmCache(sessao), meusCursosEmCache(sessao)]).then(([g, meus]) => { if (vivo && g) usarModulosDaGrade(modulosParaSala(g, { ...ctx, meusCursos: meus })) })
    return () => { vivo = false }
  }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  return modulosEmUso()
}
