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

const CHAVE_PONTOS = 'teeds:sessao-simulada:pontos'
/** Quantas sessões simuladas cabem na tela ao mesmo tempo (17/11/2026). */
export const MAX_SIMULADAS = 5
const ehRoteiro = (r: unknown): r is Roteiro => !!r && typeof r === 'object' && Array.isArray((r as Roteiro).trechos) && (r as Roteiro).trechos.length > 0

/**
 * As sessões abertas (17/11/2026, Tiago: "quero que eu consiga simular as 5 e não só uma"). A mesma chave de
 * antes guarda agora a lista; o que ficou guardado no formato antigo (uma sessão só) é lido como lista de uma.
 * Toda sessão sai daqui com id (é ele que separa o ponto, o relatório e a mini cabine de cada uma).
 */
export function lerSessoesGuardadas(): Roteiro[] {
  const x = ler<unknown>(CHAVE_ROTEIRO)
  const lista = Array.isArray(x) ? x.filter(ehRoteiro) : ehRoteiro(x) ? [x] : []
  const vistos = new Set<string>()
  const saida: Roteiro[] = []
  lista.slice(0, MAX_SIMULADAS).forEach((r, i) => {
    const id = r.id ?? `simulada-guardada-${r.semente}-${i}`
    if (vistos.has(id)) return
    vistos.add(id)
    saida.push(r.id ? r : { ...r, id })
  })
  return saida
}
/** Guarda a lista (vazia = esquece tudo) e joga fora o ponto das sessões que saíram. */
export function guardarSessoes(rs: Roteiro[]): void {
  if (rs.length === 0) { esquecerSessao(); return }
  escrever(CHAVE_ROTEIRO, rs)
  const pontos = ler<Record<string, PontoGuardado>>(CHAVE_PONTOS)
  if (!pontos || typeof pontos !== 'object') return
  const ids = new Set(rs.map((r) => r.id))
  const ficam = Object.fromEntries(Object.entries(pontos).filter(([id]) => ids.has(id)))
  if (Object.keys(ficam).length !== Object.keys(pontos).length) escrever(CHAVE_PONTOS, ficam)
}

const pontoValido = (p: PontoGuardado | null | undefined, id: string): p is PontoGuardado => !!p && p.id === id && Number.isFinite(p.operacoes) && Number.isFinite(p.t0)
export function lerPontoGuardado(id: string | undefined): PontoGuardado | null {
  if (!id) return null
  const pontos = ler<Record<string, PontoGuardado>>(CHAVE_PONTOS)
  const doMapa = pontos && typeof pontos === 'object' ? pontos[id] : null
  if (pontoValido(doMapa, id)) return doMapa
  // guardado antes de 17/11/2026: um ponto só
  const antigo = ler<PontoGuardado>(CHAVE_PONTO)
  return pontoValido(antigo, id) ? antigo : null
}
export function guardarPonto(p: PontoGuardado): void {
  const pontos = ler<Record<string, PontoGuardado>>(CHAVE_PONTOS)
  escrever(CHAVE_PONTOS, { ...(pontos && typeof pontos === 'object' ? pontos : {}), [p.id]: p })
}

/** Saiu de todas as sessões: esquece os roteiros e os pontos. */
export function esquecerSessao(): void {
  try { localStorage.removeItem(CHAVE_ROTEIRO); localStorage.removeItem(CHAVE_PONTO); localStorage.removeItem(CHAVE_PONTOS) } catch { /* nada */ }
}
