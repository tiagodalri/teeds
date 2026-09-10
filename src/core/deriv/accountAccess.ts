import type { TradingAccount } from './account'

/**
 * Logins que operam SOMENTE em conta demo: as contas reais somem do seletor
 * e o servidor recusa (403) operacao real. Sem aviso na tela — em 10/09/2026
 * o Tiago pediu a restricao para o teeds@gmail.com (segundo login dele),
 * mas sem a frase "Este acesso opera somente em conta demo".
 *
 * Para restringir outro acesso, basta por o e-mail aqui e reimplantar o
 * servidor (que importa este mesmo arquivo).
 */
const EMAILS_SOMENTE_DEMO: readonly string[] = ['teeds@gmail.com']

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
