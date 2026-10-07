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
import './components/robot-workspace.css'
import { aplicarTema, temaGuardado } from './core/tema'
import { MARCA } from './marca'
import { IDENTIDADES } from './core/deriv/branding'
import { parametrosPadrao } from './core/deriv/parametros'
import type { ConfigEstrategia, EstadoMotor, OperacaoMotor, Registro } from './core/deriv/engine'
import type { ActiveSymbol } from './core/deriv/types'
import { RobotLive } from './components/RobotLive'
import { RobotSetup } from './components/RobotSetup'
import { RobotCatalog } from './components/RobotCatalog'

document.documentElement.dataset.marca = MARCA.id
aplicarTema(temaGuardado())

const ident = IDENTIDADES[0]
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
    digitoEntrada: (i * 7) % 10, digitoSaida: ganhou ? 3 : 7, lucro, payout: +(valor * 1.92).toFixed(2),
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

function Laboratorio() {
  const qual = new URLSearchParams(location.search).get('tela') ?? 'cabine'
  return (
    <div className="app workspace-app" data-laboratorio={qual}>
      <main className="ger rob robot-workspace tem-acompanhamento">
        {qual === 'cabine' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoRodando} expandido={false} titulo="Robô 1" /></div>}
        {qual === 'cockpit' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoRodando} expandido titulo="Robô 1" /></div>}
        {qual === 'parado' && <div className="rob-workspace-board modo-lista"><Cabine estado={estadoParado} expandido={false} titulo="Robô 1" /></div>}
        {qual === 'preparo' && (
          <div className="rob-workspace-board modo-lista"><div className="cabine-caixa cartao parado">
            <RobotSetup identidade={ident} nomeEstrategia={ident.nome} symbols={symbols} symbolInicial="R_75"
              configInicial={config} moeda="USD" isDemo contaId="VRTC1234567" escolherModelo
              onCancelar={nada} onLigar={nada} ligando={false} erro={null} />
          </div></div>
        )}
        {qual === 'catalogo' && <RobotCatalog selected={ident.id} onSelect={nada} />}
      </main>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Laboratorio /></React.StrictMode>)
