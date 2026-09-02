import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Candle } from '../core/deriv/types'
import { CHART, T } from '../core/chart/theme'
import {
  formatClock,
  formatDateTime,
  formatPrice,
  priceRange,
  priceTicks,
  slice,
  type Viewport,
} from '../core/chart/scales'

export type ChartMode = 'candles' | 'line'

/** Uma operacao aberta, desenhada sobre o grafico. */
export interface ContractMarker {
  id: number
  /** CALL (subir) ou PUT (descer). */
  type: string
  entryEpoch: number
  entryPrice: number | null
  expiryEpoch: number
  profit: number
}

interface Props {
  candles: Candle[]
  mode: ChartMode
  pipSize: number
  symbolName: string
  loading?: boolean
  /** Operacoes abertas neste ativo. */
  markers?: ContractMarker[]
  /** Indicadores técnicos selecionados no painel. */
  indicators?: string[]
}

interface Cursor {
  x: number
  y: number
  index: number
}

/**
 * Grafico da Teeds - desenhado do zero em canvas.
 * Sem bibliotecas de terceiros: controle total sobre desenho e interacao.
 */
export function PriceChart({ candles, mode, pipSize, symbolName, loading, markers = [], indicators = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [vp, setVp] = useState<Viewport>({ size: CHART.defaultCandles, offset: 0 })
  const [cursor, setCursor] = useState<Cursor | null>(null)
  const drag = useRef<{ x: number; offset: number } | null>(null)

  // ------------------------------------------------------------ dimensoes
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      setSize({ w: Math.floor(width), h: Math.floor(height) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const view = useMemo(() => slice(candles, vp), [candles, vp])
  const range = useMemo(() => priceRange(view.items), [view.items])

  // a faixa da direita cresce conforme o tamanho do numero, para nunca cortar
  const padRight = useMemo(() => {
    const exemplo = formatPrice(range.max, pipSize)
    return Math.max(CHART.padRight, exemplo.length * 6.6 + 22)
  }, [range.max, pipSize])

  const plot = useMemo(() => {
    const w = Math.max(0, size.w - padRight - CHART.padLeft)
    const h = Math.max(0, size.h - CHART.padBottom - CHART.padTop)
    return { x: CHART.padLeft, y: CHART.padTop, w, h }
  }, [size, padRight])

  const toY = useCallback(
    (price: number) => plot.y + ((range.max - price) / (range.max - range.min)) * plot.h,
    [plot, range],
  )

  const stepX = view.items.length ? plot.w / view.items.length : 0

  // --- batimento do tempo real: guarda o instante do ultimo tick para o
  // pulso no grafico. So refs: nada disso re-renderiza o React.
  const ultimoTickRef = useRef(0)
  const precoAnteriorRef = useRef<number | null>(null)
  const frameRef = useRef(0)
  const toX = useCallback((i: number) => plot.x + i * stepX + stepX / 2, [plot, stepX])

  const ultimoFechamento = view.items.length ? view.items[view.items.length - 1].close : null
  useEffect(() => {
    if (ultimoFechamento === null) return
    if (precoAnteriorRef.current !== null && ultimoFechamento !== precoAnteriorRef.current) {
      ultimoTickRef.current = performance.now()
    }
    precoAnteriorRef.current = ultimoFechamento
  }, [ultimoFechamento])

  // ------------------------------------------------------------ desenho
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return

    // Um unico desenho por quadro: varios ticks no mesmo instante nao
    // multiplicam o trabalho da tela.
    const pintar = () => {
      const dpr = window.devicePixelRatio || 1
      const larg = Math.round(size.w * dpr)
      const alt = Math.round(size.h * dpr)
      // redimensionar o buffer e caro: so quando muda mesmo
      if (canvas.width !== larg || canvas.height !== alt) {
        canvas.width = larg
        canvas.height = alt
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size.w, size.h)

      const items = view.items
      if (!items.length) return

      const yTicks = priceTicks(range)

      // --- grade horizontal + eixo de precos
      ctx.font = '11px ui-sans-serif, -apple-system, system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      for (const price of yTicks) {
        const y = toY(price)
        if (y < plot.y - 1 || y > plot.y + plot.h + 1) continue
        ctx.strokeStyle = T.grid
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(plot.x, Math.round(y) + 0.5)
        ctx.lineTo(plot.x + plot.w, Math.round(y) + 0.5)
        ctx.stroke()
        ctx.fillStyle = T.muted
        ctx.textAlign = 'left'
        ctx.fillText(formatPrice(price, pipSize), plot.x + plot.w + 8, y)
      }

      // --- grade vertical + eixo de tempo
      const labelEvery = Math.max(1, Math.ceil(items.length / 6))
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      for (let i = 0; i < items.length; i += labelEvery) {
        const x = toX(i)
        ctx.strokeStyle = T.grid
        ctx.beginPath()
        ctx.moveTo(Math.round(x) + 0.5, plot.y)
        ctx.lineTo(Math.round(x) + 0.5, plot.y + plot.h)
        ctx.stroke()
        ctx.fillStyle = T.muted
        ctx.fillText(formatClock(items[i].epoch), x, plot.y + plot.h + 7)
      }

      // --- serie
      if (mode === 'candles') {
        // O corpo acompanha o passo: com zoom, velas largas e vao pequeno —
        // um teto fixo aqui deixava o grafico cheio de palitos espacados.
        const bodyW = Math.max(1, Math.min(stepX * 0.72, stepX - 3))
        const pavio = Math.max(1, Math.min(2.5, bodyW * 0.1))
        for (let i = 0; i < items.length; i++) {
          const c = items[i]
          const up = c.close >= c.open
          const color = up ? T.up : T.down
          const x = toX(i)
          ctx.strokeStyle = color
          ctx.fillStyle = color
          ctx.lineWidth = pavio
          // pavio
          ctx.beginPath()
          ctx.moveTo(Math.round(x) + 0.5, toY(c.high))
          ctx.lineTo(Math.round(x) + 0.5, toY(c.low))
          ctx.stroke()
          // corpo
          const yOpen = toY(c.open)
          const yClose = toY(c.close)
          const top = Math.min(yOpen, yClose)
          const height = Math.max(1, Math.abs(yClose - yOpen))
          ctx.fillRect(Math.round(x - bodyW / 2), Math.round(top), Math.round(bodyW), Math.round(height))
        }
      } else {
        // area + linha
        const grad = ctx.createLinearGradient(0, plot.y, 0, plot.y + plot.h)
        grad.addColorStop(0, 'rgba(76, 111, 255, 0.18)')
        grad.addColorStop(1, 'rgba(76, 111, 255, 0)')
        ctx.beginPath()
        ctx.moveTo(toX(0), toY(items[0].close))
        for (let i = 1; i < items.length; i++) ctx.lineTo(toX(i), toY(items[i].close))
        const lastX = toX(items.length - 1)
        ctx.lineTo(lastX, plot.y + plot.h)
        ctx.lineTo(toX(0), plot.y + plot.h)
        ctx.closePath()
        ctx.fillStyle = grad
        ctx.fill()

        ctx.beginPath()
        ctx.moveTo(toX(0), toY(items[0].close))
        for (let i = 1; i < items.length; i++) ctx.lineTo(toX(i), toY(items[i].close))
        ctx.strokeStyle = T.primary
        ctx.lineWidth = 1.75
        ctx.lineJoin = 'round'
        ctx.stroke()
      }

      // --- indicadores técnicos. São calculados sobre a janela visível para
      // manter o gráfico leve mesmo quando o mercado envia muitos ticks.
      const closes = items.map((c) => c.close)
      const desenharLinha = (valores: Array<number | null>, cor: string, largura = 1.5) => {
        ctx.save(); ctx.beginPath(); let iniciou = false
        valores.forEach((valor, i) => {
          if (valor == null) return
          const x = toX(i); const y = toY(valor)
          if (!iniciou) { ctx.moveTo(x, y); iniciou = true } else ctx.lineTo(x, y)
        })
        ctx.strokeStyle = cor; ctx.lineWidth = largura; ctx.lineJoin = 'round'; ctx.stroke(); ctx.restore()
      }
      if (indicators.includes('bollinger')) {
        const bandas = bollinger(closes, 20)
        ctx.save(); ctx.beginPath(); let comecou = false
        bandas.superior.forEach((v, i) => { if (v == null) return; const x=toX(i), y=toY(v); if (!comecou) { ctx.moveTo(x,y); comecou=true } else ctx.lineTo(x,y) })
        for (let i=bandas.inferior.length-1;i>=0;i--) { const v=bandas.inferior[i]; if (v!=null) ctx.lineTo(toX(i),toY(v)) }
        ctx.closePath(); ctx.fillStyle='rgba(124, 92, 255, .075)'; ctx.fill(); ctx.restore()
        desenharLinha(bandas.superior, '#8f79ff', 1); desenharLinha(bandas.inferior, '#8f79ff', 1)
      }
      if (indicators.includes('sma')) desenharLinha(mediaSimples(closes, 20), '#e0b84f', 1.8)
      if (indicators.includes('ema')) desenharLinha(mediaExponencial(closes, 50), '#35a9ff', 1.7)
      if (indicators.includes('fibonacci')) {
        const maximo = Math.max(...items.map((c) => c.high))
        const minimo = Math.min(...items.map((c) => c.low))
        const amplitude = maximo - minimo
        const niveis = [0, .236, .382, .5, .618, .786, 1]
        ctx.save()
        ctx.font = '700 8.5px ui-sans-serif, system-ui'
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'
        niveis.forEach((nivel) => {
          const preco = maximo - amplitude * nivel
          const y = toY(preco)
          ctx.setLineDash(nivel === .5 || nivel === .618 ? [5, 4] : [2, 5])
          ctx.strokeStyle = nivel === .618 ? 'rgba(229, 192, 103, .78)' : 'rgba(229, 192, 103, .38)'
          ctx.lineWidth = nivel === .618 ? 1.35 : 1
          ctx.beginPath(); ctx.moveTo(plot.x, y); ctx.lineTo(plot.x + plot.w, y); ctx.stroke()
          const texto = `${(nivel * 100).toFixed(nivel === 0 || nivel === 1 ? 0 : 1)}%`
          const largura = ctx.measureText(texto).width
          ctx.fillStyle = 'rgba(8, 11, 18, .82)'; roundRect(ctx, plot.x + 5, y - 13, largura + 8, 13, 3); ctx.fill()
          ctx.fillStyle = nivel === .618 ? '#e5c067' : '#bfa86d'; ctx.fillText(texto, plot.x + 9, y - 2)
        })
        ctx.restore()
      }

      const paineis: Array<{ nome: string; valor: number; cor: string; minimo: number; maximo: number }> = []
      if (indicators.includes('rsi')) paineis.push({ nome: 'RSI 14', valor: rsi(closes, 14), cor: '#c18cff', minimo: 0, maximo: 100 })
      if (indicators.includes('macd')) {
        const valor = macd(closes)
        paineis.push({ nome: 'MACD', valor, cor: valor >= 0 ? T.up : T.down, minimo: -Math.max(Math.abs(valor) * 2, .001), maximo: Math.max(Math.abs(valor) * 2, .001) })
      }
      paineis.forEach((painel, indice) => {
        const w = Math.min(170, Math.max(118, plot.w * .2)); const h = 31
        const x = plot.x + 9; const y = plot.y + plot.h - 10 - h - indice * (h + 7)
        ctx.fillStyle = 'rgba(9, 12, 20, .84)'; roundRect(ctx, x, y, w, h, 7); ctx.fill()
        ctx.font = '700 9px ui-sans-serif, system-ui'; ctx.textAlign='left'; ctx.textBaseline='middle'; ctx.fillStyle=painel.cor
        ctx.fillText(`${painel.nome}  ${painel.valor.toFixed(2)}`, x+9, y+10)
        const pct=Math.max(0,Math.min(1,(painel.valor-painel.minimo)/(painel.maximo-painel.minimo)))
        ctx.fillStyle='rgba(255,255,255,.12)'; roundRect(ctx,x+9,y+21,w-18,3,2);ctx.fill()
        ctx.fillStyle=painel.cor; roundRect(ctx,x+9,y+21,(w-18)*pct,3,2);ctx.fill()
      })

      // --- linha do preco atual
      const last = items[items.length - 1]
      const lastUp = last.close >= last.open
      const yLast = toY(last.close)
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = mode === 'candles' ? (lastUp ? T.up : T.down) : T.primary
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(plot.x, Math.round(yLast) + 0.5)
      ctx.lineTo(plot.x + plot.w, Math.round(yLast) + 0.5)
      ctx.stroke()
      ctx.restore()

      // --- o mercado respira: ponto vivo no ultimo preco, com uma onda
      // que se expande a cada tick novo. Enquanto a onda dura, o desenho
      // se agenda de novo — passada a onda, volta a pintar so quando os
      // dados mudam.
      const corViva = mode === 'candles' ? (lastUp ? T.up : T.down) : T.primary
      const xLast = toX(items.length - 1)
      const idade = performance.now() - ultimoTickRef.current
      if (idade < 900) {
        const t = idade / 900
        ctx.beginPath()
        ctx.arc(xLast, yLast, 4 + t * 16, 0, Math.PI * 2)
        ctx.strokeStyle = corViva
        ctx.globalAlpha = 0.55 * (1 - t)
        ctx.lineWidth = 2
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      ctx.beginPath()
      ctx.arc(xLast, yLast, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = corViva
      ctx.fill()
      ctx.beginPath()
      ctx.arc(xLast, yLast, 6, 0, Math.PI * 2)
      ctx.strokeStyle = corViva
      ctx.globalAlpha = 0.3
      ctx.lineWidth = 1.5
      ctx.stroke()
      ctx.globalAlpha = 1
      if (idade < 900) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = requestAnimationFrame(pintar)
      }

      // etiqueta do preco atual
      const label = formatPrice(last.close, pipSize)
      ctx.font = '600 11px ui-sans-serif, -apple-system, system-ui, sans-serif'
      const tw = ctx.measureText(label).width
      const bx = plot.x + plot.w + 4
      ctx.fillStyle = mode === 'candles' ? (lastUp ? T.up : T.down) : T.primary
      roundRect(ctx, bx, yLast - 9, tw + 10, 18, 4)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(label, bx + 5, yLast)

      // --- operacoes abertas: entrada, faixa de duracao e expiracao
      if (markers.length && items.length > 1) {
        const passo = items[1].epoch - items[0].epoch || 60
        const inicio = items[0].epoch
        const xPara = (epoch: number) => plot.x + ((epoch - inicio) / passo) * stepX + stepX / 2

        for (const m of markers) {
          const subiu = m.type === 'CALL' || m.type === 'MULTUP' || m.type === 'HIGHER'
          const cor = subiu ? T.up : T.down
          const xEntrada = xPara(m.entryEpoch)
          const xFim = xPara(m.expiryEpoch)
          const dentro = (x: number) => x >= plot.x && x <= plot.x + plot.w

          // faixa da duracao do contrato
          const a = Math.max(plot.x, Math.min(xEntrada, xFim))
          const b = Math.min(plot.x + plot.w, Math.max(xEntrada, xFim))
          if (b > a) {
            ctx.fillStyle = subiu ? 'rgba(18,161,80,0.05)' : 'rgba(229,72,77,0.05)'
            ctx.fillRect(a, plot.y, b - a, plot.h)
          }

          // linha do preco de entrada
          if (m.entryPrice != null) {
            const y = toY(m.entryPrice)
            if (y >= plot.y && y <= plot.y + plot.h) {
              ctx.save()
              ctx.setLineDash([2, 3])
              ctx.strokeStyle = cor
              ctx.lineWidth = 1.25
              ctx.beginPath()
              ctx.moveTo(Math.max(plot.x, a), Math.round(y) + 0.5)
              ctx.lineTo(plot.x + plot.w, Math.round(y) + 0.5)
              ctx.stroke()
              ctx.restore()

              // etiqueta "entrada" a esquerda da linha
              ctx.font = '600 10px ui-sans-serif, -apple-system, system-ui, sans-serif'
              const txt = `entrada ${formatPrice(m.entryPrice, pipSize)}`
              const tw2 = ctx.measureText(txt).width
              const lx = Math.min(Math.max(plot.x + 4, xEntrada + 8), plot.x + plot.w - tw2 - 12)
              ctx.fillStyle = cor
              roundRect(ctx, lx - 4, y - 17, tw2 + 8, 14, 3)
              ctx.fill()
              ctx.fillStyle = '#fff'
              ctx.textAlign = 'left'
              ctx.textBaseline = 'middle'
              ctx.fillText(txt, lx, y - 10)

              // seta no ponto exato de entrada
              if (dentro(xEntrada)) {
                ctx.fillStyle = cor
                ctx.beginPath()
                if (subiu) {
                  ctx.moveTo(xEntrada, y - 7); ctx.lineTo(xEntrada - 5, y + 2); ctx.lineTo(xEntrada + 5, y + 2)
                } else {
                  ctx.moveTo(xEntrada, y + 7); ctx.lineTo(xEntrada - 5, y - 2); ctx.lineTo(xEntrada + 5, y - 2)
                }
                ctx.closePath()
                ctx.fill()
              }
            }
          }

          // linha vertical da expiracao
          if (dentro(xFim)) {
            ctx.save()
            ctx.setLineDash([3, 3])
            ctx.strokeStyle = cor
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(Math.round(xFim) + 0.5, plot.y)
            ctx.lineTo(Math.round(xFim) + 0.5, plot.y + plot.h)
            ctx.stroke()
            ctx.restore()

            ctx.font = '600 9.5px ui-sans-serif, -apple-system, system-ui, sans-serif'
            const ft = 'fim'
            const fw = ctx.measureText(ft).width
            ctx.fillStyle = cor
            roundRect(ctx, xFim - fw / 2 - 4, plot.y + 2, fw + 8, 13, 3)
            ctx.fill()
            ctx.fillStyle = '#fff'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(ft, xFim, plot.y + 8.5)
          }
        }
      }

      // --- crosshair
      if (cursor && cursor.index >= 0 && cursor.index < items.length) {
        const cx = toX(cursor.index)
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = T.crosshair
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(Math.round(cx) + 0.5, plot.y)
        ctx.lineTo(Math.round(cx) + 0.5, plot.y + plot.h)
        ctx.moveTo(plot.x, Math.round(cursor.y) + 0.5)
        ctx.lineTo(plot.x + plot.w, Math.round(cursor.y) + 0.5)
        ctx.stroke()
        ctx.restore()

        // etiqueta do preco sob o cursor
        const priceAt = range.max - ((cursor.y - plot.y) / plot.h) * (range.max - range.min)
        const pl = formatPrice(priceAt, pipSize)
        ctx.font = '11px ui-sans-serif, -apple-system, system-ui, sans-serif'
        const pw = ctx.measureText(pl).width
        ctx.fillStyle = T.text
        roundRect(ctx, plot.x + plot.w + 4, cursor.y - 9, pw + 10, 18, 4)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.fillText(pl, plot.x + plot.w + 9, cursor.y)
      }
    }

    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(pintar)
    return () => cancelAnimationFrame(frameRef.current)
  }, [size, view.items, range, plot, mode, pipSize, cursor, stepX, toX, toY, markers, indicators])

  // ------------------------------------------------------------ interacao
  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    setVp((prev) => {
      const factor = e.deltaY > 0 ? 1.15 : 0.87
      const next = Math.round(prev.size * factor)
      return { ...prev, size: Math.min(CHART.maxCandles, Math.max(CHART.minCandles, next)) }
    })
  }, [])

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, offset: vp.offset }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    if (drag.current && stepX > 0) {
      const moved = Math.round((e.clientX - drag.current.x) / stepX)
      const maxOffset = Math.max(0, candles.length - vp.size)
      const next = Math.min(maxOffset, Math.max(0, drag.current.offset + moved))
      setVp((prev) => (prev.offset === next ? prev : { ...prev, offset: next }))
      return
    }

    if (x < plot.x || x > plot.x + plot.w || y < plot.y || y > plot.y + plot.h) {
      setCursor(null)
      return
    }
    const index = stepX > 0 ? Math.floor((x - plot.x) / stepX) : -1
    setCursor({ x, y, index })
  }

  const endDrag = () => {
    drag.current = null
  }

  const hovered = cursor && view.items[cursor.index]

  return (
    <div className="chart" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: drag.current ? 'grabbing' : 'crosshair' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          endDrag()
          setCursor(null)
        }}
      />

      {hovered && (
        <div className="chart-tip" style={{ left: Math.min(cursor!.x + 14, size.w - 190) }}>
          <strong>{symbolName}</strong>
          <span>{formatDateTime(hovered.epoch)}</span>
          {mode === 'candles' ? (
            <div className="ohlc">
              <span>A <b>{formatPrice(hovered.open, pipSize)}</b></span>
              <span>M <b>{formatPrice(hovered.high, pipSize)}</b></span>
              <span>m <b>{formatPrice(hovered.low, pipSize)}</b></span>
              <span>F <b>{formatPrice(hovered.close, pipSize)}</b></span>
            </div>
          ) : (
            <div className="ohlc"><span>Preço <b>{formatPrice(hovered.close, pipSize)}</b></span></div>
          )}
        </div>
      )}

      {loading && <div className="chart-loading">carregando mercado…</div>}
      {!loading && !candles.length && <div className="chart-loading">sem dados para este ativo</div>}
    </div>
  )
}

function mediaSimples(valores: number[], periodo: number): Array<number | null> {
  return valores.map((_, i) => i < periodo - 1 ? null : valores.slice(i - periodo + 1, i + 1).reduce((a, b) => a + b, 0) / periodo)
}

function mediaExponencial(valores: number[], periodo: number): Array<number | null> {
  if (!valores.length) return []
  const k = 2 / (periodo + 1); let atual = valores[0]
  return valores.map((valor, i) => { atual = i ? valor * k + atual * (1 - k) : valor; return i < periodo - 1 ? null : atual })
}

function bollinger(valores: number[], periodo: number) {
  const media = mediaSimples(valores, periodo)
  const superior: Array<number | null> = []; const inferior: Array<number | null> = []
  media.forEach((m, i) => {
    if (m == null) { superior.push(null); inferior.push(null); return }
    const janela = valores.slice(i - periodo + 1, i + 1)
    const desvio = Math.sqrt(janela.reduce((s, v) => s + Math.pow(v - m, 2), 0) / periodo)
    superior.push(m + 2 * desvio); inferior.push(m - 2 * desvio)
  })
  return { superior, inferior }
}

function rsi(valores: number[], periodo: number) {
  if (valores.length < 2) return 50
  const inicio = Math.max(1, valores.length - periodo); let ganhos = 0; let perdas = 0
  for (let i = inicio; i < valores.length; i++) { const d = valores[i] - valores[i - 1]; if (d >= 0) ganhos += d; else perdas -= d }
  if (!perdas) return 100
  return 100 - 100 / (1 + ganhos / perdas)
}

function macd(valores: number[]) {
  const curta = mediaExponencial(valores, 12); const longa = mediaExponencial(valores, 26)
  const i = valores.length - 1
  return (curta[i] ?? valores[i] ?? 0) - (longa[i] ?? valores[i] ?? 0)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
