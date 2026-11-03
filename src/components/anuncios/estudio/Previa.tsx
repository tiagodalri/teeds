/**
 * A prévia do anúncio num celular (03/11/2026): Feed, Stories e Reels do Instagram e o Feed do
 * Facebook, com a foto de verdade do perfil (a da página, que a Meta deixa ver sem chave), o texto
 * cortado onde a Meta corta e o aviso quando o formato do arquivo não combina com o lugar.
 * Não é a renderização oficial da Meta: é o suficiente para decidir antes de criar.
 */
import { useEffect, useRef, useState } from 'react'
import { BOTOES, type Midia, type Texto } from '../../../core/teeds/estudio'

export type Lugar = 'feed' | 'stories' | 'reels' | 'facebook'
const LUGARES: Array<{ id: Lugar; nome: string }> = [{ id: 'feed', nome: 'Feed' }, { id: 'stories', nome: 'Stories' }, { id: 'reels', nome: 'Reels' }, { id: 'facebook', nome: 'Facebook' }]

/** Como o arquivo se sai em cada lugar: 'ok', 'corta' (a Meta corta as bordas) ou 'pequeno' (sobra tarja). */
export function encaixe(m: Pick<Midia, 'largura' | 'altura'> | undefined, lugar: Lugar): 'ok' | 'corta' | 'pequeno' {
  if (!m?.largura || !m.altura) return 'ok'
  const r = m.largura / m.altura
  if (lugar === 'feed' || lugar === 'facebook') return r < 0.79 ? 'corta' : r > 1.92 ? 'pequeno' : 'ok'
  return r > 0.8 ? 'pequeno' : r > 0.6 ? 'corta' : 'ok'
}
export const NOME_DO_ENCAIXE = { ok: 'Encaixa bem', corta: 'A Meta corta as bordas', pequeno: 'Fica pequeno, com tarja' } as const
const NO_MEIO_DA_FRASE = { ok: 'encaixa bem', corta: 'a Meta corta as bordas', pequeno: 'fica pequeno, com tarja' } as const

const nomeDoBotao = (id: string) => BOTOES.find((b) => b.id === id)?.nome ?? 'Saiba mais'
// os ícones do Instagram, em traço, do jeito do aplicativo
const I = {
  coracao: 'M12 20.3s-7.6-4.6-9.2-9.3C1.7 7.7 3.9 4.6 7.2 4.6c2 0 3.6 1.1 4.8 2.8 1.2-1.7 2.8-2.8 4.8-2.8 3.3 0 5.5 3.1 4.4 6.4-1.6 4.7-9.2 9.3-9.2 9.3z',
  comentario: 'M20.6 16.6A9 9 0 1112 3a9 9 0 018.6 13.6L21.5 21l-4.4-1.2',
  enviar: 'M21.5 3.5L10.8 13.2M21.5 3.5l-6.7 17-4-7.3-7.3-4z',
  salvar: 'M18.5 21l-6.5-5.6L5.5 21V3.5h13z',
  mais: 'M5 12h.01M12 12h.01M19 12h.01',
}
const Traco = ({ d, tam = 22 }: { d: string; tam?: number }) => <svg width={tam} height={tam} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>

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

export function Previa({ midia, texto, usuario, foto, paginaNome, link, lugar, setLugar, rotulo }: {
  midia?: Midia; texto: Texto; usuario: string; foto: string | null; paginaNome?: string; link?: string; lugar: Lugar; setLugar: (l: Lugar) => void; rotulo?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [semFoto, setSemFoto] = useState(false)
  useEffect(() => setSemFoto(false), [foto])
  const principal = texto.principal.trim() || 'O texto principal do anúncio aparece aqui.'
  const curto = (n: number) => (principal.length > n && !aberto ? `${principal.slice(0, n).trimEnd()}…` : principal)
  const fit = encaixe(midia, lugar)
  const avatar = foto && !semFoto ? <img src={foto} alt="" onError={() => setSemFoto(true)} /> : <span>{usuario.slice(0, 1).toUpperCase()}</span>
  const dominio = (link ?? 'globalflytrade.com').replace(/^https?:\/\//, '').split('/')[0].toUpperCase()
  const botao = nomeDoBotao(texto.botao)
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
          {lugar === 'feed' && (
            <div className="ep-feed">
              <div className="ep-ig-topo" aria-hidden="true"><b>Instagram</b><span><Traco d={I.coracao} tam={20} /><Traco d={I.enviar} tam={20} /></span></div>
              <header><i className="ep-av">{avatar}</i><div><b>{usuario}</b><small>Patrocinado</small></div><span className="ep-mais"><Traco d={I.mais} tam={20} /></span></header>
              <div className="ep-midia"><Arquivo m={midia} cobrir={fit !== 'pequeno'} /></div>
              <div className="ep-cta"><span>{botao}</span><i aria-hidden="true">›</i></div>
              <div className="ep-acoes" aria-hidden="true"><Traco d={I.coracao} /><Traco d={I.comentario} /><Traco d={I.enviar} /><span className="ep-dir"><Traco d={I.salvar} /></span></div>
              <p className="ep-legenda"><b>{usuario}</b> {curto(125)}{principal.length > 125 && <button type="button" onClick={() => setAberto((x) => !x)}>{aberto ? ' menos' : ' mais'}</button>}</p>
            </div>
          )}
          {lugar === 'facebook' && (
            <div className="ep-fb">
              <div className="ep-fb-topo" aria-hidden="true"><b>facebook</b></div>
              <header><i className="ep-av fb">{avatar}</i><div><b>{paginaNome || usuario}</b><small>Patrocinado · <span aria-hidden="true">◍</span></small></div><span className="ep-mais"><Traco d={I.mais} tam={20} /></span></header>
              <p className="ep-fb-texto">{curto(140)}{principal.length > 140 && <button type="button" onClick={() => setAberto((x) => !x)}>{aberto ? ' Ver menos' : ' Ver mais'}</button>}</p>
              <div className="ep-midia fb"><Arquivo m={midia} cobrir={fit !== 'pequeno'} /></div>
              <div className="ep-fb-link"><div><small>{dominio}</small><b>{texto.titulo || 'O título do anúncio'}</b>{texto.descricao && <span>{texto.descricao}</span>}</div><em>{botao}</em></div>
              <div className="ep-fb-acoes" aria-hidden="true"><span>Curtir</span><span>Comentar</span><span>Compartilhar</span></div>
            </div>
          )}
          {(lugar === 'stories' || lugar === 'reels') && (
            <div className={`ep-vertical ${lugar}`}>
              <Arquivo m={midia} cobrir={fit !== 'pequeno'} />
              {lugar === 'stories' && <div className="ep-barras" aria-hidden="true"><i /><i /></div>}
              <header>
                <i className="ep-av">{avatar}</i><b>{usuario}</b><small>Patrocinado</small>
                {lugar === 'stories' && <span className="ep-fechar" aria-hidden="true">✕</span>}
              </header>
              {lugar === 'reels' && (
                <div className="ep-lado" aria-hidden="true"><Traco d={I.coracao} tam={26} /><Traco d={I.comentario} tam={26} /><Traco d={I.enviar} tam={26} /><Traco d={I.mais} tam={26} /></div>
              )}
              <div className="ep-baixo">
                {lugar === 'reels' && (
                  <>
                    <p className="ep-reels-quem"><i className="ep-av mini">{avatar}</i><b>{usuario}</b><span className="ep-seguir">Seguir</span></p>
                    <p>{curto(70)}</p>
                    <p className="ep-audio">♪ Áudio original · Patrocinado</p>
                  </>
                )}
                {texto.titulo && lugar === 'stories' && <p className="ep-titulo">{texto.titulo}</p>}
                <span className="ep-botao">{lugar === 'stories' && <i aria-hidden="true">⌃</i>}{botao}{lugar === 'reels' && <i aria-hidden="true">›</i>}</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <p className={`ep-encaixe ${fit}`}>{midia ? `${LUGARES.find((l) => l.id === lugar)!.nome}: ${NO_MEIO_DA_FRASE[fit]}` : 'Prévia aproximada. A Meta mostra a final no Gerenciador.'}</p>
    </div>
  )
}
