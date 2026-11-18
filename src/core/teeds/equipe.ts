/**
 * Chat da equipe (27/10/2026, Tiago: "um chat interno, como se fosse um
 * WhatsApp... só para os administradores se conversarem"). Nível WhatsApp em
 * 17/11/2026: abre na hora (o que já foi visto fica guardado no aparelho),
 * mensagem de voz, reações, editar, "digitando…", notificação no celular a
 * cada mensagem e o número de não lidas no ícone do app.
 *
 * Cada marca tem o seu: o grupo da equipe (todos os administradores da marca)
 * e as conversas diretas de duas pessoas. Quem não é administrador DAQUELA
 * marca não lê nada (RLS em equipe_participo, ver as migrações
 * 20261027180000_chat_da_equipe.sql e 20261117200000_chat_da_equipe_nivel_whatsapp.sql).
 * As mensagens chegam ao vivo pelo Realtime; prints e áudios vão para o
 * bucket privado "equipe"; o "digitando…" passa no canal privado equipe:<marca>.
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
/** Imagem: largura e altura (reserva o espaço antes de carregar). Áudio: segundos e as barrinhas da onda (0–31). */
export type Midia = { tipo: 'imagem'; l: number; a: number } | { tipo: 'audio'; duracao: number; ondas: number[] }
export interface MensagemEq {
  id: string
  conversaId: string
  autor: string | null
  texto: string
  anexo: string | null
  midia: Midia | null
  respostaA: string | null
  apagada: boolean
  criadaEm: string
  /** user_id → emoji */
  reacoes: Record<string, string>
  editadaEm: string | null
  /** Só nesta tela: ainda indo para o banco, ou não foi. */
  enviando?: boolean
  falhou?: boolean
  /** Só nesta tela: a imagem ou o áudio ainda no aparelho (enquanto sobe). */
  local?: string
  /** Só nesta tela: o arquivo, para tentar de novo se a subida falhar. */
  arquivo?: Blob
}
export interface Abertura { grupo: string; contatos: Contato[]; conversas: ConversaEq[]; naoLidas: Record<string, number> }

export type MudancaEq =
  | { tipo: 'mensagem'; item: MensagemEq; nova: boolean }
  | { tipo: 'leitura'; conversaId: string; userId: string; lidaEm: string }
  | { tipo: 'conversa'; item: Omit<ConversaEq, 'participantes'> }

/** "digitando…" e "gravando áudio…" de alguém numa conversa. */
export interface SinalEq { tipo: 'digitando' | 'gravando' | 'parou'; userId: string; conversaId: string }

export interface EnvioEq { id: string; texto: string; anexo?: string | null; midia?: Midia | null; respostaA?: string | null }

export interface EquipeApi {
  euId: string
  abrir(): Promise<Abertura>
  contatos(): Promise<Contato[]>
  conversas(): Promise<ConversaEq[]>
  /** As últimas mensagens da conversa (ou as de antes de `antesDe`), da mais velha para a mais nova. */
  mensagens(conversaId: string, antesDe?: string): Promise<MensagemEq[]>
  /** O id vem da tela: mandar de novo o mesmo id não duplica. */
  mandar(conversaId: string, d: EnvioEq): Promise<MensagemEq>
  direta(outro: string): Promise<string>
  ler(conversaId: string): Promise<void>
  apagar(id: string): Promise<void>
  reagir(id: string, emoji: string | null): Promise<void>
  editar(id: string, texto: string): Promise<void>
  /** Estou aqui (e com esta conversa aberta, ou nenhuma). `saindo`: a aba vai sumir, manda mesmo assim. */
  estouAqui(vendo?: string | null, saindo?: boolean): Promise<void>
  /** Prepara a imagem (reduz) e sobe. Devolve o caminho e a medida. */
  enviarPrint(conversaId: string, arquivo: Blob): Promise<{ caminho: string; l: number; a: number }>
  enviarAudio(conversaId: string, audio: Blob): Promise<string>
  /** Endereço local (blob:) do print ou do áudio, guardado no aparelho depois da primeira vez. */
  abrirPrint(caminho: string): Promise<string>
  /** Mudanças ao vivo. Devolve como parar. */
  acompanhar(aoMudar: (m: MudancaEq) => void, aoEstado?: (aoVivo: boolean) => void): () => void
  /** "digitando…": ouvir os outros e avisar o meu. */
  sinais(aoSinal: (s: SinalEq) => void): { mandar: (tipo: SinalEq['tipo'], conversaId: string) => void; parar: () => void }
}

export const POR_PAGINA = 60
/** Visto há menos disso = "online agora" (o navegador avisa a cada minuto). */
export const ONLINE_MS = 150_000
/** Editar a própria mensagem: até 15 minutos depois (a mesma regra do banco). */
export const EDITAR_MS = 15 * 60_000

// ------------------------------------------------------------ conversão
const daMidia = (m: any): Midia | null => {
  if (!m || typeof m !== 'object') return null
  if (m.tipo === 'audio') return { tipo: 'audio', duracao: Number(m.duracao) || 0, ondas: Array.isArray(m.ondas) ? m.ondas.map((x: unknown) => Number(x) || 0) : [] }
  if (m.tipo === 'imagem') return { tipo: 'imagem', l: Number(m.l) || 0, a: Number(m.a) || 0 }
  return null
}
export const daMensagem = (l: any): MensagemEq => ({
  id: l.id, conversaId: l.conversa_id, autor: l.autor ?? null, texto: l.texto ?? '', anexo: l.anexo ?? null, midia: daMidia(l.midia),
  respostaA: l.resposta_a ?? null, apagada: !!l.apagada, criadaEm: l.criado_em,
  reacoes: l.reacoes && typeof l.reacoes === 'object' ? l.reacoes : {}, editadaEm: l.editada_em ?? null,
})
const daConversa = (l: any): Omit<ConversaEq, 'participantes'> => ({
  id: l.id, tipo: l.tipo, ultimaEm: l.ultima_em ?? null, ultimaTexto: l.ultima_texto ?? null, ultimaAutor: l.ultima_autor ?? null,
})

/** A medida da imagem já reduzida (para reservar o espaço do balão). */
async function medida(b: Blob): Promise<{ l: number; a: number }> {
  try {
    const bmp = await createImageBitmap(b)
    const r = { l: bmp.width, a: bmp.height }; bmp.close?.()
    return r
  } catch { return { l: 0, a: 0 } }
}

/** O tipo que vai para o armazenamento (sem ";codecs=…") e a extensão do áudio. */
export function tipoDoAudio(b: Blob): { tipo: string; ext: string } {
  const t = (b.type || 'audio/mp4').split(';')[0].trim().toLowerCase()
  if (t === 'audio/webm') return { tipo: t, ext: 'webm' }
  if (t === 'audio/ogg') return { tipo: t, ext: 'ogg' }
  if (t === 'audio/mpeg') return { tipo: t, ext: 'mp3' }
  if (t === 'audio/aac') return { tipo: t, ext: 'aac' }
  return { tipo: 'audio/mp4', ext: 'm4a' }
}

// ------------------------------------------------------------ guardado no aparelho
/*
  Prints e áudios: depois de baixados uma vez, ficam no Cache Storage do aparelho
  (só quem tem acesso baixou; o caminho tem um uuid). Abrir de novo é instantâneo,
  mesmo sem rede.
*/
const CAIXA_DE_MIDIA = `${MARCA.id}-equipe-midia`
const midiasAbertas = new Map<string, Promise<string>>()
async function daCaixa(caminho: string): Promise<Blob | null> {
  try { const c = await caches.open(CAIXA_DE_MIDIA); const r = await c.match(`/equipe-midia/${caminho}`); return r ? await r.blob() : null } catch { return null }
}
async function paraCaixa(caminho: string, b: Blob) {
  try { const c = await caches.open(CAIXA_DE_MIDIA); await c.put(`/equipe-midia/${caminho}`, new Response(b, { headers: { 'Content-Type': b.type || 'application/octet-stream' } })) } catch { /* sem cache: baixa de novo da próxima vez */ }
}
/** O que acabou de subir já fica guardado (quem mandou não baixa de novo). */
export function guardarMidia(caminho: string, b: Blob) {
  void paraCaixa(caminho, b)
  if (!midiasAbertas.has(caminho)) midiasAbertas.set(caminho, Promise.resolve(URL.createObjectURL(b)))
}

// ------------------------------------------------------------ banco
export function equipeDoBanco(sessao: SessaoTeeds, marca: string = MARCA.id): EquipeApi {
  const cabeca = () => ({ apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` })
  const rest = async <T>(caminho: string, init: RequestInit = {}): Promise<T> => {
    const r = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
      ...init, headers: { ...cabeca(), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) },
    })
    if (!r.ok) {
      const c = await r.json().catch(() => ({}))
      const e = new Error(String(c?.message || `Não consegui falar com o servidor agora (${r.status}). Tente de novo.`)) as Error & { status?: number; codigo?: string }
      e.status = r.status; e.codigo = c?.code
      throw e
    }
    return r.status === 204 ? (undefined as T) : ((await r.json().catch(() => undefined)) as T)
  }
  const rpc = <T>(nome: string, corpo: Record<string, unknown>, init: RequestInit = {}) => rest<T>(`/rpc/${nome}`, { method: 'POST', body: JSON.stringify(corpo), ...init })
  const subir = async (caminho: string, b: Blob, tipo: string) => {
    const r = await fetch(`${SUPABASE.url}/storage/v1/object/equipe/${caminho}`, { method: 'POST', headers: { ...cabeca(), 'Content-Type': tipo }, body: b })
    if (!r.ok) throw new Error(r.status === 413 ? 'O arquivo ficou grande demais.' : 'Não consegui enviar o arquivo agora. Tente de novo.')
    guardarMidia(caminho, b)
  }

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
      try {
        const l = await rest<any[]>('/equipe_mensagens', {
          method: 'POST', headers: { Prefer: 'return=representation' },
          body: JSON.stringify({ id: d.id, conversa_id: conversaId, marca, texto: d.texto.trim(), anexo: d.anexo ?? null, midia: d.midia ?? null, resposta_a: d.respostaA ?? null }),
        })
        if (!l?.length) throw new Error('A mensagem não foi. Tente de novo.')
        return daMensagem(l[0])
      } catch (e) {
        // a primeira tentativa chegou e a resposta é que se perdeu: a mensagem já está lá
        if ((e as { codigo?: string }).codigo === '23505' || (e as { status?: number }).status === 409) {
          const l = await rest<any[]>(`/equipe_mensagens?id=eq.${d.id}&select=*`)
          if (l?.length) return daMensagem(l[0])
        }
        throw e
      }
    },
    direta: (outro) => rpc<string>('equipe_direta', { p_marca: marca, p_outro: outro }),
    async ler(conversaId) { await rpc('equipe_ler', { p_conversa: conversaId }) },
    async apagar(id) {
      const arquivo = await rpc<string | null>('equipe_apagar', { p_mensagem: id })
      if (arquivo) {
        await fetch(`${SUPABASE.url}/storage/v1/object/equipe`, {
          method: 'DELETE', headers: { ...cabeca(), 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [arquivo] }),
        }).catch(() => undefined)
      }
    },
    async reagir(id, emoji) { await rpc('equipe_reagir', { p_mensagem: id, p_emoji: emoji }) },
    async editar(id, texto) { await rpc('equipe_editar', { p_mensagem: id, p_texto: texto }) },
    async estouAqui(vendo = null, saindo = false) {
      await rpc('equipe_estou_aqui', { p_marca: marca, p_vendo: vendo }, saindo ? { keepalive: true } : {}).catch(() => undefined)
    },
    async enviarPrint(conversaId, arquivo) {
      if (!ehImagem(arquivo)) throw new Error('Mande uma imagem (print da tela, JPG ou PNG).')
      const { blob, tipo, ext } = await reduzirImagem(arquivo as File, 1600, false, 0.85)
      const { l, a } = await medida(blob)
      const caminho = `${marca}/${conversaId}/${crypto.randomUUID()}.${ext}`
      await subir(caminho, blob, tipo)
      return { caminho, l, a }
    },
    async enviarAudio(conversaId, audio) {
      const { tipo, ext } = tipoDoAudio(audio)
      const caminho = `${marca}/${conversaId}/${crypto.randomUUID()}.${ext}`
      await subir(caminho, audio, tipo)
      return caminho
    },
    abrirPrint(caminho) {
      let p = midiasAbertas.get(caminho)
      if (!p) {
        p = daCaixa(caminho).then(async (guardado) => {
          if (guardado) return URL.createObjectURL(guardado)
          const r = await fetch(`${SUPABASE.url}/storage/v1/object/authenticated/equipe/${caminho}`, { headers: cabeca() })
          if (!r.ok) throw new Error('midia')
          const b = await r.blob()
          void paraCaixa(caminho, b)
          return URL.createObjectURL(b)
        })
        p.catch(() => midiasAbertas.delete(caminho))
        midiasAbertas.set(caminho, p)
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
    sinais(aoSinal) {
      const eu = sessao.usuario.id
      const a = assinarMudancas({
        token: sessao.token, canal: '', tabelas: [], transmissao: `equipe:${marca}`,
        aoMudar: () => undefined,
        aoSinal: (evento, c) => {
          if (evento !== 'sinal' || typeof c.u !== 'string' || typeof c.c !== 'string' || c.u === eu) return
          const tipo = c.t === 'gravando' ? 'gravando' : c.t === 'parou' ? 'parou' : 'digitando'
          aoSinal({ tipo, userId: c.u, conversaId: c.c })
        },
      })
      return {
        mandar: (tipo, conversaId) => a.sinalizar('sinal', { t: tipo, u: eu, c: conversaId }),
        parar: () => a.fechar(),
      }
    },
  }
  return api
}

// ------------------------------------------------------------ guardado para abrir na hora
/*
  O chat abre como o WhatsApp: na hora, com o que já estava na tela da última vez
  (conversas, contatos e as últimas mensagens de cada conversa), e atualiza por
  trás. Fica no aparelho de quem é da equipe, por pessoa e por marca.
*/
export interface Guardado extends Abertura { msgs: Record<string, MensagemEq[]>; rascunhos: Record<string, string> }
const chaveGuardada = (eu: string) => `${MARCA.id}.equipe.v2.${eu}`
export function lerGuardado(eu: string): Guardado | null {
  try {
    const t = localStorage.getItem(chaveGuardada(eu))
    if (!t) return null
    const g = JSON.parse(t) as Guardado
    return g && typeof g.grupo === 'string' && Array.isArray(g.conversas) ? { ...g, msgs: g.msgs ?? {}, rascunhos: g.rascunhos ?? {} } : null
  } catch { return null }
}
export function guardar(eu: string, g: Guardado) {
  try {
    const msgs: Record<string, MensagemEq[]> = {}
    for (const [k, l] of Object.entries(g.msgs)) {
      // só o que já foi para o banco; os últimos 80 de cada conversa
      msgs[k] = l.filter((m) => !m.enviando && !m.falhou && !m.id.startsWith('tmp-')).slice(-80).map(({ local: _l, arquivo: _a, ...m }) => m)
    }
    localStorage.setItem(chaveGuardada(eu), JSON.stringify({ ...g, msgs }))
  } catch { /* sem espaço: abre pelo banco */ }
}

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

/** Quem da conversa já leu esta mensagem (para o "Lida por" do grupo). */
export function quemLeu(m: MensagemEq, c: ConversaEq | undefined, euId: string): string[] {
  if (!c) return []
  return c.participantes.filter((p) => p.userId !== euId && Date.parse(p.lidaEm) >= Date.parse(m.criadaEm)).map((p) => p.userId)
}

/** Só emoji (até 3): o balão mostra grande, como no WhatsApp. */
export function soEmoji(t: string): boolean {
  const s = t.trim()
  if (!s || s.length > 24) return false
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: 'grapheme' }) => { segment: (t: string) => Iterable<{ segment: string }> } }).Segmenter
    // sem o Segmenter: separa pelos emoji com os modificadores e o "zero width joiner" juntos
    const partes = Seg ? [...new Seg('pt-BR', { granularity: 'grapheme' }).segment(s)].map((x) => x.segment).filter((x) => x.trim())
      : s.match(/\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier}|\u200D\p{Extended_Pictographic})*|\S/gu) ?? []
    return partes.length <= 3 && partes.every((x) => /\p{Extended_Pictographic}/u.test(x))
  } catch { return false }
}

/** "0:07", "1:23". */
export const duracaoCurta = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`

/** Os links do texto, para virarem clicáveis (o resto fica texto puro: nada de HTML vindo do banco). */
export function partesDoTexto(t: string): Array<{ texto: string; link?: string }> {
  const out: Array<{ texto: string; link?: string }> = []
  const re = /\b(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]|www\.[^\s<]+[^\s<.,;:!?)\]'"])/gi
  let i = 0
  for (const m of t.matchAll(re)) {
    if (m.index! > i) out.push({ texto: t.slice(i, m.index) })
    out.push({ texto: m[0], link: m[0].startsWith('www.') ? `https://${m[0]}` : m[0] })
    i = m.index! + m[0].length
  }
  if (i < t.length) out.push({ texto: t.slice(i) })
  return out
}
