import './ambiente'

import { TeedsSocket } from '../../src/core/deriv/client'
import { MotorTeeds, type EstadoMotor } from '../../src/core/deriv/engine'
import { fetchAccounts, fetchTradingSocketUrl, type TradingAccount } from '../../src/core/deriv/account'
import { fetchActiveSymbols } from '../../src/core/deriv/market'
import { ESTRATEGIAS_LOCAIS, recuperacaoDoRobo } from '../../src/core/deriv/strategies'
import { ATIVO_DOS_ROBOS } from '../../src/core/deriv/config'
import type { AuthSession } from '../../src/core/deriv/auth'
import type { ConfigEstrategia, Estrategia } from '../../src/core/deriv/engine'

/**
 * Uma sessão de robô rodando no servidor.
 *
 * É o mesmo `MotorTeeds` que roda no navegador do cliente — mesma regra de
 * entrada, mesmo gale depois de N perdas, mesma recuperação da sequência
 * inteira. O que muda é só quem segura a conexão: aqui é um processo Node
 * que não morre quando alguém fecha uma aba.
 */

export interface Parametros {
  roboId: string
  contaId: string
  valorInicial: number
  stopLoss: number
  takeProfit: number
  /** Teto de operações da sessão. 0 = sem teto. */
  maxOperacoes?: number
  /** Teto por entrada, para o martingale não escalar sem freio. */
  valorMaximo?: number
}

export interface Resultado {
  roboId: string
  roboNome: string
  contaId: string
  demo: boolean
  operacoes: number
  vitorias: number
  derrotas: number
  resultado: number
  movimentado: number
  motivo: string
  duracaoSegundos: number
  latenciaMedia: number | null
}

export function robo(id: string): Estrategia {
  const e = ESTRATEGIAS_LOCAIS.find((x) => x.id === id)
  if (!e) throw new Error(`Robô "${id}" não existe. Disponíveis: ${ESTRATEGIAS_LOCAIS.map((x) => x.id).join(', ')}`)
  return e
}

export function listarRobos() {
  return ESTRATEGIAS_LOCAIS.map((e) => ({ id: e.id, nome: e.nome, contrato: e.contractType, barreira: e.barreira }))
}

/**
 * Monta a configuração do motor a partir do que o cliente pediu.
 *
 * Stop loss e take profit são obrigatórios de propósito: é a regra que o
 * Tiago combinou com a Deriv — nenhuma sessão entra no ar sem os dois
 * freios definidos. Um robô sem freio, comandado por chat, é exatamente o
 * cenário que ninguém quer explicar depois.
 */
export function montarConfig(p: Parametros): ConfigEstrategia {
  if (!(p.valorInicial > 0)) throw new Error('A entrada precisa ser maior que zero.')
  if (!(p.stopLoss > 0)) throw new Error('Defina o stop loss: o robô não roda sem freio de perda.')
  if (!(p.takeProfit > 0)) throw new Error('Defina o take profit: o robô não roda sem meta de ganho.')

  const { galeApos } = recuperacaoDoRobo(p.roboId)
  return {
    valorInicial: p.valorInicial,
    valorAoVencer: p.valorInicial,
    fatorGale: 1,
    galeApos,
    valorMaximo: p.valorMaximo ?? Math.max(p.valorInicial * 50, p.stopLoss),
    takeProfit: p.takeProfit,
    stopLoss: p.stopLoss,
    maxOperacoes: p.maxOperacoes ?? 0,
  }
}

/** A conta pedida, entre as que o token enxerga. */
export async function acharConta(sessao: AuthSession, contaId?: string): Promise<TradingAccount> {
  const contas = await fetchAccounts(sessao)
  if (!contas.length) throw new Error('Este token não enxerga nenhuma conta na Deriv.')
  if (contaId) {
    const achada = contas.find((c) => c.accountId === contaId)
    if (!achada) throw new Error(`Conta ${contaId} não está entre as suas: ${contas.map((c) => c.accountId).join(', ')}`)
    return achada
  }
  return contas.find((c) => c.type === 'demo') ?? contas[0]
}

/**
 * Liga um robô e devolve o resultado quando ele parar sozinho.
 *
 * A promessa só resolve quando o motor para — por freio, por teto de
 * operações ou por desligamento. Quem chama decide o que fazer com o
 * resultado (mandar para o chat, gravar no banco, os dois).
 */
export async function rodar(
  sessao: AuthSession,
  p: Parametros,
  aoAndar?: (e: EstadoMotor) => void,
): Promise<Resultado> {
  const estrategia = robo(p.roboId)
  const config = montarConfig(p)
  const conta = await acharConta(sessao, p.contaId)

  const url = await fetchTradingSocketUrl(sessao, conta.accountId)
  // O OTP da URL é de uso único: cada reconexão precisa pedir outro.
  const socket = new TeedsSocket({
    url,
    renovarUrl: () => fetchTradingSocketUrl(sessao, conta.accountId),
  })
  socket.connect()

  // O motor precisa do pip do ativo para ler o último dígito do preço.
  const simbolos = await fetchActiveSymbols(socket)
  const alvo = simbolos.find((s) => s.symbol === ATIVO_DOS_ROBOS)
  if (!alvo) throw new Error(`A Deriv não ofereceu ${ATIVO_DOS_ROBOS} nesta conta.`)

  const motor = new MotorTeeds({
    socket,
    estrategia,
    config,
    symbol: ATIVO_DOS_ROBOS,
    moeda: conta.currency,
    pipSize: alvo.pipSize,
  })

  const comecou = Date.now()

  return new Promise<Resultado>((resolve, reject) => {
    let encerrado = false
    const terminar = (e: EstadoMotor) => {
      if (encerrado) return
      encerrado = true
      parar()
      try { socket.disconnect() } catch { /* já caiu */ }
      resolve({
        roboId: estrategia.id,
        roboNome: estrategia.nome,
        contaId: conta.accountId,
        demo: conta.type === 'demo',
        operacoes: e.operacoes,
        vitorias: e.vitorias,
        derrotas: e.derrotas,
        resultado: e.resultado,
        movimentado: e.movimentado,
        motivo: e.motivoParada ?? 'parou',
        duracaoSegundos: Math.round((Date.now() - comecou) / 1000),
        latenciaMedia: e.latenciaMedia,
      })
    }

    const parar = motor.escutar((e) => {
      aoAndar?.(e)
      // o motor avisa que parou zerando `rodando` e preenchendo o motivo
      if (!e.rodando && e.motivoParada) terminar(e)
    })

    try {
      motor.ligar()
    } catch (erro) {
      parar()
      try { socket.disconnect() } catch { /* já caiu */ }
      reject(erro as Error)
    }
  })
}
