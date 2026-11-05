import { useEffect } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { abrirSuporte } from '../../core/teeds/suporte'
import { comComprador } from '../../core/teeds/checkout'
import {
  abrirMeuPlano, carregarMeuSubplano, cobrancaLegivel, compartilhamentoLegivel, precoLegivel, simuladorLegivel, useMeuSubplano, type Subplano,
} from '../../core/teeds/subplanos'
import './marketplace-gf.css'

/**
 * O Marketplace da GlobalFly (05/11/2026, Tiago: "precisamos criar lá no
 * marketplace também... deixar bem top"). Com o GF Member em subplanos, o que
 * se vende aqui é subir de subplano: o Black e o Prestige em destaque, o
 * subplano atual da pessoa e a conta do compartilhamento num exemplo. A Gulf
 * e a Phenom avulsas saíram: agora fazem parte do Black e do Prestige.
 * Os números vêm da tabela subplanos (editável em Admin › Planos).
 */
const NOMES_DAS_IAS: Record<string, string> = { goreme: 'Raptor', falcon: 'Falcon', legacy: 'Legacy', superior5: 'Gulf', ag2: 'Phenom' }
const TODAS = ['goreme', 'falcon', 'legacy', 'superior5', 'ag2']

function beneficios(s: Subplano): string[] {
  const l: string[] = []
  l.push(s.ias == null ? 'As 5 I.A.: Raptor, Falcon, Legacy, Gulf e Phenom' : `${s.ias.length} I.A.: ${s.ias.map((i) => NOMES_DAS_IAS[i] ?? i).join(', ')}`)
  l.push(s.compartilhamento > 0 ? `Compartilhamento de ${compartilhamentoLegivel(s.compartilhamento).replace(' do lucro', '')} do lucro do mês` : 'Sem compartilhamento de receita: o lucro é todo seu')
  l.push(s.simuladorHoras == null ? 'Simulador ilimitado' : `Simulador ${simuladorLegivel(s.simuladorHoras)}`)
  if (s.salaExtra) l.push('Sala ao vivo extra todos os dias')
  if (s.assessor) l.push('Assessor particular no WhatsApp')
  if (s.lab) l.push('GFT Lab (beta): crie e automatize a sua estratégia')
  l.push('Aulas, sala ao vivo e a plataforma completa')
  return l
}

export function MarketplaceDoGF({ sessao }: { sessao?: SessaoTeeds | null }) {
  const dados = useMeuSubplano()
  useEffect(() => { if (sessao && !dados) void carregarMeuSubplano(sessao) }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const planos = dados?.subplanos ?? []
  const meu = planos.find((s) => s.id === dados?.atual) ?? planos[0] ?? null
  const acima = planos.filter((s) => meu && s.ordem > meu.ordem)
  const vitrine = acima.length ? acima : planos.filter((s) => s.id !== 'gold')
  const quero = (s: Subplano) => {
    if (s.checkoutUrl) { window.open(comComprador(s.checkoutUrl, sessao?.usuario), '_blank', 'noopener,noreferrer'); return }
    abrirSuporte({ mensagem: `Quero passar para o subplano ${s.nome} do GF Member.` })
  }
  // o exemplo do compartilhamento: um mês com US$ 1.000 de lucro na conta real
  const LUCRO = 1000

  if (!planos.length) return <main className="msp"><p className="msp-lendo">Abrindo o Marketplace…</p></main>
  return (
    <main className="msp">
      <section className="msp-heroi">
        <div className="msp-heroi-txt">
          <span className="msp-rot">GF Member · Marketplace</span>
          <h1>Leve o seu GF Member para o <em>próximo nível.</em></h1>
          <p>Todas as I.A., mais horas de simulador e menos compartilhamento. No Prestige, nenhum compartilhamento, um assessor só seu e o GFT Lab.</p>
          <div className="msp-heroi-acoes">
            <button type="button" className="msp-btn ouro" onClick={() => abrirMeuPlano(vitrine[0]?.id)}>Comparar os subplanos</button>
            {meu && <span className="msp-atual">Seu subplano: <b className={`msp-chip ${meu.id}`}>{meu.nome}</b></span>}
          </div>
        </div>
        <div className="msp-heroi-arte" aria-hidden="true">
          {planos.map((s, i) => <span key={s.id} className={`msp-cartao-arte ${s.id}`} style={{ ['--i' as string]: i }}><em className="msp-mono" aria-hidden /><b>{s.nome}</b><small>GF Member</small><i /></span>)}
        </div>
      </section>

      {meu && dados?.admin !== true && (
        <section className="msp-meu">
          <div><span className="msp-rot">Seu subplano agora</span><h2>GF Member <b className={`msp-chip ${meu.id}`}>{meu.nome}</b></h2><p>{meu.chamada}</p></div>
          <ul>{beneficios(meu).slice(0, 4).map((b) => <li key={b}>{b}</li>)}</ul>
        </section>
      )}

      <section className={`msp-planos n${vitrine.length}`} aria-label="Subplanos à venda">
        {vitrine.map((s) => {
          const sou = meu?.id === s.id
          return (
            <article key={s.id} className={`msp-plano ${s.id}`}>
              <header>
                <span className="msp-plano-selo">{s.id === 'prestige' ? 'O mais completo' : 'Mais escolhido'}</span>
                <h3>{s.nome}</h3>
                <p>{s.chamada}</p>
              </header>
              <div className="msp-preco">
                {s.precoReferencia ? <s>{precoLegivel(s.precoReferencia)}</s> : null}
                <b>{s.preco ? precoLegivel(s.preco) : 'Aquisição zero'}</b>
                <small>{s.preco ? (s.cobranca === 'mensal' ? 'por mês' : 'por ano, no lançamento') : cobrancaLegivel(s)}</small>
              </div>
              <ul className="msp-lista">{beneficios(s).map((b) => <li key={b}>{b}</li>)}</ul>
              <div className="msp-ias" aria-label="I.A. incluídas">
                {TODAS.map((i) => <span key={i} className={s.ias == null || s.ias.includes(i) ? 'on' : ''}>{NOMES_DAS_IAS[i]}</span>)}
              </div>
              {sou ? <span className="msp-ja">Este é o seu subplano</span>
                : <button type="button" className="msp-btn ouro largo" onClick={() => quero(s)}>Quero o {s.nome}</button>}
              <small className="msp-pagamento">{s.checkoutUrl ? 'Pagamento seguro pela Cakto · liberação automática na sua conta' : 'A equipe confirma com você pelo suporte e libera na sua conta'}</small>
            </article>
          )
        })}
      </section>

      <section className="msp-conta">
        <div><span className="msp-rot">Na ponta do lápis</span><h2>O compartilhamento em cada subplano</h2><p>Exemplo de um mês com <b>US$ {LUCRO.toLocaleString('pt-BR')}</b> de lucro na conta real. Mês sem lucro, ninguém paga nada.</p></div>
        <div className="msp-barras">
          {planos.map((s) => {
            const paga = LUCRO * s.compartilhamento
            return (
              <div key={s.id} className={`msp-barra ${s.id}`}>
                <span className={`msp-chip ${s.id}`}>{s.nome}</span>
                <i><u style={{ width: `${100 - s.compartilhamento * 100}%` }} /></i>
                <small>Fica com você <b>US$ {(LUCRO - paga).toLocaleString('pt-BR')}</b>{paga ? <> · compartilha US$ {paga.toLocaleString('pt-BR')}</> : <> · sem compartilhamento</>}</small>
              </div>
            )
          })}
        </div>
        <p className="msp-nota">Exemplo ilustrativo para comparar os subplanos, não é uma previsão de resultado. Operar envolve risco de perda.</p>
      </section>

      <section className="msp-faq">
        <h2>Dúvidas comuns</h2>
        <details><summary>Eu continuo sendo GF Member?</summary><p>Sim. O GF Member é o plano de todos. O subplano (Gold, Black ou Prestige) só define o que vem junto: I.A., horas de simulador, compartilhamento e os extras.</p></details>
        <details><summary>Quando o novo subplano é liberado?</summary><p>Assim que o pagamento é confirmado, na mesma conta da GlobalFly. Use no pagamento o mesmo e-mail da sua conta.</p></details>
        <details><summary>Como funciona o compartilhamento de receita?</summary><p>É uma porcentagem do lucro do mês na conta real, operando pela plataforma, apurada no início do mês seguinte. Mês sem lucro, nada a pagar. Você acompanha tudo na aba Relatórios.</p></details>
        <details><summary>E o que muda no simulador?</summary><p>O simulador é a conta de treino. Cada subplano tem um tempo por dia; no Prestige ele é ilimitado. Uma sessão que já começou termina normalmente.</p></details>
      </section>
    </main>
  )
}
