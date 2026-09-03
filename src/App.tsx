import { useEffect, useMemo, useState } from 'react'
import { PriceChart, type ChartMode, type ContractMarker } from './components/PriceChart'
import { PositionCard } from './components/PositionCard'
import { DigitsPanel } from './components/DigitsPanel'
import { ManagementPanel } from './components/ManagementPanel'
import { RobotsPanel } from './components/RobotsPanel'
import { OperationsPanel } from './components/OperationsPanel'
import { AulasPanel } from './components/AulasPanel'
import { OperationalManagementPanel } from './components/OperationalManagementPanel'
import { MarketplacePanel } from './components/MarketplacePanel'
import { AccountSwitcher } from './components/AccountSwitcher'
import { UserMenu } from './components/UserMenu'
import { ProfilePanel } from './components/ProfilePanel'
import { DerivNome, IconeElo } from './components/DerivMarca'
import { Brand } from './components/Brand'
import { LoginScreen } from './components/LoginScreen'
import { NovaSenha } from './components/NovaSenha'
import { AFILIADO } from './core/deriv/config'
import { startLogin } from './core/deriv/auth'
import type { DigitContract } from './core/deriv/digits'
import { useCandleSeries, useConnection, useLiveTick, useProposal, useSymbols } from './hooks/useMarket'
import { useAccount } from './hooks/useAccount'
import { registrarContaDeriv, registrarPresenca } from './core/teeds/clientes'
import { useTeedsAuth } from './hooks/useTeedsAuth'
import { aplicarTema, temaGuardado, type Tema } from './core/tema'
import { DerivDesconectada } from './components/DerivDesconectada'
import type { Granularity } from './core/deriv/types'
import { formatPrice } from './core/chart/scales'
import { buyFromProposal, requestProposal, sellContract } from './core/deriv/trading'

const INDICADORES = [
  { id: 'sma', label: 'Média 20', titulo: 'Média móvel simples de 20 períodos' },
  { id: 'ema', label: 'EMA 50', titulo: 'Média móvel exponencial de 50 períodos' },
  { id: 'bollinger', label: 'Bollinger', titulo: 'Bandas de Bollinger de 20 períodos' },
  { id: 'rsi', label: 'RSI 14', titulo: 'Índice de força relativa de 14 períodos' },
  { id: 'macd', label: 'MACD', titulo: 'Convergência e divergência de médias móveis' },
  { id: 'fibonacci', label: 'Fibonacci', titulo: 'Retração de Fibonacci entre a mínima e a máxima visíveis' },
] as const

const TIMEFRAMES: { label: string; value: Granularity }[] = [
  { label: '1m', value: 60 }, { label: '5m', value: 300 }, { label: '15m', value: 900 },
  { label: '1h', value: 3600 }, { label: '4h', value: 14400 }, { label: '1d', value: 86400 },
]

const STATUS_LABEL: Record<string, string> = {
  idle: 'Iniciando', connecting: 'Conectando', open: 'Ao vivo',
  reconnecting: 'Reconectando', closed: 'Desconectado',
}

export default function App() {
  const connection = useConnection()
  const { symbols, loading: loadingSymbols, error: symbolsError } = useSymbols()
  const conta = useAccount()
  const teeds = useTeedsAuth()
  const [verPerfil, setVerPerfil] = useState(false)
  const [tema, setTema] = useState<Tema>(temaGuardado)
  const alternarTema = () => {
    const novo = tema === 'claro' ? 'escuro' : 'claro'
    setTema(novo)
    aplicarTema(novo)
  }

  const [selected, setSelected] = useState<string | null>(null)
  const [granularity, setGranularity] = useState<Granularity>(60)
  const [mode, setMode] = useState<ChartMode>('candles')
  const [indicadores, setIndicadores] = useState<string[]>(['sma'])
  const [search, setSearch] = useState('')
  const [seletorAtivo, setSeletorAtivo] = useState(false)
  const [posicoesAbertas, setPosicoesAbertas] = useState(true)
  const [stake, setStake] = useState(10)
  const [duration, setDuration] = useState(5)
  const [comprando, setComprando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [confirmar, setConfirmar] = useState<'CALL' | 'PUT' | null>(null)
  const [vendendo, setVendendo] = useState<number | null>(null)
  const [modo, setModo] = useState<'direcao' | 'digitos'>('direcao')
  const [tela, setTela] = useState<'operar' | 'robos' | 'operacoes' | 'gestao' | 'gerenciamento' | 'marketplace' | 'aulas'>('operar')
  const [payoutBase, setPayoutBase] = useState(19.55)

  const activeSymbol = useMemo(() => {
    if (selected) return symbols.find((s) => s.symbol === selected) ?? null
    return symbols.find((s) => s.isOpen && !s.isSuspended) ?? symbols[0] ?? null
  }, [symbols, selected])

  const symbolCode = activeSymbol?.symbol ?? null
  const { candles, loading: loadingCandles } = useCandleSeries(symbolCode, granularity)
  const { tick, direction } = useLiveTick(symbolCode)

  const call = useProposal({
    symbol: symbolCode, contractType: 'CALL', amount: stake,
    duration, durationUnit: 'm', socket: conta.socket,
    currency: conta.account?.currency ?? 'USD',
  })
  const put = useProposal({
    symbol: symbolCode, contractType: 'PUT', amount: stake,
    duration, durationUnit: 'm', socket: conta.socket,
    currency: conta.account?.currency ?? 'USD',
  })

  // referencia sem markup, para o simulador do painel de gestao
  const semMarkup = useProposal({
    symbol: symbolCode, contractType: 'CALL', amount: 10,
    duration: 5, durationUnit: 'm', enabled: tela === 'gestao',
  })
  useEffect(() => {
    if (semMarkup.payout) setPayoutBase(semMarkup.payout)
  }, [semMarkup.payout])

  // ------------------------------------------------------------------
  // Cadastro de clientes no Supabase: registra a presenca de quem abriu
  // a plataforma logado e cada conta Deriv que conectou. Falha em
  // silencio — o cadastro e util, nunca condicao para operar.
  // ------------------------------------------------------------------
  const usuarioTeedsId = teeds.sessao?.usuario.id ?? null
  useEffect(() => {
    if (!teeds.sessao) return
    void registrarPresenca(teeds.sessao)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId])

  useEffect(() => {
    if (!teeds.sessao || !conta.account) return
    void registrarContaDeriv(teeds.sessao, conta.account)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId, conta.account?.accountId])

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = term
      ? symbols.filter((s) => s.name.toLowerCase().includes(term) || s.symbol.toLowerCase().includes(term))
      : symbols
    const map = new Map<string, typeof filtered>()
    for (const s of filtered) {
      const key = s.market || 'outros'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(s)
    }
    return [...map.entries()]
  }, [symbols, search])

  const pipSize = activeSymbol?.pipSize ?? tick?.pipSize ?? 2
  const price = tick?.quote ?? (candles.length ? candles[candles.length - 1].close : null)
  const doAtivo = useMemo(
    () => conta.contracts.filter((c) => c.symbol === symbolCode),
    [conta.contracts, symbolCode],
  )
  // memorizado por assinatura: o grafico so redesenha quando algo muda de verdade
  const chaveMarcadores = doAtivo
    .map((c) => `${c.contractId}:${c.entrySpot}:${c.expiryTime}:${c.profit.toFixed(2)}`)
    .join('|')
  const marcadores: ContractMarker[] = useMemo(
    () =>
      doAtivo.map((c) => ({
        id: c.contractId, type: c.contractType, entryEpoch: c.startTime,
        entryPrice: c.entrySpot, expiryEpoch: c.expiryTime, profit: c.profit,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chaveMarcadores],
  )
  const investido = conta.contracts.reduce((t, c) => t + c.buyPrice, 0)
  const resultadoAberto = conta.contracts.reduce((t, c) => t + c.profit, 0)

  const podeOperar = conta.status === 'logado' && !!conta.socket && !conta.connecting && !!symbolCode

  async function comprarDigito(tipo: DigitContract, barreira: string | undefined, ticks: number) {
    await executar(tipo, { duration: ticks, durationUnit: 't', barrier: barreira })
  }

  async function comprar(tipo: 'CALL' | 'PUT') {
    if (!conta.isDemo && confirmar !== tipo) { setConfirmar(tipo); return }
    setConfirmar(null)
    await executar(tipo, { duration, durationUnit: 'm' })
  }

  async function executar(
    tipo: string,
    extra: { duration: number; durationUnit: string; barrier?: string },
  ) {
    if (!conta.socket || !symbolCode) return
    setComprando(tipo)
    setAviso(null)
    try {
      const p = await requestProposal(conta.socket, {
        symbol: symbolCode, contractType: tipo, amount: stake,
        currency: conta.account?.currency ?? 'USD', ...extra,
      })
      const r = await buyFromProposal(conta.socket, p.id, p.askPrice)
      setAviso({ tipo: 'ok', texto: `Comprado por ${r.buyPrice.toFixed(2)} — pagamento potencial ${r.payout.toFixed(2)}` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setComprando(null)
    }
  }

  async function vender(contractId: number) {
    if (!conta.socket) return
    setVendendo(contractId)
    setAviso(null)
    try {
      const r = await sellContract(conta.socket, contractId, 0)
      setAviso({ tipo: 'ok', texto: `Vendido por ${r.soldFor.toFixed(2)}` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally {
      setVendendo(null)
    }
  }

  // ------------------------------------------------------------------
  // São dois logins. Este é o primeiro: a conta da Teeds, que abre a
  // plataforma. Conectar a Deriv é o segundo, e só faz falta na hora de
  // operar de verdade.
  // ------------------------------------------------------------------
  if (teeds.status === 'carregando') {
    return <div className="entrada"><div className="entrada-esperando">abrindo a Teeds…</div></div>
  }

  if (teeds.redefinindo) {
    return (
      <NovaSenha ocupado={teeds.ocupado} erro={teeds.erro} onDefinir={teeds.definirNovaSenha} />
    )
  }

  if (teeds.status === 'deslogado') {
    return (
      <LoginScreen
        ocupado={teeds.ocupado}
        erro={teeds.erro}
        limparErro={() => teeds.setErro(null)}
        onEntrar={teeds.entrar}
        onCadastrar={teeds.cadastrar}
        onEsqueci={teeds.esqueci}
      />
    )
  }

  const derivPronta = conta.status === 'logado'

  return (
    <div className="app">
      <header className="topbar">
        <button className="marca-inicio" onClick={() => {
          setTela('operar')
          setVerPerfil(false)
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }} aria-label="Voltar para a tela inicial" title="Ir para o início">
          <Brand />
        </button>

        <nav className="telas">
          <button className={tela === 'operar' ? 'on' : ''} onClick={() => setTela('operar')}>Operar</button>
          <button className={tela === 'robos' ? 'on' : ''} onClick={() => setTela('robos')}>Robôs</button>
          <button className={tela === 'operacoes' ? 'on' : ''} onClick={() => setTela('operacoes')}>Operações</button>
          <button className={tela === 'gestao' ? 'on' : ''} onClick={() => setTela('gestao')}>Gestão</button>
          <button className={tela === 'gerenciamento' ? 'on' : ''} onClick={() => setTela('gerenciamento')}>Gerenciamento Operacional</button>
          <button className={tela === 'marketplace' ? 'on' : ''} onClick={() => setTela('marketplace')}>Marketplace</button>
          <button className={tela === 'aulas' ? 'on' : ''} onClick={() => setTela('aulas')}>Aulas</button>
        </nav>

        <div className="topbar-right">
          {!derivPronta && (
            <button className="btn-deriv" onClick={conta.login}
              disabled={conta.status === 'entrando'}>
              <IconeElo />
              {conta.status === 'entrando' ? 'Abrindo…' : <>Conectar <DerivNome tamanho={13} /></>}
            </button>
          )}

          {conta.status === 'logado' && conta.accounts.length > 0 && (
            <AccountSwitcher
              contas={conta.accounts}
              selecionada={conta.accountId}
              isDemo={conta.isDemo}
              saldo={conta.balance ? conta.balance.amount : null}
              moeda={conta.balance?.currency ?? conta.account?.currency ?? 'USD'}
              conectando={conta.connecting}
              onTrocar={conta.setAccountId}
              onRecarregar={() => conta.recarregarDemo()}
              onSair={conta.logout}
            />
          )}

          <button className="tema-btn" onClick={alternarTema}
            title={tema === 'claro' ? 'Mudar para o modo escuro' : 'Mudar para o modo claro'}
            aria-label="alternar tema">
            {tema === 'claro' ? <IconeLua /> : <IconeSol />}
          </button>

          {/* Conectado, o que importa e a conexao da conta: e por ela que o
              saldo anda e os robos operam. */}
          {(() => {
            const alvo = derivPronta ? conta.conexao : connection
            return (
              <div className={`status status-${alvo}`} title={
                derivPronta ? 'conexão da sua conta na Deriv' : 'conexão de mercado'
              }>
                <i /> {STATUS_LABEL[alvo] ?? alvo}
              </div>
            )
          })()}

          {teeds.usuario && (
            <UserMenu usuario={teeds.usuario} onSair={() => void teeds.sair()}
              onPerfil={() => setVerPerfil(true)} />
          )}
        </div>
      </header>

      {verPerfil && teeds.sessao && (
        <ProfilePanel
          sessao={teeds.sessao}
          contas={conta.accounts}
          derivConectada={conta.status === 'logado'}
          onConectarDeriv={conta.login}
          onAtualizar={teeds.atualizarUsuario}
          onFechar={() => setVerPerfil(false)} />
      )}

      {teeds.recado && (
        <div className="faixa faixa-ok">
          {teeds.recado}
          <button onClick={() => teeds.setRecado(null)}>fechar</button>
        </div>
      )}

      {conta.aviso && (
        <div className="faixa faixa-ok">
          {conta.aviso}
          <button onClick={() => conta.setAviso(null)}>fechar</button>
        </div>
      )}

      {conta.error && (
        <div className="faixa faixa-erro">
          {conta.error}
          <button onClick={() => conta.setError(null)}>fechar</button>
        </div>
      )}

      {/* Os robôs vivem FORA da troca de telas: mudar de aba não pode
          desligar um motor no meio de uma recuperação de martingale.
          A tela apenas se esconde — o motor continua operando. */}
      <div className="tela-viva" hidden={tela !== 'robos'}>
        <RobotsPanel
          socket={conta.socket}
          logado={conta.status === 'logado'}
          isDemo={conta.isDemo}
          moeda={conta.account?.currency ?? 'USD'}
          symbols={symbols}
          symbolPadrao={symbolCode}
          conexao={conta.conexao}
          entrandoNaDeriv={conta.status === 'entrando'}
          onConectarDeriv={conta.login}
        />
      </div>
      {tela === 'robos' ? null : tela === 'operacoes' ? (
        <OperationsPanel
          socket={conta.socket}
          logado={conta.status === 'logado'}
          moeda={conta.account?.currency ?? 'USD'}
          symbols={symbols}
          pulso={conta.pulso}
          entrandoNaDeriv={conta.status === 'entrando'}
          onConectarDeriv={conta.login}
        />
      ) : tela === 'aulas' ? (
        <AulasPanel nome={teeds.usuario?.nome} />
      ) : tela === 'marketplace' ? (
        <MarketplacePanel />
      ) : tela === 'gerenciamento' ? (
        <OperationalManagementPanel moeda={conta.account?.currency ?? 'USD'} />
      ) : tela === 'gestao' ? (
        <ManagementPanel
          session={conta.session}
          sessaoTeeds={teeds.sessao}
          contaId={conta.accountId}
          socket={conta.socket}
          isDemo={conta.isDemo}
          onReautorizar={() => startLogin()}
          payoutBase={payoutBase}
          moeda={conta.account?.currency ?? 'USD'}
          pulso={conta.pulso}
          entrandoNaDeriv={conta.status === 'entrando'}
          onConectarDeriv={conta.login}
        />
      ) : (
      <div className="layout layout-operar">
        <main className="main">
          <div className="chart-head">
            <div className="chart-title">
              <div className="ativo-seletor-wrap">
                <button className="ativo-seletor" onClick={() => setSeletorAtivo((aberto) => !aberto)}
                  aria-expanded={seletorAtivo} aria-haspopup="dialog">
                  <span>{activeSymbol?.name ?? 'Escolher ativo'}</span><i aria-hidden>⌄</i>
                </button>
                {seletorAtivo && (
                  <div className="ativo-menu" role="dialog" aria-label="Escolher ativo">
                    <div className="ativo-menu-topo">
                      <b>Trocar ativo</b>
                      <button onClick={() => setSeletorAtivo(false)} aria-label="Fechar seletor">×</button>
                    </div>
                    <input className="search" autoFocus placeholder="Buscar ativo…" value={search}
                      onChange={(e) => setSearch(e.target.value)} />
                    <div className="symbol-list">
                      {loadingSymbols && <p className="hint">carregando ativos…</p>}
                      {symbolsError && <p className="hint error">{symbolsError}</p>}
                      {groups.map(([market, list]) => (
                        <section key={market}>
                          <h4>{market.replace(/_/g, ' ')}</h4>
                          {list.map((s) => (
                            <button key={s.symbol}
                              className={`symbol ${s.symbol === symbolCode ? 'is-active' : ''}`}
                              onClick={() => { setSelected(s.symbol); setSeletorAtivo(false); setSearch('') }}>
                              <span className="sym-name">{s.name}</span>
                              <span className={`dot ${s.isOpen && !s.isSuspended ? 'on' : 'off'}`} />
                            </button>
                          ))}
                        </section>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {price !== null && <span className={`price ${direction ?? ''}`}>{formatPrice(price, pipSize)}</span>}
            </div>
            <div className="controls">
              <div className="segmented">
                {TIMEFRAMES.map((tf) => (
                  <button key={tf.value} className={granularity === tf.value ? 'on' : ''}
                    onClick={() => setGranularity(tf.value)}>{tf.label}</button>
                ))}
              </div>
              <div className="segmented">
                <button className={mode === 'candles' ? 'on' : ''} onClick={() => setMode('candles')}>Velas</button>
                <button className={mode === 'line' ? 'on' : ''} onClick={() => setMode('line')}>Linha</button>
              </div>
            </div>
          </div>

          <div className="indicadores" aria-label="Indicadores do gráfico">
            <span>Indicadores</span>
            <div>
              {INDICADORES.map((item) => {
                const ativo = indicadores.includes(item.id)
                return <button key={item.id} className={ativo ? 'on' : ''} title={item.titulo}
                  aria-pressed={ativo} onClick={() => setIndicadores((atuais) =>
                    ativo ? atuais.filter((id) => id !== item.id) : [...atuais, item.id])}>
                  <i />{item.label}
                </button>
              })}
            </div>
          </div>

          <PriceChart candles={candles} mode={mode} pipSize={pipSize}
            symbolName={activeSymbol?.name ?? ''} loading={loadingCandles}
            markers={marcadores} indicators={indicadores} />
        </main>

        <aside className="trade">
          {!derivPronta && (
            <DerivDesconectada compacto
              acao="O gráfico e os dígitos são públicos, mas comprar exige a sua conta."
              entrando={conta.status === 'entrando'}
              onConectar={conta.login} />
          )}

          <div className="modo-troca">
            <button className={modo === 'direcao' ? 'on' : ''} onClick={() => setModo('direcao')}>
              Subir / Descer
            </button>
            <button className={modo === 'digitos' ? 'on' : ''} onClick={() => setModo('digitos')}>
              Dígitos
            </button>
          </div>

          <label className="field"><span>Valor</span>
            <div className="input-wrap"><em>US$</em>
              <input type="number" min={1} value={stake}
                onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 0))} />
            </div>
          </label>

          {modo === 'direcao' ? (
            <>
              <label className="field"><span>Duração</span>
                <div className="input-wrap">
                  <input type="number" min={1} value={duration}
                    onChange={(e) => setDuration(Math.max(1, Number(e.target.value) || 0))} />
                  <em>min</em>
                </div>
              </label>

              <div className="quotes">
                <QuoteCard kind="up" title="Acima" action="Comprar" payout={call.payout} stake={stake}
                  loading={call.loading} error={call.error} podeOperar={podeOperar}
                  comprando={comprando === 'CALL'} confirmando={confirmar === 'CALL'}
                  onBuy={() => comprar('CALL')} logado={conta.status === 'logado'} />
                <QuoteCard kind="down" title="Abaixo" action="Vender" payout={put.payout} stake={stake}
                  loading={put.loading} error={put.error} podeOperar={podeOperar}
                  comprando={comprando === 'PUT'} confirmando={confirmar === 'PUT'}
                  onBuy={() => comprar('PUT')} logado={conta.status === 'logado'} />
              </div>
            </>
          ) : (
            <DigitsPanel
              symbol={symbolCode}
              pipSize={pipSize}
              stake={stake}
              moeda={conta.account?.currency ?? 'USD'}
              podeOperar={podeOperar}
              logado={conta.status === 'logado'}
              comprando={!!comprando && comprando.startsWith('DIGIT')}
              socket={conta.socket}
              onComprar={comprarDigito}
            />
          )}

          <section className={`posicoes-flutuantes posicoes-na-operacao ${posicoesAbertas ? 'aberto' : 'fechado'}`}
            aria-label="Posições abertas">
            <button className="pos-flutuante-topo" onClick={() => setPosicoesAbertas((aberto) => !aberto)}
              aria-expanded={posicoesAbertas}>
              <span><i className={conta.contracts.length ? 'vivo' : ''} />
                {conta.contracts.length === 0
                  ? 'Nenhuma posição'
                  : `${conta.contracts.length} ${conta.contracts.length === 1 ? 'posição' : 'posições'}`}
              </span>
              {conta.contracts.length > 0 && (
                <strong className={resultadoAberto >= 0 ? 'ganho' : 'perda'}>
                  {resultadoAberto >= 0 ? '+' : '−'}{Math.abs(resultadoAberto).toFixed(2)}
                </strong>
              )}
              <em>{posicoesAbertas ? '−' : '+'}</em>
            </button>
            {posicoesAbertas && (
              <div className="pos-flutuante-corpo">
                {conta.contracts.length > 0 && (
                  <div className="pos-resumo">
                    <span>Investido <b>{conta.account?.currency ?? 'USD'} {investido.toFixed(2)}</b></span>
                  </div>
                )}
                {!derivPronta && <div className="pos-vazio">Conecte sua Deriv para acompanhar posições.</div>}
                {derivPronta && conta.contracts.length === 0 && (
                  <div className="pos-vazio">Suas operações aparecerão aqui.</div>
                )}
                {conta.contracts.map((c) => (
                  <PositionCard key={c.contractId} contrato={c}
                    nomeAtivo={symbols.find((s) => s.symbol === c.symbol)?.name ?? c.symbol}
                    onVender={vender} vendendo={vendendo === c.contractId} />
                ))}
              </div>
            )}
          </section>

          {aviso && (
            <p className={`aviso ${aviso.tipo === 'ok' ? 'aviso-ok' : 'aviso-erro'}`}>{aviso.texto}</p>
          )}

        </aside>
      </div>
      )}
    </div>
  )
}

function IconeLua() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

function IconeSol() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function QuoteCard(props: {
  kind: 'up' | 'down'; title: string; action: string; payout: number | null; stake: number
  loading: boolean; error: string | null; podeOperar: boolean; logado: boolean
  comprando: boolean; confirmando: boolean; onBuy: () => void
}) {
  const { kind, title, action, payout, stake, loading, error, podeOperar, logado, comprando, confirmando, onBuy } = props
  const lucro = payout !== null ? payout - stake : null
  const pct = payout !== null && stake > 0 ? ((payout - stake) / stake) * 100 : null

  return (
    <div className={`quote quote-${kind}`}>
      <div className="quote-head">
        <span className="arrow">{kind === 'up' ? '▲' : '▼'}</span><span>{title}</span>
      </div>
      {error ? <p className="quote-error">indisponível</p>
        : loading && payout === null ? <p className="quote-loading">…</p>
        : payout !== null ? (
          <>
            <strong>US$ {payout.toFixed(2)}</strong>
            <span className="quote-sub">lucro US$ {lucro?.toFixed(2)}{pct !== null && ` · ${pct.toFixed(0)}%`}</span>
          </>
        ) : <p className="quote-loading">—</p>}
      <button className={`btn ${confirmando ? 'btn-confirmar' : ''}`}
        disabled={!podeOperar || comprando} onClick={onBuy}>
        {comprando ? 'comprando…'
          : confirmando ? 'Confirmar (dinheiro real)'
          : !logado ? 'Entre para operar'
          : action}
      </button>
    </div>
  )
}
