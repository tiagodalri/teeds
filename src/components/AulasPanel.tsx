import { useMemo, useState } from 'react'
import {
  aulasVistas, marcarVista, MODULOS, playerDoVideo, todasAsAulas,
  type AulaNumerada,
} from '../core/teeds/aulas'
import { CapaAula } from './CapaAula'

/**
 * A sala de aula da Teeds, no estilo de vitrine de filmes: trilhas por
 * modulo, cartoes com capa e numero, player com a lista do modulo ao lado.
 * Aula sem video existe no catalogo mas se apresenta como "em breve".
 */
export function AulasPanel({ nome }: { nome?: string | null }) {
  const aulas = useMemo(() => todasAsAulas(), [])
  const [vistas, setVistas] = useState<Set<string>>(() => aulasVistas())
  const [abertaId, setAbertaId] = useState<string | null>(null)

  const aberta = aulas.find((a) => a.id === abertaId) ?? null
  const comVideo = aulas.filter((a) => a.video)
  const proxima = aulas.find((a) => a.video && !vistas.has(a.id)) ?? comVideo[0] ?? null
  const assistidas = aulas.filter((a) => vistas.has(a.id)).length

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
                <CapaAula aula={aberta.id} cor={aberta.modulo.cor} />
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
      <div className="aulas-capa">
        <div className="aulas-capa-texto">
          <span className="aulas-selo">Sala de aula</span>
          <h2>Aprenda a usar a Teeds{nome ? `, ${nome.split(' ')[0]}` : ''}</h2>
          <p>Da conta na corretora ao primeiro robô ligado, uma aula de cada vez.</p>
          <div className="aulas-progresso">
            <div className="aulas-barra">
              <i style={{ width: `${(assistidas / aulas.length) * 100}%` }} />
            </div>
            <span>{assistidas} de {aulas.length} assistidas</span>
          </div>
          {proxima ? (
            <button className="aulas-continuar" onClick={() => abrir(proxima)}>
              <i>▶</i> {assistidas > 0 ? 'Continuar' : 'Começar'} — Aula {proxima.numero}
            </button>
          ) : (
            <span className="aulas-embreve-selo">As primeiras aulas chegam em breve</span>
          )}
        </div>
        <div className="aulas-capa-arte" aria-hidden>
          <img src="teeds-marca.png" alt="" />
        </div>
        <div className="aulas-capa-numeros" aria-hidden>
          <span>{MODULOS.length}</span><em>trilhas</em>
          <span>{aulas.length}</span><em>aulas</em>
        </div>
      </div>

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
                <button key={a.id} className={`aula-cartao ${a.video ? '' : 'sem'}`}
                  onClick={() => abrir(a)} disabled={!a.video}>
                  <span className="aula-cartao-capa">
                    <CapaAula aula={a.id} cor={m.cor} />
                    {vistas.has(a.id) && <i className="aula-vista">✓</i>}
                    {!a.video && <em>Em breve</em>}
                    {a.video && <span className="aula-play">▶</span>}
                    {a.duracao && <span className="aula-dur">{a.duracao}</span>}
                  </span>
                  <span className="aula-cartao-corpo">
                    <span className="aula-num">Aula {a.numero}</span>
                    <b>{a.titulo}</b>
                    <p>{a.descricao}</p>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
