/**
 * O Instagram do parceiro dentro da plataforma (04/11/2026): a tela fala com a função meta-instagram,
 * que guarda o aplicativo da Meta e a conexão (o token nunca chega aqui). O laboratório troca por
 * números de exemplo.
 */
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'

export interface EstadoDoInstagram {
  app: { configurado: boolean; appId: string | null; volta: string }
  /** A chave de anúncios do parceiro (o mesmo usuário do sistema): já lê o Instagram? */
  chave: { existe: boolean; lePerfil: boolean; leMetricas: boolean; usuario: string | null; seguidores: number | null }
  conexao: { id: string; usuario: string; nome: string; foto: string | null; seguidores: number; posts: number; pagina: string; conectadoEm: string; valida: boolean | null; fonte: 'login' | 'chave' } | null
  candidatos: Array<{ id: string; usuario: string; foto: string | null; seguidores: number; pagina: string }>
}
export interface MidiaDoInstagram {
  id: string; tipo: 'foto' | 'video' | 'carrossel' | 'reel' | 'story'; legenda: string; link: string | null; imagem: string | null; quando: string
  curtidas: number; comentarios: number; views: number | null; alcance: number | null; salvos: number | null; compartilhamentos: number | null
  interacoes: number | null; respostas: number | null; tempoMedio: number | null
}
export interface MetricasDoInstagram {
  perfil: { usuario: string; nome: string; foto: string | null; seguidores: number; seguindo: number; posts: number }
  dias: number
  conta: Record<'views' | 'reach' | 'profile_views' | 'accounts_engaged' | 'total_interactions' | 'website_clicks' | 'likes' | 'comments' | 'shares' | 'saves' | 'follows_and_unfollows', number | null>
    & { seguidoresPorDia: Array<{ dia: string; novos: number }> }
  posts: MidiaDoInstagram[]
  stories: MidiaDoInstagram[]
  lidoEm: string
}

export interface ApiInstagram {
  estado(s: SessaoTeeds, parceiro: string): Promise<EstadoDoInstagram>
  salvarApp(s: SessaoTeeds, parceiro: string, appId: string, segredo: string): Promise<void>
  /** Troca a chave de anúncios por uma nova com as permissões do Instagram (a conta de anúncios não muda). */
  salvarChave(s: SessaoTeeds, parceiro: string, chave: string): Promise<void>
  /** `link`: um endereço de 48 h para mandar ao parceiro (ele entra com o Facebook dele, no celular dele). */
  inicio(s: SessaoTeeds, parceiro: string, link?: boolean): Promise<string>
  escolher(s: SessaoTeeds, parceiro: string, igId: string): Promise<void>
  desconectar(s: SessaoTeeds, parceiro: string): Promise<void>
  metricas(s: SessaoTeeds, parceiro: string, dias: number): Promise<MetricasDoInstagram>
}

async function funcao<T>(sessao: SessaoTeeds, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/meta-instagram`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ marca: MARCA.id, ...corpo }),
  }).catch(() => { throw new Error('Sem conexão agora. Confira a internet e tente de novo.') })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(String(d?.erro || `Não consegui falar com a Meta agora (${r.status}).`))
  return d as T
}

export const API_DO_INSTAGRAM: ApiInstagram = {
  estado: (s, parceiro) => funcao(s, { acao: 'estado', parceiro }),
  salvarApp: async (s, parceiro, appId, segredo) => { await funcao(s, { acao: 'app', parceiro, appId, segredo }) },
  salvarChave: async (s, parceiro, chave) => { await funcao(s, { acao: 'chave', parceiro, chave }) },
  inicio: async (s, parceiro, link) => (await funcao<{ url: string }>(s, { acao: 'inicio', parceiro, origem: location.origin, link: !!link })).url,
  escolher: async (s, parceiro, igId) => { await funcao(s, { acao: 'escolher', parceiro, igId }) },
  desconectar: async (s, parceiro) => { await funcao(s, { acao: 'desconectar', parceiro }) },
  metricas: (s, parceiro, dias) => funcao(s, { acao: 'metricas', parceiro, dias }),
}
