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
  planoId: string
  statusAcesso: 'ativo' | 'suspenso' | 'expirado' | 'cancelado'
  acessoInicio: string | null
  acessoExpiraEm: string | null
  observacoes: string | null
}

export interface PlanoRegistro { id: string; nome: string; duracaoDias: number | null; ativo: boolean }
export interface ProdutoRegistro { id: string; nome: string; categoria: string; precoCentavos: number | null; ativo: boolean }
export interface ClienteProdutoRegistro { userId: string; produtoId: string; concedidoEm: string; expiraEm: string | null; ativo: boolean }

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
  /** Quando esta linha foi gravada — diz se veio do cálculo novo. */
  atualizadoEm: string | null
}

export async function listarClientes(sessao: SessaoTeeds): Promise<ClienteRegistro[]> {
  const linhas = await rest<any[]>('/clientes?select=*&order=criado_em.desc', sessao.token)
  return (linhas ?? []).map((l) => ({
    userId: l.user_id, nome: l.nome, email: l.email, telefone: l.telefone,
    cpf: l.cpf, criadoEm: l.criado_em, vistoEm: l.visto_em,
    planoId: l.plano_id ?? 'essencial', statusAcesso: l.status_acesso ?? 'ativo',
    acessoInicio: l.acesso_inicio ?? null, acessoExpiraEm: l.acesso_expira_em ?? null,
    observacoes: l.observacoes ?? null,
  }))
}

export async function listarPlanos(sessao: SessaoTeeds): Promise<PlanoRegistro[]> {
  const linhas = await rest<any[]>('/planos?select=*&order=nome.asc', sessao.token)
  return (linhas ?? []).map((l) => ({ id: l.id, nome: l.nome, duracaoDias: l.duracao_dias, ativo: Boolean(l.ativo) }))
}

export async function listarProdutos(sessao: SessaoTeeds): Promise<ProdutoRegistro[]> {
  const linhas = await rest<any[]>('/produtos?select=*&order=nome.asc', sessao.token)
  return (linhas ?? []).map((l) => ({ id: l.id, nome: l.nome, categoria: l.categoria, precoCentavos: l.preco_centavos, ativo: Boolean(l.ativo) }))
}

export async function listarProdutosClientes(sessao: SessaoTeeds): Promise<ClienteProdutoRegistro[]> {
  const linhas = await rest<any[]>('/cliente_produtos?select=*&ativo=eq.true', sessao.token)
  return (linhas ?? []).map((l) => ({ userId: l.user_id, produtoId: l.produto_id, concedidoEm: l.concedido_em, expiraEm: l.expira_em, ativo: Boolean(l.ativo) }))
}

export async function atualizarAcessoCliente(sessao: SessaoTeeds, userId: string, dados: {
  planoId: string; statusAcesso: ClienteRegistro['statusAcesso']; acessoExpiraEm: string | null; observacoes: string | null
}): Promise<void> {
  await rest(`/clientes?user_id=eq.${encodeURIComponent(userId)}`, sessao.token, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ plano_id: dados.planoId, status_acesso: dados.statusAcesso, acesso_expira_em: dados.acessoExpiraEm, observacoes: dados.observacoes }),
  })
}

export async function definirProdutoCliente(sessao: SessaoTeeds, userId: string, produtoId: string, ativo: boolean): Promise<void> {
  await rest('/cliente_produtos?on_conflict=user_id,produto_id', sessao.token, {
    method: 'POST', headers: MESCLAR,
    body: JSON.stringify({ user_id: userId, produto_id: produtoId, ativo, origem: 'admin', concedido_em: new Date().toISOString() }),
  })
}

export async function salvarPlano(sessao: SessaoTeeds, plano: PlanoRegistro): Promise<void> {
  await rest('/planos?on_conflict=id', sessao.token, {
    method: 'POST', headers: MESCLAR,
    body: JSON.stringify({ id: plano.id, nome: plano.nome, duracao_dias: plano.duracaoDias, ativo: plano.ativo }),
  })
}

export async function salvarProduto(sessao: SessaoTeeds, produto: ProdutoRegistro): Promise<void> {
  await rest('/produtos?on_conflict=id', sessao.token, {
    method: 'POST', headers: MESCLAR,
    body: JSON.stringify({ id: produto.id, nome: produto.nome, categoria: produto.categoria, preco_centavos: produto.precoCentavos, ativo: produto.ativo }),
  })
}

/**
 * Cria o login pelo endpoint público de cadastro sem trocar a sessão do ADM.
 * O trigger do banco cria a ficha de cliente; depois o painel configura plano
 * e validade. Se a confirmação de e-mail estiver ativa, o cliente confirma no
 * próprio e-mail antes do primeiro acesso.
 */
export async function criarAcessoCliente(sessao: SessaoTeeds, dados: {
  nome: string; email: string; telefone?: string; cpf?: string; senha: string
}): Promise<{ userId: string | null; precisaConfirmar: boolean }> {
  const res = await fetch(`${SUPABASE.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: dados.email.trim().toLowerCase(), senha: undefined, password: dados.senha,
      data: { nome: dados.nome.trim(), telefone: dados.telefone?.trim() || null, cpf: dados.cpf?.trim() || null },
    }),
  })
  const corpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(corpo?.msg || corpo?.message || 'Não foi possível criar este acesso.')
  const userId = corpo?.user?.id ?? null
  // Garante a ficha quando o trigger ainda estiver processando.
  if (userId) {
    await new Promise((resolve) => setTimeout(resolve, 350))
    try {
      await rest('/clientes?on_conflict=user_id', sessao.token, {
        method: 'POST', headers: MESCLAR,
        body: JSON.stringify({ user_id: userId, nome: dados.nome.trim(), email: dados.email.trim().toLowerCase(), telefone: dados.telefone?.trim() || null, cpf: dados.cpf?.trim() || null }),
      })
    } catch { /* o trigger já criou ou a confirmação ainda está pendente */ }
  }
  return { userId, precisaConfirmar: !corpo?.session }
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
    atualizadoEm: l.atualizado_em ?? null,
  }))
}
