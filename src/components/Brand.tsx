import { MARCA } from '../marca'

interface Props {
  tamanho?: number
  compacto?: boolean
}

/**
 * O emblema da marca sobre o selo, com a palavra em serifa.
 *
 * O desenho é o mesmo para todas as marcas; o que troca é o emblema e a
 * palavra, que vêm de `src/marca`. A serifa é de propósito: é o que faz as
 * marcas da casa parecerem da mesma família.
 */
export function Brand({ tamanho = 34, compacto = false }: Props) {
  return (
    <div className="marca">
      <span className="marca-selo" style={{ width: tamanho, height: tamanho }}>
        <img src={`${import.meta.env.BASE_URL}${MARCA.emblema}`} alt="" width={tamanho} height={tamanho} />
      </span>
      {!compacto && <span className="marca-nome">{MARCA.nome}</span>}
    </div>
  )
}
