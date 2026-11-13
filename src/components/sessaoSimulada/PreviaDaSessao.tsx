/**
 * A prévia de uma sessão simulada (13/11/2026): a cabine de verdade (CabineDaSessao) parada no momento
 * escolhido da linha do tempo, ou a lista das operações. É o mesmo Ensaio do play, com a mesma fita e a
 * mesma agenda: o que aparece aqui é o que vai acontecer.
 */
import { useEffect, useMemo, useState } from 'react'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { ensaioAte, type PontoDePartida, type Previa, type Roteiro } from '../../core/teeds/sessaoSimulada'
import { CabineDaSessao } from './CabineDaSessao'

const usd = (x: number) => dinheiro(x, 'USD')
const relogio = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function PreviaDaSessao({ roteiro, previa, partida, inicio, segundosAte }: {
  roteiro: Roteiro
  previa: Previa
  partida: PontoDePartida
  inicio: number
  /** Em que segundo da sessão termina cada operação (para mostrar o relógio). */
  segundosAte?: number[]
}) {
  const [aba, setAba] = useState<'cabine' | 'operacoes'>('cabine')
  const ops = previa.corrida.ops
  const total = ops.length
  const [opVista, setOpVista] = useState<number | null>(null)
  useEffect(() => { setOpVista(null) }, [previa])
  const n = Math.min(opVista ?? total, total)
  const plano = roteiro.fita ?? previa.resultados
  const foto = useMemo(() => {
    const e = ensaioAte(roteiro, plano, partida, inicio, n)
    return { estado: e.foto(), trecho: e.trecho }
  }, [roteiro, plano, partida, inicio, n])
  const opSel = n > 0 ? ops[n - 1] : null
  const fim = previa.corrida.trechos[0]
  const quando = n > 0 && segundosAte?.[n - 1] !== undefined ? ` · ${relogio(segundosAte[n - 1])}` : ''

  return (
    <div className="asi-previa">
      <div className="est-linha">
        <div className="est-linha-topo">
          <span>{n === 0 ? 'Antes da 1ª operação' : n === total ? `Fim · ${total} operações${quando}` : `Depois da operação ${n} de ${total}${quando}`}</span>
          {opSel && (
            <span className={`est-op ${opSel.ganhou ? 'g' : 'p'}`}>
              Op. {n}: entrada {usd(opSel.valor)}{opSel.degrau > 0 ? ` (R${opSel.degrau})` : ''} · {opSel.ganhou ? 'ganhou' : 'perdeu'} {dinheiroComSinal(opSel.lucro, 'USD')} · sessão {dinheiroComSinal(opSel.resultado, 'USD')}
            </span>
          )}
        </div>
        <input type="range" min={0} max={total} value={n} onChange={(e) => setOpVista(Number(e.target.value))} aria-label="Momento da sessão" />
        <div className="est-fita" aria-label="As operações (toque para ver)">
          {ops.map((o, i) => (
            <button key={i} type="button" className={`${o.ganhou ? 'g' : 'p'} ${o.degrau > 0 ? 'rec' : ''} ${i + 1 === n ? 'sel' : ''}`}
              onClick={() => setOpVista(i + 1)} aria-label={`Operação ${i + 1}, ${o.ganhou ? 'ganhou' : 'perdeu'}`} />
          ))}
        </div>
        <div className="est-legenda">
          <span><i className="g" />Ganhou</span><span><i className="p" />Perdeu</span><span><i className="rec" />Na recuperação</span>
          <div className="est-seg asi-abas" role="radiogroup" aria-label="Ver">
            {(['cabine', 'operacoes'] as const).map((a) => (
              <button key={a} type="button" role="radio" aria-checked={aba === a} className={aba === a ? 'on' : ''} onClick={() => setAba(a)}>
                <b>{a === 'cabine' ? 'Cabine' : 'Operações'}</b>
              </button>
            ))}
          </div>
        </div>
      </div>

      {aba === 'cabine' ? (
        <div className="est-palco robot-workspace">
          <div className="rob-workspace-board modo-lista ssim-quadro">
            <div className="rob-board-slot aberta">
              <CabineDaSessao roteiro={roteiro} estado={foto.estado} trecho={foto.trecho} inicio={inicio} />
            </div>
          </div>
        </div>
      ) : (
        <div className="est-tabela ssim-tabela">
          <div className="ssim-tabela-rolo">
            <table>
              <thead><tr><th>#</th><th>Entrada</th><th>Resultado</th><th>Sessão</th><th>Saldo</th></tr></thead>
              <tbody>
                <tr className="ssim-linha-info"><td colSpan={5}>Saldo antes do play: <b>{usd(roteiro.saldo)}</b></td></tr>
                {ops.map((o, i) => (
                  <tr key={i} className={`${o.ganhou ? 'g' : 'p'} ${i + 1 === n ? 'sel' : ''}`} onClick={() => setOpVista(i + 1)}>
                    <td>{i + 1}</td>
                    <td>{usd(o.valor)}{o.degrau > 0 && <em>R{o.degrau}</em>}</td>
                    <td className={o.ganhou ? 'sobe' : 'cai'}>{dinheiroComSinal(o.lucro, 'USD')}</td>
                    <td className={o.resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(o.resultado, 'USD')}</td>
                    <td>{usd(o.saldo)}</td>
                  </tr>
                ))}
                {fim && <tr className="ssim-linha-info"><td colSpan={5}>{fim.tipo === 'meta' ? 'Bateu a meta' : fim.tipo === 'stop' ? 'Bateu o limite de perda' : 'Parou'} · sessão {dinheiroComSinal(fim.resultado, 'USD')}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
