import { DERIV } from './config'
import { MARCA } from '../../marca'

/**
 * Login da Teeds - OAuth 2.0 com PKCE, inteiramente no navegador.
 *
 * PKCE existe justamente para aplicacoes sem servidor: em vez de um segredo
 * fixo, cada login gera um par verificador/desafio de uso unico. Sem segredo
 * embutido, nao ha o que vazar no codigo publico.
 */

/*
  As chaves carregam a marca.

  Duas marcas no mesmo endereço são o mesmo site para o navegador. Sem o
  carimbo, entrar na Teeds logaria na OMNI com o token da app errada — e o
  markup de cada operação iria para a marca errada, em silêncio.
*/
const KEY_VERIFIER = `${MARCA.id}.pkce.verifier`
const KEY_STATE = `${MARCA.id}.pkce.state`
const KEY_TOKEN = `${MARCA.id}.auth`
/* O pedido de login em curso, em `localStorage`. Ver `guardarPedido`. */
const KEY_PEDIDO = `${MARCA.id}.pkce`

/*
  O LOGIN NÃO PODE DEPENDER DA ABA (07/10/2026).

  No celular o login na Deriv não voltava para a plataforma: a pessoa entrava
  na corretora, ficava lá, e ao abrir a plataforma de novo era convidada a
  entrar outra vez — em círculo.

  A ida é um `location.assign` para `auth.deriv.com`, que redireciona para
  `home.deriv.com/dashboard/login?flow=…`. E a Deriv guarda o endereço de
  volta no `sessionStorage` DAQUELA ABA (medido em 07/10/2026):

      kratos_oauth2_request_url_return_to  → a nossa URL de autorização
      oauth2_login_challenge_carryover     → o desafio do login

  `sessionStorage` é por aba. Se o login termina em outra aba — e no celular
  isso é rotina: o app instalado abre a corretora no navegador do sistema, a
  folha de navegação interna é outro contexto, o sistema descarta a aba de
  fundo, um "entrar com o Google" desvia por mais um contexto — a Deriv não
  tem para onde voltar e deixa a pessoa no painel dela. Isso é da Deriv e não
  está na nossa mão.

  O QUE ESTÁ: a nossa metade tinha o mesmo defeito. Verificador e `state`
  moravam em `sessionStorage`, então mesmo quando a volta chegava certa, numa
  aba nova, `completeLogin` morria em "Sessão de login perdida" — e o círculo
  se fechava por nossa causa, não pela da Deriv.

  Em `localStorage` o pedido atravessa qualquer aba do mesmo navegador e
  sobrevive ao navegador ser fechado. Não enfraquece o PKCE: o verificador é
  de uso único, vale 15 minutos, é apagado assim que serve, e o `redirect_uri`
  continua preso à app registrada na Deriv.
*/
const VALIDADE_DO_PEDIDO = 15 * 60_000

interface PedidoDeLogin {
  verifier: string
  state: string
  criadoEm: number
}

function guardarPedido(p: PedidoDeLogin): void {
  try {
    localStorage.setItem(KEY_PEDIDO, JSON.stringify(p))
  } catch {
    /* Navegação privada pode recusar a escrita. O `sessionStorage` abaixo
       ainda cobre o caso mais comum, que é voltar na mesma aba. */
  }
  try {
    // Espelho na aba: um login começado aqui continua funcionando mesmo se o
    // `localStorage` estiver bloqueado.
    sessionStorage.setItem(KEY_VERIFIER, p.verifier)
    sessionStorage.setItem(KEY_STATE, p.state)
  } catch { /* sem os dois, `completeLogin` recusa com a mensagem certa */ }
}

/**
 * O pedido que corresponde a ESTE retorno.
 *
 * O `state` é o que identifica o pedido, não a ordem de gravação: duas abas
 * pedindo login deixam só a última no `localStorage`, e a volta da primeira
 * encontraria o pedido da outra. Por isso procuramos pelo `state` que a Deriv
 * devolveu, e o espelho da aba é a segunda chance.
 */
function lerPedido(state: string | null): PedidoDeLogin | null {
  const candidatos: PedidoDeLogin[] = []
  try {
    const bruto = localStorage.getItem(KEY_PEDIDO)
    if (bruto) {
      const p = JSON.parse(bruto) as PedidoDeLogin
      if (p?.verifier && p?.state && Date.now() - p.criadoEm < VALIDADE_DO_PEDIDO) candidatos.push(p)
      // Vencido é pior que ausente: apaga para não tentar com ele de novo.
      else localStorage.removeItem(KEY_PEDIDO)
    }
  } catch { /* ilegível: cai no espelho da aba */ }
  try {
    // Espelho da aba — e a ponte para quem começou o login no build anterior,
    // que só escrevia aqui.
    const verifier = sessionStorage.getItem(KEY_VERIFIER)
    const daAba = sessionStorage.getItem(KEY_STATE)
    if (verifier && daAba) candidatos.push({ verifier, state: daAba, criadoEm: Date.now() })
  } catch { /* nem a aba: não há pedido */ }

  return candidatos.find((p) => p.state === state) ?? null
}

function esquecerPedido(): void {
  try { localStorage.removeItem(KEY_PEDIDO) } catch { /* nada a fazer */ }
  try {
    sessionStorage.removeItem(KEY_VERIFIER)
    sessionStorage.removeItem(KEY_STATE)
  } catch { /* idem */ }
}

/**
 * Existe um login na Deriv começado e não concluído?
 *
 * A tela usa isto para dizer o que aconteceu em vez de oferecer "Conectar"
 * outra vez, como se nada tivesse acontecido — era o que fazia a pessoa
 * repetir o mesmo passo sem entender por quê.
 */
export function loginPendente(): boolean {
  try {
    const bruto = localStorage.getItem(KEY_PEDIDO)
    if (!bruto) return false
    const p = JSON.parse(bruto) as PedidoDeLogin
    return !!p?.verifier && Date.now() - p.criadoEm < VALIDADE_DO_PEDIDO
  } catch {
    return false
  }
}

export interface AuthSession {
  accessToken: string
  refreshToken?: string
  expiresAt?: number
  /**
   * A app da Deriv que emitiu esta autorização — e que recebe o markup.
   *
   * No navegador é sempre a da marca do build, e por isso pode faltar. No
   * servidor NÃO pode: lá roda robô de qualquer marca, e sem este campo
   * toda operação cairia na app padrão. O markup de um cliente OMNI seria
   * creditado na Teeds, em silêncio, e ninguém descobriria olhando a tela.
   */
  appId?: string
}

// ---------------------------------------------------------------- PKCE

function base64Url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(length = 64): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (b) => ('0' + b.toString(16)).slice(-2)).join('').slice(0, length)
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64Url(digest)
}

// ---------------------------------------------------------------- entrada

/** Leva o usuario para a pagina oficial da Deriv para autorizar a Teeds. */
export async function startLogin(): Promise<void> {
  const verifier = randomString(64)
  const state = randomString(32)
  guardarPedido({ verifier, state, criadoEm: Date.now() })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: MARCA.appId,
    redirect_uri: MARCA.redirectUri,
    scope: DERIV.scopes.join(' '),
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  })
  window.location.assign(`${DERIV.oauth.authorize}?${params.toString()}`)
}

/**
 * Trata o retorno da Deriv. Deve rodar uma vez, ao abrir a pagina.
 * Devolve a sessao quando o login acabou de acontecer, ou null.
 */
export async function completeLogin(): Promise<AuthSession | null> {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    cleanUrl()
    throw new Error(url.searchParams.get('error_description') || error)
  }
  if (!code) return null

  const pedido = lerPedido(state)
  cleanUrl()

  /*
    Sem pedido que case com este `state`, as duas leituras possíveis são
    "perdemos o pedido" e "este retorno não é nosso", e não há como separá-las
    daqui. A mensagem trata da primeira, que é a que acontece de verdade, e
    diz o passo seguinte — o PKCE continua protegendo contra a segunda, porque
    sem o verificador a troca pelo token não acontece.
  */
  if (!pedido) {
    throw new Error(
      'Sessão de login perdida no caminho de volta. Toque em Conectar para concluir — '
      + 'a Deriv já reconhece você e não vai pedir a senha de novo.',
    )
  }
  const verifier = pedido.verifier

  const res = await fetch(DERIV.oauth.token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: MARCA.appId,
      code,
      redirect_uri: MARCA.redirectUri,
      code_verifier: verifier,
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `Falha ao concluir login (${res.status})`)
  }

  esquecerPedido()

  const session: AuthSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? Date.now() + Number(data.expires_in) * 1000 : undefined,
  }
  saveSession(session)
  return session
}

function cleanUrl() {
  window.history.replaceState({}, '', window.location.pathname)
}

// ---------------------------------------------------------------- sessao

/**
 * Guarda a autorização para a próxima visita.
 *
 * Se o armazenamento recusar a escrita — navegação privada, site com dados
 * bloqueados — a sessão continua valendo nesta visita: ela é devolvida a quem
 * chamou e vive na memória da tela. Deixar o erro subir aqui era pior do que
 * não guardar: o token já tinha sido emitido pela Deriv, e o login terminava
 * em tela de erro com a conta de fato autorizada.
 */
export function saveSession(s: AuthSession): void {
  try {
    localStorage.setItem(KEY_TOKEN, JSON.stringify(s))
  } catch {
    /* Esta visita funciona; a próxima vai pedir para conectar outra vez. */
  }
}

export function loadSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(KEY_TOKEN)
    if (!raw) return null
    const s = JSON.parse(raw) as AuthSession
    if (!s.accessToken) return null
    if (s.expiresAt && Date.now() > s.expiresAt) {
      logout()
      return null
    }
    return s
  } catch {
    return null
  }
}

export function logout(): void {
  try { localStorage.removeItem(KEY_TOKEN) } catch { /* nada guardado, nada a apagar */ }
  esquecerPedido()
}
