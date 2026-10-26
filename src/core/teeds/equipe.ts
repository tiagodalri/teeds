/**
 * Chat da equipe (27/10/2026, Tiago: "um chat interno, como se fosse um
 * WhatsApp... só para os administradores se conversarem").
 *
 * Cada marca tem o seu: o grupo da equipe (todos os administradores da marca)
 * e as conversas diretas de duas pessoas. Quem não é administrador DAQUELA
 * marca não lê nada (RLS em equipe_participo, ver a migração
 * 20261027180000_chat_da_equipe.sql). As mensagens chegam ao vivo pelo
 * Realtime; os prints vão para o bucket privado "equipe".
 *
 * A tela fala com `EquipeApi`: o site usa o banco (`equipeDoBanco`); o
 * laboratório usa uma equipe de mentira em memória.
 */
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { assinarMudancas } from './realtime'
import { ehImagem, reduzirImagem } from '../imagem'
import { MARCA } from '../../marca'

export interface Contato { id: string; nome: string; vistoEm: string | null }
export interface Participante { userId: string; lidaEm: string }
export interface ConversaEq {
  id: string
  tipo: 'grupo' | 'direta'
  ultimaEm: string | null
  ultimaTexto: string | null
  ultimaAutor: string | null
  participantes: Participante[]
}
export interface MensagemEq {
  id: string
  conversaId: string
  autor: string | null
  texto: string
  anexo: string | null
  respostaA: string | null
  apagada: boolean
  criadaEm: string
  /** Só nesta tela: ainda indo para o banco, ou não foi. */
  enviando?: boolean
  falhou?: boolean
}
export interface Abertura { grupo: string; contatos: Contato[]; conversas: ConversaEq[]; naoLidas: Record<string, number> }

export type MudancaEq =
  | { tipo: 'mensagem'; item: MensagemEq; nova: boolean }
  | { tipo: 'leitura'; conversaId: string; userId: string; lidaEm: string }
  | { tipo: 'conversa'; item: Omit<ConversaEq, 'participantes'> }

export interface EquipeApi {
  euId: string
  abrir(): Promise<Abertura>
  contatos(): Promise<Contato[]>
  conversas(): Promise<ConversaEq[]>
  /** As últimas mensagens da conversa (ou as de antes de `antesDe`), da mais velha para a mais nova. */
  mensagens(conversaId: string, antesDe?: string): Promise<MensagemEq[]>
  mandar(conversaId: string, d: { texto: string; anexo?: string | null; respostaA?: string | null }): Promise<MensagemEq>
  direta(outro: string): Promise<string>
  ler(conversaId: string): Promise<void>
  apagar(id: string): Promise<void>
  estouAqui(): Promise<void>
  enviarPrint(conversaId: string, arquivo: File): Promise<string>
  abrirPrint(caminho: string): Promise<string>
  /** Mudanças ao vivo. Devolve como parar. */
  acompanhar(aoMudar: (m: MudancaEq) => void, aoEstado?: (aoVivo: boolean) => void): () => void
}

export const POR_PAGINA = 60
/** Visto há menos disso = "online agora" (o navegador avisa a cada minuto). */
export const ONLINE_MS = 150_000

// ------------------------------------------------------------ conversão
export const daMensagem = (l: any): MensagemEq => ({
  id: l.id, conversaId: l.conversa_id, autor: l.autor ?? null, texto: l.texto ?? '', anexo: l.anexo ?? null,
  respostaA: l.resposta_a ?? null, apagada: !!l.apagada, criadaEm: l.criado_em,
})
const daConversa = (l: any): Omit<ConversaEq, 'participantes'> => ({
  id: l.id, tipo: l.tipo, ultimaEm: l.ultima_em ?? null, ultimaTexto: l.ultima_texto ?? null, ultimaAutor: l.ultima_autor ?? null,
})

// ------------------------------------------------------------ banco
export function equipeDoBanco(sessao: SessaoTeeds, marca: string = MARCA.id): EquipeApi {
  const cabeca = () => ({ apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` })
  const rest = async <T>(caminho: string, init: RequestInit = {}): Promise<T> => {
    const r = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
      ...init, headers: { ...cabeca(), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) },
    })
    if (!r.ok) {
      const c = await r.json().catch(() => ({}))
      throw new Error(String(c?.message || `Não consegui falar com o servidor agora (${r.status}). Tente de novo.`))
    }
    return r.status === 204 ? (undefined as T) : ((await r.json().catch(() => undefined)) as T)
  }
  const rpc = <T>(nome: string, corpo: Record<string, unknown>) => rest<T>(`/rpc/${nome}`, { method: 'POST', body: JSON.stringify(corpo) })

  const api: EquipeApi = {
    euId: sessao.usuario.id,
    async abrir() {
      const grupo = await rpc<string>('equipe_abrir', { p_marca: marca })
      const [contatos, conversas, nao] = await Promise.all([
        api.contatos(), api.conversas(), rpc<Array<{ conversa_id: string; n: number }>>('equipe_nao_lidas', { p_marca: marca }),
      ])
      const naoLidas: Record<string, number> = {}
      for (const x of nao ?? []) naoLidas[x.conversa_id] = Number(x.n) || 0
      return { grupo, contatos, conversas, naoLidas }
    },
    async contatos() {
      const l = await rpc<any[]>('equipe_contatos', { p_marca: marca })
      return (l ?? []).map((p) => ({ id: p.user_id, nome: String(p.nome ?? ''), vistoEm: p.visto_em ?? null }))
    },
    async conversas() {
      const l = await rest<any[]>(`/equipe_conversas?marca=eq.${marca}&select=*,equipe_participantes(user_id,lida_em)&order=ultima_em.desc.nullslast`)
      return (l ?? []).map((c) => ({
        ...daConversa(c),
        participantes: (c.equipe_participantes ?? []).map((p: any) => ({ userId: p.user_id, lidaEm: p.lida_em })),
      }))
    },
    async mensagens(conversaId, antesDe) {
      const antes = antesDe ? `&criado_em=lt.${encodeURIComponent(antesDe)}` : ''
      const l = await rest<any[]>(`/equipe_mensagens?conversa_id=eq.${conversaId}${antes}&select=*&order=criado_em.desc&limit=${POR_PAGINA}`)
      return (l ?? []).map(daMensagem).reverse()
    },
    async mandar(conversaId, d) {
      const l = await rest<any[]>('/equipe_mensagens', {
        method: 'POST', headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ conversa_id: conversaId, marca, texto: d.texto.trim(), anexo: d.anexo ?? null, resposta_a: d.respostaA ?? null }),
      })
      if (!l?.length) throw new Error('A mensagem não foi. Tente de novo.')
      return daMensagem(l[0])
    },
    direta: (outro) => rpc<string>('equipe_direta', { p_marca: marca, p_outro: outro }),
    async ler(conversaId) { await rpc('equipe_ler', { p_conversa: conversaId }) },
    async apagar(id) {
      const print = await rpc<string | null>('equipe_apagar', { p_mensagem: id })
      if (print) {
        await fetch(`${SUPABASE.url}/storage/v1/object/equipe`, {
          method: 'DELETE', headers: { ...cabeca(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [print] }),
        }).catch(() => undefined)
      }
    },
    async estouAqui() { await rpc('equipe_estou_aqui', { p_marca: marca }).catch(() => undefined) },
    async enviarPrint(conversaId, arquivo) {
      if (!ehImagem(arquivo)) throw new Error('Mande uma imagem (print da tela, JPG ou PNG).')
      const { blob, tipo, ext } = await reduzirImagem(arquivo, 1600, false, 0.85)
      const caminho = `${marca}/${conversaId}/${crypto.randomUUID()}.${ext}`
      const r = await fetch(`${SUPABASE.url}/storage/v1/object/equipe/${caminho}`, { method: 'POST', headers: { ...cabeca(), 'Content-Type': tipo }, body: blob })
      if (!r.ok) throw new Error(r.status === 413 ? 'A imagem ficou grande demais. Mande um print da tela.' : 'Não consegui enviar a imagem agora. Tente de novo.')
      return caminho
    },
    abrirPrint(caminho) {
      let p = printsAbertos.get(caminho)
      if (!p) {
        p = fetch(`${SUPABASE.url}/storage/v1/object/authenticated/equipe/${caminho}`, { headers: cabeca() })
          .then((r) => { if (!r.ok) throw new Error('print'); return r.blob() }).then((b) => URL.createObjectURL(b))
        p.catch(() => printsAbertos.delete(caminho))
        printsAbertos.set(caminho, p)
      }
      return p
    },
    acompanhar(aoMudar, aoEstado) {
      const filtro = `marca=eq.${marca}`
      const a = assinarMudancas({
        token: sessao.token,
        canal: `equipe-${marca}-${Math.random().toString(36).slice(2, 8)}`,
        tabelas: [
          { tabela: 'equipe_mensagens', filtro, evento: 'INSERT' },
          { tabela: 'equipe_mensagens', filtro, evento: 'UPDATE' },
          { tabela: 'equipe_participantes', filtro, evento: 'UPDATE' },
          { tabela: 'equipe_participantes', filtro, evento: 'INSERT' },
          { tabela: 'equipe_conversas', filtro, evento: 'INSERT' },
          { tabela: 'equipe_conversas', filtro, evento: 'UPDATE' },
        ],
        aoEstado: (e) => aoEstado?.(e === 'ao-vivo'),
        aoMudar: (m) => {
          const l = m.linha
          if (!l) return
          if (m.tabela === 'equipe_mensagens') aoMudar({ tipo: 'mensagem', item: daMensagem(l), nova: m.tipo === 'INSERT' })
          else if (m.tabela === 'equipe_participantes') aoMudar({ tipo: 'leitura', conversaId: l.conversa_id, userId: l.user_id, lidaEm: l.lida_em })
          else if (m.tabela === 'equipe_conversas') aoMudar({ tipo: 'conversa', item: daConversa(l) })
        },
      })
      return () => a.fechar()
    },
  }
  return api
}
const printsAbertos = new Map<string, Promise<string>>()

// ------------------------------------------------------------ apoio da tela
export const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const mesmoDia = (a: Date, b: Date) => a.toDateString() === b.toDateString()

export function diaDaMensagem(iso: string): string {
  const d = new Date(iso); const hoje = new Date(); const ontem = new Date(Date.now() - 86_400_000)
  if (mesmoDia(d, hoje)) return 'Hoje'
  if (mesmoDia(d, ontem)) return 'Ontem'
  const r = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return r.charAt(0).toUpperCase() + r.slice(1)
}

/** Na lista de conversas: a hora (hoje), "Ontem" ou a data. */
export function quandoNaLista(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso); const hoje = new Date()
  if (mesmoDia(d, hoje)) return horaCurta(iso)
  if (mesmoDia(d, new Date(Date.now() - 86_400_000))) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export const estaOnline = (c: Contato | undefined, agora = Date.now()) => !!c?.vistoEm && agora - Date.parse(c.vistoEm) < ONLINE_MS

/** "online agora", "visto hoje às 14:32", "visto ontem às 09:10", "visto em 24/10". */
export function situacaoDoContato(c: Contato | undefined, agora = Date.now()): string {
  if (!c?.vistoEm) return 'Ainda não abriu o chat'
  if (estaOnline(c, agora)) return 'Online agora'
  const d = new Date(c.vistoEm)
  if (mesmoDia(d, new Date(agora))) return `Visto hoje às ${horaCurta(c.vistoEm)}`
  if (mesmoDia(d, new Date(agora - 86_400_000))) return `Visto ontem às ${horaCurta(c.vistoEm)}`
  return `Visto em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
}

export const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || nome
export function iniciais(nome: string): string {
  const p = nome.trim().split(/\s+/).filter(Boolean)
  return ((p[0]?.[0] ?? '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase() || '?'
}

/** Cada pessoa com o seu tom, sempre o mesmo (nome no grupo e avatar). */
const TONS = ['#D4A64A', '#8FB3D9', '#7FC2A4', '#D9918C', '#B9A3E3', '#E0B57A', '#7CC4CF']
export function tomDe(id: string | null): string {
  if (!id) return TONS[0]
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return TONS[h % TONS.length]
}

/** A pessoa da conversa direta (a que não sou eu). */
export function outroDaDireta(c: ConversaEq, euId: string): string | null {
  return c.participantes.find((p) => p.userId !== euId)?.userId ?? null
}

/** Os dois tiques dourados: todos os outros da conversa leram até ali. */
export function lidaPorTodos(m: MensagemEq, c: ConversaEq | undefined, euId: string): boolean {
  if (!c) return false
  const outros = c.participantes.filter((p) => p.userId !== euId)
  return outros.length > 0 && outros.every((p) => Date.parse(p.lidaEm) >= Date.parse(m.criadaEm))
}
