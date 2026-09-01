/**
 * Paleta do grafico - clara por padrao, sobria, pensada para leitura longa.
 *
 * `T` e um objeto VIVO: `aplicarPaletaGrafico` troca os valores em bloco
 * quando o tema muda, e o gráfico (que redesenha a cada quadro) pega as
 * cores novas no quadro seguinte. Por isso nada aqui pode ser
 * desestruturado no topo de um modulo.
 */
const CLARA = {
  bg: '#FFFFFF',
  surface: '#F7F9FC',
  surfaceAlt: '#FDFEFF',
  border: '#E4E9F2',
  grid: '#EEF2F7',
  text: '#1A2233',
  muted: '#7A8699',
  primary: '#4C6FFF',
  primarySoft: '#EDF1FF',
  up: '#12A150',
  upSoft: 'rgba(18, 161, 80, 0.12)',
  down: '#E5484D',
  downSoft: 'rgba(229, 72, 77, 0.12)',
  crosshair: '#98A2B3',
}

const ESCURA: PaletaGrafico = {
  bg: '#0F1420',
  surface: '#151C2C',
  surfaceAlt: '#121A29',
  border: '#232D45',
  grid: '#1B2436',
  text: '#E6EAF3',
  muted: '#8B96AD',
  primary: '#6C89FF',
  primarySoft: '#1C2542',
  up: '#1FC06A',
  upSoft: 'rgba(31, 192, 106, 0.14)',
  down: '#F0555A',
  downSoft: 'rgba(240, 85, 90, 0.16)',
  crosshair: '#5C6A85',
}

export type PaletaGrafico = typeof CLARA

export const T: PaletaGrafico = { ...CLARA }

export function aplicarPaletaGrafico(escuro: boolean): void {
  Object.assign(T, escuro ? ESCURA : CLARA)
}

export const CHART = {
  padRight: 68,
  padBottom: 26,
  padTop: 12,
  padLeft: 8,
  minCandles: 20,
  maxCandles: 400,
  defaultCandles: 90,
} as const
