/**
 * LABORATÓRIO — as telas que exigem a Deriv conectada, com dados de mentira.
 *
 *   npx vite            → http://localhost:5180/laboratorio.html
 *
 * Existe por causa da revisão de celular (07/10/2026). A cabine ao vivo e o
 * preparo dos robôs só aparecem com a corretora conectada e um robô rodando —
 * e isso não dá para medir com uma sessão de teste sem Deriv. Aqui os mesmos
 * componentes de produção são montados com uma sessão inventada: 14
 * operações, uma em curso, registros, dígitos, curva.
 *
 * Só desenvolvimento: o Vite monta apenas o `index.html` na publicação, então
 * este arquivo nunca chega ao site. Não há rede nem conta envolvida.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/app.css'
import './styles/tema.css'
import './styles/ux-refinements.css'
import './styles/mobile-polish.css'
// o padrão de página (largura, margens) vem por último: vale sobre o resto
import './styles/pagina.css'
import './components/robot-workspace.css'
import './components/workspace.css'
import { aplicarTema, temaGuardado } from './core/tema'
import { MARCA } from './marca'
import { LoginScreen } from './components/LoginScreen'
import { RobotCartao } from './components/RobotResumo'
import { IDENTIDADES } from './core/deriv/branding'
import { parametrosPadrao } from './core/deriv/parametros'
import type { ConfigEstrategia, EstadoMotor, OperacaoMotor, Registro } from './core/deriv/engine'
import type { ActiveSymbol } from './core/deriv/types'
import { RobotLive } from './components/RobotLive'
import { RobotSetup } from './components/RobotSetup'
import { VitrineDeRobos } from './components/VitrineDeRobos'
import { WorkspaceNav } from './components/WorkspaceNav'
import { IconeAtivo } from './components/IconeAtivo'
import { RobotCatalog } from './components/RobotCatalog'
import { AulasPanel } from './components/AulasPanel'
import { MercadoPanel } from './components/MercadoPanel'
import { PriceChart } from './components/PriceChart'

/** Velas de mentira para o laboratório: passeio aleatório com semente fixa. */
const VELAS = (() => {
  let p = 1000, sem = 7
  const r = () => { sem = (sem * 16807) % 2147483647; return sem / 2147483647 - 0.5 }
  return Array.from({ length: 1000 }, (_, i) => {
    const open = p; const close = open + r() * 6 + Math.sin(i / 40) * 0.8
    p = close
    return { epoch: 1760000000 + i * 60, open, close, high: Math.max(open, close) + Math.abs(r()) * 3, low: Math.min(open, close) - Math.abs(r()) * 3 }
  })
})()
import { lazy, Suspense, useEffect, useState } from 'react'
const SalaDeTreino = lazy(() => import('./components/aovivo/SalaDeTreino').then((m) => ({ default: m.SalaDeTreino })))
const LabRecorte = lazy(() => import('./components/aovivo/LabRecorte'))
const TesteAtraso = lazy(() => import('./components/aovivo/TesteAtraso'))
const LabGraficoPro = lazy(() => import('./components/grafico/LabGraficoPro'))
const LabOperar = lazy(() => import('./components/operar/LabOperar'))
const LabAoVivo = lazy(() => import('./components/aovivo/AoVivo').then((m) => ({ default: m.LabAoVivo })))
const LabInicio = lazy(() => import('./components/inicio/LabInicio'))
const LabPerfil = lazy(() => import('./components/perfil/LabPerfil'))
const LabSuporte = lazy(() => import('./components/suporte/LabSuporte'))
function LabAulas() {
  const q = new URLSearchParams(location.search)
  const t = q.get('tema'); if (t) document.documentElement.dataset.tema = t
  return (
    <div className="app workspace-app">
      <WorkspaceNav page="aulas" admin={false} mostrarInicio onNavigate={() => undefined} />
      <header className="topbar"><div className="workspace-heading"><strong>Aulas</strong><span>Seu espaço de trabalho</span></div></header>
      <AulasPanel nome="Tiago Dal Ri" sessao={null} aoReverTour={() => undefined} aoIr={() => undefined} treino={{ noAr: q.has('aovivo') }} />
    </div>
  )
}
function LabLogin() {
  const q = new URLSearchParams(location.search)
  const t = q.get('tema'); if (t) document.documentElement.dataset.tema = t
  const cena = q.get('cena') === 'rastro' ? 'rastro' : 'nuvens'
  const nada = async () => false
  // &voo=1: "Entrar" decola de verdade (sem conta): o início abre por baixo depois de `&espera=` ms
  const [entrou, setEntrou] = useState(false)
  useEffect(() => { if (entrou) liberarPouso() }, [entrou])
  if (entrou) return <Suspense fallback={<Carregando />}><LabInicio /></Suspense>
  const entrar = async () => {
    if (!q.has('voo')) return false
    decolar('Tiago Dalri')
    window.setTimeout(() => setEntrou(true), Number(q.get('espera') ?? 900))
    return true
  }
  return (
    <>
      <LoginScreen ocupado={false} limparErro={() => undefined} onEntrar={entrar} onCadastrar={async () => ({ ok: false })} onEsqueci={nada} cena={cena} />
      <Decolagem />
    </>
  )
}
const LabMiniCabine = lazy(() => import('./components/minicabine/LabMiniCabine'))
const LabAssistirTreino = lazy(() => import('./components/aovivo/AssistirTreino').then((m) => ({ default: m.LabAssistirTreino })))
import { DerivDesconectada } from './components/DerivDesconectada'
import { DigitosFlutuante } from './components/DigitosFlutuante'
import { Decolagem } from './components/entrada/Decolagem'
import { Carregando } from './components/entrada/Carregando'
import { decolar, liberarPouso } from './core/decolagem'
import { CatalogoDeExemplo } from './core/teeds/catalogoRobos'
import { ligarEscala } from './core/escala'

document.documentElement.dataset.marca = MARCA.id
// &tema=claro|escuro vale em qualquer tela do laboratório (conferência dos dois temas)
{ const t = new URLSearchParams(location.search).get('tema'); aplicarTema(t === 'claro' || t === 'escuro' ? t : temaGuardado()) }
// no computador a página nasce em 90% (ver core/escala.ts)
ligarEscala()
// &app=1: simula o app instalado num iPhone (barra de status de 47 px)
if (new URLSearchParams(location.search).has('app')) {
  document.documentElement.classList.add('app-instalado')
  document.documentElement.style.setProperty('--sat', '47px')
  document.documentElement.style.setProperty('--sab', '34px')
}

const ident = IDENTIDADES[0]
const CATALOGO_LAB = IDENTIDADES
const AGORA = Date.now()

const config: ConfigEstrategia = {
  valorInicial: 0.35, valorAoVencer: 0.35, fatorGale: 0.05, galeApos: 3,
  valorMaximo: 0, takeProfit: 5, stopLoss: 10, maxOperacoes: 0,
  parametros: parametrosPadrao(ident.id), parametrosVersao: 3,
}

/* Uma sessão que parece de verdade: ganhos e perdas intercalados, uma
   sequência de duas perdas no meio, e uma compra em andamento agora. */
const resultados = [true, true, false, true, true, true, false, false, true, true, false, true, true, true]
let acumulado = 0
const historico: OperacaoMotor[] = resultados.map((ganhou, i) => {
  const valor = ganhou ? 0.35 : 0.35 + i * 0.02
  const lucro = ganhou ? +(valor * 0.92).toFixed(2) : -valor
  acumulado = +(acumulado + lucro).toFixed(2)
  return {
    n: i + 1, contractId: 29100000 + i, valor, entrada: 46800 + i * 1.37, saida: 46800 + i * 1.37 + (ganhou ? 0.41 : -0.22),
    // o dígito sai do próprio preço de saída, como no motor (a tabela confere os dois)
    digitoEntrada: (i * 7) % 10, digitoSaida: Number((46800 + i * 1.37 + (ganhou ? 0.41 : -0.22)).toFixed(4).slice(-1)), lucro, payout: +(valor * 1.92).toFixed(2),
    markupDeriv: null, ganhou, quando: AGORA - (resultados.length - i) * 48_000, esperou: 4 + (i % 5),
    contractType: 'DIGITUNDER', barreira: 5, pipSize: 4,
  }
}).reverse()
const curva = resultados.reduce<number[]>((acc, g, i) => {
  const v = g ? 0.35 * 0.92 : -(0.35 + i * 0.02)
  acc.push(+((acc[acc.length - 1] ?? 0) + v).toFixed(2)); return acc
}, [])

const registros: Registro[] = [
  { hora: AGORA - 60_000 * 9, texto: 'Robô ligado · Volatility 75 Index', tipo: 'info' },
  { hora: AGORA - 60_000 * 8, texto: 'Aguardando 4 ticks de confirmação', tipo: 'espera' },
  { hora: AGORA - 60_000 * 7, texto: 'Compra: menor que 5 · US$ 0,35', tipo: 'compra' },
  { hora: AGORA - 60_000 * 6, texto: 'Ganhou +US$ 0,32', tipo: 'ganho' },
  { hora: AGORA - 60_000 * 5, texto: 'Compra: menor que 5 · US$ 0,35', tipo: 'compra' },
  { hora: AGORA - 60_000 * 4, texto: 'Perdeu −US$ 0,35 · recuperação 1 de 3', tipo: 'perda' },
  { hora: AGORA - 60_000 * 3, texto: 'Compra: menor que 5 · US$ 0,37', tipo: 'compra' },
  { hora: AGORA - 60_000 * 2, texto: 'Ganhou +US$ 0,34', tipo: 'ganho' },
  { hora: AGORA - 20_000, texto: 'Compra: menor que 5 · US$ 0,35', tipo: 'compra' },
]

const estadoRodando: EstadoMotor = {
  rodando: true, emOperacao: true, operacoes: 14, vitorias: 10, derrotas: 4, perdasSeguidas: 0,
  resultado: acumulado, movimentado: 5.12, valorAtual: 0.35, aguardando: '', motivoParada: null,
  registros, digitos: [3, 7, 1, 9, 4, 0, 2, 8, 5, 6, 3, 3, 9, 1, 4, 7, 2, 0, 8, 5, 1, 6, 3, 9, 2, 4, 7, 0, 5, 3],
  curva, condicao: { rotulo: 'Entrar quando', itens: [{ valor: '4 ticks sem dígito alvo', ok: true }, { valor: 'sem perda virtual', ok: true }] },
  ultimoLucro: 0.34, historico,
  emCurso: { contractId: 29100099, valor: 0.35, payout: 0.67, entrada: 46819.41, digitoEntrada: 1, spot: 46819.93, digitoAtual: 3, lucro: 0.32, comprouEm: AGORA - 20_000, latencia: 412, contractType: 'DIGITUNDER', barreira: 5 },
  ticksAnalisados: 3712, latenciaMedia: 388, falha: null, estrategia: null,
}
const estadoParado: EstadoMotor = {
  ...estadoRodando, rodando: false, emOperacao: false, emCurso: null, aguardando: '',
  motivoParada: 'Meta de ganho atingida: +US$ 5,00',
  registros: [...registros, { hora: AGORA, texto: 'Parou: meta de ganho atingida', tipo: 'parada' }],
}

const symbols: ActiveSymbol[] = [
  { symbol: 'R_75', name: 'Volatility 75 Index', market: 'synthetic_index', submarket: 'random_index', isOpen: true, isSuspended: false, pipSize: 4 },
  { symbol: '1HZ100V', name: 'Volatility 100 (1s) Index', market: 'synthetic_index', submarket: 'random_index', isOpen: true, isSuspended: false, pipSize: 2 },
]
const parametros = [
  { rot: 'Entrada', valor: 'US$ 0,35' }, { rot: 'Recuperação', valor: 'a partir da 1ª perda' },
  { rot: 'Meta', valor: 'US$ 5,00' }, { rot: 'Limite', valor: 'US$ 10,00' },
]
function LabVitrine() {
  const [preparo, setPreparo] = useState(false)
  return (
    <div className="ger rob robot-workspace">
      <div className="ger-topo rob-workspace-header"><div><span className="rob-eyebrow">CENTRAL DE ROBÔS</span><h2>Vamos iniciar sua jornada?</h2><p className="ger-sub">Escolha um modelo, defina seus limites e acompanhe a sessão.</p></div></div>
      <VitrineDeRobos onConfigurar={() => setPreparo(true)} />
      {preparo && <RobotSetup identidade={ident} nomeEstrategia={ident.nome} symbols={symbols} symbolInicial="R_75" configInicial={config} moeda="USD" isDemo contaId="VRTC1234567" escolherModelo onCancelar={() => setPreparo(false)} onLigar={nada} ligando={false} erro={null} />}
    </div>
  )
}

const nada = () => {}

function Cabine({ estado, expandido, titulo }: { estado: EstadoMotor; expandido: boolean; titulo: string }) {
  return (
    <div className={`cabine-caixa aberta ${expandido ? 'expandido' : ''} ${estado.rodando ? 'rodando' : 'parado'}`}
      style={{ ['--robo' as string]: ident.cor, ['--robo-suave' as string]: ident.corSuave } as React.CSSProperties}>
      <RobotLive
        estado={estado} config={config} moeda="USD"
        contaDaSessao={{ contaId: 'VRTC1234567', demo: true, moeda: 'USD' }}
        estrategiaId={ident.id} nomeEstrategia={ident.nome} ativo="Volatility 75 Index"
        titulo={titulo} regra="menor que 5" cor={ident.cor} ganhaCom={(d) => d < 5}
        parametros={parametros} conexao="open" expandido={expandido} onExpandir={nada}
        onDigitos={nada} digitosAberto={false} mostrarMarkup={false}
        onDesligar={estado.rodando ? nada : undefined} desligando={false}
        onLigarDeNovo={!estado.rodando ? nada : undefined} onRemover={nada}
      />
    </div>
  )
}

/** ?tela=espera — um robô de loss virtual (AG7/Gulf) ligado, ESPERANDO os 4 dígitos que teriam perdido. */
function CabineEspera({ mosaico = false }: { mosaico?: boolean }) {
  const gulf = CATALOGO_LAB.find((i) => i.id === 'superior5') ?? ident
  // os últimos dígitos: 2 seguidos abaixo de 7 (teriam perdido), de 4 que o robô espera
  const [digitos, setDigitos] = useState<number[]>([3, 7, 1, 9, 4, 0, 2, 8, 5, 6, 3, 8, 9, 1, 4, 7, 2, 0, 8, 5, 1, 6, 3, 9, 2, 4, 7, 9, 5, 3])
  const congelado = new URLSearchParams(location.search).has('liberada')
  const [operando, setOperando] = useState(congelado)
  const [lidos, setLidos] = useState(37)
  // o mercado de mentira: um dígito por segundo; com 5 seguidos entre 0 e 6 o robô "entra" por 2 s
  useEffect(() => {
    let parado = congelado
    if (congelado) setDigitos((d) => [...d.slice(-25), 4, 1, 6, 0, 3])
    const passo = () => {
      if (parado) return
      setDigitos((d) => {
        let seguidos = 0
        for (let i = d.length - 1; i >= 0 && d[i] < 7; i--) seguidos++
        if (seguidos >= 5) {
          setOperando(true); setLidos(0)
          window.setTimeout(() => { setOperando(false); setDigitos((x) => [...x.slice(-29), 7 + Math.floor(Math.random() * 3)]) }, 2200)
          return d
        }
        setLidos((n) => n + 1)
        // um pouco mais de dígitos baixos que o normal, para a demonstração não demorar
        return [...d.slice(-29), Math.random() < 0.8 ? Math.floor(Math.random() * 7) : 7 + Math.floor(Math.random() * 3)]
      })
      window.setTimeout(passo, 1100)
    }
    const t = window.setTimeout(passo, 800)
    return () => { parado = true; window.clearTimeout(t) }
  }, [])
  let seguidos = 0
  for (let i = digitos.length - 1; i >= 0 && digitos[i] < 7; i--) seguidos++
  const n = Math.min(5, seguidos)
  const condicao = { rotulo: n >= 5 ? 'Loss virtual confirmado — entrada liberada' : `Loss virtual — ${n}/5`, itens: Array.from({ length: 5 }, (_, i) => ({ valor: i < n ? '✕' : '·', ok: i >= n })) }
  const estado: EstadoMotor = { ...estadoRodando, emOperacao: operando, emCurso: operando ? estadoRodando.emCurso : null, digitos, aguardando: `esperando loss virtual — ${n}/5`, condicao, ticksAnalisados: lidos, perdasSeguidas: 0 }
  // os parâmetros publicados do GF Gulf (robos_parametros, globalfly, v1): loss virtual de 5
  const cfgGulf = { ...config, parametros: { v: 1, entrada: { lossVirtual: 5, sequenciaSemAnalise: true }, limites: { valorMaximoPorEntrada: 0 }, contrato: { barreira: 6, contractType: 'DIGITOVER' }, recuperacao: { modos: { agressivo: { margem: 1, sobrePrejuizo: 0.2 }, conservador: { margem: 0.05, sobrePrejuizo: 0 } }, escada: { tipo: 'formula' }, galeApos: 1, lucroMinimo: 0.01, descontoRetorno: 0.97 } } } as unknown as typeof config
  if (mosaico) return (
    <RobotCartao estado={estado} config={cfgGulf} moeda="USD" nome="GF Gulf" cor={gulf.cor} numero="#1" inicio={Date.now() - 600_000} demo modo="conservador" onDesligar={nada} onRemover={nada} onAbrirNaLista={nada} />
  )
  return (
    <div className="cabine-caixa aberta rodando" style={{ ['--robo' as string]: gulf.cor, ['--robo-suave' as string]: gulf.corSuave } as React.CSSProperties}>
      <RobotLive
        estado={estado} config={cfgGulf} moeda="USD" contaDaSessao={{ contaId: 'VRTC1234567', demo: true, moeda: 'USD' }}
        estrategiaId="superior5" nomeEstrategia={gulf.nome} ativo="Volatility 100 (1s) Index" titulo="GF Gulf" regra="maior que 6" cor={gulf.cor} ganhaCom={(d) => d >= 7}
        parametros={parametros} conexao="open" expandido={false} onExpandir={nada} onDigitos={nada} digitosAberto={false} mostrarMarkup={false}
        onDesligar={nada} desligando={false} onRemover={nada}
      />
    </div>
  )
}

function SemDeriv() {
  const voltas = Number(new URLSearchParams(location.search).get('voltas') ?? '0')
  try {
    if (voltas > 0) {
      localStorage.setItem(`${MARCA.id}.pkce`, JSON.stringify({ verifier: 'lab', state: 'lab', criadoEm: Date.now() }))
      localStorage.setItem(`${MARCA.id}.tentativas-deriv`, JSON.stringify({ n: voltas, em: Date.now() }))
    } else {
      localStorage.removeItem(`${MARCA.id}.pkce`); localStorage.removeItem(`${MARCA.id}.tentativas-deriv`)
    }
  } catch { /* sem storage, mostra o estado inicial */ }
  return (
    <div style={{ display: 'grid', gap: 24, padding: 16, maxWidth: 420 }}>
      <DerivDesconectada acao="Para operar, falta a corretora." entrando={false} onConectar={nada} />
      <DerivDesconectada compacto acao="O gráfico e os dígitos são públicos, mas comprar exige a sua conta." entrando={false} onConectar={nada} />
    </div>
  )
}

function Laboratorio() {
  const qual = new URLSearchParams(location.search).get('tela') ?? 'cabine'
  // a home vem com a casca inteira da plataforma: fora da moldura do laboratório
  if (qual === 'inicio') return <Suspense fallback={null}><LabInicio /></Suspense>
  if (qual === 'perfil') return <Suspense fallback={null}><LabPerfil /></Suspense>
  if (qual === 'suporte') return <Suspense fallback={null}><LabSuporte /></Suspense>
  if (qual === 'login') return <LabLogin />
  // ?tela=carregando: o carregando da marca (o mesmo quadro em que a decolagem pousa)
  if (qual === 'carregando') return <Carregando />
  if (qual === 'aulas') return <LabAulas />
  if (qual === 'minicabine') return <Suspense fallback={null}><LabMiniCabine /></Suspense>
  return (
    <div className="app workspace-app" data-laboratorio={qual}>
      <main className="ger rob robot-workspace tem-acompanhamento">
        {qual === 'cabine' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoRodando} expandido={false} titulo="Robô 1" /></div>}
        {qual === 'cockpit' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoRodando} expandido titulo="Robô 1" /></div>}
        {qual === 'espera' && <div className="rob-workspace-board modo-lista"><CabineEspera /></div>}
        {qual === 'espera-mosaico' && <div className="rob-workspace-board modo-mosaico"><CabineEspera mosaico /></div>}
        {qual === 'parado' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoParado} expandido={false} titulo="Robô 1" /></div>}
        {qual === 'preparo' && (
          <CatalogoDeExemplo itens={CATALOGO_LAB.map((i) => ({ id: i.id, ativo: true, parametros: parametrosPadrao(i.id), lossVirtualAjustavel: true }))}>
          <div className="rob-workspace-board modo-lista"><div className="cabine-caixa cartao parado">
            <RobotSetup identidade={ident} nomeEstrategia={ident.nome} symbols={symbols} symbolInicial="R_75"
              configInicial={config} moeda="USD" isDemo={!new URLSearchParams(location.search).has('real')} contaId="VRTC1234567" escolherModelo
              onCancelar={nada} onLigar={(cfg) => { (window as unknown as { __cfgLigado?: unknown }).__cfgLigado = cfg }} ligando={false} erro={null} />
          </div></div>
          </CatalogoDeExemplo>
        )}
        {/* ?tela=digitos: o painel Dígitos ao vivo (ticks de verdade da Deriv, linha pública). */}
        {qual === 'digitos' && <DigitosFlutuante aoFechar={nada} />}
        {qual === 'catalogo' && <RobotCatalog selected={ident.id} onSelect={nada} />}
        {/* ?tela=vitrine: a vitrine de robôs (GlobalFly); "Configurar" abre o preparo já no robô. */}
        {qual === 'vitrine' && <LabVitrine />}
        {/* ?tela=grafico-pro: o gráfico profissional (indicadores e desenhos) com velas de exemplo. */}
        {qual === 'grafico-pro' && <Suspense fallback={null}><LabGraficoPro /></Suspense>}
        {/* ?tela=icones: os ícones dos ativos, como aparecem na lista "Trocar ativo". */}
        {qual === 'icones' && <div className="ativo-menu" style={{ position: 'static', width: 340 }}><div className="symbol-list">{['R_75', '1HZ10V', '1HZ100V', 'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'frxXAUUSD', 'frxXAGUSD'].map((c) => <button key={c} className="symbol"><IconeAtivo simbolo={c} /><span className="sym-name">{c === 'frxXAUUSD' ? 'Ouro' : c === 'frxXAGUSD' ? 'Prata' : c}</span><span className="dot on" /></button>)}</div></div>}
        {/* ?tela=menu: o menu lateral com a tela de Robôs (I.A. na GlobalFly) aberta. */}
        {qual === 'menu' && <div className="workspace-app" style={{ minHeight: 'calc(100vh / var(--escala-pagina, 1))' }}><WorkspaceNav page="robos" admin onNavigate={nada} /><LabVitrine /></div>}
        {/* ?tela=sem-deriv&voltas=0|1|2: o cartão de corretora desconectada em
            cada estado (nenhum login, uma volta perdida, duas seguidas). */}
        {qual === 'sem-deriv' && <SemDeriv />}
        {/* ?tela=aulas: a sala de aula com o catálogo e as capas da marca. */}
        {qual === 'aulas' && <AulasPanel nome="Tiago" />}
        {/* ?tela=noticias: a aba Notícias, com as fontes de verdade (servidor em produção). */}
        {qual === 'noticias' && <div className="workspace-app" style={{ minHeight: 'calc(100vh / var(--escala-pagina, 1))' }}><MercadoPanel /></div>}
        {/* ?tela=grafico: o gráfico com velas de mentira, médias ligadas (clique na linha). */}
        {/* ?tela=aovivo&modo=pagina|lado|flutuante|pilula&mod=1: a live com vídeo e chat de exemplo. */}
        {qual === 'aovivo' && <Suspense fallback={null}><LabAoVivo modo={(new URLSearchParams(location.search).get('modo') ?? 'pagina') as never} moderador={new URLSearchParams(location.search).has('mod')} /></Suspense>}
        {/* ?tela=treino: a sala de treino (público e chat simulados). */}
        {qual === 'treino' && <Suspense fallback={null}><SalaDeTreino apresentador="Tiago" aoSair={() => undefined} /></Suspense>}
        {/* ?tela=treino-membro: o membro do plano assistindo o ensaio do admin. */}
        {/* ?tela=inicio&perfil=experiente|novo&tema=escuro|claro: a home, dentro da casca da plataforma */}
        {qual === 'treino-membro' && <Suspense fallback={null}><LabAssistirTreino /></Suspense>}
        {qual === 'treino-player' && <Suspense fallback={null}><LabAssistirTreino fora={(new URLSearchParams(location.search).get('modo') ?? 'flutuante') as never} /></Suspense>}
        {/* ?tela=selo-tv: o selo vermelho do topo, o aviso "começou agora" e a tag do menu. */}
        {qual === 'selo-tv' && (
          <div className="workspace-app" style={{ padding: 24, display: 'grid', gap: 24 }}>
            <div className="topbar" style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', border: '1px solid var(--border)', borderRadius: 12, padding: '0 16px' }}>
              <button className="selo-tv"><i aria-hidden="true" />Ao vivo</button>
              <div className="status status-open"><i /> Conectado</div>
            </div>
            <div className="aviso-tv" role="status" style={{ position: 'static', transform: 'none' }}>
              <span className="aviso-tv-selo"><i aria-hidden="true" />Ao vivo agora</span>
              <b>Abertura da semana: leitura de mercado</b>
              <button className="aviso-tv-assistir">Assistir</button>
            </div>
            <aside className="workspace-sidebar" style={{ position: 'static', width: 236, height: 'auto' }}>
              <nav><button className="workspace-link"><span className="workspace-label">Ao vivo</span><i className="workspace-aovivo"><b className="workspace-label">ao vivo</b></i></button></nav>
            </aside>
          </div>
        )}
        {/* ?tela=treino-no-ar: o que o GF Member vê quando o admin abre a sala de treino. */}
        {qual === 'treino-no-ar' && (
          <div className="workspace-app" style={{ minHeight: 'calc(100vh / var(--escala-pagina, 1))' }}>
            <WorkspaceNav page="operar" admin={false} onNavigate={nada} aoVivoAgora />
            <div style={{ flex: 1, padding: 16 }}>
              <div className="topbar" style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', minHeight: 64 }}>
                <button className="selo-tv"><i aria-hidden="true" />Ao vivo</button>
                <div className="status status-open"><i /> Conectado</div>
              </div>
            </div>
            <div className="aviso-tv aviso-treino" role="status">
              <span className="aviso-tv-selo"><i aria-hidden="true" />Ao vivo</span>
              <button className="aviso-treino-texto"><b>Live iniciada.</b> Clique para entrar na sala.</button>
              <button className="aviso-tv-assistir">Entrar</button>
              <button className="aviso-tv-fechar" aria-label="Fechar aviso">✕</button>
            </div>
          </div>
        )}
        {/* ?tela=recorte: a mesma câmera no recorte antigo e no novo, lado a lado. */}
        {qual === 'recorte' && <Suspense fallback={null}><LabRecorte /></Suspense>}
        {qual === 'aovivo-atraso' && <Suspense fallback={null}><TesteAtraso /></Suspense>}
        {/* ?tela=operar (&varias, &vazio, &fechado): a boleta e as posições do Operar manual */}
        {qual === 'operar' && <Suspense fallback={null}><LabOperar /></Suspense>}
        {qual === 'grafico' && <div style={{ height: 520, display: 'flex' }}><PriceChart candles={VELAS} mode="candles" pipSize={3} symbolName="Volatility 75 (1s)" symbol="lab" indicators={['sma', 'ema']}
          // &marcas=1: uma operação manual aberta e uma encerrada (preço com o último dígito em destaque)
          markers={new URLSearchParams(location.search).has('marcas') ? [
            { id: 1, type: 'CALL', entryEpoch: VELAS[VELAS.length - 8].epoch, entryPrice: VELAS[VELAS.length - 8].close, expiryEpoch: VELAS[VELAS.length - 1].epoch + 300, profit: 2.78, status: 'open' },
            { id: 2, type: 'DIGITOVER', entryEpoch: VELAS[VELAS.length - 30].epoch, entryPrice: VELAS[VELAS.length - 30].close, expiryEpoch: VELAS[VELAS.length - 26].epoch, profit: 0.85, status: 'won', exitPrice: VELAS[VELAS.length - 26].close },
          ] : []} /></div>}
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Laboratorio /></React.StrictMode>)
