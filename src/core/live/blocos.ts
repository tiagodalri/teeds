/**
 * Blocos de mensagens do chat simulado (09/11/2026, Tiago: "coloco um tema, por exemplo bom dia,
 * descrevo como quero as mensagens, seleciono quantas, gero com IA e aprovo. Elas ficam em
 * stand-by e, quando eu quiser, abro e dou o play").
 *
 * Os blocos ficam no banco (`chat_blocos`), da equipe da marca: quem prepara num computador
 * dá o play em outro. A I.A. só propõe (`chat-blocos`); o que vai ao chat é o que foi aprovado.
 * Quem toca o bloco é simulacao.ts (`tocarBloco`).
 */
import { SUPABASE } from '../teeds/config'
import type { SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'

export interface BlocoDoChat {
  id: string
  nome: string
  descricao: string
  exemplos: string
  quantidade: number
  /** Aprovadas: o play manda estas. */
  mensagens: string[]
  /** Geradas e ainda não revisadas. */
  revisar: string[]
  ordem: number
}
export type DadosDoBloco = Omit<BlocoDoChat, 'id' | 'ordem'>

const cabecalho = (token: string, extra: Record<string, string> = {}) => ({
  apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra,
})
const CAMPOS = 'id,nome,descricao,exemplos,quantidade,mensagens,revisar,ordem'

export async function listarBlocos(sessao: SessaoTeeds): Promise<BlocoDoChat[]> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/chat_blocos?marca=eq.${MARCA.id}&select=${CAMPOS}&order=ordem.asc,criado_em.asc`, { headers: cabecalho(sessao.token) })
  if (!r.ok) throw new Error('Não consegui carregar os blocos de mensagens.')
  return r.json()
}

export async function salvarBloco(sessao: SessaoTeeds, dados: DadosDoBloco, id?: string, ordem = 0): Promise<BlocoDoChat> {
  const corpo = JSON.stringify({ ...dados, atualizado_em: new Date().toISOString(), ...(id ? {} : { marca: MARCA.id, ordem }) })
  const r = await fetch(id ? `${SUPABASE.url}/rest/v1/chat_blocos?id=eq.${id}&select=${CAMPOS}` : `${SUPABASE.url}/rest/v1/chat_blocos?select=${CAMPOS}`, {
    method: id ? 'PATCH' : 'POST', headers: cabecalho(sessao.token, { Prefer: 'return=representation' }), body: corpo,
  })
  const linhas = r.ok ? await r.json() as BlocoDoChat[] : []
  if (!linhas[0]) throw new Error('Não consegui salvar o bloco. Confira a internet e tente de novo.')
  return linhas[0]
}

export async function apagarBloco(sessao: SessaoTeeds, id: string): Promise<void> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/chat_blocos?id=eq.${id}`, { method: 'DELETE', headers: cabecalho(sessao.token) })
  if (!r.ok) throw new Error('Não consegui apagar o bloco.')
}

/** Pede à I.A. novas mensagens para revisar (nada é gravado até a pessoa aprovar e salvar). */
export async function gerarMensagens(sessao: SessaoTeeds, p: { nome: string; descricao: string; exemplos: string; quantidade: number; evitar: string[] }): Promise<string[]> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/chat-blocos`, {
    method: 'POST', headers: cabecalho(sessao.token), body: JSON.stringify({ marca: MARCA.id, ...p }),
  }).catch(() => null)
  if (!r) throw new Error('Sem conexão com o servidor da I.A.')
  const d = await r.json().catch(() => ({})) as { mensagens?: string[]; erro?: string }
  if (!r.ok || !d.mensagens) throw new Error(d.erro || `A I.A. não respondeu (${r.status}).`)
  return d.mensagens
}
