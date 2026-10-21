import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { liberarPouso, terminarVoo, useVoo, type Voo } from '../../core/decolagem'
import { tocarSom } from '../../core/som'
import { Monograma } from '../marca/Monograma'
import { Aviao } from './Aviao'
import { RotaCarregando } from './Carregando'
import './decolagem.css'

/**
 * A decolagem (21/10/2026): o voo do login até o início. Três tempos:
 *
 *  1. Subida (1,6 s): o avião de ouro sai do botão "Entrar" e sobe na
 *     diagonal do monograma (32°), acelerando, deixando dois rastros finos
 *     (os motores). O Azul GF varre a tela atrás dele, na mesma diagonal.
 *  2. Cruzeiro: o céu fechado em Azul GF com o monograma, "Bem-vindo a
 *     bordo" e a rota do carregando. Dura o que a plataforma levar para
 *     abrir (no mínimo o bastante para ler).
 *  3. Pouso (0,75 s): o azul segue a diagonal e sai pelo outro lado,
 *     descobrindo o início.
 *
 * Tudo em transform e opacity (Web Animations), o que roda liso no iPhone.
 * Com "reduzir movimento" ligado não há voo: o azul aparece e some.
 */

/** Diagonal do monograma: o eixo do voo. */
const ANGULO = -32
const SUBIDA = 1600
/** Tempo mínimo até o céu abrir, para a chegada não piscar. */
const MINIMO = 2300
/** Se a plataforma demorar, o céu abre assim mesmo (ela tem o próprio carregando). */
const MAXIMO = 8000

/** Onde o avião está (em vmax, no eixo do voo) na fração `t` da subida: táxi curto e aceleração. */
const posicao = (t: number) => 4 * Math.min(t / 0.25, 1) + 171 * Math.pow(Math.max(0, (t - 0.25) / 0.75), 2.6)
const suave = (t: number) => t * t * (3 - 2 * t)

export function Decolagem() {
  const voo = useVoo()
  if (!voo) return null
  return createPortal(<EmVoo key={voo.id} voo={voo} />, document.body)
}

function EmVoo({ voo }: { voo: Voo }) {
  const ceu = useRef<HTMLElement>(null)
  const aviao = useRef<HTMLSpanElement>(null)
  const rastro = useRef<HTMLSpanElement>(null)
  const [fase, setFase] = useState<'subindo' | 'cruzeiro' | 'pousando'>('subindo')
  const comeco = useRef(performance.now())
  const subida = useRef<Animation[]>([])
  const reduzido = useRef(matchMedia('(prefers-reduced-motion: reduce)').matches)
  // sem o ponto do botão (ex.: entrou por outro caminho), sai de baixo, no centro
  const origem = voo.origem ?? { x: window.innerWidth / 2, y: window.innerHeight * 0.75 }
  const primeiroNome = voo.nome?.trim().split(/\s+/)[0] ?? ''

  useLayoutEffect(() => {
    tocarSom('decolagem')
    if (reduzido.current) {
      ceu.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'forwards' })
      const t = window.setTimeout(() => setFase('cruzeiro'), 250)
      return () => window.clearTimeout(t)
    }
    const n = 24
    const quadros = Array.from({ length: n + 1 }, (_, i) => i / n)
    const lista: (Animation | undefined)[] = []
    lista.push(aviao.current?.animate(quadros.map((t) => ({
      offset: t,
      transform: `translateX(${posicao(t)}vmax) scale(${1 + 0.6 * suave(Math.max(0, (t - 0.25) / 0.75))})`,
      opacity: Math.min(1, t / 0.08),
    })), { duration: SUBIDA, fill: 'forwards' }))
    // o azul começa fora da tela, atrás, e alcança o avião até a metade da subida; depois o segue
    lista.push(ceu.current?.animate(quadros.map((t) => {
      const atras = posicao(t) - 22
      return { offset: t, transform: `translateX(${-160 + (atras + 160) * suave(Math.min(1, t / 0.6))}vmax)` }
    }), { duration: SUBIDA, fill: 'forwards' }))
    lista.push(rastro.current?.animate(quadros.map((t) => ({
      offset: t,
      transform: `scaleX(${Math.max(0, posicao(t) - 2) / 200})`,
      opacity: t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15,
    })), { duration: SUBIDA, fill: 'forwards' }))
    subida.current = lista.filter((a): a is Animation => !!a)
    // Pelo relógio, não pelo fim da animação: com a aba em segundo plano os
    // quadros param, e o cruzeiro termina a subida à força (o azul cobre tudo).
    const t = window.setTimeout(() => { subida.current.forEach((a) => { try { a.finish() } catch { /* já acabou */ } }); setFase('cruzeiro') }, SUBIDA)
    return () => { window.clearTimeout(t); subida.current.forEach((a) => a.cancel()) }
  }, [])

  // o pouso: quando a plataforma estiver na tela e já deu tempo de ler
  useEffect(() => {
    if (fase !== 'cruzeiro') return
    const falta = Math.max(0, MINIMO - (performance.now() - comeco.current))
    const limite = window.setTimeout(() => { liberarPouso() }, Math.max(0, MAXIMO - (performance.now() - comeco.current)))
    if (!voo.pronto) return () => window.clearTimeout(limite)
    const t = window.setTimeout(() => setFase('pousando'), falta)
    return () => { window.clearTimeout(t); window.clearTimeout(limite) }
  }, [fase, voo.pronto])

  useEffect(() => {
    if (fase !== 'pousando') return
    const c = ceu.current
    if (!c) { terminarVoo(); return }
    const a = reduzido.current
      ? c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, delay: 150, fill: 'forwards' })
      : c.animate([{ transform: getComputedStyle(c).transform }, { transform: 'translateX(480vmax)' }],
        { duration: 760, delay: 180, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' })
    a.onfinish = () => terminarVoo()
    const seguro = window.setTimeout(() => terminarVoo(), 1600)
    return () => window.clearTimeout(seguro)
  }, [fase])

  return (
    <div className={`dg dg-${fase}`} aria-hidden="true">
      <div className="dg-eixo" style={{ left: origem.x, top: origem.y, transform: `rotate(${ANGULO}deg)` }}>
        <i className="dg-ceu" ref={ceu} />
        <span className="dg-rastro" ref={rastro}><i /><i /></span>
        <span className="dg-aviao" ref={aviao}><Aviao largura={46} /></span>
      </div>
      <div className="dg-chegada">
        <Monograma tamanho={84} className="dg-monograma" />
        <b>{primeiroNome ? `Bem-vindo a bordo, ${primeiroNome}` : 'Bem-vindo a bordo'}</b>
        <RotaCarregando />
        <span className="dg-legenda">Preparando sua cabine</span>
      </div>
    </div>
  )
}
