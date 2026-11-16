import { useEffect, useState } from 'react'
import { DERIV } from '../../core/deriv/config'
import { precoLegivel, type Subplano } from '../../core/teeds/subplanos'
import { comComprador, type CompradorDoCheckout } from '../../core/teeds/checkout'
import './liberar-conta.css'

/*
 * Conta aguardando liberação (GlobalFly, 16/11/2026, pedido do Tiago e do Victor).
 *
 * O Gold sem saldo na conta real da Deriv não usa a plataforma: qualquer botão
 * abre esta janela com os dois caminhos para liberar. Depositar (segue Gold) ou
 * fazer upgrade para Black/Prestige. Cores só da paleta protegida
 * (vite.config.ts, PALETAS.globalfly.manter). Prefixo CSS lbc-.
 */

const ESTRELA = 'M8 1.2l1.55 4.1 4.25.35-3.25 2.75 1.02 4.15L8 10.25 4.43 12.55l1.02-4.15L2.2 5.65l4.25-.35z'

export function JanelaLiberarConta({ planos, derivConectada, saldoReal, comprador, aoFechar: fecharSemRegistro, aoVerificar, aoConectar, aoSuporte, aoRegistrar }: {
  planos: Subplano[]
  derivConectada: boolean
  saldoReal: number | null
  comprador?: CompradorDoCheckout | null
  aoFechar: () => void
  /** relê a Deriv e o banco; true = liberou */
  aoVerificar?: () => Promise<boolean>
  aoConectar?: () => void
  aoSuporte?: () => void
  /** cada botão tocado (painel Admin › Contas travadas) */
  aoRegistrar?: (tipo: 'depositar' | 'conectar' | 'verificar' | 'black' | 'prestige' | 'suporte' | 'fechar', origem?: string) => void
}) {
  const [conferindo, setConferindo] = useState(false)
  const [semSaldo, setSemSaldo] = useState(false)
  const verificar = async () => {
    if (!aoVerificar || conferindo) return
    setConferindo(true); setSemSaldo(false)
    let liberou = false
    try { liberou = await aoVerificar(); if (!liberou) setSemSaldo(true) } catch { setSemSaldo(true) } finally { setConferindo(false) }
    aoRegistrar?.('verificar', liberou ? 'liberou' : 'sem-saldo')
  }
  const aoFechar = () => { aoRegistrar?.('fechar'); fecharSemRegistro() }
  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }; addEventListener('keydown', esc); return () => removeEventListener('keydown', esc) }, [aoFechar])
  const acima = planos.filter((s) => (s.id === 'black' || s.id === 'prestige') && s.ativo)
  const quero = (s: Subplano) => {
    aoRegistrar?.(s.id === 'prestige' ? 'prestige' : 'black')
    if (s.checkoutUrl) window.open(comComprador(s.checkoutUrl, comprador), '_blank', 'noopener,noreferrer')
  }
  const depositar = () => { aoRegistrar?.('depositar'); window.open(DERIV.deposito, '_blank', 'noopener,noreferrer') }
  const saldo = saldoReal == null ? '—' : `US$ ${saldoReal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  return (
    <div className="lbc-fundo" onMouseDown={aoFechar}>
      <section className="lbc-caixa" role="dialog" aria-modal="true" aria-labelledby="lbc-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="lbc-fechar" onClick={aoFechar} aria-label="Fechar">×</button>

        <header className="lbc-cabeca">
          <div className="lbc-selo" aria-hidden="true">
            <svg viewBox="0 0 64 64"><circle className="a" cx="32" cy="32" r="29" /><circle className="b" cx="32" cy="32" r="29" /></svg>
            <svg className="lbc-cadeado" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8.2 10.5V7.6a3.8 3.8 0 017.6 0v2.9" /><path d="M12 14.6v2.2" /></svg>
          </div>
          <div className="lbc-cabeca-texto">
            <span className="lbc-sobre"><i aria-hidden="true" />Conta aguardando liberação</span>
            <h2 id="lbc-titulo">Libere a sua conta para usar a <em>GlobalFly</em></h2>
            <p>Escolha um dos dois caminhos. Assim que ele for concluído, a plataforma é liberada automaticamente.</p>
          </div>
        </header>

        <div className="lbc-caminhos">
          {/* caminho 1: depositar */}
          <article className="lbc-deposito">
            <span className="lbc-numero">Caminho 1</span>
            <h3>Deposite na sua conta real da Deriv</h3>
            <p className="lbc-sub">Você continua no <b>GF Member Gold</b> e libera a plataforma com qualquer valor de saldo.</p>

            <div className="lbc-saldo">
              <div><small>Saldo na conta real</small><b>{saldo}</b></div>
              <span className={derivConectada ? 'ok' : ''}>{derivConectada ? 'Deriv conectada' : 'Deriv não conectada'}</span>
            </div>

            <ol className="lbc-passos">
              <li className={derivConectada ? 'feito' : 'agora'}><i aria-hidden="true">{derivConectada ? '✓' : '1'}</i><span>Conectar a Deriv</span></li>
              <li className={derivConectada ? 'agora' : ''}><i aria-hidden="true">2</i><span>Depositar</span></li>
              <li><i aria-hidden="true">3</i><span>Plataforma liberada</span></li>
            </ol>

            <ul className="lbc-lista">
              <li>I.A. em conta real liberadas</li>
              <li><b>1 hora</b> de simulador por dia</li>
              <li>Aulas, Gerenciamento, Notícias e Relatórios</li>
            </ul>

            {derivConectada
              ? <button type="button" className="lbc-cta" onClick={depositar}>Depositar na Deriv<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4h9v9M16 4L5 15" /></svg></button>
              : <button type="button" className="lbc-cta" onClick={() => { aoRegistrar?.('conectar'); aoConectar?.() }}>Conectar a Deriv</button>}
            {derivConectada && <button type="button" className="lbc-verificar" onClick={() => void verificar()} disabled={conferindo}>{conferindo ? 'Conferindo o seu saldo…' : 'Já depositei, verificar agora'}</button>}
            {semSaldo && <p className="lbc-recado" role="status">Ainda não encontramos saldo na sua conta real. O depósito pode levar alguns minutos para aparecer na Deriv. Tente de novo em instantes.</p>}
          </article>

          <div className="lbc-ou" aria-hidden="true"><span>ou</span></div>

          {/* caminho 2: upgrade */}
          <div className="lbc-upgrade">
            <span className="lbc-numero">Caminho 2</span>
            <h3>Faça o upgrade do seu plano</h3>
            <div className="lbc-planos">
              {acima.map((s) => (
                <article key={s.id} className={`lbc-plano ${s.id}`}>
                  <div className="lbc-plano-topo">
                    <span className="lbc-nome"><svg viewBox="0 0 16 16" aria-hidden="true"><path d={ESTRELA} /></svg><b>{s.nome}</b></span>
                    <span className="lbc-preco">{s.precoReferencia ? <s>{precoLegivel(s.precoReferencia)}</s> : null}<strong>{precoLegivel(s.preco)}<small>{s.cobranca === 'mensal' ? '/mês' : '/ano'}</small></strong></span>
                  </div>
                  {s.chamada ? <p className="lbc-chamada">{s.chamada}</p> : null}
                  <ul>
                    <li>{s.ias == null ? 'As 5 I.A.' : `${s.ias.length} I.A.`}</li>
                    <li>{s.simuladorHoras == null ? 'Simulador ilimitado' : `${s.simuladorHoras} h de simulador por dia`}</li>
                    <li>{s.compartilhamento > 0 ? `${Math.round(s.compartilhamento * 1000) / 10}% do lucro` : '0% do lucro'}</li>
                  </ul>
                  <button type="button" className="lbc-cta-plano" onClick={() => quero(s)} disabled={!s.checkoutUrl}>Quero o {s.nome}</button>
                </article>
              ))}
            </div>
          </div>
        </div>

        <footer className="lbc-rodape">
          <span className="lbc-seguro"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.4-3 7.9-7 9.5-4-1.6-7-5.1-7-9.5V6z" /></svg>O depósito é feito direto na Deriv. A GlobalFly não recebe nem movimenta o seu dinheiro.</span>
          <button type="button" className="lbc-link" onClick={() => { aoRegistrar?.('suporte'); aoSuporte?.() }}>Falar com o suporte</button>
        </footer>
      </section>
    </div>
  )
}
