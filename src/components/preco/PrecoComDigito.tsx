import './preco-com-digito.css'

/**
 * Um preço com o ÚLTIMO DÍGITO em destaque (22/10/2026, pedido do Tiago):
 * nas operações de dígitos é ele que decide, e o cliente quer conferir com
 * os próprios olhos qual foi. "39.408,666" + "1" destacado.
 * `tom`: a cor do destaque (ganhou, perdeu ou neutro, em ouro).
 */
export const formatarPreco = (v: number, casas: number) =>
  v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })

export function PrecoComDigito({ valor, casas, tom = 'neutro', className = '' }: {
  valor: number | null | undefined; casas: number; tom?: 'ganho' | 'perda' | 'neutro'; className?: string
}) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return <span className={`pcd ${className}`}>—</span>
  const txt = formatarPreco(valor, casas)
  return (
    <span className={`pcd ${className}`} aria-label={`${txt}, último dígito ${txt.slice(-1)}`}>
      {txt.slice(0, -1)}<b className={`pcd-dig ${tom}`}>{txt.slice(-1)}</b>
    </span>
  )
}
