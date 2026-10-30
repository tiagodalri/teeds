import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { OpenContract } from '../../core/deriv/trading'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { useCountdown } from '../PositionCard'
import { naPagina } from '../../core/escala'
import './painel-de-comando.css'

/**
 * O painel de comando flutuante (30/10/2026, Tiago: "quando colocar em tela
 * cheia, o card do painel de comando das operações flutuante aqui, para entrar
 * na operação, comprar, vender").
 *
 * Aparece só com o gráfico do TradingView em tela cheia, por cima dele. Não é
 * uma boleta nova: os botões de Comprar e Vender são os MESMOS da boleta (as
 * mesmas travas, a mesma confirmação da conta real, o mesmo valor e a mesma
 * duração); aqui eles só ganham um corpo compacto que dá para arrastar para
 * qualquer canto e recolher numa pílula. Posição e recolhido ficam guardados
 * neste aparelho. No celular ele encaixa embaixo, na largura da tela.
 */

type Unidade = 't' | 's' | 'm'
const NOME: Record<Unidade, [string, string]> = { t: ['cotação', 'cotações'], s: ['seg', 'seg'], m: ['min', 'min'] }
const DEGRAUS = [0.35, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 2000, 5000]
const CHAVE_POS = 'globalfly.painel.posicao'
const CHAVE_REC = 'globalfly.painel.recolhido'

const ler = <T,>(chave: string, padrao: T): T => { try { const v = localStorage.getItem(chave); return v ? JSON.parse(v) as T : padrao } catch { return padrao } }
const gravar = (chave: string, valor: unknown) => { try { localStorage.setItem(chave, JSON.stringify(valor)) } catch { /* sem armazenamento: vale nesta visita */ } }

export interface PainelDeComandoProps {
  nome: string
  preco: string | null
  direcao: 'up' | 'down' | null
  aberto: boolean
  moeda: string
  /** O valor da entrada (o mesmo da boleta). */
  stake: number
  aoMudarStake: (v: number) => void
  duracao: number
  unidade: Unidade
  faixa: readonly [number, number] | null | undefined
  disponiveis: Record<Unidade, boolean>
  aoMudarDuracao: (d: number) => void
  aoTrocarUnidade: (u: Unidade) => void
  /** Os dois botões da boleta (BotaoCompra), já com toda a lógica. */
  botoes: ReactNode
  /** "Se acertar: até +US$ 9,55 · Fecha às 13:41" (o ResumoDaCompra da boleta). */
  resumo: ReactNode
  saldo: number | null
  /** Etiqueta da conta como a tela mostra ("Real" / "Demo"); null = Deriv desconectada. */
  conta: string | null
  aoConectar: () => void
  conectando: boolean
  posicoes: OpenContract[]
  aoEncerrar: (id: number) => void
  encerrando: number | null
  /** Conta real de verdade: encerrar pede o segundo toque, como na lista. */
  real: boolean
  aviso: { texto: string; tipo: 'ok' | 'erro' } | null
}

export function PainelDeComando(p: PainelDeComandoProps) {
  const caixa = useRef<HTMLDivElement>(null)
  const [recolhido, setRecolhido] = useState<boolean>(() => ler(CHAVE_REC, false))
  const [pos, setPos] = useState<{ x: number; y: number } | null>(() => ler(CHAVE_POS, null))
  const arrasto = useRef<{ dx: number; dy: number; id: number } | null>(null)

  // o painel nunca fica fora da tela (a janela pode ter mudado de tamanho)
  const dentro = (x: number, y: number) => {
    const el = caixa.current
    const w = el?.offsetWidth ?? 300, h = el?.offsetHeight ?? 200
    // medidas da tela em px da página (a escala de 90% do computador, core/escala.ts)
    return { x: Math.min(Math.max(8, x), naPagina(window.innerWidth) - w - 8), y: Math.min(Math.max(8, y), naPagina(window.innerHeight) - h - 8) }
  }
  useEffect(() => {
    const ajustar = () => setPos((atual) => (atual ? dentro(atual.x, atual.y) : atual))
    ajustar()
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [recolhido]) // eslint-disable-line react-hooks/exhaustive-deps

  const pegar = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input')) return
    const r = caixa.current?.getBoundingClientRect()
    if (!r) return
    arrasto.current = { dx: naPagina(e.clientX - r.left), dy: naPagina(e.clientY - r.top), id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const mover = (e: React.PointerEvent) => {
    const a = arrasto.current
    if (!a || a.id !== e.pointerId) return
    setPos(dentro(naPagina(e.clientX) - a.dx, naPagina(e.clientY) - a.dy))
  }
  const soltar = (e: React.PointerEvent) => {
    if (!arrasto.current) return
    arrasto.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    setPos((atual) => { if (atual) gravar(CHAVE_POS, atual); return atual })
  }
  const voltarAoCanto = () => { setPos(null); gravar(CHAVE_POS, null) }
  const recolher = (v: boolean) => { setRecolhido(v); gravar(CHAVE_REC, v) }

  // valor: os mesmos degraus do − e + da boleta; o campo aceita digitar
  const [texto, setTexto] = useState<string | null>(null)
  const passo = (sobe: boolean) => p.aoMudarStake(sobe
    ? DEGRAUS.find((d) => d > p.stake + 1e-9) ?? p.stake
    : [...DEGRAUS].reverse().find((d) => d < p.stake - 1e-9) ?? 0.35)
  const confirmarTexto = () => {
    if (texto === null) return
    const n = Number(texto.replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) p.aoMudarStake(Math.max(0.35, Math.round(n * 100) / 100))
    setTexto(null)
  }
  const [min, max] = p.faixa ?? [1, 1440]
  const passoDur = p.unidade === 's' ? 5 : 1

  const abertas = p.posicoes.filter((c) => !['won', 'lost', 'sold', 'cancelled'].includes(c.status))
  const resultado = abertas.reduce((s, c) => s + c.profit, 0)
  const estilo = pos ? { left: pos.x, top: pos.y, bottom: 'auto' } : undefined

  if (recolhido) {
    return (
      <div ref={caixa} className="pdc-pilula" style={estilo} onPointerDown={pegar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        <span className="pdc-pilula-nome">{p.nome}</span>
        <b className={`pdc-preco ${p.direcao === 'up' ? 'sobe' : p.direcao === 'down' ? 'cai' : ''}`}>{p.preco ?? '—'}</b>
        {abertas.length > 0 && <span className={`pdc-pilula-res ${resultado >= 0 ? 'sobe' : 'cai'}`}>{abertas.length} · {dinheiroComSinal(resultado, p.moeda)}</span>}
        <button type="button" className="pdc-abrir" onClick={() => recolher(false)}>Operar</button>
      </div>
    )
  }

  return (
    <section ref={caixa} className="pdc" style={estilo} aria-label="Painel de comando">
      <header className="pdc-cab" onPointerDown={pegar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
        onDoubleClick={voltarAoCanto} title="Arraste para mover · dois cliques voltam ao canto de baixo">
        <i className="pdc-alca" aria-hidden="true" />
        <div className="pdc-ativo">
          <span>{p.nome}</span>
          <b className={`pdc-preco ${p.direcao === 'up' ? 'sobe' : p.direcao === 'down' ? 'cai' : ''}`}>{p.preco ?? '—'}</b>
        </div>
        {p.conta && <span className={`pdc-conta ${p.conta === 'Real' ? 'real' : ''}`}>{p.conta}{p.saldo !== null && <> · {dinheiro(p.saldo, p.moeda)}</>}</span>}
        <button type="button" className="pdc-recolher" onClick={() => recolher(true)} aria-label="Recolher o painel" title="Recolher">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
      </header>

      {!p.conta ? (
        <div className="pdc-sem">
          <p>Para comprar e vender daqui, conecte a sua conta da Deriv.</p>
          <button type="button" className="pdc-conectar" onClick={p.aoConectar} disabled={p.conectando}>{p.conectando ? 'Conectando…' : 'Conectar a Deriv'}</button>
        </div>
      ) : (
        <>
          <div className="pdc-ajustes">
            <div className="pdc-campo">
              <span className="pdc-rot">Valor</span>
              <div className="pdc-passo">
                <button type="button" onClick={() => passo(false)} disabled={p.stake <= 0.35} aria-label="Diminuir o valor">−</button>
                <label>
                  <small>{p.moeda === 'USD' ? 'US$' : p.moeda}</small>
                  <input type="text" inputMode="decimal" aria-label="Valor da entrada" autoComplete="off"
                    value={texto ?? p.stake.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    onFocus={(e) => { setTexto(e.currentTarget.value); e.currentTarget.select() }}
                    onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, ''))}
                    onBlur={confirmarTexto} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                </label>
                <button type="button" onClick={() => passo(true)} aria-label="Aumentar o valor">+</button>
              </div>
            </div>
            <div className="pdc-campo">
              <span className="pdc-rot">
                Duração
                <span className="pdc-unid" role="group" aria-label="Unidade da duração">
                  {(['t', 's', 'm'] as const).map((u) => (
                    <button key={u} type="button" disabled={!p.disponiveis[u]} className={p.unidade === u ? 'on' : ''} onClick={() => p.aoTrocarUnidade(u)}
                      title={u === 't' ? 'Ticks: cada tick é uma nova cotação' : u === 's' ? 'Segundos' : 'Minutos'}>{u === 't' ? 'T' : u === 's' ? 'S' : 'M'}</button>
                  ))}
                </span>
              </span>
              <div className="pdc-passo">
                <button type="button" onClick={() => p.aoMudarDuracao(Math.max(min, p.duracao - passoDur))} disabled={p.duracao <= min} aria-label="Diminuir a duração">−</button>
                <label><b>{p.duracao}</b><small>{NOME[p.unidade][p.duracao === 1 ? 0 : 1]}</small></label>
                <button type="button" onClick={() => p.aoMudarDuracao(Math.min(max, p.duracao + passoDur))} disabled={p.duracao >= max} aria-label="Aumentar a duração">+</button>
              </div>
            </div>
          </div>

          <div className="pdc-botoes">{p.botoes}</div>
          <div className="pdc-resumo">{p.resumo}</div>
        </>
      )}

      {p.aviso && <p className={`pdc-aviso ${p.aviso.tipo}`} role="status" aria-live="polite">{p.aviso.texto}</p>}

      {abertas.length > 0 && (
        <div className="pdc-posicoes" aria-label="Posições abertas">
          <div className="pdc-posicoes-cab">
            <span>{abertas.length === 1 ? '1 posição aberta' : `${abertas.length} posições abertas`}</span>
            <b className={resultado >= 0 ? 'sobe' : 'cai'}>{dinheiroComSinal(resultado, p.moeda)}</b>
          </div>
          {abertas.slice(0, 3).map((c) => <LinhaDaPosicao key={c.contractId} c={c} moeda={p.moeda} real={p.real} encerrando={p.encerrando === c.contractId} aoEncerrar={p.aoEncerrar} />)}
          {abertas.length > 3 && <small className="pdc-mais">e mais {abertas.length - 3} na lista da boleta</small>}
        </div>
      )}
      {!!p.conta && <small className="pdc-dica">Atalhos: Shift ↑ Comprar · Shift ↓ Vender</small>}
    </section>
  )
}

function LinhaDaPosicao({ c, moeda, real, encerrando, aoEncerrar }: { c: OpenContract; moeda: string; real: boolean; encerrando: boolean; aoEncerrar: (id: number) => void }) {
  const { restante, texto } = useCountdown(c.expiryTime)
  const [armado, setArmado] = useState(false)
  useEffect(() => { if (!armado) return; const t = window.setTimeout(() => setArmado(false), 8000); return () => window.clearTimeout(t) }, [armado])
  const sobe = /^(CALL|CALLE|HIGHER|MULTUP)$/.test(c.contractType)
  const ticks = /_(\d+)T(?:_|$)/.exec(c.shortcode)?.[1]
  const total = Math.max(1, c.expiryTime - c.startTime)
  const progresso = Math.min(100, Math.max(0, ((total - restante) / total) * 100))
  const encerrar = () => { if (real && !armado) { setArmado(true); return } setArmado(false); aoEncerrar(c.contractId) }
  return (
    <div className="pdc-pos">
      <span className={`pdc-pos-dir ${sobe ? 'sobe' : 'cai'}`} aria-label={sobe ? 'Compra' : 'Venda'}>{sobe ? '▲' : '▼'}</span>
      <span className="pdc-pos-tempo">{c.isExpired || (!ticks && restante === 0) ? 'Fechando…' : ticks ? `${ticks} cot.` : texto}</span>
      <b className={c.profit >= 0 ? 'sobe' : 'cai'}>{dinheiroComSinal(c.profit, moeda)}</b>
      {c.isValidToSell && !c.isExpired
        ? <button type="button" className={`pdc-encerrar ${armado ? 'armado' : ''}`} onClick={encerrar} disabled={encerrando}>{encerrando ? '…' : armado ? 'Confirmar' : 'Encerrar'}</button>
        : <span className="pdc-encerrar vazio" aria-hidden="true" />}
      <i className="pdc-pos-barra" style={{ width: `${progresso}%` }} aria-hidden="true" />
    </div>
  )
}
