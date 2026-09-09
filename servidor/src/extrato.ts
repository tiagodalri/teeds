import './ambiente'

import { TeedsSocket } from '../../src/core/deriv/client'
import { fetchAccounts, fetchTradingSocketUrl, type TradingAccount } from '../../src/core/deriv/account'
import { buscarExtrato, type Movimento } from '../../src/core/deriv/statement'
import type { AuthSession } from '../../src/core/deriv/auth'
import { autorizacaoDoCliente } from './cofre'
import {
  anotarColetaDeExtrato, atualizarContaDeriv, clientesComAutorizacao, gravarMovimentacoes,
  ultimaMovimentacaoDaConta, type MovimentacaoGravavel,
} from './supabase'

/**
 * Depósitos e saques dos clientes, lidos do extrato da Deriv.
 *
 * A Deriv não avisa quando alguém deposita. O que existe é o extrato da
 * conta, o mesmo que a tela "Extrato" já mostra ao cliente — e nele cada
 * depósito e cada saque aparece como uma linha. Este módulo lê esse extrato
 * de tempos em tempos, para cada cliente que conectou a Deriv, e guarda só
 * as linhas de entrada e saída de dinheiro.
 *
 * Quatro cuidados, porque isto mexe com a autorização do cliente:
 *
 *  1. Só lê. A autorização é a mesma que opera os robôs, mas aqui ela é
 *     usada num pedido de leitura (`statement`) e em nada mais.
 *  2. Uma conta por vez, com pausa entre elas. A Deriv limita conexões
 *     por app e os robôs já usam a mesma cota — a coleta não pode disputar.
 *  3. Só contas reais. Depósito em conta de demonstração é crédito fictício
 *     e só faria barulho no total do dia.
 *  4. Erro de um cliente não para os outros. Fica anotado em
 *     `extrato_coletas`, e a Administração mostra.
 *
 * O cursor é o próprio banco: a próxima coleta começa da última movimentação
 * guardada, com folga. Linha repetida a chave primária descarta.
 */

const PAGINA = 200
/** 5.000 linhas por tipo numa passada: mais que isso é conta fora do comum. */
const MAX_PAGINAS = 25
/** A primeira coleta de uma conta olha um mês para trás. */
const JANELA_INICIAL_DIAS = 30
/** Recolhe com sobra; a chave primária descarta o que já estava guardado. */
const FOLGA_HORAS = 48
const PAUSA_ENTRE_CONTAS_MS = 800
/** Espera o servidor assentar antes da primeira passada. */
const PRIMEIRA_PASSADA_MS = 90_000

export interface ResultadoColeta {
  /** Contas reais visitadas. */
  contas: number
  /** Movimentações que não estavam no banco. */
  novas: number
  erros: number
  /** Clientes pulados por autorização quebrada ou vencida. */
  ignorados: number
}

export interface OpcoesColeta {
  /** `false` só lê e mostra: nada vai para o banco. */
  gravar: boolean
  /** Chamado com o que cada conta devolveu — a passada manual imprime. */
  aoLer?: (conta: TradingAccount, linhas: MovimentacaoGravavel[]) => void
  /** Só para carga inicial manual; a rotina periódica permanece leve (30 dias). */
  janelaInicialDias?: number
}

/** Um pedaço do identificador, o bastante para achar no log sem expor o cliente. */
const curto = (id: string) => `${id.slice(0, 8)}…`
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Todos os depósitos (ou saques) da conta desde `de`, página a página.
 *
 * O recorte por data é o caminho normal. Se a Deriv recusar o parâmetro,
 * lê sem recorte e corta aqui — devagar, mas certo.
 */
async function lerMovimentos(
  socket: TeedsSocket, tipo: 'deposit' | 'withdrawal', de: number,
): Promise<Movimento[]> {
  const tudo: Movimento[] = []
  let recorteNaDeriv = true
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    let lote: { movimentos: Movimento[]; total: number }
    try {
      lote = await buscarExtrato(socket, {
        limite: PAGINA, pular: pagina * PAGINA, tipo, ...(recorteNaDeriv ? { de } : {}),
      })
    } catch (e) {
      const msg = (e as Error).message
      if (recorteNaDeriv && /date_from|InputValidation/i.test(msg)) {
        recorteNaDeriv = false
        pagina -= 1
        continue
      }
      throw e
    }
    const uteis = recorteNaDeriv ? lote.movimentos : lote.movimentos.filter((m) => m.quando >= de)
    tudo.push(...uteis)
    const acabou = lote.movimentos.length < PAGINA
      || tudo.length >= lote.total
      || (!recorteNaDeriv && uteis.length < lote.movimentos.length)
    if (acabou) break
  }
  return tudo
}

/** Lê uma conta e devolve o que encontrou; grava quando pedido. */
export async function coletarConta(
  sessao: AuthSession, userId: string, marca: string, conta: TradingAccount, opcoes: OpcoesColeta,
): Promise<{ lidas: number; novas: number }> {
  const ultima = await ultimaMovimentacaoDaConta(conta.accountId)
  const agora = Math.floor(Date.now() / 1000)
  // Uma janela informada manualmente força a releitura histórica. Sem ela,
  // o coletor periódico continua incremental a partir da última linha.
  const de = opcoes.janelaInicialDias
    ? agora - Math.max(1, opcoes.janelaInicialDias) * 86400
    : ultima
      ? Math.floor(ultima.getTime() / 1000) - FOLGA_HORAS * 3600
      : agora - JANELA_INICIAL_DIAS * 86400

  // O OTP da URL é de uso único, como nos robôs: cada conexão pede o seu.
  const url = await fetchTradingSocketUrl(sessao, conta.accountId)
  const socket = new TeedsSocket({
    url,
    renovarUrl: () => fetchTradingSocketUrl(sessao, conta.accountId),
    appId: sessao.appId,
    resubscribe: false,
  })
  socket.connect()

  let movimentos: Movimento[]
  try {
    movimentos = [
      ...await lerMovimentos(socket, 'deposit', de),
      ...await lerMovimentos(socket, 'withdrawal', de),
    ]
  } finally {
    try { socket.disconnect() } catch { /* já caiu */ }
  }

  const linhas: MovimentacaoGravavel[] = movimentos
    .filter((m) => m.tipo === 'deposit' || m.tipo === 'withdrawal')
    .map((m) => ({
      conta_id: conta.accountId,
      transacao_id: m.id,
      user_id: userId,
      marca,
      tipo: m.tipo as 'deposit' | 'withdrawal',
      // O sentido mora em `tipo`; o valor fica sempre positivo para somar direto.
      valor: Math.abs(m.valor),
      moeda: conta.currency,
      saldo_depois: Number.isFinite(m.saldoDepois) ? m.saldoDepois : null,
      descricao: m.descricao || null,
      ocorrida_em: new Date(m.quando * 1000).toISOString(),
      demo: conta.type === 'demo',
    }))

  opcoes.aoLer?.(conta, linhas)
  const novas = opcoes.gravar ? await gravarMovimentacoes(linhas) : linhas.length
  return { lidas: linhas.length, novas }
}

/** Uma passada por todos os clientes que conectaram a Deriv. */
export async function coletarTudo(opcoes: OpcoesColeta = { gravar: true }): Promise<ResultadoColeta> {
  const r: ResultadoColeta = { contas: 0, novas: 0, erros: 0, ignorados: 0 }
  const clientes = await clientesComAutorizacao()

  for (const { user_id: userId, marca } of clientes) {
    const cofre = await autorizacaoDoCliente(userId)
    if (cofre.tipo !== 'ok') {
      // O cofre já explicou no log. O cliente resolve em Conectar Deriv.
      r.ignorados++
      continue
    }

    let contas: TradingAccount[]
    try {
      contas = await fetchAccounts(cofre.sessao)
    } catch (e) {
      r.erros++
      console.error(`[extrato] cliente ${curto(userId)}: não consegui listar as contas — ${(e as Error).message}`)
      continue
    }

    for (const conta of contas.filter((c) => c.type !== 'demo')) {
      r.contas++
      try {
        if (opcoes.gravar) {
          await atualizarContaDeriv({
            userId, marca, contaId: conta.accountId, tipo: conta.type,
            moeda: conta.currency, saldo: conta.balance,
          })
        }
        const { lidas, novas } = await coletarConta(cofre.sessao, userId, marca, conta, opcoes)
        r.novas += novas
        if (opcoes.gravar) {
          await anotarColetaDeExtrato({ contaId: conta.accountId, userId, marca, ok: true }).catch(() => {})
          if (novas) console.log(`[extrato] ${conta.accountId}: ${novas} movimentação(ões) nova(s) de ${lidas} lida(s)`)
        }
      } catch (e) {
        r.erros++
        const erro = (e as Error).message
        console.error(`[extrato] ${conta.accountId} (cliente ${curto(userId)}): ${erro}`)
        if (opcoes.gravar) {
          await anotarColetaDeExtrato({ contaId: conta.accountId, userId, marca, ok: false, erro }).catch(() => {})
        }
      }
      await pausa(PAUSA_ENTRE_CONTAS_MS)
    }
  }
  return r
}

/**
 * Liga a coleta periódica. Devolve a função que desliga.
 *
 * Uma passada por vez: se a anterior ainda estiver rodando quando o relógio
 * bater, esta é pulada. Passadas empilhadas abririam conexões em paralelo
 * na Deriv — exatamente o que a coleta promete não fazer.
 */
export function ligarColetorDeExtrato(intervaloMs: number): () => void {
  let ocupado = false
  const passo = async () => {
    if (ocupado) return
    ocupado = true
    const comecou = Date.now()
    try {
      const r = await coletarTudo({ gravar: true })
      const seg = Math.round((Date.now() - comecou) / 1000)
      console.log(
        `[extrato] passada em ${seg}s · ${r.contas} conta(s) · ${r.novas} nova(s)` +
        (r.erros ? ` · ${r.erros} erro(s)` : '') +
        (r.ignorados ? ` · ${r.ignorados} cliente(s) sem autorização válida` : ''),
      )
    } catch (e) {
      // Banco fora do ar por um instante: a próxima passada tenta de novo.
      console.warn('[extrato] a passada não completou:', (e as Error).message)
    } finally {
      ocupado = false
    }
  }
  const timer = setInterval(() => { void passo() }, intervaloMs)
  const primeira = setTimeout(() => { void passo() }, PRIMEIRA_PASSADA_MS)
  return () => { clearInterval(timer); clearTimeout(primeira) }
}
