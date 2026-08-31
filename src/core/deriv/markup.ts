import { DERIV } from './config'
import type { AuthSession } from './auth'

/**
 * Faturamento de markup da Teeds.
 *
 * O markup e a comissao do dono do app: uma porcentagem do PAGAMENTO
 * potencial de cada contrato negociado atraves da aplicacao. Teto de 3%.
 * Exige o escopo application_read no token.
 */

export interface MarkupResumo {
  comissao: number
  volume: number
  pagamentos: number
  contratos: number
  clientes: number
  porApp: Array<{ appId: string; nome: string; comissao: number; volume: number; contratos: number }>
}

export interface DiaMarkup {
  data: string
  comissao: number
  volume: number
  contratos: number
}

export class SemPermissao extends Error {
  constructor() {
    super('O login atual não tem permissão para ler estatísticas.')
    this.name = 'SemPermissao'
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function periodo(dias: number): { de: string; ate: string } {
  const ate = new Date()
  const de = new Date()
  de.setDate(de.getDate() - (dias - 1))
  return { de: iso(de), ate: iso(ate) }
}

async function consultar(session: AuthSession, de: string, ate: string): Promise<any> {
  const url = `${DERIV.restBase}/applications/v1/markup-statistics?date_from=${de}&date_to=${ate}`
  const res = await fetch(url, {
    headers: {
      'Deriv-App-ID': DERIV.appId,
      Authorization: `Bearer ${session.accessToken}`,
    },
  })
  if (res.status === 403) throw new SemPermissao()
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const first = body?.errors?.[0]
    throw new Error(first?.message || body?.message || `Erro ${res.status}`)
  }
  return body?.data ?? {}
}

/** Totais do periodo. */
export async function buscarResumo(session: AuthSession, de: string, ate: string): Promise<MarkupResumo> {
  const d = await consultar(session, de, ate)
  return {
    comissao: Number(d.total_app_markup_usd ?? 0),
    volume: Number(d.total_volume_usd ?? 0),
    pagamentos: Number(d.total_payout_usd ?? 0),
    contratos: Number(d.total_contract_count ?? 0),
    clientes: Number(d.total_client_count ?? 0),
    porApp: (d.breakdown ?? []).map((b: any) => ({
      appId: String(b.app_id ?? b.application_id ?? ''),
      nome: b.app_name ?? b.name ?? '',
      comissao: Number(b.app_markup_usd ?? b.total_app_markup_usd ?? 0),
      volume: Number(b.volume_usd ?? b.total_volume_usd ?? 0),
      contratos: Number(b.contract_count ?? b.total_contract_count ?? 0),
    })),
  }
}

/** Serie diaria, consultando dia a dia (a API so devolve totais por intervalo). */
export async function buscarSerieDiaria(session: AuthSession, dias: number): Promise<DiaMarkup[]> {
  const datas: string[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    datas.push(iso(d))
  }

  const saida: DiaMarkup[] = []
  const lote = 6 // respeita o limite de 60 requisicoes por minuto
  for (let i = 0; i < datas.length; i += lote) {
    const parte = datas.slice(i, i + lote)
    const res = await Promise.all(
      parte.map(async (data) => {
        try {
          const d = await consultar(session, data, data)
          return {
            data,
            comissao: Number(d.total_app_markup_usd ?? 0),
            volume: Number(d.total_volume_usd ?? 0),
            contratos: Number(d.total_contract_count ?? 0),
          }
        } catch (e) {
          if (e instanceof SemPermissao) throw e
          return { data, comissao: 0, volume: 0, contratos: 0 }
        }
      }),
    )
    saida.push(...res)
  }
  return saida
}

/**
 * Simulador de markup, calibrado com medicao real feita em 31/08/2026:
 * a 3%, o pagamento cai para 91,25% do valor sem markup, em qualquer aposta.
 * Interpolamos linearmente entre os dois pontos medidos (0% e 3%).
 */
const QUEDA_A_3 = 0.0875

export function simular(payoutSemMarkup: number, markupPct: number) {
  const m = Math.max(0, Math.min(3, markupPct)) / 100
  const fator = 1 - (m / 0.03) * QUEDA_A_3
  const payout = payoutSemMarkup * fator
  return {
    payoutCliente: payout,
    suaComissao: m * payout,
    clientePerde: payoutSemMarkup - payout,
  }
}
