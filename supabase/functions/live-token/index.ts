// Ingresso para a sala da transmissão ao vivo (LiveKit), e a moderação que
// precisa da chave secreta do LiveKit (silenciar alguém na sala).
//
// Quem chama manda o próprio token do Supabase. A função confere no banco,
// COM o token da pessoa (as regras de RLS valem), se ela pode assistir a
// live; admin da marca entra como apresentador. A chave do LiveKit nunca
// sai daqui.
//
// Fase de testes (18/10/2026): com `aovivo_config.link_publico` ligado, quem
// abre o link da live sem conta entra como convidado (só assiste e conversa).
// Desligar a chave no estúdio fecha de novo.
//
// Sala de treino transmitida (19/10/2026): `acao: 'treino'` dá o ingresso da
// sala `treino-<marca>`. Só admin da marca transmite (é quem inicia); o GF
// Member (plano "treino") entra para assistir. v7 (20/10/2026): sem o atalho
// do link público na sala de treino (o link público segue valendo só para as
// lives). Quem assiste vê sempre que o público e o chat são simulados.
//
// O LiveKit roda no nosso servidor (código aberto, sem conta em serviço de
// fora). Endereço e chaves ficam na tabela `config_servicos`, que só a chave
// de serviço lê; um segredo da função com o mesmo nome, se existir, vence.
//   LIVEKIT_URL         wss://motor.globalflytrade.com
//   LIVEKIT_API_KEY     a chave da API (a mesma do /etc/livekit.yaml)
//   LIVEKIT_API_SECRET  o segredo da API

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
let LK_URL = Deno.env.get('LIVEKIT_URL') ?? ''
let LK_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? ''
let LK_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? ''

/** Lê endereço e chaves da tabela, uma vez por instância da função. */
async function carregarConfig(): Promise<void> {
  if (LK_URL && LK_KEY && LK_SECRET) return
  if (!SERVICO) return
  const r = await fetch(`${SUPABASE_URL}/rest/v1/config_servicos?select=chave,valor&chave=like.LIVEKIT_*`, {
    headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}` },
  })
  if (!r.ok) return
  const linhas = await r.json() as Array<{ chave: string; valor: string }>
  const v = (k: string) => linhas.find((l) => l.chave === k)?.valor ?? ''
  LK_URL ||= v('LIVEKIT_URL'); LK_KEY ||= v('LIVEKIT_API_KEY'); LK_SECRET ||= v('LIVEKIT_API_SECRET')
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const b64url = (dados: Uint8Array | string) => {
  const bytes = typeof dados === 'string' ? new TextEncoder().encode(dados) : dados
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** JWT HS256 no formato que o LiveKit aceita (iss = chave, sub = identidade). */
async function assinar(payload: Record<string, unknown>): Promise<string> {
  const cab = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const corpo = b64url(JSON.stringify(payload))
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(LK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`${cab}.${corpo}`)))
  return `${cab}.${corpo}.${b64url(sig)}`
}

/** Consulta com a chave de serviço (só o que a função precisa ler por conta própria). */
async function servico<T>(caminho: string): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}${caminho}`, { headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}` } })
  if (!r.ok) throw new Error(`servico ${r.status}`)
  return (await r.json()) as T
}

type LiveRow = { id: string; marca: string; sala: string; status: string; titulo: string; inicio_previsto: string | null }
// O que quem chega pelo link precisa para montar a tela (sem conta não dá para ler a tabela).
const CAMPOS = 'id,marca,sala,titulo,descricao,status,inicio_previsto,iniciada_em,encerrada_em,intervalo_chat,chat_aberto,camera_canto,camera_tamanho,faixa'
const semSala = ({ sala: _sala, ...resto }: LiveRow) => resto

/** A live pelo código do convite (os 8 primeiros caracteres do id). */
async function livePorConvite(codigo: string): Promise<LiveRow | null> {
  if (!/^[0-9a-f]{8}$/i.test(codigo)) return null
  const c = codigo.toLowerCase()
  const linhas = await servico<LiveRow[]>(`/rest/v1/lives?select=${CAMPOS}&id=gte.${c}-0000-0000-0000-000000000000&id=lte.${c}-ffff-ffff-ffff-ffffffffffff&order=criada_em.desc&limit=1`)
  return linhas[0] ?? null
}

/** Fase de testes: a marca deixou o link público (qualquer pessoa assiste sem conta)? */
async function linkPublico(marca: string): Promise<boolean> {
  const [c] = await servico<Array<{ link_publico: boolean }>>(`/rest/v1/aovivo_config?select=link_publico&marca=eq.${marca}`)
  return !!c?.link_publico
}

async function banco<T>(caminho: string, token: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}${caminho}`, {
    ...init,
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
  })
  if (!r.ok) throw new Error(`banco ${r.status}`)
  return (await r.json()) as T
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return resposta(405, { erro: 'Use POST.' })
  await carregarConfig().catch(() => undefined)
  if (!LK_URL || !LK_KEY || !LK_SECRET) return resposta(503, { erro: 'A transmissão ainda não foi configurada.' })

  // Sem conta, o navegador manda a chave pública no lugar do token da pessoa.
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return resposta(401, { erro: 'Entre na sua conta para assistir.' })
  const corpo = await req.json().catch(() => ({})) as { liveId?: string; convite?: string; acao?: string; identidade?: string; nome?: string; marca?: string }
  let { liveId } = corpo
  const { acao, identidade } = corpo

  // Sala de treino: admin transmite, GF Member (plano 'treino') assiste. Desde
  // 20/10/2026 o link público NÃO abre a sala de treino: só GF Member entra.
  if (acao === 'treino') {
    const marca = String(corpo.marca ?? '')
    if (!['teeds', 'omni', 'globalfly'].includes(marca)) return resposta(400, { erro: 'Marca inválida.' })
    const sala = `treino-${marca}`
    const agora = Math.floor(Date.now() / 1000)
    const u = await banco<{ id: string; user_metadata?: Record<string, string> }>('/auth/v1/user', token).catch(() => null)
    if (!u) return resposta(401, { erro: 'Entre na sua conta GF Member para assistir o ensaio.' })
    const rpc = (f: string) => banco<boolean>(`/rest/v1/rpc/${f}`, token, { method: 'POST', body: JSON.stringify({ p_marca: marca }) }).catch(() => false)
    const [admin, membro] = await Promise.all([rpc('teeds_sou_admin_da'), rpc('teeds_minha_sala_de_treino')])
    if (!admin && !membro) return resposta(403, { erro: 'A sala de treino é exclusiva para membros GF Member.' })
    const [ficha] = await banco<Array<{ nome: string | null }>>(`/rest/v1/clientes?select=nome&user_id=eq.${u.id}&marca=eq.${marca}&limit=1`, token).catch(() => [])
    const completo = String(ficha?.nome || u.user_metadata?.nome || u.user_metadata?.full_name || '').trim()
    const nome = (admin ? completo : completo.split(/\s+/)[0]) || (admin ? 'Apresentador' : 'Membro')
    const ingresso = await assinar({
      iss: LK_KEY, sub: u.id, name: nome, nbf: agora, exp: agora + 6 * 3600,
      metadata: JSON.stringify({ moderador: admin, treino: true }),
      video: {
        room: sala, roomJoin: true, canSubscribe: true, canPublishData: true,
        canPublish: admin, roomAdmin: admin,
        ...(admin ? { canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'] } : {}),
      },
    })
    return resposta(200, { url: LK_URL, token: ingresso, nome, moderador: admin, silenciado: false })
  }

  // Quem chegou pelo link: informações públicas da live (se o link estiver aberto).
  if (corpo.convite && !liveId) {
    const l = await livePorConvite(corpo.convite).catch(() => null)
    if (!l) return resposta(404, { erro: 'Este link de live não existe ou expirou.' })
    const publico = await linkPublico(l.marca).catch(() => false)
    if (acao === 'info') return resposta(200, { live: semSala(l), publico })
    liveId = l.id
  }
  if (!liveId || !/^[0-9a-f-]{36}$/i.test(liveId)) return resposta(400, { erro: 'Live inválida.' })

  /**
   * Convidado: só com o link público ligado e a live no ar. Vale para quem
   * não tem conta e para quem tem conta mas não tem acesso a esta live.
   */
  const comoConvidado = async (nomeDado: string, identidadeDada?: string) => {
    const [l] = await servico<LiveRow[]>(`/rest/v1/lives?select=${CAMPOS}&id=eq.${liveId}`).catch(() => [])
    if (!l || !(await linkPublico(l.marca).catch(() => false))) return null
    if (l.status !== 'ao_vivo') return resposta(409, { erro: 'A transmissão ainda não começou.' })
    const agora = Math.floor(Date.now() / 1000)
    const nome = nomeDado.replace(/\s+/g, ' ').trim().slice(0, 30) || 'Convidado'
    const ingresso = await assinar({
      iss: LK_KEY, sub: identidadeDada ?? `convidado-${crypto.randomUUID().slice(0, 12)}`, name: nome, nbf: agora, exp: agora + 4 * 3600,
      metadata: JSON.stringify({ moderador: false, convidado: true }),
      video: { room: l.sala, roomJoin: true, canSubscribe: true, canPublish: false, canPublishData: true },
    })
    // as últimas mensagens, para quem entra no meio (o convidado não lê a tabela)
    const historico = await servico<unknown[]>(`/rest/v1/live_mensagens?select=id,user_id,nome,texto,do_moderador,fixada,apagada,criada_em&live_id=eq.${l.id}&apagada=is.false&order=criada_em.desc&limit=60`).catch(() => [])
    return resposta(200, { url: LK_URL, token: ingresso, nome, moderador: false, silenciado: false, convidado: true, live: semSala(l), historico: historico.reverse() })
  }

  const usuarioOuNada = await banco<{ id: string; email?: string; user_metadata?: Record<string, string> }>('/auth/v1/user', token).catch(() => null)
  if (!usuarioOuNada) return (await comoConvidado(corpo.nome ?? '')) ?? resposta(401, { erro: 'Entre na sua conta para assistir.' })

  try {
    const usuario = usuarioOuNada
    // A RLS só devolve a live para quem pode assistir.
    const [live] = await banco<Array<{ id: string; marca: string; sala: string; status: string }>>(
      `/rest/v1/lives?id=eq.${liveId}&select=id,marca,sala,status`, token)
    if (!live) {
      const primeiro = String(usuario.user_metadata?.nome || usuario.user_metadata?.full_name || '').trim().split(/\s+/)[0]
      return (await comoConvidado(corpo.nome || primeiro, usuario.id)) ?? resposta(403, { erro: 'Esta transmissão não está liberada para a sua conta.' })
    }
    const admin = await banco<boolean>('/rest/v1/rpc/teeds_sou_admin_da', token, { method: 'POST', body: JSON.stringify({ p_marca: live.marca }) })
    const agora = Math.floor(Date.now() / 1000)

    // Moderação: silenciar alguém na sala (o banco já guardou o registro).
    if (acao === 'silenciar' || acao === 'liberar') {
      if (!admin) return resposta(403, { erro: 'Só o moderador pode fazer isso.' })
      if (!identidade) return resposta(400, { erro: 'Falta quem.' })
      const credencial = await assinar({ iss: LK_KEY, sub: usuario.id, nbf: agora, exp: agora + 60, video: { room: live.sala, roomAdmin: true } })
      const host = LK_URL.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
      const r = await fetch(`${host}/twirp/livekit.RoomService/UpdateParticipant`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${credencial}`, 'content-type': 'application/json' },
        body: JSON.stringify({ room: live.sala, identity: identidade, permission: { canSubscribe: true, canPublish: false, canPublishData: acao === 'liberar' } }),
      })
      return r.ok ? resposta(200, { ok: true }) : resposta(502, { erro: `LiveKit respondeu ${r.status}` })
    }

    if (live.status !== 'ao_vivo' && !admin) return resposta(409, { erro: 'A transmissão ainda não começou.' })
    const silenciado = (await banco<unknown[]>(`/rest/v1/live_silenciados?live_id=eq.${liveId}&user_id=eq.${usuario.id}&select=user_id`, token)).length > 0
    const [ficha] = await banco<Array<{ nome: string | null }>>(`/rest/v1/clientes?select=nome&user_id=eq.${usuario.id}&marca=eq.${live.marca}&limit=1`, token).catch(() => [])
    // No chat aparece só o primeiro nome (nunca o e-mail): os outros alunos veem.
    const completo = ficha?.nome || usuario.user_metadata?.nome || usuario.user_metadata?.full_name || ''
    const nome = (admin ? completo : completo.trim().split(/\s+/)[0]) || (admin ? 'Moderador' : 'Aluno')

    const ingresso = await assinar({
      iss: LK_KEY, sub: usuario.id, name: nome, nbf: agora, exp: agora + 6 * 3600,
      metadata: JSON.stringify({ moderador: admin }),
      video: {
        room: live.sala, roomJoin: true, canSubscribe: true,
        canPublish: admin, canPublishData: !silenciado, roomAdmin: admin,
        ...(admin ? { canPublishSources: ['camera', 'microphone', 'screen_share', 'screen_share_audio'] } : {}),
      },
    })
    return resposta(200, { url: LK_URL, token: ingresso, nome, moderador: admin, silenciado })
  } catch (e) {
    return resposta(401, { erro: 'Sua sessão expirou. Entre de novo.', detalhe: String(e) })
  }
})
