/**
 * A transmissão ao vivo no banco: agenda, estado, histórico do chat e
 * moderação. REST puro (PostgREST), como o resto da plataforma. As regras de
 * quem vê e quem escreve estão no banco (migração teeds_ao_vivo).
 *
 * O vídeo e o chat em tempo real não passam por aqui: vão pela sala do
 * LiveKit (ver `sala.ts`). Aqui fica o que precisa durar.
 */
import { SUPABASE } from '../teeds/config'
import type { SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'

export type StatusDaLive = 'agendada' | 'ao_vivo' | 'encerrada'

export interface Live {
  id: string
  titulo: string
  descricao: string | null
  status: StatusDaLive
  inicioPrevisto: string | null
  iniciadaEm: string | null
  encerradaEm: string | null
  intervaloChat: number
}

export interface MensagemDoChat {
  id: string
  userId: string
  nome: string
  texto: string
  doModerador: boolean
  fixada: boolean
  apagada: boolean
  criadaEm: string
}

export interface Ingresso {
  url: string
  token: string
  nome: string
  moderador: boolean
  silenciado: boolean
}

async function rest<T>(caminho: string, sessao: SessaoTeeds, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
    ...init,
    headers: {
      apikey: SUPABASE.anonKey,
      Authorization: `Bearer ${sessao.token}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> ?? {}),
    },
  })
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}))
    const msg = String(corpo?.message ?? '')
    throw new Error(msg.startsWith('modo lento') ? msg.replace('modo lento: e', 'E') : msg || `Erro ${r.status}`)
  }
  if (r.status === 204) return undefined as T
  return (await r.json().catch(() => undefined)) as T
}

const CAMPOS_LIVE = 'id,titulo,descricao,status,inicio_previsto,iniciada_em,encerrada_em,intervalo_chat'
const paraLive = (l: any): Live => ({
  id: l.id, titulo: l.titulo, descricao: l.descricao, status: l.status,
  inicioPrevisto: l.inicio_previsto, iniciadaEm: l.iniciada_em, encerradaEm: l.encerrada_em,
  intervaloChat: l.intervalo_chat ?? 0,
})
const paraMensagem = (m: any): MensagemDoChat => ({
  id: m.id, userId: m.user_id, nome: m.nome, texto: m.texto, doModerador: m.do_moderador,
  fixada: m.fixada, apagada: m.apagada, criadaEm: m.criada_em,
})

/** A live no ar agora e as próximas agendadas (as encerradas ficam de fora). */
export async function listarLives(sessao: SessaoTeeds): Promise<Live[]> {
  const linhas = await rest<any[]>(
    `/lives?select=${CAMPOS_LIVE}&marca=eq.${MARCA.id}&status=in.(ao_vivo,agendada)&order=status.asc,inicio_previsto.asc.nullslast&limit=20`, sessao)
  return (linhas ?? []).map(paraLive)
}

/** Só a pergunta "tem live no ar?", barata: é o que acende o ponto vermelho do menu. */
export async function liveNoAr(sessao: SessaoTeeds): Promise<Live | null> {
  const linhas = await rest<any[]>(`/lives?select=${CAMPOS_LIVE}&marca=eq.${MARCA.id}&status=eq.ao_vivo&limit=1`, sessao)
  return linhas?.[0] ? paraLive(linhas[0]) : null
}

export async function criarLive(sessao: SessaoTeeds, titulo: string, inicioPrevisto: string | null, descricao = ''): Promise<Live> {
  const [l] = await rest<any[]>('/lives', sessao, {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ marca: MARCA.id, titulo, descricao: descricao || null, inicio_previsto: inicioPrevisto }),
  })
  return paraLive(l)
}

export async function mudarLive(sessao: SessaoTeeds, id: string, campos: Partial<{ status: StatusDaLive; titulo: string; intervalo_chat: number; iniciada_em: string; encerrada_em: string }>): Promise<void> {
  await rest(`/lives?id=eq.${id}`, sessao, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(campos) })
}

export async function apagarLive(sessao: SessaoTeeds, id: string): Promise<void> {
  await rest(`/lives?id=eq.${id}`, sessao, { method: 'DELETE' })
}

/** As últimas mensagens, para quem entra no meio da live. */
export async function historicoDoChat(sessao: SessaoTeeds, liveId: string, limite = 80): Promise<MensagemDoChat[]> {
  const linhas = await rest<any[]>(
    `/live_mensagens?select=id,user_id,nome,texto,do_moderador,fixada,apagada,criada_em&live_id=eq.${liveId}&order=criada_em.desc&limit=${limite}`, sessao)
  return (linhas ?? []).map(paraMensagem).reverse()
}

export async function gravarMensagem(sessao: SessaoTeeds, m: { id: string; liveId: string; nome: string; texto: string; doModerador: boolean }): Promise<void> {
  await rest('/live_mensagens', sessao, {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ id: m.id, live_id: m.liveId, user_id: sessao.usuario.id, nome: m.nome, texto: m.texto, do_moderador: m.doModerador }),
  })
}

export async function moderarMensagem(sessao: SessaoTeeds, id: string, campos: { fixada?: boolean; apagada?: boolean }): Promise<void> {
  await rest(`/live_mensagens?id=eq.${id}`, sessao, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(campos) })
}

async function funcao<T>(sessao: SessaoTeeds, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/live-token`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const dados = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(dados?.erro || `Não consegui entrar na transmissão (${r.status}).`)
  return dados as T
}

/** O ingresso da sala de vídeo (emitido pela função `live-token`). */
export const pedirIngresso = (sessao: SessaoTeeds, liveId: string) => funcao<Ingresso>(sessao, { liveId })

/** Silencia (ou libera) alguém no chat: grava no banco e tira a permissão na sala. */
export async function silenciar(sessao: SessaoTeeds, liveId: string, userId: string, calar: boolean): Promise<void> {
  if (calar) {
    await rest('/live_silenciados', sessao, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ live_id: liveId, user_id: userId }) })
  } else {
    await rest(`/live_silenciados?live_id=eq.${liveId}&user_id=eq.${userId}`, sessao, { method: 'DELETE' })
  }
  await funcao(sessao, { liveId, acao: calar ? 'silenciar' : 'liberar', identidade: userId }).catch(() => undefined)
}
