import { marcaPorId, type Marca } from './marcas'

export type { Marca }
export { MARCAS, marcaPorId } from './marcas'

/**
 * A marca deste build.
 *
 * Escolhida na hora de montar o site, não na hora de rodar:
 *
 *   npm run build              → Teeds
 *   MARCA=omni npm run build   → OMNI
 *
 * Sai um site por marca, do mesmo código. Quem consertar um defeito
 * conserta nos dois.
 */
const escolhida =
  typeof import.meta !== 'undefined'
    ? ((import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MARCA)
    : undefined

export const MARCA: Marca = marcaPorId(escolhida)
