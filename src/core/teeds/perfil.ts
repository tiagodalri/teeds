/**
 * "Meu Perfil" (20/10/2026): a ficha da pessoa nesta marca (clientes), com
 * endereço, foto, plano e validade do acesso; e o "tour visto".
 *
 * Quem pode o quê fica no banco: a pessoa edita a própria ficha (RLS), o
 * plano e a validade só o admin muda (teeds_proteger_plano) e o CPF, depois
 * de preenchido, só o suporte (teeds_proteger_cpf).
 */
import { SUPABASE } from './config'
import { ehImagem, reduzirImagem } from '../imagem'
import type { SessaoTeeds } from './conta'
import { PLANOS_CLIENTE } from './planos'
import { MARCA } from '../../marca'

export interface Endereco { cep: string; rua: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string }

export interface Perfil {
  nome: string
  cpf: string
  telefone: string
  email: string
  endereco: Endereco
  fotoUrl: string | null
  planoId: string
  planoNome: string
  status: string
  acessoInicio: string | null
  acessoExpira: string | null
  criadoEm: string | null
  tourVistoEm: string | null
}

const CAMPOS = 'nome,cpf,telefone,email,end_cep,end_rua,end_numero,end_complemento,end_bairro,end_cidade,end_uf,foto_url,plano_id,status_acesso,acesso_inicio,acesso_expira_em,criado_em,tour_visto_em'

async function rest<T>(caminho: string, sessao: SessaoTeeds, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, {
    ...init,
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) },
  })
  if (!r.ok) {
    const c = await r.json().catch(() => ({}))
    throw new Error(String(c?.message || `Não consegui salvar agora (${r.status}). Tente de novo.`))
  }
  return r.status === 204 ? (undefined as T) : ((await r.json().catch(() => undefined)) as T)
}

/** Grava na ficha e confere que ela existe: um PATCH que não acha a linha não dá erro, e a tela diria "salvo" sem salvar. */
async function gravarNaFicha(sessao: SessaoTeeds, campos: Record<string, unknown>): Promise<void> {
  const linhas = await rest<unknown[]>(minhaFicha(sessao), sessao, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(campos) })
  if (!Array.isArray(linhas) || !linhas.length) throw new Error('Não encontramos a sua ficha de cadastro nesta plataforma. Fale com o suporte para corrigirmos.')
}
const minhaFicha = (sessao: SessaoTeeds) => `/clientes?user_id=eq.${sessao.usuario.id}&marca=eq.${MARCA.id}`

export async function lerPerfil(sessao: SessaoTeeds): Promise<Perfil> {
  const [l] = await rest<any[]>(`${minhaFicha(sessao)}&select=${CAMPOS}&limit=1`, sessao)
  const v = (x: unknown) => (x === null || x === undefined ? '' : String(x))
  const planoId = v(l?.plano_id) || 'essencial'
  return {
    nome: v(l?.nome) || sessao.usuario.nome || '',
    cpf: v(l?.cpf) || sessao.usuario.cpf || '',
    telefone: v(l?.telefone) || sessao.usuario.telefone || '',
    email: v(l?.email) || sessao.usuario.email,
    endereco: { cep: v(l?.end_cep), rua: v(l?.end_rua), numero: v(l?.end_numero), complemento: v(l?.end_complemento), bairro: v(l?.end_bairro), cidade: v(l?.end_cidade), uf: v(l?.end_uf) },
    fotoUrl: l?.foto_url ?? null,
    planoId,
    planoNome: PLANOS_CLIENTE.find((p) => p.id === planoId)?.nome ?? planoId,
    status: v(l?.status_acesso) || 'ativo',
    acessoInicio: l?.acesso_inicio ?? null,
    acessoExpira: l?.acesso_expira_em ?? null,
    criadoEm: l?.criado_em ?? null,
    tourVistoEm: l?.tour_visto_em ?? null,
  }
}

/** Dados pessoais e endereço: na ficha e no cadastro do login (nome e telefone aparecem no menu). */
export async function salvarPerfil(sessao: SessaoTeeds, d: { nome: string; cpf: string; telefone: string; endereco: Endereco }): Promise<void> {
  const so = (s: string) => s.replace(/\D/g, '')
  await gravarNaFicha(sessao, {
    nome: d.nome.trim(), telefone: so(d.telefone), ...(d.cpf ? { cpf: so(d.cpf) } : {}),
    end_cep: so(d.endereco.cep) || null, end_rua: d.endereco.rua.trim() || null, end_numero: d.endereco.numero.trim() || null,
    end_complemento: d.endereco.complemento.trim() || null, end_bairro: d.endereco.bairro.trim() || null,
    end_cidade: d.endereco.cidade.trim() || null, end_uf: d.endereco.uf.trim().toUpperCase() || null,
  })
  await fetch(`${SUPABASE.url}/auth/v1/user`, {
    method: 'PUT', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: { nome: d.nome.trim(), telefone: so(d.telefone), ...(d.cpf ? { cpf: so(d.cpf) } : {}) } }),
  }).catch(() => undefined)
}

export async function enviarFoto(sessao: SessaoTeeds, arquivo: File): Promise<string> {
  // alguns navegadores entregam HEIC sem tipo: vale a extensão
  if (!ehImagem(arquivo)) throw new Error('Escolha uma imagem (JPG, PNG, WEBP ou a foto do iPhone).')
  // quadrada, 320 px: rápida no 4G e leve no banco
  const { blob, tipo, ext } = await reduzirImagem(arquivo, 320, true)
  const caminho = `${sessao.usuario.id}/perfil-${MARCA.id}.${ext}`
  const r = await fetch(`${SUPABASE.url}/storage/v1/object/avatares/${caminho}`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': tipo, 'x-upsert': 'true', 'Cache-Control': 'max-age=3600' },
    body: blob,
  })
  if (!r.ok) {
    const motivo = await r.text().catch(() => '')
    console.warn('[foto do perfil] o armazenamento recusou:', r.status, motivo)
    throw new Error(r.status === 413 ? 'A foto ficou grande demais. Tente outra.' : 'Não consegui enviar a foto agora. Tente de novo em instantes.')
  }
  const publica = `${SUPABASE.url}/storage/v1/object/public/avatares/${caminho}?v=${Date.now()}`
  await gravarNaFicha(sessao, { foto_url: publica })
  return publica
}

export async function removerFoto(sessao: SessaoTeeds): Promise<void> {
  // a foto pode ter ido como webp ou jpg (conforme o navegador): apaga as duas
  await fetch(`${SUPABASE.url}/storage/v1/object/avatares`, {
    method: 'DELETE', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: ['webp', 'jpg'].map((e) => `${sessao.usuario.id}/perfil-${MARCA.id}.${e}`) }),
  }).catch(() => undefined)
  await gravarNaFicha(sessao, { foto_url: null })
}

/** O tour obrigatório terminou (vale para esta conta, em qualquer aparelho). */
export async function marcarTourVisto(sessao: SessaoTeeds): Promise<void> {
  await gravarNaFicha(sessao, { tour_visto_em: new Date().toISOString() })
}

/** Endereço pelo CEP (ViaCEP: grátis, sem cadastro). */
export async function buscarCep(cep: string): Promise<Partial<Endereco> | null> {
  const so = cep.replace(/\D/g, '')
  if (so.length !== 8) return null
  try {
    // AbortSignal.timeout não existe no iOS 15: o tempo limite vai à mão
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000)
    const r = await fetch(`https://viacep.com.br/ws/${so}/json/`, { signal: ctl.signal }).finally(() => clearTimeout(t))
    const d = await r.json()
    if (!r.ok || d?.erro) return null
    return { rua: d.logradouro ?? '', bairro: d.bairro ?? '', cidade: d.localidade ?? '', uf: d.uf ?? '' }
  } catch { return null }
}

export const formatarCep = (v: string) => { const d = v.replace(/\D/g, '').slice(0, 8); return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d }
