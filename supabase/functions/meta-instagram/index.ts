// Instagram dentro da plataforma (04/11/2026, Tiago: "tem como integrar o próprio Instagram dentro da
// plataforma... views, postagens, views de stories, insights... consegue construir esse caminho já
// dentro da plataforma, pra ficar pronto pra vincular lá?").
//
// O parceiro conecta com o PRÓPRIO login (Login do Facebook para Empresas): a Meta devolve um código,
// esta função troca por um token de longa duração e guarda o token da PÁGINA ligada ao Instagram
// (META_IG_<MARCA>_<PARCEIRO> em config_servicos). Nada de chave passa pela tela.
//
// POST { acao, marca, parceiro, ... } com o token do admin geral:
//   estado                   o aplicativo está configurado? a conta está ligada? (nunca devolve segredo)
//   app { appId, segredo }   guarda o aplicativo da Meta (uma vez)
//   inicio { origem, link? } o endereço do login da Meta: abre numa janela aqui, ou vira um link de 48 h
//                            para o parceiro abrir no celular dele e entrar com o Facebook dele
//   escolher { igId }        quando o login alcança mais de um Instagram, qual vale
//   desconectar              apaga a conexão
//   metricas { dias }        conta, últimos posts e stories no ar, com as métricas da Meta
// GET ?code=&state=          a volta do login da Meta (a janela mostra "pronto" e fecha sozinha)
//
// 04/11/2026 (Tiago: "não quero trocar a conta, só quero vincular o insta"): o jeito mais curto é a MESMA
// chave do usuário do sistema que já serve aos anúncios (META_ADS_<MARCA>_<PARCEIRO>, app "GlobalFly" do
// Naor), gerada de novo com as permissões do Instagram. Sem login separado:
//   chave { chave }          confere a chave nova (continua servindo aos anúncios? lê as métricas do
//                            Instagram?) e só então troca a chave guardada. A conta de anúncios escolhida
//                            (META_CONTA_*) não muda.
// A conexão pelo login (acima) continua valendo e vem na frente quando existe.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GRAPH = 'https://graph.facebook.com/v24.0'
const VOLTA = `${SUPABASE_URL}/functions/v1/meta-instagram`
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const PARCEIROS: Record<string, string[]> = { globalfly: ['n', 'v'] }
// a página que assina os anúncios de cada parceiro: se o login alcançar várias, é ela que vale
const PAGINA_PREFERIDA: Record<string, string> = { 'globalfly:n': '483727028157678', 'globalfly:v': '100283049512812' }
const ESCOPOS = ['instagram_basic', 'instagram_manage_insights', 'pages_show_list', 'pages_read_engagement', 'business_management',
  'instagram_manage_comments', 'instagram_manage_messages', 'instagram_content_publish']

const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init, headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})
async function lerCfg<T>(chave: string): Promise<T | null> {
  const r = await rest(`config_servicos?chave=eq.${encodeURIComponent(chave)}&select=valor`)
  const v = r.ok ? (await r.json())[0]?.valor : null
  try { return v ? JSON.parse(v) as T : null } catch { return null }
}
async function gravarCfg(chave: string, valor: unknown) {
  const r = await rest('config_servicos?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ chave, valor: JSON.stringify(valor), atualizado_em: new Date().toISOString() }) })
  if (!r.ok) throw new Error('Não consegui guardar no banco agora.')
}
const apagarCfg = (chave: string) => rest(`config_servicos?chave=eq.${encodeURIComponent(chave)}`, { method: 'DELETE' })

type App = { appId: string; segredo: string }
type Conta = { id: string; usuario: string; nome: string; foto: string | null; seguidores: number; posts: number; pagina: string; paginaNome: string; token: string }
type Conexao = Conta & { conectadoEm: string; conectadoPor: string | null; fonte?: 'login' | 'chave' }
const chaveApp = (marca: string) => `META_IG_APP_${marca.toUpperCase()}`
const chaveConexao = (marca: string, p: string) => `META_IG_${marca.toUpperCase()}_${p.toUpperCase()}`
const chaveCandidatos = (marca: string, p: string) => `META_IG_CANDIDATOS_${marca.toUpperCase()}_${p.toUpperCase()}`
const chaveDeAnuncios = (marca: string, p: string) => `META_ADS_${marca.toUpperCase()}_${p.toUpperCase()}`
// o Instagram de cada parceiro (o mesmo do estúdio de anúncios); a conta escolhida no painel vale por cima
const IG_PADRAO: Record<string, { id: string; pagina: string }> = { 'globalfly:n': { id: '17841406873438157', pagina: 'Naor Bezzera' } }
async function lerTexto(chave: string): Promise<{ valor: string; em: string } | null> {
  const r = await rest(`config_servicos?chave=eq.${encodeURIComponent(chave)}&select=valor,atualizado_em`)
  const l = r.ok ? (await r.json())[0] : null
  return l?.valor ? { valor: String(l.valor), em: String(l.atualizado_em) } : null
}

class ErroDaMeta extends Error { constructor(msg: string, public codigo = 0) { super(msg) } }
async function graph(caminho: string, params: Record<string, string>) {
  const r = await fetch(`${GRAPH}/${caminho}?${new URLSearchParams(params)}`)
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.error) throw new ErroDaMeta(d?.error?.error_user_msg || d?.error?.message || `HTTP ${r.status}`, d?.error?.code ?? r.status)
  return d
}
const talvez = async <T,>(p: Promise<T>, padrao: T): Promise<T> => { try { return await p } catch { return padrao } }

/** O Instagram lido pela chave de anúncios: { conexao } quando lê as métricas; senão o que falta. */
async function pelaChave(marca: string, parceiro: string, chaveNova?: string) {
  const guardada = chaveNova ? { valor: chaveNova, em: new Date().toISOString() } : await lerTexto(chaveDeAnuncios(marca, parceiro))
  if (!guardada) return { existe: false, lePerfil: false, leMetricas: false, conexao: null as Conexao | null }
  const cfg = await lerCfg<{ instagram?: string; paginaNome?: string }>(`META_CONTA_${marca.toUpperCase()}_${parceiro.toUpperCase()}`)
  const igId = cfg?.instagram || IG_PADRAO[`${marca}:${parceiro}`]?.id || ''
  if (!igId) return { existe: true, lePerfil: false, leMetricas: false, conexao: null }
  const chave = guardada.valor
  const perfil = await talvez(graph(igId, { fields: 'username,name,profile_picture_url,followers_count,media_count', access_token: chave }), null as any)
  const leMetricas = !!perfil && await graph(`${igId}/insights`, { metric: 'reach', period: 'day', metric_type: 'total_value', access_token: chave }).then(() => true).catch(() => false)
  const conexao: Conexao | null = perfil && leMetricas ? {
    id: igId, usuario: perfil.username ?? '', nome: perfil.name ?? '', foto: perfil.profile_picture_url ?? null, seguidores: Number(perfil.followers_count ?? 0),
    posts: Number(perfil.media_count ?? 0), pagina: '', paginaNome: cfg?.paginaNome || IG_PADRAO[`${marca}:${parceiro}`]?.pagina || '', token: chave,
    conectadoEm: guardada.em, conectadoPor: null, fonte: 'chave' } : null
  return { existe: true, lePerfil: !!perfil, leMetricas, conexao, usuario: perfil?.username ?? null, seguidores: perfil ? Number(perfil.followers_count ?? 0) : null }
}

// o "state" do login: quem pediu, para qual parceiro, de onde, assinado com o segredo do aplicativo
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function assinar(texto: string, segredo: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(texto))))
}
async function criarEstado(dados: Record<string, string>, segredo: string) {
  const corpo = b64url(new TextEncoder().encode(JSON.stringify({ ...dados, t: Date.now() })))
  return `${corpo}.${await assinar(corpo, segredo)}`
}
async function lerEstado(estado: string, segredo: string): Promise<Record<string, any> | null> {
  const [corpo, assinatura] = estado.split('.')
  if (!corpo || !assinatura || (await assinar(corpo, segredo)) !== assinatura) return null
  try {
    const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(corpo.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))))
    // o link mandado ao parceiro vale 48 h; o da janela aberta aqui, 20 min
    return Date.now() - Number(d.t) < (d.x === '1' ? 48 * 3600_000 : 20 * 60_000) ? d : null
  } catch { return null }
}

// a janela do login termina numa página simples que avisa a plataforma e fecha
function paginaDeVolta(ok: boolean, texto: string, origem: string) {
  const alvo = /^https:\/\/(www\.)?globalflytrade\.com$|^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem) ? origem : '*'
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Instagram · GlobalFly Trade</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1626;color:#f2efe8;font:16px/1.5 system-ui,sans-serif;text-align:center;padding:24px}
b{display:block;font-size:20px;margin-bottom:6px;color:${ok ? '#d9b36c' : '#ff8a80'}}</style></head><body><div><b>${ok ? 'Instagram conectado' : 'Não deu para conectar'}</b>${texto}<p style="opacity:.7;font-size:13px">Esta janela pode ser fechada.</p></div>
<script>try{window.opener&&window.opener.postMessage({gfInstagram:${ok ? 'true' : 'false'}},${JSON.stringify(alvo)})}catch(e){}${ok ? 'setTimeout(function(){window.close()},1800)' : ''}</script></body></html>`
  return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
const escapar = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

async function voltaDoLogin(url: URL): Promise<Response> {
  const estado = url.searchParams.get('state') ?? ''
  const marcaDoEstado = (() => { try { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(estado.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))).m } catch { return '' } })()
  const app = PARCEIROS[marcaDoEstado] ? await lerCfg<App>(chaveApp(marcaDoEstado)) : null
  if (!app) return paginaDeVolta(false, 'O pedido de conexão não é desta plataforma.', '*')
  const d = await lerEstado(estado, app.segredo)
  if (!d) return paginaDeVolta(false, 'Este link de conexão venceu. Peça um link novo.', '*')
  const origem = String(d.o ?? '*')
  if (url.searchParams.get('error')) return paginaDeVolta(false, escapar(url.searchParams.get('error_description') || 'O login foi cancelado.'), origem)
  const codigo = url.searchParams.get('code')
  if (!codigo) return paginaDeVolta(false, 'A Meta não devolveu o código do login.', origem)
  try {
    const curto = await graph('oauth/access_token', { client_id: app.appId, client_secret: app.segredo, redirect_uri: VOLTA, code: codigo })
    const longo = await graph('oauth/access_token', { grant_type: 'fb_exchange_token', client_id: app.appId, client_secret: app.segredo, fb_exchange_token: curto.access_token })
    const paginas = await graph('me/accounts', { access_token: longo.access_token, limit: '100',
      fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}' })
    const contas: Conta[] = (paginas.data ?? []).filter((p: any) => p.instagram_business_account?.id).map((p: any) => ({
      id: p.instagram_business_account.id, usuario: p.instagram_business_account.username ?? '', nome: p.instagram_business_account.name ?? '',
      foto: p.instagram_business_account.profile_picture_url ?? null, seguidores: Number(p.instagram_business_account.followers_count ?? 0),
      posts: Number(p.instagram_business_account.media_count ?? 0), pagina: p.id, paginaNome: p.name ?? '', token: p.access_token,
    }))
    if (!contas.length) return paginaDeVolta(false, 'O login não alcança nenhum Instagram profissional. Confira se o Instagram está ligado à página do Facebook e conecte de novo, marcando a página e o Instagram.', origem)
    const preferida = contas.find((c) => c.pagina === PAGINA_PREFERIDA[`${d.m}:${d.p}`])
    if (preferida || contas.length === 1) {
      const c = preferida ?? contas[0]
      await gravarCfg(chaveConexao(d.m, d.p), { ...c, conectadoEm: new Date().toISOString(), conectadoPor: d.u ?? null } satisfies Conexao)
      await apagarCfg(chaveCandidatos(d.m, d.p))
      return paginaDeVolta(true, `@${escapar(c.usuario)} agora aparece na plataforma.`, origem)
    }
    await gravarCfg(chaveCandidatos(d.m, d.p), { contas, em: new Date().toISOString(), por: d.u ?? null })
    return paginaDeVolta(true, 'Volte à plataforma e escolha qual Instagram vale.', origem)
  } catch (e) {
    return paginaDeVolta(false, escapar(`A Meta recusou: ${(e as Error).message}`), origem)
  }
}

/* ---------------------------------------------------------------- métricas */

const somaDe = (d: any) => Number(d?.total_value?.value ?? (d?.values ?? []).reduce((s: number, v: any) => s + Number(v.value ?? 0), 0))
async function insightsDaConta(c: Conexao, dias: number) {
  const ate = Math.floor(Date.now() / 1000), de = ate - dias * 86400
  const pedir = (metric: string) => talvez(graph(`${c.id}/insights`, { metric, period: 'day', metric_type: 'total_value', since: String(de), until: String(ate), access_token: c.token })
    .then((r) => somaDe((r.data ?? [])[0])), null as number | null)
  const nomes = ['views', 'reach', 'profile_views', 'accounts_engaged', 'total_interactions', 'website_clicks', 'likes', 'comments', 'shares', 'saves', 'follows_and_unfollows']
  const valores = await Promise.all(nomes.map(pedir))
  // seguidores por dia (a Meta só guarda os últimos 30)
  const serie = await talvez(graph(`${c.id}/insights`, { metric: 'follower_count', period: 'day', since: String(ate - Math.min(dias, 30) * 86400), until: String(ate), access_token: c.token })
    .then((r) => ((r.data ?? [])[0]?.values ?? []).map((v: any) => ({ dia: String(v.end_time).slice(0, 10), novos: Number(v.value ?? 0) }))), [] as Array<{ dia: string; novos: number }>)
  return { ...Object.fromEntries(nomes.map((n, i) => [n, valores[i]])), seguidoresPorDia: serie }
}
async function midias(c: Conexao, tipo: 'media' | 'stories', limite: number) {
  const lista = await talvez(graph(`${c.id}/${tipo}`, { fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count', limit: String(limite), access_token: c.token }), { data: [] })
  const metricasDe = (m: any) => tipo === 'stories' ? 'views,reach,replies,shares,total_interactions'
    : m.media_product_type === 'REELS' ? 'views,reach,saved,shares,total_interactions,ig_reels_avg_watch_time' : 'views,reach,saved,shares,total_interactions'
  return Promise.all((lista.data ?? []).map(async (m: any) => {
    const ins = await talvez(graph(`${m.id}/insights`, { metric: metricasDe(m), access_token: c.token }), { data: [] })
    const v = Object.fromEntries((ins.data ?? []).map((x: any) => [x.name, Number(x.values?.[0]?.value ?? x.total_value?.value ?? 0)]))
    return { id: m.id, tipo: m.media_product_type === 'REELS' ? 'reel' : tipo === 'stories' ? 'story' : m.media_type === 'CAROUSEL_ALBUM' ? 'carrossel' : m.media_type === 'VIDEO' ? 'video' : 'foto',
      legenda: String(m.caption ?? '').slice(0, 280), link: m.permalink ?? null, imagem: m.thumbnail_url ?? m.media_url ?? null, quando: m.timestamp,
      curtidas: Number(m.like_count ?? 0), comentarios: Number(m.comments_count ?? 0), views: v.views ?? null, alcance: v.reach ?? null,
      salvos: v.saved ?? null, compartilhamentos: v.shares ?? null, interacoes: v.total_interactions ?? null, respostas: v.replies ?? null,
      tempoMedio: v.ig_reels_avg_watch_time != null ? Math.round(v.ig_reels_avg_watch_time / 100) / 10 : null }
  }))
}

/* ---------------------------------------------------------------- entrada */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)
  if (req.method === 'GET') return voltaDoLogin(url)
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  let d: Record<string, any>
  try { d = await req.json() } catch { return json({ erro: 'Corpo inválido' }, 400) }
  const marca = String(d.marca ?? ''), parceiro = String(d.parceiro ?? '')
  if (!PARCEIROS[marca]?.includes(parceiro)) return json({ erro: 'Parceiro desconhecido.' }, 400)

  // só o admin geral (a mesma regra do painel)
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  const [quem, usuario] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_admin_geral_da`, { method: 'POST', headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_marca: marca }) }),
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!quem.ok || (await quem.json()) !== true) return json({ erro: 'Só o administrador geral liga o Instagram.' }, 403)

  try {
    const acao = String(d.acao ?? '')
    const app = await lerCfg<App>(chaveApp(marca))
    if (acao === 'app') {
      const appId = String(d.appId ?? '').trim(), segredo = String(d.segredo ?? '').trim()
      if (!/^\d{8,20}$/.test(appId)) return json({ erro: 'O ID do aplicativo tem só números (fica no topo do painel do aplicativo na Meta).' }, 400)
      if (!/^[a-f0-9]{24,64}$/i.test(segredo)) return json({ erro: 'A chave secreta tem 32 letras e números (Configurações › Básico › Chave secreta do aplicativo › Mostrar).' }, 400)
      // confere com a própria Meta antes de guardar
      await graph(appId, { fields: 'id,name', access_token: `${appId}|${segredo}` }).catch(() => { throw new Error('A Meta não reconheceu esse ID com essa chave secreta. Confira os dois.') })
      await gravarCfg(chaveApp(marca), { appId, segredo })
      return json({ ok: true })
    }
    if (acao === 'estado') {
      const login = await lerCfg<Conexao>(chaveConexao(marca, parceiro))
      const ch = await pelaChave(marca, parceiro)
      const c = login ?? ch.conexao
      const cand = c ? null : await lerCfg<{ contas: Conta[] }>(chaveCandidatos(marca, parceiro))
      let valida: boolean | null = null
      if (login) valida = await graph(login.id, { fields: 'id', access_token: login.token }).then(() => true).catch(() => false)
      else if (c) valida = true
      return json({
        app: { configurado: !!app, appId: app?.appId ?? null, volta: VOLTA },
        chave: { existe: ch.existe, lePerfil: ch.lePerfil, leMetricas: ch.leMetricas, usuario: ch.usuario ?? null, seguidores: ch.seguidores ?? null },
        conexao: c ? { id: c.id, usuario: c.usuario, nome: c.nome, foto: c.foto, seguidores: c.seguidores, posts: c.posts, pagina: c.paginaNome, conectadoEm: c.conectadoEm, valida, fonte: login ? 'login' : 'chave' } : null,
        candidatos: (cand?.contas ?? []).map((x) => ({ id: x.id, usuario: x.usuario, foto: x.foto, seguidores: x.seguidores, pagina: x.paginaNome })),
      })
    }
    if (acao === 'chave') {
      const nova = String(d.chave ?? '').trim()
      if (!/^EA[A-Za-z0-9]{40,}$/.test(nova)) return json({ erro: 'Isso não parece uma chave da Meta: ela começa com "EA" e é bem comprida. Copie de novo o token gerado.' }, 400)
      const info = await graph('debug_token', { input_token: nova, access_token: nova }).then((r) => r.data).catch(() => null)
      if (!info?.is_valid) return json({ erro: 'A Meta não aceitou essa chave. Gere de novo, com validade Nunca.' }, 400)
      const escopos: string[] = info.scopes ?? []
      const faltamAnuncio = ['ads_read', 'ads_management'].filter((x) => !escopos.includes(x))
      if (faltamAnuncio.length) return json({ erro: `Essa chave não tem as permissões dos anúncios (${faltamAnuncio.join(', ')}). Ela vai substituir a atual, então precisa de tudo o que a atual tem. Gere de novo marcando também essas.` }, 400)
      const faltamIg = ['instagram_basic', 'instagram_manage_insights'].filter((x) => !escopos.includes(x))
      if (faltamIg.length) return json({ erro: `A chave nova ainda não tem as permissões do Instagram: ${faltamIg.join(', ')}. Se elas não aparecem na lista ao gerar, o app GlobalFly precisa do caso de uso do Instagram (developers.facebook.com › app GlobalFly › Casos de uso).` }, 400)
      const teste = await pelaChave(marca, parceiro, nova)
      if (!teste.leMetricas) return json({ erro: teste.lePerfil ? 'A chave lê o perfil, mas a Meta ainda recusa as métricas. Confira se o @ do Instagram foi atribuído ao usuário do sistema com controle total.' : 'A chave não alcança o Instagram. Em Usuários do sistema › Atribuir ativos, adicione a conta do Instagram com controle total e gere a chave de novo.' }, 400)
      const r = await rest('config_servicos?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ chave: chaveDeAnuncios(marca, parceiro), valor: nova, atualizado_em: new Date().toISOString() }) })
      if (!r.ok) return json({ erro: 'Não consegui guardar a chave agora.' }, 500)
      await rest(`meta_ads_cache?chave=like.${encodeURIComponent(`${marca}:${parceiro}:`)}*`, { method: 'DELETE' })
      return json({ ok: true, usuario: teste.usuario })
    }
    if (acao === 'metricas' && !app) {
      // sem aplicativo próprio: vale a chave de anúncios
    } else if (!app) return json({ erro: 'Falta configurar o aplicativo da Meta.' }, 400)
    if (acao === 'inicio') {
      const origem = String(d.origem ?? '')
      const estado = await criarEstado({ m: marca, p: parceiro, u: usuario?.id ?? '', o: origem, x: d.link ? '1' : '0' }, app!.segredo)
      const q = new URLSearchParams({ client_id: app!.appId, redirect_uri: VOLTA, state: estado, response_type: 'code', scope: ESCOPOS.join(','), auth_type: 'rerequest' })
      return json({ url: `https://www.facebook.com/v24.0/dialog/oauth?${q}` })
    }
    if (acao === 'escolher') {
      const cand = await lerCfg<{ contas: Conta[]; por: string | null }>(chaveCandidatos(marca, parceiro))
      const c = cand?.contas.find((x) => x.id === String(d.igId))
      if (!c) return json({ erro: 'Essa conta não está mais na lista. Conecte de novo.' }, 400)
      await gravarCfg(chaveConexao(marca, parceiro), { ...c, conectadoEm: new Date().toISOString(), conectadoPor: cand?.por ?? null } satisfies Conexao)
      await apagarCfg(chaveCandidatos(marca, parceiro))
      return json({ ok: true })
    }
    if (acao === 'desconectar') {
      await apagarCfg(chaveConexao(marca, parceiro)); await apagarCfg(chaveCandidatos(marca, parceiro))
      return json({ ok: true })
    }
    if (acao === 'metricas') {
      const c = (await lerCfg<Conexao>(chaveConexao(marca, parceiro))) ?? (await pelaChave(marca, parceiro)).conexao
      if (!c) return json({ erro: 'O Instagram ainda não foi conectado.' }, 400)
      const dias = Math.max(1, Math.min(30, Number(d.dias ?? 7)))
      const [perfil, conta, posts, stories] = await Promise.all([
        talvez(graph(c.id, { fields: 'username,name,profile_picture_url,followers_count,follows_count,media_count', access_token: c.token }), null as any),
        insightsDaConta(c, dias),
        midias(c, 'media', 12),
        midias(c, 'stories', 30),
      ])
      if (!perfil) return json({ erro: 'A Meta não deixou ler o Instagram com a conexão guardada. Conecte de novo.' }, 400)
      return json({
        perfil: { usuario: perfil.username, nome: perfil.name ?? '', foto: perfil.profile_picture_url ?? null, seguidores: Number(perfil.followers_count ?? 0), seguindo: Number(perfil.follows_count ?? 0), posts: Number(perfil.media_count ?? 0) },
        dias, conta, posts, stories, lidoEm: new Date().toISOString(),
      })
    }
    return json({ erro: 'Ação desconhecida.' }, 400)
  } catch (e) {
    return json({ erro: (e as Error).message || 'Falhou.' }, 400)
  }
})
