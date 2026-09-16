import type { Estrategia } from './engine'

/**
 * Modo de operação: só muda o quanto a recuperação mira de lucro.
 *
 * Conservador é a escada de sempre: fecha a sequência praticamente no zero
 * a zero (5% da base). Agressivo mira recuperar tudo e ainda sobrar uma
 * entrada base inteira — entradas maiores, um degrau a menos de colchão no
 * mesmo stop. O gatilho (galeApos) é o mesmo nos dois.
 */
export type Modo = 'conservador' | 'agressivo'
export const MODOS: Modo[] = ['conservador', 'agressivo']
export const NOME_DO_MODO: Record<Modo, string> = { conservador: 'Conservador', agressivo: 'Agressivo' }

/** Recuperação oficial, interna e não editável de cada modelo. */
export const RECUPERACAO_POR_ROBO: Record<string, { galeApos: number; margem: number; agressivo?: number }> = {
  superior5: { galeApos: 3, margem: 0.05, agressivo: 1 },
  ag2: { galeApos: 3, margem: 0.05, agressivo: 1 },
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

export function recuperacaoDoRobo(id: string, modo: Modo = 'conservador'): { galeApos: number; margem: number } {
  const r = RECUPERACAO_POR_ROBO[id] ?? { galeApos: 3, margem: 0.05 }
  return { galeApos: r.galeApos, margem: modo === 'agressivo' && r.agressivo !== undefined ? r.agressivo : r.margem }
}

/** Só AG7 e AG2 (e seus nomes na OMNI) têm os dois modos. */
export function temModos(id: string): boolean {
  return RECUPERACAO_POR_ROBO[id]?.agressivo !== undefined
}

/** Lê o modo de volta da configuração que o motor recebeu. */
export function modoDaConfig(id: string, fatorGale: number): Modo {
  const r = RECUPERACAO_POR_ROBO[id]
  return r?.agressivo !== undefined && fatorGale >= r.agressivo - 1e-9 ? 'agressivo' : 'conservador'
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
 * Troca a fase e anota por quê. Só o `fasePalm` decide alguma coisa; os
 * outros três campos são telemetria (anterior, motivo, quando) que o
 * espelho operacional e o replay leem. Mesmo valor gravado, mesma decisão.
 */
const mudarFasePalm = (memoria: Record<string, unknown>, nova: FasePalm, motivo: string) => {
  const atual = fasePalm(memoria)
  if (atual !== nova) { memoria.fasePalmAnterior = atual; memoria.motivoPalm = motivo; memoria.trocaPalmEm = Date.now() }
  memoria.fasePalm = nova
}
const PALM_LIMITE_NOVE = 12
const PALM_LIMITE_BAIXOS = 48

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
      if (pctPalm(janela, (d) => d === 9) <= PALM_LIMITE_NOVE && ultimo === 9) {
        mudarFasePalm(memoria, 'base-real', `dígito 9 apareceu com 9 em ${pctPalm(janela, (d) => d === 9)}% (limite ${PALM_LIMITE_NOVE}%): loss virtual, ciclo real Under 9`)
        return true
      }
      return false
    }
    if (pctPalm(janela, (d) => d <= 4) >= PALM_LIMITE_BAIXOS && ultimo >= 5) {
      mudarFasePalm(memoria, 'recuperacao-real', `0–4 em ${pctPalm(janela, (d) => d <= 4)}% (mínimo ${PALM_LIMITE_BAIXOS}%) e dígito ${ultimo} (5–9): recuperação Under 5 liberada`)
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
      mudarFasePalm(memoria, eraRecuperacao ? 'aquecendo' : 'base-real', eraRecuperacao ? 'recuperação ganhou: volta ao virtual Under 9' : 'ganho na base: segue o ciclo real Under 9')
      return
    }
    const baixos = pctPalm(digitos, (d) => d <= 4)
    const janela = janelaPalm(digitos)
    const ultimo = janela[janela.length - 1]
    if (baixos >= 48 && ultimo !== undefined && ultimo >= 5) mudarFasePalm(memoria, 'recuperacao-real', `perda com 0–4 em ${baixos}% e dígito ${ultimo}: recuperação Under 5 imediata`)
    else mudarFasePalm(memoria, 'recuperacao-espera', `perda com 0–4 em ${baixos}%: espera 0–4 chegar a 48% e um dígito 5–9`)
  },
  telemetria: ({ digitos, memoria }) => {
    const janela = janelaPalm(digitos)
    const fase = fasePalm(memoria)
    const nove = janela.length === 25 ? pctPalm(janela, (d) => d === 9) : 0
    const baixos = janela.length === 25 ? pctPalm(janela, (d) => d <= 4) : 0
    const recuperando = fase === 'recuperacao-real'
    return {
      fase,
      anterior: (memoria.fasePalmAnterior as string | undefined) ?? null,
      motivo: (memoria.motivoPalm as string | undefined) ?? null,
      contrato: 'DIGITUNDER',
      barreira: recuperando ? 5 : 9,
      virtual: fase === 'aquecendo' || fase === 'recuperacao-espera',
      detalhes: {
        janela: janela.length, nove, baixos, limiteNove: PALM_LIMITE_NOVE, limiteBaixos: PALM_LIMITE_BAIXOS,
        estrategiaAtual: recuperando ? 'Under 5' : 'Under 9',
        estrategiaAnterior: memoria.fasePalmAnterior === 'recuperacao-real' ? 'Under 5' : memoria.fasePalmAnterior ? 'Under 9' : '',
        confirmacao: fase === 'aquecendo' ? 'dígito 9 com 9 ≤ 12% na janela' : fase === 'recuperacao-espera' ? '0–4 ≥ 48% e um dígito 5–9' : 'entrada liberada',
        trocadaEm: (memoria.trocaPalmEm as number | undefined) ?? 0,
      },
    }
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
