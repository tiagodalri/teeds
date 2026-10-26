/**
 * A máquina do Laboratório de IA: executa uma receita (receita.ts) dígito a
 * dígito. A fita ao vivo e a simulação chamam a MESMA função `passo`, então o
 * que a simulação conta é exatamente o que a tela mostra acontecendo.
 *
 * A escada não tem conta própria: chama `proximaEntrada` (recuperacao.ts), a
 * mesma função que o motor usa nos robôs de dígito, com a segurança de 3%
 * sobre o pagamento e o lucro mínimo de sempre.
 *
 * Tempo: a compra feita no tick i é decidida pelo dígito do tick i + duração.
 * Liquidou, o robô pode comprar de novo no mesmo tick (como a "entrada
 * contínua" do motor), e a próxima compra vale para os ticks seguintes.
 *
 * Puro: sem React, sem rede, sem relógio.
 */
import { proximaEntrada } from '../deriv/recuperacao'
import { parametrosPadrao } from '../deriv/parametros'
import type { ConfigEstrategia } from '../deriv/engine'
import { ENTRADA_MINIMA } from '../deriv/escada'
import { chanceTeorica, cumpre, ganha, type Contrato, type Fase, type Gatilho, type Receita } from './receita'

export type NomeDaFase = 'base' | 'recuperacao'

export interface Operacao {
  fase: NomeDaFase
  contrato: Contrato
  valor: number
  faltam: number
  /** Em que tick (contagem da máquina) a compra foi feita. */
  noTick: number
}

export interface Estado {
  tick: number
  fase: NomeDaFase
  /** Os últimos dígitos (o mais novo no fim), para os gatilhos. */
  historico: number[]
  /** Já entrou e segue sem analisar até ganhar. */
  emSequencia: boolean
  aberta: Operacao | null
  perdasSeguidas: number
  /** Soma das perdas da sequência atual, em positivo. */
  prejuizo: number
  /** O valor da próxima compra. */
  valor: number
}

export type Evento =
  | { tipo: 'espera'; fase: NomeDaFase; progresso: Progresso }
  | { tipo: 'aguarda'; fase: NomeDaFase; faltam: number }
  | { tipo: 'entra'; fase: NomeDaFase; valor: number; contrato: Contrato }
  | { tipo: 'ganhou'; fase: NomeDaFase; valor: number; lucro: number }
  | { tipo: 'perdeu'; fase: NomeDaFase; valor: number; lucro: number; proximoValor: number; vaiPara: NomeDaFase }
  | { tipo: 'desistiu'; fase: NomeDaFase; valor: number; lucro: number; prejuizo: number }

/** Quanto falta para o gatilho disparar, para a tela desenhar. */
export interface Progresso { atual: number; alvo: number; texto: string }

export interface Ambiente {
  /** A entrada base, em dólar. */
  base: number
  /** Quanto o contrato devolve por US$ 1 (o pagamento total, com a entrada). */
  porDolar: (c: Contrato) => number
}

const HISTORICO = 600

export function estadoInicial(base: number): Estado {
  return { tick: 0, fase: 'base', historico: [], emSequencia: false, aberta: null, perdasSeguidas: 0, prejuizo: 0, valor: base }
}

export const faseAtiva = (r: Receita, nome: NomeDaFase): Fase => (nome === 'recuperacao' && r.recuperacao ? r.recuperacao : r.base)

/* ------------------------------------------------------------------ gatilhos */

/** Dígitos seguidos, do mais novo para trás, que cumprem `ok`. */
function seguidosNoFim(h: number[], ok: (d: number) => boolean, limite: number): number {
  let n = 0
  for (let i = h.length - 1; i >= 0 && n < limite; i--) { if (!ok(h[i])) break; n++ }
  return n
}

export function avaliarGatilho(g: Gatilho, contrato: Contrato, h: number[]): { dispara: boolean; progresso: Progresso } {
  switch (g.tipo) {
    case 'sempre':
      return { dispara: true, progresso: { atual: 1, alvo: 1, texto: 'entra a cada tick' } }
    case 'lossVirtual': {
      const n = seguidosNoFim(h, (d) => !ganha(contrato, d), g.n)
      return { dispara: n >= g.n, progresso: { atual: n, alvo: g.n, texto: `${n} de ${g.n} que teriam perdido` } }
    }
    case 'sequencia': {
      const n = seguidosNoFim(h, (d) => cumpre(g.condicao, d), g.n)
      return { dispara: n >= g.n, progresso: { atual: n, alvo: g.n, texto: `${n} de ${g.n} seguidos` } }
    }
    case 'ausencia': {
      let n = 0
      for (let i = h.length - 1; i >= 0 && n < g.n; i--) { if (h[i] === g.digito) break; n++ }
      return { dispara: n >= g.n && h.length >= g.n, progresso: { atual: n, alvo: g.n, texto: `o ${g.digito} sumiu há ${n} de ${g.n} ticks` } }
    }
    case 'frequencia': {
      const janela = h.slice(-g.janela)
      const pct = janela.length ? (janela.filter((d) => cumpre(g.condicao, d)).length / janela.length) * 100 : 100
      const cheia = janela.length >= g.janela
      return { dispara: cheia && pct < g.pct, progresso: { atual: Math.round(pct), alvo: g.pct, texto: cheia ? `${pct.toFixed(0)}% agora (entra abaixo de ${g.pct}%)` : `juntando dígitos: ${janela.length} de ${g.janela}` } }
    }
  }
}

/* ------------------------------------------------------------------ a escada (a mesma do motor) */

function configDaEscada(r: Receita, base: number): ConfigEstrategia {
  const padrao = parametrosPadrao('superior5')
  return {
    valorInicial: base, valorAoVencer: base, fatorGale: r.escada.margem, galeApos: r.escada.recuperarApos,
    lucroSobrePrejuizo: r.escada.sobrePrejuizo, valorMaximo: 0, takeProfit: 0, stopLoss: 0, maxOperacoes: 0,
    parametros: { ...padrao, recuperacao: { ...padrao.recuperacao, galeApos: r.escada.recuperarApos, escada: { tipo: 'formula' } } },
  }
}

/** O valor da próxima compra depois de uma perda (antes do gatilho da recuperação, repete a base). */
export function valorDepoisDaPerda(r: Receita, base: number, perdasSeguidas: number, prejuizo: number, proximoContrato: Contrato, porDolar: (c: Contrato) => number): number {
  const v = proximaEntrada({
    ganhou: false, valorAoVencer: base, perdasSeguidas, prejuizoDaSequencia: prejuizo,
    retornoLiquidoPorUnidade: Math.max(0.01, porDolar(proximoContrato) - 1), config: configDaEscada(r, base),
  })
  return Math.max(ENTRADA_MINIMA, Number.isFinite(v) ? v : base)
}

/* ------------------------------------------------------------------ um tick */

/**
 * Avança a máquina um dígito. Muda `e` no lugar (a simulação roda milhares de
 * ticks) e devolve o que aconteceu neste tick, na ordem.
 */
export function passo(r: Receita, e: Estado, d: number, amb: Ambiente): Evento[] {
  const eventos: Evento[] = []
  e.tick++
  e.historico.push(d)
  if (e.historico.length > HISTORICO) e.historico.splice(0, e.historico.length - HISTORICO)

  // 1) a compra aberta liquida?
  if (e.aberta) {
    e.aberta.faltam--
    if (e.aberta.faltam > 0) { eventos.push({ tipo: 'aguarda', fase: e.aberta.fase, faltam: e.aberta.faltam }); return eventos }
    const op = e.aberta
    e.aberta = null
    if (ganha(op.contrato, d)) {
      const lucro = round2(op.valor * (amb.porDolar(op.contrato) - 1))
      eventos.push({ tipo: 'ganhou', fase: op.fase, valor: op.valor, lucro })
      e.perdasSeguidas = 0; e.prejuizo = 0; e.valor = amb.base; e.fase = 'base'; e.emSequencia = false
    } else {
      e.perdasSeguidas++
      e.prejuizo = round2(e.prejuizo + op.valor)
      if (r.escada.desistirApos > 0 && e.perdasSeguidas >= r.escada.desistirApos) {
        eventos.push({ tipo: 'desistiu', fase: op.fase, valor: op.valor, lucro: -op.valor, prejuizo: e.prejuizo })
        e.perdasSeguidas = 0; e.prejuizo = 0; e.valor = amb.base; e.fase = 'base'; e.emSequencia = false
      } else {
        const vaiPara: NomeDaFase = r.recuperacao && e.perdasSeguidas >= r.escada.recuperarApos ? 'recuperacao' : 'base'
        e.fase = vaiPara
        e.valor = valorDepoisDaPerda(r, amb.base, e.perdasSeguidas, e.prejuizo, faseAtiva(r, vaiPara).contrato, amb.porDolar)
        e.emSequencia = r.seguirSemAnalise
        eventos.push({ tipo: 'perdeu', fase: op.fase, valor: op.valor, lucro: -op.valor, proximoValor: e.valor, vaiPara })
      }
    }
  }

  // 2) entra agora?
  const f = faseAtiva(r, e.fase)
  const seguindo = e.emSequencia && e.fase === 'base'
  const { dispara, progresso } = avaliarGatilho(f.gatilho, f.contrato, e.historico)
  if (seguindo || dispara) {
    e.aberta = { fase: e.fase, contrato: f.contrato, valor: e.valor, faltam: f.contrato.ticks, noTick: e.tick }
    eventos.push({ tipo: 'entra', fase: e.fase, valor: e.valor, contrato: f.contrato })
  } else if (!eventos.length) {
    eventos.push({ tipo: 'espera', fase: e.fase, progresso })
  }
  return eventos
}

const round2 = (v: number) => Math.round(v * 100) / 100

/* ------------------------------------------------------------------ pagamento */

/*
  Antes da cotação da Deriv chegar, uma estimativa pela chance teórica. A
  tabela medida do motor (escada.ts) diz quanto volta por US$ 1 em cada
  chance: 30% → 2,92; 50% → 1,85; 60% → 1,56; 90% → 1,06. Entre os pontos,
  a parte que volta (chance × pagamento) cresce devagar, de 0,88 a 0,96.
*/
const PONTOS: Array<[number, number]> = [[0.1, 0.86], [0.3, 0.8768], [0.5, 0.9225], [0.6, 0.9346], [0.9, 0.9554]]
export function porDolarEstimado(c: Contrato): number {
  const p = chanceTeorica(c)
  if (p <= 0) return 1
  let fator = PONTOS[PONTOS.length - 1][1]
  for (let i = 0; i < PONTOS.length - 1; i++) {
    const [p0, f0] = PONTOS[i], [p1, f1] = PONTOS[i + 1]
    if (p <= p1) { fator = p <= p0 ? f0 : f0 + ((p - p0) / (p1 - p0)) * (f1 - f0); break }
  }
  return Math.round((fator / p) * 10000) / 10000
}
