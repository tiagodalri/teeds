/**
 * Sessão simulada (12/11/2026): o palco. A mesma linha (RobotLinha) e a
 * mesma cabine (RobotLive) de uma sessão de verdade, alimentadas pelo motor
 * ensaiado, um preço a cada 2 s (ou mais rápido). O controle fica numa pílula
 * discreta embaixo, que some sozinha enquanto a sessão roda (para gravar) e
 * volta quando o mouse mexe. Atalhos: espaço pausa, ← e → andam uma operação,
 * + e − mudam a velocidade.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EstadoMotor } from '../../core/deriv/engine'
import { identidade } from '../../core/deriv/branding'
import { ATIVO_DOS_ROBOS } from '../../core/deriv/config'
import { fetchTickHistory } from '../../core/deriv/market'
import { publicSocket } from '../../core/deriv/client'
import { roboLigou, sessaoBateuLimite } from '../../core/som'
import { definirSaldoSimulado } from '../../core/teeds/saldoSimulado'
import { useMenuAdminOculto } from '../../core/menuDeAdmin'
import { resumoDeEstudo } from '../../core/teeds/estudoDoDono'
import {
  configDoTrecho, Ensaio, ensaioAte, estrategiaDa, nomeDaIa, previaDoRoteiro, SEGUNDOS_POR_TICK,
  type FimDoTrecho, type PontoDePartida, type Roteiro,
} from '../../core/teeds/sessaoSimulada'
import { RobotLive } from '../RobotLive'
import { RobotLinha } from '../RobotResumo'
import { RobotOverview } from '../RobotOverview'
import { LimiteAtingido, type TipoDeLimite } from '../LimiteAtingido'
import '../relatorios/relatorios.css'
import './sessao-simulada.css'

const VELOCIDADES = [1, 2, 4, 8, 16]
const din = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** O último preço do ativo das I.A. (cotação pública); sem resposta em 2,5 s, um preço do tamanho certo. */
async function pontoDePartida(): Promise<PontoDePartida> {
  try {
    const ticks = await Promise.race([
      fetchTickHistory(ATIVO_DOS_ROBOS, 1, publicSocket),
      new Promise<never>((_, nao) => setTimeout(() => nao(new Error('sem cotação')), 2500)),
    ])
    const t = ticks[ticks.length - 1]
    if (t && Number.isFinite(t.quote) && t.quote > 0) return { preco: t.quote, casas: t.pipSize || 4 }
  } catch { /* segue com o preço padrão */ }
  return { preco: 61234.5678, casas: 4 }
}

interface Marcador { rotulo: string; op: number }

export function PalcoDaSessao({ roteiro, mostrarMarkup = false, aoEditar, aoSair }: {
  roteiro: Roteiro
  mostrarMarkup?: boolean
  aoEditar: () => void
  aoSair: () => void
}) {
  const adminOculto = useMenuAdminOculto()
  const previa = useMemo(() => previaDoRoteiro(roteiro), [roteiro])
  const plano = previa.resultados
  const ident = useMemo(() => {
    const base = identidade(roteiro.ia)
    return { ...base, nome: nomeDaIa(roteiro.ia) }
  }, [roteiro.ia])
  const [partida, setPartida] = useState<PontoDePartida | null>(null)
  const t0 = useRef(Math.floor(Date.now() / 1000) * 1000)
  const ensaio = useRef<Ensaio | null>(null)
  const [estado, setEstado] = useState<EstadoMotor | null>(null)
  const [tocando, setTocando] = useState(false)
  const [vel, setVel] = useState(1)
  const [limite, setLimite] = useState<TipoDeLimite | null>(null)
  const [fase, setFase] = useState<'rodando' | 'entre' | 'fim'>('rodando')
  const [trecho, setTrecho] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  const idSessao = useMemo(() => `simulada:${roteiro.semente}:${Date.now()}`, [roteiro])
  const demo = roteiro.conta === 'demo'

  const mostrar = useCallback(() => {
    const e = ensaio.current
    if (!e) return
    setEstado(e.foto())
    setFase(e.fase)
    setTrecho(e.trecho)
    definirSaldoSimulado({ valor: e.saldo, demo })
  }, [demo])

  /** O fim de cada trecho: pausa ali e, se foi meta ou stop, o aviso e o som de verdade. */
  const aoFim = useCallback((f: FimDoTrecho, k: number) => {
    setTocando(false)
    if (f.tipo === 'meta' || f.tipo === 'stop') {
      setLimite(f.tipo)
      sessaoBateuLimite(`${idSessao}:${k}`, f.tipo)
    }
  }, [idSessao])

  const montar = useCallback((ateOperacao: number) => {
    if (!partida) return
    const e = ateOperacao > 0 ? ensaioAte(roteiro, plano, partida, t0.current, ateOperacao) : new Ensaio(roteiro, plano, partida, t0.current)
    e.aoFimDoTrecho = aoFim
    ensaio.current = e
    setLimite(null)
    mostrar()
  }, [partida, roteiro, plano, aoFim, mostrar])

  useEffect(() => { let vivo = true; void pontoDePartida().then((p) => { if (vivo) setPartida(p) }); return () => { vivo = false } }, [])
  useEffect(() => { setTocando(false); montar(0) }, [montar])
  useEffect(() => () => definirSaldoSimulado(null), [])

  // o relógio: um preço a cada 2 s, dividido pela velocidade
  useEffect(() => {
    if (!tocando) return
    const id = setInterval(() => {
      const e = ensaio.current
      if (!e) return
      if (e.fase !== 'rodando') { setTocando(false); return }
      e.passo()
      mostrar()
    }, (SEGUNDOS_POR_TICK * 1000) / vel)
    return () => clearInterval(id)
  }, [tocando, vel, mostrar])

  const jaTocou = useRef(false)
  const play = useCallback(() => {
    const e = ensaio.current
    if (!e) return
    setAviso(null)
    if (e.fase === 'fim') { jaTocou.current = false; montar(0) }
    else if (e.fase === 'entre') {
      const recusa = e.religar()
      if (recusa) { setAviso(recusa); return }
      setLimite(null)
      roboLigou()
      mostrar()
    } else if (!jaTocou.current) roboLigou()
    jaTocou.current = true
    setTocando(true)
  }, [montar, mostrar])
  const pausar = () => setTocando(false)
  const irPara = useCallback((op: number) => { setTocando(false); jaTocou.current = op > 0; montar(Math.max(0, op)) }, [montar])

  // os marcadores: começo, a maior sequência, a meta/stop de cada trecho, o religou
  const marcadores: Marcador[] = useMemo(() => {
    const m: Marcador[] = [{ rotulo: 'Começo', op: 0 }]
    const ops = previa.corrida.ops
    if (previa.maiorSequencia.n > 1) m.push({ rotulo: `${previa.maiorSequencia.n} perdas seguidas`, op: previa.maiorSequencia.desde })
    let conta = 0
    previa.corrida.trechos.forEach((t, k) => {
      conta += t.operacoes
      const nome = t.tipo === 'meta' ? 'Bateu a meta' : t.tipo === 'stop' ? 'Bateu o stop' : t.tipo === 'saldo' ? 'Sem saldo' : 'Desligou'
      // um pouco antes do fim, para mostrar a chegada
      m.push({ rotulo: nome, op: Math.max(0, conta - 3) })
      if (k + 1 < previa.corrida.trechos.length) m.push({ rotulo: 'Religou', op: conta })
    })
    return m.sort((a, b) => a.op - b.op)
  }, [previa])

  // a pílula some sozinha enquanto roda; o mouse mexeu, ela volta
  const [pilulaVisivel, setPilulaVisivel] = useState(true)
  useEffect(() => {
    if (!tocando) { setPilulaVisivel(true); return }
    let t = setTimeout(() => setPilulaVisivel(false), 2500)
    const mexeu = () => { setPilulaVisivel(true); clearTimeout(t); t = setTimeout(() => setPilulaVisivel(false), 2500) }
    window.addEventListener('mousemove', mexeu)
    window.addEventListener('touchstart', mexeu)
    return () => { clearTimeout(t); window.removeEventListener('mousemove', mexeu); window.removeEventListener('touchstart', mexeu) }
  }, [tocando])

  // atalhos
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return
      if (document.body.classList.contains('rel-painel-aberto')) return
      const e = ensaio.current
      if (ev.key === ' ') { ev.preventDefault(); tocando ? pausar() : play() }
      else if (ev.key === 'ArrowRight' && e) { ev.preventDefault(); irPara(e.operacoes + 1) }
      else if (ev.key === 'ArrowLeft' && e) { ev.preventDefault(); irPara(e.operacoes - 1) }
      else if (ev.key === '+' || ev.key === '=' || ev.code === 'NumpadAdd') setVel((v) => VELOCIDADES[Math.min(VELOCIDADES.length - 1, VELOCIDADES.indexOf(v) + 1)])
      else if (ev.key === '-' || ev.code === 'NumpadSubtract') setVel((v) => VELOCIDADES[Math.max(0, VELOCIDADES.indexOf(v) - 1)])
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [tocando, play, irPara])

  if (!estado || !partida) return <div className="robot-session-loading" role="status"><b>Sessão simulada</b><span>Montando o mercado…</span></div>

  const t = roteiro.trechos[Math.min(trecho, roteiro.trechos.length - 1)]
  const cfg = configDoTrecho(roteiro, t)
  const est = estrategiaDa(roteiro.ia)
  const emCurso = estado.emCurso
  const ultima = estado.historico[0]
  const tipoAgora = emCurso?.contractType ?? ultima?.contractType ?? est.contractType
  const b = emCurso?.barreira ?? ultima?.barreira ?? est.barreira ?? 5
  const regra = ({ DIGITOVER: `maior que ${b}`, DIGITUNDER: `menor que ${b}`, DIGITMATCH: `igual a ${b}`, DIGITDIFF: `diferente de ${b}`, DIGITEVEN: 'par', DIGITODD: 'ímpar' } as Record<string, string>)[tipoAgora] ?? tipoAgora
  const ganhaCom = (d: number) => tipoAgora === 'DIGITOVER' ? d > b : tipoAgora === 'DIGITUNDER' ? d < b : tipoAgora === 'DIGITMATCH' ? d === b : tipoAgora === 'DIGITDIFF' ? d !== b : tipoAgora === 'DIGITEVEN' ? d % 2 === 0 : tipoAgora === 'DIGITODD' ? d % 2 === 1 : false
  const parametros = [
    { rot: 'Ativo', valor: 'Volatility 75' },
    { rot: 'Entrada', valor: din(cfg.valorAoVencer) },
    { rot: 'Recuperação', valor: cfg.fatorGale === 0 ? 'Desligada' : 'Automática' },
    { rot: 'Valor máximo por entrada', valor: 'Sem máximo' },
    { rot: 'Meta de ganho', valor: cfg.takeProfit > 0 ? din(cfg.takeProfit) : 'Sem meta' },
    { rot: 'Limite de perda', valor: cfg.stopLoss > 0 ? din(cfg.stopLoss) : 'Sem limite' },
  ]
  const rodando = estado.rodando
  const resumo = {
    estado, config: cfg, moeda: 'USD', nome: ident.nome, cor: ident.cor, numero: '#1', inicio: t0.current, demo,
    rotulosTrocados: false, demoComoReal: false, modo: null, conexao: 'open', ceo: mostrarMarkup,
    onDesligar: rodando ? () => { ensaio.current?.desligar('você desligou'); mostrar() } : undefined, desligando: false,
    onLigarDeNovo: !rodando && fase !== 'fim' ? play : undefined,
  }
  const total = previa.operacoes
  const feitas = estado.operacoes

  return (
    <>
      <RobotOverview sessoes={[]} paineis={[resumoDeEstudo(estado, { id: idSessao, nome: ident.nome, cor: ident.cor, numero: '#1', modo: null, demo })]} moeda="USD" demoDaTela={demo} />
      <div className="rob-workspace-board modo-lista ssim-quadro">
        <div className="rob-board-slot aberta">
          <div className={`cabine-caixa aberta ssim-cabine ${rodando ? 'rodando' : 'parado'}`} style={{ ['--robo' as string]: ident.cor, ['--robo-suave' as string]: ident.corSuave }}>
            {!adminOculto && <span className="rsim-tag rsim-tag-canto ssim-tag"><i aria-hidden="true" />Sessão simulada</span>}
            <RobotLinha {...resumo} aberta />
            <RobotLive
              estado={estado} config={cfg} moeda="USD" contaDaSessao={{ contaId: 'simulada', demo, moeda: 'USD' }}
              estrategiaId={roteiro.ia} nomeEstrategia={ident.nome} ativo="Volatility 75" titulo="#1" regra={regra} cor={ident.cor}
              ganhaCom={ganhaCom} parametros={parametros} conexao="open" mostrarMarkup={mostrarMarkup} esconderDemo={false}
              onDesligar={resumo.onDesligar} onLigarDeNovo={resumo.onLigarDeNovo} />
            {limite && <LimiteAtingido tipo={limite} estado={estado} config={cfg} nome={ident.nome} cor={ident.cor} moeda="USD"
              onFechar={() => setLimite(null)} onLigarDeNovo={fase === 'entre' ? () => { setLimite(null); play() } : undefined} />}
          </div>
        </div>
      </div>

      <div className={`ssim-pilula ${pilulaVisivel ? '' : 'escondida'}`} role="toolbar" aria-label="Controle da sessão simulada"
        onMouseEnter={() => setPilulaVisivel(true)}>
        <button type="button" className="ssim-play" onClick={tocando ? pausar : play}
          aria-label={tocando ? 'Pausar' : fase === 'entre' ? 'Religar' : fase === 'fim' ? 'Recomeçar' : 'Começar'}>
          {tocando ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
            : fase === 'fim' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>}
        </button>
        <span className="ssim-rotulo">
          {fase === 'entre' && !tocando ? 'Parou. Play para religar' : fase === 'fim' && !tocando ? 'Sessão encerrada' : `Operação ${feitas} de ${total}`}
        </span>
        <span className="ssim-barra" aria-hidden="true"><i style={{ width: `${total ? Math.min(100, (feitas / total) * 100) : 0}%` }} /></span>
        <div className="ssim-vel" role="group" aria-label="Velocidade">
          {VELOCIDADES.map((v) => <button key={v} type="button" className={vel === v ? 'on' : ''} onClick={() => setVel(v)}>{v}×</button>)}
        </div>
        <select className="ssim-marcas" aria-label="Pular para" value="" onChange={(ev) => { const op = Number(ev.target.value); if (Number.isFinite(op)) irPara(op) }}>
          <option value="">Pular para…</option>
          {marcadores.map((m) => <option key={`${m.rotulo}-${m.op}`} value={m.op}>{m.rotulo} · op. {m.op}</option>)}
        </select>
        <button type="button" className="ssim-texto" onClick={() => irPara(feitas - 5)} disabled={feitas === 0}>−5 op.</button>
        <button type="button" className="ssim-texto" onClick={aoEditar}>Editar</button>
        <button type="button" className="ssim-texto sair" onClick={aoSair}>Sair</button>
        {aviso && <small className="ssim-aviso" role="alert">{aviso}</small>}
      </div>
    </>
  )
}
