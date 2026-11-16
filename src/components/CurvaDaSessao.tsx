import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { OperacaoMotor } from '../core/deriv/engine'
import './curva-sessao.css'

/*
 * 16/11/2026 (Tiago: "tem como deixar esse gráfico mais bonito? com uma animação melhor"):
 * a Evolução da sessão desenhada em pixels de verdade (antes o SVG era esticado e a
 * bolinha do fim virava um ovo). Curva suave, verde acima do zero e vermelha abaixo,
 * a linha cresce até cada operação nova, ponta que pulsa com o resultado ao lado e
 * uma bolinha por operação com o detalhe ao passar o mouse ou tocar.
 * Nada mudou de lugar: só o desenho dentro da caixa.
 */

type Ponto = { x: number; y: number }

const num = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const assinado = (v: number) => `${v >= 0 ? '+' : '−'}${num(v)}`
const hora = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const semMovimento = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Curva monotônica (Fritsch–Carlson): suave, sem passar do topo nem do fundo de cada trecho. */
function caminhoSuave(p: Ponto[]): string {
  const n = p.length
  if (n === 0) return ''
  if (n === 1) return `M${p[0].x},${p[0].y}`
  if (n === 2) return `M${p[0].x},${p[0].y}L${p[1].x},${p[1].y}`
  const dx: number[] = [], m: number[] = []
  for (let i = 0; i < n - 1; i++) {
    dx[i] = p[i + 1].x - p[i].x
    m[i] = dx[i] === 0 ? 0 : (p[i + 1].y - p[i].y) / dx[i]
  }
  const t: number[] = [m[0]]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2
  t[n - 1] = m[n - 2]
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b
    if (h > 9) { const s = 3 / Math.sqrt(h); t[i] = s * a * m[i]; t[i + 1] = s * b * m[i] }
  }
  let d = `M${p[0].x.toFixed(1)},${p[0].y.toFixed(1)}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${(p[i].x + h).toFixed(1)},${(p[i].y + t[i] * h).toFixed(1)} ${(p[i + 1].x - h).toFixed(1)},${(p[i + 1].y - t[i + 1] * h).toFixed(1)} ${p[i + 1].x.toFixed(1)},${p[i + 1].y.toFixed(1)}`
  }
  return d
}

function limites(pontos: number[]) {
  let lo = 0, hi = 0
  for (const v of pontos) { if (v < lo) lo = v; if (v > hi) hi = v }
  const folga = (hi - lo) * 0.08 || 0.5
  return { lo: lo - (lo < 0 ? folga : 0), hi: hi + (hi > 0 ? folga : 0) || 0.5 }
}

/** O número que acompanha a linha: corre até o valor novo em vez de pular. */
export function useNumeroAnimado(alvo: number, ms = 600) {
  const [v, setV] = useState(alvo)
  const atual = useRef(alvo)
  useEffect(() => {
    const de = atual.current
    if (de === alvo || semMovimento() || !Number.isFinite(alvo)) { atual.current = alvo; setV(alvo); return }
    const t0 = performance.now()
    let id = 0
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - t0) / ms), q = 1 - Math.pow(1 - t, 3)
      atual.current = de + (alvo - de) * q
      setV(atual.current)
      if (t < 1) id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(id)
  }, [alvo, ms])
  return v
}

interface Props {
  pontos: number[]
  /** Para o detalhe de cada operação (número e horário). */
  historico?: OperacaoMotor[]
  operacoes?: number
}

export function CurvaDaSessao({ pontos, historico, operacoes }: Props) {
  const caixa = useRef<HTMLDivElement | null>(null)
  const [tam, setTam] = useState({ w: 0, h: 0 })
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  /*
    16/11/2026 (Tiago: "o gráfico ali sumiu"): a caixa só existe a partir da 1ª operação (antes aparece o
    "A curva aparece na primeira operação"). A medida rodava uma vez só, na montagem, quando a caixa ainda
    não existia: a curva nunca era medida e não desenhava. Agora mede quando a caixa aparece.
  */
  const [no, setNo] = useState<HTMLDivElement | null>(null)
  const refCaixa = useCallback((el: HTMLDivElement | null) => { caixa.current = el; setNo(el) }, [])

  useLayoutEffect(() => {
    const el = no
    if (!el) return
    const medir = () => setTam(t => (t.w === el.clientWidth && t.h === el.clientHeight ? t : { w: el.clientWidth, h: el.clientHeight }))
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [no])

  // animação: quando chega UMA operação nova, a linha cresce até ela
  const [quadro, setQuadro] = useState<{ k: number; ultimo: number; lo: number; hi: number } | null>(null)
  const anteriores = useRef<number[]>(pontos)
  useEffect(() => {
    const antes = anteriores.current
    anteriores.current = pontos
    const n = pontos.length
    const umaNova = n >= 3 && antes.length === n - 1 && antes[antes.length - 1] === pontos[n - 2]
    if (!umaNova || semMovimento()) { setQuadro(null); return }
    const a = limites(antes), b = limites(pontos)
    const de = pontos[n - 2], para = pontos[n - 1]
    const t0 = performance.now(), D = 650
    let raf = 0
    const passo = (agora: number) => {
      const t = Math.min(1, (agora - t0) / D), q = 1 - Math.pow(1 - t, 3)
      if (t >= 1) { setQuadro(null); return }
      setQuadro({ k: n - 1 + q, ultimo: de + (para - de) * q, lo: a.lo + (b.lo - a.lo) * q, hi: a.hi + (b.hi - a.hi) * q })
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [pontos])

  const [foco, setFoco] = useState<number | null>(null)
  const sumir = useRef(0)
  useEffect(() => () => clearTimeout(sumir.current), [])

  const desenho = useMemo(() => {
    const { w, h } = tam
    const n = pontos.length
    if (w < 20 || h < 16 || n < 2) return null
    const grande = h >= 70
    const lim = limites(pontos)
    const k = quadro?.k ?? n
    const lo = quadro?.lo ?? lim.lo, hi = quadro?.hi ?? lim.hi
    const vals = quadro ? [...pontos.slice(0, n - 1), quadro.ultimo] : pontos
    const padT = grande ? 22 : 5, padB = grande ? 8 : 4, padL = 2
    const padR = grande ? 8 : 5
    const larg = w - padL - padR, alt = h - padT - padB
    const x = (i: number) => padL + Math.min(1, k <= 1 ? 0 : i / (k - 1)) * larg
    const y = (v: number) => padT + ((hi - v) / (hi - lo || 1)) * alt
    const pts = vals.map((v, i) => ({ x: x(i), y: y(v) }))
    const linha = caminhoSuave(pts)
    const zero = y(0)
    const base = Math.max(padT, Math.min(h - padB, zero))
    const area = `${linha}L${pts[pts.length - 1].x.toFixed(1)},${base.toFixed(1)}L${pts[0].x.toFixed(1)},${base.toFixed(1)}Z`
    const espaco = larg / Math.max(1, n - 1)
    const fim = pts[pts.length - 1]
    const ultimo = vals[vals.length - 1]
    return { w, h, grande, pts, vals, linha, area, zero, fim, ultimo, padT, padB, padR, bolinhas: grande && espaco >= 7 }
  }, [tam, pontos, quadro])

  // a operação de cada ponto (a curva guarda só os últimos pontos; casa pelo fim)
  const detalhe = (i: number) => {
    const delta = pontos[i] - pontos[i - 1]
    const total = operacoes ?? pontos.length - 1
    const nOp = total - (pontos.length - 1 - i)
    const op = historico?.find(o => o.n === nOp)
    const confere = op && Math.abs(op.lucro - delta) < 0.011
    return { delta, nOp: nOp > 0 ? nOp : i, quando: confere ? op!.quando : null, sessao: pontos[i] }
  }

  const aoMover = (e: React.PointerEvent) => {
    if (!desenho?.grande) return
    const el = caixa.current!
    const r = el.getBoundingClientRect()
    // a tela do computador roda com zoom 0,9: o retângulo vem na escala da tela, o desenho não
    const px = (e.clientX - r.left) * (r.width ? el.clientWidth / r.width : 1)
    let melhor = 1, dist = Infinity
    desenho.pts.forEach((p, i) => { if (i > 0 && Math.abs(p.x - px) < dist) { dist = Math.abs(p.x - px); melhor = i } })
    setFoco(melhor)
    // no celular o dedo sai da tela logo depois do toque: a dica fica 3 s e some
    clearTimeout(sumir.current)
    if (e.pointerType !== 'mouse') sumir.current = window.setTimeout(() => setFoco(null), 3000)
  }

  if (pontos.length < 2) return <div className="tv-curva-vazia">A curva aparece na primeira operação.</div>

  const d = desenho
  const corFim = (d?.ultimo ?? 0) >= 0 ? 'var(--tv-up)' : 'var(--tv-down)'
  const focoValido = foco != null && d && foco < d.pts.length ? foco : null
  const info = focoValido != null ? detalhe(focoValido) : null

  return (
    <div ref={refCaixa} className="tv-curva tvc" onPointerMove={aoMover} onPointerDown={aoMover} onPointerLeave={(e) => { if (e.pointerType === 'mouse') setFoco(null) }}
      role="img" aria-label={`Evolução da sessão: ${assinado(pontos[pontos.length - 1])}`}>
      {d && (
        <svg width={d.w} height={d.h} viewBox={`0 0 ${d.w} ${d.h}`} aria-hidden="true">
          <defs>
            <clipPath id={`${id}c`}><rect x="0" y="0" width={d.w} height={Math.max(0, d.zero)} /></clipPath>
            <clipPath id={`${id}b`}><rect x="0" y={d.zero} width={d.w} height={Math.max(0, d.h - d.zero)} /></clipPath>
            <linearGradient id={`${id}gu`} x1="0" y1={d.padT} x2="0" y2={d.zero} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="var(--tv-up)" stopOpacity="0.30" />
              <stop offset="1" stopColor="var(--tv-up)" stopOpacity="0.03" />
            </linearGradient>
            <linearGradient id={`${id}gd`} x1="0" y1={d.h - d.padB} x2="0" y2={d.zero} gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="var(--tv-down)" stopOpacity="0.30" />
              <stop offset="1" stopColor="var(--tv-down)" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* linha do zero */}
          <line className="tvc-zero" x1="0" x2={d.w} y1={d.zero} y2={d.zero} />
          {d.grande && <text className="tvc-zero-rot" x={2} y={d.zero > d.h - 14 ? d.zero - 4 : d.zero + 12}>0</text>}

          <path d={d.area} fill={`url(#${id}gu)`} clipPath={`url(#${id}c)`} />
          <path d={d.area} fill={`url(#${id}gd)`} clipPath={`url(#${id}b)`} />
          <path className="tvc-linha" d={d.linha} stroke="var(--tv-up)" strokeWidth={d.grande ? 2.2 : 1.6} clipPath={`url(#${id}c)`} />
          <path className="tvc-linha" d={d.linha} stroke="var(--tv-down)" strokeWidth={d.grande ? 2.2 : 1.6} clipPath={`url(#${id}b)`} />

          {d.bolinhas && d.pts.slice(1, -1).map((p, j) => {
            const i = j + 1
            const delta = d.vals[i] - d.vals[i - 1]
            return <circle key={i} className={`tvc-op ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}`} cx={p.x} cy={p.y} r={focoValido === i ? 4.5 : 2.6} />
          })}

          {focoValido != null && <line className="tvc-guia" x1={d.pts[focoValido].x} x2={d.pts[focoValido].x} y1={d.padT - 6} y2={d.h - d.padB} />}

          {/* ponta viva */}
          <circle className="tvc-pulso" cx={d.fim.x} cy={d.fim.y} r={d.grande ? 5 : 3} fill={corFim} />
          <circle className="tvc-fim" cx={d.fim.x} cy={d.fim.y} r={d.grande ? 5 : 3} fill={corFim} />
        </svg>
      )}

      {d?.grande && (
        <span className="tvc-etiqueta" style={{
          right: Math.max(0, d.w - d.fim.x - 6),
          top: d.fim.y < 30 ? d.fim.y + 9 : d.fim.y - 27,
          background: corFim,
        }}>{assinado(d.ultimo)}</span>
      )}

      {info && d && focoValido != null && (
        <div className="tvc-dica" style={{
          left: Math.min(Math.max(0, d.pts[focoValido].x - 90), d.w - 180),
          top: d.pts[focoValido].y > d.h / 2 ? 4 : d.h - 52,
        }}>
          <span>Operação {info.nOp}{info.quando ? ` · ${hora(info.quando)}` : ''}</span>
          <b className={info.delta > 0 ? 'up' : info.delta < 0 ? 'down' : ''}>{assinado(info.delta)}</b>
          <small>Sessão {assinado(info.sessao)}</small>
        </div>
      )}
    </div>
  )
}
