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
   * A assinatura completa como IMAGEM oficial, quando o manual da marca
   * proíbe recompor o nome com fonte (GlobalFly, 16/10/2026). `escura` é a
   * versão para fundo escuro (reversa); `clara`, para fundo claro. Sem isto,
   * a marca segue com emblema + nome em texto, como a Teeds e a OMNI.
   */
  assinatura?: { escura: string; clara: string }
  /** Monograma para fundo claro, quando o emblema é a versão reversa. */
  monogramaClaro?: string
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
   * Desenho próprio desta marca para robôs específicos, por id: cor, fundo
   * do ícone e emblema. Sem isto vale o desenho do catálogo. Serve a uma
   * marca com manual que restringe a paleta (a GlobalFly não usa verde nem
   * coral fora de ganho e perda, nem setas literais).
   */
  desenhoDosRobos?: Record<string, { cor?: string; corSuave?: string; emblema?: string }>
  /**
   * App instalável com cara de nativo: atalhos no ícone, botão "Instalar o
   * app", voltar do Android entre as telas, aviso de sem conexão e
   * acabamento de tela cheia. Ligado só onde a marca pediu (GlobalFly).
   */
  appNativo?: boolean
  /**
   * Transmissão ao vivo dentro da plataforma (menu "Ao vivo", estúdio do
   * admin, player flutuante e chat). Ligado só onde a marca pediu.
   */
  aoVivo?: boolean
  /**
   * Nome dos ativos sem a palavra "Volatility" ("75 Index", "10 (1s) Index").
   * Pedido do Tiago em 19/10/2026 para a GlobalFly; as outras marcas mostram
   * o nome da Deriv como sempre.
   */
  ativosSemVolatility?: boolean
  /** Ícone redondo em cada ativo (moedas, metais, índices), como nas corretoras. */
  iconesDeAtivos?: boolean
  /** Manual com todos os índices de volatilidade (10, 25, 50, 75, 100), além dos de 1 s. */
  indicesCompletos?: boolean
  /**
   * Gráfico profissional no Manual (KLineChart: 30+ indicadores e ferramentas
   * de desenho). 'admin' = só administradores veem, para testar (19/10/2026);
   * 'todos' = libera para os clientes.
   */
  graficoPro?: 'admin' | 'todos'
  /**
   * Nome e ícone de itens do menu lateral, por marca (19/10/2026: na
   * GlobalFly, "Robôs" virou "I.A." com o símbolo de brilhos, e o Assistente
   * ganhou um balão de conversa para não confundir os dois).
   * Ícone = caminho SVG em 24x24, traço.
   */
  menu?: { nomes?: Record<string, string>; icones?: Record<string, string> }
  /**
   * Vitrine dos robôs na tela Robôs (19/10/2026, GlobalFly): no lugar do
   * quadro vazio, um cartão por robô com a foto (public/robos-<marca>/<id>.webp)
   * e a aeronave que inspirou o nome. Sem isto, a tela fica como sempre.
   * Fotos do Wikimedia Commons (19/10/2026): as da Força Aérea dos EUA são de
   * domínio público; as CC BY-SA pedem o crédito, que aparece na vitrine.
   */
  vitrineDosRobos?: Record<string, {
    aeronave: string
    /** Uma linha: o jeito da aeronave que o robô imita. */
    gancho?: string
    /** O "por que esse nome": a aeronave e o robô lado a lado, sem números (os números vêm da regra viva). */
    historia?: string
    credito?: string
    fonte?: string
  }>
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
    /**
     * O vão, em pixels, entre o emblema e o nome na faixa do e-mail.
     *
     * É por marca porque os dois emblemas não são iguais por dentro: o touro
     * da Teeds tem 16% do PNG em ar embaixo do desenho, e esse ar entra no
     * vão sem ninguém ver — com 14px o nome parecia solto do símbolo. O da
     * OMNI fica sobre uma chapa clara, cuja borda é visível: ali o vão é o
     * que se vê, e precisa ser maior.
     */
    vaoDoLetreiro: number
    /** Imagem da assinatura completa no topo do e-mail, no lugar de emblema + nome. */
    assinatura?: string
  }
  /**
   * O canal oficial no Telegram.
   *
   * É onde a marca conversa com quem já é cliente — avisos, novidades, e as
   * campanhas que não cabem num e-mail. Fica aqui, e não solto em cada
   * arquivo, porque o link aparece na página de obrigado, no e-mail de
   * convite e onde mais precisar: um endereço trocado em um lugar só.
   */
  telegram: string
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
    // O Smart 03 saiu da vitrine em 02/10/2026 (Tiago): ele perde nos dois
    // lados — a escada mais rápida de todas e a menor comissão por dólar
    // apostado. A estratégia continua no código de propósito: uma sessão
    // antiga ainda precisa saber o nome dela, e voltar é recolocar o id aqui.
    robos: ['superior5', 'ag2', 'goreme', 'firstblock', 'secondblock', 'thepalm'],
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
      vaoDoLetreiro: 4,
    },
    telegram: 'https://t.me/+gl3NHpZRSCwyYjgx',
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
    // Desde 21/09/2026 os três últimos são versões OMNI com análise antes de
    // entrar (ver OMNI_OVER / OMNI_BULL / OMNI_BEAR em strategies.ts). Os ids
    // antigos continuam com nome da casa para o histórico das sessões antigas.
    robos: ['ag2', 'omniover', 'omnibull', 'omnibear'],
    nomesDosRobos: {
      ag2: 'OMNI Under',
      omniover: 'OMNI Over',
      omnibull: 'OMNI Bull',
      omnibear: 'OMNI Bear',
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
      vaoDoLetreiro: 10,
    },
    telegram: 'https://t.me/oarthurlessa',
  },

  /*
    GlobalFly Trade (16/10/2026): a volta da Starkbot, com o Victor Cordeiro.
    Marca SEPARADA da Teeds de propósito: nada aqui pode levar o nome Teeds
    nem o do Victor (ver a memória do projeto). Os robôs são os da Teeds com
    nomes de aviação; a escolha final dos sócios ainda pode trocar.
  */
  globalfly: {
    id: 'globalfly',
    nome: 'GLOBALFLY',
    prosa: 'GlobalFly Trade',
    prefixoRobo: 'GlobalFly',
    appId: '34H1Zr9Gp5fdho00X5BZT',
    redirectUri: 'https://globalflytrade.com/',
    // PENDENTE: a conta de afiliado da GlobalFly ainda não existe (não pode
    // ser no nome do Victor). Até lá, o cadastro vai para a Deriv sem token.
    afiliado: 'https://deriv.com/signup/',
    // 19/10/2026: os cinco robôs da lista final do Tiago, nesta ordem.
    // Raptor é o mesmo robô do Göreme da Teeds (pedido dele); os outros
    // ficaram com AG7 (superior5), The Palm, AG2 e First Block. Gulf e
    // Phenom continuam nas estratégias de antes (eram Gulfstream e Phenom),
    // e o H160 herda o First Block (era Cirrus): o histórico não se perde.
    // O id é o que amarra motor, histórico e aula.
    robos: ['goreme', 'superior5', 'thepalm', 'ag2', 'firstblock'],
    nomesDosRobos: {
      goreme: 'GlobalFly Raptor',
      superior5: 'GlobalFly Gulf',
      thepalm: 'GlobalFly Falcon',
      ag2: 'GlobalFly Phenom',
      firstblock: 'GlobalFly H160',
    },
    // Manual, pág. 24: "Azul organiza superfícies… Verde e coral são
    // exclusivamente funcionais." Os robôs ficam todos no aço da casa
    // (texto branco passa por cima, e aparece sobre o Azul GF); quem os
    // distingue é o emblema. Sem setas literais (pág. 18 e 20).
    appNativo: true,
    aoVivo: true,
    ativosSemVolatility: true,
    iconesDeAtivos: true,
    indicesCompletos: true,
    graficoPro: 'admin',
    menu: {
      nomes: { robos: 'I.A.' },
      icones: {
        // brilhos: uma estrela grande e duas pequenas (o símbolo usual de IA)
        robos: 'M10 4l1.8 4.9L16.7 10.7l-4.9 1.8L10 17.4l-1.8-4.9L3.3 10.7l4.9-1.8z M18 3v4 M16 5h4 M18.5 15.5v4 M16.5 17.5h4',
        // assistente: balão de conversa com reticências
        assistente: 'M4 5h16v11H10l-4.5 3.5V16H4z M8.5 10.5h.01 M12 10.5h.01 M15.5 10.5h.01',
      },
    },
    vitrineDosRobos: {
      goreme: { aeronave: 'Caça F-22 Raptor', credito: 'Força Aérea dos EUA, domínio público', fonte: 'https://commons.wikimedia.org/wiki/File:A_U.S._Air_Force_F-22_Raptor_from_the_1st_Fighter_Wing_flies_over_Western_Virginia%2C_June_12%2C_2018.jpg',
        gancho: 'Domina o espaço aéreo e muda de direção no ar.',
        historia: 'O F-22 é o caça de superioridade aérea: ocupa quase todo o céu e, com o vetoramento de empuxo, vira o nariz para o lado oposto em pleno voo. O Raptor faz o mesmo no painel de dígitos: cobre quase todos os resultados e, quando uma operação perde, troca de lado para recuperar nos dígitos altos, voltando à rota logo em seguida.' },
      superior5: { aeronave: 'Inspirado no Gulfstream', credito: 'Bene Riobó, CC BY-SA 4.0', fonte: 'https://commons.wikimedia.org/wiki/File:EC-MLR_Gulfstream_G650_SCQ_03.jpg',
        gancho: 'Longo alcance: só decola com a janela certa.',
        historia: 'Um Gulfstream não sai do hangar com o tempo fechado: espera a janela, decola e cruza o oceano sem desviar da rota. O Gulf observa o mercado até ver uma sequência de dígitos que teriam perdido, entra mirando os dígitos altos e segue a viagem até fechar a sequência.' },
      thepalm: { aeronave: 'Caça F-16 Fighting Falcon', credito: 'Força Aérea dos EUA, domínio público', fonte: 'https://commons.wikimedia.org/wiki/File:F-16_over_South_Korea_in_front_of_the_sunset.jpg',
        gancho: 'Multimissão: troca de perfil no meio do voo.',
        historia: 'O F-16 nasceu ágil e multimissão: patrulha, intercepta e muda de perfil sem precisar pousar. O Falcon patrulha em todo tick com cobertura ampla; se toma uma perda, passa para o modo de precisão, lê os últimos dígitos antes de mirar e só volta à patrulha depois de recuperar.' },
      ag2: { aeronave: 'Embraer Phenom 300', credito: 'Thornfield Hall, CC BY-SA 4.0', fonte: 'https://commons.wikimedia.org/wiki/File:Embraer_Phenom_300.jpg',
        gancho: 'Jato leve, pouso preciso em pista curta.',
        historia: 'O Phenom 300 é o jato leve que pousa onde os grandes não cabem, com precisão e economia. O Phenom trabalha no extremo baixo do painel, nos menores dígitos: espera a sequência que teria perdido, entra e segue até fechá-la. É o espelho do Gulf, do outro lado do céu.' },
      firstblock: { aeronave: 'Helicóptero Airbus H160', credito: 'Berg2, CC BY-SA 3.0', fonte: 'https://commons.wikimedia.org/wiki/File:Airbus_Helicopters_H160.jpg',
        gancho: 'Paira, observa e pousa no ponto exato.',
        historia: 'Helicóptero não precisa de pista: paira sobre o alvo, observa e desce na vertical, no ponto exato. O H160 sobrevoa a primeira metade do painel, espera dois sinais seguidos que teriam perdido e só então pousa a entrada, voltando a pairar e observar a cada nova operação.' },
    },
    desenhoDosRobos: {
      goreme: { cor: '#5B7C9D', corSuave: '#E6ECF2' },
      superior5: { cor: '#5B7C9D', corSuave: '#E6ECF2' },
      ag2: { cor: '#5B7C9D', corSuave: '#E6ECF2', emblema: 'M8 20 h24 M12 14 h16 M12 26 h16 M17 32 h6 M17 8 h6' },
      firstblock: { cor: '#5B7C9D', corSuave: '#E6ECF2' },
      secondblock: { cor: '#5B7C9D', corSuave: '#E6ECF2' },
      thepalm: { cor: '#5B7C9D', corSuave: '#E6ECF2', emblema: 'M8 30 a12 12 0 0 1 24 0 M14 30 a6 6 0 0 1 12 0 M20 30 L28 18 M6 30 h28' },
    },
    base: '/',
    // Manual da marca (16/10/2026): monograma e assinatura OFICIAIS, em
    // imagem. O nome nunca é redigitado com fonte.
    emblema: 'globalfly-marca.png',
    monogramaClaro: 'globalfly-monograma-claro.png',
    assinatura: { escura: 'globalfly-assinatura.png', clara: 'globalfly-assinatura-clara.png' },
    heroAulas: { principal: 'aulas-globalfly/boas-vindas.webp', reserva: 'aulas-globalfly/boas-vindas.jpg', celular: 'aulas-globalfly/boas-vindas-mobile.webp', posicao: 'center 40%' },
    // Azul GF organiza, ouro indica seleção (manual, pág. 24). No claro a cor
    // de ação é o azul (ouro sobre marfim não passa no contraste: 2,7:1).
    cor: { claro: '#051528', escuro: '#B78D39' },
    email: {
      faixa: '#051528',
      letreiro: '#F3F0E9',
      botao: '#B78D39',
      tintaDoBotao: '#051528',
      fonteDoLetreiro: "Arimo,'Liberation Sans',Arial,Helvetica,sans-serif",
      chapaDoEmblema: null,
      fundo: '#F3F0E9',
      rodape:
        'A GlobalFly é uma plataforma de operações que funciona com a sua própria conta na Deriv. ' +
        'Negociar envolve risco de perda.',
      remetente: 'GlobalFly <nao-responda@globalflytrade.com>',
      vaoDoLetreiro: 8,
      assinatura: 'globalfly-assinatura.png',
    },
    // PENDENTE: link do canal do Victor (Telegram da antiga Stark).
    telegram: '',
  },
}

/** A marca padrão, quando ninguém disser qual. */
export const MARCA_PADRAO = 'teeds'

export function marcaPorId(id: string | undefined): Marca {
  return MARCAS[id ?? ''] ?? MARCAS[MARCA_PADRAO]
}
