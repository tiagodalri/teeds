/**
 * O seletor de período da Visão geral (11/11/2026, Tiago: "eu gostaria que mostrasse em tempo real, mas
 * também gostaria de ter a opção de selecionar período, sabe? Período personalizado etc.").
 *
 * Agora (tempo real) é o painel de sempre. Os outros atalhos (Hoje, Ontem, 7 dias, 30 dias, Este mês) e o
 * Personalizado (data e hora de início e de fim) trocam só os blocos de período: markup, operações e
 * resultado, depósitos e saques, pessoas que operaram. O bloco Ao vivo, o dinheiro dos clientes e as maiores
 * bancas continuam sendo o retrato de agora.
 *
 * Tudo no horário de Brasília (o mesmo dia da contagem de markup), não no relógio do aparelho. O Brasil não
 * tem horário de verão desde 2019, então Brasília é sempre UTC−3. Mesmo jeito do filtro das Sessões
 * encerradas (PeriodoDasEncerradas.tsx): atalhos num grupo só e, no Personalizado, os campos logo abaixo.
 */
import type { SessaoTeeds } from '../../core/teeds/conta'
import { SUPABASE } from '../../core/teeds/config'
import './periodo-visao-geral.css'

/** Os blocos de período (11/11/2026): o mesmo markup de sempre (teeds_markup_operacoes), entre dois instantes. */
export interface PainelPeriodo {
  escala: 'hora' | 'dia'
  markup: { total: number; ia: number; manual: number; ultima_em: string | null }
  operacoes: { total: number; ia: number; manual: number; volume: number; resultado: number; operaram: number }
  /** Cada hora (até 48 h) ou cada dia do período, 'aaaa-mm-ddThh:mm' em Brasília. */
  serie: Array<{ ini: string; markup: number; operacoes: number }>
  dinheiro: { depositos: number; saques: number; qtd_depositos: number; qtd_saques: number; depositantes: number; sacaram: number }
}

export async function lerPeriodo(sessao: SessaoTeeds, marca: string, parceiro: string, de: number, ate: number): Promise<PainelPeriodo> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_painel_periodo`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: marca, p_de: new Date(de).toISOString(), p_ate: new Date(ate).toISOString(), p_parceiro: parceiro || null }),
  })
  if (!r.ok) throw new Error('Não foi possível ler os números desse período agora.')
  return r.json()
}

export type AtalhoDoPeriodo = 'agora' | 'hoje' | 'ontem' | '7' | '30' | 'mes' | 'personalizado'
export interface PeriodoDaVisao {
  atalho: AtalhoDoPeriodo
  /** Só no Personalizado: 'aaaa-mm-dd' e 'hh:mm', em Brasília. O minuto do fim entra inteiro. */
  de: string
  horaDe: string
  ate: string
  horaAte: string
}
export const PERIODO_AGORA: PeriodoDaVisao = { atalho: 'agora', de: '', horaDe: '00:00', ate: '', horaAte: '23:59' }

/** O intervalo pedido ao banco: [de, ate) em milissegundos. */
export interface JanelaDoPeriodo {
  de: number
  ate: number
  /** O período chega até agora: os números continuam se atualizando sozinhos. */
  aoVivo: boolean
  /** "Ontem, 10/11" — o que está na tela, em palavras. */
  rotulo: string
  /** "Ontem" — para o título dos cartões. */
  curto: string
}

const FUSO = 'America/Sao_Paulo'
const fmtDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' })
/** 'aaaa-mm-dd' do dia de Brasília de um instante. */
export const diaDeBrasilia = (ms = Date.now()) => fmtDia.format(ms)
/** O instante em que um dia de Brasília começa (ou uma hora dele). */
export const instanteEmBrasilia = (dia: string, hora = '00:00') => Date.parse(`${dia}T${hora}:00-03:00`)
export const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
/** 'aaaa-mm-dd' → 'dd/mm'. */
export const ddmm = (dia: string) => (dia ? `${dia.slice(8, 10)}/${dia.slice(5, 7)}` : '')
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

/** A janela de um período (null em Agora). Recalculada a cada leitura: "Hoje" anda junto com o relógio. */
export function janelaDoPeriodo(p: PeriodoDaVisao, agora = Date.now()): JanelaDoPeriodo | null {
  const hoje = diaDeBrasilia(agora)
  const ini = (dia: string) => instanteEmBrasilia(dia)
  switch (p.atalho) {
    case 'agora': return null
    case 'hoje': return { de: ini(hoje), ate: agora, aoVivo: true, rotulo: `Hoje, ${ddmm(hoje)}`, curto: 'Hoje' }
    case 'ontem': {
      const ontem = somarDias(hoje, -1)
      return { de: ini(ontem), ate: ini(hoje), aoVivo: false, rotulo: `Ontem, ${ddmm(ontem)}`, curto: 'Ontem' }
    }
    case '7':
    case '30': {
      const n = Number(p.atalho), de = somarDias(hoje, -(n - 1))
      return { de: ini(de), ate: agora, aoVivo: true, rotulo: `Últimos ${n} dias, de ${ddmm(de)} a ${ddmm(hoje)}`, curto: `${n} dias` }
    }
    case 'mes': {
      const de = `${hoje.slice(0, 8)}01`, mes = MESES[Number(hoje.slice(5, 7)) - 1]
      return { de: ini(de), ate: agora, aoVivo: true, rotulo: `${mes}, de ${ddmm(de)} a ${ddmm(hoje)}`, curto: mes }
    }
    case 'personalizado': {
      const dDe = p.de || somarDias(hoje, -6), dAte = p.ate || hoje
      let a = instanteEmBrasilia(dDe, p.horaDe || '00:00')
      let b = instanteEmBrasilia(dAte, p.horaAte || '23:59') + 60_000
      let txtA = `${ddmm(dDe)}, ${p.horaDe || '00:00'}`, txtB = `${ddmm(dAte)}, ${p.horaAte || '23:59'}`
      if (!Number.isFinite(a) || !Number.isFinite(b)) { a = ini(hoje); b = agora }
      if (b < a) { [a, b] = [b - 60_000, a + 60_000]; [txtA, txtB] = [txtB, txtA] }
      return { de: a, ate: b, aoVivo: b > agora, rotulo: `De ${txtA} a ${txtB}`, curto: 'No período' }
    }
  }
}

const ATALHOS: Array<[AtalhoDoPeriodo, string]> = [
  ['agora', 'Agora'], ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7', '7 dias'], ['30', '30 dias'], ['mes', 'Este mês'], ['personalizado', 'Personalizado'],
]

export function SeletorDePeriodo({ valor, onTrocar, janela }: {
  valor: PeriodoDaVisao
  onTrocar: (p: PeriodoDaVisao) => void
  janela: JanelaDoPeriodo | null
}) {
  const hoje = diaDeBrasilia()
  const p = valor
  const escolher = (atalho: AtalhoDoPeriodo) => onTrocar(atalho === 'personalizado'
    ? { ...p, atalho, de: p.de || somarDias(hoje, -6), ate: p.ate || hoje, horaDe: p.horaDe || '00:00', horaAte: p.horaAte || '23:59' }
    : { ...p, atalho })
  return (
    <div className="vgp">
      <div className="vgp-linha">
        <span className="vgp-rot" id="vgp-rot">Período</span>
        <div className="vgp-atalhos" role="group" aria-labelledby="vgp-rot">
          {ATALHOS.map(([id, texto]) => (
            <button key={id} type="button" aria-pressed={p.atalho === id} className={`${p.atalho === id ? 'on' : ''}${id === 'agora' ? ' vgp-agora' : ''}`} onClick={() => escolher(id)}>
              {id === 'agora' && <i aria-hidden="true" />}{texto}
            </button>
          ))}
        </div>
      </div>
      {p.atalho === 'personalizado' && (
        <div className="vgp-datas">
          <div className="vgp-campo" role="group" aria-label="Início">
            <span>Início</span>
            <input type="date" value={p.de} max={hoje} onChange={(e) => e.target.value && onTrocar({ ...p, de: e.target.value })} aria-label="Dia do início" />
            <input type="time" value={p.horaDe} onChange={(e) => e.target.value && onTrocar({ ...p, horaDe: e.target.value })} aria-label="Hora do início" />
          </div>
          <div className="vgp-campo" role="group" aria-label="Fim">
            <span>Fim</span>
            <input type="date" value={p.ate} max={hoje} onChange={(e) => e.target.value && onTrocar({ ...p, ate: e.target.value })} aria-label="Dia do fim" />
            <input type="time" value={p.horaAte} onChange={(e) => e.target.value && onTrocar({ ...p, horaAte: e.target.value })} aria-label="Hora do fim" />
          </div>
        </div>
      )}
      <p className="vgp-leg" aria-live="polite">
        {janela
          ? <><b>{janela.rotulo}</b> · horário de Brasília{janela.aoVivo ? ' · atualiza sozinho' : ''}. O Ao vivo, o dinheiro dos clientes e as maiores bancas continuam mostrando o momento de agora.</>
          : <><b>Tempo real</b> · os números se atualizam sozinhos a cada 15 segundos.</>}
      </p>
    </div>
  )
}
