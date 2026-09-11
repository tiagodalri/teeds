import { useMemo, useState, type CSSProperties } from 'react'
import { identidade } from '../core/deriv/branding'
import { avaliarPlano, chanceDaSequencia, chanceDeAcerto, lucroPorDolar, maiorEntradaPara } from '../core/deriv/escada'
import { recuperacaoDoRobo } from '../core/deriv/strategies'
import { MARCA } from '../marca'
import { prepararPlano } from './RobotSetup'

/*
  O nome e a cor vêm do catálogo, não daqui — com duas marcas, uma cópia
  local mostraria "Teeds - AG7" na OMNI.

  E a escada vem do mesmo cálculo do motor (escada.ts), com o pagamento real
  de cada contrato na plataforma. Esta tela chegou a usar prêmios próprios,
  "conservadores", e prometia ao aluno uma escada que o robô não sobe.
*/
const REGRAS: Record<string, string> = {
  superior5: 'vence com os dígitos 7, 8 e 9',
  ag2: 'vence com os dígitos 0, 1 e 2',
  smart03: 'vence com os dígitos de 4 a 9',
  goreme: 'vence com os dígitos de 0 a 8',
  firstblock: 'vence com os dígitos de 0 a 4',
  secondblock: 'vence com os dígitos de 5 a 9',
  thepalm: 'entra em "0 a 8" e recupera em "0 a 4"',
}
// Só os robôs que esta plataforma oferece, na ordem da vitrine da marca.
const ROBOS = MARCA.robos.filter((id) => REGRAS[id]).map((id) => ({ id, nome: identidade(id).nome, cor: identidade(id).cor, regra: REGRAS[id] }))

const formatarMoeda = (v: number, codigo: string) => v.toLocaleString('pt-BR', { style: 'currency', currency: codigo })
const numero = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const n = (v: string, fallback: number) => {
  const valor = Number(v.replace(',', '.'))
  return Number.isFinite(valor) && valor >= 0 ? valor : fallback
}
const plural = (q: number, um: string, varios: string) => `${q} ${q === 1 ? um : varios}`

export function OperationalManagementPanel({ moeda = 'USD', onUsarPlano }: { moeda?: string; onUsarPlano?: () => void }) {
  const [roboId, setRoboId] = useState(ROBOS[0]?.id ?? 'superior5')
  const [banca, setBanca] = useState('1000')
  const [entrada, setEntrada] = useState('0,35')
  const [stopPct, setStopPct] = useState('10')
  const [metaPct, setMetaPct] = useState('3')
  const robo = ROBOS.find((item) => item.id === roboId) ?? ROBOS[0]
  const { galeApos } = recuperacaoDoRobo(robo.id)

  const calc = useMemo(() => {
    const saldo = Math.max(.01, n(banca, 1000))
    const base = Math.max(.35, n(entrada, .35))
    const stop = Math.min(saldo, saldo * Math.min(100, n(stopPct, 10)) / 100)
    const meta = saldo * Math.min(100, n(metaPct, 3)) / 100
    const plano = avaliarPlano(robo.id, base, stop)
    const sugerida = stop > 0 ? maiorEntradaPara(robo.id, 4, stop) : null
    const chance = plano.errosSeguidos > 0 ? chanceDaSequencia(robo.id, plano.errosSeguidos) : 1
    return { saldo, base, stop, meta, plano, sugerida, chance }
  }, [banca, entrada, stopPct, metaPct, robo.id])

  const { plano } = calc
  const nivel = calc.stop <= 0 || plano.recuperacoes < 2 ? 'perigo' : plano.recuperacoes < 4 ? 'atencao' : 'ok'
  const titulo = calc.stop <= 0 ? 'Defina um limite de perda'
    : nivel === 'ok' ? 'Plano com folga'
      : nivel === 'atencao' ? 'Plano apertado'
        : 'Entrada alta para esse stop'
  const naBase = Math.min(plano.errosSeguidos, robo.id === 'thepalm' ? 1 : galeApos)
  const frase = calc.stop <= 0
    ? 'Sem limite de perda, uma sequência ruim não tem onde parar. Escolha quanto você aceita perder no dia.'
    : plano.errosSeguidos === 0
      ? `Nem a primeira entrada cabe num stop de ${formatarMoeda(calc.stop, moeda)}.`
      : `O ${robo.nome} aguenta ${plural(plano.errosSeguidos, 'erro seguido', 'erros seguidos')} (${naBase} na entrada base + ${plural(plano.recuperacoes, 'recuperação', 'recuperações')}) antes de parar no stop de ${formatarMoeda(calc.stop, moeda)}.`
  const vezes = calc.chance > 0 ? Math.round(1 / calc.chance) : Infinity

  // A escada: os degraus completos e o último passo — a entrada aparada, que
  // fecha a sessão no stop, ou o degrau que não cabe mais.
  type Barra = { n: number; valor: number; perdido: number; recuperacao: boolean; tipo: '' | 'aparada' | 'fora' }
  const ultimoPasso: Barra[] = plano.entradaAparada !== null && plano.proximo
    ? [{ n: plano.proximo.n, valor: plano.entradaAparada, perdido: plano.custoMaximo, recuperacao: plano.proximo.recuperacao, tipo: 'aparada' }]
    : plano.proximo ? [{ ...plano.proximo, tipo: 'fora' }] : []
  const barras: Barra[] = [...plano.cabem.map((d) => ({ ...d, tipo: '' as const })), ...ultimoPasso].slice(-16)
  const topo = Math.max(calc.stop, ...barras.map((d) => d.perdido)) || 1
  const altura = (v: number) => `${Math.max(2, (v / topo) * 86)}%`

  function usarPlano() {
    prepararPlano(robo.id, {
      valorAoVencer: calc.base, valorInicial: calc.base,
      takeProfit: Math.round(calc.meta * 100) / 100, stopLoss: Math.round(calc.stop * 100) / 100,
    })
    onUsarPlano?.()
  }

  return (
    <main className="go ger" style={{ '--go-robo': robo.cor } as CSSProperties}>
      <header className="go-hero">
        <div><span className="go-selo">Planejamento {MARCA.prosa}</span><h2>Gerenciamento</h2><p>Veja quantos erros seguidos o seu plano aguenta, com as entradas reais de cada robô.</p></div>
        <div className={`go-status ${nivel}`}><i />{titulo}</div>
      </header>

      <section className="go-robo-seletor">
        <div className="go-robo-intro"><span>01</span><div><small>Escolha o robô</small><strong>{robo.nome}</strong><p>{robo.regra}. Com US$ 1, lucra {numero(lucroPorDolar(robo.id))} quando acerta.</p></div></div>
        <div className="go-robos" role="group" aria-label="Robô para o cálculo">
          {ROBOS.map((item) => <button key={item.id} className={item.id === robo.id ? 'on' : ''} onClick={() => setRoboId(item.id)} style={{ '--robo-cor': item.cor } as CSSProperties}>
            <i /><span><b>{item.nome}</b><small>{Math.round(chanceDeAcerto(item.id) * 100)}% de acerto · +{numero(lucroPorDolar(item.id))} por US$ 1</small></span><em>✓</em>
          </button>)}
        </div>
      </section>

      <section className="go-grade">
        <aside className="go-config">
          <div className="go-bloco-titulo"><span>02</span><div><h3>Seu plano</h3><p>Altere os valores e veja tudo recalculado na hora.</p></div></div>
          <div className="go-campos">
            <label><span>Banca</span><div><em>{moeda}</em><input inputMode="decimal" value={banca} onChange={(e) => setBanca(e.target.value)} /></div></label>
            <label><span>Entrada</span><div><em>{moeda}</em><input inputMode="decimal" value={entrada} onFocus={(e) => e.currentTarget.select()} onChange={(e) => setEntrada(e.target.value)} /></div>
              <small>{n(entrada, .35) < .35 ? 'A entrada mínima é US$ 0,35.'
                : calc.sugerida === null ? 'Com esse stop, nem a entrada mínima aguenta 4 recuperações.'
                  : <>Para aguentar 4 recuperações, use até <b>{formatarMoeda(calc.sugerida, moeda)}</b>.</>}</small></label>
            <label><span>Stop do dia</span><div><input inputMode="decimal" value={stopPct} onChange={(e) => setStopPct(e.target.value)} /><em>%</em></div><small>{formatarMoeda(calc.stop, moeda)} — perdeu isso, o robô para.</small></label>
            <label><span>Meta do dia</span><div><input inputMode="decimal" value={metaPct} onChange={(e) => setMetaPct(e.target.value)} /><em>%</em></div><small>{formatarMoeda(calc.meta, moeda)} — ganhou isso, o robô para.</small></label>
          </div>
          <div className="go-regra"><b>Como o {robo.nome} recupera</b><p>{robo.id === 'thepalm'
            ? 'Depois de um erro em "0 a 8", passa a entrar em "0 a 4", que paga mais. Cada entrada cobre tudo o que foi perdido e deixa 95% da entrada de lucro.'
            : `Segura ${plural(galeApos, 'erro', 'erros')} no valor da entrada. A partir do ${galeApos + 1}º erro seguido, cada entrada cobre tudo o que foi perdido e ainda deixa 5% da entrada de lucro.`} Os valores são os mesmos que o robô usa: o pagamento real de cada contrato na plataforma.</p></div>
          <button type="button" className="go-usar" onClick={usarPlano}>Usar este plano no robô →</button>
        </aside>

        <div className="go-resultados">
          <div className={`go-veredito ${nivel}`}><b>{titulo}</b><p>{frase}</p></div>

          <div className="go-cards tres">
            <article><span>Erros seguidos que aguenta</span><strong>{plano.errosSeguidos}</strong><small>{naBase} na base + {plural(plano.recuperacoes, 'recuperação', 'recuperações')}</small></article>
            <article><span>Maior entrada</span><strong>{formatarMoeda(plano.maiorEntrada, moeda)}</strong><small>a última que cabe no stop</small></article>
            <article className={nivel === 'perigo' ? 'perigo' : ''}><span>Pior sequência custa</span><strong>{formatarMoeda(plano.custoMaximo, moeda)}</strong><small>{numero((plano.custoMaximo / calc.saldo) * 100, 1)}% da banca · nunca passa do stop</small></article>
          </div>

          <section className="go-escada">
            <div className="go-bloco-titulo"><span>03</span><div><h3>A escada do {robo.nome}</h3><p>Cada barra é o total perdido até aquele erro. O número em cima é a entrada daquela vez.</p></div></div>
            <div className="go-barras" role="img" aria-label={`Escada de ${plano.errosSeguidos} entradas até o stop`}>
              {barras.map((d) => {
                const dica = d.tipo === 'aparada' ? 'entrada reduzida ao que sobra até o stop'
                  : d.tipo === 'fora' ? 'não entra: passaria do stop' : `perdido ${formatarMoeda(d.perdido, moeda)}`
                return <div key={d.n} className={`${d.recuperacao ? 'rec' : ''} ${d.tipo}`} title={`${d.n}º erro: entrada ${formatarMoeda(d.valor, moeda)} · ${dica}`}>
                  <span>{numero(d.valor)}</span><i style={{ height: altura(d.perdido) }} />
                </div>
              })}
              {calc.stop > 0 && <div className="go-stop" style={{ bottom: altura(calc.stop) }}><em>stop {formatarMoeda(calc.stop, moeda)}</em></div>}
            </div>
            <div className="go-eixo">{barras.map((d) => <span key={d.n}>{d.recuperacao ? `R${d.n - naBaseDe(robo.id, galeApos)}` : `E${d.n}`}</span>)}</div>
            <p className="go-escada-rodape">
              {plano.proximo && calc.stop > 0 && (plano.entradaAparada !== null
                ? <>Depois do {plano.errosSeguidos}º erro, a próxima entrada seria <b>{formatarMoeda(plano.proximo.valor, moeda)}</b>, mas só sobram <b>{formatarMoeda(plano.entradaAparada, moeda)}</b> até o stop: o robô entra com esse valor e, se errar, a sessão fecha no stop — sem passar dele. </>
                : <>Depois do {plano.errosSeguidos}º erro, a próxima entrada seria <b>{formatarMoeda(plano.proximo.valor, moeda)}</b> e não cabe no que sobra: o robô para. </>)}
              {plano.errosSeguidos > 0 && calc.stop > 0 && <>Uma sequência de {plano.errosSeguidos} erros seguidos acontece, em média, <b>1 vez a cada {Number.isFinite(vezes) ? vezes.toLocaleString('pt-BR') : 'muitos'} ciclos</b>.</>}
            </p>
          </section>

          <details className="go-planilha">
            <summary><div className="go-bloco-titulo"><span>04</span><div><h3>Ver a sequência completa</h3><p>Entrada por entrada, até onde o robô para.</p></div></div></summary>
            <div className="go-tabela-cab"><span>Etapa</span><span>Entrada</span><span>Se acertar</span><span>Perdido até aqui</span><span>Situação</span></div>
            <div className="go-tabela-corpo">
              {plano.cabem.map((d) => <div key={d.n}>
                <span><i>{d.recuperacao ? `R${d.n - naBaseDe(robo.id, galeApos)}` : `E${d.n}`}</i>{d.recuperacao ? `Recuperação ${d.n - naBaseDe(robo.id, galeApos)}` : `Entrada base ${d.n}`}</span>
                <b>{formatarMoeda(d.valor, moeda)}</b><b className="verde">+{numero(d.lucro)}</b><b>{formatarMoeda(d.perdido, moeda)}</b>
                <em className="ok">Cabe no stop</em>
              </div>)}
              {plano.proximo && <div>
                <span><i>{plano.entradaAparada !== null ? 'Ú' : '—'}</i>{plano.entradaAparada !== null ? 'Entrada reduzida' : `Seria ${formatarMoeda(plano.proximo.valor, moeda)}`}</span>
                <b>{plano.entradaAparada !== null ? formatarMoeda(plano.entradaAparada, moeda) : '—'}</b><b>—</b><b>{formatarMoeda(plano.custoMaximo, moeda)}</b>
                <em className="fora">{plano.entradaAparada !== null ? 'Última: fecha no stop' : 'Não entra: o robô para'}</em>
              </div>}
            </div>
          </details>
        </div>
      </section>
      <p className="go-aviso">Os valores seguem o pagamento real de cada contrato na plataforma, que pode variar alguns centavos ao longo do dia. Martingale não garante recuperação nem lucro. Valide o plano na conta demo.</p>
    </main>
  )
}

/** Quantas entradas base vêm antes da primeira recuperação. */
function naBaseDe(id: string, galeApos: number) {
  return id === 'thepalm' ? 1 : galeApos
}
