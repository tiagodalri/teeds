import { DERIV } from './config'
import { MARCA } from '../../marca'
import { SERVIDOR } from '../teeds/config'
import { duranteTroca } from '../trocaEmAndamento'

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
  /** A Deriv foi aberta numa janela à parte (ver `startLogin`). */
  janela?: boolean
  /** O app da Deriv deste login (27/10/2026: o do parceiro do cliente, ou o da marca). */
  appId?: string
}

/*
  TENTATIVAS SEM VOLTA (16/10/2026). Uma cliente da OMNI, no Chrome normal,
  entrava na Deriv e caía no painel dela, duas vezes seguidas; na janela
  anônima funcionou. A Deriv guarda a volta no fluxo de login dela, e quando
  a página de login demora (extensão, dados antigos da Deriv no navegador)
  ela recomeça um login sem a volta. Isso não se conserta daqui. O que se
  conserta: contar as tentativas, e na segunda que não volta, parar de mandar
  a pessoa para o mesmo círculo e dizer o caminho que funciona.
*/
const KEY_TENTATIVAS = `${MARCA.id}.tentativas-deriv`

function contarTentativa(): void {
  try {
    const t = JSON.parse(localStorage.getItem(KEY_TENTATIVAS) ?? 'null') as { n: number; em: number } | null
    const n = t && Date.now() - t.em < 30 * 60_000 ? t.n + 1 : 1
    localStorage.setItem(KEY_TENTATIVAS, JSON.stringify({ n, em: Date.now() }))
  } catch { /* sem contagem, o cartão fica no texto da primeira volta */ }
}

/** Quantas vezes seguidas a pessoa foi à Deriv e não voltou (0 = nenhum login pendente). */
export function voltasPerdidas(): number {
  if (!loginPendente()) return 0
  try {
    const t = JSON.parse(localStorage.getItem(KEY_TENTATIVAS) ?? 'null') as { n: number; em: number } | null
    return t && Date.now() - t.em < 30 * 60_000 ? t.n : 1
  } catch { return 1 }
}

function guardarPedido(p: PedidoDeLogin, conta = true): void {
  if (conta) contarTentativa()
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
  try { localStorage.removeItem(KEY_PEDIDO); localStorage.removeItem(KEY_TENTATIVAS) } catch { /* nada a fazer */ }
  try {
    sessionStorage.removeItem(KEY_VERIFIER)
    sessionStorage.removeItem(KEY_STATE)
  } catch { /* idem */ }
}

/** Há quanto tempo (ms) começou o login pendente; null se não há pedido. */
export function idadeDoPedido(): number | null {
  try {
    const bruto = localStorage.getItem(KEY_PEDIDO)
    if (!bruto) return null
    const p = JSON.parse(bruto) as PedidoDeLogin
    return typeof p?.criadoEm === 'number' ? Date.now() - p.criadoEm : null
  } catch { return null }
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

/*
  A DERIV NUMA JANELA À PARTE (16/10/2026).

  No primeiro login de uma conta, a Deriv passa por etapas obrigatórias dela
  (troca de senha forçada, termos novos, avisos de verificação) e, ao fim,
  manda a pessoa para o painel DELA, esquecendo a volta para a plataforma.
  Não há o que mudar do nosso lado nisso. O que muda: no computador, a Deriv
  abre numa janela própria e a plataforma fica aberta atrás. Deu certo, a
  janela avisa e fecha; a Deriv prendeu a pessoa, ela fecha a janela e a
  plataforma está ali, com "Concluir a ligação", que na segunda vez passa
  direto (a Deriv já reconhece a pessoa).

  O aviso vai por BroadcastChannel e pelo evento de storage, NÃO por
  window.opener: as páginas da Deriv mandam o cabeçalho
  Cross-Origin-Opener-Policy, que corta a ligação entre as duas janelas (e
  apaga o window.name). Por isso o pedido guarda `janela: true` — é assim
  que a janela de volta sabe que deve avisar e fechar.

  Celular e app instalado continuam na mesma aba: janela à parte no celular
  vira outra aba, e a pessoa se perde do mesmo jeito.
*/
const CANAL_LOGIN = `${MARCA.id}.deriv-login`

function abrirJanelaDeLogin(url: string): Window | null {
  try {
    if (emAppInstalado()) return null
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return null
    const w = 520, h = 760
    const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2))
    const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2))
    return window.open(url, `${MARCA.id}-deriv-login`, `popup=yes,width=${w},height=${h},left=${left},top=${top}`)
  } catch {
    return null
  }
}

/** Na janela da Deriv, quando a volta deu certo: avisa a plataforma e tenta fechar. */
function avisarQueConectou(): void {
  try {
    const canal = new BroadcastChannel(CANAL_LOGIN)
    canal.postMessage({ tipo: 'conectada' })
    canal.close()
  } catch { /* o evento de storage do token também avisa */ }
  // Só fecha se o navegador deixar; se não deixar, esta janela mostra a
  // plataforma já conectada, o que também serve.
  setTimeout(() => { try { window.close() } catch { /* fica aberta */ } }, 150)
}

/**
 * A plataforma ouve a janela da Deriv. Chama `aoConectar` quando outra janela
 * deste site concluiu o login (o token já está no localStorage).
 */
export function ouvirLoginDeOutraJanela(aoConectar: () => void): () => void {
  let canal: BroadcastChannel | null = null
  try {
    canal = new BroadcastChannel(CANAL_LOGIN)
    canal.onmessage = (e) => { if (e.data?.tipo === 'conectada') aoConectar() }
  } catch { canal = null }
  const aoMudar = (e: StorageEvent) => { if (e.key === KEY_TOKEN && e.newValue) aoConectar() }
  window.addEventListener('storage', aoMudar)
  return () => { canal?.close(); window.removeEventListener('storage', aoMudar) }
}

/**
 * Leva o usuario para a pagina oficial da Deriv para autorizar a Teeds.
 * Devolve 'janela' quando a Deriv abriu numa janela à parte e esta página
 * continua aqui; 'aba' quando esta própria aba foi para a Deriv.
 */
/*
  O APP DA DERIV DESTA CONEXÃO (27/10/2026, parceiros de divulgação). O
  cliente de um parceiro conecta pelo app DO PARCEIRO: o markup cai lá e a
  Deriv separa sozinha. A tela informa o app quando a pessoa entra na
  plataforma (o banco responde, ver teeds_meu_app_deriv); sem informação,
  vale o app da marca, como sempre.
*/
let appDaConexao: string | null = null
export const appDaConexaoAtual = (): string | null => appDaConexao
export function usarAppDaDeriv(appId: string | null): void { appDaConexao = appId && /^[A-Za-z0-9_-]{4,64}$/.test(appId) ? appId : null }

export async function startLogin(): Promise<'janela' | 'aba'> {
  /*
    A SEGUNDA VEZ VAI PELA MESMA ABA (16/10/2026, teste com a conta do
    Tiago). Quando a Deriv prende a pessoa no painel dela, ela já passou
    pelas etapas obrigatórias e ficou logada: o pedido seguinte volta na hora,
    sem mostrar tela nenhuma (conferido no Chrome dele). Abrir outra janela
    nesse momento só confunde; a própria aba vai e volta conectada.
  */
  const mesmaAba = voltasPerdidas() >= 1
  const verifier = randomString(64)
  const state = randomString(32)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appDaConexao ?? MARCA.appId,
    redirect_uri: MARCA.redirectUri,
    scope: DERIV.scopes.join(' '),
    state,
    code_challenge: await challengeFor(verifier),
    code_challenge_method: 'S256',
  })
  const url = `${DERIV.oauth.authorize}?${params.toString()}`
  // O pedido é guardado ANTES de abrir: a janela pode voltar muito rápido.
  const appId = appDaConexao ?? MARCA.appId
  guardarPedido({ verifier, state, criadoEm: Date.now(), janela: true, appId })
  if (!mesmaAba && abrirJanelaDeLogin(url)) return 'janela'
  guardarPedido({ verifier, state, criadoEm: Date.now(), appId }, false)
  window.location.assign(url)
  return 'aba'
}

/**
 * Trata o retorno da Deriv. Deve rodar uma vez, ao abrir a pagina.
 * Devolve a sessao quando o login acabou de acontecer, ou null.
 */
export function completeLogin(): Promise<AuthSession | null> {
  return duranteTroca(trocarCodigoDaDeriv)
}
async function trocarCodigoDaDeriv(): Promise<AuthSession | null> {
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
      client_id: pedido.appId ?? MARCA.appId,
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
    // só quando não é o da marca: o padrão continua sem o campo, como sempre foi
    ...(pedido.appId && pedido.appId !== MARCA.appId ? { appId: pedido.appId } : {}),
  }
  saveSession(session)
  if (pedido.janela) avisarQueConectou()
  return session
}

/*
  O APP INSTALADO NO IPHONE (07/10/2026).

  Tudo acima resolve a volta em outra aba do MESMO navegador. O app instalado
  na tela inicial do iPhone é outro caso: ele e o Safari têm armazenamentos
  separados. O app começa o login, o iOS abre a Deriv no Safari, o código
  volta para o Safari — e o app nunca fica sabendo.

  Então, quando o site roda instalado, a troca muda de lugar: o servidor gera
  o verificador, recebe o código no `/callback` dele e guarda o token no
  cofre da pessoa (ver `servidor/src/login-cliente.ts`). O app, ao voltar à
  frente, pergunta ao servidor com o próprio crachá da Teeds — que está no
  armazenamento do app, porque foi lá que a pessoa entrou.
*/

/** O site está rodando como app instalado (tela inicial), e não numa aba? */
export function emAppInstalado(): boolean {
  try {
    if (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches) return true
    return (navigator as unknown as { standalone?: boolean }).standalone === true
  } catch {
    return false
  }
}

/** A ida pelo servidor: ele guarda o verificador, nós guardamos só o `state`. */
export async function startLoginPeloServidor(tokenTeeds: string): Promise<void> {
  const res = await fetch(`${SERVIDOR.url}/api/deriv/iniciar`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${tokenTeeds}` },
    body: JSON.stringify({ marca: MARCA.id }),
  })
  const dados = await res.json().catch(() => ({}))
  if (!res.ok || !dados?.url) throw new Error(dados?.erro || `Não consegui começar o login (${res.status})`)
  const state = new URL(dados.url).searchParams.get('state') ?? ''
  // O pedido fica marcado como "do servidor": a tela sabe que há um login
  // pendente, e `completeLogin` nunca tenta trocar nada com ele.
  guardarPedido({ verifier: 'servidor', state, criadoEm: Date.now() })
  window.location.assign(dados.url)
}

/**
 * O token já chegou ao cofre? Chamado quando o app volta à frente com um
 * login pendente. Se chegou, vira a sessão desta visita e o pedido se encerra.
 */
export async function buscarSessaoDoServidor(tokenTeeds: string): Promise<AuthSession | null> {
  const res = await fetch(`${SERVIDOR.url}/api/deriv/sessao`, {
    headers: { authorization: `Bearer ${tokenTeeds}` },
  })
  const dados = await res.json().catch(() => ({}))
  const s = dados?.sessao
  if (!res.ok || !s?.accessToken) return null
  const sessao: AuthSession = {
    accessToken: String(s.accessToken),
    refreshToken: s.refreshToken ? String(s.refreshToken) : undefined,
    expiresAt: s.expiresAt ? Number(s.expiresAt) : undefined,
    ...(s.appId && String(s.appId) !== MARCA.appId ? { appId: String(s.appId) } : {}),
  }
  saveSession(sessao)
  esquecerPedido()
  return sessao
}

function cleanUrl() {
  window.history.replaceState(window.history.state, '', window.location.pathname)
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
