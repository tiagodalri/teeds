import { useEffect, useRef, useState } from 'react'
import { Track } from 'livekit-client'
import { fixarAqui, fixarParaTodos, useTreino, type PessoaNoPalco } from '../../core/live/treino'
import './palco-lado-a-lado.css'

/**
 * O palco da live com vários administradores (26/11/2026, pedido do Tiago:
 * "a mesma estrutura do Meet"). Cada pessoa da equipe no seu quadro, lado a
 * lado; a tela compartilhada ganha o destaque sozinha; qualquer quadro se fixa
 * (e desfixa) com um clique. Quem assiste fixa só para si; a equipe pode fixar
 * também para todos.
 */

type Quadro = { chave: string; pessoa: PessoaNoPalco; tipo: 'camera' | 'tela'; faixa: Track | MediaStreamTrack | null }

function quadrosDo(palco: PessoaNoPalco[]): Quadro[] {
  const lista: Quadro[] = []
  for (const p of palco) {
    lista.push({ chave: `${p.id}:camera`, pessoa: p, tipo: 'camera', faixa: p.camera })
    if (p.tela) lista.push({ chave: `${p.id}:tela`, pessoa: p, tipo: 'tela', faixa: p.tela })
  }
  return lista
}

/** Liga a faixa (recebida da sala ou do próprio aparelho) a um <video>. */
function Video({ faixa, espelhar, conter }: { faixa: Track | MediaStreamTrack; espelhar: boolean; conter: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (faixa instanceof Track) { faixa.attach(el); return () => { faixa.detach(el) } }
    el.srcObject = new MediaStream([faixa])
    void el.play().catch(() => undefined)
    return () => { el.srcObject = null }
  }, [faixa])
  return <video ref={ref} className={`pl-video ${conter ? 'conter' : ''}`} autoPlay playsInline muted style={espelhar ? { transform: 'scaleX(-1)' } : undefined} />
}

const iniciais = (nome: string) => nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '?'
const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] || nome

const ICONE = {
  fixar: 'M9 4h6l-1 6 4 4H6l4-4zM12 14v6',
  desfixar: 'M9 4h6l-1 6 4 4H6l4-4zM12 14v6M4 4l16 16',
  micDesligado: 'M12 3a3 3 0 013 3v4M9 9v3a3 3 0 005 2.2M5 11a7 7 0 0011.6 5.3M19 11a7 7 0 01-.5 2.6M12 18v3M4 4l16 16',
  todos: 'M16 11a3 3 0 100-6 3 3 0 000 6zM8 11a3 3 0 100-6 3 3 0 000 6zM2 20a6 6 0 0112 0M12 20a6 6 0 0110 0',
}
const Svg = ({ d, t = 16 }: { d: string; t?: number }) => (
  <svg viewBox="0 0 24 24" width={t} height={t} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
)

function QuadroDoPalco({ q, fixado, destaque, compacto, equipe, fixadoParaTodos }: {
  q: Quadro; fixado: boolean; destaque: boolean; compacto: boolean; equipe: boolean; fixadoParaTodos: boolean
}) {
  const [menu, setMenu] = useState(false)
  const { pessoa, tipo, faixa } = q
  const nome = tipo === 'tela' ? `Tela de ${primeiro(pessoa.nome)}` : pessoa.eu ? `${primeiro(pessoa.nome)} (você)` : pessoa.nome
  const rotulo = fixado ? `Desfixar ${nome}` : `Fixar ${nome}`
  useEffect(() => {
    if (!menu) return
    const fechar = () => setMenu(false)
    const t = window.setTimeout(() => document.addEventListener('pointerdown', fechar, { once: true }), 0)
    return () => { window.clearTimeout(t); document.removeEventListener('pointerdown', fechar) }
  }, [menu])
  const alternar = () => {
    if (!equipe) { fixarAqui(fixado ? '' : q.chave); return }
    setMenu((m) => !m)
  }
  return (
    <figure className={`pl-quadro ${tipo} ${destaque ? 'destaque' : ''} ${pessoa.falando && tipo === 'camera' ? 'falando' : ''} ${compacto ? 'compacto' : ''}`}>
      {faixa
        ? <Video faixa={faixa} espelhar={pessoa.eu && tipo === 'camera'} conter={tipo === 'tela'} />
        : <div className="pl-sem-camera" aria-hidden><span>{iniciais(pessoa.nome)}</span></div>}
      <figcaption className="pl-nome">
        {tipo === 'camera' && !pessoa.mic && <span className="pl-mudo" title="Microfone desligado"><Svg d={ICONE.micDesligado} t={13} /><span className="av-oculto">Microfone desligado</span></span>}
        <span className="pl-nome-txt">{nome}</span>
        {fixado && <span className="pl-fixo" title={fixadoParaTodos ? 'Fixado para todos' : 'Fixado'}><Svg d={ICONE.fixar} t={12} />{fixadoParaTodos && !compacto && <small>para todos</small>}</span>}
      </figcaption>
      <div className="pl-acoes">
        <button type="button" className="pl-fixar" onPointerDown={(e) => e.stopPropagation()} onClick={alternar} aria-label={rotulo} title={rotulo} aria-expanded={equipe ? menu : undefined}>
          <Svg d={fixado ? ICONE.desfixar : ICONE.fixar} />
        </button>
        {equipe && menu && (
          <div className="pl-menu" role="menu" onPointerDown={(e) => e.stopPropagation()}>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); fixarAqui(fixado ? '' : q.chave) }}><Svg d={fixado ? ICONE.desfixar : ICONE.fixar} />{fixado ? 'Desfixar só para mim' : 'Fixar só para mim'}</button>
            <button type="button" role="menuitem" onClick={() => { setMenu(false); fixarParaTodos(fixado && fixadoParaTodos ? null : q.chave) }}><Svg d={ICONE.todos} />{fixado && fixadoParaTodos ? 'Desfixar para todos' : 'Fixar para todos'}</button>
          </div>
        )}
      </div>
    </figure>
  )
}

/** O palco lado a lado. `compacto`: o player pequeno (flutuante, ao lado do gráfico). */
export function PalcoLadoALado({ compacto = false }: { compacto?: boolean }) {
  const t = useTreino()
  const quadros = quadrosDo(t.palco)
  if (!quadros.length) return null
  // fixado: o meu (se escolhi), senão o da equipe; sem nenhum, a tela compartilhada ganha o destaque
  const escolha = t.fixadoAqui === '' ? null : t.fixadoAqui ?? t.fixadoParaTodos
  const fixado = escolha && quadros.some((q) => q.chave === escolha) ? escolha : null
  const principal = fixado ?? quadros.find((q) => q.tipo === 'tela')?.chave ?? null
  const equipe = t.apresentador
  const paraTodos = (c: string) => !!t.fixadoParaTodos && t.fixadoParaTodos === c && t.fixadoAqui === null
  const quadro = (q: Quadro, destaque: boolean) => (
    <QuadroDoPalco key={q.chave} q={q} fixado={q.chave === fixado} destaque={destaque} compacto={compacto} equipe={equipe} fixadoParaTodos={paraTodos(q.chave)} />
  )
  if (principal && quadros.length > 1) {
    const grande = quadros.find((q) => q.chave === principal)!
    const outros = quadros.filter((q) => q.chave !== principal)
    return (
      <div className={`pl-palco com-destaque ${compacto ? 'compacto' : ''}`} role="group" aria-label="Palco da live">
        <div className="pl-principal">{quadro(grande, true)}</div>
        <div className="pl-faixa" data-n={outros.length}>{outros.map((q) => quadro(q, false))}</div>
      </div>
    )
  }
  const n = quadros.length
  const colunas = n <= 1 ? 1 : n <= 4 ? 2 : 3
  return (
    <div className={`pl-palco grade ${compacto ? 'compacto' : ''}`} role="group" aria-label="Palco da live" data-n={n} style={{ '--pl-colunas': colunas } as React.CSSProperties}>
      {quadros.map((q) => quadro(q, false))}
    </div>
  )
}
