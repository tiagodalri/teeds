import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { PRIORIDADES, type Conversa, type Prioridade } from '../../core/teeds/suporte'
import { naPagina } from '../../core/escala'

/*
  O menu da conversa (26/10/2026, Tiago: "clicar nas conversas com o botão
  direito e ter funções, de apagar etc., assim como no WhatsApp"). Abre no
  botão direito, no toque longo (celular) e na tecla de menu do teclado.
  Quem decide o que cada item faz é a caixa do suporte (AdminSuporte).
*/

export type AcaoDaConversa =
  | { tipo: 'fixar' } | { tipo: 'lida' } | { tipo: 'atribuir' } | { tipo: 'prioridade'; valor: Prioridade }
  | { tipo: 'resolver' } | { tipo: 'arquivar' } | { tipo: 'copiar-email' } | { tipo: 'apagar' }

interface Props {
  conversa: Conversa
  /** Onde abrir, em px da TELA (clientX/Y do clique). */
  x: number
  y: number
  minha: boolean
  temEmail: boolean
  aoEscolher: (a: AcaoDaConversa) => void
  fechar: () => void
}

const D = {
  fixar: 'M15 4l5 5-3 1-3 3 .5 4.5L13 19l-3.5-3.5L5 20l-1-1 4.5-4.5L5 11l1.5-1.5L11 10l3-3z',
  lida: 'M4 6h16v12H4zM4 7l8 6 8-6',
  atribuir: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 20a8 8 0 0116 0',
  prioridade: 'M5 21V4M5 4h11l-2 4 2 4H5',
  resolver: 'M5 12.5l4.2 4.2L19 7',
  reabrir: 'M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4',
  arquivar: 'M4 5h16v4H4zM5 9v10h14V9M10 13h4',
  copiar: 'M9 9h10v11H9zM5 15V4h10',
  apagar: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  seta: 'M9 6l6 6-6 6',
}
const Ic = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>

export function MenuDaConversa({ conversa: c, x, y, minha, temEmail, aoEscolher, fechar }: Props) {
  const caixa = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: naPagina(x), top: naPagina(y) })
  const [sub, setSub] = useState(false)

  // não deixa o menu sair da tela: mede em px da tela e posiciona em px da página (core/escala)
  useLayoutEffect(() => {
    const el = caixa.current; if (!el) return
    const r = el.getBoundingClientRect()
    setPos({ left: naPagina(Math.max(8, Math.min(x, window.innerWidth - r.width - 8))), top: naPagina(Math.max(8, Math.min(y, window.innerHeight - r.height - 8))) })
  }, [x, y])

  useEffect(() => {
    const fora = (e: Event) => { if (!caixa.current?.contains(e.target as Node)) fechar() }
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); fechar(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      e.preventDefault()
      const itens = [...(caixa.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])]
      const i = itens.indexOf(document.activeElement as HTMLButtonElement)
      itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus()
    }
    window.addEventListener('pointerdown', fora, true)
    window.addEventListener('keydown', tecla)
    window.addEventListener('resize', fechar)
    document.addEventListener('scroll', fechar, true)
    caixa.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus()
    return () => {
      window.removeEventListener('pointerdown', fora, true); window.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', fechar); document.removeEventListener('scroll', fechar, true)
    }
  }, [fechar])

  const item = (d: string, texto: string, a: AcaoDaConversa, extra = '') => (
    <button type="button" role="menuitem" className={`sx-menu-item ${extra}`} onClick={() => aoEscolher(a)}><Ic d={d} /><span>{texto}</span></button>
  )

  return (
    <div ref={caixa} className="sx-menu" role="menu" aria-label="Ações da conversa" style={pos} onContextMenu={(e) => e.preventDefault()}>
      {item(D.fixar, c.fixadaEm ? 'Desafixar' : 'Fixar no topo', { tipo: 'fixar' })}
      {item(D.lida, c.naoLidasEquipe > 0 ? 'Marcar como lida' : 'Marcar como não lida', { tipo: 'lida' })}
      {item(D.atribuir, minha ? 'Tirar de mim' : 'Atribuir a mim', { tipo: 'atribuir' })}
      <div className="sx-menu-sub" onMouseEnter={() => setSub(true)} onMouseLeave={() => setSub(false)}>
        <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={sub} className="sx-menu-item" onClick={() => setSub((v) => !v)}
          onKeyDown={(e) => { if (e.key === 'ArrowRight') { e.preventDefault(); setSub(true) } }}>
          <Ic d={D.prioridade} /><span>Prioridade</span><em>{PRIORIDADES[c.prioridade]}</em><Ic d={D.seta} />
        </button>
        {sub && (
          <div className="sx-menu sx-menu-lado" role="menu" aria-label="Prioridade">
            {(Object.keys(PRIORIDADES) as Prioridade[]).map((p) => (
              <button type="button" role="menuitemradio" aria-checked={c.prioridade === p} key={p} className={`sx-menu-item ${c.prioridade === p ? 'on' : ''}`}
                onClick={() => aoEscolher({ tipo: 'prioridade', valor: p })}><i className={`sx-menu-bola ${p}`} /><span>{PRIORIDADES[p]}</span></button>
            ))}
          </div>
        )}
      </div>
      {item(c.status === 'resolvida' ? D.reabrir : D.resolver, c.status === 'resolvida' ? 'Reabrir' : 'Marcar como resolvida', { tipo: 'resolver' })}
      {item(D.arquivar, c.arquivadaEm ? 'Desarquivar' : 'Arquivar', { tipo: 'arquivar' })}
      {temEmail && item(D.copiar, 'Copiar e-mail do cliente', { tipo: 'copiar-email' })}
      <hr />
      {item(D.apagar, 'Apagar conversa', { tipo: 'apagar' }, 'perigo')}
    </div>
  )
}
