/**
 * O que o painel de monitoramento lê — e a única coisa que ele escreve
 * (a auditoria de quem abriu o quê).
 *
 * Tudo por REST puro com o token do admin. A RLS do banco é quem decide o
 * que volta: só o admin da marca enxerga estas tabelas, e cada consulta
 * ainda filtra `marca` explicitamente — uma marca não vaza na outra nem se
 * alguém for admin das duas ao mesmo tempo.
 *
 * A auditoria é "fail-closed": se o registro falhar, `auditar` lança, e a
 * tela não abre a cabine nem o replay. Sem registro não há visualização.
 */

import { SUPABASE, autenticacaoConfigurada } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import { LIMITES, type EventoEspelho, type SessaoEspelho } from './espelho'

export class ErroDoMonitoramento extends Error {
  constructor(message: string, readonly status: number, readonly codigo?: string) { super(message); this.name = 'ErroDoMonitoramento' }
  /** 401/403 e os códigos de RLS/permissão do Postgres. */
  get semPermissao() { return this.status === 401 || this.status === 403 || this.codigo === '42501' || this.codigo === '28000' }
}

function cabecalhos(token: string): Record<string, string> {
  return { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}
async function rest<T>(caminho: string, token: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, { ...init, headers: { ...cabecalhos(token), ...(init.headers as Record<string, string> ?? {}) } })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    throw new ErroDoMonitoramento('Supabase indisponível — sem resposta da rede', 0)
  }
  if (!res.ok) {
    const c = await res.json().catch(() => ({}))
    throw new ErroDoMonitoramento(c?.message || `Erro ${res.status} ao ler o monitoramento`, res.status, c?.code)
  }
  if (res.status === 204) return undefined as T
  return (await res.json().catch(() => undefined)) as T
}

/* ------------------------------------------------------------- leitura */

/** Uma linha de sessoes_robos_ao_vivo (já com a mãe em sessoes_robos) no formato do painel. */
export function paraSessaoEspelho(l: Record<string, any>, mae?: Record<string, any> | null, recebidoEm = Date.now()): SessaoEspelho {
  const s = mae ?? l.sessoes_robos ?? {}
  return {
    sessaoId: l.sessao_id, sessaoRef: s.sessao_ref ?? '', marca: l.marca, userId: l.user_id,
    contaId: s.conta_id ?? '', demo: Boolean(s.demo ?? true), moeda: s.moeda ?? 'USD',
    roboId: s.robo_id ?? '', roboNome: s.robo_nome ?? '', ativo: s.ativo ?? '',
    config: l.config ?? {}, seq: Number(l.seq ?? 0), origemDoSeq: 'foto', estado: l.estado ?? {},
    situacao: (s.situacao ?? 'rodando') as SessaoEspelho['situacao'],
    emitidoEm: Number(l.emitido_em ?? 0), recebidoEm, atualizadaEm: l.atualizada_em ?? '', criadaEm: s.criada_em ?? '',
  }
}

const SELECAO = 'sessao_id,marca,user_id,seq,fase,estado,config,emitido_em,atualizada_em,sessoes_robos!inner(sessao_ref,conta_id,demo,moeda,robo_id,robo_nome,ativo,situacao,criada_em,encerrada_em,motivo_da_parada)'

/** As fotos das sessões desta marca: as vivas e as encerradas nas últimas horas. */
export async function listarEspelhos(sessao: SessaoTeeds, horas = 12, signal?: AbortSignal): Promise<SessaoEspelho[]> {
  if (!autenticacaoConfigurada()) return []
  const corte = new Date(Date.now() - horas * 3600_000).toISOString()
  const linhas = await rest<any[]>(
    `/sessoes_robos_ao_vivo?select=${encodeURIComponent(SELECAO)}&marca=eq.${MARCA.id}&atualizada_em=gte.${encodeURIComponent(corte)}&order=atualizada_em.desc&limit=300`,
    sessao.token, { signal },
  )
  const recebido = Date.now()
  return (linhas ?? []).map((l) => paraSessaoEspelho(l, null, recebido))
}

/** A foto de uma sessão só (snapshot ao entrar no foco ou ao reconectar). */
export async function lerEspelho(sessao: SessaoTeeds, sessaoId: string, signal?: AbortSignal): Promise<SessaoEspelho | null> {
  const linhas = await rest<any[]>(
    `/sessoes_robos_ao_vivo?select=${encodeURIComponent(SELECAO)}&marca=eq.${MARCA.id}&sessao_id=eq.${encodeURIComponent(sessaoId)}&limit=1`,
    sessao.token, { signal },
  )
  return linhas?.[0] ? paraSessaoEspelho(linhas[0]) : null
}

/** A mãe de uma sessão em sessoes_robos — para sessões antigas cuja foto já foi limpa. */
export async function lerSessaoMae(sessao: SessaoTeeds, sessaoId: string, signal?: AbortSignal): Promise<Record<string, any> | null> {
  const linhas = await rest<any[]>(`/sessoes_robos?select=*&marca=eq.${MARCA.id}&id=eq.${encodeURIComponent(sessaoId)}&limit=1`, sessao.token, { signal })
  return linhas?.[0] ?? null
}

export function paraEvento(l: Record<string, any>): EventoEspelho {
  return { id: l.id, sessaoId: l.sessao_id, marca: l.marca, seq: Number(l.seq), tipo: l.tipo, delta: l.delta ?? {}, config: l.config ?? undefined, emitidoEm: Number(l.emitido_em ?? 0), criadoEm: l.criado_em }
}

/** Uma página de eventos de uma sessão, em ordem, a partir de uma seq. */
export async function eventosDaSessao(sessao: SessaoTeeds, sessaoId: string, aPartirDeSeq = 0, limite = 500, signal?: AbortSignal): Promise<EventoEspelho[]> {
  const linhas = await rest<any[]>(
    `/eventos_robos_ao_vivo?select=id,sessao_id,marca,seq,tipo,delta,config,emitido_em,criado_em&marca=eq.${MARCA.id}&sessao_id=eq.${encodeURIComponent(sessaoId)}&seq=gt.${aPartirDeSeq}&order=seq.asc&limit=${limite}`,
    sessao.token, { signal },
  )
  return (linhas ?? []).map(paraEvento)
}

/**
 * Todos os eventos de uma sessão, página a página, cancelável. Chama
 * `aoProgresso` a cada página para a tela mostrar que está carregando.
 * Um AbortError sai como exceção — quem chama trata a troca de sessão.
 */
export async function carregarEventos(sessao: SessaoTeeds, sessaoId: string, signal: AbortSignal, aoProgresso?: (carregados: number) => void, tamanho = 500): Promise<EventoEspelho[]> {
  const todos: EventoEspelho[] = []
  let desde = 0
  for (let pagina = 0; pagina < 200; pagina++) {
    if (signal.aborted) throw new DOMException('cancelado', 'AbortError')
    const lote = await eventosDaSessao(sessao, sessaoId, desde, tamanho, signal)
    todos.push(...lote)
    aoProgresso?.(todos.length)
    if (lote.length < tamanho) break
    desde = lote[lote.length - 1].seq
  }
  return todos
}

export interface SessaoEncerrada {
  id: string; sessaoRef: string; userId: string; contaId: string; demo: boolean; moeda: string
  roboId: string; roboNome: string; ativo: string; situacao: string; operacoes: number; ganhas: number; perdidas: number
  resultado: number; motivoDaParada: string | null; criadaEm: string; encerradaEm: string | null
}

/** Sessões encerradas desta marca, para o replay. O padrão cobre a retenção inteira dos eventos. */
export async function listarEncerradas(sessao: SessaoTeeds, dias: number = LIMITES.retencaoEventosDias, limite = 300, signal?: AbortSignal): Promise<SessaoEncerrada[]> {
  const corte = new Date(Date.now() - dias * 86400_000).toISOString()
  const linhas = await rest<any[]>(
    `/sessoes_robos?select=id,sessao_ref,user_id,conta_id,demo,moeda,robo_id,robo_nome,ativo,situacao,operacoes,ganhas,perdidas,resultado,motivo_da_parada,criada_em,encerrada_em&marca=eq.${MARCA.id}&situacao=neq.rodando&criada_em=gte.${encodeURIComponent(corte)}&order=criada_em.desc&limit=${limite}`,
    sessao.token, { signal },
  )
  return (linhas ?? []).map((l) => ({
    id: l.id, sessaoRef: l.sessao_ref ?? '', userId: l.user_id, contaId: l.conta_id, demo: Boolean(l.demo), moeda: l.moeda,
    roboId: l.robo_id, roboNome: l.robo_nome, ativo: l.ativo, situacao: l.situacao, operacoes: l.operacoes ?? 0, ganhas: l.ganhas ?? 0,
    perdidas: l.perdidas ?? 0, resultado: Number(l.resultado ?? 0), motivoDaParada: l.motivo_da_parada, criadaEm: l.criada_em, encerradaEm: l.encerrada_em,
  }))
}

/* ------------------------------------------------------------ auditoria */

export type TipoAuditoria = 'painel' | 'ao-vivo' | 'replay' | 'busca'
export type AcaoAuditoria = 'abriu' | 'fechou' | 'buscou' | 'exportou' | 'negado'

/**
 * Registra no banco quem abriu o quê. LANÇA em falha: quem chama decide o
 * que fazer — e para cabine e replay a regra é não abrir sem registro.
 * O banco confere de novo: admin da marca, sessão e cliente da marca, e
 * que combinam entre si.
 */
export async function auditar(sessao: SessaoTeeds, dados: { tipo: TipoAuditoria; acao: AcaoAuditoria; sessaoId?: string | null; clienteId?: string | null }): Promise<number> {
  const id = await rest<number>('/rpc/teeds_auditar_monitoramento', sessao.token, {
    method: 'POST',
    body: JSON.stringify({ p_marca: MARCA.id, p_tipo: dados.tipo, p_acao: dados.acao, p_sessao_id: dados.sessaoId ?? null, p_cliente_id: dados.clienteId ?? null }),
  })
  return Number(id)
}

/** Alguém sem permissão chegou à tela: fica registrado que tentou (sem detalhes). Nunca lança. */
export async function auditarNegado(sessao: SessaoTeeds): Promise<boolean> {
  try {
    await rest('/rpc/teeds_auditar_negado', sessao.token, { method: 'POST', body: JSON.stringify({ p_marca: MARCA.id }) })
    return true
  } catch { return false }
}

export interface RegistroAuditoria { id: number; adminId: string; clienteId: string | null; sessaoId: string | null; tipo: string; acao: string; criadoEm: string }

export async function listarAuditoria(sessao: SessaoTeeds, limite = 300, signal?: AbortSignal): Promise<RegistroAuditoria[]> {
  const linhas = await rest<any[]>(`/auditoria_monitoramento_admin?select=*&marca=eq.${MARCA.id}&order=criado_em.desc&limit=${limite}`, sessao.token, { signal })
  return (linhas ?? []).map((l) => ({ id: l.id, adminId: l.admin_id, clienteId: l.cliente_id, sessaoId: l.sessao_id, tipo: l.tipo, acao: l.acao, criadoEm: l.criado_em }))
}
