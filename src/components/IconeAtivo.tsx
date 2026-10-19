/**
 * Ícone redondo de cada ativo, como nas grandes corretoras (19/10/2026,
 * GlobalFly): moeda metálica para Ouro e Prata, duas moedas sobrepostas nos
 * pares de câmbio e um selo com o número nos índices sintéticos. Tudo em SVG
 * (nítido em qualquer tela, sem imagem para baixar).
 */
import { useId } from 'react'

const MOEDAS: Record<string, { cor: string; simbolo: string }> = {
  USD: { cor: '#1F6B4A', simbolo: '$' },
  EUR: { cor: '#1F4AA8', simbolo: '€' },
  GBP: { cor: '#7A1F3D', simbolo: '£' },
  JPY: { cor: '#B5122B', simbolo: '¥' },
  AUD: { cor: '#14306E', simbolo: 'A$' },
  CAD: { cor: '#C4261D', simbolo: 'C$' },
  CHF: { cor: '#D0362A', simbolo: 'Fr' },
  NZD: { cor: '#0E2A5C', simbolo: 'NZ$' },
}

function Moeda({ cx, cy, r, codigo }: { cx: number; cy: number; r: number; codigo: string }) {
  const m = MOEDAS[codigo] ?? { cor: '#29445F', simbolo: codigo.slice(0, 1) }
  const t = m.simbolo.length
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={m.cor} stroke="var(--surface, #fff)" strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r={r - 2.2} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth=".8" />
      <text x={cx} y={cy} dy=".36em" textAnchor="middle" fill="#fff" fontWeight="800"
        fontSize={t > 2 ? r * 0.62 : t > 1 ? r * 0.78 : r * 1.05} fontFamily="Arimo, Arial, sans-serif">{m.simbolo}</text>
    </g>
  )
}

function Metal({ id, claro, medio, escuro, sigla }: { id: string; claro: string; medio: string; escuro: string; sigla: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}-c`} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor={claro} /><stop offset=".55" stopColor={medio} /><stop offset="1" stopColor={escuro} />
        </radialGradient>
        <linearGradient id={`${id}-b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={claro} /><stop offset="1" stopColor={escuro} />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${id}-b)`} />
      <circle cx="16" cy="16" r="12.6" fill={`url(#${id}-c)`} />
      <circle cx="16" cy="16" r="11.2" fill="none" stroke={claro} strokeOpacity=".55" strokeWidth=".7" strokeDasharray="1.2 1.4" />
      <text x="16" y="16" dy=".36em" textAnchor="middle" fill={escuro} fontWeight="800" fontSize="10.5" fontFamily="Arimo, Arial, sans-serif">{sigla}</text>
    </>
  )
}

/** Selo dos índices sintéticos: o número do índice sobre uma onda de volatilidade. */
function Sintetico({ id, numero, segundo }: { id: string; numero: string; segundo: boolean }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#163A78" /><stop offset="1" stopColor="#071636" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill={`url(#${id}-s)`} />
      <circle cx="16" cy="16" r="14.4" fill="none" stroke="#B78D39" strokeOpacity=".55" strokeWidth=".9" />
      <path d="M3.5 19.5 L8 15 L11 18 L15 11.5 L18.5 17 L22 13 L25 16 L28.5 12.5" fill="none" stroke="#9CB1C7" strokeOpacity=".35" strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
      <text x="16" y="16.5" dy=".36em" textAnchor="middle" fill="#F3F0E9" fontWeight="800" fontSize={numero.length > 2 ? 9.5 : 11.5} fontFamily="Arimo, Arial, sans-serif">{numero}</text>
      {segundo && (
        <g>
          <circle cx="25.5" cy="7" r="5" fill="#B78D39" stroke="#071636" strokeWidth="1.2" />
          <text x="25.5" y="7" dy=".35em" textAnchor="middle" fill="#051528" fontWeight="800" fontSize="5.4" fontFamily="Arimo, Arial, sans-serif">1s</text>
        </g>
      )}
    </>
  )
}

export function IconeAtivo({ simbolo, tamanho = 28 }: { simbolo: string; tamanho?: number }) {
  const id = `ia${useId().replace(/[^a-z0-9]/gi, '')}`
  let corpo: JSX.Element
  if (simbolo === 'frxXAUUSD') corpo = <Metal id={id} claro="#F7DE94" medio="#D4A94A" escuro="#7A5A1E" sigla="Au" />
  else if (simbolo === 'frxXAGUSD') corpo = <Metal id={id} claro="#FBFCFD" medio="#B9C1CB" escuro="#5F6874" sigla="Ag" />
  else if (/^frx[A-Z]{6}$/.test(simbolo)) {
    corpo = <><Moeda cx={20.5} cy={20.5} r={10.5} codigo={simbolo.slice(6, 9)} /><Moeda cx={11.5} cy={11.5} r={10.5} codigo={simbolo.slice(3, 6)} /></>
  } else {
    // R_75 (Volatility 75), 1HZ75V (Volatility 75 (1s)) e afins
    const numero = simbolo.match(/^1HZ(\d+)V$/)?.[1] ?? simbolo.match(/(\d+)/)?.[1] ?? '?'
    corpo = <Sintetico id={id} numero={numero} segundo={/^1HZ/.test(simbolo)} />
  }
  return <svg className="icone-ativo" width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true">{corpo}</svg>
}
