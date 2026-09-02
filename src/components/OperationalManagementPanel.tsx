import { useMemo, useState } from 'react'

const formatarMoeda = (v: number, codigo: string) => v.toLocaleString('pt-BR', { style: 'currency', currency: codigo })
const n = (v: string, fallback: number) => {
  const valor = Number(v.replace(',', '.'))
  return Number.isFinite(valor) && valor >= 0 ? valor : fallback
}

export function OperationalManagementPanel({ moeda = 'USD' }: { moeda?: string }) {
  const [banca, setBanca] = useState('1000')
  const [entrada, setEntrada] = useState('5')
  const [multiplicador, setMultiplicador] = useState('2')
  const [stopPct, setStopPct] = useState('10')
  const [metaPct, setMetaPct] = useState('3')
  const [galesDesejados, setGalesDesejados] = useState('3')

  const calc = useMemo(() => {
    const saldo = Math.max(.01, n(banca, 1000))
    const base = Math.max(.01, n(entrada, 5))
    const mult = Math.max(1, n(multiplicador, 2))
    const stop = saldo * Math.min(100, n(stopPct, 10)) / 100
    const meta = saldo * Math.min(100, n(metaPct, 3)) / 100
    const desejados = Math.min(12, Math.max(0, Math.round(n(galesDesejados, 3))))
    const linhas: Array<{ passo: number; valor: number; acumulado: number; dentro: boolean }> = []
    let acumulado = 0
    for (let passo = 0; passo <= 12; passo++) {
      const valor = base * Math.pow(mult, passo)
      acumulado += valor
      linhas.push({ passo, valor, acumulado, dentro: acumulado <= stop && acumulado <= saldo })
      if (acumulado > Math.min(stop, saldo)) break
    }
    const suportados = linhas.filter((l) => l.dentro).length
    const coef = mult === 1 ? desejados + 1 : (Math.pow(mult, desejados + 1) - 1) / (mult - 1)
    const entradaSegura = Math.max(0, Math.min(stop, saldo) / coef)
    const exposicaoPlanejada = base * coef
    return { saldo, base, mult, stop, meta, desejados, linhas, suportados, entradaSegura, exposicaoPlanejada }
  }, [banca, entrada, multiplicador, stopPct, metaPct, galesDesejados])

  const saudavel = calc.exposicaoPlanejada <= calc.stop
  const riscoPct = Math.min(100, (calc.exposicaoPlanejada / calc.saldo) * 100)

  return (
    <main className="go ger">
      <header className="go-hero">
        <div><span className="go-selo">Planejamento Teeds</span><h2>Gerenciamento Operacional</h2><p>Transforme sua banca em limites claros antes de iniciar qualquer sessão.</p></div>
        <div className={`go-status ${saudavel ? 'ok' : 'alerta'}`}><i />{saudavel ? 'Plano dentro do limite' : 'Risco acima do stop diário'}</div>
      </header>

      <section className="go-grade">
        <aside className="go-config">
          <div className="go-bloco-titulo"><span>01</span><div><h3>Monte seu plano</h3><p>Altere os valores e veja tudo recalculado na hora.</p></div></div>
          <div className="go-campos">
            <label><span>Banca disponível</span><div><em>{moeda}</em><input inputMode="decimal" value={banca} onChange={(e) => setBanca(e.target.value)} /></div></label>
            <label><span>Entrada inicial</span><div><em>{moeda}</em><input inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} /></div></label>
            <label><span>Multiplicador do gale</span><div><input inputMode="decimal" value={multiplicador} onChange={(e) => setMultiplicador(e.target.value)} /><em>×</em></div></label>
            <label><span>Stop diário</span><div><input inputMode="decimal" value={stopPct} onChange={(e) => setStopPct(e.target.value)} /><em>%</em></div></label>
            <label><span>Meta diária</span><div><input inputMode="decimal" value={metaPct} onChange={(e) => setMetaPct(e.target.value)} /><em>%</em></div></label>
            <label><span>Gales que deseja suportar</span><div><input inputMode="numeric" value={galesDesejados} onChange={(e) => setGalesDesejados(e.target.value)} /><em>gales</em></div></label>
          </div>
          <div className="go-regra"><b>Regra de proteção</b><p>Ao atingir o stop diário, encerre a sessão. Não aumente a banca planejada para tentar recuperar perdas.</p></div>
        </aside>

        <div className="go-resultados">
          <div className="go-cards">
            <article><span>Stop diário</span><strong>{formatarMoeda(calc.stop, moeda)}</strong><small>{stopPct || 0}% da banca</small></article>
            <article><span>Meta diária</span><strong className="verde">{formatarMoeda(calc.meta, moeda)}</strong><small>{metaPct || 0}% da banca</small></article>
            <article><span>Gales suportados</span><strong>{Math.max(0, calc.suportados - 1)}</strong><small>numa sequência com entrada de {formatarMoeda(calc.base, moeda)}</small></article>
            <article className={saudavel ? '' : 'perigo'}><span>Entrada sugerida</span><strong>{formatarMoeda(calc.entradaSegura, moeda)}</strong><small>para suportar {calc.desejados} gales</small></article>
          </div>

          <section className="go-exposicao">
            <div className="go-bloco-titulo"><span>02</span><div><h3>Exposição do ciclo</h3><p>Quanto da banca fica comprometido se toda a sequência perder.</p></div><b>{riscoPct.toFixed(1).replace('.', ',')}%</b></div>
            <div className="go-barra"><i style={{ width: `${riscoPct}%` }} className={saudavel ? '' : 'perigo'} /></div>
            <div className="go-legenda"><span>Exposição: <b>{formatarMoeda(calc.exposicaoPlanejada, moeda)}</b></span><span>Limite: <b>{formatarMoeda(calc.stop, moeda)}</b></span></div>
          </section>

          <section className="go-planilha">
            <div className="go-bloco-titulo"><span>03</span><div><h3>Planilha da sequência</h3><p>Entrada inicial mais cada tentativa de recuperação.</p></div></div>
            <div className="go-tabela-cab"><span>Etapa</span><span>Entrada</span><span>Exposição acumulada</span><span>Situação</span></div>
            <div className="go-tabela-corpo">
              {calc.linhas.map((l) => <div key={l.passo}>
                <span><i>{l.passo === 0 ? 'E' : `G${l.passo}`}</i>{l.passo === 0 ? 'Entrada' : `Martingale ${l.passo}`}</span>
                <b>{formatarMoeda(l.valor, moeda)}</b><b>{formatarMoeda(l.acumulado, moeda)}</b>
                <em className={l.dentro ? 'ok' : 'fora'}>{l.dentro ? 'Dentro do plano' : 'Ultrapassa o stop'}</em>
              </div>)}
            </div>
          </section>
        </div>
      </section>
      <p className="go-aviso">Simulação educacional. Martingale aumenta rapidamente a exposição e não garante recuperação ou lucro. Use conta demo para testar seu plano.</p>
    </main>
  )
}
