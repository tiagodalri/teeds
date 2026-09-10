import type { SessaoViva } from '../core/teeds/servidorRobos'

export interface ResumoContaRobos {
  chave: string
  contaId: string
  demo: boolean
  moeda: string
  ativos: number
  resultado: number | null
  operacoes: number | null
}

/** Totais da sessão no servidor, nunca do histórico limitado de operações.
 * Cada conta/ambiente/moeda permanece independente. A última ocorrência
 * de um ID prevalece, inclusive quando informa que a sessão já parou.
 */
export function resumirSessoes(sessoes: readonly SessaoViva[]): ResumoContaRobos[] {
  const unicas = new Map(sessoes.filter((sessao) => sessao.id).map((sessao) => [sessao.id, sessao]))
  const contas = new Map<string, ResumoContaRobos>()

  for (const sessao of unicas.values()) {
    if (sessao.estado?.rodando !== true) continue

    const chave = JSON.stringify([sessao.contaId, sessao.demo, sessao.moeda])
    const conta = contas.get(chave) ?? {
      chave,
      contaId: sessao.contaId,
      demo: sessao.demo,
      moeda: sessao.moeda,
      ativos: 0,
      resultado: 0,
      operacoes: 0,
    }
    conta.ativos += 1

    // Um total incompleto não deve parecer zero nem um total consolidado.
    conta.resultado = conta.resultado !== null && Number.isFinite(sessao.estado.resultado)
      ? conta.resultado + sessao.estado.resultado
      : null
    conta.operacoes = conta.operacoes !== null
      && Number.isInteger(sessao.estado.operacoes) && sessao.estado.operacoes >= 0
      ? conta.operacoes + sessao.estado.operacoes
      : null
    contas.set(chave, conta)
  }

  return [...contas.values()]
}

const numero = (valor: number) => valor.toLocaleString('pt-BR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function RobotOverview({ sessoes }: { sessoes: readonly SessaoViva[] }) {
  const contas = resumirSessoes(sessoes)

  return (
    <section className="rob-overview" aria-label="Resumo dos robôs em execução">
      <header className="rob-overview-heading">
        <div>
          <span className="rob-overview-eyebrow">Visão geral</span>
          <h3>Suas sessões, por conta</h3>
        </div>
        <p>Resumo periódico do servidor. Contas e moedas separadas.</p>
      </header>

      {contas.length === 0 ? (
        <p className="rob-overview-empty">Nenhuma sessão em execução neste resumo. Os resultados aparecem quando um robô é iniciado.</p>
      ) : (
        <div className="rob-overview-grid">
          {contas.map((conta) => (
            <article className="rob-overview-card" key={conta.chave}>
              <div className="rob-overview-account">
                <span className={`rob-overview-badge ${conta.demo ? 'rob-overview-demo' : 'rob-overview-real'}`}>
                  {conta.demo ? 'DEMO' : 'REAL'}
                </span>
                <span>Conta ••••{conta.contaId.slice(-4)}</span>
                <small>{conta.moeda}</small>
              </div>
              <dl className="rob-overview-metrics">
                <div className="rob-overview-result">
                  <dt>Resultado das sessões</dt>
                  <dd className={conta.resultado === null || conta.resultado === 0
                    ? 'rob-overview-neutral'
                    : conta.resultado > 0 ? 'rob-overview-positive' : 'rob-overview-negative'}>
                    {conta.resultado === null
                      ? 'Indisponível'
                      : `${conta.resultado > 0 ? '+' : conta.resultado < 0 ? '−' : ''}${numero(Math.abs(conta.resultado))}`}
                    {conta.resultado !== null && <small>{conta.moeda}</small>}
                  </dd>
                </div>
                <div><dt>Em execução</dt><dd>{conta.ativos} <small>{conta.ativos === 1 ? 'robô' : 'robôs'}</small></dd></div>
                <div><dt>Operações</dt><dd>{conta.operacoes === null ? 'Indisponível' : conta.operacoes.toLocaleString('pt-BR')}</dd></div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
