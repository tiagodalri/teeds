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
/* ------------------------------------------------------------------ *
 * Göreme: perde uma e troca de lado para recuperar (30/09/2026).
 *
 * Na entrada ele ganha com 0 a 8 — acerta quase sempre, mas paga só 6% por
 * acerto. Recuperar uma perda nesse pagamento exigia 18x a entrada, e a
 * escada seguinte explodia.
 *
 * Agora, depois da primeira perda, ele troca para os dígitos altos (7, 8 ou
 * 9), o contrato do AG7, que paga quase o dobro da entrada. Recuperar ali
 * custa uma fração do que custava. Ganhou a recuperação, volta para 0 a 8.
 *
 * O detalhe que faz a conta fechar: a escada se calcula pelo pagamento da
 * PRÓXIMA compra, não da anterior. Como a perda veio de um contrato de 6% e
 * a próxima compra é de ~192%, a primeira entrada da recuperação usa o
 * pagamento presumido do Over 6; da segunda em diante o motor já tem o
 * pagamento real do contrato que acabou de comprar.
 * ------------------------------------------------------------------ */
type FaseGoreme = 'base' | 'recuperacao'
const faseGoreme = (memoria: Record<string, unknown>): FaseGoreme =>
  (memoria.faseGoreme as FaseGoreme | undefined) ?? 'base'
/** Pagamento presumido do Over 6 (2,92 por 1) na virada para a recuperação. */
const RETORNO_OVER_6 = 1.9
const GOREME_BASE = porLossVirtual((d) => d <= 8, 0)

export const GOREME: Estrategia = {
  ...BASE_DIGITOS,
  id: 'goreme',
  nome: '{marca} Göreme',
  origem: 'reconstruído a partir do vídeo do robô original',
  descricao:
    'Ganha quando o último dígito está entre 0 e 8. Perdeu uma, troca para os dígitos ' +
    'altos (7, 8 ou 9), onde o pagamento é quase o dobro da entrada, e recupera ali. ' +
    'Ganhou a recuperação, volta a operar de 0 a 8.',
  contractType: 'DIGITUNDER',
  barreira: 9,
  ...GOREME_BASE,
  contrato: ({ memoria }) => faseGoreme(memoria) === 'recuperacao'
    ? { contractType: 'DIGITOVER', barreira: 6 }
    : { contractType: 'DIGITUNDER', barreira: 9 },
  aposResultado: (ctx) => {
    GOREME_BASE.aposResultado?.(ctx)
    const antes = faseGoreme(ctx.memoria)
    const agora: FaseGoreme = ctx.ganhou ? 'base' : 'recuperacao'
    if (antes !== agora) {
      ctx.memoria.faseGoremeAnterior = antes
      ctx.memoria.motivoGoreme = ctx.ganhou
        ? 'recuperação fechada: volta a operar de 0 a 8'
        : 'perdeu: recupera nos dígitos altos (7, 8 ou 9)'
      ctx.memoria.trocaGoremeEm = Date.now()
    }
    ctx.memoria.faseGoreme = agora
  },
  aguardando: (ctx) => faseGoreme(ctx.memoria) === 'recuperacao'
    ? 'recuperando nos dígitos altos — ganha com 7, 8 ou 9'
    : GOREME_BASE.aguardando!(ctx),
  progresso: (ctx) => faseGoreme(ctx.memoria) === 'recuperacao'
    ? { rotulo: 'Recuperação nos dígitos altos', itens: [7, 8, 9].map((v) => ({ valor: String(v), ok: true })) }
    : GOREME_BASE.progresso!(ctx),
  proximoValor: (args) => {
    if (args.ganhou || args.perdasSeguidas < args.config.galeApos) return BASE_DIGITOS.proximoValor(args)
    // A compra que vem é Over 6. Se a anterior foi a entrada de 0 a 8, o
    // pagamento dela não serve de régua: seria uma escada 30x maior.
    const retorno = args.contractType === 'DIGITOVER' ? args.retornoLiquidoPorUnidade : RETORNO_OVER_6
    return BASE_DIGITOS.proximoValor({ ...args, retornoLiquidoPorUnidade: retorno })
  },
  telemetria: ({ memoria }) => {
    const fase = faseGoreme(memoria)
    return {
      fase,
      anterior: (memoria.faseGoremeAnterior as string | undefined) ?? null,
      motivo: (memoria.motivoGoreme as string | undefined) ?? null,
      contrato: fase === 'recuperacao' ? 'DIGITOVER' : 'DIGITUNDER',
      barreira: fase === 'recuperacao' ? 6 : 9,
      virtual: false,
      detalhes: {
        estrategiaAtual: fase === 'recuperacao' ? 'Over 6 (7, 8 ou 9)' : 'Under 9 (0 a 8)',
        estrategiaAnterior: memoria.faseGoremeAnterior === 'recuperacao' ? 'Over 6 (7, 8 ou 9)' : memoria.faseGoremeAnterior ? 'Under 9 (0 a 8)' : '',
        confirmacao: fase === 'recuperacao' ? 'recuperando no pagamento alto' : 'entrada liberada',
      },
    }
  },
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

type FasePalm = 'base-real' | 'recuperacao-espera' | 'recuperacao-real'

const janelaPalm = (digitos: number[]) => digitos.slice(-25)
const pctPalm = (digitos: number[], aceita: (d: number) => boolean) =>
  janelaPalm(digitos).filter(aceita).length * 4
const fasePalm = (memoria: Record<string, unknown>): FasePalm =>
  (memoria.fasePalm as FasePalm | undefined) ?? 'base-real'
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
 * Duas estratégias e um freio só, no lugar certo (Tiago, 02/10/2026):
 *
 *  - **Under 9, livre.** A entrada-base ganha em nove dígitos de dez. Entra
 *    em todo tick, sem análise e sem esperar nada. Antes ela também exigia
 *    um loss virtual (um 9 na janela, com 9 em no máximo 12%), e o freio não
 *    pagava o que custava: segurar uma entrada que acerta 90% para esperar
 *    confirmação só perde rodada. Quem acerta quase sempre não precisa de
 *    permissão para entrar.
 *
 *  - **Under 5, com loss virtual.** A perda troca a estratégia, e aí sim o
 *    freio vale: a recuperação acerta em cinco dígitos de dez, custa mais
 *    caro e erra o dobro. Ela só é exposta quando 0–4 ocupam ao menos 48%
 *    dos 25 dígitos e um resultado 5–9 (virtual ou real) acaba de ocorrer.
 *
 * A recuperação se comporta como a família do AG7: o loss virtual é o pedágio
 * para ENTRAR nela, cobrado uma vez. Dali em diante a sequência segue sem
 * nova análise até uma vitória fechá-la. Antes o robô reanalisava a cada
 * perda e isso congelava a escada no meio — perdia o 2º degrau, a janela já
 * não cumpria os 48% e ele voltava a esperar, deixando aberto exatamente o
 * prejuízo que a recuperação existia para fechar.
 *
 * Recuperou, volta direto ao Under 9 livre — sem passar por análise nenhuma,
 * porque o modo tradicional não tem análise para passar.
 */
export const THE_PALM: Estrategia = {
  id: 'thepalm',
  nome: 'The Palm',
  origem: 'reconstruído a partir do The Palm 2.0 original',
  descricao:
    'Opera Under 9 livre, em todo tick. Uma perda troca para Under 5: a recuperação ' +
    'analisa os 25 dígitos uma vez para entrar e segue a sequência até uma vitória fechá-la.',
  contractType: 'DIGITUNDER',
  barreira: 9,
  ticks: 1,
  entradaContinua: true,
  contrato: ({ memoria }) => fasePalm(memoria) === 'recuperacao-real'
    ? { contractType: 'DIGITUNDER', barreira: 5 }
    : { contractType: 'DIGITUNDER', barreira: 9 },
  entrar: ({ digitos, memoria, config }) => {
    // O Under 9 entra sempre: é a estratégia que acerta em nove dígitos de
    // dez, e não há o que confirmar antes.
    const fase = fasePalm(memoria)
    if (fase === 'base-real' || fase === 'recuperacao-real') return true

    // Só a recuperação analisa. A janela de 25 é dela, e é por isso que o
    // robô pode começar a operar no primeiro tick: a base não precisa dela.
    const palm = palmDe(config)
    const janela = janelaPalm(digitos)
    if (janela.length < 25) return false
    const ultimo = janela[janela.length - 1]
    if (pctPalm(janela, (d) => d <= 4) >= palm.limiteBaixos && ultimo >= 5) {
      mudarFasePalm(memoria, 'recuperacao-real', `0–4 em ${pctPalm(janela, (d) => d <= 4)}% (mínimo ${palm.limiteBaixos}%) e dígito ${ultimo} (5–9): recuperação Under 5 liberada`)
      return true
    }
    return false
  },
  // Só fala quando o robô espera, e agora ele só espera na recuperação.
  aguardando: ({ digitos, config }) => {
    const palm = palmDe(config)
    const janela = janelaPalm(digitos)
    if (janela.length < 25) return `lendo o mercado — ${janela.length}/25 dígitos`
    return `recuperação em análise — 0 a 4 em ${pctPalm(janela, (d) => d <= 4)}% (libera em ${palm.limiteBaixos}% após loss virtual)`
  },
  progresso: ({ digitos, memoria, config }) => {
    const palm = palmDe(config)
    const janela = janelaPalm(digitos)
    const baixos = janela.length === 25 ? pctPalm(janela, (d) => d <= 4) : 0
    const fase = fasePalm(memoria)
    return {
      rotulo: fase === 'recuperacao-espera' ? `Under 5 virtual · 0–4 em ${baixos}%`
        : fase === 'recuperacao-real' ? 'Under 5 · sequência em andamento'
        : 'Under 9 · entra em todo tick',
      itens: fase === 'recuperacao-espera'
        ? [{ valor: `${baixos}%`, ok: janela.length === 25 && baixos >= palm.limiteBaixos }, { valor: '5–9', ok: janela[janela.length - 1] >= 5 }]
        : [],
    }
  },
  aposResultado: ({ ganhou, contractType, memoria, digitos, config }) => {
    const palm = palmDe(config)
    const eraRecuperacao = contractType === 'DIGITUNDER' && fasePalm(memoria) === 'recuperacao-real'
    if (ganhou) {
      // Recuperou ou ganhou na base, o destino é o mesmo: Under 9 solto. A
      // recuperação não devolve o robô para uma fila de análise.
      mudarFasePalm(memoria, 'base-real', eraRecuperacao
        ? 'recuperação ganhou: volta ao Under 9 livre, sem análise'
        : 'ganho na base: segue o ciclo real Under 9')
      return
    }
    // Perdeu DENTRO da recuperação: a sequência segue, sem nova análise, como
    // no AG7. Reanalisar aqui era o que congelava a escada no meio: o robô
    // perdia o 2º degrau, a janela já não cumpria os 48% e ele voltava a
    // esperar — deixando o prejuízo aberto justamente quando a recuperação
    // existia para fechá-lo. O loss virtual é o pedágio para ENTRAR na
    // recuperação, uma vez; quem fecha a sequência é a vitória.
    if (eraRecuperacao) return

    // Primeira perda: aqui sim o loss virtual decide quando expor o Under 5.
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
      virtual: fase === 'recuperacao-espera',
      detalhes: {
        // `nove` fica: é leitura do mercado que o espelho mostra, mesmo sem
        // mandar mais em decisão nenhuma.
        janela: janela.length, nove, baixos, limiteBaixos: palm.limiteBaixos,
        estrategiaAtual: recuperando ? 'Under 5' : 'Under 9',
        estrategiaAnterior: memoria.fasePalmAnterior === 'recuperacao-real' ? 'Under 5' : memoria.fasePalmAnterior ? 'Under 9' : '',
        confirmacao: fase === 'recuperacao-espera' ? `0–4 ≥ ${palm.limiteBaixos}% e um dígito 5–9` : fase === 'recuperacao-real' ? 'sequência em andamento, sem nova análise' : 'entrada liberada',
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
