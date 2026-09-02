/**
 * O tema da Teeds: ESCURO por padrao — a noite e o palco das mesas de
 * operacao, como nas grandes casas. O claro segue a um clique no sol.
 *
 * A escolha vive no `localStorage` e vale para as proximas visitas.
 * Aplicar o tema faz duas coisas: marca `data-tema` no <html> (o CSS
 * troca as variaveis) e troca a paleta do grafico canvas, que nao
 * enxerga CSS.
 */

import { aplicarPaletaGrafico } from './chart/theme'

export type Tema = 'claro' | 'escuro'

const CHAVE = 'teeds.tema'

export function temaGuardado(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'claro' ? 'claro' : 'escuro'
  } catch {
    return 'escuro'
  }
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.dataset.tema = tema
  aplicarPaletaGrafico(tema === 'escuro')
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    /* sem armazenamento: o tema vale so enquanto a aba estiver aberta */
  }
}
