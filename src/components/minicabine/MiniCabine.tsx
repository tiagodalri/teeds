import { useEffect, useRef, useState } from 'react'
import { verNoServidor, type SessaoViva } from '../../core/teeds/servidorRobos'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { MASCARA, useValoresOcultos } from '../../core/privacidade'
import { NomeDoRobo } from '../NomeDoRobo'
import { MARCA } from '../../marca'
import './mini-cabine.css'

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
}

type Aviso = { id: string; nome: string; tipo: 'meta' | 'limite' | 'fim'; texto: string; valor: string }
const CHAVE = `${MARCA.id}.miniCabine.aberta`
const lerAberta = () => { try { return localStorage.getItem(CHAVE) === '1' } catch { return false } }
const numero = (n: number) => Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const comSinal = (n: number, moeda: string) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${moeda ? `${moeda} ` : ''}${numero(n)}`

const I = {
  abrir: 'M6 15l6-6 6 6',
  fechar: 'M6 9l6 6 6-6',
  seta: 'M9 6l6 6-6 6',
  parar: 'M7 7h10v10H7z',
  meta: 'M5 12.5l4.2 4.2L19 7',
  limite: 'M12 8v5M12 16.5h.01M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  x: 'M6 6l12 12M18 6L6 18',
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

export function MiniCabine({ sessoes, sessao, aoAbrirCabine, aoParar }: Props) {
  const ocultos = useValoresOcultos()
  const [aberta, setAberta] = useState(lerAberta)
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
  const moeda = vivas[0]?.moeda ?? sessoes[0]?.moeda ?? 'USD'
  const total = vivas.reduce((t, s) => t + s.estado.resultado, 0)
  const metaTotal = vivas.reduce((t, s) => t + (s.config.takeProfit || 0), 0)
  const pctMeta = metaTotal > 0 ? Math.max(0, total) / metaTotal : 0
  const v = (n: number) => (ocultos ? `${moeda} ${MASCARA}` : comSinal(n, moeda))

  async function parar(id: string) {
    if (!aoParar) return
    setParando(id)
    try { await aoParar(id) } finally { setParando(null); setConfirmar(null) }
  }

  return (
    <div className={`mcb ${aberta ? 'aberta' : ''}`}>
      {/* avisos: meta, limite, fim */}
      {avisos.slice(0, 2).map((a) => (
        <div key={a.id} className={`mcb-aviso ${a.tipo}`} role="status">
          <span className="mcb-aviso-icone"><Ic d={a.tipo === 'meta' ? I.meta : a.tipo === 'limite' ? I.limite : I.parar} /></span>
          <span><b><NomeDoRobo nome={a.nome} /> {a.texto}</b><small>Resultado da sessão: {ocultos ? `${moeda} ${MASCARA}` : a.valor}</small></span>
          <button type="button" onClick={() => setAvisos((l) => l.filter((x) => x.id !== a.id))} aria-label="Fechar aviso"><Ic d={I.x} /></button>
        </div>
      ))}

      {vivas.length > 0 && (aberta ? (
        // ------------------------------------------------ aberta
        <section className="mcb-cartao" aria-label="I.A.s operando">
          <header className="mcb-topo">
            <span className="mcb-vivo"><i aria-hidden="true" />{vivas.length === 1 ? '1 I.A. operando' : `${vivas.length} I.A.s operando`}</span>
            <b className={ocultos ? '' : total >= 0 ? 'sobe' : 'cai'}>{v(total)}</b>
            <button type="button" className="mcb-icone" onClick={() => setAberta(false)} aria-label="Recolher"><Ic d={I.fechar} /></button>
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
                    <img src={`${import.meta.env.BASE_URL}robos-globalfly/${s.roboId}-pequena.webp`} alt="" onError={(ev) => { ev.currentTarget.style.visibility = 'hidden' }} />
                    <span className="mcb-robo-nome">
                      <b><NomeDoRobo nome={s.roboNome} /></b>
                      <small className={e.emOperacao ? 'operando' : ''}><i aria-hidden="true" />{e.emOperacao ? 'Em operação' : 'Lendo o mercado'} · {s.demo ? 'Demo' : 'Real'}</small>
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
                      <div><span>Meta {ocultos ? '' : `${moeda} ${numero(s.config.takeProfit)}`}</span><i className="sobe"><u style={{ width: `${pct * 100}%` }} /></i></div>
                      <div><span>Limite {ocultos ? '' : `${moeda} ${numero(s.config.stopLoss)}`}</span><i className="cai"><u style={{ width: `${pctLim * 100}%` }} /></i></div>
                    </div>
                  )}
                  {confirmar === s.id ? (
                    <div className="mcb-confirmar">
                      <span>Parar <NomeDoRobo nome={s.roboNome} />?</span>
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
        <button type="button" className={`mcb-pilula ${pulso ? (pulso.lucro >= 0 ? 'ganho' : 'perda') : ''}`} key={pulso?.chave ?? 'p'}
          onClick={() => setAberta(true)} aria-label={`${vivas.length} I.A.s operando, resultado ${ocultos ? 'oculto' : comSinal(total, moeda)}. Abrir.`}>
          <span className="mcb-vivo"><i aria-hidden="true" /><span>{vivas.length === 1 ? '1 I.A.' : `${vivas.length} I.A.s`}</span></span>
          <span className="mcb-sep" aria-hidden="true" />
          <b className={ocultos ? '' : total >= 0 ? 'sobe' : 'cai'}>{v(total)}</b>
          {pulso && !ocultos && <em className={pulso.lucro >= 0 ? 'sobe' : 'cai'}>{comSinal(pulso.lucro, '')}</em>}
          {metaTotal > 0 && <span className="mcb-meta" title={`${Math.round(pctMeta * 100)}% da meta`}><Anel pct={pctMeta} /></span>}
          <span className="mcb-abrir"><Ic d={I.abrir} /></span>
        </button>
      ))}
    </div>
  )
}
