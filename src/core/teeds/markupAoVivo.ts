/**
 * O markup a cada operação (11/11/2026, Tiago: "eu gostaria que no painel da visão geral o markup atualizasse
 * 100% em tempo real... cada vez que um markup é gerado... igual lá nos cards do monitoramento ao vivo").
 *
 * As leituras grandes da Visão geral (painel, período, metas, Comissões) seguem a cada 15 s e trazem `lido_em`
 * (o relógio do banco na hora da leitura). Este gancho pergunta a cada 1 s (era 2 s; 11/11, Tiago: "tem como ser
 * tipo em tempo real mesmo? a cada 1 segundo"), com a tela à vista, só "quanto
 * markup entrou DEPOIS dessa leitura" (teeds_markup_desde, ~5 ms) e a tela soma por cima. Quando a próxima
 * leitura grande chega, ela já traz essas operações, `lido_em` muda e a soma por cima recomeça do zero —
 * nada é contado duas vezes. Mesma regra da contagem única do markup.
 */
import { useEffect, useRef, useState } from 'react'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

export interface MarkupNovo {
  markup: number
  operacoes: number
  iaMarkup: number
  manualMarkup: number
  iaOperacoes: number
  manualOperacoes: number
  /** A operação mais recente que entrou (null = nenhuma desde a leitura). */
  ultimaEm: string | null
}

export const NADA_NOVO: MarkupNovo = { markup: 0, operacoes: 0, iaMarkup: 0, manualMarkup: 0, iaOperacoes: 0, manualOperacoes: 0, ultimaEm: null }

/** De quanto em quanto tempo a tela pergunta se entrou markup novo. */
export const PULSO_DO_MARKUP_MS = 1_000

async function lerDesde(sessao: SessaoTeeds, marca: string, parceiro: string, desde: string): Promise<MarkupNovo> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_markup_desde`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_desde: desde, p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error(`markup ${r.status}`)
  const d = await r.json()
  const n = (v: unknown) => Number(v ?? 0) || 0
  return {
    markup: n(d.markup), operacoes: n(d.operacoes), iaMarkup: n(d.ia_markup), manualMarkup: n(d.manual_markup),
    iaOperacoes: n(d.ia_operacoes), manualOperacoes: n(d.manual_operacoes), ultimaEm: d.ultima_em ?? null,
  }
}

/**
 * O markup que entrou depois de `desde` (o `lido_em` da última leitura grande). `desde` null = desligado
 * (sem leitura ainda, ou período que não chega até agora): devolve zero e não pergunta nada.
 */
export function useMarkupDesde(sessao: SessaoTeeds | null, marca: string, parceiro: string, desde: string | null | undefined): MarkupNovo {
  const [novo, setNovo] = useState<MarkupNovo>(NADA_NOVO)
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao

  useEffect(() => {
    setNovo(NADA_NOVO)
    if (!desde || !sessaoRef.current) return
    let vivo = true
    let t = 0
    let lendo = false
    const ler = () => {
      window.clearTimeout(t)
      const s = sessaoRef.current
      if (!vivo || !s || lendo || document.visibilityState === 'hidden') return
      lendo = true
      void lerDesde(s, marca, parceiro, desde)
        // só troca o estado quando muda de verdade (evita redesenhar a tela a cada segundo à toa)
        .then((d) => { if (vivo) setNovo((v) => (v.operacoes === d.operacoes && v.markup === d.markup && v.ultimaEm === d.ultimaEm ? v : d)) })
        .catch(() => { /* a próxima pergunta tenta de novo; a leitura grande de 15 s segue valendo */ })
        .finally(() => { lendo = false; if (vivo) t = window.setTimeout(ler, PULSO_DO_MARKUP_MS) })
    }
    const aoVoltar = () => { if (document.visibilityState === 'visible') ler() }
    document.addEventListener('visibilitychange', aoVoltar)
    t = window.setTimeout(ler, PULSO_DO_MARKUP_MS)
    return () => { vivo = false; window.clearTimeout(t); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [desde, marca, parceiro])

  return novo
}

/** A mais recente de duas datas ISO (qualquer uma pode faltar). */
export const maisRecente = (a?: string | null, b?: string | null) => (!a ? b ?? null : !b ? a : Date.parse(a) >= Date.parse(b) ? a : b)
