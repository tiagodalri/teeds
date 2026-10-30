/**
 * Central de organização da equipe (Administração > Organização), 23/10/2026.
 *
 * Tarefas com responsáveis, início, prazo, prioridade, área, subtarefas,
 * anexos, histórico e comentários,
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

/** Subtarefa: o item do checklist, com dono e prazo opcionais (30/10/2026). */
export interface ItemChecklist { texto: string; feito: boolean; responsavel?: string | null; prazo?: string | null }

export interface Tarefa {
  id: string
  titulo: string
  descricao: string
  area: Area
  status: Status
  prioridade: Prioridade
  /** Quem cuida (30/10/2026: mais de um). O primeiro é o principal. */
  responsaveis: string[]
  /** AAAA-MM-DD, quando começa (opcional) */
  inicio: string | null
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
export interface Anexo { id: string; tarefaId: string; nome: string; caminho: string; tipo: string; tamanho: number; autor: string | null; criadoEm: string }
export type AcaoHistorico = 'criou' | 'status' | 'prazo' | 'inicio' | 'responsaveis' | 'prioridade' | 'area' | 'titulo'
/** O que mudou na tarefa, gravado pelo banco (gatilho org_registrar). */
export interface Evento { id: string; tarefaId: string; autor: string | null; acao: AcaoHistorico; de: string | null; para: string | null; criadoEm: string }
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

export interface Dados { tarefas: Tarefa[]; marcos: Marco[]; equipe: Pessoa[]; contagemComentarios: Record<string, number>; contagemAnexos: Record<string, number> }

export type Mudanca =
  | { tipo: 'tarefa'; acao: 'salvou'; item: Tarefa } | { tipo: 'tarefa'; acao: 'apagou'; id: string }
  | { tipo: 'marco'; acao: 'salvou'; item: Marco } | { tipo: 'marco'; acao: 'apagou'; id: string }
  | { tipo: 'comentario'; acao: 'salvou'; item: Comentario } | { tipo: 'comentario'; acao: 'apagou'; id: string; tarefaId?: string }
  | { tipo: 'anexo'; acao: 'salvou'; item: Anexo } | { tipo: 'anexo'; acao: 'apagou'; id: string; tarefaId?: string }

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
  anexos(tarefaId: string): Promise<Anexo[]>
  anexar(tarefaId: string, arquivo: File): Promise<Anexo>
  /** Endereço local (blob) para ver ou baixar o arquivo. */
  abrirAnexo(a: Anexo): Promise<string>
  apagarAnexo(a: Anexo): Promise<void>
  historico(tarefaId: string): Promise<Evento[]>
  /** Mudanças feitas pelos outros, ao vivo. Devolve como parar. */
  acompanhar(aoMudar: (m: Mudanca) => void): () => void
}

// ------------------------------------------------------------ conversão
const daTarefa = (l: any): Tarefa => ({
  id: l.id, titulo: l.titulo ?? '', descricao: l.descricao ?? '', area: l.area, status: l.status, prioridade: l.prioridade,
  responsaveis: Array.isArray(l.responsaveis) && l.responsaveis.length ? l.responsaveis : l.responsavel ? [l.responsavel] : [],
  inicio: l.inicio ?? null, prazo: l.prazo ?? null, checklist: Array.isArray(l.checklist) ? l.checklist : [],
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
  if (t.responsaveis !== undefined) o.responsaveis = t.responsaveis
  if (t.inicio !== undefined) o.inicio = t.inicio
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
const doAnexo = (l: any): Anexo => ({ id: l.id, tarefaId: l.tarefa_id, nome: l.nome ?? '', caminho: l.caminho, tipo: l.tipo ?? '', tamanho: Number(l.tamanho ?? 0), autor: l.autor ?? null, criadoEm: l.criado_em })
const doEvento = (l: any): Evento => ({ id: l.id, tarefaId: l.tarefa_id, autor: l.autor ?? null, acao: l.acao, de: l.de ?? null, para: l.para ?? null, criadoEm: l.criado_em })

/** 25 MB por arquivo, o limite do bucket "organizacao". */
export const LIMITE_ANEXO = 25 * 1024 * 1024
/** Nome seguro para o caminho no storage (sem acento, espaço ou barra). */
const nomeNoCaminho = (n: string) => (n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'arquivo')
const anexosAbertos = new Map<string, Promise<string>>()

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
  const cabeca = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` }
  const apagarDoStorage = (caminhos: string[]) => fetch(`${SUPABASE.url}/storage/v1/object/organizacao`, {
    method: 'DELETE', headers: { ...cabeca, 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: caminhos }),
  }).then(() => undefined, () => undefined)
  const um = <T>(l: T[] | undefined) => {
    if (!l || !l.length) throw new Error('Não encontrei esse item. Ele pode ter sido apagado por outra pessoa.')
    return l[0]
  }

  return {
    euId: sessao.usuario.id,
    async carregar() {
      const [tarefas, marcos, equipe, coms, anx] = await Promise.all([
        rest<any[]>(`/org_tarefas?marca=eq.${marca}&select=*&order=ordem.asc`),
        rest<any[]>(`/org_marcos?marca=eq.${marca}&select=*&order=data.asc`),
        rest<any[]>('/rpc/org_equipe', { method: 'POST', body: JSON.stringify({ p_marca: marca }) }),
        rest<any[]>(`/org_comentarios?marca=eq.${marca}&select=tarefa_id`),
        rest<any[]>(`/org_anexos?marca=eq.${marca}&select=tarefa_id`),
      ])
      const contagem: Record<string, number> = {}
      for (const c of coms ?? []) contagem[c.tarefa_id] = (contagem[c.tarefa_id] ?? 0) + 1
      const contagemAnexos: Record<string, number> = {}
      for (const a of anx ?? []) contagemAnexos[a.tarefa_id] = (contagemAnexos[a.tarefa_id] ?? 0) + 1
      return {
        tarefas: (tarefas ?? []).map(daTarefa),
        marcos: (marcos ?? []).map(doMarco),
        equipe: (equipe ?? []).map((p) => ({ id: p.user_id, nome: p.nome ?? '', email: p.email ?? '' })),
        contagemComentarios: contagem,
        contagemAnexos,
      }
    },
    async criarTarefa(t) {
      return daTarefa(um(await rest<any[]>('/org_tarefas', { method: 'POST', headers: devolver, body: JSON.stringify({ ...paraTarefa(t), marca }) })))
    },
    async alterarTarefa(id, campos) {
      return daTarefa(um(await rest<any[]>(`/org_tarefas?id=eq.${id}`, { method: 'PATCH', headers: devolver, body: JSON.stringify(paraTarefa(campos)) })))
    },
    async apagarTarefa(id) {
      // os arquivos saem do storage antes (a linha do anexo sai junto com a tarefa)
      const anx = await rest<any[]>(`/org_anexos?tarefa_id=eq.${id}&select=caminho`).catch(() => [])
      if (anx?.length) await apagarDoStorage(anx.map((a) => a.caminho))
      await rest(`/org_tarefas?id=eq.${id}`, { method: 'DELETE' })
    },
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
    async anexos(tarefaId) {
      return ((await rest<any[]>(`/org_anexos?tarefa_id=eq.${tarefaId}&select=*&order=criado_em.asc`)) ?? []).map(doAnexo)
    },
    async anexar(tarefaId, arquivo) {
      if (arquivo.size > LIMITE_ANEXO) throw new Error(`"${arquivo.name}" passa de 25 MB. Mande um arquivo menor ou um link na descrição.`)
      const caminho = `${marca}/${tarefaId}/${crypto.randomUUID().slice(0, 8)}-${nomeNoCaminho(arquivo.name)}`
      const r = await fetch(`${SUPABASE.url}/storage/v1/object/organizacao/${caminho}`, {
        method: 'POST', headers: { ...cabeca, 'Content-Type': arquivo.type || 'application/octet-stream' }, body: arquivo,
      })
      if (!r.ok) throw new Error(r.status === 413 ? `"${arquivo.name}" passa de 25 MB.` : `Não consegui enviar "${arquivo.name}" agora. Tente de novo.`)
      try {
        return doAnexo(um(await rest<any[]>('/org_anexos', {
          method: 'POST', headers: devolver,
          body: JSON.stringify({ tarefa_id: tarefaId, marca, nome: arquivo.name.slice(0, 200) || 'arquivo', caminho, tipo: arquivo.type || null, tamanho: arquivo.size }),
        })))
      } catch (e) { await apagarDoStorage([caminho]); throw e }
    },
    abrirAnexo(a) {
      let p = anexosAbertos.get(a.caminho)
      if (!p) {
        p = fetch(`${SUPABASE.url}/storage/v1/object/authenticated/organizacao/${a.caminho}`, { headers: cabeca })
          .then((r) => { if (!r.ok) throw new Error('Não consegui abrir o arquivo agora.'); return r.blob() })
          .then((b) => URL.createObjectURL(a.tipo && b.type !== a.tipo ? new Blob([b], { type: a.tipo }) : b))
        p.catch(() => anexosAbertos.delete(a.caminho))
        anexosAbertos.set(a.caminho, p)
      }
      return p
    },
    async apagarAnexo(a) {
      await rest(`/org_anexos?id=eq.${a.id}`, { method: 'DELETE' })
      await apagarDoStorage([a.caminho])
    },
    async historico(tarefaId) {
      return ((await rest<any[]>(`/org_historico?tarefa_id=eq.${tarefaId}&select=*&order=criado_em.asc`)) ?? []).map(doEvento)
    },
    acompanhar(aoMudar) {
      const a = assinarMudancas({
        token: sessao.token,
        canal: `org-${marca}-${Math.random().toString(36).slice(2, 8)}`,
        // O Realtime não filtra DELETE por coluna (só chega o id): as remoções
        // vêm sem filtro. Um id de outra marca simplesmente não acha nada aqui.
        tabelas: ['org_tarefas', 'org_marcos', 'org_comentarios', 'org_anexos'].flatMap((tabela) => [
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
          else if (m.tabela === 'org_anexos') aoMudar(apagou ? { tipo: 'anexo', acao: 'apagou', id, tarefaId: m.antiga?.tarefa_id } : { tipo: 'anexo', acao: 'salvou', item: doAnexo(m.linha) })
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
