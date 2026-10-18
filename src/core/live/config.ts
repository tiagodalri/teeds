/**
 * Configuração do ao vivo da marca que vale para todo mundo: hoje, só a
 * chave "link público" da fase de testes (18/10/2026). Ligada, quem abre o
 * link da live sem conta assiste como convidado; desligada, só aluno entra.
 *
 * Fica num lugar só porque aparece em vários cantos (estúdio, painel, página
 * de quem chega pelo link) e muda raramente.
 */
import { useSyncExternalStore } from 'react'
import type { SessaoTeeds } from '../teeds/conta'
import { definirLinkPublico, linkPublicoAtivo } from './api'

let publico: boolean | null = null
let carregando: Promise<void> | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

/** `null` enquanto não se sabe. Dispara a leitura na primeira vez. */
export function useLinkPublico(): boolean | null {
  if (publico === null && !carregando) void carregarLinkPublico()
  return useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => publico, () => publico)
}

export function carregarLinkPublico(): Promise<void> {
  carregando ??= linkPublicoAtivo().then((v) => { publico = v }).catch(() => { publico = false }).finally(() => { carregando = null; avisar() })
  return carregando
}

export async function mudarLinkPublico(sessao: SessaoTeeds, valor: boolean): Promise<void> {
  await definirLinkPublico(sessao, valor)
  publico = valor
  avisar()
}
