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
  /** Fechado: só o moderador escreve (os alunos leem). */
  chatAberto: boolean
  /** Canto da tela em que o rosto do apresentador aparece. */
  cameraCanto: CantoDaCamera
  /** Tamanho do rosto do apresentador: pequeno, médio, grande. */
  cameraTamanho: 'p' | 'm' | 'g'
  /** Letreiro sobre o vídeo, como na TV (vazio = sem faixa). */
  faixa: string | null
}

export type CantoDaCamera = 'sup-esq' | 'sup-dir' | 'inf-esq' | 'inf-dir'

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
  /** Entrou pelo link público, sem conta (fase de testes): nada dele fica gravado. */
  convidado?: boolean
  /** Para o convidado, a live vem junto (ele não consegue ler a tabela). */
  live?: Live
  /** Para o convidado, as últimas mensagens do chat. */
  historico?: MensagemDoChat[]
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

const CAMPOS_LIVE = 'id,titulo,descricao,status,inicio_previsto,iniciada_em,encerrada_em,intervalo_chat,chat_aberto,camera_canto,camera_tamanho,faixa'
const paraLive = (l: any): Live => ({
  id: l.id, titulo: l.titulo, descricao: l.descricao, status: l.status,
  inicioPrevisto: l.inicio_previsto, iniciadaEm: l.iniciada_em, encerradaEm: l.encerrada_em,
  intervaloChat: l.intervalo_chat ?? 0,
  chatAberto: l.chat_aberto ?? true, cameraCanto: l.camera_canto ?? 'inf-dir',
  cameraTamanho: l.camera_tamanho ?? 'm', faixa: l.faixa ?? null,
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
  const [l] = await rest<any[]>(`/lives?select=${CAMPOS_LIVE}`, sessao, {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ marca: MARCA.id, titulo, descricao: descricao || null, inicio_previsto: inicioPrevisto }),
  })
  return paraLive(l)
}

export async function mudarLive(sessao: SessaoTeeds, id: string, campos: Partial<{ status: StatusDaLive; titulo: string; intervalo_chat: number; iniciada_em: string; encerrada_em: string; chat_aberto: boolean; camera_canto: CantoDaCamera; camera_tamanho: 'p' | 'm' | 'g'; faixa: string | null }>): Promise<void> {
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

async function funcao<T>(token: string, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/live-token`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const dados = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(dados?.erro || `Não consegui entrar na transmissão (${r.status}).`)
  return dados as T
}

/** O ingresso da sala de vídeo (emitido pela função `live-token`). */
export const pedirIngresso = (sessao: SessaoTeeds, liveId: string) => funcao<Ingresso>(sessao.token, { liveId })

/* ------------------------------------------------- link público (fase de testes) */

/**
 * Quem chegou pelo link e não tem conta: o que é a live e se o link está
 * público. A função resolve pelo código do convite (8 primeiros caracteres).
 */
export async function infoDoConvite(codigo: string): Promise<{ live: Live; publico: boolean }> {
  const r = await funcao<{ live: any; publico: boolean }>(SUPABASE.anonKey, { convite: codigo, acao: 'info' })
  return { live: paraLive(r.live), publico: r.publico }
}

/** O ingresso de convidado (só com o link público ligado e a live no ar). */
export async function pedirIngressoConvidado(codigo: string, nome: string): Promise<Ingresso> {
  const r = await funcao<any>(SUPABASE.anonKey, { convite: codigo, nome })
  return { ...r, live: r.live ? paraLive(r.live) : undefined, historico: ((r.historico ?? []) as any[]).map(paraMensagem) }
}

/** O link desta marca está público? Lê sem conta (a tabela é aberta para leitura). */
export async function linkPublicoAtivo(): Promise<boolean> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/aovivo_config?select=link_publico&marca=eq.${MARCA.id}`, {
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}` },
  })
  const [c] = (await r.json().catch(() => [])) as Array<{ link_publico: boolean }>
  return !!c?.link_publico
}

/** O admin liga (testes) ou desliga (produção) o link público da marca. */
export async function definirLinkPublico(sessao: SessaoTeeds, publico: boolean): Promise<void> {
  await rest('/aovivo_config', sessao, {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ marca: MARCA.id, link_publico: publico, atualizado_em: new Date().toISOString() }),
  })
}

/** Silencia (ou libera) alguém no chat: grava no banco e tira a permissão na sala. */
export async function silenciar(sessao: SessaoTeeds, liveId: string, userId: string, calar: boolean): Promise<void> {
  // convidado não tem conta: só a permissão na sala (vale enquanto ele estiver nela)
  if (userId.startsWith('convidado-')) { await funcao(sessao.token, { liveId, acao: calar ? 'silenciar' : 'liberar', identidade: userId }); return }
  if (calar) {
    await rest('/live_silenciados', sessao, { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify({ live_id: liveId, user_id: userId }) })
  } else {
    await rest(`/live_silenciados?live_id=eq.${liveId}&user_id=eq.${userId}`, sessao, { method: 'DELETE' })
  }
  await funcao(sessao.token, { liveId, acao: calar ? 'silenciar' : 'liberar', identidade: userId }).catch(() => undefined)
}

/** A sala de treino (simulada) está liberada para esta conta? Admin ou plano "treino". */
export async function podeTreinar(sessao: SessaoTeeds): Promise<boolean> {
  try {
    return (await rest<boolean>('/rpc/teeds_minha_sala_de_treino', sessao, { method: 'POST', body: JSON.stringify({ p_marca: MARCA.id }) })) === true
  } catch { return false }
}

/** O link curto de convite da live (abre direto no "Ao vivo", mesmo depois do login). */
export const linkDaLive = (id: string) => `${location.origin}${import.meta.env.BASE_URL}?aovivo=${id.slice(0, 8)}`

/** O código do convite com que a pessoa chegou (se veio por link), para destacar a live certa. */
export function conviteRecebido(): string | null {
  const naUrl = new URLSearchParams(location.search).get('aovivo')
  if (naUrl && /^[0-9a-f]{8}$/i.test(naUrl)) return naUrl.toLowerCase()
  try { return sessionStorage.getItem(`${MARCA.id}.aovivo.convite`) } catch { return null }
}
