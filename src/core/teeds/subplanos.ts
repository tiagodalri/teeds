/**
 * Os subplanos do GF Member (05/11/2026, reunião de 04/11): Gold, Black e
 * Prestige. O GF Member é o plano de todos; o subplano diz o que cada um tem:
 * quais I.A., quantas horas de simulador por dia, o compartilhamento de
 * receita, a sala extra, o assessor e o GFT Lab.
 *
 * Quem decide é o banco (tabela subplanos, teeds_subplano_id): a compra
 * ativa de gf-black/gf-prestige vale por cima de clientes.categoria. As
 * travas das I.A. e do simulador são conferidas pelo banco quando o servidor
 * liga uma sessão; a tela só explica e oferece o upgrade.
 */
import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

export type IdSubplano = 'gold' | 'black' | 'prestige'
export interface Subplano {
  id: IdSubplano | string
  nome: string
  ordem: number
  chamada: string | null
  precoReferencia: number | null
  preco: number | null
  cobranca: 'aquisicao-zero' | 'anual' | 'mensal' | string
  compartilhamento: number
  /** null = todas as I.A. */
  ias: string[] | null
  /** null = ilimitado */
  simuladorHoras: number | null
  salaExtra: boolean
  assessor: boolean
  lab: boolean
  checkoutUrl: string | null
  assessorWhatsapp: string | null
  ativo: boolean
}
export interface MeuSubplano { atual: string; admin: boolean; minutosHoje: number; subplanos: Subplano[] }

const daLinha = (l: any): Subplano => ({
  id: l.id, nome: l.nome, ordem: Number(l.ordem) || 0, chamada: l.chamada ?? null,
  precoReferencia: l.preco_referencia == null ? null : Number(l.preco_referencia), preco: l.preco == null ? null : Number(l.preco),
  cobranca: l.cobranca ?? 'anual', compartilhamento: Number(l.compartilhamento ?? 0), ias: Array.isArray(l.ias) ? l.ias : null,
  simuladorHoras: l.simulador_horas == null ? null : Number(l.simulador_horas), salaExtra: !!l.sala_extra, assessor: !!l.assessor, lab: !!l.lab,
  checkoutUrl: l.checkout_url || null, assessorWhatsapp: l.assessor_whatsapp || null, ativo: l.ativo !== false,
})
const paraLinha = (s: Subplano, marca: string) => ({
  marca, id: s.id, nome: s.nome, ordem: s.ordem, chamada: s.chamada, preco_referencia: s.precoReferencia, preco: s.preco, cobranca: s.cobranca,
  compartilhamento: s.compartilhamento, ias: s.ias, simulador_horas: s.simuladorHoras, sala_extra: s.salaExtra, assessor: s.assessor, lab: s.lab,
  checkout_url: s.checkoutUrl, assessor_whatsapp: s.assessorWhatsapp, ativo: s.ativo, atualizado_em: new Date().toISOString(),
})

let atual: MeuSubplano | null = null
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())

/** O meu subplano (e todos, para comparar). Falha em silêncio: sem resposta, a tela não tranca nada. */
export async function carregarMeuSubplano(sessao: SessaoTeeds | null, marca: string = MARCA.id): Promise<MeuSubplano | null> {
  if (!sessao) { atual = null; avisar(); return null }
  try {
    const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_meu_subplano`, {
      method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_marca: marca }),
    })
    if (!r.ok) throw new Error(String(r.status))
    const j = await r.json()
    atual = { atual: String(j.atual ?? 'gold'), admin: !!j.admin, minutosHoje: Number(j.minutos_hoje ?? 0), subplanos: (j.subplanos ?? []).map(daLinha) }
  } catch { /* mantém o que tinha */ }
  avisar()
  return atual
}
export const useMeuSubplano = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => atual, () => atual)
export const subplanoAtual = (m: MeuSubplano | null) => m?.subplanos.find((s) => s.id === m.atual) ?? null

/** Abre a janela "Meu plano" de qualquer tela (o App escuta). `foco` destaca um subplano. */
export function abrirMeuPlano(foco?: string) { window.dispatchEvent(new CustomEvent('plataforma:meu-plano', { detail: foco ?? null })) }

/* ------------------------------------------------------------- admin */
export async function listarSubplanos(sessao: SessaoTeeds, marca: string): Promise<Subplano[]> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/subplanos?select=*&marca=eq.${encodeURIComponent(marca)}&order=ordem.asc`, { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` } })
  if (!r.ok) throw new Error('Não foi possível ler os subplanos.')
  return ((await r.json()) as any[]).map(daLinha)
}
export async function salvarSubplano(sessao: SessaoTeeds, s: Subplano, marca: string): Promise<void> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/subplanos?on_conflict=marca,id`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(paraLinha(s, marca)),
  })
  if (!r.ok) { const c = await r.json().catch(() => ({})); throw new Error(c?.message || 'Não foi possível salvar o subplano.') }
}

/* ---------------------------------------------------------- textos */
export const precoLegivel = (v: number | null) => (v == null ? '' : v === 0 ? 'R$ 0' : `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`)
export const cobrancaLegivel = (s: Subplano) => (s.cobranca === 'aquisicao-zero' || s.preco === 0 ? 'Aquisição zero' : `${precoLegivel(s.preco)} ${s.cobranca === 'mensal' ? 'por mês' : 'por ano'}`)
export const simuladorLegivel = (h: number | null) => (h == null ? 'Ilimitado' : h === 0 ? 'Sem simulador' : `${h.toLocaleString('pt-BR')} h por dia`)
export const compartilhamentoLegivel = (c: number) => (c > 0 ? `${Math.round(c * 1000) / 10}% do lucro` : 'Sem compartilhamento')

/** Só para o laboratório: finge o subplano da pessoa. */
export function simularMeuSubplano(d: MeuSubplano) { atual = d; avisar() }
