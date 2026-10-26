/**
 * O cartão das operações no canto do gráfico (26/10/2026, Tiago: "essas coisas
 * não podem ser mostradas num cardzinho flutuante no canto do gráfico? não fica
 * melhor a visualização?"). O gráfico só marca o ponto; o que a operação é,
 * o preço e o resultado ao vivo ficam aqui, sem cobrir as velas.
 *
 *  - aberta: direção, preço de entrada, resultado ao vivo e o tempo que falta,
 *    com uma barrinha de progresso até o vencimento;
 *  - encerrada: a mais recente fica 20 s no cartão (ganhou ou perdeu, saída
 *    com o último dígito e o resultado) e some sozinha; o × fecha antes.
 * Só as que encerraram com o gráfico aberto aparecem como resultado: as que
 * já vinham encerradas ficam só como ponto.
 */
import { useEffect, useRef, useState } from 'react'
import type { ContractMarker } from '../PriceChart'
import { NOMES_DE_CONTRATO } from '../PositionCard'
import { PrecoComDigito } from '../preco/PrecoComDigito'
import { dinheiroComSinal } from '../../core/dinheiro'

const MOSTRA_RESULTADO_MS = 20_000
const aberta = (m: ContractMarker) => !m.status || m.status === 'open'
const sobe = (tipo: string) => /CALL|RISE|UP|HIGHER/i.test(tipo)
const comDirecao = (tipo: string) => /^(CALL|PUT|HIGHER|LOWER|MULTUP|MULTDOWN)$/.test(tipo)
const relogio = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function CartaoDaOperacao({ markers, pipSize, moeda = 'USD' }: { markers: ContractMarker[]; pipSize: number; moeda?: string }) {
  const [agora, setAgora] = useState(() => Date.now())
  const [fechado, setFechado] = useState<number | null>(null)
  // quando cada operação foi vista encerrando (as que já chegam encerradas não contam)
  const visto = useRef(new Map<number, number | null>())
  for (const m of markers) {
    const antes = visto.current.get(m.id)
    if (antes === undefined) visto.current.set(m.id, aberta(m) ? null : -1)
    else if (antes === null && !aberta(m)) visto.current.set(m.id, Date.now())
  }

  const abertas = markers.filter((m) => aberta(m) && m.entryPrice != null).sort((a, b) => b.entryEpoch - a.entryEpoch)
  const recente = markers
    .map((m) => ({ m, quando: visto.current.get(m.id) ?? -1 }))
    .filter((x) => x.quando > 0 && agora - x.quando < MOSTRA_RESULTADO_MS && x.m.id !== fechado)
    .sort((a, b) => b.quando - a.quando)[0]?.m

  const vivo = abertas.length > 0 || !!recente
  useEffect(() => {
    if (!vivo) return
    const t = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [vivo])

  if (!vivo) return null
  const mostradas = abertas.slice(0, 3)
  const nome = (m: ContractMarker) => NOMES_DE_CONTRATO[m.type] ?? (sobe(m.type) ? 'Subir' : 'Descer')
  const total = abertas.reduce((t, m) => t + m.profit, 0)

  return (
    <div className="gpo" role="status" aria-live="polite">
      {mostradas.map((m) => {
        const dura = Math.max(1, m.expiryEpoch - m.entryEpoch)
        const falta = Math.max(0, Math.ceil(m.expiryEpoch - agora / 1000))
        const feito = Math.min(100, Math.max(0, ((dura - falta) / dura) * 100))
        const ganhando = m.profit >= 0
        return (
          <div key={m.id} className={`gpo-op aberta ${sobe(m.type) ? 'sobe' : 'desce'}`}>
            <div className="gpo-topo">
              <span className="gpo-dir">{comDirecao(m.type) && <i aria-hidden="true">{sobe(m.type) ? '▲' : '▼'}</i>}{nome(m)}</span>
              <span className="gpo-tempo">{falta > 0 ? <>faltam <b>{relogio(falta)}</b></> : 'encerrando…'}</span>
            </div>
            <div className="gpo-meio">
              <span className="gpo-preco"><small>Entrada</small><PrecoComDigito valor={m.entryPrice} casas={pipSize} /></span>
              <b className={`gpo-res ${ganhando ? 'ganho' : 'perda'}`}>{dinheiroComSinal(m.profit, moeda)}</b>
            </div>
            <i className="gpo-barra" aria-hidden="true"><i style={{ width: `${feito}%` }} /></i>
          </div>
        )
      })}
      {abertas.length > mostradas.length && (
        <div className="gpo-mais">e mais {abertas.length - mostradas.length} {abertas.length - mostradas.length === 1 ? 'aberta' : 'abertas'} · total <b className={total >= 0 ? 'ganho' : 'perda'}>{dinheiroComSinal(total, moeda)}</b></div>
      )}
      {recente && (
        <div className={`gpo-op encerrada ${recente.profit >= 0 ? 'ganho' : 'perda'}`}>
          <div className="gpo-topo">
            <span className="gpo-dir"><i aria-hidden="true">{recente.profit >= 0 ? '✓' : '✕'}</i>{recente.profit >= 0 ? 'Ganhou' : 'Perdeu'} <small>· {nome(recente)}</small></span>
            <button type="button" className="gpo-x" aria-label="Fechar o resultado" onClick={() => setFechado(recente.id)}>×</button>
          </div>
          <div className="gpo-meio">
            <span className="gpo-preco"><small>Saída</small><PrecoComDigito valor={recente.exitPrice} casas={pipSize} tom={recente.profit >= 0 ? 'ganho' : 'perda'} /></span>
            <b className="gpo-res">{dinheiroComSinal(recente.profit, moeda)}</b>
          </div>
        </div>
      )}
    </div>
  )
}
