/**
 * A contagem interna do markup (10/11/2026, Tiago: "valores de comissão divergentes nos painéis. Tem que
 * estar sempre tudo atualizado certinho a nossa contagem interna do markup... tempo real").
 *
 * Uma régua só para todo painel que mostra o markup da casa: cada contrato que a plataforma registra
 * (I.A. e manual), só conta real, 3% do pagamento, dia de Brasília, equipe fora, parceiro do topo
 * respeitado. O banco soma (teeds_markup_interno, índice só das contas reais) e a tela relê a cada 15 s
 * enquanto está à vista; escondida, não pergunta, e relê na hora ao voltar.
 */
import { useEffect, useRef, useState } from 'react'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

export interface MarkupInterno {
  de: string
  ate: string
  markup: number
  operacoes: number
  entradas: number
  iaMarkup: number
  iaOperacoes: number
  manualMarkup: number
  manualOperacoes: number
  /** O último contrato que entrou na conta (null = nenhum no período). */
  ultimaEm: string | null
  porDia: Array<{ dia: string; markup: number; operacoes: number }>
  lidoEm: number
}

/** Intervalo da releitura com a tela à vista. */
export const RELEITURA_MARKUP_MS = 15_000

export async function lerMarkupInterno(
  sessao: SessaoTeeds, f: { marca: string; de: string; ate: string; parceiro?: string | null },
): Promise<MarkupInterno> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_markup_interno`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: f.marca, p_de: f.de, p_ate: f.ate, p_parceiro: f.parceiro || null }),
  })
  if (!r.ok) throw new Error('Não foi possível ler o markup agora.')
  const d = await r.json()
  const n = (v: unknown) => Number(v ?? 0) || 0
  return {
    de: String(d.de), ate: String(d.ate),
    markup: n(d.markup), operacoes: n(d.operacoes), entradas: n(d.entradas),
    iaMarkup: n(d.ia_markup), iaOperacoes: n(d.ia_operacoes),
    manualMarkup: n(d.manual_markup), manualOperacoes: n(d.manual_operacoes),
    ultimaEm: d.ultima_em ?? null,
    porDia: (d.por_dia ?? []).map((x: any) => ({ dia: String(x.dia), markup: n(x.markup), operacoes: n(x.operacoes) })),
    lidoEm: Date.now(),
  }
}

/** O markup do período, relido a cada 15 s com a tela à vista. */
export function useMarkupInterno(
  sessao: SessaoTeeds | null, marca: string, de: string, ate: string, parceiro: string,
): { dados: MarkupInterno | null; erro: string | null } {
  const [dados, setDados] = useState<MarkupInterno | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const temSessao = !!sessao

  useEffect(() => {
    if (!temSessao) { setDados(null); return }
    let vivo = true
    let t = 0
    let lendo = false
    setDados(null)
    const ler = () => {
      window.clearTimeout(t)
      const s = sessaoRef.current
      if (!s || lendo) return
      if (document.visibilityState === 'hidden') return
      lendo = true
      void lerMarkupInterno(s, { marca, de, ate, parceiro })
        .then((d) => { if (vivo) { setDados(d); setErro(null) } })
        .catch((e) => { if (vivo) setErro((e as Error).message) })
        .finally(() => { lendo = false; if (vivo) t = window.setTimeout(ler, RELEITURA_MARKUP_MS) })
    }
    const aoVoltar = () => { if (document.visibilityState === 'visible') ler() }
    document.addEventListener('visibilitychange', aoVoltar)
    ler()
    return () => { vivo = false; window.clearTimeout(t); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [temSessao, marca, de, ate, parceiro])

  return { dados, erro }
}

/** "há 12 s", "há 3 min", "agora". */
export function haQuantoTempo(ms: number, agora = Date.now()): string {
  const s = Math.max(0, Math.round((agora - ms) / 1000))
  if (s < 10) return 'agora'
  if (s < 60) return `há ${s} s`
  const m = Math.round(s / 60)
  if (m < 60) return `há ${m} min`
  const h = Math.round(m / 60)
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`
}
