/** Capas editoriais exclusivas da Teeds. */
export const capaDaAula = (id: string): string =>
  `${import.meta.env.BASE_URL}aulas-teeds/${id}.jpg`

/** Capa de uma aula só para a vitrine de um parceiro (a GlobalFly tem as do Naor). Aqui: nenhuma. */
export const capaEspecial = (_id: string): string | null => null

/** Arte dos Destaques só para a vitrine de um parceiro (só a GlobalFly usa). Aqui: nenhuma. */
export const destaqueEspecial = (_id: string): string | null => null
