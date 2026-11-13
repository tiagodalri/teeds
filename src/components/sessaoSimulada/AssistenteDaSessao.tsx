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
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MARCA } from '../../marca'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { NomeDoRobo } from '../NomeDoRobo'
import { useCatalogoCompleto } from '../../core/teeds/catalogoRobos'
import { NOME_DO_MODO, temModos, type Modo } from '../../core/deriv/strategies'
import {
  definirRegrasDaSessao, digitosQueGanham, estrategiaDa, IAS_DA_SESSAO, nomeDaIa, parametrosDa,
  type Momento, type PontoDePartida, type Roteiro,
} from '../../core/teeds/sessaoSimulada'
import { cenarioDoNivel, diagnosticoDoPedido, esperaDoLossVirtual, niveisDeRisco, type Cenario, type NivelDeRisco, type Pedido, type Sugestao } from '../../core/teeds/cenariosDaSessao'
import { PreviaDaSessao } from './PreviaDaSessao'
import { CalibradorDaSessao, type Ponto } from './CalibradorDaSessao'
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

type Etapa = 'ia' | 'modo' | 'lv' | 'saldo' | 'entrada' | 'resultado' | 'tempo'
const LOSS_VIRTUAL_MAXIMO = 12
const esperaEmTexto = (s: number) => (s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace('.', ',')} h`)
const lvEmTexto = (n: number) => (n === 0 ? 'Sem loss virtual' : `${n} ${n === 1 ? 'dígito' : 'dígitos'}`)

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
  /** Loss virtual escolhido (0 = sem). Só nas I.A. que entram por loss virtual, como no preparo de verdade. */
  const [lv, setLv] = useState<number | null>(null)
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
  /** Em tela estreita, a prévia fica embaixo do termômetro e abre por este botão (larga, fica sempre ao lado). */
  const [previa, setPrevia] = useState(false)
  /** Com o termômetro na tela, as perguntas recolhem numa faixa de resumo (a prévia ao vivo fica ao lado dele). */
  const [perguntasAbertas, setPerguntasAbertas] = useState(true)
  /** Tela larga: a prévia ao vivo fica sempre ao lado do termômetro. */
  const [largo, setLargo] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 1251px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1251px)')
    const ouvir = () => setLargo(mq.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])
  const [partida, setPartida] = useState<PontoDePartida>(PARTIDA_FIXA)
  const t0 = useRef(Math.floor(Date.now() / 1000) * 1000)
  useEffect(() => { let vivo = true; void pontoDePartida().then((p) => { if (vivo) setPartida(p) }); return () => { vivo = false } }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (previa) setPrevia(false); else aoFechar() } }
    window.addEventListener('keydown', esc)
    document.body.classList.add('rel-painel-aberto', 'est-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('rel-painel-aberto', 'est-aberto') }
  }, [aoFechar, previa])

  const comModos = ia ? temModos(ia, parametrosDa(ia)) : false
  const lvDoPainel = ia ? parametrosDa(ia).entrada.lossVirtual ?? 0 : 0
  const comLV = !!ia && !!estrategiaDa(ia).lossVirtualAjustavel && lvDoPainel > 0
  const resultado = valor === null ? null : sinal === 'prejuizo' ? -valor : valor
  // a ordem das perguntas; a primeira sem resposta é a aberta
  const etapas: Etapa[] = ['ia', ...(comModos ? ['modo' as const] : []), ...(comLV ? ['lv' as const] : []), 'saldo', 'entrada', 'resultado', 'tempo']
  const respondida: Record<Etapa, boolean> = {
    ia: !!ia, modo: !comModos || modo !== null, lv: !comLV || lv !== null, saldo: saldo !== null && saldo > 0, entrada: entrada !== null,
    resultado: resultado !== null && resultado !== 0, tempo: minutos !== null,
  }
  const atual = editando ?? etapas.find((e) => !respondida[e]) ?? null
  const responder = (f: () => void) => { f(); setEditando(null); setPrevia(false) }

  const pedido: Pedido | null = useMemo(() => (ia && saldo && entrada !== null && resultado && minutos && (!comModos || modo) && (!comLV || lv !== null)
    ? { ia, modo: comModos ? modo! : 'conservador', saldo, conta, entrada, resultado, minutos, momento, semente, lossVirtual: comLV ? lv : null } : null),
  [ia, modo, lv, saldo, conta, entrada, resultado, minutos, momento, semente, comModos, comLV])
  const chave = pedido ? JSON.stringify(pedido) : ''

  /*
    O termômetro: todos os níveis de risco que fecham o pedido. A lista sai na hora (a conta dos ciclos);
    a sessão de cada nível é montada uma por vez, sem travar a tela, dos pontos espalhados para os de
    dentro: o termômetro já aparece com os extremos e vai ganhando marcas.
  */
  const [calibragem, setCalibragem] = useState<{ chave: string; pontos: Ponto[]; feitos: number; total: number; fim: boolean; diag: { problema: string; sugestoes: Sugestao[] } | null }>({ chave: '', pontos: [], feitos: 0, total: 0, fim: true, diag: null })
  const [escolhido, setEscolhido] = useState<number | null>(null)
  useEffect(() => {
    if (!pedido) return
    let vivo = true
    let relogio = 0
    const niveis = niveisDeRisco(pedido)
    // os espalhados primeiro (pontas e meio), depois o que falta
    const ordem: NivelDeRisco[] = []
    const marcar = (i: number) => { const x = niveis[i]; if (x && !ordem.includes(x)) ordem.push(x) }
    for (const t of [0.5, 0, 1, 0.25, 0.75]) marcar(Math.round(t * (niveis.length - 1)))
    niveis.forEach((_, i) => marcar(i))
    let pontos: Ponto[] = []
    let feitos = 0
    setEscolhido(null)
    setCalibragem({ chave, pontos: [], feitos: 0, total: ordem.length, fim: false, diag: null })
    const passo = () => {
      if (!vivo) return
      const nivel = ordem[feitos]
      if (!nivel) {
        setCalibragem({ chave, pontos, feitos, total: ordem.length, fim: true, diag: pontos.length ? null : diagnosticoDoPedido(pedido) })
        return
      }
      const cenario = cenarioDoNivel(pedido, nivel, PARTIDA_FIXA)
      feitos++
      // uma variação (marca fina) só entra se mexer no termômetro de verdade: o pior momento muda pelo menos 5%
      const repetida = cenario && nivel.ordem && pontos.some((x) => x.cenario.maiorSequencia === cenario.maiorSequencia
        && Math.abs(x.cenario.piorMomento - cenario.piorMomento) < Math.max(pedido.entrada * 1.5, Math.abs(x.cenario.piorMomento) * 0.05))
      // do mais tranquilo ao mais arriscado: a maior sequência e, dentro dela, o quanto do saldo a sessão exige
      const ordenar = (a: Ponto, b: Ponto) => pedido.resultado < 0 ? a.nivel.chave - b.nivel.chave
        : a.cenario.maiorSequencia - b.cenario.maiorSequencia || a.cenario.saldoMinimo - b.cenario.saldoMinimo || a.nivel.chave - b.nivel.chave
      if (cenario && !repetida) pontos = [...pontos, { nivel, cenario }].sort(ordenar)
      setCalibragem({ chave, pontos, feitos, total: ordem.length, fim: false, diag: null })
      relogio = window.setTimeout(passo, 12)
    }
    relogio = window.setTimeout(passo, 60)
    return () => { vivo = false; window.clearTimeout(relogio) }
  }, [chave, versao]) // eslint-disable-line react-hooks/exhaustive-deps

  const daVez = calibragem.chave === chave
  const pontos = daVez ? calibragem.pontos : []
  const calculando = !!pedido && (!daVez || !calibragem.fim)
  const diag = daVez ? calibragem.diag : null
  // no celular o termômetro fica embaixo das perguntas: quando aparece, a tela desce até ele
  const areaDosCenarios = useRef<HTMLElement>(null)
  const mostrados = useRef('')
  useEffect(() => {
    if (!pontos.length || mostrados.current === chave) return
    mostrados.current = chave
    setPerguntasAbertas(false)
    if (window.matchMedia('(max-width: 1000px)').matches) areaDosCenarios.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [pontos.length, chave])
  const pontoEscolhido = pontos.find((x) => x.nivel.chave === escolhido) ?? pontos[Math.floor((pontos.length - 1) / 2)] ?? null
  // a prévia acompanha a bolinha sem travar o arrasto
  const pontoDaPrevia = useDeferredValue(pontoEscolhido)
  const roteiroDe = (c: Cenario): Roteiro => ({ ...c.roteiro, id: `simulada-${Date.now()}`, conta })
  const usar = (c: Cenario) => aoDarPlay(roteiroDe(c))
  const aplicar = (s: Sugestao) => {
    setPrevia(false)
    if (s.campo === 'entrada') setEntrada(s.valor)
    else if (s.campo === 'minutos') setMinutos(s.valor)
    else { setSinal(s.valor < 0 ? 'prejuizo' : 'lucro'); setValor(Math.abs(s.valor)) }
  }
  const textoDaSugestao = (s: Sugestao) => s.campo === 'entrada' ? `Entrada de ${usd(s.valor)}` : s.campo === 'minutos' ? `${duracao(s.valor)} de sessão` : `${s.valor < 0 ? 'Prejuízo' : 'Lucro'} de ${usd(Math.abs(s.valor))}`
  const cenAberto = pontoEscolhido?.cenario ?? null

  const n = (e: Etapa) => etapas.indexOf(e) + 1
  const futura = (e: Etapa) => atual !== null && etapas.indexOf(e) > etapas.indexOf(atual) && !respondida[e]
  const pergunta = (e: Etapa) => ({ n: n(e), aberta: atual === e, futura: futura(e), aoAlterar: () => { setEditando(e); setPrevia(false) } })
  // o termômetro com a prévia ao lado ocupa a tela; as perguntas viram a faixa de resumo
  const imersivo = !!pedido && pontos.length > 0 && !perguntasAbertas && !editando
  const resumo: Array<[string, ReactNode]> = pedido ? [
    [IA, <NomeDoRobo key="ia" nome={nomeDaIa(pedido.ia)} id={pedido.ia} />],
    ...(comModos ? [['Modo', NOME_DO_MODO[pedido.modo]] as [string, ReactNode]] : []),
    ...(comLV && pedido.lossVirtual != null ? [['Loss virtual', pedido.lossVirtual === 0 ? 'Sem' : String(pedido.lossVirtual)] as [string, ReactNode]] : []),
    ['Saldo', <>{usd(pedido.saldo)} <em className="asi-tag">{conta === 'demo' ? 'Demo' : 'Real'}</em></>],
    ['Entrada', usd(pedido.entrada)],
    ['Resultado', <span key="r" className={pedido.resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(pedido.resultado, 'USD')}</span>],
    ['Tempo', duracao(pedido.minutos)],
  ] : []

  return (
    <div className="est asi ssim-raiz" role="dialog" aria-modal="true" aria-label="Nova simulação">
      <header className="est-topo">
        <div className="est-marca"><i aria-hidden="true" /><div><b>Nova simulação</b><small>Responda, calibre o risco e dê o play</small></div></div>
        <div className="est-topo-acoes">
          <button type="button" className="asi-estudio" onClick={() => aoAbrirEstudio(cenAberto ? roteiroDe(cenAberto) : null)}>
            {cenAberto ? 'Ajuste fino no estúdio' : 'Estúdio completo'}
          </button>
          <button type="button" className="est-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
      </header>

      <div className={`asi-corpo ${previa && cenAberto ? 'com-previa' : ''} ${imersivo ? 'imersivo' : ''}`}>
        <aside className="asi-perguntas" aria-label="Perguntas">
          {!!pedido && pontos.length > 0 && (
            <button type="button" className="asi-voltar-termo" onClick={() => { setEditando(null); setPerguntasAbertas(false) }}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>Voltar ao termômetro
            </button>
          )}
          <Pergunta {...pergunta('ia')} titulo={`Qual ${IA} você quer simular?`} resposta={ia && <NomeDoRobo nome={nomeDaIa(ia)} id={ia} />}>
            <div className="asi-ias" role="radiogroup" aria-label={`Qual ${IA}`}>
              {IAS_DA_SESSAO.map((id) => (
                <button key={id} type="button" role="radio" aria-checked={ia === id} className={ia === id ? 'on' : ''}
                  onClick={() => responder(() => { setIa(id); if (ia !== id) { setModo(null); setLv(null) } })}>
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

          {comLV && ia && (
            <Pergunta {...pergunta('lv')} titulo="Com qual loss virtual?"
              resposta={lv !== null && <>{lvEmTexto(lv)}{lv === lvDoPainel && <em className="asi-tag">Padrão</em>}</>}
              dica={<>Quantos dígitos seguidos que teriam perdido a {nomeDaIa(ia)} espera antes de cada entrada nova. Quanto maior, mais ela espera e menos operações cabem no tempo. Não muda o acerto nem a escada.</>}>
              <div className="asi-lv" role="radiogroup" aria-label="Loss virtual">
                {Array.from({ length: LOSS_VIRTUAL_MAXIMO + 1 }, (_, n) => (
                  <button key={n} type="button" role="radio" aria-checked={lv === n} className={`${lv === n ? 'on' : ''} ${n === lvDoPainel ? 'padrao' : ''}`} onClick={() => responder(() => setLv(n))}>
                    <b>{n === 0 ? 'Sem' : n}</b>
                    <small>{n === 0 ? 'direto' : `~${esperaEmTexto(esperaDoLossVirtual(ia, n))}`}</small>
                  </button>
                ))}
              </div>
              <small className="asi-dica">Embaixo de cada número, a espera média por entrada nova no mercado. O padrão do painel é {lvDoPainel}.</small>
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
            dica={ia && (comLV ? (lv ?? lvDoPainel) : lvDoPainel) > 0 ? `A ${nomeDaIa(ia)} analisa antes de entrar: o tempo e o loss virtual definem quantas operações cabem, e a sessão dura exatamente isso.` : ia ? `A ${nomeDaIa(ia)} entra direto, uma operação a cada 4 s: o tempo define a quantidade de operações.` : undefined}>
            <Valores rotulo="Tempo" valores={TEMPOS} atual={minutos} sufixo="min" min={1} formato={duracao} aoEscolher={(v) => responder(() => setMinutos(Math.round(v)))} />
          </Pergunta>

        </aside>

        <main ref={areaDosCenarios} className="asi-cenarios" aria-label="Termômetro do risco" aria-busy={calculando}>
          {!pedido ? (
            <div className="asi-vazio">
              <div className="asi-vazio-cartas" aria-hidden="true"><i /><i /><i /><i /></div>
              <b>O termômetro do risco aparece aqui</b>
              <p>Responda as perguntas ao lado. A {IA} monta todas as sessões que {sinal === 'lucro' ? 'chegam ao resultado' : 'chegam ao stop'} no tempo pedido, da mais tranquila à mais arriscada, e você calibra arrastando.</p>
            </div>
          ) : !pontos.length && calculando ? (
            <div className="asi-vazio calculando" role="status">
              <div className="asi-vazio-cartas" aria-hidden="true"><i /><i /><i /><i /></div>
              <b>Calibrando o termômetro…</b>
              <p>Rodando as regras da {nomeDaIa(pedido.ia)} operação por operação.</p>
            </div>
          ) : !pontos.length ? (
            <div className="asi-problema" role="alert">
              <b>Esse pedido não fecha</b>
              <p>{diag?.problema}</p>
              {!!diag?.sugestoes.length && (
                <>
                  <small>Os mais próximos que fecham (toque para usar):</small>
                  <div className="asi-sugestoes">
                    {diag.sugestoes.map((s) => <button key={s.campo} type="button" onClick={() => aplicar(s)}>{textoDaSugestao(s)}</button>)}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="asi-cenarios-topo">
                <dl className="asi-resumo" aria-label="O pedido">
                  {resumo.map(([rot, v]) => <div key={rot}><dt>{rot}</dt><dd>{v}</dd></div>)}
                </dl>
                {imersivo && <button type="button" className="asi-sortear asi-alterar" onClick={() => setPerguntasAbertas(true)}>Alterar respostas</button>}
                <button type="button" className="asi-sortear" onClick={() => { setSemente((s) => s + 1); setPrevia(false) }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4v6h6M20 20v-6h-6" /><path d="M20 10a8 8 0 0 0-14.3-4.3L4 8m16 8-1.7 2.3A8 8 0 0 1 4 14" /></svg>
                  Outras sessões
                </button>
              </div>
              {(() => {
                const aoLado = largo && imersivo
                const cabine = pontoDaPrevia && <PreviaDaSessao comFoco roteiro={pontoDaPrevia.cenario.roteiro} previa={pontoDaPrevia.cenario.previa} partida={partida} inicio={t0.current} segundosAte={pontoDaPrevia.cenario.tempo.marcas} />
                return (
                  <div className={`cal-dupla ${aoLado ? 'ao-lado' : ''}`}>
                    <CalibradorDaSessao pedido={pedido} pontos={pontos} calculando={calculando} feitos={calibragem.feitos} total={calibragem.total}
                      escolhido={pontoEscolhido?.nivel.chave ?? null} aoEscolher={setEscolhido}
                      previaAberta={previa} aoAlternarPrevia={() => setPrevia((x) => !x)} aoUsar={usar}
                      aoMudarMomento={(m) => { setMomento(m); setPrevia(false) }}>
                      {!aoLado && previa && <div className="cal-previa embaixo">{cabine}</div>}
                    </CalibradorDaSessao>
                    {aoLado && (
                      <aside className="cal-previa" aria-label="Prévia ao vivo">
                        <div className="cal-previa-topo">
                          <b>Prévia ao vivo</b>
                          <small>A cabine de verdade, acompanhando a bolinha</small>
                        </div>
                        {cabine}
                      </aside>
                    )}
                  </div>
                )
              })()}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
