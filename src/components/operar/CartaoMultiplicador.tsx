import { useEffect, useState } from 'react'
import type { OpenContract } from '../../core/deriv/trading'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { formatPrice } from '../../core/chart/scales'
import { useClock } from '../../hooks/useClock'
import './boleta-multiplicador.css'

/**
 * Uma posição de multiplicador (30/10/2026). Sem relógio: não tem prazo. Mostra
 * o resultado ao vivo, de onde entrou e onde está, os limites em vigor (com o
 * preço em que cada um dispara) e as ações: fechar agora, mudar take profit e
 * stop loss, e cancelar enquanto o cancelamento contratado vale. Na conta real,
 * fechar e cancelar pedem o segundo toque, como a compra.
 */

const FINAIS: Record<string, string> = { won: 'Fechou no lucro', lost: 'Fechou na perda', sold: 'Fechada', cancelled: 'Cancelada' }
const TOQUE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
const lerNumero = (t: string) => { const n = Number(t.replace(/\./g, '').replace(',', '.')); return t.trim() === '' ? null : Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : NaN }

export function CartaoMultiplicador({ c, nomeAtivo, real, fechando, aoFechar, aoMudarLimites, aoCancelar }: {
  c: OpenContract
  nomeAtivo: string
  real: boolean
  fechando: boolean
  aoFechar: (id: number) => void
  aoMudarLimites: (id: number, limites: { takeProfit: number | null; stopLoss: number | null }) => Promise<void>
  aoCancelar: (id: number) => Promise<void>
}) {
  const agora = Math.floor(useClock() / 1000)
  const m = c.mult
  const sobe = c.contractType === 'MULTUP'
  const final = FINAIS[c.status] ?? null
  const [armado, setArmado] = useState<'fechar' | 'cancelar' | null>(null)
  const [editando, setEditando] = useState(false)
  const [tp, setTp] = useState('')
  const [sl, setSl] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { if (!armado) return; const t = window.setTimeout(() => setArmado(null), 8000); return () => window.clearTimeout(t) }, [armado])

  const pct = c.buyPrice > 0 ? (c.profit / c.buyPrice) * 100 : 0
  const podeCancelar = !final && !!m?.cancelamentoAte && m.cancelamentoAte > agora
  const ate = m?.cancelamentoAte ? new Date(m.cancelamentoAte * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  const preco = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatPrice(v, c.pipSize))

  const fechar = () => { if (real && armado !== 'fechar') { setArmado('fechar'); return } setArmado(null); aoFechar(c.contractId) }
  const cancelar = async () => {
    if (real && armado !== 'cancelar') { setArmado('cancelar'); return }
    setArmado(null); setOcupado(true); setErro(null)
    try { await aoCancelar(c.contractId) } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  const abrirEdicao = () => {
    setTp(m?.takeProfit ? String(m.takeProfit.valor).replace('.', ',') : '')
    setSl(m?.stopLoss ? String(m.stopLoss.valor).replace('.', ',') : '')
    setErro(null); setEditando((x) => !x)
  }
  const salvar = async () => {
    const t = lerNumero(tp), s = lerNumero(sl)
    if (Number.isNaN(t) || Number.isNaN(s)) { setErro('Use um valor em dólares, como 5 ou 2,50. Em branco tira o limite.'); return }
    setOcupado(true); setErro(null)
    try { await aoMudarLimites(c.contractId, { takeProfit: t, stopLoss: s }); setEditando(false) } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }

  return (
    <article className={`mpos ${final ? (c.profit >= 0 ? 'ganhou' : 'perdeu') : ''}`} aria-label={`Multiplicador ${sobe ? 'Sobe' : 'Desce'} em ${nomeAtivo}`}>
      <div className="mpos-cab">
        <span className={`mpos-dir ${sobe ? 'sobe' : 'desce'}`}>{sobe ? '▲ Sobe' : '▼ Desce'}{m ? ` x${m.multiplicador}` : ''}</span>
        <span className="mpos-ativo">{nomeAtivo}</span>
        <span className="mpos-selo">{final ?? 'Aberta'}</span>
      </div>

      <div className="mpos-res">
        <b className={c.profit >= 0 ? 'sobe' : 'cai'}>{dinheiroComSinal(c.profit, c.currency)}</b>
        <small>{pct >= 0 ? '+' : '−'}{Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da entrada<br />Entrada {dinheiro(c.buyPrice, c.currency)} · vale {dinheiro(Math.max(0, c.bidPrice), c.currency)}</small>
      </div>

      <div className="mpos-precos">
        <span>Entrou em <b>{preco(c.entrySpot)}</b></span>
        <span>{final ? 'Saiu em' : 'Agora'} <b>{preco(final ? c.exitSpot ?? c.currentSpot : c.currentSpot)}</b></span>
      </div>

      {m && !final && (
        <ul className="mpos-lim">
          {m.takeProfit && <li><span>Take profit +{dinheiro(m.takeProfit.valor, c.currency)}</span><b>{preco(m.takeProfit.preco)}</b></li>}
          {m.stopLoss && <li><span>Stop loss −{dinheiro(m.stopLoss.valor, c.currency)}</span><b>{preco(m.stopLoss.preco)}</b></li>}
          {m.stopOut && <li><span>Fecha sozinha (perda de {dinheiro(m.stopOut.valor, c.currency)})</span><b>{preco(m.stopOut.preco)}</b></li>}
          {podeCancelar && <li><span>Dá para cancelar até {ate}: a entrada volta</span><b>{ate}</b></li>}
        </ul>
      )}

      {!final && editando && (
        <div className="mpos-edita">
          <label>Take profit (US$)<input type="text" inputMode="decimal" value={tp} placeholder="Sem" onChange={(e) => setTp(e.target.value.replace(/[^\d.,]/g, ''))} /></label>
          <label>Stop loss (US$)<input type="text" inputMode="decimal" value={sl} placeholder="Sem" onChange={(e) => setSl(e.target.value.replace(/[^\d.,]/g, ''))} /></label>
          <button type="button" onClick={() => void salvar()} disabled={ocupado}>{ocupado ? 'Salvando…' : 'Salvar'}</button>
        </div>
      )}
      {erro && <p className="mpos-erro" role="alert">{erro}</p>}

      {!final && (
        <div className="mpos-acoes">
          <button type="button" className={`principal ${armado === 'fechar' ? 'armado' : ''}`} onClick={fechar} disabled={fechando || !c.isValidToSell}
            title={!c.isValidToSell ? 'A Deriv não deixa fechar agora' : undefined}>
            {fechando ? 'Fechando…' : armado === 'fechar' ? `${TOQUE ? 'Toque' : 'Clique'} de novo para fechar` : `Fechar agora · ${dinheiroComSinal(c.profit, c.currency)}`}
          </button>
          {podeCancelar
            ? <button type="button" className={armado === 'cancelar' ? 'armado' : ''} onClick={() => void cancelar()} disabled={ocupado}>{armado === 'cancelar' ? `${TOQUE ? 'Toque' : 'Clique'} de novo para cancelar` : 'Cancelar operação'}</button>
            : <button type="button" onClick={abrirEdicao} aria-expanded={editando}>{editando ? 'Fechar edição' : 'Limites'}</button>}
        </div>
      )}
    </article>
  )
}
