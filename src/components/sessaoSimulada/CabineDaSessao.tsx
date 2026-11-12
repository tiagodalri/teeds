/**
 * A cabine de uma sessão simulada (12/11/2026): a mesma linha (RobotLinha) e a mesma cabine
 * (RobotLive) de uma sessão de verdade. O palco usa ao vivo; o estúdio usa parada, na prévia,
 * para conferir antes do play exatamente o que vai aparecer.
 */
import type { ReactNode } from 'react'
import type { EstadoMotor } from '../../core/deriv/engine'
import { identidade } from '../../core/deriv/branding'
import { NOME_DO_MODO, temModos } from '../../core/deriv/strategies'
import { configDoTrecho, estrategiaDa, nomeDaIa, parametrosDa, type Roteiro } from '../../core/teeds/sessaoSimulada'
import { RobotLive } from '../RobotLive'
import { RobotLinha } from '../RobotResumo'

const din = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function identidadeDaSessao(ia: string) {
  return { ...identidade(ia), nome: nomeDaIa(ia) }
}

export function CabineDaSessao({ roteiro, estado, trecho, inicio, mostrarMarkup = false, onDesligar, onLigarDeNovo, children }: {
  roteiro: Roteiro
  estado: EstadoMotor
  trecho: number
  inicio: number
  mostrarMarkup?: boolean
  onDesligar?: () => void
  onLigarDeNovo?: () => void
  children?: ReactNode
}) {
  const ident = identidadeDaSessao(roteiro.ia)
  const t = roteiro.trechos[Math.min(trecho, roteiro.trechos.length - 1)]
  const cfg = configDoTrecho(roteiro, t)
  const est = estrategiaDa(roteiro.ia)
  const demo = roteiro.conta === 'demo'
  const emCurso = estado.emCurso
  const ultima = estado.historico[0]
  const tipoAgora = emCurso?.contractType ?? ultima?.contractType ?? est.contractType
  const b = emCurso?.barreira ?? ultima?.barreira ?? est.barreira ?? 5
  const regra = ({ DIGITOVER: `maior que ${b}`, DIGITUNDER: `menor que ${b}`, DIGITMATCH: `igual a ${b}`, DIGITDIFF: `diferente de ${b}`, DIGITEVEN: 'par', DIGITODD: 'ímpar' } as Record<string, string>)[tipoAgora] ?? tipoAgora
  const ganhaCom = (d: number) => tipoAgora === 'DIGITOVER' ? d > b : tipoAgora === 'DIGITUNDER' ? d < b : tipoAgora === 'DIGITMATCH' ? d === b : tipoAgora === 'DIGITDIFF' ? d !== b : tipoAgora === 'DIGITEVEN' ? d % 2 === 0 : tipoAgora === 'DIGITODD' ? d % 2 === 1 : false
  const comModos = temModos(roteiro.ia, parametrosDa(roteiro.ia))
  const modo = comModos ? NOME_DO_MODO[roteiro.modo ?? 'conservador'] : null
  const parametros = [
    { rot: 'Ativo', valor: 'Volatility 75' },
    { rot: 'Entrada', valor: din(cfg.valorAoVencer) },
    { rot: 'Recuperação', valor: cfg.fatorGale === 0 ? 'Desligada' : modo ? `Modo ${modo.toLowerCase()}` : 'Automática' },
    { rot: 'Valor máximo por entrada', valor: cfg.valorMaximo > 0 ? din(cfg.valorMaximo) : 'Sem máximo' },
    { rot: 'Meta de ganho', valor: cfg.takeProfit > 0 ? din(cfg.takeProfit) : 'Sem meta' },
    { rot: 'Limite de perda', valor: cfg.stopLoss > 0 ? din(cfg.stopLoss) : 'Sem limite' },
  ]
  const rodando = estado.rodando
  return (
    <div className={`cabine-caixa aberta ssim-cabine ${rodando ? 'rodando' : 'parado'}`} style={{ ['--robo' as string]: ident.cor, ['--robo-suave' as string]: ident.corSuave }}>
      <RobotLinha estado={estado} config={cfg} moeda="USD" nome={ident.nome} cor={ident.cor} numero="#1" inicio={inicio} demo={demo}
        rotulosTrocados={false} demoComoReal={false} modo={modo ? modo.toLowerCase() : null} conexao="open" ceo={mostrarMarkup}
        onDesligar={rodando ? onDesligar : undefined} desligando={false} onLigarDeNovo={!rodando ? onLigarDeNovo : undefined} aberta />
      <RobotLive
        estado={estado} config={cfg} moeda="USD" contaDaSessao={{ contaId: 'simulada', demo, moeda: 'USD' }}
        estrategiaId={roteiro.ia} nomeEstrategia={ident.nome} ativo="Volatility 75" titulo="#1" regra={regra} cor={ident.cor}
        ganhaCom={ganhaCom} parametros={parametros} conexao="open" mostrarMarkup={mostrarMarkup} esconderDemo={false}
        onDesligar={rodando ? onDesligar : undefined} onLigarDeNovo={!rodando ? onLigarDeNovo : undefined} />
      {children}
    </div>
  )
}
