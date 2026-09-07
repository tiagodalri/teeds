/**
 * As marcas.
 *
 * A plataforma é uma só. O motor, as estratégias, o gráfico, os painéis, o
 * cofre, o chat e o servidor não sabem que existe marca nenhuma — e é por
 * isso que um conserto feito uma vez vale para todas.
 *
 * O que muda de marca para marca está aqui, e só aqui. Marca nova é um
 * objeto neste arquivo, não um projeto novo.
 *
 * Este arquivo não lê variável de ambiente nem toca no navegador de
 * propósito: assim ele pode ser importado pelo app, pelo servidor em Node e
 * pelo próprio `vite.config.ts`, que precisa saber o endereço do site antes
 * de o app existir.
 */

export interface Marca {
  id: string
  /** Como a marca aparece no logotipo, em caixa alta. */
  nome: string
  /** Como a marca aparece no meio de uma frase: "A Teeds opera pela...". */
  prosa: string
  /**
   * O que vai na frente do nome de cada robô.
   *
   * Os robôs se chamam "Teeds - AG7" e "Teeds Smart 03" — com e sem hífen,
   * porque foi assim que nasceram. O prefixo é só a palavra; o resto do
   * nome mora em `strategies.ts`, num lugar só.
   */
  prefixoRobo: string
  /**
   * A app registrada no painel da Deriv.
   *
   * É ESTE número que separa o dinheiro: o markup de 3% de cada operação é
   * creditado na app que originou a operação. Duas marcas, duas apps, dois
   * relatórios de comissão.
   */
  appId: string
  /** Precisa bater exatamente com uma das URLs cadastradas naquela app. */
  redirectUri: string
  /** Quem abre conta por este link fica ligado à parceria desta marca. */
  afiliado: string
  /** O caminho em que o site é servido. Vira o `base` do build. */
  base: string
  /** Arquivo do emblema, dentro de `public/`. */
  emblema: string
  /**
   * Quais robôs esta plataforma oferece, e em que ordem.
   *
   * O catálogo inteiro continua em `branding.ts` — é ele que permite ler o
   * histórico de um robô que saiu de oferta. O que a marca decide é a
   * vitrine: quais aparecem para ligar. Uma marca pode ter robô exclusivo,
   * e pode esconder um que a outra mostra.
   */
  robos: string[]
  /**
   * A cor da marca, uma por tema.
   *
   * Duas porque uma só não serve: um azul-marinho profundo desaparece sobre
   * o fundo quase preto do tema escuro, e um tom claro se perde no branco.
   * É a mesma identidade em luminosidades diferentes — como a marca de um
   * banco entre o papel e o letreiro noturno.
   */
  cor: { claro: string; escuro: string }
}

export const MARCAS: Record<string, Marca> = {
  teeds: {
    id: 'teeds',
    nome: 'TEEDS',
    prosa: 'Teeds',
    prefixoRobo: 'Teeds',
    appId: '34gMUQCaYNX1M93Q7aq5R',
    redirectUri: 'https://tiagodalri.github.io/teeds/',
    afiliado: 'https://t.deriv.link?t=W7L5WVEEQGHY',
    robos: ['superior5', 'ag2', 'smart03', 'goreme', 'firstblock', 'secondblock'],
    base: '/teeds/',
    emblema: 'teeds-marca.png',
    cor: { claro: '#4c6fff', escuro: '#d0aa52' },
  },

  omni: {
    id: 'omni',
    nome: 'OMNI',
    prosa: 'OMNI',
    prefixoRobo: 'OMNI',
    appId: '34kKoxRsAd3xEcyFNw7v5',
    redirectUri: 'https://omnifinanc.com/',
    afiliado: 'https://t.deriv.link?t=2HFMXE246P62',
    robos: ['superior5', 'ag2', 'smart03', 'goreme', 'firstblock', 'secondblock'],
    base: '/',
    emblema: 'omni-marca.png',
    cor: { claro: '#0E2A4E', escuro: '#6C93C6' },
  },
}

/** A marca padrão, quando ninguém disser qual. */
export const MARCA_PADRAO = 'teeds'

export function marcaPorId(id: string | undefined): Marca {
  return MARCAS[id ?? ''] ?? MARCAS[MARCA_PADRAO]
}
