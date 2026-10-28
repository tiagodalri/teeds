// Excluir um cadastro de vez (28/10/2026, Tiago: "eu devo conseguir excluir
// qualquer usuário"). Só o admin geral; confirma digitando o e-mail.
//
// POST { marca, user_id, email, confirmacao } com o token de quem pede.
// marca 'todas' (painel na visão da rede): sai o login inteiro, de todas as plataformas.
// Ordem: o pedido de cadastro e o lead (o pedido trava a exclusão da conta),
// os anexos do suporte, a conta (o resto do banco vai junto, em cascata) e a
// auditoria. Não exclui a própria conta nem a de um administrador.

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
const servico = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}${caminho}`, {
  ...init, headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})
const normal = (e: string) => e.trim().toLowerCase()
const semEtiqueta = (e: string) => normal(e).replace(/\+marca-[a-z]+@/, '@')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return falha('use POST', 405)
  let c: { marca?: string; user_id?: string; email?: string; confirmacao?: string }
  try { c = await req.json() } catch { return falha('corpo inválido') }
  const marca = String(c.marca ?? ''), userId = String(c.user_id ?? '')
  const todas = marca === 'todas'
  // filtro de plataforma das consultas (vazio na visão da rede)
  const naMarca = todas ? '' : `&marca=eq.${marca}`
  if (!/^[a-z]{2,20}$/.test(marca) || !/^[0-9a-f-]{36}$/i.test(userId)) return falha('Pedido inválido.')

  // quem pede: precisa ser o admin geral (a função do banco confere com o token da pessoa)
  const token = req.headers.get('Authorization') ?? ''
  const eu = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON, Authorization: token } }).then((r) => (r.ok ? r.json() : null))
  if (!eu?.id) return falha('Entre na sua conta.', 401)
  const geral = await fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_sou_admin_geral`, {
    method: 'POST', headers: { apikey: ANON, Authorization: token, 'Content-Type': 'application/json' }, body: '{}',
  }).then((r) => (r.ok ? r.json() : false))
  if (geral !== true) return falha('Só o admin geral exclui cadastros.', 403)
  if (eu.id === userId) return falha('Você não pode excluir a sua própria conta.', 400)

  // a conta e o e-mail dela
  const conta = await servico(`/auth/v1/admin/users/${userId}`).then((r) => (r.ok ? r.json() : null))
  const ficha = await servico(`/rest/v1/clientes?user_id=eq.${userId}${naMarca}&select=email,nome`).then((r) => (r.ok ? r.json() : [])).then((l) => l[0] ?? null)
  const email = normal(conta?.email ?? ficha?.email ?? c.email ?? '')
  if (!email) return falha('Cadastro não encontrado.', 404)
  if (!c.confirmacao || semEtiqueta(c.confirmacao) !== semEtiqueta(email)) return falha('Digite o e-mail do cliente para confirmar.')

  const admins = await servico(`/rest/v1/administradores?user_id=eq.${userId}&select=marca`).then((r) => (r.ok ? r.json() : []))
  if (admins.length) return falha('Este cadastro é de um administrador. Tire o acesso de admin antes de excluir.', 400)

  const emailPuro = semEtiqueta(email)
  const resumo: Record<string, unknown> = { email: emailPuro, nome: ficha?.nome ?? null }

  // 1. o pedido de cadastro e o lead desta marca (o pedido trava a exclusão da conta)
  const pend = await servico(`/rest/v1/clientes_pendentes?or=(user_id.eq.${userId},email.eq.${encodeURIComponent(emailPuro)})${naMarca}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  resumo.pedidos = pend.ok ? (await pend.json()).length : 'falhou'
  const leads = await servico(`/rest/v1/leads_capturados?email_normalizado=eq.${encodeURIComponent(emailPuro)}${naMarca}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } })
  resumo.leads = leads.ok ? (await leads.json()).length : 'falhou'

  // 2. os anexos do suporte (as conversas saem em cascata com a conta; os arquivos, não)
  const conversas = await servico(`/rest/v1/suporte_conversas?user_id=eq.${userId}${naMarca}&select=id,marca`).then((r) => (r.ok ? r.json() : []))
  for (const cv of conversas) {
    const lista = await servico('/storage/v1/object/list/suporte', { method: 'POST', body: JSON.stringify({ prefix: `${cv.marca}/${cv.id}`, limit: 1000 }) }).then((r) => (r.ok ? r.json() : []))
    const nomes = lista.filter((o: { id?: string }) => o.id).map((o: { name: string }) => `${cv.marca}/${cv.id}/${o.name}`)
    if (nomes.length) await servico('/storage/v1/object/suporte', { method: 'DELETE', body: JSON.stringify({ prefixes: nomes }) })
  }
  resumo.conversas = conversas.length

  // 3. a conta (cascata leva a ficha, as operações, as sessões, as contas Deriv...).
  // Conta antiga ligada a outra plataforma também: só o cadastro desta sai, o login fica.
  const marcas: Array<{ marca: string }> = await servico(`/rest/v1/clientes?user_id=eq.${userId}&select=marca`).then((r) => (r.ok ? r.json() : []))
  // pedido de cadastro em outra plataforma também prende a conta (a chave não cascateia)
  const pedidosFora: unknown[] = await servico(`/rest/v1/clientes_pendentes?user_id=eq.${userId}&select=marca`).then((r) => (r.ok ? r.json() : []))
  const emOutra = !todas && (marcas.some((m) => m.marca !== marca) || pedidosFora.length > 0)
  resumo.loginMantido = emOutra
  if (emOutra) {
    await servico(`/rest/v1/clientes?user_id=eq.${userId}&marca=eq.${marca}`, { method: 'DELETE' })
    await servico(`/rest/v1/suporte_conversas?user_id=eq.${userId}&marca=eq.${marca}`, { method: 'DELETE' })
  } else if (conta?.id) {
    const r = await servico(`/auth/v1/admin/users/${userId}`, { method: 'DELETE' })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      console.error('excluir-cadastro', userId, r.status, t)
      return falha('Não consegui excluir a conta agora. Nada mais foi apagado da conta; tente de novo.', 500)
    }
  } else {
    // só a ficha, sem conta de login
    await servico(`/rest/v1/clientes?user_id=eq.${userId}${naMarca}`, { method: 'DELETE' })
  }

  // 4. auditoria
  await servico('/rest/v1/auditoria_admin', {
    method: 'POST', headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ admin_id: eu.id, cliente_id: null, acao: 'excluir_cadastro', marca, detalhes: { ...resumo, user_id: userId, por: eu.email } }),
  })
  return json({ ok: true, ...resumo })
})
