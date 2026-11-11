import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import { buscarCotacoes, cotacoesGuardadas } from '../ferramentas/cambio'
import './compartilhamento.css'
import { SeloDoParceiro } from '../parceiros/SeloDoParceiro'

/**
 * Compartilhamento de receita (11/11/2026, Tiago: "quem é do plano Gold tem que pagar 10% do que lucrou
 * no mês, Black 5%, Prestige nada... converter para reais com a cotação do dia e gerar uma fatura").
 *
 * Regras (decididas por ele no mesmo dia):
 *  - lucro do mês = soma do resultado das operações em conta REAL feitas pela plataforma (I.A. + manual),
 *    mês de Brasília; cada mês zera (prejuízo não abate no seguinte);
 *  - % pelo subplano (tabela subplanos: Gold 10%, Black 5%, Prestige 0% = isento);
 *  - a fatura vence todo dia 01 do mês seguinte; a cotação do dólar é a do momento em que a equipe gera;
 *  - só o admin geral gera, dá baixa e cancela; o admin do parceiro vê só os clientes dele;
 *  - por enquanto só a equipe vê as faturas (o cliente ainda não). Pix automático depende da conta do gateway.
 *
 * Banco: teeds_compartilhamento (painel), teeds_gerar_faturas_compartilhamento, teeds_fatura_compartilhamento_acao
 * (migração 20261111200000). Laboratório: ?tela=compartilhamento.
 */

export interface Fatura {
  id: string; numero: number; mes: string; situacao: 'aberta' | 'paga' | 'cancelada'; subplano: string; percentual: number
  operacoes: number; lucro_usd: number; valor_usd: number; cotacao: number; cotacao_fonte: string | null; cotacao_em: string | null
  valor_brl: number; vencimento: string; paga_em: string | null; baixa_forma: string | null; cancelada_em: string | null; motivo: string | null
  gateway: string | null; pix_copia_cola: string | null; pix_qr: string | null; link_pagamento: string | null; visivel_cliente: boolean
  gerada_em: string; historico: Array<{ acao: string; em: string; motivo?: string | null }>; nome: string | null; email: string | null
  user_id: string; parceiro: string | null
}
interface Linha {
  user_id: string; nome: string | null; email: string | null; telefone: string | null; foto_url: string | null
  parceiro: string | null; parceiro_nome: string | null; subplano: string; percentual: number
  operacoes: number; ganhas: number; manuais: number; volume: number; resultado: number; valor_usd: number
  fatura: Fatura | null; canceladas: number
  /** a última fatura cancelada do mês (quando não há uma viva) */
  cancelada: Fatura | null
  /** tem fatura viva no mês mas saiu da base de hoje (virou equipe ou trocou de parceiro) */
  fora_da_base?: boolean
}
interface Painel {
  agora: string; hoje: string; mes: string; mes_atual: string; fechado: boolean; vencimento: string
  parceiro: string | null; geral: boolean; percentuais: Record<string, number>; clientes: Linha[]
  carteira: { abertas: number; a_receber_brl: number; vencidas: number; vencidas_brl: number; pagas: number; recebido_brl: number }
  meses: Array<{ mes: string; faturas: number; valor_brl: number; abertas: number; pagas: number; recebido_brl: number }>
}
type Situacao = 'prejuizo' | 'isento' | 'previa' | 'abaixo' | 'a-gerar' | 'aberta' | 'vencida' | 'paga' | 'cancelada'
const ROTULO: Record<Situacao, string> = {
  prejuizo: 'Sem lucro', isento: 'Isento', previa: 'Prévia', abaixo: 'Abaixo do mínimo', 'a-gerar': 'A gerar',
  aberta: 'Em aberto', vencida: 'Vencida', paga: 'Paga', cancelada: 'Cancelada',
}

/** Primeiro mês com operação real na GlobalFly. */
const MES_INICIAL = '2026-10-01'
const CHAVE_MINIMO = 'gf.compartilhamento.minimo'

async function rpc<T>(sessao: SessaoTeeds, nome: string, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) {
    let msg = ''
    try { msg = ((await r.json()) as { message?: string }).message ?? '' } catch { /* sem corpo */ }
    throw new Error(msg || 'Não foi possível falar com o banco agora.')
  }
  return await r.json() as T
}

const reais = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dolares = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const comSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dolares(Math.abs(v))}`
const pct = (p: number) => `${(p * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
const inteiro = (n: number) => n.toLocaleString('pt-BR')
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const dataCurta = (dia: string) => new Date(`${dia.slice(0, 10)}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
const nomeDoMes = (mes: string) => { const t = new Date(`${mes.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }); return t[0].toUpperCase() + t.slice(1) }
const mesCurto = (mes: string) => { const t = new Date(`${mes.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' }); return t[0].toUpperCase() + t.slice(1) }
const mesQueVem = (mes: string) => { const [a, m] = mes.split('-').map(Number); return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01` }
const mesDeHoje = () => `${new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7)}-01`
const NOME_PLANO: Record<string, string> = { gold: 'Gold', black: 'Black', prestige: 'Prestige', silver: 'Silver' }
const nomePlano = (s: string) => NOME_PLANO[s] ?? (s ? s[0].toUpperCase() + s.slice(1) : '—')
const planoDa = (l: Linha) => l.fatura?.subplano ?? l.subplano
const numeroFatura = (n: number) => String(n).padStart(6, '0')
const seloParceiro = (l: { parceiro: string | null; parceiro_nome: string | null }) => l.parceiro ? `${(l.parceiro_nome ?? l.parceiro).split(' ')[0]} /${l.parceiro}` : 'Direto'
const lerNumero = (t: string) => { const v = Number(t.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN }

function situacaoDa(l: Linha, p: Painel, cotacao: number, minimo: number): Situacao {
  if (l.fatura) return l.fatura.situacao === 'paga' ? 'paga' : l.fatura.situacao === 'cancelada' ? 'cancelada' : l.fatura.vencimento < p.hoje ? 'vencida' : 'aberta'
  // cancelada no mês: a geração em massa não refaz; só pelo botão "Gerar de novo" da fatura
  if (l.cancelada) return 'cancelada'
  if (l.resultado <= 0) return 'prejuizo'
  if (l.percentual <= 0) return 'isento'
  if (Math.round(l.valor_usd * cotacao * 100) / 100 < Math.max(minimo, 0.01)) return 'abaixo'
  if (!p.fechado) return 'previa'
  return 'a-gerar'
}

export function CompartilhamentoDeReceita({ sessao, marca, parceiro, pedido = 0, onAbrirCliente }: {
  sessao: SessaoTeeds; marca: string; parceiro: string | null
  /** Sobe quando o Atualizar do topo do Admin é clicado: relê na hora. */
  pedido?: number
  onAbrirCliente?: (userId: string) => void
}) {
  const [mes, setMes] = useState(mesDeHoje)
  const [painel, setPainel] = useState<Painel | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [dolar, setDolar] = useState<{ valor: number; quando: number; fonte: string } | null>(() => {
    const c = cotacoesGuardadas(); return c ? { valor: c.emReais.USD, quando: c.quando, fonte: c.fonte } : null
  })
  const [minimo, setMinimo] = useState(() => { try { const v = Number(localStorage.getItem(CHAVE_MINIMO)); return Number.isFinite(v) && v >= 0 && localStorage.getItem(CHAVE_MINIMO) !== null ? v : 5 } catch { return 5 } })
  const [minimoTexto, setMinimoTexto] = useState(() => minimo.toFixed(2).replace('.', ','))
  const [busca, setBusca] = useState('')
  const [fPlano, setFPlano] = useState<'todos' | 'gold' | 'black' | 'prestige'>('todos')
  const [fSituacao, setFSituacao] = useState<'todas' | 'lucro' | Situacao>('todas')
  const [ordem, setOrdem] = useState<'resultado' | 'valor' | 'nome'>('resultado')
  /** gerar: a lista exata de clientes que a tela mostrou; refazer = fatura cancelada gerada de novo */
  const [gerando, setGerando] = useState<{ usuarios: string[]; usd: number; abaixo: number; refazer: boolean } | null>(null)
  const [aberta, setAberta] = useState<Linha | null>(null)

  const pedidoAtual = useRef(0)
  const ler = useCallback(async () => {
    const meu = ++pedidoAtual.current
    setCarregando(true)
    try {
      const r = await rpc<Painel>(sessao, 'teeds_compartilhamento', { p_marca: marca, p_mes: mes, p_parceiro: parceiro || null })
      if (meu === pedidoAtual.current && r.mes.slice(0, 7) === mes.slice(0, 7)) { setPainel(r); setErro(null) }
    }
    catch (e) { if (meu === pedidoAtual.current) setErro((e as Error).message) }
    finally { if (meu === pedidoAtual.current) setCarregando(false) }
  }, [sessao.token, marca, mes, parceiro]) // eslint-disable-line react-hooks/exhaustive-deps
  const lerDolar = useCallback(async () => {
    try { const c = await buscarCotacoes(); setDolar({ valor: c.emReais.USD, quando: c.quando, fonte: c.fonte }) } catch { /* fica a última */ }
  }, [])
  useEffect(() => {
    setPainel((p) => p && p.mes.slice(0, 7) === mes.slice(0, 7) ? p : null)
    void ler()
    // o mês em andamento muda a cada operação: relê a cada minuto com a aba à vista
    const t = mes === mesDeHoje() ? window.setInterval(() => { if (!document.hidden) void ler() }, 60_000) : 0
    return () => window.clearInterval(t)
  }, [ler, mes])
  useEffect(() => { void lerDolar(); const t = window.setInterval(() => { if (!document.hidden) void lerDolar() }, 5 * 60_000); return () => window.clearInterval(t) }, [lerDolar])
  useEffect(() => { if (pedido) { void ler(); void lerDolar() } }, [pedido]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { try { localStorage.setItem(CHAVE_MINIMO, String(minimo)) } catch { /* opcional */ } }, [minimo])

  const meses = useMemo(() => {
    const l: string[] = []
    for (let m = mesDeHoje(); m >= MES_INICIAL && l.length < 36; ) { l.push(m); const [a, n] = m.split('-').map(Number); m = n === 1 ? `${a - 1}-12-01` : `${a}-${String(n - 1).padStart(2, '0')}-01` }
    for (const x of painel?.meses ?? []) if (!l.includes(x.mes)) l.push(x.mes)
    return l.sort().reverse()
  }, [painel])
  const cotacao = dolar?.valor ?? 0
  const linhas = painel?.clientes ?? []
  const sit = useCallback((l: Linha) => painel ? situacaoDa(l, painel, cotacao, minimo) : 'previa', [painel, cotacao, minimo])
  /** Em reais: a fatura já gerada vale o que foi gravado; o resto, a cotação de agora. */
  const emReais = (l: Linha) => l.fatura ? l.fatura.valor_brl : Math.round(l.valor_usd * cotacao * 100) / 100

  const numeros = useMemo(() => {
    const lucro = linhas.filter((l) => l.resultado > 0), perda = linhas.filter((l) => l.resultado < 0)
    const soma = (l: Linha[], f: (x: Linha) => number) => l.reduce((s, x) => s + f(x), 0)
    const por = (s: string) => { const l = lucro.filter((x) => planoDa(x) === s); return { n: l.length, total: linhas.filter((x) => planoDa(x) === s).length, lucro: soma(l, (x) => x.resultado), usd: soma(l, (x) => x.valor_usd) } }
    const cobraveis = lucro.filter((l) => (l.fatura?.percentual ?? l.percentual) > 0 && !(!l.fatura && l.cancelada))
    const geradas = linhas.filter((l) => l.fatura)
    const aGerar = painel?.fechado ? linhas.filter((l) => sit(l) === 'a-gerar') : []
    const abaixo = cobraveis.filter((l) => !l.fatura && emReais(l) < Math.max(minimo, 0.01))
    // o que vai ser cobrado de fato: fatura já gerada, ou valor acima do mínimo (o mesmo corte da geração)
    const cobrar = cobraveis.filter((l) => l.fatura || emReais(l) >= Math.max(minimo, 0.01))
    return {
      clientes: linhas.length, lucro: lucro.length, perda: perda.length,
      lucroUsd: soma(lucro, (l) => l.resultado), perdaUsd: soma(perda, (l) => l.resultado),
      liquido: soma(linhas, (l) => l.resultado),
      cobrar: cobrar.length,
      usd: soma(cobrar, (l) => l.fatura?.valor_usd ?? l.valor_usd),
      /** o que falta receber: faturas em aberto + as que ainda vão ser geradas (pagas não contam) */
      receber: soma(cobrar, (l) => l.fatura ? (l.fatura.situacao === 'aberta' ? l.fatura.valor_brl : 0) : emReais(l)),
      gold: por('gold'), black: por('black'), prestige: por('prestige'),
      geradas: geradas.length, geradasBrl: soma(geradas, (l) => l.fatura!.valor_brl),
      pagasBrl: soma(geradas.filter((l) => l.fatura!.situacao === 'paga'), (l) => l.fatura!.valor_brl),
      aGerar: aGerar.length, aGerarIds: aGerar.map((l) => l.user_id), aGerarUsd: soma(aGerar, (l) => l.valor_usd), aGerarBrl: soma(aGerar, (l) => emReais(l)),
      abaixo: abaixo.length, abaixoBrl: soma(abaixo, (l) => emReais(l)),
    }
  }, [linhas, painel, cotacao, minimo]) // eslint-disable-line react-hooks/exhaustive-deps

  const lista = useMemo(() => {
    const q = semAcento(busca.trim())
    const l = linhas.filter((x) => (fPlano === 'todos' || planoDa(x) === fPlano)
      && (fSituacao === 'todas' || (fSituacao === 'lucro' ? x.resultado > 0 : sit(x) === fSituacao))
      && (!q || semAcento(`${x.nome ?? ''} ${x.email ?? ''} ${x.fatura ? numeroFatura(x.fatura.numero) : ''}`).includes(q)))
    if (ordem === 'valor') return [...l].sort((a, b) => b.valor_usd - a.valor_usd || b.resultado - a.resultado)
    if (ordem === 'nome') return [...l].sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
    return l
  }, [linhas, busca, fPlano, fSituacao, ordem, sit])

  const filtrando = busca.trim() !== '' || fPlano !== 'todos' || fSituacao !== 'todas'
  const limpar = () => { setBusca(''); setFPlano('todos'); setFSituacao('todas') }
  const quandoFecha = mesQueVem(mes)
  const nomeMes = mesCurto(mes)

  const baixarPlanilha = () => {
    if (!painel) return
    const cab = ['Cliente', 'E-mail', 'Parceiro', 'Plano', 'Percentual', 'Operações', 'Resultado do mês (US$)', 'Compartilhamento (US$)', 'Em reais (R$)', 'Cotação', 'Situação', 'Fatura', 'Vencimento']
    const linhasCsv = lista.map((l) => [l.nome ?? '', l.email ?? '', seloParceiro(l), nomePlano(l.subplano), pct(l.percentual), l.operacoes, l.resultado.toFixed(2).replace('.', ','),
      l.valor_usd.toFixed(2).replace('.', ','), emReais(l).toFixed(2).replace('.', ','), (l.fatura?.cotacao ?? cotacao).toFixed(4).replace('.', ','), ROTULO[sit(l)],
      l.fatura ? numeroFatura(l.fatura.numero) : '', l.fatura ? dataCurta(l.fatura.vencimento) : ''])
    const csv = [cab, ...linhasCsv].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `compartilhamento-${mes.slice(0, 7)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  }

  const aoMudarFatura = (f: Fatura) => {
    const muda = (l: Linha): Linha => f.situacao === 'cancelada'
      ? { ...l, fatura: null, cancelada: f, canceladas: l.canceladas + (l.fatura?.id === f.id ? 1 : 0) }
      : { ...l, fatura: f, cancelada: l.cancelada?.id === f.id ? null : l.cancelada }
    setPainel((p) => p ? { ...p, clientes: p.clientes.map((l) => l.user_id === f.user_id ? muda(l) : l) } : p)
    setAberta((a) => a && a.user_id === f.user_id ? muda(a) : a)
    void ler()
  }

  return <div className="cdr">
    <div className="cdr-topo">
      <div className="cdr-meses" role="tablist" aria-label="Mês">
        {meses.map((m) => <button key={m} role="tab" aria-selected={m === mes} className={m === mes ? 'on' : ''} onClick={() => setMes(m)}>
          {mesCurto(m)}{m.slice(0, 4) !== mesDeHoje().slice(0, 4) ? ` ${m.slice(2, 4)}` : ''}{m === mesDeHoje() && <i>Ao vivo</i>}</button>)}
      </div>
      <span className="cdr-dolar">
        <b>Dólar agora {cotacao ? reais(cotacao) : '—'}</b>
        <small>{dolar ? `Cotação comercial ${dolar.fonte === 'ao vivo' ? 'ao vivo' : 'do dia'} · ${dataHora(new Date(dolar.quando).toISOString())}` : 'Buscando a cotação…'}</small>
        <button type="button" onClick={() => void lerDolar()}>Atualizar</button>
      </span>
    </div>

    {painel && <div className={`cdr-estado ${painel.fechado ? 'fechado' : 'aberto'}`}>
      <i aria-hidden />
      {painel.fechado
        ? <p><b>{nomeDoMes(mes)} fechou.</b> {numeros.geradas ? `${inteiro(numeros.geradas)} ${numeros.geradas === 1 ? 'fatura gerada' : 'faturas geradas'}` : 'Nenhuma fatura gerada ainda'}{numeros.aGerar ? `, ${inteiro(numeros.aGerar)} ${numeros.aGerar === 1 ? 'cliente esperando' : 'clientes esperando'} a fatura` : ''}. Vencimento das faturas: {dataCurta(painel.vencimento)}.</p>
        : <p><b>{nomeDoMes(mes)} está em andamento.</b> Os números abaixo são uma prévia ao vivo, relida a cada minuto. As faturas saem quando o mês fechar, a partir de {dataCurta(quandoFecha)}, e vencem nesse dia.</p>}
      <span className="cdr-oculto">Os clientes ainda não veem as faturas</span>
    </div>}

    <div className="cdr-kpis">
      <article className="cdr-kpi destaque">
        <span>{painel?.fechado ? `A receber · ${nomeMes}` : `Prévia a receber · ${nomeMes}`}</span>
        <strong>{painel ? reais(numeros.receber) : '—'}</strong>
        <small>{painel ? `${dolares(numeros.usd)} de ${inteiro(numeros.cobrar)} ${numeros.cobrar === 1 ? 'cliente' : 'clientes'}${numeros.pagasBrl ? ` · ${reais(numeros.pagasBrl)} já recebido` : ''}${numeros.abaixo ? ` · ${inteiro(numeros.abaixo)} abaixo do mínimo` : ''}` : ''}</small>
      </article>
      <button className={`cdr-kpi ${fSituacao === 'lucro' ? 'on' : ''}`} onClick={() => setFSituacao((f) => f === 'lucro' ? 'todas' : 'lucro')}>
        <span>Clientes no lucro</span><strong className="cdr-pos">{painel ? comSinal(numeros.lucroUsd) : '—'}</strong>
        <small>{inteiro(numeros.lucro)} de {inteiro(numeros.clientes)} que operaram em conta real</small></button>
      <button className={`cdr-kpi ${fSituacao === 'prejuizo' ? 'on' : ''}`} onClick={() => setFSituacao((f) => f === 'prejuizo' ? 'todas' : 'prejuizo')}>
        <span>Clientes no prejuízo</span><strong className="cdr-neg">{painel ? comSinal(numeros.perdaUsd) : '—'}</strong>
        <small>{inteiro(numeros.perda)} {numeros.perda === 1 ? 'cliente' : 'clientes'} · não paga nada e o mês zera</small></button>
      {(['gold', 'black', 'prestige'] as const).map((s) => {
        const n = numeros[s]; const p = painel?.percentuais[s] ?? (s === 'gold' ? 0.1 : s === 'black' ? 0.05 : 0)
        return <button key={s} className={`cdr-kpi cdr-${s} ${fPlano === s ? 'on' : ''}`} onClick={() => setFPlano((f) => f === s ? 'todos' : s)}>
          <span>{nomePlano(s)} · {p > 0 ? `${pct(p)} do lucro` : 'Isento'}</span>
          <strong>{p > 0 ? dolares(n.usd) : `${inteiro(n.n)} no lucro`}</strong>
          <small>{p > 0 ? `${inteiro(n.n)} de ${inteiro(n.total)} no lucro · ${dolares(n.lucro)} de lucro` : `${dolares(n.lucro)} de lucro sem cobrança · ${inteiro(n.total)} ${n.total === 1 ? 'operou' : 'operaram'}`}</small>
        </button>
      })}
    </div>

    {painel && <div className="cdr-carteira">
      <article><span>Em aberto · todos os meses</span><strong>{reais(painel.carteira.a_receber_brl)}</strong><small>{inteiro(painel.carteira.abertas)} {painel.carteira.abertas === 1 ? 'fatura' : 'faturas'}</small></article>
      <article className={painel.carteira.vencidas ? 'perigo' : ''}><span>Vencidas</span><strong>{reais(painel.carteira.vencidas_brl)}</strong><small>{painel.carteira.vencidas ? `${inteiro(painel.carteira.vencidas)} ${painel.carteira.vencidas === 1 ? 'fatura passou' : 'faturas passaram'} do dia 01` : 'Nenhuma atrasada'}</small></article>
      <article className="ok"><span>Recebido · todos os meses</span><strong>{reais(painel.carteira.recebido_brl)}</strong><small>{inteiro(painel.carteira.pagas)} {painel.carteira.pagas === 1 ? 'fatura paga' : 'faturas pagas'}</small></article>
    </div>}

    {painel?.fechado && <section className="admin-card full cdr-gerar">
      <header><div><span className="rot">Faturas de {nomeMes}</span><h3>{numeros.aGerar ? `${inteiro(numeros.aGerar)} ${numeros.aGerar === 1 ? 'fatura pronta' : 'faturas prontas'} para gerar` : numeros.geradas ? 'Todas as faturas deste mês já foram geradas' : 'Nenhum cliente para faturar neste mês'}</h3></div></header>
      <div className="cdr-gerar-corpo">
        <dl>
          <div><dt>A gerar</dt><dd>{reais(numeros.aGerarBrl)}<small>{dolares(numeros.aGerarUsd)} × {cotacao ? reais(cotacao) : '—'}</small></dd></div>
          <div><dt>Abaixo do mínimo</dt><dd>{inteiro(numeros.abaixo)}<small>{numeros.abaixo ? `${reais(numeros.abaixoBrl)} que não serão cobrados` : 'Ninguém'}</small></dd></div>
          <div><dt>Já geradas</dt><dd>{inteiro(numeros.geradas)}<small>{reais(numeros.geradasBrl)}</small></dd></div>
        </dl>
        <label className="cdr-minimo"><span>Valor mínimo da fatura</span>
          <span className="cdr-campo"><i>R$</i><input inputMode="decimal" value={minimoTexto} onChange={(e) => { setMinimoTexto(e.target.value); const v = e.target.value.trim() ? lerNumero(e.target.value) : 0; if (Number.isFinite(v) && v >= 0 && v <= 1000) setMinimo(v) }}
            onBlur={() => setMinimoTexto(minimo.toFixed(2).replace('.', ','))} /></span>
          <small>Abaixo disso, o cliente não recebe fatura no mês</small></label>
        {painel.geral
          ? <button className="admin-primary cdr-gerar-botao" disabled={!numeros.aGerar || !cotacao} onClick={() => setGerando({ usuarios: numeros.aGerarIds, usd: numeros.aGerarUsd, abaixo: numeros.abaixo, refazer: false })}>Gerar {numeros.aGerar ? inteiro(numeros.aGerar) : ''} {numeros.aGerar === 1 ? 'fatura' : 'faturas'}</button>
          : <p className="cdr-so-geral">Só o admin geral gera as faturas.</p>}
      </div>
    </section>}

    <section className="admin-card full cdr-card">
      <header><div><span className="rot">{nomeDoMes(mes)} · conta real, I.A. e manual</span><h3>O resultado de cada cliente e o que ele paga</h3></div>
        <span className="cdr-acoes-tab"><small>{inteiro(lista.length)} {lista.length === 1 ? 'cliente' : 'clientes'}</small>{lista.length > 0 && <button type="button" onClick={baixarPlanilha}>Baixar planilha</button>}</span></header>
      <div className="cdr-filtros">
        <label className="cdr-busca"><svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input placeholder="Buscar cliente: nome, e-mail ou nº da fatura" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <label className="cdr-select"><span>Plano</span><select value={fPlano} onChange={(e) => setFPlano(e.target.value as typeof fPlano)}><option value="todos">Todos</option><option value="gold">Gold</option><option value="black">Black</option><option value="prestige">Prestige</option></select></label>
        <label className="cdr-select"><span>Situação</span><select value={fSituacao} onChange={(e) => setFSituacao(e.target.value as typeof fSituacao)}>
          <option value="todas">Todas</option><option value="lucro">No lucro</option>
          {(painel?.fechado ? ['a-gerar', 'aberta', 'vencida', 'paga', 'abaixo', 'isento', 'prejuizo'] : ['previa', 'abaixo', 'isento', 'prejuizo'] as Situacao[]).map((s) => <option key={s} value={s}>{ROTULO[s as Situacao]}</option>)}</select></label>
        <label className="cdr-select"><span>Ordem</span><select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)}><option value="resultado">Maior resultado</option><option value="valor">Maior valor a pagar</option><option value="nome">Nome</option></select></label>
        {filtrando && <button className="cdr-limpar" onClick={limpar}>Limpar filtros</button>}
      </div>

      {erro && !painel && <div className="adm-vazio">{erro} Clique em Atualizar no topo para tentar de novo.</div>}
      {!painel && !erro && <div className="adm-vazio">{carregando ? 'Lendo os resultados do mês…' : ''}</div>}
      {painel && (lista.length ? <div className="rc-tabela cdr-tab">
        <div className="cab"><span>Cliente</span><span>Plano</span><span>Operações</span><span>Resultado do mês</span><span>Compartilhamento</span><span>Em reais</span><span>Fatura</span></div>
        {lista.map((l) => {
          const s = sit(l)
          return <div key={l.user_id} className={`cdr-linha ${s}`}>
            <span><button type="button" className="cdr-quem" disabled={!onAbrirCliente} onClick={() => onAbrirCliente?.(l.user_id)} title="Abrir a ficha do cliente">
              {l.foto_url ? <img src={l.foto_url} alt="" loading="lazy" /> : <i>{(l.nome || l.email || '?')[0].toUpperCase()}</i>}
              <b>{l.nome || l.email || 'Sem nome'}<SeloDoParceiro codigo={l.parceiro} nome={l.parceiro_nome} /><small>{l.email}{l.fora_da_base ? ' · Fora da base hoje' : ''}</small></b></button></span>
            <span data-rot="Plano"><em className={`cdr-selo ${planoDa(l)}`}>{nomePlano(planoDa(l))}</em><small>{(l.fatura?.percentual ?? l.percentual) > 0 ? pct(l.fatura?.percentual ?? l.percentual) : 'Isento'}</small></span>
            <span data-rot="Operações">{inteiro(l.operacoes)}<small>{l.operacoes ? `${Math.round(l.ganhas / l.operacoes * 100)}% ganhas${l.manuais ? ` · ${inteiro(l.manuais)} manuais` : ''}` : ''}</small></span>
            <span data-rot="Resultado do mês"><b className={l.resultado > 0 ? 'cdr-pos' : l.resultado < 0 ? 'cdr-neg' : ''}>{comSinal(l.resultado)}</b><small>{dolares(l.volume)} em entradas</small></span>
            <span data-rot="Compartilhamento"><b>{l.valor_usd > 0 ? dolares(l.fatura?.valor_usd ?? l.valor_usd) : '—'}</b><small>{l.resultado > 0 && l.percentual > 0 ? `${pct(l.fatura?.percentual ?? l.percentual)} de ${dolares(l.fatura?.lucro_usd ?? l.resultado)}` : ''}</small></span>
            <span data-rot="Em reais"><b>{l.valor_usd > 0 ? reais(emReais(l)) : '—'}</b><small>{l.valor_usd > 0 ? (l.fatura ? `Cotação ${reais(l.fatura.cotacao)} gravada` : 'Cotação de agora') : ''}</small></span>
            <span className="cdr-fatura" data-rot="Fatura">
              <em className={`cdr-sit ${s}`}>{ROTULO[s]}</em>
              {l.fatura
                ? <button type="button" className="cdr-ver" onClick={() => setAberta(l)}>Nº {numeroFatura(l.fatura.numero)}<small>{l.fatura.situacao === 'paga' && l.fatura.paga_em ? `Paga ${dataHora(l.fatura.paga_em)}` : `Vence ${dataCurta(l.fatura.vencimento)}`}</small></button>
                : l.cancelada ? <button type="button" className="cdr-ver" onClick={() => setAberta(l)}>Nº {numeroFatura(l.cancelada.numero)}<small>{l.cancelada.motivo ?? 'Cancelada'}</small></button>
                : l.valor_usd > 0 && <button type="button" className="cdr-ver" onClick={() => setAberta(l)}>{s === 'a-gerar' ? 'Ver como fica' : 'Ver a conta'}{l.canceladas > 0 && <small>{l.canceladas} {l.canceladas === 1 ? 'cancelada' : 'canceladas'}</small>}</button>}
            </span>
          </div>
        })}
      </div> : <div className="adm-vazio">{filtrando ? 'Nenhum cliente com esses filtros.' : `Ninguém operou em conta real em ${nomeMes.toLowerCase()}.`}</div>)}
    </section>

    {gerando && painel && <ConfirmarGeracao sessao={sessao} marca={marca} mes={mes} cotacaoAgora={dolar} minimo={minimo}
      previa={{ n: gerando.usuarios.length, usd: gerando.usd, abaixo: gerando.abaixo }} usuarios={gerando.usuarios} refazer={gerando.refazer} vencimento={painel.vencimento}
      onFechar={() => setGerando(null)} onGerou={() => { setGerando(null); setAberta(null); void ler() }} />}
    {aberta && painel && <JanelaDaFatura sessao={sessao} linha={aberta} painel={painel} cotacao={cotacao} podeMexer={painel.geral}
      situacao={sit(aberta)} onFechar={() => setAberta(null)} onMudou={aoMudarFatura}
      onRefazer={painel.geral && painel.fechado && !aberta.fatura && aberta.cancelada && aberta.resultado > 0 && aberta.percentual > 0
        ? () => setGerando({ usuarios: [aberta.user_id], usd: aberta.valor_usd, abaixo: 0, refazer: true }) : undefined} />}
  </div>
}

function ConfirmarGeracao({ sessao, marca, mes, cotacaoAgora, minimo, previa, usuarios, refazer, vencimento, onFechar, onGerou }: {
  sessao: SessaoTeeds; marca: string; mes: string; cotacaoAgora: { valor: number; quando: number; fonte: string } | null; minimo: number
  previa: { n: number; usd: number; abaixo: number }; usuarios: string[]; refazer: boolean; vencimento: string; onFechar: () => void; onGerou: () => void
}) {
  const [texto, setTexto] = useState(() => cotacaoAgora ? cotacaoAgora.valor.toFixed(4).replace('.', ',') : '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<{ geradas: number; total_brl: number; abaixo_minimo: number } | null>(null)
  const valor = lerNumero(texto)
  const editada = !!cotacaoAgora && Math.abs(valor - cotacaoAgora.valor) > 0.00005
  const valida = Number.isFinite(valor) && valor >= 2 && valor <= 20
  // depois de gerar, fechar de qualquer jeito relê o painel
  const fechar = useCallback(() => { if (enviando) return; if (feito) onGerou(); else onFechar() }, [enviando, feito, onGerou, onFechar])
  useEffect(() => { const f = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }; window.addEventListener('keydown', f); return () => window.removeEventListener('keydown', f) }, [fechar])

  const gerar = async () => {
    if (!valida) return
    setEnviando(true); setErro(null)
    try {
      const r = await rpc<{ geradas: number; total_brl: number; abaixo_minimo: number }>(sessao, 'teeds_gerar_faturas_compartilhamento', {
        p_marca: marca, p_mes: mes, p_cotacao: Math.round(valor * 10000) / 10000,
        p_fonte: editada ? 'Informada pela equipe' : cotacaoAgora?.fonte === 'ao vivo' ? 'AwesomeAPI · comercial' : 'ExchangeRate-API · do dia',
        p_cotacao_em: editada ? new Date().toISOString() : new Date(cotacaoAgora?.quando ?? Date.now()).toISOString(),
        p_minimo_brl: refazer ? 0 : minimo, p_usuarios: usuarios, p_refazer_canceladas: refazer,
      })
      setFeito(r)
    } catch (e) { setErro((e as Error).message) } finally { setEnviando(false) }
  }

  return <div className="cdr-fundo" onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
    <div className="cdr-janela cdr-confirmar" role="dialog" aria-modal="true" aria-label={`Gerar as faturas de ${nomeDoMes(mes)}`}>
      {feito
        ? <>
          <header><span className="rot">Pronto</span><h3>{inteiro(feito.geradas)} {feito.geradas === 1 ? 'fatura gerada' : 'faturas geradas'}</h3></header>
          <p>Total de {reais(feito.total_brl)}, com vencimento em {dataCurta(vencimento)}.{feito.abaixo_minimo ? ` ${inteiro(feito.abaixo_minimo)} ${feito.abaixo_minimo === 1 ? 'cliente ficou' : 'clientes ficaram'} abaixo do mínimo e não ${feito.abaixo_minimo === 1 ? 'recebe' : 'recebem'} fatura.` : ''} Os clientes ainda não veem as faturas.</p>
          <footer><button className="admin-primary" onClick={onGerou}>Fechar</button></footer>
        </>
        : <>
          <header><span className="rot">{refazer ? 'Gerar de novo' : 'Gerar faturas'}</span><h3>{nomeDoMes(mes)}</h3></header>
          {refazer && <p>Este cliente teve a fatura do mês cancelada. Uma fatura nova sai com o valor do mês e a cotação abaixo.</p>}
          <p>Cada cliente Gold ou Black que fechou o mês no lucro recebe uma fatura com o percentual do plano dele, convertido para reais pela cotação abaixo. A cotação fica gravada em cada fatura e não muda depois.</p>
          <label className="cdr-cotacao"><span>Cotação do dólar</span>
            <span className="cdr-campo"><i>R$</i><input inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} autoFocus /></span>
            <small>{editada ? 'Cotação informada por você' : cotacaoAgora ? `Comercial ${cotacaoAgora.fonte === 'ao vivo' ? 'ao vivo' : 'do dia'} · ${dataHora(new Date(cotacaoAgora.quando).toISOString())}` : 'Digite a cotação'}</small></label>
          <dl className="cdr-resumo">
            <div><dt>Faturas</dt><dd>{inteiro(previa.n)}</dd></div>
            <div><dt>Total</dt><dd>{valida ? reais(Math.round(previa.usd * valor * 100) / 100) : '—'}<small>{dolares(previa.usd)}</small></dd></div>
            <div><dt>Vencimento</dt><dd>{dataCurta(vencimento)}</dd></div>
            {!refazer && <div><dt>Mínimo</dt><dd>{reais(minimo)}<small>{previa.abaixo ? `${inteiro(previa.abaixo)} abaixo, sem fatura` : 'Ninguém abaixo'}</small></dd></div>}
          </dl>
          {erro && <p className="cdr-erro">{erro}</p>}
          <footer>
            <button className="cdr-secundario" onClick={onFechar} disabled={enviando}>Cancelar</button>
            <button className="admin-primary" onClick={() => void gerar()} disabled={!valida || enviando || !previa.n}>{enviando ? 'Gerando…' : `Gerar ${inteiro(previa.n)} ${previa.n === 1 ? 'fatura' : 'faturas'}`}</button>
          </footer>
        </>}
    </div>
  </div>
}

/** A fatura como o cliente vai ver (ainda só a equipe vê), com as ações da equipe embaixo. */
function JanelaDaFatura({ sessao, linha, painel, cotacao, podeMexer, situacao, onFechar, onMudou, onRefazer }: {
  sessao: SessaoTeeds; linha: Linha; painel: Painel; cotacao: number; podeMexer: boolean; situacao: Situacao
  onFechar: () => void; onMudou: (f: Fatura) => void; onRefazer?: () => void
}) {
  const f = linha.fatura ?? linha.cancelada
  const [enviando, setEnviando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) onFechar() }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [enviando, onFechar])

  const lucro = f?.lucro_usd ?? linha.resultado
  const p = f?.percentual ?? linha.percentual
  const usd = f?.valor_usd ?? linha.valor_usd
  const cot = f?.cotacao ?? cotacao
  const brl = f?.valor_brl ?? Math.round(usd * cot * 100) / 100
  const plano = f?.subplano ?? linha.subplano
  const venc = f?.vencimento ?? painel.vencimento

  const agir = async (acao: 'pagar' | 'cancelar' | 'reabrir') => {
    if (!f) return
    setEnviando(acao); setErro(null)
    try { onMudou(await rpc<Fatura>(sessao, 'teeds_fatura_compartilhamento_acao', { p_id: f.id, p_acao: acao, p_motivo: acao === 'cancelar' ? motivo : null })); setCancelando(false); setMotivo('') }
    catch (e) { setErro((e as Error).message) } finally { setEnviando(null) }
  }
  const tel = (linha.telefone ?? '').replace(/\D/g, '')
  const zap = tel.length >= 10 ? `https://wa.me/${tel.length <= 11 ? '55' : ''}${tel}?text=${encodeURIComponent(`Olá, ${(linha.nome ?? '').split(' ')[0]}! Sua fatura do compartilhamento de receita da GlobalFly de ${nomeDoMes(f?.mes ?? painel.mes).toLowerCase()} ficou em ${reais(brl)} (${pct(p)} do lucro de ${dolares(lucro)} no mês), com vencimento em ${dataCurta(venc)}.`)}` : null

  return <div className="cdr-fundo" onClick={(e) => { if (e.target === e.currentTarget && !enviando) onFechar() }}>
    <div className="cdr-janela cdr-doc" role="dialog" aria-modal="true" aria-label="Fatura do compartilhamento de receita">
      <button type="button" className="cdr-x" onClick={onFechar} aria-label="Fechar">×</button>
      <div className="cdr-aviso-equipe">{f ? 'Só a equipe vê esta fatura por enquanto' : situacao === 'previa' ? `Prévia: a fatura sai quando ${mesCurto(painel.mes).toLowerCase()} fechar` : 'Prévia: esta fatura ainda não foi gerada'}</div>
      <header className="cdr-doc-topo">
        <div><span className="rot">Compartilhamento de receita</span><h3>{nomeDoMes(f?.mes ?? painel.mes)}</h3></div>
        <div className="cdr-doc-num">{f ? <>Fatura <b>Nº {numeroFatura(f.numero)}</b></> : <b>Sem número</b>}<em className={`cdr-sit ${situacao}`}>{ROTULO[situacao]}</em></div>
      </header>
      <div className="cdr-doc-cliente"><b>{linha.nome || linha.email}</b><small>{linha.email}</small><em className={`cdr-selo ${plano}`}>{nomePlano(plano)}</em></div>

      <ol className="cdr-conta">
        <li><span>Lucro do mês em conta real<small>{inteiro(f?.operacoes ?? linha.operacoes)} operações pela plataforma, I.A. e manual</small></span><b className="cdr-pos">{dolares(lucro)}</b></li>
        <li><span>Compartilhamento do {nomePlano(plano)}<small>{pct(p)} do lucro</small></span><b>{dolares(usd)}</b></li>
        <li><span>Cotação do dólar<small>{f?.cotacao_em ? `${f.cotacao_fonte ?? 'Comercial'} · ${dataHora(f.cotacao_em)}` : 'Comercial de agora: muda até a fatura ser gerada'}</small></span><b>{cot ? reais(cot) : '—'}</b></li>
        <li className="total"><span>Valor da fatura</span><b>{cot ? reais(brl) : '—'}</b></li>
      </ol>
      <div className="cdr-doc-venc"><span>Vencimento</span><b>{dataCurta(venc)}</b>{f?.paga_em && <><span>Paga em</span><b>{dataHora(f.paga_em)}</b></>}</div>

      <div className="cdr-pix">
        {f?.pix_copia_cola
          ? <><span className="rot">Pix copia e cola</span><code>{f.pix_copia_cola}</code><button type="button" onClick={() => void navigator.clipboard?.writeText(f.pix_copia_cola!)}>Copiar</button></>
          : <p><b>Pagamento por Pix automático.</b> O QR Code de cada fatura aparece aqui quando a conta do gateway de pagamento for ligada. Até lá, a baixa é feita pela equipe.</p>}
      </div>
      <p className="cdr-regra">Só o lucro do mês paga compartilhamento. Mês no prejuízo não gera fatura, e cada mês começa do zero.</p>

      {f && (f.historico?.length ?? 0) > 0 && <ol className="cdr-historico">{f.historico.map((h, i) => <li key={i}><b>{h.acao === 'gerada' ? 'Gerada' : h.acao === 'pagar' ? 'Marcada como paga' : h.acao === 'cancelar' ? 'Cancelada' : h.acao === 'reabrir' ? 'Reaberta' : h.acao}</b><small>{dataHora(h.em)}{h.motivo ? ` · ${h.motivo}` : ''}</small></li>)}</ol>}

      {erro && <p className="cdr-erro">{erro}</p>}
      {f?.situacao === 'cancelada' && <p className="cdr-erro">Cancelada em {f.cancelada_em ? dataHora(f.cancelada_em) : '—'}{f.motivo ? `: ${f.motivo}` : ''}. A geração do mês não refaz esta fatura.</p>}
      {cancelando && <label className="cdr-motivo"><span>Motivo do cancelamento</span><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cobrança combinada por fora" autoFocus /></label>}
      <footer>
        {zap && f?.situacao !== 'cancelada' && <a className="cdr-secundario" href={zap} target="_blank" rel="noreferrer">Cobrar no WhatsApp</a>}
        {f && podeMexer && <>
          {f.situacao === 'aberta' && !cancelando && <button className="cdr-secundario perigo" onClick={() => setCancelando(true)} disabled={!!enviando}>Cancelar fatura</button>}
          {cancelando && <><button className="cdr-secundario" onClick={() => { setCancelando(false); setMotivo('') }} disabled={!!enviando}>Voltar</button>
            <button className="admin-primary perigo" onClick={() => void agir('cancelar')} disabled={!!enviando || !motivo.trim()}>{enviando === 'cancelar' ? 'Cancelando…' : 'Confirmar cancelamento'}</button></>}
          {f.situacao === 'paga' && <button className="cdr-secundario" onClick={() => void agir('reabrir')} disabled={!!enviando}>{enviando === 'reabrir' ? 'Reabrindo…' : 'Desfazer a baixa'}</button>}
          {f.situacao === 'aberta' && !cancelando && <button className="admin-primary" onClick={() => void agir('pagar')} disabled={!!enviando}>{enviando === 'pagar' ? 'Salvando…' : 'Marcar como paga'}</button>}
        </>}
        {f?.situacao === 'cancelada' && onRefazer && <button className="admin-primary" onClick={onRefazer}>Gerar de novo</button>}
        {f && !podeMexer && <small className="cdr-so-geral">Só o admin geral dá baixa ou cancela.</small>}
      </footer>
    </div>
  </div>
}
