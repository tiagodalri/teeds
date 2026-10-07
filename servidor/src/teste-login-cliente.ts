/**
 * O login pelo servidor troca o código certo, para a pessoa certa, na marca certa.
 *
 * Ver `login-cliente.ts`: é o caminho do app instalado no iPhone, onde o app
 * e o Safari não compartilham armazenamento. Estas provas rodam a ida e a
 * volta sem rede, com uma Deriv de mentira e um cofre de mentira.
 *
 *   npm run logincli
 */
import { createHash } from 'node:crypto'
import { concluirLoginDoCliente, iniciarLoginDoCliente, VALIDADE_MS } from './login-cliente'
import { MARCAS } from '../../src/marca/marcas'

let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}
const b64 = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const RETORNO = 'https://198-211-96-238.nip.io/callback'
console.log('\nLOGIN PELO SERVIDOR · O APP INSTALADO NO IPHONE\n')

/* ------------------------------------------------------------- a ida */
const ida = iniciarLoginDoCliente('usuario-omni-1', 'omni', RETORNO)
const u = new URL(ida.url)
conferir('vai para a autorização da Deriv', u.origin + u.pathname, 'https://auth.deriv.com/oauth2/auth')
conferir('com a app da marca PEDIDA (OMNI), não a da casa', u.searchParams.get('client_id'), MARCAS.omni.appId)
conferir('e com o retorno registrado na Deriv', u.searchParams.get('redirect_uri'), RETORNO)
conferir('o state da URL é o mesmo que guarda o pedido', u.searchParams.get('state'), ida.state)
conferir('o desafio é o SHA-256 do verificador',
  u.searchParams.get('code_challenge'), b64(createHash('sha256').update(ida.pedido.verifier).digest()))
conferir('o verificador não vai na URL', ida.url.includes(ida.pedido.verifier), false)
conferir('o pedido sabe de quem é e de que marca', [ida.pedido.userId, ida.pedido.marca], ['usuario-omni-1', 'omni'])
conferir('dois pedidos nunca repetem o state',
  iniciarLoginDoCliente('x', 'teeds', RETORNO).state === iniciarLoginDoCliente('x', 'teeds', RETORNO).state, false)
conferir('marca desconhecida cai na padrão, sem quebrar',
  iniciarLoginDoCliente('x', 'nao-existe', RETORNO).pedido.marca, 'teeds')

/* ------------------------------------------------------------ a volta */
let trocado: Record<string, string> | null = null
let guardado: { userId: string; marca: string; token: string } | null = null
const derivDeMentira = async (_u: string, corpo: URLSearchParams) => {
  trocado = Object.fromEntries(corpo)
  return { ok: true, status: 200, json: async () => ({ access_token: 'tok-abc', refresh_token: 'ref-1', expires_in: 3600 }) }
}
const cofreDeMentira = async (userId: string, s: { accessToken: string }, marca: string) => { guardado = { userId, marca, token: s.accessToken } }

const sessao = await concluirLoginDoCliente(ida.pedido, 'codigo-123', RETORNO, derivDeMentira, cofreDeMentira, ida.pedido.criadaEm + 5_000)
conferir('troca com o verificador do pedido', trocado!.code_verifier, ida.pedido.verifier)
conferir('e com o código devolvido pela Deriv', trocado!.code, 'codigo-123')
conferir('e com a app da marca do pedido', trocado!.client_id, MARCAS.omni.appId)
conferir('guarda no cofre do DONO do pedido, na marca dele', guardado, { userId: 'usuario-omni-1', marca: 'omni', token: 'tok-abc' })
conferir('e devolve a sessão com vencimento calculado', sessao.expiresAt, ida.pedido.criadaEm + 5_000 + 3_600_000)

/* ------------------------------------------- o que não pode acontecer */
trocado = null; guardado = null
const vencido = await concluirLoginDoCliente(ida.pedido, 'c', RETORNO, derivDeMentira, cofreDeMentira, ida.pedido.criadaEm + VALIDADE_MS + 1)
  .then(() => 'aceitou', (e: Error) => e.message)
conferir('pedido vencido é recusado antes de falar com a Deriv', /vencido/.test(String(vencido)) && trocado === null, true)

const recusa = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'código já usado' }) })
guardado = null
const erro = await concluirLoginDoCliente(ida.pedido, 'c', RETORNO, recusa, cofreDeMentira).then(() => 'aceitou', (e: Error) => e.message)
conferir('recusa da Deriv vira erro com a razão dela', erro, 'código já usado')
conferir('e nada é guardado no cofre', guardado, null)

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
