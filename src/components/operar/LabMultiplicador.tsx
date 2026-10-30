import { useState } from 'react'
import { BoletaAtivo } from './Boleta'
import { BoletaMultiplicador } from './BoletaMultiplicador'
import { CartaoMultiplicador } from './CartaoMultiplicador'
import type { OpenContract } from '../../core/deriv/trading'

/**
 * Laboratório: a boleta do multiplicador com cotações REAIS da Deriv (pela
 * conexão pública, sem conta) e dois cartões de exemplo. ?tela=multiplicador&ativo=frxEURUSD
 */
export default function LabMultiplicador() {
  const ativo = new URLSearchParams(location.search).get('ativo') ?? 'R_75'
  const [aviso, setAviso] = useState<string | null>(null)
  const agora = Math.floor(Date.now() / 1000)
  const exemplo = (id: number, tipo: 'MULTUP' | 'MULTDOWN', lucro: number, extra: Partial<OpenContract['mult']> = {}): OpenContract => ({
    contractId: id, symbol: ativo, contractType: tipo, buyPrice: 10, bidPrice: 10 + lucro, payout: 0, profit: lucro, profitPercentage: lucro * 10,
    status: 'open', isValidToSell: true, motivoSemVenda: null, isExpired: false, entrySpot: 39125.4794, currentSpot: 39131.1052, exitSpot: null, barrier: null,
    longcode: '', shortcode: `${tipo}_${ativo}`, currency: 'USD', purchaseTime: agora - 120, startTime: agora - 120, expiryTime: 4947004799, pipSize: 4, appMarkup: null,
    mult: { multiplicador: 100, takeProfit: { valor: 5, preco: 39321.1 }, stopLoss: null, stopOut: { valor: 10, preco: 38745.614 }, cancelamentoAte: null, comissao: 0.29, ...extra },
  })
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 380px))', gap: 20, padding: 20, background: 'var(--bg)', minHeight: '100vh', alignItems: 'start' }}>
      <BoletaMultiplicador cabecalho={<BoletaAtivo nome={ativo === 'R_75' ? '75 Index' : ativo} preco={null} pipSize={4} direcao={null} sintetico={ativo.startsWith('R_')} aberto />}
        socket={null} simbolo={ativo} pipSize={ativo.startsWith('frx') ? 5 : 4} moeda="USD" saldo={11216.63} conta="real" contaReal podeOperar motivoBloqueio={null} admin
        comprando={null} aoComprar={async (p) => setAviso(`Compraria: ${p.tipo} x${p.multiplicador} US$ ${p.stake} TP ${p.takeProfit ?? '-'} SL ${p.stopLoss ?? '-'} cancel ${p.cancelamento ?? '-'}`)} />
      <div style={{ display: 'grid', gap: 12 }}>
        {aviso && <p className="aviso aviso-ok">{aviso}</p>}
        <CartaoMultiplicador c={exemplo(1, 'MULTUP', 3.2)} nomeAtivo="75 Index" real fechando={false} aoFechar={() => undefined} aoMudarLimites={async () => undefined} aoCancelar={async () => undefined} />
        <CartaoMultiplicador c={exemplo(2, 'MULTDOWN', -4.1, { takeProfit: null, cancelamentoAte: agora + 1800 })} nomeAtivo="75 Index" real fechando={false} aoFechar={() => undefined} aoMudarLimites={async () => undefined} aoCancelar={async () => undefined} />
      </div>
    </div>
  )
}
