import { publicSocket, TeedsSocket } from './client'
import { ATIVOS_PERMITIDOS } from './config'
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
    pipSize: s.pip_size ?? 2,
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
  const pipSize = (res.pip_size as number) ?? 2
  if (!history) return []
  return history.times.map((t, i) => ({
    symbol,
    epoch: t,
    quote: Number(history.prices[i]),
    pipSize,
  }))
}

/** Assina o preco ao vivo de um ativo. Retorna a funcao de cancelamento. */
export function subscribeTicks(
  symbol: string,
  onTick: (tick: Tick) => void,
  socket: TeedsSocket = publicSocket,
): () => void {
  return socket.subscribe({ ticks: symbol }, (msg) => {
    if (msg.error || !msg.tick) return
    const t = msg.tick as Record<string, any>
    onTick({
      symbol: t.symbol ?? symbol,
      quote: Number(t.quote),
      bid: t.bid !== undefined ? Number(t.bid) : undefined,
      ask: t.ask !== undefined ? Number(t.ask) : undefined,
      epoch: t.epoch,
      pipSize: t.pip_size ?? 2,
    })
  })
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

/** Hora do servidor da Deriv (util para alinhar o relogio do grafico). */
export async function fetchServerTime(socket: TeedsSocket = publicSocket): Promise<number> {
  const res = await socket.send({ time: 1 })
  return res.time as number
}
