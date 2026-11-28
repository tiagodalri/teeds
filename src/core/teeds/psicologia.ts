/**
 * Psicologia do aluno (27/11/2026): Administração › Números › Psicologia do aluno.
 * O banco cruza no tempo tudo o que a plataforma registra de cada aluno (aulas, depósitos, saques, I.A.,
 * manual, acessos, lives, avisos, suporte) e devolve os números; as frases são montadas em
 * components/admin/psicologia/sacadas.ts. Funções no banco: teeds_psicologia, teeds_psicologia_lista e
 * teeds_psicologia_aluno (mesma trava de teeds_aulas_controle).
 */
import type { SessaoTeeds } from './conta'
import { SUPABASE } from './config'

export type FimDaSessao = 'stop' | 'meta' | 'zerou' | 'parou_ganhando' | 'parou_perdendo' | 'parou_zero'
export type PerfilDoAluno = 'sumiu_na_perda' | 'revanche' | 'disciplinado' | 'lucrando' | 'operando' | 'depositou_parado'
  | 'estuda_nao_deposita' | 'so_no_treino' | 'curioso' | 'parado_no_cadastro'

export interface AulaDaPsicologia {
  aula_id: string; titulo: string; modulo: string | null; viram: number; concluiram: number; reviram: number
  sem_dep: number; d30m: number; d24h: number; d7d: number; min_mediano: number | null; gatilho: number
}
export interface FimDeSessao {
  fim: FimDaSessao; n: number; pessoas: number; resultado: number; seg_mediano: number; volta2: number; volta10: number
  aumentou: number; trocou: number; resultado_volta: number; volta_ganhou: number; dep60: number; saque24: number
}
export interface HoraDoDia { hora: number; ops: number; pessoas: number; resultado: number; deps: number; dep_valor: number; saques: number; aulas: number }
export interface DiaDaSemana { d: number; ops: number; pessoas: number; resultado: number; deps: number; dep_valor: number; aulas: number; dias: number }
export type TipoDeHistoria = 'aula_deposito' | 'cadeia' | 'zerou_deposito' | 'passou_da_meta' | 'perda_aula' | 'saque_deposito'
export interface Historia {
  tipo: TipoDeHistoria; user_id: string; nome: string; foto_url: string | null; parceiro: string | null; quando: string
  d: Record<string, number | string | boolean | null>
}

export interface Psicologia {
  lido_em: string; parceiro: string | null
  base: { alunos: number; com_aula: number; com_conta: number; com_real: number; depositaram: number; operaram: number; markup: number
    dep_total: number; dep_n: number; saq_total: number; resultado: number; lucrando: number; perdendo: number }
  jornada: { h_ate_aula: number | null; h_ate_dep: number | null; min_dep_op: number | null; h_aula_dep: number | null; dep_sem_aula: number
    dep_com_aula: number; dep1_mediano: number | null; dia0: number; dia1a3: number; dia4a7: number; dia8: number }
  estudo: Array<{ ordem: number; pessoas: number; depositaram: number; dep_total: number; markup: number; operaram: number; resultado: number
    lucrando: number; perdas: number; revanches: number; dias_media: number | null }> | null
  perfis: Array<{ perfil: PerfilDoAluno; pessoas: number; markup: number; dep_total: number; resultado: number; saldo: number; vistos_7d: number }> | null
  dep1_faixas: Array<{ ordem: number; pessoas: number; voltaram: number; markup: number; dep_total: number; resultado: number; dias_media: number | null }> | null
  redeposito: { uma_vez: number; duas_ou_mais: number; cinco_ou_mais: number; h_ate_segundo: number | null; segundo_em_24h: number; markup_uma: number; markup_duas: number }
  saques: { sacaram: number; depositaram_depois: number; operaram_depois: number; sacou_mais_que_pos: number; h_dep_saque: number | null; total: number }
  sinais: Record<'foto' | 'foto_dep' | 'sem_foto' | 'sem_foto_dep' | 'push' | 'push_dep' | 'sem_push' | 'sem_push_dep' | 'bio' | 'bio_dep' | 'sem_bio'
    | 'sem_bio_dep' | 'suporte' | 'suporte_dep', number>
  treino: { ganhou: number; ganhou_dep: number; perdeu: number; perdeu_dep: number; sem_treino: number; sem_treino_dep: number; direto_real: number }
  gerenciamento: { viu: number; viu_perdas: number; viu_revanches: number; viu_zerou: number; viu_resultado: number
    nao: number; nao_perdas: number; nao_revanches: number; nao_zerou: number; nao_resultado: number }
  sumico: { negativo: number; negativo_sumiu: number; positivo: number; positivo_sumiu: number; saldo_parado: number; markup_dos_sumidos: number }
  madrugada: { pessoas: number; forte: number; resultado_forte: number }
  aulas: {
    lista: AulaDaPsicologia[] | null
    conclusao: { concluiu: number; concluiu_dep: number; largou: number; largou_dep: number }
    robos: Array<{ aula_id: string; nome: string; viram: number; ligaram: number; ligaram_real: number; ja_usavam: number }> | null
  }
  sessoes: {
    fins: FimDeSessao[] | null
    calor: { quente: number; quente_ganhou: number; quente_resultado: number; frio: number; frio_ganhou: number; frio_resultado: number }
    cadeias: { n: number; pessoas: number; resultado: number; sessoes: number; maior: number; positivas: number }
    robos: Array<{ nome: string; n: number; pessoas: number; resultado: number; perdas: number; revanches: number; metas: number }> | null
    limites: { stop_mediano: number | null; meta_mediana: number | null; stop_maior_que_meta: number; total: number; meta_maior: number; res_stop_maior: number; res_meta_maior: number }
  }
  manual: { apos_perda: number; apos_ganho: number; seg_apos_perda: number | null; seg_apos_ganho: number | null; dobrou_apos_perda: number; dobrou_apos_ganho: number
    dobrou_ganhou: number; dobrou_resultado: number; igual_apos_perda: number; igual_ganhou: number; igual_resultado: number; rapida_apos_perda: number; pessoas: number }
  tempo: { horas: HoraDoDia[] | null; semana: DiaDaSemana[] | null }
  lives: { lives: number; horas_live: number; horas_fora: number; dep_live: number; dep_live_valor: number; dep_fora: number; dep_fora_valor: number
    sess_live: number; sess_fora: number; perdas_live: number; rev_live: number; perdas_fora: number; rev_fora: number; res_live: number; res_fora: number
    top: Array<{ inicio: string; minutos: number; deps: number; valor: number }> | null }
  depositos: { total: number; valor: number; no_calor: number; no_calor_valor: number; no_calor_pessoas: number; no_calor_depois: number; no_calor_perdeu: number
    a_frio: number; a_frio_depois: number; a_frio_perdeu: number; apos_ganho: number; min_ate_operar: number | null; opera_em_5: number; opera_em_24h: number
    perde_em_24h: number; ganha_em_24h: number; devolve_tudo_24h: number }
  extras: {
    avisos: Array<{ titulo: string; criado_em: string; pessoas: number; clicaram: number; abriram: number; depositaram: number }> | null
    sem_saldo: { viram: number; clicaram: number; depositaram_24h: number; depositaram_7d: number; vezes_mediana: number | null; insistiram: number }
    telas: Array<{ pagina: string; seg_dep: number; seg_nao: number; pessoas_dep: number; pessoas_nao: number }> | null
    suporte: { pessoas: number; antes_do_deposito: number; depositou_24h: number; depositou_7d: number }
  }
  historias: Historia[]
}

export interface AlunoDaPsicologia {
  user_id: string; nome: string; foto_url: string | null; parceiro: string | null; categoria: string | null; criado_em: string; visto_em: string | null
  acessos: number; tempo_seg: number; abertas: number; concl: number; viu_ger: boolean; saldo: number
  dep_n: number; dep_total: number; dep1_em: string | null; dep_ult_em: string | null; saq_n: number; saq_total: number
  ops: number; resultado: number; markup: number; dias: number; op_ult_em: string | null; madrugada: number; ult_dia_res: number | null
  demo_n: number; sess: number; stops: number; metas: number; zerou: number; perdas: number; revanches: number; passou_meta: number
  man_apos_perda: number; man_dobras: number; perfil: PerfilDoAluno
}

export type TipoDeEvento = 'cadastro' | 'termos' | 'conta' | 'aula' | 'aula_de_novo' | 'deposito' | 'saque' | 'ia' | 'manual' | 'suporte'
  | 'aviso_saldo' | 'aviso_clicado' | 'acesso'
export interface EventoDoAluno { tipo: TipoDeEvento; em: string; d: Record<string, number | string | boolean | null> }
export interface LinhaDoTempoDoAluno {
  aluno: { user_id: string; nome: string; foto_url: string | null; parceiro: string | null; criado_em: string; visto_em: string | null; cidade: string | null; regiao: string | null }
  eventos: EventoDoAluno[]
}

async function rpc<T>(sessao: SessaoTeeds, nome: string, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) throw new Error('Não foi possível ler o comportamento dos alunos agora.')
  return r.json()
}

export const lerPsicologia = (sessao: SessaoTeeds, marca: string, parceiro: string) =>
  rpc<Psicologia>(sessao, 'teeds_psicologia', { p_marca: marca, p_parceiro: parceiro || null })
export const lerAlunosDaPsicologia = (sessao: SessaoTeeds, marca: string, parceiro: string) =>
  rpc<AlunoDaPsicologia[]>(sessao, 'teeds_psicologia_lista', { p_marca: marca, p_parceiro: parceiro || null })
export const lerLinhaDoTempo = (sessao: SessaoTeeds, marca: string, user: string) =>
  rpc<LinhaDoTempoDoAluno>(sessao, 'teeds_psicologia_aluno', { p_marca: marca, p_user: user })

/* ------------------------------------------------------------------ a central investigativa */
export interface LadoDoGrupo { n: number; aulas: number | null; dep1: number | null; dias_ate_dep: number | null; dias_operando: number | null; markup: number | null
  depositado: number | null; markup_total: number; dep_total: number }
export interface GrupoDaInvestigacao { fatores: Array<{ fator: string; g_sim: number; g_n: number; r_sim: number; r_n: number }> | null; dentro: LadoDoGrupo | null; fora: LadoDoGrupo | null }
export interface Investigacao {
  lido_em: string
  numeros: { depositantes: number; depositos: number; depositado: number; deposito_medio: number; por_depositante_medio: number; por_depositante_mediano: number
    depositos_por_pessoa: number; redepositaram: number; sacado: number; saldo_parado: number; operaram: number; volume: number; markup: number; resultado: number
    giro: number; markup_por_depositante: number; markup_sobre_deposito: number; markup_sobre_volume: number; markup_por_dia_ativo: number
    vida_mediana_dias: number | null; dias_operando_mediana: number | null; ativos_7d: number; pararam: number; vida_de_quem_parou: number | null; markup_de_quem_parou: number } | null
  redeposito: { h_entre_depositos: number | null; segundo_maior: number; segundo_menor: number; segundo_igual: number; valor_1: number | null; valor_2: number | null
    valor_3mais: number | null; em_1h: number; em_24h: number; total: number }
  sobrevivencia: Array<{ dias: number; base: number; seguem: number }> | null
  concentracao: { geradores: number; top10: number; top20pct: number }
  estrategias: Array<{ nome: string; operacoes: number; alunos: number; markup: number | null; volume: number; resultado: number; ganhas: number }> | null
  cortes: { deposito_alto: number; top_markup: number }
  grupos: Record<'redeposito' | 'deposito_alto' | 'top_markup', GrupoDaInvestigacao> | null
}
/** Duas partes da tela pedem a mesma leitura ao mesmo tempo: a segunda aproveita a primeira (vale 20 segundos). */
const investigacoes = new Map<string, { em: number; pedido: Promise<Investigacao> }>()
export function lerInvestigacao(sessao: SessaoTeeds, marca: string, parceiro: string): Promise<Investigacao> {
  const chave = `${marca}:${parceiro}`, guardada = investigacoes.get(chave)
  if (guardada && Date.now() - guardada.em < 20_000) return guardada.pedido
  const pedido = rpc<Investigacao>(sessao, 'teeds_psicologia_investigacao', { p_marca: marca, p_parceiro: parceiro || null })
  investigacoes.set(chave, { em: Date.now(), pedido })
  pedido.catch(() => investigacoes.delete(chave))
  return pedido
}

/* ------------------------------------------------------------------ o consultor (chat com a I.A.) */
export interface AnexoDoConsultor { mime: string; dados: string; nome?: string }
export interface RespostaDoConsultor { resposta: string; modelo?: string; alunos_citados?: string[]; consultas?: number }
/** Erro com a frase já pronta para a tela (vem da função psicologia-consultor). */
export class ErroDoConsultor extends Error {}

export async function perguntarAoConsultor(sessao: SessaoTeeds, marca: string, parceiro: string, pergunta: string,
  historico: Array<{ de: 'eu' | 'ia'; texto: string }>, anexos: AnexoDoConsultor[]): Promise<RespostaDoConsultor> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/psicologia-consultor`, {
    method: 'POST', signal: AbortSignal.timeout(150_000),
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ marca, parceiro: parceiro && parceiro !== 'todos' ? parceiro : '', pergunta, historico, anexos }),
  })
  const d = await r.json().catch(() => null) as (RespostaDoConsultor & { erro?: string }) | null
  if (!r.ok || !d?.resposta) throw new ErroDoConsultor(d?.erro || 'A I.A. não respondeu agora. Tente de novo em instantes.')
  return d
}
