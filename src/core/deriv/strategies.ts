import type { Estrategia, Medidor, ConfigEstrategia } from './engine'
import {
  LOSSES_PARA_ENTRAR, LOSSES_VIRTUAIS, PALM_PADRAO, RECUPERACAO_POR_ROBO,
  recuperacaoDe, temModoAgressivo, type ParametrosDoRobo,
} from './parametros'
import { proximaEntrada, proximaEntradaPalm } from './recuperacao'

// A tabela de recuperação mudou de casa (parametros.ts), mas quem importava daqui continua funcionando.
export { RECUPERACAO_POR_ROBO }

/**
 * Modo de operação: só muda o quanto a recuperação mira de lucro.
 *
 * Conservador é a escada de sempre: fecha a sequência praticamente no zero
 * a zero (5% da base). Agressivo mira recuperar tudo e ainda sobrar 20% do
 * que estava sendo recuperado (nunca menos que uma entrada base) — quanto
 * mais fundo a sequência foi, maior o lucro ao fechar. Custa entradas
 * maiores e um degrau a menos de colchão no mesmo stop. O gatilho
 * (galeApos) é o mesmo nos dois.
 */
export type Modo = 'conservador' | 'agressivo'
export const MODOS: Modo[] = ['conservador', 'agressivo']
export const NOME_DO_MODO: Record<Modo, string> = { conservador: 'Conservador', agressivo: 'Agressivo' }

/**
 * O que a recuperação do robô exige, no modo pedido. Com `parametros` (o que
 * o painel publicou) lê de lá; sem, o padrão do código — o mesmo resultado
 * que sempre deu.
 */
export function recuperacaoDoRobo(id: string, modo: Modo = 'conservador', parametros?: ParametrosDoRobo): { galeApos: number; margem: number; sobrePrejuizo: number } {
  if (parametros) return recuperacaoDe(parametros, modo)
  const r = RECUPERACAO_POR_ROBO[id] ?? { galeApos: 3, margem: 0.05 }
  if (modo === 'agressivo' && r.agressivo) return { galeApos: r.galeApos, margem: r.agressivo.margem, sobrePrejuizo: r.agressivo.sobrePrejuizo }
  return { galeApos: r.galeApos, margem: r.margem, sobrePrejuizo: 0 }
}

/** O robô oferece os dois modos? Por padrão só AG7 e AG2 (e seus nomes na OMNI); o painel pode mudar. */
export function temModos(id: string, parametros?: ParametrosDoRobo): boolean {
  if (parametros) return temModoAgressivo(parametros)
  return RECUPERACAO_POR_ROBO[id]?.agressivo !== undefined
}

/**
 * Lê o modo de volta da configuração que o motor recebeu. Sessões novas
 * trazem `config.modo` explícito; as antigas (e o espelho de antes) são
 * inferidas pela margem, como sempre.
 */
export function modoDaConfig(id: string, fatorGale: number, lucroSobrePrejuizo = 0, config?: Pick<ConfigEstrategia, 'modo' | 'parametros'>): Modo {
  if (config?.modo) return config.modo
  const ag = config?.parametros ? config.parametros.recuperacao.modos.agressivo : RECUPERACAO_POR_ROBO[id]?.agressivo
  if (!ag) return 'conservador'
  return lucroSobrePrejuizo > 0 || fatorGale >= ag.margem - 1e-9 ? 'agressivo' : 'conservador'
}

/**
 * Estrategias que rodam no motor da Teeds.
 *
 * O AG7 nasceu de um arquivo XML do Deriv Bot (SUPERIOR 5 VIP), traduzido
 * bloco a bloco. A regra mudou depois, a pedido: o filtro de entrada saiu
 * (entra em toda operacao) e, em 01/09, a barreira subiu para 6 — o AG7
 * ganha so nos digitos 7, 8 e 9. O AG2 e o espelho dele nos digitos
 * baixos: DIGITUNDER 3, ganha so no 0, 1 e 2. Em 22/09 o AG7 ganhou de volta
 * uma analise; em 22/09 ela virou loss virtual de quatro (ver abaixo).
 */

const BASE_DIGITOS: Estrategia = {
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

  // A conta da recuperação mora em recuperacao.ts (uma só para motor, escada e painel).
  proximoValor: (args) => proximaEntrada(args),
}

/** Ajuste exclusivo da terceira entrada de AG7/AG2 e seus nomes na OMNI. */
export function terceiraEntrada(base: number, prejuizo: number, retorno: number): number {
  const alvo = prejuizo + Math.max(0.05, base * 0.05)
  return Math.max(base, Math.ceil((alvo / Math.max(0.01, retorno * 0.97)) * 100) / 100)
}

/* ------------------------------------------------------------------ *
 * Análise antes de entrar (21/09 na OMNI, 22/09 na Teeds).
 *
 *  - AG7, AG2 e OMNI Over: quatro dígitos seguidos que teriam perdido
 *    (loss virtual) liberam a entrada, e a sequência segue sem nova
 *    análise até uma vitória fechá-la. Em 22/09/2026 esta regra substituiu
 *    a leitura de percentual (7, 8 e 9 em 36% dos últimos 25).
 *  - Loss virtual de dois (First/Second Block, OMNI Bull/Bear): entra
 *    depois de dois dígitos seguidos da outra metade.
 * ------------------------------------------------------------------ */
/**
 * Entrada por loss virtual, com a sequência inteira sem nova análise.
 *
 * Pedido do Tiago em 22/09/2026 para o AG7, o AG2 e o OMNI Over: sai a
 * leitura de percentual e entra esta regra — o robô espera QUATRO dígitos
 * seguidos que teriam perdido (loss virtual, sem dinheiro) e então entra.
 * A partir daí ele segue operando a sequência sem analisar de novo, até
 * uma vitória fechar a sequência; aí volta a contar os quatro.
 *
 * A memória é da execução (`memoria.emSequencia`): nunca é compartilhada
 * entre clientes e some quando a sessão termina.
 */
/** Quantos dígitos seguidos da outra metade saíram por último (o "loss virtual"). */
function lossesVirtuais(digitos: number[], ganha: (d: number) => boolean): number {
  let n = 0
  for (let i = digitos.length - 1; i >= 0 && !ganha(digitos[i]); i--) n++
  return n
}

/**
 * A quantidade e o "segue a sequência" vêm dos PARÂMETROS DA SESSÃO
 * (`config.parametros`, o que o painel publicou), lidos a cada chamada —
 * nunca capturados no import. Sem parâmetros, o padrão de cada família.
 */
const regraDeEntrada = (config: ConfigEstrategia | undefined, padraoQuantos: number, padraoSegue: boolean) => ({
  quantos: config?.parametros?.entrada.lossVirtual ?? padraoQuantos,
  segue: config?.parametros?.entrada.sequenciaSemAnalise ?? padraoSegue,
})

/**
 * Entrada por loss virtual. Uma fábrica para as duas famílias:
 *  - AG7/AG2/OMNI Over: 4 dígitos que teriam perdido, e a sequência segue sem
 *    nova análise até uma vitória (`memoria.emSequencia`); emenda uma
 *    entrada na outra sem esperar o tick (entradaContinua).
 *  - First/Second Block, OMNI Bull/Bear: 2 dígitos, analisa a cada entrada,
 *    espera o tick seguinte.
 *  - Smart 03 e Göreme entram com 0 (= sempre); se o painel subir o número,
 *    ganham a mesma análise.
 * Com `quantos === 0` o robô se comporta exatamente como antes deste painel:
 * entra sempre, textos do valor base, sem medidor.
 */
function entradaPorLossVirtual(ganha: (d: number) => boolean, padraoQuantos: number, padraoSegue: boolean, continua: boolean):
  Pick<Estrategia, 'entradaContinua' | 'entrar' | 'aguardando' | 'progresso' | 'medidor' | 'aposResultado'> {
  const contar = (digitos: number[], quantos: number) => Math.min(quantos, lossesVirtuais(digitos, ganha))
  return {
    entradaContinua: continua,
    entrar: ({ digitos, memoria, config }) => {
      const { quantos, segue } = regraDeEntrada(config, padraoQuantos, padraoSegue)
      if (quantos === 0) return true
      return (segue && memoria.emSequencia === true) || contar(digitos, quantos) >= quantos
    },
    aposResultado: ({ ganhou, memoria, config }) => {
      const { segue } = regraDeEntrada(config, padraoQuantos, padraoSegue)
      memoria.emSequencia = segue ? !ganhou : false
    },
    aguardando: (ctx) => {
      const { quantos, segue } = regraDeEntrada(ctx.config, padraoQuantos, padraoSegue)
      if (quantos === 0) return BASE_DIGITOS.aguardando(ctx)
      return segue && ctx.memoria.emSequencia === true
        ? 'sequência em andamento — entra na próxima'
        : `esperando loss virtual — ${contar(ctx.digitos, quantos)}/${quantos}`
    },
    progresso: (ctx) => {
      const { quantos, segue } = regraDeEntrada(ctx.config, padraoQuantos, padraoSegue)
      if (quantos === 0) return BASE_DIGITOS.progresso!(ctx)
      const n = contar(ctx.digitos, quantos)
      return {
        rotulo: segue && ctx.memoria.emSequencia === true
          ? 'Sequência em andamento'
          : n >= quantos ? 'Loss virtual confirmado — entrada liberada' : `Loss virtual — ${n}/${quantos}`,
        itens: Array.from({ length: quantos }, (_, i) => ({ valor: i < n ? '✕' : '·', ok: i >= n })),
      }
    },
    medidor: ({ digitos, config }) => {
      const { quantos } = regraDeEntrada(config, padraoQuantos, padraoSegue)
      if (quantos === 0) return null
      return { tipo: 'contagem', valor: contar(digitos, quantos), alvo: quantos, rotulo: 'loss virtual — dígitos seguidos que teriam perdido' }
    },
  }
}

/** A família do AG7: 4 dígitos, segue a sequência, emenda sem esperar o tick. */
const porLossVirtual = (ganha: (d: number) => boolean, padraoQuantos = LOSSES_PARA_ENTRAR) =>
  entradaPorLossVirtual(ganha, padraoQuantos, true, true)
/** A família dos Blocks: 2 dígitos, analisa a cada entrada, espera o tick. */
const comLossVirtual = (ganha: (d: number) => boolean, padraoQuantos = LOSSES_VIRTUAIS) =>
  entradaPorLossVirtual(ganha, padraoQuantos, false, false)

export const SUPERIOR_5: Estrategia = {
  ...BASE_DIGITOS,
  descricao:
    'Espera quatro dígitos seguidos que teriam perdido (loss virtual) e então entra. ' +
    'A partir daí segue a sequência sem analisar de novo, até uma vitória fechá-la. ' +
    'O contrato ganha se o último dígito for 7, 8 ou 9.',
  ...porLossVirtual((d) => d >= 7),
  // O ajuste da terceira entrada só existe com gatilho 3 (o painel avisa se alguém voltar a ele).
  proximoValor: (args) => !args.ganhou && args.perdasSeguidas === 2 && args.config.galeApos === 3 && args.config.parametros?.recuperacao.escada.tipo !== 'tabela'
    ? terceiraEntrada(args.valorAoVencer, args.prejuizoDaSequencia, args.retornoLiquidoPorUnidade)
    : BASE_DIGITOS.proximoValor(args),
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
    'Espera quatro dígitos seguidos que teriam perdido (loss virtual) e então entra. ' +
    'A partir daí segue a sequência sem analisar de novo, até uma vitória fechá-la. ' +
    'O contrato ganha se o último dígito for 0, 1 ou 2.',
  contractType: 'DIGITUNDER',
  barreira: 3,
  ...porLossVirtual((d) => d <= 2),
}

/** Smart 03 observável no vídeo: último dígito superior a 3, após 1 tick. */
export const SMART_03: Estrategia = {
  ...BASE_DIGITOS,
  id: 'smart03',
  nome: '{marca} Smart 03',
  origem: 'reconstruído a partir do vídeo do robô original',
  descricao:
    'Opera contratos de 1 tick e ganha quando o último dígito é 4, 5, 6, 7, 8 ou 9. ' +
    'A progressão recupera a sequência usando o retorno real do contrato.',
  contractType: 'DIGITOVER',
  barreira: 3,
  ...porLossVirtual((d) => d >= 4, 0),
}

/** Göreme observável no vídeo: último dígito estritamente inferior a 9. */
export const GOREME: Estrategia = {
  ...BASE_DIGITOS,
  id: 'goreme',
  nome: '{marca} Göreme',
  origem: 'reconstruído a partir do vídeo do robô original',
  descricao:
    'Opera contratos de 1 tick e ganha quando o último dígito está entre 0 e 8. ' +
    'O retorno por acerto é pequeno, por isso a recuperação liga já na primeira perda.',
  contractType: 'DIGITUNDER',
  barreira: 9,
  ...porLossVirtual((d) => d <= 8, 0),
}

/** Primeiro bloco da dezena: vence com qualquer último dígito entre 0 e 4. */
export const FIRST_BLOCK: Estrategia = {
  ...BASE_DIGITOS,
  id: 'firstblock',
  nome: 'First Block',
  origem: 'primeiro bloco dos dígitos decimais',
  descricao:
    'Ganha quando o último dígito é 0, 1, 2, 3 ou 4. Antes de entrar, espera sair 2 dígitos seguidos ' +
    'da outra metade (loss virtual) e só então abre a operação.',
  contractType: 'DIGITUNDER',
  barreira: 5,
  ...comLossVirtual((d) => d <= 4),
}

/** Segundo bloco da dezena: vence com qualquer último dígito entre 5 e 9. */
export const SECOND_BLOCK: Estrategia = {
  ...BASE_DIGITOS,
  id: 'secondblock',
  nome: 'Second Block',
  origem: 'segundo bloco dos dígitos decimais',
  descricao:
    'Ganha quando o último dígito é 5, 6, 7, 8 ou 9. Antes de entrar, espera sair 2 dígitos seguidos ' +
    'da outra metade (loss virtual) e só então abre a operação.',
  contractType: 'DIGITOVER',
  barreira: 4,
  ...comLossVirtual((d) => d >= 5),
}


/* Nomes da OMNI: os mesmos robôs da Teeds, com o id próprio da marca. */
export const OMNI_OVER: Estrategia = {
  ...SUPERIOR_5,
  id: 'omniover',
  nome: 'OMNI Over',
  origem: 'AG7 com entrada por loss virtual nos dígitos altos',
}
export const OMNI_BULL: Estrategia = { ...FIRST_BLOCK, id: 'omnibull', nome: 'OMNI Bull', origem: 'First Block com análise de loss virtual' }
export const OMNI_BEAR: Estrategia = { ...SECOND_BLOCK, id: 'omnibear', nome: 'OMNI Bear', origem: 'Second Block com análise de loss virtual' }

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
/** Os limites do The Palm: os publicados pelo painel para esta sessão, ou os de sempre (12% / 48%). */
const palmDe = (config: ConfigEstrategia | undefined) => config?.parametros?.palm ?? PALM_PADRAO

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
  entrar: ({ digitos, memoria, config }) => {
    const palm = palmDe(config)
    const janela = janelaPalm(digitos)
    if (janela.length < 25) return false
    const ultimo = janela[janela.length - 1]
    const fase = fasePalm(memoria)

    if (fase === 'base-real' || fase === 'recuperacao-real') return true
    if (fase === 'aquecendo') {
      if (pctPalm(janela, (d) => d === 9) <= palm.limiteNove && ultimo === 9) {
        mudarFasePalm(memoria, 'base-real', `dígito 9 apareceu com 9 em ${pctPalm(janela, (d) => d === 9)}% (limite ${palm.limiteNove}%): loss virtual, ciclo real Under 9`)
        return true
      }
      return false
    }
    if (pctPalm(janela, (d) => d <= 4) >= palm.limiteBaixos && ultimo >= 5) {
      mudarFasePalm(memoria, 'recuperacao-real', `0–4 em ${pctPalm(janela, (d) => d <= 4)}% (mínimo ${palm.limiteBaixos}%) e dígito ${ultimo} (5–9): recuperação Under 5 liberada`)
      return true
    }
    return false
  },
  aguardando: ({ digitos, memoria, config }) => {
    const palm = palmDe(config)
    const janela = janelaPalm(digitos)
    if (janela.length < 25) return `lendo o mercado — ${janela.length}/25 dígitos`
    const nove = pctPalm(janela, (d) => d === 9)
    const baixos = pctPalm(janela, (d) => d <= 4)
    return fasePalm(memoria) === 'recuperacao-espera'
      ? `recuperação em análise — 0 a 4 em ${baixos}% (libera em ${palm.limiteBaixos}% após loss virtual)`
      : `análise virtual Under 9 — dígito 9 em ${nove}% (limite ${palm.limiteNove}%)`
  },
  progresso: ({ digitos, memoria, config }) => {
    const palm = palmDe(config)
    const janela = janelaPalm(digitos)
    const nove = janela.length === 25 ? pctPalm(janela, (d) => d === 9) : 0
    const baixos = janela.length === 25 ? pctPalm(janela, (d) => d <= 4) : 0
    const recuperando = fasePalm(memoria).startsWith('recuperacao')
    return {
      rotulo: recuperando
        ? `Under 5 virtual · 0–4 em ${baixos}%`
        : `Under 9 virtual · dígito 9 em ${nove}%`,
      itens: recuperando
        ? [{ valor: `${baixos}%`, ok: janela.length === 25 && baixos >= palm.limiteBaixos }, { valor: '5–9', ok: janela[janela.length - 1] >= 5 }]
        : [{ valor: `${nove}%`, ok: janela.length === 25 && nove <= palm.limiteNove }, { valor: '9', ok: janela[janela.length - 1] === 9 }],
    }
  },
  aposResultado: ({ ganhou, contractType, memoria, digitos, config }) => {
    const palm = palmDe(config)
    const eraRecuperacao = contractType === 'DIGITUNDER' && fasePalm(memoria) === 'recuperacao-real'
    if (ganhou) {
      mudarFasePalm(memoria, eraRecuperacao ? 'aquecendo' : 'base-real', eraRecuperacao ? 'recuperação ganhou: volta ao virtual Under 9' : 'ganho na base: segue o ciclo real Under 9')
      return
    }
    const baixos = pctPalm(digitos, (d) => d <= 4)
    const janela = janelaPalm(digitos)
    const ultimo = janela[janela.length - 1]
    if (baixos >= palm.limiteBaixos && ultimo !== undefined && ultimo >= 5) mudarFasePalm(memoria, 'recuperacao-real', `perda com 0–4 em ${baixos}% e dígito ${ultimo}: recuperação Under 5 imediata`)
    else mudarFasePalm(memoria, 'recuperacao-espera', `perda com 0–4 em ${baixos}%: espera 0–4 chegar a ${palm.limiteBaixos}% e um dígito 5–9`)
  },
  telemetria: ({ digitos, memoria, config }) => {
    const palm = palmDe(config)
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
        janela: janela.length, nove, baixos, limiteNove: palm.limiteNove, limiteBaixos: palm.limiteBaixos,
        estrategiaAtual: recuperando ? 'Under 5' : 'Under 9',
        estrategiaAnterior: memoria.fasePalmAnterior === 'recuperacao-real' ? 'Under 5' : memoria.fasePalmAnterior ? 'Under 9' : '',
        confirmacao: fase === 'aquecendo' ? `dígito 9 com 9 ≤ ${palm.limiteNove}% na janela` : fase === 'recuperacao-espera' ? `0–4 ≥ ${palm.limiteBaixos}% e um dígito 5–9` : 'entrada liberada',
        trocadaEm: (memoria.trocaPalmEm as number | undefined) ?? 0,
      },
    }
  },
  // A conta da recuperação do Palm mora em recuperacao.ts (retorno presumido, segurança, lucro ao fechar).
  proximoValor: (args) => proximaEntradaPalm(args),
}

/** Variacao conservadora: entra igual, mas a entrada nunca muda. */
export const SUPERIOR_5_FIXO: Estrategia = {
  ...SUPERIOR_5,
  id: 'superior5fixo',
  nome: 'AG7 sem martingale',
  origem: 'variação de valor fixo',
  descricao: 'Entra em todas as operações com o valor sempre igual, sem progressão.',
  entradaContinua: true,
  entrar: () => true,
  aposResultado: undefined,
  progresso: undefined,
  medidor: undefined,
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
  OMNI_OVER, OMNI_BULL, OMNI_BEAR,
]
