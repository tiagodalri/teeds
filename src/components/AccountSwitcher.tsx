import { useEffect, useRef, useState } from 'react'
import type { TradingAccount } from '../core/deriv/account'
import { BalanceLive } from './BalanceLive'
import { AFILIADO } from '../core/deriv/config'

interface Props {
  contas: TradingAccount[]
  selecionada: string | null
  isDemo: boolean
  saldo: number | null
  moeda: string
  conectando: boolean
  onTrocar: (id: string) => void
  onRecarregar: () => void
  onSair: () => void
}

/**
 * Troca de conta. Um botao de verdade, com o tipo bem visivel —
 * ninguem opera com dinheiro real por engano.
 */
export function AccountSwitcher(props: Props) {
  const { contas, selecionada, isDemo, saldo, moeda, conectando, onTrocar, onRecarregar, onSair } = props
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  const atual = contas.find((c) => c.accountId === selecionada)

  return (
    <div className="troca" ref={caixa}>
      <button
        className={`troca-botao ${isDemo ? 'demo' : 'real'} ${aberto ? 'aberto' : ''}`}
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
      >
        <span className={`troca-tag ${isDemo ? 'demo' : 'real'}`}>
          {isDemo ? 'Demo' : 'Real'}
        </span>
        <span className="troca-meio">
          <BalanceLive valor={saldo} moeda={moeda} conectando={conectando} />
          <em>{atual?.accountId ?? '—'}</em>
        </span>
        <svg className="troca-seta" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>

      {aberto && (
        <div className="troca-menu">
          <p className="troca-titulo">Trocar de conta</p>
          {contas.map((c) => {
            const demo = c.type === 'demo'
            const ativa = c.accountId === selecionada
            return (
              <button
                key={c.accountId}
                className={`troca-item ${ativa ? 'ativa' : ''}`}
                onClick={() => { onTrocar(c.accountId); setAberto(false) }}
              >
                <span className={`troca-tag ${demo ? 'demo' : 'real'}`}>{demo ? 'Demo' : 'Real'}</span>
                <span className="troca-info">
                  <b>{demo ? 'Dinheiro fictício' : 'Dinheiro real'}</b>
                  <em>{c.accountId}</em>
                </span>
                <span className="troca-saldo">
                  {c.currency} {c.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
                {ativa && <svg viewBox="0 0 12 12" width="12" height="12" className="troca-check" aria-hidden="true">
                  <path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>}
              </button>
            )
          })}

          <div className="troca-rodape">
            {isDemo && (
              <button onClick={() => { onRecarregar(); setAberto(false) }}>Recarregar saldo demo</button>
            )}
            <a href={AFILIADO} target="_blank" rel="noopener noreferrer" className="troca-link">
              Abrir outra conta na Deriv
            </a>
            <button className="sair" onClick={onSair}>Sair da conta</button>
          </div>
        </div>
      )}
    </div>
  )
}
