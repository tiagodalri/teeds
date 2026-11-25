import { useEffect, type RefObject } from 'react'

/**
 * Título do topo inteiro ou nenhum (25/11/2026, print do Tiago no iPhone: "Meu p…"). Quando o nome da
 * tela não cabe inteiro ao lado do saldo, ele some em vez de aparecer cortado: a barra de baixo e a
 * própria página já dizem onde a pessoa está. Mede de novo quando a largura muda (outro item no topo,
 * celular deitado) e quando a tela troca.
 */
export function useTituloInteiro(caixa: RefObject<HTMLElement | null>, tela: string): void {
  useEffect(() => {
    const el = caixa.current
    const titulo = el?.querySelector('strong')
    if (!el || !titulo || typeof ResizeObserver === 'undefined') return
    // visibility (não display): a caixa continua do mesmo tamanho, então medir não mexe no topo
    const medir = () => el.classList.toggle('titulo-nao-cabe', titulo.scrollWidth > titulo.clientWidth + 1)
    const vigia = new ResizeObserver(medir)
    vigia.observe(el)
    window.addEventListener('resize', medir, { passive: true })
    medir()
    return () => { vigia.disconnect(); window.removeEventListener('resize', medir) }
  }, [caixa, tela])
}
