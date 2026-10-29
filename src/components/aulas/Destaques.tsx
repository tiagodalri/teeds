import { afiliadoDaDeriv, comunidadeDaVitrine } from '../../core/rotas'
import { useEffect, useRef, useState } from 'react'
import { DerivLogo } from '../DerivMarca'
import { Monograma } from '../marca/Monograma'
import { MARCA } from '../../marca'
import { DERIV } from '../../core/deriv/config'
import './destaques.css'

/**
 * "Destaques" na página de Aulas (21/10/2026, pedido do Tiago): banners que
 * passam sozinhos chamando para a comunidade, abrir a conta e depositar na
 * Deriv, a sala de treino ao vivo e a apostila (quando houver o arquivo).
 *
 * Desenho do brandbook: Azul GF, a foto à direita entrando por um corte
 * diagonal no ângulo do monograma, o ouro só na ação. Sem neon, sem brilho.
 * 23/10/2026 ("mais impressionantes e chamativos"): foto maior com um
 * aproximar lento, título grande, três selinhos com o porquê, o monograma
 * enorme tom sobre tom e o texto entrando em cascata a cada troca.
 * Passa a cada 7 s; para quando o mouse ou o dedo está em cima, quando a aba
 * está escondida e para quem pede menos movimento. No celular, arrasta.
 */

export interface Banner {
  id: string
  selo: string
  titulo: string
  texto: string
  acao: string
  imagem: string
  posicao?: string
  /** Link externo (abre em outra aba) ou uma tela da plataforma. */
  href?: string
  tela?: string
  marca?: 'deriv' | 'whatsapp' | 'gf'
  aoVivo?: boolean
  /** Três pontos curtos que resumem o porquê (aparecem como selinhos). */
  pontos?: string[]
}

const CAIXA_DERIV = DERIV.deposito
const BASE = import.meta.env.BASE_URL

export function bannersDaMarca({ treino, noAr }: { treino: boolean; noAr: boolean }): Banner[] {
  const l: Banner[] = []
  if (treino) l.push({
    id: 'ao-vivo', selo: noAr ? 'Ao vivo agora' : 'Sala de treino', aoVivo: noAr, marca: 'gf',
    titulo: noAr ? 'A sala de treino está no ar' : 'Fique atento às próximas transmissões',
    texto: noAr ? 'A equipe está operando ao vivo agora. Entre para acompanhar cada decisão em tempo real.' : 'Quando a equipe abrir uma sala ao vivo, você recebe o aviso na hora. Opere junto e tire dúvidas no chat.',
    pontos: noAr ? ['Equipe operando agora', 'Cada decisão explicada', 'Chat aberto'] : ['Aviso na hora', 'Opere junto com a equipe', 'Dúvidas no chat'],
    acao: noAr ? 'Entrar na sala' : 'Conhecer a sala', tela: 'aovivo', imagem: `${BASE}login-globalfly/nuvens.webp`, posicao: 'center 45%',
  })
  if (MARCA.comunidade) l.push({
    id: 'comunidade', selo: 'Comunidade oficial', marca: 'whatsapp',
    titulo: `Entre na comunidade ${MARCA.prosa}`,
    texto: 'Avisos da equipe, novidades da plataforma e a agenda das transmissões, direto no seu WhatsApp.',
    pontos: ['Avisos da equipe', 'Agenda das transmissões', 'Novidades primeiro'],
    acao: 'Entrar na comunidade', href: comunidadeDaVitrine()!, imagem: `${BASE}fundos-globalfly/monograma-gf.jpg`, posicao: '80% center',
  })
  if (afiliadoDaDeriv()) l.push({
    id: 'conta', selo: 'Corretora oficial', marca: 'deriv',
    titulo: 'Abra a sua conta na Deriv',
    texto: 'É gratuito e leva poucos minutos. As operações acontecem na sua conta, e o dinheiro fica sempre com você.',
    pontos: ['Gratuito', 'Poucos minutos', 'O dinheiro fica com você'],
    acao: 'Abrir minha conta', href: afiliadoDaDeriv(), imagem: `${BASE}aulas-globalfly/conta-deriv.webp`, posicao: 'center 35%',
  })
  l.push({
    id: 'deposito', selo: 'Depósito', marca: 'deriv',
    titulo: 'Faça o seu depósito na Deriv',
    texto: 'Pela área Caixa (Cashier) da sua conta. Assim que o valor cair, o saldo aparece aqui na plataforma.',
    pontos: ['Pela área Caixa', 'Em dólar (USD)', 'O saldo aparece aqui'],
    acao: 'Depositar na Deriv', href: CAIXA_DERIV, imagem: `${BASE}aulas-globalfly/deriv-confiavel.webp`, posicao: 'center 30%',
  })
  if (MARCA.apostila) l.push({
    id: 'apostila', selo: 'Material de apoio', marca: 'gf',
    titulo: 'Baixe a sua apostila',
    texto: 'O passo a passo da plataforma num só arquivo, para consultar quando quiser.',
    pontos: ['Passo a passo', 'Tudo num arquivo', 'Consulte quando quiser'],
    acao: 'Baixar a apostila', href: MARCA.apostila, imagem: `${BASE}aulas-globalfly/documentos.webp`,
  })
  return l
}

const Seta = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
const WhatsApp = () => (
  <svg className="dq-whatsapp" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.2a9.8 9.8 0 00-8.4 14.8L2.2 21.8l4.9-1.3A9.8 9.8 0 1012 2.2zm0 17.8a8 8 0 01-4.1-1.1l-.3-.2-2.9.8.8-2.8-.2-.3A8 8 0 1112 20zm4.4-6c-.2-.1-1.4-.7-1.7-.8-.2-.1-.4-.1-.5.1l-.8.9c-.1.2-.3.2-.5.1a6.6 6.6 0 01-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5a.9.9 0 00-.6.3 2.7 2.7 0 00-.9 2 4.7 4.7 0 001 2.5 10.8 10.8 0 004.1 3.6c1.5.7 2.1.7 2.9.6a2.4 2.4 0 001.6-1.1 2 2 0 00.1-1.1c0-.1-.2-.2-.4-.3z" />
  </svg>
)

export function Destaques({ banners, aoIr }: { banners: Banner[]; aoIr?: (tela: string) => void }) {
  const trilho = useRef<HTMLDivElement>(null)
  const [atual, setAtual] = useState(0)
  const [parado, setParado] = useState(false)

  // qual está na tela (o arrasto do dedo também conta)
  useEffect(() => {
    const el = trilho.current
    if (!el) return
    const aoRolar = () => setAtual(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener('scroll', aoRolar, { passive: true })
    return () => el.removeEventListener('scroll', aoRolar)
  }, [])

  const ir = (i: number) => {
    const el = trilho.current
    if (!el) return
    const n = (i + banners.length) % banners.length
    el.scrollTo({ left: n * el.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  // passa sozinho a cada 7 s
  useEffect(() => {
    if (parado || banners.length < 2 || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => { if (!document.hidden) ir(atual + 1) }, 7000)
    return () => window.clearInterval(t)
  }, [atual, parado, banners.length]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!banners.length) return null
  const abrir = (b: Banner) => (b.href ? window.open(b.href, '_blank', 'noopener') : b.tela && aoIr?.(b.tela))

  return (
    <section className="dq" aria-roledescription="carrossel" aria-label="Destaques"
      onMouseEnter={() => setParado(true)} onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)} onBlur={() => setParado(false)} onTouchStart={() => setParado(true)}>
      <header className="dq-topo">
        <h2><Monograma tamanho={22} />Destaques</h2>
        {banners.length > 1 && (
          <div className="dq-setas">
            <button type="button" onClick={() => ir(atual - 1)} aria-label="Destaque anterior"><Seta d="M15 6l-6 6 6 6" /></button>
            <button type="button" onClick={() => ir(atual + 1)} aria-label="Próximo destaque"><Seta d="M9 6l6 6-6 6" /></button>
          </div>
        )}
      </header>

      <div className="dq-trilho" ref={trilho}>
        {banners.map((b, i) => (
          <article key={b.id} className={`dq-banner ${b.marca ?? ''} ${b.aoVivo ? 'ao-vivo' : ''} ${i === atual ? 'on' : ''}`} aria-roledescription="destaque" aria-label={`${i + 1} de ${banners.length}: ${b.titulo}`}>
            <div className="dq-foto" aria-hidden="true">
              <img src={b.imagem} alt="" loading={i === 0 ? 'eager' : 'lazy'} style={{ objectPosition: b.posicao ?? 'center' }} />
            </div>
            {/* o monograma enorme, tom sobre tom, atrás do texto */}
            <span className="dq-marca-dagua" aria-hidden="true"><Monograma tamanho={420} /></span>
            {/* o fio de ouro exatamente na borda do corte da foto */}
            <svg className="dq-eixo" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><line x1="24" y1="0" x2="0" y2="100" /></svg>
            <div className="dq-texto">
              <span className="dq-selo">
                {b.marca === 'whatsapp' ? <WhatsApp /> : b.marca === 'deriv' ? null : b.aoVivo ? <i className="dq-ponto" /> : <Monograma tamanho={16} />}
                {b.marca === 'deriv' && <DerivLogo altura={11} />}
                {b.selo}
              </span>
              <h3>{b.titulo}</h3>
              <p>{b.texto}</p>
              {b.pontos && (
                <ul className="dq-chaves">
                  {b.pontos.map((t) => <li key={t}><Seta d="M5 12.5l4.2 4.2L19 7" />{t}</li>)}
                </ul>
              )}
              <button type="button" className="dq-acao" onClick={() => abrir(b)}>
                {b.acao}<Seta d={b.href ? 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5' : 'M9 6l6 6-6 6'} />
              </button>
            </div>
          </article>
        ))}
      </div>

      {banners.length > 1 && (
        <div className="dq-pontos" role="tablist" aria-label="Escolher destaque">
          {banners.map((b, i) => (
            <button key={b.id} type="button" role="tab" aria-selected={i === atual} aria-label={b.titulo} className={i === atual ? 'on' : ''} onClick={() => ir(i)}>
              {i === atual && !parado && <i key={atual} />}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
