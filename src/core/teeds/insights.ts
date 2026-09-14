/**
 * Insights — o que os clientes fazem na plataforma, agregado no banco.
 *
 * Nada aqui é calculado na tela: cada função chama uma RPC do Supabase que
 * só responde para o admin da marca (a própria função confere). O que chega
 * é pequeno: um resumo, uma série por dia, uma por hora, uma por aula.
 *
 * Localização é aproximada pelo fuso horário que o navegador do cliente
 * informa — a plataforma não guarda IP.
 */

import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'

async function rpc<T>(nome: string, token: string, corpo: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, ...corpo }),
  })
  if (!res.ok) {
    const c = await res.json().catch(() => ({}))
    throw new Error(c?.message || `Erro ${res.status} ao ler os insights`)
  }
  return (await res.json()) as T
}

export interface ResumoInsights {
  clientes: number; novos: number; ativos: number; ativosHoje: number
  acessos: number; segundos: number
  aulasPessoas: number; aulasSegundos: number; aulasConcluidas: number; comDeriv: number
}
export interface AcessoDia { dia: string; pessoas: number; acessos: number; segundos: number }
export interface AcessoHora { hora: number; acessos: number }
export interface AulaInsight { aulaId: string; pessoas: number; aberturas: number; segundos: number; concluiram: number; posicaoMedia: number; ultimaVez: string | null }
export interface Localizacao { fuso: string; idioma: string; pessoas: number; ativos30d: number }
export interface Dispositivo { dispositivo: string; pessoas: number; acessos: number }
export interface AlunoInsight { userId: string; nome: string | null; email: string | null; aulasVistas: number; aulasConcluidas: number; segundos: number; ultimaVez: string }

export async function lerResumo(sessao: SessaoTeeds, dias: number): Promise<ResumoInsights> {
  const r = await rpc<any>('teeds_insights_resumo', sessao.token, { p_dias: dias })
  if (!r) throw new Error('Só administradores desta marca veem os insights.')
  return { clientes: +r.clientes, novos: +r.novos, ativos: +r.ativos, ativosHoje: +r.ativos_hoje, acessos: +r.acessos, segundos: +r.segundos, aulasPessoas: +r.aulas_pessoas, aulasSegundos: +r.aulas_segundos, aulasConcluidas: +r.aulas_concluidas, comDeriv: +r.com_deriv }
}
export async function lerAcessosPorDia(sessao: SessaoTeeds, dias: number): Promise<AcessoDia[]> {
  const l = await rpc<any[]>('teeds_insights_acessos_dia', sessao.token, { p_dias: dias })
  return (l ?? []).map((x) => ({ dia: x.dia, pessoas: +x.pessoas, acessos: +x.acessos, segundos: +x.segundos }))
}
export async function lerAcessosPorHora(sessao: SessaoTeeds, dias: number): Promise<AcessoHora[]> {
  const l = await rpc<any[]>('teeds_insights_horas', sessao.token, { p_dias: dias })
  return (l ?? []).map((x) => ({ hora: +x.hora, acessos: +x.acessos }))
}
export async function lerAulas(sessao: SessaoTeeds, dias: number): Promise<AulaInsight[]> {
  const l = await rpc<any[]>('teeds_insights_aulas', sessao.token, { p_dias: dias })
  return (l ?? []).map((x) => ({ aulaId: x.aula_id, pessoas: +x.pessoas, aberturas: +x.aberturas, segundos: +x.segundos, concluiram: +x.concluiram, posicaoMedia: +x.posicao_media, ultimaVez: x.ultima_vez }))
}
export async function lerLocalizacoes(sessao: SessaoTeeds): Promise<Localizacao[]> {
  const l = await rpc<any[]>('teeds_insights_localizacoes', sessao.token, {})
  return (l ?? []).map((x) => ({ fuso: x.fuso, idioma: x.idioma, pessoas: +x.pessoas, ativos30d: +x.ativos_30d }))
}
export async function lerDispositivos(sessao: SessaoTeeds, dias: number): Promise<Dispositivo[]> {
  const l = await rpc<any[]>('teeds_insights_dispositivos', sessao.token, { p_dias: dias })
  return (l ?? []).map((x) => ({ dispositivo: x.dispositivo, pessoas: +x.pessoas, acessos: +x.acessos }))
}
export async function lerAlunos(sessao: SessaoTeeds, limite = 30): Promise<AlunoInsight[]> {
  const l = await rpc<any[]>('teeds_insights_alunos', sessao.token, { p_limite: limite })
  return (l ?? []).map((x) => ({ userId: x.user_id, nome: x.nome, email: x.email, aulasVistas: +x.aulas_vistas, aulasConcluidas: +x.aulas_concluidas, segundos: +x.segundos, ultimaVez: x.ultima_vez }))
}

/* ------------------------------------------------ coleta (lado do aluno) */

/** Computador, celular ou tablet — o que dá para saber sem perguntar. */
export function dispositivoAtual(): string {
  const ua = navigator.userAgent
  const dados = (navigator as any).userAgentData
  if (dados?.mobile) return 'celular'
  if (/iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet'
  if (/Mobi|Android|iPhone/i.test(ua)) return 'celular'
  return 'computador'
}

/**
 * Registra o que aconteceu numa aula: abriu, assistiu N segundos (até 120
 * por chamada), chegou até tal posição, concluiu. Falha em silêncio — a
 * aula nunca depende disso.
 */
export async function registrarAula(sessao: SessaoTeeds | null | undefined, aulaId: string, dados: { segundos?: number; posicao?: number; concluida?: boolean; abriu?: boolean }): Promise<void> {
  if (!sessao) return
  try {
    await rpc('teeds_registrar_aula', sessao.token, {
      p_aula: aulaId, p_segundos: Math.max(0, Math.round(dados.segundos ?? 0)), p_posicao: Math.min(1, Math.max(0, dados.posicao ?? 0)),
      p_concluida: Boolean(dados.concluida), p_abriu: Boolean(dados.abriu),
    })
  } catch (e) {
    console.warn('[insights] nao consegui registrar a aula:', (e as Error).message)
  }
}

/* ------------------------------------------------ nomes para a tela */

/** "America/Sao_Paulo" → "São Paulo · Brasil". Só o que dá para saber pelo fuso. */
export function lugarDoFuso(fuso: string): { lugar: string; pais: string } {
  if (!fuso) return { lugar: 'Não informado', pais: '' }
  const tabela: Record<string, [string, string]> = {
    'America/Sao_Paulo': ['São Paulo', 'Brasil'], 'America/Bahia': ['Bahia', 'Brasil'], 'America/Fortaleza': ['Fortaleza', 'Brasil'],
    'America/Recife': ['Recife', 'Brasil'], 'America/Belem': ['Belém', 'Brasil'], 'America/Manaus': ['Manaus', 'Brasil'],
    'America/Cuiaba': ['Cuiabá', 'Brasil'], 'America/Campo_Grande': ['Campo Grande', 'Brasil'], 'America/Porto_Velho': ['Porto Velho', 'Brasil'],
    'America/Rio_Branco': ['Rio Branco', 'Brasil'], 'America/Maceio': ['Maceió', 'Brasil'], 'America/Araguaina': ['Araguaína', 'Brasil'],
    'America/Boa_Vista': ['Boa Vista', 'Brasil'], 'America/Santarem': ['Santarém', 'Brasil'], 'America/Noronha': ['Fernando de Noronha', 'Brasil'],
    'America/Eirunepe': ['Eirunepé', 'Brasil'],
    'America/Buenos_Aires': ['Buenos Aires', 'Argentina'], 'America/Argentina/Buenos_Aires': ['Buenos Aires', 'Argentina'],
    'America/Santiago': ['Santiago', 'Chile'], 'America/Montevideo': ['Montevidéu', 'Uruguai'], 'America/Asuncion': ['Assunção', 'Paraguai'],
    'America/La_Paz': ['La Paz', 'Bolívia'], 'America/Lima': ['Lima', 'Peru'], 'America/Bogota': ['Bogotá', 'Colômbia'],
    'America/Caracas': ['Caracas', 'Venezuela'], 'America/Mexico_City': ['Cidade do México', 'México'],
    'America/New_York': ['Nova York', 'EUA'], 'America/Chicago': ['Chicago', 'EUA'], 'America/Denver': ['Denver', 'EUA'], 'America/Los_Angeles': ['Los Angeles', 'EUA'],
    'America/Toronto': ['Toronto', 'Canadá'], 'Europe/Lisbon': ['Lisboa', 'Portugal'], 'Atlantic/Azores': ['Açores', 'Portugal'],
    'Europe/Madrid': ['Madri', 'Espanha'], 'Europe/London': ['Londres', 'Reino Unido'], 'Europe/Paris': ['Paris', 'França'],
    'Europe/Berlin': ['Berlim', 'Alemanha'], 'Europe/Rome': ['Roma', 'Itália'], 'Europe/Dublin': ['Dublin', 'Irlanda'],
    'Europe/Zurich': ['Zurique', 'Suíça'], 'Europe/Amsterdam': ['Amsterdã', 'Holanda'], 'Africa/Luanda': ['Luanda', 'Angola'],
    'Africa/Maputo': ['Maputo', 'Moçambique'], 'Asia/Tokyo': ['Tóquio', 'Japão'], 'Asia/Dubai': ['Dubai', 'Emirados'],
    'Australia/Sydney': ['Sydney', 'Austrália'],
  }
  const t = tabela[fuso]
  if (t) return { lugar: t[0], pais: t[1] }
  const partes = fuso.split('/')
  return { lugar: (partes[partes.length - 1] || fuso).replace(/_/g, ' '), pais: partes[0] === 'America' ? 'Américas' : partes[0] || '' }
}

export function idiomaLegivel(codigo: string): string {
  if (!codigo) return '—'
  const base = codigo.toLowerCase()
  if (base.startsWith('pt-br')) return 'Português (Brasil)'
  if (base.startsWith('pt')) return 'Português'
  if (base.startsWith('es')) return 'Espanhol'
  if (base.startsWith('en')) return 'Inglês'
  if (base.startsWith('fr')) return 'Francês'
  if (base.startsWith('it')) return 'Italiano'
  if (base.startsWith('de')) return 'Alemão'
  return codigo
}

export function horasLegiveis(segundos: number): string {
  const h = Math.floor(segundos / 3600), m = Math.round((segundos % 3600) / 60)
  if (h >= 100) return `${h} h`
  if (h) return `${h} h ${m} min`
  return `${m} min`
}
