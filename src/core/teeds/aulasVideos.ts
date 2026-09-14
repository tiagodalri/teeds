/**
 * Os vídeos das aulas, gravados pelo painel — por marca.
 *
 * O catálogo (módulos, ordem, títulos, capas) continua em `aulas.ts`. O que
 * este módulo guarda é o que muda com frequência e não pode exigir publicar
 * o site: o vídeo de cada aula, a duração e, se o admin quiser, um título ou
 * uma descrição diferentes.
 *
 * Duas fontes de vídeo:
 *  - um link colado (YouTube, Vimeo ou .mp4 em qualquer lugar);
 *  - um arquivo enviado ao Storage do Supabase, no bucket `aulas`, dentro da
 *    pasta da marca (`omni/conta-corretora/…mp4`). A URL pública desse
 *    arquivo é o que vai no campo `video`, então o player não precisa saber
 *    de onde veio.
 *
 * Tudo em REST puro (PostgREST e Storage), como o resto da plataforma.
 */

import { SUPABASE, autenticacaoConfigurada } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'

export interface VideoDaAula {
  aulaId: string
  video: string
  duracao: string
  titulo: string | null
  descricao: string | null
  publicado: boolean
  /** Caminho no bucket, quando o vídeo foi enviado (e não linkado). */
  arquivo: string | null
  atualizadoEm: string
}

const BUCKET = 'aulas'

function cabecalhos(token: string): Record<string, string> {
  return { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}` }
}

async function rest<T>(caminho: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
    ...init,
    headers: { ...cabecalhos(token), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) },
  })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(corpo?.message || `Erro ${res.status} ao falar com o banco da ${MARCA.prosa}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json().catch(() => undefined)) as T
}

function daLinha(l: any): VideoDaAula {
  return {
    aulaId: l.aula_id, video: l.video ?? '', duracao: l.duracao ?? '',
    titulo: l.titulo || null, descricao: l.descricao || null,
    publicado: Boolean(l.publicado), arquivo: l.arquivo || null, atualizadoEm: l.atualizado_em,
  }
}

/* --------------------------------------------------------------- leitura */

/**
 * Os vídeos desta marca, por id de aula. Falha em silêncio: a sala de aula
 * abre com o catálogo do código se o banco não responder.
 */
export async function listarVideosDasAulas(sessao: SessaoTeeds | null | undefined): Promise<Record<string, VideoDaAula>> {
  if (!sessao || !autenticacaoConfigurada()) return {}
  try {
    const linhas = await rest<any[]>(`/aulas_videos?select=*&marca=eq.${MARCA.id}`, sessao.token)
    const mapa: Record<string, VideoDaAula> = {}
    for (const l of linhas ?? []) mapa[l.aula_id] = daLinha(l)
    return mapa
  } catch (e) {
    console.warn('[aulas] nao consegui ler os videos das aulas:', (e as Error).message)
    return {}
  }
}

/* --------------------------------------------------------------- escrita */

/** Grava (ou atualiza) o vídeo de uma aula desta marca. Só admin passa pelo RLS. */
export async function salvarVideoDaAula(
  sessao: SessaoTeeds,
  dados: { aulaId: string; video: string; duracao: string; titulo?: string | null; descricao?: string | null; publicado: boolean; arquivo?: string | null },
): Promise<void> {
  await rest('/aulas_videos?on_conflict=marca,aula_id', sessao.token, {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      marca: MARCA.id,
      aula_id: dados.aulaId,
      video: dados.video.trim(),
      duracao: dados.duracao.trim(),
      titulo: dados.titulo?.trim() || null,
      descricao: dados.descricao?.trim() || null,
      publicado: dados.publicado,
      arquivo: dados.arquivo ?? null,
      atualizado_em: new Date().toISOString(),
      atualizado_por: sessao.usuario.id,
    }),
  })
}

/** Apaga o registro (a aula volta a ser "em breve") e o arquivo enviado, se houver. */
export async function removerVideoDaAula(sessao: SessaoTeeds, aulaId: string, arquivo?: string | null): Promise<void> {
  await rest(`/aulas_videos?marca=eq.${MARCA.id}&aula_id=eq.${encodeURIComponent(aulaId)}`, sessao.token, {
    method: 'DELETE', headers: { Prefer: 'return=minimal' },
  })
  if (arquivo) await apagarArquivo(sessao, arquivo)
}

/* --------------------------------------------------------------- storage */

/** A URL pública de um caminho dentro do bucket. */
export function urlDoArquivo(caminho: string): string {
  return `${SUPABASE.url}/storage/v1/object/public/${BUCKET}/${caminho.split('/').map(encodeURIComponent).join('/')}`
}

/** É um arquivo do nosso bucket? (para saber se dá para apagar) */
export function ehArquivoNosso(video: string): boolean {
  return video.startsWith(`${SUPABASE.url}/storage/v1/object/public/${BUCKET}/`)
}

const nomeSeguro = (nome: string) =>
  nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/(^-|-$)/g, '') || 'video.mp4'

/**
 * Envia o arquivo de vídeo ao Storage e devolve o caminho e a URL pública.
 *
 * XMLHttpRequest, e não fetch, por um motivo só: um vídeo de aula tem
 * dezenas ou centenas de megabytes, e o admin precisa ver a barra andar.
 * A política do bucket só aceita a pasta da própria marca.
 */
export function enviarArquivoDaAula(
  sessao: SessaoTeeds, aulaId: string, arquivo: File, aoProgredir?: (fracao: number) => void,
): { promessa: Promise<{ caminho: string; url: string }>; cancelar: () => void } {
  const caminho = `${MARCA.id}/${aulaId}/${Date.now().toString(36)}-${nomeSeguro(arquivo.name)}`
  const xhr = new XMLHttpRequest()
  const promessa = new Promise<{ caminho: string; url: string }>((resolver, rejeitar) => {
    xhr.open('POST', `${SUPABASE.url}/storage/v1/object/${BUCKET}/${caminho.split('/').map(encodeURIComponent).join('/')}`)
    xhr.setRequestHeader('apikey', SUPABASE.anonKey)
    xhr.setRequestHeader('Authorization', `Bearer ${sessao.token}`)
    xhr.setRequestHeader('Content-Type', arquivo.type || 'video/mp4')
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.setRequestHeader('cache-control', 'max-age=31536000')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) aoProgredir?.(e.loaded / e.total) }
    xhr.onerror = () => rejeitar(new Error('A conexão caiu no meio do envio. Tente de novo.'))
    xhr.onabort = () => rejeitar(new Error('Envio cancelado.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolver({ caminho, url: urlDoArquivo(caminho) })
      else {
        let recado = `Erro ${xhr.status} ao enviar o vídeo`
        try { recado = JSON.parse(xhr.responseText)?.message || recado } catch { /* sem detalhe */ }
        if (xhr.status === 413) recado = 'O arquivo é maior do que o limite do bucket. Reduza o vídeo ou cole um link.'
        if (xhr.status === 403) recado = 'Sem permissão para enviar: só administradores desta marca podem publicar aulas.'
        rejeitar(new Error(recado))
      }
    }
    xhr.send(arquivo)
  })
  return { promessa, cancelar: () => xhr.abort() }
}

export async function apagarArquivo(sessao: SessaoTeeds, caminho: string): Promise<void> {
  const res = await fetch(`${SUPABASE.url}/storage/v1/object/${BUCKET}/${caminho.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE', headers: cabecalhos(sessao.token),
  })
  // Arquivo que já não existe não é erro: o objetivo era ele não existir.
  if (!res.ok && res.status !== 404) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(corpo?.message || `Erro ${res.status} ao apagar o arquivo`)
  }
}

/* ------------------------------------------------------------ utilidades */

/** "7 min", "1 h 12 min" — a duração como a tela de Aulas mostra. */
export function duracaoLegivel(segundos: number): string {
  const s = Math.round(segundos)
  if (!Number.isFinite(s) || s <= 0) return ''
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  if (h) return `${h} h${m ? ` ${m} min` : ''}`
  return `${Math.max(1, m)} min`
}

/** Lê a duração do arquivo no próprio navegador, antes de enviar. */
export function duracaoDoArquivo(arquivo: File): Promise<number | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(arquivo)
    const v = document.createElement('video')
    v.preload = 'metadata'
    const fim = (n: number | null) => { URL.revokeObjectURL(url); resolver(n) }
    v.onloadedmetadata = () => fim(Number.isFinite(v.duration) ? v.duration : null)
    v.onerror = () => fim(null)
    v.src = url
  })
}
