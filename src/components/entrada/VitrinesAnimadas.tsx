/**
 * As telas animadas do cadastro com planos, refeitas em 11/11/2026 (Tiago, revisão do celular):
 *  - Sala ao vivo como uma call de verdade: a tela compartilhada, a câmera de quem apresenta e os
 *    comentários da turma ("adaptar para o Victor e para o Naor, cada um com a sua");
 *  - Operação manual legível: gráfico com eixo próprio (a linha nunca passa por cima dos números),
 *    linha de entrada, contagem do contrato e o resultado no fim;
 *  - A cabine das I.A. pensada para esta página (escura, sem a fita de 25 dígitos), com o que importa
 *    de uma sessão real: resultado, meta, curva, a operação em andamento e as últimas operações;
 *  - A apostila folheando (páginas sem conteúdo, só o movimento).
 * Os números da cabine são as sessões gravadas na plataforma (SESSOES). As cores ficam no CSS da casca.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { vitrine } from '../../core/teeds/parceiro'
import { NomeDoRobo } from '../NomeDoRobo'
import { SESSOES } from '../../casca/globalfly/cadastro/comoFunciona'

const calma = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const dinheiro = (v: number, sinal = false) => `${sinal ? (v < 0 ? '−' : '+') : ''}US$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Roda `passo` a cada `ms` só enquanto o elemento está na tela (e a aba aberta). */
function useNaTela<T extends HTMLElement>(ms: number, passo: () => void) {
  const ref = useRef<T>(null)
  const fn = useRef(passo); fn.current = passo
  useEffect(() => {
    const el = ref.current
    if (!el || calma()) return
    let t = 0, visivel = false
    const ligar = () => { if (!t && visivel && !document.hidden) t = window.setInterval(() => fn.current(), ms) }
    const desligar = () => { window.clearInterval(t); t = 0 }
    const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting; if (visivel) ligar(); else desligar() }, { threshold: 0.2 })
    io.observe(el)
    const aba = () => (document.hidden ? desligar() : ligar())
    document.addEventListener('visibilitychange', aba)
    return () => { io.disconnect(); desligar(); document.removeEventListener('visibilitychange', aba) }
  }, [ms])
  return ref
}

/* ------------------------------------------------------------------ sala ao vivo */
const TURMA = ['Carlos M.', 'Juliana R.', 'Pedro S.', 'Fernanda L.', 'Rafael T.', 'Amanda C.', 'Lucas B.', 'Patrícia O.']
function comentariosDo(parceiro: string): string[] {
  const apelido = parceiro === 'n' ? 'Naor' : 'Vitão'
  return [
    'Bati a meta aqui 🎯', `Top, ${apelido}! 🔥`, 'Entrei junto na Falcon', 'Agora entendi o gerenciamento',
    `${apelido} explicando é outro nível`, 'Primeira semana e já tô pegando o jeito', 'Fechei o dia no verde ✅', 'Que aula! 👏',
  ]
}
type Comentario = { id: number; nome: string; texto: string }

export function TelaAoVivo() {
  const parceiro = vitrine()
  const host = parceiro === 'n' ? { nome: 'Naor Bezerra', foto: 'naor-rosto.webp' } : { nome: 'Victor Cordeiro', foto: 'victor-rosto.webp' }
  const textos = useMemo(() => comentariosDo(parceiro), [parceiro])
  const [lista, setLista] = useState<Comentario[]>(() => [0, 1, 2].map((i) => ({ id: i, nome: TURMA[i], texto: textos[i] })))
  const n = useRef(3)
  const [velas, setVelas] = useState(() => gerarVelas(18, 7))
  const ref = useNaTela<HTMLDivElement>(1900, () => {
    const i = n.current++
    setLista((l) => [...l.slice(-2), { id: i, nome: TURMA[i % TURMA.length], texto: textos[i % textos.length] }])
    setVelas((v) => avancarVelas(v, i))
  })
  const b = import.meta.env.BASE_URL
  return (
    <div className="cpl-call" ref={ref} aria-hidden="true">
      <div className="cpl-call-topo"><span className="cpl-live-selo"><i />Ao vivo</span><span className="cpl-call-sala">Sala de operações GF</span></div>
      <div className="cpl-call-tela">
        <div className="cpl-call-app">
          <span className="cpl-call-app-ativo">Volatility 75 <b>39.074,82</b></span>
          <span className="cpl-call-app-ia">GF Falcon · <b>+US$ 12,40</b></span>
        </div>
        <Velas velas={velas} />
      </div>
      <ol className="cpl-call-chat">
        {lista.map((c) => <li key={c.id}><i>{c.nome.split(' ').map((p) => p[0]).join('')}</i><span><b>{c.nome}</b>{c.texto}</span></li>)}
      </ol>
      <figure className="cpl-call-cam">
        <img src={`${b}cadastro/img/${host.foto}`} alt="" width="200" height="200" loading="lazy" />
        <figcaption><i className="cpl-call-mic" />{host.nome}</figcaption>
      </figure>
    </div>
  )
}

type Vela = { a: number; f: number; max: number; min: number }
function gerarVelas(qtd: number, semente: number): Vela[] {
  const v: Vela[] = []; let p = 50
  for (let i = 0; i < qtd; i++) { const nova = proximaVela(p, semente + i); v.push(nova); p = nova.f }
  return v
}
function proximaVela(abertura: number, s: number): Vela {
  const r = (x: number) => { const y = Math.sin(x * 12.9898) * 43758.5453; return y - Math.floor(y) }
  const f = Math.min(88, Math.max(14, abertura + (r(s) - 0.42) * 22))
  return { a: abertura, f, max: Math.max(abertura, f) + r(s + 1) * 5, min: Math.min(abertura, f) - r(s + 2) * 5 }
}
const avancarVelas = (v: Vela[], i: number) => [...v.slice(1), proximaVela(v[v.length - 1].f, 31 + i)]
function Velas({ velas }: { velas: Vela[] }) {
  const w = 300, h = 120, larg = w / velas.length
  const Y = (x: number) => h - (x / 100) * h
  return (
    <svg className="cpl-velas" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {[0.25, 0.5, 0.75].map((g) => <line key={g} x1="0" x2={w} y1={h * g} y2={h * g} className="cpl-velas-grade" />)}
      {velas.map((c, i) => {
        const sobe = c.f >= c.a, x = i * larg + larg / 2
        return (
          <g key={i} className={sobe ? 'cpl-vela-sobe' : 'cpl-vela-desce'}>
            <line x1={x} x2={x} y1={Y(c.max)} y2={Y(c.min)} />
            <rect x={x - larg * 0.32} width={larg * 0.64} y={Y(Math.max(c.a, c.f))} height={Math.max(1.2, Math.abs(Y(c.a) - Y(c.f)))} rx="0.8" />
          </g>
        )
      })}
    </svg>
  )
}

/* ------------------------------------------------------------------ operação manual */
const PONTOS = 46
export function TelaManual() {
  // um contrato de 1 minuto: o preço anda, a entrada fica marcada, e no fim aparece o resultado
  const [seg, setSeg] = useState(0)
  const [precos, setPrecos] = useState<number[]>(() => { let v = 39074.2; return Array.from({ length: PONTOS }, (_, i) => (v = +(v + Math.sin(i * 12.9898) * 0.35).toFixed(2))) })
  const entrada = useRef(precos[PONTOS - 1])
  const ref = useNaTela<HTMLDivElement>(420, () => {
    setSeg((s) => {
      const n = (s + 1) % 34
      if (n === 0) entrada.current = precos[precos.length - 1]
      return n
    })
    setPrecos((p) => {
      const ult = p[p.length - 1], tend = seg < 24 ? 0.16 : 0.04
      // o preço anda aos trancos, como o índice: sobe e desce a cada leitura, com a tendência do contrato
      return [...p.slice(1), +(ult + (Math.random() - 0.47) * 0.55 + tend * 0.6).toFixed(2)]
    })
  })
  const fim = seg >= 26
  const restante = Math.max(0, 60 - Math.round(seg * (60 / 26)))
  const min = Math.min(...precos, entrada.current) - 0.4, max = Math.max(...precos, entrada.current) + 0.4
  const W = 240, H = 100
  const X = (i: number) => (i / (PONTOS - 1)) * W, Y = (v: number) => H - ((v - min) / (max - min)) * H
  const linha = precos.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')
  const atual = precos[PONTOS - 1]
  const ganhando = atual >= entrada.current
  return (
    <div className="cpl-manual" ref={ref} aria-hidden="true">
      <div className="cpl-manual-topo">
        <span><b>Volatility 75</b><em>{atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</em></span>
        <span className="cpl-manual-tempo">{fim ? 'Encerrado' : `00:${String(restante).padStart(2, '0')}`}</span>
      </div>
      <div className="cpl-manual-grafico">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
          {[0.2, 0.4, 0.6, 0.8].map((g) => <line key={g} x1="0" x2={W} y1={H * g} y2={H * g} className="cpl-manual-grade" />)}
          <line x1="0" x2={W} y1={Y(entrada.current)} y2={Y(entrada.current)} className="cpl-manual-entrada" />
          <path d={`${linha} L${W} ${H} L0 ${H} Z`} className="cpl-manual-area" />
          <path d={linha} className="cpl-manual-linha" />
          <circle cx={X(PONTOS - 1)} cy={Y(atual)} r="3.2" className="cpl-manual-ponto" />
        </svg>
        <div className="cpl-manual-eixo">
          <span style={{ top: `${(Y(entrada.current) / H) * 100}%` }} className="cpl-manual-tag-entrada">Entrada</span>
          <span style={{ top: `${(Y(atual) / H) * 100}%` }} className={`cpl-manual-tag-preco ${ganhando ? 'sobe' : 'desce'}`}>{atual.toLocaleString('pt-BR', { minimumFractionDigits: 2 }).slice(-6)}</span>
        </div>
      </div>
      <div className="cpl-manual-rodape">
        <span className="cpl-manual-valor"><small>Valor</small>US$ 100</span>
        <span className="cpl-manual-sobe ativo">▲ Sobe</span>
        <span className="cpl-manual-desce">▼ Desce</span>
      </div>
      <div className={`cpl-manual-res ${fim ? 'cpl-ver' : ''}`}><b>Ganhou</b>+US$ 78,32</div>
    </div>
  )
}

/* ------------------------------------------------------------------ a cabine das I.A. */
const ID_DO_ROBO: Record<string, string> = { falcon: 'falcon', phenom: 'ag2', legacy: 'legacy' }
const REGRA: Record<string, string> = { falcon: 'dígito menor que 6', phenom: 'dígito menor que 3', legacy: 'dígito maior que 3' }

export function CabineDaVitrine({ escolhida, aoTrocar }: { escolhida: number; aoTrocar: (i: number) => void }) {
  const s = SESSOES[escolhida] ?? SESSOES[0]
  const [k, setK] = useState(3)
  const [pausa, setPausa] = useState(0)
  useEffect(() => { setK(3); setPausa(0) }, [escolhida])
  const ref = useNaTela<HTMLDivElement>(1000, () => {
    if (k < s.ops.length) setK((x) => x + 1)
    else setPausa((p) => { if (p >= 4) { aoTrocar((escolhida + 1) % SESSOES.length); return 0 } return p + 1 })
  })
  const feitas = s.ops.slice(0, k)
  const curva = useMemo(() => { let a = 0; return [0, ...feitas.map((o) => (a = +(a + o[2]).toFixed(2)))] }, [feitas])
  const resultado = curva[curva.length - 1]
  const positivas = feitas.filter((o) => o[2] > 0).length
  const meta = s.meta
  const terminou = k >= s.ops.length
  const prox = terminou ? null : s.ops[k]
  const recuperando = !!prox && prox[0] > s.ops[0][0] + 0.001
  const pct = Math.max(0, Math.min(100, (resultado / meta) * 100))
  const b = import.meta.env.BASE_URL
  // a curva: do zero à meta, com folga para baixo quando a sessão passa pelo negativo
  const W = 320, H = 120
  const min = Math.min(0, ...curva) - meta * 0.08, max = Math.max(meta, ...curva) + meta * 0.08
  // o eixo do tempo cresce com a sessão (a curva nunca fica espremida no canto no começo)
  const escala = Math.max(14, curva.length + 4)
  const X = (i: number) => (i / escala) * W, Y = (v: number) => H - ((v - min) / (max - min)) * H
  const d = curva.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`).join(' ')
  const ultimas = feitas.map((o, i) => ({ o, n: i + 1 })).slice(-4).reverse()
  return (
    <div className="cpl-cab-v" ref={ref}>
      <header className="cpl-cab-v-topo">
        <img src={`${b}aulas-globalfly/robo-${s.f}-mobile.webp`} alt="" width="64" height="96" />
        <div className="cpl-cab-v-quem">
          <b className="cpl-cab-v-nome"><NomeDoRobo nome={s.n} id={ID_DO_ROBO[s.f]} /></b>
          <span className={`cpl-cab-v-fase ${terminou ? 'meta' : recuperando ? 'recupera' : 'opera'}`}><i />{terminou ? 'Meta atingida' : recuperando ? 'Recuperando' : 'Operando'}</span>
        </div>
        <div className="cpl-cab-v-res"><small>Resultado</small><b className={resultado >= 0 ? 'pos' : 'neg'}>{dinheiro(resultado, true)}</b></div>
      </header>
      <div className="cpl-cab-v-meta">
        <span>Meta <b>{dinheiro(meta)}</b></span>
        <div className="cpl-cab-v-trilho"><i style={{ width: `${pct}%` }} /></div>
        <span className="cpl-cab-v-pct">{Math.round(pct)}%</span>
      </div>
      <div className="cpl-cab-v-grafico">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1="0" x2={W} y1={Y(meta)} y2={Y(meta)} className="cpl-cab-v-linha-meta" />
          <line x1="0" x2={W} y1={Y(0)} y2={Y(0)} className="cpl-cab-v-linha-zero" />
          <path d={`${d} L${X(curva.length - 1)} ${H} L0 ${H} Z`} className="cpl-cab-v-area" />
          <path d={d} className="cpl-cab-v-curva" />
          <circle cx={X(curva.length - 1)} cy={Y(resultado)} r="4" className="cpl-cab-v-ponto" />
        </svg>
        <span className="cpl-cab-v-rot-meta" style={{ top: `${(Y(meta) / H) * 100}%` }}>Meta</span>
      </div>
      <div className={`cpl-cab-v-agora ${terminou ? 'fim' : ''}`} key={k}>
        {prox ? <>
          <span className="cpl-cab-v-anel" aria-hidden="true" />
          <span><small>Operação {k + 1} em andamento</small>{REGRA[s.f]} · {dinheiro(prox[0])}{recuperando && <em>Recuperação</em>}</span>
        </> : <span><small>Sessão encerrada</small>A I.A. parou sozinha ao bater a meta</span>}
      </div>
      <ol className="cpl-cab-v-ops">
        {ultimas.map(({ o, n }) => (
          <li key={`${escolhida}-${n}`} className={o[2] > 0 ? 'ganhou' : 'perdeu'}>
            <span>#{n}</span><span>{dinheiro(o[0])}</span><b>{dinheiro(o[2], true)}</b>
          </li>
        ))}
      </ol>
      <dl className="cpl-cab-v-nums">
        <div><dt>Operações</dt><dd>{k} de {s.ops.length}</dd></div>
        <div><dt>Positivas</dt><dd>{positivas}</dd></div>
        <div><dt>Acerto</dt><dd>{k ? Math.round((positivas / k) * 100) : 0}%</dd></div>
      </dl>
      <div className={`cpl-cab-v-aviso ${terminou ? 'cpl-ver' : ''}`} aria-hidden={!terminou}>
        <img src={`${b}pwa-globalfly/icon-180.png`} alt="" width="36" height="36" />
        <span><small>GlobalFly · agora</small><b>✅ {s.n} · Meta atingida</b>{dinheiro(resultado, true)} em {s.ops.length} operações</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ a apostila folheando */
export function ApostilaFolheando() {
  const b = import.meta.env.BASE_URL
  return (
    <div className="cpl-livro-palco" aria-hidden="true"><div className="cpl-livro">
      <div className="cpl-livro-miolo">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</div>
      {[0, 1, 2].map((i) => <div key={i} className={`cpl-livro-folha cpl-folha-${i}`}><span>{[0, 1, 2, 3, 4, 5].map((j) => <i key={j} />)}</span></div>)}
      <div className="cpl-livro-capa">
        <img src={`${b}aulas-globalfly/apostila-capa.webp`} alt="" width="600" height="849" loading="lazy" />
        <span className="cpl-livro-verso" />
      </div>
    </div></div>
  )
}
