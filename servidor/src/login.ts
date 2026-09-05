import './ambiente'

import { createServer } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { writeFileSync, chmodSync } from 'node:fs'
import { DERIV } from '../../src/core/deriv/config'

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

  responder(404, pagina('Nada aqui', '<h1>404</h1><p>Endereço desconhecido.</p><a class="botao" href="/">Ir para o login</a>'))
})

servidor.listen(PORTA, () => {
  console.log(`\nLogin da Teeds no ar na porta ${PORTA}`)
  console.log(`Endereço de retorno registrado: ${RETORNO}`)
  console.log(`Abra o endereço no navegador e clique em Conectar Deriv.\n`)
})
