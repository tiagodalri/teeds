import { useEffect, useMemo, useState } from 'react'
import { SUPABASE } from '../../core/teeds/config'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { ClienteRegistro } from '../../core/teeds/clientes'
import { assinarMudancas } from '../../core/teeds/realtime'
import { nomeDoSimbolo as nomeDoAtivo } from '../../core/deriv/simbolos'
import { NOMES_DE_CONTRATO } from '../PositionCard'

/**
 * As operações manuais no Monitoramento ao vivo (23/10/2026, Tiago: "tem que
 * mostrar todas as operações, seja por bot ou manual, com uma tag").
 *
 * Cada navegador grava a operação manual em `operacoes_manuais` na compra
 * (situação "aberta") e de novo no fim (ganhou/perdeu/vendida). Aqui a lista
 * do período chega pelo REST e as mudanças pelo Realtime, sem recarregar.
 */
interface OpManual {
  userId: string; contractId: number; marca: string; demo: boolean; ativo: string; tipo: string; moeda: string
  entrada: number; pagamento: number; resultado: number; markup: number; situacao: string
  compradaEm: string; expiraEm: string | null; encerradaEm: string | null
  /** A vitrine da compra ('n', 'v', '' direto); null = operação de antes desta regra. */
  parceiro: string | null
}
const daLinha = (l: Record<string, any>): OpManual => ({
  userId: l.user_id, contractId: Number(l.contract_id), marca: l.marca, demo: Boolean(l.demo), ativo: l.ativo ?? '', tipo: l.tipo_contrato ?? '', moeda: l.moeda ?? 'USD',
  entrada: Number(l.entrada ?? 0), pagamento: Number(l.pagamento ?? 0), resultado: Number(l.resultado ?? 0), markup: Number(l.markup ?? 0), situacao: l.situacao ?? 'encerrada',
  compradaEm: l.comprada_em, expiraEm: l.expira_em ?? null, encerradaEm: l.encerrada_em ?? null,
  parceiro: l.parceiro ?? null,
})
const chave = (o: Pick<OpManual, 'userId' | 'contractId'>) => `${o.userId}:${o.contractId}`
const usd = (v: number) => `${v < 0 ? '−' : ''}US$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const SITUACAO: Record<string, string> = { aberta: 'Aberta', ganhou: 'Ganhou', perdeu: 'Perdeu', vendida: 'Encerrada antes', encerrada: 'Encerrada' }

export function OperacoesManuais({ sessao, marcas, horas, conta, busca, mostrarMarkup, clientes, garantirClientes, aoContar, doFoco, selo }: {
  sessao: SessaoTeeds
  marcas: string[]
  horas: number
  conta: 'todas' | 'demo' | 'real'
  busca: string
  mostrarMarkup: boolean
  clientes: Map<string, ClienteRegistro>
  garantirClientes: (ids: string[]) => void | Promise<void>
  /** Para os números do topo: quantas abertas agora e quantos clientes operando no manual. */
  aoContar?: (abertas: number, clientesOperando: string[]) => void
  /** A operação entra na visualização? (a vitrine em foco: /n, /v, Direto) */
  doFoco?: (userId: string, parceiro: string | null) => boolean
  /** O selo da vitrine da operação, quando a marca tem parceiros. */
  selo?: (userId: string, parceiro: string | null) => { texto: string; codigo: string } | null
}) {
  const [ops, setOps] = useState<Map<string, OpManual>>(new Map())
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => { const t = window.setInterval(() => setAgora(Date.now()), 1000); return () => window.clearInterval(t) }, [])

  // a foto do período
  useEffect(() => {
    const corte = new Date(Date.now() - horas * 3600_000).toISOString()
    let vivo = true
    void fetch(`${SUPABASE.url}/rest/v1/operacoes_manuais?select=*&marca=in.(${marcas.join(',')})&comprada_em=gte.${encodeURIComponent(corte)}&order=comprada_em.desc&limit=300`, {
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
    }).then((r) => (r.ok ? r.json() : [])).then((linhas: any[]) => {
      if (!vivo) return
      const m = new Map<string, OpManual>()
      for (const l of linhas ?? []) { const o = daLinha(l); m.set(chave(o), o) }
      setOps(m)
      void garantirClientes([...new Set([...m.values()].map((o) => o.userId))])
    }).catch(() => undefined)
    return () => { vivo = false }
  }, [sessao.token, marcas.join(','), horas]) // eslint-disable-line react-hooks/exhaustive-deps

  // as mudanças, ao vivo
  useEffect(() => {
    const assinatura = assinarMudancas({
      token: sessao.token, canal: `manuais-${marcas.join('-')}-${Math.random().toString(36).slice(2, 8)}`,
      tabelas: marcas.map((m) => ({ tabela: 'operacoes_manuais', filtro: `marca=eq.${m}` })),
      aoMudar: (m) => {
        if (m.tipo === 'DELETE' || !m.linha?.contract_id) return
        const o = daLinha(m.linha)
        setOps((mapa) => { const n = new Map(mapa); n.set(chave(o), o); return n })
        void garantirClientes([o.userId])
      },
    })
    return () => assinatura.fechar()
  }, [sessao.token, marcas.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const termo = busca.trim().toLowerCase()
  const lista = useMemo(() => [...ops.values()]
    .filter((o) => (conta === 'todas' || (conta === 'demo') === o.demo))
    .filter((o) => !doFoco || doFoco(o.userId, o.parceiro))
    .filter((o) => {
      if (!termo) return true
      const c = clientes.get(o.userId)
      return [c?.nome, c?.email, o.ativo, nomeDoAtivo(o.ativo)].some((x) => (x ?? '').toLowerCase().includes(termo))
    })
    .sort((a, b) => Number(b.situacao === 'aberta') - Number(a.situacao === 'aberta') || Date.parse(b.compradaEm) - Date.parse(a.compradaEm)),
  [ops, conta, termo, clientes, doFoco])

  const abertas = lista.filter((o) => o.situacao === 'aberta')
  useEffect(() => { aoContar?.(abertas.length, [...new Set(abertas.map((o) => o.userId))]) }, [abertas.length, aoContar]) // eslint-disable-line react-hooks/exhaustive-deps
  const reais = lista.filter((o) => !o.demo && o.situacao !== 'aberta')
  const resultadoReal = reais.reduce((t, o) => t + o.resultado, 0)
  const markupReal = lista.filter((o) => !o.demo).reduce((t, o) => t + o.markup, 0)

  return (
    <section className="mon-manuais" aria-label="Operações manuais">
      <header className="mm-cab">
        <div>
          <h3><span className="mon-tag manual">Manual</span> Operações manuais</h3>
          <p>{abertas.length === 0 ? 'Nenhuma aberta agora' : `${abertas.length} ${abertas.length === 1 ? 'aberta agora' : 'abertas agora'}`} · {lista.length} {lista.length === 1 ? 'operação' : 'operações'} no período</p>
        </div>
        <dl className="mm-somas">
          <div><dt>Resultado em conta real</dt><dd className={resultadoReal > 0 ? 'mm-ganho' : resultadoReal < 0 ? 'mm-perda' : ''}>{usd(resultadoReal)}</dd></div>
          {mostrarMarkup && <div><dt>Markup em conta real</dt><dd className="mm-ouro">{usd(markupReal)}</dd></div>}
        </dl>
      </header>
      {lista.length === 0 ? <p className="mon-manuais-vazio">Nenhuma operação manual no período. Quando um cliente comprar na tela Manual, ela aparece aqui na hora.</p> : (
        <div className="mon-manuais-tabela"><table>
          <thead><tr><th>Hora</th><th>Cliente</th><th>Ativo</th><th>Contrato</th><th>Conta</th><th className="dir">Entrada</th><th>Situação</th><th className="dir">Resultado</th>{mostrarMarkup && <th className="dir">Markup</th>}</tr></thead>
          <tbody>{lista.slice(0, 120).map((o) => {
            const c = clientes.get(o.userId)
            const falta = o.situacao === 'aberta' && o.expiraEm ? Math.max(0, Math.round((Date.parse(o.expiraEm) - agora) / 1000)) : null
            return (
              <tr key={chave(o)} className={o.situacao === 'aberta' ? 'mm-aberta' : ''}>
                <td className="num">{hora(o.compradaEm)}</td>
                <td className="mm-cliente"><b>{c?.nome || c?.email || 'Cliente'}{(() => { const x = selo?.(o.userId, o.parceiro); return x ? <em className={`mon-selo parceiro ${x.codigo}`}>{x.texto}</em> : null })()}</b>{c?.nome && c?.email && <small>{c.email}</small>}</td>
                <td>{nomeDoAtivo(o.ativo)}</td>
                <td>{NOMES_DE_CONTRATO[o.tipo] ?? o.tipo}</td>
                <td><span className={`mon-conta ${o.demo ? 'demo' : 'real'}`}>{o.demo ? 'Demo' : 'Real'}</span></td>
                <td className="num dir">{usd(o.entrada)}</td>
                <td><span className={`mon-sit ${o.situacao}`}>{o.situacao === 'aberta' && <i aria-hidden="true" />}{SITUACAO[o.situacao] ?? o.situacao}{falta !== null && ` · ${String(Math.floor(falta / 60)).padStart(2, '0')}:${String(falta % 60).padStart(2, '0')}`}</span></td>
                <td className={`num dir ${o.situacao === 'aberta' ? '' : o.resultado > 0 ? 'mm-ganho' : o.resultado < 0 ? 'mm-perda' : ''}`}>{o.situacao === 'aberta' ? '—' : `${o.resultado > 0 ? '+' : ''}${usd(o.resultado)}`}</td>
                {mostrarMarkup && <td className="num dir mm-ouro">{usd(o.markup)}{o.demo && <small>Estimado</small>}</td>}
              </tr>
            )
          })}</tbody>
        </table></div>
      )}
    </section>
  )
}
