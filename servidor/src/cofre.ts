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
 * O que o cofre tem para este cliente.
 *
 * São quatro respostas, não duas, e a diferença importa. Antes isto devolvia
 * a autorização ou `null`, e quem chamava caía no token do servidor em
 * qualquer caso de `null` — silenciosamente. Ou seja: uma autorização
 * corrompida virava um robô operando com a credencial de outra pessoa, sem
 * uma linha de aviso em lugar nenhum. Rede de segurança que esconde a falha
 * não é rede, é tapete.
 *
 *  - `ok`        tem, abriu, está válida
 *  - `sem-cofre` nunca conectou pela plataforma. Normal, e é o único caso em
 *                que faz sentido cair na autorização do servidor
 *  - `quebrado`  tem linha e não abriu. Defeito: o cliente reconecta
 *  - `vencido`   venceu e a renovação não deu certo: o cliente reconecta
 */
export type DoCofre =
  | { tipo: 'ok'; sessao: AuthSession }
  | { tipo: 'sem-cofre' }
  | { tipo: 'quebrado' }
  | { tipo: 'vencido' }

/** Um pedaço do identificador, o bastante para achar no log sem expor o cliente. */
const marca = (userId: string) => `${userId.slice(0, 8)}…`

export async function autorizacaoDoCliente(userId: string): Promise<DoCofre> {
  const linha = await lerSegredoDeriv(userId)
  if (!linha) return { tipo: 'sem-cofre' }

  let sessao: AuthSession
  try {
    sessao = JSON.parse(decifrar(linha.segredo)) as AuthSession
  } catch {
    console.warn(`[cofre] a autorizacao do cliente ${marca(userId)} nao abriu — ele precisa reconectar a Deriv.`)
    return { tipo: 'quebrado' }
  }
  if (!sessao.accessToken) {
    console.warn(`[cofre] a autorizacao do cliente ${marca(userId)} abriu vazia — ele precisa reconectar a Deriv.`)
    return { tipo: 'quebrado' }
  }

  if (sessao.expiresAt && Date.now() > sessao.expiresAt - FOLGA) {
    const nova = await renovar(userId, sessao)
    if (!nova) {
      console.warn(`[cofre] a autorizacao do cliente ${marca(userId)} venceu e nao deu para renovar.`)
      return { tipo: 'vencido' }
    }
    return { tipo: 'ok', sessao: nova }
  }
  return { tipo: 'ok', sessao }
}

/**
 * A autorização para operar por este cliente, ou o motivo em português.
 *
 * A autorização do próprio servidor entra só quando o cofre está vazio —
 * cliente que entrou antes disto existir, e o dono antes de reconectar uma
 * vez. Nunca entra para encobrir defeito: cofre quebrado ou vencido devolve
 * recusa, e o cliente resolve com um clique em Conectar Deriv.
 */
export async function autorizacaoParaOperar(
  userId: string, doServidor: () => AuthSession,
): Promise<{ ok: true; sessao: AuthSession } | { ok: false; motivo: string }> {
  const r = await autorizacaoDoCliente(userId)
  if (r.tipo === 'ok') return { ok: true, sessao: r.sessao }

  if (r.tipo === 'sem-cofre') {
    try {
      const rede = doServidor()
      console.log(`[cofre] cliente ${marca(userId)} sem autorizacao propria — usando a do servidor.`)
      return { ok: true, sessao: rede }
    } catch {
      return {
        ok: false,
        motivo: 'Conecte sua conta Deriv na plataforma para a Teeds poder operar por você.',
      }
    }
  }

  return {
    ok: false,
    motivo: r.tipo === 'vencido'
      ? 'Sua autorização da Deriv venceu. Clique em Conectar Deriv na plataforma para renovar.'
      : 'Não consegui usar sua autorização da Deriv. Clique em Conectar Deriv na plataforma para autorizar de novo.',
  }
}
