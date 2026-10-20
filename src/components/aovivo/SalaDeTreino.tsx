import { useEffect, useRef, useState } from 'react'
import type { CantoDaCamera } from '../../core/live/api'
import {
  abrirChatDoTreino, ajustar, dispararMomento, falarComoApresentador, iniciarSimulacao, limparChat, pararSimulacao, useSimulacao,
  type Momento, type Oscilacao, type Ritmo,
} from '../../core/live/simulacao'
import './aovivo.css'
import { SeletorDeFundo } from './SeletorDeFundo'
import { MedidorDeVolume } from './MedidorDeVolume'
import { MARCA } from '../../marca'
import type { SessaoTeeds } from '../../core/teeds/conta'
import {
  alternarFonte, cantoDoTreino, cantoNoTreino, entrarNoTreino, prepararSalaDoAdmin, sairDoTreino, trocarFundoDoTreino, useTreino,
} from '../../core/live/treino'

/**
 * Sala de treino (plano "treino"): o influenciador ensaia a live com a tela,
 * a câmera e o microfone de verdade, diante de um público e de um chat
 * simulados. Nada sai deste navegador. A imagem leva um selo só,
 * "Simulação", com o tamanho da sala.
 *
 * Transmitida (19/10/2026): só o admin abre esta sala; os membros do plano
 * "treino" assistem pelo link, como se fossem alunos (`AssistirTreino.tsx`).
 *
 * Organizada como o estúdio de verdade (19/10/2026, o Tiago não achava onde
 * começar nem onde ajustar): a mesa em cima com as fontes e o botão de
 * começar; o vídeo à esquerda; à direita as abas Chat e Simulação, com
 * todos os ajustes à vista. Os momentos ficam também logo abaixo do vídeo,
 * que é onde a mão está durante o ensaio.
 */

function VideoLocal({ fluxo, className, espelhar = false }: { fluxo: MediaStream | null; className: string; espelhar?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = fluxo }, [fluxo])
  if (!fluxo) return null
  return <video ref={ref} className={className} autoPlay playsInline muted style={espelhar ? { transform: 'scaleX(-1)' } : undefined} />
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
const TAMANHOS_PRONTOS = [100, 500, 1000, 5000]

/** O link que abre a sala de treino direto (cada pessoa ensaia na própria). */
export const linkDoTreino = () => `${location.origin}${import.meta.env.BASE_URL}?treino=1`

/** Cartão para mandar o link da sala de treino para a equipe. */
export function LinkDoTreino({ compacto = false }: { compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const link = linkDoTreino()
  const texto = `Sala de treino da ${MARCA.prosa}: acompanhe o ensaio da live como se fosse um aluno. Entre com a sua conta por aqui: ${link}`
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link) } catch {
      const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setCopiado(true); window.setTimeout(() => setCopiado(false), 1800)
  }
  const nativo = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <div className={`av-link-live ${compacto ? 'compacto' : ''}`}>
      <div className="av-link-live-texto">
        <small>Link para os membros assistirem</small>
        <code title={link}>{link.replace(/^https?:\/\//, '')}</code>
      </div>
      <div className="av-link-live-acoes">
        <button className={`av-botao-mini ${copiado ? 'ok' : ''}`} onClick={() => void copiar()}>{copiado ? 'Copiado' : 'Copiar'}</button>
        {nativo
          ? <button className="av-botao-whats" onClick={() => void navigator.share({ text: texto }).catch(() => undefined)}>Compartilhar</button>
          : <a className="av-botao-whats" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
      </div>
      <p className="tr-link-nota">Só membros GF Member (e administradores) entram, com a conta deles. Eles assistem o seu ensaio como alunos, com o selo "Simulação" sempre na imagem.</p>
    </div>
  )
}

export function SalaDeTreino({ apresentador, aoSair, sessao = null }: { apresentador: string; aoSair: () => void; sessao?: SessaoTeeds | null }) {
  const sim = useSimulacao()
  const tr = useTreino()
  // Abre a sala para os membros assistirem (no laboratório, sem conta, fica só
  // local). Desde 20/10/2026 sair desta tela NÃO fecha a sala: o ensaio segue
  // no player flutuante; fecha só no "Sair da sala de treino".
  useEffect(() => {
    prepararSalaDoAdmin()
    if (!sessao) return
    if (tr.apresentador && (tr.fase === 'conectada' || tr.fase === 'conectando' || tr.fase === 'reconectando')) return
    void entrarNoTreino(sessao)
  }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const { tela, camera, mic } = tr.local
  const fundo = tr.fundo
  const [canto, setCanto] = useState<CantoDaCamera>(cantoDoTreino)
  const [erro, setErro] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  // antes de começar, a aba aberta é a dos ajustes; ao começar, vai para o chat
  const [aba, setAba] = useState<'chat' | 'simulacao'>(sim.ativa ? 'chat' : 'simulacao')
  const [vistas, setVistas] = useState(0)
  // o passo "ajuste a sala" só fica feito depois que a pessoa mexe em algum ajuste
  const [ajustou, setAjustou] = useState(false)
  const lista = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const l = lista.current
    if (l && l.scrollHeight - l.scrollTop - l.clientHeight < 140) l.scrollTop = l.scrollHeight
  }, [sim.mensagens.length, aba])
  // mensagens novas enquanto a pessoa está na aba Simulação: contador na aba Chat
  const ultimas = useRef(sim.mensagens.length)
  useEffect(() => {
    if (aba === 'chat') { setVistas(0); ultimas.current = sim.mensagens.length; return }
    setVistas(Math.max(0, sim.mensagens.length - ultimas.current))
  }, [sim.mensagens.length, aba])

  const ligar = async (qual: 'tela' | 'camera' | 'mic') => { setErro(null); setErro(await alternarFonte(qual)) }
  const sairDaSala = () => { void sairDoTreino(); aoSair() }

  const podeTela = typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  const fonte = (qual: 'tela' | 'camera' | 'mic', rotulo: string, ligado: boolean) => {
    const semSuporte = qual === 'tela' && !podeTela
    return (
      <button className={`av-fonte ${ligado ? 'on' : ''}`} aria-pressed={ligado} disabled={semSuporte} onClick={() => void ligar(qual)}
        title={semSuporte ? 'Compartilhar a tela só no computador' : undefined}>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={ICONE[qual === 'mic' ? 'microfone' : qual]} />{!ligado && <path d="M4 4l16 16" />}
        </svg>
        <span><b>{rotulo}</b><small>{semSuporte ? 'só no computador' : ligado ? 'ligada no ensaio' : 'desligada'}</small></span>
      </button>
    )
  }

  const segmentado = <T extends string>(valor: T, opcoes: Array<[T, string]>, mudarPara: (v: T) => void, rotulo: string) => (
    <div className="tr-seg" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([v, r]) => <button key={v} role="radio" aria-checked={valor === v} className={valor === v ? 'on' : ''} onClick={() => mudarPara(v)}>{r}</button>)}
    </div>
  )

  const comecar = () => { iniciarSimulacao(apresentador); setAba('chat') }
  const temImagem = !!tela || !!camera
  // tela inteira: sem prévia aqui por padrão (evita o espelho infinito e poupa o computador)
  const [verPrevia, setVerPrevia] = useState(false)
  const ocultarTela = !!tela && !verPrevia &&
    (tela.getVideoTracks()[0]?.getSettings() as MediaTrackSettings & { displaySurface?: string } | undefined)?.displaySurface === 'monitor'
  const passos = [
    { feito: temImagem, titulo: 'Ligue a câmera ou a tela', dica: 'Nos botões aqui em cima. O microfone é opcional.' },
    { feito: ajustou || sim.ativa, titulo: 'Ajuste a sala', dica: 'Na aba Simulação: tamanho do público, ritmo do chat, fundo.' },
    { feito: sim.ativa, titulo: 'Comece a simulação', dica: 'É aqui que a transmissão começa: os membros passam a ver e recebem o aviso de ao vivo.' },
  ]

  const momentosRapidos = (
    <div className="tr-momentos-rapidos" role="group" aria-label="Disparar um momento">
      <span>Momentos</span>
      {MOMENTOS.map((m) => (
        <button key={m.id} className={sim.momento === m.id ? 'on' : ''} disabled={!sim.ativa} title={m.dica} onClick={() => dispararMomento(m.id)}>{m.rotulo}</button>
      ))}
    </div>
  )

  return (
    <div className="ger av-pagina av-com-palco tr-sala">
      <section className={`av-mesa ${sim.ativa ? 'tr-ativa' : ''}`} aria-label="Mesa da sala de treino">
        <div className="av-mesa-estado">
          <span className="tr-chip">Sala de treino · ensaio</span>
          <span className="av-mesa-publico">{sim.ativa ? <><b>{fmt(sim.publicoAgora)}</b> na sala simulada{sim.pausada && ' · chat pausado'}</> : 'Simulação parada'}</span>
          {sessao && (
            <span className={`tr-membros ${tr.fase === 'conectada' ? 'on' : ''}`}>
              {tr.fase === 'conectada' ? <><i aria-hidden /><b>{tr.membros}</b> {tr.membros === 1 ? 'membro na sala' : 'membros na sala'}{!sim.ativa && ' · veem você quando começar'}</>
                : tr.fase === 'erro' ? (tr.erro ?? 'Sem conexão com os membros') : 'Abrindo a sala para os membros…'}
            </span>
          )}
        </div>
        <div className="av-mesa-fontes" role="group" aria-label="O que entra no ensaio">
          {fonte('tela', 'Tela', !!tela)}
          {fonte('camera', 'Câmera', !!camera)}
          {fonte('mic', 'Microfone', !!mic)}
        </div>
        <div className="av-mesa-acao">
          {/* abre e fecha o chat para todos (público simulado e membros); o apresentador sempre escreve */}
          <button className={`av-chave-chat ${sim.chatAberto ? 'on' : ''}`} aria-pressed={sim.chatAberto}
            title={sim.chatAberto ? 'Fechar o chat: ninguém escreve, só você' : 'Abrir o chat para todos escreverem'}
            onClick={() => abrirChatDoTreino(!sim.chatAberto)}>
            <i aria-hidden />{sim.chatAberto ? 'Chat aberto' : 'Chat fechado'}
          </button>
          {sim.ativa
            ? <button className="av-botao-encerrar" onClick={() => pararSimulacao()}>Encerrar simulação</button>
            : <button className="tr-botao-iniciar" onClick={comecar}><i aria-hidden />Começar simulação</button>}
          <button className="av-link" onClick={sairDaSala}>Sair da sala de treino</button>
        </div>
        {erro && <p className="av-erro" role="alert">{erro}</p>}
      </section>

      {!sim.ativa && (
        <ol className="tr-passos" aria-label="Como ensaiar">
          {passos.map((p, i) => (
            <li key={p.titulo} className={p.feito ? 'feito' : ''}>
              <i aria-hidden>{p.feito ? '✓' : i + 1}</i>
              <span><b>{p.titulo}</b>{p.dica}</span>
            </li>
          ))}
        </ol>
      )}

      <div className="av-palco-e-chat">
        <div className="tr-palco-coluna">
          <div className="av-palco">
            {tela && ocultarTela ? (
              <div className="av-previa-oculta">
                <b>Sua tela inteira está no ensaio</b>
                <span>A prévia fica oculta aqui para não criar o efeito espelho e deixar o computador leve. Os membros veem normalmente.</span>
                <button type="button" onClick={() => setVerPrevia(true)}>Mostrar prévia</button>
              </div>
            ) : tela ? <VideoLocal fluxo={tela} className="av-tela" /> : camera ? <VideoLocal fluxo={camera} className="av-tela av-so-camera" espelhar /> : null}
            {tela && camera && <VideoLocal fluxo={camera} className={`av-camera canto-${canto}`} espelhar />}
            {!temImagem && (
              <div className="av-espera tr-espera">
                <b>Sua imagem aparece aqui</b>
                <span>Ligue a câmera ou a tela na barra de cima.</span>
              </div>
            )}
            {/* o selo único, combinado: sempre na imagem */}
            <span className="tr-selo"><i aria-hidden />Simulação{sim.ativa && <> · {fmt(sim.publicoAgora)} na sala</>}</span>
          </div>
          {momentosRapidos}
        </div>

        <div className="av-coluna">
          <div className="av-abas" role="tablist" aria-label="Chat e ajustes da simulação">
            <button role="tab" aria-selected={aba === 'chat'} className={aba === 'chat' ? 'on' : ''} onClick={() => setAba('chat')}>
              Chat{aba !== 'chat' && vistas > 0 && <span className="av-badge-aba">{vistas > 99 ? '99+' : vistas}</span>}
            </button>
            <button role="tab" aria-selected={aba === 'simulacao'} className={aba === 'simulacao' ? 'on' : ''} onClick={() => setAba('simulacao')}>Simulação</button>
          </div>

          {aba === 'chat' ? (
            <section className="av-chat" aria-label="Chat simulado">
              {sim.momento && <div className="tr-momento">Momento: {MOMENTOS.find((m) => m.id === sim.momento)?.rotulo}</div>}
              <div className="av-mensagens" ref={lista} role="log" aria-live="off">
                {sim.mensagens.length === 0 && (
                  <div className="av-chat-vazio tr-chat-vazio">
                    {sim.ativa ? 'O público está chegando…' : <>O chat ganha vida quando você começar a simulação.<button className="av-link" onClick={() => setAba('simulacao')}>Ajustar a sala antes</button></>}
                  </div>
                )}
                {sim.mensagens.map((m) => m.sistema ? (
                  <p key={m.id} className="tr-sistema" role="status">{m.texto}</p>
                ) : m.entrada ? (
                  <p key={m.id} className="tr-entrada">{m.nome} {m.saida ? 'saiu' : 'entrou'}</p>
                ) : (
                  <div key={m.id} className={`av-msg ${m.apresentador ? 'mod' : ''}`}>
                    <p><b>{m.nome}{m.apresentador && <em>você</em>}{m.membro && <em className="tr-tag-membro">membro</em>}</b> {m.texto}</p>
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
          ) : (
            <div className="av-painel tr-painel-lateral" onPointerDown={() => setAjustou(true)} onKeyDown={() => setAjustou(true)}>
              <section className="av-painel-sec">
                <h4>Público</h4>
                <label htmlFor="tr-alvo" className="tr-rotulo">Tamanho da sala</label>
                <div className="tr-alvo">
                  <input id="tr-alvo" type="range" min={50} max={10000} step={50} value={Math.min(10000, sim.publicoAlvo)}
                    onChange={(e) => ajustar({ publicoAlvo: Number(e.target.value) })} />
                  <input type="number" min={1} max={50000} value={sim.publicoAlvo} aria-label="Pessoas na sala"
                    onChange={(e) => { const n = Math.round(Number(e.target.value)); if (n > 0) ajustar({ publicoAlvo: Math.min(50000, n) }) }} />
                </div>
                <div className="tr-prontos" role="group" aria-label="Tamanhos prontos">
                  {TAMANHOS_PRONTOS.map((n) => <button key={n} className={sim.publicoAlvo === n ? 'on' : ''} onClick={() => ajustar({ publicoAlvo: n })}>{fmt(n)}</button>)}
                </div>
                <span className="tr-rotulo">Oscilação</span>
                {segmentado<Oscilacao>(sim.oscilacao, [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta']], (v) => ajustar({ oscilacao: v }), 'Oscilação do público')}
                <span className="tr-legenda">O número sobe e desce em volta do tamanho escolhido, como gente entrando e saindo.</span>
              </section>

              <section className="av-painel-sec">
                <h4>Chat simulado</h4>
                <span className="tr-rotulo">Ritmo</span>
                {segmentado<Ritmo>(sim.ritmo, [['calmo', 'Calmo'], ['normal', 'Normal'], ['agitado', 'Agitado']], (v) => ajustar({ ritmo: v }), 'Ritmo do chat')}
                <div className="tr-acoes">
                  <button className="av-link" onClick={() => ajustar({ pausada: !sim.pausada })} disabled={!sim.ativa}>{sim.pausada ? 'Retomar o chat' : 'Pausar o chat'}</button>
                  <button className="av-link" onClick={limparChat}>Limpar o chat</button>
                </div>
              </section>

              <section className="av-painel-sec">
                <h4>Momentos da live</h4>
                <div className="tr-momentos-grade">
                  {MOMENTOS.map((m) => (
                    <button key={m.id} className={sim.momento === m.id ? 'on' : ''} disabled={!sim.ativa} onClick={() => dispararMomento(m.id)}>
                      <b>{m.rotulo}</b><small>{m.dica}</small>
                    </button>
                  ))}
                </div>
                {!sim.ativa && <span className="tr-legenda">Liberados quando a simulação começar. Também ficam embaixo do vídeo.</span>}
              </section>

              <section className="av-painel-sec">
                <h4>Fundo da câmera</h4>
                <SeletorDeFundo valor={fundo} cameraLigada={!!camera} aplicando={tr.aplicandoFundo} onEscolher={(e) => void trocarFundoDoTreino(e)} />
              </section>

              <section className="av-painel-sec">
                <h4>Câmera e microfone</h4>
                <div className="av-painel-linha entre">
                  <span id="tr-canto">Seu rosto sobre a tela</span>
                  <div className="av-cantos" role="radiogroup" aria-labelledby="tr-canto">
                    {CANTOS.map((c) => <button key={c.id} role="radio" aria-checked={canto === c.id} aria-label={c.rotulo} title={c.rotulo} className={`c-${c.id} ${canto === c.id ? 'on' : ''}`} onClick={() => { setCanto(c.id); cantoNoTreino(c.id) }}><i aria-hidden /></button>)}
                  </div>
                </div>
                <span className="tr-rotulo">Volume do microfone</span>
                <MedidorDeVolume faixa={mic?.getAudioTracks()[0]} />
                {!mic && <span className="tr-legenda">Ligue o microfone na barra de cima para ver o volume.</span>}
                <span className="tr-legenda">Aqui você se vê espelhado, como num espelho. Os membros veem a imagem real, do jeito que a câmera filma.</span>
              </section>

              <section className="av-painel-sec">
                <h4>Membros assistindo</h4>
                {tr.nomes.length > 0
                  ? <div className="av-nomes">{tr.nomes.map((n, i) => <span key={i}>{n}</span>)}</div>
                  : <span className="tr-legenda">Ninguém ainda. Mande o link abaixo para os membros GF Member.</span>}
                <LinkDoTreino compacto />
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
