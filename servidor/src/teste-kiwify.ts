import './ambiente'
import { createHmac } from 'node:crypto'
import { assinaturaConfere, ehOSimulador, lerAviso } from './kiwify'

/**
 * O gancho da Kiwify, sem rede e sem banco.
 *
 * O que estas provas seguram, e por que cada uma existe:
 *
 *  - a ASSINATURA é a única autorização desta porta. Se ela aceitar um corpo
 *    adulterado, qualquer um com a URL libera um produto de R$ 497 de graça;
 *  - o PRODUTO certo: a mesma conta Kiwify vende alertas e cotas de viagem.
 *    Uma compra de R$ 127 não pode destravar o simulador;
 *  - a LEITURA do aviso tem de achar pedido, evento e e-mail nos nomes que a
 *    Kiwify usa, e desistir quando falta um deles.
 *
 *   npm run kiwify
 */
let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

const TOKEN = 'token-de-teste-abc123'
const assinar = (corpo: string, token = TOKEN) => createHmac('sha1', token).update(corpo, 'utf8').digest('hex')

const COMPRA = {
  order_id: 'PEDIDO-123',
  webhook_event_type: 'order_approved',
  Customer: { full_name: 'Fulano de Tal', email: 'Fulano@Exemplo.com' },
  Product: { product_id: 'prod-simulador', product_name: 'Simulador de Treinamento Teeds' },
  Commissions: { charge_amount: 49700, currency: 'BRL' },
}
const CRU = JSON.stringify(COMPRA)

console.log('\nKIWIFY · A ASSINATURA É A PORTA\n')
conferir('corpo e assinatura corretos passam', assinaturaConfere(CRU, assinar(CRU), TOKEN), true)
conferir('assinatura em MAIÚSCULAS também passa', assinaturaConfere(CRU, assinar(CRU).toUpperCase(), TOKEN), true)
conferir('corpo adulterado não passa',
  assinaturaConfere(CRU.replace('49700', '100'), assinar(CRU), TOKEN), false)
conferir('token errado não passa', assinaturaConfere(CRU, assinar(CRU, 'outro-token'), TOKEN), false)
conferir('sem assinatura não passa', assinaturaConfere(CRU, '', TOKEN), false)
conferir('sem token no servidor não passa', assinaturaConfere(CRU, assinar(CRU), ''), false)
// Um byte a mais no fim muda o HMAC inteiro: é o caso de quem reserializa o JSON.
conferir('corpo reserializado (um espaço a mais) não passa',
  assinaturaConfere(JSON.stringify(COMPRA, null, 1), assinar(CRU), TOKEN), false)

console.log('\nKIWIFY · LENDO O AVISO\n')
const aviso = lerAviso(COMPRA)!
conferir('pedido, evento e e-mail saem certos',
  [aviso.pedido, aviso.evento, aviso.email], ['PEDIDO-123', 'order_approved', 'fulano@exemplo.com'])
conferir('o e-mail vem sempre em minúsculas', aviso.email, 'fulano@exemplo.com')
conferir('centavos viram reais', aviso.valor, 497)
conferir('produto e nome vêm juntos', [aviso.produtoId, aviso.produtoNome], ['prod-simulador', 'Simulador de Treinamento Teeds'])

conferir('aviso sem e-mail é recusado',
  lerAviso({ order_id: 'X', webhook_event_type: 'order_approved', Customer: {} }), null)
conferir('aviso sem pedido é recusado',
  lerAviso({ webhook_event_type: 'order_approved', Customer: { email: 'a@b.com' } }), null)
conferir('corpo que não é objeto é recusado', lerAviso('nada disso'), null)
// Nomes alternativos: a Kiwify já mandou `order_status` no lugar do tipo do evento.
conferir('aceita order_status quando não vem webhook_event_type',
  lerAviso({ order_id: 'Y', order_status: 'PAID', customer: { email: 'c@d.com' } })?.evento, 'paid')

console.log('\nKIWIFY · SÓ O PRODUTO CERTO LIBERA\n')
conferir('o id configurado manda', ehOSimulador(aviso, 'prod-simulador'), true)
conferir('id diferente não libera', ehOSimulador(aviso, 'prod-alertas-whatsapp'), false)
conferir('sem id configurado, cai no nome', ehOSimulador(aviso, ''), true)
const outro = lerAviso({ ...COMPRA, Product: { product_id: 'prod-alertas', product_name: 'Alertas no WhatsApp - Anual' } })!
conferir('outro produto, sem id configurado, não libera', ehOSimulador(outro, ''), false)
conferir('outro produto, com id configurado, não libera', ehOSimulador(outro, 'prod-simulador'), false)

console.log(`\n${passou} certos, ${falhou} errados\n`)
process.exit(falhou ? 1 : 0)
