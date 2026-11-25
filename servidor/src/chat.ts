import './ambiente'

import Anthropic from '@anthropic-ai/sdk'
import { autorizacao } from './mcp'
import { autorizacaoParaOperar } from './cofre'
import { contas, iniciar, listarRobos, parar, resumir, todas, ver } from './sessoes'
import { chaveDaAnthropicGuardada, chaveDoGeminiGuardada, contasDoUsuario, guardarChaveDaAnthropic, limitesDoCliente, registrarGastoDoChat, usoDeHojeDoChat } from './supabase'
import { PADRAO, conferir, sugerir, type Limites } from './limites'
import { marcaPorId } from '../../src/marca/marcas'
import { ehFamiliaGF } from '../../src/marca/marcas'
import { horaDeBrasilia, recomendacaoAgora, type Recomendacao } from './recomendacao'

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
 *  2. A IA pede, o servidor confere e executa. 19/11/2026 (Tiago: "não precisa desse card pra pessoa
 *     clicar... a ideia é que seja parecida com um chat mesmo", pensando no WhatsApp; escolheu "liga
 *     direto sempre"): `propor_sessao` agora LIGA a I.A. na hora, sem cartão nem botão. As travas são as
 *     mesmas da rota do botão: a conta precisa ser do login, `conferir` (limites.ts) barra entrada, stop e
 *     meta fora da regra, e `iniciar` (sessoes.ts) confere plano, simulador e I.A. liberada. Os números
 *     vêm sempre do servidor (o que a pessoa disse, ou a sugestão pelo saldo), nunca do texto da IA.
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

// O assistente se apresenta pelo nome da plataforma de onde o cliente fala:
// o servidor é um só para as duas marcas, e o cliente da OMNI não pode ser
// atendido pelo "assistente da Teeds".
const instrucoes = (marca: string) => `Você é o assistente da ${marcaPorId(marca).prosa}, plataforma de operações na corretora Deriv.
O cliente fala com você dentro da plataforma, em português do Brasil.

Responda em duas ou três linhas, direto, sem jargão e sem empolgação de vendedor.
Quando o cliente perde dinheiro, informe: não comemore nem console.

Nunca:
- prometa resultado, ganho ou probabilidade de sucesso;
- diga que ${ia(marca).um} "está quente" ou "vai virar" — ${ia(marca).plural} não têm fase;
- sugira aumentar a entrada depois de uma perda;
- invente número. Todo valor que você disser veio de uma ferramenta desta conversa.
  Se não sabe, diga que não sabe e chame a ferramenta.

Ligar ${ia(marca).um}:
- Quando o cliente pedir claramente para ligar, chame propor_sessao: ela LIGA na hora (não existe cartão nem botão).
- Passe só os valores que o cliente disse; o que faltar ela sugere pelo saldo. Na dúvida sobre qual I.A., pergunte antes.
- Se ela recusar, explique em uma linha o motivo devolvido. Não tente contornar.
- Só diga que ligou depois que propor_sessao devolver ligado: true nesta conversa. Diga a I.A., a conta, a entrada, a meta e o limite, e que você avisa aqui quando terminar.${ia(marca).regra}`

/**
 * Como a plataforma chama as estratégias. Na GlobalFly elas são "I.A." (feminino) e a palavra "robô" não
 * aparece em lugar nenhum (vocabularioIA.ts na tela); os nomes são os da frota (GF Raptor, GF Falcon…),
 * que listar_robos já devolve. As ferramentas continuam com o nome técnico: o cliente não as vê.
 */
function ia(marca: string) {
  if (ehFamiliaGF(marca)) {
    return {
      um: 'uma I.A.', plural: 'as I.A.',
      regra: `

Nesta plataforma as estratégias se chamam I.A., no feminino ("a I.A. Raptor", "suas I.A.").
Nunca escreva a palavra robô nem os códigos internos (ag2, ag7, superior5): use o nome que listar_robos devolver.`,
    }
  }
  return { um: 'um robô', plural: 'robôs', regra: '' }
}

/* ------------------------------------------------------------ ferramentas */

const FERRAMENTAS: Anthropic.Tool[] = [
  {
    name: 'listar_robos',
    description: 'Os robôs da plataforma e a regra de cada um.',
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
    description: 'Liga um robô na hora (19/11/2026: sem cartão). Só chame quando o cliente pediu para ligar. ' +
      'Descobre conta e saldo sozinha, sugere os valores que faltarem e confere os limites antes de ligar.',
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
  /** A sessão que já foi ligada (19/11/2026: o chat liga direto; a tela acompanha e avisa no fim). */
  sessaoId?: string
}

/** Quem fala. `vitrine`/`app`: o parceiro do endereço (/n, /v) e o app da Deriv dele, como na rota do botão. */
export interface Dono {
  id: string; somenteDemo?: boolean; vitrine?: string; app?: string
  /**
   * 19/11/2026 (revisão): a pessoa PEDIU para ligar nesta mensagem (ou na anterior, quando o assistente
   * perguntou um detalhe e ela respondeu "real", "a Raptor"...). Sem isto a I.A. do assistente não liga nada:
   * uma pergunta ("quanto daria a Raptor com 1 dólar?") ou o texto de uma imagem nunca viram sessão.
   */
  pediuParaLigar?: boolean
  /**
   * 25/11/2026 (Tiago, WhatsApp do Assessor: "perguntar qual conta"): sem tela para conferir, um pedido de ligar
   * que não diz a conta não escolhe sozinho: pergunta "demo ou real?" e liga com a resposta.
   */
  perguntarConta?: boolean
}

/** As contas Deriv que são deste cliente E que a autorização enxerga. */
async function contasDele(dono: Dono) {
  const minhas = await contasDoUsuario(dono.id)
  // A mesma regra da rota /api/sessao: a autorizacao do proprio cliente, e a
  // do servidor so quando o cofre esta vazio. Uma conta que a autorizacao nao
  // enxerga nao entra na lista, entao o chat nunca fala de conta alheia.
  const cofre = await autorizacaoParaOperar(dono.id, autorizacao, dono.app)
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
  // 10/11/2026: só quem ligou (ver minhaSessao em servidor.ts); a conta vale para sessões sem dono
  if (s.parametros?.userId) return s.parametros.userId === dono.id ? s : null
  const minhas = await contasDoUsuario(dono.id)
  return minhas.includes(s.contaId) ? s : null
}
const dele = (dono: Dono, minhas: string[]) => (s: any) => (s.parametros?.userId ? s.parametros.userId === dono.id : minhas.includes(s.contaId))

async function limitesDe(dono: Dono): Promise<Limites> {
  const ajuste = await limitesDoCliente(dono.id)
  return { ...PADRAO, ...(ajuste ?? {}) }
}

/** Quantos robôs deste cliente estão operando agora. */
async function robosAtivos(dono: Dono): Promise<number> {
  const minhas = await contasDoUsuario(dono.id)
  return todas().filter((s) => dele(dono, minhas)(s) && s.estado?.rodando).length
}

async function executar(
  dono: Dono, nome: string, args: any, guardar: (p: Proposta) => void, marca = 'teeds',
): Promise<unknown> {
  switch (nome) {
    case 'listar_robos':
      return { robos: listarRobos(marca), observacao: 'Todos operam no Volatility 75 padrão, definido pela plataforma.' }

    case 'minhas_contas': {
      const lista = await contasDele(dono)
      if (!lista.length) return { contas: [], observacao: 'Nenhuma conta Deriv está ligada a este login.' }
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
      return { sessoes: todas().filter(dele(dono, minhas)).map(resumir) }
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
      const ficha = listarRobos(marca).find((r) => r.id === roboId)
      if (!ficha) throw new Error(`Robô "${roboId}" não existe. Chame listar_robos para ver os que existem.`)

      const disponiveis = await contasDele(dono)
      if (!disponiveis.length) throw new Error('Nenhuma conta Deriv está ligada a este login.')
      if (!args.conta && dono.perguntarConta && !dono.somenteDemo && disponiveis.some((c) => c.type === 'demo') && disponiveis.some((c) => c.type !== 'demo')) {
        const ok = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : undefined)
        lembrarPedidoSemConta(dono.id, { robo: roboId, nome: ficha.nome, entrada: ok(args.entrada), meta: ok(args.take_profit), stop: ok(args.stop_loss) })
        return { recusado: true, motivo: `Falta saber a conta. Pergunte ao cliente se liga na demonstração (${disponiveis.find((c) => c.type === 'demo')!.accountId}) ou na real (${disponiveis.find((c) => c.type !== 'demo')!.accountId}); não ligue antes de ele responder.` }
      }
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

      if (conta.type !== 'demo' && dono.somenteDemo) return { recusado: true, motivo: 'Este acesso está limitado à conta demo.' }
      if (!dono.pediuParaLigar) return { recusado: true, motivo: `Para ligar, peça direto, por exemplo: "liga a ${ficha.nome} com entrada de 1, meta de 10 e stop de 20".` }
      // a mesma I.A. já operando nesta conta (áudio mandado duas vezes, por exemplo): não liga em dobro
      const jaLigada = todas().find((x) => x.parametros?.userId === dono.id && x.roboId === roboId && x.contaId === conta.accountId && (x.estado?.rodando || x.estado?.emOperacao))
      if (jaLigada) return { recusado: true, motivo: `A ${ficha.nome} já está operando nesta conta. Se quiser trocar os valores, peça para desligar e depois ligue de novo.` }
      // liga de verdade: a mesma autorização e os mesmos dados que a rota do botão manda para iniciar()
      const cofre = await autorizacaoParaOperar(dono.id, autorizacao, dono.app)
      if (!cofre.ok) return { recusado: true, motivo: cofre.motivo }
      let sessao
      try {
        sessao = await iniciar(cofre.sessao, {
          roboId, contaId: conta.accountId, valorInicial: entrada, stopLoss, takeProfit,
          origem: 'chat', marca, userId: dono.id, parceiro: dono.vitrine,
        })
      } catch (e) {
        console.warn(`[chat] não liguei ${roboId} para ${dono.id.slice(0, 8)}…: ${(e as Error).message}`)
        return { recusado: true, motivo: (e as Error).message }
      }
      console.log(`[chat] ligou ${roboId} para ${dono.id.slice(0, 8)}… → sessão ${sessao.id}`)
      const proposta: Proposta = {
        roboId, roboNome: ficha.nome, regra: ficha.ganhaQuando,
        contaId: conta.accountId, demo: conta.type === 'demo',
        moeda: conta.currency, saldo: conta.balance,
        entrada, stopLoss, takeProfit, sessaoId: sessao.id,
      }
      guardar(proposta)
      return {
        ligado: true,
        ...proposta,
        observacao: 'A I.A. já está operando. Diga em poucas linhas o que ligou (I.A., conta, entrada, meta e limite) ' +
          'e que você avisa aqui quando a sessão terminar.',
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
  /** Quando a Anthropic recusou: o motivo em português, para a administração agir (a tela só mostra a admin). */
  falhaDaIA?: string
  /** Quem respondeu: a Anthropic (padrão) ou o Gemini, quando a Anthropic recusou (a tela avisa a administração). */
  motor?: 'anthropic' | 'gemini'
  /** O que a pessoa falou no áudio, como o servidor entendeu (a tela mostra no balão dela). */
  transcricao?: string
}

/**
 * O que vem junto com a pergunta (19/11/2026, Tiago: "mandar áudio, mandar imagem, mandar vídeo").
 * O áudio vira texto antes de tudo e segue o caminho de uma mensagem escrita. Imagens (e os quadros de um
 * vídeo, tirados na tela) vão para o Gemini, que enxerga. `contaAtual` é a conta aberta na tela agora:
 * "liga na minha conta" é ela. `trocados`: os rótulos real/demonstração estão trocados na tela desta pessoa.
 */
export interface Anexos {
  audio?: { mime: string; dados: string }
  imagens?: Array<{ mime: string; dados: string }>
  video?: boolean
  contaAtual?: string
  trocados?: boolean
}

/*
  A chave (19/11/2026): a colada na administração (config_servicos), a mesma das outras leituras da I.A.;
  sem ela, a do .env do servidor. Lida de novo a cada minuto: trocar a chave na tela vale sem reiniciar.
*/
let cliente: { chave: string; ia: Anthropic } | null = null
let lida: { chave: string; em: number } | null = null
async function anthropic(): Promise<Anthropic> {
  if (!lida || Date.now() - lida.em > 60_000) {
    const doBanco = await chaveDaAnthropicGuardada().catch(() => lida?.chave ?? '')
    lida = { chave: doBanco || (process.env.ANTHROPIC_API_KEY ?? '').trim(), em: Date.now() }
  }
  if (!lida.chave) throw new Error('O chat ainda não está configurado: falta a chave da Anthropic.')
  if (!cliente || cliente.chave !== lida.chave) cliente = { chave: lida.chave, ia: new Anthropic({ apiKey: lida.chave }) }
  return cliente.ia
}

/** O motivo de a Anthropic recusar, do nosso jeito (o original fica no registro do servidor). */
export function motivoDaRecusa(mensagem: string): string {
  const m = mensagem || ''
  if (/identity verification/i.test(m)) return 'A conta da Anthropic pede a verificação de identidade. Entre em console.anthropic.com com a conta da chave e conclua a verificação; depois disso o Assistente volta sozinho.'
  if (/credit balance|billing/i.test(m)) return 'A conta da Anthropic está sem créditos. Em console.anthropic.com › Plans & Billing, compre créditos.'
  if (/authentication|invalid x-api-key|401/i.test(m)) return 'A Anthropic não aceitou a chave guardada. Gere uma nova em console.anthropic.com › API keys e cole abaixo.'
  if (/permission|403/i.test(m)) return 'A chave não tem permissão para usar a I.A. Gere uma nova em console.anthropic.com › API keys.'
  if (/rate limit|overloaded|529|429/i.test(m)) return 'A Anthropic pediu uma pausa (muitas consultas agora). Tente de novo em um minuto.'
  if (/falta a chave/i.test(m)) return 'Falta a chave da Anthropic. Cole abaixo a chave que começa com sk-ant-.'
  return 'A Anthropic recusou a conversa. O motivo completo ficou no registro do servidor.'
}

/**
 * Troca a chave da Anthropic (só o admin geral; a rota confere). Testa com uma conversa de verdade de
 * 1 token antes de guardar: a lista de modelos responde até em conta sem crédito ou sem a verificação de
 * identidade, e aí a chave "passava" e o Assistente seguia mudo.
 */
export async function trocarChaveDaIA(valor: string): Promise<{ ok: true } | { ok: false; erro: string }> {
  const chave = valor.trim()
  if (!/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(chave)) return { ok: false, erro: 'Isso não parece uma chave da Anthropic (começa com sk-ant-).' }
  try {
    await new Anthropic({ apiKey: chave }).messages.create({ model: MODELO, max_tokens: 1, messages: [{ role: 'user', content: 'oi' }] })
  } catch (e) {
    console.error(`[chat] a chave nova foi recusada: ${(e as Error).message}`)
    return { ok: false, erro: motivoDaRecusa((e as Error).message) }
  }
  await guardarChaveDaAnthropic(chave)
  lida = null
  console.log('[chat] chave da Anthropic trocada pela administração')
  return { ok: true }
}

/* ------------------------------------------------------------ o Gemini, enquanto a Anthropic não libera */

/**
 * 19/11/2026 (Tiago: "ja temos a chave do gemini ne? vamos usar ela entao"): a conta da Anthropic travou na
 * verificação de identidade. A chave gratuita do Gemini (a das Recomendações do negócio) responde no lugar,
 * com as mesmas instruções e as mesmas ferramentas, até a Anthropic voltar (a cada 10 min ela é tentada de novo).
 * Faixa gratuita do Google: as conversas podem ser usadas por ele; por isso o Assistente da GF é só da equipe.
 */
let anthropicRecusada: { em: number; motivo: string } | null = null
const recusaDaConta = (m: string) => /identity verification|credit balance|billing|authentication|invalid x-api-key|permission|falta a chave/i.test(m)

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta'
/*
  Medido em 19/11/2026 na faixa gratuita: os modelos maiores viviam lotados (503), sem cota (429) ou passavam de
  30 s; o "3.5 Flash Lite" com raciocínio mínimo respondeu em ~9 s e o "3.1 Flash Lite" em ~26 s. Os dois
  primeiros correm juntos e vale o que responder antes; os outros são a reserva, um de cada vez.
*/
const MODELOS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.5-flash']
/** Como cada modelo foi da última vez: o tempo da resposta boa e quando falhou. */
const desempenho = new Map<string, { ms?: number; falhouEm?: number }>()
/**
 * A ordem da vez: quem falhou nos últimos 3 min vai para o fim; entre os outros, o mais rápido da última vez
 * primeiro (quem ainda não foi medido fica na ordem da lista). Os dois primeiros correm juntos.
 */
function ordemDosModelos(): { juntos: string[]; reserva: string[] } {
  const agora = Date.now()
  const nota = (m: string) => {
    const d = desempenho.get(m)
    if (d?.falhouEm && agora - d.falhouEm < 3 * 60_000) return 1e9 + MODELOS.indexOf(m)
    return d?.ms ?? 20_000 + MODELOS.indexOf(m)
  }
  const ordem = [...MODELOS].sort((a, b) => nota(a) - nota(b))
  return { juntos: ordem.slice(0, 2), reserva: ordem.slice(2) }
}

/** As ferramentas no formato do Gemini (o Gemini não aceita additionalProperties). */
function paraGemini(esquema: Record<string, unknown>): Record<string, unknown> {
  const { additionalProperties: _fora, ...resto } = esquema as Record<string, unknown> & { additionalProperties?: unknown }
  return resto
}
const FERRAMENTAS_GEMINI = [{ functionDeclarations: FERRAMENTAS.map((f) => ({ name: f.name, description: f.description, parameters: paraGemini(f.input_schema as Record<string, unknown>) })) }]

type ParteGemini = { text?: string; thought?: boolean; functionCall?: { id?: string; name: string; args?: Record<string, unknown> }; [k: string]: unknown }

type RespostaDoGemini = { partes: ParteGemini[]; uso: { entrada: number; saida: number }; modelo: string }

async function umModelo(chave: string, modelo: string, corpo: Record<string, unknown>, sinal: AbortSignal): Promise<RespostaDoGemini> {
  const t0 = Date.now()
  try {
    const r = await umModeloSemMedir(chave, modelo, corpo, sinal)
    desempenho.set(modelo, { ms: Date.now() - t0 })
    return r
  } catch (e) {
    // cancelado por ter perdido a corrida não é falha do modelo
    if (!sinal.aborted || (e as Error).name === 'TimeoutError' || Date.now() - t0 >= 34_000) desempenho.set(modelo, { ...desempenho.get(modelo), falhouEm: Date.now() })
    throw e
  }
}

async function umModeloSemMedir(chave: string, modelo: string, corpo: Record<string, unknown>, sinal: AbortSignal): Promise<RespostaDoGemini> {
  const r = await fetch(`${GEMINI}/models/${modelo}:generateContent`, {
    method: 'POST', signal: sinal,
    headers: { 'x-goog-api-key': chave, 'Content-Type': 'application/json' },
    // raciocínio mínimo: sem ele os modelos "pensam" por 20 s antes de chamar uma ferramenta
    body: JSON.stringify({ ...corpo, generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: 'minimal' } } }),
  })
  const d = await r.json().catch(() => ({} as any))
  if (!r.ok) {
    const e = new Error(`${modelo} ${r.status}: ${String(d?.error?.message ?? '').slice(0, 160)}`)
    ;(e as Error & { status?: number }).status = r.status
    throw e
  }
  const partes = (d.candidates?.[0]?.content?.parts ?? []) as ParteGemini[]
  return { partes, modelo, uso: { entrada: Number(d.usageMetadata?.promptTokenCount ?? 0), saida: Number(d.usageMetadata?.candidatesTokenCount ?? 0) } }
}

/**
 * Uma ida ao Gemini. Com `modelo` (as idas depois de uma ferramenta), o mesmo modelo da 1ª: a assinatura do
 * raciocínio que volta no histórico é dele. Sem, os dois mais rápidos correm juntos e o perdedor é cancelado.
 */
async function pedirAoGemini(chave: string, corpo: Record<string, unknown>, modelo?: string): Promise<RespostaDoGemini> {
  if (modelo) {
    try { return await umModelo(chave, modelo, corpo, AbortSignal.timeout(35_000)) }
    catch (e) { if ((e as Error & { status?: number }).status === 401 || (e as Error & { status?: number }).status === 403) throw e }
  }
  const { juntos, reserva } = ordemDosModelos()
  const paradas = juntos.map(() => new AbortController())
  const corrida = juntos.map((m, i) => {
    const t = setTimeout(() => paradas[i].abort(), 35_000)
    return umModelo(chave, m, corpo, paradas[i].signal).finally(() => clearTimeout(t))
  })
  try {
    const venceu = await Promise.any(corrida)
    paradas.forEach((p) => p.abort())
    return venceu
  } catch (todos) {
    const erros = (todos as AggregateError).errors ?? []
    if (erros.some((e) => [401, 403].includes((e as Error & { status?: number }).status ?? 0))) throw erros[0]
  }
  let ultimo = 'sem resposta'
  for (const m of reserva) {
    try { return await umModelo(chave, m, corpo, AbortSignal.timeout(25_000)) }
    catch (e) { ultimo = (e as Error).message }
  }
  throw new Error(ultimo)
}

async function conversarPeloGemini(
  dono: Dono, historico: Turno[], pergunta: string, marca: string, uso: { hoje: number; teto: number },
  contexto: { texto: string; lidos: Set<string> } = { texto: '', lidos: new Set() },
  anexos: Anexos = {},
): Promise<Resposta> {
  const ferramentas = [{ functionDeclarations: FERRAMENTAS_GEMINI[0].functionDeclarations.filter((f) => !contexto.lidos.has(f.name)) }]
  const chave = await chaveDoGeminiGuardada()
  if (!chave) throw new Error('não há chave do Gemini guardada')
  const conteudo: Array<{ role: 'user' | 'model'; parts: ParteGemini[] | Array<Record<string, unknown>> }> = historico
    .slice(-MEMORIA)
    .map((t) => ({ role: t.papel === 'cliente' ? 'user' as const : 'model' as const, parts: [{ text: t.texto }] }))
  const imagens = (anexos.imagens ?? []).map((i) => ({ inlineData: { mimeType: i.mime, data: i.dados } }))
  const aviso = imagens.length ? (anexos.video ? `(São ${imagens.length} quadros de um vídeo, em ordem, tirados a intervalos iguais; o som não vem.) ` : '') : ''
  conteudo.push({ role: 'user', parts: [...imagens, { text: aviso + pergunta }] })

  let proposta: Proposta | undefined
  const gasto = { entrada: 0, saida: 0, cache: 0, idas: 0 }
  const anotar = () => {
    console.log(`[chat] (gemini ${modelo ?? '?'}) cliente ${dono.id.slice(0, 8)}… · ${gasto.idas} ida(s) · entrada ${gasto.entrada} · saida ${gasto.saida}`)
    void registrarGastoDoChat(dono.id, gasto, marca)
  }
  let modelo: string | undefined
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const ida = await pedirAoGemini(chave, {
      systemInstruction: { parts: [{ text: instrucoes(marca) + contexto.texto }] },
      contents: conteudo,
      tools: ferramentas,
    }, modelo)
    const { partes, uso: u } = ida
    if (ida.modelo !== modelo && modelo) {
      // o modelo da conversa caiu no meio: o histórico com a assinatura dele não serve para outro
      console.warn(`[chat] (gemini) ${modelo} caiu no meio; seguiu com ${ida.modelo}`)
    }
    modelo = ida.modelo
    gasto.idas += 1; gasto.entrada += u.entrada; gasto.saida += u.saida
    const pedidos = partes.filter((p) => p.functionCall)
    if (!pedidos.length) {
      const texto = partes.filter((p) => p.text && !p.thought).map((p) => p.text).join('\n').trim()
      anotar()
      return { texto: texto || 'Não consegui responder agora. Pergunta de outro jeito?', proposta, uso, motor: 'gemini' }
    }
    // a resposta do modelo volta inteira (com a assinatura do raciocínio que o Gemini 3 exige de volta)
    conteudo.push({ role: 'model', parts: partes })
    const respostas: Array<Record<string, unknown>> = []
    for (const p of pedidos) {
      const f = p.functionCall!
      let resultado: unknown
      try { resultado = await executar(dono, f.name, f.args ?? {}, (x) => { proposta = x }, marca) }
      catch (e) { resultado = { erro: `Não deu certo: ${(e as Error).message}` } }
      respostas.push({ functionResponse: { ...(f.id ? { id: f.id } : {}), name: f.name, response: { resultado } } })
    }
    conteudo.push({ role: 'user', parts: respostas })
  }
  anotar()
  return { texto: 'Me embolei tentando responder isso. Pergunta de outro jeito?', proposta, uso, motor: 'gemini' }
}

/* ------------------------------------------------------------ mais rápido (19/11/2026) */
/*
  Tiago: "será que não tem como acelerar a resposta?". Três coisas:
   1. o que tem resposta fixa (contas, I.A. operando, regra de uma I.A.) o servidor responde na hora, sem I.A.
      nenhuma (e sem contar no limite do dia);
   2. o resto vai à I.A. já com os dados da conta, consultados juntos antes: ela responde numa ida só, em vez de
      pedir "minhas contas" e esperar mais uma volta. As ferramentas de ler esses dados saem da lista;
   3. o Gemini começa pelo modelo que respondeu mais rápido há pouco (ver ordemDosModelos).
*/

/** O texto da pergunta sem acento, minúsculo, sem pontuação no fim: para reconhecer as perguntas fixas. */
// 19/11/2026: o ponto entre dígitos fica ("0.50" não pode virar "0 50": a entrada pedida se perdia)
const normalizar = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[?!¿¡]+/g, ' ').replace(/\.(?!\d)|(?<!\d)\./g, ' ').replace(/\s+/g, ' ').trim()
const dinheiro = (v: number, moeda: string) => `${moeda === 'USD' ? 'US$' : moeda} ${Number(v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const comSinal = (v: number, moeda: string) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dinheiro(Math.abs(v), moeda)}`

/** A regra de uma I.A. em português: quando ganha e, se houver, como entra (Gulf e Phenom esperam a sequência). */
const regraDe = (r: { ganhaQuando: string; descricao?: string }) =>
  r.descricao && /^ganha/i.test(r.descricao) ? r.descricao : `Ganha quando ${r.ganhaQuando}.${r.descricao ? ` ${r.descricao}` : ''}`

/** A sessão ligada pela resposta direta, entregue junto com o texto (a tela vigia e avisa no fim). */
const propostaDireta = new Map<string, Proposta>()

/** Resposta pronta, sem I.A., para as perguntas que só pedem um dado. Nada (null) quando a pergunta é outra coisa. */
/** A recomendada do cartão da Início, sem passar de 3 s (sem ela a conversa segue normal). */
const recomendacaoRapida = () => Promise.race([recomendacaoAgora(), new Promise<null>((r) => setTimeout(() => r(null), 3000))]).catch(() => null)

/** 25/11/2026 (Tiago: "tem que sempre bater com o que está mostrando lá na plataforma"): a mesma I.A. e a mesma validade do cartão. */
export function textoDaRecomendacao(r: Recomendacao | null): string {
  if (!r) return 'Não consegui ler o mercado agora para a recomendação. Tente de novo em instantes, ou veja o cartão na Início da plataforma.'
  return `✨ **I.A. recomendada agora: ${r.ia.nome}**\nNa análise das ${horaDeBrasilia(r.de)}, o mercado ficou alinhado com a estratégia dela.\n\n` +
    `Válida até **${horaDeBrasilia(r.ate)}**\nTambém alinhada: ${r.segunda.nome}\n\nPara ligar, é só dizer: "liga a ${r.ia.curto} na demo".`
}
export const PERGUNTA_DA_RECOMENDADA = /\brecomendad[ao]s?\b|^(qual|que) (e |eh )?(a )?(melhor )?(i ?a|ia|inteligencia) (pra |para )?(eu )?(ligar|usar|operar|devo ligar|devo usar)( agora| hoje| no momento| nesse momento)?$|^(qual|que) (e |eh )?(a )?melhor (i ?a|ia|inteligencia)( pra| para)?( agora| hoje| no momento| nesse momento)?$/

/** O pedido de ligar que esperava a pessoa dizer a conta (10 min; some ao mudar de assunto). */
const pedidosSemConta = new Map<string, { pedido: PedidoDeLigar; ate: number }>()
function lembrarPedidoSemConta(id: string, pedido: PedidoDeLigar) { pedidosSemConta.set(id, { pedido, ate: Date.now() + 10 * 60_000 }) }
export const RESPOSTA_DE_CONTA = /^(e |eh |pode ser |pode |liga )?(na |em |a |o )?(conta )?(de )?(demo|demonstracao|virtual|treino|teste|real)( mesmo| por favor| pf| pfv| ok)?$/

/** Sem a conta dita (WhatsApp): pergunta em qual, com as duas e o saldo de cada. null = não precisa perguntar. */
async function perguntaDaConta(dono: Dono, pedido: PedidoDeLigar, marca: string): Promise<string | null> {
  if (!dono.perguntarConta || dono.somenteDemo) return null
  const contas = (await executar(dono, 'minhas_contas', {}, () => undefined, marca) as { contas: Array<{ conta: string; tipo: string; moeda: string; saldo: number }> }).contas
  const demo = contas.find((c) => c.tipo !== 'real'); const real = contas.find((c) => c.tipo === 'real')
  if (!demo || !real) return null
  lembrarPedidoSemConta(dono.id, pedido)
  return `Em qual conta eu ligo a **${pedido.nome}**?\n\nDemo · ${demo.conta} (${dinheiro(demo.saldo, demo.moeda)})\nReal · ${real.conta} (${dinheiro(real.saldo, real.moeda)})\n\nResponda "demo" ou "real".`
}

async function respostaDireta(dono: Dono, pergunta: string, marca: string, anexos: Anexos = {}): Promise<string | null> {
  let q = normalizar(pergunta)
  const pendente = pedidosSemConta.get(dono.id)
  if (pendente) {
    pedidosSemConta.delete(dono.id)
    const escolha = Date.now() <= pendente.ate ? q.match(RESPOSTA_DE_CONTA)?.[5] : undefined
    if (escolha) return cartaoDoPedido({ ...dono, pediuParaLigar: true }, { ...pendente.pedido, tipo: escolha === 'real' ? 'real' : 'demo' }, marca, anexos)
  }
  if (ehFamiliaGF(marca) && PERGUNTA_DA_RECOMENDADA.test(q)) {
    const rec = await recomendacaoRapida()
    // "liga a recomendada na demo": vira o nome da I.A. do cartão e segue como pedido de ligar
    if (rec && VERBO_DE_LIGAR.test(q) && !PERGUNTA.test(q)) q = q.replace(/\b(a |o )?(i ?a |ia )?recomendad[ao]s?( agora| do momento)?\b/, ` ${rec.ia.curto.toLowerCase()} `).replace(/\s+/g, ' ').trim()
    else if (q.length <= 140) return textoDaRecomendacao(rec)
  }
  // "opera com a Raptor, entrada de 1, meta de 10 e stop de 20" (escrito ou falado): liga na hora, de qualquer tamanho
  const pedido = pedidoDeLigar(q, listarRobos(marca))
  // só quando é pedido de verdade ("quero saber como opera a Gulf" segue para a I.A. explicar)
  if (pedido && dono.pediuParaLigar) return cartaoDoPedido(dono, pedido, marca, anexos)
  if (q.length > 90) return null
  const gf = ehFamiliaGF(marca)
  const IA = gf ? '(i ?a|ias?|inteligencias?)' : '(robos?|i ?a|ias?)'

  if (new RegExp(`^(quais (sao )?(as )?minhas contas|minhas contas|(qual|quanto) (e |eh )?(o )?meu saldo|meu saldo|saldo|quanto (eu )?tenho( de saldo)?|quais contas eu tenho)$`).test(q)) {
    const r = await executar(dono, 'minhas_contas', {}, () => undefined, marca) as { contas: Array<{ conta: string; tipo: string; moeda: string; saldo: number }>; observacao?: string }
    if (!r.contas.length) return r.observacao ?? 'Nenhuma conta da Deriv está ligada a este login.'
    return `Suas contas na Deriv:\n${r.contas.map((c) => `• ${c.tipo === 'real' ? 'Real' : 'Demonstração'} ${c.conta}: ${dinheiro(c.saldo, c.moeda)}`).join('\n')}`
  }

  if (new RegExp(`^(como (estao|esta|vao|vai) (as |os )?(minhas |meus )?${IA}( agora| hoje)?|(as |os )?(minhas |meus )?${IA} (agora|operando|ligad[ao]s?)|o que (esta|ta) operando( agora)?|tem (alguma |algum )?${IA} (ligad[ao]|operando)( agora)?)$`).test(q)) {
    const r = await executar(dono, 'sessoes', {}, () => undefined, marca) as { sessoes: Array<ReturnType<typeof resumir>> }
    const nome = gf ? 'I.A.' : 'robô'
    if (!r.sessoes.length) return gf ? 'Nenhuma I.A. operando agora, e nenhuma encerrou há pouco.' : 'Nenhum robô operando agora, e nenhum encerrou há pouco.'
    const linhas = r.sessoes.map((x) => {
      const sit = x.situacao === 'rodando' ? 'operando' : x.situacao === 'falhou' ? 'parou com erro' : 'encerrada'
      return `• ${x.robo} (${x.conta.includes('REAL') ? 'real' : 'demonstração'}): ${sit} · ${x.operacoes} operações (${x.ganhas} ganhas, ${x.perdidas} perdidas) · resultado ${comSinal(x.resultado, x.moeda)}`
    })
    const rodando = r.sessoes.filter((x) => x.situacao === 'rodando').length
    return `${rodando ? `${rodando} ${rodando === 1 ? nome : gf ? 'I.A.' : 'robôs'} operando agora.` : `Nenhum${gf ? 'a I.A.' : ' robô'} operando agora.`}\n${linhas.join('\n')}`
  }

  const robos = listarRobos(marca)
  const chave = (n: string) => normalizar(n).replace(/^gf /, '')

  // "liga a Raptor com 1 dólar na demo": liga na hora (19/11/2026: sem cartão)
  const ligar = q.match(/^(liga|ligar|ligue|inicia|iniciar|inicie|comeca|comecar) (a |o )?(i ?a |ia |robo )?(gf )?([a-z0-9]+)(?: com (?:us\$ ?|\$ ?)?(\d+(?:[.,]\d+)?)(?: dolar(?:es)?| usd)?)?(?: (?:na|em) (?:conta )?(?:de )?(demo|demonstracao|real|virtual))?$/)
  if (ligar) {
    const ficha = robos.find((r) => chave(r.nome) === ligar[5] || r.id === ligar[5])
    if (ficha) {
      const tipo = ligar[7] === 'real' ? 'real' : ligar[7] ? 'demo' : null
      const contas = (await executar(dono, 'minhas_contas', {}, () => undefined, marca) as { contas: Array<{ conta: string; tipo: string }> }).contas
      const conta = tipo ? contas.find((c) => (tipo === 'real' ? c.tipo === 'real' : c.tipo !== 'real'))?.conta : undefined
      if (!tipo) {
        const pergunta = await perguntaDaConta(dono, { robo: ficha.id, nome: ficha.nome, ...(ligar[6] ? { entrada: Number(ligar[6].replace(',', '.')) } : {}) }, marca)
        if (pergunta) return pergunta
      }
      if (tipo && !conta) return `Não achei uma conta ${tipo === 'real' ? 'real' : 'de demonstração'} da Deriv ligada a este login.`
      let proposta: Proposta | undefined
      const r = await executar(dono, 'propor_sessao', { robo: ficha.id, ...(conta ? { conta } : {}), ...(ligar[6] ? { entrada: Number(ligar[6].replace(',', '.')) } : {}) }, (x) => { proposta = x }, marca) as { recusado?: boolean; motivo?: string }
      if (r.recusado || !proposta) return `Não liguei: ${r.motivo ?? 'não consegui falar com a corretora agora. Tente de novo em instantes.'}`
      propostaDireta.set(dono.id, proposta)
      return `Pronto, liguei a ${ficha.nome} na conta ${proposta.demo !== !!anexos.trocados ? 'de demonstração' : 'REAL'}:\n` +
        `• Entrada: ${dinheiro(proposta.entrada, proposta.moeda)}\n• Meta de ganho: ${dinheiro(proposta.takeProfit, proposta.moeda)}\n• Limite de perda: ${dinheiro(proposta.stopLoss, proposta.moeda)}\n` +
        'Te aviso aqui quando terminar.'
    }
  }

  // a regra de uma ou mais I.A. citadas pelo nome ("diferença entre a Raptor e a Falcon", "como funciona a Gulf")
  const citadas = robos.filter((r) => new RegExp(`\\b${chave(r.nome)}\\b`).test(q) || new RegExp(`\\b${r.id}\\b`).test(q))
  const sobreRegra = /^(qual (e |eh )?a diferenca|diferenca entre|como (funciona|opera|trabalha)|o que (e|faz)|qual (e |eh )?a regra|me (explica|fala) (sobre )?)/.test(q)
  if (citadas.length && sobreRegra) {
    return citadas.map((r) => `${r.nome}: ${regraDe(r)}`).join('\n\n') +
      `\n\n${citadas.length > 1 ? 'Todas operam' : 'Opera'} no Volatility 75.`
  }
  if (new RegExp(`^(quais (sao )?(as |os )?${IA}( da plataforma| disponiveis)?|que ${IA} (tem|existem))$`).test(q)) {
    return `${gf ? 'As I.A.' : 'Os robôs'} da plataforma:\n${robos.map((r) => `• ${r.nome}: ${regraDe(r)}`).join('\n')}`
  }
  return null
}

/* ---------- o pedido de ligar, escrito ou falado (19/11/2026) */
/*
  Tiago: "se eu mandar um áudio 'opera com Raptor na minha conta, com entrada de $1, meta de $10 e stop de 20',
  tem que entender e transformar em operação". Aqui o servidor lê a frase sozinho (sem esperar a I.A.):
  o verbo de ligar, UMA I.A. citada pelo nome e os valores que vierem (entrada, meta, stop). O que faltar,
  propor_sessao sugere. 19/11/2026: liga na hora (sem cartão), com as travas de propor_sessao.
*/
const POR_EXTENSO: Record<string, number> = {
  meio: 0.5, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15, dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
  vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, duzentos: 200, quinhentos: 500, mil: 1000,
}
const NUM = `(\\d+(?:[.,]\\d+)?|${Object.keys(POR_EXTENSO).sort((a, b) => b.length - a.length).join('|')})`
const valorDe = (t: string) => POR_EXTENSO[t] ?? Number(t.replace(',', '.'))
const VERBO_DE_LIGAR = /\b(liga|ligar|ligue|liguem|opera|operar|opere|roda|rodar|rode|coloca|colocar|coloque|poe|por|inicia|iniciar|inicie|comeca|comecar|comece|bota|botar|bote|ativa|ativar|ative|aciona|acionar|acione|starta|startar|start|dispara|disparar)\b/
const PERGUNTA = /^(como|qual|quais|o que|oque|por que|porque|quando|quanto|sera que|vale a pena|devo|e se)\b/

export interface PedidoDeLigar { robo: string; nome: string; entrada?: number; meta?: number; stop?: number; tipo?: 'real' | 'demo' }

export function pedidoDeLigar(q: string, robos: Array<{ id: string; nome: string }>): PedidoDeLigar | null {
  if (PERGUNTA.test(q) || !VERBO_DE_LIGAR.test(q) || /\b(nao|nunca|para de|parar de|desliga)\b/.test(q)) return null
  const chave = (n: string) => normalizar(n).replace(/^gf /, '')
  const citadas = robos.filter((r) => new RegExp(`\\b${chave(r.nome)}\\b`).test(q) || new RegExp(`\\b${r.id}\\b`).test(q))
  if (citadas.length !== 1) return null
  // os valores: tira moeda e enfeite ("$1", "us$ 10", "10 dolares", "20 reais") para sobrar o número
  // 19/11/2026 (Tiago: pediu "50 centavos de dólar de entrada" e veio 0,35): centavos viram dólar ("50 centavos" = 0.50)
  const emCentavos = q.replace(new RegExp(`${NUM} centavos?`, 'g'), (_, n: string) => String(valorDe(n) / 100))
  const t = emCentavos.replace(/us ?\$|\$|usd|dolar(es)?|reais|real(?= (de|e)\b)/g, ' ').replace(/\s+/g, ' ')
  const TODOS_OS_NOMES = 'entrada|stake|mao|meta|take|alvo|objetivo|gain|lucro|stop|limite|loss|perda|prejuizo'
  const achar = (rotulo: string) => {
    // 19/11/2026: entre o nome e o valor cabem até 4 palavras de ligação ("entradas e 50 centavos", "stop vai ser 20",
    // "meta de lucro de 10", "limite maximo de 30"); o plural do nome também vale
    const LIGA = '(?:de|e|em|a|ate|no|na|para|pra|com|vai|vou|ser|sera|seria|fica|ficar|eh|igual|maximo|maxima|minimo|minima|lucro|ganho|perda|inicial|diaria|so|apenas|uns|umas)'
    const m = t.match(new RegExp(`(?:${rotulo})s?(?: ${LIGA}){0,4}[ :=]+${NUM}(?!\\d|[.,]\\d)`))
    // o valor achado é de OUTRO nome quando vem logo antes dele ("20 de stop e 1 de entrada": o 1 é da entrada)
    const deOutro = m && new RegExp(`^(?: de)+ (?:${TODOS_OS_NOMES})s?\\b`).test(t.slice((m.index ?? 0) + m[0].length))
    if (m && !deOutro) return valorDe(m[1])
    // o valor ANTES do nome ("50 centavos de entrada", "10 de meta"); "um"/"uma" aí é artigo ("um stop"), não valor
    const antes = t.match(new RegExp(`(?:^|\\s)(\\d+(?:[.,]\\d+)?|${Object.keys(POR_EXTENSO).filter((k) => k !== 'um' && k !== 'uma').join('|')})(?: de)*(?: (?:na|no|como|pra|para))? (?:${rotulo})\\b`))
    return antes ? valorDe(antes[1]) : undefined
  }
  const entrada = achar('entrada(?: inicial)?|stake|valor(?: de entrada| inicial)?|mao') ?? (() => {
    const m = t.match(new RegExp(`\\bcom ${NUM}\\b(?! (?:de )?(?:meta|stop|loss|limite|gain))`))
    return m ? valorDe(m[1]) : undefined
  })()
  const meta = achar('meta(?: de ganho| de lucro| diaria)?|take(?: profit)?|alvo|objetivo|gain|lucro')
  const stop = achar('stop(?: loss)?|limite(?: de perda)?|loss|perda(?: maxima)?|prejuizo')
  const tipo = /\b(conta real|na real|em real|real)\b/.test(q.replace(/\breais\b/g, '').replace(/\b(\d+(?:[.,]\d+)?|um|uma|dois|cinco|dez|vinte) real\b/g, '')) ? 'real'
    : /\b(demo|demonstracao|treino|virtual|teste|simulacao)\b/.test(q) ? 'demo' : undefined
  const ok = (v?: number) => (v !== undefined && Number.isFinite(v) && v > 0 ? v : undefined)
  return { robo: citadas[0].id, nome: citadas[0].nome, entrada: ok(entrada), meta: ok(meta), stop: ok(stop), tipo }
}

async function cartaoDoPedido(dono: Dono, pedido: PedidoDeLigar, marca: string, anexos: Anexos): Promise<string> {
  const contas = (await executar(dono, 'minhas_contas', {}, () => undefined, marca) as { contas: Array<{ conta: string; tipo: string }> }).contas
  // a pessoa fala pelo que vê: com os rótulos trocados, a "real" da tela é a virtual
  const tipoDeVerdade = pedido.tipo && anexos.trocados ? (pedido.tipo === 'real' ? 'demo' : 'real') : pedido.tipo
  if (!tipoDeVerdade && !anexos.contaAtual) {
    const pergunta = await perguntaDaConta(dono, pedido, marca)
    if (pergunta) return pergunta
  }
  const conta = tipoDeVerdade
    ? contas.find((c) => (tipoDeVerdade === 'real' ? c.tipo === 'real' : c.tipo !== 'real'))?.conta
    : contas.find((c) => c.conta === anexos.contaAtual)?.conta
  if (tipoDeVerdade && !conta) return `Não achei uma conta ${pedido.tipo === 'real' ? 'real' : 'de demonstração'} da Deriv ligada a este login.`
  let proposta: Proposta | undefined
  const r = await executar(dono, 'propor_sessao', {
    robo: pedido.robo, ...(conta ? { conta } : {}),
    ...(pedido.entrada ? { entrada: pedido.entrada } : {}), ...(pedido.meta ? { take_profit: pedido.meta } : {}), ...(pedido.stop ? { stop_loss: pedido.stop } : {}),
  }, (x) => { proposta = x }, marca) as { recusado?: boolean; motivo?: string }
  if (r.recusado || !proposta) return `Não liguei: ${r.motivo ?? 'não consegui falar com a corretora agora. Tente de novo em instantes.'}`
  propostaDireta.set(dono.id, proposta)
  const rotulo = proposta.demo !== !!anexos.trocados ? 'de demonstração' : 'REAL'
  const sugeridos = [!pedido.entrada && 'entrada', !pedido.meta && 'meta', !pedido.stop && 'stop'].filter(Boolean) as string[]
  return `Pronto, liguei a ${pedido.nome} na conta ${rotulo}:\n` +
    `• Entrada: ${dinheiro(proposta.entrada, proposta.moeda)}\n• Meta de ganho: ${dinheiro(proposta.takeProfit, proposta.moeda)}\n• Limite de perda: ${dinheiro(proposta.stopLoss, proposta.moeda)}\n` +
    (sugeridos.length ? `${sugeridos.length === 1 ? 'A' : 'Os valores de'} ${sugeridos.join(' e ').replace(/ e (?=.* e )/, ', ')} eu escolhi pelo seu saldo, porque você não disse. ` : '') +
    'Te aviso aqui quando terminar.'
}

/** O áudio em texto, pelo Gemini (que escuta). Números em algarismos, para o pedido de ligar ler os valores. */
export async function transcrever(audio: { mime: string; dados: string }, marca: string): Promise<{ texto: string; gasto: { entrada: number; saida: number } }> {
  const chave = await chaveDoGeminiGuardada()
  if (!chave) throw new Error('não há chave do Gemini guardada')
  const nomes = listarRobos(marca).map((r) => r.nome.replace(/^GF /, '')).join(', ')
  const ida = await pedirAoGemini(chave, {
    systemInstruction: { parts: [{ text:
      'Você transcreve áudios curtos de clientes de uma plataforma de operações na corretora Deriv. ' +
      'Devolva só o que a pessoa falou, em português do Brasil, sem comentário, sem aspas, sem "a pessoa disse". ' +
      'Escreva números com algarismos (1, 10, 20, 1,50) e dinheiro como "1 dólar". ' +
      `Nomes que podem aparecer: ${nomes}, Deriv, Volatility 75, stop, meta, entrada, gale. ` +
      'Se não houver fala, devolva vazio.' }] },
    contents: [{ role: 'user', parts: [{ inlineData: { mimeType: audio.mime, data: audio.dados } }, { text: 'Transcreva este áudio.' }] }],
  })
  const texto = ida.partes.filter((p) => p.text && !p.thought).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim()
  return { texto, gasto: ida.uso }
}

/** Os dados desta conta, lidos juntos antes de chamar a I.A. (cada um com 4 s de prazo; o que falhar fica de fora). */
async function dadosDaConta(dono: Dono, marca: string): Promise<{ texto: string; lidos: Set<string> }> {
  const prazo = <T,>(p: Promise<T>) => Promise.race([p, new Promise<T>((_, nao) => setTimeout(() => nao(new Error('prazo')), 4000))])
  const nomes = ['listar_robos', 'minhas_contas', 'sessoes'] as const
  const lidos = await Promise.allSettled(nomes.map((n) => prazo(executar(dono, n, {}, () => undefined, marca))))
  const ok = new Set<string>()
  const partes: string[] = []
  lidos.forEach((r, i) => { if (r.status === 'fulfilled') { ok.add(nomes[i]); partes.push(`${nomes[i]}: ${JSON.stringify(r.value)}`) } })
  if (!partes.length) return { texto: '', lidos: ok }
  return {
    lidos: ok,
    texto: `\n\nDados desta conta, consultados agora no servidor (use estes; não chame ferramenta para ler de novo):\n${partes.join('\n')}`,
  }
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
  dono: Dono, historico: Turno[], perguntaEscrita: string, marca = 'teeds', anexos: Anexos = {},
): Promise<Resposta> {
  const limites = await limitesDe(dono)
  // O custo do chat é contado por plataforma: o da OMNI não some no da Teeds.
  const hoje = await usoDeHojeDoChat(dono.id, marca)
  if (hoje >= limites.mensagensPorDia) {
    return {
      texto: `Você chegou ao limite de ${limites.mensagensPorDia} mensagens por hoje. ` +
        `${ehFamiliaGF(marca) ? 'As I.A.' : 'Os robôs'} continuam operando normalmente — o limite é só da conversa. Amanhã zera.`,
      uso: { hoje, teto: limites.mensagensPorDia },
    }
  }

  // 0) áudio: vira texto antes de tudo (e segue o caminho de uma mensagem escrita)
  let pergunta = perguntaEscrita
  let transcricao: string | undefined
  if (anexos.audio) {
    try {
      const t0 = Date.now()
      const ouvido = await transcrever(anexos.audio, marca)
      console.log(`[chat] (áudio) cliente ${dono.id.slice(0, 8)}… transcrito em ${Date.now() - t0} ms`)
      void registrarGastoDoChat(dono.id, { ...ouvido.gasto, cache: 0, idas: 1 }, marca)
      transcricao = ouvido.texto
    } catch (e) {
      console.error(`[chat] (áudio) não transcreveu: ${(e as Error).message}`)
      return { texto: 'Não consegui ouvir o áudio agora. Tente de novo em instantes, ou escreva.', uso: { hoje, teto: limites.mensagensPorDia } }
    }
    if (!transcricao) return { texto: 'Não entendi nada no áudio. Pode gravar de novo, mais perto do microfone?', uso: { hoje, teto: limites.mensagensPorDia }, transcricao: '' }
    pergunta = [perguntaEscrita, transcricao].filter(Boolean).join('\n')
  }
  const comImagem = !!anexos.imagens?.length
  {
    // "por" aqui é quase sempre a preposição ("por favor", "por dia"), não o verbo pôr
    const pediu = (t: string) => { const q = normalizar(t).replace(/\bpor\b/g, ' '); return !!q && VERBO_DE_LIGAR.test(q) && !PERGUNTA.test(q) && !/\b(nao|nunca|desliga)\b/.test(q) && !/\b(como (ela |ele |a |o )?(opera|funciona)|saber|explica|explicar|entender|funciona)\b/.test(q) }
    const anterior = [...historico].reverse().find((t) => t.papel === 'cliente')?.texto ?? ''
    dono = { ...dono, pediuParaLigar: !comImagem && (pediu(pergunta) || (pergunta.length <= 60 && pediu(anterior))) }
  }
  if (comImagem && !pergunta) pergunta = anexos.video ? 'O que aparece neste vídeo? Explique o que for útil para operar na plataforma.' : 'O que aparece nesta imagem? Explique o que for útil para operar na plataforma.'
  const comTranscricao = <T extends Resposta>(r: T): T => (transcricao !== undefined ? { ...r, transcricao } : r)

  // 1) pergunta de dado fixo: resposta na hora, sem I.A. (não conta no limite do dia)
  const direta = comImagem ? null : await respostaDireta(dono, pergunta, marca, anexos).catch((e) => { console.warn(`[chat] resposta direta falhou: ${(e as Error).message}`); return null })
  if (direta) {
    console.log(`[chat] (direto) cliente ${dono.id.slice(0, 8)}…`)
    const proposta = propostaDireta.get(dono.id); propostaDireta.delete(dono.id)
    return comTranscricao({ texto: direta, proposta, uso: { hoje, teto: limites.mensagensPorDia } })
  }
  // 2) os dados da conta vão junto: a I.A. responde numa ida só
  const contexto = await dadosDaConta(dono, marca)
  if (anexos.contaAtual) contexto.texto += `\nA conta aberta na tela do cliente agora é ${anexos.contaAtual}: quando ele disser "minha conta" ou não disser qual, é ela.`
  if (ehFamiliaGF(marca)) {
    const rec = await recomendacaoRapida()
    if (rec) contexto.texto += `\nI.A. recomendada agora (é o cartão da Início da plataforma; use SEMPRE esta, nunca escolha outra): ${rec.ia.nome}, análise das ${horaDeBrasilia(rec.de)}, válida até ${horaDeBrasilia(rec.ate)}; também alinhada: ${rec.segunda.nome}. Fale que o mercado "ficou alinhado" com a estratégia dela; nunca fale de chance maior, ticks ou porcentagens. "A recomendada" = ${rec.ia.nome}.`
  }
  if (anexos.trocados) contexto.texto += '\nNa tela deste cliente os nomes das contas estão trocados (uso interno): chame a conta real de "demonstração" e a de demonstração de "real", e entenda o que ele disser do mesmo jeito.'

  // imagem e vídeo: só o Gemini enxerga aqui
  if (comImagem) {
    const pelo = await conversarPeloGemini(dono, historico, pergunta, marca, { hoje, teto: limites.mensagensPorDia }, contexto, anexos).catch((g) => {
      console.error(`[chat] (imagem) o Gemini falhou: ${(g as Error).message}`)
      return null
    })
    return pelo ?? { texto: 'Não consegui ver a imagem agora. Tente de novo em instantes.', uso: { hoje, teto: limites.mensagensPorDia } }
  }

  // a Anthropic recusou há pouco por causa da conta: nem tenta de novo (cada tentativa atrasa a resposta)
  if (anthropicRecusada && Date.now() - anthropicRecusada.em < 10 * 60_000) {
    const pelo = await conversarPeloGemini(dono, historico, pergunta, marca, { hoje, teto: limites.mensagensPorDia }, contexto).catch((g) => {
      console.error(`[chat] o Gemini falhou: ${(g as Error).message}`)
      return null
    })
    if (pelo) return comTranscricao(pelo)
    anthropicRecusada = null
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
      resposta = await (await anthropic()).messages.create({
        model: MODELO,
        max_tokens: 1024,
        system: instrucoes(marca) + contexto.texto,
        tools: FERRAMENTAS.filter((f) => !contexto.lidos.has(f.name)),
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
      const motivo = (e as Error).message
      console.error(`[chat] a IA recusou: ${motivo}`)
      // 19/11/2026: a conta da Anthropic travada (verificação de identidade, crédito, chave): o Gemini gratuito
      // responde no lugar, com as mesmas ferramentas. Na 1ª ida só; no meio da conversa a troca embaralharia.
      if (gasto.idas === 0 && recusaDaConta(motivo)) {
        anthropicRecusada = { em: Date.now(), motivo }
        const pelo = await conversarPeloGemini(dono, historico, pergunta, marca, { hoje, teto: limites.mensagensPorDia }, contexto).catch((g) => {
          console.error(`[chat] o Gemini também falhou: ${(g as Error).message}`)
          return null
        })
        if (pelo) return comTranscricao(pelo)
      }
      if (gasto.idas > 0) anotar()
      return {
        texto: ehFamiliaGF(marca)
          ? 'O assistente está indisponível agora. Suas I.A. continuam operando normalmente, e a tela das I.A. mostra tudo.'
          : 'O assistente está indisponível agora. Seus robôs continuam operando normalmente, e a tela de Robôs mostra tudo.',
        proposta,
        uso: { hoje, teto: limites.mensagensPorDia },
        falhaDaIA: motivoDaRecusa(motivo),
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
      return comTranscricao({ texto, proposta, uso: { hoje, teto: limites.mensagensPorDia } })
    }

    mensagens.push({ role: 'assistant', content: resposta.content })

    const pedidos = resposta.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    const resultados: Anthropic.ToolResultBlockParam[] = []
    for (const p of pedidos) {
      try {
        const saida = await executar(dono, p.name, p.input ?? {}, (x) => { proposta = x }, marca)
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
