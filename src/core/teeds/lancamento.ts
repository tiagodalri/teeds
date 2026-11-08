/**
 * Lançamento da GlobalFly (30/10/2026, Tiago e Naor; funil aprovado em
 * 02/11/2026): o cadastro vira a conta, a plataforma fica trancada até a live
 * de 09/11 e a live libera o acesso.
 *
 * - Quem se inscreve nasce no plano "Aguardando live" (PLANO_AGUARDANDO), com
 *   a ficha 'pendente'. Entra na plataforma de verdade, mas tudo tem cadeado
 *   e a contagem regressiva fica à vista (TrancaDoLancamento).
 * - A live passa dentro da GlobalFly (YouTube não listado mostrado no app) e a
 *   presença é marcada sozinha a cada 30 s enquanto o vídeo toca.
 * - No fim, quem ficou até o fim vira GF Member sozinho (banco:
 *   teeds_lancamento_controlar 'encerrar', ou o servidor 3 h depois).
 */
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

/** Segunda, 09/11/2026, 20h de Brasília (23h UTC). */
export const INICIO_DA_LIVE = Date.UTC(2026, 10, 9, 23, 0, 0)
/** Margem de 3 horas para a live terminar e a liberação acontecer. */
export const FIM_DA_LIVE = INICIO_DA_LIVE + 3 * 36e5

/**
 * A liberação de todos (08/11/2026, Tiago): não acontece mais sozinha às 20h30. Quem libera é o
 * botão "Liberar acesso geral" (Administração › Clientes): o banco libera todo inscrito
 * (teeds_lancamento_liberar_agora) e marca lancamento_live.liberado_em. É essa marca que tira a
 * tranca de quem já tinha acesso e abre as aulas do GF Member.
 *
 * A marca fica guardada no aparelho para a plataforma não piscar trancada enquanto o banco responde.
 */
const CHAVE_LIBERACAO = 'gf.lancamento.liberado'
export function liberacaoGeralGuardada(): boolean {
  try { return !!localStorage.getItem(CHAVE_LIBERACAO) } catch { return false }
}
export function guardarLiberacaoGeral(liberadoEm: string | null) {
  try { if (liberadoEm) localStorage.setItem(CHAVE_LIBERACAO, liberadoEm); else localStorage.removeItem(CHAVE_LIBERACAO) } catch { /* só nesta visita */ }
}

/** O plano de quem se inscreveu e ainda não passou pela live. */
export const PLANO_AGUARDANDO = 'globalfly-aguardando-live'

export const AGENDA_DA_LIVE = {
  google: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Live%20de%20lan%C3%A7amento%20da%20GlobalFly%20Trade&dates=20261109T230000Z/20261110T010000Z&details=Assista%20do%20in%C3%ADcio%20ao%20fim%20para%20liberar%20o%20seu%20acesso.%20A%20live%20passa%20dentro%20da%20GlobalFly%3A%20https%3A%2F%2Fglobalflytrade.com',
  // o mesmo arquivo da página de cadastro (captura-globalfly/live-globalfly.ics)
  arquivo: '/cadastro/live-globalfly.ics',
}

/** A tela de Pré-acesso vale só na GlobalFly e só até o fim da live. */
export function emPreAcesso(agora = Date.now()): boolean {
  return MARCA.id === 'globalfly' && agora < FIM_DA_LIVE
}

/**
 * A plataforma trancada: inscrito da GF ainda não liberado. Até o fim da live,
 * vale para todo cadastro pendente; depois, só para quem está no plano
 * "Aguardando live" (os outros pendentes voltam à tela de análise de sempre).
 * Quem já tinha acesso fica trancado até o botão "Liberar acesso geral" (liberadoGeral).
 */
export function trancadoAteALive(situacao: string | null, plano: string | null, admin: boolean | null, liberadoGeral: boolean, agora = Date.now()): boolean {
  if (MARCA.id !== 'globalfly' || admin === true) return false
  // quem já tinha acesso (cliente, não administrador) também espera a liberação (Tiago, 03/11 e 08/11/2026)
  if (situacao === 'ativo') return admin === false && !liberadoGeral
  if (situacao !== 'pendente') return false
  return plano === PLANO_AGUARDANDO || agora < FIM_DA_LIVE
}

/** 6d 14h 22min · 3h 05min · 12min 40s: o tempo que falta, curto. */
export function faltaCurto(ms: number): string {
  const t = Math.max(0, ms)
  const d = Math.floor(t / 864e5), h = Math.floor(t / 36e5) % 24, m = Math.floor(t / 6e4) % 60, s = Math.floor(t / 1e3) % 60
  const dois = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${h}h ${dois(m)}min`
  if (h > 0) return `${h}h ${dois(m)}min`
  return `${m}min ${dois(s)}s`
}

/** O id do vídeo a partir de qualquer link do YouTube (watch, live, youtu.be, embed) ou do próprio id. */
export function idDoYoutube(link: string | null | undefined): string | null {
  const t = (link ?? '').trim()
  if (!t) return null
  if (/^[\w-]{11}$/.test(t)) return t
  try {
    const u = new URL(t.startsWith('http') ? t : `https://${t}`)
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1, 12) || null
    const v = u.searchParams.get('v')
    if (v) return v.slice(0, 11)
    const m = u.pathname.match(/\/(?:live|embed|shorts|v)\/([\w-]{11})/)
    return m ? m[1] : null
  } catch { return null }
}

export interface EstadoDaLive {
  inicioPrevisto: string
  youtube: string | null
  noAr: boolean
  comecouEm: string | null
  terminouEm: string | null
  liberadoEm: string | null
  meusMinutos: number
}

export interface PainelDaLive extends Omit<EstadoDaLive, 'meusMinutos'> {
  liberados: number | null
  minimoPct: number
  aguardando: number
  assistindoAgora: number
  assistiram: number
  ficaram: number
  total: number | null
}

async function rpc<T>(nome: string, sessao: SessaoTeeds, corpo: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e?.message || `Erro ${res.status} ao falar com o banco da ${MARCA.prosa}`)
  }
  return (await res.json().catch(() => null)) as T
}

export const estadoDaLive = (sessao: SessaoTeeds) =>
  rpc<EstadoDaLive | null>('teeds_lancamento_estado', sessao, { p_marca: MARCA.id })

/** Marca a presença deste minuto. Devolve false quando a live não está no ar. */
export const marcarPresenca = (sessao: SessaoTeeds) =>
  rpc<boolean>('teeds_lancamento_presente', sessao, { p_marca: MARCA.id })

export const painelDaLive = (sessao: SessaoTeeds) =>
  rpc<PainelDaLive>('teeds_lancamento_painel', sessao, { p_marca: MARCA.id })

export type AcaoDaLive = 'youtube' | 'comecar' | 'retomar' | 'encerrar' | 'liberar_geral' | 'minimo'
export const controlarLive = (sessao: SessaoTeeds, acao: AcaoDaLive, valor?: string) =>
  rpc<{ liberados?: number }>('teeds_lancamento_controlar', sessao, { p_marca: MARCA.id, p_acao: acao, p_valor: valor ?? null })
