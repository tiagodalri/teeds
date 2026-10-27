// Entrar com Face ID / digital (chaves de acesso, WebAuthn), 27/10/2026.
//
// Ações (POST, JSON):
//   { acao: 'opcoes-cadastro', marca }               com o token da pessoa
//   { acao: 'cadastrar', marca, desafio, resposta, aparelho }   com o token
//   { acao: 'opcoes-entrada', marca }                sem login
//   { acao: 'entrar', marca, desafio, resposta }     sem login: devolve a sessão
//
// A biometria nunca sai do aparelho: ele assina o desafio com a chave dele e
// aqui só conferimos a assinatura com a chave PÚBLICA guardada. A chave fica
// presa ao domínio da plataforma (rpID). Desafios valem 5 minutos e uma vez só.
// Com a assinatura certa, a sessão é aberta pela própria Supabase (link de
// entrada gerado e usado aqui dentro, nunca enviado por e-mail).

import {
  generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse,
} from 'npm:@simplewebauthn/server@10.0.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const falha = (erro: string, status = 400) => json({ erro }, status)

/** O site de cada plataforma: a chave só vale nele. */
const SITES: Record<string, { rpID: string; origens: string[]; nome: string }> = {
  globalfly: { rpID: 'globalflytrade.com', origens: ['https://globalflytrade.com', 'https://www.globalflytrade.com'], nome: 'GlobalFly Trade' },
}

const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})
const auth = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/auth/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

const b64 = {
  de: (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)),
  para: (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
}

async function quemEsta(req: Request): Promise<{ id: string; email: string } | null> {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: req.headers.get('Authorization') ?? '' } })
  if (!r.ok) return null
  const u = await r.json()
  return u?.id ? { id: u.id, email: u.email ?? '' } : null
}

async function guardarDesafio(marca: string, tipo: 'cadastro' | 'entrada', desafio: string, userId: string | null): Promise<string> {
  // limpa os vencidos de passagem
  await rest(`biometria_desafios?expira_em=lt.${new Date().toISOString()}`, { method: 'DELETE' })
  const r = await rest('biometria_desafios', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ marca, tipo, desafio, user_id: userId }) })
  const l = await r.json()
  return l[0].id
}

/** Lê e apaga (uso único). */
async function usarDesafio(id: string, marca: string, tipo: string): Promise<{ desafio: string; user_id: string | null } | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const r = await rest(`biometria_desafios?id=eq.${id}&marca=eq.${marca}&tipo=eq.${tipo}&select=desafio,user_id,expira_em`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  const l = r.ok ? await r.json() : []
  const d = l[0]
  if (!d || new Date(d.expira_em).getTime() < Date.now()) return null
  return d
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return falha('use POST', 405)
  let c: { acao?: string; marca?: string; desafio?: string; resposta?: any; aparelho?: string }
  try { c = await req.json() } catch { return falha('corpo inválido') }
  const site = c.marca ? SITES[c.marca] : undefined
  if (!site) return falha('Esta plataforma ainda não tem entrada por biometria.')
  const marca = c.marca!

  try {
    /* ------------------------------------------------ cadastrar o aparelho */
    if (c.acao === 'opcoes-cadastro') {
      const u = await quemEsta(req)
      if (!u) return falha('Entre na sua conta.', 401)
      const r = await rest(`biometria_credenciais?user_id=eq.${u.id}&marca=eq.${marca}&select=credencial,transportes`)
      const existentes: Array<{ credencial: string; transportes: string[] }> = r.ok ? await r.json() : []
      const opcoes = await generateRegistrationOptions({
        rpName: site.nome, rpID: site.rpID,
        userID: new TextEncoder().encode(u.id), userName: u.email.replace(/\+marca-[a-z]+@/i, '@'), userDisplayName: u.email.replace(/\+marca-[a-z]+@/i, '@'),
        attestationType: 'none',
        excludeCredentials: existentes.map((x) => ({ id: x.credencial, transports: x.transportes as any })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'required', authenticatorAttachment: 'platform' },
        supportedAlgorithmIDs: [-7, -257],
      })
      const desafio = await guardarDesafio(marca, 'cadastro', opcoes.challenge, u.id)
      return json({ desafio, opcoes })
    }

    if (c.acao === 'cadastrar') {
      const u = await quemEsta(req)
      if (!u) return falha('Entre na sua conta.', 401)
      const d = await usarDesafio(c.desafio ?? '', marca, 'cadastro')
      if (!d || d.user_id !== u.id) return falha('O pedido venceu. Tente de novo.')
      const v = await verifyRegistrationResponse({ response: c.resposta, expectedChallenge: d.desafio, expectedOrigin: site.origens, expectedRPID: site.rpID, requireUserVerification: true })
      if (!v.verified || !v.registrationInfo) return falha('O aparelho não confirmou a biometria.')
      const info = v.registrationInfo
      const r = await rest('biometria_credenciais', {
        // gravação simples: um identificador repetido é recusado (nunca sobrescreve a chave de outra pessoa)
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: u.id, marca, credencial: info.credentialID, chave_publica: b64.para(info.credentialPublicKey), contador: info.counter,
          transportes: c.resposta?.response?.transports ?? [], aparelho: String(c.aparelho ?? '').slice(0, 120),
        }),
      })
      if (r.status === 409) return falha('Este aparelho já está ligado a uma conta.', 409)
      if (!r.ok) return falha('Não foi possível guardar o aparelho.')
      return json({ ok: true })
    }

    /* ------------------------------------------------ entrar */
    if (c.acao === 'opcoes-entrada') {
      const opcoes = await generateAuthenticationOptions({ rpID: site.rpID, userVerification: 'required', allowCredentials: [] })
      const desafio = await guardarDesafio(marca, 'entrada', opcoes.challenge, null)
      return json({ desafio, opcoes })
    }

    if (c.acao === 'entrar') {
      const d = await usarDesafio(c.desafio ?? '', marca, 'entrada')
      if (!d) return falha('O pedido venceu. Tente de novo.')
      const idDaChave = String(c.resposta?.id ?? '')
      const r = await rest(`biometria_credenciais?credencial=eq.${encodeURIComponent(idDaChave)}&marca=eq.${marca}&select=id,user_id,chave_publica,contador,transportes`)
      const cred = r.ok ? (await r.json())[0] : null
      if (!cred) return falha('Este aparelho não está mais ligado à sua conta. Entre com e-mail e senha e ative a biometria de novo no perfil.', 404)
      const v = await verifyAuthenticationResponse({
        response: c.resposta, expectedChallenge: d.desafio, expectedOrigin: site.origens, expectedRPID: site.rpID, requireUserVerification: true,
        authenticator: { credentialID: idDaChave, credentialPublicKey: b64.de(cred.chave_publica), counter: Number(cred.contador), transports: cred.transportes },
      })
      if (!v.verified) return falha('A biometria não confirmou. Tente de novo.', 401)
      await rest(`biometria_credenciais?id=eq.${cred.id}`, { method: 'PATCH', body: JSON.stringify({ contador: v.authenticationInfo.newCounter, usada_em: new Date().toISOString() }) })
      // abre a sessão pela própria Supabase: link de entrada gerado e usado aqui dentro
      const ru = await auth(`admin/users/${cred.user_id}`)
      const usuario = ru.ok ? await ru.json() : null
      if (!usuario?.email) return falha('Conta não encontrada.', 404)
      const rl = await auth('admin/generate_link', { method: 'POST', body: JSON.stringify({ type: 'magiclink', email: usuario.email }) })
      const link = rl.ok ? await rl.json() : null
      const hash = link?.hashed_token ?? link?.properties?.hashed_token
      if (!hash) return falha('Não foi possível abrir a sessão agora.', 500)
      let rs = await fetch(`${SUPABASE_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'email', token_hash: hash }) })
      if (!rs.ok) rs = await fetch(`${SUPABASE_URL}/auth/v1/verify`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: hash }) })
      const sessao = rs.ok ? await rs.json() : null
      if (!sessao?.access_token) return falha('Não foi possível abrir a sessão agora.', 500)
      return json(sessao)
    }
  } catch (e) {
    console.error('biometria', c.acao, e)
    return falha('Não deu certo agora. Tente de novo.', 500)
  }
  return falha('ação desconhecida')
})
