/**
 * A cara da Deriv dentro da plataforma.
 *
 * A Teeds/OMNI opera pela conta que o cliente tem na Deriv — então, no lugar
 * certo (abrir conta, conectar), mostrar a marca da corretora ajuda a pessoa a
 * reconhecer de quem é aquela conta. Como a plataforma é afiliada da Deriv,
 * usar a cor e o logotipo dela para levar o cliente até a própria Deriv é uso
 * legítimo — e nunca se passa pela Deriv: o cabeçalho é sempre da casa.
 *
 * O logotipo aqui é um wordmark tipográfico fiel (minúsculas, vermelho oficial).
 * Para trocar pelo SVG oficial do kit de parceiro da Deriv, basta substituir o
 * corpo de <DerivLogo/>.
 */
export const DERIV_VERMELHO = '#ff444f'

/** O nome, em linha, para usar dentro de uma frase. */
export function DerivNome({ tamanho = 13 }: { tamanho?: number }) {
  return (
    <span className="deriv-nome" style={{ fontSize: tamanho }}>
      Deriv
    </span>
  )
}

/**
 * O logotipo (wordmark) OFICIAL da Deriv, vetor deles mesmo (viewBox 73×24).
 * Idêntico ao da marca — inclusive o "d" estilizado. A cor padrão é o coral
 * oficial; passe `cor` para outra (ex.: branco sobre um botão vermelho).
 */
const DERIV_WORDMARK = 'M14.4906 0.757054L13.2523 7.77699H8.95374C4.94349 7.77699 1.12108 11.0248 0.412617 15.0335L0.112747 16.7398C-0.592412 20.7485 2.08327 23.9964 6.09352 23.9964H9.67868C12.6015 23.9964 15.3859 21.6313 15.9 18.7096L19.2018 0L14.4906 0.757054ZM11.4405 18.0475C11.2824 18.95 10.4695 19.6847 9.56664 19.6847H7.38853C5.58606 19.6847 4.38003 18.222 4.69635 16.417L4.88419 15.3531C5.20381 13.5513 6.92389 12.0854 8.72636 12.0854H12.4922L11.4405 18.0475ZM47.5951 23.996L50.4157 8.00062H54.8773L52.0567 23.996H47.5951ZM48.0776 8.18506C47.854 9.45378 47.6294 10.7225 47.4058 11.9913C45.292 11.3346 43.1112 11.5437 42.4412 11.6773C41.7176 15.7845 40.9931 19.8928 40.2685 24H35.8039C36.4102 20.5634 38.4815 8.82687 38.4815 8.82687C39.9336 8.22578 43.4995 7.00588 48.0776 8.18506ZM29.9876 7.77427H26.5145C23.1304 7.77427 19.9045 10.5148 19.308 13.8977L18.6062 17.8735C18.0097 21.2563 20.267 23.9969 23.6512 23.9969H31.0389L31.7968 19.6984H24.8537C23.7269 19.6984 22.9722 18.7859 23.1733 17.6561L23.1964 17.521H34.3901L35.0293 13.8977C35.6257 10.5148 33.3685 7.77427 29.9844 7.77427H29.9876ZM30.5511 13.5551L30.5248 13.7857H23.8686L23.9049 13.5815C24.1058 12.4549 25.134 11.4635 26.2641 11.4635H28.864C29.9811 11.4635 30.7358 12.4385 30.5511 13.5551ZM67.8209 8.00061H72.2857C70.7648 12.0428 67.2792 18.9189 63.9027 23.996H59.4379C57.888 19.1638 56.8872 12.431 56.6962 8.00061H61.1612C61.2418 9.44579 61.889 14.8062 62.6276 18.551C64.6534 14.9079 66.8868 10.128 67.8174 8.00061H67.8209Z'

export function DerivLogo({ altura = 20, cor = DERIV_VERMELHO }: { altura?: number; cor?: string }) {
  return (
    <svg role="img" aria-label="Deriv" height={altura} width={altura * (72.3333 / 24)}
      viewBox="0 0 73 24" fill="none" xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block' }}>
      <path d={DERIV_WORDMARK} fill={cor} />
    </svg>
  )
}

/** Elo de ligação — usado nos botões de conectar. */
export function IconeElo({ tamanho = 15 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={tamanho} height={tamanho} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.6 9.4 4.5 11.5a2.5 2.5 0 0 1-3.5-3.5l2.1-2.1" />
      <path d="M9.4 6.6l2.1-2.1a2.5 2.5 0 0 1 3.5 3.5l-2.1 2.1" />
      <path d="M5.9 10.1l4.2-4.2" />
    </svg>
  )
}

/** Seta de "abre em outro lugar" — para o botão de abrir conta. */
export function IconeSaida({ tamanho = 15 }: { tamanho?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={tamanho} height={tamanho} aria-hidden="true"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 3.5h6.5V10" />
      <path d="M12.5 3.5 7 9" />
      <path d="M11 8.8V12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3.2" />
    </svg>
  )
}
