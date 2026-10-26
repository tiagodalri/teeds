import type { WorkspacePage } from '../components/WorkspaceNav'
import { MARCA } from '../marca'
import { parceiroGuardado } from './teeds/parceiro'

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
  /v/manual"). Na GlobalFly, quem é de um parceiro navega com o código dele na
  frente de toda tela. Logado, vale o parceiro da conta (o banco diz); antes de
  entrar, o do link guardado no navegador. A tela inicial vira /n/inicio: o /n
  sozinho continua sendo o link de cadastro.
*/
let parceiroDaConta: string | null | undefined
/** Logado: o parceiro da conta (null = sem parceiro). undefined volta a seguir o link guardado. */
export function definirParceiroDoEndereco(codigo: string | null | undefined): void { parceiroDaConta = codigo }
const codigosDeParceiro = () => MARCA.parceiros ?? []
/** O parceiro que vale agora: o da conta (logado) ou o do link guardado; '' = nenhum. */
export function parceiroVigente(): string {
  if (!codigosDeParceiro().length) return ''
  const c = parceiroDaConta === undefined ? parceiroGuardado() : parceiroDaConta
  return c && codigosDeParceiro().includes(c) ? c : ''
}
/** O link de abrir conta na Deriv: o do parceiro, quando ele tem um; senão, o da marca. */
export const afiliadoDaDeriv = (): string => MARCA.afiliadosDosParceiros?.[parceiroVigente()] ?? MARCA.afiliado
function prefixo(): string {
  if (!codigosDeParceiro().length) return ''
  const c = parceiroDaConta === undefined ? parceiroGuardado() : parceiroDaConta
  return c && codigosDeParceiro().includes(c) ? `/${c}` : ''
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
