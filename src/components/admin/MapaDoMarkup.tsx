/**
 * Quando o markup acontece (11/11/2026, Tiago: "enxergar por dia da semana, por horário... organiza pra mim").
 *
 * 2ª versão (11/11/2026, Tiago: "não gostei desse estilo de gráfico, difícil de bater o olho e entender"):
 * saiu o mapa de calor 7 × 24. Agora são dois gráficos de barras comuns, lado a lado, e uma frase no topo que
 * já diz a conclusão:
 *  - Por dia da semana: 7 barras deitadas, com o valor escrito em cada uma; o melhor dia em dourado cheio.
 *  - Por horário: 24 barras em pé (0h a 23h); as 3 melhores horas em dourado cheio, o valor escrito na melhor
 *    (3 rótulos em horas vizinhas se atropelavam).
 * Passar o mouse (ou tocar) numa barra mostra o valor, as operações e a fatia do total. "Média por dia" divide
 * cada dia da semana pelas vezes que ele aparece no período (5 terças e 4 domingos comparam de igual para igual).
 *
 * 3ª versão (11/11/2026, Tiago: "quero mais dados, os valores. quero poder clicar em cada barrinha do gráfico e
 * ver o detalhamento"): todas as horas mostram o valor em cima da barra (no computador), cada dia mostra a fatia
 * do total, e clicar numa barra abre o detalhe logo abaixo (DetalheDoMarkup.tsx).
 *
 * Os números saem de teeds_markup_mapa: a mesma contagem do resto do painel (só conta real, um contrato uma
 * vez, equipe fora, parceiro do topo). O período é o escolhido no topo da Visão geral; com "Agora", "Hoje" ou
 * "Ontem" (um dia só não forma semana) usa os últimos 30 dias.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import { dinheiro } from '../../core/dinheiro'
import type { JanelaDoPeriodo } from './PeriodoDaVisaoGeral'
import { DetalheDoMarkup, type Recorte } from './DetalheDoMarkup'
import './mapa-do-markup.css'

interface Mapa {
  total: number
  operacoes: number
  celulas: Array<{ d: number; h: number; markup: number; operacoes: number }>
  /** Quantas vezes cada dia da semana (1 = segunda) aparece no período. */
  dias: Record<string, number>
}

async function lerMapa(sessao: SessaoTeeds, marca: string, parceiro: string, de: number, ate: number): Promise<Mapa> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_markup_mapa`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_de: new Date(de).toISOString(), p_ate: new Date(ate).toISOString(), p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error('Não foi possível ler o markup por dia e horário agora.')
  return r.json()
}

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const HORAS = Array.from({ length: 24 }, (_, h) => h)
const usd = (v: number) => dinheiro(Number(v) || 0, 'USD')
const int = (n: number) => (Number(n) || 0).toLocaleString('pt-BR')
const hh = (h: number) => `${String(h % 24).padStart(2, '0')}h`
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
/** O valor curto em cima de cada barra: 130 · 9,4 · 1,2k (o "US$" vai no título do gráfico). */
const curto = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
  : v >= 10 ? Math.round(v).toLocaleString('pt-BR') : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))

type Modo = 'total' | 'media'
type Foco = { tipo: 'dia'; i: number } | { tipo: 'hora'; i: number } | null

export function MapaDoMarkup({ sessao, marca, parceiro, janela }: { sessao: SessaoTeeds; marca: string; parceiro: string; janela: JanelaDoPeriodo | null }) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  // um dia só não forma semana: Agora, Hoje e Ontem usam os últimos 30 dias
  const usaJanela = janela != null && janela.ate - janela.de >= 48 * 3600_000
  const [ancora] = useState(() => Date.now())
  const de = usaJanela ? janela!.de : ancora - 30 * 86_400_000
  const ate = usaJanela ? janela!.ate : ancora
  const aoVivo = usaJanela ? janela!.aoVivo : true
  const rotulo = usaJanela ? janela!.curto : 'Últimos 30 dias'
  const chave = `${marca}|${parceiro}|${usaJanela ? `${janela!.de}|${janela!.curto}` : '30d'}`

  const [mapa, setMapa] = useState<{ chave: string; dados: Mapa } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [modo, setModo] = useState<Modo>('total')
  const [foco, setFoco] = useState<Foco>(null)
  // o detalhe aberto (clique numa barra), com o fim do período fixado na hora em que abriu
  const [aberto, setAberto] = useState<{ r: Recorte; ate: number } | null>(null)
  useEffect(() => setAberto(null), [chave])
  const abrir = (r: Recorte) => setAberto((a) => (a && a.r.tipo === r.tipo && a.r.i === r.i ? null : { r, ate: a?.ate ?? (aoVivo ? Date.now() : ate) }))
  const estaAberto = (tipo: Recorte['tipo'], i: number) => aberto?.r.tipo === tipo && aberto.r.i === i

  useEffect(() => {
    let vivo = true
    let t = 0
    const ler = () => {
      window.clearTimeout(t)
      // período que chega até agora: o fim anda junto (relido a cada minuto)
      const fim = aoVivo ? Date.now() : ate
      void lerMapa(sessaoRef.current, marca, parceiro, de, fim)
        .then((d) => { if (vivo) { setMapa({ chave, dados: d }); setErro(null) } })
        .catch((e) => { if (vivo) setErro((e as Error).message) })
        .finally(() => { if (vivo && aoVivo) t = window.setTimeout(ler, document.visibilityState === 'hidden' ? 300_000 : 60_000) })
    }
    ler()
    return () => { vivo = false; window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const dados = mapa?.dados ?? null
  const lendo = mapa?.chave !== chave

  const conta = useMemo(() => {
    const vezes = (d: number) => Math.max(1, Number(dados?.dias?.[String(d + 1)] ?? 0))
    const dia = DIAS.map(() => ({ markup: 0, operacoes: 0 }))
    const hora = HORAS.map(() => ({ markup: 0, operacoes: 0 }))
    for (const c of dados?.celulas ?? []) {
      if (c.d < 1 || c.d > 7 || c.h < 0 || c.h > 23) continue
      const m = Number(c.markup) || 0, o = Number(c.operacoes) || 0
      dia[c.d - 1].markup += m; dia[c.d - 1].operacoes += o
      // na média por dia, cada hora soma a média de cada dia da semana e divide por 7 (um dia qualquer)
      hora[c.h].markup += modo === 'media' ? m / vezes(c.d - 1) / 7 : m
      hora[c.h].operacoes += o
    }
    const valorDia = (d: number) => (modo === 'media' ? dia[d].markup / vezes(d) : dia[d].markup)
    const valoresDia = DIAS.map((_, d) => valorDia(d))
    const valoresHora = hora.map((h) => h.markup)
    const totalHoras = valoresHora.reduce((a, v) => a + v, 0)
    const melhorDia = valoresDia.reduce((m, v, i) => (v > (valoresDia[m] ?? 0) ? i : m), 0)
    // as 3 melhores horas (com markup) ganham dourado cheio e o valor escrito
    const ordem = [...HORAS].filter((h) => valoresHora[h] > 0).sort((a, b) => valoresHora[b] - valoresHora[a])
    const top3 = new Set(ordem.slice(0, 3))
    const melhorHora = ordem[0] ?? null
    // a faixa de 3 horas seguidas que mais rende: o que se lê de primeira
    let faixa = { ini: 0, soma: 0 }
    for (const h of HORAS) {
      const soma = valoresHora[h] + valoresHora[(h + 1) % 24] + valoresHora[(h + 2) % 24]
      if (soma > faixa.soma) faixa = { ini: h, soma }
    }
    return {
      dia, hora, vezes, valoresDia, valoresHora, top3, melhorHora, faixa, totalHoras,
      melhorDia: valoresDia[melhorDia] > 0 ? melhorDia : null,
      maxDia: Math.max(...valoresDia, 0.0001), maxHora: Math.max(...valoresHora, 0.0001),
      totalDias: valoresDia.reduce((a, v) => a + v, 0),
    }
  }, [dados, modo])

  const sufixo = modo === 'media' ? ' por dia' : ''
  const temDados = (dados?.total ?? 0) > 0
  const legenda = (() => {
    if (foco?.tipo === 'dia') {
      const d = foco.i, c = conta.dia[d]
      return <><b>{DIAS[d]}</b>: {usd(c.markup)} em {int(c.operacoes)} {c.operacoes === 1 ? 'operação' : 'operações'} · {pct(c.markup, Number(dados?.total))}% do markup
        {' · '}média <b>{usd(c.markup / conta.vezes(d))}</b> por {DIAS[d].toLowerCase()} ({conta.vezes(d)} no período)</>
    }
    if (foco?.tipo === 'hora') {
      const h = foco.i, c = conta.hora[h]
      return <><b>Das {hh(h)} às {hh(h + 1)}</b>: {usd(c.markup)}{sufixo} · {int(c.operacoes)} {c.operacoes === 1 ? 'operação' : 'operações'} · {pct(c.markup, conta.totalHoras)}% do markup</>
    }
    return <><b>Clique numa barra</b> para ver o detalhe: quem operou, cada I.A., o dia a dia · Horário de Brasília · só conta real</>
  })()

  return (
    <div className={`vg-card vgm${lendo ? ' vg-lendo' : ''}`} aria-busy={lendo}>
      <div className="vgm-cab">
        <span className="vg-rot">Quando o markup acontece · {rotulo}</span>
        <div className="vgm-modo" role="group" aria-label="Como somar">
          <button type="button" className={modo === 'total' ? 'ativo' : ''} aria-pressed={modo === 'total'} onClick={() => setModo('total')}>Total</button>
          <button type="button" className={modo === 'media' ? 'ativo' : ''} aria-pressed={modo === 'media'} onClick={() => setModo('media')}>Média por dia</button>
        </div>
      </div>

      {erro && !dados ? <p className="vg-erro" role="alert">{erro}</p> : !dados ? (
        <div className="vgm-esq"><i className="vg-esq grande" /><i className="vg-esq" /></div>
      ) : !temDados ? (
        <p className="vg-vazio">Nenhum markup em conta real neste período.</p>
      ) : (
        <>
          {/* a conclusão, escrita: o que se lê de primeira */}
          <p className="vgm-frase">
            {conta.melhorDia != null && <><b>{DIAS[conta.melhorDia]}</b> é o dia mais forte ({usd(conta.valoresDia[conta.melhorDia])}{sufixo})</>}
            {conta.melhorDia != null && conta.faixa.soma > 0 && ' e '}
            {conta.faixa.soma > 0 && <>o markup se concentra <b>das {hh(conta.faixa.ini)} às {hh(conta.faixa.ini + 3)}</b> ({pct(conta.faixa.soma, conta.totalHoras)}% do total)</>}.
            <span className="vgm-total">Total no período <b>{usd(dados.total)}</b> · {int(dados.operacoes)} operações</span>
          </p>

          <div className="vgm-dois">
            <section className="vgm-bloco" aria-label="Markup por dia da semana">
              <h4>Por dia da semana</h4>
              <ol className="vgm-dias" onMouseLeave={() => setFoco(null)}>
                {DIAS.map((nome, d) => {
                  const v = conta.valoresDia[d]
                  return (
                    <li key={nome}>
                      <button type="button" className={`vgm-dia${conta.melhorDia === d ? ' melhor' : ''}${foco?.tipo === 'dia' && foco.i === d ? ' vgm-foco' : ''}${estaAberto('dia', d) ? ' vgm-aberto' : ''}`}
                        onMouseEnter={() => setFoco({ tipo: 'dia', i: d })} onFocus={() => setFoco({ tipo: 'dia', i: d })} onClick={() => abrir({ tipo: 'dia', i: d })}
                        aria-expanded={estaAberto('dia', d)} aria-label={`${nome}: ${usd(v)}${sufixo}. Abrir o detalhe`}>
                        <span className="vgm-dia-nome">{nome}</span>
                        <span className="vgm-dia-trilho"><u style={{ width: `${v > 0 ? Math.max(2, (v / conta.maxDia) * 100) : 0}%` }} /></span>
                        <span className="vgm-dia-valor">{v > 0 ? <>{usd(v)}<small>{pct(v, conta.totalDias)}% · {int(conta.dia[d].operacoes)} op.</small></> : '—'}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </section>

            <section className="vgm-bloco" aria-label="Markup por horário">
              <h4>Por horário <small>valores em US${sufixo} · as 3 melhores horas em dourado</small></h4>
              <div className="vgm-horas" onMouseLeave={() => setFoco(null)}>
                {HORAS.map((h) => {
                  const v = conta.valoresHora[h]
                  const top = conta.top3.has(h)
                  return (
                    <button key={h} type="button" className={`vgm-hora${top ? ' top' : ''}${foco?.tipo === 'hora' && foco.i === h ? ' vgm-foco' : ''}${estaAberto('hora', h) ? ' vgm-aberto' : ''}`}
                      onMouseEnter={() => setFoco({ tipo: 'hora', i: h })} onFocus={() => setFoco({ tipo: 'hora', i: h })} onClick={() => abrir({ tipo: 'hora', i: h })}
                      aria-expanded={estaAberto('hora', h)} aria-label={`Das ${hh(h)} às ${hh(h + 1)}: ${usd(v)}${sufixo}. Abrir o detalhe`}>
                      <u style={{ height: `${v > 0 ? Math.max(3, (v / conta.maxHora) * 100) : 0}%` }}>{v > 0 && <em>{curto(v)}</em>}</u>
                    </button>
                  )
                })}
              </div>
              <div className="vgm-eixo" aria-hidden="true">
                {HORAS.map((h) => <span key={h}>{h % 3 === 0 ? `${h}h` : ''}</span>)}
              </div>
            </section>
          </div>

          <small className="vg-barras-leg vgm-leg">{legenda}</small>

          {aberto && (
            <DetalheDoMarkup sessao={sessao} marca={marca} parceiro={parceiro} de={de} ate={aberto.ate} rotulo={rotulo}
              recorte={aberto.r} vezes={conta.vezes} onTrocar={(r) => setAberto((a) => (a ? { ...a, r } : a))} onFechar={() => setAberto(null)} />
          )}
        </>
      )}
    </div>
  )
}
