import './ambiente'
import { randomBytes, randomInt } from 'node:crypto'
import { conversar, type Anexos, type Turno } from './chat'
import { ver } from './sessoes'
import { loginDoUsuario, papelDoAdmin, restDoBanco as rest, somenteDemoDoUsuario } from './supabase'
import { appDaVitrine, vitrineDoPedido } from './apps-parceiros'
import { rotulosTrocados } from '../../src/core/deriv/accountAccess'

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

interface Config { instancia: string; token: string; clientToken: string; segredo: string; numero?: string; conectadoEm?: string }

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

export interface EstadoDaConexao { configurado: boolean; conectado: boolean; celularOnline?: boolean; numero?: string; instancia?: string; erro?: string; qr?: string }

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
    return { configurado: true, conectado: true, celularOnline: s.smartphoneConnected, numero, instancia: c.instancia }
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
  await guardar({ ...novo, segredo, numero: anterior?.instancia === novo.instancia ? anterior.numero : undefined })
  console.log(`[assessor] Z-API ligada (instância ${novo.instancia.slice(0, 6)}…)`)
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

async function guardarMensagem(m: { numero: string; userId: string | null; papel: 'cliente' | 'assessor'; texto: string; tipo?: string; idWhatsapp: string | null }): Promise<boolean> {
  try {
    await rest('/assessor_whatsapp_mensagens', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ marca: MARCA_DO_ASSESSOR, numero: m.numero, user_id: m.userId, papel: m.papel, texto: m.texto.slice(0, 4000), tipo: m.tipo ?? 'texto', id_whatsapp: m.idWhatsapp }),
    })
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
export function avisoRecebido(corpo: any): void {
  if (corpo?.type !== 'ReceivedCallback' || corpo.fromMe || corpo.isGroup || corpo.isNewsletter || corpo.broadcast || corpo.isStatusReply || corpo.isEdit) return
  const numero = String(corpo.phone ?? '')
  if (!/^\d{10,15}$/.test(numero)) { console.warn('[assessor] mensagem sem número de telefone (contato oculto): ignorada'); return }
  const antes = filas.get(numero) ?? Promise.resolve()
  const agora = antes.then(() => atender(numero, corpo)).catch((e) => console.error(`[assessor] falhou com …${numero.slice(-4)}: ${(e as Error).message}`))
  filas.set(numero, agora)
  void agora.finally(() => { if (filas.get(numero) === agora) filas.delete(numero) })
}

const CONFIRMAR = /\bconfirmar\s*gf\s*(\d{6})\b/i
const SITE = 'https://globalflytrade.com'

async function atender(numero: string, corpo: any): Promise<void> {
  const texto = String(corpo.text?.message ?? corpo.image?.caption ?? corpo.video?.caption ?? '').trim().slice(0, 2000)
  const tipo = corpo.audio ? 'audio' : corpo.image ? 'imagem' : corpo.video ? 'video' : corpo.text ? 'texto' : 'outro'
  const idWpp = corpo.messageId ? `rec:${corpo.messageId}` : null
  const chave = chaveDoTelefone(numero)

  // 1) confirmação do número
  const pedidoDeConfirmar = texto.match(CONFIRMAR)
  if (pedidoDeConfirmar) {
    if (!(await guardarMensagem({ numero, userId: null, papel: 'cliente', texto, idWhatsapp: idWpp }))) return
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
  if (!(await guardarMensagem({ numero, userId: dono?.user_id ?? null, papel: 'cliente', texto: texto || `[${tipo}]`, tipo, idWhatsapp: idWpp }))) return

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
