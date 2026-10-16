import { MARCA } from '../marca'

interface Props {
  tamanho?: number
  compacto?: boolean
  assinatura?: boolean
}

/**
 * A marca da GlobalFly Trade — versão da casca.
 *
 * O manual (pág. 7 e 16) proíbe recompor o nome com fonte: "Nunca redigite
 * ou reconstrua a assinatura". Então aqui não há texto nenhum, só os
 * arquivos oficiais. A versão segue o fundo (pág. 12): reversa no escuro,
 * original no claro — as duas vão para a página e o tema escolhe pelo CSS.
 *
 * Na primeira aparição vai a assinatura completa (pág. 23); onde não cabe
 * (menu recolhido, selo pequeno), o monograma. Abaixo de 180 px a assinatura
 * não é usada (pág. 11).
 */
const base = import.meta.env.BASE_URL
const escura = `${base}${MARCA.assinatura?.escura ?? MARCA.emblema}`
const clara = `${base}${MARCA.assinatura?.clara ?? MARCA.emblema}`
const monograma = `${base}${MARCA.emblema}`

function Assinatura({ largura }: { largura: number }) {
  return (
    <span className="marca-assinatura-par" style={{ display: 'inline-block', width: largura }}>
      <img className="marca-assinatura escura" src={escura} alt={MARCA.prosa} width={largura} />
      <img className="marca-assinatura clara" src={clara} alt={MARCA.prosa} width={largura} />
    </span>
  )
}

export function Brand({ tamanho = 34, compacto = false, assinatura = false }: Props) {
  if (assinatura) return (
    <div className="brand-signature brand-signature-globalfly">
      <img className="brand-symbol brand-original" src={monograma} alt={MARCA.prosa} width="40" height="40" />
      <span className="brand-wordmark"><Assinatura largura={188} /></span>
    </div>
  )
  if (compacto) return (
    <div className="marca">
      <span className="marca-selo" style={{ width: tamanho, height: tamanho }}>
        <img src={monograma} alt={MARCA.prosa} width={tamanho} height={tamanho} />
      </span>
    </div>
  )
  return (
    <div className="marca marca-gf">
      <Assinatura largura={Math.max(190, Math.round(tamanho * 4.6))} />
    </div>
  )
}
