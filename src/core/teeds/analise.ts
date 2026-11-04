/**
 * A leitura da I.A. na Visão geral dos anúncios (04/11/2026, Tiago: "um panorama interpretado pela I.A.,
 * um plano de ação e um botão Otimizar campanhas com um modal para aprovar"). Fala com a função
 * meta-analise; a análise roda em segundo plano e a tela pergunta de novo até ficar pronta.
 */
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

export type TipoDeMudanca = 'orcamento' | 'pausar' | 'ligar' | 'duplicar' | 'novo_publico'
export interface PublicoNovo { idadeMin: number; idadeMax: number; genero: 'todos' | 'homens' | 'mulheres'; estados: string[]; ondeAparece: string[] }
export interface Mudanca {
  id: string; tipo: TipoDeMudanca; alvoTipo: 'campanha' | 'conjunto' | 'anuncio'; alvoId: string; alvoNome: string
  nome: string; diarioDe: number; diarioPara: number; ligar: boolean; publico: PublicoNovo; porque: string; risco: 'baixo' | 'medio' | 'alto'
}
export interface LeituraDaIA {
  resumo: string
  panorama: Array<{ tipo: 'bom' | 'atencao' | 'critico' | 'info'; titulo: string; texto: string }>
  plano: Array<{ titulo: string; porque: string; impacto: 'alto' | 'medio' | 'baixo'; quando: 'agora' | 'esta-semana' | 'depois-da-live' }>
  mudancas: Mudanca[]
  alerta: string
}
export interface ResultadoDaMudanca { id: string; ok: boolean; mensagem: string; criadoId?: string | null }
export type SituacaoDaAnalise = 'analisando' | 'pronta' | 'erro' | 'aplicada' | 'parcial'
export interface Analise {
  id: string; situacao: SituacaoDaAnalise; dados: LeituraDaIA | null; erro: string | null
  criadoEm: string; prontaEm: string | null; aplicadoEm: string | null; resultado: ResultadoDaMudanca[] | null; quem: string | null; modelo: string | null
  de: string; ate: string
}
export interface EstadoDaAnalise { temIA: boolean; analise: Analise | null }

export interface ApiAnalise {
  ultima: (sessao: SessaoTeeds, parceiro: string, de: string, ate: string) => Promise<EstadoDaAnalise>
  analisar: (sessao: SessaoTeeds, parceiro: string, de: string, ate: string, forcar?: boolean) => Promise<EstadoDaAnalise>
  aplicar: (sessao: SessaoTeeds, parceiro: string, id: string, escolhidas: string[]) => Promise<{ situacao: SituacaoDaAnalise; resultado: ResultadoDaMudanca[] }>
  /** A chave da Anthropic, colada na tela: o servidor testa, guarda e nunca devolve. */
  salvarChave: (sessao: SessaoTeeds, parceiro: string, valor: string) => Promise<void>
}

async function funcao<T>(sessao: SessaoTeeds, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/meta-analise`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ marca: MARCA.id, ...corpo }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (d?.semIA) throw new ErroSemIA(String(d.erro))
    throw new Error(String(d?.erro || `Não consegui falar com a I.A. agora (${r.status}).`))
  }
  return d as T
}
/** Falta a chave da I.A. no servidor: a tela explica onde colocar. */
export class ErroSemIA extends Error {}

export const API_DA_ANALISE: ApiAnalise = {
  ultima: (s, parceiro, de, ate) => funcao(s, { acao: 'ultima', parceiro, de, ate }),
  analisar: (s, parceiro, de, ate, forcar = false) => funcao(s, { acao: 'analisar', parceiro, de, ate, forcar }),
  aplicar: (s, parceiro, id, escolhidas) => funcao(s, { acao: 'aplicar', parceiro, id, escolhidas }),
  salvarChave: async (s, parceiro, valor) => { await funcao(s, { acao: 'chave_ia', parceiro, valor }) },
}
