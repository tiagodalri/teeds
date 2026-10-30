/**
 * A aba Mercado (19/10/2026): notícias e cotações de fontes GRÁTIS e sem
 * cadastro, pedido do Tiago ("por enquanto tudo gratuito, sem cadastro").
 *
 *  - Notícias: os feeds RSS públicos dos portais (testados em 19/10/2026).
 *    Só manchete, resumo curto, foto, fonte e horário; o "ler" abre o site
 *    original, como faz todo agregador (direito autoral).
 *  - Câmbio em reais: AwesomeAPI (economia.awesomeapi.com.br), sem chave.
 *  - Bolsas, ouro e petróleo: o gráfico público do Yahoo Finance, sem chave.
 *    O Ibovespa chega com o atraso que a B3 impõe a dado gratuito (~15 min);
 *    a tela mostra a hora de cada preço, para ninguém achar que é ao vivo.
 *
 * Nada roda em segundo plano: a busca só acontece quando alguém abre a aba
 * e a resposta fica guardada (notícias 5 min, cotações 45 s). Fonte que cai
 * não derruba as outras; sem resposta nova, vale a última que deu certo.
 */

export interface Noticia {
  id: string
  titulo: string
  resumo: string
  link: string
  imagem: string | null
  fonte: string
  quando: string
  categoria: Categoria
}
export type Categoria = 'bolsa' | 'eua' | 'forex' | 'cambio' | 'juros' | 'internacional' | 'cripto' | 'commodities' | 'economia'

export interface Cotacao {
  id: string
  nome: string
  preco: number
  variacao: number
  moeda: string
  hora: string
  atrasada: boolean
  /** Fechamentos do dia (poucos pontos), para o mini gráfico. */
  serie?: number[]
}

/**
 * 30/10/2026 (Victor: "algo da bolsa americana, Nasdaq, e um site grande e
 * confiável de Forex"): os feeds temáticos do Investing.com em português —
 * Moedas e Câmbio (o Forex) e Mercado de Ações (Wall Street e as bolsas lá
 * fora). `assunto` diz de que é o feed; `limite` quantas entram por vez.
 */
const FEEDS: Array<{ fonte: string; url: string; site: string; assunto?: 'forex' | 'eua'; limite?: number }> = [
  { fonte: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/', site: 'https://www.infomoney.com.br/' },
  { fonte: 'Money Times', url: 'https://www.moneytimes.com.br/feed/', site: 'https://www.moneytimes.com.br/' },
  { fonte: 'Exame', url: 'https://exame.com/feed/', site: 'https://exame.com/' },
  { fonte: 'Valor Investe', url: 'https://valorinveste.globo.com/rss/valorinveste/', site: 'https://valorinveste.globo.com/' },
  { fonte: 'G1 Economia', url: 'https://g1.globo.com/rss/g1/economia/', site: 'https://g1.globo.com/economia/' },
  { fonte: 'Investing.com', url: 'https://br.investing.com/rss/news.rss', site: 'https://br.investing.com/' },
  { fonte: 'Seu Dinheiro', url: 'https://www.seudinheiro.com/feed/', site: 'https://www.seudinheiro.com/' },
  { fonte: 'E-Investidor', url: 'https://einvestidor.estadao.com.br/feed/', site: 'https://einvestidor.estadao.com.br/' },
  { fonte: 'Investing.com', url: 'https://br.investing.com/rss/news_1.rss', site: 'https://br.investing.com/', assunto: 'forex', limite: 14 },
  { fonte: 'Investing.com', url: 'https://br.investing.com/rss/news_25.rss', site: 'https://br.investing.com/', limite: 12 },
  // os balanços das empresas americanas (Intel, Nvidia, Apple…), que mexem com a Nasdaq
  { fonte: 'Investing.com', url: 'https://br.investing.com/rss/news_1063.rss', site: 'https://br.investing.com/', assunto: 'eua', limite: 8 },
]

const NAVEGADOR = 'Mozilla/5.0 (compatible; GlobalFlyMercado/1.0)'

async function buscar(url: string, ms = 8000): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': NAVEGADOR, accept: '*/*' }, signal: AbortSignal.timeout(ms) })
  if (!r.ok) throw new Error(`${r.status} em ${url}`)
  return r.text()
}

/* ------------------------------------------------------------ RSS */

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' }
function texto(bruto: string): string {
  return bruto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTIDADES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim()
}
const campo = (item: string, tag: string) => item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] ?? ''

/**
 * A foto em tamanho de vitrine (19/10/2026: o Tiago viu a capa borrada).
 * O InfoMoney manda a foto já reduzida para 300x200 (`?fit=300,200`, o
 * redimensionador do WordPress); pedindo `fit=1280,720` o mesmo endereço
 * devolve a original (até 1000 px). Miniaturas do WordPress com -300x200 no
 * nome também voltam para a original.
 */
function emTamanhoBom(url: string): string {
  try {
    const u = new URL(url)
    if (u.searchParams.has('fit')) { u.searchParams.set('fit', '1280,720'); u.searchParams.set('quality', '85') }
    for (const k of ['w', 'width']) if (u.searchParams.has(k)) u.searchParams.set(k, '1280')
    for (const k of ['h', 'height', 'resize']) u.searchParams.delete(k)
    u.pathname = u.pathname.replace(/-\d{2,4}x\d{2,4}(?=\.(?:jpe?g|png|webp)$)/i, '')
    return u.toString()
  } catch { return url }
}

function imagemDo(item: string): string | null {
  const achado = item.match(/<media:content[^>]+url="([^"]+)"/i)?.[1]
    ?? item.match(/<media:thumbnail[^>]+url="([^"]+)"/i)?.[1]
    ?? item.match(/<enclosure[^>]+url="([^"]+)"[^>]*type="image/i)?.[1]
    ?? item.match(/<enclosure[^>]+type="image[^"]*"[^>]+url="([^"]+)"/i)?.[1]
    ?? item.match(/<img[^>]+src="([^"]+)"/i)?.[1]
    ?? item.match(/&lt;img[^&]+src=&quot;([^&]+)&quot;/i)?.[1]
  return achado && /^https:\/\//.test(achado) ? emTamanhoBom(achado.replace(/&amp;/g, '&')) : null
}

/* ------------------------------------------------------------ foto da matéria */

/**
 * Notícia sem foto no feed (Money Times, Exame, E-Investidor): a foto oficial
 * da matéria, a mesma do link compartilhado (og:image). Uma busca por
 * matéria, guardada para sempre (a foto de uma matéria não muda), e por trás:
 * a aba já responde sem esperar. Foto repetida em várias matérias é o logo
 * do portal, não a foto da notícia: fica de fora.
 */
const fotoDaMateria = new Map<string, string | null>()
/** As fotos que vieram da página da matéria (e não do feed): só elas passam pelo filtro de "foto repetida = logo". */
const veioDaMateria = new Set<string>()
const NAO_E_FOTO = /logo|avatar|icone|icon|favicon|autor|author|perfil|selo|banner-?app|placeholder|sprite|\.svg|\.gif/i
async function buscarFoto(link: string): Promise<string | null> {
  if (fotoDaMateria.has(link)) return fotoDaMateria.get(link) ?? null
  try {
    const r = await fetch(link, { headers: { 'user-agent': NAVEGADOR, accept: 'text/html' }, signal: AbortSignal.timeout(6000) })
    const html = (await r.text()).slice(0, 400_000)
    const og = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i)?.[1]
    // Se a foto de compartilhamento for genérica (o logo do portal), a primeira
    // foto de verdade do corpo da matéria (enviada no ano, não um ícone).
    const corpo = html.slice(html.search(/<article|<main|class=["'][^"']*(?:content|materia|post)/i) >>> 0)
    const doCorpo = [...corpo.matchAll(/<img[^>]+(?:data-src|src)=["'](https:\/\/[^"']+\.(?:jpe?g|png|webp)(?:\?[^"']*)?)["']/gi)]
      .map((m) => m[1].replace(/&amp;/g, '&')).filter((u) => !NAO_E_FOTO.test(u))
    const candidatas = [og, ...doCorpo].filter((u): u is string => !!u && /^https:\/\//.test(u) && !NAO_E_FOTO.test(u)).map(emTamanhoBom)
    const ano = new Date().getFullYear()
    // Antiga demais no caminho (/uploads/2019/...) costuma ser a imagem padrão do portal.
    const recente = candidatas.find((u) => { const a = u.match(/\/(20\d\d)\//)?.[1]; return !a || Number(a) >= ano - 1 })
    const foto = recente ?? null
    fotoDaMateria.set(link, foto)
    if (fotoDaMateria.size > 800) fotoDaMateria.delete(fotoDaMateria.keys().next().value!)
    return foto
  } catch { fotoDaMateria.set(link, null); return null }
}

/* ------------------------------------------------------------ o ícone de cada portal */

/**
 * Para a capa de notícia sem foto nenhuma: o ícone oficial do portal (o
 * apple-touch-icon da página inicial, em 180 px), lido uma vez por dia.
 */
let icones: { em: number; mapa: Record<string, string> } = { em: 0, mapa: {} }
async function atualizarIcones(): Promise<void> {
  const pares = await Promise.allSettled(FEEDS.filter((f, i, a) => a.findIndex((x) => x.fonte === f.fonte) === i).map(async (f) => {
    const html = (await buscar(f.site, 8000)).slice(0, 300_000)
    const links = [...html.matchAll(/<link[^>]+rel=["'][^"']*(?:apple-touch-icon|icon)[^"']*["'][^>]*>/gi)].map((m) => m[0])
    const melhor = links
      .map((l) => ({ href: l.match(/href=["']([^"']+)["']/i)?.[1] ?? '', tam: Number(l.match(/sizes=["'](\d+)/i)?.[1] ?? (/apple-touch/i.test(l) ? 180 : 32)) }))
      .filter((x) => x.href && !/\.svg|\.ico/i.test(x.href))
      .sort((a, b) => b.tam - a.tam)[0]
    if (!melhor || melhor.tam < 100) return null
    return [f.fonte, new URL(melhor.href.replace(/&#038;|&amp;/g, '&'), f.site).toString()] as const
  }))
  const mapa: Record<string, string> = {}
  for (const p of pares) if (p.status === 'fulfilled' && p.value) mapa[p.value[0]] = p.value[1]
  if (Object.keys(mapa).length) icones = { em: Date.now(), mapa }
}

async function completarFotos(lista: Noticia[]): Promise<void> {
  const faltam = lista.filter((n) => !n.imagem).slice(0, 30)
  for (let i = 0; i < faltam.length; i += 6) {
    await Promise.all(faltam.slice(i, i + 6).map(async (n) => { n.imagem = await buscarFoto(n.link); if (n.imagem) veioDaMateria.add(n.imagem) }))
  }
  const vezes = new Map<string, number>()
  for (const n of lista) if (n.imagem) vezes.set(n.imagem, (vezes.get(n.imagem) ?? 0) + 1)
  // O Investing repete fotos de pregão de propósito (são fotos de verdade); o
  // logo genérico só aparece nas fotos buscadas na página da matéria.
  for (const n of lista) if (n.imagem && veioDaMateria.has(n.imagem) && (vezes.get(n.imagem) ?? 0) > 1) n.imagem = null
}

const REGRAS: Array<[Categoria, RegExp]> = [
  ['cripto', /bitcoin|cripto|ethereum|\bbtc\b|blockchain/i],
  // Forex: as moedas entre si, lá fora (o dólar contra o real fica em Câmbio)
  ['forex', /forex|libra esterlina|\biene\b|franco su[íi][çc]o|yuan|d[óo]lar (australiano|canadense|neozeland[êe]s)|eur\/usd|usd\/jpy|gbp\/usd|\bdxy\b|[íi]ndice do d[óo]lar|moedas (globais|emergentes|do g10)/i],
  ['cambio', /d[óo]lar|c[âa]mbio|\beuro\b|real se|moeda/i],
  ['juros', /copom|selic|juros|infla[çc][ãa]o|ipca|banco central|\bfed\b|treasur/i],
  ['commodities', /petr[óo]leo|brent|\bouro\b|min[ée]rio|commodit|soja|caf[ée]|milho/i],
  // a bolsa americana antes da regra geral de ações
  ['eua', /^por que as a[çc][õo]es d|wall street|nasdaq|s&p ?500|dow jones|\bnyse\b|bolsas? de nova york|bolsas? americanas?|a[çc][õo]es americanas|big techs?|nvidia|apple|microsoft|tesla|alphabet|amazon|meta platforms|payroll|treasur/i],
  ['bolsa', /ibovespa|a[çc][õo]es|bolsa(?! fam)|\bb3\b|dividend/i],
  ['bolsa', /\b[A-Z]{4}\d{1,2}\b/], // código de ação: PETR4, VALE3
  ['internacional', /eua|estados unidos|china|europa|wall street|nasdaq|s&p|trump|jap[ãa]o|alemanha/i],
]
const categoriaDe = (t: string): Categoria => REGRAS.find(([, r]) => r.test(t))?.[0] ?? 'economia'

/** Fora do assunto (o G1 Economia traz de tudo): esporte, novela, foguete… */
const FORA_DO_ASSUNTO = /foguete|novela|\bbbb\b|futebol|campeonato|celebridade|hor[óo]scopo|receita de|loteria|mega-sena|quina\b|onde assistir|navegador|smartphone|iphone|celular novo|s[ée]rie da netflix|filme/i

/**
 * O assunto de cada notícia: pelo título primeiro (o resumo cita de tudo e
 * puxava "Ibovespa hoje" para os EUA), pelo resumo só se o título não disser.
 * No feed de Moedas, o que é do real fica em Câmbio e o resto é Forex; no de
 * balanços, tudo é bolsa americana.
 */
function categoriaNoFeed(titulo: string, resumo: string, assunto?: 'forex' | 'eua'): Categoria {
  const peloTitulo = categoriaDe(titulo)
  const geral = peloTitulo !== 'economia' ? peloTitulo : categoriaDe(`${titulo} ${resumo}`)
  if (assunto === 'eua') return 'eua'
  if (assunto !== 'forex' || geral === 'cripto') return geral
  return /\breal\b|R\$|ptax|d[óo]lar [àa] vista|reais/i.test(`${titulo} ${resumo}`) ? 'cambio' : 'forex'
}

function lerFeed(fonte: string, xml: string, assunto?: 'forex' | 'eua'): Noticia[] {
  const itens = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  return itens.slice(0, 40).flatMap((item) => {
    const titulo = texto(campo(item, 'title'))
    const link = texto(campo(item, 'link')) || (item.match(/<guid[^>]*>(https?:[^<]+)<\/guid>/i)?.[1] ?? '')
    // O Investing manda "2026-10-19 20:48:46" sem fuso: é UTC (conferido contra o relógio em 19/10/2026).
    const bruta = texto(campo(item, 'pubDate')) || texto(campo(item, 'dc:date'))
    const data = Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d(:\d\d)?$/.test(bruta) ? `${bruta.replace(' ', 'T')}Z` : bruta)
    if (!titulo || !/^https?:\/\//.test(link) || !Number.isFinite(data)) return []
    if (FORA_DO_ASSUNTO.test(titulo)) return []
    // O WordPress emenda "The post X appeared first on Y." no fim do resumo.
    let resumo = texto(campo(item, 'description')).replace(/\s*The post .*$/i, '').replace(/\s*O post .* apareceu primeiro em .*$/i, '')
    if (resumo.length > 230) resumo = resumo.slice(0, 220).replace(/\s+\S*$/, '') + '…'
    if (resumo.toLowerCase().startsWith(titulo.toLowerCase().slice(0, 40))) resumo = ''
    return [{ id: `${fonte}:${link}`, titulo, resumo, link, imagem: imagemDo(item), fonte, quando: new Date(data).toISOString(), categoria: categoriaNoFeed(titulo, resumo, assunto) }]
  })
}

const chaveDoTitulo = (t: string) => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').split(' ').filter((p) => p.length > 3).slice(0, 7).join(' ')

let noticias: { em: number; lista: Noticia[] } = { em: 0, lista: [] }
let buscandoNoticias: Promise<void> | null = null

async function atualizarNoticias(): Promise<void> {
  // cada feed entra com o seu limite (o Investing tem três: geral, Moedas e Ações)
  const doFeed = new Map<string, number>()
  const resultados = await Promise.allSettled(FEEDS.map(async (f, i) => lerFeed(f.fonte, await buscar(f.url), f.assunto).map((n) => { doFeed.set(n.id, i); return n })))
  const todas = resultados.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (!todas.length) return // tudo caiu: fica a última lista boa
  const limite = Date.now() - 2 * 864e5
  const vistas = new Set<string>()
  const lista = todas
    .filter((n) => Date.parse(n.quando) >= limite && Date.parse(n.quando) <= Date.now() + 5 * 60e3)
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .filter((n) => { const k = chaveDoTitulo(n.titulo); if (vistas.has(k)) return false; vistas.add(k); return true })
  // No máximo 12 por feed (ou o limite dele), para nenhum portal ocupar a página toda.
  const porFeed = new Map<number, number>()
  noticias = {
    em: Date.now(),
    lista: lista.filter((n) => {
      const i = doFeed.get(n.id) ?? -1
      const c = (porFeed.get(i) ?? 0) + 1; porFeed.set(i, c)
      return c <= (FEEDS[i]?.limite ?? 12)
    }).slice(0, 100),
  }
  void completarFotos(noticias.lista)
}

/* ------------------------------------------------------------ cotações */

const CAMBIO = [
  { par: 'USD-BRL', id: 'dolar', nome: 'Dólar' },
  { par: 'EUR-BRL', id: 'euro', nome: 'Euro' },
  { par: 'GBP-BRL', id: 'libra', nome: 'Libra' },
  { par: 'BTC-BRL', id: 'bitcoin', nome: 'Bitcoin' },
]
const BOLSAS = [
  { simbolo: '^BVSP', id: 'ibovespa', nome: 'Ibovespa', moeda: 'pts' },
  { simbolo: '^GSPC', id: 'sp500', nome: 'S&P 500', moeda: 'pts' },
  { simbolo: '^IXIC', id: 'nasdaq', nome: 'Nasdaq', moeda: 'pts' },
  { simbolo: '^DJI', id: 'dow', nome: 'Dow Jones', moeda: 'pts' },
  { simbolo: 'GC=F', id: 'ouro', nome: 'Ouro', moeda: 'US$' },
  { simbolo: 'BZ=F', id: 'brent', nome: 'Petróleo Brent', moeda: 'US$' },
  { simbolo: 'BRL=X', id: 'dolar-dia', nome: 'Dólar (dia)', moeda: 'R$' },
]

let cotacoes: { em: number; lista: Cotacao[] } = { em: 0, lista: [] }
let buscandoCotacoes: Promise<void> | null = null

async function cambio(): Promise<Cotacao[]> {
  const d = JSON.parse(await buscar(`https://economia.awesomeapi.com.br/json/last/${CAMBIO.map((c) => c.par).join(',')}`)) as Record<string, { bid: string; pctChange: string; timestamp: string }>
  return CAMBIO.flatMap((c) => {
    const v = d[c.par.replace('-', '')]
    if (!v) return []
    return [{ id: c.id, nome: c.nome, preco: Number(v.bid), variacao: Number(v.pctChange), moeda: 'R$', hora: new Date(Number(v.timestamp) * 1000).toISOString(), atrasada: false }]
  })
}

/**
 * Reserva do câmbio: a AwesomeAPI limita por endereço e devolveu 429 ao
 * servidor em 19/10/2026; o Yahoo tem os mesmos pares em reais.
 */
const CAMBIO_RESERVA = [
  { simbolo: 'BRL=X', id: 'dolar', nome: 'Dólar', moeda: 'R$' },
  { simbolo: 'EURBRL=X', id: 'euro', nome: 'Euro', moeda: 'R$' },
  { simbolo: 'GBPBRL=X', id: 'libra', nome: 'Libra', moeda: 'R$' },
  { simbolo: 'BTC-USD', id: 'bitcoin', nome: 'Bitcoin', moeda: 'US$' }, // o Yahoo não tem BTC em reais
]

async function bolsa(b: { simbolo: string; id: string; nome: string; moeda: string }): Promise<Cotacao> {
  const d = JSON.parse(await buscar(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(b.simbolo)}?range=1d&interval=15m`)) as {
    chart: { result: Array<{ meta: { regularMarketPrice: number; chartPreviousClose?: number; previousClose?: number; regularMarketTime: number }; indicators: { quote: Array<{ close: Array<number | null> }> } }> }
  }
  const r = d.chart.result[0]
  const serieBruta = (r.indicators.quote[0]?.close ?? []).filter((x): x is number => typeof x === 'number')
  // Cripto não tem "fechamento anterior" (negocia 24 h): a referência é o primeiro preço do dia.
  const fechamento = r.meta.chartPreviousClose ?? r.meta.previousClose
  const anterior = fechamento && fechamento !== r.meta.regularMarketPrice ? fechamento : (serieBruta[0] ?? r.meta.regularMarketPrice)
  const serie = serieBruta
  return {
    id: b.id, nome: b.nome, preco: r.meta.regularMarketPrice, variacao: anterior ? ((r.meta.regularMarketPrice - anterior) / anterior) * 100 : 0,
    moeda: b.moeda, hora: new Date(r.meta.regularMarketTime * 1000).toISOString(), atrasada: b.id === 'ibovespa',
    serie: serie.length > 2 ? serie.filter((_, i) => i % Math.ceil(serie.length / 32) === 0 || i === serie.length - 1) : undefined,
  }
}

async function atualizarCotacoes(): Promise<void> {
  const partes = await Promise.allSettled([cambio(), ...BOLSAS.map((b) => bolsa(b).then((c) => [c]))])
  const novas = partes.flatMap((p) => (p.status === 'fulfilled' ? p.value : []))
  if (partes[0].status === 'rejected') {
    const reserva = await Promise.allSettled(CAMBIO_RESERVA.map((b) => bolsa(b)))
    for (const r of reserva) if (r.status === 'fulfilled') novas.push(r.value)
  }
  if (!novas.length) return
  // Quem falhou agora fica com o último valor bom.
  const antigas = new Map(cotacoes.lista.map((c) => [c.id, c]))
  for (const n of novas) antigas.set(n.id, n)
  // A série do dólar vem do Yahoo; o preço, da AwesomeAPI (mais fresca).
  const dia = antigas.get('dolar-dia'), dolar = antigas.get('dolar')
  if (dia && dolar && !dolar.serie) dolar.serie = dia.serie
  if (dia && !dolar) antigas.set('dolar', { ...dia, id: 'dolar', nome: 'Dólar' })
  antigas.delete('dolar-dia')
  const ordem = ['dolar', 'ibovespa', 'euro', 'sp500', 'bitcoin', 'nasdaq', 'ouro', 'dow', 'brent', 'libra']
  cotacoes = { em: Date.now(), lista: [...antigas.values()].sort((a, b) => ordem.indexOf(a.id) - ordem.indexOf(b.id)) }
}

/* ------------------------------------------------------------ agenda econômica */

/**
 * A agenda econômica da semana (30/10/2026, Victor: "um calendário de
 * notícia, o meu jornal do dia"): o calendário público do Forex Factory, o
 * mais usado por quem opera Forex, sem chave. Ele limita os pedidos (poucos
 * por hora): guardamos por 1 hora, e depois de um "429" esperamos 30 min.
 * Os nomes chegam em inglês; os conhecidos viram português, o original fica
 * junto para quem quiser procurar.
 */
export interface Evento {
  id: string
  quando: string
  /** Moeda/região do evento (USD, EUR…); "ALL" é de todas. */
  moeda: string
  titulo: string
  original: string
  impacto: 'alto' | 'medio' | 'baixo' | 'feriado'
  previsao: string
  anterior: string
}

const NOMES_DE_EVENTO: Array<[RegExp, string]> = [
  [/^Non-Farm Employment Change$/i, 'Payroll: vagas criadas fora do campo'],
  [/^ADP Non-Farm Employment Change$/i, 'ADP: vagas no setor privado'],
  [/^Unemployment Rate$/i, 'Taxa de desemprego'],
  [/^Unemployment Claims$/i, 'Pedidos de seguro-desemprego'],
  [/^Average Hourly Earnings/i, 'Ganho médio por hora'],
  [/^JOLTS Job Openings$/i, 'JOLTS: vagas em aberto'],
  [/^Employment Change$/i, 'Variação do emprego'],
  [/^Claimant Count Change$/i, 'Pedidos de auxílio-desemprego'],
  [/^Employment Cost Index/i, 'Índice de custo do emprego'],
  [/^Core CPI Flash Estimate/i, 'Núcleo da inflação ao consumidor (prévia)'],
  [/^CPI Flash Estimate/i, 'Inflação ao consumidor (prévia)'],
  [/^(Tokyo )?Core CPI/i, 'Núcleo da inflação ao consumidor (CPI)'],
  [/^(Prelim |Flash )?CPI/i, 'Inflação ao consumidor (CPI)'],
  [/^Trimmed Mean CPI/i, 'Inflação ao consumidor, média aparada'],
  [/^Core PPI/i, 'Núcleo da inflação ao produtor (PPI)'],
  [/^PPI/i, 'Inflação ao produtor (PPI)'],
  [/^Core PCE Price Index/i, 'Núcleo do PCE (inflação preferida do Fed)'],
  [/^PCE Price Index/i, 'PCE: inflação de gastos pessoais'],
  [/^Personal Income/i, 'Renda pessoal'],
  [/^Personal Spending/i, 'Gastos pessoais'],
  [/^(Advance|Prelim|Final|Flash)? ?GDP/i, 'PIB'],
  [/^Core Retail Sales/i, 'Núcleo das vendas no varejo'],
  [/^Retail Sales/i, 'Vendas no varejo'],
  [/^Federal Funds Rate$/i, 'Decisão de juros do Fed'],
  [/^FOMC Statement$/i, 'Comunicado do Fed (FOMC)'],
  [/^FOMC Press Conference$/i, 'Entrevista do Fed após a decisão'],
  [/^FOMC Meeting Minutes$/i, 'Ata do Fed (FOMC)'],
  [/^FOMC Member (.+) Speaks$/i, 'Discurso de $1, do Fed'],
  [/^Fed Chair (.+) Speaks$/i, 'Discurso do presidente do Fed, $1'],
  [/^Fed Vice Chair.*? (\S+) Speaks$/i, 'Discurso do vice do Fed, $1'],
  [/^Main Refinancing Rate$/i, 'Decisão de juros do BCE'],
  [/^Monetary Policy Statement$/i, 'Comunicado de política monetária'],
  [/^ECB Press Conference$/i, 'Entrevista do BCE após a decisão'],
  [/^ECB President (.+) Speaks$/i, 'Discurso da presidente do BCE, $1'],
  [/^Official Bank Rate$/i, 'Decisão de juros do Banco da Inglaterra'],
  [/^BOE Gov (.+) Speaks$/i, 'Discurso do presidente do BoE, $1'],
  [/^BOJ Policy Rate$/i, 'Decisão de juros do Banco do Japão'],
  [/^BOJ Press Conference$/i, 'Entrevista do Banco do Japão'],
  [/^BOJ Gov (.+) Speaks$/i, 'Discurso do presidente do BoJ, $1'],
  [/^Cash Rate$/i, 'Decisão de juros da Austrália'],
  [/^Overnight Rate$/i, 'Decisão de juros do Canadá'],
  [/^SNB Policy Rate$/i, 'Decisão de juros da Suíça'],
  [/^Official Cash Rate$/i, 'Decisão de juros da Nova Zelândia'],
  [/^ISM Manufacturing PMI$/i, 'ISM: indústria'],
  [/^ISM Services PMI$/i, 'ISM: serviços'],
  [/^(Flash |Final )?Manufacturing PMI$/i, 'PMI da indústria'],
  [/^(Flash |Final )?Services PMI$/i, 'PMI de serviços'],
  [/^Chicago PMI$/i, 'PMI de Chicago'],
  [/^Empire State Manufacturing Index$/i, 'Indústria de Nova York (Empire State)'],
  [/^Philly Fed Manufacturing Index$/i, 'Indústria da Filadélfia (Philly Fed)'],
  [/^CB Consumer Confidence$/i, 'Confiança do consumidor (Conference Board)'],
  [/^(Prelim |Revised )?UoM Consumer Sentiment$/i, 'Sentimento do consumidor (Michigan)'],
  [/^(Prelim |Revised )?UoM Inflation Expectations$/i, 'Expectativa de inflação (Michigan)'],
  [/^Consumer Confidence$/i, 'Confiança do consumidor'],
  [/^Crude Oil Inventories$/i, 'Estoques de petróleo'],
  [/^Natural Gas Storage$/i, 'Estoques de gás natural'],
  [/^Core Durable Goods Orders/i, 'Núcleo das encomendas de bens duráveis'],
  [/^Durable Goods Orders/i, 'Encomendas de bens duráveis'],
  [/^Industrial Production/i, 'Produção industrial'],
  [/^Factory Orders/i, 'Encomendas à indústria'],
  [/^Building Permits/i, 'Licenças de construção'],
  [/^Housing Starts/i, 'Construção de casas iniciadas'],
  [/^New Home Sales/i, 'Venda de casas novas'],
  [/^Existing Home Sales/i, 'Venda de casas usadas'],
  [/^Pending Home Sales/i, 'Vendas pendentes de casas'],
  [/^Trade Balance$/i, 'Balança comercial'],
  [/^Current Account$/i, 'Conta corrente'],
  [/^Import Prices/i, 'Preços de importação'],
  [/^Federal Budget Balance$/i, 'Resultado do orçamento federal'],
  [/^Beige Book$/i, 'Livro Bege do Fed'],
  [/^(\d+)-y Bond Auction$/i, 'Leilão de títulos de $1 anos'],
  [/^Bank Holiday$/i, 'Feriado bancário'],
  [/^German ifo Business Climate$/i, 'Clima de negócios na Alemanha (ifo)'],
  [/^German ZEW Economic Sentiment$/i, 'Sentimento econômico na Alemanha (ZEW)'],
  [/^Wholesale Inventories/i, 'Estoques no atacado'],
  [/^Business Inventories/i, 'Estoques das empresas'],
  [/^Treasury Currency Report$/i, 'Relatório de câmbio do Tesouro dos EUA'],
  [/^Unemployment Change$/i, 'Variação do desemprego'],
  [/^CB Leading Index$/i, 'Indicador antecedente (Conference Board)'],
  [/^Leading Index$/i, 'Indicador antecedente'],
  [/^ADP Weekly Employment Change$/i, 'ADP: emprego privado na semana'],
  [/^ANZ Business Confidence$/i, 'Confiança empresarial (ANZ)'],
  [/^API Weekly Statistical Bulletin$/i, 'Estoques de petróleo (API)'],
  [/^Annual Budget Release$/i, 'Orçamento anual do governo'],
  [/^Autumn Forecast Statement$/i, 'Orçamento de outono do governo'],
  [/^BOC Monetary Policy Report$/i, 'Relatório de política monetária do Canadá'],
  [/^BOC Press Conference$/i, 'Entrevista do Banco do Canadá'],
  [/^BOC Rate Statement$/i, 'Comunicado de juros do Canadá'],
  [/^BOJ Core CPI$/i, 'Núcleo da inflação do Banco do Japão'],
  [/^BOJ Outlook Report$/i, 'Relatório de perspectivas do Banco do Japão'],
  [/^BRC Shop Price Index$/i, 'Preços no varejo (BRC)'],
  [/^CBI Realized Sales$/i, 'Vendas realizadas (CBI)'],
  [/^Consumer Spending$/i, 'Gastos do consumidor'],
  [/^Private Payrolls$/i, 'Emprego no setor privado'],
  [/^GfK Consumer Climate$/i, 'Clima do consumidor (GfK)'],
  [/^Goods Trade Balance$/i, 'Balança comercial de bens'],
  [/^(Nationwide |S&P\/CS Composite-20 )?HPI$/i, 'Preço dos imóveis'],
  [/^Monthly Unemployment Rate$/i, 'Taxa de desemprego'],
  [/^KOF Economic Barometer$/i, 'Barômetro econômico (KOF)'],
  [/^M(\d) Money Supply$/i, 'Oferta de moeda M$1'],
  [/^Mortgage Approvals$/i, 'Financiamentos imobiliários aprovados'],
  [/^Net Lending to Individuals$/i, 'Crédito às pessoas'],
  [/^Non-Manufacturing PMI$/i, 'PMI de serviços (fora da indústria)'],
  [/^Private Loans$/i, 'Empréstimos privados'],
  [/^Private Sector Credit$/i, 'Crédito ao setor privado'],
  [/^RBNZ Press Conference$/i, 'Entrevista do banco central da Nova Zelândia'],
  [/^RBNZ Rate Statement$/i, 'Comunicado de juros da Nova Zelândia'],
  [/^Richmond Manufacturing Index$/i, 'Indústria de Richmond'],
  [/^SPPI$/i, 'Preços de serviços às empresas (SPPI)'],
  [/^UBS Economic Expectations$/i, 'Expectativas econômicas (UBS)'],
  // qualquer outro discurso: "Discurso: RBA Assist Gov Jones"
  [/^(.+) Speaks$/i, 'Discurso: $1'],
]
const PAISES_DO_TITULO: Array<[RegExp, string]> = [[/^Tokyo /i, 'Tóquio'], [/^German /i, 'Alemanha'], [/^French /i, 'França'], [/^Italian /i, 'Itália'], [/^Spanish /i, 'Espanha'], [/^Chinese /i, 'China']]

export function emPortugues(original: string): string {
  let t = original.trim(), pais = ''
  for (const [re, nome] of PAISES_DO_TITULO) if (re.test(t) && !/^German (ifo|ZEW)/i.test(t)) { pais = nome; t = t.replace(re, ''); break }
  const periodo = /\sm\/m$/i.test(t) ? ' · no mês' : /\sy\/y$/i.test(t) ? ' · em 12 meses' : /\sq\/q$/i.test(t) ? ' · no trimestre' : ''
  // "Prelim", "Flash", "Final"… dizem a versão do número, não o que ele é
  const base = t.replace(/\s[myq]\/[myq]$/i, '').replace(/^(?:(?:Prelim|Flash|Final|Revised|Advance)\s+)+(?!GDP)/i, '')
  const achado = NOMES_DE_EVENTO.find(([re]) => re.test(base))
  if (!achado) return original
  const nome = base.replace(achado[0], achado[1])
  return `${pais ? `${pais}: ` : ''}${nome}${periodo}`
}

let agenda: { em: number; lista: Evento[]; esperarAte: number } = { em: 0, lista: [], esperarAte: 0 }
let buscandoAgenda: Promise<void> | null = null
async function atualizarAgenda(): Promise<void> {
  if (Date.now() < agenda.esperarAte) return
  const r = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', { headers: { 'user-agent': NAVEGADOR, accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
  if (r.status === 429) { agenda.esperarAte = Date.now() + 30 * 60e3; return }
  if (!r.ok) throw new Error(`${r.status} na agenda`)
  const d = (await r.json()) as Array<{ title: string; country: string; date: string; impact: string; forecast?: string; previous?: string }>
  const IMPACTO: Record<string, Evento['impacto']> = { High: 'alto', Medium: 'medio', Low: 'baixo', Holiday: 'feriado' }
  const lista = d.flatMap((e, i) => {
    const quando = Date.parse(e.date)
    if (!Number.isFinite(quando) || !e.title) return []
    return [{ id: `${quando}:${e.country}:${i}`, quando: new Date(quando).toISOString(), moeda: e.country, titulo: emPortugues(e.title), original: e.title, impacto: IMPACTO[e.impact] ?? 'baixo', previsao: e.forecast ?? '', anterior: e.previous ?? '' }]
  }).sort((a, b) => Date.parse(a.quando) - Date.parse(b.quando))
  if (lista.length) agenda = { em: Date.now(), lista, esperarAte: 0 }
}

/** O que a aba precisa, guardado; só busca de novo quando venceu. */
export async function mercado(): Promise<{ cotacoes: Cotacao[]; noticias: Noticia[]; portais: Record<string, string>; agenda: Evento[]; atualizadoEm: string }> {
  const agora = Date.now()
  if (agora - icones.em > 864e5) void atualizarIcones().catch(() => undefined)
  const vencidas: Promise<void>[] = []
  if (agora - noticias.em > 5 * 60e3) vencidas.push(buscandoNoticias ??= atualizarNoticias().catch(() => undefined).finally(() => { buscandoNoticias = null }))
  // a agenda nunca segura a resposta: vem por trás e aparece na leitura seguinte
  if (agora - agenda.em > 60 * 60e3 && !buscandoAgenda) buscandoAgenda = atualizarAgenda().catch(() => undefined).finally(() => { buscandoAgenda = null })
  if (agora - cotacoes.em > 45e3) vencidas.push(buscandoCotacoes ??= atualizarCotacoes().catch(() => undefined).finally(() => { buscandoCotacoes = null }))
  // Primeira vez: espera. Depois: responde na hora com o guardado e atualiza por trás.
  if (!noticias.lista.length || !cotacoes.lista.length) await Promise.all(vencidas)
  return { cotacoes: cotacoes.lista, noticias: noticias.lista, portais: icones.mapa, agenda: agenda.lista, atualizadoEm: new Date(Math.max(noticias.em, cotacoes.em) || agora).toISOString() }
}
