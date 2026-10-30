import { useEffect, useMemo, useRef, useState } from 'react'

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
const IMPACTO: Record<Evento['impacto'], string> = { alto: 'Alto impacto', medio: 'Médio impacto', baixo: 'Baixo impacto', feriado: 'Feriado' }

const num = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
/** No texto copiado o horário é sempre o de Brasília (quem lê pode estar em outro fuso). */
const horaBR = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
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

/** A ordem do jornal: o que o brasileiro olha primeiro, depois lá fora, depois o resto. */
const ORDEM = ['dolar', 'ibovespa', 'sp500', 'nasdaq', 'dow', 'euro', 'ouro', 'brent', 'bitcoin']

export function JornalDoDia({ cotacoes, manchetes, agenda, data }: {
  cotacoes: CotacaoDoJornal[]
  manchetes: ManchetesDoJornal[]
  /** undefined: o servidor ainda não manda a agenda (a coluna some). */
  agenda: Evento[] | undefined
  /** "sexta-feira, 30/10" */
  data: string
}) {
  const [dia, setDia] = useState<'hoje' | 'amanha'>('hoje')
  const [todos, setTodos] = useState(false)
  const [copiado, setCopiado] = useState<'ok' | 'falhou' | null>(null)

  const linhas = useMemo(() => ORDEM.map((id) => cotacoes.find((c) => c.id === id)).filter((c): c is CotacaoDoJornal => !!c), [cotacoes])
  const horaDasCotacoes = linhas.length ? hora(linhas.map((c) => c.hora).sort().reverse()[0]) : null

  const agora = new Date()
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1)
  const doDia = (alvo: Date) => (agenda ?? []).filter((e) => diaLocal(new Date(e.quando)) === diaLocal(alvo))
  const eventosHoje = doDia(agora)
  const eventos = (dia === 'hoje' ? eventosHoje : doDia(amanha))
    .filter((e) => todos || e.impacto === 'alto' || e.impacto === 'medio' || e.impacto === 'feriado')
  const proximo = dia === 'hoje' ? eventos.find((e) => Date.parse(e.quando) > agora.getTime()) : undefined
  const fortesHoje = eventosHoje.filter((e) => e.impacto === 'alto')

  // a lista abre no próximo evento (com o último que já saiu à mostra), não no começo do dia
  const lista = useRef<HTMLOListElement>(null)
  const idDoProximo = proximo?.id
  useEffect(() => {
    const ol = lista.current, li = ol?.querySelector<HTMLElement>('li.proximo')
    if (!ol || !li) return
    const anterior = li.previousElementSibling as HTMLElement | null
    ol.scrollTop = Math.max(0, (anterior ?? li).offsetTop) // a lista é a referência (position: relative)
  }, [idDoProximo, dia, todos])

  async function copiar() {
    const partes = [
      `*Jornal do dia · ${data}*`,
      '',
      '*Mercados*',
      ...linhas.map((c) => `${seta(c)} ${frase(c)}`),
    ]
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
    <section className={`mc-jornal ${agenda ? '' : 'sem-agenda'}`} aria-label="Jornal do dia e agenda econômica">
      <article className="mc-resumo" aria-labelledby="mc-resumo-titulo">
        <header className="mc-secao">
          <h3 id="mc-resumo-titulo">Jornal do dia</h3>
          <span>{data}{horaDasCotacoes && ` · cotações das ${horaDasCotacoes}`}</span>
        </header>
        {linhas.length ? (
          <ul className="mc-resumo-linhas">
            {linhas.map((c) => (
              <li key={c.id} className={Math.abs(c.variacao) < 0.05 ? '' : c.variacao > 0 ? 'sobe' : 'cai'}>
                <i aria-hidden="true">{seta(c)}</i>{frase(c)}
              </li>
            ))}
          </ul>
        ) : <p className="mc-resumo-vazio">Carregando as cotações…</p>}
        <footer className="mc-resumo-pe">
          <button type="button" className="mc-copiar" onClick={() => void copiar()} disabled={!linhas.length}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>
            {copiado === 'ok' ? 'Copiado' : 'Copiar o jornal'}
          </button>
          <small role="status">{copiado === 'ok' ? 'Pronto para colar no WhatsApp ou nos stories.' : copiado === 'falhou' ? 'O navegador não deixou copiar. Selecione o texto e copie.' : 'Mercados, agenda e manchetes, no formato do WhatsApp.'}</small>
        </footer>
      </article>

      {agenda && (
        <article className="mc-agenda" aria-labelledby="mc-agenda-titulo">
          <header className="mc-secao">
            <h3 id="mc-agenda-titulo">Agenda econômica</h3>
            <nav className="mc-filtros" aria-label="Dia e impacto">
              <button type="button" className={dia === 'hoje' ? 'on' : ''} aria-pressed={dia === 'hoje'} onClick={() => setDia('hoje')}>Hoje</button>
              <button type="button" className={dia === 'amanha' ? 'on' : ''} aria-pressed={dia === 'amanha'} onClick={() => setDia('amanha')}>Amanhã</button>
              <button type="button" className={`mc-todos ${todos ? 'on' : ''}`} aria-pressed={todos} onClick={() => setTodos((x) => !x)}>{todos ? 'Só os de impacto' : 'Mostrar todos'}</button>
            </nav>
          </header>
          {eventos.length ? (
            <ol className="mc-eventos" ref={lista}>
              {eventos.map((e) => {
                const passou = dia === 'hoje' && Date.parse(e.quando) <= agora.getTime()
                return (
                  <li key={e.id} className={`${e.impacto} ${passou ? 'passou' : ''} ${e === proximo ? 'proximo' : ''}`}>
                    <time dateTime={e.quando}>{hora(e.quando)}</time>
                    <span className="mc-evento-texto">
                      <b title={e.titulo !== e.original ? e.original : undefined}>{e.titulo}</b>
                      <small>
                        {PAIS[e.moeda] ?? e.moeda}
                        {e.previsao && <> · Previsão {e.previsao}</>}
                        {e.anterior && <> · Anterior {e.anterior}</>}
                        {e === proximo && <em> · Próximo</em>}
                      </small>
                    </span>
                    <i className="mc-impacto" title={IMPACTO[e.impacto]} aria-label={IMPACTO[e.impacto]}><s /><s /><s /></i>
                  </li>
                )
              })}
            </ol>
          ) : (
            <p className="mc-agenda-vazia">
              {agenda.length === 0 ? 'A agenda da semana está chegando. Ela aparece aqui em instantes.'
                : todos ? 'Nenhum evento neste dia.' : 'Nenhum evento de impacto neste dia. Toque em Mostrar todos para ver os demais.'}
            </p>
          )}
          <p className="mc-agenda-fonte">No seu horário. Principais economias (EUA, Europa, Reino Unido, Japão, China…), pelo calendário do Forex Factory.</p>
        </article>
      )}
    </section>
  )
}
