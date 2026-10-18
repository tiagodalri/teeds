// Ingresso para a sala da transmissão ao vivo (LiveKit), e a moderação que
// precisa da chave secreta do LiveKit (silenciar alguém na sala).
//
// Quem chama manda o próprio token do Supabase. A função confere no banco,
// COM o token da pessoa (as regras de RLS valem), se ela pode assistir a
// live; admin da marca entra como apresentador. A chave do LiveKit nunca
// sai daqui.
//
// Segredos da função (Supabase > Edge Functions > Secrets):
//   LIVEKIT_URL         wss://<projeto>.livekit.cloud
//   LIVEKIT_API_KEY     a chave da API
//   LIVEKIT_API_SECRET  o segredo da API

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const LK_URL = Deno.env.get('LIVEKIT_URL') ?? ''
const LK_KEY = Deno.env.get('LIVEKIT_API_KEY') ?? ''
const LK_SECRET = Deno.env.get('LIVEKIT_API_SECRET') ?? ''

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
  if (!LK_URL || !LK_KEY || !LK_SECRET) return resposta(503, { erro: 'A transmissão ainda não foi configurada.' })

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return resposta(401, { erro: 'Entre na sua conta para assistir.' })
  const { liveId, acao, identidade } = await req.json().catch(() => ({})) as { liveId?: string; acao?: string; identidade?: string }
  if (!liveId || !/^[0-9a-f-]{36}$/i.test(liveId)) return resposta(400, { erro: 'Live inválida.' })

  try {
    const usuario = await banco<{ id: string; email?: string; user_metadata?: Record<string, string> }>('/auth/v1/user', token)
    // A RLS só devolve a live para quem pode assistir.
    const [live] = await banco<Array<{ id: string; marca: string; sala: string; status: string }>>(
      `/rest/v1/lives?id=eq.${liveId}&select=id,marca,sala,status`, token)
    if (!live) return resposta(403, { erro: 'Esta transmissão não está liberada para a sua conta.' })
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
