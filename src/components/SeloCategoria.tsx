import './selo-categoria.css'

/**
 * O selo da categoria do cliente no topo (GlobalFly, 23/10/2026): Silver ou
 * Gold, entre o "Conectado" e as iniciais. É só um selo: não libera nem
 * tranca nada. Quem muda é o admin (clientes.categoria).
 */
export type Categoria = 'silver' | 'gold'

const NOME: Record<Categoria, string> = { silver: 'Silver', gold: 'Gold' }

export function SeloCategoria({ categoria }: { categoria: Categoria }) {
  return (
    <span className={`selo-categoria ${categoria}`} title={`Categoria ${NOME[categoria]}`}
      aria-label={`Sua categoria: ${NOME[categoria]}`} role="img">
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.2l1.55 4.1 4.25.35-3.25 2.75 1.02 4.15L8 10.25 4.43 12.55l1.02-4.15L2.2 5.65l4.25-.35z" />
      </svg>
      <b>{NOME[categoria]}</b>
    </span>
  )
}
