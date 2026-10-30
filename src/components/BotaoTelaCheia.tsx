import { useEffect, useState } from 'react'

/**
 * Tela cheia no computador (30/10/2026, Tiago: "aquele botãozinho de tela
 * cheia, para esconder as coisas do navegador"). Usa a tela cheia do próprio
 * navegador (a mesma do F11): some a barra de endereço e as abas, e o Esc sai.
 *
 * Só aparece onde funciona: no iPhone o Safari não deixa uma página inteira ir
 * para a tela cheia, e no celular o app instalado já ocupa a tela.
 */
export function BotaoTelaCheia() {
  const [cheia, setCheia] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  const pode = typeof document !== 'undefined' && document.fullscreenEnabled === true

  useEffect(() => {
    const mudou = () => setCheia(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', mudou)
    return () => document.removeEventListener('fullscreenchange', mudou)
  }, [])

  if (!pode) return null

  const alternar = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined)
    else void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined)
  }

  return (
    <button type="button" className="tema-btn tela-cheia-btn" onClick={alternar}
      title={cheia ? 'Sair da tela cheia (Esc)' : 'Tela cheia'}
      aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'} aria-pressed={cheia}>
      {cheia ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      )}
    </button>
  )
}
