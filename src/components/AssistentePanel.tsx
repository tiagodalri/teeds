import { useEffect, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import type { ActiveSymbol, ConnectionState } from '../core/deriv/types'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { identidade } from '../core/deriv/branding'
import type { SessaoTeeds } from '../core/teeds/conta'
import { perguntar, type Proposta, type Turno } from '../core/teeds/chat'
import { ChatProposta } from './ChatProposta'
import { LocalRobotPanel } from './LocalRobotPanel'

/**
 * O assistente da Teeds — uma aba inteira, não uma gaveta.
 *
 * A primeira versão era um painel deslizando pela direita, para acompanhar a
 * pessoa em qualquer tela. O Tiago pediu aba, e tem razão: o assistente aqui
 * não é um atalho para quem já sabe operar — é onde a pessoa tira dúvida e
 * opera conversando, e as duas coisas pedem espaço, não uma tira de 400
 * pixels. Uma conversa espremida ensina a escrever pouco.
 *
 * A conversa vive só enquanto a página estiver aberta. Trocar de aba e
 * voltar mantém tudo; recarregar limpa. Nada é guardado em servidor nenhum —
 * menos dado sensível parado, menos custo, e nada que alguém precise pedir
 * para apagar depois.
 */

/**
 * As sugestões do começo.
 *
 * Campo em branco piscando é teste de adivinhação. Estas quatro ensinam o
 * alcance da coisa em dois segundos — duas de dúvida e duas de operação, de
 * propósito, porque o assistente serve para as duas.
 */
const SUGESTOES = [
  'Como estão meus robôs?',
  'Qual a diferença entre o AG2 e o AG7?',
  'Ligar o AG2 com 1 dólar na demo',
  'Parar tudo',
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
  const fim = useRef<HTMLDivElement | null>(null)
  const campo = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => { fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [itens, pensando])

  async function enviar(pergunta: string) {
    const limpa = pergunta.trim()
    if (!limpa || pensando) return
    setTexto('')
    setErro(null)
    // Só o texto vai junto: cartão e painel são coisas desta tela, e o
    // assistente não precisa deles para entender a conversa.
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

  /** O cartão sai e entra o painel ao vivo, no mesmo lugar da conversa. */
  function ligado(
    sessaoId: string, config: ConfigEstrategia,
    roboId: string, contaId: string, demo: boolean, moeda: string,
  ) {
    setItens((a) => [...a, { tipo: 'robo', sessaoId, config, roboId, contaId, demo, moeda }])
  }

  /* Enter envia, Shift+Enter quebra linha — como todo lugar onde se conversa. */
  function tecla(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void enviar(texto) }
  }

  const vazio = itens.length === 0

  return (
    <div className="as">
      <div className="as-rolo">
        <div className="as-coluna">
          {vazio ? (
            <div className="as-abertura">
              <h2>Como posso ajudar?</h2>
              <p>
                Pergunte sobre os robôs, sobre a plataforma, ou peça para ligar um.
                Eu confiro tudo no servidor antes de responder — e nunca ligo nada
                sem você clicar.
              </p>
              <div className="as-sugestoes">
                {SUGESTOES.map((s) => (
                  <button key={s} onClick={() => void enviar(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : (
            itens.map((item, i) => {
              if (item.tipo === 'cliente') {
                return <div key={i} className="as-eu"><div>{item.texto}</div></div>
              }
              if (item.tipo === 'assistente') {
                return <div key={i} className="as-ele">{item.texto}</div>
              }
              if (item.tipo === 'proposta') {
                return (
                  <div key={i} className="as-cartao">
                    <ChatProposta proposta={item.proposta} sessao={sessao} onLigado={ligado} />
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

          {pensando && <div className="as-pensando"><em /> consultando o servidor da Teeds…</div>}
          {erro && <p className="as-erro">{erro}</p>}
          <div ref={fim} />
        </div>
      </div>

      <div className="as-pe">
        <div className="as-coluna">
          {!vazio && (
            <div className="as-sugestoes as-sugestoes-pe">
              {SUGESTOES.map((s) => (
                <button key={s} onClick={() => void enviar(s)} disabled={pensando}>{s}</button>
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
            O assistente confere tudo no servidor e nunca liga um robô sozinho.
            {uso && uso.hoje > uso.teto * 0.7 && <> · {uso.hoje} de {uso.teto} mensagens hoje</>}
          </p>
        </div>
      </div>
    </div>
  )
}
