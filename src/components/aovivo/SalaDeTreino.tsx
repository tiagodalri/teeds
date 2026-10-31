import { Suspense, lazy, useEffect, useRef, useState } from 'react'
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
  alternarFonte, cantoDoTreino, cantoNoTreino, definirVitrinesDoTreino, entrarNoTreino, linkDoTeste, prepararSalaDoAdmin, sairDoTreino,
  trocarFundoDoTreino, trocarTeste, usarEstudioNoTreino, useTreino,
} from '../../core/live/treino'
import { listarTransmissoes, plataformasDaMarca, type Transmissao } from '../../core/live/historico'

// o estúdio de cenas (31/10/2026) só baixa quando é usado
const Estudio = lazy(() => import('./estudio/Estudio'))

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

/* ---------------------------------------------------------- o movimento da sala
   Central ao vivo (23/10/2026): quem entrou, quem saiu, há quanto tempo cada
   um está, o pico e as mensagens para a equipe. Fica no módulo (sair da tela
   não apaga) e vale enquanto esta aba do navegador estiver aberta; o
   histórico de todas as lives vem com a coleta no banco. */
type Movimento = { id: number; hora: number; tipo: 'entrou' | 'saiu' | 'mensagem'; nome: string; texto?: string }
const central = {
  noArDesde: 0,
  pico: 0,
  pessoas: new Set<string>(),
  naSalaDesde: new Map<string, number>(),
  movimento: [] as Movimento[],
  mensagensVistas: new Set<string>(),
  paraEquipe: 0,
  respondidas: new Set<string>(),
  seq: 0,
}
const registrar = (m: Omit<Movimento, 'id'>) => { central.movimento = [{ ...m, id: ++central.seq }, ...central.movimento].slice(0, 200) }
const duracao = (ms: number) => {
  const min = Math.max(0, Math.floor(ms / 60000))
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`
}
const relogio = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** O link que abre a sala de treino direto (cada pessoa ensaia na própria). */
export const linkDoTreino = () => `${location.origin}${import.meta.env.BASE_URL}?treino=1`

/** Cartão para mandar o link da sala de treino para a equipe. */
export function LinkDoTreino({ compacto = false }: { compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const link = linkDoTreino()
  const texto = `Sala de treino da ${MARCA.prosa}: transmissão exclusiva do GF Member. Entre com a sua conta por aqui: ${link}`
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
      <p className="tr-link-nota">Só quem é do GF Member (e os administradores) entra, com a própria conta. Eles assistem ao seu ensaio como alunos, com o selo "GF Streaming" sempre na imagem.</p>
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
    void entrarNoTreino(sessao, '', true)
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
  // Estúdio de cenas (como o OBS) ou só tela e câmera, como antes (31/10/2026)
  const CHAVE_MODO = `${MARCA.id}.central.modo`
  const computador = typeof window !== 'undefined' && window.matchMedia('(min-width: 901px)').matches
  const [modo, setModoEstado] = useState<'estudio' | 'simples'>(() => {
    try { const g = localStorage.getItem(CHAVE_MODO); if (g === 'estudio' || g === 'simples') return g } catch { /* sem armazenamento */ }
    return computador ? 'estudio' : 'simples'
  })
  const setModo = (m: 'estudio' | 'simples') => {
    setModoEstado(m)
    try { localStorage.setItem(CHAVE_MODO, m) } catch { /* só agora */ }
    if (m === 'simples') void usarEstudioNoTreino(null)
  }
  const comEstudio = modo === 'estudio' && computador
  const [abaLado, setAbaLado] = useState<'chat' | 'sala' | 'simulacao' | 'historico'>('chat')
  const [verDestino, setVerDestino] = useState(false)
  const [nomesDasPlataformas, setNomes] = useState<Record<string, string>>({})
  useEffect(() => { if (sessao && MARCA.parceiros?.length) void plataformasDaMarca(sessao).then((l) => setNomes(Object.fromEntries(l.map((p) => [p.codigo, p.nome])))) }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const [cheia, setCheia] = useState(false)
  useEffect(() => { const f = () => setCheia(!!document.fullscreenElement); document.addEventListener('fullscreenchange', f); return () => document.removeEventListener('fullscreenchange', f) }, [])
  const alternarTelaCheia = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined); else void document.documentElement.requestFullscreen?.().catch(() => undefined) }
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
        <span><b>{rotulo}</b><small>{semSuporte ? 'Só no computador' : ligado ? 'Ligada no ensaio' : 'Desligada'}</small></span>
      </button>
    )
  }

  const segmentado = <T extends string>(valor: T, opcoes: Array<[T, string]>, mudarPara: (v: T) => void, rotulo: string) => (
    <div className="tr-seg" role="radiogroup" aria-label={rotulo}>
      {opcoes.map(([v, r]) => <button key={v} role="radio" aria-checked={valor === v} className={valor === v ? 'on' : ''} onClick={() => mudarPara(v)}>{r}</button>)}
    </div>
  )

  const comecar = () => { iniciarSimulacao(apresentador); setAba('chat'); setAbaLado('chat') }
  const temImagem = !!tela || !!camera || comEstudio
  // tela inteira: sem prévia aqui por padrão (evita o espelho infinito e poupa o computador)
  const [verPrevia, setVerPrevia] = useState(false)
  const ocultarTela = !!tela && !verPrevia &&
    (tela.getVideoTracks()[0]?.getSettings() as MediaTrackSettings & { displaySurface?: string } | undefined)?.displaySurface === 'monitor'
  const passos = [
    comEstudio
      ? { feito: true, titulo: 'Monte as cenas no estúdio', dica: 'Abaixo: cenas, fontes, mixer e transição. O que está em Ao vivo é o que os alunos recebem.' }
      : { feito: temImagem, titulo: 'Ligue a câmera ou a tela', dica: 'Nos botões Tela, Câmera e Microfone, no topo. O microfone é opcional.' },
    { feito: ajustou || sim.ativa, titulo: 'Ajuste a sala', dica: 'Na coluna da esquerda: tamanho do público, chat e câmera.' },
    { feito: sim.ativa, titulo: 'Comece a transmissão', dica: 'No botão dourado do topo. Os membros passam a ver você e recebem o aviso de ao vivo.' },
  ]

  const momentosRapidos = (
    <div className="tr-momentos-rapidos" role="group" aria-label="Disparar um momento">
      <span>Momentos</span>
      {MOMENTOS.map((m) => (
        <button key={m.id} className={sim.momento === m.id ? 'on' : ''} disabled={!sim.ativa} title={m.dica} onClick={() => dispararMomento(m.id)}>{m.rotulo}</button>
      ))}
    </div>
  )

  /* ------------------------------------------------- o que a Central acompanha */
  const [, setTique] = useState(0)
  useEffect(() => { const t = window.setInterval(() => setTique((n) => n + 1), 1000); return () => window.clearInterval(t) }, [])
  useEffect(() => {
    if (sim.ativa && !central.noArDesde) central.noArDesde = Date.now()
    if (!sim.ativa) central.noArDesde = 0
  }, [sim.ativa])
  // entradas e saídas dos membros de verdade (os nomes que a sala do LiveKit informa)
  const nomesAntes = useRef<string[] | null>(null)
  useEffect(() => {
    const agora = tr.nomes
    const antes = nomesAntes.current
    nomesAntes.current = agora
    central.pico = Math.max(central.pico, tr.membros)
    for (const n of agora) {
      central.pessoas.add(n)
      if (!central.naSalaDesde.has(n)) {
        central.naSalaDesde.set(n, Date.now())
        if (antes) registrar({ hora: Date.now(), tipo: 'entrou', nome: n })
      }
    }
    for (const [n, desde] of [...central.naSalaDesde]) {
      if (agora.includes(n)) continue
      central.naSalaDesde.delete(n)
      registrar({ hora: Date.now(), tipo: 'saiu', nome: n, texto: `ficou ${duracao(Date.now() - desde)}` })
    }
  }, [tr.nomes.join('|'), tr.membros]) // eslint-disable-line react-hooks/exhaustive-deps
  // as mensagens dos membros de verdade são "para a equipe"
  useEffect(() => {
    for (const m of sim.mensagens) {
      if (!m.membro || central.mensagensVistas.has(m.id)) continue
      central.mensagensVistas.add(m.id)
      central.paraEquipe++
      registrar({ hora: m.hora, tipo: 'mensagem', nome: m.nome, texto: m.texto })
    }
  }, [sim.mensagens])
  const [abaChat, setAbaChat] = useState<'equipe' | 'todos'>('equipe')
  const paraEquipe = sim.mensagens.filter((m) => m.membro)
  const naoRespondidas = paraEquipe.filter((m) => !central.respondidas.has(m.id)).length
  const [, setRespostas] = useState(0)
  const marcarVista = (id: string) => { central.respondidas.add(id); setRespostas((n) => n + 1) }
  const responder = (nome: string) => { setAbaChat('todos'); setTexto(`@${nome.split(' ')[0]} `); window.setTimeout(() => document.getElementById('tr-campo')?.focus(), 0) }
  const naSala = [...central.naSalaDesde].sort((a, b) => a[1] - b[1])
  const mensagensDoChat = abaChat === 'equipe' ? paraEquipe : sim.mensagens

  const controles = (
    <div className="cv-controles" onPointerDown={() => setAjustou(true)} onKeyDown={() => setAjustou(true)}>
      <section className="cv-card">
        <h4>Tema dos comentários</h4>
        <span className="tr-legenda">Um toque muda o assunto do chat simulado por alguns segundos, combinando com o momento da live.</span>
        <div className="tr-momentos-grade">
          {MOMENTOS.map((m) => (
            <button key={m.id} className={sim.momento === m.id ? 'on' : ''} disabled={!sim.ativa} onClick={() => dispararMomento(m.id)}>
              <b>{m.rotulo}</b><small>{m.dica}</small>
            </button>
          ))}
        </div>
        {!sim.ativa && <span className="tr-legenda">Ficam liberados quando a transmissão começar.</span>}
      </section>

      <section className="cv-card">
        <h4>Público simulado</h4>
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
      </section>

      <section className="cv-card">
        <h4>Chat</h4>
        <div className="cv-linha"><span>Membros podem escrever</span>
          <button className={`av-chave-chat ${sim.chatAberto ? 'on' : ''}`} aria-pressed={sim.chatAberto} onClick={() => abrirChatDoTreino(!sim.chatAberto)}><i aria-hidden />{sim.chatAberto ? 'Aberto' : 'Fechado'}</button>
        </div>
        <span className="tr-rotulo">Ritmo do chat simulado</span>
        {segmentado<Ritmo>(sim.ritmo, [['calmo', 'Calmo'], ['normal', 'Normal'], ['agitado', 'Agitado']], (v) => ajustar({ ritmo: v }), 'Ritmo do chat')}
        <div className="tr-acoes">
          <button className="av-link" onClick={() => ajustar({ pausada: !sim.pausada })} disabled={!sim.ativa}>{sim.pausada ? 'Retomar o chat simulado' : 'Pausar o chat simulado'}</button>
          <button className="av-link" onClick={limparChat}>Limpar o chat</button>
        </div>
      </section>

      {!comEstudio && <section className="cv-card">
        <h4>Câmera e microfone</h4>
        <div className="av-painel-linha entre">
          <span id="tr-canto">Seu rosto sobre a tela</span>
          <div className="av-cantos" role="radiogroup" aria-labelledby="tr-canto">
            {CANTOS.map((c) => <button key={c.id} role="radio" aria-checked={canto === c.id} aria-label={c.rotulo} title={c.rotulo} className={`c-${c.id} ${canto === c.id ? 'on' : ''}`} onClick={() => { setCanto(c.id); cantoNoTreino(c.id) }}><i aria-hidden /></button>)}
          </div>
        </div>
        <span className="tr-rotulo">Volume do microfone</span>
        <MedidorDeVolume faixa={mic?.getAudioTracks()[0]} />
        {!mic && <span className="tr-legenda">Ligue o microfone no topo para ver o volume.</span>}
        <span className="tr-rotulo">Fundo da câmera</span>
        <SeletorDeFundo valor={fundo} cameraLigada={!!camera} aplicando={tr.aplicandoFundo} onEscolher={(e) => void trocarFundoDoTreino(e)} />
      </section>}
    </div>
  )

  const movimento = (
    <section className="cv-card cv-movimento" aria-label="Movimento da sala">
      <h4>Movimento da sala <small>membros reais</small></h4>
      {central.movimento.length === 0
        ? <span className="tr-legenda">Quando um membro entrar, sair ou mandar mensagem, aparece aqui.</span>
        : <ol>
          {central.movimento.slice(0, 40).map((m) => (
            <li key={m.id} className={`cv-mov-${m.tipo}`}>
              <time className="cv-num">{hora(m.hora)}</time>
              <i aria-hidden>{m.tipo === 'entrou' ? '→' : m.tipo === 'saiu' ? '←' : '✉'}</i>
              <span><b>{m.nome}</b> {m.tipo === 'entrou' ? 'entrou' : m.tipo === 'saiu' ? `saiu · ${m.texto}` : <>escreveu: <q>{m.texto}</q></>}</span>
            </li>
          ))}
        </ol>}
    </section>
  )
  const chatDaSala = (
    <section className="av-chat cv-chat" aria-label="Chat">
      <div className="av-abas" role="tablist" aria-label="Mensagens">
        <button role="tab" aria-selected={abaChat === 'equipe'} className={abaChat === 'equipe' ? 'on' : ''} onClick={() => setAbaChat('equipe')}>
          Para a equipe{naoRespondidas > 0 && <span className="av-badge-aba">{naoRespondidas > 99 ? '99+' : naoRespondidas}</span>}
        </button>
        <button role="tab" aria-selected={abaChat === 'todos'} className={abaChat === 'todos' ? 'on' : ''} onClick={() => setAbaChat('todos')}>Todos</button>
      </div>
      {sim.momento && abaChat === 'todos' && <div className="tr-momento">Tema: {MOMENTOS.find((m) => m.id === sim.momento)?.rotulo}</div>}
      <div className="av-mensagens" ref={lista} role="log" aria-live="off">
        {mensagensDoChat.length === 0 && (
          <div className="av-chat-vazio tr-chat-vazio">
            {abaChat === 'equipe' ? 'As mensagens dos membros de verdade aparecem aqui, separadas do chat simulado.' : sim.ativa ? 'O público está chegando…' : 'O chat ganha vida quando você começar a transmissão.'}
          </div>
        )}
        {mensagensDoChat.map((m) => m.sistema ? (
          <p key={m.id} className="tr-sistema" role="status">{m.texto}</p>
        ) : m.entrada ? (
          <p key={m.id} className="tr-entrada">{m.nome} {m.saida ? 'saiu' : 'entrou'}</p>
        ) : (
          <div key={m.id} className={`av-msg ${m.apresentador ? 'mod' : ''} ${m.membro && central.respondidas.has(m.id) ? 'cv-vista' : ''}`}>
            <p><b>{m.nome}{m.apresentador && <em>Você</em>}{m.membro && <em className="tr-tag-membro">Membro</em>}</b> {m.texto}</p>
            <time>{hora(m.hora)}</time>
            {m.membro && abaChat === 'equipe' && (
              <div className="cv-msg-acoes">
                <button type="button" onClick={() => responder(m.nome)}>Responder no chat</button>
                {!central.respondidas.has(m.id) ? <button type="button" onClick={() => marcarVista(m.id)}>Marcar como vista</button> : <span>Vista</span>}
              </div>
            )}
          </div>
        ))}
      </div>
      <form className="av-escrever" onSubmit={(e) => { e.preventDefault(); falarComoApresentador(texto); setTexto('') }}>
        <label htmlFor="tr-campo" className="av-oculto">Responder no chat</label>
        <input id="tr-campo" value={texto} maxLength={500} autoComplete="off" placeholder="Escreva como equipe, todos veem" onChange={(e) => setTexto(e.target.value)} />
        <button type="submit" disabled={!texto.trim()}>Enviar</button>
      </form>
    </section>
  )
  const naSalaCard = (
    <section className="cv-card cv-na-sala" aria-label="Membros na sala">
      <h4>Na sala agora <small>{naSala.length} {naSala.length === 1 ? 'membro' : 'membros'}</small></h4>
      {naSala.length === 0
        ? <span className="tr-legenda">Ninguém ainda. Mande o link abaixo para quem é do GF Member.</span>
        : <ul>{naSala.map(([n, desde]) => <li key={n}><span>{n}</span><b className="cv-num">{duracao(Date.now() - desde)}</b></li>)}</ul>}
      <LinkDoTreino compacto />
    </section>
  )

  /* A Central como um aplicativo de transmissão (31/10/2026, "como se fosse
     um OBS nativo"): tela inteira, sempre noturna, estúdio no meio, chat e
     sala na coluna da direita, barra de estado embaixo. */
  if (comEstudio) {
    const destino = tr.teste ? 'Teste com link privado' : !tr.vitrines ? 'Todas as plataformas' : tr.vitrines.map((v) => (v === 'direto' ? 'Direto' : nomesDasPlataformas[v] ?? `/${v}`)).join(', ')
    return (
      <div className={`cv-app ${sim.ativa ? 'no-ar' : ''} ${tr.teste ? 'em-teste' : ''}`} aria-label="Central ao vivo">
        <header className="cv-app-topo">
          <div className="cv-app-marca">
            {MARCA.id === 'globalfly' && <img src={`${import.meta.env.BASE_URL}globalfly-gf-escuro.png`} alt="" aria-hidden />}
            <span><b>Central ao vivo</b><small>Sala de treino</small></span>
          </div>
          <span className={`cv-app-estado ${sim.ativa ? 'vivo' : ''}`} role="status">
            <i aria-hidden />{sim.ativa ? (tr.teste ? 'Teste no ar' : 'Ao vivo') : 'Fora do ar'}{sim.ativa && <b className="cv-num">{relogio(Date.now() - central.noArDesde)}</b>}
          </span>
          {sessao && (
            <span className={`cv-app-conexao ${tr.fase === 'conectada' ? 'on' : tr.fase === 'erro' ? 'erro' : ''}`} title={tr.fase === 'erro' ? tr.erro ?? undefined : undefined}>
              {tr.fase === 'conectada' ? <><b className="cv-num">{tr.membros}</b> {tr.membros === 1 ? 'membro na sala' : 'membros na sala'}</> : tr.fase === 'erro' ? 'Sem conexão com a sala' : 'Abrindo a sala…'}
            </span>
          )}
          {sessao && (
            <div className="cv-app-destino">
              <button type="button" className={`cv-app-pill ${verDestino ? 'on' : ''} ${tr.teste ? 'teste' : ''}`} aria-expanded={verDestino} onClick={() => setVerDestino(!verDestino)}>
                <small>Para</small>{destino}<i aria-hidden>▾</i>
              </button>
              {verDestino && (
                <div className="cv-app-pop" role="dialog" aria-label="Quem recebe a transmissão">
                  <DestinoDaTransmissao sessao={sessao} noAr={sim.ativa} />
                  <button type="button" className="av-link" onClick={() => setVerDestino(false)}>Fechar</button>
                </div>
              )}
            </div>
          )}
          <span className="cv-app-espaco" />
          {computador && <div className="tr-seg cv-modo" role="radiogroup" aria-label="De onde vem a imagem">
            <button role="radio" aria-checked={comEstudio} className={comEstudio ? 'on' : ''} disabled={sim.ativa} title={sim.ativa ? 'Encerre a transmissão para trocar' : undefined} onClick={() => setModo('estudio')}>Estúdio de cenas</button>
            <button role="radio" aria-checked={!comEstudio} className={!comEstudio ? 'on' : ''} disabled={sim.ativa} title={sim.ativa ? 'Encerre a transmissão para trocar' : undefined} onClick={() => setModo('simples')}>Tela e câmera</button>
          </div>}
          {sim.ativa
            ? <button className="av-botao-encerrar" onClick={() => pararSimulacao()}>Encerrar transmissão</button>
            : <button className="tr-botao-iniciar" onClick={comecar}><i aria-hidden />Começar transmissão</button>}
          <button type="button" className="cv-app-ico" aria-label={cheia ? 'Sair da tela cheia' : 'Tela cheia'} title={cheia ? 'Sair da tela cheia' : 'Tela cheia'} onClick={alternarTelaCheia}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={cheia ? 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' : 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5'} /></svg>
          </button>
          <button type="button" className="cv-app-sair" onClick={sairDaSala}>Sair da Central</button>
        </header>
        {erro && <p className="av-erro cv-app-erro" role="alert">{erro}</p>}

        <div className="cv-app-corpo">
          <Suspense fallback={<section className="es es-carregando"><p>Abrindo o estúdio…</p></section>}><Estudio app /></Suspense>
          <aside className="cv-app-lado" aria-label="Chat e sala">
            <div className="cv-app-abas" role="tablist" aria-label="Painéis">
              {(['chat', 'sala', 'simulacao', 'historico'] as const).map((a) => (
                <button key={a} role="tab" aria-selected={abaLado === a} className={abaLado === a ? 'on' : ''} onClick={() => setAbaLado(a)}>
                  {a === 'chat' ? 'Chat' : a === 'sala' ? 'Sala' : a === 'simulacao' ? 'Simulação' : 'Histórico'}
                  {a === 'chat' && naoRespondidas > 0 && <span className="av-badge-aba">{naoRespondidas > 99 ? '99+' : naoRespondidas}</span>}
                </button>
              ))}
            </div>
            <div className={`cv-app-painel aba-${abaLado}`}>
              {abaLado === 'chat' && chatDaSala}
              {abaLado === 'sala' && <>{naSalaCard}{movimento}</>}
              {abaLado === 'simulacao' && controles}
              {abaLado === 'historico' && sessao && <HistoricoDasTransmissoes sessao={sessao} noAr={sim.ativa} compacto />}
            </div>
          </aside>
        </div>

        <footer className="cv-app-status" aria-label="Estado da transmissão">
          <span className={sim.ativa ? 'vivo' : ''}><i aria-hidden />{sim.ativa ? (tr.teste ? 'Teste no ar' : 'Ao vivo') : 'Fora do ar'} <b className="cv-num">{sim.ativa ? relogio(Date.now() - central.noArDesde) : '00:00:00'}</b></span>
          <span>Membros <b className="cv-num">{tr.membros}</b></span>
          <span>Pico <b className="cv-num">{central.pico}</b></span>
          <span>Passaram <b className="cv-num">{central.pessoas.size}</b></span>
          <span>Para a equipe <b className="cv-num">{central.paraEquipe}</b>{naoRespondidas > 0 && <em> · {naoRespondidas} sem resposta</em>}</span>
          <span>Público simulado <b className="cv-num">{sim.ativa ? fmt(sim.publicoAgora) : '—'}</b></span>
          <span className="cv-app-espaco" />
          <span>Saída <b className="cv-num">1920×1080 · 30 fps</b></span>
        </footer>
      </div>
    )
  }

  return (
    <div className="ger av-pagina av-com-palco tr-sala cv">
      <section className={`av-mesa ${sim.ativa ? 'tr-ativa' : ''}`} aria-label="Central ao vivo">
        <div className="av-mesa-estado">
          <span className="tr-chip">Central ao vivo · sala de treino</span>
          <span className="av-mesa-publico">{sim.ativa ? <>No ar há <b className="cv-num">{relogio(Date.now() - central.noArDesde)}</b>{sim.pausada && ' · chat simulado pausado'}</> : 'Transmissão parada'}</span>
          {sessao && (
            <span className={`tr-membros ${tr.fase === 'conectada' ? 'on' : ''}`}>
              {tr.fase === 'conectada' ? <><i aria-hidden /><b>{tr.membros}</b> {tr.membros === 1 ? 'membro na sala' : 'membros na sala'}{!sim.ativa && ' · veem você quando começar'}</>
                : tr.fase === 'erro' ? (tr.erro ?? 'Sem conexão com os membros') : 'Abrindo a sala para os membros…'}
            </span>
          )}
        </div>
        <div className="av-mesa-fontes" role="group" aria-label="O que entra na transmissão">
          {computador && <div className="tr-seg cv-modo" role="radiogroup" aria-label="De onde vem a imagem">
            <button role="radio" aria-checked={comEstudio} className={comEstudio ? 'on' : ''} disabled={sim.ativa} title={sim.ativa ? 'Encerre a transmissão para trocar' : undefined} onClick={() => setModo('estudio')}>Estúdio de cenas</button>
            <button role="radio" aria-checked={!comEstudio} className={!comEstudio ? 'on' : ''} disabled={sim.ativa} title={sim.ativa ? 'Encerre a transmissão para trocar' : undefined} onClick={() => setModo('simples')}>Tela e câmera</button>
          </div>}
          {!comEstudio && <>
            {fonte('tela', 'Tela', !!tela)}
            {fonte('camera', 'Câmera', !!camera)}
            {fonte('mic', 'Microfone', !!mic)}
          </>}
        </div>
        <div className="av-mesa-acao">
          {sim.ativa
            ? <button className="av-botao-encerrar" onClick={() => pararSimulacao()}>Encerrar transmissão</button>
            : <button className="tr-botao-iniciar" onClick={comecar}><i aria-hidden />Começar transmissão</button>}
          <button className="av-link" onClick={sairDaSala}>Sair da Central</button>
        </div>
        {erro && <p className="av-erro" role="alert">{erro}</p>}
      </section>

      {sessao && <DestinoDaTransmissao sessao={sessao} noAr={sim.ativa} />}

      {!sim.ativa && (
        <ol className="tr-passos" aria-label="Como começar">
          {passos.map((p, i) => (
            <li key={p.titulo} className={p.feito ? 'feito' : ''}>
              <i aria-hidden>{p.feito ? '✓' : i + 1}</i>
              <span><b>{p.titulo}</b>{p.dica}</span>
            </li>
          ))}
        </ol>
      )}

      {comEstudio && <Suspense fallback={<section className="es es-carregando"><p>Abrindo o estúdio…</p></section>}><Estudio /></Suspense>}

      <div className="cv-numeros" role="group" aria-label="Números da transmissão">
        <div><small>Membros na sala</small><b className="cv-num">{tr.membros}</b><em>reais, sem a simulação</em></div>
        <div><small>Pico de membros</small><b className="cv-num">{central.pico}</b><em>nesta transmissão</em></div>
        <div><small>Pessoas diferentes</small><b className="cv-num">{central.pessoas.size}</b><em>passaram pela sala</em></div>
        <div><small>Para a equipe</small><b className="cv-num">{central.paraEquipe}</b><em>{naoRespondidas > 0 ? `${naoRespondidas} sem resposta` : 'todas vistas'}</em></div>
        <div><small>Público simulado</small><b className="cv-num">{sim.ativa ? fmt(sim.publicoAgora) : '—'}</b><em>o que os membros veem</em></div>
      </div>

      <div className="cv-grade">
        {controles}

        <div className="cv-centro">
          {!comEstudio && <div className="av-palco cv-palco">
            {tela && ocultarTela ? (
              <div className="av-previa-oculta">
                <b>Sua tela inteira está na transmissão</b>
                <span>A prévia fica oculta aqui para não criar o efeito espelho e deixar o computador leve. Os membros veem normalmente.</span>
                <button type="button" onClick={() => setVerPrevia(true)}>Mostrar prévia</button>
              </div>
            ) : tela ? <VideoLocal fluxo={tela} className="av-tela" /> : camera ? <VideoLocal fluxo={camera} className="av-tela av-so-camera" espelhar /> : null}
            {tela && camera && <VideoLocal fluxo={camera} className={`av-camera canto-${canto}`} espelhar />}
            {!temImagem && (
              <div className="av-espera tr-espera">
                <b>Sua imagem aparece aqui</b>
                <span>Ligue a câmera ou a tela no topo.</span>
              </div>
            )}
            <span className="tr-selo"><i aria-hidden />GF Streaming{sim.ativa && <> · {fmt(sim.publicoAgora)} na sala</>}</span>
          </div>}
          {movimento}
        </div>

        <div className="cv-direita">
          {chatDaSala}

          {naSalaCard}
        </div>
      </div>

      {sessao && <HistoricoDasTransmissoes sessao={sessao} noAr={sim.ativa} />}
    </div>
  )
}

/* ------------------------------------------- quem recebe (31/10/2026) */

/**
 * Antes de começar: transmissão de verdade (para as plataformas marcadas) ou
 * de teste, com um link privado e sem avisar ninguém. Pedido do Victor Dias:
 * "uma opção de teste que cria só um link" e "em quais plataformas eu quero
 * abrir a live: a do Victor Cordeiro, a do Naor, ou as duas".
 */
export function DestinoDaTransmissao({ sessao, noAr }: { sessao: SessaoTeeds; noAr: boolean }) {
  const tr = useTreino()
  const [plataformas, setPlataformas] = useState<Array<{ codigo: string; nome: string }>>([])
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  useEffect(() => { if (MARCA.parceiros?.length) void plataformasDaMarca(sessao).then(setPlataformas) }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const opcoes = plataformas.length ? [...plataformas.map((p) => ({ codigo: p.codigo, nome: p.nome, rota: `/${p.codigo}` })), { codigo: 'direto', nome: 'Direto', rota: 'sem parceiro' }] : []
  const todas = tr.vitrines === null
  const marcada = (c: string) => todas || tr.vitrines!.includes(c)
  const alternar = (c: string) => {
    const atual = todas ? opcoes.map((o) => o.codigo) : tr.vitrines!
    const nova = atual.includes(c) ? atual.filter((x) => x !== c) : [...atual, c]
    if (!nova.length) { setErro('Deixe pelo menos uma plataforma marcada.'); return }
    setErro(null)
    definirVitrinesDoTreino(nova.length === opcoes.length ? null : nova)
  }
  const mudarTeste = async (ligar: boolean) => { setOcupado(true); setErro(null); setErro(await trocarTeste(sessao, ligar)); setOcupado(false) }
  const link = tr.teste ? linkDoTeste(tr.teste) : ''
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link) } catch {
      const t = document.createElement('textarea'); t.value = link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove()
    }
    setCopiado(true); window.setTimeout(() => setCopiado(false), 1800)
  }
  const texto = `Transmissão de teste da ${MARCA.prosa} (só quem tem este link vê): ${link}`
  const nativo = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  return (
    <section className={`cv-destino ${tr.teste ? 'teste' : ''}`} aria-label="Quem recebe a transmissão">
      <div className="cv-destino-modo">
        <span className="cv-destino-rotulo">Quem recebe</span>
        <div className="tr-seg" role="radiogroup" aria-label="Tipo de transmissão">
          <button role="radio" aria-checked={!tr.teste} className={!tr.teste ? 'on' : ''} disabled={noAr || ocupado} onClick={() => { if (tr.teste) void mudarTeste(false) }}>De verdade</button>
          <button role="radio" aria-checked={!!tr.teste} className={tr.teste ? 'on' : ''} disabled={noAr || ocupado} onClick={() => { if (!tr.teste) void mudarTeste(true) }}>Teste com link privado</button>
        </div>
        {noAr && <small className="cv-destino-trava">Encerre a transmissão para trocar</small>}
      </div>
      {tr.teste ? (
        <div className="cv-destino-teste">
          <p><b>Ninguém é avisado.</b> Sem ponto vermelho e sem aviso de live: só quem abrir este link (com a conta) vê. Os membros na sala de sempre não recebem nada. O link vale 12 horas.</p>
          <div className="av-link-live compacto">
            <div className="av-link-live-texto"><small>Link da transmissão de teste</small><code title={link}>{link.replace(/^https?:\/\//, '')}</code></div>
            <div className="av-link-live-acoes">
              <button className={`av-botao-mini ${copiado ? 'ok' : ''}`} onClick={() => void copiar()}>{copiado ? 'Copiado' : 'Copiar'}</button>
              {nativo
                ? <button className="av-botao-whats" onClick={() => void navigator.share({ text: texto }).catch(() => undefined)}>Compartilhar</button>
                : <a className="av-botao-whats" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
            </div>
          </div>
        </div>
      ) : opcoes.length > 0 ? (
        <div className="cv-destino-plataformas">
          <span>Abre nas plataformas:</span>
          <div className="cv-plataformas" role="group" aria-label="Plataformas">
            {opcoes.map((o) => (
              <button key={o.codigo} type="button" role="checkbox" aria-checked={marcada(o.codigo)} disabled={noAr} className={marcada(o.codigo) ? 'on' : ''} onClick={() => alternar(o.codigo)}>
                <i aria-hidden>{marcada(o.codigo) ? '✓' : ''}</i>{o.nome}<small>{o.rota}</small>
              </button>
            ))}
          </div>
          <small className="cv-destino-nota">{todas ? 'Todos os membros recebem o aviso de ao vivo.' : 'Só os membros das plataformas marcadas recebem o aviso e entram na sala.'}</small>
        </div>
      ) : null}
      {erro && <p className="av-erro" role="alert">{erro}</p>}
    </section>
  )
}

/* ---------------------------------------- histórico das lives (31/10/2026) */

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const tempo = (s: number) => {
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
}

export function HistoricoDasTransmissoes({ sessao, noAr, compacto = false }: { sessao: SessaoTeeds; noAr: boolean; compacto?: boolean }) {
  const [lista, setLista] = useState<Transmissao[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [nomes, setNomes] = useState<Record<string, string>>({})
  useEffect(() => { void plataformasDaMarca(sessao).then((l) => setNomes(Object.fromEntries(l.map((p) => [p.codigo, p.nome])))) }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let vivo = true
    const ler = () => listarTransmissoes(sessao).then((l) => { if (vivo) { setLista(l); setErro(null) } }).catch(() => { if (vivo) setErro('Não consegui carregar o histórico.') })
    void ler()
    const t = window.setInterval(() => void ler(), 30_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [sessao.usuario.id, noAr]) // eslint-disable-line react-hooks/exhaustive-deps
  const plataformas = (t: Transmissao) => t.teste ? 'Teste (link privado)' : !t.vitrines ? 'Todas as plataformas' : t.vitrines.map((v) => (v === 'direto' ? 'Direto' : nomes[v] ?? `/${v}`)).join(', ')
  return (
    <section className="cv-card cv-historico" aria-labelledby="cv-hist-titulo">
      <h4 id="cv-hist-titulo">Histórico das transmissões <small>membros reais; o público simulado não entra</small></h4>
      {erro && <p className="av-erro">{erro}</p>}
      {lista && lista.length === 0 && <span className="tr-legenda">A primeira transmissão aparece aqui assim que começar: pessoas, pico, tempo médio e mensagens.</span>}
      {lista && lista.length > 0 && compacto && (
        <ul className="cv-hist-lista">
          {lista.map((t) => {
            const viva = !t.encerrada_em && Date.now() - Date.parse(t.atualizada_em) < 90_000
            const dur = Math.max(0, Math.round((Date.parse(viva ? new Date().toISOString() : (t.encerrada_em ?? t.atualizada_em)) - Date.parse(t.iniciada_em)) / 1000))
            return (
              <li key={t.id} className={aberta === t.id ? 'on' : ''}>
                <button type="button" disabled={!t.presencas.length} aria-expanded={aberta === t.id} onClick={() => setAberta(aberta === t.id ? null : t.id)}>
                  <span className="cv-hist-topo"><b>{quando(t.iniciada_em)}</b>{viva && <em className="cv-hist-vivo">No ar</em>}<small className="cv-num">{tempo(dur)}</small></span>
                  <span className="cv-hist-para">{plataformas(t)}</span>
                  <span className="cv-hist-nums">
                    <span><b className="cv-num">{t.pessoas}</b> pessoas</span><span><b className="cv-num">{t.pico}</b> pico</span>
                    <span><b className="cv-num">{t.pessoas ? tempo(t.tempo_medio_s) : '—'}</b> média</span><span><b className="cv-num">{t.mensagens}</b> msgs</span>
                  </span>
                </button>
                {aberta === t.id && <ul className="cv-hist-quem">{t.presencas.map((p) => <li key={p.id}><span>{p.nome}</span><b className="cv-num">{tempo(p.segundos)}</b></li>)}</ul>}
              </li>
            )
          })}
        </ul>
      )}
      {lista && lista.length > 0 && !compacto && (
        <div className="cv-hist-tabela">
          <table>
            <thead><tr><th>Quando</th><th>Duração</th><th>Para quem</th><th className="n">Pessoas</th><th className="n">Pico</th><th className="n">Tempo médio</th><th className="n">Mensagens</th><th aria-label="Detalhes" /></tr></thead>
            <tbody>
              {lista.map((t) => {
                const fim = t.encerrada_em ?? t.atualizada_em
                const viva = !t.encerrada_em && Date.now() - Date.parse(t.atualizada_em) < 90_000
                const dur = Math.max(0, Math.round((Date.parse(viva ? new Date().toISOString() : fim) - Date.parse(t.iniciada_em)) / 1000))
                return [
                  <tr key={t.id} className={aberta === t.id ? 'on' : ''}>
                    <td>{quando(t.iniciada_em)}{viva && <em className="cv-hist-vivo">No ar</em>}</td>
                    <td className="cv-num">{tempo(dur)}</td>
                    <td>{plataformas(t)}</td>
                    <td className="n cv-num">{t.pessoas}</td>
                    <td className="n cv-num">{t.pico}</td>
                    <td className="n cv-num">{t.pessoas ? tempo(t.tempo_medio_s) : '—'}</td>
                    <td className="n cv-num">{t.mensagens}</td>
                    <td><button type="button" className="av-link" disabled={!t.presencas.length} onClick={() => setAberta(aberta === t.id ? null : t.id)}>{aberta === t.id ? 'Fechar' : 'Quem veio'}</button></td>
                  </tr>,
                  aberta === t.id && (
                    <tr key={`${t.id}-p`} className="cv-hist-pessoas"><td colSpan={8}>
                      <ul>{t.presencas.map((p) => <li key={p.id}><span>{p.nome}</span><b className="cv-num">{tempo(p.segundos)}</b>{p.entradas > 1 && <small>entrou {p.entradas} vezes</small>}</li>)}</ul>
                    </td></tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
