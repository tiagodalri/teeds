import { MARCA } from '../marca'

interface Props {
  tamanho?: number
  compacto?: boolean
  assinatura?: boolean
}

/**
 * O emblema da marca sobre o selo, com a palavra em serifa.
 *
 * O desenho é o mesmo para todas as marcas; o que troca é o emblema e a
 * palavra, que vêm de `src/marca`. A serifa é de propósito: é o que faz as
 * marcas da casa parecerem da mesma família.
 */
export function Brand({ tamanho = 34, compacto = false, assinatura = false }: Props) {
  if (assinatura) return (
    <div className={`brand-signature brand-signature-${MARCA.id}`}>
      <svg className="brand-symbol" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        {MARCA.id === 'teeds' ? <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 9c2 10 8 13 15 12M43 9c-2 10-8 13-15 12M14 19c1 7 3 9 5 12l1 8 4 3 4-3 1-8c2-3 4-5 5-12" />
          <path d="M19 22l5 6 5-6M24 28v9M13 11c6-5 16-5 22 0" />
        </g> : <g stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
          <path d="M24 4l17 10v20L24 44 7 34V14zM24 4l9 15 8 15M7 14h18l16 20M7 34l9-15L24 4M24 44l-8-15-9-15M41 14L24 29 7 34M41 34H24L7 14" />
        </g>}
      </svg>
      <span className="brand-wordmark">{MARCA.nome}<span>TRADING PLATFORM</span></span>
    </div>
  )
  return (
    <div className="marca">
      <span className="marca-selo" style={{ width: tamanho, height: tamanho }}>
        <img src={`${import.meta.env.BASE_URL}${MARCA.emblema}`} alt="" width={tamanho} height={tamanho} />
      </span>
      {!compacto && <span className="marca-nome">{MARCA.nome}</span>}
    </div>
  )
}
