import { useState } from 'react'
import { identidade } from '../core/deriv/branding'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { Emblema } from './RobotCard'
import { ligarNoServidor } from '../core/teeds/servidorRobos'
import type { SessaoTeeds } from '../core/teeds/conta'
import type { Proposta } from '../core/teeds/chat'

/**
 * O cartão de proposta.
 *
 * É aqui que a conversa vira operação — e é de propósito que ela precise
 * passar por aqui. O assistente não liga robô: ele monta este cartão, e
 * quem liga é o dedo de quem está lendo. Nenhum robô nasce de uma frase
 * interpretada.
 *
 * Todo número que aparece aqui veio do servidor, não do texto que a IA
 * escreveu. Se ela disser numa frase que o saldo é cinco mil e o saldo for
 * dois mil, o cartão mostra dois mil.
 *
 * Os três campos são editáveis ali mesmo, e essa é a razão principal de
 * eles existirem: se a IA entendeu "um dólar" e a pessoa quis dois, ela
 * corrige no campo em vez de escrever a frase de novo. É a maior fraqueza
 * de operar por conversa, e some com um input.
 *
 * Editar não fura trava nenhuma: quem confere é a rota que liga, no
 * servidor, com os números que chegarem — não os que foram propostos.
 */

const din = (v: number, moeda: string) =>
  `${moeda} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const PADRAO: ConfigEstrategia = {
  valorInicial: 0.35, valorAoVencer: 0.35, fatorGale: 0.05, galeApos: 3,
  valorMaximo: 10, takeProfit: 5, stopLoss: 10, maxOperacoes: 100,
}

interface Props {
  proposta: Proposta
  sessao: SessaoTeeds
  /** Chamado quando o robô nasceu: o cartão vira painel ao vivo lá em cima. */
  onLigado: (sessaoId: string, config: ConfigEstrategia, roboId: string, contaId: string, demo: boolean, moeda: string) => void
}

export function ChatProposta({ proposta, sessao, onLigado }: Props) {
  const id = identidade(proposta.roboId)
  const [entrada, setEntrada] = useState(proposta.entrada)
  const [stop, setStop] = useState(proposta.stopLoss)
  const [meta, setMeta] = useState(proposta.takeProfit)
  const [confirmando, setConfirmando] = useState(false)
  const [ligando, setLigando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ligado, setLigado] = useState(false)

  const real = !proposta.demo

  async function ligar() {
    // Conta real pede dois toques. O primeiro troca o rótulo do botão para
    // dizer, com o valor escrito por extenso, o que vai acontecer — porque
    // "Ligar" e "gastar dinheiro de verdade" não deveriam ser o mesmo gesto.
    if (real && !confirmando) { setConfirmando(true); return }
    setLigando(true); setErro(null)
    try {
      const config: ConfigEstrategia = {
        ...PADRAO,
        valorInicial: entrada, valorAoVencer: entrada,
        stopLoss: stop, takeProfit: meta,
        valorMaximo: Math.max(entrada * 50, stop),
      }
      const s = await ligarNoServidor(sessao, {
        roboId: proposta.roboId, contaId: proposta.contaId, config,
      })
      setLigado(true)
      onLigado(s.id, config, proposta.roboId, proposta.contaId, proposta.demo, proposta.moeda)
    } catch (e) {
      // A recusa das travas chega aqui já escrita em português pelo servidor.
      setErro((e as Error).message)
      setConfirmando(false)
    } finally {
      setLigando(false)
    }
  }

  if (ligado) {
    return (
      <div className="cp cp-ligado">
        <Emblema id={id} tamanho={28} />
        <span><b>{proposta.roboNome}</b> ligado. O painel está aí em cima.</span>
      </div>
    )
  }

  return (
    <div className={`cp ${real ? 'cp-real' : ''}`} style={{ ['--robo' as any]: id.cor, ['--robo-suave' as any]: id.corSuave }}>
      <header className="cp-topo">
        <Emblema id={id} tamanho={44} />
        <div>
          <b>{proposta.roboNome}</b>
          <small>{id.chamada} · {id.chance}% de chance</small>
        </div>
        {real && <span className="cp-real-marca">dinheiro real</span>}
      </header>

      <p className="cp-regra">Ganha quando {proposta.regra}.</p>

      <div className="cp-campos">
        <label>
          <span>Entrada</span>
          <input type="number" min="0.35" step="0.05" value={entrada}
            onChange={(e) => setEntrada(Number(e.target.value))} />
        </label>
        <label>
          <span>Parar na perda</span>
          <input type="number" min="1" step="1" value={stop}
            onChange={(e) => setStop(Number(e.target.value))} />
        </label>
        <label>
          <span>Parar no ganho</span>
          <input type="number" min="1" step="1" value={meta}
            onChange={(e) => setMeta(Number(e.target.value))} />
        </label>
      </div>

      {erro && <p className="cp-erro">{erro}</p>}

      <footer className="cp-pe">
        <span>
          {proposta.contaId} · {proposta.demo ? 'demonstração' : 'conta real'}
          <br /><small>saldo {din(proposta.saldo, proposta.moeda)}</small>
        </span>
        <button className={`cp-ligar ${confirmando ? 'confirmando' : ''}`} onClick={ligar} disabled={ligando}>
          {ligando ? 'Ligando…'
            : confirmando ? `Confirmar ${din(entrada, proposta.moeda)} em dinheiro real`
            : 'Ligar'}
        </button>
      </footer>

      {confirmando && (
        <p className="cp-aviso">
          Esta conta é real. Cada entrada de {din(entrada, proposta.moeda)} é dinheiro seu,
          e o robô para sozinho em {din(stop, proposta.moeda)} de perda.
        </p>
      )}
    </div>
  )
}
