/**
 * /cadastre-se abre a plataforma direto na tela de cadastro.
 *
 * Pedido do Tiago (09/10/2026): o link das campanhas caía na tela de ENTRAR,
 * e a pessoa ficava perdida procurando o botão "Cadastre-se". Agora:
 *  - /cadastre-se encaminha para a raiz com ?cadastro=1, levando a UTM junto;
 *  - a tela de entrada abre no modo cadastro quando vê ?cadastro=1, ou quando
 *    o link é de uma campanha de e-mail de cadastro (quem recebeu não tem conta).
 *
 *   npm run cadastrese
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { deveAbrirNoCadastro } from '../../src/core/teeds/entradaInicial'

let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}
const RAIZ = join(import.meta.dirname, '../..')
const leia = (p: string) => readFileSync(join(RAIZ, p), 'utf8')

console.log('\n/CADASTRE-SE · O LINK ABRE NO CADASTRO\n')

conferir('?cadastro=1 abre no cadastro', deveAbrirNoCadastro('?cadastro=1'), true)
conferir('e com a UTM junto também', deveAbrirNoCadastro('?utm_source=email&utm_campaign=acesso-gratuito&cadastro=1'), true)
conferir('o e-mail de acesso gratuito abre no cadastro, mesmo sem /cadastre-se', deveAbrirNoCadastro('?utm_source=email&utm_campaign=acesso-gratuito'), true)
conferir('o e-mail da repescagem também', deveAbrirNoCadastro('?utm_source=email&utm_campaign=cadastro'), true)
conferir('o endereço puro continua na tela de entrar', deveAbrirNoCadastro(''), false)
// O link do Telegram é usado também por quem já tem conta para entrar.
conferir('o link do Telegram continua na tela de entrar', deveAbrirNoCadastro('?utm_source=telegram&utm_campaign=cadastro-liberado'), false)
conferir('campanha de cadastro vinda de outra fonte não força nada', deveAbrirNoCadastro('?utm_source=instagram&utm_campaign=cadastro'), false)

const pagina = leia('public/cadastre-se/index.html')
conferir('/cadastre-se encaminha para a raiz com cadastro=1', /q\.set\('cadastro', '1'\)/.test(pagina) && /location\.replace\('\/\?' \+ q\.toString\(\)/.test(pagina), true)
conferir('e leva a UTM do link junto (usa a busca original)', /new URLSearchParams\(location\.search\)/.test(pagina), true)
conferir('e não aparece em buscador', /name="robots" content="noindex"/.test(pagina), true)

const tela = leia('src/components/LoginScreen.tsx')
conferir('a tela de entrada abre no modo cadastro quando pedido', /useState<Modo>\(abrirNoCadastro \? 'criar' : 'entrar'\)/.test(tela), true)

const vite = leia('vite.config.ts')
conferir('o app guardado para uso sem rede é só a raiz', /if\(x\.ok&&raiz\)caches\.open\(CACHE\)/.test(vite), true)

const emails = leia('servidor/src/campanhas.ts')
conferir('os e-mails de cadastro apontam para /cadastre-se', (emails.match(/new URL\('\/cadastre-se', marca\.redirectUri\)/g) ?? []).length, 2)

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
