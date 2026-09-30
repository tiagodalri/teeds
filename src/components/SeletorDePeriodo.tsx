/**
 * O período, com as datas à mostra.
 *
 * Um botão escrito "30 dias" não diz onde a conta começa — e foi assim que a
 * plataforma pareceu errada: o painel da Deriv chama de "últimos 30 dias" a
 * janela que começa 30 dias ATRÁS (31 datas, contando hoje), enquanto a nossa
 * começava no dia seguinte. Os 148 contratos de 31/08 ficavam de fora, e as
 * duas telas nunca iam bater. (Tiago, 30/09/2026.)
 *
 * Nada some nem aparece por mágica: a janela vem escrita embaixo do botão.
 */

/** O primeiro dia de uma janela de N dias que termina hoje. */
export const primeiroDia = (dias: number): Date => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (dias - 1))
  return d
}

const curto = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

/** "01/09 a 30/09" — a janela por extenso, para conferir contra a corretora. */
export const janelaEmDatas = (dias: number): string => `${curto(primeiroDia(dias))} a ${curto(new Date())}`

export function SeletorDePeriodo<T extends number>({ dias, opcoes, onTrocar, rotulo = 'Período' }: {
  dias: T
  opcoes: readonly T[]
  onTrocar: (d: T) => void
  rotulo?: string
}) {
  return (
    <div className="ce-periodo-bloco">
      <div className="ce-periodo" role="group" aria-label={rotulo}>
        {opcoes.map((d) => (
          <button key={d} type="button" aria-pressed={dias === d} onClick={() => onTrocar(d)}>{d} dias</button>
        ))}
      </div>
      <small className="ce-periodo-datas">{janelaEmDatas(dias)}</small>
    </div>
  )
}
