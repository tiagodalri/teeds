/**
 * O plano de ação das recomendações da I.A. (17/11/2026, Tiago: "consegue transformar isso num plano de ação
 * top? quando clicar pra gerar as recomendações, gera um relatório topzão, padrão GF, bem visual, com plano de
 * ação pra melhorar").
 *
 * Tela cheia, sempre escura (azul GF + ouro, como o palco do Compartilhamento), montada com a leitura da I.A. e
 * os números do mesmo painel: a meta do próximo período, o diagnóstico em números, onde investir, as ações em
 * linha do tempo (esta semana, 15 dias, 30 dias) com passos para marcar, os horários e as lives que mais
 * renderam e os cuidados. "Baixar PDF" imprime só o relatório (A4, com as cores). Os passos marcados ficam no
 * aparelho, por leitura. Prefixo CSS pda-.
 */
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { MARCA } from '../../marca'
import type { LeituraDaIA, Negocio, PrazoDaAcao } from '../../core/teeds/negocio'
import { useDolar } from './EmReais'
import './plano-de-acao.css'

const PRAZOS: Array<{ id: PrazoDaAcao; titulo: string; sub: string }> = [
  { id: 'semana', titulo: 'Esta semana', sub: 'Começar já' },
  { id: '15_dias', titulo: 'Próximos 15 dias', sub: 'Colocar de pé' },
  { id: '30_dias', titulo: 'Até 30 dias', sub: 'Consolidar' },
]
const CATEGORIA: Record<string, string> = { horario: 'Horário', ia: 'Estratégia', manual: 'Manual', lives: 'Lives', clientes: 'Clientes', banca: 'Banca' }
const IMPACTO = { alto: 'Impacto alto', medio: 'Impacto médio', baixo: 'Impacto baixo' } as const
const usd = (v: number, casas = 2) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const vezes = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×`
const FUSO = 'America/Sao_Paulo'
const fmtDia = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, weekday: 'long', day: '2-digit', month: '2-digit' })
const fmtHora = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const fmtGerada = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const maiuscula = (t: string) => (t ? t[0].toUpperCase() + t.slice(1) : t)
/** prazo das leituras antigas (antes do plano): pelo impacto */
const prazoDe = (r: LeituraDaIA['recomendacoes'][number]): PrazoDaAcao => r.prazo ?? (r.impacto === 'alto' ? 'semana' : r.impacto === 'baixo' ? '30_dias' : '15_dias')

export function PlanoDeAcao({ leitura, negocio, rotulo, id, prontaEm, quem, aoFechar }: {
  leitura: LeituraDaIA; negocio: Negocio | null; rotulo: string
  /** id da leitura: os passos marcados ficam guardados por leitura */
  id: string; prontaEm: string | null; quem: string | null
  aoFechar: () => void
}) {
  const umaIA = MARCA.vocabularioIA ? 'I.A.' : 'Robôs'
  const dolar = useDolar()
  const chave = `${MARCA.id}.plano-de-acao.${id}`
  const [feitos, setFeitos] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(chave) || '{}') } catch { return {} } })
  useEffect(() => { try { localStorage.setItem(chave, JSON.stringify(feitos)) } catch { /* só nesta aba */ } }, [chave, feitos])

  // a tela de trás não rola, Esc fecha, e a impressão leva só o relatório
  useEffect(() => {
    document.body.classList.add('pda-aberto')
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', k)
    return () => { document.body.classList.remove('pda-aberto'); window.removeEventListener('keydown', k) }
  }, [aoFechar])

  const acoes = useMemo(() => leitura.recomendacoes.map((r, i) => {
    // sem passos (leitura antiga): o "como fazer" vira o passo
    const passos = r.passos?.length ? r.passos : [r.como].filter(Boolean)
    return { ...r, n: i + 1, prazo: prazoDe(r), passos }
  }), [leitura])
  const totalPassos = acoes.reduce((s, a) => s + a.passos.length, 0)
  const feitosN = acoes.reduce((s, a) => s + a.passos.filter((_, j) => feitos[`${a.n}.${j}`]).length, 0)
  const potencial = acoes.reduce((s, a) => s + (a.potencial ?? 0), 0)

  // os números do painel
  const ia = negocio?.origens.ia, manual = negocio?.origens.manual
  const total = (ia?.markup ?? 0) + (manual?.markup ?? 0)
  const pctIA = total > 0 ? (ia?.markup ?? 0) / total : 0
  const porPessoa = (o?: { markup: number; pessoas: number }) => (o && o.pessoas ? o.markup / o.pessoas : 0)
  const lr = negocio?.lives_resumo
  const livesVezes = lr && lr.tipico_live > 0 ? lr.markup_live / lr.tipico_live : 0
  const meta = leitura.meta && leitura.meta.alvo > 0 ? leitura.meta
    : total > 0 && potencial > 0 ? { titulo: `Levar o markup de ${usd(total)} para ${usd(total + potencial)}`, atual: total, alvo: total + potencial, texto: 'A soma do que cada ação pode render a mais, pela estimativa da I.A.' } : null
  const subida = meta && meta.atual > 0 ? (meta.alvo - meta.atual) / meta.atual : 0

  const horas = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, hora) => {
      const x = negocio?.horas.find((y) => y.hora === hora)
      return { hora, ia: x?.ia ?? 0, manual: x?.manual ?? 0 }
    })
    const maior = Math.max(0.01, ...h.map((x) => x.ia + x.manual))
    const top = [...h].sort((a, b) => b.ia + b.manual - (a.ia + a.manual)).slice(0, 3).filter((x) => x.ia + x.manual > 0).map((x) => x.hora).sort((a, b) => a - b)
    return { h, maior, top }
  }, [negocio])
  const lives = useMemo(() => [...(negocio?.lives ?? [])].sort((a, b) => b.markup - a.markup).slice(0, 3), [negocio])
  const temHoras = horas.h.some((x) => x.ia + x.manual > 0)

  const onde = leitura.veredito.onde === 'ia' ? `Onde investir: ${umaIA === 'Robôs' ? 'robôs' : 'I.A.'}` : leitura.veredito.onde === 'manual' ? 'Onde investir: manual'
    : leitura.veredito.onde === 'as_duas' ? 'Onde investir: nas duas frentes' : 'Ainda é cedo para escolher um lado'

  return createPortal(
    <div className="pda" role="dialog" aria-modal="true" aria-label="Plano de ação">
      <div className="pda-barra">
        <span className="pda-marca"><i aria-hidden>✦</i>{MARCA.prosa} · Plano de ação</span>
        <div>
          <button type="button" className="pda-pdf" onClick={() => window.print()}>
            <svg viewBox="0 0 24 24" aria-hidden><path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" /></svg>Baixar PDF</button>
          <button type="button" className="pda-x" onClick={aoFechar} aria-label="Fechar o plano de ação">×</button>
        </div>
      </div>

      <div className="pda-folha">
        {/* capa */}
        <header className={`pda-capa${meta ? '' : ' sem-meta'}`}>
          <div className="pda-capa-txt">
            <span className="pda-rot">Plano de ação · {rotulo}</span>
            <h1>{leitura.veredito.titulo || 'O que fazer para aumentar o markup'}</h1>
            <p>{leitura.resumo}</p>
            <small>Gerado {prontaEm ? `em ${fmtGerada.format(Date.parse(prontaEm))}` : ''}{quem ? ` por ${quem}` : ''} · leitura da I.A. com os números do painel</small>
          </div>
          {meta && <div className="pda-meta">
            <span className="pda-rot">Meta do próximo período</span>
            <b className="pda-meta-titulo">{meta.titulo}</b>
            <div className="pda-meta-nums">
              <div><small>Hoje</small><strong>{usd(meta.atual)}</strong></div>
              <svg viewBox="0 0 24 24" aria-hidden><path d="M5 12h14m0 0-5-5m5 5-5 5" /></svg>
              <div className="alvo"><small>Meta</small><strong>{usd(meta.alvo)}</strong></div>
            </div>
            <div className="pda-meta-barra" aria-hidden><i style={{ width: `${Math.min(100, meta.atual / Math.max(meta.alvo, 0.01) * 100)}%` }} /></div>
            <p>{subida > 0 && <b>+{Math.round(subida * 100)}%</b>} {meta.texto}</p>
            {dolar && meta.alvo > meta.atual && <small>≈ {brl((meta.alvo - meta.atual) * dolar)} a mais de markup</small>}
          </div>}
        </header>

        {/* diagnóstico */}
        {negocio && total > 0 && <section className="pda-sec">
          <h2><span aria-hidden />O diagnóstico em números</h2>
          <div className="pda-kpis">
            <article><small>Markup do período</small><strong>{usd(total)}</strong>{dolar && <em>≈ {brl(total * dolar)}</em>}</article>
            <article className="pda-divisao">
              <small>De onde veio o markup</small>
              <div className="pda-split" aria-label={`${umaIA} ${Math.round(pctIA * 100)}%, manual ${Math.round((1 - pctIA) * 100)}%`}>
                <i className="ia" style={{ width: `${pctIA * 100}%` }} /><i className="manual" style={{ width: `${(1 - pctIA) * 100}%` }} />
              </div>
              <p><b className="ia">{umaIA} {Math.round(pctIA * 100)}%</b> {usd(ia?.markup ?? 0)}</p>
              <p><b className="manual">Manual {Math.round((1 - pctIA) * 100)}%</b> {usd(manual?.markup ?? 0)}</p>
            </article>
            <article><small>Markup por pessoa</small>
              <div className="pda-duplo"><span><b className="ia">{umaIA}</b>{usd(porPessoa(ia))}</span><span><b className="manual">Manual</b>{usd(porPessoa(manual))}</span></div>
              <em>{(ia?.pessoas ?? 0).toLocaleString('pt-BR')} e {(manual?.pessoas ?? 0).toLocaleString('pt-BR')} pessoas</em></article>
            <article><small>Lives</small>
              {lr && lr.lives > 0 ? <><strong>{livesVezes > 0 ? vezes(livesVezes) : usd(lr.markup_live)}</strong><em>{livesVezes > 0 ? `o normal do horário · ${lr.lives} lives, ${usd(lr.markup_live)}` : `${lr.lives} lives no período`}</em></>
                : <><strong>—</strong><em>Nenhuma live no período</em></>}</article>
          </div>
        </section>}

        {/* onde investir */}
        <section className="pda-sec">
          <h2><span aria-hidden />Onde colocar o esforço</h2>
          <div className={`pda-veredito ${leitura.veredito.onde}`}>
            <span className="pda-rot">{onde}</span>
            <p>{leitura.veredito.texto}</p>
          </div>
        </section>

        {/* o plano */}
        <section className="pda-sec">
          <div className="pda-sec-cab">
            <h2><span aria-hidden />O plano, passo a passo</h2>
            <div className="pda-progresso" aria-label={`${feitosN} de ${totalPassos} passos feitos`}>
              <small>{feitosN} de {totalPassos} passos feitos</small>
              <span><i style={{ width: `${totalPassos ? feitosN / totalPassos * 100 : 0}%` }} /></span>
            </div>
          </div>
          <div className="pda-trilha">
            {PRAZOS.map((p) => {
              const daqui = acoes.filter((a) => a.prazo === p.id)
              return <div key={p.id} className={`pda-coluna p-${p.id}${daqui.length ? '' : ' vazia'}`}>
                <header><b>{p.titulo}</b><small>{p.sub} · {daqui.length} {daqui.length === 1 ? 'ação' : 'ações'}</small></header>
                {daqui.map((a) => {
                  const pronto = a.passos.length > 0 && a.passos.every((_, j) => feitos[`${a.n}.${j}`])
                  return <article key={a.n} className={`pda-acao${pronto ? ' pronta' : ''}`}>
                    <div className="pda-acao-topo">
                      <span className="pda-n">{pronto ? '✓' : a.n}</span>
                      <h3>{a.titulo}</h3>
                    </div>
                    <div className="pda-chips">
                      <i className={`imp ${a.impacto}`}>{IMPACTO[a.impacto] ?? 'Impacto'}</i>
                      <i>{CATEGORIA[a.categoria] ?? 'Geral'}</i>
                      {a.responsavel && a.responsavel.toLowerCase() !== (CATEGORIA[a.categoria] ?? '').toLowerCase() && <i className="quem">{a.responsavel}</i>}
                    </div>
                    <p className="pda-porque">{a.porque}</p>
                    <ul className="pda-passos">
                      {a.passos.map((t, j) => {
                        const k = `${a.n}.${j}`
                        return <li key={k}><label>
                          <input type="checkbox" checked={!!feitos[k]} onChange={(e) => setFeitos((f) => ({ ...f, [k]: e.target.checked }))} />
                          <span>{t}</span></label></li>
                      })}
                    </ul>
                    {(a.indicador || a.alvo || (a.potencial ?? 0) > 0) && <dl className="pda-medir">
                      {a.indicador && <div><dt>Medir</dt><dd>{a.indicador}</dd></div>}
                      {a.alvo && <div><dt>Alvo</dt><dd>{a.alvo}</dd></div>}
                      {(a.potencial ?? 0) > 0 && <div className="pot"><dt>Pode render</dt><dd>+{usd(a.potencial ?? 0)}</dd></div>}
                    </dl>}
                  </article>
                })}
              </div>
            })}
          </div>
        </section>

        {/* horários e lives */}
        {(temHoras || lives.length > 0) && <section className="pda-sec pda-dupla">
          {temHoras && <div className="pda-horas">
            <h2><span aria-hidden />Os horários que mais rendem</h2>
            <div className="pda-barras" role="img" aria-label={`Horários mais fortes: ${horas.top.map((h) => `${h}h`).join(', ')}`}>
              {horas.h.map((x) => <div key={x.hora} className={horas.top.includes(x.hora) ? 'top' : ''} title={`${x.hora}h · ${umaIA} ${usd(x.ia)} · manual ${usd(x.manual)}`}>
                <span style={{ height: `${(x.ia + x.manual) / horas.maior * 100}%` }}>
                  <i className="manual" style={{ height: `${x.ia + x.manual > 0 ? x.manual / (x.ia + x.manual) * 100 : 0}%` }} />
                </span>
                <small>{x.hora % 3 === 0 ? `${x.hora}h` : ''}</small>
              </div>)}
            </div>
            <p className="pda-legenda"><i className="ia" />{umaIA} <i className="manual" />Manual <b>Mais fortes: {horas.top.map((h) => `${h}h`).join(', ')}</b></p>
          </div>}
          {lives.length > 0 && <div className="pda-lives">
            <h2><span aria-hidden />As lives que mais renderam</h2>
            <ol>
              {lives.map((l, i) => <li key={l.inicio}>
                <span className="pda-lugar">{i + 1}º</span>
                <div>
                  <b>{maiuscula(fmtDia.format(Date.parse(l.inicio)))}</b>
                  <small>{l.estimada ? 'por volta de ' : ''}{fmtHora.format(Date.parse(l.inicio))} às {fmtHora.format(Date.parse(l.fim))} · {l.pessoas} pessoas operando</small>
                </div>
                <strong>{usd(l.markup)}<em>{l.tipico > 0 ? `${vezes(l.markup / l.tipico)} o normal` : ''}</em></strong>
              </li>)}
            </ol>
            {leitura.lives && <p className="pda-lives-txt">{leitura.lives}</p>}
          </div>}
        </section>}

        {leitura.alertas.length > 0 && <section className="pda-sec pda-cuidados">
          <h2>Antes de agir</h2>
          <ul>{leitura.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul>
        </section>}

        <footer className="pda-pe">
          <span><i aria-hidden>✦</i>{MARCA.prosa}</span>
          <p>Leitura feita por I.A. a partir dos números do painel (só conta real, equipe fora, horário de Brasília). Os valores de "pode render" e a meta são estimativas: elas apontam caminhos; a decisão é do time.</p>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
