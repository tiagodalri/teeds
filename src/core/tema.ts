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
import { MARCA } from '../marca'

export type Tema = 'claro' | 'escuro'

/*
  A chave carrega a marca.

  Duas marcas servidas do mesmo endereço (tiagodalri.github.io/teeds/ e
  /omni/) são, para o navegador, o mesmo site: dividiriam a mesma gaveta.
  Sem o carimbo, escolher o tema claro numa mudaria a outra — e, pior, a
  autorização da Deriv de uma valeria na outra, com a app errada.
*/
const CHAVE = `${MARCA.id}.tema`

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
  // A cor da marca muda com o tema: um azul-marinho profundo some no fundo
  // quase preto, e um tom claro se perde no branco. Mesma identidade, duas
  // luminosidades.
  const cor = tema === 'escuro' ? MARCA.cor.escuro : MARCA.cor.claro
  document.documentElement.style.setProperty('--primary', cor)
  document.documentElement.style.setProperty('--primary-soft', `${cor}22`)
  try {
    localStorage.setItem(CHAVE, tema)
  } catch {
    /* sem armazenamento: o tema vale so enquanto a aba estiver aberta */
  }
}
