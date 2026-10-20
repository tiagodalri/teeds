/**
 * Separa as contas antigas por marca (20/10/2026). Roda uma vez, no servidor:
 *
 *   node dist/separar-contas.mjs            mostra o que faria
 *   node dist/separar-contas.mjs --aplicar  faz
 *
 * Até aqui uma conta servia às três marcas (ver src/core/teeds/emailDaConta.ts).
 * Para cada conta sem etiqueta que tem ficha fora da Teeds:
 *  - a conta de sempre fica com a Teeds (se a pessoa tem ficha lá); senão ela
 *    passa a ser da marca da ficha (só troca o e-mail do login, mesmo id);
 *  - cada outra marca ganha uma conta nova com a MESMA senha de hoje (a cifra
 *    é copiada dentro do banco) e recebe tudo o que é dela: ficha, admin,
 *    Deriv, sessões, operações, aulas, lives.
 * Depois, cadastro pendente de outra marca que apontava para a conta de
 * sempre volta a não ter conta: a aprovação cria a conta certa.
 *
 * Pode rodar de novo: o que já foi separado não aparece mais.
 */
import './ambiente'
import { randomBytes } from 'node:crypto'
import { emailDaConta, emailReal, marcaDaConta } from '../../src/core/teeds/emailDaConta'

const APLICAR = process.argv.includes('--aplicar')
const base = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const chave = process.env.SUPABASE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
if (!base || !chave) throw new Error('Servidor sem SUPABASE_URL/SUPABASE_SECRET')

async function api(caminho: string, metodo = 'GET', corpo?: unknown): Promise<any> {
  const r = await fetch(`${base}${caminho}`, {
    method: metodo, signal: AbortSignal.timeout(20_000),
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${metodo} ${caminho.split('?')[0]} → ${r.status} ${texto.slice(0, 200)}`)
  return texto ? JSON.parse(texto) : undefined
}
const usuario = (id: string) => api(`/auth/v1/admin/users/${id}`)
const ocultar = (e: string) => e.replace(/^(.{2}).*(@.*)$/, '$1…$2')

async function contaDaMarca(real: string, marca: string): Promise<any | null> {
  const alvo = emailDaConta(real, marca)
  const d = await api(`/auth/v1/admin/users?filter=${encodeURIComponent(alvo)}`)
  return (d?.users ?? []).find((u: any) => String(u.email).toLowerCase() === alvo) ?? null
}

const fichas: Array<{ user_id: string; marca: string }> = await api('/rest/v1/clientes?select=user_id,marca&marca=neq.teeds')
const ids = [...new Set(fichas.map((f) => f.user_id))]
console.log(`${APLICAR ? 'APLICANDO' : 'SIMULAÇÃO (nada muda; use --aplicar)'} · ${ids.length} contas com ficha fora da Teeds\n`)

let mexidas = 0
for (const id of ids) {
  const u = await usuario(id)
  const loginAtual = String(u.email ?? '').toLowerCase()
  if (marcaDaConta(loginAtual) !== 'teeds') continue // já separada
  const real = emailReal(loginAtual)
  const marcas: string[] = (await api(`/rest/v1/clientes?select=marca&user_id=eq.${id}`)).map((l: any) => l.marca)
  const fica = marcas.includes('teeds') ? 'teeds' : marcas.filter((m) => m !== 'teeds').sort()[0]
  const novas = marcas.filter((m) => m !== 'teeds' && m !== fica)
  console.log(`• ${ocultar(real)}  fichas: ${marcas.join(', ')}  →  conta de sempre: ${fica}${novas.length ? `; contas novas: ${novas.join(', ')}` : ''}`)
  mexidas++
  if (!APLICAR) continue

  if (fica !== 'teeds') {
    await api(`/auth/v1/admin/users/${id}`, 'PUT', {
      email: emailDaConta(real, fica), email_confirm: true,
      user_metadata: { ...u.user_metadata, marca: fica },
    })
    console.log(`   e-mail do login trocado para a conta da ${fica} (mesmo id, mesma senha)`)
  }
  for (const marca of novas) {
    let nova = await contaDaMarca(real, marca)
    if (!nova) {
      // senha aleatória só no instante da criação: logo abaixo vira a senha de hoje
      nova = await api('/auth/v1/admin/users', 'POST', {
        email: emailDaConta(real, marca), password: randomBytes(24).toString('base64url'), email_confirm: true,
        user_metadata: { ...u.user_metadata, marca },
        app_metadata: { separada_de: id, separada_em: new Date().toISOString() },
      })
    }
    await api('/rest/v1/rpc/teeds_copiar_senha', 'POST', { p_de: id, p_para: nova.id })
    const movido = await api('/rest/v1/rpc/teeds_mover_dados_da_marca', 'POST', { p_de: id, p_para: nova.id, p_marca: marca })
    console.log(`   ${marca}: conta nova ${String(nova.id).slice(0, 8)}…, mesma senha; levou ${JSON.stringify(movido)}`)
  }
}

// Cadastros pendentes de outra marca presos à conta de sempre.
const pendentes: Array<{ id: string; marca: string; email: string; user_id: string }> =
  await api('/rest/v1/clientes_pendentes?select=id,marca,email,user_id&marca=neq.teeds&status=eq.pendente&user_id=not.is.null')
for (const p of pendentes) {
  const u = await usuario(p.user_id).catch(() => null)
  if (u && String(u.email).toLowerCase() === emailDaConta(p.email, p.marca)) continue
  console.log(`• cadastro pendente na ${p.marca} de ${ocultar(p.email)} solto da conta de outra marca`)
  mexidas++
  if (APLICAR) await api(`/rest/v1/clientes_pendentes?id=eq.${p.id}&status=eq.pendente`, 'PATCH', { user_id: null })
}

console.log(`\n${mexidas} ${mexidas === 1 ? 'ajuste' : 'ajustes'} ${APLICAR ? 'feitos' : 'a fazer'}.`)
