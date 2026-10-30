import type { WorkspacePage } from '../components/WorkspaceNav'
import { MARCA } from '../marca'
import { vitrine } from './teeds/parceiro'

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
  multiplicadores: 'multiplicadores',
  robos: GF ? 'ia' : 'robos',
  assistente: 'assistente',
  gerenciamento: 'gerenciamento',
  relatorios: 'relatorios',
  aovivo: 'ao-vivo',
  aulas: 'aulas',
  noticias: 'noticias',
  marketplace: 'marketplace',
  perfil: 'perfil',
  ajuda: 'ajuda',
  gestao: 'admin',
  insights: 'insights',
  monitoramento: 'monitoramento',
  laboratorio: 'laboratorio',
  divulgacao: 'divulgacao',
}
/** Os outros nomes que também abrem a tela (o de outra marca, o antigo, sem hífen). */
const APELIDOS: Record<string, WorkspacePage> = {
  operar: 'operar', manual: 'operar', robos: 'robos', ia: 'robos', 'ao-vivo': 'aovivo', aovivo: 'aovivo',
  admin: 'gestao', administracao: 'gestao', gestao: 'gestao',
  'laboratorio-de-ia': 'laboratorio', lab: 'laboratorio',
}

const base = import.meta.env.BASE_URL.replace(/\/$/, '')

/*
  O PARCEIRO NO ENDEREÇO (27/10/2026, Tiago: "quando entro em /n ou /v essa
  descrição some... gostaria que ficasse sempre: globalflytrade.com/n/noticias,
  /v/manual"). Na GlobalFly, toda tela leva na frente o código da VITRINE: o
  endereço em que a pessoa entrou (/n, /v). Desde a regra "o parceiro vale pela
  URL" (mesmo dia), quem decide é o endereço, não a conta: um cliente em comum
  é do Naor no /n e do Victor no /v. A tela inicial vira /n/inicio: o /n
  sozinho continua sendo o link de cadastro.
*/
const codigosDeParceiro = () => MARCA.parceiros ?? []
/** O parceiro que vale agora: o da vitrine (o endereço); '' = direto. */
export function parceiroVigente(): string { return vitrine() }
/** O link de abrir conta na Deriv: o do parceiro da vitrine, quando ele tem um; senão, o da marca. */
export const afiliadoDaDeriv = (): string => MARCA.afiliadosDosParceiros?.[parceiroVigente()] ?? MARCA.afiliado
/** A comunidade no WhatsApp: a do parceiro da vitrine, quando ele tem uma; senão, a da marca. */
export const comunidadeDaVitrine = (): string | undefined => MARCA.comunidadesDosParceiros?.[parceiroVigente()] ?? MARCA.comunidade
function prefixo(): string {
  const c = parceiroVigente()
  return c ? `/${c}` : ''
}

/** "/ia" para a tela de robôs da GlobalFly. A tela inicial da marca fica na raiz. */
export function caminhoDaTela(tela: WorkspacePage): string {
  const padrao: WorkspacePage = MARCA.inicio ? 'inicio' : 'operar'
  const p = prefixo()
  if (p) return `${base}${p}/${SLUG[tela]}`
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
  const partes = resto.split('/').filter(Boolean)
  if (partes.length && codigosDeParceiro().includes(partes[0])) partes.shift()
  return telaDoNome(partes[0])
}
