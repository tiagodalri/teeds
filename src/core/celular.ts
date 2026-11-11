/**
 * A casca do celular vale para tela estreita (até 900 px) e também para tela de toque
 * baixa — o celular deitado, que no iPhone Pro Max tem 932 px de largura (11/11/2026).
 * É a mesma consulta que o vite.config.ts acrescenta a todo `@media (max-width: 900px)`.
 */
export const CONSULTA_CELULAR = '(max-width: 900px), (max-height: 500px) and (pointer: coarse)'

export const ehCelular = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(CONSULTA_CELULAR).matches
