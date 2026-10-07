/**
 * O cadastro grava de onde a pessoa veio.
 *
 * O DEFEITO (07/10/2026): os 48 cadastros feitos pela tela de login chegaram
 * todos com origem e campanha vazias. A visita lê a UTM ao abrir o site,
 * guarda no navegador e limpa a barra de endereço; o formulário procurava a
 * UTM na barra, já limpa. Toda campanha, do Telegram e do e-mail, sumia.
 *
 * Esta prova roda o caminho real: abre o site com a UTM, deixa a visita
 * limpar a barra, preenche o cadastro depois, e confere o que vai ao servidor.
 *
 *   npm run origem
 */
let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

class Caixa { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null } setItem(k: string, v: string) { this.m.set(k, String(v)) } removeItem(k: string) { this.m.delete(k) } }
const g = globalThis as unknown as Record<string, unknown>
let href = ''
const enviados: Array<{ url: string; corpo: any }> = []
function navegador(url: string, local = new Caixa()) {
  href = url
  Object.defineProperty(g, 'localStorage', { value: local, configurable: true })
  Object.defineProperty(g, 'sessionStorage', { value: new Caixa(), configurable: true })
  Object.defineProperty(g, 'location', { configurable: true, get: () => { const u = new URL(href); return { href: u.href, search: u.search, pathname: u.pathname, hostname: u.hostname, hash: u.hash } } })
  Object.defineProperty(g, 'history', { configurable: true, value: { replaceState: (_s: unknown, _t: string, nova: string) => { href = new URL(nova, href).href } } })
  Object.defineProperty(g, 'document', { configurable: true, value: { referrer: '' } })
  Object.defineProperty(g, 'navigator', { configurable: true, value: { userAgent: 'iPhone', language: 'pt-BR', maxTouchPoints: 5 } })
  g.fetch = async (u: string, o: { body?: string } = {}) => { enviados.push({ url: u, corpo: o.body ? JSON.parse(o.body) : null }); return { ok: true, json: async () => ({}) } }
  return local
}

const { registrarVisita } = await import('../../src/core/teeds/visitas')
const { inscreverFilaEspera } = await import('../../src/core/teeds/leads')
const dados = { nome: 'Maria Teste', email: 'maria@exemplo.com', telefone: '11999998888', consentiu: true }
const doCadastro = () => enviados.filter((e) => e.url.endsWith('/publico/leads')).at(-1)?.corpo
const daVisita = () => enviados.filter((e) => e.url.endsWith('/publico/visita')).at(-1)?.corpo

console.log('\nORIGEM DO CADASTRO · A CAMPANHA NÃO SOME\n')

/* ------------------------------- chega pelo e-mail e se cadastra depois */
navegador('https://teedscompany.com/?utm_source=email&utm_campaign=cadastro')
registrarVisita()
conferir('a visita anota a campanha do e-mail', [daVisita()?.origem, daVisita()?.campanha], ['email', 'cadastro'])
conferir('e limpa a barra de endereço (de propósito)', href, 'https://teedscompany.com/')
await inscreverFilaEspera(dados)
conferir('O CADASTRO grava a origem, mesmo com a barra já limpa', doCadastro()?.origem, 'email')
conferir('e a campanha', doCadastro()?.campanha, 'cadastro')
const pagina = new URL(doCadastro()?.pagina)
conferir('a página gravada leva o id do navegador (liga cadastro e visitas)', (pagina.searchParams.get('visitante') ?? '').length >= 8, true)
conferir('e o mesmo id que a visita usou', pagina.searchParams.get('visitante'), daVisita()?.visitante)
conferir('e continua dizendo que veio da tela de login', pagina.searchParams.get('origem_cadastro'), 'login')

/* -------------------- chega pelo Telegram, fecha, volta digitando o site */
const local = navegador('https://teedscompany.com/?utm_source=telegram&utm_campaign=cadastro-liberado')
registrarVisita()
navegador('https://teedscompany.com/', local)   // outro dia, mesmo navegador, sem UTM
registrarVisita()
await inscreverFilaEspera(dados)
conferir('quem volta dias depois continua atribuído ao Telegram', [doCadastro()?.origem, doCadastro()?.campanha], ['telegram', 'cadastro-liberado'])

/* -------------------- Telegram antes, e-mail depois: vale o último explícito */
const l2 = navegador('https://teedscompany.com/?utm_source=telegram&utm_campaign=cadastro-liberado')
registrarVisita()
navegador('https://teedscompany.com/?utm_source=email&utm_campaign=cadastro', l2)
registrarVisita()
await inscreverFilaEspera(dados)
conferir('quem veio do Telegram e depois clicou no e-mail fica com o e-mail', doCadastro()?.origem, 'email')

/* ------------------------------------------ chega sem campanha nenhuma */
navegador('https://teedscompany.com/')
registrarVisita()
await inscreverFilaEspera(dados)
conferir('sem UTM, a origem vai vazia (e não inventada)', doCadastro()?.origem, null)

/* -------------------------- conteúdo e termo também atravessam a limpeza */
navegador('https://teedscompany.com/?utm_source=email&utm_campaign=cadastro&utm_content=botao&utm_term=frio')
registrarVisita()
await inscreverFilaEspera(dados)
conferir('utm_content e utm_term chegam ao cadastro', [doCadastro()?.conteudo, doCadastro()?.termo], ['botao', 'frio'])

console.log(`\n${passou} certos, ${falhou} errados`)
process.exit(falhou ? 1 : 0)
