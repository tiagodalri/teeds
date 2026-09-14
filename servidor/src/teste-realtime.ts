/**
 * Provas do cliente Realtime mínimo (src/core/teeds/realtime.ts) contra um
 * transporte SIMULADO — um WebSocket de mentira que registra o que o
 * cliente manda e devolve o que a prova quiser.
 *
 *   cd servidor && npm run realtime
 *
 * O que fica provado: formato do phx_join (postgres_changes + access_token),
 * confirmação de assinatura antes de "ao vivo", heartbeat com ref e RTT,
 * reconexão com backoff e jitter quando a conexão cai ou silencia,
 * token expirado vira estado próprio (não fica fingindo ao vivo),
 * troca de token pelo canal, phx_leave e limpeza no fechar (sem eventos de
 * um socket antigo), deduplicação de entrega, e que duas assinaturas
 * (StrictMode monta/desmonta) não deixam socket sobrando.
 *
 * O que NÃO fica provado: a compatibilidade com o servidor Realtime real
 * da Supabase. Este transporte segue a documentação pública e o
 * realtime-js; a confirmação em ambiente real está pendente
 * (MONITORAMENTO.md, "Limitações").
 */
import { assinarMudancas, type EstadoDoCanal, type MudancaDeLinha } from '../../src/core/teeds/realtime'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) certos++
  else { errados++; console.error(`✕ ${nome}\n   esperava ${JSON.stringify(esperado)}\n   veio     ${JSON.stringify(deu)}`) }
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Um WebSocket de mentira. */
class SocketFalso {
  static abertos: SocketFalso[] = []
  static criados = 0
  readyState = 0
  enviados: any[] = []
  onopen: ((e: any) => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null
  constructor(readonly url: string) { SocketFalso.criados += 1; SocketFalso.abertos.push(this) }
  abrir() { this.readyState = 1; this.onopen?.({}) }
  send(s: string) { this.enviados.push(JSON.parse(s)) }
  receber(m: any) { this.onmessage?.({ data: JSON.stringify(m) }) }
  close() { if (this.readyState === 3) return; this.readyState = 3; SocketFalso.abertos = SocketFalso.abertos.filter((s) => s !== this); this.onclose?.({}) }
  cair() { this.close() }
  ultimo(evento: string) { return [...this.enviados].reverse().find((m) => m.event === evento) }
  /** Confirma o join do jeito que o servidor Phoenix confirma. */
  confirmarJoin() { const j = this.ultimo('phx_join'); this.receber({ topic: j.topic, event: 'phx_reply', ref: j.ref, payload: { status: 'ok', response: { postgres_changes: [] } } }) }
}

function montar(extra: Partial<Parameters<typeof assinarMudancas>[0]> = {}) {
  const estados: Array<[EstadoDoCanal, string | undefined]> = []
  const mudancas: MudancaDeLinha[] = []
  const rtts: number[] = []
  let relogio = 1_000_000
  const assinatura = assinarMudancas({
    token: 'tok-1', canal: 'monitor-teeds-x',
    tabelas: [{ tabela: 'pulsos_robos_ao_vivo', filtro: 'marca=eq.teeds' }, { tabela: 'eventos_robos_ao_vivo', evento: 'INSERT' }],
    aoMudar: (m) => mudancas.push(m), aoEstado: (e, d) => estados.push([e, d]), aoRtt: (ms) => rtts.push(ms),
    criarSocket: (url) => new SocketFalso(url) as unknown as WebSocket,
    agora: () => relogio, batimentoMs: 30, silencioMaximoMs: 100,
    ...extra,
  })
  return { assinatura, estados, mudancas, rtts, avancar: (ms: number) => { relogio += ms }, socket: () => SocketFalso.abertos[SocketFalso.abertos.length - 1] }
}

async function provas() {
  /* 1. join no formato do protocolo, e "ao vivo" só depois da confirmação */
  {
    SocketFalso.abertos = []; SocketFalso.criados = 0
    const t = montar()
    const ws = t.socket()
    conferir('R1 URL do Realtime com apikey e vsn', /\/realtime\/v1\/websocket\?apikey=.+&vsn=1\.0\.0$/.test(ws.url) && ws.url.startsWith('wss://'), true)
    conferir('R1b estado inicial: conectando', t.estados[0]?.[0], 'conectando')
    ws.abrir()
    const join = ws.ultimo('phx_join')
    conferir('R1c phx_join com tópico, ref = join_ref, access_token e postgres_changes', [join.topic, join.ref === join.join_ref, join.payload.access_token, join.payload.config.postgres_changes], ['realtime:monitor-teeds-x', true, 'tok-1', [{ event: '*', schema: 'public', table: 'pulsos_robos_ao_vivo', filter: 'marca=eq.teeds' }, { event: 'INSERT', schema: 'public', table: 'eventos_robos_ao_vivo' }]])
    conferir('R1d antes da confirmação NÃO está ao vivo', t.assinatura.aoVivo(), false)
    ws.confirmarJoin()
    conferir('R1e depois da confirmação está ao vivo', [t.assinatura.aoVivo(), t.estados[t.estados.length - 1][0]], [true, 'ao-vivo'])
    /* 2. mudança entregue e deduplicada */
    const mudanca = { topic: 'realtime:monitor-teeds-x', event: 'postgres_changes', payload: { ids: [1], data: { type: 'UPDATE', table: 'pulsos_robos_ao_vivo', schema: 'public', commit_timestamp: '2026-09-14T10:00:00Z', record: { sessao_id: 'a', seq: 7, pulso: {} }, old_record: null } } }
    ws.receber(mudanca); ws.receber(mudanca)
    conferir('R2 mudança entregue uma vez só (dedupe) e no formato interno', [t.mudancas.length, t.mudancas[0].tipo, t.mudancas[0].tabela, t.mudancas[0].linha.seq, t.mudancas[0].confirmadaEm], [1, 'UPDATE', 'pulsos_robos_ao_vivo', 7, '2026-09-14T10:00:00Z'])
    ws.receber({ ...mudanca, payload: { ...mudanca.payload, data: { ...mudanca.payload.data, record: { sessao_id: 'a', seq: 8, pulso: {} } } } })
    conferir('R2b seq diferente é outra mudança', t.mudancas.length, 2)
    ws.receber({ topic: 'realtime:outro', event: 'postgres_changes', payload: { data: { type: 'INSERT', table: 'x', record: {} } } })
    conferir('R2c mensagem de outro tópico é ignorada', t.mudancas.length, 2)
    ws.receber({ data: 'lixo' }); ws.onmessage?.({ data: 'não é json' })
    conferir('R2d lixo não derruba o cliente', t.assinatura.aoVivo(), true)
    /* 3. heartbeat com ref e RTT */
    await dormir(40)
    const hb = ws.ultimo('heartbeat')
    conferir('R3 heartbeat no tópico phoenix com ref', [hb?.topic, typeof hb?.ref], ['phoenix', 'string'])
    t.avancar(180)
    ws.receber({ topic: 'phoenix', event: 'phx_reply', ref: hb.ref, payload: { status: 'ok', response: {} } })
    conferir('R3b RTT medido pela resposta do heartbeat (180 ms)', t.rtts, [180])
    /* 4. troca de token pelo canal */
    t.assinatura.atualizarToken('tok-2')
    const at = ws.ultimo('access_token')
    conferir('R4 access_token enviado no tópico do canal com o novo token', [at.topic, at.payload.access_token, at.join_ref === join.ref], ['realtime:monitor-teeds-x', 'tok-2', true])
    /* 5. queda → reconectando com backoff; novo socket; ao vivo só após novo join */
    const antes = SocketFalso.criados
    ws.cair()
    conferir('R5 queda vira "reconectando" e sai do ao vivo', [t.estados[t.estados.length - 1][0], t.assinatura.aoVivo()], ['reconectando', false])
    await dormir(1600)   // backoff 1 s ± 50 %
    conferir('R5b um socket novo foi criado depois do backoff', SocketFalso.criados, antes + 1)
    const ws2 = t.socket()
    ws2.abrir()
    conferir('R5c ainda não está ao vivo antes de o join ser confirmado', t.assinatura.aoVivo(), false)
    ws2.confirmarJoin()
    conferir('R5d ao vivo de novo após confirmação; o novo join leva o token renovado', [t.assinatura.aoVivo(), ws2.ultimo('phx_join').payload.access_token], [true, 'tok-2'])
    /* 6. socket antigo não entrega mais nada */
    ws.receber(mudanca)
    conferir('R6 mensagem de socket antigo é descartada', t.mudancas.length, 2)
    /* 7. silêncio → religa */
    const criadosAntes = SocketFalso.criados
    t.avancar(200)   // além de silencioMaximoMs (100)
    await dormir(45)
    conferir('R7 silêncio prolongado fecha e agenda religação', [t.estados[t.estados.length - 1][0], t.estados[t.estados.length - 1][1]], ['reconectando', 'sem resposta do servidor'])
    await dormir(1600)
    conferir('R7b religou após o backoff', SocketFalso.criados, criadosAntes + 1)
    /* 8. fechar: phx_leave, socket fechado, sem sobras */
    const ws3 = t.socket(); ws3.abrir(); ws3.confirmarJoin()
    t.assinatura.fechar()
    conferir('R8 fechar manda phx_leave, fecha o socket e vira "fechado"', [ws3.ultimo('phx_leave')?.event, ws3.readyState, t.estados[t.estados.length - 1][0], SocketFalso.abertos.length], ['phx_leave', 3, 'fechado', 0])
    const criadosDepois = SocketFalso.criados
    await dormir(1700)
    conferir('R8b depois de fechado, nada religa nem bate', [SocketFalso.criados, t.assinatura.aoVivo()], [criadosDepois, false])
  }
  /* 9. token expirado no join → estado próprio, sem fingir ao vivo, sem loop de reconexão */
  {
    SocketFalso.abertos = []; SocketFalso.criados = 0
    const t = montar()
    const ws = t.socket(); ws.abrir()
    const j = ws.ultimo('phx_join')
    ws.receber({ topic: j.topic, event: 'phx_reply', ref: j.ref, payload: { status: 'error', response: { reason: 'InvalidJWTToken: Token has expired' } } })
    conferir('R9 token expirado vira estado "token-expirado", não ao vivo', [t.estados[t.estados.length - 1][0], t.assinatura.aoVivo()], ['token-expirado', false])
    const criados = SocketFalso.criados
    await dormir(1600)
    conferir('R9b não fica reconectando em loop com token vencido', SocketFalso.criados, criados)
    ws.receber({ topic: j.topic, event: 'system', payload: { status: 'error', message: 'Unauthorized' } })
    conferir('R9c erro de sistema por autorização também vira token-expirado', t.estados[t.estados.length - 1][0], 'token-expirado')
    t.assinatura.fechar()
  }
  /* 10. join recusado por outro motivo → religa com backoff */
  {
    SocketFalso.abertos = []; SocketFalso.criados = 0
    const t = montar()
    const ws = t.socket(); ws.abrir()
    const j = ws.ultimo('phx_join')
    ws.receber({ topic: j.topic, event: 'phx_reply', ref: j.ref, payload: { status: 'error', response: { reason: 'Unable to subscribe' } } })
    conferir('R10 assinatura recusada → reconectando', t.estados[t.estados.length - 1][0], 'reconectando')
    await dormir(1600)
    conferir('R10b criou socket novo', SocketFalso.criados, 2)
    t.assinatura.fechar()
  }
  /* 11. StrictMode: monta, desmonta, monta de novo — só um socket vivo */
  {
    SocketFalso.abertos = []; SocketFalso.criados = 0
    const a = montar(); a.assinatura.fechar()
    const b = montar()
    conferir('R11 duas montagens seguidas (StrictMode) deixam exatamente um socket aberto', SocketFalso.abertos.length, 1)
    b.assinatura.fechar()
    conferir('R11b depois do fechar não sobra socket', SocketFalso.abertos.length, 0)
    b.assinatura.fechar()
    conferir('R11c fechar duas vezes é inofensivo', b.estados.filter((e) => e[0] === 'fechado').length, 1)
  }
  /* 12. backoff cresce entre quedas seguidas e tem jitter */
  {
    SocketFalso.abertos = []; SocketFalso.criados = 0
    const t = montar()
    const esperas: number[] = []
    let ultimo = Date.now()
    for (let i = 0; i < 3; i++) {
      // Só a primeira assinatura é confirmada; as quedas seguintes acontecem antes do join (o backoff cresce).
      const ws = t.socket(); ws.abrir(); if (i === 0) ws.confirmarJoin()
      ultimo = Date.now(); ws.cair()
      const criados = SocketFalso.criados
      while (SocketFalso.criados === criados) await dormir(20)
      esperas.push(Date.now() - ultimo)
    }
    conferir('R12 backoff: 1ª religação em 0,5–1,5 s, 2ª em 1–3 s, 3ª em 2–6 s (com jitter)', [esperas[0] >= 450 && esperas[0] <= 1600, esperas[1] >= 950 && esperas[1] <= 3100, esperas[2] >= 1950 && esperas[2] <= 6100], [true, true, true])
    t.assinatura.fechar()
  }
}

provas().then(() => {
  console.log(`\n${certos} certos, ${errados} errados`)
  process.exit(errados ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(1) })
