/**
 * O login na Deriv tem de sobreviver à troca de aba.
 *
 * O DEFEITO, 07/10/2026 (Tiago, no celular): entrar na corretora, fazer o
 * login, e a página não voltar para a plataforma — ficar na Deriv. Abrir a
 * plataforma de novo pedia o login outra vez, em círculo.
 *
 * A ida é um `location.assign` para `auth.deriv.com/oauth2/auth`, que
 * redireciona para `home.deriv.com/dashboard/login?flow=…`. Medido na página
 * de login da Deriv, no mesmo dia, com viewport de celular:
 *
 *     sessionStorage["kratos_oauth2_request_url_return_to"]  → a nossa URL
 *     sessionStorage["oauth2_login_challenge_carryover"]     → o desafio
 *
 * Ou seja: a Deriv guarda o endereço de volta no `sessionStorage` DAQUELA
 * ABA. Se o login termina em outra aba, ela não tem para onde voltar e deixa
 * a pessoa no painel dela. Isso é da Deriv.
 *
 * O QUE ERA NOSSO: o verificador e o `state` do PKCE moravam em
 * `sessionStorage` também. Então, mesmo quando a volta chegava certa numa aba
 * nova, a troca pelo token morria em "Sessão de login perdida" — e o círculo
 * se fechava por nossa causa. No celular isso é rotina: o app instalado abre
 * a corretora no navegador do sistema, a folha interna é outro contexto, o
 * sistema descarta a aba de fundo.
 *
 * Estas provas rodam o login de verdade, com armazenamento de mentira, e a
 * que importa é a do RETORNO EM OUTRA ABA.
 *
 *   npm run logindiv
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { completeLogin, loginPendente, logout, startLogin } from '../../src/core/deriv/auth'
import { MARCA } from '../../src/marca'

let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

/* ------------------------------------------------ armazenamento de mentira */

class Caixa {
  mapa = new Map<string, string>()
  bloqueada = false
  getItem(k: string) { if (this.bloqueada) throw new Error('bloqueado'); return this.mapa.get(k) ?? null }
  setItem(k: string, v: string) { if (this.bloqueada) throw new Error('bloqueado'); this.mapa.set(k, String(v)) }
  removeItem(k: string) { if (this.bloqueada) throw new Error('bloqueado'); this.mapa.delete(k) }
}

/** O navegador: um `localStorage` e a aba da vez. */
const navegador = { local: new Caixa(), aba: new Caixa() }
/** Trocar de aba troca o `sessionStorage` e mantém o `localStorage`. */
const outraAba = () => { navegador.aba = new Caixa() }

let idaPara = ''
const g = globalThis as unknown as Record<string, unknown>
Object.defineProperty(g, 'localStorage', { get: () => navegador.local, configurable: true })
Object.defineProperty(g, 'sessionStorage', { get: () => navegador.aba, configurable: true })
g.window = {
  get location() { return { href: paginaAtual, pathname: '/', assign: (u: string) => { idaPara = u } } },
  history: { replaceState: () => {} },
}
let paginaAtual = 'https://teedscompany.com/'

/** A Deriv devolvendo o token. Guarda o corpo para as provas do PKCE. */
let ultimaTroca: Record<string, string> = {}
g.fetch = async (_u: string, opcoes: { body: URLSearchParams }) => {
  ultimaTroca = Object.fromEntries(new URLSearchParams(String(opcoes.body)))
  return { ok: true, json: async () => ({ access_token: 'token-de-prova', refresh_token: 'r', expires_in: 3600 }) }
}

/** Faz a ida e devolve o `?code=…&state=…` que a Deriv mandaria de volta. */
async function irParaADeriv(): Promise<{ code: string; state: string }> {
  await startLogin()
  const enviado = new URL(idaPara)
  return { code: 'codigo-de-prova', state: enviado.searchParams.get('state')! }
}
/* Conclui e devolve o token OU a mensagem do erro. Nunca lança: a suíte
   precisa relatar a falha, não morrer nela. */
const concluir = () => completeLogin().then(
  (s) => s?.accessToken ?? 'sem sessão',
  (e: Error) => `erro: ${e.message}`,
)
const voltarPara = (v: { code: string; state: string }) => {
  paginaAtual = `https://teedscompany.com/?code=${v.code}&state=${v.state}`
}
const zerar = () => { navegador.local = new Caixa(); navegador.aba = new Caixa(); logout() }

/* O pedido como está no armazenamento do navegador — nulo quando não há.
   Lido assim, e não com `!`, para que a prova ACUSE a ausência em vez de
   derrubar a suíte: um teste que quebra no código defeituoso não serve de
   rede. */
const pedidoGuardado = (): { verifier: string; state: string; criadoEm: number } | null => {
  try { return JSON.parse(navegador.local.getItem(`${MARCA.id}.pkce`) ?? 'null') } catch { return null }
}

console.log('\nLOGIN NA DERIV · A VOLTA NÃO DEPENDE DA ABA\n')

/* ------------------------------------------------------- a ida está certa */

zerar()
const ida = await irParaADeriv()
const url = new URL(idaPara)
conferir('a ida vai para a página de autorização da Deriv',
  url.origin + url.pathname, 'https://auth.deriv.com/oauth2/auth')
conferir('leva a app da marca', url.searchParams.get('client_id'), MARCA.appId)
conferir('leva o desafio, não o verificador', url.searchParams.get('code_challenge_method'), 'S256')
// O verificador nunca viaja na URL: é esse o ponto do PKCE.
conferir('e o pedido fica guardado fora da aba', !!pedidoGuardado(), true)
conferir('o verificador não vai na URL',
  pedidoGuardado() ? idaPara.includes(pedidoGuardado()!.verifier) : 'sem pedido', false)

/* -------------------------------------------- A PROVA QUE PEGA O DEFEITO */

// Mesma aba: já funcionava antes, e não pode parar de funcionar.
voltarPara(ida)
conferir('volta na mesma aba conclui o login', await concluir(), 'token-de-prova')

// OUTRA ABA — era aqui que morria. O `sessionStorage` é novo, o do navegador
// continua o mesmo, exatamente como num celular que abriu a corretora fora
// do app e voltou em outro contexto do mesmo navegador.
zerar()
const ida2 = await irParaADeriv()
outraAba()
voltarPara(ida2)
conferir('volta em OUTRA ABA conclui o login', await concluir(), 'token-de-prova')

// E o verificador que a troca usa é o do pedido guardado fora da aba — sem
// isso a prova de cima passaria com qualquer verificador, inclusive o errado.
zerar()
const ida3 = await irParaADeriv()
const guardadoNoNavegador = pedidoGuardado()?.verifier ?? 'sem pedido guardado'
outraAba()
voltarPara(ida3)
await concluir()
conferir('e a troca usa o verificador do pedido guardado',
  ultimaTroca.code_verifier, guardadoNoNavegador)
conferir('com o `redirect_uri` da marca', ultimaTroca.redirect_uri, MARCA.redirectUri)

/* ------------------------------------------------- o PKCE segue protegendo */

zerar()
const ida4 = await irParaADeriv()
voltarPara({ code: 'codigo-de-prova', state: 'state-de-outro-lugar' })
conferir('um `state` que não é nosso é recusado',
  await completeLogin().then(() => 'passou', (e: Error) => /perdida/.test(e.message) ? 'recusado' : e.message),
  'recusado')
conferir('e nada foi trocado com a Deriv nesse caso', ultimaTroca.state, undefined)
void ida4

// Duas abas pedindo login: a última grava no `localStorage`, mas a volta da
// primeira ainda casa pelo espelho da própria aba.
zerar()
const primeira = await irParaADeriv()
const guardaDaPrimeira = new Caixa()
guardaDaPrimeira.mapa = new Map(navegador.aba.mapa)
outraAba()
await irParaADeriv()              // a segunda aba sobrescreve o localStorage
navegador.aba = guardaDaPrimeira  // de volta para a primeira aba
voltarPara(primeira)
conferir('com duas abas, a volta da primeira ainda conclui',
  await concluir(), 'token-de-prova')

// Pedido vencido não serve — e sai do caminho.
zerar()
const velho = await irParaADeriv()
const p = pedidoGuardado()
navegador.local.setItem(`${MARCA.id}.pkce`, JSON.stringify({ ...(p ?? velho), criadoEm: Date.now() - 16 * 60_000 }))
navegador.aba = new Caixa()
voltarPara(velho)
conferir('pedido de mais de 15 minutos é recusado',
  await completeLogin().then(() => 'passou', () => 'recusado'), 'recusado')
conferir('e o pedido vencido é apagado', pedidoGuardado(), null)

/* ---------------------------------------------------------- uso único e fim */

zerar()
const umaVez = await irParaADeriv()
conferir('começou o login: a tela sabe que há um pendente', loginPendente(), true)
voltarPara(umaVez)
conferir('o login de uso único conclui', await concluir(), 'token-de-prova')
conferir('concluído, não há mais pendente', loginPendente(), false)
conferir('e o pedido foi apagado (uso único)', pedidoGuardado(), null)

// Repetir o mesmo retorno não vale de novo.
voltarPara(umaVez)
conferir('o mesmo código não serve duas vezes',
  await completeLogin().then(() => 'passou', () => 'recusado'), 'recusado')

zerar()
await irParaADeriv()
logout()
conferir('sair apaga o pedido em curso', loginPendente(), false)

/* -------------------------- navegação privada: o espelho da aba segura */

zerar()
navegador.local.bloqueada = true
const privada = await irParaADeriv()
voltarPara(privada)
// O token já foi emitido pela Deriv: não guardar é aceitável, derrubar não é.
conferir('com o armazenamento bloqueado, a mesma aba ainda conclui',
  await concluir(), 'token-de-prova')
navegador.local.bloqueada = false

/* ------------------------------------------------- a tela diz o que houve */

const RAIZ = join(import.meta.dirname, '../..')
const tela = readFileSync(join(RAIZ, 'src/components/DerivDesconectada.tsx'), 'utf8')
conferir('a tela pergunta se há um login pendente', /loginPendente\(\)/.test(tela), true)
conferir('e explica que a página não voltou',
  /não voltou para a \{MARCA\.prosa\}/.test(tela), true)
conferir('e promete concluir sem pedir a senha de novo',
  /não vai\s*\n?\s*pedir a senha de novo/.test(tela), true)
// "Ainda não tenho conta" não cabe para quem acabou de entrar na corretora.
conferir('e esconde "ainda não tenho conta" nesse caso',
  /\{!voltaPerdida && \(/.test(tela), true)

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
