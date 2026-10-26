import { CarteiraDeriv } from './CarteiraDeriv'
import type { AuthSession } from '../core/deriv/auth'

/** Laboratório: a carteira da Deriv com respostas no formato da documentação (?tela=carteira, &sem=1 sem a permissão). */
let instalado = false
function respostas(semPermissao: boolean) {
  if (instalado) return; instalado = true
  const original = window.fetch.bind(window)
  const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
  window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    if (!u.includes('/wallet/v1/')) return original(url, init)
    await new Promise((r) => setTimeout(r, 300))
    if (semPermissao) return json({ errors: [{ code: 'Forbidden', message: 'Insufficient scope: payment required' }] }, 403)
    if (u.includes('/wallet/v1/wallets')) return json({ data: [{ wallet_id: 'W123', type: 'main', balances: { USD: { balance: '1993.20', input: '2283.20', output: '290' } }, total_balance: { converted_to: 'USD', approximate_total_balance: '1993.20', approximate_total_input: '2283.20', approximate_total_output: '290.00' } }] })
    const t = (id: number, dias: number, cat: string, canal: string, valor: string, st = 'completed') => ({ request_id: `r${id}`, transaction_id: id, timestamp: new Date(Date.now() - dias * 86400e3).toISOString(), category: cat, channel: canal, metadata: { transaction_status: st, transaction_gross_amount: valor, transaction_net_amount: valor, transaction_currency: 'USD' } })
    return json({ data: { start_date_time: null, end_date_time: null, transactions: [t(5, 0.2, 'deposit', 'payment_agent', '500.00', 'pending'), t(4, 3, 'withdrawal', 'cashier', '290.00'), t(3, 9, 'deposit', 'cashier', '1000.00'), t(2, 20, 'deposit', 'payment_agent', '583.20'), t(1, 40, 'deposit', 'cashier', '200.00')] }, links: { self: null, next: null, prev: null, first: null } })
  }) as typeof fetch
}

export default function LabCarteira() {
  const sem = new URLSearchParams(location.search).has('sem')
  respostas(sem)
  const session = { accessToken: 'lab', expiresAt: Date.now() + 3600e3 } as unknown as AuthSession
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)' }}><CarteiraDeriv session={session} fechar={() => undefined} reconectar={() => alert('reconectar')} /></div>
}
