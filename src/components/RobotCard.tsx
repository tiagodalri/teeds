import type { Identidade } from '../core/deriv/branding'
import { MARCA } from '../marca'
import { NomeDoRobo } from './NomeDoRobo'
import { SimboloDaLinha, iaDaLinha } from './marca/LogotipoDealer'

interface Props {
  id: Identidade
  selecionado: boolean
  onSelecionar: () => void
  /** Quantos deste modelo estão operando agora. */
  operando?: number
}

/** Emblema do robô, desenhado com a cor dele. */
export function Emblema({ id, tamanho = 40 }: { id: Identidade; tamanho?: number }) {
  // linha própria da marca (Dealer): o símbolo com os dígitos da I.A. acesos
  const daLinha = iaDaLinha(id.nome, id.id)
  if (daLinha) return (
    <span className="emblema emblema-linha" style={{ width: tamanho, height: tamanho, background: '#0E0F12', borderRadius: tamanho * 0.275, display: 'inline-grid', placeItems: 'center', ['--ld-haste' as string]: '#D9DCE0', ['--ld-apagado' as string]: '#2E3035' }} aria-hidden="true">
      <SimboloDaLinha ia={daLinha} className="emblema-linha-svg" />
    </span>
  )
  return (
    <svg viewBox="0 0 40 40" width={tamanho} height={tamanho} className="emblema" aria-hidden="true">
      <rect x="0" y="0" width="40" height="40" rx="11" fill={id.corSuave} />
      <path d={id.emblema} fill="none" stroke={id.cor} strokeWidth="2.2"
        strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RobotCard({ id, selecionado, onSelecionar, operando = 0 }: Props) {
  return (
    <button
      className={`rcard ${selecionado ? 'on' : ''}`}
      style={selecionado ? { borderColor: id.cor, background: id.corSuave } : undefined}
      onClick={onSelecionar}
    >
      <div className="rcard-topo">
        <Emblema id={id} />
        {operando > 0 && (
          <span className="rcard-operando" style={{ color: id.cor, background: id.corSuave }}>
            <i style={{ background: id.cor }} /> {operando} operando
          </span>
        )}
      </div>

      <div className="rcard-nome">
        <b><NomeDoRobo nome={id.nome} /></b>
        <span style={{ color: id.cor }}>{id.chamada}</span>
      </div>

      <p className="rcard-desc">{id.descricao}</p>

      <div className="rcard-rodape">
        <span className="rcard-chance">{id.chance}% de chance</span>
        <span className={`rcard-onde ${id.onde}`}>
          {id.onde === 'servidor' ? 'servidor da Deriv' : `roda na ${MARCA.prosa}`}
        </span>
      </div>
    </button>
  )
}
