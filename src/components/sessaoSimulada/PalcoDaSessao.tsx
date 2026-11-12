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
import { fetchTickHistory, subscribeTicks } from '../../core/deriv/market'
import { publicSocket } from '../../core/deriv/client'
import { roboLigou, sessaoBateuLimite } from '../../core/som'
import { definirSaldoSimulado, escreverNoLivro } from '../../core/teeds/modoSimulado'
import { resumoDeEstudo } from '../../core/teeds/estudoDoDono'
import { guardarPonto, lerPontoGuardado } from '../../core/teeds/sessaoGuardada'
import {
  configDoTrecho, Ensaio, ensaioAte, estrategiaDa, nomeDaIa, previaDoRoteiro, SEGUNDOS_POR_TICK,
  type FimDoTrecho, type PontoDePartida, type Roteiro,
} from '../../core/teeds/sessaoSimulada'
import { CabineDaSessao } from './CabineDaSessao'
import { RobotOverview } from '../RobotOverview'
import { LimiteAtingido, type TipoDeLimite } from '../LimiteAtingido'
import '../relatorios/relatorios.css'
import './sessao-simulada.css'

const VELOCIDADES = [1, 2, 4, 8, 16]
const din = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** O último preço do ativo das I.A. (cotação pública); sem resposta em 2,5 s, um preço do tamanho certo. */
export async function pontoDePartida(): Promise<PontoDePartida> {
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
  const previa = useMemo(() => previaDoRoteiro(roteiro), [roteiro])
  const plano = previa.resultados
  const ident = useMemo(() => {
    const base = identidade(roteiro.ia)
    return { ...base, nome: nomeDaIa(roteiro.ia) }
  }, [roteiro.ia])
  const [partida, setPartida] = useState<PontoDePartida | null>(null)
  // a sessão começa agora; acelerada, as horas que passariam do agora entram no relatório como agora.
  // Editar ou recarregar a mesma sessão mantém o começo (o relatório não muda de hora).
  const t0 = useMemo(() => lerPontoGuardado(roteiro.id)?.t0 ?? Math.floor(Date.now() / 1000) * 1000, [roteiro.id])
  const ensaio = useRef<Ensaio | null>(null)
  const [estado, setEstado] = useState<EstadoMotor | null>(null)
  const [tocando, setTocando] = useState(false)
  const [vel, setVel] = useState(1)
  const [limite, setLimite] = useState<TipoDeLimite | null>(null)
  const [fase, setFase] = useState<'rodando' | 'entre' | 'fim'>('rodando')
  const [trecho, setTrecho] = useState(0)
  const [aviso, setAviso] = useState<string | null>(null)
  /** Desligou pelo botão do robô no meio da sessão: é uma pausa, o "Continuar" segue dali. */
  const [desligadoNoRobo, setDesligadoNoRobo] = useState(false)
  // desligou com um contrato aberto: como o motor, conclui o contrato e só então para
  const pararAoLiquidar = useRef(false)
  const idSessao = useMemo(() => roteiro.id ?? `simulada:${roteiro.semente}:${Date.now()}`, [roteiro])
  const demo = roteiro.conta === 'demo'

  const mostrar = useCallback(() => {
    const e = ensaio.current
    if (!e) return
    setEstado(e.foto())
    setFase(e.fase)
    setTrecho(e.trecho)
    // onde a sessão está, para editar, sair ou recarregar e voltar no mesmo ponto
    if (roteiro.id) guardarPonto({ id: roteiro.id, operacoes: e.operacoes, t0 })
    // o saldo do topo anda com a sessão, e as operações dela vão para o relatório do modo simulado
    definirSaldoSimulado(e.saldo)
    const agora = Date.now()
    escreverNoLivro(idSessao, e.foto().historico.map((o) => ({
      quando: new Date(Math.min(o.quando, agora)).toISOString(), origem: 'ia' as const, id: roteiro.ia, nome: nomeDaIa(roteiro.ia), ativo: ATIVO_DOS_ROBOS,
      tipo: o.contractType, entrada: o.valor, pagamento: o.ganhou ? o.payout : 0, resultado: o.lucro, ganhou: o.ganhou,
    })))
  }, [idSessao, roteiro.ia, roteiro.id, t0])

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
    const e = ateOperacao > 0 ? ensaioAte(roteiro, plano, partida, t0, ateOperacao) : new Ensaio(roteiro, plano, partida, t0)
    e.aoFimDoTrecho = aoFim
    ensaio.current = e
    setLimite(null)
    mostrar()
  }, [partida, roteiro, plano, aoFim, mostrar])

  useEffect(() => { let vivo = true; void pontoDePartida().then((p) => { if (vivo) setPartida(p) }); return () => { vivo = false } }, [])
  const jaTocou = useRef(false)
  // "Dar o play" já liga: a sessão começa rodando, com o som do play, como a de verdade
  // Editou a sessão, saiu da aba ou recarregou: volta na mesma operação, parada (o play segue dali).
  useEffect(() => {
    if (!partida) return
    const atual = ensaio.current
    const onde = atual && atual.r.id === roteiro.id ? atual.operacoes : lerPontoGuardado(roteiro.id)?.operacoes ?? 0
    const ate = Math.max(0, Math.min(onde, previa.operacoes))
    setDesligadoNoRobo(false)
    pararAoLiquidar.current = false
    if (ate > 0) {
      setTocando(false)
      jaTocou.current = true
      montar(ate)
      // volta com o robô desligado: o "Continuar" da cabine (ou o play) segue dali
      setDesligadoNoRobo(true)
      return
    }
    montar(0)
    roboLigou()
    jaTocou.current = true
    setTocando(true)
  }, [montar]) // eslint-disable-line react-hooks/exhaustive-deps
  // editar a sessão mantém o id: as operações dela no relatório são reescritas (a anterior "não aconteceu")

  /*
    O relógio. Em 1× a sessão anda no compasso do ativo de verdade: cada tick público do R_75
    (o mesmo horário e o mesmo preço da Deriv) é um passo do motor. Se o preço real parar de
    chegar por 5 s, segue no mesmo ritmo com o passeio. Acelerada, um passo a cada 2 s ÷ velocidade.
  */
  useEffect(() => {
    if (!tocando) return
    const passo = (real?: { preco: number; epoch: number }) => {
      const e = ensaio.current
      if (!e) return
      if (e.fase !== 'rodando') { setTocando(false); return }
      e.passo(real)
      mostrar()
      if (pararAoLiquidar.current && !e.foto().emOperacao) { pararAoLiquidar.current = false; setTocando(false) }
    }
    if (vel === 1) {
      let ultimoReal = Date.now()
      let ultimoEpoch = 0
      const parar = subscribeTicks(ATIVO_DOS_ROBOS, (t) => {
        if (!t.epoch || t.epoch === ultimoEpoch || Date.now() - t.epoch * 1000 > 20000) return
        ultimoEpoch = t.epoch
        ultimoReal = Date.now()
        passo({ preco: t.quote, epoch: t.epoch })
      }, publicSocket)
      const vigia = setInterval(() => { if (Date.now() - ultimoReal >= 5000) passo() }, SEGUNDOS_POR_TICK * 1000)
      return () => { parar(); clearInterval(vigia) }
    }
    const id = setInterval(() => passo(), (SEGUNDOS_POR_TICK * 1000) / vel)
    return () => clearInterval(id)
  }, [tocando, vel, mostrar])

  const play = useCallback(() => {
    const e = ensaio.current
    if (!e) return
    setAviso(null)
    setDesligadoNoRobo(false)
    pararAoLiquidar.current = false
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
  const irPara = useCallback((op: number) => { setTocando(false); setDesligadoNoRobo(false); pararAoLiquidar.current = false; jaTocou.current = op > 0; montar(Math.max(0, op)) }, [montar])

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

  const cfg = configDoTrecho(roteiro, roteiro.trechos[Math.min(trecho, roteiro.trechos.length - 1)])
  // "Desligar" no robô pausa a sessão onde está; o "Continuar" (ou o play) segue da mesma operação
  const desligar = () => {
    setDesligadoNoRobo(true)
    if (tocando && ensaio.current?.foto().emOperacao) pararAoLiquidar.current = true
    else setTocando(false)
  }
  // concluindo o contrato aberto, a cabine mostra isso; parado, nenhum contrato pela metade (a I.A.
  // que já comprou a próxima no mesmo tick só a manda quando continuar)
  const estadoNaCabine: EstadoMotor = desligadoNoRobo && fase === 'rodando'
    ? tocando
      ? { ...estado, rodando: false, motivoParada: null, aguardando: 'Concluindo o contrato em andamento…' }
      : { ...estado, rodando: false, emOperacao: false, emCurso: null, motivoParada: null, aguardando: 'Robô desligado' }
    : estado
  const total = previa.operacoes
  const feitas = estado.operacoes

  return (
    <>
      <RobotOverview sessoes={[]} paineis={[resumoDeEstudo(estado, { id: idSessao, nome: ident.nome, cor: ident.cor, numero: '#1', modo: null, demo })]} moeda="USD" demoDaTela={demo} />
      <div className="rob-workspace-board modo-lista ssim-quadro">
        <div className="rob-board-slot aberta">
          <CabineDaSessao roteiro={roteiro} estado={estadoNaCabine} trecho={trecho} inicio={t0} mostrarMarkup={mostrarMarkup}
            onDesligar={desligar} onLigarDeNovo={fase !== 'fim' ? play : undefined}>
            {limite && <LimiteAtingido tipo={limite} estado={estado} config={cfg} nome={ident.nome} cor={ident.cor} moeda="USD"
              onFechar={() => setLimite(null)} onLigarDeNovo={fase === 'entre' ? () => { setLimite(null); play() } : undefined} />}
          </CabineDaSessao>
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
        <button type="button" className="ssim-texto sair" onClick={() => { setTocando(false); aoSair() }}>Encerrar</button>
        {aviso && <small className="ssim-aviso" role="alert">{aviso}</small>}
      </div>
    </>
  )
}
