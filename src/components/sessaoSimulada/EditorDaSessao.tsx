/**
 * Sessão simulada (12/11/2026): o roteiro, uma pergunta por vez, no mesmo
 * jeito do relatório simulado. As contas ficam em core/teeds/sessaoSimulada.ts.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { MARCA } from '../../marca'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { NomeDoRobo } from '../NomeDoRobo'
import { useCatalogoCompleto } from '../../core/teeds/catalogoRobos'
import {
  definirRegrasDaSessao, escadaDoRoteiro, estrategiaDa, IAS_DA_SESSAO, nomeDaIa, previaDoRoteiro, roteiroEmBranco, roteirosProntos,
  digitosQueGanham, SEGUNDOS_POR_TICK, type Fim, type Momento, type Roteiro, type Trecho,
} from '../../core/teeds/sessaoSimulada'
import '../relatorios/relatorios.css'
import './sessao-simulada.css'

const IA = MARCA.vocabularioIA ? 'I.A.' : 'robô'
const usd = (x: number) => dinheiro(x, 'USD')

/** O ícone do topo da aba (o mesmo laranja do relatório simulado, com um play). */
export function BotaoSessaoSimulada({ ativo, aoAbrir }: { ativo: boolean; aoAbrir: () => void }) {
  return (
    <button type="button" className={`rsim-abrir ssim-abrir ${ativo ? 'on' : ''}`} onClick={aoAbrir}
      aria-label={ativo ? 'Editar a sessão simulada' : 'Simular uma sessão'} title={ativo ? 'Editar a sessão simulada' : 'Simular uma sessão'}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5M4 19h16" /><path d="M10 8.5v7l5.5-3.5z" /></svg>
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

function Numero({ id, rotulo, valor, aoMudar, min = 0, max, sufixo, dica }: {
  id: string; rotulo: string; valor: number; aoMudar: (x: number) => void; min?: number; max?: number; sufixo?: string; dica?: ReactNode
}) {
  const [texto, setTexto] = useState(mostrar(valor))
  useEffect(() => { if (ler(texto) !== valor) setTexto(mostrar(valor)) }, [valor]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <label className="rsim-campo">
      <span>{rotulo}</span>
      <span className="rsim-entrada">
        <input id={id} inputMode="decimal" value={texto} onChange={(e) => {
          setTexto(e.target.value)
          const x = ler(e.target.value)
          if (x != null) aoMudar(Math.min(max ?? Infinity, Math.max(min, x)))
        }} onBlur={() => setTexto(mostrar(valor))} />
        {sufixo && <em>{sufixo}</em>}
      </span>
      {dica && <small className="rsim-dica">{dica}</small>}
    </label>
  )
}

function Passo({ titulo, sub, children }: { titulo: string; sub?: string; children: ReactNode }) {
  return (
    <div className="rsim-passo">
      <h3>{titulo}</h3>
      {sub && <p className="rsim-sub">{sub}</p>}
      {children}
    </div>
  )
}

const PASSOS = [MARCA.vocabularioIA ? 'I.A.' : 'Robô', 'Conta', 'Como termina', 'Depois', 'Revisão']
const MOMENTOS: Array<{ id: Momento; nome: string }> = [{ id: 'comeco', nome: 'No começo' }, { id: 'meio', nome: 'No meio' }, { id: 'fim', nome: 'No fim' }]
const FINS: Array<{ id: Fim; nome: string; sub: string }> = [
  { id: 'meta', nome: 'Bateu a meta', sub: 'A sessão para sozinha no ganho' },
  { id: 'stop', nome: 'Bateu o limite de perda', sub: 'A sessão para sozinha no stop' },
  { id: 'desligou', nome: 'Desligou no meio', sub: 'A pessoa para antes, no ganho ou na perda' },
]

/** O que cada I.A. paga, dito em uma linha. */
function comoOpera(ia: string): string {
  const e = estrategiaDa(ia)
  const ganha = digitosQueGanham(e.contractType, e.barreira)
  const dig = ganha.length >= 6 ? `${ganha[0]} a ${ganha[ganha.length - 1]}` : ganha.join(', ').replace(/, (\d)$/, ' ou $1')
  const espera = e.lossVirtualAjustavel && ia !== 'goreme' && ia !== 'falcon' && ia !== 'legacy' ? ' · espera o loss virtual' : ''
  return ia === 'goreme' ? 'Ganha de 0 a 8 · recupera nos dígitos 7, 8 ou 9' : `Ganha com ${dig}${espera}`
}

/** Os campos de um trecho (o primeiro, ou o "religou depois"). */
function CamposDoTrecho({ t, k, aoMudar, entrada }: { t: Trecho; k: number; aoMudar: (p: Partial<Trecho>) => void; entrada: number }) {
  const id = (x: string) => `ssim-${x}-${k}`
  return (
    <>
      <div className="rsim-opcoes">
        {FINS.map((f) => (
          <button key={f.id} type="button" className={t.fim === f.id ? 'on' : ''} aria-pressed={t.fim === f.id} onClick={() => aoMudar({ fim: f.id })}>
            <b>{f.nome}</b><small>{f.sub}</small>
          </button>
        ))}
      </div>
      <div className="rsim-duas">
        <Numero id={id('meta')} rotulo={k ? 'Nova meta de ganho (US$)' : 'Meta de ganho (US$)'} valor={t.meta} max={1e6} aoMudar={(x) => aoMudar({ meta: x })}
          dica={k ? 'Da sessão inteira, contando o que já foi feito.' : '0 = sem meta.'} />
        <Numero id={id('stop')} rotulo={k ? 'Novo limite de perda (US$)' : 'Limite de perda (US$)'} valor={t.stop} max={1e6} aoMudar={(x) => aoMudar({ stop: x })}
          dica={k ? 'Da sessão inteira.' : '0 = sem limite.'} />
      </div>
      {t.fim === 'desligou' && (
        <div className="rsim-campo"><span>{k ? 'Resultado da sessão quando desliga de novo' : 'Resultado quando desliga'}</span>
          <div className="rsim-resultado">
            <div className="rel-seg cheio" role="group" aria-label="Ganho ou perda">
              <button type="button" className={t.resultado >= 0 ? 'on ganho' : ''} onClick={() => aoMudar({ resultado: Math.abs(t.resultado) })}>Ganho</button>
              <button type="button" className={t.resultado < 0 ? 'on perda' : ''} onClick={() => aoMudar({ resultado: -Math.abs(t.resultado) || -1 })}>Perda</button>
            </div>
            <Numero id={id('resultado')} rotulo="Valor (US$)" valor={Math.abs(t.resultado)} max={1e6} aoMudar={(x) => aoMudar({ resultado: t.resultado < 0 ? -x : x })} />
          </div>
          {t.resultado < 0 && <small className="rsim-dica">Desligar no negativo é desligar no meio de uma sequência de perdas, antes de a recuperação fechar.</small>}
        </div>
      )}
      <div className="rsim-duas">
        <Numero id={id('ops')} rotulo={k ? 'Operações depois de religar' : 'Quantidade de operações'} valor={t.operacoes} min={1} max={3000} aoMudar={(x) => aoMudar({ operacoes: Math.round(x) })} />
        <Numero id={id('seq')} rotulo="Maior sequência de perdas" valor={t.sequencia} max={30} aoMudar={(x) => aoMudar({ sequencia: Math.round(x) })}
          dica={t.fim === 'stop' ? 'A sequência que leva ao stop.' : `Perdas seguidas, no máximo. A ${IA} sobe a escada a cada uma.`} />
      </div>
      {t.fim !== 'stop' && !(t.fim === 'desligou' && t.resultado < 0) && (
        <div className="rsim-campo"><span>Quando veio essa sequência</span>
          <div className="rel-seg cheio">{MOMENTOS.map((m) => <button key={m.id} type="button" className={t.momento === m.id ? 'on' : ''} onClick={() => aoMudar({ momento: m.id })}>{m.nome}</button>)}</div>
        </div>
      )}
      <small className="rsim-dica">Entrada de {usd(entrada)}: a escada de recuperação é a da {IA}, a mesma do motor.</small>
    </>
  )
}

/* ================================================================ editor */

export function EditorDaSessao({ inicial, aoRodar, aoFechar, aoSair }: { inicial?: Roteiro; aoRodar: (r: Roteiro) => void; aoFechar: () => void; aoSair?: () => void }) {
  const [r, setR] = useState<Roteiro>(() => (inicial ? { ...inicial, fita: inicial.fita } : roteiroEmBranco()))
  const [passo, setPasso] = useState(0)
  const [modelo, setModelo] = useState<string | null>(null)
  const corpo = useRef<HTMLDivElement>(null)
  const versao = definirRegrasDaSessao(useCatalogoCompleto())
  // mexeu no roteiro: a fita escolhida à mão deixa de valer
  const mudar = (p: Partial<Roteiro>) => setR((x) => ({ ...x, ...p, fita: 'fita' in p ? p.fita : undefined }))
  const mudarTrecho = (k: number, p: Partial<Trecho>) => setR((x) => ({ ...x, fita: undefined, trechos: x.trechos.map((t, i) => (i === k ? { ...t, ...p } : t)) }))
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    document.body.classList.add('rel-painel-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('rel-painel-aberto') }
  }, [aoFechar])
  useEffect(() => { corpo.current?.scrollTo(0, 0) }, [passo])

  const prontos = useMemo(roteirosProntos, [])
  const escada = useMemo(() => escadaDoRoteiro(r, 8), [r.ia, r.entrada, versao]) // eslint-disable-line react-hooks/exhaustive-deps
  const previa = useMemo(() => (passo >= 2 ? previaDoRoteiro(r) : null), [r, passo, versao])

  const falhas = [
    '',
    r.entrada < 0.35 ? 'A entrada mínima da Deriv é US$ 0,35.' : r.saldo < r.entrada ? 'O saldo precisa cobrir a entrada.' : '',
    r.trechos.some((t, k) => (k === 0 || r.trechos.length > 1) && t.fim === 'meta' && !(t.meta > 0)) ? 'Para bater a meta, preencha a meta de ganho.'
      : r.trechos.some((t) => t.fim === 'stop' && !(t.stop > 0)) ? 'Para bater o limite de perda, preencha o limite.'
      : r.trechos.some((t) => t.fim === 'desligou' && t.meta > 0 && t.resultado >= t.meta) ? 'O resultado ao desligar passa da meta: a sessão teria parado antes. Aumente a meta ou zere.'
      : r.trechos.some((t) => t.fim === 'desligou' && t.stop > 0 && t.resultado <= -t.stop) ? 'O resultado ao desligar passa do limite de perda: a sessão teria parado antes.' : '',
    '',
    '',
  ]
  const falha = falhas[passo]
  const primeiraFalha = falhas.findIndex((f) => f)
  const temDepois = r.trechos.length > 1
  const ops = previa?.corrida.ops ?? []

  /** Toca uma bolinha da fita: troca ganhou/perdeu e a sessão é refeita a partir dali, com os freios do motor. */
  const trocar = (i: number) => {
    if (!previa) return
    // a fita é o que aconteceu (por trecho), com a bolinha trocada; dali em diante valem os freios do motor
    const fita = r.trechos.map((_, k) => previa.corrida.ops.map((o, j) => ({ o, j })).filter(({ o }) => o.trecho === k).map(({ o, j }) => (j === i ? !o.ganhou : o.ganhou)))
    setR((x) => ({ ...x, fita }))
  }
  const usar = (k: number, p: Partial<Trecho>) => mudarTrecho(k, p)

  return (
    <div className="rel-painel-fundo ssim-raiz" onMouseDown={aoFechar}>
      <section className="rel-painel rsim-painel ssim-painel" role="dialog" aria-modal="true" aria-label="Montar a sessão simulada" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div className="rsim-cab">
            <b>Sessão simulada</b>
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
            <Passo titulo={`Qual ${IA} vai operar?`} sub={`A sessão usa as regras em vigor da ${IA}: o contrato, a entrada por loss virtual e a escada de recuperação.`}>
              <div className="ssim-ias">
                {IAS_DA_SESSAO.map((id) => (
                  <button key={id} type="button" className={r.ia === id ? 'on' : ''} aria-pressed={r.ia === id} onClick={() => mudar({ ia: id })}>
                    <b><NomeDoRobo nome={nomeDaIa(id)} id={id} /></b><small>{comoOpera(id)}</small>
                  </button>
                ))}
              </div>
              <div className="rsim-modelos">
                <span>Ou comece de um cenário pronto e ajuste:</span>
                <div className="ssim-prontos">
                  {prontos.map((m) => (
                    <button key={m.id} type="button" className={`ssim-pronto ${m.tom} ${modelo === m.id ? 'on' : ''}`} onClick={() => { setR(structuredClone(m.roteiro)); setModelo(m.id) }}>
                      <i aria-hidden="true" /><b>{m.nome}</b><small>{m.ensina}</small>
                    </button>
                  ))}
                  <button type="button" className={`ssim-pronto ${modelo === 'branco' ? 'on' : ''}`} onClick={() => { setR({ ...roteiroEmBranco(), ia: r.ia }); setModelo('branco') }}>
                    <i aria-hidden="true" /><b>Em branco</b><small>Começar do zero</small>
                  </button>
                </div>
              </div>
            </Passo>
          )}

          {passo === 1 && (
            <Passo titulo="A conta e a entrada" sub="O que aparece no topo e na cabine. Nada sai deste navegador.">
              <div className="rsim-campo"><span>Conta</span>
                <div className="rel-seg cheio">
                  <button type="button" className={r.conta === 'real' ? 'on' : ''} onClick={() => mudar({ conta: 'real' })}>Real</button>
                  <button type="button" className={r.conta === 'demo' ? 'on' : ''} onClick={() => mudar({ conta: 'demo' })}>Demo</button>
                </div>
              </div>
              <div className="rsim-duas">
                <Numero id="ssim-saldo" rotulo="Saldo da conta (US$)" valor={r.saldo} max={1e7} aoMudar={(x) => mudar({ saldo: x })} dica="O saldo do topo começa aqui e anda com cada operação." />
                <Numero id="ssim-entrada" rotulo="Entrada (US$)" valor={r.entrada} min={0} max={1e5} aoMudar={(x) => mudar({ entrada: x })} dica="A entrada do cliente: o primeiro degrau." />
              </div>
              <div className="rsim-campo"><span>Escada de recuperação da <NomeDoRobo nome={nomeDaIa(r.ia)} id={r.ia} emTexto /></span>
                <div className="rsim-escada" aria-label="A escada de recuperação">
                  {escada.filter((v) => v > 0).map((v, k) => <span key={k}><small>{k === 0 ? 'Entrada' : `Recup. ${k}`}</small><b>{usd(v)}</b></span>)}
                </div>
                <small className="rsim-dica">A cada perda seguida a {IA} sobe um degrau; ganhou, volta para a entrada.</small>
              </div>
            </Passo>
          )}

          {passo === 2 && (
            <Passo titulo="Como a sessão termina?" sub="O resultado, as operações e a pior sequência. O gerador monta as operações que fecham com isso.">
              <CamposDoTrecho t={r.trechos[0]} k={0} entrada={r.entrada} aoMudar={(p) => mudarTrecho(0, p)} />
              {previa && <Numeros previa={previa} r={r} aoUsar={usar} soTrecho={0} />}
            </Passo>
          )}

          {passo === 3 && (
            <Passo titulo="E depois que parou?" sub="Para as aulas de emoção: bateu a meta e quis mais, bateu o stop e quis recuperar.">
              <div className="rsim-opcoes dois">
                <button type="button" className={!temDepois ? 'on' : ''} aria-pressed={!temDepois} onClick={() => setR((x) => ({ ...x, fita: undefined, trechos: x.trechos.slice(0, 1) }))}>
                  <b>Respeitou e parou</b><small>A sessão termina aí</small>
                </button>
                <button type="button" className={temDepois ? 'on' : ''} aria-pressed={temDepois} onClick={() => setR((x) => x.trechos.length > 1 ? x : ({
                  ...x, fita: undefined,
                  trechos: [x.trechos[0], { meta: Math.round((x.trechos[0].meta || 20) * 3), stop: x.trechos[0].stop || 50, fim: 'stop', resultado: 0, operacoes: 40, sequencia: 9, momento: 'fim' }],
                }))}>
                  <b>Religou e continuou</b><small>Mudou o limite e ligou de novo</small>
                </button>
              </div>
              {temDepois && <CamposDoTrecho t={r.trechos[1]} k={1} entrada={r.entrada} aoMudar={(p) => mudarTrecho(1, p)} />}
              {temDepois && previa && <Numeros previa={previa} r={r} aoUsar={usar} soTrecho={1} />}
            </Passo>
          )}

          {passo === 4 && previa && (
            <Passo titulo="Revise e rode" sub="Cada bolinha é uma operação. Toque para trocar ganhou e perdeu: a sessão é refeita com as regras do motor.">
              <div className="ssim-fita" aria-label="As operações da sessão">
                {ops.map((o, i) => {
                  const virou = i > 0 && ops[i - 1].trecho !== o.trecho
                  return (
                    <span key={i} className="ssim-fita-item">
                      {virou && <em className="ssim-fita-religou" title="Religou">▶</em>}
                      <button type="button" className={`${o.ganhou ? 'g' : 'p'} ${o.degrau > 0 ? 'rec' : ''}`} onClick={() => trocar(i)}
                        title={`Operação ${i + 1}: ${o.ganhou ? 'ganhou' : 'perdeu'} ${usd(Math.abs(o.lucro))} · entrada ${usd(o.valor)} · resultado ${dinheiroComSinal(o.resultado, 'USD')}`}
                        aria-label={`Operação ${i + 1}, ${o.ganhou ? 'ganhou' : 'perdeu'}. Toque para trocar.`} />
                    </span>
                  )
                })}
              </div>
              <div className="ssim-fita-legenda">
                <span><i className="g" />Ganhou</span><span><i className="p" />Perdeu</span><span><i className="rec" />Na recuperação</span>
                {r.fita && <button type="button" className="rel-btn ssim-pequeno" onClick={() => mudar({ fita: undefined })}>Desfazer as trocas</button>}
                {!r.fita && <button type="button" className="rel-btn ssim-pequeno" onClick={() => mudar({ semente: r.semente + 1 })}>Sortear outra ordem</button>}
              </div>
              <Numeros previa={previa} r={r} aoUsar={usar} />
              <label className="rsim-campo"><span>Nome do cenário</span>
                <span className="rsim-entrada"><input id="ssim-nome" value={r.nome} maxLength={60} onChange={(e) => mudar({ nome: e.target.value })} /></span>
              </label>
              <p className="rsim-aviso">Só os administradores veem. Nada é comprado na Deriv, nada é gravado, e a cabine mostra a tag <b>Sessão simulada</b>.</p>
            </Passo>
          )}
        </div>

        <footer>
          {falha && <small className="rsim-falha" role="alert">{falha}</small>}
          {aoSair && <button type="button" className="rel-btn rsim-sair" onClick={aoSair}>Sair da simulação</button>}
          <button type="button" className="rel-btn" onClick={() => (passo ? setPasso(passo - 1) : aoFechar())}>{passo ? 'Voltar' : 'Cancelar'}</button>
          {passo < PASSOS.length - 1
            ? <button type="button" className="rel-btn ouro" disabled={!!falha} onClick={() => setPasso(passo + 1)}>Continuar</button>
            : <button type="button" className="rel-btn ouro" disabled={primeiraFalha >= 0 || !ops.length} onClick={() => aoRodar({ ...r, nome: r.nome.trim() || 'Sessão simulada', fita: r.fita ?? previa?.resultados })}>Rodar a sessão</button>}
        </footer>
      </section>
    </div>
  )
}

const duracaoEmTexto = (s: number) => s < 90 ? `${Math.round(s)} s` : s < 5400 ? `${Math.round(s / 60)} min` : `${(s / 3600).toFixed(1).replace('.', ',')} h`

/** Os números que a sessão vai mostrar, e o que não bateu com o pedido (com o "Usar"). */
function Numeros({ previa: p, r, aoUsar, soTrecho }: { previa: ReturnType<typeof previaDoRoteiro>; r: Roteiro; aoUsar: (k: number, t: Partial<Trecho>) => void; soTrecho?: number }) {
  const ops = soTrecho === undefined ? p.corrida.ops : p.corrida.ops.filter((o) => o.trecho === soTrecho)
  const fim = soTrecho === undefined ? p.corrida.trechos[p.corrida.trechos.length - 1] : p.corrida.trechos[soTrecho]
  let s = 0, maior = 0
  ops.forEach((o) => { s = o.ganhou ? 0 : s + 1; maior = Math.max(maior, s) })
  const ganhas = ops.filter((o) => o.ganhou).length
  const itens: Array<[string, string, string?]> = [
    ['Resultado', dinheiroComSinal(fim?.resultado ?? 0, 'USD'), (fim?.resultado ?? 0) < 0 ? 'cai' : 'sobe'],
    ['Operações', `${ops.length} · ${ops.length ? Math.round((ganhas / ops.length) * 100) : 0}%`],
    ['Perdas seguidas', String(maior)],
    ['Maior entrada', usd(ops.reduce((m, o) => Math.max(m, o.valor), 0))],
    ['Saldo no fim', usd(ops.length ? ops[ops.length - 1].saldo : r.saldo)],
    ['Duração', duracaoEmTexto(soTrecho === undefined ? p.duracao : (p.duracao * ops.length) / Math.max(1, p.operacoes))],
  ]
  const difs = p.diferencas.filter((d) => soTrecho === undefined || d.trecho === soTrecho)
  const nomeDoCampo = { operacoes: 'Operações', resultado: 'Resultado', sequencia: 'Perdas seguidas', fim: 'Fim' }
  return (
    <section className={`rsim-previa ${difs.length || p.avisos.length ? 'com-aviso' : ''}`} aria-live="polite">
      <h4>{soTrecho === 1 ? 'Depois de religar' : 'Como a sessão vai acontecer'}</h4>
      <dl>{itens.map(([n, v, cl]) => <div key={n}><dt>{n}</dt><dd className={cl}>{v}</dd></div>)}</dl>
      {fim && <small>Para em: {fim.tipo === 'meta' ? 'meta batida' : fim.tipo === 'stop' ? 'limite de perda' : fim.tipo === 'saldo' ? 'saldo insuficiente' : fim.tipo === 'desligou' ? 'desligou' : fim.motivo}. Ritmo do ativo: um preço a cada {SEGUNDOS_POR_TICK} s.</small>}
      {p.avisos.map((a) => <p key={a} className="rsim-previa-aviso">{a}</p>)}
      {difs.map((d) => (
        <div key={`${d.trecho}-${d.campo}`} className="rsim-previa-aviso ssim-dif">
          <span>{d.campo === 'fim' ? d.saiu : <>{r.trechos.length > 1 && soTrecho === undefined ? `${d.trecho ? 'Depois de religar' : 'Antes de religar'} · ` : ''}{nomeDoCampo[d.campo]}: pedido {d.pedido}, com as regras da {IA} sai {d.saiu}.</>}</span>
          {d.usar && <button type="button" className="rel-btn ssim-pequeno" onClick={() => aoUsar(d.trecho, d.usar!)}>Usar {d.saiu}</button>}
        </div>
      ))}
    </section>
  )
}
