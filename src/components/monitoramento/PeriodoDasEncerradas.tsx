/**
 * Filtro de dia e de horário + rodapé de totais da aba "Sessões encerradas"
 * (10/11/2026, Tiago: "aqui eu quero alguns filtros, por dia, por horários
 * etc. Lá embaixo também quero a somatória do mkup etc, tudo certinho").
 *
 * Dia e horário valem pela hora em que a sessão TERMINOU — a mesma da coluna
 * "Encerrada", para o que se filtra bater com o que se lê na linha. Sessão sem
 * data de fim (não acontece hoje) cai na hora em que começou. Hora local do
 * aparelho (o Tiago opera do Brasil).
 *
 * Os totais recebem a lista JÁ FILTRADA inteira, não a página da tela: o
 * "Mostrar mais" só decide quantas linhas aparecem, não o que soma.
 */
import type { SessaoEncerrada, MarkupDaSessao } from '../../core/teeds/monitoramento'
import './periodo-das-encerradas.css'

/* ------------------------------------------------------------- período */

export type AtalhoDeDia = 'hoje' | 'ontem' | '7' | '30' | 'datas'
export type Horario = 'todos' | 'madrugada' | 'manha' | 'tarde' | 'noite' | 'faixa'
export interface FiltroDeTempo {
  dia: AtalhoDeDia
  /** 'aaaa-mm-dd', só com dia = 'datas'. */
  de: string
  ate: string
  horario: Horario
  /** Faixa escolhida: das `horaDe` (0–23) às `horaAte` (1–24). Vira a noite se `horaDe` > `horaAte`. */
  horaDe: number
  horaAte: number
}

export const TEMPO_PADRAO: FiltroDeTempo = { dia: '30', de: '', ate: '', horario: 'todos', horaDe: 9, horaAte: 12 }

const FAIXAS: Record<Exclude<Horario, 'todos' | 'faixa'>, [number, number, string]> = {
  madrugada: [0, 6, 'Madrugada (0h às 6h)'],
  manha: [6, 12, 'Manhã (6h às 12h)'],
  tarde: [12, 18, 'Tarde (12h às 18h)'],
  noite: [18, 24, 'Noite (18h às 24h)'],
}

/** 'aaaa-mm-dd' de uma data, no fuso do aparelho. */
export function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const somarDias = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const ddmm = (dia: string) => dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}` : ''

/** O intervalo de dias (inclusive) e a faixa de horas de um filtro. */
function janela(t: FiltroDeTempo, agora = new Date()): { de: string; ate: string; horas: [number, number] | null } {
  const hoje = diaLocal(agora)
  let de = diaLocal(somarDias(agora, -29)), ate = hoje
  if (t.dia === 'hoje') de = hoje
  else if (t.dia === 'ontem') { de = diaLocal(somarDias(agora, -1)); ate = de }
  else if (t.dia === '7') de = diaLocal(somarDias(agora, -6))
  else if (t.dia === 'datas') {
    de = t.de || de; ate = t.ate || ate
    if (de > ate) [de, ate] = [ate, de]
  }
  const horas: [number, number] | null = t.horario === 'todos' ? null
    : t.horario === 'faixa' ? [t.horaDe, t.horaAte]
    : [FAIXAS[t.horario][0], FAIXAS[t.horario][1]]
  return { de, ate, horas }
}

/** A função que diz se uma sessão entra no período (montada uma vez por filtro). */
export function noPeriodo(t: FiltroDeTempo): (s: SessaoEncerrada) => boolean {
  const { de, ate, horas } = janela(t)
  // O atalho "30 dias" é a lista inteira: não corta nada (nem a sessão que
  // começou há 30 dias e terminou ontem).
  const todoODia = !horas
  const tudo = t.dia === '30' && todoODia
  return (s) => {
    if (tudo) return true
    const d = new Date(s.encerradaEm ?? s.criadaEm)
    const dia = diaLocal(d)
    if (t.dia !== '30' && (dia < de || dia > ate)) return false
    if (horas) {
      const h = d.getHours() + d.getMinutes() / 60
      const [a, b] = horas
      if (a === b) return true
      if (a < b ? (h < a || h >= b) : (h < a && h >= b)) return false
    }
    return true
  }
}

/** O título do cartão: diz em palavras o que está na tela. */
export function rotuloDoPeriodo(t: FiltroDeTempo): string {
  const { de, ate, horas } = janela(t)
  const dia = t.dia === 'hoje' ? `Hoje, ${ddmm(de)}`
    : t.dia === 'ontem' ? `Ontem, ${ddmm(de)}`
    : t.dia === '7' ? 'Últimos 7 dias'
    : t.dia === '30' ? 'Últimos 30 dias'
    : de === ate ? `Dia ${ddmm(de)}` : `De ${ddmm(de)} a ${ddmm(ate)}`
  if (!horas) return dia
  return `${dia} · das ${horas[0]}h às ${horas[1]}h`
}

const h = (n: number) => `${String(n).padStart(2, '0')}h`

/** Algum filtro fora do padrão (o botão "Limpar filtros" só aparece aí). */
export const filtrosMudaram = (t: FiltroDeTempo, temOutrosFiltros: boolean) =>
  temOutrosFiltros || t.dia !== TEMPO_PADRAO.dia || t.horario !== TEMPO_PADRAO.horario

/** "Limpar filtros", no canto do cabeçalho, ao lado da contagem. */
export function LimparFiltros({ visivel, onLimpar }: { visivel: boolean; onLimpar: () => void }) {
  return visivel ? <button type="button" className="mse-limpar" onClick={onLimpar}>Limpar filtros</button> : null
}

export function FiltroDePeriodo({ valor, onTrocar }: {
  valor: FiltroDeTempo; onTrocar: (t: FiltroDeTempo) => void
}) {
  const agora = new Date()
  const hoje = diaLocal(agora)
  const minimo = diaLocal(somarDias(agora, -29))
  const t = valor
  const escolher = (dia: AtalhoDeDia) => onTrocar(dia === 'datas'
    ? { ...t, dia, de: t.de || diaLocal(somarDias(agora, -6)), ate: t.ate || hoje }
    : { ...t, dia })
  return (
    <div className="mse-periodo">
      <div className="mse-grupo" role="group" aria-label="Dia em que a sessão terminou">
        <span className="mse-rot">Dia</span>
        <div className="mse-atalhos">
          {([['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['30', '30 dias'], ['datas', 'Escolher datas', 'Datas']] as [AtalhoDeDia, string, string?][]).map(([id, texto, curto]) => (
            <button key={id} type="button" aria-pressed={t.dia === id} aria-label={texto} className={t.dia === id ? 'on' : ''} onClick={() => escolher(id)}>
              {curto ? <><span className="mse-longo">{texto}</span><span className="mse-curto" aria-hidden>{curto}</span></> : texto}
            </button>
          ))}
        </div>
        {t.dia === 'datas' && (
          <div className="mse-datas">
            <label>De<input type="date" value={t.de} min={minimo} max={hoje} onChange={(e) => onTrocar({ ...t, de: e.target.value })} aria-label="Primeiro dia" /></label>
            <label>Até<input type="date" value={t.ate} min={minimo} max={hoje} onChange={(e) => onTrocar({ ...t, ate: e.target.value })} aria-label="Último dia" /></label>
          </div>
        )}
      </div>
      <div className="mse-grupo" role="group" aria-label="Horário em que a sessão terminou">
        <span className="mse-rot">Horário</span>
        <select value={t.horario} onChange={(e) => onTrocar({ ...t, horario: e.target.value as Horario })} aria-label="Faixa de horário">
          <option value="todos">Qualquer horário</option>
          {Object.entries(FAIXAS).map(([id, [, , texto]]) => <option key={id} value={id}>{texto}</option>)}
          <option value="faixa">Escolher horário</option>
        </select>
        {t.horario === 'faixa' && (
          <div className="mse-datas">
            <label>Das<select value={t.horaDe} onChange={(e) => onTrocar({ ...t, horaDe: Number(e.target.value) })} aria-label="A partir de">
              {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{h(i)}</option>)}
            </select></label>
            <label>Às<select value={t.horaAte} onChange={(e) => onTrocar({ ...t, horaAte: Number(e.target.value) })} aria-label="Até">
              {Array.from({ length: 24 }, (_, i) => i + 1).map((i) => <option key={i} value={i}>{h(i)}</option>)}
            </select></label>
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- totais */

type ComoTerminou = 'meta' | 'limite' | 'parou' | 'outro'
/** Pelo texto que o servidor grava em `motivo_da_parada`. */
export function comoTerminou(s: SessaoEncerrada): ComoTerminou {
  const m = (s.motivoDaParada ?? '').toLowerCase()
  if (m.startsWith('meta de lucro')) return 'meta'
  if (m.startsWith('limite de perda')) return 'limite'
  if (m.startsWith('você pediu para parar')) return 'parou'
  return 'outro'
}
export const ROTULO_DO_FIM: Record<ComoTerminou, string> = {
  meta: 'Meta de lucro', limite: 'Limite de perda', parou: 'Parada pelo cliente', outro: 'Outros motivos',
}

const num = (v: number) => v.toLocaleString('pt-BR')
const dinheiro = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const comSinal = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${dinheiro(v)}`

/** Soma por moeda ("−9,00 USD" ou, se um dia misturar, "−9,00 USD + 3,00 BRL"). */
function somar(lista: SessaoEncerrada[], valor: (s: SessaoEncerrada) => number | null) {
  const m = new Map<string, number>()
  for (const s of lista) { const v = valor(s); if (v !== null) m.set(s.moeda || 'USD', (m.get(s.moeda || 'USD') ?? 0) + v) }
  return m
}
function escrever(m: Map<string, number>, sinal: boolean): string {
  if (!m.size) return '0,00 USD'
  return [...m.entries()].map(([moeda, v]) => `${sinal ? comSinal(v) : dinheiro(v)} ${moeda}`).join(' + ')
}
const total = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)

export function TotaisDasEncerradas({ lista, markups, somandoMarkup, mostrarMarkup }: {
  lista: SessaoEncerrada[]; markups: Map<string, MarkupDaSessao>; somandoMarkup: boolean; mostrarMarkup: boolean
}) {
  if (!lista.length) return null
  const reais = lista.filter((s) => !s.demo), demos = lista.filter((s) => s.demo)
  const misturado = reais.length > 0 && demos.length > 0
  const ops = lista.reduce((a, s) => a + s.operacoes, 0)
  const ganhas = lista.reduce((a, s) => a + s.ganhas, 0)
  const perdidas = lista.reduce((a, s) => a + s.perdidas, 0)
  const acerto = ganhas + perdidas ? (ganhas / (ganhas + perdidas)) * 100 : null
  const fins: Record<ComoTerminou, number> = { meta: 0, limite: 0, parou: 0, outro: 0 }
  for (const s of lista) fins[comoTerminou(s)]++

  const resultado = somar(lista, (s) => s.resultado)
  const resReal = somar(reais, (s) => s.resultado), resDemo = somar(demos, (s) => s.resultado)
  const mk = (s: SessaoEncerrada) => markups.get(s.id)?.markup ?? null
  const mkReal = somar(reais, mk), mkDemo = somar(demos, mk)
  const semMarkup = somandoMarkup ? 0 : lista.filter((s) => !markups.has(s.id)).length
  // O markup que vale dinheiro é o das contas reais; o das demo é simulação.
  const markupPrincipal = reais.length ? mkReal : mkDemo
  const sessoesDoMarkup = reais.length ? reais.length : demos.length
  const mediaMarkup = sessoesDoMarkup ? total(markupPrincipal) / sessoesDoMarkup : 0
  const moedaUnica = new Set(lista.map((s) => s.moeda || 'USD')).size === 1 ? (lista[0].moeda || 'USD') : null

  return (
    <footer className="mse-totais" aria-label="Totais do filtro">
      <div className="mse-totais-cab">
        <b>Totais do filtro</b>
        <small>Somam as {num(lista.length)} {lista.length === 1 ? 'sessão' : 'sessões'} que passam pelos filtros, não só as que estão na tela.</small>
      </div>
      <div className={`mse-totais-grade ${mostrarMarkup ? 'com-markup' : ''}`}>
        <article>
          <span>Sessões</span>
          <strong>{num(lista.length)}</strong>
          <small>{misturado ? `${num(reais.length)} reais · ${num(demos.length)} demo` : reais.length ? 'Todas em conta real' : 'Todas em conta demo'}</small>
          <ul className="mse-fins">
            {(Object.keys(fins) as ComoTerminou[]).filter((k) => fins[k] > 0).map((k) => (
              <li key={k} className={`mse-fim-${k}`}><i aria-hidden />{ROTULO_DO_FIM[k]} <b>{num(fins[k])}</b></li>
            ))}
          </ul>
        </article>
        <article>
          <span>Operações</span>
          <strong>{num(ops)}</strong>
          <small><em className="up">{num(ganhas)} ganhas</em> · <em className="down">{num(perdidas)} perdidas</em></small>
          {acerto !== null && <small>Acerto de {acerto.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</small>}
        </article>
        <article>
          <span>Resultado</span>
          <strong className={total(resultado) >= 0 ? 'up' : 'down'}>{escrever(resultado, true)}</strong>
          {misturado
            ? <><small>Real <em className={total(resReal) >= 0 ? 'up' : 'down'}>{escrever(resReal, true)}</em></small><small>Demo <em className="mse-apagado">{escrever(resDemo, true)}</em></small></>
            : moedaUnica && <small>Média por sessão {comSinal(total(resultado) / lista.length)} {moedaUnica}</small>}
        </article>
        {mostrarMarkup && (
          <article className="mse-markup">
            <span>Markup{!reais.length ? ' · Simulado' : ''}</span>
            {somandoMarkup
              ? <strong className="mse-somando">Somando…</strong>
              : <strong className={reais.length ? '' : 'mse-apagado'}>{escrever(markupPrincipal, false)}</strong>}
            {!somandoMarkup && moedaUnica && <small>Média por sessão {dinheiro(mediaMarkup)} {moedaUnica}</small>}
            {!somandoMarkup && misturado && <small>Simulado nas demo <em className="mse-apagado">{escrever(mkDemo, false)}</em></small>}
            {semMarkup > 0 && <small className="mse-aviso">{num(semMarkup)} {semMarkup === 1 ? 'sessão ficou' : 'sessões ficaram'} sem número (a soma falhou). Abra a aba de novo.</small>}
          </article>
        )}
      </div>
    </footer>
  )
}
