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
export type Categoria = 'bolsa' | 'cambio' | 'juros' | 'internacional' | 'cripto' | 'commodities' | 'economia'

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

const FEEDS: Array<{ fonte: string; url: string }> = [
  { fonte: 'InfoMoney', url: 'https://www.infomoney.com.br/feed/' },
  { fonte: 'Money Times', url: 'https://www.moneytimes.com.br/feed/' },
  { fonte: 'Exame', url: 'https://exame.com/feed/' },
  { fonte: 'Valor Investe', url: 'https://valorinveste.globo.com/rss/valorinveste/' },
  { fonte: 'G1 Economia', url: 'https://g1.globo.com/rss/g1/economia/' },
  { fonte: 'Investing.com', url: 'https://br.investing.com/rss/news.rss' },
  { fonte: 'Seu Dinheiro', url: 'https://www.seudinheiro.com/feed/' },
  { fonte: 'E-Investidor', url: 'https://einvestidor.estadao.com.br/feed/' },
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
async function buscarFoto(link: string): Promise<string | null> {
  if (fotoDaMateria.has(link)) return fotoDaMateria.get(link) ?? null
  try {
    const r = await fetch(link, { headers: { 'user-agent': NAVEGADOR, accept: 'text/html' }, signal: AbortSignal.timeout(6000) })
    const html = (await r.text()).slice(0, 200_000)
    const og = html.match(/<meta[^>]+(?:property|name)=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
      ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:image["']/i)?.[1]
    const foto = og && /^https:\/\//.test(og) ? emTamanhoBom(og.replace(/&amp;/g, '&')) : null
    fotoDaMateria.set(link, foto)
    if (fotoDaMateria.size > 800) fotoDaMateria.delete(fotoDaMateria.keys().next().value!)
    return foto
  } catch { fotoDaMateria.set(link, null); return null }
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
  ['cambio', /d[óo]lar|c[âa]mbio|\beuro\b|real se|moeda/i],
  ['juros', /copom|selic|juros|infla[çc][ãa]o|ipca|banco central|\bfed\b|treasur/i],
  ['commodities', /petr[óo]leo|brent|\bouro\b|min[ée]rio|commodit|soja|caf[ée]|milho/i],
  ['bolsa', /ibovespa|a[çc][õo]es|bolsa(?! fam)|\bb3\b|dividend/i],
  ['bolsa', /\b[A-Z]{4}\d{1,2}\b/], // código de ação: PETR4, VALE3
  ['internacional', /eua|estados unidos|china|europa|wall street|nasdaq|s&p|trump|jap[ãa]o|alemanha/i],
]
const categoriaDe = (t: string): Categoria => REGRAS.find(([, r]) => r.test(t))?.[0] ?? 'economia'

/** Fora do assunto (o G1 Economia traz de tudo): esporte, novela, foguete… */
const FORA_DO_ASSUNTO = /foguete|novela|\bbbb\b|futebol|campeonato|celebridade|hor[óo]scopo|receita de|loteria|mega-sena|quina\b|onde assistir|navegador|smartphone|iphone|celular novo|s[ée]rie da netflix|filme/i

function lerFeed(fonte: string, xml: string): Noticia[] {
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
    return [{ id: `${fonte}:${link}`, titulo, resumo, link, imagem: imagemDo(item), fonte, quando: new Date(data).toISOString(), categoria: categoriaDe(`${titulo} ${resumo}`) }]
  })
}

const chaveDoTitulo = (t: string) => t.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').split(' ').filter((p) => p.length > 3).slice(0, 7).join(' ')

let noticias: { em: number; lista: Noticia[] } = { em: 0, lista: [] }
let buscandoNoticias: Promise<void> | null = null

async function atualizarNoticias(): Promise<void> {
  const resultados = await Promise.allSettled(FEEDS.map(async (f) => lerFeed(f.fonte, await buscar(f.url))))
  const todas = resultados.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  if (!todas.length) return // tudo caiu: fica a última lista boa
  const limite = Date.now() - 2 * 864e5
  const vistas = new Set<string>()
  const lista = todas
    .filter((n) => Date.parse(n.quando) >= limite && Date.parse(n.quando) <= Date.now() + 5 * 60e3)
    .sort((a, b) => Date.parse(b.quando) - Date.parse(a.quando))
    .filter((n) => { const k = chaveDoTitulo(n.titulo); if (vistas.has(k)) return false; vistas.add(k); return true })
  // No máximo 12 por fonte, para nenhum portal ocupar a página toda.
  const porFonte = new Map<string, number>()
  noticias = {
    em: Date.now(),
    lista: lista.filter((n) => { const c = (porFonte.get(n.fonte) ?? 0) + 1; porFonte.set(n.fonte, c); return c <= 12 }).slice(0, 72),
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

/** O que a aba precisa, guardado; só busca de novo quando venceu. */
export async function mercado(): Promise<{ cotacoes: Cotacao[]; noticias: Noticia[]; atualizadoEm: string }> {
  const agora = Date.now()
  const vencidas: Promise<void>[] = []
  if (agora - noticias.em > 5 * 60e3) vencidas.push(buscandoNoticias ??= atualizarNoticias().catch(() => undefined).finally(() => { buscandoNoticias = null }))
  if (agora - cotacoes.em > 45e3) vencidas.push(buscandoCotacoes ??= atualizarCotacoes().catch(() => undefined).finally(() => { buscandoCotacoes = null }))
  // Primeira vez: espera. Depois: responde na hora com o guardado e atualiza por trás.
  if (!noticias.lista.length || !cotacoes.lista.length) await Promise.all(vencidas)
  return { cotacoes: cotacoes.lista, noticias: noticias.lista, atualizadoEm: new Date(Math.max(noticias.em, cotacoes.em) || agora).toISOString() }
}
