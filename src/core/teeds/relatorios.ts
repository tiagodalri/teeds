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

export type Periodo = 'hoje' | 'ontem' | '7d' | '30d' | 'mes' | 'mes-passado' | '90d' | 'personalizado'
export const PERIODOS: Array<{ id: Periodo; rotulo: string }> = [
  { id: 'hoje', rotulo: 'Hoje' }, { id: 'ontem', rotulo: 'Ontem' }, { id: '7d', rotulo: '7 dias' }, { id: '30d', rotulo: '30 dias' },
  { id: 'mes', rotulo: 'Este mês' }, { id: 'mes-passado', rotulo: 'Mês passado' }, { id: '90d', rotulo: '90 dias' },
]
export interface Intervalo { de: string; ate: string }

const FUSO = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
const dataLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export const hojeLocal = () => dataLocal(new Date())
/** O intervalo de datas (no fuso de quem vê) de cada período. */
export function intervalo(p: Periodo, agora = new Date(), personalizado?: Intervalo | null): Intervalo {
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate())
  const menos = (n: number) => new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - n)
  if (p === 'personalizado' && personalizado) return personalizado
  if (p === 'hoje' || p === 'personalizado') return { de: dataLocal(hoje), ate: dataLocal(hoje) }
  if (p === 'ontem') return { de: dataLocal(menos(1)), ate: dataLocal(menos(1)) }
  if (p === '90d') return { de: dataLocal(menos(89)), ate: dataLocal(hoje) }
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

/* ---------------------------------------------- 04/11/2026: filtros e métricas */

/** Os filtros do painel (Tiago: "só ganhadoras, só perdedoras, robôs específicos, intervalos personalizados"). */
export interface Filtros {
  resultado?: 'ganhas' | 'perdidas' | null
  estrategias?: string[]
  ativos?: string[]
  tipos?: string[]
  /** 0 = domingo … 6 = sábado */
  dias?: number[]
  horaDe?: number | null
  horaAte?: number | null
  entradaMin?: number | null
  entradaMax?: number | null
}
export const quantosFiltros = (f: Filtros) =>
  (f.resultado ? 1 : 0) + (f.estrategias?.length ? 1 : 0) + (f.ativos?.length ? 1 : 0) + (f.tipos?.length ? 1 : 0) + (f.dias?.length ? 1 : 0)
  + (f.horaDe != null || f.horaAte != null ? 1 : 0) + (f.entradaMin != null || f.entradaMax != null ? 1 : 0)

export interface OpcaoDeFiltro { id: string; nome?: string; origem?: 'ia' | 'manual'; operacoes: number }
export interface RelatorioCompleto extends Relatorio {
  de: string; ate: string
  total: Relatorio['total'] & { somaGanhos: number; somaPerdas: number }
  anterior: { de: string; ate: string; operacoes: number; ganhas: number; entradas: number; resultado: number }
  sequencias: { ganhos: number; perdas: number }
  queda: { maior: number; pico: number }
  porTipo: Array<Fatia & { tipo: string }>
  porDiaSemana: Array<Fatia & { dow: number }>
  contagem: number
  opcoes: { estrategias: OpcaoDeFiltro[]; ativos: OpcaoDeFiltro[]; tipos: OpcaoDeFiltro[]; entradaMax: number }
}

export async function relatorioCompleto(sessao: SessaoTeeds, f: { de: string; ate: string; demo: boolean; filtros: Filtros; limite?: number }): Promise<RelatorioCompleto> {
  const filtros = {
    resultado: f.filtros.resultado ?? null, estrategias: f.filtros.estrategias ?? [], ativos: f.filtros.ativos ?? [], tipos: f.filtros.tipos ?? [],
    dias: f.filtros.dias ?? [], hora_de: f.filtros.horaDe ?? null, hora_ate: f.filtros.horaAte ?? null,
    entrada_min: f.filtros.entradaMin ?? null, entrada_max: f.filtros.entradaMax ?? null,
  }
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_meu_relatorio_v2`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, p_de: f.de, p_ate: f.ate, p_fuso: FUSO, p_demo: f.demo, p_filtros: filtros, p_limite: f.limite ?? 500 }),
  })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(/até 400 dias|data final/.test(corpo?.message ?? '') ? corpo.message : 'Não foi possível montar o relatório agora.')
  }
  const r = await res.json()
  const t = r.total ?? {}
  const op = (l: any[]): OpcaoDeFiltro[] => (l ?? []).map((x) => ({ id: String(x.id ?? ''), nome: x.nome ? String(x.nome) : undefined, origem: x.origem === 'manual' ? 'manual' : x.origem ? 'ia' : undefined, operacoes: n(x.operacoes) }))
  return {
    de: String(r.de), ate: String(r.ate),
    total: { ...fatia(t), entradas: n(t.entradas), pagamentos: n(t.pagamentos), maiorGanho: n(t.maior_ganho), maiorPerda: n(t.maior_perda), primeira: t.primeira ?? null, ultima: t.ultima ?? null, somaGanhos: n(t.soma_ganhos), somaPerdas: n(t.soma_perdas) },
    anterior: { de: String(r.anterior?.de ?? ''), ate: String(r.anterior?.ate ?? ''), operacoes: n(r.anterior?.operacoes), ganhas: n(r.anterior?.ganhas), entradas: n(r.anterior?.entradas), resultado: n(r.anterior?.resultado) },
    sequencias: { ganhos: n(r.sequencias?.ganhos), perdas: n(r.sequencias?.perdas) },
    queda: { maior: n(r.queda?.maior), pico: n(r.queda?.pico) },
    porDia: (r.por_dia ?? []).map((x: any) => ({ ...fatia(x), dia: String(x.dia) })),
    porOrigem: (r.por_origem ?? []).map((x: any) => ({ ...fatia(x), origem: x.origem === 'manual' ? 'manual' : 'ia', id: String(x.id), nome: String(x.nome ?? '') })),
    porAtivo: (r.por_ativo ?? []).map((x: any) => ({ ...fatia(x), ativo: String(x.ativo ?? '') })),
    porTipo: (r.por_tipo ?? []).map((x: any) => ({ ...fatia(x), tipo: String(x.tipo ?? '') })),
    porHora: (r.por_hora ?? []).map((x: any) => ({ ...fatia(x), hora: n(x.hora) })),
    porDiaSemana: (r.por_dia_semana ?? []).map((x: any) => ({ ...fatia(x), dow: n(x.dow) })),
    contagem: n(r.contagem),
    ultimas: (r.ultimas ?? []).map((x: any) => ({
      quando: String(x.quando), origem: x.origem === 'manual' ? 'manual' : 'ia', id: String(x.id ?? ''), nome: String(x.nome ?? ''), ativo: String(x.ativo ?? ''),
      tipo: String(x.tipo ?? ''), entrada: n(x.entrada), pagamento: n(x.pagamento), resultado: n(x.resultado), ganhou: Boolean(x.ganhou),
    })),
    opcoes: { estrategias: op(r.opcoes?.estrategias), ativos: op(r.opcoes?.ativos), tipos: op(r.opcoes?.tipos), entradaMax: n(r.opcoes?.entrada_max) },
    mes: { inicio: String(r.mes?.inicio ?? ''), resultado: n(r.mes?.resultado), operacoes: n(r.mes?.operacoes) },
  }
}

export interface Dinheiro { depositos: number; saques: number; movimentos: Array<{ tipo: 'deposit' | 'withdrawal'; valor: number; quando: number }> }

/** Depósitos e saques do período, ao vivo do extrato da Deriv (só a conta conectada agora). */
export async function dinheiroDoPeriodo(socket: TeedsSocket, periodo: Periodo | Intervalo): Promise<Dinheiro> {
  const { de, ate } = typeof periodo === 'string' ? intervalo(periodo) : periodo
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
