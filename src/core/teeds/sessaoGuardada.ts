/**
 * A sessão simulada aberta, guardada no navegador (12/11/2026, Tiago: "mesmo quando eu pauso, eu
 * devo conseguir dar play de onde parou"). Guarda o roteiro e a operação em que a sessão estava,
 * para editar, sair da aba ou recarregar a página e voltar no mesmo ponto. Só neste navegador:
 * nada vai ao servidor, como o resto do modo simulado.
 */
import type { Roteiro } from './sessaoSimulada'

const CHAVE_ROTEIRO = 'teeds:sessao-simulada:roteiro'
const CHAVE_PONTO = 'teeds:sessao-simulada:ponto'

/** Onde a sessão estava: a operação (e o relógio do começo, para o relatório não mudar de hora). */
export interface PontoGuardado { id: string; operacoes: number; t0: number }

function ler<T>(chave: string): T | null {
  try { return JSON.parse(localStorage.getItem(chave) || 'null') as T | null } catch { return null }
}
function escrever(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)) } catch { /* vale até recarregar */ }
}

export function lerSessaoGuardada(): Roteiro | null {
  const r = ler<Roteiro>(CHAVE_ROTEIRO)
  return r && typeof r === 'object' && Array.isArray(r.trechos) && r.trechos.length > 0 ? r : null
}
export function guardarSessao(r: Roteiro): void { escrever(CHAVE_ROTEIRO, r) }

export function lerPontoGuardado(id: string | undefined): PontoGuardado | null {
  if (!id) return null
  const p = ler<PontoGuardado>(CHAVE_PONTO)
  return p && p.id === id && Number.isFinite(p.operacoes) && Number.isFinite(p.t0) ? p : null
}
export function guardarPonto(p: PontoGuardado): void { escrever(CHAVE_PONTO, p) }

/** Saiu da sessão: esquece o roteiro e o ponto. */
export function esquecerSessao(): void {
  try { localStorage.removeItem(CHAVE_ROTEIRO); localStorage.removeItem(CHAVE_PONTO) } catch { /* nada */ }
}
