/**
 * Um cliente mínimo do Supabase Realtime, sem biblioteca.
 *
 * O resto da plataforma fala com o Supabase por REST puro, sem
 * `@supabase/supabase-js`, e o bundle do cliente não pode engordar por causa
 * de uma tela que só o admin abre. Então este arquivo fala o protocolo do
 * Phoenix (vsn 1.0.0, mensagens JSON `{topic,event,payload,ref,join_ref}`)
 * diretamente: entra num canal, pede as mudanças de umas tabelas, bate o
 * coração a cada 25 s medindo o tempo de ida e volta, e reconecta sozinho
 * com backoff e jitter quando cai.
 *
 * A segurança não mora aqui: o Realtime aplica a RLS do banco ao token que
 * vai no `access_token`. Quem não é admin da marca não recebe linha nenhuma.
 *
 * O que NÃO está provado sem ambiente: a compatibilidade exata com o
 * servidor Realtime de produção (nomes de evento, formato do phx_reply).
 * O formato aqui segue a documentação pública e o `realtime-js` oficial;
 * ver MONITORAMENTO.md, "Limitações".
 */

import { SUPABASE } from './config'

export interface MudancaDeLinha {
  tipo: 'INSERT' | 'UPDATE' | 'DELETE'
  tabela: string
  linha: Record<string, any>
  antiga: Record<string, any> | null
  /** Quando o banco confirmou a escrita (ISO). */
  confirmadaEm: string
}

export type EstadoDoCanal = 'conectando' | 'ao-vivo' | 'reconectando' | 'token-expirado' | 'fechado'

export interface AssinaturaRealtime {
  fechar: () => void
  /** O token renovou: manda o novo para o canal sem reconectar. */
  atualizarToken: (token: string) => void
  /** Está aberto e inscrito agora? */
  aoVivo: () => boolean
}

interface Opcoes {
  token: string
  /** Nome do canal — precisa ser único por assinatura na página. */
  canal: string
  tabelas: Array<{ tabela: string; filtro?: string; evento?: '*' | 'INSERT' | 'UPDATE' | 'DELETE' }>
  aoMudar: (m: MudancaDeLinha) => void
  aoEstado?: (estado: EstadoDoCanal, detalhe?: string) => void
  /** Cada batimento respondido informa o RTT medido, em ms. */
  aoRtt?: (rttMs: number) => void
  /** Injetáveis para o teste: fábrica de socket e relógio. */
  criarSocket?: (url: string) => WebSocket
  agora?: () => number
  batimentoMs?: number
  silencioMaximoMs?: number
}

const BATIMENTO_MS = 25_000
const SILENCIO_MAXIMO_MS = 65_000

export function assinarMudancas(op: Opcoes): AssinaturaRealtime {
  let ws: WebSocket | null = null
  let vivo = true
  let inscrito = false
  let token = op.token
  let ref = 0
  let joinRef = ''
  let batimento: ReturnType<typeof setInterval> | null = null
  let ultimoSinal = 0
  let tentativas = 0
  let religando: ReturnType<typeof setTimeout> | null = null
  const batimentosEmVoo = new Map<string, number>()
  const vistos = new Set<string>()
  const topico = `realtime:${op.canal}`
  const agora = () => op.agora?.() ?? Date.now()
  const batimentoMs = op.batimentoMs ?? BATIMENTO_MS
  const silencioMaximoMs = op.silencioMaximoMs ?? SILENCIO_MAXIMO_MS

  const estado = (e: EstadoDoCanal, d?: string) => { try { op.aoEstado?.(e, d) } catch { /* a tela decide */ } }
  const mandar = (msg: Record<string, unknown>) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)) }

  const entrar = () => {
    ref += 1; joinRef = String(ref)
    mandar({
      topic: topico, event: 'phx_join', ref: joinRef, join_ref: joinRef,
      payload: {
        config: {
          broadcast: { self: false }, presence: { key: '' },
          postgres_changes: op.tabelas.map((t) => ({ event: t.evento ?? '*', schema: 'public', table: t.tabela, filter: t.filtro })),
        },
        access_token: token,
      },
    })
  }

  const ligar = () => {
    if (!vivo) return
    inscrito = false
    estado(tentativas ? 'reconectando' : 'conectando')
    const url = `${SUPABASE.url.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE.anonKey)}&vsn=1.0.0`
    // O relógio do silêncio recomeça na tentativa: um socket ainda abrindo não é "silêncio" do servidor.
    ultimoSinal = agora()
    try { ws = op.criarSocket ? op.criarSocket(url) : new WebSocket(url) } catch (e) { agendarReligar((e as Error).message); return }
    const socket = ws
    socket.onopen = () => { if (socket !== ws) return; ultimoSinal = agora(); entrar() }
    socket.onmessage = (ev) => {
      if (socket !== ws) return   // mensagem de um socket antigo, já descartado
      ultimoSinal = agora()
      let msg: any
      try { msg = JSON.parse(ev.data) } catch { return }
      if (msg.event === 'phx_reply') {
        if (msg.topic === 'phoenix' && batimentosEmVoo.has(msg.ref)) {
          const enviado = batimentosEmVoo.get(msg.ref)!; batimentosEmVoo.delete(msg.ref)
          try { op.aoRtt?.(agora() - enviado) } catch { /* nada */ }
          return
        }
        if (msg.topic === topico && msg.ref === joinRef) {
          if (msg.payload?.status === 'ok') { tentativas = 0; inscrito = true; estado('ao-vivo') }
          else {
            const motivo = JSON.stringify(msg.payload?.response ?? msg.payload ?? '')
            if (/expired|jwt|token|unauthorized/i.test(motivo)) { estado('token-expirado', motivo); return }   // não fica fingindo ao vivo
            estado('reconectando', 'o canal recusou a assinatura'); agendarReligar('assinatura recusada')
          }
        }
        return
      }
      if (msg.event === 'postgres_changes' && msg.topic === topico) {
        const d = msg.payload?.data
        if (!d) return
        // Deduplicação de entrega: a mesma mudança pode chegar duas vezes numa reconexão.
        const chave = `${d.table}|${d.commit_timestamp ?? ''}|${JSON.stringify(d.record?.sessao_id ?? d.old_record?.sessao_id ?? '')}|${d.record?.seq ?? ''}|${d.record?.id ?? ''}`
        if (vistos.has(chave)) return
        vistos.add(chave); if (vistos.size > 2000) { const primeiro = vistos.values().next().value; if (primeiro) vistos.delete(primeiro) }
        op.aoMudar({ tipo: d.type, tabela: d.table, linha: d.record ?? {}, antiga: d.old_record ?? null, confirmadaEm: d.commit_timestamp ?? '' })
        return
      }
      if (msg.event === 'system' && msg.topic === topico && msg.payload?.status === 'error') {
        const motivo = String(msg.payload?.message ?? '')
        if (/expired|jwt|token|unauthorized/i.test(motivo)) { estado('token-expirado', motivo); return }
        agendarReligar(`erro do canal: ${motivo}`)
        return
      }
      if (msg.event === 'phx_error' || msg.event === 'phx_close') agendarReligar('o canal fechou')
    }
    socket.onerror = () => { /* o onclose cuida */ }
    socket.onclose = () => { if (socket === ws && vivo) agendarReligar('a conexão caiu') }
  }

  const agendarReligar = (motivo: string) => {
    if (!vivo || religando) return
    const antigo = ws; ws = null; inscrito = false
    try { antigo?.close() } catch { /* já fechou */ }
    batimentosEmVoo.clear()
    estado('reconectando', motivo)
    // Backoff exponencial com jitter: 1 s … 30 s, ±50%. Nunca desiste enquanto a tela estiver aberta.
    const base = Math.min(30_000, 1000 * 2 ** Math.min(tentativas, 5))
    const espera = Math.round(base * (0.5 + Math.random()))
    tentativas += 1
    religando = setTimeout(() => { religando = null; ligar() }, espera)
  }

  batimento = setInterval(() => {
    if (!vivo) return
    // O navegador suspenso deixa o socket "aberto" sem ninguém do outro lado:
    // sem resposta há mais de um minuto, religa em vez de confiar.
    if (ws && agora() - ultimoSinal > silencioMaximoMs) { agendarReligar('sem resposta do servidor'); return }
    ref += 1
    const r = String(ref)
    batimentosEmVoo.set(r, agora())
    if (batimentosEmVoo.size > 5) { const primeiro = batimentosEmVoo.keys().next().value; if (primeiro) batimentosEmVoo.delete(primeiro) }
    mandar({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: r })
  }, batimentoMs)
  ;(batimento as any).unref?.()

  const aoVoltar = () => { if (typeof document !== 'undefined' && document.visibilityState === 'visible' && vivo && (!ws || ws.readyState !== 1)) { if (religando) { clearTimeout(religando); religando = null }; tentativas = 0; ligar() } }
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', aoVoltar)

  ligar()

  return {
    aoVivo: () => Boolean(ws && ws.readyState === 1 && inscrito),
    fechar: () => {
      if (!vivo) return
      vivo = false
      if (batimento) clearInterval(batimento)
      if (religando) clearTimeout(religando)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', aoVoltar)
      try { ref += 1; mandar({ topic: topico, event: 'phx_leave', payload: {}, ref: String(ref), join_ref: joinRef }) } catch { /* nada */ }
      const antigo = ws; ws = null; inscrito = false
      try { antigo?.close() } catch { /* nada */ }
      estado('fechado')
    },
    atualizarToken: (novo) => {
      token = novo
      ref += 1
      mandar({ topic: topico, event: 'access_token', payload: { access_token: novo }, ref: String(ref), join_ref: joinRef })
    },
  }
}
