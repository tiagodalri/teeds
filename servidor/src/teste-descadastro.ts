/**
 * Provas do "sair da lista".
 *
 *   cd servidor && npm run descadastro
 *
 * Sem rede e sem banco: só o bilhete assinado, que é a parte onde um erro
 * custa caro. Um bilhete que aceita adulteração deixa qualquer um
 * descadastrar qualquer pessoa; um bilhete que vaza o endereço deixa
 * qualquer um descobrir quem está na lista mexendo na URL.
 */
process.env.SUPABASE_SECRET = 'chave-de-teste-nao-usada-em-producao'

import assert from 'node:assert/strict'
import { bilhete, abrirBilhete, linkDeDescadastro } from './descadastro'

let certos = 0
const conferir = (nome: string, fn: () => void) => { fn(); certos++; console.log(`✓ ${nome}`) }

conferir('o bilhete volta com a marca e o e-mail de quem saiu', () => {
  const t = bilhete('teeds', 'maria.souza@email.com')
  assert.deepEqual(abrirBilhete(t), { marca: 'teeds', email: 'maria.souza@email.com' })
})

conferir('o e-mail é normalizado: maiúscula e espaço não criam duas pessoas', () => {
  const a = abrirBilhete(bilhete('teeds', '  Maria.Souza@Email.com '))
  assert.deepEqual(a, { marca: 'teeds', email: 'maria.souza@email.com' })
  assert.equal(bilhete('teeds', 'MARIA.SOUZA@EMAIL.COM'), bilhete('teeds', 'maria.souza@email.com'))
})

conferir('cada marca tem o seu bilhete: sair da Teeds não tira da OMNI', () => {
  assert.notEqual(bilhete('teeds', 'a@b.com'), bilhete('omni', 'a@b.com'))
  assert.equal(abrirBilhete(bilhete('omni', 'a@b.com'))?.marca, 'omni')
})

conferir('trocar o e-mail dentro do bilhete não passa', () => {
  const t = bilhete('teeds', 'maria@email.com')
  const aberto = Buffer.from(t, 'base64url').toString('utf8')
  const forjado = Buffer.from(aberto.replace('maria@email.com', 'outra@email.com'), 'utf8').toString('base64url')
  assert.equal(abrirBilhete(forjado), null)
})

conferir('bilhete inventado, vazio ou truncado não passa', () => {
  for (const lixo of ['', 'abc', 'x'.repeat(80), Buffer.from('teeds|a@b.com|').toString('base64url')]) {
    assert.equal(abrirBilhete(lixo), null)
  }
})

conferir('assinatura do tamanho certo, mas errada, não passa', () => {
  const t = bilhete('teeds', 'maria@email.com')
  const [marca, email, assinatura] = Buffer.from(t, 'base64url').toString('utf8').split('|')
  const trocada = assinatura.slice(0, -1) + (assinatura.at(-1) === 'A' ? 'B' : 'A')
  assert.equal(abrirBilhete(Buffer.from(`${marca}|${email}|${trocada}`).toString('base64url')), null)
})

conferir('o link não mostra o e-mail a quem olhar a URL', () => {
  const link = linkDeDescadastro('teeds', 'maria.souza@email.com')
  assert.ok(!link.includes('maria'), 'o endereço não pode aparecer aberto no link')
  assert.ok(!link.includes('@'), 'nem o arroba')
  assert.match(link, /^https:\/\/motor\.teedscompany\.com\/publico\/descadastrar\?t=/)
})

console.log(`\n${certos} provas de descadastro concluídas.`)
