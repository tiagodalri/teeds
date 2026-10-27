/**
 * Entrar com Face ID / digital (27/10/2026, Tiago: "quero o face id").
 *
 * Chaves de acesso (WebAuthn): o aparelho guarda a chave e só a libera com a
 * biometria; a função `biometria` do Supabase confere a assinatura e devolve
 * a mesma sessão que o login com senha devolve. A chave fica presa ao domínio
 * da plataforma e, no iPhone, viaja pelo Chaves do iCloud para os outros
 * aparelhos Apple da pessoa.
 */
import { SUPABASE } from './config'
import { entrarComTokens, type SessaoTeeds } from './conta'
import { aparelhoLegivel } from './termos'
import { MARCA } from '../../marca'

const FUNCAO = `${SUPABASE.url}/functions/v1/biometria`
const CHAVE_LOCAL = `${MARCA.id}:biometria`

const ehIphone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const ehMac = () => /Macintosh/.test(navigator.userAgent) && !ehIphone()

/** Como chamar a biometria deste aparelho. */
export function nomeDaBiometria(): string {
  if (ehIphone()) return 'Face ID'
  if (ehMac()) return 'Touch ID'
  if (/Android/.test(navigator.userAgent)) return 'digital'
  return 'biometria'
}

/** Com artigo, para frases: "Face ID", "Touch ID", "a digital", "a biometria". */
export function rotuloDaBiometria(): string {
  const n = nomeDaBiometria()
  return n === 'digital' || n === 'biometria' ? `a ${n}` : n
}

/** O aparelho tem biometria que serve para entrar? */
export async function biometriaDisponivel(): Promise<boolean> {
  try {
    if (!MARCA.biometria || typeof window === 'undefined' || !window.PublicKeyCredential) return false
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch { return false }
}

/** Este aparelho já foi ligado à biometria (para mostrar o botão no login). */
export const biometriaLigadaAqui = () => { try { return localStorage.getItem(CHAVE_LOCAL) === '1' } catch { return false } }
const marcarAqui = (sim: boolean) => { try { if (sim) localStorage.setItem(CHAVE_LOCAL, '1'); else localStorage.removeItem(CHAVE_LOCAL) } catch { /* sem armazenamento */ } }

/* ---------------------------------------------- conversões (JSON <-> bytes) */
const deB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0)).buffer
const paraB64 = (b: ArrayBuffer | null | undefined) => b ? btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : undefined

async function chamar(corpo: Record<string, unknown>, token?: string): Promise<any> {
  const r = await fetch(FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE.anonKey, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ marca: MARCA.id, ...corpo }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro ?? 'Não deu certo agora. Tente de novo.')
  return j
}

/** O aparelho recusou ou a pessoa cancelou: mensagem que a pessoa entende. */
function traduzir(e: unknown): Error {
  const nome = (e as DOMException)?.name
  if (nome === 'NotAllowedError' || nome === 'AbortError') return new Error('A confirmação foi cancelada ou não reconheceu. Toque de novo para tentar.')
  if (nome === 'InvalidStateError') return new Error('Este aparelho já está ligado à sua conta.')
  if (nome === 'SecurityError') return new Error('A biometria só funciona no endereço oficial da plataforma.')
  return e instanceof Error ? e : new Error('Não deu certo agora. Tente de novo.')
}

/** Liga a biometria deste aparelho à conta (a pessoa já está dentro). */
export async function ativarBiometria(sessao: SessaoTeeds): Promise<void> {
  const { desafio, opcoes } = await chamar({ acao: 'opcoes-cadastro' }, sessao.token)
  let cred: PublicKeyCredential
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        ...opcoes,
        challenge: deB64(opcoes.challenge),
        user: { ...opcoes.user, id: deB64(opcoes.user.id) },
        excludeCredentials: (opcoes.excludeCredentials ?? []).map((c: { id: string; transports?: AuthenticatorTransport[] }) => ({ ...c, id: deB64(c.id) })),
      },
    }) as PublicKeyCredential
  } catch (e) { throw traduzir(e) }
  const r = cred.response as AuthenticatorAttestationResponse
  await chamar({
    acao: 'cadastrar', desafio, aparelho: aparelhoLegivel(navigator.userAgent),
    resposta: {
      id: cred.id, rawId: paraB64(cred.rawId), type: cred.type,
      response: { clientDataJSON: paraB64(r.clientDataJSON), attestationObject: paraB64(r.attestationObject), transports: r.getTransports?.() ?? [] },
      clientExtensionResults: cred.getClientExtensionResults(), authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    },
  }, sessao.token)
  marcarAqui(true)
}

/** Entra com a biometria. Devolve a sessão, como o login com senha. */
export async function entrarComBiometria(): Promise<SessaoTeeds> {
  const { desafio, opcoes } = await chamar({ acao: 'opcoes-entrada' })
  let cred: PublicKeyCredential
  try {
    cred = await navigator.credentials.get({
      publicKey: { ...opcoes, challenge: deB64(opcoes.challenge), allowCredentials: [] },
    }) as PublicKeyCredential
  } catch (e) { throw traduzir(e) }
  const r = cred.response as AuthenticatorAssertionResponse
  let d: any
  try {
    d = await chamar({
      acao: 'entrar', desafio,
      resposta: {
        id: cred.id, rawId: paraB64(cred.rawId), type: cred.type,
        response: { clientDataJSON: paraB64(r.clientDataJSON), authenticatorData: paraB64(r.authenticatorData), signature: paraB64(r.signature), userHandle: paraB64(r.userHandle) },
        clientExtensionResults: cred.getClientExtensionResults(), authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
      },
    })
  } catch (e) {
    // a chave foi tirada da conta: este aparelho para de oferecer o botão
    if (/não está mais ligado/.test((e as Error).message)) marcarAqui(false)
    throw e
  }
  marcarAqui(true)
  return entrarComTokens(d)
}

export interface AparelhoComBiometria { id: string; aparelho: string | null; criadaEm: string; usadaEm: string | null }

export async function aparelhosComBiometria(sessao: SessaoTeeds): Promise<AparelhoComBiometria[]> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/biometria_credenciais?marca=eq.${MARCA.id}&select=id,aparelho,criada_em,usada_em&order=criada_em.desc`, {
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
  })
  const l = r.ok ? await r.json() : []
  return l.map((x: any) => ({ id: x.id, aparelho: x.aparelho, criadaEm: x.criada_em, usadaEm: x.usada_em }))
}

export async function tirarBiometria(sessao: SessaoTeeds, id: string): Promise<void> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/biometria_credenciais?id=eq.${id}`, {
    method: 'DELETE', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
  })
  if (!r.ok) throw new Error('Não foi possível tirar este aparelho agora.')
}

/** Ao tirar todos os aparelhos, este também deixa de oferecer o botão. */
export const esquecerBiometriaAqui = () => marcarAqui(false)
