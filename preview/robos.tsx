/* Dev-only visual fixture. No authentication, orders or server connection.
 * Vite's production entry remains index.html, so this is not published. */
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceNav } from '../src/components/WorkspaceNav'
import { RobotLive } from '../src/components/RobotLive'
import { RobotOverview } from '../src/components/RobotOverview'
import { RobotSetup } from '../src/components/RobotSetup'
import type { EstadoMotor, ConfigEstrategia } from '../src/core/deriv/engine'
import type { SessaoViva } from '../src/core/teeds/servidorRobos'
import { MARCA } from '../src/marca'
import { identidade } from '../src/core/deriv/branding'
import '../src/styles/app.css'
import '../src/styles/tema.css'
import '../src/components/robot-workspace.css'

const config: ConfigEstrategia = { valorInicial: .35, valorAoVencer: .35, fatorGale: 1, galeApos: 3, valorMaximo: 5, takeProfit: 100, stopLoss: 40, maxOperacoes: 0 }
function estado(index: number): EstadoMotor {
  const resultado = index % 2 ? -4.2 : 55.39
  const historico = Array.from({ length: 12 }, (_, i) => ({
    n: 480 - i, contractId: 1000 * (index + 1) + i, valor: .35, entrada: 6643.41,
    saida: 6643.48, digitoEntrada: 1, digitoSaida: 8, lucro: i % 3 ? .67 : -.35,
    payout: 1.02, markupDeriv: null, ganhou: !!(i % 3), quando: Date.now() - i * 2300,
    esperou: 1, contractType: 'DIGITOVER',
  }))
  return { rodando: true, emOperacao: false, operacoes: 480, vitorias: 141, derrotas: 339,
    perdasSeguidas: 0, resultado, movimentado: 192, valorAtual: .35,
    aguardando: 'Aguardando a próxima entrada', motivoParada: null, registros: [],
    digitos: [4, 8, 2, 9, 7, 3, 1, 8], curva: [0, 1, 3, 2, 8, 6, 12, 10, resultado],
    condicao: null, ultimoLucro: .67, historico, emCurso: null, ticksAnalisados: 600,
  } as EstadoMotor
}
const exemplos: SessaoViva[] = Array.from({ length: 4 }, (_, index) => ({ id: `fixture-${index}`, roboId: 'superior5', roboNome: identidade(MARCA.robos[index % MARCA.robos.length]).nome, contaId: 'DEMO1234', demo: true, moeda: 'USD', origem: 'navegador', config, erro: null, estado: estado(index) }))

function Preview() {
  const [preparando, setPreparando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [quantidade, setQuantidade] = useState(2)
  const [foco, setFoco] = useState<string | null>(null)
  const [lista, setLista] = useState(false)
  const [claro, setClaro] = useState(false)
  return <div className="app workspace-app">
    <WorkspaceNav page="robos" admin={true} onNavigate={() => {}} />
    <header className="topbar"><div className="workspace-heading"><strong>Robôs</strong><span>Prévia com dados fictícios · nenhuma operação será enviada</span></div><button onClick={() => { document.documentElement.dataset.tema = claro ? 'escuro' : 'claro'; setClaro(!claro) }}>Tema {claro ? 'escuro' : 'claro'}</button></header>
    <div className="tela-viva"><div className="ger rob robot-workspace tem-acompanhamento">
      <div className="ger-topo rob-workspace-header"><div><span className="rob-eyebrow">CENTRAL DE ROBÔS</span><h2>Tudo sob seu controle.</h2><p className="ger-sub">Acompanhe cada sessão. Abra os detalhes quando precisar.</p></div><div className="rob-workspace-actions"><span className="rob-account-tag">SIMULAÇÃO DE LAYOUT</span><select aria-label="Quantidade de cartões de teste" value={quantidade} onChange={e => { setQuantidade(+e.target.value); setFoco(null) }}><option value="1">1 robô</option><option value="2">2 robôs</option><option value="4">4 robôs</option></select></div></div>
      <div><button className="rob-new-button" onClick={() => setPreparando(true)}>+ Novo robô</button>{aviso && <p role="status">{aviso}</p>}</div>
      {preparando && <RobotSetup identidade={identidade(MARCA.robos[0])} nomeEstrategia={identidade(MARCA.robos[0]).nome} symbols={[]} symbolInicial="1HZ75V" configInicial={config} moeda="USD" isDemo contaId="DEMO1234" escolherModelo onCancelar={() => setPreparando(false)} onLigar={() => { setPreparando(false); setAviso('Prévia concluída. Nenhuma operação foi enviada.') }} />}
      <RobotOverview sessoes={exemplos.slice(0, quantidade)} />
      <div className="rob-workspace-toolbar"><div><b>{foco ? 'Modo foco' : 'Área de acompanhamento'}</b><span>{foco ? 'Os outros robôs continuam operando.' : 'Cada robô mantém sua estratégia e seus limites.'}</span></div><div className="rob-view-options">{foco ? <button onClick={() => setFoco(null)}>← Ver todos os robôs</button> : <><button aria-pressed={!lista} onClick={() => setLista(false)}>▦ Lado a lado</button><button aria-pressed={lista} onClick={() => setLista(true)}>☰ Em lista</button></>}</div></div>
      <div className={`rob-workspace-board modo-${lista ? 'lista' : 'grade'} ${quantidade === 1 ? 'painel-unico' : ''} ${foco ? 'em-foco' : ''}`}>
        {exemplos.slice(0, quantidade).map((s, i) => <div key={s.id} className="rob-board-slot" hidden={!!foco && foco !== s.id}><div className="cabine-caixa rodando"><RobotLive estado={s.estado} config={config} moeda="USD" contaDaSessao={s} nomeEstrategia={s.roboNome} estrategiaId={s.roboId} ativo="Volatility 75 (1s) Index" titulo={`Robô ${i + 1}`} regra="maior que 6" ganhaCom={d => d > 6} expandido={foco === s.id} onExpandir={() => setFoco(foco === s.id ? null : s.id)} /></div></div>)}
      </div>
    </div></div>
  </div>
}
createRoot(document.getElementById('root')!).render(<Preview />)
