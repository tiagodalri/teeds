// Deriv falsa para o teste de carga: WebSocket mínimo (sem biblioteca) que
// responde como a API de opções: ticks do R_75 a cada 1 s, histórico,
// compra e liquidação dos contratos. Porta: 9701.
import { createServer } from 'node:http'
import { createHash } from 'node:crypto'

const conexoes = new Set()
let preco = 1000, epoch = Math.floor(Date.now() / 1000), contrato = 1, subId = 1

function quadro(texto) {
  const dados = Buffer.from(texto)
  const n = dados.length
  const cab = n < 126 ? Buffer.from([0x81, n]) : n < 65536 ? Buffer.from([0x81, 126, n >> 8, n & 255]) : Buffer.concat([Buffer.from([0x81, 127, 0, 0, 0, 0]), Buffer.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])])
  return Buffer.concat([cab, dados])
}
function mandar(c, obj) { if (!c.destroyed) c.write(quadro(JSON.stringify(obj))) }

function lerQuadros(c) {
  while (c.buf.length >= 2) {
    const b = c.buf, op = b[0] & 15, mask = b[1] & 128
    let n = b[1] & 127, p = 2
    if (n === 126) { if (b.length < 4) return; n = b.readUInt16BE(2); p = 4 }
    else if (n === 127) { if (b.length < 10) return; n = Number(b.readBigUInt64BE(2)); p = 10 }
    const chave = mask ? b.subarray(p, p + 4) : null; if (mask) p += 4
    if (b.length < p + n) return
    const corpo = Buffer.from(b.subarray(p, p + n)); if (chave) for (let i = 0; i < n; i++) corpo[i] ^= chave[i & 3]
    c.buf = b.subarray(p + n)
    if (op === 8) { c.end(); return }
    if (op === 9) { c.write(Buffer.concat([Buffer.from([0x8a, corpo.length]), corpo])); continue }
    if (op === 1) { try { tratar(c, JSON.parse(corpo.toString())) } catch { /* lixo */ } }
  }
}

function tratar(c, m) {
  const r = m.req_id
  if (m.ping) return mandar(c, { msg_type: 'ping', ping: 'pong', req_id: r })
  if (m.ticks) { const id = String(subId++); c.ticks.add(r); return mandar(c, { msg_type: 'tick', tick: { symbol: m.ticks, quote: preco, epoch, pip_size: 4, id }, subscription: { id }, req_id: r }) }
  if (m.ticks_history) {
    const times = [], prices = []
    for (let i = 60; i > 0; i--) { times.push(epoch - i); prices.push(+(preco + Math.sin(i) * 3).toFixed(4)) }
    return mandar(c, { msg_type: 'history', history: { times, prices }, pip_size: 4, req_id: r })
  }
  if (m.proposal_open_contract && m.subscribe) { const id = String(subId++); c.poc.add({ r, id }); return mandar(c, { msg_type: 'proposal_open_contract', proposal_open_contract: {}, subscription: { id }, req_id: r }) }
  if (m.proposal_open_contract) { const k = c.contratos.get(m.contract_id); return mandar(c, { msg_type: 'proposal_open_contract', proposal_open_contract: k ?? {}, req_id: r }) }
  if (m.buy) {
    const p = m.parameters ?? {}, id = contrato++, valor = Number(p.amount ?? 1), payout = +(valor * 1.9).toFixed(2)
    const k = { contract_id: id, underlying_symbol: p.underlying_symbol, contract_type: p.contract_type, buy_price: valor, payout, currency: p.currency ?? 'USD', status: 'open', is_sold: 0, is_expired: 0, entry_spot: preco, profit: 0, purchase_time: epoch, date_start: epoch, pip_size: 4, barrier: p.barrier }
    c.contratos.set(id, k)
    mandar(c, { msg_type: 'buy', buy: { contract_id: id, transaction_id: id * 7, buy_price: valor, payout, balance_after: 10000, longcode: 'teste', purchase_time: epoch }, req_id: r })
    for (const s of c.poc) mandar(c, { msg_type: 'proposal_open_contract', proposal_open_contract: k, subscription: { id: s.id }, req_id: s.r })
    const espera = Math.max(1, Number(p.duration ?? 1)) * 2000 + 400 // 1 tick do R_75 ≈ 2 s
    setTimeout(() => {
      const ganhou = Math.random() < 0.82
      Object.assign(k, { status: ganhou ? 'won' : 'lost', is_sold: 1, is_expired: 1, exit_spot: preco, current_spot: preco, profit: ganhou ? +(payout - valor).toFixed(2) : -valor, bid_price: ganhou ? payout : 0 })
      for (const s of c.poc) mandar(c, { msg_type: 'proposal_open_contract', proposal_open_contract: k, subscription: { id: s.id }, req_id: s.r })
    }, espera)
    return
  }
  if (m.forget || m.forget_all) return mandar(c, { msg_type: 'forget', forget: 1, req_id: r })
  const tipo = Object.keys(m).find((k) => k !== 'req_id' && k !== 'subscribe') ?? 'x'
  mandar(c, { msg_type: tipo, [tipo]: {}, req_id: r })
}

const srv = createServer((_q, s) => { s.writeHead(200); s.end('deriv falsa') })
srv.on('upgrade', (req, c) => {
  const aceite = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  c.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${aceite}\r\n\r\n`)
  Object.assign(c, { buf: Buffer.alloc(0), ticks: new Set(), poc: new Set(), contratos: new Map() })
  conexoes.add(c)
  c.on('data', (d) => { c.buf = Buffer.concat([c.buf, d]); lerQuadros(c) })
  c.on('close', () => conexoes.delete(c)); c.on('error', () => conexoes.delete(c))
})
setInterval(() => {
  epoch += 2; preco = +(preco + (Math.random() - 0.5) * 4).toFixed(4)
  for (const c of conexoes) for (const r of c.ticks) mandar(c, { msg_type: 'tick', tick: { symbol: 'R_75', quote: preco, epoch, pip_size: 4, enviado: Date.now() }, subscription: { id: 't' }, req_id: r })
}, 2000) // o R_75 de verdade dá um tick a cada 2 s
srv.listen(9701, '127.0.0.1', () => console.log('deriv falsa na 9701'))

// o "Supabase" local: recebe as gravações por HTTPS (TLS de verdade) e responde 201
import { createServer as https } from 'node:https'
import { readFileSync } from 'node:fs'
https({ key: readFileSync(new URL('./chave.pem', import.meta.url)), cert: readFileSync(new URL('./cert.pem', import.meta.url)) }, (q, s) => {
  q.resume(); q.on('end', () => { s.writeHead(201, { 'content-type': 'application/json' }); s.end('[]') })
}).listen(9702, '127.0.0.1')

// as telas dos clientes: N pedidos HTTP, cada um a cada 2 s, ao processo dos robôs
import { Agent, get } from 'node:http'
const TELAS = Number(process.env.TELAS ?? 0)
const agente = new Agent({ keepAlive: true, maxSockets: 64 })
setTimeout(() => {
  for (let i = 0; i < TELAS; i++) setTimeout(() => setInterval(() => {
    get({ host: '127.0.0.1', port: 9703, path: `/estado/${i}`, agent: agente }, (r) => r.resume()).on('error', () => {})
  }, 2000), (i * 37) % 2000)
}, 3000)
