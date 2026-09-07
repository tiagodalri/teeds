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
 * O aviso chega por uma FILA no banco (tabela emails_pendentes): o gancho
 * do Supabase Auth só enfileira, e o carteiro daqui entrega. Escolhido em
 * vez da porta HTTP por dois motivos: não precisa de nenhuma senha nova
 * (a chave que já lê o banco lê a fila), e se este servidor estiver
 * reiniciando naquele segundo o cadastro não falha — o e-mail só espera.
 * A porta HTTP /gancho/email continua abaixo, por completude.
 *
 * Duas coisas delicadas moram aqui:
 *
 *  - A assinatura da porta HTTP. Ela fica aberta na internet, sem login —
 *    o que separa um aviso legítimo de alguém batendo na porta é a
 *    assinatura no cabeçalho. Sem ela conferida, qualquer um mandaria
 *    e-mail em nome da sua marca.
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
 * Manda o e-mail de um aviso. E o miolo comum da porta HTTP e da fila.
 * Lanca erro com mensagem curta quando nao consegue — quem chama decide
 * se responde 500 ou se deixa a linha na fila para tentar de novo.
 */
export async function entregarAviso(aviso: AvisoDoSupabase): Promise<{ marca: string; tipo: TipoDeEmail }> {
  const chaveResend = process.env.RESEND_CHAVE ?? ''
  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  if (!chaveResend || !supabaseUrl) throw new Error('servidor sem RESEND_CHAVE ou SUPABASE_URL')

  const para = aviso.user?.email
  const tipo = tipoDoAviso(aviso.email_data?.email_action_type)
  if (!para || !tipo) throw new Error(`aviso incompleto (${aviso.email_data?.email_action_type ?? 'sem tipo'})`)

  const marca = marcaDoAviso(aviso)
  if (!marca.email.remetente) {
    // Recusar e melhor que mandar com o remetente de outra marca: isso
    // queima a reputacao do dominio e o estrago dura meses.
    throw new Error(`a ${marca.prosa} nao tem remetente verificado`)
  }

  const { assunto, html, texto } = montarEmail(marca, tipo, linkDoAviso(aviso, supabaseUrl, marca))
  await entregarPeloResend(chaveResend, marca.email.remetente, para, assunto, html, texto)
  return { marca: marca.prosa, tipo }
}

/**
 * Trata um aviso vindo pela porta HTTP. Devolve o que responder — nunca lanca.
 *
 * Um detalhe de proposito: quando da errado, a resposta diz o minimo. Este
 * endereco e publico, e mensagem de erro detalhada em porta aberta e mapa
 * para quem esta tentando entrar. O detalhe fica no registro do servidor.
 */
export async function tratarGanchoDeEmail(
  corpoCru: string,
  cabecalhos: Record<string, string | string[] | undefined>,
): Promise<RespostaDoGancho> {
  const segredo = process.env.GANCHO_EMAIL_SEGREDO ?? ''
  if (!segredo || !process.env.RESEND_CHAVE || !process.env.SUPABASE_URL) {
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

  try {
    const { marca, tipo } = await entregarAviso(aviso)
    console.log(`[email] "${tipo}" da ${marca} entregue`)
    return { status: 200, corpo: {} }
  } catch (e) {
    console.error('[email] falhei:', (e as Error).message)
    return { status: 500, corpo: { error: { message: 'nao consegui enviar' } } }
  }
}

/* ------------------------------------------------------------------ fila */

/**
 * O carteiro: olha a fila do banco a cada pouco e entrega o que houver.
 *
 * E o caminho que esta ligado de fato. A porta HTTP acima continua existindo
 * por completude, mas a fila e melhor para um servidor so: se ele estiver
 * fora do ar por dez segundos, ninguem tem o cadastro recusado — o e-mail
 * espera. Uma linha que falha fica com o erro gravado e volta a ser tentada
 * ate cinco vezes; depois para, para nao gastar cota num endereco invalido.
 */
export function ligarCarteiro(
  fila: {
    pendentes: () => Promise<Array<{ id: number; aviso: unknown; tentativas: number }>>
    entregue: (id: number) => Promise<void>
    falhou: (id: number, tentativas: number, erro: string) => Promise<void>
  },
  intervaloMs = 1500,
): () => void {
  let ocupado = false
  const passo = async () => {
    if (ocupado) return
    ocupado = true
    try {
      for (const linha of await fila.pendentes()) {
        try {
          const { marca, tipo } = await entregarAviso(linha.aviso as AvisoDoSupabase)
          await fila.entregue(linha.id)
          console.log(`[email] "${tipo}" da ${marca} entregue (fila #${linha.id})`)
        } catch (e) {
          const erro = (e as Error).message
          console.error(`[email] fila #${linha.id} falhou (${linha.tentativas + 1}/5): ${erro}`)
          await fila.falhou(linha.id, linha.tentativas, erro).catch(() => {})
        }
      }
    } catch (e) {
      // Banco fora do ar por um instante: o proximo passo tenta de novo.
      console.warn('[email] nao consegui ler a fila:', (e as Error).message)
    } finally {
      ocupado = false
    }
  }
  const timer = setInterval(() => { void passo() }, intervaloMs)
  void passo()
  return () => clearInterval(timer)
}
