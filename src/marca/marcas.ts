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
   * A imagem do herói da tela de Aulas, dentro de `public/`.
   * Era um arquivo só, o touro dourado — e a OMNI abria as aulas com a cara
   * da Teeds. Cada marca aponta a sua: principal (webp), reserva e a do celular.
   */
  heroAulas: { principal: string; reserva: string; celular: string; /** recorte (background-position); padrao 'center right' */ posicao?: string }
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
   * Nomes próprios desta marca para robôs específicos, por id.
   *
   * O padrão é o molde do catálogo ("{marca} - AG7" vira "OMNI - AG7").
   * Quando a marca quer um nome de verdade — "OMNI Over" em vez de
   * "OMNI - AG7" — ele entra aqui. Só o nome muda: o id, o motor, o
   * histórico e os produtos comprados continuam amarrados ao mesmo robô.
   */
  nomesDosRobos?: Record<string, string>
  /**
   * A cor da marca, uma por tema.
   *
   * Duas porque uma só não serve: um azul-marinho profundo desaparece sobre
   * o fundo quase preto do tema escuro, e um tom claro se perde no branco.
   * É a mesma identidade em luminosidades diferentes — como a marca de um
   * banco entre o papel e o letreiro noturno.
   */
  cor: { claro: string; escuro: string }
  /**
   * Como a marca se apresenta num e-mail.
   *
   * E-mail não é site: não há tema claro e escuro, não há CSS externo e
   * metade dos programas de e-mail recorta o que não entende. Então a
   * identidade tem que caber em quatro cores e uma fonte — e ser decidida
   * aqui, uma vez, em vez de espalhada por cinco arquivos que envelhecem
   * em ritmos diferentes.
   */
  email: {
    /** A faixa do topo, onde fica o emblema. */
    faixa: string
    /** A cor do nome escrito sobre a faixa. */
    letreiro: string
    /** O botão de ação — a única coisa que a pessoa precisa clicar. */
    botao: string
    /** O texto dentro do botão. Ouro pede tinta escura; marinho pede branca. */
    tintaDoBotao: string
    /** A família do letreiro. A Teeds assina em serifa; a OMNI, em bastão. */
    fonteDoLetreiro: string
    /**
     * A chapa atrás do emblema, ou `null` para ele ficar solto na faixa.
     *
     * O emblema da OMNI é azul-marinho, a mesma cor da faixa — sem uma chapa
     * clara por trás ele simplesmente some. O touro da Teeds é dourado sobre
     * quase-preto e não precisa de nada: uma chapa ali só atrapalharia.
     */
    chapaDoEmblema: string | null
    /** O fundo da página, atrás do cartão branco. */
    fundo: string
    /** Uma linha só, no rodapé, dizendo o que é a plataforma. */
    rodape: string
    /**
     * De quem o e-mail sai — nome e endereço, no formato `Nome <caixa@dominio>`.
     *
     * O domínio precisa estar verificado no serviço de envio. Não é
     * burocracia: é o que impede qualquer um de mandar e-mail se passando
     * pela marca. Enquanto o domínio de uma marca não existir, o valor fica
     * `null` — e o servidor se recusa a mandar por ela, em vez de mandar
     * com o remetente errado. Errar aqui é pior que não mandar: um e-mail
     * com remetente que não bate com a marca vai direto para o lixo
     * eletrônico e queima a reputação do domínio junto.
     */
    remetente: string | null
  }
}

export const MARCAS: Record<string, Marca> = {
  teeds: {
    id: 'teeds',
    nome: 'TEEDS',
    prosa: 'Teeds',
    prefixoRobo: 'Teeds',
    appId: '34gMUQCaYNX1M93Q7aq5R',
    redirectUri: 'https://teedscompany.com/',
    afiliado: 'https://t.deriv.link?t=W7L5WVEEQGHY',
    robos: ['superior5', 'ag2', 'smart03', 'goreme', 'firstblock', 'secondblock', 'thepalm'],
    base: '/',
    emblema: 'teeds-marca.png',
    heroAulas: { principal: 'aulas-hero.webp', reserva: 'aulas-hero.png', celular: 'aulas-hero-mobile.webp' },
    cor: { claro: '#4c6fff', escuro: '#d0aa52' },
    email: {
      faixa: '#12151c',
      letreiro: '#d9b465',
      botao: '#c9a24a',
      tintaDoBotao: '#1a1408',
      fonteDoLetreiro: "Georgia,'Times New Roman',serif",
      chapaDoEmblema: null,
      fundo: '#f6f4ef',
      rodape:
        'A Teeds é uma plataforma de operações que funciona com a sua própria conta na Deriv. ' +
        'Negociar envolve risco de perda.',
      // Mesmo domínio do site. O e-mail sai de onde a plataforma mora.
      remetente: 'Teeds <nao-responda@teedscompany.com>',
    },
  },

  omni: {
    id: 'omni',
    nome: 'OMNI',
    prosa: 'OMNI',
    prefixoRobo: 'OMNI',
    appId: '34kKoxRsAd3xEcyFNw7v5',
    redirectUri: 'https://omnifinanc.com/',
    afiliado: 'https://t.deriv.link?t=2HFMXE246P62',
    // Quatro robôs, com nomes da casa. Under/Over pelos dígitos que ganham;
    // Bull/Bear pelas metades da dezena. O motor é o mesmo da Teeds.
    robos: ['ag2', 'superior5', 'firstblock', 'secondblock'],
    nomesDosRobos: {
      ag2: 'OMNI Under',
      superior5: 'OMNI Over',
      firstblock: 'OMNI Bull',
      secondblock: 'OMNI Bear',
    },
    base: '/',
    emblema: 'omni-marca.png',
    heroAulas: { principal: 'aulas-especialista/boas-vindas.webp', reserva: 'aulas-especialista/boas-vindas.jpg', celular: 'aulas-especialista/boas-vindas-mobile.webp', posicao: 'right 18%' },
    cor: { claro: '#0E2A4E', escuro: '#6C93C6' },
    email: {
      faixa: '#0E2A4E',
      letreiro: '#dce6f2',
      botao: '#0E2A4E',
      tintaDoBotao: '#ffffff',
      fonteDoLetreiro: "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif",
      chapaDoEmblema: '#ffffff',
      fundo: '#f2f5f9',
      rodape:
        'A OMNI é uma plataforma de operações que funciona com a sua própria conta na Deriv. ' +
        'Negociar envolve risco de perda.',
      remetente: 'OMNI <nao-responda@omnifinanc.com>',
    },
  },
}

/** A marca padrão, quando ninguém disser qual. */
export const MARCA_PADRAO = 'teeds'

export function marcaPorId(id: string | undefined): Marca {
  return MARCAS[id ?? ''] ?? MARCAS[MARCA_PADRAO]
}
