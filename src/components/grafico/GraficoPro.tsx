/**
 * O gráfico profissional (19/10/2026, GlobalFly): velas da Deriv desenhadas
 * pela KLineChart (Apache 2.0), com mais de 30 indicadores ajustáveis e as
 * ferramentas de desenho (linhas, canais, Fibonacci, pincel, anotações), cada
 * desenho com cor, espessura, tracejado, trava e apagar. Indicadores e
 * desenhos ficam guardados por pessoa (no banco) e acompanham a pessoa.
 *
 * A Deriv manda só preço; tudo o que é indicador é calculado aqui.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { dispose, init, registerLocale, registerOverlay, type Chart, type DeepPartial, type KLineData, type Overlay, type OverlayCreate, type Styles } from 'klinecharts'
import type { Candle } from '../../core/deriv/types'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { CATALOGO, CATEGORIAS, definicao, registrarIndicadores, type Categoria } from '../../core/grafico/indicadores'
import { carregarDesenhos, carregarIndicadores, salvarDesenhos, salvarIndicadores, type DesenhoSalvo, type IndicadorSalvo } from '../../core/grafico/layout'
import type { ChartMode, ContractMarker } from '../PriceChart'
import { IconeCategoria, IconeIndicador } from './IconeIndicador'
import './grafico-pro.css'
import { ControlesDeZoom } from './ControlesDeZoom'

interface Props {
  candles: Candle[]
  mode: ChartMode
  pipSize: number
  symbol: string
  symbolName: string
  /** Segundos por vela (60, 300, 900, 3600, 14400, 86400). */
  granularity: number
  loading?: boolean
  markers?: ContractMarker[]
  sessao: SessaoTeeds | null
}

/* ------------------------------------------------------------- registro */

let registrado = false
function registrarTudo() {
  if (registrado) return
  registrado = true
  registrarIndicadores()
  registerLocale('pt-BR', {
    time: 'Hora: ', open: 'Abertura: ', high: 'Máxima: ', low: 'Mínima: ', close: 'Fechamento: ', volume: 'Volume: ',
    change: 'Variação: ', turnover: 'Giro: ', second: 's', minute: 'min', hour: 'h', day: 'd', week: 'sem', month: 'mês', year: 'ano',
  })
  // As posições abertas: linha da entrada até o vencimento e o resultado na ponta.
  registerOverlay<{ texto: string; cor: string }>({
    name: 'gfPosicao', totalStep: 3, lock: true, needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    createPointFigures: ({ coordinates, overlay, bounding }) => {
      const [a, b] = coordinates
      if (!a) return []
      const cor = overlay.extendData?.cor ?? '#4FA3FF'
      const fimX = b && Number.isFinite(b.x) ? b.x : bounding.width
      return [
        { type: 'line', attrs: { coordinates: [a, { x: fimX, y: a.y }] }, styles: { color: cor, size: 1.5, style: 'dashed', dashedValue: [5, 4] }, ignoreEvent: true },
        { type: 'circle', attrs: { x: a.x, y: a.y, r: 4 }, styles: { color: cor }, ignoreEvent: true },
        { type: 'text', attrs: { x: a.x + 8, y: a.y - 10, text: overlay.extendData?.texto ?? '', align: 'left', baseline: 'bottom' },
          styles: { color: '#fff', backgroundColor: cor, borderRadius: 4, paddingLeft: 6, paddingRight: 6, paddingTop: 3, paddingBottom: 3, size: 11, weight: 700 }, ignoreEvent: true },
      ]
    },
  })
}

/* --------------------------------------------------------------- visual */

const css = (nome: string, padrao: string) => (getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || padrao)
const CORES_DAS_LINHAS = ['#E0B84F', '#4FA3FF', '#C38BFF', '#2FBF8F', '#FF7A59', '#9CB1C7']

function estilos(modo: ChartMode): DeepPartial<Styles> {
  const texto = css('--text', '#e8eef5'), apoio = css('--muted', '#93A6BD'), borda = css('--border', '#1A2D45')
  const alta = css('--up', '#16C784'), baixa = css('--down', '#EA3943'), fundo = css('--surface', '#08172B')
  const fonte = getComputedStyle(document.body).fontFamily
  return {
    grid: { horizontal: { color: borda, style: 'dashed', dashedValue: [2, 4] }, vertical: { color: borda, style: 'dashed', dashedValue: [2, 4] } },
    candle: {
      type: modo === 'line' ? 'area' : 'candle_solid',
      bar: { upColor: alta, downColor: baixa, noChangeColor: apoio, upBorderColor: alta, downBorderColor: baixa, noChangeBorderColor: apoio, upWickColor: alta, downWickColor: baixa, noChangeWickColor: apoio },
      area: { lineColor: '#4FA3FF', lineSize: 2, backgroundColor: [{ offset: 0, color: 'rgba(79, 163, 255, .02)' }, { offset: 1, color: 'rgba(79, 163, 255, .22)' }] },
      priceMark: { last: { upColor: alta, downColor: baixa, line: { style: 'dashed' }, text: { family: fonte } }, high: { color: apoio, textFamily: fonte }, low: { color: apoio, textFamily: fonte } },
      tooltip: {
        title: { show: false },
        legend: { color: apoio, size: 11, family: fonte, template: [
          { title: 'time', value: '{time}' }, { title: 'open', value: '{open}' }, { title: 'high', value: '{high}' }, { title: 'low', value: '{low}' }, { title: 'close', value: '{close}' },
        ] },
      },
    },
    indicator: {
      lines: CORES_DAS_LINHAS.map((color) => ({ color, size: 1.6 })),
      bars: [{ upColor: 'rgba(22, 199, 132, .65)', downColor: 'rgba(234, 57, 67, .65)', noChangeColor: apoio }],
      tooltip: { title: { color: texto, size: 11, family: fonte }, legend: { color: apoio, size: 11, family: fonte } },
      lastValueMark: { show: false },
    },
    xAxis: { axisLine: { color: borda }, tickLine: { color: borda }, tickText: { color: apoio, family: fonte, size: 11 } },
    yAxis: { axisLine: { color: borda }, tickLine: { color: borda }, tickText: { color: apoio, family: fonte, size: 11 } },
    separator: { color: borda, activeBackgroundColor: 'rgba(79, 163, 255, .12)' },
    crosshair: {
      horizontal: { line: { color: apoio }, text: { backgroundColor: fundo, borderColor: borda, color: texto, family: fonte } },
      vertical: { line: { color: apoio }, text: { backgroundColor: fundo, borderColor: borda, color: texto, family: fonte } },
    },
    overlay: { point: { color: '#4FA3FF', borderColor: 'rgba(79, 163, 255, .35)', activeColor: '#4FA3FF', activeBorderColor: 'rgba(79, 163, 255, .35)' } },
  }
}

/** Nomes das linhas em português (a biblioteca usa os nomes chineses de origem). */
const TITULOS: Record<string, Record<string, string>> = {
  MACD: { dif: 'MACD: ', dea: 'Sinal: ', macd: 'Histograma: ' },
  DMI: { pdi: '+DI: ', mdi: '-DI: ', adx: 'ADX: ', adxr: 'ADXR: ' },
  BOLL: { up: 'Superior: ', mid: 'Meio: ', dn: 'Inferior: ' },
  AO: { ao: 'AO: ' },
  TRIX: { trix: 'TRIX: ', maTrix: 'Sinal: ' },
  ROC: { roc: 'ROC: ', maRoc: 'Média: ' },
  MTM: { mtm: 'MTM: ', maMtm: 'Média: ' },
  PSY: { psy: 'PSY: ', maPsy: 'Média: ' },
  DMA: { dma: 'DMA: ', ama: 'Média: ' },
}

const periodo = (g: number) =>
  g >= 86400 ? { type: 'day' as const, span: Math.round(g / 86400) }
    : g >= 3600 ? { type: 'hour' as const, span: Math.round(g / 3600) }
      : g >= 60 ? { type: 'minute' as const, span: Math.round(g / 60) }
        : { type: 'second' as const, span: g }
const paraK = (c: Candle): KLineData => ({ timestamp: c.epoch * 1000, open: c.open, high: c.high, low: c.low, close: c.close })

/* ------------------------------------------------------- ferramentas */

interface Ferramenta { id: string; nome: string; icone: string; descricao: string }
/* Ícones no padrão das plataformas profissionais: bolinha = ponto que você
   marca no gráfico; seta = a linha continua sem fim; traço cortado ao meio =
   atravessa o gráfico inteiro. É o que separa tendência, raio e estendida. */
const FERRAMENTAS: Ferramenta[] = [
  { id: 'segment', nome: 'Linha de tendência', icone: 'M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M17 5a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6.4 17.6L17.6 6.4', descricao: 'Liga dois pontos. Use para unir topos ou fundos e enxergar a direção do preço.' },
  { id: 'rayLine', nome: 'Raio', icone: 'M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6.4 17.6L21 3M21 3l-5.5 1M21 3l-1 5.5', descricao: 'Começa num ponto e segue sem fim na direção do segundo. Bom para projetar uma tendência para frente.' },
  { id: 'straightLine', nome: 'Linha estendida', icone: 'M2 22L7.6 16.4M10.4 13.6L13.6 10.4M16.4 7.6L22 2M7 15a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M13 9a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', descricao: 'Passa por dois pontos e atravessa o gráfico inteiro, para os dois lados.' },
  { id: 'horizontalStraightLine', nome: 'Linha horizontal', icone: 'M2 12h8M14 12h8M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', descricao: 'Marca um preço de ponta a ponta. A mais usada para suporte e resistência.' },
  { id: 'horizontalRayLine', nome: 'Raio horizontal', icone: 'M3 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M7 12h14M21 12l-3.5-3M21 12l-3.5 3', descricao: 'Linha horizontal que nasce num ponto e segue para a direita. Marca um nível a partir de um momento.' },
  { id: 'verticalStraightLine', nome: 'Linha vertical', icone: 'M12 2v8M12 14v8M10 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0', descricao: 'Marca um instante no tempo, como o começo de um movimento forte.' },
  { id: 'priceLine', nome: 'Linha de preço', icone: 'M2 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M6 12h7M13 8.5h8v7h-8zM15.5 12h3', descricao: 'Parte de um ponto e mostra o valor exato do preço escrito na linha.' },
  { id: 'parallelStraightLine', nome: 'Linhas paralelas', icone: 'M3 15L17 5M7 19L21 9', descricao: 'Duas linhas com a mesma inclinação. Desenha um canal para acompanhar a tendência.' },
  { id: 'priceChannelLine', nome: 'Canal de preço', icone: 'M3 16L19 6M3 20L19 10M3 16v4M19 6v4', descricao: 'Uma linha de tendência com outra paralela na distância que você escolher. Mostra até onde o preço costuma oscilar.' },
  { id: 'fibonacciLine', nome: 'Fibonacci', icone: 'M3 5h18M3 9h18M3 13h18M3 19h18M6 5v14', descricao: 'Marque o início e o fim de um movimento: aparecem os níveis de retração (23,6%, 38,2%, 50%, 61,8%...).' },
  { id: 'brush', nome: 'Pincel', icone: 'M4 20c3 0 4-2 5-4s3-6 6-8 4-3 5-4M4 20l2-1', descricao: 'Traço livre por pontos, para destacar uma região ou fazer uma marcação à mão.' },
  { id: 'simpleAnnotation', nome: 'Anotação', icone: 'M5 5h14v10H11l-4 4v-4H5z', descricao: 'Um balão de texto preso a uma vela. Bom para lembrar por que você marcou aquele ponto.' },
  { id: 'simpleTag', nome: 'Etiqueta de preço', icone: 'M4 12l5-6h11v12H9z', descricao: 'Destaca um preço com uma etiqueta com texto, presa ao eixo dos preços.' },
]
const CURSOR = { nome: 'Cursor', descricao: 'Seleciona e move os desenhos. Clique num desenho para mudar cor, espessura ou apagar.' }
const LIMPAR = { nome: 'Apagar tudo', descricao: 'Apaga todos os desenhos deste ativo. Os de outros ativos continuam.' }
const CORES = ['#4FA3FF', '#B78D39', '#F3F0E9', '#2FBF8F', '#E0605E', '#C38BFF', '#FF9F43', '#9CB1C7']
const GRUPO = 'gf-desenho'
const comTexto = (nome: string) => nome === 'simpleAnnotation' || nome === 'simpleTag'

function estiloDoDesenho(d: Pick<DesenhoSalvo, 'cor' | 'espessura' | 'tracejado'>) {
  const linha = { color: d.cor, size: d.espessura, style: d.tracejado ? 'dashed' as const : 'solid' as const, dashedValue: [6, 4] }
  return {
    line: linha,
    polygon: { color: `${d.cor}22`, borderColor: d.cor, borderSize: d.espessura, borderStyle: linha.style },
    rect: { color: `${d.cor}22`, borderColor: d.cor, borderSize: d.espessura },
    text: { color: '#fff', backgroundColor: d.cor, borderColor: d.cor, size: 11 },
    point: { color: d.cor, borderColor: `${d.cor}55`, activeColor: d.cor, activeBorderColor: `${d.cor}55` },
  }
}

/* =================================================================== */

export function GraficoPro({ candles, mode, pipSize, symbol, symbolName, granularity, loading, markers = [], sessao }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const chartRef = useRef<Chart | null>(null)
  // o zoom de abertura: o botão do meio volta para ele
  const espacoInicial = useRef(10)
  /*
    Zoom pelos botões (22/10/2026): quem está vendo o agora continua vendo o
    agora. O zoom da biblioteca ancora no meio da tela, e ao afastar a vela
    atual escorregava para o meio, com um vazio de futuro à direita. Sem
    animação: o centralizar animado podia parar no meio do caminho.
  */
  const noAgora = (c: Chart) => c.getVisibleRange().realTo >= c.getDataList().length - 1
  const zoomPeloBotao = (fator: number) => {
    const c = chartRef.current
    if (!c) return
    const estavaNoAgora = noAgora(c)
    c.zoomAtCoordinate(fator)
    if (estavaNoAgora) c.scrollToRealTime()
  }
  const centralizar = () => {
    const c = chartRef.current
    if (!c) return
    c.setBarSpace(espacoInicial.current)
    c.scrollToRealTime()
  }
  // os botões de zoom ficam no pé do painel das velas (acima de MACD, RSI...), não no pé do gráfico todo
  const [pePainel, setPePainel] = useState<number | null>(null)
  const medirPainel = () => window.setTimeout(() => {
    const b = chartRef.current?.getSize('candle_pane', 'main')
    setPePainel(b ? b.top + b.height - 48 : null)
  }, 0)
  const dados = useRef<KLineData[]>([])
  const assinante = useRef<((k: KLineData) => void) | null>(null)
  const serie = useRef('')
  const precisaRecarregar = useRef(true)

  const [indicadores, setIndicadores] = useState<IndicadorSalvo[]>(() => carregarIndicadores(sessao, (l) => setIndicadores(l)))
  const [painel, setPainel] = useState(false)
  const [ferramenta, setFerramenta] = useState<string | null>(null)
  const [dica, setDica] = useState<{ nome: string; descricao: string; x: number; y: number; acima: boolean } | null>(null)
  /** A caixinha de ajuda das ferramentas: fixa na tela, porque a barra rola e cortaria um balão preso nela. */
  const mostrarDica = (e: { currentTarget: HTMLElement }, f: { nome: string; descricao: string }) => {
    const r = e.currentTarget.getBoundingClientRect()
    const acima = window.matchMedia('(max-width: 700px)').matches
    setDica({ ...f, acima, x: acima ? Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130) : r.right + 10, y: acima ? r.top - 10 : r.top + r.height / 2 })
  }
  const ajudaDe = (f: { nome: string; descricao: string }) => ({
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => mostrarDica(e, f),
    onFocus: (e: React.FocusEvent<HTMLElement>) => mostrarDica(e, f),
    onMouseLeave: () => setDica(null),
    onBlur: () => setDica(null),
  })
  const [selecionado, setSelecionado] = useState<{ id: string; nome: string; d: DesenhoSalvo } | null>(null)
  const [estilo, setEstilo] = useState({ cor: CORES[0], espessura: 2, tracejado: false })
  const desenhando = useRef<string | null>(null)

  /* ---------------------------------------------------------- montar */
  useEffect(() => {
    registrarTudo()
    const el = caixa.current!
    const chart = init(el, { locale: 'pt-BR', styles: estilos(mode) })
    if (!chart) return
    chartRef.current = chart
    if (import.meta.env.DEV) (window as unknown as { __graficoPro?: Chart }).__graficoPro = chart
    espacoInicial.current = chart.getBarSpace().bar
    chart.setDataLoader({
      // uma CÓPIA: a biblioteca guarda a lista que recebe. Com a mesma lista, a vela nova
      // entrava nela antes do aviso, o gráfico achava que era só a última andando, nunca
      // contava as velas novas e o "agora" dele ficava para trás (o centralizar ia para o passado)
      getBars: ({ callback }) => callback(dados.current.slice(), false),
      subscribeBar: ({ callback }) => { assinante.current = callback },
      unsubscribeBar: () => { assinante.current = null },
    })
    // o tema muda (claro/escuro): o gráfico acompanha
    const tema = new MutationObserver(() => chart.setStyles(estilos(modoRef.current)))
    tema.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
    const tamanho = new ResizeObserver(() => { chart.resize(); medirPainel() })
    tamanho.observe(el)
    return () => { tema.disconnect(); tamanho.disconnect(); dispose(el); chartRef.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const modoRef = useRef(mode)
  useEffect(() => { modoRef.current = mode; chartRef.current?.setStyles(estilos(mode)) }, [mode])

  /* ---------------------------------------------------- ativo e tempo */
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !symbol) return
    serie.current = `${symbol}|${granularity}`
    precisaRecarregar.current = true
    chart.setSymbol({ ticker: symbol, pricePrecision: pipSize, volumePrecision: 0 })
    chart.setPeriod(periodo(granularity))
  }, [symbol, granularity, pipSize])

  /* --------------------------------------------------------- velas */
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !candles.length) return
    const ultimo = paraK(candles[candles.length - 1])
    const atual = dados.current
    const mesmaSerie = !precisaRecarregar.current && atual.length > 0 && candles.length >= 2 &&
      (atual[atual.length - 1].timestamp === ultimo.timestamp || atual[atual.length - 1].timestamp === candles[candles.length - 2].epoch * 1000)
    if (!mesmaSerie) {
      dados.current = candles.map(paraK)
      precisaRecarregar.current = false
      chart.resetData()
      return
    }
    // vela nova ou a última andando: só ela entra
    if (atual[atual.length - 1].timestamp === ultimo.timestamp) atual[atual.length - 1] = ultimo
    else atual.push(ultimo)
    assinante.current?.(ultimo)
  }, [candles])

  /* ---------------------------------------------------- indicadores */
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeIndicator()
    for (const ind of indicadores) {
      const def = definicao(ind.id)
      if (!def) continue
      const linhas = ind.cores?.map((color) => ({ color, size: ind.espessura ?? 1.6 }))
      const id = chart.createIndicator({
        name: ind.id, calcParams: ind.params,
        ...(linhas ? { styles: { lines: linhas } } : {}),
        ...(def.painel === 'principal' ? { paneId: 'candle_pane' } : {}),
      }, def.painel === 'principal')
      const titulos = TITULOS[ind.id]
      const criado = id ? chart.getIndicators({ id })[0] : undefined
      if (titulos && criado) chart.overrideIndicator({ id: criado.id, name: ind.id, figures: criado.figures.map((f) => ({ ...f, title: titulos[f.key] ?? f.title })) })
    }
    medirPainel()
  }, [indicadores])
  const mudarIndicadores = (lista: IndicadorSalvo[]) => { setIndicadores(lista); salvarIndicadores(sessao, lista) }

  /* ------------------------------------------------------- desenhos */
  const coletar = (): DesenhoSalvo[] => (chartRef.current?.getOverlays({ groupId: GRUPO }) ?? [])
    .filter((o) => o.points.length > 0 && (o.currentStep === -1 || o.totalStep === 0 || o.points.length >= Math.max(1, o.totalStep - 1)))
    .map((o) => {
      const s = (o.styles ?? {}) as { line?: { color?: string; size?: number; style?: string } }
      return {
        nome: o.name, pontos: o.points.map((p) => ({ timestamp: p.timestamp, value: p.value })),
        cor: s.line?.color ?? CORES[0], espessura: s.line?.size ?? 2, tracejado: s.line?.style === 'dashed',
        travado: o.lock, texto: comTexto(o.name) ? String(o.extendData ?? '') : undefined,
      }
    })
  const guardar = () => { if (symbol) salvarDesenhos(sessao, symbol, coletar()) }
  const guardarRef = useRef(guardar); guardarRef.current = guardar

  const eventos = (): Partial<OverlayCreate> => ({
    groupId: GRUPO,
    onDrawEnd: () => { desenhando.current = null; setFerramenta(null); guardarRef.current() },
    onPressedMoveEnd: () => guardarRef.current(),
    onRemoved: () => { setSelecionado(null); guardarRef.current() },
    onSelected: (e) => {
      const o = e.overlay as Overlay
      const s = (o.styles ?? {}) as { line?: { color?: string; size?: number; style?: string } }
      setSelecionado({ id: o.id, nome: o.name, d: { nome: o.name, pontos: [], cor: s.line?.color ?? CORES[0], espessura: s.line?.size ?? 2, tracejado: s.line?.style === 'dashed', travado: o.lock, texto: comTexto(o.name) ? String(o.extendData ?? '') : undefined } })
    },
    onDeselected: () => setSelecionado(null),
  })

  // trocou de ativo: os desenhos dele
  useEffect(() => {
    const chart = chartRef.current
    if (!chart || !symbol) return
    const desenhar = (lista: DesenhoSalvo[]) => {
      chart.removeOverlay({ groupId: GRUPO })
      setSelecionado(null)
      for (const d of lista) {
        chart.createOverlay({ name: d.nome, points: d.pontos, lock: d.travado, styles: estiloDoDesenho(d), ...(d.texto !== undefined ? { extendData: d.texto } : {}), ...eventos() } as OverlayCreate)
      }
    }
    desenhar(carregarDesenhos(sessao, symbol, desenhar))
  }, [symbol, sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const escolherFerramenta = (id: string | null) => {
    const chart = chartRef.current
    if (!chart) return
    if (desenhando.current) { chart.removeOverlay({ id: desenhando.current }); desenhando.current = null }
    setFerramenta(id)
    if (!id) return
    const texto = comTexto(id) ? (id === 'simpleTag' ? 'Preço' : 'Anotação') : undefined
    const criado = chart.createOverlay({ name: id, styles: estiloDoDesenho({ ...estilo }), ...(texto ? { extendData: texto } : {}), ...eventos() } as OverlayCreate)
    desenhando.current = typeof criado === 'string' ? criado : null
  }

  const ajustarSelecionado = (mudanca: Partial<DesenhoSalvo>) => {
    const chart = chartRef.current
    if (!chart || !selecionado) return
    const d = { ...selecionado.d, ...mudanca }
    chart.overrideOverlay({ id: selecionado.id, styles: estiloDoDesenho(d), lock: d.travado, ...(d.texto !== undefined ? { extendData: d.texto } : {}) })
    setSelecionado({ ...selecionado, d })
    if (mudanca.cor || mudanca.espessura || mudanca.tracejado !== undefined) setEstilo({ cor: d.cor, espessura: d.espessura, tracejado: d.tracejado })
    guardar()
  }
  const apagarSelecionado = () => { if (selecionado) chartRef.current?.removeOverlay({ id: selecionado.id }) }
  const apagarTudo = () => { chartRef.current?.removeOverlay({ groupId: GRUPO }); setSelecionado(null); guardar() }

  // teclado: Delete apaga o desenho selecionado; Esc larga a ferramenta
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? '')) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selecionado) { e.preventDefault(); apagarSelecionado() }
      if (e.key === 'Escape') { escolherFerramenta(null); setPainel(false) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  /* --------------------------------------------------- posições */
  const chaveMarcadores = markers.map((m) => `${m.id}:${m.profit.toFixed(2)}`).join('|')
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    chart.removeOverlay({ groupId: 'gf-posicao' })
    for (const m of markers) {
      if (m.entryPrice == null) continue
      const subir = /CALL|RISE|UP/i.test(m.type)
      const cor = subir ? css('--up', '#16C784') : css('--down', '#EA3943')
      const lucro = `${m.profit >= 0 ? '+' : '−'}${Math.abs(m.profit).toFixed(2)}`
      chart.createOverlay({
        name: 'gfPosicao', groupId: 'gf-posicao', lock: true,
        points: [{ timestamp: m.entryEpoch * 1000, value: m.entryPrice }, { timestamp: m.expiryEpoch * 1000, value: m.entryPrice }],
        extendData: { texto: `${subir ? '▲ Subir' : '▼ Descer'}  ${lucro}`, cor },
      } as OverlayCreate)
    }
  }, [chaveMarcadores]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ============================================================ tela */
  const ativos = indicadores.map((i) => ({ salvo: i, def: definicao(i.id) })).filter((x) => x.def)
  return (
    <div className="gp">
      <div className="gp-barra">
        <button type="button" className={`gp-botao-ind ${painel ? 'on' : ''}`} onClick={() => setPainel(true)}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M3 17l5-6 4 3 8-9M3 21h18" /></svg>
          Indicadores{ativos.length > 0 && <b>{ativos.length}</b>}
        </button>
        <div className="gp-chips" aria-label="Indicadores no gráfico">
          {ativos.map(({ salvo, def }, i) => (
            <span key={`${salvo.id}-${i}`} className="gp-chip">
              <button type="button" onClick={() => setPainel(true)} title={`Ajustar ${def!.nome}`}>
                <i style={{ background: salvo.cores?.[0] ?? CORES_DAS_LINHAS[0] }} />{def!.sigla} <small>{salvo.params.join(', ')}</small>
              </button>
              <button type="button" className="gp-chip-x" aria-label={`Tirar ${def!.nome}`} onClick={() => mudarIndicadores(indicadores.filter((_, j) => j !== i))}>×</button>
            </span>
          ))}
        </div>
      </div>

      <div className="gp-area">
        <nav className="gp-ferramentas" aria-label="Ferramentas de desenho">
          <button type="button" className={ferramenta === null ? 'on' : ''} onClick={() => escolherFerramenta(null)} aria-label="Cursor" {...ajudaDe(CURSOR)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 3l14 8-6 2-3 6z" /></svg>
          </button>
          {FERRAMENTAS.map((f) => (
            <button key={f.id} type="button" className={ferramenta === f.id ? 'on' : ''} onClick={() => { setDica(null); escolherFerramenta(ferramenta === f.id ? null : f.id) }} aria-label={f.nome} {...ajudaDe(f)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={f.icone} /></svg>
            </button>
          ))}
          <span className="gp-sep" />
          <button type="button" onClick={apagarTudo} aria-label="Apagar todos os desenhos" {...ajudaDe(LIMPAR)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" /></svg>
          </button>
        </nav>
        {dica && (
          <div className={`gp-ajuda${dica.acima ? ' acima' : ''}`} role="tooltip" style={{ left: dica.x, top: dica.y }}>
            <b>{dica.nome}</b><span>{dica.descricao}</span>
          </div>
        )}

        <div className="gp-grafico" ref={caixa} aria-label={`Gráfico de ${symbolName}`}>
          {loading && <span className="gp-carregando">Carregando velas…</span>}
          <ControlesDeZoom style={pePainel !== null ? { left: '50%', top: pePainel } : { left: '50%', bottom: 44 }}
            aoAfastar={() => zoomPeloBotao(0.8)}
            aoAproximar={() => zoomPeloBotao(1.25)}
            aoCentralizar={centralizar} />
          {ferramenta && <span className="gp-dica">{FERRAMENTAS.find((f) => f.id === ferramenta)?.nome}: clique no gráfico para marcar os pontos · Esc cancela</span>}
          {selecionado && (
            <div className="gp-edicao" role="toolbar" aria-label="Editar desenho">
              <div className="gp-cores" role="radiogroup" aria-label="Cor">
                {CORES.map((c) => <button key={c} type="button" role="radio" aria-checked={selecionado.d.cor === c} aria-label={`Cor ${c}`} style={{ background: c }} className={selecionado.d.cor === c ? 'on' : ''} onClick={() => ajustarSelecionado({ cor: c })} />)}
              </div>
              <div className="gp-espessuras" role="radiogroup" aria-label="Espessura">
                {[1, 2, 3, 4].map((n) => <button key={n} type="button" role="radio" aria-checked={selecionado.d.espessura === n} className={selecionado.d.espessura === n ? 'on' : ''} onClick={() => ajustarSelecionado({ espessura: n })} title={`${n} px`}><i style={{ height: n }} /></button>)}
              </div>
              <button type="button" className={selecionado.d.tracejado ? 'on' : ''} aria-pressed={selecionado.d.tracejado} onClick={() => ajustarSelecionado({ tracejado: !selecionado.d.tracejado })} title="Tracejado">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h3M9 12h3M15 12h3M21 12h0" /></svg>
              </button>
              <button type="button" className={selecionado.d.travado ? 'on' : ''} aria-pressed={selecionado.d.travado} onClick={() => ajustarSelecionado({ travado: !selecionado.d.travado })} title={selecionado.d.travado ? 'Destravar' : 'Travar no lugar'}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d={selecionado.d.travado ? 'M8 11V7a4 4 0 018 0v4' : 'M8 11V7a4 4 0 017.5-2'} /></svg>
              </button>
              {comTexto(selecionado.nome) && (
                <input className="gp-texto" value={selecionado.d.texto ?? ''} maxLength={40} aria-label="Texto" onChange={(e) => ajustarSelecionado({ texto: e.target.value })} />
              )}
              <button type="button" className="gp-apagar" onClick={apagarSelecionado} title="Apagar (Delete)" aria-label="Apagar desenho">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 11v6M14 11v6M7 7l1 13h8l1-13M9 7V4h6v3" /></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {painel && <PainelDeIndicadores ativos={indicadores} aoMudar={mudarIndicadores} aoFechar={() => setPainel(false)} />}
    </div>
  )
}

/* ================================================ painel de indicadores */

function PainelDeIndicadores({ ativos, aoMudar, aoFechar }: { ativos: IndicadorSalvo[]; aoMudar: (l: IndicadorSalvo[]) => void; aoFechar: () => void }) {
  const [aba, setAba] = useState<'ativos' | Categoria>(ativos.length ? 'ativos' : 'momentum')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const lista = useMemo(() => {
    const q = normal(busca.trim())
    if (q) return CATALOGO.filter((d) => normal(`${d.nome} ${d.sigla} ${d.descricao}`).includes(q))
    return aba === 'ativos' ? [] : CATALOGO.filter((d) => d.categoria === aba)
  }, [aba, busca])
  const adicionar = (id: string) => {
    const def = definicao(id)!
    aoMudar([...ativos, { id, params: def.parametros.map((p) => p.padrao) }])
    setAba('ativos'); setBusca(''); setEditando(ativos.length)
  }

  return (
    <div className="gp-modal-fundo" onClick={aoFechar}>
      <div className="gp-modal" role="dialog" aria-label="Indicadores" onClick={(e) => e.stopPropagation()}>
        <aside className="gp-modal-menu">
          <h3>Indicadores</h3>
          <button type="button" className={aba === 'ativos' && !busca ? 'on' : ''} onClick={() => { setAba('ativos'); setBusca('') }}><span className="gp-cat"><IconeCategoria id="ativos" />No gráfico</span><small>{ativos.length}</small></button>
          <span className="gp-modal-sep" />
          {CATEGORIAS.map((c) => (
            <button key={c.id} type="button" className={aba === c.id && !busca ? 'on' : ''} onClick={() => { setAba(c.id); setBusca(''); setEditando(null) }}>
              <span className="gp-cat"><IconeCategoria id={c.id} />{c.nome}</span><small>{CATALOGO.filter((d) => d.categoria === c.id).length}</small>
            </button>
          ))}
        </aside>
        <section className="gp-modal-conteudo">
          <div className="gp-modal-topo">
            <input type="search" placeholder="Buscar indicador…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar indicador" />
            <button type="button" className="gp-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
          </div>

          {aba === 'ativos' && !busca ? (
            ativos.length === 0 ? <p className="gp-vazio">Nenhum indicador no gráfico. Escolha uma categoria ao lado.</p> : (
              <ul className="gp-lista">
                {ativos.map((a, i) => {
                  const def = definicao(a.id)
                  if (!def) return null
                  return (
                    <li key={`${a.id}-${i}`} className={editando === i ? 'aberto' : ''}>
                      <div className="gp-item">
                        <IconeIndicador id={a.id} />
                        <button type="button" className="gp-item-nome" onClick={() => setEditando(editando === i ? null : i)}>
                          <b>{def.nome}</b><small>{def.sigla} {a.params.join(', ')} · {def.painel === 'principal' ? 'sobre as velas' : 'painel próprio'}</small>
                        </button>
                        <button type="button" className="gp-item-acao" onClick={() => setEditando(editando === i ? null : i)} aria-label={`Ajustar ${def.nome}`} title="Ajustar">⚙</button>
                        <button type="button" className="gp-item-acao" onClick={() => { aoMudar(ativos.filter((_, j) => j !== i)); setEditando(null) }} aria-label={`Tirar ${def.nome}`} title="Tirar do gráfico">×</button>
                      </div>
                      {editando === i && <AjustesDoIndicador salvo={a} aoMudar={(novo) => aoMudar(ativos.map((x, j) => (j === i ? novo : x)))} />}
                    </li>
                  )
                })}
              </ul>
            )
          ) : (
            <ul className="gp-lista">
              {lista.map((d) => {
                const quantos = ativos.filter((a) => a.id === d.id).length
                return (
                  <li key={d.id}>
                    <button type="button" className="gp-item gp-item-add" onClick={() => adicionar(d.id)}>
                      <IconeIndicador id={d.id} />
                      <span className="gp-item-nome"><b>{d.nome}</b><small>{d.descricao}</small></span>
                      <span className="gp-item-mais">{quantos ? `✓ ${quantos > 1 ? quantos : ''} + outro` : '+ Adicionar'}</span>
                    </button>
                  </li>
                )
              })}
              {lista.length === 0 && <p className="gp-vazio">Nenhum indicador com esse nome.</p>}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function AjustesDoIndicador({ salvo, aoMudar }: { salvo: IndicadorSalvo; aoMudar: (s: IndicadorSalvo) => void }) {
  const def = definicao(salvo.id)!
  const [texto, setTexto] = useState(salvo.params.join(', '))
  const linhas = def.varios ? salvo.params.length : Math.max(1, Math.min(4, def.parametros.length))
  const cores = Array.from({ length: Math.max(1, linhas) }, (_, i) => salvo.cores?.[i] ?? CORES_DAS_LINHAS[i % CORES_DAS_LINHAS.length])
  const limitar = (n: number, p: { min: number; max: number }) => Math.min(p.max, Math.max(p.min, Math.round(n)))
  return (
    <div className="gp-ajustes">
      {def.varios ? (
        <label className="gp-campo">
          <span>Períodos <small>(separe por vírgula para várias linhas)</small></span>
          <input value={texto} inputMode="numeric" onChange={(e) => setTexto(e.target.value)}
            onBlur={() => {
              const p = def.parametros[0]
              const lista = texto.split(/[,;\s]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0).slice(0, 6).map((n) => limitar(n, p))
              if (lista.length) { aoMudar({ ...salvo, params: lista }); setTexto(lista.join(', ')) } else setTexto(salvo.params.join(', '))
            }} />
        </label>
      ) : def.parametros.map((p, i) => (
        <label key={p.rotulo} className="gp-campo">
          <span>{p.rotulo}</span>
          <input type="number" min={p.min} max={p.max} step={p.passo ?? 1} value={salvo.params[i] ?? p.padrao}
            onChange={(e) => { const n = Number(e.target.value); if (!Number.isFinite(n)) return; const params = [...salvo.params]; params[i] = limitar(n, p); aoMudar({ ...salvo, params }) }} />
        </label>
      ))}
      <div className="gp-campo">
        <span>Cores das linhas</span>
        <div className="gp-cores-ind">
          {cores.map((c, i) => (
            <label key={i} className="gp-cor-ind" style={{ background: c }} title={`Cor da linha ${i + 1}`}>
              <input type="color" value={c} onChange={(e) => { const novas = [...cores]; novas[i] = e.target.value; aoMudar({ ...salvo, cores: novas }) }} aria-label={`Cor da linha ${i + 1}`} />
            </label>
          ))}
        </div>
      </div>
      <div className="gp-campo">
        <span>Espessura</span>
        <div className="gp-espessuras">
          {[1, 2, 3].map((n) => <button key={n} type="button" className={(salvo.espessura ?? 1.6) === n || (n === 2 && !salvo.espessura) ? 'on' : ''} onClick={() => aoMudar({ ...salvo, espessura: n, cores })}><i style={{ height: n }} /></button>)}
        </div>
      </div>
      <button type="button" className="gp-restaurar" onClick={() => { aoMudar({ id: salvo.id, params: def.parametros.map((p) => p.padrao) }); setTexto(def.parametros.map((p) => p.padrao).join(', ')) }}>Voltar ao padrão</button>
    </div>
  )
}
