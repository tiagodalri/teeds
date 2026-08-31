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

interface Props {
  candles: Candle[]
  mode: ChartMode
  pipSize: number
  symbolName: string
  loading?: boolean
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
export function PriceChart({ candles, mode, pipSize, symbolName, loading }: Props) {
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

  const plot = useMemo(() => {
    const w = Math.max(0, size.w - CHART.padRight - CHART.padLeft)
    const h = Math.max(0, size.h - CHART.padBottom - CHART.padTop)
    return { x: CHART.padLeft, y: CHART.padTop, w, h }
  }, [size])

  const toY = useCallback(
    (price: number) => plot.y + ((range.max - price) / (range.max - range.min)) * plot.h,
    [plot, range],
  )

  const stepX = view.items.length ? plot.w / view.items.length : 0
  const toX = useCallback((i: number) => plot.x + i * stepX + stepX / 2, [plot, stepX])

  // ------------------------------------------------------------ desenho
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.w || !size.h) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = size.w * dpr
    canvas.height = size.h * dpr
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
      const bodyW = Math.max(1, Math.min(14, stepX * 0.66))
      for (let i = 0; i < items.length; i++) {
        const c = items[i]
        const up = c.close >= c.open
        const color = up ? T.up : T.down
        const x = toX(i)
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.lineWidth = 1
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
  }, [size, view.items, range, plot, mode, pipSize, cursor, stepX, toX, toY])

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
