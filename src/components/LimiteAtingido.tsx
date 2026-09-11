import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import type { ConfigEstrategia, EstadoMotor } from '../core/deriv/engine'
import { MARCA } from '../marca'
import './limite-atingido.css'

/*
  O aviso de meta e de stop.

  O robô para sozinho quando bate a meta ou o limite de perda — e isso
  acontecia em silêncio: a cabine trocava "procurando entrada" por "robô
  parado" e só. Quem estava em outra tela nem ficava sabendo. Agora a parada
  por limite vira um momento: um cartão no meio da tela, com o resultado, a
  curva da sessão e o que fazer em seguida.
*/

export type TipoDeLimite = 'meta' | 'stop'

/** Lê o motivo que o motor escreve ao desligar. Só meta e stop viram aviso. */
export function tipoDeLimite(motivo: string | null | undefined): TipoDeLimite | null {
  if (!motivo) return null
  if (/meta de lucro/i.test(motivo)) return 'meta'
  if (/limite de perda/i.test(motivo)) return 'stop'
  return null
}

// Cada sessão avisa uma vez só — inclusive a que bateu o limite enquanto a
// pessoa estava fora: ela vê o aviso quando volta, e nunca mais.
const CHAVE = `${MARCA.id}.limites.avisados`
function avisados(): string[] {
  try { const v = JSON.parse(localStorage.getItem(CHAVE) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
export function limiteJaAvisado(sessaoId: string) { return avisados().includes(sessaoId) }
export function marcarLimiteAvisado(sessaoId: string) {
  try { localStorage.setItem(CHAVE, JSON.stringify([sessaoId, ...avisados().filter((id) => id !== sessaoId)].slice(0, 60))) } catch { /* preferência opcional */ }
}

interface Props {
  tipo: TipoDeLimite
  estado: EstadoMotor
  config: ConfigEstrategia
  nome: string
  cor: string
  moeda: string
  demo?: boolean | null
  onFechar: () => void
  onLigarDeNovo?: () => void
}

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function duracao(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}
const semMovimento = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** O número sobe até o resultado, em vez de aparecer pronto. */
function useContagem(alvo: number, ms = 1100) {
  const [valor, setValor] = useState(semMovimento() ? alvo : 0)
  useEffect(() => {
    if (semMovimento()) { setValor(alvo); return }
    let quadro = 0
    const inicio = performance.now()
    const passo = (agora: number) => {
      const p = Math.min(1, (agora - inicio) / ms)
      setValor(alvo * (1 - Math.pow(1 - p, 3)))
      if (p < 1) quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [alvo, ms])
  return valor
}

/** A curva da sessão, do zero ao fim, com a linha do zero marcada. */
function Curva({ pontos }: { pontos: number[] }) {
  const serie = [0, ...pontos]
  const L = 320, A = 72, m = 6
  const min = Math.min(0, ...serie), max = Math.max(0, ...serie)
  const faixa = max - min || 1
  const x = (i: number) => (serie.length === 1 ? L : (i / (serie.length - 1)) * L)
  const y = (v: number) => m + (1 - (v - min) / faixa) * (A - 2 * m)
  const linha = serie.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${linha} L${L},${y(min).toFixed(1)} L0,${y(min).toFixed(1)} Z`
  const fim = serie[serie.length - 1]
  // A curva estica na largura do cartão; o ponto final fica fora do SVG para
  // continuar redondo.
  return (
    <div className="limite-curva" aria-hidden>
      <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="limite-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity=".32" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={L} y1={y(0)} y2={y(0)} className="zero" />
        <path d={area} fill="url(#limite-area)" />
        <path d={linha} className="traco" />
      </svg>
      <i style={{ top: `${(y(fim) / A) * 100}%` }} />
    </div>
  )
}

// Confete só na meta: posições fixas, para o desenho não mudar a cada render.
const CONFETES = Array.from({ length: 26 }, (_, i) => {
  const angulo = (i / 26) * Math.PI * 2 + (i % 4) * 0.13
  const distancia = 110 + ((i * 37) % 80)
  return {
    x: Math.round(Math.cos(angulo) * distancia), y: Math.round(Math.sin(angulo) * distancia * 0.8 - 40),
    giro: (i * 67) % 360, atraso: (i % 6) * 35, tom: i % 3, largura: 5 + (i % 3) * 2,
  }
})

export function LimiteAtingido({ tipo, estado, config, nome, cor, moeda, demo, onFechar, onLigarDeNovo }: Props) {
  const meta = tipo === 'meta'
  const valor = useContagem(estado.resultado)
  const principal = useRef<HTMLButtonElement>(null)
  const fechar = useRef(onFechar)
  fechar.current = onFechar

  useEffect(() => {
    principal.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar.current() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  // Aba em segundo plano: o título avisa até a pessoa voltar.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.hidden) return
    const original = document.title
    document.title = `${meta ? '● Meta batida' : '● Stop atingido'} — ${original}`
    const voltou = () => { if (!document.hidden) document.title = original }
    document.addEventListener('visibilitychange', voltou)
    return () => { document.removeEventListener('visibilitychange', voltou); document.title = original }
  }, [meta])

  const dados = useMemo(() => {
    const h = estado.historico
    return {
      acerto: estado.operacoes ? Math.round((estado.vitorias / estado.operacoes) * 100) : 0,
      maior: h.reduce((m, o) => Math.max(m, o.valor), 0),
      tempo: h.length > 1 ? duracao(h[0].quando - h[h.length - 1].quando) : '—',
    }
  }, [estado])

  // Onde o resultado caiu entre o stop e a meta.
  const stop = Math.max(0.01, config.stopLoss || Math.abs(Math.min(0, estado.resultado)) || 1)
  const alvo = Math.max(0.01, config.takeProfit || Math.max(0, estado.resultado) || 1)
  const zero = (stop / (stop + alvo)) * 100
  const ponto = Math.min(100, Math.max(0, ((estado.resultado + stop) / (stop + alvo)) * 100))

  const conteudo = (
    <div className="limite-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <section role="dialog" aria-modal="true" aria-labelledby="limite-titulo" aria-describedby="limite-frase"
        className={`limite ${tipo}`} style={{ '--robo': cor } as CSSProperties}>
        <div className="limite-brilho" aria-hidden />
        {meta && <div className="limite-confetes" aria-hidden>
          {CONFETES.map((c, i) => <i key={i} className={`t${c.tom}`} style={{
            '--x': `${c.x}px`, '--y': `${c.y}px`, '--giro': `${c.giro}deg`, '--atraso': `${c.atraso}ms`, width: c.largura,
          } as CSSProperties} />)}
        </div>}

        <button type="button" className="limite-x" onClick={onFechar} aria-label="Fechar aviso">×</button>

        <div className="limite-selo" aria-hidden>
          <svg viewBox="0 0 88 88">
            <circle cx="44" cy="44" r="38" className="trilha" />
            <circle cx="44" cy="44" r="38" className="anel" pathLength={1} />
            {meta
              ? <path className="icone" d="M29 45l10 10 21-23" pathLength={1} />
              : <path className="icone" d="M44 24l17 6v13c0 12-7 20-17 24-10-4-17-12-17-24V30zM36 45l6 6 11-12" pathLength={1} />}
          </svg>
        </div>

        <span className="limite-rotulo">{meta ? 'Meta batida' : 'Stop atingido'} · robô pausado</span>
        <h2 id="limite-titulo">{meta ? 'Missão cumprida.' : 'O stop protegeu sua banca.'}</h2>
        <p id="limite-frase" className="limite-frase">
          {meta
            ? <>O <b>{nome}</b> chegou na meta de <b>{moeda} {num(config.takeProfit)}</b> e parou sozinho, como combinado.</>
            : <>O <b>{nome}</b> chegou no limite de perda de <b>{moeda} {num(config.stopLoss)}</b> e parou sozinho — ele não passa desse valor.</>}
        </p>

        <div className="limite-resultado">
          <small>Resultado da sessão</small>
          <strong className={estado.resultado >= 0 ? 'up' : 'down'}>{valor >= 0 ? '+' : '−'}{num(Math.abs(valor))}<em>{moeda}</em></strong>
          {demo != null && <span className={`limite-conta ${demo ? 'demo' : 'real'}`}>{demo ? 'Conta demo' : 'Conta real'}</span>}
        </div>

        <Curva pontos={estado.curva} />

        <div className="limite-trilho" aria-label={`Resultado entre o stop de ${num(stop)} e a meta de ${num(alvo)}`}>
          <div className="barra">
            <u style={{ left: `${zero}%` }} />
            <b style={{ left: `${Math.min(zero, ponto)}%`, width: `${Math.abs(ponto - zero)}%` }} />
            <i style={{ left: `${ponto}%` }} />
          </div>
          <div className="marcas"><span className="down">−{num(stop)}</span><span>0</span><span className="up">+{num(alvo)}</span></div>
        </div>

        <dl className="limite-dados">
          <div><dt>Operações</dt><dd>{estado.operacoes}</dd></div>
          <div><dt>Acertos</dt><dd>{estado.vitorias}<small> · {dados.acerto}%</small></dd></div>
          <div><dt>Maior entrada</dt><dd>{num(dados.maior)}</dd></div>
          <div><dt>Duração</dt><dd>{dados.tempo}</dd></div>
        </dl>

        <p className="limite-conselho">
          {meta
            ? 'Parar no alvo é o que separa quem ganha de quem devolve. O resultado já está no seu saldo.'
            : 'Perder o combinado faz parte do plano. Evite religar no calor do momento: revise a entrada e o stop no Gerenciamento antes da próxima sessão.'}
        </p>

        <div className="limite-acoes">
          {onLigarDeNovo && <button type="button" className="secundario" onClick={onLigarDeNovo}>Ligar de novo</button>}
          <button type="button" className="primario" ref={principal} onClick={onFechar}>{meta ? 'Fechar e comemorar' : 'Entendi'}</button>
        </div>
      </section>
    </div>
  )
  return typeof document === 'undefined' ? conteudo : createPortal(conteudo, document.body)
}
