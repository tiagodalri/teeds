import type { TradingAccount } from './account'

export const emailDeDemonstracao = (email?: string | null) =>
  email?.trim().toLowerCase() === 'teeds@gmail.com'

/** Fail closed while the administrator permission is still being checked. */
export const acessoSomenteDemo = (admin?: boolean | null, email?: string | null) =>
  emailDeDemonstracao(email) && admin !== false

export function contasPermitidas(contas: TradingAccount[], somenteDemo: boolean) {
  return somenteDemo ? contas.filter(c => c.type === 'demo') : contas
}

export function selecionarContaPermitida(contas: TradingAccount[], id: string | null) {
  return contas.find(c => c.accountId === id) ?? contas.find(c => c.type === 'demo') ?? contas[0] ?? null
}
