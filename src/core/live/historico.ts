/**
 * Histórico das transmissões (31/10/2026, pedido do Victor Dias: "era um
 * histórico das lives: quantas pessoas ficaram, tempo médio, pico de
 * espectadores, mensagens no chat"). Quem transmite grava o resumo a cada
 * 30 s e no fim; a equipe da marca lê na Central (tabela `transmissoes`).
 */
import { SUPABASE } from '../teeds/config'
import { sessaoGuardada, type SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'

export interface Presenca { id: string; nome: string; segundos: number; entradas: number }

export interface Transmissao {
  id: string
  apresentador: string | null
  teste: boolean
  vitrines: string[] | null
  iniciada_em: string
  encerrada_em: string | null
  pico: number
  pessoas: number
  tempo_medio_s: number
  mensagens: number
  presencas: Presenca[]
  atualizada_em: string
}

const cabecalho = (token: string, extra: Record<string, string> = {}) => ({
  apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra,
})

/** Abre a linha da transmissão que começou; devolve o id (ou null, sem rede). */
export async function abrirTransmissao(dados: { apresentador: string; teste: boolean; vitrines: string[] | null }): Promise<string | null> {
  const s = sessaoGuardada()
  if (!s) return null
  const r = await fetch(`${SUPABASE.url}/rest/v1/transmissoes`, {
    method: 'POST', headers: cabecalho(s.token, { Prefer: 'return=representation' }),
    body: JSON.stringify({ marca: MARCA.id, apresentador: dados.apresentador || null, teste: dados.teste, vitrines: dados.vitrines }),
  }).catch(() => null)
  if (!r?.ok) return null
  const [linha] = await r.json() as Array<{ id: string }>
  return linha?.id ?? null
}

export interface Resumo { pico: number; pessoas: number; tempo_medio_s: number; mensagens: number; presencas: Presenca[]; encerrada_em?: string }

/** Grava o resumo (keepalive: vale também quando a aba está fechando). */
export function gravarTransmissao(id: string, resumo: Resumo, fechando = false): void {
  const s = sessaoGuardada()
  if (!s) return
  void fetch(`${SUPABASE.url}/rest/v1/transmissoes?id=eq.${id}`, {
    method: 'PATCH', keepalive: fechando, headers: cabecalho(s.token, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ ...resumo, atualizada_em: new Date().toISOString() }),
  }).catch(() => undefined)
}

export async function listarTransmissoes(sessao: SessaoTeeds, limite = 40): Promise<Transmissao[]> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/transmissoes?marca=eq.${MARCA.id}&select=*&order=iniciada_em.desc&limit=${limite}`, { headers: cabecalho(sessao.token) })
  if (!r.ok) throw new Error('Não consegui carregar o histórico.')
  return r.json()
}

/** Os nomes das plataformas (Victor Cordeiro /v, Naor Bezerra /n) para a equipe escolher. */
export async function plataformasDaMarca(sessao: SessaoTeeds): Promise<Array<{ codigo: string; nome: string }>> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_plataformas_ao_vivo`, { method: 'POST', headers: cabecalho(sessao.token), body: JSON.stringify({ p_marca: MARCA.id }) }).catch(() => null)
  return r?.ok ? r.json() : []
}
