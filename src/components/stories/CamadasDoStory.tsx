import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { ALTURA_DO_QUADRO, contraste, dominio, type Camada } from '../../core/teeds/camadas'
import './camadas.css'

/**
 * Desenha as camadas de um story dentro do quadro 9:16 (o mesmo desenho no estúdio, na tela
 * cheia e no link público). As medidas são em cqw do quadro: o story fica igual em qualquer tela.
 *
 * modo 'ver': as figurinhas respondem (enquete vota, link abre, contagem anda).
 * modo 'editar': tudo vira alvo de arrastar (data-camada) e nada abre.
 */
interface Props {
  camadas: Camada[]
  modo: 'ver' | 'editar'
  /** A enquete: votos por opção (só chegam depois de votar) e o voto desta pessoa. */
  votos?: Record<string, number> | null
  meuVoto?: number | null
  aoVotar?: (opcao: number) => void
  aoLink?: (c: Extract<Camada, { tipo: 'link' }>) => void
  /** No estúdio: a camada que está sendo editada some do quadro (o editor de texto fica por cima). */
  escondida?: string | null
}

const POSICAO = (c: Camada): CSSProperties => ({
  left: `${c.x}%`, top: `${(c.y / 100) * 100}%`,
  transform: `translate(-50%, -50%) rotate(${c.rotacao}deg) scale(${c.escala})`,
})

const ICONE_PIN = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z" /><circle cx="12" cy="10" r="2.6" /></svg>
const ICONE_LINK = <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>
const ICONE_RELOGIO = <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>

function useAgora(ativo: boolean) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (!ativo) return
    const t = window.setInterval(() => setAgora(Date.now()), 1000)
    return () => window.clearInterval(t)
  }, [ativo])
  return agora
}

function Contagem({ ate, agora }: { ate: string; agora: number }) {
  const falta = Math.max(0, Date.parse(ate) - agora)
  const d = Math.floor(falta / 86400000), h = Math.floor(falta / 3600000) % 24, m = Math.floor(falta / 60000) % 60, s = Math.floor(falta / 1000) % 60
  const p = (n: number) => String(n).padStart(2, '0')
  if (!falta) return <span className="cam-cont-fim">É agora!</span>
  const blocos = d > 0 ? [[d, 'dias'], [h, 'horas'], [m, 'min']] : [[h, 'horas'], [m, 'min'], [s, 'seg']]
  return <span className="cam-cont-num">{blocos.map(([v, r]) => <span key={r as string}><b>{p(v as number)}</b><i>{r}</i></span>)}</span>
}

export function CamadasDoStory({ camadas, modo, votos, meuVoto, aoVotar, aoLink, escondida }: Props) {
  const agora = useAgora(camadas.some((c) => c.tipo === 'contagem'))
  const editar = modo === 'editar'
  const parar = (e: { stopPropagation: () => void }) => { if (!editar) e.stopPropagation() }

  return (
    <div className={`cam ${editar ? 'editar' : ''}`}>
      {camadas.map((c) => {
        if (c.id === escondida) return null
        const comum = { 'data-camada': c.id } as const
        let corpo: ReactNode = null
        let classe = `cam-item cam-${c.tipo}`
        switch (c.tipo) {
          case 'desenho':
            return (
              <svg key={c.id} data-camada={editar ? undefined : c.id} className="cam-desenho" viewBox={`0 0 100 ${ALTURA_DO_QUADRO}`} preserveAspectRatio="none" aria-hidden="true">
                {c.tracos.map((t, i) => <path key={i} d={t.d} stroke={t.cor} strokeWidth={t.largura} strokeOpacity={t.marcador ? 0.55 : 1} fill="none" strokeLinecap="round" strokeLinejoin="round" />)}
              </svg>
            )
          case 'texto': {
            const fundo = c.fundo === 'cor' ? { background: c.cor, color: contraste(c.cor) } : c.fundo === 'claro' ? { background: 'rgba(255,255,255,.88)', color: c.cor === '#FFFFFF' ? '#051528' : c.cor } : { color: c.cor }
            classe += ` f-${c.fonte} fundo-${c.fundo} a-${c.alinhar}`
            corpo = <span className="cam-texto-linhas" style={{ ...fundo, ['--cor' as string]: c.cor }}>{c.texto}</span>
            break
          }
          case 'emoji': corpo = c.emoji; break
          case 'local': classe += ` e-${c.estilo}`; corpo = <>{ICONE_PIN}<span>{c.texto}</span></>; break
          case 'hora': classe += ` e-${c.estilo}`; corpo = <>{ICONE_RELOGIO}<span>{c.hora}</span></>; break
          case 'link':
            classe += ` e-${c.estilo}`
            corpo = <>{ICONE_LINK}<span>{c.texto.trim() || dominio(c.url)}</span></>
            if (!editar) return (
              <button key={c.id} type="button" {...comum} className={classe} style={POSICAO(c)} onPointerDown={parar} onPointerUp={parar}
                onClick={(e) => { e.stopPropagation(); aoLink?.(c) }} aria-label={`Abrir ${c.texto || dominio(c.url)}`}>{corpo}</button>
            )
            break
          case 'contagem':
            classe += ` e-${c.estilo}`
            corpo = <><span className="cam-cont-tit">{c.titulo || 'Contagem regressiva'}</span><Contagem ate={c.ate} agora={agora} /></>
            break
          case 'selo':
            classe += ` s-${c.selo}`
            corpo = c.selo === 'gf' ? <img src={`${import.meta.env.BASE_URL}globalfly-gf-escuro.png`} alt="GlobalFly" draggable={false} />
              : c.selo === 'aovivo' ? <><i className="cam-pulso" />Ao vivo</>
              : c.selo === 'novidade' ? 'Novidade'
              : c.selo === 'ia' ? <>✦ I.A. no ar</>
              : c.selo === 'gold' ? 'Gold' : c.selo === 'black' ? 'Black' : 'Prestige'
            break
          case 'enquete': {
            const total = votos ? Object.values(votos).reduce((a, b) => a + b, 0) : 0
            const votou = meuVoto !== null && meuVoto !== undefined
            corpo = (
              <>
                {c.pergunta.trim() && <span className="cam-enq-perg">{c.pergunta}</span>}
                <span className="cam-enq-opcoes">
                  {c.opcoes.map((o, i) => {
                    const n = votos?.[String(i)] ?? 0
                    const pct = total ? Math.round((n / total) * 100) : 0
                    return (
                      <button key={i} type="button" className={`cam-enq-op ${votou ? 'votou' : ''} ${meuVoto === i ? 'meu' : ''}`}
                        disabled={editar || votou} onPointerDown={parar} onPointerUp={parar}
                        onClick={(e) => { e.stopPropagation(); if (!editar && !votou) aoVotar?.(i) }}>
                        {votou && <i className="cam-enq-barra" style={{ width: `${pct}%` }} />}
                        <span>{o}</span>{votou && <b>{pct}%</b>}
                      </button>
                    )
                  })}
                </span>
              </>
            )
            break
          }
        }
        return <div key={c.id} {...comum} className={classe} style={POSICAO(c)}>{corpo}</div>
      })}
    </div>
  )
}
