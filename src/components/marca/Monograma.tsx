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
// o recorte (só o "GF", sem margem) quando a marca tem: maior e nítido em tamanho pequeno
const escuro = `${base}${MARCA.monogramaRecorte?.escuro ?? MARCA.emblema}`
const claro = `${base}${MARCA.monogramaRecorte?.claro ?? MARCA.monogramaClaro ?? MARCA.emblema}`

/** O recorte é mais largo que alto (166 × 96): `tamanho` é a largura. */
const altura = (t: number) => (MARCA.monogramaRecorte ? Math.round(t * 96 / 166) : t)

export function Monograma({ tamanho = 24, variante = 'cor', className = '', rotulo }: { tamanho?: number; variante?: 'cor' | 'marca-dagua'; className?: string; rotulo?: string }) {
  if (variante === 'marca-dagua') {
    return <span className={`monograma-dagua ${className}`} aria-hidden="true" style={{ width: tamanho, height: tamanho, ['--mono' as string]: `url(${escuro})` }} />
  }
  return (
    <span className={`monograma ${className}`} style={{ width: tamanho, height: altura(tamanho) }} role={rotulo ? 'img' : undefined} aria-label={rotulo} aria-hidden={rotulo ? undefined : true}>
      <img className="monograma-escuro" src={escuro} alt="" width={tamanho} height={altura(tamanho)} draggable={false} />
      <img className="monograma-claro" src={claro} alt="" width={tamanho} height={altura(tamanho)} draggable={false} />
    </span>
  )
}

/** A casa tem monograma próprio? (Teeds e OMNI seguem com o emblema delas.) */
export const TEM_MONOGRAMA = !!MARCA.monogramaClaro
