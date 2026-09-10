import { useEffect, useMemo, useState } from 'react'
import { PriceChart, type ChartMode, type ContractMarker } from './components/PriceChart'
import { PositionCard } from './components/PositionCard'
import { DigitsPanel } from './components/DigitsPanel'
import { AdminPanel } from './components/AdminPanel'
import { ManagementPanel } from './components/ManagementPanel'
import { RobotsPanel } from './components/RobotsPanel'
import { WorkspaceNav, PAGE_NAMES, type WorkspacePage } from './components/WorkspaceNav'
import { AulasPanel } from './components/AulasPanel'
import { OperationalManagementPanel } from './components/OperationalManagementPanel'
import { MarketplacePanel } from './components/MarketplacePanel'
import { AccountSwitcher } from './components/AccountSwitcher'
import { UserMenu } from './components/UserMenu'
import { ProfilePanel } from './components/ProfilePanel'
import { DerivNome, IconeElo } from './components/DerivMarca'
import { LoginScreen } from './components/LoginScreen'
import { NovaSenha } from './components/NovaSenha'
import { startLogin } from './core/deriv/auth'
import type { DigitContract } from './core/deriv/digits'
import { useCandleSeries, useConnection, useLimitesDuracao, useLiveTick, useProposal, useSymbols } from './hooks/useMarket'
import { traduzirErro } from './core/deriv/erros'
import { useAccount } from './hooks/useAccount'
import { registrarContaDeriv, registrarPresenca, souAdmin } from './core/teeds/clientes'
import { entregarAutorizacao } from './core/teeds/servidorRobos'
import { AssistentePanel } from './components/AssistentePanel'
import { AssistenteBetaGate } from './components/AssistenteBetaGate'
import { useTeedsAuth } from './hooks/useTeedsAuth'
import { aplicarTema, temaGuardado, type Tema } from './core/tema'
import { DerivDesconectada } from './components/DerivDesconectada'
import type { Granularity } from './core/deriv/types'
import { formatPrice } from './core/chart/scales'
import { buyFromProposal, requestProposal, sellContract } from './core/deriv/trading'
import { MARCA } from './marca'

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

/** Ids dos contratos comprados nesta tela, por conta — para separar do que os robos fazem. */
const chaveManuais = (contaId: string) => `${MARCA.id}.posicoes-manuais.${contaId}`
function lerManuais(contaId: string | null): number[] {
  try {
    if (!contaId) return []
    const lista = JSON.parse(sessionStorage.getItem(chaveManuais(contaId)) || '[]')
    return Array.isArray(lista) ? lista.filter((n) => Number.isFinite(n)) : []
  } catch { return [] }
}

function assistenteBetaJaLiberado() {
  try { return sessionStorage.getItem(`assistente-beta:${MARCA.id}`) === 'liberado' }
  catch { return false }
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
  const [unidade, setUnidade] = useState<'t' | 's' | 'm'>('m')
  const [comprando, setComprando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  // Em conta real o primeiro clique arma e o segundo compra; guarda o tipo armado.
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [vendendo, setVendendo] = useState<number | null>(null)
  const [modo, setModo] = useState<'direcao' | 'digitos'>('direcao')
  const [tela, setTela] = useState<WorkspacePage>('operar')
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [pedirCodigoAssistente, setPedirCodigoAssistente] = useState(false)
  const [assistenteLiberado, setAssistenteLiberado] = useState(assistenteBetaJaLiberado)
  const [payoutBase, setPayoutBase] = useState(19.55)

  const activeSymbol = useMemo(() => {
    if (selected) return symbols.find((s) => s.symbol === selected) ?? null
    return symbols.find((s) => s.isOpen && !s.isSuspended) ?? symbols[0] ?? null
  }, [symbols, selected])

  const symbolCode = activeSymbol?.symbol ?? null
  const { candles, loading: loadingCandles } = useCandleSeries(symbolCode, granularity)
  const { tick, direction } = useLiveTick(symbolCode)
  const limites = useLimitesDuracao(symbolCode)
  const moeda = conta.account?.currency ?? 'USD'

  // A duracao obedece ao que a Deriv aceita neste ativo, na unidade escolhida.
  const faixa = unidade === 't' ? limites.ticks : unidade === 's' ? limites.segundos : limites.minutos
  const dentroDaFaixa = (d: number) =>
    faixa ? Math.min(faixa[1], Math.max(faixa[0], Math.round(d) || faixa[0])) : Math.max(1, Math.round(d) || 1)
  useEffect(() => { setDuration(dentroDaFaixa) }, [faixa]) // eslint-disable-line react-hooks/exhaustive-deps
  const trocarUnidade = (u: 't' | 's' | 'm') => {
    setUnidade(u)
    setDuration(u === 't' ? 5 : u === 's' ? 60 : 5)
  }

  /*
    A confirmacao em conta real desarma sozinha: ao mudar valor, duracao,
    modo ou ativo, e depois de alguns segundos parada. Antes ficava armada
    para sempre — dava para trocar 10 por 1.000 e comprar sem confirmar de novo.
  */
  useEffect(() => { setConfirmar(null) }, [stake, duration, unidade, modo, symbolCode])
  useEffect(() => {
    if (!confirmar) return
    const t = setTimeout(() => setConfirmar(null), 8_000)
    return () => clearTimeout(t)
  }, [confirmar])

  // Boa noticia nao precisa ficar na tela; erro fica ate a proxima acao.
  useEffect(() => {
    if (!aviso || aviso.tipo !== 'ok') return
    const t = setTimeout(() => setAviso(null), 6_000)
    return () => clearTimeout(t)
  }, [aviso])

  const call = useProposal({
    symbol: symbolCode, contractType: 'CALL', amount: stake,
    duration, durationUnit: unidade, socket: conta.socket, currency: moeda,
  })
  const put = useProposal({
    symbol: symbolCode, contractType: 'PUT', amount: stake,
    duration, durationUnit: unidade, socket: conta.socket, currency: moeda,
  })

  const semMarkup = useProposal({
    symbol: symbolCode, contractType: 'CALL', amount: 10,
    duration: 5, durationUnit: 'm', enabled: tela === 'gestao',
  })
  useEffect(() => { if (semMarkup.payout) setPayoutBase(semMarkup.payout) }, [semMarkup.payout])

  // ------------------------------------------------------------------
  // Cadastro de clientes no Supabase: registra a presenca de quem abriu
  // a plataforma logado e cada conta Deriv que conectou. Falha em
  // silencio — o cadastro e util, nunca condicao para operar.
  // ------------------------------------------------------------------
  const usuarioTeedsId = teeds.sessao?.usuario.id ?? null
  useEffect(() => {
    if (!teeds.sessao) { setAdmin(false); return }
    let ativo = true
    setAdmin(null)
    souAdmin(teeds.sessao).then((permitido) => {
      if (ativo) setAdmin(permitido)
    })
    return () => { ativo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId])

  // Nunca mantém um cliente numa rota administrativa, nem após troca de conta.
  useEffect(() => {
    if (admin === false && tela === 'gestao') setTela('operar')
  }, [admin, tela])

  useEffect(() => {
    if (!teeds.sessao) return
    const inicio = Date.now()
    const marcar = () => void registrarPresenca(teeds.sessao!, (Date.now() - inicio) / 1000)
    marcar()
    const relogio = window.setInterval(marcar, 60_000)
    return () => { window.clearInterval(relogio); marcar() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId])

  useEffect(() => {
    if (!teeds.sessao || !conta.account) return
    /*
      Se a conta da corretora já pertence a outro login, o cliente precisa
      saber AGORA — e não quando tentar ligar um robô e levar um "esta conta
      não é sua" sem explicação. Era assim até hoje: a recusa do banco caía
      num aviso de console que ninguém lê.
    */
    void registrarContaDeriv(teeds.sessao, conta.account).then((recado) => {
      if (recado) conta.setAviso(recado)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId, conta.account?.accountId])

  /*
    A autorização da Deriv sobe para o servidor.

    Acontece quando os dois logins existem ao mesmo tempo — o da Teeds e o da
    Deriv — e de novo sempre que a autorização mudar, que é o caso de quem
    acabou de conectar e o de quem teve a antiga renovada. É uma entrega
    silenciosa: o cliente já autorizou na tela da Deriv, e não há nada de
    novo para ele decidir aqui.
  */
  useEffect(() => {
    if (!teeds.sessao || !conta.session?.accessToken) return
    void entregarAutorizacao(teeds.sessao, {
      accessToken: conta.session.accessToken,
      refreshToken: conta.session.refreshToken,
      expiresAt: conta.session.expiresAt,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId, conta.session?.accessToken])

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

  /*
    A lista de posicoes e das entradas feitas AQUI.

    A conta da Deriv e uma so, e os robos operam nela — o fluxo de contratos
    trazia as entradas deles (uma por segundo, de 0,35) para o painel manual:
    "posicao que eu nem abri", contagem pulando, cartoes piscando. Agora a
    tela guarda os ids do que ela mesma comprou (por conta, na sessao do
    navegador) e so lista esses. O resto NAO aparece aqui: a tela Operar e
    so da operacao manual; os robos vivem na aba Robos.
  */
  const [manuais, setManuais] = useState<number[]>(() => lerManuais(conta.accountId))
  useEffect(() => { setManuais(lerManuais(conta.accountId)) }, [conta.accountId])
  const marcarManual = (id: number) => setManuais((lista) => {
    const next = [...lista.filter((x) => x !== id), id].slice(-60)
    try { if (conta.accountId) sessionStorage.setItem(chaveManuais(conta.accountId), JSON.stringify(next)) } catch { /* sem armazenamento: vale ate recarregar */ }
    return next
  })
  const idsManuais = useMemo(() => new Set(manuais), [manuais])
  const minhas = useMemo(
    () => conta.contracts.filter((c) => idsManuais.has(c.contractId)),
    [conta.contracts, idsManuais],
  )

  const doAtivo = useMemo(
    () => minhas.filter((c) => c.symbol === symbolCode),
    [minhas, symbolCode],
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
  const investido = minhas.reduce((t, c) => t + c.buyPrice, 0)
  const resultadoAberto = minhas.reduce((t, c) => t + c.profit, 0)

  /*
    So opera com a linha da conta ABERTA agora. Com ela reconectando, o botao
    ficava ativo e o pedido entrava numa fila para disparar sozinho depois.
  */
  const linhaAberta = conta.conexao === 'open'
  const podeOperar = conta.status === 'logado' && !!conta.socket && !conta.connecting && linhaAberta && !!symbolCode
  // Por que o botao esta travado — para o cliente nao ficar adivinhando.
  const motivoBloqueio = podeOperar ? null
    : conta.status !== 'logado' ? 'Conecte a Deriv para operar'
    : !symbolCode ? 'Escolha um ativo'
    : conta.connecting ? 'Conectando à sua conta…'
    : !linhaAberta ? 'Reconectando à Deriv…'
    : 'Indisponível agora'
  const acimaDoSaldo = !!conta.balance && stake > conta.balance.amount

  // A mesma trava de conta real vale para os dois modos. Dígitos pulavam ela.
  async function comprarDigito(tipo: DigitContract, barreira: string | undefined, ticks: number) {
    if (!conta.isDemo && confirmar !== tipo) { setConfirmar(tipo); return }
    setConfirmar(null)
    await executar(tipo, { duration: ticks, durationUnit: 't', barrier: barreira })
  }

  async function comprar(tipo: 'CALL' | 'PUT') {
    if (!conta.isDemo && confirmar !== tipo) { setConfirmar(tipo); return }
    setConfirmar(null)
    await executar(tipo, { duration, durationUnit: unidade })
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
        symbol: symbolCode, contractType: tipo, amount: stake, currency: moeda, ...extra,
      })
      const r = await buyFromProposal(conta.socket, p.id, p.askPrice)
      marcarManual(r.contractId)
      setAviso({
        tipo: 'ok',
        texto: `Entrada feita: ${moeda} ${r.buyPrice.toFixed(2)} · se ganhar, recebe ${moeda} ${r.payout.toFixed(2)}.`,
      })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: traduzirErro((e as Error).message) })
    } finally {
      setComprando(null)
    }
  }

  /** Encerra uma posicao antes do fim (vende de volta para a Deriv, a mercado). */
  async function encerrar(contractId: number) {
    if (!conta.socket) return
    setVendendo(contractId)
    setAviso(null)
    try {
      const r = await sellContract(conta.socket, contractId, 0)
      setAviso({ tipo: 'ok', texto: `Posição encerrada por ${moeda} ${r.soldFor.toFixed(2)}.` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: traduzirErro((e as Error).message) })
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
    return <div className="entrada"><div className="entrada-esperando">abrindo a {MARCA.prosa}…</div></div>
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

  function abrirAssistente() {
    if (assistenteLiberado) { setTela('assistente'); return }
    setPedirCodigoAssistente(true)
  }

  function liberarAssistente() {
    try { sessionStorage.setItem(`assistente-beta:${MARCA.id}`, 'liberado') } catch { /* acesso vale enquanto a tela ficar aberta */ }
    setAssistenteLiberado(true)
    setPedirCodigoAssistente(false)
    setTela('assistente')
  }

  return (
    <div className="app workspace-app">
      <WorkspaceNav page={tela} admin={admin === true} onNavigate={next => {
        setVerPerfil(false)
        if (next === 'assistente') abrirAssistente()
        else setTela(next)
      }} />
      <header className="topbar">
        <div className="workspace-heading"><strong>{PAGE_NAMES[tela]}</strong><span>{tela === 'operar' ? 'Seu terminal de negociação' : tela === 'robos' ? 'Estratégias e acompanhamento' : tela === 'gestao' ? 'Controle da plataforma' : 'Seu espaço de trabalho'}</span></div>

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

      {pedirCodigoAssistente && (
        <AssistenteBetaGate onFechar={() => setPedirCodigoAssistente(false)} onLiberar={liberarAssistente} />
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
      {/* O assistente fica montado o tempo todo, escondido quando nao e a
          aba escolhida — como a tela de Robos ja fazia. Trocar de aba no meio
          de uma conversa e voltar nao pode apagar o que foi dito, e um robo
          ligado por aqui nao pode parar de ser acompanhado porque alguem foi
          olhar o grafico. */}
      {teeds.sessao && assistenteLiberado && (
        <div className="tela-viva" hidden={tela !== 'assistente'}>
          <AssistentePanel
            sessao={teeds.sessao}
            socket={conta.socket}
            symbols={symbols}
            symbolPadrao={symbolCode}
            conexao={conta.conexao}
          />
        </div>
      )}

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
          sessaoTeeds={teeds.sessao}
          contaId={conta.accountId}
        />
      </div>
      {tela === 'robos' || tela === 'assistente' ? null : tela === 'aulas' ? (
        <AulasPanel nome={teeds.usuario?.nome} />
      ) : tela === 'marketplace' ? (
        <MarketplacePanel sessao={teeds.sessao} />
      ) : tela === 'gerenciamento' ? (
        <OperationalManagementPanel moeda={conta.account?.currency ?? 'USD'} />
      ) : tela === 'gestao' && admin === true ? (
        teeds.sessao ? <AdminPanel sessao={teeds.sessao} comissoes={<ManagementPanel
          session={conta.session} sessaoTeeds={null} contaId={conta.accountId}
          socket={conta.socket} isDemo={conta.isDemo} onReautorizar={() => startLogin()}
          payoutBase={payoutBase} moeda={conta.account?.currency ?? 'USD'} pulso={conta.pulso}
          entrandoNaDeriv={conta.status === 'entrando'} onConectarDeriv={conta.login}
        />} /> : null
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

          {derivPronta && (
            <div className={`trade-conta ${conta.isDemo ? 'demo' : 'real'}`} role="status">
              <i />
              <span>{conta.isDemo ? 'Conta demo · dinheiro fictício' : 'Conta real · dinheiro de verdade'}</span>
              {conta.balance && <b>{moeda} {conta.balance.amount.toFixed(2)}</b>}
            </div>
          )}

          <div className="modo-troca">
            <button className={modo === 'direcao' ? 'on' : ''} onClick={() => setModo('direcao')}>
              Subir / Descer
            </button>
            <button className={modo === 'digitos' ? 'on' : ''} onClick={() => setModo('digitos')}>
              Dígitos
            </button>
          </div>

          <label className="field"><span>Valor da entrada</span>
            <div className={`input-wrap ${acimaDoSaldo ? 'alerta' : ''}`}><em>{moeda}</em>
              <input type="number" min={0.35} step={0.01} value={stake}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setStake(Math.max(0.35, Number(e.target.value) || 0.35))} />
            </div>
          </label>
          <div className="trade-atalhos" role="group" aria-label="Valores rápidos">
            {[0.35, 1, 5, 10, 50].map((v) => (
              <button key={v} type="button" className={stake === v ? 'on' : ''} onClick={() => setStake(v)}>{v}</button>
            ))}
          </div>
          {acimaDoSaldo && conta.balance && (
            <p className="field-alerta">Acima do seu saldo ({moeda} {conta.balance.amount.toFixed(2)}). A Deriv vai recusar.</p>
          )}

          {modo === 'direcao' ? (
            <>
              <div className="field"><span>Duração</span>
                <div className="duracao">
                  <div className="input-wrap">
                    <input type="number" min={faixa?.[0] ?? 1} max={faixa?.[1]} value={duration}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setDuration(Number(e.target.value) || 0)}
                      onBlur={() => setDuration(dentroDaFaixa)} />
                  </div>
                  <div className="segmented mini unidade" role="group" aria-label="Unidade da duração">
                    {([['t', 'ticks', !!limites.ticks], ['s', 'seg', !!limites.segundos], ['m', 'min', !!limites.minutos]] as const)
                      .map(([u, nome, existe]) => (
                        <button key={u} type="button" disabled={!existe} className={unidade === u ? 'on' : ''}
                          onClick={() => trocarUnidade(u)}>{nome}</button>
                      ))}
                  </div>
                </div>
                <p className="field-hint">
                  {faixa
                    ? unidade === 't'
                      ? `de ${faixa[0]} a ${faixa[1]} ticks · cada tick é uma cotação nova`
                      : unidade === 's'
                        ? `de ${faixa[0]} s a ${faixa[1] >= 3600 ? `${Math.round(faixa[1] / 3600)} h` : `${faixa[1]} s`}`
                        : `de ${faixa[0]} a ${faixa[1]} min`
                    : 'essa unidade não vale para este ativo'}
                </p>
              </div>

              <div className="quotes">
                <QuoteCard kind="up" title="Subir" action="Comprar" payout={call.payout} stake={stake} moeda={moeda}
                  loading={call.loading} error={call.error ? traduzirErro(call.error) : null}
                  podeOperar={podeOperar} motivoBloqueio={motivoBloqueio}
                  comprando={comprando === 'CALL'} confirmando={confirmar === 'CALL'}
                  onBuy={() => comprar('CALL')} />
                <QuoteCard kind="down" title="Descer" action="Comprar" payout={put.payout} stake={stake} moeda={moeda}
                  loading={put.loading} error={put.error ? traduzirErro(put.error) : null}
                  podeOperar={podeOperar} motivoBloqueio={motivoBloqueio}
                  comprando={comprando === 'PUT'} confirmando={confirmar === 'PUT'}
                  onBuy={() => comprar('PUT')} />
              </div>
            </>
          ) : (
            <DigitsPanel
              symbol={symbolCode}
              pipSize={pipSize}
              stake={stake}
              moeda={moeda}
              podeOperar={podeOperar}
              logado={conta.status === 'logado'}
              comprando={!!comprando && comprando.startsWith('DIGIT')}
              socket={conta.socket}
              onComprar={comprarDigito}
              confirmando={confirmar}
              onDesarmar={() => setConfirmar(null)}
              motivoBloqueio={motivoBloqueio}
            />
          )}

          {aviso && (
            <p role="status" aria-live="polite"
              className={`aviso ${aviso.tipo === 'ok' ? 'aviso-ok' : 'aviso-erro'}`}>{aviso.texto}</p>
          )}

          <section className={`posicoes-flutuantes posicoes-na-operacao ${posicoesAbertas ? 'aberto' : 'fechado'}`}
            aria-label="Posições abertas">
            <button className="pos-flutuante-topo" onClick={() => setPosicoesAbertas((aberto) => !aberto)}
              aria-expanded={posicoesAbertas}>
              <span><i className={minhas.length ? 'vivo' : ''} />
                {minhas.length === 0
                  ? 'Nenhuma posição sua'
                  : `${minhas.length} ${minhas.length === 1 ? 'posição sua' : 'posições suas'}`}
              </span>
              {minhas.length > 0 && (
                <strong className={resultadoAberto >= 0 ? 'ganho' : 'perda'}>
                  {resultadoAberto >= 0 ? '+' : '−'}{Math.abs(resultadoAberto).toFixed(2)}
                </strong>
              )}
              <em>{posicoesAbertas ? '−' : '+'}</em>
            </button>
            {posicoesAbertas && (
              <div className="pos-flutuante-corpo">
                {minhas.length > 0 && (
                  <div className="pos-resumo">
                    <span>Investido <b>{moeda} {investido.toFixed(2)}</b></span>
                  </div>
                )}
                {!derivPronta && <div className="pos-vazio">Conecte sua Deriv para acompanhar posições.</div>}
                {derivPronta && minhas.length === 0 && (
                  <div className="pos-vazio">As entradas que você fizer aqui aparecem nesta lista, com o resultado.</div>
                )}
                {minhas.map((c) => (
                  <PositionCard key={c.contractId} contrato={c}
                    nomeAtivo={symbols.find((s) => s.symbol === c.symbol)?.name ?? c.symbol}
                    onEncerrar={encerrar} encerrando={vendendo === c.contractId} />
                ))}
              </div>
            )}
          </section>
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

/*
  Os dois cartoes sao COMPRAS: compra-se um contrato de "sobe" ou um de
  "desce". O de baixo se chamava "Vender" e o titulo era "Acima/Abaixo" — o
  nome de outro contrato da Deriv (Higher/Lower). A mesma tela dizia
  "Subir/Descer" na aba e "Subir" no cartao da posicao. Agora e um vocabulario
  so, e "vender" ficou reservado para encerrar uma posicao.
*/
function QuoteCard(props: {
  kind: 'up' | 'down'; title: string; action: string; payout: number | null; stake: number; moeda: string
  loading: boolean; error: string | null; podeOperar: boolean; motivoBloqueio: string | null
  comprando: boolean; confirmando: boolean; onBuy: () => void
}) {
  const {
    kind, title, action, payout, stake, moeda, loading, error, podeOperar, motivoBloqueio,
    comprando, confirmando, onBuy,
  } = props
  const lucro = payout !== null ? payout - stake : null
  const pct = payout !== null && stake > 0 ? ((payout - stake) / stake) * 100 : null

  return (
    <div className={`quote quote-${kind}`}>
      <div className="quote-head">
        <span className="arrow">{kind === 'up' ? '▲' : '▼'}</span><span>{title}</span>
        <span className="quote-rot">se ganhar</span>
      </div>
      {error ? <p className="quote-error" title={error}>{error}</p>
        : loading && payout === null ? <p className="quote-loading">…</p>
        : payout !== null ? (
          <>
            <strong>{moeda} {payout.toFixed(2)}</strong>
            <span className="quote-sub">lucro {moeda} {lucro?.toFixed(2)}{pct !== null && ` · ${pct.toFixed(0)}%`}</span>
          </>
        ) : <p className="quote-loading">—</p>}
      <button className={`btn ${confirmando ? 'btn-confirmar' : ''}`}
        disabled={!podeOperar || comprando} onClick={onBuy}>
        {comprando ? 'comprando…'
          : motivoBloqueio ? motivoBloqueio
          : confirmando ? 'Confirmar (dinheiro real)'
          : `${action} · ${title}`}
      </button>
    </div>
  )
}
