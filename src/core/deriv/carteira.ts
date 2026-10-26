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
export type SituacaoDoMovimento = 'concluido' | 'andamento' | 'estornado' | 'falhou' | 'cancelado' | 'outro'
export interface MovimentoDaCarteira {
  id: string
  quando: string
  tipo: 'deposito' | 'saque'
  canal: 'caixa' | 'agente'
  valor: number
  liquido: number
  /** O código como a Deriv manda (USD, USDT_TRON...). Para mostrar, `moedaLegivel`. */
  moeda: string
  situacao: SituacaoDoMovimento
  /** O texto original da Deriv (complete, reverted...), para quem quiser conferir. */
  situacaoOriginal: string
}

/** O login desta pessoa é de antes do `payment`: precisa reconectar a Deriv. */
export class CarteiraSemPermissao extends Error { constructor() { super('Reconecte a Deriv para liberar a carteira.') } }

const numero = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
function traduzir(e: unknown): never {
  if (e instanceof ErroDaDeriv && (e.status === 403 || e.status === 401)) throw new CarteiraSemPermissao()
  throw e
}

/*
  26/10/2026: a resposta real da Deriv para as carteiras não veio no formato da
  documentação (`data` como lista) e a tela quebrou com "data.map is not a
  function". A leitura agora aceita os formatos possíveis: lista, objeto com a
  lista dentro, uma carteira só ou carteiras por tipo; saldos em lista ou por moeda.
*/
function listaDeCarteiras(bruto: any): any[] {
  const d = bruto?.data ?? bruto
  if (Array.isArray(d)) return d
  if (!d || typeof d !== 'object') return []
  for (const k of ['wallets', 'items', 'data', 'list']) if (Array.isArray(d[k])) return d[k]
  if ('wallet_id' in d || 'balances' in d) return [d]
  return Object.entries(d).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v)).map(([tipo, v]) => ({ type: tipo, ...(v as object) }))
}
function saldosDe(b: any): SaldoDaCarteira[] {
  if (Array.isArray(b)) return b.map((x) => ({ moeda: String(x?.currency ?? x?.moeda ?? 'USD'), saldo: numero(x?.balance ?? x?.amount), entradas: numero(x?.input), saidas: numero(x?.output) }))
  if (b && typeof b === 'object') {
    return Object.entries(b).map(([moeda, x]: [string, any]) => (x && typeof x === 'object'
      ? { moeda, saldo: numero(x.balance ?? x.amount), entradas: numero(x.input), saidas: numero(x.output) }
      : { moeda, saldo: numero(x), entradas: 0, saidas: 0 }))
  }
  return []
}

export async function lerCarteiras(session: AuthSession): Promise<Carteira[]> {
  const r = await call<any>('/wallet/v1/wallets?conversion_currency=USD', session).catch(traduzir)
  return listaDeCarteiras(r).map((w, i) => ({
    id: String(w.wallet_id ?? w.id ?? i),
    tipo: String(w.type ?? w.wallet_type ?? 'main'),
    saldos: saldosDe(w.balances ?? (w.balance !== undefined ? { [w.currency ?? 'USD']: { balance: w.balance } } : undefined)),
    emDolar: w.total_balance ? { saldo: numero(w.total_balance.approximate_total_balance), entradas: numero(w.total_balance.approximate_total_input), saidas: numero(w.total_balance.approximate_total_output) } : null,
  }))
}

function situacaoDe(t: string): SituacaoDoMovimento {
  const s = t.toLowerCase()
  if (/^(complete|completed|success|successful|done|approved|settled)$/.test(s)) return 'concluido'
  if (/revert|reversed|refund|returned/.test(s)) return 'estornado'
  if (/pend|process|progress|queued|locked|verif/.test(s)) return 'andamento'
  if (/fail|reject|error|declin/.test(s)) return 'falhou'
  if (/cancel/.test(s)) return 'cancelado'
  return 'outro'
}

/** Depósitos e saques da carteira principal, do mais novo para o mais antigo (até 100). */
export async function lerMovimentos(session: AuthSession, tipo = 'main'): Promise<MovimentoDaCarteira[]> {
  const r = await call<any>(`/wallet/v1/transactions/${encodeURIComponent(tipo)}?per_page=100`, session).catch(traduzir)
  const lista: any[] = Array.isArray(r?.data?.transactions) ? r.data.transactions : Array.isArray(r?.transactions) ? r.transactions : Array.isArray(r?.data) ? r.data : []
  return lista.map((t) => {
    const m = t.metadata ?? {}
    const original = String(m.transaction_status ?? t.status ?? '')
    return {
      id: String(t.transaction_id ?? t.request_id ?? `${t.timestamp}-${m.transaction_gross_amount}`),
      quando: String(t.timestamp ?? t.created_at ?? ''),
      tipo: t.category === 'withdrawal' ? 'saque' : 'deposito',
      canal: t.channel === 'payment_agent' ? 'agente' : 'caixa',
      valor: numero(m.transaction_gross_amount ?? t.amount),
      liquido: numero(m.transaction_net_amount ?? m.transaction_gross_amount ?? t.amount),
      moeda: String(m.transaction_currency ?? t.currency ?? 'USD'),
      situacao: situacaoDe(original),
      situacaoOriginal: original,
    }
  })
}

/** USD vira "US$"; códigos de cripto com rede (USDT_TRON) viram "USDT", e a rede vai à parte. */
export function moedaLegivel(codigo: string): { simbolo: string; rede: string | null; prefixo: boolean } {
  const c = codigo.toUpperCase()
  if (c === 'USD') return { simbolo: 'US$', rede: null, prefixo: true }
  if (c === 'BRL') return { simbolo: 'R$', rede: null, prefixo: true }
  if (c === 'EUR') return { simbolo: '€', rede: null, prefixo: true }
  const [base, rede] = c.split('_')
  const REDES: Record<string, string> = { TRON: 'rede Tron', TRC20: 'rede Tron', ETH: 'rede Ethereum', ERC20: 'rede Ethereum', BSC: 'rede BNB', BEP20: 'rede BNB', SOL: 'rede Solana', POLYGON: 'rede Polygon', OMNI: 'rede Omni' }
  return { simbolo: base, rede: rede ? REDES[rede] ?? `rede ${rede[0]}${rede.slice(1).toLowerCase()}` : null, prefixo: false }
}

/** Valor com a moeda escrita como as pessoas leem: "US$ 21,96" ou "457,67 USDT". */
export function valorNaMoeda(v: number, codigo: string): string {
  const { simbolo, prefixo } = moedaLegivel(codigo)
  const n = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return prefixo ? `${simbolo} ${n}` : `${n} ${simbolo}`
}
