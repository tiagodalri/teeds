// Uma conta por marca (20/10/2026): node dist/teste-conta-por-marca.mjs
import assert from 'node:assert/strict'
import { emailDaConta, emailReal, marcaDaConta } from '../../src/core/teeds/emailDaConta'
import { entregarAviso, marcaDoAviso } from './gancho-email'

let certos = 0, errados = 0
const caso = (nome: string, f: () => void) => { try { f(); certos++; console.log('  ok   ', nome) } catch (e) { errados++; console.log('  FALHA', nome, (e as Error).message) } }

caso('a Teeds continua com o e-mail de sempre', () => assert.equal(emailDaConta(' Ana@Gmail.com ', 'teeds'), 'ana@gmail.com'))
caso('a GlobalFly ganha a etiqueta', () => assert.equal(emailDaConta('ana@gmail.com', 'globalfly'), 'ana+marca-globalfly@gmail.com'))
caso('a OMNI ganha a etiqueta', () => assert.equal(emailDaConta('Ana@gmail.com', 'omni'), 'ana+marca-omni@gmail.com'))
caso('e-mail com + de verdade continua certo', () => assert.equal(emailDaConta('ana+trade@gmail.com', 'omni'), 'ana+trade+marca-omni@gmail.com'))
caso('não etiqueta duas vezes', () => assert.equal(emailDaConta('ana+marca-omni@gmail.com', 'omni'), 'ana+marca-omni@gmail.com'))
caso('o e-mail de verdade volta sem etiqueta', () => assert.equal(emailReal('ana+trade+marca-omni@gmail.com'), 'ana+trade@gmail.com'))
caso('sem etiqueta, o e-mail fica igual', () => assert.equal(emailReal('ana@gmail.com'), 'ana@gmail.com'))
caso('a marca sai da etiqueta', () => { assert.equal(marcaDaConta('ana+marca-globalfly@gmail.com'), 'globalfly'); assert.equal(marcaDaConta('ana@gmail.com'), 'teeds') })
caso('as três contas da mesma pessoa são diferentes', () => assert.equal(new Set(['teeds', 'omni', 'globalfly'].map((m) => emailDaConta('ana@gmail.com', m))).size, 3))
caso('o carteiro usa a marca da etiqueta, mesmo se o pedido veio de outro site', () =>
  assert.equal(marcaDoAviso({ user: { email: 'ana+marca-globalfly@gmail.com', user_metadata: { marca: 'teeds' } }, email_data: { redirect_to: 'https://teeds.com.br/' } } as any).id, 'globalfly'))

// troca de e-mail: cada endereço recebe o seu link (os nomes dos códigos são invertidos na Supabase)
process.env.RESEND_CHAVE = 'teste'; process.env.SUPABASE_URL = 'https://banco.invalid'
const enviados: Array<{ para: string; link: string }> = []
globalThis.fetch = (async (_u: unknown, init: { body: string }) => {
  const b = JSON.parse(init.body); enviados.push({ para: b.to[0], link: (String(b.text).match(/confirmar=([A-Za-z0-9]+)/) ?? [])[1] ?? '' })
  return new Response('{}', { status: 200 })
}) as unknown as typeof fetch
await entregarAviso({ user: { email: 'ana+marca-globalfly@gmail.com', new_email: 'ana.nova+marca-globalfly@gmail.com' }, email_data: { email_action_type: 'email_change', token_hash: 'PARANOVO', token_hash_new: 'PARAATUAL', redirect_to: 'https://globalflytrade.com/' } } as never)
caso('troca de e-mail: o endereço novo recebe o código dele', () => assert.deepEqual(enviados.find((e) => e.para === 'ana.nova@gmail.com')?.link, 'PARANOVO'))
caso('troca de e-mail: o endereço atual recebe o outro código', () => assert.deepEqual(enviados.find((e) => e.para === 'ana@gmail.com')?.link, 'PARAATUAL'))
caso('troca de e-mail: só dois e-mails, nenhum com a etiqueta', () => { assert.equal(enviados.length, 2); assert.ok(enviados.every((e) => !e.para.includes('+marca-'))) })

console.log(`\n${certos} certos, ${errados} errados`)
if (errados) process.exit(1)
