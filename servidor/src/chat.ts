import './ambiente'

import Anthropic from '@anthropic-ai/sdk'
import { autorizacao } from './mcp'
import { autorizacaoParaOperar } from './cofre'
import { contas, listarRobos, parar, resumir, todas, ver } from './sessoes'
import { chaveDaAnthropicGuardada, chaveDoGeminiGuardada, contasDoUsuario, guardarChaveDaAnthropic, limitesDoCliente, registrarGastoDoChat, usoDeHojeDoChat } from './supabase'
import { PADRAO, conferir, sugerir, type Limites } from './limites'
import { marcaPorId } from '../../src/marca/marcas'

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
- Você não liga. Chame propor_sessao e a tela mostra um cartão para o cliente clicar.
- Chame propor_sessao direto: ela descobre conta, saldo e sugere os valores sozinha.
- Se ela recusar, explique em uma linha o motivo devolvido. Não tente contornar.${ia(marca).regra}`

/**
 * Como a plataforma chama as estratégias. Na GlobalFly elas são "I.A." (feminino) e a palavra "robô" não
 * aparece em lugar nenhum (vocabularioIA.ts na tela); os nomes são os da frota (GF Raptor, GF Falcon…),
 * que listar_robos já devolve. As ferramentas continuam com o nome técnico: o cliente não as vê.
 */
function ia(marca: string) {
  if (marca === 'globalfly') {
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
  /** Quando a Anthropic recusou: o motivo em português, para a administração agir (a tela só mostra a admin). */
  falhaDaIA?: string
  /** Quem respondeu: a Anthropic (padrão) ou o Gemini, quando a Anthropic recusou (a tela avisa a administração). */
  motor?: 'anthropic' | 'gemini'
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
const CORREM_JUNTOS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
const RESERVA = ['gemini-flash-lite-latest', 'gemini-3.5-flash']

/** As ferramentas no formato do Gemini (o Gemini não aceita additionalProperties). */
function paraGemini(esquema: Record<string, unknown>): Record<string, unknown> {
  const { additionalProperties: _fora, ...resto } = esquema as Record<string, unknown> & { additionalProperties?: unknown }
  return resto
}
const FERRAMENTAS_GEMINI = [{ functionDeclarations: FERRAMENTAS.map((f) => ({ name: f.name, description: f.description, parameters: paraGemini(f.input_schema as Record<string, unknown>) })) }]

type ParteGemini = { text?: string; thought?: boolean; functionCall?: { id?: string; name: string; args?: Record<string, unknown> }; [k: string]: unknown }

type RespostaDoGemini = { partes: ParteGemini[]; uso: { entrada: number; saida: number }; modelo: string }

async function umModelo(chave: string, modelo: string, corpo: Record<string, unknown>, sinal: AbortSignal): Promise<RespostaDoGemini> {
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
  const paradas = CORREM_JUNTOS.map(() => new AbortController())
  const corrida = CORREM_JUNTOS.map((m, i) => {
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
  for (const m of RESERVA) {
    try { return await umModelo(chave, m, corpo, AbortSignal.timeout(25_000)) }
    catch (e) { ultimo = (e as Error).message }
  }
  throw new Error(ultimo)
}

async function conversarPeloGemini(
  dono: Dono, historico: Turno[], pergunta: string, marca: string, uso: { hoje: number; teto: number },
): Promise<Resposta> {
  const chave = await chaveDoGeminiGuardada()
  if (!chave) throw new Error('não há chave do Gemini guardada')
  const conteudo: Array<{ role: 'user' | 'model'; parts: ParteGemini[] | Array<Record<string, unknown>> }> = historico
    .slice(-MEMORIA)
    .map((t) => ({ role: t.papel === 'cliente' ? 'user' as const : 'model' as const, parts: [{ text: t.texto }] }))
  conteudo.push({ role: 'user', parts: [{ text: pergunta }] })

  let proposta: Proposta | undefined
  const gasto = { entrada: 0, saida: 0, cache: 0, idas: 0 }
  const anotar = () => {
    console.log(`[chat] (gemini ${modelo ?? '?'}) cliente ${dono.id.slice(0, 8)}… · ${gasto.idas} ida(s) · entrada ${gasto.entrada} · saida ${gasto.saida}`)
    void registrarGastoDoChat(dono.id, gasto, marca)
  }
  let modelo: string | undefined
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const ida = await pedirAoGemini(chave, {
      systemInstruction: { parts: [{ text: instrucoes(marca) }] },
      contents: conteudo,
      tools: FERRAMENTAS_GEMINI,
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
        `${marca === 'globalfly' ? 'As I.A.' : 'Os robôs'} continuam operando normalmente — o limite é só da conversa. Amanhã zera.`,
      uso: { hoje, teto: limites.mensagensPorDia },
    }
  }

  // a Anthropic recusou há pouco por causa da conta: nem tenta de novo (cada tentativa atrasa a resposta)
  if (anthropicRecusada && Date.now() - anthropicRecusada.em < 10 * 60_000) {
    const pelo = await conversarPeloGemini(dono, historico, pergunta, marca, { hoje, teto: limites.mensagensPorDia }).catch((g) => {
      console.error(`[chat] o Gemini falhou: ${(g as Error).message}`)
      return null
    })
    if (pelo) return pelo
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
        system: instrucoes(marca),
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
      const motivo = (e as Error).message
      console.error(`[chat] a IA recusou: ${motivo}`)
      // 19/11/2026: a conta da Anthropic travada (verificação de identidade, crédito, chave): o Gemini gratuito
      // responde no lugar, com as mesmas ferramentas. Na 1ª ida só; no meio da conversa a troca embaralharia.
      if (gasto.idas === 0 && recusaDaConta(motivo)) {
        anthropicRecusada = { em: Date.now(), motivo }
        const pelo = await conversarPeloGemini(dono, historico, pergunta, marca, { hoje, teto: limites.mensagensPorDia }).catch((g) => {
          console.error(`[chat] o Gemini também falhou: ${(g as Error).message}`)
          return null
        })
        if (pelo) return pelo
      }
      if (gasto.idas > 0) anotar()
      return {
        texto: marca === 'globalfly'
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
      return { texto, proposta, uso: { hoje, teto: limites.mensagensPorDia } }
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
