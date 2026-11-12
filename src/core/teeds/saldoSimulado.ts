/**
 * O saldo do topo durante a sessão simulada (12/11/2026): enquanto ela roda,
 * o seletor de conta mostra o saldo da simulação, que sobe e desce com cada
 * operação, e não o da Deriv. Só a tela: nenhuma conta é tocada.
 */
import { useSyncExternalStore } from 'react'

export interface SaldoSimulado { valor: number; demo: boolean }
let atual: SaldoSimulado | null = null
const ouvintes = new Set<() => void>()

export function definirSaldoSimulado(s: SaldoSimulado | null): void {
  if (s === atual || (s && atual && s.valor === atual.valor && s.demo === atual.demo)) return
  atual = s
  ouvintes.forEach((f) => f())
}

export function useSaldoSimulado(): SaldoSimulado | null {
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => atual, () => null)
}
