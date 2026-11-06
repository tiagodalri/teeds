/**
 * A conta da calculadora: números e operadores em fila, resolvida com a
 * precedência de sempre (× e ÷ antes de + e −). Sem eval.
 */

export type Operador = '+' | '−' | '×' | '÷'
export type Pedaco = { tipo: 'num'; texto: string } | { tipo: 'op'; op: Operador }

export function paraNumero(texto: string): number {
  if (texto === '' || texto === '-') return 0
  return Number(texto.replace(',', '.'))
}

/** Resolve a fila. Um operador solto no fim é ignorado. Divisão por zero → null. */
export function resolver(fila: Pedaco[]): number | null {
  const itens = [...fila]
  while (itens.length && itens[itens.length - 1].tipo === 'op') itens.pop()
  if (!itens.length) return 0
  // primeiro × e ÷
  const soma: Array<number | Operador> = []
  let atual = paraNumero((itens[0] as { texto: string }).texto)
  for (let i = 1; i < itens.length; i += 2) {
    const op = (itens[i] as { op: Operador }).op
    const n = paraNumero((itens[i + 1] as { texto: string }).texto)
    if (op === '×') atual *= n
    else if (op === '÷') { if (n === 0) return null; atual /= n }
    else { soma.push(atual, op); atual = n }
  }
  soma.push(atual)
  let total = soma[0] as number
  for (let i = 1; i < soma.length; i += 2) total = soma[i] === '+' ? total + (soma[i + 1] as number) : total - (soma[i + 1] as number)
  return limpar(total)
}

/** Tira o ruído do ponto flutuante (0,1 + 0,2 = 0,3, e não 0,30000000000000004). */
export function limpar(n: number): number {
  return Number.isFinite(n) ? Number(n.toPrecision(12)) : n
}

/** Número para a tela, no jeito brasileiro: 1.234,56. */
export function mostrar(n: number): string {
  if (!Number.isFinite(n)) return 'Erro'
  const abs = Math.abs(n)
  if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) return n.toExponential(6).replace('.', ',')
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 10 })
}

/** O número que está sendo digitado, com milhar e vírgula, sem perder o "0," do começo. */
export function mostrarDigitado(texto: string): string {
  if (texto === '' ) return '0'
  const neg = texto.startsWith('-')
  const [int, dec] = texto.replace('-', '').split(',')
  const inteiro = Number(int || '0').toLocaleString('pt-BR')
  return `${neg ? '−' : ''}${inteiro}${dec !== undefined ? ',' + dec : ''}`
}
