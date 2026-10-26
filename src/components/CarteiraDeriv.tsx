import { useEffect, useState } from 'react'
import type { AuthSession } from '../core/deriv/auth'
import { CarteiraSemPermissao, lerCarteiras, lerMovimentos, type Carteira, type MovimentoDaCarteira } from '../core/deriv/carteira'
import { DERIV } from '../core/deriv/config'
import { DerivLogo } from './DerivMarca'
import './carteira-deriv.css'

/*
  A carteira da Deriv dentro da plataforma (26/10/2026). Só leitura: o saldo
  da carteira (onde o depósito cai primeiro), quanto já entrou e saiu, e a
  lista de depósitos e saques. Quem conectou antes do escopo `payment` vê o
  convite para reconectar.
*/

const dinheiro = (v: number, moeda = 'USD') =>
  `${moeda === 'USD' ? 'US$' : moeda} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const quando = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const SITUACAO: Record<string, string> = { completed: 'Concluído', success: 'Concluído', successful: 'Concluído', pending: 'Em andamento', processing: 'Em andamento', failed: 'Falhou', rejected: 'Recusado', cancelled: 'Cancelado', canceled: 'Cancelado' }
const situacao = (s: string) => SITUACAO[s.toLowerCase()] ?? (s ? s[0].toUpperCase() + s.slice(1) : '')

export function CarteiraDeriv({ session, fechar, reconectar }: { session: AuthSession | null; fechar: () => void; reconectar: () => void }) {
  const [carteiras, setCarteiras] = useState<Carteira[] | null>(null)
  const [movimentos, setMovimentos] = useState<MovimentoDaCarteira[] | null>(null)
  const [semPermissao, setSemPermissao] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!session) return
    let vivo = true
    const falhou = (e: unknown) => { if (!vivo) return; if (e instanceof CarteiraSemPermissao) setSemPermissao(true); else setErro((e as Error).message) }
    lerCarteiras(session).then((c) => vivo && setCarteiras(c)).catch(falhou)
    lerMovimentos(session).then((m) => vivo && setMovimentos(m)).catch(falhou)
    return () => { vivo = false }
  }, [session])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', tecla); return () => window.removeEventListener('keydown', tecla)
  }, [fechar])

  const principal = carteiras?.find((c) => c.tipo === 'main') ?? carteiras?.[0] ?? null
  const total = principal?.emDolar ?? (principal?.saldos[0] ? { saldo: principal.saldos[0].saldo, entradas: principal.saldos[0].entradas, saidas: principal.saldos[0].saidas } : null)
  const moedaTotal = principal?.emDolar ? 'USD' : principal?.saldos[0]?.moeda ?? 'USD'

  return (
    <div className="cw-fundo" onMouseDown={fechar}>
      <section className="cw" role="dialog" aria-modal="true" aria-labelledby="cw-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <header className="cw-topo">
          <div>
            <span className="cw-rot">Sua conta na <DerivLogo altura={12} /></span>
            <h2 id="cw-titulo">Carteira</h2>
          </div>
          <button type="button" className="cw-fechar" onClick={fechar} aria-label="Fechar">×</button>
        </header>

        {!session ? (
          <div className="cw-aviso"><b>Conecte a Deriv</b><p>A carteira aparece aqui assim que a sua conta estiver conectada.</p></div>
        ) : semPermissao ? (
          <div className="cw-aviso">
            <b>Falta uma permissão</b>
            <p>A sua conexão com a Deriv é de antes da carteira chegar à plataforma. Reconecte uma vez e autorize o acesso à carteira: os robôs continuam rodando normalmente.</p>
            <button type="button" className="cw-botao principal" onClick={reconectar}>Reconectar a Deriv</button>
          </div>
        ) : (
          <>
            <div className="cw-resumo">
              <div className="cw-saldo">
                <span>Saldo na carteira</span>
                <strong>{total ? dinheiro(total.saldo, moedaTotal) : <i className="cw-carregando" />}</strong>
                <small>É onde o depósito cai primeiro. Para operar, o saldo passa para a conta de operação.</small>
              </div>
              <div className="cw-totais">
                <div><span>Já depositado</span><b className="up">{total ? dinheiro(total.entradas, moedaTotal) : '—'}</b></div>
                <div><span>Já sacado</span><b>{total ? dinheiro(total.saidas, moedaTotal) : '—'}</b></div>
              </div>
              {principal && principal.saldos.length > 1 && (
                <ul className="cw-moedas">{principal.saldos.map((s) => <li key={s.moeda}><span>{s.moeda}</span><b>{dinheiro(s.saldo, s.moeda)}</b></li>)}</ul>
              )}
              {principal?.emDolar && principal.saldos.some((s) => s.moeda !== 'USD') && <p className="cw-nota">Valores em dólar aproximados: a cotação muda.</p>}
            </div>

            <div className="cw-lista">
              <h3>Depósitos e saques</h3>
              {erro && <p className="cw-erro" role="alert">{erro}</p>}
              {!erro && movimentos === null && <p className="cw-vazio">Carregando…</p>}
              {movimentos?.length === 0 && <p className="cw-vazio">Nenhum depósito ou saque ainda.</p>}
              {!!movimentos?.length && (
                <ul>
                  {movimentos.map((m) => (
                    <li key={m.id} className={m.tipo}>
                      <i aria-hidden="true">{m.tipo === 'deposito' ? '↓' : '↑'}</i>
                      <span className="cw-mov">
                        <b>{m.tipo === 'deposito' ? 'Depósito' : 'Saque'}</b>
                        <small>{quando(m.quando)} · {m.canal === 'agente' ? 'Agente de pagamento' : 'Caixa da Deriv'}{m.situacao && ` · ${situacao(m.situacao)}`}</small>
                      </span>
                      <b className="cw-valor">{m.tipo === 'deposito' ? '+' : '−'}{dinheiro(Math.abs(m.liquido || m.valor), m.moeda)}</b>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <footer className="cw-pe">
          <a className="cw-botao principal" href={DERIV.deposito} target="_blank" rel="noopener noreferrer">Depositar na Deriv</a>
          <button type="button" className="cw-botao" onClick={fechar}>Fechar</button>
        </footer>
      </section>
    </div>
  )
}
