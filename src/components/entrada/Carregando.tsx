import { MARCA } from '../../marca'
import { Monograma } from '../marca/Monograma'
import { Aviao } from './Aviao'
import './decolagem.css'

/**
 * O "carregando" da GlobalFly (21/10/2026): o Azul GF da tela de abertura do
 * app, o monograma e uma rota curta em que o avião cruza e deixa o traço de
 * ouro. É o mesmo quadro em que a decolagem pousa, então login → carregando
 * → início é uma cena só, sem troca de cenário no meio.
 */
export function RotaCarregando() {
  return (
    <span className="dg-rota" aria-hidden="true">
      <i className="dg-rota-trilho" />
      <i className="dg-rota-traco" />
      <Aviao className="dg-rota-aviao" largura={18} />
    </span>
  )
}

export function Carregando({ texto = 'Preparando sua cabine' }: { texto?: string }) {
  return (
    <div className="dg-tela" role="status" aria-label={`Abrindo a ${MARCA.prosa}`}>
      <div className="dg-quadro">
        <Monograma tamanho={72} className="dg-monograma" />
        <RotaCarregando />
        <span className="dg-legenda">{texto}</span>
      </div>
    </div>
  )
}
