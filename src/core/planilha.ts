/**
 * Células de planilha (CSV) seguras (09/11/2026).
 *
 * - Texto que começa com = + - @ (ou tab/enter) o Excel lê como fórmula: um nome digitado no
 *   formulário público podia virar fórmula na planilha do admin. Leva um apóstrofo na frente.
 * - Telefone "+55 51 9…" o Excel lê como número e perde o "+" e os zeros: vai como texto (="…").
 */
export function celulaCsv(v: unknown): string {
  const t = String(v ?? '')
  const seguro = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t
  return `"${seguro.replace(/"/g, '""')}"`
}

export function telefoneCsv(v: unknown): string {
  const t = String(v ?? '').replace(/[^\d+()\s-]/g, '').trim()
  return t ? `"=""${t}"""` : '""'
}

/** O dia de hoje no aparelho (2026-11-09), para o nome do arquivo: o toISOString dá o de Londres. */
export const diaDeHoje = () => new Date().toLocaleDateString('sv-SE')
