import { useEffect, useRef, useState } from 'react'
import { MARCA } from '../../marca'
import { vitrine } from '../../core/teeds/parceiro'
import { haQuanto, storyPublico, type StoryPublico as Dados } from '../../core/teeds/stories'
import { Avatar, estiloDaMidia } from './VisualizadorDeStories'
import './stories.css'
import './story-publico.css'

/**
 * O link de compartilhar um story (globalflytrade.com/n/s/<código>), aberto
 * sem login: o story em tela cheia e o botão de criar a conta, que leva ao
 * cadastro do parceiro de quem compartilhou com a origem "story" (é assim que
 * o painel conta os cadastros vindos de compartilhamento).
 */
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '')

export default function StoryPublico() {
  const q = new URLSearchParams(location.search)
  const codigo = (q.get('story') ?? '').replace(/[^a-z0-9]/gi, '').slice(0, 16)
  const parceiro = (q.get('parceiro_rota') ?? vitrine() ?? '').replace(/[^a-z]/g, '')
  const [d, setD] = useState<Dados | null | undefined>(undefined)
  const [mudo, setMudo] = useState(true)
  const [progresso, setProgresso] = useState(0)
  const video = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    document.title = `Story · ${MARCA.prosa}`
    if (!codigo) { setD(null); return }
    storyPublico(codigo).then((x) => setD(x ?? null)).catch(() => setD(null))
  }, [codigo])

  // foto: a barra anda no tempo do story e recomeça
  useEffect(() => {
    if (!d || d.tipo !== 'imagem') return
    let raf = 0; const t0 = performance.now()
    const passo = (t: number) => { setProgresso((((t - t0) / 1000) % d.duracao) / d.duracao); raf = requestAnimationFrame(passo) }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [d])

  const cadastro = `${BASE}${parceiro ? `/${parceiro}` : ''}/cadastro/?utm_source=story&utm_medium=compartilhamento&utm_content=${encodeURIComponent(codigo)}`
  const entrar = `${BASE}${parceiro ? `/${parceiro}` : ''}/inicio`
  const logo = `${BASE}/globalfly-assinatura.png`

  return (
    <main className="stp">
      {d && (d.tipo === 'imagem' || d.capa) && <div className="stp-fundo" aria-hidden="true"><img src={d.capa ?? d.midia} alt="" /></div>}
      <header className="stp-topo">{MARCA.id === 'globalfly' ? <img src={logo} alt={MARCA.prosa} /> : <b>{MARCA.prosa}</b>}</header>

      {d === undefined && <span className="sto-girando stp-carregando" aria-label="Carregando" />}

      {d === null && (
        <section className="stp-fora">
          <h1>Este story já saiu do ar</h1>
          <p>Os stories ficam 24 horas na plataforma. Crie sua conta para ver os próximos assim que forem publicados.</p>
          <a className="stp-cta" href={`${BASE}${parceiro ? `/${parceiro}` : ''}/cadastro/?utm_source=story&utm_medium=compartilhamento`}>Criar minha conta</a>
          <a className="stp-entrar" href={entrar}>Já tenho conta · Entrar</a>
        </section>
      )}

      {d && (
        <section className="stp-palco">
          <div className="stp-card">
            {d.tipo === 'video'
              ? <video ref={video} className="sto-midia" src={d.midia} poster={d.capa ?? undefined} autoPlay loop playsInline muted={mudo} style={estiloDaMidia(d.enquadramento)}
                  onTimeUpdate={(e) => { const v = e.currentTarget; if (v.duration) setProgresso(v.currentTime / v.duration) }} />
              : <img className="sto-midia" src={d.midia} alt="" style={estiloDaMidia(d.enquadramento)} />}
            <i className="sto-sombra cima" /><i className="sto-sombra baixo" />
            <div className="stp-cab">
              <div className="sto-barras"><i><b style={{ transform: `scaleX(${progresso})` }} /></i></div>
              <div className="stp-quem">
                <Avatar foto={d.perfil.foto} nome={d.perfil.nome} tamanho={32} />
                <b>{d.perfil.nome}</b><small>{haQuanto(d.quando)}</small>
                {d.tipo === 'video' && (
                  <button type="button" onClick={() => { setMudo((m) => !m); if (video.current) void video.current.play().catch(() => undefined) }} aria-label={mudo ? 'Ligar o som' : 'Desligar o som'}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={mudo ? 'M4 9h4l5-4v14l-5-4H4zM17 9.5l5 5M22 9.5l-5 5' : 'M4 9h4l5-4v14l-5-4H4zM16.5 8.5a5 5 0 010 7M19.5 5.5a9 9 0 010 13'} /></svg>
                  </button>
                )}
              </div>
            </div>
            {(d.chip || d.titulo || d.subtitulo) && (
              <div className="stp-texto">
                {d.chip && <span className="sto-chip">{d.chip}</span>}
                {d.titulo && <h1>{d.titulo}</h1>}
                {d.subtitulo && <p>{d.subtitulo}</p>}
              </div>
            )}
            <div className="stp-pe">
              <a className="stp-cta" href={cadastro}>Criar minha conta</a>
              <a className="stp-entrar" href={entrar}>Já tenho conta · Entrar</a>
            </div>
          </div>
        </section>
      )}
    </main>
  )
}
