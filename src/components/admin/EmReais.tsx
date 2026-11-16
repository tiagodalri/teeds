/**
 * O valor em reais embaixo de cada número em dólar da Visão geral (16/11/2026, Tiago: "o dólar está numa
 * alta, eu preciso criar uma motivação para o time, para que eles enxerguem o valor também em reais...
 * um númerozinho um pouco menor em real embaixo, utilizando a cotação do dia... verdinho com uma setinha
 * para cima" e, em seguida, "somente nos números positivos; nos negativos pode deixar somente em US$").
 *
 * A cotação é a mesma do conversor (ferramentas/cambio.ts): o dólar comercial ao vivo, com a cotação do
 * dia de reserva. Uma leitura só para a tela inteira, relida a cada 5 minutos com a tela à vista. Sem
 * cotação (as duas fontes fora e nada guardado), os reais simplesmente não aparecem: nunca um número
 * inventado.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { buscarCotacoes, cotacoesGuardadas, type Cotacoes } from '../ferramentas/cambio'
import { dinheiro } from '../../core/dinheiro'
import './em-reais.css'

const RELER_MS = 5 * 60_000
let atual: Cotacoes | null = null
let lendo = false
let lidaEm = 0
let relogio = 0
const ouvintes = new Set<() => void>()

function ler() {
  if (lendo || Date.now() - lidaEm < 60_000) return
  lendo = true
  void buscarCotacoes()
    .then((c) => { atual = c; lidaEm = Date.now(); ouvintes.forEach((f) => f()) })
    .catch(() => { window.setTimeout(() => { if (ouvintes.size) ler() }, 30_000) /* fica a última conhecida e tenta de novo */ })
    .finally(() => { lendo = false })
}

function assinar(f: () => void) {
  ouvintes.add(f)
  if (ouvintes.size === 1) {
    if (!atual) atual = cotacoesGuardadas()
    ler()
    relogio = window.setInterval(() => { if (document.visibilityState !== 'hidden') ler() }, RELER_MS)
  }
  return () => {
    ouvintes.delete(f)
    if (!ouvintes.size) window.clearInterval(relogio)
  }
}

/** A cotação em uso (null enquanto não há nenhuma). */
export function useCotacaoDoDolar(): Cotacoes | null {
  return useSyncExternalStore(assinar, () => atual, () => null)
}

/** Quantos reais vale 1 dólar agora (null sem cotação). */
export function useDolar(): number | null {
  const c = useCotacaoDoDolar()
  const v = c?.emReais.USD
  return v && v > 0 ? v : null
}

const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const brlCurto = (v: number) => (v >= 10_000 ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(v))

/** O número que sobe até o valor quando muda, como os números grandes da tela. */
function useSobe(valor: number, ligado: boolean) {
  const [mostrado, setMostrado] = useState(valor)
  const de = useRef(valor)
  useEffect(() => {
    const ini = de.current, fim = Number(valor) || 0
    if (!ligado || ini === fim || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setMostrado(fim); de.current = fim; return }
    let quadro = 0
    const t0 = performance.now(), dur = 900
    const passo = (t: number) => {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3)
      setMostrado(ini + (fim - ini) * e)
      if (k < 1) quadro = requestAnimationFrame(passo); else de.current = fim
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [valor, ligado])
  return ligado ? mostrado : valor
}

/**
 * Só a linha em reais: "↑ R$ 20.386,57", verde. Não aparece para zero, negativo ou sem cotação.
 * `bloco` é a linha solta embaixo de um número grande; sem ele, vai dentro do par <Usd>.
 */
export function Reais({ v, curto, bloco, animado }: { v: number; curto?: boolean; bloco?: boolean; animado?: boolean }) {
  const dolar = useDolar()
  const emReais = (Number(v) || 0) * (dolar ?? 0)
  const mostrado = useSobe(emReais, Boolean(animado))
  if (!dolar || emReais < 0.005) return null
  // <data>, e não <span>: os cartões têm regras soltas para "span" (cor e tamanho) que pegariam o número
  return (
    <data value={emReais.toFixed(2)} className={`vbr-brl${bloco ? ' vbr-bloco' : ''}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10.5V1.8M2.4 5.4 6 1.8l3.6 3.6" /></svg>
      {(curto ? brlCurto : brl)(Math.max(mostrado, 0.01))}
    </data>
  )
}

/** O valor em dólar com os reais logo embaixo (só quando é positivo). `formato` troca o texto do dólar (curto, com sinal). */
export function Usd({ v, formato, curto }: { v: number; formato?: (v: number) => string; curto?: boolean }) {
  const n = Number(v) || 0
  return (
    <data value={n.toFixed(2)} className="vbr">
      {formato ? formato(n) : dinheiro(n, 'USD')}
      <Reais v={n} curto={curto} />
    </data>
  )
}

/** A cotação em uso, numa linha discreta: de onde saem os números em verde. */
export function CotacaoDoDolar() {
  const c = useCotacaoDoDolar()
  const v = c?.emReais.USD
  if (!c || !v) return null
  return (
    <p className="vbr-cotacao">
      <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10.5V1.8M2.4 5.4 6 1.8l3.6 3.6" /></svg>
      Em verde, o valor em reais · dólar {c.fonte === 'ao vivo' ? 'agora' : 'do dia'}: <b>R$ {v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
    </p>
  )
}
