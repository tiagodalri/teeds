/**
 * Financeiro (11/11/2026). O banco (migração 20261111180000_financeiro) guarda tudo; esta camada:
 *   - abre e fecha a trava (senha individual → token de 12 h no cabeçalho x-fin-token);
 *   - lê e grava lançamentos, categorias, contas, sócios, acessos e histórico;
 *   - faz as contas da tela (resumo, mês a mês, categorias, divisão entre os sócios).
 *
 * O token fica no sessionStorage: fechar a aba tranca o financeiro. A tela também tranca sozinha
 * depois de 20 minutos sem mexer (FinanceiroPainel).
 */
import type { SessaoTeeds } from './conta'
import { SUPABASE } from './config'

export type TipoLancamento = 'receita' | 'despesa' | 'aporte' | 'retirada' | 'devolucao'
export type Papel = 'dono' | 'editor' | 'leitor'

export interface Categoria { id: string; marca: string; tipo: 'entrada' | 'saida'; nome: string; cor: string; ordem: number; ativo: boolean }
export interface Conta { id: string; marca: string; nome: string; tipo: 'banco' | 'caixa' | 'cartao' | 'plataforma' | 'outro'; saldo_inicial: number; cor: string; ordem: number; ativo: boolean }
export interface Projeto { id: string; marca: string; nome: string; cor: string; parceiro: string | null; responsavel: string | null; ordem: number; ativo: boolean }
export interface Socio { id: string; marca: string; nome: string; percentual: number; cor: string; ordem: number; ativo: boolean
  /** o código de parceiro de divulgação desta pessoa, quando o sócio também é parceiro (Victor = 'v') */
  parceiro: string | null }
export interface Anexo { path: string; nome: string; tipo: string; tamanho: number }
export interface Lancamento {
  id: string; marca: string; tipo: TipoLancamento; descricao: string; valor: number
  vencimento: string; pago_em: string | null
  categoria_id: string | null; conta_id: string | null; socio_id: string | null; projeto_id: string | null
  contraparte: string | null; forma: string | null; observacoes: string | null
  grupo: string | null; parcela: number | null; parcelas: number | null
  /** pago por fora (o parceiro pagou do bolso dele): só no custo do projeto */
  pago_fora: boolean
  /** o parceiro (não sócio) que pagou do bolso, ou que fez a devolução: código n, d… */
  pago_por: string | null
  anexos: Anexo[]; origem: string | null; origem_id: string | null
  criado_por: string | null; criado_em: string; atualizado_por: string | null; atualizado_em: string
}
export type NovoLancamento = Omit<Lancamento, 'id' | 'criado_por' | 'criado_em' | 'atualizado_por' | 'atualizado_em'> & { id?: string }
export interface Historico { id: number; lancamento_id: string | null; acao: 'criou' | 'editou' | 'pagou' | 'reabriu' | 'apagou'; por: string | null; em: string; antes: Partial<Lancamento> | null; depois: Partial<Lancamento> | null }
export interface Acesso { email: string; nome: string | null; papel: Papel; marcas: string[]; ativo: boolean; trocar_senha: boolean; bloqueado: boolean; ultimo_acesso: string | null; criado_em: string; eu: boolean }
export interface Candidato { email: string; nome: string | null; marcas: string[] }
export interface Pessoa { user_id: string; nome: string; email: string }
export interface MeuAcesso { admin: boolean; geral?: boolean; tem: boolean; nesta?: boolean; ativo?: boolean; papel?: Papel | null; marcas?: string[]; trocar_senha?: boolean; bloqueado_ate?: string | null }
export type ResultadoEntrada = { token: string; expira_em: string; papel: Papel; marcas: string[]; trocar_senha: boolean } | { erro: 'senha'; restam: number } | { erro: 'bloqueado'; ate: string } | { erro: 'sem-acesso' }
export type ResultadoTroca = { ok: true } | { erro: 'senha'; restam: number } | { erro: 'bloqueado'; ate: string } | { erro: 'sem-acesso' | 'fraca' | 'igual' }

export interface DadosFin { categorias: Categoria[]; contas: Conta[]; socios: Socio[]; projetos: Projeto[]; lancamentos: Lancamento[] }

/** Tudo o que a tela pede ao banco. O laboratório troca por uma versão em memória. */
export interface FinApi {
  marca: string
  meuAcesso(): Promise<MeuAcesso>
  criarMinhaSenha(senha: string): Promise<void>
  entrar(senha: string): Promise<ResultadoEntrada>
  trocarSenha(atual: string, nova: string): Promise<ResultadoTroca>
  sair(): Promise<void>
  /** Há um token guardado e ainda no prazo? */
  destravado(): boolean
  preparar(): Promise<void>
  ler(): Promise<DadosFin>
  salvarLancamentos(l: NovoLancamento[]): Promise<Lancamento[]>
  atualizarLancamento(id: string, campos: Partial<NovoLancamento>): Promise<void>
  atualizarGrupo(grupo: string, aPartirDe: string, campos: Partial<NovoLancamento>): Promise<void>
  apagarLancamentos(ids: string[]): Promise<void>
  salvarCategoria(c: Partial<Categoria> & { tipo: Categoria['tipo']; nome: string }): Promise<Categoria>
  salvarConta(c: Partial<Conta> & { nome: string }): Promise<Conta>
  salvarSocio(s: Partial<Socio> & { nome: string }): Promise<Socio>
  salvarProjeto(p: Partial<Projeto> & { nome: string }): Promise<Projeto>
  historico(limite?: number): Promise<Historico[]>
  pessoas(ids: string[]): Promise<Pessoa[]>
  acessos(): Promise<Acesso[]>
  candidatos(): Promise<Candidato[]>
  darAcesso(email: string, papel: Papel, marcas: string[], senha: string | null): Promise<void>
  tirarAcesso(email: string): Promise<void>
  enviarAnexo(lancamentoId: string, arquivo: File): Promise<Anexo>
  linkDoAnexo(a: Anexo): Promise<string>
  apagarAnexo(a: Anexo): Promise<void>
}

// ── Token ─────────────────────────────────────────────────────────────────────────────────────────
const CHAVE_TOKEN = 'fin.token'
interface TokenGuardado { token: string; expira: number; usuario: string }
function lerToken(usuario: string): TokenGuardado | null {
  try {
    const t = JSON.parse(sessionStorage.getItem(CHAVE_TOKEN) ?? 'null') as TokenGuardado | null
    return t && t.usuario === usuario && t.expira > Date.now() ? t : null
  } catch { return null }
}
function guardarToken(t: TokenGuardado | null) {
  try { if (t) sessionStorage.setItem(CHAVE_TOKEN, JSON.stringify(t)); else sessionStorage.removeItem(CHAVE_TOKEN) } catch { /* aba sem armazenamento: pede a senha de novo */ }
}

/** Erro do banco em frase de gente (a exceção do Postgres vem em `message`). */
async function erroDe(r: Response, padrao: string): Promise<Error> {
  try {
    const j = await r.json() as { message?: string; code?: string }
    if (r.status === 401 || r.status === 403 || j.code === '42501') return new FinTrancado()
    if (j.message && !/violates|syntax|column|relation|function/i.test(j.message)) return new Error(j.message)
  } catch { /* corpo vazio */ }
  return new Error(padrao)
}
/** O banco recusou porque o token venceu ou foi encerrado: a tela volta para a senha. */
export class FinTrancado extends Error { constructor() { super('O financeiro foi bloqueado. Digite sua senha de novo.') } }

/**
 * Dólar comercial (compra) para converter o markup da Deriv, que vem em US$. Sem resposta em 4 s: null,
 * e o banco usa a última cotação guardada (fin_cotacoes).
 */
async function cotacaoDoDolar(): Promise<number | null> {
  try {
    const r = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL', { signal: AbortSignal.timeout(4000) })
    if (!r.ok) return null
    const v = Number((await r.json() as { USDBRL?: { bid?: string } }).USDBRL?.bid)
    return v > 1 && v < 50 ? v : null
  } catch { return null }
}

export function finDoBanco(sessao: SessaoTeeds, marca: string): FinApi {
  const base = SUPABASE.url
  const cab = (extra: Record<string, string> = {}) => {
    const t = lerToken(sessao.usuario.id)
    return { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, ...(t ? { 'x-fin-token': t.token } : {}), ...extra }
  }
  const rpc = async <T>(nome: string, corpo: Record<string, unknown> = {}, padrao = 'Não foi possível falar com o banco agora.'): Promise<T> => {
    const r = await fetch(`${base}/rest/v1/rpc/${nome}`, { method: 'POST', headers: cab({ 'Content-Type': 'application/json' }), body: JSON.stringify(corpo) })
    if (!r.ok) throw await erroDe(r, padrao)
    const txt = await r.text()
    return (txt ? JSON.parse(txt) : null) as T
  }
  const get = async <T>(caminho: string): Promise<T> => {
    const r = await fetch(`${base}/rest/v1/${caminho}`, { headers: cab() })
    if (!r.ok) throw await erroDe(r, 'Não foi possível ler o financeiro agora.')
    return await r.json() as T
  }
  // o banco entrega no máximo 1.000 linhas por pedido: os lançamentos vêm em páginas até acabar
  const getTodos = async <T>(caminho: string): Promise<T[]> => {
    const todos: T[] = []
    for (let de = 0; de < 200_000; de += 1000) {
      const pagina = await get<T[]>(`${caminho}&limit=1000&offset=${de}`)
      todos.push(...pagina)
      if (pagina.length < 1000) break
    }
    return todos
  }
  const escrever = async <T>(metodo: 'POST' | 'PATCH' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> => {
    const r = await fetch(`${base}/rest/v1/${caminho}`, {
      method: metodo, headers: cab({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    })
    if (!r.ok) throw await erroDe(r, 'Não foi possível salvar agora.')
    const txt = await r.text()
    return (txt ? JSON.parse(txt) : []) as T
  }
  // a PATCH/DELETE que não acha linha nenhuma (sem permissão) volta [] em silêncio: aqui vira erro
  const exigirLinha = <T>(l: T[]): T[] => { if (!l.length) throw new FinTrancado(); return l }
  const num = <T extends { valor?: unknown; saldo_inicial?: unknown; percentual?: unknown }>(x: T): T => ({
    ...x,
    ...(x.valor !== undefined ? { valor: Number(x.valor) } : {}),
    ...(x.saldo_inicial !== undefined ? { saldo_inicial: Number(x.saldo_inicial) } : {}),
    ...(x.percentual !== undefined ? { percentual: Number(x.percentual) } : {}),
  })
  const m = encodeURIComponent(marca)

  return {
    marca,
    meuAcesso: () => rpc<MeuAcesso>('fin_meu_acesso', { p_marca: marca }),
    criarMinhaSenha: async (senha) => { await rpc('fin_criar_minha_senha', { p_senha: senha }) },
    entrar: async (senha) => {
      const r = await rpc<ResultadoEntrada>('fin_entrar', { p_senha: senha })
      if ('token' in r) guardarToken({ token: r.token, expira: Date.parse(r.expira_em), usuario: sessao.usuario.id })
      return r
    },
    trocarSenha: (atual, nova) => rpc<ResultadoTroca>('fin_trocar_senha', { p_atual: atual, p_nova: nova }),
    sair: async () => { try { await rpc('fin_sair') } finally { guardarToken(null) } },
    destravado: () => !!lerToken(sessao.usuario.id),
    preparar: async () => { await rpc('fin_preparar', { p_marca: marca }) },
    ler: async () => {
      if (!lerToken(sessao.usuario.id) || !(await rpc<string | null>('fin_sessao'))) { guardarToken(null); throw new FinTrancado() }
      // traz as vendas da Cakto e o markup da Deriv para os lançamentos antes de ler (falhou: lê o que já tem)
      try { await rpc('fin_sincronizar_receitas', { p_marca: marca, p_cotacao: await cotacaoDoDolar() }) } catch (e) { if (e instanceof FinTrancado) throw e }
      const [categorias, contas, socios, projetos, lancamentos] = await Promise.all([
        get<Categoria[]>(`fin_categorias?marca=eq.${m}&order=tipo,ordem,nome`),
        get<Conta[]>(`fin_contas?marca=eq.${m}&order=ordem,nome`),
        get<Socio[]>(`fin_socios?marca=eq.${m}&order=ordem,nome`),
        get<Projeto[]>(`fin_projetos?marca=eq.${m}&order=ordem,nome`),
        getTodos<Lancamento>(`fin_lancamentos?marca=eq.${m}&order=vencimento.desc,criado_em.desc,id`),
      ])
      return { categorias, contas: contas.map(num), socios: socios.map(num), projetos, lancamentos: lancamentos.map(num) }
    },
    salvarLancamentos: async (l) => (await escrever<Lancamento[]>('POST', 'fin_lancamentos', l.map((x) => ({ ...x, marca })))).map(num),
    atualizarLancamento: async (id, campos) => { exigirLinha(await escrever<Lancamento[]>('PATCH', `fin_lancamentos?id=eq.${id}`, campos)) },
    atualizarGrupo: async (grupo, aPartirDe, campos) => { exigirLinha(await escrever<Lancamento[]>('PATCH', `fin_lancamentos?grupo=eq.${grupo}&vencimento=gte.${aPartirDe}`, campos)) },
    apagarLancamentos: async (ids) => { if (ids.length) exigirLinha(await escrever<Lancamento[]>('DELETE', `fin_lancamentos?id=in.(${ids.join(',')})`)) },
    salvarCategoria: async (c) => {
      if (c.id) { const { id, ...resto } = c; return exigirLinha(await escrever<Categoria[]>('PATCH', `fin_categorias?id=eq.${id}`, resto))[0] }
      return (await escrever<Categoria[]>('POST', 'fin_categorias', { ...c, marca }))[0]
    },
    salvarConta: async (c) => {
      if (c.id) { const { id, ...resto } = c; return num(exigirLinha(await escrever<Conta[]>('PATCH', `fin_contas?id=eq.${id}`, resto))[0]) }
      return num((await escrever<Conta[]>('POST', 'fin_contas', { ...c, marca }))[0])
    },
    salvarSocio: async (s) => {
      if (s.id) { const { id, ...resto } = s; return num(exigirLinha(await escrever<Socio[]>('PATCH', `fin_socios?id=eq.${id}`, resto))[0]) }
      return num((await escrever<Socio[]>('POST', 'fin_socios', { ...s, marca }))[0])
    },
    salvarProjeto: async (p) => {
      if (p.id) { const { id, ...resto } = p; return exigirLinha(await escrever<Projeto[]>('PATCH', `fin_projetos?id=eq.${id}`, resto))[0] }
      return (await escrever<Projeto[]>('POST', 'fin_projetos', { ...p, marca }))[0]
    },
    historico: (limite = 300) => get<Historico[]>(`fin_historico?marca=eq.${m}&order=em.desc&limit=${limite}`),
    pessoas: (ids) => ids.length ? rpc<Pessoa[]>('fin_pessoas', { p_ids: ids }) : Promise.resolve([]),
    acessos: () => rpc<Acesso[]>('fin_acessos'),
    candidatos: () => rpc<Candidato[]>('fin_candidatos'),
    darAcesso: async (email, papel, marcas, senha) => { await rpc('fin_dar_acesso', { p_email: email, p_papel: papel, p_marcas: marcas, p_senha: senha }) },
    tirarAcesso: async (email) => { await rpc('fin_tirar_acesso', { p_email: email }) },
    enviarAnexo: async (lancamentoId, arquivo) => {
      // o Storage só aceita com a sessão usada há pouco: renova antes de enviar
      if (!(await rpc<string | null>('fin_sessao'))) throw new FinTrancado()
      const limpo = arquivo.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-80) || 'arquivo'
      const path = `${marca}/${lancamentoId}/${Date.now().toString(36)}-${limpo}`
      const r = await fetch(`${base}/storage/v1/object/financeiro/${path}`, {
        method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': arquivo.type || 'application/octet-stream', 'x-upsert': 'false' }, body: arquivo,
      })
      if (!r.ok) throw new Error(r.status === 413 ? 'O arquivo passa de 10 MB.' : 'Não foi possível enviar o comprovante.')
      return { path, nome: arquivo.name, tipo: arquivo.type, tamanho: arquivo.size }
    },
    linkDoAnexo: async (a) => {
      const r = await fetch(`${base}/storage/v1/object/sign/financeiro/${a.path}`, {
        method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }),
      })
      if (!r.ok) throw new Error('Não foi possível abrir o comprovante.')
      const j = await r.json() as { signedURL?: string; signedUrl?: string }
      return `${base}/storage/v1${j.signedURL ?? j.signedUrl}`
    },
    apagarAnexo: async (a) => {
      await fetch(`${base}/storage/v1/object/financeiro/${a.path}`, { method: 'DELETE', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` } })
    },
  }
}

// ── Datas (sempre no dia de Brasília) ─────────────────────────────────────────────────────────────
export const FUSO = 'America/Sao_Paulo'
export const hoje = () => new Date().toLocaleDateString('en-CA', { timeZone: FUSO })
export const somarDias = (dia: string, n: number) => { const d = new Date(`${dia}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** Soma meses mantendo o dia (31/01 + 1 mês = 28/02). */
export const somarMeses = (dia: string, n: number) => {
  const [a, mm, d] = dia.split('-').map(Number)
  const alvo = new Date(Date.UTC(a, mm - 1 + n, 1, 12))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}
export const mesDe = (dia: string) => dia.slice(0, 7)
export const inicioDoMes = (dia: string) => `${dia.slice(0, 7)}-01`
export const fimDoMes = (dia: string) => somarDias(somarMeses(inicioDoMes(dia), 1), -1)
export const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)

export const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const reaisCurto = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e6) return `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (a >= 1e4) return `R$ ${(v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return reais(v)
}
export const dataCurta = (dia: string) => { const [a, m, d] = dia.split('-'); return `${d}/${m}/${a.slice(2)}` }
export const nomeDoMes = (mes: string, curto = false) => {
  const n = new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'UTC', month: curto ? 'short' : 'long', year: curto ? undefined : 'numeric' }).replace('.', '').replace(' de ', ' ')
  return n.charAt(0).toUpperCase() + n.slice(1)
}

// ── Regras ────────────────────────────────────────────────────────────────────────────────────────
/** Entrada ou saída de dinheiro (aporte entra, retirada sai). */
export const ehEntrada = (t: TipoLancamento) => t === 'receita' || t === 'aporte'
/** Entra no resultado do projeto (aporte e retirada são dinheiro dos sócios, não lucro nem custo). */
export const ehOperacional = (t: TipoLancamento) => t === 'receita' || t === 'despesa'
/** O dia que vale para o período: o do pagamento quando pago; o do vencimento quando pendente. */
export const diaDe = (l: Lancamento) => l.pago_em ?? l.vencimento
export type Situacao = 'pago' | 'pendente' | 'vencido'
export const situacaoDe = (l: Lancamento, hojeDia = hoje()): Situacao => l.pago_em ? 'pago' : l.vencimento < hojeDia ? 'vencido' : 'pendente'

export const ROTULO_TIPO: Record<TipoLancamento, string> = { receita: 'Receita', despesa: 'Despesa', aporte: 'Aporte de sócio', retirada: 'Retirada de sócio', devolucao: 'Devolução de parceiro' }
export const FORMAS = ['Pix', 'Cartão de crédito', 'Boleto', 'Transferência', 'Débito automático', 'Dinheiro', 'Plataforma'] as const

export interface Periodo { de: string; ate: string }

export interface Resumo {
  entradas: number; saidas: number; resultado: number; margem: number | null
  aportes: number; retiradas: number
  aReceber: number; aReceberVencido: number; nReceberVencido: number
  aPagar: number; aPagarVencido: number; nPagarVencido: number
  saldoContas: number
}
/** O resumo do período: o que foi recebido e pago nele (caixa) e o que está em aberto agora. */
export function resumir(d: DadosFin, p: Periodo, hojeDia = hoje()): Resumo {
  let entradas = 0, saidas = 0, aportes = 0, retiradas = 0
  let aReceber = 0, aReceberVencido = 0, nReceberVencido = 0, aPagar = 0, aPagarVencido = 0, nPagarVencido = 0
  for (const l of d.lancamentos) {
    if (l.pago_fora) continue
    if (l.pago_em) {
      if (l.pago_em < p.de || l.pago_em > p.ate) continue
      if (l.tipo === 'receita') entradas += l.valor
      else if (l.tipo === 'despesa') saidas += l.valor
      else if (l.tipo === 'aporte') aportes += l.valor
      else retiradas += l.valor
    } else if (l.vencimento > p.ate) {
      continue // série que vence depois do período: entra quando chegar a vez dela
    } else if (ehEntrada(l.tipo)) {
      aReceber += l.valor
      if (l.vencimento < hojeDia) { aReceberVencido += l.valor; nReceberVencido++ }
    } else {
      aPagar += l.valor
      if (l.vencimento < hojeDia) { aPagarVencido += l.valor; nPagarVencido++ }
    }
  }
  const resultado = entradas - saidas
  return {
    entradas, saidas, resultado, margem: entradas > 0 ? resultado / entradas : null, aportes, retiradas,
    aReceber, aReceberVencido, nReceberVencido, aPagar, aPagarVencido, nPagarVencido,
    saldoContas: saldosDasContas(d).reduce((s, c) => s + (c.conta.ativo ? c.saldo : 0), 0),
  }
}

/** O saldo de cada conta: o inicial mais tudo o que já foi pago por ela (pendente não mexe). */
export function saldosDasContas(d: DadosFin): Array<{ conta: Conta; saldo: number; entradas: number; saidas: number }> {
  const m = new Map(d.contas.map((c) => [c.id, { conta: c, saldo: c.saldo_inicial, entradas: 0, saidas: 0 }]))
  for (const l of d.lancamentos) {
    if (l.pago_fora || !l.pago_em || !l.conta_id || (ehOperacional(l.tipo) && l.socio_id)) continue
    const x = m.get(l.conta_id); if (!x) continue
    if (ehEntrada(l.tipo)) { x.saldo += l.valor; x.entradas += l.valor } else { x.saldo -= l.valor; x.saidas += l.valor }
  }
  return [...m.values()]
}

export interface Mes { mes: string; entradas: number; saidas: number; resultado: number }
/** Receitas e despesas pagas, mês a mês, nos últimos `n` meses até o mês de `ate`. */
export function mesAMes(d: DadosFin, ate: string, n = 12): Mes[] {
  const meses: Mes[] = Array.from({ length: n }, (_, i) => ({ mes: mesDe(somarMeses(inicioDoMes(ate), i - n + 1)), entradas: 0, saidas: 0, resultado: 0 }))
  const por = new Map(meses.map((x) => [x.mes, x]))
  for (const l of d.lancamentos) {
    if (l.pago_fora || !l.pago_em || !ehOperacional(l.tipo)) continue
    const x = por.get(mesDe(l.pago_em)); if (!x) continue
    if (l.tipo === 'receita') x.entradas += l.valor; else x.saidas += l.valor
  }
  for (const x of meses) x.resultado = x.entradas - x.saidas
  return meses
}

export interface FatiaCategoria { id: string | null; nome: string; cor: string; valor: number; n: number; parte: number }
/** Para onde foi (ou de onde veio) o dinheiro no período, por categoria, do maior para o menor. */
export function porCategoria(d: DadosFin, p: Periodo, tipo: 'receita' | 'despesa'): FatiaCategoria[] {
  const cat = new Map(d.categorias.map((c) => [c.id, c]))
  const m = new Map<string, FatiaCategoria>()
  let total = 0
  for (const l of d.lancamentos) {
    if (l.pago_fora || l.tipo !== tipo || !l.pago_em || l.pago_em < p.de || l.pago_em > p.ate) continue
    const c = l.categoria_id ? cat.get(l.categoria_id) : undefined
    const chave = c?.id ?? '-'
    const x = m.get(chave) ?? { id: c?.id ?? null, nome: c?.nome ?? 'Sem categoria', cor: c?.cor ?? '#94A3B8', valor: 0, n: 0, parte: 0 }
    x.valor += l.valor; x.n++; total += l.valor
    m.set(chave, x)
  }
  return [...m.values()].map((x) => ({ ...x, parte: total ? x.valor / total : 0 })).sort((a, b) => b.valor - a.valor)
}

export interface LinhaDivisao {
  socio: Socio
  /** parte do resultado no período */
  parte: number
  /** desde o início: parte do resultado acumulado */
  parteTotal: number
  /** colocou no projeto: aportes + despesas pagas do próprio bolso */
  colocou: number
  /** tirou do projeto: retiradas + receitas recebidas na conta pessoal */
  tirou: number
  /** o que o projeto deve ao sócio (positivo) ou o sócio deve ao projeto (negativo) */
  saldo: number
}
/**
 * A divisão entre os sócios. O resultado (receitas − despesas pagas) é dividido pelos percentuais; o
 * acerto de cada sócio, desde o início, é a parte dele + o que ele colocou − o que ele já tirou.
 * Despesa paga do bolso de um sócio conta como dinheiro que ele colocou; receita que caiu na conta
 * pessoal dele conta como dinheiro que ele já tirou.
 */
export function dividir(d: DadosFin, p: Periodo): { resultadoPeriodo: number; resultadoTotal: number; somaPercentual: number; linhas: LinhaDivisao[] } {
  let resultadoPeriodo = 0, resultadoTotal = 0
  const mov = new Map<string, { colocou: number; tirou: number }>()
  for (const l of d.lancamentos) {
    if (!l.pago_em || l.pago_fora) continue
    if (ehOperacional(l.tipo)) {
      const v = l.tipo === 'receita' ? l.valor : -l.valor
      resultadoTotal += v
      if (l.pago_em >= p.de && l.pago_em <= p.ate) resultadoPeriodo += v
    }
    if (!l.socio_id) continue
    const x = mov.get(l.socio_id) ?? { colocou: 0, tirou: 0 }
    if (l.tipo === 'aporte' || l.tipo === 'despesa') x.colocou += l.valor
    else x.tirou += l.valor
    mov.set(l.socio_id, x)
  }
  const ativos = d.socios.filter((s) => s.ativo || mov.has(s.id))
  const somaPercentual = d.socios.filter((s) => s.ativo).reduce((s, x) => s + x.percentual, 0)
  const linhas = ativos.map((s) => {
    const x = mov.get(s.id) ?? { colocou: 0, tirou: 0 }
    const pct = s.ativo ? s.percentual / 100 : 0
    const parteTotal = resultadoTotal * pct
    return { socio: s, parte: resultadoPeriodo * pct, parteTotal, colocou: x.colocou, tirou: x.tirou, saldo: parteTotal + x.colocou - x.tirou }
  })
  return { resultadoPeriodo, resultadoTotal, somaPercentual, linhas }
}

// ── Fonte pagadora (11/11/2026) ───────────────────────────────────────────────────────────────────
export interface FontePagadora { id: string; nome: string; tipo: 'caixa' | 'socio' | 'parceiro'; cor: string; socio?: Socio; parceiro?: string }
/** Caixa da plataforma, os sócios e os parceiros que não são sócios (os responsáveis pelos projetos). */
export function fontesPagadoras(d: DadosFin, nomeDoCaixa: string): FontePagadora[] {
  const socios = d.socios.filter((s) => s.ativo)
  const codigosDeSocio = new Set(socios.map((s) => s.parceiro).filter(Boolean))
  const parceiros = new Map<string, FontePagadora>()
  for (const p of d.projetos) {
    if (!p.parceiro || !p.responsavel || codigosDeSocio.has(p.parceiro) || parceiros.has(p.parceiro)) continue
    parceiros.set(p.parceiro, { id: `p:${p.parceiro}`, nome: p.responsavel, tipo: 'parceiro', cor: p.cor, parceiro: p.parceiro })
  }
  return [
    { id: 'caixa', nome: nomeDoCaixa, tipo: 'caixa', cor: '#1E3D6E' },
    ...socios.map((s) => ({ id: `s:${s.id}`, nome: s.nome, tipo: 'socio' as const, cor: s.cor, socio: s })),
    ...parceiros.values(),
  ]
}
/** O parceiro (não sócio) dono do projeto, ou null quando o projeto é de um sócio ou da plataforma. */
export function parceiroDoProjeto(d: DadosFin, projetoId: string | null): { codigo: string; nome: string } | null {
  const p = projetoId ? d.projetos.find((x) => x.id === projetoId) : null
  if (!p?.parceiro || d.socios.some((s) => s.ativo && s.parceiro === p.parceiro)) return null
  return { codigo: p.parceiro, nome: p.responsavel ?? p.nome }
}
export type Efeito = 'caixa' | 'plataforma-devolve' | 'parceiro-devolve' | 'bolso-do-parceiro'
/**
 * As regras do Tiago para quem pagou uma despesa:
 *   caixa → sai do caixa;
 *   sócio + projeto da plataforma, de um sócio ou sem projeto → a plataforma devolve ao sócio (acerto);
 *   sócio + projeto de um parceiro → o parceiro devolve ao sócio (fora do caixa e do resultado);
 *   parceiro → custo do bolso dele, ninguém devolve.
 */
export function regraDoPagamento(d: DadosFin, fonte: string, projetoId: string | null): { socio_id: string | null; pago_fora: boolean; pago_por: string | null; efeito: Efeito; parceiro: { codigo: string; nome: string } | null } {
  if (fonte.startsWith('p:')) return { socio_id: null, pago_fora: true, pago_por: fonte.slice(2), efeito: 'bolso-do-parceiro', parceiro: null }
  if (fonte.startsWith('s:')) {
    const dono = parceiroDoProjeto(d, projetoId)
    return dono
      ? { socio_id: fonte.slice(2), pago_fora: true, pago_por: null, efeito: 'parceiro-devolve', parceiro: dono }
      : { socio_id: fonte.slice(2), pago_fora: false, pago_por: null, efeito: 'plataforma-devolve', parceiro: null }
  }
  return { socio_id: null, pago_fora: false, pago_por: null, efeito: 'caixa', parceiro: null }
}
/** A fonte pagadora de um lançamento já gravado (o caminho inverso de regraDoPagamento). */
export const fonteDe = (l: Pick<Lancamento, 'socio_id' | 'pago_por' | 'pago_fora'>) => l.pago_por ? `p:${l.pago_por}` : l.socio_id ? `s:${l.socio_id}` : 'caixa'

export interface LinhaDevolucao { parceiro: { codigo: string; nome: string; cor: string }; socio: Socio; devido: number; devolvido: number; saldo: number }
/** O que cada parceiro deve devolver a cada sócio: despesas do projeto do parceiro que o sócio pagou − devoluções. */
export function devolucoes(d: DadosFin): LinhaDevolucao[] {
  const soc = new Map(d.socios.map((s) => [s.id, s]))
  const m = new Map<string, LinhaDevolucao>()
  const linha = (codigo: string, socioId: string) => {
    const s = soc.get(socioId); if (!s) return null
    const chave = `${codigo}|${socioId}`
    if (!m.has(chave)) {
      const p = d.projetos.find((x) => x.parceiro === codigo)
      m.set(chave, { parceiro: { codigo, nome: p?.responsavel ?? p?.nome ?? codigo, cor: p?.cor ?? '#94A3B8' }, socio: s, devido: 0, devolvido: 0, saldo: 0 })
    }
    return m.get(chave)!
  }
  for (const l of d.lancamentos) {
    if (!l.pago_em || !l.socio_id) continue
    if (l.tipo === 'devolucao' && l.pago_por) { const x = linha(l.pago_por, l.socio_id); if (x) x.devolvido += l.valor; continue }
    if (l.tipo !== 'despesa' || !l.pago_fora) continue
    const dono = parceiroDoProjeto(d, l.projeto_id)
    if (!dono) continue
    const x = linha(dono.codigo, l.socio_id); if (x) x.devido += l.valor
  }
  return [...m.values()].map((x) => ({ ...x, saldo: Math.round((x.devido - x.devolvido) * 100) / 100 })).sort((a, b) => b.saldo - a.saldo)
}

export interface LinhaProjeto { projeto: Projeto | null; receitas: number; despesas: number; resultado: number; n: number; parte: number
  /** parte das despesas que o parceiro pagou por fora (está dentro de `despesas`) */
  porFora: number }
/**
 * Custo por projeto (11/11/2026, Tiago: "custo por projeto... projeto do Victor, projeto do Naor"): receitas e
 * despesas pagas no período, por projeto; o que não tem projeto é o custo geral. `parte` = fatia das despesas.
 */
export function porProjeto(d: DadosFin, p: Periodo): LinhaProjeto[] {
  const proj = new Map(d.projetos.map((x) => [x.id, x]))
  const m = new Map<string, LinhaProjeto>()
  for (const x of d.projetos.filter((y) => y.ativo)) m.set(x.id, { projeto: x, receitas: 0, despesas: 0, resultado: 0, n: 0, parte: 0, porFora: 0 })
  let totalDespesas = 0
  for (const l of d.lancamentos) {
    if (!l.pago_em || !ehOperacional(l.tipo) || l.pago_em < p.de || l.pago_em > p.ate) continue
    const chave = l.projeto_id && proj.has(l.projeto_id) ? l.projeto_id : '-'
    const x = m.get(chave) ?? { projeto: chave === '-' ? null : proj.get(chave)!, receitas: 0, despesas: 0, resultado: 0, n: 0, parte: 0, porFora: 0 }
    if (l.tipo === 'receita') x.receitas += l.valor; else { x.despesas += l.valor; totalDespesas += l.valor; if (l.pago_fora) x.porFora += l.valor }
    x.n++
    m.set(chave, x)
  }
  return [...m.values()].map((x) => ({ ...x, resultado: x.receitas - x.despesas, parte: totalDespesas ? x.despesas / totalDespesas : 0 }))
    .sort((a, b) => (a.projeto ? 0 : 1) - (b.projeto ? 0 : 1) || b.despesas - a.despesas || (a.projeto?.ordem ?? 0) - (b.projeto?.ordem ?? 0))
}
/** Só os lançamentos de um projeto ('geral' = os sem projeto); o resto dos dados igual. */
export function doProjeto(d: DadosFin, projeto: string): DadosFin {
  if (!projeto) return d
  return { ...d, lancamentos: d.lancamentos.filter((l) => projeto === 'geral' ? !l.projeto_id : l.projeto_id === projeto) }
}

/** Planilha (CSV com ; e vírgula decimal, que o Excel em português abre direto). */
export function paraCsv(l: Lancamento[], d: DadosFin): string {
  const cat = new Map(d.categorias.map((c) => [c.id, c.nome]))
  const con = new Map(d.contas.map((c) => [c.id, c.nome]))
  const soc = new Map(d.socios.map((c) => [c.id, c.nome]))
  const pro = new Map(d.projetos.map((c) => [c.id, c.nome]))
  const q = (s: string | null | undefined) => `"${(s ?? '').replace(/"/g, '""')}"`
  const linhas = [['Tipo', 'Descrição', 'Valor', 'Vencimento', 'Pago em', 'Situação', 'Categoria', 'Projeto', 'Conta', 'Sócio', 'Fornecedor ou cliente', 'Forma', 'Parcela', 'Observações'].join(';')]
  for (const x of l) {
    const v = (ehEntrada(x.tipo) ? x.valor : -x.valor).toFixed(2).replace('.', ',')
    linhas.push([q(ROTULO_TIPO[x.tipo]), q(x.descricao), v, dataCurta(x.vencimento), x.pago_em ? dataCurta(x.pago_em) : '', q(situacaoDe(x) === 'pago' ? 'Pago' : situacaoDe(x) === 'vencido' ? 'Vencido' : 'Pendente'),
      q(x.categoria_id ? cat.get(x.categoria_id) : ''), q(x.projeto_id ? pro.get(x.projeto_id) : 'Custo geral'), q(x.conta_id ? con.get(x.conta_id) : ''), q(x.socio_id ? soc.get(x.socio_id) : ''),
      q(x.contraparte), q(x.forma), x.parcelas ? `${x.parcela}/${x.parcelas}` : '', q(x.observacoes)].join(';'))
  }
  return '﻿' + linhas.join('\r\n')
}
