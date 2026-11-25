import { marcaPorId, ehFamiliaGF, type Marca } from './marcas'

export type { Marca }
export { MARCAS, marcaPorId, familiaDa, ehFamiliaGF, motorDaMarca, MOTOR_PADRAO } from './marcas'

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
/** As lives de verdade estão ligadas nesta marca? (a sala de treino depende só de `aoVivo`) */
export const LIVES_AO_VIVO = !!MARCA.aoVivo && MARCA.livesAoVivo !== false

/** Este build é da família GlobalFly (GlobalFly ou Legacy Pro)? Ver `familia` em marcas.ts. */
export const FAMILIA_GF = ehFamiliaGF(MARCA.id)

/**
 * Os textos da família GlobalFly (25/11/2026): o que estava escrito "GlobalFly",
 * "GF Member", "GF Raptor"... sai com o nome da marca do site da família. Na
 * GlobalFly os valores são exatamente os de antes; fora da família (Teeds,
 * OMNI, onde o admin cuida da GF pelo seletor) também, para nada mudar lá.
 */
export const GF_NOME = FAMILIA_GF ? (MARCA.nomeCurto ?? MARCA.prosa) : 'GlobalFly'
export const GF_NOME_COMPLETO = FAMILIA_GF ? MARCA.prosa : 'GlobalFly Trade'
export const GF_SIGLA = FAMILIA_GF ? (MARCA.sigla ?? GF_NOME) : 'GF'
export const GF_MEMBRO = FAMILIA_GF ? (MARCA.membro ?? `${GF_SIGLA} Member`) : 'GF Member'
/** O laboratório de estratégias: GFT Lab na GlobalFly, LP Lab na Legacy Pro. */
export const GF_LAB = FAMILIA_GF && MARCA.id !== 'globalfly' ? `${GF_SIGLA} Lab` : 'GFT Lab'
export const PREFIXO_DA_IA = /^(GF|LP|GlobalFly|Legacy Pro|OMNI)\s+/i
