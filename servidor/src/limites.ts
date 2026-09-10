/**
 * As travas.
 *
 * Este arquivo existe porque uma trava escrita no texto que orienta a IA é
 * um pedido educado, e um campo editável na tela é um pedido educado ao
 * cliente. Trava de verdade é código que recusa.
 *
 * Nada aqui conhece IA, HTTP ou banco: são funções puras, que recebem
 * números e devolvem sim ou não. Isso é de propósito — assim dá para
 * conferir por linha de comando, sem subir servidor nem gastar um centavo
 * de API, que é como a gente descobre se a trava funciona antes de
 * confiar nela.
 */

export interface Limites {
  /** Maior valor permitido em cada entrada, na moeda da conta. */
  entradaMaxima: number
  /**
   * Maior stop loss permitido, como fração do saldo da conta.
   *
   * Um stop de mil dólares numa conta de dois mil não é proteção: é a
   * permissão de perder metade do dinheiro antes de alguém reagir.
   */
  fracaoDoSaldo: number
  /** Quantos robôs o cliente pode ter operando ao mesmo tempo. */
  robosSimultaneos: number
  /** Mensagens de chat por dia, por cliente. */
  mensagensPorDia: number
}

/**
 * O padrão para quem nunca teve limite ajustado.
 *
 * Deliberadamente apertado. Afrouxar um limite para um cliente é uma linha
 * no banco; explicar por que ele perdeu quinhentos dólares numa madrugada
 * não é.
 */
export const PADRAO: Limites = {
  /*
    Valor da entrada e tamanho do stop sao decisao do cliente — o risco e
    dele (10/09/2026, a pedido do Tiago). Por padrao NAO ha teto: Infinity.
    O mecanismo continua para um limite ajustado a mao para um cliente
    especifico (limitesDoCliente), que ai vale.
  */
  entradaMaxima: Infinity,
  fracaoDoSaldo: Infinity,
  robosSimultaneos: 2,
  mensagensPorDia: 30,
}

export interface Pedido {
  entrada: number
  stopLoss: number
  takeProfit: number
  /** Saldo da conta onde o robô vai operar. */
  saldo: number
  demo: boolean
  moeda: string
  /** Quantos robôs deste cliente já estão operando agora. */
  robosAtivos: number
}

export type Veredito = { ok: true } | { ok: false; motivo: string }

const din = (v: number, moeda: string) =>
  `${moeda} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * A conta é do cliente e os números cabem nos limites dele?
 *
 * Os limites de valor valem só em conta real: numa conta de demonstração
 * não há dinheiro para proteger, e travar o teste tornaria a demo inútil
 * para o que ela serve. Os limites de quantidade — robôs simultâneos —
 * valem sempre, porque protegem o servidor, não a carteira.
 *
 * O motivo da recusa volta escrito em português porque ele vai direto para
 * a tela do cliente. Ninguém deveria ver "LIMIT_EXCEEDED".
 */
export function conferir(p: Pedido, l: Limites = PADRAO): Veredito {
  if (!Number.isFinite(p.entrada) || p.entrada <= 0) {
    return { ok: false, motivo: 'O valor da entrada precisa ser maior que zero.' }
  }
  if (!Number.isFinite(p.stopLoss) || p.stopLoss <= 0) {
    return { ok: false, motivo: 'Diga em quanto de perda o robô deve parar.' }
  }
  // Meta de ganho zero = sem meta (o motor entende 0 como desligado).
  if (!Number.isFinite(p.takeProfit) || p.takeProfit < 0) {
    return { ok: false, motivo: 'A meta de ganho não pode ser negativa.' }
  }

  if (p.robosAtivos >= l.robosSimultaneos) {
    return {
      ok: false,
      motivo: l.robosSimultaneos === 1
        ? 'Você já tem um robô operando. Desligue ele antes de ligar outro.'
        : `Você já tem ${p.robosAtivos} robôs operando, que é o máximo. Desligue um antes de ligar outro.`,
    }
  }

  // Em conta de demonstração o dinheiro é fictício: o que sobra a proteger
  // é o servidor, e isso a trava de cima já fez.
  if (p.demo) return { ok: true }

  if (p.entrada > l.entradaMaxima) {
    return {
      ok: false,
      motivo: `Em conta real, o máximo por entrada é ${din(l.entradaMaxima, p.moeda)}. ` +
        `Você pediu ${din(p.entrada, p.moeda)}.`,
    }
  }

  const tetoDoStop = p.saldo * l.fracaoDoSaldo
  if (p.stopLoss > tetoDoStop) {
    return {
      ok: false,
      motivo: `Com saldo de ${din(p.saldo, p.moeda)}, o stop não pode passar de ` +
        `${din(tetoDoStop, p.moeda)} — ${Math.round(l.fracaoDoSaldo * 100)}% da conta. ` +
        `Você pediu ${din(p.stopLoss, p.moeda)}.`,
    }
  }

  // Uma entrada que sozinha estoura o stop transforma o freio em enfeite:
  // a primeira perda já passa dele.
  if (p.entrada > p.stopLoss) {
    return {
      ok: false,
      motivo: `A entrada (${din(p.entrada, p.moeda)}) é maior que o stop ` +
        `(${din(p.stopLoss, p.moeda)}). A primeira perda já passaria do freio.`,
    }
  }

  return { ok: true }
}

/**
 * Números que já passam nas travas, para o cartão de proposta nascer
 * preenchido.
 *
 * A trava aparece como sugestão, não como sermão: o cliente vê um valor
 * que faz sentido para o saldo dele em vez de um campo vazio seguido de
 * uma recusa.
 */
export function sugerir(saldo: number, demo: boolean, l: Limites = PADRAO) {
  // A sugestao usa proporcoes prudentes mesmo sem teto: e so um ponto de partida.
  const tetoEntrada = Number.isFinite(l.entradaMaxima) ? l.entradaMaxima : 5
  const fracao = Number.isFinite(l.fracaoDoSaldo) ? l.fracaoDoSaldo : 0.25
  const entrada = demo
    ? 1
    : Math.max(0.35, Math.min(tetoEntrada, arredondar(saldo * 0.005)))
  const stop = demo
    ? Math.max(entrada * 20, 20)
    : Math.max(entrada * 10, arredondar(saldo * (fracao / 2)))
  return { entrada, stopLoss: stop, takeProfit: stop }
}

const arredondar = (v: number) => Math.round(v * 100) / 100
