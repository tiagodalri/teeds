// Estúdio de anúncios (03/11/2026, Tiago: "uma ferramenta pra gente subir anúncios pela plataforma,
// de forma mais intuitiva do que no gerenciador... teste A/B... ux/ui perfeita, tudo integrado").
//
// Fala com a API de Marketing da Meta com a mesma chave do painel (META_ADS_<MARCA>_<PARCEIRO>).
// Regras que valem aqui dentro, não só na tela:
//   * tudo nasce PAUSADO; ligar é uma ação separada ('ligar' / 'status'), confirmada na tela;
//   * só mexe em campanhas da GlobalFly (nome com "GF |"): a conta do Naor tem outras (o quiz da
//     Universidade Trading) e elas nunca são tocadas;
//   * o link sempre leva a marcação utm_content={{ad.id}} (é ela que liga o cadastro ao anúncio);
//   * as palavras que a marca não usa (aposta, sorte, garante, robô...) barram a criação;
//   * cada ação fica em anuncios_historico, com quem fez.
//
// POST { acao, marca, parceiro, ... } com o token do admin geral:
//   contexto                         página, Instagram, campanhas e conjuntos da GF (sem chave: o que a ponte trouxe)
//   imagem { base64, nome }          sobe uma imagem para a biblioteca da conta -> { hash, url }
//   video_inicio { tamanho, nome }   abre o envio de um vídeo em partes -> { sessao, videoId, de, ate }
//   video_parte { sessao, de, base64 } -> { de, ate }      video_fim { sessao, nome }      video_estado { videoId }
//   criar { id }                     cria na Meta o rascunho (campanha, conjunto, criativo, anúncio), retomando de onde parou
//   ligar { id }                     liga o que o rascunho criou (e abre o teste A/B oficial, se for teste)
//   status { tipo, id, ligar, cascata? }   liga/pausa uma campanha, conjunto ou anúncio da GF
//   orcamento { conjuntoId, diario } muda o orçamento por dia de um conjunto da GF
//   escalar { conjuntoId, aumento }  duplica um conjunto campeão (pausado) com orçamento maior
//   vencedor { id, vencedor }        fim do teste A/B: pausa a versão que perdeu

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GRAPH = 'https://graph.facebook.com/v24.0'
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

// a conta, o pixel, a página e o Instagram de cada parceiro (conferidos na conta em 03/11/2026)
const CONTAS: Record<string, Record<string, { conta: string; pixel: string; pagina: string; paginaNome: string; instagram: string; usuario: string; link: string }>> = {
  globalfly: {
    n: { conta: '977357031377237', pixel: '1625935188283999', pagina: '483727028157678', paginaNome: 'Naor Bezzera', instagram: '17841406873438157', usuario: 'naorbezerra_', link: 'https://globalflytrade.com/n/cadastro/' },
    // Victor: a conta não tem Instagram ligado; o estúdio procura o da página e, sem ele, o anúncio sai com a página
    v: { conta: '854985874324156', pixel: '2208036990064467', pagina: '100283049512812', paginaNome: 'Victor Cordeiroi', instagram: '', usuario: '', link: 'https://globalflytrade.com/v/cadastro/' },
  },
}
const PREFIXO = 'GF |'
const MARCACOES = 'utm_source=meta&utm_medium=pago&utm_campaign={{campaign.name}}&utm_content={{ad.id}}'
const BOTOES = ['SIGN_UP', 'LEARN_MORE', 'SUBSCRIBE', 'WATCH_MORE', 'APPLY_NOW']
const MAX_DIA = 5000 // R$ por dia: acima disso, só pelo Gerenciador

// o que a marca não fala (o mesmo semáforo da tela, só a parte vermelha). Palavra inteira com acento:
// \b do JavaScript não entende "robô", por isso as bordas são feitas com \p{L}.
const palavra = (miolo: string) => new RegExp(`(?<!\\p{L})(?:${miolo})(?!\\p{L})`, 'iu')
const PROIBIDAS: Array<[RegExp, string]> = [
  [palavra('apost\\p{L}*'), 'aposta'], [palavra('sorte'), 'sorte'], [palavra('chut(?:e|ar|ando)'), 'chute'], [palavra('jog(?:ar|o|ue|ando|ada)'), 'jogar'], // texto-ok: é a lista que barra essas palavras no anúncio
  [palavra('rob[ôo]s?'), 'robô (na GlobalFly é I.A.)'],
  [palavra('(?:lucro|ganho|retorno|renda)s? garantid[oa]s?|garantia de (?:lucro|ganho|retorno)'), 'promessa de lucro garantido'],
  [palavra('(?:I\\.?A\\.?|intelig[êe]ncia artificial)[^.!?\\n]{0,40}(?<!\\p{L})(?:aprende|prev[êe]|acerta|garante)'), 'a I.A. não aprende, prevê, acerta nem garante'],
]

const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})

class ErroDaMeta extends Error { constructor(msg: string, public codigo: number, public sub = 0) { super(msg) } }
const mensagem = (d: any, status: number) => d?.error?.error_user_msg || d?.error?.error_user_title || d?.error?.message || `HTTP ${status}`

async function ler(chave: string, caminho: string, params: Record<string, string> = {}) {
  const r = await fetch(`${GRAPH}/${caminho}?${new URLSearchParams({ ...params, access_token: chave })}`)
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.error) throw new ErroDaMeta(mensagem(d, r.status), d?.error?.code ?? r.status, d?.error?.error_subcode ?? 0)
  return d
}
/** POST na Graph API: objetos e listas vão como JSON, o resto como texto. */
async function gravar(chave: string, caminho: string, params: Record<string, unknown>, arquivo?: { campo: string; bytes: Uint8Array; nome: string }) {
  let corpo: BodyInit
  if (arquivo) {
    const f = new FormData()
    for (const [k, v] of Object.entries(params)) if (v != null) f.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    f.append('access_token', chave)
    f.append(arquivo.campo, new Blob([arquivo.bytes]), arquivo.nome)
    corpo = f
  } else {
    const q = new URLSearchParams({ access_token: chave })
    for (const [k, v] of Object.entries(params)) if (v != null) q.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v))
    corpo = q
  }
  const r = await fetch(`${GRAPH}/${caminho}`, { method: 'POST', body: corpo })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d.error) throw new ErroDaMeta(mensagem(d, r.status), d?.error?.code ?? r.status, d?.error?.error_subcode ?? 0)
  return d
}

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
const comPrefixo = (nome: string) => (nome.trim().startsWith(PREFIXO) ? nome.trim() : `${PREFIXO} ${nome.trim()}`)

/** A campanha (ou a campanha do conjunto/anúncio) é da GlobalFly? */
async function daGf(chave: string, tipo: string, id: string): Promise<{ nome: string; campanha: string }> {
  if (!/^\d{5,30}$/.test(id)) throw new Error('Identificador inválido.')
  const d = await ler(chave, id, { fields: tipo === 'campanha' ? 'name' : 'name,campaign{name}' })
  const campanha = tipo === 'campanha' ? d.name : d.campaign?.name
  if (!String(campanha ?? '').includes(PREFIXO)) throw new Error('Esse item não é de uma campanha da GlobalFly ("GF |"). Por segurança, o estúdio não mexe nele.')
  return { nome: d.name ?? '', campanha }
}

function conferirTexto(...textos: Array<string | undefined>) {
  const tudo = textos.filter(Boolean).join('\n')
  for (const [re, nome] of PROIBIDAS) if (re.test(tudo)) throw new Error(`O texto usa uma palavra que a GlobalFly não usa: ${nome}. Troque antes de criar.`)
}

/* ------------------------------------------------------------------ a criação */

type Midia = { tipo: 'imagem' | 'video'; hash?: string; videoId?: string; posterHash?: string; nome?: string }
type Texto = { principal: string; titulo: string; descricao?: string; botao: string }
type Publico = { modo: 'padrao' | 'personalizado'; idadeMin: number; idadeMax: number; genero: 'todos' | 'homens' | 'mulheres' }
interface Dados {
  nomeAnuncio: string; midia?: Midia; midiaB?: Midia; texto: Texto; textoB?: Texto; link: string
  destino: { campanha: string; nomeCampanha?: string; conjunto: string; nomeConjunto?: string }
  publico: Publico; publicoB?: Publico; diario: number; teste?: { variavel: 'criativo' | 'texto' | 'publico'; dias: number }
}

function segmentacao(p: Publico) {
  // padrão do lançamento: Brasil, público Advantage+ (a Meta encontra quem se cadastra)
  if (p.modo !== 'personalizado') return { geo_locations: { countries: ['BR'] }, age_min: 18, age_max: 65, targeting_automation: { advantage_audience: 1 } }
  const idadeMin = Math.min(65, Math.max(18, Math.round(p.idadeMin || 18))), idadeMax = Math.min(65, Math.max(idadeMin, Math.round(p.idadeMax || 65)))
  return {
    geo_locations: { countries: ['BR'] }, age_min: idadeMin, age_max: idadeMax,
    ...(p.genero === 'homens' ? { genders: [1] } : p.genero === 'mulheres' ? { genders: [2] } : {}),
    targeting_automation: { advantage_audience: 0 },
  }
}

async function criarConjunto(chave: string, act: string, cfg: { pixel: string }, campanhaId: string, nome: string, diario: number, publico: Publico) {
  const d = await gravar(chave, `${act}/adsets`, {
    name: nome, campaign_id: campanhaId, status: 'PAUSED', daily_budget: Math.round(diario * 100), billing_event: 'IMPRESSIONS',
    optimization_goal: 'OFFSITE_CONVERSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    promoted_object: { pixel_id: cfg.pixel, custom_event_type: 'COMPLETE_REGISTRATION' }, targeting: segmentacao(publico),
  })
  return String(d.id)
}

async function criarCriativo(chave: string, act: string, cfg: { pagina: string; instagram: string }, nome: string, midia: Midia, texto: Texto, link: string, avisos: string[]) {
  const cta = { type: BOTOES.includes(texto.botao) ? texto.botao : 'SIGN_UP', value: { link } }
  // sem Instagram ligado, a Meta usa a página também no Instagram
  const ig = cfg.instagram ? { instagram_user_id: cfg.instagram } : {}
  const historia = midia.tipo === 'video'
    ? { page_id: cfg.pagina, ...ig, video_data: { video_id: midia.videoId, image_hash: midia.posterHash, message: texto.principal, title: texto.titulo, link_description: texto.descricao || undefined, call_to_action: cta } }
    : { page_id: cfg.pagina, ...ig, link_data: { link, image_hash: midia.hash, message: texto.principal, name: texto.titulo, description: texto.descricao || undefined, call_to_action: cta } }
  // sem as "melhorias automáticas" de texto da Meta: ela poderia reescrever com palavras que a marca não usa
  const base = { name: nome, object_story_spec: historia, url_tags: MARCACOES }
  try {
    const d = await gravar(chave, `${act}/adcreatives`, { ...base, degrees_of_freedom_spec: { creative_features_spec: { text_optimizations: { enroll_status: 'OPT_OUT' } } } })
    return String(d.id)
  } catch (e) {
    if (!/degrees_of_freedom|creative_features|text_optimizations/i.test((e as Error).message)) throw e
    avisos.push('A Meta não aceitou desligar as melhorias automáticas de texto: confira no Gerenciador se o texto saiu como você escreveu.')
    const d = await gravar(chave, `${act}/adcreatives`, base)
    return String(d.id)
  }
}

async function videoPronto(chave: string, m?: Midia) {
  if (!m || m.tipo !== 'video') return true
  if (!m.videoId || !m.posterHash) throw new Error('O vídeo ainda não terminou de subir. Abra o rascunho e escolha o vídeo de novo.')
  const v = await ler(chave, m.videoId, { fields: 'status' })
  if (v.status?.video_status === 'error') throw new Error('A Meta não conseguiu processar o vídeo. Tente com outro arquivo (MP4 ou MOV).')
  return v.status?.video_status === 'ready'
}

async function criar(chave: string, cfg: typeof CONTAS['globalfly']['n'], r: any, salvar: (p: any) => Promise<void>) {
  const d = r.dados as Dados, p = { ...(r.progresso ?? {}) } as Record<string, any>, act = `act_${cfg.conta}`
  p.avisos = p.avisos ?? []
  const teste = r.tipo === 'teste' && d.teste
  // conferências antes de gastar qualquer chamada
  if (!d.midia || (d.midia.tipo === 'imagem' ? !d.midia.hash : !d.midia.videoId)) throw new Error('Falta o vídeo ou a imagem do anúncio.')
  if (teste && d.teste!.variavel === 'criativo' && !d.midiaB) throw new Error('Falta o criativo da versão B.')
  if (!d.texto?.principal?.trim() || !d.texto?.titulo?.trim()) throw new Error('Falta o texto ou o título do anúncio.')
  if (!/^https:\/\/(www\.)?globalflytrade\.com\//.test(d.link ?? '')) throw new Error('O link precisa ser uma página da GlobalFly (globalflytrade.com).')
  conferirTexto(d.texto.principal, d.texto.titulo, d.texto.descricao, d.textoB?.principal, d.textoB?.titulo, d.textoB?.descricao, d.nomeAnuncio)
  const diario = Number(d.diario)
  if (!(diario >= 6 && diario <= MAX_DIA)) throw new Error(`O orçamento por dia precisa ficar entre R$ 6 e R$ ${MAX_DIA.toLocaleString('pt-BR')}.`)
  if (!(await videoPronto(chave, d.midia)) || !(await videoPronto(chave, teste ? d.midiaB : undefined))) return { aguardando: 'video', progresso: p }

  const nomeAd = comPrefixo(d.nomeAnuncio || 'Anúncio')
  // sem Instagram fixo (Victor): o que estiver ligado à página, se houver
  if (!cfg.instagram) {
    const pg = await ler(chave, cfg.pagina, { fields: 'instagram_business_account{id}' }).catch(() => null)
    cfg = { ...cfg, instagram: pg?.instagram_business_account?.id ?? '' }
  }
  // 1) a campanha: nova (pausada) ou uma da GF que já existe
  if (!p.campanhaId) {
    if (d.destino.campanha === 'nova') {
      const c = await gravar(chave, `${act}/campaigns`, {
        name: comPrefixo(d.destino.nomeCampanha || d.nomeAnuncio || 'Lançamento'), objective: 'OUTCOME_LEADS', status: 'PAUSED',
        special_ad_categories: [], buying_type: 'AUCTION', is_adset_budget_sharing_enabled: false,
      })
      p.campanhaId = String(c.id); p.campanhaNova = true
    } else { await daGf(chave, 'campanha', d.destino.campanha); p.campanhaId = d.destino.campanha }
    await salvar(p)
  }
  // 2) o conjunto (no teste, um para cada versão, com metade do orçamento cada)
  if (teste) {
    const nomeC = comPrefixo(d.destino.nomeConjunto || d.nomeAnuncio || 'Teste')
    if (!p.conjuntoId) { p.conjuntoId = await criarConjunto(chave, act, cfg, p.campanhaId, `${nomeC} · Versão A`, diario / 2, d.publico); p.conjuntoNovo = true; await salvar(p) }
    if (!p.conjuntoB) { p.conjuntoB = await criarConjunto(chave, act, cfg, p.campanhaId, `${nomeC} · Versão B`, diario / 2, d.teste!.variavel === 'publico' && d.publicoB ? d.publicoB : d.publico); await salvar(p) }
  } else if (!p.conjuntoId) {
    if (d.destino.conjunto === 'novo') {
      p.conjuntoId = await criarConjunto(chave, act, cfg, p.campanhaId, comPrefixo(d.destino.nomeConjunto || 'Público do lançamento'), diario, d.publico); p.conjuntoNovo = true
    } else {
      await daGf(chave, 'conjunto', d.destino.conjunto); p.conjuntoId = d.destino.conjunto
    }
    await salvar(p)
  }
  // 3) criativo e anúncio (pausado) de cada versão
  const versoes: Array<{ sufixo: string; conjunto: string; midia: Midia; texto: Texto; chaveC: string; chaveA: string }> = [
    { sufixo: teste ? ' · Versão A' : '', conjunto: p.conjuntoId, midia: d.midia, texto: d.texto, chaveC: 'criativoId', chaveA: 'anuncioId' },
  ]
  if (teste) versoes.push({
    sufixo: ' · Versão B', conjunto: p.conjuntoB, midia: d.teste!.variavel === 'criativo' && d.midiaB ? d.midiaB : d.midia,
    texto: d.teste!.variavel === 'texto' && d.textoB ? d.textoB : d.texto, chaveC: 'criativoB', chaveA: 'anuncioB',
  })
  for (const v of versoes) {
    if (!p[v.chaveC]) { p[v.chaveC] = await criarCriativo(chave, act, cfg, `${nomeAd}${v.sufixo}`, v.midia, v.texto, d.link, p.avisos); await salvar(p) }
    if (!p[v.chaveA]) {
      const a = await gravar(chave, `${act}/ads`, { name: `${nomeAd}${v.sufixo}`, adset_id: v.conjunto, creative: { creative_id: p[v.chaveC] }, status: 'PAUSED' })
      p[v.chaveA] = String(a.id); await salvar(p)
    }
  }
  return { pronto: true, progresso: p }
}

/* ------------------------------------------------------------------ o servidor */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)
  let d: Record<string, any>
  try { d = await req.json() } catch { return json({ erro: 'Corpo inválido' }, 400) }
  const marca = String(d.marca ?? ''), parceiro = String(d.parceiro ?? ''), acao = String(d.acao ?? '')
  const cfg = CONTAS[marca]?.[parceiro]
  if (!cfg) return json({ erro: 'Esse parceiro não tem conta de anúncios ligada.' }, 400)

  // só o admin geral (a mesma regra do painel)
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  const [quem, usuario] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_admin_geral_da`, { method: 'POST', headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_marca: marca }) }),
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!quem.ok || (await quem.json()) !== true) return json({ erro: 'Só o administrador geral usa o estúdio de anúncios.' }, 403)
  const meta = usuario?.user_metadata ?? {}
  const nomeDeQuem = String(meta.nome || meta.full_name || meta.name || String(usuario?.email ?? '').split('@')[0].split('+')[0] || 'Admin')
  const anotar = (acaoH: string, alvoTipo: string, alvoId: string, alvoNome: string, detalhe: Record<string, unknown> = {}) =>
    rest('anuncios_historico', { method: 'POST', body: JSON.stringify({ marca, parceiro, quem: usuario?.id ?? null, quem_nome: nomeDeQuem, acao: acaoH, alvo_tipo: alvoTipo, alvo_id: alvoId, alvo_nome: alvoNome, detalhe }) })

  const c = await rest(`config_servicos?chave=eq.META_ADS_${marca.toUpperCase()}_${parceiro.toUpperCase()}&select=valor`)
  const chave = c.ok ? ((await c.json())[0]?.valor as string | undefined) : undefined
  const padrao = { conta: cfg.conta, pagina: { id: cfg.pagina, nome: cfg.paginaNome, foto: null as string | null }, instagram: { id: cfg.instagram, usuario: cfg.usuario || cfg.paginaNome, foto: null as string | null }, link: cfg.link, maxDia: MAX_DIA }

  if (acao === 'contexto' && !chave) {
    // sem a chave: dá para montar rascunhos com as campanhas que a ponte trouxe; criar, só com a chave
    const r = await rest(`meta_ponte_entidade?marca=eq.${marca}&parceiro=eq.${parceiro}&tipo=in.(campanha,conjunto)&select=tipo,id,dados`)
    const l = r.ok ? await r.json() : []
    return json({
      ...padrao, semChave: true,
      campanhas: l.filter((e: any) => e.tipo === 'campanha').map((e: any) => ({ id: e.id, nome: e.dados.nome, status: e.dados.status, orcDia: Number(e.dados.orcDia) || 0 })),
      conjuntos: l.filter((e: any) => e.tipo === 'conjunto').map((e: any) => ({ id: e.id, nome: e.dados.nome, status: e.dados.status, campanhaId: e.dados.campanhaId, orcDia: Number(e.dados.orcDia) || 0, publico: e.dados.publico ?? '' })),
    })
  }
  if (!chave) return json({ semChave: true, erro: 'Para subir e mexer nos anúncios daqui, falta conectar a chave da conta de anúncios.' }, 409)
  const act = `act_${cfg.conta}`

  try {
    if (acao === 'contexto') {
      const filtro = JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: PREFIXO }])
      const [pagina, campanhas, conjuntos] = await Promise.all([
        ler(chave, cfg.pagina, { fields: 'name,picture{url},instagram_business_account{id,username,profile_picture_url}' }).catch(() => null),
        ler(chave, `${act}/campaigns`, { fields: 'id,name,effective_status,daily_budget', filtering: filtro, limit: '200' }),
        ler(chave, `${act}/adsets`, { fields: 'id,name,effective_status,campaign_id,campaign{name},daily_budget,targeting', limit: '300' }),
      ])
      const igDaPagina = pagina?.instagram_business_account
      return json({
        ...padrao,
        pagina: { id: cfg.pagina, nome: pagina?.name ?? cfg.paginaNome, foto: pagina?.picture?.data?.url ?? null },
        instagram: { id: igDaPagina?.id ?? cfg.instagram, usuario: igDaPagina?.username ?? (cfg.usuario || pagina?.name || cfg.paginaNome), foto: igDaPagina?.profile_picture_url ?? pagina?.picture?.data?.url ?? null },
        campanhas: (campanhas.data ?? []).map((x: any) => ({ id: x.id, nome: x.name, status: x.effective_status, orcDia: Number(x.daily_budget ?? 0) / 100 })),
        conjuntos: (conjuntos.data ?? []).filter((x: any) => String(x.campaign?.name ?? '').includes(PREFIXO))
          .map((x: any) => ({ id: x.id, nome: x.name, status: x.effective_status, campanhaId: x.campaign_id, orcDia: Number(x.daily_budget ?? 0) / 100, publico: x.targeting?.targeting_automation?.advantage_audience === 1 ? 'Público Advantage+' : `${x.targeting?.age_min ?? 18}–${x.targeting?.age_max ?? 65} anos` })),
      })
    }

    if (acao === 'imagem') {
      const bytes = b64(String(d.base64 ?? ''))
      if (!bytes.length || bytes.length > 30e6) return json({ erro: 'A imagem precisa ter até 30 MB.' }, 400)
      const r = await gravar(chave, `${act}/adimages`, { bytes: d.base64 })
      const img = Object.values(r.images ?? {})[0] as any
      if (!img?.hash) throw new Error('A Meta não devolveu a imagem.')
      return json({ hash: img.hash, url: img.url ?? null })
    }
    if (acao === 'video_inicio') {
      const tamanho = Math.round(Number(d.tamanho))
      if (!(tamanho > 0 && tamanho <= 4e9)) return json({ erro: 'O vídeo precisa ter até 4 GB.' }, 400)
      const r = await gravar(chave, `${act}/advideos`, { upload_phase: 'start', file_size: tamanho })
      return json({ sessao: String(r.upload_session_id), videoId: String(r.video_id), de: Number(r.start_offset), ate: Number(r.end_offset) })
    }
    if (acao === 'video_parte') {
      const r = await gravar(chave, `${act}/advideos`, { upload_phase: 'transfer', upload_session_id: String(d.sessao), start_offset: Number(d.de) },
        { campo: 'video_file_chunk', bytes: b64(String(d.base64 ?? '')), nome: 'parte' })
      return json({ de: Number(r.start_offset), ate: Number(r.end_offset) })
    }
    if (acao === 'video_fim') {
      await gravar(chave, `${act}/advideos`, { upload_phase: 'finish', upload_session_id: String(d.sessao), title: String(d.nome ?? 'Vídeo do estúdio').slice(0, 120) })
      return json({ ok: true })
    }
    if (acao === 'video_estado') {
      const v = await ler(chave, String(d.videoId), { fields: 'status' })
      return json({ estado: v.status?.video_status ?? 'processing', progresso: Number(v.status?.processing_progress ?? 0) })
    }

    if (acao === 'criar' || acao === 'ligar' || acao === 'vencedor') {
      const id = String(d.id ?? '')
      if (!/^[0-9a-f-]{36}$/.test(id)) return json({ erro: 'Rascunho inválido.' }, 400)
      const lr = await rest(`anuncios_rascunhos?id=eq.${id}&marca=eq.${marca}&parceiro=eq.${parceiro}&select=*`)
      const r = lr.ok ? (await lr.json())[0] : null
      if (!r) return json({ erro: 'Rascunho não encontrado.' }, 404)
      const mudar = (campos: Record<string, unknown>) => rest(`anuncios_rascunhos?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...campos, atualizado_em: new Date().toISOString() }) })

      if (acao === 'criar') {
        if (!['rascunho', 'erro', 'criando'].includes(r.situacao)) return json({ situacao: r.situacao, progresso: r.progresso })
        await mudar({ situacao: 'criando', erro: null })
        try {
          const feito = await criar(chave, cfg, r, async (p) => { await mudar({ progresso: p }) })
          if ('aguardando' in feito) return json({ situacao: 'criando', aguardando: feito.aguardando, progresso: feito.progresso })
          await mudar({ situacao: 'pausado', progresso: feito.progresso })
          await anotar(r.tipo === 'teste' ? 'criou_teste' : 'criou', 'anuncio', feito.progresso.anuncioId, r.nome, { diario: r.dados?.diario, avisos: feito.progresso.avisos })
          return json({ situacao: 'pausado', progresso: feito.progresso })
        } catch (e) {
          await mudar({ situacao: 'erro', erro: (e as Error).message })
          throw e
        }
      }

      const p = r.progresso ?? {}
      if (acao === 'ligar') {
        if (r.situacao !== 'pausado') return json({ erro: 'Só dá para ligar um anúncio que já está na Meta, pausado.' }, 400)
        const ids = [p.anuncioId, p.anuncioB, p.conjuntoNovo ? p.conjuntoId : null, p.conjuntoB, p.campanhaNova ? p.campanhaId : null].filter(Boolean)
        for (const x of ids) await gravar(chave, String(x), { status: 'ACTIVE' })
        // teste A/B: o estudo oficial da Meta (públicos separados, sem mistura) começa agora
        if (r.tipo === 'teste' && p.conjuntoB && !p.estudoId) {
          try {
            const conta = await ler(chave, act, { fields: 'business{id}' })
            const negocio = conta.business?.id
            if (!negocio) throw new Error('a conta não está num gerenciador de negócios')
            const inicio = Math.floor(Date.now() / 1000) + 120, dias = Math.min(30, Math.max(3, Number(r.dados?.teste?.dias) || 7))
            const e = await gravar(chave, `${negocio}/ad_studies`, {
              name: `${r.nome} · teste A/B`.slice(0, 200), type: 'SPLIT_TEST', start_time: inicio, end_time: inicio + dias * 86400,
              cells: [{ name: 'Versão A', treatment_percentage: 50, adsets: [p.conjuntoId] }, { name: 'Versão B', treatment_percentage: 50, adsets: [p.conjuntoB] }],
            })
            p.estudoId = String(e.id)
          } catch (e) {
            p.testeSimples = true
            p.avisos = [...(p.avisos ?? []), `A Meta não abriu o teste A/B oficial (${(e as Error).message}). As duas versões rodam lado a lado na mesma campanha, e a comparação continua aqui.`]
          }
        }
        await mudar({ situacao: 'ligado', progresso: p })
        await anotar('ligou', 'anuncio', p.anuncioId, r.nome, { diario: r.dados?.diario, teste: r.tipo === 'teste' })
        return json({ situacao: 'ligado', progresso: p })
      }
      // fim do teste: pausa a versão que perdeu
      const vencedor = d.vencedor === 'b' ? 'b' : 'a'
      const perdedor = vencedor === 'a' ? p.conjuntoB : p.conjuntoId
      if (!perdedor) return json({ erro: 'Esse rascunho não é um teste A/B.' }, 400)
      await gravar(chave, String(perdedor), { status: 'PAUSED' })
      p.vencedor = vencedor
      await mudar({ progresso: p })
      await anotar('vencedor', 'conjunto', vencedor === 'a' ? p.conjuntoId : p.conjuntoB, r.nome, { vencedor: vencedor.toUpperCase() })
      return json({ situacao: r.situacao, progresso: p })
    }

    if (acao === 'status') {
      const tipo = ['campanha', 'conjunto', 'anuncio'].includes(d.tipo) ? String(d.tipo) : ''
      if (!tipo) return json({ erro: 'Tipo inválido.' }, 400)
      const alvo = await daGf(chave, tipo, String(d.id))
      const status = d.ligar ? 'ACTIVE' : 'PAUSED'
      await gravar(chave, String(d.id), { status })
      // ligar um conjunto copiado (escalar): os anúncios dele também
      if (tipo === 'conjunto' && d.cascata) {
        const ads = await ler(chave, `${d.id}/ads`, { fields: 'id', limit: '50' })
        for (const a of ads.data ?? []) await gravar(chave, String(a.id), { status })
      }
      await anotar(d.ligar ? 'ligou' : 'pausou', tipo, String(d.id), alvo.nome)
      return json({ ok: true, status })
    }
    if (acao === 'orcamento') {
      const diario = Number(d.diario)
      if (!(diario >= 6 && diario <= MAX_DIA)) return json({ erro: `O orçamento por dia precisa ficar entre R$ 6 e R$ ${MAX_DIA.toLocaleString('pt-BR')}.` }, 400)
      const alvo = await daGf(chave, 'conjunto', String(d.conjuntoId))
      const antes = await ler(chave, String(d.conjuntoId), { fields: 'daily_budget' })
      if (!Number(antes.daily_budget)) return json({ erro: 'Esse conjunto usa o orçamento da campanha: mude no Gerenciador.' }, 400)
      await gravar(chave, String(d.conjuntoId), { daily_budget: Math.round(diario * 100) })
      await anotar('orcamento', 'conjunto', String(d.conjuntoId), alvo.nome, { antes: Number(antes.daily_budget) / 100, depois: diario })
      return json({ ok: true, diario })
    }
    if (acao === 'escalar') {
      const aumento = Math.min(100, Math.max(5, Number(d.aumento) || 20))
      const alvo = await daGf(chave, 'conjunto', String(d.conjuntoId))
      const antes = await ler(chave, String(d.conjuntoId), { fields: 'daily_budget' })
      const novoDia = Math.min(MAX_DIA, Math.round((Number(antes.daily_budget) / 100) * (1 + aumento / 100)))
      const copia = await gravar(chave, `${d.conjuntoId}/copies`, { deep_copy: true, status_option: 'PAUSED', rename_options: { rename_suffix: ' · escala' } })
      const novo = String(copia.copied_adset_id ?? copia.ad_object_ids?.[0]?.copied_id ?? '')
      if (!novo) throw new Error('A Meta não devolveu a cópia do conjunto.')
      if (novoDia >= 6) await gravar(chave, novo, { daily_budget: novoDia * 100 })
      await anotar('escalou', 'conjunto', novo, `${alvo.nome} · escala`, { de: String(d.conjuntoId), diario: novoDia, aumento })
      return json({ conjuntoId: novo, diario: novoDia })
    }
    return json({ erro: 'Ação desconhecida.' }, 400)
  } catch (e) {
    if (e instanceof ErroDaMeta && e.codigo === 190) return json({ chaveInvalida: true, erro: 'A Meta não aceitou a chave (venceu ou foi trocada). Cole uma nova na aba Anúncios.' }, 401)
    if (e instanceof ErroDaMeta && [4, 17, 32, 613, 80004].includes(e.codigo)) return json({ erro: 'A Meta pediu uma pausa. Tente de novo em alguns minutos.' }, 429)
    if (e instanceof ErroDaMeta && (e.codigo === 200 || e.codigo === 10)) return json({ erro: `A chave não tem permissão para isso. Gere a chave com todas as permissões (ads_management). Detalhe: ${e.message}` }, 403)
    return json({ erro: e instanceof ErroDaMeta ? `A Meta respondeu: ${e.message}` : (e as Error).message }, 502)
  }
})
