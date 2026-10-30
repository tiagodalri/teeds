import { Fragment as Fragmento, useEffect, useMemo, useRef, useState } from 'react'

/**
 * O jornal do dia e a agenda econômica (30/10/2026, vídeo do Victor: "vou usar
 * bastante pela manhã para gerar conteúdo com a galera… como se fosse um
 * calendário de notícia, o meu jornal do dia, para ficar atualizado de como
 * está a alta do dólar, o Ibovespa… para ter argumento").
 *
 *  - Jornal do dia: o resumo dos mercados em frases prontas, a agenda de
 *    impacto do dia e as manchetes, com um botão que copia tudo no formato do
 *    WhatsApp. É montado aqui, com as cotações e as notícias da própria aba:
 *    nada inventado, nenhuma previsão.
 *  - Agenda econômica: o calendário público do Forex Factory (servidor/src/
 *    mercado.ts), no horário de quem vê, com o impacto de cada evento e os
 *    números de previsão e anterior.
 */

export interface CotacaoDoJornal { id: string; nome: string; preco: number; variacao: number; moeda: string; hora: string }
export interface ManchetesDoJornal { id: string; titulo: string; fonte: string; link: string }
export interface Evento {
  id: string
  quando: string
  moeda: string
  titulo: string
  original: string
  impacto: 'alto' | 'medio' | 'baixo' | 'feriado'
  previsao: string
  anterior: string
}

const PAIS: Record<string, string> = {
  USD: 'EUA', EUR: 'Zona do euro', GBP: 'Reino Unido', JPY: 'Japão', CNY: 'China', AUD: 'Austrália',
  NZD: 'Nova Zelândia', CAD: 'Canadá', CHF: 'Suíça', ALL: 'Global',
}
const IMPACTO: Record<Evento['impacto'], string> = { alto: 'Alto', medio: 'Médio', baixo: 'Baixo', feriado: 'Feriado' }

const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
/** No texto copiado o horário é sempre o de Brasília (quem lê pode estar em outro fuso). */
const horaBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
/** O Forex Factory escreve "0.1%" e "<1.25%": em português, vírgula no decimal. */
const numeroBR = (t: string) => t.replace(/(\d)\.(\d)/g, '$1,$2')
const diaLocal = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/** "Dólar sobe 0,76%, a R$ 5,388" — o verbo pelo sinal, o valor como a aba mostra. */
function frase(c: CotacaoDoJornal): string {
  const v = Math.abs(c.variacao)
  const verbo = v < 0.05 ? 'fica estável' : c.variacao > 0 ? `sobe ${num(v)}%` : `cai ${num(v)}%`
  const valor = c.moeda === 'pts'
    ? `aos ${num(c.preco, 0)} pontos`
    : c.id === 'bitcoin' ? `a ${c.moeda} ${num(c.preco, 0)}` : `a ${c.moeda} ${num(c.preco, c.moeda === 'R$' ? 3 : 2)}`
  return `${c.nome} ${verbo}, ${valor}`
}
const seta = (c: CotacaoDoJornal) => (Math.abs(c.variacao) < 0.05 ? '▪' : c.variacao > 0 ? '▲' : '▼')

/** A ordem do jornal (o texto copiado): o que o brasileiro olha primeiro, depois lá fora, depois o resto. */
const ORDEM = ['dolar', 'ibovespa', 'sp500', 'nasdaq', 'dow', 'euro', 'ouro', 'brent', 'bitcoin']
/** O quadro de cotações, em três blocos como nos portais. */
const BLOCOS: Array<{ titulo: string; ids: string[] }> = [
  { titulo: 'Brasil', ids: ['ibovespa', 'dolar', 'euro'] },
  { titulo: 'Exterior', ids: ['sp500', 'nasdaq', 'dow'] },
  { titulo: 'Commodities e cripto', ids: ['ouro', 'brent', 'bitcoin'] },
]

const valorDe = (c: CotacaoDoJornal) => c.moeda === 'pts' ? `${num(c.preco, 0)} pts`
  : c.id === 'bitcoin' ? `${c.moeda} ${num(c.preco, 0)}` : `${c.moeda} ${num(c.preco, c.moeda === 'R$' ? 3 : 2)}`
const sinal = (c: CotacaoDoJornal) => (Math.abs(c.variacao) < 0.05 ? 'estavel' : c.variacao > 0 ? 'sobe' : 'cai')
const variacaoDe = (c: CotacaoDoJornal) => `${c.variacao > 0 ? '+' : c.variacao < 0 ? '−' : ''}${num(Math.abs(c.variacao))}%`

/** A manchete do dia, montada só com os números: "Dólar sobe 0,62% e Ibovespa cai 0,65%; Nasdaq cai 2,48%". */
function manchete(achar: (id: string) => CotacaoDoJornal | undefined): string | null {
  const curta = (c: CotacaoDoJornal) => `${c.nome} ${sinal(c) === 'estavel' ? 'fica estável' : `${sinal(c) === 'sobe' ? 'sobe' : 'cai'} ${num(Math.abs(c.variacao))}%`}`
  const d = achar('dolar'), i = achar('ibovespa')
  const fora = [achar('nasdaq'), achar('sp500')].filter((c): c is CotacaoDoJornal => !!c).sort((a, b) => Math.abs(b.variacao) - Math.abs(a.variacao))[0]
  const partes = [d && curta(d), i && curta(i)].filter(Boolean).join(' e ')
  if (!partes) return null
  return fora && Math.abs(fora.variacao) >= 0.5 ? `${partes}; ${curta(fora)} em Nova York` : partes
}

export function JornalDoDia({ cotacoes, manchetes, agenda, data }: {
  cotacoes: CotacaoDoJornal[]
  manchetes: ManchetesDoJornal[]
  /** undefined: o servidor ainda não manda a agenda (o bloco some). */
  agenda: Evento[] | undefined
  /** "Sexta-feira, 30/10" */
  data: string
}) {
  const [dia, setDia] = useState<'hoje' | 'amanha'>('hoje')
  const [todos, setTodos] = useState(false)
  const [copiado, setCopiado] = useState<'ok' | 'falhou' | null>(null)

  const achar = (id: string) => cotacoes.find((c) => c.id === id)
  const linhas = useMemo(() => ORDEM.map((id) => cotacoes.find((c) => c.id === id)).filter((c): c is CotacaoDoJornal => !!c), [cotacoes])
  const horaDasCotacoes = linhas.length ? hora(linhas.map((c) => c.hora).sort().reverse()[0]) : null
  const titulo = manchete(achar)

  const agora = new Date()
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
  const doDia = (alvo: Date) => (agenda ?? []).filter((e) => diaLocal(new Date(e.quando)) === diaLocal(alvo))
  const eventosHoje = doDia(agora)
  const eventos = (dia === 'hoje' ? eventosHoje : doDia(amanha))
    .filter((e) => todos || e.impacto === 'alto' || e.impacto === 'medio' || e.impacto === 'feriado')
  const proximo = dia === 'hoje' ? eventos.find((e) => Date.parse(e.quando) > agora.getTime()) : undefined
  const fortesHoje = eventosHoje.filter((e) => e.impacto === 'alto')
  const jaSairam = dia === 'hoje' ? eventos.filter((e) => Date.parse(e.quando) <= agora.getTime()).length : 0

  // a tabela abre na linha "Agora" (com o último que já saiu à mostra), não no começo do dia
  const corpoDaTabela = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const caixa = corpoDaTabela.current, marco = caixa?.querySelector<HTMLElement>('.mc-ag-agora')
    if (!caixa || !marco) return
    const antes = marco.previousElementSibling as HTMLElement | null
    caixa.scrollTop = Math.max(0, (antes ?? marco).offsetTop - 8)
  }, [jaSairam, dia, todos])

  async function copiar() {
    const partes = [`*Jornal do dia · ${data}*`]
    if (titulo) partes.push(`_${titulo}_`)
    partes.push('', '*Mercados*', ...linhas.map((c) => `${seta(c)} ${frase(c)}`))
    if (fortesHoje.length) {
      partes.push('', '*Agenda de hoje* (horário de Brasília)')
      for (const e of fortesHoje.slice(0, 6)) partes.push(`${horaBR(e.quando)} · ${PAIS[e.moeda] ?? e.moeda} · ${e.titulo}`)
    }
    if (manchetes.length) {
      partes.push('', '*Manchetes*')
      for (const m of manchetes.slice(0, 4)) partes.push(`• ${m.titulo} (${m.fonte})`)
    }
    try {
      await navigator.clipboard.writeText(partes.join('\n'))
      setCopiado('ok')
    } catch { setCopiado('falhou') }
    window.setTimeout(() => setCopiado(null), 2500)
  }

  return (
    <section className="mc-jornal" aria-label="Jornal do dia e agenda econômica">
      <article className="mc-resumo" aria-labelledby="mc-resumo-titulo">
        <header className="mc-resumo-topo">
          <div>
            <span className="mc-chapeu">Jornal do dia · {data}</span>
            <h3 id="mc-resumo-titulo">{titulo ?? 'Os mercados agora'}</h3>
            {horaDasCotacoes && <p>Cotações das {horaDasCotacoes}. O Ibovespa grátis chega com cerca de 15 minutos de atraso.</p>}
          </div>
          <div className="mc-copiar-area">
            <button type="button" className="mc-copiar" onClick={() => void copiar()} disabled={!linhas.length}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
              {copiado === 'ok' ? 'Copiado' : 'Copiar o jornal'}
            </button>
            <small role="status">{copiado === 'ok' ? 'Pronto para colar no WhatsApp.' : copiado === 'falhou' ? 'O navegador não deixou copiar.' : 'Mercados, agenda e manchetes, prontos para o WhatsApp'}</small>
          </div>
        </header>

        <div className="mc-quadro">
          {BLOCOS.map((b) => (
            <section key={b.titulo} className="mc-bloco" aria-label={b.titulo}>
              <h4>{b.titulo}</h4>
              <table>
                <tbody>
                  {b.ids.map((id) => {
                    const c = achar(id)
                    return (
                      <tr key={id}>
                        <th scope="row">{c?.nome ?? '—'}</th>
                        <td className="mc-q-valor">{c ? valorDe(c) : '—'}</td>
                        <td className="mc-q-var">{c && <span className={`mc-chip ${sinal(c)}`}>{variacaoDe(c)}</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      </article>

      {agenda && (
        <article className="mc-agenda" aria-labelledby="mc-agenda-titulo">
          <header className="mc-agenda-topo">
            <div>
              <h3 id="mc-agenda-titulo">Agenda econômica</h3>
              <p>No seu horário. {fortesHoje.length ? `${fortesHoje.length} ${fortesHoje.length === 1 ? 'evento' : 'eventos'} de alto impacto hoje.` : 'Nenhum evento de alto impacto hoje.'}</p>
            </div>
            <div className="mc-agenda-controles">
              <div className="mc-segmento" role="tablist" aria-label="Dia">
                <button type="button" role="tab" aria-selected={dia === 'hoje'} className={dia === 'hoje' ? 'on' : ''} onClick={() => setDia('hoje')}>Hoje</button>
                <button type="button" role="tab" aria-selected={dia === 'amanha'} className={dia === 'amanha' ? 'on' : ''} onClick={() => setDia('amanha')}>Amanhã</button>
              </div>
              <label className="mc-chave">
                <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} />
                <span aria-hidden="true" />Incluir baixo impacto
              </label>
            </div>
          </header>

          {eventos.length ? (
            <div className="mc-ag-tabela" role="table" aria-label="Eventos">
              <div className="mc-ag-cab" role="row">
                <span role="columnheader">Hora</span><span role="columnheader">País</span><span role="columnheader">Evento</span>
                <span role="columnheader">Impacto</span><span role="columnheader" className="num">Previsão</span><span role="columnheader" className="num">Anterior</span>
              </div>
              <div className="mc-ag-corpo" ref={corpoDaTabela} role="rowgroup">
                {eventos.map((e, i) => {
                  const passou = dia === 'hoje' && Date.parse(e.quando) <= agora.getTime()
                  return (
                    <Fragmento key={e.id}>
                      {dia === 'hoje' && i === jaSairam && jaSairam > 0 && <Agora />}
                      <div role="row" className={`mc-ag-linha ${e.impacto} ${passou ? 'saiu' : ''} ${e === proximo ? 'proximo' : ''}`}>
                        <time role="cell" dateTime={e.quando}>{hora(e.quando)}</time>
                        <span role="cell" className="mc-ag-pais">{PAIS[e.moeda] ?? e.moeda}</span>
                        <span role="cell" className="mc-ag-evento">
                          <b title={e.titulo !== e.original ? e.original : undefined}>{e.titulo}</b>
                          {e === proximo && <small className="prox">Próximo</small>}
                        </span>
                        <span role="cell"><span className={`mc-impacto-rot ${e.impacto}`}>{IMPACTO[e.impacto]}</span></span>
                        <span role="cell" className="num" data-rotulo="Previsão">{e.previsao ? numeroBR(e.previsao) : '—'}</span>
                        <span role="cell" className="num" data-rotulo="Anterior">{e.anterior ? numeroBR(e.anterior) : '—'}</span>
                      </div>
                    </Fragmento>
                  )
                })}
                {/* tudo do dia já saiu: o "Agora" fica no fim */}
                {dia === 'hoje' && jaSairam > 0 && jaSairam === eventos.length && <Agora />}
              </div>
            </div>
          ) : (
            <p className="mc-agenda-vazia">
              {agenda.length === 0 ? 'A agenda da semana está chegando. Ela aparece aqui em instantes.'
                : todos ? 'Nenhum evento neste dia.' : 'Nenhum evento de alto ou médio impacto neste dia. Ligue Incluir baixo impacto para ver todos.'}
            </p>
          )}
          <p className="mc-agenda-fonte">Principais economias (EUA, Europa, Reino Unido, Japão, China…), pelo calendário do Forex Factory. Previsão é a estimativa do mercado; o número oficial sai na hora marcada.</p>
        </article>
      )}
    </section>
  )
}

/** A linha "Agora" da agenda: separa o que já saiu do que ainda vem. */
function Agora() {
  return <div className="mc-ag-agora" role="presentation"><span>Agora · {hora(new Date().toISOString())}</span></div>
}
