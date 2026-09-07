/**
 * O carteiro dos e-mails de acesso.
 *
 * O Supabase sabe QUANDO mandar um e-mail (alguém se cadastrou, alguém
 * esqueceu a senha) mas só sabe mandar um modelo para o projeto inteiro —
 * e o projeto é um só para as duas plataformas. Resultado: cliente da OMNI
 * recebendo e-mail da Teeds.
 *
 * Então ele para de mandar e passa a AVISAR. Este arquivo recebe o aviso,
 * descobre de qual plataforma a pessoa veio, monta o e-mail com a marca
 * certa (ver emails.ts) e entrega ao serviço de envio.
 *
 * Duas coisas delicadas moram aqui:
 *
 *  - A assinatura. Este endereço fica aberto na internet, sem login — tem
 *    que ficar, senão o Supabase não alcança. O que separa um aviso legítimo
 *    de alguém batendo na porta é a assinatura que vem no cabeçalho. Sem ela
 *    conferida, qualquer um mandaria e-mail em nome da sua marca.
 *
 *  - O remetente. Se a marca ainda não tem domínio verificado, este arquivo
 *    RECUSA em vez de mandar com o endereço da outra. Um e-mail cuja marca
 *    não bate com o remetente cai no lixo eletrônico e queima a reputação do
 *    domínio — o estrago dura meses e não aparece em lugar nenhum.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { MARCAS, marcaPorId, type Marca } from '../../src/marca/marcas'
import { montarEmail, type TipoDeEmail } from './emails'

/* ------------------------------------------------------------ assinatura */

/**
 * Confere a assinatura no padrão "Standard Webhooks", que é o que o
 * Supabase usa.
 *
 * O segredo assina a frase `id.horario.corpo`. Assinar o horário junto é o
 * que impede alguém de gravar um aviso verdadeiro e reenviar amanhã: fora
 * da janela de cinco minutos, a mesma assinatura já não vale.
 */
export function assinaturaConfere(
  corpoCru: string,
  cabecalhos: Record<string, string | string[] | undefined>,
  segredoBruto: string,
): boolean {
  const pegar = (n: string) => {
    const v = cabecalhos[n]
    return Array.isArray(v) ? v[0] : v
  }
  const id = pegar('webhook-id')
  const horario = pegar('webhook-timestamp')
  const assinaturas = pegar('webhook-signature')
  if (!id || !horario || !assinaturas || !segredoBruto) return false

  // Fora de cinco minutos, não serve. Vale nos dois sentidos: relógio
  // adiantado do outro lado também é motivo para desconfiar.
  const agora = Math.floor(Date.now() / 1000)
  const quando = Number(horario)
  if (!Number.isFinite(quando) || Math.abs(agora - quando) > 300) return false

  const segredo = Buffer.from(segredoBruto.replace(/^v1,\s*/, '').replace(/^whsec_/, ''), 'base64')
  const esperada = createHmac('sha256', segredo)
    .update(`${id}.${horario}.${corpoCru}`)
    .digest('base64')

  // Pode vir mais de uma (rodízio de segredo). Basta uma bater.
  for (const parte of assinaturas.split(' ')) {
    const dele = parte.split(',')[1]
    if (!dele) continue
    const a = Buffer.from(dele, 'base64')
    const b = Buffer.from(esperada, 'base64')
    // Comparação de tempo constante: comparar com === vazaria, pelo tempo
    // de resposta, quantos caracteres iniciais o atacante já acertou.
    if (a.length === b.length && timingSafeEqual(a, b)) return true
  }
  return false
}

/* --------------------------------------------------------------- leitura */

interface AvisoDoSupabase {
  user?: { email?: string; user_metadata?: Record<string, unknown> }
  email_data?: {
    token_hash?: string
    redirect_to?: string
    email_action_type?: string
    site_url?: string
  }
}

/**
 * De qual plataforma veio esta pessoa.
 *
 * A ordem importa. O endereço de volta é o mais confiável: ele diz em qual
 * site a pessoa estava neste exato momento. A marca guardada no cadastro
 * vem depois, para os casos sem endereço de volta — um convite criado pelo
 * painel, por exemplo. E, no fim, a Teeds, que é o que todo cadastro antigo
 * já era.
 */
export function marcaDoAviso(aviso: AvisoDoSupabase): Marca {
  const volta = aviso.email_data?.redirect_to || aviso.email_data?.site_url || ''
  if (volta) {
    for (const m of Object.values(MARCAS)) {
      try {
        if (new URL(volta).origin === new URL(m.redirectUri).origin) return m
      } catch { /* endereço torto: cai para o próximo critério */ }
    }
  }
  const guardada = aviso.user?.user_metadata?.marca
  if (typeof guardada === 'string' && guardada) return marcaPorId(guardada)
  return marcaPorId(undefined)
}

/** O nome que o Supabase dá a cada situação, traduzido para o nosso. */
export function tipoDoAviso(acao: string | undefined): TipoDeEmail | null {
  switch (acao) {
    case 'signup':        return 'confirmar'
    case 'magiclink':     return 'magico'
    case 'recovery':      return 'senha'
    case 'invite':        return 'convite'
    case 'email_change':
    case 'email_change_new':
    case 'email_change_current': return 'trocar-email'
    default: return null
  }
}

/**
 * O link que vai dentro do botão.
 *
 * O Supabase não manda o link pronto — manda as peças. Montamos aqui o
 * mesmo endereço que ele montaria, apontando para o `verify` dele, que
 * valida o código e devolve a pessoa ao site de origem.
 */
export function linkDoAviso(aviso: AvisoDoSupabase, supabaseUrl: string, marca: Marca): string {
  const d = aviso.email_data ?? {}
  const volta = d.redirect_to || marca.redirectUri
  const p = new URLSearchParams({
    token: d.token_hash ?? '',
    type: d.email_action_type ?? '',
    redirect_to: volta,
  })
  return `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/verify?${p.toString()}`
}

/* ---------------------------------------------------------------- envio */

async function entregarPeloResend(
  chave: string, de: string, para: string,
  assunto: string, html: string, texto: string,
): Promise<void> {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${chave}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: de, to: [para], subject: assunto, html, text: texto }),
  })
  if (!r.ok) {
    const detalhe = await r.text().catch(() => '')
    throw new Error(`o serviço de envio recusou (${r.status}): ${detalhe.slice(0, 300)}`)
  }
}

/* ------------------------------------------------------------ a porta */

export interface RespostaDoGancho { status: number; corpo: unknown }

/**
 * Trata um aviso do Supabase. Devolve o que responder — nunca lança.
 *
 * Um detalhe de propósito: quando dá errado, a resposta diz o mínimo. Este
 * endereço é público, e mensagem de erro detalhada em porta aberta é mapa
 * para quem está tentando entrar. O detalhe fica no registro do servidor,
 * onde só você lê.
 */
export async function tratarGanchoDeEmail(
  corpoCru: string,
  cabecalhos: Record<string, string | string[] | undefined>,
): Promise<RespostaDoGancho> {
  const segredo = process.env.GANCHO_EMAIL_SEGREDO ?? ''
  const chaveResend = process.env.RESEND_CHAVE ?? ''
  const supabaseUrl = process.env.SUPABASE_URL ?? ''

  if (!segredo || !chaveResend || !supabaseUrl) {
    console.warn('[email] gancho chamado sem configuração completa — nada foi enviado')
    return { status: 500, corpo: { error: { message: 'servico indisponivel' } } }
  }
  if (!assinaturaConfere(corpoCru, cabecalhos, segredo)) {
    console.warn('[email] recusei um aviso com assinatura invalida')
    return { status: 401, corpo: { error: { message: 'assinatura invalida' } } }
  }

  let aviso: AvisoDoSupabase
  try { aviso = JSON.parse(corpoCru) } catch {
    return { status: 400, corpo: { error: { message: 'pedido malformado' } } }
  }

  const para = aviso.user?.email
  const tipo = tipoDoAviso(aviso.email_data?.email_action_type)
  if (!para || !tipo) {
    console.warn(`[email] nao sei tratar "${aviso.email_data?.email_action_type}" — nada enviado`)
    return { status: 400, corpo: { error: { message: 'pedido incompleto' } } }
  }

  const marca = marcaDoAviso(aviso)
  if (!marca.email.remetente) {
    console.error(
      `[email] a ${marca.prosa} ainda nao tem remetente verificado: ` +
      `nao mandei o "${tipo}" em vez de mandar com o endereco de outra marca`,
    )
    return { status: 500, corpo: { error: { message: 'remetente nao configurado' } } }
  }

  const { assunto, html, texto } = montarEmail(marca, tipo, linkDoAviso(aviso, supabaseUrl, marca))
  try {
    await entregarPeloResend(chaveResend, marca.email.remetente, para, assunto, html, texto)
  } catch (e) {
    console.error(`[email] falhei ao mandar o "${tipo}" da ${marca.prosa}:`, (e as Error).message)
    return { status: 500, corpo: { error: { message: 'nao consegui enviar' } } }
  }

  console.log(`[email] "${tipo}" da ${marca.prosa} entregue`)
  return { status: 200, corpo: {} }
}
