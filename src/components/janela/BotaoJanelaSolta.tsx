/**
 * O botão que solta um painel da plataforma numa janela própria (janelaSolta.ts).
 * Só aparece no computador. Com a janela já aberta, ele avisa e traz a janela
 * para a frente.
 */
import { useEffect, useState } from 'react'
import { abrirJanelaSolta, podeSoltarJanela, useJanelasAbertas, type QualJanela } from '../../core/janelaSolta'
import './janela-solta.css'

export function BotaoJanelaSolta({ qual, className = '' }: { qual: QualJanela; className?: string }) {
  const [pode, setPode] = useState(podeSoltarJanela)
  const abertas = useJanelasAbertas()
  const [bloqueada, setBloqueada] = useState(false)
  const aberta = abertas.has(qual)

  // a janela estreitou (ou foi para um monitor menor): o botão some junto com o "computador"
  useEffect(() => {
    const m = matchMedia('(min-width: 1024px) and (hover: hover) and (pointer: fine)')
    const ver = () => setPode(podeSoltarJanela())
    try { m.addEventListener('change', ver) } catch { /* navegador antigo */ }
    return () => { try { m.removeEventListener('change', ver) } catch { /* idem */ } }
  }, [])
  useEffect(() => {
    if (!bloqueada) return
    const t = window.setTimeout(() => setBloqueada(false), 7_000)
    return () => window.clearTimeout(t)
  }, [bloqueada])

  if (!pode) return null
  const titulo = aberta
    ? 'Esta tela já está numa janela solta. Clique para trazer a janela para a frente.'
    : 'Abre esta tela numa janela própria: arraste para onde quiser, até para outro monitor.'
  return (
    <span className={`js-botao-lugar ${className}`}>
      <button type="button" className={`js-botao${aberta ? ' aberta' : ''}`} title={titulo}
        onClick={() => setBloqueada(!abrirJanelaSolta(qual))}>
        {aberta ? <i className="js-ponto" aria-hidden="true" /> : <IconeSoltar />}
        <span>{aberta ? 'Janela aberta' : 'Soltar janela'}</span>
      </button>
      {bloqueada && (
        <span className="js-bloqueada" role="alert">
          O navegador bloqueou a janela. Libere as janelas pop-up deste site (ícone na barra de endereço) e clique de novo.
        </span>
      )}
    </span>
  )
}

function IconeSoltar() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 4h6v6M20 4l-8 8" />
      <path d="M18 14v4a2 2 0 01-2 2H6a2 2 0 01-2-2V8a2 2 0 012-2h4" />
    </svg>
  )
}
