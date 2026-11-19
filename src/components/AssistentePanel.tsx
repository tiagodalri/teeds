import { useEffect, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import type { ActiveSymbol, ConnectionState } from '../core/deriv/types'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { identidade } from '../core/deriv/branding'
import type { SessaoTeeds } from '../core/teeds/conta'
import { perguntar, trocarChaveDaIA, type Proposta, type Turno } from '../core/teeds/chat'
import { acompanharVivas, pararNoServidor, sessoesVivas, type SessaoViva } from '../core/teeds/servidorRobos'
import { ChatProposta } from './ChatProposta'
import { LocalRobotPanel } from './LocalRobotPanel'
import { MARCA } from '../marca'
import { RespostaFormatada } from './assistente/RespostaFormatada'
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

export type ItemDoAssistente =
  | { tipo: 'cliente'; texto: string }
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
}

export function AssistentePanel({ sessao, socket, symbols, symbolPadrao, conexao, rotulosTrocados = false, demoComoReal = false, administracao = false, inicial }: Props) {
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

  async function enviar(pergunta: string) {
    const limpa = pergunta.trim()
    if (!limpa || pensando) return
    setTexto('')
    setErro(null)
    // Só o texto vai junto: cartão e painel são coisas desta tela.
    const historico: Turno[] = itens
      .filter((i): i is Extract<Item, { tipo: 'cliente' | 'assistente' }> =>
        i.tipo === 'cliente' || i.tipo === 'assistente')
      .map((i) => ({ papel: i.tipo, texto: i.texto }))

    setItens((a) => [...a, { tipo: 'cliente', texto: limpa }])
    setPensando(true)
    try {
      const r = await perguntar(sessao, historico, limpa)
      setUso(r.uso)
      setFalhaDaIA(r.falhaDaIA ?? null)
      if (!r.falhaDaIA) setTrocando({})
      setItens((a) => {
        const novos: Item[] = [...a]
        if (r.texto) novos.push({ tipo: 'assistente', texto: r.texto, novo: true })
        if (r.proposta) novos.push({ tipo: 'proposta', proposta: r.proposta })
        return novos
      })
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setPensando(false)
      campo.current?.focus()
    }
  }

  const tocar = (s: Sugestao) =>
    s.atalho === 'parar' ? setConfirmarParar(true) : s.atalho ? void atalho(s.atalho, s.texto) : void enviar(s.texto)

  function tecla(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto) }
  }

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
    <div className={`as${vazio ? ' as-vazio' : ''}${comIcone ? ' as-com-icone' : ''}`}>
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
              <p>Pergunte sobre as I.A., sobre a sua conta ou sobre a plataforma. Também posso preparar uma I.A. para você ligar.</p>
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
                return <div key={i} className="as-eu as-entra"><div>{item.texto}</div></div>
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

          {pensando && <Pensando emblema={emblema} />}
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

          <form className="as-escrever" onSubmit={(e) => { e.preventDefault(); void enviar(texto) }}
            onClick={(e) => { if (e.target === e.currentTarget) campo.current?.focus() }}>
            <textarea ref={campo} value={texto} rows={1} maxLength={2000} enterKeyHint="send"
              onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla}
              aria-label="Escreva sua mensagem"
              placeholder={estreito ? 'Pergunte alguma coisa…' : 'Pergunte alguma coisa, ou peça para ligar um robô…'} />
            <button type="submit" className={pensando ? 'indo' : ''} disabled={pensando || !texto.trim()} aria-label="Enviar">
              {pensando ? <span className="as-girando" /> : <IconeEnviar />}
            </button>
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
function Pensando({ emblema }: { emblema: string }) {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  const frase = segundos < 4 ? 'Pensando' : segundos < 12 ? 'Consultando a sua conta' : segundos < 30 ? 'Montando a resposta' : 'Quase lá, a I.A. está mais lenta agora'
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
function IconeDaSugestao({ s }: { s: Sugestao }) {
  if (s.atalho === 'robos') return <svg {...svg}><path d="M3 12h4l2.5-6 5 12L17 12h4" /></svg>
  if (s.atalho === 'parar') return <svg {...svg}><rect x="6" y="6" width="12" height="12" rx="2.5" /></svg>
  if (/^Ligar/i.test(s.texto)) return <svg {...svg}><path d="M8 5.5v13l10.5-6.5Z" /></svg>
  return <svg {...svg}><path d="M7 7h10M7 12h10M7 17h6" /></svg>
}
