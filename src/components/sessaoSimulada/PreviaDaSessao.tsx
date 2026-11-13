/**
 * A prévia de uma sessão simulada (13/11/2026): a cabine de verdade (CabineDaSessao) parada no momento
 * escolhido da linha do tempo, ou a lista das operações. É o mesmo Ensaio do play, com a mesma fita e a
 * mesma agenda: o que aparece aqui é o que vai acontecer.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { ensaioAte, type PontoDePartida, type Previa, type Roteiro } from '../../core/teeds/sessaoSimulada'
import { CabineDaSessao } from './CabineDaSessao'

const usd = (x: number) => dinheiro(x, 'USD')
const relogio = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

export function PreviaDaSessao({ roteiro, previa, partida, inicio, segundosAte, comFoco = false, ladoALado = false }: {
  roteiro: Roteiro
  previa: Previa
  partida: PontoDePartida
  inicio: number
  /** Em que segundo da sessão termina cada operação (para mostrar o relógio). */
  segundosAte?: number[]
  /**
   * Prévia ao vivo do termômetro: a cabine para no momento mais tenso (depois da última perda da maior
   * sequência, com a maior entrada em andamento) ou no fim; mexer na linha do tempo leva a qualquer operação.
   */
  comFoco?: boolean
  /** Em tela larga, a cabine e a lista das operações aparecem juntas (para validar operação por operação). */
  ladoALado?: boolean
}) {
  const [aba, setAba] = useState<'cabine' | 'operacoes'>('cabine')
  const ops = previa.corrida.ops
  const total = ops.length
  const [opVista, setOpVista] = useState<number | null>(null)
  const [foco, setFoco] = useState<'sequencia' | 'fim'>('sequencia')
  useEffect(() => { setOpVista(null) }, [previa])
  const naSequencia = Math.min(total, previa.maiorSequencia.desde + previa.maiorSequencia.n)
  const n = Math.min(opVista ?? (comFoco && foco === 'sequencia' ? naSequencia : total), total)
  const plano = roteiro.fita ?? previa.resultados
  const foto = useMemo(() => {
    const e = ensaioAte(roteiro, plano, partida, inicio, n)
    return { estado: e.foto(), trecho: e.trecho }
  }, [roteiro, plano, partida, inicio, n])
  const opSel = n > 0 ? ops[n - 1] : null
  const fim = previa.corrida.trechos[0]
  const quando = n > 0 && segundosAte?.[n - 1] !== undefined ? ` · ${relogio(segundosAte[n - 1])}` : ''
  // a lista acompanha o momento escolhido: a operação da vez fica no meio da lista (rola só a lista, não a tela)
  const rolo = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const caixa = rolo.current
    const linha = caixa?.querySelector<HTMLElement>('tr.sel')
    if (!caixa || !linha) return
    caixa.scrollTop = Math.max(0, linha.offsetTop - caixa.clientHeight / 2 + linha.offsetHeight / 2)
  }, [n, previa])

  return (
    <div className={`asi-previa ${ladoALado ? 'lado' : ''}`}>
      {comFoco && (
        <div className="asi-foco">
          <span>A cabine para</span>
          <div className="est-seg" role="radiogroup" aria-label="Momento da prévia">
            <button type="button" role="radio" aria-checked={opVista === null && foco === 'sequencia'} className={opVista === null && foco === 'sequencia' ? 'on' : ''} onClick={() => { setFoco('sequencia'); setOpVista(null) }}><b>Na maior sequência</b></button>
            <button type="button" role="radio" aria-checked={opVista === null && foco === 'fim'} className={opVista === null && foco === 'fim' ? 'on' : ''} onClick={() => { setFoco('fim'); setOpVista(null) }}><b>No fim</b></button>
          </div>
        </div>
      )}
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

      <div className={`asi-previa-corpo aba-${aba}`}>
        <div className="asi-bloco-cabine est-palco robot-workspace">
          <div className="rob-workspace-board modo-lista ssim-quadro">
            <div className="rob-board-slot aberta">
              <CabineDaSessao roteiro={roteiro} estado={foto.estado} trecho={foto.trecho} inicio={inicio} />
            </div>
          </div>
        </div>
        <div className="asi-bloco-tabela est-tabela ssim-tabela">
          <div className="ssim-tabela-rolo" ref={rolo}>
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
      </div>
    </div>
  )
}
