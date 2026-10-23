/**
 * O nome que a equipe reconhece a partir do código da Deriv (23/10/2026):
 * "frxXAUUSD" → "Ouro (XAU/USD)", "frxEURUSD" → "EUR/USD", "R_75" → "75 Index".
 * Para as telas que só têm o código gravado (Monitoramento, Centro de estudo).
 */
export function nomeDoSimbolo(simbolo: string): string {
  const especiais: Record<string, string> = { frxXAUUSD: 'Ouro (XAU/USD)', frxXAGUSD: 'Prata (XAG/USD)', frxXPTUSD: 'Platina (XPT/USD)', frxXPDUSD: 'Paládio (XPD/USD)' }
  if (especiais[simbolo]) return especiais[simbolo]
  const fx = simbolo.match(/^frx([A-Z]{3})([A-Z]{3})$/)
  if (fx) return `${fx[1]}/${fx[2]}`
  const r = simbolo.match(/^R_(\d+)$/)
  if (r) return `${r[1]} Index`
  const s1 = simbolo.match(/^1HZ(\d+)V$/)
  if (s1) return `${s1[1]} (1s) Index`
  return simbolo
}
