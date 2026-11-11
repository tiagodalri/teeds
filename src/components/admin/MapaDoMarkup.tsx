/**
 * Quando o markup acontece (11/11/2026, Tiago: "enxergar por dia da semana, por horário... organiza pra mim").
 *
 * Um mapa de calor da Visão geral: 7 linhas (segunda a domingo) × 24 colunas (as horas de Brasília), cada
 * quadrado mais dourado quanto mais markup aquele horário gerou. Em cima, a soma de cada hora; à direita, a
 * de cada dia da semana; no topo, o melhor dia, o melhor horário e o pico da semana. Dá para ver o total ou a
 * média por dia (o período pode ter 5 terças e 4 domingos: a média compara de igual para igual).
 *
 * Os números saem de teeds_markup_mapa: a mesma contagem do resto do painel (só conta real, um contrato uma
 * vez, equipe fora, parceiro do topo). O período é o escolhido no topo da Visão geral; com "Agora", "Hoje" ou
 * "Ontem" (um dia só não forma semana) o mapa usa os últimos 30 dias.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import { dinheiro } from '../../core/dinheiro'
import type { JanelaDoPeriodo } from './PeriodoDaVisaoGeral'
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
  if (!r.ok) throw new Error('Não foi possível ler o mapa do markup agora.')
  return r.json()
}

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']
const DIAS_CURTOS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']
const HORAS = Array.from({ length: 24 }, (_, h) => h)
const usd = (v: number) => dinheiro(Number(v) || 0, 'USD')
const int = (n: number) => (Number(n) || 0).toLocaleString('pt-BR')
const faixa = (h: number) => `${String(h).padStart(2, '0')}h–${String((h + 1) % 24).padStart(2, '0')}h`
/** Raiz: um pico não apaga o resto do mapa (os horários médios continuam visíveis). */
const forca = (v: number, max: number) => (max > 0 && v > 0 ? Math.max(0.12, Math.sqrt(v / max)) : 0)

type Modo = 'total' | 'media'

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
  const [foco, setFoco] = useState<{ d: number; h: number } | null>(null)

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
    const grade = Array.from({ length: 7 }, () => HORAS.map(() => ({ markup: 0, operacoes: 0 })))
    for (const c of dados?.celulas ?? []) {
      if (c.d >= 1 && c.d <= 7 && c.h >= 0 && c.h <= 23) grade[c.d - 1][c.h] = { markup: Number(c.markup) || 0, operacoes: Number(c.operacoes) || 0 }
    }
    const vezes = (d: number) => Math.max(1, Number(dados?.dias?.[String(d + 1)] ?? 0))
    const valor = (d: number, h: number) => (modo === 'media' ? grade[d][h].markup / vezes(d) : grade[d][h].markup)
    const porDia = grade.map((linha, d) => {
      const m = linha.reduce((a, c) => a + c.markup, 0)
      return modo === 'media' ? m / vezes(d) : m
    })
    // por hora: no modo média, a média de um dia qualquer naquela hora (soma das médias de cada dia ÷ 7)
    const porHora = HORAS.map((h) => grade.reduce((a, _, d) => a + valor(d, h), 0) / (modo === 'media' ? 7 : 1))
    let max = 0, pico: { d: number; h: number; v: number } | null = null
    for (let d = 0; d < 7; d++) for (const h of HORAS) {
      const v = valor(d, h)
      if (v > max) max = v
      if (v > 0 && (!pico || v > pico.v)) pico = { d, h, v }
    }
    const melhor = <T,>(lista: T[], v: (x: T) => number) => lista.reduce<{ i: number; v: number } | null>((m, x, i) => (v(x) > (m?.v ?? 0) ? { i, v: v(x) } : m), null)
    return {
      grade, valor, vezes, porDia, porHora, max, pico,
      maxDia: Math.max(...porDia, 0.0001), maxHora: Math.max(...porHora, 0.0001),
      melhorDia: melhor(porDia, (x) => x), melhorHora: melhor(porHora, (x) => x),
    }
  }, [dados, modo])

  const sufixo = modo === 'media' ? ' por dia' : ''
  const legenda = (() => {
    if (foco) {
      const c = conta.grade[foco.d][foco.h]
      return <>{DIAS[foco.d]}, {faixa(foco.h)}: <b>{usd(c.markup)}</b> em {int(c.operacoes)} {c.operacoes === 1 ? 'operação' : 'operações'}
        {' · '}média <b>{usd(c.markup / conta.vezes(foco.d))}</b> por {DIAS[foco.d].toLowerCase()} ({conta.vezes(foco.d)} no período)</>
    }
    return <>Passe o mouse (ou toque) num quadrado para ver o horário · Horário de Brasília · I.A. e manual, só conta real</>
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
      ) : (
        <>
          <div className="vgm-destaques">
            <div><span>Melhor dia da semana</span>
              <b>{conta.melhorDia ? DIAS[conta.melhorDia.i] : '—'}</b>
              <small>{conta.melhorDia ? `${usd(conta.melhorDia.v)}${sufixo}` : 'Sem markup no período'}</small></div>
            <div><span>Melhor horário</span>
              <b>{conta.melhorHora ? faixa(conta.melhorHora.i) : '—'}</b>
              <small>{conta.melhorHora ? `${usd(conta.melhorHora.v)}${modo === 'media' ? ' por dia' : ' no período'}` : '—'}</small></div>
            <div><span>Pico da semana</span>
              <b>{conta.pico ? `${DIAS_CURTOS[conta.pico.d]}, ${faixa(conta.pico.h)}` : '—'}</b>
              <small>{conta.pico ? `${usd(conta.pico.v)}${sufixo}` : '—'}</small></div>
            <div><span>Markup no mapa</span>
              <b className="ouro">{usd(dados.total)}</b>
              <small>{int(dados.operacoes)} operações</small></div>
          </div>

          <div className="vgm-rolagem">
            <div className="vgm-grade" onMouseLeave={() => setFoco(null)} role="grid" aria-label={`Markup por dia da semana e hora, ${rotulo}`}>
              {/* a soma de cada hora, em cima */}
              <span className="vgm-canto" aria-hidden="true" />
              {HORAS.map((h) => (
                <span key={`t${h}`} className={`vgm-topo${foco?.h === h ? ' vgm-foco' : ''}`} aria-hidden="true">
                  <u style={{ height: `${(conta.porHora[h] / conta.maxHora) * 100}%` }} />
                </span>
              ))}
              <span className="vgm-canto" aria-hidden="true" />

              {DIAS_CURTOS.map((nome, d) => (
                <div key={nome} className="vgm-linha" role="row">
                  <span className={`vgm-dia${foco?.d === d ? ' vgm-foco' : ''}`} role="rowheader">{nome}</span>
                  {HORAS.map((h) => {
                    const v = conta.valor(d, h)
                    const f = forca(v, conta.max)
                    const ehPico = conta.pico?.d === d && conta.pico?.h === h
                    return (
                      <button key={h} type="button" role="gridcell"
                        className={`vgm-q${v > 0 ? '' : ' zero'}${ehPico ? ' pico' : ''}${foco?.d === d && foco?.h === h ? ' vgm-foco' : ''}`}
                        style={v > 0 ? { ['--f' as string]: `${Math.round(f * 100)}%` } : undefined}
                        onMouseEnter={() => setFoco({ d, h })} onFocus={() => setFoco({ d, h })} onClick={() => setFoco({ d, h })}
                        aria-label={`${DIAS[d]}, ${faixa(h)}: ${usd(v)}${sufixo}`} />
                    )
                  })}
                  {/* a soma do dia, à direita */}
                  <span className="vgm-lado" aria-hidden="true"><u style={{ width: `${(conta.porDia[d] / conta.maxDia) * 100}%` }} /></span>
                </div>
              ))}

              <span className="vgm-canto" aria-hidden="true" />
              {HORAS.map((h) => <span key={`e${h}`} className="vgm-eixo" aria-hidden="true">{h % 3 === 0 ? `${h}h` : ''}</span>)}
              <span className="vgm-canto" aria-hidden="true" />
            </div>
          </div>

          <div className="vgm-pe">
            <small className="vg-barras-leg">{legenda}</small>
            <span className="vgm-escala" aria-hidden="true">Menos<i style={{ ['--f' as string]: '12%' }} /><i style={{ ['--f' as string]: '40%' }} /><i style={{ ['--f' as string]: '70%' }} /><i style={{ ['--f' as string]: '100%' }} />Mais</span>
          </div>
        </>
      )}
    </div>
  )
}
