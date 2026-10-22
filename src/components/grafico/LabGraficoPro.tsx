import { useEffect, useState } from 'react'
import type { Candle } from '../../core/deriv/types'
import { GraficoPro } from './GraficoPro'
import type { ChartMode, ContractMarker } from '../PriceChart'

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
  const marcadores: ContractMarker[] = [{ id: 1, type: 'CALL', entryEpoch: ult.epoch - 240, entryPrice: velas[velas.length - 5].close, expiryEpoch: ult.epoch + 120, profit: 0.85 }]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)' }}>
      <div style={{ display: 'flex', gap: 8, padding: 8 }}>
        <button onClick={() => setModo('candles')}>Velas</button><button onClick={() => setModo('line')}>Linha</button>
      </div>
      <div className="chart" style={{ flex: 1 }}>
        <GraficoPro candles={velas} mode={modo} pipSize={2} symbol="R_75" symbolName="75 Index" granularity={60} markers={marcadores} sessao={null} />
      </div>
    </div>
  )
}
