/**
 * Trocas de código que valem uma vez só (o `code` da Deriv, o `?confirmar=`
 * do e-mail). Enquanto uma está no ar, a conferência de versão do main.tsx
 * não recarrega a página: o recarregamento no meio perderia o código e a
 * pessoa veria "link já usado" (revisão de 21/10/2026).
 */
let emAndamento = 0

export const haTrocaEmAndamento = () => emAndamento > 0

export async function duranteTroca<T>(fazer: () => Promise<T>): Promise<T> {
  emAndamento++
  try { return await fazer() } finally { emAndamento-- }
}
