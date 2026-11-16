/**
 * A leitura do "Inteligência do negócio" da Visão geral (16/11/2026): o cruzamento manual x I.A., os
 * clientes, as lives e as recomendações da I.A. Ver NegocioDaVisaoGeral.tsx e a migração
 * 20261116180000_painel_do_negocio.sql.
 */
import type { SessaoTeeds } from './conta'
import { SUPABASE } from './config'

export interface OrigemDoNegocio {
  operacoes: number; pessoas: number; markup: number; volume: number; resultado: number; ganhos: number; perdas: number
  ganhas: number; dias: number; banca: number; com_saldo: number; lucrando: number; perdendo: number; lucro: number
  prejuizo: number; depositos: number; dias_media: number; markup_mediano: number
}
export type PerfilDoCliente = 'ia' | 'manual' | 'duas'
export interface LiveDoNegocio {
  inicio: string; fim: string; origem: 'link' | 'lancamento' | 'estimada' | 'plataforma'; estimada: boolean
  markup: number; markup_ia: number; markup_manual: number; operacoes: number; pessoas: number; volume: number
  resultado: number; tipico: number; depositos: number; entraram: number
}
export interface Negocio {
  de: string; ate: string; lido_em?: string
  origens: { ia?: OrigemDoNegocio; manual?: OrigemDoNegocio }
  perfis: Array<{ perfil: PerfilDoCliente; pessoas: number; markup: number; markup_ia: number; markup_manual: number; operacoes: number
    volume: number; resultado: number; lucrando: number; perdendo: number; banca: number; depositos: number; saques: number; dias_media: number }>
  faixas: Array<{ faixa: number; pessoas: number; banca: number; markup: number; markup_ia: number; markup_manual: number; resultado: number; volume: number; operacoes: number }>
  clientes: {
    lucrando: { pessoas: number; markup: number; resultado: number; banca: number }
    perdendo: { pessoas: number; markup: number; resultado: number; banca: number }
    zerados: number; sem_saldo: number; markup_sem_saldo: number; um_dia_so: number; tres_dias_ou_mais: number; markup_tres_dias: number
  }
  rotulos: Array<{ origem: 'ia' | 'manual'; nome: string; operacoes: number; pessoas: number; markup: number; volume: number; resultado: number; ganhas: number }>
  dias: Array<{ dia: string; ia: number; manual: number; ia_ops: number; manual_ops: number; ia_pessoas: number; manual_pessoas: number }>
  horas: Array<{ hora: number; ia: number; manual: number }>
  semana: Array<{ d: number; ia: number; manual: number; vezes: number }>
  top: Array<{ user_id: string; nome: string | null; foto_url: string | null; parceiro: string | null; perfil: PerfilDoCliente; markup: number
    markup_ia: number; markup_manual: number; resultado: number; saldo: number; operacoes: number; dias: number; depositos: number }>
  lives: LiveDoNegocio[]
  lives_resumo: { lives: number; horas_live: number; horas_fora: number; markup_live: number; markup_fora: number; tipico_live: number }
}

export async function lerNegocio(sessao: SessaoTeeds, marca: string, parceiro: string, de: number, ate: number): Promise<Negocio> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_painel_negocio`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_de: new Date(de).toISOString(), p_ate: new Date(ate).toISOString(), p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error('Não foi possível ler os números do negócio agora.')
  return r.json()
}

/* ------------------------------------------------------------------ as recomendações da I.A. */
export type CategoriaDaDica = 'horario' | 'ia' | 'manual' | 'lives' | 'clientes' | 'banca'
export interface LeituraDaIA {
  resumo: string
  veredito: { onde: 'ia' | 'manual' | 'as_duas' | 'cedo'; titulo: string; texto: string }
  recomendacoes: Array<{ titulo: string; porque: string; como: string; categoria: CategoriaDaDica; impacto: 'alto' | 'medio' | 'baixo' }>
  lives: string
  alertas: string[]
}
export interface AnaliseDoNegocio {
  id: string; situacao: 'analisando' | 'pronta' | 'erro'; dados: LeituraDaIA | null; erro: string | null
  criadoEm: string; prontaEm: string | null; quem: string | null; de: string; ate: string; motor?: MotorDaIA
}
export type MotorDaIA = 'gemini' | 'anthropic' | null
export interface EstadoDaLeitura {
  temIA: boolean; analise: AnaliseDoNegocio | null
  /** Qual I.A. está valendo: a faixa gratuita do Gemini (quando a chave dela está guardada) ou a Anthropic. */
  motor?: MotorDaIA
  /** Quem está na tela pode colar ou tirar a chave (só o admin geral). */
  podeColar?: boolean
}
/** Falta a chave da I.A. no servidor: a tela explica onde colocar. */
export class ErroSemIA extends Error {}

async function funcao<T = EstadoDaLeitura>(sessao: SessaoTeeds, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/negocio-analise`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (d?.semIA) throw new ErroSemIA(String(d.erro))
    throw new Error(String(d?.erro || `Não consegui falar com a I.A. agora (${r.status}).`))
  }
  return d as T
}

export const ultimaLeitura = (s: SessaoTeeds, marca: string, parceiro: string, periodo: string) =>
  funcao(s, { acao: 'ultima', marca, parceiro, periodo })
export const pedirLeitura = (s: SessaoTeeds, marca: string, parceiro: string, periodo: string, de: number, ate: number, rotulo: string, forcar = false) =>
  funcao(s, { acao: 'analisar', marca, parceiro, periodo, de: new Date(de).toISOString(), ate: new Date(ate).toISOString(), rotulo, forcar })
/** A chave gratuita do Gemini, colada no cartão: o servidor testa no Google, guarda e nunca devolve. */
export const salvarChaveDoGemini = (s: SessaoTeeds, marca: string, valor: string) => funcao<{ ok: boolean }>(s, { acao: 'chave_gemini', marca, valor })
export const tirarChaveDoGemini = (s: SessaoTeeds, marca: string) => funcao<{ ok: boolean }>(s, { acao: 'remover_gemini', marca })
