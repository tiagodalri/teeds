import { useMemo, useState } from 'react'
import {
  aulasVistas, marcarVista, MODULOS, playerDoVideo, todasAsAulas,
  type AulaNumerada,
} from '../core/teeds/aulas'

const capa = (id: string) => `${import.meta.env.BASE_URL}aulas/${id}.jpg`

/**
 * A sala de aula da Teeds, no estilo de vitrine de filmes: trilhas por
 * modulo, cartoes com capa e numero, player com a lista do modulo ao lado.
 * Aula sem video existe no catalogo mas se apresenta como "em breve".
 */
export function AulasPanel({ nome }: { nome?: string | null }) {
  const aulas = useMemo(() => todasAsAulas(), [])
  const [vistas, setVistas] = useState<Set<string>>(() => aulasVistas())
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)

  const aberta = aulas.find((a) => a.id === abertaId) ?? null
  const comVideo = aulas.filter((a) => a.video)
  const proxima = aulas.find((a) => a.video && !vistas.has(a.id)) ?? comVideo[0] ?? null
  const assistidas = aulas.filter((a) => vistas.has(a.id)).length
  const destaque = proxima ?? aulas[0] ?? null
  const detalhe = aulas.find((a) => a.id === detalheId) ?? null

  const alternarVista = (id: string) => {
    setVistas(new Set(marcarVista(id, !vistas.has(id))))
  }

  const abrir = (a: AulaNumerada) => {
    if (!a.video) return
    setAbertaId(a.id)
    window.scrollTo({ top: 0 })
  }

  /* ----------------------------------------------------------- player */
  if (aberta) {
    const player = playerDoVideo(aberta.video)
    const doModulo = aulas.filter((a) => a.modulo.id === aberta.modulo.id)
    const idx = aulas.findIndex((a) => a.id === aberta.id)
    const seguinte = aulas.slice(idx + 1).find((a) => a.video) ?? null
    const vista = vistas.has(aberta.id)

    return (
      <div className="ger aulas" style={{ ['--aula' as any]: aberta.modulo.cor }}>
        <button className="aulas-voltar" onClick={() => setAbertaId(null)}>← Todas as aulas</button>

        <div className="aula-palco">
          <div className="aula-video">
            {player?.tipo === 'mp4' ? (
              <video src={player.src} controls autoPlay playsInline
                onEnded={() => !vista && alternarVista(aberta.id)} />
            ) : player ? (
              <iframe src={player.src} title={aberta.titulo} allowFullScreen
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
            ) : (
              <div className="aula-embreve-palco">
                <img src={capa(aberta.id)} alt="" />
                <span>em breve</span>
              </div>
            )}
          </div>

          <aside className="aula-trilha">
            <span className="rot">{aberta.modulo.titulo}</span>
            {doModulo.map((a) => (
              <button key={a.id}
                className={`aula-item ${a.id === aberta.id ? 'on' : ''} ${a.video ? '' : 'sem'}`}
                onClick={() => abrir(a)} disabled={!a.video}>
                <i>{vistas.has(a.id) ? '✓' : a.numero}</i>
                <span>{a.titulo}</span>
                {!a.video && <em>em breve</em>}
              </button>
            ))}
          </aside>
        </div>

        <div className="aula-ficha">
          <div>
            <span className="aula-num">Aula {aberta.numero}</span>
            <h2>{aberta.titulo}</h2>
            <p>{aberta.descricao}</p>
          </div>
          <div className="aula-acoes">
            <button className={`aula-check ${vista ? 'on' : ''}`} onClick={() => alternarVista(aberta.id)}>
              {vista ? '✓ Assistida' : 'Marcar como assistida'}
            </button>
            {seguinte && (
              <button className="aula-proxima" onClick={() => abrir(seguinte)}>
                Próxima: {seguinte.titulo} →
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- vitrine */
  return (
    <div className="ger aulas">
      <div className="aulas-capa" style={{
        backgroundImage: `linear-gradient(90deg, rgba(5,6,8,.98) 0%, rgba(5,6,8,.86) 38%, rgba(5,6,8,.2) 72%, rgba(5,6,8,.55) 100%), url(${import.meta.env.BASE_URL}aulas-hero-teeds.png)`,
      }}>
        <div className="aulas-capa-texto">
          <span className="aulas-selo">Treinamento original Teeds</span>
          <h2>{destaque?.titulo ?? `Aprenda a usar a Teeds${nome ? `, ${nome.split(' ')[0]}` : ''}`}</h2>
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
        <div className="aulas-hero-marca" aria-hidden>TEEDS ORIGINAL</div>
      </div>

      {assistidas > 0 && proxima && (
        <section className="aulas-modulo aulas-continue">
          <div className="aulas-modulo-topo"><div><h3>Continue assistindo</h3><p>Retome de onde parou.</p></div></div>
          <div className="aulas-fileira">
            <button className="aula-cartao continuar" onClick={() => abrir(proxima)}>
              <span className="aula-cartao-capa"><img src={capa(proxima.id)} alt="" /><span className="aula-play">▶</span></span>
              <span className="aula-cartao-corpo"><span className="aula-num">Aula {proxima.numero}</span><b>{proxima.titulo}</b><i className="aula-progresso-card"><u style={{ width: '35%' }} /></i></span>
            </button>
          </div>
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
            <div className="aulas-fileira">
              {doModulo.map((a) => (
                <button key={a.id} data-num={String(a.numero).padStart(2, '0')}
                  className={`aula-cartao ${a.video ? '' : 'sem'}`}
                  onClick={() => a.video ? abrir(a) : setDetalheId(a.id)}>
                  <span className="aula-cartao-capa" data-num={String(a.numero).padStart(2, '0')}>
                    <img src={capa(a.id)} alt={`Capa da aula ${a.titulo}`} loading="lazy" />
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
            </div>
          </section>
        )
      })}

      {detalhe && (
        <div className="aula-modal-fundo" role="presentation" onClick={() => setDetalheId(null)}>
          <section className="aula-modal" role="dialog" aria-modal="true" aria-label={detalhe.titulo}
            style={{ ['--aula' as any]: detalhe.modulo.cor }} onClick={(e) => e.stopPropagation()}>
            <button className="aula-modal-fechar" onClick={() => setDetalheId(null)} aria-label="Fechar">×</button>
            <div className="aula-modal-capa"><img src={capa(detalhe.id)} alt={`Capa da aula ${detalhe.titulo}`} /></div>
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
