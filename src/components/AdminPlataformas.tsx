/**
 * A rede inteira: a soma, e cada plataforma dentro dela.
 *
 * A Teeds é a plataforma de cima; OMNI e as próximas são whitelabels, cada
 * uma com a sua marca, os seus clientes e os seus robôs. Esta tela responde
 * duas perguntas na mesma janela de tempo: quanto a casa fez somada, e quanto
 * veio de cada plataforma.
 *
 * Quem decide o que cada um pode ver é o banco (`teeds_sou_admin_da`): o
 * admin da Teeds enxerga todas as marcas, o admin de uma whitelabel só
 * enxerga a dele. Esta tela é só o filtro.
 * (Pedido do Tiago, 22/09/2026; a soma da rede, 30/09/2026.)
 */
import { useEffect, useState } from 'react'
import { analiseOperacoes, listarClientesPagina, listarComissoes } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'
import { SeletorDePeriodo, primeiroDia, janelaEmDatas } from './SeletorDePeriodo'
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
  /** O mesmo período pelo extrato da Deriv, que enxerga também o que foi na mão. */
  markupExtrato: number
  operacoesExtrato: number
}

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const inteiro = (v: number) => v.toLocaleString('pt-BR')
const pct = (v: number) => `${Math.round(v * 100)}%`
const assinado = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}`
const inicioDoDia = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.toISOString() }

export function AdminPlataformas({ sessao, marcaFoco, onAbrirMarca }: {
  sessao: SessaoTeeds
  /** Qual plataforma o painel está olhando, para destacar a linha dela. */
  marcaFoco?: string
  onAbrirMarca: (id: string) => void
}) {
  const [janela, setJanela] = useState<Janela>(30)
  const [comDemo, setComDemo] = useState(false)
  const [linhas, setLinhas] = useState<LinhaMarca[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    const ler = async () => {
      setCarregando(true)
      const de = primeiroDia(janela)
      const ate = new Date(); ate.setDate(ate.getDate() + 1)
      const marcas = Object.values(MARCAS)
      // O extrato da Deriv vem de uma consulta só, para todas as marcas.
      const extrato = await listarComissoes(sessao, janela).catch(() => [])
      const doExtrato = (marca: string) => extrato
        .filter((k) => k.marca === marca && (comDemo || !k.demo))
        .reduce((t, k) => ({ markup: t.markup + k.comissao, operacoes: t.operacoes + k.operacoes }), { markup: 0, operacoes: 0 })
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
          markupExtrato: doExtrato(m.id).markup,
          operacoesExtrato: doExtrato(m.id).operacoes,
        }
      }))
      if (!vivo) return
      setLinhas(resultado.sort((a, b) => b.markup - a.markup || b.clientes - a.clientes))
      setCarregando(false)
    }
    void ler()
    return () => { vivo = false }
  }, [sessao, janela, comDemo])

  const soma = (campo: keyof LinhaMarca) => linhas.reduce((t, l) => t + (l[campo] as number), 0)
  const totalMarkup = soma('markup')
  const totalClientes = soma('clientes')
  const totalOps = soma('operacoes')
  const totalGanhas = soma('ganhas')
  const totalEntradas = soma('entradas')
  const totalResultado = soma('resultado')
  const totalAtivos24h = soma('ativos24h')
  const totalContas = soma('contasOperando')
  const totalExtrato = soma('markupExtrato')
  const totalOpsExtrato = soma('operacoesExtrato')
  const maior = Math.max(...linhas.map((l) => l.markup), 0)

  return (
    <>
      <section className="admin-card pl-topo">
        <div>
          <b>A rede somada</b>
          <small>
            Os números de todas as plataformas juntas, e logo abaixo a parte de cada uma.
            Para administrar uma delas por dentro, use o seletor do topo ou o botão da linha.
          </small>
        </div>
        <div className="pl-filtros">
          <SeletorDePeriodo dias={janela} opcoes={DIAS} onTrocar={setJanela} />
          <label className="ce-demo">
            <input type="checkbox" checked={comDemo} onChange={(e) => setComDemo(e.target.checked)} />
            incluir demo
          </label>
        </div>
      </section>

      <div className="adm-kpis">
        <article className="alerta">
          <span>Markup da rede · {janela} dias</span>
          <strong>US$ {cents(totalExtrato)}</strong>
          <small>pelo extrato da Deriv · {janelaEmDatas(janela)} · {inteiro(totalOpsExtrato)} contratos</small>
        </article>
        <article>
          <span>Registrado pelos robôs</span>
          <strong>US$ {cents(totalMarkup)}</strong>
          <small>{inteiro(totalOps)} operações que os nossos robôs executaram</small>
        </article>
        <article>
          <span>Clientes na rede</span>
          <strong>{inteiro(totalClientes)}</strong>
          <small>{inteiro(totalAtivos24h)} ativos nas últimas 24h</small>
        </article>
        <article className="ok">
          <span>Volume movimentado</span>
          <strong>US$ {num(totalEntradas)}</strong>
          <small>{totalOps ? pct(totalGanhas / totalOps) : '—'} de acerto · {inteiro(totalContas)} contas</small>
        </article>
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
                <th scope="col">Markup · robôs</th>
                <th scope="col">Markup · extrato</th>
                <th scope="col">Resultado dos clientes</th>
                <th scope="col" />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className={l.id === marcaFoco ? 'pl-em-foco' : undefined}>
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
                    <span className="pl-fatia">{totalMarkup > 0 ? pct(l.markup / totalMarkup) : '—'} da rede</span>
                    <span className="ce-barra" aria-hidden><i style={{ width: `${maior > 0 ? Math.max(2, (l.markup / maior) * 100) : 0}%`, background: 'var(--primary)' }} /></span>
                  </td>
                  <td className="pl-markup">
                    {cents(l.markupExtrato)}
                    <span className="pl-fatia">{inteiro(l.operacoesExtrato)} contratos</span>
                  </td>
                  <td className={l.resultado >= 0 ? 'up' : 'down'}>{assinado(l.resultado)}</td>
                  <td><button type="button" className="admin-refresh" onClick={() => onAbrirMarca(l.id)}>Abrir →</button></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row"><span className="pl-marca">Rede</span><small>todas as plataformas</small></th>
                <td>{inteiro(totalClientes)}</td>
                <td>{inteiro(totalAtivos24h)}</td>
                <td>{inteiro(totalContas)}</td>
                <td>{inteiro(totalOps)}</td>
                <td>{totalOps ? pct(totalGanhas / totalOps) : '—'}</td>
                <td>{num(totalEntradas)}</td>
                <td className="pl-markup">{cents(totalMarkup)}</td>
                <td className="pl-markup">{cents(totalExtrato)}</td>
                <td className={totalResultado >= 0 ? 'up' : 'down'}>{assinado(totalResultado)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="ce-nota">
          <b>Markup · robôs</b> é o que os nossos robôs executaram e registraram, contrato por contrato.
          <b> Markup · extrato</b> é o que o extrato da Deriv mostra no app daquela marca — e por isso enxerga também
          a operação feita na mão e os contratos anteriores ao registro dos robôs. O segundo é a receita; o primeiro é
          a operação. Quando os dois se afastam, a diferença está aí.
        </p>
        <p className="ce-nota">
          Resultado dos clientes é quanto as contas deles ganharam ou perderam — número dos clientes, não da casa.
          A janela aqui é {janelaEmDatas(janela)}. O painel da Deriv chama de “últimos {janela} dias” uma janela que
          começa um dia antes: ao comparar, confira primeiro se as datas são as mesmas.
        </p>
      </section>
    </>
  )
}
