/**
 * Suporte dentro da plataforma (20/10/2026): o chat do cliente e a caixa de
 * entrada da equipe. Só Supabase (REST + tempo real + storage), de graça.
 *
 * Quem pode o quê mora no banco (supabase/migracoes/20261021010000_teeds_suporte.sql):
 * o cliente lê e escreve só nas conversas dele, não vê notas internas e não
 * mexe em etiqueta, prioridade nem responsável; as etiquetas automáticas, a
 * prioridade, os contadores e a 1ª resposta automática saem de um gatilho.
 */
import { SERVIDOR, SUPABASE } from './config'
import { ehImagem, reduzirImagem } from '../imagem'
import type { SessaoTeeds } from './conta'
import { vitrine } from './parceiro'
import { MARCA } from '../../marca'
import type { ResumoDaTriagem } from './triagem'
import { dataCurta } from '../datas'

export type StatusDaConversa = 'aberta' | 'respondida' | 'resolvida'
export type Prioridade = 'baixa' | 'normal' | 'alta' | 'urgente'

export interface Conversa {
  id: string
  marca: string
  userId: string
  status: StatusDaConversa
  prioridade: Prioridade
  etiquetas: string[]
  assunto: string | null
  responsavel: string | null
  responsavelNome: string | null
  origem: string | null
  contexto: Record<string, unknown>
  criadaEm: string
  atualizadaEm: string
  ultimaMensagem: string | null
  ultimaDe: 'cliente' | 'equipe' | null
  ultimaEm: string | null
  aguardandoDesde: string | null
  primeiraRespostaEm: string | null
  resolvidaEm: string | null
  naoLidasCliente: number
  naoLidasEquipe: number
  avaliacao: number | null
  avaliacaoComentario: string | null
  /** Organização da equipe (o cliente não vê): fixada no topo da fila, arquivada fora dela. */
  fixadaEm: string | null
  arquivadaEm: string | null
}

export interface Mensagem {
  id: string
  conversaId: string
  autor: 'cliente' | 'equipe' | 'sistema'
  autorId: string | null
  autorNome: string | null
  texto: string
  anexo: string | null
  interna: boolean
  criadaEm: string
  /** Só na tela: ainda indo para o banco. */
  enviando?: boolean
  falhou?: boolean
}

export interface RespostaPronta { id: string; titulo: string; texto: string; ordem: number }

/** As etiquetas que o banco põe sozinho, com o nome que a equipe lê. */
export const ETIQUETAS: Record<string, string> = {
  deposito: 'Depósito', saque: 'Saque', 'conta-deriv': 'Conta Deriv', acesso: 'Acesso', ia: 'I.A.', operacao: 'Operação',
  plano: 'Plano', aulas: 'Aulas', treino: 'Sala de treino', app: 'App', erro: 'Erro', cadastro: 'Cadastro', atencao: 'Atenção',
}
export const PRIORIDADES: Record<Prioridade, string> = { urgente: 'Urgente', alta: 'Alta', normal: 'Normal', baixa: 'Baixa' }
export const STATUS: Record<StatusDaConversa, string> = { aberta: 'Aguardando equipe', respondida: 'Aguardando cliente', resolvida: 'Resolvida' }

const cabecalho = (sessao: SessaoTeeds, extra: Record<string, string> = {}) => ({
  apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json', ...extra,
})

async function rest<T>(sessao: SessaoTeeds, caminho: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, { ...init, headers: cabecalho(sessao, init.headers as Record<string, string>) })
  if (!r.ok) {
    const c = await r.json().catch(() => ({}))
    throw new Error(String(c?.message || `Não consegui falar com o suporte agora (${r.status}). Tente de novo.`))
  }
  if (r.status === 204) return undefined as T
  const texto = await r.text()
  return (texto ? JSON.parse(texto) : undefined) as T
}

export const paraConversa = (l: any): Conversa => ({
  id: l.id, marca: l.marca, userId: l.user_id, status: l.status, prioridade: l.prioridade, etiquetas: l.etiquetas ?? [],
  assunto: l.assunto, responsavel: l.responsavel, responsavelNome: l.responsavel_nome, origem: l.origem, contexto: l.contexto ?? {},
  criadaEm: l.criada_em, atualizadaEm: l.atualizada_em, ultimaMensagem: l.ultima_mensagem, ultimaDe: l.ultima_de, ultimaEm: l.ultima_em,
  aguardandoDesde: l.aguardando_desde, primeiraRespostaEm: l.primeira_resposta_em, resolvidaEm: l.resolvida_em,
  naoLidasCliente: l.nao_lidas_cliente ?? 0, naoLidasEquipe: l.nao_lidas_equipe ?? 0, avaliacao: l.avaliacao, avaliacaoComentario: l.avaliacao_comentario,
  fixadaEm: l.fixada_em ?? null, arquivadaEm: l.arquivada_em ?? null,
})
export const paraMensagem = (l: any): Mensagem => ({
  id: l.id, conversaId: l.conversa_id, autor: l.autor, autorId: l.autor_id, autorNome: l.autor_nome, texto: l.texto ?? '',
  anexo: l.anexo, interna: !!l.interna, criadaEm: l.criada_em,
})

// ------------------------------------------------------------------ cliente

/** As conversas desta pessoa nesta marca, da mais nova para a mais antiga. */
export async function minhasConversas(sessao: SessaoTeeds): Promise<Conversa[]> {
  const l = await rest<any[]>(sessao, `/suporte_conversas?user_id=eq.${sessao.usuario.id}&marca=eq.${MARCA.id}&order=criada_em.desc&limit=30`)
  return l.map(paraConversa)
}

/** Só o necessário para o selo de não lidas (barato: roda com o chat fechado). */
export async function naoLidasDoCliente(sessao: SessaoTeeds): Promise<number> {
  const l = await rest<any[]>(sessao, `/suporte_conversas?user_id=eq.${sessao.usuario.id}&marca=eq.${MARCA.id}&nao_lidas_cliente=gt.0&select=nao_lidas_cliente`)
  return l.reduce((t, c) => t + (c.nao_lidas_cliente ?? 0), 0)
}

function contextoDoAparelho(tela: string) {
  const ua = navigator.userAgent
  const aparelho = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Outro'
  const app = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
  return { tela, aparelho, app, largura: window.innerWidth, navegador: /CriOS|Chrome/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : /Firefox/.test(ua) ? 'Firefox' : 'Outro' }
}

/** Abre um atendimento. A triagem (assunto e respostas) vai junto: o banco tira dela a etiqueta e a prioridade. */
export async function abrirConversa(sessao: SessaoTeeds, tela: string, triagem?: ResumoDaTriagem | null): Promise<Conversa> {
  const ultima = triagem?.respostas[triagem.respostas.length - 1]?.resposta
  const [l] = await rest<any[]>(sessao, '/suporte_conversas', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      user_id: sessao.usuario.id, marca: MARCA.id, origem: tela,
      // o endereço em que a conversa nasceu (/n, /v): é do parceiro daquela vitrine
      parceiro: vitrine(),
      assunto: triagem && triagem.tema !== 'outro' ? `${triagem.rotulo}${ultima ? ` · ${ultima}` : ''}` : null,
      contexto: { ...contextoDoAparelho(tela), ...(triagem ? { triagem } : {}) },
    }),
  })
  return paraConversa(l)
}

export async function lerMensagens(sessao: SessaoTeeds, conversaId: string): Promise<Mensagem[]> {
  const l = await rest<any[]>(sessao, `/suporte_mensagens?conversa_id=eq.${conversaId}&order=criada_em.asc&limit=500`)
  return l.map(paraMensagem)
}

export async function mandarMensagem(sessao: SessaoTeeds, conversaId: string, d: { texto: string; anexo?: string | null; autor: 'cliente' | 'equipe'; interna?: boolean; autorNome?: string }): Promise<Mensagem> {
  const [l] = await rest<any[]>(sessao, '/suporte_mensagens', {
    method: 'POST', headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ conversa_id: conversaId, marca: MARCA.id, autor: d.autor, autor_id: sessao.usuario.id, autor_nome: d.autorNome ?? null, texto: d.texto, anexo: d.anexo ?? null, interna: !!d.interna }),
  })
  return paraMensagem(l)
}

export async function atualizarConversa(sessao: SessaoTeeds, id: string, campos: Record<string, unknown>): Promise<void> {
  await rest(sessao, `/suporte_conversas?id=eq.${id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(campos) })
}

/**
 * Apaga a conversa para a equipe e para o cliente (as mensagens vão junto). O
 * banco guarda na auditoria quem apagou e quantas mensagens havia; os prints
 * saem do armazenamento logo depois (se falhar, ficam órfãos e sem acesso).
 */
export async function apagarConversa(sessao: SessaoTeeds, id: string): Promise<void> {
  const prints = await rest<string[] | null>(sessao, '/rpc/teeds_suporte_apagar_conversa', { method: 'POST', body: JSON.stringify({ p_id: id }) })
  if (prints?.length) {
    await fetch(`${SUPABASE.url}/storage/v1/object/suporte`, {
      method: 'DELETE', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: prints }),
    }).catch(() => undefined)
  }
}

export async function statusDoSuporte(sessao: SessaoTeeds): Promise<{ online: boolean; minutos: number | null }> {
  try {
    const d = await rest<{ online: boolean; minutos: number | null }>(sessao, '/rpc/teeds_suporte_status', { method: 'POST', body: JSON.stringify({ p_marca: MARCA.id }) })
    return { online: !!d?.online, minutos: d?.minutos ?? null }
  } catch { return { online: false, minutos: null } }
}

// ------------------------------------------------------------------ anexos (prints)

/** Reduz o print no aparelho (até 1600 px; WEBP ou JPEG, conforme o navegador) e sobe para a pasta da conversa. */
export async function enviarAnexo(sessao: SessaoTeeds, conversa: Conversa, arquivo: File): Promise<string> {
  if (!ehImagem(arquivo)) throw new Error('Mande uma imagem (print da tela, JPG ou PNG).')
  const { blob, tipo, ext } = await reduzirImagem(arquivo, 1600, false, 0.85)
  const caminho = `${conversa.marca}/${conversa.id}/${crypto.randomUUID()}.${ext}`
  const r = await fetch(`${SUPABASE.url}/storage/v1/object/suporte/${caminho}`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': tipo }, body: blob,
  })
  if (!r.ok) throw new Error(r.status === 413 ? 'A imagem ficou grande demais. Mande um print da tela.' : 'Não consegui enviar a imagem agora. Tente de novo.')
  return caminho
}

const anexosAbertos = new Map<string, Promise<string>>()
/** O print é privado: baixa com o login de quem está vendo e vira um endereço local. */
export function abrirAnexo(sessao: SessaoTeeds, caminho: string): Promise<string> {
  let p = anexosAbertos.get(caminho)
  if (!p) {
    p = fetch(`${SUPABASE.url}/storage/v1/object/authenticated/suporte/${caminho}`, { headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` } })
      .then((r) => { if (!r.ok) throw new Error('anexo'); return r.blob() }).then((b) => URL.createObjectURL(b))
    p.catch(() => anexosAbertos.delete(caminho))
    anexosAbertos.set(caminho, p)
  }
  return p
}

// ------------------------------------------------------------------ equipe

export async function conversasDaMarca(sessao: SessaoTeeds, marca: string, comResolvidas: boolean): Promise<Conversa[]> {
  const filtro = comResolvidas ? `&or=(status.neq.resolvida,resolvida_em.gt.${new Date(Date.now() - 30 * 86_400_000).toISOString()})` : '&status=neq.resolvida'
  const l = await rest<any[]>(sessao, `/suporte_conversas?marca=eq.${marca}${filtro}&order=atualizada_em.desc&limit=300`)
  return l.map(paraConversa)
}

/** Quantas esperam a equipe agora (o selo do menu e do botão flutuante do admin). */
export async function aguardandoEquipe(sessao: SessaoTeeds, marca: string): Promise<number> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/suporte_conversas?marca=eq.${marca}&status=eq.aberta&select=id`, {
    method: 'HEAD', headers: { ...cabecalho(sessao), Prefer: 'count=exact' },
  })
  const total = Number(r.headers.get('content-range')?.split('/')[1])
  return Number.isFinite(total) ? total : 0
}

export interface FichaDoCliente {
  nome: string; email: string; telefone: string; cpf: string; planoId: string; status: string
  acessoExpira: string | null; criadoEm: string | null; vistoEm: string | null; fotoUrl: string | null; cidade: string | null; uf: string | null
}
export async function fichaDoCliente(sessao: SessaoTeeds, userId: string, marca: string): Promise<FichaDoCliente | null> {
  const [l] = await rest<any[]>(sessao, `/clientes?user_id=eq.${userId}&marca=eq.${marca}&select=nome,email,telefone,cpf,plano_id,status_acesso,acesso_expira_em,criado_em,visto_em,foto_url,end_cidade,end_uf,cidade,regiao&limit=1`)
  if (!l) return null
  return {
    nome: l.nome ?? '', email: l.email ?? '', telefone: l.telefone ?? '', cpf: l.cpf ?? '', planoId: l.plano_id ?? '', status: l.status_acesso ?? '',
    acessoExpira: l.acesso_expira_em, criadoEm: l.criado_em, vistoEm: l.visto_em, fotoUrl: l.foto_url, cidade: l.end_cidade || l.cidade, uf: l.end_uf || l.regiao,
  }
}

/** A troca do e-mail de acesso é do suporte (o cliente pede pelo chat). */
export async function trocarEmailPeloSuporte(sessao: SessaoTeeds, userId: string, marca: string, email: string): Promise<string> {
  const r = await fetch(`${SERVIDOR.url}/api/admin/trocar-email`, {
    method: 'POST', headers: { Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: userId, marca, email }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(d?.erro || 'Não consegui trocar o e-mail agora.')
  return d.email as string
}

/** As outras conversas desta pessoa (o histórico ao lado do atendimento). */
export async function historicoDoCliente(sessao: SessaoTeeds, userId: string, marca: string): Promise<Conversa[]> {
  const l = await rest<any[]>(sessao, `/suporte_conversas?user_id=eq.${userId}&marca=eq.${marca}&order=criada_em.desc&limit=20`)
  return l.map(paraConversa)
}

export async function respostasProntas(sessao: SessaoTeeds, marca: string): Promise<RespostaPronta[]> {
  const l = await rest<any[]>(sessao, `/suporte_respostas?marca=eq.${marca}&order=ordem.asc,criada_em.asc`)
  return l.map((r) => ({ id: r.id, titulo: r.titulo, texto: r.texto, ordem: r.ordem }))
}
export async function salvarResposta(sessao: SessaoTeeds, marca: string, r: { id?: string; titulo: string; texto: string; ordem?: number }): Promise<void> {
  if (r.id) await rest(sessao, `/suporte_respostas?id=eq.${r.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ titulo: r.titulo, texto: r.texto }) })
  else await rest(sessao, '/suporte_respostas', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ marca, titulo: r.titulo, texto: r.texto, ordem: r.ordem ?? 500 }) })
}
export async function apagarResposta(sessao: SessaoTeeds, id: string): Promise<void> {
  await rest(sessao, `/suporte_respostas?id=eq.${id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } })
}

/** A caixa de entrada aberta bate o ponto: o cliente vê "equipe online". */
export async function baterPonto(sessao: SessaoTeeds, marca: string): Promise<void> {
  await rest(sessao, '/suporte_presenca?on_conflict=user_id,marca', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: sessao.usuario.id, marca, visto_em: new Date().toISOString() }),
  }).catch(() => undefined)
}

// ------------------------------------------------------------------ abrir o chat de qualquer lugar

export interface PedidoDeSuporte {
  mensagem?: string
  /** Um atalho da triagem (ex.: 'trocar-email', 'renovar'): o chat já cai na etapa de escrever. */
  atalho?: string
  /** Vindo da Ajuda: o tema da triagem, a pergunta que a pessoa leu e não resolveu. */
  tema?: string
  resposta?: string
  faq?: string
}
const EVENTO = 'suporte:abrir'
/** Ex.: o perfil pede a troca de e-mail; o FAQ, "não achei minha resposta". */
export function abrirSuporte(p: PedidoDeSuporte = {}) { window.dispatchEvent(new CustomEvent<PedidoDeSuporte>(EVENTO, { detail: p })) }
export function aoPedirSuporte(f: (p: PedidoDeSuporte) => void): () => void {
  const h = (e: Event) => f((e as CustomEvent<PedidoDeSuporte>).detail ?? {})
  window.addEventListener(EVENTO, h)
  return () => window.removeEventListener(EVENTO, h)
}

// ------------------------------------------------------------------ apoio de tela

export function haQuanto(iso: string | null, agora = Date.now()): string {
  if (!iso) return ''
  const min = Math.max(0, Math.round((agora - Date.parse(iso)) / 60000))
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} h${min % 60 && h < 6 ? ` ${min % 60} min` : ''}`
  const d = Math.floor(h / 24)
  return d === 1 ? 'ontem' : `${d} dias`
}
export const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
export function diaDaMensagem(iso: string): string {
  const d = new Date(iso); const hoje = new Date(); const ontem = new Date(Date.now() - 86_400_000)
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return dataCurta(d)
}
/** As respostas prontas trazem {nome}: vira o primeiro nome do cliente. */
export function preencherResposta(texto: string, nome: string): string {
  const primeiro = nome.trim().split(/\s+/)[0]
  if (primeiro) return texto.replace(/\{nome\}/g, primeiro)
  // sem nome na ficha: some o vocativo sem deixar vírgula sobrando
  return texto.replace(/,\s*\{nome\}/g, '').replace(/\{nome\},\s*/g, '').replace(/\{nome\}/g, '').replace(/^\s*\S/, (l) => l.trim().toUpperCase())
}
