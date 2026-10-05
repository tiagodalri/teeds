/**
 * O link do Marketplace para o checkout da Kiwify.
 *
 * Esta prova existe por um motivo so, e ele vale dinheiro: a liberacao
 * automatica do Simulador acha o cliente pelo E-MAIL. O gancho
 * (`teeds_kiwify_aplicar`) procura em `clientes` por `lower(email)`; se a
 * compra chegar com outro e-mail, ela entra como `sem-cadastro`, ninguem e'
 * liberado e alguem tem de resolver a mao — com o cliente esperando, tendo
 * pago R$ 497.
 *
 * Entao o que estas provas seguram:
 *
 *  - o e-mail da sessao VAI no link, sempre, e em minusculas (o banco compara
 *    com `lower()`);
 *  - a OMNI NAO ganha checkout por tabela: la o botao continua registrando
 *    interesse, e um link vazando para la mandaria o cliente da OMNI pagar
 *    numa pagina da Teeds;
 *  - produto sem checkout devolve `null`, que e' como quem chama decide entre
 *    abrir o pagamento e registrar interesse.
 *
 *   npm run checkout
 */
import { linkDoCheckout, temCheckout } from '../../src/core/teeds/checkout'

let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}
const parametros = (link: string | null) => {
  if (!link) return null
  const u = new URL(link)
  return { destino: u.origin + u.pathname, ...Object.fromEntries(u.searchParams) }
}

const CLIENTE = { email: 'Fulano@Exemplo.COM', nome: 'Fulano de Tal', telefone: '(47) 99999-8888' }

console.log('\nCHECKOUT · O E-MAIL E O QUE LIBERA O ACESSO\n')

const link = linkDoCheckout('simulador-treino', CLIENTE, 'teeds')
conferir('o link leva e-mail, nome e telefone', parametros(link), {
  destino: 'https://pay.kiwify.com.br/HNyDBOf',
  email: 'fulano@exemplo.com', name: 'Fulano de Tal', phone: '47999998888',
})
conferir('o e-mail vai sempre em minusculas', parametros(link)?.email, 'fulano@exemplo.com')

// Sem e-mail o link ainda funciona — so perde a liberacao automatica.
conferir('sem comprador, o link continua valido',
  parametros(linkDoCheckout('simulador-treino', null, 'teeds')),
  { destino: 'https://pay.kiwify.com.br/HNyDBOf' })
conferir('campo vazio nao vira parametro vazio',
  parametros(linkDoCheckout('simulador-treino', { email: '  ', nome: '', telefone: null }, 'teeds')),
  { destino: 'https://pay.kiwify.com.br/HNyDBOf' })

console.log('\nCHECKOUT · O TELEFONE\n')

const fone = (v: string | null) => parametros(linkDoCheckout('simulador-treino', { telefone: v }, 'teeds'))?.phone
conferir('tira a mascara', fone('(47) 99999-8888'), '47999998888')
conferir('tira o +55 que o campo da Kiwify ja coloca', fone('+55 47 99999-8888'), '47999998888')
conferir('aceita fixo de 10 digitos', fone('4733334444'), '4733334444')
// Numero quebrado nao pode ir: a Kiwify recusa o formulario e o cliente
// desiste sem entender por que.
conferir('numero curto demais nao vai', fone('9999'), undefined)
conferir('numero comprido demais nao vai', fone('5547999998888123'), undefined)
conferir('sem telefone, sem parametro', fone(null), undefined)

console.log('\nCHECKOUT · SO A TEEDS, E SO O SIMULADOR\n')

conferir('a Teeds tem checkout do Simulador', temCheckout('simulador-treino', 'teeds'), true)
conferir('a OMNI nao tem', temCheckout('simulador-treino', 'omni'), false)
conferir('a OMNI devolve null', linkDoCheckout('simulador-treino', CLIENTE, 'omni'), null)
conferir('outro produto da Teeds nao tem', temCheckout('mentoria-alavancagem', 'teeds'), false)
conferir('outro produto devolve null', linkDoCheckout('robos-exclusivos', CLIENTE, 'teeds'), null)
conferir('marca desconhecida devolve null', linkDoCheckout('simulador-treino', CLIENTE, 'outra'), null)

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
