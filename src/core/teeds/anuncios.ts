/**
 * Administração › Anúncios (02/11/2026): os números da Meta (função meta-ads) e o funil do
 * nosso banco (teeds_meta_funil), lado a lado. Ver supabase/migracoes/20261102250000_painel_de_anuncios.sql.
 */
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

export interface Metricas {
  gasto: number; impressoes: number; alcance: number; frequencia: number; cliques: number; cliquesLink: number
  ctrLink: number; ctr: number; cpcLink: number; cpm: number; lpv: number; viewContent: number; leads: number; cadastros: number
  eventosProprios: number; engajamento: number; reacoes: number; comentarios: number; compartilhamentos: number; salvos: number
  video3s: number; videoPlay: number; thruplay: number; p25: number; p50: number; p75: number; p95: number; p100: number
}
export type Ranking = '' | 'acima' | 'media' | 'abaixo10' | 'abaixo20' | 'abaixo35'
export interface Campanha { id: string; nome: string; status: string; objetivo: string; orcDia: number; orcTotal: number; inicio: string | null; fim: string | null; lance: string | null; m: Metricas }
export interface Conjunto { id: string; nome: string; status: string; campanhaId: string; orcDia: number; orcTotal: number; otimizacao: string; publico: string; m: Metricas }
export interface Anuncio {
  id: string; nome: string; status: string; campanhaId: string; conjuntoId: string; criadoEm: string
  criativo: { miniatura: string | null; imagem: string | null; titulo: string; texto: string; tipo: 'video' | 'imagem' | 'carrossel'; cta: string; marcacoes: string | null }
  ranking: { qualidade: Ranking; engajamento: Ranking; conversao: Ranking }
  m: Metricas
}
export type Quebra = Metricas & Record<string, string | number>
export interface PainelDaMeta {
  conta: { id: string; nome: string; moeda: string; status: number; gastoTotal: number; saldo: number; limite: number; fuso: string; motivo: number }
  periodo: { de: string; ate: string }
  total: Metricas
  porDia: Array<Metricas & { dia: string }>
  campanhas: Campanha[]; conjuntos: Conjunto[]; anuncios: Anuncio[]
  quebras: { idadeGenero: Quebra[]; posicionamento: Quebra[]; aparelho: Quebra[]; regiao: Quebra[] }
  pixel: { id: string; eventos: Array<{ nome: string; total: number }>; porDia: Array<{ dia: string; ev: Record<string, number> }>; desde: string } | { id: string; erro: string }
  avisos: string[]; em: string; chaveEm?: string; doCache?: boolean
  /** Números trazidos pela ponte (a tarefa do Claude com a integração Meta Ads), sem chave própria. */
  ponte?: { em: string }
}
export type RespostaDaMeta = PainelDaMeta | { semChave: true } | { chaveInvalida: true; erro: string }
export interface DetalheDoAnuncio { porDia: Array<Metricas & { dia: string }>; idadeGenero: Quebra[]; posicionamento: Quebra[] }

interface Etapas { cadastros: number; questionario: number; contas: number; notificacoes: number; live: number; liberados: number }
export interface FunilDoBanco {
  total: Etapas; anuncio: Etapas
  porAnuncio: Array<{ id: string; cadastros: number; questionario: number; notificacoes: number; live: number; liberados: number }>
  porDia: Array<{ dia: string; cadastros: number; deAnuncio: number }>
  porOrigem: Array<{ origem: string; cadastros: number }>
  servidor: { enviados: number; semChave: number; erros: number }
  /** Passos da página antes do cadastro (parceiro_toques e funil_passos). */
  passos?: { visitas: number; formulario: number; clicou: number; comecou: number }
  /** Os mesmos passos só de quem veio dos anúncios (Central de rastreio, desde 04/11/2026). */
  passosAnuncio?: { visitas: number; formulario: number; clicou: number; comecou: number }
}

async function funcao<T>(sessao: SessaoTeeds, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/meta-ads`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ marca: MARCA.id, ...corpo }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(String(d?.erro || `Não consegui falar com a Meta agora (${r.status}).`))
  return d as T
}
async function rpc<T>(sessao: SessaoTeeds, nome: string, corpo: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(String(e?.message || `Não consegui falar com o banco agora (${r.status}).`)) }
  // salvar e copiar a chave não devolvem nada (corpo vazio): não é erro
  const texto = await r.text()
  return (texto ? JSON.parse(texto) : null) as T
}

/** O que a tela usa; o laboratório troca por números de exemplo. */
export interface ApiAnuncios {
  painel: (sessao: SessaoTeeds, parceiro: string, de: string, ate: string, forcar?: boolean) => Promise<RespostaDaMeta>
  resumo: (sessao: SessaoTeeds, parceiro: string, de: string, ate: string) => Promise<{ total: Metricas; em: string } | { semChave: true } | { chaveInvalida: true; erro: string }>
  anuncio: (sessao: SessaoTeeds, parceiro: string, id: string, de: string, ate: string) => Promise<DetalheDoAnuncio>
  funil: (sessao: SessaoTeeds, parceiro: string, de: string, ate: string) => Promise<FunilDoBanco>
  salvarChave: (sessao: SessaoTeeds, parceiro: string, chave: string) => Promise<unknown>
  /** copia, no servidor, a chave de um parceiro para outro do mesmo gerenciador de negócios */
  copiarChave: (sessao: SessaoTeeds, de: string, para: string) => Promise<unknown>
  horarios: (sessao: SessaoTeeds, parceiro: string, de: string, ate: string) => Promise<Horarios>
  /** as contas (com pixels) e páginas que a chave guardada enxerga */
  descobrir: (sessao: SessaoTeeds, parceiro: string) => Promise<Descoberta | { semChave: true } | { chaveInvalida: true; erro: string }>
  /** a conta, o pixel e a página que o parceiro passa a usar no painel, no Estúdio e no pixel do servidor */
  escolher: (sessao: SessaoTeeds, parceiro: string, conta: string, pixel: string, pagina: string | null) => Promise<unknown>
}
export interface Descoberta {
  atual: { conta: string; pixel: string; pagina: string | null }
  contas: Array<{ id: string; nome: string; status: number; moeda: string; negocio: string; pixels: Array<{ id: string; nome: string }> }>
  paginas: Array<{ id: string; nome: string; instagram: { id: string; usuario: string } | null }>
}
export interface Horarios { porHora: Array<{ hora: number; cadastros: number; deAnuncio: number }>; porSemana: Array<{ dia: number; cadastros: number; deAnuncio: number }> }
export const API_DO_BANCO: ApiAnuncios = {
  painel: (s, parceiro, de, ate, forcar) => funcao(s, { acao: 'painel', parceiro, de, ate, forcar: !!forcar }),
  resumo: (s, parceiro, de, ate) => funcao(s, { acao: 'resumo', parceiro, de, ate }),
  anuncio: (s, parceiro, id, de, ate) => funcao(s, { acao: 'anuncio', parceiro, id, de, ate }),
  funil: (s, parceiro, de, ate) => rpc(s, 'teeds_meta_funil', { p_marca: MARCA.id, p_parceiro: parceiro, p_de: de, p_ate: ate }),
  salvarChave: (s, parceiro, chave) => rpc(s, 'teeds_meta_ads_chave_salvar', { p_marca: MARCA.id, p_parceiro: parceiro, p_chave: chave }),
  copiarChave: (s, de, para) => rpc(s, 'teeds_meta_ads_chave_copiar', { p_marca: MARCA.id, p_de: de, p_para: para }),
  horarios: (s, parceiro, de, ate) => rpc(s, 'teeds_meta_horarios', { p_marca: MARCA.id, p_parceiro: parceiro, p_de: de, p_ate: ate }),
  descobrir: (s, parceiro) => funcao(s, { acao: 'descobrir', parceiro, de: '2026-01-01', ate: '2026-01-01' }),
  escolher: (s, parceiro, conta, pixel, pagina) => funcao(s, { acao: 'escolher', parceiro, conta, pixel, pagina, de: '2026-01-01', ate: '2026-01-01' }),
}

/**
 * Os parceiros que têm conta de anúncios ligada (o mesmo mapa de supabase/functions/meta-ads).
 * Contas no mesmo gerenciador de negócios (`negocio`) dividem a chave ("Usar a mesma chave").
 * 03/11/2026: o Victor anuncia por um login novo, com uma conta escolhida na tela depois de colar a
 * chave (descobrir/escolher); `contaNome` vazio = ainda não escolhida.
 */
export interface ContaDeAnuncio { codigo: string; nome: string; conta: string; contaNome: string; pixelNome: string; negocio: string }
export const CONTAS_DE_ANUNCIO: Partial<Record<string, ContaDeAnuncio[]>> = {
  globalfly: [
    { codigo: 'n', nome: 'Naor', conta: '977357031377237', contaNome: 'CA - NAOR BEZERRA', pixelNome: 'PIXEL - NAOR BEZERRA OFICIAL', negocio: '1170351821880082' },
    // 03/11/2026: o login Daniel Campione travou na verificação em duas etapas; volta a CA Victor Cordeiro Real
    // (livre: sem campanha ativa e sem gasto desde outubro, pagamento em dia), do mesmo gerenciador do Naor
    { codigo: 'v', nome: 'Victor', conta: '854985874324156', contaNome: 'CA Victor Cordeiro Real', pixelNome: 'Pixel Victor Cordeiro ATIVO', negocio: '1170351821880082' },
  ],
}
