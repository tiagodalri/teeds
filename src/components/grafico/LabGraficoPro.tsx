import { useEffect, useState } from 'react'
import type { Candle } from '../../core/deriv/types'
import { GraficoPro } from './GraficoPro'
import type { ChartMode, ContractMarker } from '../PriceChart'
import { useCandleSeries } from '../../hooks/useMarket'

/** ?tela=grafico-pro: o gráfico profissional com velas de exemplo que andam a cada segundo. */
export default function LabGraficoPro() {
  const [velas, setVelas] = useState<Candle[]>(() => {
    const agora = Math.floor(Date.now() / 60000) * 60
    let preco = 1180
    return Array.from({ length: 300 }, (_, i) => {
      const abre = preco
      const fecha = abre + (Math.sin(i / 9) * 2.4 + (Math.random() - 0.5) * 3)
      const alta = Math.max(abre, fecha) + Math.random() * 1.6, baixa = Math.min(abre, fecha) - Math.random() * 1.6
      preco = fecha
      return { epoch: agora - (299 - i) * 60, open: abre, high: alta, low: baixa, close: fecha }
    })
  })
  const [modo, setModo] = useState<ChartMode>('candles')
  // &real=1: velas de verdade do 75 Index (5 min), para ver o Sinal GF no mercado real
  const REAL = new URLSearchParams(location.search).has('real')
  const reais = useCandleSeries(REAL ? 'R_75' : null, 300)
  const RAPIDO = new URLSearchParams(location.search).has('rapido')
  useEffect(() => {
    const t = setInterval(() => setVelas((v) => {
      const ult = v[v.length - 1]
      const novoPreco = ult.close + (Math.random() - 0.5) * 1.2
      // &rapido=1: uma vela nova a cada 2 s (para testar o gráfico recebendo velas ao vivo)
      const agora = RAPIDO ? (Math.random() < 0.5 ? ult.epoch + 60 : ult.epoch) : Math.floor(Date.now() / 60000) * 60
      if (agora > ult.epoch) return [...v.slice(-999), { epoch: agora, open: ult.close, high: Math.max(ult.close, novoPreco), low: Math.min(ult.close, novoPreco), close: novoPreco }]
      return [...v.slice(0, -1), { ...ult, close: novoPreco, high: Math.max(ult.high, novoPreco), low: Math.min(ult.low, novoPreco) }]
    }), 1000)
    return () => clearInterval(t)
  }, [])
  const ult = velas[velas.length - 1]
  // &fecha=1: uma segunda operação abre e encerra no prejuízo 8 s depois (para ver o resultado no cartão)
  const FECHA = new URLSearchParams(location.search).has('fecha')
  const [inicio] = useState(() => Math.floor(Date.now() / 1000))
  const [fechou, setFechou] = useState(false)
  useEffect(() => { if (!FECHA) return; const t = setTimeout(() => setFechou(true), 8000); return () => clearTimeout(t) }, [FECHA])
  // uma aberta, duas iguais que fecharam no prejuízo (o caso do print de 26/10/2026) e uma no lucro
  const v = (i: number) => velas[velas.length - i]
  const marcadores: ContractMarker[] = [
    { id: 1, type: 'CALL', entryEpoch: ult.epoch - 240, entryPrice: v(5).close, expiryEpoch: ult.epoch + 120, profit: 0.85 },
    { id: 2, type: 'CALL', entryEpoch: v(14).epoch, entryPrice: v(14).close, expiryEpoch: v(11).epoch, profit: -0.16, status: 'sold', exitPrice: v(11).close },
    { id: 3, type: 'CALL', entryEpoch: v(14).epoch, entryPrice: v(14).close, expiryEpoch: v(11).epoch, profit: -0.24, status: 'sold', exitPrice: v(11).close },
    { id: 4, type: 'PUT', entryEpoch: v(24).epoch, entryPrice: v(24).close, expiryEpoch: v(20).epoch, profit: 0.92, status: 'won', exitPrice: v(20).close },
    // o print de 26/10/2026 (2): duas de −10,00 no mesmo instante com saídas quase iguais, e uma de −1,07 logo depois
    { id: 5, type: 'CALL', entryEpoch: v(34).epoch, entryPrice: v(34).close, expiryEpoch: v(31).epoch, profit: -10, status: 'lost', exitPrice: v(31).close },
    { id: 6, type: 'CALL', entryEpoch: v(34).epoch, entryPrice: v(34).close + 0.4, expiryEpoch: v(31).epoch, profit: -10, status: 'lost', exitPrice: v(31).close + 0.3 },
    ...(FECHA ? [{ id: 8, type: 'PUT', entryEpoch: inicio, entryPrice: v(2).close, expiryEpoch: inicio + 10, profit: fechou ? -0.62 : -0.31, ...(fechou ? { status: 'lost', exitPrice: ult.close } : {}) }] : []),
    { id: 7, type: 'PUT', entryEpoch: v(33).epoch, entryPrice: v(33).close, expiryEpoch: v(30).epoch, profit: -1.07, status: 'lost', exitPrice: v(30).close - 0.5 },
  ]
  /*
    &cena=1 (16/11/2026): velas reais do 75 Index em 1 min e as operações em cima delas, como na
    tela do Manual: uma Venda aberta (entrou há 4 velas, vence em 2 min) e duas encerradas.
  */
  const CENA = new URLSearchParams(location.search).has('cena')
  const reais1m = useCandleSeries(CENA && REAL ? 'R_75' : null, 60)
  // sem &real: velas no jeito do 75 Index (passeio aleatório com semente fixa), para a foto sair sem depender da rede
  const [velasCena] = useState<Candle[]>(() => {
    let x = 7, preco = 39480
    const sorte = () => { x = (x * 9301 + 49297) % 233280; return x / 233280 }
    const fim = Math.floor(Date.now() / 60000) * 60
    return Array.from({ length: 160 }, (_, i) => {
      const abre = preco
      const fecha = abre + (sorte() - .5) * 46 + Math.sin(i / 14) * 6
      const alta = Math.max(abre, fecha) + sorte() * 14, baixa = Math.min(abre, fecha) - sorte() * 14
      preco = fecha
      return { epoch: fim - (159 - i) * 60, open: abre, high: alta, low: baixa, close: fecha }
    })
  })
  const [abriuEm] = useState(() => Math.floor(Date.now() / 60000) * 60 - 200)
  const cena: ContractMarker[] = (() => {
    const c = REAL ? reais1m.candles : velasCena
    if (c.length < 40) return []
    const u = c[c.length - 1], r = (i: number) => c[c.length - i]
    const entrada = r(4).close
    const lucro = Math.max(-9.6, Math.min(7.83, ((entrada - u.close) / entrada) * 40000))
    return [
      { id: 11, type: 'PUT', entryEpoch: abriuEm, entryPrice: entrada, expiryEpoch: abriuEm + 300, profit: +lucro.toFixed(2) },
      { id: 12, type: 'CALL', entryEpoch: r(22).epoch, entryPrice: r(22).close, expiryEpoch: r(17).epoch, profit: 15.67, status: 'won', exitPrice: r(17).close },
      { id: 13, type: 'PUT', entryEpoch: r(34).epoch, entryPrice: r(34).close, expiryEpoch: r(29).epoch, profit: -10, status: 'lost', exitPrice: r(29).close },
    ]
  })()
  if (CENA) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
        <div className="chart" style={{ flex: 1 }}>
          <GraficoPro candles={REAL ? reais1m.candles : velasCena} mode="candles" pipSize={4} symbol="R_75" symbolName="75 Index" granularity={60} loading={REAL && reais1m.loading} markers={cena} sessao={null} sinalLiberado={false} />
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      {/* o mesmo seletor do Operar (antes eram dois botões crus do navegador) */}
      <div style={{ display: 'flex', gap: 8, padding: 8 }}>
        <div className="segmented">
          <button className={modo === 'candles' ? 'on' : ''} onClick={() => setModo('candles')}>Velas</button>
          <button className={modo === 'line' ? 'on' : ''} onClick={() => setModo('line')}>Linha</button>
        </div>
      </div>
      <div className="chart" style={{ flex: 1 }}>
        <GraficoPro candles={REAL ? reais.candles : velas} mode={modo} pipSize={2} symbol="R_75" symbolName="75 Index" granularity={REAL ? 300 : 60} loading={REAL && reais.loading} markers={REAL ? [] : marcadores} sessao={null} sinalLiberado={!new URLSearchParams(location.search).has('semsinal')} />
      </div>
    </div>
  )
}
