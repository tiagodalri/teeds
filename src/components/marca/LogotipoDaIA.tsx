import { useId, type ReactNode } from 'react'
import { MARCA } from '../../marca'

/**
 * Logotipo de cada I.A. da GlobalFly (27/10/2026, Tiago: "sobre os logos
 * gostei, pode implementar ... todos com GF no início e depois o nome").
 *
 * O monograma oficial abre o nome; o nome é desenhado letra por letra (não é
 * fonte), na espessura do monograma, e o traço dourado do GF vira uma haste
 * da letra com o mesmo respiro em volta: a haste do P (Phenom), a perna do A
 * (Raptor), a haste do F (Falcon), o braço do Y (Legacy), a haste do L (Gulf).
 * Desenho em altura 100, traço 13; o respiro é uma máscara, então funciona
 * sobre foto, azul ou marfim. As letras usam a cor do texto (currentColor).
 */
interface Desenho { largura: number; marfim: string; ouro: string; vao: string }

const DESENHOS: Record<string, Desenho> = {
  phenom: {
    largura: 790,
    marfim: 'M64 6.5 H99.5 A22 22 0 0 1 121.5 28.5 V34 A22 22 0 0 1 99.5 56 H30 M160.5 0 V100 M251.5 0 V100 M160.5 50 H251.5 M374 6.5 H290.5 V93.5 H374 M290.5 50 H364 M406.5 102 V6.5 L497.5 93.5 V-2 M566.5 6.5 H605.5 A30 30 0 0 1 635.5 36.5 V63.5 A30 30 0 0 1 605.5 93.5 H566.5 A30 30 0 0 1 536.5 63.5 V36.5 A30 30 0 0 1 566.5 6.5 Z M674.5 102 V6.5 L729 74 L783.5 6.5 V102',
    ouro: 'M5.7 100 L58 0 L82 0 L9.7 100 Z', vao: 'M-14 130 L69.7 -30 L107.7 -30 L-8 130 Z',
  },
  raptor: {
    largura: 790,
    marfim: 'M6.5 100 V6.5 H75.5 A22 22 0 0 1 97.5 28.5 V34 A22 22 0 0 1 75.5 56 H6.5 M67.5 56 L101.5 104 M197.5 -4 L264.8 104 M157.6 68 H242.4 M302.5 100 V6.5 H367.5 A22 22 0 0 1 389.5 28.5 V34 A22 22 0 0 1 367.5 56 H302.5 M422 6.5 H522 M472 6.5 V100 M584.5 6.5 H623.5 A30 30 0 0 1 653.5 36.5 V63.5 A30 30 0 0 1 623.5 93.5 H584.5 A30 30 0 0 1 554.5 63.5 V36.5 A30 30 0 0 1 584.5 6.5 Z M692.5 100 V6.5 H761.5 A22 22 0 0 1 783.5 28.5 V34 A22 22 0 0 1 761.5 56 H692.5 M753.5 56 L787.5 104',
    ouro: 'M135.7 100 L188 0 L212 0 L139.7 100 Z', vao: 'M116 130 L199.7 -30 L237.7 -30 L122 130 Z',
  },
  falcon: {
    largura: 804,
    marfim: 'M64 6.5 H128 M34 50 H114 M159.2 104 L224 0 L288.8 104 M181.6 68 H266.4 M326.5 0 V93.5 H406 M536 6.5 H468.5 A30 30 0 0 0 438.5 36.5 V63.5 A30 30 0 0 0 468.5 93.5 H536 M598.5 6.5 H637.5 A30 30 0 0 1 667.5 36.5 V63.5 A30 30 0 0 1 637.5 93.5 H598.5 A30 30 0 0 1 568.5 63.5 V36.5 A30 30 0 0 1 598.5 6.5 Z M706.5 102 V6.5 L797.5 93.5 V-2',
    ouro: 'M5.7 100 L58 0 L82 0 L9.7 100 Z', vao: 'M-14 130 L69.7 -30 L107.7 -30 L-8 130 Z',
  },
  legacy: {
    largura: 750,
    marfim: 'M6.5 0 V93.5 H86 M202 6.5 H118.5 V93.5 H202 M118.5 50 H192 M340 6.5 H264.5 A30 30 0 0 0 234.5 36.5 V63.5 A30 30 0 0 0 264.5 93.5 H317.5 A16 16 0 0 0 333.5 77.5 V52 H286.2 M371.2 104 L436 0 L500.8 104 M393.6 68 H478.4 M636 6.5 H568.5 A30 30 0 0 0 538.5 36.5 V63.5 A30 30 0 0 0 568.5 93.5 H636 M658 -8 L706 60 V100',
    ouro: 'M708 57 L733.6 0 L757.6 0 L712 57 Z', vao: 'M704 57 L743.1 -30 L785.6 -30 L716 57 Z',
  },
  gulf: {
    largura: 496,
    marfim: 'M112 6.5 H36.5 A30 30 0 0 0 6.5 36.5 V63.5 A30 30 0 0 0 36.5 93.5 H89.5 A16 16 0 0 0 105.5 77.5 V52 H58.2 M144.5 0 V63.5 A30 30 0 0 0 174.5 93.5 H205.5 A30 30 0 0 0 235.5 63.5 V0 M279.8 93.5 H380 M496 6.5 H412.5 V100 M412.5 50 H484',
    ouro: 'M273.7 100 L326 0 L350 0 L277.7 100 Z', vao: 'M254 130 L337.7 -30 L375.7 -30 L260 130 Z',
  },
}

const PREFIXO = /^(GF|GlobalFly)\s+/i
const chave = (nome: string) => nome.replace(PREFIXO, '').trim().toLowerCase()

/** O código de cada I.A. no banco e no servidor (o nome gravado pode variar). */
const DESENHO_DO_ID: Record<string, string> = { goreme: 'raptor', falcon: 'falcon', legacy: 'legacy', superior5: 'gulf', ag2: 'phenom' }
const desenhoDe = (nome: string, id?: string | null) => (id && DESENHO_DO_ID[id]) || (PREFIXO.test(nome) && chave(nome) in DESENHOS ? chave(nome) : null)
const titulo = (k: string) => `GF ${k[0].toUpperCase()}${k.slice(1)}`

/** A I.A. tem logotipo desenhado? Só na GlobalFly e só com o "GF" no nome
 *  (as do Laboratório, por exemplo, seguem em texto). */
export const temLogotipo = (nome: string, id?: string | null) => !!MARCA.monogramaNosRobos && !!desenhoDe(nome, id)

/**
 * `fio`: o fio dourado entre o GF e o nome, para os lugares de destaque
 * (cartões com foto, capa do plano de voo). `sobreFoto`: o monograma na
 * versão reversa mesmo no tema claro. `soNome`: sem o GF, onde o monograma já
 * abre a mesma linha (o topo do plano de voo).
 */
export function LogotipoDaIA({ nome, id, fio = false, sobreFoto = false, soNome = false, className = '' }: { nome: string; id?: string | null; fio?: boolean; sobreFoto?: boolean; soNome?: boolean; className?: string }) {
  const uid = useId().replace(/:/g, '')
  const k = MARCA.monogramaNosRobos ? desenhoDe(nome, id) : null
  const d = k ? DESENHOS[k] : undefined
  if (!k || !d) return <>{nome}</>
  const larguraDaCaixa = d.largura + 18
  return (
    <span className={`logo-ia ${fio ? 'com-fio' : ''} ${sobreFoto ? 'sobre-foto' : ''} ${className}`} role="img" aria-label={titulo(k)} title={titulo(k)}>
      {!soNome && <span className="nome-robo-gf logo-ia-gf" aria-hidden="true" />}
      {fio && !soNome && <span className="logo-ia-fio" aria-hidden="true" />}
      <svg className="logo-ia-nome" viewBox={`-6 -6 ${larguraDaCaixa} 112`} style={{ aspectRatio: `${larguraDaCaixa} / 112` }} aria-hidden="true">
        <defs>
          <mask id={`m${uid}`} maskUnits="userSpaceOnUse" x="-60" y="-60" width="1000" height="220">
            <rect x="-60" y="0" width="1000" height="100" style={{ fill: '#fff', stroke: 'none' }} />
            <path d={d.vao} style={{ fill: '#000', stroke: 'none' }} />
          </mask>
        </defs>
        {/* estilo em linha: as regras de ícone das telas (svg { stroke-width… }) não alcançam */}
        <path d={d.marfim} mask={`url(#m${uid})`} style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 13, strokeLinejoin: 'miter', strokeMiterlimit: 8, strokeLinecap: 'butt' }} />
        <path d={d.ouro} style={{ fill: 'var(--logo-ia-ouro)', stroke: 'none' }} />
      </svg>
    </span>
  )
}

/**
 * Um <select> de I.A. com o logotipo no campo fechado (Gerenciamento, por
 * exemplo). A lista que abre continua a nativa do aparelho, que só aceita
 * texto, mas o que fica à vista é a marca de cada I.A.
 */
export function CampoComLogotipo({ nome, id, children }: { nome: string; id?: string | null; children: ReactNode }) {
  const tem = temLogotipo(nome, id)
  return (
    <span className={`campo-logo ${tem ? 'tem' : ''}`}>
      {children}
      {tem && <span className="campo-logo-ia" aria-hidden="true"><LogotipoDaIA nome={nome} id={id} /></span>}
      {tem && <svg className="campo-logo-seta" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" /></svg>}
    </span>
  )
}
