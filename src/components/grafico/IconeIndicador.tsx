/**
 * Miniaturas dos indicadores (19/10/2026).
 *
 * Cada indicador ganha um desenho do que ele mostra no gráfico, como nas
 * corretoras grandes: quem vai sobre as velas aparece com velas; quem tem
 * painel próprio aparece com as faixas de referência (30/70, zero...).
 * Cores só pelos tokens do tema; o desenho é o mesmo nos dois temas.
 */
import type { Categoria } from '../../core/grafico/indicadores'

/** a: linha principal · b: segunda linha · c: terceira (queda) · g: referência · f: faixa · up/dn: velas e barras · p: pontos */
type Classe = 'a' | 'b' | 'c' | 'g' | 'f' | 'up' | 'dn' | 'p'
type Traco = [Classe, string]

const vela = (x: number, topo: number, base: number, sobe: boolean): Traco =>
  [sobe ? 'up' : 'dn', `M${x} ${topo - 2}v${base - topo + 4}M${x - 1.6} ${topo}h3.2v${base - topo}h-3.2z`]
const barra = (x: number, de: number, ate: number): Traco =>
  [ate < de ? 'up' : 'dn', `M${x - 1.2} ${Math.min(de, ate)}h2.4v${Math.abs(ate - de)}h-2.4z`]

const VELAS: Traco[] = [vela(5, 14, 19, false), vela(10, 11, 16, true), vela(15, 12, 16, false), vela(20, 8, 13, true), vela(25, 5, 10, true)]
const ZERO: Traco = ['g', 'M1 12h28']
const FAIXAS: Traco[] = [['g', 'M1 6h28'], ['g', 'M1 18h28']]

const DESENHOS: Record<string, Traco[]> = {
  /* ---------------- sobre as velas */
  MA: [...VELAS, ['a', 'M1 18C8 16 12 15 16 13S24 9 29 6']],
  EMA: [...VELAS, ['a', 'M1 17C6 13 10 12 14 13S21 9 29 4']],
  GF_WMA: [...VELAS, ['a', 'M1 18C7 15 11 13 15 13S22 8 29 5'], ['b', 'M1 20C9 18 15 16 29 9']],
  GF_HMA: [...VELAS, ['a', 'M1 19C4 12 8 11 12 14S17 13 20 9 26 4 29 3']],
  SMA: [...VELAS, ['a', 'M1 17C10 16 18 13 29 9']],
  BBI: [...VELAS, ['a', 'M1 16C8 15 13 14 17 12S24 8 29 6'], ['b', 'M1 19C10 18 18 15 29 10']],
  // Bollinger aperta e abre com a volatilidade (é o que a separa do Keltner, de largura constante)
  BOLL: [['f', 'M1 8C7 8 11 12 15 11S23 3 29 1V16C23 16 19 15 15 15S7 21 1 21Z'], ['b', 'M1 8C7 8 11 12 15 11S23 3 29 1'], ['b', 'M1 21C7 21 11 15 15 15S23 16 29 16'], ...VELAS, ['a', 'M1 15C7 14 11 13 15 13S23 10 29 8']],
  GF_DONCHIAN: [['f', 'M1 9H9V6H17V3H29V13H21V16H12V21H1Z'], ['b', 'M1 9H9V6H17V3H29'], ['b', 'M1 21H12V16H21V13H29'], ...VELAS],
  GF_KELTNER: [['f', 'M1 11C10 9 18 6 29 3V11C18 14 10 17 1 19Z'], ['b', 'M1 11C10 9 18 6 29 3'], ['b', 'M1 19C10 17 18 14 29 11'], ...VELAS],
  GF_ICHIMOKU: [['f', 'M1 20C8 19 13 16 18 15S25 12 29 12V17C24 17 20 19 15 19S6 21 1 22Z'], ['b', 'M1 20C8 19 13 16 18 15S25 12 29 12'], ['c', 'M1 22C6 21 10 19 15 19S24 17 29 17'], ...VELAS, ['a', 'M1 13C9 12 15 10 29 5']],
  SAR: [...VELAS, ['p', 'M3 22h.01M7 20h.01M11 18.5h.01M18 18h.01M22 15h.01M27 12.5h.01M13 7h.01M16 8h.01']],

  /* ---------------- painel próprio: osciladores entre faixas */
  RSI: [...FAIXAS, ['a', 'M1 15C5 3 9 3 12 11S19 22 23 14 27 5 29 6']],
  GF_ESTOCASTICO: [...FAIXAS, ['a', 'M1 17L6 5 10 9 15 19 20 8 24 4 29 13'], ['b', 'M1 15C6 9 9 8 13 15S20 13 23 8 27 9 29 11']],
  GF_RSI_ESTOCASTICO: [...FAIXAS, ['a', 'M1 19L5 4 9 16 13 3 17 20 21 6 25 17 29 9']],
  WR: [['g', 'M1 4h28'], ['g', 'M1 20h28'], ['a', 'M1 7L6 18 10 9 15 21 20 6 24 15 29 11']],
  CCI: [['g', 'M1 8h28'], ['g', 'M1 16h28'], ['a', 'M1 12C4 1 8 2 11 12S18 24 21 15 26 4 29 7']],
  PSY: [...FAIXAS, ['a', 'M1 14H6V9H11V15H17V7H22V12H29']],
  KDJ: [...FAIXAS, ['a', 'M1 16C6 6 10 6 14 13S21 18 29 6'], ['b', 'M1 14C6 9 10 9 14 12S21 15 29 9'], ['c', 'M1 19C6 3 10 2 14 15S21 22 29 3']],

  /* ---------------- painel próprio: em volta do zero */
  MACD: [ZERO, barra(4, 12, 15), barra(8, 12, 17), barra(12, 12, 14), barra(16, 12, 9), barra(20, 12, 6), barra(24, 12, 8), ['a', 'M1 16C7 18 11 15 15 10S23 4 29 6'], ['b', 'M1 15C8 17 13 14 17 11S24 7 29 8']],
  AO: [ZERO, barra(3, 12, 16), barra(7, 12, 18), barra(11, 12, 15), barra(15, 12, 9), barra(19, 12, 5), barra(23, 12, 7), barra(27, 12, 10)],
  GF_DPO: [ZERO, ['a', 'M1 12C4 3 8 3 11 12S18 21 21 12 26 3 29 6']],
  ROC: [ZERO, ['a', 'M1 15L5 10 8 17 12 13 16 7 19 14 23 9 26 5 29 11']],
  MTM: [ZERO, ['a', 'M1 19L6 15 10 17 15 10 20 11 25 5 29 4']],
  BIAS: [ZERO, ['f', 'M1 12C5 5 9 5 12 12S19 19 22 12 27 6 29 7V12H1Z'], ['a', 'M1 12C5 5 9 5 12 12S19 19 22 12 27 6 29 7']],
  GF_SMI: [ZERO, ['a', 'M1 18C6 14 10 5 15 6S22 16 29 14'], ['b', 'M1 16C7 15 11 9 16 9S23 13 29 13']],
  TRIX: [ZERO, ['a', 'M1 16C8 16 10 7 16 7S24 15 29 14'], ['b', 'M1 15C9 15 12 9 17 9S25 13 29 13']],
  DMA: [ZERO, ['a', 'M1 15C6 12 10 8 15 9S23 14 29 7'], ['b', 'M1 17C7 15 11 11 16 11S24 13 29 10']],

  /* ---------------- força e direção */
  DMI: [['a', 'M1 16C6 12 10 6 15 8S23 10 29 4'], ['c', 'M1 8C6 11 10 17 15 15S23 14 29 19'], ['b', 'M1 20C8 18 14 13 29 10']],
  GF_AROON: [['a', 'M1 18L7 5H15L21 13H29'], ['c', 'M1 6L7 19H15L21 9H29']],
  GF_ATR: [['f', 'M1 21L5 16 9 18 13 10 17 13 21 6 25 11 29 8V23H1Z'], ['a', 'M1 21L5 16 9 18 13 10 17 13 21 6 25 11 29 8']],
  BRAR: [['a', 'M1 15C6 9 10 7 15 11S23 8 29 4'], ['c', 'M1 18C6 15 10 14 15 16S23 13 29 11']],
  CR: [['g', 'M1 7h28'], ['g', 'M1 12h28'], ['g', 'M1 17h28'], ['a', 'M1 19L6 13 10 16 15 6 20 10 24 4 29 9']],
}

export function IconeIndicador({ id }: { id: string }) {
  const tracos = DESENHOS[id] ?? DESENHOS.MA
  return (
    <span className="gp-icone-ind" aria-hidden="true">
      <svg viewBox="0 0 30 24">{tracos.map(([c, d], i) => <path key={i} className={c} d={d} />)}</svg>
    </span>
  )
}

const CATEGORIA: Record<Categoria | 'ativos', string> = {
  ativos: 'M4 19h16M5 15l4-4 3 3 6-7M14 7h4v4',
  momentum: 'M4 17a8 8 0 1 1 16 0M12 17l4.5-5M7 17h.01M17 17h.01',
  tendencia: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  volatilidade: 'M3 6c6 3 12 3 18 0M3 18c6-3 12-3 18 0M3 12l3-3 3 5 3-4 3 4 3-3 3 1',
  medias: 'M7 6v12M5 9h4v6H5zM15 5v10M13 7h4v5h-4zM3 18c5-2 9-6 18-11',
  outros: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
}

export function IconeCategoria({ id }: { id: Categoria | 'ativos' }) {
  return <svg className="gp-icone-cat" viewBox="0 0 24 24" aria-hidden="true"><path d={CATEGORIA[id]} /></svg>
}
