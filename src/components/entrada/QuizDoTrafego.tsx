/**
 * O quiz da página de tráfego pago (/n/trafego...), 16/11/2026. Regras, textos e o que é de cada parceiro
 * (nome, vídeos, WhatsApp) em core/teeds/quizDoTrafego.ts: aqui chega só a página do parceiro da visita.
 *
 * Mesmo céu, vidro e dourado do cadastro com planos (a raiz também é .cpl, para herdar as variáveis
 * e o céu do canvas). Uma etapa por vez, num painel de vidro: abertura, perguntas com as opções em
 * lista (clique, ou as teclas 1 a 4), a análise com o anel que conta até 67%, os vídeos com o botão
 * que só aparece no tempo certo do vídeo, o processando de 4 s e o aprovado. "Garantir minha vaga"
 * abre o WhatsApp do atendimento do parceiro (linkDoWhatsapp); sem número, leva para os planos
 * (aoConcluir). Prefixo das classes: qzt-.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Brand } from '../Brand'
import { AvatarDoParceiro } from '../parceiros/FiltroDeParceiros'
import { quizRapido } from '../../core/teeds/entradaInicial'
import { eventoDoPixel, eventoComServidor } from '../../core/teeds/pixelDoParceiro'
import { visitante } from '../../core/teeds/visitas'
import { rastroDoCadastro } from '../../core/teeds/rastroDoCadastro'
import { ETAPAS_DO_QUIZ, TOTAL_DO_QUIZ, progressoDaEtapa, linkDoWhatsapp, codigoDoLead, type PaginaDeTrafego, type QuizDoParceiro, type VideoDoQuiz } from '../../core/teeds/quizDoTrafego'
import { calma, useCeu } from './CadastroComPlanos'
import '../../casca/globalfly/styles/cadastro-planos.css'
import '../../casca/globalfly/styles/quiz-trafego.css'

const LETRAS = ['A', 'B', 'C', 'D']

function Seta() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5.5L15.5 10 11 14.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function Certo() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

type EstadoDoPlayer = 'carregando' | 'tocando' | 'mudo' | 'pausado' | 'fim' | 'falhou'

/**
 * O player da VSL (17/11/2026: os vídeos são nossos, MP4; antes era a vturb). Do jeito das VSLs:
 *  - começa sozinho com som (a pessoa acabou de clicar); se o navegador não deixar, começa mudo com
 *    "Seu vídeo já começou · Clique para ouvir" e o clique volta ao começo com som;
 *  - sem barra de avançar: tocar no vídeo pausa e continua; a barra de baixo anda mais rápido no começo;
 *  - o botão da etapa aparece quando o vídeo passa de `botaoAos` (ou no fim), nunca pelo relógio;
 *  - 0 (começou)/25/50/75/100% vão para a central de rastreio e para o pixel (AssistiuVSL), o mudo à parte.
 */
function PlayerDoQuiz({ video, aoLiberar, aoMarco }: { video: VideoDoQuiz; aoLiberar: () => void; aoMarco: (pct: number, mudo: boolean) => void }) {
  const ref = useRef<HTMLVideoElement>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<EstadoDoPlayer>('carregando')
  const [esperando, setEsperando] = useState(true)
  const [barra, setBarra] = useState(0)
  const liberar = useRef(aoLiberar)
  liberar.current = aoLiberar
  const marco = useRef(aoMarco)
  marco.current = aoMarco

  useEffect(() => {
    const v = ref.current
    if (!v) return
    let feito = false
    let vivo = true
    const marcos = new Set<string>()
    const alvo = quizRapido ? 5 : video.botaoAos
    const soltar = () => { if (!feito) { feito = true; liberar.current() } }
    const aoTempo = () => {
      const d = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : video.duracao
      const p = Math.min(1, v.currentTime / d)
      setBarra(1 - (1 - p) ** 2)
      if (!v.muted && v.currentTime >= alvo) soltar()
      // 17/11/2026: o mudo também conta (separado: o clique para ouvir volta ao começo e conta de novo, com som)
      const mudo = v.muted
      for (const m of [0, 25, 50, 75]) {
        const chave = `${mudo ? 'm' : 's'}${m}`
        if ((m === 0 ? v.currentTime > 0.5 : p * 100 >= m) && !marcos.has(chave)) { marcos.add(chave); marco.current(m, mudo) }
      }
    }
    const aoFim = () => { setEstado('fim'); setBarra(1); if (!marcos.has('s100')) { marcos.add('s100'); marco.current(100, false) } soltar() }
    const aoEsperar = () => setEsperando(true)
    const aoTocar = () => setEsperando(false)
    const aoErro = () => setEstado('falhou')
    // Sem pular: a tela cheia do iPhone é o player da Apple, com barra de arrastar. Quem tenta
    // avançar volta para o ponto mais longe que já assistiu (voltar para trás pode).
    let assistido = 0
    const aoAndar = () => { if (!v.seeking && v.currentTime > assistido && v.currentTime - assistido < 2) assistido = v.currentTime }
    const aoPular = () => { if (v.currentTime > assistido + 1.5) v.currentTime = assistido }
    // O iPhone pausa sozinho (troca de app, tela bloqueada, sair da tela cheia): a tela acompanha,
    // para um toque só bastar para continuar.
    const aoPausar = () => { if (vivo && !v.ended && v.readyState > 0) setEstado((e) => (e === 'tocando' || e === 'mudo' ? 'pausado' : e)) }
    const aoVoltar = () => { if (vivo) setEstado(v.muted ? 'mudo' : 'tocando') }
    v.addEventListener('timeupdate', aoAndar)
    v.addEventListener('seeking', aoPular)
    v.addEventListener('pause', aoPausar)
    v.addEventListener('play', aoVoltar)
    v.addEventListener('timeupdate', aoTempo)
    v.addEventListener('ended', aoFim)
    v.addEventListener('waiting', aoEsperar)
    v.addEventListener('playing', aoTocar)
    v.addEventListener('canplay', aoTocar)
    v.addEventListener('error', aoErro)
    v.muted = false
    v.play().then(() => { if (vivo) setEstado('tocando') }).catch(() => {
      if (!vivo) return
      v.muted = true
      v.play().then(() => { if (vivo) setEstado('mudo') }).catch(() => { if (vivo) { setEstado('pausado'); setEsperando(false) } })
    })
    return () => {
      vivo = false
      v.removeEventListener('timeupdate', aoAndar)
      v.removeEventListener('seeking', aoPular)
      v.removeEventListener('pause', aoPausar)
      v.removeEventListener('play', aoVoltar)
      v.removeEventListener('timeupdate', aoTempo)
      v.removeEventListener('ended', aoFim)
      v.removeEventListener('waiting', aoEsperar)
      v.removeEventListener('playing', aoTocar)
      v.removeEventListener('canplay', aoTocar)
      v.removeEventListener('error', aoErro)
      v.pause()
    }
  }, [video.src, video.botaoAos, video.duracao])

  const tocar = () => {
    const v = ref.current
    if (!v) return
    if (estado === 'falhou') { setEstado('carregando'); setEsperando(true); v.load(); void v.play().then(() => setEstado('tocando')).catch(() => setEstado('pausado')); return }
    if (estado === 'mudo' || estado === 'fim') { v.currentTime = 0; setBarra(0) }
    if (estado === 'tocando' && !v.paused) { v.pause(); setEstado('pausado'); return }
    v.muted = false
    void v.play().then(() => setEstado('tocando')).catch(() => setEstado('pausado'))
  }
  const telaCheia = (e: React.MouseEvent) => {
    e.stopPropagation()
    const v = ref.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null
    const c = caixa.current
    if (!v || !c) return
    if (document.fullscreenElement) { void document.exitFullscreen(); return }
    if (c.requestFullscreen) void c.requestFullscreen().catch(() => v.webkitEnterFullscreen?.())
    else v.webkitEnterFullscreen?.()
  }

  const rotulo = estado === 'tocando' ? 'Pausar o vídeo' : estado === 'mudo' ? 'Ouvir o vídeo do começo' : estado === 'fim' ? 'Assistir de novo' : 'Assistir ao vídeo'
  return (
    <div className="qzt-video" data-estado={estado} ref={caixa}>
      <video ref={ref} src={video.src} poster={video.capa} playsInline preload="auto" disablePictureInPicture
        controlsList="nodownload noplaybackrate noremoteplayback" onContextMenu={(e) => e.preventDefault()} />
      <button type="button" className="qzt-video-toque" onClick={tocar} aria-label={rotulo}>
        {estado === 'mudo' && (
          <span className="qzt-video-som">
            <b>Seu vídeo já começou</b>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" /><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <span>Clique para ouvir</span>
          </span>
        )}
        {(estado === 'pausado' || estado === 'fim') && (
          <span className="qzt-video-play">
            <i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5z" fill="currentColor" /></svg></i>
            <span>{estado === 'fim' ? 'Assistir de novo' : barra > 0 ? 'Continuar assistindo' : 'Assistir ao vídeo'}</span>
          </span>
        )}
        {estado === 'falhou' && <span className="qzt-video-play"><span>Não foi possível carregar o vídeo.</span><span className="qzt-btn qzt-btn-linha">Tentar novamente</span></span>}
        {esperando && (estado === 'carregando' || estado === 'tocando' || estado === 'mudo') && <i className="qzt-girando qzt-video-girando" aria-hidden="true" />}
      </button>
      <button type="button" className="qzt-video-cheia" onClick={telaCheia} aria-label="Tela cheia">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="qzt-video-barra" aria-hidden="true"><i style={{ transform: `scaleX(${barra})` }} /></div>
    </div>
  )
}

/**
 * `semRegistro`: quem já tem conta e abriu o /trafego logado (a equipe revisando) faz o quiz sem
 * entrar na central de rastreio nem no pixel, para não sujar o funil dos anúncios.
 */
export function QuizDoTrafego({ pagina, aoConcluir, semRegistro = false }: { pagina: PaginaDeTrafego & { quiz: QuizDoParceiro }; aoConcluir: () => void; semRegistro?: boolean }) {
  const { videos } = pagina.quiz
  const rastro: typeof rastroDoCadastro = semRegistro ? () => undefined : rastroDoCadastro
  const pixel: typeof eventoDoPixel = semRegistro ? () => undefined : eventoDoPixel
  const pixelComServidor: typeof eventoComServidor = semRegistro ? () => undefined : eventoComServidor
  const [etapa, setEtapa] = useState(0)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [botaoDoVideo, setBotaoDoVideo] = useState(false)
  const [contagem, setContagem] = useState(0)
  const [verificar, setVerificar] = useState(false)
  const respostas = useRef<Record<number, string>>({})
  const raiz = useRef<HTMLDivElement>(null)
  const titulo = useRef<HTMLHeadingElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const ceuAtivo = useRef(true)
  useCeu(canvas, ceuAtivo)
  const atual = ETAPAS_DO_QUIZ[etapa]

  const irPara = useCallback((n: number) => {
    setEscolhida(null); setBotaoDoVideo(false); setVerificar(false)
    setEtapa(Math.max(0, Math.min(TOTAL_DO_QUIZ, n)))
  }, [])

  // ---------- rastreio: a chegada (como a página de planos faz) e a saída no meio do caminho
  useEffect(() => {
    let nova = true
    try { nova = !sessionStorage.getItem('gf.rastro.sessao'); sessionStorage.setItem('gf.rastro.sessao', '1') } catch { /* sem armazenamento */ }
    rastro(nova ? 'entrada' : 'pagina', { quiz: true })
    pixel('ViewContent', { content_name: 'quiz-abertura' }, true)
  }, [])
  const etapaAgora = useRef(0)
  etapaAgora.current = etapa
  useEffect(() => {
    const inicio = Date.now()
    let foi = false
    const aoSair = () => {
      if (foi) return
      foi = true
      rastro('saiu', { segundos: Math.round((Date.now() - inicio) / 1000), etapa: etapaAgora.current, quiz: true })
    }
    addEventListener('pagehide', aoSair)
    return () => removeEventListener('pagehide', aoSair)
  }, [])

  // ---------- cada etapa: topo da página, foco no título, medida
  useEffect(() => {
    scrollTo({ top: 0, behavior: 'auto' })
    if (etapa > 0) titulo.current?.focus({ preventScroll: true })
    if (etapa === 0) return
    pixel('ViewContent', { content_name: `quiz-etapa-${etapa}` }, true)
    if (atual?.tipo === 'video') rastro('quiz-video', { etapa, video: atual.video + 1 })
    if (atual?.tipo === 'aprovado') { rastro('quiz-aprovado', { etapa }); pixel('QuizAprovado', undefined, true) }
  }, [etapa]) // eslint-disable-line react-hooks/exhaustive-deps

  // a análise conta até 67%
  useEffect(() => {
    if (atual?.tipo !== 'analise') return
    if (calma()) { setContagem(67); return }
    setContagem(0)
    const t0 = performance.now()
    let q = 0
    const passo = (t: number) => {
      const u = Math.min(1, (t - t0) / 1600)
      setContagem(Math.round(67 * (1 - (1 - u) ** 3)))
      if (u < 1) q = requestAnimationFrame(passo)
    }
    q = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(q)
  }, [atual?.tipo])

  // o processando: a barra enche em 4 s e o botão aparece logo depois (como no original)
  useEffect(() => {
    if (atual?.tipo !== 'processando') return
    const t = window.setTimeout(() => setVerificar(true), 4100)
    return () => window.clearTimeout(t)
  }, [atual?.tipo])

  // o player original chamava nextStep() pelo botão de dentro do vídeo: continua valendo
  useEffect(() => {
    const w = window as unknown as { nextStep?: () => void }
    w.nextStep = () => { if (etapaAgora.current < TOTAL_DO_QUIZ) irPara(etapaAgora.current + 1) }
    return () => { delete w.nextStep }
  }, [irPara])

  // o quanto assistiu de cada vídeo: na central e no pixel (17/11/2026: públicos de "viu 75% da VSL" no Meta).
  // 0 = começou a tocar; `mudo` separa quem viu sem som (o clique para ouvir volta ao começo e conta de novo)
  const marcoDoVideo = (video: number, pct: number, mudo: boolean) => {
    rastro('quiz-video-progresso', { etapa, video, pct, ...(mudo ? { mudo: true } : {}) })
    pixel('AssistiuVSL', { video, percentual: pct, mudo }, true)
    if (!mudo && pct === 75) pixel(`AssistiuVSL${video}_75`, undefined, true)
  }
  const comecar = () => {
    rastro('quiz-comecou')
    pixel('QuizComecou', undefined, true)
    irPara(1)
  }
  const responder = (opcao: string) => {
    if (escolhida || atual?.tipo !== 'pergunta') return
    setEscolhida(opcao)
    respostas.current[etapa] = opcao
    const pergunta = atual.pergunta.replace('%%', atual.destaque ?? '')
    rastro('quiz-resposta', { etapa, pergunta, resposta: opcao })
    pixel('QuizResposta', { etapa, resposta: opcao })
    window.setTimeout(() => irPara(etapa + 1), calma() ? 0 : 320)
  }
  const [codigo] = useState(() => codigoDoLead(visitante()))
  const whatsapp = linkDoWhatsapp(pagina, codigo)
  const concluir = () => {
    rastro('quiz-concluiu', { respostas: respostas.current, ...(whatsapp ? { destino: 'whatsapp', codigo } : {}) })
    pixel('QuizConcluido', undefined, true)
    // o WhatsApp abre pelo próprio link (toque de verdade: celular e navegador do Instagram abrem o app)
    // o Contact vai também pelo servidor (bloqueador e iPhone perdem o do navegador); é o evento de otimizar
    if (whatsapp) pixelComServidor('Contact', { canal: 'whatsapp' })
    else aoConcluir()
  }

  // teclas 1 a 4 (ou A a D) respondem a pergunta
  useEffect(() => {
    if (atual?.tipo !== 'pergunta') return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toUpperCase()
      const i = /^[1-4]$/.test(k) ? Number(k) - 1 : LETRAS.indexOf(k)
      if (i >= 0 && i < atual.opcoes.length) { e.preventDefault(); responder(atual.opcoes[i]) }
    }
    addEventListener('keydown', aoTeclar)
    return () => removeEventListener('keydown', aoTeclar)
  }) // a cada render: responder lê a etapa atual

  const progresso = etapa === 0 ? 0 : progressoDaEtapa(etapa)
  const largo = atual?.tipo === 'video' || atual?.tipo === 'aprovado'

  return (
    <div className={`cpl qzt ${largo ? 'qzt-largo' : ''}`} ref={raiz} data-etapa={etapa}>
      <canvas className="cpl-ceu" ref={canvas} aria-hidden="true" />
      <div className="cpl-ambiente" aria-hidden="true" />

      <header className="qzt-topo cpl-faixa">
        <div className="qzt-topo-miolo">
          <div className="cpl-marca"><Brand tamanho={36} /></div>
          {etapa > 0 && <span className="qzt-contador" aria-hidden="true">{Math.min(etapa, TOTAL_DO_QUIZ)}<i>/{TOTAL_DO_QUIZ}</i></span>}
        </div>
        <div className="qzt-barra" role="progressbar" aria-label="Progresso do teste" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progresso}>
          <span style={{ transform: `scaleX(${progresso / 100})` }} />
        </div>
      </header>

      <main className="qzt-palco cpl-faixa">
        {etapa === 0 && (
          <section className="qzt-painel qzt-abertura" key="abertura">
            <div className="qzt-socio">
              <AvatarDoParceiro codigo={pagina.codigo} nome={pagina.nome} tamanho={52} />
              <div><b>{pagina.nome}</b><span>Seu futuro sócio</span></div>
            </div>
            <h1>
              <em>Você pode lucrar de R$&nbsp;100 a R$&nbsp;7.000 por mês</em>{' '}
              <span>começando do zero e sem experiência</span>
            </h1>
            <p className="qzt-sub">E o melhor: você será meu sócio. Quanto mais você ganha, mais eu ganho também.</p>
            <p className="qzt-desc">Responda um quiz rápido para descobrir se está apto a essa sociedade. Leva menos de 1 minuto. Vamos lá!</p>
            <button type="button" className="qzt-btn qzt-btn-ouro qzt-grande" onClick={comecar}>Começar o teste <Seta /></button>
          </section>
        )}

        {atual?.tipo === 'pergunta' && (
          <section className="qzt-painel" key={etapa}>
            <p className="qzt-olho">Pergunta {Object.entries(ETAPAS_DO_QUIZ).filter(([n, e]) => e.tipo === 'pergunta' && Number(n) <= etapa).length}</p>
            <h2 ref={titulo} tabIndex={-1}>
              {atual.destaque
                ? <>{atual.pergunta.split('%%')[0]}<em>{atual.destaque}</em>{atual.pergunta.split('%%')[1]}</>
                : atual.pergunta}
            </h2>
            <div className="qzt-opcoes" role="list">
              {atual.opcoes.map((o, i) => (
                <button key={o} type="button" role="listitem" className={`qzt-opcao ${escolhida === o ? 'qzt-escolhida' : ''} ${escolhida && escolhida !== o ? 'qzt-apagada' : ''}`}
                  style={{ animationDelay: `${0.05 + i * 0.05}s` }} onClick={() => responder(o)} aria-pressed={escolhida === o}>
                  <kbd aria-hidden="true">{escolhida === o ? <Certo /> : LETRAS[i]}</kbd>
                  <span>{o}</span>
                  <Seta />
                </button>
              ))}
            </div>
          </section>
        )}

        {atual?.tipo === 'analise' && (
          <section className="qzt-painel qzt-centro" key={etapa}>
            <h2 ref={titulo} tabIndex={-1}>{contagem < 67 ? 'Analisando seu perfil...' : 'Perfil analisado'}</h2>
            <div className="qzt-anel" style={{ ['--qzt-p' as string]: contagem / 100 }} aria-hidden="true">
              <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" className="qzt-anel-fundo" /><circle cx="60" cy="60" r="52" className="qzt-anel-cheio" pathLength={1} /></svg>
              <b>{contagem}<i>%</i></b>
            </div>
            <p className="qzt-forte">Seu perfil é <b className="qzt-verde">67% compatível.</b></p>
            <p className="qzt-desc">Mas antes de conhecer o projeto que pode mudar sua realidade, te farei as últimas perguntas...</p>
            <button type="button" className="qzt-btn qzt-btn-ouro" disabled={contagem < 67} onClick={() => irPara(etapa + 1)}>Continuar <Seta /></button>
          </section>
        )}

        {atual?.tipo === 'video' && (
          <section className="qzt-painel qzt-centro qzt-com-video" key={etapa}>
            <p className="qzt-olho">Vídeo {atual.video + 1} de 3</p>
            <h2 ref={titulo} tabIndex={-1}>{atual.titulo}</h2>
            <PlayerDoQuiz key={etapa} video={videos[atual.video]} aoMarco={(pct, mudo) => marcoDoVideo(atual.video + 1, pct, mudo)}
              aoLiberar={() => { setBotaoDoVideo(true); rastro('quiz-video-botao', { etapa, video: atual.video + 1 }) }} />
            <div className={`qzt-depois ${botaoDoVideo ? 'qzt-visivel' : ''}`} aria-hidden={!botaoDoVideo}>
              <button type="button" className="qzt-btn qzt-btn-ouro qzt-grande" tabIndex={botaoDoVideo ? 0 : -1} onClick={() => irPara(etapa + 1)}>Continuar <Seta /></button>
            </div>
          </section>
        )}

        {atual?.tipo === 'processando' && (
          <section className="qzt-painel qzt-centro" key={etapa}>
            <div className="qzt-carregando" aria-hidden="true"><span /></div>
            <h2 ref={titulo} tabIndex={-1} className="qzt-pulsa">Processando <span className="qzt-branco">suas respostas...</span></h2>
            <p className="qzt-desc">Em instantes você vai descobrir se foi <em className="qzt-brilho">um dos selecionados.</em></p>
            <div className={`qzt-depois ${verificar ? 'qzt-visivel' : ''}`} aria-hidden={!verificar}>
              <button type="button" className="qzt-btn qzt-btn-ouro qzt-grande" tabIndex={verificar ? 0 : -1} onClick={() => irPara(etapa + 1)}>Verificar se fui aprovado... <Seta /></button>
            </div>
          </section>
        )}

        {atual?.tipo === 'aprovado' && (
          <section className="qzt-painel qzt-centro qzt-com-video qzt-aprovado" key={etapa}>
            <div className="qzt-faiscas" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>
            <div className="qzt-selo-aprovado"><Certo /> Aprovado</div>
            <h2 ref={titulo} tabIndex={-1}>Parabéns! Seu perfil é <b className="qzt-verde">89% compatível.</b></h2>
            <p className="qzt-forte">Você foi selecionado para se tornar um dos meus sócios.</p>
            <p className="qzt-desc">Assista ao vídeo abaixo para entender os últimos detalhes da nossa parceria.</p>
            <PlayerDoQuiz key={etapa} video={videos[2]} aoMarco={(pct, mudo) => marcoDoVideo(3, pct, mudo)}
              aoLiberar={() => { setBotaoDoVideo(true); rastro('quiz-video-botao', { etapa, video: 3 }) }} />
            <div className={`qzt-depois ${botaoDoVideo ? 'qzt-visivel' : ''}`} aria-hidden={!botaoDoVideo}>
              {whatsapp
                ? <a className="qzt-btn qzt-btn-verde qzt-grande qzt-vaga" href={whatsapp} target="_blank" rel="noopener noreferrer" tabIndex={botaoDoVideo ? 0 : -1} onClick={concluir}>Garantir minha vaga <Seta /></a>
                : <button type="button" className="qzt-btn qzt-btn-verde qzt-grande qzt-vaga" tabIndex={botaoDoVideo ? 0 : -1} onClick={concluir}>Garantir minha vaga <Seta /></button>}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
