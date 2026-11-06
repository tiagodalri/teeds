/**
 * O gráfico do cartão "Resultado" (06/11/2026, Tiago: "esse gráfico está bem
 * feio. experiência horrível. melhore."). Antes: barras e acumulado na mesma
 * área com escalas escondidas, sem eixo, um dia grande achatava todos os
 * outros e os dias sem operação viravam uma linha reta enganosa.
 *
 * Agora são dois painéis no mesmo eixo de datas, cada um com a sua escala:
 *  - em cima, o acumulado do período, com o eixo de valores e o zero rotulado;
 *  - embaixo, o resultado de cada dia (ou hora), em verde e vermelho. Um dia
 *    fora da curva não esconde os outros: a barra dele é cortada, com o valor
 *    escrito ao lado;
 *  - dias sem operação ficam numa faixa cinza "Sem operações", e o acumulado
 *    passa por eles tracejado (nada mudou ali);
 *  - passar o mouse, tocar ou usar as setas mostra o dia, o resultado do dia,
 *    as operações e o acumulado.
 * O SVG é desenhado na largura real do cartão, para o texto não encolher.
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { MASCARA } from '../../core/privacidade'
import { dinheiroComSinal, simboloMoeda } from '../../core/dinheiro'

export interface PontoDoGrafico { chave: string; longo: string; valor: number; ops: number }

const passoBonito = (bruto: number) => {
  const p = 10 ** Math.floor(Math.log10(Math.max(bruto, 1e-9)))
  const f = bruto / p
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p
}
function compacto(v: number, moeda: string, semSimbolo = false) {
  const a = Math.abs(v), s = v > 0 ? '+' : v < 0 ? '−' : ''
  const txt = a >= 1000
    ? `${(a / 1000).toLocaleString('pt-BR', { maximumFractionDigits: a >= 10000 ? 0 : 1 })} mil`
    : a.toLocaleString('pt-BR', { maximumFractionDigits: a >= 100 ? 0 : a >= 10 ? 1 : 2 })
  return v === 0 ? '0' : semSimbolo ? `${s}${txt}` : `${s}${simboloMoeda(moeda)} ${txt}`
}

export function GraficoDoResultado({ pontos, ocultos, moeda, porHora }: { pontos: PontoDoGrafico[]; ocultos: boolean; moeda: string; porHora: boolean }) {
  const caixa = useRef<HTMLDivElement>(null)
  const dica = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, '')
  const [W, setW] = useState(0)
  const [foco, setFoco] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setW(Math.round(el.clientWidth))
    medir()
    const o = new ResizeObserver(medir)
    o.observe(el)
    return () => o.disconnect()
  }, [])
  useEffect(() => setFoco(null), [pontos])

  const estreito = W > 0 && W < 560
  const n = pontos.length
  const g = useMemo(() => {
    if (!W || !n) return null
    // ---------- acumulado (painel de cima): escala com divisões redondas
    const acum: number[] = []
    pontos.reduce((s, p) => { const v = s + p.valor; acum.push(v); return v }, 0)
    let lo = Math.min(0, ...acum), hi = Math.max(0, ...acum)
    if (hi - lo < 1e-9) { hi = 1; lo = -1 }
    const passo = passoBonito((hi - lo) / (estreito ? 3 : 4))
    lo = Math.floor(lo / passo + 1e-9) * passo; hi = Math.ceil(hi / passo - 1e-9) * passo
    const ticks: number[] = []
    for (let v = lo; v <= hi + passo / 2; v += passo) ticks.push(Math.round(v * 100) / 100)

    // o resultado de cada dia: um dia fora da curva (3x o segundo maior) é cortado
    const abs = pontos.map((p) => Math.abs(p.valor)).filter((v) => v > 0).sort((a, b) => b - a)
    let teto = abs[0] ?? 1
    if (abs.length >= 3 && abs[0] > 3 * abs[1]) teto = abs[1] * 1.15
    teto = passoBonito(teto)

    // a margem da esquerda é a do rótulo mais comprido (no celular, sem o "US$")
    const rotulo = (v: number) => compacto(v, moeda, estreito)
    const maior = Math.max(...ticks.map((t) => rotulo(t).length), rotulo(-teto).length)
    const ESQ = ocultos ? 10 : Math.ceil(maior * (estreito ? 6.6 : 6.9)) + 14, DIR = 10
    const H1 = estreito ? 150 : 168, GAP = 38, H2 = estreito ? 66 : 74, TOPO = 22, BASE = 26
    const H = TOPO + H1 + GAP + H2 + BASE
    const largura = (W - ESQ - DIR) / n
    const x = (i: number) => ESQ + largura * (i + 0.5)
    const y1 = (v: number) => TOPO + (1 - (v - lo) / (hi - lo)) * H1

    // trechos: com operação é a linha cheia; sem operação, tracejada
    const cheios: string[] = [], tracejados: string[] = []
    for (let i = 1; i < n; i++) (pontos[i].ops ? cheios : tracejados).push(`M${x(i - 1).toFixed(1)},${y1(acum[i - 1]).toFixed(1)}L${x(i).toFixed(1)},${y1(acum[i]).toFixed(1)}`)
    const linha = acum.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y1(v).toFixed(1)}`).join('')
    const area = n > 1 ? `${linha}L${x(n - 1).toFixed(1)},${y1(0).toFixed(1)}L${x(0).toFixed(1)},${y1(0).toFixed(1)}Z` : ''

    // ---------- resultado de cada dia (painel de baixo), com corte para o dia fora da curva
    const topo2 = TOPO + H1 + GAP
    const temPos = pontos.some((p) => p.valor > 0), temNeg = pontos.some((p) => p.valor < 0)
    const zero2 = temPos && temNeg ? topo2 + H2 / 2 : temNeg ? topo2 : topo2 + H2
    const alcance = temPos && temNeg ? H2 / 2 : H2
    const larguraBarra = Math.max(2, Math.min(18, largura * 0.62))
    const barras = pontos.map((p, i) => {
      if (!p.ops) return null
      const cortada = Math.abs(p.valor) > teto
      const h = Math.max(2, (Math.min(Math.abs(p.valor), teto) / teto) * (alcance - 2))
      const sobe = p.valor > 0, cai = p.valor < 0
      return { i, x: x(i) - larguraBarra / 2, y: sobe || !cai ? zero2 - h : zero2, h, sobe, cai, cortada }
    })

    // ---------- faixas sem operação
    const faixas: Array<{ de: number; ate: number }> = []
    pontos.forEach((p, i) => {
      if (p.ops) return
      const ult = faixas[faixas.length - 1]
      if (ult && ult.ate === i - 1) ult.ate = i; else faixas.push({ de: i, ate: i })
    })

    // ---------- datas no eixo de baixo
    const quantas = Math.max(2, Math.floor((W - ESQ) / (estreito ? 62 : 78)))
    const passoX = porHora ? (quantas >= 8 ? 3 : 6) : Math.max(1, Math.ceil(n / quantas))
    const datas: number[] = []
    for (let i = 0; i < n; i += passoX) datas.push(i)
    // o último dia sempre aparece; se encostar no anterior, fica no lugar dele
    if (datas[datas.length - 1] !== n - 1) { if ((n - 1 - datas[datas.length - 1]) * largura < (estreito ? 50 : 58)) datas.pop(); datas.push(n - 1) }

    return { ESQ, DIR, H, H1, H2, TOPO, topo2, largura, x, acum, ticks, y1, cheios, tracejados, area, barras, teto, zero2, temPos, temNeg, faixas, datas, larguraBarra, rotulo }
  }, [W, n, pontos, ocultos, estreito, porHora])

  const vs = (v: number) => (ocultos ? MASCARA : dinheiroComSinal(v, moeda))
  const mover = (e: PointerEvent<SVGSVGElement>) => {
    if (!g) return
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    setFoco(Math.max(0, Math.min(n - 1, Math.floor((px - g.ESQ) / g.largura))))
  }
  const teclas = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      setFoco((f) => Math.max(0, Math.min(n - 1, (f ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1))))
    } else if (e.key === 'Escape') setFoco(null)
  }
  const fim = g ? g.acum[g.acum.length - 1] ?? 0 : 0
  // a caixa de detalhes fica ao lado do cursor e nunca sai do cartão
  useLayoutEffect(() => {
    const el = dica.current
    if (!el || !g || foco == null) return
    const w = el.offsetWidth, cx = g.x(foco)
    let left = cx + 12
    if (left + w > W) left = cx - 12 - w
    el.style.left = `${Math.max(0, Math.min(W - w, left))}px`
  })
  const unidade = porHora ? 'hora' : 'dia'
  const p = foco != null ? pontos[foco] : null

  return (
    <div className="rgr" ref={caixa} style={{ minHeight: g?.H ?? (estreito ? 290 : 316) }}>
      {g && (
        <svg width={W} height={g.H} viewBox={`0 0 ${W} ${g.H}`} role="img" tabIndex={0}
          aria-label={`Acumulado no período: ${vs(fim)}. Use as setas para ver cada ${unidade}.`}
          onPointerMove={mover} onPointerDown={mover} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setFoco(null) }}
          onKeyDown={teclas} onBlur={() => setFoco(null)}>
          {/* faixas sem operação, atrás dos dois painéis */}
          {g.faixas.map((f) => {
            const x0 = g.x(f.de) - g.largura / 2, w = g.largura * (f.ate - f.de + 1)
            return (
              <g key={f.de} className="rgr-sem">
                <rect x={x0} y={g.TOPO} width={w} height={g.topo2 + g.H2 - g.TOPO} />
                {w >= 74 && <text x={x0 + w / 2} y={g.TOPO + 14} textAnchor="middle">Sem operações</text>}
              </g>
            )
          })}

          {/* painel de cima: acumulado */}
          <text className="rgr-titulo" x={ocultos ? g.ESQ : 0} y={11}>Acumulado no período</text>
          {g.ticks.map((t) => (
            <g key={t} className={t === 0 ? 'rgr-zero' : 'rgr-grade'}>
              <line x1={g.ESQ} x2={W - g.DIR} y1={g.y1(t)} y2={g.y1(t)} />
              {!ocultos && <text x={g.ESQ - 8} y={g.y1(t) + 4} textAnchor="end">{g.rotulo(t)}</text>}
            </g>
          ))}
          {g.area && <>
            <clipPath id={`${id}-acima`}><rect x={0} y={0} width={W} height={g.y1(0)} /></clipPath>
            <clipPath id={`${id}-abaixo`}><rect x={0} y={g.y1(0)} width={W} height={g.H} /></clipPath>
            <path className="rgr-area sobe" d={g.area} clipPath={`url(#${id}-acima)`} />
            <path className="rgr-area cai" d={g.area} clipPath={`url(#${id}-abaixo)`} />
          </>}
          <path className="rgr-trecho-vazio" d={g.tracejados.join('')} />
          <path className="rgr-linha" d={g.cheios.join('')} />
          {n === 1 && <circle className="rgr-ponta" cx={g.x(0)} cy={g.y1(g.acum[0])} r={4.5} />}
          {n > 1 && foco == null && <circle className="rgr-ponta" cx={g.x(n - 1)} cy={g.y1(fim)} r={4.5} />}

          {/* painel de baixo: cada dia */}
          <text className="rgr-titulo" x={ocultos ? g.ESQ : 0} y={g.topo2 - 9}>{porHora ? 'Resultado de cada hora' : 'Resultado de cada dia'}</text>
          <line className="rgr-zero" x1={g.ESQ} x2={W - g.DIR} y1={g.zero2} y2={g.zero2} />
          {!ocultos && <>
            {g.temPos && <text className="rgr-escala" x={g.ESQ - 8} y={g.topo2 + 9} textAnchor="end">{g.rotulo(g.teto)}</text>}
            {g.temNeg && <text className="rgr-escala" x={g.ESQ - 8} y={g.topo2 + g.H2} textAnchor="end">{g.rotulo(-g.teto)}</text>}
          </>}
          {g.barras.map((b) => b && (
            <g key={b.i} className={`rgr-barra ${b.sobe ? 'sobe' : b.cai ? 'cai' : 'neutra'} ${foco != null && foco !== b.i ? 'apagada' : ''}`}>
              <rect x={b.x} y={b.y} width={g.larguraBarra} height={b.h} rx={Math.min(3, g.larguraBarra / 3)} />
              {b.cortada && <>
                <path className="rgr-corte" d={`M${b.x - 2},${(b.sobe ? b.y + 10 : b.y + b.h - 13).toFixed(1)}l${g.larguraBarra + 4},-4m0,6l-${g.larguraBarra + 4},4`} />
                {!ocultos && <text className="rgr-valor-corte" x={b.x + g.larguraBarra + 4 > W - 70 ? b.x - 4 : b.x + g.larguraBarra + 4} textAnchor={b.x + g.larguraBarra + 4 > W - 70 ? 'end' : 'start'}
                  y={b.sobe ? b.y + 9 : b.y + b.h - 2}>{compacto(pontos[b.i].valor, moeda)}</text>}
              </>}
            </g>
          ))}

          {/* datas */}
          {g.datas.map((i) => (
            <text key={i} className="rgr-data" x={g.x(i)} y={g.H - 7} textAnchor={i === 0 && g.largura < 30 ? 'start' : i === n - 1 && g.largura < 30 ? 'end' : 'middle'}>{pontos[i].chave}</text>
          ))}

          {/* o cursor */}
          {foco != null && <>
            <line className="rgr-cursor" x1={g.x(foco)} x2={g.x(foco)} y1={g.TOPO} y2={g.topo2 + g.H2} />
            <circle className="rgr-ponta" cx={g.x(foco)} cy={g.y1(g.acum[foco])} r={5} />
          </>}
        </svg>
      )}
      {g && p && foco != null && (
        <div ref={dica} className="rgr-dica" role="status">
          <b>{p.longo}</b>
          {p.ops ? <>
            <span><i className={p.valor > 0 ? 'sobe' : p.valor < 0 ? 'cai' : ''}>{vs(p.valor)}</i> {porHora ? 'na hora' : 'no dia'}</span>
            <small>{p.ops.toLocaleString('pt-BR')} {p.ops === 1 ? 'operação' : 'operações'}</small>
          </> : <small>Sem operações</small>}
          <span className="rgr-dica-acum">Acumulado <i className={g.acum[foco] > 0 ? 'sobe' : g.acum[foco] < 0 ? 'cai' : ''}>{vs(g.acum[foco])}</i></span>
        </div>
      )}
    </div>
  )
}
