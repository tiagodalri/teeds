import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { verNoServidor, type SessaoViva } from '../../core/teeds/servidorRobos'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { MASCARA, useValoresOcultos } from '../../core/privacidade'
import { NomeDoRobo } from '../NomeDoRobo'
import { contagemDoEstado } from '../RobotResumo'
import { MARCA } from '../../marca'
import { simboloMoeda } from '../../core/dinheiro'
import './mini-cabine.css'
import { naPagina } from '../../core/escala'

/**
 * A mini-cabine (21/10/2026, ideia do Tiago): com robô ligado, a pessoa vai
 * para outra tela e continua vendo as entradas e o resultado.
 *
 * Fechada é uma pílula: quantas I.A.s, o resultado somado e o anel da meta;
 * a cada entrada nova ela "respira" (verde no ganho, coral na perda) e mostra
 * o valor por um instante. Aberta, um cartão por robô: resultado, últimas
 * entradas, curva, meta e limite, e os botões Abrir e Parar.
 *
 * Não consulta nada enquanto opera: recebe as mesmas sessões que a tela de
 * robôs já busca. O servidor só lista o que está rodando, então quando uma
 * sessão some da lista a mini-cabine pergunta UMA vez o estado final dela,
 * para dizer se foi meta, limite ou parada. Some na tela de robôs (lá a
 * cabine está inteira) e respeita o olhinho.
 */

interface Props {
  sessoes: SessaoViva[]
  /** Para ler o estado final de uma sessão que acabou de sair da lista. */
  sessao?: SessaoTeeds | null
  aoAbrirCabine: () => void
  aoParar?: (id: string) => Promise<void> | void
  /** A conta escolhida no topo: o total soma só ela (demo e real nunca se misturam). */
  demo?: boolean
  /** Acesso de demonstração: a sessão na conta virtual aparece como "Real". */
  demoComoReal?: boolean
  /** Rótulos trocados (exercícios internos): a sessão na real aparece como "Demo" e na virtual como "Real". */
  rotulosTrocados?: boolean
}

type Aviso = { id: string; nome: string; tipo: 'meta' | 'limite' | 'fim'; texto: string; valor: string }
const CHAVE = `${MARCA.id}.miniCabine.aberta`
const CHAVE_POS = `${MARCA.id}.miniCabine.posicao`
/** Onde a pessoa deixou (fração do espaço livre, 0 a 1): vale em qualquer tamanho de tela. */
type Posicao = { x: number; y: number }
const lerPos = (): Posicao | null => { try { const p = JSON.parse(localStorage.getItem(CHAVE_POS) || 'null'); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null } catch { return null } }
const prende = (v: number) => Math.max(0, Math.min(1, v))
/** O espaço livre: abaixo do topo e acima da barra de baixo (celular), com folga. */
function area(w: number, h: number) {
  // tudo em px da página (escala do computador: core/escala.ts)
  const topo = naPagina(document.querySelector('.workspace-app .topbar')?.getBoundingClientRect().bottom ?? 0)
  const barra = document.querySelector('.barra-inferior')
  const base = naPagina(barra && barra.getBoundingClientRect().height > 0 ? barra.getBoundingClientRect().top : window.innerHeight)
  const minX = 8, maxX = Math.max(minX, naPagina(window.innerWidth) - w - 8)
  const minY = Math.max(8, topo + 8), maxY = Math.max(minY, base - h - 8)
  return { minX, maxX, minY, maxY }
}
const lerAberta = () => { try { return localStorage.getItem(CHAVE) === '1' } catch { return false } }
const numero = (n: number) => Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const comSinal = (n: number, moeda: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${moeda ? `${simboloMoeda(moeda)} ` : ''}${numero(n)}`

const I = {
  abrir: 'M6 15l6-6 6 6',
  fechar: 'M6 9l6 6 6-6',
  seta: 'M9 6l6 6-6 6',
  parar: 'M7 7h10v10H7z',
  meta: 'M5 12.5l4.2 4.2L19 7',
  limite: 'M12 8v5M12 16.5h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  x: 'M6 6l12 12M18 6L6 18',
  lugar: 'M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7',
}
const Ic = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

function Curva({ serie }: { serie: number[] }) {
  if (serie.length < 2) return <svg className="mcb-curva" viewBox="0 0 100 28" aria-hidden="true" />
  const min = Math.min(0, ...serie), max = Math.max(0, ...serie), amp = max - min || 1
  const y = (v: number) => 26 - ((v - min) / amp) * 24
  const pts = serie.map((v, i) => `${(i / (serie.length - 1)) * 100},${y(v)}`).join(' ')
  const sobe = serie[serie.length - 1] >= 0
  return (
    <svg className={`mcb-curva ${sobe ? 'sobe' : 'cai'}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2="100" y1={y(0)} y2={y(0)} />
      <polygon points={`0,${y(0)} ${pts} 100,${y(0)}`} /><polyline points={pts} />
    </svg>
  )
}

/** O anel da meta na pílula (progresso somado de todas as sessões). */
function Anel({ pct }: { pct: number }) {
  const r = 9, c = 2 * Math.PI * r
  return (
    <svg className="mcb-anel" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r={r} />
      <circle cx="12" cy="12" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, pct)))} />
    </svg>
  )
}

export function MiniCabine({ sessoes, sessao, aoAbrirCabine, aoParar, demo, demoComoReal = false, rotulosTrocados = false }: Props) {
  const ocultos = useValoresOcultos()
  const [aberta, setAberta] = useState(lerAberta)
  const [pos, setPos] = useState<Posicao | null>(lerPos)
  const [arrastando, setArrastando] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const arrasto = useRef<{ x0: number; y0: number; dx: number; dy: number; moveu: boolean } | null>(null)
  const ignorarClique = useRef(false)
  const [, redesenhar] = useState(0)
  const [pulso, setPulso] = useState<{ chave: number; lucro: number; moeda: string } | null>(null)
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [parando, setParando] = useState<string | null>(null)
  const vistas = useRef<Map<string, { operacoes: number; rodando: boolean }>>(new Map())
  const conhecidas = useRef<Map<string, SessaoViva>>(new Map())
  const avisadas = useRef<Set<string>>(new Set())

  /** O aviso de fim: meta, limite ou parada (uma vez por sessão). */
  const avisarFim = (s: SessaoViva, e = s.estado) => {
    if (avisadas.current.has(s.id)) return
    avisadas.current.add(s.id)
    const meta = s.config.takeProfit > 0 && e.resultado >= s.config.takeProfit
    const limite = s.config.stopLoss > 0 && e.resultado <= -s.config.stopLoss
    setAvisos((l) => [...l.filter((a) => a.id !== s.id), {
      id: s.id, nome: s.roboNome, tipo: meta ? 'meta' : limite ? 'limite' : 'fim',
      texto: meta ? 'bateu a meta' : limite ? 'atingiu o limite de perda' : (e.motivoParada ? `parou: ${e.motivoParada.replace(/\.$/, '').toLowerCase()}` : 'encerrou a sessão'),
      valor: comSinal(e.resultado, s.moeda),
    }])
  }

  useEffect(() => { try { localStorage.setItem(CHAVE, aberta ? '1' : '0') } catch { /* só agora */ } }, [aberta])
  useEffect(() => { try { if (pos) localStorage.setItem(CHAVE_POS, JSON.stringify(pos)); else localStorage.removeItem(CHAVE_POS) } catch { /* só agora */ } }, [pos])
  useEffect(() => { const r = () => redesenhar((n) => n + 1); window.addEventListener('resize', r); return () => window.removeEventListener('resize', r) }, [])

  // posiciona onde a pessoa deixou (depois de medir: a pílula e o cartão têm tamanhos diferentes)
  useLayoutEffect(() => {
    const el = raiz.current
    if (!el) return
    if (!pos) { el.style.left = ''; el.style.top = ''; return }
    const celularAberto = aberta && window.innerWidth <= 900
    const a = area(el.offsetWidth, el.offsetHeight)
    el.style.left = celularAberto ? '' : `${a.minX + pos.x * (a.maxX - a.minX)}px`
    el.style.top = `${a.minY + pos.y * (a.maxY - a.minY)}px`
  })

  // arrastar: a pílula inteira, ou o cabeçalho do cartão. Um toque sem mover continua abrindo.
  const pegar = (e: React.PointerEvent) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('.mcb-nao-arrasta')) return
    const r = raiz.current!.getBoundingClientRect()
    arrasto.current = { x0: naPagina(e.clientX), y0: naPagina(e.clientY), dx: naPagina(e.clientX - r.left), dy: naPagina(e.clientY - r.top), moveu: false }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const mover = (e: React.PointerEvent) => {
    const a0 = arrasto.current
    const el = raiz.current
    if (!a0 || !el) return
    if (!a0.moveu && Math.hypot(naPagina(e.clientX) - a0.x0, naPagina(e.clientY) - a0.y0) < 6) return
    a0.moveu = true
    setArrastando(true)
    const a = area(el.offsetWidth, el.offsetHeight)
    setPos({
      x: a.maxX > a.minX ? prende((naPagina(e.clientX) - a0.dx - a.minX) / (a.maxX - a.minX)) : 0,
      y: a.maxY > a.minY ? prende((naPagina(e.clientY) - a0.dy - a.minY) / (a.maxY - a.minY)) : 1,
    })
  }
  const soltar = () => {
    // só a pílula vira clique depois de um arrasto; arrastar o cartão aberto não pode engolir o próximo toque
    if (arrasto.current?.moveu && !aberta) ignorarClique.current = true
    arrasto.current = null
    setArrastando(false)
  }
  const alca = { onPointerDown: pegar, onPointerMove: mover, onPointerUp: soltar, onPointerCancel: soltar }

  // cada entrada nova faz a pílula respirar; meta, limite e fim viram aviso
  useEffect(() => {
    const atuais = new Set(sessoes.map((s) => s.id))
    for (const s of sessoes) {
      const antes = vistas.current.get(s.id)
      const e = s.estado
      if (antes && e.operacoes > antes.operacoes) {
        const lucro = e.historico[0]?.lucro ?? e.ultimoLucro ?? 0
        setPulso({ chave: Date.now(), lucro, moeda: s.moeda })
        if (navigator.vibrate && document.visibilityState === 'visible') try { navigator.vibrate(lucro >= 0 ? 12 : [10, 40, 10]) } catch { /* sem vibração */ }
      }
      if (antes?.rodando && !e.rodando) avisarFim(s)
      if (e.rodando) avisadas.current.delete(s.id)
      vistas.current.set(s.id, { operacoes: e.operacoes, rodando: e.rodando })
      conhecidas.current.set(s.id, s)
    }
    // saiu da lista = parou: o estado final vem do servidor (uma consulta), senão o último conhecido
    for (const [id, s] of conhecidas.current) {
      if (atuais.has(id)) continue
      conhecidas.current.delete(id)
      vistas.current.delete(id)
      if (!sessao) { avisarFim(s); continue }
      verNoServidor(sessao, id).then((f) => avisarFim(s, f.estado ?? s.estado)).catch(() => avisarFim(s))
    }
  }, [sessoes]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!pulso) return; const t = window.setTimeout(() => setPulso(null), 2200); return () => window.clearTimeout(t) }, [pulso])
  useEffect(() => { if (!avisos.length) return; const t = window.setTimeout(() => setAvisos((l) => l.slice(1)), 7000); return () => window.clearTimeout(t) }, [avisos])

  const vivas = sessoes.filter((s) => s.estado.rodando || s.estado.emOperacao)
  if (!vivas.length && !avisos.length) return null
  // o total é de UMA conta: a escolhida no topo; sem robô nela, a que tiver robô no ar
  const daConta = demo === undefined ? vivas : vivas.filter((s) => s.demo === demo)
  const somadas = daConta.length ? daConta : vivas.filter((s) => s.demo === vivas[0]?.demo)
  const moeda = somadas[0]?.moeda ?? sessoes[0]?.moeda ?? 'USD'
  const total = somadas.reduce((t, s) => t + s.estado.resultado, 0)
  const metaTotal = somadas.reduce((t, s) => t + (s.config.takeProfit || 0), 0)
  const pctMeta = metaTotal > 0 ? Math.max(0, total) / metaTotal : 0
  const v = (n: number) => (ocultos ? `${simboloMoeda(moeda)} ${MASCARA}` : comSinal(n, moeda))

  async function parar(id: string) {
    if (!aoParar) return
    setParando(id)
    try { await aoParar(id) }
    catch { setAvisos((l) => [...l, { id: `erro-${id}-${Date.now()}`, nome: 'Não consegui parar agora', tipo: 'fim', texto: 'Tente de novo ou pare pela tela de I.A.', valor: '' }]) }
    finally { setParando(null); setConfirmar(null) }
  }

  return (
    <div ref={raiz} className={`mcb ${aberta ? 'aberta' : ''} ${pos ? 'solta' : ''} ${arrastando ? 'arrastando' : ''} ${pos && pos.y < 0.5 ? 'no-alto' : ''} ${pos && pos.x > 0.5 ? 'a-direita' : ''}`}>
      {/* avisos: meta, limite, fim */}
      {avisos.slice(0, 2).map((a) => (
        <div key={a.id} className={`mcb-aviso ${a.tipo}`} role="status">
          <span className="mcb-aviso-icone"><Ic d={a.tipo === 'meta' ? I.meta : a.tipo === 'limite' ? I.limite : I.parar} /></span>
          <span><b><NomeDoRobo nome={a.nome} emTexto /> {a.texto}</b><small>Resultado da sessão: {ocultos ? `${simboloMoeda(moeda)} ${MASCARA}` : a.valor}</small></span>
          <button type="button" onClick={() => setAvisos((l) => l.filter((x) => x.id !== a.id))} aria-label="Fechar aviso"><Ic d={I.x} /></button>
        </div>
      ))}

      {vivas.length > 0 && (aberta ? (
        // ------------------------------------------------ aberta
        <section className="mcb-cartao" aria-label="I.A.s operando">
          <header className="mcb-topo" {...alca} title="Arraste para mudar de lugar">
            <span className="mcb-pega" aria-hidden="true" />
            <span className="mcb-vivo"><i aria-hidden="true" />{vivas.length === 1 ? '1 I.A. operando' : `${vivas.length} I.A.s operando`}</span>
            <b className={ocultos ? '' : total >= 0 ? 'sobe' : 'cai'}>{v(total)}</b>
            {pos && <button type="button" className="mcb-icone mcb-nao-arrasta" onClick={() => setPos(null)} aria-label="Voltar ao lugar padrão" title="Voltar ao lugar padrão"><Ic d={I.lugar} /></button>}
            <button type="button" className="mcb-icone mcb-nao-arrasta" onClick={() => setAberta(false)} aria-label="Recolher"><Ic d={I.fechar} /></button>
          </header>
          <div className="mcb-lista">
            {vivas.map((s) => {
              const e = s.estado
              const pct = s.config.takeProfit > 0 ? Math.max(0, Math.min(1, e.resultado / s.config.takeProfit)) : 0
              const pctLim = s.config.stopLoss > 0 ? Math.max(0, Math.min(1, -e.resultado / s.config.stopLoss)) : 0
              const ultimas = e.historico.slice(0, 8).reverse()
              return (
                <article key={s.id} className="mcb-robo">
                  <div className="mcb-robo-topo">
                    <img src={`${import.meta.env.BASE_URL}robos-globalfly/${s.roboId}-pequena.webp`} alt="" decoding="async" onError={(ev) => { ev.currentTarget.style.visibility = 'hidden' }} />
                    <span className="mcb-robo-nome">
                      <b><NomeDoRobo nome={s.roboNome} /></b>
                      <small className={e.emOperacao ? 'operando' : 'analisando'}><i aria-hidden="true" />{e.emOperacao ? 'Em operação' : (() => { const k = contagemDoEstado(e); return k && !k.sequencia ? `Analisando ${k.n}/${k.alvo}` : 'Analisando o mercado' })()} · {(rotulosTrocados ? !s.demo : s.demo && !demoComoReal) ? 'Demo' : 'Real'}</small>
                    </span>
                    <span className="mcb-robo-res">
                      <b className={ocultos ? '' : e.resultado >= 0 ? 'sobe' : 'cai'}>{v(e.resultado)}</b>
                      <small>{e.operacoes} op. · {e.vitorias}/{e.derrotas}</small>
                    </span>
                  </div>
                  <div className="mcb-robo-meio">
                    <span className="mcb-entradas" aria-label="Últimas entradas">
                      {ultimas.map((o) => <i key={o.n} className={o.lucro >= 0 ? 'g' : 'p'} title={`#${o.n}: ${comSinal(o.lucro, s.moeda)}`} />)}
                      {e.emCurso && <i className="agora" title="Entrada em andamento" />}
                    </span>
                    <Curva serie={e.curva} />
                  </div>
                  {(s.config.takeProfit > 0 || s.config.stopLoss > 0) && (
                    <div className="mcb-limites">
                      <div><span>Meta {ocultos ? '' : `${simboloMoeda(moeda)} ${numero(s.config.takeProfit)}`}</span><i className="sobe"><u style={{ width: `${pct * 100}%` }} /></i></div>
                      <div><span>Limite {ocultos ? '' : `${simboloMoeda(moeda)} ${numero(s.config.stopLoss)}`}</span><i className="cai"><u style={{ width: `${pctLim * 100}%` }} /></i></div>
                    </div>
                  )}
                  {confirmar === s.id ? (
                    <div className="mcb-confirmar">
                      <span>Parar <NomeDoRobo nome={s.roboNome} emTexto />?</span>
                      <button type="button" onClick={() => setConfirmar(null)}>Cancelar</button>
                      <button type="button" className="perigo" disabled={parando === s.id} onClick={() => void parar(s.id)}>{parando === s.id ? 'Parando…' : 'Parar'}</button>
                    </div>
                  ) : (
                    <div className="mcb-acoes">
                      <button type="button" onClick={aoAbrirCabine}>Abrir cabine <Ic d={I.seta} /></button>
                      {aoParar && <button type="button" className="parar" onClick={() => setConfirmar(s.id)}><Ic d={I.parar} />Parar</button>}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        </section>
      ) : (
        // ------------------------------------------------ fechada: a pílula
        <button type="button" className="mcb-pilula"
          {...alca} onClick={() => { if (ignorarClique.current) { ignorarClique.current = false; return } setAberta(true) }} title="Toque para abrir · arraste para mudar de lugar" aria-label={`${vivas.length} I.A.s operando, resultado ${ocultos ? 'oculto' : comSinal(total, moeda)}. Abrir.`}>
          <span className="mcb-pega" aria-hidden="true" />
          <span className="mcb-vivo"><i aria-hidden="true" /><span>{vivas.length === 1 ? '1 I.A.' : `${vivas.length} I.A.s`}</span></span>
          <span className="mcb-sep" aria-hidden="true" />
          <b className={ocultos ? '' : total >= 0 ? 'sobe' : 'cai'}>{v(total)}</b>
          {/* o "respiro" de cada entrada: um anel que acende e some (a pílula não é recriada, para não soltar o arrasto) */}
          {pulso && <i key={pulso.chave} className={`mcb-onda ${pulso.lucro >= 0 ? 'ganho' : 'perda'}`} aria-hidden="true" />}
          {pulso && !ocultos && <em key={`v${pulso.chave}`} className={pulso.lucro >= 0 ? 'sobe' : 'cai'}>{comSinal(pulso.lucro, '')}</em>}
          {metaTotal > 0 && <span className="mcb-meta" title={`${Math.round(pctMeta * 100)}% da meta`}><Anel pct={pctMeta} /></span>}
          <span className="mcb-abrir"><Ic d={I.abrir} /></span>
        </button>
      ))}
    </div>
  )
}
