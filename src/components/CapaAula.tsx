/**
 * Capas ilustradas das aulas — arte vetorial com acabamento 3D.
 *
 * Cada aula tem uma cena propria sobre o assunto dela, todas na mesma
 * linguagem: noite profunda, luz da cor do modulo, materiais (ouro
 * metalico da marca, vidro, extrusao) e a assinatura TEEDS.
 *
 * Tudo SVG: nitido em qualquer tela, zero peso de imagem. Os ids de
 * gradiente levam o id da aula para nao colidir entre capas na mesma
 * pagina.
 */

interface Props {
  aula: string
  cor: string
}

/* ------------------------------------------------------------ paleta */

const OURO_CLARO = '#f7e388'
const OURO = '#d2a337'
const OURO_ESCURO = '#8a5c15'

function hex(c: string): [number, number, number] {
  const h = c.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** mistura duas cores (t = quanto da segunda). */
function mix(a: string, b: string, t: number): string {
  const [r1, g1, b1] = hex(a)
  const [r2, g2, b2] = hex(b)
  const f = (x: number, y: number) => Math.round(x + (y - x) * t)
  return `rgb(${f(r1, r2)}, ${f(g1, g2)}, ${f(b1, b2)})`
}

/* ------------------------------------------------------- peças comuns */

function Defs({ u, cor }: { u: string; cor: string }) {
  return (
    <defs>
      <linearGradient id={`bg-${u}`} x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stopColor={mix('#0d1322', cor, 0.22)} />
        <stop offset="1" stopColor="#080b16" />
      </linearGradient>
      <radialGradient id={`luz-${u}`} cx="0.5" cy="0.1" r="0.9">
        <stop offset="0" stopColor={cor} stopOpacity="0.5" />
        <stop offset="1" stopColor={cor} stopOpacity="0" />
      </radialGradient>
      <linearGradient id={`ouro-${u}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={OURO_CLARO} />
        <stop offset="0.45" stopColor={OURO} />
        <stop offset="1" stopColor={OURO_ESCURO} />
      </linearGradient>
      <linearGradient id={`vidro-${u}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
        <stop offset="1" stopColor="#ffffff" stopOpacity="0.05" />
      </linearGradient>
      <linearGradient id={`cor-${u}`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor={mix(cor, '#ffffff', 0.35)} />
        <stop offset="0.5" stopColor={cor} />
        <stop offset="1" stopColor={mix(cor, '#000000', 0.45)} />
      </linearGradient>
      <filter id={`sombra-${u}`} x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#000000" floodOpacity="0.45" />
      </filter>
      <filter id={`brilho-${u}`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="6" result="b" />
        <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
      </filter>
    </defs>
  )
}

function Fundo({ u }: { u: string }) {
  const pontos: JSX.Element[] = []
  for (let x = 20; x < 400; x += 34) {
    for (let y = 16; y < 224; y += 34) {
      pontos.push(<circle key={`${x}-${y}`} cx={x} cy={y} r="1" fill="#ffffff" opacity="0.05" />)
    }
  }
  return (
    <g>
      <rect width="400" height="224" fill={`url(#bg-${u})`} />
      {pontos}
      <rect width="400" height="224" fill={`url(#luz-${u})`} />
    </g>
  )
}

/** Sombra elíptica no chão — o truque mais barato de profundidade. */
function Chao({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.18} fill="#000000" opacity="0.4" />
}

/** O touro da marca, em traço dourado. */
function Touro({ u, x, y, s, opacity = 1 }: { u: string; x: number; y: number; s: number; opacity?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={opacity}>
      {/* chifres em lamina, varrendo para fora e para cima como no logotipo */}
      <path d="M41 27 C27 24 14 14 10 0 C22 10 34 15 46 20 C43 22 41 24 41 27 Z"
        fill={`url(#ouro-${u})`} />
      <path d="M59 27 C73 24 86 14 90 0 C78 10 66 15 54 20 C57 22 59 24 59 27 Z"
        fill={`url(#ouro-${u})`} />
      <circle cx="50" cy="43" r="17.5" fill="none" stroke={`url(#ouro-${u})`} strokeWidth="4.5" />
      <path d="M42 59 q8 7 16 0" fill="none" stroke={`url(#ouro-${u})`}
        strokeWidth="3.5" strokeLinecap="round" />
    </g>
  )
}

/** Assinatura da casa no pé da capa. */
function Assinatura({ u }: { u: string }) {
  return (
    <g opacity="0.85">
      <Touro u={u} x={14} y={196} s={0.22} />
      <text x="42" y="212" fontFamily="Georgia, 'Times New Roman', serif" fontSize="11"
        letterSpacing="4" fill={`url(#ouro-${u})`}>TEEDS</text>
    </g>
  )
}

/** Moeda dourada com relevo. */
function Moeda({ u, cx, cy, r, fantasma = false }: { u: string; cx: number; cy: number; r: number; fantasma?: boolean }) {
  if (fantasma) {
    return (
      <g opacity="0.65">
        <ellipse cx={cx} cy={cy + r * 0.22} rx={r} ry={r * 0.92} fill="none"
          stroke="#8fa3c8" strokeWidth="2.5" strokeDasharray="7 6" />
        <text x={cx} y={cy + r * 0.5} textAnchor="middle" fontSize={r * 0.9}
          fontWeight="700" fill="#8fa3c8" fontFamily="system-ui">$</text>
      </g>
    )
  }
  return (
    <g filter={`url(#sombra-${u})`}>
      <ellipse cx={cx} cy={cy + r * 0.22} rx={r} ry={r * 0.92} fill={OURO_ESCURO} />
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.92} fill={`url(#ouro-${u})`} />
      <ellipse cx={cx} cy={cy} rx={r * 0.72} ry={r * 0.66} fill="none"
        stroke={OURO_ESCURO} strokeOpacity="0.55" strokeWidth={r * 0.06} />
      <text x={cx} y={cy + r * 0.32} textAnchor="middle" fontSize={r * 0.85}
        fontWeight="800" fill={OURO_ESCURO} fontFamily="system-ui">$</text>
      <ellipse cx={cx - r * 0.35} cy={cy - r * 0.42} rx={r * 0.3} ry={r * 0.16}
        fill="#ffffff" opacity="0.5" />
    </g>
  )
}

/** Painel de vidro flutuante. */
function Vidro({ u, x, y, w, h, rx = 12, rot = 0 }: { u: string; x: number; y: number; w: number; h: number; rx?: number; rot?: number }) {
  return (
    <g transform={rot ? `rotate(${rot} ${x + w / 2} ${y + h / 2})` : undefined}>
      <rect x={x} y={y} width={w} height={h} rx={rx} fill={`url(#vidro-${u})`}
        stroke="#ffffff" strokeOpacity="0.28" filter={`url(#sombra-${u})`} />
      <rect x={x + 1.5} y={y + 1.5} width={w - 3} height={h / 2.4} rx={rx - 2}
        fill="#ffffff" opacity="0.06" />
    </g>
  )
}

/** Seta 3D extrudada, apontando para cima (rotacione para inverter). */
function Seta({ u, x, y, s, cor, rot = 0 }: { u: string; x: number; y: number; s: number; cor: string; rot?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`} filter={`url(#sombra-${u})`}>
      <path d="M0 -34 L26 0 L12 0 L12 30 L-12 30 L-12 0 L-26 0 Z"
        fill={mix(cor, '#000000', 0.45)} transform="translate(5 6)" />
      <path d="M0 -34 L26 0 L12 0 L12 30 L-12 30 L-12 0 L-26 0 Z" fill={cor} />
      <path d="M0 -34 L26 0 L12 0 L0 0 Z" fill="#ffffff" opacity="0.28" />
    </g>
  )
}

/** Dígito flutuante com extrusão. */
function Digito({ u, ch, x, y, s, cor, aceso = false }: { u: string; ch: string; x: number; y: number; s: number; cor: string; aceso?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`} filter={aceso ? `url(#brilho-${u})` : undefined}>
      <text x={2.5} y={3.5} textAnchor="middle" fontFamily="system-ui" fontWeight="800"
        fontSize={s} fill="#000000" opacity="0.5">{ch}</text>
      <text textAnchor="middle" fontFamily="system-ui" fontWeight="800" fontSize={s}
        fill={aceso ? cor : '#3d4b6e'}>{ch}</text>
    </g>
  )
}

/* --------------------------------------------------------------- cenas */

function Cena({ aula, u, cor }: { aula: string; u: string; cor: string }) {
  switch (aula) {
    case 'boas-vindas':
      return (
        <g>
          <circle cx="200" cy="106" r="62" fill="none" stroke={`url(#ouro-${u})`} strokeOpacity="0.35" strokeWidth="1.5" />
          <circle cx="200" cy="106" r="84" fill="none" stroke={`url(#ouro-${u})`} strokeOpacity="0.15" strokeWidth="1" />
          <Chao cx={200} cy={178} rx={70} />
          <g filter={`url(#brilho-${u})`}>
            <Touro u={u} x={148} y={58} s={1.05} />
          </g>
        </g>
      )
    case 'conta-corretora':
      return (
        <g>
          <Chao cx={205} cy={190} rx={95} />
          <Vidro u={u} x={120} y={52} w={170} h={104} rx={14} rot={-4} />
          <circle cx="158" cy="92" r="17" fill={`url(#cor-${u})`} />
          <circle cx="158" cy="86" r="6.5" fill="#0b1020" opacity="0.75" />
          <path d="M148 100 a10 7 0 0 1 20 0" fill="#0b1020" opacity="0.75" />
          <rect x="186" y="80" width="86" height="7" rx="3.5" fill="#ffffff" opacity="0.55" />
          <rect x="186" y="94" width="62" height="6" rx="3" fill="#ffffff" opacity="0.3" />
          <rect x="138" y="122" width="120" height="6" rx="3" fill="#ffffff" opacity="0.22" />
          <g filter={`url(#sombra-${u})`}>
            <circle cx="282" cy="140" r="20" fill={`url(#cor-${u})`} />
            <path d="M273 140 l7 7 l13 -14" fill="none" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </g>
      )
    case 'conectar-corretora':
      return (
        <g>
          <Chao cx={130} cy={170} rx={52} />
          <Chao cx={272} cy={170} rx={52} />
          <path d="M162 118 C 190 96, 214 96, 240 118" fill="none" stroke={cor}
            strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10" filter={`url(#brilho-${u})`} />
          <g filter={`url(#sombra-${u})`}>
            <circle cx="130" cy="128" r="36" fill="#141b30" stroke="#ffffff" strokeOpacity="0.2" />
            <Touro u={u} x={107} y={106} s={0.47} />
          </g>
          <g filter={`url(#sombra-${u})`}>
            <circle cx="272" cy="128" r="36" fill="#141b30" stroke="#ffffff" strokeOpacity="0.2" />
            <path d="M254 140 l10 -16 l8 8 l12 -18" fill="none" stroke={`url(#cor-${u})`}
              strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g filter={`url(#brilho-${u})`}>
            <circle cx="201" cy="103" r="12" fill={cor} />
            <path d="M203 96 l-6 8 h5 l-2 7 l7 -9 h-5 Z" fill="#fff" />
          </g>
        </g>
      )
    case 'conhecendo-plataforma':
      return (
        <g>
          <Chao cx={205} cy={192} rx={100} />
          <g transform="rotate(-5 200 110)">
            <Vidro u={u} x={110} y={44} w={190} h={120} rx={12} />
            <circle cx="126" cy="58" r="3" fill={cor} />
            <circle cx="136" cy="58" r="3" fill="#ffffff" opacity="0.3" />
            <rect x="122" y="70" width="42" height="82" rx="6" fill="#ffffff" opacity="0.06" />
            {([
              [178, 108, 128, 1], [192, 96, 118, 1], [206, 112, 140, 0],
              [220, 90, 112, 1], [234, 100, 126, 0], [248, 82, 104, 1], [262, 92, 118, 1],
            ] as Array<[number, number, number, number]>).map(([x, alto, baixo, sobe], i) => (
              <g key={i}>
                <line x1={x} y1={alto - 10} x2={x} y2={baixo + 8}
                  stroke={sobe ? '#1fc06a' : '#f0555a'} strokeWidth="1.5" />
                <rect x={x - 4} y={alto} width="8" height={baixo - alto} rx="2"
                  fill={sobe ? '#1fc06a' : '#f0555a'} />
              </g>
            ))}
          </g>
          <g filter={`url(#sombra-${u})`}>
            <path d="M296 128 l0 26 l7 -7 l6 12 l8 -4 l-6 -12 l10 -1 Z" fill="#ffffff" />
          </g>
        </g>
      )
    case 'demo-vs-real':
      return (
        <g>
          <Chao cx={132} cy={172} rx={48} />
          <Chao cx={272} cy={172} rx={52} />
          <Moeda u={u} cx={132} cy={122} r={42} fantasma />
          <Moeda u={u} cx={272} cy={120} r={44} />
          <g filter={`url(#brilho-${u})`}>
            <text x="201" y="130" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic"
              fontSize="22" fontWeight="700" fill={cor}>vs</text>
          </g>
          <text x="132" y="185" textAnchor="middle" fontSize="10.5" letterSpacing="2.5" fill="#8fa3c8">TREINO</text>
          <text x="272" y="185" textAnchor="middle" fontSize="10.5" letterSpacing="2.5" fill={OURO_CLARO}>REAL</text>
        </g>
      )
    case 'deposito':
      return (
        <g>
          <Chao cx={205} cy={196} rx={92} />
          <g filter={`url(#sombra-${u})`}>
            <rect x="130" y="128" width="150" height="58" rx="12" fill="#141b30" stroke="#ffffff" strokeOpacity="0.2" />
            <rect x="176" y="122" width="58" height="10" rx="5" fill="#05070f" />
            <rect x="140" y="150" width="46" height="7" rx="3.5" fill={cor} opacity="0.8" />
            <rect x="140" y="163" width="30" height="6" rx="3" fill="#ffffff" opacity="0.25" />
          </g>
          <Moeda u={u} cx={205} cy={74} r={26} />
          <Moeda u={u} cx={158} cy={52} r={15} />
          <Moeda u={u} cx={251} cy={56} r={12} />
          <path d="M205 104 l0 14 m0 0 l-8 -9 m8 9 l8 -9" stroke={cor} strokeWidth="4"
            strokeLinecap="round" strokeLinejoin="round" fill="none" filter={`url(#brilho-${u})`} />
        </g>
      )
    case 'saque':
      return (
        <g>
          <Chao cx={205} cy={196} rx={92} />
          <g filter={`url(#sombra-${u})`}>
            <rect x="130" y="120" width="150" height="66" rx="12" fill="#141b30" stroke="#ffffff" strokeOpacity="0.2" />
            <rect x="145" y="134" width="120" height="38" rx="7" fill={`url(#cor-${u})`} opacity="0.9" />
            <circle cx="205" cy="153" r="13" fill="none" stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2" />
            <text x="205" y="158" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffffff">$</text>
          </g>
          <Moeda u={u} cx={165} cy={72} r={16} />
          <Moeda u={u} cx={244} cy={62} r={19} />
          <path d="M205 112 l0 -16 m0 0 l-8 9 m8 -9 l8 9" stroke={OURO_CLARO} strokeWidth="4"
            strokeLinecap="round" strokeLinejoin="round" fill="none" filter={`url(#brilho-${u})`} />
        </g>
      )
    case 'subir-descer':
      return (
        <g>
          <Chao cx={150} cy={186} rx={55} />
          <Chao cx={258} cy={186} rx={55} />
          <Seta u={u} x={150} y={116} s={1.5} cor="#1fc06a" />
          <Seta u={u} x={258} y={122} s={1.5} cor="#f0555a" rot={180} />
        </g>
      )
    case 'digitos':
      return (
        <g>
          <Chao cx={200} cy={196} rx={110} />
          <Digito u={u} ch="3" x={96} y={92} s={40} cor={cor} />
          <Digito u={u} ch="8" x={150} y={140} s={54} cor={cor} />
          <Digito u={u} ch="5" x={210} y={96} s={66} cor={cor} aceso />
          <Digito u={u} ch="1" x={268} y={140} s={48} cor={cor} />
          <Digito u={u} ch="9" x={316} y={90} s={38} cor={cor} />
          <circle cx="210" cy="76" r="52" fill="none" stroke={cor} strokeOpacity="0.35"
            strokeWidth="1.5" strokeDasharray="3 7" />
        </g>
      )
    case 'posicoes-operacoes':
      return (
        <g>
          <Chao cx={205} cy={196} rx={98} />
          <Vidro u={u} x={124} y={118} w={168} h={40} rx={10} />
          <Vidro u={u} x={116} y={72} w={184} h={40} rx={10} />
          <g filter={`url(#sombra-${u})`}>
            <rect x="108" y="26" width="200" height="40" rx="10" fill="#161f38" stroke="#ffffff" strokeOpacity="0.25" />
            <circle cx="128" cy="46" r="6" fill="#1fc06a" filter={`url(#brilho-${u})`} />
            <rect x="146" y="38" width="70" height="7" rx="3.5" fill="#ffffff" opacity="0.6" />
            <rect x="146" y="51" width="44" height="6" rx="3" fill="#ffffff" opacity="0.25" />
            <text x="296" y="52" textAnchor="end" fontSize="15" fontWeight="800" fill="#1fc06a">+0,65</text>
          </g>
          <rect x="136" y="84" width="60" height="6" rx="3" fill="#ffffff" opacity="0.3" />
          <text x="288" y="96" textAnchor="end" fontSize="12" fontWeight="700" fill="#f0555a" opacity="0.8">−0,35</text>
          <rect x="144" y="130" width="50" height="6" rx="3" fill="#ffffff" opacity="0.2" />
        </g>
      )
    case 'robos-como-funcionam':
      return (
        <g>
          <Chao cx={200} cy={192} rx={78} />
          <circle cx="200" cy="108" r="70" fill="none" stroke={cor} strokeOpacity="0.3"
            strokeWidth="1.5" strokeDasharray="4 8" />
          <g filter={`url(#sombra-${u})`}>
            <rect x="152" y="66" width="96" height="78" rx="22" fill="#161f38" stroke="#ffffff" strokeOpacity="0.25" />
            <rect x="152" y="66" width="96" height="34" rx="17" fill="#ffffff" opacity="0.06" />
            <circle cx="181" cy="104" r="9" fill={cor} filter={`url(#brilho-${u})`} />
            <circle cx="219" cy="104" r="9" fill={cor} filter={`url(#brilho-${u})`} />
            <rect x="186" y="124" width="28" height="5" rx="2.5" fill="#ffffff" opacity="0.4" />
            <line x1="200" y1="52" x2="200" y2="66" stroke={cor} strokeWidth="3" />
            <circle cx="200" cy="48" r="5.5" fill={cor} filter={`url(#brilho-${u})`} />
          </g>
          <Moeda u={u} cx={286} cy={150} r={15} />
          <Moeda u={u} cx={116} cy={148} r={12} />
        </g>
      )
    case 'robo-ag7':
      return (
        <g>
          <Chao cx={200} cy={192} rx={100} />
          <g filter={`url(#brilho-${u})`}>
            <circle cx="200" cy="102" r="56" fill="none" stroke={cor} strokeWidth="3" strokeOpacity="0.75" />
            <circle cx="200" cy="102" r="36" fill="none" stroke={cor} strokeWidth="2.5" strokeOpacity="0.5" />
          </g>
          <Digito u={u} ch="7" x={162} y={128} s={62} cor={cor} aceso />
          <Digito u={u} ch="8" x={206} y={122} s={50} cor={cor} aceso />
          <Digito u={u} ch="9" x={244} y={126} s={42} cor={cor} aceso />
          <text x="200" y="34" textAnchor="middle" fontSize="12" letterSpacing="5" fontWeight="700"
            fill={mix(cor, '#ffffff', 0.5)}>AG7</text>
        </g>
      )
    case 'robo-ag2':
      return (
        <g>
          <Chao cx={200} cy={192} rx={100} />
          <g filter={`url(#brilho-${u})`}>
            <circle cx="200" cy="102" r="56" fill="none" stroke={cor} strokeWidth="3" strokeOpacity="0.75" />
            <circle cx="200" cy="102" r="36" fill="none" stroke={cor} strokeWidth="2.5" strokeOpacity="0.5" />
          </g>
          <Digito u={u} ch="0" x={158} y={126} s={44} cor={cor} aceso />
          <Digito u={u} ch="1" x={196} y={122} s={52} cor={cor} aceso />
          <Digito u={u} ch="2" x={238} y={128} s={62} cor={cor} aceso />
          <text x="200" y="34" textAnchor="middle" fontSize="12" letterSpacing="5" fontWeight="700"
            fill={mix(cor, '#ffffff', 0.5)}>AG2</text>
        </g>
      )
    case 'freios':
      return (
        <g>
          <Chao cx={200} cy={194} rx={80} />
          <g filter={`url(#sombra-${u})`}>
            <path d="M200 40 L254 58 V110 C254 148 230 170 200 182 C170 170 146 148 146 110 V58 Z"
              fill="#161f38" stroke={`url(#cor-${u})`} strokeWidth="3" />
            <path d="M200 40 L254 58 V110 C254 122 251 133 247 142 L200 52 Z" fill="#ffffff" opacity="0.05" />
          </g>
          <path d="M172 108 a28 28 0 0 1 56 0" fill="none" stroke="#3d4b6e" strokeWidth="7" strokeLinecap="round" />
          <path d="M172 108 a28 28 0 0 1 18 -26" fill="none" stroke="#1fc06a" strokeWidth="7" strokeLinecap="round" />
          <line x1="200" y1="112" x2="216" y2="90" stroke={cor} strokeWidth="4" strokeLinecap="round"
            filter={`url(#brilho-${u})`} />
          <circle cx="200" cy="112" r="5" fill={cor} />
          <text x="200" y="152" textAnchor="middle" fontSize="10" letterSpacing="3" fill="#8fa3c8">STOP · TAKE</text>
        </g>
      )
    default:
      return <Touro u={u} x={150} y={70} s={1} />
  }
}

/** Qual cena veste cada robo da vitrine. */
export function capaDoRobo(id: string): string {
  if (id === 'ag2') return 'robo-ag2'
  if (id === 'superior5' || id === 'superior5fixo') return 'robo-ag7'
  return 'boas-vindas'
}

/* ------------------------------------------------------------- a capa */

export function CapaAula({ aula, cor }: Props) {
  const u = aula
  return (
    <svg viewBox="0 0 400 224" width="100%" height="100%" preserveAspectRatio="xMidYMid slice"
      role="img" aria-hidden style={{ display: 'block' }}>
      <Defs u={u} cor={cor} />
      <Fundo u={u} />
      <Cena aula={aula} u={u} cor={cor} />
      <Assinatura u={u} />
    </svg>
  )
}
