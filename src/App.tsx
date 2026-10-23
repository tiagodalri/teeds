import { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from 'react'
import { useSimulador } from './hooks/useSimulador'
import { PriceChart, type ChartMode, type ContractMarker } from './components/PriceChart'
import { PositionCard } from './components/PositionCard'
import { DigitsPanel } from './components/DigitsPanel'
import { BoletaAtivo, BotaoCompra, MostradorDuracao, MostradorValor, ResumoDaCompra } from './components/operar/Boleta'
import { UltimasEntradas } from './components/operar/UltimasEntradas'
import { CatalogoProvider } from './core/teeds/catalogoRobos'
import { usePreferenciaColuna } from './core/teeds/preferenciaColuna'
import { useMarcaEmFoco } from './core/teeds/marcaEmFoco'
import { MonitoramentoBoundary } from './components/MonitoramentoBoundary'
// O monitoramento é só do admin e pesa: entra no pacote sob demanda, para o
// pacote que todo cliente baixa continuar do mesmo tamanho.
const MonitoramentoPanel = lazy(() => import('./components/MonitoramentoPanel').then((m) => ({ default: m.MonitoramentoPanel })))
import { RobotsPanel } from './components/RobotsPanel'
import { WorkspaceNav, PAGE_NAMES, type WorkspacePage } from './components/WorkspaceNav'
import { AccountSwitcher } from './components/AccountSwitcher'
import { UserMenu } from './components/UserMenu'
import { ProfilePanel } from './components/ProfilePanel'
import { DerivLogo, IconeElo } from './components/DerivMarca'
import { LoginScreen } from './components/LoginScreen'
import { Carregando } from './components/entrada/Carregando'
import { decolar, liberarPouso } from './core/decolagem'
import { definirDonoDoPlano } from './core/teeds/planoDoDia'
import { NovaSenha } from './components/NovaSenha'
import { CadastroEmAnalise } from './components/CadastroEmAnalise'
import { startLogin } from './core/deriv/auth'
import type { DigitContract } from './core/deriv/digits'
import { useCandleSeries, useConnection, useLimitesDuracao, useLiveTick, useProposal, useSymbols } from './hooks/useMarket'
import { traduzirErro } from './core/deriv/erros'
import { nomeDoAtivo } from './core/deriv/market'
import { ATIVO_DOS_ROBOS, ehSintetico } from './core/deriv/config'
import { useAccount } from './hooks/useAccount'
import { minhaSituacao, registrarContaDeriv, registrarPresenca, souAdmin, type SituacaoDaFicha } from './core/teeds/clientes'
import { marcarPagina, marcarRegiao, ouvirCliques } from './core/teeds/rastro'
import { entregarAutorizacao } from './core/teeds/servidorRobos'
import { AssistentePanel } from './components/AssistentePanel'
import { AssistenteBetaGate } from './components/AssistenteBetaGate'
import { useTeedsAuth } from './hooks/useTeedsAuth'
import { aplicarTema, temaGuardado, type Tema } from './core/tema'
import { DerivDesconectada } from './components/DerivDesconectada'
import type { Granularity } from './core/deriv/types'
import { formatPrice } from './core/chart/scales'
import { buyFromProposal, requestProposal, sellContract } from './core/deriv/trading'
import { LIVES_AO_VIVO, MARCA } from './marca'
import { IconeFechar } from './components/IconeFechar'
import { RelogioTopo } from './components/RelogioTopo'
import { dinheiro, simboloMoeda } from './core/dinheiro'
import { usePeriodos } from './core/chart/periodos'
import { conviteRecebido, liveNoAr, podeTreinar, treinoNoAr, treinoPedido, type Live, type TreinoNoAr } from './core/live/api'
import { IconeAtivo } from './components/IconeAtivo'
import { usePlayerAtivo, useTreinoAtivo } from './core/live/presenca'
import { assinarMudancas, type AssinaturaRealtime } from './core/teeds/realtime'
import { lerPerfil, marcarTourVisto } from './core/teeds/perfil'
import { TourGuiado, passosDoTour } from './components/tour/TourGuiado'
import { BarraInferior } from './components/barra/BarraInferior'
import { MiniCabine } from './components/minicabine/MiniCabine'
import { pararNoServidor, type SessaoViva } from './core/teeds/servidorRobos'
import { sinalGFLiberado } from './core/deriv/accountAccess'
import { acompanharFimDasSessoes, contratoManual } from './core/som'
import { registrarOperacaoManual } from './core/teeds/clientes'

// Transmissão ao vivo (marcas com `aoVivo`): a biblioteca de vídeo só baixa
// quando a pessoa abre a página ou entra numa live.
const AoVivoPage = lazy(() => import('./components/aovivo/AoVivo').then((m) => ({ default: m.AoVivoPage })))
const MercadoPanel = lazy(() => import('./components/MercadoPanel').then((m) => ({ default: m.MercadoPanel })))
const AjudaPagina = lazy(() => import('./components/ajuda/AjudaPagina').then((m) => ({ default: m.AjudaPagina })))
const SuporteWidget = lazy(() => import('./components/suporte/SuporteWidget').then((m) => ({ default: m.SuporteWidget })))
const MeuPerfil = lazy(() => import('./components/perfil/MeuPerfil').then((m) => ({ default: m.MeuPerfil })))
// o Início é a primeira tela da GlobalFly: o download começa junto com o app, não depois do primeiro render
const carregarInicio = () => import('./components/inicio/InicioPagina')
if (MARCA.inicio) void carregarInicio().catch(() => undefined)
const InicioPagina = lazy(() => carregarInicio().then((m) => ({ default: m.InicioPagina })))
// Telas que ninguém vê ao entrar (administração, aulas, loja, gerenciamento) baixam só quando abertas:
// o app principal fica ~30% menor no celular
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })))
const InsightsPanel = lazy(() => import('./components/InsightsPanel').then((m) => ({ default: m.InsightsPanel })))
const ManagementPanel = lazy(() => import('./components/ManagementPanel').then((m) => ({ default: m.ManagementPanel })))
const AulasPanel = lazy(() => import('./components/AulasPanel').then((m) => ({ default: m.AulasPanel })))
const MarketplacePanel = lazy(() => import('./components/MarketplacePanel').then((m) => ({ default: m.MarketplacePanel })))
const OperationalManagementPanel = lazy(() => import('./components/OperationalManagementPanel').then((m) => ({ default: m.OperationalManagementPanel })))
/** "1.234,56", "2.000", "1234.56" ou "12,5" viram número: vírgula é o decimal; ponto com
    trios depois ("2.000") é milhar, senão é decimal ("12.5"). */
const lerValor = (t: string) => Number(t.includes(',') || /^[1-9]\d{0,2}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t)
const telaAbrindo = (texto: string) => <div className="ger"><div className="adm-vazio">{texto}</div></div>
const PlayerDoTreino = lazy(() => import('./components/aovivo/PlayerDoTreino'))
const PlayerAoVivo = lazy(() => import('./components/aovivo/AoVivo').then((m) => ({ default: m.PlayerGlobal })))
// Gráfico profissional (KLineChart): só baixa para quem vê (hoje, admin da GlobalFly).
const GraficoPro = lazy(() => import('./components/grafico/GraficoPro').then((m) => ({ default: m.GraficoPro })))
// Quem chega pelo link da live sem conta (fase de testes, com o link público ligado).
const Convidado = lazy(() => import('./components/aovivo/Convidado').then((m) => ({ default: m.Convidado })))

const INDICADORES = [
  { id: 'sma', label: 'Média 20', titulo: 'Média móvel simples de 20 períodos' },
  { id: 'ema', label: 'EMA 50', titulo: 'Média móvel exponencial de 50 períodos' },
  { id: 'bollinger', label: 'Bollinger', titulo: 'Bandas de Bollinger de 20 períodos' },
  { id: 'rsi', label: 'RSI 14', titulo: 'Índice de força relativa de 14 períodos' },
  { id: 'macd', label: 'MACD', titulo: 'Convergência e divergência de médias móveis' },
  { id: 'fibonacci', label: 'Fibonacci', titulo: 'Retração de Fibonacci entre a mínima e a máxima visíveis' },
] as const

/** Títulos dos grupos no seletor de ativos do Manual. */
const NOME_DO_MERCADO: Record<string, string> = { synthetic_index: 'Sintéticos', forex: 'Forex', commodities: 'Metais' }

const TIMEFRAMES: { label: string; value: Granularity }[] = [
  { label: '1m', value: 60 }, { label: '5m', value: 300 }, { label: '15m', value: 900 },
  { label: '1h', value: 3600 }, { label: '4h', value: 14400 }, { label: '1d', value: 86400 },
]

const STATUS_LABEL: Record<string, string> = {
  // Na marca com transmissão, "Ao vivo" é a live: a conexão vira "Conectado".
  idle: 'Iniciando', connecting: 'Conectando', open: MARCA.aoVivo ? 'Conectado' : 'Ao vivo',
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
  const teeds = useTeedsAuth()
  // o plano do dia é de quem está logado (antes de qualquer tela ler)
  definirDonoDoPlano(teeds.sessao?.usuario.id)
  /*
    A ficha nasce 'pendente' quando veio da fila de cadastro (30/09/2026): a
    conta existe para a senha provisória poder ir por e-mail na hora, mas a
    plataforma só abre depois da aprovação. `null` = ainda lendo.
  */
  const [situacao, setSituacao] = useState<SituacaoDaFicha | null>(null)
  const [admin, setAdmin] = useState<boolean | null>(null)
  /** A conferencia de administrador falhou (rede, token) — diferente de "nao e admin". */
  const [adminFalhou, setAdminFalhou] = useState(false)
  const [adminUserId, setAdminUserId] = useState<string | null>(null)
  const adminConfirmado = admin === true && !!teeds.sessao && adminUserId === teeds.sessao.usuario.id
  /* A tela RENASCE quando a plataforma muda.

     Trocar de marca trocava o filtro das consultas novas, mas o que já estava
     carregado da outra continuava na tela — e os caches em `ref` (clientes já
     pedidos, fotos já pedidas) sobreviviam. Resultado: com o seletor em OMNI
     apareciam sessões da Teeds (Tiago, 06/10/2026). É exatamente a lição que
     o painel de Administração já tinha registrado em 30/09, quando os
     depósitos da OMNI apareceram na Teeds: `key` resolve de uma vez, porque
     não sobra estado nenhum da marca anterior. */
  const [marcaEmFoco] = useMarcaEmFoco()
  const [mostrarColuna, alterarColuna] = usePreferenciaColuna(teeds.sessao?.usuario.id ?? null, adminConfirmado)
  const simulador = useSimulador(teeds.sessao)
  const conta = useAccount({ email: teeds.sessao?.usuario.email, simulador: adminConfirmado || simulador, tokenTeeds: teeds.sessao?.token })
  // Acesso somente-demo (demonstração): a conta virtual se apresenta como real nas telas
  // do próprio cliente. Só a tela muda: as operações continuam indo para a conta virtual.
  const contasParaMostrar = conta.somenteDemo ? conta.accounts.map((c) => ({ ...c, type: 'real' })) : conta.accounts
  // sair é sair de tudo: a autorização da Deriv deste aparelho sai junto com a conta
  const sairDeTudo = () => {
    conta.logout()
    try { localStorage.removeItem(`${MARCA.id}.deriv.dono`) } catch { /* sem armazenamento */ }
    void teeds.sair()
  }
  const [verPerfil, setVerPerfil] = useState(false)
  // "Meu perfil" (GlobalFly, 20/10/2026): a foto vai para o menu do usuário
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(null)
  // suporte (20/10/2026): o botão flutuante do admin abre a caixa de entrada
  const [pedidoCaixa, setPedidoCaixa] = useState(0)
  // as sessões vivas que a tela de robôs busca: a home e a mini-cabine usam as mesmas (21/10/2026)
  const [vivasRobos, setVivasRobos] = useState<SessaoViva[]>([])
  // o som do fim da sessão (meta ou stop), de qualquer tela: som.ts
  useEffect(() => { acompanharFimDasSessoes(vivasRobos) }, [vivasRobos])
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
  // O período das médias é escolhido no gráfico (clicando na linha); o botão acompanha.
  const periodos = usePeriodos()
  const [search, setSearch] = useState('')
  const [seletorAtivo, setSeletorAtivo] = useState(false)
  const [stake, setStake] = useState(10)
  const [stakeTexto, setStakeTexto] = useState<string | null>(null)
  const [duration, setDuration] = useState(5)
  const [unidade, setUnidade] = useState<'t' | 's' | 'm'>('m')
  const [comprando, setComprando] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  // Em conta real o primeiro clique arma e o segundo compra; guarda o tipo armado.
  const [confirmar, setConfirmar] = useState<string | null>(null)
  const [vendendo, setVendendo] = useState<number | null>(null)
  const [modo, setModo] = useState<'direcao' | 'digitos'>('direcao')
  // GlobalFly abre na home (20/10/2026); as outras marcas, no terminal manual
  // F5 / app voltando do segundo plano: continua na tela em que a pessoa estava (só as telas de cliente)
  const [tela, setTela] = useState<WorkspacePage>(() => {
    const padrao: WorkspacePage = MARCA.inicio ? 'inicio' : 'operar'
    const antes = (history.state as { tela?: WorkspacePage } | null)?.tela
    const QUE_VOLTAM: WorkspacePage[] = ['inicio', 'operar', 'robos', 'aulas', 'gerenciamento', 'marketplace', 'noticias', 'perfil', 'ajuda']
    return antes && QUE_VOLTAM.includes(antes) && (antes !== 'inicio' || MARCA.inicio) && (antes !== 'noticias' || MARCA.noticias) ? antes : padrao
  })
  const telaAgora = useRef(tela)
  telaAgora.current = tela
  const [pedirCodigoAssistente, setPedirCodigoAssistente] = useState(false)
  const [assistenteLiberado, setAssistenteLiberado] = useState(assistenteBetaJaLiberado)
  const [payoutBase, setPayoutBase] = useState(19.55)

  const activeSymbol = useMemo(() => {
    if (selected) return symbols.find((s) => s.symbol === selected) ?? null
    // abre no índice da casa (75); se ele estiver fechado, no primeiro aberto da lista
    return symbols.find((s) => s.symbol === ATIVO_DOS_ROBOS && s.isOpen && !s.isSuspended)
      ?? symbols.find((s) => s.isOpen && !s.isSuspended) ?? symbols[0] ?? null
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
  // Forex e metais não têm ticks nem segundos: ao trocar para um deles, a
  // unidade pula sozinha para minutos (e a faixa leva ao mínimo de 15 ou 5).
  useEffect(() => {
    const atual = unidade === 't' ? limites.ticks : unidade === 's' ? limites.segundos : limites.minutos
    if (atual) return
    const outra = limites.minutos ? 'm' : limites.segundos ? 's' : limites.ticks ? 't' : null
    if (outra) trocarUnidade(outra)
  }, [limites]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dígitos só existem nos índices sintéticos. Em forex/metais o modo some.
  const sintetico = ehSintetico(activeSymbol)
  useEffect(() => { if (!sintetico && modo === 'digitos') setModo('direcao') }, [sintetico, modo])
  // Forex fecha à noite e no fim de semana; a Deriv diz se está aberto.
  const mercadoAberto = !activeSymbol || (activeSymbol.isOpen && !activeSymbol.isSuspended)

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
  // Lê a situação da ficha a cada sessão nova. Enquanto não voltar, o App
  // segue mostrando "abrindo a plataforma…" — nunca a plataforma por engano.
  useEffect(() => {
    if (!teeds.sessao) { setSituacao(null); return }
    let vivo = true
    minhaSituacao(teeds.sessao).then((s) => { if (vivo) setSituacao(s) })
    return () => { vivo = false }
  }, [teeds.sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const usuarioTeedsId = teeds.sessao?.usuario.id ?? null
  useEffect(() => {
    if (!teeds.sessao) { setAdmin(false); return }
    let ativo = true
    setAdmin(null)
    setAdminUserId(null)
    setAdminFalhou(false)
    souAdmin(teeds.sessao, true).then((permitido) => {
      if (ativo) { setAdminUserId(usuarioTeedsId); setAdmin(permitido) }
    }).catch(() => {
      /*
        Falhou a conferencia (Supabase fora, token vencido): NAO e "nao e
        admin". `admin` fica null — e null e o que mantem um acesso restrito
        a demo fechado (fail closed). Gravar false aqui abria a conta real
        para o login somente-demo justamente quando a rede falha.
      */
      if (ativo) { setAdmin(null); setAdminFalhou(true) }
    })
    return () => { ativo = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId])

  // Nunca mantém um cliente numa rota administrativa, nem após troca de conta
  // ou falha na conferência.
  useEffect(() => {
    if ((admin === false || adminFalhou) && (tela === 'gestao' || tela === 'insights' || tela === 'monitoramento')) setTela('operar')
  }, [admin, adminFalhou, tela])

  // App com cara de nativo (marcas com `appNativo`): o atalho do ícone abre a
  // tela pedida (?tela=robos) e o voltar do Android/gesto do iPhone volta à
  // tela anterior, em vez de fechar o app. Cada troca de tela vira um passo
  // no histórico; o endereço não muda.
  // "Tem live no ar?" a cada 30 s: acende o ponto vermelho do menu.
  const [liveAgora, setLiveAgora] = useState<Live | null>(null)
  const [avisoLive, setAvisoLive] = useState<Live | null>(null)
  // Sala de treino no ar (20/10/2026): o GF Member vê o selo do topo, o ponto
  // do menu e o aviso "Live iniciada" (fica até ele entrar ou fechar).
  const [treinoAgora, setTreinoAgora] = useState<TreinoNoAr | null>(null)
  const [avisoTreino, setAvisoTreino] = useState(false)
  const aoVivoAgora = Boolean(liveAgora) || Boolean(treinoAgora)
  // Convidado que prefere entrar na conta: a tela de login no lugar da porta do convite.
  const [querLogin, setQuerLogin] = useState(false)
  useEffect(() => { if (!avisoLive) return; const t = window.setTimeout(() => setAvisoLive(null), 20000); return () => window.clearTimeout(t) }, [avisoLive])
  const playerAoVivo = usePlayerAtivo()
  const treinoAtivo = useTreinoAtivo()
  useEffect(() => {
    if (!LIVES_AO_VIVO || !teeds.sessao) { setLiveAgora(null); return }
    const sessao = teeds.sessao
    let vivo = true
    const ver = () => {
      liveNoAr(sessao).then((l) => {
        if (!vivo) return
        setLiveAgora((antes) => (antes?.id === l?.id && antes?.titulo === l?.titulo ? antes : l))
        // "Começou agora": uma vez por live, para quem ainda não está nela.
        if (l) {
          const chave = `${MARCA.id}.aovivo.avisado`
          let visto: string | null = null
          try { visto = localStorage.getItem(chave) } catch { /* sem armazenamento */ }
          if (visto !== l.id) { setAvisoLive(l); try { localStorage.setItem(chave, l.id) } catch { /* idem */ } }
        }
      }).catch(() => undefined)
    }
    ver()
    const t = window.setInterval(ver, 30000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [teeds.sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // o token mais novo (a sessão renova sozinha; o aviso da sala não pode morrer com o token velho)
  const sessaoAtual = useRef(teeds.sessao)
  sessaoAtual.current = teeds.sessao
  const canalDoTreino = useRef<AssinaturaRealtime | null>(null)
  useEffect(() => { if (teeds.sessao?.token) canalDoTreino.current?.atualizarToken(teeds.sessao.token) }, [teeds.sessao?.token])
  useEffect(() => {
    // só para quem assiste: o admin é quem abre a sala
    if (!MARCA.aoVivo || !teeds.sessao || admin !== false) { setTreinoAgora(null); return }
    let vivo = true
    let t: number | undefined
    let pedido = 0
    const ver = () => {
      const s = sessaoAtual.current
      if (!s) return
      const este = ++pedido
      treinoNoAr(s).then((agora) => {
        if (!vivo || este !== pedido) return // vale só a resposta mais nova
        setTreinoAgora((antes) => (antes?.iniciadaEm === agora?.iniciadaEm ? antes : agora))
        if (!agora) { setAvisoTreino(false); return }
        // uma vez por sessão de treino
        const chave = `${MARCA.id}.treino.avisado`
        let visto: string | null = null
        try { visto = localStorage.getItem(chave) } catch { /* sem armazenamento */ }
        if (visto !== agora.iniciadaEm) { setAvisoTreino(true); try { localStorage.setItem(chave, agora.iniciadaEm) } catch { /* idem */ } }
      }).catch(() => undefined)
    }
    const aoVoltar = () => { if (document.visibilityState === 'visible') ver() }
    void podeTreinar(teeds.sessao).then((membro) => {
      if (!vivo || !membro) return
      // a sala de treino já fica baixada (clicar em "Entrar" abre na hora), mas
      // depois que a tela de entrada assentou: os 680 KB não disputam a rede com ela
      const baixarSala = () => void import('./components/aovivo/AoVivo').catch(() => undefined)
      const ocioso = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }).requestIdleCallback
      if (ocioso) ocioso(baixarSala, { timeout: 6000 }); else window.setTimeout(baixarSala, 4000)
      ver()
      // Na hora (20/10/2026): o banco avisa quando o admin começa ou encerra, e a
      // plataforma pergunta de novo. A conferência de 15 s fica só de reserva.
      canalDoTreino.current = assinarMudancas({
        token: sessaoAtual.current?.token ?? '', canal: `treino-no-ar-${MARCA.id}`,
        tabelas: [{ tabela: 'treino_no_ar', filtro: `marca=eq.${MARCA.id}` }],
        aoMudar: () => ver(),
      })
      t = window.setInterval(ver, 15000)
      document.addEventListener('visibilitychange', aoVoltar)
    })
    return () => {
      vivo = false; window.clearInterval(t)
      document.removeEventListener('visibilitychange', aoVoltar)
      canalDoTreino.current?.fechar(); canalDoTreino.current = null
    }
  }, [teeds.sessao?.usuario.id, admin]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tela === 'aovivo') setAvisoTreino(false) }, [tela])
  // Com as lives desligadas, o "Ao vivo" é só a sala de treino: aparece para admin e GF Member
  const [membroTreino, setMembroTreino] = useState<boolean | null>(null)

  // "Meu perfil" e tour guiado (GlobalFly, 20/10/2026): a foto vai para o menu
  // do usuário, e quem nunca fez o tour faz agora (obrigatório na 1ª vez).
  // O "visto" fica na ficha (vale em qualquer aparelho) e neste aparelho.
  const [tour, setTour] = useState<null | 'obrigatorio' | 'rever'>(null)
  const chaveTour = teeds.sessao ? `${MARCA.id}.tour.visto.${teeds.sessao.usuario.id}` : ''
  useEffect(() => {
    const sessao = teeds.sessao
    if (!MARCA.inicio || !sessao) { setFotoPerfil(null); return }
    let vivo = true
    lerPerfil(sessao).then((p) => {
      if (!vivo) return
      setFotoPerfil(p.fotoUrl)
      let visto = !!p.tourVistoEm
      try { visto = visto || !!localStorage.getItem(chaveTour) } catch { /* só a ficha */ }
      if (!visto) setTour((t) => t ?? 'obrigatorio')
    }).catch(() => undefined)
    return () => { vivo = false }
  }, [teeds.sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const abrirCaixaDoSuporte = useCallback(() => { setTela('gestao'); setPedidoCaixa((n) => n + 1) }, [])
  const fimDoTour = (destino?: WorkspacePage) => {
    if (teeds.sessao) void marcarTourVisto(teeds.sessao).catch(() => undefined)
    try { localStorage.setItem(chaveTour, new Date().toISOString()) } catch { /* só a ficha */ }
    setTour(null)
    if (destino) setTela(destino)
  }
  useEffect(() => {
    if (!MARCA.aoVivo || LIVES_AO_VIVO || !teeds.sessao) { setMembroTreino(null); return }
    let vivo = true
    void podeTreinar(teeds.sessao).then((m) => { if (vivo) setMembroTreino(m) })
    return () => { vivo = false }
  }, [teeds.sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const mostrarAoVivo = LIVES_AO_VIVO || admin === true || membroTreino === true
  useEffect(() => {
    if (!LIVES_AO_VIVO && tela === 'aovivo' && admin === false && membroTreino === false) setTela('operar')
  }, [tela, admin, membroTreino])

  const telaVeioDoVoltar = useRef(false)
  // voltar, F5 e link direto (?tela=) valem nas três marcas, no navegador e no app instalado
  useEffect(() => {
    const u = new URL(location.href)
    // Link de convite da live (?aovivo=<código>): abre o "Ao vivo", mesmo depois do login.
    const convite = LIVES_AO_VIVO ? u.searchParams.get('aovivo') : null
    if (convite) { try { sessionStorage.setItem(`${MARCA.id}.aovivo.convite`, convite.slice(0, 12)) } catch { /* sem armazenamento */ } }
    // Link da sala de treino (?treino=1): abre o "Ao vivo" já dentro da sala de treino.
    const treino = MARCA.aoVivo && u.searchParams.has('treino')
    if (treino) { try { sessionStorage.setItem(`${MARCA.id}.aovivo.treino`, '1') } catch { /* sem armazenamento */ } }
    const pedida = convite || treino ? 'aovivo' : u.searchParams.get('tela')
    const PUBLICAS: WorkspacePage[] = [...(MARCA.inicio ? ['inicio' as const] : []), 'operar', 'robos', 'aulas', 'gerenciamento', 'marketplace', ...(MARCA.aoVivo ? ['aovivo' as const] : []), ...(MARCA.noticias ? ['noticias' as const] : [])]
    if (pedida && (PUBLICAS as string[]).includes(pedida)) setTela(pedida as WorkspacePage)
    if (u.searchParams.has('tela') || u.searchParams.has('aovivo') || u.searchParams.has('treino') || u.searchParams.get('origem') === 'app') {
      u.searchParams.delete('tela'); u.searchParams.delete('origem'); u.searchParams.delete('aovivo'); u.searchParams.delete('treino')
      history.replaceState(history.state, '', u.pathname + u.search + u.hash)
    }
    const voltar = (e: PopStateEvent) => {
      const t = (e.state as { tela?: WorkspacePage } | null)?.tela ?? (MARCA.inicio ? 'inicio' : 'operar')
      // a marca só fica se a tela muda de fato; senão travaria e o próximo passo não entraria no histórico
      if (t === telaAgora.current) return
      telaVeioDoVoltar.current = true
      setTela(t)
    }
    window.addEventListener('popstate', voltar)
    return () => window.removeEventListener('popstate', voltar)
  }, [])
  useEffect(() => {
    if (telaVeioDoVoltar.current) { telaVeioDoVoltar.current = false; return }
    const atual = (history.state as { tela?: WorkspacePage } | null)?.tela
    if (atual === tela) return
    if (atual === undefined) history.replaceState({ ...(history.state ?? {}), tela }, '')
    else history.pushState({ ...(history.state ?? {}), tela }, '')
  }, [tela])

  useEffect(() => {
    if (!teeds.sessao) return
    const inicio = Date.now()
    const marcar = () => void registrarPresenca(teeds.sessao!, (Date.now() - inicio) / 1000)
    marcar()
    const relogio = window.setInterval(marcar, 60_000)
    return () => { window.clearInterval(relogio); marcar() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId])

  /*
    O rastro de navegação: em que tela a pessoa ficou, por quanto tempo, e em
    que botões clicou. Dois efeitos separados de propósito — a escuta de
    cliques vive enquanto durar a sessão, e a marcação de página reage à troca
    de tela. Juntos num só, trocar de aba religaria o ouvinte a cada clique.
  */
  useEffect(() => ouvirCliques(teeds.sessao), [usuarioTeedsId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => marcarRegiao(teeds.sessao), [usuarioTeedsId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!teeds.sessao) return
    marcarPagina(teeds.sessao, tela)
    // Ao desmontar (logout ou troca de conta) fecha o tempo da última tela.
    return () => marcarPagina(teeds.sessao, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarioTeedsId, tela])

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
    // a autorização guardada neste aparelho tem dono: se quem entrou agora é
    // outra pessoa, ela é descartada e nunca sobe para o cofre de quem entrou
    const chaveDono = `${MARCA.id}.deriv.dono`
    let dono: string | null = null
    try { dono = localStorage.getItem(chaveDono) } catch { /* sem armazenamento */ }
    if (dono && dono !== teeds.sessao.usuario.id) { conta.logout(); try { localStorage.removeItem(chaveDono) } catch { /* idem */ } return }
    try { localStorage.setItem(chaveDono, teeds.sessao.usuario.id) } catch { /* idem */ }
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
  const marcarManual = (id: number) => { contratoManual(id); marcarNaLista(id) }
  const marcarNaLista = (id: number) => setManuais((lista) => {
    const next = [...lista.filter((x) => x !== id), id].slice(-60)
    try { if (conta.accountId) sessionStorage.setItem(chaveManuais(conta.accountId), JSON.stringify(next)) } catch { /* sem armazenamento: vale ate recarregar */ }
    return next
  })
  /*
    Compra enviada cuja resposta se perdeu (tempo esgotado, linha caiu logo
    depois do envio): o contrato pode existir mesmo assim. Sem isto ele
    chegava pelo fluxo da conta mas nunca era marcado como seu — sumia da
    lista, e o aviso mandava "conferir em Posições": o cliente conferia,
    via vazio e comprava de novo, em dobro. Agora a tela fica de olho por
    90 s e adota a proxima compra com aquele valor.
  */
  const [compraPendente, setCompraPendente] = useState<{ valor: number; desde: number } | null>(null)
  useEffect(() => {
    if (!compraPendente) return
    if (Date.now() - compraPendente.desde > 90_000) { setCompraPendente(null); return }
    const achada = conta.comprasRecentes.find((c) =>
      c.quando >= compraPendente.desde - 2_000 && Math.abs(c.valor - compraPendente.valor) < 0.005 && !manuais.includes(c.contractId))
    if (achada) {
      marcarManual(achada.contractId)
      setCompraPendente(null)
      setAviso({ tipo: 'ok', texto: `A entrada de ${dinheiro(achada.valor, moeda)} foi confirmada e está em Posições.` })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta.comprasRecentes, compraPendente, manuais])
  const idsManuais = useMemo(() => new Set(manuais), [manuais])
  const minhas = useMemo(
    () => conta.contracts.filter((c) => idsManuais.has(c.contractId)),
    [conta.contracts, idsManuais],
  )

  /*
    Operação manual encerrada fica no gráfico por 2 minutos, com o preço de
    saída e o último dígito (22/10/2026, Tiago: "ajuda o cliente ver qual foi
    o preço pra saber certinho qual foi o último dígito"). A lista de
    posições a tira em 7 s; aqui guardamos uma cópia.
  */
  const [encerradas, setEncerradas] = useState<Array<{ c: (typeof minhas)[number]; ate: number }>>([])
  const [ultimasManuais, setUltimasManuais] = useState<Array<(typeof minhas)[number]>>([])
  /*
    O markup das operações manuais (23/10/2026, modo CEO): o oficial da Deriv
    quando a proposta informa; senão, 3% do pagamento potencial (a regra da
    Deriv para opções, conferida contra o total oficial do dia). Cada operação
    manual encerrada vai para operacoes_manuais, uma vez só.
  */
  const markupOficial = useRef(new Map<number, number>())
  const manuaisRegistradas = useRef(new Set<number>())
  const markupDaManual = (c: { contractId: number; payout: number }) => markupOficial.current.get(c.contractId) ?? Number((c.payout * 0.03).toFixed(4))
  useEffect(() => {
    const finais = minhas.filter((c) => /^(won|lost|sold|cancelled)$/.test(c.status))
    if (!finais.length) return
    if (teeds.sessao && conta.accountId) {
      for (const c of finais) {
        if (manuaisRegistradas.current.has(c.contractId)) continue
        manuaisRegistradas.current.add(c.contractId)
        void registrarOperacaoManual(teeds.sessao, {
          contractId: c.contractId, contaId: conta.accountId, demo: conta.isDemo, ativo: c.symbol, tipoContrato: c.contractType, moeda: c.currency,
          entrada: c.buyPrice, pagamento: c.payout, resultado: c.profit, markup: markupDaManual(c), markupOficial: markupOficial.current.has(c.contractId),
          compradaEm: new Date((c.purchaseTime || c.startTime) * 1000).toISOString(), encerradaEm: new Date().toISOString(),
        })
      }
    }
    setEncerradas((antes) => {
      const outras = antes.filter((e) => !finais.some((f) => f.contractId === e.c.contractId))
      const novas = finais.map((c) => ({ c, ate: antes.find((e) => e.c.contractId === c.contractId)?.ate ?? Date.now() + 120_000 }))
      return [...novas, ...outras].slice(0, 6)
    })
    // a lista "Suas últimas entradas" da coluna do Operar: fica a sessão inteira (as 10 últimas)
    setUltimasManuais((antes) => {
      const outras = antes.filter((u) => !finais.some((f) => f.contractId === u.contractId))
      return [...finais, ...outras].sort((a, b) => b.startTime - a.startTime).slice(0, 10)
    })
  }, [minhas])
  // tira do gráfico as que passaram dos 2 minutos
  useEffect(() => {
    if (!encerradas.length) return
    const t = window.setInterval(() => setEncerradas((l) => { const v = l.filter((e) => e.ate > Date.now()); return v.length === l.length ? l : v }), 5_000)
    return () => window.clearInterval(t)
  }, [encerradas.length])

  const doAtivo = useMemo(() => {
    const vivas = minhas.filter((c) => c.symbol === symbolCode)
    const guardadas = encerradas.map((e) => e.c).filter((c) => c.symbol === symbolCode && !vivas.some((v) => v.contractId === c.contractId))
    return [...vivas, ...guardadas]
  }, [minhas, encerradas, symbolCode])
  // memorizado por assinatura: o grafico so redesenha quando algo muda de verdade
  const chaveMarcadores = doAtivo
    .map((c) => `${c.contractId}:${c.entrySpot}:${c.exitSpot}:${c.status}:${c.expiryTime}:${c.profit.toFixed(2)}`)
    .join('|')
  const marcadores: ContractMarker[] = useMemo(
    () =>
      doAtivo.map((c) => ({
        id: c.contractId, type: c.contractType, entryEpoch: c.startTime,
        entryPrice: c.entrySpot, expiryEpoch: c.expiryTime, profit: c.profit,
        // só o preço de saída da própria Deriv: o atual poderia mostrar um dígito que não decidiu nada
        status: c.status, exitPrice: c.exitSpot ?? null,
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
  const podeOperar = conta.status === 'logado' && !!conta.socket && !conta.connecting && linhaAberta && !!symbolCode && mercadoAberto
  // Por que o botao esta travado — para o cliente nao ficar adivinhando.
  const motivoBloqueio = podeOperar ? null
    : conta.status !== 'logado' ? 'Conecte a Deriv para operar'
    : !symbolCode ? 'Escolha um ativo'
    : !mercadoAberto ? 'Mercado fechado agora'
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
    // o valor digitado ainda não virou número (ex.: "0," no meio da troca): nunca compra o valor antigo
    if (stakeTexto !== null && lerValor(stakeTexto) !== stake) {
      setAviso({ tipo: 'erro', texto: 'Confira o valor da entrada antes de comprar.' })
      return
    }
    if (!conta.isDemo && confirmar !== tipo) { setConfirmar(tipo); return }
    setConfirmar(null)
    await executar(tipo, { duration, durationUnit: unidade })
  }

  /*
    Atalhos da boleta (computador): Shift+↑ compra Subir, Shift+↓ compra
    Descer, + e − mudam o valor. Com Shift de propósito: uma seta solta rola a
    página, e compra por engano não pode acontecer. Na conta real o primeiro
    atalho arma e o segundo confirma, igual ao clique. Nunca dispara digitando
    num campo nem com uma janela aberta por cima.
  */
  const atalhoRef = useRef<(e: KeyboardEvent) => void>(() => {})
  atalhoRef.current = (e: KeyboardEvent) => {
    // tecla segurada repete o evento: a repetição nunca conta (senão armava e confirmava a conta real num gesto só)
    if (e.repeat || tela !== 'operar' || modo !== 'direcao' || e.ctrlKey || e.metaKey || e.altKey) return
    const alvo = e.target as HTMLElement | null
    if (alvo && (alvo.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName))) return
    if (document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], .ativo-menu')) return
    // foco dentro de qualquer painel (suporte, indicadores, chat da sala): o atalho não é dele
    if (alvo?.closest('dialog, [role="dialog"], .ativo-menu')) return
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault()
      if (!podeOperar || comprando) return
      void comprar(e.key === 'ArrowUp' ? 'CALL' : 'PUT')
    } else if (e.key === '+' || e.key === '=' || e.key === '-') {
      e.preventDefault()
      const sobe = e.key === '+' || e.key === '='
      const degraus = [0.35, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 2000, 5000]
      const v = sobe ? degraus.find((d) => d > stake + 1e-9) ?? stake : [...degraus].reverse().find((d) => d < stake - 1e-9) ?? 0.35
      setStake(v); setStakeTexto(null)
    }
  }
  useEffect(() => {
    const ouvir = (e: KeyboardEvent) => atalhoRef.current(e)
    window.addEventListener('keydown', ouvir)
    return () => window.removeEventListener('keydown', ouvir)
  }, [])

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
      const r = await buyFromProposal(conta.socket, p.id, p.askPrice).catch((e: Error) => {
        // "[LinhaFechada]" e a unica recusa em que NADA foi enviado. Qualquer
        // outra falha depois do envio pode ter comprado: fica de olho.
        if (!/LinhaFechada/.test(e.message)) setCompraPendente({ valor: stake, desde: Date.now() })
        throw e
      })
      marcarManual(r.contractId)
      if (p.appMarkup !== null) markupOficial.current.set(r.contractId, p.appMarkup)
      setAviso({
        tipo: 'ok',
        texto: `Entrada feita: ${dinheiro(r.buyPrice, moeda)} · se ganhar, recebe ${dinheiro(r.payout, moeda)}.`,
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
      setAviso({ tipo: 'ok', texto: `Posição encerrada por ${dinheiro(r.soldFor, moeda)}.` })
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
  /*
    `situacao === null` é "ainda lendo do banco". Sem esperar por ela, quem
    está em análise e ainda tem a senha provisória veria a tela de criar
    senha piscar antes da tela de espera — a ordem certa aparecendo errada
    por uma fração de segundo. Quem veio de um link de e-mail não espera:
    esse fluxo não depende da situação da ficha.
  */
  const lendoSituacao = teeds.status === 'logado' && situacao === null && !teeds.redefinindo
  const abrindo = teeds.status === 'carregando' || lendoSituacao
  // A decolagem: só quem acabou de entrar pelo login (deslogado → logado).
  // Quem reabre o app já logado vê só o carregando, sem voo.
  const statusAnterior = useRef(teeds.status)
  useEffect(() => {
    if (MARCA.decolagem && statusAnterior.current === 'deslogado' && teeds.status === 'logado') decolar(teeds.sessao?.usuario.nome ?? null)
    statusAnterior.current = teeds.status
  }, [teeds.status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!abrindo) liberarPouso() }, [abrindo])
  if (abrindo) {
    if (MARCA.decolagem) return <Carregando />
    return <div className="entrada"><div className="entrada-esperando">abrindo a {MARCA.prosa}…</div></div>
  }

  /*
    Veio de um link de e-mail para definir a senha. Vem antes de tudo, inclusive
    de quem espera aprovação: quem clicou no link de "esqueci a senha" precisa
    conseguir criar a senha, senão fica preso na tela de espera sem saída.
  */
  if (teeds.redefinindo) {
    return (
      <NovaSenha ocupado={teeds.ocupado} erro={teeds.erro} onDefinir={teeds.definirNovaSenha}
        obrigatoria={false} onSair={sairDeTudo} />
    )
  }

  /*
    Entrou, mas o cadastro ainda não foi aprovado. A conta existe desde o
    cadastro; a plataforma, só depois da liberação.

    Esta tela vem ANTES da troca de senha obrigatória (decisão do Tiago em
    30/09/2026): enquanto o cadastro está em análise não há o que fazer lá
    dentro, e obrigar a criar uma senha para em seguida mostrar "aguarde" é
    pedir trabalho sem entregar nada. A senha provisória só é trocada no
    primeiro acesso DEPOIS da aprovação, que é quando a plataforma abre.
  */
  if (teeds.status === 'logado' && teeds.sessao && situacao === 'pendente') {
    return (
      <CadastroEmAnalise
        email={teeds.sessao.usuario.email}
        nome={teeds.sessao.usuario.nome}
        aoConferir={async () => {
          const agora = await minhaSituacao(teeds.sessao!)
          setSituacao(agora)
          return agora !== 'pendente'
        }}
        aoSair={sairDeTudo}
      />
    )
  }

  // Aprovado e ainda com a senha provisória: cria a própria antes de entrar.
  if (teeds.status === 'logado' && teeds.precisaTrocarSenha) {
    return (
      <NovaSenha ocupado={teeds.ocupado} erro={teeds.erro} onDefinir={teeds.definirNovaSenha}
        obrigatoria onSair={sairDeTudo} />
    )
  }

  if (teeds.status === 'deslogado') {
    const convite = LIVES_AO_VIVO && !querLogin ? conviteRecebido() : null
    const treinoSemConta = MARCA.aoVivo && !querLogin && treinoPedido()
    if (convite || treinoSemConta) {
      return <Suspense fallback={null}><Convidado codigo={convite} treino={treinoSemConta} aoEntrarNaConta={() => setQuerLogin(true)} /></Suspense>
    }
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
  // gráfico profissional: na GlobalFly, por enquanto só para administradores
  const usarGraficoPro = MARCA.graficoPro === 'todos' || (MARCA.graficoPro === 'admin' && admin === true)

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
      <WorkspaceNav page={tela} admin={admin === true} aoVivoAgora={aoVivoAgora} mostrarAoVivo={mostrarAoVivo} mostrarInicio={!!MARCA.inicio} onNavigate={next => {
        setVerPerfil(false)
        if (next === 'assistente') abrirAssistente()
        else setTela(next)
      }} />
      <header className="topbar">
        <div className="workspace-heading"><strong>{PAGE_NAMES[tela]}</strong><span>{tela === 'inicio' ? 'Sua mesa de operações' : tela === 'operar' ? 'Seu terminal de negociação, na mão' : tela === 'robos' ? 'Estratégias e acompanhamento' : tela === 'gestao' ? 'Controle da plataforma' : tela === 'insights' ? 'Inteligência da plataforma' : tela === 'monitoramento' ? 'Cabines dos clientes, ao vivo e somente leitura' : tela === 'aovivo' ? (LIVES_AO_VIVO ? 'Transmissões com a equipe, em tempo real' : 'Sala de treino da equipe, em tempo real') : tela === 'noticias' ? 'Cotações e as principais notícias do mercado' : tela === 'perfil' ? 'Seus dados, seu plano e sua segurança' : tela === 'ajuda' ? 'Respostas rápidas e o suporte da equipe' : 'Seu espaço de trabalho'}</span></div>

        <div className="topbar-right">
          <RelogioTopo />
          {!derivPronta && (
            <button className="btn-deriv" onClick={conta.login}
              disabled={conta.status === 'entrando'}>
              <IconeElo />
              {conta.status === 'entrando' ? 'Abrindo…' : <>Conectar <DerivLogo altura={13} cor="#fff" /></>}
            </button>
          )}

          {conta.status === 'logado' && conta.accounts.length > 0 && (
            <AccountSwitcher
              admin={admin}
              email={teeds.sessao?.usuario.email}
              contas={conta.accounts}
              contasDemonstracao={conta.demonstrationAccounts}
              somenteDemo={conta.somenteDemo}
              selecionada={conta.accountId}
              isDemo={conta.isDemo}
              saldo={conta.balance ? conta.balance.amount : null}
              moeda={conta.balance?.currency ?? conta.account?.currency ?? 'USD'}
              conectando={conta.connecting}
              onTrocar={conta.setAccountId}
              onRecarregar={() => conta.recarregarDemo()}
              onAbrir={() => void conta.atualizarContas()}
              onSair={conta.logout}
            />
          )}

          {MARCA.aoVivo && liveAgora && !playerAoVivo && tela !== 'aovivo' && (
            <button className="selo-tv" onClick={() => setTela('aovivo')} title={`Ao vivo agora: ${liveAgora.titulo}`}
              aria-label={`Transmissão ao vivo agora: ${liveAgora.titulo}. Assistir`}>
              <i aria-hidden="true" />Ao vivo
            </button>
          )}
          {MARCA.aoVivo && !liveAgora && treinoAgora && !treinoAtivo && tela !== 'aovivo' && (
            <button className="selo-tv" onClick={() => setTela('aovivo')} title="Sala de treino ao vivo agora"
              aria-label="Sala de treino ao vivo agora. Entrar na sala">
              <i aria-hidden="true" />Ao vivo
            </button>
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
            <UserMenu usuario={teeds.usuario} onSair={sairDeTudo} foto={fotoPerfil}
              onPerfil={() => (MARCA.inicio ? setTela('perfil') : setVerPerfil(true))} />
          )}
        </div>
      </header>

      {MARCA.inicio && teeds.sessao && tela !== 'robos' && (
        <MiniCabine sessoes={vivasRobos} sessao={teeds.sessao} demo={conta.status === 'logado' ? conta.isDemo : undefined} demoComoReal={conta.somenteDemo} aoAbrirCabine={() => setTela('robos')}
          aoParar={async (id) => { if (teeds.sessao) await pararNoServidor(teeds.sessao, id) }} />
      )}
      {MARCA.inicio && teeds.sessao && <BarraInferior tela={tela} aoVivoAgora={aoVivoAgora} irPara={(t) => { setVerPerfil(false); setTela(t) }} />}

      {MARCA.suporte && teeds.sessao && (
        <Suspense fallback={null}>
          <SuporteWidget sessao={teeds.sessao} nome={teeds.usuario?.nome || ''} telaAtual={tela} admin={adminConfirmado}
            escondido={tela === 'aovivo' || (adminConfirmado && tela === 'gestao')}
            irPara={(t) => setTela(t as WorkspacePage)} onAbrirCaixa={abrirCaixaDoSuporte} />
        </Suspense>
      )}

      {tour && teeds.sessao && (
        <TourGuiado passos={passosDoTour({ nome: teeds.usuario?.nome || '', treino: !!MARCA.aoVivo && (membroTreino === true || admin === true) })}
          obrigatorio={tour === 'obrigatorio'} telaAtual={tela} irPara={setTela}
          aoTerminar={(destino) => fimDoTour(destino)} aoFechar={() => (tour === 'obrigatorio' ? fimDoTour() : setTour(null))} />
      )}

      {verPerfil && teeds.sessao && (
        <ProfilePanel
          sessao={teeds.sessao}
          contas={contasParaMostrar}
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
        <CatalogoProvider sessao={teeds.sessao}>
        <RobotsPanel
          socket={conta.socket}
          logado={conta.status === 'logado'}
          isDemo={conta.isDemo}
          demoComoReal={conta.somenteDemo}
          moeda={conta.account?.currency ?? 'USD'}
          symbols={symbols}
          symbolPadrao={symbolCode}
          conexao={conta.conexao}
          entrandoNaDeriv={conta.status === 'entrando'}
          onConectarDeriv={conta.login}
          sessaoTeeds={teeds.sessao}
          contaId={conta.accountId}
          admin={adminConfirmado}
          mostrarMarkup={mostrarColuna}
          onSessoesVivas={setVivasRobos}
        />
        </CatalogoProvider>
      </div>
      {MARCA.aoVivo && avisoLive && !playerAoVivo && tela !== 'aovivo' && (
        <div className="aviso-tv" role="status">
          <span className="aviso-tv-selo"><i aria-hidden="true" />Ao vivo agora</span>
          <b>{avisoLive.titulo}</b>
          <button className="aviso-tv-assistir" onClick={() => { setAvisoLive(null); setTela('aovivo') }}>Assistir</button>
          <button className="aviso-tv-fechar" onClick={() => setAvisoLive(null)} aria-label="Fechar aviso"><IconeFechar /></button>
        </div>
      )}
      {MARCA.aoVivo && treinoAgora && avisoTreino && !treinoAtivo && tela !== 'aovivo' && (
        <div className="aviso-tv aviso-treino" role="status">
          <span className="aviso-tv-selo"><i aria-hidden="true" />Ao vivo</span>
          <button className="aviso-treino-texto" onClick={() => { setAvisoTreino(false); setTela('aovivo') }}>
            <b>Live iniciada.</b> Clique para entrar na sala.
          </button>
          <button className="aviso-tv-assistir" onClick={() => { setAvisoTreino(false); setTela('aovivo') }}>Entrar</button>
          <button className="aviso-tv-fechar" onClick={() => setAvisoTreino(false)} aria-label="Fechar aviso"><IconeFechar /></button>
        </div>
      )}
      {MARCA.aoVivo && treinoAtivo && <Suspense fallback={null}><PlayerDoTreino naPagina={tela === 'aovivo'} abrirPagina={() => setTela('aovivo')} /></Suspense>}
      {MARCA.aoVivo && playerAoVivo && <Suspense fallback={null}><PlayerAoVivo naPagina={tela === 'aovivo'} abrirPagina={() => setTela('aovivo')} /></Suspense>}
      {tela === 'robos' || tela === 'assistente' ? null : tela === 'inicio' && MARCA.inicio ? (
        <Suspense fallback={<div className="ger"><div className="adm-vazio">Abrindo o início…</div></div>}>
          <InicioPagina sessao={teeds.sessao} nome={teeds.usuario?.nome || ''}
            conta={{ conectada: conta.status === 'logado', demo: conta.isDemo && !conta.somenteDemo, saldo: conta.balance ? conta.balance.amount : null, moeda: conta.account?.currency ?? 'USD' }}
            treino={membroTreino === true && admin !== true ? { noAr: !!treinoAgora, apresentador: treinoAgora?.apresentador ?? undefined } : null}
            aoIr={setTela} aoConectar={conta.login} vivas={teeds.sessao ? vivasRobos : undefined} />
        </Suspense>
      ) : tela === 'perfil' && MARCA.inicio && teeds.sessao ? (
        <Suspense fallback={<div className="ger"><div className="adm-vazio">Abrindo seu perfil…</div></div>}>
          <MeuPerfil sessao={teeds.sessao} contas={contasParaMostrar} derivConectada={conta.status === 'logado'} onConectarDeriv={conta.login}
            onMudou={({ nome, fotoUrl }) => { setFotoPerfil(fotoUrl); if (teeds.usuario) teeds.atualizarUsuario({ ...teeds.usuario, nome }) }} />
        </Suspense>
      ) : tela === 'ajuda' && MARCA.suporte ? (
        <Suspense fallback={<div className="ger"><div className="adm-vazio">Abrindo a ajuda…</div></div>}>
          <AjudaPagina aoIr={(t) => setTela(t as WorkspacePage)} />
        </Suspense>
      ) : tela === 'aovivo' && MARCA.aoVivo ? (
        <Suspense fallback={<div className="ger"><div className="adm-vazio">Abrindo a transmissão…</div></div>}><AoVivoPage sessao={teeds.sessao} admin={admin === true} /></Suspense>
      ) : tela === 'noticias' && MARCA.noticias ? (
        <Suspense fallback={<div className="ger"><div className="adm-vazio">Abrindo as notícias…</div></div>}><MercadoPanel /></Suspense>
      ) : tela === 'aulas' ? (
        <Suspense fallback={telaAbrindo('Abrindo as aulas…')}><AulasPanel nome={teeds.usuario?.nome} sessao={teeds.sessao} aoReverTour={MARCA.inicio ? () => setTour('rever') : undefined}
          aoIr={(t) => setTela(t as WorkspacePage)} treino={MARCA.aoVivo && (membroTreino === true || admin === true) ? { noAr: !!treinoAgora } : null} /></Suspense>
      ) : tela === 'marketplace' ? (
        <Suspense fallback={telaAbrindo('Abrindo o marketplace…')}><MarketplacePanel sessao={teeds.sessao} /></Suspense>
      ) : tela === 'gerenciamento' ? (
        <CatalogoProvider sessao={teeds.sessao}><Suspense fallback={telaAbrindo('Abrindo o gerenciamento…')}><OperationalManagementPanel /></Suspense></CatalogoProvider>
      ) : tela === 'monitoramento' && admin === true ? (
          teeds.sessao ? <MonitoramentoBoundary><Suspense fallback={<div className="ger"><div className="adm-vazio">Abrindo o monitoramento…</div></div>}><MonitoramentoPanel key={marcaEmFoco} sessao={teeds.sessao} mostrarMarkup={mostrarColuna} onMostrarMarkup={alterarColuna} /></Suspense></MonitoramentoBoundary> : null
      ) : tela === 'insights' && admin === true ? (
        teeds.sessao ? <Suspense fallback={telaAbrindo('Abrindo os insights…')}><InsightsPanel key={marcaEmFoco} sessao={teeds.sessao} mostrarMarkup={mostrarColuna} onMostrarMarkup={alterarColuna} /></Suspense> : null
      ) : tela === 'gestao' && admin === true ? (
        teeds.sessao && adminConfirmado ? <Suspense fallback={telaAbrindo('Abrindo a administração…')}><AdminPanel abrirSuporte={pedidoCaixa} nomeDaEquipe={teeds.usuario?.nome || ''} sessao={teeds.sessao} mostrarMarkup={mostrarColuna} onMostrarMarkup={alterarColuna} comissoes={<Suspense fallback={telaAbrindo('Abrindo as comissões…')}><ManagementPanel
          session={conta.session} sessaoTeeds={teeds.sessao} contaId={conta.accountId}
          socket={conta.socket} isDemo={conta.isDemo} onReautorizar={() => startLogin()}
          payoutBase={payoutBase} moeda={conta.account?.currency ?? 'USD'} pulso={conta.pulso}
          entrandoNaDeriv={conta.status === 'entrando'} onConectarDeriv={conta.login}
        /></Suspense>} onNavigate={setTela} /></Suspense> : null
      ) : (
      <div className="layout layout-operar">
        <main className="main">
          <div className="chart-head">
            <div className="chart-title">
              <div className="ativo-seletor-wrap">
                <button className="ativo-seletor" onClick={() => setSeletorAtivo((aberto) => !aberto)}
                  aria-expanded={seletorAtivo} aria-haspopup="dialog">
                  {MARCA.iconesDeAtivos && activeSymbol && <IconeAtivo simbolo={activeSymbol.symbol} tamanho={34} />}
                  <span className="manual-ativo-texto"><small>Ativo</small><strong>{activeSymbol?.name ?? 'Escolher ativo'}</strong></span><i aria-hidden>⌄</i>
                </button>
                {seletorAtivo && (
                  <div className="ativo-menu" role="dialog" aria-label="Escolher ativo">
                    <div className="ativo-menu-topo">
                      <b>Trocar ativo</b>
                      <button onClick={() => setSeletorAtivo(false)} aria-label="Fechar seletor"><IconeFechar /></button>
                    </div>
                    <input className="search" autoFocus placeholder="Buscar ativo…" value={search}
                      onChange={(e) => setSearch(e.target.value)} />
                    <div className="symbol-list">
                      {loadingSymbols && <p className="hint">carregando ativos…</p>}
                      {symbolsError && <p className="hint error">{symbolsError}</p>}
                      {groups.map(([market, list]) => (
                        <section key={market}>
                          <h4>{NOME_DO_MERCADO[market] ?? market.replace(/_/g, ' ')}</h4>
                          {list.map((s) => (
                            <button key={s.symbol}
                              className={`symbol ${s.symbol === symbolCode ? 'is-active' : ''}`}
                              onClick={() => { setSelected(s.symbol); setSeletorAtivo(false); setSearch('') }}>
                              {MARCA.iconesDeAtivos && <IconeAtivo simbolo={s.symbol} />}
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
              <div className="manual-cotacao"><small>Cotação</small><span className={`price ${direction ?? ''}`}>{price !== null ? formatPrice(price, pipSize) : '—'}</span></div>
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

          {!usarGraficoPro && <div className="indicadores" aria-label="Indicadores do gráfico">
            <span>Indicadores</span>
            <div>
              {INDICADORES.map((item) => {
                const ativo = indicadores.includes(item.id)
                const titulo = item.id === 'sma' ? `Média móvel simples de ${periodos.sma} períodos (clique na linha para mudar)`
                  : item.id === 'ema' ? `Média móvel exponencial de ${periodos.ema} períodos (clique na linha para mudar)` : item.titulo
                const rotulo = item.id === 'sma' ? `Média ${periodos.sma}` : item.id === 'ema' ? `EMA ${periodos.ema}` : item.label
                return <button key={item.id} className={ativo ? 'on' : ''} title={titulo}
                  aria-pressed={ativo} onClick={() => setIndicadores((atuais) =>
                    ativo ? atuais.filter((id) => id !== item.id) : [...atuais, item.id])}>
                  <i />{rotulo}
                </button>
              })}
            </div>
          </div>}

          {usarGraficoPro ? (
            <div className="chart">
              <Suspense fallback={<div className="gp-carregando-pagina">Abrindo o gráfico…</div>}>
                <GraficoPro candles={candles} mode={mode} pipSize={pipSize} symbol={symbolCode ?? ''} symbolName={activeSymbol?.name ?? ''}
                  granularity={granularity} loading={loadingCandles} markers={marcadores} sessao={teeds.sessao}
                  sinalLiberado={sinalGFLiberado(teeds.sessao?.usuario.email, MARCA.id)} />
              </Suspense>
            </div>
          ) : (
            <PriceChart candles={candles} mode={mode} pipSize={pipSize} symbol={symbolCode ?? undefined}
              symbolName={activeSymbol?.name ?? ''} loading={loadingCandles}
              markers={marcadores} indicators={indicadores} />
          )}
        </main>

        <aside className="trade">
          {!derivPronta && (
            <DerivDesconectada compacto
              acao="O gráfico e os dígitos são públicos, mas comprar exige a sua conta."
              entrando={conta.status === 'entrando'}
              onConectar={conta.login} />
          )}

          <section className="bl" aria-label="Boleta de operação">
            <BoletaAtivo nome={activeSymbol ? nomeDoAtivo(activeSymbol.name) : ''} preco={tick?.quote ?? null} pipSize={pipSize}
              direcao={direction} sintetico={sintetico} aberto={mercadoAberto} />
            <div className="bl-abas" role="tablist" aria-label="Tipo de operação">
              <button type="button" role="tab" aria-selected={modo === 'direcao'} className={modo === 'direcao' ? 'on' : ''} onClick={() => setModo('direcao')}>Subir / Descer</button>
              {sintetico && <button type="button" role="tab" aria-selected={modo === 'digitos'} className={modo === 'digitos' ? 'on' : ''} onClick={() => setModo('digitos')}>Dígitos</button>}
            </div>
            <div className="bl-corpo">
              {/* texto enquanto digita: dá para apagar e escrever; aceita vírgula ou ponto, e o mínimo da Deriv vale ao sair do campo */}
              <MostradorValor stake={stake} texto={stakeTexto} moeda={moeda} alerta={acimaDoSaldo} saldo={conta.balance?.amount ?? null}
                aoMudarTexto={(t) => { setStakeTexto(t); const n = lerValor(t); if (n >= 0.35) setStake(n) }}
                aoMudar={(v) => { setStake(v); setStakeTexto(null) }}
                aoSair={() => { const n = lerValor(stakeTexto ?? ''); if (stakeTexto !== null) setStake(Math.max(0.35, Number.isFinite(n) ? Math.round(n * 100) / 100 : 0.35)); setStakeTexto(null) }} />
              {acimaDoSaldo && conta.balance && (
                <p className="bl-alerta">Acima do seu saldo ({dinheiro(conta.balance.amount, moeda)}). A Deriv vai recusar.</p>
              )}
              <i className="bl-sep" aria-hidden="true" />
              {modo === 'direcao' ? (
                <>
                  <MostradorDuracao duracao={duration} unidade={unidade} faixa={faixa}
                    disponiveis={{ t: !!limites.ticks, s: !!limites.segundos, m: !!limites.minutos }}
                    aoMudar={setDuration} aoTrocarUnidade={trocarUnidade} aoSair={() => setDuration(dentroDaFaixa)} />
                  <div className="bl-comprar">
                    <BotaoCompra tipo="sobe" payout={call.payout} stake={stake} moeda={moeda}
                      carregando={call.loading} erro={call.error ? traduzirErro(call.error) : null}
                      podeOperar={podeOperar} motivoBloqueio={motivoBloqueio}
                      comprando={comprando === 'CALL'} confirmando={confirmar === 'CALL'}
                      aoComprar={() => comprar('CALL')} />
                    <BotaoCompra tipo="desce" payout={put.payout} stake={stake} moeda={moeda}
                      carregando={put.loading} erro={put.error ? traduzirErro(put.error) : null}
                      podeOperar={podeOperar} motivoBloqueio={motivoBloqueio}
                      comprando={comprando === 'PUT'} confirmando={confirmar === 'PUT'}
                      aoComprar={() => comprar('PUT')} />
                  </div>
                  <ResumoDaCompra payouts={[call.payout, put.payout]} stake={stake} moeda={moeda} duracao={duration} unidade={unidade} />
                  <p className="bl-atalho">Atalhos: <kbd>Shift</kbd> <kbd>↑</kbd> Subir · <kbd>Shift</kbd> <kbd>↓</kbd> Descer · <kbd>+</kbd> <kbd>−</kbd> valor</p>
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
            </div>
          </section>

          {aviso && (
            <p role="status" aria-live="polite"
              className={`aviso ${aviso.tipo === 'ok' ? 'aviso-ok' : 'aviso-erro'}`}>{aviso.texto}</p>
          )}

          <section className="bl-posicoes" aria-label="Posições abertas">
            {minhas.length > 1 && (
              <div className="bl-posicoes-cab">
                <span>{minhas.length} posições abertas<small>Investido {dinheiro(investido, moeda)}</small></span>
                <b className={resultadoAberto >= 0 ? 'ganho' : 'perda'}>{resultadoAberto >= 0 ? '+' : '−'}{dinheiro(Math.abs(resultadoAberto), moeda)}</b>
              </div>
            )}
            {!derivPronta && <div className="bl-posicoes-vazio">Conecte sua Deriv para acompanhar posições.</div>}
            {derivPronta && minhas.length === 0 && (
              <div className="bl-posicoes-vazio">As entradas que você fizer aqui aparecem nesta lista, com o resultado ao vivo.</div>
            )}
            {minhas.map((c) => (
              <PositionCard key={c.contractId} contrato={c}
                nomeAtivo={nomeDoAtivo(symbols.find((s) => s.symbol === c.symbol)?.name ?? c.symbol)}
                onEncerrar={encerrar} encerrando={vendendo === c.contractId} />
            ))}
          </section>

          {ultimasManuais.length > 0 && (
            <UltimasEntradas operacoes={ultimasManuais} markupDe={adminConfirmado && mostrarColuna ? markupDaManual : undefined}
              nomeDoAtivo={(simbolo) => nomeDoAtivo(symbols.find((s) => s.symbol === simbolo)?.name ?? simbolo)} />
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
