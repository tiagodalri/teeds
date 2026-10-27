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

export async function registrarAceite(sessao: SessaoTeeds): Promise<void> {
  const res = await fetch(`${SUPABASE.url}/rest/v1/termos_aceites`, {
    method: 'POST',
    headers: { ...cabecalhos(sessao.token), Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: sessao.usuario.id, marca: MARCA.id, versao: VERSAO_TERMOS,
      documentos: documentosDaMarca().map((d) => d.id),
      user_agent: navigator.userAgent.slice(0, 300),
    }),
  })
  if (!res.ok && res.status !== 409) throw new Error('Não foi possível registrar o aceite. Tente de novo.')
  try { localStorage.setItem(chaveLocal(sessao.usuario.id), '1') } catch { /* sem armazenamento */ }
}
