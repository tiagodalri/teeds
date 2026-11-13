/**
 * Nova simulação: a mesa de termômetros (13/11/2026, Tiago: "eu imaginava preencher os parâmetros
 * regulando o termômetro; vários termômetros e um universal que regula todos, além de cada um poder ser
 * controlado de forma individual, algo imersivo mesmo. Embaixo disso já precisa vir o preview para
 * validarmos as operações").
 *
 * No topo, o cenário do aluno (I.A., modo, saldo, conta, lucro ou prejuízo). Depois o termômetro
 * universal, do mais conservador ao mais agressivo, e um termômetro por parâmetro: entrada, resultado,
 * tempo, risco (a maior sequência de perdas) e, na Gulf e na Phenom, o loss virtual. Quem está preso ao
 * universal (a corrente fechada) anda com ele; mexer num termômetro solta ele do universal e trava o
 * valor; tocar na corrente prende de novo. Dá para digitar o valor exato tocando no número.
 *
 * Cada termômetro só vai até onde a I.A. alcança: o do resultado tem como pontas o mínimo e o máximo
 * que aquela I.A. faz com a entrada, o tempo e o saldo escolhidos (core/teeds/cenariosDaSessao.ts).
 * A sessão inteira é remontada a cada ajuste (10 a 30 ms) e a prévia embaixo, com a cabine de verdade e
 * a lista das operações, acompanha. O play roda exatamente a sessão da prévia.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { MARCA } from '../../marca'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { NomeDoRobo } from '../NomeDoRobo'
import { useCatalogoCompleto } from '../../core/teeds/catalogoRobos'
import { NOME_DO_MODO, temModos, type Modo } from '../../core/deriv/strategies'
import {
  definirRegrasDaSessao, estrategiaDa, IAS_DA_SESSAO, nomeDaIa, parametrosDa,
  type Momento, type PontoDePartida, type Roteiro,
} from '../../core/teeds/sessaoSimulada'
import { cenarioDoNivel, esperaDoLossVirtual, faixaDoLucro, faixaDoPrejuizo, niveisDeRisco, type Cenario, type Pedido } from '../../core/teeds/cenariosDaSessao'
import { PreviaDaSessao } from './PreviaDaSessao'
import { pontoDePartida } from './PalcoDaSessao'
import { corDoNivel, Curva, duracao, EscadaDaSequencia, historia, Medidor, Mostrador, relogio } from './pecasDaCalibragem'
import '../relatorios/relatorios.css'
import './sessao-simulada.css'
import './estudio.css'
import './assistente.css'

const IA = MARCA.vocabularioIA ? 'I.A.' : 'robô'
const usd = (x: number) => dinheiro(x, 'USD')
const SALDOS = [10, 20, 50, 100, 500, 2000]
const PARTIDA_FIXA: PontoDePartida = { preco: 61234.5678, casas: 4 }
const LOSS_VIRTUAL_MAXIMO = 12
const ENTRADA_MINIMA = 0.35
const TEMPO_MINIMO = 5
const TEMPO_MAXIMO = 120

const r2 = (x: number) => Math.round(x * 100) / 100
const entre = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x))
const ler = (t: string) => {
  const limpo = t.trim().replace(/\s|US\$|\$|min|[+−-]/gi, '')
  if (!limpo) return null
  const x = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
  return Number.isFinite(x) ? x : null
}
const numeroCurto = (x: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2, useGrouping: false })
const esperaEmTexto = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace('.', ',')} h`)

/* --------------------------------------------------- as escalas dos termômetros */

/** Valores redondos: o termômetro encaixa neles. */
const redondo = (x: number) => { const p = x < 2 ? 0.05 : x < 10 ? 0.25 : x < 20 ? 0.5 : x < 100 ? 1 : x < 1000 ? 5 : 10; return r2(Math.round(x / p) * p) }
/** A maior entrada do termômetro: 5% do saldo (acima disso quase nenhuma sequência cabe na conta). */
const entradaMaxima = (saldo: number) => Math.max(0.7, Math.min(200, r2(saldo * 0.05)))
/** Em escala de proporção (cada trecho do termômetro multiplica o valor pelo mesmo tanto). */
const naEscala = (f: number, lo: number, hi: number) => (hi > lo ? lo * Math.pow(hi / lo, entre(f, 0, 1)) : lo)
const fNaEscala = (v: number, lo: number, hi: number) => (hi > lo && v > 0 ? entre(Math.log(v / lo) / Math.log(hi / lo), 0, 1) : 0)

type Param = 'entrada' | 'resultado' | 'tempo' | 'risco' | 'lv'
/** Preso ao universal (`ligado`) ou solto, com o valor travado em `fixo`. */
interface Elo { ligado: boolean; fixo: number | null }
/** Para qual lado o universal leva cada termômetro: mais agressivo = entrada, resultado e risco maiores; sessão mais curta. */
const SENTIDO: Record<Param, 1 | -1> = { entrada: 1, resultado: 1, tempo: -1, risco: 1, lv: -1 }
const ZONAS = ['Conservador', 'Equilibrado', 'Intenso', 'Agressivo'] as const
const zonaDe = (f: number) => ZONAS[Math.min(3, Math.max(0, Math.ceil(f * 4) - 1))]

/* ------------------------------------------------------------ as peças */

/** O número do termômetro: tocar para digitar o valor exato. */
function ValorEditavel({ texto, valor, rotulo, aoConfirmar }: { texto: ReactNode; valor: number; rotulo: string; aoConfirmar: (x: number) => void }) {
  const [edicao, setEdicao] = useState<string | null>(null)
  if (edicao === null) {
    return <button type="button" className="mes-valor" onClick={() => setEdicao(numeroCurto(Math.abs(valor)))} title="Toque para digitar o valor exato" aria-label={`${rotulo}. Toque para digitar`}>{texto}</button>
  }
  const confirmar = () => { const x = ler(edicao); if (x !== null && x > 0) aoConfirmar(x); setEdicao(null) }
  return (
    <input className="mes-valor editando" autoFocus inputMode="decimal" value={edicao} aria-label={rotulo}
      onChange={(e) => setEdicao(e.target.value)} onBlur={confirmar}
      onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); else if (e.key === 'Escape') { e.stopPropagation(); setEdicao(null) } }} />
  )
}

function Corrente({ fechada }: { fechada: boolean }) {
  return fechada
    ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg>
    : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 6.5l.5-.5a4 4 0 0 1 5.66 5.66l-2 2" /><path d="M10.5 17.5l-.5.5a4 4 0 0 1-5.66-5.66l2-2" /><path d="M4 4l16 16" /></svg>
}

function Termometro({ id, rotulo, f, ligado, aoArrastar, aoAlternarElo, valor, dica, marcas = 0, desligado = false, children }: {
  id: string; rotulo: string; f: number; ligado: boolean; aoArrastar: (f: number) => void; aoAlternarElo: () => void
  valor: ReactNode; dica?: ReactNode; marcas?: number; desligado?: boolean; children?: ReactNode
}) {
  return (
    <div className={`mes-termo ${ligado ? 'ligado' : 'solto'}`} style={{ ['--f' as string]: entre(f, 0, 1) } as CSSProperties}>
      <div className="mes-termo-topo">
        <label htmlFor={id}>{rotulo}</label>
        {valor}
      </div>
      <div className="mes-termo-linha">
        <button type="button" className="mes-elo" aria-pressed={ligado} onClick={aoAlternarElo}
          title={ligado ? 'Preso ao universal. Toque para soltar' : 'Solto do universal. Toque para prender'}
          aria-label={`${rotulo}: ${ligado ? 'preso ao universal' : 'solto do universal'}`}>
          <Corrente fechada={ligado} />
        </button>
        <div className="mes-pista">
          <div className="mes-trilho"><i /></div>
          {marcas > 1 && marcas <= 25 && <div className="mes-marcas" aria-hidden="true">{Array.from({ length: marcas }, (_, i) => <i key={i} style={{ left: `${(i / (marcas - 1)) * 100}%` }} />)}</div>}
          <input id={id} type="range" className="mes-range" min={0} max={1000} step={1} value={Math.round(entre(f, 0, 1) * 1000)} disabled={desligado}
            onChange={(e) => aoArrastar(Number(e.target.value) / 1000)} />
        </div>
      </div>
      {dica && <small className="mes-dica">{dica}</small>}
      {children}
    </div>
  )
}

/* ============================================================== a mesa */

export function AssistenteDaSessao({ ia: iaInicial, saldo: saldoInicial, conta: contaInicial, aoDarPlay, aoAbrirEstudio, aoFechar }: {
  ia: string | null
  saldo: number | null
  conta: 'real' | 'demo'
  aoDarPlay: (r: Roteiro) => void
  /** Ajuste fino: abre o estúdio completo com a sessão da mesa (ou vazio). */
  aoAbrirEstudio: (r: Roteiro | null) => void
  aoFechar: () => void
}) {
  const versao = definirRegrasDaSessao(useCatalogoCompleto())
  const [ia, setIa] = useState<string>(iaInicial && (IAS_DA_SESSAO as readonly string[]).includes(iaInicial) ? iaInicial : IAS_DA_SESSAO[0])
  const [modo, setModo] = useState<Modo>('conservador')
  const [saldo, setSaldo] = useState<number>(saldoInicial && saldoInicial >= 10 ? r2(saldoInicial) : 500)
  const [conta, setConta] = useState<'real' | 'demo'>(contaInicial)
  const [sinal, setSinal] = useState<'lucro' | 'prejuizo'>('lucro')
  const [momento, setMomento] = useState<Momento>('meio')
  const [semente, setSemente] = useState(1)
  const [mestre, setMestre] = useState(0.4)
  // o loss virtual começa solto, no padrão do painel: é regra da I.A., não intensidade (a corrente prende se quiser)
  const [elos, setElos] = useState<Record<Param, Elo>>({
    entrada: { ligado: true, fixo: null }, resultado: { ligado: true, fixo: null }, tempo: { ligado: true, fixo: null },
    risco: { ligado: true, fixo: null }, lv: { ligado: false, fixo: null },
  })
  const [partida, setPartida] = useState<PontoDePartida>(PARTIDA_FIXA)
  const t0 = useRef(Math.floor(Date.now() / 1000) * 1000)
  useEffect(() => { let vivo = true; void pontoDePartida().then((p) => { if (vivo) setPartida(p) }); return () => { vivo = false } }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    document.body.classList.add('rel-painel-aberto', 'est-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('rel-painel-aberto', 'est-aberto') }
  }, [aoFechar])

  const params = parametrosDa(ia)
  const comModos = temModos(ia, params)
  const lvDoPainel = params.entrada.lossVirtual ?? 0
  const comLV = !!estrategiaDa(ia).lossVirtualAjustavel && lvDoPainel > 0
  const lucro = sinal === 'lucro'
  /** Onde o universal põe um termômetro preso a ele. */
  const doMestre = (p: Param) => (SENTIDO[p] > 0 ? mestre : 1 - mestre)
  const soltar = (p: Param, fixo: number) => setElos((x) => ({ ...x, [p]: { ligado: false, fixo } }))
  const alternar = (p: Param, valorAtual: number) => setElos((x) => ({ ...x, [p]: x[p].ligado ? { ligado: false, fixo: valorAtual } : { ligado: true, fixo: null } }))

  // entrada
  const eMax = entradaMaxima(saldo)
  const entrada = elos.entrada.ligado || elos.entrada.fixo === null
    ? Math.max(ENTRADA_MINIMA, redondo(naEscala(doMestre('entrada'), ENTRADA_MINIMA, eMax)))
    : entre(elos.entrada.fixo, ENTRADA_MINIMA, Math.max(ENTRADA_MINIMA, saldo))
  const fEntrada = fNaEscala(entrada, ENTRADA_MINIMA, eMax)
  // tempo
  const minutos = elos.tempo.ligado || elos.tempo.fixo === null
    ? Math.round(TEMPO_MINIMO + doMestre('tempo') * (TEMPO_MAXIMO - TEMPO_MINIMO))
    : entre(Math.round(elos.tempo.fixo), 1, 240)
  const fTempo = entre((minutos - TEMPO_MINIMO) / (TEMPO_MAXIMO - TEMPO_MINIMO), 0, 1)
  // loss virtual
  const lossVirtual = !comLV ? null : elos.lv.ligado ? Math.round(doMestre('lv') * LOSS_VIRTUAL_MAXIMO) : entre(Math.round(elos.lv.fixo ?? lvDoPainel), 0, LOSS_VIRTUAL_MAXIMO)
  const fLv = (lossVirtual ?? 0) / LOSS_VIRTUAL_MAXIMO

  /*
    O resultado: as pontas do termômetro são o que a I.A. alcança com esta entrada, este tempo e este
    saldo (no prejuízo, de duas entradas até o saldo inteiro). Preso ao universal ele guarda a posição;
    solto, guarda o valor (e o termômetro mostra onde esse valor cai na faixa nova).
  */
  const baseDoPedido = useMemo(() => ({ ia, modo: comModos ? modo : 'conservador' as Modo, saldo, conta, entrada, minutos, momento, semente, lossVirtual }),
    [ia, modo, comModos, saldo, conta, entrada, minutos, momento, semente, lossVirtual])
  const faixa = useMemo(() => {
    // um pouco para dentro das pontas: na ponta exata só fecha uma sessão em mil
    if (!lucro) {
      const f = faixaDoPrejuizo({ ...baseDoPedido, resultado: -1 })
      if (!f) return null
      const lo = f.min * 1.03, hi = Math.min(saldo, f.max)
      return hi > lo ? { lo, hi } : null
    }
    const f = faixaDoLucro({ ...baseDoPedido, resultado: 1 })
    if (!f || !(f.max > 0)) return null
    const lo = Math.max(0.5, f.min * 1.06), hi = f.max * 0.9
    return hi > lo ? { lo, hi } : null
  }, [baseDoPedido, lucro, entrada, saldo, versao]) // eslint-disable-line react-hooks/exhaustive-deps
  const valorDoResultado = !faixa ? 0
    : elos.resultado.ligado || elos.resultado.fixo === null ? entre(redondo(naEscala(doMestre('resultado'), faixa.lo, faixa.hi)), r2(faixa.lo), r2(faixa.hi))
    : elos.resultado.fixo
  const fResultado = faixa ? fNaEscala(valorDoResultado, faixa.lo, faixa.hi) : 0
  const foraDaFaixa = !!faixa && (valorDoResultado < faixa.lo - 0.005 || valorDoResultado > faixa.hi + 0.005)

  const pedido: Pedido | null = useMemo(() => (valorDoResultado > 0 ? { ...baseDoPedido, resultado: lucro ? valorDoResultado : -valorDoResultado } : null),
    [baseDoPedido, valorDoResultado, lucro])
  const chave = pedido ? JSON.stringify(pedido) : ''

  // risco: os níveis que fecham este pedido (cada maior sequência de perdas, da mais curta à que o saldo aguenta)
  const niveis = useMemo(() => (pedido ? niveisDeRisco(pedido) : []), [chave, versao]) // eslint-disable-line react-hooks/exhaustive-deps
  const iRisco = !niveis.length ? 0
    : elos.risco.ligado || elos.risco.fixo === null ? Math.round(doMestre('risco') * (niveis.length - 1))
    : niveis.reduce((melhor, n, i) => (Math.abs(n.S - elos.risco.fixo!) < Math.abs(niveis[melhor].S - elos.risco.fixo!) ? i : melhor), 0)
  const fRisco = niveis.length > 1 ? iRisco / (niveis.length - 1) : 0.5

  /*
    A sessão do ponto escolhido. Sai em 10 a 30 ms, então é remontada logo depois de cada movimento
    (um respiro curto para o arrasto não engasgar) e fica guardada: voltar a um ponto é imediato. Se o
    nível escolhido não fechar no tempo exato, vale o vizinho mais próximo que fecha.
  */
  const guardadas = useRef(new Map<string, Cenario | null>())
  const [sessao, setSessao] = useState<{ chave: string; c: Cenario | null } | null>(null)
  const chaveDaSessao = pedido && niveis.length ? `${chave}|${niveis[iRisco].chave}|${versao}` : ''
  useEffect(() => {
    if (!pedido || !niveis.length) return
    const pronta = guardadas.current.get(chaveDaSessao)
    if (pronta !== undefined) { setSessao({ chave: chaveDaSessao, c: pronta }); return }
    const relogioDaConta = window.setTimeout(() => {
      let c: Cenario | null = null
      const ordem = [0, 1, -1, 2, -2, 3, -3].map((d) => iRisco + d).filter((i) => i >= 0 && i < niveis.length)
      // sem travar a tela: as tentativas param depois de 350 ms
      const desde = performance.now()
      for (const i of ordem) { c = cenarioDoNivel(pedido, niveis[i], PARTIDA_FIXA); if (c || performance.now() - desde > 350) break }
      if (guardadas.current.size > 300) guardadas.current.clear()
      guardadas.current.set(chaveDaSessao, c)
      setSessao({ chave: chaveDaSessao, c })
    }, 70)
    return () => window.clearTimeout(relogioDaConta)
  }, [chaveDaSessao]) // eslint-disable-line react-hooks/exhaustive-deps

  const semSessaoPossivel = !pedido || !niveis.length
  const calibrando = !semSessaoPossivel && sessao?.chave !== chaveDaSessao
  // enquanto a conta nova não chega, a última sessão continua na tela
  const ultima = useRef<Cenario | null>(null)
  if (sessao?.c) ultima.current = sessao.c
  const naoFecha = semSessaoPossivel || (!calibrando && !sessao?.c)
  const c = naoFecha ? null : calibrando ? ultima.current : sessao?.c ?? null
  const cDaPrevia = useDeferredValue(c)

  const exigido = c ? c.saldoMinimo : 0
  const parteDoSaldo = saldo > 0 ? exigido / saldo : 0
  const cor = corDoNivel(Math.min(1, parteDoSaldo * 1.15))
  const roteiroDaMesa = (x: Cenario): Roteiro => ({ ...x.roteiro, id: `simulada-${Date.now()}`, conta })
  const usar = () => { if (c) aoDarPlay(roteiroDaMesa(c)) }
  const trocarIa = (id: string) => { setIa(id); setModo('conservador'); setElos((x) => ({ ...x, lv: { ligado: false, fixo: null } })) }
  const presos = (Object.keys(elos) as Param[]).filter((p) => (p !== 'lv' || comLV) && elos[p].ligado).length
  const totalDeTermos = comLV ? 5 : 4

  return (
    <div className="est asi mes ssim-raiz" role="dialog" aria-modal="true" aria-label="Nova simulação" style={{ ['--cor' as string]: cor } as CSSProperties}>
      <header className="est-topo">
        <div className="est-marca"><i aria-hidden="true" /><div><b>Nova simulação</b><small>Regule os termômetros, confira a prévia e dê o play</small></div></div>
        <div className="est-topo-acoes">
          <button type="button" className="asi-estudio" onClick={() => aoAbrirEstudio(c ? roteiroDaMesa(c) : null)}>
            {c ? 'Ajuste fino no estúdio' : 'Estúdio completo'}
          </button>
          <button type="button" className="est-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
      </header>

      <div className="mes-corpo">
        <section className="mes-cenario" aria-label="O cenário">
          <div className="mes-campo mes-campo-ia">
            <span>{IA}</span>
            <div className="mes-ias" role="radiogroup" aria-label={`Qual ${IA}`}>
              {IAS_DA_SESSAO.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={ia === id} className={ia === id ? 'on' : ''} onClick={() => trocarIa(id)}>
                  <NomeDoRobo nome={nomeDaIa(id)} id={id} />
                </button>
              ))}
            </div>
          </div>
          {comModos && (
            <div className="mes-campo">
              <span>Modo</span>
              <div className="est-seg" role="radiogroup" aria-label="Modo">
                {(['conservador', 'agressivo'] as const).map((m) => <button key={m} type="button" role="radio" aria-checked={modo === m} className={modo === m ? 'on' : ''} onClick={() => setModo(m)}><b>{NOME_DO_MODO[m]}</b></button>)}
              </div>
            </div>
          )}
          <div className="mes-campo mes-campo-saldo">
            <span>Saldo da conta</span>
            <div className="mes-saldos">
              {SALDOS.map((v) => <button key={v} type="button" className={saldo === v ? 'on' : ''} onClick={() => setSaldo(v)}>{v.toLocaleString('pt-BR')}</button>)}
              <ValorEditavel rotulo="Saldo da conta" valor={saldo} texto={usd(saldo)} aoConfirmar={(x) => setSaldo(Math.max(1, r2(x)))} />
            </div>
          </div>
          <div className="mes-campo">
            <span>A conta aparece como</span>
            <div className="est-seg" role="radiogroup" aria-label="Conta">
              {(['real', 'demo'] as const).map((k) => <button key={k} type="button" role="radio" aria-checked={conta === k} className={conta === k ? 'on' : ''} onClick={() => setConta(k)}><b>{k === 'real' ? 'Real' : 'Demo'}</b></button>)}
            </div>
          </div>
          <div className="mes-campo">
            <span>A sessão termina em</span>
            <div className="est-seg asi-sinal" role="radiogroup" aria-label="Lucro ou prejuízo">
              {(['lucro', 'prejuizo'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={sinal === s} className={`${sinal === s ? 'on' : ''} ${s}`} onClick={() => setSinal(s)}><b>{s === 'lucro' ? 'Lucro' : 'Prejuízo'}</b></button>)}
            </div>
          </div>
        </section>

        <section className="mes-universal" style={{ ['--f' as string]: mestre } as CSSProperties} aria-label="Termômetro universal">
          <div className="mes-universal-topo">
            <div>
              <b>Termômetro universal</b>
              <small>Move os {presos} de {totalDeTermos} termômetros presos a ele. Mexer num deles solta e trava o valor; a corrente prende de novo.</small>
            </div>
            <strong>{zonaDe(mestre)}</strong>
          </div>
          <div className="mes-pista grande">
            <div className="mes-trilho"><i /></div>
            <input type="range" className="mes-range" min={0} max={1000} step={1} value={Math.round(mestre * 1000)} aria-label="Termômetro universal"
              aria-valuetext={zonaDe(mestre)} onChange={(e) => setMestre(Number(e.target.value) / 1000)} />
          </div>
          <div className="mes-pontas" aria-hidden="true"><span>Mais conservador</span><span>Mais agressivo</span></div>
        </section>

        <section className="mes-termos" aria-label="Os termômetros">
          <Termometro id="mes-entrada" rotulo="Entrada" f={fEntrada} ligado={elos.entrada.ligado}
            aoArrastar={(f) => soltar('entrada', Math.max(ENTRADA_MINIMA, redondo(naEscala(f, ENTRADA_MINIMA, eMax))))} aoAlternarElo={() => alternar('entrada', entrada)}
            valor={<ValorEditavel rotulo="Entrada" valor={entrada} texto={usd(entrada)} aoConfirmar={(x) => soltar('entrada', entre(r2(x), ENTRADA_MINIMA, saldo))} />}
            dica={`De ${usd(ENTRADA_MINIMA)} a ${usd(eMax)} com esse saldo. É o primeiro degrau da escada.`} />

          <Termometro id="mes-resultado" rotulo={lucro ? 'Resultado (lucro)' : 'Resultado (prejuízo)'} f={fResultado} ligado={elos.resultado.ligado} desligado={!faixa}
            aoArrastar={(f) => faixa && soltar('resultado', entre(redondo(naEscala(f, faixa.lo, faixa.hi)), r2(faixa.lo), r2(faixa.hi)))} aoAlternarElo={() => alternar('resultado', valorDoResultado)}
            valor={<ValorEditavel rotulo="Resultado" valor={valorDoResultado} texto={<span className={lucro ? 'sobe' : 'cai'}>{dinheiroComSinal(lucro ? valorDoResultado : -valorDoResultado, 'USD')}</span>} aoConfirmar={(x) => soltar('resultado', r2(x))} />}
            dica={!faixa ? `Com essa entrada e esse saldo a ${nomeDaIa(ia)} não tem sessão que feche. Diminua a entrada.`
              : lucro ? `Nesse tempo e com essa entrada a ${nomeDaIa(ia)} faz de ${usd(faixa.lo)} a ${usd(faixa.hi)}.`
              : `Nesse tempo a ${nomeDaIa(ia)} fecha prejuízos de ${usd(faixa.lo)} a ${usd(faixa.hi)}: antes de cair ela sobe, e um stop menor não devolveria isso.`} />

          <Termometro id="mes-tempo" rotulo="Tempo da sessão" f={fTempo} ligado={elos.tempo.ligado}
            aoArrastar={(f) => soltar('tempo', Math.round(TEMPO_MINIMO + f * (TEMPO_MAXIMO - TEMPO_MINIMO)))} aoAlternarElo={() => alternar('tempo', minutos)}
            valor={<ValorEditavel rotulo="Tempo da sessão em minutos" valor={minutos} texto={duracao(minutos)} aoConfirmar={(x) => soltar('tempo', entre(Math.round(x), 1, 240))} />}
            dica={c ? `${c.operacoes} operações em ${relogio(c.tempo.segundos)}.` : 'De 5 min a 2 h (digite para ir até 4 h).'} />

          <Termometro id="mes-risco" rotulo="Risco (maior sequência de perdas)" f={fRisco} ligado={elos.risco.ligado} marcas={niveis.length} desligado={niveis.length < 2}
            aoArrastar={(f) => niveis.length && soltar('risco', niveis[Math.round(f * (niveis.length - 1))].S)} aoAlternarElo={() => alternar('risco', niveis[iRisco]?.S ?? 0)}
            valor={<span className="mes-valor fixo">{niveis.length ? `Nível ${iRisco + 1} de ${niveis.length}` : 'Sem níveis'}</span>}
            dica={c ? `${c.maiorSequencia} ${c.maiorSequencia === 1 ? 'perda seguida' : 'perdas seguidas'} · maior entrada ${usd(c.maiorEntrada)}.` : undefined}>
            {lucro && (
              <div className="mes-momento">
                <span>Essa sequência vem</span>
                <div className="est-seg" role="radiogroup" aria-label="Quando vem a maior sequência">
                  {([['comeco', 'No começo'], ['meio', 'No meio'], ['fim', 'Perto do fim']] as const).map(([m, nome]) => (
                    <button key={m} type="button" role="radio" aria-checked={momento === m} className={momento === m ? 'on' : ''} onClick={() => setMomento(m)}><b>{nome}</b></button>
                  ))}
                </div>
              </div>
            )}
          </Termometro>

          {comLV && lossVirtual !== null && (
            <Termometro id="mes-lv" rotulo="Loss virtual" f={fLv} ligado={elos.lv.ligado} marcas={LOSS_VIRTUAL_MAXIMO + 1}
              aoArrastar={(f) => soltar('lv', Math.round(f * LOSS_VIRTUAL_MAXIMO))} aoAlternarElo={() => alternar('lv', lossVirtual)}
              valor={<span className="mes-valor fixo">{lossVirtual === 0 ? 'Sem' : `${lossVirtual} ${lossVirtual === 1 ? 'dígito' : 'dígitos'}`}{lossVirtual === lvDoPainel && <em className="asi-tag">Padrão</em>}</span>}
              dica={lossVirtual === 0 ? `A ${nomeDaIa(ia)} entra direto, uma operação a cada 4 s.` : `Espera em média ${esperaEmTexto(esperaDoLossVirtual(ia, lossVirtual))} por entrada nova. Não muda o acerto nem a escada.`} />
          )}
        </section>

        {naoFecha ? (
          <div className="asi-problema" role="alert">
            <b>Com esses ajustes nenhuma sessão fecha</b>
            <p>{!faixa ? (lucro ? `A entrada de ${usd(entrada)} é alta demais para o saldo de ${usd(saldo)}: nenhuma sequência de perdas da ${nomeDaIa(ia)} cabe na conta.`
                : `Em ${duracao(minutos)}, com entrada de ${usd(entrada)} e saldo de ${usd(saldo)}, a ${nomeDaIa(ia)} não fecha nenhum prejuízo: antes de cair ela sobe mais do que uma queda devolve. Diminua o tempo ou a entrada.`)
              : foraDaFaixa && lucro ? `Em ${duracao(minutos)}, com entrada de ${usd(entrada)}, a ${nomeDaIa(ia)} faz de ${usd(faixa.lo)} a ${usd(faixa.hi)}. O valor digitado (${usd(valorDoResultado)}) fica fora dessa faixa.`
              : `A ${nomeDaIa(ia)} não fecha ${dinheiroComSinal(lucro ? valorDoResultado : -valorDoResultado, 'USD')} em ${duracao(minutos)} com entrada de ${usd(entrada)}. Mexa no resultado, no tempo ou na entrada.`}</p>
            {!elos.resultado.ligado && <div className="asi-sugestoes"><button type="button" onClick={() => setElos((x) => ({ ...x, resultado: { ligado: true, fixo: null } }))}>Prender o resultado ao universal</button></div>}
          </div>
        ) : c ? (
          <>
            <section className={`mes-leitura ${calibrando ? 'calibrando' : ''}`} aria-label="A sessão" aria-busy={calibrando}>
              <Medidor parte={parteDoSaldo} exigido={exigido} saldo={saldo} />
              <div className="cal-mostradores">
                <Mostrador grande rotulo="Maior sequência de perdas" valor={c.maiorSequencia} formato={(x) => String(Math.round(x))} sufixo={<em> {c.maiorSequencia === 1 ? 'perda seguida' : 'perdas seguidas'}</em>} />
                <Mostrador rotulo="Prejuízo acumulado na sequência" valor={c.perdidoNaSequencia} formato={usd} tom="cai" parte={c.perdidoNaSequencia / saldo} />
                <Mostrador rotulo="Maior entrada" valor={c.maiorEntrada} formato={usd} parte={c.maiorEntrada / saldo} />
                <Mostrador rotulo="Pior momento da sessão" valor={c.piorMomento} formato={(x) => dinheiroComSinal(x, 'USD')} tom={c.piorMomento < 0 ? 'cai' : undefined} parte={Math.abs(c.piorMomento) / saldo} />
              </div>
              <EscadaDaSequencia c={c} base={Math.max(ENTRADA_MINIMA, entrada)} topo={c.maiorEntrada} />
            </section>

            <section className={`cal-sessao ${calibrando ? 'calibrando' : ''}`}>
              <div className="cal-placar">
                <div><small>Resultado</small><strong className={c.resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(c.resultado, 'USD')}</strong></div>
                <div><small>Duração</small><strong>{relogio(c.tempo.segundos)}</strong></div>
                <div><small>Operações</small><strong>{c.operacoes}</strong></div>
                <div><small>Acerto</small><strong>{c.acerto}%</strong></div>
                <div><small>Meta de ganho</small><strong>{usd(c.meta)}</strong></div>
                <div><small>Limite de perda</small><strong>{usd(c.stop)}</strong></div>
                <div><small>Saldo no fim</small><strong>{usd(c.saldoFinal)}</strong></div>
              </div>
              <Curva c={c} alta={78} />
              <p className="asi-historia">
                {historia(c, minutos)}
                {c.trabalhada && <small className="asi-montada">Sessão montada: o ritmo de perdas e ganhos foi trabalhado para fechar o pedido, dentro das regras da escada.</small>}
              </p>
            </section>

            <section className="mes-previa" aria-label="Prévia das operações">
              <div className="cal-previa-topo">
                <b>Prévia das operações</b>
                <small>A cabine de verdade e a lista operação por operação. É exatamente o que o play vai rodar.</small>
              </div>
              {cDaPrevia && <PreviaDaSessao comFoco ladoALado roteiro={cDaPrevia.roteiro} previa={cDaPrevia.previa} partida={partida} inicio={t0.current} segundosAte={cDaPrevia.tempo.marcas} />}
            </section>
          </>
        ) : (
          <div className="asi-vazio calculando" role="status">
            <div className="asi-vazio-cartas" aria-hidden="true"><i /><i /><i /><i /></div>
            <b>Calibrando…</b>
          </div>
        )}
      </div>

      <footer className="mes-acoes">
        <span>{c ? <><b style={{ color: cor }}>{nomeDaIa(ia)}</b> · entrada {usd(entrada)} · {dinheiroComSinal(c.resultado, 'USD')} em {duracao(minutos)} · {c.maiorSequencia} {c.maiorSequencia === 1 ? 'perda' : 'perdas'} · exige {usd(exigido)} de saldo</> : 'Regule os termômetros até a sessão fechar.'}</span>
        <button type="button" className="asi-sortear" onClick={() => setSemente((s) => s + 1)} disabled={!c}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 0 0-14.3-4.3L4 8m16 8-1.7 2.3A8 8 0 0 1 4 14" /></svg>
          Outra sessão
        </button>
        <button type="button" className="est-play" onClick={usar} disabled={!c || calibrando}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>Dar o play
        </button>
      </footer>
    </div>
  )
}
