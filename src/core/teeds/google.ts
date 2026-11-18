/**
 * Entrar com Google (17/11/2026).
 *
 * O botão é nosso (o mesmo visual do login); ao tocar, o Google abre a
 * janelinha dele (Google Identity Services, cliente de token) e devolve um
 * token de acesso. A função `google` do Supabase confere com o Google que o
 * token é do nosso cliente e que o e-mail está verificado, acha a conta
 * desta marca (com a etiqueta +marca-) e devolve a mesma sessão que o login
 * com senha devolve. Quem ainda não tem conta é levado ao cadastro.
 */
import { SUPABASE } from './config'
import { entrarComTokens, type SessaoTeeds } from './conta'
import { MARCA } from '../../marca'

const SCRIPT = 'https://accounts.google.com/gsi/client'
const FUNCAO = `${SUPABASE.url}/functions/v1/google`

/** Erro de quem entrou com um Google que ainda não tem conta nesta marca. */
export class SemContaNoGoogle extends Error {
  constructor(mensagem: string, readonly email: string, readonly nome: string) { super(mensagem) }
}

export const googleDisponivel = () => !!MARCA.googleClientId

let carregando: Promise<void> | null = null
/** Baixa o script do Google uma vez só (deixe chamar cedo, ao abrir a tela). */
export function prepararGoogle(): Promise<void> {
  if (!googleDisponivel() || typeof window === 'undefined') return Promise.resolve()
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve()
  if (!carregando) {
    carregando = new Promise<void>((ok, erro) => {
      const s = document.createElement('script')
      s.src = SCRIPT; s.async = true
      s.onload = () => ok()
      s.onerror = () => { carregando = null; erro(new Error('Não conseguimos falar com o Google agora. Confira a internet e tente de novo.')) }
      document.head.appendChild(s)
    })
  }
  return carregando
}

/** Abre a janelinha do Google e devolve o token de acesso. */
function pedirTokenAoGoogle(): Promise<string> {
  return new Promise((ok, erro) => {
    const g = (window as any).google
    const cliente = g.accounts.oauth2.initTokenClient({
      client_id: MARCA.googleClientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (r: any) => {
        if (r?.access_token) ok(r.access_token)
        else erro(new Error('O Google não confirmou. Tente de novo.'))
      },
      error_callback: (e: any) => {
        erro(new Error(e?.type === 'popup_failed_to_open'
          ? 'O navegador bloqueou a janela do Google. Libere as janelas deste site e tente de novo.'
          : 'A entrada com o Google foi cancelada.'))
      },
    })
    cliente.requestAccessToken()
  })
}

/** Entra com o Google. Devolve a sessão, como o login com senha. */
export async function entrarComGoogle(): Promise<SessaoTeeds> {
  await prepararGoogle()
  const token = await pedirTokenAoGoogle()
  const r = await fetch(FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE.anonKey },
    body: JSON.stringify({ marca: MARCA.id, token }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (j.semConta) throw new SemContaNoGoogle(j.erro, j.email ?? '', j.nome ?? '')
    throw new Error(j.erro ?? 'Não deu certo agora. Tente de novo.')
  }
  return entrarComTokens(j)
}
