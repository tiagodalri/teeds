// Pixel do parceiro pelo servidor: API de Conversões da Meta (02/11/2026).
//
// As páginas de cadastro (captura-globalfly/captura.js) mandam o evento ao pixel no
// navegador e chamam esta função com o MESMO event_id. Daqui o evento vai à Meta com
// e-mail, celular e nome embaralhados (SHA-256), IP e aparelho de quem se cadastrou.
// A Meta junta os dois envios e conta uma vez só.
//
// POST { marca, parceiro, evento, event_id, email, url, fbp?, fbc?, externo? }
//
// Só manda o que é de um cadastro de verdade: o e-mail tem de estar em
// leads_capturados (últimas 48 h, pela página do parceiro). Cada event_id vai uma vez
// só (meta_conversoes). Sem a chave do parceiro em config_servicos
// (META_CAPI_<MARCA>_<PARCEIRO>, ou a da conta de anúncios META_ADS_<MARCA>_<PARCEIRO>),
// anota 'sem-chave' e não manda nada.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GRAPH = 'https://graph.facebook.com/v24.0'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// O mesmo mapa de captura.js e src/core/teeds/pixelDoParceiro.ts
const PIXELS: Record<string, Record<string, string>> = { globalfly: { n: '1625935188283999', v: '2208036990064467' } }
const SITES: Record<string, string> = { globalfly: 'https://globalflytrade.com/' }
const EVENTOS = new Set(['Lead', 'CompleteRegistration'])

const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

async function sha256(texto: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}
// A Meta pede minúsculas, sem acento e sem espaço nas pontas
const limpo = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z]/g, '')

async function anotar(id: number, situacao: string, detalhe: string | null) {
  await rest(`meta_conversoes?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ situacao, detalhe: detalhe?.slice(0, 300) ?? null }) })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  let d: Record<string, unknown>
  try { d = await req.json() } catch { return json({ erro: 'Corpo inválido' }, 400) }

  const marca = String(d.marca ?? ''), parceiro = String(d.parceiro ?? ''), evento = String(d.evento ?? '')
  const eventId = String(d.event_id ?? ''), email = String(d.email ?? '').trim().toLowerCase()
  const pixel = PIXELS[marca]?.[parceiro]
  if (!pixel || !EVENTOS.has(evento) || !/^[A-Za-z0-9-]{8,80}$/.test(eventId) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ ok: false }, 400)
  const url = String(d.url ?? '')
  const pagina = url.startsWith(SITES[marca]) ? url.slice(0, 500) : `${SITES[marca]}${parceiro}/cadastro/`

  // só um cadastro de verdade, recente e que veio pela página do parceiro
  const desde = new Date(Date.now() - 48 * 3600_000).toISOString()
  const r = await rest(`leads_capturados?select=id,nome,telefone_normalizado,parceiro,pagina&marca=eq.${marca}&email_normalizado=eq.${encodeURIComponent(email)}&atualizado_em=gte.${desde}&order=atualizado_em.desc&limit=1`)
  const lead = r.ok ? (await r.json())[0] : null
  const doParceiro = lead && (lead.parceiro === parceiro || String(lead.pagina ?? '').includes(`/${parceiro}/`))
  if (!doParceiro) return json({ ok: false, motivo: 'sem-cadastro' })

  // cada event_id uma vez só (a linha única segura dois envios ao mesmo tempo)
  const ins = await rest('meta_conversoes?select=id&on_conflict=marca,parceiro,event_id', {
    method: 'POST', headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
    body: JSON.stringify({ marca, parceiro, evento, event_id: eventId, lead_id: lead.id }),
  })
  const linha = ins.ok ? (await ins.json())[0] : null
  if (!linha) return json({ ok: true, motivo: 'ja-enviado' })

  // a chave só do pixel; sem ela, a da conta de anúncios (Administração › Anúncios), se tiver acesso ao pixel
  const sufixo = `${marca.toUpperCase()}_${parceiro.toUpperCase()}`
  const cfg = await rest(`config_servicos?chave=in.(META_CAPI_${sufixo},META_ADS_${sufixo})&select=chave,valor`)
  const chaves: Array<{ chave: string; valor: string }> = cfg.ok ? await cfg.json() : []
  const chave = (chaves.find((c) => c.chave.startsWith('META_CAPI_')) ?? chaves[0])?.valor ?? null
  if (!chave) { await anotar(linha.id, 'sem-chave', null); return json({ ok: true, motivo: 'sem-chave' }) }

  const partes = String(lead.nome ?? '').trim().split(/\s+/)
  let tel = String(lead.telefone_normalizado ?? '').replace(/\D/g, '')
  if (tel.length === 10 || tel.length === 11) tel = `55${tel}`
  const externo = String(d.externo ?? '')
  const user_data: Record<string, unknown> = {
    em: [await sha256(email)],
    country: [await sha256('br')],
    client_ip_address: (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || undefined,
    client_user_agent: req.headers.get('user-agent') ?? undefined,
  }
  if (tel.length >= 12) user_data.ph = [await sha256(tel)]
  if (limpo(partes[0] ?? '')) user_data.fn = [await sha256(limpo(partes[0]))]
  if (partes.length > 1 && limpo(partes.at(-1)!)) user_data.ln = [await sha256(limpo(partes.at(-1)!))]
  if (/^[A-Za-z0-9]{8,40}$/.test(externo)) user_data.external_id = [await sha256(externo)]
  if (/^fb\.\d\.\d+\.[\w-]+$/.test(String(d.fbp ?? ''))) user_data.fbp = d.fbp
  if (/^fb\.\d\.\d+\.[\w-]+$/.test(String(d.fbc ?? ''))) user_data.fbc = d.fbc

  try {
    const meta = await fetch(`${GRAPH}/${pixel}/events?access_token=${encodeURIComponent(chave)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [{ event_name: evento, event_time: Math.floor(Date.now() / 1000), event_id: eventId, action_source: 'website', event_source_url: pagina, user_data }] }),
    })
    const resposta = await meta.json().catch(() => ({}))
    if (!meta.ok) { await anotar(linha.id, 'erro', resposta?.error?.message ?? `HTTP ${meta.status}`); return json({ ok: false, motivo: 'erro-meta' }) }
    await anotar(linha.id, 'enviado', null)
    return json({ ok: true })
  } catch (e) {
    await anotar(linha.id, 'erro', (e as Error).message)
    return json({ ok: false, motivo: 'erro-rede' })
  }
})
