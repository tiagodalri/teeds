import './ambiente'

import { randomBytes } from 'node:crypto'
import { TeedsSocket } from '../../src/core/deriv/client'
import { MotorTeeds, type EstadoMotor } from '../../src/core/deriv/engine'
import { fetchAccounts, fetchTradingSocketUrl, type TradingAccount } from '../../src/core/deriv/account'
import { fetchActiveSymbols } from '../../src/core/deriv/market'
import { ESTRATEGIAS_LOCAIS, recuperacaoDoRobo } from '../../src/core/deriv/strategies'
import { ATIVO_DOS_ROBOS } from '../../src/core/deriv/config'
import type { AuthSession } from '../../src/core/deriv/auth'
import type { ConfigEstrategia, Estrategia } from '../../src/core/deriv/engine'
import {
  abrirSessao, encerrarSessao, registrarOperacao, supabaseConfigurado,
  type SessaoGravada,
} from './supabase'

/**
 * As sessões de robô que estão vivas no servidor.
 *
 * A diferença para o `teste.ts` é o tempo: lá a chamada só volta quando o
 * robô para. Aqui `iniciar` devolve na hora um identificador, e o robô
 * segue operando sozinho. É o que o chat precisa — a pessoa manda ligar,
 * recebe "ligado", e pergunta o resultado quando quiser.
 *
 * Tudo vive na memória deste processo. Se ele reiniciar, as sessões morrem
 * junto: um robô sem ninguém acompanhando é pior que um robô parado.
 */

export interface Parametros {
  roboId: string
  contaId?: string
  valorInicial: number
  stopLoss: number
  takeProfit: number
  maxOperacoes?: number
  valorMaximo?: number
  /**
   * A configuração inteira, quando quem pede já sabe o que quer.
   *
   * O chat manda só os três números que uma pessoa fala em voz alta
   * (entrada, stop, meta) e o resto vem do padrão do robô. A tela da Teeds
   * é outra história: ali a pessoa escolhe recuperação, teto por entrada e
   * quantas operações no máximo. Se o servidor remontasse a configuração a
   * partir dos três números, a tela mentiria — mostraria um ajuste e o
   * robô rodaria com outro.
   */
  config?: ConfigEstrategia
  /** De onde veio o comando: muda só o rótulo que aparece no histórico. */
  origem?: 'navegador' | 'chat' | 'api'
}

export interface Sessao {
  id: string
  roboId: string
  roboNome: string
  contaId: string
  demo: boolean
  moeda: string
  parametros: Parametros
  comecouEm: number
  terminouEm: number | null
  estado: EstadoMotor
  erro: string | null
  /** A linha desta sessão no Supabase, quando o banco está configurado. */
  gravada: SessaoGravada | null
}

const vivas = new Map<string, Sessao>()
const motores = new Map<string, { motor: MotorTeeds; socket: TeedsSocket }>()

/** Sessões encerradas somem depois disto — o chat não precisa de arquivo morto. */
const GUARDAR_ENCERRADA_MS = 60 * 60_000

export function robo(id: string): Estrategia {
  const e = ESTRATEGIAS_LOCAIS.find((x) => x.id === id)
  if (!e) throw new Error(`Robô "${id}" não existe. Disponíveis: ${ESTRATEGIAS_LOCAIS.map((x) => x.id).join(', ')}`)
  return e
}

export function listarRobos() {
  return ESTRATEGIAS_LOCAIS.map((e) => ({
    id: e.id,
    nome: e.nome,
    contrato: e.contractType,
    barreira: e.barreira,
    ganhaQuando: descreverRegra(e),
    ativo: ATIVO_DOS_ROBOS,
  }))
}

/** A regra do robô em uma frase, para o chat não falar em código. */
function descreverRegra(e: Estrategia): string {
  const b = e.barreira ?? 5
  if (e.contractType === 'DIGITOVER') {
    const digitos = Array.from({ length: 9 - b }, (_, i) => b + 1 + i)
    return `o último dígito do preço é ${digitos.join(', ')}`
  }
  if (e.contractType === 'DIGITUNDER') {
    const digitos = Array.from({ length: b }, (_, i) => i)
    return `o último dígito do preço é ${digitos.join(', ')}`
  }
  return e.contractType
}

/**
 * Monta a configuração do motor.
 *
 * Stop loss e take profit são obrigatórios de propósito — é a regra que o
 * Tiago combinou com a Deriv, e a única defesa contra alguém pedir "liga o
 * robô aí" no chat sem dizer onde parar.
 */
export function montarConfig(p: Parametros): ConfigEstrategia {
  if (!(p.valorInicial > 0)) throw new Error('A entrada precisa ser maior que zero.')
  if (!(p.stopLoss > 0)) throw new Error('Defina o stop loss: nenhuma sessão roda sem freio de perda.')
  if (!(p.takeProfit > 0)) throw new Error('Defina o take profit: nenhuma sessão roda sem meta de ganho.')

  // Configuração inteira vinda da tela: os dois freios continuam obrigatórios
  // aqui também — a regra combinada com a Deriv não tem porta dos fundos.
  if (p.config) {
    const c = p.config
    if (!(c.valorInicial > 0)) throw new Error('A entrada precisa ser maior que zero.')
    if (!(c.stopLoss > 0)) throw new Error('Defina o stop loss: nenhuma sessão roda sem freio de perda.')
    if (!(c.takeProfit > 0)) throw new Error('Defina o take profit: nenhuma sessão roda sem meta de ganho.')
    return {
      valorInicial: c.valorInicial,
      valorAoVencer: c.valorAoVencer > 0 ? c.valorAoVencer : c.valorInicial,
      fatorGale: Math.max(0, c.fatorGale),
      galeApos: Math.max(0, Math.trunc(c.galeApos)),
      valorMaximo: c.valorMaximo > 0 ? c.valorMaximo : Math.max(c.valorInicial * 50, c.stopLoss),
      takeProfit: c.takeProfit,
      stopLoss: c.stopLoss,
      maxOperacoes: Math.max(0, Math.trunc(c.maxOperacoes ?? 0)),
    }
  }

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

export async function contas(sessao: AuthSession): Promise<TradingAccount[]> {
  return fetchAccounts(sessao)
}

async function acharConta(sessao: AuthSession, contaId?: string): Promise<TradingAccount> {
  const lista = await fetchAccounts(sessao)
  if (!lista.length) throw new Error('Esta autorização não enxerga nenhuma conta na Deriv.')
  if (contaId) {
    const achada = lista.find((c) => c.accountId === contaId)
    if (!achada) throw new Error(`Conta ${contaId} não está entre as suas: ${lista.map((c) => c.accountId).join(', ')}`)
    return achada
  }
  return lista.find((c) => c.type === 'demo') ?? lista[0]
}

/** Liga um robô e devolve na hora. Ele segue operando até bater um freio. */
export async function iniciar(auth: AuthSession, p: Parametros): Promise<Sessao> {
  const estrategia = robo(p.roboId)
  const config = montarConfig(p)
  const conta = await acharConta(auth, p.contaId)

  const url = await fetchTradingSocketUrl(auth, conta.accountId)
  const socket = new TeedsSocket({
    url,
    renovarUrl: () => fetchTradingSocketUrl(auth, conta.accountId),
  })
  socket.connect()

  const simbolos = await fetchActiveSymbols(socket)
  const alvo = simbolos.find((s) => s.symbol === ATIVO_DOS_ROBOS)
  if (!alvo) {
    socket.disconnect()
    throw new Error(`A Deriv não ofereceu ${ATIVO_DOS_ROBOS} nesta conta.`)
  }

  const motor = new MotorTeeds({
    socket, estrategia, config,
    symbol: ATIVO_DOS_ROBOS,
    moeda: conta.currency,
    pipSize: alvo.pipSize,
  })

  const id = randomBytes(6).toString('hex')
  const sessao: Sessao = {
    id,
    roboId: estrategia.id,
    roboNome: estrategia.nome,
    contaId: conta.accountId,
    demo: conta.type === 'demo',
    moeda: conta.currency,
    parametros: p,
    comecouEm: Date.now(),
    terminouEm: null,
    estado: {} as EstadoMotor,
    erro: null,
    gravada: null,
  }

  // A sessão aparece no banco ANTES da primeira entrada: assim a tela do
  // cliente mostra o robô ligado desde o primeiro instante, e não só depois
  // que a primeira operação liquida.
  if (supabaseConfigurado()) {
    try {
      sessao.gravada = await abrirSessao({
        sessaoRef: id,
        contaId: conta.accountId,
        roboId: estrategia.id,
        roboNome: estrategia.nome,
        ativo: ATIVO_DOS_ROBOS,
        entrada: config.valorInicial,
        stopLoss: config.stopLoss,
        takeProfit: config.takeProfit,
        maxOperacoes: config.maxOperacoes,
        origem: p.origem ?? 'chat',
      })
    } catch (e) {
      // o robô não deixa de operar porque o espelho falhou
      console.warn(`[sessao ${id}] não consegui abrir no Supabase: ${(e as Error).message}`)
    }
  }

  let jaGravadas = 0
  motor.escutar((e) => {
    const anterior = sessao.estado
    sessao.estado = e

    // operação nova fechou: espelha no banco, uma vez só
    if (sessao.gravada && e.historico && e.historico.length > jaGravadas) {
      const novas = e.historico.slice(0, e.historico.length - jaGravadas).reverse()
      jaGravadas = e.historico.length
      for (const op of novas) {
        void registrarOperacao(
          sessao.gravada,
          {
            contractId: op.contractId,
            contaId: conta.accountId,
            roboId: estrategia.id,
            roboNome: estrategia.nome,
            ativo: ATIVO_DOS_ROBOS,
            tipoContrato: estrategia.contractType,
            demo: conta.type === 'demo',
            moeda: conta.currency,
            entrada: op.valor,
            pagamento: op.payout,
            resultado: op.lucro,
            ganhou: op.ganhou,
            markupDeriv: op.markupDeriv ?? null,
            executadaEm: new Date(op.quando).toISOString(),
            seq: op.n,
            precoEntrada: op.entrada,
            digitoEntrada: op.digitoEntrada,
            precoSaida: op.saida,
            digitoSaida: op.digitoSaida,
            acumulado: Number(e.resultado.toFixed(2)),
          },
          {
            operacoes: e.operacoes,
            ganhas: e.vitorias,
            perdidas: e.derrotas,
            resultado: e.resultado,
            movimentado: e.movimentado,
            proximaEntrada: e.valorAtual,
          },
        )
      }
    }
    void anterior

    if (!e.rodando && e.motivoParada && sessao.terminouEm === null) {
      sessao.terminouEm = Date.now()
      try { socket.disconnect() } catch { /* já caiu */ }
      motores.delete(id)
      if (sessao.gravada) void encerrarSessao(sessao.gravada, { motivo: e.motivoParada })
      setTimeout(() => vivas.delete(id), GUARDAR_ENCERRADA_MS).unref?.()
      console.log(`[sessao ${id}] parou: ${e.motivoParada} · ${e.operacoes} operações · ${e.resultado.toFixed(2)}`)
    }
  })

  vivas.set(id, sessao)
  motores.set(id, { motor, socket })

  try {
    motor.ligar()
  } catch (erro) {
    sessao.erro = (erro as Error).message
    sessao.terminouEm = Date.now()
    try { socket.disconnect() } catch { /* já caiu */ }
    motores.delete(id)
    if (sessao.gravada) void encerrarSessao(sessao.gravada, { motivo: 'falhou ao ligar', erro: sessao.erro })
    throw erro
  }

  console.log(`[sessao ${id}] ${estrategia.nome} · ${conta.accountId} · entrada ${p.valorInicial} · stop ${p.stopLoss} · gain ${p.takeProfit}`)
  return sessao
}

export function ver(id: string): Sessao | undefined {
  return vivas.get(id)
}

export function todas(): Sessao[] {
  return [...vivas.values()].sort((a, b) => b.comecouEm - a.comecouEm)
}

export function parar(id: string): Sessao {
  const sessao = vivas.get(id)
  if (!sessao) throw new Error(`Sessão ${id} não existe (ou já foi encerrada há mais de uma hora).`)
  const vivo = motores.get(id)
  if (!vivo) return sessao
  vivo.motor.desligar('você pediu para parar')
  return sessao
}

/** O resumo de uma sessão, do jeito que o chat vai ler em voz alta. */
export function resumir(s: Sessao) {
  const e = s.estado ?? ({} as EstadoMotor)
  const rodando = !!e.rodando
  return {
    id: s.id,
    robo: s.roboNome,
    conta: `${s.contaId} (${s.demo ? 'demonstração' : 'REAL'})`,
    situacao: s.erro ? 'falhou' : rodando ? 'rodando' : 'encerrada',
    operacoes: e.operacoes ?? 0,
    ganhas: e.vitorias ?? 0,
    perdidas: e.derrotas ?? 0,
    entrada_atual: e.valorAtual ?? s.parametros.valorInicial,
    resultado: Number((e.resultado ?? 0).toFixed(2)),
    movimentado: Number((e.movimentado ?? 0).toFixed(2)),
    moeda: s.moeda,
    stop_loss: s.parametros.stopLoss,
    take_profit: s.parametros.takeProfit,
    motivo_da_parada: e.motivoParada ?? null,
    erro: s.erro,
    duracao_segundos: Math.round(((s.terminouEm ?? Date.now()) - s.comecouEm) / 1000),
    ultima_operacao: e.historico?.[0]
      ? {
          resultado: Number(e.historico[0].lucro.toFixed(2)),
          entrada: e.historico[0].valor,
          digito: e.historico[0].digitoSaida,
          ganhou: e.historico[0].ganhou,
        }
      : null,
  }
}
