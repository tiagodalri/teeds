import { ResponsiveImage } from './ResponsiveImage'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  aulasVistas, marcarVista, MODULOS, playerDoVideo, todasAsAulas, VIDEO_DEMONSTRACAO,
  type AulaNumerada,
} from '../core/teeds/aulas'
import { listarVideosDasAulas, type VideoDaAula } from '../core/teeds/aulasVideos'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCA } from '../marca'
import { capaDaAula } from './capasAulas'
import { IconeFechar } from './IconeFechar'
import { PlayerAula } from './PlayerAula'
import { registrarAula } from '../core/teeds/insights'

const capa = capaDaAula

/** Onde a pessoa parou em cada aula (segundos), neste navegador. */
const CHAVE_POSICAO = `${MARCA.id}.aulas.posicao`
function posicoesGuardadas(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CHAVE_POSICAO) || '{}') as Record<string, number> } catch { return {} }
}
function guardarPosicao(id: string, segundos: number) {
  try { const p = posicoesGuardadas(); p[id] = Math.floor(segundos); localStorage.setItem(CHAVE_POSICAO, JSON.stringify(p)) } catch { /* sem armazenamento */ }
}

/** Anel de progresso do curso, na trilha. */
function Anel({ fracao, cor }: { fracao: number; cor: string }) {
  const r = 20, c = 2 * Math.PI * r
  return (
    <svg className="cine-anel" viewBox="0 0 48 48" width="48" height="48" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={cor} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fracao)))} transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{Math.round(fracao * 100)}%</text>
    </svg>
  )
}

function Fileira({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const mover = (direcao: -1 | 1) => ref.current?.scrollBy({
    left: direcao * Math.max(280, ref.current.clientWidth * .82), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })

  return (
    <div className="aulas-carrossel">
      <button className="aulas-seta anterior" onClick={() => mover(-1)} aria-label={`Voltar em ${rotulo}`}>‹</button>
      <div className="aulas-fileira" ref={ref}>{children}</div>
      <button className="aulas-seta proxima" onClick={() => mover(1)} aria-label={`Avançar em ${rotulo}`}>›</button>
    </div>
  )
}

/**
 * A sala de aula da Teeds, no estilo de vitrine de filmes: trilhas por
 * modulo, cartoes com capa e numero, player com a lista do modulo ao lado.
 * Aula sem video existe no catalogo mas se apresenta como "em breve".
 */
export function AulasPanel({ nome, sessao }: { nome?: string | null; sessao?: SessaoTeeds | null }) {
  // Os vídeos que o painel gravou no banco. Enquanto não chegam (ou se o
  // banco não responder), a sala abre com o catálogo do código.
  const [videos, setVideos] = useState<Record<string, VideoDaAula>>({})
  useEffect(() => {
    let vivo = true
    listarVideosDasAulas(sessao).then((v) => { if (vivo) setVideos(v) })
    return () => { vivo = false }
  }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const aulas = useMemo(() => todasAsAulas(videos), [videos])
  const [vistas, setVistas] = useState<Set<string>>(() => aulasVistas())
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [moduloAberto, setModuloAberto] = useState<string | null>(null)
  const [tocando, setTocando] = useState(false)
  const ultimaGravacao = useRef(0)

  // Enquanto o vídeo toca, a plataforma escurece em volta (modo cinema).
  useEffect(() => {
    document.body.classList.toggle('aula-tocando', tocando && !!abertaId)
    return () => document.body.classList.remove('aula-tocando')
  }, [tocando, abertaId])

  const aberta = aulas.find((a) => a.id === abertaId) ?? null
  const comVideo = aulas.filter((a) => a.video)
  const proxima = aulas.find((a) => a.video && !vistas.has(a.id)) ?? comVideo[0] ?? null
  const assistidas = aulas.filter((a) => vistas.has(a.id)).length
  const destaque = proxima ?? aulas[0] ?? null
  const detalhe = aulas.find((a) => a.id === detalheId) ?? null

  const alternarVista = (id: string) => {
    setVistas(new Set(marcarVista(id, !vistas.has(id))))
  }

  // Telemetria: segundos realmente assistidos (contados pela cadência do
  // vídeo, não pelo relógio), enviados em lotes; nunca condição para assistir.
  const assistido = useRef({ acumulado: 0, ultimoTempo: -1, concluidaEnviada: false })
  const despachar = useCallback((aulaId: string, posicao: number, concluida = false) => {
    const t = assistido.current
    if (t.acumulado <= 0 && !concluida) return
    const segundos = Math.round(t.acumulado); t.acumulado = 0
    void registrarAula(sessao, aulaId, { segundos, posicao, concluida })
  }, [sessao])
  const abrir = (a: AulaNumerada) => {
    if (!a.video) return
    if (abertaId && abertaId !== a.id) despachar(abertaId, 0)
    assistido.current = { acumulado: 0, ultimoTempo: -1, concluidaEnviada: false }
    setAbertaId(a.id); setModuloAberto(a.modulo.id)
    void registrarAula(sessao, a.id, { abriu: true })
    window.scrollTo({ top: 0 })
  }
  // Ao sair da aula (ou da tela), o que ficou acumulado vai para o banco.
  useEffect(() => () => { if (abertaId) despachar(abertaId, 0) }, [abertaId, despachar])
  // Aos 90% a aula conta como assistida; a posição é guardada a cada ~5 s.
  const aoAvancar = useCallback((fracao: number, segundos: number) => {
    if (!abertaId) return
    const agora = Date.now()
    const t = assistido.current
    const delta = t.ultimoTempo >= 0 ? segundos - t.ultimoTempo : 0
    if (delta > 0 && delta < 2.5) t.acumulado += delta   // pulo ou retrocesso não conta
    t.ultimoTempo = segundos
    if (agora - ultimaGravacao.current > 5000) { ultimaGravacao.current = agora; guardarPosicao(abertaId, segundos) }
    if (t.acumulado >= 20) despachar(abertaId, fracao)
    if (fracao >= 0.9 && !t.concluidaEnviada) { t.concluidaEnviada = true; despachar(abertaId, fracao, true) }
    if (fracao >= 0.9 && !aulasVistas().has(abertaId)) setVistas(new Set(marcarVista(abertaId, true)))
  }, [abertaId, despachar])

  /* ----------------------------------------------------------- player */
  if (aberta) {
    const player = playerDoVideo(aberta.video)
    const idx = aulas.findIndex((a) => a.id === aberta.id)
    const seguinte = aulas.slice(idx + 1).find((a) => a.video) ?? null
    const anterior = aulas.slice(0, idx).reverse().find((a) => a.video) ?? null
    const vista = vistas.has(aberta.id)
    const posicao = posicoesGuardadas()[aberta.id] ?? 0
    const numModulo = MODULOS.findIndex((m) => m.id === aberta.modulo.id) + 1

    return (
      <div className={`ger aulas cine ${tocando ? 'tocando' : ''}`} style={{ ['--aula' as any]: aberta.modulo.cor }}>
        <div className="cine-topo">
          <button className="aulas-voltar" onClick={() => { setAbertaId(null); setTocando(false) }}>← Todas as aulas</button>
          <span className="cine-migalha">Módulo {String(numModulo).padStart(2, '0')} · {aberta.modulo.titulo} · Aula {aberta.numero} de {aulas.length}</span>
        </div>

        <div className="cine-palco">
          <div className="cine-principal">
            <div className="cine-video">
              {player?.tipo === 'mp4' ? (
                <PlayerAula key={aberta.id} src={player.src} titulo={aberta.titulo} posicaoInicial={posicao}
                  aoAvancar={aoAvancar} aoTocar={setTocando}
                  proxima={seguinte ? { titulo: seguinte.titulo, abrir: () => abrir(seguinte) } : null} />
              ) : player ? (
                <iframe src={player.src} title={aberta.titulo} allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
              ) : (
                <div className="aula-embreve-palco">
                  <ResponsiveImage src={capa(aberta.id)} alt="" />
                  <span>em breve</span>
                </div>
              )}
            </div>

            <div className="cine-ficha">
              <div className="cine-ficha-texto">
                <span className="aula-num">Aula {aberta.numero}</span>
                <h2>{aberta.titulo}</h2>
                <p>{aberta.descricao}</p>
                <div className="cine-chips">
                  <span>Iniciante</span>
                  <span>{aberta.duracao}</span>
                  {vista && <span className="ok">✓ Assistida</span>}
                  {aberta.video === VIDEO_DEMONSTRACAO && <span className="demo">Demonstração temporária</span>}
                </div>
              </div>
              <div className="cine-ficha-acoes">
                <button className={`aula-check ${vista ? 'on' : ''}`} onClick={() => alternarVista(aberta.id)}>
                  {vista ? '✓ Assistida' : 'Marcar como assistida'}
                </button>
                <div className="cine-navegar">
                  <button disabled={!anterior} onClick={() => anterior && abrir(anterior)} title={anterior?.titulo}>← Anterior</button>
                  <button className="aula-proxima" disabled={!seguinte} onClick={() => seguinte && abrir(seguinte)}>
                    {seguinte ? `Próxima: ${seguinte.titulo} →` : 'Última aula do curso'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <aside className="cine-trilha">
            <div className="cine-trilha-topo">
              <Anel fracao={assistidas / aulas.length} cor={aberta.modulo.cor} />
              <div>
                <b>Seu progresso</b>
                <small>{assistidas} de {aulas.length} aulas assistidas</small>
              </div>
            </div>
            {MODULOS.map((m, mi) => {
              const doModulo = aulas.filter((a) => a.modulo.id === m.id)
              const feitas = doModulo.filter((a) => vistas.has(a.id)).length
              const abertoAqui = (moduloAberto ?? aberta.modulo.id) === m.id
              return (
                <section key={m.id} className={`cine-modulo ${abertoAqui ? 'aberto' : ''} ${m.id === aberta.modulo.id ? 'atual' : ''}`} style={{ ['--aula' as any]: m.cor }}>
                  <button className="cine-modulo-cab" onClick={() => setModuloAberto(abertoAqui ? '' : m.id)} aria-expanded={abertoAqui}>
                    <i>{String(mi + 1).padStart(2, '0')}</i>
                    <span><b>{m.titulo}</b><small>{feitas}/{doModulo.length} concluídas</small></span>
                    <em aria-hidden>{abertoAqui ? '▾' : '▸'}</em>
                  </button>
                  {abertoAqui && (
                    <div className="cine-modulo-aulas">
                      {doModulo.map((a) => (
                        <button key={a.id}
                          className={`aula-item ${a.id === aberta.id ? 'on' : ''} ${a.video ? '' : 'sem'} ${vistas.has(a.id) ? 'vista' : ''}`}
                          onClick={() => abrir(a)} disabled={!a.video}>
                          <i>{a.id === aberta.id ? '▶' : vistas.has(a.id) ? '✓' : a.numero}</i>
                          <span>{a.titulo}</span>
                          <em>{a.video ? (a.duracao === 'Vídeo demonstrativo' ? 'demo' : a.duracao) : 'em breve'}</em>
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
            <p className="cine-atalhos">Atalhos: <kbd>espaço</kbd> tocar/pausar · <kbd>←</kbd> <kbd>→</kbd> 10 s · <kbd>F</kbd> tela cheia</p>
          </aside>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- vitrine */
  return (
    <div className="ger aulas">
      <div className="aulas-capa" style={{
        ['--aulas-hero-mobile' as string]: `linear-gradient(90deg, rgba(5,6,8,.96), rgba(5,6,8,.65)), url(${import.meta.env.BASE_URL}${MARCA.heroAulas.celular})`,
        backgroundImage: `linear-gradient(90deg, rgba(5,6,8,.98) 0%, rgba(5,6,8,.86) 38%, rgba(5,6,8,.2) 72%, rgba(5,6,8,.55) 100%), image-set(url(${import.meta.env.BASE_URL}${MARCA.heroAulas.principal}) type("image/webp"), url(${import.meta.env.BASE_URL}${MARCA.heroAulas.reserva}) type("image/${MARCA.heroAulas.reserva.endsWith('.png') ? 'png' : 'jpeg'}"))`,
        backgroundPosition: MARCA.heroAulas.posicao ?? 'center right',
      }}>
        <div className="aulas-capa-texto">
          <span className="aulas-selo">Treinamento original {MARCA.prosa}</span>
          <h2>{destaque?.titulo ?? `Aprenda a usar a ${MARCA.prosa}${nome ? `, ${nome.split(' ')[0]}` : ''}`}</h2>
          <p>{destaque?.descricao ?? 'Da conta na corretora ao primeiro robô ligado, uma aula de cada vez.'}</p>
          <div className="aulas-meta">
            <b>{destaque ? `Aula ${destaque.numero} de ${aulas.length}` : `${aulas.length} aulas`}</b>
            <span>Iniciante</span>
            <span>{destaque?.duracao || 'Em breve'}</span>
          </div>
          <div className="aulas-progresso">
            <div className="aulas-barra">
              <i style={{ width: `${(assistidas / aulas.length) * 100}%` }} />
            </div>
            <span>{Math.round((assistidas / aulas.length) * 100)}% concluído</span>
          </div>
          <div className="aulas-hero-acoes">
          {destaque?.video ? (
            <button className="aulas-continuar" onClick={() => abrir(destaque)}>
              <i>▶</i> {assistidas > 0 ? 'Continuar assistindo' : 'Começar agora'}
            </button>
          ) : (
            <button className="aulas-continuar indisponivel" onClick={() => destaque && setDetalheId(destaque.id)}>
              <i>▶</i> Ver apresentação
            </button>
          )}
          {destaque && (
            <button className="aulas-detalhes" onClick={() => setDetalheId(destaque.id)}>ⓘ Mais informações</button>
          )}
          </div>
        </div>
        <div className="aulas-hero-marca" aria-hidden>{MARCA.nome} ORIGINAL</div>
      </div>

      {assistidas > 0 && proxima && (
        <section className="aulas-modulo aulas-continue">
          <div className="aulas-modulo-topo"><div><h3>Continue assistindo</h3><p>Retome de onde parou.</p></div></div>
          <Fileira rotulo="Continue assistindo">
            <button className="aula-cartao continuar" onClick={() => abrir(proxima)}>
              <span className="aula-cartao-capa"><ResponsiveImage src={capa(proxima.id)} alt="" /><span className="aula-play">▶</span></span>
              <span className="aula-cartao-corpo"><span className="aula-num">Aula {proxima.numero}</span><b>{proxima.titulo}</b><i className="aula-progresso-card"><u style={{ width: '35%' }} /></i></span>
            </button>
          </Fileira>
        </section>
      )}

      {MODULOS.map((m, mi) => {
        const doModulo = aulas.filter((a) => a.modulo.id === m.id)
        return (
          <section key={m.id} className="aulas-modulo" style={{ ['--aula' as any]: m.cor }}>
            <div className="aulas-modulo-topo">
              <span className="aulas-trilha-num">{String(mi + 1).padStart(2, '0')}</span>
              <div>
                <h3>{m.titulo}</h3>
                <p>{m.chamada}</p>
              </div>
              <span className="aulas-conta">
                {doModulo.filter((a) => vistas.has(a.id)).length}/{doModulo.length}
              </span>
            </div>
            <Fileira rotulo={m.titulo}>
              {doModulo.map((a) => (
                <button key={a.id} data-num={String(a.numero).padStart(2, '0')}
                  className={`aula-cartao ${a.video ? '' : 'sem'}`}
                  onClick={() => a.video ? abrir(a) : setDetalheId(a.id)}>
                  <span className="aula-cartao-capa" data-num={String(a.numero).padStart(2, '0')}>
                    <ResponsiveImage src={capa(a.id)} alt={`Capa da aula ${a.titulo}`} loading="lazy" />
                    {vistas.has(a.id) && <i className="aula-vista">✓</i>}
                    {!a.video && <em>Em breve</em>}
                    {a.video && <span className="aula-play">▶</span>}
                    {a.duracao && <span className="aula-dur">{a.duracao}</span>}
                    <span className="aula-hover-info"><b>{a.titulo}</b><small>{a.descricao}</small></span>
                  </span>
                  <span className="aula-cartao-corpo">
                    <span className="aula-num">Aula {a.numero}</span>
                    <b>{a.titulo}</b>
                    <span className="aula-card-meta"><i>{a.video ? 'Disponível' : 'Em breve'}</i><i>{a.duracao || 'Duração a definir'}</i></span>
                  </span>
                </button>
              ))}
            </Fileira>
          </section>
        )
      })}

      {detalhe && (
        <div className="aula-modal-fundo" role="presentation" onClick={() => setDetalheId(null)}>
          <section className="aula-modal" role="dialog" aria-modal="true" aria-label={detalhe.titulo}
            style={{ ['--aula' as any]: detalhe.modulo.cor }} onClick={(e) => e.stopPropagation()}>
            <button className="aula-modal-fechar" onClick={() => setDetalheId(null)} aria-label="Fechar"><IconeFechar /></button>
            <div className="aula-modal-capa"><ResponsiveImage src={capa(detalhe.id)} alt={`Capa da aula ${detalhe.titulo}`} /></div>
            <div className="aula-modal-corpo">
              <span className="aula-num">Aula {detalhe.numero} · {detalhe.modulo.titulo}</span>
              <h2>{detalhe.titulo}</h2>
              <p>{detalhe.descricao}</p>
              <div className="aulas-meta"><b>Iniciante</b><span>{detalhe.duracao || 'Duração a definir'}</span></div>
              {detalhe.video ? (
                <button className="aulas-continuar" onClick={() => { setDetalheId(null); abrir(detalhe) }}><i>▶</i> Assistir agora</button>
              ) : <span className="aula-modal-breve">Esta aula será liberada em breve.</span>}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
