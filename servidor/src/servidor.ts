import './ambiente'

import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync, chmodSync, existsSync, readFileSync } from 'node:fs'
import { DERIV } from '../../src/core/deriv/config'
import { atender, autorizacao } from './mcp'
import { contasDoUsuario, limitesDoCliente, limparSessoesOrfas, supabaseConfigurado, usuarioDoToken } from './supabase'
import { contas, iniciar, montarConfig, parar, todas, ver } from './sessoes'
import { PADRAO, conferir } from './limites'
import { conversar } from './chat'
import { autorizacaoParaOperar, guardar } from './cofre'
import type { ConfigEstrategia } from '../../src/core/deriv/engine'

/**
 * O login da Deriv, feito pelo servidor.
 *
 * Substitui o token colado à mão — que foi como a gente tentou primeiro, e
 * que deu errado três vezes seguidas por motivos diferentes: token do tipo
 * errado, erro de digitação, e a área de transferência sendo sobrescrita no
 * meio do caminho. Nada disso é culpa de quem digita; é o processo que
 * estava errado.
 *
 * Aqui a pessoa abre uma página, clica em um botão, autoriza na tela da
 * própria Deriv e pronto. O token nasce dentro do servidor e nunca aparece
 * em tela nenhuma — que é exatamente o que a Deriv exigiu por escrito para
 * o MCP: "o token do cliente nunca deve passar pelo contexto do LLM".
 *
 * Segurança do fluxo (OAuth 2.0 + PKCE, como a doc da Deriv manda):
 *  - `code_verifier` aleatório por tentativa, nunca reaproveitado
 *  - `state` para impedir que alguém injete um retorno forjado
 *  - a troca do código por token acontece aqui no servidor, não no navegador
 */

const PORTA = Number(process.env.PORTA ?? 8080)
/**
 * O caminho secreto do MCP.
 *
 * Quem souber esta URL comanda os robos desta conta Deriv — entao ela e uma
 * senha, e mora num arquivo com permissao 600, nunca no repositorio. Isto e
 * suficiente para o dono testar; para clientes de verdade cada um vai ter a
 * propria autorizacao, e ai o segredo compartilhado sai de cena.
 */
const ARQ_SEGREDO = new URL('../.mcp-segredo', import.meta.url)
function segredoMcp(): string {
  if (existsSync(ARQ_SEGREDO)) return readFileSync(ARQ_SEGREDO, 'utf8').trim()
  const novo = base64url(randomBytes(24))
  writeFileSync(ARQ_SEGREDO, novo + '\n')
  chmodSync(ARQ_SEGREDO, 0o600)
  return novo
}
const RETORNO = process.env.RETORNO ?? 'https://198-211-96-238.nip.io/callback'
const DESTINO = new URL('../.env', import.meta.url)

const base64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Uma tentativa de login em andamento. Vive poucos minutos, na memória. */
interface Tentativa { verifier: string; criadaEm: number }
const tentativas = new Map<string, Tentativa>()

/** Descarta tentativas velhas: um `state` que sobra é superfície de ataque. */
function limpar() {
  const agora = Date.now()
  for (const [state, t] of tentativas) {
    if (agora - t.criadaEm > 10 * 60_000) tentativas.delete(state)
  }
}

function pagina(titulo: string, corpo: string, cor = '#0ea5e9'): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} · Teeds</title><style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;
background:#0b0f14;color:#e6edf3;font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.cartao{width:min(460px,100%);padding:36px;border:1px solid #1e2936;border-radius:18px;background:#111820;text-align:center}
h1{margin:0 0 6px;font-size:22px;letter-spacing:-.01em}
p{margin:0 0 22px;color:#8b9bb0;font-size:14px}
a.botao{display:block;padding:15px;border-radius:12px;background:${cor};color:#04121c;
font-weight:800;text-decoration:none;font-size:15px}
code{padding:2px 6px;border-radius:5px;background:#1a2330;color:#7dd3fc;font-size:12.5px}
.ok{color:#4ade80;font-size:44px;line-height:1;margin-bottom:10px}
.erro{color:#f87171;font-size:44px;line-height:1;margin-bottom:10px}
</style></head><body><div class="cartao">${corpo}</div></body></html>`
}

const SEGREDO = segredoMcp()

/**
 * Uma sessão é sua quando ela roda numa conta Deriv que está no seu login
 * da Teeds. Vale para as duas portas de entrada: a que o chat abriu e a
 * que o botão da tela abriu. Sem esta regra, bastaria chutar o número de
 * uma sessão para desligar o robô de outra pessoa.
 */
async function minhaSessao(userId: string, id: string) {
  const s = ver(id)
  if (!s) return null
  const minhas = await contasDoUsuario(userId)
  return minhas.includes(s.contaId) ? s : null
}

const servidor = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const responder = (status: number, html: string) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html)
  }

  // ------------------------------------------------------------- a porta
  if (url.pathname === '/') {
    limpar()
    const verifier = base64url(randomBytes(48))
    const challenge = base64url(createHash('sha256').update(verifier).digest())
    const state = base64url(randomBytes(16))
    tentativas.set(state, { verifier, criadaEm: Date.now() })

    const ida = new URL(DERIV.oauth.authorize)
    ida.searchParams.set('response_type', 'code')
    ida.searchParams.set('client_id', DERIV.appId)
    ida.searchParams.set('redirect_uri', RETORNO)
    ida.searchParams.set('scope', DERIV.scopes.join(' '))
    ida.searchParams.set('state', state)
    ida.searchParams.set('code_challenge', challenge)
    ida.searchParams.set('code_challenge_method', 'S256')

    return responder(200, pagina('Conectar', `
      <h1>Motor da Teeds</h1>
      <p>Autorize a sua conta Deriv para o servidor poder operar por você.<br>
      O acesso fica guardado aqui e nunca aparece em tela nenhuma.</p>
      <a class="botao" href="${ida.toString()}">Conectar Deriv</a>`))
  }

  // ---------------------------------------------------------- a volta
  if (url.pathname === '/callback') {
    const erro = url.searchParams.get('error')
    if (erro) {
      return responder(400, pagina('Recusado', `
        <div class="erro">✕</div><h1>A Deriv recusou</h1>
        <p><code>${erro}</code><br>${url.searchParams.get('error_description') ?? ''}</p>
        <a class="botao" href="/">Tentar de novo</a>`, '#f87171'))
    }

    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const tentativa = state ? tentativas.get(state) : undefined
    if (!code || !tentativa) {
      // sem `state` conhecido isto não veio do nosso botão: não se troca nada
      return responder(400, pagina('Inválido', `
        <div class="erro">✕</div><h1>Retorno não reconhecido</h1>
        <p>Este endereço não veio de uma tentativa de login recente.</p>
        <a class="botao" href="/">Começar de novo</a>`, '#f87171'))
    }
    tentativas.delete(state!)

    try {
      const corpo = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: DERIV.appId,
        code,
        redirect_uri: RETORNO,
        code_verifier: tentativa.verifier,
      })
      const troca = await fetch(DERIV.oauth.token, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: corpo.toString(),
      })
      const dados = await troca.json().catch(() => ({} as any))
      if (!troca.ok || !dados?.access_token) {
        const motivo = dados?.error_description || dados?.error || `HTTP ${troca.status}`
        throw new Error(String(motivo))
      }

      const linhas = [`DERIV_TOKEN=${dados.access_token}`]
      if (dados.refresh_token) linhas.push(`DERIV_REFRESH=${dados.refresh_token}`)
      if (dados.expires_in) linhas.push(`DERIV_EXPIRA_EM=${Date.now() + Number(dados.expires_in) * 1000}`)
      writeFileSync(DESTINO, linhas.join('\n') + '\n')
      chmodSync(DESTINO, 0o600)

      console.log(`[login] conta autorizada · token de ${String(dados.access_token).length} caracteres guardado`)
      return responder(200, pagina('Conectado', `
        <div class="ok">✓</div><h1>Conta conectada</h1>
        <p>O servidor já pode operar por você.<br>
        Pode fechar esta página — o robô é ligado pelo terminal.</p>`, '#4ade80'))
    } catch (e) {
      console.error(`[login] falhou: ${(e as Error).message}`)
      return responder(500, pagina('Falhou', `
        <div class="erro">✕</div><h1>Não consegui trocar o código</h1>
        <p><code>${(e as Error).message}</code></p>
        <a class="botao" href="/">Tentar de novo</a>`, '#f87171'))
    }
  }

  // ------------------------------------------------------- a tela da Teeds
  //
  // O botão "Ligar robô" da plataforma cai aqui. A diferença para o chat é
  // só quem aperta: o robô continua nascendo e morrendo dentro deste
  // servidor, com os mesmos freios e o mesmo espelho no banco. Antes, o
  // botão ligava um motor dentro do navegador — que morria junto com a aba
  // e não deixava rastro nenhum no histórico.
  //
  // Quem manda o pedido se identifica com o mesmo crachá que já usa para
  // falar com o banco. O servidor confere esse crachá com o Supabase e
  // depois confere se a conta Deriv pedida é mesmo daquela pessoa: um
  // crachá válido de alguém não pode ligar robô na conta de outro.
  if (url.pathname.startsWith('/api/')) {
    // O estado inteiro do motor a cada consulta seria um exagero: a tela
    // mostra as últimas operações, não as mil. Cortar aqui deixa a consulta
    // barata mesmo numa sessão de horas.
    // Tudo que a tela precisa para desenhar o painel ao vivo — inclusive
    // qual robô e com que ajustes, senão ela não sabe montar a régua do
    // stop nem dizer com quais dígitos aquele robô ganha.
    const resumo = (s: any) => ({
      id: s.id,
      roboId: s.roboId,
      roboNome: s.roboNome,
      contaId: s.contaId,
      demo: s.demo,
      moeda: s.moeda,
      origem: s.parametros?.origem ?? 'chat',
      config: montarConfig(s.parametros),
      erro: s.erro ?? null,
      estado: enxuto(s.estado),
    })
    const enxuto = (e: any) => !e ? e : ({
      ...e,
      historico: (e.historico ?? []).slice(0, 200),
      registros: (e.registros ?? []).slice(0, 60),
      curva: (e.curva ?? []).slice(-300),
      digitos: (e.digitos ?? []).slice(-60),
    })
    const origem = req.headers.origin ?? ''
    const liberadas = ['https://tiagodalri.github.io', 'http://localhost:5173', 'http://127.0.0.1:5173']
    const cabecalhos: Record<string, string> = {
      'content-type': 'application/json; charset=utf-8',
      vary: 'Origin',
    }
    if (liberadas.includes(origem)) {
      cabecalhos['access-control-allow-origin'] = origem
      cabecalhos['access-control-allow-headers'] = 'authorization, content-type'
      cabecalhos['access-control-allow-methods'] = 'GET, POST, OPTIONS'
      cabecalhos['access-control-max-age'] = '86400'
    }
    const json = (status: number, corpo: unknown) => {
      res.writeHead(status, cabecalhos)
      res.end(JSON.stringify(corpo))
    }

    if (req.method === 'OPTIONS') { res.writeHead(204, cabecalhos); return res.end() }

    const cracha = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
    const dono = cracha ? await usuarioDoToken(cracha) : null
    if (!dono) return json(401, { erro: 'Faça login na Teeds de novo — sua sessão expirou.' })

    let corpo: any = {}
    if (req.method === 'POST') {
      const pedacos: Buffer[] = []
      for await (const p of req) pedacos.push(p as Buffer)
      const cru = Buffer.concat(pedacos).toString('utf8')
      if (cru) { try { corpo = JSON.parse(cru) } catch { return json(400, { erro: 'Pedido malformado.' }) } }
    }

    try {
      // ---- ligar
      if (url.pathname === '/api/sessao' && req.method === 'POST') {
        const contaId = String(corpo.contaId ?? '').trim()
        if (!contaId) return json(400, { erro: 'Diga em qual conta o robô deve operar.' })

        const minhas = await contasDoUsuario(dono.id)
        if (!minhas.includes(contaId)) {
          return json(403, { erro: `A conta ${contaId} não está no seu login da Teeds.` })
        }

        const config = corpo.config as ConfigEstrategia | undefined
        const valorInicial = Number(config?.valorInicial ?? corpo.valorInicial ?? 0)
        const stopLoss = Number(config?.stopLoss ?? corpo.stopLoss ?? 0)
        const takeProfit = Number(config?.takeProfit ?? corpo.takeProfit ?? 0)

        // ---- as travas ----
        //
        // Elas moram aqui, e não na proposta que o chat monta, porque esta é
        // a porta por onde TUDO passa: o botao da tela, o cartao do chat e o
        // que vier depois. O cartao do chat tem campos editaveis de
        // proposito — se a trava vivesse la, ela seria um pedido educado
        // para o cliente nao digitar um numero maior antes de clicar.
        //
        // Efeito colateral desejado: o botao da tela Robos passa a ter
        // freio. Ate agora dava para digitar stop de 5000 numa conta de
        // 2000, e o servidor obedecia.
        // A autorizacao e a do proprio cliente, guardada no cofre quando ele
        // clicou em "Conectar Deriv" na plataforma. A do servidor entra so
        // quando o cofre esta vazio — nunca para encobrir defeito.
        const cofre = await autorizacaoParaOperar(dono.id, autorizacao)
        if (!cofre.ok) return json(403, { erro: cofre.motivo })
        const auth = cofre.sessao
        const conta = (await contas(auth)).find((c) => c.accountId === contaId)
        if (!conta) {
          return json(403, {
            erro: 'A Teeds nao tem autorizacao para operar nesta conta. ' +
              'Clique em Conectar Deriv na plataforma e autorize de novo.',
          })
        }

        const limites = { ...PADRAO, ...(await limitesDoCliente(dono.id) ?? {}) }
        const veredito = conferir({
          entrada: valorInicial, stopLoss, takeProfit,
          saldo: conta.balance, demo: conta.type === 'demo', moeda: conta.currency,
          robosAtivos: todas().filter((s) => minhas.includes(s.contaId) && s.estado?.rodando).length,
        }, limites)
        if (!veredito.ok) return json(422, { erro: veredito.motivo })

        const s = await iniciar(auth, {
          roboId: String(corpo.roboId ?? ''),
          contaId,
          valorInicial, stopLoss, takeProfit,
          config,
          origem: 'navegador',
        })
        return json(200, resumo(s))
      }

      // ---- guardar a autorizacao da Deriv
      //
      // O cliente ja autorizou a Teeds na pagina oficial da Deriv; o que
      // chega aqui e o resultado disso, que ate agora vivia so no navegador
      // dele. O robo roda em Nova York com o navegador fechado, entao sem
      // esta rota ele nao teria como operar na conta de ninguem.
      //
      // Nada volta na resposta. Uma rota que devolve a autorizacao que
      // acabou de receber e uma rota que vaza autorizacao.
      if (url.pathname === '/api/deriv' && req.method === 'POST') {
        const accessToken = String(corpo.accessToken ?? '').trim()
        if (!accessToken) return json(400, { erro: 'Autorizacao vazia.' })
        await guardar(dono.id, {
          accessToken,
          refreshToken: corpo.refreshToken ? String(corpo.refreshToken) : undefined,
          expiresAt: corpo.expiresAt ? Number(corpo.expiresAt) : undefined,
        })
        return json(200, { guardado: true })
      }

      // ---- conversar
      //
      // A chave da IA fica deste lado. O navegador manda a pergunta e recebe
      // texto — nunca a credencial, que nem chega a existir por la.
      if (url.pathname === '/api/chat' && req.method === 'POST') {
        const pergunta = String(corpo.pergunta ?? '').trim()
        if (!pergunta) return json(400, { erro: 'Escreva alguma coisa.' })
        if (pergunta.length > 2000) return json(400, { erro: 'Mensagem longa demais.' })
        const historico = Array.isArray(corpo.historico) ? corpo.historico.slice(-12) : []
        return json(200, await conversar({ id: dono.id }, historico, pergunta))
      }

      // ---- acompanhar
      const acompanhar = url.pathname.match(/^\/api\/sessao\/([a-f0-9]{6,32})$/)
      if (acompanhar && req.method === 'GET') {
        const s = await minhaSessao(dono.id, acompanhar[1])
        if (!s) return json(404, { erro: 'Sessão não encontrada.' })
        return json(200, resumo(s))
      }

      // ---- o que está no ar agora, tenha sido ligado por onde for
      //
      // É isto que faz o robô ligado pelo chat aparecer na tela com o mesmo
      // painel ao vivo do robô ligado no botão. Quem opera é o mesmo
      // servidor; não faria sentido a Teeds mostrar dois mundos diferentes
      // dependendo de onde a pessoa apertou.
      if (url.pathname === '/api/sessoes' && req.method === 'GET') {
        const minhas = await contasDoUsuario(dono.id)
        const lista = todas()
          .filter((s) => minhas.includes(s.contaId) && s.estado?.rodando)
          .map((s) => resumo(s))
        return json(200, { sessoes: lista })
      }

      // ---- desligar
      const desligar = url.pathname.match(/^\/api\/sessao\/([a-f0-9]{6,32})\/parar$/)
      if (desligar && req.method === 'POST') {
        const s = await minhaSessao(dono.id, desligar[1])
        if (!s) return json(404, { erro: 'Sessão não encontrada.' })
        parar(s.id)
        return json(200, resumo(s))
      }

      return json(404, { erro: 'Endereço desconhecido.' })
    } catch (e) {
      return json(400, { erro: (e as Error).message })
    }
  }

  // ------------------------------------------------------------- o MCP
  if (url.pathname === `/mcp/${SEGREDO}`) {
    if (req.method === 'GET') {
      // alguns clientes abrem um stream antes de falar; nao usamos
      res.writeHead(405, { 'content-type': 'text/plain' })
      return res.end('Use POST com JSON-RPC.')
    }
    if (req.method !== 'POST') {
      res.writeHead(405); return res.end()
    }
    const pedacos: Buffer[] = []
    for await (const p of req) pedacos.push(p as Buffer)
    let corpo: any
    try {
      corpo = JSON.parse(Buffer.concat(pedacos).toString('utf8'))
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' })
      return res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'JSON invalido' } }))
    }

    const lote = Array.isArray(corpo) ? corpo : [corpo]
    const saidas = (await Promise.all(lote.map(atender))).filter((r) => r !== null)
    if (!saidas.length) { res.writeHead(202); return res.end() }
    res.writeHead(200, { 'content-type': 'application/json' })
    return res.end(JSON.stringify(Array.isArray(corpo) ? saidas : saidas[0]))
  }

  responder(404, pagina('Nada aqui', '<h1>404</h1><p>Endereço desconhecido.</p><a class="botao" href="/">Ir para o login</a>'))
})

// Sessao que ficou "rodando" depois de um reinicio e tela mentindo para o
// cliente: o robo nao existe mais, mas a Teeds diz que sim.
void limparSessoesOrfas()

servidor.listen(PORTA, () => {
  const publico = RETORNO.replace(/\/callback$/, '')
  console.log(`\nServidor da Teeds no ar na porta ${PORTA}`)
  console.log(`Login:  ${publico}`)
  console.log(`MCP:    ${publico}/mcp/${SEGREDO}`)
  console.log(`Supabase: ${supabaseConfigurado() ? 'ligado — as sessoes aparecem na tela do cliente' : 'nao configurado (rode servidor/chave.sh)'}`)
  console.log(`\nO endereco do MCP e uma senha: quem tiver ele comanda os robos.\n`)
})
