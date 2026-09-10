/**
 * O "x" de fechar, em vetor.
 *
 * Todos os botoes de fechar usavam o caractere "×" solto, com tamanho de
 * fonte: cada fonte joga o glifo para um lado e ele nunca fica no centro da
 * bolinha. Um vetor centrado por flex fica no lugar em qualquer fonte, tema
 * ou tamanho — o botao dita o tamanho pelo font-size (o icone mede .6em).
 */
export function IconeFechar({ grossura = 1.8 }: { grossura?: number }) {
  return (
    <svg className="icone-fechar" viewBox="0 0 16 16" aria-hidden="true" focusable="false"
      fill="none" stroke="currentColor" strokeWidth={grossura} strokeLinecap="round">
      <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
    </svg>
  )
}
