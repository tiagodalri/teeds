/**
 * "Suas operações com I.A. hoje" (19/11/2026, Victor Cordeiro: "se eu atualizo, zera o histórico das
 * operações com I.A. de hoje. Seria bom deixar igual à manual, 24 horas disponível para os alunos e pra
 * nós também, ou, se quisermos, algum botão pra não aparecer").
 *
 * As operações das I.A. desta conta HOJE (dia de Brasília), lidas de operacoes_robos: voltam ao recarregar
 * a página e zeram à meia-noite, como "Suas últimas entradas" da manual. Agrupadas por sessão (a mais
 * recente primeiro); cada sessão abre a lista das operações dela. "Ocultar" esconde o bloco neste
 * aparelho (fica lembrado). No modo simulado não aparece: o simulado nunca grava no banco.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { operacoesDaIADoDia, type OperacaoDaIADoDia } from '../../core/teeds/clientes'
import { dinheiro, dinheiroComSinal } from '../../core/dinheiro'
import { nomeDaOperacao } from '../PositionCard'
import { MARCA } from '../../marca'
import './operacoes-da-ia-de-hoje.css'

const GF = MARCA.id === 'globalfly'
const CHAVE_OCULTO = `${MARCA.id}.ia-de-hoje.oculto`
const lerOculto = () => { try { return localStorage.getItem(CHAVE_OCULTO) === '1' } catch { return false } }
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' })
const horaSeg = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' })
const contar = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`

/** O preço de saída com o último dígito em destaque: as casas que fazem o último dígito bater com o gravado. */
function precoComDigito(preco: number | null, digito: number | null): { corpo: string; ultimo: string } | null {
  if (preco === null || !Number.isFinite(preco)) return null
  for (const casas of [2, 3, 4, 5, 1]) {
    const t = preco.toFixed(casas)
    if (digito === null || Number(t.slice(-1)) === digito) return { corpo: t.slice(0, -1).replace('.', ','), ultimo: t.slice(-1) }
  }
  const t = preco.toFixed(2)
  return { corpo: t.slice(0, -1).replace('.', ','), ultimo: t.slice(-1) }
}

interface SessaoDoDia { chave: string; nome: string; inicio: string; fim: string; ops: OperacaoDaIADoDia[]; resultado: number; ganhos: number; markup: number }

export function OperacoesDaIADeHoje({ sessao, contaId, atualizar, mostrarMarkup = false }: {
  sessao: SessaoTeeds
  contaId: string
  /** muda quando uma sessão liga ou para: relê na hora */
  atualizar?: string
  mostrarMarkup?: boolean
}) {
  const [ops, setOps] = useState<OperacaoDaIADoDia[] | null>(null)
  const [oculto, setOculto] = useState(lerOculto)
  const [aberta, setAberta] = useState<string | null>(null)
  const [todas, setTodas] = useState(false)
  const [dia, setDia] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))

  const ler = useCallback(async () => {
    const l = await operacoesDaIADoDia(sessao, contaId)
    if (l) setOps(l)
  }, [sessao.token, sessao.usuario.id, contaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ao abrir, quando uma sessão liga/para, e a cada 30 s (as operações da I.A. chegam pelo servidor)
  useEffect(() => { setOps(null); void ler() }, [ler])
  useEffect(() => { if (atualizar !== undefined) void ler() }, [atualizar]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState !== 'visible') return
      // virou o dia: a lista recomeça
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      if (hoje !== dia) { setDia(hoje); setOps([]); setAberta(null) }
      void ler()
    }, 30_000)
    return () => window.clearInterval(t)
  }, [ler, dia])

  const sessoes = useMemo<SessaoDoDia[]>(() => {
    const porChave = new Map<string, SessaoDoDia>()
    for (const o of ops ?? []) {
      const chave = o.sessaoId ?? `${o.roboId}:${o.executadaEm.slice(0, 13)}`
      let s = porChave.get(chave)
      if (!s) { s = { chave, nome: o.roboNome, inicio: o.executadaEm, fim: o.executadaEm, ops: [], resultado: 0, ganhos: 0, markup: 0 }; porChave.set(chave, s) }
      s.ops.push(o)
      s.resultado += o.resultado
      if (o.resultado >= 0) s.ganhos++
      s.markup += o.markup ?? 0
      if (o.executadaEm < s.inicio) s.inicio = o.executadaEm
      if (o.executadaEm > s.fim) s.fim = o.executadaEm
    }
    return [...porChave.values()].sort((a, b) => (a.fim < b.fim ? 1 : -1))
  }, [ops])

  const todasOps = ops ?? []
  const moeda = todasOps[0]?.moeda ?? 'USD'
  const resultado = todasOps.reduce((t, o) => t + o.resultado, 0)
  const ganhos = todasOps.filter((o) => o.resultado >= 0).length
  const perdas = todasOps.length - ganhos
  const markup = todasOps.reduce((t, o) => t + (o.markup ?? 0), 0)
  const pct = todasOps.length ? (ganhos / todasOps.length) * 100 : 0
  const titulo = GF ? 'Suas operações com I.A.' : 'Suas operações com robôs'

  const trocarOculto = () => setOculto((v) => {
    const n = !v
    try { localStorage.setItem(CHAVE_OCULTO, n ? '1' : '0') } catch { /* sem armazenamento: vale só agora */ }
    return n
  })

  // nada hoje (ou ainda lendo): não ocupa a tela
  if (!ops || ops.length === 0) return null

  if (oculto) return (
    <section className="iah iah-oculto" aria-label={titulo}>
      <span className="iah-rot">{titulo} <small>Hoje</small></span>
      <span className="iah-resumo-curto">{contar(todasOps.length, 'operação', 'operações')} · <b className={resultado >= 0 ? 'ganho' : 'perda'}>{dinheiroComSinal(resultado, moeda)}</b></span>
      <button type="button" className="iah-botao" onClick={trocarOculto}>Mostrar</button>
    </section>
  )

  const NA_LISTA = 8
  const naTela = todas ? sessoes : sessoes.slice(0, NA_LISTA)
  return (
    <section className="iah" aria-label={titulo}>
      <header>
        <span className="iah-rot">{titulo} <small title="A lista guarda as operações de hoje e recomeça à meia-noite">Hoje</small></span>
        <button type="button" className="iah-botao" onClick={trocarOculto} title="Esconder este bloco neste aparelho">Ocultar</button>
      </header>
      <div className="iah-resumo">
        <div>
          <span className="iah-legenda">Resultado do dia</span>
          <b className={`iah-total ${resultado >= 0 ? 'ganho' : 'perda'}`}>{dinheiroComSinal(resultado, moeda)}</b>
        </div>
        <p className="iah-contagem">
          {contar(sessoes.length, 'sessão', 'sessões')} · {contar(todasOps.length, 'operação', 'operações')}<br />
          <span className={ganhos ? 'ganho' : undefined}>{contar(ganhos, 'ganho', 'ganhos')}</span> · <span className={perdas ? 'perda' : undefined}>{contar(perdas, 'perda', 'perdas')}</span>
        </p>
      </div>
      <div className="iah-proporcao" aria-hidden="true">
        {ganhos > 0 && <i className="ganho" style={{ width: `${pct}%` }} />}
        {perdas > 0 && <i className="perda" style={{ width: `${100 - pct}%` }} />}
      </div>
      {mostrarMarkup && <p className="iah-markup-dia">Markup do dia <b>{dinheiro(markup, moeda)}</b></p>}
      <ol className="iah-sessoes">
        {naTela.map((s) => {
          const abertaAqui = aberta === s.chave
          const perdasS = s.ops.length - s.ganhos
          return (
            <li key={s.chave} className={`${s.resultado >= 0 ? 'ganho' : 'perda'} ${abertaAqui ? 'aberta' : ''}`}>
              <button type="button" className="iah-sessao" aria-expanded={abertaAqui} onClick={() => setAberta(abertaAqui ? null : s.chave)}>
                <span className="iah-s1">
                  <span className="iah-nome">{s.nome}</span>
                  <b className="iah-res">{dinheiroComSinal(s.resultado, moeda)}</b>
                </span>
                <span className="iah-s2">
                  <span><span className="iah-hora">{hora(s.inicio)}{hora(s.fim) !== hora(s.inicio) ? `–${hora(s.fim)}` : ''}</span> · {contar(s.ops.length, 'operação', 'operações')} · {s.ganhos} {s.ganhos === 1 ? 'ganho' : 'ganhos'} · {perdasS} {perdasS === 1 ? 'perda' : 'perdas'}</span>
                  <i aria-hidden="true" className="iah-seta">▾</i>
                </span>
                {mostrarMarkup && <small className="iah-markup">Markup {dinheiro(s.markup, moeda)}</small>}
              </button>
              {abertaAqui && (
                <ol className="iah-ops">
                  {s.ops.map((o) => {
                    const p = precoComDigito(o.precoSaida, o.digitoSaida)
                    const g = o.resultado >= 0
                    return (
                      <li key={o.contractId} className={g ? 'ganho' : 'perda'}>
                        <span className="iah-hora">{horaSeg(o.executadaEm)}</span>
                        <span className="iah-tipo">{nomeDaOperacao(o.tipoContrato)} · {dinheiro(o.entrada, o.moeda)}</span>
                        <span className="iah-saida" title="Preço de saída: o último dígito é o que valeu">{p ? <>{p.corpo}<b>{p.ultimo}</b></> : o.digitoSaida !== null ? <b>{o.digitoSaida}</b> : '—'}</span>
                        <b className="iah-res">{dinheiroComSinal(o.resultado, o.moeda)}</b>
                      </li>
                    )
                  })}
                </ol>
              )}
            </li>
          )
        })}
      </ol>
      {sessoes.length > NA_LISTA && (
        <button type="button" className="iah-mais" onClick={() => setTodas((v) => !v)}>{todas ? `Mostrar só as últimas ${NA_LISTA}` : `Ver todas as sessões (${sessoes.length})`}</button>
      )}
    </section>
  )
}
