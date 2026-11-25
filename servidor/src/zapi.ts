import './ambiente'
import { randomBytes, randomInt } from 'node:crypto'
import { conversar, type Anexos, type Turno } from './chat'
import { ver } from './sessoes'
import { loginDoUsuario, papelDoAdmin, restDoBanco as rest, somenteDemoDoUsuario } from './supabase'
import { appDaVitrine, vitrineDoPedido } from './apps-parceiros'
import { rotulosTrocados } from '../../src/core/deriv/accountAccess'
import { aposMensagem, assessorPausado, equipeAssumiu, guardarArquivo, guardarDaEquipe, guardarMidiaRecebida, marcarReacao, numeroValido, usuarioDaConversa, type MensagemDoChat } from './assessor-chat'

/*
  Assessor GF no WhatsApp pela Z-API (19/11/2026, Tiago).

  O cliente manda mensagem para o número do assessor; a Z-API avisa este servidor; o número de quem mandou é
  conferido contra o WhatsApp CONFIRMADO no perfil; a mensagem segue para o mesmo Assistente da plataforma
  (conversar em chat.ts, com as mesmas travas: só as contas do login, limites, somenteDemo, I.A. liberada) e a
  resposta volta pelo WhatsApp. Quando o Assistente liga uma I.A., o fim da sessão vira mensagem.

  Confirmar o número: o cliente gera um código em Meu perfil e manda "Confirmar GF 123456" para o assessor. O código
  só vale vindo do mesmo número do perfil. Trocou o número no perfil: deixa de valer até confirmar de novo.

  Por enquanto (Tiago: "somente o meu user de adm") só LIBERADOS usam. Liberar mais gente = acrescentar o e-mail aqui.
*/

export const MARCA_DO_ASSESSOR = 'globalfly'
const LIBERADOS = ['tiagodalri1@live.com']
/** Quem liga a Z-API no ADM (os códigos): só o Tiago. */
export const assessorLiberado = (email?: string | null) => !!email && LIBERADOS.includes(email.trim().toLowerCase())
/** Quem conversa com o Assessor (25/11/2026, Tiago: "pode liberar para todos os ADMs por enquanto"): a mesma regra
 * do Assistente da GF, qualquer administrador da marca (geral ou do parceiro). Os outros recebem "em fase de testes". */
export const assessorLiberadoPara = (userId: string) => papelDoAdmin(userId, MARCA_DO_ASSESSOR).then((p) => !!p).catch(() => false)

const CHAVE_CONFIG = 'ZAPI_GLOBALFLY'
const BASE = 'https://api.z-api.io'
const CODIGO_VALE_MS = 30 * 60_000

interface Config {
  instancia: string; token: string; clientToken: string; segredo: string; numero?: string; conectadoEm?: string
  /** 25/11/2026: o aviso de "entregue/lida" das mensagens enviadas também vem para a plataforma (tiques no chat do ADM) */
  avisoDeStatus?: boolean
  avisoDePresenca?: boolean
  /** 25/11/2026: botão geral do chat no ADM; o Assessor não responde ninguém (as mensagens seguem chegando no chat) */
  pausadoGeral?: boolean
}

/* ------------------------------------------------------------------ configuração (config_servicos) */

let guardada: { c: Config | null; em: number } | null = null
async function config(): Promise<Config | null> {
  if (guardada && Date.now() - guardada.em < 60_000) return guardada.c
  const linhas = await rest<Array<{ valor: string | null }>>(`/config_servicos?chave=eq.${CHAVE_CONFIG}&select=valor&limit=1`).catch(() => [])
  let c: Config | null = null
  try { const v = JSON.parse(String(linhas[0]?.valor ?? '')); if (v?.instancia && v?.token && v?.segredo) c = v } catch { /* vazio */ }
  guardada = { c, em: Date.now() }
  return c
}
async function guardar(c: Config | null): Promise<void> {
  await rest('/config_servicos?on_conflict=chave', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ chave: CHAVE_CONFIG, valor: c ? JSON.stringify(c) : '', atualizado_em: new Date().toISOString() }),
  })
  guardada = { c, em: Date.now() }
}

async function zapi<T>(c: Pick<Config, 'instancia' | 'token' | 'clientToken'>, caminho: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}/instances/${encodeURIComponent(c.instancia)}/token/${encodeURIComponent(c.token)}/${caminho}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(c.clientToken ? { 'Client-Token': c.clientToken } : {}), ...(init.headers as Record<string, string> ?? {}) },
    signal: AbortSignal.timeout(15_000),
  })
  const corpo = await res.json().catch(() => ({} as any))
  if (!res.ok) throw new Error(String(corpo?.error ?? corpo?.message ?? `Z-API respondeu ${res.status}`))
  return corpo as T
}

/** O endereço que a Z-API chama a cada mensagem recebida (o segredo no caminho: a Z-API não assina o aviso). */
const enderecoDoAviso = (publico: string, segredo: string) => `${publico.replace(/\/+$/, '')}/zapi/${MARCA_DO_ASSESSOR}/${segredo}`

export interface EstadoDaConexao { configurado: boolean; conectado: boolean; celularOnline?: boolean; numero?: string; instancia?: string; erro?: string; qr?: string; pausadoGeral?: boolean }

/** Como está a ligação com a Z-API agora (para o ADM). Desconectado traz o QR code para escanear ali mesmo. */
export async function estadoDaConexao(): Promise<EstadoDaConexao> {
  const c = await config()
  if (!c) return { configurado: false, conectado: false }
  try {
    const s = await zapi<{ connected?: boolean; smartphoneConnected?: boolean; error?: string }>(c, 'status')
    if (!s.connected) {
      const qr = await zapi<any>(c, 'qr-code/image').catch(() => null)
      const img = typeof qr?.value === 'string' ? qr.value : typeof qr?.image === 'string' ? qr.image : undefined
      return { configurado: true, conectado: false, instancia: c.instancia, erro: s.error, qr: img ? (img.startsWith('data:') ? img : `data:image/png;base64,${img}`) : undefined }
    }
    let numero = c.numero
    if (!numero) {
      const d = await zapi<{ phone?: string }>(c, 'device').catch(() => null)
      if (d?.phone) { numero = String(d.phone).replace(/\D/g, ''); await guardar({ ...c, numero, conectadoEm: new Date().toISOString() }) }
    }
    if (!c.avisoDeStatus || !c.avisoDePresenca) void garantirAvisoDeStatus(c)
    return { configurado: true, conectado: true, celularOnline: s.smartphoneConnected, numero, instancia: c.instancia, pausadoGeral: !!c.pausadoGeral }
  } catch (e) {
    return { configurado: true, conectado: false, instancia: c.instancia, erro: (e as Error).message }
  }
}

/** Guarda os códigos da Z-API: testa, aponta o aviso de mensagem recebida para este servidor e guarda. */
export async function ligarZapi(dados: { instancia: unknown; token: unknown; clientToken: unknown }, publico: string): Promise<EstadoDaConexao> {
  const novo = {
    instancia: String(dados.instancia ?? '').trim(), token: String(dados.token ?? '').trim(), clientToken: String(dados.clientToken ?? '').trim(),
  }
  if (!/^[A-Za-z0-9]{8,64}$/.test(novo.instancia) || !/^[A-Za-z0-9]{8,64}$/.test(novo.token)) throw new Error('Confira o ID da instância e o Token: copie de novo do painel da Z-API.')
  if (novo.clientToken && !/^[A-Za-z0-9]{8,80}$/.test(novo.clientToken)) throw new Error('O Token de segurança parece incompleto: copie de novo em Segurança, no painel da Z-API.')
  // testa antes de guardar: código errado dá erro aqui e nada muda
  await zapi(novo, 'status').catch((e) => { throw new Error(`A Z-API recusou esses códigos (${(e as Error).message}).`) })
  const anterior = await config()
  const segredo = anterior?.instancia === novo.instancia && anterior.segredo ? anterior.segredo : randomBytes(18).toString('hex')
  const url = enderecoDoAviso(publico, segredo)
  await zapi(novo, 'update-webhook-received', { method: 'PUT', body: JSON.stringify({ value: url }) })
    .catch(() => zapi(novo, 'update-every-webhooks', { method: 'PUT', body: JSON.stringify({ value: url, notifySentByMe: false }) }))
    .catch((e) => { throw new Error(`Não consegui apontar os avisos da Z-API para a plataforma (${(e as Error).message}).`) })
  await guardar({ ...novo, segredo, numero: anterior?.instancia === novo.instancia ? anterior.numero : undefined, pausadoGeral: anterior?.pausadoGeral })
  void garantirAvisoDeStatus({ ...novo, segredo })
  console.log(`[assessor] Z-API ligada (instância ${novo.instancia.slice(0, 6)}…)`)
  return estadoDaConexao()
}

/** Aponta também o aviso de status (enviada/entregue/lida) para a plataforma. Uma vez por conexão. */
async function garantirAvisoDeStatus(c: Config): Promise<void> {
  try {
    // o mesmo endereço que a rota do ADM usa ao ligar (servidor.ts: RETORNO sem o /callback)
    const publico = (process.env.RETORNO ?? 'https://motor.teedscompany.com/callback').replace(/\/callback$/, '').replace(/\/+$/, '')
    if (!/^https:\/\//.test(publico)) return
    await zapi(c, 'update-webhook-message-status', { method: 'PUT', body: JSON.stringify({ value: enderecoDoAviso(publico, c.segredo) }) })
    // 25/11/2026: e o "digitando…" do cliente (PresenceChatCallback)
    await zapi(c, 'update-webhook-chat-presence', { method: 'PUT', body: JSON.stringify({ value: enderecoDoAviso(publico, c.segredo) }) }).catch(() => null)
    const atual = await config()
    if (atual && atual.instancia === c.instancia) await guardar({ ...atual, avisoDeStatus: true, avisoDePresenca: true })
    console.log('[assessor] avisos de status (entregue/lida) e presença apontados para a plataforma')
  } catch (e) { console.warn(`[assessor] não apontei o aviso de status: ${(e as Error).message}`) }
}

/** O botão geral do chat no ADM: o Assessor para (ou volta) de responder todo mundo. */
export async function pausarAssessorGeral(sim: boolean, adminId: string): Promise<EstadoDaConexao> {
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  await guardar({ ...c, pausadoGeral: !!sim })
  console.log(`[assessor] ${sim ? 'PAUSADO para todos' : 'religado para todos'} (admin ${adminId.slice(0, 8)}…)`)
  return estadoDaConexao()
}

export async function desligarZapi(): Promise<void> {
  await guardar(null)
  console.log('[assessor] Z-API desligada da plataforma')
}

/* ------------------------------------------------------------------ telefone */

const digitos = (v: unknown) => String(v ?? '').replace(/\D/g, '')
/** DDD + 8 últimos dígitos: o mesmo número com ou sem o 9 e com ou sem o 55 dá a mesma chave. */
export function chaveDoTelefone(bruto: unknown): string | null {
  let d = digitos(bruto)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length < 10 || d.length > 11) return null
  return d.slice(0, 2) + d.slice(-8)
}

async function telefoneDoPerfil(userId: string): Promise<string> {
  const l = await rest<Array<{ telefone: string | null }>>(`/clientes?user_id=eq.${encodeURIComponent(userId)}&select=telefone&limit=1`)
  return digitos(l[0]?.telefone)
}

interface Vinculo { user_id: string; telefone: string; telefone_chave: string; codigo: string | null; codigo_expira_em: string | null; confirmado_em: string | null; numero_whatsapp: string | null }

/* ------------------------------------------------------------------ o lado do perfil */

export interface EstadoDoPerfil { telefone: string; confirmado: boolean; numeroConfirmado?: string; numeroAssessor?: string; conectado: boolean }

export async function estadoDoPerfil(userId: string): Promise<EstadoDoPerfil> {
  const [telefone, vinc, cfg] = await Promise.all([
    telefoneDoPerfil(userId),
    rest<Vinculo[]>(`/assessor_whatsapp_vinculos?user_id=eq.${encodeURIComponent(userId)}&marca=eq.${MARCA_DO_ASSESSOR}&limit=1`).then((l) => l[0] ?? null),
    config(),
  ])
  const chave = chaveDoTelefone(telefone)
  const confirmado = !!(vinc?.confirmado_em && chave && vinc.telefone_chave === chave)
  return { telefone, confirmado, numeroConfirmado: confirmado ? vinc!.numero_whatsapp ?? undefined : undefined, numeroAssessor: cfg?.numero, conectado: !!cfg?.numero }
}

/** Um código novo para o número do perfil (vale 30 min). Gerar de novo troca o código; a confirmação anterior segue até o número mudar. */
export async function codigoDoPerfil(userId: string): Promise<{ codigo: string; numeroAssessor: string; expiraEm: string }> {
  const telefone = await telefoneDoPerfil(userId)
  const chave = chaveDoTelefone(telefone)
  if (!chave) throw new Error('Coloque o seu WhatsApp com DDD no campo Telefone e salve antes de confirmar.')
  const cfg = await config()
  if (!cfg?.numero) throw new Error('O WhatsApp do assessor ainda não está conectado na plataforma.')
  const codigo = String(randomInt(100000, 1000000))
  const expiraEm = new Date(Date.now() + CODIGO_VALE_MS).toISOString()
  const atual = await rest<Vinculo[]>(`/assessor_whatsapp_vinculos?user_id=eq.${encodeURIComponent(userId)}&marca=eq.${MARCA_DO_ASSESSOR}&limit=1`).then((l) => l[0] ?? null)
  // o número mudou: a confirmação antiga cai junto
  const manter = atual?.confirmado_em && atual.telefone_chave === chave
  await rest('/assessor_whatsapp_vinculos?on_conflict=user_id,marca', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({
      user_id: userId, marca: MARCA_DO_ASSESSOR, telefone, telefone_chave: chave, codigo, codigo_expira_em: expiraEm,
      confirmado_em: manter ? atual!.confirmado_em : null, numero_whatsapp: manter ? atual!.numero_whatsapp : null, atualizado_em: new Date().toISOString(),
    }),
  })
  return { codigo, numeroAssessor: cfg.numero, expiraEm }
}

export async function desvincularPerfil(userId: string): Promise<void> {
  await rest(`/assessor_whatsapp_vinculos?user_id=eq.${encodeURIComponent(userId)}&marca=eq.${MARCA_DO_ASSESSOR}`, { method: 'DELETE' })
}

/* ------------------------------------------------------------------ enviar */

/** Negrito do Assistente (**x**) vira o do WhatsApp (*x*); títulos em markdown perdem o #. */
export function paraWhatsapp(texto: string): string {
  return texto
    .replace(/\*\*([^*\n]+)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function enviar(numero: string, texto: string, userId: string | null, digitando = 2): Promise<void> {
  const c = await config()
  if (!c) return
  const mensagem = paraWhatsapp(texto).slice(0, 4000)
  if (!mensagem) return
  try {
    const r = await zapi<{ messageId?: string }>(c, 'send-text', { method: 'POST', body: JSON.stringify({ phone: numero, message: mensagem, delayTyping: digitando }) })
    void guardarMensagem({ numero, userId, papel: 'assessor', texto: mensagem, idWhatsapp: r?.messageId ? `env:${r.messageId}` : null })
  } catch (e) {
    console.error(`[assessor] não enviei para …${numero.slice(-4)}: ${(e as Error).message}`)
  }
}

async function guardarMensagem(m: { numero: string; userId: string | null; papel: 'cliente' | 'assessor'; texto: string; tipo?: string; idWhatsapp: string | null; nome?: string | null; citando?: string | null }): Promise<boolean> {
  try {
    await rest('/assessor_whatsapp_mensagens', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ marca: MARCA_DO_ASSESSOR, numero: m.numero, user_id: m.userId, papel: m.papel, texto: m.texto.slice(0, 4000), tipo: m.tipo ?? 'texto', id_whatsapp: m.idWhatsapp, ...(m.citando ? { citando: m.citando } : {}) }), // citando só quando há (a coluna nasceu em 25/11)
    })
    // 25/11/2026: a conversa do número (lista do chat no ADM) acompanha cada mensagem
    await aposMensagem(m.numero, { papel: m.papel, texto: /^\[\w+\]$/.test(m.texto) ? null : m.texto, tipo: m.tipo, userId: m.userId, nome: m.nome })
    return true
  } catch (e) {
    if ((e as any)?.code === '23505') return false // a Z-API mandou o mesmo aviso de novo
    console.error(`[assessor] não guardei a mensagem: ${(e as Error).message}`)
    return true
  }
}

async function historicoDe(numero: string, userId: string): Promise<Turno[]> {
  const l = await rest<Array<{ papel: string; texto: string }>>(
    `/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_ASSESSOR}&numero=eq.${encodeURIComponent(numero)}&user_id=eq.${encodeURIComponent(userId)}&criado_em=gte.${new Date(Date.now() - 6 * 3600_000).toISOString()}&select=papel,texto&order=criado_em.desc&limit=13`,
  ).catch(() => [])
  // a primeira é a mensagem que acabou de chegar (já guardada): sai do histórico
  return l.slice(1).reverse().filter((t) => t.texto).map((t) => ({ papel: t.papel === 'cliente' ? 'cliente' : 'assistente', texto: t.texto }))
}

/* ------------------------------------------------------------------ a equipe responde pelo ADM (chat) */

/** Texto da equipe para o cliente, pelo número do Assessor. Quem escreve assume a conversa (o Assessor pausa). */
export async function enviarPelaEquipe(adminId: string, numero: unknown, texto: unknown, citando?: unknown): Promise<MensagemDoChat> {
  const n = numeroValido(numero)
  const t = String(texto ?? '').trim().slice(0, 4000)
  if (!t) throw new Error('Escreva a mensagem.')
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  const cit = typeof citando === 'string' && /^[\w-]{4,80}$/.test(citando) ? citando : null
  const r = await zapi<{ messageId?: string }>(c, 'send-text', { method: 'POST', body: JSON.stringify({ phone: n, message: t, ...(cit ? { messageId: cit } : {}) }) })
  await equipeAssumiu(n, adminId)
  return guardarDaEquipe({ numero: n, papel: 'equipe', texto: t, autor: adminId, idWhatsapp: r?.messageId ? `env:${r.messageId}` : null, citando: cit, userId: await usuarioDaConversa(n) })
}

/** Foto, áudio, vídeo ou documento da equipe (chega em base64 da tela, até ~1,4 MB). */
export async function arquivoPelaEquipe(adminId: string, d: any): Promise<MensagemDoChat> {
  const n = numeroValido(d?.numero)
  const mime = String(d?.mime ?? '').split(';')[0].trim().toLowerCase()
  const nome = String(d?.nome ?? 'arquivo').replace(/[\\/]/g, '_').slice(0, 120)
  const legenda = String(d?.legenda ?? '').trim().slice(0, 1000)
  const dados = Buffer.from(String(d?.dados ?? ''), 'base64')
  if (!dados.length) throw new Error('Arquivo vazio.')
  if (dados.length > 1_400_000) throw new Error('O arquivo passou de 1,4 MB. Mande um menor.')
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  const tipo = mime.startsWith('image/') ? 'imagem' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'documento'
  const uri = `data:${mime || 'application/octet-stream'};base64,${dados.toString('base64')}`
  const ext = (nome.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (mime === 'application/pdf' ? 'pdf' : 'bin')).toLowerCase()
  const voz = tipo === 'audio' && nome.startsWith('audio-gravado')
  const caminho = tipo === 'imagem' ? 'send-image' : tipo === 'audio' ? 'send-audio' : tipo === 'video' ? 'send-video' : `send-document/${ext}`
  const corpo = tipo === 'imagem' ? { phone: n, image: uri, caption: legenda || undefined }
    : tipo === 'audio' ? { phone: n, audio: uri, waveform: voz }
    : tipo === 'video' ? { phone: n, video: uri, caption: legenda || undefined }
    : { phone: n, document: uri, fileName: nome, caption: legenda || undefined }
  const r = await zapi<{ messageId?: string }>(c, caminho, { method: 'POST', body: JSON.stringify(corpo) })
  const chave = r?.messageId ? `env_${r.messageId}` : `equipe_${Date.now()}`
  const guardado = await guardarArquivo(n, chave, dados, mime, nome)
  await equipeAssumiu(n, adminId)
  return guardarDaEquipe({
    numero: n, papel: 'equipe', tipo, texto: legenda || null, autor: adminId, idWhatsapp: r?.messageId ? `env:${r.messageId}` : null,
    midia: guardado ? { caminho: guardado, mime, nome, tamanho: dados.length, voz } : null, userId: await usuarioDaConversa(n),
  })
}

/**
 * "Sugerir resposta" (25/11/2026): o Assessor escreve a resposta para a última mensagem do cliente, com os dados
 * dele, como rascunho para a equipe revisar. Nada é executado (Dono.rascunho) e nada é enviado daqui.
 */
export async function sugerirResposta(numero: unknown): Promise<string> {
  const n = numeroValido(numero)
  const userId = await usuarioDaConversa(n)
  if (!userId) throw new Error('Este número ainda não confirmou o WhatsApp no perfil: o Assessor não sabe de quem é a conta.')
  const login = await loginDoUsuario(userId)
  if (!login) throw new Error('Não achei o login deste cliente.')
  const l = await rest<Array<{ papel: string; texto: string }>>(
    `/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_ASSESSOR}&numero=eq.${n}&papel=in.(cliente,assessor,equipe)&select=papel,texto&order=criado_em.desc&limit=14`)
  const real = (t: string) => !!t && !/^\[\w+\]$/.test(t)
  const i = l.findIndex((x) => x.papel === 'cliente' && real(x.texto))
  if (i < 0) throw new Error('O cliente ainda não escreveu nada para responder.')
  const historico: Turno[] = l.slice(i + 1).reverse().filter((t) => real(t.texto)).map((t) => ({ papel: t.papel === 'cliente' ? 'cliente' : 'assistente', texto: t.texto.replace(/^🎤 /, '') }))
  const trocados = rotulosTrocados(login.email, MARCA_DO_ASSESSOR)
  const parceiro = await rest<Array<{ parceiro: string | null }>>(`/clientes?user_id=eq.${encodeURIComponent(userId)}&select=parceiro&limit=1`).then((x) => x[0]?.parceiro ?? '').catch(() => '')
  const vitrine = vitrineDoPedido(MARCA_DO_ASSESSOR, parceiro ?? '')
  const app = await appDaVitrine(MARCA_DO_ASSESSOR, vitrine)
  const r = await conversar({ id: userId, somenteDemo: somenteDemoDoUsuario(login), vitrine, app, canal: 'assessor-whatsapp', trocados, rascunho: true },
    historico, l[i].texto.replace(/^🎤 /, ''), MARCA_DO_ASSESSOR, trocados ? { trocados: true } : {})
  return paraWhatsapp(r.texto || '')
}

/** A foto de perfil do WhatsApp do número (link temporário da Z-API), guardada 6 h. Sem foto ou foto privada: null. */
const fotos = new Map<string, { link: string | null; em: number }>()
export async function fotoDoWhatsapp(numero: unknown): Promise<string | null> {
  const n = numeroValido(numero)
  const g = fotos.get(n)
  if (g && Date.now() - g.em < 6 * 3600_000) return g.link
  const c = await config()
  if (!c) return null
  const r = await zapi<any>(c, `profile-picture?phone=${n}`).catch(() => null)
  const link = (Array.isArray(r) ? r[0]?.link : r?.link) ?? null
  const ok = typeof link === 'string' && /^https:\/\//.test(link) ? link : null
  fotos.set(n, { link: ok, em: Date.now() })
  if (fotos.size > 3000) fotos.clear()
  return ok
}

/* ---- 25/11/2026: encaminhar, apagar, editar, status, bloquear, conferir número (docs oficiais da Z-API) */

async function minhaMensagem(numero: string, id: unknown): Promise<any> {
  const i = String(id ?? '')
  if (!/^\d+$/.test(i)) throw new Error('Mensagem inválida.')
  const [m] = await rest<any[]>(`/assessor_whatsapp_mensagens?id=eq.${i}&marca=eq.${MARCA_DO_ASSESSOR}&numero=eq.${numero}&select=*&limit=1`)
  if (!m) throw new Error('Mensagem não encontrada.')
  return m
}
const wamidDe = (idWpp: unknown) => String(idWpp ?? '').replace(/^(rec|env):/, '')

/** Encaminha uma mensagem (de qualquer lado da conversa) para até 5 conversas. A cópia aparece em cada destino. */
export async function encaminharPelaEquipe(adminId: string, origem: unknown, id: unknown, destinos: unknown): Promise<number> {
  const o = numeroValido(origem)
  const m = await minhaMensagem(o, id)
  const w = wamidDe(m.id_whatsapp)
  if (!w) throw new Error('Esta mensagem não pode ser encaminhada.')
  const lista = (Array.isArray(destinos) ? destinos : []).map((d) => numeroValido(d)).filter((d) => d !== o).slice(0, 5)
  if (!lista.length) throw new Error('Escolha para quem encaminhar.')
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  let ok = 0
  for (const d of lista) {
    const r = await zapi<{ messageId?: string }>(c, 'forward-message', { method: 'POST', body: JSON.stringify({ phone: d, messageId: w, messagePhone: o }) }).catch(() => null)
    if (!r) continue
    ok++
    await equipeAssumiu(d, adminId)
    await guardarDaEquipe({ numero: d, papel: 'equipe', tipo: m.tipo, texto: m.texto && !/^\[\w+\]$/.test(m.texto) ? m.texto : null, autor: adminId, idWhatsapp: r.messageId ? `env:${r.messageId}` : null, midia: m.midia ?? null, userId: await usuarioDaConversa(d) })
  }
  if (!ok) throw new Error('A Z-API não conseguiu encaminhar agora. Tente de novo.')
  return ok
}

/** Apaga para todos uma mensagem que saiu pelo Assessor (a equipe continua vendo o original, riscado). */
export async function apagarPelaEquipe(numero: unknown, id: unknown): Promise<void> {
  const n = numeroValido(numero)
  const m = await minhaMensagem(n, id)
  if (m.papel !== 'assessor' && m.papel !== 'equipe') throw new Error('Só dá para apagar mensagens que saíram pelo Assessor.')
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  await zapi(c, `messages?messageId=${encodeURIComponent(wamidDe(m.id_whatsapp))}&phone=${n}&owner=true`, { method: 'DELETE' })
  await rest(`/assessor_whatsapp_mensagens?id=eq.${m.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'apagada', atualizado_em: new Date().toISOString() }) })
}

/** Edita o texto de uma mensagem que saiu pelo Assessor (o WhatsApp mostra "editada" para o cliente). */
export async function editarPelaEquipe(numero: unknown, id: unknown, texto: unknown): Promise<void> {
  const n = numeroValido(numero)
  const t = String(texto ?? '').trim().slice(0, 4000)
  if (!t) throw new Error('Escreva o texto novo.')
  const m = await minhaMensagem(n, id)
  if ((m.papel !== 'assessor' && m.papel !== 'equipe') || m.tipo !== 'texto') throw new Error('Só dá para editar texto que saiu pelo Assessor.')
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  await zapi(c, 'send-text', { method: 'POST', body: JSON.stringify({ phone: n, message: t, editMessageId: wamidDe(m.id_whatsapp) }) })
  await rest(`/assessor_whatsapp_mensagens?id=eq.${m.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ texto: t, status: 'editada', atualizado_em: new Date().toISOString() }) })
}

/** Publica um status (story) no WhatsApp do Assessor: texto, foto ou vídeo (base64 da tela). */
export async function postarStatus(d: any): Promise<void> {
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  const tipo = d?.tipo === 'imagem' || d?.tipo === 'video' ? d.tipo : 'texto'
  const legenda = String(d?.texto ?? '').trim().slice(0, 700)
  if (tipo === 'texto') {
    if (!legenda) throw new Error('Escreva o texto do status.')
    await zapi(c, 'send-text-status', { method: 'POST', body: JSON.stringify({ message: legenda }) })
  } else {
    const dados = Buffer.from(String(d?.dados ?? ''), 'base64')
    if (!dados.length) throw new Error('Escolha a foto ou o vídeo.')
    if (dados.length > 1_400_000) throw new Error('O arquivo passou de 1,4 MB. Mande um menor.')
    const mime = String(d?.mime ?? (tipo === 'imagem' ? 'image/jpeg' : 'video/mp4')).split(';')[0]
    const uri = `data:${mime};base64,${dados.toString('base64')}`
    await zapi(c, tipo === 'imagem' ? 'send-image-status' : 'send-video-status', { method: 'POST', body: JSON.stringify(tipo === 'imagem' ? { image: uri, caption: legenda || undefined } : { video: uri, caption: legenda || undefined }) })
  }
  console.log(`[assessor] status publicado (${tipo})`)
}

/** Bloqueia ou desbloqueia o número no WhatsApp do Assessor. */
export async function bloquearContato(numero: unknown, sim: boolean): Promise<void> {
  const n = numeroValido(numero)
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  await zapi(c, 'contacts/modify-blocked', { method: 'POST', body: JSON.stringify({ phone: n, action: sim ? 'block' : 'unblock' }) })
}

/** Confere se o número tem WhatsApp e devolve o número como o WhatsApp conhece (com ou sem o 9). */
export async function numeroNoWhatsapp(numero: string): Promise<string> {
  const c = await config()
  if (!c) return numero
  const r = await zapi<any>(c, `phone-exists/${numero}`).catch(() => null)
  const x = Array.isArray(r) ? r[0] : r
  if (x && x.exists === false) throw new Error('Este número não tem WhatsApp.')
  const certo = String(x?.phone ?? x?.outputPhone ?? '').replace(/\D/g, '')
  return /^\d{12,15}$/.test(certo) ? certo : numero
}

/** A equipe abriu a conversa: o cliente vê os tiques azuis na última mensagem dele. */
export async function marcarLidaPelaEquipe(numero: string): Promise<void> {
  const [m] = await rest<any[]>(`/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_ASSESSOR}&numero=eq.${numero}&papel=eq.cliente&id_whatsapp=not.is.null&select=id_whatsapp&order=criado_em.desc&limit=1`).catch(() => [])
  if (m?.id_whatsapp) await marcarLida(numero, wamidDe(m.id_whatsapp))
}

/** Reação da equipe numa mensagem do cliente (vazio tira a reação). */
export async function reagirPelaEquipe(numero: unknown, wamid: unknown, emoji: unknown): Promise<void> {
  const n = numeroValido(numero)
  const w = String(wamid ?? '')
  if (!/^[\w-]{4,80}$/.test(w)) throw new Error('Mensagem inválida.')
  const e = String(emoji ?? '').slice(0, 8)
  const c = await config()
  if (!c) throw new Error('O WhatsApp do Assessor não está conectado.')
  if (e) await zapi(c, 'send-reaction', { method: 'POST', body: JSON.stringify({ phone: n, messageId: w, reaction: e }) })
  else await zapi(c, 'send-remove-reaction', { method: 'POST', body: JSON.stringify({ phone: n, messageId: w }) }).catch(() => null)
  await marcarReacao(n, w, e)
}

/* ------------------------------------------------------------------ receber */

/** Quem não é reconhecido recebe a explicação no máximo a cada 6 h (sem conversa em círculo com robôs de outras empresas). */
const avisados = new Map<string, number>()
function jaAvisado(numero: string): boolean {
  const t = avisados.get(numero)
  if (t && Date.now() - t < 6 * 3600_000) return true
  avisados.set(numero, Date.now())
  if (avisados.size > 5000) avisados.clear()
  return false
}

/** Uma mensagem por vez por número: a segunda espera a resposta da primeira. */
const filas = new Map<string, Promise<void>>()

export function segredoConfere(segredo: string): Promise<boolean> {
  return config().then((c) => !!c && segredo.length >= 20 && c.segredo === segredo)
}

/** O aviso da Z-API (já com o segredo conferido). Responde na hora; o trabalho segue por fora. */
/** "digitando…" / "gravando áudio…" / online de cada número, guardado 2 min (a tela pergunta junto das mudanças). */
const presencas = new Map<string, { status: string; em: number }>()
export function presencasRecentes(): Record<string, string> {
  const saida: Record<string, string> = {}
  for (const [n, p] of presencas) if (Date.now() - p.em < 120_000) saida[n] = p.status
  return saida
}

export function avisoRecebido(corpo: any): void {
  if (corpo?.type === 'MessageStatusCallback') { void statusRecebido(corpo); return }
  if (corpo?.type === 'PresenceChatCallback') {
    const n = String(corpo.phone ?? ''); const st = String(corpo.status ?? '').toUpperCase()
    if (/^\d{10,15}$/.test(n) && st) presencas.set(n, { status: st, em: Date.now() })
    if (presencas.size > 3000) presencas.clear()
    return
  }
  if (corpo?.type !== 'ReceivedCallback' || corpo.fromMe || corpo.isGroup || corpo.isNewsletter || corpo.broadcast || corpo.isStatusReply) return
  // 25/11/2026: reação, edição e "apagou para todos" do cliente só atualizam a mensagem no chat (o Assessor não responde)
  if (corpo.reaction || corpo.isEdit || corpo.notification === 'REVOKE') { void mudancaDoCliente(corpo); return }
  if (corpo.notification) return
  const numero = String(corpo.phone ?? '')
  if (!/^\d{10,15}$/.test(numero)) { console.warn('[assessor] mensagem sem número de telefone (contato oculto): ignorada'); return }
  const antes = filas.get(numero) ?? Promise.resolve()
  const agora = antes.then(() => atender(numero, corpo)).catch((e) => console.error(`[assessor] falhou com …${numero.slice(-4)}: ${(e as Error).message}`))
  filas.set(numero, agora)
  void agora.finally(() => { if (filas.get(numero) === agora) filas.delete(numero) })
}

/** Os tiques das mensagens que saíram pelo Assessor (Assessor e equipe): SENT → enviada, RECEIVED → entregue, READ/PLAYED → lida. */
async function statusRecebido(corpo: any): Promise<void> {
  const status = String(corpo?.status ?? '').toUpperCase()
  const novo = status === 'READ' || status === 'PLAYED' ? 'lida' : status === 'RECEIVED' || status === 'DELIVERED' ? 'entregue' : status === 'SENT' ? 'enviada' : null
  const ids = (Array.isArray(corpo?.ids) ? corpo.ids : [corpo?.id ?? corpo?.messageId]).map(String).filter((x: string) => /^[\w-]{4,80}$/.test(x)).slice(0, 50)
  if (!novo || !ids.length) return
  // nunca volta atrás (lida não vira entregue se os avisos chegarem fora de ordem)
  const antes = novo === 'lida' ? '' : novo === 'entregue' ? '&status=in.(enviada,pendente)' : '&status=eq.pendente'
  await rest(`/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_ASSESSOR}&id_whatsapp=in.(${ids.map((i: string) => `env:${i}`).join(',')})${antes}`, {
    method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: novo, atualizado_em: new Date().toISOString() }),
  }).catch(() => null)
}

async function mudancaDoCliente(corpo: any): Promise<void> {
  const n = String(corpo.phone ?? '')
  if (!/^\d{10,15}$/.test(n)) return
  const agora = new Date().toISOString()
  const alvo = (id: unknown) => `/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_ASSESSOR}&numero=eq.${n}&id_whatsapp=in.(rec:${String(id)},env:${String(id)})`
  try {
    if (corpo.reaction) {
      const ref = corpo.reaction.referencedMessage?.messageId
      if (ref && /^[\w-]{4,80}$/.test(String(ref))) await rest(alvo(ref), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ reacao: String(corpo.reaction.value ?? '').slice(0, 8) || null, atualizado_em: agora }) })
      return
    }
    if (corpo.isEdit) {
      const texto = String(corpo.text?.message ?? corpo.image?.caption ?? corpo.video?.caption ?? '').trim().slice(0, 4000)
      if (texto && corpo.messageId) await rest(alvo(corpo.messageId), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ texto: `${texto}`, status: 'editada', atualizado_em: agora }) })
      return
    }
    if (corpo.notification === 'REVOKE') {
      const id = corpo.referenceMessageId ?? corpo.messageId
      if (id) await rest(alvo(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'apagada', atualizado_em: agora }) })
    }
  } catch (e) { console.warn(`[assessor] não atualizei a mudança do cliente …${n.slice(-4)}: ${(e as Error).message}`) }
}

const CONFIRMAR = /\bconfirmar\s*gf\s*(\d{6})\b/i
const SITE = 'https://globalflytrade.com'

async function atender(numero: string, corpo: any): Promise<void> {
  const texto = String(corpo.text?.message ?? corpo.image?.caption ?? corpo.video?.caption ?? '').trim().slice(0, 2000)
  const tipo = corpo.audio ? 'audio' : corpo.image ? 'imagem' : corpo.video ? 'video' : corpo.document ? 'documento' : corpo.sticker ? 'figurinha' : corpo.text ? 'texto' : 'outro'
  const idWpp = corpo.messageId ? `rec:${corpo.messageId}` : null
  // o nome que a pessoa usa no WhatsApp (aparece na lista do chat até ela ser reconhecida)
  const nomeNoWhats = String(corpo.senderName ?? corpo.chatName ?? '').trim() || null
  const citando = typeof corpo.referenceMessageId === 'string' ? corpo.referenceMessageId : null
  const chave = chaveDoTelefone(numero)

  // 1) confirmação do número
  const pedidoDeConfirmar = texto.match(CONFIRMAR)
  if (pedidoDeConfirmar) {
    if (!(await guardarMensagem({ numero, userId: null, papel: 'cliente', texto, idWhatsapp: idWpp, nome: nomeNoWhats }))) return
    const l = await rest<Vinculo[]>(`/assessor_whatsapp_vinculos?marca=eq.${MARCA_DO_ASSESSOR}&codigo=eq.${pedidoDeConfirmar[1]}&codigo_expira_em=gt.${new Date().toISOString()}&limit=2`)
    const v = l.length === 1 ? l[0] : null
    if (!v) return enviar(numero, 'Esse código venceu ou não existe. Gere um novo em *Meu perfil › WhatsApp do Assessor* na plataforma e mande de novo.', null)
    const perfil = chaveDoTelefone(await telefoneDoPerfil(v.user_id))
    if (!chave || perfil !== chave || v.telefone_chave !== chave) {
      return enviar(numero, 'Esse código foi gerado para outro número. Mande a mensagem do WhatsApp que está no seu perfil, ou corrija o telefone em *Meu perfil* e gere outro código.', null)
    }
    // um número só pode estar confirmado numa conta
    const outros = await rest<Vinculo[]>(`/assessor_whatsapp_vinculos?marca=eq.${MARCA_DO_ASSESSOR}&telefone_chave=eq.${chave}&confirmado_em=not.is.null&user_id=neq.${v.user_id}&select=user_id&limit=1`)
    if (outros.length) return enviar(numero, 'Este número já está confirmado em outra conta da GlobalFly. Fale com o suporte na plataforma para resolvermos.', null)
    await rest(`/assessor_whatsapp_vinculos?user_id=eq.${v.user_id}&marca=eq.${MARCA_DO_ASSESSOR}`, {
      method: 'PATCH', body: JSON.stringify({ confirmado_em: new Date().toISOString(), numero_whatsapp: numero, codigo: null, codigo_expira_em: null, atualizado_em: new Date().toISOString() }),
    })
    console.log(`[assessor] número …${numero.slice(-4)} confirmado (cliente ${v.user_id.slice(0, 8)}…)`)
    const nome = String(corpo.senderName ?? '').trim().split(/\s+/)[0]
    return enviar(numero, `✅ Pronto${nome ? `, ${nome}` : ''}! Seu WhatsApp está confirmado.\n\nAgora é só me chamar aqui: posso ver seu saldo, ligar e parar suas I.A. e te contar como foi cada sessão. Pode mandar áudio também.`, v.user_id)
  }

  // 2) quem é
  const candidatos = chave
    ? await rest<Vinculo[]>(`/assessor_whatsapp_vinculos?marca=eq.${MARCA_DO_ASSESSOR}&telefone_chave=eq.${chave}&confirmado_em=not.is.null&limit=3`)
    : []
  const validos: Vinculo[] = []
  for (const v of candidatos) if (chaveDoTelefone(await telefoneDoPerfil(v.user_id)) === chave) validos.push(v)
  const dono = validos.length === 1 ? validos[0] : null
  if (!(await guardarMensagem({ numero, userId: dono?.user_id ?? null, papel: 'cliente', texto: texto || `[${tipo}]`, tipo, idWhatsapp: idWpp, nome: nomeNoWhats, citando }))) return
  // a foto, o áudio, o vídeo ou o documento ficam guardados para a equipe ver no chat (sem segurar a resposta)
  if (idWpp && tipo !== 'texto') void guardarMidiaRecebida(idWpp, numero, corpo)
  // a equipe assumiu esta conversa no ADM: o Assessor fica quieto (a mensagem já aparece no chat)
  if (await assessorPausado(numero)) { console.log(`[assessor] …${numero.slice(-4)} com a equipe: o Assessor não respondeu`); return }
  if ((await config())?.pausadoGeral) { console.log(`[assessor] pausado para todos: …${numero.slice(-4)} ficou para a equipe`); return }

  if (validos.length > 1) {
    if (!jaAvisado(numero)) await enviar(numero, 'Este número aparece em mais de uma conta da GlobalFly, então por segurança não consigo mexer em nenhuma. Fale com o suporte na plataforma para deixarmos o número em uma conta só.', null)
    return
  }
  if (!dono) {
    if (!jaAvisado(numero)) {
      await enviar(numero, 'Olá! Eu sou o *Assessor GF*, da GlobalFly. 👋\n\nAinda não reconheço este número. Se você já é membro, entre na plataforma, abra *Meu perfil › WhatsApp do Assessor* e toque em *Confirmar no WhatsApp*.\n\nAinda não é membro? Conheça em ' + SITE, null)
    }
    return
  }

  const login = await loginDoUsuario(dono.user_id)
  if (!login || !(await assessorLiberadoPara(dono.user_id))) {
    if (!jaAvisado(numero)) await enviar(numero, 'Olá! O *Assessor GF* está em fase de testes e logo vai estar disponível para a sua conta. Enquanto isso, a plataforma segue com tudo funcionando normalmente.', null)
    return
  }

  // 3) o que veio junto
  // 25/11/2026 (Tiago): nos ADMs com os rótulos trocados, o WhatsApp fala e liga pelo nome da plataforma
  // ("liga na real" = a conta que aparece como Real na tela dele, que por trás é a demo)
  const trocados = rotulosTrocados(login.email, MARCA_DO_ASSESSOR)
  const anexos: Anexos = trocados ? { trocados: true } : {}
  if (corpo.video) return enviar(numero, 'Por aqui eu ainda não consigo assistir vídeo. Me manda uma foto da tela ou um áudio que eu te ajudo.', dono.user_id)
  if (corpo.audio?.audioUrl) {
    const a = await baixar(String(corpo.audio.audioUrl), 1_300_000)
    if (!a) return enviar(numero, 'Não consegui ouvir esse áudio. Pode mandar de novo, ou um mais curto?', dono.user_id)
    anexos.audio = { mime: String(corpo.audio.mimeType ?? a.mime ?? 'audio/ogg').split(';')[0].trim().toLowerCase() || 'audio/ogg', dados: a.dados }
  }
  if (corpo.image?.imageUrl) {
    const i = await baixar(String(corpo.image.imageUrl), 1_300_000)
    if (!i) return enviar(numero, 'Não consegui abrir essa imagem. Pode mandar de novo?', dono.user_id)
    const mime = String(corpo.image.mimeType ?? i.mime ?? 'image/jpeg').split(';')[0].trim().toLowerCase()
    anexos.imagens = [{ mime: /^image\/(jpeg|png|webp)$/.test(mime) ? mime : 'image/jpeg', dados: i.dados }]
  }
  if (!texto && !anexos.audio && !anexos.imagens) return enviar(numero, 'Por aqui eu entendo texto, áudio e foto. Me conta o que você precisa?', dono.user_id)

  // 4) o Assistente, com as travas de sempre
  void marcarLida(numero, corpo.messageId)
  const historico = await historicoDe(numero, dono.user_id)
  const parceiro = await rest<Array<{ parceiro: string | null }>>(`/clientes?user_id=eq.${encodeURIComponent(dono.user_id)}&select=parceiro&limit=1`).then((l) => l[0]?.parceiro ?? '').catch(() => '')
  const vitrine = vitrineDoPedido(MARCA_DO_ASSESSOR, parceiro ?? '')
  const app = await appDaVitrine(MARCA_DO_ASSESSOR, vitrine)
  const t0 = Date.now()
  const r = await conversar({ id: dono.user_id, somenteDemo: somenteDemoDoUsuario(login), vitrine, app, perguntarConta: true, canal: 'assessor-whatsapp', trocados }, historico, texto, MARCA_DO_ASSESSOR, anexos)
  console.log(`[assessor] respondeu …${numero.slice(-4)} em ${Date.now() - t0} ms${r.proposta?.sessaoId ? ` · ligou ${r.proposta.roboNome}` : ''}`)
  // o que a pessoa falou no áudio fica no histórico (sem isso, "me enganei, era na demo" chegava sem os valores)
  if (anexos.audio && r.transcricao && idWpp) {
    void rest(`/assessor_whatsapp_mensagens?marca=eq.${MARCA_DO_ASSESSOR}&id_whatsapp=eq.${encodeURIComponent(idWpp)}`, {
      method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ texto: `🎤 ${r.transcricao}`.slice(0, 4000) }),
    }).catch(() => null)
  }
  // 25/11/2026 (Tiago: "melhorar o padrão dessas mensagens"): ligou = sempre o mesmo modelo, com os números da proposta
  const resposta = r.proposta?.sessaoId ? mensagemDoInicio(r.proposta, trocados) : (r.texto || 'Me embolei aqui. Pode repetir de outro jeito?')
  await enviar(numero, resposta, dono.user_id, 1)
  if (r.proposta?.sessaoId) vigiar(r.proposta.sessaoId, numero, dono.user_id, trocados)
}

async function baixar(url: string, teto: number): Promise<{ mime: string; dados: string } | null> {
  if (!/^https:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return null
    const b = Buffer.from(await res.arrayBuffer())
    if (!b.length || b.length > teto) return null
    return { mime: String(res.headers.get('content-type') ?? ''), dados: b.toString('base64') }
  } catch { return null }
}

async function marcarLida(numero: string, messageId: unknown): Promise<void> {
  const c = await config()
  if (!c || typeof messageId !== 'string') return
  await zapi(c, 'read-message', { method: 'POST', body: JSON.stringify({ phone: numero, messageId }) }).catch(() => null)
}

/* ------------------------------------------------------------------ o fim da sessão vira mensagem */

const vigiadas = new Set<string>()
function vigiar(sessaoId: string, numero: string, userId: string, trocados = false): void {
  if (vigiadas.has(sessaoId)) return
  vigiadas.add(sessaoId)
  const ate = Date.now() + 12 * 3600_000
  const t = setInterval(() => {
    const s = ver(sessaoId)
    // sumiu (reinício do servidor) ou passou do prazo: para sem inventar resultado
    if (!s || Date.now() > ate) { clearInterval(t); vigiadas.delete(sessaoId); return }
    if (s.estado?.rodando || s.terminouEm === null) return
    clearInterval(t); vigiadas.delete(sessaoId)
    void enviar(numero, mensagemDoFim(s, trocados), userId, 1)
  }, 10_000)
  t.unref?.()
}

/* Modelo das mensagens (25/11/2026): título em negrito com o emoji do momento, a conta logo abaixo,
 * uma linha em branco e os números um por linha. Sem "•", sem frase quebrada. */
const din = (v: number, moeda: string) => `${moeda === 'USD' ? 'US$' : moeda} ${v.toFixed(2).replace('.', ',')}`
/** Com os rótulos trocados (ADMs), o nome é o da tela: a virtual aparece como real. */
// 25/11/2026 (Tiago): sem o código da conta (DOT, ROT…), só "Conta real" ou "Conta demo"
const nomeDaConta = (demo: boolean, _contaId: string, trocados = false) => (demo !== trocados ? 'Conta demo' : '*Conta real*')
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export function mensagemDoInicio(p: { roboNome: string; contaId: string; demo: boolean; moeda: string; entrada: number; takeProfit: number; stopLoss: number; semStop?: boolean }, trocados = false): string {
  return `🟢 *${p.roboNome} ligada*\n${nomeDaConta(p.demo, p.contaId, trocados)}\n\n` +
    `Entrada: *${din(p.entrada, p.moeda)}*\nMeta: *${din(p.takeProfit, p.moeda)}*\nLimite de perda: *${p.semStop ? 'sem limite' : din(p.stopLoss, p.moeda)}*\n\n` +
    (p.semStop ? '_Sem limite de perda: ela só para na meta, se você pedir para parar ou quando o saldo acabar._\n' : '') +
    '_Te aviso aqui quando terminar._'
}

/** O motivo da parada em português de gente (o motor guarda o texto técnico, às vezes em inglês da Deriv). */
export function motivoLegivel(motivo: string): string {
  const m = motivo.toLowerCase()
  if (/insufficientbalance|insufficient balance|saldo insuficiente/.test(m)) return 'saldo insuficiente nessa conta'
  if (/tabela de recupera/.test(m)) return 'a recuperação chegou ao fim da tabela'
  if (/marketisclosed|market is (presently )?closed|mercado fechado/.test(m)) return 'o mercado está fechado agora'
  if (/autoriza|token|invalidtoken|authoriz/.test(m)) return 'a ligação com a sua conta da Deriv venceu (entre de novo na plataforma)'
  if (/recusou a compra|buy/.test(m)) return 'a corretora recusou a operação'
  if (/conex|socket|timeout|caiu/.test(m)) return 'a conexão com a corretora caiu'
  return motivo.replace(/\s*—\s*\[[^\]]+\].*$/, '').replace(/\s*\(USD[^)]*\)/, '').trim() || 'parou'
}

const duracao = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  if (min < 60) return `${min} min${s % 60 ? ` ${s % 60} s` : ''}`
  return `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}`
}

export function mensagemDoFim(s: { roboNome: string; contaId?: string; moeda: string; demo: boolean; comecouEm?: number; terminouEm?: number | null; estado: { resultado: number; operacoes: number; vitorias: number; derrotas: number; motivoParada: string | null } }, trocados = false): string {
  const e = s.estado
  const motivo = (e.motivoParada ?? '').trim()
  const conta = nomeDaConta(s.demo, s.contaId ?? '', trocados)
  const como = /meta/i.test(motivo) ? { emoji: '✅', txt: 'bateu a meta' }
    : /limite de perda|stop/i.test(motivo) ? { emoji: '🛡️', txt: 'parou no limite de perda' }
    : /você pediu|desligad/i.test(motivo) ? { emoji: '⏹️', txt: 'foi desligada' }
    : /limite de \d+ opera/i.test(motivo) ? { emoji: '🏁', txt: 'completou as operações' }
    : null
  // parou sem operar nada por um problema: diz o porquê em vez de "terminou, US$ 0,00"
  if (!como && e.operacoes === 0) {
    return `⚠️ *${s.roboNome} não operou*\n${conta}\n\nMotivo: ${motivoLegivel(motivo)}.` +
      (/saldo insuficiente/.test(motivoLegivel(motivo)) ? `\n\n_${s.demo ? 'Recarregue essa conta na plataforma' : 'Deposite nessa conta ou me peça para ligar na outra'}._` : '')
  }
  const sinal = e.resultado > 0 ? '+' : e.resultado < 0 ? '−' : ''
  const titulo = como ? `${como.emoji} *${s.roboNome} ${como.txt}*` : `ℹ️ *${s.roboNome} parou*`
  const tempo = s.comecouEm != null && s.terminouEm != null ? `\nDuração: ${duracao(s.terminouEm - s.comecouEm)}` : ''
  return `${titulo}\n${conta}\n\n` +
    `Resultado: *${sinal}${din(Math.abs(e.resultado), s.moeda)}*\n` +
    `Operações: ${e.operacoes} (${plural(e.vitorias, 'ganho', 'ganhos')} · ${plural(e.derrotas, 'perda', 'perdas')})` + tempo +
    (como ? '' : `\nMotivo: ${motivoLegivel(motivo)}`)
}
