import './grafico-tradingview.css'
import { GF_NOME, GF_SIGLA } from '../../marca'

/** GlobalFly | TradingView: o seletor discreto, guardado neste aparelho. */
export type QualGrafico = 'globalfly' | 'tradingview'
const CHAVE = 'globalfly.grafico'
export function graficoGuardado(): QualGrafico {
  try { return localStorage.getItem(CHAVE) === 'tradingview' ? 'tradingview' : 'globalfly' } catch { return 'globalfly' }
}
export function guardarGrafico(qual: QualGrafico) {
  try { localStorage.setItem(CHAVE, qual) } catch { /* sem armazenamento: vale só nesta visita */ }
}
export function SeletorDeGrafico({ valor, aoTrocar }: { valor: QualGrafico; aoTrocar: (q: QualGrafico) => void }) {
  return (
    <div className="seletor-grafico" role="radiogroup" aria-label="Gráfico">
      <button type="button" role="radio" aria-checked={valor === 'globalfly'} className={valor === 'globalfly' ? 'on' : ''} onClick={() => aoTrocar('globalfly')} title={`Gráfico ${GF_NOME}`}>
        <span className="sg-longo">{GF_NOME}</span><span className="sg-curto">{GF_SIGLA}</span>
      </button>
      <button type="button" role="radio" aria-checked={valor === 'tradingview'} className={valor === 'tradingview' ? 'on' : ''} onClick={() => aoTrocar('tradingview')} title="Gráfico TradingView">
        <span className="sg-longo">TradingView</span><span className="sg-curto">TV</span>
      </button>
    </div>
  )
}
