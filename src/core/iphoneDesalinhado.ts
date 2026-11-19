/**
 * O app instalado no iPhone com o iOS 26: depois que o teclado ou um seletor fecha, os elementos
 * fixos ficam no lugar errado (barra de baixo no meio da tela, topo sumindo). Defeito do próprio
 * iOS (WebKit 297779), que aparece de dois jeitos:
 *
 *  A) a parte visível fica deslocada (visualViewport.offsetTop não volta a 0): o topo sai da tela;
 *  B) a altura da página encolhe para a altura de quando o teclado estava aberto e nunca volta
 *     (innerHeight, visualViewport.height e 100dvh, todos juntos, ficam ~300 px menores): a barra de
 *     baixo fica parada no meio da tela com a página passando por baixo dela.
 *     (18/11/2026, print do Tiago no Meu perfil.)
 *
 * A 1ª versão (10/11) só enxergava o caso A: comparava o visualViewport com o innerHeight, e no caso B
 * os dois mentem juntos, então ela nunca entrava. Agora a conta não confia nos números do iOS:
 *  - uma sonda invisível presa no pé (position: fixed; bottom: 0) mostra onde o iOS está desenhando
 *    o que é fixo embaixo;
 *  - a altura verdadeira da tela é a MAIOR altura já vista nessa orientação sem teclado (o app sempre
 *    abre certo), nunca maior que a tela do aparelho;
 *  - se a sonda estiver longe de onde deveria, primeiro tentamos fazer o iOS recalcular (rolagem de
 *    1 px e um elemento de altura cheia que some e volta); se continuar torto, o <html> ganha
 *    `vv-desalinhado` com o tamanho do desvio (--vv-baixo) e o CSS (mobile-polish.css) empurra a
 *    barra e os botões flutuantes de volta para o pé da tela.
 * Com teclado aberto, zoom de pinça ou fora do app instalado no iPhone, nada muda.
 *
 * 19/11/2026 (print do Tiago na Visão geral: cabeçalho escuro parado no meio da tela e a barra de
 * baixo sumida): o próprio visualViewport.offsetTop também mente — fica em ~300 px depois do teclado
 * com a tela, na verdade, no lugar. A versão de 18/11 somava esse número e empurrava o cabeçalho
 * 300 px para baixo e a barra de baixo 300 px para fora da tela. Agora:
 *  - o offsetTop não entra em conta nenhuma;
 *  - o topo nunca é empurrado (no caso B a página encolhe por baixo; o topo continua no lugar);
 *  - o que fica no pé só DESCE até o pé da tela, nunca sobe;
 *  - a cutucada para o iOS recalcular (rolagem de 1 px) acontece uma vez por fechamento de teclado.
 */
export function ligarCorrecaoDoIphone(): void {
  if (typeof window === 'undefined' || !window.visualViewport) return
  semZoomAoTocarNoCampo()
  const iphone = /iPhone|iPod/.test(navigator.userAgent)
  const instalado = (navigator as unknown as { standalone?: boolean }).standalone === true || matchMedia('(display-mode: standalone)').matches
  if (!iphone || !instalado) return
  const vv = window.visualViewport
  const raiz = document.documentElement

  const sonda = (estilo: string) => {
    const el = document.createElement('div')
    el.setAttribute('aria-hidden', 'true')
    el.style.cssText = `position:fixed;left:0;width:1px;height:1px;${estilo};visibility:hidden;pointer-events:none;z-index:-1;contain:strict`
    document.body.appendChild(el)
    return el
  }
  const pe = sonda('bottom:0')
  // elemento de altura cheia que some e volta: obriga o iOS a medir a tela de novo
  const cheio = sonda('top:0;height:100dvh')

  const editando = () => {
    const a = document.activeElement as HTMLElement | null
    return !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))
  }
  // deitado ou de pé: o teclado encolhe só a altura, e nem de pé (393 x ~540) nem deitado (852 x ~180) a
  // página encolhida troca de formato; o screen.orientation não serve (mente em alguns navegadores)
  const deitado = () => window.innerWidth > window.innerHeight
  const maior = { em_pe: 0, deitado: 0 }
  const lembrar = () => {
    if (editando() || Math.abs(vv.scale - 1) > 0.01) return
    const chave = deitado() ? 'deitado' : 'em_pe'
    const visto = Math.max(window.innerHeight, vv.height, raiz.clientHeight)
    // nunca mais alta que a tela do aparelho (no iPhone, screen não gira)
    const teto = deitado() ? Math.min(screen.width, screen.height) : Math.max(screen.width, screen.height)
    maior[chave] = Math.min(Math.max(maior[chave], visto), teto + 1)
  }
  let girou = false
  /** Quanto o que é fixo embaixo está ACIMA do pé da tela (0 se está no lugar). */
  const desvio = () => {
    const altura = maior[deitado() ? 'deitado' : 'em_pe']
    return altura ? Math.max(0, Math.round(altura - pe.getBoundingClientRect().bottom)) : 0
  }
  const LIMIAR = 8
  const torto = (d = desvio()) => !girou && !editando() && Math.abs(vv.scale - 1) <= 0.01 && d >= LIMIAR

  let quadro = 0
  const aplicar = () => {
    quadro = 0
    lembrar()
    const d = desvio(), t = torto(d)
    raiz.classList.toggle('vv-desalinhado', t)
    raiz.style.setProperty('--vv-baixo', t ? `${d}px` : '0px')
  }
  const agendar = () => { if (!quadro) quadro = requestAnimationFrame(aplicar) }
  let cutucou = false
  const desentortar = () => {
    if (!cutucou && torto()) {
      cutucou = true
      const x = window.scrollX, y = window.scrollY
      window.scrollTo(x, y + 1); window.scrollTo(x, y)
      cheio.style.display = 'none'; void cheio.offsetHeight; cheio.style.display = ''; void cheio.offsetHeight
    }
    agendar()
  }
  // o teclado leva ~300 ms para sair: mede de novo em alguns momentos até assentar
  const depoisDoTeclado = () => { cutucou = false; for (const ms of [60, 200, 450, 800, 1400]) setTimeout(desentortar, ms) }

  vv.addEventListener('resize', agendar)
  vv.addEventListener('scroll', agendar)
  window.addEventListener('scroll', agendar, { passive: true })
  window.addEventListener('resize', agendar)
  window.addEventListener('orientationchange', () => {
    // girando, as medidas mudam no meio: espera assentar antes de corrigir
    girou = true; agendar()
    setTimeout(() => { girou = false; depoisDoTeclado() }, 700)
  })
  window.addEventListener('pageshow', depoisDoTeclado)
  document.addEventListener('focusin', agendar)
  document.addEventListener('focusout', depoisDoTeclado)
  document.addEventListener('change', (e) => { if ((e.target as HTMLElement | null)?.tagName === 'SELECT') depoisDoTeclado() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) depoisDoTeclado() })
  lembrar()
  agendar()
}

/**
 * iPhone/iPad: ao tocar num campo com letra menor que 16 px, o Safari aproxima a página sozinho e não
 * afasta quando o teclado fecha (a tela fica "grande" e os fixos parecem fora do lugar, coisa que app
 * nativo não faz). `maximum-scale=1` desliga só esse zoom automático: desde o iOS 10 o Safari ignora
 * esse limite para o zoom de pinça, então quem precisa aproximar com dois dedos continua podendo.
 * Só no iOS: no Android o mesmo limite travaria a pinça.
 */
function semZoomAoTocarNoCampo(): void {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  if (!ios || !meta || /maximum-scale/.test(meta.content)) return
  meta.content = `${meta.content}, maximum-scale=1`
}
