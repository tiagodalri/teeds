/**
 * Parâmetros de cada robô — o formato que o painel edita, o servidor guarda
 * e o motor lê.
 *
 * O PADRÃO MORA AQUI, NO CÓDIGO: `parametrosPadrao(id)` monta o objeto
 * completo de cada robô a partir das mesmas constantes que os robôs sempre
 * usaram (recuperação por robô, loss virtual de 4 e de 2, segurança de 3%
 * sobre o payout, lucro mínimo de US$ 0,01, limites do The Palm). Sem nada
 * gravado no banco, o robô se comporta exatamente como antes deste painel
 * existir — e todas as provas passam com o banco vazio.
 *
 * O banco guarda o objeto COMPLETO (nunca só a diferença): cada versão
 * publicada basta sozinha para reproduzir a escada. Ao ler, o servidor ainda
 * passa por `mesclar(parametrosPadrao(id), gravado)`, assim uma chave nova do
 * formato ganha o padrão sem quebrar linhas antigas.
 *
 * Este arquivo não depende do motor nem das estratégias (só de tipos): é a
 * mesma fonte para o motor, a escada, o servidor, o painel e as provas.
 * As mensagens de `validar()` são as MESMAS do gatilho SQL da tabela
 * `robos_parametros` — quem digita no painel, quem manda por curl e quem
 * escreve no banco à mão ouvem a mesma resposta.
 */
import { TIPOS_DIGITO } from './digits'
import type { ConfigEstrategia } from './engine'
import type { Modo } from './strategies'

export type TipoEscada = 'formula' | 'tabela'
export type DepoisDoUltimo = 'formula' | 'repetir' | 'parar'
/**
 * Um degrau da tabela = a entrada DEPOIS de n perdas seguidas (índice 0 = a
 * entrada após a 1ª perda). `multiplicador` é sobre a ENTRADA BASE do
 * cliente (2,5 = 2,5× a base, escala com ele); `valor` é um USD fixo, igual
 * para todo mundo.
 */
export type DegrauTabela = { multiplicador: number } | { valor: number }
export interface ModoRecuperacao {
  /** Lucro exigido ao fechar a sequência, como fração da entrada base (0,05 = 5%). */
  margem: number
  /** Parte do prejuízo da sequência que também vira lucro exigido (0,2 = 20%). */
  sobrePrejuizo: number
}
export type EscadaConfigurada =
  | { tipo: 'formula' }
  | { tipo: 'tabela'; degraus: DegrauTabela[]; depoisDoUltimo: DepoisDoUltimo }
export interface ParametrosPalm {
  /** Quantos dígitos o The Palm analisa. Fixa em 25 nesta versão. */
  janela: 25
  /** Máximo de dígito 9 na janela (em %) para armar o ciclo real Under 9. */
  limiteNove: number
  /** Mínimo de 0–4 na janela (em %) para liberar a recuperação Under 5. */
  limiteBaixos: number
  /** Payout presumido antes da primeira compra Under 5. */
  retornoInicial: number
  /** Segurança sobre o payout real na recuperação do Palm. */
  desconto: number
  /** Lucro exigido ao fechar, como fração da base. */
  margem: number
}
export interface ParametrosDoRobo {
  v: 1
  entrada: {
    /** Dígitos seguidos que teriam perdido antes de entrar. 0 = entra sempre. */
    lossVirtual: number
    /** Depois de entrar, segue a sequência sem contar loss virtual de novo até uma vitória. */
    sequenciaSemAnalise: boolean
  }
  /** SOMENTE LEITURA nesta versão: exibido e usado pela simulação; o motor usa o da estratégia. */
  contrato: { contractType: 'DIGITOVER' | 'DIGITUNDER'; barreira: number }
  recuperacao: {
    /** Perdas seguidas no valor base antes de recuperar; forçado a 1 quando a escada é tabela. */
    galeApos: number
    /** Segurança sobre o payout real da compra anterior (0,97 = tira 3%). */
    descontoRetorno: number
    /** Piso absoluto, em dólares, do lucro exigido ao fechar a sequência. */
    lucroMinimo: number
    /** `agressivo: null` = o robô não oferece o modo agressivo. */
    modos: { conservador: ModoRecuperacao; agressivo: ModoRecuperacao | null }
    escada: EscadaConfigurada
  }
  /** Teto da plataforma para UMA entrada; 0 = sem teto. Só diminui (o menor entre este e o do cliente). */
  limites: { valorMaximoPorEntrada: number }
  /** Só no The Palm. */
  palm?: ParametrosPalm
}

/* ------------------------------------------------------------------ *
 * A SEMENTE: as constantes que os robôs sempre usaram. `parametrosPadrao`
 * lê daqui; strategies.ts também (e reexporta a tabela de recuperação para
 * quem já importava de lá).
 * ------------------------------------------------------------------ */

/**
 * Recuperação oficial de cada modelo.
 *
 * `galeApos` é quantas perdas seguidas o robô aceita no valor base antes de
 * ligar a recuperação. Em 22/09/2026 o Tiago pediu 1 em todos: "sempre
 * precisa recuperar". Antes eram 3, e uma vitória logo depois de uma perda
 * não cobria o prejuízo — no First Block, perdia 0,35 e recuperava 0,30.
 * O custo é conhecido: a escada cresce desde a primeira perda, então a
 * conta precisa de mais saldo para aguentar a mesma sequência.
 */
export const RECUPERACAO_POR_ROBO: Record<string, { galeApos: number; margem: number; agressivo?: { margem: number; sobrePrejuizo: number } }> = {
  superior5: { galeApos: 1, margem: 0.05, agressivo: { margem: 1, sobrePrejuizo: 0.2 } },
  ag2: { galeApos: 1, margem: 0.05, agressivo: { margem: 1, sobrePrejuizo: 0.2 } },
  smart03: { galeApos: 1, margem: 0.05 },
  // Goreme paga 6%: recuperar 3 perdas exigiria 52x a base, e a segunda
  // recuperacao 930x. Ligando na primeira perda a escada comeca em 18x —
  // ainda alta, porque e o payout que dita o tamanho, mas o buraco a cobrir
  // e um terco. Perda rara, recuperacao cedo.
  goreme: { galeApos: 1, margem: 0.05 },
  firstblock: { galeApos: 1, margem: 0.05 },
  secondblock: { galeApos: 1, margem: 0.05 },
  // Versões OMNI (21/09/2026): mesma recuperação dos originais, com análise antes de entrar.
  omniover: { galeApos: 1, margem: 0.05, agressivo: { margem: 1, sobrePrejuizo: 0.2 } },
  omnibull: { galeApos: 1, margem: 0.05 },
  omnibear: { galeApos: 1, margem: 0.05 },
  thepalm: { galeApos: 1, margem: 0.95 },
  superior5fixo: { galeApos: 3, margem: 0 },
}
/** Robô fora da tabela (não deveria acontecer): recupera após 3, como o motor sempre fez. */
const RECUPERACAO_DESCONHECIDA = { galeApos: 3, margem: 0.05 }

/** Loss virtual do AG7, AG2 e OMNI Over: quatro dígitos seguidos que teriam perdido. */
export const LOSSES_PARA_ENTRAR = 4
/** Loss virtual dos Blocks e do Bull/Bear: dois dígitos seguidos da outra metade. */
export const LOSSES_VIRTUAIS = 2
/** Segurança sobre o payout real: 3% para absorver a oscilação entre um contrato e o seguinte. */
export const DESCONTO_RETORNO = 0.97
/** Lucro mínimo, em dólares, ao fechar uma sequência. */
export const LUCRO_MINIMO = 0.01
/** Os limites e a conta do The Palm, como sempre foram. */
export const PALM_PADRAO: ParametrosPalm = { janela: 25, limiteNove: 12, limiteBaixos: 48, retornoInicial: 0.9233, desconto: 0.99, margem: 0.95 }

/**
 * Como cada robô entra. A família do AG7 (loss virtual de 4, segue a
 * sequência) e a dos Blocks (loss virtual de 2, analisa a cada entrada).
 * Smart 03 e Göreme entram sempre (0) — se o admin subir o número, ganham
 * a mesma análise do AG7, por isso herdam "segue a sequência".
 */
const ENTRADA_PADRAO: Record<string, { lossVirtual: number; sequenciaSemAnalise: boolean }> = {
  superior5: { lossVirtual: LOSSES_PARA_ENTRAR, sequenciaSemAnalise: true },
  ag2: { lossVirtual: LOSSES_PARA_ENTRAR, sequenciaSemAnalise: true },
  omniover: { lossVirtual: LOSSES_PARA_ENTRAR, sequenciaSemAnalise: true },
  smart03: { lossVirtual: 0, sequenciaSemAnalise: true },
  goreme: { lossVirtual: 0, sequenciaSemAnalise: true },
  firstblock: { lossVirtual: LOSSES_VIRTUAIS, sequenciaSemAnalise: false },
  secondblock: { lossVirtual: LOSSES_VIRTUAIS, sequenciaSemAnalise: false },
  omnibull: { lossVirtual: LOSSES_VIRTUAIS, sequenciaSemAnalise: false },
  omnibear: { lossVirtual: LOSSES_VIRTUAIS, sequenciaSemAnalise: false },
  thepalm: { lossVirtual: 0, sequenciaSemAnalise: false },
  superior5fixo: { lossVirtual: 0, sequenciaSemAnalise: false },
}

/**
 * O contrato de cada robô (só leitura nesta versão). É uma cópia do que
 * strategies.ts declara — a prova 1 de teste-parametros confere que as duas
 * cópias batem, para nenhuma envelhecer sozinha.
 */
const CONTRATO_PADRAO: Record<string, ParametrosDoRobo['contrato']> = {
  superior5: { contractType: 'DIGITOVER', barreira: 6 },
  ag2: { contractType: 'DIGITUNDER', barreira: 3 },
  omniover: { contractType: 'DIGITOVER', barreira: 6 },
  smart03: { contractType: 'DIGITOVER', barreira: 3 },
  goreme: { contractType: 'DIGITUNDER', barreira: 9 },
  firstblock: { contractType: 'DIGITUNDER', barreira: 5 },
  secondblock: { contractType: 'DIGITOVER', barreira: 4 },
  omnibull: { contractType: 'DIGITUNDER', barreira: 5 },
  omnibear: { contractType: 'DIGITOVER', barreira: 4 },
  thepalm: { contractType: 'DIGITUNDER', barreira: 9 },
  superior5fixo: { contractType: 'DIGITOVER', barreira: 6 },
}

/** Os robôs que têm padrão próprio (os mesmos de ESTRATEGIAS_LOCAIS). */
export const ROBOS_COM_PADRAO: readonly string[] = Object.keys(CONTRATO_PADRAO)

/** O padrão de um robô: um objeto novo a cada chamada, para ninguém alterar o de todo mundo. */
export function parametrosPadrao(id: string): ParametrosDoRobo {
  const r = RECUPERACAO_POR_ROBO[id] ?? RECUPERACAO_DESCONHECIDA
  const entrada = ENTRADA_PADRAO[id] ?? { lossVirtual: 0, sequenciaSemAnalise: false }
  const contrato = CONTRATO_PADRAO[id] ?? { contractType: 'DIGITOVER', barreira: 6 }
  const p: ParametrosDoRobo = {
    v: 1,
    entrada: { ...entrada },
    contrato: { ...contrato },
    recuperacao: {
      galeApos: r.galeApos,
      descontoRetorno: DESCONTO_RETORNO,
      lucroMinimo: LUCRO_MINIMO,
      modos: {
        conservador: { margem: r.margem, sobrePrejuizo: 0 },
        agressivo: r.agressivo ? { ...r.agressivo } : null,
      },
      escada: { tipo: 'formula' },
    },
    limites: { valorMaximoPorEntrada: 0 },
  }
  if (id === 'thepalm') p.palm = { ...PALM_PADRAO }
  return p
}

/* ------------------------------------------------------------------ *
 * Mesclar: o padrão por baixo, o gravado por cima, chave desconhecida fora.
 * ------------------------------------------------------------------ */

const ehObjeto = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x)

/** Percorre as chaves do padrão; o que o parcial não tem fica no padrão, o que ele tem a mais é ignorado. */
function mesclarObjeto<T extends Record<string, unknown>>(base: T, parcial: unknown): T {
  if (!ehObjeto(parcial)) return { ...base }
  const saida: Record<string, unknown> = { ...base }
  for (const chave of Object.keys(base)) {
    if (!(chave in parcial) || parcial[chave] === undefined) continue
    const b = base[chave], p = parcial[chave]
    saida[chave] = ehObjeto(b) && ehObjeto(p) ? mesclarObjeto(b as Record<string, unknown>, p) : p
  }
  return saida as T
}

/** Um degrau gravado: só as chaves que o formato conhece. O que vier estranho fica para `validar()` reclamar. */
function degrauLimpo(d: unknown): DegrauTabela {
  if (ehObjeto(d)) {
    if ('multiplicador' in d) return { multiplicador: d.multiplicador as number }
    if ('valor' in d) return { valor: d.valor as number }
  }
  return {} as DegrauTabela
}

/**
 * Deep-merge do padrão com o que foi gravado.
 *
 * Três chaves têm forma própria e não cabem no merge cego:
 *  - `modos.agressivo` pode ser null (desligado) — null vence;
 *  - `escada` troca de forma entre 'formula' e 'tabela' — vale a do gravado, inteira;
 *  - `palm` só existe no The Palm — num robô sem palm no padrão é ignorado.
 */
export function mesclar(padrao: ParametrosDoRobo, parcial: unknown): ParametrosDoRobo {
  const saida = mesclarObjeto(padrao as unknown as Record<string, unknown>, parcial) as unknown as ParametrosDoRobo
  const p = ehObjeto(parcial) ? parcial : {}
  const rec = ehObjeto(p.recuperacao) ? p.recuperacao : {}
  const modos = ehObjeto(rec.modos) ? rec.modos : {}
  if ('agressivo' in modos) {
    saida.recuperacao.modos.agressivo = modos.agressivo === null
      ? null
      : mesclarObjeto({ ...(padrao.recuperacao.modos.agressivo ?? { margem: 1, sobrePrejuizo: 0.2 }) } as Record<string, unknown>, modos.agressivo) as unknown as ModoRecuperacao
  } else {
    saida.recuperacao.modos.agressivo = padrao.recuperacao.modos.agressivo ? { ...padrao.recuperacao.modos.agressivo } : null
  }
  if (ehObjeto(rec.escada) && rec.escada.tipo === 'tabela') {
    saida.recuperacao.escada = {
      tipo: 'tabela',
      degraus: Array.isArray(rec.escada.degraus) ? rec.escada.degraus.map(degrauLimpo) : [],
      depoisDoUltimo: rec.escada.depoisDoUltimo as DepoisDoUltimo,
    }
  } else if (ehObjeto(rec.escada) && rec.escada.tipo === 'formula') {
    saida.recuperacao.escada = { tipo: 'formula' }
  } else {
    saida.recuperacao.escada = padrao.recuperacao.escada.tipo === 'tabela'
      ? { ...padrao.recuperacao.escada, degraus: padrao.recuperacao.escada.degraus.map((d) => ({ ...d })) }
      : { tipo: 'formula' }
  }
  if (padrao.palm) saida.palm = mesclarObjeto(padrao.palm as unknown as Record<string, unknown>, p.palm) as unknown as ParametrosPalm
  else delete (saida as { palm?: unknown }).palm
  return saida
}

/* ------------------------------------------------------------------ *
 * Validar: as mesmas faixas e as mesmas frases do gatilho SQL.
 * ------------------------------------------------------------------ */

const numero = (x: unknown): number | null => (typeof x === 'number' && Number.isFinite(x) ? x : null)
const inteiro = (x: unknown): number | null => { const n = numero(x); return n !== null && n === Math.trunc(n) ? n : null }
const fora = (n: number | null, min: number, max: number) => n === null || n < min || n > max

/**
 * Erros em português; lista vazia = válido. A ordem e os textos seguem o
 * gatilho `teeds_robos_parametros_valida` — a diferença é que o SQL para no
 * primeiro erro e aqui a lista vem inteira, para o painel apontar todos.
 *
 * `id` está reservado: nesta versão nenhuma regra depende do robô (o
 * contrato é só leitura), mas a assinatura já recebe o id para a fase em
 * que ele passar a ser editável.
 */
export function validar(p: unknown, _id?: string): string[] {
  const erros: string[] = []
  if (!ehObjeto(p)) return ['Os parâmetros do robô precisam ser um objeto.']
  const conhecidas = new Set(['v', 'entrada', 'contrato', 'recuperacao', 'limites', 'palm'])
  if (Object.keys(p).some((k) => !conhecidas.has(k))) erros.push('Há uma chave desconhecida nos parâmetros do robô.')
  if (p.v !== 1) erros.push('Formato de parâmetros desconhecido (esperado v = 1).')

  const entrada = ehObjeto(p.entrada) ? p.entrada : {}
  if (fora(inteiro(entrada.lossVirtual), 0, 12)) erros.push('Loss virtual precisa ser um número inteiro de 0 a 12.')
  if (typeof entrada.sequenciaSemAnalise !== 'boolean') erros.push('Informe se o robô segue a sequência sem nova análise (sim ou não).')

  const contrato = ehObjeto(p.contrato) ? p.contrato : {}
  const barreira = numero(contrato.barreira)
  if (contrato.contractType === 'DIGITOVER') { if (fora(barreira, 0, 8)) erros.push('A barreira do Over precisa ficar entre 0 e 8.') }
  else if (contrato.contractType === 'DIGITUNDER') { if (fora(barreira, 1, 9)) erros.push('A barreira do Under precisa ficar entre 1 e 9.') }
  else erros.push('Tipo de contrato desconhecido.')

  const rec = ehObjeto(p.recuperacao) ? p.recuperacao : {}
  if (fora(inteiro(rec.galeApos), 0, 10)) erros.push('O gatilho da recuperação precisa ser um inteiro de 0 a 10.')
  if (fora(numero(rec.descontoRetorno), 0.8, 1)) erros.push('A segurança do payout precisa ficar entre 0,80 e 1,00.')
  if (fora(numero(rec.lucroMinimo), 0.01, 1)) erros.push('O lucro mínimo em dólares precisa ficar entre 0,01 e 1,00.')
  const modos = ehObjeto(rec.modos) ? rec.modos : {}
  const conservador = ehObjeto(modos.conservador) ? modos.conservador : {}
  if (fora(numero(conservador.margem), 0, 2)) erros.push('O lucro ao fechar a sequência (conservador) precisa ficar entre 0% e 200% da entrada.')
  if (fora(numero(conservador.sobrePrejuizo), 0, 1)) erros.push('A parte do prejuízo que vira lucro precisa ficar entre 0 e 1.')
  if (!('agressivo' in modos) || modos.agressivo === undefined) erros.push('Informe o modo agressivo (um objeto ou null).')
  else if (modos.agressivo !== null) {
    const ag = ehObjeto(modos.agressivo) ? modos.agressivo : {}
    if (fora(numero(ag.margem), 0, 2)) erros.push('O lucro ao fechar a sequência (agressivo) precisa ficar entre 0% e 200% da entrada.')
    if (fora(numero(ag.sobrePrejuizo), 0, 1)) erros.push('A parte do prejuízo que vira lucro (agressivo) precisa ficar entre 0 e 1.')
  }
  const escada = ehObjeto(rec.escada) ? rec.escada : {}
  if (escada.tipo === 'tabela') {
    if (!Array.isArray(escada.degraus)) erros.push('A tabela precisa de uma lista de degraus.')
    else {
      if (escada.degraus.length < 1 || escada.degraus.length > 30) erros.push('A tabela aceita de 1 a 30 degraus.')
      for (const d of escada.degraus) {
        if (ehObjeto(d) && 'multiplicador' in d) { if (fora(numero(d.multiplicador), 1, 50)) { erros.push('Cada multiplicador precisa ficar entre 1 e 50 vezes a entrada base.'); break } }
        else if (ehObjeto(d) && 'valor' in d) { if (fora(numero(d.valor), 0.35, 10000)) { erros.push('Cada valor fixo precisa ficar entre US$ 0,35 e US$ 10.000.'); break } }
        else { erros.push('Cada degrau precisa de um multiplicador ou de um valor fixo.'); break }
      }
    }
    if (!['formula', 'repetir', 'parar'].includes(escada.depoisDoUltimo as string)) erros.push('Diga o que fazer depois do último degrau: formula, repetir ou parar.')
  } else if (escada.tipo !== 'formula') erros.push('A escada precisa ser "formula" ou "tabela".')

  const limites = ehObjeto(p.limites) ? p.limites : {}
  const teto = numero(limites.valorMaximoPorEntrada)
  if (teto === null || teto < 0 || (teto > 0 && teto < 0.35) || teto > 50000) erros.push('O teto por entrada precisa ser 0 (sem teto) ou um valor entre US$ 0,35 e US$ 50.000.')

  if (p.palm !== undefined && p.palm !== null) {
    const palm = ehObjeto(p.palm) ? p.palm : {}
    if (numero(palm.janela) !== 25) erros.push('A janela do The Palm é fixa em 25 dígitos nesta versão.')
    if (fora(numero(palm.limiteNove), 0, 100)) erros.push('O limite do dígito 9 precisa ficar entre 0% e 100%.')
    if (fora(numero(palm.limiteBaixos), 0, 100)) erros.push('O mínimo de 0 a 4 precisa ficar entre 0% e 100%.')
    if (fora(numero(palm.retornoInicial), 0.5, 1.5)) erros.push('O retorno presumido do Under 5 precisa ficar entre 0,50 e 1,50.')
    if (fora(numero(palm.desconto), 0.8, 1)) erros.push('A segurança do payout do The Palm precisa ficar entre 0,80 e 1,00.')
    if (fora(numero(palm.margem), 0, 2)) erros.push('O lucro ao fechar do The Palm precisa ficar entre 0% e 200%.')
  }
  return erros
}

/* ------------------------------------------------------------------ *
 * Leituras: o que o motor, a escada e a tela tiram do objeto.
 * ------------------------------------------------------------------ */

/**
 * O que a recuperação exige, no modo pedido. Substitui a antiga tabela
 * fixa por robô. Na tabela o degrau 1 já é a entrada após a 1ª perda, então
 * o gatilho vale 1 seja o que for que estiver gravado.
 */
export function recuperacaoDe(p: ParametrosDoRobo, modo: Modo = 'conservador'): { galeApos: number; margem: number; sobrePrejuizo: number } {
  const galeApos = p.recuperacao.escada.tipo === 'tabela' ? 1 : p.recuperacao.galeApos
  const ag = p.recuperacao.modos.agressivo
  const m = modo === 'agressivo' && ag ? ag : p.recuperacao.modos.conservador
  return { galeApos, margem: m.margem, sobrePrejuizo: m.sobrePrejuizo }
}

/** O robô oferece o modo agressivo ao cliente? */
export const temModoAgressivo = (p: ParametrosDoRobo): boolean => p.recuperacao.modos.agressivo !== null

/**
 * Uma configuração de sessão de mentira, para a escada e as prévias: entrada
 * base nos dois valores, recuperação no modo pedido, sem freios do cliente
 * (a escada é calculada até onde se pedir; quem apara é `avaliarPlano`).
 */
export function configDeReferencia(p: ParametrosDoRobo, base = 0.35, modo: Modo = 'conservador'): ConfigEstrategia {
  const rec = recuperacaoDe(p, modo)
  return {
    valorInicial: base, valorAoVencer: base,
    fatorGale: rec.margem, lucroSobrePrejuizo: rec.sobrePrejuizo, galeApos: rec.galeApos,
    valorMaximo: 0, takeProfit: 0, stopLoss: 0, maxOperacoes: 0,
    parametros: p, parametrosVersao: null, parametrosTesteDemo: false,
    modo: modo === 'agressivo' && temModoAgressivo(p) ? 'agressivo' : 'conservador',
  }
}

/** Chance de acerto de um contrato de dígito (0,3 = 3 dígitos em 10). */
export function chanceDoContrato(contrato: ParametrosDoRobo['contrato']): number {
  const tipo = TIPOS_DIGITO.find((t) => t.tipo === contrato.contractType)
  return tipo ? tipo.quantosGanham(contrato.barreira) / 10 : 0.5
}

/** Os dígitos com que o contrato ganha, em ordem. */
export function digitosQueGanham(contrato: ParametrosDoRobo['contrato']): number[] {
  const todos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  return contrato.contractType === 'DIGITOVER' ? todos.filter((d) => d > contrato.barreira) : todos.filter((d) => d < contrato.barreira)
}

/**
 * Ticks esperados até fechar um loss virtual de `n` dígitos seguidos que
 * teriam perdido, com chance `p` de o contrato ganhar: E = (1 − q^n) / ((1 − q)·q^n),
 * q = 1 − p. AG7 (p 0,3) com 4 → ~10,6 ticks; Göreme (p 0,9) com 3 → ~1.110.
 */
export function esperaMediaEmTicks(n: number, p: number): number {
  if (n <= 0) return 0
  const q = 1 - p
  if (q <= 0) return Number.POSITIVE_INFINITY
  return (1 - Math.pow(q, n)) / ((1 - q) * Math.pow(q, n))
}

/* ------------------------------------------------------------------ *
 * Avisos: o que não bloqueia, mas o admin precisa ler antes de publicar.
 * ------------------------------------------------------------------ */

const usd = (v: number) => `US$ ${v.toFixed(2).replace('.', ',')}`
const pct = (v: number) => `${String(Math.round(v * 1000) / 10).replace('.', ',')}%`
const tempoDeTicks = (ticks: number) => {
  const s = ticks * 2   // R_75 tica a cada ~2 s
  if (s < 90) return `${Math.round(s)} s`
  if (s < 5400) return `${Math.round(s / 60)} min`
  return `${(s / 3600).toFixed(1).replace('.', ',')} h`
}

const FAMILIA_AG7 = new Set(['superior5', 'ag2', 'omniover'])

/**
 * Avisos em português, sem bloquear. `escada` é opcional: quem já calculou
 * a escada do robô (escadaDoRobo) passa os degraus e ganha o aviso "não
 * cobre" — este arquivo não sabe o payout de cada robô, de propósito.
 */
export function avisos(p: ParametrosDoRobo, id: string, escada?: ReadonlyArray<{ n: number; cobre: boolean; esgotada?: boolean }>): string[] {
  const lista: string[] = []
  const chance = chanceDoContrato(p.contrato)
  const rec = p.recuperacao
  const n = p.entrada.lossVirtual
  if (n > 0) {
    const espera = esperaMediaEmTicks(n, chance)
    if (espera >= 100) lista.push(`Loss virtual ${n}: espera média de ~${Math.round(espera).toLocaleString('pt-BR')} ticks (~${tempoDeTicks(espera)}) antes de cada entrada.`)
  }
  if (rec.escada.tipo === 'formula') {
    if (rec.galeApos >= 2) lista.push(`Recuperar só a partir de ${rec.galeApos} perdas seguidas: uma vitória logo depois da perda não cobre o prejuízo — foi por isso que mudamos para 1 em 22/09.`)
    if (rec.galeApos === 3 && FAMILIA_AG7.has(id)) lista.push('Gatilho 3 reativa o ajuste da terceira entrada do AG7/AG2.')
  }
  const ag = rec.modos.agressivo
  if (ag) {
    if (chance >= 0.6) lista.push('Modo agressivo num robô de payout baixo: a escada cresce muito rápido. O teto por entrada segura, mas confira a simulação.')
    if (ag.margem > 1.5) lista.push(`Lucro ao fechar de ${pct(ag.margem)} no modo agressivo: entradas bem maiores a cada degrau.`)
  }
  if (rec.escada.tipo === 'tabela') {
    const degraus = rec.escada.degraus
    degraus.forEach((d, i) => {
      if ('valor' in d) lista.push(`Degrau ${i + 1} em valor fixo (${usd(d.valor)}): não escala com a entrada do cliente — com base ${usd(0.35)} é ${Math.round(d.valor / 0.35)}× a entrada.`)
    })
    const primeiro = degraus[0]
    if (primeiro && 'multiplicador' in primeiro && primeiro.multiplicador > 20) lista.push(`Segunda entrada de ${primeiro.multiplicador}× a base: acima de 20× logo na primeira recuperação.`)
    if (rec.escada.depoisDoUltimo === 'parar' && degraus.length < 2) lista.push('Parar com menos de 2 degraus: o robô desliga já na segunda perda seguida, muito antes do stop do cliente.')
  }
  if (escada) {
    for (const d of escada) if (!d.esgotada && !d.cobre) lista.push(`Degrau ${d.n}: ganhar nele não cobre o prejuízo acumulado até ali.`)
  }
  return lista
}

/* ------------------------------------------------------------------ *
 * Diferenças: os chips da lista e o diff do histórico, em linguagem simples.
 * ------------------------------------------------------------------ */

export interface Diferenca {
  campo: string
  /** O chip curto: "loss virtual 3", "tabela 3 degraus", "teto US$ 50,00". */
  rotulo: string
  de: string
  para: string
}

const textoDoModo = (m: ModoRecuperacao | null) => m === null ? 'desligado' : `lucro ${pct(m.margem)}${m.sobrePrejuizo > 0 ? ` + ${pct(m.sobrePrejuizo)} do prejuízo` : ''}`
const textoDaEscada = (e: EscadaConfigurada) => e.tipo === 'formula'
  ? 'calculada pelo payout'
  : `tabela ${e.degraus.length} ${e.degraus.length === 1 ? 'degrau' : 'degraus'}${e.depoisDoUltimo === 'formula' ? '' : e.depoisDoUltimo === 'repetir' ? ', depois repete o último' : ', depois para'}`
const textoDoTeto = (v: number) => v > 0 ? `teto ${usd(v)}` : 'sem teto'
const textoDoContrato = (c: ParametrosDoRobo['contrato']) => `${c.contractType === 'DIGITOVER' ? 'Over' : 'Under'} ${c.barreira}`

/** O que `p` tem de diferente de `padrao` (ou de outra versão), campo a campo. */
export function diferencas(p: ParametrosDoRobo, padrao: ParametrosDoRobo): Diferenca[] {
  const lista: Diferenca[] = []
  const compara = (campo: string, de: string, para: string, rotulo = para) => { if (de !== para) lista.push({ campo, rotulo, de, para }) }
  const lv = (n: number) => n === 0 ? 'entra sempre' : `loss virtual ${n}`
  compara('entrada.lossVirtual', lv(padrao.entrada.lossVirtual), lv(p.entrada.lossVirtual))
  compara('entrada.sequenciaSemAnalise', padrao.entrada.sequenciaSemAnalise ? 'segue a sequência' : 'analisa a cada entrada', p.entrada.sequenciaSemAnalise ? 'segue a sequência' : 'analisa a cada entrada')
  compara('contrato', textoDoContrato(padrao.contrato), textoDoContrato(p.contrato), `contrato ${textoDoContrato(p.contrato)}`)
  const a = p.recuperacao, b = padrao.recuperacao
  if (a.escada.tipo === 'formula' || b.escada.tipo === 'formula') {
    const gat = (n: number) => n <= 1 ? 'recupera desde a 1ª perda' : `recupera após ${n} perdas`
    compara('recuperacao.galeApos', gat(recuperacaoDe(padrao).galeApos), gat(recuperacaoDe(p).galeApos))
  }
  compara('recuperacao.descontoRetorno', `segurança do payout ${pct(1 - b.descontoRetorno)}`, `segurança do payout ${pct(1 - a.descontoRetorno)}`)
  compara('recuperacao.lucroMinimo', `lucro mínimo ${usd(b.lucroMinimo)}`, `lucro mínimo ${usd(a.lucroMinimo)}`)
  compara('recuperacao.modos.conservador', `conservador: ${textoDoModo(b.modos.conservador)}`, `conservador: ${textoDoModo(a.modos.conservador)}`)
  compara('recuperacao.modos.agressivo', `agressivo ${textoDoModo(b.modos.agressivo)}`, `agressivo ${textoDoModo(a.modos.agressivo)}`)
  compara('recuperacao.escada', textoDaEscada(b.escada), textoDaEscada(a.escada))
  if (a.escada.tipo === 'tabela' && b.escada.tipo === 'tabela' && JSON.stringify(a.escada.degraus) !== JSON.stringify(b.escada.degraus)) {
    const d = (e: DegrauTabela) => 'valor' in e ? usd(e.valor) : `${String(e.multiplicador).replace('.', ',')}×`
    compara('recuperacao.escada.degraus', b.escada.degraus.map(d).join(' / '), a.escada.degraus.map(d).join(' / '), `degraus ${a.escada.degraus.map(d).join(' / ')}`)
  }
  compara('limites.valorMaximoPorEntrada', textoDoTeto(padrao.limites.valorMaximoPorEntrada), textoDoTeto(p.limites.valorMaximoPorEntrada))
  if (p.palm && padrao.palm) {
    compara('palm.limiteNove', `dígito 9 até ${padrao.palm.limiteNove}%`, `dígito 9 até ${p.palm.limiteNove}%`)
    compara('palm.limiteBaixos', `0 a 4 no mínimo ${padrao.palm.limiteBaixos}%`, `0 a 4 no mínimo ${p.palm.limiteBaixos}%`)
    compara('palm.retornoInicial', `retorno presumido ${String(padrao.palm.retornoInicial).replace('.', ',')}`, `retorno presumido ${String(p.palm.retornoInicial).replace('.', ',')}`)
    compara('palm.desconto', `segurança do Palm ${pct(1 - padrao.palm.desconto)}`, `segurança do Palm ${pct(1 - p.palm.desconto)}`)
    compara('palm.margem', `lucro ao fechar do Palm ${pct(padrao.palm.margem)}`, `lucro ao fechar do Palm ${pct(p.palm.margem)}`)
  }
  return lista
}

/* ------------------------------------------------------------------ *
 * Descrever: a frase da vitrine, gerada dos parâmetros. Para o padrão ela
 * é IGUAL à descrição fixa de branding.ts (a prova 9 trava isso).
 * ------------------------------------------------------------------ */

const listaDeDigitos = (ds: number[]) => ds.length <= 1 ? ds.join('') : `${ds.slice(0, -1).join(', ')} ou ${ds[ds.length - 1]}`
const FAMILIA_BLOCKS = new Set(['firstblock', 'secondblock', 'omnibull', 'omnibear'])

export function descrever(id: string, p: ParametrosDoRobo): string {
  const n = p.entrada.lossVirtual
  const segue = p.entrada.sequenciaSemAnalise
  const digitos = digitosQueGanham(p.contrato)
  const esperaDigitos = n === 1 ? 'Espera 1 dígito que teria perdido' : `Espera ${n} dígitos seguidos que teriam perdido`
  if (id === 'thepalm') return 'Analisa 25 dígitos e alterna entre Under 9 e Under 5 com proteção virtual.'
  if (id === 'superior5fixo') return 'Entra em todas as operações com o valor sempre igual, sem progressão.'
  if (FAMILIA_AG7.has(id)) {
    if (n === 0) return `Entra em toda operação. Ganha quando o último dígito é ${listaDeDigitos(digitos)}.`
    return `${esperaDigitos} e entra; ${segue ? 'segue a sequência até fechá-la' : 'analisa de novo a cada entrada'}.`
  }
  if (FAMILIA_BLOCKS.has(id)) {
    const faixa = `Ganha de ${digitos[0]} a ${digitos[digitos.length - 1]}.`
    if (n === 0) return `${faixa} Entra em toda operação.`
    const entrada = n === 1 ? 'Entra depois de 1 loss virtual.' : `Entra depois de ${n} losses virtuais seguidos.`
    return `${faixa} ${entrada}${segue ? ' Segue a sequência até fechá-la.' : ''}`
  }
  const base = id === 'goreme'
    ? `Ganha quando o último dígito está entre ${digitos[0]} e ${digitos[digitos.length - 1]}.`
    : `Ganha quando o último dígito é ${listaDeDigitos(digitos)}.`
  if (n === 0) return base
  return `${base} ${esperaDigitos} e entra${segue ? '; segue a sequência até fechá-la' : ''}.`
}
