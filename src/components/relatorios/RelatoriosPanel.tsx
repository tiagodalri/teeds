/**
 * Relatórios (27/10/2026): o cliente acompanha o próprio resultado com os
 * números da corretora. Período, conta real ou demo, o resultado em destaque,
 * a curva do período, cada I.A., os ativos, os melhores horários, depósitos e
 * saques (ao vivo da Deriv), o compartilhamento estimado do mês e as últimas
 * operações. Ver src/core/teeds/relatorios.ts.
 */
import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { TeedsSocket } from '../../core/deriv/client'
import { MARCA } from '../../marca'
import { dinheiro, dinheiroComSinal, simboloMoeda } from '../../core/dinheiro'
import { nomeDoSimbolo } from '../../core/deriv/simbolos'
import { MASCARA, useValoresOcultos } from '../../core/privacidade'
import { tipoNaTela } from '../../core/deriv/accountAccess'
import { dinheiroDoPeriodo, intervalo, meuRelatorio, nomeDoTipo, PERIODOS, type Dinheiro, type Periodo, type Relatorio } from '../../core/teeds/relatorios'
import './relatorios.css'
import { NomeDoRobo } from '../NomeDoRobo'
import { DERIV } from '../../core/deriv/config'

interface Props {
  sessao: SessaoTeeds
  socket: TeedsSocket | null
  conectada: boolean
  /** A conta escolhida agora é demo (o tipo verdadeiro). */
  contaDemo: boolean
  /** Rótulos trocados (acessos internos): só a etiqueta da tela muda. */
  rotulosTrocados?: boolean
  saldo: number | null
  moeda: string
  aoIr: (tela: 'robos' | 'operar') => void
  /** Laboratório: dados de exemplo no lugar do banco e da corretora. */
  exemplo?: { relatorio: Relatorio; dinheiro?: Dinheiro }
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
const classe = (v: number) => (v > 0 ? 'sobe' : v < 0 ? 'cai' : '')
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

/* ------------------------------------------------ a curva do período */
function Curva({ pontos, rotulos, ocultos, moeda }: { pontos: Array<{ chave: string; valor: number; ops: number }>; rotulos: [string, string, string]; ocultos: boolean; moeda: string }) {
  const W = 640, H = 220, P = 14, base = H - 30
  const acum: number[] = []
  pontos.reduce((s, p) => { const v = s + p.valor; acum.push(v); return v }, 0)
  const maxBar = Math.max(1e-9, ...pontos.map((p) => Math.abs(p.valor)))
  const minA = Math.min(0, ...acum), maxA = Math.max(0, ...acum), faixa = Math.max(1e-9, maxA - minA)
  const largura = (W - 2 * P) / Math.max(1, pontos.length)
  const zeroBar = P + (base - P) / 2
  const yA = (v: number) => P + (1 - (v - minA) / faixa) * (base - P)
  const linha = acum.map((v, i) => `${(P + largura * i + largura / 2).toFixed(1)},${yA(v).toFixed(1)}`).join(' ')
  const fim = acum[acum.length - 1] ?? 0
  return (
    <svg className="rel-curva" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Resultado no período: barras por dia e a linha do acumulado">
      <line className="zero" x1={P} x2={W - P} y1={yA(0)} y2={yA(0)} />
      {pontos.map((p, i) => {
        const h = (Math.abs(p.valor) / maxBar) * ((base - P) / 2 - 4)
        const x = P + largura * i + largura * 0.18
        return (
          <rect key={p.chave} className={`barra ${classe(p.valor)}`} x={x} width={Math.max(1.5, largura * 0.64)} rx={Math.min(3, largura * 0.2)}
            y={p.valor >= 0 ? zeroBar - h : zeroBar} height={Math.max(p.ops ? 1.5 : 0, h)}>
            <title>{`${p.chave}: ${ocultos ? MASCARA : dinheiroComSinal(p.valor, moeda)} · ${p.ops} ${p.ops === 1 ? 'operação' : 'operações'}`}</title>
          </rect>
        )
      })}
      {acum.length > 1 && <polyline className={`acum ${classe(fim)}`} points={linha} />}
      {acum.length > 0 && <circle className={`ponta ${classe(fim)}`} cx={P + largura * (acum.length - 1) + largura / 2} cy={yA(fim)} r="4.5" />}
      <text className="eixo" x={P} y={H - 8}>{rotulos[0]}</text>
      <text className="eixo" x={W / 2} y={H - 8} textAnchor="middle">{rotulos[1]}</text>
      <text className="eixo" x={W - P} y={H - 8} textAnchor="end">{rotulos[2]}</text>
    </svg>
  )
}

export function RelatoriosPanel({ sessao, socket, conectada, contaDemo, rotulosTrocados = false, saldo, moeda, aoIr, exemplo }: Props) {
  const ocultos = useValoresOcultos()
  const [periodo, setPeriodo] = useState<Periodo>('30d')
  const [demo, setDemo] = useState<boolean>(contaDemo)
  const [rel, setRel] = useState<Relatorio | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [dinheiroP, setDinheiroP] = useState<Dinheiro | null>(null)
  const [todas, setTodas] = useState(false)
  const [versao, setVersao] = useState(0)

  useEffect(() => { setDemo(contaDemo) }, [contaDemo])

  useEffect(() => {
    let vivo = true
    setCarregando(true); setErro(null)
    if (exemplo) { setRel(exemplo.relatorio); setCarregando(false); return }
    meuRelatorio(sessao, { periodo, demo })
      .then((r) => { if (vivo) setRel(r) })
      // nunca o texto cru do navegador ("Failed to fetch"): sempre o que fazer
      .catch(() => { if (vivo) setErro('Não foi possível montar o relatório agora. Toque em Atualizar para tentar de novo.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [sessao.token, periodo, demo, versao]) // eslint-disable-line react-hooks/exhaustive-deps

  // depósitos e saques: ao vivo da Deriv, só quando a conta conectada é a do filtro
  const contaDoFiltro = !!exemplo?.dinheiro || (conectada && socket && demo === contaDemo)
  useEffect(() => {
    setDinheiroP(exemplo?.dinheiro ?? null)
    if (exemplo || !contaDoFiltro || !socket || demo) return
    let vivo = true
    dinheiroDoPeriodo(socket, periodo).then((d) => { if (vivo) setDinheiroP(d) }).catch(() => undefined)
    return () => { vivo = false }
  }, [contaDoFiltro, periodo, demo, versao]) // eslint-disable-line react-hooks/exhaustive-deps

  const v = (x: number) => (ocultos ? MASCARA : dinheiro(x, moeda))
  const vs = (x: number) => (ocultos ? MASCARA : dinheiroComSinal(x, moeda))
  const rotuloConta = (d: boolean) => (tipoNaTela(d ? 'demo' : 'real', rotulosTrocados) === 'demo' ? 'Demo' : 'Real')

  // a série do gráfico: por hora no "Hoje", por dia nos outros (com os dias sem operação)
  const serie = useMemo(() => {
    if (!rel) return { pontos: [], rotulos: ['', '', ''] as [string, string, string] }
    if (periodo === 'hoje') {
      const porHora = new Map(rel.porHora.map((h) => [h.hora, h]))
      const pontos = Array.from({ length: 24 }, (_, h) => ({ chave: `${String(h).padStart(2, '0')}h`, valor: porHora.get(h)?.resultado ?? 0, ops: porHora.get(h)?.operacoes ?? 0 }))
      return { pontos, rotulos: ['0h', '12h', '23h'] as [string, string, string] }
    }
    const { de, ate } = intervalo(periodo)
    const porDia = new Map(rel.porDia.map((d) => [d.dia, d]))
    const pontos: Array<{ chave: string; valor: number; ops: number }> = []
    const [a, m, d] = de.split('-').map(Number)
    for (let dia = new Date(a, m - 1, d); ; dia.setDate(dia.getDate() + 1)) {
      const k = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`
      const rot = `${String(dia.getDate()).padStart(2, '0')}/${String(dia.getMonth() + 1).padStart(2, '0')}`
      pontos.push({ chave: rot, valor: porDia.get(k)?.resultado ?? 0, ops: porDia.get(k)?.operacoes ?? 0 })
      if (k >= ate || pontos.length > 62) break
    }
    return { pontos, rotulos: [pontos[0]?.chave ?? '', pontos[Math.floor(pontos.length / 2)]?.chave ?? '', pontos[pontos.length - 1]?.chave ?? ''] as [string, string, string] }
  }, [rel, periodo])

  const t = rel?.total
  const vazio = !!rel && t!.operacoes === 0
  const diasComOp = rel?.porDia.filter((d) => d.operacoes > 0) ?? []
  const melhorDia = diasComOp.length ? diasComOp.reduce((a, b) => (b.resultado > a.resultado ? b : a)) : null
  const piorDia = diasComOp.length ? diasComOp.reduce((a, b) => (b.resultado < a.resultado ? b : a)) : null
  const diasPositivos = diasComOp.filter((d) => d.resultado > 0).length
  const maxOrigem = Math.max(1e-9, ...(rel?.porOrigem.map((o) => Math.abs(o.resultado)) ?? [0]))
  const maxHora = Math.max(1e-9, ...(rel?.porHora.map((h) => Math.abs(h.resultado)) ?? [0]))
  const porHora = new Map(rel?.porHora.map((h) => [h.hora, h]) ?? [])
  const mesNome = rel?.mes.inicio ? MESES[Number(rel.mes.inicio.slice(5, 7)) - 1] : ''
  const taxa = MARCA.compartilhamento ?? 0
  const diaCurto = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }

  return (
    <div className="rel">
      {/* ------------------------------------------------ filtros */}
      <div className="rel-filtros">
        <div className="rel-seg" role="tablist" aria-label="Período">
          {PERIODOS.map((p) => <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} className={periodo === p.id ? 'on' : ''} onClick={() => setPeriodo(p.id)}>{p.rotulo}</button>)}
        </div>
        <div className="rel-seg rel-conta" role="tablist" aria-label="Conta">
          {[false, true].map((d) => <button key={String(d)} type="button" role="tab" aria-selected={demo === d} className={`${demo === d ? 'on' : ''} ${rotuloConta(d) === 'Real' ? 'real' : 'demo'}`} onClick={() => setDemo(d)}>Conta {rotuloConta(d)}</button>)}
        </div>
        <button type="button" className="rel-atualizar" onClick={() => setVersao((x) => x + 1)} disabled={carregando} aria-label="Atualizar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /></svg>{carregando ? 'Atualizando…' : 'Atualizar'}
        </button>
      </div>

      {erro && <p className="rel-erro" role="alert">{erro}</p>}

      {!rel && carregando && <div className="rel-esqueleto" aria-busy="true"><i /><i /><i /></div>}

      {rel && vazio && (
        <section className="rel-vazio">
          <h3>Nenhuma operação na conta {rotuloConta(demo)} neste período</h3>
          <p>Assim que você operar pela {MARCA.prosa}, cada resultado aparece aqui, com os números da corretora.</p>
          <div className="rel-vazio-acoes">
            <button type="button" className="rel-btn ouro" onClick={() => aoIr('robos')}>Ligar uma I.A.</button>
            <button type="button" className="rel-btn" onClick={() => aoIr('operar')}>Operar no manual</button>
          </div>
        </section>
      )}

      {rel && !vazio && t && <>
        {/* ------------------------------------------------ o resultado */}
        <section className={`rel-heroi ${classe(t.resultado)}`}>
          <div className="rel-heroi-txt">
            <span className="rel-rot">Resultado · {PERIODOS.find((p) => p.id === periodo)!.rotulo.toLowerCase()} · conta {rotuloConta(demo).toLowerCase()}</span>
            <b className={`rel-numero ${classe(t.resultado)}`}>{vs(t.resultado)}</b>
            <p>{t.operacoes.toLocaleString('pt-BR')} operações · {pct(t.ganhas, t.operacoes)}% de acerto · {v(t.entradas)} em entradas</p>
          </div>
          <Curva pontos={serie.pontos} rotulos={serie.rotulos} ocultos={ocultos} moeda={moeda} />
        </section>

        {/* ------------------------------------------------ números */}
        <div className="rel-kpis">
          <div><span>Operações</span><b>{t.operacoes.toLocaleString('pt-BR')}</b><small>{t.ganhas.toLocaleString('pt-BR')} com ganho</small></div>
          <div><span>Acerto</span><b>{pct(t.ganhas, t.operacoes)}%</b><i className="rel-trilho"><u style={{ width: `${pct(t.ganhas, t.operacoes)}%` }} /></i></div>
          <div><span>{periodo === 'hoje' ? 'Maior ganho' : 'Melhor dia'}</span><b className="sobe">{periodo === 'hoje' ? vs(t.maiorGanho) : melhorDia ? vs(melhorDia.resultado) : '—'}</b><small>{periodo === 'hoje' ? 'Numa operação' : melhorDia ? diaCurto(melhorDia.dia) : ''}</small></div>
          <div><span>{periodo === 'hoje' ? 'Maior perda' : 'Pior dia'}</span><b className="cai">{periodo === 'hoje' ? vs(t.maiorPerda) : piorDia ? vs(piorDia.resultado) : '—'}</b><small>{periodo === 'hoje' ? 'Numa operação' : piorDia ? `${diaCurto(piorDia.dia)} · ${diasPositivos} de ${diasComOp.length} dias no positivo` : ''}</small></div>
        </div>

        {/* ------------------------------------------------ compartilhamento do mês (só na conta real: na aba
            demo os números da real confundiam; o filtro usa o tipo verdadeiro, nunca a etiqueta) */}
        {taxa > 0 && !demo && (
          <section className="rel-comp">
            <div>
              <span className="rel-rot">Compartilhamento de {mesNome}</span>
              <p>{rel.mes.resultado > 0
                ? <>Lucro pela plataforma na conta real até agora: <b>{v(rel.mes.resultado)}</b>. Estimativa de {Math.round(taxa * 100)}%: <b className="ouro">{v(rel.mes.resultado * taxa)}</b>.</>
                : <>Até agora o mês está {rel.mes.operacoes ? 'sem lucro' : 'sem operações'} na conta real: <b>nada a pagar</b>.</>}</p>
            </div>
            <small>A plataforma é gratuita. Você só paga {Math.round(taxa * 100)}% do lucro do mês, apurado no início do mês seguinte. Mês sem lucro, nada a pagar.</small>
          </section>
        )}

        <div className="rel-duas">
          {/* ------------------------------------------------ por I.A. */}
          <section className="rel-bloco">
            <h3>Por estratégia</h3>
            <ul className="rel-lista">
              {rel.porOrigem.map((o) => (
                <li key={`${o.origem}-${o.id}`}>
                  <div className="rel-lista-cab"><b>{o.origem === 'manual' ? o.nome : <NomeDoRobo nome={o.nome} id={o.id} />}</b><span className={classe(o.resultado)}>{vs(o.resultado)}</span></div>
                  <i className={`rel-barra ${classe(o.resultado)}`}><u style={{ width: `${(Math.abs(o.resultado) / maxOrigem) * 100}%` }} /></i>
                  <small>{o.operacoes.toLocaleString('pt-BR')} operações · {pct(o.ganhas, o.operacoes)}% de acerto</small>
                </li>
              ))}
            </ul>
          </section>

          {/* ------------------------------------------------ horários e ativos */}
          <section className="rel-bloco">
            <h3>Seus horários</h3>
            <div className="rel-horas" role="img" aria-label="Resultado por hora do dia">
              {Array.from({ length: 24 }, (_, h) => {
                const x = porHora.get(h)
                const forca = x ? Math.max(.18, Math.abs(x.resultado) / maxHora) : 0
                return <i key={h} className={x ? classe(x.resultado) || 'neutro' : 'vazio'} style={{ '--forca': forca } as React.CSSProperties}
                  title={x ? `${h}h: ${ocultos ? MASCARA : dinheiroComSinal(x.resultado, moeda)} · ${x.operacoes} operações · ${pct(x.ganhas, x.operacoes)}% de acerto` : `${h}h: sem operações`} />
              })}
            </div>
            <div className="rel-horas-eixo"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
            <p className="rel-nota">Verde é hora no positivo, vermelho no negativo. Quanto mais forte a cor, maior o valor.</p>

            <h3 className="rel-sub">Ativos</h3>
            <ul className="rel-ativos">
              {rel.porAtivo.slice(0, 6).map((a) => (
                <li key={a.ativo}><b>{a.ativo ? nomeDoSimbolo(a.ativo) : '—'}</b><span>{a.operacoes.toLocaleString('pt-BR')} op. · {pct(a.ganhas, a.operacoes)}%</span><em className={classe(a.resultado)}>{vs(a.resultado)}</em></li>
              ))}
            </ul>
          </section>
        </div>
      </>}

      {/* ------------------------------------------------ dinheiro na corretora */}
      {rel && !demo && (
        <section className="rel-bloco rel-dinheiro">
          <div className="rel-bloco-cab">
            <h3>Na corretora</h3>
            <a className="rel-link" href={DERIV.deposito} target="_blank" rel="noopener noreferrer">Depositar na Deriv ↗</a>
          </div>
          {!contaDoFiltro ? <p className="rel-nota">{conectada ? `Para ver depósitos e saques, escolha a conta ${rotuloConta(false)} no topo da plataforma.` : 'Conecte a corretora para ver o saldo, os depósitos e os saques.'}</p> : <>
            <div className="rel-kpis tres">
              <div><span>Saldo agora</span><b>{saldo === null ? '—' : v(saldo)}</b><small>Ao vivo da corretora</small></div>
              <div><span>Depósitos no período</span><b className="sobe">{dinheiroP ? v(dinheiroP.depositos) : '…'}</b><small>{dinheiroP ? (() => { const n = dinheiroP.movimentos.filter((x) => x.tipo === 'deposit').length; return `${n} ${n === 1 ? 'depósito' : 'depósitos'}` })() : 'Lendo o extrato…'}</small></div>
              <div><span>Saques no período</span><b>{dinheiroP ? v(dinheiroP.saques) : '…'}</b><small>{dinheiroP ? (() => { const n = dinheiroP.movimentos.filter((x) => x.tipo === 'withdrawal').length; return `${n} ${n === 1 ? 'saque' : 'saques'}` })() : 'Lendo o extrato…'}</small></div>
            </div>
            {dinheiroP && dinheiroP.movimentos.length > 0 && <ul className="rel-movs">
              {dinheiroP.movimentos.slice(0, 8).map((m, i) => (
                <li key={i}><span>{new Date(m.quando * 1000).toLocaleDateString('pt-BR')} · {new Date(m.quando * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><b>{m.tipo === 'deposit' ? 'Depósito' : 'Saque'}</b><em className={m.tipo === 'deposit' ? 'sobe' : ''}>{m.tipo === 'deposit' ? '+' : '−'}{ocultos ? MASCARA : dinheiro(m.valor, moeda)}</em></li>
              ))}
            </ul>}
          </>}
        </section>
      )}

      {/* ------------------------------------------------ últimas operações */}
      {rel && !vazio && (
        <section className="rel-bloco">
          <h3>Últimas operações</h3>
          <div className="rel-ops">
            <div className="cab"><span>Quando</span><span>Estratégia</span><span>Ativo</span><span>Entrada</span><span>Resultado</span></div>
            {(todas ? rel.ultimas : rel.ultimas.slice(0, 12)).map((o, i) => {
              const d = new Date(o.quando)
              return (
                <div className="linha" key={i}>
                  <span>{d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span><b>{o.origem === 'manual' ? o.nome : <NomeDoRobo nome={o.nome} id={o.id} />}</b><small>{nomeDoTipo(o.tipo)}</small></span>
                  <span>{o.ativo ? nomeDoSimbolo(o.ativo) : '—'}</span>
                  <span>{ocultos ? MASCARA : `${simboloMoeda(moeda)} ${o.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
                  <span className={classe(o.resultado)}>{vs(o.resultado)}</span>
                </div>
              )
            })}
          </div>
          {rel.ultimas.length > 12 && <button type="button" className="rel-mais" onClick={() => setTodas((x) => !x)}>{todas ? 'Mostrar menos' : `Ver as últimas ${rel.ultimas.length}`}</button>}
        </section>
      )}

      <p className="rel-fonte">Números das operações feitas pela {MARCA.prosa}, como a corretora registrou cada contrato. Depósitos, saques e saldo vêm ao vivo da corretora. Valores em dólar. Resultados passados não garantem resultados futuros.</p>
    </div>
  )
}
