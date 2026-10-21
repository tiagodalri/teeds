import { MARCA } from '../../marca'

/**
 * O monograma da marca (GlobalFly: o "GF" com o traço dourado), pedido do
 * Tiago em 20/10/2026: "sempre onde puder", com proporção e elegância.
 *
 *  - `cor`: o desenho oficial, na versão certa para o tema (reversa no
 *    escuro, azul no claro). Para selos, avatares da equipe, cabeçalhos.
 *  - `marca-dagua`: uma cor só (o ouro da casa, por máscara), para ficar
 *    bem baixinho atrás de um cartão. Quem usa define tamanho e opacidade.
 */
const base = import.meta.env.BASE_URL
const escuro = `${base}${MARCA.emblema}`
const claro = MARCA.monogramaClaro ? `${base}${MARCA.monogramaClaro}` : escuro

export function Monograma({ tamanho = 24, variante = 'cor', className = '', rotulo }: { tamanho?: number; variante?: 'cor' | 'marca-dagua'; className?: string; rotulo?: string }) {
  if (variante === 'marca-dagua') {
    return <span className={`monograma-dagua ${className}`} aria-hidden="true" style={{ width: tamanho, height: tamanho, ['--mono' as string]: `url(${escuro})` }} />
  }
  return (
    <span className={`monograma ${className}`} style={{ width: tamanho, height: tamanho }} role={rotulo ? 'img' : undefined} aria-label={rotulo} aria-hidden={rotulo ? undefined : true}>
      <img className="monograma-escuro" src={escuro} alt="" width={tamanho} height={tamanho} draggable={false} />
      <img className="monograma-claro" src={claro} alt="" width={tamanho} height={tamanho} draggable={false} />
    </span>
  )
}

/** A casa tem monograma próprio? (Teeds e OMNI seguem com o emblema delas.) */
export const TEM_MONOGRAMA = !!MARCA.monogramaClaro
