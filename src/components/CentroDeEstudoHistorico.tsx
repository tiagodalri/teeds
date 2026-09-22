/**
 * O histórico do centro de estudo (Modo CEO).
 *
 * A parte de cima do centro de estudo olha as sessões abertas agora. Esta
 * olha para trás: o banco resume as operações de robô do período (é a mesma
 * consulta que a tela de Comissões usa, `teeds_analise_operacoes`) e aqui
 * viram três desenhos — markup por dia, por robô e por hora do dia — mais a
 * tabela de desempenho de cada robô.
 *
 * Por padrão mostra só conta real, que é onde existe faturamento de verdade.
 * O botão "com demo" serve para estudar comportamento, e a tela avisa que
 * markup de demo não é dinheiro.
 * (Pedido do Tiago, 22/09/2026: "modo CEO deve ser TOP".)
 */
import { useEffect, useMemo, useState } from 'react'
import { analiseOperacoes, type AnaliseOperacoes } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'

const DIAS = [1, 7, 30, 90] as const
type Janela = typeof DIAS[number]

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const inteiro = (v: number) => v.toLocaleString('pt-BR')
const pct = (v: number) => `${Math.round(v * 100)}%`
const assinado = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}`
const hh = (h: number) => `${String(h).padStart(2, '0')}h`
const diaCurto = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${d}/${m}`
}
const inicioDoDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString() }

/** Barras verticais desenhadas à mão: sem biblioteca, mesma régua do resto da tela. */
function Barras({ dados, cor, rotulo }: { dados: Array<{ rot: string; valor: number; detalhe: string }>; cor: string; rotulo: string }) {
  const maior = Math.max(...dados.map((d) => d.valor), 0)
  if (!dados.length || maior <= 0) return <p className="ce-vazio">Sem {rotulo} no período.</p>
  // Com muitas colunas, só a primeira, a do meio e a última levam nome.
  const marcados = new Set([0, Math.floor((dados.length - 1) / 2), dados.length - 1])
  const poucos = dados.length <= 12
  return (
    <div className="ce-barras" role="img" aria-label={`${rotulo}: ${dados.map((d) => `${d.rot} ${cents(d.valor)}`).join(', ')}`}>
      {dados.map((d, i) => (
        <span key={d.rot} className="ce-col" title={`${d.rot} · ${d.detalhe}`}>
          <i style={{ height: `${Math.max(2, (d.valor / maior) * 100)}%`, background: cor }} />
          <em>{poucos || marcados.has(i) ? d.rot : ''}</em>
        </span>
      ))}
    </div>
  )
}

export function CentroDeEstudoHistorico({ sessao, moeda }: { sessao: SessaoTeeds; moeda: string }) {
  const [janela, setJanela] = useState<Janela>(7)
  const [comDemo, setComDemo] = useState(false)
  const [dados, setDados] = useState<AnaliseOperacoes | null>(null)
  const [carregando, setCarregando] = useState(true)

  const intervalo = useMemo(() => {
    const ate = new Date()
    const de = new Date()
    de.setDate(de.getDate() - (janela - 1))
    return { de: inicioDoDia(de), ate: new Date(inicioDoDia(ate)).toISOString() }
  }, [janela])

  useEffect(() => {
    let vivo = true
    const ler = async () => {
      const ate = new Date(intervalo.ate)
      ate.setDate(ate.getDate() + 1)
      const r = await analiseOperacoes(sessao, { de: intervalo.de, ate: ate.toISOString(), demo: comDemo ? null : false })
      if (!vivo) return
      setDados(r); setCarregando(false)
    }
    setCarregando(true)
    void ler()
    const id = setInterval(() => { void ler() }, 120_000)
    return () => { vivo = false; clearInterval(id) }
  }, [sessao, intervalo.de, intervalo.ate, comDemo])

  const t = dados?.total
  const porRobo = [...(dados?.porRobo ?? [])].sort((a, b) => b.markup - a.markup)
  const maiorRobo = Math.max(...porRobo.map((r) => r.markup), 0)
  const medidoPct = t && t.markup > 0 ? t.markupDeriv / t.markup : 0

  return (
    <div className="ce-hist">
      <header className="ce-hist-topo">
        <div>
          <span className="ce-eyebrow">Histórico</span>
          <h4>O que já passou pela plataforma</h4>
        </div>
        <div className="ce-filtros">
          <div className="ce-periodo" role="group" aria-label="Período">
            {DIAS.map((d) => (
              <button key={d} type="button" aria-pressed={janela === d} onClick={() => setJanela(d)}>
                {d === 1 ? 'Hoje' : `${d} dias`}
              </button>
            ))}
          </div>
          <label className="ce-demo">
            <input type="checkbox" checked={comDemo} onChange={(e) => setComDemo(e.target.checked)} />
            incluir demo
          </label>
        </div>
      </header>

      {carregando && !dados && <p className="ce-vazio">Lendo o histórico…</p>}
      {!carregando && (!t || t.operacoes === 0) && <p className="ce-vazio">Nenhuma operação de robô no período{comDemo ? '' : ' em conta real'}.</p>}

      {t && t.operacoes > 0 && (
        <>
          <div className="ce-tiles">
            <div className="ce-tile destaque">
              <i>Markup do período</i>
              <b>{moeda} {cents(t.markup)}</b>
              <small>{medidoPct > 0 ? `${pct(medidoPct)} medido pela Deriv` : 'estimativa de 3% do pagamento'}</small>
            </div>
            <div className="ce-tile">
              <i>Operações</i>
              <b>{inteiro(t.operacoes)}</b>
              <small>{pct(t.ganhas / t.operacoes)} positivas · {inteiro(t.clientes)} {t.clientes === 1 ? 'cliente' : 'clientes'}</small>
            </div>
            <div className="ce-tile">
              <i>Volume movimentado</i>
              <b>{moeda} {num(t.entradas)}</b>
              <small>markup de {moeda} {cents(t.entradas > 0 ? (t.markup / t.entradas) * 1000 : 0)} por mil</small>
            </div>
            <div className="ce-tile">
              <i>Resultado dos clientes</i>
              <b className={t.resultado >= 0 ? 'up' : 'down'}>{moeda} {assinado(t.resultado)}</b>
              <small>quanto as contas ganharam ou perderam no período</small>
            </div>
          </div>

          <div className="ce-graficos">
            <section>
              <h5>Markup por dia</h5>
              <Barras
                cor="var(--primary)"
                rotulo="markup"
                dados={(dados?.porDia ?? []).map((d) => ({
                  rot: diaCurto(d.dia),
                  valor: d.markup,
                  detalhe: `${moeda} ${cents(d.markup)} · ${inteiro(d.operacoes)} operações`,
                }))} />
            </section>
            <section>
              <h5>Por hora do dia</h5>
              <Barras
                cor="var(--up)"
                rotulo="operação"
                dados={(dados?.porHora ?? []).map((h) => ({
                  rot: hh(h.hora),
                  valor: h.markup,
                  detalhe: `${moeda} ${cents(h.markup)} · ${inteiro(h.operacoes)} operações`,
                }))} />
            </section>
          </div>

          <div className="ce-tabela">
            <table>
              <thead>
                <tr>
                  <th scope="col">Robô</th>
                  <th scope="col">Ops</th>
                  <th scope="col">Acerto</th>
                  <th scope="col">Clientes</th>
                  <th scope="col">Movimentado</th>
                  <th scope="col">Markup</th>
                  <th scope="col">Por mil</th>
                  <th scope="col">Resultado dos clientes</th>
                </tr>
              </thead>
              <tbody>
                {porRobo.map((r) => (
                  <tr key={r.roboId}>
                    <th scope="row"><span className="ce-robo">{r.roboNome}</span></th>
                    <td>{inteiro(r.operacoes)}</td>
                    <td>{r.operacoes ? pct(r.ganhas / r.operacoes) : '—'}</td>
                    <td>{inteiro(r.clientes)}</td>
                    <td>{num(r.entradas)}</td>
                    <td className="ce-markup">
                      {cents(r.markup)}
                      <span className="ce-barra" aria-hidden><i style={{ width: `${maiorRobo > 0 ? Math.max(2, (r.markup / maiorRobo) * 100) : 0}%`, background: 'var(--primary)' }} /></span>
                    </td>
                    <td>{cents(r.entradas > 0 ? (r.markup / r.entradas) * 1000 : 0)}</td>
                    <td className={r.resultado >= 0 ? 'up' : 'down'}>{assinado(r.resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
