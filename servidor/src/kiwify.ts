/**
 * O aviso de compra da Kiwify, que libera o simulador sozinho.
 *
 * O produto "Simulador de Treinamento Teeds" (R$ 497, pagamento único) é
 * vendido fora da plataforma. Quando o pagamento é aprovado, a Kiwify chama
 * este gancho e o acesso é ligado na conta do cliente antes de ele terminar de
 * ler o e-mail de confirmação. Estorno e chargeback desfazem pelo mesmo
 * caminho — senão o reembolso vira acesso de graça.
 *
 * TRÊS TRAVAS, e nenhuma é enfeite:
 *
 *  1. ASSINATURA. A Kiwify manda `?signature=` com o HMAC-SHA1 do corpo cru,
 *     feito com o token do gancho. Sem conferir isso, qualquer um com a URL
 *     libera o simulador para quem quiser, de graça. O corpo tem de ser o
 *     texto exato que chegou: reserializar o JSON muda um byte e derruba a
 *     conta.
 *
 *  2. O PRODUTO CERTO. A conta vende outras coisas (alertas, cotas de
 *     viagem). Sem conferir qual produto foi vendido, uma compra de R$ 127 em
 *     outro produto liberaria um simulador de R$ 497.
 *
 *  3. REPETIÇÃO. A Kiwify reenvia o aviso quando não recebe 200. Quem decide
 *     se já viu aquele (pedido, evento) é o banco, na chave primária de
 *     `compras_kiwify` — não um contador aqui na memória, que morre a cada
 *     reinício.
 *
 * Responde 200 em quase tudo, de propósito: um 500 faz a Kiwify repetir o
 * aviso por horas. O que não deu certo vai para o log e para a tabela, que é
 * onde alguém consegue olhar depois.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const base = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const segredo = () => process.env.SUPABASE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/** O token do gancho, copiado do painel da Kiwify. Sem ele, nada é aceito. */
export const tokenDoGancho = () => process.env.KIWIFY_TOKEN ?? ''
/** O id do produto do simulador na Kiwify. Vazio = cai no nome. */
export const produtoDoSimulador = () => process.env.KIWIFY_PRODUTO ?? ''

export interface AvisoKiwify {
  pedido: string
  evento: string
  email: string
  nome: string | null
  produtoId: string | null
  produtoNome: string | null
  /** Em reais, já convertido dos centavos que a Kiwify manda. */
  valor: number | null
}

/**
 * A assinatura bate?
 *
 * Comparação em tempo constante: comparar com `===` vaza, pelo tempo de
 * resposta, quantos caracteres do início estavam certos — é pouco, mas é de
 * graça não vazar.
 */
export function assinaturaConfere(corpoCru: string, assinatura: string, token = tokenDoGancho()): boolean {
  if (!token || !assinatura) return false
  const esperado = createHmac('sha1', token).update(corpoCru, 'utf8').digest('hex')
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(assinatura.trim().toLowerCase(), 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/**
 * Lê o aviso, aceitando os nomes que a Kiwify usa em versões diferentes.
 *
 * Preferir ser tolerante aqui e rígido na assinatura: um campo com outro nome
 * não é ataque, é a plataforma mudando o formato — e perder uma venda por isso
 * seria pior que o trabalho de olhar em três lugares.
 */
export function lerAviso(corpo: unknown): AvisoKiwify | null {
  if (!corpo || typeof corpo !== 'object') return null
  const d = corpo as Record<string, any>
  const cliente = d.Customer ?? d.customer ?? {}
  const produto = d.Product ?? d.product ?? {}
  const comissao = d.Commissions ?? d.commissions ?? {}

  const pedido = texto(d.order_id ?? d.orderId ?? d.order_ref ?? d.id)
  const evento = texto(d.webhook_event_type ?? d.event ?? d.order_status ?? d.status).toLowerCase()
  const email = texto(cliente.email ?? cliente.Email ?? d.customer_email).toLowerCase()
  if (!pedido || !evento || !email) return null

  // A Kiwify manda o valor em centavos.
  const centavos = Number(comissao.charge_amount ?? comissao.chargeAmount ?? d.charge_amount)
  return {
    pedido, evento, email,
    nome: texto(cliente.full_name ?? cliente.name) || null,
    produtoId: texto(produto.product_id ?? produto.id) || null,
    produtoNome: texto(produto.product_name ?? produto.name) || null,
    valor: Number.isFinite(centavos) && centavos > 0 ? Math.round(centavos) / 100 : null,
  }
}

/** É o produto do simulador, e não outro item da mesma conta? */
export function ehOSimulador(aviso: AvisoKiwify, id = produtoDoSimulador()): boolean {
  if (id) return aviso.produtoId === id
  // Sem id configurado, o nome decide — e o nome do produto começa com
  // "Simulador". É a rede de segurança, não o caminho preferido.
  return /simulador/i.test(aviso.produtoNome ?? '')
}

export interface ResultadoAplicacao {
  repetido?: boolean
  achou?: boolean
  user_id?: string
  acao?: string
  plano_anterior?: string
  devolve_para?: string | null
  erro?: string
}

/** Manda o aviso para o banco decidir o que fazer. */
export async function aplicarNoBanco(aviso: AvisoKiwify, marca = 'teeds'): Promise<ResultadoAplicacao> {
  const r = await fetch(`${base()}/rest/v1/rpc/teeds_kiwify_aplicar`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: {
      apikey: segredo(), Authorization: `Bearer ${segredo()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_pedido: aviso.pedido, p_evento: aviso.evento, p_marca: marca,
      p_email: aviso.email, p_produto: aviso.produtoNome, p_valor: aviso.valor,
    }),
  })
  if (!r.ok) throw new Error(`o banco respondeu ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`)
  return (await r.json()) as ResultadoAplicacao
}
