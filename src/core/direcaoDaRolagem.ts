/**
 * Botões flutuantes que saem do caminho enquanto a pessoa lê (18/11/2026, print do Tiago: o botão
 * dourado do chat da equipe ficava em cima do campo Telefone do perfil, e em todas as telas em cima de
 * algum conteúdo). Como nos apps nativos: rolando para baixo o botão sai de lado; rolando para cima,
 * parando no fim da página ou voltando ao topo, ele volta. Só no celular; o CSS de cada botão decide
 * o que fazer com `html.rolando-para-baixo`.
 */
export function ligarDirecaoDaRolagem(): void {
  if (typeof window === 'undefined') return
  const celular = matchMedia('(max-width: 900px)')
  const raiz = document.documentElement
  let ultimo = window.scrollY
  let quadro = 0
  const medir = () => {
    quadro = 0
    const y = window.scrollY
    const fim = y + window.innerHeight >= document.documentElement.scrollHeight - 24
    if (!celular.matches || y < 80 || fim) raiz.classList.remove('rolando-para-baixo')
    else if (y > ultimo + 6) raiz.classList.add('rolando-para-baixo')
    else if (y < ultimo - 6) raiz.classList.remove('rolando-para-baixo')
    if (Math.abs(y - ultimo) > 6 || y < 80) ultimo = y
  }
  window.addEventListener('scroll', () => { if (!quadro) quadro = requestAnimationFrame(medir) }, { passive: true })
}
