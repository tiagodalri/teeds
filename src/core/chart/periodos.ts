/**
 * O período de cada média móvel do gráfico, escolhido por quem opera.
 *
 * Como no Profit: clica na linha da média (ou na legenda dela) e digita o
 * período — 9, 20, 50, 200. Vale para todos os ativos e fica guardado no
 * navegador, por marca. O botão do painel de indicadores ("Média 20") e o
 * gráfico leem daqui, então os dois mudam juntos.
 */
import { useSyncExternalStore } from 'react'
import { MARCA } from '../../marca'

export type MediaId = 'sma' | 'ema'
export type Periodos = Record<MediaId, number>

export const PERIODO_PADRAO: Periodos = { sma: 20, ema: 50 }
export const PERIODO_MINIMO = 2
export const PERIODO_MAXIMO = 500
/** Atalhos do editor: os períodos que todo mundo usa. */
export const PERIODOS_COMUNS = [9, 20, 50, 100, 200]

const CHAVE = `${MARCA.id}.grafico.periodos`
const ouvintes = new Set<() => void>()

function ler(): Periodos {
  try {
    const bruto = JSON.parse(localStorage.getItem(CHAVE) || '{}') as Partial<Periodos>
    return {
      sma: valido(bruto.sma) ? bruto.sma! : PERIODO_PADRAO.sma,
      ema: valido(bruto.ema) ? bruto.ema! : PERIODO_PADRAO.ema,
    }
  } catch {
    return { ...PERIODO_PADRAO }
  }
}

let atual: Periodos = typeof window === 'undefined' ? { ...PERIODO_PADRAO } : ler()

export function valido(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= PERIODO_MINIMO && n <= PERIODO_MAXIMO
}

export function definirPeriodo(id: MediaId, periodo: number): void {
  if (!valido(periodo) || atual[id] === periodo) return
  atual = { ...atual, [id]: periodo }
  try { localStorage.setItem(CHAVE, JSON.stringify(atual)) } catch { /* vale só nesta aba */ }
  ouvintes.forEach((f) => f())
}

export function usePeriodos(): Periodos {
  return useSyncExternalStore(
    (f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
    () => atual,
    () => atual,
  )
}

/** Nome curto da média, como na legenda do gráfico: "MMS 20", "MME 50". */
export function nomeDaMedia(id: MediaId, periodo: number): string {
  return `${id === 'sma' ? 'MMS' : 'MME'} ${periodo}`
}
