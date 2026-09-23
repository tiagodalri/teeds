/**
 * O cliente HTTP do painel "Controle dos robôs" (22/09/2026).
 *
 * Fala com as rotas /api/parametros-robos/:robo[/ação] do servidor, sempre
 * na marca que o admin está administrando (`marcaAdmin()`): a Teeds é a
 * plataforma master e o admin dela pode ajustar qualquer whitelabel pelo
 * seletor do painel. O servidor confere a autorização; aqui só se manda.
 *
 * Erros de validação chegam como `{ erro, erros[] }` (400) e viram
 * `ErroDeParametros` com a lista em pt-BR, pronta para a tela.
 */
import type { ParametrosDoRobo } from '../deriv/parametros'
import type { SessaoTeeds } from './conta'
import { SERVIDOR } from './config'
import { marcaAdmin } from './clientes'

export interface SessoesVivas { total: number; porVersao: Record<string, number> }

/** O que o GET devolve: tudo o que o painel de um robô precisa para abrir. */
export interface DetalheDoRobo {
  padrao: ParametrosDoRobo
  publicado: ParametrosDoRobo
  testeDemo: ParametrosDoRobo | null
  rascunho: ParametrosDoRobo | null
  rascunhoEm: string | null
  /** null = o robô ainda roda o padrão do código (sem linha no banco). */
  versao: number | null
  ultimaAcao: string | null
  observacao: string | null
  publicadoEm: string | null
  atualizadoEm: string | null
  atualizadoPor: { id: string; nome: string | null } | null
  sessoesVivas: SessoesVivas
  /** "OMNI Over", "Teeds - AG7": o que o admin digita para confirmar. */
  nomeNaMarca: string
}

export interface ItemHistorico {
  versao: number
  acao: string
  observacao: string | null
  alteradoEm: string
  alteradoPor: { id: string | null; nome: string | null }
  parametros: ParametrosDoRobo
  simulacao: unknown | null
  diff: Array<{ campo: string; de: string; para: string }>
  sessoesQueRodaram: number
}

/** O que as ações (publicar, testar, promover, descartar, restaurar) devolvem. */
export interface RespostaAcao {
  versao: number | null
  parametros?: ParametrosDoRobo
  testeDemo?: ParametrosDoRobo | null
  rascunho?: ParametrosDoRobo | null
  publicadoEm?: string
  atualizadoEm?: string
  restauradoPadrao?: boolean
  /** Sessões em andamento que receberam a regra nova agora (vale na próxima operação). */
  sessoesAtualizadas: number
  sessoesVivas: SessoesVivas
}

export class ErroDeParametros extends Error {
  erros: string[]
  status: number
  constructor(mensagem: string, erros: string[], status: number) {
    super(mensagem)
    this.erros = erros
    this.status = status
  }
}

async function chamar<T>(sessao: SessaoTeeds, roboId: string, acao: string | null, corpo?: unknown): Promise<T> {
  const caminho = `${SERVIDOR.url}/api/parametros-robos/${encodeURIComponent(roboId)}${acao ? `/${acao}` : ''}?marca=${encodeURIComponent(marcaAdmin())}`
  const r = await fetch(caminho, {
    method: corpo === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  })
  const dados = await r.json().catch(() => ({}))
  if (!r.ok) throw new ErroDeParametros(dados.erro ?? 'O servidor não respondeu.', Array.isArray(dados.erros) ? dados.erros : [], r.status)
  return dados as T
}

export const lerParametros = (sessao: SessaoTeeds, roboId: string) => chamar<DetalheDoRobo>(sessao, roboId, null)
export const lerHistorico = async (sessao: SessaoTeeds, roboId: string) =>
  (await chamar<{ itens: ItemHistorico[]; sessoesPorVersao: Record<string, number> }>(sessao, roboId, 'historico')).itens
/** `null` descarta o rascunho. */
export const salvarRascunho = (sessao: SessaoTeeds, roboId: string, rascunho: ParametrosDoRobo | null) =>
  chamar<{ salvoEm: string | null; versao: number }>(sessao, roboId, 'rascunho', { rascunho })
export const publicarParametros = (sessao: SessaoTeeds, roboId: string, parametros: ParametrosDoRobo, observacao: string, confirmacao: string, simulacao: unknown) =>
  chamar<RespostaAcao>(sessao, roboId, 'publicar', { parametros, observacao, confirmacao, simulacao })
export const testarNoDemo = (sessao: SessaoTeeds, roboId: string, parametros: ParametrosDoRobo, observacao: string) =>
  chamar<RespostaAcao>(sessao, roboId, 'testar-demo', { parametros, observacao })
export const promoverDemo = (sessao: SessaoTeeds, roboId: string, observacao: string, confirmacao: string) =>
  chamar<RespostaAcao>(sessao, roboId, 'promover-demo', { observacao, confirmacao })
export const descartarTeste = (sessao: SessaoTeeds, roboId: string) =>
  chamar<RespostaAcao>(sessao, roboId, 'descartar-teste', {})
export const restaurarVersao = (sessao: SessaoTeeds, roboId: string, versao: number | 'padrao', confirmacao: string) =>
  chamar<RespostaAcao>(sessao, roboId, 'restaurar', { versao, confirmacao })
