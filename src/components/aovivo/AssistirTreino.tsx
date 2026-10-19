import { useEffect, useRef, useState } from 'react'
import type { Track } from 'livekit-client'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { entrarNoTreino, liberarSomDoTreino, mandarNoTreino, sairDoTreino, simularTreino, useTreino } from '../../core/live/treino'
import './aovivo.css'

/**
 * O membro do plano "treino" assiste o ensaio do admin como se fosse aluno
 * (19/10/2026): a imagem, o chat (simulado, com as mensagens dos outros
 * membros no meio) e o tamanho da sala. O selo "Simulação" fica sempre na
 * imagem e o número leva "simulado": quem assiste sabe o que está vendo.
 */

function Video({ faixa, className }: { faixa: Track | null; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!faixa || !el) return
    faixa.attach(el)
    return () => { faixa.detach(el) }
  }, [faixa])
  if (!faixa) return null
  return <video ref={ref} className={className} autoPlay playsInline muted />
}
function Som({ faixa }: { faixa: Track }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => { const el = ref.current; if (!el) return; faixa.attach(el); return () => { faixa.detach(el) } }, [faixa])
  return <audio ref={ref} autoPlay />
}

const fmt = (n: number) => n.toLocaleString('pt-BR')
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const MOMENTO: Record<string, string> = { abertura: 'Abertura', meta: 'Bateu a meta', stop: 'Tomou stop', lateral: 'Mercado lento', perguntas: 'Rodada de perguntas' }

export function AssistirTreino({ sessao, conectar = true, nomeConvidado = '' }: { sessao: SessaoTeeds | null; conectar?: boolean; nomeConvidado?: string }) {
  const t = useTreino()
  const [texto, setTexto] = useState('')
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!conectar || (!sessao && !nomeConvidado)) return
    void entrarNoTreino(sessao, nomeConvidado)
    return () => { void sairDoTreino() }
  }, [sessao?.usuario.id, conectar, nomeConvidado]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const l = lista.current
    if (l && l.scrollHeight - l.scrollTop - l.clientHeight < 140) l.scrollTop = l.scrollHeight
  }, [t.mensagens.length])

  const temImagem = !!t.tela || !!t.camera
  const enviar = async () => { if (!texto.trim()) return; await mandarNoTreino(texto); setTexto('') }

  return (
    <div className="tr-assistir">
      <div className="tr-assistir-aviso" role="note">
        <span className="tr-chip">Sala de treino</span>
        <p>Você está assistindo um <b>ensaio</b>, como se fosse aluno. O público e o chat desta sala são simulados; as mensagens marcadas "membro" são de pessoas de verdade.</p>
      </div>

      {t.fase === 'erro' && <p className="av-erro" role="alert">{t.erro}</p>}

      <div className="av-palco-e-chat">
        <div className="av-palco">
          {t.audios.map((a) => <Som key={a.sid ?? a.mediaStreamTrack.id} faixa={a} />)}
          {t.tela ? <Video faixa={t.tela} className="av-tela" /> : t.camera ? <Video faixa={t.camera} className="av-tela av-so-camera" /> : null}
          {t.tela && t.camera && <Video faixa={t.camera} className={`av-camera canto-${t.canto}`} />}
          {!temImagem && (
            <div className="av-espera tr-espera">
              {t.fase === 'conectando' ? <><i className="av-girando" aria-hidden />Entrando na sala de treino…</>
                : t.fase === 'reconectando' ? <><i className="av-girando" aria-hidden />Reconectando…</>
                  : t.presente ? <><b>O apresentador está na sala</b><span>A imagem aparece quando ele ligar a câmera ou a tela.</span></>
                    : <><b>O ensaio ainda não começou</b><span>Fique nesta tela: quando o administrador abrir a sala de treino, a imagem aparece aqui.</span></>}
            </div>
          )}
          <span className="tr-selo"><i aria-hidden />Simulação{t.sim.ativa && <> · {fmt(t.sim.publico)} na sala (simulado)</>}</span>
          {t.somBloqueado && <button className="av-som" onClick={() => void liberarSomDoTreino()}>Toque para ativar o som</button>}
        </div>

        <section className="av-chat" aria-label="Chat da sala de treino">
          {t.sim.momento && <div className="tr-momento">Momento: {MOMENTO[t.sim.momento] ?? t.sim.momento}</div>}
          <div className="av-mensagens" ref={lista} role="log" aria-live="off">
            {t.mensagens.length === 0 && <p className="av-chat-vazio">{t.sim.ativa ? 'O chat está começando…' : 'O chat aparece quando o apresentador começar a simulação.'}</p>}
            {t.mensagens.map((m) => m.entrada ? (
              <p key={m.id} className="tr-entrada">{m.nome} entrou</p>
            ) : (
              <div key={m.id} className={`av-msg ${m.apresentador ? 'mod' : ''}`}>
                <p><b>{m.nome}{m.apresentador && <em>apresentador</em>}{m.membro && <em className="tr-tag-membro">membro</em>}</b> {m.texto}</p>
                <time>{hora(m.hora)}</time>
              </div>
            ))}
          </div>
          <form className="av-escrever" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
            <label htmlFor="tr-assistir-campo" className="av-oculto">Mensagem</label>
            <input id="tr-assistir-campo" value={texto} maxLength={500} autoComplete="off"
              placeholder={t.fase === 'conectada' && t.presente ? 'Escreva no chat do ensaio' : 'O chat abre quando o ensaio começar'}
              disabled={t.fase !== 'conectada' || !t.presente} onChange={(e) => setTexto(e.target.value)} />
            <button type="submit" disabled={t.fase !== 'conectada' || !t.presente || !texto.trim()}>Enviar</button>
          </form>
        </section>
      </div>
    </div>
  )
}

/** ?tela=treino-membro no laboratório: a visão do membro com imagem e chat de exemplo. */
export function LabAssistirTreino() {
  useEffect(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720
    const c = canvas.getContext('2d')!
    let q = 0
    const desenhar = () => {
      c.fillStyle = '#0b1726'; c.fillRect(0, 0, 1280, 720)
      for (let i = 0; i < 40; i++) { const b = 360 + Math.sin((i + q / 6) / 4) * 120; c.fillStyle = Math.sin(i * 7.3 + q / 9) > 0 ? '#2f8f72' : '#c95f5f'; c.fillRect(60 + i * 29, b - 40, 16, 80) }
      q++
    }
    desenhar(); const t = window.setInterval(desenhar, 66)
    void import('livekit-client').then(({ LocalVideoTrack }) => {
      const agora = Date.now()
      const m = (min: number, nome: string, texto: string, extra: Partial<{ apresentador: boolean; membro: boolean }> = {}) =>
        ({ id: `${nome}${min}`, nome, texto, apresentador: false, entrada: false, hora: agora - min * 60000, ...extra })
      simularTreino({
        fase: 'conectada', presente: true, apresentador: false, canto: 'inf-dir',
        tela: new LocalVideoTrack(canvas.captureStream(15).getVideoTracks()[0]),
        sim: { ativa: true, publico: 712, momento: 'meta', pausada: false },
        mensagens: [m(6, 'Ana', 'boa noite pessoal'), m(5, 'Tiago', 'Meta da sessão: 5%. Limite de perda: 3%.', { apresentador: true }),
          m(4, 'Bruno', 'bora!!! meta no bolso'), m(3, 'Carla', 'Como faço para definir o limite de perda?', { membro: true }),
          m(2, 'Diego', 'disciplina demais'), m(1, 'Elaine', 'parabéns pela gestão')],
      })
    })
    return () => window.clearInterval(t)
  }, [])
  return <div className="ger av-pagina"><AssistirTreino sessao={null} conectar={false} /></div>
}
