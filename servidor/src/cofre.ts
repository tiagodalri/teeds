import './ambiente'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { DERIV } from '../../src/core/deriv/config'
import { guardarSegredoDeriv, lerSegredoDeriv } from './supabase'
import type { AuthSession } from '../../src/core/deriv/auth'

/**
 * O cofre das autorizações da Deriv.
 *
 * O cliente autoriza a Teeds uma vez, na página oficial da Deriv, e a partir
 * daí a plataforma pode negociar na conta dele. Isso já acontecia — só que a
 * autorização ficava guardada no navegador dele e mais lugar nenhum. Um robô
 * que roda em Nova York com o navegador fechado não alcança o navegador.
 *
 * Então ela passa a viver aqui também. E isso muda o peso da coisa: deixa de
 * ser um dado no computador de uma pessoa e vira uma credencial de negociar
 * dinheiro parada num banco de dados. Três regras vieram junto, e a última a
 * Deriv exigiu por escrito:
 *
 *   1. Cifrada. Quem enxergar a tabela não enxerga a autorização.
 *   2. Nunca sai daqui. Não volta em resposta de API, não entra em log.
 *   3. Nunca entra no contexto de um modelo de linguagem.
 *
 * A chave da cifra mora num arquivo com permissão 600, ao lado do .env, e é
 * criada sozinha na primeira vez — ninguém precisa configurar nada. Perder
 * esse arquivo não perde dinheiro nem conta: só obriga cada cliente a clicar
 * em "Conectar Deriv" de novo.
 */

const ARQ_CHAVE = new URL('../.chave-cofre', import.meta.url)

function chave(): Buffer {
  if (existsSync(ARQ_CHAVE)) return Buffer.from(readFileSync(ARQ_CHAVE, 'utf8').trim(), 'base64')
  const nova = randomBytes(32)
  writeFileSync(ARQ_CHAVE, nova.toString('base64') + '\n')
  chmodSync(ARQ_CHAVE, 0o600)
  console.log('[cofre] chave criada. Guarde uma copia de servidor/.chave-cofre — sem ela, todo cliente reconecta a Deriv.')
  return nova
}

/**
 * AES-256-GCM: além de esconder, o GCM detecta adulteração. Se alguém mexer
 * um byte na linha do banco, a leitura falha em vez de devolver lixo.
 * O vetor de inicialização é novo a cada gravação e viaja junto — ele não é
 * segredo, só não pode se repetir.
 */
function cifrar(texto: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(), iv)
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString('base64')
}

function decifrar(guardado: string): string {
  const bruto = Buffer.from(guardado, 'base64')
  const d = createDecipheriv('aes-256-gcm', chave(), bruto.subarray(0, 12))
  d.setAuthTag(bruto.subarray(12, 28))
  return Buffer.concat([d.update(bruto.subarray(28)), d.final()]).toString('utf8')
}

/** Guarda (ou substitui) a autorização deste cliente. */
export async function guardar(userId: string, sessao: AuthSession): Promise<void> {
  if (!sessao.accessToken) throw new Error('Autorização vazia.')
  await guardarSegredoDeriv(
    userId,
    cifrar(JSON.stringify(sessao)),
    sessao.expiresAt ? new Date(sessao.expiresAt).toISOString() : null,
  )
}

/** Uma margem de folga: renovar já expirado é tarde demais. */
const FOLGA = 5 * 60_000

/**
 * Troca o refresh token por uma autorização nova.
 *
 * Sem isto, um robô que roda por horas morre no meio da sessão quando a
 * autorização vence — e o cliente descobre pelo resultado, não pelo aviso.
 */
async function renovar(userId: string, sessao: AuthSession): Promise<AuthSession | null> {
  if (!sessao.refreshToken) return null
  try {
    const res = await fetch(DERIV.oauth.token, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: DERIV.appId,
        refresh_token: sessao.refreshToken,
      }).toString(),
    })
    const dados = await res.json().catch(() => ({}))
    if (!res.ok || !dados?.access_token) return null
    const nova: AuthSession = {
      accessToken: dados.access_token,
      refreshToken: dados.refresh_token ?? sessao.refreshToken,
      expiresAt: dados.expires_in ? Date.now() + Number(dados.expires_in) * 1000 : undefined,
    }
    await guardar(userId, nova)
    console.log(`[cofre] autorizacao renovada para o cliente ${userId.slice(0, 8)}…`)
    return nova
  } catch {
    // Renovação que falha não derruba nada: quem chamou decide o que fazer
    // com a ausência, e o cliente sempre pode reconectar pela tela.
    return null
  }
}

/**
 * A autorização deste cliente, pronta para operar — ou nada.
 *
 * Nada significa "ele nunca conectou a Deriv, ou a autorização venceu e não
 * deu para renovar". Quem chama transforma isso numa frase para a tela.
 */
export async function autorizacaoDoCliente(userId: string): Promise<AuthSession | null> {
  const linha = await lerSegredoDeriv(userId)
  if (!linha) return null
  let sessao: AuthSession
  try {
    sessao = JSON.parse(decifrar(linha.segredo)) as AuthSession
  } catch {
    console.warn(`[cofre] nao consegui abrir a autorizacao do cliente ${userId.slice(0, 8)}… — ele precisa reconectar.`)
    return null
  }
  if (!sessao.accessToken) return null
  if (sessao.expiresAt && Date.now() > sessao.expiresAt - FOLGA) {
    return await renovar(userId, sessao)
  }
  return sessao
}
