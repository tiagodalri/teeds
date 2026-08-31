import { useEffect, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { MotorTeeds, type ConfigEstrategia, type EstadoMotor } from '../core/deriv/engine'
import { ESTRATEGIAS_LOCAIS } from '../core/deriv/strategies'
import type { ActiveSymbol } from '../core/deriv/types'
import { RobotLive } from './RobotLive'
import { Emblema } from './RobotCard'
import type { Identidade } from '../core/deriv/branding'

interface Props {
  socket: TeedsSocket | null
  isDemo: boolean
  moeda: string
  symbols: ActiveSymbol[]
  symbolPadrao: string | null
  identidade: Identidade
}

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hora = (e: number) =>
  new Date(e * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

export function LocalRobotPanel({ socket, isDemo, moeda, symbols, symbolPadrao, identidade }: Props) {
  const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === identidade.id) ?? ESTRATEGIAS_LOCAIS[0]
  const [symbol, setSymbol] = useState(symbolPadrao ?? 'R_10')
  const [cfg, setCfg] = useState<ConfigEstrategia>({
    valorInicial: 0.35,
    valorAoVencer: 0.35,
    fatorGale: 0.7,
    galeApos: 2,
    valorMaximo: 10,
    takeProfit: 5,
    stopLoss: 10,
    maxOperacoes: 100,
  })
  const [estado, setEstado] = useState<EstadoMotor | null>(null)
  const [confirmaReal, setConfirmaReal] = useState(false)
  const motorRef = useRef<MotorTeeds | null>(null)

  useEffect(() => { if (symbolPadrao) setSymbol(symbolPadrao) }, [symbolPadrao])
  useEffect(() => () => { motorRef.current?.desligar('página fechada') }, [])

  const pip = symbols.find((s) => s.symbol === symbol)?.pipSize ?? 2
  const nomeAtivo = symbols.find((s) => s.symbol === symbol)?.name ?? symbol
  const rodando = estado?.rodando ?? false

  // a regra do contrato dita em uma frase, para a tela nao falar em codigo
  const b = estrategia.barreira ?? 5
  const regra = {
    DIGITOVER: `maior que ${b}`,
    DIGITUNDER: `menor que ${b}`,
    DIGITMATCH: `igual a ${b}`,
    DIGITDIFF: `diferente de ${b}`,
    DIGITEVEN: 'par',
    DIGITODD: 'ímpar',
  }[estrategia.contractType] ?? estrategia.contractType

  const ganhaCom = (d: number) => {
    switch (estrategia.contractType) {
      case 'DIGITOVER': return d > b
      case 'DIGITUNDER': return d < b
      case 'DIGITMATCH': return d === b
      case 'DIGITDIFF': return d !== b
      case 'DIGITEVEN': return d % 2 === 0
      case 'DIGITODD': return d % 2 === 1
      default: return false
    }
  }

  function ligar() {
    if (!socket) return
    if (!isDemo && !confirmaReal) { setConfirmaReal(true); return }
    setConfirmaReal(false)
    const motor = new MotorTeeds({ socket, estrategia, config: cfg, symbol, moeda, pipSize: pip })
    motorRef.current = motor
    motor.escutar(setEstado)
    motor.ligar()
  }

  function desligar() {
    motorRef.current?.desligar()
  }

  const campo = (k: keyof ConfigEstrategia, rotulo: string, passo = 0.05) => (
    <label>
      <span className="rot">{rotulo}</span>
      <input type="number" step={passo} min={0} value={cfg[k]} disabled={rodando}
        onChange={(e) => setCfg((c) => ({ ...c, [k]: Math.max(0, Number(e.target.value) || 0) }))} />
    </label>
  )

  return (
    <div className={`rob-grade config-robo ${rodando ? 'em-acao' : ''}`}
      style={{ ["--robo" as any]: identidade.cor, ["--robo-suave" as any]: identidade.corSuave }}>
      <section className="ger-bloco">
        <div className="config-cab">
          <Emblema id={identidade} tamanho={44} />
          <div>
            <b>{identidade.nome}</b>
            <span>{identidade.descricao}</span>
          </div>
        </div>

        <div className="rob-linha">
          <label><span className="rot">Ativo</span>
            <select value={symbol} disabled={rodando} onChange={(e) => setSymbol(e.target.value)}>
              {symbols.filter((s) => s.isOpen).map((s) => (
                <option key={s.symbol} value={s.symbol}>{s.name}</option>
              ))}
            </select>
          </label>
          {campo('valorAoVencer', 'Valor da entrada')}
          {campo('valorMaximo', 'Valor máximo', 1)}
        </div>

        <span className="rot" style={{ marginTop: 16 }}>Progressão após perder</span>
        <div className="rob-linha">
          {campo('fatorGale', 'Fator de gale', 0.1)}
          {campo('galeApos', 'Ativar após (perdas)', 1)}
          {campo('maxOperacoes', 'Máx. operações', 10)}
        </div>

        <span className="rot" style={{ marginTop: 16 }}>Freios</span>
        <div className="rob-linha">
          {campo('takeProfit', 'Parar se ganhar', 1)}
          {campo('stopLoss', 'Parar se perder', 1)}
        </div>

        {confirmaReal && (
          <p className="rob-alerta">
            Você está na <strong>conta real</strong>. Clique de novo para confirmar.
          </p>
        )}

        <button className={`btn btn-ligar ${rodando ? 'btn-parar' : ''} ${confirmaReal ? 'btn-confirmar' : ''}`}
          disabled={!socket} onClick={rodando ? desligar : ligar}>
          {rodando ? 'Desligar robô' : confirmaReal ? 'Confirmar com dinheiro real' : `Ligar ${estrategia.nome}`}
        </button>

        <p className="ger-nota">
          Este robô roda dentro da Teeds. Ele para se você fechar a aba — diferente dos robôs
          de servidor, que continuam sozinhos.
        </p>
      </section>

      {/* ------------- acompanhamento ao vivo ------------- */}
      <section className="ger-bloco viv-bloco">
        {!estado ? (
          <>
            <span className="rot">Ao vivo</span>
            <p className="ger-nota">Ligue o robô para acompanhar aqui.</p>
          </>
        ) : (
          <RobotLive
            estado={estado}
            config={cfg}
            moeda={moeda}
            nomeEstrategia={estrategia.nome}
            ativo={nomeAtivo}
            regra={regra}
            cor={identidade.cor}
            ganhaCom={ganhaCom}
          />
        )}
      </section>
    </div>
  )
}
