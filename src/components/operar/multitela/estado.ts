/**
 * Multitela (10/11/2026, ideia do Victor Dias, mockup aprovado pelo Tiago):
 * até 6 ativos na tela do Operar, cada um com o seu gráfico e a sua boleta.
 *
 * Aqui mora só a escolha da pessoa (quantos quadros, que ativo em cada um,
 * o valor e o tempo de cada um), guardada neste aparelho. O App e a grade
 * leem o mesmo estado: com 1 quadro, o Operar de sempre; com 2, 4 ou 6, a grade.
 */
import { useSyncExternalStore } from 'react'
import type { Granularity } from '../../../core/deriv/types'
import { MARCA } from '../../../marca'

export type Quadros = 1 | 2 | 4 | 6
export const OPCOES_DE_QUADROS: Quadros[] = [1, 2, 4, 6]
/** No celular, no máximo 4 ativos (em abas), 1 ou 2 visíveis. */
export const MAXIMO_NO_CELULAR = 4

export interface EstadoMultitela {
  n: Quadros
  /** O ativo de cada quadro (sempre 6 posições; vazio = escolher na hora). */
  ativos: string[]
  valores: number[]
  tempos: Granularity[]
  mesmoValor: boolean
  /** Celular: quantos ativos aparecem de uma vez. */
  porVez: 1 | 2
}

const CHAVE = `${MARCA.id}.multitela`
const PADRAO: EstadoMultitela = {
  n: 1, ativos: ['', '', '', '', '', ''], valores: [10, 10, 10, 10, 10, 10], tempos: [60, 60, 60, 60, 60, 60], mesmoValor: false, porVez: 1,
}

function ler(): EstadoMultitela {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE) || 'null') as Partial<EstadoMultitela> | null
    if (!d) return PADRAO
    const seis = <T,>(l: unknown, padrao: T[], ok: (v: unknown) => boolean) =>
      padrao.map((p, i) => (Array.isArray(l) && ok(l[i]) ? (l[i] as T) : p))
    return {
      n: OPCOES_DE_QUADROS.includes(d.n as Quadros) ? (d.n as Quadros) : 1,
      ativos: seis(d.ativos, PADRAO.ativos, (v) => typeof v === 'string'),
      valores: seis(d.valores, PADRAO.valores, (v) => typeof v === 'number' && v >= 0.35 && v <= 100000),
      tempos: seis(d.tempos, PADRAO.tempos, (v) => typeof v === 'number' && v > 0),
      mesmoValor: d.mesmoValor === true,
      porVez: d.porVez === 2 ? 2 : 1,
    }
  } catch { return PADRAO }
}

let atual = ler()
const ouvintes = new Set<() => void>()
function gravar(novo: EstadoMultitela) {
  atual = novo
  try { localStorage.setItem(CHAVE, JSON.stringify(novo)) } catch { /* sem armazenamento: vale até recarregar */ }
  ouvintes.forEach((f) => f())
}
// outra aba (ou a janela solta) mudou: acompanha
if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === CHAVE) { atual = ler(); ouvintes.forEach((f) => f()) } })

export function useMultitela(): [EstadoMultitela, (mudar: (e: EstadoMultitela) => EstadoMultitela) => void] {
  const estado = useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f) }, () => atual, () => atual)
  return [estado, (mudar) => gravar(mudar(atual))]
}

export const trocarItem = <T,>(lista: T[], i: number, v: T) => lista.map((x, j) => (j === i ? v : x))
