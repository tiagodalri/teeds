import { useState } from 'react'
import { BotaoCompra, ResumoDaCompra } from '../operar/Boleta'
import { PainelDeComando } from './PainelDeComando'
import type { OpenContract } from '../../core/deriv/trading'

/** Laboratório: o painel de comando sobre um fundo preto, com duas posições abertas de exemplo. */
export default function LabPainelDeComando() {
  const [stake, setStake] = useState(10)
  const [duracao, setDuracao] = useState(5)
  const [unidade, setUnidade] = useState<'t' | 's' | 'm'>('m')
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const agora = Math.floor(Date.now() / 1000)
  const pos = (id: number, tipo: string, lucro: number, falta: number): OpenContract => ({
    contractId: id, contractType: tipo, profit: lucro, status: 'open', isValidToSell: true, isExpired: false, currency: 'USD',
    expiryTime: agora + falta, startTime: agora - 300 + falta, shortcode: `${tipo}_R_75_19.55_${agora}_${agora + falta}_S0P_0`,
  } as unknown as OpenContract)
  const botoes = (
    <div className="bl-comprar">
      <BotaoCompra tipo="sobe" payout={19.55} stake={stake} moeda="USD" carregando={false} erro={null} podeOperar motivoBloqueio={null}
        comprando={false} confirmando={confirmando === 'CALL'} aoComprar={() => setConfirmando((c) => (c === 'CALL' ? null : 'CALL'))} />
      <BotaoCompra tipo="desce" payout={19.48} stake={stake} moeda="USD" carregando={false} erro={null} podeOperar motivoBloqueio={null}
        comprando={false} confirmando={confirmando === 'PUT'} aoComprar={() => setConfirmando((c) => (c === 'PUT' ? null : 'PUT'))} />
    </div>
  )
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000' }}>
      <PainelDeComando nome="75 Index" preco="38.904,2251" direcao="up" aberto moeda="USD"
        stake={stake} aoMudarStake={setStake} duracao={duracao} unidade={unidade} faixa={[1, 1440]} disponiveis={{ t: true, s: true, m: true }}
        aoMudarDuracao={setDuracao} aoTrocarUnidade={setUnidade} botoes={botoes}
        resumo={<ResumoDaCompra payouts={[19.55, 19.48]} stake={stake} moeda="USD" duracao={duracao} unidade={unidade} />}
        saldo={11216.63} conta="Real" aoConectar={() => undefined} conectando={false}
        posicoes={[pos(1, 'CALL', 3.2, 162), pos(2, 'PUT', -10, 44)]} aoEncerrar={() => undefined} encerrando={null} real
        aviso={{ tipo: 'ok', texto: 'Compra enviada: US$ 10,00 no 75 Index, fecha às 13:47.' }} />
    </div>
  )
}
