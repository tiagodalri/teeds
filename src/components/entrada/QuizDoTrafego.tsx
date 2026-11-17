/**
 * O quiz da página de tráfego pago (/n/trafego), 16/11/2026. Regras e textos em core/teeds/quizDoTrafego.ts.
 *
 * Mesmo céu, vidro e dourado do cadastro com planos (a raiz também é .cpl, para herdar as variáveis
 * e o céu do canvas). Uma etapa por vez, num painel de vidro: abertura, perguntas com as opções em
 * lista (clique, ou as teclas 1 a 4), a análise com o anel que conta até 67%, os vídeos com o botão
 * que só aparece no tempo certo do vídeo, o processando de 4 s e o aprovado. "Garantir minha vaga"
 * leva para os planos (aoConcluir). Prefixo das classes: qzt-.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { Brand } from '../Brand'
import { AvatarDoParceiro } from '../parceiros/FiltroDeParceiros'
import { vitrine } from '../../core/teeds/parceiro'
import { quizRapido } from '../../core/teeds/entradaInicial'
import { eventoDoPixel } from '../../core/teeds/pixelDoParceiro'
import { rastroDoCadastro } from '../../core/teeds/rastroDoCadastro'
import { ETAPAS_DO_QUIZ, TOTAL_DO_QUIZ, progressoDaEtapa, type VideoDoQuiz } from '../../core/teeds/quizDoTrafego'
import { calma, useCeu } from './CadastroComPlanos'
import '../../casca/globalfly/styles/cadastro-planos.css'
import '../../casca/globalfly/styles/quiz-trafego.css'

const NOMES: Record<string, string> = { n: 'Naor Bezerra', v: 'Victor Cordeiro', d: 'Douglas' }
const LETRAS = ['A', 'B', 'C', 'D']

function Seta() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11M11 5.5L15.5 10 11 14.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function Certo() {
  return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.5 10.5l3.5 3.5 7.5-8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

type InstanciaDaVturb = { instance?: { __originalId?: string; pause?: () => void } | HTMLElement & { __originalId?: string; pause?: () => void }; video?: { currentTime?: number } }

/**
 * O player da vturb e o tempo assistido. O botão aparece quando o vídeo passa de `botaoAos` segundos
 * (lido do próprio <video> do player); se o player não deixar ler o tempo, conta o tempo com a página
 * aberta nesta etapa. Os botões que o player traz por dentro ficam escondidos: quem conduz é o nosso.
 */
function VideoDaVturb({ video, aoLiberar }: { video: VideoDoQuiz; aoLiberar: () => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'falhou'>('carregando')
  const [tentativa, setTentativa] = useState(0)
  const liberar = useRef(aoLiberar)
  liberar.current = aoLiberar

  useEffect(() => {
    const c = caixa.current
    if (!c) return
    setEstado('carregando')
    const player = document.createElement('vturb-smartplayer')
    player.id = `vid-${video.id}`
    player.setAttribute('style', 'display:block;margin:0 auto;width:100%')
    c.replaceChildren(player)
    const script = document.createElement('script')
    script.src = `https://scripts.converteai.net/${video.conta}/players/${video.id}/v4/player.js`
    script.async = true
    script.onload = () => setEstado('pronto')
    script.onerror = () => setEstado('falhou')
    document.head.appendChild(script)

    const alvo = quizRapido ? 5 : video.botaoAos
    let feito = false, aberto = 0, ultimo = performance.now()
    // o <video> fica numa sombra fechada; o tempo vem da lista de players da vturb (window.smartplayer)
    const daVturb = () => (window as unknown as { smartplayer?: { instances?: InstanciaDaVturb[] } }).smartplayer?.instances
      ?.find((i) => i.instance === player || i.instance?.__originalId === player.id)
    const tempoDoVideo = (): number | null => {
      const t = daVturb()?.video?.currentTime
      return typeof t === 'number' && Number.isFinite(t) ? t : null
    }
    const relogio = window.setInterval(() => {
      const agora = performance.now()
      if (!document.hidden) aberto += (agora - ultimo) / 1000
      ultimo = agora
      const t = tempoDoVideo()
      // com o tempo do vídeo, vale o vídeo; sem ele (player fechado), o tempo de página aberta
      if (!feito && ((t != null && t >= alvo) || (t == null && aberto >= alvo) || (quizRapido && aberto >= alvo))) {
        feito = true
        liberar.current()
      }
    }, 500)
    // tirar o player da página não para o som: pausa antes
    return () => { window.clearInterval(relogio); try { daVturb()?.instance?.pause?.() } catch { /* já saiu */ } script.remove(); c.replaceChildren() }
  }, [video.conta, video.id, tentativa])

  return (
    <div className="qzt-video" data-estado={estado}>
      <div className="qzt-video-player" ref={caixa} />
      {estado !== 'pronto' && (
        <div className="qzt-video-capa" role="status">
          {estado === 'falhou'
            ? <><span>Não foi possível carregar o vídeo.</span><button type="button" className="qzt-btn qzt-btn-linha" onClick={() => setTentativa((n) => n + 1)}>Tentar novamente</button></>
            : <><i className="qzt-girando" aria-hidden="true" /><span>Carregando vídeo...</span></>}
        </div>
      )}
    </div>
  )
}

/**
 * `semRegistro`: quem já tem conta e abriu o /trafego logado (a equipe revisando) faz o quiz sem
 * entrar na central de rastreio nem no pixel, para não sujar o funil dos anúncios.
 */
export function QuizDoTrafego({ videos, aoConcluir, semRegistro = false }: { videos: readonly [VideoDoQuiz, VideoDoQuiz, VideoDoQuiz]; aoConcluir: () => void; semRegistro?: boolean }) {
  const rastro: typeof rastroDoCadastro = semRegistro ? () => undefined : rastroDoCadastro
  const pixel: typeof eventoDoPixel = semRegistro ? () => undefined : eventoDoPixel
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
  const parceiro = vitrine()
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
  const concluir = () => {
    rastro('quiz-concluiu', { respostas: respostas.current })
    pixel('QuizConcluido', undefined, true)
    aoConcluir()
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
            {parceiro && NOMES[parceiro] && (
              <div className="qzt-socio">
                <AvatarDoParceiro codigo={parceiro} nome={NOMES[parceiro]} tamanho={52} />
                <div><b>{NOMES[parceiro]}</b><span>Seu futuro sócio</span></div>
              </div>
            )}
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
            <VideoDaVturb video={videos[atual.video]} aoLiberar={() => { setBotaoDoVideo(true); rastro('quiz-video-botao', { etapa, video: atual.video + 1 }) }} />
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
            <VideoDaVturb video={videos[2]} aoLiberar={() => { setBotaoDoVideo(true); rastro('quiz-video-botao', { etapa, video: 3 }) }} />
            <div className={`qzt-depois ${botaoDoVideo ? 'qzt-visivel' : ''}`} aria-hidden={!botaoDoVideo}>
              <button type="button" className="qzt-btn qzt-btn-ouro qzt-grande qzt-vaga" tabIndex={botaoDoVideo ? 0 : -1} onClick={concluir}>Garantir minha vaga <Seta /></button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
