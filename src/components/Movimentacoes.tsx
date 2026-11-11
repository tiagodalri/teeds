import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import {
  coletasDeExtrato, movimentacoesDoPeriodo,
  type ColetaExtrato, type MovimentacaoDoPeriodo,
} from '../core/teeds/clientes'
import { MARCA } from '../marca'
import { IconeFechar } from './IconeFechar'
import './movimentacoes.css'
import { SeloDoParceiro } from './parceiros/SeloDoParceiro'

/**
 * Depósitos e saques — quanto entrou e quanto saiu das contas reais dos
 * clientes na Deriv.
 *
 * O servidor lê o extrato de cada cliente que conectou a Deriv e guarda só
 * as linhas de depósito e saque (`movimentacoes_deriv`). A tela pede ao banco
 * as movimentações do período (`teeds_movimentacoes_periodo`, com o escopo do
 * admin aplicado lá) e daqui em diante filtra, ordena e agrupa no navegador:
 * por dia, por cliente ou uma a uma. Clicar num dia ou num cliente abre o
 * detalhe; clicar no nome do cliente abre a ficha dele.
 *
 * Tudo em horário de Brasília (10/11/2026, Tiago: "quero sempre horário de
 * Brasília"): a hora de cada movimentação, o "hoje" dos cartões e a quebra
 * por dia. Os outros relatórios seguem em UTC; por isso um depósito feito
 * entre 21h e meia-noite cai aqui no dia de Brasília e lá no dia seguinte.
 */

const usd = (v: number, sinal = false) =>
  `${sinal && v > 0 ? '+' : ''}US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const inteiro = (v: number) => v.toLocaleString('pt-BR')
const diaBr = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })
const diaLongo = (iso: string) => { const t = new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }); return t.charAt(0).toUpperCase() + t.slice(1) }
const FUSO = 'America/Sao_Paulo'
const horaSp = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
const horaUtc = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })
/** O dia de Brasília (AAAA-MM-DD) em que aconteceu. */
const diaSp = (iso: string | number) => new Date(iso).toLocaleDateString('en-CA', { timeZone: FUSO })
const classe = (v: number) => v > 0 ? 'positivo' : v < 0 ? 'negativo' : ''
const hojeSp = () => diaSp(Date.now())
const menosDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10)
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const numero = (t: string): number | null => {
  const limpo = t.replace(/\s/g, '').replace(/\./g, '').replace(',', '.')
  if (!limpo) return null
  const n = Number(limpo)
  return Number.isFinite(n) ? n : null
}

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
type Periodo = typeof PERIODOS[number] | 'personalizado'
type Vista = 'dia' | 'cliente' | 'uma'
type Tipo = 'todos' | 'deposit' | 'withdrawal'
type Direcao = 'asc' | 'desc'
interface Ordem<C extends string> { col: C; dir: Direcao }
const TETO = 5000
const MAX_LINHAS = 400

interface Dia { dia: string; depositos: number; qtdDepositos: number; saques: number; qtdSaques: number; liquido: number; clientes: number }
interface Cliente {
  userId: string; nome: string | null; email: string | null; parceiro: string | null; parceiroNome: string | null
  depositos: number; qtdDepositos: number; saques: number; qtdSaques: number; liquido: number; ultima: string
}
type ColDia = 'dia' | 'depositos' | 'qtdDepositos' | 'saques' | 'qtdSaques' | 'liquido' | 'clientes'
type ColCliente = 'nome' | 'parceiro' | 'depositos' | 'qtdDepositos' | 'saques' | 'qtdSaques' | 'liquido' | 'ultima'
type ColMov = 'quando' | 'cliente' | 'valor'

/** A tag do parceiro: o Selo do Parceiro (11/11/2026), igual em toda a plataforma. */
function TagParceiro({ codigo, nome }: { codigo: string | null; nome: string | null }) {
  return <SeloDoParceiro codigo={codigo} nome={nome} />
}

/** "Naor /n", "Victor /v" ou "Direto". */
const seloParceiro = (m: { parceiro: string | null; parceiroNome: string | null }) =>
  m.parceiro ? `${(m.parceiroNome ?? m.parceiro).split(' ')[0]} /${m.parceiro}` : 'Direto'

function comparar(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' })
}
function ordenar<T, C extends string>(lista: T[], ordem: Ordem<C>, valor: (x: T, c: C) => string | number | null): T[] {
  const s = ordem.dir === 'asc' ? 1 : -1
  return [...lista].sort((a, b) => s * comparar(valor(a, ordem.col), valor(b, ordem.col)))
}
/** Clicar na mesma coluna inverte; numa nova, começa do maior (texto: de A a Z). */
function alternar<C extends string>(atual: Ordem<C>, col: C, textos: C[] = []): Ordem<C> {
  if (atual.col === col) return { col, dir: atual.dir === 'asc' ? 'desc' : 'asc' }
  return { col, dir: textos.includes(col) ? 'asc' : 'desc' }
}

/** Cabeçalho com colunas clicáveis. As setas somem do rótulo que vai para o cartão do celular. */
function Cabecalho<C extends string>({ colunas, ordem, mudar }: { colunas: Array<[C | null, string]>; ordem: Ordem<C>; mudar: (c: C) => void }) {
  return <div className="cab adm-cab-ordem">
    {colunas.map(([col, rotulo], i) => col === null
      ? <span key={i}>{rotulo}</span>
      : <span key={col}><button type="button" className={ordem.col === col ? 'on' : ''} onClick={() => mudar(col)}
          aria-label={`Ordenar por ${rotulo.toLowerCase()}`} title={`Ordenar por ${rotulo.toLowerCase()}`}>
          {rotulo}<i aria-hidden>{ordem.col === col ? (ordem.dir === 'asc' ? '↑' : '↓') : '⇅'}</i></button></span>)}
  </div>
}

/** No celular o cabeçalho some (a tabela vira cartões): a ordem vai para um seletor. */
function OrdemNoCelular<C extends string>({ opcoes, ordem, mudar }: { opcoes: Array<[C, string]>; ordem: Ordem<C>; mudar: (o: Ordem<C>) => void }) {
  return <label className="dps-ordem-cel"><span>Ordenar</span>
    <select value={`${ordem.col}:${ordem.dir}`} onChange={(e) => { const [col, dir] = e.target.value.split(':'); mudar({ col: col as C, dir: dir as Direcao }) }}>
      {opcoes.flatMap(([c, r]) => [<option key={`${c}d`} value={`${c}:desc`}>{r} · maior primeiro</option>, <option key={`${c}a`} value={`${c}:asc`}>{r} · menor primeiro</option>])}
    </select>
  </label>
}

function Pessoa({ m, abrir }: { m: { userId: string; nome: string | null; email: string | null; parceiro: string | null; parceiroNome: string | null }; abrir?: (id: string) => void }) {
  const corpo = <span className="adm-pessoa"><i>{(m.nome || m.email || '?')[0].toUpperCase()}</i><b><span className="dps-nome"><span>{m.nome || 'Sem nome'}</span><TagParceiro codigo={m.parceiro} nome={m.parceiroNome} /></span><small>{m.email ?? 'sem e-mail'}</small></b></span>
  return abrir ? <button type="button" className="dps-quem" onClick={(e) => { e.stopPropagation(); abrir(m.userId) }} title="Abrir a ficha do cliente">{corpo}</button> : corpo
}

export function Movimentacoes({ sessao, onAbrirCliente }: { sessao: SessaoTeeds; onAbrirCliente?: (userId: string) => void }) {
  const [periodo, setPeriodo] = useState<Periodo>(30)
  const [de, setDe] = useState(() => menosDias(hojeSp(), 29))
  const [ate, setAte] = useState(hojeSp)
  const [lista, setLista] = useState<MovimentacaoDoPeriodo[]>([])
  const [coletas, setColetas] = useState<ColetaExtrato[]>([])
  const [carregando, setCarregando] = useState(false)
  const [falhou, setFalhou] = useState(false)
  const [vez, setVez] = useState(0)

  const [vista, setVista] = useState<Vista>('dia')
  const [tipo, setTipo] = useState<Tipo>('todos')
  const [busca, setBusca] = useState('')
  const [minimo, setMinimo] = useState('')
  const [maximo, setMaximo] = useState('')
  const [ordemDia, setOrdemDia] = useState<Ordem<ColDia>>({ col: 'dia', dir: 'desc' })
  const [ordemCli, setOrdemCli] = useState<Ordem<ColCliente>>({ col: 'depositos', dir: 'desc' })
  const [ordemUma, setOrdemUma] = useState<Ordem<ColMov>>({ col: 'quando', dir: 'desc' })
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [clienteAberto, setClienteAberto] = useState<string | null>(null)

  const hoje = hojeSp()
  const janela = useMemo(() => periodo === 'personalizado'
    ? { inicio: de <= ate ? de : ate, fim: de <= ate ? ate : de }
    : { inicio: menosDias(hoje, periodo - 1), fim: hoje }, [periodo, de, ate, hoje])
  const diasNaJanela = Math.round((Date.parse(janela.fim) - Date.parse(janela.inicio)) / 864e5) + 1

  useEffect(() => {
    if (!janela.inicio || !janela.fim) return
    let vivo = true
    setCarregando(true); setFalhou(false)
    Promise.all([movimentacoesDoPeriodo(sessao, janela.inicio, janela.fim, TETO), coletasDeExtrato(sessao)])
      .then(([l, c]) => { if (vivo) { setLista(l); setColetas(c) } })
      // sem isto, uma falha virava o vazio "Nada ainda", como se não houvesse movimentação
      .catch(() => { if (vivo) setFalhou(true) })
      .finally(() => vivo && setCarregando(false))
    return () => { vivo = false }
  }, [sessao.token, janela.inicio, janela.fim, vez])

  /* ---------- filtros: valem para tudo (cartões, dia, cliente e lista) */
  const min = numero(minimo), max = numero(maximo)
  const filtrada = useMemo(() => {
    const q = semAcento(busca.trim())
    return lista.filter((m) => (tipo === 'todos' || m.tipo === tipo)
      && (min === null || m.valor >= min) && (max === null || m.valor <= max)
      && (!q || semAcento(`${m.nome ?? ''} ${m.email ?? ''} ${m.contaId}`).includes(q)))
  }, [lista, tipo, busca, min, max])
  const filtrando = tipo !== 'todos' || busca.trim() !== '' || min !== null || max !== null
  const limpar = () => { setTipo('todos'); setBusca(''); setMinimo(''); setMaximo('') }

  const totais = useMemo(() => {
    const t = { depositos: 0, saques: 0, qtdDepositos: 0, qtdSaques: 0, hojeDep: 0, hojeSaq: 0, hojeQtdDep: 0, hojeQtdSaq: 0, hojeClientes: new Set<string>(), clientes: new Set<string>() }
    for (const m of filtrada) {
      const dep = m.tipo === 'deposit'
      if (dep) { t.depositos += m.valor; t.qtdDepositos++ } else { t.saques += m.valor; t.qtdSaques++ }
      t.clientes.add(m.userId)
      if (diaSp(m.ocorridaEm) === hoje) {
        if (dep) { t.hojeDep += m.valor; t.hojeQtdDep++ } else { t.hojeSaq += m.valor; t.hojeQtdSaq++ }
        t.hojeClientes.add(m.userId)
      }
    }
    return t
  }, [filtrada, hoje])
  const liquidoHoje = totais.hojeDep - totais.hojeSaq
  const liquidoPeriodo = totais.depositos - totais.saques
  const hojeNaJanela = janela.inicio <= hoje && hoje <= janela.fim

  const porDia = useMemo(() => {
    const mapa = new Map<string, Dia & { quem: Set<string> }>()
    for (const m of filtrada) {
      const d = diaSp(m.ocorridaEm)
      let x = mapa.get(d)
      if (!x) { x = { dia: d, depositos: 0, qtdDepositos: 0, saques: 0, qtdSaques: 0, liquido: 0, clientes: 0, quem: new Set() }; mapa.set(d, x) }
      if (m.tipo === 'deposit') { x.depositos += m.valor; x.qtdDepositos++ } else { x.saques += m.valor; x.qtdSaques++ }
      x.liquido = x.depositos - x.saques
      x.quem.add(m.userId); x.clientes = x.quem.size
    }
    return ordenar([...mapa.values()], ordemDia, (d, c) => d[c])
  }, [filtrada, ordemDia])

  const porCliente = useMemo(() => {
    const mapa = new Map<string, Cliente>()
    for (const m of filtrada) {
      let x = mapa.get(m.userId)
      if (!x) { x = { userId: m.userId, nome: m.nome, email: m.email, parceiro: m.parceiro, parceiroNome: m.parceiroNome, depositos: 0, qtdDepositos: 0, saques: 0, qtdSaques: 0, liquido: 0, ultima: m.ocorridaEm }; mapa.set(m.userId, x) }
      if (m.tipo === 'deposit') { x.depositos += m.valor; x.qtdDepositos++ } else { x.saques += m.valor; x.qtdSaques++ }
      x.liquido = x.depositos - x.saques
      if (m.ocorridaEm > x.ultima) x.ultima = m.ocorridaEm
    }
    return ordenar([...mapa.values()], ordemCli, (x, c) => c === 'nome' ? (x.nome || x.email || '') : c === 'parceiro' ? seloParceiro(x) : x[c])
  }, [filtrada, ordemCli])

  const umaAUma = useMemo(() => ordenar(filtrada, ordemUma, valorDaMov), [filtrada, ordemUma])

  const saude = useMemo(() => {
    const comErro = coletas.filter((c) => c.ultimoErro)
    const ultima = coletas.reduce<string | null>((m, c) => (!m || c.ultimaTentativaEm > m) ? c.ultimaTentativaEm : m, null)
    return { contas: coletas.length, comErro: comErro.length, ultima }
  }, [coletas])

  const abrirFicha = onAbrirCliente
  const doDia = diaAberto ? filtrada.filter((m) => diaSp(m.ocorridaEm) === diaAberto) : []
  const doCliente = clienteAberto ? filtrada.filter((m) => m.userId === clienteAberto) : []
  const rotuloPeriodo = periodo === 'personalizado' ? `${diaBr(janela.inicio)} a ${diaBr(janela.fim)}` : `${periodo} dias`
  const vazio = !carregando && !falhou && filtrada.length === 0

  return <div className="dps">
    <div className="rc-filtros dps-topo">
      <div className="rc-periodo">
        {PERIODOS.map((p) => <button key={p} className={periodo === p ? 'on' : ''} onClick={() => setPeriodo(p)}>{p} dias</button>)}
        <button className={periodo === 'personalizado' ? 'on' : ''} onClick={() => setPeriodo('personalizado')}>Escolher datas</button>
      </div>
      {periodo === 'personalizado' && <div className="dps-datas">
        <label><span>De</span><input type="date" value={de} max={hoje} onChange={(e) => e.target.value && setDe(e.target.value)} /></label>
        <label><span>Até</span><input type="date" value={ate} max={hoje} onChange={(e) => e.target.value && setAte(e.target.value)} /></label>
      </div>}
      <span className="rc-carregando">{carregando ? 'Atualizando…' : saude.contas
        ? `Coleta: ${saude.contas} conta${saude.contas === 1 ? '' : 's'} · última ${haQuanto(saude.ultima)}${saude.comErro ? ` · ${saude.comErro} com erro` : ''}`
        : 'A coleta ainda não rodou'}</span>
      <button className="dps-atualizar" onClick={() => setVez((v) => v + 1)} disabled={carregando}>Atualizar</button>
    </div>

    <div className="adm-kpis admin-kpis-click dps-kpis">
      <button className="ok" disabled={!hojeNaJanela || !totais.hojeQtdDep} onClick={() => setDiaAberto(hoje)}><span>Depositado hoje</span><strong>{usd(totais.hojeDep)}</strong><small>{totais.hojeQtdDep} {totais.hojeQtdDep === 1 ? 'depósito' : 'depósitos'}{totais.hojeQtdDep ? ' · ver detalhe →' : ''}</small></button>
      <button className="perigo" disabled={!hojeNaJanela || !totais.hojeQtdSaq} onClick={() => setDiaAberto(hoje)}><span>Sacado hoje</span><strong>{usd(totais.hojeSaq)}</strong><small>{totais.hojeQtdSaq} {totais.hojeQtdSaq === 1 ? 'saque' : 'saques'}{totais.hojeQtdSaq ? ' · ver detalhe →' : ''}</small></button>
      <button className={liquidoHoje >= 0 ? 'ok' : 'perigo'} disabled={!totais.hojeClientes.size} onClick={() => setDiaAberto(hoje)}><span>Líquido hoje</span><strong>{usd(liquidoHoje, true)}</strong><small>{totais.hojeClientes.size} {totais.hojeClientes.size === 1 ? 'cliente movimentou' : 'clientes movimentaram'}</small></button>
      <button className="alerta" disabled={!totais.clientes.size} onClick={() => setVista('cliente')}><span>Líquido · {rotuloPeriodo}</span><strong>{usd(liquidoPeriodo, true)}</strong><small>{usd(totais.depositos)} entrou · {usd(totais.saques)} saiu</small></button>
    </div>

    <section className="admin-card full dps-card">
      <header>
        <div><span className="rot">{rotuloPeriodo} · só conta real</span><h3>{vista === 'dia' ? 'Quanto entrou e quanto saiu, por dia' : vista === 'cliente' ? 'Quem mais depositou e sacou' : 'Cada depósito e cada saque'}</h3></div>
        <div className="rc-periodo dps-vistas" role="tablist">
          {([['dia', 'Por dia'], ['cliente', 'Por cliente'], ['uma', 'Uma a uma']] as [Vista, string][]).map(([v, r]) =>
            <button key={v} role="tab" aria-selected={vista === v} className={vista === v ? 'on' : ''} onClick={() => setVista(v)}>{r}</button>)}
        </div>
      </header>

      <div className="dps-filtros">
        <label className="dps-busca"><svg viewBox="0 0 24 24" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input placeholder="Buscar cliente: nome, e-mail ou conta" value={busca} onChange={(e) => setBusca(e.target.value)} /></label>
        <div className="rc-periodo dps-tipo">
          {([['todos', 'Tudo'], ['deposit', 'Só depósitos'], ['withdrawal', 'Só saques']] as [Tipo, string][]).map(([t, r]) =>
            <button key={t} className={tipo === t ? 'on' : ''} onClick={() => setTipo(t)}>{r}</button>)}
        </div>
        <div className="dps-faixa">
          <label><span>Valor de</span><input inputMode="decimal" placeholder="US$ 0" aria-label="Valor mínimo em dólar" value={minimo} onChange={(e) => setMinimo(e.target.value)} /></label>
          <label><span>Até</span><input inputMode="decimal" placeholder="Sem limite" aria-label="Valor máximo em dólar" value={maximo} onChange={(e) => setMaximo(e.target.value)} /></label>
        </div>
        {vista === 'dia' && <OrdemNoCelular ordem={ordemDia} mudar={setOrdemDia} opcoes={[['dia', 'Dia'], ['depositos', 'Depósitos'], ['saques', 'Saques'], ['liquido', 'Líquido'], ['clientes', 'Clientes']]} />}
        {vista === 'cliente' && <OrdemNoCelular ordem={ordemCli} mudar={setOrdemCli} opcoes={[['depositos', 'Depósitos'], ['saques', 'Saques'], ['liquido', 'Líquido'], ['ultima', 'Última movimentação']]} />}
        {vista === 'uma' && <OrdemNoCelular ordem={ordemUma} mudar={setOrdemUma} opcoes={[['quando', 'Horário'], ['valor', 'Valor']]} />}
      </div>

      <div className="dps-resumo">
        <span><b className="positivo">{usd(totais.depositos)}</b> em {inteiro(totais.qtdDepositos)} {totais.qtdDepositos === 1 ? 'depósito' : 'depósitos'}</span>
        <span><b className="negativo">{usd(totais.saques)}</b> em {inteiro(totais.qtdSaques)} {totais.qtdSaques === 1 ? 'saque' : 'saques'}</span>
        <span><b>{inteiro(totais.clientes.size)}</b> {totais.clientes.size === 1 ? 'cliente' : 'clientes'}</span>
        {filtrando && <span className="dps-filtrando">Filtrado: {inteiro(filtrada.length)} de {inteiro(lista.length)} movimentações <button onClick={limpar}>Limpar filtros</button></span>}
      </div>
      {lista.length >= TETO && <div className="rc-aviso neutro">O período tem mais de {inteiro(TETO)} movimentações; a tela mostra as {inteiro(TETO)} mais recentes. Escolha um período menor para ver tudo.</div>}

      {vista === 'dia' && porDia.length > 0 && <div className="rc-tabela dps-dias">
        <Cabecalho ordem={ordemDia} mudar={(c) => setOrdemDia((o) => alternar(o, c))}
          colunas={[['dia', 'Dia'], ['depositos', 'Depósitos'], ['qtdDepositos', 'Qtd'], ['saques', 'Saques'], ['qtdSaques', 'Qtd'], ['liquido', 'Líquido'], ['clientes', 'Clientes']]} />
        {porDia.map((d) => (
          <button key={d.dia} onClick={() => setDiaAberto(d.dia)} title="Ver cada depósito e saque deste dia">
            <span>{diaBr(d.dia)}{d.dia === hoje && <small>hoje</small>}</span>
            <span className="positivo">{usd(d.depositos)}<small className="dps-qtd-cel">{inteiro(d.qtdDepositos)} {d.qtdDepositos === 1 ? 'depósito' : 'depósitos'}</small></span>
            <span className="dps-qtd">{inteiro(d.qtdDepositos)}</span>
            <span className="negativo">{usd(d.saques)}<small className="dps-qtd-cel">{inteiro(d.qtdSaques)} {d.qtdSaques === 1 ? 'saque' : 'saques'}</small></span>
            <span className="dps-qtd">{inteiro(d.qtdSaques)}</span>
            <strong className={classe(d.liquido)}>{usd(d.liquido, true)}</strong>
            <span className="dps-ver">{d.clientes}<i aria-hidden>Ver →</i></span>
          </button>
        ))}
      </div>}

      {vista === 'cliente' && porCliente.length > 0 && <div className="rc-tabela dps-cli">
        <Cabecalho ordem={ordemCli} mudar={(c) => setOrdemCli((o) => alternar(o, c, ['nome', 'parceiro']))}
          colunas={[['nome', 'Cliente'], ['parceiro', 'Parceiro'], ['depositos', 'Depósitos'], ['qtdDepositos', 'Qtd'], ['saques', 'Saques'], ['qtdSaques', 'Qtd'], ['liquido', 'Líquido'], ['ultima', 'Última']]} />
        {porCliente.map((x) => (
          <button key={x.userId} onClick={() => setClienteAberto(x.userId)} title="Ver as movimentações deste cliente">
            <span className="adm-pessoa"><i>{(x.nome || x.email || '?')[0].toUpperCase()}</i><b><span className="dps-nome"><span>{x.nome || 'Sem nome'}</span><span className="dps-qtd-cel"><TagParceiro codigo={x.parceiro} nome={x.parceiroNome} /></span></span><small>{x.email ?? 'sem e-mail'}</small></b></span>
            <span className="dps-qtd"><TagParceiro codigo={x.parceiro} nome={x.parceiroNome} /></span>
            <span className="positivo">{usd(x.depositos)}<small className="dps-qtd-cel">{inteiro(x.qtdDepositos)} {x.qtdDepositos === 1 ? 'depósito' : 'depósitos'}</small></span>
            <span className="dps-qtd">{inteiro(x.qtdDepositos)}</span>
            <span className="negativo">{usd(x.saques)}<small className="dps-qtd-cel">{inteiro(x.qtdSaques)} {x.qtdSaques === 1 ? 'saque' : 'saques'}</small></span>
            <span className="dps-qtd">{inteiro(x.qtdSaques)}</span>
            <strong className={classe(x.liquido)}>{usd(x.liquido, true)}</strong>
            <span className="dps-ver">{diaBr(diaSp(x.ultima))}<i aria-hidden>Ver →</i></span>
          </button>
        ))}
      </div>}

      {vista === 'uma' && umaAUma.length > 0 && <TabelaDeMovs movs={umaAUma.slice(0, MAX_LINHAS)} ordem={ordemUma} mudar={setOrdemUma} comCliente comDia abrirFicha={abrirFicha} />}
      {vista === 'uma' && umaAUma.length > MAX_LINHAS && <div className="adm-vazio">Mostrando {MAX_LINHAS} de {inteiro(umaAUma.length)}. Use a busca ou um período menor para chegar ao resto.</div>}

      {!carregando && falhou && <div className="adm-vazio">Não conseguimos ler as movimentações agora. Clique em Atualizar ou volte em instantes.</div>}
      {vazio && <div className="adm-vazio">
        {filtrando && lista.length ? <>Nenhuma movimentação com esses filtros. <button className="dps-link" onClick={limpar}>Limpar filtros</button></>
          : saude.contas ? 'Nenhum depósito nem saque em conta real nesse período.'
          : `Nada ainda. O servidor lê o extrato de cada cliente que conectou a Deriv na ${MARCA.prosa}; a primeira passada acontece pouco depois de ele subir.`}
      </div>}
    </section>

    {coletas.length > 0 && <details className="admin-card full dps-coleta">
      <summary><div><span className="rot">A coleta</span><h3>Conta a conta, quando o servidor leu o extrato</h3></div><small>{saude.comErro ? `${saude.comErro} com erro na última tentativa` : 'todas leram na última tentativa'} · abrir</small></summary>
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
    </details>}

    {diaAberto && <Detalhe fechar={() => setDiaAberto(null)} movs={doDia} filtrando={filtrando}
      titulo={<div><span className="rot">Horário de Brasília · só conta real</span><h3 className="dps-titulo-dia">{diaLongo(diaAberto)}</h3></div>}
      comCliente abrirFicha={abrirFicha} />}
    {clienteAberto && doCliente[0] && <Detalhe fechar={() => setClienteAberto(null)} movs={doCliente} filtrando={filtrando}
      titulo={<Pessoa m={doCliente[0]} />}
      acao={abrirFicha && <button className="dps-ficha" onClick={() => abrirFicha(clienteAberto)}>Abrir ficha completa</button>}
      rotulo={rotuloPeriodo} comDia abrirFicha={undefined} />}
  </div>
}

function valorDaMov(m: MovimentacaoDoPeriodo, c: ColMov): string | number {
  return c === 'quando' ? m.ocorridaEm : c === 'valor' ? m.valor : (m.nome || m.email || '')
}

function TabelaDeMovs({ movs, ordem, mudar, comCliente, comDia, abrirFicha }: {
  movs: MovimentacaoDoPeriodo[]; ordem: Ordem<ColMov>; mudar: (o: Ordem<ColMov>) => void
  comCliente?: boolean; comDia?: boolean; abrirFicha?: (id: string) => void
}) {
  const colunas: Array<[ColMov | null, string]> = [
    ...(comCliente ? [['cliente', 'Cliente'] as [ColMov, string]] : []),
    ['quando', 'Horário (Brasília)'], [null, 'Conta'], [null, 'Tipo'], ['valor', 'Valor'], [null, 'Saldo depois'],
  ]
  return <div className={`rc-tabela dps-lista ${comCliente ? 'com-cliente' : ''}`}>
    <Cabecalho colunas={colunas} ordem={ordem} mudar={(c) => mudar(alternar(ordem, c, ['cliente']))} />
    {movs.map((m) => {
      const dep = m.tipo === 'deposit'
      return <div key={`${m.contaId}-${m.transacaoId}`}>
        {comCliente && <span><Pessoa m={m} abrir={abrirFicha} /></span>}
        <span title={`${horaUtc(m.ocorridaEm)} em UTC`}><b className="dps-hora">{horaSp(m.ocorridaEm)}</b><small>{diaBr(diaSp(m.ocorridaEm))}</small></span>
        <span>{m.contaId}<small>{m.moeda}</small></span>
        <span><em className={`dps-tipo-selo ${dep ? 'dep' : 'saq'}`}>{dep ? 'Depósito' : 'Saque'}</em>{m.descricao && <small title={m.descricao}>{m.descricao}</small>}</span>
        <strong className={dep ? 'positivo' : 'negativo'}>{dep ? '+' : '−'}{usd(m.valor)}</strong>
        <span>{m.saldoDepois === null ? <small>—</small> : usd(m.saldoDepois)}</span>
      </div>
    })}
  </div>
}

function Detalhe({ titulo, acao, movs, rotulo, fechar, comCliente, comDia, abrirFicha, filtrando }: {
  titulo: ReactNode; acao?: ReactNode; movs: MovimentacaoDoPeriodo[]; rotulo?: string; fechar: () => void
  comCliente?: boolean; comDia?: boolean; abrirFicha?: (id: string) => void; filtrando: boolean
}) {
  const [ordem, setOrdem] = useState<Ordem<ColMov>>({ col: 'quando', dir: 'desc' })
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [fechar])
  const t = useMemo(() => {
    const dep = movs.filter((m) => m.tipo === 'deposit'), saq = movs.filter((m) => m.tipo === 'withdrawal')
    const soma = (l: MovimentacaoDoPeriodo[]) => l.reduce((s, m) => s + m.valor, 0)
    return { dep: soma(dep), qDep: dep.length, saq: soma(saq), qSaq: saq.length, clientes: new Set(movs.map((m) => m.userId)).size }
  }, [movs])
  const ordenadas = useMemo(() => ordenar(movs, ordem, valorDaMov), [movs, ordem])

  return <div className="adm-modal-fundo" onMouseDown={fechar}>
    <section className="adm-modal dps-detalhe" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
      <header>{titulo}<div className="dps-detalhe-acoes">{acao}<button className="dps-fechar" onClick={fechar} aria-label="Fechar"><IconeFechar /></button></div></header>
      <div className="adm-detail-kpis dps-detalhe-kpis">
        <div><span>Entrou{rotulo ? ` · ${rotulo}` : ''}</span><b className="positivo">{usd(t.dep)}</b><small>{t.qDep} {t.qDep === 1 ? 'depósito' : 'depósitos'}</small></div>
        <div><span>Saiu</span><b className="negativo">{usd(t.saq)}</b><small>{t.qSaq} {t.qSaq === 1 ? 'saque' : 'saques'}</small></div>
        <div><span>Líquido</span><b className={classe(t.dep - t.saq)}>{usd(t.dep - t.saq, true)}</b><small>{comCliente ? `${t.clientes} ${t.clientes === 1 ? 'cliente' : 'clientes'}` : `${movs.length} ${movs.length === 1 ? 'movimentação' : 'movimentações'}`}</small></div>
      </div>
      {filtrando && <p className="dps-detalhe-aviso">Com os filtros da tela aplicados.</p>}
      <div className="dps-detalhe-ordem">
        <span>Ordenar por</span>
        <div className="rc-periodo">
          {([['quando', 'Horário'], ['valor', 'Valor']] as [ColMov, string][]).map(([c, r]) =>
            <button key={c} className={ordem.col === c ? 'on' : ''} onClick={() => setOrdem((o) => alternar(o, c))}>{r} {ordem.col === c ? (ordem.dir === 'asc' ? '↑' : '↓') : ''}</button>)}
        </div>
        {comCliente && abrirFicha && <small>Clique no cliente para abrir a ficha.</small>}
      </div>
      <div className="dps-detalhe-corpo">
        {ordenadas.length ? <TabelaDeMovs movs={ordenadas} ordem={ordem} mudar={setOrdem} comCliente={comCliente} comDia={comDia} abrirFicha={abrirFicha} />
          : <div className="adm-vazio">Nada nesse recorte.</div>}
      </div>
    </section>
  </div>
}
