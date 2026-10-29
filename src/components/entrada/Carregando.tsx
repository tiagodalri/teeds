import { useEffect, useState } from 'react'
import { MARCA } from '../../marca'
import { sair } from '../../core/teeds/conta'
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

/** Depois disso, o carregando oferece a saída (28/10/2026: "só fica carregando"). */
const DEMOROU = 15_000

export function Carregando({ texto = 'Preparando sua cabine' }: { texto?: string }) {
  const [demorou, setDemorou] = useState(false)
  useEffect(() => { const t = window.setTimeout(() => setDemorou(true), DEMOROU); return () => window.clearTimeout(t) }, [])
  const entrarDeNovo = async () => { await sair(); location.reload() }
  return (
    <div className="dg-tela" role="status" aria-label={`Abrindo a ${MARCA.prosa}`}>
      <div className="dg-quadro">
        <Monograma tamanho={72} className="dg-monograma" />
        <RotaCarregando />
        <span className="dg-legenda">{texto}</span>
        {demorou && (
          <div className="dg-demorou" role="alert">
            <p>Está demorando mais que o normal. Confira a internet e tente de novo.</p>
            <div>
              <button type="button" className="dg-demorou-tentar" onClick={() => location.reload()}>Tentar de novo</button>
              <button type="button" className="dg-demorou-sair" onClick={() => void entrarDeNovo()}>Sair e entrar de novo</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * O "abrindo" das marcas sem a cena de voo (OMNI e Teeds) e da espera dos
 * termos (29/10/2026): o mesmo prazo de 15 s e a mesma saída do Carregando,
 * no visual da tela de entrada.
 */
export function Abrindo() {
  const [demorou, setDemorou] = useState(false)
  useEffect(() => { const t = window.setTimeout(() => setDemorou(true), DEMOROU); return () => window.clearTimeout(t) }, [])
  const entrarDeNovo = async () => { await sair(); location.reload() }
  return (
    <div className="entrada">
      <div className="entrada-abrindo">
        <div className="entrada-esperando" role="status">Abrindo a {MARCA.prosa}…</div>
        {demorou && (
          <div className="entrada-abrindo-demorou" role="alert">
            <p>Está demorando mais que o normal. Confira a internet e tente de novo.</p>
            <button type="button" className="entrada-btn" onClick={() => location.reload()}>Tentar de novo</button>
            <button type="button" className="entrada-abrindo-sair" onClick={() => void entrarDeNovo()}>Sair e entrar de novo</button>
          </div>
        )}
      </div>
    </div>
  )
}
