import { useEffect, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import type { ActiveSymbol, ConnectionState } from '../core/deriv/types'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { identidade } from '../core/deriv/branding'
import type { SessaoTeeds } from '../core/teeds/conta'
import { perguntar, trocarChaveDaIA, type Extras, type Proposta, type Turno } from '../core/teeds/chat'
import { acompanharVivas, pararNoServidor, sessoesVivas, type SessaoViva } from '../core/teeds/servidorRobos'
import { ChatProposta } from './ChatProposta'
import { LocalRobotPanel } from './LocalRobotPanel'
import { MARCA } from '../marca'
import { RespostaFormatada } from './assistente/RespostaFormatada'
import { MAX_IMAGENS, TETO_ENVIO, imagemPronta, paraBase64, quadrosDoVideo, relogio, useGravador, type Gravacao } from './assistente/midia'
import './assistente/assistente.css'
import { nomeDaEstrategia } from '../core/deriv/branding'

/**
 * O assistente da Teeds — uma aba inteira, não uma gaveta.
 *
 * Aqui a pessoa tira dúvida e opera conversando, e as duas coisas pedem
 * espaço. Uma conversa espremida numa tira de 400 pixels ensina a escrever
 * pouco.
 *
 * A conversa vive só enquanto a página estiver aberta. Trocar de aba e
 * voltar mantém tudo; recarregar limpa. Nada é guardado em servidor nenhum.
 */

const din = (v: number, moeda = 'USD') =>
  `${moeda} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Sugestões — e duas delas nem chegam à IA.
 *
 * "Como estão meus robôs?" e "Parar tudo" são botões disfarçados de frase.
 * Mandá-las para um modelo de linguagem seria pagar para ele descobrir qual
 * ferramenta chamar quando a gente já sabe. Elas falam direto com o
 * servidor: resposta instantânea e custo zero.
 *
 * As outras duas vão para a IA, porque exigem entender o que foi escrito.
 */
type Sugestao = { texto: string; atalho?: 'robos' | 'parar' }
// Os exemplos usam os robôs que ESTA marca oferece (a OMNI não tem o superior5).
const [PRIMEIRO, SEGUNDO] = MARCA.robos
const SUGESTOES: Sugestao[] = [
  { texto: 'Como estão meus robôs?', atalho: 'robos' },
  ...(PRIMEIRO && SEGUNDO ? [{ texto: `Qual a diferença entre o ${nomeDaEstrategia(PRIMEIRO)} e o ${nomeDaEstrategia(SEGUNDO)}?` }] : []),
  ...(PRIMEIRO ? [{ texto: `Ligar o ${nomeDaEstrategia(PRIMEIRO)} com 1 dólar na demo` }] : []),
  { texto: 'Parar tudo', atalho: 'parar' },
]

/** O que aparece no balão de quem pergunta, além do texto (19/11/2026). */
export type AnexoDoBalao =
  | { tipo: 'audio'; url: string; duracao: number; ondas: number[] }
  | { tipo: 'imagens'; urls: string[] }
  | { tipo: 'video'; url: string; capa: string; duracao: number }

export type ItemDoAssistente =
  | { tipo: 'cliente'; texto: string; anexo?: AnexoDoBalao; ouvindo?: boolean }
  | { tipo: 'assistente'; texto: string; novo?: boolean }
  | { tipo: 'proposta'; proposta: Proposta }
  | { tipo: 'robo'; sessaoId: string; config: ConfigEstrategia; roboId: string; contaId: string; demo: boolean; moeda: string }
type Item = ItemDoAssistente

interface Props {
  sessao: SessaoTeeds
  socket: TeedsSocket | null
  symbols: ActiveSymbol[]
  symbolPadrao: string | null
  conexao: ConnectionState
  /** Rótulos trocados (exercícios internos): só a tela troca demo e real. */
  rotulosTrocados?: boolean
  /** Acesso de demonstração: a conta virtual se apresenta como real. */
  demoComoReal?: boolean
  /** Administração: vê o motivo quando a Anthropic recusa e pode trocar a chave (o servidor só aceita do admin geral). */
  administracao?: boolean
  /** Só o laboratório: a conversa já começa com estes itens (fotos da tela). */
  inicial?: ItemDoAssistente[]
  /** A conta aberta no topo agora: "liga na minha conta" é ela. */
  contaAtual?: string
}

/** Foto ou vídeo escolhido, esperando o envio (aparece em miniatura dentro da caixa). */
type Pendente = { id: number; tipo: 'imagem' | 'video'; arquivo: File; url: string; capa?: string; duracao?: number }

export function AssistentePanel({ sessao, socket, symbols, symbolPadrao, conexao, rotulosTrocados = false, demoComoReal = false, administracao = false, inicial, contaAtual }: Props) {
  // a Anthropic recusou (sem crédito, conta sem verificação, chave errada): o motivo e o campo da chave nova
  const [falhaDaIA, setFalhaDaIA] = useState<string | null>(null)
  const [chaveNova, setChaveNova] = useState('')
  const [trocando, setTrocando] = useState<{ indo?: boolean; erro?: string; ok?: boolean }>({})
  // 19/11/2026 (Tiago: "remova esse recado"): respondendo pelo Gemini não aparece aviso nenhum
  const [abrirChave, setAbrirChave] = useState(false)
  async function guardarChave() {
    setTrocando({ indo: true })
    try { await trocarChaveDaIA(sessao, chaveNova.trim()) }
    catch (e) { setTrocando({ erro: (e as Error).message }); return }
    setChaveNova(''); setFalhaDaIA(null); setAbrirChave(false); setTrocando({ ok: true })
  }
  const [itens, setItens] = useState<Item[]>(inicial ?? [])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [uso, setUso] = useState<{ hoje: number; teto: number } | null>(null)
  const [vivas, setVivas] = useState<SessaoViva[]>([])
  const [copiado, setCopiado] = useState<number | null>(null)
  // "Parar tudo" desliga as sessões de todas as contas: pergunta antes (29/10/2026)
  const [confirmarParar, setConfirmarParar] = useState(false)
  const fim = useRef<HTMLDivElement | null>(null)
  const campo = useRef<HTMLTextAreaElement | null>(null)
  const seletor = useRef<HTMLInputElement | null>(null)
  const [pendentes, setPendentes] = useState<Pendente[]>([])
  const [arrastando, setArrastando] = useState(false)
  // o que está sendo esperado, para a frase do "pensando" ("Ouvindo o áudio", "Olhando a imagem")
  const [esperando, setEsperando] = useState<'texto' | 'audio' | 'imagem' | 'video'>('texto')
  const gravador = useGravador(() => void enviarAudio())

  /* O assistente sabe o que está acontecendo sem ninguém perguntar. */
  useEffect(() => acompanharVivas(sessao, setVivas), [sessao.token])

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [itens, pensando])

  /*
    A caixa cresce com o que se escreve, e para de crescer numa altura sensata.
    19/11/2026 (Tiago: "feio e torto"): o Assistente nasce montado e ESCONDIDO quando a pessoa está em
    outra aba; medida escondida, a altura virava 0 e a caixa ficava com a frase caída e barra de rolagem.
    Agora o navegador ajusta sozinho (field-sizing: content) onde sabe; onde não sabe, a conta só roda
    com a caixa visível e é refeita quando ela aparece ou muda de largura.
  */
  const ajustaSozinha = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content')
  function medirCampo() {
    const el = campo.current
    if (!el || !el.offsetParent) return
    if (!ajustaSozinha) {
      el.style.height = 'auto'
      el.style.height = `${Math.min(el.scrollHeight, 168)}px`
    }
    el.classList.toggle('cheia', el.scrollHeight > 170)
  }
  useEffect(medirCampo, [texto])
  useEffect(() => {
    const el = campo.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const o = new ResizeObserver(() => medirCampo())
    o.observe(el.parentElement ?? el)
    return () => o.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const responder = (texto: string) => setItens((a) => [...a, { tipo: 'assistente', texto, novo: true }])

  /** Os atalhos: falam com o servidor direto, sem passar por modelo nenhum. */
  async function atalho(qual: 'robos' | 'parar', rotulo: string) {
    setItens((a) => [...a, { tipo: 'cliente', texto: rotulo }])
    setErro(null)
    try {
      const lista = await sessoesVivas(sessao)
      if (qual === 'robos') {
        if (!lista.length) return responder('Nenhum robô seu está operando agora.')
        const total = lista.reduce((s, v) => s + (v.estado?.resultado ?? 0), 0)
        const linhas = lista.map((v) => {
          const e = v.estado
          return `• ${v.roboNome} — ${e?.operacoes ?? 0} operações, ${din(e?.resultado ?? 0, v.moeda)}` +
            `${(rotulosTrocados ? !v.demo : v.demo && !demoComoReal) ? ' (demonstração)' : ''}`
        })
        return responder(
          `${lista.length === 1 ? 'Um robô operando' : `${lista.length} robôs operando`}, ` +
          `somando ${din(total, lista[0].moeda)}:\n${linhas.join('\n')}`)
      }
      if (!lista.length) return responder('Não há robô nenhum para desligar.')
      await Promise.all(lista.map((v) => pararNoServidor(sessao, v.id).catch(() => null)))
      responder(
        `Desliguei ${lista.length === 1 ? 'o robô' : `os ${lista.length} robôs`}. ` +
        'Uma operação que já estava aberta ainda vai liquidar.')
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  const extrasDaTela = (): Extras => ({ ...(contaAtual ? { contaAtual } : {}), ...(rotulosTrocados ? { trocados: true } : {}) })

  /** Só o texto vai no histórico: cartão, painel e anexos são coisas desta tela. */
  function historicoEmTexto(): Turno[] {
    return itens
      .filter((i): i is Extract<Item, { tipo: 'cliente' | 'assistente' }> => i.tipo === 'cliente' || i.tipo === 'assistente')
      .map((i) => ({
        papel: i.tipo,
        texto: i.tipo === 'cliente' && i.anexo
          ? `${i.anexo.tipo === 'audio' ? '[áudio] ' : i.anexo.tipo === 'video' ? '[vídeo] ' : '[imagem] '}${i.texto}`.trim()
          : i.texto,
      }))
      .filter((t) => t.texto)
  }

  /** Manda a pergunta (e o que for junto) e põe a resposta na conversa. */
  async function mandar(limpa: string, extras: Extras, anexo: AnexoDoBalao | undefined, qual: 'texto' | 'audio' | 'imagem' | 'video') {
    setErro(null)
    const historico = historicoEmTexto()
    const indice = itens.length
    setItens((a) => [...a, { tipo: 'cliente', texto: limpa, anexo, ouvindo: qual === 'audio' }])
    setEsperando(qual)
    setPensando(true)
    try {
      const r = await perguntar(sessao, historico, limpa, { ...extrasDaTela(), ...extras })
      setUso(r.uso)
      setFalhaDaIA(r.falhaDaIA ?? null)
      if (!r.falhaDaIA) setTrocando({})
      setItens((a) => {
        const novos: Item[] = a.map((it, k) => (k === indice && it.tipo === 'cliente'
          ? { ...it, ouvindo: false, texto: r.transcricao !== undefined ? [limpa, r.transcricao].filter(Boolean).join('\n') : it.texto }
          : it))
        if (r.texto) novos.push({ tipo: 'assistente', texto: r.texto, novo: true })
        if (r.proposta) novos.push({ tipo: 'proposta', proposta: r.proposta })
        return novos
      })
    } catch (e) {
      setItens((a) => a.map((it, k) => (k === indice && it.tipo === 'cliente' ? { ...it, ouvindo: false } : it)))
      setErro((e as Error).message)
    } finally {
      setPensando(false)
      campo.current?.focus({ preventScroll: true })
    }
  }

  async function enviar(pergunta: string) {
    const limpa = pergunta.trim()
    if (pensando || gravador.gravando) return
    if (pendentes.length) return void enviarComAnexos(limpa)
    if (!limpa) return
    setTexto('')
    await mandar(limpa, {}, undefined, 'texto')
  }

  /** Fotos (redesenhadas) ou os quadros do vídeo, dentro do teto de envio. */
  async function enviarComAnexos(limpa: string) {
    const lista = pendentes
    setTexto('')
    setPendentes([])
    try {
      const video = lista.find((p) => p.tipo === 'video')
      if (video) {
        const { quadros, duracao } = await quadrosDoVideo(video.arquivo)
        const imagens = await Promise.all(quadros.map(async (q) => ({ mime: 'image/jpeg', dados: await paraBase64(q) })))
        return void mandar(limpa, { imagens, video: true }, { tipo: 'video', url: video.url, capa: video.capa ?? '', duracao: duracao || video.duracao || 0 }, 'video')
      }
      // fotos: começa grande e diminui até caber
      let tamanho = lista.length <= 2 ? 1600 : 1200
      let imagens: Array<{ mime: string; dados: string }> = []
      for (let tentativa = 0; tentativa < 4; tentativa++) {
        imagens = await Promise.all(lista.map(async (p) => ({ mime: 'image/jpeg', dados: await paraBase64(await imagemPronta(p.arquivo, tamanho, tentativa ? 0.72 : 0.82)) })))
        if (imagens.reduce((s, i) => s + i.dados.length, 0) <= TETO_ENVIO) break
        tamanho = Math.round(tamanho * 0.72)
      }
      await mandar(limpa, { imagens }, { tipo: 'imagens', urls: lista.map((p) => p.url) }, 'imagem')
    } catch (e) {
      setErro((e as Error).message)
    }
  }

  async function gravarOuEnviar() {
    if (gravador.gravando) return void enviarAudio()
    setErro(null)
    try { await gravador.comecar() } catch (e) { setErro((e as Error).message) }
  }

  async function enviarAudio() {
    let g: Gravacao | null = null
    try { g = await gravador.terminar() } catch { g = null }
    if (!g) return
    const dados = await paraBase64(g.blob)
    if (dados.length > TETO_ENVIO) return setErro('O áudio ficou longo demais. Grave em até 2 minutos.')
    const limpa = texto.trim()
    setTexto('')
    await mandar(limpa, { audio: { mime: g.mime.split(';')[0], dados } }, { tipo: 'audio', url: URL.createObjectURL(g.blob), duracao: g.duracao, ondas: g.ondas }, 'audio')
  }

  /** Fotos e vídeo escolhidos, colados ou arrastados: viram miniaturas na caixa até o envio. */
  async function anexar(arquivos: FileList | File[]) {
    setErro(null)
    const lista = [...arquivos].filter((f) => /^(image|video)\//.test(f.type) || /\.(heic|heif|mov|mp4|m4v)$/i.test(f.name))
    if (!lista.length) return setErro('Dá para mandar foto ou vídeo. Esse arquivo não é nenhum dos dois.')
    const video = lista.find((f) => f.type.startsWith('video/') || /\.(mov|mp4|m4v)$/i.test(f.name))
    if (video) {
      // um vídeo por vez, sozinho
      pendentes.forEach((p) => URL.revokeObjectURL(p.url))
      const url = URL.createObjectURL(video)
      const novo: Pendente = { id: Date.now(), tipo: 'video', arquivo: video, url }
      setPendentes([novo])
      void quadrosDoVideo(video).then(({ quadros, duracao }) => {
        const capa = quadros[0] ? URL.createObjectURL(quadros[0]) : ''
        setPendentes((a) => a.map((p) => (p.id === novo.id ? { ...p, capa, duracao } : p)))
      }).catch((e) => { setPendentes((a) => a.filter((p) => p.id !== novo.id)); setErro((e as Error).message) })
      return
    }
    setPendentes((a) => {
      const so = a.filter((p) => p.tipo === 'imagem')
      const vagas = Math.max(0, MAX_IMAGENS - so.length)
      if (lista.length > vagas) setErro(`Dá para mandar até ${MAX_IMAGENS} fotos por vez.`)
      return [...so, ...lista.slice(0, vagas).map((f, k) => ({ id: Date.now() + k, tipo: 'imagem' as const, arquivo: f, url: URL.createObjectURL(f) }))]
    })
    campo.current?.focus({ preventScroll: true })
  }

  function tirar(id: number) {
    setPendentes((a) => {
      const p = a.find((x) => x.id === id)
      if (p) URL.revokeObjectURL(p.url)
      return a.filter((x) => x.id !== id)
    })
  }

  const tocar = (s: Sugestao) =>
    s.atalho === 'parar' ? setConfirmarParar(true) : s.atalho ? void atalho(s.atalho, s.texto) : void enviar(s.texto)

  function tecla(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto) }
  }

  // Esc cancela a gravação
  useEffect(() => {
    if (!gravador.gravando) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') gravador.cancelar() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [gravador.gravando])

  async function copiar(texto: string, i: number) {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(i)
      setTimeout(() => setCopiado((a) => (a === i ? null : a)), 1600)
    } catch { /* navegador sem permissão: o botão só não faz nada */ }
  }

  const vazio = itens.length === 0
  const resultadoVivo = vivas.reduce((s, v) => s + (v.estado?.resultado ?? 0), 0)
  // GF: o ícone do app (GF dourado no azul) — o emblema fino sumia no círculo de 30 px
  const comIcone = MARCA.id === 'globalfly'
  const emblema = `${import.meta.env.BASE_URL}${comIcone ? 'pwa-globalfly/favicon-128.png' : MARCA.emblema}`

  /** Durante a resposta que aparece aos poucos, a tela acompanha — se a pessoa já estava no fim. */
  function acompanhar() {
    const el = fim.current
    if (!el) return
    if (el.getBoundingClientRect().top < window.innerHeight + 220) el.scrollIntoView({ block: 'end' })
  }

  // celular: o texto de exemplo da caixa cabe numa linha só
  const estreito = typeof matchMedia === 'function' && matchMedia('(max-width: 560px)').matches

  function novaConversa() { setItens([]); setErro(null); setConfirmarParar(false); campo.current?.focus() }

  return (
    <div className={`as${vazio ? ' as-vazio' : ''}${comIcone ? ' as-com-icone' : ''}${arrastando ? ' as-arrastando' : ''}`}
      onDragOver={(e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setArrastando(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target || !e.currentTarget.contains(e.relatedTarget as Node)) setArrastando(false) }}
      onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); setArrastando(false); void anexar(e.dataTransfer.files) } }}>
      {arrastando && <div className="as-soltar" aria-hidden><span><IconeClipe /> Solte a foto ou o vídeo aqui</span></div>}
      <div className="as-rolo">
        {!vazio && (
          <div className="as-barra">
            <button type="button" onClick={novaConversa} title="Começar uma conversa nova">
              <IconeNova /> <span>Nova conversa</span>
            </button>
          </div>
        )}
        <div className="as-coluna">
          {vazio ? (
            <div className="as-abertura">
              <span className="as-selo"><img src={emblema} alt="" width={40} height={40} /></span>
              <h2>{saudacao(sessao.usuario.nome)}</h2>
              <p>Pergunte sobre as I.A., sobre a sua conta ou sobre a plataforma. Pode escrever, mandar um áudio, uma foto ou um vídeo — e eu preparo a I.A. para você ligar.</p>
              <div className="as-cartoes">
                {SUGESTOES.map((s) => (
                  <button key={s.texto} type="button" className={s.atalho === 'parar' ? 'perigo' : ''} onClick={() => tocar(s)}>
                    <span className="as-cartao-icone"><IconeDaSugestao s={s} /></span>
                    <span>{s.texto}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            itens.map((item, i) => {
              if (item.tipo === 'cliente') {
                return (
                  <div key={i} className="as-eu as-entra">
                    {item.anexo?.tipo === 'imagens' && (
                      <div className={`as-fotos n${Math.min(item.anexo.urls.length, 4)}`}>
                        {item.anexo.urls.map((u, k) => <a key={k} href={u} target="_blank" rel="noreferrer"><img src={u} alt={`Foto ${k + 1} enviada`} /></a>)}
                      </div>
                    )}
                    {item.anexo?.tipo === 'video' && <VideoDoBalao url={item.anexo.url} capa={item.anexo.capa} duracao={item.anexo.duracao} />}
                    {item.anexo?.tipo === 'audio' ? (
                      <div className="as-balao-audio">
                        <AudioDoBalao url={item.anexo.url} duracao={item.anexo.duracao} ondas={item.anexo.ondas} />
                        {item.ouvindo ? <p className="as-transcrito ouvindo">Ouvindo o áudio…</p> : item.texto ? <p className="as-transcrito">{item.texto}</p> : null}
                      </div>
                    ) : item.texto ? <div>{item.texto}</div> : null}
                  </div>
                )
              }
              if (item.tipo === 'assistente') {
                return (
                  <div key={i} className="as-ele as-entra">
                    <span className="as-marca"><img src={emblema} alt="" width={18} height={18} /></span>
                    <div className="as-ele-corpo">
                      <RespostaFormatada texto={item.texto} animar={!!item.novo} aoCrescer={acompanhar} />
                      <div className="as-acoes">
                        <button type="button" className={`as-copiar${copiado === i ? ' ok' : ''}`} onClick={() => void copiar(item.texto, i)}
                          title="Copiar a resposta" aria-label="Copiar a resposta">
                          {copiado === i ? <IconeOk /> : <IconeCopiar />}
                          <span>{copiado === i ? 'Copiado' : 'Copiar'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )
              }
              if (item.tipo === 'proposta') {
                return (
                  <div key={i} className="as-anexo as-cartao as-entra">
                    <ChatProposta proposta={item.proposta} sessao={sessao} rotulosTrocados={rotulosTrocados} onLigado={
                      (sessaoId, config, roboId, contaId, demo, moeda) =>
                        setItens((a) => [...a, { tipo: 'robo', sessaoId, config, roboId, contaId, demo, moeda }])
                    } />
                  </div>
                )
              }
              return (
                <div key={i} className="as-anexo as-robo as-entra">
                  <LocalRobotPanel
                    titulo="Robô do assistente"
                    socket={socket} isDemo={item.demo} demoComoReal={demoComoReal} rotulosTrocados={rotulosTrocados} moeda={item.moeda}
                    symbols={symbols} symbolPadrao={symbolPadrao}
                    identidade={identidade(item.roboId)}
                    conexao={conexao}
                    sessaoTeeds={sessao} contaId={item.contaId}
                    adotar={{ id: item.sessaoId, config: item.config, origem: 'chat' }} />
                </div>
              )
            })
          )}

          {pensando && <Pensando emblema={emblema} esperando={esperando} />}
          {erro && (
            <div className="as-erro as-entra" role="alert">
              <IconeAviso />
              <span>{erro}</span>
            </div>
          )}
          {administracao && (falhaDaIA || abrirChave) && (
            <form className="as-chave" onSubmit={(e) => { e.preventDefault(); void guardarChave() }}>
              <b>Só a administração vê este aviso</b>
              {falhaDaIA && <p>{falhaDaIA}</p>}
              <p>Para trocar a chave, cole a nova aqui. O servidor testa antes de guardar, e ela não aparece de novo na tela.</p>
              <div className="as-chave-linha">
                <input type="text" inputMode="text" autoComplete="off" autoCapitalize="off" spellCheck={false} name="chave-da-ia"
                  aria-label="Chave da Anthropic" placeholder="Cole a chave que começa com sk-ant-" value={chaveNova} onChange={(e) => setChaveNova(e.target.value)} />
                <button type="submit" disabled={trocando.indo || !chaveNova.trim()}>{trocando.indo ? 'Testando…' : 'Testar e guardar'}</button>
              </div>
              {trocando.erro && <p className="as-chave-erro">{trocando.erro}</p>}
            </form>
          )}
          {administracao && trocando.ok && <p className="as-chave-ok">Chave nova guardada e testada. Pode mandar a pergunta de novo.</p>}
          <div ref={fim} className="as-fim" />
        </div>
      </div>

      <div className="as-pe">
        <div className="as-coluna">
          {/* O que está acontecendo agora, sem ninguém precisar perguntar. */}
          {vivas.length > 0 && (
            <button type="button" className="as-fita" onClick={() => void atalho('robos', 'Como estão meus robôs?')}>
              <em />
              {vivas.length === 1 ? '1 robô operando' : `${vivas.length} robôs operando`}
              <b className={resultadoVivo >= 0 ? 'positivo' : 'negativo'}>
                {resultadoVivo >= 0 ? '+' : '−'}{din(Math.abs(resultadoVivo), vivas[0].moeda)}
              </b>
            </button>
          )}

          {confirmarParar && (
            <div className="as-confirmar" role="alertdialog" aria-label="Parar tudo">
              <span>Desligar todos os robôs ligados, em todas as contas? Operações abertas terminam normalmente.</span>
              <div>
                <button type="button" onClick={() => setConfirmarParar(false)}>Cancelar</button>
                <button type="button" className="perigo" onClick={() => { setConfirmarParar(false); void atalho('parar', 'Parar tudo') }}>Desligar tudo</button>
              </div>
            </div>
          )}

          {!vazio && (
            <div className="as-sugestoes-pe" role="group" aria-label="Sugestões">
              {/* no celular a "Nova conversa" mora aqui (lá em cima ela cobria o texto) */}
              <button type="button" className="as-nova-pe" onClick={novaConversa} disabled={pensando} aria-label="Nova conversa"><IconeNova /></button>
              {SUGESTOES.map((s) => (
                <button key={s.texto} type="button" onClick={() => tocar(s)} disabled={pensando}>{s.texto}</button>
              ))}
            </div>
          )}

          <form className={`as-escrever${gravador.gravando ? ' gravando' : ''}${pendentes.length ? ' com-anexo' : ''}`} onSubmit={(e) => { e.preventDefault(); void enviar(texto) }}
            onClick={(e) => { if (e.target === e.currentTarget) campo.current?.focus() }}>
            {pendentes.length > 0 && (
              <div className="as-pendentes">
                {pendentes.map((p) => (
                  <div key={p.id} className={`as-pendente${p.tipo === 'video' ? ' video' : ''}`}>
                    {p.tipo === 'imagem' ? <img src={p.url} alt="" /> : p.capa ? <img src={p.capa} alt="" /> : <span className="as-girando" />}
                    {p.tipo === 'video' && <em>{p.duracao ? relogio(p.duracao) : 'Vídeo'}</em>}
                    <button type="button" onClick={() => tirar(p.id)} aria-label="Tirar este anexo"><IconeX /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="as-escrever-linha">
              {!gravador.gravando && (
                <button type="button" className="as-clipe" onClick={() => seletor.current?.click()} disabled={pensando} aria-label="Mandar foto ou vídeo" title="Mandar foto ou vídeo">
                  <IconeClipe />
                </button>
              )}
              <input ref={seletor} type="file" accept="image/*,video/*" multiple hidden
                onChange={(e) => { if (e.target.files?.length) void anexar(e.target.files); e.target.value = '' }} />
              {gravador.gravando && (
                <div className="as-gravando" role="status" aria-live="polite">
                  <button type="button" className="as-cancelar" onClick={() => gravador.cancelar()} aria-label="Cancelar a gravação" title="Cancelar (Esc)"><IconeLixo /></button>
                  <em className="as-rec" />
                  <b>{relogio(gravador.segundos)}</b>
                  <span className="as-niveis" aria-hidden>
                    {Array.from({ length: 40 }, (_, k) => {
                      const n = gravador.niveis[gravador.niveis.length - 40 + k] ?? 0
                      return <i key={k} style={{ transform: `scaleY(${Math.max(0.12, n)})` }} />
                    })}
                  </span>
                </div>
              )}
              <textarea ref={campo} value={texto} rows={1} maxLength={2000} enterKeyHint="send"
                hidden={gravador.gravando}
                onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla}
                onPaste={(e) => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); void anexar(f) } }}
                aria-label="Escreva sua mensagem"
                placeholder={pendentes.length ? 'Escreva algo sobre o anexo (opcional)' : estreito ? 'Pergunte ou mande um áudio' : `Pergunte alguma coisa, mande um áudio ou peça para ligar ${MARCA.id === 'globalfly' ? 'uma I.A.' : 'um robô'}`} />
              {(texto.trim() || pendentes.length || gravador.gravando || pensando || !gravador.suportado) ? (
                <button type="submit" className={`as-enviar${pensando ? ' indo' : ''}`}
                  onClick={gravador.gravando ? (e) => { e.preventDefault(); void enviarAudio() } : undefined}
                  disabled={pensando || (!gravador.gravando && !texto.trim() && !pendentes.length)} aria-label={gravador.gravando ? 'Enviar o áudio' : 'Enviar'}>
                  {pensando ? <span className="as-girando" /> : <IconeEnviar />}
                </button>
              ) : (
                <button type="button" className="as-enviar as-microfone" onClick={() => void gravarOuEnviar()} aria-label="Gravar um áudio" title="Gravar um áudio">
                  <IconeMicrofone />
                </button>
              )}
            </div>
          </form>
          <p className="as-rodape">
            Confiro tudo no servidor e nunca ligo um robô sozinho.
            {uso && uso.hoje > uso.teto * 0.7 && <> · {uso.hoje} de {uso.teto} mensagens hoje</>}
          </p>
        </div>
      </div>
    </div>
  )
}

/** "Boa tarde, Tiago." — pela hora deste aparelho; sem nome, só a saudação. */
function saudacao(nome: string | null): string {
  const h = new Date().getHours()
  const parte = h < 5 ? 'Boa noite' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiro = (nome ?? '').trim().split(/\s+/)[0]
  if (!primeiro) return `${parte}.`
  return `${parte}, ${primeiro.charAt(0).toUpperCase()}${primeiro.slice(1).toLowerCase()}.`
}

/**
 * Enquanto a resposta não vem. O Gemini gratuito às vezes leva mais de um
 * minuto: a frase muda com o tempo para a pessoa saber que não travou.
 */
function Pensando({ emblema, esperando }: { emblema: string; esperando: 'texto' | 'audio' | 'imagem' | 'video' }) {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  const primeira = esperando === 'audio' ? 'Ouvindo o áudio' : esperando === 'imagem' ? 'Olhando a imagem' : esperando === 'video' ? 'Assistindo ao vídeo' : 'Pensando'
  const frase = segundos < 4 ? primeira : segundos < 12 ? (esperando === 'texto' ? 'Consultando a sua conta' : primeira) : segundos < 30 ? 'Montando a resposta' : 'Quase lá, a I.A. está mais lenta agora'
  return (
    <div className="as-ele as-pensando as-entra" role="status" aria-live="polite">
      <span className="as-marca girando"><img src={emblema} alt="" width={18} height={18} /></span>
      <span className="as-pensando-texto" key={frase}>{frase}<i /><i /><i /></span>
    </div>
  )
}

const svg = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
function IconeEnviar() { return <svg {...svg} strokeWidth={2.2}><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" /></svg> }
function IconeCopiar() { return <svg {...svg} width={15} height={15}><rect x="9" y="9" width="11" height="11" rx="2.5" /><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15" /></svg> }
function IconeOk() { return <svg {...svg} width={15} height={15} strokeWidth={2.2}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg> }
function IconeNova() { return <svg {...svg} width={16} height={16}><path d="M12 20h8" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg> }
function IconeAviso() { return <svg {...svg} width={17} height={17}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></svg> }
function IconeMicrofone() { return <svg {...svg} width={20} height={20} strokeWidth={2}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></svg> }
function IconeClipe() { return <svg {...svg} width={20} height={20}><path d="m20.5 11.5-8.3 8.3a5 5 0 0 1-7.1-7.1l8.6-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.4 8.4a1.7 1.7 0 0 1-2.4-2.4l7.7-7.7" /></svg> }
function IconeX() { return <svg {...svg} width={12} height={12} strokeWidth={2.6}><path d="M6 6l12 12M18 6 6 18" /></svg> }
function IconeLixo() { return <svg {...svg} width={18} height={18}><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" /></svg> }
function IconePlay() { return <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden><path d="M7 4.5v15l12.5-7.5Z" fill="currentColor" /></svg> }
function IconePausa() { return <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" /></svg> }

/** O áudio no balão: tocar/pausar, a onda (que se pinta enquanto toca) e o tempo. */
function AudioDoBalao({ url, duracao, ondas }: { url: string; duracao: number; ondas: number[] }) {
  const el = useRef<HTMLAudioElement | null>(null)
  const [tocando, setTocando] = useState(false)
  const [andou, setAndou] = useState(0)
  useEffect(() => {
    const a = el.current
    if (!a) return
    let q = 0
    const passo = () => { setAndou(a.currentTime / (duracao || a.duration || 1)); if (!a.paused) q = requestAnimationFrame(passo) }
    const tocou = () => { setTocando(true); q = requestAnimationFrame(passo) }
    const parou = () => { setTocando(false); cancelAnimationFrame(q) }
    const acabou = () => { parou(); setAndou(0) }
    a.addEventListener('play', tocou); a.addEventListener('pause', parou); a.addEventListener('ended', acabou)
    return () => { cancelAnimationFrame(q); a.removeEventListener('play', tocou); a.removeEventListener('pause', parou); a.removeEventListener('ended', acabou) }
  }, [duracao])
  return (
    <div className="as-audio">
      <button type="button" onClick={() => { const a = el.current; if (a) void (a.paused ? a.play() : a.pause()) }} aria-label={tocando ? 'Pausar o áudio' : 'Ouvir o áudio'}>
        {tocando ? <IconePausa /> : <IconePlay />}
      </button>
      <span className="as-onda" aria-hidden>
        {ondas.map((n, k) => <i key={k} className={k / ondas.length < andou ? 'ja' : ''} style={{ height: `${Math.round(18 + Math.min(1, n * 1.4) * 82)}%` }} />)}
      </span>
      <small>{relogio(tocando || andou ? andou * duracao : duracao)}</small>
      <audio ref={el} src={url} preload="metadata" />
    </div>
  )
}

/** O vídeo no balão: a capa com o play; tocando, o próprio vídeo com os controles. */
function VideoDoBalao({ url, capa, duracao }: { url: string; capa: string; duracao: number }) {
  const [aberto, setAberto] = useState(false)
  if (aberto) return <video className="as-video" src={url} controls autoPlay playsInline />
  return (
    <button type="button" className="as-video as-video-capa" onClick={() => setAberto(true)} aria-label="Assistir ao vídeo">
      {capa ? <img src={capa} alt="" /> : null}
      <span><IconePlay /></span>
      <em>{relogio(duracao)}</em>
    </button>
  )
}

function IconeDaSugestao({ s }: { s: Sugestao }) {
  if (s.atalho === 'robos') return <svg {...svg}><path d="M3 12h4l2.5-6 5 12L17 12h4" /></svg>
  if (s.atalho === 'parar') return <svg {...svg}><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
  if (/^Ligar/i.test(s.texto)) return <svg {...svg}><path d="M8 5.5v13l10.5-6.5Z" /></svg>
  return <svg {...svg}><path d="M7 7h10M7 12h10M7 17h6" /></svg>
}
