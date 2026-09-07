import './ambiente'

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
  if (!achado) throw new Error(`Conta ${contaId} não está vinculada a nenhum login da Teeds.`)

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
      ativo: dados.ativo ?? '1HZ75V',
      origem: dados.origem ?? 'chat',
      entrada_inicial: dados.entrada,
      entrada_atual: dados.entrada,
      stop_loss: dados.stopLoss,
      take_profit: dados.takeProfit,
      max_operacoes: dados.maxOperacoes ?? 0,
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
        motivo_da_parada: 'sessão interrompida',
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
 * ------------------------------------------------------------------ */
export async function usuarioDoToken(token: string): Promise<{ id: string } | null> {
  if (!URL_BASE || !token) return null
  try {
    const res = await fetch(`${URL_BASE}/auth/v1/user`, {
      headers: { apikey: CHAVE, Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null
    const u = (await res.json()) as any
    return u?.id ? { id: String(u.id) } : null
  } catch {
    return null
  }
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
  if (!URL_BASE) throw new Error('O servidor nao esta ligado ao banco da Teeds.')
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
