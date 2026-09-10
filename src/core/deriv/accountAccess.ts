import type { TradingAccount } from './account'

/**
 * Logins que operam SOMENTE em conta demo (aviso no seletor, contas reais
 * escondidas e 403 no servidor para operacao real).
 *
 * Em 10/09/2026 o Tiago pediu para liberar o teeds@gmail.com — ele e o
 * proprio dono, no segundo login dele. A lista fica vazia, mas o mecanismo
 * continua: para restringir um acesso de demonstracao, basta por o e-mail
 * aqui e reimplantar o servidor (que importa este mesmo arquivo).
 */
const EMAILS_SOMENTE_DEMO: readonly string[] = []

export const emailDeDemonstracao = (email?: string | null) =>
  !!email && EMAILS_SOMENTE_DEMO.includes(email.trim().toLowerCase())

/** Fail closed while the administrator permission is still being checked. */
export const acessoSomenteDemo = (admin?: boolean | null, email?: string | null) =>
  emailDeDemonstracao(email) && admin !== false

export function contasPermitidas(contas: TradingAccount[], somenteDemo: boolean) {
  return somenteDemo ? contas.filter(c => c.type === 'demo') : contas
}

export function selecionarContaPermitida(contas: TradingAccount[], id: string | null) {
  return contas.find(c => c.accountId === id) ?? contas.find(c => c.type === 'demo') ?? contas[0] ?? null
}
