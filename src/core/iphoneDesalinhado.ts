/**
 * O app instalado no iPhone com o iOS 26 (10/11/2026, vídeo do Tiago: barra de baixo
 * parada no meio da tela, o topo sumindo e o conteúdo passando por baixo da hora).
 *
 * É um defeito do próprio iOS 26 (WebKit 297779): depois que o teclado ou um seletor
 * fecha, a parte da tela que o sistema usa para os elementos fixos fica deslocada da
 * parte que aparece. Tudo que é fixo embaixo (barra, suporte) sobe, e o que é preso no
 * topo (cabeçalho, faixa da hora) sai da tela. No alto da página não acontece.
 *
 * O que fazemos, só no app instalado no iPhone:
 *  1. quando um campo perde o foco, uma rolagem de 1 px e volta, que faz o iOS
 *     recalcular;
 *  2. se ainda assim ficar deslocado, o <html> ganha a classe `vv-desalinhado` com o
 *     tamanho do desvio (--vv-cima, --vv-baixo), e o CSS (mobile-polish.css) empurra
 *     a barra, o topo e os botões flutuantes de volta para a borda da tela.
 * Com o teclado aberto, com zoom de pinça ou fora do iPhone, nada muda.
 */
export function ligarCorrecaoDoIphone(): void {
  if (typeof window === 'undefined' || !window.visualViewport) return
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const instalado = (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches
  if (!ios || !instalado) return
  const vv = window.visualViewport
  const raiz = document.documentElement
  const editando = () => {
    const a = document.activeElement as HTMLElement | null
    return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
  }
  const desvio = () => ({ cima: vv.offsetTop, baixo: vv.offsetTop + vv.height - window.innerHeight })
  const torto = () => {
    if (editando() || Math.abs(vv.scale - 1) > 0.01) return false
    const d = desvio()
    return Math.abs(d.cima) > 1 || Math.abs(d.baixo) > 1
  }
  let quadro = 0
  const aplicar = () => {
    quadro = 0
    const t = torto(), d = desvio()
    raiz.classList.toggle('vv-desalinhado', t)
    raiz.style.setProperty('--vv-cima', t ? `${Math.round(d.cima)}px` : '0px')
    raiz.style.setProperty('--vv-baixo', t ? `${Math.round(d.baixo)}px` : '0px')
  }
  const agendar = () => { if (!quadro) quadro = requestAnimationFrame(aplicar) }
  const desentortar = () => {
    if (torto()) { const x = window.scrollX, y = window.scrollY; window.scrollTo(x, y + 1); window.scrollTo(x, y) }
    agendar()
  }
  vv.addEventListener('resize', agendar)
  vv.addEventListener('scroll', agendar)
  window.addEventListener('scroll', agendar, { passive: true })
  window.addEventListener('resize', agendar)
  document.addEventListener('focusout', () => { setTimeout(desentortar, 80); setTimeout(desentortar, 450) })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(desentortar, 120) })
  agendar()
}
