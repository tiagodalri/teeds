import { useMemo, useState, type CSSProperties } from 'react'

type RoboId = 'superior5' | 'ag2' | 'firstblock' | 'secondblock'
type PerfilRobo = { id: RoboId; nome: string; regra: string; chance: number; retornoLiquido: number; galeApos: number; cor: string }

const ROBOS: PerfilRobo[] = [
  { id: 'superior5', nome: 'Teeds - AG7', regra: 'vence com os dígitos 7, 8 e 9', chance: 30, retornoLiquido: 1.92, galeApos: 3, cor: '#e8892b' },
  { id: 'ag2', nome: 'Teeds - AG2', regra: 'vence com os dígitos 0, 1 e 2', chance: 30, retornoLiquido: 1.92, galeApos: 3, cor: '#0ea5e9' },
  { id: 'firstblock', nome: 'First Block', regra: 'vence com os dígitos de 0 a 4', chance: 50, retornoLiquido: .92, galeApos: 3, cor: '#d0aa52' },
  { id: 'secondblock', nome: 'Second Block', regra: 'vence com os dígitos de 5 a 9', chance: 50, retornoLiquido: .92, galeApos: 3, cor: '#b86f3c' },
]

const formatarMoeda = (v: number, codigo: string) => v.toLocaleString('pt-BR', { style: 'currency', currency: codigo })
const n = (v: string, fallback: number) => {
  const valor = Number(v.replace(',', '.'))
  return Number.isFinite(valor) && valor >= 0 ? valor : fallback
}
const centavosAcima = (v: number) => Math.ceil(v * 100) / 100

export function OperationalManagementPanel({ moeda = 'USD' }: { moeda?: string }) {
  const [roboId, setRoboId] = useState<RoboId>('superior5')
  const [banca, setBanca] = useState('1000')
  const [entrada, setEntrada] = useState('5')
  const [stopPct, setStopPct] = useState('10')
  const [metaPct, setMetaPct] = useState('3')
  const [recuperacoesDesejadas, setRecuperacoesDesejadas] = useState('3')
  const robo = ROBOS.find((item) => item.id === roboId) ?? ROBOS[0]

  const calc = useMemo(() => {
    const saldo = Math.max(.01, n(banca, 1000))
    const base = Math.max(.01, n(entrada, 5))
    const stop = saldo * Math.min(100, n(stopPct, 10)) / 100
    const meta = saldo * Math.min(100, n(metaPct, 3)) / 100
    const desejadas = Math.min(12, Math.max(0, Math.round(n(recuperacoesDesejadas, 3))))
    const retornoSeguro = Math.max(.01, robo.retornoLiquido * .97)
    const lucroMinimo = Math.max(.01, base * .05)
    const limite = Math.min(stop, saldo)
    const linhas: Array<{ passo: number; rotulo: string; valor: number; acumulado: number; dentro: boolean; recuperacao: boolean }> = []
    let acumulado = 0
    let recuperacao = 0

    for (let passo = 0; passo < robo.galeApos + 13; passo++) {
      const emRecuperacao = passo >= robo.galeApos
      if (emRecuperacao) recuperacao += 1
      const valor = emRecuperacao ? centavosAcima((acumulado + lucroMinimo) / retornoSeguro) : base
      acumulado += valor
      linhas.push({
        passo,
        rotulo: emRecuperacao ? `Recuperação ${recuperacao}` : `Entrada base ${passo + 1}`,
        valor,
        acumulado,
        dentro: acumulado <= limite,
        recuperacao: emRecuperacao,
      })
      if (acumulado > limite || recuperacao >= 12) break
    }

    const dentro = linhas.filter((linha) => linha.dentro)
    const recuperacoesSuportadas = dentro.filter((linha) => linha.recuperacao).length
    const ultima = dentro[dentro.length - 1]
    const exposicaoPara = (baseTeste: number) => {
      let perda = 0
      for (let passo = 0; passo < robo.galeApos + desejadas; passo++) {
        const valor = passo < robo.galeApos
          ? baseTeste
          : centavosAcima((perda + Math.max(.01, baseTeste * .05)) / retornoSeguro)
        perda += valor
      }
      return perda
    }
    let baixo = 0
    let alto = limite
    for (let i = 0; i < 50; i++) {
      const meio = (baixo + alto) / 2
      if (exposicaoPara(meio) <= limite) baixo = meio
      else alto = meio
    }
    const entradaSegura = Math.floor(baixo * 100) / 100
    const exposicaoPlanejada = exposicaoPara(base)
    return { saldo, base, stop, meta, desejadas, linhas, recuperacoesSuportadas, ultimaEntrada: ultima?.valor ?? 0, entradaSegura, exposicaoPlanejada }
  }, [banca, entrada, stopPct, metaPct, recuperacoesDesejadas, robo])

  const saudavel = calc.exposicaoPlanejada <= calc.stop
  const riscoPct = Math.min(100, (calc.exposicaoPlanejada / calc.saldo) * 100)

  return (
    <main className="go ger" style={{ '--go-robo': robo.cor } as CSSProperties}>
      <header className="go-hero">
        <div><span className="go-selo">Planejamento Teeds</span><h2>Gerenciamento Operacional</h2><p>Calcule banca e stop com a progressão específica de cada robô.</p></div>
        <div className={`go-status ${saudavel ? 'ok' : 'alerta'}`}><i />{saudavel ? 'Plano dentro do limite' : 'Risco acima do stop diário'}</div>
      </header>

      <section className="go-robo-seletor">
        <div className="go-robo-intro"><span>01</span><div><small>Escolha o robô</small><strong>{robo.nome}</strong><p>{robo.regra}. O cálculo abaixo já aplica a recuperação própria deste modelo.</p></div></div>
        <div className="go-robos" role="group" aria-label="Robô para o cálculo">
          {ROBOS.map((item) => <button key={item.id} className={item.id === robo.id ? 'on' : ''} onClick={() => setRoboId(item.id)} style={{ '--robo-cor': item.cor } as CSSProperties}>
            <i /><span><b>{item.nome}</b><small>{item.chance}% de acerto teórico</small></span><em>✓</em>
          </button>)}
        </div>
      </section>

      <section className="go-grade">
        <aside className="go-config">
          <div className="go-bloco-titulo"><span>02</span><div><h3>Monte seu plano</h3><p>Altere os valores e veja tudo recalculado na hora.</p></div></div>
          <div className="go-campos">
            <label><span>Banca disponível</span><div><em>{moeda}</em><input inputMode="decimal" value={banca} onChange={(e) => setBanca(e.target.value)} /></div></label>
            <label><span>Entrada inicial</span><div><em>{moeda}</em><input inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} /></div></label>
            <label><span>Stop diário</span><div><input inputMode="decimal" value={stopPct} onChange={(e) => setStopPct(e.target.value)} /><em>%</em></div></label>
            <label><span>Meta diária</span><div><input inputMode="decimal" value={metaPct} onChange={(e) => setMetaPct(e.target.value)} /><em>%</em></div></label>
            <label><span>Recuperações que deseja suportar</span><div><input inputMode="numeric" value={recuperacoesDesejadas} onChange={(e) => setRecuperacoesDesejadas(e.target.value)} /><em>níveis</em></div></label>
          </div>
          <div className="go-regra"><b>Como o {robo.nome} calcula</b><p>Após {robo.galeApos} perdas no valor-base, cada nova entrada busca recuperar o acumulado e acrescentar uma margem pequena. O retorno usado é conservador e varia conforme o robô.</p></div>
        </aside>

        <div className="go-resultados">
          <div className="go-cards">
            <article><span>Stop diário</span><strong>{formatarMoeda(calc.stop, moeda)}</strong><small>{stopPct || 0}% da banca</small></article>
            <article><span>Até qual recuperação</span><strong>{calc.recuperacoesSuportadas > 0 ? `Nível ${calc.recuperacoesSuportadas}` : 'Nenhuma'}</strong><small>última entrada possível: {formatarMoeda(calc.ultimaEntrada, moeda)}</small></article>
            <article><span>Entrada sugerida</span><strong>{formatarMoeda(calc.entradaSegura, moeda)}</strong><small>para suportar {calc.desejadas} recuperações</small></article>
            <article className={saudavel ? '' : 'perigo'}><span>Stop necessário do ciclo</span><strong>{formatarMoeda(calc.exposicaoPlanejada, moeda)}</strong><small>{saudavel ? 'dentro do stop definido' : 'acima do stop definido'}</small></article>
          </div>

          <section className="go-exposicao">
            <div className="go-bloco-titulo"><span>03</span><div><h3>Exposição do ciclo</h3><p>{robo.nome}: {robo.galeApos} entradas-base + {calc.desejadas} recuperações.</p></div><b>{riscoPct.toFixed(1).replace('.', ',')}%</b></div>
            <div className="go-barra"><i style={{ width: `${riscoPct}%` }} className={saudavel ? '' : 'perigo'} /></div>
            <div className="go-legenda"><span>Exposição: <b>{formatarMoeda(calc.exposicaoPlanejada, moeda)}</b></span><span>Stop: <b>{formatarMoeda(calc.stop, moeda)}</b></span><span>Meta: <b>{formatarMoeda(calc.meta, moeda)}</b></span></div>
          </section>

          <section className="go-planilha">
            <div className="go-bloco-titulo"><span>04</span><div><h3>Sequência do {robo.nome}</h3><p>Veja exatamente onde a banca deixa de suportar uma nova entrada.</p></div></div>
            <div className="go-tabela-cab"><span>Etapa</span><span>Entrada</span><span>Exposição acumulada</span><span>Situação</span></div>
            <div className="go-tabela-corpo">
              {calc.linhas.map((linha) => <div key={linha.passo}>
                <span><i>{linha.recuperacao ? `R${linha.passo - robo.galeApos + 1}` : `E${linha.passo + 1}`}</i>{linha.rotulo}</span>
                <b>{formatarMoeda(linha.valor, moeda)}</b><b>{formatarMoeda(linha.acumulado, moeda)}</b>
                <em className={linha.dentro ? 'ok' : 'fora'}>{linha.dentro ? 'Banca suporta' : 'Ultrapassa o stop'}</em>
              </div>)}
            </div>
          </section>
        </div>
      </section>
      <p className="go-aviso">Estimativa educacional baseada no retorno líquido conservador de cada contrato. O pagamento real pode oscilar e martingale não garante recuperação ou lucro. Valide o plano em conta demo.</p>
    </main>
  )
}
