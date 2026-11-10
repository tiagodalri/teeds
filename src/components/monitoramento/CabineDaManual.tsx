/**
 * A cabine ao vivo de uma operação manual (Monitoramento › Operações manuais › clicar na linha).
 * 10/11/2026, Tiago: "preciso conseguir clicar e visualizar as operações manuais ao vivo em tempo
 * real assim como nos bots".
 *
 * O preço vem direto da cotação PÚBLICA da Deriv, aberta por este navegador (a mesma do gráfico do
 * cliente): nada passa pelo banco a cada tick. Do banco vem só a operação (Realtime de
 * `operacoes_manuais`, que já alimenta a tabela): quanto entrou, quanto paga, quando vence, o preço de
 * entrada e a barreira que o app do cliente grava assim que a Deriv informa, e o fim. Operação de antes
 * dessa gravação: a entrada sai do primeiro tick depois da compra (marcada como aproximada).
 * Laboratório: ?tela=manual-ao-vivo.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { publicSocket, type TeedsSocket } from '../../core/deriv/client'
import { subscribeTicks } from '../../core/deriv/market'
import { casasDecimais } from '../../core/deriv/types'
import { nomeDoSimbolo as nomeDoAtivo } from '../../core/deriv/simbolos'
import { nomeDaOperacao } from '../PositionCard'
import { PrecoComDigito, formatarPreco } from '../preco/PrecoComDigito'
import { CabecalhoDaCabine } from './CabecalhoDaCabine'
import './cabine-da-manual.css'

/** A operação como a tabela de manuais a conhece. */
export interface ManualAoVivo {
  userId: string; contractId: number; contaId: string; demo: boolean; ativo: string; tipo: string; moeda: string
  entrada: number; pagamento: number; resultado: number; markup: number; situacao: string
  compradaEm: string; expiraEm: string | null; encerradaEm: string | null
  precoEntrada: number | null; precoSaida: number | null; barreira: number | null
}

type Tick = { epoch: number; quote: number }
type Rumo = 'ganhando' | 'perdendo' | 'empatando'

const usd = (v: number) => `${v < 0 ? '−' : ''}US$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const comSinal = (v: number) => `${v > 0 ? '+' : ''}${usd(v)}`
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const relogio = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
const ultimoDigito = (v: number, casas: number) => Number(formatarPreco(v, casas).slice(-1))
const FIM: Record<string, string> = { ganhou: 'Ganhou', perdeu: 'Perdeu', vendida: 'Encerrada antes do fim', encerrada: 'Encerrada' }

/** Para onde a operação vai com este preço (só onde a regra é clara pelo preço; nos outros tipos, null). */
export function rumoDaOperacao(tipo: string, preco: number, entrada: number | null, barreira: number | null, casas: number): Rumo | null {
  const ref = barreira ?? entrada
  if (/^(CALL|CALLE|PUT|PUTE|HIGHER|LOWER)$/.test(tipo)) {
    if (ref == null) return null
    const alvo = /^(CALL|CALLE|PUT|PUTE)$/.test(tipo) && entrada != null ? entrada : ref
    if (preco === alvo) return tipo === 'CALLE' || tipo === 'PUTE' ? 'ganhando' : 'empatando'
    const subiu = preco > alvo
    return (/^(CALL|CALLE|HIGHER)$/.test(tipo) ? subiu : !subiu) ? 'ganhando' : 'perdendo'
  }
  const d = ultimoDigito(preco, casas)
  if (tipo === 'DIGITEVEN') return d % 2 === 0 ? 'ganhando' : 'perdendo'
  if (tipo === 'DIGITODD') return d % 2 === 1 ? 'ganhando' : 'perdendo'
  if (barreira == null) return null
  if (tipo === 'DIGITOVER') return d > barreira ? 'ganhando' : 'perdendo'
  if (tipo === 'DIGITUNDER') return d < barreira ? 'ganhando' : 'perdendo'
  if (tipo === 'DIGITMATCH') return d === barreira ? 'ganhando' : 'perdendo'
  if (tipo === 'DIGITDIFF') return d !== barreira ? 'ganhando' : 'perdendo'
  return null
}

/** Os ticks do ativo em volta da operação: o histórico desde a compra e, enquanto ela corre, os novos. */
function useTicksDaOperacao(ativo: string, deEpoch: number, ateEpoch: number | null, aoVivo: boolean, socket: TeedsSocket) {
  const [ticks, setTicks] = useState<Tick[]>([])
  const [casas, setCasas] = useState(2)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    socket.connect()
    setErro(null)
    const pedido: Record<string, unknown> = { ticks_history: ativo, start: deEpoch, end: ateEpoch ?? 'latest', style: 'ticks', count: 5000 }
    socket.send(pedido).then((res: any) => {
      if (!vivo) return
      const h = res.history as { times: number[]; prices: number[] } | undefined
      if (res.pip_size != null) setCasas(casasDecimais(res.pip_size))
      const lidos = (h?.times ?? []).map((t, i) => ({ epoch: Number(t), quote: Number(h!.prices[i]) }))
      setTicks((antes) => juntar(lidos, antes))
    }).catch((e: Error) => { if (vivo) setErro(e.message) })
    const parar = aoVivo ? subscribeTicks(ativo, (t) => {
      if (!vivo) return
      if (t.pipSize != null) setCasas(t.pipSize)
      setTicks((antes) => juntar(antes, [{ epoch: Number(t.epoch), quote: Number(t.quote) }]))
    }, socket) : null
    return () => { vivo = false; parar?.() }
  }, [ativo, deEpoch, ateEpoch, aoVivo, socket])
  return { ticks, casas, erro }
}
/** Une duas listas de ticks sem repetir epoch, em ordem, guardando no máximo 3.000. */
function juntar(a: Tick[], b: Tick[]): Tick[] {
  const m = new Map<number, number>()
  for (const t of a) m.set(t.epoch, t.quote)
  for (const t of b) m.set(t.epoch, t.quote)
  return [...m.entries()].sort((x, y) => x[0] - y[0]).slice(-3000).map(([epoch, quote]) => ({ epoch, quote }))
}

export function CabineDaManual({ op, nome, email, selo, mostrarMarkup, aoFechar, socket = publicSocket }: {
  op: ManualAoVivo
  nome: string
  email?: string | null
  selo?: { texto: string; codigo: string } | null
  mostrarMarkup: boolean
  aoFechar: () => void
  socket?: TeedsSocket
}) {
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 500); return () => window.clearInterval(t) }, [])
  const voltar = useRef<HTMLButtonElement>(null)
  const aoFecharRef = useRef(aoFechar)
  aoFecharRef.current = aoFechar
  useEffect(() => {
    voltar.current?.focus()
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFecharRef.current() }
    document.addEventListener('keydown', tecla)
    const antes = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = antes }
  }, [])

  const compra = Date.parse(op.compradaEm)
  const vence = op.expiraEm ? Date.parse(op.expiraEm) : null
  const aberta = op.situacao === 'aberta'
  // Venceu e o fim não chegou: até 1 min é a apuração; depois, o aparelho do cliente não mandou.
  const vencida = aberta && vence != null && vence <= agora
  const fimMs = op.encerradaEm ? Date.parse(op.encerradaEm) : vence
  // Corre enquanto está aberta e ainda não venceu há mais de 1 min.
  const aoVivo = aberta && (vence == null || agora - vence < 60_000)
  const deEpoch = Math.floor(compra / 1000) - 30
  const ateEpoch = aoVivo ? null : Math.ceil(((fimMs ?? compra) + 30_000) / 1000)
  const { ticks, casas, erro } = useTicksDaOperacao(op.ativo, deEpoch, ateEpoch, aoVivo, socket)

  // A entrada: a que o app do cliente gravou; sem ela, o primeiro tick depois da compra.
  const entradaAprox = op.precoEntrada == null
  const precoEntrada = op.precoEntrada ?? ticks.find((t) => t.epoch * 1000 > compra)?.quote ?? null
  const ultimo = ticks[ticks.length - 1] ?? null
  // A saída: a gravada; sem ela, o tick do fim (vencimento ou a hora em que foi encerrada), aproximada.
  const saidaAprox = !aberta && op.precoSaida == null
  const fimEpoch = fimMs != null ? fimMs / 1000 : null
  const saidaDosTicks = fimEpoch != null ? [...ticks].reverse().find((t) => t.epoch <= fimEpoch)?.quote ?? null : null
  const precoAgora = aberta ? ultimo?.quote ?? null : op.precoSaida ?? saidaDosTicks
  const rumo = precoAgora != null ? rumoDaOperacao(op.tipo, precoAgora, precoEntrada, op.barreira, casas) : null
  const lucroSeGanhar = op.pagamento - op.entrada
  const projetado = rumo === 'ganhando' ? lucroSeGanhar : rumo === 'perdendo' ? -op.entrada : rumo === 'empatando' ? 0 : null
  const falta = aberta && vence != null ? Math.max(0, Math.round((vence - agora) / 1000)) : null
  const idadeDoTick = ultimo ? Math.max(0, (agora - ultimo.epoch * 1000) / 1000) : null
  const saude = !aberta ? 'encerrada' : idadeDoTick == null || idadeDoTick > 10 ? 'atencao' : 'ao-vivo'
  const nomeContrato = nomeDaOperacao(op.tipo, /^DIGIT(OVER|UNDER|MATCH|DIFF)$/.test(op.tipo) ? op.barreira : null)

  const estado = aberta
    ? vencida ? (agora - vence! <= 60_000 ? { cls: 'apurando', txt: 'Apurando…' } : { cls: 'sem-resultado', txt: 'Sem resultado gravado' })
      : { cls: 'aberta', txt: falta != null ? `Aberta · ${relogio(falta)}` : 'Aberta' }
    : { cls: op.situacao, txt: FIM[op.situacao] ?? op.situacao }

  return (
    <div className="cdm-fundo" role="dialog" aria-modal="true" aria-label={`Operação manual de ${nome}, somente visualização`}>
      <section className="cdm">
        <CabecalhoDaCabine refVoltar={voltar} aoFechar={aoFechar} rotuloVoltar="Operações manuais" nome={nome} email={email}
          contaId={op.contaId || '—'} demo={op.demo} moeda={op.moeda} modo="ao-vivo" saude={saude}
          idade={aberta ? idadeDoTick : null} rtt={null} desvio={null} />

        <div className="cdm-faixa">
          <div className="cdm-op">
            <span className="mon-tag manual">Manual</span>
            <b>{nomeContrato}</b>
            <span>{nomeDoAtivo(op.ativo)}</span>
            {selo && <em className={`mon-selo parceiro ${selo.codigo}`}>{selo.texto}</em>}
            <small>Comprada às {hora(compra)}{vence != null ? ` · vence às ${hora(vence)}` : ''}</small>
          </div>
          <span className={`cdm-estado ${estado.cls}`} role="status">{aberta && !vencida && <i aria-hidden="true" />}{estado.txt}</span>
        </div>

        <div className={`cdm-rumo ${aberta ? rumo ?? 'neutro' : op.resultado > 0 ? 'ganhando' : op.resultado < 0 ? 'perdendo' : 'neutro'}`}>
          {aberta ? (
            rumo == null
              ? <><b>Acompanhando o preço</b><span>Este tipo de contrato não tem resultado pelo preço na hora; o final é o que a Deriv liquidar.</span></>
              : <><b>{rumo === 'ganhando' ? 'Ganhando agora' : rumo === 'perdendo' ? 'Perdendo agora' : 'Empatado agora'}</b>
                  <span>Se vencer assim: <strong>{projetado != null ? comSinal(projetado) : '—'}</strong></span></>
          ) : (
            <><b>{FIM[op.situacao] ?? 'Encerrada'}</b><span>Resultado: <strong>{comSinal(op.resultado)}</strong></span></>
          )}
        </div>

        <dl className="cdm-fatos">
          <div><dt>Entrada</dt><dd>{usd(op.entrada)}</dd></div>
          <div><dt>Se ganhar, recebe</dt><dd>{op.pagamento > 0 ? usd(op.pagamento) : '—'}</dd></div>
          <div><dt>Preço de entrada{entradaAprox && precoEntrada != null ? <small> aprox.</small> : null}</dt><dd><PrecoComDigito valor={precoEntrada} casas={casas} /></dd></div>
          <div><dt>{aberta ? 'Preço agora' : 'Preço de saída'}{saidaAprox && precoAgora != null ? <small> aprox.</small> : null}</dt><dd><PrecoComDigito valor={precoAgora} casas={casas} tom={rumo === 'ganhando' ? 'ganho' : rumo === 'perdendo' ? 'perda' : 'neutro'} /></dd></div>
          {op.barreira != null && /^(DIGIT|HIGHER|LOWER)/.test(op.tipo) && <div><dt>Barreira</dt><dd>{/^DIGIT/.test(op.tipo) ? op.barreira : formatarPreco(op.barreira, casas)}</dd></div>}
          {mostrarMarkup && <div><dt>Markup</dt><dd className="cdm-ouro">{usd(op.markup)}{op.demo && <small> estimado</small>}</dd></div>}
        </dl>

        <GraficoDaManual ticks={aberta || fimEpoch == null ? ticks : ticks.filter((t) => t.epoch <= fimEpoch)} casas={casas} compra={compra} vence={vence} precoEntrada={precoEntrada} barreira={/^(HIGHER|LOWER)$/.test(op.tipo) ? op.barreira : null}
          rumo={aberta ? rumo : op.resultado > 0 ? 'ganhando' : op.resultado < 0 ? 'perdendo' : null} erro={erro} />

        <p className="cdm-nota">O preço vem direto da Deriv, ao vivo. Você só acompanha: nada aqui mexe na operação do cliente. O resultado final é o que a Deriv liquidar.</p>
      </section>
    </div>
  )
}

/** O gráfico em ticks: a linha do preço, a entrada tracejada, a compra e o vencimento. */
function GraficoDaManual({ ticks, casas, compra, vence, precoEntrada, barreira, rumo, erro }: {
  ticks: Tick[]; casas: number; compra: number; vence: number | null; precoEntrada: number | null; barreira: number | null; rumo: Rumo | null; erro: string | null
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)
  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const h = w < 560 ? 220 : 300
  // a coluna dos preços cabe o maior número (os índices têm até 4 casas e 6 dígitos inteiros)
  const maiorTexto = ticks.length ? formatarPreco(Math.max(...ticks.map((t) => Math.abs(t.quote))), casas).length : 8
  const margem = { esq: 8, dir: Math.max(64, Math.round(maiorTexto * 7 + 16)), cima: 16, baixo: 26 }
  const desenho = useMemo(() => {
    if (ticks.length < 2) return null
    const x0 = Math.min(ticks[0].epoch, Math.floor(compra / 1000) - 10)
    const x1 = Math.max(ticks[ticks.length - 1].epoch, vence != null ? Math.ceil(vence / 1000) + 5 : 0)
    const valores = ticks.map((t) => t.quote).concat(precoEntrada != null ? [precoEntrada] : [], barreira != null ? [barreira] : [])
    let y0 = Math.min(...valores), y1 = Math.max(...valores)
    const folga = (y1 - y0) * 0.12 || Math.abs(y1) * 0.0005 || 1
    y0 -= folga; y1 += folga
    const larg = w - margem.esq - margem.dir, alt = h - margem.cima - margem.baixo
    const X = (e: number) => margem.esq + ((e - x0) / Math.max(1, x1 - x0)) * larg
    const Y = (v: number) => margem.cima + (1 - (v - y0) / (y1 - y0)) * alt
    const linha = ticks.map((t, i) => `${i ? 'L' : 'M'}${X(t.epoch).toFixed(1)},${Y(t.quote).toFixed(1)}`).join('')
    const grade = [0, 1, 2, 3].map((i) => y0 + ((y1 - y0) * (i + 0.5)) / 4)
    const ult = ticks[ticks.length - 1]
    // As etiquetas da direita (entrada e preço agora) não se cobrem: a da entrada sai do caminho.
    const yAgora = Y(ult.quote)
    let yEtqEntrada = precoEntrada != null ? Y(precoEntrada) : 0
    if (precoEntrada != null && Math.abs(yEtqEntrada - yAgora) < 22) yEtqEntrada = yAgora + (yEtqEntrada >= yAgora ? 22 : -22)
    // a grade some onde há etiqueta, para os números não se sobreporem
    const livre = (y: number) => Math.abs(y - yAgora) > 16 && (precoEntrada == null || Math.abs(y - yEtqEntrada) > 16)
    return { X, Y, linha, grade, ult, x0, x1, yEtqEntrada, livre }
  }, [ticks, compra, vence, precoEntrada, barreira, w, h, margem.esq, margem.dir, margem.cima, margem.baixo])

  return (
    <div className={`cdm-grafico ${rumo ?? 'neutro'}`} ref={caixa}>
      {!desenho ? <p className="cdm-grafico-vazio">{erro ? 'Não consegui ler o preço da Deriv agora. Tentando de novo ao reabrir.' : 'Carregando o preço da Deriv…'}</p> : (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`Preço ao vivo; último ${formatarPreco(desenho.ult.quote, casas)}`}>
          {desenho.grade.map((v) => (
            <g key={v} className="cdm-grade">
              <line x1={margem.esq} x2={w - margem.dir} y1={desenho.Y(v)} y2={desenho.Y(v)} />
              {desenho.livre(desenho.Y(v)) && <text x={w - margem.dir + 8} y={desenho.Y(v) + 4}>{formatarPreco(v, casas)}</text>}
            </g>
          ))}
          <line className="cdm-marco" x1={desenho.X(compra / 1000)} x2={desenho.X(compra / 1000)} y1={margem.cima} y2={h - margem.baixo} />
          <text className="cdm-marco-rot" x={desenho.X(compra / 1000) + 4} y={h - 8}>Compra</text>
          {vence != null && <>
            <line className="cdm-marco vence" x1={desenho.X(vence / 1000)} x2={desenho.X(vence / 1000)} y1={margem.cima} y2={h - margem.baixo} />
            <text className="cdm-marco-rot" x={Math.min(desenho.X(vence / 1000) + 4, w - margem.dir - 44)} y={h - 8}>Vence</text>
          </>}
          {precoEntrada != null && <>
            <line className="cdm-entrada" x1={margem.esq} x2={w - margem.dir} y1={desenho.Y(precoEntrada)} y2={desenho.Y(precoEntrada)} />
            <rect className="cdm-etq entrada" x={w - margem.dir + 2} y={desenho.yEtqEntrada - 10} width={margem.dir - 4} height={20} rx={5} />
            <text className="cdm-etq-txt" x={w - margem.dir + 8} y={desenho.yEtqEntrada + 4}>{formatarPreco(precoEntrada, casas)}</text>
          </>}
          {barreira != null && <line className="cdm-entrada barreira" x1={margem.esq} x2={w - margem.dir} y1={desenho.Y(barreira)} y2={desenho.Y(barreira)} />}
          <path className="cdm-linha" d={desenho.linha} />
          <circle className="cdm-ponto" cx={desenho.X(desenho.ult.epoch)} cy={desenho.Y(desenho.ult.quote)} r={4} />
          <rect className="cdm-etq agora" x={w - margem.dir + 2} y={desenho.Y(desenho.ult.quote) - 10} width={margem.dir - 4} height={20} rx={5} />
          <text className="cdm-etq-txt agora" x={w - margem.dir + 8} y={desenho.Y(desenho.ult.quote) + 4}>{formatarPreco(desenho.ult.quote, casas)}</text>
        </svg>
      )}
    </div>
  )
}
