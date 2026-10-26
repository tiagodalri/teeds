/**
 * O parceiro de divulgação em foco no admin (27/10/2026, Tiago: "no painel não
 * tem que ter GlobalFly Trade Victor, GlobalFly Trade Naor?").
 *
 * Funciona como a marca em foco (marcaEmFoco.ts): um valor só, para todas as
 * telas do admin, avisado por evento de janela. Vale só quando a marca em foco
 * tem parceiros (hoje, a GlobalFly) e só aparece para o admin geral; o
 * relatório de markup por parceiro continua na aba Parceiros.
 *
 *   ''       = todos os clientes da marca
 *   'direto' = quem chegou sem link de parceiro
 *   'n', 'v' = os clientes de cada parceiro
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

const EVENTO = 'parceiro-em-foco'
let emFoco = ''
const assinar = (cb: () => void) => { window.addEventListener(EVENTO, cb); return () => window.removeEventListener(EVENTO, cb) }

export const parceiroEmFoco = () => emFoco
export function useParceiroEmFoco(): [string, (codigo: string) => void] {
  const valor = useSyncExternalStore(assinar, parceiroEmFoco, parceiroEmFoco)
  const trocar = (codigo: string) => { if (codigo !== emFoco) { emFoco = codigo; window.dispatchEvent(new Event(EVENTO)) } }
  return [valor, trocar]
}

export interface OpcaoDeParceiro { codigo: string; nome: string }

/** Os parceiros da marca, só para o admin geral (os outros recebem lista vazia e não veem a linha). */
export function useParceirosDaMarca(sessao: SessaoTeeds | null, marca: string): OpcaoDeParceiro[] {
  const [lista, setLista] = useState<OpcaoDeParceiro[]>([])
  useEffect(() => {
    let vivo = true
    setLista([])
    if (!sessao || !marca || marca === 'todas') return
    const h = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' }
    ;(async () => {
      const geral = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_sou_admin_geral`, { method: 'POST', headers: h, body: '{}' }).then((r) => r.ok ? r.json() : false).catch(() => false)
      if (!geral) return
      const r = await fetch(`${SUPABASE.url}/rest/v1/parceiros?marca=eq.${encodeURIComponent(marca)}&ativo=eq.true&select=codigo,nome&order=codigo`, { headers: h }).catch(() => null)
      const l = r?.ok ? await r.json() : []
      if (vivo) setLista((l ?? []).map((p: any) => ({ codigo: String(p.codigo), nome: String(p.nome) })))
    })()
    return () => { vivo = false }
  }, [sessao?.token, marca]) // eslint-disable-line react-hooks/exhaustive-deps
  return lista
}

/** O cliente pertence ao foco? `parceiro` = o da ficha (null = direto); undefined = ainda não sabemos. */
export function noFoco(foco: string, parceiro: string | null | undefined): boolean {
  if (!foco) return true
  if (parceiro === undefined) return false
  return foco === 'direto' ? parceiro === null : parceiro === foco
}
