import './ambiente'

import { readFileSync } from 'node:fs'
import { contas, iniciar, listarRobos, parar, resumir, todas, ver } from './sessoes'
import type { AuthSession } from '../../src/core/deriv/auth'

/**
 * O servidor MCP da Teeds.
 *
 * É a ponte entre o chat (Claude, ChatGPT) e o motor dos robôs. O assistente
 * só escolhe QUAL ferramenta chamar e com quais números; quem decide o que
 * comprar, quando entrar e quando parar continua sendo o motor da Teeds.
 *
 * O que a Deriv exigiu por escrito está cumprido aqui: a autorização do
 * cliente fica neste processo e **nunca** entra numa resposta. O chat recebe
 * resultado — operações, saldo, lucro — e mais nada.
 */

const DESTINO = new URL('../.env', import.meta.url)

/** Lê a autorização do disco a cada chamada: assim renovar não exige reiniciar. */
export function autorizacao(): AuthSession {
  let bruto = ''
  try {
    bruto = readFileSync(DESTINO, 'utf8')
  } catch {
    throw new Error('O servidor ainda não tem uma conta Deriv conectada. Abra a página de login e clique em Conectar Deriv.')
  }
  const linha = bruto.split('\n').find((l) => l.startsWith('DERIV_TOKEN='))
  const token = linha?.slice('DERIV_TOKEN='.length).trim()
  if (!token) throw new Error('A conta Deriv não está conectada. Abra a página de login e autorize de novo.')
  return { accessToken: token }
}

/* ------------------------------------------------------------ ferramentas */

const FERRAMENTAS = [
  {
    name: 'listar_robos',
    description:
      'Lista os robôs da Teeds disponíveis, com a regra de cada um (quais dígitos pagam). ' +
      'Use antes de iniciar uma sessão quando a pessoa não disser qual robô quer.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'minhas_contas',
    description:
      'Lista as contas Deriv conectadas, com tipo (demonstração ou real), moeda e saldo. ' +
      'Use para confirmar em qual conta a pessoa quer operar antes de ligar um robô.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'iniciar_sessao',
    description:
      'Liga um robô da Teeds. Ele opera sozinho até bater o stop loss, o take profit ou o ' +
      'máximo de operações. Devolve na hora um identificador de sessão — NÃO espera o robô terminar. ' +
      'Stop loss e take profit são obrigatórios. ' +
      'ATENÇÃO: em conta real isto movimenta dinheiro de verdade; confirme com a pessoa antes de chamar.',
    inputSchema: {
      type: 'object',
      properties: {
        robo: { type: 'string', description: 'Identificador do robô, como aparece em listar_robos (ex.: superior5, ag2).' },
        entrada: { type: 'number', description: 'Valor de cada entrada, na moeda da conta.' },
        stop_loss: { type: 'number', description: 'Perda acumulada que encerra a sessão. Obrigatório.' },
        take_profit: { type: 'number', description: 'Ganho acumulado que encerra a sessão. Obrigatório.' },
        conta: { type: 'string', description: 'Conta Deriv a usar. Se omitida, usa a de demonstração.' },
        max_operacoes: { type: 'number', description: 'Teto de operações. 0 ou omitido = sem teto.' },
      },
      required: ['robo', 'entrada', 'stop_loss', 'take_profit'],
      additionalProperties: false,
    },
  },
  {
    name: 'status_sessao',
    description: 'Mostra como está uma sessão: operações, ganhos, perdas, resultado e se ainda está rodando.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Identificador devolvido por iniciar_sessao.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'parar_sessao',
    description: 'Desliga um robô que está rodando, sem esperar bater freio nenhum.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Identificador da sessão.' } },
      required: ['id'],
      additionalProperties: false,
    },
  },
  {
    name: 'sessoes',
    description: 'Lista as sessões de robô deste servidor — as que estão rodando e as encerradas na última hora.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
]

async function executar(nome: string, args: Record<string, any>): Promise<unknown> {
  switch (nome) {
    case 'listar_robos':
      return { robos: listarRobos(), observacao: 'Todos operam no Volatility 75 (1s), definido pela Teeds.' }

    case 'minhas_contas': {
      const lista = await contas(autorizacao())
      return {
        contas: lista.map((c) => ({
          conta: c.accountId,
          tipo: c.type === 'demo' ? 'demonstração' : 'real',
          moeda: c.currency,
          saldo: c.balance,
        })),
      }
    }

    case 'iniciar_sessao': {
      const s = await iniciar(autorizacao(), {
        roboId: String(args.robo),
        contaId: args.conta ? String(args.conta) : undefined,
        valorInicial: Number(args.entrada),
        stopLoss: Number(args.stop_loss),
        takeProfit: Number(args.take_profit),
        maxOperacoes: args.max_operacoes ? Number(args.max_operacoes) : 0,
      })
      return {
        ...resumir(s),
        aviso: s.demo
          ? 'Conta de demonstração: dinheiro fictício.'
          : 'CONTA REAL: esta sessão movimenta dinheiro de verdade.',
        como_acompanhar: `Chame status_sessao com id ${s.id}.`,
        sobre_o_stop:
          'O stop é conferido depois de cada operação, então a perda final pode passar dele — ' +
          'com o martingale ligado, a última entrada pode ser bem maior que a primeira.',
      }
    }

    case 'status_sessao': {
      const s = ver(String(args.id))
      if (!s) throw new Error(`Sessão ${args.id} não existe (ou foi encerrada há mais de uma hora).`)
      return resumir(s)
    }

    case 'parar_sessao': {
      const s = parar(String(args.id))
      return { ...resumir(s), observacao: 'Pedido de parada enviado. Uma operação já aberta ainda vai liquidar.' }
    }

    case 'sessoes':
      return { sessoes: todas().map(resumir) }

    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`)
  }
}

/* ------------------------------------------------------------- JSON-RPC */

export interface Resposta { jsonrpc: '2.0'; id?: unknown; result?: unknown; error?: { code: number; message: string } }

export async function atender(msg: any): Promise<Resposta | null> {
  const id = msg?.id
  const responder = (result: unknown): Resposta => ({ jsonrpc: '2.0', id, result })
  const falhar = (code: number, message: string): Resposta => ({ jsonrpc: '2.0', id, error: { code, message } })

  try {
    switch (msg?.method) {
      case 'initialize':
        return responder({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'teeds-motor', version: '0.1.0' },
        })

      // notificações não têm resposta
      case 'notifications/initialized':
        return null

      case 'ping':
        return responder({})

      case 'tools/list':
        return responder({ tools: FERRAMENTAS })

      case 'tools/call': {
        const nome = msg?.params?.name
        const args = msg?.params?.arguments ?? {}
        try {
          const saida = await executar(String(nome), args)
          return responder({ content: [{ type: 'text', text: JSON.stringify(saida, null, 2) }] })
        } catch (e) {
          // erro da ferramenta volta como conteúdo, não como erro de protocolo:
          // assim o assistente lê o motivo e explica, em vez de só falhar
          return responder({
            content: [{ type: 'text', text: `Não deu certo: ${(e as Error).message}` }],
            isError: true,
          })
        }
      }

      default:
        return falhar(-32601, `Método não suportado: ${msg?.method}`)
    }
  } catch (e) {
    return falhar(-32603, (e as Error).message)
  }
}
