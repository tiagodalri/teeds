import { useEffect } from 'react'

/**
 * Comportamentos de app nativo para telas cheias (stories, 09/11/2026, Tiago: "preciso de uma
 * experiência perfeita no PWA... como se eu tivesse postando no próprio Instagram").
 */

/**
 * O teclado do celular: --teclado no <html> com a altura que ele cobre. No iPhone o teclado passa
 * por cima das telas fixas; com isso as barras de baixo (cores do texto, resposta, botões das
 * folhas) sobem junto e nada fica escondido.
 */
export function useTecladoVirtual() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const r = document.documentElement
    const medir = () => {
      const t = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      r.style.setProperty('--teclado', `${Math.round(t)}px`)
      r.classList.toggle('com-teclado', t > 60)
    }
    medir()
    vv.addEventListener('resize', medir)
    vv.addEventListener('scroll', medir)
    return () => {
      vv.removeEventListener('resize', medir); vv.removeEventListener('scroll', medir)
      r.style.removeProperty('--teclado'); r.classList.remove('com-teclado')
    }
  }, [])
}

/**
 * O botão Voltar (Android, gesto de voltar) fecha a tela cheia em vez de sair do app.
 * Empilha uma entrada no histórico ao abrir; fechar pela tela tira a entrada, a menos que
 * outra tela já tenha empilhado por cima (um botão do story levou para Aulas, por exemplo).
 */
/** iPhone/iPad (o iPad novo se apresenta como Mac com toque). */
const IOS = typeof navigator !== 'undefined' && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

export function useVoltarFecha(fechar: () => void) {
  useEffect(() => {
    // no iPhone não há botão Voltar, e no app instalado na tela inicial o iOS trata cada pushState/back
    // como navegação e APAGA a permissão da câmera (WebKit bug 215884): o estúdio pedia a câmera toda vez
    // (09/11/2026, Tiago: "no PWA ele não está lembrando que eu dei permissão... pedindo literalmente toda vez")
    if (IOS) return
    const marca = `tela-cheia-${Math.random().toString(36).slice(2)}`
    history.pushState({ ...(history.state ?? {}), telaCheia: marca }, '')
    let saiuPeloVoltar = false
    const voltar = () => { if (history.state?.telaCheia !== marca) { saiuPeloVoltar = true; fechar() } }
    window.addEventListener('popstate', voltar)
    return () => {
      window.removeEventListener('popstate', voltar)
      // depois do quadro: se outra tela cheia já empilhou por cima (ou o React remontou), não volta
      if (!saiuPeloVoltar) window.setTimeout(() => { if (history.state?.telaCheia === marca) history.back() }, 0)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
