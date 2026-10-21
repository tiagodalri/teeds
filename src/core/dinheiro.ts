/**
 * Dinheiro na tela: SEMPRE "US$ 1.234,56" (milhar com ponto, centavos com
 * vírgula), padrão da plataforma desde 21/10/2026. Só para mostrar: o valor
 * que vai para a Deriv continua sendo o número cru.
 */
export function simboloMoeda(m: string): string {
  return m === 'USD' ? 'US$' : m
}

export function dinheiro(v: number, m = 'USD'): string {
  return `${simboloMoeda(m)} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Com sinal na frente: "+US$ 12,00" ou "−US$ 3,50" (sinal de menos de verdade, U+2212). */
export function dinheiroComSinal(v: number, m = 'USD'): string {
  return `${v >= 0 ? '+' : '−'}${dinheiro(Math.abs(v), m)}`
}
