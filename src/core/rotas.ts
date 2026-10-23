import type { WorkspacePage } from '../components/WorkspaceNav'
import { MARCA } from '../marca'

/**
 * O endereço de cada tela (23/10/2026, Tiago: "globalflytrade.com/ia,
 * /manual, /gerenciamento — páginas bem separadas"). A barra de endereço
 * acompanha o menu; o link de uma tela abre direto nela; o Voltar do
 * navegador volta para a tela anterior.
 *
 * Link direto num site estático (GitHub Pages): o servidor não conhece
 * /ia, devolve o 404.html, que manda para /?tela=ia; a plataforma abre a tela
 * e volta o endereço para /ia (vite.config.ts monta o 404.html).
 */
const GF = MARCA.id === 'globalfly'
const SLUG: Record<WorkspacePage, string> = {
  inicio: 'inicio',
  operar: GF ? 'manual' : 'operar',
  robos: GF ? 'ia' : 'robos',
  assistente: 'assistente',
  gerenciamento: 'gerenciamento',
  aovivo: 'ao-vivo',
  aulas: 'aulas',
  noticias: 'noticias',
  marketplace: 'marketplace',
  perfil: 'perfil',
  ajuda: 'ajuda',
  gestao: 'admin',
  insights: 'insights',
  monitoramento: 'monitoramento',
}
/** Os outros nomes que também abrem a tela (o de outra marca, o antigo, sem hífen). */
const APELIDOS: Record<string, WorkspacePage> = {
  operar: 'operar', manual: 'operar', robos: 'robos', ia: 'robos', 'ao-vivo': 'aovivo', aovivo: 'aovivo',
  admin: 'gestao', administracao: 'gestao', gestao: 'gestao',
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

/** "/ia" para a tela de robôs da GlobalFly. A tela inicial da marca fica na raiz. */
export function caminhoDaTela(tela: WorkspacePage): string {
  const padrao: WorkspacePage = MARCA.inicio ? 'inicio' : 'operar'
  return tela === padrao ? `${base}/` : `${base}/${SLUG[tela]}`
}

/** A tela de um nome de endereço ("ia", "ao-vivo", "manual"…), ou null. */
export function telaDoNome(nome: string | null | undefined): WorkspacePage | null {
  const n = (nome ?? '').toLowerCase().replace(/\/+$/, '')
  if (!n) return null
  if (APELIDOS[n]) return APELIDOS[n]
  const achada = (Object.keys(SLUG) as WorkspacePage[]).find((t) => SLUG[t] === n || t === n)
  return achada ?? null
}

/** A tela do endereço atual ("/ia" → robos), ou null na raiz e em endereços desconhecidos. */
export function telaDoCaminho(caminho: string): WorkspacePage | null {
  const resto = caminho.startsWith(base) ? caminho.slice(base.length) : caminho
  return telaDoNome(resto.split('/').filter(Boolean)[0])
}
