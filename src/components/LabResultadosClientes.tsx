/** Laboratório (?tela=resultados-clientes): Administração › Resultados por cliente com clientes de exemplo, sem banco (12/11/2026). */
import { useEffect, useRef } from 'react'
import { observarTabelas } from '../core/rotulosDeTabela'
import { RelatorioClientes } from './RelatorioClientes'

const hoje = new Date()
const dia = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
/* Números escolhidos para pegar ordenação por texto: 9,50 contra 10.000, negativos, último dia vazio. */
const CLIENTES: Array<[string, number, number, number, number, number, number | null]> = [
  // nome, contas, operações, entradas, pagamentos, comissão, último dia (dias atrás)
  ['Phelype Augusto', 1, 1625, 4332.2, 6649.32, 199.48, 0],
  ['ana Beatriz', 2, 12, 9.5, 4.1, 0.28, 3],
  ['Érico Lima', 1, 310, 10000, 10850.75, 300, 1],
  ['Bruno Tavares', 3, 88, 820.4, 640.1, 24.61, null],
  ['Zélia Martins', 1, 2, 2, 3.9, 0.06, 12],
  ['Carla Nogueira', 1, 945, 2150, 1890.35, 64.5, 5],
]
const linhas = CLIENTES.map(([nome, contas, ops, ent, pag, com, d], i) => ({
  user_id: `u${i}`, nome, email: `${nome.split(' ')[0].toLowerCase()}@exemplo.com`,
  contas_reais: contas, operacoes_real: ops, entradas_real: ent, pagamentos_real: pag, resultado_real: Math.round((pag - ent) * 100) / 100,
  comissao_real: com, operacoes_robos_real: Math.max(0, ops - i), resultado_robos_real: 0, markup_robos_real: 0, ultimo_dia_real: d === null ? null : dia(d),
  contas_demo: 1, operacoes_demo: (i + 1) * 40, entradas_demo: 100 * i, pagamentos_demo: 90 * i, resultado_demo: -10 * i, comissao_demo: i,
  operacoes_robos_demo: (i + 1) * 40, resultado_robos_demo: 0, markup_robos_demo: 0, ultimo_dia_demo: dia(i),
  dias_com_dados: 5, dias_sem_resultado: 0, visto_em: null,
}))

export default function LabResultadosClientes() {
  const raiz = useRef<HTMLDivElement>(null)
  useEffect(() => raiz.current ? observarTabelas(raiz.current) : undefined, [])
  const f = window.fetch
  window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => {
    const url = String(u)
    if (url.includes('teeds_relatorio_clientes_por_conta')) return new Response(JSON.stringify(linhas), { status: 200 })
    if (url.includes('teeds_comissao_conferencia')) return new Response('[]', { status: 200 })
    return f(u, i)
  }) as typeof fetch
  return (
    <div className="app workspace-app" style={{ minHeight: '100dvh' }}>
      <main className="admin-main" ref={raiz} style={{ padding: 24 }}>
        <RelatorioClientes sessao={{ token: 'lab' } as never} />
      </main>
    </div>
  )
}
