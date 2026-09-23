/**
 * O simulador do painel de controle: "Hoje (publicado)" ao lado de "Com
 * esta mudança (rascunho)", com os mesmos números que o motor usa.
 *
 * Dois cartões separados por coluna, de propósito: "Cadência" só muda com
 * o loss virtual (quanto o robô espera), "Escada" só muda com a
 * recuperação (quanto ele arrisca). Assim "mais loss virtual" nunca parece
 * "mais markup". O Monte Carlo roda só no clique — mil sessões custam uns
 * 10 ms, mas rodar a cada tecla faria os números dançarem enquanto o
 * admin digita. Toda conta mora em src/core/deriv/simulacao.ts; aqui é só
 * a tela.
 */
import { useMemo, useState } from 'react'
import { temModoAgressivo, type ParametrosDoRobo } from '../core/deriv/parametros'
import { NOME_DO_MODO, type Modo } from '../core/deriv/strategies'
import { TAXA_MARKUP } from '../core/deriv/taxaMarkup'
import { simular } from '../core/deriv/markup'
import { cadenciaTeorica, monteCarlo, simularEscada, type Cadencia, type Cenario, type EscadaSimulada, type ResultadoMonteCarlo } from '../core/deriv/simulacao'
import './simulador-robo.css'

export interface PropsSimulador { id: string; hoje: ParametrosDoRobo; novo?: ParametrosDoRobo | null; compacto?: boolean }

const BASES = [0.35, 1, 5, 20]
const REFERENCIAS: Array<{ rotulo: string; stop: number; meta: number }> = [
  { rotulo: '20 / 3', stop: 20, meta: 3 },
  { rotulo: '50 / 10', stop: 50, meta: 10 },
  { rotulo: 'banca US$ 100 com stop 10%', stop: 10, meta: 10 },
]
const SESSOES = 1000
const SEMENTE = 1
/** A 3% o pagamento cai para 91,25% do valor sem markup (medido em markup.ts). */
const QUEDA_A_3 = 0.0875

const dinheiro = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })
const pct = (x: number, casas = 1) => `${(x * 100).toLocaleString('pt-BR', { maximumFractionDigits: casas })}%`
const numero = (x: number, casas = 1) => x.toLocaleString('pt-BR', { maximumFractionDigits: casas })
const tempo = (segundos: number) => {
  if (!Number.isFinite(segundos)) return '∞'
  if (segundos < 90) return `${Math.round(segundos)} s`
  if (segundos < 5400) return `${Math.round(segundos / 60)} min`
  return `${(segundos / 3600).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`
}
const igual = (a: number, b: number) => Math.abs(a - b) < 1e-9

interface Coluna { chave: 'hoje' | 'novo'; rotulo: string; parametros: ParametrosDoRobo }
interface Simulado { escada: EscadaSimulada; cadencia: Cadencia }
interface Metrica { rotulo: string; valor: (s: Simulado) => number; texto: (v: number) => string; nota?: (s: Simulado) => string }

const CADENCIA: Metrica[] = [
  { rotulo: 'Espera média antes de entrar', valor: (s) => s.cadencia.esperaTicks, texto: (v) => v === 0 ? 'entra sempre' : `${numero(v)} ticks`, nota: (s) => s.cadencia.esperaTicks === 0 ? 'sem loss virtual' : `~${tempo(s.cadencia.esperaSegundos)}` },
  { rotulo: 'Operações por hora', valor: (s) => s.cadencia.opsPorHora, texto: (v) => numero(v, 0), nota: (s) => `~${numero(s.cadencia.opsPorSequencia)} operações por sequência` },
]
const ESCADA: Metrica[] = [
  { rotulo: 'Perda máxima numa sequência', valor: (s) => s.escada.plano.custoMaximo, texto: dinheiro, nota: (s) => s.escada.plano.entradaAparada !== null ? `inclui a entrada aparada de ${dinheiro(s.escada.plano.entradaAparada)}` : s.escada.plano.paraAntesDoStop ? 'o robô para antes do stop' : 'dentro do stop de referência' },
  { rotulo: 'Erros seguidos que cabem', valor: (s) => s.escada.plano.errosSeguidos, texto: (v) => String(v), nota: (s) => `${s.escada.plano.recuperacoes} em recuperação` },
  { rotulo: 'Maior entrada', valor: (s) => s.escada.plano.maiorEntrada, texto: dinheiro },
  { rotulo: 'Markup esperado por sequência', valor: (s) => s.escada.markupEsperadoPorSequencia, texto: dinheiro, nota: (s) => `até ${dinheiro(s.escada.markup.porDegrau.slice(0, s.escada.plano.errosSeguidos).reduce((t, m) => t + m, 0))} se a sequência inteira for comprada` },
  { rotulo: 'Chance de furar o stop numa sequência', valor: (s) => s.escada.chanceDeFurarOStop, texto: (v) => pct(v, 2), nota: (s) => s.escada.plano.paraAntesDoStop ? 'aqui o robô desliga em vez de furar' : `${numero(1 / Math.max(s.escada.chanceDeFurarOStop, 1e-9), 0)} sequências para 1` },
  { rotulo: 'Resultado esperado do cliente por sequência', valor: (s) => s.escada.resultadoEsperadoCliente, texto: dinheiro },
]

/** Vermelho quando o aviso é sobre dinheiro que não volta; âmbar para o resto. */
const gravidade = (aviso: string) => /não cobre|desligar antes|Parar com menos|já passa do stop/.test(aviso) ? 'vermelho' : 'ambar'

export function SimuladorDoRobo({ id, hoje, novo, compacto = false }: PropsSimulador) {
  const [base, setBase] = useState(1)
  const [baseTexto, setBaseTexto] = useState('1')
  const [stop, setStop] = useState(20)
  const [meta, setMeta] = useState(3)
  const [modo, setModo] = useState<Modo>('conservador')
  const [demo, setDemo] = useState(false)
  const [taxa, setTaxa] = useState(TAXA_MARKUP * 100)
  const [mc, setMc] = useState<{ chave: string; resultados: ResultadoMonteCarlo[] } | null>(null)

  const colunas: Coluna[] = useMemo(() => [
    { chave: 'hoje', rotulo: 'Hoje (publicado)', parametros: hoje },
    ...(novo ? [{ chave: 'novo' as const, rotulo: 'Com esta mudança (rascunho)', parametros: novo }] : []),
  ], [hoje, novo])
  const temAgressivo = temModoAgressivo(hoje) || (!!novo && temModoAgressivo(novo))
  const modoEfetivo: Modo = temAgressivo ? modo : 'conservador'

  const cenarioDe = (p: ParametrosDoRobo): Cenario => ({ id, parametros: p, base, stopLoss: stop, takeProfit: meta, modo: modoEfetivo, demo, taxaMarkup: taxa / 100 })
  const sims: Simulado[] = useMemo(
    () => colunas.map((c) => { const cen = cenarioDe(c.parametros); return { escada: simularEscada(cen), cadencia: cadenciaTeorica(cen) } }),
    [colunas, id, base, stop, meta, modoEfetivo, demo, taxa],
  )
  // A assinatura do cenário: o Monte Carlo guarda a sua e avisa quando ficou para trás.
  const chave = JSON.stringify([id, base, stop, meta, modoEfetivo, demo, taxa, colunas.map((c) => c.parametros)])
  const duas = colunas.length === 2

  const escolherBase = (v: number) => { setBase(v); setBaseTexto(String(v).replace('.', ',')) }
  const digitarBase = (texto: string) => {
    setBaseTexto(texto)
    const v = Number(texto.replace(',', '.'))
    if (Number.isFinite(v) && v >= 0.35) setBase(Math.round(v * 100) / 100)
  }
  const simularSessoes = () => {
    // No clique, nunca a cada tecla: as mesmas sessões (mesma semente) para as duas colunas.
    setMc({ chave, resultados: colunas.map((c) => monteCarlo(cenarioDe(c.parametros), { sessoes: SESSOES, semente: SEMENTE })) })
  }

  // "E se" da taxa: o pagamento medido já traz os 3%; desfaz para mostrar o cliente com outra taxa.
  const porDolarHoje = sims[0].escada.degraus[0] ? sims[0].escada.degraus[0].pagamento / sims[0].escada.degraus[0].valor : 0
  const semMarkup = porDolarHoje / (1 - QUEDA_A_3)
  const eSe = simular(semMarkup, taxa)

  const valorComparado = (m: Metrica, i: number) => {
    const atual = m.valor(sims[i])
    if (!duas || i === 0) return <strong>{m.texto(atual)}</strong>
    const anterior = m.valor(sims[0])
    if (igual(atual, anterior)) return <strong>{m.texto(atual)} <small>igual a hoje</small></strong>
    return <strong><s>{m.texto(anterior)}</s> <span aria-hidden="true">→</span> {m.texto(atual)}</strong>
  }

  return <div className={`simr${compacto ? ' compacto' : ''}`}>
    <div className="simr-controles">
      <div className="simr-controle">
        <span>Entrada base</span>
        <div className="segmented mini">{BASES.map((b) => <button key={b} type="button" className={igual(base, b) ? 'on' : ''} onClick={() => escolherBase(b)}>{dinheiro(b)}</button>)}</div>
        <input type="text" inputMode="decimal" aria-label="Entrada base livre" value={baseTexto} onChange={(e) => digitarBase(e.target.value)} />
      </div>
      <div className="simr-controle">
        <span>Stop e meta de referência</span>
        <div className="segmented mini">{REFERENCIAS.map((r) => <button key={r.rotulo} type="button" className={igual(stop, r.stop) && igual(meta, r.meta) ? 'on' : ''} onClick={() => { setStop(r.stop); setMeta(r.meta) }}>{r.rotulo}</button>)}</div>
        <label>stop <input type="number" min={1} step={1} value={stop} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setStop(v) }} /></label>
        <label>meta <input type="number" min={0.35} step={1} value={meta} onChange={(e) => { const v = Number(e.target.value); if (v > 0) setMeta(v) }} /></label>
      </div>
      {temAgressivo && <div className="simr-controle">
        <span>Modo</span>
        <div className="segmented mini">{(['conservador', 'agressivo'] as Modo[]).map((m) => <button key={m} type="button" className={modo === m ? 'on' : ''} onClick={() => setModo(m)}>{NOME_DO_MODO[m]}</button>)}</div>
      </div>}
      <div className="simr-controle">
        <span>Conta</span>
        <div className="segmented mini">
          <button type="button" className={demo ? '' : 'on'} onClick={() => setDemo(false)}>Real</button>
          <button type="button" className={demo ? 'on' : ''} onClick={() => setDemo(true)}>Demo</button>
        </div>
        {demo && <em className="simr-nota-demo">projeção: conta demo não gera markup</em>}
      </div>
      <div className="simr-controle simr-taxa">
        <span>Taxa de markup <b>e se</b></span>
        <input type="range" min={0} max={3} step={0.5} value={taxa} aria-label="Taxa de markup hipotética" onChange={(e) => setTaxa(Number(e.target.value))} />
        <b>{numero(taxa)}%</b>
        <small>para valer, ajuste no painel da Deriv — aqui é só simulação</small>
      </div>
    </div>
    {!igual(taxa, TAXA_MARKUP * 100) && porDolarHoje > 0 && <p className="simr-ese">
      Com a taxa em {numero(taxa)}%, o cliente receberia {dinheiro(eSe.payoutCliente)} por US$ 1 que acertar (hoje, a 3%: {dinheiro(porDolarHoje)}; sem markup: {dinheiro(semMarkup)}). A comissão da casa seria {dinheiro(eSe.suaComissao)} por US$ 1 comprado. A escada abaixo continua com o payout de hoje; só o markup foi reescalado.
    </p>}

    <div className="simr-colunas" style={{ ['--colunas' as string]: colunas.length }}>
      {colunas.map((c, i) => {
        const s = sims[i]
        const { plano, degraus } = s.escada
        const linhas = degraus.slice(0, plano.cabem.length + 3)
        return <section key={c.chave} className={`simr-coluna ${c.chave}`}>
          <h4>{c.rotulo}</h4>
          <article className="simr-cartao">
            <header><b>Cadência</b><small>só muda com o loss virtual e a sequência</small></header>
            <div className="simr-metricas">{CADENCIA.map((m) => <div key={m.rotulo}><span>{m.rotulo}</span>{valorComparado(m, i)}{m.nota && <small>{m.nota(s)}</small>}</div>)}</div>
          </article>
          <article className="simr-cartao">
            <header><b>Escada</b><small>com base {dinheiro(base)} e stop {dinheiro(stop)}</small></header>
            <div className="simr-metricas">{ESCADA.map((m) => <div key={m.rotulo}><span>{m.rotulo}</span>{valorComparado(m, i)}{m.nota && <small>{m.nota(s)}</small>}</div>)}</div>
          </article>
          {s.escada.avisos.length > 0 && <ul className="simr-avisos">{s.escada.avisos.map((a) => <li key={a} className={gravidade(a)}>{a}</li>)}</ul>}
          {!compacto && <div className="simr-rolagem">
            <div className="simr-tabela" role="table" aria-label={`Escada degrau a degrau — ${c.rotulo}`}>
              <div className="simr-cab" role="row"><span>Degrau</span><span>Entrada</span><span>Pagamento</span><span>Lucro</span><span>Perda acumulada</span><span>Cobre?</span><span>Markup</span><span>Situação</span></div>
              {linhas.map((d, n) => {
                const situacao = d.esgotada ? 'parar' : n < plano.cabem.length ? 'cabe' : n === plano.cabem.length && plano.entradaAparada !== null ? 'aparada' : 'fora'
                return <div key={d.n} role="row" className={`simr-linha ${situacao}`}>
                  <span>{d.n}{d.recuperacao && !d.esgotada && <i title="recuperação">R</i>}</span>
                  {d.esgotada
                    ? <><b>—</b><b>—</b><b>—</b><b>{dinheiro(d.perdido)}</b><b>—</b><b>—</b></>
                    : <><b>{dinheiro(d.valor)}</b><b>{dinheiro(d.pagamento)}</b><b>{dinheiro(d.lucro)}</b><b>{dinheiro(d.perdido)}</b><b className={d.cobre ? 'cobre' : 'nao-cobre'}>{d.cobre ? '✓' : 'não cobre'}</b><b>{dinheiro(s.escada.markup.porDegrau[n] ?? 0)}</b></>}
                  <em>{situacao === 'parar' ? 'parar' : situacao === 'cabe' ? 'cabe' : situacao === 'aparada' ? `aparada → ${dinheiro(plano.entradaAparada ?? 0)}` : 'fora do stop'}</em>
                </div>
              })}
            </div>
          </div>}
        </section>
      })}
    </div>

    {!compacto && <section className="simr-mc">
      <header>
        <div><b>Sessões hipotéticas</b><small>{SESSOES.toLocaleString('pt-BR')} sessões com dígitos gerados ao acaso, base {dinheiro(base)}, stop {dinheiro(stop)}, meta {dinheiro(meta)} — as mesmas sessões nas duas colunas</small></div>
        <button type="button" className="simr-botao" onClick={simularSessoes}>Simular {SESSOES.toLocaleString('pt-BR')} sessões</button>
      </header>
      {mc && mc.chave !== chave && <p className="simr-desatualizado">O cenário mudou depois desta simulação — simule de novo para atualizar.</p>}
      {mc && <div className="simr-colunas" style={{ ['--colunas' as string]: colunas.length }}>
        {colunas.map((c, i) => {
          const r = mc.resultados[i]
          if (!r) return null
          const maior = Math.max(1, ...r.histograma.map((f) => f.n))
          return <article key={c.chave} className={`simr-cartao simr-resultado${mc.chave !== chave ? ' velho' : ''}`}>
            <header><b>{c.rotulo}</b></header>
            <div className="simr-metricas">
              <div><span>Bateu a meta</span><strong className="up">{pct(r.pMeta)}</strong></div>
              <div><span>Bateu o stop</span><strong className="down">{pct(r.pStop)}</strong></div>
              <div><span>Parou antes</span><strong>{pct(r.pParou)}</strong><small>tabela esgotada, limite de operações ou tempo</small></div>
              <div><span>Resultado médio · mediano</span><strong>{dinheiro(r.resultadoMedio)} · {dinheiro(r.resultadoMediano)}</strong></div>
              <div><span>Markup por sessão · por hora</span><strong>{dinheiro(r.markupMedio)} · {dinheiro(r.markupPorHora)}</strong>{demo && <small>conta demo: sem markup</small>}</div>
              <div><span>Operações por sessão</span><strong>{numero(r.operacoesMedias)}</strong></div>
              <div><span>Maior entrada média</span><strong>{dinheiro(r.maiorEntradaMedia)}</strong></div>
            </div>
            <div className="simr-hist" role="img" aria-label="Distribuição do resultado por sessão">
              {r.histograma.map((f) => <i key={f.de} className={f.ate <= 0 ? 'down' : f.de >= 0 ? 'up' : ''} style={{ height: `${Math.max(2, (f.n / maior) * 100)}%` }} title={`${dinheiro(f.de)} a ${dinheiro(f.ate)}: ${f.n} sessões`} />)}
            </div>
            <div className="simr-hist-eixo"><span>{dinheiro(-stop)}</span><span>0</span><span>{dinheiro(meta)}</span></div>
          </article>
        })}
      </div>}
    </section>}

    <ul className="simr-rodape">
      <li>estimativa · a conferência oficial é a da Deriv (Resultados › calculada × oficial)</li>
      <li>Dígitos gerados ao acaso não preveem o mercado: a simulação mostra o efeito da regra, não o resultado do cliente.</li>
    </ul>
  </div>
}
