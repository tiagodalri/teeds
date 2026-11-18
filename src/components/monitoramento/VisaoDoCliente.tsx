/**
 * A visão do cliente (18/11/2026, Tiago: "toda reprodução de sessão anterior
 * deve ser como se fosse a visão do próprio cliente, exatamente").
 *
 * Um palco 16:9 com a tela de Robôs que o cliente tinha aberta: o menu
 * lateral, o topo com a hora e o saldo da corretora naquele instante, a
 * visão geral, a linha da sessão e a cabine. São os MESMOS componentes do
 * app do cliente (WorkspaceNav, BalanceLive, RobotOverview, RobotLinha,
 * RobotLive), alimentados pelo replay. Nada ali opera: os botões não têm
 * efeito, o menu e o topo são inertes.
 *
 * O palco tem tamanho fixo de tela de computador (1600 × 900) e é só
 * reduzido para caber: a gravação em MP4 recorta exatamente este quadro.
 * Rolar dentro dele muda o enquadramento (o topo fica fixo, como no app).
 */
import type React from 'react'
import { forwardRef, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { ConfigEstrategia, EstadoMotor } from '../../core/deriv/engine'
import { resumoDeEstudo } from '../../core/teeds/estudoDoDono'
import { MARCA } from '../../marca'
import { PAGE_NAMES, WorkspaceNav } from '../WorkspaceNav'
import { BalanceLive } from '../BalanceLive'
import { RobotOverview } from '../RobotOverview'
import { RobotLinha } from '../RobotResumo'
import { RobotLive } from '../RobotLive'
import { SeloCategoria, type Categoria } from '../SeloCategoria'
import { BotoesDeFerramentas } from '../ferramentas/Ferramentas'
import './visao-do-cliente.css'

export const PALCO_LARGURA = 1600
export const PALCO_ALTURA = 900

const nada = () => {}

function iniciais(nome: string, email: string): string {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean)
  if (partes.length >= 2) return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase()
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase()
  return (email[0] ?? '?').toUpperCase()
}

export interface DadosDaVisao {
  estado: EstadoMotor
  config: ConfigEstrategia
  moeda: string
  demo: boolean
  contaId: string
  /** O saldo da corretora no instante (null: ainda sem leitura). */
  saldo: number | null
  /** A hora original do instante, para o relógio do topo. */
  instante: number
  /** Quando a sessão começou (o "há quanto tempo" da linha). */
  inicio: number | null
  roboId: string
  roboNome: string
  cor: string
  corSuave: string
  ativo: string
  regra: string
  ganhaCom: (d: number) => boolean
  parametros: Array<{ rot: string; valor: string }>
  modo: string | null
  cliente: { nome: string; email: string; categoria: Categoria | null }
  mostrarMarkup?: boolean
}

/** A tela do cliente em tamanho real (1600 × 900). Quem chama decide a escala. */
export const TelaDoCliente = forwardRef<HTMLDivElement, { d: DadosDaVisao; /** Guarda a rolagem escolhida: o palco que remonta (ao gravar) volta no mesmo enquadramento. */ rolagem?: { current: number | null } }>(function TelaDoCliente({ d, rolagem }, ref) {
  const rolo = useRef<HTMLDivElement>(null)
  const linha = useRef<HTMLDivElement>(null)
  // Enquadramento inicial: a linha da sessão logo abaixo do topo, como quem está acompanhando o robô.
  useLayoutEffect(() => {
    if (!rolo.current || !linha.current) return
    rolo.current.scrollTop = rolagem?.current ?? Math.max(0, linha.current.offsetTop - 18)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const est = d.estado
  const rodando = est.rodando
  const painel = resumoDeEstudo(est, { id: 'replay', nome: d.roboNome, cor: d.cor, numero: '#1', modo: d.modo, demo: d.demo })
  const data = new Date(d.instante)
  return (
    <div ref={ref} className="vc-tela app workspace-app" style={{ width: PALCO_LARGURA, height: PALCO_ALTURA }}>
      <div className="vc-menu" {...{ inert: '' }}>
        <WorkspaceNav page="robos" admin={false} onNavigate={nada} mostrarInicio={!!MARCA.inicio} mostrarAoVivo={!!MARCA.aoVivo} mostrarAssistente={false} />
      </div>
      <header className="topbar" {...{ inert: '' }}>
        <div className="workspace-heading"><strong>{PAGE_NAMES.robos}</strong><span>Estratégias e acompanhamento</span></div>
        <div className="topbar-right">
          <div className="relogio-topo" aria-hidden="true">
            <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.3 1.4" /></svg>
            <span className="relogio-data">{data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            <span className="relogio-hora">{data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}</span>
          </div>
          <div className="conta">
            <button className={`conta-chip ${d.demo ? 'demo' : 'real'}`} tabIndex={-1}>
              <span className={`selo ${d.demo ? 'demo' : 'real'}`}>{d.demo ? 'Demo' : 'Real'}</span>
              <BalanceLive valor={d.saldo} moeda={d.moeda} conectando={false} />
              <svg className="conta-seta" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
          {MARCA.id === 'globalfly' && <BotoesDeFerramentas />}
          <button className="tema-btn" tabIndex={-1} aria-hidden="true">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
          </button>
          <div className={`status status-open${MARCA.aoVivo ? ' so-bolinha' : ''}`}><i /> {!MARCA.aoVivo && 'Conectado'}</div>
          {MARCA.seloCategoria && d.cliente.categoria && <SeloCategoria categoria={d.cliente.categoria} />}
          <div className="conta">
            <button className="avatar-botao" tabIndex={-1}>
              <span className="avatar">{iniciais(d.cliente.nome, d.cliente.email)}</span>
              <svg className="conta-seta" viewBox="0 0 12 12" width="11" height="11" aria-hidden="true"><path d="M2.5 4.5 L6 8 L9.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>
        </div>
      </header>
      <div className="vc-rolo" ref={rolo} onScroll={(e) => { if (rolagem) rolagem.current = e.currentTarget.scrollTop }}>
        <div className="ger rob robot-workspace tem-acompanhamento">
          <div className="ger-topo rob-workspace-header">
            <div>
              <span className="rob-eyebrow">CENTRAL DE ROBÔS</span>
              <h2>Suas sessões</h2>
              <p className="ger-sub">Acompanhe cada sessão. Abra os detalhes quando precisar.</p>
            </div>
          </div>
          <RobotOverview sessoes={[]} paineis={[painel]} moeda={d.moeda} demoDaTela={d.demo} />
          <div className="rob-workspace-board modo-lista">
            <div ref={linha} className={`cabine-caixa aberta ${rodando ? 'rodando' : 'parado'}`} style={{ ['--robo' as string]: d.cor, ['--robo-suave' as string]: d.corSuave }}>
              <RobotLinha estado={est} config={d.config} moeda={d.moeda} nome={d.roboNome} cor={d.cor} numero="#1" inicio={d.inicio} demo={d.demo}
                modo={d.modo} conexao="open" ceo={d.mostrarMarkup} onDesligar={rodando ? nada : undefined} onLigarDeNovo={!rodando ? nada : undefined} aberta />
              <RobotLive estado={est} config={d.config} moeda={d.moeda} contaDaSessao={{ contaId: d.contaId, demo: d.demo, moeda: d.moeda }}
                estrategiaId={d.roboId} nomeEstrategia={d.roboNome} ativo={d.ativo} titulo="#1" regra={d.regra} cor={d.cor} ganhaCom={d.ganhaCom}
                parametros={d.parametros} conexao="open" mostrarMarkup={d.mostrarMarkup} onDesligar={rodando ? nada : undefined} onLigarDeNovo={!rodando ? nada : undefined} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

/** O palco: a tela do cliente reduzida para caber na largura (ou na caixa) disponível, sem distorcer. */
export function PalcoDoCliente({ children, alturaMaxima, className = '', refMoldura }: { children: ReactNode; alturaMaxima?: number; className?: string; /** O quadro visível: é ele que a gravação recorta. */ refMoldura?: React.Ref<HTMLDivElement> }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [escala, setEscala] = useState(0.5)
  useEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => {
      const w = el.clientWidth
      const h = alturaMaxima ?? el.clientHeight
      const e = Math.min(w / PALCO_LARGURA, h > 0 ? h / PALCO_ALTURA : Infinity)
      if (e > 0 && Number.isFinite(e)) setEscala(e)
    }
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    window.addEventListener('resize', medir)
    return () => { ro.disconnect(); window.removeEventListener('resize', medir) }
  }, [alturaMaxima])
  return (
    <div ref={caixa} className={`vc-caixa ${className}`}>
      <div ref={refMoldura} className="vc-moldura" style={{ width: PALCO_LARGURA * escala, height: PALCO_ALTURA * escala }}>
        <div className="vc-palco" style={{ width: PALCO_LARGURA, height: PALCO_ALTURA, transform: `scale(${escala})` }}>{children}</div>
      </div>
    </div>
  )
}
