import './ambiente'
import { createHash } from 'node:crypto'
import { emailDeDemonstracao } from '../../src/core/deriv/accountAccess'

/**
 * Espelha no Supabase tudo que o robô faz.
 *
 * Escrito pelo Tiago (teeds-servidor-supabase.js) e adaptado aqui em dois
 * pontos, sem mudar a lógica:
 *
 *  1. Fala com o banco por REST puro (PostgREST), como o resto da Teeds já
 *     faz em `clientes.ts` — em vez da biblioteca `@supabase/supabase-js`.
 *     Uma dependência a menos para empacotar, e o mesmo jeito em todo lugar.
 *  2. Aceita a chave em `SUPABASE_SECRET` (o nome que o `chave.sh` grava)
 *     ou em `SUPABASE_SERVICE_ROLE_KEY`, o nome original.
 *
 * A chave secreta ignora as regras de acesso de propósito: o servidor grava
 * em nome do cliente. Ela nunca pode aparecer no navegador nem no
 * repositório — mora no .env, com permissão 600.
 */

const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const CHAVE = process.env.SUPABASE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export const supabaseConfigurado = () => Boolean(URL_BASE && CHAVE)

export async function simuladorPermitido(userId: string, marca: string): Promise<boolean> {
  return (await rest<boolean>('/rpc/teeds_simulador_permitido', {method:'POST',body:JSON.stringify({p_user:userId,p_marca:marca})})) === true
}

export async function administradorDaMarca(userId: string, marca: string): Promise<boolean> {
  const linhas = await rest<any[]>(`/administradores?user_id=eq.${encodeURIComponent(userId)}&marca=eq.${encodeURIComponent(marca)}&select=user_id&limit=1`)
  return linhas.length === 1
}

async function rest<T>(caminho: string, init: RequestInit = {}): Promise<T> {
  if (!supabaseConfigurado()) throw new Error('Supabase não configurado: falta SUPABASE_URL ou SUPABASE_SECRET no .env.')
  const res = await fetch(`${URL_BASE}/rest/v1${caminho}`, {
    ...init,
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
      'Content-Type': 'application/json',
      ...(init.headers as Record<string, string> ?? {}),
    },
  })
  if (!res.ok) {
    const corpo = await res.json().catch(() => ({} as any))
    const err = new Error(corpo?.message || `Erro ${res.status} em ${caminho}`)
    ;(err as any).code = corpo?.code
    throw err
  }
  if (res.status === 204) return undefined as T
  return (await res.json().catch(() => undefined)) as T
}

/* ------------------------------------------------------------------ *
 * De qual usuário Teeds é esta conta Deriv?
 * A tabela contas_deriv já faz esse vínculo hoje.
 * ------------------------------------------------------------------ */
const cacheUsuario = new Map<string, { user_id: string; tipo: string; moeda: string | null }>()

export async function usuarioDaConta(contaId: string) {
  const guardado = cacheUsuario.get(contaId)
  if (guardado) return guardado

  const linhas = await rest<any[]>(
    `/contas_deriv?select=user_id,tipo,moeda&conta_id=eq.${encodeURIComponent(contaId)}&limit=1`,
  )
  const achado = linhas?.[0]
  if (!achado) throw new Error(`Conta ${contaId} não está vinculada a nenhum login da plataforma.`)

  cacheUsuario.set(contaId, achado)
  return achado
}

/* ------------------------------------------------------------------ *
 * Último dígito do preço — é isso que os robôs de dígito leem.
 * Vem do texto do tick, não do número, senão o zero à direita some
 * (6623.30 vira 6623.3 e o dígito 0 é lido como 3).
 * ------------------------------------------------------------------ */
export function ultimoDigito(precoTexto: unknown): number | null {
  if (precoTexto === null || precoTexto === undefined) return null
  const s = String(precoTexto).trim()
  if (!s) return null
  const d = s.charCodeAt(s.length - 1) - 48
  return d >= 0 && d <= 9 ? d : null
}

export interface SessaoGravada { id: string; user_id: string; marca: string }

/* ------------------------------------------------------------------ *
 * Abre a sessão, antes da 1ª entrada, para a tela já mostrar o robô
 * ligado mesmo antes de operar.
 * ------------------------------------------------------------------ */
export async function abrirSessao(dados: {
  sessaoRef: string
  contaId: string
  roboId: string
  roboNome: string
  ativo?: string
  entrada: number
  stopLoss: number
  takeProfit: number
  maxOperacoes?: number
  origem?: 'navegador' | 'chat' | 'api'
  /** De qual plataforma veio. Separa histórico e comissão entre as marcas. */
  marca?: string
  /** O login que pediu. Sem ele (MCP do dono), cai em usuarioDaConta. */
  userId?: string
  /** A versão dos parâmetros do robô com que a sessão nasce; null = padrão do código. */
  parametrosVersao?: number | null
}): Promise<SessaoGravada> {
  // A mesma conta da Deriv pode estar ligada a mais de um login. A sessão é
  // de quem pediu — procurar "o dono da conta" com limit 1 atribuiria a
  // operação ao login errado quando houver dois.
  let dono: { user_id: string; tipo: string; moeda: string | null } | null = null
  if (dados.userId) {
    const linhas = await rest<any[]>(
      `/contas_deriv?select=user_id,tipo,moeda&user_id=eq.${encodeURIComponent(dados.userId)}` +
      `&conta_id=eq.${encodeURIComponent(dados.contaId)}&order=marca.eq.${encodeURIComponent(dados.marca ?? 'teeds')}.desc&limit=1`,
    ).catch(() => [] as any[])
    dono = linhas?.[0] ?? null
  }
  const { user_id, tipo, moeda } = dono ?? await usuarioDaConta(dados.contaId)

  const linhas = await rest<any[]>('/sessoes_robos?select=id,user_id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      sessao_ref: dados.sessaoRef,
      user_id,
      marca: dados.marca ?? 'teeds',
      conta_id: dados.contaId,
      demo: tipo === 'demo',
      moeda: moeda || 'USD',
      robo_id: dados.roboId,
      robo_nome: dados.roboNome,
      ativo: dados.ativo ?? 'R_75',
      origem: dados.origem ?? 'chat',
      entrada_inicial: dados.entrada,
      entrada_atual: dados.entrada,
      stop_loss: dados.stopLoss,
      take_profit: dados.takeProfit,
      max_operacoes: dados.maxOperacoes ?? 0,
      // Só manda a coluna quando há versão: assim o servidor novo grava sessões
      // mesmo antes de a migração dos parâmetros existir no banco.
      ...(dados.parametrosVersao != null ? { parametros_versao: dados.parametrosVersao } : {}),
      situacao: 'rodando',
    }),
  })
  const criada = linhas?.[0]
  if (!criada) throw new Error('abrirSessao: o banco não devolveu a sessão criada.')
  // A marca segue junto para cada operação desta sessão herdar sem consultar
  // o banco de novo.
  return { ...criada, marca: dados.marca ?? 'teeds' }
}

/* ------------------------------------------------------------------ *
 * Grava uma operação encerrada e atualiza o cabeçalho da sessão.
 *
 * Diferente do rascunho original, isto recebe a operação **já normalizada**
 * pelo motor, e não o objeto cru da Deriv: o motor é quem sabe o preço de
 * entrada e de saída, o dígito de cada um e o acumulado da sessão. Passar o
 * cru aqui obrigaria a recalcular tudo de novo, com risco de divergir da
 * tela — dois lugares contando a mesma coisa é como o erro nasce.
 * ------------------------------------------------------------------ */
export async function registrarOperacao(
  sessao: SessaoGravada,
  op: {
    contractId: number
    contaId: string
    roboId: string
    roboNome: string
    ativo: string
    tipoContrato: string
    demo: boolean
    moeda: string
    entrada: number
    pagamento: number
    resultado: number
    ganhou: boolean
    markupDeriv: number | null
    executadaEm: string
    seq: number
    precoEntrada: number | null
    digitoEntrada: number | null
    precoSaida: number | null
    digitoSaida: number | null
    acumulado: number
  },
  estado: {
    operacoes: number
    ganhas: number
    perdidas: number
    resultado: number
    movimentado: number
    proximaEntrada: number
  },
): Promise<void> {
  try {
    await rest('/operacoes_robos', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        contract_id: op.contractId,
        user_id: sessao.user_id,
        marca: sessao.marca,
        conta_id: op.contaId,
        robo_id: op.roboId,
        robo_nome: op.roboNome,
        ativo: op.ativo,
        tipo_contrato: op.tipoContrato,
        demo: op.demo,
        moeda: op.moeda,
        entrada: op.entrada,
        pagamento: op.pagamento,
        resultado: op.resultado,
        ganhou: op.ganhou,
        markup: Number((op.pagamento * 0.03).toFixed(4)),
        markup_deriv: op.markupDeriv,
        executada_em: op.executadaEm,
        sessao_id: sessao.id,
        seq: op.seq,
        preco_entrada: op.precoEntrada,
        digito_entrada: op.digitoEntrada,
        preco_saida: op.precoSaida,
        digito_saida: op.digitoSaida,
        acumulado: op.acumulado,
      }),
    })
  } catch (e) {
    // contrato repetido não é falha: a Deriv às vezes reemite o mesmo evento
    if ((e as any).code !== '23505') console.error('[supabase] operacoes_robos:', (e as Error).message)
  }

  try {
    await rest(`/sessoes_robos?id=eq.${encodeURIComponent(sessao.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        operacoes: estado.operacoes,
        ganhas: estado.ganhas,
        perdidas: estado.perdidas,
        resultado: Number(estado.resultado.toFixed(2)),
        movimentado: Number(estado.movimentado.toFixed(2)),
        entrada_atual: estado.proximaEntrada,
      }),
    })
  } catch (e) {
    console.error('[supabase] sessoes_robos:', (e as Error).message)
  }
}

/* ------------------------------------------------------------------ *
 * Fecha a sessão. Chamado em TODA saída — stop, meta, teto, parada
 * manual e também quando dá erro.
 * ------------------------------------------------------------------ */
export async function reabrirSessao(sessao: SessaoGravada, config: { stopLoss: number; takeProfit: number; maxOperacoes: number; valorInicial: number; parametrosVersao?: number | null }): Promise<void> {
  await rest(`/sessoes_robos?id=eq.${encodeURIComponent(sessao.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ situacao: 'rodando', encerrada_em: null, motivo_da_parada: null, erro: null, stop_loss: config.stopLoss, take_profit: config.takeProfit, max_operacoes: config.maxOperacoes, entrada_atual: config.valorInicial, ...(config.parametrosVersao != null ? { parametros_versao: config.parametrosVersao } : {}) }),
  })
}

/** O painel publicou e a sessão viva recebeu a versão nova: o registro acompanha. */
export async function atualizarVersaoDaSessao(sessao: SessaoGravada, versao: number | null): Promise<void> {
  await rest(`/sessoes_robos?id=eq.${encodeURIComponent(sessao.id)}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ parametros_versao: versao }),
  })
}

/* ------------------------------------------------------------------ *
 * Parâmetros dos robôs (o painel de controle). Só o servidor escreve.
 * ------------------------------------------------------------------ */

export interface LinhaParametrosBanco {
  marca: string; robo_id: string; versao: number; parametros: unknown; teste_demo?: unknown | null
  rascunho?: unknown | null; rascunho_em?: string | null; rascunho_por?: string | null; ultima_acao?: string
  observacao?: string | null; simulacao?: unknown | null; publicado_em?: string; atualizado_em?: string; atualizado_por?: string | null
}

export async function lerLinhasDeParametros(): Promise<LinhaParametrosBanco[]> {
  return (await rest<LinhaParametrosBanco[]>('/robos_parametros?select=*')) ?? []
}

/**
 * Cria (INSERT) ou altera (PATCH) a linha de um robô. Nunca um upsert cego:
 * salvar um rascunho numa linha existente não pode reescrever o publicado.
 */
export async function gravarLinhaDeParametros(marca: string, roboId: string, existe: boolean, campos: Record<string, unknown>): Promise<LinhaParametrosBanco> {
  const linhas = existe
    ? await rest<LinhaParametrosBanco[]>(`/robos_parametros?marca=eq.${encodeURIComponent(marca)}&robo_id=eq.${encodeURIComponent(roboId)}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(campos),
    })
    : await rest<LinhaParametrosBanco[]>('/robos_parametros', {
      method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ marca, robo_id: roboId, ...campos }),
    })
  const linha = linhas?.[0]
  if (!linha) throw new Error('O banco não devolveu a linha gravada dos parâmetros.')
  return linha
}

export async function apagarLinhaDeParametros(marca: string, roboId: string): Promise<void> {
  await rest(`/robos_parametros?marca=eq.${encodeURIComponent(marca)}&robo_id=eq.${encodeURIComponent(roboId)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

export interface HistoricoParametrosBanco {
  versao: number; acao: string; parametros: unknown; parametros_anteriores?: unknown | null; teste_demo?: unknown | null
  observacao?: string | null; simulacao?: unknown | null; alterado_por?: string | null; alterado_em?: string
}

export async function lerHistoricoDeParametros(marca: string, roboId: string, limite = 50): Promise<HistoricoParametrosBanco[]> {
  return (await rest<HistoricoParametrosBanco[]>(
    `/robos_parametros_versoes?select=versao,acao,parametros,parametros_anteriores,teste_demo,observacao,simulacao,alterado_por,alterado_em` +
    `&marca=eq.${encodeURIComponent(marca)}&robo_id=eq.${encodeURIComponent(roboId)}&order=id.desc&limit=${Math.max(1, Math.min(200, limite))}`,
  )) ?? []
}

export async function gravarAuditoriaAdmin(d: { marca: string; adminId: string; acao: string; detalhes: Record<string, unknown> }): Promise<void> {
  await rest('/auditoria_admin', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ marca: d.marca, admin_id: d.adminId, acao: d.acao, detalhes: d.detalhes }),
  })
}

/** O nome (ou e-mail) de um login, para o histórico dizer quem publicou. */
export async function nomeDoUsuario(userId: string): Promise<string | null> {
  const linhas = await rest<any[]>(`/clientes?select=nome,email&user_id=eq.${encodeURIComponent(userId)}&limit=1`)
  const c = linhas?.[0]
  return c ? String(c.nome || c.email || '') || null : null
}

/** Quantas sessões (gravadas) rodaram com cada versão dos parâmetros deste robô. */
export async function sessoesGravadasPorVersao(marca: string, roboId: string): Promise<Record<string, number>> {
  const linhas = await rest<any[]>(`/sessoes_robos?select=parametros_versao&marca=eq.${encodeURIComponent(marca)}&robo_id=eq.${encodeURIComponent(roboId)}&limit=5000`)
  const saida: Record<string, number> = {}
  for (const l of linhas ?? []) { const k = l.parametros_versao == null ? 'padrao' : String(l.parametros_versao); saida[k] = (saida[k] ?? 0) + 1 }
  return saida
}

export async function encerrarSessao(
  sessao: SessaoGravada,
  { motivo, erro = null }: { motivo: string; erro?: string | null },
): Promise<void> {
  try {
    await rest(`/sessoes_robos?id=eq.${encodeURIComponent(sessao.id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        situacao: erro ? 'erro' : 'encerrada',
        motivo_da_parada: motivo,
        erro,
        encerrada_em: new Date().toISOString(),
      }),
    })
  } catch (e) {
    console.error('[supabase] encerrarSessao:', (e as Error).message)
  }
}

/* ------------------------------------------------------------------ *
 * Rede de segurança: se o servidor cair no meio de uma sessão, ela fica
 * "rodando" para sempre e a tela mente. Roda uma vez ao subir o processo.
 * ------------------------------------------------------------------ */
export async function limparSessoesOrfas(): Promise<void> {
  if (!supabaseConfigurado()) return
  try {
    const linhas = await rest<any[]>('/sessoes_robos?situacao=eq.rodando&select=id', {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        situacao: 'erro',
        erro: 'servidor reiniciado durante a sessão',
        motivo_da_parada: 'o servidor foi reiniciado (publicação ou manutenção) — ligue o robô de novo',
        encerrada_em: new Date().toISOString(),
      }),
    })
    if (linhas?.length) console.log(`[supabase] ${linhas.length} sessão(ões) órfã(s) encerrada(s).`)
  } catch (e) {
    console.error('[supabase] limparSessoesOrfas:', (e as Error).message)
  }
}

/* ------------------------------------------------------------------ *
 * Quem é o dono deste pedido?
 *
 * A tela da Teeds manda o mesmo crachá que ela já usa para falar com o
 * banco (o token do login Supabase). Aqui ele é conferido com o próprio
 * Supabase — o servidor não acredita em quem o navegador diz ser.
 *
 * Crachá conferido fica lembrado por um minuto (22/09/2026). A tela de cada
 * robô pergunta o estado a cada 2 s, e cada pergunta ia ao Supabase de novo
 * pelo mesmo crachá: no teste de carga, isso sozinho tirava um terço da
 * capacidade do servidor (100 → 150 robôs com a memória ligada). Só quem
 * pede `lembrar` usa a memória — a leitura da tela. Ligar, desligar e o
 * chat continuam conferindo a cada pedido. Crachá recusado nunca é lembrado,
 * e a memória guarda a impressão digital do crachá, não o crachá.
 * ------------------------------------------------------------------ */
const CRACHA_LEMBRADO_MS = 60_000
const CRACHAS_NO_MAXIMO = 5_000
const crachasConferidos = new Map<string, { dono: { id: string; email: string }; ate: number }>()

export async function usuarioDoToken(
  token: string,
  opcoes: { lembrar?: boolean; agora?: () => number; conferir?: (token: string) => Promise<{ id: string; email: string } | null> } = {},
): Promise<{ id: string; email: string } | null> {
  if (!token) return null
  const agora = (opcoes.agora ?? Date.now)()
  const digital = createHash('sha256').update(token).digest('hex')
  if (opcoes.lembrar) {
    const lembrado = crachasConferidos.get(digital)
    if (lembrado && lembrado.ate > agora) return lembrado.dono
  }
  const dono = await (opcoes.conferir ?? conferirNoSupabase)(token)
  if (dono) {
    if (crachasConferidos.size >= CRACHAS_NO_MAXIMO) {
      for (const [k, v] of crachasConferidos) if (v.ate <= agora) crachasConferidos.delete(k)
      if (crachasConferidos.size >= CRACHAS_NO_MAXIMO) crachasConferidos.clear()
    }
    crachasConferidos.set(digital, { dono, ate: agora + CRACHA_LEMBRADO_MS })
  } else {
    crachasConferidos.delete(digital)
  }
  return dono
}

async function conferirNoSupabase(token: string): Promise<{ id: string; email: string } | null> {
  if (!URL_BASE) return null
  try {
    const res = await fetch(`${URL_BASE}/auth/v1/user`, {
      headers: { apikey: CHAVE, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const u = (await res.json()) as any
    return u?.id ? { id: String(u.id), email: String(u.email ?? '') } : null
  } catch {
    return null
  }
}

/**
 * Quem esta limitado a conta demo. A identidade vem do Supabase, nunca do
 * corpo do pedido.
 *
 * Ate 13/09/2026 esta funcao perguntava ao banco se a pessoa era
 * administradora DAQUELA marca, e so entao travava. Como administrador e por
 * marca, o mesmo login ficava travado na Teeds (onde e admin) e solto na OMNI
 * (onde e cliente comum) — com operacao real liberada. A trava agora e do
 * e-mail, em qualquer marca: uma consulta a menos e nenhuma brecha por cargo.
 */
export function somenteDemoDoUsuario(dono: { email: string }): boolean {
  return emailDeDemonstracao(dono.email)
}

/** As contas Deriv que este usuário Teeds registrou. */
export async function contasDoUsuario(userId: string, marca?: string): Promise<string[]> {
  // Sem marca, devolve as de todas as plataformas — é o que o MCP e o chat
  // precisam. Com marca, só as daquela, que é o que autoriza uma operação.
  const filtroMarca = marca ? `&marca=eq.${encodeURIComponent(marca)}` : ''
  const linhas = await rest<any[]>(
    `/contas_deriv?select=conta_id&user_id=eq.${encodeURIComponent(userId)}${filtroMarca}`,
  )
  return (linhas ?? []).map((l) => String(l.conta_id))
}

/* ------------------------------------------------------------------ *
 * O chat: limites por cliente e contagem de uso
 *
 * A contagem existe desde o primeiro dia de propósito. Sem ela, o custo do
 * chat só aparece na fatura — e aí já foi gasto.
 * ------------------------------------------------------------------ */

/** Os limites deste cliente, ou nada se ele nunca teve ajuste. */
export async function limitesDoCliente(userId: string): Promise<Partial<{
  entradaMaxima: number; fracaoDoSaldo: number; robosSimultaneos: number; mensagensPorDia: number
}> | null> {
  if (!URL_BASE) return null
  try {
    const linhas = await rest<any[]>(
      `/chat_limites?select=*&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    )
    const l = linhas?.[0]
    if (!l) return null
    return {
      ...(l.entrada_maxima != null ? { entradaMaxima: Number(l.entrada_maxima) } : {}),
      ...(l.fracao_do_saldo != null ? { fracaoDoSaldo: Number(l.fracao_do_saldo) } : {}),
      ...(l.robos_simultaneos != null ? { robosSimultaneos: Number(l.robos_simultaneos) } : {}),
      ...(l.mensagens_por_dia != null ? { mensagensPorDia: Number(l.mensagens_por_dia) } : {}),
    }
  } catch {
    return null
  }
}

/**
 * Anota o que uma mensagem consumiu.
 *
 * Roda DEPOIS de falar com a IA, quando o gasto já é conhecido — por isso é
 * separada de registrarUsoDoChat, que roda antes para poder recusar quem
 * passou do teto do dia. Juntar as duas obrigaria a adivinhar o gasto antes
 * de gastá-lo.
 *
 * Falhar aqui não pode derrubar a resposta do cliente: perder uma anotação
 * de custo é chato; perder a resposta que ele esperou é pior.
 */
export async function registrarGastoDoChat(
  userId: string,
  g: { entrada: number; saida: number; cache: number; idas: number },
  marca = 'teeds',
): Promise<void> {
  if (!URL_BASE) return
  try {
    await rest('/rpc/chat_registrar_gasto', {
      method: 'POST',
      body: JSON.stringify({
        p_user: userId, p_entrada: g.entrada, p_saida: g.saida,
        p_cache: g.cache, p_idas: g.idas, p_marca: marca,
      }),
    })
  } catch (e) {
    console.warn('[chat] nao consegui anotar o gasto:', (e as Error).message)
  }
}

/**
 * Quantas mensagens este cliente já gastou hoje. Só lê.
 *
 * Antes isto somava um antes de falar com a IA, para poder recusar quem
 * passou do teto. O efeito colateral só apareceu quando a API recusou por
 * falta de crédito: cinco tentativas frustradas consumiram cinco das trinta
 * mensagens do dia, sem uma resposta sequer. Conferir o teto é leitura;
 * quem soma é registrarGastoDoChat, depois da resposta chegar.
 */
export async function usoDeHojeDoChat(userId: string, marca = 'teeds'): Promise<number> {
  if (!URL_BASE) return 0
  try {
    const r = await rest<any>('/rpc/chat_uso_de_hoje', {
      method: 'POST',
      body: JSON.stringify({ p_user: userId, p_marca: marca }),
    })
    return Number(Array.isArray(r) ? r[0] : r) || 0
  } catch {
    // Não dá para saber o quanto já foi gasto? Deixa passar. Um teto que
    // bloqueia por não conseguir consultar transforma soluço de banco em
    // cliente sem assistente.
    return 0
  }
}

/* ------------------------------------------------------------------ *
 * O cofre: a autorizacao da Deriv de cada cliente
 *
 * O conteudo chega e sai daqui ja cifrado — este arquivo nunca ve um token
 * da Deriv em claro, e nao tem como ver: a chave da cifra mora em cofre.ts.
 * ------------------------------------------------------------------ */

export async function guardarSegredoDeriv(
  userId: string, segredo: string, expiraEm: string | null, marca: string,
): Promise<void> {
  if (!URL_BASE) throw new Error('O servidor nao esta ligado ao banco da plataforma.')
  await rest('/deriv_autorizacoes?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId, segredo, expira_em: expiraEm, marca,
      atualizado_em: new Date().toISOString(),
    }),
  })
}

export async function lerSegredoDeriv(
  userId: string,
): Promise<{ segredo: string; marca: string } | null> {
  if (!URL_BASE) return null
  try {
    const linhas = await rest<any[]>(
      `/deriv_autorizacoes?select=segredo,marca&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    )
    const l = linhas?.[0]
    return l?.segredo ? { segredo: String(l.segredo), marca: String(l.marca ?? 'teeds') } : null
  } catch {
    return null
  }
}


/* ------------------------------------------------------------------ *
 * A fila dos e-mails de acesso.
 * O Supabase enfileira (ver a migracao teeds_fila_de_emails_de_acesso);
 * o servidor pega, manda com a marca certa e apaga. Nenhum segredo novo:
 * a chave que ja le o banco e a que le a fila.
 * ------------------------------------------------------------------ */
export interface EmailPendente { id: number; aviso: unknown; tentativas: number }

export async function emailsPendentes(limite = 10): Promise<EmailPendente[]> {
  // Depois de 5 tentativas a linha fica para tras, com o erro gravado —
  // insistir para sempre num e-mail que o Resend recusa so gasta cota.
  return (await rest<EmailPendente[]>(
    `/emails_pendentes?select=id,aviso,tentativas&tentativas=lt.5&order=criado_em.asc&limit=${limite}`,
  )) ?? []
}

export async function emailEntregue(id: number): Promise<void> {
  await rest(`/emails_pendentes?id=eq.${id}`, { method: 'DELETE' })
}

export async function emailFalhou(id: number, tentativas: number, erro: string): Promise<void> {
  await rest(`/emails_pendentes?id=eq.${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ tentativas: tentativas + 1, ultimo_erro: erro.slice(0, 500) }),
  })
}

/** Captura publica: o navegador fala com o motor; a chave do banco nunca sai daqui. */
export async function salvarLeadCapturado(d: {
  marca: 'teeds' | 'omni'; nome: string; email: string; telefone: string
  campanha?: string; origem?: string; meio?: string; conteudo?: string; termo?: string; pagina?: string
  tempo: number; profundidade: number; visitas: number; pontuacao: number; temperatura: 'frio' | 'morno' | 'quente'
}): Promise<void> {
  const linha = {
    marca: d.marca, nome: d.nome, email: d.email, telefone: d.telefone,
    email_normalizado: d.email.trim().toLowerCase(), telefone_normalizado: d.telefone.replace(/\D/g, ''),
    campanha: d.campanha || null, origem: d.origem || null, meio: d.meio || null,
    conteudo: d.conteudo || null, termo: d.termo || null, pagina: d.pagina || null,
    tempo_na_pagina: d.tempo, profundidade: d.profundidade, visitas: d.visitas,
    pontuacao: d.pontuacao, temperatura: d.temperatura, consentiu_contato: true,
    atualizado_em: new Date().toISOString(),
  }
  try {
    await rest('/leads_capturados?on_conflict=marca,email_normalizado', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(linha),
    })
  } catch (erro) {
    // A landing não pode perder cadastros enquanto a migração aguarda acesso
    // ao painel do Supabase. A auditoria já existe, tem RLS por marca e aceita
    // JSON: funciona como caixa de entrada segura e o painel também a lê.
    await rest('/auditoria_admin', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ marca: d.marca, acao: 'lead_capturado', detalhes: linha }),
    })
    console.warn('[leads] tabela definitiva indisponível; cadastro preservado na auditoria:', (erro as Error).message)
  }
}

/* ------------------------------------------------------------------ *
 * Depósitos e saques: o que o coletor de extrato (extrato.ts) precisa.
 * Nenhuma política de escrita nas tabelas, de propósito: só a chave
 * secreta do servidor passa.
 * ------------------------------------------------------------------ */

/** Quem conectou a Deriv pela plataforma — é de quem dá para ler o extrato. */
export async function clientesComAutorizacao(): Promise<Array<{ user_id: string; marca: string }>> {
  const linhas = await rest<any[]>('/deriv_autorizacoes?select=user_id,marca&order=atualizado_em.asc')
  return (linhas ?? []).map((l) => ({ user_id: String(l.user_id), marca: String(l.marca ?? 'teeds') }))
}

/** Atualiza a fotografia da conta que o painel administrativo exibe. */
export async function atualizarContaDeriv(dados: {
  userId: string; marca: string; contaId: string; tipo: string
  moeda: string; saldo: number
}): Promise<void> {
  await rest(
    `/contas_deriv?user_id=eq.${encodeURIComponent(dados.userId)}` +
    `&conta_id=eq.${encodeURIComponent(dados.contaId)}` +
    `&marca=eq.${encodeURIComponent(dados.marca)}`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        tipo: dados.tipo,
        moeda: dados.moeda,
        saldo: dados.saldo,
        vista_em: new Date().toISOString(),
      }),
    },
  )
}

/** A movimentação mais recente já guardada desta conta, ou nada. É o cursor da coleta. */
export async function ultimaMovimentacaoDaConta(contaId: string): Promise<Date | null> {
  const linhas = await rest<any[]>(
    `/movimentacoes_deriv?select=ocorrida_em&conta_id=eq.${encodeURIComponent(contaId)}&order=ocorrida_em.desc&limit=1`,
  )
  const v = linhas?.[0]?.ocorrida_em
  return v ? new Date(v) : null
}

export interface MovimentacaoGravavel {
  conta_id: string
  transacao_id: number
  user_id: string
  marca: string
  tipo: 'deposit' | 'withdrawal'
  /** Sempre positivo: o sentido está em `tipo`. */
  valor: number
  moeda: string
  saldo_depois: number | null
  descricao: string | null
  ocorrida_em: string
  demo: boolean
}

/**
 * Guarda o que ainda não estava lá e devolve quantas entraram. Repetida é
 * ignorada, não é erro.
 *
 * A contagem vem de uma consulta antes de gravar, e não da resposta do
 * upsert: com `ignore-duplicates` o PostgREST devolveu lista vazia mesmo
 * tendo inserido, e o log dizia "0 novas" com linhas novas no banco.
 */
export async function gravarMovimentacoes(linhas: MovimentacaoGravavel[]): Promise<number> {
  if (!linhas.length) return 0
  const jaGuardadas = new Set<string>()
  const contas = [...new Set(linhas.map((l) => l.conta_id))]
  for (const conta of contas) {
    const ids = linhas.filter((l) => l.conta_id === conta).map((l) => l.transacao_id)
    const existentes = await rest<any[]>(
      `/movimentacoes_deriv?select=transacao_id&conta_id=eq.${encodeURIComponent(conta)}&transacao_id=in.(${ids.join(',')})`,
    )
    for (const e of existentes ?? []) jaGuardadas.add(`${conta}:${e.transacao_id}`)
  }
  await rest('/movimentacoes_deriv?on_conflict=conta_id,transacao_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(linhas),
  })
  return linhas.filter((l) => !jaGuardadas.has(`${l.conta_id}:${l.transacao_id}`)).length
}

export interface ComissaoDiariaGravavel {
  user_id: string
  marca: string
  conta_id: string
  dia: string
  operacoes: number
  pagamentos: number
  comissao: number
  entradas: number
  resultado: number
  moeda: string
  demo: boolean
  atualizado_em: string
}

/** Grava (ou atualiza) a comissão calculada de cada dia — a mesma chave que o navegador usa. */
export async function gravarComissoesDiarias(linhas: ComissaoDiariaGravavel[]): Promise<void> {
  if (!linhas.length) return
  await rest('/comissoes_diarias?on_conflict=user_id,conta_id,dia,marca', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(linhas),
  })
}

/** Anota a tentativa desta conta. No sucesso limpa o erro; na falha preserva o último sucesso. */
export async function anotarColetaDeExtrato(d: {
  contaId: string; userId: string; marca: string; ok: boolean; erro?: string
}): Promise<void> {
  const agora = new Date().toISOString()
  await rest('/extrato_coletas?on_conflict=conta_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      conta_id: d.contaId, user_id: d.userId, marca: d.marca, ultima_tentativa_em: agora,
      ...(d.ok
        ? { ultimo_sucesso_em: agora, ultimo_erro: null }
        : { ultimo_erro: (d.erro ?? 'erro desconhecido').slice(0, 500) }),
    }),
  })
}

/* ------------------------------------------------------------------ *
 * O espelho operacional ao vivo (ver src/core/teeds/espelho.ts).
 * A foto atual de cada sessão e os eventos numerados — o que o painel de
 * monitoramento reconstrói. Só o servidor escreve; falha vira log.
 * ------------------------------------------------------------------ */
export async function escreverFotoDoEspelho(
  sessao: SessaoGravada,
  foto: { seq: number; estado: unknown; config: unknown; emitidoEm: number },
): Promise<void> {
  await rest('/sessoes_robos_ao_vivo?on_conflict=sessao_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      sessao_id: sessao.id,
      marca: sessao.marca,
      user_id: sessao.user_id,
      seq: foto.seq,
      fase: (foto.estado as { fase?: string })?.fase ?? 'aguardando',
      estado: foto.estado,
      config: foto.config,
      emitido_em: foto.emitidoEm,
      atualizada_em: new Date().toISOString(),
    }),
  })
}

export async function escreverEventoDoEspelho(
  sessao: SessaoGravada,
  ev: { seq: number; tipo: string; delta: unknown; config?: unknown; emitidoEm: number },
): Promise<void> {
  await rest('/eventos_robos_ao_vivo', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      sessao_id: sessao.id, marca: sessao.marca, seq: ev.seq, tipo: ev.tipo, delta: ev.delta,
      config: ev.config ?? null, emitido_em: ev.emitidoEm,
    }),
  })
}

/** O pulso: pequeno, a cada tick (coalescido) e no batimento de presença. */
export async function escreverPulsoDoEspelho(
  sessao: SessaoGravada,
  p: { seq: number; pulso: unknown; emitidoEm: number },
): Promise<void> {
  await rest('/pulsos_robos_ao_vivo?on_conflict=sessao_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      sessao_id: sessao.id, marca: sessao.marca, seq: p.seq, pulso: p.pulso, emitido_em: p.emitidoEm,
      atualizada_em: new Date().toISOString(),
    }),
  })
}

/** Apaga eventos e fotos velhos, pela função do banco (só a chave de serviço chama). */
export async function limparEspelhoAntigo(): Promise<unknown> {
  return rest('/rpc/teeds_limpar_espelho', { method: 'POST', body: JSON.stringify({}) })
}
