/**
 * Série de estreias (27/11/2026).
 *
 * Pedido do Victor, repassado pelo Tiago: "soltar um vídeo por dia", sempre às
 * 19h, começando pela Raptor, com aviso a todos os alunos "pra gerar aquela
 * expectativa". Na grade, um módulo com `serie: true`; cada aula tem a sua
 * data de liberação (liberarEm). Aqui ficam as contas de calendário (sempre
 * no horário de Brasília) e o pedido para a sala abrir uma aula específica.
 */
import { useEffect, useState } from 'react'
import type { Aula, Modulo } from './aulas'
import { MARCA } from '../../marca'

const FUSO = 'America/Sao_Paulo'
const diaDe = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: FUSO })
const horaDe = (ms: number) => {
  const [h, m] = new Date(ms).toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit' }).split(':')
  return m === '00' ? `${+h}h` : `${+h}h${m}`
}
const DIA = 86_400_000

/** "Hoje, 19h" / "Amanhã, 19h" / "Domingo, 19h" / "05/12, 19h". */
export function quandoEstreia(iso: string, agora = Date.now()): { dia: string; hora: string; hoje: boolean; amanha: boolean } {
  const ms = Date.parse(iso)
  const hoje = diaDe(ms) === diaDe(agora)
  const amanha = diaDe(ms) === diaDe(agora + DIA)
  const semana = ms - agora < 6 * DIA
  const nome = new Date(ms).toLocaleDateString('pt-BR', { timeZone: FUSO, weekday: 'long' }).split('-')[0]
  const dia = hoje ? 'Hoje' : amanha ? 'Amanhã' : semana ? nome.charAt(0).toUpperCase() + nome.slice(1)
    : new Date(ms).toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit' })
  return { dia, hora: horaDe(ms), hoje, amanha }
}

/** 7:45:12 → "07:45:12"; até 2 dias as horas passam de 24 ("31:10:00"); mais que isso, "3 dias". */
export function contagem(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s >= 48 * 3600) return `${Math.ceil(s / 86400)} dias`
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(h)}:${p(m)}:${p(x)}`
}

/** Um relógio que redesenha a cada `ms` (só enquanto `ligado`). */
export function useAgora(ms = 1000, ligado = true): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    if (!ligado) return
    setAgora(Date.now())
    const t = setInterval(() => setAgora(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms, ligado])
  return agora
}

export interface EstreiaDoDia { aula: Aula; modulo: Modulo; episodio: number; total: number; fase: 'antes' | 'no-ar'; liberaEm: number }

/**
 * A estreia de hoje (horário de Brasília) numa série, se houver: antes do horário, 'antes';
 * depois, 'no-ar' até a meia-noite. Os módulos são os da sala (modulosParaSala).
 */
export function estreiaDeHoje(modulos: Modulo[], agora = Date.now()): EstreiaDoDia | null {
  for (const m of modulos) {
    if (!m.serie) continue
    for (const [i, a] of m.aulas.entries()) {
      if (!a.liberarEm) continue
      const ms = Date.parse(a.liberarEm)
      if (!Number.isFinite(ms) || diaDe(ms) !== diaDe(agora)) continue
      return { aula: a, modulo: m, episodio: i + 1, total: m.aulas.length, fase: ms > agora ? 'antes' : 'no-ar', liberaEm: ms }
    }
  }
  return null
}

/** A próxima liberação (ms) de qualquer aula com data futura, para a sala se redesenhar na hora. */
export function proximaLiberacao(modulos: Modulo[], agora = Date.now()): number | null {
  let menor: number | null = null
  for (const m of modulos) for (const a of m.aulas) {
    const ms = a.liberarEm ? Date.parse(a.liberarEm) : NaN
    if (Number.isFinite(ms) && ms > agora && (menor === null || ms < menor)) menor = ms
  }
  return menor
}

/* ------------------------------------- pedir para a sala abrir uma aula */

const CHAVE_PEDIDO = `${MARCA.id}.aulas.abrir`
const EVENTO = 'teeds:abrir-aula'
/** Pede para a sala de aulas abrir esta aula (agora, se já estiver aberta; senão, ao montar). */
export function pedirAula(id: string): void {
  try { sessionStorage.setItem(CHAVE_PEDIDO, id) } catch { /* só o evento */ }
  window.dispatchEvent(new CustomEvent(EVENTO, { detail: id }))
}
/** Lê (e apaga) o pedido guardado. */
export function aulaPedida(): string | null {
  try { const id = sessionStorage.getItem(CHAVE_PEDIDO); if (id) sessionStorage.removeItem(CHAVE_PEDIDO); return id } catch { return null }
}
export function aoPedirAula(fn: (id: string) => void): () => void {
  const h = (e: Event) => { try { sessionStorage.removeItem(CHAVE_PEDIDO) } catch { /* ok */ } fn((e as CustomEvent<string>).detail) }
  window.addEventListener(EVENTO, h)
  return () => window.removeEventListener(EVENTO, h)
}

/* ------------------------------------------------ lembrete na agenda */

const ics = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
/**
 * Baixa um .ics com a estreia e um alarme 10 min antes. No iPhone sem o app instalado (sem
 * notificação), é o jeito de a pessoa ser lembrada; no Android/computador abre a agenda.
 */
export function baixarLembrete({ id, titulo, quando }: { id: string; titulo: string; quando: number }): void {
  const link = `${location.origin}/?tela=aulas`
  const texto = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${MARCA.prosa}//Estreias//PT`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${id}-${quando}@${location.hostname}`, `DTSTAMP:${ics(Date.now())}`,
    `DTSTART:${ics(quando)}`, `DTEND:${ics(quando + 30 * 60_000)}`,
    `SUMMARY:${titulo.replace(/[,;]/g, (c) => `\\${c}`)}`, `DESCRIPTION:A aula é liberada na área de Aulas: ${link}`, `URL:${link}`,
    'BEGIN:VALARM', 'TRIGGER:-PT10M', 'ACTION:DISPLAY', 'DESCRIPTION:A aula começa em 10 minutos', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/calendar;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url; a.download = `estreia-${id}.ics`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
