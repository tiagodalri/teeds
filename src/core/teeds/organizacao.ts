/**
 * Central de organização da equipe (Administração > Organização), 23/10/2026.
 *
 * Tarefas com responsável, prazo, prioridade, área, checklist e comentários,
 * e os marcos do calendário (lançamento, lives, início do tráfego...). Só os
 * administradores da marca enxergam (RLS). As mudanças chegam ao vivo pelo
 * Realtime, então o que o Victor move no quadro aparece na tela do Tiago.
 *
 * A tela fala com `OrgApi`: o site usa o banco (`orgDoBanco`); o laboratório
 * usa dados de mentira em memória.
 */
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { assinarMudancas } from './realtime'
import { MARCA } from '../../marca'

export type Area = 'marketing' | 'conteudo' | 'trafego' | 'comercial' | 'desenvolvimento' | 'suporte' | 'geral'
export type Status = 'a_fazer' | 'fazendo' | 'revisao' | 'feito'
export type Prioridade = 'baixa' | 'media' | 'alta' | 'urgente'
export type TipoMarco = 'lancamento' | 'live' | 'trafego' | 'captacao' | 'campanha' | 'reuniao' | 'feriado' | 'outro'

export interface ItemChecklist { texto: string; feito: boolean }

export interface Tarefa {
  id: string
  titulo: string
  descricao: string
  area: Area
  status: Status
  prioridade: Prioridade
  responsavel: string | null
  /** AAAA-MM-DD */
  prazo: string | null
  checklist: ItemChecklist[]
  ordem: number
  criadoPor: string | null
  criadoEm: string
  atualizadoEm: string
  concluidoEm: string | null
}

export interface Marco {
  id: string
  titulo: string
  descricao: string
  /** AAAA-MM-DD */
  data: string
  /** HH:MM */
  hora: string | null
  tipo: TipoMarco
}

export interface Comentario { id: string; tarefaId: string; autor: string | null; texto: string; criadoEm: string }
export interface Pessoa { id: string; nome: string; email: string }

export const AREAS: Record<Area, { nome: string; cor: string }> = {
  marketing: { nome: 'Marketing', cor: '#A78BFA' },
  conteudo: { nome: 'Conteúdo', cor: '#F472B6' },
  trafego: { nome: 'Tráfego', cor: '#38BDF8' },
  comercial: { nome: 'Comercial', cor: '#34D399' },
  desenvolvimento: { nome: 'Desenvolvimento', cor: '#FBBF24' },
  suporte: { nome: 'Suporte', cor: '#FB923C' },
  geral: { nome: 'Geral', cor: '#94A3B8' },
}
export const STATUS: Record<Status, string> = { a_fazer: 'A fazer', fazendo: 'Fazendo', revisao: 'Em revisão', feito: 'Feito' }
export const PRIORIDADES: Record<Prioridade, { nome: string; peso: number }> = {
  urgente: { nome: 'Urgente', peso: 0 }, alta: { nome: 'Alta', peso: 1 }, media: { nome: 'Média', peso: 2 }, baixa: { nome: 'Baixa', peso: 3 },
}
export const MARCOS: Record<TipoMarco, { nome: string; cor: string }> = {
  lancamento: { nome: 'Lançamento', cor: '#D4A64A' },
  live: { nome: 'Live', cor: '#F43F5E' },
  trafego: { nome: 'Tráfego', cor: '#38BDF8' },
  captacao: { nome: 'Captação', cor: '#A78BFA' },
  campanha: { nome: 'Campanha', cor: '#F472B6' },
  reuniao: { nome: 'Reunião', cor: '#94A3B8' },
  feriado: { nome: 'Feriado', cor: '#64748B' },
  outro: { nome: 'Outro', cor: '#7C8BA1' },
}

export type NovaTarefa = Omit<Tarefa, 'id' | 'criadoPor' | 'criadoEm' | 'atualizadoEm' | 'concluidoEm' | 'ordem'> & { ordem?: number }
export type NovoMarco = Omit<Marco, 'id'>

export interface Dados { tarefas: Tarefa[]; marcos: Marco[]; equipe: Pessoa[]; contagemComentarios: Record<string, number> }

export type Mudanca =
  | { tipo: 'tarefa'; acao: 'salvou'; item: Tarefa } | { tipo: 'tarefa'; acao: 'apagou'; id: string }
  | { tipo: 'marco'; acao: 'salvou'; item: Marco } | { tipo: 'marco'; acao: 'apagou'; id: string }
  | { tipo: 'comentario'; acao: 'salvou'; item: Comentario } | { tipo: 'comentario'; acao: 'apagou'; id: string; tarefaId?: string }

export interface OrgApi {
  euId: string
  carregar(): Promise<Dados>
  criarTarefa(t: NovaTarefa): Promise<Tarefa>
  alterarTarefa(id: string, campos: Partial<NovaTarefa>): Promise<Tarefa>
  apagarTarefa(id: string): Promise<void>
  criarMarco(m: NovoMarco): Promise<Marco>
  alterarMarco(id: string, campos: Partial<NovoMarco>): Promise<Marco>
  apagarMarco(id: string): Promise<void>
  comentarios(tarefaId: string): Promise<Comentario[]>
  comentar(tarefaId: string, texto: string): Promise<Comentario>
  apagarComentario(id: string): Promise<void>
  /** Mudanças feitas pelos outros, ao vivo. Devolve como parar. */
  acompanhar(aoMudar: (m: Mudanca) => void): () => void
}

// ------------------------------------------------------------ conversão
const daTarefa = (l: any): Tarefa => ({
  id: l.id, titulo: l.titulo ?? '', descricao: l.descricao ?? '', area: l.area, status: l.status, prioridade: l.prioridade,
  responsavel: l.responsavel ?? null, prazo: l.prazo ?? null, checklist: Array.isArray(l.checklist) ? l.checklist : [],
  ordem: Number(l.ordem ?? 0), criadoPor: l.criado_por ?? null, criadoEm: l.criado_em, atualizadoEm: l.atualizado_em,
  concluidoEm: l.concluido_em ?? null,
})
const paraTarefa = (t: Partial<NovaTarefa>) => {
  const o: Record<string, unknown> = {}
  if (t.titulo !== undefined) o.titulo = t.titulo.trim()
  if (t.descricao !== undefined) o.descricao = t.descricao.trim() || null
  if (t.area !== undefined) o.area = t.area
  if (t.status !== undefined) o.status = t.status
  if (t.prioridade !== undefined) o.prioridade = t.prioridade
  if (t.responsavel !== undefined) o.responsavel = t.responsavel
  if (t.prazo !== undefined) o.prazo = t.prazo
  if (t.checklist !== undefined) o.checklist = t.checklist
  if (t.ordem !== undefined) o.ordem = t.ordem
  return o
}
const daHora = (h: unknown) => (typeof h === 'string' && h ? h.slice(0, 5) : null)
const doMarco = (l: any): Marco => ({ id: l.id, titulo: l.titulo ?? '', descricao: l.descricao ?? '', data: l.data, hora: daHora(l.hora), tipo: l.tipo })
const paraMarco = (m: Partial<NovoMarco>) => {
  const o: Record<string, unknown> = {}
  if (m.titulo !== undefined) o.titulo = m.titulo.trim()
  if (m.descricao !== undefined) o.descricao = m.descricao.trim() || null
  if (m.data !== undefined) o.data = m.data
  if (m.hora !== undefined) o.hora = m.hora || null
  if (m.tipo !== undefined) o.tipo = m.tipo
  return o
}
const doComentario = (l: any): Comentario => ({ id: l.id, tarefaId: l.tarefa_id, autor: l.autor ?? null, texto: l.texto ?? '', criadoEm: l.criado_em })

// ------------------------------------------------------------ banco
export function orgDoBanco(sessao: SessaoTeeds, marca: string = MARCA.id): OrgApi {
  const rest = async <T>(caminho: string, init: RequestInit = {}): Promise<T> => {
    const r = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
      ...init,
      headers: {
        apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> ?? {}),
      },
    })
    if (!r.ok) {
      const c = await r.json().catch(() => ({}))
      throw new Error(String(c?.message || `Não consegui salvar agora (${r.status}). Tente de novo.`))
    }
    return r.status === 204 ? (undefined as T) : ((await r.json().catch(() => undefined)) as T)
  }
  const devolver = { Prefer: 'return=representation' }
  const um = <T>(l: T[] | undefined) => {
    if (!l || !l.length) throw new Error('Não encontrei esse item. Ele pode ter sido apagado por outra pessoa.')
    return l[0]
  }

  return {
    euId: sessao.usuario.id,
    async carregar() {
      const [tarefas, marcos, equipe, coms] = await Promise.all([
        rest<any[]>(`/org_tarefas?marca=eq.${marca}&select=*&order=ordem.asc`),
        rest<any[]>(`/org_marcos?marca=eq.${marca}&select=*&order=data.asc`),
        rest<any[]>('/rpc/org_equipe', { method: 'POST', body: JSON.stringify({ p_marca: marca }) }),
        rest<any[]>(`/org_comentarios?marca=eq.${marca}&select=tarefa_id`),
      ])
      const contagem: Record<string, number> = {}
      for (const c of coms ?? []) contagem[c.tarefa_id] = (contagem[c.tarefa_id] ?? 0) + 1
      return {
        tarefas: (tarefas ?? []).map(daTarefa),
        marcos: (marcos ?? []).map(doMarco),
        equipe: (equipe ?? []).map((p) => ({ id: p.user_id, nome: p.nome ?? '', email: p.email ?? '' })),
        contagemComentarios: contagem,
      }
    },
    async criarTarefa(t) {
      return daTarefa(um(await rest<any[]>('/org_tarefas', { method: 'POST', headers: devolver, body: JSON.stringify({ ...paraTarefa(t), marca }) })))
    },
    async alterarTarefa(id, campos) {
      return daTarefa(um(await rest<any[]>(`/org_tarefas?id=eq.${id}`, { method: 'PATCH', headers: devolver, body: JSON.stringify(paraTarefa(campos)) })))
    },
    async apagarTarefa(id) { await rest(`/org_tarefas?id=eq.${id}`, { method: 'DELETE' }) },
    async criarMarco(m) {
      return doMarco(um(await rest<any[]>('/org_marcos', { method: 'POST', headers: devolver, body: JSON.stringify({ ...paraMarco(m), marca }) })))
    },
    async alterarMarco(id, campos) {
      return doMarco(um(await rest<any[]>(`/org_marcos?id=eq.${id}`, { method: 'PATCH', headers: devolver, body: JSON.stringify(paraMarco(campos)) })))
    },
    async apagarMarco(id) { await rest(`/org_marcos?id=eq.${id}`, { method: 'DELETE' }) },
    async comentarios(tarefaId) {
      return ((await rest<any[]>(`/org_comentarios?tarefa_id=eq.${tarefaId}&select=*&order=criado_em.asc`)) ?? []).map(doComentario)
    },
    async comentar(tarefaId, texto) {
      return doComentario(um(await rest<any[]>('/org_comentarios', { method: 'POST', headers: devolver, body: JSON.stringify({ tarefa_id: tarefaId, marca, texto: texto.trim() }) })))
    },
    async apagarComentario(id) { await rest(`/org_comentarios?id=eq.${id}`, { method: 'DELETE' }) },
    acompanhar(aoMudar) {
      const a = assinarMudancas({
        token: sessao.token,
        canal: `org-${marca}-${Math.random().toString(36).slice(2, 8)}`,
        // O Realtime não filtra DELETE por coluna (só chega o id): as remoções
        // vêm sem filtro. Um id de outra marca simplesmente não acha nada aqui.
        tabelas: ['org_tarefas', 'org_marcos', 'org_comentarios'].flatMap((tabela) => [
          { tabela, filtro: `marca=eq.${marca}`, evento: 'INSERT' as const },
          { tabela, filtro: `marca=eq.${marca}`, evento: 'UPDATE' as const },
          { tabela, evento: 'DELETE' as const },
        ]),
        aoMudar: (m) => {
          const apagou = m.tipo === 'DELETE'
          const id = (apagou ? m.antiga?.id : m.linha?.id) as string | undefined
          if (!id) return
          if (m.tabela === 'org_tarefas') aoMudar(apagou ? { tipo: 'tarefa', acao: 'apagou', id } : { tipo: 'tarefa', acao: 'salvou', item: daTarefa(m.linha) })
          else if (m.tabela === 'org_marcos') aoMudar(apagou ? { tipo: 'marco', acao: 'apagou', id } : { tipo: 'marco', acao: 'salvou', item: doMarco(m.linha) })
          else if (m.tabela === 'org_comentarios') aoMudar(apagou ? { tipo: 'comentario', acao: 'apagou', id, tarefaId: m.antiga?.tarefa_id } : { tipo: 'comentario', acao: 'salvou', item: doComentario(m.linha) })
        },
      })
      return () => a.fechar()
    },
  }
}

// ------------------------------------------------------------ datas (sempre no fuso de quem está vendo)
export const hojeISO = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const somarDias = (iso: string, n: number) => { const [a, m, d] = iso.split('-').map(Number); return hojeISO(new Date(a, m - 1, d + n)) }
export const diasEntre = (de: string, ate: string) => {
  const [a1, m1, d1] = de.split('-').map(Number); const [a2, m2, d2] = ate.split('-').map(Number)
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 864e5)
}
