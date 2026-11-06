import { useId, type ReactNode } from 'react'

/*
  Bandeiras redondas em vetor (06/11/2026). Emoji de bandeira não aparece no
  Windows (vira "US", "BR"), então cada uma é desenhada aqui, num quadro de
  32 × 32 recortado em círculo, simplificada para ler bem pequena.
*/

/** Os pontos de uma estrela de 5 pontas. */
function estrela(cx: number, cy: number, r: number, giro = -90): string {
  const p: string[] = []
  for (let i = 0; i < 10; i++) {
    const raio = i % 2 ? r * 0.42 : r
    const a = ((giro + i * 36) * Math.PI) / 180
    p.push(`${(cx + raio * Math.cos(a)).toFixed(2)},${(cy + raio * Math.sin(a)).toFixed(2)}`)
  }
  return p.join(' ')
}

function UniaoJack({ escala = 1 }: { escala?: number }) {
  return (
    <g transform={`scale(${escala})`}>
      <rect width="32" height="32" fill="#012169" />
      <path d="M0 0L32 32M32 0L0 32" stroke="#fff" strokeWidth="6.4" />
      <path d="M0 0L32 32M32 0L0 32" stroke="#C8102E" strokeWidth="2.2" />
      <path d="M16 0V32M0 16H32" stroke="#fff" strokeWidth="9" />
      <path d="M16 0V32M0 16H32" stroke="#C8102E" strokeWidth="5.2" />
    </g>
  )
}

const DESENHOS: Record<string, () => ReactNode> = {
  USD: () => (
    <>
      <rect width="32" height="32" fill="#fff" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} y={i * 4.92} width="32" height="2.46" fill="#B22234" />)}
      <rect width="15.5" height="17.2" fill="#3C3B6E" />
      {Array.from({ length: 12 }, (_, i) => <circle key={i} cx={2.4 + (i % 4) * 3.5 + (Math.floor(i / 4) % 2) * 1.7} cy={2.6 + Math.floor(i / 4) * 4.6} r=".8" fill="#fff" />)}
    </>
  ),
  BRL: () => (
    <>
      <rect width="32" height="32" fill="#009C3B" />
      <polygon points="16,4.5 29.5,16 16,27.5 2.5,16" fill="#FFDF00" />
      <circle cx="16" cy="16" r="6.4" fill="#002776" />
      <path d="M9.8 14.6c4.2-.9 8.6-.4 12.4 1.6" stroke="#fff" strokeWidth="1.3" fill="none" />
    </>
  ),
  EUR: () => (
    <>
      <rect width="32" height="32" fill="#003399" />
      {Array.from({ length: 12 }, (_, i) => { const a = (i * 30 * Math.PI) / 180; return <polygon key={i} points={estrela(16 + 8.4 * Math.cos(a), 16 + 8.4 * Math.sin(a), 1.55)} fill="#FFCC00" /> })}
    </>
  ),
  GBP: () => <UniaoJack />,
  CHF: () => (
    <>
      <rect width="32" height="32" fill="#DA291C" />
      <rect x="13.4" y="7.5" width="5.2" height="17" fill="#fff" />
      <rect x="7.5" y="13.4" width="17" height="5.2" fill="#fff" />
    </>
  ),
  CAD: () => (
    <>
      <rect width="32" height="32" fill="#fff" />
      <rect width="8" height="32" fill="#D52B1E" /><rect x="24" width="8" height="32" fill="#D52B1E" />
      <path d="M16 8.2l1.4 2.7 1.6-.6-.5 3.8 2.3-2 .5 1.2 2.1-.4-.8 2.4 1 .5-4 3.2.5 1.6-3.6-.6v3.4h-1v-3.4l-3.6.6.5-1.6-4-3.2 1-.5-.8-2.4 2.1.4.5-1.2 2.3 2-.5-3.8 1.6.6z" fill="#D52B1E" />
    </>
  ),
  AUD: () => (
    <>
      <rect width="32" height="32" fill="#012169" />
      <svg x="0" y="0" width="16" height="16" viewBox="0 0 32 32" overflow="hidden"><UniaoJack /></svg>
      <polygon points={estrela(8, 23.5, 3.4)} fill="#fff" />
      <polygon points={estrela(23.5, 7.5, 1.6)} fill="#fff" /><polygon points={estrela(19.5, 15, 1.6)} fill="#fff" />
      <polygon points={estrela(27, 13.5, 1.6)} fill="#fff" /><polygon points={estrela(23.5, 25, 1.9)} fill="#fff" />
    </>
  ),
  JPY: () => (<><rect width="32" height="32" fill="#fff" /><circle cx="16" cy="16" r="7.2" fill="#BC002D" /></>),
  CNY: () => (
    <>
      <rect width="32" height="32" fill="#DE2910" />
      <polygon points={estrela(10, 11, 4.6)} fill="#FFDE00" />
      <polygon points={estrela(17.5, 5.8, 1.5, -60)} fill="#FFDE00" /><polygon points={estrela(20.5, 9.2, 1.5, -40)} fill="#FFDE00" />
      <polygon points={estrela(20.5, 13.6, 1.5, -20)} fill="#FFDE00" /><polygon points={estrela(17.5, 16.8, 1.5, 0)} fill="#FFDE00" />
    </>
  ),
  ARS: () => (
    <>
      <rect width="32" height="32" fill="#74ACDF" />
      <rect y="10.7" width="32" height="10.6" fill="#fff" />
      <circle cx="16" cy="16" r="3.2" fill="#F6B40E" stroke="#85340A" strokeWidth=".5" />
    </>
  ),
  MXN: () => (
    <>
      <rect width="32" height="32" fill="#fff" />
      <rect width="10.7" height="32" fill="#006847" /><rect x="21.3" width="10.7" height="32" fill="#CE1126" />
      <circle cx="16" cy="16" r="3.4" fill="none" stroke="#5C3A1A" strokeWidth="1.2" /><path d="M13.6 17.6c1.5 1.2 3.3 1.2 4.8 0" stroke="#006847" strokeWidth="1" fill="none" />
    </>
  ),
  CLP: () => (
    <>
      <rect width="32" height="32" fill="#fff" />
      <rect y="16" width="32" height="16" fill="#D52B1E" />
      <rect width="14" height="16" fill="#0039A6" />
      <polygon points={estrela(7, 8, 3.6)} fill="#fff" />
    </>
  ),
  BTC: () => (
    <>
      <rect width="32" height="32" fill="#F7931A" />
      <text x="16" y="22.6" textAnchor="middle" fontSize="19" fontWeight="800" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" transform="rotate(12 16 16)">₿</text>
    </>
  ),
}

/** A cor que a moeda "acende" no cartão (a luz que sai do canto, como na Deriv). */
export const COR_DA_MOEDA: Record<string, string> = {
  USD: '#B22234', BRL: '#009C3B', EUR: '#1f4fd1', GBP: '#C8102E', CHF: '#DA291C', CAD: '#D52B1E', AUD: '#1b3a8a',
  JPY: '#BC002D', CNY: '#DE2910', ARS: '#74ACDF', MXN: '#006847', CLP: '#0039A6', BTC: '#F7931A',
}

/**
 * A moeda em 3D (06/11/2026, no estilo dos ícones da Deriv que o Tiago mandou):
 * a bandeira cunhada numa moeda de metal, levemente de lado, com a espessura
 * aparecendo na direita, borda prateada, brilho em cima e sombra embaixo.
 */
export function Moeda({ codigo, tamanho = 44 }: { codigo: string; tamanho?: number }) {
  const id = useId().replace(/:/g, '')
  const desenho = DESENHOS[codigo]
  return (
    <svg className="moeda-3d" width={tamanho} height={tamanho} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`aro${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".35" stopColor="#d9dee5" /><stop offset=".62" stopColor="#8d96a3" /><stop offset=".82" stopColor="#e9edf2" /><stop offset="1" stopColor="#6f7884" />
        </linearGradient>
        <linearGradient id={`lado${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5d6672" /><stop offset=".5" stopColor="#c9cfd7" /><stop offset="1" stopColor="#4b535e" />
        </linearGradient>
        <radialGradient id={`luz${id}`} cx=".32" cy=".24" r=".7">
          <stop offset="0" stopColor="#fff" stopOpacity=".62" /><stop offset=".45" stopColor="#fff" stopOpacity=".1" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`fundo${id}`} cx=".5" cy=".5" r=".5">
          <stop offset=".78" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".38" />
        </radialGradient>
        <filter id={`sombra${id}`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.6" /></filter>
        <clipPath id={`face${id}`}><circle cx="16" cy="16" r="16" /></clipPath>
      </defs>
      {/* a sombra no chão */}
      <ellipse cx="25" cy="43.2" rx="14" ry="2.6" fill="#000" opacity=".42" filter={`url(#sombra${id})`} />
      {/* a espessura da moeda, aparecendo à direita */}
      <ellipse cx="25.6" cy="23.4" rx="17.2" ry="18.2" fill={`url(#lado${id})`} />
      {/* o aro de metal */}
      <ellipse cx="23" cy="23" rx="17.2" ry="18.2" fill={`url(#aro${id})`} />
      {/* a face: a bandeira cunhada, um pouco achatada (a moeda está de lado) */}
      <g transform="translate(9.2 7.6) scale(.86 .93)">
        <g clipPath={`url(#face${id})`}>
          {desenho ? desenho() : <><rect width="32" height="32" fill="#29445F" /><text x="16" y="20" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">{codigo.slice(0, 3)}</text></>}
          <circle cx="16" cy="16" r="16" fill={`url(#fundo${id})`} />
        </g>
        <circle cx="16" cy="16" r="15.6" fill="none" stroke="rgba(0,0,0,.35)" strokeWidth=".9" />
      </g>
      {/* o brilho do metal por cima de tudo */}
      <ellipse cx="23" cy="23" rx="17.2" ry="18.2" fill={`url(#luz${id})`} />
      <path d="M10.5 15.5a15.5 16.5 0 0 1 11-9.3" stroke="#fff" strokeOpacity=".85" strokeWidth="1.4" fill="none" strokeLinecap="round" />
    </svg>
  )
}

/** A bandeira da moeda, em círculo. `tamanho` em px. */
export function Bandeira({ codigo, tamanho = 28 }: { codigo: string; tamanho?: number }) {
  const id = useId().replace(/:/g, '')
  const desenho = DESENHOS[codigo]
  return (
    <svg className="bandeira" width={tamanho} height={tamanho} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <defs><clipPath id={`b${id}`}><circle cx="16" cy="16" r="16" /></clipPath></defs>
      <g clipPath={`url(#b${id})`}>{desenho ? desenho() : <><rect width="32" height="32" fill="#29445F" /><text x="16" y="20" textAnchor="middle" fontSize="10" fill="#fff" fontWeight="700">{codigo.slice(0, 3)}</text></>}</g>
      <circle cx="16" cy="16" r="15.5" fill="none" stroke="rgba(0,0,0,.18)" strokeWidth="1" />
    </svg>
  )
}
