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
      <p className="tr-link-nota">Só membros GF Member (e administradores) entram, com a conta deles. Eles assistem o seu ensaio como alunos, com o selo "GF Streaming" sempre na imagem.</p>
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
    { feito: temImagem, titulo: 'Ligue a câmera ou a tela', dica: 'Nos botões Tela, Câmera e Microfone, no topo. O microfone é opcional.' },
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

      <section className="cv-card">
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
      </section>
    </div>
  )

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
          {fonte('tela', 'Tela', !!tela)}
          {fonte('camera', 'Câmera', !!camera)}
          {fonte('mic', 'Microfone', !!mic)}
        </div>
        <div className="av-mesa-acao">
          {sim.ativa
            ? <button className="av-botao-encerrar" onClick={() => pararSimulacao()}>Encerrar transmissão</button>
            : <button className="tr-botao-iniciar" onClick={comecar}><i aria-hidden />Começar transmissão</button>}
          <button className="av-link" onClick={sairDaSala}>Sair da Central</button>
        </div>
        {erro && <p className="av-erro" role="alert">{erro}</p>}
      </section>

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
          <div className="av-palco cv-palco">
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
          </div>
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
        </div>

        <div className="cv-direita">
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
                  <p><b>{m.nome}{m.apresentador && <em>você</em>}{m.membro && <em className="tr-tag-membro">membro</em>}</b> {m.texto}</p>
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

          <section className="cv-card cv-na-sala" aria-label="Membros na sala">
            <h4>Na sala agora <small>{naSala.length} {naSala.length === 1 ? 'membro' : 'membros'}</small></h4>
            {naSala.length === 0
              ? <span className="tr-legenda">Ninguém ainda. Mande o link abaixo para os membros GF Member.</span>
              : <ul>{naSala.map(([n, desde]) => <li key={n}><span>{n}</span><b className="cv-num">{duracao(Date.now() - desde)}</b></li>)}</ul>}
            <LinkDoTreino compacto />
          </section>
        </div>
      </div>
    </div>
  )
}
