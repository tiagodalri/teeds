import { useEffect } from 'react'
import { WorkspaceNav } from '../WorkspaceNav'
import { AccountSwitcher } from '../AccountSwitcher'
import { UserMenu } from '../UserMenu'
import { InicioPanel, type DadosDoInicio } from './InicioPanel'

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

const EXPERIENTE: DadosDoInicio = {
  nome: 'Tiago Dal Ri',
  conta: { conectada: true, demo: true, saldo: 9241.79, moeda: 'USD' },
  hoje: { resultado: 16.7, operacoes: 68, vitorias: 57, derrotas: 11, meta: 25, limite: 15 },
  robos: [
    { id: 'goreme', nome: 'GF Raptor', situacao: 'operando', resultado: 12.4, operacoes: 38, curva: serie(30, 0.45, 0.9) },
    { id: 'falcon', nome: 'GF Falcon', situacao: 'operando', resultado: 6.1, operacoes: 21, curva: serie(30, 0.22, 0.7) },
    { id: 'legacy', nome: 'GF Legacy', situacao: 'aguardando', resultado: -1.8, operacoes: 9, curva: serie(30, -0.07, 0.5) },
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
  robos: [],
  aula: { modulo: 'Módulo 1 · Comece aqui', titulo: 'Introdução à GlobalFly Trade', capa: `${BASE}aulas-globalfly/introducao.webp`, feitas: 0, total: 8 },
  treino: null,
  jornada: { deriv: false, demo: false, gestao: false, primeiraIa: false },
}

export default function LabInicio() {
  const q = new URLSearchParams(location.search)
  const novo = q.get('perfil') === 'novo'
  const d = novo ? NOVO : EXPERIENTE
  useEffect(() => { const t = q.get('tema'); if (t) document.documentElement.dataset.tema = t }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const nada = () => undefined
  return (
    <div className="app workspace-app">
      <WorkspaceNav page="inicio" admin={false} mostrarInicio onNavigate={nada} />
      <header className="topbar">
        <div className="workspace-heading"><strong>Início</strong><span>Sua mesa de operações</span></div>
        <div className="topbar-right">
          {d.conta.conectada && (
            <AccountSwitcher contas={[{ accountId: 'DOT90001234', balance: d.conta.saldo, currency: 'USD', group: 'row', status: 'active', type: 'demo' }]}
              selecionada="DOT90001234" isDemo saldo={d.conta.saldo} moeda="USD" conectando={false} onTrocar={nada} onRecarregar={nada} onSair={nada} />
          )}
          <div className="status status-open"><i /> Conectado</div>
          <UserMenu usuario={{ id: 'lab', email: 'exemplo@globalflytrade.com', nome: d.nome, telefone: null, cpf: null, criadoEm: '', trocarSenha: false }} onSair={nada} onPerfil={nada} />
        </div>
      </header>
      <InicioPanel d={d} aoIr={nada} />
    </div>
  )
}
