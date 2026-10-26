/**
 * Laboratório de IA (26/10/2026, Tiago: "construir um robô diretamente pela
 * plataforma... tão intuitivo que até uma criança de 8 anos saberia").
 *
 * A RECEITA é o robô inteiro descrito como dados: o que a tela monta, o
 * banco guarda (lab_receitas) e a máquina (maquina.ts) executa tick a tick.
 * A mesma receita roda na fita ao vivo e na simulação; quando o motor ganhar
 * o intérprete, será este mesmo arquivo do lado do servidor.
 *
 * Duas fases, como o Göreme: a BASE (a operação normal) e a RECUPERAÇÃO
 * (opcional: outra compra, que entra depois de uma perda). Cada fase tem um
 * gatilho (quando entrar) e um contrato (o que comprar).
 *
 * Puro: sem React, sem rede. Só dígitos 0–9.
 */
import type { DigitContract } from '../deriv/digits'

/* ------------------------------------------------------------------ peças */

/** Uma condição sobre UM dígito (para sequências e frequência). */
export type Condicao =
  | { tipo: 'menor'; digito: number }
  | { tipo: 'maior'; digito: number }
  | { tipo: 'igual'; digito: number }
  | { tipo: 'diferente'; digito: number }
  | { tipo: 'par' }
  | { tipo: 'impar' }

/** Quando a fase entra. */
export type Gatilho =
  /** Entra a cada tick, sem análise. */
  | { tipo: 'sempre' }
  /** Loss virtual: N dígitos seguidos que teriam PERDIDO o contrato desta fase. */
  | { tipo: 'lossVirtual'; n: number }
  /** N dígitos seguidos que cumprem a condição. */
  | { tipo: 'sequencia'; n: number; condicao: Condicao }
  /** O dígito X não aparece há N ticks. */
  | { tipo: 'ausencia'; digito: number; n: number }
  /** Nos últimos `janela` dígitos, os que cumprem a condição são MENOS de `pct`%. */
  | { tipo: 'frequencia'; condicao: Condicao; janela: number; pct: number }

export interface Contrato {
  tipo: DigitContract
  /** O dígito da barreira (Acima de, Abaixo de, Igual a, Diferente de). Par/Ímpar não usam. */
  digito: number
  /** Duração em ticks (1 a 10). */
  ticks: number
}

export interface Fase {
  gatilho: Gatilho
  contrato: Contrato
}

/** O que a escada faz depois de uma perda. */
export interface Escada {
  /** Perdas seguidas no valor de entrada antes de começar a recuperar (1 = recupera desde a 1ª). */
  recuperarApos: number
  /** Lucro exigido ao fechar a sequência, como fração da entrada (0,05 = 5%). */
  margem: number
  /** Parte do prejuízo que vira lucro exigido (0 = conservador; 0,2 = agressivo). */
  sobrePrejuizo: number
  /** Desiste depois de N perdas seguidas: volta ao valor de entrada e aceita a perda. 0 = nunca. */
  desistirApos: number
}

export interface Receita {
  v: 1
  nome: string
  /** Uma frase sobre o que o robô faz (aparece na biblioteca e, um dia, na vitrine). */
  resumo: string
  base: Fase
  /** null = recupera na mesma compra da base. */
  recuperacao: Fase | null
  /** Depois de entrar, segue entrando (sem analisar) até ganhar. */
  seguirSemAnalise: boolean
  /** Depois de perder e esgotar a recuperação... (ver Escada.desistirApos) */
  escada: Escada
}

/* ------------------------------------------------------------------ regras dos dígitos */

export const NOME_DO_CONTRATO: Record<DigitContract, string> = {
  DIGITOVER: 'Acima de', DIGITUNDER: 'Abaixo de', DIGITMATCH: 'Igual a', DIGITDIFF: 'Diferente de', DIGITEVEN: 'Par', DIGITODD: 'Ímpar',
}
export const usaDigito = (t: DigitContract) => t !== 'DIGITEVEN' && t !== 'DIGITODD'
/** Os dígitos que a Deriv aceita como barreira em cada tipo. */
export const DIGITOS_VALIDOS: Record<DigitContract, number[]> = {
  DIGITOVER: [0, 1, 2, 3, 4, 5, 6, 7, 8], DIGITUNDER: [1, 2, 3, 4, 5, 6, 7, 8, 9],
  DIGITMATCH: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], DIGITDIFF: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], DIGITEVEN: [], DIGITODD: [],
}

/** O contrato ganha com este dígito? */
export function ganha(c: Contrato, d: number): boolean {
  switch (c.tipo) {
    case 'DIGITOVER': return d > c.digito
    case 'DIGITUNDER': return d < c.digito
    case 'DIGITMATCH': return d === c.digito
    case 'DIGITDIFF': return d !== c.digito
    case 'DIGITEVEN': return d % 2 === 0
    case 'DIGITODD': return d % 2 === 1
  }
}
/** Os dígitos com que o contrato ganha (para pintar a fita e a chance teórica). */
export const digitosQueGanham = (c: Contrato) => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].filter((d) => ganha(c, d))
/** Chance teórica: cada dígito tem 10% no longo prazo. */
export const chanceTeorica = (c: Contrato) => digitosQueGanham(c).length / 10

export function cumpre(cond: Condicao, d: number): boolean {
  switch (cond.tipo) {
    case 'menor': return d < cond.digito
    case 'maior': return d > cond.digito
    case 'igual': return d === cond.digito
    case 'diferente': return d !== cond.digito
    case 'par': return d % 2 === 0
    case 'impar': return d % 2 === 1
  }
}

/* ------------------------------------------------------------------ em português */

export function textoCondicao(c: Condicao, plural = true): string {
  switch (c.tipo) {
    case 'menor': return `${plural ? 'menores' : 'menor'} que ${c.digito}`
    case 'maior': return `${plural ? 'maiores' : 'maior'} que ${c.digito}`
    case 'igual': return `${plural ? 'iguais' : 'igual'} a ${c.digito}`
    case 'diferente': return `${plural ? 'diferentes' : 'diferente'} de ${c.digito}`
    case 'par': return plural ? 'pares' : 'par'
    case 'impar': return plural ? 'ímpares' : 'ímpar'
  }
}
export const textoContrato = (c: Contrato) =>
  `${NOME_DO_CONTRATO[c.tipo]}${usaDigito(c.tipo) ? ` ${c.digito}` : ''}`
export const textoTicks = (n: number) => `${n} ${n === 1 ? 'tick' : 'ticks'}`

export function textoGatilho(g: Gatilho, contrato: Contrato): string {
  switch (g.tipo) {
    case 'sempre': return 'a cada tick, sem esperar'
    case 'lossVirtual': return `depois de ${g.n} ${g.n === 1 ? 'dígito que teria perdido' : 'dígitos seguidos que teriam perdido'} (${textoContrato(contrato)})`
    case 'sequencia': return `depois de ${g.n} ${g.n === 1 ? 'dígito' : 'dígitos seguidos'} ${textoCondicao(g.condicao, g.n !== 1)}`
    case 'ausencia': return `quando o ${g.digito} não aparece há ${g.n} ticks`
    case 'frequencia': return `quando os dígitos ${textoCondicao(g.condicao)} forem menos de ${g.pct}% dos últimos ${g.janela}`
  }
}

/** A receita inteira como frases curtas, na ordem de leitura. */
export function frases(r: Receita): string[] {
  const l = [`Entra ${textoGatilho(r.base.gatilho, r.base.contrato)}.`, `Compra ${textoContrato(r.base.contrato)} por ${textoTicks(r.base.contrato.ticks)}.`]
  if (r.recuperacao) l.push(`Se perder, troca para ${textoContrato(r.recuperacao.contrato)} (${textoTicks(r.recuperacao.contrato.ticks)}) e entra ${textoGatilho(r.recuperacao.gatilho, r.recuperacao.contrato)}.`)
  else l.push(`Se perder, recupera na mesma compra${r.seguirSemAnalise ? ', sem esperar o sinal de novo' : ', esperando o sinal de novo'}.`)
  l.push(`Se ganhar, volta ao começo e ao valor de entrada.`)
  if (r.escada.desistirApos > 0) l.push(`Depois de ${r.escada.desistirApos} perdas seguidas, desiste da sequência e volta ao valor de entrada.`)
  return l
}

/* ------------------------------------------------------------------ começo e modelos */

export const ESCADA_PADRAO: Escada = { recuperarApos: 1, margem: 0.05, sobrePrejuizo: 0, desistirApos: 0 }

export function receitaNova(): Receita {
  return {
    v: 1, nome: 'Meu robô', resumo: '',
    base: { gatilho: { tipo: 'sequencia', n: 3, condicao: { tipo: 'menor', digito: 3 } }, contrato: { tipo: 'DIGITOVER', digito: 2, ticks: 1 } },
    recuperacao: { gatilho: { tipo: 'sempre' }, contrato: { tipo: 'DIGITOVER', digito: 6, ticks: 1 } },
    seguirSemAnalise: true,
    escada: { ...ESCADA_PADRAO },
  }
}

/** Os robôs da casa escritos como receita: ponto de partida para copiar e mexer. */
export const MODELOS: Array<{ id: string; nome: string; receita: Receita }> = [
  {
    id: 'ag7', nome: 'Dígitos altos, loss virtual 4',
    receita: {
      v: 1, nome: 'Altos com loss virtual', resumo: 'Espera 4 dígitos que teriam perdido e entra nos dígitos altos.',
      base: { gatilho: { tipo: 'lossVirtual', n: 4 }, contrato: { tipo: 'DIGITOVER', digito: 6, ticks: 1 } },
      recuperacao: null, seguirSemAnalise: true, escada: { ...ESCADA_PADRAO },
    },
  },
  {
    id: 'ag2', nome: 'Dígitos baixos, loss virtual 4',
    receita: {
      v: 1, nome: 'Baixos com loss virtual', resumo: 'Espera 4 dígitos que teriam perdido e entra nos dígitos baixos.',
      base: { gatilho: { tipo: 'lossVirtual', n: 4 }, contrato: { tipo: 'DIGITUNDER', digito: 3, ticks: 1 } },
      recuperacao: null, seguirSemAnalise: true, escada: { ...ESCADA_PADRAO },
    },
  },
  {
    id: 'goreme', nome: 'Troca de lado',
    receita: {
      v: 1, nome: 'Troca de lado', resumo: 'Opera de 0 a 8 a cada tick; perdeu, recupera nos dígitos altos.',
      base: { gatilho: { tipo: 'sempre' }, contrato: { tipo: 'DIGITUNDER', digito: 9, ticks: 1 } },
      recuperacao: { gatilho: { tipo: 'sempre' }, contrato: { tipo: 'DIGITOVER', digito: 6, ticks: 1 } },
      seguirSemAnalise: true, escada: { ...ESCADA_PADRAO },
    },
  },
  {
    id: 'blocks', nome: 'Metade de baixo',
    receita: {
      v: 1, nome: 'Metade de baixo', resumo: 'Depois de 2 dígitos altos seguidos, compra Abaixo de 5.',
      base: { gatilho: { tipo: 'sequencia', n: 2, condicao: { tipo: 'maior', digito: 4 } }, contrato: { tipo: 'DIGITUNDER', digito: 5, ticks: 1 } },
      recuperacao: null, seguirSemAnalise: false, escada: { ...ESCADA_PADRAO },
    },
  },
]

/* ------------------------------------------------------------------ conferência */

/** O que impede a receita de rodar, em português. Vazio = pode rodar. */
export function problemas(r: Receita): string[] {
  const l: string[] = []
  const conferir = (f: Fase, nome: string) => {
    const c = f.contrato
    if (usaDigito(c.tipo) && !DIGITOS_VALIDOS[c.tipo].includes(c.digito)) l.push(`${nome}: a Deriv não aceita ${NOME_DO_CONTRATO[c.tipo]} ${c.digito}.`)
    if (c.ticks < 1 || c.ticks > 10) l.push(`${nome}: a duração vai de 1 a 10 ticks.`)
    if (digitosQueGanham(c).length === 0) l.push(`${nome}: esse contrato não ganha com nenhum dígito.`)
    const g = f.gatilho
    if ((g.tipo === 'lossVirtual' || g.tipo === 'sequencia') && (g.n < 1 || g.n > 20)) l.push(`${nome}: a sequência vai de 1 a 20 dígitos.`)
    if (g.tipo === 'ausencia' && (g.n < 2 || g.n > 200)) l.push(`${nome}: a ausência vai de 2 a 200 ticks.`)
    if (g.tipo === 'frequencia' && (g.janela < 10 || g.janela > 500 || g.pct <= 0 || g.pct >= 100)) l.push(`${nome}: a frequência pede janela de 10 a 500 e porcentagem entre 1 e 99.`)
  }
  if (!r.nome.trim()) l.push('Dê um nome ao robô.')
  conferir(r.base, 'Base')
  if (r.recuperacao) conferir(r.recuperacao, 'Recuperação')
  if (r.escada.recuperarApos < 1 || r.escada.recuperarApos > 10) l.push('A recuperação começa entre a 1ª e a 10ª perda.')
  if (r.escada.margem < 0 || r.escada.margem > 2) l.push('A margem de lucro vai de 0% a 200%.')
  return l
}

/** Uma chave curta do contrato (para guardar as cotações). */
export const chaveDoContrato = (c: Contrato) => `${c.tipo}:${usaDigito(c.tipo) ? c.digito : '-'}:${c.ticks}`
