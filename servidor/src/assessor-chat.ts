import './ambiente'
import { restDoBanco as rest } from './supabase'
import { todas } from './sessoes'

/*
  O chat do Assessor GF no ADM (25/11/2026, Tiago: "preciso do chat mesmo, pra visualizar as conversas, até
  mesmo se eu quiser responder alguém manualmente... daquele jeito que você fez na outra aba de WhatsApp").

  - Toda mensagem (cliente, Assessor, equipe, nota) fica em assessor_whatsapp_mensagens; a conversa de cada número
    em assessor_whatsapp_contatos (não lidas, aberta/resolvida, responsável, etiquetas, fixada, pausa).
  - A equipe ASSUME a conversa (ou responde à mão): o Assessor para de responder aquele número. Volta quando alguém
    devolve, ou sozinho depois de 6 h sem a equipe escrever (ninguém fica sem resposta por esquecimento).
  - Mídia recebida e enviada fica no bucket privado "whatsapp" em assessor/<número>/…; a tela abre por link
    assinado de 1 h, pedido ao servidor.
  - A tela é a mesma central da aba WhatsApp (CentralWhatsApp), com a fonte de dados do Assessor.
*/

export const MARCA_DO_CHAT = 'globalfly'
const URL_BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '')
const CHAVE = process.env.SUPABASE_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const PAUSA_SOZINHA_MS = 6 * 3600_000
const POR_PAGINA = 60

/* ------------------------------------------------------------------ o que a tela recebe */

export interface ContatoDoChat {
  id: string; waId: string; nome: string | null; userId: string | null; leadId: null
  ultimaEm: string | null; ultimaTexto: string | null; ultimaDirecao: 'entrada' | 'saida' | 'nota' | null; ultimaEntradaEm: string | null
  naoLidas: number; responsavel: string | null; situacao: 'aberta' | 'resolvida'; etiquetas: string[]; criadoEm: string; fixada: boolean
  iaPausada: boolean; pausadaEm: string | null; pausadaPor: string | null
}
export interface MensagemDoChat {
  id: string; contatoId: string; wamid: string | null; direcao: 'entrada' | 'saida' | 'nota'; tipo: string
  texto: string | null; midia: { caminho?: string | null; mime?: string; nome?: string | null; tamanho?: number | null; voz?: boolean } | null
  modelo: null; citando: string | null; reacao: string | null; reacaoEquipe: string | null; favorita: boolean
  status: string; erro: string | null; autor: string | null; criadoEm: string
}

const CAMPOS_MSG = 'id,numero,papel,texto,tipo,id_whatsapp,autor,midia,citando,reacao,reacao_equipe,favorita,status,criado_em'
const wamidDe = (id: string | null) => (id ? id.replace(/^(rec|env):/, '') : null)

export function paraMensagem(l: any): MensagemDoChat {
  const direcao = l.papel === 'cliente' ? 'entrada' : l.papel === 'nota' ? 'nota' : 'saida'
  const texto = typeof l.texto === 'string' && l.texto && !/^\[(audio|imagem|video|documento|outro)\]$/.test(l.texto) ? l.texto : null
  return {
    id: String(l.id), contatoId: l.numero, wamid: wamidDe(l.id_whatsapp), direcao, tipo: l.tipo || 'texto',
    texto, midia: l.midia ?? null, modelo: null, citando: l.citando ?? null, reacao: l.reacao ?? null, reacaoEquipe: l.reacao_equipe ?? null,
    favorita: !!l.favorita, status: l.papel === 'cliente' ? 'recebida' : l.status || 'enviada', erro: null,
    // o Assessor (I.A.) assina "assessor"; a equipe, o próprio id
    autor: l.papel === 'assessor' ? 'assessor' : l.autor ?? null, criadoEm: l.criado_em,
  }
}

function paraContato(l: any, nomes: Map<string, string>): ContatoDoChat {
  return {
    id: l.numero, waId: l.numero, nome: l.nome || (l.user_id ? nomes.get(l.user_id) ?? null : null), userId: l.user_id ?? null, leadId: null,
    ultimaEm: l.ultima_em, ultimaTexto: l.ultima_texto, ultimaDirecao: l.ultima_direcao, ultimaEntradaEm: l.ultima_entrada_em,
    naoLidas: l.nao_lidas ?? 0, responsavel: l.responsavel ?? null, situacao: l.situacao === 'resolvida' ? 'resolvida' : 'aberta',
    etiquetas: Array.isArray(l.etiquetas) ? l.etiquetas : [], criadoEm: l.criado_em, fixada: !!l.fixada,
    iaPausada: !!l.ia_pausada, pausadaEm: l.pausada_em ?? null, pausadaPor: l.pausada_por ?? null,
  }
}

async function nomesDos(userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return new Map()
  const l = await rest<any[]>(`/clientes?marca=eq.${MARCA_DO_CHAT}&user_id=in.(${ids.join(',')})&select=user_id,nome`).catch(() => [])
  return new Map(l.filter((x) => x.nome).map((x) => [x.user_id, String(x.nome)]))
}

const numeroValido = (n: unknown) => { const s = String(n ?? ''); if (!/^\d{10,15}$/.test(s)) throw new Error('Número inválido.'); return s }
const previa = (tipo: string, texto: string | null) => (texto?.trim() ? texto.trim().slice(0, 160) : ({ audio: '🎤 Áudio', imagem: '📷 Foto', video: '🎥 Vídeo', documento: '📄 Documento' } as Record<string, string>)[tipo] ?? 'Mensagem')

/* ------------------------------------------------------------------ chamado pelo zapi.ts a cada mensagem */

/** Atualiza a conversa do número depois de guardar uma mensagem (cria na primeira). */
export async function aposMensagem(numero: string, m: { papel: 'cliente' | 'assessor' | 'equipe' | 'nota'; texto: string | null; tipo?: string; userId?: string | null; nome?: string | null }): Promise<void> {
  try {
    const agora = new Date().toISOString()
    const [atual] = await rest<any[]>(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${numero}&select=nao_lidas,situacao,user_id,nome&limit=1`)
    const campos: Record<string, unknown> = { atualizado_em: agora }
    if (m.papel !== 'nota') {
      campos.ultima_em = agora
      campos.ultima_texto = previa(m.tipo ?? 'texto', m.texto)
      campos.ultima_direcao = m.papel === 'cliente' ? 'entrada' : 'saida'
    }
    if (m.papel === 'cliente') {
      campos.ultima_entrada_em = agora
      campos.nao_lidas = (atual?.nao_lidas ?? 0) + 1
      campos.situacao = 'aberta' // cliente escreveu de novo: a conversa resolvida volta para as abertas
    }
    if (m.papel === 'equipe') { campos.ultima_equipe_em = agora; campos.nao_lidas = 0 }
    if (m.userId && !atual?.user_id) campos.user_id = m.userId
    if (m.nome && !atual?.nome) campos.nome = m.nome.slice(0, 80)
    if (atual) await rest(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${numero}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(campos) })
    else await rest('/assessor_whatsapp_contatos', { method: 'POST', headers: { Prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ marca: MARCA_DO_CHAT, numero, criado_em: agora, ...campos }) })
  } catch (e) {
    console.warn(`[assessor-chat] não atualizei a conversa …${numero.slice(-4)}: ${(e as Error).message}`)
  }
}

/** A equipe assumiu este número? (6 h sem a equipe escrever: devolve sozinho ao Assessor). */
export async function assessorPausado(numero: string): Promise<boolean> {
  const [c] = await rest<any[]>(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${numero}&select=ia_pausada,pausada_em,ultima_equipe_em&limit=1`).catch(() => [])
  if (!c?.ia_pausada) return false
  const ultima = Math.max(new Date(c.pausada_em ?? 0).getTime(), new Date(c.ultima_equipe_em ?? 0).getTime())
  if (Date.now() - ultima < PAUSA_SOZINHA_MS) return true
  await rest(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${numero}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ ia_pausada: false, atualizado_em: new Date().toISOString() }) }).catch(() => null)
  console.log(`[assessor-chat] …${numero.slice(-4)} voltou para o Assessor (6 h sem a equipe escrever)`)
  return false
}

/* ------------------------------------------------------------------ mídia no armazenamento */

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'video/mp4': 'mp4', 'application/pdf': 'pdf' }
const extDe = (mime: string, nome?: string | null) => EXT[mime] ?? (nome?.match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()) ?? 'bin'

export async function guardarArquivo(numero: string, chave: string, dados: Buffer, mime: string, nome?: string | null): Promise<string | null> {
  if (!URL_BASE || !CHAVE) return null
  const caminho = `assessor/${numero}/${chave.replace(/[^\w.-]/g, '_')}.${extDe(mime, nome)}`
  const r = await fetch(`${URL_BASE}/storage/v1/object/whatsapp/${caminho}`, {
    method: 'POST', headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': mime || 'application/octet-stream', 'x-upsert': 'true' }, body: dados,
  }).catch(() => null)
  if (!r?.ok) { console.warn(`[assessor-chat] não guardei o arquivo de …${numero.slice(-4)} (${r?.status ?? 'sem resposta'})`); return null }
  return caminho
}

/** O arquivo de uma mensagem recebida (a Z-API manda o link): baixa e guarda no bucket, sem segurar a conversa. */
export async function guardarMidiaRecebida(idWpp: string, numero: string, corpo: any): Promise<void> {
  const fonte = corpo.audio?.audioUrl ? { url: corpo.audio.audioUrl, mime: corpo.audio.mimeType, voz: true }
    : corpo.image?.imageUrl ? { url: corpo.image.imageUrl, mime: corpo.image.mimeType }
    : corpo.video?.videoUrl ? { url: corpo.video.videoUrl, mime: corpo.video.mimeType }
    : corpo.document?.documentUrl ? { url: corpo.document.documentUrl, mime: corpo.document.mimeType, nome: corpo.document.fileName ?? corpo.document.title }
    : corpo.sticker?.stickerUrl ? { url: corpo.sticker.stickerUrl, mime: corpo.sticker.mimeType ?? 'image/webp' }
    : null
  if (!fonte || !/^https:\/\//i.test(String(fonte.url))) return
  try {
    const res = await fetch(String(fonte.url), { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) return
    const b = Buffer.from(await res.arrayBuffer())
    if (!b.length || b.length > 16_000_000) return
    const mime = String(fonte.mime ?? res.headers.get('content-type') ?? 'application/octet-stream').split(';')[0].trim().toLowerCase()
    const caminho = await guardarArquivo(numero, idWpp, b, mime, (fonte as any).nome)
    if (!caminho) return
    await rest(`/assessor_whatsapp_mensagens?id_whatsapp=eq.${encodeURIComponent(idWpp)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ midia: { caminho, mime, nome: (fonte as any).nome ?? null, tamanho: b.length, voz: !!(fonte as any).voz }, atualizado_em: new Date().toISOString() }),
    })
  } catch (e) { console.warn(`[assessor-chat] mídia de …${numero.slice(-4)} não guardada: ${(e as Error).message}`) }
}

export async function linkDoArquivo(caminho: unknown): Promise<string> {
  const c = String(caminho ?? '')
  if (!/^assessor\/\d{10,15}\/[\w.-]+$/.test(c)) throw new Error('Arquivo inválido.')
  const r = await fetch(`${URL_BASE}/storage/v1/object/sign/whatsapp/${c}`, { method: 'POST', headers: { apikey: CHAVE, Authorization: `Bearer ${CHAVE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 3600 }) })
  const d = await r.json().catch(() => ({} as any))
  if (!r.ok || !d?.signedURL) throw new Error('Não consegui abrir o arquivo agora.')
  return `${URL_BASE}/storage/v1${d.signedURL}`
}

/* ------------------------------------------------------------------ o que o ADM lê */

export async function conversas(): Promise<ContatoDoChat[]> {
  const l = await rest<any[]>(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&select=*&order=ultima_em.desc.nullslast&limit=1000`)
  const nomes = await nomesDos(l.map((x) => x.user_id))
  return l.map((x) => paraContato(x, nomes))
}

export async function mensagens(numero: unknown, antesDe?: unknown): Promise<MensagemDoChat[]> {
  const n = numeroValido(numero)
  const antes = typeof antesDe === 'string' && !Number.isNaN(Date.parse(antesDe)) ? `&criado_em=lt.${new Date(antesDe).toISOString()}` : ''
  const l = await rest<any[]>(`/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_CHAT}&numero=eq.${n}${antes}&select=${CAMPOS_MSG}&order=criado_em.desc&limit=${POR_PAGINA}`)
  return l.reverse().map(paraMensagem)
}

export async function todasAsMensagens(numero: unknown): Promise<MensagemDoChat[]> {
  const n = numeroValido(numero)
  const l = await rest<any[]>(`/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_CHAT}&numero=eq.${n}&select=${CAMPOS_MSG}&order=criado_em.asc&limit=5000`)
  return l.map(paraMensagem)
}

/** O que mudou desde `desde` (a tela pergunta a cada poucos segundos). */
export async function mudancas(desde: unknown): Promise<{ agora: string; contatos: ContatoDoChat[]; mensagens: MensagemDoChat[] }> {
  const agora = new Date().toISOString()
  const d = typeof desde === 'string' && !Number.isNaN(Date.parse(desde)) ? new Date(Date.parse(desde) - 2000).toISOString() : new Date(Date.now() - 60_000).toISOString()
  const [cs, ms] = await Promise.all([
    rest<any[]>(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&atualizado_em=gte.${d}&select=*&limit=300`),
    rest<any[]>(`/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_CHAT}&atualizado_em=gte.${d}&select=${CAMPOS_MSG}&order=criado_em.asc&limit=300`),
  ])
  const nomes = await nomesDos(cs.map((x) => x.user_id))
  return { agora, contatos: cs.map((x) => paraContato(x, nomes)), mensagens: ms.map(paraMensagem) }
}

export async function ficha(numero: unknown) {
  const n = numeroValido(numero)
  const [c] = await rest<any[]>(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${n}&select=user_id&limit=1`)
  if (!c?.user_id) return { cliente: null, lead: null }
  const [f] = await rest<any[]>(`/clientes?marca=eq.${MARCA_DO_CHAT}&user_id=eq.${c.user_id}&select=user_id,nome,email,telefone,categoria,parceiro,status_acesso,criado_em,visto_em,cidade,end_uf&limit=1`)
  if (!f) return { cliente: null, lead: null }
  return {
    extras: await extrasDoCliente(c.user_id),
    cliente: {
      userId: f.user_id, nome: f.nome, email: f.email ? String(f.email).replace(/\+marca-[a-z0-9-]+@/i, '@') : null, telefone: f.telefone,
      categoria: f.categoria, subplano: f.categoria, parceiro: f.parceiro, status: f.status_acesso, criadoEm: f.criado_em, vistoEm: f.visto_em, cidade: f.cidade, uf: f.end_uf,
    },
    lead: null,
  }
}

const din = (v: number, moeda = 'USD') => `${v > 0 ? '+' : v < 0 ? '−' : ''}${moeda === 'USD' ? 'US$' : moeda} ${Math.abs(v).toFixed(2).replace('.', ',')}`
/** O que a equipe precisa ver para responder (25/11/2026): I.A. operando agora, resultado de hoje, saldos guardados e o WhatsApp confirmado. Tipo de conta verdadeiro (tela do ADM). */
async function extrasDoCliente(userId: string): Promise<Array<{ rotulo: string; valor: string; tom?: 'ok' | 'alerta' }>> {
  const extras: Array<{ rotulo: string; valor: string; tom?: 'ok' | 'alerta' }> = []
  const vivas = todas().filter((s) => s.parametros?.userId === userId && (s.estado?.rodando || s.estado?.emOperacao))
  extras.push({ rotulo: 'Operando agora', valor: vivas.length ? vivas.map((s) => `${s.roboNome} · ${s.demo ? 'demo' : 'real'} · ${din(s.estado?.resultado ?? 0, s.moeda)} em ${s.estado?.operacoes ?? 0} op.`).join(' | ') : 'Nenhuma I.A.', tom: vivas.length ? 'ok' : undefined })
  const inicioHoje = new Date(); inicioHoje.setUTCHours(3, 0, 0, 0); if (Date.now() < inicioHoje.getTime()) inicioHoje.setUTCDate(inicioHoje.getUTCDate() - 1)
  const [sess, contas, vinc] = await Promise.all([
    rest<any[]>(`/sessoes_robos?user_id=eq.${userId}&marca=eq.${MARCA_DO_CHAT}&criada_em=gte.${inicioHoje.toISOString()}&select=demo,resultado,moeda&limit=500`).catch(() => []),
    rest<any[]>(`/contas_deriv?user_id=eq.${userId}&marca=eq.${MARCA_DO_CHAT}&select=conta_id,tipo,saldo,moeda&order=tipo.asc`).catch(() => []),
    rest<any[]>(`/assessor_whatsapp_vinculos?user_id=eq.${userId}&marca=eq.${MARCA_DO_CHAT}&select=confirmado_em&limit=1`).catch(() => []),
  ])
  for (const demo of [false, true]) {
    const l = sess.filter((x) => !!x.demo === demo)
    if (l.length) extras.push({ rotulo: `Hoje na ${demo ? 'demo' : 'real'}`, valor: `${din(l.reduce((t, x) => t + Number(x.resultado ?? 0), 0))} em ${l.length} ${l.length === 1 ? 'sessão' : 'sessões'}`, tom: demo ? undefined : 'ok' })
  }
  for (const c of contas) extras.push({ rotulo: `Saldo ${c.tipo === 'real' ? 'real' : 'demo'}`, valor: `${c.conta_id} · ${c.moeda === 'USD' || !c.moeda ? 'US$' : c.moeda} ${Number(c.saldo ?? 0).toFixed(2).replace('.', ',')}`, tom: c.tipo === 'real' && Number(c.saldo ?? 0) <= 0 ? 'alerta' : undefined })
  extras.push({ rotulo: 'WhatsApp', valor: vinc[0]?.confirmado_em ? 'Confirmado no perfil' : 'Não confirmado', tom: vinc[0]?.confirmado_em ? 'ok' : 'alerta' })
  return extras
}

export async function arquivos(numero: unknown) {
  const n = numeroValido(numero)
  const base = `/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_CHAT}&numero=eq.${n}&select=${CAMPOS_MSG}&order=criado_em.desc`
  const [midias, docs, links, notas, favoritas] = await Promise.all([
    rest<any[]>(`${base}&tipo=in.(imagem,video,figurinha)&midia=not.is.null&limit=300`),
    rest<any[]>(`${base}&tipo=in.(documento,audio)&midia=not.is.null&limit=200`),
    rest<any[]>(`${base}&papel=neq.nota&texto=ilike.*http*&limit=200`),
    rest<any[]>(`${base}&papel=eq.nota&limit=100`),
    rest<any[]>(`${base}&favorita=eq.true&limit=100`),
  ])
  const m = (l: any[]) => l.map(paraMensagem)
  return { midias: m(midias), docs: m(docs), links: m(links), notas: m(notas), favoritas: m(favoritas) }
}

export async function buscar(q: unknown) {
  const t = String(q ?? '').trim().replace(/[%*,()]/g, ' ').slice(0, 80)
  if (t.length < 3) return []
  const l = await rest<any[]>(`/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_CHAT}&texto=ilike.*${encodeURIComponent(t)}*&select=id,numero,texto,papel,criado_em&order=criado_em.desc&limit=40`)
  return l.map((x) => ({ id: String(x.id), contatoId: x.numero, texto: x.texto, direcao: x.papel === 'cliente' ? 'entrada' : x.papel === 'nota' ? 'nota' : 'saida', criadoEm: x.criado_em }))
}

/* ------------------------------------------------------------------ o que o ADM muda */

export async function mudarConversa(numero: unknown, campos: any, adminId: string): Promise<void> {
  const n = numeroValido(numero)
  const c: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if ('responsavel' in campos) c.responsavel = typeof campos.responsavel === 'string' && /^[0-9a-f-]{36}$/.test(campos.responsavel) ? campos.responsavel : null
  if (campos.situacao === 'aberta' || campos.situacao === 'resolvida') c.situacao = campos.situacao
  if (Array.isArray(campos.etiquetas)) c.etiquetas = campos.etiquetas.map((e: unknown) => String(e).trim().slice(0, 24)).filter(Boolean).slice(0, 12)
  if (typeof campos.nome === 'string') c.nome = campos.nome.trim().slice(0, 80) || null
  if (typeof campos.fixada === 'boolean') c.fixada = campos.fixada
  if (typeof campos.naoLidas === 'number') c.nao_lidas = Math.max(0, Math.min(99, Math.floor(campos.naoLidas)))
  if (typeof campos.iaPausada === 'boolean') {
    c.ia_pausada = campos.iaPausada
    if (campos.iaPausada) { c.pausada_em = new Date().toISOString(); c.pausada_por = adminId }
  }
  await rest(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${n}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(c) })
  if (typeof campos.iaPausada === 'boolean') console.log(`[assessor-chat] …${n.slice(-4)} ${campos.iaPausada ? 'assumida pela equipe (Assessor pausado)' : 'devolvida ao Assessor'}`)
}

/** Quando a equipe escreve, a conversa é dela: o Assessor para de responder este número (e quem escreveu vira responsável se não houver). */
export async function equipeAssumiu(numero: string, adminId: string): Promise<void> {
  const [c] = await rest<any[]>(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${numero}&select=ia_pausada,responsavel&limit=1`).catch(() => [])
  const campos: Record<string, unknown> = { atualizado_em: new Date().toISOString() }
  if (!c?.ia_pausada) { campos.ia_pausada = true; campos.pausada_em = new Date().toISOString(); campos.pausada_por = adminId }
  if (!c?.responsavel) campos.responsavel = adminId
  await rest(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${numero}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(campos) }).catch(() => null)
}

export async function guardarDaEquipe(m: { numero: string; papel: 'equipe' | 'nota'; texto: string | null; tipo?: string; autor: string; idWhatsapp?: string | null; midia?: unknown; citando?: string | null; userId?: string | null }): Promise<MensagemDoChat> {
  const [l] = await rest<any[]>('/assessor_whatsapp_mensagens', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      marca: MARCA_DO_CHAT, numero: m.numero, user_id: m.userId ?? null, papel: m.papel, texto: (m.texto ?? '').slice(0, 4000), tipo: m.tipo ?? 'texto',
      id_whatsapp: m.idWhatsapp ?? null, autor: m.autor, midia: m.midia ?? null, citando: m.citando ?? null,
    }),
  })
  await aposMensagem(m.numero, { papel: m.papel, texto: m.texto, tipo: m.tipo })
  return paraMensagem(l)
}

export async function usuarioDaConversa(numero: string): Promise<string | null> {
  const [c] = await rest<any[]>(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${numero}&select=user_id&limit=1`).catch(() => [])
  return c?.user_id ?? null
}

export async function lerConversa(numero: unknown): Promise<void> {
  const n = numeroValido(numero)
  await rest(`/assessor_whatsapp_contatos?marca=eq.${MARCA_DO_CHAT}&numero=eq.${n}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ nao_lidas: 0, atualizado_em: new Date().toISOString() }) })
}

export async function favoritar(id: unknown, sim: unknown): Promise<void> {
  const i = String(id ?? '')
  if (!/^\d+$/.test(i)) throw new Error('Mensagem inválida.')
  await rest(`/assessor_whatsapp_mensagens?id=eq.${i}&marca=eq.${MARCA_DO_CHAT}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ favorita: !!sim, atualizado_em: new Date().toISOString() }) })
}

export async function marcarReacao(numero: string, wamid: string, emoji: string): Promise<void> {
  await rest(`/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_CHAT}&numero=eq.${numero}&id_whatsapp=in.(rec:${wamid},env:${wamid})`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ reacao_equipe: emoji || null, atualizado_em: new Date().toISOString() }),
  })
}

export async function fotoDaPlataforma(userId: string): Promise<string | null> {
  const [c] = await rest<any[]>(`/clientes?marca=eq.${MARCA_DO_CHAT}&user_id=eq.${userId}&select=foto_url&limit=1`).catch(() => [])
  return typeof c?.foto_url === 'string' && /^https:\/\//.test(c.foto_url) ? c.foto_url : null
}

export { numeroValido }
