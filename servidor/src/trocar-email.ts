import './ambiente'
import { emailDaConta, marcaDaConta } from '../../src/core/teeds/emailDaConta'

/**
 * Troca do e-mail de acesso feita pela equipe (20/10/2026).
 *
 * O Tiago tirou a troca do "Meu perfil": quem troca é o suporte, depois de
 * conferir com o cliente pelo chat. Aqui o admin da marca troca o e-mail do
 * login (com a etiqueta da marca, ver emailDaConta.ts) já confirmado; o
 * gatilho teeds_email_da_ficha leva o endereço novo para a ficha (clientes).
 *
 * Só troca conta DESTA marca: um admin da GlobalFly não mexe no login de
 * ninguém da Teeds, mesmo que o user_id venha errado.
 */
const base = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const segredo = () => process.env.SUPABASE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export async function trocarEmailDoCliente(userId: string, marca: string, novo: string): Promise<{ email: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) throw new Error('Cliente inválido.')
  const limpo = novo.trim().toLowerCase()
  if (!EMAIL.test(limpo) || /\+marca-/i.test(limpo)) throw new Error('Confira o e-mail novo.')
  const cab = { apikey: segredo(), Authorization: `Bearer ${segredo()}`, 'Content-Type': 'application/json' }
  const atual = await fetch(`${base()}/auth/v1/admin/users/${userId}`, { headers: cab, signal: AbortSignal.timeout(15000) })
  if (!atual.ok) throw new Error('Cliente não encontrado.')
  const usuario = await atual.json() as { email?: string }
  if (marcaDaConta(usuario.email) !== marca) throw new Error('Este cliente é de outra plataforma.')
  const r = await fetch(`${base()}/auth/v1/admin/users/${userId}`, {
    method: 'PUT', headers: cab, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ email: emailDaConta(limpo, marca), email_confirm: true }),
  })
  if (!r.ok) {
    const c = await r.json().catch(() => ({})) as { msg?: string; message?: string; error_code?: string }
    const m = String(c.msg || c.message || c.error_code || '').toLowerCase()
    if (m.includes('already') || m.includes('exists') || m.includes('registered')) throw new Error('Esse e-mail já é usado por outra conta nesta plataforma.')
    throw new Error('Não consegui trocar o e-mail agora. Tente de novo em instantes.')
  }
  return { email: limpo }
}
