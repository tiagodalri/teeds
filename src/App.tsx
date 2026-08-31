import { useMemo, useState } from 'react'
import { PriceChart, type ChartMode, type ContractMarker } from './components/PriceChart'
import { PositionCard } from './components/PositionCard'
import { useCandleSeries, useConnection, useLiveTick, useProposal, useSymbols } from './hooks/useMarket'
import { useAccount } from './hooks/useAccount'
import type { Granularity } from './core/deriv/types'
import { formatPrice } from './core/chart/scales'
import { buyFromProposal, requestProposal, sellContract } from './core/deriv/trading'

const TIMEFRAMES: { label: string; value: Granularity }[] = [
  { label: '1m', value: 60 }, { label: '5m', value: 300 }, { label: '15m', value: 900 },
  { label: '1h', value: 3600 }, { label: '4h', value: 14400 }, { label: '1d', value: 86400 },
]

const STATUS_LABEL: Record<string, string> = {
  idle: 'iniciando', connecting: 'conectando', open: 'ao vivo',
  reconnecting: 'reconectando', closed: 'desconectado',
}

export default function App() {
  const connection = useConnection()
  const { symbols, loading: loadingSymbols, error: symbolsError } = useSymbols()
  const conta = useAccount()

  const [selected, setSelected] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>(60)
  const [mode, setMode] = useState<ChartMode>('candles')
  const [search, setSearch] = useState('')
  const [stake, setStake] = useState(10)
  const [duration, setDuration] = useState(5)
  const [comprando, setComprando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [confirmar, setConfirmar] = useState<'CALL' | 'PUT' | null>(null)
  const [vendendo, setVendendo] = useState<number | null>(null)

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
  const doAtivo = conta.contracts.filter((c) => c.symbol === symbolCode)
  const marcadores: ContractMarker[] = doAtivo.map((c) => ({
    id: c.contractId, type: c.contractType, entryEpoch: c.startTime,
    entryPrice: c.entrySpot, expiryEpoch: c.expiryTime, profit: c.profit,
  }))
  const investido = conta.contracts.reduce((t, c) => t + c.buyPrice, 0)
  const resultadoAberto = conta.contracts.reduce((t, c) => t + c.profit, 0)

  const podeOperar = conta.status === 'logado' && !!conta.socket && !conta.connecting && !!symbolCode

  async function comprar(tipo: 'CALL' | 'PUT') {
    if (!conta.socket || !symbolCode) return
    if (!conta.isDemo && confirmar !== tipo) { setConfirmar(tipo); return }
    setConfirmar(null)
    setComprando(tipo)
    setAviso(null)
    try {
      const p = await requestProposal(conta.socket, {
        symbol: symbolCode, contractType: tipo, amount: stake,
        duration, durationUnit: 'm', currency: conta.account?.currency ?? 'USD',
      })
      const r = await buyFromProposal(conta.socket, p.id, p.askPrice)
      setAviso({ tipo: 'ok', texto: `Comprado por ${r.buyPrice.toFixed(2)} — pagamento potencial ${r.payout.toFixed(2)}` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setComprando(null)
    }
  }

  async function vender(contractId: number) {
    if (!conta.socket) return
    setVendendo(contractId)
    setAviso(null)
    try {
      const r = await sellContract(conta.socket, contractId, 0)
      setAviso({ tipo: 'ok', texto: `Vendido por ${r.soldFor.toFixed(2)}` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setVendendo(null)
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="mark">T</span><span className="name">Teeds</span></div>

        <div className="topbar-right">
          {conta.status === 'logado' && conta.accounts.length > 0 && (
            <div className="account-box">
              <select
                className="account-select"
                value={conta.accountId ?? ''}
                onChange={(e) => conta.setAccountId(e.target.value)}
              >
                {conta.accounts.map((a) => (
                  <option key={a.accountId} value={a.accountId}>
                    {a.type === 'demo' ? 'Demo' : 'Real'} · {a.accountId}
                  </option>
                ))}
              </select>
              <span className={`badge ${conta.isDemo ? 'badge-demo' : 'badge-real'}`}>
                {conta.isDemo ? 'dinheiro fictício' : 'DINHEIRO REAL'}
              </span>
              <strong className="saldo">
                {conta.balance
                  ? `${conta.balance.currency} ${conta.balance.amount.toFixed(2)}`
                  : conta.connecting ? 'conectando…' : '—'}
              </strong>
              {conta.isDemo && (
                <button className="link-btn" onClick={() => conta.recarregarDemo()}>recarregar</button>
              )}
              <button className="link-btn" onClick={conta.logout}>sair</button>
            </div>
          )}

          {conta.status !== 'logado' && (
            <button className="btn-login" onClick={conta.login}>
              {conta.status === 'entrando' ? 'abrindo…' : 'Entrar com Deriv'}
            </button>
          )}

          <div className={`status status-${connection}`}><i /> {STATUS_LABEL[connection] ?? connection}</div>
        </div>
      </header>

      {conta.error && (
        <div className="faixa faixa-erro">
          {conta.error}
          <button onClick={() => conta.setError(null)}>fechar</button>
        </div>
      )}

      <div className="layout">
        <aside className="sidebar">
          <input className="search" placeholder="Buscar ativo…" value={search}
            onChange={(e) => setSearch(e.target.value)} />
          <div className="symbol-list">
            {loadingSymbols && <p className="hint">carregando ativos…</p>}
            {symbolsError && <p className="hint error">{symbolsError}</p>}
            {groups.map(([market, list]) => (
              <section key={market}>
                <h4>{market.replace(/_/g, ' ')}</h4>
                {list.map((s) => (
                  <button key={s.symbol}
                    className={`symbol ${s.symbol === symbolCode ? 'is-active' : ''}`}
                    onClick={() => setSelected(s.symbol)}>
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
              {price !== null && <span className={`price ${direction ?? ''}`}>{formatPrice(price, pipSize)}</span>}
            </div>
            <div className="controls">
              <div className="segmented">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf.value} className={granularity === tf.value ? 'on' : ''}
                    onClick={() => setGranularity(tf.value)}>{tf.label}</button>
                ))}
              </div>
              <div className="segmented">
                <button className={mode === 'candles' ? 'on' : ''} onClick={() => setMode('candles')}>Velas</button>
                <button className={mode === 'line' ? 'on' : ''} onClick={() => setMode('line')}>Linha</button>
              </div>
            </div>
          </div>

          <PriceChart candles={candles} mode={mode} pipSize={pipSize}
            symbolName={activeSymbol?.name ?? ''} loading={loadingCandles}
            markers={marcadores} />
        </main>

        <aside className="trade">
          <h3>Operar</h3>

          <label className="field"><span>Valor</span>
            <div className="input-wrap"><em>US$</em>
              <input type="number" min={1} value={stake}
                onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))} />
            </div>
          </label>

          <label className="field"><span>Duração</span>
            <div className="input-wrap">
              <input type="number" min={1} value={duration}
                onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 0))} />
              <em>min</em>
            </div>
          </label>

          <div className="quotes">
            <QuoteCard kind="up" title="Subir" payout={call.payout} stake={stake}
              loading={call.loading} error={call.error} podeOperar={podeOperar}
              comprando={comprando === 'CALL'} confirmando={confirmar === 'CALL'}
              onBuy={() => comprar('CALL')} logado={conta.status === 'logado'} />
            <QuoteCard kind="down" title="Descer" payout={put.payout} stake={stake}
              loading={put.loading} error={put.error} podeOperar={podeOperar}
              comprando={comprando === 'PUT'} confirmando={confirmar === 'PUT'}
              onBuy={() => comprar('PUT')} logado={conta.status === 'logado'} />
          </div>

          {aviso && (
            <p className={`aviso ${aviso.tipo === 'ok' ? 'aviso-ok' : 'aviso-erro'}`}>{aviso.texto}</p>
          )}

          <div className="pos-cabecalho">
            <h3 className="sec">Posições abertas</h3>
            {conta.contracts.length > 0 && (
              <div className="pos-resumo">
                <span>{conta.contracts.length} aberta{conta.contracts.length > 1 ? 's' : ''}</span>
                <span>investido <b>{investido.toFixed(2)}</b></span>
                <span className={resultadoAberto >= 0 ? 'ganho' : 'perda'}>
                  {resultadoAberto >= 0 ? '+' : '−'}{Math.abs(resultadoAberto).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {conta.status !== 'logado' && <p className="note">Entre com sua conta Deriv para operar.</p>}
          {conta.status === 'logado' && conta.contracts.length === 0 && (
            <p className="note">Nenhuma posição aberta. Suas operações aparecem aqui, com o resultado ao vivo.</p>
          )}

          <div className="posicoes">
            {conta.contracts.map((c) => (
              <PositionCard
                key={c.contractId}
                contrato={c}
                nomeAtivo={symbols.find((s) => s.symbol === c.symbol)?.name ?? c.symbol}
                onVender={vender}
                vendendo={vendendo === c.contractId}
              />
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function QuoteCard(props: {
  kind: 'up' | 'down'; title: string; payout: number | null; stake: number
  loading: boolean; error: string | null; podeOperar: boolean; logado: boolean
  comprando: boolean; confirmando: boolean; onBuy: () => void
}) {
  const { kind, title, payout, stake, loading, error, podeOperar, logado, comprando, confirmando, onBuy } = props
  const lucro = payout !== null ? payout - stake : null
  const pct = payout !== null && stake > 0 ? ((payout - stake) / stake) * 100 : null

  return (
    <div className={`quote quote-${kind}`}>
      <div className="quote-head">
        <span className="arrow">{kind === 'up' ? '▲' : '▼'}</span><span>{title}</span>
      </div>
      {error ? <p className="quote-error">indisponível</p>
        : loading && payout === null ? <p className="quote-loading">…</p>
        : payout !== null ? (
          <>
            <strong>US$ {payout.toFixed(2)}</strong>
            <span className="quote-sub">lucro US$ {lucro?.toFixed(2)}{pct !== null && ` · ${pct.toFixed(0)}%`}</span>
          </>
        ) : <p className="quote-loading">—</p>}
      <button className={`btn ${confirmando ? 'btn-confirmar' : ''}`}
        disabled={!podeOperar || comprando} onClick={onBuy}>
        {comprando ? 'comprando…'
          : confirmando ? 'Confirmar (dinheiro real)'
          : !logado ? 'Entre para operar'
          : 'Comprar'}
      </button>
    </div>
  )
}
