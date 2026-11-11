/**
 * O detalhe de uma barra de "Quando o markup acontece" (11/11/2026, Tiago: "quero poder clicar em cada barrinha
 * do gráfico e ver o detalhamento dos dados etc. tudo pensando com a melhor experiência possível").
 *
 * Abre logo abaixo dos gráficos ao clicar num dia da semana ou numa hora. Mostra, para aquele recorte:
 *  - os números (markup e a fatia do período, operações, markup por operação, pessoas, movimentado, resultado
 *    dos clientes e a média por dia);
 *  - I.A. contra manual, e cada I.A. com o markup que gerou;
 *  - quem mais gerou markup;
 *  - o dia a dia (cada data do período) e o cruzamento: num dia da semana, hora a hora; numa hora, em cada dia
 *    da semana.
 * As setas (ou ← →) passam para o dia/hora vizinho; Esc ou o × fecham.
 *
 * Os números saem de teeds_markup_mapa_detalhe: a mesma contagem do gráfico (teeds_markup_operacoes).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import { dinheiro } from '../../core/dinheiro'
import { MARCA } from '../../marca'
import './detalhe-do-markup.css'
import { SeloDoParceiro } from '../parceiros/SeloDoParceiro'

export type Recorte = { tipo: 'dia'; i: number } | { tipo: 'hora'; i: number }

interface Detalhe {
  total_periodo: number
  markup: number; operacoes: number; volume: number; resultado: number; clientes: number
  ia: { markup: number; operacoes: number }
  manual: { markup: number; operacoes: number }
  por_data: Array<{ dia: string; markup: number; operacoes: number }>
  por_hora: Array<{ h: number; markup: number; operacoes: number }>
  por_dia_semana: Array<{ d: number; markup: number; operacoes: number }>
  por_ia: Array<{ nome: string; markup: number; operacoes: number; clientes: number }>
  clientes_top: Array<{ user_id: string; nome: string | null; foto_url: string | null; parceiro: string | null; markup: number; operacoes: number; resultado: number }>
}

async function lerDetalhe(sessao: SessaoTeeds, marca: string, parceiro: string, de: number, ate: number, r: Recorte): Promise<Detalhe> {
  const resp = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_markup_mapa_detalhe`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_de: new Date(de).toISOString(), p_ate: new Date(ate).toISOString(), p_parceiro: parceiro || null,
      p_dia: r.tipo === 'dia' ? r.i + 1 : null, p_hora: r.tipo === 'hora' ? r.i : null }),
  })
  if (!resp.ok) throw new Error('Não foi possível abrir o detalhe agora. Tente de novo.')
  return resp.json()
}

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const PLURAL = ['segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados', 'domingos']
const PARCEIRO: Record<string, string> = { n: 'Naor', v: 'Victor', d: 'Douglas' }
const usd = (v: number) => dinheiro(Number(v) || 0, 'USD')
const int = (n: number) => (Number(n) || 0).toLocaleString('pt-BR')
const hh = (h: number) => `${String(h % 24).padStart(2, '0')}h`
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
const pctTxt = (v: number) => `${v < 10 && v > 0 ? v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : Math.round(v)}%`
const comSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${usd(Math.abs(v))}`
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const diaDaSemana = (dia: string) => DIAS_CURTOS[(new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7]
const iniciais = (nome: string | null) => (nome ?? '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? '').join('').toUpperCase() || '?'
export const tituloDoRecorte = (r: Recorte) => (r.tipo === 'dia' ? DIAS[r.i] : `Das ${hh(r.i)} às ${hh(r.i + 1)}`)

/** Barras deitadas simples (nome, barra, valor), usadas nas listas do detalhe. */
function Lista({ itens, max, vazio }: { itens: Array<{ chave: string; nome: ReactNode; valor: number; nota?: ReactNode; destaque?: boolean }>; max: number; vazio: string }) {
  if (!itens.length) return <p className="vgd-vazio">{vazio}</p>
  return (
    <ol className="vgd-lista">
      {itens.map((x) => (
        <li key={x.chave} className={x.destaque ? 'destaque' : ''}>
          <span className="vgd-lista-nome">{x.nome}</span>
          <span className="vgd-lista-trilho"><u style={{ width: `${x.valor > 0 ? Math.max(2, (x.valor / Math.max(max, 0.0001)) * 100) : 0}%` }} /></span>
          <span className="vgd-lista-valor"><b>{x.valor > 0 ? usd(x.valor) : '—'}</b>{x.nota && <small>{x.nota}</small>}</span>
        </li>
      ))}
    </ol>
  )
}

export function DetalheDoMarkup({ sessao, marca, parceiro, de, ate, rotulo, recorte, vezes, onTrocar, onFechar }: {
  sessao: SessaoTeeds; marca: string; parceiro: string
  de: number; ate: number
  /** "Últimos 30 dias", "7 dias"…: o período do gráfico. */
  rotulo: string
  recorte: Recorte
  /** Quantas vezes cada dia da semana (0 = segunda) aparece no período. */
  vezes: (d: number) => number
  onTrocar: (r: Recorte) => void
  onFechar: () => void
}) {
  const sessaoRef = useRef(sessao)
  sessaoRef.current = sessao
  const cache = useRef(new Map<string, Detalhe>())
  const chave = `${marca}|${parceiro}|${de}|${ate}|${recorte.tipo}|${recorte.i}`
  const [dados, setDados] = useState<{ chave: string; d: Detalhe } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const raiz = useRef<HTMLElement>(null)

  useEffect(() => {
    let vivo = true
    const guardado = cache.current.get(chave)
    if (guardado) { setDados({ chave, d: guardado }); setErro(null); return }
    lerDetalhe(sessaoRef.current, marca, parceiro, de, ate, recorte)
      .then((d) => { cache.current.set(chave, d); if (vivo) { setDados({ chave, d }); setErro(null) } })
      .catch((e) => { if (vivo) setErro((e as Error).message) })
    return () => { vivo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  // ao abrir, o painel aparece inteiro na tela (no celular ele fica embaixo dos gráficos)
  const abriu = useRef(false)
  useEffect(() => {
    if (abriu.current) return
    abriu.current = true
    const el = raiz.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.top < 0 || r.top > window.innerHeight - 160) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const n = recorte.tipo === 'dia' ? 7 : 24
  const passar = (passo: number) => onTrocar({ tipo: recorte.tipo, i: (recorte.i + passo + n) % n } as Recorte)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return
      if (e.key === 'Escape') onFechar()
      else if (e.key === 'ArrowLeft') passar(-1)
      else if (e.key === 'ArrowRight') passar(1)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  const d = dados?.chave === chave ? dados.d : null
  const anterior = dados?.d ?? null
  const mostra = d ?? anterior
  const lendo = !d
  const nomeIA = MARCA.vocabularioIA ? 'I.A.' : 'Robôs'

  // a média por dia: num dia da semana, por vez que ele aparece; numa hora, por dia do período
  const diasNoPeriodo = Math.max(1, Math.round((ate - de) / 86_400_000))
  const media = mostra ? (recorte.tipo === 'dia' ? Number(mostra.markup) / vezes(recorte.i) : Number(mostra.markup) / diasNoPeriodo) : 0
  const textoMedia = recorte.tipo === 'dia'
    ? `por ${DIAS[recorte.i].toLowerCase()} (${vezes(recorte.i)} ${vezes(recorte.i) === 1 ? DIAS[recorte.i].toLowerCase() : PLURAL[recorte.i]} no período)`
    : `por dia nesse horário (${diasNoPeriodo} dias)`

  const ia = Number(mostra?.ia.markup ?? 0), man = Number(mostra?.manual.markup ?? 0)
  const fatiaIA = pct(ia, ia + man)

  const listaIA = [
    ...(mostra?.por_ia ?? []).map((x) => ({ chave: x.nome, nome: x.nome, valor: Number(x.markup), nota: <>{int(x.operacoes)} op. · {int(x.clientes)} {x.clientes === 1 ? 'pessoa' : 'pessoas'}</> })),
    ...(man > 0 ? [{ chave: 'manual', nome: 'Manual', valor: man, nota: <>{int(mostra?.manual.operacoes ?? 0)} op.</> }] : []),
  ].sort((a, b) => b.valor - a.valor)
  const maxIA = Math.max(...listaIA.map((x) => x.valor), 0)

  const datas = (mostra?.por_data ?? []).filter((x) => recorte.tipo === 'dia' || Number(x.markup) > 0 || (mostra?.por_data.length ?? 0) <= 14)
  const maxData = Math.max(...datas.map((x) => Number(x.markup)), 0)
  const melhorData = datas.reduce<typeof datas[number] | null>((m, x) => (Number(x.markup) > Number(m?.markup ?? 0) ? x : m), null)

  // o cruzamento: num dia da semana, as 24 horas; numa hora, os 7 dias da semana
  const cruz = recorte.tipo === 'dia'
    ? Array.from({ length: 24 }, (_, h) => mostra?.por_hora.find((x) => x.h === h))
    : Array.from({ length: 7 }, (_, i) => mostra?.por_dia_semana.find((x) => x.d === i + 1))
  const maxCruz = Math.max(...cruz.map((x) => Number(x?.markup ?? 0)), 0.0001)
  const melhorCruz = cruz.reduce((m, x, i) => (Number(x?.markup ?? 0) > Number(cruz[m]?.markup ?? 0) ? i : m), 0)
  const [focoCruz, setFocoCruz] = useState<number | null>(null)
  useEffect(() => setFocoCruz(null), [chave])
  const fc = focoCruz != null ? cruz[focoCruz] : null

  return (
    <section ref={raiz} className={`vgd${lendo ? ' vgd-lendo' : ''}`} aria-label={`Detalhe: ${tituloDoRecorte(recorte)}`} aria-busy={lendo}>
      <header className="vgd-cab">
        <div className="vgd-titulo">
          <span className="vg-rot">Detalhe · {rotulo}</span>
          <h4>{tituloDoRecorte(recorte)}</h4>
        </div>
        <div className="vgd-controles">
          <button type="button" className="vgd-seta" onClick={() => passar(-1)} aria-label={recorte.tipo === 'dia' ? 'Dia anterior' : 'Hora anterior'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <button type="button" className="vgd-seta" onClick={() => passar(1)} aria-label={recorte.tipo === 'dia' ? 'Próximo dia' : 'Próxima hora'}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
          </button>
          <button type="button" className="vgd-fechar" onClick={onFechar} aria-label="Fechar o detalhe">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </header>

      {erro && !mostra ? <p className="vg-erro" role="alert">{erro}</p> : !mostra ? (
        <div className="vgd-esq"><i className="vg-esq grande" /><i className="vg-esq" /><i className="vg-esq" /></div>
      ) : Number(mostra.markup) <= 0 && Number(mostra.operacoes) === 0 ? (
        <p className="vgd-vazio grande">Nenhuma operação em conta real {recorte.tipo === 'dia' ? `numa ${DIAS[recorte.i].toLowerCase()}` : 'nesse horário'} no período.</p>
      ) : (
        <>
          <div className="vgd-kpis">
            <div className="vgd-kpi principal">
              <span>Markup</span>
              <b>{usd(mostra.markup)}</b>
              <small><em>{pctTxt(pct(Number(mostra.markup), Number(mostra.total_periodo)))}</em> do markup do período</small>
            </div>
            <div className="vgd-kpi"><span>Média</span><b>{usd(media)}</b><small>{textoMedia}</small></div>
            <div className="vgd-kpi"><span>Operações</span><b>{int(mostra.operacoes)}</b><small>{usd(Number(mostra.markup) / Math.max(1, Number(mostra.operacoes)))} de markup por operação</small></div>
            <div className="vgd-kpi"><span>Pessoas que operaram</span><b>{int(mostra.clientes)}</b><small>{Number(mostra.clientes) ? usd(Number(mostra.markup) / Number(mostra.clientes)) : '—'} de markup por pessoa</small></div>
            <div className="vgd-kpi"><span>Movimentado</span><b>{usd(mostra.volume)}</b><small>soma das entradas</small></div>
            <div className="vgd-kpi"><span>Resultado dos clientes</span><b className={Number(mostra.resultado) >= 0 ? 'sobe' : 'cai'}>{comSinal(Number(mostra.resultado))}</b><small>ganhos menos perdas</small></div>
          </div>

          <div className="vgd-divisao" role="img" aria-label={`${nomeIA} ${pctTxt(fatiaIA)} e manual ${pctTxt(100 - fatiaIA)} do markup`}>
            <div className="vgd-divisao-barra"><u className="ia" style={{ width: `${fatiaIA}%` }} /><u className="manual" style={{ width: `${100 - fatiaIA}%` }} /></div>
            <div className="vgd-divisao-leg">
              <span><i className="ia" />{nomeIA} <b>{usd(ia)}</b> · {pctTxt(fatiaIA)}</span>
              <span><i className="manual" />Manual <b>{usd(man)}</b> · {pctTxt(ia + man > 0 ? 100 - fatiaIA : 0)}</span>
            </div>
          </div>

          <div className="vgd-colunas">
            <div className="vgd-bloco">
              <h5>Por {MARCA.vocabularioIA ? 'I.A.' : 'robô'}</h5>
              <Lista itens={listaIA} max={maxIA} vazio="Sem operações." />
            </div>
            <div className="vgd-bloco">
              <h5>Quem mais gerou markup</h5>
              {mostra.clientes_top.length ? (
                <ol className="vgd-pessoas">
                  {mostra.clientes_top.map((c, i) => (
                    <li key={c.user_id}>
                      <span className="vgd-pos">{i + 1}</span>
                      <span className="vgd-av" aria-hidden="true">{c.foto_url ? <img src={c.foto_url} alt="" loading="lazy" /> : iniciais(c.nome)}</span>
                      <span className="vgd-pessoa"><b>{c.nome || 'Cliente'}<SeloDoParceiro codigo={c.parceiro} nome={PARCEIRO[c.parceiro ?? '']} /></b><small>{int(c.operacoes)} op. · <span className={Number(c.resultado) >= 0 ? 'sobe' : 'cai'}>{comSinal(Number(c.resultado))}</span></small></span>
                      <strong>{usd(c.markup)}</strong>
                    </li>
                  ))}
                </ol>
              ) : <p className="vgd-vazio">Ninguém operou.</p>}
            </div>
          </div>

          <div className="vgd-colunas">
            <div className="vgd-bloco">
              <h5>{recorte.tipo === 'dia' ? `Cada ${DIAS[recorte.i].toLowerCase()} do período` : 'Dia a dia nesse horário'}
                {melhorData && Number(melhorData.markup) > 0 && <small>melhor: {ddmm(melhorData.dia)} ({usd(melhorData.markup)})</small>}</h5>
              <Lista max={maxData} vazio="Sem datas no período."
                itens={datas.map((x) => ({ chave: x.dia, nome: <>{recorte.tipo === 'hora' && <em>{diaDaSemana(x.dia)}</em>}{ddmm(x.dia)}</>, valor: Number(x.markup),
                  nota: Number(x.operacoes) ? <>{int(x.operacoes)} op.</> : undefined, destaque: x === melhorData }))} />
            </div>
            <div className="vgd-bloco">
              <h5>{recorte.tipo === 'dia' ? `Hora a hora na ${DIAS[recorte.i].toLowerCase()}` : 'Em cada dia da semana'}</h5>
              <div className={`vgd-cruz ${recorte.tipo === 'dia' ? 'horas' : 'dias'}`} onMouseLeave={() => setFocoCruz(null)}>
                {cruz.map((x, i) => {
                  const v = Number(x?.markup ?? 0)
                  const ativo = recorte.tipo === 'dia' ? false : i === recorte.i
                  return (
                    <button key={i} type="button" className={`${i === melhorCruz && v > 0 ? 'melhor' : ''}${focoCruz === i ? ' foco-x' : ''}${ativo ? ' ativo' : ''}`}
                      onMouseEnter={() => setFocoCruz(i)} onFocus={() => setFocoCruz(i)}
                      onClick={() => onTrocar(recorte.tipo === 'dia' ? { tipo: 'hora', i } : { tipo: 'dia', i })}
                      aria-label={`${recorte.tipo === 'dia' ? `Das ${hh(i)} às ${hh(i + 1)}` : DIAS[i]}: ${usd(v)}. Abrir o detalhe`}>
                      <u style={{ height: `${v > 0 ? Math.max(4, (v / maxCruz) * 100) : 0}%` }} />
                      <span>{recorte.tipo === 'dia' ? (i % 3 === 0 ? `${i}h` : '') : DIAS_CURTOS[i]}</span>
                    </button>
                  )
                })}
              </div>
              <small className="vgd-cruz-leg">{fc
                ? <><b>{recorte.tipo === 'dia' ? `Das ${hh(focoCruz!)} às ${hh(focoCruz! + 1)}` : DIAS[focoCruz!]}</b>: {usd(fc.markup)} · {int(fc.operacoes)} op. · clique para abrir</>
                : focoCruz != null ? <>Sem markup · clique para abrir</>
                : <>Clique numa barra para abrir o detalhe {recorte.tipo === 'dia' ? 'daquele horário' : 'daquele dia'}</>}</small>
            </div>
          </div>
        </>
      )}
      <p className="vgd-pe">Horário de Brasília · só conta real · {MARCA.vocabularioIA ? 'I.A.' : 'robôs'} e manual · as setas (ou ← → do teclado) passam para o vizinho, Esc fecha</p>
    </section>
  )
}
