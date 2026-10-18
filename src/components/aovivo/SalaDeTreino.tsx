import { useEffect, useRef, useState } from 'react'
import type { CantoDaCamera } from '../../core/live/api'
import {
  ajustar, dispararMomento, falarComoApresentador, iniciarSimulacao, limparChat, pararSimulacao, useSimulacao,
  type Momento, type Oscilacao, type Ritmo,
} from '../../core/live/simulacao'
import './aovivo.css'

/**
 * Sala de treino (plano "treino"): o influenciador ensaia a live com a tela,
 * a câmera e o microfone de verdade, diante de um público e de um chat
 * simulados. Nada sai deste navegador. A imagem leva um selo só,
 * "Simulação", com o tamanho da sala.
 */

function VideoLocal({ fluxo, className, espelhar = false }: { fluxo: MediaStream | null; className: string; espelhar?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = fluxo }, [fluxo])
  if (!fluxo) return null
  return <video ref={ref} className={className} autoPlay playsInline muted style={espelhar ? { transform: 'scaleX(-1)' } : undefined} />
}

function useNivelLocal(fluxo: MediaStream | null): number {
  const [nivel, setNivel] = useState(0)
  useEffect(() => {
    if (!fluxo) { setNivel(0); return }
    const ctx = new AudioContext()
    const fonte = ctx.createMediaStreamSource(fluxo)
    const an = ctx.createAnalyser(); an.fftSize = 512; fonte.connect(an)
    const dados = new Uint8Array(an.fftSize); let q = 0
    const medir = () => {
      an.getByteTimeDomainData(dados)
      let soma = 0; for (const d of dados) { const x = (d - 128) / 128; soma += x * x }
      setNivel(Math.min(1, Math.sqrt(soma / dados.length) * 4)); q = requestAnimationFrame(medir)
    }
    medir()
    return () => { cancelAnimationFrame(q); fonte.disconnect(); void ctx.close() }
  }, [fluxo])
  return nivel
}

const ICONE: Record<string, string> = {
  tela: 'M3 5h18v12H3zM8 21h8M12 17v4',
  camera: 'M3 7h12v10H3zM15 11l6-3v8l-6-3',
  microfone: 'M12 3a3 3 0 013 3v6a3 3 0 01-6 0V6a3 3 0 013-3zM5 11a7 7 0 0014 0M12 18v3',
}
const fmt = (n: number) => n.toLocaleString('pt-BR')
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const MOMENTOS: Array<{ id: Momento; rotulo: string; dica: string }> = [
  { id: 'abertura', rotulo: 'Abertura', dica: 'Chuva de saudações' },
  { id: 'meta', rotulo: 'Bateu a meta', dica: 'Comemoração e gestão' },
  { id: 'stop', rotulo: 'Tomou stop', dica: 'Apoio e disciplina' },
  { id: 'lateral', rotulo: 'Mercado lento', dica: 'Paciência' },
  { id: 'perguntas', rotulo: 'Rodada de perguntas', dica: 'Dúvidas para responder' },
]
const CANTOS: Array<{ id: CantoDaCamera; rotulo: string }> = [
  { id: 'sup-esq', rotulo: 'Em cima, à esquerda' }, { id: 'sup-dir', rotulo: 'Em cima, à direita' },
  { id: 'inf-esq', rotulo: 'Embaixo, à esquerda' }, { id: 'inf-dir', rotulo: 'Embaixo, à direita' },
]

export function SalaDeTreino({ apresentador, aoSair }: { apresentador: string; aoSair: () => void }) {
  const sim = useSimulacao()
  const [tela, setTela] = useState<MediaStream | null>(null)
  const [camera, setCamera] = useState<MediaStream | null>(null)
  const [mic, setMic] = useState<MediaStream | null>(null)
  const [canto, setCanto] = useState<CantoDaCamera>('inf-dir')
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const nivel = useNivelLocal(mic)
  const lista = useRef<HTMLDivElement>(null)

  // desliga tudo ao sair da sala
  const fluxos = useRef<MediaStream[]>([])
  useEffect(() => () => { pararSimulacao(); fluxos.current.forEach((f) => f.getTracks().forEach((t) => t.stop())) }, [])
  useEffect(() => {
    const l = lista.current
    if (l && l.scrollHeight - l.scrollTop - l.clientHeight < 140) l.scrollTop = l.scrollHeight
  }, [sim.mensagens.length])

  const ligar = async (qual: 'tela' | 'camera' | 'mic') => {
    setErro(null)
    const atual = qual === 'tela' ? tela : qual === 'camera' ? camera : mic
    const definir = qual === 'tela' ? setTela : qual === 'camera' ? setCamera : setMic
    if (atual) { atual.getTracks().forEach((t) => t.stop()); definir(null); return }
    try {
      const f = qual === 'tela'
        ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false })
        : await navigator.mediaDevices.getUserMedia(qual === 'camera' ? { video: { width: 640, height: 640 } } : { audio: { echoCancellation: true, noiseSuppression: true } })
      fluxos.current.push(f)
      // parou pela barra do navegador: o botão acompanha
      f.getTracks().forEach((t) => t.addEventListener('ended', () => definir(null)))
      definir(f)
    } catch {
      setErro('O navegador não liberou o acesso. Permita a câmera, o microfone ou a tela no cadeado da barra de endereço.')
    }
  }

  const fonte = (qual: 'tela' | 'camera' | 'mic', rotulo: string, ligado: boolean) => (
    <button className={`av-fonte ${ligado ? 'on' : ''}`} aria-pressed={ligado} onClick={() => void ligar(qual)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={ICONE[qual === 'mic' ? 'microfone' : qual]} />{!ligado && <path d="M4 4l16 16" />}
      </svg>
      <span><b>{rotulo}</b><small>{ligado ? 'ligada no ensaio' : 'desligada'}</small></span>
    </button>
  )

  const segmentado = <T extends string>(valor: T, opcoes: Array<[T, string]>, mudarPara: (v: T) => void, rotulo: string) => (
    <div className="tr-seg" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([v, r]) => <button key={v} role="radio" aria-checked={valor === v} className={valor === v ? 'on' : ''} onClick={() => mudarPara(v)}>{r}</button>)}
    </div>
  )

  return (
    <div className="ger av-pagina av-com-palco tr-sala">
      <section className={`av-mesa ${sim.ativa ? 'tr-ativa' : ''}`} aria-label="Mesa da sala de treino">
        <div className="av-mesa-estado">
          <span className="tr-chip">Sala de treino</span>
          <span className="av-mesa-publico">{sim.ativa ? <><b>{fmt(sim.publicoAgora)}</b> na sala simulada</> : 'Público simulado parado'}</span>
        </div>
        <div className="av-mesa-fontes" role="group" aria-label="O que entra no ensaio">
          {fonte('tela', 'Tela', !!tela)}
          {fonte('camera', 'Câmera', !!camera)}
          {fonte('mic', 'Microfone', !!mic)}
        </div>
        <div className="av-mesa-acao">
          {sim.ativa
            ? <button className="av-botao-encerrar" onClick={() => pararSimulacao()}>Encerrar simulação</button>
            : <button className="tr-botao-iniciar" onClick={() => iniciarSimulacao(apresentador)}><i aria-hidden />Começar simulação</button>}
        </div>
        {erro && <p className="av-erro" role="alert">{erro}</p>}
      </section>

      <div className="av-palco-e-chat">
        <div className="av-palco">
          {tela ? <VideoLocal fluxo={tela} className="av-tela" /> : camera ? <VideoLocal fluxo={camera} className="av-tela av-so-camera" espelhar /> : null}
          {tela && camera && <VideoLocal fluxo={camera} className={`av-camera canto-${canto}`} espelhar />}
          {!tela && !camera && <div className="av-espera">Ligue a tela ou a câmera para ensaiar com imagem.</div>}
          {/* o selo único, combinado: sempre na imagem */}
          <span className="tr-selo"><i aria-hidden />Simulação{sim.ativa && <> · {fmt(sim.publicoAgora)} na sala</>}</span>
        </div>

        <section className="av-chat" aria-label="Chat simulado">
          {sim.momento && <div className="tr-momento">Momento: {MOMENTOS.find((m) => m.id === sim.momento)?.rotulo}</div>}
          <div className="av-mensagens" ref={lista} role="log" aria-live="off">
            {sim.mensagens.length === 0 && <p className="av-chat-vazio">{sim.ativa ? 'O público está chegando…' : 'Comece a simulação para o chat ganhar vida.'}</p>}
            {sim.mensagens.map((m) => m.entrada ? (
              <p key={m.id} className="tr-entrada">{m.nome} entrou</p>
            ) : (
              <div key={m.id} className={`av-msg ${m.apresentador ? 'mod' : ''}`}>
                <p><b>{m.nome}{m.apresentador && <em>você</em>}</b> {m.texto}</p>
                <time>{hora(m.hora)}</time>
              </div>
            ))}
          </div>
          <form className="av-escrever" onSubmit={(e) => { e.preventDefault(); falarComoApresentador(texto); setTexto('') }}>
            <label htmlFor="tr-campo" className="av-oculto">Responder no chat</label>
            <input id="tr-campo" value={texto} maxLength={500} autoComplete="off" placeholder="Responda como apresentador" onChange={(e) => setTexto(e.target.value)} />
            <button type="submit" disabled={!texto.trim()}>Enviar</button>
          </form>
        </section>
      </div>

      <section className="tr-painel" aria-label="Controles da simulação">
        <div className="tr-bloco tr-publico">
          <label htmlFor="tr-alvo">Tamanho da sala</label>
          <div className="tr-alvo">
            <input id="tr-alvo" type="range" min={50} max={10000} step={50} value={sim.publicoAlvo}
              onChange={(e) => ajustar({ publicoAlvo: Number(e.target.value) })} />
            <input type="number" min={1} max={50000} value={sim.publicoAlvo} aria-label="Pessoas na sala"
              onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n > 0) ajustar({ publicoAlvo: Math.min(50000, n) }) }} />
          </div>
          <span className="tr-legenda">O número sobe e desce em volta deste valor, como gente entrando e saindo.</span>
        </div>
        <div className="tr-bloco">
          <span className="tr-rotulo">Oscilação</span>
          {segmentado<Oscilacao>(sim.oscilacao, [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']], (v) => ajustar({ oscilacao: v }), 'Oscilação do público')}
          <span className="tr-rotulo">Ritmo do chat</span>
          {segmentado<Ritmo>(sim.ritmo, [['calmo', 'Calmo'], ['normal', 'Normal'], ['agitado', 'Agitado']], (v) => ajustar({ ritmo: v }), 'Ritmo do chat')}
        </div>
        <div className="tr-bloco tr-momentos">
          <span className="tr-rotulo">Momentos da live</span>
          <div className="tr-momentos-grade">
            {MOMENTOS.map((m) => (
              <button key={m.id} className={sim.momento === m.id ? 'on' : ''} disabled={!sim.ativa} onClick={() => dispararMomento(m.id)}>
                <b>{m.rotulo}</b><small>{m.dica}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="tr-bloco">
          <span className="tr-rotulo" id="tr-canto">Seu rosto aparece</span>
          <div className="av-cantos" role="radiogroup" aria-labelledby="tr-canto">
            {CANTOS.map((c) => <button key={c.id} role="radio" aria-checked={canto === c.id} aria-label={c.rotulo} title={c.rotulo} className={`c-${c.id} ${canto === c.id ? 'on' : ''}`} onClick={() => setCanto(c.id)}><i aria-hidden /></button>)}
          </div>
          <span className="tr-rotulo">Microfone</span>
          <span className="av-medidor" role="meter" aria-label="Volume do microfone" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(nivel * 100)}><i style={{ width: `${Math.round(nivel * 100)}%` }} /></span>
          <div className="tr-acoes">
            <button className="av-link" onClick={() => ajustar({ pausada: !sim.pausada })} disabled={!sim.ativa}>{sim.pausada ? 'Retomar o chat' : 'Pausar o chat'}</button>
            <button className="av-link" onClick={limparChat}>Limpar o chat</button>
            <button className="av-link" onClick={aoSair}>Sair da sala de treino</button>
          </div>
        </div>
      </section>
    </div>
  )
}
