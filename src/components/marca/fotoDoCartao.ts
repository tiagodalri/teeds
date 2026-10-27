/**
 * A foto do cartão alto de cada I.A. (27/10/2026, Tiago: o Legacy e o Phenom
 * apareciam sem o bico e sem a cauda). As fotos são 16:10 e os cartões da
 * frota são quase quadrados (no celular, mais altos que largos): os jatos
 * compridos perdiam as pontas. Esses dois ganharam uma versão em pé, com o
 * avião inteiro no meio e o céu e a pista estendidos em cima e embaixo.
 * Onde o cartão é largo (vitrine), vale a foto original.
 */
const FOTOS = `${import.meta.env.BASE_URL}robos-globalfly/`
const EM_PE = new Set(['legacy', 'ag2'])

export function fotoDoCartaoAlto(id: string): { src: string; srcSet: string } {
  const base = EM_PE.has(id) ? `${id}-cartao` : id
  return { src: `${FOTOS}${base}.webp`, srcSet: `${FOTOS}${base}-pequena.webp 640w, ${FOTOS}${base}.webp 1200w` }
}
