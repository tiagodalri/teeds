/**
 * O cadastro de clientes da Teeds, no Supabase.
 *
 * Cada usuario grava (e enxerga) so o proprio registro — as regras de RLS
 * garantem isso no servidor, nao aqui. Administradores (tabela
 * `administradores`) leem tudo: e o que alimenta a visao de clientes no
 * painel de Gestao.
 *
 * Tres tabelas: `clientes` (um por usuario, espelho do cadastro),
 * `contas_deriv` (cada conta da corretora que ele conectou) e
 * `comissoes_diarias` (a comissao agregada por conta e por dia, que o
 * proprio app envia). Tudo em REST puro (PostgREST), sem biblioteca,
 * como o resto da Teeds.
 */

import { SUPABASE, autenticacaoConfigurada } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import { MARCAS } from '../../marca/marcas'
import { PLANOS_CLIENTE, planoClienteValido } from './planos'
import { dispositivoAtual } from './insights'

function cabecalhos(token: string): Record<string, string> {
  return {
    apikey: SUPABASE.anonKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

async function rest<T>(caminho: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
    ...init,
    headers: { ...cabecalhos(token), ...(init.headers as Record<string, string> ?? {}) },
  })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({}))
    throw new Error(corpo?.message || `Erro ${res.status} ao falar com o banco da ${MARCA.prosa}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json().catch(() => undefined)) as T
}

/** Grava; se a linha ja existir, atualiza — o upsert do PostgREST. */
const MESCLAR = { Prefer: 'resolution=merge-duplicates,return=minimal' }

/* --------------------------------------------------------- escrita */

/**
 * Registra (ou atualiza) o proprio cliente: espelho do cadastro + visto_em.
 * Chamado ao abrir a plataforma logado. Falha em silencio: o cadastro e
 * util, nunca condicao para operar.
 */
const sessaoDeUso = (() => { try { const k=`${MARCA.id}.sessao-uso`; const v=sessionStorage.getItem(k); if(v)return v; const n=crypto.randomUUID(); sessionStorage.setItem(k,n); return n } catch { return `${Date.now()}-${Math.random()}` } })()

/**
 * A marca que as telas de ADMINISTRAÇÃO estão olhando.
 *
 * A Teeds é a plataforma master: as outras (OMNI e as próximas) são
 * whitelabels. Só o admin da Teeds troca o foco; nas outras marcas isto
 * fica preso na própria. O banco confere de novo, em `teeds_sou_admin_da`
 * — a tela escolher não é permissão, é só o filtro.
 *
 * Leituras seguem o foco. ESCRITAS continuam na marca do site: criar acesso,
 * salvar plano e liberar produto acontecem sempre em casa.
 */
/**
 * O foco pode ser uma marca ou a rede inteira.
 *
 * 'todas' é a visão da rede: a Teeds e as whitelabels somadas no mesmo
 * número. Quem administra uma whitelabel pode pedir 'todas' à vontade — o
 * banco devolve só a marca dele.
 */
export const REDE = 'todas'
let marcaEmFoco = MARCA.id
export const marcaAdmin = () => marcaEmFoco
export const ehMaster = () => MARCA.id === 'teeds'
export const vendoARede = () => marcaEmFoco === REDE
/** As marcas que o foco atual abrange, para os filtros REST. */
export const marcasEmFoco = (): string[] =>
  marcaEmFoco === REDE ? Object.keys(MARCAS) : [marcaEmFoco]
/** `marca=eq.teeds` ou `marca=in.(teeds,omni)`, conforme o foco. */
const filtroMarca = (campo = 'marca'): string => {
  const lista = marcasEmFoco()
  return lista.length === 1 ? `${campo}=eq.${lista[0]}` : `${campo}=in.(${lista.join(',')})`
}
export function definirMarcaAdmin(id: string): void {
  marcaEmFoco = ehMaster() || id === REDE ? id : MARCA.id
}

/**
 * A situação da própria ficha: liberada ou ainda esperando aprovação.
 *
 * Desde 30/09/2026 a conta de acesso nasce no cadastro, para a senha
 * provisória poder ir por e-mail na hora. Quem ainda não foi aprovado entra
 * na plataforma e encontra a tela de espera — e quem decide isso é o banco,
 * não a tela: a ficha nasce 'pendente' e só a aprovação a torna 'ativo'.
 * Um gatilho impede que a própria pessoa mexa nesse campo.
 *
 * Erro de rede devolve 'ativo': uma consulta que falhou não pode trancar
 * quem já é cliente do lado de fora da própria plataforma.
 */
export type SituacaoDaFicha = 'pendente' | 'ativo' | 'suspenso' | 'expirado' | 'cancelado'
export async function minhaSituacao(sessao: SessaoTeeds): Promise<SituacaoDaFicha> {
  if (!autenticacaoConfigurada()) return 'ativo'
  try {
    const linhas = await rest<any[]>(
      `/clientes?select=status_acesso&marca=eq.${MARCA.id}&user_id=eq.${sessao.usuario.id}&limit=1`,
      sessao.token,
    )
    const s = linhas?.[0]?.status_acesso
    return s === 'pendente' ? 'pendente' : (s ?? 'ativo')
  } catch { return 'ativo' }
}

export async function registrarPresenca(sessao: SessaoTeeds, segundos = 0): Promise<void> {
  if (!autenticacaoConfigurada()) return
  const u = sessao.usuario
  try {
    await rest('/clientes?on_conflict=user_id,marca', sessao.token, {
      method: 'POST',
      headers: MESCLAR,
      body: JSON.stringify({
        user_id: u.id,
        // Em qual plataforma esta pessoa entrou. É o que separa a lista de
        // clientes de cada admin.
        marca: MARCA.id,
        nome: u.nome,
        email: u.email,
        telefone: u.telefone,
        cpf: u.cpf,
        visto_em: new Date().toISOString(),
      }),
    })
    await rest('/rpc/teeds_registrar_acesso', sessao.token, { method:'POST', body:JSON.stringify({ p_marca:MARCA.id, p_sessao:sessaoDeUso, p_segundos:Math.max(0,Math.round(segundos)), p_fuso:Intl.DateTimeFormat().resolvedOptions().timeZone||null, p_idioma:navigator.language||null, p_dispositivo:dispositivoAtual() }) })
  } catch (e) {
    console.warn('[teeds] nao consegui registrar a presenca:', (e as Error).message)
  }
}

/** A conta Deriv que a pessoa conectou agora. */
/**
 * Liga esta conta da corretora a este login — e diz quando não consegue.
 *
 * Dentro de uma plataforma, uma conta da Deriv tem um dono só. Se ela já
 * pertence a outro login, o banco recusa. Durante meses essa recusa caía
 * num `console.warn` e mais nada: a pessoa conectava a Deriv, a tela dizia
 * que estava tudo certo, e na hora de ligar o robô vinha um "esta conta não
 * é sua" que ninguém sabia explicar.
 *
 * Agora a recusa volta escrita, e quem chamou decide o que mostrar.
 */
export async function registrarContaDeriv(
  sessao: SessaoTeeds,
  conta: { accountId: string; type: string; currency: string; balance: number },
): Promise<string | null> {
  if (!autenticacaoConfigurada()) return null
  try {
    await rest('/contas_deriv?on_conflict=user_id,conta_id,marca', sessao.token, {
      method: 'POST',
      headers: MESCLAR,
      body: JSON.stringify({
        user_id: sessao.usuario.id,
        marca: MARCA.id,
        conta_id: conta.accountId,
        tipo: conta.type,
        moeda: conta.currency,
        saldo: conta.balance,
        vista_em: new Date().toISOString(),
      }),
    })
    return null
  } catch (e) {
    const cru = (e as Error).message
    // Desde 07/09 a mesma conta pode estar em mais de um login: nao ha mais
    // "outro dono". Se falhar, e problema de rede ou de permissao — diz qual.
    const recado = `Não consegui ligar a conta ${conta.accountId} ao seu login: ${cru}`
    console.warn('[teeds] conta Deriv:', cru)
    return recado
  }
}

/**
 * Envia a comissao agregada por dia — o resultado de `simularComissao`,
 * que o painel de Gestao ja calcula. Upsert por (usuario, conta, dia):
 * recalcular nunca duplica, so corrige.
 */
export async function enviarComissoes(
  sessao: SessaoTeeds,
  contaId: string,
  demo: boolean,
  moeda: string,
  porDia: Array<{
    data: string; comissao: number; operacoes: number; pagamentos: number
    entradas?: number; resultado?: number
  }>,
): Promise<void> {
  if (!autenticacaoConfigurada() || porDia.length === 0) return
  const linhas = porDia.map((d) => ({
    user_id: sessao.usuario.id,
    // Sem isto não dá para responder "quanto a OMNI rendeu esse mês".
    marca: MARCA.id,
    conta_id: contaId,
    dia: d.data,
    operacoes: d.operacoes,
    pagamentos: d.pagamentos,
    comissao: d.comissao,
    entradas: d.entradas ?? 0,
    resultado: d.resultado ?? 0,
    moeda,
    demo,
    atualizado_em: new Date().toISOString(),
  }))
  try {
    await rest('/comissoes_diarias?on_conflict=user_id,conta_id,dia,marca', sessao.token, {
      method: 'POST',
      headers: MESCLAR,
      body: JSON.stringify(linhas),
    })
  } catch (e) {
    console.warn('[teeds] nao consegui enviar as comissoes:', (e as Error).message)
  }
}

/* --------------------------------------------------------- leitura */

/** A tabela so devolve a propria linha — se vier algo, a pessoa e admin. */
export async function souAdmin(sessao: SessaoTeeds, propagarFalha = false): Promise<boolean> {
  if (!autenticacaoConfigurada()) return false
  try {
    // Admin de uma plataforma não é admin da outra. Quem administra as duas
    // tem uma linha para cada — explícito, em vez de por acidente.
    const linhas = await rest<Array<{ user_id: string }>>(
      `/administradores?select=user_id&marca=eq.${MARCA.id}`, sessao.token)
    return Array.isArray(linhas) && linhas.length > 0
  } catch (erro) {
    if (propagarFalha) throw erro
    return false
  }
}

export interface ClienteRegistro {
  userId: string
  nome: string | null
  email: string | null
  telefone: string | null
  cpf: string | null
  criadoEm: string
  vistoEm: string
  planoId: string
  statusAcesso: 'ativo' | 'suspenso' | 'expirado' | 'cancelado'
  acessoInicio: string | null
  acessoExpiraEm: string | null
  observacoes: string | null
  totalAcessos: number
  tempoTotalSegundos: number
  fusoHorario: string | null
  idioma: string | null
}

export interface PlanoRegistro { id: string; nome: string; duracaoDias: number | null; ativo: boolean }
export interface ProdutoRegistro { id: string; nome: string; categoria: string; precoCentavos: number | null; ativo: boolean }
export interface ClienteProdutoRegistro { userId: string; produtoId: string; concedidoEm: string; expiraEm: string | null; ativo: boolean }

export interface ContaDerivRegistro {
  userId: string
  contaId: string
  tipo: string
  moeda: string | null
  saldo: number | null
  vistaEm: string
}

export interface ComissaoDia {
  userId: string
  contaId: string
  /** De qual plataforma é esta linha — a visão da rede precisa separar. */
  marca: string
  dia: string
  operacoes: number
  pagamentos: number
  comissao: number
  /** Soma das entradas do cliente no dia (o que ele apostou). */
  entradas: number
  /** Lucro (+) ou prejuízo (-) do cliente no dia. */
  resultado: number
  moeda: string | null
  demo: boolean
  /** Quando esta linha foi gravada — diz se veio do cálculo novo. */
  atualizadoEm: string | null
}
export interface OperacaoRoboRegistro {
  contractId: number; userId: string; contaId: string; roboId: string; roboNome: string
  ativo: string; tipoContrato: string; moeda: string; demo: boolean; entrada: number
  pagamento: number; resultado: number; markup: number
  /** O markup que a Deriv informou. Null = ela nao informou nesta operacao. */
  markupDeriv?: number | null
  ganhou: boolean; executadaEm: string
}
export interface MetricaRoboRegistro {
  roboId: string; roboNome: string; operacoes: number; vitorias: number
  clientes: number; volume: number; resultado: number; markup: number
}

/** Corrige registros antigos que foram salvos com UTF-8 interpretado como MacRoman. */
const textoLegivel = (valor: string | null): string | null => {
  if (!valor) return valor
  const mapa: Array<[string,string]> = [['√¥','ô'],['√©','é'],['√ß','ç'],['√µ','õ'],['√£','ã'],['√°','à'],['√≠','í'],['√Å','Á'],['√ì','Ó']]
  return mapa.reduce((texto,[ruim,bom]) => texto.split(ruim).join(bom), valor)
}

/** Uma linha da tabela `clientes` virando ficha. */
const paraCliente = (l: any): ClienteRegistro => ({
  userId: l.user_id, nome: textoLegivel(l.nome), email: l.email, telefone: l.telefone,
  cpf: l.cpf, criadoEm: l.criado_em, vistoEm: l.visto_em,
  planoId: l.plano_id ?? 'essencial', statusAcesso: l.status_acesso ?? 'ativo',
  acessoInicio: l.acesso_inicio ?? null, acessoExpiraEm: l.acesso_expira_em ?? null,
  observacoes: l.observacoes ?? null, totalAcessos: Number(l.total_acessos ?? 0),
  tempoTotalSegundos: Number(l.tempo_total_segundos ?? 0),
  fusoHorario: l.fuso_horario ?? null, idioma: l.idioma ?? null,
})

export interface PaginaClientes {
  /** Quantos clientes a marca tem no total (sem busca nem filtro). */
  total: number
  ativos: number
  expirados: number
  /** Acessos que vencem nos próximos 7 dias. */
  vencendo: number
  /** Quem entrou de verdade nas últimas 24h. */
  ativos24h: number
  /** Quantos já entraram ao menos uma vez desde que se cadastraram. */
  acessaram: number
  /** Quantos sobram depois da busca e do filtro — o tamanho da paginação. */
  filtrados: number
  /** Quantos clientes em cada plano, na base inteira. */
  porPlano: Record<string, number>
  pagina: ClienteRegistro[]
}

export type OrdemClientes =
  | 'cadastro' | 'cadastro-asc' | 'acesso' | 'acesso-asc' | 'saldo' | 'saldo-asc'
  | 'nome' | 'nome-desc' | 'status' | 'status-desc' | 'plano' | 'plano-desc'
  | 'acessos'

export interface FiltroClientes {
  busca?: string
  /** 'todos' | 'ativo' | 'suspenso' | 'expirado' | 'cancelado'. */
  status?: string
  limite?: number
  deslocamento?: number
  /** 'cadastro' = mais novos primeiro; 'acessos' = quem entrou por último. */
  /**
   * A coluna que ordena a lista, com a direção dentro do próprio nome.
   *
   * Vai para o banco porque a tabela mostra 50 de 11 mil: ordenar no
   * navegador ordenaria só a página aberta, e "o maior saldo" seria o maior
   * daquelas 50 — errado de um jeito que parece certo.
   *
   * `acessos` é o antigo, de regra própria (quem já acessou primeiro), e a
   * tela de Criar acesso depende dele.
   */
  ordem?: OrdemClientes
  /** Qual plataforma ler. Vazio = a que o admin master escolheu. */
  marca?: string
}

/**
 * Uma página de clientes, com os totais da base junto.
 *
 * Antes o painel baixava a base inteira e filtrava no navegador. Depois da
 * importação de leads de 11/09/2026 isso virou 11 mil fichas em doze idas e
 * voltas ao banco — uns bons segundos de tela parada — para mostrar 50 nomes.
 *
 * Agora a conta é feita no banco: ele devolve só a página pedida e, na mesma
 * resposta, os números do topo (total, ativos, expirados, vencendo) e a
 * distribuição por plano, que precisam olhar a base toda. Busca, filtro,
 * ordem e paginação vão como parâmetro.
 */
export async function listarClientesPagina(sessao: SessaoTeeds, filtro: FiltroClientes = {}): Promise<PaginaClientes> {
  const r = await rest<any>('/rpc/teeds_clientes_pagina', sessao.token, {
    method: 'POST',
    body: JSON.stringify({
      p_marca: filtro.marca ?? marcaAdmin(),
      p_busca: filtro.busca?.trim() || null,
      p_status: filtro.status ?? 'todos',
      p_limite: filtro.limite ?? 50,
      p_offset: filtro.deslocamento ?? 0,
      p_ordem: filtro.ordem ?? 'cadastro',
    }),
  })
  const n = (v: unknown) => Number(v ?? 0)
  return {
    total: n(r?.total), ativos: n(r?.ativos), expirados: n(r?.expirados), vencendo: n(r?.vencendo),
    ativos24h: n(r?.ativos24h), acessaram: n(r?.acessaram), filtrados: n(r?.filtrados),
    porPlano: (r?.por_plano ?? {}) as Record<string, number>,
    pagina: (r?.pagina ?? []).map(paraCliente),
  }
}

/**
 * As fichas destes clientes, pelo id. Serve para o ranking: o banco diz quem
 * são os sete que mais geraram markup, e só esses sete precisam de nome.
 */
export async function clientesPorId(sessao: SessaoTeeds, ids: string[]): Promise<ClienteRegistro[]> {
  const lista = [...new Set(ids)].filter(Boolean)
  if (!lista.length) return []
  const linhas = await rest<any[]>(
    `/clientes?select=*&${filtroMarca()}&user_id=in.(${lista.join(',')})`, sessao.token,
  )
  return (linhas ?? []).map(paraCliente)
}

export async function listarPlanos(sessao: SessaoTeeds): Promise<PlanoRegistro[]> {
  const linhas = await rest<any[]>(`/planos?select=*&marcas=ov.{${marcasEmFoco().join(',')}}&order=nome.asc`, sessao.token)
  return (linhas ?? []).filter(l => planoClienteValido(l.id)).map((l) => ({ id: l.id, nome: PLANOS_CLIENTE.find(p => p.id === l.id)!.nome, duracaoDias: l.duracao_dias, ativo: Boolean(l.ativo) }))
}

export async function listarProdutos(sessao: SessaoTeeds): Promise<ProdutoRegistro[]> {
  const linhas = await rest<any[]>(`/produtos?select=*&marcas=ov.{${marcasEmFoco().join(',')}}&order=nome.asc`, sessao.token)
  return (linhas ?? []).map((l) => ({ id: l.id, nome: textoLegivel(l.nome) ?? l.nome, categoria: textoLegivel(l.categoria) ?? l.categoria, precoCentavos: l.preco_centavos, ativo: Boolean(l.ativo) }))
}

export async function listarProdutosClientes(sessao: SessaoTeeds): Promise<ClienteProdutoRegistro[]> {
  const linhas = await rest<any[]>(`/cliente_produtos?select=*&ativo=eq.true&${filtroMarca()}`, sessao.token)
  return (linhas ?? []).map((l) => ({ userId: l.user_id, produtoId: l.produto_id, concedidoEm: l.concedido_em, expiraEm: l.expira_em, ativo: Boolean(l.ativo) }))
}

export async function atualizarAcessoCliente(sessao: SessaoTeeds, userId: string, dados: {
  planoId: string; statusAcesso: ClienteRegistro['statusAcesso']; acessoExpiraEm: string | null; observacoes: string | null
}): Promise<void> {
  if (!planoClienteValido(dados.planoId)) throw new Error('Escolha um dos dois planos de clientes.')
  await rest(`/clientes?user_id=eq.${encodeURIComponent(userId)}&marca=eq.${MARCA.id}`, sessao.token, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ plano_id: dados.planoId, status_acesso: dados.statusAcesso, acesso_expira_em: dados.acessoExpiraEm, observacoes: dados.observacoes }),
  })
}

export async function definirProdutoCliente(sessao: SessaoTeeds, userId: string, produtoId: string, ativo: boolean): Promise<void> {
  await rest('/cliente_produtos?on_conflict=user_id,produto_id,marca', sessao.token, {
    method: 'POST', headers: MESCLAR,
    body: JSON.stringify({ user_id: userId, produto_id: produtoId, marca: MARCA.id, ativo, origem: 'admin', concedido_em: new Date().toISOString() }),
  })
}

export async function salvarPlano(sessao: SessaoTeeds, plano: PlanoRegistro): Promise<void> {
  await rest('/planos?on_conflict=id', sessao.token, {
    method: 'POST', headers: MESCLAR,
    // Nasce visível na plataforma onde foi criado. Para valer nas duas, é
    // acrescentar a outra marca à lista — decisão de quem administra, não
    // um efeito colateral de onde a pessoa estava quando criou.
    body: JSON.stringify({ id: plano.id, nome: plano.nome, duracao_dias: plano.duracaoDias, ativo: plano.ativo, marcas: [MARCA.id] }),
  })
}

export async function salvarProduto(sessao: SessaoTeeds, produto: ProdutoRegistro): Promise<void> {
  await rest('/produtos?on_conflict=id', sessao.token, {
    method: 'POST', headers: MESCLAR,
    body: JSON.stringify({ id: produto.id, nome: produto.nome, categoria: produto.categoria, preco_centavos: produto.precoCentavos, ativo: produto.ativo, marcas: [MARCA.id] }),
  })
}

/**
 * Cria o login pelo endpoint público de cadastro sem trocar a sessão do ADM.
 * O trigger do banco cria a ficha de cliente; depois o painel configura plano
 * e validade. Se a confirmação de e-mail estiver ativa, o cliente confirma no
 * próprio e-mail antes do primeiro acesso.
 */
export async function criarAcessoCliente(sessao: SessaoTeeds, dados: {
  nome: string; email: string; telefone?: string; cpf?: string; senha: string
}): Promise<{ userId: string | null; precisaConfirmar: boolean }> {
  const res = await fetch(`${SUPABASE.url}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: dados.email.trim().toLowerCase(), senha: undefined, password: dados.senha,
      data: { nome: dados.nome.trim(), telefone: dados.telefone?.trim() || null, cpf: dados.cpf?.trim() || null, marca: MARCA.id, trocar_senha: true },
    }),
  })
  const corpo = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(corpo?.msg || corpo?.message || 'Não foi possível criar este acesso.')
  const userId = corpo?.user?.id ?? null
  // Garante a ficha quando o trigger ainda estiver processando.
  if (userId) {
    await new Promise((resolve) => setTimeout(resolve, 350))
    try {
      await rest('/clientes?on_conflict=user_id,marca', sessao.token, {
        method: 'POST', headers: MESCLAR,
        body: JSON.stringify({ user_id: userId, marca: MARCA.id, nome: dados.nome.trim(), email: dados.email.trim().toLowerCase(), telefone: dados.telefone?.trim() || null, cpf: dados.cpf?.trim() || null }),
      })
    } catch { /* o trigger já criou ou a confirmação ainda está pendente */ }
  }
  return { userId, precisaConfirmar: !corpo?.session }
}

export async function listarContasDeriv(sessao: SessaoTeeds): Promise<ContaDerivRegistro[]> {
  const linhas = await rest<any[]>(`/contas_deriv?select=*&${filtroMarca()}&order=vista_em.desc`, sessao.token)
  return (linhas ?? []).map((l) => ({
    userId: l.user_id, contaId: l.conta_id, tipo: l.tipo,
    moeda: l.moeda, saldo: l.saldo === null ? null : Number(l.saldo), vistaEm: l.vista_em,
  }))
}

/**
 * A comissão de tudo — robô e operação manual — desta marca.
 *
 * Vem de `comissoes_diarias`, que é calculada a partir do extrato da Deriv
 * e por isso enxerga também o que a pessoa operou na mão. O preço disso é
 * que a tabela só é escrita quando alguém abre a tela de Gestão: se ninguém
 * abre, ela congela. Para o número que nunca atrasa (mas que só conta
 * robôs), use `comissaoDosRobos`.
 */
export async function listarComissoes(sessao: SessaoTeeds, dias: number): Promise<ComissaoDia[]> {
  const de = new Date()
  de.setDate(de.getDate() - (dias - 1))
  const corte = de.toISOString().slice(0, 10)
  const linhas = await rest<any[]>(
    `/comissoes_diarias?${filtroMarca()}&select=*&dia=gte.${corte}&order=dia.desc`, sessao.token,
  )
  return (linhas ?? []).map((l) => ({
    userId: l.user_id, contaId: l.conta_id, marca: String(l.marca ?? MARCA.id), dia: l.dia,
    operacoes: Number(l.operacoes), pagamentos: Number(l.pagamentos),
    comissao: Number(l.comissao),
    entradas: Number(l.entradas ?? 0), resultado: Number(l.resultado ?? 0),
    moeda: l.moeda, demo: Boolean(l.demo),
    atualizadoEm: l.atualizado_em ?? null,
  }))
}

export async function registrarOperacaoRobo(sessao: SessaoTeeds, op: Omit<OperacaoRoboRegistro, 'userId'>): Promise<void> {
  try {
    await rest('/operacoes_robos?on_conflict=user_id,contract_id', sessao.token, {
      method: 'POST', headers: MESCLAR,
      body: JSON.stringify({ contract_id: op.contractId, user_id: sessao.usuario.id, marca: MARCA.id, conta_id: op.contaId, robo_id: op.roboId, robo_nome: op.roboNome, ativo: op.ativo, tipo_contrato: op.tipoContrato, moeda: op.moeda, demo: op.demo, entrada: op.entrada, pagamento: op.pagamento, resultado: op.resultado, markup: op.markup, markup_deriv: op.markupDeriv ?? null, ganhou: op.ganhou, executada_em: op.executadaEm }),
    })
  } catch (e) { console.warn('[teeds] telemetria do robô indisponível:', (e as Error).message) }
}

export async function listarOperacoesRobos(sessao: SessaoTeeds, dias = 90): Promise<OperacaoRoboRegistro[]> {
  const corte = new Date(Date.now() - (dias - 1) * 864e5).toISOString()
  try {
    const linhas = await rest<any[]>(`/operacoes_robos?${filtroMarca()}&select=*&executada_em=gte.${encodeURIComponent(corte)}&order=executada_em.desc`, sessao.token)
    return (linhas ?? []).map(l => ({ contractId:Number(l.contract_id),userId:l.user_id,contaId:l.conta_id,roboId:l.robo_id,roboNome:l.robo_nome,ativo:l.ativo,tipoContrato:l.tipo_contrato,moeda:l.moeda,demo:Boolean(l.demo),entrada:Number(l.entrada),pagamento:Number(l.pagamento),resultado:Number(l.resultado),markup:Number(l.markup),markupDeriv:l.markup_deriv===null||l.markup_deriv===undefined?null:Number(l.markup_deriv),ganhou:Boolean(l.ganhou),executadaEm:l.executada_em }))
  } catch { return [] }
}

/** Resumo calculado no banco: o painel recebe uma linha por robô, não o histórico inteiro. */
/* ------------------------------------------- análise com filtros finos */

export interface FiltroAnalise {
  /** Qual plataforma ler. Vazio = a que o admin master escolheu. */
  marca?: string
  /** Início e fim, em ISO (instantes; o fim é exclusivo). */
  de: string
  ate: string
  /** Faixa de horas no fuso informado; pode cruzar a meia-noite (22 → 2). */
  horaDe?: number
  horaAte?: number
  fuso?: string
  robo?: string | null
  /** true = só demo, false = só real, null = as duas. */
  demo?: boolean | null
  conta?: string | null
}

export interface AnaliseOperacoes {
  total: {
    operacoes: number; ganhas: number; entradas: number; pagamentos: number
    markup: number; markupDeriv: number; resultado: number; clientes: number; contas: number
  }
  porHora: Array<{ hora: number; operacoes: number; ganhas: number; markup: number; resultado: number }>
  porDia: Array<{ dia: string; operacoes: number; ganhas: number; entradas: number; markup: number; resultado: number }>
  porRobo: Array<{ roboId: string; roboNome: string; operacoes: number; ganhas: number; clientes: number; entradas: number; markup: number; resultado: number }>
  porConta: Array<{ contaId: string; demo: boolean; operacoes: number; markup: number; resultado: number }>
}

/**
 * Operações de ROBÔ no filtro, já resumidas pelo banco: totais, por hora do
 * dia, por dia, por robô e por conta. O banco filtra porque a tabela tem
 * dezenas de milhares de linhas — trazer tudo para o navegador cortaria em
 * mil e ninguém perceberia. Operação manual não entra (não está na tabela).
 */
export async function analiseOperacoes(sessao: SessaoTeeds, f: FiltroAnalise): Promise<AnaliseOperacoes | null> {
  const n = (v: unknown) => Number(v ?? 0)
  try {
    const r = await rest<any>('/rpc/teeds_analise_operacoes', sessao.token, {
      method: 'POST',
      body: JSON.stringify({
        p_marca: f.marca ?? marcaAdmin(), p_de: f.de, p_ate: f.ate,
        p_hora_de: f.horaDe ?? 0, p_hora_ate: f.horaAte ?? 23,
        p_fuso: f.fuso ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'America/Sao_Paulo',
        p_robo: f.robo ?? null, p_demo: f.demo === undefined ? false : f.demo, p_conta: f.conta ?? null,
      }),
    })
    if (!r || !r.total) return null
    return {
      total: {
        operacoes: n(r.total.operacoes), ganhas: n(r.total.ganhas), entradas: n(r.total.entradas),
        pagamentos: n(r.total.pagamentos), markup: n(r.total.markup), markupDeriv: n(r.total.markup_deriv),
        resultado: n(r.total.resultado), clientes: n(r.total.clientes), contas: n(r.total.contas),
      },
      porHora: (r.por_hora ?? []).map((x: any) => ({ hora: n(x.hora), operacoes: n(x.operacoes), ganhas: n(x.ganhas), markup: n(x.markup), resultado: n(x.resultado) })),
      porDia: (r.por_dia ?? []).map((x: any) => ({ dia: String(x.dia), operacoes: n(x.operacoes), ganhas: n(x.ganhas), entradas: n(x.entradas), markup: n(x.markup), resultado: n(x.resultado) })),
      porRobo: (r.por_robo ?? []).map((x: any) => ({ roboId: String(x.robo_id), roboNome: textoLegivel(x.robo_nome) ?? String(x.robo_id), operacoes: n(x.operacoes), ganhas: n(x.ganhas), clientes: n(x.clientes), entradas: n(x.entradas), markup: n(x.markup), resultado: n(x.resultado) })),
      porConta: (r.por_conta ?? []).map((x: any) => ({ contaId: String(x.conta_id), demo: Boolean(x.demo), operacoes: n(x.operacoes), markup: n(x.markup), resultado: n(x.resultado) })),
    }
  } catch { return null }
}

/* ------------------------------------------------------------------ *
 * De onde vêm as operações da conta do cliente.
 *
 * A conta Deriv é dele: pode operar pela Teeds, pela OMNI, pelo app da
 * própria Deriv ou por outro robô. O servidor separa contrato por contrato
 * (ver servidor/src/atribuicao.ts) e grava aqui. Receita é só o que tem a
 * marca; o resto existe para conferência, nunca para somar.
 * ------------------------------------------------------------------ */
export interface OrigemDoContrato {
  dia: string
  contaId: string
  userId: string
  /** 'teeds', 'omni', 'externo' ou 'sem-dono'. */
  origem: string
  demo: boolean
  operacoes: number
  entradas: number
  pagamentos: number
  resultado: number
  markupEstimado: number
  porRegistro: number
  porApp: number
  porHorario: number
  semPista: number
  apps: string[]
}

export async function contratosPorOrigem(sessao: SessaoTeeds, dias = 30): Promise<OrigemDoContrato[]> {
  if (!autenticacaoConfigurada()) return []
  // Mesma janela das outras telas: N dias contando hoje, e não N dias atrás.
  const corte = new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10)
  try {
    const linhas = await rest<any[]>(
      `/contratos_por_origem?${filtroMarca()}&select=*&dia=gte.${corte}&order=dia.desc`, sessao.token)
    // A MESMA conta Deriv pode estar ligada a um cadastro da Teeds e a outro
    // da OMNI: cada leitura grava a sua linha, com a marca de quem leu. Na
    // visão da rede as duas chegam juntas e o mesmo contrato contaria duas
    // vezes — por isso a chave aqui é dia + conta + origem, sem a marca.
    const vistos = new Set<string>()
    const unicas = (linhas ?? []).filter((l) => {
      const chave = `${l.dia}|${l.conta_id}|${l.origem}|${Boolean(l.demo)}`
      if (vistos.has(chave)) return false
      vistos.add(chave)
      return true
    })
    return unicas.map((l) => ({
      dia: String(l.dia), contaId: String(l.conta_id), userId: String(l.user_id),
      origem: String(l.origem), demo: Boolean(l.demo),
      operacoes: Number(l.operacoes ?? 0), entradas: Number(l.entradas ?? 0),
      pagamentos: Number(l.pagamentos ?? 0), resultado: Number(l.resultado ?? 0),
      markupEstimado: Number(l.markup_estimado ?? 0),
      porRegistro: Number(l.por_registro ?? 0), porApp: Number(l.por_app ?? 0),
      porHorario: Number(l.por_horario ?? 0), semPista: Number(l.sem_pista ?? 0),
      apps: Array.isArray(l.apps) ? l.apps.map(String) : [],
    }))
  } catch { return [] }
}

export async function listarMetricasRobos(sessao: SessaoTeeds, dias = 90): Promise<MetricaRoboRegistro[]> {
  try {
    const linhas = await rest<any[]>('/rpc/teeds_metricas_robos', sessao.token, {
      method: 'POST', body: JSON.stringify({ p_dias: dias, p_marca: marcaAdmin() }),
    })
    return (linhas ?? []).map((l) => ({
      roboId: l.robo_id, roboNome: l.robo_nome, operacoes: Number(l.operacoes),
      vitorias: Number(l.vitorias), clientes: Number(l.clientes), volume: Number(l.volume),
      resultado: Number(l.resultado), markup: Number(l.markup),
    }))
  } catch { return [] }
}

/* ------------------------------------------------- relatórios do admin */

/**
 * O número OFICIAL da Deriv, dia a dia.
 *
 * A API `markup-statistics` só devolve totais do app inteiro — não há quebra
 * por cliente nem por contrato, e só o dono do app consegue lê-la. Então o
 * painel do admin guarda esse total aqui, e a comparação com o que a Teeds
 * calculou acontece no banco (`teeds_comissao_conferencia`).
 */
export async function enviarMarkupOficial(
  sessao: SessaoTeeds,
  appId: string,
  porDia: Array<{ data: string; comissao: number; volume: number; contratos: number }>,
): Promise<void> {
  if (!autenticacaoConfigurada() || porDia.length === 0) return
  try {
    await rest('/markup_oficial_diario?on_conflict=dia,app_id', sessao.token, {
      method: 'POST', headers: MESCLAR,
      body: JSON.stringify(porDia.map((d) => ({
        dia: d.data, app_id: appId, marca: MARCA.id, comissao: d.comissao,
        volume: d.volume, contratos: d.contratos,
        atualizado_em: new Date().toISOString(),
      }))),
    })
  } catch (e) {
    console.warn('[teeds] não consegui gravar o markup oficial:', (e as Error).message)
  }
}

export interface LinhaRelatorioCliente {
  userId: string; nome: string | null; email: string | null
  contas: number; contasReais: number
  operacoes: number; entradas: number; pagamentos: number
  /** Quanto o cliente ganhou (+) ou perdeu (-) no período. */
  resultado: number
  comissaoCalculada: number
  /** A parte da comissão calculada que veio de conta real. */
  comissaoReal: number
  /** Dias com operação no período, e quantos deles a varredura antiga gravou sem resultado. */
  diasComDados: number
  diasSemResultado: number
  operacoesRobos: number; resultadoRobos: number; markupRobos: number
  ultimoDia: string | null; vistoEm: string | null
}

/** Uma linha por cliente: quanto operou, quanto ganhou ou perdeu, quanto rendeu. */
export async function relatorioClientes(
  sessao: SessaoTeeds, dias = 30, incluirDemo = true,
): Promise<LinhaRelatorioCliente[]> {
  try {
    const linhas = await rest<any[]>('/rpc/teeds_relatorio_clientes', sessao.token, {
      method: 'POST', body: JSON.stringify({ p_dias: dias, p_incluir_demo: incluirDemo, p_marca: marcaAdmin() }),
    })
    return (linhas ?? []).map((l) => ({
      userId: l.user_id, nome: textoLegivel(l.nome), email: l.email,
      contas: Number(l.contas), contasReais: Number(l.contas_reais),
      operacoes: Number(l.operacoes), entradas: Number(l.entradas),
      pagamentos: Number(l.pagamentos), resultado: Number(l.resultado),
      comissaoCalculada: Number(l.comissao_calculada),
      comissaoReal: Number(l.comissao_real ?? 0),
      diasComDados: Number(l.dias_com_dados ?? 0),
      diasSemResultado: Number(l.dias_sem_resultado ?? 0),
      operacoesRobos: Number(l.operacoes_robos), resultadoRobos: Number(l.resultado_robos),
      markupRobos: Number(l.markup_robos),
      ultimoDia: l.ultimo_dia ?? null, vistoEm: l.visto_em ?? null,
    }))
  } catch { return [] }
}

/** O extrato de operações de um cliente (o admin vê de qualquer um). */
export async function operacoesDoCliente(
  sessao: SessaoTeeds, userId: string, dias = 30,
): Promise<OperacaoRoboRegistro[]> {
  try {
    const linhas = await rest<any[]>('/rpc/teeds_operacoes_cliente', sessao.token, {
      method: 'POST', body: JSON.stringify({ p_user_id: userId, p_dias: dias, p_marca: marcaAdmin() }),
    })
    return (linhas ?? []).map((l) => ({
      contractId: Number(l.contract_id), userId, contaId: l.conta_id,
      roboId: l.robo_id, roboNome: l.robo_nome, ativo: l.ativo,
      tipoContrato: l.tipo_contrato, moeda: 'USD', demo: Boolean(l.demo),
      entrada: Number(l.entrada), pagamento: Number(l.pagamento),
      resultado: Number(l.resultado), markup: Number(l.markup),
      markupDeriv: l.markup_deriv === null || l.markup_deriv === undefined ? null : Number(l.markup_deriv),
      ganhou: Boolean(l.ganhou), executadaEm: l.executada_em,
    }))
  } catch { return [] }
}

/**
 * A comissão dos robôs, ao vivo.
 *
 * Sai direto das operações que o servidor grava a cada liquidação, então
 * nunca atrasa e nunca depende de alguém abrir tela nenhuma. Em troca,
 * enxerga só robô: quem quiser o total, incluindo operação manual, usa
 * `listarComissoes`.
 */
export async function comissaoDosRobos(sessao: SessaoTeeds, dias = 30): Promise<ComissaoDia[]> {
  try {
    const linhas = await rest<any[]>('/rpc/teeds_comissao_viva', sessao.token, {
      method: 'POST', body: JSON.stringify({ p_dias: dias, p_marca: marcaAdmin() }),
    })
    return (linhas ?? []).map((l) => ({
      userId: l.user_id, contaId: l.conta_id, marca: String(l.marca ?? marcaAdmin()), dia: l.dia,
      operacoes: Number(l.operacoes), pagamentos: Number(l.pagamentos),
      comissao: Number(l.comissao),
      entradas: Number(l.entradas ?? 0), resultado: Number(l.resultado ?? 0),
      moeda: l.moeda, demo: Boolean(l.demo),
      atualizadoEm: l.atualizado_em ?? null,
    }))
  } catch { return [] }
}

export interface DiaConferencia {
  dia: string
  /** O que a Teeds calculou (3% do pagamento, cliente a cliente). */
  calculada: number
  /** O que a Deriv registrou de fato, no app inteiro. */
  oficial: number
  diferenca: number
  diferencaPct: number | null
  operacoes: number
  contratosDeriv: number
  clientes: number
  /**
   * Naquele dia só houve operação em conta de demonstração.
   *
   * Demo não gera markup: o lado oficial fica zerado e está certo. Sem esta
   * marca, a tela acusaria uma diferença de 100% num dia em que não havia
   * nada a conferir.
   */
  soDemo: boolean
}

/** Os dois números lado a lado, dia a dia. Só conta real. */
export async function conferenciaComissao(sessao: SessaoTeeds, dias = 30): Promise<DiaConferencia[]> {
  try {
    const linhas = await rest<any[]>('/rpc/teeds_comissao_conferencia', sessao.token, {
      method: 'POST',
      // Na visão da rede a conferência é de todos os nossos apps, não de um.
      body: JSON.stringify({ p_dias: dias, p_marca: marcaAdmin(), p_app_id: vendoARede() ? null : MARCA.appId }),
    })
    return (linhas ?? []).map((l) => ({
      dia: l.dia, calculada: Number(l.calculada), oficial: Number(l.oficial),
      diferenca: Number(l.diferenca),
      diferencaPct: l.diferenca_pct === null ? null : Number(l.diferenca_pct),
      operacoes: Number(l.operacoes), contratosDeriv: Number(l.contratos_deriv),
      clientes: Number(l.clientes),
      soDemo: Boolean(l.so_demo),
    }))
  } catch { return [] }
}

/* ------------------------------------------------- depósitos e saques */

export interface DiaMovimentacao {
  dia: string
  depositos: number; qtdDepositos: number
  saques: number; qtdSaques: number
  clientes: number
}

export interface MovimentacaoRegistro {
  userId: string; nome: string | null; email: string | null
  contaId: string; transacaoId: number
  tipo: 'deposit' | 'withdrawal'
  valor: number; moeda: string
  saldoDepois: number | null; descricao: string | null
  ocorridaEm: string
}

export interface ColetaExtrato {
  contaId: string; userId: string; nome: string | null; email: string | null
  ultimaTentativaEm: string; ultimoSucessoEm: string | null
  ultimaMovimentacaoEm: string | null; ultimoErro: string | null
  movimentacoes: number
}

/** Quanto entrou e quanto saiu por dia (UTC), só conta real. Agregado no banco. */
export async function movimentacoesDiarias(sessao: SessaoTeeds, dias = 30): Promise<DiaMovimentacao[]> {
  try {
    const linhas = await rest<any[]>('/rpc/teeds_movimentacoes_diarias', sessao.token, {
      method: 'POST', body: JSON.stringify({ p_dias: dias, p_marca: marcaAdmin() }),
    })
    return (linhas ?? []).map((l) => ({
      dia: l.dia,
      depositos: Number(l.depositos), qtdDepositos: Number(l.qtd_depositos),
      saques: Number(l.saques), qtdSaques: Number(l.qtd_saques),
      clientes: Number(l.clientes),
    }))
  } catch { return [] }
}

/** As movimentações uma a uma, com o nome do cliente, da mais recente para a mais antiga. */
export async function movimentacoesRecentes(sessao: SessaoTeeds, dias = 30, limite = 500): Promise<MovimentacaoRegistro[]> {
  try {
    const linhas = await rest<any[]>('/rpc/teeds_movimentacoes_recentes', sessao.token, {
      method: 'POST', body: JSON.stringify({ p_dias: dias, p_marca: marcaAdmin(), p_limite: limite }),
    })
    return (linhas ?? []).map((l) => ({
      userId: l.user_id, nome: textoLegivel(l.nome), email: l.email,
      contaId: l.conta_id, transacaoId: Number(l.transacao_id),
      tipo: l.tipo === 'withdrawal' ? 'withdrawal' : 'deposit',
      valor: Number(l.valor), moeda: l.moeda ?? 'USD',
      saldoDepois: l.saldo_depois === null || l.saldo_depois === undefined ? null : Number(l.saldo_depois),
      descricao: l.descricao ?? null,
      ocorridaEm: l.ocorrida_em,
    }))
  } catch { return [] }
}

/** A coleta está viva? Uma linha por conta real conectada. */
export async function coletasDeExtrato(sessao: SessaoTeeds): Promise<ColetaExtrato[]> {
  try {
    const linhas = await rest<any[]>('/rpc/teeds_extrato_coletas', sessao.token, {
      method: 'POST', body: JSON.stringify({ p_marca: marcaAdmin() }),
    })
    return (linhas ?? []).map((l) => ({
      contaId: l.conta_id, userId: l.user_id, nome: textoLegivel(l.nome), email: l.email,
      ultimaTentativaEm: l.ultima_tentativa_em, ultimoSucessoEm: l.ultimo_sucesso_em ?? null,
      ultimaMovimentacaoEm: l.ultima_movimentacao_em ?? null, ultimoErro: l.ultimo_erro ?? null,
      movimentacoes: Number(l.movimentacoes ?? 0),
    }))
  } catch { return [] }
}
