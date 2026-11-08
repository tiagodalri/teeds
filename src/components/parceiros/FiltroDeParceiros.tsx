import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import './filtro-de-parceiros.css'

/*
  O filtro por parceiro (08/11/2026, Tiago: "sempre que tiver esse filtro por
  parceiro, quero um design legal, um botão animado, com a fotinho de cada um,
  como foto de perfil, padrão GF").

  Um componente só para todos os lugares que filtram por parceiro (cabeçalho
  da Administração, Divulgação, Rastreio). A pílula escura desliza até a opção
  escolhida, com um pequeno quique; cada parceiro aparece com a foto de perfil
  num aro, o aro acende em ouro quando ele está escolhido. "Todos" mostra as
  fotos empilhadas; "Direto" (sem link de parceiro), um ícone.
*/

/** Foto de perfil de cada parceiro (public/parceiros/<código>.webp). Sem foto: as iniciais. */
const COM_FOTO = new Set(['n', 'v'])
const fotoDe = (codigo: string) => (COM_FOTO.has(codigo) ? `${import.meta.env.BASE_URL}parceiros/${codigo}.webp` : null)
const iniciais = (nome: string) => nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || '?'

export function AvatarDoParceiro({ codigo, nome, tamanho = 26 }: { codigo: string; nome: string; tamanho?: number }) {
  const foto = fotoDe(codigo)
  const [falhou, setFalhou] = useState(false)
  return (
    <span className="fp-av" style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.4) } as CSSProperties} aria-hidden="true">
      {foto && !falhou ? <img src={foto} alt="" width={tamanho} height={tamanho} loading="lazy" decoding="async" onError={() => setFalhou(true)} /> : <b>{iniciais(nome)}</b>}
    </span>
  )
}

export interface OpcaoDeParceiro {
  /** '' = todos; 'direto' = sem link de parceiro; senão, o código do parceiro (n, v, d…). */
  id: string
  nome: string
  /** Mostra o "/código" ao lado do nome. */
  codigo?: string
  titulo?: string
  /** O nome da pessoa (para as iniciais de quem não tem foto), quando o rótulo leva outra coisa junto. */
  pessoa?: string
  /** Texto antes do nome (ex.: a plataforma), que some no celular para a fileira caber. */
  prefixo?: string
}

export function FiltroDeParceiros({ opcoes, valor, onTrocar, rotulo = 'Parceiro', className = '' }: {
  opcoes: OpcaoDeParceiro[]; valor: string; onTrocar: (id: string) => void; rotulo?: string; className?: string
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const [pilula, setPilula] = useState<{ x: number; w: number } | null>(null)
  // a pílula vai até o botão escolhido (e acompanha quando o tamanho muda)
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => {
      const b = el.querySelector<HTMLElement>('button[aria-pressed="true"]')
      setPilula(b ? { x: b.offsetLeft, w: b.offsetWidth } : null)
    }
    medir()
    // no celular a fileira rola de lado: o escolhido vem para a vista
    const b = el.querySelector<HTMLElement>('button[aria-pressed="true"]')
    if (b && el.scrollWidth > el.clientWidth) el.scrollTo({ left: Math.max(0, b.offsetLeft - (el.clientWidth - b.offsetWidth) / 2), behavior: 'smooth' })
    // mede de novo quando qualquer botão muda de largura (a fonte carregando, a fileira encolhendo)
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    el.querySelectorAll('button').forEach((b) => ro.observe(b))
    let vivo = true
    void document.fonts?.ready.then(() => { if (vivo) medir() })
    return () => { vivo = false; ro.disconnect() }
  }, [valor, opcoes.length])
  const parceiros = opcoes.filter((o) => o.id && o.id !== 'direto')

  return (
    <div ref={caixa} className={`fp ${className}`} role="group" aria-label={rotulo}>
      {pilula && <i className="fp-pilula" style={{ transform: `translateX(${pilula.x}px)`, width: pilula.w }} aria-hidden="true" />}
      {opcoes.map((o) => {
        const ativo = valor === o.id
        return (
          <button key={o.id || 'todos'} type="button" aria-pressed={ativo} title={o.titulo} onClick={() => { if (!ativo) onTrocar(o.id) }}>
            {o.id === '' ? (
              <span className="fp-pilha" aria-hidden="true">
                {parceiros.slice(0, 3).map((p) => <AvatarDoParceiro key={p.id} codigo={p.id} nome={p.pessoa ?? p.nome} tamanho={20} />)}
                {!parceiros.length && <span className="fp-av fp-icone" style={{ width: 22, height: 22 }}><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="8" r="3.2" /><circle cx="16.5" cy="9.5" r="2.6" /><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5M14.6 14.4c2.5-.4 4.9 1 5.6 4.1" /></svg></span>}
              </span>
            ) : o.id === 'direto' ? (
              <span className="fp-av fp-icone" style={{ width: 26, height: 26 }} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            ) : <AvatarDoParceiro codigo={o.id} nome={o.pessoa ?? o.nome} />}
            <span className="fp-nome"><span>{o.prefixo && <span className="fp-prefixo">{o.prefixo} </span>}{o.nome}</span>{o.codigo && <small>/{o.codigo}</small>}</span>
          </button>
        )
      })}
    </div>
  )
}
