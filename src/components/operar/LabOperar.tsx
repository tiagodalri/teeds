/**
 * ?tela=operar no laboratório: a boleta e as posições com dados de mentira
 * (preço andando, cotação mudando, uma posição ganhando, uma perdendo e uma
 * concluída). Nada aqui fala com a Deriv.
 */
import { useEffect, useState } from 'react'
import type { OpenContract } from '../../core/deriv/trading'
import { PositionCard } from '../PositionCard'
import { BoletaAtivo, BotaoCompra, MostradorDuracao, MostradorValor, ResumoDaCompra } from './Boleta'

const agoraS = () => Math.floor(Date.now() / 1000)
function contrato(id: number, tipo: string, lucro: number, faltam: number, status = 'open'): OpenContract {
  const inicio = agoraS() - (300 - faltam)
  return {
    contractId: id, symbol: 'R_75', contractType: tipo, buyPrice: 10, bidPrice: 10 + lucro, payout: 17.84,
    profit: lucro, profitPercentage: lucro * 10, status, isValidToSell: status === 'open', motivoSemVenda: null,
    isExpired: status !== 'open', entrySpot: 1089.234, currentSpot: 1089.234 + lucro * 0.65, exitSpot: null, barrier: null,
    longcode: '', shortcode: `${tipo}_R_75_10_${inicio}_${inicio + 300}`, currency: 'USD', purchaseTime: inicio,
    startTime: inicio, expiryTime: inicio + 300, pipSize: 3, appMarkup: null,
  } as OpenContract
}

export default function LabOperar() {
  const p = new URLSearchParams(location.search)
  const [stake, setStake] = useState(10)
  const [texto, setTexto] = useState<string | null>(null)
  const [duracao, setDuracao] = useState(5)
  const [unidade, setUnidade] = useState<'t' | 's' | 'm'>('m')
  const [preco, setPreco] = useState(1091.052)
  const [direcao, setDirecao] = useState<'up' | 'down' | null>(null)
  const [payouts, setPayouts] = useState<[number, number]>([17.84, 17.81])
  const [confirmando, setConfirmando] = useState<string | null>(null)
  useEffect(() => {
    const t = window.setInterval(() => {
      const passo = (Math.random() - 0.48) * 0.9
      setPreco((v) => v + passo); setDirecao(passo >= 0 ? 'up' : 'down')
      if (Math.random() < 0.35) setPayouts(([a, b]) => [Math.round((a + (Math.random() - 0.5) * 0.06) * 100) / 100, Math.round((b + (Math.random() - 0.5) * 0.06) * 100) / 100])
    }, 1000)
    return () => window.clearInterval(t)
  }, [])
  const faixa = unidade === 't' ? [1, 10] as const : unidade === 's' ? [15, 86400] as const : [1, 1440] as const
  const escala = stake / 10
  const posicoes = p.has('vazio') ? [] : p.has('varias')
    ? [contrato(1, 'CALL', 2.78, 94), contrato(2, 'PUT', -4.1, 12), contrato(3, 'CALL', 7.84, 0, 'won')]
    : [contrato(1, 'CALL', 2.78, 94)]
  return (
    <div className="layout layout-operar" style={{ display: 'flex', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* &largura=330: a coluna do Operar no notebook */}
      <aside className="trade" style={{ width: `min(${Number(p.get('largura')) || 430}px, 100%)`, borderLeft: 0 }}>
        <section className="bl" aria-label="Boleta de operação">
          <BoletaAtivo nome="75 Index" preco={preco} pipSize={3} direcao={direcao} sintetico aberto />
          <div className="bl-abas" role="tablist"><button type="button" className="on">Subir / Descer</button><button type="button">Dígitos</button></div>
          <div className="bl-corpo">
            <MostradorValor stake={stake} texto={texto} moeda="USD" alerta={stake > 9241.79} saldo={9241.79}
              aoMudarTexto={(t) => { setTexto(t); const n = Number(t.replace(',', '.')); if (n >= 0.35) setStake(n) }}
              aoMudar={(v) => { setStake(v); setTexto(null) }} aoSair={() => setTexto(null)} />
            <i className="bl-sep" aria-hidden="true" />
            <MostradorDuracao duracao={duracao} unidade={unidade} faixa={faixa} disponiveis={{ t: true, s: true, m: true }}
              aoMudar={setDuracao} aoTrocarUnidade={(u) => { setUnidade(u); setDuracao(u === 't' ? 5 : u === 's' ? 60 : 5) }} aoSair={() => undefined} />
            <div className="bl-comprar">
              <BotaoCompra tipo="sobe" payout={payouts[0] * escala} stake={stake} moeda="USD" carregando={false} erro={null}
                podeOperar={!p.has('fechado')} motivoBloqueio={p.has('fechado') ? 'Mercado fechado agora' : null}
                comprando={false} confirmando={confirmando === 'CALL'} aoComprar={() => setConfirmando(confirmando === 'CALL' ? null : 'CALL')} />
              <BotaoCompra tipo="desce" payout={payouts[1] * escala} stake={stake} moeda="USD" carregando={false} erro={null}
                podeOperar={!p.has('fechado')} motivoBloqueio={p.has('fechado') ? 'Mercado fechado agora' : null}
                comprando={false} confirmando={confirmando === 'PUT'} aoComprar={() => setConfirmando(confirmando === 'PUT' ? null : 'PUT')} />
            </div>
            <ResumoDaCompra payouts={[payouts[0] * escala, payouts[1] * escala]} stake={stake} moeda="USD" duracao={duracao} unidade={unidade} />
            <p className="bl-atalho">Atalhos: <kbd>Shift</kbd> <kbd>↑</kbd> Subir · <kbd>Shift</kbd> <kbd>↓</kbd> Descer · <kbd>+</kbd> <kbd>−</kbd> valor</p>
          </div>
        </section>
        <section className="bl-posicoes" aria-label="Posições abertas">
          {posicoes.length > 1 && <div className="bl-posicoes-cab"><span>{posicoes.length} posições abertas<small>Investido US$ 30,00</small></span><b className="ganho">+US$ 6,52</b></div>}
          {posicoes.length === 0 && <div className="bl-posicoes-vazio">As entradas que você fizer aqui aparecem nesta lista, com o resultado ao vivo.</div>}
          {posicoes.map((c) => <PositionCard key={c.contractId} contrato={c} nomeAtivo="75 Index" onEncerrar={() => undefined} encerrando={false} />)}
        </section>
      </aside>
    </div>
  )
}
