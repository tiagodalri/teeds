import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { publicSocket } from '../core/deriv/client'
import {
  acompanharRobo, ligarRobo, listarRobos, matematica, MODELOS, pararRobo,
  pausarRobo, perdasAteOStop, retomarRobo,
  type ConfigRobo, type EstrategiaId, type ModeloRobo, type Robo,
} from '../core/deriv/robots'
import type { ActiveSymbol } from '../core/deriv/types'

interface Props {
  socket: TeedsSocket | null
  logado: boolean
  isDemo: boolean
  moeda: string
  symbols: ActiveSymbol[]
  symbolPadrao: string | null
}

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function RobotsPanel({ socket, logado, isDemo, moeda, symbols, symbolPadrao }: Props) {
  const [modelo, setModelo] = useState<ModeloRobo>(MODELOS[0])
  const [symbol, setSymbol] = useState<string>(symbolPadrao ?? '1HZ100V')
  const [valorInicial, setValorInicial] = useState(1)
  const [ticks, setTicks] = useState(1)
  const [estrategia, setEstrategia] = useState<EstrategiaId>('dalembert')
  const [multiplicador, setMultiplicador] = useState(2)
  const [unidade, setUnidade] = useState(1)
  const [valorMaximo, setValorMaximo] = useState(20)
  const [stopLoss, setStopLoss] = useState(20)
  const [takeProfit, setTakeProfit] = useState(20)
  const [maxContratos, setMaxContratos] = useState(50)

  const [robos, setRobos] = useState<Map<string, Robo>>(new Map())
  const [ligando, setLigando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmaReal, setConfirmaReal] = useState(false)
  const [pagamento, setPagamento] = useState<number | null>(null)

  useEffect(() => { if (symbolPadrao) setSymbol(symbolPadrao) }, [symbolPadrao])

  // cotacao do contrato configurado, para mostrar a matematica real
  useEffect(() => {
    let vivo = true
    const id = setTimeout(async () => {
      try {
        const conexao = socket ?? publicSocket
        const res = await conexao.send({
          proposal: 1, amount: valorInicial, basis: 'stake', currency: moeda,
          contract_type: modelo.contractType, duration: ticks, duration_unit: 't',
          underlying_symbol: symbol,
          ...(modelo.barreira !== undefined ? { barrier: String(modelo.barreira) } : {}),
        })
        if (vivo) setPagamento(Number((res.proposal as any).payout))
      } catch { if (vivo) setPagamento(null) }
    }, 400)
    return () => { vivo = false; clearTimeout(id) }
  }, [socket, modelo, symbol, ticks, valorInicial, moeda])

  // carrega e acompanha os robos existentes
  const carregar = useCallback(async () => {
    if (!socket) return
    try {
      const lista = await listarRobos(socket)
      setRobos(new Map(lista.map((r) => [r.runId, r])))
    } catch (e) { setErro((e as Error).message) }
  }, [socket])

  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!socket) return
    const ativos = [...robos.values()].filter((r) => r.status !== 'stopped')
    const paradas = ativos.map((r) =>
      acompanharRobo(socket, r.runId, (novo) =>
        setRobos((prev) => new Map(prev).set(novo.runId, novo)),
      ),
    )
    return () => paradas.forEach((p) => p())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, [...robos.keys()].join(',')])

  const mat = useMemo(
    () => (pagamento ? matematica(modelo.digitosQueGanham, pagamento, valorInicial) : null),
    [modelo, pagamento, valorInicial],
  )
  const risco = useMemo(
    () => perdasAteOStop(estrategia, valorInicial,
      estrategia === 'martingale' ? multiplicador : unidade, valorMaximo, stopLoss),
    [estrategia, valorInicial, multiplicador, unidade, valorMaximo, stopLoss],
  )

  async function ligar() {
    if (!socket) return
    if (!isDemo && !confirmaReal) { setConfirmaReal(true); return }
    setConfirmaReal(false)
    setLigando(true)
    setErro(null)
    const config: ConfigRobo = {
      modelo, symbol, moeda, valorInicial, ticks, estrategia,
      multiplicador, unidade, valorMaximo, stopLoss, takeProfit, maxContratos,
    }
    try {
      const r = await ligarRobo(socket, config)
      setRobos((prev) => new Map(prev).set(r.runId, r))
    } catch (e) { setErro((e as Error).message) }
    finally { setLigando(false) }
  }

  async function acao(runId: string, tipo: 'parar' | 'pausar' | 'retomar') {
    if (!socket) return
    try {
      const fn = tipo === 'parar' ? pararRobo : tipo === 'pausar' ? pausarRobo : retomarRobo
      const r = await fn(socket, runId)
      setRobos((prev) => new Map(prev).set(r.runId, r))
    } catch (e) { setErro((e as Error).message) }
  }

  const lista = [...robos.values()].sort((a, b) => b.inicio - a.inicio)
  const rodando = lista.filter((r) => r.status === 'running' || r.status === 'paused')

  if (!logado) {
    return <div className="ger-vazio"><h2>Robôs</h2><p>Entre com sua conta Deriv para criar robôs.</p></div>
  }

  return (
    <div className="ger rob">
      <div className="ger-topo">
        <div>
          <h2>Robôs</h2>
          <p className="ger-sub">
            Operam nos servidores da Deriv — continuam trabalhando com seu computador desligado.
          </p>
        </div>
        {!isDemo && <span className="badge badge-real">conta real selecionada</span>}
      </div>

      {erro && <div className="ger-erro">{erro}</div>}

      <div className="rob-grade">
        {/* ---------------- configuração ---------------- */}
        <section className="ger-bloco">
          <span className="rot">Escolha o robô</span>
          <div className="rob-modelos">
            {MODELOS.map((m) => (
              <button key={m.id} className={`rob-modelo ${m.cor} ${modelo.id === m.id ? 'on' : ''}`}
                onClick={() => setModelo(m)}>
                <b>{m.nome}</b>
                <span>{m.frase}</span>
              </button>
            ))}
          </div>

          <div className="rob-linha">
            <label><span className="rot">Ativo</span>
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {symbols.filter((s) => s.isOpen).map((s) => (
                  <option key={s.symbol} value={s.symbol}>{s.name}</option>
                ))}
              </select>
            </label>
            <label><span className="rot">Ticks</span>
              <select value={ticks} onChange={(e) => setTicks(Number(e.target.value))}>
                {[1,2,3,4,5,6,7,8,9,10].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label><span className="rot">Valor inicial</span>
              <input type="number" min={0.35} step={0.5} value={valorInicial}
                onChange={(e) => setValorInicial(Math.max(0.35, Number(e.target.value) || 0))} />
            </label>
          </div>

          <span className="rot" style={{ marginTop: 16 }}>Gestão de banca</span>
          <div className="rob-estrat">
            <button className={estrategia === 'dalembert' ? 'on' : ''} onClick={() => setEstrategia('dalembert')}>
              <b>D'Alembert</b><span>soma uma unidade após perder, tira uma após ganhar</span>
            </button>
            <button className={estrategia === 'martingale' ? 'on' : ''} onClick={() => setEstrategia('martingale')}>
              <b>Martingale</b><span>multiplica a aposta após cada perda</span>
            </button>
          </div>

          <div className="rob-linha">
            {estrategia === 'martingale' ? (
              <label><span className="rot">Multiplicador</span>
                <input type="number" min={1.1} step={0.1} value={multiplicador}
                  onChange={(e) => setMultiplicador(Math.max(1.1, Number(e.target.value) || 0))} /></label>
            ) : (
              <label><span className="rot">Unidade</span>
                <input type="number" min={0.1} step={0.1} value={unidade}
                  onChange={(e) => setUnidade(Math.max(0.1, Number(e.target.value) || 0))} /></label>
            )}
            <label><span className="rot">Aposta máxima</span>
              <input type="number" min={valorInicial} value={valorMaximo}
                onChange={(e) => setValorMaximo(Number(e.target.value) || 0)} /></label>
            <label><span className="rot">Máx. operações</span>
              <input type="number" min={0} value={maxContratos}
                onChange={(e) => setMaxContratos(Number(e.target.value) || 0)} /></label>
          </div>

          <span className="rot" style={{ marginTop: 16 }}>Freios obrigatórios</span>
          <div className="rob-linha">
            <label><span className="rot">Parar se perder</span>
              <input type="number" min={1} value={stopLoss}
                onChange={(e) => setStopLoss(Math.max(1, Number(e.target.value) || 0))} /></label>
            <label><span className="rot">Parar se ganhar</span>
              <input type="number" min={1} value={takeProfit}
                onChange={(e) => setTakeProfit(Math.max(1, Number(e.target.value) || 0))} /></label>
          </div>

          {confirmaReal && (
            <p className="rob-alerta">
              Você está na <strong>conta real</strong>. O robô vai operar com dinheiro de verdade.
              Clique de novo para confirmar.
            </p>
          )}

          <button className={`btn btn-ligar ${confirmaReal ? 'btn-confirmar' : ''}`}
            disabled={!socket || ligando} onClick={ligar}>
            {ligando ? 'ligando…' : confirmaReal ? 'Confirmar com dinheiro real' : `Ligar robô ${modelo.nome}`}
          </button>
        </section>

        {/* ---------------- a matemática, sem ilusão ---------------- */}
        <section className="ger-bloco rob-mat">
          <div className="ger-bloco-topo">
            <span className="rot">O que a matemática diz</span>
            <span className="ger-tag">cotação real da Deriv</span>
          </div>

          {mat ? (
            <>
              <div className="mat-linhas">
                <div><span>Chance de ganhar cada operação</span><b>{mat.chancePct.toFixed(0)}%</b></div>
                <div><span>Pagamento</span><b>{din(pagamento ?? 0, moeda)} ({mat.multiplicador.toFixed(2)}×)</b></div>
                <div className="destaque">
                  <span>Perda esperada por operação</span>
                  <b className="perda">−{din(mat.perdaEsperada, moeda)} ({mat.perdaEsperadaPct.toFixed(1)}%)</b>
                </div>
              </div>

              <p className="mat-texto">
                A cada {maxContratos || 100} operações, a expectativa matemática é perder cerca de{' '}
                <strong>{din(mat.perdaEsperada * (maxContratos || 100), moeda)}</strong>. Nenhuma gestão de
                banca muda isso — Martingale e D'Alembert alteram <em>quando</em> você ganha ou perde,
                nunca a expectativa.
              </p>

              <div className="mat-risco">
                <span className="rot">O que seu stop loss aguenta</span>
                <p>
                  <strong>{risco.perdasSuportadas} perdas seguidas</strong> antes de bater o freio
                  de {din(stopLoss, moeda)}.
                  {estrategia === 'martingale' && risco.perdasSuportadas <= 6 && (
                    <> Numa sequência de {risco.perdasSuportadas + 1} perdas — que acontece
                    com frequência real — a aposta já teria ido para {din(risco.proximaAposta, moeda)}.</>
                  )}
                </p>
              </div>
            </>
          ) : <p className="ger-nota">calculando…</p>}
        </section>
      </div>

      {/* ---------------- robôs em operação ---------------- */}
      <section className="ger-bloco">
        <div className="ger-bloco-topo">
          <span className="rot">Seus robôs</span>
          {rodando.length > 0 && <span className="ger-tag">{rodando.length} em operação</span>}
        </div>

        {lista.length === 0 && <p className="ger-nota">Nenhum robô criado ainda.</p>}

        <div className="rob-lista">
          {lista.map((r) => {
            const nome = MODELOS.find((m) => m.contractType === r.contrato.contract_type)?.nome
              ?? r.contrato.contract_type ?? '—'
            const ativo = r.status === 'running'
            return (
              <div key={r.runId} className={`rob-card ${r.status}`}>
                <div className="rob-card-topo">
                  <b>{nome}</b>
                  <span className={`rob-status ${r.status}`}>
                    {r.status === 'running' ? 'operando' : r.status === 'paused' ? 'pausado' : 'parado'}
                  </span>
                </div>
                <div className="rob-nums">
                  <div><span>Operações</span><b>{r.contratos}</b></div>
                  <div><span>Apostado</span><b>{din(r.totalApostado, moeda)}</b></div>
                  <div><span>Resultado</span>
                    <b className={r.resultado >= 0 ? 'ganho' : 'perda'}>
                      {r.resultado >= 0 ? '+' : '−'}{din(Math.abs(r.resultado), moeda)}
                    </b></div>
                </div>
                {r.motivoParada && (
                  <p className="rob-motivo">
                    parou: {r.motivoParada === 'user_stopped' ? 'você desligou'
                      : r.motivoParada === 'condition_triggered' ? 'bateu um dos freios'
                      : r.motivoParada}
                  </p>
                )}
                {r.status !== 'stopped' && (
                  <div className="rob-acoes">
                    {ativo
                      ? <button onClick={() => acao(r.runId, 'pausar')}>Pausar</button>
                      : <button onClick={() => acao(r.runId, 'retomar')}>Retomar</button>}
                    <button className="parar" onClick={() => acao(r.runId, 'parar')}>Desligar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
