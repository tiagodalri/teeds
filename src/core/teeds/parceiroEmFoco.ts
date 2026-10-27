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
// as telas do admin abertas (gestão, monitoramento, insights): ver noPainel()
let noPainel = false
/** O App avisa a cada render se a tela aberta é do admin (antes dos filhos lerem o banco). */
export const marcarPainel = (ativo: boolean) => { noPainel = ativo }

/*
  O FILTRO VALE NO BANCO (27/10/2026, Tiago: "eu, admin geral, devo ver tudo e
  conseguir filtrar cada um"). Com um parceiro em foco, toda leitura do painel
  vai ao banco com o cabeçalho x-teeds-vitrine, e o banco responde exatamente o
  que aquele parceiro veria (a mesma regra que prende o admin do parceiro, ver
  supabase/migracoes/20261027220000_admin_do_parceiro.sql). Para quem não é
  admin geral o banco ignora o cabeçalho.

  Nas telas do admin vai também x-teeds-painel: 1. Com ele o banco deixa de
  somar as linhas PRÓPRIAS de quem é admin e também opera: no painel, só o
  escopo (20261027235000_painel_sem_linhas_proprias.sql). Fora delas, nada vai.
*/
if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
  const original = window.fetch.bind(window)
  window.fetch = (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    if (!noPainel) return original(entrada, opcoes)
    const codigo = emFoco
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    if (!url.startsWith(`${SUPABASE.url}/rest/v1/`)) return original(entrada, opcoes)
    const cabecalhos = new Headers(opcoes?.headers ?? (entrada instanceof Request ? entrada.headers : undefined))
    cabecalhos.set('x-teeds-painel', '1')
    if (codigo) cabecalhos.set('x-teeds-vitrine', codigo)
    return original(entrada, { ...opcoes, headers: cabecalhos })
  }
}
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

/** O selo do cliente no admin: "Naor /n", "Victor /v" ou "Direto". undefined = a ficha ainda não chegou. */
export function seloDoParceiro(parceiros: OpcaoDeParceiro[], parceiro: string | null | undefined): { texto: string; codigo: string } | null {
  if (!parceiros.length || parceiro === undefined) return null
  if (!parceiro) return { texto: 'Direto', codigo: 'direto' }
  const p = parceiros.find((x) => x.codigo === parceiro)
  return { texto: `${(p?.nome ?? parceiro).split(' ')[0]} /${parceiro}`, codigo: parceiro }
}

/** O papel de quem está logado nesta marca: admin geral, admin do parceiro (só o /n ou o /v dele) ou nenhum. */
export interface PapelDoAdmin { admin: boolean; geral: boolean; parceiro: string | null; nomeDoParceiro: string | null }
const papeis = new Map<string, Promise<PapelDoAdmin>>()
export function meuPapel(sessao: SessaoTeeds, marca: string): Promise<PapelDoAdmin> {
  const chave = `${sessao.usuario.id}:${marca}`
  let p = papeis.get(chave)
  if (!p) {
    const h = { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' }
    p = (async () => {
      const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_meu_papel`, { method: 'POST', headers: h, body: JSON.stringify({ p_marca: marca }) })
      if (!r.ok) throw new Error('papel')
      const d = await r.json() as { admin?: boolean; geral?: boolean; parceiro?: string | null }
      let nome: string | null = null
      if (d.parceiro) {
        const l = await fetch(`${SUPABASE.url}/rest/v1/parceiros?marca=eq.${encodeURIComponent(marca)}&codigo=eq.${encodeURIComponent(d.parceiro)}&select=nome`, { headers: h })
          .then((x) => (x.ok ? x.json() : [])).catch(() => [])
        nome = l?.[0]?.nome ? String(l[0].nome) : null
      }
      return { admin: !!d.admin, geral: !!d.geral, parceiro: d.parceiro ?? null, nomeDoParceiro: nome }
    })()
    p.catch(() => papeis.delete(chave))
    papeis.set(chave, p)
  }
  return p
}
/** null enquanto não sabe. */
export function useMeuPapel(sessao: SessaoTeeds | null, marca: string): PapelDoAdmin | null {
  const [papel, setPapel] = useState<PapelDoAdmin | null>(null)
  useEffect(() => {
    let vivo = true
    setPapel(null)
    if (!sessao || !marca || marca === 'todas') return
    meuPapel(sessao, marca).then((p) => { if (vivo) setPapel(p) }).catch(() => undefined)
    return () => { vivo = false }
  }, [sessao?.usuario.id, sessao?.token, marca]) // eslint-disable-line react-hooks/exhaustive-deps
  return papel
}
/** O rótulo do parceiro: "Naor /n". */
export const rotuloDoParceiro = (nome: string | null, codigo: string) => `${(nome ?? codigo).split(' ')[0]} /${codigo}`
/** As abas e telas do admin que mexem na plataforma inteira: só o admin geral. */
export const SO_DO_ADMIN_GERAL = ['emails', 'aulas', 'robos', 'planos', 'produtos', 'comissoes', 'estudo', 'parceiros'] as const
