/**
 * Relatório simulado (06/11/2026): o editor do cenário, a faixa com a tag
 * "Relatório simulado" e o botão que abre o modo. Só administradores da marca
 * chegam aqui; as contas ficam em core/teeds/relatorioSimulado.ts.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MARCA } from '../../marca'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { NomeDoRobo } from '../NomeDoRobo'
import {
  cenarioEmBranco, cenariosProntos, diasDoCenario, escadaDoGale, entradasDaSequencia, faixaDoCenario, hojeIso, IAS_DO_SIMULADOR, iaDoSimulador, iasDoCenario, previaDoCenario,
  type Cenario, type LinhaDeIa, type Momento,
} from '../../core/teeds/relatorioSimulado'

const IA = MARCA.vocabularioIA ? 'I.A.' : 'robô'

/** O botão pequeno do topo da página. */
export function BotaoSimular({ ativo, aoAbrir, className = '' }: { ativo: boolean; aoAbrir: () => void; className?: string }) {
  return (
    <button type="button" className={`rsim-abrir ${ativo ? 'on' : ''} ${className}`} onClick={aoAbrir}
      aria-label={ativo ? 'Editar simulação' : 'Simular relatório'} title={ativo ? 'Editar simulação' : 'Simular relatório'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16M8 15l3-4 3 2 5-6" /></svg>
    </button>
  )
}

/* ------------------------------------------------------- campos de número */

const ler = (t: string) => {
  const limpo = t.trim().replace(/\s|US\$|\$|%/g, '')
  if (!limpo) return null
  const x = Number(limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo)
  return Number.isFinite(x) ? x : null
}
const mostrar = (x: number) => (Number.isFinite(x) ? String(x).replace('.', ',') : '')

function Numero({ id, rotulo, valor, aoMudar, min = 0, max, sufixo, dica, vazio, grande = false }: {
  id: string; rotulo: string; valor: number | null; aoMudar: (x: number | null) => void; min?: number; max?: number; sufixo?: string
  /** Uma linha de ajuda embaixo do campo. */ dica?: ReactNode
  /** Campo opcional: vazio vale null e mostra este texto. */ vazio?: string
  grande?: boolean
}) {
  const mostrarV = (v: number | null) => (v == null ? '' : mostrar(v))
  const [texto, setTexto] = useState(mostrarV(valor))
  useEffect(() => { if (ler(texto) !== valor) setTexto(mostrarV(valor)) }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className={`rsim-campo ${grande ? 'grande' : ''}`}>
      <span>{rotulo}</span>
      <span className="rsim-entrada">
        <input id={id} inputMode="decimal" value={texto} placeholder={vazio} onChange={(e) => {
          setTexto(e.target.value)
          const x = ler(e.target.value)
          if (x != null) aoMudar(Math.min(max ?? Infinity, Math.max(min, x)))
          else if (vazio && !e.target.value.trim()) aoMudar(null)
        }} onBlur={() => setTexto(mostrarV(valor))} />
        {sufixo && <em>{sufixo}</em>}
      </span>
      {dica && <small className="rsim-dica">{dica}</small>}
    </label>
  )
}

/** Ganho ou perda + o valor: no celular o teclado numérico não tem o sinal de menos. */
function Resultado({ id, valor, aoMudar, rotulo = 'Resultado' }: { id: string; valor: number; aoMudar: (x: number) => void; rotulo?: string }) {
  const perda = valor < 0
  return (
    <div className="rsim-resultado">
      <div className="rel-seg cheio" role="group" aria-label={rotulo}>
        <button type="button" className={!perda ? 'on ganho' : ''} onClick={() => aoMudar(Math.abs(valor))}>Ganho</button>
        <button type="button" className={perda ? 'on perda' : ''} onClick={() => aoMudar(-Math.abs(valor) || -1)}>Perda</button>
      </div>
      <Numero id={id} rotulo={`${rotulo} (US$)`} valor={Math.abs(valor)} aoMudar={(x) => aoMudar(perda ? -(x ?? 0) : x ?? 0)} />
    </div>
  )
}

/* ================================================================ editor */

/*
 * 06/11/2026 (2), Tiago: "a experiência de preencher ainda está muito
 * complicada". Agora são passos, uma pergunta por vez, na ordem dele:
 * a data, o resultado geral, as I.A., as operações que fizeram o resultado
 * e a revisão com a prévia do que vai aparecer.
 */
const PASSOS = ['Data', 'Resultado', MARCA.vocabularioIA ? 'I.A.' : 'Robôs', 'Operações', 'Revisão']
const MOMENTOS: Array<{ id: Momento; nome: string }> = [{ id: 'comeco', nome: 'No começo' }, { id: 'meio', nome: 'No meio' }, { id: 'fim', nome: 'No fim' }]
const dataCurta = (iso: string) => { const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}` }
const usd = (x: number) => dinheiro(x, 'USD')

function Passo({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <div className="rsim-passo">
      <h3>{titulo}</h3>
      {sub && <p className="rsim-sub">{sub}</p>}
      {children}
    </div>
  )
}

/** aoSair: só quando já há simulação na tela — sem a faixa (09/11/2026), é por aqui que se volta ao relatório real. */
export function EditorDoCenario({ inicial, aoMostrar, aoFechar, aoSair }: { inicial: Cenario; aoMostrar: (c: Cenario) => void; aoFechar: () => void; aoSair?: () => void }) {
  const [c, setC] = useState<Cenario>(inicial)
  const [passo, setPasso] = useState(0)
  const [modelo, setModelo] = useState<string | null>(null)
  const corpo = useRef<HTMLDivElement>(null)
  const mudar = (p: Partial<Cenario>) => setC((x) => ({ ...x, ...p }))
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    document.body.classList.add('rel-painel-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('rel-painel-aberto') }
  }, [aoFechar])
  useEffect(() => { corpo.current?.scrollTo(0, 0) }, [passo])

  const hoje = hojeIso()
  const prontos = useMemo(cenariosProntos, [])
  const ias = iasDoCenario(c)
  const somaOps = ias.reduce((s, l) => s + l.operacoes, 0)
  const somaRes = Math.round(ias.reduce((s, l) => s + l.resultado, 0) * 100) / 100
  const ganhas = Math.round((c.operacoes * c.acerto) / 100), perdidas = Math.max(0, Math.round(c.operacoes) - ganhas)
  const dias = diasDoCenario(c)
  const previa = useMemo(() => (passo >= 3 ? previaDoCenario(c) : null), [c, passo])

  const p = c.periodo
  const falhas: string[] = [
    p.tipo === 'dia' ? (!p.data ? 'Escolha o dia.' : p.data > hoje ? 'Escolha um dia até hoje.' : '')
      : p.tipo === 'intervalo' ? (!p.de || !p.ate ? 'Escolha as duas datas.' : p.ate < p.de ? 'A data final vem antes da inicial.' : p.ate > hoje ? 'Escolha datas até hoje.' : dias > 400 ? 'Escolha até 400 dias.' : '') : '',
    !c.operacoes ? 'Preencha a quantidade de operações.' : c.acerto < 0 || c.acerto > 100 ? 'O acerto vai de 0 a 100%.' : '',
    !c.ias.length ? `Escolha pelo menos uma ${IA}.` : !c.dividirSozinho && c.ias.length > 1 && (somaOps !== Math.round(c.operacoes) || Math.abs(somaRes - c.resultado) > 0.005) ? 'A soma das I.A. precisa fechar com o total.' : '',
    !c.entrada ? 'Preencha a entrada inicial.' : c.entrada < 0.35 ? 'A entrada mínima da Deriv é US$ 0,35.' : !c.payout || c.payout > 1000 ? 'Preencha o payout.' : c.gale && c.multiplicador < 1.01 ? 'O multiplicador do gale precisa ser maior que 1.' : perdidas && (c.sequencia < 1 || c.sequencia > perdidas) ? `A sequência de perdas vai de 1 a ${perdidas}.` : c.horaAte < c.horaDe ? 'O horário final vem antes do inicial.' : '',
    '',
  ]
  const falha = falhas[passo]
  const primeiraFalha = falhas.findIndex((f) => f)

  const escolherIa = (id: string) => setC((x) => {
    const tem = x.ias.some((l) => l.ia === id)
    const lista = tem ? x.ias.filter((l) => l.ia !== id) : [...x.ias, { ia: id, operacoes: 0, resultado: 0 }]
    const iaDaSequencia = lista.some((l) => l.ia === x.iaDaSequencia) ? x.iaDaSequencia : lista[0]?.ia ?? x.iaDaSequencia
    return { ...x, ias: lista, dividirSozinho: true, iaDaSequencia }
  })
  // aceita o que as regras dão: o resultado (e o de cada I.A.) passa a ser o calculado
  const usarCalculado = () => { if (previa) setC((x) => ({ ...x, resultado: previa.resultado, ias: previa.porIa, dividirSozinho: x.ias.length > 1 ? false : x.dividirSozinho })) }
  const mudarIa = (i: number, q: Partial<LinhaDeIa>) => setC((x) => {
    // quem mexe numa I.A. passa a dividir na mão: começa do que estava dividido
    const atual = iasDoCenario(x)
    return { ...x, dividirSozinho: false, ias: atual.map((l, k) => (k === i ? { ...l, ...q } : l)) }
  })

  return (
    <div className="rel-painel-fundo" onMouseDown={aoFechar}>
      <section className="rel-painel rsim-painel" role="dialog" aria-modal="true" aria-label="Montar o relatório simulado" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div className="rsim-cab">
            <b>Relatório simulado</b>
            <small>Passo {passo + 1} de {PASSOS.length} · {PASSOS[passo]}</small>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar">×</button>
        </header>
        <nav className="rsim-passos" aria-label="Passos">
          {PASSOS.map((nome, i) => (
            <button key={nome} type="button" className={`${i === passo ? 'on' : ''} ${i < passo ? 'feito' : ''}`} aria-current={i === passo ? 'step' : undefined}
              disabled={primeiraFalha >= 0 && i > primeiraFalha} onClick={() => setPasso(i)}><i>{i + 1}</i><span>{nome}</span></button>
          ))}
        </nav>

        <div className="rel-painel-corpo" ref={corpo}>
          {passo === 0 && (
            <Passo titulo="De quando é o relatório?" sub="O relatório vai mostrar este período, como se as operações tivessem acontecido nele.">
              <div className="rsim-opcoes dois">
                {([['dia', 'Um dia', p.tipo === 'dia' ? dataCurta(p.data) : 'Hoje ou outro dia'], ['ultimos7', 'Últimos 7 dias', 'Até hoje'], ['ultimos30', 'Últimos 30 dias', 'Até hoje'], ['intervalo', 'Escolher as datas', 'De um dia a outro']] as const).map(([id, nome, sub]) => {
                  const on = id === 'dia' ? p.tipo === 'dia' : id === 'intervalo' ? p.tipo === 'intervalo' : p.tipo === 'ultimos' && p.dias === (id === 'ultimos7' ? 7 : 30)
                  return (
                    <button key={id} type="button" className={on ? 'on' : ''} aria-pressed={on} onClick={() => mudar({
                      periodo: id === 'dia' ? { tipo: 'dia', data: p.tipo === 'dia' ? p.data : hoje } : id === 'intervalo' ? { tipo: 'intervalo', ...(p.tipo === 'intervalo' ? { de: p.de, ate: p.ate } : { de: `${hoje.slice(0, 8)}01`, ate: hoje }) } : { tipo: 'ultimos', dias: id === 'ultimos7' ? 7 : 30 },
                    })}><b>{nome}</b><small>{sub}</small></button>
                  )
                })}
              </div>
              {p.tipo === 'dia' && <label className="rsim-campo"><span>Qual dia</span><span className="rsim-entrada"><input id="rsim-dia" type="date" max={hoje} value={p.data} onChange={(e) => mudar({ periodo: { tipo: 'dia', data: e.target.value } })} /></span></label>}
              {p.tipo === 'intervalo' && (
                <div className="rsim-duas">
                  <label className="rsim-campo"><span>De</span><span className="rsim-entrada"><input id="rsim-de" type="date" max={hoje} value={p.de} onChange={(e) => mudar({ periodo: { ...p, de: e.target.value } })} /></span></label>
                  <label className="rsim-campo"><span>Até</span><span className="rsim-entrada"><input id="rsim-ate" type="date" max={hoje} value={p.ate} onChange={(e) => mudar({ periodo: { ...p, ate: e.target.value } })} /></span></label>
                </div>
              )}
              {!falha && <p className="rsim-ok">{dias === 1 ? `Um dia: ${dataCurta(faixaDoCenario(c).de)}` : `${dias} dias: de ${dataCurta(faixaDoCenario(c).de)} a ${dataCurta(faixaDoCenario(c).ate)}`}</p>}

              <div className="rsim-modelos">
                <span>Ou comece de um modelo pronto e ajuste:</span>
                <div className="rel-fichas">
                  {prontos.map((m) => (
                    <button key={m.id} type="button" className={`rsim-pronto ${m.tom} ${modelo === m.id ? 'on' : ''}`} onClick={() => { setC(structuredClone(m.cenario)); setModelo(m.id) }}><i aria-hidden="true" />{m.cenario.nome}</button>
                  ))}
                  <button type="button" className={`rsim-pronto ${modelo === 'branco' ? 'on' : ''}`} onClick={() => { setC(cenarioEmBranco()); setModelo('branco') }}>Em branco</button>
                </div>
              </div>
            </Passo>
          )}

          {passo === 1 && (
            <Passo titulo="Qual foi o resultado?" sub="O número grande do relatório, a quantidade de operações e o acerto.">
              <div className="rsim-campo"><span>Resultado do período</span>
                <div className="rel-seg cheio rsim-sinal" role="group" aria-label="Ganho ou perda">
                  <button type="button" className={c.resultado >= 0 ? 'on ganho' : ''} onClick={() => mudar({ resultado: Math.abs(c.resultado) })}>Ganho</button>
                  <button type="button" className={c.resultado < 0 ? 'on perda' : ''} onClick={() => mudar({ resultado: -Math.abs(c.resultado) || -1 })}>Perda</button>
                </div>
              </div>
              <Numero id="rsim-resultado" grande rotulo="Valor (US$)" valor={Math.abs(c.resultado)} max={1e7} aoMudar={(x) => mudar({ resultado: c.resultado < 0 ? -(x ?? 0) : x ?? 0 })} />
              <div className={`rsim-grande-numero ${c.resultado < 0 ? 'cai' : 'sobe'}`}>{dinheiroComSinal(c.resultado, 'USD')}</div>
              <div className="rsim-duas">
                <Numero id="rsim-operacoes" rotulo="Quantidade de operações" valor={c.operacoes} max={20000} aoMudar={(x) => mudar({ operacoes: Math.round(x ?? 0) })} />
                <Numero id="rsim-acerto" rotulo="Acerto" sufixo="%" valor={c.acerto} max={100} aoMudar={(x) => mudar({ acerto: x ?? 0 })} />
              </div>
              {c.operacoes > 0 && <p className="rsim-ok"><b className="sobe">{ganhas.toLocaleString('pt-BR')} ganhas</b> e <b className="cai">{perdidas.toLocaleString('pt-BR')} perdidas</b> · média de {dinheiroComSinal(c.resultado / c.operacoes, 'USD')} por operação</p>}
            </Passo>
          )}

          {passo === 2 && (
            <Passo titulo={`Quais ${IA} operaram?`} sub={`Escolha uma ou mais. Com mais de uma, a divisão é automática, ou você define quanto cada ${IA} fez.`}>
              <div className="rel-fichas">
                {IAS_DO_SIMULADOR.map((x) => {
                  const on = c.ias.some((l) => l.ia === x.id)
                  return <button key={x.id} type="button" className={`rsim-ia ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => escolherIa(x.id)}>{x.origem === 'manual' ? x.nome : <NomeDoRobo nome={x.nome} id={x.id} />}</button>
                })}
              </div>
              {c.ias.length > 1 && <>
                <div className="rel-seg cheio">
                  <button type="button" className={c.dividirSozinho ? 'on' : ''} onClick={() => mudar({ dividirSozinho: true })}>Dividir automaticamente</button>
                  <button type="button" className={!c.dividirSozinho ? 'on' : ''} onClick={() => setC((x) => ({ ...x, ias: iasDoCenario(x), dividirSozinho: false }))}>Definir cada uma</button>
                </div>
                {ias.map((l, i) => (
                  <div className="rsim-cartao" key={l.ia}>
                    <b className="rsim-cartao-nome">{iaDoSimulador(l.ia).origem === 'manual' ? 'Manual' : <NomeDoRobo nome={iaDoSimulador(l.ia).nome} id={l.ia} />}</b>
                    {c.dividirSozinho
                      ? <p className="rsim-ok">{l.operacoes.toLocaleString('pt-BR')} operações · <b className={l.resultado < 0 ? 'cai' : 'sobe'}>{dinheiroComSinal(l.resultado, 'USD')}</b></p>
                      : <div className="rsim-duas">
                        <Numero id={`rsim-ia-ops-${i}`} rotulo="Operações" valor={l.operacoes} max={20000} aoMudar={(x) => mudarIa(i, { operacoes: Math.round(x ?? 0) })} />
                        <Resultado id={`rsim-ia-res-${i}`} valor={l.resultado} aoMudar={(x) => mudarIa(i, { resultado: x })} />
                      </div>}
                  </div>
                ))}
                {!c.dividirSozinho && (
                  <p className={`rsim-soma ${falha ? 'falta' : ''}`}>
                    Soma: {somaOps.toLocaleString('pt-BR')} de {Math.round(c.operacoes).toLocaleString('pt-BR')} operações · {dinheiroComSinal(somaRes, 'USD')} de {dinheiroComSinal(c.resultado, 'USD')}
                    {falha ? '' : ' · fechado'}
                  </p>
                )}
              </>}
              {c.ias.length === 1 && <p className="rsim-ok">{iaDoSimulador(c.ias[0].ia).nome} fez todas as {Math.round(c.operacoes).toLocaleString('pt-BR')} operações e o resultado de {dinheiroComSinal(c.resultado, 'USD')}.</p>}
            </Passo>
          )}

          {passo === 3 && (
            <Passo titulo="Como foram as operações?" sub="O gerenciamento que fez o resultado. Cada ganho paga a entrada × o payout; com martingale, cada perda multiplica a próxima entrada.">
              <div className="rsim-duas">
                <Numero id="rsim-entrada" rotulo="Entrada inicial (US$)" valor={c.entrada} min={0} max={1e5} aoMudar={(x) => mudar({ entrada: x ?? 0 })} dica="A entrada de sempre. Mínimo da Deriv: US$ 0,35." />
                <Numero id="rsim-payout" rotulo="Payout" sufixo="%" valor={c.payout} max={1000} aoMudar={(x) => mudar({ payout: x ?? 0 })} dica={`Quanto o ganho paga. Com ${String(c.payout || 95).replace('.', ',')}%, ganhar com ${usd(c.entrada || 1)} rende ${usd(Math.round((c.entrada || 1) * (c.payout || 95)) / 100)}.`} />
              </div>
              <div className="rsim-campo"><span>Martingale (gale)</span>
                <div className="rel-seg cheio">
                  <button type="button" className={!c.gale ? 'on' : ''} onClick={() => mudar({ gale: false })}>Não, entrada fixa</button>
                  <button type="button" className={c.gale ? 'on' : ''} onClick={() => mudar({ gale: true, gales: Math.max(1, c.gales) })}>Sim, com gale</button>
                </div>
              </div>
              {c.gale && <>
                <div className="rsim-duas">
                  <Numero id="rsim-multiplicador" rotulo="Multiplicador do gale" sufixo="×" valor={c.multiplicador} min={1} max={10} aoMudar={(x) => mudar({ multiplicador: x ?? 1 })} dica="Depois de cada perda, a próxima entrada é a anterior × este número." />
                  <label className="rsim-campo"><span>Até quantos gales</span><span className="rsim-entrada">
                    <select id="rsim-gales" value={c.gales} onChange={(e) => mudar({ gales: Number(e.target.value) })}>
                      {Array.from({ length: 12 }, (_, k) => k + 1).map((k) => <option key={k} value={k}>{k} {k === 1 ? 'gale' : 'gales'} · até {usd(escadaDoGale({ ...c, gales: k })[k])}</option>)}
                    </select>
                  </span><small className="rsim-dica">Perdeu no último gale, aceita a perda e volta à entrada inicial.</small></label>
                </div>
                <div className="rsim-escada" aria-label="A escada de entradas">
                  {escadaDoGale(c).map((e, k) => (
                    <span key={k} className={k <= Math.min(Math.max(1, c.sequencia) - 1, c.gales) ? 'usada' : ''}><small>{k === 0 ? 'Entrada' : `Gale ${k}`}</small><b>{usd(e)}</b></span>
                  ))}
                </div>
              </>}
              <div className="rsim-duas">
                <Numero id="rsim-sequencia" rotulo="Maior sequência de perdas" valor={c.sequencia} max={Math.max(1, perdidas)} aoMudar={(x) => mudar({ sequencia: Math.round(x ?? 0) })} dica={`Perdas seguidas, no máximo. Até ${perdidas}.`} />
                {c.ias.length > 1
                  ? <label className="rsim-campo"><span>Em qual {IA}</span><span className="rsim-entrada">
                    <select id="rsim-ia-seq" value={c.iaDaSequencia} onChange={(e) => mudar({ iaDaSequencia: e.target.value })}>{c.ias.map((l) => <option key={l.ia} value={l.ia}>{iaDoSimulador(l.ia).nome}</option>)}</select>
                  </span></label>
                  : <div />}
              </div>
              <div className="rsim-campo"><span>Quando veio essa sequência</span>
                <div className="rel-seg cheio">{MOMENTOS.map((m) => <button key={m.id} type="button" className={c.momento === m.id ? 'on' : ''} onClick={() => mudar({ momento: m.id })}>{m.nome}</button>)}</div>
              </div>
              {(() => {
                const doRisco = entradasDaSequencia(escadaDoGale(c), Math.max(1, c.sequencia))
                const maior = Math.max(...doRisco), soma = doRisco.reduce((s, e) => s + e, 0)
                return (
                  <div className={`rsim-risco ${maior > (c.entrada || 1) ? 'alto' : ''}`}>
                    <div><small>Maior entrada (exposição de risco)</small><b>{usd(maior)}</b></div>
                    <div><small>A sequência de {Math.max(1, c.sequencia)} {c.sequencia === 1 ? 'perda' : 'perdas'} custa</small><b className="cai">{dinheiroComSinal(-soma, 'USD')}</b></div>
                    <p>{c.gale
                      ? c.sequencia > c.gales + 1 ? `A sequência passa do último gale: perdeu ${c.gales + 1} seguidas, aceita a perda e recomeça em ${usd(c.entrada || 1)}.` : `As entradas sobem a cada perda até ${usd(maior)}.`
                      : 'Sem gale, todas as entradas são iguais.'} Na Deriv, a perda de uma operação é a própria entrada.</p>
                  </div>
                )
              })()}
              <div className="rsim-campo"><span>Horário em que operou</span>
                <div className="rsim-duas">
                  <span className="rsim-entrada"><select id="rsim-hora-de" aria-label="Das" value={c.horaDe} onChange={(e) => mudar({ horaDe: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>Das {h}h</option>)}</select></span>
                  <span className="rsim-entrada"><select id="rsim-hora-ate" aria-label="Até" value={c.horaAte} onChange={(e) => mudar({ horaAte: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>Até {h}h59</option>)}</select></span>
                </div>
              </div>
              {previa && <Previa previa={previa} aoUsar={usarCalculado} aoAcerto={(a) => mudar({ acerto: a })} />}
            </Passo>
          )}

          {passo === 4 && (
            <Passo titulo="Revise e mostre" sub="Confira os números que vão aparecer. Dá para voltar a qualquer passo.">
              <label className="rsim-campo"><span>Nome que aparece na faixa</span>
                <span className="rsim-entrada"><input id="rsim-nome" value={c.nome} maxLength={60} onChange={(e) => mudar({ nome: e.target.value })} /></span>
              </label>
              {previa && <Previa previa={previa} aoUsar={usarCalculado} aoAcerto={(a) => mudar({ acerto: a })} />}
              <div className="rsim-campo"><span>Na corretora (opcional)</span>
                <div className="rsim-tres">
                  <Numero id="rsim-saldo" rotulo="Saldo (US$)" valor={c.saldo} max={1e7} aoMudar={(x) => mudar({ saldo: x ?? 0 })} />
                  <Numero id="rsim-depositos" rotulo="Depósitos" valor={c.depositos} max={1e7} aoMudar={(x) => mudar({ depositos: x ?? 0 })} />
                  <Numero id="rsim-saques" rotulo="Saques" valor={c.saques} max={1e7} aoMudar={(x) => mudar({ saques: x ?? 0 })} />
                </div>
              </div>
              <p className="rsim-aviso">Só os administradores veem. Nada é gravado, nada entra na cobrança, e o resultado mostra a tag <b>Relatório simulado</b>.</p>
            </Passo>
          )}
        </div>

        <footer>
          {falha && <small className="rsim-falha" role="alert">{falha}</small>}
          {aoSair && <button type="button" className="rel-btn rsim-sair" onClick={aoSair}>Sair da simulação</button>}
          <button type="button" className="rel-btn" onClick={() => (passo ? setPasso(passo - 1) : aoFechar())}>{passo ? 'Voltar' : 'Cancelar'}</button>
          {passo < PASSOS.length - 1
            ? <button type="button" className="rel-btn ouro" disabled={!!falha} onClick={() => setPasso(passo + 1)}>Continuar</button>
            : <button type="button" className="rel-btn ouro" disabled={primeiraFalha >= 0} onClick={() => aoMostrar({ ...c, nome: c.nome.trim() || 'Cenário simulado' })}>Mostrar o relatório</button>}
        </footer>
      </section>
    </div>
  )
}

/** A prévia: os números que o relatório vai mostrar, e o que não bateu com as respostas. */
function Previa({ previa: p, aoUsar, aoAcerto }: { previa: ReturnType<typeof previaDoCenario>; aoUsar: () => void; aoAcerto: (a: number) => void }) {
  const itens: Array<[string, string, string?]> = [
    ['Resultado', dinheiroComSinal(p.resultado, 'USD'), p.resultado < 0 ? 'cai' : 'sobe'],
    ['Operações', `${p.operacoes.toLocaleString('pt-BR')} · ${p.operacoes ? Math.round((p.ganhas / p.operacoes) * 100) : 0}%`],
    ['Maior entrada', usd(p.maiorEntrada)],
    ['Perdas seguidas', String(p.sequencia)],
    ['Maior ganho', dinheiroComSinal(p.maiorGanho, 'USD'), 'sobe'],
    ['Maior perda', dinheiroComSinal(p.maiorPerda, 'USD'), 'cai'],
  ]
  return (
    <section className={`rsim-previa ${p.avisos.length ? 'com-aviso' : ''}`} aria-live="polite">
      <h4>Como vai aparecer no relatório</h4>
      <dl>{itens.map(([n, v, cl]) => <div key={n}><dt>{n}</dt><dd className={cl}>{v}</dd></div>)}</dl>
      <small>Calculado operação por operação: cada ganho paga a entrada × {Math.round(p.retorno * 1000) / 10}%{p.porIa.length > 1 ? ` · ${p.porIa.map((l) => `${iaDoSimulador(l.ia).nome} ${dinheiroComSinal(l.resultado, 'USD')}`).join(' · ')}` : ''}.</small>
      {p.avisos.map((a) => <p key={a} className="rsim-previa-aviso">{a}</p>)}
      {p.naoFechou && (
        <div className="rsim-previa-acoes">
          {p.acertoSugerido != null && <button type="button" className="rel-btn" onClick={() => aoAcerto(p.acertoSugerido!)}>Ajustar o acerto para {String(p.acertoSugerido).replace('.', ',')}%</button>}
          <button type="button" className="rel-btn ouro" onClick={aoUsar}>Usar {dinheiroComSinal(p.resultado, 'USD')}</button>
        </div>
      )}
    </section>
  )
}
