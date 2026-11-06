import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { IconeFechar } from '../IconeFechar'
import { MOEDAS, buscarCotacoes, converter, cotacoesGuardadas, type Cotacoes } from './cambio'
import { limpar, mostrar, mostrarDigitado, paraNumero, resolver, type Operador, type Pedaco } from './conta'
import './ferramentas.css'

/*
  Conversor de moedas e calculadora (06/11/2026, ideia do Victor Cordeiro).
  No computador, dois botões no topo, à esquerda da tela cheia, no mesmo
  desenho redondo. No celular o topo não tem espaço: os dois entram no menu
  do avatar (UserMenu), que abre a mesma janela por abrirFerramenta().
*/

export type Ferramenta = 'cambio' | 'calculadora'

let aberta: Ferramenta | null = null
const ouvintes = new Set<() => void>()
export function abrirFerramenta(f: Ferramenta | null) { aberta = f; ouvintes.forEach((o) => o()) }
function useFerramentaAberta() {
  return useSyncExternalStore((o) => { ouvintes.add(o); return () => { ouvintes.delete(o) } }, () => aberta, () => null)
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

/** Os dois botões do topo + a janela que eles abrem (a janela vale também para o menu do celular). */
export function BotoesDeFerramentas() {
  const f = useFerramentaAberta()
  return (
    <>
      <button type="button" className="tema-btn ferramenta-btn" onClick={() => abrirFerramenta('cambio')}
        title="Conversor de moedas" aria-label="Conversor de moedas" aria-haspopup="dialog" aria-pressed={f === 'cambio'}>
        <IconeCifrao />
      </button>
      <button type="button" className="tema-btn ferramenta-btn" onClick={() => abrirFerramenta('calculadora')}
        title="Calculadora" aria-label="Calculadora" aria-haspopup="dialog" aria-pressed={f === 'calculadora'}>
        <IconeCalculadora />
      </button>
      {f && (
        <JanelaDaFerramenta titulo={f === 'cambio' ? 'Conversor de moedas' : 'Calculadora'}
          icone={f === 'cambio' ? <IconeCifrao /> : <IconeCalculadora />} largura={f === 'cambio' ? 420 : 340}
          onFechar={() => abrirFerramenta(null)}>
          {f === 'cambio' ? <ConversorDeMoedas /> : <Calculadora />}
        </JanelaDaFerramenta>
      )}
    </>
  )
}

function JanelaDaFerramenta({ titulo, icone, largura, onFechar, children }: { titulo: string; icone: ReactNode; largura: number; onFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    ref.current?.showModal()
    return () => { ref.current?.close(); if (antes?.isConnected) antes.focus() }
  }, [])
  const janela = (
    <dialog ref={ref} className="ferr-janela" aria-label={titulo} style={{ width: `min(${largura}px, calc(100vw - 24px))` }}
      onCancel={(e) => { e.preventDefault(); onFechar() }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <div className="ferr-caixa">
        <header className="ferr-topo">
          <span className="ferr-selo" aria-hidden>{icone}</span>
          <h2>{titulo}</h2>
          <button type="button" className="ferr-fechar" onClick={onFechar} aria-label="Fechar"><IconeFechar /></button>
        </header>
        {children}
      </div>
    </dialog>
  )
  return createPortal(janela, document.body)
}

/* ------------------------------ conversor ------------------------------ */

const CHAVE_PAR = 'gf.conversor.par'
function parGuardado(): { de: string; para: string } {
  try { const v = JSON.parse(localStorage.getItem(CHAVE_PAR) || 'null'); if (v?.de && v?.para) return v } catch { /* ok */ }
  return { de: 'BRL', para: 'USD' }
}
const moeda = (c: string) => MOEDAS.find((m) => m.codigo === c) ?? MOEDAS[0]
function dinheiro(v: number, codigo: string) {
  const m = moeda(codigo)
  const casas = m.casas === 0 && Math.abs(v) < 100 ? 2 : m.casas
  return v.toLocaleString('pt-BR', { minimumFractionDigits: Math.min(2, casas), maximumFractionDigits: casas })
}
function taxa(v: number) {
  const casas = v >= 100 ? 2 : v >= 1 ? 4 : v >= 0.01 ? 4 : 6
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

function ConversorDeMoedas() {
  const [cot, setCot] = useState<Cotacoes | null>(() => cotacoesGuardadas())
  const [erro, setErro] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [par, setPar] = useState(parGuardado)
  const [texto, setTexto] = useState('100')
  const [copiado, setCopiado] = useState(false)

  const atualizar = useCallback(async () => {
    setBuscando(true)
    try { setCot(await buscarCotacoes()); setErro(false) } catch { setErro(true) } finally { setBuscando(false) }
  }, [])
  // na abertura e a cada minuto enquanto a janela está aberta
  useEffect(() => {
    void atualizar()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void atualizar() }, 60_000)
    return () => window.clearInterval(t)
  }, [atualizar])
  useEffect(() => { try { localStorage.setItem(CHAVE_PAR, JSON.stringify(par)) } catch { /* ok */ } }, [par])

  const valor = lerValor(texto)
  const resultado = cot && Number.isFinite(valor) ? converter(valor, par.de, par.para, cot) : null
  const um = cot ? converter(1, par.de === 'BRL' ? par.para : par.de, 'BRL', cot) : null
  const base = par.de === 'BRL' ? par.para : par.de
  const outras = useMemo(() => ['USD', 'EUR', 'BRL', 'GBP'].filter((c) => c !== par.de && c !== par.para).slice(0, 2), [par])
  const variacao = cot?.variacao[base]
  const hora = cot ? new Date(cot.quando) : null

  const inverter = () => setPar((p) => ({ de: p.para, para: p.de }))
  const copiar = () => {
    if (resultado == null) return
    void navigator.clipboard?.writeText(dinheiro(resultado, par.para)).then(() => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1400) }).catch(() => undefined)
  }

  return (
    <div className="ferr-corpo cnv">
      <label className="cnv-linha" htmlFor="cnv-valor">
        <span className="cnv-rotulo">Valor</span>
        <div className="cnv-campo">
          <span className="cnv-simbolo">{moeda(par.de).simbolo}</span>
          <input id="cnv-valor" inputMode="decimal" autoComplete="off" value={texto} autoFocus
            onChange={(e) => setTexto(e.target.value.replace(/[^\d.,]/g, ''))} aria-invalid={!Number.isFinite(valor)} />
          <SeletorDeMoeda id="cnv-de" valor={par.de} rotulo="Converter de" onChange={(de) => setPar((p) => ({ de, para: de === p.para ? p.de : p.para }))} />
        </div>
      </label>

      <div className="cnv-meio">
        <span />
        <button type="button" className="cnv-inverter" onClick={inverter} title="Inverter as moedas" aria-label="Inverter as moedas">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 4v16M3 8l4-4 4 4M17 20V4M21 16l-4 4-4-4" /></svg>
        </button>
        <span />
      </div>

      <div className="cnv-linha">
        <span className="cnv-rotulo">Para</span>
        <div className="cnv-resultado" aria-live="polite">
          <div className="cnv-numero">
            <span className="cnv-simbolo">{moeda(par.para).simbolo}</span>
            <strong>{resultado == null ? (Number.isFinite(valor) ? '—' : 'Valor inválido') : dinheiro(resultado, par.para)}</strong>
          </div>
          <SeletorDeMoeda id="cnv-para" valor={par.para} rotulo="Converter para" onChange={(para) => setPar((p) => ({ para, de: para === p.de ? p.para : p.de }))} />
        </div>
      </div>

      {resultado != null && (
        <div className="cnv-acoes">
          <button type="button" className="cnv-copiar" onClick={copiar}>{copiado ? 'Copiado' : 'Copiar valor'}</button>
          {cot && outras.map((c) => {
            const v = converter(valor, par.de, c, cot)
            return v == null ? null : <span key={c} className="cnv-outra"><em>{c}</em> {dinheiro(v, c)}</span>
          })}
        </div>
      )}

      <footer className="cnv-cotacao">
        {um != null && base !== 'BRL' ? (
          <p className="cnv-taxa">
            <span>1 {base} = <b>R$ {taxa(um)}</b></span>
            {typeof variacao === 'number' && <span className={variacao >= 0 ? 'cnv-sobe' : 'cnv-desce'}>{variacao >= 0 ? '▲' : '▼'} {Math.abs(variacao).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% hoje</span>}
          </p>
        ) : !cot && !erro ? <p className="cnv-taxa">Buscando a cotação de agora…</p> : null}
        <p className="cnv-fonte">
          {erro && !cot ? 'Não deu para buscar a cotação agora. Toque em Atualizar para tentar de novo.'
            : erro ? 'Sem conexão com a cotação agora: mostrando a última conhecida.'
            : hora ? `${cot?.fonte === 'ao vivo' ? 'Cotação comercial ao vivo' : 'Cotação do dia'} · ${hora.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            : ''}
          <button type="button" className="cnv-atualizar" onClick={() => void atualizar()} disabled={buscando}>{buscando ? 'Atualizando…' : 'Atualizar'}</button>
        </p>
      </footer>
    </div>
  )
}

function SeletorDeMoeda({ id, valor, rotulo, onChange }: { id: string; valor: string; rotulo: string; onChange: (c: string) => void }) {
  return (
    <span className="cnv-seletor">
      <select id={id} value={valor} aria-label={rotulo} onChange={(e) => onChange(e.target.value)}>
        {MOEDAS.map((m) => <option key={m.codigo} value={m.codigo}>{m.codigo} · {m.nome}</option>)}
      </select>
      <span className="cnv-seletor-rosto" aria-hidden><b>{valor}</b><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4.5l3 3 3-3" /></svg></span>
    </span>
  )
}

/* ------------------------------ calculadora ------------------------------ */

function T({ r, on, cls = '', label }: { r: ReactNode; on: () => void; cls?: string; label?: string }) {
  return <button type="button" className={`calc-tecla ${cls}`} onClick={on} aria-label={label}>{r}</button>
}

const OPS: Record<string, Operador> = { '+': '+', '-': '−', '*': '×', x: '×', X: '×', '/': '÷', '÷': '÷', '×': '×', '−': '−' }

function Calculadora() {
  // a conta em andamento: os pedaços já fechados + o número que está sendo digitado
  const [fila, setFila] = useState<Pedaco[]>([])
  const [digitando, setDigitando] = useState('')
  const [feita, setFeita] = useState<{ conta: string; resultado: number | null } | null>(null)
  const [copiado, setCopiado] = useState(false)

  const filaCompleta = (): Pedaco[] => (digitando !== '' ? [...fila, { tipo: 'num', texto: digitando }] : fila)
  const textoDaConta = (p: Pedaco[]) => p.map((x) => (x.tipo === 'num' ? mostrarDigitado(x.texto) : x.op)).join(' ')

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
      // continua a partir do resultado
      if (feita.resultado == null) return
      setFila([{ tipo: 'num', texto: String(feita.resultado).replace('.', ',') }, { tipo: 'op', op }])
      setFeita(null); setDigitando(''); return
    }
    if (digitando !== '') { setFila((f) => [...f, { tipo: 'num', texto: digitando }, { tipo: 'op', op }]); setDigitando(''); return }
    // troca o operador do fim; sem número nenhum, começa do zero
    setFila((f) => (f.length ? [...f.slice(0, -1), { tipo: 'op', op }] : [{ tipo: 'num', texto: '0' }, { tipo: 'op', op }]))
  }
  const igual = () => {
    const p = filaCompleta()
    if (!p.length || feita) return
    setFeita({ conta: textoDaConta(p), resultado: resolver(p) })
    setFila([]); setDigitando('')
  }
  const limparTudo = () => { setFila([]); setDigitando(''); setFeita(null) }
  const apagar = () => {
    if (feita) { limparTudo(); return }
    if (digitando !== '') { setDigitando((t) => (t.length <= 1 || t === '-0' ? '' : t.slice(0, -1).replace(/^-$/, ''))); return }
    setFila((f) => f.slice(0, -1))
  }
  const trocarSinal = () => {
    if (feita && feita.resultado != null) { const r = -feita.resultado; setFeita(null); setFila([]); setDigitando(String(r).replace('.', ',')); return }
    setDigitando((t) => (t === '' ? '-' : t.startsWith('-') ? t.slice(1) : '-' + t))
  }
  /** % como na calculadora do celular: 200 + 10% = 220; sozinho, divide por 100. */
  const porcento = () => {
    if (feita && feita.resultado != null) { const r = limpar(feita.resultado / 100); setFeita(null); setFila([]); setDigitando(String(r).replace('.', ',')); return }
    if (digitando === '') return
    const n = paraNumero(digitando)
    const ult = fila[fila.length - 1]
    let v = n / 100
    if (ult?.tipo === 'op' && (ult.op === '+' || ult.op === '−')) { const esq = resolver(fila.slice(0, -1)); if (esq != null) v = esq * n / 100 }
    setDigitando(String(limpar(v)).replace('.', ','))
  }

  // teclado do computador enquanto a janela está aberta
  const acoes = useRef({ digito, operador, igual, limparTudo, apagar, porcento })
  acoes.current = { digito, operador, igual, limparTudo, apagar, porcento }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const a = acoes.current, k = e.key
      if (/^\d$/.test(k)) a.digito(k)
      else if (k === ',' || k === '.') a.digito(',')
      else if (OPS[k]) a.operador(OPS[k])
      else if (k === 'Enter' || k === '=') a.igual()
      else if (k === 'Backspace') a.apagar()
      else if (k === 'Delete' || k === 'c' || k === 'C') a.limparTudo()
      else if (k === '%') a.porcento()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])

  const previa = !feita && fila.length ? resolver(filaCompleta()) : null
  const visor = feita ? (feita.resultado == null ? 'Não dá para dividir por zero' : mostrar(feita.resultado)) : mostrarDigitado(digitando || (fila.length ? '' : '0'))
  const linhaDeCima = feita ? `${feita.conta} =` : textoDaConta(fila)
  const copiar = () => {
    const v = feita?.resultado ?? (digitando ? paraNumero(digitando) : previa)
    if (v == null) return
    void navigator.clipboard?.writeText(mostrar(v)).then(() => { setCopiado(true); window.setTimeout(() => setCopiado(false), 1400) }).catch(() => undefined)
  }

  return (
    <div className="ferr-corpo calc">
      <div className="calc-visor" aria-live="polite">
        <span className="calc-conta">{linhaDeCima || ' '}</span>
        <strong className={`calc-valor ${visor.length > 14 ? 'calc-longo' : ''} ${feita?.resultado == null && feita ? 'calc-erro' : ''}`} onClick={copiar} title="Copiar">{visor || mostrarDigitado('')}</strong>
        <span className="calc-previa">{copiado ? 'Copiado' : previa != null && digitando !== '' ? `= ${mostrar(previa)}` : ' '}</span>
      </div>
      <div className="calc-teclas">
        <T r="C" on={limparTudo} cls="calc-fn" label="Limpar" />
        <T r={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 5h11v14H9l-6-7z" /><path d="M12.5 9.5l5 5M17.5 9.5l-5 5" /></svg>} on={apagar} cls="calc-fn" label="Apagar" />
        <T r="%" on={porcento} cls="calc-fn" label="Porcentagem" />
        <T r="÷" on={() => operador('÷')} cls="calc-op" label="Dividir" />
        {['7', '8', '9'].map((d) => <T key={d} r={d} on={() => digito(d)} />)}
        <T r="×" on={() => operador('×')} cls="calc-op" label="Multiplicar" />
        {['4', '5', '6'].map((d) => <T key={d} r={d} on={() => digito(d)} />)}
        <T r="−" on={() => operador('−')} cls="calc-op" label="Subtrair" />
        {['1', '2', '3'].map((d) => <T key={d} r={d} on={() => digito(d)} />)}
        <T r="+" on={() => operador('+')} cls="calc-op" label="Somar" />
        <T r="±" on={trocarSinal} label="Trocar o sinal" />
        <T r="0" on={() => digito('0')} />
        <T r="," on={() => digito(',')} label="Vírgula" />
        <T r="=" on={igual} cls="calc-igual" label="Igual" />
      </div>
    </div>
  )
}
