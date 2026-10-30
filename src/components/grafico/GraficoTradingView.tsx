import { useEffect, useRef, useState, type ReactNode } from 'react'
import './grafico-tradingview.css'

/**
 * O gráfico do TradingView no Manual (30/10/2026, vídeo do Victor: "integrar o
 * TradingView direto na plataforma… pra traçar LTA, LTB, rompimento, Fibonacci").
 *
 * É o widget gratuito "Advanced Real-Time Chart" do TradingView, com os índices
 * que a Deriv publica lá (DERIV:VOLATILITY_75_INDEX…), ao vivo e com as
 * ferramentas de desenho deles. Fica ao lado do nosso gráfico, escolhido no
 * seletor GlobalFly | TradingView: o nosso continua o padrão e nada nele muda.
 *
 * O que ele NÃO faz (é o widget gratuito): não mostra as entradas da pessoa nem
 * o Sinal GF, e os desenhos não ficam salvos de um dia para o outro. A compra e
 * a venda continuam na boleta da plataforma.
 */

/** O código da Deriv (R_75) no nome que a Deriv usa no TradingView. null = não existe lá. */
export function simboloNoTradingView(codigo: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = codigo.match(/^R_(\d+)$/))) return `DERIV:VOLATILITY_${m[1]}_INDEX`
  if ((m = codigo.match(/^1HZ(\d+)V$/))) return `DERIV:VOLATILITY_${m[1]}_1S_INDEX`
  if ((m = codigo.match(/^JD(\d+)$/))) return `DERIV:JUMP_${m[1]}_INDEX`
  if ((m = codigo.match(/^(BOOM|CRASH)(\d+)N?$/))) return `DERIV:${m[1]}_${m[2]}_INDEX`
  if (codigo === 'stpRNG') return 'DERIV:STEP_INDEX'
  if ((m = codigo.match(/^stpRNG(\d)$/))) return `DERIV:STEP_INDEX_${m[1]}00`
  if ((m = codigo.match(/^frx([A-Z]{6})$/))) return `DERIV:${m[1]}`
  return null
}

/** Os tempos da plataforma nos do TradingView. */
const INTERVALO: Record<number, string> = { 60: '1', 120: '2', 180: '3', 300: '5', 600: '10', 900: '15', 1800: '30', 3600: '60', 7200: '120', 14400: '240', 28800: '480', 86400: 'D' }

export function GraficoTradingView({ symbol, symbolName, granularity, mode, barra }: {
  symbol: string
  symbolName: string
  granularity: number
  mode: 'candles' | 'line'
  /** O seletor de gráfico, na mesma barra (e no mesmo lugar) do gráfico GlobalFly. */
  barra: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  /*
    Tela cheia só do gráfico (30/10/2026, Tiago: "um iconezinho de tela cheia no
    cantinho do gráfico"). No computador e no Android é a tela cheia do próprio
    navegador, só com o gráfico; no iPhone (o Safari não deixa) o gráfico cobre
    a tela do aparelho. Esc ou o mesmo ícone volta.
  */
  const [ampliado, setAmpliado] = useState(false)
  const [cheia, setCheia] = useState(false)
  const simbolo = simboloNoTradingView(symbol)

  useEffect(() => {
    const mudou = () => setCheia(document.fullscreenElement === raiz.current && !!raiz.current)
    document.addEventListener('fullscreenchange', mudou)
    return () => document.removeEventListener('fullscreenchange', mudou)
  }, [])
  useEffect(() => {
    if (!ampliado) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliado(false) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ampliado])
  const grande = cheia || ampliado
  const alternarTelaCheia = () => {
    if (cheia) { void document.exitFullscreen().catch(() => undefined); return }
    if (ampliado) { setAmpliado(false); return }
    const el = raiz.current
    if (el && document.fullscreenEnabled && el.requestFullscreen) el.requestFullscreen().catch(() => setAmpliado(true))
    else setAmpliado(true)
  }

  useEffect(() => {
    const el = caixa.current
    if (!el || !simbolo) return
    el.innerHTML = ''
    const alvo = document.createElement('div')
    alvo.className = 'tradingview-widget-container__widget'
    alvo.style.height = '100%'
    alvo.style.width = '100%'
    el.appendChild(alvo)
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: simbolo,
      interval: INTERVALO[granularity] ?? '1',
      timezone: 'America/Sao_Paulo',
      // sempre o visual escuro do próprio TradingView, nos dois temas da plataforma
      // (Tiago: "fundo preto, para diferenciar do tradicional")
      theme: 'dark',
      style: mode === 'line' ? '2' : '1',
      locale: 'br',
      backgroundColor: 'rgba(0, 0, 0, 1)',
      gridColor: 'rgba(242, 242, 242, 0.06)',
      hide_side_toolbar: false,
      hide_volume: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: 'https://www.tradingview.com',
    })
    el.appendChild(script)
    return () => { el.innerHTML = '' }
  }, [simbolo, granularity, mode])

  return (
    <div ref={raiz} className={`gtv${ampliado ? ' gtv-ampliado' : ''}${cheia ? ' gtv-cheia' : ''}`}>
      <div className="gtv-barra">
        <span className="gtv-titulo">{symbolName || symbol}<small> · no TradingView</small></span>
        <div className="gtv-acoes">
          {barra}
          {/* no celular o canto do gráfico é do próprio TradingView: o ícone fica aqui, ao lado do seletor */}
          <button type="button" className="gtv-tela-cheia na-barra" onClick={alternarTelaCheia} aria-pressed={grande}
            title={grande ? 'Sair da tela cheia (Esc)' : 'Tela cheia só do gráfico'} aria-label={grande ? 'Sair da tela cheia' : 'Tela cheia só do gráfico'}>
            {grande
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
          </button>
        </div>
      </div>
      {simbolo ? (
        <div className="gtv-area">
          <div className="gtv-caixa tradingview-widget-container" ref={caixa} />
          <button type="button" className="gtv-tela-cheia no-canto" onClick={alternarTelaCheia} aria-pressed={grande}
            title={grande ? 'Sair da tela cheia (Esc)' : 'Tela cheia só do gráfico'} aria-label={grande ? 'Sair da tela cheia' : 'Tela cheia só do gráfico'}>
            {grande
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
              : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
          </button>
        </div>
      ) : (
        <div className="gtv-sem">
          <b>{symbolName || symbol} não está no TradingView.</b>
          <span>Use o gráfico GlobalFly para este ativo, ou escolha outro ativo, como o 75 Index.</span>
        </div>
      )}
    </div>
  )
}
