import { useEffect, useState } from 'react'
import { SeloCategoria, type Categoria } from '../SeloCategoria'
import { WorkspaceNav } from '../WorkspaceNav'
import { AccountSwitcher } from '../AccountSwitcher'
import { UserMenu } from '../UserMenu'
import { InicioPanel, type DadosDoInicio } from './InicioPanel'
import { InicioPagina } from './InicioPagina'
import { TourGuiado, passosDoTour } from '../tour/TourGuiado'
import { BarraInferior } from '../barra/BarraInferior'
import { RelogioTopo } from '../RelogioTopo'

/**
 * ?tela=inicio&perfil=experiente|novo&tema=escuro|claro — a home dentro da
 * casca de verdade (menu, topo com saldo, usuário), com dados de EXEMPLO,
 * para o Tiago aprovar o layout antes de ir ao ar.
 */
const BASE = import.meta.env.BASE_URL
const serie = (n: number, tendencia: number, ruido: number) => {
  let v = 0
  return Array.from({ length: n }, (_, i) => (v += tendencia + Math.sin(i * 1.7) * ruido + Math.cos(i * 0.6) * ruido * 0.6))
}

export const EXPERIENTE: DadosDoInicio = {
  nome: 'Tiago Dal Ri',
  conta: { conectada: true, demo: true, saldo: 9241.79, moeda: 'USD' },
  hoje: { resultado: 16.7, operacoes: 68, vitorias: 57, derrotas: 11 },
  plano: { meta: 25, limite: 15 },
  frota: [
    { id: 'goreme', nome: 'GF Raptor', chamada: 'O que troca de lado', noAr: true, operando: true, resultado: 4.3, analise: null },
    { id: 'falcon', nome: 'GF Falcon', chamada: 'A porta baixa', noAr: false, operando: false, resultado: 0, analise: null },
    { id: 'legacy', nome: 'GF Legacy', chamada: 'A porta alta', noAr: false, operando: false, resultado: 0, analise: null },
    { id: 'superior5', nome: 'GF Gulf', chamada: 'O analista dos altos', noAr: true, operando: false, resultado: 12.4, analise: { n: 3, alvo: 5 } },
    { id: 'ag2', nome: 'GF Phenom', chamada: 'O espelho', noAr: false, operando: false, resultado: 0, analise: null },
  ],
  cotacoes: [
    { id: 'dolar', nome: 'Dólar', valor: 'R$ 5,4210', variacao: 0.31, serie: serie(24, 0.2, 0.6) },
    { id: 'ibov', nome: 'Ibovespa', valor: '131.284', variacao: -0.42, serie: serie(24, -0.25, 0.7) },
    { id: 'sp500', nome: 'S&P 500', valor: '5.812,40', variacao: 0.18, serie: serie(24, 0.12, 0.5) },
    { id: 'btc', nome: 'Bitcoin', valor: 'US$ 67.240', variacao: 1.92, serie: serie(24, 0.6, 0.9) },
  ],
  // manchetes de EXEMPLO (na tela de verdade vêm da aba Notícias)
  manchetes: [
    { fonte: 'InfoMoney', quando: 'há 12 min', titulo: 'Dólar abre em alta com investidores atentos aos juros nos Estados Unidos' },
    { fonte: 'Valor', quando: 'há 38 min', titulo: 'Ibovespa recua puxado por bancos; mercado aguarda dados de inflação' },
    { fonte: 'CoinDesk', quando: 'há 1 h', titulo: 'Bitcoin volta a superar os US$ 67 mil com entrada de fundos' },
  ],
  aula: { modulo: 'Módulo 2 · Estratégias de I.A. na prática', titulo: 'Como funciona a estratégia FALCON?', capa: `${BASE}aulas-globalfly/robo-falcon.webp`, feitas: 3, total: 8 },
  treino: { noAr: true, apresentador: 'Victor' },
  jornada: { deriv: true, demo: true, gestao: true, primeiraIa: true },
}

const NOVO: DadosDoInicio = {
  ...EXPERIENTE,
  nome: 'Lucas Andrade',
  conta: { conectada: false, demo: true, saldo: 0, moeda: 'USD' },
  hoje: null,
  plano: null,
  frota: EXPERIENTE.frota.map((r) => ({ ...r, noAr: false, operando: false, resultado: 0, analise: null })),
  aula: { modulo: 'Módulo 1 · Comece aqui', titulo: 'Introdução à GlobalFly Trade', capa: `${BASE}aulas-globalfly/introducao.webp`, feitas: 0, total: 8 },
  treino: null,
  jornada: { deriv: false, demo: false, gestao: false, primeiraIa: false },
}

export default function LabInicio() {
  const q = new URLSearchParams(location.search)
  const novo = q.get('perfil') === 'novo'
  // &plano=0: sem plano (o instrumento vira o formulário); &resultado=N: o resultado de hoje
  const base = novo ? NOVO : EXPERIENTE
  const [plano, setPlano] = useState(q.get('plano') === '0' ? null : base.plano)
  const resultado = q.get('resultado')
  const d: DadosDoInicio = { ...base, plano, ...(resultado !== null && base.hoje ? { hoje: { ...base.hoje, resultado: Number(resultado) } } : {}),
    ...(q.get('ia') === '0' ? { frota: NOVO.frota } : {}) }
  useEffect(() => { const t = q.get('tema'); if (t) document.documentElement.dataset.tema = t }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const nada = () => undefined
  return (
    <div className="app workspace-app">
      <WorkspaceNav page="inicio" admin={false} mostrarInicio onNavigate={nada} />
      <header className="topbar">
        <div className="workspace-heading"><strong>Início</strong><span>Sua mesa de operações</span></div>
        <div className="topbar-right">
          <RelogioTopo />
          {d.conta.conectada && (
            <AccountSwitcher contas={[{ accountId: 'DOT90001234', balance: d.conta.saldo ?? 0, currency: 'USD', group: 'row', status: 'active', type: 'demo' }]}
              selecionada="DOT90001234" isDemo saldo={d.conta.saldo} moeda="USD" conectando={false} onTrocar={nada} onRecarregar={nada} onSair={nada} />
          )}
          <div className="status status-open"><i /> Conectado</div>
          {/* &categoria=gold|silver: o selo do topo (GlobalFly) */}
          {(q.get('categoria') === 'gold' || q.get('categoria') === 'silver') && <SeloCategoria categoria={q.get('categoria') as Categoria} />}
          <UserMenu usuario={{ id: 'lab', email: 'exemplo@globalflytrade.com', nome: d.nome, telefone: null, cpf: null, criadoEm: '', trocarSenha: false }} onSair={nada} onPerfil={nada} />
        </div>
      </header>
      {/* &real=1: o componente de verdade (mercado ao vivo, aula seguinte, jornada), sem conta */}
      {q.has('real')
        ? <InicioPagina sessao={null} nome="Tiago Dal Ri" conta={{ conectada: false, demo: true, saldo: null, moeda: 'USD' }} treino={null} aoIr={nada} />
        : <InicioPanel d={d} aoIr={nada} aoSalvarPlano={(meta, limite) => setPlano({ meta, limite })} aoPrepararRobo={nada} />}
      <BarraInferior tela="inicio" irPara={nada} />
      {/* &tour=1[&passo=N]: o tour guiado por cima da home (os passos de outras telas ficam no centro) */}
      {q.has('tour') && <TourGuiado passos={passosDoTour({ nome: d.nome, treino: true })} obrigatorio={q.get('tour') !== 'rever'}
        telaAtual="inicio" irPara={nada} aoTerminar={nada} aoFechar={nada} />}
    </div>
  )
}
