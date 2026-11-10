import { useEffect, useState } from 'react'
import { MARCA } from '../../marca'
import { abrirSuporte } from '../../core/teeds/suporte'
import { comComprador, type CompradorDoCheckout } from '../../core/teeds/checkout'
import { cobrancaLegivel, compartilhamentoLegivel, precoLegivel, simuladorLegivel, type MeuSubplano, type Subplano } from '../../core/teeds/subplanos'
import './meu-plano.css'

/**
 * "Meu plano" (05/11/2026): o GF Member e o subplano da pessoa, quanto do
 * simulador ela já usou hoje e a tabela dos três subplanos, com ✓ e ✗ e cada
 * I.A. pelo nome. A mesma tabela serve para mostrar na live.
 */
const IAS: Array<[string, string]> = [['goreme', 'GF Raptor'], ['falcon', 'GF Falcon'], ['legacy', 'GF Legacy'], ['superior5', 'GF Gulf'], ['ag2', 'GF Phenom']]
const tem = (s: Subplano, ia: string) => s.ias == null || s.ias.includes(ia)

export function MeuPlano({ dados, foco, aoFechar, comprador }: { dados: MeuSubplano; foco?: string | null; aoFechar: () => void; comprador?: CompradorDoCheckout | null }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [aoFechar])
  const planos = dados.subplanos
  const meu = planos.find((s) => s.id === dados.atual) ?? planos[0]
  // no celular a tabela mostra um subplano por vez (o destacado, senão o próximo acima do meu)
  const [vendo, setVendo] = useState<string>(() => foco ?? planos.find((s) => meu && s.ordem > meu.ordem)?.id ?? meu?.id ?? '')
  if (!meu) return null
  const col = (s: Subplano, extra = '') => `${extra} ${s.id === meu.id ? 'atual' : ''} ${s.id === vendo ? 'vendo' : 'fora'}`.trim()
  const usado = dados.minutosHoje / 60
  const limite = meu.simuladorHoras
  const pct = limite ? Math.min(100, (usado / limite) * 100) : 0
  const linhas: Array<{ rot: string; v: (s: Subplano) => React.ReactNode }> = [
    { rot: 'Compartilhamento de receita', v: (s) => compartilhamentoLegivel(s.compartilhamento) },
    ...IAS.map(([id, nome]) => ({ rot: nome, v: (s: Subplano) => (tem(s, id) ? <i className="mpl-sim" aria-label="Incluída">✓</i> : <i className="mpl-nao" aria-label="Não incluída">✕</i>) })),
    { rot: 'Simulador', v: (s) => simuladorLegivel(s.simuladorHoras) },
    { rot: 'Aulas e sala ao vivo', v: () => <i className="mpl-sim" aria-label="Incluída">✓</i> },
    { rot: 'Sala ao vivo extra por dia', v: (s) => (s.salaExtra ? <i className="mpl-sim" aria-label="Incluída">✓</i> : <i className="mpl-nao" aria-label="Não incluída">✕</i>) },
    { rot: 'Assessor no WhatsApp', v: (s) => (s.assessor ? <i className="mpl-sim" aria-label="Incluído">✓</i> : <i className="mpl-nao" aria-label="Não incluído">✕</i>) },
    { rot: 'GFT Lab (beta)', v: (s) => (s.lab ? <i className="mpl-sim" aria-label="Incluído">✓</i> : <i className="mpl-nao" aria-label="Não incluído">✕</i>) },
  ]
  const quero = (s: Subplano) => {
    if (s.checkoutUrl) { window.open(comComprador(s.checkoutUrl, comprador), '_blank', 'noopener,noreferrer'); return }
    aoFechar(); abrirSuporte({ mensagem: `Quero passar para o subplano ${s.nome}.` })
  }
  return (
    <div className="mpl-fundo" onMouseDown={aoFechar}>
      <section className="mpl" role="dialog" aria-modal="true" aria-labelledby="mpl-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="mpl-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        <header className="mpl-topo">
          <span className="mpl-rot">Seu plano</span>
          <h2 id="mpl-titulo">GF Member <em className={`mpl-selo ${meu.id}`}>{meu.nome}</em></h2>
          <p>{meu.chamada}{dados.admin ? ' Como administrador, você tem tudo liberado.' : ''}</p>
          {limite != null && !dados.admin && (
            <div className="mpl-uso" aria-label="Simulador hoje">
              <div><b>Simulador hoje</b><span>{usado < 1 ? `${Math.round(dados.minutosHoje)} min` : `${usado.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`} de {simuladorLegivel(limite).replace(' por dia', '')}</span></div>
              <i><u style={{ width: `${pct}%` }} className={pct >= 100 ? 'cheio' : ''} /></i>
              {pct >= 100 && <small>O simulador de hoje acabou. Ele volta amanhã, ou na hora com um subplano acima.</small>}
            </div>
          )}
        </header>
        <div className="mpl-abas" role="tablist" aria-label="Ver o subplano">
          {planos.map((s) => <button key={s.id} type="button" role="tab" aria-selected={vendo === s.id} className={vendo === s.id ? 'on' : ''} onClick={() => setVendo(s.id)}>{s.nome}{s.id === meu.id ? <small>seu</small> : null}</button>)}
        </div>
        <div className="mpl-tabela-caixa">
          <table className="mpl-tabela">
            <thead><tr><th aria-label="Recurso" />{planos.map((s) => (
              <th key={s.id} className={col(s, foco === s.id ? 'foco' : '')}>
                <span className={`mpl-nome ${s.id}`}>{s.nome}</span>
                {s.precoReferencia ? <s>{precoLegivel(s.precoReferencia)}</s> : null}
                <b>{cobrancaLegivel(s)}</b>
                {s.id === meu.id ? <small className="mpl-voce">Seu subplano</small> : null}
              </th>
            ))}</tr></thead>
            <tbody>{linhas.map((l) => <tr key={l.rot}><th scope="row">{l.rot}</th>{planos.map((s) => <td key={s.id} className={col(s)}>{l.v(s)}</td>)}</tr>)}</tbody>
            {/* 10/11/2026 (Tiago): o botão de upgrade aparece também para o
                administrador, que vê a mesma janela que o cliente. */}
            <tfoot><tr><th />{planos.map((s) => <td key={s.id} className={col(s)}>{s.ordem > meu.ordem ? <button type="button" className="mpl-quero" onClick={() => quero(s)} aria-label={`Fazer upgrade para o ${s.nome}`}>Fazer upgrade</button> : s.id === meu.id ? <span className="mpl-ativo">Ativo</span> : null}</td>)}</tr></tfoot>
          </table>
        </div>
        {meu.assessor && meu.assessorWhatsapp && !dados.admin && (
          <a className="mpl-assessor" href={`https://wa.me/${meu.assessorWhatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">Falar com o meu assessor no WhatsApp</a>
        )}
        <p className="mpl-nota">Todo subplano inclui a {MARCA.prosa}, as aulas e a sala ao vivo. O compartilhamento de receita é sobre o lucro do mês na conta real; mês sem lucro, nada a pagar.</p>
      </section>
    </div>
  )
}
