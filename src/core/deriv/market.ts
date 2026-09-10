import { publicSocket, TeedsSocket } from './client'
import { ATIVOS_PERMITIDOS } from './config'
import { casasDecimais } from './types'
import type { ActiveSymbol, Candle, Granularity, Tick } from './types'

/** Lista os ativos negociaveis, ja normalizados para o dominio da Teeds. */
export async function fetchActiveSymbols(
  socket: TeedsSocket = publicSocket,
): Promise<ActiveSymbol[]> {
  const res = await socket.send({ active_symbols: 'brief' })
  const list = (res.active_symbols ?? []) as Array<Record<string, any>>
  const ordem = new Map(ATIVOS_PERMITIDOS.map((c, i) => [c as string, i]))
  return list
    .filter((s) => ordem.has(s.underlying_symbol ?? s.symbol))
    .sort((a, b) =>
      (ordem.get(a.underlying_symbol) ?? 99) - (ordem.get(b.underlying_symbol) ?? 99))
    .map((s) => ({
    symbol: s.underlying_symbol ?? s.symbol,
    name: s.underlying_symbol_name ?? s.display_name ?? s.underlying_symbol,
    market: s.market ?? '',
    submarket: s.submarket ?? '',
    isOpen: s.exchange_is_open === 1,
    isSuspended: s.is_trading_suspended === 1,
    pipSize: casasDecimais(s.pip_size),
  }))
}

/** Busca o historico em candles (OHLC). */
export async function fetchCandles(
  symbol: string,
  granularity: Granularity = 60,
  count = 200,
  socket: TeedsSocket = publicSocket,
): Promise<Candle[]> {
  const res = await socket.send({
    ticks_history: symbol,
    end: 'latest',
    count,
    style: 'candles',
    granularity,
  })
  const raw = (res.candles ?? []) as Array<Record<string, any>>
  return raw.map((c) => ({
    epoch: c.epoch,
    open: Number(c.open),
    high: Number(c.high),
    low: Number(c.low),
    close: Number(c.close),
  }))
}

/** Busca o historico em ticks (linha). */
export async function fetchTickHistory(
  symbol: string,
  count = 500,
  socket: TeedsSocket = publicSocket,
): Promise<Tick[]> {
  const res = await socket.send({
    ticks_history: symbol,
    end: 'latest',
    count,
    style: 'ticks',
  })
  const history = res.history as { times: number[]; prices: number[] } | undefined
  const pipSize = casasDecimais(res.pip_size)
  if (!history) return []
  return history.times.map((t, i) => ({
    symbol,
    epoch: t,
    quote: Number(history.prices[i]),
    pipSize,
  }))
}

/**
 * Central de precos ao vivo.
 *
 * O grafico, o painel de digitos e cada robo querem o mesmo ativo ao mesmo
 * tempo. Sem isso, cada um abriria a sua propria assinatura na Deriv — mais
 * trafego, mais limite consumido e ticks chegando em momentos diferentes.
 * Aqui uma unica assinatura por ativo alimenta todos os interessados, e quem
 * chega depois recebe o ultimo preco na hora, sem esperar o proximo tick.
 */
type Ouvinte = (tick: Tick) => void

interface Canal {
  ouvintes: Set<Ouvinte>
  parar: (() => void) | null
  ultimo: Tick | null
  encerrar: ReturnType<typeof setTimeout> | null
}

const centrais = new WeakMap<TeedsSocket, Map<string, Canal>>()

/** Carencia antes de fechar um canal sem ouvintes (evita liga-desliga ao trocar de aba). */
const CARENCIA_MS = 5_000

function canalDe(socket: TeedsSocket, symbol: string): Canal {
  let mapa = centrais.get(socket)
  if (!mapa) {
    mapa = new Map()
    centrais.set(socket, mapa)
  }
  let canal = mapa.get(symbol)
  if (!canal) {
    canal = { ouvintes: new Set(), parar: null, ultimo: null, encerrar: null }
    mapa.set(symbol, canal)
  }
  return canal
}

/** Assina o preco ao vivo de um ativo. Retorna a funcao de cancelamento. */
export function subscribeTicks(
  symbol: string,
  onTick: Ouvinte,
  socket: TeedsSocket = publicSocket,
): () => void {
  const canal = canalDe(socket, symbol)
  canal.ouvintes.add(onTick)

  if (canal.encerrar) {
    clearTimeout(canal.encerrar)
    canal.encerrar = null
  }

  // Quem chega no meio do caminho ja comeca com o ultimo preco conhecido.
  if (canal.ultimo) {
    const ultimo = canal.ultimo
    queueMicrotask(() => {
      if (canal.ouvintes.has(onTick)) onTick(ultimo)
    })
  }

  if (!canal.parar) {
    canal.parar = socket.subscribe({ ticks: symbol }, (msg) => {
      if (msg.error || !msg.tick) return
      const t = msg.tick as Record<string, any>
      const tick: Tick = {
        symbol: t.symbol ?? symbol,
        quote: Number(t.quote),
        bid: t.bid !== undefined ? Number(t.bid) : undefined,
        ask: t.ask !== undefined ? Number(t.ask) : undefined,
        epoch: t.epoch,
        pipSize: casasDecimais(t.pip_size),
      }
      canal.ultimo = tick
      canal.ouvintes.forEach((fn) => {
        try {
          fn(tick)
        } catch {
          // um ouvinte quebrado nao pode derrubar os outros
        }
      })
    })
  }

  return () => {
    canal.ouvintes.delete(onTick)
    if (canal.ouvintes.size > 0 || canal.encerrar) return
    canal.encerrar = setTimeout(() => {
      canal.encerrar = null
      if (canal.ouvintes.size > 0) return
      canal.parar?.()
      canal.parar = null
      canal.ultimo = null
      centrais.get(socket)?.delete(symbol)
    }, CARENCIA_MS)
  }
}

/** Ultimo preco ja recebido de um ativo, se houver. */
export function ultimoPreco(symbol: string, socket: TeedsSocket = publicSocket): Tick | null {
  return centrais.get(socket)?.get(symbol)?.ultimo ?? null
}

/**
 * Assina candles ao vivo. A primeira mensagem traz o historico completo;
 * as seguintes atualizam apenas o candle corrente (msg_type "ohlc").
 */
export function subscribeCandles(
  symbol: string,
  granularity: Granularity,
  onHistory: (candles: Candle[]) => void,
  onUpdate: (candle: Candle) => void,
  count = 200,
  socket: TeedsSocket = publicSocket,
): () => void {
  return socket.subscribe(
    { ticks_history: symbol, end: 'latest', count, style: 'candles', granularity },
    (msg) => {
      if (msg.error) return
      if (msg.msg_type === 'candles') {
        const raw = (msg.candles ?? []) as Array<Record<string, any>>
        onHistory(
          raw.map((c) => ({
            epoch: c.epoch,
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
          })),
        )
      } else if (msg.msg_type === 'ohlc') {
        const o = msg.ohlc as Record<string, any>
        onUpdate({
          epoch: Number(o.open_time ?? o.epoch),
          open: Number(o.open),
          high: Number(o.high),
          low: Number(o.low),
          close: Number(o.close),
        })
      }
    },
  )
}

/**
 * Ate onde vai a duracao de um Subir/Descer neste ativo, segundo a Deriv.
 *
 * A tela oferecia so "minutos", sem teto, e o que a Deriv recusava virava
 * um "indisponivel" mudo. A propria API diz o que aceita (`contracts_for`):
 * no Volatility 75 (1s), por exemplo, 1 a 10 ticks, 15 segundos a 1 dia.
 * `null` numa faixa significa que aquela unidade nao existe para o ativo.
 */
export interface LimitesDuracao {
  ticks: [number, number] | null
  segundos: [number, number] | null
  minutos: [number, number] | null
}

export const LIMITES_PADRAO: LimitesDuracao = {
  ticks: [1, 10], segundos: [15, 86_400], minutos: [1, 1_440],
}

function emSegundos(texto: unknown): number | null {
  const m = /^(\d+)([smhd])$/.exec(String(texto ?? ''))
  if (!m) return null
  const n = Number(m[1])
  return { s: n, m: n * 60, h: n * 3600, d: n * 86_400 }[m[2] as 's' | 'm' | 'h' | 'd']
}

export async function fetchLimitesSubirDescer(
  symbol: string,
  socket: TeedsSocket = publicSocket,
): Promise<LimitesDuracao> {
  const res = await socket.send({ contracts_for: symbol })
  const lista = ((res.contracts_for as any)?.available ?? []) as Array<Record<string, any>>
  const limites: LimitesDuracao = { ticks: null, segundos: null, minutos: null }
  for (const a of lista) {
    if (a.contract_type !== 'CALL') continue
    if (a.expiry_type === 'tick') {
      const mi = Number(String(a.min_contract_duration).replace('t', ''))
      const ma = Number(String(a.max_contract_duration).replace('t', ''))
      if (mi > 0 && ma >= mi) limites.ticks = [mi, ma]
    } else if (a.expiry_type === 'intraday') {
      const mi = emSegundos(a.min_contract_duration)
      const ma = emSegundos(a.max_contract_duration)
      if (mi !== null && ma !== null && ma >= mi) {
        limites.segundos = [mi, ma]
        limites.minutos = [Math.max(1, Math.ceil(mi / 60)), Math.max(1, Math.floor(ma / 60))]
      }
    }
  }
  return limites
}

/** Hora do servidor da Deriv (util para alinhar o relogio do grafico). */
export async function fetchServerTime(socket: TeedsSocket = publicSocket): Promise<number> {
  const res = await socket.send({ time: 1 })
  return res.time as number
}
