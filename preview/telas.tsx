/* Bancada de captura das telas da landing (dev-only).
 *
 * As fotos de `captura/plataforma/*.webp` mostram a plataforma por dentro.
 * Tirar print da plataforma de verdade exige login, conta conectada e robô
 * rodando — e as fotos envelhecem a cada mudança de tela. Esta página monta
 * as MESMAS telas com os MESMOS componentes, alimentados por dados de
 * exemplo: dá para recapturar quando quiser, sem conta e sem operação.
 *
 *   npx vite            → http://localhost:5194/preview/telas.html?tela=robos
 *   MARCA=omni npx vite → a mesma coisa, com a casca da OMNI
 *
 * Nada aqui vai para o site publicado: o Vite só monta index.html.
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CadastroEmAnalise } from '../src/components/CadastroEmAnalise'
import { SeletorDePlataforma, opcoesDePlataforma } from '../src/components/SeletorDePlataforma'
import { REDE } from '../src/core/teeds/clientes'
import { MARCAS } from '../src/marca/marcas'
import { WorkspaceNav } from '../src/components/WorkspaceNav'
import { RobotLinha } from '../src/components/RobotResumo'
import { RobotLive } from '../src/components/RobotLive'
import { RobotOverview } from '../src/components/RobotOverview'
import { OperationalManagementPanel } from '../src/components/OperationalManagementPanel'
import { AulasPanel } from '../src/components/AulasPanel'
import { MarketplacePanel } from '../src/components/MarketplacePanel'
import { identidade } from '../src/core/deriv/branding'
import { ESTRATEGIAS_LOCAIS } from '../src/core/deriv/strategies'
import { aplicarTema } from '../src/core/tema'
import { MARCA } from '../src/marca'
import type { ConfigEstrategia, EstadoMotor } from '../src/core/deriv/engine'
import type { SessaoViva } from '../src/core/teeds/servidorRobos'
import '../src/styles/app.css'
import '../src/styles/tema.css'
import '../src/components/robot-workspace.css'
import '../src/styles/ux-refinements.css'
import '../src/styles/mobile-polish.css'

const tela = new URLSearchParams(location.search).get('tela') ?? 'robos'

/* ------------------------------------------------------------ exemplos */
/* Sessões de conta demo, com números modestos: a landing diz que a
   demonstração é ilustrativa, e nenhuma delas promete resultado. */
const config: ConfigEstrategia = {
  valorInicial: 1, valorAoVencer: 1, fatorGale: 0.05, galeApos: 1,
  valorMaximo: 0, takeProfit: 20, stopLoss: 40, maxOperacoes: 0,
}
const semente = (n: number) => { let s = n * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280) }

function estado(i: number, ops: number, resultado: number, rodando = true): EstadoMotor {
  const rnd = semente(i + 3)
  const historico = Array.from({ length: 10 }, (_, k) => {
    const ganhou = rnd() > 0.38
    const valor = k === 2 ? 2.41 : 1
    return {
      n: ops - k, contractId: 5000 + i * 100 + k, valor,
      entrada: 4532.4748 + k, saida: 4532.4751 + k,
      digitoEntrada: Math.floor(rnd() * 10), digitoSaida: Math.floor(rnd() * 10),
      lucro: ganhou ? +(valor * 1.92).toFixed(2) : -valor,
      payout: +(valor * 2.92).toFixed(2), markupDeriv: 0.0437, ganhou,
      quando: Date.now() - k * 2400, esperou: 1, contractType: 'DIGITOVER', pipSize: 4,
    }
  })
  const curva = Array.from({ length: 22 }, (_, k) => +(resultado * (k / 21) + (rnd() - 0.5) * 3).toFixed(2))
  curva[curva.length - 1] = resultado
  return {
    rodando, emOperacao: false, operacoes: ops,
    vitorias: Math.round(ops * 0.42), derrotas: ops - Math.round(ops * 0.42),
    perdasSeguidas: i === 1 ? 2 : 0, resultado, movimentado: ops * 1.6, valorAtual: i === 1 ? 2.41 : 1,
    aguardando: i === 1 ? 'sequência em andamento — entra na próxima' : 'esperando loss virtual — 2/4',
    motivoParada: null, registros: [], digitos: [8, 3, 9, 1, 7, 2, 8, 5, 0, 9],
    curva, condicao: null, ultimoLucro: 1.92, historico,
    emCurso: i === 1 ? { contractId: 1, valor: 2.41, comprouEm: Date.now() - 1200 } : null,
    ticksAnalisados: 18, latenciaMedia: 120, falha: null,
  } as unknown as EstadoMotor
}

const robos = MARCA.robos.slice(0, 4)
const sessoes: SessaoViva[] = robos.map((id, i) => ({
  id: `exemplo-${i}`, roboId: id, roboNome: identidade(id).nome,
  contaId: 'VRTC1234567', demo: true, moeda: 'USD', origem: 'navegador',
  config, erro: null, estado: estado(i, [84, 126, 57, 38][i], [12.4, 18.9, 6.2, 9.7][i]),
}))

/* ---------------------------------------------------------------- casca */
function Casca({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="app workspace-app">
      <WorkspaceNav page={tela === 'operar' ? 'operar' : tela === 'aulas' ? 'aulas' : tela === 'marketplace' ? 'marketplace' : tela === 'gerenciamento' ? 'gestao' : 'robos'} admin={false} onNavigate={() => {}} />
      <header className="topbar">
        <div className="workspace-heading"><strong>{titulo}</strong><span>{sub}</span></div>
        <div className="topbar-right">
          <div className="conta-chip" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', border: '1px solid var(--border)', borderRadius: 999, fontVariantNumeric: 'tabular-nums' }}>
            <em style={{ fontStyle: 'normal', fontSize: 10, fontWeight: 750, letterSpacing: '.08em', color: 'var(--account-demo)' }}>DEMO</em>
            <b style={{ fontSize: 15 }}><small style={{ color: 'var(--muted)', fontWeight: 500, marginRight: 4 }}>USD</small>10.000,00</b>
          </div>
        </div>
      </header>
      <div className="tela-viva">{children}</div>
    </div>
  )
}

/* ---------------------------------------------------------------- robôs */
function Robos() {
  const aberta = sessoes[0]
  const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === aberta.roboId) ?? ESTRATEGIAS_LOCAIS[0]
  const linha = (s: SessaoViva, i: number) => ({
    estado: s.estado, config, moeda: 'USD', nome: s.roboNome, cor: identidade(s.roboId).cor,
    numero: `#${i + 1}`, inicio: Date.now() - (i + 1) * 900_000, demo: true,
    modo: i === 0 ? 'Agressivo' : i === 1 ? 'Conservador' : null,
    onDesligar: () => {}, onRemover: () => {},
  })
  return (
    <Casca titulo="Robôs" sub="Estratégias e acompanhamento">
      <div className="ger rob robot-workspace tem-acompanhamento">
        <div className="ger-topo rob-workspace-header">
          <div>
            <span className="rob-eyebrow">CENTRAL DE ROBÔS</span>
            <h2>Suas sessões</h2>
          </div>
          <div className="rob-workspace-actions"><button className="rob-new-button">+ Novo robô</button></div>
        </div>
        <RobotOverview sessoes={sessoes} />
        <div className="rob-workspace-toolbar">
          <div><b>Área de acompanhamento</b><span>Clique numa linha para abrir a cabine dela. Os outros robôs seguem operando na linha deles.</span></div>
          <div className="rob-view-options"><button aria-pressed>☰ Em lista</button><button aria-pressed={false}>▦ Mosaico</button></div>
        </div>
        <div className="rob-workspace-board modo-lista">
          <div className="rob-board-group">
            <div className="rob-board-slot aberta">
              <div className="cabine-caixa aberta rodando" style={{ ['--robo' as string]: identidade(aberta.roboId).cor, ['--robo-suave' as string]: identidade(aberta.roboId).corSuave }}>
                <RobotLinha {...linha(aberta, 0)} aberta onAbrir={() => {}} />
                <RobotLive
                  estado={aberta.estado} config={config} moeda="USD"
                  contaDaSessao={{ contaId: aberta.contaId, demo: true, moeda: 'USD' }}
                  estrategiaId={estrategia.id} nomeEstrategia={aberta.roboNome}
                  ativo="Volatility 75 Index" titulo="#1" regra={estrategia.descricao ?? ''}
                  cor={identidade(aberta.roboId).cor} ganhaCom={(d: number) => d >= 7}
                  parametros={[
                    { rot: 'Ativo', valor: 'Volatility 75' },
                    { rot: 'Entrada', valor: 'USD 1,00' },
                    { rot: 'Recuperação', valor: 'modo agressivo' },
                    { rot: 'Teto', valor: 'sem teto' },
                    { rot: 'Para se ganhar', valor: 'USD 20,00' },
                    { rot: 'Para se perder', valor: 'USD 40,00' },
                  ]}
                  conexao="open" />
              </div>
            </div>
            {sessoes.slice(1).map((s, i) => (
              <div className="rob-board-slot" key={s.id}>
                <div className="cabine-caixa linha rodando" style={{ ['--robo' as string]: identidade(s.roboId).cor, ['--robo-suave' as string]: identidade(s.roboId).corSuave }}>
                  <RobotLinha {...linha(s, i + 1)} aberta={false} onAbrir={() => {}} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Casca>
  )
}

/* O seletor de plataforma e o pedido de marca, sem precisar de login.
   Foram desenhados em 30/09/2026 e é aqui que dá para olhar para eles. */
function Plataformas() {
  const [foco, setFoco] = useState(REDE)
  const opcoes = opcoesDePlataforma(true, MARCA.id)
  return (
    <Casca titulo="Administração" sub="Painel de controle">
      <div className="admin-shell" style={{ gridTemplateColumns: '1fr' }}>
        <main className="admin-main">
          <header className="admin-top">
            <div>
              <span className="rot">{foco === REDE ? `Rede ${MARCA.prosa}` : `${MARCAS[foco]?.prosa} Admin`}</span>
              <h1>Visão geral</h1>
              <p>{foco === REDE ? 'Todas as plataformas somadas, em um só lugar.' : `Tudo da ${MARCAS[foco]?.prosa} que precisa de atenção, em um só lugar.`}</p>
            </div>
            <div className="admin-top-acoes">
              <SeletorDePlataforma valor={foco} opcoes={opcoes} onTrocar={setFoco} />
              <button className="admin-refresh">↻ Atualizar</button>
            </div>
          </header>
          <section className="admin-card adm-pede-marca">
            <div>
              <span className="rot">Escolha uma plataforma</span>
              <h3>Isto acontece dentro de uma marca</h3>
              <p>
                Criar acesso, trocar o vídeo de uma aula, ligar um robô ou mexer no catálogo tem um dono:
                o cliente entra por um endereço, recebe o e-mail de uma marca e opera pelos robôs dela.
                A visão da rede soma o que já aconteceu; para <b>mexer</b>, escolha onde.
              </p>
            </div>
            <div className="adm-pede-marca-botoes">
              {opcoes.filter((o) => o.id !== REDE).map((o) => (
                <button key={o.id} type="button" onClick={() => setFoco(o.id)}>
                  <b>{o.nome}</b><small>{o.papel}</small>
                </button>
              ))}
            </div>
          </section>
        </main>
      </div>
    </Casca>
  )
}

const TELAS: Record<string, () => JSX.Element> = {
  robos: Robos,
  plataformas: Plataformas,
  espera: () => (
    <CadastroEmAnalise
      email="maria.souza@email.com"
      nome="Maria Souza"
      aoConferir={async () => false}
      aoSair={() => {}}
    />
  ),
  gerenciamento: () => <Casca titulo="Gerenciamento" sub="Seu espaço de trabalho"><OperationalManagementPanel /></Casca>,
  aulas: () => <Casca titulo="Aulas" sub="Seu espaço de trabalho"><AulasPanel nome="Tiago" /></Casca>,
  marketplace: () => <Casca titulo="Marketplace" sub="Seu espaço de trabalho"><MarketplacePanel /></Casca>,
}

aplicarTema('escuro')
const Tela = TELAS[tela] ?? Robos
createRoot(document.getElementById('root')!).render(<Tela />)
