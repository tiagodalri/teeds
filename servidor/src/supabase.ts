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

export interface SessaoGravada { id: string; user_id: string }

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
}): Promise<SessaoGravada> {
  const { user_id, tipo, moeda } = await usuarioDaConta(dados.contaId)

  const linhas = await rest<any[]>('/sessoes_robos?select=id,user_id', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      sessao_ref: dados.sessaoRef,
      user_id,
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
  return criada
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
export async function contasDoUsuario(userId: string): Promise<string[]> {
  const linhas = await rest<any[]>(
    `/contas_deriv?select=conta_id&user_id=eq.${encodeURIComponent(userId)}`,
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
 * Marca mais uma mensagem no dia de hoje e devolve o total já gasto.
 *
 * Some e devolve numa ida só, do lado do banco. Ler-somar-gravar daqui
 * deixaria duas abas abertas contarem a mesma mensagem duas vezes — ou,
 * pior, nenhuma.
 */
export async function registrarUsoDoChat(userId: string): Promise<number> {
  if (!URL_BASE) return 0
  const r = await rest<any>('/rpc/chat_registrar_uso', {
    method: 'POST',
    body: JSON.stringify({ p_user: userId }),
  })
  return Number(Array.isArray(r) ? r[0] : r) || 0
}

/* ------------------------------------------------------------------ *
 * O cofre: a autorizacao da Deriv de cada cliente
 *
 * O conteudo chega e sai daqui ja cifrado — este arquivo nunca ve um token
 * da Deriv em claro, e nao tem como ver: a chave da cifra mora em cofre.ts.
 * ------------------------------------------------------------------ */

export async function guardarSegredoDeriv(
  userId: string, segredo: string, expiraEm: string | null,
): Promise<void> {
  if (!URL_BASE) throw new Error('O servidor nao esta ligado ao banco da Teeds.')
  await rest('/deriv_autorizacoes?on_conflict=user_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId, segredo, expira_em: expiraEm,
      atualizado_em: new Date().toISOString(),
    }),
  })
}

export async function lerSegredoDeriv(userId: string): Promise<{ segredo: string } | null> {
  if (!URL_BASE) return null
  try {
    const linhas = await rest<any[]>(
      `/deriv_autorizacoes?select=segredo&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    )
    const l = linhas?.[0]
    return l?.segredo ? { segredo: String(l.segredo) } : null
  } catch {
    return null
  }
}
