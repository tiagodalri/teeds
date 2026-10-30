import { useEffect, useState } from 'react'
import type { OpenContract } from '../core/deriv/trading'
import './operar/boleta.css'
import { useClock } from '../hooks/useClock'
import { dinheiro as emDinheiro, dinheiroComSinal } from '../core/dinheiro'
import { PrecoComDigito } from './preco/PrecoComDigito'

/** Contagem regressiva ate a expiracao, atualizada a cada segundo. */
export function useCountdown(expiryEpoch: number) {
  const agora = Math.floor(useClock() / 1000)
  const restante = Math.max(0, expiryEpoch - agora)
  const mm = String(Math.floor(restante / 60)).padStart(2, '0')
  const ss = String(restante % 60).padStart(2, '0')
  return { restante, texto: `${mm}:${ss}` }
}

/**
 * O nome de cada operação, igual em todas as telas (posição, últimas entradas,
 * gráfico, relatórios). Substantivo, não o verbo do botão: "Compra", não "Comprar"
 * (29/10/2026, revisão). Os de dígito sem o número; com o número, `nomeDaOperacao`.
 */
export const NOMES_DE_CONTRATO: Record<string, string> = {
  CALL: 'Compra', PUT: 'Venda', CALLE: 'Compra', PUTE: 'Venda', HIGHER: 'Acima', LOWER: 'Abaixo',
  DIGITOVER: 'Dígito acima', DIGITUNDER: 'Dígito abaixo',
  DIGITMATCH: 'Dígito igual', DIGITDIFF: 'Dígito diferente',
  DIGITEVEN: 'Par', DIGITODD: 'Ímpar',
  MULTUP: 'Multiplicador ↑', MULTDOWN: 'Multiplicador ↓', ACCU: 'Acumulador',
  ONETOUCH: 'Toca', NOTOUCH: 'Não toca',
}

/** Com o dígito escolhido: "Acima de 4", "Igual a 7". Sem ele, o nome da tabela acima. */
export function nomeDaOperacao(tipo: string, barreira?: number | string | null): string {
  const b = barreira === null || barreira === undefined || barreira === '' ? null : barreira
  if (b !== null) {
    if (tipo === 'DIGITOVER') return `Acima de ${b}`
    if (tipo === 'DIGITUNDER') return `Abaixo de ${b}`
    if (tipo === 'DIGITMATCH') return `Igual a ${b}`
    if (tipo === 'DIGITDIFF') return `Diferente de ${b}`
  }
  return NOMES_DE_CONTRATO[tipo] ?? tipo
}

/** Estados em que a Deriv ja deu a palavra final. */
const FINAIS = new Set(['won', 'lost', 'sold', 'cancelled'])
const SELO: Record<string, string> = { won: 'Ganhou', lost: 'Perdeu', sold: 'Encerrada', cancelled: 'Cancelada' }
/** Celular e tablet tocam; computador clica. */
const TOQUE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches

interface Props {
  contrato: OpenContract
  nomeAtivo: string
  onEncerrar: (id: number) => void
  encerrando: boolean
  /** Modo CEO: o markup desta operação (some quando não é o modo CEO). */
  markup?: number
  /**
   * Conta real (o tipo verdadeiro, nunca a etiqueta da tela): o "Encerrar agora"
   * pede um segundo toque, como a compra. Em demo encerra direto.
   */
  real?: boolean
}

/**
 * Uma posicao, do inicio ao fim.
 *
 * Tres momentos: aberta (contagem e resultado ao vivo), liquidando (venceu,
 * a Deriv ainda esta fechando as contas) e concluida (Ganhou / Perdeu /
 * Encerrado, com o valor final). O cartao so sai da lista depois de mostrar
 * o resultado — antes ele sumia no vencimento sem dizer o que aconteceu.
 *
 * A estrutura (cabecalho, barra, resultado, botao) e SEMPRE a mesma: o
 * painel flutuante desenha o cartao numa grade de altura fixa, e tirar uma
 * linha em algum estado desalinha as outras.
 *
 * "Encerrar" e vender o contrato de volta para a Deriv antes do fim. A
 * palavra "vender" saiu daqui de proposito: na mesma tela ela ja e o botao
 * da queda, e um leigo lia "Vender" achando que estava saindo.
 */
/**
 * O motivo da Deriv para não deixar encerrar, em poucas palavras (o botão é
 * estreito; o texto inteiro dela fica no `title`). Antes era sempre "Vai até
 * o fim · não dá para encerrar antes", que cortava no celular e não dizia
 * por quê. (16/10/2026, primeiro teste com forex.)
 */
export function porQueNaoEncerra(motivo: string | null): string {
  const m = (motivo ?? '').toLowerCase()
  if (/market.*(clos|open)|trading.*(clos|suspend)/.test(m)) return 'Mercado fechado agora'
  if (/not offered|not available|resale|sell back|sellback/.test(m)) return 'A Deriv não deixa encerrar antes'
  if (/wait|try again|moved|too old|stale|quote|price/.test(m)) return 'Aguarde um instante'
  return 'Só no vencimento'
}

export function PositionCard({ contrato: c, nomeAtivo, onEncerrar, encerrando, markup, real = false }: Props) {
  // conta real: o primeiro toque arma, o segundo encerra; desarma sozinho em 8 s
  const [armado, setArmado] = useState(false)
  useEffect(() => {
    if (!armado) return
    const t = window.setTimeout(() => setArmado(false), 8_000)
    return () => window.clearTimeout(t)
  }, [armado])
  const { restante, texto } = useCountdown(c.expiryTime)
  const concluido = FINAIS.has(c.status)
  const liquidando = !concluido && c.isExpired
  // Contrato por ticks: o codigo curto traz "_5T_". Relogio nao faz sentido.
  const ticks = /_(\d+)T(?:_|$)/.exec(c.shortcode)?.[1] ?? null
  const subiu = c.contractType === 'CALL' || c.contractType === 'HIGHER' || c.contractType === 'MULTUP'
  // direção só existe em Subir/Descer, Acima/Abaixo e multiplicador; dígitos não têm lado
  const comDirecao = /^(CALL|PUT|HIGHER|LOWER|MULTUP|MULTDOWN)$/.test(c.contractType)
  const ganhando = c.profit >= 0
  const duracaoTotal = Math.max(1, c.expiryTime - c.startTime)
  // contagem zerada e a Deriv ainda sem fechar: mostra liquidando (o botão segue a regra de antes)
  const liquidandoNaTela = !concluido && (liquidando || (!ticks && restante === 0))
  const progresso = concluido || liquidandoNaTela ? 100 : Math.min(100, Math.max(0, ((duracaoTotal - restante) / duracaoTotal) * 100))
  const variacao = c.entrySpot !== null && c.currentSpot !== null ? c.currentSpot - c.entrySpot : null
  const selo = SELO[c.status] ?? null
  const dinheiro = (v: number) => emDinheiro(v, c.currency)
  const pct = `${ganhando ? '+' : '−'}${Math.abs(c.profitPercentage).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`

  // o centro do relógio de painel: a contagem, as cotações (ticks), ou o desfecho
  const centro = concluido ? selo : liquidandoNaTela ? '…' : ticks ? `${ticks} cot.` : texto
  const tom = concluido
    ? (c.status === 'won' ? 'ganhou' : c.status === 'lost' ? 'perdeu' : '')
    : (!ticks && !liquidandoNaTela && restante <= 15 ? 'urgente' : '')
  const aberta = new Date(c.startTime * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  const legenda = concluido
    ? c.status === 'won' ? `Ganhou · recebeu ${dinheiro(c.bidPrice)}`
      : c.status === 'lost' ? `Perdeu · ${dinheiro(c.buyPrice)} da entrada`
      : c.status === 'sold' ? `Encerrada antes do fim por ${dinheiro(c.bidPrice)}`
      : 'Cancelada'
    : liquidandoNaTela ? 'Tempo esgotado · aguardando o resultado da Deriv'
    : ticks ? `Fecha após ${ticks} ${ticks === '1' ? 'cotação' : 'cotações'} · aberta às ${aberta}`
    : `Aberta às ${aberta}`

  const rotuloBotao = concluido
    ? `Concluída · ${selo}`
    : liquidando
      ? 'Liquidando…'
      : encerrando
        ? 'Encerrando…'
        : c.isValidToSell
          ? armado
            ? <>{TOQUE ? 'Toque' : 'Clique'} de novo para encerrar ·<span>{dinheiro(c.bidPrice)}</span></>
            : <>Encerrar agora ·<span>{dinheiro(c.bidPrice)}</span></>
          : porQueNaoEncerra(c.motivoSemVenda)

  // o arco do relógio: 2πr com r = 24 (viewBox 56)
  const CIRC = 150.8
  return (
    <article className={['bp', ganhando ? 'ganhando' : 'perdendo', concluido ? `concluida ${c.status}` : '', liquidando ? 'liquidando' : ''].join(' ')}>
      <div className="bp-cab">
        <div className={`bp-relogio ${tom} ${concluido || (ticks && !liquidandoNaTela) ? 'palavra' : ''}`} role="timer" aria-label={concluido ? (selo ?? '') : ticks ? `Fecha após ${ticks} ${ticks === '1' ? 'cotação' : 'cotações'}` : `Faltam ${texto}`}>
          <svg viewBox="0 0 56 56" aria-hidden="true">
            <circle className="fundo" cx="28" cy="28" r="24" />
            <circle className="arco" cx="28" cy="28" r="24" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - progresso / 100)} />
          </svg>
          <b>{centro}</b>
        </div>
        <div className="bp-id">
          <b className={comDirecao ? (subiu ? 'sobe' : 'desce') : ''}>{comDirecao && <><i aria-hidden="true">{subiu ? '▲' : '▼'}</i> </>}{nomeDaOperacao(c.contractType, c.barrier)}<span className="bp-ativo"> · {nomeAtivo}</span></b>
          <small><span className="bp-investido">Investido <em>{dinheiro(c.buyPrice)}</em></span><span className="bp-legenda">{legenda}</span></small>
        </div>
        <div className={`bp-res ${ganhando ? 'ganho' : 'perda'}`}>
          <b>{dinheiroComSinal(c.profit, c.currency)}</b>
          <small>{pct}</small>
        </div>
      </div>

      <div className="bp-spots">
        {/* o último dígito em destaque: nas operações de dígitos é ele que decide */}
        <span>Entrada <PrecoComDigito valor={c.entrySpot} casas={c.pipSize} /></span>
        <span className="bp-seta" aria-hidden="true">→</span>
        <span>{concluido ? 'Saída' : 'Agora'} <PrecoComDigito valor={concluido ? c.exitSpot : c.currentSpot} casas={c.pipSize}
          tom={concluido ? (c.status === 'won' ? 'ganho' : c.status === 'lost' ? 'perda' : 'neutro') : 'neutro'} /></span>
        {/* a cor diz se o movimento favorece a posição: na Vender, o preço caindo é verde */}
        {variacao !== null && <span className={`bp-dif ${!comDirecao ? '' : (subiu ? variacao >= 0 : variacao <= 0) ? 'ganho' : 'perda'}`}>{variacao >= 0 ? '+' : '−'}{Math.abs(variacao).toLocaleString('pt-BR', { minimumFractionDigits: c.pipSize, maximumFractionDigits: c.pipSize })}</span>}
      </div>

      <div className="bp-nums">
        <div><small>Investido</small><b>{dinheiro(c.buyPrice)}</b></div>
        <div><small>{concluido ? 'Pagou' : 'Se ganhar'}</small><b>{dinheiro(concluido ? c.bidPrice : c.payout)}</b></div>
        {markup !== undefined && <div className="bp-markup"><small>Markup</small><b>{dinheiro(markup)}</b></div>}
      </div>

      <button type="button" className={`bp-encerrar ${armado ? 'armado' : ''}`}
        disabled={concluido || liquidando || !c.isValidToSell || encerrando}
        aria-label={armado ? `Confirmar: encerrar agora por ${dinheiro(c.bidPrice)}` : undefined}
        onClick={() => {
          if (real && !armado) { setArmado(true); return }
          setArmado(false)
          onEncerrar(c.contractId)
        }}
        title={!concluido && c.motivoSemVenda ? `Deriv: ${c.motivoSemVenda}` : undefined}>
        {rotuloBotao}
      </button>
    </article>
  )
}
