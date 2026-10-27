/**
 * Termos de uso e políticas (27/10/2026, Tiago: "no primeiro acesso a pessoa
 * sempre precisa concordar com os termos de uso. Obrigatório.").
 *
 * Os documentos são arquivos .md em src/termos/<marca>/, lidos no build. O
 * aceite vai para o banco (termos_aceites: pessoa, marca, versão, data) e é a
 * prova de que a pessoa concordou. Mudou algum documento de forma relevante?
 * Suba a VERSAO: todo mundo aceita de novo no próximo acesso.
 */
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import { ARQUIVOS_DOS_TERMOS } from './termosDocumentos'

export const VERSAO_TERMOS = '2026-10-27'
export const DATA_DA_VERSAO = '27 de outubro de 2026'

export interface Documento { id: string; titulo: string; texto: string }

// só os .md da marca do build (a casca da marca traz a lista; as outras marcas não levam nada)
const ARQUIVOS = ARQUIVOS_DOS_TERMOS

export function documentosDaMarca(): Documento[] {
  return Object.keys(ARQUIVOS)
    .sort()
    .map((caminho) => {
      const texto = ARQUIVOS[caminho]
      const titulo = texto.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? caminho
      const id = caminho.split('/').pop()!.replace(/^\d+-/, '').replace(/\.md$/, '')
      return { id, titulo, texto }
    })
}

const cabecalhos = (token: string) => ({ apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })
const chaveLocal = (userId: string) => `${MARCA.id}.termos.${VERSAO_TERMOS}.${userId}`

/** Já aceitou esta versão? Confere no banco; o aparelho só guarda um atalho para não piscar a tela. */
export async function jaAceitou(sessao: SessaoTeeds): Promise<boolean> {
  const url = `${SUPABASE.url}/rest/v1/termos_aceites?select=versao&user_id=eq.${sessao.usuario.id}&marca=eq.${MARCA.id}&versao=eq.${encodeURIComponent(VERSAO_TERMOS)}&limit=1`
  const res = await fetch(url, { headers: cabecalhos(sessao.token) })
  if (!res.ok) throw new Error('Não foi possível conferir o aceite dos termos.')
  const linhas = await res.json() as unknown[]
  const aceitou = linhas.length > 0
  try { if (aceitou) localStorage.setItem(chaveLocal(sessao.usuario.id), '1'); else localStorage.removeItem(chaveLocal(sessao.usuario.id)) } catch { /* sem armazenamento */ }
  return aceitou
}

/** O atalho do aparelho (só para a primeira pintura; a palavra final é do banco). */
export function aceiteGuardado(userId: string): boolean {
  try { return localStorage.getItem(chaveLocal(userId)) === '1' } catch { return false }
}

export type TipoDeAceite = 'primeiro_acesso' | 'login'

/**
 * Registra o aceite no banco. O primeiro acesso grava a linha da versão
 * (termos_aceites) e o histórico; cada login grava só o histórico
 * (termos_aceites_eventos). A data, a hora e o IP são carimbados pelo banco.
 */
export async function registrarAceite(sessao: SessaoTeeds, tipo: TipoDeAceite = 'primeiro_acesso'): Promise<void> {
  const aparelho = navigator.userAgent.slice(0, 300)
  if (tipo === 'primeiro_acesso') {
    const res = await fetch(`${SUPABASE.url}/rest/v1/termos_aceites`, {
      method: 'POST',
      headers: { ...cabecalhos(sessao.token), Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify({
        user_id: sessao.usuario.id, marca: MARCA.id, versao: VERSAO_TERMOS,
        documentos: documentosDaMarca().map((d) => d.id), user_agent: aparelho,
      }),
    })
    if (!res.ok && res.status !== 409) throw new Error('Não foi possível registrar o aceite. Tente de novo.')
  }
  const ev = await fetch(`${SUPABASE.url}/rest/v1/termos_aceites_eventos`, {
    method: 'POST',
    headers: { ...cabecalhos(sessao.token), Prefer: 'return=minimal' },
    body: JSON.stringify({ user_id: sessao.usuario.id, marca: MARCA.id, versao: VERSAO_TERMOS, tipo, user_agent: aparelho }),
  })
  if (!ev.ok) throw new Error('Não foi possível registrar o aceite. Tente de novo.')
  if (tipo === 'primeiro_acesso') try { localStorage.setItem(chaveLocal(sessao.usuario.id), '1') } catch { /* sem armazenamento */ }
}

/*
  O aceite do login: a caixinha é marcada na tela de entrada, antes de existir
  sessão. A tela deixa um recado nesta aba; quando a sessão chega, o App grava.
  Vale por 10 minutos (um login que demorou não perde o aceite; um recado velho não vale).
*/
const RECADO_LOGIN = `${MARCA.id}.termos.login`
export function marcarAceiteNoLogin(): void {
  try { sessionStorage.setItem(RECADO_LOGIN, String(Date.now())) } catch { /* sem armazenamento */ }
}
export function aceiteDoLoginPendente(): boolean {
  try {
    const t = Number(sessionStorage.getItem(RECADO_LOGIN) || 0)
    return t > 0 && Date.now() - t < 10 * 60_000
  } catch { return false }
}
export function limparAceiteDoLogin(): void {
  try { sessionStorage.removeItem(RECADO_LOGIN) } catch { /* sem armazenamento */ }
}

export interface AceiteRegistrado { tipo: TipoDeAceite; versao: string; aceitoEm: string; ip: string | null; aparelho: string | null }
export interface HistoricoDeAceites { primeiro: AceiteRegistrado | null; ultimo: AceiteRegistrado | null; total: number; eventos: AceiteRegistrado[] }

/** O histórico de aceites de uma pessoa (a própria, ou um cliente para o admin). */
export async function historicoDeAceites(token: string, userId: string, marca = MARCA.id): Promise<HistoricoDeAceites> {
  const url = `${SUPABASE.url}/rest/v1/termos_aceites_eventos?select=tipo,versao,aceito_em,ip,user_agent&user_id=eq.${userId}&marca=eq.${encodeURIComponent(marca)}&order=aceito_em.asc&limit=500`
  const res = await fetch(url, { headers: cabecalhos(token) })
  if (!res.ok) throw new Error('Não foi possível ler os aceites.')
  const linhas = await res.json() as Array<{ tipo: TipoDeAceite; versao: string; aceito_em: string; ip: string | null; user_agent: string | null }>
  const eventos = linhas.map((l) => ({ tipo: l.tipo, versao: l.versao, aceitoEm: l.aceito_em, ip: l.ip, aparelho: l.user_agent }))
  return { primeiro: eventos[0] ?? null, ultimo: eventos[eventos.length - 1] ?? null, total: eventos.length, eventos }
}

/** "27/10/2026 às 16:49" no fuso de quem vê. */
export function dataEHora(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
}

/** O aparelho em poucas palavras, a partir do user agent. */
export function aparelhoLegivel(ua: string | null): string {
  if (!ua) return 'aparelho não informado'
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'outro sistema'
  const nav = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : 'navegador'
  return `${nav} no ${so}`
}
