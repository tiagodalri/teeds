import type { Estrategia } from './engine'

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
  nome: 'Teeds - AG7',
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

/** O espelho do AG7 nos digitos baixos: ganha so no 0, 1 e 2. */
export const AG_2: Estrategia = {
  ...SUPERIOR_5,
  id: 'ag2',
  nome: 'Teeds - AG2',
  origem: 'espelho do AG7 nos dígitos baixos',
  descricao:
    'Ganha quando o último dígito é 0, 1 ou 2. Entra em todas as operações; ' +
    'mantém o valor enquanto as perdas seguidas não chegam ao gatilho e a ' +
    'partir daí liga o martingale para recuperar.',
  contractType: 'DIGITUNDER',
  barreira: 3,
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

export const ESTRATEGIAS_LOCAIS: Estrategia[] = [SUPERIOR_5, AG_2, SUPERIOR_5_FIXO]
