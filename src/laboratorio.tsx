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
import { UltimasEntradas } from './components/operar/UltimasEntradas'
import { VisorDaApostila } from './components/apostila/VisorDaApostila'
import { createPortal } from 'react-dom'
import { RelogioDoSimulador, JanelaSemTempo } from './components/plano/LimiteDoSimulador'
import { JanelaLiberarConta } from './components/plano/LiberarConta'
import { ContasTravadas } from './components/admin/ContasTravadas'
import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/app.css'
import { ligarJanelasNoCelular } from './core/janelasNoCelular'
import './styles/tema.css'
import './styles/ux-refinements.css'
import './styles/mobile-polish.css'
// o padrão de página (largura, margens) vem por último: vale sobre o resto
import './styles/pagina.css'
// o celular deitado (ilha do iPhone nas laterais, altura curta) vem depois de tudo
import './styles/celular-deitado.css'
import './components/robot-workspace.css'
import './components/workspace.css'
import { aplicarTema, temaGuardado } from './core/tema'
import { MARCA, familiaDa } from './marca'
import { SeletorDePlataforma, opcoesDePlataforma } from './components/SeletorDePlataforma'
import './components/admin-topo.css'
import { ligarVocabularioIA } from './marca/vocabularioIA'
import { LoginScreen } from './components/LoginScreen'
import { ExcluirCadastro } from './components/ExcluirCadastro'
import { RobotCartao } from './components/RobotResumo'
import { IDENTIDADES } from './core/deriv/branding'
import { parametrosPadrao } from './core/deriv/parametros'
import type { ConfigEstrategia, EstadoMotor, OperacaoMotor, Registro } from './core/deriv/engine'
import type { ActiveSymbol } from './core/deriv/types'
import { RobotLive } from './components/RobotLive'
import { RobotsPanel } from './components/RobotsPanel'
import { AccountSwitcher } from './components/AccountSwitcher'
import { ModoSimuladoTopo } from './components/modoSimulado/ModoSimuladoTopo'
import { permitirModoSimulado } from './core/teeds/modoSimulado'
/** O lab é admin: o modo simulado existe aqui (o botão e a tag do topo). */
function ModoSimuladoLab() { useEffect(() => { permitirModoSimulado(true) }, []); return <ModoSimuladoTopo /> }
import { Bandeira, Moeda } from './components/ferramentas/Bandeira'
const MOEDAS_LAB = ['USD', 'BRL', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'JPY', 'CNY', 'ARS', 'MXN', 'CLP', 'BTC']
import { gradeDoCatalogo, normalizarGrade, type GradeAulas } from './core/teeds/gradeAulas'
import { LocalRobotPanel } from './components/LocalRobotPanel'
import { AssistentePanel, type ItemDoAssistente } from './components/AssistentePanel'
import './components/barra/barra-inferior.css'
import { RobotSetup } from './components/RobotSetup'
import { DigitsPanel } from './components/DigitsPanel'
import { VitrineDeRobos } from './components/VitrineDeRobos'
import { WorkspaceNav } from './components/WorkspaceNav'
import { UserMenu } from './components/UserMenu'
import { AceiteDosTermos, LeitorDeTermos } from './components/termos/Termos'
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
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react'
import type { SessaoViva } from './core/teeds/servidorRobos'
import { MiniCabine } from './components/minicabine/MiniCabine'
import { ehSessaoSimulada, pedirParadaDaSimulada } from './core/teeds/sessaoSimuladaAoVivo'
import { CadastroEmAnalise } from './components/CadastroEmAnalise'
import { PreAcesso } from './components/PreAcesso'
import { AdminLancamento } from './components/lancamento/AdminLancamento'
import { AdminNotificacoes as AdminNotificacoesLab } from './components/notificacoes/AdminNotificacoes'
const SalaDeTreino = lazy(() => import('./components/aovivo/SalaDeTreino').then((m) => ({ default: m.SalaDeTreino })))
const LabCentralExtras = lazy(() => import('./components/aovivo/SalaDeTreino').then((m) => ({ default: function Extras() {
  // a faixa "Quem recebe" e o histórico das transmissões, com respostas de mentira do banco
  const sessao = { token: 'lab', usuario: { id: 'lab', nome: 'Tiago', email: 'lab@lab' } } as never
  return <div className="ger av-pagina tr-sala cv"><m.DestinoDaTransmissao sessao={sessao} noAr={false} /><m.HistoricoDasTransmissoes sessao={sessao} noAr={false} /></div>
} })))
const LabRecorte = lazy(() => import('./components/aovivo/LabRecorte'))
const TesteAtraso = lazy(() => import('./components/aovivo/TesteAtraso'))
const LabGraficoPro = lazy(() => import('./components/grafico/LabGraficoPro'))
const LabOperar = lazy(() => import('./components/operar/LabOperar'))
const LabRelatorios = lazy(() => import('./components/relatorios/LabRelatorios'))
const LabMultiplicador = lazy(() => import('./components/operar/LabMultiplicador'))
const AdminLeadsLab = lazy(() => import('./components/AdminLeads').then((m) => ({ default: m.AdminLeads })))
const OperacoesDaIADeHojeLab = lazy(() => import('./components/operar/OperacoesDaIADeHoje').then((m) => ({ default: m.OperacoesDaIADeHoje })))
const LabMultitela = lazy(() => import('./components/operar/multitela/LabMultitela'))
const LabFinanceiro = lazy(() => import('./components/financeiro/LabFinanceiro'))
const LabPainelDeComando = lazy(() => import('./components/grafico/LabPainelDeComando'))
const AdminPendentesLab = lazy(() => import('./components/AdminPendentes').then((m) => ({ default: m.AdminPendentes })))
const LabAoVivo = lazy(() => import('./components/aovivo/AoVivo').then((m) => ({ default: m.LabAoVivo })))
const LabInicio = lazy(() => import('./components/inicio/LabInicio'))
const LabOrganizacao = lazy(() => import('./components/organizacao/LabOrganizacao'))
const LabPlanos = lazy(() => import('./components/LabPlanos'))
const LabCarteira = lazy(() => import('./components/LabCarteira'))
function LabSeletor() {
  const [v, setV] = useState('globalfly')
  const [p, setP] = useState('')
  const [pv, setPv] = useState('todos')
  return <div className="workspace-app" style={{ padding: 32, background: 'var(--bg)', minHeight: '100vh', display: 'grid', gap: 12, alignContent: 'start' }}>
    <SeletorDePlataforma valor={v} opcoes={opcoesDePlataforma(true, 'teeds')} onTrocar={setV} parceiros={v === 'globalfly' ? [{ codigo: 'n', nome: 'Naor Bezerra' }, { codigo: 'v', nome: 'Victor Cordeiro' }, { codigo: 'd', nome: 'Douglas' }] : []} parceiro={p} onParceiro={setP} />
    <small style={{ color: 'var(--muted)' }}>parceiro em foco: {p || 'todos'}</small>
    {/* o mesmo seletor como fica no topo da Administração (08/11/2026) */}
    <div className="admin-shell" style={{ display: 'block' }}><main className="admin-main" style={{ padding: 0 }}><header className="admin-top"><div><span className="rot">GlobalFly Trade Admin</span><h1>Gestão de clientes</h1></div><div className="admin-top-acoes">
      <SeletorDePlataforma valor={v} opcoes={opcoesDePlataforma(true, 'teeds')} onTrocar={setV} parceiros={v === 'globalfly' ? [{ codigo: 'n', nome: 'Naor Bezerra' }, { codigo: 'v', nome: 'Victor Cordeiro' }, { codigo: 'd', nome: 'Douglas' }] : []} parceiro={p} onParceiro={setP} />
      <button className="admin-refresh">Atualizar</button>
    </div></header></main></div>
    {/* 17/11/2026: como o Victor (admin do parceiro que vê /v e /n) vê o topo na Visão geral */}
    <div className="admin-shell" style={{ display: 'block' }}><main className="admin-main" style={{ padding: 0 }}><header className="admin-top"><div><span className="rot">GlobalFly Trade · Admin do parceiro Victor</span><h1>Visão geral</h1></div><div className="admin-top-acoes">
      <SeletorDePlataforma valor="globalfly" opcoes={opcoesDePlataforma(false, 'globalfly')} onTrocar={() => undefined} parceiros={[{ codigo: 'v', nome: 'Victor Cordeiro' }, { codigo: 'n', nome: 'Naor Bezerra' }]} parceiro={pv} onParceiro={setPv} soParceiros todosDoParceiro />
      <button className="admin-refresh">Atualizar</button>
    </div></header></main></div>
    <small style={{ color: 'var(--muted)' }}>foco do Victor: {pv}</small>
  </div>
}
const LabParceiros = lazy(() => import('./components/LabParceiros'))
const LabAnuncios = lazy(() => import('./components/anuncios/LabAnuncios'))
const LabCentralRastreio = lazy(() => import('./components/central/LabCentral'))
const LabMenuAdmin = lazy(() => import('./components/LabMenuAdmin'))
const LabStories = lazy(() => import('./components/stories/LabStories'))
const LabEstudio = lazy(() => import('./components/stories/LabEstudio'))
const LabChatDaEquipe = lazy(() => import('./components/equipe/LabChatDaEquipe'))
const LabGerenciamento = lazy(() => import('./components/OperationalManagementPanel').then((m) => ({ default: m.OperationalManagementPanel })))
const LabDivulgacao = lazy(() => import('./components/LabDivulgacao'))
const LabLaboratorio = lazy(() => import('./components/laboratorio/LabLaboratorio'))
const LabPerfil = lazy(() => import('./components/perfil/LabPerfil'))
const LabAssessorChat = lazy(() => Promise.all([import('./components/assessor/AdminAssessor'), import('./core/teeds/assessorChat')]).then(([m, c]) => ({ default: () => <div className="app workspace-app"><div className="admin-shell modo-suporte" style={{ gridTemplateColumns: '1fr' }}><main className="admin-main" style={{ padding: 16 }}><m.AdminAssessor apiDeTeste={c.assessorDeExemplo('lab')} sessao={{ token: 'lab', refresh: 'lab', expiraEm: Date.now() + 3_600_000, usuario: { id: 'lab', email: 'tiagodalri1@live.com', nome: 'Tiago', telefone: null, cpf: null, criadoEm: '', trocarSenha: false } } as never} /></main></div></div> })))
const LabAssessor = lazy(() => import('./components/assessor/AdminAssessor').then((m) => ({ default: () => <div style={{ padding: 24, background: 'var(--bg)', minHeight: '100vh' }}><m.AdminAssessor sessao={{ token: 'lab', refresh: 'lab', expiraEm: Date.now() + 3_600_000, usuario: { id: 'lab', email: 'tiagodalri1@live.com', nome: 'Tiago', telefone: null, cpf: null, criadoEm: '', trocarSenha: false } } as never} /></div> })))
const LabSuporte = lazy(() => import('./components/suporte/LabSuporte'))
/** &cursos=1: a sala com três cursos (um de todos, um vendido à parte, um de plano), como o aluno sem compra vê. */
function gradeComCursos(): GradeAulas {
  const g = gradeDoCatalogo()
  const [a, b, ...resto] = g.modulos
  const acesso = (modo: 'todos' | 'planos' | 'compra', extra = {}) => ({ modo, planos: [], cakto: [], checkout: '', vitalicio: true, vitrine: true, ...extra })
  g.cursos = [
    { id: 'principal', titulo: `Formação ${MARCA.prosa}`, descricao: 'Do primeiro acesso à operação, passo a passo.', cor: '#B78D39', publicado: true, selo: 'Comece aqui', acesso: acesso('todos') },
    { id: 'gestao', titulo: 'Gestão inteligente de banca', descricao: 'Risco, meta e stop do jeito profissional.', sobre: 'Como proteger a banca e crescer com consistência: tamanho de entrada, meta e stop por dia, e o emocional depois de uma perda.', cor: '#2F8F72', publicado: true, selo: 'Novo', acesso: acesso('compra', { cakto: ['9df6023b-0000-0000-0000-000000000000'], checkout: 'https://pay.cakto.com.br/exemplo' }) },
    { id: 'mentoria', titulo: 'Mentoria Prestige', descricao: 'Encontros gravados com a mesa da GlobalFly.', cor: '#5B7C9D', publicado: true, acesso: acesso('planos', { planos: [{ id: 'prestige', nome: 'Prestige' }] }) },
  ]
  g.modulos = [{ ...a, curso: 'principal' }, ...resto.map((m) => ({ ...m, curso: 'principal' })), { ...b, curso: 'gestao' }, { ...b, id: `${b.id}-m`, curso: 'mentoria', assuntos: b.assuntos.map((s) => ({ ...s, id: `${s.id}-m`, aulas: s.aulas.map((x) => ({ ...x, id: `${x.id}-m` })) })) }]
  return g
}
function LabAulas() {
  const q = new URLSearchParams(location.search)
  const t = q.get('tema'); if (t) document.documentElement.dataset.tema = t
  // &grade=/lab-grade-gf.json: a sala com uma grade de verdade (JSON em public/), para testar antes de publicar
  const [gradeDoArquivo, setGradeDoArquivo] = useState<GradeAulas | null | undefined>(q.get('grade') ? undefined : null)
  useEffect(() => {
    const url = q.get('grade'); if (!url) return
    void fetch(url).then((r) => r.json()).then((g) => setGradeDoArquivo(normalizarGrade(g))).catch(() => setGradeDoArquivo(null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  if (gradeDoArquivo === undefined) return <Carregando />
  return (
    <div className="app workspace-app">
      <WorkspaceNav page="aulas" admin={false} mostrarInicio onNavigate={() => undefined} />
      <header className="topbar"><div className="workspace-heading"><strong>Aulas</strong><span>Seu espaço de trabalho</span></div></header>
      <AulasPanel nome="Tiago Dal Ri" sessao={null} aoReverTour={() => undefined} aoIr={() => undefined} treino={{ noAr: q.has('aovivo') }} travadas={q.has('membro')}
        previa={gradeDoArquivo ?? (q.has('cursos') ? gradeComCursos() : undefined)} />
    </div>
  )
}
/** ?tela=boasvindas&grade=/lab-grade-gf.json (arquivo local, fora do git): o vídeo do primeiro acesso por cima do início. */
function LabBoasVindas() {
  const q = new URLSearchParams(location.search)
  const [grade, setGrade] = useState<GradeAulas | null>(null)
  const [aberto, setAberto] = useState(true)
  // a grade de teste fica fora do repositório (os links não listados não vão para o site): sem &grade=, o catálogo
  useEffect(() => {
    const url = q.get('grade')
    if (!url) { setGrade(gradeDoCatalogo()); return }
    void fetch(url).then((r) => r.json()).then((g) => setGrade(normalizarGrade(g))).catch(() => setGrade(gradeDoCatalogo()))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Suspense fallback={<Carregando />}><LabInicio /></Suspense>
      {aberto && grade && <BoasVindasLab sessao={null} nome="Tiago Dal Ri" plano={null} admin={false} grade={grade} aoFechar={() => setAberto(false)} />}
    </>
  )
}
/** ?tela=estreia&grade=/lab-grade-gf.json[&agora=2026-11-27T18:59:50-03:00]: o pop-up da estreia do dia (27/11/2026). */
function LabEstreia() {
  const q = new URLSearchParams(location.search)
  const [grade, setGrade] = useState<GradeAulas | null>(null)
  useEffect(() => {
    void fetch(q.get('grade') || '/lab-grade-gf.json').then((r) => r.json()).then((g) => setGrade(normalizarGrade(g))).catch(() => setGrade(null))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const agora = q.get('agora') ? Date.parse(q.get('agora')!) : undefined
  return (
    <>
      <Suspense fallback={<Carregando />}><LabInicio /></Suspense>
      {grade && <Suspense fallback={null}><EstreiaLab sessao={null} plano={null} grade={grade} agoraFixo={agora} aoAssistir={() => undefined} /></Suspense>}
    </>
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
import { BoasVindasEmVideo as BoasVindasLab } from './components/aulas/BoasVindasEmVideo'
import { EstreiaDoDia as EstreiaLab } from './components/aulas/EstreiaDoDia'
const AdminAulasLab = lazy(() => import('./components/AdminAulas').then((m) => ({ default: m.AdminAulas })))
const LabQuemEstaOnline = lazy(() => import('./components/monitoramento/LabQuemEstaOnline'))
const LabManualAoVivo = lazy(() => import('./components/monitoramento/LabManualAoVivo'))
const LabEncerradas = lazy(() => import('./components/monitoramento/LabEncerradas'))
const LabVisaoGeral = lazy(() => import('./components/admin/LabVisaoGeral'))
const LabResultadosClientes = lazy(() => import('./components/LabResultadosClientes'))
const LabCompartilhamento = lazy(() => import('./components/admin/LabCompartilhamento'))
const LabCabineTopo = lazy(() => import('./components/monitoramento/LabCabineTopo'))
const LabReplay = lazy(() => import('./components/monitoramento/LabReplay'))
const TrancaSuperLiveLab = lazy(() => import('./components/lancamento/TrancaDoLancamento').then((m) => ({ default: m.TrancaDoLancamento })))
const LiberarAcessoGeralLab = lazy(() => import('./components/lancamento/LiberarAcessoGeral').then((m) => ({ default: m.LiberarAcessoGeral })))
const LabMiniCabine = lazy(() => import('./components/minicabine/LabMiniCabine'))
const AssistirTreinoReal = lazy(() => import('./components/aovivo/AssistirTreino').then((m) => ({ default: () => <m.AssistirTreino sessao={{ token: 'lab', usuario: { id: 'lab-aluno', nome: 'Aluno de teste', email: 'aluno@lab' } } as never} /> })))
const LabAssistirTreino = lazy(() => import('./components/aovivo/AssistirTreino').then((m) => ({ default: m.LabAssistirTreino })))
import { DerivDesconectada } from './components/DerivDesconectada'
import { EscolherContaDeriv } from './components/deriv/EscolherContaDeriv'
import { MeuPlano as MeuPlanoLab } from './components/plano/MeuPlano'
import { MarketplaceDoGF as MarketplaceDoGFLab } from './components/plano/MarketplaceDoGF'
import { simularMeuSubplano } from './core/teeds/subplanos'
import { DigitosFlutuante } from './components/DigitosFlutuante'
import { Decolagem } from './components/entrada/Decolagem'
import { Carregando } from './components/entrada/Carregando'
import { decolar, liberarPouso } from './core/decolagem'
import { CatalogoDeExemplo } from './core/teeds/catalogoRobos'
import { ligarEscala } from './core/escala'
import { CentralWhatsApp } from './components/whatsapp/CentralWhatsApp'
import { whatsappDeExemplo } from './core/teeds/whatsapp'
import { definirDonoDoPlano, lembrarMetaEStop } from './core/teeds/planoDoDia'
// ?tela=preparo: um dono fictício para o plano do dia e a última meta/limite de cada I.A. (ficam no localStorage deste navegador)
if (new URLSearchParams(location.search).get('tela') === 'preparo') definirDonoDoPlano('lab')

document.documentElement.dataset.marca = MARCA.id
document.documentElement.dataset.familia = familiaDa(MARCA.id)
// ?tela=treino&aparelhos=1 (19/11/2026): câmera, tela e microfone de mentira (desenhados), para testar o painel da sala como numa live
if (new URLSearchParams(location.search).get('tela') === 'treino' && new URLSearchParams(location.search).has('aparelhos')) {
  const md = navigator.mediaDevices
  if (md) {
  const desenho = (l: number, a: number, pintar: (g: CanvasRenderingContext2D, t: number) => void) => {
    const c = document.createElement('canvas'); c.width = l; c.height = a
    const g = c.getContext('2d')!
    const t0 = performance.now()
    window.setInterval(() => pintar(g, (performance.now() - t0) / 1000), 33)
    return (c as HTMLCanvasElement & { captureStream(f?: number): MediaStream }).captureStream(30)
  }
  const camera = () => desenho(1280, 720, (g, t) => {
    g.fillStyle = '#2b3442'; g.fillRect(0, 0, 1280, 720)
    g.fillStyle = '#d9b48a'; g.beginPath(); g.arc(640 + Math.sin(t) * 20, 300, 140, 0, 7); g.fill()
    g.fillStyle = '#1d2530'; g.fillRect(420, 470, 440, 260)
    g.fillStyle = '#fff'; g.font = 'bold 40px sans-serif'; g.fillText('Câmera de teste ' + t.toFixed(1), 40, 60)
  })
  const tela = () => desenho(1920, 1080, (g, t) => {
    g.fillStyle = '#0d1117'; g.fillRect(0, 0, 1920, 1080)
    g.strokeStyle = '#26a69a'; g.lineWidth = 4; g.beginPath()
    for (let x = 0; x < 1920; x += 8) { const y = 540 + Math.sin(x / 90 + t) * 160 + Math.sin(x / 23 + t * 3) * 30; if (x) g.lineTo(x, y); else g.moveTo(x, y) }
    g.stroke(); g.fillStyle = '#fff'; g.font = 'bold 48px sans-serif'; g.fillText('Tela compartilhada de teste', 60, 90)
  })
  const microfone = () => {
    const a = new AudioContext(); const o = a.createOscillator(); const ganho = a.createGain(); o.frequency.value = 220
    ganho.gain.value = 0.2; o.connect(ganho); const d = a.createMediaStreamDestination(); ganho.connect(d); o.start()
    window.setInterval(() => { ganho.gain.value = 0.05 + Math.abs(Math.sin(performance.now() / 400)) * 0.5 }, 60)
    return d.stream
  }
  md.getUserMedia = async (c?: MediaStreamConstraints) => (c?.video ? camera() : microfone())
  md.getDisplayMedia = async () => tela()
  const consultar = navigator.permissions.query.bind(navigator.permissions)
  navigator.permissions.query = (async (d: PermissionDescriptor) => (['camera', 'microphone'].includes(d.name as string) ? { state: 'granted' } as PermissionStatus : consultar(d))) as typeof navigator.permissions.query
  }
}

// &ingresso=a|b|aluno (23/11/2026): entra numa sala de teste DE VERDADE do LiveKit com os acessos de
// localStorage 'lab-tokens' (gerados no servidor; nunca em public/, que vai para o site). Testa dois administradores e um aluno juntos.
if (new URLSearchParams(location.search).has('ingresso')) {
  const quem = new URLSearchParams(location.search).get('ingresso') ?? 'a'
  const original = window.fetch.bind(window)
  window.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    // a nuvem das telas, de mentira (fica no localStorage, compartilhada entre as abas do laboratório)
    if (url.includes('/rest/v1/aovivo_telas')) {
      const guardada = localStorage.getItem('lab-nuvem-telas')
      if ((init?.method ?? 'GET') === 'GET') return new Response(guardada ? `[${guardada}]` : '[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      // como o banco: criar com a linha já existindo dá 409; trocar só vale se a versão bater
      const atual = guardada ? JSON.parse(guardada) : null
      if (init?.method === 'POST' && atual) return new Response('{}', { status: 409 })
      const desde = new URL(url, location.href).searchParams.get('atualizado_em')?.replace(/^eq\./, '')
      if (init?.method === 'PATCH' && (!atual || atual.atualizado_em !== desde)) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
      const corpo = JSON.parse(String(init?.body ?? '{}'))
      const linha = JSON.stringify({ ...atual, ...corpo, atualizado_em: new Date().toISOString() })
      localStorage.setItem('lab-nuvem-telas', linha)
      return new Response(`[${linha}]`, { status: 201, headers: { 'Content-Type': 'application/json' } })
    }
    if (url.includes('/functions/v1/live-token')) {
      const t = JSON.parse(localStorage.getItem('lab-tokens') || '{}') as Record<string, string>
      const nome = quem === 'a' ? 'Tiago (teste)' : quem === 'b' ? 'Victor (teste)' : 'Aluno de teste'
      return new Response(JSON.stringify({ url: t.url, token: t[quem], nome, moderador: quem !== 'aluno' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return original(entrada, init)
  }) as typeof window.fetch
}

// ?tela=central-extras: o banco responde com plataformas e transmissões de exemplo
if (new URLSearchParams(location.search).get('tela') === 'central-extras') {
  const original = window.fetch.bind(window)
  const agora = Date.now()
  const json = (d: unknown) => Promise.resolve(new Response(JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json' } }))
  window.fetch = (u: RequestInfo | URL, i?: RequestInit) => {
    const url = String(u)
    if (url.includes('teeds_plataformas_ao_vivo')) return json([{ codigo: 'n', nome: 'Naor Bezerra' }, { codigo: 'v', nome: 'Victor Cordeiro' }, { codigo: 'd', nome: 'Douglas' }])
    if (url.includes('teeds_criar_teste_ao_vivo')) return json('a1b2c3d4e5f6')
    if (url.includes('/rest/v1/transmissoes')) return json([
      { id: '1', apresentador: 'Victor Dias', teste: false, vitrines: null, iniciada_em: new Date(agora - 40 * 60000).toISOString(), encerrada_em: null, pico: 38, pessoas: 52, tempo_medio_s: 1260, mensagens: 87, presencas: [{ id: 'a', nome: 'Carla', segundos: 2400, entradas: 1 }, { id: 'b', nome: 'João', segundos: 1800, entradas: 2 }, { id: 'c', nome: 'Marcos', segundos: 300, entradas: 1 }], atualizada_em: new Date(agora - 20000).toISOString() },
      { id: '2', apresentador: 'Victor Dias', teste: false, vitrines: ['v'], iniciada_em: new Date(agora - 26 * 3600000).toISOString(), encerrada_em: new Date(agora - 24.5 * 3600000).toISOString(), pico: 61, pessoas: 74, tempo_medio_s: 3120, mensagens: 143, presencas: [], atualizada_em: new Date(agora - 24.5 * 3600000).toISOString() },
      { id: '3', apresentador: 'Victor Dias', teste: true, vitrines: null, iniciada_em: new Date(agora - 50 * 3600000).toISOString(), encerrada_em: new Date(agora - 49.8 * 3600000).toISOString(), pico: 2, pessoas: 2, tempo_medio_s: 540, mensagens: 4, presencas: [], atualizada_em: new Date(agora - 49.8 * 3600000).toISOString() },
    ])
    return original(u, i)
  }
}
// ?tela=assistente(&conversa=1)(&vivas=1)(&demora=ms): o Assistente com o servidor de mentira (19/11/2026)
if (new URLSearchParams(location.search).get('tela') === 'assistente') {
  const q = new URLSearchParams(location.search)
  const original = window.fetch.bind(window)
  const json = (d: unknown, ms = 0) => new Promise<Response>((ok) => window.setTimeout(() => ok(new Response(JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json' } })), ms))
  const demora = Number(q.get('demora') ?? 2200)
  window.fetch = (u: RequestInfo | URL, i?: RequestInit) => {
    const url = String(u)
    if (url.includes('/api/sessoes')) return json({ sessoes: q.has('vivas') ? [{ id: 's1', roboId: MARCA.robos[0], roboNome: 'GF Raptor', contaId: 'VRTC1', demo: true, moeda: 'USD', marca: MARCA.id, estado: { operacoes: 14, resultado: 3.42 } }] : [] })
    if (url.includes('/api/chat')) {
      const corpo = JSON.parse(String(i?.body ?? '{}'))
      const pergunta = String(corpo.pergunta ?? '')
      if (corpo.audio) return json({ transcricao: 'Opera com a Raptor na minha conta, com entrada de 1 dólar, meta de 10 e stop de 20.', texto: 'Pronto. A GF Raptor está no cartão, na conta REAL:\n• Entrada: US$ 1,00\n• Meta de ganho: US$ 10,00\n• Limite de perda: US$ 20,00\nConfira e toque em Ligar.', proposta: { roboId: MARCA.robos[0], roboNome: 'GF Raptor', regra: 'o último dígito do preço é diferente do escolhido', contaId: 'VRTC1', demo: true, moeda: 'USD', saldo: 1686, entrada: 1, stopLoss: 20, takeProfit: 10 }, uso: { hoje: 5, teto: 30 } }, demora)
      if (corpo.imagens?.length) return json({ texto: corpo.video ? `Vi ${corpo.imagens.length} quadros do vídeo: é a tela de configuração da GF Raptor, com entrada, meta e stop preenchidos.` : `Recebi ${corpo.imagens.length === 1 ? 'a imagem' : `${corpo.imagens.length} imagens`}: é o cartão da GF Raptor na conta de demonstração, pronto para ligar.`, uso: { hoje: 6, teto: 30 } }, demora)
      if (/^liga/i.test(pergunta)) return json({ texto: 'Preparei a GF Raptor na sua conta de demonstração. Confira os valores e toque em Ligar.', proposta: { roboId: MARCA.robos[0], roboNome: 'GF Raptor', regra: 'o último dígito do preço é diferente do escolhido', contaId: 'VRTC1', demo: true, moeda: 'USD', saldo: 1686, entrada: 1, stopLoss: 10, takeProfit: 5 }, uso: { hoje: 3, teto: 30 } }, demora)
      if (/erro/i.test(pergunta)) return new Promise<Response>((ok) => window.setTimeout(() => ok(new Response(JSON.stringify({ erro: 'A I.A. demorou demais para responder. Tente de novo em instantes.' }), { status: 504 })), demora))
      return json({ texto: 'A definição de metas e limites é pessoal e depende da sua tolerância a risco.\nNão há percentual garantido ou recomendado\n, pois o mercado envolve perdas possíveis.\n\nUm jeito comum de começar:\n- **Meta do dia** entre 2% e 5% da banca\n- **Stop** do mesmo tamanho ou menor que a meta\n- Pare ao bater qualquer um dos dois', uso: { hoje: 4, teto: 30 } }, demora)
    }
    return original(u, i)
  }
}
// ?tela=perfil&assessor=telefone|codigo|ok|conectando  e  ?tela=assessor&zapi=vazio|qr|ok|offline: o Assessor no WhatsApp (19/11/2026)
if (new URLSearchParams(location.search).has('assessor') || new URLSearchParams(location.search).has('zapi')) {
  const q = new URLSearchParams(location.search)
  const original = window.fetch.bind(window)
  const json = (d: unknown, status = 200) => new Promise<Response>((ok) => window.setTimeout(() => ok(new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } })), 400))
  const caso = q.get('assessor') ?? 'telefone'
  const z = q.get('zapi') ?? 'vazio'
  const qr = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 29 29" shape-rendering="crispEdges"><rect width="29" height="29" fill="#fff"/>' + Array.from({ length: 29 * 29 }, (_, k) => ((k * 7919) % 13 < 6 ? `<rect x="${k % 29}" y="${Math.floor(k / 29)}" width="1" height="1"/>` : '')).join('') + '</svg>')
  window.fetch = (u: RequestInfo | URL, i?: RequestInit) => {
    const url = String(u)
    if (url.includes('/api/assessor/whatsapp/codigo')) return json({ liberado: true, codigo: '482193', numeroAssessor: '5511999990000', expiraEm: new Date(Date.now() + 1800_000).toISOString() })
    if (url.includes('/api/assessor/whatsapp')) return json(caso === 'ok' ? { liberado: true, telefone: '11987654321', confirmado: true, numeroConfirmado: '5511987654321', numeroAssessor: '5511999990000', conectado: true }
      : { liberado: true, telefone: caso === 'semtelefone' ? '' : '11987654321', confirmado: false, numeroAssessor: caso === 'conectando' ? undefined : '5511999990000', conectado: caso !== 'conectando' })
    if (url.includes('/api/admin/zapi')) {
      if (i?.method === 'POST') return json({ erro: 'A Z-API recusou esses códigos (Instance not found).' }, 400)
      return json(z === 'ok' ? { configurado: true, conectado: true, celularOnline: true, numero: '5511999990000', instancia: '3E7A' } : z === 'offline' ? { configurado: true, conectado: true, celularOnline: false, numero: '5511999990000' } : z === 'qr' ? { configurado: true, conectado: false, qr } : { configurado: false, conectado: false })
    }
    return original(u, i)
  }
}
// ?tela=treino&blocos=1: os blocos de mensagens do chat respondem de exemplo (banco e I.A. de mentira)
if (new URLSearchParams(location.search).has('blocos')) {
  const original = window.fetch.bind(window)
  const json = (d: unknown, ms = 0) => new Promise<Response>((ok) => window.setTimeout(() => ok(new Response(JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json' } })), ms))
  let blocos = [
    { id: 'b1', nome: 'Quem é aluno?', descricao: 'Alunos respondendo que são e que não são alunos, cada um de um jeito', exemplos: '', quantidade: 30, ordem: 0, revisar: [],
      mensagens: ['sou aluno sim', 'não sou aluno', 'aluno desde o começo', 'ainda não mas quero ser', 'Sou aluno faz 3 meses', 'eu sou', 'não sou ainda', 'sou aluna sim!!', 'aluno aqui de BH', 'quero entrar hj'] },
    { id: 'b2', nome: 'Bom dia', descricao: 'Bom dia de várias cidades', exemplos: '', quantidade: 20, ordem: 1, revisar: ['bom diaa', 'Bom dia de Curitiba'], mensagens: ['bom dia pessoal', 'bom dia de SP', 'Bom dia família', 'bom diaaa'] },
    { id: 'b3', nome: 'EU QUERO', descricao: '', exemplos: '', quantidade: 10, ordem: 2, revisar: [], mensagens: [] },
  ]
  const geradas = ['bom dia galera', 'bom dia de Recife', 'Bom dia!! primeira vez aqui', 'bom dia, cheguei', 'bom diaa direto do trampo kkk', 'bom dia família GF', 'dia pessoal', 'Bom dia de Goiânia', 'bom dia mestre', 'bom dia, café na mão ☕']
  window.fetch = (u: RequestInfo | URL, i?: RequestInit) => {
    const url = String(u)
    if (url.includes('/functions/v1/chat-blocos')) { const q = JSON.parse(String(i?.body ?? '{}')).quantidade ?? 10; return json({ mensagens: Array.from({ length: q }, (_, k) => geradas[k % geradas.length] + (k >= geradas.length ? ` ${k}` : '')) }, 1400) }
    if (url.includes('/rest/v1/chat_blocos')) {
      const metodo = i?.method ?? 'GET'
      const id = /id=eq\.([^&]+)/.exec(url)?.[1]
      if (metodo === 'GET') return json(blocos)
      if (metodo === 'DELETE') { blocos = blocos.filter((b) => b.id !== id); return json(null) }
      const dados = JSON.parse(String(i?.body ?? '{}'))
      if (metodo === 'PATCH') { blocos = blocos.map((b) => (b.id === id ? { ...b, ...dados } : b)); return json(blocos.filter((b) => b.id === id), 300) }
      const novo = { ...dados, id: `b${Date.now()}` }; blocos = [...blocos, novo]; return json([novo], 300)
    }
    return original(u, i)
  }
}
// &tema=claro|escuro vale em qualquer tela do laboratório (conferência dos dois temas)
{ const t = new URLSearchParams(location.search).get('tema'); aplicarTema(t === 'claro' || t === 'escuro' ? t : temaGuardado()) }
// &ig=1: simula o link da comunidade no Instagram (a escolha WhatsApp ou Instagram)
if (new URLSearchParams(location.search).has('ig') && !MARCA.comunidadeInstagram) (MARCA as { comunidadeInstagram?: string }).comunidadeInstagram = 'https://www.instagram.com/channel/exemplo/'
// no computador a página nasce em 90% (ver core/escala.ts)
ligarEscala()
ligarJanelasNoCelular()
if (MARCA.vocabularioIA) ligarVocabularioIA()
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
  // &trancadas=1: Gulf e Phenom com cadeado (as I.A. vendidas à parte na GlobalFly)
  useEffect(() => { if (new URLSearchParams(location.search).has('trancadas')) void import('./core/teeds/robosLiberados').then((m) => m.simularRobosBloqueados(['superior5', 'ag2'])) }, [])
  return (
    <div className="ger rob robot-workspace">
      <div className="ger-topo rob-workspace-header"><div><span className="rob-eyebrow">CENTRAL DE ROBÔS</span><h2>Vamos iniciar sua jornada?</h2><p className="ger-sub">Escolha um modelo, defina seus limites e acompanhe a sessão.</p></div></div>
      <VitrineDeRobos onConfigurar={() => setPreparo(true)} />
      {preparo && <RobotSetup identidade={ident} nomeEstrategia={ident.nome} symbols={symbols} symbolInicial="R_75" configInicial={config} moeda="USD" isDemo contaId="VRTC1234567" escolherModelo onCancelar={() => setPreparo(false)} onLigar={nada} ligando={false} erro={null} />}
    </div>
  )
}

const nada = () => {}

function Cabine({ estado: estadoBase, expandido, titulo }: { estado: EstadoMotor; expandido: boolean; titulo: string }) {
  // &markup=1: Modo CEO (coluna e soma do markup). &cortada=1: a lista chega
  // cortada, como no Monitoramento (só as últimas), e a soma vem da sessão inteira.
  const busca = new URLSearchParams(location.search)
  const comMarkup = busca.has('markup')
  const estado: EstadoMotor = busca.has('cortada') ? { ...estadoBase, operacoes: 161, markupDaSessao: 3.4719 } : estadoBase
  return (
    <div className={`cabine-caixa aberta ${expandido ? 'expandido' : ''} ${estado.rodando ? 'rodando' : 'parado'}`}
      style={{ ['--robo' as string]: ident.cor, ['--robo-suave' as string]: ident.corSuave } as React.CSSProperties}>
      <RobotLive
        estado={estado} config={config} moeda="USD"
        contaDaSessao={{ contaId: 'VRTC1234567', demo: true, moeda: 'USD' }}
        estrategiaId={ident.id} nomeEstrategia={ident.nome} ativo="Volatility 75 Index"
        titulo={titulo} regra="menor que 5" cor={ident.cor} ganhaCom={(d) => d < 5}
        parametros={parametros} conexao="open" expandido={expandido} onExpandir={nada}
        onDigitos={nada} digitosAberto={false} mostrarMarkup={comMarkup}
        onDesligar={estado.rodando ? nada : undefined} desligando={false}
        onLigarDeNovo={!estado.rodando ? nada : undefined} onRemover={nada}
      />
    </div>
  )
}

/**
 * ?tela=sessao-simulada: o botão "Outra tela" esconde a aba das I.A. (como o app, que a mantém montada) e
 * mostra a mini cabine flutuante com a sessão simulada que está rodando (16/11/2026).
 */
let vivasDoLab: SessaoViva[] = []
const ouvintesDoLab = new Set<() => void>()
function labVivas(l: SessaoViva[]) { vivasDoLab = l; ouvintesDoLab.forEach((f) => f()) }
function LabOutraTela() {
  const [fora, setFora] = useState(false)
  const vivas = useSyncExternalStore((f) => { ouvintesDoLab.add(f); return () => { ouvintesDoLab.delete(f) } }, () => vivasDoLab)
  useEffect(() => { const el = document.querySelector<HTMLElement>('.app[data-laboratorio="sessao-simulada"] > .rob, .app[data-laboratorio="sessao-simulada"] > section, .app[data-laboratorio="sessao-simulada"] > main'); if (el) el.style.display = fora ? 'none' : '' }, [fora])
  return (
    <>
      <button type="button" className="lab-outra-tela" onClick={() => setFora((v) => !v)} style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 50 }}>{fora ? 'Voltar às I.A.' : 'Outra tela'}</button>
      {fora && <MiniCabine sessoes={vivas} aoAbrirCabine={() => setFora(false)} aoParar={(id) => { if (ehSessaoSimulada(id)) pedirParadaDaSimulada(id) }} />}
    </>
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

/**
 * ?tela=meta-de-novo — a mesma sessão bate a meta duas vezes (06/11/2026,
 * relato do Victor): o servidor de mentira responde às consultas da cabine;
 * a primeira volta para na meta, o play de novo CONTINUA a sessão (mesmo
 * número) e a segunda volta para na meta outra vez. O aviso grande tem de
 * aparecer nas duas. Nada sai do navegador.
 */
function LabMetaDeNovo() {
  const [pronto, setPronto] = useState(false)
  useEffect(() => {
    try { localStorage.removeItem(`${MARCA.id}.limites.avisados`); localStorage.removeItem(`${MARCA.id}.somDasSessoes`) } catch { /* ok */ }
    const base = { ...estadoRodando, emOperacao: false, emCurso: null, historico: [] as OperacaoMotor[], curva: [0], registros: [] as Registro[] }
    let ops = 0, resultado = 0, rodando = true, consultas = 0
    const lab = window as unknown as { __labMeta?: { voltas: number; ligou: number } }
    lab.__labMeta = { voltas: 1, ligou: 0 }
    const estado = (): EstadoMotor => ({ ...base, rodando, operacoes: ops, vitorias: ops, derrotas: 0, resultado, curva: [0, ...Array.from({ length: ops }, (_, i) => +((i + 1) * 0.5).toFixed(2))], motivoParada: rodando ? null : `meta de lucro atingida (USD ${resultado.toFixed(2)})` })
    const resposta = (corpo: unknown) => new Response(JSON.stringify(corpo), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const original = window.fetch
    window.fetch = async (url, init) => {
      const u = String(url)
      if (!u.includes('/api/sessao')) return original(url, init)
      if (init?.method === 'POST' && /\/api\/sessao$/.test(u)) {
        // play de novo: continua a mesma sessão, com o placar acumulado
        rodando = true; consultas = 0; lab.__labMeta!.ligou++; lab.__labMeta!.voltas++
        return resposta({ id: 'lab-sessao-1', contaId: 'VRTC1234567', demo: true, moeda: 'USD', estado: estado() })
      }
      if (rodando) {
        consultas++
        ops++; resultado = +(resultado + 0.5).toFixed(2)
        if (consultas >= 4) rodando = false
      }
      return resposta({ id: 'lab-sessao-1', contaId: 'VRTC1234567', demo: true, moeda: 'USD', estado: estado() })
    }
    setPronto(true)
    return () => { window.fetch = original }
  }, [])
  if (!pronto) return null
  const sessao = { token: 'lab', refresh: 'lab', expiraEm: Date.now() + 864e5, usuario: { id: 'lab', email: 'lab@exemplo.com', nome: 'Lab' } } as never
  return (
    <CatalogoDeExemplo itens={CATALOGO_LAB.map((i) => ({ id: i.id, ativo: true, parametros: parametrosPadrao(i.id), lossVirtualAjustavel: true }))}>
      <div className="rob-workspace-board modo-lista">
        <LocalRobotPanel socket={null} isDemo moeda="USD" symbols={symbols} symbolPadrao="R_75" identidade={ident} titulo="Robô 1"
          sessaoTeeds={sessao} contaId="VRTC1234567" conexao="open" adotar={{ id: 'lab-sessao-1', config }} />
      </div>
    </CatalogoDeExemplo>
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

/**
 * ?tela=curva-viva (&cockpit=1) — 16/11/2026: a Evolução da sessão recebendo uma
 * operação nova a cada 2,2 s, passando para o negativo e voltando (animação da curva).
 */
function LabCurvaViva() {
  const cockpit = new URLSearchParams(location.search).has('cockpit')
  const [estado, setEstado] = useState<EstadoMotor>(estadoRodando)
  useEffect(() => {
    const seq = [-0.75, -0.75, -1.03, 0.95, 0.94, -0.75, 0.95, 0.95, 0.17, -0.75, -1.03, -1.1, 0.95, 0.95, 0.95, 0.94]
    let i = 0
    const id = setInterval(() => {
      setEstado((e) => {
        const lucro = seq[i++ % seq.length]
        const resultado = +(e.resultado + lucro).toFixed(2)
        const n = (e.operacoes ?? 0) + 1
        const op = { ...e.historico[0], n, contractId: 29200000 + n, lucro, ganhou: lucro > 0, quando: Date.now() }
        return { ...e, operacoes: n, resultado, curva: [...e.curva, resultado].slice(-200), historico: [op, ...e.historico] }
      })
    }, 2200)
    return () => clearInterval(id)
  }, [])
  return <div className="rob-workspace-board modo-lista"><Cabine estado={estado} expandido={cockpit} titulo="Robô 1" /></div>
}

/**
 * ?tela=ultimas(&n=1)(&markup) — 16/11/2026: "Suas últimas entradas" minimalista com entradas de exemplo
 * (largura da coluna do Operar). &n=quantas, &markup mostra como o administrador vê.
 */
function LabUltimas() {
  const q = new URLSearchParams(location.search)
  const n = Number(q.get('n') ?? 14)
  const agora = Math.floor(Date.now() / 1000)
  const base = [
    { t: 'PUT', s: 'R_75', p: 10.24, x: 39440.348, pip: 4, b: null },
    { t: 'CALL', s: 'R_75', p: 15.67, x: 39310.202, pip: 4, b: null },
    { t: 'CALL', s: 'R_75', p: -10, x: 39275.005, pip: 4, b: null },
    { t: 'DIGITOVER', s: '1HZ100V', p: 250.61, x: 860.09, pip: 2, b: 4 },
    { t: 'DIGITOVER', s: '1HZ100V', p: 125.3, x: 861.1, pip: 2, b: 4 },
    { t: 'DIGITUNDER', s: '1HZ100V', p: -40, x: 860.87, pip: 2, b: 7 },
    { t: 'CALL', s: 'R_75', p: 47.7, x: 39621.0678, pip: 4, b: null },
  ]
  const ops = Array.from({ length: n }, (_, i) => {
    const e = base[i % base.length]
    return {
      contractId: 9000 + i, symbol: e.s, contractType: e.t, buyPrice: 25, bidPrice: 0, payout: 44.6, profit: e.p, profitPercentage: 0,
      status: e.p >= 0 ? 'won' : 'lost', isValidToSell: false, motivoSemVenda: null, isExpired: true, entrySpot: e.x, currentSpot: null,
      exitSpot: e.x, barrier: e.b, longcode: '', shortcode: '', currency: 'USD', purchaseTime: agora - i * 340, startTime: agora - i * 340,
      expiryTime: agora - i * 340 + 300, pipSize: e.pip, appMarkup: null,
    }
  })
  const nomes: Record<string, string> = { R_75: '75 Index', '1HZ100V': '100 (1s) Index' }
  return (
    <div className="layout-operar" style={{ padding: 16, display: 'flex', justifyContent: 'center' }}>
      <div className="trade" style={{ width: Number(q.get('w') ?? 272), flex: 'none', ...(q.has('cheia') ? { height: 520 } : {}) }}>
        {q.has('cheia') && <div className="bl" style={{ height: 420, borderRadius: 18, background: 'var(--surface)', border: '1px solid var(--border)' }}>Boleta + posição aberta (de mentira)</div>}
        <UltimasEntradas operacoes={ops} nomeDoAtivo={(s) => nomes[s] ?? s} markupDe={q.has('markup') ? (c) => +(c.payout * 0.03).toFixed(2) : undefined} />
      </div>
    </div>
  )
}

function Laboratorio() {
  const qual = new URLSearchParams(location.search).get('tela') ?? 'cabine'
  // a home vem com a casca inteira da plataforma: fora da moldura do laboratório
  // ?tela=leads: Administração › Leads com cadastros de exemplo (período, "De onde vieram", Veio de) — 18/11/2026
  if (qual === 'leads') {
    const f = window.fetch, agora = Date.now(), H = 3600e3
    const ex = [
      ['Ana Souza', 'meta', 'pago', '120252169022520383', 'GF | Victor | Cadastro 09/11', 2], ['Bruno Lima', 'ig', 'social', 'link_in_bio', null, 5],
      ['Carla Dias', 'instagram', 'referencia', null, null, 20], ['Diego Rocha', null, null, null, null, 30], ['Elisa Prado', 'instagram', 'manychat', null, 'sorteio-0911-story', 50],
      ['Fábio Nunes', 'meta', 'pago', '52543678172676', 'GF | Naor | Cadastro 09/11', 26], ['Gabi Torres', 'ig', 'social', 'link_in_bio', null, 80], ['Hugo Melo', null, null, null, null, 200],
      ['Íris Campos', 'facebook', 'referencia', null, null, 300], ['João Reis', 'google', 'referencia', null, null, 400], ['Kátia Luz', null, null, null, null, 4],
    ] as const
    const linhas = ex.map(([nome, origem, meio, conteudo, campanha, h], i) => ({ id: `lead-${i}`, nome, email: nome.split(' ')[0].toLowerCase() + '@exemplo.com', telefone: '+55 51 99999-00' + String(i).padStart(2, '0'), origem, meio, conteudo, campanha, pagina: 'https://globalflytrade.com/v/inicio?parceiro=v&origem_cadastro=login', temperatura: ['quente', 'morno', 'frio'][i % 3], pontuacao: 90 - i * 6, tempo_na_pagina: 40 + i * 7, profundidade: 60 + i * 3, visitas: 1 + (i % 3), convertido_em: new Date(agora - (h as number) * H).toISOString(), ex_cliente: i % 4 === 0 ? true : false, produtos_anteriores: i % 4 === 0 ? ['stark'] : [] }))
    window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => {
      const url = String(u)
      if (url.includes('leads_capturados')) return new Response(JSON.stringify(url.includes('offset=0') ? linhas : []), { status: 200 })
      if (url.includes('teeds_meu_papel')) return new Response(JSON.stringify({ admin: true, geral: true }), { status: 200 })
      if (url.includes('teeds_superlive_painel')) {
        const P = (nome: string, parceiro: string, situacao: string, link: string | null, link_nome: string | null, canal: string, h: number, entrou = false) =>
          ({ nome, email: nome.split(' ')[0].toLowerCase() + '@exemplo.com', telefone: '+55 11 98888-00' + String(Math.round(h)).padStart(2, '0'), parceiro, situacao, entrou, email_enviado: true, canal, link, link_nome, campanha: 'superlive-29-11', conteudo: null, quando: new Date(agora - h * H).toISOString() })
        const pessoas = [
          P('Marina Silva', 'v', 'aguardando', 'sl-victor-stories', 'Super Live · Stories do Victor', 'stories', 0.3, true),
          P('Rafael Costa', 'n', 'aguardando', 'sl-naor-manychat', 'Super Live · ManyChat do Naor', 'manychat', 0.8),
          P('Luana Freitas', 'v', 'ja_cliente', 'sl-victor-telegram', 'Super Live · Telegram do Victor', 'telegram', 1.5),
          P('Pedro Alves', 'v', 'aguardando', 'sl-victor-stories', 'Super Live · Stories do Victor', 'stories', 2.2, true),
          P('Sofia Ramos', 'n', 'aguardando', 'sl-naor-comunidade', 'Super Live · Comunidade do WhatsApp do Naor', 'whatsapp', 3),
          P('Tiago Mendes', '', 'aguardando', null, null, 'direto', 5),
          P('Vera Lúcia', 'n', 'ja_cliente', 'sl-naor-stories', 'Super Live · Stories do Naor', 'stories', 7),
          P('Caio Martins', 'v', 'aguardando', null, null, 'anuncio-meta', 9),
        ]
        const conta = (f: (x: typeof pessoas[number]) => boolean) => pessoas.filter(f).length
        const grupo = <K extends string>(k: (x: typeof pessoas[number]) => K) => [...new Set(pessoas.map(k))]
        return new Response(JSON.stringify({
          inicio: '2026-11-29T23:00:00Z', liberado_em: null, total: pessoas.length, aguardando: conta((x) => x.situacao === 'aguardando'), ja_clientes: conta((x) => x.situacao === 'ja_cliente'), liberados: 0,
          entraram: conta((x) => x.situacao === 'aguardando' && x.entrou), hoje: pessoas.length,
          por_parceiro: grupo((x) => x.parceiro).map((pp) => ({ parceiro: pp, inscritos: conta((x) => x.parceiro === pp), aguardando: conta((x) => x.parceiro === pp && x.situacao === 'aguardando'), ja_clientes: conta((x) => x.parceiro === pp && x.situacao === 'ja_cliente') })).sort((a, b) => b.inscritos - a.inscritos),
          por_origem: grupo((x) => `${x.link}|${x.canal}|${x.parceiro}`).map((g) => { const [l, c, pp] = g.split('|'); const m = pessoas.filter((x) => `${x.link}|${x.canal}|${x.parceiro}` === g); return { link: l === 'null' ? null : l, nome: m[0].link_nome, canal: c, parceiro: pp, inscritos: m.length, aguardando: m.filter((x) => x.situacao === 'aguardando').length } }).sort((a, b) => b.inscritos - a.inscritos),
          pessoas,
        }), { status: 200 })
      }
      if (url.includes('teeds_origem_dos_leads')) return new Response(JSON.stringify([{ lead_id: 'lead-3', canal: 'instagram', link: null, ref: 'l.instagram.com' }, { lead_id: 'lead-7', canal: 'anuncio-meta', link: null, ref: 'instagram.com' }, { lead_id: 'lead-10', canal: 'direto', link: null, ref: null }]), { status: 200 })
      return f(u, i)
    }) as typeof fetch
    return <Suspense fallback={null}><div className="admin-page" style={{ padding: 24 }}><AdminLeadsLab sessao={{ token: 'lab', usuario: { id: 'lab' } } as never} marca="globalfly" /></div></Suspense>
  }
  // ?tela=assistente: a aba do Assistente dentro da moldura do app (19/11/2026)
  if (qual === 'assistente') return <LabAssistente />
  // ?tela=ia-de-hoje(&oculto): "Suas operações com I.A." de hoje com operações de exemplo (19/11/2026)
  if (qual === 'ia-de-hoje') {
    const f = window.fetch, agora = Date.now()
    const ops: unknown[] = []
    let k = 0
    for (const [sid, nome, desdeMin, n] of [['s1', 'GF Falcon', 25, 14], ['s2', 'GF Raptor', 140, 9], ['s3', 'GF Phenom', 300, 22]] as const) {
      for (let i = 0; i < n; i++) {
        const ganhou = (i * 7 + k) % 5 !== 0
        const dig = (i * 3 + k) % 10
        ops.push({ contract_id: 900000 + k++, sessao_id: sid, robo_id: nome.toLowerCase(), robo_nome: nome, tipo_contrato: 'DIGITOVER', moeda: 'USD', entrada: 2, resultado: ganhou ? 1.28 : -2, markup: 0.06, executada_em: new Date(agora - (desdeMin - i) * 60_000).toISOString(), preco_saida: Number((5123.45 + i / 10).toFixed(2)) + dig / 100 - Number((5123.45 + i / 10).toFixed(2)) % 0.1, digito_saida: dig })
      }
    }
    ops.sort((a: any, b: any) => (a.executada_em < b.executada_em ? 1 : -1))
    if (new URLSearchParams(location.search).has('oculto')) { try { localStorage.setItem(`${MARCA.id}.ia-de-hoje.oculto`, '1') } catch { /* */ } }
    else { try { localStorage.removeItem(`${MARCA.id}.ia-de-hoje.oculto`) } catch { /* */ } }
    window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('/operacoes_robos')
      ? new Response(JSON.stringify(String(u).includes('offset=0') ? ops : []), { status: 200 })
      : f(u, i)) as typeof fetch
    return <Suspense fallback={null}><div style={{ maxWidth: 760, margin: '0 auto', padding: 16 }}><OperacoesDaIADeHojeLab sessao={{ token: 'lab', usuario: { id: 'lab' } } as never} contaId="VRTC1" mostrarMarkup={new URLSearchParams(location.search).has('markup')} /></div></Suspense>
  }
  if (qual === 'ultimas') return <LabUltimas />
  if (qual === 'inicio') return <Suspense fallback={null}><LabInicio /></Suspense>
  if (qual === 'perfil') return <Suspense fallback={null}><LabPerfil /></Suspense>
  if (qual === 'assessor') return <Suspense fallback={null}><LabAssessor /></Suspense>
  // ?tela=assessor-chat: o chat do Assessor no ADM (25/11/2026) com as conversas de exemplo da central
  if (qual === 'assessor-chat') return <Suspense fallback={null}><LabAssessorChat /></Suspense>
  if (qual === 'organizacao') return <Suspense fallback={null}><LabOrganizacao /></Suspense>
  // ?tela=planos: Administração > Planos com o banco de mentira
  if (qual === 'planos') return <Suspense fallback={null}><LabPlanos /></Suspense>
  // ?tela=carteira (&sem=1): a carteira da Deriv, com e sem a permissão `payment`
  if (qual === 'carteira') return <Suspense fallback={null}><LabCarteira /></Suspense>
  if (qual === 'parceiros') return <Suspense fallback={null}><LabParceiros /></Suspense>
  if (qual === 'anuncios-admin') return <Suspense fallback={null}><LabAnuncios /></Suspense>
  if (qual === 'central-rastreio') return <Suspense fallback={null}><LabCentralRastreio /></Suspense>
  if (qual === 'menu-admin') return <Suspense fallback={null}><LabMenuAdmin /></Suspense>
  // ?tela=stories-admin: Administração › Stories com o banco de mentira (08/11/2026)
  if (qual === 'stories-admin') return <Suspense fallback={null}><LabStories /></Suspense>
  // ?tela=estudio[&foto=1]: o estúdio de stories (câmera, editor, figurinhas) com o banco de mentira
  if (qual === 'estudio') return <Suspense fallback={null}><LabEstudio /></Suspense>
  if (qual === 'equipe') return <Suspense fallback={null}><LabChatDaEquipe /></Suspense>
  // ?tela=seletor: o seletor de plataforma com a linha dos parceiros (admin geral)
  if (qual === 'seletor') return <LabSeletor />
  if (qual === 'divulgacao') return <Suspense fallback={null}><LabDivulgacao /></Suspense>
  // ?tela=laboratorio-ia: o Laboratório de IA com receitas em memória (ticks e cotações reais da Deriv)
  if (qual === 'laboratorio-ia') return <Suspense fallback={null}><LabLaboratorio /></Suspense>
  if (qual === 'suporte') return <Suspense fallback={null}><LabSuporte /></Suspense>
  // ?tela=termos (&leitor): o aceite dos termos do primeiro acesso, ou o leitor do menu do avatar
  if (qual === 'termos') return new URLSearchParams(location.search).has('leitor')
    ? <LeitorDeTermos aoFechar={nada} />
    : <AceiteDosTermos sessao={{ token: 'lab', usuario: { id: 'lab', email: 'ana@exemplo.com', nome: 'Ana Souza' } } as never} aoAceitar={nada} aoSair={nada} />
  // ?tela=relatorios: a aba Relatórios com 30 dias de exemplo
  if (qual === 'relatorios') return <Suspense fallback={null}><LabRelatorios /></Suspense>
  // ?tela=painel-comando: o painel flutuante da tela cheia do TradingView, com posições de exemplo
  // ?tela=multiplicador(&ativo=frxEURUSD): a boleta do multiplicador com cotações reais da Deriv
  if (qual === 'multiplicador') return <Suspense fallback={null}><LabMultiplicador /></Suspense>
  // ?tela=multitela(&n=2|4|6)(&real=1)(&sem-deriv): a grade de vários ativos com cotações reais e compras de mentira
  // ?tela=financeiro(&estado=trava|criar|provisoria|sem|vazio)(&papel=leitor|editor): Administração › Financeiro com o banco em memória
  if (qual === 'financeiro') return <Suspense fallback={null}><LabFinanceiro /></Suspense>
  if (qual === 'multitela') return <Suspense fallback={null}><LabMultitela /></Suspense>
  if (qual === 'painel-comando') return <Suspense fallback={null}><LabPainelDeComando /></Suspense>
  // ?tela=pendentes: a aprovação de clientes como o admin geral vê (com a escolha do parceiro); a lista vem do servidor
  if (qual === 'pendentes') return <Suspense fallback={null}><div className="admin-page" style={{ padding: 24 }}><AdminPendentesLab sessao={{ token: 'lab', refresh: 'lab', expiraEm: Date.now() + 864e5, usuario: { id: 'lab', email: 'lab@exemplo.com', nome: 'Lab', telefone: null, cpf: null, criadoEm: '', trocarSenha: false } } as never} marca="globalfly" versao={0} onAprovado={() => undefined} parceiros={[{ codigo: 'n', nome: 'Naor Bezerra' }, { codigo: 'v', nome: 'Victor Cordeiro' }, { codigo: 'd', nome: 'Douglas' }]} exemplo={!new URLSearchParams(location.search).has('real')} /></div></Suspense>
  // ?tela=liberar-geral: o botão "Liberar acesso geral" de Clientes (08/11/2026); sem banco, mostra o estado trancado
  // (&parceiro: como o admin de um parceiro só vê, sem o botão; &esperando: com o número de quem espera)
  // ?tela=quem-online(&aba=operando)(&vazio): a gaveta "Quem está online" do Monitoramento, com gente de exemplo
  if (qual === 'quem-online') return <Suspense fallback={null}><LabQuemEstaOnline /></Suspense>
  // ?tela=manual-ao-vivo(&tipo=PUT|DIGITOVER&barreira=4)(&fim=ganhou)(&real=1)(&markup=1): a cabine ao vivo de uma operação manual, com o preço real da Deriv
  if (qual === 'manual-ao-vivo') return <Suspense fallback={null}><LabManualAoVivo /></Suspense>
  // ?tela=encerradas(&conta=real)(&normal)(&somando): filtro de dia/horário e totais das sessões encerradas, com exemplo
  if (qual === 'encerradas') return <Suspense fallback={null}><LabEncerradas /></Suspense>
  // ?tela=visao-geral(&cenario=real|vazio): a Visão geral da Administração com números de exemplo
  if (qual === 'visao-geral') return <Suspense fallback={null}><LabVisaoGeral /></Suspense>
  // ?tela=resultados-clientes: Resultados por cliente com clientes de exemplo, para ordenar pelos títulos (12/11/2026)
  if (qual === 'resultados-clientes') return <Suspense fallback={null}><LabResultadosClientes /></Suspense>
  // ?tela=compartilhamento(&parceiro=1)(&vazio): o Compartilhamento de receita com clientes de exemplo; gerar e dar baixa em memória
  if (qual === 'compartilhamento') return <Suspense fallback={null}><LabCompartilhamento /></Suspense>
  // ?tela=cabine-topo(&vazio): cabeçalho da cabine espelho e o aviso "Em conta real agora", com exemplo
  // ?tela=replay: replay na visão do cliente e o MP4 (exemplo em public/lab-local, fora do git)
  if (qual === 'replay') return <Suspense fallback={null}><LabReplay /></Suspense>
  if (qual === 'cabine-topo') return <Suspense fallback={null}><LabCabineTopo /></Suspense>
  if (qual === 'liberar-geral' && (new URLSearchParams(location.search).has('parceiro') || new URLSearchParams(location.search).has('esperando'))) {
    const f = window.fetch
    window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('teeds_lancamento_painel')
      ? new Response(JSON.stringify({ inicioPrevisto: '2026-11-09T23:00:00Z', youtube: null, noAr: false, comecouEm: null, terminouEm: null, liberadoEm: null, liberados: null, podeControlar: !new URLSearchParams(location.search).has('parceiro'), minimoPct: 80, aguardando: 757, assistindoAgora: 0, assistiram: 0, ficaram: 0, total: null }), { status: 200 })
      : f(u, i)) as typeof fetch
  }
  if (qual === 'liberar-geral') return <Suspense fallback={null}><div className="admin-page" style={{ padding: 24 }}><LiberarAcessoGeralLab sessao={{ token: 'lab', refresh: 'lab', expiraEm: Date.now() + 864e5, usuario: { id: 'lab', email: 'lab@exemplo.com', nome: 'Lab' } } as never} geral /></div></Suspense>
  // ?tela=tranca-superlive: a plataforma trancada do inscrito da Super Live (27/11/2026), sem banco
  if (qual === 'tranca-superlive') return <Suspense fallback={null}><div style={{ minHeight: '100vh', padding: 24 }}><button type="button">Um botão qualquer da plataforma</button><TrancaSuperLiveLab sessao={{ token: 'lab', refresh: 'lab', expiraEm: Date.now() + 864e5, usuario: { id: 'lab', email: 'lab@exemplo.com', nome: 'Marina' } } as never} nome="Marina Souza" estado={null} assistindo={false} aoAssistir={() => undefined} aoConferir={async () => false} /></div></Suspense>
  if (qual === 'login') return <LabLogin />
  // ?tela=excluir: o rodapé da ficha do cliente com "Excluir cadastro" e a confirmação aberta
  if (qual === 'excluir') return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <section className="adm-modal adm-modal-ficha" style={{ margin: '16px auto' }}>
        <footer><div className="adm-ficha-perigo"><button className="adm-cancelar">Encerrar acesso</button><button className="adm-cancelar adm-excluir">Excluir cadastro</button></div><span>Cadastrado em 27/10/2026</span><button>Salvar alterações</button></footer>
      </section>
      <ExcluirCadastro sessao={{ token: 'lab' } as never} marca={MARCA.id} cliente={{ userId: '00000000-0000-0000-0000-000000000000', nome: 'Cadastro de teste', email: 'teste.exclusao@exemplo.com' }} fechar={nada} excluido={nada} />
    </div>
  )
  // ?tela=carregando: o carregando da marca (o mesmo quadro em que a decolagem pousa)
  if (qual === 'carregando') return <Carregando />
  if (qual === 'notificacoes-admin') {
    // o painel de notificações com respostas de mentira
    const f = window.fetch
    window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => {
      const url = String(u)
      if (url.includes('teeds_push_publicos')) return new Response(JSON.stringify({ todos: { pessoas: 1284, aparelhos: 1502 }, aguardando: { pessoas: 912, aparelhos: 1040 }, membros: { pessoas: 318, aparelhos: 402 }, ativos: { pessoas: 372, aparelhos: 462 }, eu: { pessoas: 1, aparelhos: 2 } }), { status: 200 })
      if (url.includes('teeds_push_quem')) return new Response(JSON.stringify([{ pessoa: 'a', nome: 'Ana Souza', email: 'ana@exemplo.com', parceiro: 'n', aparelhos: 1, recebeu_em: '2026-11-02T14:10:05Z', abriu_em: '2026-11-02T14:12:40Z' }, { pessoa: 'b', nome: 'Bruno Lima', email: 'bruno@exemplo.com', parceiro: 'n', aparelhos: 2, recebeu_em: '2026-11-02T14:10:07Z', abriu_em: null }, { pessoa: 'c', nome: 'Carla Dias', email: 'carla@exemplo.com', parceiro: 'n', aparelhos: 1, recebeu_em: null, abriu_em: null }]), { status: 200 })
      if (url.includes('teeds_push_historico')) return new Response(JSON.stringify([{ id: '1', criado_em: '2026-11-02T14:10:00Z', titulo: '⏰ Falta 1 hora para a live', corpo: 'Às 20h, dentro da GlobalFly. Abra o app e deixe tudo pronto.', publico: 'aguardando', parceiro: 'n', aparelhos: 412, enviados: 398, falhas: 14, teste: false, pessoas: 351, recebidos: 377, abertos: 142, pessoas_abriram: 139 }, { id: '2', criado_em: '2026-11-02T13:58:00Z', titulo: '⏰ Falta 1 hora para a live', corpo: 'Às 20h, dentro da GlobalFly.', publico: 'eu', parceiro: null, aparelhos: 2, enviados: 2, falhas: 0, teste: true, pessoas: 1, recebidos: 2, abertos: 1, pessoas_abriram: 1 }]), { status: 200 })
      if (url.includes('push_disparos')) return new Response(JSON.stringify([{ id: '1', criado_em: '2026-11-02T14:10:00Z', titulo: '⏰ Falta 1 hora para a live', corpo: 'Às 20h, dentro da GlobalFly. Abra o app e deixe tudo pronto.', publico: 'aguardando', parceiro: 'n', aparelhos: 412, enviados: 398, falhas: 14, teste: false }, { id: '2', criado_em: '2026-11-02T13:58:00Z', titulo: '⏰ Falta 1 hora para a live', corpo: 'Às 20h, dentro da GlobalFly.', publico: 'eu', parceiro: null, aparelhos: 2, enviados: 2, falhas: 0, teste: true }]), { status: 200 })
      return f(u, i)
    }) as typeof fetch
    return <Suspense fallback={null}><div className="admin-page" style={{ padding: 24 }}><AdminNotificacoesLab sessao={{ token: 'lab' } as never} /></div></Suspense>
  }
  if (qual === 'lancamento-admin') {
    // o painel da live com respostas de mentira (o banco de verdade só responde ao admin geral)
    const f = window.fetch
    window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('teeds_lancamento_')
      ? new Response(JSON.stringify(String(u).includes('painel') ? { inicioPrevisto: '2026-11-09T23:00:00Z', youtube: null, noAr: new URLSearchParams(location.search).has('noar'), comecouEm: null, terminouEm: null, liberadoEm: null, liberados: null, podeControlar: !new URLSearchParams(location.search).has('parceiro'), minimoPct: 80, aguardando: 412, assistindoAgora: 318, assistiram: 356, ficaram: 241, total: 74 } : {}), { status: 200 })
      : f(u, i)) as typeof fetch
    return <Suspense fallback={null}><div className="admin-page" style={{ padding: 24 }}><AdminLancamento sessao={{ token: 'lab' } as never} /></div></Suspense>
  }
  if (qual === 'preacesso') return <PreAcesso sessao={{ token: 'lab' } as never} nome="Ana Souza" aoConferir={async () => false} aoSair={nada} />
  if (qual === 'analise') return <CadastroEmAnalise email="miqueias.sena@outlook.com" nome="Miqueias Sena" aoConferir={async () => { await new Promise((r) => setTimeout(r, 700)); return false }} aoSair={nada} />
  if (qual === 'aulas-admin') {
    // ?tela=aulas-admin: o editor da grade das aulas, com o banco de mentira (o rascunho fica só na memória)
    const f = window.fetch
    let rascunho: unknown = null
    const arquivosDoLab = new Map<string, string>()
    const srcOriginal = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!
    Object.defineProperty(HTMLImageElement.prototype, 'src', { ...srcOriginal, set(v: string) { srcOriginal.set!.call(this, arquivosDoLab.get(v) ?? v) } })
    const setAttr = Element.prototype.setAttribute
    Element.prototype.setAttribute = function (n: string, v: string) { return setAttr.call(this, n, n === 'src' || n === 'srcset' ? arquivosDoLab.get(v) ?? v : v) }
    window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => {
      const url = String(u), ok = (d: unknown, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json' } })
      // 16/11/2026: capas enviadas ficam na memória; a imagem aparece pelo endereço do Storage
      if (url.includes('/storage/v1/object/materiais/') && i?.method === 'POST') { arquivosDoLab.set(url.replace('/object/materiais/', '/object/public/materiais/'), URL.createObjectURL(i.body as Blob)); return ok({ Key: 'lab' }) }
      if (arquivosDoLab.has(url)) return f(arquivosDoLab.get(url)!)
      if (url.includes('/rest/v1/aulas_grade_versoes')) return ok([])
      if (url.includes('/rest/v1/aulas_grade')) { if (i?.method === 'POST') { rascunho = JSON.parse(String(i.body)).rascunho; return new Response(null, { status: 201 }) } return ok(rascunho ? [{ rascunho, rascunho_em: new Date().toISOString() }] : []) }
      if (url.includes('teeds_aulas_publicar')) return ok(new Date().toISOString())
      if (url.includes('/rest/v1/aulas_videos')) return ok([])
      if (url.includes('teeds_aulas_controle')) return ok([])
      if (url.includes('teeds_curso_alunos')) return ok([{ user_id: 'u1', nome: 'Marina Costa', email: 'marina@exemplo.com', origem: 'cakto', concedido_em: new Date(Date.now() - 864e5 * 3).toISOString(), expira_em: null, ativo: true }, { user_id: 'u2', nome: 'Paulo Reis', email: 'paulo@exemplo.com', origem: 'manual', concedido_em: new Date(Date.now() - 864e5 * 12).toISOString(), expira_em: new Date(Date.now() + 864e5 * 78).toISOString(), ativo: true }])
      if (url.includes('teeds_curso_liberar')) { const b = JSON.parse(String(i?.body ?? '{}')); return ok(/@/.test(b.p_email) ? { ok: true, nome: b.p_email.split('@')[0] } : { erro: 'Nenhum cadastro com este e-mail nesta plataforma.' }) }
      if (url.includes('/rest/v1/planos_da_marca')) return ok([{ plano_id: 'treino', nome: 'GF Member', marca: MARCA.id, ativo: true, ordem: 1 }, { plano_id: 'black', nome: 'Black', marca: MARCA.id, ativo: true, ordem: 2 }, { plano_id: 'prestige', nome: 'Prestige', marca: MARCA.id, ativo: true, ordem: 3 }])
      return f(u, i)
    }) as typeof fetch
    return <Suspense fallback={null}><div className="app workspace-app"><main className="admin-page" style={{ padding: 24 }}><AdminAulasLab sessao={{ token: 'lab', refresh: 'lab', expiraEm: Date.now() + 864e5, usuario: { id: 'lab', email: 'lab@exemplo.com', nome: 'Lab' } } as never} marca={MARCA.id} /></main></div></Suspense>
  }
  // ?tela=escolher-deriv: a escolha de conta da Deriv ao reconectar
  if (qual === 'escolher-deriv') return <div className="app workspace-app" style={{ minHeight: '100dvh' }}><EscolherContaDeriv aoContinuar={() => undefined} aoFechar={() => undefined} /></div>
  // ?tela=meu-plano(&sub=black): a janela dos subplanos do GF Member com os números de exemplo
  // ?tela=whatsapp(&conectado=1): a central do WhatsApp oficial com conversas de exemplo
  if (qual === 'whatsapp') {
    const conectado = new URLSearchParams(location.search).has('conectado')
    const api = whatsappDeExemplo(conectado ? { conectado: true, conta: { marca: 'globalfly', parceiro: 'n', numero: '+55 47 99000-1234', nomeVerificado: 'GlobalFly Trade', qualidade: 'GREEN', limite: 'TIER_1K', situacao: 'conectado', erro: null, ultimoAvisoEm: new Date(Date.now() - 120000).toISOString(), conectadoEm: new Date().toISOString(), phoneNumberId: '123456789012345', wabaId: '987654321098765', appId: '112233445566778' } } : {}, 'lab')
    const sessao = { token: 'lab', refresh: 'lab', expiraEm: Date.now() + 864e5, usuario: { id: 'lab', email: 'lab@exemplo.com', nome: 'Lab' } } as never
    return <div className="app workspace-app"><div className="admin-shell modo-suporte" style={{ gridTemplateColumns: '1fr' }}><main className="admin-main" style={{ padding: 16 }}><CentralWhatsApp sessao={sessao} marca="globalfly" apiDeTeste={api} /></main></div></div>
  }
  // ?tela=limite-simulador(&sub=black)(&resta=600): o relógio do simulador nos estados e a janela de quando acaba
  // ?tela=apostila: o visor da apostila do celular, já aberto
  if (qual === 'apostila') { setTimeout(() => window.dispatchEvent(new CustomEvent('plataforma:apostila')), 300); return <div className="app workspace-app" style={{ minHeight: '100dvh' }}><VisorDaApostila /></div> }
  if (qual === 'limite-simulador') {
    const q = new URLSearchParams(location.search)
    const sp = (id: string, nome: string, ordem: number, preco: number, ref: number, comp: number, ias: string[] | null, horas: number | null, extra: boolean, top: boolean) => ({ id, nome, ordem, chamada: '', precoReferencia: ref, preco, cobranca: preco ? 'anual' : 'aquisicao-zero', compartilhamento: comp, ias, simuladorHoras: horas, salaExtra: extra, assessor: top, lab: top, checkoutUrl: 'https://pay.cakto.com.br/exemplo', checkoutPorParceiro: {}, assessorWhatsapp: null, ativo: true })
    const subs = [sp('gold', 'Gold', 1, 0, 997, 0.1, ['goreme', 'falcon', 'legacy'], 1, false, false), sp('black', 'Black', 2, 997, 1997, 0.05, null, 12, true, false), sp('prestige', 'Prestige', 3, 1997, 2997, 0, null, null, true, true)]
    const atual = subs.find((x) => x.id === (q.get('sub') ?? 'gold')) ?? subs[0]
    const dados = { atual: atual.id, admin: false, minutosHoje: (atual.simuladorHoras ?? 1) * 60, subplanos: subs }
    const total = (atual.simuladorHoras ?? 1) * 3600
    return (
      <div className="app workspace-app" style={{ minHeight: '100dvh', display: 'block', padding: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', padding: 12, borderRadius: 12, border: '1px solid #1A2D45' }}>
          <RelogioDoSimulador restante={2832} total={total} correndo={false} aoAbrir={() => undefined} />
          <RelogioDoSimulador restante={2832} total={total} correndo aoAbrir={() => undefined} />
          <RelogioDoSimulador restante={540} total={total} correndo aoAbrir={() => undefined} />
          <RelogioDoSimulador restante={90} total={total} correndo aoAbrir={() => undefined} />
          <RelogioDoSimulador restante={0} total={total} correndo={false} aoAbrir={() => undefined} />
        </div>
        {!q.has('sem-janela') && createPortal(<JanelaSemTempo dados={dados} atual={atual} aoFechar={() => undefined} />, document.body)}
      </div>
    )
  }
  // ?tela=contas-travadas: o painel Admin › Contas travadas com pessoas de exemplo (16/11/2026)
  if (qual === 'contas-travadas') {
    const nomes = ['Ana Paula Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Elisa Prado', 'Fábio Nunes', 'Gabriela Reis', 'Hugo Alves', 'Isabela Costa', 'João Pedro Silva']
    const agora = Date.now()
    const pessoas = nomes.map((nome, i) => ({
      user_id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, nome, email: `${nome.split(' ')[0].toLowerCase()}@exemplo.com`,
      parceiro: i % 3 === 0 ? 'n' : 'v', parceiro_nome: i % 3 === 0 ? 'Naor' : 'Victor Cordeiro',
      travada: i > 2, subplano: i === 1 ? 'black' : 'gold', saldo: i === 0 ? 50 : i === 2 ? 15 : 0, conta_real: i % 2 === 0, no_inicio: true,
      cliques: i === 9 ? null : { abriu: 1 + (i % 4), ...(i % 2 === 0 ? { depositar: 1 } : {}), ...(i === 1 ? { black: 2 } : {}), ...(i === 4 ? { prestige: 1, suporte: 1 } : {}), ...(i > 5 ? { fechar: 1 } : {}), ...(i === 0 ? { verificar: 1 } : {}) },
      primeiro: new Date(agora - (i + 1) * 9e5).toISOString(), ultimo: i === 9 ? null : new Date(agora - i * 6e5).toISOString(),
      push_enviado: i < 8, push_recebeu: i < 6, push_clicou: i < 2,
    }))
    const exemplo = { agora: new Date().toISOString(), parceiro: null, inicio: '2026-11-16T13:50:00Z', travados_agora: 941, pessoas, dias: [],
      push: [{ id: 'x', em: '2026-11-16T13:56:20Z', titulo: '🔒 Libere a sua conta GlobalFly', pessoas: 114, aparelhos: 120, receberam: 69, clicaram: 1 }] }
    const original = window.fetch
    window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('gf_painel_liberacao') ? new Response(JSON.stringify(exemplo), { status: 200 }) : original(u, i)) as typeof fetch
    const sessao = { token: 'lab', refresh: 'lab', expiraEm: Date.now() + 864e5, usuario: { id: 'lab', email: 'lab@exemplo.com', nome: 'Lab' } } as never
    return <div className="app workspace-app"><div className="admin-shell" style={{ gridTemplateColumns: '1fr' }}><main className="admin-main" style={{ padding: 16 }}><ContasTravadas sessao={sessao} marca="globalfly" parceiro={null} /></main></div></div>
  }
  // ?tela=liberar-conta(&sem-deriv): a janela do Gold sem saldo na conta real (16/11/2026)
  if (qual === 'liberar-conta') {
    const q = new URLSearchParams(location.search)
    const sp = (id: string, nome: string, ordem: number, preco: number, ref: number, comp: number, ias: string[] | null, horas: number | null) => ({ id, nome, ordem, chamada: ({ black: 'Todas as I.A., mais simulador e a sala extra.', prestige: 'Tudo liberado, sem compartilhamento, com assessor e GFT Lab.' } as Record<string, string>)[id] ?? '', precoReferencia: ref, preco, cobranca: preco ? 'anual' : 'aquisicao-zero', compartilhamento: comp, ias, simuladorHoras: horas, salaExtra: !!preco, assessor: horas == null, lab: horas == null, checkoutUrl: 'https://pay.cakto.com.br/exemplo', checkoutPorParceiro: {}, assessorWhatsapp: null, ativo: true })
    const planos = [sp('gold', 'Gold', 1, 0, 997, 0.1, ['goreme', 'falcon', 'legacy'], 1), sp('black', 'Black', 2, 997, 1997, 0.05, null, 12), sp('prestige', 'Prestige', 3, 1997, 2997, 0, null, null)] as never
    const semDeriv = q.has('sem-deriv')
    return (
      <div className="app workspace-app" style={{ minHeight: '100dvh' }}>
        {createPortal(<JanelaLiberarConta planos={planos} derivConectada={!semDeriv} saldoReal={semDeriv ? null : 0} aoFechar={() => undefined} />, document.body)}
      </div>
    )
  }
  if (qual === 'meu-plano') {
    const sp = (id: string, nome: string, ordem: number, preco: number, ref: number, comp: number, ias: string[] | null, horas: number | null, extra: boolean, top: boolean) => ({ id, nome, ordem, chamada: { gold: 'A entrada no GF Member, com participação nos lucros.', black: 'Todas as I.A., mais simulador e a sala extra.', prestige: 'Tudo liberado, sem compartilhamento, com assessor e GFT Lab.' }[id] ?? '', precoReferencia: ref, preco, cobranca: preco ? 'anual' : 'aquisicao-zero', compartilhamento: comp, ias, simuladorHoras: horas, salaExtra: extra, assessor: top, lab: top, checkoutUrl: null, checkoutPorParceiro: {}, assessorWhatsapp: null, ativo: true })
    const dados = { atual: new URLSearchParams(location.search).get('sub') ?? 'gold', admin: new URLSearchParams(location.search).has('admin'), minutosHoje: 38, subplanos: [sp('gold', 'Gold', 1, 0, 997, 0.1, ['goreme', 'falcon', 'legacy'], 1, false, false), sp('black', 'Black', 2, 997, 1997, 0.05, null, 12, true, false), sp('prestige', 'Prestige', 3, 1997, 2997, 0, null, null, true, true)] }
    if (new URLSearchParams(location.search).has('loja')) { simularMeuSubplano(dados); return <div className="app workspace-app" style={{ minHeight: '100dvh', display: 'block', overflow: 'auto' }}><MarketplaceDoGFLab sessao={null} /></div> }
    return <div className="app workspace-app" style={{ minHeight: '100dvh' }}><MeuPlanoLab dados={dados} foco="black" aoFechar={() => undefined} /></div>
  }
  // ?tela=moedas: as moedas 3D e as bandeiras do conversor
  if (qual === 'moedas') return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, padding: 24, background: '#1b1e25', minHeight: '100dvh', alignContent: 'start' }}>
      {MOEDAS_LAB.map((c) => <div key={c} style={{ display: 'grid', justifyItems: 'center', gap: 6, color: '#fff', font: '600 13px Arimo, sans-serif' }}><Moeda codigo={c} tamanho={72} /><Bandeira codigo={c} tamanho={28} />{c}</div>)}
    </div>
  )
  if (qual === 'aulas') return <LabAulas />
  if (qual === 'boasvindas') return <LabBoasVindas />
  if (qual === 'estreia') return <LabEstreia />
  if (qual === 'minicabine') return <Suspense fallback={null}><LabMiniCabine /></Suspense>
  // ?tela=sessao-simulada: a aba das I.A. como o admin da GF vê, com o ícone da sessão simulada e o saldo do topo
  if (qual === 'sessao-simulada') return (
    <div className="app workspace-app" data-laboratorio={qual} style={{ minHeight: '100dvh' }}>
      <header className="topbar" style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 16px' }}>
        <div className="topbar-right">
          <ModoSimuladoLab />
          <AccountSwitcher contas={[]} selecionada="CR1234567" isDemo={false} saldo={1234.56} moeda="USD" conectando={false} onTrocar={nada} onRecarregar={nada} onSair={nada} />
        </div>
      </header>
      <LabOutraTela />
      <RobotsPanel socket={null} logado isDemo={false} moeda="USD" symbols={symbols} symbolPadrao="R_75" sessaoTeeds={null} admin onConectarDeriv={nada} onSessoesVivas={labVivas} />
    </div>
  )
  return (
    <div className="app workspace-app" data-laboratorio={qual}>
      <main className="ger rob robot-workspace tem-acompanhamento">
        {qual === 'cabine' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoRodando} expandido={false} titulo="Robô 1" /></div>}
        {qual === 'cockpit' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoRodando} expandido titulo="Robô 1" /></div>}
        {qual === 'espera' && <div className="rob-workspace-board modo-lista"><CabineEspera /></div>}
        {qual === 'espera-mosaico' && <div className="rob-workspace-board modo-mosaico"><CabineEspera mosaico /></div>}
        {qual === 'meta-de-novo' && <LabMetaDeNovo />}
        {qual === 'curva-viva' && <LabCurvaViva />}
        {qual === 'parado' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoParado} expandido={false} titulo="Robô 1" /></div>}
        {qual === 'preparo' && (
          <CatalogoDeExemplo itens={CATALOGO_LAB.map((i) => ({ id: i.id, ativo: true, parametros: parametrosPadrao(i.id), lossVirtualAjustavel: true }))}>
          <div className="rob-workspace-board modo-lista"><div className="cabine-caixa cartao parado">
            <RobotSetup identidade={ident} nomeEstrategia={ident.nome} symbols={symbols} symbolInicial="R_75"
              configInicial={config} moeda="USD" isDemo={!new URLSearchParams(location.search).has('real')} contaId="VRTC1234567" escolherModelo
              onCancelar={nada} onLigar={(cfg, _a, m) => {
                (window as unknown as { __cfgLigado?: unknown }).__cfgLigado = cfg
                // como o painel faz quando o servidor aceita: lembra a meta e o limite desta I.A. nesta conta
                lembrarMetaEStop(m?.id ?? ident.id, !new URLSearchParams(location.search).has('real'), cfg.takeProfit, cfg.stopLoss)
              }} ligando={false} erro={null} />
          </div></div>
          </CatalogoDeExemplo>
        )}
        {/* ?tela=digitos: o painel Dígitos ao vivo (ticks de verdade da Deriv, linha pública). */}
        {qual === 'digitos' && <DigitosFlutuante aoFechar={nada} />}
        {qual === 'catalogo' && <RobotCatalog selected={ident.id} onSelect={nada} />}
        {/* ?tela=vitrine: a vitrine de robôs (GlobalFly); "Configurar" abre o preparo já no robô. */}
        {/* ?tela=marketplace (&trancadas=1): o Marketplace da marca; com trancadas, Gulf e Phenom aparecem a vender */}
        {qual === 'marketplace' && <LabMarketplace />}
        {qual === 'vitrine' && <LabVitrine />}
        {/* ?tela=gerenciamento: a tela Gerenciamento com o catálogo de fábrica (para a apostila) */}
        {qual === 'gerenciamento' && (
          <CatalogoDeExemplo itens={CATALOGO_LAB.map((i) => ({ id: i.id, ativo: true, parametros: parametrosPadrao(i.id), lossVirtualAjustavel: true }))}>
            <Suspense fallback={null}><LabGerenciamento /></Suspense>
          </CatalogoDeExemplo>
        )}
        {/* ?tela=grafico-pro: o gráfico profissional (indicadores e desenhos) com velas de exemplo. */}
        {qual === 'grafico-pro' && <Suspense fallback={null}><LabGraficoPro /></Suspense>}
        {/* ?tela=icones: os ícones dos ativos, como aparecem na lista "Trocar ativo". */}
        {qual === 'icones' && <div className="ativo-menu" style={{ position: 'static', width: 340 }}><div className="symbol-list">{['R_75', '1HZ10V', '1HZ100V', 'frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxAUDUSD', 'frxUSDCAD', 'frxXAUUSD', 'frxXAGUSD'].map((c) => <button key={c} className="symbol"><IconeAtivo simbolo={c} /><span className="sym-name">{c === 'frxXAUUSD' ? 'Ouro' : c === 'frxXAGUSD' ? 'Prata' : c}</span><span className="dot on" /></button>)}</div></div>}
        {/* ?tela=menu: o menu lateral com a tela de Robôs (I.A. na GlobalFly) aberta. */}
        {/* ?tela=robos-sem-deriv: a tela das I.A. com a Deriv desconectada (a vitrine aparece; o Iniciar pede a conexão) */}
        {qual === 'robos-sem-deriv' && <RobotsPanel socket={null} logado={false} isDemo moeda="USD" symbols={symbols} symbolPadrao="R_75" sessaoTeeds={null} onConectarDeriv={nada} />}
        {qual === 'menu' && <div className="workspace-app" style={{ minHeight: 'calc(100vh / var(--escala-pagina, 1))' }}><WorkspaceNav page="robos" admin mostrarInicio mostrarDivulgacao onNavigate={nada} /><div style={{ position: 'fixed', top: 12, right: 16, zIndex: 50 }}><UserMenu admin usuario={{ id: 'lab', nome: 'Tiago Dal Ri', email: 'tiago@exemplo.com' } as never} onSair={nada} onPerfil={nada} /></div><LabVitrine /></div>}
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
        {/* ?tela=treino&membros=1: a Central ao vivo com membros de mentira entrando, saindo e escrevendo para a equipe */}
        {qual === 'treino' && <Suspense fallback={null}><LabCentral /></Suspense>}
        {/* ?tela=central-extras: quem recebe (plataformas / teste) e o histórico das transmissões */}
        {qual === 'central-extras' && <Suspense fallback={null}><LabCentralExtras /></Suspense>}
        {/* ?tela=treino-membro: o membro do plano assistindo o ensaio do admin. */}
        {/* ?tela=inicio&perfil=experiente|novo&tema=escuro|claro: a home, dentro da casca da plataforma */}
        {qual === 'treino-membro' && <Suspense fallback={null}><LabAssistirTreino /></Suspense>}
        {/* ?tela=treino-aluno&ingresso=aluno: o aluno de verdade numa sala de teste (com o painel em outra aba) */}
        {qual === 'treino-aluno' && <Suspense fallback={null}><AssistirTreinoReal /></Suspense>}
        {qual === 'treino-player' && <Suspense fallback={null}><LabAssistirTreino fora={(new URLSearchParams(location.search).get('modo') ?? 'flutuante') as never} /></Suspense>}
        {/* ?tela=selo-tv: o selo vermelho do topo, o aviso "começou agora" e a tag do menu. */}
        {qual === 'selo-tv' && (
          <div className="workspace-app" style={{ padding: 24, display: 'grid', gap: 24 }}>
            <div className="topbar" style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', border: '1px solid var(--border)', borderRadius: 12, padding: '0 16px' }}>
              <button className="selo-tv"><i aria-hidden="true" />Ao vivo</button>
              <div className="status status-open so-bolinha" role="status" aria-label="Conectado" title="Conectado"><i /></div>
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
                <div className="status status-open so-bolinha" role="status" aria-label="Conectado" title="Conectado"><i /></div>
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
        {/* ?tela=dig (&largura=300): o painel de Dígitos do Manual na largura da lateral, com ticks públicos do 75 Index */}
        {qual === 'dig' && <div style={{ width: Number(new URLSearchParams(location.search).get('largura') ?? 300), padding: 12, background: 'var(--bg)' }}>
          <DigitsPanel symbol="R_75" pipSize={4} stake={10} moeda="USD" podeOperar logado comprando={false} onComprar={nada} confirmando={null} onDesarmar={nada} motivoBloqueio={null} />
        </div>}
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

// meta-de-novo sem StrictMode: a montagem dupla do desenvolvimento desliga o acompanhamento da sessão adotada (no site não existe)
// &ingresso=…: também sem StrictMode (a montagem dupla entra duas vezes na sala de verdade e o LiveKit derruba a primeira)
const semModoEstrito = new URLSearchParams(location.search).get('tela') === 'meta-de-novo' || new URLSearchParams(location.search).has('ingresso')
ReactDOM.createRoot(document.getElementById('root')!).render(semModoEstrito ? <Laboratorio /> : <React.StrictMode><Laboratorio /></React.StrictMode>)

/** A Central ao vivo no laboratório: com &membros=1, membros de mentira entram, saem e escrevem. */
function LabCentral() {
  // ?tela=treino&equipe=espelho|dono&palco=2: a Central na live com outros administradores (26/11/2026)
  useEffect(() => {
    const modo = new URLSearchParams(location.search).get('equipe')
    if (!modo) return
    void Promise.all([import('./core/live/treino'), import('./core/live/simulacao'), import('./components/aovivo/AssistirTreino')]).then(([tr, sim, lab]) => {
      const palco = lab.palcoDoLab()
      if (modo === 'espelho') {
        sim.espelharSimulacao(() => undefined)
        sim.receberEspelho({ ativa: true, publicoAgora: 712, publicoAlvo: 700, apresentador: 'Victor Dias', mensagens: [
          { id: 'a', nome: 'Ana', texto: 'boa noite pessoal', apresentador: false, entrada: false, hora: Date.now() - 60000 },
          { id: 'b', nome: 'Victor Dias', texto: 'Meta de hoje: 5%.', apresentador: true, entrada: false, hora: Date.now() - 30000 },
          { id: 'c', nome: 'Carla', texto: 'Como faço o limite de perda?', apresentador: false, entrada: false, membro: true, hora: Date.now() - 10000 },
        ] })
        tr.simularTreino({ fase: 'conectada', apresentador: true, meuNome: 'Naor Bezerra', coApresentando: true, dono: 'Victor Dias', noPalco: new URLSearchParams(location.search).has('nopalco'), ...palco })
      } else if (modo === 'fichas') {
        sim.iniciarSimulacao('Victor Dias')
        const gente = [['a', 'Ana Paula Reis', 'São Paulo', 'SP', 1250.4, 312.8, 18.6, 7], ['b', 'João Ferreira', 'Recife', 'PE', 87.1, 41.2, 4.3, 3], ['c', 'Mariana Lopes', 'Curitiba', 'PR', null, 0, 0, 0], ['d', 'Lucas Martins', 'Goiânia', 'GO', 5320, 1840.55, 62.1, 21]] as const
        tr.simularTreino({ fase: 'conectada', apresentador: true, meuNome: 'Victor Dias', membros: 4, inicioDaLive: Date.now() - 1800_000, membrosNaSala: gente.map(([id, nome]) => ({ id, nome })) })
        void import('./components/aovivo/MembrosDaLive').then(({ simularFichas }) => simularFichas(gente.map(([id, nome, cidade, uf, saldo, total, live, ops], i) => ({
          id, nome, foto: null, desde: new Date(Date.now() - (i + 1) * 97 * 864e5).toISOString(), plano: 'treino', cidade, uf, saldo, moeda: 'USD',
          markupTotal: total, markupLive: live, opsLive: ops, ultimaOp: i % 2 ? null : new Date().toISOString(),
        }))))
      } else {
        sim.iniciarSimulacao('Victor Dias')
        tr.simularTreino({ fase: 'conectada', apresentador: true, meuNome: 'Victor Dias', ...palco, palco: (palco.palco ?? []).map((p, i) => ({ ...p, eu: i === 0 })) })
      }
    })
  }, [])
  useEffect(() => {
    if (!new URLSearchParams(location.search).has('membros')) return
    let vivo = true
    void import('./core/live/treino').then(({ simularTreino }) => import('./core/live/simulacao').then(({ mensagemDeMembro, iniciarSimulacao }) => {
      if (!vivo) return
      iniciarSimulacao('Tiago')
      const todos = ['Ana Paula Reis', 'João Ferreira', 'Mariana Lopes', 'Lucas Martins', 'Camila Santos', 'Pedro Almeida']
      let presentes = todos.slice(0, 3)
      simularTreino({ fase: 'conectada', apresentador: true, membros: presentes.length, nomes: presentes })
      const frases = ['Qual valor de entrada vocês usam com banca de 200?', 'Meu robô parou depois do stop, é normal?', 'Vai ter live amanhã no mesmo horário?', 'Consegui bater a meta hoje!']
      let n = 0
      const t = window.setInterval(() => {
        n++
        if (n % 3 === 0) { const quem = todos[Math.floor(Math.random() * todos.length)]; mensagemDeMembro(quem, frases[n % frases.length]) }
        else {
          const fora = todos.filter((x) => !presentes.includes(x))
          presentes = fora.length && Math.random() < .6 ? [...presentes, fora[0]] : presentes.slice(1)
          simularTreino({ membros: presentes.length, nomes: presentes })
        }
      }, 2500)
      cancelar = () => window.clearInterval(t)
    }))
    let cancelar = () => {}
    return () => { vivo = false; cancelar() }
  }, [])
  // &blocos=1: com uma sessão de mentira, para os blocos de mensagens aparecerem
  const ingresso = new URLSearchParams(location.search).get('ingresso')
  const sessao = new URLSearchParams(location.search).has('blocos') ? { token: 'lab', usuario: { id: ingresso ? `lab-${ingresso}` : 'lab', nome: ingresso === 'b' ? 'Victor' : 'Tiago', email: 'lab@lab' } } as never : null
  return <SalaDeTreino apresentador="Tiago" aoSair={() => undefined} sessao={sessao} />
}

function LabMarketplace() {
  const [pronto, setPronto] = useState(false)
  useEffect(() => {
    void import('./core/teeds/robosLiberados').then(({ simularRobosBloqueados }) => {
      simularRobosBloqueados(new URLSearchParams(location.search).has('trancadas') ? ['superior5', 'ag2'] : [])
      setPronto(true)
    })
  }, [])
  if (!pronto) return null
  return <div className="workspace-app"><Suspense fallback={null}><MarketplaceDoLab sessao={null} /></Suspense></div>
}
const MarketplaceDoLab = lazy(() => import('./components/MarketplacePanel').then((m) => ({ default: m.MarketplacePanel })))

function LabAssistente() {
  const q = new URLSearchParams(location.search)
  const sessao = { token: 'lab', refresh: 'lab', expiraEm: Date.now() + 3600e3, usuario: { id: 'lab', email: 'lab@lab', nome: 'tiago dalri', telefone: null, cpf: null, criadoEm: '' } } as never
  const inicial: ItemDoAssistente[] | undefined = q.has('conversa') ? [
    { tipo: 'cliente', texto: 'como funciona esse mercado?' },
    { tipo: 'assistente', texto: 'As operações na Deriv utilizam contratos de dígitos no índice sintético Volatility 75, baseando-se no último\nnúmero do preço do ativo.\nCada I.A. segue uma regra matemática específica de previsão sobre qual dígito vai aparecer.' },
    { tipo: 'cliente', texto: 'Como estão minhas I.A.?' },
    { tipo: 'assistente', texto: '2 I.A. operando, somando USD 3,42:\n• GF Raptor — 14 operações, USD 2,10 (demonstração)\n• GF Falcon — 9 operações, USD 1,32 (demonstração)' },
    { tipo: 'cliente', texto: 'qual porcentagem devo buscar?' },
    { tipo: 'assistente', texto: 'A definição de metas e limites é pessoal e depende da sua tolerância a risco.\nNão há percentual garantido ou recomendado\n, pois o mercado envolve perdas possíveis.' },
  ] : undefined
  // &escondido=1: nasce escondido (como no app, montado enquanto a pessoa está em outra aba) e aparece depois
  const [oculto, setOculto] = useState(q.has('escondido'))
  useEffect(() => { if (oculto) { const t = window.setTimeout(() => setOculto(false), 700); return () => window.clearTimeout(t) } }, [oculto])
  return (
    <div className="app workspace-app" style={{ paddingLeft: 0 }}>
      <div className="tela-viva" hidden={oculto}>
        <AssistentePanel sessao={sessao} socket={null} symbols={[]} symbolPadrao={null} conexao={'closed' as never} administracao inicial={inicial} />
      </div>
      {/* &barra=1: a barra de baixo do celular (só a casca, para ver a caixa de escrever acima dela) */}
      {q.has('barra') && <nav className="barra-inferior">{['Início', 'I.A.', 'Manual', 'Aulas', 'Suporte'].map((t) => <button key={t} type="button"><span className="barra-icone" /><span className="barra-rotulo">{t}</span></button>)}</nav>}
    </div>
  )
}
