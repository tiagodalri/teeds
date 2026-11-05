// WhatsApp oficial (API da Meta, Cloud API) dentro do ADM, 05/11/2026.
//
// Duas portas no mesmo endereço:
//
// 1. A Meta (webhook), sem login:
//    GET  ?marca=globalfly&hub.mode=subscribe&hub.verify_token=…&hub.challenge=…
//         a Meta confere o endereço quando alguém cadastra o webhook no aplicativo
//    POST ?marca=globalfly   (cabeçalho X-Hub-Signature-256)
//         mensagens que chegam, o caminho das enviadas (enviada > entregue > lida)
//         e as reações. A assinatura é conferida com o segredo do aplicativo.
//
// 2. O painel, com o token do admin (JSON { acao, marca, ... }):
//    estado       o número conectado, o endereço do webhook e a senha de verificação
//    conectar     guarda a chave da Meta e o segredo do aplicativo (confere antes com a Meta)
//    desconectar  esquece a chave (as conversas ficam)
//    atualizar    lê de novo qualidade e limite do número e os modelos aprovados
//    enviar       texto, arquivo ou modelo para um contato
//    novo         abre uma conversa com um número (para mandar o primeiro modelo)
//    ler          zera as não lidas e marca como lida na Meta
//
// Os segredos (chave da Meta, segredo do aplicativo, senha do webhook) ficam em
// config_servicos (WHATSAPP_<MARCA>), que só a chave de serviço lê. Nada disso volta
// para a tela, exceto a senha do webhook para quem pode conectar (ela precisa ser
// colada no painel da Meta).

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const GRAPH = 'https://graph.facebook.com/v24.0'
const MARCAS = new Set(['globalfly', 'teeds', 'omni'])
const JANELA_MS = 24 * 60 * 60 * 1000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const rest = (caminho: string, init: RequestInit = {}) => fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
  ...init,
  headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
})
const rpc = async <T = unknown>(nome: string, args: Record<string, unknown>): Promise<T> => {
  const r = await rest(`rpc/${nome}`, { method: 'POST', body: JSON.stringify(args) })
  if (!r.ok) throw new Error(`banco: ${nome} ${r.status} ${(await r.text()).slice(0, 200)}`)
  const t = await r.text()
  return (t ? JSON.parse(t) : null) as T
}

/* ---------------------------------------------------------------- segredos */
type Segredo = { token?: string; appSecret?: string; verifyToken?: string }
const chaveSegredo = (marca: string) => `WHATSAPP_${marca.toUpperCase()}`
async function lerSegredo(marca: string): Promise<Segredo> {
  const r = await rest(`config_servicos?chave=eq.${encodeURIComponent(chaveSegredo(marca))}&select=valor`)
  const v = r.ok ? (await r.json())[0]?.valor : null
  try { return v ? JSON.parse(v) : {} } catch { return {} }
}
async function gravarSegredo(marca: string, s: Segredo) {
  const r = await rest('config_servicos?on_conflict=chave', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ chave: chaveSegredo(marca), valor: JSON.stringify(s), atualizado_em: new Date().toISOString() }),
  })
  if (!r.ok) throw new Error('Não consegui guardar no banco agora. Tente de novo.')
}
const novaSenha = () => {
  const b = crypto.getRandomValues(new Uint8Array(18))
  return 'gf-' + Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/* ---------------------------------------------------------------- conta */
interface Conta {
  marca: string; parceiro: string | null; phone_number_id: string | null; waba_id: string | null; app_id: string | null
  numero: string | null; nome_verificado: string | null; qualidade: string | null; limite: string | null
  situacao: string; erro: string | null; ultimo_aviso_em: string | null; conectado_em: string | null
}
async function lerConta(marca: string): Promise<Conta | null> {
  const r = await rest(`whatsapp_contas?marca=eq.${encodeURIComponent(marca)}&select=*`)
  return r.ok ? ((await r.json())[0] ?? null) : null
}
async function gravarConta(marca: string, campos: Partial<Conta> & Record<string, unknown>) {
  const r = await rest('whatsapp_contas?on_conflict=marca', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ marca, ...campos, atualizado_em: new Date().toISOString() }),
  })
  if (!r.ok) throw new Error('Não consegui guardar o número agora. Tente de novo.')
}

/* ---------------------------------------------------------------- Meta */
class ErroMeta extends Error { codigo?: number; constructor(m: string, codigo?: number) { super(m); this.codigo = codigo } }
async function graph<T = any>(caminho: string, token: string, init: { method?: string; corpo?: unknown; params?: Record<string, string> } = {}): Promise<T> {
  const u = new URL(`${GRAPH}/${caminho}`)
  for (const [k, v] of Object.entries(init.params ?? {})) u.searchParams.set(k, v)
  const r = await fetch(u, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(init.corpo ? { 'Content-Type': 'application/json' } : {}) },
    body: init.corpo ? JSON.stringify(init.corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || d?.error) {
    const e = d?.error ?? {}
    throw new ErroMeta(traduzir(e), e.code)
  }
  return d as T
}
/** O erro da Meta em português, com o que fazer. */
function traduzir(e: any): string {
  const c = Number(e?.code), msg = String(e?.error_data?.details ?? e?.message ?? '')
  if (c === 190) return 'A chave de acesso da Meta venceu ou foi trocada. Gere uma chave nova (usuário do sistema, validade "Nunca") e conecte de novo.'
  if (c === 10 || c === 200 || c === 299) return 'A chave não tem permissão para este número. Ela precisa de whatsapp_business_messaging e whatsapp_business_management, com acesso à conta do WhatsApp.'
  if (c === 100 && /phone|number|Object with ID/i.test(msg)) return 'A Meta não encontrou esse ID do número. Confira o "ID do número de telefone" no Gerenciador do WhatsApp (não é o número em si).'
  if (c === 131047) return 'Passaram mais de 24 horas desde a última mensagem do cliente. Para falar com ele, mande um modelo aprovado.'
  if (c === 131026) return 'Este número não recebeu: ele pode não ter WhatsApp ou não aceitar mensagens de empresas.'
  if (c === 131051) return 'A Meta não aceita este tipo de mensagem por aqui.'
  if (c === 132000 || c === 132001) return 'O modelo não bate com o aprovado: confira o nome, o idioma e as variáveis.'
  if (c === 132015 || c === 132016) return 'Este modelo foi pausado ou desativado pela Meta. Escolha outro.'
  if (c === 131048 || c === 131056) return 'A Meta segurou o envio para este número (limite de mensagens ou de qualidade). Espere um pouco e tente de novo.'
  if (c === 133010) return 'O número ainda não está registrado na Cloud API. Conclua o registro no Gerenciador do WhatsApp.'
  if (c === 4 || c === 80007 || c === 130429) return 'Muitas mensagens em pouco tempo. Espere alguns segundos e tente de novo.'
  if (c === 131053) return 'A Meta não conseguiu abrir este arquivo. Use foto JPG/PNG, áudio, vídeo MP4 ou PDF de até 100 MB.'
  return msg ? `A Meta respondeu: ${msg}` : 'A Meta não aceitou agora. Tente de novo em instantes.'
}

/* ---------------------------------------------------------------- quem chama */
async function papel(req: Request, marca: string): Promise<{ userId: string | null; podeVer: boolean; podeConectar: string | null }> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '')
  const apikey = req.headers.get('apikey') ?? ''
  if (!token) return { userId: null, podeVer: false, podeConectar: null }
  const comoEle = (nome: string) => fetch(`${SUPABASE_URL}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: { apikey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_marca: marca }),
  }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const [ver, conectar, u] = await Promise.all([
    comoEle('whatsapp_posso'),
    comoEle('whatsapp_posso_conectar'),
    fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey, Authorization: `Bearer ${token}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
  ])
  return { userId: u?.id ?? null, podeVer: ver === true, podeConectar: typeof conectar === 'string' ? conectar : null }
}

/* ---------------------------------------------------------------- modelos */
async function sincronizarModelos(marca: string, wabaId: string, token: string): Promise<number> {
  const lista: any[] = []
  let depois: string | null = null
  for (let i = 0; i < 5; i++) {
    const d: any = await graph(`${wabaId}/message_templates`, token, { params: { limit: '200', fields: 'name,language,category,status,components', ...(depois ? { after: depois } : {}) } })
    lista.push(...(d.data ?? []))
    depois = d.paging?.cursors?.after && d.paging?.next ? d.paging.cursors.after : null
    if (!depois) break
  }
  await rest(`whatsapp_modelos?marca=eq.${encodeURIComponent(marca)}`, { method: 'DELETE' })
  if (lista.length) {
    await rest('whatsapp_modelos', {
      method: 'POST',
      body: JSON.stringify(lista.map((m) => ({ marca, nome: m.name, idioma: m.language, categoria: m.category, situacao: m.status, componentes: m.components ?? [], atualizado_em: new Date().toISOString() }))),
    })
  }
  return lista.length
}

/** O texto do modelo com as variáveis no lugar, para a conversa mostrar o que o cliente recebeu. */
function textoDoModelo(componentes: any[], vars: { cabecalho?: string[]; corpo?: string[] }): string {
  const trocar = (t: string, v: string[] = []) => t.replace(/\{\{(\d+)\}\}/g, (_, n) => v[Number(n) - 1] ?? `{{${n}}}`)
  const partes: string[] = []
  for (const c of componentes ?? []) {
    if (c.type === 'HEADER' && c.format === 'TEXT' && c.text) partes.push(`*${trocar(c.text, vars.cabecalho)}*`)
    if (c.type === 'BODY' && c.text) partes.push(trocar(c.text, vars.corpo))
    if (c.type === 'FOOTER' && c.text) partes.push(`_${c.text}_`)
  }
  return partes.join('\n\n')
}

/* ---------------------------------------------------------------- arquivos */
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
  'video/mp4': 'mp4', 'video/3gpp': '3gp', 'application/pdf': 'pdf',
}
const extDe = (mime: string, nome?: string) => EXT[mime.split(';')[0].trim()] ?? (nome?.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin')

/** Baixa o arquivo que o cliente mandou (a Meta só guarda por pouco tempo) e põe no bucket privado. */
async function guardarMidia(marca: string, contato: string, mensagem: string, wamid: string, midia: { id: string; mime: string; nome?: string }, token: string) {
  try {
    const info: any = await graph(midia.id, token)
    const r = await fetch(info.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60_000) })
    if (!r.ok) throw new Error(`download ${r.status}`)
    const bytes = new Uint8Array(await r.arrayBuffer())
    const mime = info.mime_type ?? midia.mime
    const caminho = `${marca}/${contato}/${wamid.replace(/[^a-zA-Z0-9_-]/g, '')}.${extDe(mime, midia.nome)}`
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/whatsapp/${caminho}`, {
      method: 'POST', headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': mime, 'x-upsert': 'true' }, body: bytes,
    })
    if (!up.ok) throw new Error(`storage ${up.status}`)
    await rest(`whatsapp_mensagens?id=eq.${mensagem}`, { method: 'PATCH', body: JSON.stringify({ midia: { ...midia, mime, caminho, tamanho: bytes.byteLength } }) })
  } catch (e) {
    await rest(`whatsapp_mensagens?id=eq.${mensagem}`, { method: 'PATCH', body: JSON.stringify({ midia: { ...midia, falhou: true }, erro: `Não consegui baixar o arquivo: ${(e as Error).message}` }) })
  }
}

async function linkAssinado(caminho: string): Promise<string> {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/whatsapp/${caminho}`, {
    method: 'POST', headers: { apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 86400 }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok || !d.signedURL) throw new Error('Não achei o arquivo enviado. Anexe de novo.')
  return `${SUPABASE_URL}/storage/v1${d.signedURL}`
}

/* ---------------------------------------------------------------- webhook */
async function assinaturaConfere(cru: string, cabecalho: string | null, segredo: string): Promise<boolean> {
  if (!cabecalho?.startsWith('sha256=') || !segredo) return false
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const assinatura = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(cru)))
  const esperado = Array.from(assinatura, (b) => b.toString(16).padStart(2, '0')).join('')
  const veio = cabecalho.slice(7).toLowerCase()
  if (veio.length !== esperado.length) return false
  let dif = 0
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ veio.charCodeAt(i)
  return dif === 0
}

const TIPO: Record<string, string> = { text: 'texto', image: 'imagem', audio: 'audio', video: 'video', document: 'documento', sticker: 'figurinha', location: 'localizacao', contacts: 'contato', button: 'botao', interactive: 'botao' }
const STATUS: Record<string, string> = { sent: 'enviada', delivered: 'entregue', read: 'lida', failed: 'falhou' }

async function receber(marca: string, corpo: any, conta: Conta, token: string | undefined, tarefas: Promise<unknown>[]) {
  for (const entrada of corpo?.entry ?? []) {
    for (const mudanca of entrada?.changes ?? []) {
      if (mudanca?.field !== 'messages') continue
      const v = mudanca.value ?? {}
      if (conta.phone_number_id && v.metadata?.phone_number_id && v.metadata.phone_number_id !== conta.phone_number_id) continue
      const nomes = new Map<string, string>()
      for (const c of v.contacts ?? []) if (c?.wa_id) nomes.set(String(c.wa_id), c.profile?.name ?? '')

      for (const m of v.messages ?? []) {
        if (m.type === 'reaction') { await rpc('whatsapp_registrar_reacao', { p_wamid: m.reaction?.message_id, p_emoji: m.reaction?.emoji ?? '' }); continue }
        const tipo = TIPO[m.type] ?? 'outro'
        const bloco = m[m.type] ?? {}
        let texto: string | null = null
        let midia: Record<string, unknown> | null = null
        if (m.type === 'text') texto = bloco.body ?? ''
        else if (['image', 'audio', 'video', 'document', 'sticker'].includes(m.type)) {
          texto = bloco.caption ?? null
          midia = { id: bloco.id, mime: bloco.mime_type ?? '', nome: bloco.filename ?? null, voz: !!bloco.voice }
        } else if (m.type === 'location') texto = [bloco.name, bloco.address, `https://maps.google.com/?q=${bloco.latitude},${bloco.longitude}`].filter(Boolean).join('\n')
        else if (m.type === 'contacts') texto = (bloco ?? []).map?.((c: any) => `${c.name?.formatted_name ?? ''} ${c.phones?.[0]?.phone ?? ''}`.trim()).join('\n') ?? 'Contato'
        else if (m.type === 'button') texto = bloco.text ?? ''
        else if (m.type === 'interactive') texto = bloco.button_reply?.title ?? bloco.list_reply?.title ?? ''
        else texto = m.errors?.[0]?.title ? `Mensagem que a Meta não mostra por aqui (${m.errors[0].title}).` : 'Mensagem que a Meta não mostra por aqui.'

        const quando = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString()
        const r = await rpc<{ contato: string; mensagem: string | null }>('whatsapp_registrar_entrada', {
          p_marca: marca, p_wa_id: m.from, p_nome: nomes.get(String(m.from)) ?? null, p_wamid: m.id, p_tipo: tipo,
          p_texto: texto, p_midia: midia, p_citando: m.context?.id ?? null, p_quando: quando,
        })
        if (r?.mensagem && midia?.id && token) tarefas.push(guardarMidia(marca, r.contato, r.mensagem, m.id, midia as { id: string; mime: string; nome?: string }, token))
      }

      for (const s of v.statuses ?? []) {
        const st = STATUS[s.status]
        if (!st || !s.id) continue
        const erro = s.errors?.[0] ? traduzir({ code: s.errors[0].code, message: s.errors[0].title, error_data: s.errors[0].error_data }) : null
        await rpc('whatsapp_registrar_status', { p_wamid: s.id, p_status: st, p_erro: erro })
      }
    }
  }
}

/* ---------------------------------------------------------------- entrada */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const url = new URL(req.url)

  // a Meta conferindo o endereço do webhook
  if (req.method === 'GET') {
    const marca = url.searchParams.get('marca') ?? ''
    if (!MARCAS.has(marca)) return new Response('marca?', { status: 400 })
    const s = await lerSegredo(marca)
    if (url.searchParams.get('hub.mode') === 'subscribe' && s.verifyToken && url.searchParams.get('hub.verify_token') === s.verifyToken) {
      return new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }
    return new Response('senha de verificação não confere', { status: 403 })
  }
  if (req.method !== 'POST') return json({ erro: 'Use POST' }, 405)

  const cru = await req.text()
  const assinatura = req.headers.get('x-hub-signature-256')

  // a Meta avisando (mensagens, status, reações)
  if (assinatura) {
    const marca = url.searchParams.get('marca') ?? ''
    if (!MARCAS.has(marca)) return new Response('marca?', { status: 400 })
    const [s, conta] = await Promise.all([lerSegredo(marca), lerConta(marca)])
    if (!s.appSecret || !(await assinaturaConfere(cru, assinatura, s.appSecret))) return new Response('assinatura', { status: 401 })
    let corpo: any
    try { corpo = JSON.parse(cru) } catch { return new Response('ok') }
    if (!conta) return new Response('ok')
    const tarefas: Promise<unknown>[] = []
    try {
      await receber(marca, corpo, conta, s.token, tarefas)
      await rest(`whatsapp_contas?marca=eq.${encodeURIComponent(marca)}`, { method: 'PATCH', body: JSON.stringify({ ultimo_aviso_em: new Date().toISOString() }) })
    } catch (e) {
      console.error('[whatsapp] webhook:', (e as Error).message)
      return new Response('tente de novo', { status: 500 }) // a Meta reenvia
    }
    // os arquivos baixam depois de responder (a Meta quer resposta rápida)
    // @ts-ignore EdgeRuntime existe no Supabase
    if (tarefas.length) { try { EdgeRuntime.waitUntil(Promise.allSettled(tarefas)) } catch { await Promise.allSettled(tarefas) } }
    return new Response('ok')
  }

  // o painel
  let d: Record<string, any>
  try { d = JSON.parse(cru) } catch { return json({ erro: 'Corpo inválido' }, 400) }
  const marca = String(d.marca ?? '')
  if (!MARCAS.has(marca)) return json({ erro: 'Plataforma desconhecida.' }, 400)
  const quem = await papel(req, marca)
  if (!quem.userId) return json({ erro: 'Entre de novo na plataforma.' }, 401)
  const acao = String(d.acao ?? '')
  // o admin de um parceiro só liga (ou desliga) um número que é dele, ou quando ainda não há número
  const contaAtual = await lerConta(marca)
  const proprio = quem.podeConectar?.startsWith('parceiro:') ? quem.podeConectar.slice(9) : null
  const podeConectarAqui = quem.podeConectar === 'geral'
    || (!!proprio && (!contaAtual || contaAtual.parceiro === proprio || (!contaAtual.parceiro && !contaAtual.phone_number_id)))
  const dono = contaAtual?.parceiro ?? null

  try {
    if (acao === 'estado') {
      if (!quem.podeVer && !quem.podeConectar) return json({ erro: 'Você não tem acesso ao WhatsApp desta plataforma.' }, 403)
      const [conta, s] = [contaAtual, await lerSegredo(marca)]
      let verifyToken = s.verifyToken
      if (podeConectarAqui && !verifyToken) { verifyToken = novaSenha(); await gravarSegredo(marca, { ...s, verifyToken }) }
      return json({
        podeVer: quem.podeVer, podeConectar: podeConectarAqui ? quem.podeConectar : null, dono,
        conta: conta ? { ...conta, conectado_por: undefined } : null,
        conectado: conta?.situacao === 'conectado' && !!s.token,
        webhook: podeConectarAqui ? { url: `${SUPABASE_URL}/functions/v1/whatsapp?marca=${marca}`, senha: verifyToken } : null,
      })
    }

    if (acao === 'conectar') {
      if (!podeConectarAqui) return json({ erro: 'Só o administrador geral ou o dono do número conecta o WhatsApp.' }, 403)
      const phoneNumberId = String(d.phoneNumberId ?? '').trim(), wabaId = String(d.wabaId ?? '').trim()
      const appId = String(d.appId ?? '').trim(), token = String(d.token ?? '').trim(), appSecret = String(d.appSecret ?? '').trim()
      if (!/^\d{8,25}$/.test(phoneNumberId)) return json({ erro: 'O ID do número de telefone tem só números (Gerenciador do WhatsApp › Números de telefone). Não é o número em si.' }, 400)
      if (!/^\d{8,25}$/.test(wabaId)) return json({ erro: 'O ID da conta do WhatsApp Business tem só números (Gerenciador do WhatsApp › Visão geral da conta).' }, 400)
      if (appId && !/^\d{8,25}$/.test(appId)) return json({ erro: 'O ID do aplicativo tem só números (topo do painel do aplicativo na Meta).' }, 400)
      if (token.length < 50) return json({ erro: 'A chave de acesso parece incompleta. Copie a chave inteira do usuário do sistema.' }, 400)
      if (!/^[a-f0-9]{24,64}$/i.test(appSecret)) return json({ erro: 'O segredo do aplicativo tem 32 letras e números (Configurações do app › Básico › Chave secreta do aplicativo › Mostrar).' }, 400)
      const parceiro = quem.podeConectar === 'geral' ? (d.parceiro ? String(d.parceiro) : null) : proprio

      // confere tudo com a própria Meta antes de guardar
      const num: any = await graph(phoneNumberId, token, { params: { fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier' } })
        .catch(async (e) => { if ((e as ErroMeta).codigo === 100) return graph(phoneNumberId, token, { params: { fields: 'display_phone_number,verified_name,quality_rating' } }); throw e })
      if (appId) await graph(appId, `${appId}|${appSecret}`, { params: { fields: 'id' } }).catch(() => { throw new Error('A Meta não reconheceu esse ID do aplicativo com esse segredo. Confira os dois.') })
      // pede à Meta para mandar as mensagens deste WhatsApp para o aplicativo
      let aviso: string | null = null
      await graph(`${wabaId}/subscribed_apps`, token, { method: 'POST' }).catch((e) => { aviso = `O número conectou, mas a inscrição do aplicativo na conta falhou: ${(e as Error).message}` })

      const s = await lerSegredo(marca)
      await gravarSegredo(marca, { ...s, token, appSecret, verifyToken: s.verifyToken ?? novaSenha() })
      await gravarConta(marca, {
        parceiro, phone_number_id: phoneNumberId, waba_id: wabaId, app_id: appId || null,
        numero: num.display_phone_number ?? null, nome_verificado: num.verified_name ?? null,
        qualidade: num.quality_rating ?? null, limite: num.messaging_limit_tier ?? null,
        situacao: 'conectado', erro: null, conectado_em: new Date().toISOString(), conectado_por: quem.userId,
      })
      const modelos = await sincronizarModelos(marca, wabaId, token).catch(() => 0)
      return json({ ok: true, numero: num.display_phone_number, nome: num.verified_name, modelos, aviso })
    }

    if (acao === 'desconectar') {
      if (!podeConectarAqui) return json({ erro: 'Só o administrador geral ou o dono do número desconecta.' }, 403)
      const s = await lerSegredo(marca)
      await gravarSegredo(marca, { verifyToken: s.verifyToken })
      await gravarConta(marca, { situacao: 'desconectado', erro: null })
      return json({ ok: true })
    }

    if (!quem.podeVer) return json({ erro: 'Você não tem acesso ao WhatsApp desta plataforma.' }, 403)
    const [conta, s] = await Promise.all([lerConta(marca), lerSegredo(marca)])
    if (!conta || conta.situacao !== 'conectado' || !s.token || !conta.phone_number_id) return json({ erro: 'O WhatsApp ainda não está conectado.' }, 409)
    const token = s.token

    if (acao === 'atualizar') {
      const num: any = await graph(conta.phone_number_id, token, { params: { fields: 'display_phone_number,verified_name,quality_rating,messaging_limit_tier' } })
        .catch(() => graph(conta.phone_number_id!, token, { params: { fields: 'display_phone_number,verified_name,quality_rating' } }))
      await gravarConta(marca, { numero: num.display_phone_number ?? conta.numero, nome_verificado: num.verified_name ?? conta.nome_verificado, qualidade: num.quality_rating ?? null, limite: num.messaging_limit_tier ?? conta.limite, erro: null })
      const modelos = conta.waba_id ? await sincronizarModelos(marca, conta.waba_id, token) : 0
      return json({ ok: true, modelos })
    }

    if (acao === 'novo') {
      let n = String(d.numero ?? '').replace(/\D/g, '')
      if (n.length === 10 || n.length === 11) n = '55' + n
      if (n.length < 12 || n.length > 15) return json({ erro: 'Confira o número: DDD + número, ou com o código do país.' }, 400)
      const id = await rpc<string>('whatsapp_contato_do_numero', { p_marca: marca, p_wa_id: n, p_nome: d.nome ?? null })
      return json({ ok: true, contato: id })
    }

    const contatoId = String(d.contatoId ?? '')
    const rc = await rest(`whatsapp_contatos?id=eq.${encodeURIComponent(contatoId)}&marca=eq.${encodeURIComponent(marca)}&select=id,wa_id,ultima_entrada_em`)
    const contato = rc.ok ? (await rc.json())[0] : null
    if (!contato) return json({ erro: 'Conversa não encontrada.' }, 404)

    if (acao === 'ler') {
      await rest(`whatsapp_contatos?id=eq.${contato.id}`, { method: 'PATCH', body: JSON.stringify({ nao_lidas: 0 }) })
      const ru = await rest(`whatsapp_mensagens?contato_id=eq.${contato.id}&direcao=eq.entrada&select=wamid&order=criado_em.desc&limit=1`)
      const ultima = ru.ok ? (await ru.json())[0]?.wamid : null
      if (ultima) await graph(`${conta.phone_number_id}/messages`, token, { method: 'POST', corpo: { messaging_product: 'whatsapp', status: 'read', message_id: ultima } }).catch(() => null)
      return json({ ok: true })
    }

    if (acao === 'enviar') {
      const tipo = String(d.tipo ?? 'texto')
      const janelaAberta = !!contato.ultima_entrada_em && Date.now() - new Date(contato.ultima_entrada_em).getTime() < JANELA_MS
      if (tipo !== 'modelo' && !janelaAberta) return json({ erro: 'Passaram mais de 24 horas desde a última mensagem do cliente. Para falar com ele, mande um modelo aprovado.', janela: false }, 409)
      const base: Record<string, unknown> = { messaging_product: 'whatsapp', recipient_type: 'individual', to: contato.wa_id }
      if (d.citando) base.context = { message_id: String(d.citando) }

      let corpo: Record<string, unknown>, tipoSalvo = tipo, texto: string | null = null, midia: Record<string, unknown> | null = null, modelo: Record<string, unknown> | null = null
      if (tipo === 'texto') {
        texto = String(d.texto ?? '').trim()
        if (!texto) return json({ erro: 'Escreva a mensagem.' }, 400)
        if (texto.length > 4096) return json({ erro: 'A mensagem passou de 4.096 caracteres. Divida em duas.' }, 400)
        corpo = { ...base, type: 'text', text: { body: texto, preview_url: /https?:\/\//.test(texto) } }
      } else if (tipo === 'midia') {
        const caminho = String(d.midia?.caminho ?? ''), mime = String(d.midia?.mime ?? ''), nome = String(d.midia?.nome ?? 'arquivo')
        if (!caminho.startsWith(`${marca}/`)) return json({ erro: 'Arquivo inválido.' }, 400)
        const link = await linkAssinado(caminho)
        const t = mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : mime.startsWith('video/') ? 'video' : 'document'
        tipoSalvo = { image: 'imagem', audio: 'audio', video: 'video', document: 'documento' }[t]!
        texto = String(d.texto ?? '').trim() || null
        const bloco: Record<string, unknown> = { link }
        if (t === 'document') bloco.filename = nome
        if (texto && t !== 'audio') bloco.caption = texto
        corpo = { ...base, type: t, [t]: bloco }
        midia = { caminho, mime, nome, tamanho: d.midia?.tamanho ?? null }
      } else if (tipo === 'modelo') {
        const nome = String(d.modelo?.nome ?? ''), idioma = String(d.modelo?.idioma ?? 'pt_BR')
        const vars = { cabecalho: (d.modelo?.cabecalho ?? []).map(String), corpo: (d.modelo?.corpo ?? []).map(String) }
        const rm = await rest(`whatsapp_modelos?marca=eq.${encodeURIComponent(marca)}&nome=eq.${encodeURIComponent(nome)}&idioma=eq.${encodeURIComponent(idioma)}&select=componentes,situacao`)
        const mod = rm.ok ? (await rm.json())[0] : null
        if (!mod) return json({ erro: 'Modelo não encontrado. Toque em "Atualizar modelos" e tente de novo.' }, 400)
        if (mod.situacao !== 'APPROVED') return json({ erro: 'Este modelo ainda não foi aprovado pela Meta.' }, 400)
        const componentes: unknown[] = []
        if (vars.cabecalho.length) componentes.push({ type: 'header', parameters: vars.cabecalho.map((t: string) => ({ type: 'text', text: t })) })
        if (vars.corpo.length) componentes.push({ type: 'body', parameters: vars.corpo.map((t: string) => ({ type: 'text', text: t })) })
        corpo = { ...base, type: 'template', template: { name: nome, language: { code: idioma }, ...(componentes.length ? { components: componentes } : {}) } }
        texto = textoDoModelo(mod.componentes, vars)
        modelo = { nome, idioma, ...vars }
        tipoSalvo = 'modelo'
      } else return json({ erro: 'Tipo de mensagem desconhecido.' }, 400)

      const r: any = await graph(`${conta.phone_number_id}/messages`, token, { method: 'POST', corpo })
      const wamid = r?.messages?.[0]?.id
      if (!wamid) throw new Error('A Meta não devolveu o número da mensagem.')
      const id = await rpc<string>('whatsapp_registrar_saida', {
        p_marca: marca, p_contato: contato.id, p_wamid: wamid, p_tipo: tipoSalvo, p_texto: texto,
        p_midia: midia, p_modelo: modelo, p_citando: d.citando ?? null, p_autor: quem.userId,
      })
      return json({ ok: true, id, wamid })
    }

    return json({ erro: 'Ação desconhecida.' }, 400)
  } catch (e) {
    const m = (e as Error).message
    if (e instanceof ErroMeta && e.codigo === 190) await gravarConta(marca, { situacao: 'erro', erro: m }).catch(() => null)
    return json({ erro: m }, e instanceof ErroMeta ? 502 : 500)
  }
})
