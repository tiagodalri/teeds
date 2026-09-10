import './ambiente'

import { TeedsSocket } from '../../src/core/deriv/client'
import { fetchAccounts, fetchTradingSocketUrl, type TradingAccount } from '../../src/core/deriv/account'
import type { AuthSession } from '../../src/core/deriv/auth'
import { marcaPorId } from '../../src/marca/marcas'
import { autorizacaoDoCliente } from './cofre'
import {
  atualizarContaDeriv, clientesComAutorizacao, gravarComissoesDiarias, type ComissaoDiariaGravavel,
} from './supabase'

/**
 * Comissão calculada pelo servidor, conta a conta.
 *
 * `comissoes_diarias` é a tabela que responde "quanto a plataforma rendeu"
 * — robô e operação manual, porque nasce da tabela de lucros da Deriv e não
 * do que o robô anotou. Até aqui ela só era escrita quando alguém abria a
 * tela de Gestão no navegador; se ninguém abria, congelava (e foi o que
 * aconteceu: dias sem uma linha, com operação real acontecendo).
 *
 * Agora o servidor faz isso sozinho, de tempos em tempos, para cada cliente
 * que conectou a Deriv: lê os contratos de HOJE e de ONTEM (o dia vira em
 * UTC — ontem ainda recebe liquidação atrasada), fica só com os que passaram
 * pela app da marca e aplica a regra medida na Deriv: 3% do pagamento de
 * cada contrato. De quebra, atualiza o saldo de cada conta — é o número que
 * a Administração mostra como "saldo real conectado".
 *
 * Mesmos cuidados da coleta de extrato: só lê, uma conta por vez, só contas
 * reais, erro de um cliente não para os outros.
 */

const TAXA = 0.03
const POR_PAGINA = 500
/** 80 x 500 = 40 mil contratos num dia — o recorde até hoje foi 15.893. */
const MAX_PAGINAS = 80
/** Hoje e ontem. */
const DIAS = 2
const PAUSA_ENTRE_CONTAS_MS = 800
const PRIMEIRA_PASSADA_MS = 45_000

export interface DiaCalculado {
  dia: string
  operacoes: number
  pagamentos: number
  comissao: number
  entradas: number
  resultado: number
  truncado: boolean
}

export interface ResultadoSincronia {
  contas: number
  dias: number
  erros: number
  ignorados: number
  /** Contas que apareceram em mais de um cadastro e foram lidas uma vez só. */
  repetidas: number
}

export interface OpcoesSincronia {
  gravar: boolean
  aoLer?: (conta: TradingAccount, dias: DiaCalculado[]) => void
}

const curto = (id: string) => `${id.slice(0, 8)}…`
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Os últimos `n` dias em UTC (AAAA-MM-DD), do mais recente para o mais antigo. */
function diasRecentes(n: number): string[] {
  const hoje = new Date()
  const lista: string[] = []
  for (let i = 0; i < n; i += 1) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - i))
    lista.push(d.toISOString().slice(0, 10))
  }
  return lista
}

function janelaDoDia(dia: string): { de: number; ate: number } {
  const [a, m, d] = dia.split('-').map(Number)
  return {
    de: Math.floor(Date.UTC(a, m - 1, d, 0, 0, 0) / 1000),
    ate: Math.floor(Date.UTC(a, m - 1, d, 23, 59, 59) / 1000),
  }
}

/** Todos os contratos fechados de um dia que passaram pela app, somados. */
async function lerDia(socket: TeedsSocket, dia: string, appId: string): Promise<DiaCalculado> {
  const { de, ate } = janelaDoDia(dia)
  const soma: DiaCalculado = { dia, operacoes: 0, pagamentos: 0, comissao: 0, entradas: 0, resultado: 0, truncado: false }
  let pular = 0

  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const res = await socket.send({
      profit_table: 1,
      description: 1,
      limit: POR_PAGINA,
      offset: pular,
      date_from: String(de),
      date_to: String(ate),
      sort: 'ASC',
    })
    const linhas = ((res.profit_table as any)?.transactions ?? []) as Array<Record<string, any>>
    for (const l of linhas) {
      const pagamento = Number(l.payout ?? 0)
      // Só o que passou pela app da marca gera markup. A API de trading nova
      // nem sempre manda `app_id` na tabela de lucros (medido em 10/09/2026:
      // a linha vem sem o campo) — quando ele falta, a conta é considerada
      // da plataforma, porque é por ela que essas contas operam. É por isso
      // que o número se chama "calculado": a Deriv confirma depois.
      const daApp = l.app_id == null || String(l.app_id) === appId
      if (!daApp || !pagamento) continue
      const entrada = Number(l.buy_price ?? 0)
      const saida = Number(l.sell_price ?? 0)
      soma.operacoes += 1
      soma.pagamentos += pagamento
      soma.comissao += pagamento * TAXA
      soma.entradas += entrada
      soma.resultado += saida - entrada
    }
    if (linhas.length < POR_PAGINA) break
    pular += POR_PAGINA
    if (pagina === MAX_PAGINAS - 1) soma.truncado = true
  }
  return soma
}

/** Lê uma conta e devolve o que calculou; grava quando pedido. */
export async function sincronizarConta(
  sessao: AuthSession, userId: string, marca: string, conta: TradingAccount, opcoes: OpcoesSincronia,
): Promise<DiaCalculado[]> {
  const appId = String(sessao.appId ?? marcaPorId(marca).appId)

  // O OTP da URL é de uso único, como nos robôs: cada conexão pede o seu.
  const url = await fetchTradingSocketUrl(sessao, conta.accountId)
  const socket = new TeedsSocket({
    url,
    renovarUrl: () => fetchTradingSocketUrl(sessao, conta.accountId),
    appId: sessao.appId,
    resubscribe: false,
  })
  socket.connect()

  const dias: DiaCalculado[] = []
  try {
    for (const dia of diasRecentes(DIAS)) dias.push(await lerDia(socket, dia, appId))
  } finally {
    try { socket.disconnect() } catch { /* já caiu */ }
  }

  opcoes.aoLer?.(conta, dias)
  if (opcoes.gravar) {
    const agora = new Date().toISOString()
    const linhas: ComissaoDiariaGravavel[] = dias.map((d) => ({
      user_id: userId,
      marca,
      conta_id: conta.accountId,
      dia: d.dia,
      operacoes: d.operacoes,
      pagamentos: Number(d.pagamentos.toFixed(2)),
      comissao: Number(d.comissao.toFixed(4)),
      entradas: Number(d.entradas.toFixed(2)),
      resultado: Number(d.resultado.toFixed(2)),
      moeda: conta.currency,
      demo: conta.type === 'demo',
      atualizado_em: agora,
    }))
    await gravarComissoesDiarias(linhas)
  }
  return dias
}

/** Uma passada por todos os clientes que conectaram a Deriv. */
export async function sincronizarTudo(opcoes: OpcoesSincronia = { gravar: true }): Promise<ResultadoSincronia> {
  const r: ResultadoSincronia = { contas: 0, dias: 0, erros: 0, ignorados: 0, repetidas: 0 }
  const clientes = await clientesComAutorizacao()
  // A mesma conta Deriv pode estar ligada a dois cadastros da mesma marca.
  // Lida duas vezes, a comissão dela contaria em dobro — então uma vez só.
  const feitas = new Set<string>()

  for (const { user_id: userId, marca } of clientes) {
    const cofre = await autorizacaoDoCliente(userId)
    if (cofre.tipo !== 'ok') {
      r.ignorados++
      continue
    }

    let contas: TradingAccount[]
    try {
      contas = await fetchAccounts(cofre.sessao)
    } catch (e) {
      r.erros++
      console.error(`[comissoes] cliente ${curto(userId)}: não consegui listar as contas — ${(e as Error).message}`)
      continue
    }

    for (const conta of contas.filter((c) => c.type !== 'demo')) {
      try {
        // o saldo é barato (veio na lista) e é o que a Administração mostra
        if (opcoes.gravar) {
          await atualizarContaDeriv({
            userId, marca, contaId: conta.accountId, tipo: conta.type,
            moeda: conta.currency, saldo: conta.balance,
          })
        }
        const chave = `${marca}:${conta.accountId}`
        if (feitas.has(chave)) {
          r.repetidas++
          continue
        }
        feitas.add(chave)
        r.contas++
        const dias = await sincronizarConta(cofre.sessao, userId, marca, conta, opcoes)
        r.dias += dias.length
      } catch (e) {
        r.erros++
        console.error(`[comissoes] ${conta.accountId} (cliente ${curto(userId)}): ${(e as Error).message}`)
      }
      await pausa(PAUSA_ENTRE_CONTAS_MS)
    }
  }
  return r
}

/**
 * Liga a sincronia periódica. Devolve a função que desliga.
 * Uma passada por vez: se a anterior ainda roda quando o relógio bate, esta é pulada.
 */
export function ligarSincronizadorDeComissoes(intervaloMs: number): () => void {
  let ocupado = false
  const passo = async () => {
    if (ocupado) return
    ocupado = true
    const comecou = Date.now()
    try {
      const r = await sincronizarTudo({ gravar: true })
      const seg = Math.round((Date.now() - comecou) / 1000)
      console.log(
        `[comissoes] passada em ${seg}s · ${r.contas} conta(s)` +
        (r.repetidas ? ` · ${r.repetidas} repetida(s)` : '') +
        (r.erros ? ` · ${r.erros} erro(s)` : '') +
        (r.ignorados ? ` · ${r.ignorados} cliente(s) sem autorização válida` : ''),
      )
    } catch (e) {
      console.warn('[comissoes] a passada não completou:', (e as Error).message)
    } finally {
      ocupado = false
    }
  }
  const timer = setInterval(() => { void passo() }, intervaloMs)
  const primeira = setTimeout(() => { void passo() }, PRIMEIRA_PASSADA_MS)
  return () => { clearInterval(timer); clearTimeout(primeira) }
}
