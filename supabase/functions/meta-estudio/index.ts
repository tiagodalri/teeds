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
//   buscar { tipo, q }               busca ao vivo da Meta: interesse, comportamento, local (estado/cidade), aparelho
//   sugerir { nomes }                interesses parecidos com os escolhidos
//   estimar { publico }              tamanho estimado do público (pessoas por mês), sem criar nada
//
// 03/11/2026 (Tiago: "está bem cru... cadê interesses, aparelho, iPhone 15/16/17, Insta ou Face"):
// o público completo (local, idade, gênero, interesses, exclusões, idioma, sistema, modelo de celular,
// só Wi-Fi, onde aparece, semelhantes e remarketing do pixel). O que vem só com o nome é procurado na
// Meta na hora; o que não for achado vira aviso e fica de fora (nada é inventado).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!

/**
 * Quem pede (05/11/2026): o admin geral (pleno, sem parceiro) ou o admin do parceiro com
 * acesso total (pleno, parceiro = o dele). Se a leitura falhar, nega: nunca vira geral por engano.
 */
async function acessoDoAdmin(apikey: string, token: string, marca: string): Promise<{ pleno: boolean; parceiro: string | null }> {
  const h = { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const corpo = JSON.stringify({ p_marca: marca })
  const [a, b] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_admin_pleno_da`, { method: 'POST', headers: h, body: corpo }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/teeds_parceiro_forcado`, { method: 'POST', headers: h, body: corpo }),
  ])
  if (!a.ok || !b.ok) return { pleno: false, parceiro: null }
  const pleno = (await a.json()) === true
  const parceiro = (await b.json()) as string | null
  return { pleno, parceiro: pleno && parceiro ? String(parceiro) : null }
}
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
// 03/11/2026: a conta escolhida em Administração › Anúncios (META_CONTA_<MARCA>_<PARCEIRO>) vale por cima desta
async function contaDe(marca: string, parceiro: string) {
  const base = CONTAS[marca]?.[parceiro]
  if (!base) return null
  const r = await rest(`config_servicos?chave=eq.META_CONTA_${marca.toUpperCase()}_${parceiro.toUpperCase()}&select=valor`)
  const linha = r.ok ? (await r.json())[0] : null
  try {
    const o = linha?.valor ? JSON.parse(linha.valor) : null
    if (!o) return base
    // conta nova sem página escolhida: não herda a página da conta antiga
    const trocouConta = o.conta && o.conta !== base.conta
    return { ...base, conta: o.conta ?? base.conta, pixel: o.pixel ?? base.pixel,
      pagina: o.pagina ?? (trocouConta ? '' : base.pagina), paginaNome: o.paginaNome ?? (trocouConta ? '' : base.paginaNome),
      instagram: o.instagram ?? (trocouConta ? '' : base.instagram), usuario: o.usuario ?? (trocouConta ? '' : base.usuario) }
  } catch { return base }
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
type Local = { tipo: 'estado' | 'cidade'; nome: string; chave?: string; raio?: number }
type Interesse = { tipo: 'interesse' | 'comportamento'; nome: string; id?: string }
type Publico = {
  modo: string; idadeMin: number; idadeMax: number; genero: 'todos' | 'homens' | 'mulheres'
  locais?: Local[]; interesses?: Interesse[]; excluirInteresses?: Interesse[]; portugues?: boolean
  sistema?: 'todos' | 'ios' | 'android'; modelos?: string[]; soWifi?: boolean
  posicionamentos?: { modo: 'auto' | 'manual'; instagram: string[]; facebook: string[]; messenger: boolean; audienceNetwork: boolean; aparelhos: string[] }
  inteligente?: { tipo: 'semelhantes' | 'remarketing'; percentual: number; dias: number }; excluirCadastrados?: boolean
}
interface Dados {
  nomeAnuncio: string; midia?: Midia; midiaB?: Midia; texto: Texto; textoB?: Texto; link: string
  destino: { campanha: string; nomeCampanha?: string; conjunto: string; nomeConjunto?: string }
  publico: Publico; publicoB?: Publico; diario: number; teste?: { variavel: 'criativo' | 'texto' | 'publico'; dias: number }
}

const normal = (t: string) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const busca = async (chave: string, params: Record<string, string>) => (await ler(chave, 'search', { locale: 'pt_BR', limit: '50', ...params })).data ?? []
const faixa = (x: any): [number, number] | undefined => (x?.audience_size_lower_bound != null ? [Number(x.audience_size_lower_bound), Number(x.audience_size_upper_bound ?? x.audience_size_lower_bound)] : undefined)

/** Procura na Meta o que o público tem só pelo nome (com memória dentro da mesma chamada). */
function resolvedor(chave: string) {
  const listas = new Map<string, Promise<any[]>>()
  const lista = (classe: string) => { if (!listas.has(classe)) listas.set(classe, busca(chave, { type: 'adTargetingCategory', class: classe, limit: '1000' }).catch(() => [])); return listas.get(classe)! }
  const melhor = (itens: any[], nome: string) => itens.find((x) => normal(x.name) === normal(nome)) ?? itens.find((x) => normal(x.name).includes(normal(nome))) ?? null
  return {
    async local(l: Local) {
      if (l.chave) return l.chave
      const r = await busca(chave, { type: 'adgeolocation', q: l.nome, location_types: JSON.stringify([l.tipo === 'estado' ? 'region' : 'city']), country_code: 'BR' }).catch(() => [])
      return (melhor(r, l.nome) ?? r[0])?.key ?? null
    },
    async interesse(i: Interesse) {
      if (i.id) return { id: i.id, name: i.nome }
      if (i.tipo === 'comportamento') { const x = melhor(await lista('behaviors'), i.nome); return x ? { id: String(x.id), name: x.name } : null }
      const r = await busca(chave, { type: 'adinterest', q: i.nome }).catch(() => [])
      const x = melhor(r, i.nome) ?? r[0]
      return x ? { id: String(x.id), name: x.name } : null
    },
    async aparelhos(nomes: string[]) {
      const todos = await lista('user_device')
      return nomes.map((n) => ({ pedido: n, achado: melhor(todos, n)?.name as string | undefined }))
    },
    async portugues() {
      const r = await busca(chave, { type: 'adlocale', q: 'Portuguese' }).catch(() => [])
      return r.filter((x: any) => /portug/i.test(x.name)).map((x: any) => Number(x.key))
    },
  }
}

/** Um público do pixel na conta (procura pelo nome; se não existir e `criar`, cria). Nenhum dado pessoal sai daqui. */
async function publicoDoPixel(chave: string, act: string, nome: string, criar: false | Record<string, unknown>) {
  const achados = await ler(chave, `${act}/customaudiences`, { fields: 'id,name', filtering: JSON.stringify([{ field: 'name', operator: 'EQUAL', value: nome }]), limit: '5' }).catch(() => ({ data: [] }))
  const ja = (achados.data ?? []).find((x: any) => x.name === nome)
  if (ja) return String(ja.id)
  if (!criar) return null
  const d = await gravar(chave, `${act}/customaudiences`, { name: nome, ...criar })
  return String(d.id)
}
const regraDoPixel = (pixel: string, dias: number, filtros: Array<Record<string, string>>) => ({
  inclusions: { operator: 'or', rules: [{ event_sources: [{ id: pixel, type: 'pixel' }], retention_seconds: Math.round(dias * 86400), filter: { operator: 'and', filters: filtros } }] },
})

/**
 * A segmentação da Meta a partir do público do Estúdio. `criarPublicos`: na hora de criar o anúncio,
 * os públicos do pixel (cadastrados, visitantes, semelhantes) são criados se ainda não existirem;
 * na estimativa, não (entra só o que já existe).
 */
async function montarSegmentacao(chave: string, act: string, cfg: { pixel: string }, parceiro: string, p: Publico, avisos: string[], criarPublicos: boolean) {
  const r = resolvedor(chave)
  const t: Record<string, any> = {}
  const modo = p.modo === 'personalizado' ? 'detalhado' : p.modo
  // onde: Brasil todo ou estados e cidades (com raio)
  const locais = p.locais ?? []
  if (!locais.length) t.geo_locations = { countries: ['BR'] }
  else {
    const regioes: any[] = [], cidades: any[] = []
    for (const l of locais) {
      const k = await r.local(l)
      if (!k) { avisos.push(`Não achei "${l.nome}" na Meta: ficou de fora.`); continue }
      if (l.tipo === 'estado') regioes.push({ key: String(k) })
      else cidades.push({ key: String(k), ...(l.raio ? { radius: Math.min(80, Math.max(17, Math.round(l.raio))), distance_unit: 'kilometer' } : {}) })
    }
    t.geo_locations = regioes.length || cidades.length ? { ...(regioes.length ? { regions: regioes } : {}), ...(cidades.length ? { cities: cidades } : {}) } : { countries: ['BR'] }
    if (!regioes.length && !cidades.length) avisos.push('Nenhum lugar foi achado: o anúncio vale para o Brasil todo.')
  }
  // idade e gênero (no Advantage+ só a idade mínima é trava, até 25)
  if (modo === 'padrao') {
    t.age_min = Math.min(25, Math.max(18, Math.round(p.idadeMin || 18))); t.age_max = 65
    t.targeting_automation = { advantage_audience: 1 }
  } else {
    const min = Math.min(65, Math.max(18, Math.round(p.idadeMin || 18)))
    t.age_min = min; t.age_max = Math.min(65, Math.max(min, Math.round(p.idadeMax || 65)))
    if (p.genero === 'homens') t.genders = [1]; else if (p.genero === 'mulheres') t.genders = [2]
    t.targeting_automation = { advantage_audience: 0 }
  }
  // interesses, comportamentos e exclusões
  if (modo === 'detalhado') {
    const grupo = async (lista: Interesse[] = []) => {
      const interests: any[] = [], behaviors: any[] = []
      for (const i of lista) {
        const x = await r.interesse(i)
        if (!x) { avisos.push(`Não achei "${i.nome}" na Meta: ficou de fora.`); continue }
        ;(i.tipo === 'comportamento' ? behaviors : interests).push(x)
      }
      return { ...(interests.length ? { interests } : {}), ...(behaviors.length ? { behaviors } : {}) }
    }
    const inclui = await grupo(p.interesses), exclui = await grupo(p.excluirInteresses)
    if (Object.keys(inclui).length) t.flexible_spec = [inclui]
    if (Object.keys(exclui).length) t.exclusions = exclui
  }
  // idioma, sistema, modelo de celular e Wi-Fi
  if (modo !== 'padrao') {
    if (p.portugues) { const l = await r.portugues(); if (l.length) t.locales = l; else avisos.push('Não consegui marcar o idioma português: ficou sem filtro de idioma.') }
    if (p.sistema === 'ios') t.user_os = ['iOS']; else if (p.sistema === 'android') t.user_os = ['Android']
    if (p.modelos?.length && t.user_os) {
      const achados = await r.aparelhos(p.modelos)
      const ok = achados.filter((a) => a.achado).map((a) => a.achado!)
      for (const a of achados) if (!a.achado) avisos.push(`A Meta não tem o aparelho "${a.pedido}" na lista: ficou de fora.`)
      if (ok.length) t.user_device = [...new Set(ok)]
    }
    if (p.soWifi) t.wireless_carrier = ['Wifi']
  }
  // públicos do pixel: semelhantes, remarketing e quem já se cadastrou
  const nomeCad = `GF | Cadastrados pelo pixel (/${parceiro})`
  const cadastrados = () => publicoDoPixel(chave, act, nomeCad, criarPublicos && { rule: regraDoPixel(cfg.pixel, 180, [{ field: 'event', operator: 'eq', value: 'CompleteRegistration' }]), prefill: true, description: 'Criado pelo Estúdio de anúncios da GlobalFly' })
  if (modo === 'inteligente' && p.inteligente) {
    try {
    if (p.inteligente.tipo === 'semelhantes') {
      const pct = Math.min(10, Math.max(1, Math.round(p.inteligente.percentual || 1)))
      const origem = await cadastrados()
      const id = origem ? await publicoDoPixel(chave, act, `GF | Semelhantes ${pct}% aos cadastrados (/${parceiro})`, criarPublicos && { subtype: 'LOOKALIKE', origin_audience_id: origem, lookalike_spec: { ratio: pct / 100, country: 'BR' } }) : null
      if (id) t.custom_audiences = [{ id }]
      else avisos.push(criarPublicos ? 'Não consegui montar o público semelhante.' : 'O público semelhante é criado junto com o anúncio: a estimativa ainda não conta com ele.')
    } else {
      const dias = Math.min(180, Math.max(1, Math.round(p.inteligente.dias || 30)))
      const id = await publicoDoPixel(chave, act, `GF | Visitaram /${parceiro} em ${dias} dias`, criarPublicos && { rule: regraDoPixel(cfg.pixel, dias, [{ field: 'url', operator: 'i_contains', value: `/${parceiro}/` }]), prefill: true, description: 'Criado pelo Estúdio de anúncios da GlobalFly' })
      if (id) t.custom_audiences = [{ id }]
      else avisos.push(criarPublicos ? 'Não consegui montar o público de remarketing.' : 'O público de remarketing é criado junto com o anúncio: a estimativa ainda não conta com ele.')
    }
    } catch (e) {
      // o público do pixel é o coração desse modo: sem ele, melhor parar do que anunciar para o Brasil todo
      if (criarPublicos) throw new Error(`A Meta não deixou montar o público do pixel: ${(e as Error).message}`)
      avisos.push(`A estimativa não conta com o público do pixel agora (${(e as Error).message}).`)
    }
    if (criarPublicos && !t.custom_audiences) throw new Error('O público do pixel ainda não tem gente suficiente (o semelhante precisa de pelo menos 100 cadastros vistos pelo pixel). Use "A Meta encontra" ou "Eu escolho" por enquanto.')
  }
  if (p.excluirCadastrados || (modo === 'inteligente' && p.inteligente?.tipo === 'remarketing')) {
    // tirar quem já se cadastrou é um extra: se a Meta não deixar montar o público, o anúncio segue sem ele
    try {
      const id = await cadastrados()
      if (id) t.excluded_custom_audiences = [{ id }]
    } catch (e) {
      avisos.push(`Não deu para tirar quem já se cadastrou (${(e as Error).message}). O anúncio segue sem essa exclusão.`)
    }
  }
  // onde aparece: automático (Advantage+) ou escolhido
  const pos = p.posicionamentos
  if (pos?.modo === 'manual') {
    const plataformas = [pos.facebook?.length ? 'facebook' : '', pos.instagram?.length ? 'instagram' : '', pos.messenger ? 'messenger' : '', pos.audienceNetwork ? 'audience_network' : ''].filter(Boolean)
    t.publisher_platforms = plataformas
    if (pos.facebook?.length) t.facebook_positions = pos.facebook
    if (pos.instagram?.length) t.instagram_positions = pos.instagram
    if (pos.messenger) t.messenger_positions = ['messenger_home', 'story']
    if (pos.audienceNetwork) t.audience_network_positions = ['classic', 'rewarded_video']
    if (pos.aparelhos?.length && pos.aparelhos.length < 2) t.device_platforms = pos.aparelhos
  }
  return t
}

// 04/11/2026: para público no Brasil a Meta exige o anunciante e o pagador VERIFICADOS em cada conjunto
// ("Forneça um anunciante verificado..."). O Gerenciador põe o padrão da conta sozinho; a API não.
// O certo vai em regional_regulated_categories + regional_regulation_identities (o id do portfólio com a
// verificação, na conta do Naor a GOATWIN LTDA). Não inventamos o id: copiamos de um conjunto da conta que já o tem.
type Identidade = { regional_regulated_categories: string[]; regional_regulation_identities: Record<string, string> }
async function identidadeVerificada(chave: string, act: string): Promise<Identidade | null> {
  const l = await ler(chave, `${act}/adsets`, { fields: 'regional_regulated_categories,regional_regulation_identities', limit: '100' }).catch(() => ({ data: [] }))
  const com = (l.data ?? []).find((x: any) => x.regional_regulation_identities?.universal_beneficiary)
  return com ? { regional_regulated_categories: com.regional_regulated_categories ?? ['BRAZIL_REGULATION'], regional_regulation_identities: com.regional_regulation_identities } : null
}

async function criarConjunto(chave: string, act: string, cfg: { pixel: string }, campanhaId: string, nome: string, diario: number, targeting: Record<string, unknown>, identidade: Identidade | null) {
  try {
    const d = await gravar(chave, `${act}/adsets`, {
      name: nome, campaign_id: campanhaId, status: 'PAUSED', daily_budget: Math.round(diario * 100), billing_event: 'IMPRESSIONS',
      optimization_goal: 'OFFSITE_CONVERSIONS', bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
      promoted_object: { pixel_id: cfg.pixel, custom_event_type: 'COMPLETE_REGISTRATION' }, targeting, ...(identidade ?? {}),
    })
    return String(d.id)
  } catch (e) {
    if (!identidade && /anunciante verificado|verified advertiser/i.test((e as Error).message)) {
      throw new Error('A Meta exige o anunciante verificado nesta conta e ainda não há nenhum conjunto com ele para copiar. Publique um conjunto pelo Gerenciador uma vez (ele puxa o anunciante padrão da conta) e tente de novo.')
    }
    throw e
  }
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

async function criar(chave: string, cfg: typeof CONTAS['globalfly']['n'], parceiro: string, r: any, salvar: (p: any) => Promise<void>) {
  const d = r.dados as Dados, p = { ...(r.progresso ?? {}) } as Record<string, any>, act = `act_${cfg.conta}`
  p.avisos = p.avisos ?? []
  const teste = r.tipo === 'teste' && d.teste
  // conferências antes de gastar qualquer chamada
  if (!cfg.pagina) throw new Error('Falta escolher a página que assina os anúncios: em Administração › Anúncios, toque em Trocar a conta e escolha a página.')
  if (!d.midia || (d.midia.tipo === 'imagem' ? !d.midia.hash : !d.midia.videoId)) throw new Error('Falta o vídeo ou a imagem do anúncio.')
  if (teste && d.teste!.variavel === 'criativo' && !d.midiaB) throw new Error('Falta o criativo da versão B.')
  if (!d.texto?.principal?.trim() || !d.texto?.titulo?.trim()) throw new Error('Falta o texto ou o título do anúncio.')
  if (!/^https:\/\/(www\.)?globalflytrade\.com\//.test(d.link ?? '')) throw new Error('O link precisa ser uma página da GlobalFly (globalflytrade.com).')
  const testaTexto = teste && d.teste!.variavel === 'texto', testaCriativo = teste && d.teste!.variavel === 'criativo'
  conferirTexto(d.texto.principal, d.texto.titulo, d.texto.descricao, ...(testaTexto ? [d.textoB?.principal, d.textoB?.titulo, d.textoB?.descricao] : []), d.nomeAnuncio)
  const diario = Number(d.diario)
  if (!(diario >= 6 && diario <= MAX_DIA)) throw new Error(`O orçamento por dia precisa ficar entre R$ 6 e R$ ${MAX_DIA.toLocaleString('pt-BR')}.`)
  if (!(await videoPronto(chave, d.midia)) || !(await videoPronto(chave, testaCriativo ? d.midiaB : undefined))) return { aguardando: 'video', progresso: p }

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
  const precisaA = teste ? !p.conjuntoId : !p.conjuntoId && d.destino.conjunto === 'novo'
  const alvoA = precisaA ? await montarSegmentacao(chave, act, cfg, parceiro, d.publico, p.avisos, true) : null
  const alvoB = teste && !p.conjuntoB ? (d.teste!.variavel === 'publico' && d.publicoB ? await montarSegmentacao(chave, act, cfg, parceiro, d.publicoB, p.avisos, true) : alvoA ?? await montarSegmentacao(chave, act, cfg, parceiro, d.publico, p.avisos, true)) : null
  const identidade = (teste ? !p.conjuntoId || !p.conjuntoB : precisaA) ? await identidadeVerificada(chave, act) : null
  if (teste) {
    const nomeC = comPrefixo(d.destino.nomeConjunto || d.nomeAnuncio || 'Teste')
    if (!p.conjuntoId) { p.conjuntoId = await criarConjunto(chave, act, cfg, p.campanhaId, `${nomeC} · Versão A`, diario / 2, alvoA!, identidade); p.conjuntoNovo = true; await salvar(p) }
    if (!p.conjuntoB) { p.conjuntoB = await criarConjunto(chave, act, cfg, p.campanhaId, `${nomeC} · Versão B`, diario / 2, alvoB!, identidade); await salvar(p) }
  } else if (!p.conjuntoId) {
    if (d.destino.conjunto === 'novo') {
      p.conjuntoId = await criarConjunto(chave, act, cfg, p.campanhaId, comPrefixo(d.destino.nomeConjunto || 'Público do lançamento'), diario, alvoA!, identidade); p.conjuntoNovo = true
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
  const cfg = await contaDe(marca, parceiro)
  if (!cfg) return json({ erro: 'Esse parceiro não tem conta de anúncios ligada.' }, 400)

  // só o admin geral (a mesma regra do painel)
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  const [acesso, usuario] = await Promise.all([
    acessoDoAdmin(apikey, token, marca),
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  if (!acesso.pleno) return json({ erro: 'Só a administração usa o estúdio de anúncios.' }, 403)
  if (acesso.parceiro && acesso.parceiro !== parceiro) return json({ erro: 'Esta conta de anúncios é de outro parceiro.' }, 403)
  const meta = usuario?.user_metadata ?? {}
  const nomeDeQuem = String(meta.nome || meta.full_name || meta.name || String(usuario?.email ?? '').split('@')[0].split('+')[0] || 'Admin')
  const anotar = (acaoH: string, alvoTipo: string, alvoId: string, alvoNome: string, detalhe: Record<string, unknown> = {}) =>
    rest('anuncios_historico', { method: 'POST', body: JSON.stringify({ marca, parceiro, quem: usuario?.id ?? null, quem_nome: nomeDeQuem, acao: acaoH, alvo_tipo: alvoTipo, alvo_id: alvoId, alvo_nome: alvoNome, detalhe }) })

  const c = await rest(`config_servicos?chave=eq.META_ADS_${marca.toUpperCase()}_${parceiro.toUpperCase()}&select=valor`)
  const chave = c.ok ? ((await c.json())[0]?.valor as string | undefined) : undefined
  const padrao = { conta: cfg.conta, pagina: { id: cfg.pagina, nome: cfg.paginaNome, foto: null as string | null }, instagram: { id: cfg.instagram, usuario: cfg.usuario || cfg.paginaNome, foto: null as string | null }, link: cfg.link, maxDia: MAX_DIA }

  // sem a chave (ou com a chave recusada pela Meta): dá para montar rascunhos com as campanhas que a ponte trouxe
  const contextoSemChave = async (chaveInvalida = false) => {
    const r = await rest(`meta_ponte_entidade?marca=eq.${marca}&parceiro=eq.${parceiro}&tipo=in.(campanha,conjunto)&select=tipo,id,dados`)
    const l = r.ok ? await r.json() : []
    return json({
      ...padrao, semChave: true, ...(chaveInvalida ? { chaveInvalida: true } : {}),
      campanhas: l.filter((e: any) => e.tipo === 'campanha').map((e: any) => ({ id: e.id, nome: e.dados.nome, status: e.dados.status, orcDia: Number(e.dados.orcDia) || 0 })),
      conjuntos: l.filter((e: any) => e.tipo === 'conjunto').map((e: any) => ({ id: e.id, nome: e.dados.nome, status: e.dados.status, campanhaId: e.dados.campanhaId, orcDia: Number(e.dados.orcDia) || 0, publico: e.dados.publico ?? '' })),
    })
  }
  if (acao === 'contexto' && !chave) return contextoSemChave()
  if (!chave) return json({ semChave: true, erro: 'Para subir e mexer nos anúncios daqui, falta conectar a chave da conta de anúncios.' }, 409)
  const act = `act_${cfg.conta}`

  try {
    if (acao === 'contexto') {
      const filtro = JSON.stringify([{ field: 'name', operator: 'CONTAIN', value: PREFIXO }])
      const [pagina, campanhas, conjuntos] = (await Promise.all([
        cfg.pagina ? ler(chave, cfg.pagina, { fields: 'name,picture{url},instagram_business_account{id,username,profile_picture_url}' }).catch(() => null) : Promise.resolve(null),
        ler(chave, `${act}/campaigns`, { fields: 'id,name,effective_status,daily_budget', filtering: filtro, limit: '200' }),
        // só os conjuntos das campanhas da GF (a conta do Naor tem muitos outros); se a Meta não aceitar o filtro, sem ele
        ler(chave, `${act}/adsets`, { fields: 'id,name,effective_status,campaign_id,campaign{name},daily_budget,targeting', limit: '500', filtering: JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: PREFIXO }]) })
          .catch(() => ler(chave, `${act}/adsets`, { fields: 'id,name,effective_status,campaign_id,campaign{name},daily_budget,targeting', limit: '500' })),
      ]).catch(async (e) => { if (e instanceof ErroDaMeta && e.codigo === 190) return null; throw e })) ?? [null, null, null]
      if (!campanhas) return contextoSemChave(true)
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

    if (acao === 'buscar') {
      const q = String(d.q ?? '').trim().slice(0, 80), tipo = String(d.tipo ?? '')
      if (q.length < 2) return json({ itens: [] })
      if (tipo === 'interesse') {
        const r = await busca(chave, { type: 'adinterest', q })
        return json({ itens: r.map((x: any) => ({ tipo: 'interesse', nome: x.name, id: String(x.id), tamanho: faixa(x), caminho: (x.path ?? []).slice(0, -1).join(' › ') || x.topic || '' })) })
      }
      if (tipo === 'comportamento' || tipo === 'aparelho') {
        const r = await busca(chave, { type: 'adTargetingCategory', class: tipo === 'aparelho' ? 'user_device' : 'behaviors', limit: '1000' })
        const n = normal(q)
        const itens = r.filter((x: any) => normal(x.name).includes(n)).slice(0, 30)
        return json({ itens: itens.map((x: any) => tipo === 'aparelho' ? { tipo: 'aparelho', nome: x.name, detalhe: x.platform ?? '' } : { tipo: 'comportamento', nome: x.name, id: String(x.id), tamanho: faixa(x), caminho: (x.path ?? []).slice(0, -1).join(' › ') }) })
      }
      if (tipo === 'local') {
        const r = await busca(chave, { type: 'adgeolocation', q, location_types: JSON.stringify(['region', 'city']), country_code: 'BR' })
        return json({ itens: r.map((x: any) => ({ tipo: x.type === 'region' ? 'estado' : 'cidade', nome: x.name, chave: String(x.key), detalhe: x.type === 'city' ? x.region ?? '' : 'Estado' })) })
      }
      return json({ erro: 'Tipo de busca inválido.' }, 400)
    }
    if (acao === 'sugerir') {
      const nomes = (Array.isArray(d.nomes) ? d.nomes : []).map(String).filter(Boolean).slice(0, 10)
      if (!nomes.length) return json({ itens: [] })
      const r = await busca(chave, { type: 'adinterestsuggestion', interest_list: JSON.stringify(nomes), limit: '20' })
      return json({ itens: r.map((x: any) => ({ tipo: 'interesse', nome: x.name, id: String(x.id), tamanho: faixa(x), caminho: (x.path ?? []).slice(0, -1).join(' › ') })) })
    }
    if (acao === 'estimar') {
      const avisos: string[] = []
      const targeting = await montarSegmentacao(chave, act, cfg, parceiro, d.publico as Publico, avisos, false)
      const e = await ler(chave, `${act}/delivery_estimate`, { optimization_goal: 'OFFSITE_CONVERSIONS', targeting_spec: JSON.stringify(targeting), promoted_object: JSON.stringify({ pixel_id: cfg.pixel, custom_event_type: 'COMPLETE_REGISTRATION' }) })
      const x = e.data?.[0] ?? {}
      const lo = Number(x.estimate_mau_lower_bound ?? x.estimate_mau ?? 0), hi = Number(x.estimate_mau_upper_bound ?? x.estimate_mau ?? 0)
      return json({ tamanho: lo || hi ? [lo, hi || lo] : null, avisos })
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
          const feito = await criar(chave, cfg, parceiro, r, async (p) => { await mudar({ progresso: p }) })
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
        // o anúncio entrou numa campanha ou num público que já existia e está pausado: ele não entrega até ligar o de cima
        try {
          const a = await ler(chave, String(p.anuncioId), { fields: 'adset{name,status},campaign{name,status}' })
          if (a.adset?.status === 'PAUSED') p.avisos = [...(p.avisos ?? []), `O público "${a.adset.name}" está pausado: o anúncio só entrega quando ele for ligado (em Rodando agora ou no Gerenciador).`]
          if (a.campaign?.status === 'PAUSED') p.avisos = [...(p.avisos ?? []), `A campanha "${a.campaign.name}" está pausada: o anúncio só entrega quando ela for ligada.`]
        } catch { /* a conferência é um extra */ }
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
      if (!Number(antes.daily_budget)) return json({ erro: 'Esse público usa o orçamento da campanha: escale pela campanha, no Gerenciador.' }, 400)
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
