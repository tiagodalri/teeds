/**
 * Laboratório de IA: o que vem de fora da tela.
 *  - as receitas guardadas (tabela lab_receitas, só admins da marca);
 *  - o pagamento de cada contrato, cotado na hora pela Deriv;
 *  - o histórico longo de ticks do 75 Index, para a simulação.
 *
 * `LabApi` existe para o laboratório da tela (?tela=laboratorio-ia) trocar o
 * banco por dados de mentira sem tocar no componente.
 */
import { SUPABASE } from '../teeds/config'
import type { SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'
import { publicSocket, type TeedsSocket } from '../deriv/client'
import { ultimoDigito } from '../deriv/digits'
import { casasDecimais } from '../deriv/types'
import { chaveDoContrato, usaDigito, type Contrato, type Receita } from './receita'

export type Situacao = 'rascunho' | 'simulada' | 'ensaio' | 'publicada'
export interface ResumoDaSimulacao { quando: string; ticks: number; entradas: number; acerto: number; resultado: number; maiorSequencia: number; quebrou: boolean; saldo: number; base: number }
export interface ReceitaGuardada {
  id: string
  nome: string
  receita: Receita
  situacao: Situacao
  simulacao: ResumoDaSimulacao | null
  versao: number
  criadoPorNome: string | null
  alteradoEm: string
}

export interface LabApi {
  listar(): Promise<ReceitaGuardada[]>
  salvar(r: { id?: string; receita: Receita; situacao?: Situacao; simulacao?: ResumoDaSimulacao | null }): Promise<ReceitaGuardada>
  apagar(id: string): Promise<void>
}

const paraGuardada = (l: any): ReceitaGuardada => ({
  id: l.id, nome: l.nome, receita: l.receita, situacao: l.situacao, simulacao: l.simulacao ?? null, versao: l.versao ?? 1,
  criadoPorNome: l.criado_por_nome ?? null, alteradoEm: l.atualizado_em,
})

export function labDoBanco(sessao: SessaoTeeds, nomeDeQuem: string, marca: string = MARCA.id): LabApi {
  const rest = async <T>(caminho: string, init: RequestInit = {}): Promise<T> => {
    const r = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
      ...init,
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers as Record<string, string> ?? {}) },
    })
    if (!r.ok) { const c = await r.json().catch(() => ({})); throw new Error(String(c?.message || `Não consegui falar com o banco agora (${r.status}). Tente de novo.`)) }
    return r.status === 204 ? (undefined as T) : ((await r.json().catch(() => undefined)) as T)
  }
  return {
    async listar() {
      const l = await rest<any[]>(`/lab_receitas?marca=eq.${marca}&select=*&order=atualizado_em.desc`)
      return (l ?? []).map(paraGuardada)
    },
    async salvar({ id, receita, situacao, simulacao }) {
      const corpo: Record<string, unknown> = { nome: receita.nome.trim() || 'Sem nome', receita, alterado_por_nome: nomeDeQuem }
      if (situacao) corpo.situacao = situacao
      if (simulacao !== undefined) corpo.simulacao = simulacao
      const l = id
        ? await rest<any[]>(`/lab_receitas?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify(corpo) })
        : await rest<any[]>('/lab_receitas', { method: 'POST', body: JSON.stringify({ ...corpo, marca, criado_por_nome: nomeDeQuem, situacao: situacao ?? 'rascunho' }) })
      if (!l?.length) throw new Error('Não encontrei essa receita. Ela pode ter sido apagada por outra pessoa.')
      return paraGuardada(l[0])
    },
    async apagar(id) { await rest(`/lab_receitas?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }) },
  }
}

/* ------------------------------------------------------------------ pagamento cotado na Deriv */

export const ATIVO_DO_LAB = 'R_75'
const cache = new Map<string, { porDolar: number; quando: number }>()

/**
 * Quanto cada contrato devolve por US$ 1, perguntando à Deriv (proposal com
 * US$ 10, pela conexão pública ou pela da conta, que já leva o markup real).
 * Fica 2 minutos em memória. O que falhar fica de fora (a tela usa a estimativa).
 */
export async function cotarPagamentos(contratos: Contrato[], socket: TeedsSocket = publicSocket): Promise<Map<string, number>> {
  const saida = new Map<string, number>()
  const unicos = new Map(contratos.map((c) => [chaveDoContrato(c), c]))
  await Promise.all([...unicos].map(async ([chave, c]) => {
    const guardado = cache.get(chave)
    if (guardado && Date.now() - guardado.quando < 120_000) { saida.set(chave, guardado.porDolar); return }
    try {
      const res = await socket.send({
        proposal: 1, amount: 10, basis: 'stake', currency: 'USD', contract_type: c.tipo, duration: c.ticks, duration_unit: 't',
        underlying_symbol: ATIVO_DO_LAB, ...(usaDigito(c.tipo) ? { barrier: String(c.digito) } : {}),
      })
      const payout = Number((res.proposal as any)?.payout)
      if (payout > 0) { const porDolar = Math.round((payout / 10) * 10000) / 10000; cache.set(chave, { porDolar, quando: Date.now() }); saida.set(chave, porDolar) }
    } catch { /* fica a estimativa */ }
  }))
  return saida
}

/* ------------------------------------------------------------------ histórico longo */

/**
 * Os últimos `total` dígitos do 75 Index, de página em página para trás. A
 * Deriv entrega no máximo 1.000 ticks por pedido (pedir mais não adianta), então
 * o laço segue até completar ou até a Deriv não ter mais nada. Chama
 * `aoAvancar` com o quanto já veio.
 */
export async function historicoDeDigitos(total: number, aoAvancar?: (lidos: number) => void, socket: TeedsSocket = publicSocket): Promise<{ digitos: number[]; de: number | null; ate: number | null }> {
  let fim: number | 'latest' = 'latest'
  const lotes: number[][] = []
  let lidos = 0
  let de: number | null = null, ate: number | null = null
  for (let volta = 0; lidos < total && volta < 120; volta++) {
    const res = await socket.send({ ticks_history: ATIVO_DO_LAB, end: fim, count: Math.min(5000, total - lidos), style: 'ticks' })
    const h = res.history as { times: number[]; prices: number[] } | undefined
    if (!h?.times?.length) break
    const casas = casasDecimais((res as any).pip_size) || 4
    lotes.unshift(h.prices.map((p) => ultimoDigito(Number(p), casas)))
    lidos += h.times.length
    ate ??= h.times[h.times.length - 1]
    if (de !== null && h.times[0] >= de) break   // a Deriv não andou para trás: acabou o histórico
    de = h.times[0]
    fim = h.times[0] - 1
    aoAvancar?.(lidos)
  }
  const digitos = lotes.flat()
  return { digitos: digitos.slice(-total), de, ate }
}
