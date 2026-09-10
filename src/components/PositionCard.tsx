import type { OpenContract } from '../core/deriv/trading'
import { Progress } from './Progress'
import { useClock } from '../hooks/useClock'

/** Contagem regressiva ate a expiracao, atualizada a cada segundo. */
function useCountdown(expiryEpoch: number) {
  const agora = Math.floor(useClock() / 1000)
  const restante = Math.max(0, expiryEpoch - agora)
  const mm = String(Math.floor(restante / 60)).padStart(2, '0')
  const ss = String(restante % 60).padStart(2, '0')
  return { restante, texto: `${mm}:${ss}` }
}

const NOMES: Record<string, string> = {
  CALL: 'Subir', PUT: 'Descer', HIGHER: 'Acima', LOWER: 'Abaixo',
  DIGITOVER: 'Último dígito acima', DIGITUNDER: 'Último dígito abaixo',
  DIGITMATCH: 'Dígito exato', DIGITDIFF: 'Dígito diferente',
  DIGITEVEN: 'Dígito par', DIGITODD: 'Dígito ímpar',
  MULTUP: 'Multiplicador ↑', MULTDOWN: 'Multiplicador ↓', ACCU: 'Acumulador',
  ONETOUCH: 'Toca', NOTOUCH: 'Não toca',
}

/** Estados em que a Deriv ja deu a palavra final. */
const FINAIS = new Set(['won', 'lost', 'sold', 'cancelled'])
const SELO: Record<string, string> = { won: 'Ganhou', lost: 'Perdeu', sold: 'Encerrado', cancelled: 'Cancelado' }

interface Props {
  contrato: OpenContract
  nomeAtivo: string
  onEncerrar: (id: number) => void
  encerrando: boolean
}

/**
 * Uma posicao, do inicio ao fim.
 *
 * Tres momentos: aberta (contagem e resultado ao vivo), liquidando (venceu,
 * a Deriv ainda esta fechando as contas) e concluida (Ganhou / Perdeu /
 * Encerrado, com o valor final). O cartao so sai da lista depois de mostrar
 * o resultado — antes ele sumia no vencimento sem dizer o que aconteceu.
 *
 * "Encerrar" e vender o contrato de volta para a Deriv antes do fim. A
 * palavra "vender" saiu daqui de proposito: na mesma tela ela ja e o botao
 * de apostar na queda, e um leigo lia "Vender" achando que estava saindo.
 */
export function PositionCard({ contrato: c, nomeAtivo, onEncerrar, encerrando }: Props) {
  const { restante, texto } = useCountdown(c.expiryTime)
  const concluido = FINAIS.has(c.status)
  const liquidando = !concluido && c.isExpired
  // Contrato por ticks: o codigo curto traz "_5T_". Relogio nao faz sentido.
  const ticks = /_(\d+)T(?:_|$)/.exec(c.shortcode)?.[1] ?? null
  const subiu = c.contractType === 'CALL' || c.contractType === 'HIGHER' || c.contractType === 'MULTUP'
  const ganhando = c.profit >= 0
  const duracaoTotal = Math.max(1, c.expiryTime - c.startTime)
  const progresso = Math.min(100, Math.max(0, ((duracaoTotal - restante) / duracaoTotal) * 100))
  const fmt = (v: number | null, casas = 2) => (v === null ? '—' : v.toFixed(casas))
  const variacao =
    c.entrySpot !== null && c.currentSpot !== null ? c.currentSpot - c.entrySpot : null
  const selo = SELO[c.status] ?? null

  const carimbo = concluido
    ? selo
    : liquidando
      ? 'liquidando…'
      : ticks
        ? `${ticks} ${ticks === '1' ? 'tick' : 'ticks'}`
        : texto
  const carimboClasse = concluido
    ? (c.status === 'won' ? 'ganhou' : c.status === 'lost' ? 'perdeu' : '')
    : (!ticks && !liquidando && restante <= 15 ? 'urgente' : '')

  const legenda = liquidando
    ? 'venceu · a Deriv está fechando as contas'
    : ticks
      ? `vence depois de ${ticks} ${ticks === '1' ? 'tick' : 'ticks'} · cada tick é uma cotação nova`
      : restante > 0
        ? `${Math.round(progresso)}% do contrato · faltam ${texto}`
        : 'liquidando…'

  const rotuloBotao = concluido
    ? `Concluído · ${selo}`
    : liquidando
      ? 'Liquidando…'
      : encerrando
        ? 'Encerrando…'
        : c.isValidToSell
          ? `Encerrar agora · ${c.currency} ${c.bidPrice.toFixed(2)}`
          : 'Vai até o fim · não dá para encerrar antes'

  return (
    <div className={[
      'pos',
      ganhando ? 'pos-ganhando' : 'pos-perdendo',
      concluido ? `pos-concluida pos-${c.status}` : '',
      liquidando ? 'pos-liquidando' : '',
    ].join(' ')}>
      <div className="pos-cab">
        <span className={`pos-dir ${subiu ? 'up' : 'down'}`}>
          {subiu ? '▲' : '▼'} {NOMES[c.contractType] ?? c.contractType}
        </span>
        <span className="pos-ativo">{nomeAtivo}</span>
        <span className={`pos-tempo ${carimboClasse}`}>{carimbo}</span>
      </div>

      {!concluido && (
        <div className="pos-progresso">
          <Progress valor={liquidando ? 100 : progresso} altura={5}
            cor={ganhando ? 'var(--up)' : 'var(--down)'} vivo={!liquidando && restante > 0} />
          <span className="pos-progresso-txt">{legenda}</span>
        </div>
      )}

      <div className="pos-resultado">
        <div>
          <span className="rot">{concluido ? 'Resultado final' : 'Resultado agora'}</span>
          <strong className={ganhando ? 'ganho' : 'perda'}>
            {ganhando ? '+' : '−'}{c.currency} {Math.abs(c.profit).toFixed(2)}
          </strong>
          <span className={`pct ${ganhando ? 'ganho' : 'perda'}`}>
            {ganhando ? '+' : ''}{c.profitPercentage.toFixed(1)}%
          </span>
        </div>
        {!concluido && (
          <div className="pos-alvo">
            <span className="rot">Se ganhar</span>
            <strong>{c.currency} {c.payout.toFixed(2)}</strong>
            <span className="sub">lucro {(c.payout - c.buyPrice).toFixed(2)}</span>
          </div>
        )}
      </div>

      <dl className="pos-dados">
        <div><dt>Investido</dt><dd>{c.currency} {c.buyPrice.toFixed(2)}</dd></div>
        <div><dt>Entrada</dt><dd>{fmt(c.entrySpot, c.pipSize)}</dd></div>
        {concluido ? (
          <div><dt>Saída</dt><dd>{fmt(c.exitSpot ?? c.currentSpot, c.pipSize)}</dd></div>
        ) : (
          <div><dt>Agora</dt><dd className={variacao === null ? '' : variacao >= 0 ? 'ganho' : 'perda'}>
            {fmt(c.currentSpot, c.pipSize)}
            {variacao !== null && (
              <em>{variacao >= 0 ? ' +' : ' '}{variacao.toFixed(c.pipSize)}</em>
            )}
          </dd></div>
        )}
        <div><dt>{concluido ? 'Pagou' : 'Encerrar por'}</dt><dd>{c.currency} {c.bidPrice.toFixed(2)}</dd></div>
      </dl>

      <button
        className="btn btn-vender"
        disabled={concluido || liquidando || !c.isValidToSell || encerrando}
        onClick={() => onEncerrar(c.contractId)}
      >
        {rotuloBotao}
      </button>
    </div>
  )
}
