import { useEffect, useMemo, useRef, useState } from 'react'
import { publicSocket } from '../../core/deriv/client'
import { IAS_DA_RECOMENDACAO as IAS, JANELA_DA_RECOMENDACAO_S, MINIMO_DE_TICKS, digitosDosPrecos, inicioDaJanela, ordemDaRecomendacao, pedidoDosTicks, type IADaRecomendacao as IA } from '../../core/recomendacao'
import { MARCA, FAMILIA_GF } from '../../marca'
import { LogotipoDaIA } from '../marca/LogotipoDaIA'
import { fotoDoCartaoAlto } from '../marca/fotoDoCartao'
import './recomendacao-da-ia.css'

/**
 * I.A. recomendada agora (19/11/2026, Tiago: "não precisa mostrar a análise
 * de ticks; isso é info nossa interna. Uma recomendação vale 30 min, depois
 * analisa de novo"). Liberado para todos da GF em 23/11/2026.
 *
 * Por dentro: os 100 ticks do 75 Index que terminam na marca da janela (:00 ou
 * :30), contra a faixa de cada I.A.; a que mais passou do normal é a
 * recomendada. Como a janela é fixa, todo aparelho chega à mesma resposta.
 * Na tela: só a I.A., até quando vale e o botão de ligar. O texto fala do que
 * já aconteceu ("ficou alinhado"), nunca de chance maior: o índice é sorteado
 * (nas leituras de 18/11 a primeira não foi melhor nos 30 min seguintes).
 *
 * Laboratório: `ciclo` (segundos) encurta a janela e lê os ticks mais novos.
 */

/**
 * Quem vê o cartão: todos da GlobalFly desde 23/11/2026 (Tiago: "pode liberar
 * pra todos"). Antes, só o usuário do Tiago. As outras marcas não têm o cartão.
 */
export const recomendacaoLiberada = (email?: string | null) => !!email && FAMILIA_GF

/** Os 100 ticks do 75 Index que terminam em `ate` (segundos) ou os mais novos. A conta mora em core/recomendacao (o servidor usa a mesma). */
async function digitosAte(ate: number | 'latest'): Promise<number[]> {
  const res = await publicSocket.send(pedidoDosTicks(ate))
  return digitosDosPrecos((res.history as { prices?: number[] } | undefined)?.prices ?? [], res.pip_size)
}
const recomendar = ordemDaRecomendacao

const hora = (ms: number) => { const d = new Date(ms); return `${String(d.getHours()).padStart(2, '0')}h${String(d.getMinutes()).padStart(2, '0')}` }
const JANELA = JANELA_DA_RECOMENDACAO_S
const ANALISE_MS = 3200
const CHAVE_VISTA = `${MARCA.id}.recomendacao.vista`
const jaVista = (de: number) => { try { return localStorage.getItem(CHAVE_VISTA) === String(de) } catch { return false } }
const marcarVista = (de: number) => { try { localStorage.setItem(CHAVE_VISTA, String(de)) } catch { /* só agora */ } }

interface Props {
  aoLigar: (id: string) => void
  /** Avisa qual I.A. está recomendada (a frota marca o jato). */
  aoMudar?: (id: string | null) => void
  /** Segundos de validade (laboratório). Padrão: 30 min, nas marcas :00 e :30. */
  ciclo?: number
  /** Quantos membros ligaram a recomendada nesta meia hora (do banco; sem o número, a linha não aparece). */
  membros?: number
}

export function RecomendacaoDaIA({ aoLigar, aoMudar, ciclo, membros }: Props) {
  const [rec, setRec] = useState<{ de: number; ate: number; ordem: IA[] } | null>(null)
  const [fase, setFase] = useState<'analisando' | 'pronta'>('analisando')
  const [roleta, setRoleta] = useState(0)
  const [agora, setAgora] = useState(Date.now())
  const timers = useRef<number[]>([])
  const pedindo = useRef(false)
  const passo = (ciclo ?? JANELA) * 1000

  const rodarRoleta = (alvo: number) => {
    const voltas = 2 * IAS.length + ((alvo - roleta + IAS.length) % IAS.length)
    let t = 0
    timers.current.forEach(clearTimeout); timers.current = []
    for (let i = 1; i <= voltas; i++) {
      const p = i / voltas
      t += 70 + 380 * p * p * p
      timers.current.push(window.setTimeout(() => setRoleta((r) => (r + 1) % IAS.length), t))
    }
    timers.current.push(window.setTimeout(() => setFase('pronta'), Math.max(ANALISE_MS, t + 450)))
  }

  const analisar = async (de: number) => {
    if (pedindo.current) return
    pedindo.current = true
    try {
      const d = await digitosAte(ciclo ? 'latest' : Math.floor(de / 1000))
      if (d.length < MINIMO_DE_TICKS) return
      const ordem = recomendar(d)
      setRec({ de, ate: de + passo, ordem })
      // a roleta só passa quando a recomendação é nova neste aparelho; voltar à Início mostra direto
      if (!ciclo && jaVista(de)) { setRoleta(IAS.indexOf(ordem[0])); setFase('pronta') }
      else { setFase('analisando'); rodarRoleta(IAS.indexOf(ordem[0])) }
      marcarVista(de)
    } catch { /* a Deriv não respondeu: tenta de novo no próximo segundo */ } finally { pedindo.current = false }
  }

  useEffect(() => {
    void analisar(ciclo ? Date.now() : inicioDaJanela(Date.now(), passo))
    const t = window.setInterval(() => setAgora(Date.now()), 250)
    return () => { window.clearInterval(t); timers.current.forEach(clearTimeout) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!rec) { if (agora % 5000 < 250) void analisar(ciclo ? Date.now() : inicioDaJanela(agora, passo)); return }
    if (fase === 'pronta' && agora >= rec.ate) void analisar(rec.ate)
  }, [agora]) // eslint-disable-line react-hooks/exhaustive-deps

  const ia = rec?.ordem[0] ?? null
  const segunda = rec?.ordem[1] ?? null
  const analisando = fase === 'analisando'
  const vista = analisando ? IAS[roleta] : ia
  useEffect(() => { aoMudar?.(!analisando && ia ? ia.id : null) }, [analisando, ia?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const falta = rec ? Math.max(0, rec.ate - agora) : 0
  const resta = rec ? falta / (rec.ate - rec.de) : 1
  const faltaTexto = falta >= 60_000 ? `${Math.ceil(falta / 60_000)} min` : `${Math.ceil(falta / 1000)} s`
  const fotos = useMemo(() => IAS.map((x) => ({ id: x.id, ...fotoDoCartaoAlto(x.id) })), [])

  // profundidade: no computador, a foto e o texto acompanham o mouse de leve (paralaxe)
  const cartao = useRef<HTMLElement>(null)
  const mover = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || !cartao.current) return
    const r = cartao.current.getBoundingClientRect()
    cartao.current.style.setProperty('--rc-mx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3))
    cartao.current.style.setProperty('--rc-my', ((e.clientY - r.top) / r.height - 0.5).toFixed(3))
  }
  const soltar = () => { cartao.current?.style.setProperty('--rc-mx', '0'); cartao.current?.style.setProperty('--rc-my', '0') }

  return (
    <section ref={cartao} className={`rc ${analisando ? 'analisando' : 'pronta'}`} aria-labelledby="rc-titulo" aria-busy={analisando}
      onPointerMove={mover} onPointerLeave={soltar}>
      <span className="rc-fotos" aria-hidden="true">
        {fotos.map((f) => <img key={f.id} src={f.src} srcSet={f.srcSet} sizes="(max-width: 700px) 100vw, 60vw" alt="" loading="lazy" decoding="async" className={vista?.id === f.id ? 'vista' : ''} />)}
        {/* o reflexo do sol no metal: a mesma foto, mais clara e contrastada, só numa faixa que atravessa */}
        {!analisando && vista && (() => { const f = fotos.find((x) => x.id === vista.id); return f ? <img key={`reflexo-${f.id}-${rec?.de ?? 0}`} className="rc-reflexo" src={f.src} srcSet={f.srcSet} sizes="(max-width: 700px) 100vw, 60vw" alt="" decoding="async" /> : null })()}
      </span>
      <i className="rc-veu" aria-hidden="true" />
      <i className="rc-luz" aria-hidden="true" />
      <i className="rc-scan" aria-hidden="true" />
      <i className="rc-grao" aria-hidden="true" />

      <div className="rc-corpo">
        <header className="rc-topo">
          <span id="rc-titulo" className="rc-rotulo"><i aria-hidden="true" /><span><span className="rc-rotulo-ia">I.A. </span>Recomendada agora</span></span>
          {rec && !analisando && (
            <span className="rc-validade" title={`Nova análise em ${faltaTexto}`}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" className="trilho" /><circle cx="10" cy="10" r="8" className="arco" style={{ strokeDashoffset: `${(50.27 * (1 - resta)).toFixed(2)}` }} /></svg>
              Válida até <b>{hora(rec.ate)}</b>
            </span>
          )}
        </header>

        <div className="rc-meio" aria-live="polite">
          {analisando ? (
            <>
              <span className="rc-sobre rc-analisando">Analisando o mercado para a próxima meia hora</span>
              <h3 className="rc-nome roleta" key={roleta}>{vista && <LogotipoDaIA nome={vista.nome} id={vista.id} fio sobreFoto />}</h3>
              <span className="rc-pontos" aria-hidden="true">{IAS.map((x, i) => <i key={x.id} className={i === roleta ? 'aceso' : ''} />)}</span>
            </>
          ) : ia && rec ? (
            <div className="rc-revela" key={rec.de}>
              <span className="rc-sobre">Na análise das {hora(rec.de)}, o mercado ficou alinhado com a estratégia da</span>
              <h3 className="rc-nome"><LogotipoDaIA nome={ia.nome} id={ia.id} fio sobreFoto /></h3>
              <div className="rc-acoes">
                <button type="button" className="in-pilula ouro rc-ligar" onClick={() => aoLigar(ia.id)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>Ligar a {ia.curto}
                </button>
                {segunda && <button type="button" className="in-pilula rc-segunda" onClick={() => aoLigar(segunda.id)}>Também alinhada: <b>{segunda.curto}</b></button>}
              </div>
            </div>
          ) : null}
        </div>

        <footer className="rc-base">
          {membros && !analisando ? <span className="rc-prova"><span className="rc-rostos" aria-hidden="true"><i /><i /><i /></span><b>{membros}</b> membros ligaram a {ia?.curto} nesta meia hora</span> : <span />}
          {rec && !analisando && <span className="rc-falta">Nova análise em <b>{faltaTexto}</b></span>}
        </footer>
      </div>
      {/* a validade escorrendo na base do cartão */}
      <span className="rc-tempo" aria-hidden="true"><i style={{ transform: `scaleX(${analisando ? 1 : resta})` }} /></span>
    </section>
  )
}
