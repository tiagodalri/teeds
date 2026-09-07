/**
 * Provas do carteiro de e-mails.
 *
 *   cd servidor && npm run email-travas
 *
 * Duas coisas aqui não podem estar erradas, e nenhuma das duas dá sinal
 * quando está: uma assinatura mal conferida abre a porta para qualquer um
 * mandar e-mail em nome da sua marca, e uma marca mal identificada manda o
 * e-mail da Teeds para o cliente da OMNI. Ambos os defeitos são invisíveis
 * até o dia em que já custaram alguma coisa. Por isso teste.
 */
import { createHmac } from 'node:crypto'
import { assinaturaConfere, marcaDoAviso, tipoDoAviso, linkDoAviso, tratarGanchoDeEmail } from './gancho-email'
import { MARCAS, marcaPorId } from '../../src/marca/marcas'

let certos = 0
let errados = 0
function conferir(nome: string, deu: unknown, esperado: unknown) {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  if (ok) certos++
  else { errados++; console.error(`✕ ${nome}\n   esperava ${JSON.stringify(esperado)}\n   veio     ${JSON.stringify(deu)}`) }
}

/* ------------------------------------------------------------ assinatura */

const SEGREDO = 'v1,whsec_' + Buffer.from('um-segredo-de-teste-com-tamanho-ok').toString('base64')

function assinar(corpo: string, id: string, quando: number, segredo = SEGREDO) {
  const cru = Buffer.from(segredo.replace(/^v1,/, '').replace(/^whsec_/, ''), 'base64')
  const s = createHmac('sha256', cru).update(`${id}.${quando}.${corpo}`).digest('base64')
  return {
    'webhook-id': id,
    'webhook-timestamp': String(quando),
    'webhook-signature': `v1,${s}`,
  }
}

const agora = Math.floor(Date.now() / 1000)
const corpo = JSON.stringify({ user: { email: 'alguem@exemplo.com' } })

conferir('assinatura boa passa',
  assinaturaConfere(corpo, assinar(corpo, 'msg_1', agora), SEGREDO), true)

conferir('corpo adulterado nao passa',
  assinaturaConfere(corpo + ' ', assinar(corpo, 'msg_1', agora), SEGREDO), false)

conferir('segredo errado nao passa',
  assinaturaConfere(corpo, assinar(corpo, 'msg_1', agora, 'v1,whsec_' + Buffer.from('outro-segredo-qualquer-aqui').toString('base64')), SEGREDO), false)

conferir('aviso velho nao passa (reenvio)',
  assinaturaConfere(corpo, assinar(corpo, 'msg_1', agora - 3600), SEGREDO), false)

conferir('relogio adiantado demais nao passa',
  assinaturaConfere(corpo, assinar(corpo, 'msg_1', agora + 3600), SEGREDO), false)

conferir('sem cabecalho nenhum nao passa',
  assinaturaConfere(corpo, {}, SEGREDO), false)

conferir('varias assinaturas, uma boa, passa',
  assinaturaConfere(corpo, {
    ...assinar(corpo, 'msg_1', agora),
    'webhook-signature': `v1,YXNzaW5hdHVyYS12ZWxoYQ== ${assinar(corpo, 'msg_1', agora)['webhook-signature']}`,
  }, SEGREDO), true)

/* ----------------------------------------------------------------- marca */

conferir('endereco de volta da OMNI => OMNI',
  marcaDoAviso({ email_data: { redirect_to: 'https://omnifinanc.com/' } }).id, 'omni')

conferir('endereco de volta da Teeds => Teeds',
  marcaDoAviso({ email_data: { redirect_to: 'https://teedscompany.com/' } }).id, 'teeds')

conferir('sem volta, vale a marca do cadastro',
  marcaDoAviso({ user: { user_metadata: { marca: 'omni' } } }).id, 'omni')

conferir('a volta manda mais que o cadastro',
  marcaDoAviso({
    user: { user_metadata: { marca: 'teeds' } },
    email_data: { redirect_to: 'https://omnifinanc.com/entrar' },
  }).id, 'omni')

conferir('sem nada, cai na Teeds',
  marcaDoAviso({}).id, 'teeds')

conferir('endereco torto nao derruba',
  marcaDoAviso({ email_data: { redirect_to: 'nao-e-um-endereco' } }).id, 'teeds')

conferir('site desconhecido nao vira marca',
  marcaDoAviso({ email_data: { redirect_to: 'https://site-estranho.example/' } }).id, 'teeds')

/* ------------------------------------------------------------------ tipo */

conferir('cadastro',        tipoDoAviso('signup'), 'confirmar')
conferir('link magico',     tipoDoAviso('magiclink'), 'magico')
conferir('senha',           tipoDoAviso('recovery'), 'senha')
conferir('convite',         tipoDoAviso('invite'), 'convite')
conferir('troca de e-mail', tipoDoAviso('email_change'), 'trocar-email')
conferir('tipo desconhecido vira nada', tipoDoAviso('coisa_nova'), null)

/* ------------------------------------------------------------------ link */

conferir('o link leva de volta para a marca certa',
  linkDoAviso(
    { email_data: { token_hash: 'abc123', email_action_type: 'signup', redirect_to: 'https://omnifinanc.com/' } },
    'https://projeto.supabase.co/',
    marcaPorId('omni'),
  ),
  'https://projeto.supabase.co/auth/v1/verify?token=abc123&type=signup&redirect_to=https%3A%2F%2Fomnifinanc.com%2F')

conferir('sem volta, usa o site da propria marca',
  linkDoAviso(
    { email_data: { token_hash: 'x', email_action_type: 'invite' } },
    'https://projeto.supabase.co',
    marcaPorId('omni'),
  ),
  'https://projeto.supabase.co/auth/v1/verify?token=x&type=invite&redirect_to=https%3A%2F%2Fomnifinanc.com%2F')

/* ------------------------------------------------------- a porta inteira */
// Nada aqui toca a internet: os dois casos param antes do envio.

process.env.GANCHO_EMAIL_SEGREDO = SEGREDO
process.env.RESEND_CHAVE = 'chave-de-teste-que-nunca-e-usada'
process.env.SUPABASE_URL = 'https://projeto.supabase.co'

const avisoOmni = JSON.stringify({
  user: { email: 'cliente@exemplo.com' },
  email_data: { token_hash: 'abc', email_action_type: 'signup', redirect_to: 'https://omnifinanc.com/' },
})
conferir('assinatura falsa: a porta recusa',
  (await tratarGanchoDeEmail(avisoOmni, { 'webhook-id': 'x', 'webhook-timestamp': String(agora), 'webhook-signature': 'v1,YWFh' })).status,
  401)

conferir('sem configuracao, nao tenta mandar',
  await (async () => {
    const guardado = process.env.RESEND_CHAVE
    delete process.env.RESEND_CHAVE
    const r = await tratarGanchoDeEmail(avisoOmni, assinar(avisoOmni, 'msg_2', agora))
    process.env.RESEND_CHAVE = guardado
    return r.status
  })(),
  500)

// Uma marca sem remetente faria o servidor recusar o envio dela — e um
// cadastro que nunca recebe e-mail é um cliente que some sem reclamar.
// Esta prova é o alarme: marca nova que entrar na tabela sem remetente
// derruba o teste antes de derrubar o cadastro de alguém.
for (const m of Object.values(MARCAS)) {
  conferir(`a ${m.prosa} tem remetente configurado`, typeof m.email.remetente, 'string')
  conferir(`o remetente da ${m.prosa} tem endereco`, /<[^@\s]+@[^>\s]+>$/.test(m.email.remetente ?? ''), true)
}

console.log(`\n${certos} certos, ${errados} errados`)
process.exit(errados ? 1 : 0)
