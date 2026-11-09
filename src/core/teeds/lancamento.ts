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
 * - A liberação é o botão "Liberar acesso geral" (Clientes, 08/11/2026): todos
 *   os inscritos viram GF Member (banco: teeds_lancamento_controlar 'liberar_geral').
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
  google: 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=Live%20de%20lan%C3%A7amento%20da%20GlobalFly%20Trade&dates=20261109T230000Z/20261110T010000Z&details=Entre%20na%20live%20por%20este%20link%3A%20https%3A%2F%2Fglobalflytrade.com%2Flive%2F',
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
  // admin ainda não conferido (null) também fica trancado: na dúvida, não abre (09/11/2026; antes só admin === false)
  if (situacao === 'ativo') return !liberadoGeral
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
  /** Pode liberar, trocar o link e encerrar: o admin geral, ou o admin que enxerga todos os parceiros. */
  podeControlar?: boolean
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

/*
  O painel e os comandos da live são sempre da GlobalFly (09/11/2026): no site da Teeds o admin geral
  escolhe a GF no seletor, e MARCA.id ali é 'teeds'. Com a marca do site, "Liberar acesso geral" rodava
  para a Teeds (e o banco agora recusa qualquer marca que não seja a GF).
*/
const MARCA_DA_LIVE = 'globalfly'

export const painelDaLive = (sessao: SessaoTeeds) =>
  rpc<PainelDaLive>('teeds_lancamento_painel', sessao, { p_marca: MARCA_DA_LIVE })

export type AcaoDaLive = 'youtube' | 'comecar' | 'retomar' | 'encerrar' | 'liberar_geral' | 'minimo'
export const controlarLive = (sessao: SessaoTeeds, acao: AcaoDaLive, valor?: string) =>
  rpc<{ liberados?: number }>('teeds_lancamento_controlar', sessao, { p_marca: MARCA_DA_LIVE, p_acao: acao, p_valor: valor ?? null })

/* ------------------------------------------------ a live por fora (09/11/2026) */

/*
  09/11/2026, dia da live (Tiago): a transmissão passa FORA da plataforma, em outra plataforma de
  vídeo. O link é colado às 19h40 em Administração › Live de lançamento (o mesmo campo que guardava
  o YouTube; o banco aceita qualquer endereço). Daí em diante, todo mundo que abre a GlobalFly,
  menos os administradores, vê o aviso de tela cheia com o botão "Entrar na live ao vivo"
  (AvisoDaLive). O player de dentro da plataforma não abre mais.
*/
export const LIVE_POR_FORA = true
/** O aviso de tela cheia abre 20 min antes: 19h40 de Brasília. */
export const AVISO_DA_LIVE_DESDE = INICIO_DA_LIVE - 20 * 6e4
/** A página que leva ao link da live (e-mails, avisos no celular, agenda): sempre o link do momento. */
export const PAGINA_DA_LIVE = 'https://globalflytrade.com/live/'

export interface LiveAberta { inicioPrevisto: string | null; link: string | null; terminouEm: string | null }

/** Só um endereço http(s) vale como link da live. */
export function linkDaLive(link: string | null | undefined): string | null {
  const t = (link ?? '').trim()
  if (!t) return null
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.toString() : null
  } catch { return null }
}

/**
 * O link e o horário da live, sem login (banco: teeds_lancamento_publico, liberado para anon).
 * Sem a consulta no banco, vale o arquivo /live/link.json do site (publicado à mão, plano B).
 */
export async function liveAberta(): Promise<LiveAberta | null> {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_lancamento_publico`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: 'globalfly' }),
  }).catch(() => null)
  if (res?.ok) return (await res.json().catch(() => null)) as LiveAberta | null
  const arq = await fetch(`/live/link.json?t=${Date.now()}`, { cache: 'no-store' }).catch(() => null)
  const j = arq?.ok ? await arq.json().catch(() => null) as { link?: string | null; terminouEm?: string | null } | null : null
  if (!j) throw new Error('Sem o link da live')
  return { inicioPrevisto: null, link: j.link ?? null, terminouEm: j.terminouEm ?? null }
}

/*
  Quem está na tela, para o aviso da live: o App conta (visitante na tela de entrar, cliente,
  administrador). O aviso fica fora do App (main.tsx) para cobrir também a tela de entrar,
  os termos e a troca de senha.
*/
export type QuemVeAvisoDaLive = 'visitante' | 'carregando' | 'cliente' | 'admin'
let quemVe: QuemVeAvisoDaLive = 'carregando'
const ouvintes = new Set<() => void>()
export function informarQuemVeAvisoDaLive(q: QuemVeAvisoDaLive) {
  if (q === quemVe) return
  quemVe = q
  ouvintes.forEach((f) => f())
}
export const quemVeAvisoDaLive = () => quemVe
/** O que o App já leu da live (teeds_lancamento_estado, com login): o link chega por aqui também. */
let liveDoApp: { link: string | null; terminouEm: string | null } | null = null
export function informarLiveDoApp(e: { youtube: string | null; terminouEm: string | null } | null) {
  const novo = e ? { link: e.youtube, terminouEm: e.terminouEm } : null
  if (JSON.stringify(novo) === JSON.stringify(liveDoApp)) return
  liveDoApp = novo
  ouvintes.forEach((f) => f())
}
export const liveLidaPeloApp = () => liveDoApp
export function assinarQuemVeAvisoDaLive(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }
