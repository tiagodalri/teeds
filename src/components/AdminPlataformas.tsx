/**
 * Plataformas — a visão master da Teeds.
 *
 * A Teeds é a plataforma de cima; OMNI e as próximas são whitelabels, cada
 * uma com a sua marca, os seus clientes e os seus robôs. Esta aba põe todas
 * lado a lado no mesmo período: clientes, atividade, operações, volume,
 * markup e resultado.
 *
 * Quem decide o que cada um pode ver é o banco (`teeds_sou_admin_da`): o
 * admin da Teeds enxerga todas as marcas, o admin de uma whitelabel só
 * enxerga a dele. Esta tela é só o filtro.
 * (Pedido do Tiago, 22/09/2026.)
 */
import { useEffect, useState } from 'react'
import { analiseOperacoes, listarClientesPagina } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCAS } from '../marca/marcas'

const DIAS = [7, 30, 90] as const
type Janela = typeof DIAS[number]

interface LinhaMarca {
  id: string
  nome: string
  clientes: number
  ativos: number
  ativos24h: number
  operacoes: number
  ganhas: number
  entradas: number
  markup: number
  resultado: number
  contasOperando: number
}

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const inteiro = (v: number) => v.toLocaleString('pt-BR')
const pct = (v: number) => `${Math.round(v * 100)}%`
const assinado = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}`
const inicioDoDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString() }

export function AdminPlataformas({ sessao, onAbrirMarca }: { sessao: SessaoTeeds; onAbrirMarca: (id: string) => void }) {
  const [janela, setJanela] = useState<Janela>(30)
  const [comDemo, setComDemo] = useState(false)
  const [linhas, setLinhas] = useState<LinhaMarca[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    const ler = async () => {
      setCarregando(true)
      const de = new Date(); de.setDate(de.getDate() - (janela - 1))
      const ate = new Date(); ate.setDate(ate.getDate() + 1)
      const marcas = Object.values(MARCAS)
      const resultado = await Promise.all(marcas.map(async (m) => {
        const [pagina, analise] = await Promise.all([
          listarClientesPagina(sessao, { marca: m.id, limite: 1 }),
          analiseOperacoes(sessao, { marca: m.id, de: inicioDoDia(de), ate: inicioDoDia(ate), demo: comDemo ? null : false }),
        ])
        return {
          id: m.id, nome: m.prosa,
          clientes: pagina.total, ativos: pagina.ativos, ativos24h: pagina.ativos24h,
          operacoes: analise?.total.operacoes ?? 0,
          ganhas: analise?.total.ganhas ?? 0,
          entradas: analise?.total.entradas ?? 0,
          markup: analise?.total.markup ?? 0,
          resultado: analise?.total.resultado ?? 0,
          contasOperando: analise?.total.contas ?? 0,
        }
      }))
      if (!vivo) return
      setLinhas(resultado.sort((a, b) => b.markup - a.markup || b.clientes - a.clientes))
      setCarregando(false)
    }
    void ler()
    return () => { vivo = false }
  }, [sessao, janela, comDemo])

  const totalMarkup = linhas.reduce((t, l) => t + l.markup, 0)
  const totalClientes = linhas.reduce((t, l) => t + l.clientes, 0)
  const totalOps = linhas.reduce((t, l) => t + l.operacoes, 0)
  const maior = Math.max(...linhas.map((l) => l.markup), 0)

  return (
    <>
      <section className="admin-card pl-topo">
        <div>
          <b>Todas as plataformas</b>
          <small>A Teeds é a master: aqui você compara as whitelabels no mesmo período. Para administrar uma delas por dentro, troque a plataforma no seletor do topo.</small>
        </div>
        <div className="pl-filtros">
          <div className="ce-periodo" role="group" aria-label="Período">
            {DIAS.map((d) => (
              <button key={d} type="button" aria-pressed={janela === d} onClick={() => setJanela(d)}>{d} dias</button>
            ))}
          </div>
          <label className="ce-demo">
            <input type="checkbox" checked={comDemo} onChange={(e) => setComDemo(e.target.checked)} />
            incluir demo
          </label>
        </div>
      </section>

      <div className="adm-kpis">
        <article className="alerta"><span>Markup somado · {janela} dias</span><strong>US$ {cents(totalMarkup)}</strong><small>{linhas.length} plataformas</small></article>
        <article><span>Clientes na rede</span><strong>{inteiro(totalClientes)}</strong><small>todas as marcas</small></article>
        <article className="ok"><span>Operações no período</span><strong>{inteiro(totalOps)}</strong><small>{comDemo ? 'reais e demo' : 'somente conta real'}</small></article>
      </div>

      <section className="admin-card">
        <header><div><span className="rot">Comparação</span><h3>Plataforma a plataforma</h3></div></header>
        {carregando && linhas.length === 0 && <p className="admin-vazio">Lendo as plataformas…</p>}
        <div className="pl-tabela">
          <table>
            <thead>
              <tr>
                <th scope="col">Plataforma</th>
                <th scope="col">Clientes</th>
                <th scope="col">Ativos 24h</th>
                <th scope="col">Contas operando</th>
                <th scope="col">Operações</th>
                <th scope="col">Acerto</th>
                <th scope="col">Volume</th>
                <th scope="col">Markup</th>
                <th scope="col">Resultado dos clientes</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id}>
                  <th scope="row">
                    <span className="pl-marca">{l.nome}{l.id === 'teeds' && <em>master</em>}</span>
                    <small>{inteiro(l.ativos)} acessos liberados</small>
                  </th>
                  <td>{inteiro(l.clientes)}</td>
                  <td>{inteiro(l.ativos24h)}</td>
                  <td>{inteiro(l.contasOperando)}</td>
                  <td>{inteiro(l.operacoes)}</td>
                  <td>{l.operacoes ? pct(l.ganhas / l.operacoes) : '—'}</td>
                  <td>{num(l.entradas)}</td>
                  <td className="pl-markup">
                    {cents(l.markup)}
                    <span className="ce-barra" aria-hidden><i style={{ width: `${maior > 0 ? Math.max(2, (l.markup / maior) * 100) : 0}%`, background: 'var(--primary)' }} /></span>
                  </td>
                  <td className={l.resultado >= 0 ? 'up' : 'down'}>{assinado(l.resultado)}</td>
                  <td><button type="button" className="admin-refresh" onClick={() => onAbrirMarca(l.id)}>Abrir →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ce-nota">
          Markup é a comissão da plataforma sobre o pagamento de cada contrato. Resultado dos clientes é quanto as contas deles
          ganharam ou perderam — número dos clientes, não da casa.
        </p>
      </section>
    </>
  )
}
