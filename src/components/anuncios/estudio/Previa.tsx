/**
 * A prévia do anúncio num celular (03/11/2026): Feed, Stories e Reels do Instagram, com o texto
 * cortado onde a Meta corta e o aviso quando o formato do arquivo não combina com o lugar.
 * Não é a renderização oficial da Meta: é o suficiente para decidir antes de criar.
 */
import { useEffect, useRef, useState } from 'react'
import { BOTOES, type Midia, type Texto } from '../../../core/teeds/estudio'

export type Lugar = 'feed' | 'stories' | 'reels'
const LUGARES: Array<{ id: Lugar; nome: string }> = [{ id: 'feed', nome: 'Feed' }, { id: 'stories', nome: 'Stories' }, { id: 'reels', nome: 'Reels' }]

/** Como o arquivo se sai em cada lugar: 'ok', 'corta' (a Meta corta as bordas) ou 'pequeno' (sobra tarja). */
export function encaixe(m: Pick<Midia, 'largura' | 'altura'> | undefined, lugar: Lugar): 'ok' | 'corta' | 'pequeno' {
  if (!m?.largura || !m.altura) return 'ok'
  const r = m.largura / m.altura
  if (lugar === 'feed') return r < 0.79 ? 'corta' : r > 1.92 ? 'pequeno' : 'ok'
  return r > 0.8 ? 'pequeno' : r > 0.6 ? 'corta' : 'ok'
}
export const NOME_DO_ENCAIXE = { ok: 'Encaixa bem', corta: 'A Meta corta as bordas', pequeno: 'Fica pequeno, com tarja' } as const

const nomeDoBotao = (id: string) => BOTOES.find((b) => b.id === id)?.nome ?? 'Saiba mais'

function Arquivo({ m, cobrir, mudo = true }: { m?: Midia; cobrir: boolean; mudo?: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  useEffect(() => { video.current?.play().catch(() => { /* o navegador pode pedir um toque */ }) }, [m?.local])
  if (!m) return <div className="ep-vazio"><span>Seu vídeo ou imagem aparece aqui</span></div>
  const src = m.local ?? m.poster
  return (
    <div className={`ep-arquivo ${cobrir ? 'cobre' : 'cabe'}`}>
      {/* o fundo desfocado preenche a tarja quando o formato não cobre a tela */}
      {!cobrir && m.poster && <img className="ep-fundo" src={m.poster} alt="" aria-hidden="true" />}
      {m.tipo === 'video' && m.local
        ? <video ref={video} src={m.local} poster={m.poster} muted={mudo} loop playsInline autoPlay />
        : src ? <img src={src} alt="" /> : <div className="ep-vazio"><span>{m.nome}</span></div>}
    </div>
  )
}

export function Previa({ midia, texto, usuario, foto, lugar, setLugar, rotulo }: {
  midia?: Midia; texto: Texto; usuario: string; foto: string | null; lugar: Lugar; setLugar: (l: Lugar) => void; rotulo?: string
}) {
  const [aberto, setAberto] = useState(false)
  const principal = texto.principal.trim() || 'O texto principal do anúncio aparece aqui.'
  const curto = principal.length > 125 && !aberto ? `${principal.slice(0, 125).trimEnd()}…` : principal
  const fit = encaixe(midia, lugar)
  const avatar = foto ? <img src={foto} alt="" /> : <span>{usuario.slice(0, 1).toUpperCase()}</span>
  return (
    <div className="ep">
      <div className="ep-lugares" role="tablist" aria-label="Onde o anúncio aparece">
        {LUGARES.map((l) => {
          const f = encaixe(midia, l.id)
          return (
            <button key={l.id} type="button" role="tab" aria-selected={lugar === l.id} className={lugar === l.id ? 'on' : ''} onClick={() => setLugar(l.id)}>
              {l.nome}{midia && f !== 'ok' && <i className="ep-alerta" title={NOME_DO_ENCAIXE[f]} aria-label={NOME_DO_ENCAIXE[f]} />}
            </button>
          )
        })}
      </div>
      <div className={`ep-celular ${lugar}`}>
        {rotulo && <span className="ep-rotulo">{rotulo}</span>}
        <div className="ep-tela">
          {lugar === 'feed' ? (
            <div className="ep-feed">
              <header><i className="ep-av">{avatar}</i><div><b>{usuario}</b><small>Patrocinado</small></div><span className="ep-mais" aria-hidden="true">•••</span></header>
              <div className="ep-midia"><Arquivo m={midia} cobrir={fit !== 'pequeno'} /></div>
              <div className="ep-cta"><span>{nomeDoBotao(texto.botao)}</span><i aria-hidden="true">›</i></div>
              <div className="ep-acoes" aria-hidden="true"><i className="c" /><i className="b" /><i className="e" /><i className="s" /></div>
              <p className="ep-legenda"><b>{usuario}</b> {curto}{principal.length > 125 && <button type="button" onClick={() => setAberto((x) => !x)}>{aberto ? ' menos' : ' mais'}</button>}</p>
            </div>
          ) : (
            <div className={`ep-vertical ${lugar}`}>
              <Arquivo m={midia} cobrir={fit !== 'pequeno'} />
              {lugar === 'stories' && <div className="ep-barras" aria-hidden="true"><i /><i /></div>}
              <header><i className="ep-av">{avatar}</i><b>{usuario}</b><small>Patrocinado</small></header>
              {lugar === 'reels' && <div className="ep-lado" aria-hidden="true"><i className="c" /><i className="b" /><i className="e" /></div>}
              <div className="ep-baixo">
                {lugar === 'reels' && <p><b>{usuario}</b> {principal.length > 60 ? `${principal.slice(0, 60).trimEnd()}…` : principal}</p>}
                {texto.titulo && lugar === 'stories' && <p className="ep-titulo">{texto.titulo}</p>}
                <span className="ep-botao">{lugar === 'stories' && <i aria-hidden="true">⌃</i>}{nomeDoBotao(texto.botao)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className={`ep-encaixe ${fit}`}>{midia ? `${LUGARES.find((l) => l.id === lugar)!.nome}: ${NOME_DO_ENCAIXE[fit].toLowerCase()}` : 'Prévia aproximada. A Meta mostra a final no Gerenciador.'}</p>
    </div>
  )
}
