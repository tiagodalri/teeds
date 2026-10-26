import { CarteiraDeriv } from './CarteiraDeriv'
import type { AuthSession } from '../core/deriv/auth'

/** Laboratório: a carteira da Deriv com as respostas da Deriv (?tela=carteira; &doc=1 no formato da documentação, &sem=1 sem a permissão). */
let instalado = false
function respostas(semPermissao: boolean, doc: boolean) {
  if (instalado) return; instalado = true
  const original = window.fetch.bind(window)
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
  window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    if (!u.includes('/wallet/v1/')) return original(url, init)
    await new Promise((r) => setTimeout(r, 300))
    if (semPermissao) return json({ errors: [{ code: 'Forbidden', message: 'Insufficient scope: payment required' }] }, 403)
    // &doc=1: o formato da documentação; sem ele, o formato que a Deriv mandou de verdade em 26/10/2026 (data como objeto, USDT_TRON)
    if (u.includes('/wallet/v1/wallets')) return doc
      ? json({ data: [{ wallet_id: 'W123', type: 'main', balances: { USD: { balance: '1993.20', input: '2283.20', output: '290' } }, total_balance: { converted_to: 'USD', approximate_total_balance: '1993.20', approximate_total_input: '2283.20', approximate_total_output: '290.00' } }] })
      : json({ data: { main: { wallet_id: 'W123', balances: { USD: { balance: '21.96' }, USDT_TRON: { balance: '0' } } } } })
    const t = (id: number, dias: number, cat: string, canal: string, valor: string, st = 'completed', moeda = 'USD') => ({ request_id: `r${id}`, transaction_id: id, timestamp: new Date(Date.now() - dias * 86400e3).toISOString(), category: cat, channel: canal, metadata: { transaction_status: st, transaction_gross_amount: valor, transaction_net_amount: valor, transaction_currency: moeda } })
    if (!doc) return json({ data: { transactions: [t(6, 0.1, 'withdrawal', 'cashier', '457.67', 'Reverted', 'USDT_TRON'), t(5, 0.3, 'withdrawal', 'cashier', '457.67', 'Complete', 'USDT_TRON'), t(4, 2, 'deposit', 'cashier', '480.00', 'Complete', 'USDT_TRON'), t(3, 5, 'deposit', 'payment_agent', '50.00', 'Pending'), t(2, 8, 'withdrawal', 'cashier', '30.00', 'Rejected'), t(1, 12, 'deposit', 'cashier', '21.96', 'Complete')] } })
    return json({ data: { start_date_time: null, end_date_time: null, transactions: [t(5, 0.2, 'deposit', 'payment_agent', '500.00', 'pending'), t(4, 3, 'withdrawal', 'cashier', '290.00'), t(3, 9, 'deposit', 'cashier', '1000.00'), t(2, 20, 'deposit', 'payment_agent', '583.20'), t(1, 40, 'deposit', 'cashier', '200.00')] }, links: { self: null, next: null, prev: null, first: null } })
  }) as typeof fetch
}

export default function LabCarteira() {
  const sem = new URLSearchParams(location.search).has('sem')
  respostas(sem, new URLSearchParams(location.search).has('doc'))
  const session = { accessToken: 'lab', expiresAt: Date.now() + 3600e3 } as unknown as AuthSession
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)' }}><CarteiraDeriv session={session} contas={[{ accountId: 'CR9284711', balance: 20.13, currency: 'USD', group: 'row', status: 'active', type: 'real' }, { accountId: 'VRTC5521873', balance: 10000, currency: 'USD', group: 'row', status: 'active', type: 'demo' }]} fechar={() => undefined} reconectar={() => alert('reconectar')} /></div>
}
