/**
 * Paleta da marca aplicada no build — hoje só a GlobalFly usa.
 *
 * A base do app nasceu na Teeds e tem cores escritas à mão no CSS e nos
 * componentes (o dourado da Teeds, laranja, roxo, verdes e vermelhos de
 * outras famílias). Sobrescrever uma a uma no tema da casca deixaria sempre
 * alguma escapar. Aqui, na hora de montar o site DA MARCA, cada cor fora da
 * paleta é trocada pela família equivalente do manual, mantendo a mesma
 * luminosidade — assim o contraste de cada texto e fundo continua o mesmo,
 * só o matiz passa a ser o da casa.
 *
 * As outras marcas não passam por aqui: o plugin só existe no build da
 * marca que declara `paleta`.
 */

/** Matiz (graus), saturação máxima (0–1) e, se houver, o tom oficial (r,g,b em 0–1). */
export interface Familia { h: number; s: number; exata?: [number, number, number] }

export interface Paleta {
  /** Cores que já são da marca (ou de terceiros, como o vermelho da Deriv): ficam como estão. */
  manter: string[]
  /** Matiz (graus) e saturação (0–1) de cada família do manual. */
  vermelho: Familia
  quente: Familia
  verde: Familia
  frio: Familia
  /** Neutros: matiz para os escuros/médios e para os claros. */
  neutroEscuro: number
  neutroClaro: number
  /** Pares [luminosidade, saturação] das superfícies escuras oficiais, em ordem. */
  superficies?: [number, number][]
}

function hls(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, l, 0]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, l, s]
}

function rgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const t = (x: number) => {
    x = ((x % 360) + 360) % 360 / 360
    if (x < 1 / 6) return p + (q - p) * 6 * x
    if (x < 1 / 2) return q
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6
    return p
  }
  return [t(h + 120), t(h), t(h - 120)]
}

const hex2 = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 255).toString(16).padStart(2, '0')

/** Troca uma cor (r,g,b em 0–1) pela equivalente da paleta. */
export function corDaPaleta(r: number, g: number, b: number, p: Paleta): [number, number, number] {
  const [h, l, s] = hls(r, g, b)
  if (l < 0.04 || l > 0.97) return [r, g, b] // preto e branco ficam
  // Superfícies escuras (cinzas e azulados da base): viram o azul-marinho
  // do manual, com a saturação que as superfícies oficiais têm em cada
  // luminosidade (painel #041120, gráfico #112032, card #162537, grade
  // #27374A, inativo #586A7F). Cinza-chumbo vira azul-noite.
  const frioOuNeutro = s < 0.18 || (h >= 195 && h < 330)
  if (frioOuNeutro && l < 0.45 && p.superficies) {
    const pts = p.superficies
    let alvo = pts[pts.length - 1][1]
    for (let i = 0; i < pts.length - 1; i++) {
      const [l0, s0] = pts[i], [l1, s1] = pts[i + 1]
      if (l <= l0) { alvo = s0; break }
      if (l <= l1) { alvo = s0 + ((l - l0) / (l1 - l0)) * (s1 - s0); break }
    }
    return rgb(p.neutroEscuro, l, Math.max(Math.min(s, 0.8), alvo))
  }
  if (s < 0.18) {
    if (l > 0.85) return s < 0.04 ? [r, g, b] : rgb(p.neutroClaro, l, s)
    // Cinzas médios (texto de apoio, ícones): o Aço do manual.
    return rgb(p.neutroEscuro, l, Math.max(s, 0.2))
  }
  const fam = h < 20 || h >= 330 ? p.vermelho : h < 65 ? p.quente : h < 195 ? p.verde : p.frio
  // Perto do tom oficial, vira o tom oficial; mais claro ou mais escuro
  // (fundos suaves, bordas), fica na mesma família com a luz original.
  if (fam.exata && Math.abs(l - hls(...fam.exata)[1]) < 0.12) return fam.exata
  return rgb(fam.h, l, Math.min(fam.s, Math.max(s, 0.18)))
}

const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-zA-Z_-])/g
const RGB = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g

export function recolorir(codigo: string, p: Paleta): string {
  const manter = new Set(p.manter.map((c) => c.toLowerCase()))
  return codigo
    .replace(HEX, (todo, h: string) => {
      const curto = h.length === 3
      const seis = curto ? h.split('').map((c) => c + c).join('') : h.slice(0, 6)
      if (manter.has('#' + seis.toLowerCase())) return todo
      const [r, g, b] = [0, 2, 4].map((i) => parseInt(seis.slice(i, i + 2), 16) / 255)
      const novo = corDaPaleta(r, g, b, p).map(hex2).join('')
      if (novo === seis.toLowerCase()) return todo
      return '#' + novo + (h.length === 8 ? h.slice(6) : '')
    })
    .replace(RGB, (todo, a: string, b: string, c: string) => {
      const seis = [a, b, c].map((x) => Number(x).toString(16).padStart(2, '0')).join('')
      if (manter.has('#' + seis)) return todo
      const novo = corDaPaleta(+a / 255, +b / 255, +c / 255, p).map((x) => Math.round(x * 255))
      return todo.replace(/\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}/, `(${novo.join(', ')}`)
    })
}

/** Plugin do Vite: recolore CSS e componentes de `src/`, menos o cadastro das marcas e a casca (que já é escrita na paleta). */
export function paletaDaMarca(p: Paleta | undefined) {
  return {
    name: 'teeds:paleta-da-marca',
    enforce: 'pre' as const,
    transform(codigo: string, id: string) {
      if (!p) return null
      const arquivo = id.split('?')[0]
      if (!arquivo.includes('/src/') || arquivo.includes('node_modules')) return null
      if (arquivo.endsWith('/src/marca/marcas.ts') || arquivo.includes('/src/casca/')) return null
      if (!/\.(css|tsx?)$/.test(arquivo)) return null
      const novo = recolorir(codigo, p)
      return novo === codigo ? null : { code: novo, map: null }
    },
  }
}
