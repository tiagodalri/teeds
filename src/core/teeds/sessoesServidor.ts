import { SUPABASE, autenticacaoConfigurada } from './config'
import type { SessaoTeeds } from './conta'

/**
 * O navegador assistindo aos robôs que rodam no servidor.
 *
 * A partir daqui a tela não é a dona do robô: ela é o visor. Quem opera é o
 * servidor em Nova York, e o que aparece aqui é o reflexo — as sessões e as
 * operações que ele grava no Supabase. Isso vale para o robô ligado pelo
 * chat, pelo MCP ou por qualquer outro caminho: um só lugar executa, e todo
 * mundo olha para o mesmo registro.
 *
 * O acompanhamento é por consulta repetida, não por Realtime. Duas razões:
 * o resto da Teeds fala com o banco por REST puro, sem biblioteca, e uma
 * sessão de robô muda no ritmo de uma operação por segundo — meio segundo
 * de atraso na tela não muda decisão nenhuma. O Realtime continua ligado no
 * banco e pode assumir depois, sem mexer em quem chama isto aqui.
 */

const cabecalhos = (token: string) => ({
  apikey: SUPABASE.anonKey,
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
})

async function rest<T>(caminho: string, token: string): Promise<T> {
  const res = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, { headers: cabecalhos(token) })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({} as any))
    throw new Error(corpo?.message || `Erro ${res.status} ao ler as sessões`)
  }
  return (await res.json().catch(() => undefined)) as T
}

export interface SessaoServidor {
  id: string
  sessaoRef: string | null
  contaId: string
  demo: boolean
  moeda: string
  roboId: string
  roboNome: string
  ativo: string
  origem: 'navegador' | 'chat' | 'api' | string
  entradaInicial: number
  entradaAtual: number
  stopLoss: number
  takeProfit: number
  maxOperacoes: number
  situacao: 'rodando' | 'encerrada' | 'erro' | string
  operacoes: number
  ganhas: number
  perdidas: number
  resultado: number
  movimentado: number
  motivoDaParada: string | null
  erro: string | null
  criadaEm: string
  encerradaEm: string | null
}

export interface OperacaoServidor {
  contractId: number
  seq: number | null
  executadaEm: string
  entrada: number
  precoEntrada: number | null
  digitoEntrada: number | null
  precoSaida: number | null
  digitoSaida: number | null
  resultado: number
  acumulado: number | null
  ganhou: boolean
  roboNome: string
}

const paraSessao = (l: any): SessaoServidor => ({
  id: l.id,
  sessaoRef: l.sessao_ref ?? null,
  contaId: l.conta_id,
  demo: Boolean(l.demo),
  moeda: l.moeda ?? 'USD',
  roboId: l.robo_id,
  roboNome: l.robo_nome,
  ativo: l.ativo,
  origem: l.origem ?? 'chat',
  entradaInicial: Number(l.entrada_inicial ?? 0),
  entradaAtual: Number(l.entrada_atual ?? 0),
  stopLoss: Number(l.stop_loss ?? 0),
  takeProfit: Number(l.take_profit ?? 0),
  maxOperacoes: Number(l.max_operacoes ?? 0),
  situacao: l.situacao ?? 'rodando',
  operacoes: Number(l.operacoes ?? 0),
  ganhas: Number(l.ganhas ?? 0),
  perdidas: Number(l.perdidas ?? 0),
  resultado: Number(l.resultado ?? 0),
  movimentado: Number(l.movimentado ?? 0),
  motivoDaParada: l.motivo_da_parada ?? null,
  erro: l.erro ?? null,
  criadaEm: l.criada_em,
  encerradaEm: l.encerrada_em ?? null,
})

const paraOperacao = (l: any): OperacaoServidor => ({
  contractId: Number(l.contract_id),
  seq: l.seq === null || l.seq === undefined ? null : Number(l.seq),
  executadaEm: l.executada_em,
  entrada: Number(l.entrada ?? 0),
  precoEntrada: l.preco_entrada === null || l.preco_entrada === undefined ? null : Number(l.preco_entrada),
  digitoEntrada: l.digito_entrada === null || l.digito_entrada === undefined ? null : Number(l.digito_entrada),
  precoSaida: l.preco_saida === null || l.preco_saida === undefined ? null : Number(l.preco_saida),
  digitoSaida: l.digito_saida === null || l.digito_saida === undefined ? null : Number(l.digito_saida),
  resultado: Number(l.resultado ?? 0),
  acumulado: l.acumulado === null || l.acumulado === undefined ? null : Number(l.acumulado),
  ganhou: Boolean(l.ganhou),
  roboNome: l.robo_nome ?? '',
})

/**
 * As sessões do próprio usuário — as vivas e as encerradas há pouco.
 *
 * As regras de acesso do banco já limitam ao dono; o filtro por data é só
 * para a tela não carregar semanas de histórico que ninguém vai olhar.
 */
export async function listarSessoes(sessao: SessaoTeeds, horas = 12): Promise<SessaoServidor[]> {
  if (!autenticacaoConfigurada()) return []
  const corte = new Date(Date.now() - horas * 3600_000).toISOString()
  try {
    const linhas = await rest<any[]>(
      `/sessoes_robos?select=*&criada_em=gte.${encodeURIComponent(corte)}&order=criada_em.desc&limit=40`,
      sessao.token,
    )
    return (linhas ?? []).map(paraSessao)
  } catch {
    // banco fora do ar não pode derrubar a tela de robôs
    return []
  }
}

/** O extrato de uma sessão, da mais recente para a mais antiga. */
export async function operacoesDaSessao(
  sessao: SessaoTeeds, sessaoId: string, limite = 200,
): Promise<OperacaoServidor[]> {
  if (!autenticacaoConfigurada()) return []
  try {
    const linhas = await rest<any[]>(
      `/operacoes_robos?select=contract_id,seq,executada_em,entrada,preco_entrada,digito_entrada,preco_saida,digito_saida,resultado,acumulado,ganhou,robo_nome` +
      `&sessao_id=eq.${encodeURIComponent(sessaoId)}&order=seq.desc&limit=${limite}`,
      sessao.token,
    )
    return (linhas ?? []).map(paraOperacao)
  } catch {
    return []
  }
}

/**
 * Acompanha as sessões enquanto a tela estiver aberta.
 *
 * O ritmo muda com o que está acontecendo: rápido quando há robô operando,
 * devagar quando não há. Uma aba escondida não consulta nada — não adianta
 * gastar bateria desenhando o que ninguém está vendo, e ao voltar o foco a
 * primeira consulta é imediata.
 */
export function acompanharSessoes(
  sessao: SessaoTeeds,
  aoAtualizar: (sessoes: SessaoServidor[]) => void,
  intervaloRodando = 1500,
  intervaloParado = 10_000,
): () => void {
  let vivo = true
  let timer: ReturnType<typeof setTimeout> | null = null

  const ciclo = async () => {
    if (!vivo) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      timer = setTimeout(ciclo, intervaloParado)
      return
    }
    const lista = await listarSessoes(sessao)
    if (!vivo) return
    aoAtualizar(lista)
    const rodando = lista.some((s) => s.situacao === 'rodando')
    timer = setTimeout(ciclo, rodando ? intervaloRodando : intervaloParado)
  }

  const aoVoltar = () => {
    if (document.visibilityState === 'visible' && vivo) {
      if (timer) clearTimeout(timer)
      void ciclo()
    }
  }

  void ciclo()
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aoVoltar)

  return () => {
    vivo = false
    if (timer) clearTimeout(timer)
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', aoVoltar)
  }
}
