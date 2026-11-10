/**
 * Um quadro da Multitela: o gráfico e a boleta de UM ativo, independentes dos
 * outros quadros. A cotação, os limites de duração e o preço dos botões são
 * os mesmos hooks do Operar; a compra passa pelo App (comprar), que marca a
 * operação como manual, toca o som da entrada e grava em operacoes_manuais —
 * exatamente como a boleta de sempre.
 *
 * Três jeitos de aparecer:
 * - coluna: 1 ou 2 quadros no computador, a boleta inteira à direita (a de sempre);
 * - faixa: 4 ou 6 quadros (e 2 por vez no celular), a boleta numa faixa embaixo;
 * - celular: um por vez no celular, a boleta inteira embaixo do gráfico.
 */
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useCandleSeries, useLimitesDuracao, useLiveTick, useProposal } from '../../../hooks/useMarket'
import type { ActiveSymbol, Granularity } from '../../../core/deriv/types'
import type { OpenContract } from '../../../core/deriv/trading'
import type { TeedsSocket } from '../../../core/deriv/client'
import type { SessaoTeeds } from '../../../core/teeds/conta'
import type { ContractMarker } from '../../PriceChart'
import { formatPrice } from '../../../core/chart/scales'
import { nomeDoAtivo } from '../../../core/deriv/market'
import { DERIV, ehSintetico } from '../../../core/deriv/config'
import { dinheiro, dinheiroComSinal, simboloMoeda } from '../../../core/dinheiro'
import { pedeDeposito, traduzirErro } from '../../../core/deriv/erros'
import { IconeAtivo } from '../../IconeAtivo'
import { BotaoCompra, MostradorDuracao, MostradorValor, ResumoDaCompra, VALOR_MINIMO } from '../Boleta'
import { MARCA } from '../../../marca'

const GraficoPro = lazy(() => import('../../grafico/GraficoPro').then((m) => ({ default: m.GraficoPro })))

import type { Unidade } from './estado'
export type Variante = 'coluna' | 'faixa' | 'celular'

/** O que a conta (no App) oferece a todos os quadros. */
export interface ContaDaMultitela {
  pronta: boolean
  conectando: boolean
  aoConectar: () => void
  /** Por que a conta não compra agora (desconectada, reconectando…); null = pode. */
  motivoDaConta: string | null
  /** Conta real de verdade: o primeiro clique arma, o segundo compra. */
  real: boolean
  /** Rótulos trocados (exercícios internos): confirma sem dizer "dinheiro real". */
  semDizerReal: boolean
  /** O tipo da conta como a tela mostra (com os rótulos já trocados). */
  tipoNaTela: 'real' | 'demo' | null
  saldo: number | null
  moeda: string
  socket: TeedsSocket | null
  /** As manuais desta conta (todos os ativos), abertas e recém-encerradas. */
  contratos: OpenContract[]
  /** As encerradas que ficam no gráfico por 2 minutos. */
  encerradas: OpenContract[]
  comprar: (simbolo: string, tipo: 'CALL' | 'PUT', valor: number, duracao: number, unidade: Unidade) => Promise<{ buyPrice: number; payout: number }>
  encerrar: (contractId: number) => void
  vendendo: number | null
  /** Aviso da conta que não é de um quadro (ex.: compra perdida que foi encontrada). */
  aviso: { tipo: 'ok' | 'erro'; texto: string } | null
}

export interface AtalhosDoQuadro { comprar: (tipo: 'CALL' | 'PUT') => void; passo: (sobe: boolean) => void }

export const NOME_DO_MERCADO: Record<string, string> = { synthetic_index: 'Sintéticos', forex: 'Forex', commodities: 'Metais' }
const TEMPOS: Array<{ rotulo: string; valor: Granularity }> = [
  { rotulo: '1m', valor: 60 }, { rotulo: '5m', valor: 300 }, { rotulo: '15m', valor: 900 }, { rotulo: '1h', valor: 3600 },
]
const DEGRAUS = [0.35, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 50, 75, 100, 150, 200, 250, 500, 750, 1000, 2000, 5000]
export const proximoValor = (v: number, sobe: boolean) => sobe
  ? DEGRAUS.find((d) => d > v + 1e-9) ?? v
  : [...DEGRAUS].reverse().find((d) => d < v - 1e-9) ?? VALOR_MINIMO
// a mesma leitura da boleta: vírgula decimal, ou ponto quando não é milhar
const lerTexto = (t: string) => Number(t.includes(',') || /^[1-9]\d{0,2}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t)
const FINAIS = /^(won|lost|sold|cancelled)$/
const NOME_UNIDADE: Record<Unidade, [string, string]> = { t: ['cotação', 'cotações'], s: ['seg', 'seg'], m: ['min', 'min'] }

export function Quadro(p: {
  numero: number
  simbolo: string
  ativos: ActiveSymbol[]
  conta: ContaDaMultitela
  sessao: SessaoTeeds | null
  stake: number
  aoMudarStake: (v: number) => void
  tempo: Granularity
  aoMudarTempo: (g: Granularity) => void
  duracao: number
  unidade: Unidade
  aoMudarDuracao: (d: number, u: Unidade) => void
  variante: Variante
  emFoco: boolean
  aoFocar: () => void
  /** Em que quadro (número) já está este ativo; null = em nenhum outro. */
  ondeEsta: (simbolo: string) => number | null
  aoEscolherAtivo: (simbolo: string) => void
  ampliado?: boolean
  aoAmpliar?: () => void
  registrar: (api: AtalhosDoQuadro | null) => void
  semNumero?: boolean
}) {
  const { simbolo, conta, stake, variante } = p
  const ativo = p.ativos.find((a) => a.symbol === simbolo) ?? null
  // a lista de ativos ainda chegando: o quadro diz isso em vez de ficar sem nome
  const nome = ativo ? nomeDoAtivo(ativo.name) : simbolo || 'Carregando ativo…'
  const sintetico = ehSintetico(ativo)
  const aberto = !ativo || (ativo.isOpen && !ativo.isSuspended)
  const moeda = conta.moeda

  const { candles, loading } = useCandleSeries(simbolo, p.tempo)
  const { tick, direction } = useLiveTick(simbolo)
  const limites = useLimitesDuracao(simbolo)
  const pipSize = ativo?.pipSize ?? tick?.pipSize ?? 2
  const preco = tick?.quote ?? (candles.length ? candles[candles.length - 1].close : null)

  // duração: obedece ao que a Deriv aceita neste ativo, na unidade escolhida (igual ao Operar)
  // guardadas na Multitela (estado.ts): o quadro que sai da tela e volta não perde a duração
  const { duracao, unidade } = p
  const setDuracao = (v: number | ((d: number) => number)) => {
    const nova = typeof v === 'function' ? v(p.duracao) : v
    if (nova !== p.duracao) p.aoMudarDuracao(nova, p.unidade)
  }
  const faixa = unidade === 't' ? limites.ticks : unidade === 's' ? limites.segundos : limites.minutos
  const dentroDaFaixa = (d: number) => faixa ? Math.min(faixa[1], Math.max(faixa[0], Math.round(d) || faixa[0])) : Math.max(1, Math.round(d) || 1)
  useEffect(() => { setDuracao(dentroDaFaixa) }, [faixa]) // eslint-disable-line react-hooks/exhaustive-deps
  const trocarUnidade = (u: Unidade) => p.aoMudarDuracao(u === 't' ? 5 : u === 's' ? 60 : 5, u)
  useEffect(() => {
    if (unidade === 't' ? limites.ticks : unidade === 's' ? limites.segundos : limites.minutos) return
    const outra = limites.minutos ? 'm' : limites.segundos ? 's' : limites.ticks ? 't' : null
    if (outra) trocarUnidade(outra)
  }, [limites]) // eslint-disable-line react-hooks/exhaustive-deps
  const disponiveis = { t: !!limites.ticks, s: !!limites.segundos, m: !!limites.minutos }

  const call = useProposal({ symbol: simbolo, contractType: 'CALL', amount: stake, duration: duracao, durationUnit: unidade, socket: conta.socket, currency: moeda })
  const put = useProposal({ symbol: simbolo, contractType: 'PUT', amount: stake, duration: duracao, durationUnit: unidade, socket: conta.socket, currency: moeda })

  // o valor enquanto digita (dá para apagar e escrever)
  const [texto, setTexto] = useState<string | null>(null)
  const [comprando, setComprando] = useState<'CALL' | 'PUT' | null>(null)
  const [confirmar, setConfirmar] = useState<'CALL' | 'PUT' | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  // conta real: a confirmação desarma ao mudar qualquer coisa e depois de 8 s parada
  useEffect(() => { setConfirmar(null) }, [stake, duracao, unidade, simbolo])
  useEffect(() => { if (!confirmar) return; const t = window.setTimeout(() => setConfirmar(null), 8_000); return () => window.clearTimeout(t) }, [confirmar])
  useEffect(() => { if (!aviso || aviso.tipo !== 'ok') return; const t = window.setTimeout(() => setAviso(null), 6_000); return () => window.clearTimeout(t) }, [aviso])
  useEffect(() => { setAviso(null); setTexto(null) }, [simbolo])

  const acimaDoSaldo = conta.saldo !== null && stake > conta.saldo
  const motivoBloqueio = conta.motivoDaConta ?? (!ativo ? 'Escolha um ativo' : !aberto ? 'Mercado fechado agora' : acimaDoSaldo ? 'Saldo insuficiente' : null)
  const podeOperar = motivoBloqueio === null

  async function comprar(tipo: 'CALL' | 'PUT') {
    if (texto !== null && lerTexto(texto) !== stake) { setAviso({ tipo: 'erro', texto: `Digite um valor a partir de ${dinheiro(VALOR_MINIMO, moeda)}.` }); return }
    if (!podeOperar || comprando) return
    if (conta.real && confirmar !== tipo) { setConfirmar(tipo); return }
    setConfirmar(null); setComprando(tipo); setAviso(null)
    try {
      const r = await conta.comprar(simbolo, tipo, stake, duracao, unidade)
      setAviso({ tipo: 'ok', texto: `Entrada feita: ${dinheiro(r.buyPrice, moeda)} · se ganhar, recebe ${dinheiro(r.payout, moeda)}.` })
    } catch (e) {
      setAviso({ tipo: 'erro', texto: (e as Error).message })
    } finally { setComprando(null) }
  }

  // os atalhos do teclado agem no quadro em foco (a grade chama por aqui)
  const atalhos = useRef<AtalhosDoQuadro>({ comprar: () => undefined, passo: () => undefined })
  atalhos.current = { comprar: (t) => { void comprar(t) }, passo: (sobe) => { setTexto(null); p.aoMudarStake(proximoValor(stake, sobe)) } }
  useEffect(() => {
    p.registrar({ comprar: (t) => atalhos.current.comprar(t), passo: (s) => atalhos.current.passo(s) })
    return () => p.registrar(null)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // as operações deste ativo: no gráfico (entrada, prazo, resultado) e na pílula do cabeçalho
  const doAtivo = useMemo(() => {
    const vivas = conta.contratos.filter((c) => c.symbol === simbolo)
    const guardadas = conta.encerradas.filter((c) => c.symbol === simbolo && !vivas.some((v) => v.contractId === c.contractId))
    return [...vivas, ...guardadas]
  }, [conta.contratos, conta.encerradas, simbolo])
  const chave = doAtivo.map((c) => `${c.contractId}:${c.entrySpot}:${c.exitSpot}:${c.status}:${c.expiryTime}:${c.profit.toFixed(2)}`).join('|')
  const marcadores: ContractMarker[] = useMemo(() => doAtivo.map((c) => ({
    id: c.contractId, type: c.contractType, entryEpoch: c.startTime, entryPrice: c.entrySpot, expiryEpoch: c.expiryTime,
    profit: c.profit, status: c.status, exitPrice: c.exitSpot ?? null,
  })), [chave]) // eslint-disable-line react-hooks/exhaustive-deps
  const abertas = doAtivo.filter((c) => !FINAIS.test(c.status))
  const resultado = abertas.reduce((t, c) => t + c.profit, 0)

  const [menu, setMenu] = useState(false)

  const botoes = (
    <div className="bl-comprar">
      <BotaoCompra tipo="sobe" payout={call.payout} stake={stake} moeda={moeda} carregando={call.loading} erro={call.error ? traduzirErro(call.error) : null}
        podeOperar={podeOperar} motivoBloqueio={motivoBloqueio} comprando={comprando === 'CALL'} confirmando={confirmar === 'CALL'}
        semDizerReal={conta.semDizerReal} aoComprar={() => void comprar('CALL')} />
      <BotaoCompra tipo="desce" payout={put.payout} stake={stake} moeda={moeda} carregando={put.loading} erro={put.error ? traduzirErro(put.error) : null}
        podeOperar={podeOperar} motivoBloqueio={motivoBloqueio} comprando={comprando === 'PUT'} confirmando={confirmar === 'PUT'}
        semDizerReal={conta.semDizerReal} aoComprar={() => void comprar('PUT')} />
    </div>
  )
  const linhaDoAviso = aviso && (
    <p role="status" aria-live="polite" className={`mtl-aviso ${aviso.tipo === 'ok' ? 'ok' : 'erro'}`}>
      {aviso.texto}{pedeDeposito(aviso.texto) && <> <a href={DERIV.deposito} target="_blank" rel="noopener noreferrer">Depositar na Deriv</a></>}
    </p>
  )

  const boletaInteira = (
    <section className="bl mtl-bl" aria-label={`Boleta de ${nome}`}>
      <div className="bl-corpo">
        <MostradorValor stake={stake} texto={texto} moeda={moeda} alerta={acimaDoSaldo} saldo={conta.saldo} conta={conta.tipoNaTela}
          aoMudarTexto={(t) => { setTexto(t); const n = lerTexto(t); if (n >= VALOR_MINIMO) p.aoMudarStake(n) }}
          aoMudar={(v) => { setTexto(null); p.aoMudarStake(v) }}
          aoSair={() => { if (texto !== null) { const n = lerTexto(texto); p.aoMudarStake(Math.max(VALOR_MINIMO, Number.isFinite(n) ? Math.round(n * 100) / 100 : VALOR_MINIMO)) } setTexto(null) }} />
        {acimaDoSaldo && conta.saldo !== null && (
          <p className="bl-alerta">Valor maior que o seu saldo ({dinheiro(conta.saldo, moeda)}). Diminua o valor ou <a href={DERIV.deposito} target="_blank" rel="noopener noreferrer">deposite na Deriv</a>.</p>
        )}
        <i className="bl-sep" aria-hidden="true" />
        <MostradorDuracao duracao={duracao} unidade={unidade} faixa={faixa} disponiveis={disponiveis}
          aoMudar={setDuracao} aoTrocarUnidade={trocarUnidade} aoSair={() => setDuracao(dentroDaFaixa)} />
        {botoes}
        <ResumoDaCompra payouts={[call.payout, put.payout]} stake={stake} moeda={moeda} duracao={duracao} unidade={unidade} />
        {linhaDoAviso}
      </div>
    </section>
  )

  // a faixa: valor e duração compactos, e os mesmos botões de compra
  const [min, max] = faixa ?? [1, 1440]
  const passoDur = unidade === 's' ? 5 : 1
  const unidades = (['t', 's', 'm'] as const).filter((u) => disponiveis[u])
  const visto = texto ?? stake.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
  const boletaEmFaixa = (
    <section className="mtl-faixa" aria-label={`Boleta de ${nome}`}>
      <div className={`mtl-campo${acimaDoSaldo ? ' alerta' : ''}`} role="group" aria-label="Valor da entrada" title="Valor da entrada">
        <button type="button" aria-label="Diminuir o valor" disabled={stake <= VALOR_MINIMO} onClick={() => { setTexto(null); p.aoMudarStake(proximoValor(stake, false)) }}>−</button>
        <label><small>{simboloMoeda(moeda)}</small>
          <input type="text" inputMode="decimal" autoComplete="off" aria-label="Valor da entrada" value={visto} style={{ width: `${Math.max(3, visto.length) + 0.4}ch` }}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => { const t = e.target.value.replace(/[^\d.,]/g, ''); setTexto(t); const n = lerTexto(t); if (n >= VALOR_MINIMO) p.aoMudarStake(n) }}
            onBlur={() => { if (texto !== null) { const n = lerTexto(texto); p.aoMudarStake(Math.max(VALOR_MINIMO, Number.isFinite(n) ? Math.round(n * 100) / 100 : VALOR_MINIMO)) } setTexto(null) }} />
        </label>
        <button type="button" aria-label="Aumentar o valor" onClick={() => { setTexto(null); p.aoMudarStake(proximoValor(stake, true)) }}>+</button>
      </div>
      <div className="mtl-campo" role="group" aria-label="Duração" title="Duração">
        <button type="button" aria-label="Diminuir a duração" disabled={duracao <= min} onClick={() => setDuracao(Math.max(min, duracao - passoDur))}>−</button>
        <span className="mtl-dur">
          <b>{duracao}</b>
          <button type="button" className="mtl-unid" disabled={unidades.length < 2}
            title={unidades.length < 2 ? 'Este ativo só aceita esta unidade' : 'Trocar a unidade (cotações, segundos ou minutos)'}
            onClick={() => trocarUnidade(unidades[(unidades.indexOf(unidade) + 1) % unidades.length])}>{NOME_UNIDADE[unidade][duracao === 1 ? 0 : 1]}</button>
        </span>
        <button type="button" aria-label="Aumentar a duração" disabled={duracao >= max} onClick={() => setDuracao(Math.min(max, duracao + passoDur))}>+</button>
      </div>
      {botoes}
    </section>
  )

  const subtitulo = !ativo ? '' : !aberto ? 'Fechado agora' : sintetico ? 'Aberto 24 h' : 'Mercado aberto'
  return (
    <article className={`mtl-q mtl-v-${variante}${p.emFoco ? ' mtl-em-foco' : ''}${abertas.length ? (resultado >= 0 ? ' mtl-ganhando' : ' mtl-perdendo') : ''}`}
      onPointerDownCapture={p.aoFocar} onFocusCapture={p.aoFocar} aria-label={`Quadro ${p.numero}: ${nome}`}>
      <header className="mtl-cab">
        {!p.semNumero && <span className="mtl-num" title={`Atalho: tecla ${p.numero}`} aria-hidden="true">{p.numero}</span>}
        <button type="button" className="mtl-ativo" onClick={() => setMenu((m) => !m)} aria-haspopup="dialog" aria-expanded={menu} aria-label={`Ativo: ${nome}. Trocar ativo`}>
          {MARCA.iconesDeAtivos && <IconeAtivo simbolo={simbolo} tamanho={28} />}
          <span className="mtl-nome"><b>{nome}</b>{subtitulo && <small>{subtitulo}</small>}</span>
          <i aria-hidden="true">⌄</i>
        </button>
        <span className={`mtl-preco ${direction === 'up' ? 'sobe' : direction === 'down' ? 'cai' : ''}`} aria-hidden="true">{preco !== null ? formatPrice(preco, pipSize) : '—'}</span>
        {abertas.length > 0 && (
          <span className={`mtl-res ${resultado >= 0 ? 'ganho' : 'perda'}`} title={`${abertas.length} ${abertas.length === 1 ? 'posição aberta' : 'posições abertas'} neste ativo`}>
            {dinheiroComSinal(resultado, moeda)}{abertas.length > 1 && <small>×{abertas.length}</small>}
          </span>
        )}
        <span className="mtl-acoes">
          <select className="mtl-tempo" value={p.tempo} aria-label="Tempo de cada vela" title="Tempo de cada vela" onChange={(e) => p.aoMudarTempo(Number(e.target.value) as Granularity)}>
            {TEMPOS.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
          {p.aoAmpliar && (
            <button type="button" className="mtl-ampliar" onClick={p.aoAmpliar} title={p.ampliado ? 'Voltar para a grade (Esc)' : 'Ampliar este quadro'} aria-label={p.ampliado ? 'Voltar para a grade' : 'Ampliar este quadro'}>
              {p.ampliado
                ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.5 6.5h-4v-4M2.5 9.5h4v4M9.5 6.5 14 2M6.5 9.5 2 14" /></svg>
                : <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M9.5 2.5h4v4M6.5 13.5h-4v-4M13.5 2.5 9 7M2.5 13.5 7 9" /></svg>}
            </button>
          )}
        </span>
        {menu && <MenuDeAtivos ativos={p.ativos} atual={simbolo} ondeEsta={p.ondeEsta} aoFechar={() => setMenu(false)} aoEscolher={(s) => { setMenu(false); p.aoEscolherAtivo(s) }} />}
      </header>
      <div className="mtl-corpo">
        <div className="mtl-grafico">
          <Suspense fallback={<div className="gp-carregando-pagina">Abrindo o gráfico…</div>}>
            <GraficoPro compacto candles={candles} mode="candles" pipSize={pipSize} symbol={simbolo} symbolName={nome} granularity={p.tempo}
              loading={loading} markers={marcadores} sessao={p.sessao} moeda={moeda} sinalLiberado={false} />
          </Suspense>
          {variante === 'faixa' && linhaDoAviso}
        </div>
        {variante === 'faixa' ? boletaEmFaixa : boletaInteira}
      </div>
    </article>
  )
}

/** A lista de ativos de um quadro: busca, mercados e onde cada um já está aberto. */
function MenuDeAtivos({ ativos, atual, ondeEsta, aoEscolher, aoFechar }: {
  ativos: ActiveSymbol[]; atual: string; ondeEsta: (s: string) => number | null; aoEscolher: (s: string) => void; aoFechar: () => void
}) {
  const [busca, setBusca] = useState('')
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // clicar fora fecha; o botão de ativo do PRÓPRIO quadro não conta (ele mesmo fecha), o de outro quadro sim
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node
      const proprio = caixa.current?.parentElement?.querySelector('.mtl-ativo')
      if (caixa.current && !caixa.current.contains(alvo) && !proprio?.contains(alvo)) aoFechar()
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); aoFechar() } }
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', tecla, true)
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', tecla, true) }
  }, [aoFechar])
  const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const q = normal(busca.trim())
  const lista = q ? ativos.filter((a) => normal(nomeDoAtivo(a.name)).includes(q) || normal(a.symbol).includes(q)) : ativos
  const grupos = new Map<string, ActiveSymbol[]>()
  for (const a of lista) { const k = a.market || 'outros'; if (!grupos.has(k)) grupos.set(k, []); grupos.get(k)!.push(a) }
  return (
    <div className="mtl-menu" role="dialog" aria-label="Trocar ativo" ref={caixa}>
      <input className="search" autoFocus placeholder="Buscar ativo…" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar ativo" />
      <div className="mtl-menu-lista">
        {[...grupos.entries()].map(([mercado, itens]) => (
          <section key={mercado}>
            <h4>{NOME_DO_MERCADO[mercado] ?? mercado.replace(/_/g, ' ')}</h4>
            {itens.map((a) => {
              const outro = a.symbol === atual ? null : ondeEsta(a.symbol)
              const fechado = !a.isOpen || a.isSuspended
              return (
                <button key={a.symbol} type="button" className={a.symbol === atual ? 'on' : ''} onClick={() => aoEscolher(a.symbol)}>
                  {MARCA.iconesDeAtivos && <IconeAtivo simbolo={a.symbol} tamanho={26} />}
                  <span>{nomeDoAtivo(a.name)}</span>
                  <small>{a.symbol === atual ? 'Neste quadro' : outro ? `No quadro ${outro}` : fechado ? 'Fechado' : ''}</small>
                </button>
              )
            })}
          </section>
        ))}
        {lista.length === 0 && <p className="mtl-menu-vazio">Nenhum ativo com esse nome.</p>}
      </div>
    </div>
  )
}
