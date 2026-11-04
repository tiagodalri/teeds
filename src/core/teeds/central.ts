/**
 * Central de rastreio (04/11/2026): o que a tela de Administração › Central de rastreio lê do banco.
 * As páginas de cadastro gravam pela função gf_rastro (captura-globalfly/captura.js) e a plataforma
 * logada por gf_rastro_app (pixelDoParceiro.ts); aqui só o administrador geral lê.
 */
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'

/** Uma linha do resumo: um canal, um anúncio (chave = id do anúncio) ou um link (chave = código). */
export interface LinhaDoResumo {
  chave: string
  visitantes: number; formulario: number; clicou: number; comecou: number
  /** Visitantes rastreados que se cadastraram (a conversão usa este número sobre os visitantes). */
  convertidos: number
  cadastros: number; questionario: number; notificacoes: number; live: number; liberados: number
}
export interface ResumoDaCentral {
  total: Omit<LinhaDoResumo, 'chave'> & { eventos: number }
  porCanal: LinhaDoResumo[]; porAnuncio: LinhaDoResumo[]; porLink: LinhaDoResumo[]
  porDia: Array<{ dia: string; visitantes: number; cadastros: number }>
}
export interface EventoAoVivo {
  id: number; quando: string; evento: string; pagina: string | null; canal: string; conteudo: string | null; link: string | null
  detalhe: Record<string, unknown> | null; parceiro: string | null; visitante: string
  dispositivo: string | null; navegador: string | null; visitas: number; nome: string | null; cadastrado: boolean
}
export interface PessoaDaLista {
  visitante: string; parceiro: string | null; primeiro_canal: string; canal: string; conteudo: string | null; link: string | null
  dispositivo: string | null; navegador: string | null; visitas: number; eventos: number; primeira_em: string; ultima_em: string
  nome: string | null; email: string | null; cadastrado: boolean; passos: string[] | null
}
export interface FichaDaPessoa {
  visitante: {
    visitante: string; parceiro: string | null; p_canal: string; p_origem: string | null; p_meio: string | null; p_campanha: string | null; p_conteudo: string | null; p_link: string | null; p_ref: string | null
    u_canal: string; u_origem: string | null; u_meio: string | null; u_campanha: string | null; u_conteudo: string | null; u_link: string | null; u_ref: string | null
    dispositivo: string | null; navegador: string | null; visitas: number; eventos: number; primeira_em: string; ultima_em: string; email_normalizado: string | null
  }
  lead: { nome: string; email: string; telefone: string; quando: string; questionario: string | null; exCliente: boolean | null; produtos: string[] | null; origem: string | null; conteudo: string | null } | null
  conta: { criadaEm: string; vistoEm: string | null; acessos: number | null; status: string | null; categoria: string | null; notificacoes: boolean; minutosNaLive: number } | null
  eventos: Array<{ id: number; quando: string; evento: string; pagina: string | null; canal: string; conteudo: string | null; link: string | null; detalhe: Record<string, unknown> | null }>
  outros: string[]
}
export interface LinkDeRastreio { id: string; codigo: string; nome: string; canal: string; parceiro: string | null; arquivado: boolean; criado_em: string; visitantes: number; cadastros: number }

/** O que a tela usa; o laboratório troca por números de exemplo. */
export interface ApiCentral {
  resumo(s: SessaoTeeds, parceiro: string, de: string, ate: string): Promise<ResumoDaCentral>
  aoVivo(s: SessaoTeeds, parceiro: string, depois: number | null): Promise<EventoAoVivo[]>
  pessoas(s: SessaoTeeds, parceiro: string, de: string, ate: string, canal: string, busca: string): Promise<PessoaDaLista[]>
  pessoa(s: SessaoTeeds, visitante: string): Promise<FichaDaPessoa | null>
  links(s: SessaoTeeds): Promise<LinkDeRastreio[]>
  criarLink(s: SessaoTeeds, parceiro: string, nome: string, canal: string, codigo: string): Promise<LinkDeRastreio>
  arquivarLink(s: SessaoTeeds, id: string, arquivado: boolean): Promise<void>
}

async function rpc<T>(sessao: SessaoTeeds, nome: string, corpo: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  }).catch(() => { throw new Error('Sem conexão agora. Confira a internet e tente de novo.') })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(String(e?.message || `Não consegui falar com o banco agora (${r.status}).`)) }
  const texto = await r.text()
  return (texto ? JSON.parse(texto) : null) as T
}

export const API_DA_CENTRAL: ApiCentral = {
  resumo: (s, parceiro, de, ate) => rpc(s, 'teeds_central_resumo', { p_marca: MARCA.id, p_parceiro: parceiro || null, p_de: de, p_ate: ate }),
  aoVivo: async (s, parceiro, depois) => (await rpc<EventoAoVivo[] | null>(s, 'teeds_central_ao_vivo', { p_marca: MARCA.id, p_parceiro: parceiro || null, p_depois: depois, p_limite: depois ? 200 : 80 })) ?? [],
  pessoas: async (s, parceiro, de, ate, canal, busca) => (await rpc<PessoaDaLista[] | null>(s, 'teeds_central_pessoas', { p_marca: MARCA.id, p_parceiro: parceiro || null, p_de: de, p_ate: ate, p_canal: canal || null, p_busca: busca || null, p_limite: 300 })) ?? [],
  pessoa: (s, visitante) => rpc(s, 'teeds_central_pessoa', { p_marca: MARCA.id, p_visitante: visitante }),
  links: async (s) => (await rpc<LinkDeRastreio[] | null>(s, 'teeds_rastreio_links', { p_marca: MARCA.id })) ?? [],
  criarLink: async (s, parceiro, nome, canal, codigo) => ({ ...(await rpc<LinkDeRastreio>(s, 'teeds_rastreio_link_salvar', { p_marca: MARCA.id, p_parceiro: parceiro || null, p_nome: nome, p_canal: canal, p_codigo: codigo })), visitantes: 0, cadastros: 0 }),
  arquivarLink: (s, id, arquivado) => rpc(s, 'teeds_rastreio_link_arquivar', { p_marca: MARCA.id, p_id: id, p_arquivado: arquivado }),
}

/** Os canais com o nome que a tela mostra (os links novos escolhem entre os de CANAIS_DE_LINK). */
export const NOME_DO_CANAL: Record<string, string> = {
  'anuncio-meta': 'Anúncios da Meta', instagram: 'Instagram', stories: 'Stories do Instagram', 'bio-instagram': 'Bio do Instagram',
  facebook: 'Facebook', telegram: 'Telegram', whatsapp: 'WhatsApp', youtube: 'YouTube', tiktok: 'TikTok', email: 'E-mail', google: 'Google',
  site: 'De dentro do site', 'outro-site': 'Outro site', direto: 'Direto ou sem marcação', 'sem-origem': 'Sem origem (antes da central)',
  live: 'Live', parceiro: 'Indicação de parceiro', outro: 'Outro',
}
export const nomeDoCanal = (c: string) => NOME_DO_CANAL[c] ?? c.charAt(0).toUpperCase() + c.slice(1).replace(/-/g, ' ')
/** Os canais que um link marcado pode ter. */
export const CANAIS_DE_LINK = ['telegram', 'stories', 'bio-instagram', 'instagram', 'whatsapp', 'youtube', 'tiktok', 'facebook', 'email', 'live', 'parceiro', 'outro'] as const

/** O endereço que o link marcado leva (a página de cadastro do parceiro, com ?o=). */
export const enderecoDoLink = (parceiro: string | null, codigo: string) =>
  `https://globalflytrade.com/${parceiro ? `${parceiro}/` : ''}cadastro/?o=${encodeURIComponent(codigo)}`

/** Um código curto a partir do nome ("Telegram canal do Naor 04/11" → telegram-canal-do-naor-04-11). */
export const codigoDoNome = (nome: string) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '')

/** Uma pessoa (cadastro) com tudo o que fez depois: teeds_jornada_completa. Valores em US$ são da Deriv. */
export interface PessoaDaJornada {
  id: string; nome: string; email: string; telefone: string; cadastro_em: string; questionario_em: string | null; ex_cliente: boolean | null; parceiro: string | null
  canal: string; anuncio: string | null; link: string | null; visitante: string | null; dispositivo: string | null; navegador: string | null; visitas: number | null; chegou_em: string | null
  comunidade: boolean | null; app: boolean | null; plataforma: boolean | null; agenda: boolean | null; segundos_na_pagina: number | null
  notificacoes: boolean; emails: number; tem_conta: boolean; conta_em: string | null; status_acesso: string | null; categoria: string | null
  acessos: number; segundos_na_plataforma: number; visto_em: string | null; primeiro_acesso: string | null; minutos_live: number
  deriv_real_em: string | null; saldo_real: number | null; deriv_demo_em: string | null
  deposito1_em: string | null; deposito1_valor: number | null; depositado: number; depositos: number; sacado: number
  sessoes_ia: number; sessoes_ia_reais: number; operacoes_reais: number; resultado_real: number
  /** Markup estimado pelo servidor (3% do pagamento das contas reais), desde o cadastro. */
  markup: number
  /** Já tinha conta antes deste cadastro (recadastro): o que fez antes não entra. */
  cliente_antes: boolean
}
export interface Jornada { total: number; pessoas: PessoaDaJornada[] }
export async function jornadaCompleta(sessao: SessaoTeeds, parceiro: string, de: string, ate: string): Promise<Jornada> {
  return (await rpc<Jornada | null>(sessao, 'teeds_jornada_completa', { p_marca: MARCA.id, p_parceiro: parceiro || null, p_de: de, p_ate: ate })) ?? { total: 0, pessoas: [] }
}
