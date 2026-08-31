/**
 * Contas da Teeds.
 *
 * São **outro login**, separado do da Deriv. A pessoa entra na plataforma
 * com a conta Teeds; conectar a corretora é um segundo passo, necessário
 * só para operar de verdade.
 *
 * Usa a API REST de autenticação do Supabase direto com `fetch` — sem
 * biblioteca, como o resto da Teeds. A chave anônima é pública por
 * definição: ela só permite o que as regras do projeto permitirem.
 */

import { SUPABASE, autenticacaoConfigurada } from './config'

export interface Usuario {
  id: string
  email: string
  nome: string | null
  criadoEm: string
}

export interface SessaoTeeds {
  token: string
  refresh: string
  /** Epoch em milissegundos em que o token expira. */
  expiraEm: number
  usuario: Usuario
}

const CHAVE = 'teeds.conta'

/* ---------------------------------------------------------------- baixo nivel */

function url(caminho: string): string {
  return `${SUPABASE.url.replace(/\/$/, '')}/auth/v1${caminho}`
}

async function chamar(
  caminho: string,
  opcoes: { corpo?: unknown; token?: string; metodo?: string } = {},
): Promise<any> {
  if (!autenticacaoConfigurada()) {
    throw new Error('O login da Teeds ainda não foi configurado.')
  }
  const res = await fetch(url(caminho), {
    method: opcoes.metodo ?? (opcoes.corpo ? 'POST' : 'GET'),
    headers: {
      apikey: SUPABASE.anonKey,
      'Content-Type': 'application/json',
      ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
    },
    ...(opcoes.corpo ? { body: JSON.stringify(opcoes.corpo) } : {}),
  })

  const texto = await res.text()
  const dados = texto ? JSON.parse(texto) : {}
  if (!res.ok) throw new Error(traduzir(dados))
  return dados
}

/** Mensagens do Supabase em português, na voz da Teeds. */
function traduzir(dados: any): string {
  const bruto: string = dados?.error_description || dados?.msg || dados?.message || dados?.error || ''
  const m = bruto.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-mail ou senha não conferem.'
  if (m.includes('email not confirmed')) return 'Confirme o e-mail que enviamos antes de entrar.'
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'Já existe uma conta com este e-mail. Tente entrar.'
  }
  if (m.includes('password should be at least')) return 'A senha precisa de pelo menos 6 caracteres.'
  if (m.includes('unable to validate email') || m.includes('invalid email')) return 'Esse e-mail não parece válido.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Espere um minuto e tente de novo.'
  return bruto || 'Não consegui falar com o servidor da Teeds.'
}

function montarSessao(d: any): SessaoTeeds {
  const u = d.user ?? {}
  return {
    token: d.access_token,
    refresh: d.refresh_token,
    expiraEm: Date.now() + Number(d.expires_in ?? 3600) * 1000,
    usuario: {
      id: u.id,
      email: u.email ?? '',
      nome: u.user_metadata?.nome ?? null,
      criadoEm: u.created_at ?? '',
    },
  }
}

function guardar(s: SessaoTeeds | null) {
  try {
    if (s) localStorage.setItem(CHAVE, JSON.stringify(s))
    else localStorage.removeItem(CHAVE)
  } catch {
    /* sem armazenamento: a sessao vale so enquanto a aba estiver aberta */
  }
}

/* ---------------------------------------------------------------- publico */

/** Sessão guardada, se ainda existir. Não valida o token. */
export function sessaoGuardada(): SessaoTeeds | null {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return null
    const s = JSON.parse(bruto) as SessaoTeeds
    return s?.token && s?.usuario ? s : null
  } catch {
    return null
  }
}

/** Cria a conta. Se o projeto exigir confirmação, devolve `confirmar: true`. */
export async function cadastrar(
  email: string, senha: string, nome: string,
): Promise<{ sessao: SessaoTeeds | null; confirmar: boolean }> {
  const d = await chamar('/signup', {
    corpo: { email: email.trim(), password: senha, data: { nome: nome.trim() } },
  })
  if (!d.access_token) return { sessao: null, confirmar: true }
  const s = montarSessao(d)
  guardar(s)
  return { sessao: s, confirmar: false }
}

export async function entrar(email: string, senha: string): Promise<SessaoTeeds> {
  const d = await chamar('/token?grant_type=password', {
    corpo: { email: email.trim(), password: senha },
  })
  const s = montarSessao(d)
  guardar(s)
  return s
}

/** Renova o token com o refresh guardado. */
export async function renovar(refresh: string): Promise<SessaoTeeds> {
  const d = await chamar('/token?grant_type=refresh_token', { corpo: { refresh_token: refresh } })
  const s = montarSessao(d)
  guardar(s)
  return s
}

export async function sair(token?: string): Promise<void> {
  try {
    if (token) await chamar('/logout', { corpo: {}, token })
  } catch {
    /* o servidor pode recusar um token ja vencido: sair localmente basta */
  }
  guardar(null)
}

/** Manda o e-mail de redefinição de senha. */
export async function recuperarSenha(email: string): Promise<void> {
  await chamar('/recover', {
    corpo: { email: email.trim() },
  })
}

/* ------------------------------------------------------------- retorno */

export interface Retorno {
  sessao: SessaoTeeds | null
  /** 'signup' = confirmou o e-mail · 'recovery' = veio redefinir a senha. */
  tipo: string | null
  erro: string | null
}

/**
 * Lê o que o Supabase devolve no endereço depois do e-mail.
 *
 * Os links de confirmação e de nova senha voltam para a Teeds com os
 * tokens no fragmento (`#access_token=...`). Sem ler isso aqui, a pessoa
 * clica no e-mail, chega na plataforma e continua vendo a tela de login.
 * O endereço é limpo em seguida para o token não ficar visível na barra.
 */
export function capturarRetorno(): Retorno {
  const bruto = window.location.hash.replace(/^#/, '')
  if (!bruto) return { sessao: null, tipo: null, erro: null }

  const p = new URLSearchParams(bruto)
  const token = p.get('access_token')
  const erroBruto = p.get('error_description') || p.get('error')
  if (!token && !erroBruto) return { sessao: null, tipo: null, erro: null }

  limparEndereco()

  if (!token) {
    const m = (erroBruto || '').toLowerCase()
    return {
      sessao: null,
      tipo: p.get('type'),
      erro: m.includes('expired')
        ? 'Esse link já expirou. Peça um novo.'
        : (erroBruto || 'O link não funcionou.'),
    }
  }

  const sessao: SessaoTeeds = {
    token,
    refresh: p.get('refresh_token') ?? '',
    expiraEm: Date.now() + Number(p.get('expires_in') ?? 3600) * 1000,
    usuario: { id: '', email: '', nome: null, criadoEm: '' },
  }
  guardar(sessao)
  return { sessao, tipo: p.get('type'), erro: null }
}

function limparEndereco() {
  try {
    window.history.replaceState(null, '', window.location.pathname + window.location.search)
  } catch {
    /* navegador sem history: o token some no proximo carregamento */
  }
}

/** Busca os dados do usuario a partir do token — usado depois do retorno. */
export async function buscarUsuario(token: string): Promise<Usuario> {
  const u = await chamar('/user', { token })
  return {
    id: u.id,
    email: u.email ?? '',
    nome: u.user_metadata?.nome ?? null,
    criadoEm: u.created_at ?? '',
  }
}

/** Troca a senha da conta logada. */
export async function trocarSenha(token: string, nova: string): Promise<void> {
  await chamar('/user', { corpo: { password: nova }, token, metodo: 'PUT' })
}
