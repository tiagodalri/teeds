/**
 * As peças da calibragem (13/11/2026): os mostradores que correm até o número novo, o medidor do saldo
 * exigido, a escada da maior sequência e a curva da sessão. A mesa de termômetros (AssistenteDaSessao)
 * monta a tela com elas. Sem som (os sons da plataforma são só do play, da meta e do stop).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import type { Cenario } from '../../core/teeds/cenariosDaSessao'

const usd = (x: number) => dinheiro(x, 'USD')
export const duracao = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')} min` : ''}`)
export const relogio = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)

/** A cor do nível: do verde ao vermelho, passando pelo ouro e pelo laranja. */
export const corDoNivel = (f: number) => `hsl(${Math.round(142 - 142 * Math.min(1, Math.max(0, f)))} 72% ${f < 0.5 ? 42 : 48}%)`

const ondeFoi = (c: Cenario) => {
  const f = c.operacoes ? c.previa.maiorSequencia.desde / c.operacoes : 0
  return f < 0.33 ? 'no começo' : f < 0.7 ? 'no meio' : 'perto do fim'
}
export function historia(c: Cenario, minutos: number): string {
  if (c.resultado >= 0) {
    return `Bate a meta de ${usd(c.meta)} em ${duracao(minutos)}. A maior sequência, ${c.maiorSequencia} ${c.maiorSequencia === 1 ? 'perda' : 'perdas seguidas'} (${usd(c.perdidoNaSequencia)} perdidos), vem ${ondeFoi(c)}${c.entradaQueRecuperou ? ` e a recuperação fecha com uma entrada de ${usd(c.entradaQueRecuperou)}` : ''}.`
  }
  return `${c.melhorMomento >= 0.5 ? `Chega a ${dinheiroComSinal(c.melhorMomento, 'USD')}, ` : 'Começa sem sair do lugar, '}entra numa sequência de ${c.maiorSequencia} perdas e bate o stop de ${usd(c.stop)} em ${duracao(minutos)}.`
}

/** Um número que corre até o valor novo (parado para quem pediu menos movimento). */
export function useCorrendo(alvo: number, ms = 240): number {
  const [v, setV] = useState(alvo)
  const atual = useRef(alvo)
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { atual.current = alvo; setV(alvo); return }
    const de = atual.current
    const inicio = performance.now()
    let id = 0
    const passo = (t: number) => {
      const k = Math.min(1, (t - inicio) / ms)
      const x = de + (alvo - de) * (1 - Math.pow(1 - k, 3))
      atual.current = x
      setV(x)
      if (k < 1) id = requestAnimationFrame(passo)
    }
    id = requestAnimationFrame(passo)
    // a aba em segundo plano segura os quadros: o valor final chega de qualquer jeito
    const fim = window.setTimeout(() => { cancelAnimationFrame(id); atual.current = alvo; setV(alvo) }, ms + 80)
    return () => { cancelAnimationFrame(id); window.clearTimeout(fim) }
  }, [alvo, ms])
  return v
}

export function Mostrador({ rotulo, valor, formato, parte, tom, grande = false, sufixo }: {
  rotulo: string; valor: number; formato: (x: number) => string; parte?: number; tom?: 'cai' | 'sobe'; grande?: boolean; sufixo?: ReactNode
}) {
  const v = useCorrendo(valor)
  return (
    <div className={`cal-mostrador ${grande ? 'grande' : ''}`}>
      <small>{rotulo}</small>
      <strong className={tom ?? ''}>{formato(v)}{sufixo}</strong>
      {parte !== undefined && <i className="cal-barra" aria-hidden="true"><b style={{ width: `${Math.max(2, Math.min(100, parte * 100))}%` }} /></i>}
    </div>
  )
}

/** Meio relógio: quanto do saldo a sessão exige no pior momento. */
export function Medidor({ parte, exigido, saldo }: { parte: number; exigido: number; saldo: number }) {
  const p = useCorrendo(Math.min(1, Math.max(0, parte)))
  const C = Math.PI * 78
  return (
    <div className="cal-medidor" role="img" aria-label={`A sessão exige ${Math.round(parte * 100)}% do saldo`}>
      <svg viewBox="0 0 200 118" aria-hidden="true">
        <path d="M 22 100 A 78 78 0 0 1 178 100" className="fundo" />
        <path d="M 22 100 A 78 78 0 0 1 178 100" className="cheio" style={{ strokeDasharray: `${C * p} ${C}` }} />
        {[0.25, 0.5, 0.75].map((t) => {
          const a = Math.PI * (1 - t)
          return <line key={t} x1={100 + Math.cos(a) * 64} y1={100 - Math.sin(a) * 64} x2={100 + Math.cos(a) * 70} y2={100 - Math.sin(a) * 70} className="risco" />
        })}
        <g style={{ transform: `rotate(${-90 + 180 * p}deg)`, transformOrigin: '100px 100px' }}>
          <line x1="100" y1="100" x2="100" y2="34" className="agulha" />
        </g>
        <circle cx="100" cy="100" r="7" className="eixo" />
      </svg>
      <div className="cal-medidor-texto">
        <strong>{Math.round(p * 100)}%</strong>
        <small>do saldo exigido</small>
        <em>{usd(exigido)} de {usd(saldo)}</em>
      </div>
    </div>
  )
}

/** A curva do resultado, com a maior sequência marcada. */
export function Curva({ c, alta = 64 }: { c: Cenario; alta?: number }) {
  const ops = c.previa.corrida.ops
  const W = 600, H = alta
  const ys = [0, ...ops.map((o) => o.resultado)]
  const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys)
  const y = (v: number) => H - 5 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 10)
  const x = (i: number) => (i / Math.max(1, ys.length - 1)) * W
  const pontos = ys.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const d = c.previa.maiorSequencia.desde, n = c.previa.maiorSequencia.n
  const trecho = ys.slice(d, d + n + 1).map((v, i) => `${x(d + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className={`asi-curva ${c.resultado < 0 ? 'cai' : 'sobe'}`} style={{ height: alta }} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="zero" />
      <polyline points={pontos} className="linha" />
      {n > 0 && <polyline points={trecho} className="seq" />}
    </svg>
  )
}

/** A escada da maior sequência: uma barra por perda e, em verde, a entrada que recuperou. */
export function EscadaDaSequencia({ c, base, topo }: { c: Cenario; base: number; topo: number }) {
  // em escala de proporção: cada degrau da escada cresce o mesmo tanto na tela
  const alturaDe = (v: number) => 8 + 96 * (topo > base * 1.01 ? Math.min(1, Math.log(Math.max(v, base) / base) / Math.log(topo / base)) : 0.5)
  const mostrarValor = (i: number) => c.escada.length <= 9 || i >= c.escada.length - 3 || i === 0
  return (
    <div className="cal-escada-caixa">
      <div className="cal-escada-topo">
        <b>A escada da maior sequência</b>
        <small>{c.entradaQueRecuperou ? `${c.maiorSequencia} ${c.maiorSequencia === 1 ? 'perda' : 'perdas'} e a entrada que recupera` : `${c.maiorSequencia} perdas até o stop`}</small>
      </div>
      <div className="cal-escada" role="img" aria-label={`Entradas da maior sequência: ${c.escada.map(usd).join(', ')}`}>
        {c.escada.map((v, i) => {
          const fecha = !!c.entradaQueRecuperou && i === c.escada.length - 1
          return (
            <div key={i} className={`cal-degrau ${fecha ? 'fecha' : ''}`} title={`${fecha ? 'Recuperou com' : `Perda ${i + 1}`}: ${usd(v)}`}>
              {mostrarValor(i) && <em>{v >= 1000 ? `${(v / 1000).toFixed(1).replace('.', ',')} mil` : v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 100 ? 0 : 2 })}</em>}
              <i style={{ height: `${alturaDe(v).toFixed(1)}px` }} />
              <small>{fecha ? '✓' : i + 1}</small>
            </div>
          )
        })}
      </div>
    </div>
  )
}
