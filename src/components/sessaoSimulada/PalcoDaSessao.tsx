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
import { useMenuAdminOculto } from '../../core/menuDeAdmin'
import { publicarSessaoSimulada } from '../../core/teeds/sessaoSimuladaAoVivo'
import { MARCA } from '../../marca'
import { publicSocket } from '../../core/deriv/client'
import { roboLigou, sessaoBateuLimite } from '../../core/som'
import { definirSaldoSimulado, escreverNoLivro, somarAoSaldoSimulado } from '../../core/teeds/modoSimulado'
import { resumoDeEstudo, type DadosEstudo } from '../../core/teeds/estudoDoDono'
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

export function PalcoDaSessao({ roteiro, mostrarMarkup = false, aoEditar, aoSair, daOutraAba = false, grupo }: {
  roteiro: Roteiro
  /**
   * Várias sessões na tela (17/11/2026, Tiago: "simular as 5 e não só uma"). Vazio = a sessão está sozinha e
   * tudo segue como sempre foi. Com outras, o painel desenha uma visão geral só (o resumo sobe por `aoResumo`),
   * a linha tem o número dela e abre e fecha, o saldo do topo só recebe a diferença desta sessão (as I.A. dividem
   * a conta) e os atalhos do teclado ficam desligados (o espaço religaria uma sessão que já terminou).
   */
  grupo?: { numero: string; aberta: boolean; aoAbrir: () => void; aoResumo: (id: string, d: DadosEstudo | null) => void; saldoJaContado: boolean }
  mostrarMarkup?: boolean
  /** A sessão chegou de outra aba (ela é quem está rodando): esta aba não dá o play sozinha, espelha. */
  daOutraAba?: boolean
  aoEditar: () => void
  aoSair: () => void
}) {
  const adminOculto = useMenuAdminOculto()
  const emGrupoRef = useRef(false); emGrupoRef.current = !!grupo
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
  /** Quantas operações a sessão tinha quando foi desligada: a que estava aberta fecha, e ela para. */
  const opsAoDesligar = useRef(0)
  const idSessao = useMemo(() => roteiro.id ?? `simulada:${roteiro.semente}:${Date.now()}`, [roteiro])
  const demo = roteiro.conta === 'demo'

  /*
    Várias abas (16/11/2026, Tiago: "quando abro outra aba da plataforma e vou em I.A., aparece como sessão
    encerrada, quando na verdade a operação simulada ainda está rodando; precisa ficar sincronizado"). Uma
    aba roda a sessão (a dona: a última que mexeu nela) e conta tudo pelo canal do navegador; as outras
    espelham, operação por operação. Mexer em qualquer aba (play, pausa, velocidade, pular, desligar) faz
    dela a dona, a partir do ponto em que a sessão está. A aba que você está olhando assume sozinha (as
    de fundo têm o relógio freado pelo navegador), e se a dona sumir (fechada) outra continua.
  */
  const aba = useRef(Math.random().toString(36).slice(2)).current
  const canal = useRef<BroadcastChannel | null>(null)
  const souDono = useRef(false)
  const donoDesde = useRef(0)
  const [seguindo, setSeguindo] = useState(false)
  const [tocandoLa, setTocandoLa] = useState(false)
  const espelho = useRef<{ ops: number; vistoEm: number } | null>(null)
  const seguindoRef = useRef(false); seguindoRef.current = seguindo
  const tocandoRef = useRef(false); tocandoRef.current = tocando
  const velRef = useRef(1); velRef.current = vel
  const limiteRef = useRef<TipoDeLimite | null>(null); limiteRef.current = limite
  const desligadoRef = useRef(false); desligadoRef.current = desligadoNoRobo

  /*
    O saldo do topo (revisão 16/11/2026): a sessão soma ao saldo só a diferença de cada passo dela. Antes
    gravava o valor inteiro, e uma operação manual simulada feita no meio da sessão sumia no passo seguinte.
    No começo (ou ao voltar à sessão), o saldo vira o da sessão, como antes.
  */
  const saldoPublicado = useRef<number | null>(null)
  // com outras sessões na tela, o saldo do topo já é o da conta: esta só soma o que fizer daqui em diante
  const saldoJaContado = useRef(!!grupo?.saldoJaContado).current
  const publicarSaldo = useCallback((v: number) => {
    if (saldoPublicado.current === null) { if (!saldoJaContado) definirSaldoSimulado(v) }
    else if (v !== saldoPublicado.current) somarAoSaldoSimulado(v - saldoPublicado.current)
    saldoPublicado.current = v
  }, [])

  /** As operações da sessão no relatório do modo simulado (cada aba guarda o dela). */
  const registrar = useCallback((historico: EstadoMotor['historico']) => {
    const agora = Date.now()
    escreverNoLivro(idSessao, historico.map((o) => ({
      quando: new Date(Math.min(o.quando, agora)).toISOString(), origem: 'ia' as const, id: roteiro.ia, nome: nomeDaIa(roteiro.ia), ativo: ATIVO_DOS_ROBOS,
      tipo: o.contractType, entrada: o.valor, pagamento: o.ganhou ? o.payout : 0, resultado: o.lucro, ganhou: o.ganhou,
    })))
  }, [idSessao, roteiro.ia])

  /** A dona conta para as outras abas onde a sessão está. */
  const anunciar = useCallback(() => {
    const e = ensaio.current
    if (!e || !souDono.current || !canal.current || !roteiro.id) return
    try {
      canal.current.postMessage({
        t: 'estado', aba, id: roteiro.id, desde: donoDesde.current, ops: e.operacoes, tocando: tocandoRef.current, vel: velRef.current,
        desligado: desligadoRef.current, fase: e.fase, trecho: e.trecho, limite: limiteRef.current, saldo: e.saldo, foto: e.foto(),
      })
    } catch { /* o navegador sem canal entre abas: cada aba segue a sua */ }
  }, [aba, roteiro.id])
  const anunciarRef = useRef(anunciar); anunciarRef.current = anunciar

  const mostrar = useCallback(() => {
    const e = ensaio.current
    if (!e) return
    setEstado(e.foto())
    setFase(e.fase)
    setTrecho(e.trecho)
    // onde a sessão está, para editar, sair ou recarregar e voltar no mesmo ponto
    if (roteiro.id) guardarPonto({ id: roteiro.id, operacoes: e.operacoes, t0 })
    // o saldo do topo anda com a sessão, e as operações dela vão para o relatório do modo simulado
    publicarSaldo(e.saldo)
    registrar(e.foto().historico)
    anunciar()
  }, [roteiro.id, t0, registrar, anunciar, publicarSaldo])

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
    // 16/11/2026 (Tiago: "quando bate a meta não vejo o cardzinho de meta batida ou do stop"): chegar ao fim
    // pulando, ou voltar para uma sessão que já terminou, também mostra o cartão (o som só toca uma vez)
    let fimNoCaminho: FimDoTrecho['tipo'] | null = null
    const e = ateOperacao > 0
      ? ensaioAte(roteiro, plano, partida, t0, ateOperacao, (f) => { fimNoCaminho = f.tipo })
      : new Ensaio(roteiro, plano, partida, t0)
    e.aoFimDoTrecho = aoFim
    ensaio.current = e
    const parouNoLimite = e.fase !== 'rodando' && (fimNoCaminho === 'meta' || fimNoCaminho === 'stop')
    setLimite(parouNoLimite ? fimNoCaminho : null)
    mostrar()
  }, [partida, roteiro, plano, aoFim, mostrar])

  /** Esta aba passa a ser a dona, do ponto em que a sessão está (se espelhava, remonta ali). */
  const assumir = useCallback(() => {
    const estava = seguindoRef.current ? espelho.current : null
    souDono.current = true
    donoDesde.current = Date.now()
    if (seguindoRef.current) {
      seguindoRef.current = false
      setSeguindo(false); setTocandoLa(false)
      if (estava) montar(estava.ops)
    }
  }, [montar])
  const assumirRef = useRef(assumir); assumirRef.current = assumir

  // o canal entre as abas
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined' || !roteiro.id) return
    const c = new BroadcastChannel(`${MARCA.id}.simulacao.palco`)
    canal.current = c
    c.onmessage = (ev: MessageEvent) => {
      const m = ev.data
      if (!m || m.aba === aba || m.id !== roteiro.id) return
      if (m.t === 'quem') { anunciarRef.current(); return }
      // a dona segue viva (numa análise longa pode passar muito tempo sem operação nova)
      if (m.t === 'vivo') { if (espelho.current) espelho.current.vistoEm = Date.now(); return }
      // a dona foi fechada: se rodava, esta continua na hora, do ponto em que ela estava
      if (m.t === 'saiu') {
        if (!seguindoRef.current) return
        if (espelho.current) espelho.current.ops = m.ops
        const rodava = tocandoLaRef.current
        assumirRef.current()
        if (rodava) setTocando(true)
        return
      }
      if (m.t !== 'estado') return
      // as duas rodando: fica a que mexeu por último
      if (souDono.current && tocandoRef.current && m.tocando && m.desde < donoDesde.current) return
      souDono.current = false
      seguindoRef.current = true
      setTocando(false)
      espelho.current = { ops: m.ops, vistoEm: Date.now() }
      setSeguindo(true); setTocandoLa(!!m.tocando)
      setEstado(m.foto); setFase(m.fase); setTrecho(m.trecho); setVel(m.vel); setLimite(m.limite ?? null); setDesligadoNoRobo(!!m.desligado)
      // a outra aba já gravou o saldo (ele chega aqui pelo armazenamento): esta só anota onde a sessão está
      saldoPublicado.current = m.saldo
      registrar(m.foto?.historico ?? [])
    }
    // chegou agora: quem está rodando esta sessão?
    try { c.postMessage({ t: 'quem', aba, id: roteiro.id }) } catch { /* sem canal */ }
    return () => { c.close(); canal.current = null }
  }, [roteiro.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // qualquer mudança de play, velocidade, desligado ou cartão da dona vai para as outras abas
  useEffect(() => { anunciar() }, [tocando, vel, desligadoNoRobo, limite]) // eslint-disable-line react-hooks/exhaustive-deps
  // a dona avisa que segue viva enquanto toca, e avisa quando a aba é fechada
  useEffect(() => {
    const vivo = window.setInterval(() => {
      if (!souDono.current || !tocandoRef.current || !canal.current) return
      try { canal.current.postMessage({ t: 'vivo', aba, id: roteiro.id }) } catch { /* sem canal */ }
    }, 2000)
    const saiu = () => {
      const e = ensaio.current
      if (!souDono.current || !canal.current || !e) return
      try { canal.current.postMessage({ t: 'saiu', aba, id: roteiro.id, ops: e.operacoes }) } catch { /* sem canal */ }
    }
    window.addEventListener('pagehide', saiu)
    return () => { window.clearInterval(vivo); window.removeEventListener('pagehide', saiu) }
  }, [aba, roteiro.id])
  // a aba que você está olhando roda a sessão (as de fundo têm o relógio freado); a dona sumiu: esta continua
  useEffect(() => {
    const olhar = () => {
      if (document.hidden || !seguindoRef.current) return
      const estavaTocando = tocandoLaRef.current
      assumirRef.current()
      if (estavaTocando) setTocando(true)
    }
    document.addEventListener('visibilitychange', olhar)
    const vigia = window.setInterval(() => {
      if (!seguindoRef.current || !tocandoLaRef.current || !espelho.current) return
      if (Date.now() - espelho.current.vistoEm > 7000) { assumirRef.current(); setTocando(true) }
    }, 2000)
    return () => { document.removeEventListener('visibilitychange', olhar); window.clearInterval(vigia) }
  }, [])
  const tocandoLaRef = useRef(false); tocandoLaRef.current = tocandoLa

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
    if (daOutraAba) { montar(0); return }
    souDono.current = true
    donoDesde.current = Date.now()
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
      // para quando o contrato aberto fecha (a Raptor compra a próxima no mesmo tick: nunca fica "sem operação")
      if (pararAoLiquidar.current && (!e.foto().emOperacao || e.operacoes > opsAoDesligar.current)) { pararAoLiquidar.current = false; setTocando(false) }
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
      return () => { parar(); clearInterval(vigia); ensaio.current?.pausou() }
    }
    const id = setInterval(() => passo(), (SEGUNDOS_POR_TICK * 1000) / vel)
    return () => clearInterval(id)
  }, [tocando, vel, mostrar])

  const play = useCallback(() => {
    assumir()
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
  }, [montar, mostrar, assumir])
  const pausar = () => { assumir(); setTocando(false) }
  /** Velocidade: se a outra aba estava tocando, esta assume e segue tocando na velocidade nova. */
  const mudarVel = (v: number | ((x: number) => number)) => {
    const tocava = seguindoRef.current && tocandoLaRef.current
    assumir()
    setVel(v)
    if (tocava) setTocando(true)
  }
  const irPara = useCallback((op: number) => { assumir(); setTocando(false); setDesligadoNoRobo(false); pararAoLiquidar.current = false; jaTocou.current = op > 0; montar(Math.max(0, op)) }, [montar, assumir])

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

  // atalhos
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      const alvo = ev.target as HTMLElement | null
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return
      if (document.body.classList.contains('rel-painel-aberto')) return
      if (emGrupoRef.current) return
      const e = ensaio.current
      if (ev.key === ' ') { ev.preventDefault(); tocandoAqui ? pausar() : play() }
      else if (ev.key === 'ArrowRight' && e) { ev.preventDefault(); irPara(e.operacoes + 1) }
      else if (ev.key === 'ArrowLeft' && e) { ev.preventDefault(); irPara(e.operacoes - 1) }
      else if (ev.key === '+' || ev.key === '=' || ev.code === 'NumpadAdd') mudarVel((v) => VELOCIDADES[Math.min(VELOCIDADES.length - 1, VELOCIDADES.indexOf(v) + 1)])
      else if (ev.key === '-' || ev.code === 'NumpadSubtract') mudarVel((v) => VELOCIDADES[Math.max(0, VELOCIDADES.indexOf(v) - 1)])
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [tocando, tocandoLa, seguindo, play, irPara])

  /*
    A mini cabine flutuante (16/11/2026): ao trocar de aba, a sessão simulada aparece nela como uma sessão
    do servidor. O "Parar" de lá desliga a I.A. aqui, como o "Desligar" da cabine.
  */
  const pararPelaMini = useRef<() => void>(() => {})
  const idPublico = idSessao.startsWith('simulada') ? idSessao : `simulada-${idSessao}`
  useEffect(() => {
    if (!estado) return
    const t = roteiro.trechos[Math.min(trecho, roteiro.trechos.length - 1)]
    publicarSessaoSimulada(idPublico, {
      id: idPublico, roboId: roteiro.ia, roboNome: ident.nome, contaId: 'simulada',
      demo, moeda: 'USD', origem: 'navegador', marca: MARCA.id, config: configDoTrecho(roteiro, t), erro: null,
      // desligada: enquanto o contrato aberto fecha, segue "operando" (sem o aviso de fim antes da hora);
      // parada, nenhum contrato pela metade
      estado: desligadoNoRobo && fase === 'rodando'
        ? (seguindo ? tocandoLa : tocando)
          ? { ...estado, aguardando: 'Concluindo o contrato em andamento…' }
          : { ...estado, rodando: false, emOperacao: false, emCurso: null, aguardando: 'Robô desligado', motivoParada: 'Parada por você' }
        : estado,
    })
  }, [estado, trecho, fase, desligadoNoRobo, tocando, tocandoLa, seguindo]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => publicarSessaoSimulada(idPublico, null), [idPublico])
  // o resumo desta sessão para a visão geral única do painel (quando há outras na tela)
  const aoResumoRef = useRef(grupo?.aoResumo); aoResumoRef.current = grupo?.aoResumo
  const numeroDoGrupo = grupo?.numero
  useEffect(() => {
    if (!estado || !numeroDoGrupo) return
    aoResumoRef.current?.(idSessao, resumoDeEstudo(estado, { id: idSessao, nome: ident.nome, cor: ident.cor, numero: numeroDoGrupo, modo: null, demo }))
  }, [estado, numeroDoGrupo, idSessao, ident, demo])
  useEffect(() => () => aoResumoRef.current?.(idSessao, null), [idSessao])
  useEffect(() => {
    const parar = (ev: Event) => {
      const alvo = (ev as CustomEvent<{ id?: string | null }>).detail?.id
      if (alvo && alvo !== idPublico) return
      pararPelaMini.current()
    }
    window.addEventListener('simulado:parar', parar)
    return () => window.removeEventListener('simulado:parar', parar)
  }, [idPublico])

  if (!estado || !partida) {
    const abrindo = <div className="robot-session-loading" role="status"><b>Sessão simulada</b><span>Montando o mercado…</span></div>
    return grupo ? <div className="rob-board-slot">{abrindo}</div> : abrindo
  }

  const cfg = configDoTrecho(roteiro, roteiro.trechos[Math.min(trecho, roteiro.trechos.length - 1)])
  // "Desligar" no robô pausa a sessão onde está; o "Continuar" (ou o play) segue da mesma operação
  pararPelaMini.current = () => desligar()
  const desligar = () => {
    if (seguindoRef.current) { assumir(); setDesligadoNoRobo(true); setTocando(false); return }
    setDesligadoNoRobo(true)
    if (tocando && ensaio.current?.foto().emOperacao) { pararAoLiquidar.current = true; opsAoDesligar.current = ensaio.current.operacoes }
    else setTocando(false)
  }
  // concluindo o contrato aberto, a cabine mostra isso; parado, nenhum contrato pela metade (a I.A.
  // que já comprou a próxima no mesmo tick só a manda quando continuar)
  /** O botão mostra o que a sessão está fazendo, nesta aba ou na outra que roda. */
  const tocandoAqui = seguindo ? tocandoLa : tocando
  const estadoNaCabine: EstadoMotor = desligadoNoRobo && fase === 'rodando'
    ? tocando
      ? { ...estado, rodando: false, motivoParada: null, aguardando: 'Concluindo o contrato em andamento…' }
      : { ...estado, rodando: false, emOperacao: false, emCurso: null, motivoParada: null, aguardando: 'Robô desligado' }
    : estado
  const total = previa.operacoes
  const feitas = estado.operacoes

  const pilula = (
      <div className={`ssim-pilula ${grupo ? 'em-grupo' : ''} ${adminOculto ? 'sem-admin' : ''}`} role="toolbar" aria-label={grupo ? `Controle da sessão simulada ${grupo.numero} (${ident.nome})` : 'Controle da sessão simulada'} aria-hidden={adminOculto || undefined}>
        <button type="button" className="ssim-play" onClick={tocandoAqui ? pausar : play}
          aria-label={tocandoAqui ? 'Pausar' : fase === 'entre' ? 'Religar' : fase === 'fim' ? 'Recomeçar' : 'Começar'}>
          {tocandoAqui ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>
            : fase === 'fim' ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" /></svg>
            : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>}
        </button>
        <span className="ssim-rotulo">
          {grupo && <b className="ssim-quem" style={{ color: ident.cor }}>{grupo.numero} {ident.nome} · </b>}
          {fase === 'entre' && !tocando ? 'Parou. Play para religar' : fase === 'fim' && !tocando ? 'Sessão encerrada' : `Operação ${feitas} de ${total}`}
        </span>
        <span className="ssim-barra" aria-hidden="true"><i style={{ width: `${total ? Math.min(100, (feitas / total) * 100) : 0}%` }} /></span>
        <div className="ssim-vel" role="group" aria-label="Velocidade">
          {VELOCIDADES.map((v) => <button key={v} type="button" className={vel === v ? 'on' : ''} onClick={() => mudarVel(v)}>{v}×</button>)}
        </div>
        <select className="ssim-marcas" aria-label="Pular para" value="" onChange={(ev) => {
          const op = Number(ev.target.value)
          if (!Number.isFinite(op)) return
          irPara(op)
          // o marcador da meta (ou do stop) para um pouco antes: segue tocando até chegar lá e o cartão aparecer
          const m = marcadores.find((x) => x.op === op)
          if (m && /^Bateu/.test(m.rotulo)) play()
        }}>
          <option value="">Pular para…</option>
          {marcadores.map((m) => <option key={`${m.rotulo}-${m.op}`} value={m.op}>{m.rotulo} · op. {m.op}</option>)}
        </select>
        <button type="button" className="ssim-texto" onClick={() => irPara(feitas - 5)} disabled={feitas === 0}>−5 op.</button>
        <button type="button" className="ssim-texto" onClick={aoEditar}>Editar</button>
        <button type="button" className="ssim-texto sair" onClick={() => { setTocando(false); aoSair() }}>Encerrar</button>
        {aviso && <small className="ssim-aviso" role="alert">{aviso}</small>}
      </div>
  )
  const linha = (
    <div className={`rob-board-slot ${!grupo || grupo.aberta ? 'aberta' : ''}`}>
      <CabineDaSessao roteiro={roteiro} estado={estadoNaCabine} trecho={trecho} inicio={t0} mostrarMarkup={mostrarMarkup}
        numero={grupo?.numero} aberta={!grupo || grupo.aberta} onAbrir={grupo?.aoAbrir}
        onDesligar={desligar} onLigarDeNovo={play}>
        {limite && (!grupo || grupo.aberta) && <LimiteAtingido tipo={limite} estado={estado} config={cfg} nome={ident.nome} cor={ident.cor} moeda="USD"
          onFechar={() => setLimite(null)} onLigarDeNovo={fase === 'entre' ? () => { setLimite(null); play() } : undefined} />}
      </CabineDaSessao>
    </div>
  )
  // com outras sessões na tela, o painel é quem desenha a visão geral e o quadro: aqui só a barra e a linha desta
  if (grupo) return <>{pilula}{linha}</>
  return (
    <>
      {!grupo && <RobotOverview sessoes={[]} paineis={[resumoDeEstudo(estado, { id: idSessao, nome: ident.nome, cor: ident.cor, numero: '#1', modo: null, demo })]} moeda="USD" demoDaTela={demo} />}
      {/*
        16/11/2026 (Tiago: "cadê o botão do play na operação, o pause? Estou sentindo falta"): a barra de
        controle fica presa em cima da operação e não some mais sozinha (antes flutuava no rodapé da tela e
        sumia depois de 2,5 s sem mexer o mouse).
      */}
      {/* 16/11/2026 (Tiago): com os itens de admin ocultos (o olhinho), a barra de controle some junto; a sessão segue rodando */}
      {pilula}
      <div className="rob-workspace-board modo-lista ssim-quadro">
        {linha}
      </div>
    </>
  )
}
