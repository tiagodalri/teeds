/**
 * Centro de estudo — a página do dono, dentro da Administração.
 *
 * Aqui mora a análise. Ela muda com o que está em foco no topo:
 *
 *  - na REDE, abre com a soma das plataformas e a comparação entre elas;
 *  - numa plataforma, vai direto ao histórico dela, com um caminho de volta
 *    para a comparação.
 *
 * A tela de Robôs ficou só com a faixa do agora. Separar os dois foi o
 * redesenho de 24/09/2026: análise e operação pedem cabeças diferentes.
 */
import { CentroDeEstudoHistorico } from './CentroDeEstudoHistorico'
import { OrigemDasOperacoes } from './OrigemDasOperacoes'
import { AdminPlataformas } from './AdminPlataformas'
import { useEffect, useState } from 'react'
import { ehMaster, REDE, resumoMarkupManual } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCAS } from '../marca/marcas'

export function AdminCentroDeEstudo({ sessao, marcaFoco, onAbrirMarca }: {
  sessao: SessaoTeeds
  marcaFoco: string
  onAbrirMarca: (id: string) => void
}) {
  const naRede = marcaFoco === REDE
  const nome = naRede ? 'A rede' : (MARCAS[marcaFoco]?.prosa ?? marcaFoco)
  return (
    <>
      {naRede && <AdminPlataformas sessao={sessao} marcaFoco={marcaFoco} onAbrirMarca={onAbrirMarca} />}
      <OrigemDasOperacoes sessao={sessao} naRede={naRede} />
      {!naRede && <MarkupManual sessao={sessao} />}
      <section className="admin-card ce-card">
        <header>
          <div>
            <span className="rot">{nome}</span>
            <h3>{naRede ? 'Histórico da rede' : 'Histórico da plataforma'}</h3>
          </div>
          {!naRede && ehMaster() && (
            <button type="button" onClick={() => onAbrirMarca(REDE)}>Comparar com as outras →</button>
          )}
        </header>
        <div className="ce-card-corpo">
          <CentroDeEstudoHistorico sessao={sessao} moeda="US$" />
        </div>
      </section>
    </>
  )
}

/** "frxXAUUSD" → "Ouro (XAU/USD)", "R_75" → "75 Index": o nome que a equipe reconhece. */
function nomeDoAtivo(simbolo: string): string {
  const especiais: Record<string, string> = { frxXAUUSD: 'Ouro (XAU/USD)', frxXAGUSD: 'Prata (XAG/USD)', frxXPTUSD: 'Platina (XPT/USD)', frxXPDUSD: 'Paládio (XPD/USD)' }
  if (especiais[simbolo]) return especiais[simbolo]
  const fx = simbolo.match(/^frx([A-Z]{3})([A-Z]{3})$/)
  if (fx) return `${fx[1]}/${fx[2]}`
  const r = simbolo.match(/^R_(\d+)$/)
  if (r) return `${r[1]} Index`
  const s1 = simbolo.match(/^1HZ(\d+)V$/)
  if (s1) return `${s1[1]} (1s) Index`
  return simbolo
}
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * O markup das operações manuais (23/10/2026): a soma por ativo, separando
 * conta real e virtual. Vem de operacoes_manuais, que cada navegador grava
 * quando uma entrada manual encerra.
 */
function MarkupManual({ sessao }: { sessao: SessaoTeeds }) {
  const [dias, setDias] = useState(30)
  const [linhas, setLinhas] = useState<Awaited<ReturnType<typeof resumoMarkupManual>> | null>(null)
  useEffect(() => { setLinhas(null); void resumoMarkupManual(sessao, dias).then(setLinhas) }, [sessao.usuario.id, dias])
  const reais = (linhas ?? []).filter((l) => !l.demo)
  const total = reais.reduce((t, l) => ({ markup: t.markup + l.markup, operacoes: t.operacoes + l.operacoes, entradas: t.entradas + l.entradas }), { markup: 0, operacoes: 0, entradas: 0 })
  return (
    <section className="admin-card ce-card">
      <header>
        <div><span className="rot">Modo CEO</span><h3>Markup das operações manuais</h3></div>
        <div className="mm-periodo" role="group" aria-label="Período">
          {[1, 7, 30].map((d) => <button key={d} type="button" className={dias === d ? 'on' : ''} onClick={() => setDias(d)}>{d === 1 ? 'Hoje' : `${d} dias`}</button>)}
        </div>
      </header>
      <div className="ce-card-corpo mm-corpo">
        <div className="mm-numeros">
          <div><small>Markup na conta real</small><b>{usd(total.markup)}</b></div>
          <div><small>Entradas reais</small><b>{total.operacoes}</b></div>
          <div><small>Volume real</small><b>{usd(total.entradas)}</b></div>
        </div>
        {linhas === null ? <p className="adm-vazio">Carregando…</p> : linhas.length === 0 ? <p className="adm-vazio">Nenhuma operação manual registrada no período. A contagem começou em 23/10/2026.</p> : (
          <div className="adm-tabela-aulas"><table>
            <thead><tr><th>Ativo</th><th>Conta</th><th>Entradas</th><th>Clientes</th><th>Volume</th><th>Resultado dos clientes</th><th>Markup</th></tr></thead>
            <tbody>{linhas.map((l) => (
              <tr key={l.ativo + l.demo}>
                <td><b>{nomeDoAtivo(l.ativo)}</b></td>
                <td>{l.demo ? 'Virtual' : 'Real'}</td>
                <td className="num">{l.operacoes}</td>
                <td className="num">{l.clientes}</td>
                <td className="num">{usd(l.entradas)}</td>
                <td className={`num ${l.resultado >= 0 ? 'positivo' : 'negativo'}`}>{usd(l.resultado)}</td>
                <td className="num"><b>{usd(l.markup)}</b>{l.demo && <small>estimado, conta virtual</small>}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
        <p className="mm-nota">Markup = o valor oficial da Deriv quando a proposta informa; senão, 3% do pagamento potencial de cada contrato, que é a regra da Deriv para opções. Conferido contra o total oficial diário da Deriv: diferença entre 1% e 5%. Na conta virtual o markup é só uma estimativa: não vira receita.</p>
      </div>
    </section>
  )
}
