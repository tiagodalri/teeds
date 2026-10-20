import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { Track } from 'livekit-client'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { entrarNoTreino, liberarSomDoTreino, mandarNoTreino, sairDoTreino, simularTreino, useTreino } from '../../core/live/treino'
import { MARCA } from '../../marca'
import './aovivo.css'

/**
 * O GF Member assiste a transmissão da sala de treino como se fosse aluno
 * (19/10/2026): a imagem, o chat e o tamanho da sala. O selo "Simulação"
 * fica sempre na imagem e o número leva "simulado": quem assiste sabe o que
 * está vendo. 20/10/2026: o aviso de simulação sai do cabeçalho (fica só no
 * selo da imagem); o cabeçalho é "Transmissão exclusiva para GF Members" e
 * o membro vê só o público simulado, o apresentador e as próprias mensagens.
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
  const conectada = t.fase === 'conectada'
  const enviar = async () => { if (!texto.trim()) return; await mandarNoTreino(texto); setTexto('') }
  const status = t.fase === 'conectando' || t.fase === 'reconectando' ? { cls: 'conectando', txt: t.fase === 'conectando' ? 'Conectando' : 'Reconectando' }
    : t.fase === 'erro' ? { cls: 'fora', txt: 'Fora do ar' }
      : temImagem ? { cls: 'vivo', txt: 'Ao vivo' }
        : t.presente ? { cls: 'sala', txt: 'Apresentador na sala', curto: 'Na sala' }
          : { cls: 'fora', txt: 'Aguardando início', curto: 'Em breve' }
  const primeiro = (t.quemApresenta || '').trim().split(/\s+/)[0]

  return (
    <div className="tr-assistir">
      <header className="tr-cabeca" style={MARCA.id === 'globalfly' ? { '--tr-marca': `url(${import.meta.env.BASE_URL}globalfly-gf-escuro.png)` } as CSSProperties : undefined}>
        {MARCA.id === 'globalfly' && <img className="tr-cabeca-selo" src={`${import.meta.env.BASE_URL}globalfly-gf-escuro.png`} alt="" aria-hidden />}
        <div className="tr-cabeca-texto">
          <span className="tr-cabeca-sobre">Sala de treino</span>
          <h1>Transmissão exclusiva para <em>GF Members</em></h1>
          <p>{t.presente && primeiro ? <>Com <b>{primeiro}</b>. Você está entre os membros convidados.</> : 'Fique nesta tela: a transmissão começa assim que o apresentador entrar.'}</p>
        </div>
        <span className={`tr-status ${status.cls}`} role="status"><i aria-hidden /><span className="tr-status-longo">{status.txt}</span>{'curto' in status && <span className="tr-status-curto" aria-hidden>{status.curto}</span>}</span>
      </header>

      {t.fase === 'erro' && <p className="av-erro" role="alert">{t.erro}</p>}

      <div className="av-palco-e-chat">
        <div className="av-palco">
          {t.audios.map((a) => <Som key={a.sid ?? a.mediaStreamTrack.id} faixa={a} />)}
          {t.tela ? <Video faixa={t.tela} className="av-tela" /> : t.camera ? <Video faixa={t.camera} className="av-tela av-so-camera" /> : null}
          {t.tela && t.camera && <Video faixa={t.camera} className={`av-camera canto-${t.canto}`} />}
          {!temImagem && (
            <div className="av-espera tr-espera">
              {t.fase === 'conectando' ? <><i className="av-girando" aria-hidden />Entrando na transmissão…</>
                : t.fase === 'reconectando' ? <><i className="av-girando" aria-hidden />Reconectando…</>
                  : t.presente ? <><b>O apresentador está na sala</b><span>A imagem aparece quando ele ligar a câmera ou a tela.</span></>
                    : <><b>A transmissão ainda não começou</b><span>Deixe esta tela aberta: a imagem aparece aqui sozinha.</span></>}
            </div>
          )}
          <span className="tr-selo"><i aria-hidden />Simulação{t.sim.ativa && <> · {fmt(t.sim.publico)} na sala (simulado)</>}</span>
          {t.somBloqueado && <button className="av-som" onClick={() => void liberarSomDoTreino()}>Toque para ativar o som</button>}
        </div>

        <section className="av-chat tr-chat" aria-labelledby="tr-chat-titulo">
          <div className="tr-chat-topo"><h2 id="tr-chat-titulo">Chat ao vivo</h2></div>
          <div className="av-mensagens" ref={lista} role="log" aria-live="off">
            {t.mensagens.length === 0 && <p className="av-chat-vazio">{t.sim.ativa ? 'O chat está começando…' : 'As mensagens aparecem aqui quando a transmissão começar.'}</p>}
            {t.mensagens.map((m) => m.entrada ? (
              <p key={m.id} className="tr-entrada">{m.nome} entrou</p>
            ) : (
              <div key={m.id} className={`av-msg ${m.apresentador ? 'mod' : ''} ${m.minha ? 'tr-minha' : ''}`}>
                <p><b>{m.nome}{m.apresentador && <em>apresentador</em>}{m.minha && <em className="tr-tag-membro">você</em>}</b> {m.texto}</p>
                <time>{hora(m.hora)}</time>
              </div>
            ))}
          </div>
          <form className="av-escrever" onSubmit={(e) => { e.preventDefault(); void enviar() }}>
            <label htmlFor="tr-assistir-campo" className="av-oculto">Mensagem</label>
            <input id="tr-assistir-campo" value={texto} maxLength={500} autoComplete="off" enterKeyHint="send"
              placeholder={conectada && t.presente ? 'Escreva para o apresentador' : 'O chat abre quando a transmissão começar'}
              disabled={!conectada || !t.presente} onChange={(e) => setTexto(e.target.value)} />
            <button type="submit" disabled={!conectada || !t.presente || !texto.trim()}>Enviar</button>
          </form>
          <p className="tr-privado">
            <svg viewBox="0 0 16 16" aria-hidden><rect x="3" y="7" width="10" height="7" rx="1.6" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
            Só o apresentador vê o que você escreve.
          </p>
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
      const m = (min: number, nome: string, texto: string, extra: Partial<{ apresentador: boolean; membro: boolean; minha: boolean }> = {}) =>
        ({ id: `${nome}${min}`, nome, texto, apresentador: false, entrada: false, hora: agora - min * 60000, ...extra })
      simularTreino({
        fase: 'conectada', presente: true, quemApresenta: 'Tiago Dalri', apresentador: false, canto: 'inf-dir',
        tela: new LocalVideoTrack(canvas.captureStream(15).getVideoTracks()[0]),
        sim: { ativa: true, publico: 712, momento: 'meta', pausada: false },
        mensagens: [m(6, 'Ana', 'boa noite pessoal'), m(5, 'Tiago', 'Meta da sessão: 5%. Limite de perda: 3%.', { apresentador: true }),
          m(4, 'Bruno', 'bora!!! meta no bolso'), m(3, 'Carla', 'Como faço para definir o limite de perda?', { membro: true, minha: true }),
          m(2, 'Diego', 'disciplina demais'), m(1, 'Elaine', 'parabéns pela gestão')],
      })
    })
    return () => window.clearInterval(t)
  }, [])
  return <div className="ger av-pagina"><AssistirTreino sessao={null} conectar={false} /></div>
}
