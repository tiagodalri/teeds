import type { Estrategia } from './engine'

/**
 * Estrategias que rodam no motor da Teeds.
 *
 * A primeira delas veio de um arquivo XML do Deriv Bot (SUPERIOR 5 VIP),
 * traduzido bloco a bloco para codigo. O comportamento e o mesmo do
 * original, com uma diferenca deliberada: o limite de perda funciona.
 * No arquivo original ele comparava com o lucro do ultimo contrato em vez
 * do resultado acumulado, entao nunca disparava.
 */

const ultimos = (d: number[], n: number) => d.slice(-n)

export const SUPERIOR_5: Estrategia = {
  id: 'superior5',
  nome: 'Superior 5',
  origem: 'importado do Deriv Bot (SUPERIOR 5 VIP)',
  descricao:
    'Espera três dígitos seguidos menores ou iguais a 6 antes de entrar. ' +
    'Depois de uma perda, entra a cada tick até recuperar.',
  contractType: 'DIGITOVER',
  barreira: 5,
  ticks: 1,

  entrar: ({ digitos, perdasSeguidas }) => {
    // apos qualquer perda, o filtro e abandonado: entra direto (modo recuperacao)
    if (perdasSeguidas >= 1) return true
    const tres = ultimos(digitos, 3)
    if (tres.length < 3) return false
    return tres.every((d) => d <= 6)
  },

  aguardando: ({ digitos, perdasSeguidas }) => {
    if (perdasSeguidas >= 1) return 'recuperando — entra no próximo tick'
    const tres = ultimos(digitos, 3)
    if (tres.length < 3) return 'lendo os primeiros dígitos…'
    const faltam = tres.filter((d) => d > 6).length
    return `esperando 3 dígitos ≤ 6 · últimos: ${tres.join(', ')}` +
      (faltam ? ` (${faltam} acima de 6)` : '')
  },

  proximoValor: ({ ganhou, lucro, valorAoVencer, perdasSeguidas, config }) => {
    // ganhou: volta para o valor fixo de entrada
    if (ganhou) return valorAoVencer
    // perdeu, mas ainda nao atingiu o gatilho do gale: mantem
    if (perdasSeguidas < config.galeApos) return valorAoVencer
    // gale: soma o prejuizo multiplicado pelo fator
    return valorAoVencer + Math.abs(lucro) * config.fatorGale
  },
}

/** Variacao conservadora: mesmo filtro, sem progressao apos perdas. */
export const SUPERIOR_5_FIXO: Estrategia = {
  ...SUPERIOR_5,
  id: 'superior5fixo',
  nome: 'Superior 5 (valor fixo)',
  origem: 'variação sem martingale',
  descricao:
    'Mesma leitura de dígitos do Superior 5, mas o valor da entrada nunca muda. ' +
    'Sem progressão depois de perder.',
  proximoValor: ({ valorAoVencer }) => valorAoVencer,
}

export const ESTRATEGIAS_LOCAIS: Estrategia[] = [SUPERIOR_5, SUPERIOR_5_FIXO]
