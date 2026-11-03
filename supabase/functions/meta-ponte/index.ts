// Recebe a ponte da Meta (02/11/2026): o script scripts/ponte-meta/enviar.py, rodado pela tarefa
// agendada do Claude no Mac do Tiago, manda aqui o que a integração Meta Ads leu das contas do Naor (/n) e do Victor (/v).
// Só aceita com o segredo da ponte (cabeçalho x-ponte): o segredo mora num arquivo no Mac e aqui
// fica só a impressão digital dele (PONTE_META_HASH em config_servicos).
//
// POST { marca, parceiro, dados: { conta, dias, entidades, quebras, pixel } } -> teeds_ponte_gravar

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})
const PARCEIROS: Record<string, string[]> = { globalfly: ['n', 'v'] }

async function sha256(texto: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  const segredo = req.headers.get('x-ponte') ?? ''
  const cfg = await rest('config_servicos?chave=eq.PONTE_META_HASH&select=valor')
  const hash = cfg.ok ? (await cfg.json())[0]?.valor : null
  if (!hash || segredo.length < 32 || (await sha256(segredo)) !== hash) return json({ erro: 'Sem permissão' }, 401)
  let d: any
  try { d = await req.json() } catch { return json({ erro: 'Corpo inválido' }, 400) }
  if (!PARCEIROS[d?.marca]?.includes(d?.parceiro) || typeof d?.dados !== 'object') return json({ erro: 'Marca ou parceiro inválido' }, 400)
  const r = await rest('rpc/teeds_ponte_gravar', { method: 'POST', body: JSON.stringify({ p_marca: d.marca, p_parceiro: d.parceiro, p: d.dados }) })
  const corpo = await r.json().catch(() => ({}))
  return json(r.ok ? { ok: true, gravado: corpo } : { erro: corpo?.message ?? `HTTP ${r.status}` }, r.ok ? 200 : 500)
})
