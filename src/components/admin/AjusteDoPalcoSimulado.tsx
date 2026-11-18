import { useEffect, useState } from 'react'
import { AJUSTE_PADRAO, LIMITES, contagem, corrigir, type AjusteSimulado } from '../../core/teeds/compartilhamentoSimulado'

/**
 * Os termômetros do Compartilhamento simulado (16/11/2026; desde 18/11 oito: clientes, depósitos, negativos, lucro
 * do mês e planos): réguas que o admin arrasta (ou digita) e a
 * tela inteira acompanha na hora. Fica dentro do palco, logo abaixo do título; some com o olhinho dos itens de
 * admin. Prefixo cpo-sim-.
 */

const PASSOS = 1000
type Regua = {
  chave: 'clientes' | 'depMin' | 'depMax' | 'negativos' | 'lucroMin' | 'lucroMax' | 'gold' | 'black'
  rotulo: string
  /** posição da régua (0 a PASSOS) → valor, e o contrário */
  valor: (p: number) => number
  posicao: (v: number) => number
  mostrar: (v: number) => string
  /** texto digitado → valor (NaN quando não dá para ler) */
  ler: (t: string) => number
  editar: (v: number) => string
}

const numero = (t: string) => {
  const limpo = t.replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  const v = Number(limpo)
  return limpo && Number.isFinite(v) ? v : NaN
}
/** régua em escala de log (muito espaço nos valores pequenos, e ainda alcança os grandes) */
function log(min: number, max: number, arred: (v: number) => number, zero = false) {
  const a = zero ? 10 : min
  return {
    valor: (p: number) => (zero && p <= 0 ? 0 : arred(a * Math.pow(max / a, (zero ? (p - 1) / (PASSOS - 1) : p / PASSOS)))),
    posicao: (v: number) => (zero && v <= 0 ? 0 : Math.round((zero ? 1 : 0) + Math.log(Math.max(a, v) / a) / Math.log(max / a) * (zero ? PASSOS - 1 : PASSOS))),
  }
}
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

const pct = (v: number) => `${(Math.round(v * 1000) / 10).toLocaleString('pt-BR')}%`
const lerPct = (t: string) => numero(t) / 100
const editarPct = (v: number) => String(Math.round(v * 1000) / 10).replace('.', ',')
const linear = (min: number, max: number, arred: (v: number) => number) => ({
  valor: (p: number) => arred(min + (max - min) * p / PASSOS),
  posicao: (v: number) => Math.round((v - min) / (max - min) * PASSOS),
})
const deposito = (v: number) => v < 1000 ? Math.round(v / 50) * 50 : v < 10_000 ? Math.round(v / 100) * 100 : Math.round(v / 500) * 500

// 18/11/2026: a simulação parte de cada cliente (depósito, % do mês, negativos e plano)
const REGUAS: Regua[] = [
  { chave: 'clientes', rotulo: 'Clientes', ...log(LIMITES.clientes[0], LIMITES.clientes[1], (v) => v < 100 ? Math.round(v) : v < 1000 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10),
    mostrar: (v) => v.toLocaleString('pt-BR'), ler: numero, editar: (v) => String(v) },
  { chave: 'depMin', rotulo: 'Menor depósito', ...log(LIMITES.dep[0], LIMITES.dep[1], deposito),
    mostrar: usd, ler: numero, editar: (v) => v.toLocaleString('pt-BR') },
  { chave: 'depMax', rotulo: 'Maior depósito', ...log(LIMITES.dep[0], LIMITES.dep[1], deposito),
    mostrar: usd, ler: numero, editar: (v) => v.toLocaleString('pt-BR') },
  { chave: 'negativos', rotulo: 'No negativo', ...linear(0, 200, Math.round),
    mostrar: (v) => `${v.toLocaleString('pt-BR')} ${v === 1 ? 'cliente' : 'clientes'}`, ler: numero, editar: (v) => String(v) },
  { chave: 'lucroMin', rotulo: 'Menor lucro do mês', ...linear(LIMITES.lucro[0], LIMITES.lucro[1], (v) => Math.round(v * 100) / 100),
    mostrar: (v) => `${pct(v)} do capital`, ler: lerPct, editar: editarPct },
  { chave: 'lucroMax', rotulo: 'Maior lucro do mês', ...linear(LIMITES.lucro[0], LIMITES.lucro[1], (v) => Math.round(v * 100) / 100),
    mostrar: (v) => `${pct(v)} do capital`, ler: lerPct, editar: editarPct },
  { chave: 'gold', rotulo: 'No Gold (paga 10%)', ...linear(0, 1, (v) => Math.round(v * 100) / 100),
    mostrar: pct, ler: lerPct, editar: editarPct },
  { chave: 'black', rotulo: 'No Black (paga 5%)', ...linear(0, 1, (v) => Math.round(v * 100) / 100),
    mostrar: pct, ler: lerPct, editar: editarPct },
]

export function AjusteDoPalcoSimulado({ ajuste, mudar }: { ajuste: AjusteSimulado; mudar: (a: AjusteSimulado) => void }) {
  const c = contagem(ajuste)
  const n = (v: number) => v.toLocaleString('pt-BR')
  return <div className="cpo-sim" role="group" aria-label="Ajuste da simulação">
    <div className="cpo-sim-reguas">
      {REGUAS.map((r) => <ReguaDoAjuste key={r.chave} regua={r} valor={ajuste[r.chave]} mudar={(v) => mudar(corrigir({ ...ajuste, [r.chave]: v }))} />)}
    </div>
    <div className="cpo-sim-pe">
      <p><b>{n(c.ganham)}</b> no lucro · <b>{n(c.perdem)}</b> no negativo · <b>{n(c.gold)}</b> Gold · <b>{n(c.black)}</b> Black · <b>{n(c.prestige)}</b> Prestige</p>
      <div>
        <button type="button" onClick={() => mudar({ ...ajuste, semente: (ajuste.semente + 1) >>> 0 })}>
          <svg viewBox="0 0 24 24" aria-hidden><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1.2" /><circle cx="15" cy="15" r="1.2" /><circle cx="15" cy="9" r="1.2" /><circle cx="9" cy="15" r="1.2" /></svg>
          Outros clientes</button>
        <button type="button" onClick={() => mudar({ ...AJUSTE_PADRAO, semente: ajuste.semente })}>Voltar ao padrão</button>
      </div>
    </div>
  </div>
}

function ReguaDoAjuste({ regua, valor, mudar }: { regua: Regua; valor: number; mudar: (v: number) => void }) {
  const [texto, setTexto] = useState(() => regua.editar(valor))
  const [digitando, setDigitando] = useState(false)
  useEffect(() => { if (!digitando) setTexto(regua.editar(valor)) }, [valor, digitando, regua])
  const pos = Math.min(PASSOS, Math.max(0, regua.posicao(valor)))
  const id = `cpo-sim-${regua.chave}`
  const naTela = digitando ? texto : regua.mostrar(valor)
  const confirmar = () => { const v = regua.ler(texto); if (Number.isFinite(v)) mudar(v); setDigitando(false) }
  return <div className="cpo-sim-regua" style={{ ['--pos' as string]: `${pos / PASSOS * 100}%` }}>
    <label htmlFor={id}>{regua.rotulo}</label>
    <input className="cpo-sim-valor" aria-label={`${regua.rotulo} (digitar)`} inputMode="decimal" value={naTela} style={{ ['--ch' as string]: String(Math.max(3, naTela.length)) }}
      onFocus={(e) => { setDigitando(true); setTexto(regua.editar(valor)); requestAnimationFrame(() => e.target.select()) }}
      onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    <input id={id} type="range" min={0} max={PASSOS} step={1} value={pos} aria-valuetext={regua.mostrar(valor)}
      onChange={(e) => mudar(regua.valor(Number(e.target.value)))} />
  </div>
}
