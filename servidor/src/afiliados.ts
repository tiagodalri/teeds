import './ambiente'

import { autorizacaoDoCliente, type DoCofre } from './cofre'
import { deMolho } from './deriv-instavel'
import { nomeDoUsuario, restDoBanco as rest } from './supabase'

/**
 * A conta de afiliado da Deriv de cada parceiro (09/11/2026).
 *
 * Tiago: "como faz pra trazermos essas métricas pra plataforma? segregado
 * certinho victor/naor.etc". A Deriv tem uma API de parceiros (Beta) que
 * devolve, para QUEM AUTORIZOU, os números da conta de afiliado dele:
 *
 *   GET https://api.derivws.com/partners/analytics/v1/overview?start_date=&end_date=
 *     signups   { total, real_accounts, first_time_depositors, first_time_traders }
 *     activity  { paid, pending, active_traders }          (USD)
 *     master_partner { earnings_occurred, active_subpartners }
 *
 * Ela não abre por cliente nem por link. Então a separação é por conta: cada
 * parceiro liga a conta de afiliado DELE (a Deriv que ele já conectou na
 * plataforma) ao código dele (/n, /v, /d), e a casa liga a dela ao Direto.
 *
 * O cofre continua valendo: a autorização é aberta aqui dentro, vai só no
 * cabeçalho do pedido à Deriv e nunca volta em resposta nem em log.
 *
 * Coleta dia a dia (um pedido por dia, o dia em UTC, que é o da Deriv), para
 * a tela ter histórico. "Operaram" não soma entre dias (a mesma pessoa opera
 * em vários), então o total do período é lido na hora, com cache curto.
 */

const API = 'https://api.derivws.com'
const CAMINHO = '/partners/analytics/v1/overview'
/** Na primeira vez, quantos dias para trás. */
const DIAS_DE_HISTORICO = 60
/** Os últimos dias são lidos de novo a cada passada: a comissão sai de "a receber" para "paga". */
const DIAS_QUE_MUDAM = 3
const PAUSA_ENTRE_PEDIDOS_MS = 350
const PRIMEIRA_PASSADA_MS = 90_000

export interface Resumo {
  cadastros: number
  contasReais: number
  primeiroDeposito: number
  primeiraOperacao: number
  operaram: number
  comissaoPaga: number
  comissaoPendente: number
  subafiliadosAtivos: number
  ganhoSubafiliados: number
}
export const RESUMO_VAZIO: Resumo = {
  cadastros: 0, contasReais: 0, primeiroDeposito: 0, primeiraOperacao: 0, operaram: 0,
  comissaoPaga: 0, comissaoPendente: 0, subafiliadosAtivos: 0, ganhoSubafiliados: 0,
}

const inteiro = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0 }
const dinheiro = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0 }

/** A resposta da Deriv no nosso formato. A API é Beta: campo que faltar vira zero, não erro. */
export function lerResumo(j: any): Resumo {
  const r = j?.data ?? j ?? {}
  return {
    cadastros: inteiro(r.signups?.total),
    contasReais: inteiro(r.signups?.real_accounts),
    primeiroDeposito: inteiro(r.signups?.first_time_depositors),
    primeiraOperacao: inteiro(r.signups?.first_time_traders),
    operaram: inteiro(r.activity?.active_traders),
    comissaoPaga: dinheiro(r.activity?.paid),
    comissaoPendente: dinheiro(r.activity?.pending),
    subafiliadosAtivos: inteiro(r.master_partner?.active_subpartners),
    ganhoSubafiliados: dinheiro(r.master_partner?.earnings_occurred),
  }
}

/** Soma os dias. "Operaram" e "subafiliados ativos" não somam (a mesma pessoa conta em vários dias): fica o maior dia. */
export function somarDias(dias: Resumo[]): Resumo {
  const t = { ...RESUMO_VAZIO }
  for (const d of dias) {
    t.cadastros += d.cadastros; t.contasReais += d.contasReais; t.primeiroDeposito += d.primeiroDeposito
    t.primeiraOperacao += d.primeiraOperacao; t.comissaoPaga += d.comissaoPaga; t.comissaoPendente += d.comissaoPendente
    t.ganhoSubafiliados += d.ganhoSubafiliados
    t.operaram = Math.max(t.operaram, d.operaram); t.subafiliadosAtivos = Math.max(t.subafiliadosAtivos, d.subafiliadosAtivos)
  }
  t.comissaoPaga = dinheiro(t.comissaoPaga); t.comissaoPendente = dinheiro(t.comissaoPendente); t.ganhoSubafiliados = dinheiro(t.ganhoSubafiliados)
  return t
}

export type Situacao = 'ok' | 'nao-e-afiliado' | 'reconectar' | 'erro'
export type Leitura = { ok: true; resumo: Resumo } | { ok: false; situacao: Exclude<Situacao, 'ok'>; detalhe: string }

export interface Dependencias {
  autorizacao: (userId: string) => Promise<DoCofre>
  buscar: typeof fetch
}
const DE_VERDADE: Dependencias = { autorizacao: (u) => autorizacaoDoCliente(u), buscar: (...a) => fetch(...a) }

const RECONECTAR = 'A conexão da Deriv desta conta venceu ou não tem a permissão de leitura. Na plataforma, clique em Conectar Deriv e autorize de novo.'
export const NAO_E_AFILIADO = 'A Deriv conectada nesta conta não é uma conta de afiliado. Entre na plataforma com a Deriv que é dona do link de afiliado e tente de novo.'

/** Lê os números de afiliado de quem tem a autorização, no período (datas em UTC, AAAA-MM-DD, inclusivas). */
export async function lerDaDeriv(userId: string, de: string, ate: string, dep: Dependencias = DE_VERDADE): Promise<Leitura> {
  const c = await dep.autorizacao(userId)
  if (c.tipo !== 'ok') return { ok: false, situacao: 'reconectar', detalhe: c.tipo === 'sem-cofre' ? 'Esta conta ainda não conectou a Deriv na plataforma. Clique em Conectar Deriv e autorize.' : RECONECTAR }
  let r: Response
  try {
    r = await dep.buscar(`${API}${CAMINHO}?start_date=${de}&end_date=${ate}`, {
      headers: { Authorization: `Bearer ${c.sessao.accessToken}`, 'Deriv-App-ID': String(c.sessao.appId ?? ''), Accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
    })
  } catch {
    return { ok: false, situacao: 'erro', detalhe: 'A Deriv não respondeu a tempo. A próxima passada tenta de novo.' }
  }
  if (r.status === 200) return { ok: true, resumo: lerResumo(await r.json().catch(() => ({}))) }
  if (r.status === 404) return { ok: false, situacao: 'nao-e-afiliado', detalhe: NAO_E_AFILIADO }
  if (r.status === 401 || r.status === 403) return { ok: false, situacao: 'reconectar', detalhe: RECONECTAR }
  return { ok: false, situacao: 'erro', detalhe: `A Deriv recusou a leitura (erro ${r.status}). A próxima passada tenta de novo.` }
}

/* ------------------------------------------------------------------ *
 * Datas (UTC, como a Deriv)
 * ------------------------------------------------------------------ */
export const diaUtc = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)
export const somarDiasA = (dia: string, n: number) => diaUtc(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000)

/** Os dias a ler agora: os que faltam no histórico e, sempre, os últimos (que ainda mudam). Do mais novo ao mais velho. */
export function diasParaColetar(hoje: string, jaTem: Set<string>, max = DIAS_DE_HISTORICO): string[] {
  const saida: string[] = []
  for (let i = 0; i < max; i++) {
    const d = somarDiasA(hoje, -i)
    if (i < DIAS_QUE_MUDAM || !jaTem.has(d)) saida.push(d)
  }
  return saida
}

/* ------------------------------------------------------------------ *
 * Banco
 * ------------------------------------------------------------------ */
export interface ContaDeAfiliado {
  marca: string
  parceiro: string
  user_id: string
  vinculado_em: string
  situacao: Situacao
  detalhe: string | null
  coletado_em: string | null
}

const q = encodeURIComponent
async function contas(marca?: string): Promise<ContaDeAfiliado[]> {
  return (await rest<ContaDeAfiliado[]>(`/afiliados_contas?select=*${marca ? `&marca=eq.${q(marca)}` : ''}`)) ?? []
}
async function marcarSituacao(marca: string, parceiro: string, situacao: Situacao, detalhe: string | null, coletou: boolean) {
  await rest(`/afiliados_contas?marca=eq.${q(marca)}&parceiro=eq.${q(parceiro)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ situacao, detalhe, ...(coletou ? { coletado_em: new Date().toISOString() } : {}) }),
  })
}
async function gravarDia(marca: string, parceiro: string, dia: string, r: Resumo) {
  await rest('/afiliados_metricas_diarias?on_conflict=marca,parceiro,dia', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{
      marca, parceiro, dia,
      cadastros: r.cadastros, contas_reais: r.contasReais, primeiro_deposito: r.primeiroDeposito,
      primeira_operacao: r.primeiraOperacao, operaram: r.operaram,
      comissao_paga: r.comissaoPaga, comissao_pendente: r.comissaoPendente,
      subafiliados_ativos: r.subafiliadosAtivos, ganho_subafiliados: r.ganhoSubafiliados,
      coletado_em: new Date().toISOString(),
    }]),
  })
}
const doBanco = (l: any): Resumo => ({
  cadastros: inteiro(l.cadastros), contasReais: inteiro(l.contas_reais), primeiroDeposito: inteiro(l.primeiro_deposito),
  primeiraOperacao: inteiro(l.primeira_operacao), operaram: inteiro(l.operaram),
  comissaoPaga: dinheiro(l.comissao_paga), comissaoPendente: dinheiro(l.comissao_pendente),
  subafiliadosAtivos: inteiro(l.subafiliados_ativos), ganhoSubafiliados: dinheiro(l.ganho_subafiliados),
})

/* ------------------------------------------------------------------ *
 * Coleta
 * ------------------------------------------------------------------ */
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Lê os dias que faltam (e os que ainda mudam) de uma conta. Para no primeiro defeito da conexão. */
export async function coletarConta(conta: Pick<ContaDeAfiliado, 'marca' | 'parceiro' | 'user_id'>, dep: Dependencias = DE_VERDADE): Promise<{ dias: number; situacao: Situacao }> {
  const linhas = await rest<any[]>(`/afiliados_metricas_diarias?select=dia&marca=eq.${q(conta.marca)}&parceiro=eq.${q(conta.parceiro)}&dia=gte.${somarDiasA(diaUtc(), -DIAS_DE_HISTORICO)}`)
  const jaTem = new Set((linhas ?? []).map((l) => String(l.dia)))
  let dias = 0
  for (const dia of diasParaColetar(diaUtc(), jaTem)) {
    const l = await lerDaDeriv(conta.user_id, dia, dia, dep)
    if (!l.ok) { await marcarSituacao(conta.marca, conta.parceiro, l.situacao, l.detalhe, dias > 0); return { dias, situacao: l.situacao } }
    await gravarDia(conta.marca, conta.parceiro, dia, l.resumo)
    dias++
    await espera(PAUSA_ENTRE_PEDIDOS_MS)
  }
  await marcarSituacao(conta.marca, conta.parceiro, 'ok', null, true)
  return { dias, situacao: 'ok' }
}

let coletando = false
export async function coletarTudo(marca?: string, parceiros?: string[]): Promise<{ contas: number; dias: number; defeitos: number }> {
  if (coletando) return { contas: 0, dias: 0, defeitos: 0 }
  coletando = true
  let n = 0, dias = 0, defeitos = 0
  try {
    for (const c of await contas(marca)) {
      if (parceiros && !parceiros.includes(c.parceiro)) continue
      try {
        const r = await coletarConta(c)
        n++; dias += r.dias; if (r.situacao !== 'ok') defeitos++
      } catch (e) {
        defeitos++
        console.warn(`[afiliados] ${c.marca}/${c.parceiro || 'direto'}: ${(e as Error).message}`)
      }
    }
  } finally { coletando = false }
  return { contas: n, dias, defeitos }
}

export function ligarColetorDeAfiliados(intervaloMs: number): () => void {
  const passo = async () => {
    if (deMolho()) return
    const comecou = Date.now()
    try {
      const r = await coletarTudo()
      if (r.contas) console.log(`[afiliados] passada em ${Math.round((Date.now() - comecou) / 1000)}s · ${r.contas} conta(s) · ${r.dias} dia(s) lidos${r.defeitos ? ` · ${r.defeitos} com defeito` : ''}`)
    } catch (e) { console.warn('[afiliados] a passada não completou:', (e as Error).message) }
  }
  const timer = setInterval(() => { void passo() }, intervaloMs)
  const primeira = setTimeout(() => { void passo() }, PRIMEIRA_PASSADA_MS)
  return () => { clearInterval(timer); clearTimeout(primeira) }
}

/* ------------------------------------------------------------------ *
 * Ligar e desligar a conta de um parceiro
 * ------------------------------------------------------------------ */
export class RecusaDeAfiliado extends Error {}

/** Liga a Deriv de `userId` como a conta de afiliado do parceiro. Confere na Deriv antes de gravar. */
export async function vincular(marca: string, parceiro: string, userId: string, dep: Dependencias = DE_VERDADE): Promise<Resumo> {
  const outra = (await contas(marca)).find((c) => c.user_id === userId && c.parceiro !== parceiro)
  if (outra) throw new RecusaDeAfiliado(`Esta conta Deriv já está ligada ao ${outra.parceiro ? `/${outra.parceiro}` : 'Direto'}. Desligue lá primeiro.`)
  const hoje = diaUtc()
  const l = await lerDaDeriv(userId, somarDiasA(hoje, -29), hoje, dep)
  if (!l.ok) throw new RecusaDeAfiliado(l.detalhe)
  await rest('/afiliados_contas?on_conflict=marca,parceiro', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify([{ marca, parceiro, user_id: userId, vinculado_em: new Date().toISOString(), situacao: 'ok', detalhe: null }]),
  })
  // o histórico vem em segundo plano: a resposta não espera 60 pedidos à Deriv
  void coletarConta({ marca, parceiro, user_id: userId }, dep).catch((e) => console.warn(`[afiliados] histórico de ${marca}/${parceiro || 'direto'}: ${(e as Error).message}`))
  return l.resumo
}

export async function desvincular(marca: string, parceiro: string): Promise<void> {
  await rest(`/afiliados_contas?marca=eq.${q(marca)}&parceiro=eq.${q(parceiro)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

/* ------------------------------------------------------------------ *
 * O que a tela mostra
 * ------------------------------------------------------------------ */
export interface CartaoDeAfiliado {
  codigo: string
  nome: string
  conexao: null | { quem: string | null; souEu: boolean; desde: string; situacao: Situacao; detalhe: string | null; coletadoEm: string | null }
  total: Resumo
  /** "Operaram" no período inteiro lido na hora (não soma entre dias). null = não deu para ler agora. */
  operaramNoPeriodo: number | null
  dias: Array<{ dia: string } & Resumo>
}

const cacheDoPeriodo = new Map<string, { em: number; operaram: number | null }>()
const CACHE_MS = 10 * 60_000

/**
 * Os cartões dos parceiros que `codigos` deixa ver (null = todos, inclusive o Direto).
 * `de`/`ate` em AAAA-MM-DD (dias da Deriv, UTC).
 */
export async function painelDeAfiliados(marca: string, codigos: string[] | null, de: string, ate: string, quemPede: string): Promise<CartaoDeAfiliado[]> {
  const [parceiros, ligadas, linhas] = await Promise.all([
    rest<any[]>(`/parceiros?select=codigo,nome&marca=eq.${q(marca)}&ativo=eq.true&order=criado_em`),
    contas(marca),
    rest<any[]>(`/afiliados_metricas_diarias?select=*&marca=eq.${q(marca)}&dia=gte.${q(de)}&dia=lte.${q(ate)}&order=dia&limit=20000`),
  ])
  const grupos = [...(parceiros ?? []).map((p) => ({ codigo: String(p.codigo), nome: String(p.nome) })), { codigo: '', nome: 'Direto' }]
    .filter((g) => codigos === null || codigos.includes(g.codigo))
  const saida: CartaoDeAfiliado[] = []
  for (const g of grupos) {
    const conta = ligadas.find((c) => c.parceiro === g.codigo) ?? null
    const dias = (linhas ?? []).filter((l) => String(l.parceiro) === g.codigo).map((l) => ({ dia: String(l.dia), ...doBanco(l) }))
    let operaramNoPeriodo: number | null = null
    if (conta && conta.situacao === 'ok') {
      const chave = `${marca}|${g.codigo}|${conta.user_id}|${de}|${ate}`
      const guardado = cacheDoPeriodo.get(chave)
      if (guardado && Date.now() - guardado.em < CACHE_MS) operaramNoPeriodo = guardado.operaram
      else if (!deMolho()) {
        const l = await lerDaDeriv(conta.user_id, de, ate).catch(() => null)
        operaramNoPeriodo = l?.ok ? l.resumo.operaram : null
        cacheDoPeriodo.set(chave, { em: Date.now(), operaram: operaramNoPeriodo })
      }
    }
    saida.push({
      codigo: g.codigo, nome: g.nome,
      conexao: conta ? {
        quem: await nomeDoUsuario(conta.user_id).catch(() => null), souEu: conta.user_id === quemPede,
        desde: conta.vinculado_em, situacao: conta.situacao, detalhe: conta.detalhe, coletadoEm: conta.coletado_em,
      } : null,
      total: somarDias(dias), operaramNoPeriodo, dias,
    })
  }
  return saida
}

/** Quem pode ligar a conta de afiliado de qual código: o geral liga qualquer um; o admin do parceiro, só o dele. */
export function podeVincular(papel: { geral: boolean; parceiro: string | null }, codigo: string): boolean {
  return papel.geral || (!!papel.parceiro && papel.parceiro === codigo)
}

/** Data AAAA-MM-DD válida, senão `padrao`. */
export const dataOuPadrao = (v: unknown, padrao: string) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) ? v : padrao
