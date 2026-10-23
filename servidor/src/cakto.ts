/**
 * O aviso de compra da Cakto, que libera os robôs avulsos da GlobalFly sozinho.
 *
 * Gulf (gf-gulf), Phenom (gf-phenom) e o Pack (gf-pack) vendem como ASSINATURA
 * ANUAL na Cakto. Quando o pagamento é confirmado, a Cakto chama este gancho e
 * o acesso é ligado na conta do cliente por 1 ano. Renovação soma mais 1 ano;
 * estorno e chargeback tiram na hora; cancelamento mantém até o fim do ano já
 * pago. Quem decide tudo isso é o banco (teeds_cakto_aplicar).
 *
 * TRÊS TRAVAS, iguais em espírito às da Kiwify:
 *
 *  1. ASSINATURA. A Cakto assina cada aviso. No cabeçalho vem
 *     `X-Cakto-Signature: v1=<HMAC-SHA256>` e `X-Cakto-Timestamp`, com o HMAC
 *     feito sobre `timestamp + "." + corpo cru`, usando o segredo do webhook
 *     (devolvido quando o webhook foi criado). O corpo tem de ser o texto
 *     exato que chegou. Como rede de segurança, o corpo também traz um campo
 *     `secret` que tem de bater com o nosso. Sem nenhuma das duas provas, o
 *     aviso é descartado.
 *
 *  2. O PRODUTO CERTO. A conta da Cakto vende muita coisa. Só os três ids de
 *     produto da GlobalFly viram liberação; qualquer outro é ignorado.
 *
 *  3. REPETIÇÃO. A Cakto reenvia quando não recebe 200. Quem decide se já viu
 *     aquele (pedido, evento) é o banco, na chave primária de compras_cakto.
 *
 * Responde 200 em quase tudo de propósito: um 500 faz a Cakto repetir por
 * horas. O que não deu certo vai para o log e para a tabela.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const base = () => (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const segredoBanco = () => process.env.SUPABASE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''

/** O segredo do webhook, copiado quando o webhook foi criado na Cakto. */
export const segredoDoGancho = () => process.env.CAKTO_WEBHOOK_SECRET ?? ''

/**
 * De qual produto da Cakto é cada robô. Os ids são os UUID dos produtos
 * criados na conta (23/10/2026). Vêm do ambiente para não prender o código a
 * uma conta; sem o ambiente, caem nos ids criados nesta conta.
 */
export function produtoDaCakto(cktId: string | null): string | null {
  if (!cktId) return null
  const mapa: Record<string, string> = {
    [process.env.CAKTO_PROD_GULF || 'c26cd49c-2c90-4922-8118-1b1d0512848c']: 'gf-gulf',
    [process.env.CAKTO_PROD_PHENOM || 'be31ddfa-ca51-4e8f-8db1-4bd47d39dfff']: 'gf-phenom',
    [process.env.CAKTO_PROD_PACK || '56522358-d3ee-4641-af05-474f61814d50']: 'gf-pack',
  }
  return mapa[cktId] ?? null
}

export interface AvisoCakto {
  pedido: string
  evento: string
  email: string
  nome: string | null
  produtoCaktoId: string | null
  produtoNome: string | null
  /** Já em reais. */
  valor: number | null
  /** O `secret` do corpo, para a rede de segurança. */
  segredoNoCorpo: string | null
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim())

/**
 * A assinatura do cabeçalho confere?
 *
 * `v1=<hex>` sobre `timestamp + "." + corpoCru`, HMAC-SHA256 com o segredo do
 * webhook. Recusa entregas com mais de 5 minutos de diferença, para um aviso
 * capturado não poder ser reenviado muito depois.
 */
export function assinaturaConfere(corpoCru: string, assinatura: string, timestamp: string, segredo = segredoDoGancho()): boolean {
  if (!segredo || !assinatura || !timestamp) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const agora = Date.now() / 1000
  const quando = ts > 1e12 ? ts / 1000 : ts
  if (Math.abs(agora - quando) > 300) return false
  const hex = assinatura.trim().replace(/^v1=/, '').toLowerCase()
  const esperado = createHmac('sha256', segredo).update(`${timestamp}.${corpoCru}`, 'utf8').digest('hex')
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(hex, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Lê o aviso da Cakto (corpo { secret, event, data }). */
export function lerAviso(corpo: unknown): AvisoCakto | null {
  if (!corpo || typeof corpo !== 'object') return null
  const raiz = corpo as Record<string, any>
  const d = (raiz.data && typeof raiz.data === 'object') ? raiz.data as Record<string, any> : raiz
  const cliente = d.customer ?? d.Customer ?? {}
  const produto = d.product ?? d.Product ?? {}

  const pedido = texto(d.id ?? d.refId ?? d.order_id)
  const evento = texto(raiz.event ?? d.event ?? d.status).toLowerCase()
  const email = texto(cliente.email ?? d.customer_email ?? d.email).toLowerCase()
  if (!pedido || !evento || !email) return null

  const bruto = Number(d.amount ?? d.baseAmount ?? d.value)
  return {
    pedido, evento, email,
    nome: texto(cliente.name ?? cliente.full_name) || null,
    produtoCaktoId: texto(produto.id ?? produto.product_id) || null,
    produtoNome: texto(produto.name ?? produto.short_id) || null,
    valor: Number.isFinite(bruto) && bruto > 0 ? bruto : null,
    segredoNoCorpo: texto(raiz.secret) || null,
  }
}

export interface ResultadoAplicacao {
  repetido?: boolean
  achou?: boolean
  user_id?: string
  acao?: string
  produto?: string
  expira_em?: string | null
  erro?: string
}

/** Manda o aviso para o banco decidir. */
export async function aplicarNoBanco(aviso: AvisoCakto, produtoId: string, marca = 'globalfly'): Promise<ResultadoAplicacao> {
  const r = await fetch(`${base()}/rest/v1/rpc/teeds_cakto_aplicar`, {
    method: 'POST',
    signal: AbortSignal.timeout(15_000),
    headers: { apikey: segredoBanco(), Authorization: `Bearer ${segredoBanco()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_pedido: aviso.pedido, p_evento: aviso.evento, p_marca: marca,
      p_email: aviso.email, p_produto: produtoId, p_valor: aviso.valor,
    }),
  })
  if (!r.ok) throw new Error(`o banco respondeu ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`)
  return (await r.json()) as ResultadoAplicacao
}
