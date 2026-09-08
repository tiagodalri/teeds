import type { Estrategia } from './engine'

/** Recuperação oficial, interna e não editável de cada modelo. */
export const RECUPERACAO_POR_ROBO: Record<string, { galeApos: number; margem: number }> = {
  superior5: { galeApos: 3, margem: 0.05 },
  ag2: { galeApos: 3, margem: 0.05 },
  smart03: { galeApos: 3, margem: 0.05 },
  // Goreme paga 6%: recuperar 3 perdas exigiria 52x a base, e a segunda
  // recuperacao 930x. Ligando na primeira perda a escada comeca em 18x —
  // ainda alta, porque e o payout que dita o tamanho, mas o buraco a cobrir
  // e um terco. Perda rara, recuperacao cedo.
  goreme: { galeApos: 1, margem: 0.05 },
  firstblock: { galeApos: 3, margem: 0.05 },
  secondblock: { galeApos: 3, margem: 0.05 },
  thepalm: { galeApos: 1, margem: 0.95 },
  superior5fixo: { galeApos: 3, margem: 0 },
}

export function recuperacaoDoRobo(id: string) {
  return RECUPERACAO_POR_ROBO[id] ?? { galeApos: 3, margem: 0.05 }
}

/**
 * Estrategias que rodam no motor da Teeds.
 *
 * O AG7 nasceu de um arquivo XML do Deriv Bot (SUPERIOR 5 VIP), traduzido
 * bloco a bloco. A regra mudou depois, a pedido: o filtro de entrada saiu
 * (entra em toda operacao) e, em 01/09, a barreira subiu para 6 — o AG7
 * ganha so nos digitos 7, 8 e 9. O AG2 e o espelho dele nos digitos
 * baixos: DIGITUNDER 3, ganha so no 0, 1 e 2.
 */

export const SUPERIOR_5: Estrategia = {
  id: 'superior5',
  nome: '{marca} - AG7',
  origem: 'baseado no Deriv Bot SUPERIOR 5 VIP',
  descricao:
    'Ganha quando o último dígito é 7, 8 ou 9. Entra em todas as operações; ' +
    'mantém o valor enquanto as perdas seguidas não chegam ao gatilho e a ' +
    'partir daí liga o martingale para recuperar.',
  contractType: 'DIGITOVER',
  barreira: 6,
  ticks: 1,

  // Sem filtro: emenda uma operacao na outra.
  entradaContinua: true,
  entrar: () => true,

  aguardando: ({ perdasSeguidas, config }) =>
    perdasSeguidas >= config.galeApos
      ? 'recuperando — martingale ligado'
      : 'entrando na próxima',

  /**
   * A tela mostra a escada ate o martingale: um degrau por perda seguida
   * permitida no valor base. Quando todos acendem, a recuperacao comeca.
   */
  progresso: ({ perdasSeguidas, config }) => {
    const gatilho = Math.max(1, Math.round(config.galeApos))
    const ligado = perdasSeguidas >= gatilho
    return {
      rotulo: ligado
        ? 'Martingale ligado — recuperando'
        : `Valor base até ${gatilho} perdas seguidas`,
      itens: Array.from({ length: gatilho }, (_, i) => ({
        valor: i < perdasSeguidas ? '✕' : '·',
        ok: i >= perdasSeguidas,
      })),
    }
  },

  proximoValor: ({
    ganhou, valorAoVencer, perdasSeguidas, prejuizoDaSequencia,
    retornoLiquidoPorUnidade, config,
  }) => {
    // ganhou: a sequencia fecha e tudo volta ao valor base
    if (ganhou) return valorAoVencer
    // ainda dentro das entradas de valor fixo
    if (perdasSeguidas < config.galeApos) return valorAoVencer
    // Recuperação calibrada pelo payout realmente comprado. O desconto de 3%
    // absorve pequenas oscilações do retorno entre um contrato e o seguinte.
    const retornoSeguro = Math.max(0.01, retornoLiquidoPorUnidade * 0.97)
    const lucroMinimo = Math.max(0.01, valorAoVencer * config.fatorGale)
    return Math.ceil(((prejuizoDaSequencia + lucroMinimo) / retornoSeguro) * 100) / 100
  },
}

/**
 * Reconstrucao do Teeds Smart AG2 mostrado no video original.
 *
 * A tela antiga exibe mensagens como "0 1 2 = 24%" e a narracao informa
 * que a entrada conservadora acontece a partir de 36%. Como os percentuais
 * andam de quatro em quatro pontos, a amostra observavel tem 25 digitos:
 * 9 ocorrencias de 0/1/2 representam 36%.
 */
export const AG_2: Estrategia = {
  ...SUPERIOR_5,
  id: 'ag2',
  nome: '{marca} - AG2',
  origem: 'reconstruído a partir do robô Smart AG2 original',
  descricao:
    'Analisa os 25 últimos dígitos e entra quando 0, 1 e 2 somam pelo menos 36%. ' +
    'O contrato ganha se o próximo último dígito for 0, 1 ou 2.',
  contractType: 'DIGITUNDER',
  barreira: 3,
  entradaContinua: false,
  entrar: ({ digitos }) => {
    const janela = digitos.slice(-25)
    return janela.length === 25 && janela.filter((d) => d <= 2).length >= 9
  },
  aguardando: ({ digitos }) => {
    const janela = digitos.slice(-25)
    const favoraveis = janela.filter((d) => d <= 2).length
    const percentual = janela.length ? Math.round((favoraveis / janela.length) * 100) : 0
    return janela.length < 25
      ? `lendo o mercado — ${janela.length}/25 dígitos`
      : `concentração de 0, 1 e 2 em ${percentual}% — entrada a partir de 36%`
  },
  progresso: ({ digitos }) => {
    const janela = digitos.slice(-25)
    const favoraveis = janela.filter((d) => d <= 2).length
    return {
      rotulo: janela.length < 25
        ? `Amostra do mercado — ${janela.length}/25`
        : `0, 1 e 2 representam ${Math.round((favoraveis / 25) * 100)}%`,
      itens: [0, 1, 2].map((valor) => ({
        valor: String(valor),
        ok: janela.filter((d) => d === valor).length > 0,
      })),
    }
  },
}

/** Smart 03 observável no vídeo: último dígito superior a 3, após 1 tick. */
export const SMART_03: Estrategia = {
  ...SUPERIOR_5,
  id: 'smart03',
  nome: '{marca} Smart 03',
  origem: 'reconstruído a partir do vídeo do robô original',
  descricao:
    'Opera contratos de 1 tick e ganha quando o último dígito é 4, 5, 6, 7, 8 ou 9. ' +
    'A progressão recupera a sequência usando o retorno real do contrato.',
  contractType: 'DIGITOVER',
  barreira: 3,
}

/** Göreme observável no vídeo: último dígito estritamente inferior a 9. */
export const GOREME: Estrategia = {
  ...SUPERIOR_5,
  id: 'goreme',
  nome: '{marca} Göreme',
  origem: 'reconstruído a partir do vídeo do robô original',
  descricao:
    'Opera contratos de 1 tick e ganha quando o último dígito está entre 0 e 8. ' +
    'O retorno por acerto é pequeno, por isso a recuperação liga já na primeira perda.',
  contractType: 'DIGITUNDER',
  barreira: 9,
}

/** Primeiro bloco da dezena: vence com qualquer último dígito entre 0 e 4. */
export const FIRST_BLOCK: Estrategia = {
  ...SUPERIOR_5,
  id: 'firstblock',
  nome: 'First Block',
  origem: 'primeiro bloco dos dígitos decimais',
  descricao:
    'Ganha quando o último dígito é 0, 1, 2, 3 ou 4. Entra em todas as operações; ' +
    'usa o valor base até o gatilho e depois recupera somente o necessário.',
  contractType: 'DIGITUNDER',
  barreira: 5,
}

/** Segundo bloco da dezena: vence com qualquer último dígito entre 5 e 9. */
export const SECOND_BLOCK: Estrategia = {
  ...SUPERIOR_5,
  id: 'secondblock',
  nome: 'Second Block',
  origem: 'segundo bloco dos dígitos decimais',
  descricao:
    'Ganha quando o último dígito é 5, 6, 7, 8 ou 9. Entra em todas as operações; ' +
    'usa o valor base até o gatilho e depois recupera somente o necessário.',
  contractType: 'DIGITOVER',
  barreira: 4,
}

type FasePalm = 'aquecendo' | 'base-real' | 'recuperacao-espera' | 'recuperacao-real'

const janelaPalm = (digitos: number[]) => digitos.slice(-25)
const pctPalm = (digitos: number[], aceita: (d: number) => boolean) =>
  janelaPalm(digitos).filter(aceita).length * 4
const fasePalm = (memoria: Record<string, unknown>): FasePalm =>
  (memoria.fasePalm as FasePalm | undefined) ?? 'aquecendo'

/**
 * The Palm, reconstruído quadro a quadro a partir do robô original.
 *
 * A entrada-base é Under 9: primeiro observa em virtual até o 9 aparecer e
 * então abre um ciclo real. Uma perda troca a recuperação para Under 5. A
 * recuperação só é exposta quando 0–4 ocupam ao menos 48% dos 25 dígitos e
 * um resultado 5–9 (loss virtual ou real) acaba de ocorrer.
 */
export const THE_PALM: Estrategia = {
  id: 'thepalm',
  nome: 'The Palm',
  origem: 'reconstruído a partir do The Palm 2.0 original',
  descricao:
    'Analisa 25 dígitos, arma entradas reais em Under 9 após uma perda virtual e ' +
    'troca para Under 5 na recuperação, sempre usando o payout real para calcular o valor.',
  contractType: 'DIGITUNDER',
  barreira: 9,
  ticks: 1,
  entradaContinua: true,
  contrato: ({ memoria }) => fasePalm(memoria) === 'recuperacao-real'
    ? { contractType: 'DIGITUNDER', barreira: 5 }
    : { contractType: 'DIGITUNDER', barreira: 9 },
  entrar: ({ digitos, memoria }) => {
    const janela = janelaPalm(digitos)
    if (janela.length < 25) return false
    const ultimo = janela[janela.length - 1]
    const fase = fasePalm(memoria)

    if (fase === 'base-real' || fase === 'recuperacao-real') return true
    if (fase === 'aquecendo') {
      if (pctPalm(janela, (d) => d === 9) <= 12 && ultimo === 9) {
        memoria.fasePalm = 'base-real'
        return true
      }
      return false
    }
    if (pctPalm(janela, (d) => d <= 4) >= 48 && ultimo >= 5) {
      memoria.fasePalm = 'recuperacao-real'
      return true
    }
    return false
  },
  aguardando: ({ digitos, memoria }) => {
    const janela = janelaPalm(digitos)
    if (janela.length < 25) return `lendo o mercado — ${janela.length}/25 dígitos`
    const nove = pctPalm(janela, (d) => d === 9)
    const baixos = pctPalm(janela, (d) => d <= 4)
    return fasePalm(memoria) === 'recuperacao-espera'
      ? `recuperação em análise — 0 a 4 em ${baixos}% (libera em 48% após loss virtual)`
      : `análise virtual Under 9 — dígito 9 em ${nove}% (limite 12%)`
  },
  progresso: ({ digitos, memoria }) => {
    const janela = janelaPalm(digitos)
    const nove = janela.length === 25 ? pctPalm(janela, (d) => d === 9) : 0
    const baixos = janela.length === 25 ? pctPalm(janela, (d) => d <= 4) : 0
    const recuperando = fasePalm(memoria).startsWith('recuperacao')
    return {
      rotulo: recuperando
        ? `Under 5 virtual · 0–4 em ${baixos}%`
        : `Under 9 virtual · dígito 9 em ${nove}%`,
      itens: recuperando
        ? [{ valor: `${baixos}%`, ok: janela.length === 25 && baixos >= 48 }, { valor: '5–9', ok: janela[janela.length - 1] >= 5 }]
        : [{ valor: `${nove}%`, ok: janela.length === 25 && nove <= 12 }, { valor: '9', ok: janela[janela.length - 1] === 9 }],
    }
  },
  aposResultado: ({ ganhou, contractType, memoria, digitos }) => {
    const eraRecuperacao = contractType === 'DIGITUNDER' && fasePalm(memoria) === 'recuperacao-real'
    if (ganhou) {
      memoria.fasePalm = eraRecuperacao ? 'aquecendo' : 'base-real'
      return
    }
    const baixos = pctPalm(digitos, (d) => d <= 4)
    const janela = janelaPalm(digitos)
    const ultimo = janela[janela.length - 1]
    memoria.fasePalm = baixos >= 48 && ultimo !== undefined && ultimo >= 5
      ? 'recuperacao-real'
      : 'recuperacao-espera'
  },
  proximoValor: ({ ganhou, valorAoVencer, prejuizoDaSequencia, retornoLiquidoPorUnidade, contractType }) => {
    if (ganhou) return valorAoVencer
    // Antes da primeira compra Under 5, o último payout conhecido ainda é o
    // pequeno retorno do Under 9. Depois usamos a cotação realmente comprada.
    const retornoObservado = contractType === 'DIGITUNDER' && retornoLiquidoPorUnidade > 0.5
      ? retornoLiquidoPorUnidade
      : 0.9233
    const retornoSeguro = Math.max(0.01, retornoObservado * 0.99)
    const lucroAlvo = Math.max(0.01, valorAoVencer * 0.95)
    return Math.ceil(((prejuizoDaSequencia + lucroAlvo) / retornoSeguro) * 100) / 100
  },
}

/** Variacao conservadora: entra igual, mas a entrada nunca muda. */
export const SUPERIOR_5_FIXO: Estrategia = {
  ...SUPERIOR_5,
  id: 'superior5fixo',
  nome: 'AG7 sem martingale',
  origem: 'variação de valor fixo',
  descricao: 'Entra em todas as operações com o valor sempre igual, sem progressão.',
  progresso: undefined,
  aguardando: () => 'entrando na próxima',
  proximoValor: ({ valorAoVencer }) => valorAoVencer,
}

/**
 * O nome do robô, com a marca no lugar.
 *
 * Os nomes guardam `{marca}` em vez da palavra: os mesmos robôs se chamam
 * "Teeds - AG7" numa marca e "OMNI - AG7" noutra. Alguns não levam marca
 * nenhuma ("First Block") — esses simplesmente não têm o lugar marcado.
 *
 * Antes o nome estava escrito duas vezes, aqui e em `branding.ts`. Duas
 * cópias já eram um convite a divergir; com duas marcas seriam quatro.
 */
export const nomeDoRobo = (e: { nome: string }, prefixo: string): string =>
  e.nome.replace('{marca}', prefixo)

/**
 * O nome do robô numa marca: o apelido próprio dela, se houver, senão o
 * molde com o prefixo. É por aqui que "superior5" vira "OMNI Over" numa
 * plataforma e "Teeds - AG7" na outra.
 */
export const nomeDoRoboNaMarca = (
  e: { id: string; nome: string },
  marca: { prefixoRobo: string; nomesDosRobos?: Record<string, string> },
): string => marca.nomesDosRobos?.[e.id] ?? nomeDoRobo(e, marca.prefixoRobo)

export const ESTRATEGIAS_LOCAIS: Estrategia[] = [
  SUPERIOR_5, AG_2, SMART_03, GOREME, FIRST_BLOCK, SECOND_BLOCK, THE_PALM, SUPERIOR_5_FIXO,
]
