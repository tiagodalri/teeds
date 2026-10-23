import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

/**
 * As I.A. vendidas à parte (23/10/2026, só na GlobalFly): Gulf (superior5, o
 * AG7 da Teeds) e Phenom (ag2, o AG2 da Teeds), R$ 297 cada ou R$ 497 os dois.
 * Raptor, Falcon e Legacy são de todos. A base da antiga Stark já tem as 5
 * (produto "gf-base-stark", marcado pelo admin no cadastro do cliente).
 *
 * A decisão é do banco (teeds_robo_liberado) e o servidor confere de novo ao
 * ligar: a tela só mostra o cadeado e leva ao Marketplace. Se a consulta
 * falhar, a tela não tranca nada (o servidor continua barrando).
 */
export const ROBOS_A_VENDA: Record<string, { produto: string; preco: string }> = {
  superior5: { produto: 'gf-gulf', preco: 'R$ 297' },
  ag2: { produto: 'gf-phenom', preco: 'R$ 297' },
}

let bloqueados: ReadonlySet<string> = new Set()
const ouvintes = new Set<() => void>()
const mudar = (s: ReadonlySet<string>) => { bloqueados = s; ouvintes.forEach((f) => f()) }

export async function carregarRobosBloqueados(sessao: SessaoTeeds | null): Promise<void> {
  if (!sessao || MARCA.id !== 'globalfly') { mudar(new Set()); return }
  try {
    const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_meus_robos_bloqueados`, {
      method: 'POST',
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_marca: MARCA.id }),
    })
    if (!r.ok) throw new Error(String(r.status))
    const lista = (await r.json()) as string[] | null
    mudar(new Set(lista ?? []))
  } catch { mudar(new Set()) }
}

/** As I.A. que a pessoa logada ainda não tem nesta marca. */
export const useRobosBloqueados = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => bloqueados, () => bloqueados)
export const roboBloqueado = (id: string) => bloqueados.has(id)

/** Leva para outra tela da plataforma (o App escuta). Usado pelo cadeado: "Desbloquear" abre o Marketplace. */
export function irParaTela(tela: string): void { window.dispatchEvent(new CustomEvent('plataforma:ir', { detail: tela })) }

/** Só para o laboratório: finge quais I.A. estão trancadas. */
export const simularRobosBloqueados = (ids: string[]) => mudar(new Set(ids))
