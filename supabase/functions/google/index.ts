// Entrar com Google (17/11/2026, Tiago: "colocar no login a opção de logar com a conta do Google").
//
// POST { marca, token }   sem login: devolve a sessão, como o login com senha.
//
// O site abre o Google numa janelinha (Google Identity Services, cliente de
// token) e recebe um token de acesso. Aqui conferimos com o próprio Google
// que esse token foi emitido PARA O NOSSO cliente (aud/azp) e que o e-mail
// está verificado. Sem isso, um token de qualquer outro app com "Entrar com
// Google" serviria para abrir conta alheia.
//
// Cada marca tem a sua conta (emailDaConta.ts): o e-mail do Google vira
// ana+marca-globalfly@gmail.com e só entra quem JÁ TEM conta na marca. Quem
// não tem é mandado ao cadastro: na GlobalFly o cadastro passa pela escolha
// do plano e pela aprovação de leads, e o Google não pode pular isso.
//
// A sessão é aberta pela própria Supabase, como na biometria: link de entrada
// gerado e usado aqui dentro, nunca enviado por e-mail.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const falha = (erro: string, status = 400, extra: Record<string, unknown> = {}) => json({ erro, ...extra }, status)

/** O cliente do Google de cada plataforma (público: é o mesmo que vai no site). */
const CLIENTES: Record<string, string> = {
  globalfly: '102239518654-4n3jnce409u3mn5p2l2cvsv5vh3h8pnt.apps.googleusercontent.com',
}

const auth = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/auth/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

const ETIQUETA = /\+marca-([a-z0-9]+)(?=@[^@]+$)/i
function emailDaConta(email: string, marca: string): string {
  const e = email.trim().toLowerCase()
  if (!marca || marca === 'teeds') return e
  const arroba = e.lastIndexOf('@')
  if (arroba < 1 || ETIQUETA.test(e)) return e
  return `${e.slice(0, arroba)}+marca-${marca}${e.slice(arroba)}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return falha('use POST', 405)
  let c: { marca?: string; token?: string }
  try { c = await req.json() } catch { return falha('corpo inválido') }
  const cliente = c.marca ? CLIENTES[c.marca] : undefined
  if (!cliente || cliente.startsWith('__')) return falha('Esta plataforma ainda não tem entrada pelo Google.')
  const token = String(c.token ?? '')
  if (!token || token.length > 4096) return falha('O Google não confirmou. Tente de novo.')

  try {
    // 1. o Google diz de quem é o token e para qual app ele foi emitido
    const ri = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`)
    const info = ri.ok ? await ri.json() : null
    if (!info) return falha('O Google não confirmou. Tente de novo.', 401)
    if (info.aud !== cliente && info.azp !== cliente) return falha('O Google não confirmou. Tente de novo.', 401)
    if (Number(info.expires_in ?? 0) <= 0) return falha('O pedido venceu. Tente de novo.', 401)
    const verificado = info.email_verified === true || info.email_verified === 'true'
    const email = String(info.email ?? '').trim().toLowerCase()
    if (!email || !verificado) return falha('Essa conta do Google não tem e-mail confirmado.', 401)

    // 2. a conta desta marca, já existente (o filtro do GoTrue é por trecho: confere o e-mail inteiro)
    const conta = emailDaConta(email, c.marca!)
    const ru = await auth(`admin/users?filter=${encodeURIComponent(conta)}`)
    const lista = ru.ok ? await ru.json() : null
    const usuario = (lista?.users ?? []).find((u: { email?: string }) => String(u.email ?? '').toLowerCase() === conta)
    if (!usuario) {
      return falha(`Não achamos conta com ${email}. Se você se cadastrou com outro e-mail, entre com ele e a sua senha. Se ainda não tem conta, toque em Cadastre-se.`, 404, { semConta: true, email, nome: String(info.name ?? '') })
    }
    if (usuario.banned_until && new Date(usuario.banned_until).getTime() > Date.now()) return falha('Esta conta está bloqueada. Fale com o suporte.', 403)

    // 3. abre a sessão pela própria Supabase
    const rl = await auth('admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: conta }) })
    const link = rl.ok ? await rl.json() : null
    const hash = link?.hashed_token ?? link?.properties?.hashed_token
    if (!hash) return falha('Não foi possível abrir a sessão agora.', 500)
    let rs = await fetch(`${SUPABASE_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'email', token_hash: hash }) })
    if (!rs.ok) rs = await fetch(`${SUPABASE_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hash }) })
    const sessao = rs.ok ? await rs.json() : null
    if (!sessao?.access_token) return falha('Não foi possível abrir a sessão agora.', 500)
    return json(sessao)
  } catch (e) {
    console.error('google', e)
    return falha('Não deu certo agora. Tente de novo.', 500)
  }
})
