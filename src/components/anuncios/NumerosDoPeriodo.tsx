import type { Metricas } from '../../core/teeds/anuncios'
import './numeros-do-periodo.css'

/*
  Os números do período no topo (09/11/2026, Tiago: "melhore mais ainda, quero uma experiência FODA").
  Antes era uma frase ("De 02/11 a 08/11, como no Gerenciador: R$ 144,43 de valor gasto, 8 resultados..."):
  virou cinco cartões com o número grande e a linha de cada dia embaixo. Os números são os do Gerenciador,
  os mesmos de antes (um número só por indicador, o da Meta).
*/

type Dia = Metricas & { dia: string }

/** A linhazinha de cada cartão: um ponto por dia; dia sem valor (custo sem cadastro) fica de fora. */
function Linha({ valores, ruimSobe = false, julgar = false }: { valores: Array<number | null>; ruimSobe?: boolean; julgar?: boolean }) {
  const pontos = valores.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] != null && Number.isFinite(p[1]))
  if (valores.length < 2 || pontos.length < 2) return <div className="np-linha vazia" aria-hidden="true" />
  const min = Math.min(...pontos.map((p) => p[1])), max = Math.max(...pontos.map((p) => p[1]))
  const x = (i: number) => 3 + (i / (valores.length - 1)) * 94
  const y = (v: number) => (max === min ? 50 : 88 - ((v - min) / (max - min)) * 76)
  const linha = pontos.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(2)} ${y(v).toFixed(2)}`).join(' ')
  const area = `${linha} L${x(pontos[pontos.length - 1][0]).toFixed(2)} 100 L${x(pontos[0][0]).toFixed(2)} 100 Z`
  const [ui, uv] = pontos[pontos.length - 1]
  // a cor do fim da linha diz se o último dia foi melhor ou pior que a média (no custo, subir é ruim)
  const media = pontos.reduce((s, p) => s + p[1], 0) / pontos.length
  const tom = !julgar || uv === media ? '' : (uv > media) !== ruimSobe ? 'bom' : 'ruim'
  return (
    <div className={`np-linha ${tom}`} aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"><path className="area" d={area} /><path className="traco" d={linha} /></svg>
      <i style={{ left: `${x(ui)}%`, top: `${y(uv)}%` }} />
    </div>
  )
}

export function NumerosDoPeriodo({ total, porDia, periodo, alertas, verAlertas, brl, int }: {
  total: Metricas; porDia: Dia[]; periodo: string; alertas: number; verAlertas: () => void
  brl: (v: number) => string; int: (v: number) => string
}) {
  const dias = Math.max(1, porDia.length)
  const custo = total.cadastros ? total.gasto / total.cadastros : null
  const custos = porDia.map((d) => (d.cadastros ? d.gasto / d.cadastros : null))
  const melhor = porDia.reduce<{ dia: string; v: number } | null>((m, d) => (d.cadastros && (!m || d.gasto / d.cadastros < m.v) ? { dia: d.dia, v: d.gasto / d.cadastros } : m), null)
  const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
  const varios = porDia.length > 1
  const dec = (v: number, c = 1) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
  const cartoes = [
    { id: 'gasto', nome: 'Valor gasto', valor: brl(total.gasto), sub: varios ? `${brl(total.gasto / dias)} por dia em média` : 'no dia', linha: porDia.map((d) => d.gasto), destaque: true },
    { id: 'res', nome: 'Resultados', valor: int(total.cadastros), sub: varios ? `${dec(total.cadastros / dias)} por dia em média` : total.cadastros === 1 ? 'cadastro na Meta' : 'cadastros na Meta', linha: porDia.map((d) => d.cadastros), julgar: true },
    { id: 'custo', nome: 'Custo por resultado', valor: custo == null ? '—' : brl(custo), sub: melhor && varios ? `melhor dia: ${brl(melhor.v)} em ${ddmm(melhor.dia)}` : custo == null ? 'ainda sem resultado' : 'o que cada cadastro custou', linha: custos, ruimSobe: true, julgar: true },
    { id: 'alcance', nome: 'Alcance', valor: int(total.alcance), sub: 'pessoas diferentes que viram', linha: porDia.map((d) => d.alcance) },
    { id: 'freq', nome: 'Frequência', valor: dec(total.frequencia, 2), sub: 'vezes que cada pessoa viu', linha: porDia.map((d) => d.frequencia), ruimSobe: true },
  ]
  return (
    <section className="np" aria-label="Números do período, como no Gerenciador">
      <header>
        {/* 09/11/2026: só anúncio, sempre (a Meta só conhece quem veio de anúncio); o filtro da jornada não mexe aqui */}
        <span title="Números da Meta, iguais aos do Gerenciador: só quem veio dos anúncios. O filtro de origem da jornada não muda estes números."><b>Só anúncios · como no Gerenciador</b> · {periodo}</span>
        {alertas > 0 && <button type="button" onClick={verAlertas}><i aria-hidden="true" />{alertas === 1 ? '1 ponto pede atenção' : `${alertas} pontos pedem atenção`}</button>}
      </header>
      <div className="np-cartoes">
        {cartoes.map((c) => (
          <div key={c.id} className={`np-cartao ${c.destaque ? 'destaque' : ''}`}>
            <small>{c.nome}</small>
            <b>{c.valor}</b>
            <span>{c.sub}</span>
            <Linha valores={c.linha} ruimSobe={c.ruimSobe} julgar={c.julgar} />
          </div>
        ))}
      </div>
    </section>
  )
}
