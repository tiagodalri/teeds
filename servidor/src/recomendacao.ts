import { IAS_DA_RECOMENDACAO, MINIMO_DE_TICKS, JANELA_DA_RECOMENDACAO_S, digitosDosPrecos, inicioDaJanela, ordemDaRecomendacao, pedidoDosTicks, type IADaRecomendacao } from '../../src/core/recomendacao'

/**
 * A "I.A. recomendada agora" no servidor (25/11/2026): a MESMA conta do cartão da Início
 * (src/core/recomendacao.ts), com os mesmos 100 ticks que terminam na marca :00/:30.
 * Uma leitura por janela, guardada; a Deriv pública responde em ~1 s.
 */
const PUBLICO = 'wss://api.derivws.com/trading/v1/options/ws/public'

export interface Recomendacao { ia: IADaRecomendacao; segunda: IADaRecomendacao; de: number; ate: number }

let guardada: Recomendacao | null = null
let pedindo: Promise<Recomendacao | null> | null = null

function ticksAte(ateS: number): Promise<{ precos: unknown[]; pip: unknown }> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(PUBLICO)
    const t = setTimeout(() => { try { ws.close() } catch { /* já fechou */ } reject(new Error('a Deriv não respondeu a tempo')) }, 12_000)
    ws.onopen = () => ws.send(JSON.stringify({ ...pedidoDosTicks(ateS), req_id: 1 }))
    ws.onerror = () => { clearTimeout(t); reject(new Error('sem conexão com a Deriv')) }
    ws.onmessage = (ev) => {
      try {
        const r = JSON.parse(String(ev.data))
        if (r.msg_type !== 'history' && !r.error) return
        clearTimeout(t); ws.close()
        if (r.error) return reject(new Error(r.error.message ?? 'a Deriv recusou'))
        resolve({ precos: r.history?.prices ?? [], pip: r.pip_size })
      } catch (e) { clearTimeout(t); ws.close(); reject(e as Error) }
    }
  })
}

/** A recomendação da janela em que estamos (null se a Deriv não respondeu). */
export async function recomendacaoAgora(agora = Date.now()): Promise<Recomendacao | null> {
  const de = inicioDaJanela(agora)
  if (guardada?.de === de) return guardada
  if (pedindo) return pedindo
  pedindo = (async () => {
    try {
      const { precos, pip } = await ticksAte(Math.floor(de / 1000))
      const d = digitosDosPrecos(precos, pip)
      if (d.length < MINIMO_DE_TICKS) return null
      const ordem = ordemDaRecomendacao(d)
      guardada = { ia: ordem[0], segunda: ordem[1], de, ate: de + JANELA_DA_RECOMENDACAO_S * 1000 }
      return guardada
    } catch (e) {
      console.warn(`[recomendacao] não li os ticks: ${(e as Error).message}`)
      return null
    } finally { pedindo = null }
  })()
  return pedindo
}

/** "11h30" no horário de Brasília (o cartão mostra a hora do aparelho; no Brasil dá o mesmo minuto). */
export const horaDeBrasilia = (ms: number) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Sao_Paulo' }).format(ms).replace(':', 'h')

export const IAS_RECOMENDAVEIS = IAS_DA_RECOMENDACAO
