/**
 * A GlobalFly usa o mesmo conjunto de capas fotográficas da OMNI (sem marca
 * nas fotos). A pasta da Teeds (aulas-teeds/) nem vai para este site.
 */
export const capaDaAula = (id: string): string =>
  `${import.meta.env.BASE_URL}aulas-especialista/${id}.jpg`
