/**
 * Login na Deriv feito PELO SERVIDOR, para o app instalado no iPhone.
 *
 * O login normal acontece inteiro no navegador (PKCE, ver
 * `src/core/deriv/auth.ts`): o site manda a pessoa para a Deriv, a Deriv
 * devolve um código ao site, o site troca o código pelo token. Funciona
 * sempre que a ida e a volta acontecem no MESMO armazenamento.
 *
 * No iPhone, o app instalado na tela inicial e o Safari têm armazenamentos
 * separados. O app começa o login, o iOS abre a Deriv no Safari, a Deriv
 * devolve o código ao Safari — e o app nunca fica sabendo. A pessoa volta
 * para o app e ele continua pedindo para conectar (Tiago, 07/10/2026).
 *
 * Aqui a troca muda de lugar: o servidor gera o verificador, a Deriv devolve
 * o código AO SERVIDOR (o `/callback` que já existia para o login da casa),
 * o servidor troca pelo token e guarda no cofre da pessoa. Quando o app volta
 * à frente, ele pergunta ao servidor "já tem?" com o próprio crachá da Teeds
 * — e o crachá está no armazenamento do app, porque foi lá que a pessoa
 * entrou. O token atravessa a fronteira pelo servidor, não pelo navegador.
 *
 * Puro de propósito: quem chama injeta a troca HTTP e o cofre, e as provas
 * rodam sem rede. O `state` identifica o pedido; sem ele, nada é trocado.
 */
import { createHash, randomBytes } from 'node:crypto'
import { DERIV } from '../../src/core/deriv/config'
import { marcaPorId } from '../../src/marca/marcas'
import type { AuthSession } from '../../src/core/deriv/auth'

export interface PedidoDoCliente {
  verifier: string
  criadaEm: number
  userId: string
  marca: string
}

/** Quanto tempo um pedido vale. A Deriv leva segundos; 10 minutos é folga. */
export const VALIDADE_MS = 10 * 60_000

const base64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** A ida: o endereço de autorização da Deriv e o pedido a guardar sob o `state`. */
export function iniciarLoginDoCliente(userId: string, marca: string, retorno: string, agora = Date.now()) {
  const m = marcaPorId(marca)
  const verifier = base64url(randomBytes(48))
  const state = base64url(randomBytes(24))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const url = new URL(DERIV.oauth.authorize)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', m.appId)
  url.searchParams.set('redirect_uri', retorno)
  url.searchParams.set('scope', DERIV.scopes.join(' '))
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  const pedido: PedidoDoCliente = { verifier, criadaEm: agora, userId, marca: m.id }
  return { state, url: url.toString(), pedido }
}

export interface Trocador {
  (url: string, corpo: URLSearchParams): Promise<{ ok: boolean; status: number; json(): Promise<any> }>
}

/**
 * A volta: troca o código pelo token com o verificador do pedido e guarda no
 * cofre do dono do pedido. Devolve a sessão guardada.
 */
export async function concluirLoginDoCliente(
  pedido: PedidoDoCliente, code: string, retorno: string,
  trocar: Trocador, guardar: (userId: string, s: AuthSession, marca: string) => Promise<void>,
  agora = Date.now(),
): Promise<AuthSession> {
  if (agora - pedido.criadaEm > VALIDADE_MS) throw new Error('Pedido de login vencido. Comece de novo pelo app.')
  const m = marcaPorId(pedido.marca)
  const resposta = await trocar(DERIV.oauth.token, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: m.appId,
    code,
    redirect_uri: retorno,
    code_verifier: pedido.verifier,
  }))
  const dados = await resposta.json().catch(() => ({}))
  if (!resposta.ok || !dados?.access_token) {
    throw new Error(String(dados?.error_description || dados?.error || `HTTP ${resposta.status}`))
  }
  const sessao: AuthSession = {
    accessToken: String(dados.access_token),
    refreshToken: dados.refresh_token ? String(dados.refresh_token) : undefined,
    expiresAt: dados.expires_in ? agora + Number(dados.expires_in) * 1000 : undefined,
  }
  await guardar(pedido.userId, sessao, m.id)
  return sessao
}
