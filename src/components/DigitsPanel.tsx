import { useEffect, useMemo, useRef, useState } from 'react'
import { publicSocket, type TeedsSocket } from '../core/deriv/client'
import { chanceTeorica, TIPOS_DIGITO, type DigitContract } from '../core/deriv/digits'
import { traduzirErro } from '../core/deriv/erros'
import { dinheiro, dinheiroComSinal } from '../core/dinheiro'
import { useDigits } from '../hooks/useDigits'
import './digitos-painel.css'

interface Props {
  symbol: string | null
  pipSize: number
  stake: number
  moeda: string
  podeOperar: boolean
  logado: boolean
  comprando: boolean
  /** Conexao da conta: cota com o markup real do app. */
  socket?: TeedsSocket | null
  onComprar: (tipo: DigitContract, barreira: string | undefined, ticks: number) => void
  /** Tipo armado para confirmar em conta real (ou null). Mesma trava do Subir/Descer. */
  confirmando: string | null
  /** Rótulos trocados (exercícios internos): a confirmação continua, sem dizer "dinheiro real". */
  semDizerReal?: boolean
  /** Qualquer mudanca de parametro desarma a confirmacao. */
  onDesarmar: () => void
  /** Por que o botao esta travado, para mostrar no lugar de um botao mudo. */
  motivoBloqueio: string | null
  /** Sem a Deriv: o botão vira "Conectar a Deriv" (antes era um botão morto com esse texto). */
  onConectarDeriv?: () => void
}

const JANELAS = [50, 100, 500, 1000]
/** Celular e tablet tocam; computador clica. */
const TOQUE = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches
// o número em cima de cada barra, sem o "%" (vai no título) e sem ",0": dez números cabem na lateral de 300 px (29/10/2026)
const pctBarra = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
/*
  A fita dos últimos dígitos (26/10/2026): a caixa tinha altura para pouco mais
  de duas linhas e a terceira saía cortada, justamente a do dígito mais novo.
  Agora ela mede a largura e mostra só o que cabe INTEIRO em três linhas, com
  o mais recente sempre visível no fim.
*/
const FITA = { linhas: 3, lado: 17, vao: 3 }

export function DigitsPanel(props: Props) {
  const {
    symbol, pipSize, stake, moeda, podeOperar, logado, comprando, socket, onComprar,
    confirmando, onDesarmar, motivoBloqueio,
  } = props
  const [janela, setJanela] = useState(100)
  const [tipoSel, setTipoSel] = useState<DigitContract>('DIGITUNDER')
  const [digito, setDigito] = useState(5)
  const [ticks, setTicks] = useState(5)
  const [payout, setPayout] = useState<number | null>(null)
  const [erroCotacao, setErroCotacao] = useState<string | null>(null)
  const [cotando, setCotando] = useState(false)

  const estat = useDigits(symbol, pipSize, janela)
  const fita = useRef<HTMLDivElement>(null)
  const [cabeNaFita, setCabeNaFita] = useState(24)
  useEffect(() => {
    const el = fita.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const medir = () => setCabeNaFita(Math.max(1, Math.floor((el.clientWidth + FITA.vao) / (FITA.lado + FITA.vao))) * FITA.linhas)
    medir()
    const ro = new ResizeObserver(medir); ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const naFita = estat.recentes.slice(-cabeNaFita)
  const kind = TIPOS_DIGITO.find((t) => t.tipo === tipoSel)!

  // mantem o digito dentro do que o tipo aceita
  useEffect(() => {
    if (kind.usaDigito && !kind.digitosValidos.includes(digito)) {
      setDigito(kind.digitosValidos[Math.floor(kind.digitosValidos.length / 2)])
    }
  }, [kind, digito])

  // Mudou o tipo, o digito ou a duracao: a confirmacao em conta real cai.
  useEffect(() => { onDesarmar() }, [tipoSel, digito, ticks]) // eslint-disable-line react-hooks/exhaustive-deps

  // cotacao ao vivo (conexao publica, nao exige login)
  useEffect(() => {
    if (!symbol) return
    let vivo = true
    const id = setTimeout(async () => {
      setCotando(true)
      setErroCotacao(null)
      try {
        const conexao = socket ?? publicSocket
        const res = await conexao.send({
          proposal: 1, amount: stake, basis: 'stake', currency: moeda,
          contract_type: tipoSel, duration: ticks, duration_unit: 't',
          underlying_symbol: symbol,
          ...(kind.usaDigito ? { barrier: String(digito) } : {}),
        })
        if (!vivo) return
        setPayout(Number((res.proposal as any).payout))
      } catch (e) {
        if (!vivo) return
        setPayout(null)
        setErroCotacao(traduzirErro((e as Error).message))
      } finally {
        if (vivo) setCotando(false)
      }
    }, 350)
    return () => { vivo = false; clearTimeout(id) }
  }, [symbol, stake, moeda, tipoSel, digito, ticks, kind.usaDigito, socket])

  const lucro = payout !== null ? payout - stake : null
  const chance = chanceTeorica(kind, digito)
  const ganhaCom = useMemo(() => {
    const alvo = new Set<number>()
    for (let d = 0; d <= 9; d++) {
      if (tipoSel === 'DIGITOVER' && d > digito) alvo.add(d)
      if (tipoSel === 'DIGITUNDER' && d < digito) alvo.add(d)
      if (tipoSel === 'DIGITMATCH' && d === digito) alvo.add(d)
      if (tipoSel === 'DIGITDIFF' && d !== digito) alvo.add(d)
      if (tipoSel === 'DIGITEVEN' && d % 2 === 0) alvo.add(d)
      if (tipoSel === 'DIGITODD' && d % 2 === 1) alvo.add(d)
    }
    return alvo
  }, [tipoSel, digito])

  const maxPct = Math.max(...estat.pct, 1)

  return (
    <div className="dig">
      {/* ---------- ultimo digito e fita recente ---------- */}
      <div className="dig-agora">
        <div className="dig-atual">
          <span className="rot">Último dígito</span>
          <strong className={estat.ultimo !== null && ganhaCom.has(estat.ultimo) ? 'ganho' : ''}>
            {estat.ultimo ?? '—'}
          </strong>
        </div>
        <div className="dig-fita" ref={fita}>
          {naFita.map((d, i) => (
            <span key={i} className={`fita-d ${ganhaCom.has(d) ? 'alvo' : ''} ${i === naFita.length - 1 ? 'ultimo' : ''}`}>
              {d}
            </span>
          ))}
        </div>
      </div>

      {/* ---------- distribuicao ---------- */}
      <div className="dig-sec">
        <div className="dig-sec-topo">
          <span className="rot">Frequência dos dígitos (%)</span>
          <div className="segmented mini">
            {JANELAS.map((j) => (
              <button key={j} className={janela === j ? 'on' : ''} onClick={() => setJanela(j)}>{j}</button>
            ))}
          </div>
        </div>
        <div className="dig-barras">
          {estat.pct.map((p, d) => (
            <button
              key={d}
              className={`dig-barra ${ganhaCom.has(d) ? 'alvo' : ''} ${kind.usaDigito && d === digito ? 'sel' : ''}`}
              onClick={() => kind.usaDigito && kind.digitosValidos.includes(d) && setDigito(d)}
              title={`${estat.conta[d]} vezes em ${estat.total}`}
              disabled={!kind.usaDigito || !kind.digitosValidos.includes(d)}
            >
              <span className="col" style={{ height: `${(p / maxPct) * 100}%` }} />
              <em>{pctBarra(p)}</em>
              <b>{d}</b>
            </button>
          ))}
        </div>
        <p className="dig-nota">
          {estat.carregando ? 'Lendo o histórico…' : `Últimas ${estat.total} cotações · cada dígito tende a 10% no longo prazo`}
        </p>
      </div>

      {/* ---------- tipo de operação ---------- */}
      <div className="dig-sec">
        <span className="rot">Tipo de operação</span>
        <div className="dig-tipos">
          {TIPOS_DIGITO.map((t) => (
            <button key={t.tipo} className={tipoSel === t.tipo ? 'on' : ''} onClick={() => setTipoSel(t.tipo)}>
              {t.nome}
            </button>
          ))}
        </div>
      </div>

      {kind.usaDigito && (
        <div className="dig-sec">
          <span className="rot">Dígito</span>
          <div className="dig-escolha">
            {[0,1,2,3,4,5,6,7,8,9].map((d) => (
              <button
                key={d}
                disabled={!kind.digitosValidos.includes(d)}
                className={d === digito ? 'on' : ''}
                onClick={() => setDigito(d)}
              >{d}</button>
            ))}
          </div>
        </div>
      )}

      <div className="dig-sec">
        <span className="rot">Duração</span>
        <div className="dig-ticks">
          {[1,2,3,4,5,6,7,8,9,10].map((t) => (
            <button key={t} className={ticks === t ? 'on' : ''} onClick={() => setTicks(t)}>{t}</button>
          ))}
        </div>
        <p className="dig-nota">Em ticks: cada tick é uma nova cotação.</p>
      </div>

      {/* ---------- resumo e compra ---------- */}
      <div className="dig-resumo">
        <p className="dig-frase">
          Resultado positivo se <strong>{kind.descricao(digito)}</strong> depois de {ticks} {ticks === 1 ? 'tick' : 'ticks'}.
        </p>
        {/* 26/10/2026: em lista (nome à esquerda, valor à direita). Lado a lado, os três não cabiam e quebravam em várias linhas. */}
        <dl className="dig-numeros">
          <div>
            <dt>Chance teórica</dt>
            <dd>{chance}%</dd>
          </div>
          <div>
            <dt>Se ganhar, recebe</dt>
            <dd>{payout !== null ? dinheiro(payout, moeda) : erroCotacao ? '—' : '…'}</dd>
          </div>
          <div className="lucro">
            <dt>Lucro</dt>
            <dd className={lucro !== null && lucro > 0 ? 'ganho' : ''}>
              {lucro !== null ? dinheiroComSinal(lucro, moeda) : '—'}
              {lucro !== null && stake > 0 && <small>{((lucro / stake) * 100).toFixed(0)}%</small>}
            </dd>
          </div>
        </dl>
        {erroCotacao && <p className="dig-erro">{erroCotacao}</p>}
        {!logado ? (
          <button type="button" className="btn btn-dig" onClick={props.onConectarDeriv} disabled={!props.onConectarDeriv}>Conectar a Deriv</button>
        ) : (<>
          {motivoBloqueio && !comprando && <p className="dig-erro" role="status">{motivoBloqueio}</p>}
          <button
            className={`btn btn-dig ${confirmando === tipoSel ? 'btn-confirmar' : ''}`}
            disabled={!podeOperar || comprando || cotando || payout === null}
            onClick={() => onComprar(tipoSel, kind.usaDigito ? String(digito) : undefined, ticks)}
          >
            {comprando
              ? 'Enviando…'
              : confirmando === tipoSel
                ? `${TOQUE ? 'Toque' : 'Clique'} de novo para confirmar ${dinheiro(stake, moeda)}${props.semDizerReal ? '' : ' · Dinheiro real'}`
                : `Comprar por ${dinheiro(stake, moeda)}`}
          </button>
        </>)}
      </div>
    </div>
  )
}
