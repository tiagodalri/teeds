import './selo-categoria.css'

/**
 * O selo da categoria do cliente no topo (GlobalFly, 23/10/2026): Silver ou
 * Gold, entre o "Conectado" e as iniciais. É só um selo: não libera nem
 * tranca nada. Quem muda é o admin (clientes.categoria).
 */
export type Categoria = 'silver' | 'gold' | 'black' | 'prestige'

const NOME: Record<Categoria, string> = { silver: 'Silver', gold: 'Gold', black: 'Black', prestige: 'Prestige' }

/** 05/11/2026: o selo é o subplano do GF Member (Gold, Black, Prestige) e abre "Meu plano". */
export function SeloCategoria({ categoria, aoAbrir }: { categoria: Categoria; aoAbrir?: () => void }) {
  const Tag = aoAbrir ? 'button' : 'span'
  return (
    <Tag {...(aoAbrir ? { type: 'button' as const, onClick: aoAbrir } : { role: 'img' })} className={`selo-categoria ${categoria}`} title={aoAbrir ? `GF Member ${NOME[categoria]}: ver o seu plano` : `Categoria ${NOME[categoria]}`}
      aria-label={aoAbrir ? `Seu plano: GF Member ${NOME[categoria]}. Abrir` : `Sua categoria: ${NOME[categoria]}`}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1.2l1.55 4.1 4.25.35-3.25 2.75 1.02 4.15L8 10.25 4.43 12.55l1.02-4.15L2.2 5.65l4.25-.35z" />
      </svg>
      <b>{NOME[categoria]}</b>
    </Tag>
  )
}
