/**
 * Os indicadores do gráfico profissional (19/10/2026, GlobalFly).
 *
 * A Deriv só manda preço (velas e ticks); todo indicador é calculado aqui, no
 * navegador. A base é a KLineChart (Apache 2.0): 27 indicadores prontos, dos
 * quais usamos os que fazem sentido sem volume (os sintéticos da Deriv não
 * têm volume). Os que não vêm prontos (Donchian, Keltner, ATR, Ichimoku,
 * Aroon, Estocástico clássico, RSI Estocástico, Momentum Estocástico, DPO,
 * médias ponderada e Hull) são escritos abaixo com `registerIndicator`.
 *
 * O catálogo diz, para cada um: nome em português, categoria (as do DTrader),
 * onde aparece (sobre as velas ou num painel próprio) e os parâmetros que a
 * pessoa pode mudar.
 */
import { registerIndicator, type IndicatorTemplate, type KLineData } from 'klinecharts'
import { MARCA } from '../../marca'

export type Categoria = 'sinal' | 'momentum' | 'tendencia' | 'volatilidade' | 'medias' | 'outros'
export const CATEGORIAS: Array<{ id: Categoria; nome: string }> = [
  { id: 'sinal', nome: 'Sinal GF' },
  { id: 'momentum', nome: 'Momentum' },
  { id: 'tendencia', nome: 'Tendência' },
  { id: 'volatilidade', nome: 'Volatilidade' },
  { id: 'medias', nome: 'Médias móveis' },
  { id: 'outros', nome: 'Outros' },
]

export interface Parametro { rotulo: string; padrao: number; min: number; max: number; passo?: number }

export interface DefinicaoIndicador {
  /** Nome do indicador na KLineChart (os nossos começam com GF_). */
  id: string
  nome: string
  sigla: string
  categoria: Categoria
  descricao: string
  /** 'principal' = sobre as velas; 'proprio' = painel separado embaixo. */
  painel: 'principal' | 'proprio'
  parametros: Parametro[]
  /** Aceita vários períodos de uma vez (ex.: médias 9, 21 e 200). */
  varios?: boolean
}

const P = (rotulo: string, padrao: number, min = 1, max = 500, passo = 1): Parametro => ({ rotulo, padrao, min, max, passo })

export const CATALOGO: DefinicaoIndicador[] = [
  // ------------------------------------------------------------ o sinal da casa
  { id: 'GF_SINAL', nome: 'Sinal GF', sigla: 'Sinal GF', categoria: 'sinal', painel: 'principal', descricao: 'Faixas de volatilidade com setas de Subir e Descer quando a vela fecha virando na faixa. A contagem na barra mostra quando a vela fecha.', parametros: [P('Período', 20, 5, 100), P('Desvios', 1.8, 1, 4, 0.1), P('Velas entre sinais', 3, 1, 20)] },
  // ------------------------------------------------------------ momentum
  { id: 'MACD', nome: 'MACD', sigla: 'MACD', categoria: 'momentum', painel: 'proprio', descricao: 'Convergência e divergência de médias: linha MACD, linha de sinal e histograma.', parametros: [P('Média rápida', 12), P('Média lenta', 26), P('Sinal', 9)] },
  { id: 'RSI', nome: 'Índice de Força Relativa (RSI)', sigla: 'RSI', categoria: 'momentum', painel: 'proprio', descricao: 'Força dos movimentos de alta contra os de baixa, de 0 a 100 (método de Wilder).', parametros: [P('Período', 14, 2)], varios: true },
  { id: 'GF_ESTOCASTICO', nome: 'Oscilador Estocástico', sigla: 'Estocástico', categoria: 'momentum', painel: 'proprio', descricao: 'Onde o fechamento está dentro da faixa recente, de 0 a 100 (%K e %D).', parametros: [P('Período %K', 14, 2), P('Suavização %K', 3), P('Período %D', 3)] },
  { id: 'GF_RSI_ESTOCASTICO', nome: 'RSI Estocástico', sigla: 'RSI Estoc.', categoria: 'momentum', painel: 'proprio', descricao: 'O estocástico aplicado ao RSI: mais sensível a viradas.', parametros: [P('Período do RSI', 14, 2), P('Período estocástico', 14, 2), P('Suavização %K', 3), P('Período %D', 3)] },
  { id: 'GF_SMI', nome: 'Índice Momentum Estocástico', sigla: 'SMI', categoria: 'momentum', painel: 'proprio', descricao: 'Distância do fechamento ao meio da faixa recente, suavizada duas vezes.', parametros: [P('Período', 10, 2), P('Suavização', 3), P('Sinal', 3)] },
  { id: 'AO', nome: 'Oscilador Awesome', sigla: 'AO', categoria: 'momentum', painel: 'proprio', descricao: 'Diferença entre médias curta e longa do preço médio, em histograma.', parametros: [P('Média curta', 5), P('Média longa', 34)] },
  { id: 'GF_DPO', nome: 'Oscilador de Preço Detrended', sigla: 'DPO', categoria: 'momentum', painel: 'proprio', descricao: 'Tira a tendência do preço para mostrar os ciclos.', parametros: [P('Período', 20, 2)] },
  { id: 'ROC', nome: 'Taxa de variação de preço', sigla: 'ROC', categoria: 'momentum', painel: 'proprio', descricao: 'Variação percentual do preço em relação a N velas atrás.', parametros: [P('Período', 12), P('Média', 6)] },
  { id: 'MTM', nome: 'Momentum', sigla: 'MTM', categoria: 'momentum', painel: 'proprio', descricao: 'Diferença entre o preço atual e o de N velas atrás.', parametros: [P('Período', 12), P('Média', 6)] },
  { id: 'WR', nome: 'Williams %R', sigla: '%R', categoria: 'momentum', painel: 'proprio', descricao: 'Posição do fechamento na faixa recente, de 0 a -100.', parametros: [P('Período', 14, 2)], varios: true },
  { id: 'CCI', nome: 'Índice de Canal de Commodities', sigla: 'CCI', categoria: 'momentum', painel: 'proprio', descricao: 'Distância do preço à sua média, medida pelo desvio médio.', parametros: [P('Período', 20, 2)] },
  { id: 'KDJ', nome: 'KDJ', sigla: 'KDJ', categoria: 'momentum', painel: 'proprio', descricao: 'Variação do estocástico com a linha J, que antecipa os cruzamentos.', parametros: [P('Período', 9, 2), P('Suavização K', 3), P('Suavização D', 3)] },
  { id: 'BIAS', nome: 'Desvio da média (BIAS)', sigla: 'BIAS', categoria: 'momentum', painel: 'proprio', descricao: 'Quanto o preço está acima ou abaixo da média, em %.', parametros: [P('Período', 20, 2)], varios: true },
  { id: 'PSY', nome: 'Linha psicológica', sigla: 'PSY', categoria: 'momentum', painel: 'proprio', descricao: 'Percentual de velas de alta nas últimas N.', parametros: [P('Período', 12), P('Média', 6)] },
  // ------------------------------------------------------------ tendência
  { id: 'SAR', nome: 'SAR Parabólico', sigla: 'SAR', categoria: 'tendencia', painel: 'principal', descricao: 'Pontos que acompanham a tendência e mudam de lado na virada.', parametros: [P('Aceleração inicial', 2, 1, 20), P('Passo', 2, 1, 20), P('Aceleração máxima', 20, 1, 50)] },
  { id: 'GF_ICHIMOKU', nome: 'Nuvem de Ichimoku', sigla: 'Ichimoku', categoria: 'tendencia', painel: 'principal', descricao: 'Linhas de conversão e base com a nuvem de suporte e resistência.', parametros: [P('Conversão', 9), P('Base', 26), P('Nuvem', 52)] },
  { id: 'DMI', nome: 'DMI / ADX', sigla: 'DMI', categoria: 'tendencia', painel: 'proprio', descricao: 'Força da tendência (ADX) e qual lado domina (+DI e -DI).', parametros: [P('Período', 14, 2), P('Média do ADX', 6)] },
  { id: 'GF_AROON', nome: 'Aroon', sigla: 'Aroon', categoria: 'tendencia', painel: 'proprio', descricao: 'Há quanto tempo foi a máxima e a mínima do período.', parametros: [P('Período', 25, 2)] },
  { id: 'TRIX', nome: 'TRIX', sigla: 'TRIX', categoria: 'tendencia', painel: 'proprio', descricao: 'Variação de uma média exponencial tripla: filtra o ruído.', parametros: [P('Período', 12, 2), P('Sinal', 9)] },
  { id: 'DMA', nome: 'Diferença de médias (DMA)', sigla: 'DMA', categoria: 'tendencia', painel: 'proprio', descricao: 'Diferença entre média curta e longa, com a sua média.', parametros: [P('Curta', 10), P('Longa', 50), P('Média', 10)] },
  { id: 'BBI', nome: 'Índice touro e urso (BBI)', sigla: 'BBI', categoria: 'tendencia', painel: 'principal', descricao: 'Média de quatro médias móveis: um filtro de tendência.', parametros: [P('Média 1', 3), P('Média 2', 6), P('Média 3', 12), P('Média 4', 24)] },
  // ------------------------------------------------------------ volatilidade
  { id: 'BOLL', nome: 'Bandas de Bollinger', sigla: 'Bollinger', categoria: 'volatilidade', painel: 'principal', descricao: 'Média com bandas a N desvios-padrão: abrem com a volatilidade.', parametros: [P('Período', 20, 2), P('Desvios', 2, 1, 5)] },
  { id: 'GF_DONCHIAN', nome: 'Canal Donchian', sigla: 'Donchian', categoria: 'volatilidade', painel: 'principal', descricao: 'Faixa entre a máxima e a mínima das últimas N velas.', parametros: [P('Período', 20, 2)] },
  { id: 'GF_KELTNER', nome: 'Canal de Keltner', sigla: 'Keltner', categoria: 'volatilidade', painel: 'principal', descricao: 'Média exponencial com bandas pela volatilidade média (ATR).', parametros: [P('Período', 20, 2), P('Multiplicador', 2, 1, 5), P('Período do ATR', 10, 2)] },
  { id: 'GF_ATR', nome: 'Amplitude média (ATR)', sigla: 'ATR', categoria: 'volatilidade', painel: 'proprio', descricao: 'Tamanho médio das velas: quanto o preço anda.', parametros: [P('Período', 14, 2)] },
  // ------------------------------------------------------------ médias
  { id: 'MA', nome: 'Média móvel simples', sigla: 'MA', categoria: 'medias', painel: 'principal', descricao: 'Média dos últimos N fechamentos.', parametros: [P('Período', 20, 2)], varios: true },
  { id: 'EMA', nome: 'Média móvel exponencial', sigla: 'EMA', categoria: 'medias', painel: 'principal', descricao: 'Média que dá mais peso aos fechamentos recentes.', parametros: [P('Período', 50, 2)], varios: true },
  { id: 'GF_WMA', nome: 'Média móvel ponderada', sigla: 'WMA', categoria: 'medias', painel: 'principal', descricao: 'Peso crescente: a vela mais recente vale mais.', parametros: [P('Período', 20, 2)], varios: true },
  { id: 'GF_HMA', nome: 'Média móvel Hull', sigla: 'HMA', categoria: 'medias', painel: 'principal', descricao: 'Média rápida com pouco atraso, de Alan Hull.', parametros: [P('Período', 20, 2)], varios: true },
  { id: 'SMA', nome: 'Média móvel suavizada', sigla: 'SMMA', categoria: 'medias', painel: 'principal', descricao: 'Média que reage devagar: boa para tendências longas.', parametros: [P('Período', 12, 2), P('Peso', 2, 1, 50)] },
  // ------------------------------------------------------------ outros
  { id: 'BRAR', nome: 'Popularidade e vontade (BRAR)', sigla: 'BRAR', categoria: 'outros', painel: 'proprio', descricao: 'Força de compra contra venda pelas aberturas e fechamentos.', parametros: [P('Período', 26, 2)] },
  { id: 'CR', nome: 'Energia (CR)', sigla: 'CR', categoria: 'outros', painel: 'proprio', descricao: 'Força dos compradores em relação ao preço médio anterior.', parametros: [P('Período', 26, 2), P('Média 1', 10), P('Média 2', 20), P('Média 3', 40), P('Média 4', 60)] },
]

export const definicao = (id: string) => CATALOGO.find((d) => d.id === id)

/* ====================================================== contas de apoio */

const media = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length
function mediaMovel(valores: Array<number | undefined>, n: number): Array<number | undefined> {
  const saida: Array<number | undefined> = []
  for (let i = 0; i < valores.length; i++) {
    if (i < n - 1) { saida.push(undefined); continue }
    const janela = valores.slice(i - n + 1, i + 1)
    saida.push(janela.some((x) => x === undefined) ? undefined : media(janela as number[]))
  }
  return saida
}
function exponencial(valores: Array<number | undefined>, n: number): Array<number | undefined> {
  const k = 2 / (n + 1); let atual: number | undefined; let soma = 0; let cont = 0
  return valores.map((v) => {
    if (v === undefined) return undefined
    if (atual === undefined) { soma += v; cont++; if (cont < n) return undefined; atual = soma / n; return atual }
    atual = v * k + atual * (1 - k)
    return atual
  })
}
function ponderada(valores: Array<number | undefined>, n: number): Array<number | undefined> {
  const den = (n * (n + 1)) / 2
  return valores.map((_, i) => {
    if (i < n - 1) return undefined
    let s = 0
    for (let j = 0; j < n; j++) { const v = valores[i - n + 1 + j]; if (v === undefined) return undefined; s += v * (j + 1) }
    return s / den
  })
}
const maxima = (d: KLineData[], i: number, n: number) => Math.max(...d.slice(Math.max(0, i - n + 1), i + 1).map((k) => k.high))
const minima = (d: KLineData[], i: number, n: number) => Math.min(...d.slice(Math.max(0, i - n + 1), i + 1).map((k) => k.low))
function amplitudeVerdadeira(d: KLineData[]): number[] {
  return d.map((k, i) => i === 0 ? k.high - k.low : Math.max(k.high - k.low, Math.abs(k.high - d[i - 1].close), Math.abs(k.low - d[i - 1].close)))
}
function atrWilder(d: KLineData[], n: number): Array<number | undefined> {
  const tr = amplitudeVerdadeira(d); let atual: number | undefined
  return tr.map((v, i) => {
    if (i < n - 1) return undefined
    atual = atual === undefined ? media(tr.slice(0, n)) : (atual * (n - 1) + v) / n
    return atual
  })
}
function rsiWilder(fech: number[], n: number): Array<number | undefined> {
  let g = 0, p = 0
  return fech.map((c, i) => {
    if (i === 0) return undefined
    const d = c - fech[i - 1], ganho = Math.max(d, 0), perda = Math.max(-d, 0)
    if (i <= n) { g += ganho; p += perda; if (i < n) return undefined; g /= n; p /= n }
    else { g = (g * (n - 1) + ganho) / n; p = (p * (n - 1) + perda) / n }
    return p === 0 ? 100 : 100 - 100 / (1 + g / p)
  })
}
const linhas = (chaves: Array<[string, string]>) => chaves.map(([key, title]) => ({ key, title, type: 'line' }))
const variosPeriodos = (sigla: string) => (params: unknown[]) => params.map((p, i) => ({ key: `v${i}`, title: `${sigla}${String(p)}: `, type: 'line' }))

/* ============================================== indicadores escritos aqui */

/** Pinta a faixa entre duas séries (Donchian, Keltner, nuvem do Ichimoku). */
function faixa(chaveA: string, chaveB: string, cor: (r: Record<string, number | undefined>) => string) {
  return ({ ctx, chart, indicator, xAxis, yAxis }: Parameters<NonNullable<IndicatorTemplate['draw']>>[0]) => {
    const { from, to } = chart.getVisibleRange()
    const r = indicator.result as Array<Record<string, number | undefined>>
    let inicio = -1
    const fechar = (fim: number) => {
      if (inicio < 0 || fim <= inicio) { inicio = -1; return }
      ctx.beginPath()
      for (let i = inicio; i <= fim; i++) { const x = xAxis.convertToPixel(i), y = yAxis.convertToPixel(r[i][chaveA]!); if (i === inicio) ctx.moveTo(x, y); else ctx.lineTo(x, y) }
      for (let i = fim; i >= inicio; i--) ctx.lineTo(xAxis.convertToPixel(i), yAxis.convertToPixel(r[i][chaveB]!))
      ctx.closePath(); ctx.fillStyle = cor(r[fim]); ctx.fill(); inicio = -1
    }
    for (let i = Math.max(0, from - 1); i < Math.min(r.length, to + 1); i++) {
      const ok = r[i]?.[chaveA] !== undefined && r[i]?.[chaveB] !== undefined
      if (ok && inicio < 0) inicio = i
      if (!ok && inicio >= 0) fechar(i - 1)
    }
    if (inicio >= 0) fechar(Math.min(r.length, to + 1) - 1)
    return false // e as linhas de sempre por cima
  }
}


/* ====================================================== o Sinal GF
 *
 * 23/10/2026. As faixas são as de Bollinger (média de N fechamentos ± K
 * desvios). Sinal de Descer: a vela tocou a faixa de cima e fechou em queda;
 * de Subir: tocou a de baixo e fechou em alta. (No indicador fica Subir/Descer,
 * pedido do Tiago em 27/10/2026; nos botões e nas operações é Comprar/Vender.) Entre dois sinais passam pelo
 * menos M velas.
 *
 * A regra de honestidade: cada seta usa só as velas fechadas até ela. A vela
 * que ainda está se formando nunca gera seta (senão a seta apareceria e
 * sumiria). As setas não mostram o resultado e não há placar (Tiago,
 * 23/10/2026, com o sinal liberado só para a equipe).
 * ================================================================== */
export interface PontoSinal { up?: number; mid?: number; dn?: number; sinal?: 1 | -1 }

export function calcularSinal(d: KLineData[], n: number, k: number, espera: number): PontoSinal[] {
  const fech = d.map((v) => v.close)
  const saida: PontoSinal[] = d.map(() => ({}))
  let ultimo = -Infinity
  for (let i = n - 1; i < d.length; i++) {
    const janela = fech.slice(i - n + 1, i + 1), m = media(janela)
    const desvio = Math.sqrt(janela.reduce((a, b) => a + (b - m) ** 2, 0) / n)
    const p = saida[i]
    p.mid = m; p.up = m + k * desvio; p.dn = m - k * desvio
    const fechada = i < d.length - 1
    if (!fechada || i - ultimo < espera) continue
    const v = d[i]
    if (v.high >= p.up && v.close < v.open) p.sinal = -1
    else if (v.low <= p.dn && v.close > v.open) p.sinal = 1
    if (p.sinal) ultimo = i
  }
  return saida
}

const base = import.meta.env.BASE_URL
const monogramas: Record<'escuro' | 'claro', HTMLImageElement | null> = { escuro: null, claro: null }
const aoCarregar = new Set<() => void>()
/** Avisa quando o monograma das setas termina de carregar (para o gráfico redesenhar). Devolve o cancelamento. */
export function quandoMonogramaCarregar(fn: () => void): () => void { aoCarregar.add(fn); return () => { aoCarregar.delete(fn) } }
function monograma(tema: 'escuro' | 'claro'): HTMLImageElement | null {
  const arquivo = MARCA.monogramaRecorte?.[tema]
  if (!arquivo || typeof Image === 'undefined') return null
  if (!monogramas[tema]) {
    const img = new Image()
    // o gráfico desenha antes da imagem chegar: quando ela chega, ele redesenha
    img.onload = () => aoCarregar.forEach((fn) => fn())
    img.src = `${base}${arquivo}`
    monogramas[tema] = img
  }
  const img = monogramas[tema]!
  return img.complete && img.naturalWidth > 0 ? img : null
}

const corDoTema = (nome: string, padrao: string) => (typeof document === 'undefined' ? padrao : getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao)

function desenharSinal(params: Parameters<NonNullable<IndicatorTemplate['draw']>>[0]): boolean {
  const { ctx, chart, indicator, xAxis, yAxis } = params
  faixa('up', 'mid', () => 'rgba(255, 59, 71, .07)')(params)
  faixa('mid', 'dn', () => 'rgba(34, 214, 106, .06)')(params)
  const r = indicator.result as PontoSinal[]
  const dados = chart.getDataList()
  const { from, to } = chart.getVisibleRange()
  const escuro = typeof document !== 'undefined' && document.documentElement.dataset.tema === 'escuro'
  const img = monograma(escuro ? 'escuro' : 'claro')
  const sobe = corDoTema('--up', '#22D66A'), desce = corDoTema('--down', '#FF3B47')
  const fonte = typeof document !== 'undefined' ? getComputedStyle(document.body).fontFamily : 'sans-serif'
  const lw = 24, lh = Math.round(lw * 96 / 166)
  // a seta fica afastada da vela (AFASTAR px depois do pavio), ligada a ela por um fio pontilhado
  const AFASTAR = 16, SETA = 7, ETIQUETA = 19
  ctx.save()
  // o klinecharts deixa o tracejado da linha de preço ligado no pincel: aqui tudo é traço contínuo
  ctx.setLineDash([])
  ctx.lineCap = 'round'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 11px ${fonte}`
  const etiqueta = (x: number, meio: number, texto: string, cor: string) => {
    const largura = Math.ceil(ctx.measureText(texto).width) + 16
    const caixa = new Path2D()
    caixa.roundRect(x - largura / 2, meio - ETIQUETA / 2, largura, ETIQUETA, ETIQUETA / 2)
    ctx.fillStyle = escuro ? '#051528' : '#FFFFFF'; ctx.fill(caixa)
    ctx.globalAlpha = escuro ? .2 : .1; ctx.fillStyle = cor; ctx.fill(caixa); ctx.globalAlpha = 1
    ctx.strokeStyle = cor; ctx.lineWidth = 1; ctx.stroke(caixa)
    ctx.fillStyle = cor; ctx.fillText(texto, x, meio + .5)
  }
  // o fio entre a vela e a seta: traço fino e contínuo, suave, com um pontinho marcando o pavio
  const fio = (x: number, de: number, ate: number, cor: string) => {
    ctx.save()
    ctx.globalAlpha = .45; ctx.strokeStyle = cor; ctx.lineWidth = 1
    ctx.beginPath(); ctx.moveTo(x, de); ctx.lineTo(x, ate); ctx.stroke()
    ctx.globalAlpha = 1; ctx.fillStyle = cor
    ctx.beginPath(); ctx.arc(x, de, 1.8, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
  // dois sinais do mesmo lado muito perto: o segundo se afasta mais um degrau para não encavalar
  const ultimoX = { s: -Infinity, d: -Infinity }, degrau = { s: 0, d: 0 }
  for (let i = Math.max(0, from); i < Math.min(r.length, to); i++) {
    const p = r[i]
    if (!p?.sinal || !dados[i]) continue
    const x = Math.round(xAxis.convertToPixel(i))
    const descer = p.sinal === -1
    const cor = descer ? desce : sobe
    const lado = descer ? 'd' : 's'
    degrau[lado] = x - ultimoX[lado] < 52 && degrau[lado] === 0 ? 34 : 0
    ultimoX[lado] = x
    if (descer) {
      const pavio = yAxis.convertToPixel(dados[i].high) - 3
      const ponta = pavio - AFASTAR - degrau.d
      fio(x, pavio, ponta, cor)
      ctx.fillStyle = cor; ctx.beginPath(); ctx.moveTo(x - 5, ponta - SETA); ctx.lineTo(x + 5, ponta - SETA); ctx.lineTo(x, ponta); ctx.closePath(); ctx.fill()
      const meio = ponta - SETA - 3 - ETIQUETA / 2
      etiqueta(x, meio, 'Descer', cor)
      if (img) ctx.drawImage(img, x - lw / 2, meio - ETIQUETA / 2 - 4 - lh, lw, lh)
    } else {
      const pavio = yAxis.convertToPixel(dados[i].low) + 3
      const ponta = pavio + AFASTAR + degrau.s
      fio(x, pavio, ponta, cor)
      ctx.fillStyle = cor; ctx.beginPath(); ctx.moveTo(x - 5, ponta + SETA); ctx.lineTo(x + 5, ponta + SETA); ctx.lineTo(x, ponta); ctx.closePath(); ctx.fill()
      const meio = ponta + SETA + 3 + ETIQUETA / 2
      etiqueta(x, meio, 'Subir', cor)
      if (img) ctx.drawImage(img, x - lw / 2, meio + ETIQUETA / 2 + 4, lw, lh)
    }
  }
  ctx.restore()
  return false
}

const PERSONALIZADOS: IndicatorTemplate[] = [
  {
    name: 'GF_SINAL', shortName: 'Sinal GF', series: 'price', calcParams: [20, 1.8, 3], precision: 2, shouldOhlc: true,
    figures: linhas([['up', 'Superior: '], ['mid', 'Meio: '], ['dn', 'Inferior: ']]),
    styles: { lines: [{ color: '#FF3B47', size: 1.4 }, { color: 'rgba(147, 166, 189, .45)', size: 1 }, { color: '#22D66A', size: 1.4 }] },
    calc: (d, ind) => { const [n, k, m] = ind.calcParams as number[]; return calcularSinal(d, n, k, m) },
    draw: desenharSinal,
  },
  {
    name: 'GF_DONCHIAN', shortName: 'Donchian', series: 'price', calcParams: [20], precision: 2, shouldOhlc: true,
    figures: linhas([['up', 'Superior: '], ['mid', 'Meio: '], ['dn', 'Inferior: ']]),
    calc: (d, ind) => { const n = ind.calcParams[0] as number; return d.map((_, i) => { if (i < n - 1) return {}; const up = maxima(d, i, n), dn = minima(d, i, n); return { up, dn, mid: (up + dn) / 2 } }) },
    draw: faixa('up', 'dn', () => 'rgba(64, 120, 220, .16)'),
  },
  {
    name: 'GF_KELTNER', shortName: 'Keltner', series: 'price', calcParams: [20, 2, 10], precision: 2, shouldOhlc: true,
    figures: linhas([['up', 'Superior: '], ['mid', 'Meio: '], ['dn', 'Inferior: ']]),
    calc: (d, ind) => {
      const [n, m, na] = ind.calcParams as number[]
      const meio = exponencial(d.map((k) => k.close), n), atr = atrWilder(d, na)
      return d.map((_, i) => meio[i] === undefined || atr[i] === undefined ? {} : { mid: meio[i], up: meio[i]! + m * atr[i]!, dn: meio[i]! - m * atr[i]! })
    },
    draw: faixa('up', 'dn', () => 'rgba(183, 141, 57, .12)'),
  },
  {
    name: 'GF_ATR', shortName: 'ATR', calcParams: [14], precision: 4,
    figures: linhas([['atr', 'ATR: ']]),
    calc: (d, ind) => atrWilder(d, ind.calcParams[0] as number).map((atr) => ({ atr })),
  },
  {
    name: 'GF_ICHIMOKU', shortName: 'Ichimoku', series: 'price', calcParams: [9, 26, 52], precision: 2, shouldOhlc: true,
    figures: linhas([['tenkan', 'Conversão: '], ['kijun', 'Base: '], ['spanA', 'Nuvem A: '], ['spanB', 'Nuvem B: ']]),
    calc: (d, ind) => {
      const [c, b, s] = ind.calcParams as number[]
      const meioDe = (i: number, n: number) => i < n - 1 ? undefined : (maxima(d, i, n) + minima(d, i, n)) / 2
      // a nuvem é deslocada `b` velas para a frente: na vela i aparece o que foi calculado em i - b
      return d.map((_, i) => {
        const j = i - b
        const tenkanJ = j >= 0 ? meioDe(j, c) : undefined, kijunJ = j >= 0 ? meioDe(j, b) : undefined
        return {
          tenkan: meioDe(i, c), kijun: meioDe(i, b),
          spanA: tenkanJ !== undefined && kijunJ !== undefined ? (tenkanJ + kijunJ) / 2 : undefined,
          spanB: j >= 0 ? meioDe(j, s) : undefined,
        }
      })
    },
    draw: faixa('spanA', 'spanB', (r) => (r.spanA ?? 0) >= (r.spanB ?? 0) ? 'rgba(22, 199, 132, .14)' : 'rgba(234, 57, 67, .14)'),
  },
  {
    name: 'GF_AROON', shortName: 'Aroon', calcParams: [25], precision: 2, minValue: 0, maxValue: 100,
    figures: linhas([['up', 'Alta: '], ['dn', 'Baixa: ']]),
    calc: (d, ind) => {
      const n = ind.calcParams[0] as number
      return d.map((_, i) => {
        if (i < n) return {}
        const jan = d.slice(i - n, i + 1)
        let iMax = 0, iMin = 0
        jan.forEach((k, j) => { if (k.high >= jan[iMax].high) iMax = j; if (k.low <= jan[iMin].low) iMin = j })
        return { up: (iMax / n) * 100, dn: (iMin / n) * 100 }
      })
    },
  },
  {
    name: 'GF_ESTOCASTICO', shortName: 'Estoc.', calcParams: [14, 3, 3], precision: 2, minValue: 0, maxValue: 100,
    figures: linhas([['k', '%K: '], ['d', '%D: ']]),
    calc: (d, ind) => {
      const [n, sk, sd] = ind.calcParams as number[]
      const bruto = d.map((k, i) => { if (i < n - 1) return undefined; const hh = maxima(d, i, n), ll = minima(d, i, n); return hh === ll ? 50 : ((k.close - ll) / (hh - ll)) * 100 })
      const kk = mediaMovel(bruto, sk), dd = mediaMovel(kk, sd)
      return d.map((_, i) => ({ k: kk[i], d: dd[i] }))
    },
  },
  {
    name: 'GF_RSI_ESTOCASTICO', shortName: 'RSI Estoc.', calcParams: [14, 14, 3, 3], precision: 2, minValue: 0, maxValue: 100,
    figures: linhas([['k', '%K: '], ['d', '%D: ']]),
    calc: (d, ind) => {
      const [nr, ns, sk, sd] = ind.calcParams as number[]
      const rsi = rsiWilder(d.map((k) => k.close), nr)
      const bruto = rsi.map((v, i) => {
        if (v === undefined || i < nr + ns - 1) return undefined
        const jan = rsi.slice(i - ns + 1, i + 1) as number[]
        const hh = Math.max(...jan), ll = Math.min(...jan)
        return hh === ll ? 50 : ((v - ll) / (hh - ll)) * 100
      })
      const kk = mediaMovel(bruto, sk), dd = mediaMovel(kk, sd)
      return d.map((_, i) => ({ k: kk[i], d: dd[i] }))
    },
  },
  {
    name: 'GF_SMI', shortName: 'SMI', calcParams: [10, 3, 3], precision: 2,
    figures: linhas([['smi', 'SMI: '], ['sinal', 'Sinal: ']]),
    calc: (d, ind) => {
      const [n, s, sinal] = ind.calcParams as number[]
      const m = d.map((k, i) => i < n - 1 ? undefined : k.close - (maxima(d, i, n) + minima(d, i, n)) / 2)
      const r = d.map((_, i) => i < n - 1 ? undefined : maxima(d, i, n) - minima(d, i, n))
      const mm = exponencial(exponencial(m, s), s), rr = exponencial(exponencial(r, s), s)
      const smi = mm.map((v, i) => v === undefined || !rr[i] ? undefined : (100 * v) / (0.5 * rr[i]!))
      const sig = exponencial(smi, sinal)
      return d.map((_, i) => ({ smi: smi[i], sinal: sig[i] }))
    },
  },
  {
    name: 'GF_DPO', shortName: 'DPO', calcParams: [20], precision: 4,
    figures: [{ key: 'dpo', title: 'DPO: ', type: 'line' }],
    calc: (d, ind) => {
      const n = ind.calcParams[0] as number, desloc = Math.floor(n / 2) + 1
      const mm = mediaMovel(d.map((k) => k.close), n)
      return d.map((_, i) => i - desloc < 0 || mm[i] === undefined ? {} : { dpo: d[i - desloc].close - mm[i]! })
    },
  },
  {
    name: 'GF_WMA', shortName: 'WMA', series: 'price', calcParams: [20], precision: 2, shouldOhlc: true,
    figures: [{ key: 'v0', title: 'WMA20: ', type: 'line' }],
    regenerateFigures: variosPeriodos('WMA'),
    calc: (d, ind) => {
      const fech = d.map((k) => k.close)
      const series = (ind.calcParams as number[]).map((n) => ponderada(fech, n))
      return d.map((_, i) => Object.fromEntries(series.map((s, j) => [`v${j}`, s[i]])))
    },
  },
  {
    name: 'GF_HMA', shortName: 'HMA', series: 'price', calcParams: [20], precision: 2, shouldOhlc: true,
    figures: [{ key: 'v0', title: 'HMA20: ', type: 'line' }],
    regenerateFigures: variosPeriodos('HMA'),
    calc: (d, ind) => {
      const fech = d.map((k) => k.close)
      const series = (ind.calcParams as number[]).map((n) => {
        const meia = ponderada(fech, Math.max(1, Math.floor(n / 2))), cheia = ponderada(fech, n)
        const dif = meia.map((v, i) => v === undefined || cheia[i] === undefined ? undefined : 2 * v - cheia[i]!)
        return ponderada(dif, Math.max(1, Math.round(Math.sqrt(n))))
      })
      return d.map((_, i) => Object.fromEntries(series.map((s, j) => [`v${j}`, s[i]])))
    },
  },
]

let registrados = false
/** Registra os indicadores escritos aqui (uma vez por página). */
export function registrarIndicadores(): void {
  if (registrados) return
  registrados = true
  // as duas versões do monograma das setas já vêm carregando
  monograma('escuro'); monograma('claro')
  for (const t of PERSONALIZADOS) registerIndicator(t)
}
