/** Peças pequenas do Estúdio de anúncios: ícones, a janela de confirmação e os formatos de número. */
import { useEffect, useRef, type ReactNode } from 'react'

export const brl = (v: number, casas = 2) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })
export const int = (v: number) => Math.round(v).toLocaleString('pt-BR')
export const quando = (s: string) => {
  const d = new Date(s), hoje = new Date()
  const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  if (d.toDateString() === hoje.toDateString()) return `hoje, ${h}`
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return `ontem, ${h}`
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}, ${h}`
}

type NomeDoIcone = 'novo' | 'teste' | 'escalar' | 'ajustar' | 'subir' | 'texto' | 'destino' | 'publico' | 'dinheiro' | 'conferir' | 'ok' | 'fechar' | 'voltar' | 'ligar' | 'pausar' | 'relogio' | 'aviso' | 'lixo' | 'olho'
const TRACOS: Record<NomeDoIcone, ReactNode> = {
  novo: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M12 8v8M8 12h8" /></>,
  teste: <><rect x="3" y="5" width="7.5" height="14" rx="2" /><rect x="13.5" y="5" width="7.5" height="14" rx="2" /><path d="M6.7 10.5l-1.2 3h2.4M17.2 10v4" /></>,
  escalar: <><path d="M4 18l5.5-5.5 3.5 3.5L20 9" /><path d="M14.5 9H20v5.5" /></>,
  ajustar: <><path d="M5 7h9M18 7h1M5 17h3M12 17h7" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></>,
  subir: <><path d="M12 16V5M7.5 9.5L12 5l4.5 4.5" /><path d="M5 15v3a2 2 0 002 2h10a2 2 0 002-2v-3" /></>,
  texto: <><path d="M5 6h14M5 11h14M5 16h9" /></>,
  destino: <><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" /><circle cx="12" cy="10" r="2.4" /></>,
  publico: <><circle cx="9" cy="9" r="3.2" /><path d="M3.5 19c.7-3.2 2.9-5 5.5-5s4.8 1.8 5.5 5" /><circle cx="17" cy="9.5" r="2.4" /><path d="M16 14.2c2.4.1 4 1.7 4.5 4.3" /></>,
  dinheiro: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6.5 9.5v.01M17.5 14.5v.01" /></>,
  conferir: <><path d="M9 11.5l2.2 2.2L15.5 9.5" /><rect x="4" y="4" width="16" height="16" rx="4" /></>,
  ok: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  voltar: <path d="M14.5 6l-6 6 6 6" />,
  ligar: <><path d="M12 3v8" /><path d="M7 6.3a7 7 0 1010 0" /></>,
  pausar: <><rect x="7" y="5" width="3.5" height="14" rx="1" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" /></>,
  relogio: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4.5l3 1.8" /></>,
  aviso: <><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17v.01" /></>,
  lixo: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></>,
  olho: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
}
export function Icone({ nome, tam = 20 }: { nome: NomeDoIcone; tam?: number }) {
  return <svg className="es-ic" width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{TRACOS[nome]}</svg>
}

/** A janela de confirmação: tudo que gasta dinheiro ou mexe no que está no ar passa por aqui. */
export function Confirmar({ titulo, children, botao, perigo, indo, erro, confirmar, cancelar }: {
  titulo: string; children: ReactNode; botao: string; perigo?: boolean; indo?: boolean; erro?: string | null; confirmar: () => void; cancelar: () => void
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const atual = useRef({ indo, cancelar }); atual.current = { indo, cancelar }
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null
    caixa.current?.querySelector<HTMLButtonElement>('button.es-cancelar')?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && !atual.current.indo) atual.current.cancelar() }
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('keydown', esc); antes?.focus?.() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="es-modal-fundo" onMouseDown={() => !indo && cancelar()}>
      <div className="es-modal" role="alertdialog" aria-modal="true" aria-labelledby="es-modal-titulo" ref={caixa} onMouseDown={(e) => e.stopPropagation()}>
        <h3 id="es-modal-titulo">{titulo}</h3>
        <div className="es-modal-corpo">{children}</div>
        {erro && <p className="es-erro">{erro}</p>}
        <div className="es-modal-acoes">
          <button type="button" className="es-btn es-cancelar" onClick={cancelar} disabled={indo}>Cancelar</button>
          <button type="button" className={`es-btn ${perigo ? 'perigo' : 'principal'}`} onClick={confirmar} disabled={indo}>{indo ? 'Um momento…' : botao}</button>
        </div>
      </div>
    </div>
  )
}
