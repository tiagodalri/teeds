/**
 * Relatórios do cliente (27/10/2026, Tiago: "uma aba para todos os usuários,
 * Relatórios, com as informações que a Deriv fornece, intuitiva e imersiva").
 *
 * Duas fontes, as duas com números da corretora:
 *  - as operações feitas pela plataforma (I.A. e manual), gravadas com o que a
 *    Deriv devolveu em cada contrato, resumidas pelo banco
 *    (teeds_meu_relatorio, sempre do próprio usuário);
 *  - depósitos e saques do período, lidos ao vivo do extrato da Deriv
 *    (statement), com a autorização que o cliente já deu.
 */
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import type { TeedsSocket } from '../deriv/client'
import { buscarExtrato } from '../deriv/statement'

export type Periodo = 'hoje' | '7d' | '30d' | 'mes' | 'mes-passado'
export const PERIODOS: Array<{ id: Periodo; rotulo: string }> = [
  { id: 'hoje', rotulo: 'Hoje' }, { id: '7d', rotulo: '7 dias' }, { id: '30d', rotulo: '30 dias' },
  { id: 'mes', rotulo: 'Este mês' }, { id: 'mes-passado', rotulo: 'Mês passado' },
]

const FUSO = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** O intervalo de datas (no fuso de quem vê) de cada período. */
export function intervalo(p: Periodo, agora = new Date()): { de: string; ate: string } {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const menos = (n: number) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n)
  if (p === 'hoje') return { de: dataLocal(hoje), ate: dataLocal(hoje) }
  if (p === '7d') return { de: dataLocal(menos(6)), ate: dataLocal(hoje) }
  if (p === '30d') return { de: dataLocal(menos(29)), ate: dataLocal(hoje) }
  if (p === 'mes') return { de: dataLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: dataLocal(hoje) }
  return { de: dataLocal(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), ate: dataLocal(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) }
}

export interface Fatia { operacoes: number; ganhas: number; resultado: number; entradas?: number }
export interface Relatorio {
  total: Fatia & { entradas: number; pagamentos: number; maiorGanho: number; maiorPerda: number; primeira: string | null; ultima: string | null }
  porDia: Array<Fatia & { dia: string }>
  porOrigem: Array<Fatia & { origem: 'ia' | 'manual'; id: string; nome: string }>
  porAtivo: Array<Fatia & { ativo: string }>
  porHora: Array<Fatia & { hora: number }>
  ultimas: Array<{ quando: string; origem: 'ia' | 'manual'; id: string; nome: string; ativo: string; tipo: string; entrada: number; pagamento: number; resultado: number; ganhou: boolean }>
  mes: { inicio: string; resultado: number; operacoes: number }
}

const n = (v: unknown) => Number(v ?? 0)
const fatia = (x: any): Fatia => ({ operacoes: n(x.operacoes), ganhas: n(x.ganhas), resultado: n(x.resultado), entradas: n(x.entradas) })

export async function meuRelatorio(sessao: SessaoTeeds, f: { periodo: Periodo; demo: boolean }): Promise<Relatorio> {
  const { de, ate } = intervalo(f.periodo)
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_meu_relatorio`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, p_de: de, p_ate: ate, p_fuso: FUSO, p_demo: f.demo, p_conta: null }),
  })
  if (!res.ok) throw new Error('Não foi possível montar o relatório agora.')
  const r = await res.json()
  const t = r.total ?? {}
  return {
    total: { ...fatia(t), entradas: n(t.entradas), pagamentos: n(t.pagamentos), maiorGanho: n(t.maior_ganho), maiorPerda: n(t.maior_perda), primeira: t.primeira ?? null, ultima: t.ultima ?? null },
    porDia: (r.por_dia ?? []).map((x: any) => ({ ...fatia(x), dia: String(x.dia) })),
    porOrigem: (r.por_origem ?? []).map((x: any) => ({ ...fatia(x), origem: x.origem === 'manual' ? 'manual' : 'ia', id: String(x.id), nome: String(x.nome ?? '') })),
    porAtivo: (r.por_ativo ?? []).map((x: any) => ({ ...fatia(x), ativo: String(x.ativo ?? '') })),
    porHora: (r.por_hora ?? []).map((x: any) => ({ ...fatia(x), hora: n(x.hora) })),
    ultimas: (r.ultimas ?? []).map((x: any) => ({
      quando: String(x.quando), origem: x.origem === 'manual' ? 'manual' : 'ia', id: String(x.id ?? ''), nome: String(x.nome ?? ''), ativo: String(x.ativo ?? ''),
      tipo: String(x.tipo ?? ''), entrada: n(x.entrada), pagamento: n(x.pagamento), resultado: n(x.resultado), ganhou: Boolean(x.ganhou),
    })),
    mes: { inicio: String(r.mes?.inicio ?? ''), resultado: n(r.mes?.resultado), operacoes: n(r.mes?.operacoes) },
  }
}

export interface Dinheiro { depositos: number; saques: number; movimentos: Array<{ tipo: 'deposit' | 'withdrawal'; valor: number; quando: number }> }

/** Depósitos e saques do período, ao vivo do extrato da Deriv (só a conta conectada agora). */
export async function dinheiroDoPeriodo(socket: TeedsSocket, periodo: Periodo): Promise<Dinheiro> {
  const { de, ate } = intervalo(periodo)
  const [a, m, d] = de.split('-').map(Number), [a2, m2, d2] = ate.split('-').map(Number)
  const desde = new Date(a, m - 1, d).getTime() / 1000, ateFim = new Date(a2, m2 - 1, d2, 23, 59, 59).getTime() / 1000
  const ler = (tipo: 'deposit' | 'withdrawal') => buscarExtrato(socket, { tipo, limite: 200, de: desde, ate: ateFim })
  const [dep, saq] = await Promise.all([ler('deposit'), ler('withdrawal')])
  const movimentos = [...dep.movimentos, ...saq.movimentos]
    .map((x) => ({ tipo: x.tipo as 'deposit' | 'withdrawal', valor: Math.abs(x.valor), quando: x.quando }))
    .sort((p, q) => q.quando - p.quando)
  return {
    depositos: movimentos.filter((x) => x.tipo === 'deposit').reduce((s, x) => s + x.valor, 0),
    saques: movimentos.filter((x) => x.tipo === 'withdrawal').reduce((s, x) => s + x.valor, 0),
    movimentos,
  }
}

/** O nome do tipo de contrato, como a tela de operar mostra. */
/** O mesmo nome das outras telas (PositionCard › NOMES_DE_CONTRATO): substantivo, não o verbo do botão. */
export function nomeDoTipo(tipo: string): string {
  const nomes: Record<string, string> = {
    DIGITOVER: 'Dígito acima', DIGITUNDER: 'Dígito abaixo', DIGITMATCH: 'Dígito igual', DIGITDIFF: 'Dígito diferente',
    DIGITEVEN: 'Par', DIGITODD: 'Ímpar', CALL: 'Compra', PUT: 'Venda', CALLE: 'Compra', PUTE: 'Venda',
  }
  return nomes[tipo] ?? tipo
}
