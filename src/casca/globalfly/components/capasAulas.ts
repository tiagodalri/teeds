/**
 * Capas da sala de aula da GlobalFly: pôsteres verticais (2:3), um por aula,
 * em public/aulas-globalfly/ com o id da aula como nome. Só este site recebe
 * a pasta (vite.config.ts tira aulas-<outra marca> dos outros builds).
 */
export const capaDaAula = (id: string): string =>
  `${import.meta.env.BASE_URL}aulas-globalfly/${id}.jpg`
