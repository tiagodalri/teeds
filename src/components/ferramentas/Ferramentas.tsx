import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as PE, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { naPagina } from '../../core/escala'
import { IconeFechar } from '../IconeFechar'
import { Bandeira, COR_DA_MOEDA, Moeda } from './Bandeira'
import { MOEDAS, buscarCotacoes, converter, cotacoesGuardadas, historicoEmReais, type Cotacoes } from './cambio'
import { limpar, mostrar, mostrarDigitado, paraNumero, resolver, type Operador, type Pedaco } from './conta'
import './ferramentas.css'

/*
  Conversor de moedas e calculadora (06/11/2026, ideia do Victor Cordeiro).

  Segunda versão, no mesmo dia. Tiago: "quero que sejam móveis, flutuantes,
  para eu poder mover... experiência incrível, visual surpreendente", e as
  moedas "no estilo da Deriv" (moeda de metal em 3D, cartão escuro com a luz
  da cor da bandeira saindo do canto).

  - Janelas soltas por cima da plataforma, que não bloqueiam nada atrás.
    Arrasta pela barra do topo; a posição fica guardada no aparelho; dois
    cliques (ou o "−") recolhem só na barra; as duas podem ficar abertas.
  - Visual de instrumento de cabine: vidro azul-noite e ouro, igual nos dois
    temas (é uma escolha: a ferramenta flutua por cima de qualquer tela).
  - No computador, dois botões no topo, à esquerda da tela cheia. No celular
    o topo não tem espaço: os dois entram no menu do avatar (UserMenu).
*/

export type Ferramenta = 'cambio' | 'calculadora'

/* ------------------------------------------------- quem está aberto */
let ordem: Ferramenta[] = []
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((o) => o())
/** Abre (ou traz para a frente) uma ferramenta. */
export function abrirFerramenta(f: Ferramenta) {
  if (ordem[ordem.length - 1] === f) return
  // no celular não cabem as duas: abrir uma fecha a outra
  const estreita = typeof window !== 'undefined' && window.innerWidth <= 640
  ordem = estreita ? [f] : [...ordem.filter((x) => x !== f), f]
  avisar()
}
export function fecharFerramenta(f: Ferramenta) { ordem = ordem.filter((x) => x !== f); avisar() }
const alternar = (f: Ferramenta) => (ordem.includes(f) ? fecharFerramenta(f) : abrirFerramenta(f))
function useAbertas() {
  return useSyncExternalStore((o) => { ouvintes.add(o); return () => { ouvintes.delete(o) } }, () => ordem, () => ordem)
}

export function IconeCifrao() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2.5v19M16.8 6.6c-.7-1.4-2.5-2.3-4.8-2.3-2.8 0-4.8 1.4-4.8 3.6 0 5 9.8 2.7 9.8 7.9 0 2.3-2.1 3.9-5 3.9-2.5 0-4.4-1-5.1-2.6" />
    </svg>
  )
}
export function IconeCalculadora() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4.5" y="2.5" width="15" height="19" rx="2.5" />
      <path d="M8 7h8" />
      <path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 15.5h.01M12 15.5h.01M15.5 15.5h.01M8.5 19h.01M12 19h.01M15.5 19h.01" strokeWidth="2.6" />
    </svg>
  )
}

/** Os dois botões do topo + as janelas (que valem também para o menu do celular). */
export function BotoesDeFerramentas() {
  const abertas = useAbertas()
  return (
    <>
      <button type="button" className="tema-btn ferramenta-btn" onClick={() => alternar('cambio')}
        title="Conversor de moedas" aria-label="Conversor de moedas" aria-pressed={abertas.includes('cambio')}>
        <IconeCifrao />
      </button>
      <button type="button" className="tema-btn ferramenta-btn" onClick={() => alternar('calculadora')}
        title="Calculadora" aria-label="Calculadora" aria-pressed={abertas.includes('calculadora')}>
        <IconeCalculadora />
      </button>
      {abertas.includes('cambio') && (
        <JanelaFlutuante id="cambio" titulo="Conversor de moedas" icone={<IconeCifrao />} largura={400} camada={abertas.indexOf('cambio')}>
          {() => <ConversorDeMoedas />}
        </JanelaFlutuante>
      )}
      {abertas.includes('calculadora') && (
        <JanelaFlutuante id="calculadora" titulo="Calculadora" icone={<IconeCalculadora />} largura={320} camada={abertas.indexOf('calculadora')}>
          {(foco) => <Calculadora foco={foco} />}
        </JanelaFlutuante>
      )}
    </>
  )
}

/* ------------------------------------------------- a janela solta */

type Pos = { x: number; y: number }
const CHAVE_POS = (id: string) => `gf.ferramenta.${id}.pos`
function posGuardada(id: string): Pos | null {
  try { const v = JSON.parse(localStorage.getItem(CHAVE_POS(id)) || 'null'); return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? v : null } catch { return null }
}
/** A área visível em px da página (a plataforma roda a 90% no computador: ver escala.ts). */
const tela = () => ({ w: naPagina(window.innerWidth), h: naPagina(window.innerHeight) })

function JanelaFlutuante({ id, titulo, icone, largura, camada, children }: {
  id: Ferramenta; titulo: string; icone: ReactNode; largura: number; camada: number; children: (foco: boolean) => ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const [recolhida, setRecolhida] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const [foco, setFoco] = useState(true)
  const inicio = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  /** Mantém a janela na tela: a barra do topo nunca sai do alcance. */
  const prender = useCallback((p: Pos): Pos => {
    const { w, h } = tela()
    const lw = ref.current ? naPagina(ref.current.getBoundingClientRect().width) : largura
    const m = 8
    return { x: Math.round(Math.min(Math.max(m, p.x), Math.max(m, w - lw - m))), y: Math.round(Math.min(Math.max(m, p.y), Math.max(m, h - 64))) }
  }, [largura])

  // primeira abertura: embaixo do botão do topo, no computador; embaixo da tela, no celular
  useLayoutEffect(() => {
    const guardada = posGuardada(id)
    if (guardada) { setPos(prender(guardada)); return }
    const { w, h } = tela()
    const lw = Math.min(largura, w - 16)
    const alto = ref.current ? naPagina(ref.current.getBoundingClientRect().height) : 520
    // celular: o conversor (alto) logo abaixo do topo; a calculadora encostada embaixo
    if (w <= 640) { setPos(prender({ x: (w - lw) / 2, y: id === 'cambio' ? 68 : Math.max(68, h - alto - 16) })); return }
    // com a outra ferramenta aberta, nasce ao lado dela (à esquerda; se não couber, um degrau abaixo)
    const outra = [...document.querySelectorAll<HTMLElement>('.ferr-flutuante')].find((e) => e !== ref.current)
    if (outra) {
      const r = outra.getBoundingClientRect(), ox = naPagina(r.left), oy = naPagina(r.top)
      setPos(prender(ox - lw - 16 >= 8 ? { x: ox - lw - 16, y: oy } : { x: ox + 40, y: oy + 40 }))
      return
    }
    setPos(prender({ x: w - lw - 28, y: 84 }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const mudou = () => setPos((p) => (p ? prender(p) : p))
    window.addEventListener('resize', mudou)
    return () => window.removeEventListener('resize', mudou)
  }, [prender])
  useEffect(() => { if (pos && !arrastando) try { localStorage.setItem(CHAVE_POS(id), JSON.stringify(pos)) } catch { /* opcional */ } }, [pos, arrastando, id])
  // abriu: o foco vai para a janela (o teclado da calculadora funciona na hora)
  // (só depois de ganhar posição: invisível, a janela não recebe foco)
  const focou = useRef(false)
  useEffect(() => { if (pos && !focou.current) { focou.current = true; if (id === 'calculadora') ref.current?.focus({ preventScroll: true }) } }, [pos, id])

  const pegar = (e: PE<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button') || e.button !== 0 || !pos) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    inicio.current = { px: naPagina(e.clientX), py: naPagina(e.clientY), x: pos.x, y: pos.y }
    setArrastando(true)
  }
  const mover = (e: PE<HTMLElement>) => {
    const i = inicio.current
    if (i) setPos(prender({ x: i.x + naPagina(e.clientX) - i.px, y: i.y + naPagina(e.clientY) - i.py }))
  }
  const soltar = () => { inicio.current = null; setArrastando(false) }

  const janela = (
    <section ref={ref} className={`ferr-flutuante ferr-${id}${arrastando ? ' arrastando' : ''}${recolhida ? ' recolhida' : ''}`}
      role="dialog" aria-label={titulo} tabIndex={-1}
      style={{ left: pos?.x ?? 0, top: pos?.y ?? 0, visibility: pos ? 'visible' : 'hidden', width: `min(${largura}px, calc(100vw / var(--escala-pagina, 1) - 16px))`, zIndex: 900 + camada }}
      onPointerDownCapture={() => abrirFerramenta(id)}
      onFocus={() => setFoco(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFoco(false) }}
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); fecharFerramenta(id) } }}>
      <header className="ferr-barra" onPointerDown={pegar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
        onDoubleClick={(e) => { if (!(e.target as HTMLElement).closest('button')) setRecolhida((r) => !r) }} title="Arraste para mover · dois cliques para recolher">
        <span className="ferr-alca" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
        <span className="ferr-selo" aria-hidden="true">{icone}</span>
        <h2>{titulo}</h2>
        <button type="button" className="ferr-botao" onClick={() => setRecolhida((r) => !r)} aria-label={recolhida ? 'Abrir' : 'Recolher'} aria-expanded={!recolhida}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{recolhida ? <path d="M3 7.5l3-3 3 3" /> : <path d="M3 6h6" />}</svg>
        </button>
        <button type="button" className="ferr-botao" onClick={() => fecharFerramenta(id)} aria-label="Fechar"><IconeFechar /></button>
      </header>
      {!recolhida && <div className="ferr-conteudo">{children(foco)}</div>}
    </section>
  )
  return createPortal(janela, document.body)
}

/* ============================================================ conversor */

const CHAVE_PAR = 'gf.conversor.par'
function parGuardado(): { de: string; para: string } {
  try { const v = JSON.parse(localStorage.getItem(CHAVE_PAR) || 'null'); if (v?.de && v?.para) return v } catch { /* ok */ }
  return { de: 'USD', para: 'BRL' }
}
const moeda = (c: string) => MOEDAS.find((m) => m.codigo === c) ?? MOEDAS[0]
function dinheiro(v: number, codigo: string) {
  const m = moeda(codigo)
  const casas = m.casas === 0 && Math.abs(v) < 100 ? 2 : m.casas
  return v.toLocaleString('pt-BR', { minimumFractionDigits: Math.min(2, casas), maximumFractionDigits: casas })
}
function taxa(v: number) {
  const casas = v >= 100 ? 2 : v >= 0.01 ? 4 : 6
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: casas })
}
/** "1.234,56" → 1234.56; aceita ponto como decimal quando não há vírgula ("12.5"). */
function lerValor(t: string): number {
  const s = t.trim()
  if (!s) return 0
  const n = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s)
  const v = Number(n)
  return Number.isFinite(v) ? v : NaN
}
const RAPIDAS = ['USD', 'EUR', 'BRL', 'GBP', 'ARS', 'BTC']
const luz = (c: string) => ({ ['--luz' as string]: COR_DA_MOEDA[c] ?? '#B78D39' }) as CSSProperties

function ConversorDeMoedas() {
  const [cot, setCot] = useState<Cotacoes | null>(() => cotacoesGuardadas())
  const [erro, setErro] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [par, setPar] = useState(parGuardado)
  const [texto, setTexto] = useState('100')
  const [copiado, setCopiado] = useState(false)
  const [escolhendo, setEscolhendo] = useState<'de' | 'para' | null>(null)
  const [historico, setHistorico] = useState<Array<{ dia: number; valor: number }>>([])
  const [girou, setGirou] = useState(0)

  const atualizar = useCallback(async () => {
    setBuscando(true)
    try { setCot(await buscarCotacoes()); setErro(false) } catch { setErro(true) } finally { setBuscando(false) }
  }, [])
  useEffect(() => {
    void atualizar()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void atualizar() }, 60_000)
    return () => window.clearInterval(t)
  }, [atualizar])
  useEffect(() => { try { localStorage.setItem(CHAVE_PAR, JSON.stringify(par)) } catch { /* ok */ } }, [par])
  // a moeda que não é o real é a do gráfico (contra o real)
  const base = par.de === 'BRL' ? par.para : par.de
  useEffect(() => { let vivo = true; setHistorico([]); void historicoEmReais(base).then((h) => { if (vivo) setHistorico(h) }); return () => { vivo = false } }, [base])

  const valor = lerValor(texto)
  const resultado = cot && Number.isFinite(valor) ? converter(valor, par.de, par.para, cot) : null
  const umBase = cot ? converter(1, base, 'BRL', cot) : null
  const direta = cot ? converter(1, par.de, par.para, cot) : null
  const variacao = cot?.variacao[base]
  const hora = cot ? new Date(cot.quando) : null

  const escolher = (lado: 'de' | 'para', c: string) => {
    setPar((p) => (lado === 'de' ? { de: c, para: c === p.para ? p.de : p.para } : { para: c, de: c === p.de ? p.para : p.de }))
    setEscolhendo(null)
  }
  const inverter = () => { setPar((p) => ({ de: p.para, para: p.de })); setGirou((g) => g + 1) }
  const copiar = () => {
    if (resultado == null) return
    void navigator.clipboard?.writeText(dinheiro(resultado, par.para)).then(() => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1400) }).catch(() => undefined)
  }
  const botaoDaMoeda = (lado: 'de' | 'para') => {
    const c = par[lado]
    return (
      <button type="button" className="cnv-moeda" onClick={() => setEscolhendo(escolhendo === lado ? null : lado)} aria-haspopup="listbox" aria-expanded={escolhendo === lado}
        aria-label={`${lado === 'de' ? 'De' : 'Para'}: ${moeda(c).nome}. Trocar moeda`}>
        <Moeda codigo={c} tamanho={46} />
        <span><b>{c}</b><small>{moeda(c).nome}</small></span>
        <svg className="cnv-seta" width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 4.5l3 3 3-3" /></svg>
      </button>
    )
  }

  return (
    <div className="cnv">
      <div className="cnv-pilha">
        <div className="cnv-cartao" style={luz(par.de)}>
          <span className="cnv-rot">Você tem</span>
          {botaoDaMoeda('de')}
          <label className="cnv-valor">
            <span className="cnv-sr">Valor em {moeda(par.de).nome}</span>
            <em aria-hidden="true">{moeda(par.de).simbolo}</em>
            <input id="cnv-valor" inputMode="decimal" autoComplete="off" value={texto} autoFocus size={Math.max(2, Math.min(14, texto.length || 1))}
              onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, ''))} onFocus={(e) => e.currentTarget.select()} aria-invalid={!Number.isFinite(valor)} />
          </label>
        </div>

        <button type="button" className="cnv-inverter" onClick={inverter} title="Inverter as moedas" aria-label="Inverter as moedas" style={{ ['--giro' as string]: `${girou * 180}deg` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4" /></svg>
        </button>

        <div className="cnv-cartao para" style={luz(par.para)}>
          <span className="cnv-rot">Vira</span>
          {botaoDaMoeda('para')}
          <button type="button" className="cnv-resultado" onClick={copiar} title="Copiar o valor" aria-live="polite">
            <em aria-hidden="true">{moeda(par.para).simbolo}</em>
            <strong key={`${par.para}-${resultado}`}>{resultado == null ? (Number.isFinite(valor) ? '—' : 'Valor inválido') : dinheiro(resultado, par.para)}</strong>
          </button>
          <span className="cnv-copiado" aria-hidden={!copiado}>{copiado ? 'Copiado' : 'Toque no valor para copiar'}</span>
        </div>

        {escolhendo && <SeletorDeMoeda atual={par[escolhendo]} lado={escolhendo} cot={cot} aoEscolher={(c) => escolher(escolhendo, c)} aoFechar={() => setEscolhendo(null)} />}
      </div>

      <div className="cnv-rapidas" role="group" aria-label="Converter para">
        {RAPIDAS.filter((c) => c !== par.de).slice(0, 5).map((c) => (
          <button type="button" key={c} className={c === par.para ? 'on' : ''} onClick={() => escolher('para', c)} aria-pressed={c === par.para} title={moeda(c).nome}>
            <Bandeira codigo={c} tamanho={18} /><span>{c}</span>
          </button>
        ))}
      </div>

      <section className="cnv-mercado" aria-label={`${base} em reais`}>
        <div className="cnv-mercado-topo">
          <span className="cnv-par"><Bandeira codigo={base} tamanho={18} /><b>1 {base}</b><span>=</span><b className="ouro">R$ {umBase != null ? taxa(umBase) : '—'}</b></span>
          {typeof variacao === 'number' && <span className={`cnv-var ${variacao >= 0 ? 'sobe' : 'desce'}`}>{variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% <small>hoje</small></span>}
        </div>
        <Linha pontos={historico} />
        {direta != null && par.de !== 'BRL' && par.para !== 'BRL' && <p className="cnv-cruzado">1 {par.de} = {taxa(direta)} {par.para}</p>}
      </section>

      <footer className="cnv-rodape">
        <span className={`cnv-ao-vivo ${erro ? 'erro' : cot?.fonte === 'do dia' ? 'dia' : ''}`}>
          <i aria-hidden="true" />
          {erro && !cot ? 'Sem cotação agora' : erro ? 'Última cotação conhecida' : cot?.fonte === 'do dia' ? 'Cotação do dia' : 'Comercial ao vivo'}
          {hora && !(erro && !cot) && <> · {hora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às {hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</>}
        </span>
        <button type="button" className="cnv-atualizar" onClick={() => void atualizar()} disabled={buscando} aria-label="Atualizar a cotação">
          <svg className={buscando ? 'gira' : ''} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 11-2.3-5.7M20 4v5h-5" /></svg>
          {buscando ? 'Atualizando' : 'Atualizar'}
        </button>
      </footer>
    </div>
  )
}

/** A linha dos últimos dias, com a área dourada embaixo. */
function Linha({ pontos }: { pontos: Array<{ dia: number; valor: number }> }) {
  const W = 340, H = 56
  if (pontos.length < 3) return <div className="cnv-linha vazia" aria-hidden="true"><span>Carregando os últimos dias…</span></div>
  const vs = pontos.map((p) => p.valor), min = Math.min(...vs), max = Math.max(...vs), faixa = max - min || 1
  const xy = pontos.map((p, i) => [(i / (pontos.length - 1)) * W, H - 6 - ((p.valor - min) / faixa) * (H - 14)] as const)
  const d = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const primeiro = vs[0], ultimo = vs[vs.length - 1], subiu = ultimo >= primeiro
  const pct = ((ultimo - primeiro) / primeiro) * 100
  const dia = (t: number) => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const [ux, uy] = xy[xy.length - 1]
  return (
    <figure className={`cnv-linha ${subiu ? 'sobe' : 'desce'}`}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Últimos ${pontos.length} dias: de R$ ${taxa(primeiro)} para R$ ${taxa(ultimo)}`}>
        <defs><linearGradient id="cnv-area" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#D0AA52" stopOpacity=".34" /><stop offset="1" stopColor="#D0AA52" stopOpacity="0" /></linearGradient></defs>
        <path d={`${d} L${W} ${H} L0 ${H} Z`} fill="url(#cnv-area)" />
        <path d={d} fill="none" stroke="#D0AA52" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <i className="cnv-ponto" style={{ left: `${(ux / W) * 100}%`, top: `${(uy / H) * 100}%` }} aria-hidden="true" />
      <figcaption><span>{dia(pontos[0].dia)}</span><b className={subiu ? 'sobe' : 'desce'}>{subiu ? '+' : ''}{pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% em {pontos.length} dias</b><span>{dia(pontos[pontos.length - 1].dia)}</span></figcaption>
    </figure>
  )
}

function SeletorDeMoeda({ atual, lado, cot, aoEscolher, aoFechar }: { atual: string; lado: 'de' | 'para'; cot: Cotacoes | null; aoEscolher: (c: string) => void; aoFechar: () => void }) {
  const [busca, setBusca] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const fora = (e: PointerEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node) && !(e.target as HTMLElement).closest?.('.cnv-moeda')) aoFechar() }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aoFechar])
  const termo = busca.trim().toLowerCase()
  const lista = MOEDAS.filter((m) => !termo || `${m.codigo} ${m.nome}`.toLowerCase().includes(termo))
  return (
    <div ref={caixa} className={`cnv-lista ${lado}`} role="listbox" aria-label="Escolha a moeda" onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar() } }}>
      <input className="cnv-busca" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar moeda" aria-label="Procurar moeda" autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter' && lista[0]) aoEscolher(lista[0].codigo) }} />
      <div className="cnv-lista-itens">
        {lista.map((m) => {
          const r = cot && m.codigo !== 'BRL' ? cot.emReais[m.codigo] : null
          return (
            <button type="button" role="option" aria-selected={m.codigo === atual} key={m.codigo} className={m.codigo === atual ? 'on' : ''} onClick={() => aoEscolher(m.codigo)} style={luz(m.codigo)}>
              <Moeda codigo={m.codigo} tamanho={34} />
              <span><b>{m.codigo}</b><small>{m.nome}</small></span>
              <em>{r ? `R$ ${taxa(r)}` : m.codigo === 'BRL' ? 'Real' : ''}</em>
            </button>
          )
        })}
        {!lista.length && <p>Nenhuma moeda com esse nome.</p>}
      </div>
    </div>
  )
}

/* ========================================================== calculadora */

const OPS: Record<string, Operador> = { '+': '+', '-': '−', '*': '×', x: '×', X: '×', '/': '÷', '÷': '÷', '×': '×', '−': '−' }

function T({ r, on, cls = '', label, ativa = false }: { r: ReactNode; on: () => void; cls?: string; label?: string; ativa?: boolean }) {
  return <button type="button" className={`calc-tecla ${cls}${ativa ? ' calc-ativa' : ''}`} onClick={on} aria-label={label}>{r}</button>
}

function Calculadora({ foco }: { foco: boolean }) {
  // a conta em andamento: os pedaços já fechados + o número que está sendo digitado
  const [fila, setFila] = useState<Pedaco[]>([])
  const [digitando, setDigitando] = useState('')
  const [feita, setFeita] = useState<{ conta: string; resultado: number | null } | null>(null)
  const [fita, setFita] = useState<Array<{ conta: string; resultado: number }>>([])
  const [copiado, setCopiado] = useState(false)
  const [apertada, setApertada] = useState<string | null>(null)

  const filaCompleta = (): Pedaco[] => (digitando !== '' ? [...fila, { tipo: 'num', texto: digitando }] : fila)
  const textoDaConta = (p: Pedaco[]) => p.map((x) => (x.tipo === 'num' ? mostrarDigitado(x.texto) : x.op)).join(' ')
  const deNumero = (n: number) => String(n).replace('.', ',')

  const digito = (d: string) => {
    if (feita) { setFeita(null); setFila([]) }
    setDigitando((t) => {
      const base = feita ? '' : t
      if (d === ',') return base.includes(',') ? base : (base === '' || base === '-' ? base + '0,' : base + ',')
      if (base.replace(/[-,]/g, '').length >= 15) return base
      if (base === '0') return d
      if (base === '-0') return '-' + d
      return base + d
    })
  }
  const operador = (op: Operador) => {
    if (feita) {
      if (feita.resultado == null) return
      setFila([{ tipo: 'num', texto: deNumero(feita.resultado) }, { tipo: 'op', op }])
      setFeita(null); setDigitando(''); return
    }
    if (digitando !== '') { setFila((f) => [...f, { tipo: 'num', texto: digitando }, { tipo: 'op', op }]); setDigitando(''); return }
    setFila((f) => (f.length ? [...f.slice(0, -1), { tipo: 'op', op }] : [{ tipo: 'num', texto: '0' }, { tipo: 'op', op }]))
  }
  const igual = () => {
    const p = filaCompleta()
    if (!p.length || feita) return
    const conta = textoDaConta(p), resultado = resolver(p)
    setFeita({ conta, resultado })
    if (resultado != null && p.length > 1) setFita((f) => [{ conta, resultado }, ...f].slice(0, 3))
    setFila([]); setDigitando('')
  }
  const limparTudo = () => { setFila([]); setDigitando(''); setFeita(null) }
  const apagar = () => {
    if (feita) { limparTudo(); return }
    if (digitando !== '') { setDigitando((t) => (t.length <= 1 || t === '-0' ? '' : t.slice(0, -1).replace(/^-$/, ''))); return }
    setFila((f) => f.slice(0, -1))
  }
  const trocarSinal = () => {
    if (feita && feita.resultado != null) { const r = -feita.resultado; setFeita(null); setFila([]); setDigitando(deNumero(r)); return }
    setDigitando((t) => (t === '' ? '-' : t.startsWith('-') ? t.slice(1) : '-' + t))
  }
  /** % como na calculadora do celular: 200 + 10% = 220; sozinho, divide por 100. */
  const porcento = () => {
    if (feita && feita.resultado != null) { const r = limpar(feita.resultado / 100); setFeita(null); setFila([]); setDigitando(deNumero(r)); return }
    if (digitando === '') return
    const n = paraNumero(digitando)
    const ult = fila[fila.length - 1]
    let v = n / 100
    if (ult?.tipo === 'op' && (ult.op === '+' || ult.op === '−')) { const esq = resolver(fila.slice(0, -1)); if (esq != null) v = (esq * n) / 100 }
    setDigitando(deNumero(limpar(v)))
  }
  const usar = (n: number) => { setFeita(null); setFila([]); setDigitando(deNumero(n)) }

  // teclado: só com a calculadora em foco (a janela é solta e a pessoa pode estar digitando em outro lugar)
  const acoes = useRef({ digito, operador, igual, limparTudo, apagar, porcento })
  acoes.current = { digito, operador, igual, limparTudo, apagar, porcento }
  useEffect(() => {
    if (!foco) return
    const tecla = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const alvo = e.target as HTMLElement
      if (!alvo.closest?.('.ferr-calculadora') || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return
      const a = acoes.current, k = e.key
      let marca = k
      if (/^\d$/.test(k)) a.digito(k)
      else if (k === ',' || k === '.') { a.digito(','); marca = ',' }
      else if (OPS[k]) { a.operador(OPS[k]); marca = OPS[k] }
      else if (k === 'Enter' || k === '=') { a.igual(); marca = '=' }
      else if (k === 'Backspace') { a.apagar(); marca = '⌫' }
      else if (k === 'Delete' || k === 'c' || k === 'C') { a.limparTudo(); marca = 'C' }
      else if (k === '%') a.porcento()
      else return
      e.preventDefault()
      setApertada(marca); window.setTimeout(() => setApertada((x) => (x === marca ? null : x)), 130)
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [foco])

  const previa = !feita && fila.length ? resolver(filaCompleta()) : null
  const visor = feita ? (feita.resultado == null ? 'Não dá para dividir por zero' : mostrar(feita.resultado)) : mostrarDigitado(digitando || (fila.length ? '' : '0'))
  const linhaDeCima = feita ? `${feita.conta} =` : textoDaConta(fila)
  const opPendente = !feita && digitando === '' && fila[fila.length - 1]?.tipo === 'op' ? (fila[fila.length - 1] as { op: Operador }).op : null
  const copiar = () => {
    const v = feita?.resultado ?? (digitando ? paraNumero(digitando) : previa)
    if (v == null) return
    void navigator.clipboard?.writeText(mostrar(v)).then(() => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1400) }).catch(() => undefined)
  }
  const tamanho = useMemo(() => (visor.length > 16 ? 'p' : visor.length > 11 ? 'm' : ''), [visor])

  return (
    <div className="calc">
      <div className="calc-visor" aria-live="polite">
        {fita.length > 0 && (
          <ol className="calc-fita" aria-label="Contas anteriores">
            {fita.slice().reverse().map((f, i) => (
              <li key={i}><button type="button" onClick={() => usar(f.resultado)} title="Usar este resultado"><span>{f.conta} =</span><b>{mostrar(f.resultado)}</b></button></li>
            ))}
          </ol>
        )}
        <span className="calc-conta">{linhaDeCima || ' '}</span>
        <button type="button" className={`calc-valor${tamanho ? ` calc-${tamanho}` : ''}${feita && feita.resultado == null ? ' calc-erro' : ''}`} onClick={copiar} title="Copiar o resultado">{visor}</button>
        <span className="calc-previa">{copiado ? 'Copiado' : previa != null && digitando !== '' ? `= ${mostrar(previa)}` : ' '}</span>
      </div>
      <div className="calc-teclas">
        <T r="C" on={limparTudo} cls="calc-fn" label="Limpar" ativa={apertada === 'C'} />
        <T r={<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5h11v14H9l-6-7z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" /></svg>} on={apagar} cls="calc-fn" label="Apagar" ativa={apertada === '⌫'} />
        <T r="%" on={porcento} cls="calc-fn" label="Porcentagem" ativa={apertada === '%'} />
        <T r="÷" on={() => operador('÷')} cls={`calc-op${opPendente === '÷' ? ' calc-pendente' : ''}`} label="Dividir" ativa={apertada === '÷'} />
        {['7', '8', '9'].map((d) => <T key={d} r={d} on={() => digito(d)} ativa={apertada === d} />)}
        <T r="×" on={() => operador('×')} cls={`calc-op${opPendente === '×' ? ' calc-pendente' : ''}`} label="Multiplicar" ativa={apertada === '×'} />
        {['4', '5', '6'].map((d) => <T key={d} r={d} on={() => digito(d)} ativa={apertada === d} />)}
        <T r="−" on={() => operador('−')} cls={`calc-op${opPendente === '−' ? ' calc-pendente' : ''}`} label="Subtrair" ativa={apertada === '−'} />
        {['1', '2', '3'].map((d) => <T key={d} r={d} on={() => digito(d)} ativa={apertada === d} />)}
        <T r="+" on={() => operador('+')} cls={`calc-op${opPendente === '+' ? ' calc-pendente' : ''}`} label="Somar" ativa={apertada === '+'} />
        <T r="±" on={trocarSinal} label="Trocar o sinal" cls="calc-fn" />
        <T r="0" on={() => digito('0')} ativa={apertada === '0'} />
        <T r="," on={() => digito(',')} label="Vírgula" ativa={apertada === ','} />
        <T r="=" on={igual} cls="calc-igual" label="Igual" ativa={apertada === '='} />
      </div>
    </div>
  )
}
