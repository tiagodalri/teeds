/**
 * De onde vêm as operações das contas dos clientes.
 *
 * A conta na Deriv é do cliente: ele pode operar por aqui, pela outra marca
 * da casa ou por qualquer app de fora. Até 30/09/2026 a plataforma somava
 * 3% de tudo o que via no extrato e chamava de comissão — um cliente que
 * nunca ligou um robô aqui aparecia com US$ 32,67 "nossos".
 *
 * Agora o servidor separa contrato por contrato, por três pistas: o
 * contrato que a plataforma registrou quando comprou, o app que a Deriv
 * informa no extrato e o horário da compra contra as sessões que a gente
 * abriu. Esta tela mostra o resultado dessa separação — e deixa claro quanto
 * é receita e quanto é só movimento da conta do cliente.
 */
import { useEffect, useMemo, useState } from 'react'
import { contratosPorOrigem, marcaAdmin, type OrigemDoContrato } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCAS } from '../marca/marcas'

const DIAS = [7, 30, 90] as const
type Janela = typeof DIAS[number]

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
const inteiro = (v: number) => v.toLocaleString('pt-BR')
const assinado = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}`

/** O nome de cada origem na tela, e o que ela significa em uma linha. */
function rotuloDaOrigem(origem: string): { nome: string; conta: string; receita: boolean } {
  if (origem === 'externo') return { nome: 'Fora da casa', conta: 'apps que não são nossos — não é receita', receita: false }
  if (origem === 'sem-dono') return { nome: 'Sem dono', conta: 'sem app no extrato e fora das nossas sessões', receita: false }
  const marca = MARCAS[origem]
  return {
    nome: marca?.prosa ?? origem,
    conta: origem === marcaAdmin() ? 'receita desta plataforma' : 'da outra plataforma da casa',
    receita: true,
  }
}

interface Somado {
  origem: string
  operacoes: number
  entradas: number
  pagamentos: number
  resultado: number
  markup: number
  porRegistro: number
  porApp: number
  porHorario: number
  semPista: number
  apps: string[]
  contas: Set<string>
}

const somar = (linhas: OrigemDoContrato[]): Somado[] => {
  const mapa = new Map<string, Somado>()
  for (const l of linhas) {
    const s = mapa.get(l.origem) ?? {
      origem: l.origem, operacoes: 0, entradas: 0, pagamentos: 0, resultado: 0, markup: 0,
      porRegistro: 0, porApp: 0, porHorario: 0, semPista: 0, apps: [], contas: new Set<string>(),
    }
    s.operacoes += l.operacoes; s.entradas += l.entradas; s.pagamentos += l.pagamentos
    s.resultado += l.resultado; s.markup += l.markupEstimado
    s.porRegistro += l.porRegistro; s.porApp += l.porApp; s.porHorario += l.porHorario; s.semPista += l.semPista
    for (const a of l.apps) if (!s.apps.includes(a)) s.apps.push(a)
    s.contas.add(l.contaId)
    mapa.set(l.origem, s)
  }
  // A marca em foco primeiro, depois a outra marca, depois o que não é nosso.
  const peso = (o: string) => o === marcaAdmin() ? 0 : MARCAS[o] ? 1 : o === 'externo' ? 2 : 3
  return [...mapa.values()].sort((a, b) => peso(a.origem) - peso(b.origem) || b.operacoes - a.operacoes)
}

export function OrigemDasOperacoes({ sessao }: { sessao: SessaoTeeds }) {
  const [janela, setJanela] = useState<Janela>(30)
  const [comDemo, setComDemo] = useState(false)
  const [linhas, setLinhas] = useState<OrigemDoContrato[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    contratosPorOrigem(sessao, janela).then((r) => { if (vivo) { setLinhas(r); setCarregando(false) } })
    return () => { vivo = false }
  }, [sessao, janela])

  const visiveis = useMemo(() => linhas.filter((l) => comDemo || !l.demo), [linhas, comDemo])
  const somados = useMemo(() => somar(visiveis), [visiveis])
  const receita = somados.filter((s) => s.origem === marcaAdmin()).reduce((t, s) => t + s.markup, 0)
  const total = somados.reduce((t, s) => t + s.operacoes, 0)

  return (
    <section className="admin-card ce-card">
      <header>
        <div>
          <span className="rot">Conferência</span>
          <h3>De onde vêm as operações</h3>
        </div>
        <div className="pl-filtros">
          <div className="ce-periodo" role="group" aria-label="Período">
            {DIAS.map((d) => <button key={d} type="button" aria-pressed={janela === d} onClick={() => setJanela(d)}>{d} dias</button>)}
          </div>
          <label className="ce-demo"><input type="checkbox" checked={comDemo} onChange={(e) => setComDemo(e.target.checked)} /> incluir demo</label>
        </div>
      </header>

      <div className="ce-card-corpo">
        {carregando && !linhas.length && <p className="ce-vazio">Lendo a separação…</p>}
        {!carregando && !visiveis.length && (
          <p className="ce-vazio">
            Nada separado ainda neste período. O servidor separa as contas a cada passada de comissões;
            dias anteriores a 30/09/2026 não têm essa separação.
          </p>
        )}

        {!!visiveis.length && (
          <>
            <p className="og-resumo">
              <b>{inteiro(total)}</b> {total === 1 ? 'contrato' : 'contratos'} nas contas dos clientes neste período.
              Receita desta plataforma: <b className="og-receita">US$ {cents(receita)}</b>.
              O resto é movimento da conta deles — está aqui para conferência, não entra em receita.
            </p>

            <div className="og-cartoes">
              {somados.map((s) => {
                const r = rotuloDaOrigem(s.origem)
                return (
                  <article key={s.origem} className={`og-cartao ${r.receita ? (s.origem === marcaAdmin() ? 'nossa' : 'irma') : 'fora'}`}>
                    <header><b>{r.nome}</b><small>{r.conta}</small></header>
                    <dl>
                      <div><dt>Operações</dt><dd>{inteiro(s.operacoes)}</dd></div>
                      <div><dt>Volume</dt><dd>{num(s.entradas)}</dd></div>
                      <div><dt>{r.receita ? 'Markup' : 'Markup (não é nosso)'}</dt><dd className={r.receita ? 'og-receita' : 'muted'}>{cents(s.markup)}</dd></div>
                      <div><dt>Resultado do cliente</dt><dd className={s.resultado >= 0 ? 'up' : 'down'}>{assinado(s.resultado)}</dd></div>
                    </dl>
                    <footer>
                      <span>{s.contas.size} {s.contas.size === 1 ? 'conta' : 'contas'}</span>
                      <span className="og-pistas">
                        {s.porRegistro > 0 && <em title="contratos que a plataforma registrou ao comprar">{inteiro(s.porRegistro)} por registro</em>}
                        {s.porApp > 0 && <em title="app informado pela Deriv no extrato">{inteiro(s.porApp)} pelo app</em>}
                        {s.porHorario > 0 && <em title="comprados durante uma sessão nossa">{inteiro(s.porHorario)} por horário</em>}
                        {s.semPista > 0 && <em title="sem app e fora das nossas sessões">{inteiro(s.semPista)} sem pista</em>}
                      </span>
                      {!!s.apps.length && <span className="og-apps">apps: {s.apps.join(', ')}</span>}
                    </footer>
                  </article>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}
