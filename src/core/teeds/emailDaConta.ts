/**
 * Uma conta por marca (20/10/2026).
 *
 * As três marcas dividem o mesmo projeto Supabase, e o login da Supabase é
 * um só por e-mail. Até aqui, quem tinha conta na Teeds entrava na OMNI e na
 * GlobalFly com a mesma senha, e trocar numa trocava nas outras. O Tiago
 * pediu: cada marca com a sua conta, senha independente, nada misturado.
 *
 * Como fica: a pessoa sempre digita o e-mail de verdade. No login da
 * Supabase, a conta de cada marca existe com uma etiqueta no e-mail:
 *
 *   teeds      ana@gmail.com                      (como sempre foi)
 *   omni       ana+marca-omni@gmail.com
 *   globalfly  ana+marca-globalfly@gmail.com
 *
 * São contas diferentes (ids diferentes): senha, sessões, Deriv, robôs e
 * histórico de uma não enxergam os da outra. A etiqueta nunca aparece para a
 * pessoa nem recebe e-mail: o carteiro (gancho-email.ts) tira a etiqueta e
 * manda para o endereço de verdade, já sabendo a marca pela etiqueta.
 *
 * O banco tem as mesmas duas contas em SQL: teeds_email_da_conta e
 * teeds_email_real (migração 20261020180000).
 */

const ETIQUETA = /\+marca-([a-z0-9]+)(?=@[^@]+$)/i

/** O e-mail com que a conta desta marca existe no login. */
export function emailDaConta(email: string, marca: string): string {
  const e = email.trim().toLowerCase()
  if (!marca || marca === 'teeds') return e
  const arroba = e.lastIndexOf('@')
  if (arroba < 1 || ETIQUETA.test(e)) return e
  return `${e.slice(0, arroba)}+marca-${marca}${e.slice(arroba)}`
}

/** O e-mail de verdade, sem a etiqueta da marca. */
export const emailReal = (email: string | null | undefined): string => String(email ?? '').replace(ETIQUETA, '')

/** A marca da conta pela etiqueta; sem etiqueta é a Teeds. */
export const marcaDaConta = (email: string | null | undefined): string => ETIQUETA.exec(String(email ?? ''))?.[1]?.toLowerCase() ?? 'teeds'
