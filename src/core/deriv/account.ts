import { DERIV } from './config'
import type { AuthSession } from './auth'
import { MARCA } from '../../marca'

export interface TradingAccount {
  accountId: string
  balance: number
  currency: string
  group: string
  status: 'active' | 'inactive' | string
  type: 'demo' | 'real' | string
}

function headers(session: AuthSession): HeadersInit {
  return {
    // A app da autorização manda; a do build é só o padrão do navegador.
    'Deriv-App-ID': session.appId ?? MARCA.appId,
    Authorization: `Bearer ${session.accessToken}`,
    'Content-Type': 'application/json',
  }
}

/**
 * Quanto uma chamada à API da Deriv pode demorar antes de desistirmos dela.
 *
 * Sem limite, uma Deriv engasgada segurava o pedido por minutos: em
 * 18/09/2026 a API levou 57 s para responder a primeira chamada (e já tinha
 * devolvido 524 depois de 3 min), e o botão "Iniciar robô" ficou girando sem
 * explicação. O engasgo costuma ser de uma chamada só — a seguinte volta em
 * 0,1 s —, então quem pode repetir repete uma vez antes de avisar.
 */
let TEMPO_MAXIMO_MS = 12_000
/** Só para as provas: encurta o limite para não esperar 12 s de verdade. */
export function definirTempoDaDeriv(ms: number) { TEMPO_MAXIMO_MS = ms }

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))
const AVISO_INSTAVEL = 'A Deriv não respondeu a tempo. Ela parece instável agora; tente de novo em instantes.'

async function call<T>(path: string, session: AuthSession, init: RequestInit = {}, repetivel = (init.method ?? 'GET') === 'GET'): Promise<T> {
  for (let tentativa = 1; ; tentativa++) {
    const ultima = !repetivel || tentativa >= 2
    const ctrl = new AbortController()
    const relogio = setTimeout(() => ctrl.abort(), TEMPO_MAXIMO_MS)
    let res: Response
    let body: any
    try {
      res = await fetch(`${DERIV.restBase}${path}`, { ...init, headers: headers(session), signal: ctrl.signal })
      body = await res.json().catch(() => ({}))
    } catch {
      // Estourou o tempo ou a rede caiu: nenhuma resposta da Deriv.
      clearTimeout(relogio)
      if (!ultima) { await pausa(400); continue }
      throw new Error(AVISO_INSTAVEL)
    }
    clearTimeout(relogio)
    if (res.ok) return body as T
    const instavel = res.status >= 500 || res.status === 429
    if (instavel && !ultima) { await pausa(800); continue }
    const first = body?.errors?.[0]
    if (instavel && !first?.message) throw new Error(`${AVISO_INSTAVEL} (erro ${res.status})`)
    throw new Error(first?.message || body?.message || `Erro ${res.status} em ${path}`)
  }
}

/** Contas de opcoes do usuario autenticado (demo e real). */
export async function fetchAccounts(session: AuthSession): Promise<TradingAccount[]> {
  const body = await call<{ data?: any[] }>('/trading/v1/options/accounts', session)
  return (body.data ?? []).map((a) => ({
    accountId: a.account_id,
    balance: Number(a.balance ?? 0),
    currency: a.currency ?? 'USD',
    group: a.group ?? '',
    status: a.status ?? 'active',
    type: a.account_type ?? 'demo',
  }))
}

/**
 * Troca o token por uma URL de WebSocket de uso unico (OTP).
 * E assim que a Teeds entra na sala de operacoes de uma conta especifica.
 */
export async function fetchTradingSocketUrl(session: AuthSession, accountId: string): Promise<string> {
  const body = await call<{ data?: { url?: string } }>(
    `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/otp`,
    session,
    { method: 'POST' },
    true, // pedir outro endereço de uso único não tem efeito colateral: pode repetir
  )
  const url = body.data?.url
  if (!url) throw new Error('A Deriv nao devolveu o endereco de conexao')
  return url
}

/** Cria uma conta de opcoes (demo ou real) caso o usuario ainda nao tenha. */
export async function createAccount(
  session: AuthSession,
  accountType: 'demo' | 'real' = 'demo',
): Promise<TradingAccount> {
  const body = await call<{ data?: any }>('/trading/v1/options/accounts', session, {
    method: 'POST',
    body: JSON.stringify({ currency: 'USD', group: 'row', account_type: accountType }),
  })
  const a = body.data ?? {}
  return {
    accountId: a.account_id,
    balance: Number(a.balance ?? 0),
    currency: a.currency ?? 'USD',
    group: a.group ?? 'row',
    status: a.status ?? 'active',
    type: a.account_type ?? accountType,
  }
}

/** Recarrega o saldo ficticio de uma conta demo. Devolve o novo saldo. */
export async function resetDemoBalance(session: AuthSession, accountId: string): Promise<number> {
  const body = await call<{ data?: { balance?: string | number } }>(
    `/trading/v1/options/accounts/${encodeURIComponent(accountId)}/reset-demo-balance`,
    session,
    { method: 'POST', body: JSON.stringify({}) },
  )
  return Number(body.data?.balance ?? 0)
}
