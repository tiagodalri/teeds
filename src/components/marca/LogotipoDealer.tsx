import { useId } from 'react'
import { MARCA } from '../../marca'
import './logotipo-dealer.css'

/**
 * A linha de I.A. de uma marca com símbolo próprio (25/11/2026: Dealer, na Legacy Pro).
 *
 * O símbolo é um D: a haste é da marca; o arco é um mostrador com os 10
 * dígitos do mercado (0 embaixo, 9 em cima) e acendem só os dígitos com que
 * a I.A. ganha. É a lógica operacional desenhada: a Over acende a metade de
 * cima, a Under a de baixo, a Gold só o topo, a Fraction só a base, a Speed
 * quase tudo. Cada I.A. é um material da casa (titânio, cobre, platina, rubi,
 * ouro), que dá a cor dos dígitos acesos e do nome.
 * Mesma geometria do manual (Desktop/Legacy Pro/.trabalho/dealer/dealer.py).
 */
export type IaDaLinha = { variante: string; digitos: number[]; material: string; cor: string; brilho: string; tinta: string }

const CX = 36, CY = 50, R = 36, ESP = 17, VAO = 3.2
const RO = R + ESP / 2, RI = R - ESP / 2
const pt = (a: number, r: number) => [CX + r * Math.cos((a * Math.PI) / 180), CY - r * Math.sin((a * Math.PI) / 180)]
const f = (n: number) => n.toFixed(2)
/** Os 10 segmentos do arco, do dígito 0 (embaixo) ao 9 (em cima). */
export const SEGMENTOS = Array.from({ length: 10 }, (_, d) => {
  const a0 = -90 + d * 18 + VAO / 2, a1 = -90 + (d + 1) * 18 - VAO / 2
  const [x0, y0] = pt(a0, RO), [x1, y1] = pt(a1, RO), [x2, y2] = pt(a1, RI), [x3, y3] = pt(a0, RI)
  return `M${f(x0)} ${f(y0)} A${RO} ${RO} 0 0 0 ${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)} A${RI} ${RI} 0 0 1 ${f(x3)} ${f(y3)} Z`
})
export const HASTE = `M6 ${f(CY - RO)} H${CX - 2} V${f(CY + RO)} H15 L6 ${f(CY + RO - 9)} Z`

export const linhaDaMarca = () => MARCA.linhaDasIas
/** A I.A. desta marca na linha própria, pelo id do robô ou pelo nome ("Dealer Speed"). */
export function iaDaLinha(nome: string, id?: string | null): IaDaLinha | null {
  const l = MARCA.linhaDasIas
  if (!l) return null
  if (id && l.ias[id]) return l.ias[id]
  const v = nome.trim().toLowerCase()
  return Object.values(l.ias).find((ia) => v === `${l.nome} ${ia.variante}`.toLowerCase() || v === ia.variante.toLowerCase()) ?? null
}

export function SimboloDaLinha({ ia, className = '' }: { ia: IaDaLinha; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const acesos = new Set(ia.digitos)
  return (
    <svg className={`ld-simbolo ${className}`} viewBox="2 2 92 96" aria-hidden="true">
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="1" x2="0" y2="0"><stop offset="0" stopColor={ia.cor} /><stop offset="1" stopColor={ia.brilho} /></linearGradient>
        <linearGradient id={`h${uid}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'var(--ld-haste-a)' }} /><stop offset="1" style={{ stopColor: 'var(--ld-haste)' }} /></linearGradient>
        <filter id={`b${uid}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" /></filter>
      </defs>
      {/* estilo em linha: as regras de ícone das telas (svg path { stroke… }) não alcançam */}
      <path d={HASTE} style={{ fill: `url(#h${uid})`, stroke: 'none' }} />
      {SEGMENTOS.map((d, i) => !acesos.has(i) && <path key={i} d={d} style={{ fill: 'var(--ld-apagado)', stroke: 'none' }} />)}
      <g filter={`url(#b${uid})`} opacity=".5">{SEGMENTOS.map((d, i) => acesos.has(i) && <path key={i} d={d} style={{ fill: ia.cor, stroke: 'none' }} />)}</g>
      {SEGMENTOS.map((d, i) => acesos.has(i) && <path key={`a${i}`} d={d} style={{ fill: `url(#g${uid})`, stroke: 'none' }} />)}
    </svg>
  )
}

/** "[D] DEALER SPEED" numa linha, na altura do texto em volta. */
export function LogotipoDaLinha({ ia, fio = false, sobreFoto = false, soNome = false, className = '' }: { ia: IaDaLinha; fio?: boolean; sobreFoto?: boolean; soNome?: boolean; className?: string }) {
  const nome = MARCA.linhaDasIas?.nome ?? ''
  const rotulo = `${nome} ${ia.variante}`
  return (
    <span className={`logo-ia logo-linha ${fio ? 'com-fio' : ''} ${sobreFoto ? 'sobre-foto' : ''} ${className}`} role="img" aria-label={rotulo} title={`${rotulo} · ${ia.material}`}
      style={{ ['--ld-cor' as string]: ia.cor, ['--ld-brilho' as string]: ia.brilho, ['--ld-tinta' as string]: ia.tinta }}>
      {!soNome && <SimboloDaLinha ia={ia} />}
      {fio && !soNome && <span className="logo-ia-fio" aria-hidden="true" />}
      <span className="ld-nome" aria-hidden="true"><b>{nome}</b><i>{ia.variante}</i></span>
    </span>
  )
}
