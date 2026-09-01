/**
 * O cadastro de clientes da Teeds, no Supabase.
 *
 * Cada usuario grava (e enxerga) so o proprio registro — as regras de RLS
 * garantem isso no servidor, nao aqui. Administradores (tabela
 * `administradores`) leem tudo: e o que alimenta a visao de clientes no
 * painel de Gestao.
 *
 * Tres tabelas: `clientes` (um por usuario, espelho do cadastro),
 * `contas_deriv` (cada conta da corretora que ele conectou) e
 * `comissoes_diarias` (a comissao agregada por conta e por dia, que o
 * proprio app envia). Tudo em REST puro (PostgREST), sem biblioteca,
 * como o resto da Teeds.
 */

import { SUPABASE, autenticacaoConfigurada } from './config'
import type { SessaoTeeds } from './conta'

function cabecalhos(token: string): Record<string, string> {
  return {
    apikey: SUPABASE.anonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function rest<T>(caminho: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
    ...init,
    headers: { ...cabecalhos(token), ...(init.headers as Record<string, string> ?? {}) },
  })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(corpo?.message || `Erro ${res.status} ao falar com o banco da Teeds`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json().catch(() => undefined)) as T
}

/** Grava; se a linha ja existir, atualiza — o upsert do PostgREST. */
const MESCLAR = { Prefer: 'resolution=merge-duplicates,return=minimal' }

/* --------------------------------------------------------- escrita */

/**
 * Registra (ou atualiza) o proprio cliente: espelho do cadastro + visto_em.
 * Chamado ao abrir a plataforma logado. Falha em silencio: o cadastro e
 * util, nunca condicao para operar.
 */
export async function registrarPresenca(sessao: SessaoTeeds): Promise<void> {
  if (!autenticacaoConfigurada()) return
  const u = sessao.usuario
  try {
    await rest('/clientes?on_conflict=user_id', sessao.token, {
      method: 'POST',
      headers: MESCLAR,
      body: JSON.stringify({
        user_id: u.id,
        nome: u.nome,
        email: u.email,
        telefone: u.telefone,
        cpf: u.cpf,
        visto_em: new Date().toISOString(),
      }),
    })
  } catch (e) {
    console.warn('[teeds] nao consegui registrar a presenca:', (e as Error).message)
  }
}

/** A conta Deriv que a pessoa conectou agora. */
export async function registrarContaDeriv(
  sessao: SessaoTeeds,
  conta: { accountId: string; type: string; currency: string; balance: number },
): Promise<void> {
  if (!autenticacaoConfigurada()) return
  try {
    await rest('/contas_deriv?on_conflict=user_id,conta_id', sessao.token, {
      method: 'POST',
      headers: MESCLAR,
      body: JSON.stringify({
        user_id: sessao.usuario.id,
        conta_id: conta.accountId,
        tipo: conta.type,
        moeda: conta.currency,
        saldo: conta.balance,
        vista_em: new Date().toISOString(),
      }),
    })
  } catch (e) {
    console.warn('[teeds] nao consegui registrar a conta Deriv:', (e as Error).message)
  }
}

/**
 * Envia a comissao agregada por dia — o resultado de `simularComissao`,
 * que o painel de Gestao ja calcula. Upsert por (usuario, conta, dia):
 * recalcular nunca duplica, so corrige.
 */
export async function enviarComissoes(
  sessao: SessaoTeeds,
  contaId: string,
  demo: boolean,
  moeda: string,
  porDia: Array<{ data: string; comissao: number; operacoes: number; pagamentos: number }>,
): Promise<void> {
  if (!autenticacaoConfigurada() || porDia.length === 0) return
  const linhas = porDia.map((d) => ({
    user_id: sessao.usuario.id,
    conta_id: contaId,
    dia: d.data,
    operacoes: d.operacoes,
    pagamentos: d.pagamentos,
    comissao: d.comissao,
    moeda,
    demo,
    atualizado_em: new Date().toISOString(),
  }))
  try {
    await rest('/comissoes_diarias?on_conflict=user_id,conta_id,dia', sessao.token, {
      method: 'POST',
      headers: MESCLAR,
      body: JSON.stringify(linhas),
    })
  } catch (e) {
    console.warn('[teeds] nao consegui enviar as comissoes:', (e as Error).message)
  }
}

/* --------------------------------------------------------- leitura */

/** A tabela so devolve a propria linha — se vier algo, a pessoa e admin. */
export async function souAdmin(sessao: SessaoTeeds): Promise<boolean> {
  if (!autenticacaoConfigurada()) return false
  try {
    const linhas = await rest<Array<{ user_id: string }>>('/administradores?select=user_id', sessao.token)
    return Array.isArray(linhas) && linhas.length > 0
  } catch {
    return false
  }
}

export interface ClienteRegistro {
  userId: string
  nome: string | null
  email: string | null
  telefone: string | null
  cpf: string | null
  criadoEm: string
  vistoEm: string
}

export interface ContaDerivRegistro {
  userId: string
  contaId: string
  tipo: string
  moeda: string | null
  saldo: number | null
  vistaEm: string
}

export interface ComissaoDia {
  userId: string
  contaId: string
  dia: string
  operacoes: number
  pagamentos: number
  comissao: number
  moeda: string | null
  demo: boolean
}

export async function listarClientes(sessao: SessaoTeeds): Promise<ClienteRegistro[]> {
  const linhas = await rest<any[]>('/clientes?select=*&order=criado_em.desc', sessao.token)
  return (linhas ?? []).map((l) => ({
    userId: l.user_id, nome: l.nome, email: l.email, telefone: l.telefone,
    cpf: l.cpf, criadoEm: l.criado_em, vistoEm: l.visto_em,
  }))
}

export async function listarContasDeriv(sessao: SessaoTeeds): Promise<ContaDerivRegistro[]> {
  const linhas = await rest<any[]>('/contas_deriv?select=*&order=vista_em.desc', sessao.token)
  return (linhas ?? []).map((l) => ({
    userId: l.user_id, contaId: l.conta_id, tipo: l.tipo,
    moeda: l.moeda, saldo: l.saldo === null ? null : Number(l.saldo), vistaEm: l.vista_em,
  }))
}

export async function listarComissoes(sessao: SessaoTeeds, dias: number): Promise<ComissaoDia[]> {
  const de = new Date()
  de.setDate(de.getDate() - (dias - 1))
  const corte = de.toISOString().slice(0, 10)
  const linhas = await rest<any[]>(
    `/comissoes_diarias?select=*&dia=gte.${corte}&order=dia.desc`, sessao.token,
  )
  return (linhas ?? []).map((l) => ({
    userId: l.user_id, contaId: l.conta_id, dia: l.dia,
    operacoes: Number(l.operacoes), pagamentos: Number(l.pagamentos),
    comissao: Number(l.comissao), moeda: l.moeda, demo: Boolean(l.demo),
  }))
}
