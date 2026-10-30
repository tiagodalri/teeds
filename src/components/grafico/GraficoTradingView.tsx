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

export function GraficoTradingView({ symbol, symbolName, granularity, mode, tema, barra }: {
  symbol: string
  symbolName: string
  granularity: number
  mode: 'candles' | 'line'
  tema: 'claro' | 'escuro'
  /** O seletor de gráfico, na mesma barra (e no mesmo lugar) do gráfico GlobalFly. */
  barra: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const [ampliado, setAmpliado] = useState(false)
  const simbolo = simboloNoTradingView(symbol)

  useEffect(() => {
    if (!ampliado) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAmpliado(false) }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ampliado])

  useEffect(() => {
    const el = caixa.current
    if (!el || !simbolo) return
    el.innerHTML = ''
    const alvo = document.createElement('div')
    alvo.className = 'tradingview-widget-container__widget'
    alvo.style.height = '100%'
    alvo.style.width = '100%'
    el.appendChild(alvo)
    const escuro = tema === 'escuro'
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: simbolo,
      interval: INTERVALO[granularity] ?? '1',
      timezone: 'America/Sao_Paulo',
      theme: escuro ? 'dark' : 'light',
      style: mode === 'line' ? '2' : '1',
      locale: 'br',
      backgroundColor: escuro ? '#051528' : '#ffffff',
      gridColor: escuro ? 'rgba(255, 255, 255, 0.05)' : 'rgba(5, 21, 40, 0.06)',
      hide_side_toolbar: false,
      hide_volume: true,
      allow_symbol_change: false,
      save_image: false,
      calendar: false,
      support_host: 'https://www.tradingview.com',
    })
    el.appendChild(script)
    return () => { el.innerHTML = '' }
  }, [simbolo, granularity, mode, tema])

  return (
    <div className={`gtv${ampliado ? ' gtv-ampliado' : ''}`}>
      <div className="gp-barra gtv-barra">
        <span className="gtv-titulo">{symbolName || symbol}<small> · no TradingView</small></span>
        <div className="gp-tamanho">
          {barra}
          <button type="button" className="gp-botao-ind gp-so-celular" onClick={() => setAmpliado((x) => !x)} aria-pressed={ampliado}
            title={ampliado ? 'Voltar ao tamanho normal' : 'Ampliar o gráfico na tela inteira'} aria-label={ampliado ? 'Fechar o gráfico ampliado' : 'Ampliar o gráfico'}>
            {ampliado
              ? <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></svg>
              : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>}
          </button>
        </div>
      </div>
      {simbolo ? (
        <div className="gtv-area"><div className="gtv-caixa tradingview-widget-container" ref={caixa} /></div>
      ) : (
        <div className="gtv-sem">
          <b>{symbolName || symbol} não está no TradingView.</b>
          <span>Use o gráfico GlobalFly para este ativo, ou escolha outro ativo, como o 75 Index.</span>
        </div>
      )}
    </div>
  )
}
