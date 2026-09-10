import './ambiente'

import Anthropic from '@anthropic-ai/sdk'
import { autorizacao } from './mcp'
import { autorizacaoParaOperar } from './cofre'
import { contas, listarRobos, parar, resumir, todas, ver } from './sessoes'
import { contasDoUsuario, limitesDoCliente, registrarGastoDoChat, usoDeHojeDoChat } from './supabase'
import { PADRAO, conferir, sugerir, type Limites } from './limites'

/**
 * O chat da Teeds.
 *
 * É a terceira porta para o mesmo motor. A primeira é o botão da tela, a
 * segunda é o MCP que o Claude de fora usa, e esta é o cliente conversando
 * em português dentro da própria plataforma. As três chamam as mesmas
 * funções de `sessoes.ts`; se algum dia elas divergirem, alguma coisa deu
 * errado no caminho.
 *
 * Duas regras moldam este arquivo inteiro:
 *
 *  1. A chave da IA nunca sai daqui. Se a plataforma chamasse a Anthropic
 *     do navegador, qualquer pessoa abriria as ferramentas do navegador,
 *     copiaria a chave e passaria a gastar na conta do Tiago.
 *
 *  2. A IA propõe, o servidor executa. Não existe ferramenta de ligar robô
 *     nesta lista — a mais parecida é `propor_sessao`, que não liga nada:
 *     devolve um cartão para a tela desenhar. Quem liga é o dedo do
 *     cliente, na rota que o botão da tela já usa. Nenhum robô nasce de uma
 *     frase interpretada.
 */

/**
 * Haiku 4.5: escolhido pelo Tiago sabendo do custo.
 *
 * A maioria esmagadora das mensagens é "liga o AG2" e "como estão meus
 * robôs" — não precisa do modelo mais caro. O que segura os erros de
 * interpretação não é o tamanho do modelo, são as travas em `limites.ts`.
 */
const MODELO = 'claude-haiku-4-5'

/** Quantas idas e voltas de ferramenta antes de desistir de uma pergunta. */
const MAX_VOLTAS = 5

/**
 * Só as últimas mensagens vão para a IA.
 *
 * A conversa inteira é reenviada a cada turno, então histórico longo custa
 * dinheiro em toda mensagem e não ajuda: ninguém pergunta sobre o que
 * disse há quarenta trocas. Seis é o bastante para "e o outro?" fazer
 * sentido.
 */
const MEMORIA = 6

const INSTRUCOES = `Você é o assistente da Teeds, plataforma de operações na corretora Deriv.
O cliente fala com você dentro da plataforma, em português do Brasil.

Responda em duas ou três linhas, direto, sem jargão e sem empolgação de vendedor.
Quando o cliente perde dinheiro, informe: não comemore nem console.

Nunca:
- prometa resultado, ganho ou probabilidade de sucesso;
- diga que um robô "está quente" ou "vai virar" — robôs não têm fase;
- sugira aumentar a entrada depois de uma perda;
- invente número. Todo valor que você disser veio de uma ferramenta desta conversa.
  Se não sabe, diga que não sabe e chame a ferramenta.

Ligar robô:
- Você não liga. Chame propor_sessao e a tela mostra um cartão para o cliente clicar.
- Chame propor_sessao direto: ela descobre conta, saldo e sugere os valores sozinha.
- Se ela recusar, explique em uma linha o motivo devolvido. Não tente contornar.`

/* ------------------------------------------------------------ ferramentas */

const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: 'listar_robos',
    description: 'Os robôs da Teeds e a regra de cada um.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'minhas_contas',
    description: 'As contas Deriv deste cliente: tipo, moeda e saldo.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'sessoes',
    description: 'Os robôs deste cliente operando agora e os encerrados há pouco.',
    input_schema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'status_sessao',
    description: 'Como está uma sessão.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'], additionalProperties: false,
    },
  },
  {
    name: 'parar_sessao',
    description: 'Desliga um robô. Uma operação já aberta ainda liquida.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'], additionalProperties: false,
    },
  },
  {
    name: 'propor_sessao',
    description: 'Monta o cartão de ligar um robô. NÃO liga: quem liga é o clique do cliente. ' +
      'Descobre conta e saldo sozinha, e sugere os valores se você não passar.',
    input_schema: {
      type: 'object',
      properties: {
        robo: { type: 'string', description: 'Id do robô (ex.: ag2, superior5).' },
        conta: { type: 'string', description: 'Conta Deriv. Omitida = a de demonstração.' },
        entrada: { type: 'number' },
        stop_loss: { type: 'number' },
        take_profit: { type: 'number' },
      },
      required: ['robo'], additionalProperties: false,
    },
  },
]

/** A proposta que a tela desenha. Números daqui, nunca do texto da IA. */
export interface Proposta {
  roboId: string
  roboNome: string
  regra: string
  contaId: string
  demo: boolean
  moeda: string
  saldo: number
  entrada: number
  stopLoss: number
  takeProfit: number
}

interface Dono { id: string; somenteDemo?: boolean }

/** As contas Deriv que são deste cliente E que a autorização enxerga. */
async function contasDele(dono: Dono) {
  const minhas = await contasDoUsuario(dono.id)
  // A mesma regra da rota /api/sessao: a autorizacao do proprio cliente, e a
  // do servidor so quando o cofre esta vazio. Uma conta que a autorizacao nao
  // enxerga nao entra na lista, entao o chat nunca fala de conta alheia.
  const cofre = await autorizacaoParaOperar(dono.id, autorizacao)
  if (!cofre.ok) throw new Error(cofre.motivo)
  const lista = await contas(cofre.sessao)
  return lista.filter((c) => minhas.includes(c.accountId) && (!dono.somenteDemo || c.type === 'demo'))
}

/**
 * Uma sessão só é dele se roda numa conta que está no login dele.
 *
 * A mesma regra da rota `/api/sessao`. Sem ela, bastaria a IA repetir um
 * número de sessão que apareceu numa conversa para desligar o robô de
 * outra pessoa.
 */
async function sessaoDele(dono: Dono, id: string) {
  const s = ver(id)
  if (!s) return null
  const minhas = await contasDoUsuario(dono.id)
  return minhas.includes(s.contaId) ? s : null
}

async function limitesDe(dono: Dono): Promise<Limites> {
  const ajuste = await limitesDoCliente(dono.id)
  return { ...PADRAO, ...(ajuste ?? {}) }
}

/** Quantos robôs deste cliente estão operando agora. */
async function robosAtivos(dono: Dono): Promise<number> {
  const minhas = await contasDoUsuario(dono.id)
  return todas().filter((s) => minhas.includes(s.contaId) && s.estado?.rodando).length
}

async function executar(
  dono: Dono, nome: string, args: any, guardar: (p: Proposta) => void,
): Promise<unknown> {
  switch (nome) {
    case 'listar_robos':
      return { robos: listarRobos(), observacao: 'Todos operam no Volatility 75 (1s), definido pela Teeds.' }

    case 'minhas_contas': {
      const lista = await contasDele(dono)
      if (!lista.length) return { contas: [], observacao: 'Nenhuma conta Deriv está ligada a este login da Teeds.' }
      return {
        contas: lista.map((c) => ({
          conta: c.accountId,
          tipo: c.type === 'demo' ? 'demonstração' : 'real',
          moeda: c.currency,
          saldo: c.balance,
        })),
      }
    }

    case 'sessoes': {
      const minhas = await contasDoUsuario(dono.id)
      return { sessoes: todas().filter((s) => minhas.includes(s.contaId)).map(resumir) }
    }

    case 'status_sessao': {
      const s = await sessaoDele(dono, String(args.id))
      if (!s) throw new Error(`Sessão ${args.id} não é sua ou não existe mais.`)
      return resumir(s)
    }

    case 'parar_sessao': {
      const s = await sessaoDele(dono, String(args.id))
      if (!s) throw new Error(`Sessão ${args.id} não é sua ou não existe mais.`)
      parar(s.id)
      return { ...resumir(s), observacao: 'Pedido de parada enviado. Uma operação já aberta ainda vai liquidar.' }
    }

    case 'propor_sessao': {
      const roboId = String(args.robo ?? '')
      const ficha = listarRobos().find((r) => r.id === roboId)
      if (!ficha) throw new Error(`Robô "${roboId}" não existe. Chame listar_robos para ver os que existem.`)

      const disponiveis = await contasDele(dono)
      if (!disponiveis.length) throw new Error('Nenhuma conta Deriv está ligada a este login da Teeds.')
      const conta = args.conta
        ? disponiveis.find((c) => c.accountId === String(args.conta))
        : (disponiveis.find((c) => c.type === 'demo') ?? disponiveis[0])
      if (!conta) throw new Error(`A conta ${args.conta} não está no login deste cliente.`)

      const limites = await limitesDe(dono)
      const sugestao = sugerir(conta.balance, conta.type === 'demo', limites)
      const entrada = Number(args.entrada ?? sugestao.entrada)
      const stopLoss = Number(args.stop_loss ?? sugestao.stopLoss)
      const takeProfit = Number(args.take_profit ?? sugestao.takeProfit)

      const veredito = conferir({
        entrada, stopLoss, takeProfit,
        saldo: conta.balance, demo: conta.type === 'demo', moeda: conta.currency,
        robosAtivos: await robosAtivos(dono),
      }, limites)

      // Recusa não é erro de programa: é resposta. Volta como conteúdo para
      // a IA explicar em português, e nenhum cartão é desenhado.
      if (!veredito.ok) return { recusado: true, motivo: veredito.motivo }

      const proposta: Proposta = {
        roboId, roboNome: ficha.nome, regra: ficha.ganhaQuando,
        contaId: conta.accountId, demo: conta.type === 'demo',
        moeda: conta.currency, saldo: conta.balance,
        entrada, stopLoss, takeProfit,
      }
      guardar(proposta)
      return {
        proposto: true,
        ...proposta,
        observacao: 'O cartão já está na tela do cliente. Diga em uma linha o que ele vai ligar e ' +
          'que os valores são editáveis. Não repita todos os números.',
      }
    }

    default:
      throw new Error(`Ferramenta desconhecida: ${nome}`)
  }
}

/* ------------------------------------------------------------------ a rota */

export interface Turno { papel: 'cliente' | 'assistente'; texto: string }

export interface Resposta {
  texto: string
  proposta?: Proposta
  /** Quantas mensagens o cliente já gastou hoje, e de quantas. */
  uso: { hoje: number; teto: number }
}

let cliente: Anthropic | null = null
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('O chat ainda não está configurado neste servidor.')
  }
  if (!cliente) cliente = new Anthropic()
  return cliente
}

/**
 * Uma pergunta do cliente, do começo ao fim.
 *
 * O laço das ferramentas roda aqui, no servidor. A IA nunca executa nada:
 * ela devolve o nome de uma ferramenta, este arquivo executa, e o resultado
 * volta para ela em texto. É por isso que a autorização da Deriv nunca
 * entra numa resposta — ela não passa por aqui, fica dentro de `sessoes.ts`.
 */
export async function conversar(
  dono: Dono, historico: Turno[], pergunta: string, marca = 'teeds',
): Promise<Resposta> {
  const limites = await limitesDe(dono)
  // O custo do chat é contado por plataforma: o da OMNI não some no da Teeds.
  const hoje = await usoDeHojeDoChat(dono.id, marca)
  if (hoje >= limites.mensagensPorDia) {
    return {
      texto: `Você chegou ao limite de ${limites.mensagensPorDia} mensagens por hoje. ` +
        'Os robôs continuam operando normalmente — o limite é só da conversa. Amanhã zera.',
      uso: { hoje, teto: limites.mensagensPorDia },
    }
  }

  const mensagens: Anthropic.MessageParam[] = historico
    .slice(-MEMORIA)
    .map((t) => ({ role: t.papel === 'cliente' ? 'user' : 'assistant', content: t.texto }))
  mensagens.push({ role: 'user', content: pergunta })

  let proposta: Proposta | undefined

  /*
    O que esta mensagem consumiu.
    
    Sem isto, o custo do chat só apareceria na fatura — quando já foi gasto.
    A resposta da API diz exatamente quantos tokens foram; era só não jogar
    fora. `cache` é a coluna que responde, com número medido, se vale ligar o
    desconto de repetição: enquanto ela ficar em zero, o desconto não pegou.
  */
  const gasto = { entrada: 0, saida: 0, cache: 0, idas: 0 }
  const anotar = () => {
    console.log(
      `[chat] cliente ${dono.id.slice(0, 8)}… · ${gasto.idas} ida(s) · ` +
      `entrada ${gasto.entrada} · saida ${gasto.saida} · cache ${gasto.cache}`)
    void registrarGastoDoChat(dono.id, gasto, marca)
  }

  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    let resposta: Anthropic.Message
    try {
      resposta = await anthropic().messages.create({
        model: MODELO,
        max_tokens: 1024,
        system: INSTRUCOES,
        tools: FERRAMENTAS,
        messages: mensagens,
      })
    } catch (e) {
      /*
        O cliente não tem nada a ver com a nossa conta.

        Sem isto, um erro de faturamento da Anthropic chegava cru na tela
        dele — JSON, código 400 e um pedido em inglês para comprar crédito.
        Isso é problema da Teeds, não dele. O motivo real fica no registro
        do servidor, que é onde alguém pode agir sobre ele.
      */
      console.error(`[chat] a IA recusou: ${(e as Error).message}`)
      if (gasto.idas > 0) anotar()
      return {
        texto: 'O assistente está indisponível agora. Seus robôs continuam ' +
          'operando normalmente, e a tela de Robôs mostra tudo.',
        proposta,
        uso: { hoje, teto: limites.mensagensPorDia },
      }
    }

    const u = resposta.usage
    gasto.idas += 1
    gasto.entrada += u.input_tokens ?? 0
    gasto.saida += u.output_tokens ?? 0
    gasto.cache += u.cache_read_input_tokens ?? 0

    if (resposta.stop_reason !== 'tool_use') {
      const texto = resposta.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text).join('\n').trim()
      anotar()
      return { texto, proposta, uso: { hoje, teto: limites.mensagensPorDia } }
    }

    mensagens.push({ role: 'assistant', content: resposta.content })

    const pedidos = resposta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const resultados: Anthropic.ToolResultBlockParam[] = []
    for (const p of pedidos) {
      try {
        const saida = await executar(dono, p.name, p.input ?? {}, (x) => { proposta = x })
        resultados.push({ type: 'tool_result', tool_use_id: p.id, content: JSON.stringify(saida) })
      } catch (e) {
        // O erro volta como conteúdo, não como falha: assim a IA lê o motivo
        // e explica ao cliente, em vez de a conversa simplesmente morrer.
        resultados.push({
          type: 'tool_result', tool_use_id: p.id,
          content: `Não deu certo: ${(e as Error).message}`, is_error: true,
        })
      }
    }
    // Todos os resultados numa mensagem só: separar ensina o modelo a parar
    // de pedir várias ferramentas de uma vez.
    mensagens.push({ role: 'user', content: resultados })
  }

  // Desistir também custou: anota antes de sair.
  anotar()
  return {
    texto: 'Me embolei tentando responder isso. Pergunta de outro jeito?',
    proposta,
    uso: { hoje, teto: limites.mensagensPorDia },
  }
}
