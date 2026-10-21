import { useEffect, useState } from 'react'
import { WorkspaceNav } from '../WorkspaceNav'
import { UserMenu } from '../UserMenu'
import { AccountSwitcher } from '../AccountSwitcher'
import { InicioPanel } from '../inicio/InicioPanel'
import { EXPERIENTE } from '../inicio/LabInicio'
import { BarraInferior } from '../barra/BarraInferior'
import { MiniCabine } from './MiniCabine'
import type { SessaoViva } from '../../core/teeds/servidorRobos'

/**
 * ?tela=minicabine&tema=escuro|claro[&app=1][&aberta=1] — a mini-cabine
 * por cima da home, com duas I.A.s SIMULADAS operando sozinhas (uma entrada
 * a cada 2 a 3 s). O Falcon começa perto da meta: em poucos segundos aparece
 * o aviso de meta batida. Nada aqui fala com a Deriv nem com o servidor.
 */
type Op = { n: number; lucro: number }
function sessao(id: string, roboId: string, roboNome: string, meta: number, limite: number, ops: number[]): SessaoViva {
  let soma = 0
  const curva = ops.map((l) => (soma += l))
  const historico = ops.map((lucro, i) => ({ n: i + 1, lucro } as Op)).reverse()
  return {
    id, roboId, roboNome, contaId: 'VRTC9001234', demo: true, moeda: 'USD', origem: 'navegador', erro: null,
    config: { valorInicial: 0.35, valorAoVencer: 0.35, fatorGale: 2, galeApos: 1, valorMaximo: 50, takeProfit: meta, stopLoss: limite, maxOperacoes: 0 },
    estado: {
      rodando: true, emOperacao: false, operacoes: ops.length, vitorias: ops.filter((l) => l >= 0).length, derrotas: ops.filter((l) => l < 0).length,
      perdasSeguidas: 0, resultado: soma, movimentado: 0, valorAtual: 0.35, aguardando: '', motivoParada: null, registros: [], digitos: [], curva,
      condicao: null, ultimoLucro: ops[ops.length - 1] ?? null, historico: historico as never, emCurso: null, ticksAnalisados: 0, latenciaMedia: null, falha: null,
    },
  } as SessaoViva
}

export default function LabMiniCabine() {
  const q = new URLSearchParams(location.search)
  const [sessoes, setSessoes] = useState<SessaoViva[]>(() => [
    sessao('s1', 'goreme', 'GF Raptor', 40, 20, [0.33, 0.33, -0.35, 0.68, 0.33, 0.33, 0.33, -0.35, 0.68, 0.33]),
    sessao('s2', 'falcon', 'GF Falcon', 3, 6, [0.31, 0.31, 0.31, -0.35, 0.62, 0.31, 0.31, 0.31, 0.31]),
  ])
  useEffect(() => { const t = q.get('tema'); if (t) document.documentElement.dataset.tema = t; if (q.has('aberta')) try { localStorage.setItem('globalfly.miniCabine.aberta', '1') } catch { /* lab */ } }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // o "servidor" de mentira: uma entrada nova a cada 2 a 3 segundos
  useEffect(() => {
    let vivo = true
    let t = 0
    const passo = () => {
      if (!vivo) return
      setSessoes((l) => {
        const ativas = l.filter((s) => s.estado.rodando)
        if (!ativas.length) return l
        const alvo = ativas[Math.floor(Math.random() * ativas.length)]
        return l.map((s) => {
          if (s.id !== alvo.id) return s
          const e = s.estado
          // a entrada em andamento termina; a próxima começa
          if (!e.emOperacao) return { ...s, estado: { ...e, emOperacao: true, emCurso: { valor: 0.35 } as never } }
          const ganhou = Math.random() < 0.82
          const lucro = ganhou ? (s.roboId === 'falcon' ? 0.31 : 0.33) : -0.35
          const resultado = +(e.resultado + lucro).toFixed(2)
          const bateu = resultado >= s.config.takeProfit || resultado <= -s.config.stopLoss
          return {
            ...s, estado: {
              ...e, emOperacao: false, emCurso: null, operacoes: e.operacoes + 1, vitorias: e.vitorias + (ganhou ? 1 : 0), derrotas: e.derrotas + (ganhou ? 0 : 1),
              resultado, ultimoLucro: lucro, curva: [...e.curva, resultado], historico: [{ n: e.operacoes + 1, lucro } as never, ...e.historico],
              rodando: !bateu, motivoParada: bateu ? (resultado >= s.config.takeProfit ? 'Meta atingida' : 'Limite atingido') : null,
            },
          }
        })
      })
      // no laboratório, quem bateu a meta religa depois de uns segundos (a demonstração não acaba)
      setSessoes((l) => l.map((s) => (!s.estado.rodando && Date.now() % 9 === 0
        ? sessao(s.id, s.roboId, s.roboNome, s.config.takeProfit, s.config.stopLoss, [0.31, 0.31, -0.35, 0.62, 0.31])
        : s)))
      t = window.setTimeout(passo, 1000 + Math.random() * 700)
    }
    t = window.setTimeout(passo, 1200)
    return () => { vivo = false; window.clearTimeout(t) }
  }, [])

  const nada = () => undefined
  return (
    <div className="app workspace-app">
      <WorkspaceNav page="inicio" admin={false} mostrarInicio onNavigate={nada} />
      <header className="topbar">
        <div className="workspace-heading"><strong>Início</strong><span>Sua mesa de operações</span></div>
        <div className="topbar-right">
          <AccountSwitcher contas={[{ accountId: 'VRTC9001234', balance: 9241.79, currency: 'USD', group: 'row', status: 'active', type: 'demo' }]}
            selecionada="VRTC9001234" isDemo saldo={9241.79} moeda="USD" conectando={false} onTrocar={nada} onRecarregar={nada} onSair={nada} />
          <UserMenu usuario={{ id: 'lab', email: 'exemplo@globalflytrade.com', nome: 'Tiago Dal Ri', telefone: null, cpf: null, criadoEm: '', trocarSenha: false }} onSair={nada} onPerfil={nada} />
        </div>
      </header>
      <InicioPanel d={{ ...EXPERIENTE, robos: [] }} aoIr={nada} />
      <BarraInferior tela="inicio" irPara={nada} />
      <MiniCabine sessoes={sessoes} aoAbrirCabine={nada} aoParar={(id) => setSessoes((l) => l.map((s) => (s.id === id ? { ...s, estado: { ...s.estado, rodando: false, emOperacao: false, motivoParada: 'Parada por você' } } : s)))} />
    </div>
  )
}
