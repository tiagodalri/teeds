import { useEffect, useMemo, useState } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import {
  coletasDeExtrato, movimentacoesDiarias, movimentacoesRecentes,
  type ColetaExtrato, type DiaMovimentacao, type MovimentacaoRegistro,
} from '../core/teeds/clientes'
import { MARCA } from '../marca'

/**
 * Depósitos e saques — quanto entrou e quanto saiu das contas reais dos
 * clientes na Deriv.
 *
 * O servidor lê o extrato de cada cliente que conectou a Deriv e guarda só
 * as linhas de depósito e saque (`movimentacoes_deriv`). Esta tela soma por
 * dia no banco e mostra; o navegador nunca fala com a Deriv por aqui.
 *
 * O dia é contado em UTC, igual aos outros relatórios — senão o mesmo
 * depósito cairia num dia aqui e noutro na conferência de comissão.
 */

const usd = (v: number, sinal = false) =>
  `${sinal && v > 0 ? '+' : ''}US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inteiro = (v: number) => v.toLocaleString('pt-BR')
const diaBr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
const horaBr = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
const classe = (v: number) => v > 0 ? 'positivo' : v < 0 ? 'negativo' : ''
const hojeUtc = () => new Date().toISOString().slice(0, 10)

/** "há 12 min", "há 3 h", "há 2 d" — o bastante para saber se a coleta está viva. */
function haQuanto(iso: string | null): string {
  if (!iso) return 'nunca'
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000))
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  if (min < 48 * 60) return `há ${Math.round(min / 60)} h`
  return `há ${Math.round(min / 1440)} d`
}

const PERIODOS = [7, 30, 90] as const
const MAX_LINHAS = 400

export function Movimentacoes({ sessao }: { sessao: SessaoTeeds }) {
  const [dias, setDias] = useState<number>(30)
  const [porDia, setPorDia] = useState<DiaMovimentacao[]>([])
  const [recentes, setRecentes] = useState<MovimentacaoRegistro[]>([])
  const [coletas, setColetas] = useState<ColetaExtrato[]>([])
  const [carregando, setCarregando] = useState(false)

  useEffect(() => {
    let vivo = true
    setCarregando(true)
    Promise.all([movimentacoesDiarias(sessao, dias), movimentacoesRecentes(sessao, dias), coletasDeExtrato(sessao)])
      .then(([d, r, c]) => { if (vivo) { setPorDia(d); setRecentes(r); setColetas(c) } })
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [sessao.token, dias])

  const hoje = useMemo(() => porDia.find((d) => d.dia === hojeUtc()) ?? null, [porDia])
  const totais = useMemo(() => ({
    depositos: porDia.reduce((s, d) => s + d.depositos, 0),
    saques: porDia.reduce((s, d) => s + d.saques, 0),
    qtdDepositos: porDia.reduce((s, d) => s + d.qtdDepositos, 0),
    qtdSaques: porDia.reduce((s, d) => s + d.qtdSaques, 0),
  }), [porDia])
  const liquidoHoje = (hoje?.depositos ?? 0) - (hoje?.saques ?? 0)
  const liquidoPeriodo = totais.depositos - totais.saques

  const saude = useMemo(() => {
    const comErro = coletas.filter((c) => c.ultimoErro)
    const ultima = coletas.reduce<string | null>((m, c) => (!m || c.ultimaTentativaEm > m) ? c.ultimaTentativaEm : m, null)
    return { contas: coletas.length, comErro: comErro.length, ultima }
  }, [coletas])

  const visiveis = recentes.slice(0, MAX_LINHAS)

  return <>
    <div className="rc-filtros">
      <div className="rc-periodo">{PERIODOS.map((p) => <button key={p} className={dias === p ? 'on' : ''} onClick={() => setDias(p)}>{p} dias</button>)}</div>
      <span className="rc-carregando">{carregando ? 'atualizando…' : saude.contas
        ? `coleta: ${saude.contas} conta${saude.contas === 1 ? '' : 's'} · última ${haQuanto(saude.ultima)}${saude.comErro ? ` · ${saude.comErro} com erro` : ''}`
        : 'a coleta ainda não rodou'}</span>
    </div>

    <div className="adm-kpis">
      <article className="ok"><span>Depositado hoje (UTC)</span><strong>{usd(hoje?.depositos ?? 0)}</strong><small>{hoje?.qtdDepositos ?? 0} {hoje?.qtdDepositos === 1 ? 'depósito' : 'depósitos'}</small></article>
      <article className="perigo"><span>Sacado hoje (UTC)</span><strong>{usd(hoje?.saques ?? 0)}</strong><small>{hoje?.qtdSaques ?? 0} {hoje?.qtdSaques === 1 ? 'saque' : 'saques'}</small></article>
      <article className={liquidoHoje >= 0 ? 'ok' : 'perigo'}><span>Líquido hoje</span><strong>{usd(liquidoHoje, true)}</strong><small>{hoje?.clientes ?? 0} {hoje?.clientes === 1 ? 'cliente movimentou' : 'clientes movimentaram'}</small></article>
      <article className="alerta"><span>Líquido · {dias} dias</span><strong>{usd(liquidoPeriodo, true)}</strong><small>{usd(totais.depositos)} entrou · {usd(totais.saques)} saiu</small></article>
    </div>

    <section className="admin-card full">
      <header><div><span className="rot">Por dia · {dias} dias · só conta real</span><h3>Quanto entrou e quanto saiu</h3></div><small>{totais.qtdDepositos} {totais.qtdDepositos === 1 ? 'depósito' : 'depósitos'} · {totais.qtdSaques} {totais.qtdSaques === 1 ? 'saque' : 'saques'}</small></header>
      {porDia.length > 0 && <div className="rc-tabela mov">
        <div className="cab"><span>Dia</span><span>Depósitos</span><span>Qtd</span><span>Saques</span><span>Qtd</span><span>Líquido</span><span>Clientes</span></div>
        {porDia.map((d) => (
          <div key={d.dia}>
            <span>{diaBr(d.dia)}{d.dia === hojeUtc() && <small>hoje</small>}</span>
            <span className="positivo">{usd(d.depositos)}</span>
            <span>{inteiro(d.qtdDepositos)}</span>
            <span className="negativo">{usd(d.saques)}</span>
            <span>{inteiro(d.qtdSaques)}</span>
            <strong className={classe(d.depositos - d.saques)}>{usd(d.depositos - d.saques, true)}</strong>
            <span>{d.clientes}</span>
          </div>
        ))}
      </div>}
      {!carregando && porDia.length === 0 && <div className="adm-vazio">
        {saude.contas
          ? 'Nenhum depósito nem saque em conta real nesse período.'
          : `Nada ainda. O servidor lê o extrato de cada cliente que conectou a Deriv na ${MARCA.prosa}; a primeira passada acontece pouco depois de ele subir.`}
      </div>}
    </section>

    <section className="admin-card full">
      <header><div><span className="rot">Uma a uma · {dias} dias</span><h3>Quem depositou, quem sacou</h3></div><small>{recentes.length >= 500 ? 'as 500 mais recentes' : `${recentes.length} ${recentes.length === 1 ? 'movimentação' : 'movimentações'}`}</small></header>
      {visiveis.length > 0 && <div className="rc-tabela movs">
        <div className="cab"><span>Quando (UTC)</span><span>Cliente</span><span>Conta</span><span>Tipo</span><span>Valor</span><span>Saldo depois</span><span>Descrição</span></div>
        {visiveis.map((m) => (
          <div key={`${m.contaId}-${m.transacaoId}`}>
            <span>{horaBr(m.ocorridaEm)}</span>
            <span className="adm-pessoa"><i>{(m.nome || m.email || '?')[0].toUpperCase()}</i><b>{m.nome || 'Sem nome'}<small>{m.email}</small></b></span>
            <span>{m.contaId}<small>{m.moeda}</small></span>
            <span className={m.tipo === 'deposit' ? 'positivo' : 'negativo'}>{m.tipo === 'deposit' ? 'Depósito' : 'Saque'}</span>
            <span className={m.tipo === 'deposit' ? 'positivo' : 'negativo'}>{m.tipo === 'deposit' ? '+' : '-'}{usd(m.valor)}</span>
            <span>{m.saldoDepois === null ? <small>—</small> : usd(m.saldoDepois)}</span>
            <span><small title={m.descricao ?? ''}>{m.descricao ?? '—'}</small></span>
          </div>
        ))}
        {recentes.length > MAX_LINHAS && <div className="adm-vazio">Mostrando as {MAX_LINHAS} mais recentes de {inteiro(recentes.length)}.</div>}
      </div>}
      {!carregando && visiveis.length === 0 && <div className="adm-vazio">Nenhuma movimentação nesse período.</div>}
    </section>

    {coletas.length > 0 && <section className="admin-card full">
      <header><div><span className="rot">A coleta</span><h3>Conta a conta, quando o servidor leu o extrato</h3></div><small>{saude.comErro ? `${saude.comErro} com erro na última tentativa` : 'todas leram na última tentativa'}</small></header>
      <div className="rc-coletas">
        {coletas.map((c) => (
          <div key={c.contaId}>
            <b>{c.contaId}</b>
            <span>{c.nome || c.email || <small>cliente sem ficha</small>}</span>
            <span className={c.ultimoErro ? 'erro' : 'ok'}>{c.ultimoErro ? `erro ${haQuanto(c.ultimaTentativaEm)}` : `ok ${haQuanto(c.ultimoSucessoEm)}`}</span>
            <small>{c.movimentacoes} {c.movimentacoes === 1 ? 'movimentação guardada' : 'movimentações guardadas'}{c.ultimaMovimentacaoEm ? ` · última ${haQuanto(c.ultimaMovimentacaoEm)}` : ''}</small>
            {c.ultimoErro && <small className="erro" title={c.ultimoErro}>{c.ultimoErro.slice(0, 120)}</small>}
          </div>
        ))}
      </div>
    </section>}
  </>
}
