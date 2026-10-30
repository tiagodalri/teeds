import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { TeedsSocket } from '../../core/deriv/client'
import { publicSocket } from '../../core/deriv/client'
import { cotarMultiplicador, faixaDoMultiplicador, type CotacaoMultiplicador } from '../../core/deriv/trading'
import { traduzirErro } from '../../core/deriv/erros'
import { dinheiro } from '../../core/dinheiro'
import { formatPrice } from '../../core/chart/scales'
import { MostradorValor } from './Boleta'
import './boleta.css'
import './boleta-multiplicador.css'

/**
 * A boleta do multiplicador (30/10/2026, Tiago: "quero multiplicadores", por
 * enquanto só para administradores).
 *
 * O multiplicador não tem prazo: a pessoa entra para cima ou para baixo, o
 * resultado acompanha o preço vezes o multiplicador, e ela fecha quando quiser.
 * A perda nunca passa da entrada: a Deriv fecha sozinha quando chega lá (o
 * "fecha sozinha em", em cada botão). Limites opcionais: take profit, stop
 * loss, ou o cancelamento (desistir em até 60 min e receber a entrada de
 * volta, pagando uma taxa) — a Deriv não deixa o cancelamento junto com os
 * outros dois.
 *
 * A cotação é pedida de novo a cada 5 s e a cada mudança, nos dois sentidos.
 * Para administradores ela mostra o markup que a Deriv informa (a comissão
 * do app): é a prova de que o multiplicador comissiona.
 */

type Tipo = 'MULTUP' | 'MULTDOWN'
export interface PedidoMultiplicador { tipo: Tipo; stake: number; multiplicador: number; takeProfit: number | null; stopLoss: number | null; cancelamento: string | null }

/** Celular e tablet tocam; computador clica. */
const TOQUE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
const lerNumero = (t: string) => { const n = Number(t.replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null }
const nomeDoPrazo = (p: string) => p.replace(/m$/, ' min').replace(/h$/, ' h')

export function BoletaMultiplicador({ cabecalho, socket, simbolo, pipSize, moeda, saldo, conta, contaReal, semDizerReal = false, podeOperar, motivoBloqueio, admin, comprando, aoComprar }: {
  /** O cartão do ativo (BoletaAtivo), o mesmo do Manual. */
  cabecalho: ReactNode
  socket: TeedsSocket | null
  simbolo: string | null
  pipSize: number
  moeda: string
  saldo: number | null
  /** O selo da conta como a tela mostra (rótulos trocados já aplicados). */
  conta: 'real' | 'demo' | null
  /** A conta é real de verdade: a compra pede o segundo clique. */
  contaReal: boolean
  semDizerReal?: boolean
  /** Conectado, linha aberta, ativo escolhido e mercado aberto (o saldo esta boleta confere). */
  podeOperar: boolean
  motivoBloqueio: string | null
  admin: boolean
  comprando: Tipo | null
  aoComprar: (pedido: PedidoMultiplicador, cotacao: CotacaoMultiplicador) => Promise<void>
}) {
  const [stake, setStake] = useState(10)
  const [texto, setTexto] = useState<string | null>(null)
  const [faixa, setFaixa] = useState<{ multiplicadores: number[]; cancelamentos: string[] } | null | 'carregando'>('carregando')
  const [multiplicador, setMultiplicador] = useState<number | null>(null)
  const [tp, setTp] = useState<{ on: boolean; texto: string }>({ on: false, texto: '5' })
  const [sl, setSl] = useState<{ on: boolean; texto: string }>({ on: false, texto: '3' })
  const [cancelamento, setCancelamento] = useState<string | null>(null)
  const [cotas, setCotas] = useState<Record<Tipo, CotacaoMultiplicador | null>>({ MULTUP: null, MULTDOWN: null })
  const [erro, setErro] = useState<string | null>(null)
  const [armado, setArmado] = useState<Tipo | null>(null)
  const sock = socket ?? publicSocket

  // o que a Deriv aceita neste ativo (multiplicadores e prazos de cancelamento)
  useEffect(() => {
    let vivo = true
    setFaixa('carregando'); setCotas({ MULTUP: null, MULTDOWN: null }); setErro(null)
    if (!simbolo) { setFaixa(null); return }
    faixaDoMultiplicador(publicSocket, simbolo)
      .then((f) => {
        if (!vivo) return
        setFaixa(f)
        // começa no segundo degrau (x100 no 75 Index): nem o menor nem um dos maiores
        setMultiplicador((atual) => (f && atual && f.multiplicadores.includes(atual) ? atual : f?.multiplicadores[Math.min(1, f.multiplicadores.length - 1)] ?? null))
        setCancelamento((atual) => (f && atual && f.cancelamentos.includes(atual) ? atual : null))
      })
      .catch(() => { if (vivo) setFaixa(null) })
    return () => { vivo = false }
  }, [simbolo])

  const takeProfit = tp.on && !cancelamento ? lerNumero(tp.texto) : null
  const stopLoss = sl.on && !cancelamento ? lerNumero(sl.texto) : null
  const chave = `${simbolo}|${stake}|${multiplicador}|${takeProfit}|${stopLoss}|${cancelamento}|${moeda}|${socket ? 'conta' : 'publico'}`

  // as duas cotações (Sobe e Desce), de novo a cada 5 s e a cada mudança
  const pedido = useRef(0)
  useEffect(() => {
    if (!simbolo || !multiplicador || stake < 1) { setCotas({ MULTUP: null, MULTDOWN: null }); return }
    let vivo = true
    const cotar = () => {
      const n = ++pedido.current
      const params = { symbol: simbolo, amount: stake, currency: moeda, multiplier: multiplicador, takeProfit, stopLoss, cancellation: cancelamento }
      Promise.all((['MULTUP', 'MULTDOWN'] as const).map((tipo) => cotarMultiplicador(sock, { ...params, tipo })))
        .then(([up, down]) => { if (vivo && n === pedido.current) { setCotas({ MULTUP: up, MULTDOWN: down }); setErro(null) } })
        .catch((e: Error) => {
          if (!vivo || n !== pedido.current) return
          // a lista do ativo (contracts_for) e a da cotação podem diferir conforme a conta
          // (EUR/USD: a consulta diz x100…x800 e a cotação aceita x50…x500): vale a da cotação
          const aceitos = /accepts\s+([\d,\s]+)/i.exec(e.message)?.[1]?.split(',').map((x) => Number(x.trim())).filter((x) => x > 0)
          if (aceitos?.length && multiplicador) {
            const perto = aceitos.reduce((a, b) => (Math.abs(b - multiplicador) < Math.abs(a - multiplicador) ? b : a))
            setFaixa((f) => (f && f !== 'carregando' ? { ...f, multiplicadores: aceitos } : f))
            setMultiplicador(perto)
            return
          }
          setCotas({ MULTUP: null, MULTDOWN: null }); setErro(traduzirErro(e.message))
        })
    }
    const t0 = window.setTimeout(cotar, 300)
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') cotar() }, 5000)
    return () => { vivo = false; window.clearTimeout(t0); window.clearInterval(t) }
  }, [chave]) // eslint-disable-line react-hooks/exhaustive-deps

  // o segundo clique da conta real desarma sozinho em 8 s
  useEffect(() => { if (!armado) return; const t = window.setTimeout(() => setArmado(null), 8000); return () => window.clearTimeout(t) }, [armado])
  useEffect(() => { setArmado(null) }, [chave])

  const custo = (cotas.MULTUP?.askPrice ?? stake)
  const acimaDoSaldo = saldo !== null && custo > saldo
  const porUmPorCento = multiplicador ? (stake * multiplicador) / 100 : null
  const bloqueio = motivoBloqueio ?? (stake < 1 ? 'Valor mínimo de US$ 1' : acimaDoSaldo ? 'Saldo insuficiente' : faixa === null ? 'Sem multiplicador neste ativo' : null)
  const pode = podeOperar && !bloqueio && !!multiplicador && !erro

  async function clicar(tipo: Tipo) {
    const c = cotas[tipo]
    if (!pode || !c || !multiplicador || comprando) return
    if (contaReal && armado !== tipo) { setArmado(tipo); return }
    setArmado(null)
    await aoComprar({ tipo, stake, multiplicador, takeProfit, stopLoss, cancelamento }, c)
  }

  const markup = useMemo(() => cotas.MULTUP?.appMarkup ?? cotas.MULTDOWN?.appMarkup ?? null, [cotas])

  return (
    <section className="bl bl-mult" aria-label="Boleta do multiplicador">
      {cabecalho}
      <div className="bl-corpo">
        <MostradorValor stake={stake} texto={texto} moeda={moeda} alerta={acimaDoSaldo} saldo={saldo} conta={conta} minimo={1} atalhos={[1, 5, 10, 50, 100]}
          aoMudarTexto={(t) => { setTexto(t); const n = lerNumero(t); if (n !== null && n >= 1) setStake(n) }}
          aoMudar={(v) => { setStake(v); setTexto(null) }}
          aoSair={() => { const n = lerNumero(texto ?? ''); if (texto !== null) setStake(Math.max(1, n ?? 1)); setTexto(null) }} />
        {acimaDoSaldo && saldo !== null && <p className="bl-alerta">Valor maior que o seu saldo ({dinheiro(saldo, moeda)}). Diminua o valor.</p>}

        <i className="bl-sep" aria-hidden="true" />

        <div className="mt-bloco">
          <div className="bl-most-cab"><span className="bl-rot" id="mt-mult-rot">Multiplicador</span></div>
          {faixa === 'carregando' ? <p className="mt-nota">Consultando a Deriv…</p>
            : faixa === null ? <p className="mt-nota">Este ativo não tem multiplicador na Deriv. Escolha um índice sintético, um par de moedas ou o ouro.</p>
            : (
              <div className="mt-mults" role="radiogroup" aria-labelledby="mt-mult-rot">
                {faixa.multiplicadores.map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={multiplicador === m} className={multiplicador === m ? 'on' : ''} onClick={() => setMultiplicador(m)}>x{m}</button>
                ))}
              </div>
            )}
          {porUmPorCento !== null && (
            <div className="mt-exposicao">
              <span>Cada 1% que o preço andar<b>{dinheiro(porUmPorCento, moeda)}</b></span>
              <span>Perda máxima<b>{dinheiro(stake, moeda)}</b></span>
            </div>
          )}
        </div>

        <i className="bl-sep" aria-hidden="true" />

        <div className="mt-bloco">
          <div className="bl-most-cab"><span className="bl-rot">Limites de saída</span><small className="mt-opcional">Opcionais</small></div>
          <div className="mt-limites">
            <label className={`mt-limite ${cancelamento ? 'off' : ''}`}>
              <input type="checkbox" checked={tp.on && !cancelamento} disabled={!!cancelamento} onChange={(e) => setTp((x) => ({ ...x, on: e.target.checked }))} />
              <span className="mt-limite-nome">Take profit<small>Fecha com o lucro</small></span>
              <span className="mt-limite-valor"><small>US$</small><input type="text" inputMode="decimal" aria-label="Lucro do take profit" value={tp.texto} disabled={!tp.on || !!cancelamento} onChange={(e) => setTp((x) => ({ ...x, texto: e.target.value.replace(/[^\d.,]/g, '') }))} /></span>
            </label>
            <label className={`mt-limite ${cancelamento ? 'off' : ''}`}>
              <input type="checkbox" checked={sl.on && !cancelamento} disabled={!!cancelamento} onChange={(e) => setSl((x) => ({ ...x, on: e.target.checked }))} />
              <span className="mt-limite-nome">Stop loss<small>Fecha antes de perder tudo</small></span>
              <span className="mt-limite-valor"><small>US$</small><input type="text" inputMode="decimal" aria-label="Perda do stop loss" value={sl.texto} disabled={!sl.on || !!cancelamento} onChange={(e) => setSl((x) => ({ ...x, texto: e.target.value.replace(/[^\d.,]/g, '') }))} /></span>
            </label>
            {faixa && faixa !== 'carregando' && faixa.cancelamentos.length > 0 && (
              <div className="mt-limite mt-cancel">
                <span className="mt-limite-nome">Cancelamento<small>{cancelamento ? `Desiste em até ${nomeDoPrazo(cancelamento)} e a entrada volta` : 'Desistir e receber a entrada de volta'}</small></span>
                <div className="mt-prazos" role="radiogroup" aria-label="Prazo do cancelamento">
                  <button type="button" role="radio" aria-checked={!cancelamento} className={!cancelamento ? 'on' : ''} onClick={() => setCancelamento(null)}>Sem</button>
                  {faixa.cancelamentos.map((c) => <button key={c} type="button" role="radio" aria-checked={cancelamento === c} className={cancelamento === c ? 'on' : ''} onClick={() => setCancelamento(c)}>{c.replace('m', '')}</button>)}
                </div>
              </div>
            )}
          </div>
          {cancelamento && <p className="mt-nota">Com o cancelamento, take profit e stop loss ficam desligados (regra da Deriv). Custo: <b>{cotas.MULTUP?.custoDoCancelamento !== null && cotas.MULTUP?.custoDoCancelamento !== undefined ? dinheiro(cotas.MULTUP.custoDoCancelamento, moeda) : '…'}</b>, além da entrada.</p>}
        </div>

        {erro && <p className="bl-alerta" role="alert">{erro}</p>}

        <div className="bl-comprar mt-botoes">
          {(['MULTUP', 'MULTDOWN'] as const).map((tipo) => {
            const c = cotas[tipo]
            const sobe = tipo === 'MULTUP'
            const enviando = comprando === tipo
            return (
              <button key={tipo} type="button" className={`bl-botao ${sobe ? 'sobe' : 'desce'} ${armado === tipo ? 'confirmando' : ''}`}
                disabled={!pode || !c || !!comprando} onClick={() => void clicar(tipo)}
                aria-label={`${sobe ? 'Sobe' : 'Desce'}${multiplicador ? ` x${multiplicador}` : ''}${bloqueio ? `: ${bloqueio}` : ''}`}>
                <span className="bl-botao-lin">
                  <span className="bl-seta" aria-hidden="true">{sobe ? '▲' : '▼'}</span>
                  <span className="bl-dir">{sobe ? 'Sobe' : 'Desce'}</span>
                  {multiplicador && <span className="bl-pct">x{multiplicador}</span>}
                </span>
                {enviando ? <span className="bl-estado">Enviando…</span>
                  : bloqueio ? <span className="bl-estado">{bloqueio}</span>
                  : armado === tipo ? <span className="bl-estado">{TOQUE ? 'Toque' : 'Clique'} de novo para confirmar {dinheiro(c?.askPrice ?? stake, moeda)}{!semDizerReal && <small>Dinheiro real</small>}</span>
                  : <>
                      <small>Fecha sozinha em</small>
                      <strong>{c?.stopOut?.preco !== null && c?.stopOut?.preco !== undefined ? formatPrice(c.stopOut.preco, pipSize) : '…'}</strong>
                    </>}
              </button>
            )
          })}
        </div>

        <div className="bl-resumo mt-resumo">
          <span>Taxa da Deriv: <b>{cotas.MULTUP ? dinheiro(cotas.MULTUP.comissao, moeda) : '—'}</b></span>
          <span>{cancelamento ? <>Sai da conta: <b>{dinheiro(custo, moeda)}</b></> : <>Sem prazo · fecha quando quiser</>}</span>
        </div>
        {admin && (
          <p className="mt-markup" title="O markup do app que a Deriv informa na cotação. Só administradores veem.">
            Nosso markup nesta entrada: <b>{markup !== null ? dinheiro(markup, moeda) : socket ? 'a Deriv não informou na cotação' : 'conecte a Deriv para ver'}</b>
          </p>
        )}
      </div>
    </section>
  )
}
