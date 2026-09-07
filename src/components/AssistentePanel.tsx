import { useEffect, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import type { ActiveSymbol, ConnectionState } from '../core/deriv/types'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { identidade } from '../core/deriv/branding'
import type { SessaoTeeds } from '../core/teeds/conta'
import { perguntar, type Proposta, type Turno } from '../core/teeds/chat'
import { acompanharVivas, pararNoServidor, sessoesVivas, type SessaoViva } from '../core/teeds/servidorRobos'
import { ChatProposta } from './ChatProposta'
import { LocalRobotPanel } from './LocalRobotPanel'
import { MARCA } from '../marca'

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
const SUGESTOES: Sugestao[] = [
  { texto: 'Como estão meus robôs?', atalho: 'robos' },
  { texto: 'Qual a diferença entre o AG2 e o AG7?' },
  { texto: 'Ligar o AG2 com 1 dólar na demo' },
  { texto: 'Parar tudo', atalho: 'parar' },
]

type Item =
  | { tipo: 'cliente'; texto: string }
  | { tipo: 'assistente'; texto: string }
  | { tipo: 'proposta'; proposta: Proposta }
  | { tipo: 'robo'; sessaoId: string; config: ConfigEstrategia; roboId: string; contaId: string; demo: boolean; moeda: string }

interface Props {
  sessao: SessaoTeeds
  socket: TeedsSocket | null
  symbols: ActiveSymbol[]
  symbolPadrao: string | null
  conexao: ConnectionState
}

export function AssistentePanel({ sessao, socket, symbols, symbolPadrao, conexao }: Props) {
  const [itens, setItens] = useState<Item[]>([])
  const [texto, setTexto] = useState('')
  const [pensando, setPensando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [uso, setUso] = useState<{ hoje: number; teto: number } | null>(null)
  const [vivas, setVivas] = useState<SessaoViva[]>([])
  const [copiado, setCopiado] = useState<number | null>(null)
  const fim = useRef<HTMLDivElement | null>(null)
  const campo = useRef<HTMLTextAreaElement | null>(null)

  /* O assistente sabe o que está acontecendo sem ninguém perguntar. */
  useEffect(() => acompanharVivas(sessao, setVivas), [sessao.token])

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [itens, pensando])

  /* A caixa cresce com o que se escreve, e para de crescer numa altura sensata. */
  useEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 168)}px`
  }, [texto])

  const responder = (texto: string) => setItens((a) => [...a, { tipo: 'assistente', texto }])

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
            `${v.demo ? ' (demonstração)' : ''}`
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
      setItens((a) => {
        const novos: Item[] = [...a]
        if (r.texto) novos.push({ tipo: 'assistente', texto: r.texto })
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
    s.atalho ? void atalho(s.atalho, s.texto) : void enviar(s.texto)

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

  return (
    <div className="as">
      {!vazio && (
        <div className="as-barra">
          <button onClick={() => { setItens([]); setErro(null); campo.current?.focus() }}>
            Novo assunto
          </button>
        </div>
      )}

      <div className="as-rolo">
        <div className="as-coluna">
          {vazio ? (
            <div className="as-abertura">
              <span className="as-selo">
                <img src={`${import.meta.env.BASE_URL}teeds-marca.png`} alt="" width={46} height={46} />
              </span>
              <h2>Como posso ajudar?</h2>
              <p>
                Pergunte sobre os robôs, sobre a plataforma, ou peça para ligar um.
                Confiro tudo no servidor antes de responder — e nunca ligo nada sem você clicar.
              </p>
              <div className="as-sugestoes">
                {SUGESTOES.map((s) => (
                  <button key={s.texto} onClick={() => tocar(s)}>{s.texto}</button>
                ))}
              </div>
            </div>
          ) : (
            itens.map((item, i) => {
              if (item.tipo === 'cliente') {
                return <div key={i} className="as-eu"><div>{item.texto}</div></div>
              }
              if (item.tipo === 'assistente') {
                return (
                  <div key={i} className="as-ele">
                    <span className="as-marca">
                      <img src={`${import.meta.env.BASE_URL}teeds-marca.png`} alt="" width={22} height={22} />
                    </span>
                    <div>
                      <p>{item.texto}</p>
                      <button className="as-copiar" onClick={() => void copiar(item.texto, i)}
                        title="Copiar" aria-label="Copiar">
                        {copiado === i ? 'copiado' : 'copiar'}
                      </button>
                    </div>
                  </div>
                )
              }
              if (item.tipo === 'proposta') {
                return (
                  <div key={i} className="as-cartao">
                    <ChatProposta proposta={item.proposta} sessao={sessao} onLigado={
                      (sessaoId, config, roboId, contaId, demo, moeda) =>
                        setItens((a) => [...a, { tipo: 'robo', sessaoId, config, roboId, contaId, demo, moeda }])
                    } />
                  </div>
                )
              }
              return (
                <div key={i} className="as-robo">
                  <LocalRobotPanel
                    titulo="Robô do assistente"
                    socket={socket} isDemo={item.demo} moeda={item.moeda}
                    symbols={symbols} symbolPadrao={symbolPadrao}
                    identidade={identidade(item.roboId)}
                    conexao={conexao}
                    sessaoTeeds={sessao} contaId={item.contaId}
                    adotar={{ id: item.sessaoId, config: item.config, origem: 'chat' }} />
                </div>
              )
            })
          )}

          {pensando && <div className="as-pensando"><em /> consultando o servidor da {MARCA.prosa}…</div>}
          {erro && <p className="as-erro">{erro}</p>}
          <div ref={fim} />
        </div>
      </div>

      <div className="as-pe">
        <div className="as-coluna">
          {/* O que está acontecendo agora, sem ninguém precisar perguntar. */}
          {vivas.length > 0 && (
            <button className="as-fita" onClick={() => void atalho('robos', 'Como estão meus robôs?')}>
              <em />
              {vivas.length === 1 ? '1 robô operando' : `${vivas.length} robôs operando`}
              <b className={resultadoVivo >= 0 ? 'positivo' : 'negativo'}>
                {resultadoVivo >= 0 ? '+' : '−'}{din(Math.abs(resultadoVivo), vivas[0].moeda)}
              </b>
            </button>
          )}

          {!vazio && (
            <div className="as-sugestoes as-sugestoes-pe">
              {SUGESTOES.map((s) => (
                <button key={s.texto} onClick={() => tocar(s)} disabled={pensando}>{s.texto}</button>
              ))}
            </div>
          )}

          <form className="as-escrever" onSubmit={(e) => { e.preventDefault(); void enviar(texto) }}>
            <textarea ref={campo} value={texto} rows={1} maxLength={2000}
              onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla}
              placeholder="Pergunte alguma coisa, ou peça para ligar um robô…" />
            <button type="submit" disabled={pensando || !texto.trim()} aria-label="Enviar">↑</button>
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
