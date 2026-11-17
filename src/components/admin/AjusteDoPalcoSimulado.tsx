import { useEffect, useState } from 'react'
import { AJUSTE_PADRAO, LIMITES, contagem, corrigir, type AjusteSimulado } from '../../core/teeds/compartilhamentoSimulado'

/**
 * Os termômetros do Compartilhamento simulado (16/11/2026): quatro réguas que o admin arrasta (ou digita) e a
 * tela inteira acompanha na hora. Fica dentro do palco, logo abaixo do título; some com o olhinho dos itens de
 * admin. Prefixo cpo-sim-.
 */

const PASSOS = 1000
type Regua = {
  chave: 'clientes' | 'noLucro' | 'lucro' | 'prejuizo'
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
const dinheiro = (v: number) => v < 1000 ? Math.round(v / 5) * 5 : v < 10_000 ? Math.round(v / 50) * 50 : v < 100_000 ? Math.round(v / 100) * 100 : Math.round(v / 500) * 500
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

const REGUAS: Regua[] = [
  { chave: 'clientes', rotulo: 'Clientes', ...log(LIMITES.clientes[0], LIMITES.clientes[1], (v) => v < 100 ? Math.round(v) : v < 1000 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10),
    mostrar: (v) => v.toLocaleString('pt-BR'), ler: numero, editar: (v) => String(v) },
  { chave: 'noLucro', rotulo: 'No lucro',
    valor: (p) => Math.round((LIMITES.noLucro[0] + (LIMITES.noLucro[1] - LIMITES.noLucro[0]) * p / PASSOS) * 100) / 100,
    posicao: (v) => Math.round((v - LIMITES.noLucro[0]) / (LIMITES.noLucro[1] - LIMITES.noLucro[0]) * PASSOS),
    mostrar: (v) => `${Math.round(v * 100)}%`, ler: (t) => numero(t) / 100, editar: (v) => String(Math.round(v * 1000) / 10).replace('.', ',') },
  { chave: 'lucro', rotulo: 'Lucro somado', ...log(LIMITES.lucro[0], LIMITES.lucro[1], dinheiro),
    mostrar: usd, ler: numero, editar: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) },
  { chave: 'prejuizo', rotulo: 'Prejuízo somado', ...log(10, LIMITES.prejuizo[1], dinheiro, true),
    mostrar: usd, ler: numero, editar: (v) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) },
]

export function AjusteDoPalcoSimulado({ ajuste, mudar }: { ajuste: AjusteSimulado; mudar: (a: AjusteSimulado) => void }) {
  const { ganham, perdem, zerados } = contagem(ajuste)
  return <div className="cpo-sim" role="group" aria-label="Ajuste da simulação">
    <div className="cpo-sim-reguas">
      {REGUAS.map((r) => <ReguaDoAjuste key={r.chave} regua={r} valor={ajuste[r.chave]} mudar={(v) => mudar(corrigir({ ...ajuste, [r.chave]: v }))} />)}
    </div>
    <div className="cpo-sim-pe">
      <p><b>{ganham.toLocaleString('pt-BR')}</b> no lucro · <b>{perdem.toLocaleString('pt-BR')}</b> no prejuízo{zerados ? <> · <b>{zerados.toLocaleString('pt-BR')}</b> no zero</> : null}</p>
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
