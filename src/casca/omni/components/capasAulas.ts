/**
 * A OMNI preserva integralmente o conjunto de capas que ja utilizava.
 * A casca impede que uma troca visual exclusiva da Teeds atravesse a marca.
 */
export const capaDaAula = (id: string): string =>
  `${import.meta.env.BASE_URL}aulas-especialista/${id}.jpg`

/** Capa de uma aula só para a vitrine de um parceiro (só a GlobalFly usa). Aqui: nenhuma. */
export const capaEspecial = (_id: string): string | null => null

/** Arte dos Destaques só para a vitrine de um parceiro (só a GlobalFly usa). Aqui: nenhuma. */
export const destaqueEspecial = (_id: string): string | null => null
