import { useMemo } from 'react'
import type { EventoDeCobranca } from '../../core/teeds/anuncios'
import { DE_PAGAMENTO, dinheiro, nomeDaSituacao, type useCobranca } from './Cobranca'
import './financeiro.css'

/*
  A aba Financeiro da conta de anúncios (09/11/2026, Tiago: "não vi a parte que vc falou que tinha criado para
  acompanhar o financeiro das campanhas, histórico de pagamentos, saldo pendente pra pagar, recusas e b.o. no
  pagamento"). A cobrança já existia, mas só na janelinha do selo da conta. Aqui ela ganha a página inteira:
  a situação, o que falta cobrar, o cartão, o limite, os 30 dias em barras e o histórico dia a dia.
  Os dados são os mesmos da janelinha (função meta-ads, acao 'cobranca'): a Meta não entrega fatura, data da
  próxima cobrança nem o limite de cobrança do cartão pela API (testado em 09/11, os campos não existem).
*/

const FUSO = 'America/Sao_Paulo'
// a Meta manda "2026-11-08T21:41:12-0300"; o Safari só entende o fuso com dois-pontos
const data = (iso: string) => new Date(iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
const diaDe = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: FUSO })
const hora = (d: Date) => d.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' })
const nomeDoDia = (dia: string) => {
  const hoje = diaDe(new Date()), ontem = diaDe(new Date(Date.now() - 864e5))
  if (dia === hoje) return 'Hoje'
  if (dia === ontem) return 'Ontem'
  const [a, m, d] = dia.split('-').map(Number)
  const nome = new Date(Date.UTC(a, m - 1, d, 12)).toLocaleDateString('pt-BR', { timeZone: 'UTC', weekday: 'long', day: '2-digit', month: '2-digit' })
  return nome.charAt(0).toUpperCase() + nome.slice(1)
}
const quandoCurto = (iso: string) => { const d = data(iso); const dia = diaDe(d); const n = nomeDoDia(dia); return `${/^(Hoje|Ontem)$/.test(n) ? n : n.split(', ')[1] ?? n}, ${hora(d)}` }

const FRASE: Record<number, string> = {
  1: 'Os anúncios rodam normalmente e a Meta cobra o cartão conforme o gasto.',
  2: 'A Meta desativou a conta. Os anúncios estão parados.',
  3: 'Há pagamento em atraso. Os anúncios estão parados até a conta ser paga.',
  7: 'A Meta está analisando a conta. Os anúncios podem ficar parados até terminar.',
  8: 'Há um acerto pendente. Os anúncios estão parados até acertar.',
  9: 'A Meta não conseguiu cobrar o cartão. Os anúncios ainda rodam, mas param se o pagamento não for feito.',
  100: 'A conta está sendo fechada.', 101: 'A conta foi fechada.',
}

function Situacao({ status }: { status: number }) {
  const tom = status === 1 ? 'ok' : DE_PAGAMENTO.has(status) || status === 2 ? 'erro' : 'aviso'
  return (
    <div className={`fn-cartao fn-situacao ${tom}`}>
      <small>Situação da conta</small>
      <b><i aria-hidden="true" />{nomeDaSituacao(status)}</b>
      <p>{FRASE[status] ?? 'Confira a conta na Meta.'}</p>
    </div>
  )
}

const ROTULO: Record<EventoDeCobranca['tipo'], string> = { cobrada: 'Cobrança aprovada', recusada: 'Cobrança recusada', estorno: 'Estorno', contestada: 'Contestação', situacao: '' }

/** As barras dos últimos 30 dias: o que foi cobrado em cada dia, e um ponto vermelho nos dias com recusa. */
function Barras({ eventos, moeda }: { eventos: EventoDeCobranca[]; moeda: string }) {
  const dias = useMemo(() => {
    const lista = Array.from({ length: 30 }, (_, i) => ({ dia: diaDe(new Date(Date.now() - (29 - i) * 864e5)), cobrado: 0, aprovadas: 0, recusadas: 0 }))
    const porDia = new Map(lista.map((x) => [x.dia, x]))
    for (const e of eventos) {
      const x = porDia.get(diaDe(data(e.em))); if (!x) continue
      if (e.tipo === 'cobrada') { x.cobrado += e.valor ?? 0; x.aprovadas++ }
      if (e.tipo === 'recusada') x.recusadas++
    }
    return lista
  }, [eventos])
  const max = Math.max(1, ...dias.map((x) => x.cobrado))
  return (
    <div className="fn-barras" role="img" aria-label="Cobranças por dia nos últimos 30 dias">
      {dias.map((x, i) => {
        const [, m, d] = x.dia.split('-')
        const dica = `${d}/${m}: ${x.aprovadas ? `${dinheiro(x.cobrado, moeda)} em ${x.aprovadas} cobrança${x.aprovadas > 1 ? 's' : ''}` : 'nenhuma cobrança'}${x.recusadas ? ` · ${x.recusadas} recusada${x.recusadas > 1 ? 's' : ''}` : ''}`
        return (
          <span key={x.dia} title={dica} className={i === 29 ? 'hoje' : ''}>
            {/* o ponto vermelho da recusa fica logo acima da barra do dia */}
            {x.recusadas > 0 && <em aria-hidden="true" style={{ bottom: `calc(${x.cobrado ? Math.max(6, (x.cobrado / max) * 100) * 0.88 : 1}% + 5px)` }} />}
            <i style={{ height: x.cobrado ? `${Math.max(6, (x.cobrado / max) * 100) * 0.88}%` : undefined }} className={x.cobrado ? '' : 'zero'} />
            {(i % 5 === 4 || i === 29) && <small>{i === 29 ? 'Hoje' : `${d}/${m}`}</small>}
          </span>
        )
      })}
    </div>
  )
}

export function Financeiro({ cobranca, statusDoPainel, nomeParceiro, contaNome, gastoDoPeriodo, periodo }: {
  cobranca: ReturnType<typeof useCobranca>; statusDoPainel: number; nomeParceiro: string; contaNome: string
  /** o valor gasto do período escolhido no topo (o mesmo do Gerenciador), para comparar com o que já foi cobrado */
  gastoDoPeriodo: number | null; periodo: string
}) {
  const { estado, indo, ler } = cobranca
  const c = estado && 'c' in estado ? estado.c : null
  const status = c?.conta.status || statusDoPainel
  const moeda = c?.conta.moeda ?? 'BRL'
  const eventos = c?.eventos ?? []
  const cobradas = eventos.filter((e) => e.tipo === 'cobrada')
  const recusadas = eventos.filter((e) => e.tipo === 'recusada')
  const totalCobrado = cobradas.reduce((s, e) => s + (e.valor ?? 0), 0)
  const ultimaOk = cobradas[0] ?? null
  const ultimaRecusa = recusadas[0] ?? null
  // as recusas que vieram depois da última cobrança aprovada: são o problema de agora
  const iOk = eventos.findIndex((e) => e.tipo === 'cobrada')
  const recusasAbertas = eventos.slice(0, iOk < 0 ? undefined : iOk).filter((e) => e.tipo === 'recusada')
  const bo = DE_PAGAMENTO.has(status) || status === 2 || recusasAbertas.length > 0
  const link = c?.link ?? 'https://business.facebook.com/billing_hub/accounts'
  const limite = c?.conta.limite ?? 0
  const usoDoLimite = limite > 0 ? Math.min(100, ((c?.conta.gastoTotal ?? 0) / limite) * 100) : 0

  const grupos = useMemo(() => {
    const m = new Map<string, EventoDeCobranca[]>()
    for (const e of eventos) { const k = diaDe(data(e.em)); m.set(k, [...(m.get(k) ?? []), e]) }
    return [...m.entries()]
  }, [eventos])

  return (
    <section className="aa-cartao fn">
      <header className="fn-topo">
        <div><span className="rot">Financeiro · conta de anúncios do {nomeParceiro}</span><h3>{contaNome || 'Cobrança e pagamentos'}</h3></div>
        <div className="fn-acoes">
          <button type="button" className="fn-reler" onClick={() => ler()} disabled={indo}>{indo ? 'Lendo na Meta…' : 'Ler de novo'}</button>
          <a className="fn-pagar" href={link} target="_blank" rel="noreferrer">Abrir a cobrança na Meta <span aria-hidden="true">↗</span></a>
        </div>
      </header>

      {!estado && <div className="fn-esqueleto" aria-label="Lendo a cobrança na Meta"><i /><i /><i /><i /></div>}
      {estado && 'aviso' in estado && <p className="fn-aviso">{estado.aviso}</p>}

      {c && (<>
        {bo && (
          <div className="fn-bo" role="alert">
            <span className="fn-bo-icone" aria-hidden="true">!</span>
            <div>
              <b>{DE_PAGAMENTO.has(status) || status === 2 ? nomeDaSituacao(status) : `${recusasAbertas.length} cobrança${recusasAbertas.length > 1 ? 's' : ''} recusada${recusasAbertas.length > 1 ? 's' : ''} desde a última aprovada`}</b>
              <p>{status === 2 ? 'A Meta desativou a conta. Abra a conta na Meta para ver o motivo e pedir revisão.'
                : `O cartão ${c.conta.cartao ? `(${c.conta.cartao}) ` : ''}não passou${ultimaRecusa ? ` (última tentativa: ${quandoCurto(ultimaRecusa.em).toLowerCase()})` : ''}. ${DE_PAGAMENTO.has(status) ? '' : 'A Meta tenta de novo sozinha; se continuar recusando, a conta entra em carência e os anúncios param.'}`}</p>
              {status !== 2 && <ol>
                <li>Confira se o cartão tem limite livre (a Meta cobra várias vezes por dia em valores pequenos).</li>
                <li>Na Meta, pague o saldo de {dinheiro(c.conta.naoCobrado, moeda)} ou troque a forma de pagamento.</li>
                <li>Volte aqui e toque em Ler de novo para ver a situação atualizada.</li>
              </ol>}
            </div>
            <a href={link} target="_blank" rel="noreferrer">Pagar na Meta <span aria-hidden="true">↗</span></a>
          </div>
        )}

        <div className="fn-grade">
          <Situacao status={status} />
          <div className="fn-cartao fn-destaque">
            <small>{c.conta.prePago ? 'Saldo pré-pago' : 'A cobrar agora'}</small>
            <b className="fn-valor">{dinheiro(c.conta.naoCobrado, moeda)}</b>
            <p>{c.conta.prePago ? 'O que ainda resta de crédito na conta.' : 'Gasto que já rodou e a Meta ainda vai cobrar no cartão.'}</p>
          </div>
          <div className="fn-cartao">
            <small>Forma de pagamento</small>
            <div className="fn-cartao-credito" aria-hidden={!c.conta.cartao}>
              <i className="fn-chip" />
              <b>{c.conta.cartao ?? 'A Meta não mostrou'}</b>
            </div>
            <p>{c.conta.cartao ? 'Trocar o cartão é só na Meta.' : 'A chave não tem permissão para ver o cartão.'}</p>
          </div>
          <div className="fn-cartao">
            <small>Limite de gastos da conta</small>
            <b className="fn-valor menor">{limite > 0 ? dinheiro(limite, moeda) : 'Sem limite'}</b>
            {limite > 0 && <div className="fn-limite" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(usoDoLimite)}><i style={{ width: `${usoDoLimite}%` }} className={usoDoLimite > 85 ? 'quase' : ''} /></div>}
            <p>Já gasto desde que a conta abriu: <b>{dinheiro(c.conta.gastoTotal, moeda)}</b>{limite > 0 ? ` (${Math.round(usoDoLimite)}%)` : ''}</p>
          </div>
        </div>

        <div className="fn-30">
          <header>
            <h4>Últimos 30 dias</h4>
            {c.historico && <ul className="fn-numeros">
              <li><small>Cobrado</small><b>{dinheiro(totalCobrado, moeda)}</b><span>{cobradas.length} cobrança{cobradas.length === 1 ? '' : 's'}</span></li>
              <li className={recusadas.length ? 'ruim' : ''}><small>Recusadas</small><b>{recusadas.length}</b><span>{ultimaRecusa ? `última: ${quandoCurto(ultimaRecusa.em).toLowerCase()}` : 'nenhuma'}</span></li>
              <li><small>Última aprovada</small><b>{ultimaOk ? dinheiro(ultimaOk.valor ?? 0, moeda) : '—'}</b><span>{ultimaOk ? quandoCurto(ultimaOk.em).toLowerCase() : 'nenhuma no período'}</span></li>
              {gastoDoPeriodo != null && <li><small>Valor gasto no período</small><b>{dinheiro(gastoDoPeriodo, moeda)}</b><span>{periodo} · como no Gerenciador</span></li>}
            </ul>}
          </header>
          {!c.historico ? <p className="fn-aviso">A Meta não liberou o histórico para esta chave. A situação, o saldo e o cartão acima continuam valendo.</p> : <Barras eventos={eventos} moeda={moeda} />}
        </div>

        {c.historico && (
          <div className="fn-historico">
            <h4>Histórico de pagamentos</h4>
            {!grupos.length && <p className="fn-vazio">Nenhuma cobrança nos últimos 30 dias.</p>}
            {grupos.map(([dia, lista]) => (
              <div key={dia} className="fn-dia">
                <h5>{nomeDoDia(dia)}<small>{lista.filter((e) => e.tipo === 'cobrada').length ? dinheiro(lista.filter((e) => e.tipo === 'cobrada').reduce((s, e) => s + (e.valor ?? 0), 0), moeda) : ''}</small></h5>
                <ol>
                  {lista.map((e, i) => {
                    const tom = e.tipo === 'cobrada' ? 'ok' : e.tipo === 'estorno' ? 'neutro' : e.tipo === 'situacao' ? (e.para === 1 ? 'ok' : 'erro') : 'erro'
                    return (
                      <li key={`${e.em}${i}`} className={`fn-ev ${tom} ${e.tipo}`}>
                        <i aria-hidden="true" />
                        <time>{hora(data(e.em))}</time>
                        <span>{e.tipo === 'situacao' ? (e.para === 1 ? 'Conta voltou a ficar ativa' : `Conta passou para ${nomeDaSituacao(e.para ?? 0).toLowerCase()}`) : ROTULO[e.tipo]}</span>
                        <b>{e.valor != null ? dinheiro(e.valor, moeda) : ''}</b>
                      </li>
                    )
                  })}
                </ol>
              </div>
            ))}
          </div>
        )}
        <p className="fn-nota">Lido na Meta às {hora(new Date(c.em))}. Pagar, trocar o cartão e mudar o limite continuam só na Cobrança da Meta. A Meta não entrega pela API a fatura nem a data da próxima cobrança.</p>
      </>)}
    </section>
  )
}

/** A linha do financeiro embaixo do nome da conta, no topo: o que falta cobrar, o cartão e um atalho para a aba. */
export function ResumoFinanceiro({ cobranca, abrir }: { cobranca: ReturnType<typeof useCobranca>; abrir: () => void }) {
  const c = cobranca.estado && 'c' in cobranca.estado ? cobranca.estado.c : null
  if (!c) return null
  const iOk = c.eventos.findIndex((e) => e.tipo === 'cobrada')
  const recusas = c.eventos.slice(0, iOk < 0 ? undefined : iOk).filter((e) => e.tipo === 'recusada').length
  const bo = DE_PAGAMENTO.has(c.conta.status) || c.conta.status === 2 || recusas > 0
  return (
    <button type="button" className={`fn-mini ${bo ? 'bo' : ''}`} onClick={abrir} title="Abrir o financeiro da conta">
      <span>{c.conta.prePago ? 'Saldo' : 'A cobrar'} <b>{dinheiro(c.conta.naoCobrado, c.conta.moeda)}</b></span>
      {c.conta.cartao && <span className="fn-mini-cartao">{c.conta.cartao}</span>}
      {recusas > 0 && <span className="fn-mini-recusa">{recusas} recusada{recusas > 1 ? 's' : ''}</span>}
      <span className="fn-mini-ir">Financeiro <span aria-hidden="true">→</span></span>
    </button>
  )
}
