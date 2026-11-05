/**
 * WhatsApp oficial (API da Meta) dentro do ADM, 05/11/2026.
 * Tiago: "Deixe o chat já visível tudo certinho faltando só conectar a api".
 *
 * A tela fala com `WhatsAppApi`. No site, `whatsappDoBanco` lê as conversas no
 * banco (RLS: admin geral e o parceiro dono do número) e manda tudo o que sai
 * para o cliente pela função `whatsapp` (é ela que tem a chave da Meta). Antes de
 * conectar, e no laboratório, `whatsappDeExemplo` mostra conversas de mentira,
 * marcadas como exemplo, para a equipe ver como funciona.
 *
 * A regra de ouro do WhatsApp oficial: depois de 24 horas sem mensagem do cliente,
 * só sai modelo aprovado. `janela()` diz se a conversa está aberta e até quando.
 */
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { assinarMudancas } from './realtime'
import { ehImagem, reduzirImagem } from '../imagem'

export const JANELA_MS = 24 * 60 * 60 * 1000

export interface ContaWpp {
  marca: string; parceiro: string | null; numero: string | null; nomeVerificado: string | null
  qualidade: string | null; limite: string | null; situacao: 'desconectado' | 'conectado' | 'erro'; erro: string | null
  ultimoAvisoEm: string | null; conectadoEm: string | null; phoneNumberId: string | null; wabaId: string | null; appId: string | null
}
export interface EstadoWpp {
  podeVer: boolean
  /** 'geral', 'parceiro:n'… ou null (não pode ligar o número). */
  podeConectar: string | null
  /** De quem é o número ('n' = Naor). */
  dono: string | null
  conta: ContaWpp | null
  conectado: boolean
  webhook: { url: string; senha: string } | null
  exemplo?: boolean
}
export interface ContatoWpp {
  id: string; waId: string; nome: string | null; userId: string | null; leadId: string | null
  ultimaEm: string | null; ultimaTexto: string | null; ultimaDirecao: 'entrada' | 'saida' | 'nota' | null; ultimaEntradaEm: string | null
  naoLidas: number; responsavel: string | null; situacao: 'aberta' | 'resolvida'; etiquetas: string[]; criadoEm: string; fixada: boolean
}
export type TipoMsg = 'texto' | 'imagem' | 'audio' | 'video' | 'documento' | 'figurinha' | 'modelo' | 'localizacao' | 'contato' | 'botao' | 'outro'
export type StatusMsg = 'pendente' | 'enviada' | 'entregue' | 'lida' | 'falhou' | 'recebida'
export interface MidiaWpp { caminho?: string | null; mime?: string; nome?: string | null; tamanho?: number | null; voz?: boolean; falhou?: boolean; exemplo?: string; duracao?: number }
export interface MensagemWpp {
  id: string; contatoId: string; wamid: string | null; direcao: 'entrada' | 'saida' | 'nota'; tipo: TipoMsg
  texto: string | null; midia: MidiaWpp | null; modelo: { nome: string; idioma: string } | null; citando: string | null
  reacao: string | null; reacaoEquipe: string | null; status: StatusMsg; erro: string | null; autor: string | null; criadoEm: string
  /** só na tela: ainda indo, ou não foi */
  enviando?: boolean; falhouAqui?: string
}
export interface RespostaPronta { id: string; atalho: string; titulo: string; texto: string }
export interface ModeloWpp { nome: string; idioma: string; categoria: string | null; situacao: string | null; componentes: Array<{ type: string; format?: string; text?: string; buttons?: Array<{ type: string; text: string; url?: string }> }> }
export interface FichaWpp {
  cliente: { userId: string; nome: string | null; email: string | null; telefone: string | null; categoria: string | null; subplano: string | null; parceiro: string | null; status: string | null; criadoEm: string | null; vistoEm: string | null; cidade: string | null; uf: string | null } | null
  lead: { nome: string | null; email: string | null; parceiro: string | null; temperatura: string | null; campanha: string | null; consentiu: boolean | null; criadoEm: string | null } | null
}
export interface PessoaDaEquipe { id: string; nome: string }
export interface Parceiro { codigo: string; nome: string }
export interface DadosDeConexao { phoneNumberId: string; wabaId: string; appId: string; token: string; appSecret: string; parceiro: string | null }

export type MudancaWpp = { tipo: 'contato'; item: ContatoWpp } | { tipo: 'mensagem'; item: MensagemWpp; nova: boolean }

export interface WhatsAppApi {
  euId: string
  exemplo: boolean
  estado(): Promise<EstadoWpp>
  conectar(d: DadosDeConexao): Promise<{ numero?: string; nome?: string; modelos?: number; aviso?: string | null }>
  desconectar(): Promise<void>
  atualizar(): Promise<{ modelos: number }>
  contatos(): Promise<ContatoWpp[]>
  mensagens(contatoId: string, antesDe?: string): Promise<MensagemWpp[]>
  enviarTexto(contatoId: string, texto: string, citando?: string | null): Promise<void>
  enviarArquivo(contatoId: string, arquivo: File, legenda?: string, citando?: string | null): Promise<void>
  enviarModelo(contatoId: string, m: ModeloWpp, vars: { cabecalho: string[]; corpo: string[] }): Promise<void>
  nota(contatoId: string, texto: string): Promise<MensagemWpp>
  ler(contatoId: string): Promise<void>
  mudarContato(contatoId: string, campos: Partial<Pick<ContatoWpp, 'responsavel' | 'situacao' | 'etiquetas' | 'nome' | 'fixada' | 'naoLidas'>>): Promise<void>
  reagir(contatoId: string, wamid: string, emoji: string): Promise<void>
  novo(numero: string, nome: string): Promise<string>
  respostas(): Promise<RespostaPronta[]>
  salvarResposta(r: Omit<RespostaPronta, 'id'> & { id?: string }): Promise<void>
  apagarResposta(id: string): Promise<void>
  modelos(): Promise<ModeloWpp[]>
  ficha(contatoId: string): Promise<FichaWpp | null>
  equipe(): Promise<PessoaDaEquipe[]>
  parceiros(): Promise<Parceiro[]>
  abrirArquivo(m: MidiaWpp): Promise<string>
  acompanhar(aoMudar: (m: MudancaWpp) => void, aoEstado?: (aoVivo: boolean) => void): () => void
}

/* ------------------------------------------------------------ apoio */
export const POR_PAGINA = 60

export function janela(c: Pick<ContatoWpp, 'ultimaEntradaEm'> | null, agora = Date.now()): { aberta: boolean; restaMs: number } {
  if (!c?.ultimaEntradaEm) return { aberta: false, restaMs: 0 }
  const resta = new Date(c.ultimaEntradaEm).getTime() + JANELA_MS - agora
  return { aberta: resta > 0, restaMs: Math.max(0, resta) }
}
export function textoDaJanela(restaMs: number): string {
  const h = Math.floor(restaMs / 3_600_000), m = Math.floor((restaMs % 3_600_000) / 60_000)
  if (h >= 1) return `fecha em ${h} h${m && h < 3 ? ` ${m} min` : ''}`
  return `fecha em ${Math.max(1, m)} min`
}

/** +55 (47) 99999-8888 */
export function telefoneBonito(waId: string): string {
  const d = waId.replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4), n = d.slice(4)
    return `+55 (${ddd}) ${n.length === 9 ? `${n.slice(0, 5)}-${n.slice(5)}` : `${n.slice(0, 4)}-${n.slice(4)}`}`
  }
  return d ? `+${d}` : waId
}
export const nomeDoContato = (c: Pick<ContatoWpp, 'nome' | 'waId'>) => c.nome?.trim() || telefoneBonito(c.waId)
export const primeiroNome = (c: Pick<ContatoWpp, 'nome'> | null) => (c?.nome?.trim().split(/\s+/)[0] ?? '').replace(/^./, (x) => x.toUpperCase())

/** As variáveis {{1}}, {{2}} de uma parte do modelo. */
export function variaveisDe(texto?: string): number {
  const ns = [...(texto ?? '').matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
  return ns.length ? Math.max(...ns) : 0
}
export function trocarVariaveis(texto: string, vars: string[]): string {
  return texto.replace(/\{\{(\d+)\}\}/g, (_, n) => vars[Number(n) - 1]?.trim() || `{{${n}}}`)
}

export const LIMITE_LEGIVEL: Record<string, string> = {
  TIER_50: '50 pessoas por dia', TIER_250: '250 pessoas por dia', TIER_1K: '1.000 pessoas por dia', TIER_2K: '2.000 pessoas por dia',
  TIER_10K: '10.000 pessoas por dia', TIER_100K: '100.000 pessoas por dia', TIER_UNLIMITED: 'Sem limite diário',
}
export const QUALIDADE_LEGIVEL: Record<string, { rotulo: string; tom: 'ok' | 'alerta' | 'perigo' }> = {
  GREEN: { rotulo: 'Qualidade alta', tom: 'ok' }, YELLOW: { rotulo: 'Qualidade média', tom: 'alerta' }, RED: { rotulo: 'Qualidade baixa', tom: 'perigo' },
}
export const CATEGORIA_LEGIVEL: Record<string, string> = { UTILITY: 'Aviso', MARKETING: 'Divulgação', AUTHENTICATION: 'Código de acesso' }
export const SITUACAO_MODELO: Record<string, string> = { APPROVED: 'Aprovado', PENDING: 'Em análise', REJECTED: 'Recusado', PAUSED: 'Pausado', DISABLED: 'Desativado', IN_APPEAL: 'Em recurso' }

/** O arquivo vai como a Meta aceita: foto JPG/PNG até 5 MB, áudio e vídeo até 16 MB, documento até 100 MB. */
export function conferirArquivo(f: File): string | null {
  const mb = f.size / 1024 / 1024
  if (f.type.startsWith('video/')) return /video\/(mp4|3gpp)/.test(f.type) ? (mb > 16 ? 'O vídeo passou de 16 MB, o limite do WhatsApp. Mande um vídeo mais curto.' : null) : 'O WhatsApp aceita vídeo em MP4.'
  if (f.type.startsWith('audio/')) return mb > 16 ? 'O áudio passou de 16 MB, o limite do WhatsApp.' : null
  if (ehImagem(f)) return null // vira JPG e diminui antes de ir
  return mb > 100 ? 'O arquivo passou de 100 MB, o limite do WhatsApp.' : null
}

/* ------------------------------------------------------------ conversão */
const daConta = (l: any): ContaWpp => ({
  marca: l.marca, parceiro: l.parceiro ?? null, numero: l.numero ?? null, nomeVerificado: l.nome_verificado ?? null, qualidade: l.qualidade ?? null,
  limite: l.limite ?? null, situacao: l.situacao ?? 'desconectado', erro: l.erro ?? null, ultimoAvisoEm: l.ultimo_aviso_em ?? null,
  conectadoEm: l.conectado_em ?? null, phoneNumberId: l.phone_number_id ?? null, wabaId: l.waba_id ?? null, appId: l.app_id ?? null,
})
export const daContato = (l: any): ContatoWpp => ({
  id: l.id, waId: l.wa_id, nome: l.nome ?? null, userId: l.user_id ?? null, leadId: l.lead_id ?? null, ultimaEm: l.ultima_em ?? null,
  ultimaTexto: l.ultima_texto ?? null, ultimaDirecao: l.ultima_direcao ?? null, ultimaEntradaEm: l.ultima_entrada_em ?? null,
  naoLidas: Number(l.nao_lidas) || 0, responsavel: l.responsavel ?? null, situacao: l.situacao ?? 'aberta', etiquetas: l.etiquetas ?? [], criadoEm: l.criado_em,
  fixada: !!l.fixada,
})
export const daMensagem = (l: any): MensagemWpp => ({
  id: l.id, contatoId: l.contato_id, wamid: l.wamid ?? null, direcao: l.direcao, tipo: l.tipo ?? 'texto', texto: l.texto ?? null,
  midia: l.midia ?? null, modelo: l.modelo ?? null, citando: l.citando ?? null, reacao: l.reacao ?? null, reacaoEquipe: l.reacao_equipe ?? null, status: l.status ?? 'pendente',
  erro: l.erro ?? null, autor: l.autor ?? null, criadoEm: l.criado_em,
})
const daFicha = (j: any): FichaWpp | null => j ? ({
  cliente: j.cliente ? {
    userId: j.cliente.user_id, nome: j.cliente.nome ?? null, email: j.cliente.email ?? null, telefone: j.cliente.telefone ?? null,
    categoria: j.cliente.categoria ?? null, subplano: j.cliente.subplano ?? null, parceiro: j.cliente.parceiro ?? null, status: j.cliente.status ?? null,
    criadoEm: j.cliente.criado_em ?? null, vistoEm: j.cliente.visto_em ?? null, cidade: j.cliente.cidade ?? null, uf: j.cliente.uf ?? null,
  } : null,
  lead: j.lead ? {
    nome: j.lead.nome ?? null, email: j.lead.email ?? null, parceiro: j.lead.parceiro ?? null, temperatura: j.lead.temperatura ?? null,
    campanha: j.lead.campanha ?? null, consentiu: j.lead.consentiu ?? null, criadoEm: j.lead.criado_em ?? null,
  } : null,
}) : null

/* ------------------------------------------------------------ banco */
export function whatsappDoBanco(sessao: SessaoTeeds, marca: string): WhatsAppApi {
  const cabeca = () => ({ apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` })
  const rest = async <T>(caminho: string, init: RequestInit = {}): Promise<T> => {
    const r = await fetch(`${SUPABASE.url}/rest/v1${caminho}`, { ...init, headers: { ...cabeca(), 'Content-Type': 'application/json', ...(init.headers as Record<string, string> ?? {}) } })
    if (!r.ok) {
      const c = await r.json().catch(() => ({}))
      throw new Error(String(c?.message || `Não consegui falar com o servidor agora (${r.status}). Tente de novo.`))
    }
    return r.status === 204 ? (undefined as T) : ((await r.json().catch(() => undefined)) as T)
  }
  const rpc = <T>(nome: string, corpo: Record<string, unknown>) => rest<T>(`/rpc/${nome}`, { method: 'POST', body: JSON.stringify(corpo) })
  const funcao = async <T = any>(acao: string, corpo: Record<string, unknown> = {}): Promise<T> => {
    const r = await fetch(`${SUPABASE.url}/functions/v1/whatsapp`, { method: 'POST', headers: { ...cabeca(), 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, marca, ...corpo }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d?.erro) throw new Error(String(d?.erro || `Não consegui falar com o WhatsApp agora (${r.status}). Tente de novo.`))
    return d as T
  }
  const abertos = new Map<string, Promise<string>>()

  const api: WhatsAppApi = {
    euId: sessao.usuario.id,
    exemplo: false,
    async estado() {
      const d = await funcao<any>('estado')
      return { podeVer: !!d.podeVer, podeConectar: d.podeConectar ?? null, dono: d.dono ?? null, conta: d.conta ? daConta(d.conta) : null, conectado: !!d.conectado, webhook: d.webhook ?? null }
    },
    conectar: (d) => funcao('conectar', { ...d }),
    async desconectar() { await funcao('desconectar') },
    atualizar: () => funcao('atualizar'),
    async contatos() {
      const l = await rest<any[]>(`/whatsapp_contatos?marca=eq.${marca}&select=*&order=ultima_em.desc.nullslast&limit=500`)
      return (l ?? []).map(daContato)
    },
    async mensagens(contatoId, antesDe) {
      const antes = antesDe ? `&criado_em=lt.${encodeURIComponent(antesDe)}` : ''
      const l = await rest<any[]>(`/whatsapp_mensagens?contato_id=eq.${contatoId}${antes}&select=*&order=criado_em.desc&limit=${POR_PAGINA}`)
      return (l ?? []).map(daMensagem).reverse()
    },
    async enviarTexto(contatoId, texto, citando) { await funcao('enviar', { contatoId, tipo: 'texto', texto, citando: citando ?? null }) },
    async enviarArquivo(contatoId, arquivo, legenda, citando) {
      const erro = conferirArquivo(arquivo)
      if (erro) throw new Error(erro)
      let blob: Blob = arquivo, mime = arquivo.type || 'application/octet-stream', ext = (arquivo.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (ehImagem(arquivo)) { const r = await reduzirImagem(arquivo, 1920, false, 0.86); blob = r.blob; mime = r.tipo; ext = r.ext }
      const caminho = `${marca}/${contatoId}/${crypto.randomUUID()}.${ext}`
      const up = await fetch(`${SUPABASE.url}/storage/v1/object/whatsapp/${caminho}`, { method: 'POST', headers: { ...cabeca(), 'Content-Type': mime }, body: blob })
      if (!up.ok) throw new Error(up.status === 413 ? 'O arquivo ficou grande demais.' : 'Não consegui subir o arquivo agora. Tente de novo.')
      await funcao('enviar', { contatoId, tipo: 'midia', texto: legenda ?? '', citando: citando ?? null, midia: { caminho, mime, nome: arquivo.name, tamanho: blob.size } })
    },
    async enviarModelo(contatoId, m, vars) { await funcao('enviar', { contatoId, tipo: 'modelo', modelo: { nome: m.nome, idioma: m.idioma, ...vars } }) },
    async nota(contatoId, texto) {
      const l = await rest<any[]>('/whatsapp_mensagens', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ marca, contato_id: contatoId, direcao: 'nota', tipo: 'texto', texto: texto.trim(), autor: sessao.usuario.id, status: 'enviada' }) })
      return daMensagem(l[0])
    },
    async ler(contatoId) {
      await rest(`/whatsapp_contatos?id=eq.${contatoId}`, { method: 'PATCH', body: JSON.stringify({ nao_lidas: 0 }) })
      funcao('ler', { contatoId }).catch(() => undefined) // o "lido" azul no celular do cliente
    },
    async mudarContato(contatoId, c) {
      const corpo: Record<string, unknown> = {}
      if ('responsavel' in c) corpo.responsavel = c.responsavel ?? null
      if (c.situacao) corpo.situacao = c.situacao
      if (c.etiquetas) corpo.etiquetas = c.etiquetas
      if ('nome' in c) corpo.nome = c.nome ?? null
      if ('fixada' in c) corpo.fixada = !!c.fixada
      if ('naoLidas' in c) corpo.nao_lidas = c.naoLidas ?? 0
      await rest(`/whatsapp_contatos?id=eq.${contatoId}`, { method: 'PATCH', body: JSON.stringify(corpo) })
    },
    async reagir(contatoId, wamid, emoji) { await funcao('reagir', { contatoId, wamid, emoji }) },
    async novo(numero, nome) { const d = await funcao<{ contato: string }>('novo', { numero, nome }); return d.contato },
    async respostas() {
      const l = await rest<any[]>(`/whatsapp_respostas?marca=eq.${marca}&select=id,atalho,titulo,texto&order=atalho`)
      return (l ?? []).map((r) => ({ id: r.id, atalho: r.atalho, titulo: r.titulo, texto: r.texto }))
    },
    async salvarResposta(r) {
      const corpo = { marca, atalho: r.atalho.replace(/^\//, '').trim().toLowerCase(), titulo: r.titulo.trim(), texto: r.texto.trim(), criado_por: sessao.usuario.id }
      if (r.id) await rest(`/whatsapp_respostas?id=eq.${r.id}`, { method: 'PATCH', body: JSON.stringify(corpo) })
      else await rest('/whatsapp_respostas', { method: 'POST', body: JSON.stringify(corpo) })
    },
    async apagarResposta(id) { await rest(`/whatsapp_respostas?id=eq.${id}`, { method: 'DELETE' }) },
    async modelos() {
      const l = await rest<any[]>(`/whatsapp_modelos?marca=eq.${marca}&select=*&order=nome`)
      return (l ?? []).map((m) => ({ nome: m.nome, idioma: m.idioma, categoria: m.categoria ?? null, situacao: m.situacao ?? null, componentes: m.componentes ?? [] }))
    },
    async ficha(contatoId) { return daFicha(await rpc<any>('whatsapp_ficha', { p_contato: contatoId })) },
    async equipe() {
      const l = await rpc<any[]>('equipe_contatos', { p_marca: marca }).catch(() => [])
      return (l ?? []).map((p) => ({ id: p.user_id, nome: String(p.nome ?? '') || 'Equipe' }))
    },
    async parceiros() {
      const l = await rest<any[]>(`/parceiros?marca=eq.${marca}&select=codigo,nome&order=codigo`).catch(() => [])
      return (l ?? []).map((p) => ({ codigo: p.codigo, nome: p.nome }))
    },
    abrirArquivo(m) {
      const caminho = m.caminho
      if (!caminho) return Promise.reject(new Error('arquivo'))
      let p = abertos.get(caminho)
      if (!p) {
        p = fetch(`${SUPABASE.url}/storage/v1/object/authenticated/whatsapp/${caminho}`, { headers: cabeca() })
          .then((r) => { if (!r.ok) throw new Error('arquivo'); return r.blob() }).then((b) => URL.createObjectURL(b))
        p.catch(() => abertos.delete(caminho))
        abertos.set(caminho, p)
      }
      return p
    },
    acompanhar(aoMudar, aoEstado) {
      const filtro = `marca=eq.${marca}`
      const a = assinarMudancas({
        token: sessao.token,
        canal: `whatsapp-${marca}-${Math.random().toString(36).slice(2, 8)}`,
        tabelas: [
          { tabela: 'whatsapp_contatos', filtro, evento: 'INSERT' },
          { tabela: 'whatsapp_contatos', filtro, evento: 'UPDATE' },
          { tabela: 'whatsapp_mensagens', filtro, evento: 'INSERT' },
          { tabela: 'whatsapp_mensagens', filtro, evento: 'UPDATE' },
        ],
        aoEstado: (e) => aoEstado?.(e === 'ao-vivo'),
        aoMudar: (m) => {
          if (!m.linha) return
          if (m.tabela === 'whatsapp_contatos') aoMudar({ tipo: 'contato', item: daContato(m.linha) })
          else aoMudar({ tipo: 'mensagem', item: daMensagem(m.linha), nova: m.tipo === 'INSERT' })
        },
      })
      return () => a.fechar()
    },
  }
  return api
}

/* ------------------------------------------------------------ exemplo */
/**
 * Conversas de mentira para a equipe ver a central funcionando antes de ligar o
 * número (e para o laboratório). Nada sai daqui: enviar só acrescenta na tela.
 */
export function whatsappDeExemplo(base: Partial<EstadoWpp> = {}, euId = 'eu'): WhatsAppApi {
  const agora = Date.now(), min = 60_000, h = 60 * min
  const em = (ms: number) => new Date(agora - ms).toISOString()
  const contatos: ContatoWpp[] = [
    { id: 'c1', waId: '5547991234567', nome: 'Marcos Andrade', userId: 'u1', leadId: null, ultimaEm: em(3 * min), ultimaTexto: 'E depois disso já consigo ligar a Raptor?', ultimaDirecao: 'entrada', ultimaEntradaEm: em(3 * min), naoLidas: 2, responsavel: null, situacao: 'aberta', etiquetas: ['Conta da corretora'], criadoEm: em(2 * h), fixada: true },
    { id: 'c2', waId: '5511987654321', nome: 'Juliana Prado', userId: 'u2', leadId: null, ultimaEm: em(42 * min), ultimaTexto: 'Perfeito, obrigada! Vou fechar o Black hoje.', ultimaDirecao: 'entrada', ultimaEntradaEm: em(42 * min), naoLidas: 0, responsavel: euId, situacao: 'aberta', etiquetas: ['Quer o Black'], criadoEm: em(5 * h), fixada: false },
    { id: 'c3', waId: '5521976543210', nome: 'Rafael Costa', userId: null, leadId: 'l3', ultimaEm: em(2 * h), ultimaTexto: '🎤 Áudio', ultimaDirecao: 'entrada', ultimaEntradaEm: em(2 * h), naoLidas: 1, responsavel: null, situacao: 'aberta', etiquetas: [], criadoEm: em(2 * h), fixada: false },
    { id: 'c4', waId: '5531965432109', nome: 'Carla Mendes', userId: 'u4', leadId: null, ultimaEm: em(30 * h), ultimaTexto: 'Ok, vou ver e te aviso.', ultimaDirecao: 'entrada', ultimaEntradaEm: em(30 * h), naoLidas: 0, responsavel: null, situacao: 'aberta', etiquetas: [], criadoEm: em(3 * 24 * h), fixada: false },
    { id: 'c5', waId: '5548999887766', nome: 'Pedro Henrique', userId: 'u5', leadId: null, ultimaEm: em(26 * h), ultimaTexto: 'Valeu, deu certo!', ultimaDirecao: 'entrada', ultimaEntradaEm: em(26 * h), naoLidas: 0, responsavel: euId, situacao: 'resolvida', etiquetas: ['Acesso'], criadoEm: em(4 * 24 * h), fixada: false },
  ]
  let n = 0
  const msg = (contatoId: string, direcao: MensagemWpp['direcao'], ms: number, texto: string | null, extra: Partial<MensagemWpp> = {}): MensagemWpp => ({
    id: `m${++n}`, contatoId, wamid: `wamid.ex${n}`, direcao, tipo: 'texto', texto, midia: null, modelo: null, citando: null, reacao: null, reacaoEquipe: null,
    status: direcao === 'entrada' ? 'recebida' : 'lida', erro: null, autor: direcao === 'entrada' ? null : euId, criadoEm: em(ms), ...extra,
  })
  const mensagens: MensagemWpp[] = [
    msg('c1', 'entrada', 18 * min, 'Boa noite! Vi o vídeo do Naor e me cadastrei. Como faço para conectar a minha conta da corretora?'),
    msg('c1', 'saida', 15 * min, 'Boa noite, Marcos! Dentro da plataforma, toque em "Conectar corretora" no topo e entre com o seu login da Deriv. Leva menos de um minuto.'),
    msg('c1', 'nota', 14 * min, 'Cliente do /n, chegou pelo anúncio do vídeo. Primeiro contato.'),
    msg('c1', 'entrada', 4 * min, 'Consegui conectar 🙌'),
    msg('c1', 'entrada', 3 * min, 'E depois disso já consigo ligar a Raptor?'),
    msg('c2', 'entrada', 70 * min, 'Oi! Qual a diferença do Gold para o Black?'),
    msg('c2', 'saida', 66 * min, 'Oi, Juliana! No Black você tem as 5 I.A. (com Gulf e Phenom), compartilhamento de só 5% do lucro do mês, 12 h de simulador por dia e a sala ao vivo extra.'),
    msg('c2', 'saida', 65 * min, null, { tipo: 'imagem', midia: { exemplo: '/checkout-globalfly/capa-black.jpg', mime: 'image/jpeg', nome: 'GF Member Black.jpg' }, texto: 'GF Member Black · R$ 997 por ano' }),
    msg('c2', 'entrada', 43 * min, 'Perfeito, obrigada! Vou fechar o Black hoje.', { reacao: null }),
    msg('c3', 'entrada', 2 * h + 2 * min, 'Olá, me cadastrei para a live do dia 09'),
    msg('c3', 'entrada', 2 * h, null, { tipo: 'audio', midia: { exemplo: 'audio', mime: 'audio/ogg', voz: true, duracao: 14 } }),
    msg('c4', 'saida', 31 * h, 'Oi, Carla! Notamos que você ainda não conectou a corretora. Quer ajuda?'),
    msg('c4', 'entrada', 30 * h, 'Ok, vou ver e te aviso.'),
    msg('c5', 'entrada', 27 * h, 'Não estou conseguindo entrar na plataforma'),
    msg('c5', 'saida', 26.5 * h, 'Oi, Pedro! Na tela de entrada, toque em "Esqueci a senha" e use o mesmo e-mail do cadastro.'),
    msg('c5', 'entrada', 26 * h, 'Valeu, deu certo!', { reacao: null }),
  ]
  mensagens.find((m) => m.texto === 'Perfeito, obrigada! Vou fechar o Black hoje.')!.citando = mensagens.find((m) => m.contatoId === 'c2' && m.direcao === 'saida')!.wamid
  mensagens.find((m) => m.contatoId === 'c2' && m.tipo === 'imagem')!.reacao = '❤️'
  const fichas: Record<string, FichaWpp> = {
    c1: { cliente: { userId: 'u1', nome: 'Marcos Andrade', email: 'marcos.andrade@exemplo.com', telefone: '(47) 99123-4567', categoria: 'gold', subplano: 'gold', parceiro: 'n', status: 'ativo', criadoEm: em(2 * h), vistoEm: em(5 * min), cidade: 'Joinville', uf: 'SC' }, lead: null },
    c2: { cliente: { userId: 'u2', nome: 'Juliana Prado', email: 'juliana.prado@exemplo.com', telefone: '(11) 98765-4321', categoria: 'gold', subplano: 'gold', parceiro: 'n', status: 'ativo', criadoEm: em(6 * 24 * h), vistoEm: em(40 * min), cidade: 'São Paulo', uf: 'SP' }, lead: null },
    c3: { cliente: null, lead: { nome: 'Rafael Costa', email: 'rafael.costa@exemplo.com', parceiro: 'n', temperatura: 'quente', campanha: 'GF | Naor | Cadastro 09/11', consentiu: true, criadoEm: em(3 * h) } },
    c4: { cliente: { userId: 'u4', nome: 'Carla Mendes', email: 'carla.mendes@exemplo.com', telefone: '(31) 96543-2109', categoria: 'gold', subplano: 'gold', parceiro: 'n', status: 'ativo', criadoEm: em(4 * 24 * h), vistoEm: em(29 * h), cidade: 'Belo Horizonte', uf: 'MG' }, lead: null },
    c5: { cliente: { userId: 'u5', nome: 'Pedro Henrique', email: 'pedro.h@exemplo.com', telefone: '(48) 99988-7766', categoria: 'black', subplano: 'black', parceiro: 'n', status: 'ativo', criadoEm: em(9 * 24 * h), vistoEm: em(25 * h), cidade: 'Florianópolis', uf: 'SC' }, lead: null },
  }
  let respostas: RespostaPronta[] = [
    { id: 'r1', atalho: 'acesso', titulo: 'Acesso à plataforma', texto: 'Você entra em https://globalflytrade.com com o mesmo e-mail do cadastro. Se esqueceu a senha, toque em "Esqueci a senha" na tela de entrada.' },
    { id: 'r2', atalho: 'deposito', titulo: 'Como depositar', texto: 'Para depositar na sua conta da corretora, use este link: https://home.deriv.com/dashboard/deposit?from=home&depositSheet=1&returnTo=%2Fhome&currency=USD' },
    { id: 'r3', atalho: 'live', titulo: 'Live de 09/11', texto: 'A live de lançamento é no dia 09/11, às 20h30, ao vivo no YouTube. Assim que começar, o link aparece dentro da plataforma.' },
    { id: 'r4', atalho: 'oi', titulo: 'Boas-vindas', texto: 'Olá! Aqui é a equipe da GlobalFly Trade. Como podemos te ajudar?' },
  ]
  const modelos: ModeloWpp[] = [
    { nome: 'retomar_atendimento', idioma: 'pt_BR', categoria: 'UTILITY', situacao: 'APPROVED', componentes: [{ type: 'BODY', text: 'Oi, {{1}}! Aqui é a equipe da GlobalFly Trade. Podemos continuar o seu atendimento por aqui?' }, { type: 'FOOTER', text: 'GlobalFly Trade' }] },
    { nome: 'lembrete_live', idioma: 'pt_BR', categoria: 'UTILITY', situacao: 'APPROVED', componentes: [{ type: 'HEADER', format: 'TEXT', text: 'Live de lançamento hoje' }, { type: 'BODY', text: 'Olá, {{1}}! A live de lançamento da GlobalFly começa hoje às {{2}}. O link aparece dentro da plataforma assim que começar.' }, { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Abrir a plataforma', url: 'https://globalflytrade.com' }] }] },
    { nome: 'aulas_liberadas', idioma: 'pt_BR', categoria: 'UTILITY', situacao: 'PENDING', componentes: [{ type: 'BODY', text: 'Oi, {{1}}! As aulas do GF Member já estão liberadas na sua conta.' }] },
  ]
  const ouvintes = new Set<(m: MudancaWpp) => void>()
  const avisar = (m: MudancaWpp) => ouvintes.forEach((f) => f(m))
  const contato = (id: string) => contatos.find((c) => c.id === id)!
  const sair = (contatoId: string, parcial: Partial<MensagemWpp>) => {
    const m = msg(contatoId, 'saida', 0, null, { status: 'enviada', criadoEm: new Date().toISOString(), ...parcial })
    mensagens.push(m)
    const c = contato(contatoId)
    Object.assign(c, { ultimaEm: m.criadoEm, ultimaTexto: m.texto || (m.tipo === 'imagem' ? '📷 Foto' : m.tipo === 'documento' ? '📄 Arquivo' : 'Mensagem'), ultimaDirecao: 'saida', naoLidas: 0 })
    avisar({ tipo: 'mensagem', item: { ...m }, nova: true }); avisar({ tipo: 'contato', item: { ...c } })
    // o caminho do tique, como no celular
    setTimeout(() => { m.status = 'entregue'; avisar({ tipo: 'mensagem', item: { ...m }, nova: false }) }, 1200)
    setTimeout(() => { m.status = 'lida'; avisar({ tipo: 'mensagem', item: { ...m }, nova: false }) }, 3200)
  }
  const espera = (ms = 250) => new Promise((r) => setTimeout(r, ms))
  let respondeu = false
  const entrar = (contatoId: string, texto: string) => {
    const m = msg(contatoId, 'entrada', 0, texto, { criadoEm: new Date().toISOString() })
    mensagens.push(m)
    const c = contato(contatoId)
    Object.assign(c, { ultimaEm: m.criadoEm, ultimaTexto: texto, ultimaDirecao: 'entrada', ultimaEntradaEm: m.criadoEm, naoLidas: c.naoLidas + 1, situacao: 'aberta' })
    avisar({ tipo: 'mensagem', item: { ...m }, nova: true }); avisar({ tipo: 'contato', item: { ...c } })
  }
  const estado: EstadoWpp = { podeVer: true, podeConectar: 'geral', dono: 'n', conta: null, conectado: false, webhook: { url: 'https://wonxykovfvfnuhzpqsle.supabase.co/functions/v1/whatsapp?marca=globalfly', senha: 'gf-exemplo' }, ...base, exemplo: true }

  return {
    euId, exemplo: true,
    async estado() { return estado },
    async conectar() { await espera(600); throw new Error('Isto é só o exemplo. Conecte pela plataforma de verdade.') },
    async desconectar() { /* nada */ },
    async atualizar() { return { modelos: modelos.length } },
    async contatos() { await espera(); return contatos.map((c) => ({ ...c })) },
    async mensagens(contatoId) { await espera(150); return mensagens.filter((m) => m.contatoId === contatoId).map((m) => ({ ...m })) },
    async enviarTexto(contatoId, texto, citando) {
      await espera(300); sair(contatoId, { texto, citando: citando ?? null })
      if (contatoId === 'c1' && !respondeu) { respondeu = true; setTimeout(() => entrar('c1', 'Show! Obrigado pela ajuda 🙏'), 5200) }
    },
    async enviarArquivo(contatoId, arquivo, legenda) {
      const erro = conferirArquivo(arquivo); if (erro) throw new Error(erro)
      await espera(500)
      const t: TipoMsg = ehImagem(arquivo) ? 'imagem' : arquivo.type.startsWith('audio/') ? 'audio' : arquivo.type.startsWith('video/') ? 'video' : 'documento'
      sair(contatoId, { tipo: t, texto: legenda || null, midia: { exemplo: URL.createObjectURL(arquivo), mime: arquivo.type, nome: arquivo.name, tamanho: arquivo.size } })
    },
    async enviarModelo(contatoId, m, vars) {
      await espera(400)
      const partes: string[] = []
      for (const c of m.componentes) {
        if (c.type === 'HEADER' && c.text) partes.push(`*${trocarVariaveis(c.text, vars.cabecalho)}*`)
        if (c.type === 'BODY' && c.text) partes.push(trocarVariaveis(c.text, vars.corpo))
        if (c.type === 'FOOTER' && c.text) partes.push(`_${c.text}_`)
      }
      sair(contatoId, { tipo: 'modelo', texto: partes.join('\n\n'), modelo: { nome: m.nome, idioma: m.idioma } })
    },
    async nota(contatoId, texto) {
      const m = msg(contatoId, 'nota', 0, texto, { criadoEm: new Date().toISOString(), status: 'enviada' })
      mensagens.push(m); avisar({ tipo: 'mensagem', item: { ...m }, nova: true }); return { ...m }
    },
    async ler(contatoId) { const c = contato(contatoId); c.naoLidas = 0; avisar({ tipo: 'contato', item: { ...c } }) },
    async mudarContato(contatoId, campos) { const c = contato(contatoId); Object.assign(c, campos); avisar({ tipo: 'contato', item: { ...c } }) },
    async reagir(_contatoId, wamid, emoji) {
      const m = mensagens.find((x) => x.wamid === wamid); if (!m) return
      m.reacaoEquipe = emoji || null; avisar({ tipo: 'mensagem', item: { ...m }, nova: false })
    },
    async novo(numero, nome) {
      let d = numero.replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d
      if (d.length < 12) throw new Error('Confira o número: DDD + número.')
      const existe = contatos.find((c) => c.waId === d); if (existe) return existe.id
      const c: ContatoWpp = { id: `c${Date.now()}`, waId: d, nome: nome.trim() || null, userId: null, leadId: null, ultimaEm: null, ultimaTexto: null, ultimaDirecao: null, ultimaEntradaEm: null, naoLidas: 0, responsavel: euId, situacao: 'aberta', etiquetas: [], criadoEm: new Date().toISOString(), fixada: false }
      contatos.unshift(c); fichas[c.id] = { cliente: null, lead: null }; avisar({ tipo: 'contato', item: { ...c } }); return c.id
    },
    async respostas() { return respostas.map((r) => ({ ...r })) },
    async salvarResposta(r) {
      const limpa = { atalho: r.atalho.replace(/^\//, '').trim().toLowerCase(), titulo: r.titulo.trim(), texto: r.texto.trim() }
      respostas = r.id ? respostas.map((x) => (x.id === r.id ? { ...x, ...limpa } : x)) : [...respostas, { id: `r${Date.now()}`, ...limpa }]
    },
    async apagarResposta(id) { respostas = respostas.filter((r) => r.id !== id) },
    async modelos() { return modelos },
    async ficha(contatoId) { await espera(120); return fichas[contatoId] ?? { cliente: null, lead: null } },
    async equipe() { return [{ id: euId, nome: 'Você' }, { id: 'naor', nome: 'Naor' }, { id: 'saymonn', nome: 'Saymonn' }] },
    async parceiros() { return [{ codigo: 'n', nome: 'Naor' }, { codigo: 'v', nome: 'Victor' }, { codigo: 'd', nome: 'Douglas' }] },
    async abrirArquivo(m) { if (m.exemplo && m.exemplo !== 'audio') return m.exemplo; throw new Error('exemplo') },
    acompanhar(aoMudar, aoEstado) { ouvintes.add(aoMudar); aoEstado?.(true); return () => { ouvintes.delete(aoMudar) } },
  }
}
