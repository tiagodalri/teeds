import { OPCOES_DE_QUADROS, type Quadros } from './estado'
import './seletor.css'

/** O desenho de cada layout: 1, 2 lado a lado, 2×2 e 3×2. */
const DESENHOS: Record<Quadros, Array<[number, number, number, number]>> = {
  1: [[0.7, 0.7, 16.6, 12.6]],
  2: [[0.7, 0.7, 7.6, 12.6], [9.7, 0.7, 7.6, 12.6]],
  4: [[0.7, 0.7, 7.6, 5.6], [9.7, 0.7, 7.6, 5.6], [0.7, 7.7, 7.6, 5.6], [9.7, 7.7, 7.6, 5.6]],
  6: [[0.7, 0.7, 4.6, 5.6], [6.7, 0.7, 4.6, 5.6], [12.7, 0.7, 4.6, 5.6], [0.7, 7.7, 4.6, 5.6], [6.7, 7.7, 4.6, 5.6], [12.7, 7.7, 4.6, 5.6]],
}

/**
 * Quantos ativos na tela. `opcoes` limita (no celular não há 6; numa tela
 * estreita, o 6 fica desativado com a explicação no title).
 */
export function SeletorDeQuadros({ valor, aoTrocar, desativados = [], opcoes = OPCOES_DE_QUADROS, rotulo = true }: {
  valor: Quadros; aoTrocar: (n: Quadros) => void; desativados?: Quadros[]; opcoes?: Quadros[]; rotulo?: boolean
}) {
  return (
    <div className="mtl-seletor">
      {rotulo && <span className="mtl-seletor-rot" id="mtl-seletor-rot">Quadros</span>}
      <div className="mtl-layouts" role="radiogroup" aria-labelledby={rotulo ? 'mtl-seletor-rot' : undefined} aria-label={rotulo ? undefined : 'Quantos ativos na tela'}>
        {opcoes.map((n) => {
          const fora = desativados.includes(n)
          return (
            <button key={n} type="button" role="radio" aria-checked={valor === n} className={valor === n ? 'on' : ''} disabled={fora}
              title={fora ? 'Seis quadros pedem uma tela mais larga' : n === 1 ? '1 ativo (a tela de sempre)' : `${n} ativos ao mesmo tempo`}
              onClick={() => aoTrocar(n)}>
              <svg viewBox="0 0 18 14" aria-hidden="true">{DESENHOS[n].map(([x, y, w, h], i) => <rect key={i} x={x} y={y} width={w} height={h} rx={n === 1 ? 2 : 1.3} />)}</svg>
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}
