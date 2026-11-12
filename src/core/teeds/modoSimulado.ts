/**
 * Modo simulado geral (12/11/2026, Tiago: "quero um modo simulado em todos os
 * âmbitos da plataforma, disponível somente para admins: o saldo da conta lá
 * em cima, o resultado da operação antes de dar o play com os parâmetros
 * certinhos, o relatório, tudo literalmente. Sempre com uma tag única lá em
 * cima com o texto Simulado").
 *
 * O estado mora aqui, fora do React, porque várias partes que não se
 * conhecem leem o mesmo modo: o topo, a aba das I.A., o Operar, o relatório.
 *
 * Trava de admin: o App diz quem pode (`permitirModoSimulado`). Sem a
 * permissão o modo NÃO existe, mesmo que o aparelho tenha guardado "ligado"
 * (um cliente que entrar depois no mesmo computador vê a plataforma normal).
 *
 * Nada daqui fala com a Deriv, o banco ou o servidor.
 */
import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'
import type { RelatorioCompleto } from './relatorios'

export interface EstadoSimulado {
  ligado: boolean
  /** Saldo da conta simulada (o do topo). */
  saldo: number
  /** Como a conta aparece: Real ou Demo. */
  conta: 'real' | 'demo'
}
/** O que as telas recebem: só existe com o modo ligado E a permissão de admin. */
export type ModoSimulado = Omit<EstadoSimulado, 'ligado'>

const CHAVE = `${MARCA.id}.modo-simulado`
const PADRAO: EstadoSimulado = { ligado: false, saldo: 100, conta: 'real' }

function ler(): EstadoSimulado {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null') as Partial<EstadoSimulado> | null
    if (v && typeof v === 'object') return {
      ligado: v.ligado === true,
      saldo: Number.isFinite(v.saldo) && (v.saldo as number) >= 0 ? Math.round((v.saldo as number) * 100) / 100 : PADRAO.saldo,
      conta: v.conta === 'demo' ? 'demo' : 'real',
    }
  } catch { /* sem armazenamento: começa desligado */ }
  return { ...PADRAO }
}

let estado: EstadoSimulado = ler()
let permitido = false
let visto: ModoSimulado | null = null
const ouvintes = new Set<() => void>()

function avisar() {
  const novo = permitido && estado.ligado ? { saldo: estado.saldo, conta: estado.conta } : null
  // a mesma referência enquanto nada mudou (useSyncExternalStore exige)
  if (!(novo === visto || (novo && visto && novo.saldo === visto.saldo && novo.conta === visto.conta))) visto = novo
  ouvintes.forEach((f) => f())
}
function guardar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)) } catch { /* vale até recarregar */ }
}
const r2 = (x: number) => Math.round(x * 100) / 100

/** O App diz se quem está na tela é admin. Sem isso, o modo não existe. */
export function permitirModoSimulado(pode: boolean): void {
  if (pode === permitido) return
  permitido = pode
  avisar()
}

export function ligarModoSimulado(): void {
  if (!permitido) return
  estado = { ...estado, ligado: true }
  guardar(); avisar()
}
export function desligarModoSimulado(): void {
  estado = { ...estado, ligado: false }
  livro.clear()
  guardar(); avisar(); avisarLivro()
  window.dispatchEvent(new CustomEvent('modo-simulado:desligou'))
}
export function definirSaldoSimulado(valor: number): void {
  if (!Number.isFinite(valor)) return
  const v = r2(Math.max(0, valor))
  if (v === estado.saldo) return
  estado = { ...estado, saldo: v }
  guardar(); avisar()
}
/** Compra e liquidação das operações simuladas mexem no saldo por aqui. */
export function somarAoSaldoSimulado(delta: number): void { definirSaldoSimulado(estado.saldo + delta) }
export function definirContaSimulada(conta: 'real' | 'demo'): void {
  if (conta === estado.conta) return
  estado = { ...estado, conta }
  guardar(); avisar()
}

/** Para código fora do React (as travas de compra): o modo está valendo agora? */
export const modoSimuladoAtivo = (): boolean => permitido && estado.ligado
export const saldoSimuladoAgora = (): number => estado.saldo

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
/** null = modo desligado (ou quem está na tela não é admin). */
export function useModoSimulado(): ModoSimulado | null {
  return useSyncExternalStore(assinar, () => visto, () => null)
}
/** Admin pode ligar o modo? (para mostrar o botão). */
export function usePodeSimular(): boolean {
  return useSyncExternalStore(assinar, () => permitido, () => false)
}

/* ------------------------------------------------ o livro das operações */

/**
 * As operações feitas no modo simulado (I.A. e manuais), no formato do
 * relatório. Cada sessão simulada de I.A. reescreve as suas (voltar no palco
 * desfaz); cada manual simulada entra uma vez, ao fechar. Só nesta aba:
 * recarregar a página zera o livro (o saldo fica).
 */
export type OperacaoDoLivro = RelatorioCompleto['ultimas'][number]
const livro = new Map<string, OperacaoDoLivro[]>()
let fotoDoLivro: OperacaoDoLivro[] = []
const ouvintesLivro = new Set<() => void>()
function avisarLivro() {
  fotoDoLivro = [...livro.values()].flat().sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
  ouvintesLivro.forEach((f) => f())
}
/** Reescreve as operações de uma origem (uma sessão de I.A., ou "manuais"). */
export function escreverNoLivro(origem: string, ops: OperacaoDoLivro[]): void {
  if (!modoSimuladoAtivo()) return
  livro.set(origem, ops)
  avisarLivro()
}
export function somarNoLivro(origem: string, op: OperacaoDoLivro): void {
  if (!modoSimuladoAtivo()) return
  livro.set(origem, [...(livro.get(origem) ?? []), op])
  avisarLivro()
}
export function zerarLivro(): void { livro.clear(); avisarLivro() }
export function useLivroSimulado(): OperacaoDoLivro[] {
  return useSyncExternalStore((f) => { ouvintesLivro.add(f); return () => { ouvintesLivro.delete(f) } }, () => fotoDoLivro, () => fotoDoLivro)
}
