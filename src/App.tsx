import { useMemo, useState } from 'react'
import { PriceChart, type ChartMode } from './components/PriceChart'
import { useCandleSeries, useConnection, useLiveTick, useProposal, useSymbols } from './hooks/useMarket'
import type { Granularity } from './core/deriv/types'
import { formatPrice } from './core/chart/scales'

const TIMEFRAMES: { label: string; value: Granularity }[] = [
  { label: '1m', value: 60 },
  { label: '5m', value: 300 },
  { label: '15m', value: 900 },
  { label: '1h', value: 3600 },
  { label: '4h', value: 14400 },
  { label: '1d', value: 86400 },
]

const STATUS_LABEL: Record<string, string> = {
  idle: 'iniciando',
  connecting: 'conectando',
  open: 'ao vivo',
  reconnecting: 'reconectando',
  closed: 'desconectado',
}

export default function App() {
  const connection = useConnection()
  const { symbols, loading: loadingSymbols, error: symbolsError } = useSymbols()

  const [selected, setSelected] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>(60)
  const [mode, setMode] = useState<ChartMode>('candles')
  const [search, setSearch] = useState('')
  const [stake, setStake] = useState(10)
  const [duration, setDuration] = useState(5)

  // Assim que a lista chega, abre o primeiro ativo disponivel.
  const activeSymbol = useMemo(() => {
    if (selected) return symbols.find((s) => s.symbol === selected) ?? null
    return symbols.find((s) => s.isOpen && !s.isSuspended) ?? symbols[0] ?? null
  }, [symbols, selected])

  const symbolCode = activeSymbol?.symbol ?? null
  const { candles, loading: loadingCandles } = useCandleSeries(symbolCode, granularity)
  const { tick, direction } = useLiveTick(symbolCode)

  const call = useProposal({ symbol: symbolCode, contractType: 'CALL', amount: stake, duration, durationUnit: 'm' })
  const put = useProposal({ symbol: symbolCode, contractType: 'PUT', amount: stake, duration, durationUnit: 'm' })

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = term
      ? symbols.filter((s) => s.name.toLowerCase().includes(term) || s.symbol.toLowerCase().includes(term))
      : symbols
    const map = new Map<string, typeof filtered>()
    for (const s of filtered) {
      const key = s.market || 'outros'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
  }, [symbols, search])

  const pipSize = activeSymbol?.pipSize ?? tick?.pipSize ?? 2
  const price = tick?.quote ?? (candles.length ? candles[candles.length - 1].close : null)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark">T</span>
          <span className="name">Teeds</span>
        </div>
        <div className={`status status-${connection}`}>
          <i /> {STATUS_LABEL[connection] ?? connection}
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <input
            className="search"
            placeholder="Buscar ativo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="symbol-list">
            {loadingSymbols && <p className="hint">carregando ativos…</p>}
            {symbolsError && <p className="hint error">{symbolsError}</p>}
            {groups.map(([market, list]) => (
              <section key={market}>
                <h4>{market.replace(/_/g, ' ')}</h4>
                {list.map((s) => (
                  <button
                    key={s.symbol}
                    className={`symbol ${s.symbol === symbolCode ? 'is-active' : ''}`}
                    onClick={() => setSelected(s.symbol)}
                  >
                    <span className="sym-name">{s.name}</span>
                    <span className={`dot ${s.isOpen && !s.isSuspended ? 'on' : 'off'}`} />
                  </button>
                ))}
              </section>
            ))}
          </div>
        </aside>

        <main className="main">
          <div className="chart-head">
            <div className="chart-title">
              <h2>{activeSymbol?.name ?? '—'}</h2>
              {price !== null && (
                <span className={`price ${direction ?? ''}`}>{formatPrice(price, pipSize)}</span>
              )}
            </div>

            <div className="controls">
              <div className="segmented">
                {TIMEFRAMES.map((tf) => (
                  <button
                    key={tf.value}
                    className={granularity === tf.value ? 'on' : ''}
                    onClick={() => setGranularity(tf.value)}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
              <div className="segmented">
                <button className={mode === 'candles' ? 'on' : ''} onClick={() => setMode('candles')}>
                  Velas
                </button>
                <button className={mode === 'line' ? 'on' : ''} onClick={() => setMode('line')}>
                  Linha
                </button>
              </div>
            </div>
          </div>

          <PriceChart
            candles={candles}
            mode={mode}
            pipSize={pipSize}
            symbolName={activeSymbol?.name ?? ''}
            loading={loadingCandles}
          />
        </main>

        <aside className="trade">
          <h3>Operar</h3>

          <label className="field">
            <span>Valor</span>
            <div className="input-wrap">
              <em>US$</em>
              <input
                type="number"
                min={1}
                value={stake}
                onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
          </label>

          <label className="field">
            <span>Duração</span>
            <div className="input-wrap">
              <input
                type="number"
                min={1}
                value={duration}
                onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 0))}
              />
              <em>min</em>
            </div>
          </label>

          <div className="quotes">
            <QuoteCard
              kind="up"
              title="Subir"
              payout={call.payout}
              stake={stake}
              loading={call.loading}
              error={call.error}
            />
            <QuoteCard
              kind="down"
              title="Descer"
              payout={put.payout}
              stake={stake}
              loading={put.loading}
              error={put.error}
            />
          </div>

          <p className="note">
            Cotações reais da Deriv, em tempo real. A execução de ordens entra na próxima etapa,
            junto com o login da conta.
          </p>
        </aside>
      </div>
    </div>
  )
}

function QuoteCard(props: {
  kind: 'up' | 'down'
  title: string
  payout: number | null
  stake: number
  loading: boolean
  error: string | null
}) {
  const { kind, title, payout, stake, loading, error } = props
  const profit = payout !== null ? payout - stake : null
  const pct = payout !== null && stake > 0 ? ((payout - stake) / stake) * 100 : null

  return (
    <div className={`quote quote-${kind}`}>
      <div className="quote-head">
        <span className="arrow">{kind === 'up' ? '▲' : '▼'}</span>
        <span>{title}</span>
      </div>
      {error ? (
        <p className="quote-error">indisponível</p>
      ) : loading && payout === null ? (
        <p className="quote-loading">…</p>
      ) : payout !== null ? (
        <>
          <strong>US$ {payout.toFixed(2)}</strong>
          <span className="quote-sub">
            lucro US$ {profit?.toFixed(2)} {pct !== null && `· ${pct.toFixed(0)}%`}
          </span>
        </>
      ) : (
        <p className="quote-loading">—</p>
      )}
      <button className="btn" disabled>
        Comprar
      </button>
    </div>
  )
}
