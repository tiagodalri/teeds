import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiAnuncios, Cobranca, EventoDeCobranca } from '../../core/teeds/anuncios'
import type { SessaoTeeds } from '../../core/teeds/conta'
import './cobranca.css'

/**
 * 08/11/2026, Tiago: "a api da meta permite puxar os históricos de pagamento? saldo pendente pra pagar etc" → "Sim, põe".
 * Nasceu da GF Victor em carência (cartão sem limite, 3 cobranças recusadas): o selo só dizia "Conta com restrição".
 * O selo da conta vira um botão que abre a cobrança (situação, o que falta cobrar, cartão, últimas cobranças e o
 * link para pagar na Meta). Com pagamento pendente, uma faixa vermelha aparece embaixo do topo.
 */

const NOME_DA_SITUACAO: Record<number, string> = {
  1: 'Conta ativa', 2: 'Conta desativada', 3: 'Pagamento em atraso', 7: 'Conta em análise', 8: 'Acerto pendente',
  9: 'Pagamento pendente', 100: 'Conta fechando', 101: 'Conta fechada',
}
export const nomeDaSituacao = (s: number) => NOME_DA_SITUACAO[s] ?? 'Conta com restrição'
/** situações em que a Meta para (ou vai parar) os anúncios por pagamento */
export const DE_PAGAMENTO = new Set([3, 8, 9])

export const dinheiro = (v: number, moeda = 'BRL') => v.toLocaleString('pt-BR', { style: 'currency', currency: moeda })
// a Meta manda "2026-11-08T21:41:12-0300"; o Safari só entende o fuso com dois-pontos
export const quando = (iso: string) => {
  const d = new Date(iso.replace(/([+-]\d{2})(\d{2})$/, '$1:$2'))
  if (Number.isNaN(d.getTime())) return iso
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) === hoje ? `Hoje, ${hora}` : `${dia}, ${hora}`
}

function Evento({ e, moeda }: { e: EventoDeCobranca; moeda: string }) {
  if (e.tipo === 'situacao') {
    const bom = e.para === 1
    return <li className={`cb-ev ${bom ? 'ok' : 'erro'}`}><span>{quando(e.em)}</span><b>{bom ? 'Conta voltou a ficar ativa' : `Conta passou para: ${nomeDaSituacao(e.para ?? 0)}`}</b><i /></li>
  }
  const rotulo = { cobrada: 'Cobrada', recusada: 'Recusada', estorno: 'Estorno', contestada: 'Contestada' }[e.tipo]
  return (
    <li className={`cb-ev ${e.tipo === 'cobrada' ? 'ok' : e.tipo === 'estorno' ? '' : 'erro'}`}>
      <span>{quando(e.em)}</span><b>{e.valor != null ? dinheiro(e.valor, moeda) : '—'}</b><i>{rotulo}</i>
    </li>
  )
}

export type Estado = { c: Cobranca } | { aviso: string } | null

/**
 * Lê a cobrança uma vez por parceiro e de novo a cada `recarregar` (o botão Atualizar da tela).
 * 09/11/2026: a tela lê uma vez só e reparte entre o selo, o resumo do topo e a aba Financeiro.
 */
export function useCobranca(sessao: SessaoTeeds, parceiro: string, api: ApiAnuncios, recarregar: unknown) {
  const [estado, setEstado] = useState<Estado>(null)
  const [indo, setIndo] = useState(false)
  const ler = useCallback(() => {
    if (!api.cobranca) return () => {}
    let vivo = true
    setIndo(true)
    api.cobranca(sessao, parceiro).then((r) => {
      if (!vivo) return
      if ('conta' in r) setEstado({ c: r })
      else setEstado({ aviso: 'chaveInvalida' in r ? r.erro : 'semChave' in r ? 'Sem a chave da conta, a cobrança não aparece.' : 'Escolha a conta de anúncios primeiro.' })
    }).catch((e) => vivo && setEstado({ aviso: (e as Error).message })).finally(() => vivo && setIndo(false))
    return () => { vivo = false }
  }, [api, sessao, parceiro])
  useEffect(() => { setEstado(null); return ler() }, [ler, recarregar])
  return { estado, indo, ler }
}

/**
 * O selo da conta (botão) + a janelinha da cobrança + a faixa de pagamento pendente.
 * `statusDoPainel` vale enquanto a cobrança não chega (é o mesmo account_status).
 */
export function CobrancaDaConta({ cobranca, statusDoPainel, nomeParceiro, abrirFinanceiro }: {
  cobranca: ReturnType<typeof useCobranca>; statusDoPainel: number; nomeParceiro: string
  /** 09/11/2026 (Tiago: "não vi a parte do financeiro"): a janelinha leva para a aba Financeiro */
  abrirFinanceiro?: () => void
}) {
  const { estado, indo, ler } = cobranca
  const [aberta, setAberta] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)
  const c = estado && 'c' in estado ? estado.c : null
  const status = c?.conta.status || statusDoPainel
  const moeda = c?.conta.moeda ?? 'BRL'
  const pendente = DE_PAGAMENTO.has(status)
  // recusadas depois da última cobrança que passou (as de antes já foram resolvidas)
  const ultimaPaga = (c?.eventos ?? []).findIndex((e) => e.tipo === 'cobrada')
  const recusadasHoje = (c?.eventos ?? []).slice(0, ultimaPaga < 0 ? undefined : ultimaPaga).filter((e) => e.tipo === 'recusada' && quando(e.em).startsWith('Hoje')).length

  // fecha ao clicar fora ou no Esc
  useEffect(() => {
    if (!aberta) return
    const fora = (ev: MouseEvent) => { if (caixa.current && !caixa.current.contains(ev.target as Node)) setAberta(false) }
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAberta(false) }
    document.addEventListener('mousedown', fora); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberta])

  const cobrancas = (c?.eventos ?? []).slice(0, 8)
  return (
    <div className="cb" ref={caixa}>
      <button type="button" className={`aa-status cb-selo ${status === 1 ? 'ok' : 'erro'}`} aria-expanded={aberta} onClick={() => setAberta((x) => !x)}
        title="Ver a cobrança da conta">
        {nomeDaSituacao(status)}{status === 1 && recusadasHoje > 0 ? ` · ${recusadasHoje} recusada${recusadasHoje > 1 ? 's' : ''} hoje` : ''}
        <span aria-hidden="true" className="cb-seta">▾</span>
      </button>

      {aberta && (
        <div className="cb-janela" role="dialog" aria-label="Cobrança da conta">
          <header><b>Cobrança</b><small>Conta de anúncios do {nomeParceiro}</small>
            <button type="button" className="cb-fechar" aria-label="Fechar" onClick={() => setAberta(false)}>×</button></header>
          {!estado && <p className="cb-carregando">Lendo a cobrança na Meta…</p>}
          {estado && 'aviso' in estado && <p className="cb-aviso">{estado.aviso}</p>}
          {c && (<>
            <dl className="cb-linhas">
              <div><dt>Situação</dt><dd className={status === 1 ? 'ok' : 'erro'}>{nomeDaSituacao(status)}</dd></div>
              <div><dt>{c.conta.prePago ? 'Saldo pré-pago' : 'Gasto ainda não cobrado'}</dt><dd>{dinheiro(c.conta.naoCobrado, moeda)}</dd></div>
              <div><dt>Forma de pagamento</dt><dd>{c.conta.cartao ?? 'A Meta não mostrou'}</dd></div>
              {c.conta.limite > 0 && <div><dt>Limite de gastos da conta</dt><dd>{dinheiro(c.conta.limite, moeda)}</dd></div>}
            </dl>
            <h4>Últimos 30 dias</h4>
            {!c.historico && <p className="cb-aviso">A Meta não liberou o histórico para esta chave. A situação e o saldo acima continuam valendo.</p>}
            {c.historico && !cobrancas.length && <p className="cb-vazio">Nenhuma cobrança nos últimos 30 dias.</p>}
            {cobrancas.length > 0 && <ul className="cb-lista">{cobrancas.map((e, i) => <Evento key={`${e.em}${i}`} e={e} moeda={moeda} />)}</ul>}
          </>)}
          {abrirFinanceiro && <button type="button" className="cb-tudo" onClick={() => { setAberta(false); abrirFinanceiro() }}>Ver o financeiro completo <span aria-hidden="true">→</span></button>}
          <footer>
            <button type="button" className="cb-reler" onClick={() => ler()} disabled={indo}>{indo ? 'Lendo…' : 'Ler de novo'}</button>
            <a className="cb-pagar" href={c?.link ?? 'https://business.facebook.com/billing_hub/accounts'} target="_blank" rel="noreferrer">
              {pendente ? 'Pagar na Meta' : 'Abrir a cobrança na Meta'} <span aria-hidden="true">↗</span></a>
          </footer>
        </div>
      )}
    </div>
  )
}

/** A faixa vermelha embaixo do topo enquanto a Meta espera pagamento (carência, atraso, acerto). */
export function AvisoDePagamento({ status, link, nomeParceiro }: { status: number; link: string; nomeParceiro: string }) {
  if (!DE_PAGAMENTO.has(status) && status !== 2) return null
  const texto = status === 9
    ? `A Meta não conseguiu cobrar o cartão da conta do ${nomeParceiro}. Os anúncios ainda rodam, mas param se o pagamento não for feito.`
    : status === 2 ? `A conta de anúncios do ${nomeParceiro} foi desativada pela Meta. Os anúncios estão parados.`
      : `A conta de anúncios do ${nomeParceiro} tem pagamento em aberto. Os anúncios estão parados até pagar.`
  return (
    <div className="cb-faixa" role="alert">
      <b>{nomeDaSituacao(status)}</b><span>{texto}</span>
      <a href={link} target="_blank" rel="noreferrer">{status === 2 ? 'Ver na Meta' : 'Pagar na Meta'} <span aria-hidden="true">↗</span></a>
    </div>
  )
}
