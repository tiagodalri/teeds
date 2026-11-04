// Administração › Anúncios (02/11/2026): os números da conta de anúncios do parceiro,
// direto da API de Marketing da Meta.
//
// POST (com o token do admin geral) { acao: 'painel', marca, parceiro, de, ate, forcar? }
//   conta, total do período, dia a dia, campanhas, conjuntos, anúncios (com criativo e
//   rankings), idade/gênero, posicionamento, aparelho, estado e os eventos do pixel.
// POST { acao: 'resumo', marca, parceiro, de, ate }
//   só o total do período (o funil ao vivo pede a cada minuto, sem guardar).
// Sem a chave: monta tudo a partir da ponte (meta_ponte_*, gravada pela tarefa agendada do Claude
// que lê a conta pela integração Meta Ads). Só campanhas com o nome começando em "GF |".
// POST { acao: 'anuncio', marca, parceiro, id, de, ate }
//   um anúncio: dia a dia, idade/gênero e posicionamento.
// POST { acao: 'descobrir', marca, parceiro }
//   as contas de anúncios (com os pixels) e as páginas que a chave guardada enxerga.
// POST { acao: 'escolher', marca, parceiro, conta, pixel, pagina? }
//   a conta que o parceiro usa passa a ser essa (META_CONTA_<MARCA>_<PARCEIRO> em config_servicos,
//   03/11/2026: o Victor anuncia por um login novo, com outra conta). Vale também no Estúdio e no
//   envio do pixel pelo servidor.
//
// A chave (META_ADS_<MARCA>_<PARCEIRO> em config_servicos) é colada na própria aba e nunca
// sai daqui. A resposta do painel fica 5 minutos em meta_ads_cache: abrir a aba de novo
// não gasta o limite de consultas da Meta.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GRAPH = 'https://graph.facebook.com/v24.0'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// conta de anúncios e pixel de cada parceiro (o pixel é o mesmo de captura.js)
// 03/11/2026: a conta antiga do Victor (CA Victor Cordeiro Real) era de ações passadas; a nova vem de um
// login novo e é escolhida na tela (contaDe). Sem ela, o /v não mostra os números da ponte da conta antiga.
const CONTAS: Record<string, Record<string, { conta: string; pixel: string; semPonte?: boolean }>> = {
  globalfly: { n: { conta: '977357031377237', pixel: '1625935188283999' }, v: { conta: '854985874324156', pixel: '2208036990064467', semPonte: true } },
}

// A conta do Naor tem outras campanhas (o quiz da Universidade Trading): só entram as da GlobalFly
const PREFIXO = 'GF |'
const SO_GF = JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: PREFIXO }])

const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

type Conta = { conta: string; pixel: string; semPonte?: boolean; contaNome?: string; pixelNome?: string; pagina?: string; paginaNome?: string; instagram?: string; usuario?: string }
/** A conta escolhida na tela (Administração › Anúncios) por cima da do código. */
async function contaDe(marca: string, parceiro: string): Promise<Conta | null> {
  const base = CONTAS[marca]?.[parceiro]
  if (!base) return null
  const r = await rest(`config_servicos?chave=eq.META_CONTA_${marca.toUpperCase()}_${parceiro.toUpperCase()}&select=valor`)
  const linha = r.ok ? (await r.json())[0] : null
  try { return linha?.valor ? { ...base, ...JSON.parse(linha.valor) } : base } catch { return base }
}

class ErroDaMeta extends Error { constructor(msg: string, public codigo: number, public sub = 0) { super(msg) } }

/** Uma consulta à Graph API, seguindo as páginas (até `paginas`). */
async function graph(chave: string, caminho: string, params: Record<string, string>, paginas = 10): Promise<any[]> {
  const q = new URLSearchParams({ ...params, access_token: chave })
  let url: string | null = `${GRAPH}/${caminho}?${q}`
  const tudo: any[] = []
  for (let i = 0; url && i < paginas; i++) {
    const r = await fetch(url)
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.error) throw new ErroDaMeta(d?.error?.error_user_msg || d?.error?.message || `HTTP ${r.status}`, d?.error?.code ?? r.status, d?.error?.error_subcode ?? 0)
    if (Array.isArray(d.data)) tudo.push(...d.data); else { tudo.push(d); break }
    url = d.paging?.next ?? null
  }
  return tudo
}

const n = (v: unknown) => Number(v ?? 0) || 0
const acao = (lista: any[] | undefined, ...tipos: string[]) => {
  for (const t of tipos) { const a = lista?.find((x) => x.action_type === t); if (a) return n(a.value) }
  return 0
}

// 04/11/2026, Tiago: "os números da plataforma precisam bater com os da Meta". O Gerenciador conta cada conjunto
// pela atribuição dele (hoje: clique de 7 dias; o NB1 Aberto também visualização de 1 dia). Sem isto a API usa a
// janela padrão da conta e o número pode sair diferente do Gerenciador.
const UNIFICADO = { use_unified_attribution_setting: 'true' }
const CAMPOS = 'spend,impressions,reach,frequency,clicks,inline_link_clicks,inline_link_click_ctr,ctr,cpc,cpm,cost_per_inline_link_click,actions,'
  + 'video_play_actions,video_thruplay_watched_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions'

/** As métricas de uma linha da Meta, com nomes nossos. */
function metricas(r: any) {
  const a = r.actions as any[] | undefined
  const gasto = n(r.spend), impressoes = n(r.impressions), cliquesLink = n(r.inline_link_clicks)
  return {
    gasto, impressoes, alcance: n(r.reach), frequencia: n(r.frequency), cliques: n(r.clicks), cliquesLink,
    ctrLink: n(r.inline_link_click_ctr), ctr: n(r.ctr), cpcLink: n(r.cost_per_inline_link_click), cpm: n(r.cpm),
    lpv: acao(a, 'landing_page_view', 'omni_landing_page_view'),
    viewContent: acao(a, 'offsite_conversion.fb_pixel_view_content', 'omni_view_content', 'view_content'),
    leads: acao(a, 'offsite_conversion.fb_pixel_lead', 'lead', 'onsite_web_lead'),
    cadastros: acao(a, 'offsite_conversion.fb_pixel_complete_registration', 'omni_complete_registration', 'complete_registration'),
    eventosProprios: acao(a, 'offsite_conversion.fb_pixel_custom'),
    engajamento: acao(a, 'post_engagement'), reacoes: acao(a, 'post_reaction'), comentarios: acao(a, 'comment'),
    compartilhamentos: acao(a, 'post'), salvos: acao(a, 'onsite_conversion.post_save'),
    video3s: acao(a, 'video_view'), videoPlay: acao(r.video_play_actions, 'video_view'),
    thruplay: acao(r.video_thruplay_watched_actions, 'video_view'),
    p25: acao(r.video_p25_watched_actions, 'video_view'), p50: acao(r.video_p50_watched_actions, 'video_view'),
    p75: acao(r.video_p75_watched_actions, 'video_view'), p95: acao(r.video_p95_watched_actions, 'video_view'),
    p100: acao(r.video_p100_watched_actions, 'video_view'),
    _ok: gasto > 0 || impressoes > 0 || cliquesLink > 0,
  }
}
const limpar = ({ _ok, ...m }: ReturnType<typeof metricas>) => m

const RANKING: Record<string, string> = {
  ABOVE_AVERAGE: 'acima', AVERAGE: 'media', BELOW_AVERAGE_10: 'abaixo10', BELOW_AVERAGE_20: 'abaixo20', BELOW_AVERAGE_35: 'abaixo35', UNKNOWN: '',
}

function publico(t: any): string {
  if (!t) return ''
  const partes: string[] = []
  if (t.age_min || t.age_max) partes.push(`${t.age_min ?? 18}–${t.age_max ?? 65}${t.age_max === 65 ? '+' : ''} anos`)
  if (Array.isArray(t.genders) && t.genders.length === 1) partes.push(t.genders[0] === 1 ? 'homens' : 'mulheres')
  const g = t.geo_locations
  if (g?.countries?.length) partes.push(g.countries.join(', ') === 'BR' ? 'Brasil' : g.countries.join(', '))
  if (g?.regions?.length) partes.push(g.regions.map((r: any) => r.name).join(', '))
  if (g?.cities?.length) partes.push(`${g.cities.length} cidade${g.cities.length > 1 ? 's' : ''}`)
  const interesses = (t.flexible_spec ?? []).flatMap((f: any) => [...(f.interests ?? []), ...(f.behaviors ?? [])]).map((i: any) => i.name)
  if (interesses.length) partes.push(`interesses: ${interesses.slice(0, 4).join(', ')}${interesses.length > 4 ? '…' : ''}`)
  if (t.custom_audiences?.length) partes.push(`${t.custom_audiences.length} público${t.custom_audiences.length > 1 ? 's' : ''} personalizado${t.custom_audiences.length > 1 ? 's' : ''}`)
  if (t.targeting_automation?.advantage_audience === 1) partes.push('público Advantage+')
  return partes.join(' · ')
}

async function painel(chave: string, cfg: Conta, de: string, ate: string) {
  const act = `act_${cfg.conta}`
  const tr = JSON.stringify({ since: de, until: ate })
  const ins = (extra: Record<string, string>) => graph(chave, `${act}/insights`, { time_range: tr, fields: CAMPOS, limit: '500', filtering: SO_GF, ...UNIFICADO, ...extra })
  const avisos: string[] = []
  const talvez = async <T,>(nome: string, p: Promise<T>, padrao: T): Promise<T> => {
    try { return await p } catch (e) {
      if (e instanceof ErroDaMeta && e.codigo === 190) throw e
      avisos.push(`${nome}: ${(e as Error).message}`); return padrao
    }
  }

  // o pixel guarda no máximo 28 dias para trás
  const inicioPixel = Math.max(Date.parse(`${de}T03:00:00Z`), Date.now() - 27 * 864e5)
  const fimPixel = Math.min(Date.parse(`${ate}T03:00:00Z`) + 864e5, Date.now())

  const [conta, total, porDia, porCampanha, porConjunto, porAnuncio, campanhas, conjuntos, anuncios, idadeGenero, posicionamento, aparelho, regiao, pixel] = await Promise.all([
    graph(chave, act, { fields: 'name,currency,account_status,amount_spent,balance,spend_cap,timezone_name,disable_reason' }, 1).then((l) => l[0]),
    ins({ level: 'account' }),
    talvez('Dia a dia', ins({ level: 'account', time_increment: '1' }), []),
    talvez('Campanhas', ins({ level: 'campaign', fields: `${CAMPOS},campaign_id` }), []),
    talvez('Conjuntos', ins({ level: 'adset', fields: `${CAMPOS},adset_id` }), []),
    talvez('Anúncios', ins({ level: 'ad', fields: `${CAMPOS},ad_id,quality_ranking,engagement_rate_ranking,conversion_rate_ranking` }), []),
    talvez('Lista de campanhas', graph(chave, `${act}/campaigns`, { fields: 'id,name,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time,bid_strategy,created_time', limit: '200', filtering: JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: PREFIXO }]) }, 3), []),
    // só os da GF: a conta do Naor tem centenas de anúncios de outros produtos, e pedir todos estoura o limite da Meta
    talvez('Lista de conjuntos', graph(chave, `${act}/adsets`, { fields: 'id,name,effective_status,campaign_id,daily_budget,lifetime_budget,optimization_goal,targeting,start_time,end_time', limit: '100', filtering: SO_GF }, 5), []),
    talvez('Lista de anúncios', graph(chave, `${act}/ads`, { fields: 'id,name,effective_status,adset_id,campaign_id,created_time,creative{id,thumbnail_url,image_url,title,body,object_type,call_to_action_type,video_id,url_tags}', thumbnail_width: '320', thumbnail_height: '320', limit: '50', filtering: SO_GF }, 8), []),
    talvez('Idade e gênero', ins({ level: 'account', breakdowns: 'age,gender' }), []),
    talvez('Posicionamentos', ins({ level: 'account', breakdowns: 'publisher_platform,platform_position' }), []),
    talvez('Aparelhos', ins({ level: 'account', breakdowns: 'device_platform' }), []),
    talvez('Estados', ins({ level: 'account', breakdowns: 'region' }), []),
    fimPixel > inicioPixel
      ? graph(chave, `${cfg.pixel}/stats`, { aggregation: 'event', start_time: String(Math.floor(inicioPixel / 1000)), end_time: String(Math.floor(fimPixel / 1000)) }, 20)
        .then((l) => ({ ok: true as const, l })).catch((e) => ({ ok: false as const, erro: (e as Error).message }))
      : Promise.resolve({ ok: true as const, l: [] as any[] }),
  ])

  const gf = new Set(campanhas.map((c: any) => c.id))
  const conjuntosGf = conjuntos.filter((c: any) => gf.has(c.campaign_id)), anunciosGf = anuncios.filter((a: any) => gf.has(a.campaign_id))
  const mapa = (l: any[], campo: string) => new Map(l.map((r) => [String(r[campo]), metricas(r)]))
  const mCamp = mapa(porCampanha, 'campaign_id'), mConj = mapa(porConjunto, 'adset_id'), mAd = mapa(porAnuncio, 'ad_id')
  const rank = new Map(porAnuncio.map((r: any) => [String(r.ad_id), { qualidade: RANKING[r.quality_ranking] ?? '', engajamento: RANKING[r.engagement_rate_ranking] ?? '', conversao: RANKING[r.conversion_rate_ranking] ?? '' }]))
  const vazio = limpar(metricas({}))
  // só entra na lista o que existiu no período: entregou, está no ar ou foi criado dentro dele
  const doPeriodo = (m: any, status: string, criado?: string) => m?._ok || status === 'ACTIVE' || (criado && criado.slice(0, 10) >= de)

  const eventos = new Map<string, number>(), eventosDia = new Map<string, Record<string, number>>()
  if (pixel.ok) for (const b of pixel.l) {
    const dia = new Date(Date.parse(b.start_time) - 3 * 3600e3).toISOString().slice(0, 10)
    for (const e of b.data ?? []) {
      eventos.set(e.value, (eventos.get(e.value) ?? 0) + n(e.count))
      const d = eventosDia.get(dia) ?? {}; d[e.value] = (d[e.value] ?? 0) + n(e.count); eventosDia.set(dia, d)
    }
  }

  const quebra = (l: any[], chaves: string[]) => l.map((r) => ({ ...Object.fromEntries(chaves.map((k) => [k, String(r[k] ?? '')])), ...limpar(metricas(r)) }))
    .sort((a, b) => b.gasto - a.gasto)

  return {
    conta: { id: cfg.conta, nome: conta?.name ?? '', moeda: conta?.currency ?? 'BRL', status: n(conta?.account_status), gastoTotal: n(conta?.amount_spent) / 100,
             saldo: n(conta?.balance) / 100, limite: n(conta?.spend_cap) / 100, fuso: conta?.timezone_name ?? '', motivo: n(conta?.disable_reason) },
    periodo: { de, ate },
    total: total[0] ? limpar(metricas(total[0])) : vazio,
    porDia: porDia.map((r: any) => ({ dia: r.date_start, ...limpar(metricas(r)) })),
    campanhas: campanhas.map((c: any) => ({ c, m: mCamp.get(c.id) })).filter(({ c, m }) => doPeriodo(m, c.effective_status, c.created_time)).map(({ c, m }) => ({
      id: c.id, nome: c.name, status: c.effective_status, objetivo: c.objective, orcDia: n(c.daily_budget) / 100, orcTotal: n(c.lifetime_budget) / 100,
      inicio: c.start_time ?? null, fim: c.stop_time ?? null, lance: c.bid_strategy ?? null, m: m ? limpar(m) : vazio,
    })),
    conjuntos: conjuntosGf.map((c: any) => ({ c, m: mConj.get(c.id) })).filter(({ c, m }) => doPeriodo(m, c.effective_status, c.start_time)).map(({ c, m }) => ({
      id: c.id, nome: c.name, status: c.effective_status, campanhaId: c.campaign_id, orcDia: n(c.daily_budget) / 100, orcTotal: n(c.lifetime_budget) / 100,
      otimizacao: c.optimization_goal ?? '', publico: publico(c.targeting), m: m ? limpar(m) : vazio,
    })),
    anuncios: anunciosGf.map((a: any) => ({ a, m: mAd.get(a.id) })).filter(({ a, m }) => doPeriodo(m, a.effective_status, a.created_time)).map(({ a, m }) => ({
      id: a.id, nome: a.name, status: a.effective_status, campanhaId: a.campaign_id, conjuntoId: a.adset_id, criadoEm: a.created_time,
      criativo: { miniatura: a.creative?.thumbnail_url ?? null, imagem: a.creative?.image_url ?? null, titulo: a.creative?.title ?? '', texto: a.creative?.body ?? '',
                  tipo: a.creative?.video_id ? 'video' : a.creative?.object_type === 'SHARE' && !a.creative?.image_url ? 'carrossel' : 'imagem', cta: a.creative?.call_to_action_type ?? '',
                  marcacoes: a.creative?.url_tags ?? '' },
      ranking: rank.get(a.id) ?? { qualidade: '', engajamento: '', conversao: '' }, m: m ? limpar(m) : vazio,
    })),
    quebras: {
      idadeGenero: quebra(idadeGenero, ['age', 'gender']),
      posicionamento: quebra(posicionamento, ['publisher_platform', 'platform_position']),
      aparelho: quebra(aparelho, ['device_platform']),
      regiao: quebra(regiao, ['region']),
    },
    pixel: pixel.ok
      ? { id: cfg.pixel, eventos: [...eventos].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
          porDia: [...eventosDia].map(([dia, ev]) => ({ dia, ev })).sort((a, b) => a.dia.localeCompare(b.dia)), desde: new Date(inicioPixel).toISOString() }
      : { id: cfg.pixel, erro: pixel.erro },
    avisos,
    em: new Date().toISOString(),
  }
}

/* ------------------------------------------------------------------ a ponte (sem chave própria) */

const SOMAVEIS = ['gasto', 'impressoes', 'alcance', 'cliques', 'cliquesLink', 'lpv', 'viewContent', 'leads', 'cadastros', 'eventosProprios', 'engajamento', 'reacoes',
  'comentarios', 'compartilhamentos', 'salvos', 'video3s', 'videoPlay', 'thruplay', 'p25', 'p50', 'p75', 'p95', 'p100']
/** Soma linhas de métricas e refaz as taxas a partir das somas (o alcance somado é aproximado). */
function somar(lista: any[]) {
  const t: Record<string, number> = Object.fromEntries(SOMAVEIS.map((k) => [k, 0]))
  for (const d of lista) for (const k of SOMAVEIS) t[k] += n(d?.[k])
  return {
    ...t, frequencia: t.alcance ? t.impressoes / t.alcance : 0, ctrLink: t.impressoes ? (t.cliquesLink / t.impressoes) * 100 : 0,
    ctr: t.impressoes ? (t.cliques / t.impressoes) * 100 : 0, cpcLink: t.cliquesLink ? t.gasto / t.cliquesLink : 0, cpm: t.impressoes ? (t.gasto / t.impressoes) * 1000 : 0,
  }
}
const agrupar = <T,>(l: T[], chave: (x: T) => string) => { const m = new Map<string, T[]>(); for (const x of l) { const k = chave(x); m.set(k, [...(m.get(k) ?? []), x]) } return m }

async function daPonte(marca: string, parceiro: string, de: string, ate: string, pixel: string) {
  const f = `marca=eq.${marca}&parceiro=eq.${parceiro}`
  const ler = async (t: string, extra = '') => { const r = await rest(`${t}?${f}${extra}`); return r.ok ? await r.json() : [] }
  const [estado] = await ler('meta_ponte_estado', '&select=conta,atualizado_em')
  if (!estado) return null
  const periodo = `&dia=gte.${de}&dia=lte.${ate}`
  const [dias, entidades, quebras, px] = await Promise.all([
    ler('meta_ponte_dia', `${periodo}&select=dia,id,dados&limit=20000`), ler('meta_ponte_entidade', '&select=tipo,id,dados&limit=5000'),
    ler('meta_ponte_quebra', `${periodo}&select=dia,tipo,chave,dados&limit=20000`), ler('meta_ponte_pixel', `${periodo}&select=dia,evento,total&limit=5000`),
  ])
  const porAd = agrupar(dias as any[], (d) => d.id)
  const m = (lista: any[] | undefined) => somar((lista ?? []).map((d) => d.dados))
  const ent = (tipo: string) => (entidades as any[]).filter((e) => e.tipo === tipo)
  const doPeriodo = (mm: any, status: string) => mm.gasto > 0 || mm.impressoes > 0 || status === 'ACTIVE'
  const camp = agrupar(dias as any[], (d) => String(d.dados?.campanhaId ?? '')), conj = agrupar(dias as any[], (d) => String(d.dados?.conjuntoId ?? ''))
  const eventos = new Map<string, number>(), eventosDia = new Map<string, Record<string, number>>()
  for (const e of px as any[]) {
    eventos.set(e.evento, (eventos.get(e.evento) ?? 0) + n(e.total))
    const d = eventosDia.get(e.dia) ?? {}; d[e.evento] = (d[e.evento] ?? 0) + n(e.total); eventosDia.set(e.dia, d)
  }
  const quebra = (tipo: string, chaves: string[]) => [...agrupar((quebras as any[]).filter((q) => q.tipo === tipo), (q) => q.chave)]
    .map(([chave, l]) => ({ ...Object.fromEntries(chaves.map((k, i) => [k, chave.split('|')[i] ?? ''])), ...somar(l.map((q) => q.dados)) })).sort((a, b) => b.gasto - a.gasto)
  const c = estado.conta ?? {}
  return {
    conta: { id: String(c.id ?? ''), nome: c.nome ?? '', moeda: c.moeda ?? 'BRL', status: n(c.status) || 1, gastoTotal: n(c.gastoTotal), saldo: 0, limite: 0, fuso: c.fuso ?? 'America/Sao_Paulo', motivo: 0 },
    periodo: { de, ate },
    total: somar((dias as any[]).map((d) => d.dados)),
    porDia: [...agrupar(dias as any[], (d) => d.dia)].map(([dia, l]) => ({ dia, ...m(l) })).sort((a, b) => a.dia.localeCompare(b.dia)),
    campanhas: ent('campanha').map((e) => ({ id: e.id, nome: e.dados.nome ?? '', status: e.dados.status ?? '', objetivo: e.dados.objetivo ?? '', orcDia: n(e.dados.orcDia), orcTotal: n(e.dados.orcTotal), inicio: e.dados.inicio ?? null, fim: null, lance: null, m: m(camp.get(e.id)) }))
      .filter((x) => doPeriodo(x.m, x.status)),
    conjuntos: ent('conjunto').map((e) => ({ id: e.id, nome: e.dados.nome ?? '', status: e.dados.status ?? '', campanhaId: e.dados.campanhaId ?? '', orcDia: n(e.dados.orcDia), orcTotal: n(e.dados.orcTotal), otimizacao: e.dados.otimizacao ?? '', publico: e.dados.publico ?? '', m: m(conj.get(e.id)) }))
      .filter((x) => doPeriodo(x.m, x.status)),
    anuncios: ent('anuncio').map((e) => ({
      id: e.id, nome: e.dados.nome ?? '', status: e.dados.status ?? '', campanhaId: e.dados.campanhaId ?? '', conjuntoId: e.dados.conjuntoId ?? '', criadoEm: e.dados.criadoEm ?? '',
      criativo: { miniatura: e.dados.miniatura ?? null, imagem: e.dados.imagem ?? null, titulo: e.dados.titulo ?? '', texto: e.dados.texto ?? '', tipo: e.dados.tipo ?? 'imagem', cta: e.dados.cta ?? '', marcacoes: e.dados.marcacoes ?? '' },
      ranking: { qualidade: e.dados.qualidade ?? '', engajamento: e.dados.engajamento ?? '', conversao: e.dados.conversao ?? '' }, m: m(porAd.get(e.id)),
    })).filter((x) => doPeriodo(x.m, x.status)),
    quebras: {
      idadeGenero: quebra('idadeGenero', ['age', 'gender']), posicionamento: quebra('posicionamento', ['publisher_platform', 'platform_position']),
      aparelho: quebra('aparelho', ['device_platform']), regiao: quebra('regiao', ['region']),
    },
    pixel: { id: pixel, eventos: [...eventos].map(([nome, total]) => ({ nome, total })).sort((a, b) => b.total - a.total),
             porDia: [...eventosDia].map(([dia, ev]) => ({ dia, ev })).sort((a, b) => a.dia.localeCompare(b.dia)), desde: `${de}T03:00:00Z` },
    avisos: [], em: estado.atualizado_em, ponte: { em: estado.atualizado_em },
  }
}

async function anuncio(chave: string, cfg: { conta: string }, id: string, de: string, ate: string) {
  const tr = JSON.stringify({ since: de, until: ate })
  const filtro = JSON.stringify([{ field: 'ad.id', operator: 'EQUAL', value: id }])
  const ins = (extra: Record<string, string>) => graph(chave, `act_${cfg.conta}/insights`, { time_range: tr, fields: CAMPOS, level: 'ad', filtering: filtro, limit: '500', ...UNIFICADO, ...extra })
  const [porDia, idadeGenero, posicionamento] = await Promise.all([
    ins({ time_increment: '1' }), ins({ breakdowns: 'age,gender' }).catch(() => []), ins({ breakdowns: 'publisher_platform,platform_position' }).catch(() => []),
  ])
  return {
    porDia: porDia.map((r: any) => ({ dia: r.date_start, ...limpar(metricas(r)) })),
    idadeGenero: idadeGenero.map((r: any) => ({ age: r.age, gender: r.gender, ...limpar(metricas(r)) })),
    posicionamento: posicionamento.map((r: any) => ({ publisher_platform: r.publisher_platform, platform_position: r.platform_position, ...limpar(metricas(r)) })),
  }
}

/**
 * Quando a Meta recusa a chave com um erro genérico ("API access blocked", permissão…), descobre
 * o motivo de verdade: o debug_token diz de qual app é a chave, as permissões e as contas que ela
 * alcança. A resposta vira um passo a passo para quem gerou a chave.
 */
async function diagnostico(chave: string, cfg: { conta: string }, e: ErroDaMeta): Promise<string> {
  const detalhe = `Resposta da Meta: ${e.message}${e.codigo ? ` (código ${e.codigo}${e.sub ? `/${e.sub}` : ''})` : ''}`
  let info: any = null
  try { info = (await graph(chave, 'debug_token', { input_token: chave }, 1))[0]?.data } catch { /* a própria consulta falhou */ }
  if (!info) return `A Meta não deixou nem conferir a chave. Gere uma nova no usuário do sistema e cole de novo.\n${detalhe}`
  const app = info.application ? `o app “${info.application}”` : 'o app da chave'
  const linkApp = info.app_id ? ` (developers.facebook.com/apps/${info.app_id})` : ''
  if (info.is_valid === false) return `A chave não vale mais. Gere uma nova, com validade Nunca, e cole de novo.\n${detalhe}`
  const escopos: string[] = info.scopes ?? []
  const faltam = ['ads_read', 'ads_management'].filter((x) => !escopos.includes(x))
  if (faltam.length === 2) return `A chave foi gerada sem as permissões de anúncio. Ao gerar o token, marque ads_read e ads_management (e business_management).\n${detalhe}`
  const alcance = (info.granular_scopes ?? []).filter((g: any) => g.scope === 'ads_read' || g.scope === 'ads_management').flatMap((g: any) => g.target_ids ?? [])
  if (alcance.length && !alcance.includes(cfg.conta) && !alcance.includes(`act_${cfg.conta}`)) {
    return `A chave não alcança a conta de anúncios ${cfg.conta}. Em Usuários do sistema › Atribuir ativos, adicione essa conta com controle total e gere o token de novo.\n${detalhe}`
  }
  if (e.codigo === 200 || /blocked/i.test(e.message)) {
    return `A Meta bloqueou ${app}${linkApp} para a API de anúncios. Acontece quando o app está restrito, em análise ou sem o produto Marketing API. Abra o app e veja o aviso no painel; se o app estiver restrito, gere a chave com outro app do mesmo negócio.\n${detalhe}`
  }
  return detalhe
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  let d: Record<string, unknown>
  try { d = await req.json() } catch { return json({ erro: 'Corpo inválido' }, 400) }
  const marca = String(d.marca ?? ''), parceiro = String(d.parceiro ?? '')
  if (!CONTAS[marca]?.[parceiro]) return json({ erro: 'Esse parceiro não tem conta de anúncios ligada.' }, 400)

  // só o admin geral (a mesma regra do banco)
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const quem = await fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_admin_geral_da`, {
    method: 'POST', headers: { apikey: req.headers.get('apikey') ?? '', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca }),
  })
  if (!quem.ok || (await quem.json()) !== true) return json({ erro: 'Só o administrador geral vê os anúncios.' }, 403)

  const cfg = (await contaDe(marca, parceiro))!

  // trocar a conta: ver o que a chave enxerga e escolher (não depende do período)
  if (d.acao === 'descobrir' || d.acao === 'escolher') {
    const k = await rest(`config_servicos?chave=eq.META_ADS_${marca.toUpperCase()}_${parceiro.toUpperCase()}&select=valor`)
    const chaveP = k.ok ? (await k.json())[0]?.valor as string | undefined : undefined
    if (!chaveP) return json({ semChave: true })
    try {
      const [contas, paginas] = await Promise.all([
        graph(chaveP, 'me/adaccounts', { fields: 'account_id,name,account_status,currency,business{id,name}', limit: '100' }, 3),
        graph(chaveP, 'me/accounts', { fields: 'id,name,instagram_business_account{id,username}', limit: '100' }, 3).catch(() => []),
      ])
      const comPixels = await Promise.all(contas.slice(0, 30).map(async (c: any) => ({
        id: String(c.account_id), nome: c.name ?? '', status: Number(c.account_status ?? 0), moeda: c.currency ?? '', negocio: c.business?.name ?? '',
        pixels: (await graph(chaveP, `act_${c.account_id}/adspixels`, { fields: 'id,name', limit: '50' }, 1).catch(() => [])).map((x: any) => ({ id: String(x.id), nome: x.name ?? '' })),
      })))
      const pags = paginas.map((x: any) => ({ id: String(x.id), nome: x.name ?? '', instagram: x.instagram_business_account ? { id: String(x.instagram_business_account.id), usuario: x.instagram_business_account.username ?? '' } : null }))
      if (d.acao === 'descobrir') return json({ atual: { conta: cfg.conta, pixel: cfg.pixel, pagina: cfg.pagina ?? null }, contas: comPixels, paginas: pags })
      // escolher: só vale o que a própria chave alcança
      const c = comPixels.find((x) => x.id === String(d.conta ?? ''))
      if (!c) return json({ erro: 'Essa chave não alcança essa conta de anúncios.' }, 400)
      const px = c.pixels.find((x: any) => x.id === String(d.pixel ?? ''))
      if (!px) return json({ erro: 'Escolha um pixel dessa conta.' }, 400)
      const pg = d.pagina ? pags.find((x: any) => x.id === String(d.pagina)) : null
      if (d.pagina && !pg) return json({ erro: 'Essa chave não alcança essa página.' }, 400)
      const valor: Conta = { conta: c.id, contaNome: c.nome, pixel: px.id, pixelNome: px.nome,
        ...(pg ? { pagina: pg.id, paginaNome: pg.nome, instagram: pg.instagram?.id ?? '', usuario: pg.instagram?.usuario ?? '' } : {}) }
      const g = await rest('config_servicos?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ chave: `META_CONTA_${marca.toUpperCase()}_${parceiro.toUpperCase()}`, valor: JSON.stringify(valor), atualizado_em: new Date().toISOString() }) })
      if (!g.ok) return json({ erro: 'Não consegui guardar a conta escolhida.' }, 500)
      await rest(`meta_ads_cache?chave=like.${encodeURIComponent(`${marca}:${parceiro}:`)}*`, { method: 'DELETE' })
      return json({ ok: true, conta: valor })
    } catch (e) {
      if (e instanceof ErroDaMeta && e.codigo === 190) return json({ chaveInvalida: true, erro: 'A Meta não aceitou a chave (venceu ou foi trocada). Cole uma nova.' })
      return json({ erro: e instanceof ErroDaMeta ? await diagnostico(chaveP, cfg, e) : (e as Error).message }, 502)
    }
  }

  const data = /^\d{4}-\d{2}-\d{2}$/
  const de = String(d.de ?? ''), ate = String(d.ate ?? '')
  if (!data.test(de) || !data.test(ate) || de > ate) return json({ erro: 'Período inválido.' }, 400)

  const c = await rest(`config_servicos?chave=eq.META_ADS_${marca.toUpperCase()}_${parceiro.toUpperCase()}&select=valor,atualizado_em`)
  const linha = c.ok ? (await c.json())[0] : null
  if (!linha?.valor) {
    // sem chave própria: os números que a tarefa do Claude trouxe pela integração (a ponte)
    const ponte = cfg.semPonte ? null : await daPonte(marca, parceiro, de, ate, cfg.pixel)
    if (!ponte) return json({ semChave: true })
    if (d.acao === 'resumo') return json({ total: ponte.total, em: ponte.em })
    if (d.acao === 'anuncio') {
      const id = String(d.id ?? '')
      return json({ porDia: ponte.porDia.length ? (await (async () => {
        const r = await rest(`meta_ponte_dia?marca=eq.${marca}&parceiro=eq.${parceiro}&id=eq.${encodeURIComponent(id)}&dia=gte.${de}&dia=lte.${ate}&select=dia,dados&order=dia`)
        return (r.ok ? await r.json() : []).map((x: any) => ({ dia: x.dia, ...somar([x.dados]) }))
      })()) : [], idadeGenero: [], posicionamento: [] })
    }
    return json(ponte)
  }
  const chave = linha.valor as string

  try {
    // o funil ao vivo: só o total do período, uma consulta (a tela pede a cada minuto)
    if (d.acao === 'resumo') {
      const l = await graph(chave, `act_${cfg.conta}/insights`, { time_range: JSON.stringify({ since: de, until: ate }), fields: CAMPOS, level: 'account', filtering: SO_GF, ...UNIFICADO }, 1)
      return json({ total: l[0] ? limpar(metricas(l[0])) : limpar(metricas({})), em: new Date().toISOString() })
    }
    if (d.acao === 'anuncio') {
      const id = String(d.id ?? '')
      if (!/^\d{5,30}$/.test(id)) return json({ erro: 'Anúncio inválido.' }, 400)
      return json(await anuncio(chave, cfg, id, de, ate))
    }
    const nome = `${marca}:${parceiro}:${de}:${ate}`
    if (!d.forcar) {
      const cache = await rest(`meta_ads_cache?chave=eq.${encodeURIComponent(nome)}&em=gte.${new Date(Date.now() - 300e3).toISOString()}&select=dados`)
      const guardado = cache.ok ? (await cache.json())[0] : null
      if (guardado) return json({ ...guardado.dados, chaveEm: linha.atualizado_em, doCache: true })
    }
    const dados = await painel(chave, cfg, de, ate)
    await rest('meta_ads_cache?on_conflict=chave', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' }, body: JSON.stringify({ chave: nome, dados, em: new Date().toISOString() }) })
    return json({ ...dados, chaveEm: linha.atualizado_em })
  } catch (e) {
    if (e instanceof ErroDaMeta && e.codigo === 190) return json({ chaveInvalida: true, erro: 'A Meta não aceitou a chave (venceu ou foi trocada). Cole uma nova.' })
    if (e instanceof ErroDaMeta && [4, 17, 32, 613, 80004].includes(e.codigo)) return json({ erro: 'A Meta pediu uma pausa nas consultas. Tente de novo em alguns minutos.' }, 429)
    if (e instanceof ErroDaMeta) return json({ erro: await diagnostico(chave, cfg, e) }, 502)
    return json({ erro: `A Meta respondeu: ${(e as Error).message}` }, 502)
  }
})
