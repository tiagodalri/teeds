import type { TradingAccount } from '../core/deriv/account'
import { RobotDialog } from './RobotDialog'
import './robot-launch.css'
import './account-demonstration.css'
import { IconeFechar } from './IconeFechar'

export const podeDemonstrarSaldos = (admin?: boolean | null, email?: string | null) =>
  admin === true && email?.trim().toLowerCase() === 'teeds@gmail.com'

/** Presentation-only copies. Never passed to the account or trading hooks. */
export function saldosDemonstrativos(contas: TradingAccount[]) {
  return contas.flatMap(conta => {
    if (conta.type !== 'real' && conta.type !== 'demo') return []
    const grupo = contas.filter(c => c.currency === conta.currency && c.type === conta.type)
    const pares = contas.filter(c => c.currency === conta.currency && c.type === (conta.type === 'real' ? 'demo' : 'real'))
    // Never mix currencies or guess a pair when several accounts exist.
    if (grupo.length !== 1 || pares.length !== 1 || !Number.isFinite(pares[0].balance)) return []
    return [{ ...conta, balance: pares[0].balance }]
  })
}

export function AccountDemonstration({ contas, admin, email, onClose }: {
  contas: TradingAccount[]; admin?: boolean | null; email?: string | null; onClose: () => void
}) {
  if (!podeDemonstrarSaldos(admin, email)) return null
  const linhas = saldosDemonstrativos(contas)
  return <RobotDialog label="Demonstração — saldos simulados" onCancel={onClose}>
    <section className="account-demonstration">
      <header><div><span>VISUALIZAÇÃO EXCLUSIVA DE ADM</span><h2>Demonstração — saldos simulados</h2></div><button onClick={onClose} aria-label="Fechar demonstração"><IconeFechar /></button></header>
      <div className="account-demo-content">
        <p className="account-demo-notice">Os saldos abaixo estão invertidos para demonstração. <strong>Não representam o dinheiro disponível nas contas da Deriv.</strong></p>
        <div className="account-demo-list">{linhas.map(conta => <article key={conta.accountId}>
          <div><span className={`account-demo-tag ${conta.type}`}>{conta.type === 'real' ? 'REAL' : 'DEMO'} · SIMULADA</span><b>{conta.type === 'real' ? 'Visualização da conta real' : 'Visualização da conta demo'}</b><small>Referência: {conta.accountId}</small></div>
          <strong>{conta.balance.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small>{conta.currency}</small></strong>
        </article>)}</div>
        {linhas.length === 0 && <p>É necessário ter um par de contas real/demo na mesma moeda para esta demonstração.</p>}
        <p className="account-demo-note">Esta tela não envia ordens nem troca a conta selecionada. Robôs já iniciados continuam operando independentemente, com os dados reais de suas contas.</p>
      </div>
      <footer><span>Somente visualização · nenhuma ordem</span><button onClick={onClose}>Fechar demonstração</button></footer>
    </section>
  </RobotDialog>
}
