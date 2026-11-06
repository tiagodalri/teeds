/**
 * As cotações do conversor de moedas (06/11/2026, ideia do Victor).
 *
 * Fonte principal: AwesomeAPI (economia.awesomeapi.com.br), a cotação
 * comercial do câmbio brasileiro, atualizada a cada minuto, sem chave e com
 * CORS aberto. Reserva: ExchangeRate-API (open.er-api.com), a cotação do dia,
 * caso a primeira não responda. Tudo é guardado em reais: quanto vale 1
 * unidade de cada moeda em R$. Converter de A para B é passar por reais.
 */

export interface Moeda { codigo: string; nome: string; simbolo: string; casas: number }

export const MOEDAS: Moeda[] = [
  { codigo: 'BRL', nome: 'Real brasileiro', simbolo: 'R$', casas: 2 },
  { codigo: 'USD', nome: 'Dólar americano', simbolo: 'US$', casas: 2 },
  { codigo: 'EUR', nome: 'Euro', simbolo: '€', casas: 2 },
  { codigo: 'GBP', nome: 'Libra esterlina', simbolo: '£', casas: 2 },
  { codigo: 'CHF', nome: 'Franco suíço', simbolo: 'CHF', casas: 2 },
  { codigo: 'CAD', nome: 'Dólar canadense', simbolo: 'C$', casas: 2 },
  { codigo: 'AUD', nome: 'Dólar australiano', simbolo: 'A$', casas: 2 },
  { codigo: 'JPY', nome: 'Iene japonês', simbolo: '¥', casas: 0 },
  { codigo: 'CNY', nome: 'Yuan chinês', simbolo: '¥', casas: 2 },
  { codigo: 'ARS', nome: 'Peso argentino', simbolo: '$', casas: 2 },
  { codigo: 'MXN', nome: 'Peso mexicano', simbolo: '$', casas: 2 },
  { codigo: 'CLP', nome: 'Peso chileno', simbolo: '$', casas: 0 },
  { codigo: 'BTC', nome: 'Bitcoin', simbolo: '₿', casas: 8 },
]

export interface Cotacoes {
  /** R$ por 1 unidade de cada moeda. BRL = 1. */
  emReais: Record<string, number>
  /** Variação do dia, em %, quando a fonte informa. */
  variacao: Record<string, number>
  /** Quando a fonte atualizou (ms). */
  quando: number
  fonte: 'ao vivo' | 'do dia'
}

const CHAVE = 'gf.cotacoes'
let memoria: Cotacoes | null = null

export function cotacoesGuardadas(): Cotacoes | null {
  if (memoria) return memoria
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null') as Cotacoes | null
    if (v && v.emReais && v.emReais.USD > 0) memoria = v
  } catch { /* sem armazenamento */ }
  return memoria
}

function guardar(c: Cotacoes) {
  memoria = c
  try { localStorage.setItem(CHAVE, JSON.stringify(c)) } catch { /* opcional */ }
}

async function comPrazo(url: string, ms = 8000): Promise<unknown> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!r.ok) throw new Error(String(r.status))
    return await r.json()
  } finally { clearTimeout(t) }
}

async function daAwesome(): Promise<Cotacoes> {
  const pares = MOEDAS.filter((m) => m.codigo !== 'BRL').map((m) => `${m.codigo}-BRL`).join(',')
  const d = await comPrazo(`https://economia.awesomeapi.com.br/json/last/${pares}`) as Record<string, { bid?: string; pctChange?: string; timestamp?: string }>
  const emReais: Record<string, number> = { BRL: 1 }
  const variacao: Record<string, number> = {}
  let quando = 0
  for (const m of MOEDAS) {
    const p = d?.[`${m.codigo}BRL`]
    const v = Number(p?.bid)
    if (Number.isFinite(v) && v > 0) {
      emReais[m.codigo] = v
      const pct = Number(p?.pctChange)
      if (Number.isFinite(pct)) variacao[m.codigo] = pct
      quando = Math.max(quando, Number(p?.timestamp) * 1000 || 0)
    }
  }
  if (!emReais.USD) throw new Error('sem dólar')
  return { emReais, variacao, quando: quando || Date.now(), fonte: 'ao vivo' }
}

async function daReserva(): Promise<Cotacoes> {
  const d = await comPrazo('https://open.er-api.com/v6/latest/BRL') as { rates?: Record<string, number>; time_last_update_unix?: number }
  const emReais: Record<string, number> = { BRL: 1 }
  for (const m of MOEDAS) {
    const porReal = d?.rates?.[m.codigo]
    if (porReal && porReal > 0) emReais[m.codigo] = 1 / porReal
  }
  if (!emReais.USD) throw new Error('sem dólar')
  return { emReais, variacao: {}, quando: (d.time_last_update_unix ?? 0) * 1000 || Date.now(), fonte: 'do dia' }
}

/** Busca as cotações de agora: a fonte ao vivo, e a do dia se ela falhar. */
export async function buscarCotacoes(): Promise<Cotacoes> {
  let c: Cotacoes
  try { c = await daAwesome() } catch { c = await daReserva() }
  // a reserva pode não ter alguma moeda: completa com a última conhecida
  const antes = cotacoesGuardadas()
  if (antes) for (const k of Object.keys(antes.emReais)) if (!c.emReais[k]) c.emReais[k] = antes.emReais[k]
  guardar(c)
  return c
}

export function converter(valor: number, de: string, para: string, c: Cotacoes): number | null {
  const a = c.emReais[de], b = c.emReais[para]
  if (!a || !b) return null
  return (valor * a) / b
}
