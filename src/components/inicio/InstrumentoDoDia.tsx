import { useState } from 'react'
import { MASCARA } from '../../core/privacidade'

/**
 * O instrumento do dia (21/10/2026, "painel de bordo" da home): um arco de
 * cabine que vai do limite de perda (coral, à esquerda) até a meta (verde,
 * à direita). O avião de ouro marca o resultado de agora e sobe sempre na
 * diagonal do monograma, nunca "mergulha": é um marcador, não um gráfico.
 *
 * Sem plano, o próprio instrumento vira o formulário (meta e limite, com
 * atalhos), que era o passo da jornada que não tinha onde ser preenchido.
 * Consultivo: nada daqui vai para os robôs.
 */

const R = 120, CX = 150, CY = 150
/** O ponto do arco na fração `p` (0 = começo, à esquerda; 1 = fim, à direita). */
const ponto = (p: number, r = R) => {
  const a = Math.PI * (1 - p)
  return { x: CX + r * Math.cos(a), y: CY - r * Math.sin(a) }
}
const arco = (de: number, ate: number) => {
  const a = ponto(de), b = ponto(ate)
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)} A${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`
}
const n2 = (n: number) => Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
/** "25,50", "1.000,50" e também "10.5" (teclado com ponto): ponto só é milhar quando há vírgula ou 3 dígitos depois. */
const ler = (s: string) => {
  const t = s.trim().replace(/\s/g, '')
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'))
  return /^\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '')) : Number(t)
}
const ATALHOS_META = [10, 25, 50, 100]
const ATALHOS_LIMITE = [5, 15, 25, 50]

interface Props {
  plano: { meta: number; limite: number } | null
  /** Resultado de hoje (null = sem operação ainda). */
  resultado: number | null
  moeda: string
  ocultos: boolean
  /** Só falta este passo na jornada: o cabeçalho avisa. */
  ultimoPasso: boolean
  aoSalvar: (meta: number, limite: number) => void
  aoVerIas: () => void
}

export function InstrumentoDoDia({ plano, resultado, moeda, ocultos, ultimoPasso, aoSalvar, aoVerIas }: Props) {
  const [editando, setEditando] = useState(!plano)
  const [meta, setMeta] = useState(plano ? n2(plano.meta) : '25,00')
  const [limite, setLimite] = useState(plano ? n2(plano.limite) : '15,00')
  const [erro, setErro] = useState<string | null>(null)

  const salvar = (e: React.FormEvent) => {
    e.preventDefault()
    const m = ler(meta), l = ler(limite)
    if (!(m > 0) || !(l > 0) || m > 1_000_000 || l > 1_000_000) { setErro('Informe a meta e o limite em dólar, maiores que zero.'); return }
    setErro(null)
    aoSalvar(m, l)
    setMeta(n2(m)); setLimite(n2(l))
    setEditando(false)
  }

  if (editando || !plano) {
    return (
      <form className="in-instr in-instr-form" onSubmit={salvar} aria-labelledby="in-instr-titulo">
        <header className="in-instr-cab">
          <span id="in-instr-titulo">Plano do dia</span>
          {plano ? <button type="button" className="in-instr-acao" onClick={() => { setErro(null); setEditando(false) }}>Cancelar</button>
            : ultimoPasso && <em>1 passo para fechar a jornada</em>}
        </header>
        <svg className="in-instr-arco vazio" viewBox="0 0 300 150" aria-hidden="true">
          <path d={arco(0, 1)} className="tracejado" />
          {[0, 0.25, 0.75, 1].map((p) => { const a = ponto(p, 134), b = ponto(p, 126); return <line key={p} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="marca" /> })}
          <g transform={`translate(${CX} 30)`}><circle r="17" className="selo" /><g transform="rotate(-32) translate(-11 -7) scale(.34)"><path className="aviao" d={CAMINHO_AVIAO} /></g></g>
          <text x={CX} y="102" className="titulo">Defina o seu destino</text>
          <text x={CX} y="124" className="legenda">quanto buscar e quanto aceitar</text>
          <text x={CX} y="140" className="legenda">perder hoje</text>
        </svg>
        <div className="in-instr-campos">
          <label>
            <span>Meta do dia</span>
            <div className="in-instr-campo"><em>{moeda}</em><input inputMode="decimal" value={meta} onChange={(e) => { setMeta(e.target.value); setErro(null) }} aria-label={`Meta do dia em ${moeda}`} /></div>
            <div className="in-instr-atalhos">{ATALHOS_META.map((v) => <button type="button" key={v} className={ler(meta) === v ? 'on' : ''} onClick={() => setMeta(n2(v))}>{v}</button>)}</div>
          </label>
          <label>
            <span>Limite de perda</span>
            <div className="in-instr-campo"><em>{moeda}</em><input inputMode="decimal" value={limite} onChange={(e) => { setLimite(e.target.value); setErro(null) }} aria-label={`Limite de perda em ${moeda}`} /></div>
            <div className="in-instr-atalhos">{ATALHOS_LIMITE.map((v) => <button type="button" key={v} className={ler(limite) === v ? 'on' : ''} onClick={() => setLimite(n2(v))}>{v}</button>)}</div>
          </label>
        </div>
        {erro && <p className="in-instr-erro" role="alert">{erro}</p>}
        <button type="submit" className="in-instr-salvar">Salvar plano do dia</button>
      </form>
    )
  }

  // ------------------------------------------------ com plano: o arco
  const r = resultado ?? 0
  const total = plano.limite + plano.meta
  const zero = plano.limite / total
  const p = Math.max(0, Math.min(1, (r + plano.limite) / total))
  const aviao = ponto(p)
  const bateu = r >= plano.meta
  const estourou = r <= -plano.limite
  const pctMeta = Math.max(0, Math.round((r / plano.meta) * 100))
  const pctLimite = Math.max(0, Math.round((-r / plano.limite) * 100))
  const estado = bateu ? 'meta' : estourou ? 'limite' : r >= 0 ? 'ganho' : 'perda'
  const frase = ocultos ? 'valores ocultos'
    : bateu ? 'Meta batida. Hora de pousar.'
    : estourou ? 'Limite atingido. Hora de desligar.'
    : resultado === null ? 'Nenhuma operação ainda hoje'
    : r >= 0 ? `${pctMeta}% da meta · faltam ${n2(plano.meta - r)}`
    : `${pctLimite}% do limite usado`

  return (
    <section className={`in-instr ${estado}`} aria-labelledby="in-instr-titulo">
      <header className="in-instr-cab">
        <span id="in-instr-titulo">Plano do dia</span>
        <button type="button" className="in-instr-acao" onClick={() => setEditando(true)}>Editar</button>
      </header>
      <svg className="in-instr-arco" viewBox="0 0 300 172" role="img"
        aria-label={ocultos ? 'Plano do dia, valores ocultos' : `Resultado de hoje ${r < 0 ? 'menos ' : ''}${n2(r)} ${moeda}. Meta ${n2(plano.meta)}, limite ${n2(plano.limite)}. ${frase}.`}>
        {Array.from({ length: 11 }, (_, i) => { const a = ponto(i / 10, 134), b = ponto(i / 10, 126); return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="marca" /> })}
        <path d={arco(0, zero)} className="faixa perda" />
        <path d={arco(zero, 1)} className="faixa ganho" />
        {!ocultos && p > zero + 0.004 && <path d={arco(zero, p)} className="feito ganho" />}
        {!ocultos && p < zero - 0.004 && <path d={arco(p, zero)} className="feito perda" />}
        {(() => { const a = ponto(zero, 134), b = ponto(zero, 108); return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="zero" /> })()}
        <g transform={`translate(${(ocultos ? ponto(zero) : aviao).x.toFixed(2)} ${(ocultos ? ponto(zero) : aviao).y.toFixed(2)})`} className="ponteiro">
          <circle r="17" className="selo" />
          <g transform="rotate(-32) translate(-11 -7) scale(.34)"><path className="aviao" d={CAMINHO_AVIAO} /></g>
        </g>
        <text x={CX} y="112" className={`valor ${ocultos ? '' : r >= 0 ? 'sobe' : 'cai'}`}>{ocultos ? MASCARA : `${r > 0 ? '+' : r < 0 ? '−' : ''}${n2(r)}`}</text>
        <text x={CX} y="136" className="legenda">{frase}</text>
      </svg>
      <div className="in-instr-extremos">
        <div><span>Limite</span><b className="cai">{ocultos ? MASCARA : `−${n2(plano.limite)}`}</b></div>
        {(bateu || estourou) && !ocultos && <button type="button" className="in-instr-ias" onClick={aoVerIas}>Ver minhas I.A.s</button>}
        <div><span>Meta</span><b className="sobe">{ocultos ? MASCARA : `+${n2(plano.meta)}`}</b></div>
      </div>
    </section>
  )
}

/** O mesmo desenho de entrada/Aviao.tsx, como caminho solto para entrar dentro do SVG do arco. */
const CAMINHO_AVIAO = 'M62 20C61.6 18.4 58.5 17.6 54 17.6H38L25 3.5h-4l8 14.3-16 .4-5.5-6.2H5l2 6.6-3 .6v1.6l3 .6-2 6.6h2.5l5.5-6.2 16 .4-8 14.3h4l13-14.1h16c4.5 0 7.6-.8 8-2.4Z'
