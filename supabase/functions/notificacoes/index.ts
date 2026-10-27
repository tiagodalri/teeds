// Notificações no celular (Web Push), 27/10/2026.
//
// Ações (POST, JSON):
//   { acao: 'chave', marca }          a chave pública VAPID da plataforma (o app
//                                      precisa dela para inscrever o aparelho)
//   { acao: 'teste', marca }          com o token da pessoa: manda um aviso de
//                                      teste para os aparelhos dela
//   { acao: 'sessao', id }            do gatilho do banco (cabeçalho x-gatilho):
//                                      a sessão de I.A. terminou; avisa a pessoa
//
// A chave VAPID de cada plataforma nasce aqui na primeira vez e fica em
// config_servicos (VAPID_<MARCA>), que só a chave de serviço lê. O segredo do
// gatilho (PUSH_GATILHO) foi criado pelo próprio banco. Nada disso sai daqui.

import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

async function lerConfig(chave: string): Promise<string | null> {
  const r = await rest(`config_servicos?chave=eq.${encodeURIComponent(chave)}&select=valor`)
  const l = r.ok ? await r.json() : []
  return l[0]?.valor ?? null
}

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A chave VAPID da plataforma; cria na primeira vez (a privada nunca sai do servidor). */
const MARCAS = new Set(['globalfly', 'teeds', 'omni'])
const cacheChaves = new Map<string, { publica: string; privada: string }>()
async function chaveDa(marca: string): Promise<{ publica: string; privada: string }> {
  const nome = `VAPID_${marca.toUpperCase()}`
  const pronta = cacheChaves.get(nome)
  if (pronta) return pronta
  let valor = await lerConfig(nome)
  if (!valor) {
    const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const publica = b64url(await crypto.subtle.exportKey('raw', par.publicKey))
    const privada = (await crypto.subtle.exportKey('jwk', par.privateKey)).d!
    // se duas instâncias criarem ao mesmo tempo, vale a primeira gravada
    await rest('config_servicos', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ chave: nome, valor: JSON.stringify({ publica, privada }) }) })
    valor = await lerConfig(nome)
  }
  const chave = JSON.parse(valor!)
  cacheChaves.set(nome, chave)
  return chave
}

const SITE: Record<string, string> = { globalfly: 'https://globalflytrade.com' }

interface Aviso { titulo: string; corpo: string; tag: string; url?: string }

/** Manda para todos os aparelhos da pessoa naquela plataforma; tira os que não existem mais. */
async function enviar(userId: string, marca: string, aviso: Aviso): Promise<{ enviados: number; falhas: number; detalhes: string[] }> {
  const r = await rest(`push_assinaturas?user_id=eq.${userId}&marca=eq.${encodeURIComponent(marca)}&select=id,endpoint,p256dh,auth`)
  const lista: Array<{ id: string; endpoint: string; p256dh: string; auth: string }> = r.ok ? await r.json() : []
  if (!lista.length) return { enviados: 0, falhas: 0, detalhes: ['sem aparelhos inscritos'] }
  const chave = await chaveDa(marca)
  const vapidDetails = { subject: SITE[marca] ?? 'https://globalflytrade.com', publicKey: chave.publica, privateKey: chave.privada }
  let enviados = 0, falhas = 0
  const detalhes: string[] = []
  await Promise.all(lista.map(async (a) => {
    try {
      const res = await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(aviso), { TTL: 6 * 3600, urgency: 'high', vapidDetails })
      enviados++
      detalhes.push(`${new URL(a.endpoint).host} ${res.statusCode}`)
    } catch (e) {
      falhas++
      const status = (e as { statusCode?: number }).statusCode
      detalhes.push(`${(() => { try { return new URL(a.endpoint).host } catch { return '?' } })()} ${status ?? ''} ${String((e as Error).message ?? e).slice(0, 120)}`)
      // o aparelho tirou a permissão ou o navegador trocou a inscrição
      if (status === 404 || status === 410) await rest(`push_assinaturas?id=eq.${a.id}`, { method: 'DELETE' })
      else await rest(`push_assinaturas?id=eq.${a.id}`, { method: 'PATCH', body: JSON.stringify({ falhas: 1 }) })
    }
  }))
  return { enviados, falhas, detalhes }
}

/* ------------------------------------------------------------ as mensagens */

const dinheiro = (v: number, moeda: string) => {
  const f = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v))
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${f}`
}

function mensagemDaSessao(s: { id: string; marca: string; robo_nome: string | null; robo_id: string; resultado: number | null; moeda: string | null; motivo_da_parada: string | null; situacao: string; operacoes: number | null }): Aviso | null {
  const motivo = (s.motivo_da_parada ?? '').trim()
  if (/^você pediu para parar/i.test(motivo)) return null
  const gf = s.marca === 'globalfly'
  const nome = (s.robo_nome || s.robo_id || (gf ? 'A I.A.' : 'O robô')).trim()
  const ela = gf ? 'ela' : 'ele', desligad = gf ? 'desligada' : 'desligado'
  const resultado = `Resultado da sessão: ${dinheiro(Number(s.resultado ?? 0), s.moeda ?? 'USD')}.`
  const base = { tag: `sessao-${s.id}`, url: './' }
  if (/meta de lucro atingida/i.test(motivo)) return { ...base, titulo: `${nome} bateu a meta`, corpo: `${resultado} ${gf ? 'A I.A.' : 'O robô'} já foi ${desligad}.` }
  if (/limite de perda protegido/i.test(motivo)) return { ...base, titulo: `${nome} parou para proteger o seu limite`, corpo: `A próxima entrada passaria do limite de perda que você definiu. ${resultado}` }
  if (/limite de perda/i.test(motivo)) return { ...base, titulo: `${nome} parou no limite de perda`, corpo: `${resultado} ${gf ? 'Ela' : 'Ele'} foi ${desligad} como você definiu.` }
  if (/limite de \d+ operações/i.test(motivo)) return { ...base, titulo: `${nome} completou as operações da sessão`, corpo: resultado }
  if (/InsufficientBalance|saldo/i.test(motivo)) return { ...base, titulo: `${nome} parou: saldo insuficiente`, corpo: `A Deriv não aceitou a próxima entrada por falta de saldo. ${resultado}` }
  if (/Deriv recusou/i.test(motivo)) return { ...base, titulo: `${nome} parou`, corpo: `A Deriv recusou a compra. Abra o app para ver o motivo. ${resultado}` }
  if (/servidor foi reiniciado|manutenção/i.test(motivo)) return { ...base, titulo: `${nome} foi ${desligad}`, corpo: `Houve uma manutenção na plataforma. Você pode ligar ${ela} de novo quando quiser.` }
  const texto = motivo ? motivo[0].toUpperCase() + motivo.slice(1) : (s.situacao === 'erro' ? 'Parou por um erro' : 'A sessão terminou')
  return { ...base, titulo: `${nome} parou`, corpo: `${texto.replace(/\.$/, '')}. ${resultado}` }
}

/* ------------------------------------------------------------------ entrada */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'use POST' }, 405)
  let corpo: { acao?: string; marca?: string; id?: string }
  try { corpo = await req.json() } catch { return json({ erro: 'corpo inválido' }, 400) }

  if (corpo.acao === 'chave') {
    if (!corpo.marca || !MARCAS.has(corpo.marca)) return json({ erro: 'marca inválida' }, 400)
    return json({ chave: (await chaveDa(corpo.marca)).publica })
  }

  if (corpo.acao === 'teste') {
    if (!corpo.marca || !MARCAS.has(corpo.marca)) return json({ erro: 'marca inválida' }, 400)
    const quem = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICO, Authorization: req.headers.get('Authorization') ?? '' } })
    if (!quem.ok) return json({ erro: 'Entre na sua conta.' }, 401)
    const u = await quem.json()
    const gf = corpo.marca === 'globalfly'
    const r = await enviar(u.id, corpo.marca, {
      titulo: 'Notificações ligadas', tag: 'teste', url: './',
      corpo: gf ? 'Quando uma I.A. bater a meta ou parar, você fica sabendo aqui, mesmo com o app fechado.' : 'Quando um robô bater a meta ou parar, você fica sabendo aqui, mesmo com o app fechado.',
    })
    return json(r)
  }

  if (corpo.acao === 'sessao') {
    const segredo = await lerConfig('PUSH_GATILHO')
    if (!segredo || req.headers.get('x-gatilho') !== segredo) return json({ erro: 'não autorizado' }, 401)
    if (!corpo.id) return json({ erro: 'sem sessão' }, 400)
    // o motivo pode chegar numa gravação logo depois da troca de situação
    await new Promise((ok) => setTimeout(ok, 1500))
    const r = await rest(`sessoes_robos?id=eq.${corpo.id}&select=id,user_id,marca,robo_nome,robo_id,resultado,moeda,motivo_da_parada,situacao,operacoes`)
    const s = r.ok ? (await r.json())[0] : null
    if (!s) return json({ erro: 'sessão não encontrada' }, 404)
    const aviso = mensagemDaSessao(s)
    if (!aviso) return json({ enviados: 0, motivo: 'a pessoa parou' })
    const res = await enviar(s.user_id, s.marca, aviso)
    console.log('sessao', s.id, s.marca, res)
    return json(res)
  }

  return json({ erro: 'ação desconhecida' }, 400)
})
