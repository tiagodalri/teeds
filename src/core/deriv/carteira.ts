import { call, ErroDaDeriv } from './account'
import type { AuthSession } from './auth'

/*
  A carteira da Deriv (Wallet API, escopo `payment`, 26/10/2026). É onde o
  dinheiro do cliente cai primeiro quando ele deposita e de onde sai quando
  ele saca; a conta de opções (onde os robôs operam) recebe por transferência.
  Só leitura aqui: nada nesta tela move dinheiro.
*/

export interface SaldoDaCarteira { moeda: string; saldo: number; entradas: number; saidas: number }
export interface Carteira {
  id: string
  tipo: string
  saldos: SaldoDaCarteira[]
  /** Tudo convertido para dólar (aproximado, a cotação muda). */
  emDolar: { saldo: number; entradas: number; saidas: number } | null
}
export interface MovimentoDaCarteira {
  id: string
  quando: string
  tipo: 'deposito' | 'saque'
  canal: 'caixa' | 'agente'
  valor: number
  liquido: number
  moeda: string
  situacao: string
}

/** O login desta pessoa é de antes do `payment`: precisa reconectar a Deriv. */
export class CarteiraSemPermissao extends Error { constructor() { super('Reconecte a Deriv para liberar a carteira.') } }

const numero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function traduzir(e: unknown): never {
  if (e instanceof ErroDaDeriv && (e.status === 403 || e.status === 401)) throw new CarteiraSemPermissao()
  throw e
}

export async function lerCarteiras(session: AuthSession): Promise<Carteira[]> {
  const r = await call<{ data?: any[] }>('/wallet/v1/wallets?conversion_currency=USD', session).catch(traduzir)
  return (r.data ?? []).map((w) => ({
    id: String(w.wallet_id),
    tipo: String(w.type ?? 'main'),
    saldos: Object.entries((w.balances ?? {}) as Record<string, any>).map(([moeda, b]) => ({ moeda, saldo: numero(b?.balance), entradas: numero(b?.input), saidas: numero(b?.output) })),
    emDolar: w.total_balance ? { saldo: numero(w.total_balance.approximate_total_balance), entradas: numero(w.total_balance.approximate_total_input), saidas: numero(w.total_balance.approximate_total_output) } : null,
  }))
}

/** Depósitos e saques da carteira principal, do mais novo para o mais antigo (até 100 por página). */
export async function lerMovimentos(session: AuthSession, tipo = 'main'): Promise<MovimentoDaCarteira[]> {
  const r = await call<{ data?: { transactions?: any[] } }>(`/wallet/v1/transactions/${encodeURIComponent(tipo)}?per_page=100`, session).catch(traduzir)
  return (r.data?.transactions ?? []).map((t) => ({
    id: String(t.transaction_id ?? t.request_id),
    quando: String(t.timestamp),
    tipo: t.category === 'withdrawal' ? 'saque' : 'deposito',
    canal: t.channel === 'payment_agent' ? 'agente' : 'caixa',
    valor: numero(t.metadata?.transaction_gross_amount),
    liquido: numero(t.metadata?.transaction_net_amount ?? t.metadata?.transaction_gross_amount),
    moeda: String(t.metadata?.transaction_currency ?? 'USD'),
    situacao: String(t.metadata?.transaction_status ?? ''),
  }))
}
