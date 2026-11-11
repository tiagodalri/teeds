/* Peças pequenas do Financeiro (prefixo fin-): janela, campo, seletor, interruptor, avatar, vazio. */
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { IconeFechar } from '../IconeFechar'

/** Janela por cima da tela: no computador uma gaveta à direita, no celular a tela inteira. */
export function Janela({ titulo, sub, aoFechar, children, rodape, largura = 560, tom }: {
  titulo: ReactNode; sub?: ReactNode; aoFechar: () => void; children: ReactNode; rodape?: ReactNode; largura?: number; tom?: 'entrada' | 'saida' | 'socio'
}) {
  const caixa = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    const antes = document.activeElement as HTMLElement | null
    // no computador o cursor já vai para o primeiro campo; no celular não (abriria o teclado por cima da janela)
    const alvo = window.matchMedia('(pointer: fine)').matches ? caixa.current?.querySelector<HTMLElement>('[data-foco]') : null
    ;(alvo ?? caixa.current)?.focus({ preventScroll: true })
    return () => { window.removeEventListener('keydown', tecla); antes?.focus?.({ preventScroll: true }) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="fin-janela-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <div ref={caixa} tabIndex={-1} className={`fin-janela${tom ? ` tom-${tom}` : ''}`} role="dialog" aria-modal="true" aria-label={typeof titulo === 'string' ? titulo : undefined} style={{ ['--fin-janela' as string]: `${largura}px` }}>
        <header>
          <div><h2>{titulo}</h2>{sub && <p>{sub}</p>}</div>
          <button type="button" className="fin-fechar" onClick={aoFechar} aria-label="Fechar"><IconeFechar /></button>
        </header>
        <div className="fin-janela-corpo">{children}</div>
        {rodape && <footer>{rodape}</footer>}
      </div>
    </div>
  )
}

export function Campo({ rotulo, dica, erro, children, largo, className = '' }: { rotulo: ReactNode; dica?: ReactNode; erro?: string | null; children: ReactNode; largo?: boolean; className?: string }) {
  return (
    <label className={`fin-campo${largo ? ' largo' : ''}${erro ? ' com-erro' : ''} ${className}`.trim()}>
      <span className="fin-campo-rot">{rotulo}</span>
      {children}
      {erro ? <small className="fin-campo-erro">{erro}</small> : dica ? <small className="fin-campo-dica">{dica}</small> : null}
    </label>
  )
}

export function Segmentado<T extends string>({ valor, opcoes, aoMudar, rotulo, className = '' }: { valor: T; opcoes: Array<{ id: T; nome: ReactNode; tom?: string; dica?: string }>; aoMudar: (v: T) => void; rotulo: string; className?: string }) {
  return (
    <div className={`fin-seg ${className}`.trim()} role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={valor === o.id} title={o.dica}
          className={`${valor === o.id ? 'on' : ''}${o.tom ? ` tom-${o.tom}` : ''}`} onClick={() => aoMudar(o.id)}>{o.nome}</button>
      ))}
    </div>
  )
}

export function Interruptor({ ligado, aoMudar, rotulo, desc }: { ligado: boolean; aoMudar: (v: boolean) => void; rotulo: ReactNode; desc?: ReactNode }) {
  const id = useId()
  return (
    <div className="fin-interruptor">
      <button type="button" role="switch" id={id} aria-checked={ligado} onClick={() => aoMudar(!ligado)}><i /></button>
      <label htmlFor={id}><b>{rotulo}</b>{desc && <small>{desc}</small>}</label>
    </div>
  )
}

export function Avatar({ nome, cor, tamanho = 36 }: { nome: string; cor?: string; tamanho?: number }) {
  const iniciais = nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
  return <i className="fin-avatar" style={{ ['--fin-cor' as string]: cor ?? 'var(--primary)', width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.36) }} aria-hidden="true">{iniciais}</i>
}

export function Vazio({ titulo, texto, acoes, icone }: { titulo: string; texto?: ReactNode; acoes?: ReactNode; icone?: ReactNode }) {
  return (
    <div className="fin-vazio">
      {icone && <span className="fin-vazio-icone">{icone}</span>}
      <b>{titulo}</b>
      {texto && <p>{texto}</p>}
      {acoes && <div className="fin-vazio-acoes">{acoes}</div>}
    </div>
  )
}

/** "1.234,56", "1234.56", "12,5" → número; vazio ou inválido → null. */
export function lerValor(texto: string): number | null {
  let t = texto.replace(/[^\d.,-]/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if ((t.match(/\./g) ?? []).length > 1 || /\.\d{3}$/.test(t)) t = t.replace(/\./g, '')
  const n = Math.round(Number(t) * 100) / 100
  return Number.isFinite(n) ? n : null
}
export const escreverValor = (n: number | null) => n == null ? '' : n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** As cores que se escolhem para categoria, conta e sócio (todas leem bem nos dois temas). */
export const PALETA = ['#2F6FDB', '#0E8C9B', '#2F8F72', '#0B9E4A', '#B78D39', '#C2410C', '#DC1F2E', '#DB2777', '#7C5CC4', '#1E3D6E', '#64748B', '#94A3B8']

export function EscolherCor({ valor, aoMudar }: { valor: string; aoMudar: (c: string) => void }) {
  return (
    <div className="fin-cores" role="radiogroup" aria-label="Cor">
      {PALETA.map((c) => <button key={c} type="button" role="radio" aria-checked={valor.toLowerCase() === c.toLowerCase()} aria-label={`Cor ${c}`}
        style={{ ['--fin-cor' as string]: c }} onClick={() => aoMudar(c)} />)}
    </div>
  )
}
