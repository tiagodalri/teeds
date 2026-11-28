/**
 * A central de dados das aulas (27/11/2026).
 *
 * Tiago: "um painel pra ver todas as aulas da plataforma listada e a % de alunos que
 * assistiram cada uma, com possibilidade de clicar e ver os detalhes, alunos listados,
 * quem viu tudo, quem não viu, tudo com barrinhas".
 *
 * Três fontes, todas já existentes ou de leitura:
 *  - a grade publicada (a ordem e os nomes das aulas);
 *  - `teeds_aulas_controle`: quem abriu cada aula, quanto assistiu de fato e até onde chegou;
 *  - `teeds_aulas_alunos` (nova): todos os alunos ativos, para saber quem NÃO abriu.
 *
 * "Assistiu de fato" = segundos com o vídeo tocando ÷ duração (avançar não conta).
 * Aluno que não vê a aula (plano, parceiro, estreia futura) não entra na conta dela.
 */

import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import { MODULOS, todasAsAulas } from './aulas'
import { aulaVisivelParaOParceiro, lerGradePublicada, type GradeAulas } from './gradeAulas'
import { controleDasAulas, fracaoAssistida, type AssistiuAula } from './aulasVideos'

/* ---------------------------------------------------------------- tipos */

export interface AlunoDaBase {
  userId: string
  nome: string
  email: string
  planoId: string
  plano: string
  parceiro: string | null
  foto: string | null
  criadoEm: string
  vistoEm: string | null
  /** Cursos liberados à parte (compra na Cakto ou liberação à mão). */
  cursos: string[]
}

export interface AulaNaCentral {
  id: string
  titulo: string
  numero: number
  modulo: { id: string; titulo: string; cor: string }
  duracao: string
  /**
   * As travas de plano que valem juntas (módulo e aula): o aluno precisa estar em TODAS as listas.
   * Vazio = todos os planos.
   */
  planos: string[][]
  /** A regra do curso (só quando não é "todos"): quem tem o curso liberado ou um destes planos. */
  curso: { id: string; planos: string[]; soComCompra: boolean } | null
  /** Estreia ainda não chegou: fica fora das contas da formação. */
  estreiaEm: string | null
  /** O pop-up de boas-vindas: aparece na lista, mas não conta na formação. */
  extra?: boolean
}

export type Situacao = 'concluiu' | 'parou' | 'nao'

export interface LinhaDoAluno {
  aluno: AlunoDaBase
  situacao: Situacao
  progresso: AssistiuAula | null
  /** 0 a 1: quanto assistiu de fato. */
  fracao: number
}

export interface NumerosDaAula {
  aula: AulaNaCentral
  elegiveis: number
  abriram: number
  concluiram: number
  /** Média do "assistiu de fato" entre quem abriu (0 a 1). */
  mediaAssistida: number
  segundos: number
  aberturas: number
}

export interface NumerosDoAluno {
  aluno: AlunoDaBase
  /** Aulas da formação que este aluno vê. */
  total: number
  iniciadas: number
  concluidas: number
  /** Soma do "assistiu de fato" ÷ total (0 a 1). */
  consumo: number
  segundos: number
  ultimaVez: string | null
  ultimaAula: string | null
}

export interface DadosDasAulas {
  aulas: AulaNaCentral[]
  alunos: AlunoDaBase[]
  progresso: AssistiuAula[]
  /** progresso[userId][aulaId] */
  mapa: Map<string, Map<string, AssistiuAula>>
  lidoEm: number
}

/* ----------------------------------------------------------------- banco */

export async function alunosDasAulas(sessao: SessaoTeeds, marca: string = MARCA.id): Promise<AlunoDaBase[]> {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_aulas_alunos`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca }),
  })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(corpo?.message || `Erro ${res.status} ao ler os alunos`)
  }
  const linhas = (await res.json().catch(() => [])) as any[]
  return (linhas ?? []).map((l) => ({
    userId: l.user_id, nome: l.nome ?? '', email: l.email ?? '', planoId: l.plano_id ?? '', plano: l.plano ?? '',
    parceiro: l.parceiro || null, foto: l.foto_url || null, criadoEm: l.criado_em, vistoEm: l.visto_em || null,
    cursos: Array.isArray(l.cursos) ? l.cursos : [],
  }))
}

/** As aulas na ordem da grade publicada (sem grade publicada: o catálogo do código). */
export function aulasDaGrade(grade: GradeAulas | null, agora = Date.now()): AulaNaCentral[] {
  const lista: AulaNaCentral[] = [{
    id: 'boas-vindas', titulo: 'Vídeo de boas-vindas (pop-up do 1º acesso)', numero: 0,
    modulo: { id: '__boas-vindas', titulo: 'Boas-vindas', cor: '#5B7C9D' }, duracao: '', planos: [], curso: null, estreiaEm: null, extra: true,
  }]
  const futura = (iso?: string | null) => (iso && Date.parse(iso) > agora ? iso : null)
  if (grade) {
    const cursos = new Map((grade.cursos ?? []).map((c) => [c.id, c]))
    let n = 1
    for (const m of grade.modulos) {
      const c = cursos.get(m.curso ?? "")
      if (!m.publicado || (c && !c.publicado)) continue
      // mesma regra da sala (motivoDoCurso): curso "planos" sem planos escolhidos = todos
      const regra = c && c.acesso.modo !== 'todos' && (c.acesso.modo === 'compra' || c.acesso.planos.length)
        ? { id: c.id, planos: c.acesso.planos.map((p) => p.id), soComCompra: c.acesso.modo === 'compra' } : null
      const doModulo = m.planos?.length ? [m.planos.map((p) => p.id)] : []
      for (const s of m.assuntos) for (const a of s.aulas) {
        if (!a.publicado) continue
        const planos = a.planos?.length ? [...doModulo, a.planos.map((p) => p.id)] : doModulo
        lista.push({
          id: a.id, titulo: a.titulo, numero: n++, modulo: { id: m.id, titulo: m.titulo, cor: m.cor }, duracao: a.duracao,
          planos, curso: regra, estreiaEm: futura(a.liberarEm) ?? futura(m.liberarEm) ?? futura(c?.liberarEm),
        })
      }
    }
    return lista
  }
  for (const a of todasAsAulas({}, MODULOS)) {
    lista.push({ id: a.id, titulo: a.titulo, numero: a.numero, modulo: { id: a.modulo.id, titulo: a.modulo.titulo, cor: a.modulo.cor }, duracao: a.duracao, planos: [], curso: null, estreiaEm: null })
  }
  return lista
}

export async function lerDadosDasAulas(sessao: SessaoTeeds, marca: string = MARCA.id): Promise<DadosDasAulas> {
  const [grade, alunos, controle] = await Promise.all([lerGradePublicada(sessao, marca), alunosDasAulas(sessao, marca), controleDasAulas(sessao, marca)])
  const daBase = new Set(alunos.map((a) => a.userId))
  // só alunos ativos (a equipe e quem saiu ficam fora: senão as porcentagens passam de 100%)
  const progresso = controle.filter((c) => daBase.has(c.userId))
  const mapa = new Map<string, Map<string, AssistiuAula>>()
  for (const p of progresso) {
    let m = mapa.get(p.userId)
    if (!m) mapa.set(p.userId, (m = new Map()))
    m.set(p.aulaId, p)
  }
  return { aulas: aulasDaGrade(grade), alunos, progresso, mapa, lidoEm: Date.now() }
}

/* ---------------------------------------------------------------- contas */

/** Quanto assistiu de fato (0 a 1). Sem a duração do vídeo, vale até onde chegou. */
export const fracaoDe = (p: AssistiuAula | null | undefined) => (!p ? 0 : p.duracaoSeg > 0 ? fracaoAssistida(p) : Math.min(1, p.posicaoMax || 0))

export const situacaoDe = (p: AssistiuAula | null | undefined): Situacao => (!p ? 'nao' : p.concluida ? 'concluiu' : 'parou')

/** O aluno vê esta aula? */
export function aulaParaOAluno(aula: AulaNaCentral, aluno: AlunoDaBase): boolean {
  if (aula.curso && !aluno.cursos.includes(aula.curso.id) && !aula.curso.planos.includes(aluno.planoId)) return false
  if (aula.planos.some((lista) => !lista.includes(aluno.planoId))) return false
  return aulaVisivelParaOParceiro(aula.id, aluno.parceiro)
}

/** As aulas que contam na formação (sem o pop-up e sem as estreias que ainda não chegaram). */
export const aulasDaFormacao = (aulas: AulaNaCentral[]) => aulas.filter((a) => !a.extra && !a.estreiaEm)

export function numerosDaAula(aula: AulaNaCentral, alunos: AlunoDaBase[], mapa: DadosDasAulas['mapa']): NumerosDaAula {
  let elegiveis = 0, abriram = 0, concluiram = 0, soma = 0, segundos = 0, aberturas = 0
  for (const al of alunos) {
    if (!aulaParaOAluno(aula, al)) continue
    elegiveis++
    const p = mapa.get(al.userId)?.get(aula.id)
    if (!p) continue
    abriram++
    if (p.concluida) concluiram++
    soma += fracaoDe(p)
    segundos += p.segundos
    aberturas += p.aberturas
  }
  return { aula, elegiveis, abriram, concluiram, mediaAssistida: abriram ? soma / abriram : 0, segundos, aberturas }
}

export function linhasDaAula(aula: AulaNaCentral, alunos: AlunoDaBase[], mapa: DadosDasAulas['mapa']): LinhaDoAluno[] {
  return alunos.filter((al) => aulaParaOAluno(aula, al)).map((al) => {
    const p = mapa.get(al.userId)?.get(aula.id) ?? null
    return { aluno: al, situacao: situacaoDe(p), progresso: p, fracao: fracaoDe(p) }
  })
}

export function numerosDoAluno(aluno: AlunoDaBase, formacao: AulaNaCentral[], mapa: DadosDasAulas['mapa']): NumerosDoAluno {
  const meus = mapa.get(aluno.userId)
  let total = 0, iniciadas = 0, concluidas = 0, soma = 0
  for (const a of formacao) {
    if (!aulaParaOAluno(a, aluno)) continue
    total++
    const p = meus?.get(a.id)
    if (!p) continue
    iniciadas++
    if (p.concluida) concluidas++
    soma += fracaoDe(p)
  }
  let segundos = 0, ultimaVez: string | null = null, ultimaAula: string | null = null
  for (const p of meus?.values() ?? []) {
    segundos += p.segundos
    if (!ultimaVez || p.ultimaVez > ultimaVez) { ultimaVez = p.ultimaVez; ultimaAula = p.aulaId }
  }
  return { aluno, total, iniciadas, concluidas, consumo: total ? soma / total : 0, segundos, ultimaVez, ultimaAula }
}

/** "Até onde chegam": para cada ponto do vídeo (0, 5, 10… 100%), quantos de quem abriu chegaram lá. */
export function curvaDeRetencao(linhas: LinhaDoAluno[], passos = 20): number[] {
  const abertas = linhas.filter((l) => l.progresso)
  if (!abertas.length) return []
  return Array.from({ length: passos + 1 }, (_, i) => {
    const x = i / passos
    return abertas.filter((l) => (l.progresso!.concluida ? 1 : l.progresso!.posicaoMax) >= x - 1e-6).length / abertas.length
  })
}

/** Faixas do "assistiu de fato" entre quem abriu. */
export const FAIXAS = [
  { ate: 0.25, nome: 'Menos de 25%' },
  { ate: 0.5, nome: '25 a 50%' },
  { ate: 0.75, nome: '50 a 75%' },
  { ate: 0.95, nome: '75 a 95%' },
  { ate: Infinity, nome: '95% ou mais' },
]
export function faixasDaAula(linhas: LinhaDoAluno[]): number[] {
  const n = FAIXAS.map(() => 0)
  for (const l of linhas) if (l.progresso) n[FAIXAS.findIndex((f) => l.fracao < f.ate)]++
  return n
}

/* ------------------------------------------------------------- planilha */

const celula = (v: unknown) => { const t = String(v ?? ''); return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
/** Baixa um CSV (separado por ponto e vírgula, abre direto no Excel em português). */
export function baixarPlanilha(nome: string, cabecalho: string[], linhas: unknown[][]) {
  const texto = '﻿' + [cabecalho, ...linhas].map((l) => l.map(celula).join(';')).join('\n')
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
