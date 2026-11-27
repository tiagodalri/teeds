/**
 * A faixa da série de estreias no topo das Aulas (27/11/2026).
 *
 * Pedido do Victor: as aulas "na prática com as I.A." saem uma por dia, às
 * 19h, e "conforme forem sendo liberadas ficarão em evidência" na sala. As
 * três capas aparecem desde o primeiro dia: a liberada toca, as próximas
 * ficam trancadas com o dia e a hora da estreia, e o topo mostra a contagem
 * até a próxima. A virada acontece sozinha na hora (a sala recalcula).
 */
import type { AulaNumerada, Modulo } from '../../core/teeds/aulas'
import { contagem, quandoEstreia, useAgora } from '../../core/teeds/estreias'
import { CapaDaAula } from './CapaDaAula'
import './serie-estreias.css'

const NOVA_POR = 2 * 86_400_000

export function SerieDeEstreias({ modulo, aulas, vistas, abrir, detalhar }: {
  modulo: Modulo
  aulas: AulaNumerada[]
  vistas: Set<string>
  abrir: (a: AulaNumerada) => void
  detalhar: (id: string) => void
}) {
  const proxima = aulas.find((a) => a.liberarEm && Date.parse(a.liberarEm) > Date.now() && a.bloqueio)
  const agora = useAgora(1000, !!proxima)
  if (!aulas.length) return null
  const falta = proxima?.liberarEm ? Date.parse(proxima.liberarEm) - agora : 0
  const ep = (a: AulaNumerada) => aulas.indexOf(a) + 1

  return (
    <section className="se" style={{ ['--aula' as string]: modulo.cor }} aria-labelledby="se-titulo">
      <div className="se-topo">
        <div className="se-texto">
          <span className="se-rot"><i aria-hidden="true" />Série nova · {aulas.length} episódios</span>
          <h2 id="se-titulo">{modulo.titulo}</h2>
          {modulo.chamada && <p>{modulo.chamada}</p>}
          <div className="se-trilha" aria-label={`${aulas.filter((a) => a.video).length} de ${aulas.length} episódios liberados`}>
            {aulas.map((a) => <i key={a.id} className={a.video ? (vistas.has(a.id) ? 'vista' : 'livre') : ''} />)}
            <small>{aulas.filter((a) => a.video).length} de {aulas.length} liberados</small>
          </div>
        </div>
        {proxima?.liberarEm && falta > 0 && (
          <div className="se-relogio" role="timer" aria-live="off">
            <small>Próxima estreia · EP {ep(proxima)}</small>
            <b>{contagem(falta)}</b>
            <span>{(() => { const q = quandoEstreia(proxima.liberarEm, agora); return `${q.dia}, às ${q.hora}` })()}</span>
          </div>
        )}
      </div>
      <div className="se-lista">
        {aulas.map((a) => {
          const liberada = !!a.video
          const ms = a.liberarEm ? Date.parse(a.liberarEm) : NaN
          const nova = liberada && !vistas.has(a.id) && Number.isFinite(ms) && agora - ms < NOVA_POR
          const q = a.liberarEm ? quandoEstreia(a.liberarEm, agora) : null
          return (
            <button key={a.id} type="button" className={`se-ep${liberada ? ' se-livre' : ' se-trancada'}${q?.hoje && !liberada ? ' se-hoje' : ''}`}
              onClick={() => (liberada ? abrir(a) : detalhar(a.id))}
              aria-label={`Episódio ${ep(a)}: ${a.titulo}${liberada ? '' : q ? `, estreia ${q.dia.toLowerCase()} às ${q.hora}` : ''}`}>
              <span className="se-capa">
                <CapaDaAula aula={a} cor={modulo.cor} numero={a.numero} alt="" loading="lazy" />
                <span className="se-ep-num">EP {ep(a)}</span>
                {nova && <span className="se-nova">Nova</span>}
                {vistas.has(a.id) && <span className="se-vista">✓ Assistida</span>}
                {liberada ? <span className="aula-play">▶</span> : (
                  <span className="se-cadeado" aria-hidden="true">
                    <svg viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></svg>
                    {/* a estreia de hoje conta no próprio cartão */}
                    {q?.hoje && Number.isFinite(ms) && <b className="se-capa-relogio">{contagem(ms - agora)}</b>}
                    {q && !q.hoje && <b className="se-capa-dia">{q.dia} · {q.hora}</b>}
                  </span>
                )}
              </span>
              <span className="se-corpo">
                <b>{a.titulo}</b>
                <small><span className="se-ep-curto">EP {ep(a)} · </span>{liberada ? (a.duracao || 'Disponível') : q ? <><em>Estreia</em> {q.dia.toLowerCase()}, {q.hora}</> : a.bloqueio}</small>
              </span>
            </button>
          )
        })}
      </div>
      <p className="se-aviso">Os valores são o objetivo de cada estratégia, não uma garantia: resultados variam e operar envolve risco de perda.</p>
    </section>
  )
}
