/**
 * O termômetro do risco (13/11/2026, Tiago: "quero um termômetro para arrastar a bolinha e definir qual
 * o nível de conservador ou agressivo; conforme eu for movendo, o prejuízo acumulado, as maiores
 * entradas etc. vão se adaptando, até chegar no ponto que eu ache ideal. Sensação de calibrar
 * milimetricamente. Gamifique").
 *
 * Cada marca do termômetro é uma sessão inteira que fecha o pedido (core/teeds/cenariosDaSessao.ts), da
 * menor sequência de perdas que fecha até a maior que o saldo aguenta. Arrastar troca de sessão: os
 * mostradores correm até os números novos, a escada da maior sequência cresce degrau a degrau, o
 * medidor mostra quanto do saldo a sessão exige e a curva se redesenha. Sem som (os sons da plataforma
 * são só do play, da meta e do stop).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import type { Cenario, NivelDeRisco, Pedido } from '../../core/teeds/cenariosDaSessao'
import type { Momento } from '../../core/teeds/sessaoSimulada'

export interface Ponto { nivel: NivelDeRisco; cenario: Cenario }

const usd = (x: number) => dinheiro(x, 'USD')
const duracao = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')} min` : ''}`)
const relogio = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
const ZONAS = ['Zona tranquila', 'Zona equilibrada', 'Zona intensa', 'Zona de risco'] as const
const BOLA = 40

/** A cor do nível: do verde ao vermelho, passando pelo ouro e pelo laranja. */
const corDoNivel = (f: number) => `hsl(${Math.round(142 - 142 * Math.min(1, Math.max(0, f)))} 72% ${f < 0.5 ? 42 : 48}%)`

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
function useCorrendo(alvo: number, ms = 280): number {
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

function Mostrador({ rotulo, valor, formato, parte, tom, grande = false, sufixo }: {
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
function Medidor({ parte, exigido, saldo }: { parte: number; exigido: number; saldo: number }) {
  const p = useCorrendo(Math.min(1, Math.max(0, parte)))
  const R = 78, C = Math.PI * R
  const angulo = -90 + 180 * p
  return (
    <div className="cal-medidor" role="img" aria-label={`A sessão exige ${Math.round(parte * 100)}% do saldo`}>
      <svg viewBox="0 0 200 118" aria-hidden="true">
        <path d="M 22 100 A 78 78 0 0 1 178 100" className="fundo" pathLength={C} />
        <path d="M 22 100 A 78 78 0 0 1 178 100" className="cheio" style={{ strokeDasharray: `${C * p} ${C}` }} />
        {[0.25, 0.5, 0.75].map((t) => {
          const a = Math.PI * (1 - t)
          return <line key={t} x1={100 + Math.cos(a) * 64} y1={100 - Math.sin(a) * 64} x2={100 + Math.cos(a) * 70} y2={100 - Math.sin(a) * 70} className="risco" />
        })}
        <g style={{ transform: `rotate(${angulo}deg)`, transformOrigin: '100px 100px' }}>
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

export function CalibradorDaSessao({ pedido, pontos, calculando, feitos, total, escolhido, aoEscolher, previaAberta, aoAlternarPrevia, aoUsar, aoMudarMomento, children }: {
  pedido: Pedido
  pontos: Ponto[]
  calculando: boolean
  feitos: number
  total: number
  escolhido: number | null
  aoEscolher: (chave: number) => void
  previaAberta: boolean
  aoAlternarPrevia: () => void
  aoUsar: (c: Cenario) => void
  /** No lucro: quando vem a maior sequência de perdas. */
  aoMudarMomento?: (m: Momento) => void
  /** Em tela estreita, a prévia aberta entra aqui, antes da barra do play (na larga ela fica ao lado). */
  children?: ReactNode
}) {
  const n = pontos.length
  const achado = pontos.findIndex((p) => p.nivel.chave === escolhido)
  const idx = achado >= 0 ? achado : Math.floor((n - 1) / 2)
  const [arrasto, setArrasto] = useState<number | null>(null)
  const pos = arrasto ?? idx
  const f = n > 1 ? pos / (n - 1) : 0.5
  const fNivel = n > 1 ? idx / (n - 1) : 0.5
  const cor = corDoNivel(fNivel)
  const c = pontos[idx].cenario
  const zona = n === 1 ? 'O nível que fecha' : ZONAS[Math.min(3, Math.max(0, Math.ceil(fNivel * 4) - 1))]

  // as escalas das barras: o maior valor entre todos os níveis prontos
  const topo = useMemo(() => ({
    entrada: Math.max(...pontos.map((p) => p.cenario.maiorEntrada)),
    perdido: Math.max(...pontos.map((p) => p.cenario.perdidoNaSequencia)),
    pior: Math.max(0.01, ...pontos.map((p) => Math.abs(p.cenario.piorMomento))),
  }), [pontos])

  const escolher = (i: number) => {
    const alvo = pontos[Math.min(n - 1, Math.max(0, i))]
    if (!alvo || alvo.nivel.chave === pontos[idx].nivel.chave) return
    aoEscolher(alvo.nivel.chave)
    try { navigator.vibrate?.(8) } catch { /* sem vibração neste aparelho */ }
  }

  // o pulso do painel a cada troca de nível
  const [pulso, setPulso] = useState(0)
  const chaveAtual = pontos[idx].nivel.chave
  useEffect(() => { setPulso((x) => x + 1) }, [chaveAtual])

  const exigido = c.saldoMinimo
  const base = Math.max(0.35, pedido.entrada)
  /** A altura do degrau (px), em escala de proporção: cada degrau da escada cresce o mesmo tanto na tela. */
  const alturaDe = (v: number) => 8 + 96 * (topo.entrada > base * 1.01 ? Math.log(Math.max(v, base) / base) / Math.log(topo.entrada / base) : 0.5)
  const mostrarValor = (i: number) => c.escada.length <= 9 || i >= c.escada.length - 3 || i === 0

  return (
    <section className="cal" style={{ ['--cor' as string]: cor, ['--f' as string]: f } as CSSProperties} aria-label="Termômetro do risco">
      <header className="cal-topo">
        <div>
          <b>Calibre o risco da sessão</b>
          <small>Arraste a bolinha: cada marca é uma sessão inteira que fecha o seu pedido.</small>
        </div>
        <div className="cal-nivel" key={pulso}>
          <span>{zona}</span>
          <em>Nível {idx + 1} de {n}</em>
        </div>
      </header>

      <div className="cal-termo">
        <div className="cal-pista">
          <div className="cal-trilho"><i /></div>
          <div className="cal-marcas" aria-hidden="true">
            {pontos.map((p, i) => <i key={p.nivel.chave} className={`${p.nivel.ordem ? 'sub' : ''} ${i === idx ? 'on' : ''}`} style={{ left: n > 1 ? `${(i / (n - 1)) * 100}%` : '50%' }} />)}
          </div>
          <output className="cal-balao" style={{ left: `calc(${f * 100}% + ${(0.5 - f) * BOLA}px)` }}>
            <b>{c.maiorSequencia}</b> {c.maiorSequencia === 1 ? 'perda' : 'perdas'}
            <small>maior entrada {usd(c.maiorEntrada)}</small>
          </output>
          <input type="range" className="cal-range" min={0} max={Math.max(1, n - 1)} step={0.01} value={n > 1 ? pos : 0.5} disabled={n < 2}
            aria-label="Nível de risco" aria-valuetext={`${zona}: ${c.maiorSequencia} perdas seguidas, maior entrada ${usd(c.maiorEntrada)}`}
            onChange={(e) => { const v = Number(e.target.value); setArrasto(v); escolher(Math.round(v)) }}
            onPointerUp={() => setArrasto(null)} onTouchEnd={() => setArrasto(null)} onBlur={() => setArrasto(null)} onMouseUp={() => setArrasto(null)}
            onKeyDown={(e) => {
              const passo = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'Home' ? -99 : e.key === 'End' ? 99 : 0
              if (!passo) return
              e.preventDefault(); setArrasto(null); escolher(idx + passo)
            }} />
        </div>
        <div className="cal-pontas" aria-hidden="true"><span>Mais tranquilo</span><span>Equilibrado</span><span>Mais intenso</span><span>Mais arriscado</span></div>
        {aoMudarMomento && pedido.resultado > 0 && (
          <div className="cal-momento">
            <span>A maior sequência vem</span>
            <div className="est-seg" role="radiogroup" aria-label="Quando vem a maior sequência">
              {([['comeco', 'No começo'], ['meio', 'No meio'], ['fim', 'Perto do fim']] as const).map(([m, nome]) => (
                <button key={m} type="button" role="radio" aria-checked={pedido.momento === m} className={pedido.momento === m ? 'on' : ''} onClick={() => aoMudarMomento(m)}><b>{nome}</b></button>
              ))}
            </div>
          </div>
        )}
        {calculando && (
          <div className="cal-progresso" role="status">
            <i><b style={{ width: `${total ? (feitos / total) * 100 : 0}%` }} /></i>
            <span>Calibrando os níveis… {feitos} de {total}</span>
          </div>
        )}
      </div>

      <div className="cal-painel">
        <Medidor parte={pedido.saldo > 0 ? exigido / pedido.saldo : 0} exigido={exigido} saldo={pedido.saldo} />
        <div className="cal-mostradores">
          <Mostrador grande rotulo="Maior sequência de perdas" valor={c.maiorSequencia} formato={(x) => String(Math.round(x))} sufixo={<em> {c.maiorSequencia === 1 ? 'perda seguida' : 'perdas seguidas'}</em>} />
          <Mostrador rotulo="Prejuízo acumulado na sequência" valor={c.perdidoNaSequencia} formato={usd} tom="cai" parte={c.perdidoNaSequencia / topo.perdido} />
          <Mostrador rotulo="Maior entrada" valor={c.maiorEntrada} formato={usd} parte={c.maiorEntrada / topo.entrada} />
          <Mostrador rotulo="Pior momento da sessão" valor={c.piorMomento} formato={(x) => dinheiroComSinal(x, 'USD')} tom={c.piorMomento < 0 ? 'cai' : undefined} parte={Math.abs(c.piorMomento) / topo.pior} />
        </div>
      </div>

      <div className="cal-escada-caixa">
        <div className="cal-escada-topo">
          <b>A escada da maior sequência</b>
          <small>{c.entradaQueRecuperou ? `${c.maiorSequencia} perdas e a entrada que recupera` : `${c.maiorSequencia} perdas até o stop`}</small>
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

      <div className="cal-sessao">
        <div className="cal-placar">
          <div><small>Resultado</small><strong className={c.resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(c.resultado, 'USD')}</strong></div>
          <div><small>Duração</small><strong>{relogio(c.tempo.segundos)}</strong></div>
          <div><small>Operações</small><strong>{c.operacoes}</strong></div>
          <div><small>Acerto</small><strong>{c.acerto}%</strong></div>
          <div><small>Meta de ganho</small><strong>{usd(c.meta)}</strong></div>
          <div><small>Limite de perda</small><strong>{usd(c.stop)}</strong></div>
          <div><small>Saldo no fim</small><strong>{usd(c.saldoFinal)}</strong></div>
        </div>
        <Curva c={c} alta={86} />
        <p className="asi-historia">
          {historia(c, pedido.minutos)}
          {c.trabalhada && <small className="asi-montada">Sessão montada: o ritmo de perdas e ganhos foi trabalhado para fechar o pedido, dentro das regras da escada.</small>}
        </p>
      </div>

      {children}

      <div className="cal-acoes">
        <span><b style={{ color: cor }}>{zona}</b> · {c.maiorSequencia} {c.maiorSequencia === 1 ? 'perda' : 'perdas'} · maior entrada {usd(c.maiorEntrada)} · exige {usd(exigido)} de saldo</span>
        <button type="button" className="asi-ver cal-ver-previa" onClick={aoAlternarPrevia} aria-pressed={previaAberta}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          {previaAberta ? 'Fechar prévia' : 'Ver prévia'}
        </button>
        <button type="button" className="est-play" onClick={() => aoUsar(c)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>Dar o play com este
        </button>
      </div>
    </section>
  )
}
