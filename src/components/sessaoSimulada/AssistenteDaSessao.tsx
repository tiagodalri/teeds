/**
 * Nova simulação por perguntas (13/11/2026, Tiago: "eu somente defino qual a I.A. e qual o resultado,
 * e as próximas etapas o sistema vai me perguntando, com respostas pré-definidas; você me dá 4 opções
 * de cenários, do mais conservador ao mais agressivo — tempo da operação, perdas seguidas com valor em
 * US$ — e eu vejo a prévia das operações como na tela real antes de escolher").
 *
 * À esquerda, as perguntas, uma de cada vez (as respondidas viram uma linha com "Alterar"). À direita,
 * os cenários que fecham com o pedido (core/teeds/cenariosDaSessao.ts), cada um com a prévia na cabine
 * de verdade. O play roda exatamente a sessão escolhida.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MARCA } from '../../marca'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { NomeDoRobo } from '../NomeDoRobo'
import { useCatalogoCompleto } from '../../core/teeds/catalogoRobos'
import { NOME_DO_MODO, temModos, type Modo } from '../../core/deriv/strategies'
import {
  definirRegrasDaSessao, digitosQueGanham, estrategiaDa, IAS_DA_SESSAO, nomeDaIa, parametrosDa,
  type Momento, type PontoDePartida, type Roteiro,
} from '../../core/teeds/sessaoSimulada'
import { montarCenarios, type Cenario, type Pedido, type Resposta, type Sugestao } from '../../core/teeds/cenariosDaSessao'
import { PreviaDaSessao } from './PreviaDaSessao'
import { pontoDePartida } from './PalcoDaSessao'
import '../relatorios/relatorios.css'
import './sessao-simulada.css'
import './estudio.css'
import './assistente.css'

const IA = MARCA.vocabularioIA ? 'I.A.' : 'robô'
const usd = (x: number) => dinheiro(x, 'USD')
const SALDOS = [10, 20, 50, 100, 500, 2000]
const ENTRADAS = [0.35, 0.5, 1, 2, 5, 10, 20]
const LUCROS = [10, 20, 50, 100, 240, 500]
const PREJUIZOS = [5, 10, 20, 30, 50, 100]
const TEMPOS = [5, 10, 15, 20, 30, 45, 60, 90, 120]
const PARTIDA_FIXA: PontoDePartida = { preco: 61234.5678, casas: 4 }

const duracao = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h${min % 60 ? ` ${String(min % 60).padStart(2, '0')} min` : ''}`)
const relogio = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`)
const ler = (t: string) => {
  const limpo = t.trim().replace(/\s|US\$|\$|min/gi, '')
  if (!limpo) return null
  const x = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
  return Number.isFinite(x) ? x : null
}
const numeroCurto = (x: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: x % 1 ? 2 : 0, maximumFractionDigits: 2 })

/** Como cada I.A. opera, numa linha. */
function sobreAIa(id: string): string {
  const e = estrategiaDa(id)
  const ganha = digitosQueGanham(e.contractType, e.barreira)
  const lv = parametrosDa(id).entrada.lossVirtual ?? 0
  const como = id === 'goreme' ? 'Ganha de 0 a 8 e recupera no 7, 8 e 9' : `Ganha com ${ganha.length >= 6 ? `${ganha[0]} a ${ganha[ganha.length - 1]}` : ganha.join(', ').replace(/, (\d)$/, ' ou $1')}`
  return `${como} · ${lv > 0 ? `analisa ${lv} dígitos antes de entrar` : 'entra direto, uma operação a cada 4 s'}`
}

/* --------------------------------------------------------- as perguntas */

type Etapa = 'ia' | 'modo' | 'saldo' | 'entrada' | 'resultado' | 'tempo'

function Pergunta({ n, titulo, resposta, aberta, futura, aoAlterar, children, dica }: {
  n: number; titulo: string; resposta?: ReactNode; aberta: boolean; futura: boolean; aoAlterar: () => void; children?: ReactNode; dica?: ReactNode
}) {
  if (futura) return <div className="asi-perg futura" aria-hidden="true"><span className="asi-n">{n}</span><b>{titulo}</b></div>
  if (!aberta) {
    return (
      <div className="asi-perg feita">
        <span className="asi-n ok" aria-hidden="true">✓</span>
        <div><small>{titulo}</small><b>{resposta}</b></div>
        <button type="button" onClick={aoAlterar}>Alterar</button>
      </div>
    )
  }
  return (
    <section className="asi-perg aberta" aria-label={titulo}>
      <h3><span className="asi-n">{n}</span>{titulo}</h3>
      {children}
      {dica && <small className="asi-dica">{dica}</small>}
    </section>
  )
}

/** Atalhos + "outro valor". */
function Valores({ valores, atual, formato, aoEscolher, prefixo, sufixo, rotulo, min = 0 }: {
  valores: number[]; atual: number | null; formato: (x: number) => string; aoEscolher: (x: number) => void
  prefixo?: string; sufixo?: string; rotulo: string; min?: number
}) {
  const [texto, setTexto] = useState(atual !== null && !valores.includes(atual) ? numeroCurto(atual) : '')
  const x = ler(texto)
  const ok = x !== null && x >= min
  return (
    <div className="asi-valores">
      <div className="asi-chips" role="radiogroup" aria-label={rotulo}>
        {valores.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={atual === v} className={atual === v ? 'on' : ''} onClick={() => aoEscolher(v)}>{formato(v)}</button>
        ))}
      </div>
      <form className="asi-outro" onSubmit={(e) => { e.preventDefault(); if (ok) aoEscolher(Math.round(x! * 100) / 100) }}>
        <label>
          {prefixo && <em>{prefixo}</em>}
          <input inputMode="decimal" placeholder="Outro valor" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label={`${rotulo}: outro valor`} />
          {sufixo && <em>{sufixo}</em>}
        </label>
        <button type="submit" disabled={!ok}>OK</button>
      </form>
    </div>
  )
}

/* ------------------------------------------------------------ o cartão */

const NOMES: Record<number, string[]> = {
  1: ['Único que fecha'], 2: ['Mais tranquilo', 'Mais arriscado'], 3: ['Mais tranquilo', 'Equilibrado', 'Mais arriscado'],
  4: ['Mais tranquilo', 'Equilibrado', 'Mais intenso', 'Mais arriscado'],
}
/** Do mais conservador ao mais agressivo (no prejuízo também: a queda maior e as entradas maiores são o risco). */
function nomeDoCenario(_c: Cenario, i: number, total: number, _perda: number): string {
  return NOMES[total]?.[i] ?? `Cenário ${i + 1}`
}
const ondeFoi = (c: Cenario) => {
  const f = c.operacoes ? c.previa.maiorSequencia.desde / c.operacoes : 0
  return f < 0.33 ? 'no começo' : f < 0.7 ? 'no meio' : 'perto do fim'
}
function historia(c: Cenario, minutos: number): string {
  if (c.resultado >= 0) {
    return `Bate a meta de ${usd(c.meta)} em ${duracao(minutos)}. A maior sequência, ${c.maiorSequencia} ${c.maiorSequencia === 1 ? 'perda' : 'perdas seguidas'} (${usd(c.perdidoNaSequencia)} perdidos), vem ${ondeFoi(c)}${c.entradaQueRecuperou ? ` e a recuperação fecha com uma entrada de ${usd(c.entradaQueRecuperou)}` : ''}.`
  }
  return `${c.melhorMomento >= 0.5 ? `Chega a ${dinheiroComSinal(c.melhorMomento, 'USD')}, ` : 'Começa sem sair do lugar, '}entra numa sequência de ${c.maiorSequencia} perdas e bate o stop de ${usd(c.stop)} em ${duracao(minutos)}.`
}

/** A curva do resultado, com a maior sequência marcada. */
function Curva({ c }: { c: Cenario }) {
  const ops = c.previa.corrida.ops
  const W = 280, H = 64
  const ys = [0, ...ops.map((o) => o.resultado)]
  const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys)
  const y = (v: number) => H - 4 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 8)
  const x = (i: number) => (i / Math.max(1, ys.length - 1)) * W
  const pontos = ys.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const d = c.previa.maiorSequencia.desde, n = c.previa.maiorSequencia.n
  const trecho = ys.slice(d, d + n + 1).map((v, i) => `${x(d + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className={`asi-curva ${c.resultado < 0 ? 'cai' : 'sobe'}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={y(0)} y2={y(0)} className="zero" />
      <polyline points={pontos} className="linha" />
      {n > 0 && <polyline points={trecho} className="seq" />}
    </svg>
  )
}

function CartaoDoCenario({ c, i, total, pedido, aoVer, aoUsar, aberto }: {
  c: Cenario; i: number; total: number; pedido: Pedido; aoVer: () => void; aoUsar: () => void; aberto: boolean
}) {
  const nivel = total === 1 ? 2 : Math.round((i / Math.max(1, total - 1)) * 3) + 1
  return (
    <article className={`asi-cartao n${nivel} ${aberto ? 'aberto' : ''}`} aria-label={`Cenário ${i + 1}`}>
      <header>
        <span className="asi-risco" aria-label={`Risco ${nivel} de 4`}>{[1, 2, 3, 4].map((k) => <i key={k} className={k <= nivel ? 'on' : ''} />)}</span>
        <b>{nomeDoCenario(c, i, total, -pedido.resultado)}</b>
        <small>Cenário {i + 1}</small>
      </header>
      <div className="asi-placar">
        <div><small>Resultado</small><strong className={c.resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(c.resultado, 'USD')}</strong></div>
        <div><small>Duração</small><strong>{relogio(c.tempo.segundos)}</strong></div>
      </div>
      <Curva c={c} />
      <p className="asi-historia">
        {historia(c, pedido.minutos)}
        {c.trabalhada && <small className="asi-montada">Sessão montada: o ritmo de perdas e ganhos foi trabalhado para fechar o pedido, dentro das regras da escada.</small>}
      </p>
      <dl className="asi-numeros">
        <div><dt>Maior sequência</dt><dd>{c.maiorSequencia} {c.maiorSequencia === 1 ? 'perda' : 'perdas'}</dd></div>
        <div><dt>Perdido nela</dt><dd className="cai">{usd(c.perdidoNaSequencia)}</dd></div>
        <div><dt>Maior entrada</dt><dd>{usd(c.maiorEntrada)}</dd></div>
        <div><dt>Pior momento</dt><dd className={c.piorMomento < 0 ? 'cai' : ''}>{dinheiroComSinal(c.piorMomento, 'USD')}</dd></div>
        <div><dt>Operações</dt><dd>{c.operacoes} <small>· {c.acerto}% de acerto</small></dd></div>
        <div><dt>Saldo no fim</dt><dd>{usd(c.saldoFinal)}</dd></div>
        <div><dt>Meta de ganho</dt><dd>{usd(c.meta)}</dd></div>
        <div><dt>Limite de perda</dt><dd>{usd(c.stop)}</dd></div>
      </dl>
      <footer>
        <button type="button" className="asi-ver" onClick={aoVer} aria-pressed={aberto}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
          {aberto ? 'Vendo a prévia' : 'Ver prévia'}
        </button>
        <button type="button" className="asi-usar" onClick={aoUsar}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>Usar este
        </button>
      </footer>
    </article>
  )
}

/* ========================================================== assistente */

export function AssistenteDaSessao({ ia: iaInicial, saldo: saldoInicial, conta: contaInicial, aoDarPlay, aoAbrirEstudio, aoFechar }: {
  ia: string | null
  saldo: number | null
  conta: 'real' | 'demo'
  aoDarPlay: (r: Roteiro) => void
  /** Ajuste fino: abre o estúdio completo com o cenário (ou vazio). */
  aoAbrirEstudio: (r: Roteiro | null) => void
  aoFechar: () => void
}) {
  const versao = definirRegrasDaSessao(useCatalogoCompleto())
  const [ia, setIa] = useState<string | null>(iaInicial && (IAS_DA_SESSAO as readonly string[]).includes(iaInicial) ? iaInicial : null)
  const [modo, setModo] = useState<Modo | null>(null)
  // o saldo é sempre uma pergunta (o do topo aparece como atalho)
  const [saldo, setSaldo] = useState<number | null>(null)
  const [conta, setConta] = useState<'real' | 'demo'>(contaInicial)
  const [entrada, setEntrada] = useState<number | null>(null)
  const [sinal, setSinal] = useState<'lucro' | 'prejuizo'>('lucro')
  const [valor, setValor] = useState<number | null>(null)
  const [minutos, setMinutos] = useState<number | null>(null)
  const [momento, setMomento] = useState<Momento>('meio')
  const [semente, setSemente] = useState(1)
  const [editando, setEditando] = useState<Etapa | null>(null)
  const [aberto, setAberto] = useState<number | null>(null)
  const [partida, setPartida] = useState<PontoDePartida>(PARTIDA_FIXA)
  const t0 = useRef(Math.floor(Date.now() / 1000) * 1000)
  useEffect(() => { let vivo = true; void pontoDePartida().then((p) => { if (vivo) setPartida(p) }); return () => { vivo = false } }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (aberto !== null) setAberto(null); else aoFechar() } }
    window.addEventListener('keydown', esc)
    document.body.classList.add('rel-painel-aberto', 'est-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('rel-painel-aberto', 'est-aberto') }
  }, [aoFechar, aberto])

  const comModos = ia ? temModos(ia, parametrosDa(ia)) : false
  const resultado = valor === null ? null : sinal === 'prejuizo' ? -valor : valor
  // a ordem das perguntas; a primeira sem resposta é a aberta
  const etapas: Etapa[] = ['ia', ...(comModos ? ['modo' as const] : []), 'saldo', 'entrada', 'resultado', 'tempo']
  const respondida: Record<Etapa, boolean> = {
    ia: !!ia, modo: !comModos || modo !== null, saldo: saldo !== null && saldo > 0, entrada: entrada !== null,
    resultado: resultado !== null && resultado !== 0, tempo: minutos !== null,
  }
  const atual = editando ?? etapas.find((e) => !respondida[e]) ?? null
  const responder = (f: () => void) => { f(); setEditando(null); setAberto(null) }

  const pedido: Pedido | null = useMemo(() => (ia && saldo && entrada !== null && resultado && minutos && (!comModos || modo)
    ? { ia, modo: comModos ? modo! : 'conservador', saldo, conta, entrada, resultado, minutos, momento, semente } : null),
  [ia, modo, saldo, conta, entrada, resultado, minutos, momento, semente, comModos])
  const chave = pedido ? JSON.stringify(pedido) : ''

  const [resposta, setResposta] = useState<{ chave: string; r: Resposta } | null>(null)
  const calculando = !!pedido && resposta?.chave !== chave
  useEffect(() => {
    if (!pedido) return
    const id = window.setTimeout(() => {
      const r = montarCenarios(pedido, PARTIDA_FIXA)
      setResposta({ chave, r })
    }, 80)
    return () => window.clearTimeout(id)
  }, [chave, versao]) // eslint-disable-line react-hooks/exhaustive-deps

  const r = resposta?.chave === chave ? resposta.r : null
  // no celular os cenários ficam embaixo das perguntas: quando chegam, a tela desce até eles
  const areaDosCenarios = useRef<HTMLElement>(null)
  const mostrados = useRef('')
  useEffect(() => {
    if (!r || mostrados.current === chave) return
    mostrados.current = chave
    if (window.matchMedia('(max-width: 1000px)').matches) areaDosCenarios.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [r, chave])
  const cenarios = r?.cenarios ?? []
  const roteiroDe = (c: Cenario): Roteiro => ({ ...c.roteiro, id: `simulada-${Date.now()}`, conta })
  const usar = (c: Cenario) => aoDarPlay(roteiroDe(c))
  const aplicar = (s: Sugestao) => {
    setAberto(null)
    if (s.campo === 'entrada') setEntrada(s.valor)
    else if (s.campo === 'minutos') setMinutos(s.valor)
    else { setSinal(s.valor < 0 ? 'prejuizo' : 'lucro'); setValor(Math.abs(s.valor)) }
  }
  const textoDaSugestao = (s: Sugestao) => s.campo === 'entrada' ? `Entrada de ${usd(s.valor)}` : s.campo === 'minutos' ? `${duracao(s.valor)} de sessão` : `${s.valor < 0 ? 'Prejuízo' : 'Lucro'} de ${usd(Math.abs(s.valor))}`
  const cenAberto = aberto !== null ? cenarios[aberto] ?? null : null

  const n = (e: Etapa) => etapas.indexOf(e) + 1
  const futura = (e: Etapa) => atual !== null && etapas.indexOf(e) > etapas.indexOf(atual) && !respondida[e]
  const pergunta = (e: Etapa) => ({ n: n(e), aberta: atual === e, futura: futura(e), aoAlterar: () => { setEditando(e); setAberto(null) } })

  return (
    <div className="est asi ssim-raiz" role="dialog" aria-modal="true" aria-label="Nova simulação">
      <header className="est-topo">
        <div className="est-marca"><i aria-hidden="true" /><div><b>Nova simulação</b><small>Responda, compare os cenários e dê o play</small></div></div>
        <div className="est-topo-acoes">
          <button type="button" className="asi-estudio" onClick={() => aoAbrirEstudio(cenAberto ? roteiroDe(cenAberto) : null)}>
            {cenAberto ? 'Ajuste fino no estúdio' : 'Estúdio completo'}
          </button>
          <button type="button" className="est-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
      </header>

      <div className={`asi-corpo ${cenAberto ? 'com-previa' : ''}`}>
        <aside className="asi-perguntas" aria-label="Perguntas">
          <Pergunta {...pergunta('ia')} titulo={`Qual ${IA} você quer simular?`} resposta={ia && <NomeDoRobo nome={nomeDaIa(ia)} id={ia} />}>
            <div className="asi-ias" role="radiogroup" aria-label={`Qual ${IA}`}>
              {IAS_DA_SESSAO.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={ia === id} className={ia === id ? 'on' : ''}
                  onClick={() => responder(() => { setIa(id); if (!temModos(id, parametrosDa(id))) setModo(null); else if (ia !== id) setModo(null) })}>
                  <span className="asi-ia-nome"><NomeDoRobo nome={nomeDaIa(id)} id={id} /></span>
                  <small>{sobreAIa(id)}</small>
                </button>
              ))}
            </div>
          </Pergunta>

          {comModos && (
            <Pergunta {...pergunta('modo')} titulo="Em qual modo?" resposta={modo && NOME_DO_MODO[modo]}
              dica="O modo muda a escada de recuperação: no agressivo as entradas da recuperação são maiores e a sequência fecha com mais lucro.">
              <div className="asi-modos" role="radiogroup" aria-label="Modo">
                {(['conservador', 'agressivo'] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={modo === m} className={modo === m ? 'on' : ''} onClick={() => responder(() => setModo(m))}>
                    <b>{NOME_DO_MODO[m]}</b>
                    <small>{m === 'conservador' ? 'Recupera a sequência praticamente no zero a zero' : 'Recupera tudo e ainda sobra 20% do que estava sendo recuperado'}</small>
                  </button>
                ))}
              </div>
            </Pergunta>
          )}

          <Pergunta {...pergunta('saldo')} titulo="Quanto tem na conta?" resposta={saldo !== null && <>{usd(saldo)} <em className="asi-tag">{conta === 'demo' ? 'Demo' : 'Real'}</em></>}>
            <Valores rotulo="Saldo" valores={saldoInicial && saldoInicial >= 1 && !SALDOS.includes(saldoInicial) ? [...SALDOS, Math.round(saldoInicial * 100) / 100] : SALDOS} atual={saldo} prefixo="US$" min={1} formato={(v) => `US$ ${v.toLocaleString('pt-BR')}`}
              aoEscolher={(v) => responder(() => { setSaldo(v); if (entrada !== null && entrada > v) setEntrada(null) })} />
            <div className="asi-conta">
              <span>A conta aparece como</span>
              <div className="est-seg" role="radiogroup" aria-label="Conta">
                {(['real', 'demo'] as const).map((c) => <button key={c} type="button" role="radio" aria-checked={conta === c} className={conta === c ? 'on' : ''} onClick={() => setConta(c)}><b>{c === 'real' ? 'Real' : 'Demo'}</b></button>)}
              </div>
            </div>
          </Pergunta>

          <Pergunta {...pergunta('entrada')} titulo="Qual o valor da entrada?" resposta={entrada !== null && usd(entrada)}
            dica={ia ? `É o primeiro degrau da escada da ${nomeDaIa(ia)}: as entradas da recuperação saem dele.` : undefined}>
            <Valores rotulo="Entrada" valores={ENTRADAS.filter((v) => v <= (saldo ?? Infinity))} atual={entrada} prefixo="US$" min={0.35} formato={(v) => usd(v)}
              aoEscolher={(v) => responder(() => setEntrada(v))} />
          </Pergunta>

          <Pergunta {...pergunta('resultado')} titulo="Qual o resultado esperado?" resposta={resultado !== null && <span className={resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(resultado, 'USD')}</span>}
            dica={sinal === 'lucro' ? 'A sessão bate a meta nesse valor e para sozinha.' : 'A sessão bate o stop nesse valor e para sozinha.'}>
            <div className="est-seg asi-sinal" role="radiogroup" aria-label="Lucro ou prejuízo">
              {(['lucro', 'prejuizo'] as const).map((s) => <button key={s} type="button" role="radio" aria-checked={sinal === s} className={`${sinal === s ? 'on' : ''} ${s}`} onClick={() => { setSinal(s); setValor(null) }}><b>{s === 'lucro' ? 'Lucro' : 'Prejuízo'}</b></button>)}
            </div>
            <Valores key={sinal} rotulo="Resultado" valores={(sinal === 'lucro' ? LUCROS : PREJUIZOS.filter((v) => v <= (saldo ?? Infinity)))} atual={valor} prefixo="US$" min={0.5}
              formato={(v) => `${sinal === 'lucro' ? '+' : '−'}US$ ${v.toLocaleString('pt-BR')}`} aoEscolher={(v) => responder(() => setValor(v))} />
          </Pergunta>

          <Pergunta {...pergunta('tempo')} titulo="Quanto tempo de sessão?" resposta={minutos !== null && duracao(minutos)}
            dica={ia && parametrosDa(ia).entrada.lossVirtual ? `A ${nomeDaIa(ia)} analisa antes de entrar: o tempo vira o ritmo da análise, e a sessão dura exatamente isso.` : ia ? `A ${nomeDaIa(ia)} entra direto, uma operação a cada 4 s: o tempo define a quantidade de operações.` : undefined}>
            <Valores rotulo="Tempo" valores={TEMPOS} atual={minutos} sufixo="min" min={1} formato={duracao} aoEscolher={(v) => responder(() => setMinutos(Math.round(v)))} />
          </Pergunta>

          {pedido && sinal === 'lucro' && (
            <div className="asi-extra">
              <span>A maior sequência de perdas vem</span>
              <div className="est-seg" role="radiogroup" aria-label="Quando vem a maior sequência">
                {([['comeco', 'No começo'], ['meio', 'No meio'], ['fim', 'Perto do fim']] as const).map(([m, nome]) => (
                  <button key={m} type="button" role="radio" aria-checked={momento === m} className={momento === m ? 'on' : ''} onClick={() => { setMomento(m); setAberto(null) }}><b>{nome}</b></button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <main ref={areaDosCenarios} className="asi-cenarios" aria-label="Cenários" aria-busy={calculando}>
          {!pedido ? (
            <div className="asi-vazio">
              <div className="asi-vazio-cartas" aria-hidden="true"><i /><i /><i /><i /></div>
              <b>Os cenários aparecem aqui</b>
              <p>Responda as perguntas ao lado. A {IA} monta {sinal === 'lucro' ? 'quatro caminhos para chegar ao resultado' : 'os caminhos até o stop'} no tempo pedido, do mais tranquilo ao mais arriscado, cada um com a prévia na tela de verdade.</p>
            </div>
          ) : calculando ? (
            <div className="asi-vazio calculando" role="status">
              <div className="asi-vazio-cartas" aria-hidden="true"><i /><i /><i /><i /></div>
              <b>Montando os cenários…</b>
              <p>Rodando as regras da {nomeDaIa(pedido.ia)} operação por operação.</p>
            </div>
          ) : !cenarios.length ? (
            <div className="asi-problema" role="alert">
              <b>Esse pedido não fecha</b>
              <p>{r?.problema}</p>
              {!!r?.sugestoes.length && (
                <>
                  <small>Os mais próximos que fecham (toque para usar):</small>
                  <div className="asi-sugestoes">
                    {r.sugestoes.map((s) => <button key={s.campo} type="button" onClick={() => aplicar(s)}>{textoDaSugestao(s)}</button>)}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="asi-cenarios-topo">
                <div>
                  <b>{cenarios.length === 1 ? 'Um cenário fecha' : `${cenarios.length} cenários fecham`} com o pedido</b>
                  <small>{nomeDaIa(pedido.ia)}{comModos ? ` · ${NOME_DO_MODO[pedido.modo]}` : ''} · entrada {usd(pedido.entrada)} · {dinheiroComSinal(pedido.resultado, 'USD')} · {duracao(pedido.minutos)} · saldo {usd(pedido.saldo)}</small>
                </div>
                <button type="button" className="asi-sortear" onClick={() => { setSemente((s) => s + 1); setAberto(null) }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 0 0-14.3-4.3L4 8m16 8-1.7 2.3A8 8 0 0 1 4 14" /></svg>
                  Outras sessões
                </button>
              </div>
              {r?.problema && <p className="asi-nota">{r.problema}</p>}
              {cenAberto ? (
                <div className="asi-com-previa">
                  <div className="asi-abas-cenarios" role="tablist" aria-label="Cenários">
                    {cenarios.map((c, i) => (
                      <button key={i} type="button" role="tab" aria-selected={aberto === i} className={aberto === i ? 'on' : ''} onClick={() => setAberto(i)}>
                        <b>{nomeDoCenario(c, i, cenarios.length, -pedido.resultado)}</b>
                        <small>{c.maiorSequencia} perdas · maior entrada {usd(c.maiorEntrada)}</small>
                      </button>
                    ))}
                    <button type="button" className="asi-voltar" onClick={() => setAberto(null)}>Ver todos</button>
                  </div>
                  <PreviaDaSessao roteiro={cenAberto.roteiro} previa={cenAberto.previa} partida={partida} inicio={t0.current} segundosAte={cenAberto.tempo.marcas} />
                  <div className="asi-barra">
                    <span>{historia(cenAberto, pedido.minutos)}</span>
                    <button type="button" className="est-play" onClick={() => usar(cenAberto)}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>Dar o play com este
                    </button>
                  </div>
                </div>
              ) : (
                <div className={`asi-grade q${cenarios.length}`}>
                  {cenarios.map((c, i) => (
                    <CartaoDoCenario key={`${chave}-${i}`} c={c} i={i} total={cenarios.length} pedido={pedido} aberto={false}
                      aoVer={() => setAberto(i)} aoUsar={() => usar(c)} />
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
