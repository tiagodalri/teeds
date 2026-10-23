/**
 * Onde ficam os indicadores e os desenhos de cada pessoa (19/10/2026).
 *
 * Indicadores valem para todos os ativos (linha `simbolo = '*'`); desenhos
 * são de cada ativo. Guarda primeiro no navegador (a tela abre na hora, sem
 * esperar a rede) e manda ao banco um segundo depois da última mudança, para
 * acompanhar a pessoa em qualquer aparelho. Sem conta, fica só no navegador.
 */
import { SUPABASE } from '../teeds/config'
import type { SessaoTeeds } from '../teeds/conta'
import { MARCA } from '../../marca'

export interface IndicadorSalvo {
  id: string
  params: number[]
  /** Uma cor por linha do indicador (na ordem das linhas). */
  cores?: string[]
  espessura?: number
}

export interface DesenhoSalvo {
  nome: string
  pontos: Array<{ timestamp?: number; value?: number }>
  cor: string
  espessura: number
  tracejado: boolean
  travado: boolean
  texto?: string
}

/** O Sinal GF (23/10/2026) vem ligado na GlobalFly: quem abre o gráfico já vê as setas. */
const SINAL_GF: IndicadorSalvo = { id: 'GF_SINAL', params: [20, 1.8, 3] }
const COM_SINAL = MARCA.id === 'globalfly'
export const INDICADORES_PADRAO: IndicadorSalvo[] = COM_SINAL ? [SINAL_GF] : [{ id: 'MA', params: [20] }]

interface Guardado { indicadores: IndicadorSalvo[]; sinalOferecido?: boolean }
/**
 * Quem já tinha indicadores salvos antes do Sinal GF ganha ele uma vez. A
 * marca `sinalOferecido` fica gravada junto: se a pessoa tirar o sinal, ele
 * não volta sozinho.
 */
function oferecerSinal(d: Guardado): IndicadorSalvo[] {
  if (!COM_SINAL || d.sinalOferecido || d.indicadores.some((i) => i.id === SINAL_GF.id)) return d.indicadores
  return [SINAL_GF, ...d.indicadores]
}

const chaveLocal = (simbolo: string) => `${MARCA.id}.grafico.${simbolo}`

function lerLocal<T>(simbolo: string): T | null {
  try { const b = localStorage.getItem(chaveLocal(simbolo)); return b ? (JSON.parse(b) as T) : null } catch { return null }
}
function gravarLocal(simbolo: string, dados: unknown) {
  try { localStorage.setItem(chaveLocal(simbolo), JSON.stringify(dados)) } catch { /* sem espaço: segue no banco */ }
}

async function lerBanco<T>(sessao: SessaoTeeds, simbolo: string): Promise<T | null> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/grafico_layouts?select=dados&marca=eq.${MARCA.id}&simbolo=eq.${encodeURIComponent(simbolo)}`, {
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
  })
  if (!r.ok) return null
  const [linha] = (await r.json()) as Array<{ dados: T }>
  return linha?.dados ?? null
}

async function gravarBanco(sessao: SessaoTeeds, simbolo: string, dados: unknown) {
  await fetch(`${SUPABASE.url}/rest/v1/grafico_layouts?on_conflict=user_id,marca,simbolo`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ user_id: sessao.usuario.id, marca: MARCA.id, simbolo, dados, atualizado_em: new Date().toISOString() }),
  }).catch(() => undefined)
}

const pendentes = new Map<string, number>()
function agendar(sessao: SessaoTeeds | null, simbolo: string, dados: unknown) {
  gravarLocal(simbolo, dados)
  if (!sessao) return
  window.clearTimeout(pendentes.get(simbolo))
  pendentes.set(simbolo, window.setTimeout(() => { pendentes.delete(simbolo); void gravarBanco(sessao, simbolo, dados) }, 1000))
}

/** Os indicadores: o do navegador na hora; o do banco quando chegar (se houver). */
export function carregarIndicadores(sessao: SessaoTeeds | null, aoChegar: (lista: IndicadorSalvo[]) => void): IndicadorSalvo[] {
  const usar = (d: Guardado) => {
    const lista = oferecerSinal(d)
    if (lista !== d.indicadores || (COM_SINAL && !d.sinalOferecido)) salvarIndicadores(sessao, lista)
    return lista
  }
  const local = lerLocal<Guardado>('*')
  if (sessao) void lerBanco<Guardado>(sessao, '*').then((d) => { if (d?.indicadores) { gravarLocal('*', d); aoChegar(usar(d)) } })
  return local?.indicadores ? usar(local) : INDICADORES_PADRAO
}
export const salvarIndicadores = (sessao: SessaoTeeds | null, indicadores: IndicadorSalvo[]) => agendar(sessao, '*', COM_SINAL ? { indicadores, sinalOferecido: true } : { indicadores })

/** Os desenhos de um ativo: o do navegador na hora; o do banco quando chegar. */
export function carregarDesenhos(sessao: SessaoTeeds | null, simbolo: string, aoChegar: (lista: DesenhoSalvo[]) => void): DesenhoSalvo[] {
  const local = lerLocal<{ desenhos: DesenhoSalvo[] }>(simbolo)?.desenhos
  if (sessao) void lerBanco<{ desenhos: DesenhoSalvo[] }>(sessao, simbolo).then((d) => { if (d?.desenhos) { gravarLocal(simbolo, d); aoChegar(d.desenhos) } })
  return local ?? []
}
export const salvarDesenhos = (sessao: SessaoTeeds | null, simbolo: string, desenhos: DesenhoSalvo[]) => agendar(sessao, simbolo, { desenhos })
