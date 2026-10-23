/**
 * A escala da plataforma no computador (22/10/2026). O Tiago achou tudo
 * grande demais com o navegador em 100%: ficava bom só com o zoom em 90%.
 * Agora a página inteira já nasce em 90% no computador (mouse e tela de
 * pelo menos 1024 px). No celular e no tablet nada muda.
 *
 * Com a escala, o navegador mede o que está na tela (getBoundingClientRect,
 * clientX/Y) em px da TELA, e o CSS da página trabalha em px da PÁGINA.
 * `naPagina` converte: quem mede algo na tela para posicionar outra coisa
 * por CSS (tour, janelas arrastáveis, gráfico) passa a medida por ela.
 *
 * As medidas pela tela do CSS (100dvh, 5vw...) são divididas pela escala no
 * build (vite.config.ts, --escala-pagina), para a página ocupar a tela toda.
 * Navegador em que essa conta não fecha fica sem a escala: a plataforma testa
 * ao abrir e, se a altura não bater, volta a 100%.
 */
export const ESCALA = 0.9
const NO_COMPUTADOR = '(min-width: 1024px) and (hover: hover) and (pointer: fine)'

// o Safari mede o mouse com a escala de outro jeito: lá a página fica em 100%
const SAFARI = typeof navigator !== 'undefined' && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FxiOS/.test(navigator.userAgent)
let atual = 1
export const escalaDaPagina = () => atual
/** Uma medida da tela (px que o usuário vê) em px do CSS da página. */
export const naPagina = (v: number) => v / atual

export function aplicarEscala(): void {
  const raiz = document.documentElement
  const quer = typeof matchMedia === 'function' && matchMedia(NO_COMPUTADOR).matches && !SAFARI
  raiz.style.zoom = quer ? String(ESCALA) : ''
  atual = quer ? ESCALA : 1
  raiz.style.setProperty('--escala-pagina', String(atual))
  if (quer && document.body) {
    // o teste: um bloco de 100vh compensado precisa ocupar a janela inteira
    const sonda = document.createElement('div')
    sonda.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:calc(100vh / var(--escala-pagina, 1));visibility:hidden;pointer-events:none'
    document.body.appendChild(sonda)
    const confere = Math.abs(sonda.getBoundingClientRect().height - window.innerHeight) < 2
    sonda.remove()
    if (!confere) { raiz.style.zoom = ''; atual = 1 }
  }
  raiz.style.setProperty('--escala-pagina', String(atual))
  raiz.dataset.escala = String(atual)
}

/** Aplica agora e de novo quando a janela muda (ex.: monitor trocado, janela estreitada). */
export function ligarEscala(): void {
  aplicarEscala()
  try { matchMedia(NO_COMPUTADOR).addEventListener('change', aplicarEscala) } catch { /* navegador antigo: fica a de agora */ }
}
