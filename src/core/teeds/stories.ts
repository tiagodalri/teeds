/**
 * Stories (08/11/2026, Tiago: "sabe quando abrimos o insta, e tem as bolinhas
 * la em cima de stories... nesse mesmo estilo").
 *
 * O cliente nunca lê as tabelas: as funções do banco decidem quem vê cada
 * story (plano, parceiro, só admins) e gravam o que a pessoa fez nele
 * (supabase/migracoes/20261109000000_stories.sql). Os arquivos ficam no
 * bucket público `stories`, na pasta da marca.
 *
 * Vídeo: o painel converte no próprio navegador para 1080p H.264 antes de
 * enviar (Mediabunny, WebCodecs), para o .MOV do iPhone tocar em qualquer
 * aparelho e pesar ~3 MB a cada 15 s. Nada roda no servidor das I.A.
 */

import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import type { Camada } from './camadas'

export type BotaoTipo = 'aula' | 'ia' | 'deposito' | 'aovivo' | 'gerenciamento' | 'marketplace' | 'link'
/** mudo: o estúdio tirou o som do vídeo (09/11/2026). */
export interface Enquadramento { zoom?: number; x?: number; y?: number; mudo?: boolean }
export interface Publico { todos?: boolean; subplanos?: string[]; parceiros?: string[]; so_admins?: boolean }

export interface Story {
  id: string
  codigo: string
  tipo: 'video' | 'imagem'
  midia: string
  capa: string | null
  duracao: number
  enquadramento: Enquadramento
  chip: string | null
  titulo: string | null
  subtitulo: string | null
  quando: string
  destaque: boolean
  compartilhar: boolean
  responder: boolean
  visto: boolean
  reacao: string | null
  botao: { tipo: BotaoTipo; texto: string | null; destino: string | null } | null
  /** Só chega para a equipe (para mostrar no visualizador quem vê). */
  publico?: Publico | null
  /** O que o estúdio desenhou por cima (texto, figurinhas, desenho). */
  camadas: Camada[]
  /** A enquete: contagem por opção (depois de votar) e o voto desta pessoa. */
  votos: Record<string, number> | null
  meuVoto: number | null
}

export interface PerfilDeStories {
  id: string
  nome: string
  foto: string | null
  oficial: boolean
  ordem: number
  parceiro: string | null
  itens: Story[]
}

const cab = (token?: string) => ({
  apikey: SUPABASE.anonKey,
  Authorization: `Bearer ${token ?? SUPABASE.anonKey}`,
  'Content-Type': 'application/json',
})

async function rpc<T>(nome: string, corpo: unknown, token?: string): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, { method: 'POST', headers: cab(token), body: JSON.stringify(corpo) })
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    throw new Error(j?.message || `Erro ${r.status}`)
  }
  if (r.status === 204) return undefined as T
  return (await r.json().catch(() => undefined)) as T
}

/** A foto do perfil: caminho do site (/parceiros/v.webp) ou URL completa. */
export const fotoDoPerfil = (foto: string | null | undefined): string | null =>
  !foto ? null : /^https?:/.test(foto) ? foto : `${import.meta.env.BASE_URL.replace(/\/$/, '')}${foto}`

/** O monograma vira foto com fundo (o arquivo é transparente). */
export const ehMonograma = (foto: string | null | undefined) => !!foto && /monograma|globalfly-gf/.test(foto)

/* ------------------------------------------------------------ o cliente */

export async function storiesDoCliente(sessao: SessaoTeeds): Promise<PerfilDeStories[]> {
  const l = await rpc<any[]>('teeds_stories_do_cliente', { p_marca: MARCA.id }, sessao.token)
  return (l ?? []).map((p) => ({
    id: p.id, nome: p.nome, foto: p.foto ?? null, oficial: !!p.oficial, ordem: p.ordem ?? 100, parceiro: p.parceiro ?? null,
    itens: (p.itens ?? []).map((s: any): Story => ({
      id: s.id, codigo: s.codigo, tipo: s.tipo, midia: s.midia, capa: s.capa ?? null, duracao: Number(s.duracao) || 6,
      enquadramento: s.enquadramento ?? {}, chip: s.chip ?? null, titulo: s.titulo ?? null, subtitulo: s.subtitulo ?? null,
      quando: s.quando, destaque: !!s.destaque, compartilhar: s.compartilhar !== false, responder: s.responder !== false,
      visto: !!s.visto, reacao: s.reacao ?? null, botao: s.botao ?? null, publico: s.publico ?? null,
      camadas: Array.isArray(s.camadas) ? s.camadas : [], votos: s.votos ?? null, meuVoto: s.meu_voto ?? null,
    })),
  }))
}

export type TipoDeEvento = 'visto' | 'progresso' | 'voto' | 'avancou' | 'voltou' | 'saiu' | 'pulou' | 'pausou' | 'clique' | 'reacao' | 'resposta' | 'compartilhou'

/** Grava o que a pessoa fez. Nunca atrapalha quem está assistindo: falha em silêncio. */
export function registrar(sessao: SessaoTeeds | null, story: string, tipo: TipoDeEvento, valor?: string | null, segundos?: number) {
  if (!sessao) return Promise.resolve()
  return rpc('teeds_story_evento', { p_story: story, p_tipo: tipo, p_valor: valor ?? null, p_segundos: segundos ?? null }, sessao.token)
    .catch(() => undefined)
}

/* ---------------------------------------------------- o link público */

export interface StoryPublico {
  id: string; codigo: string; marca: string; tipo: 'video' | 'imagem'; midia: string; capa: string | null; duracao: number
  enquadramento: Enquadramento; chip: string | null; titulo: string | null; subtitulo: string | null; quando: string
  camadas?: Camada[]
  perfil: { nome: string; foto: string | null; oficial: boolean; parceiro: string | null }
}
export const storyPublico = (codigo: string) => rpc<StoryPublico | null>('teeds_story_publico', { p_codigo: codigo })

/** O endereço de compartilhar: com a vitrine de quem compartilha (/n, /v), para o cadastro ir para o parceiro certo. */
export function linkDoStory(codigo: string, parceiro: string): string {
  const base = location.origin.replace(/\/$/, '')
  return `${base}${parceiro ? `/${parceiro}` : ''}/s/${codigo}`
}

/* -------------------------------------------------------------- o painel */

export interface LinhaDoPainel {
  story: {
    id: string; codigo: string; perfil_id: string; tipo: 'video' | 'imagem'; midia_url: string; midia_caminho: string | null
    capa_url: string | null; duracao: number; enquadramento: Enquadramento; chip: string | null; titulo: string | null
    subtitulo: string | null; botao_tipo: BotaoTipo | null; botao_texto: string | null; botao_destino: string | null
    publico: Publico; inicia_em: string; expira_em: string | null; destaque: boolean; compartilhar: boolean; responder: boolean
    camadas?: Camada[]
    status: 'publicado' | 'arquivado'; avisado_em: string | null; criado_por: string | null; criado_por_nome: string | null; criado_em: string
  }
  perfil: { id: string; nome: string; foto: string | null; oficial: boolean; parceiro: string | null }
  vistas: number
  pessoas: number
  completos: number
}

export type SituacaoDoStory = 'no-ar' | 'agendado' | 'destaque' | 'encerrado'
export function situacao(l: LinhaDoPainel['story']): SituacaoDoStory {
  const agora = Date.now()
  if (l.status === 'arquivado') return 'encerrado'
  if (Date.parse(l.inicia_em) > agora) return 'agendado'
  if (l.destaque && !l.expira_em) return 'destaque'
  if (l.expira_em && Date.parse(l.expira_em) <= agora) return 'encerrado'
  return 'no-ar'
}

export const painelDeStories = (sessao: SessaoTeeds) => rpc<LinhaDoPainel[]>('teeds_stories_painel', { p_marca: MARCA.id }, sessao.token)

export interface PerfilDoPainel { id: string; nome: string; foto_url: string | null; parceiro: string | null; oficial: boolean; ordem: number; ativo: boolean }
export async function perfisDoPainel(sessao: SessaoTeeds): Promise<PerfilDoPainel[]> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/stories_perfis?marca=eq.${MARCA.id}&ativo=eq.true&order=ordem,nome`, { headers: cab(sessao.token) })
  return r.ok ? r.json() : []
}
export const salvarPerfil = (sessao: SessaoTeeds, p: Partial<PerfilDoPainel> & { nome: string }) =>
  rpc<PerfilDoPainel>('teeds_story_perfil_salvar', { p: { ...p, marca: MARCA.id } }, sessao.token)

export const alcanceDoPublico = (sessao: SessaoTeeds, publico: Publico) =>
  rpc<number>('teeds_stories_alcance', { p_marca: MARCA.id, p_publico: publico }, sessao.token)

export interface NovoStory {
  id?: string
  perfil_id: string
  tipo: 'video' | 'imagem'
  midia_url: string
  midia_caminho: string | null
  capa_url: string | null
  duracao: number
  enquadramento: Enquadramento
  chip: string
  titulo: string
  subtitulo: string
  botao_tipo: BotaoTipo | ''
  botao_texto: string
  botao_destino: string
  publico: Publico
  inicia_em: string | null
  expira_em: string | null
  destaque: boolean
  compartilhar: boolean
  responder: boolean
  camadas?: Camada[]
}
export const salvarStory = (sessao: SessaoTeeds, s: NovoStory) =>
  rpc<LinhaDoPainel['story']>('teeds_story_salvar', { p: { ...s, marca: MARCA.id } }, sessao.token)

export async function removerStory(sessao: SessaoTeeds, id: string, apagar: boolean) {
  const caminho = await rpc<string | null>('teeds_story_remover', { p_id: id, p_apagar: apagar }, sessao.token)
  if (apagar && caminho) {
    const pastas = [caminho, caminho.replace(/\.[a-z0-9]+$/i, '-capa.jpg')]
    await fetch(`${SUPABASE.url}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE', headers: cab(sessao.token), body: JSON.stringify({ prefixes: pastas }),
    }).catch(() => undefined)
  }
}

export interface Metricas {
  vistas: number; pessoas: number; completos: number; publico: number
  cliques: number; pessoas_clique: number; compartilhamentos: number; visitas_link: number; cadastros_link: number
  respostas: number; reacoes: Record<string, number>
  navegacao: { avancou: number; voltou: number; saiu: number; pulou: number; pausou: number }
  retencao: number[]
  por_subplano: Record<string, number>
  por_parceiro: Record<string, number>
  por_hora: Array<{ hora: string; n: number }>
  quem: Array<{ user_id: string; nome: string | null; email: string; parceiro: string; subplano: string; segundos: number; completo: boolean; vezes: number; reacao: string | null; quando: string; clicou: boolean; compartilhou: boolean }>
  ultimas_respostas: Array<{ nome: string | null; texto: string; quando: string }>
}
export const metricasDoStory = (sessao: SessaoTeeds, id: string) => rpc<Metricas>('teeds_story_metricas', { p_story: id }, sessao.token)
/** O resultado da enquete e os cliques por figurinha de link (09/11/2026). Sem a migração nova, vem vazio. */
export const metricasExtras = (sessao: SessaoTeeds, id: string) =>
  rpc<{ votos: Record<string, number>; cliques_por: Record<string, number> }>('teeds_story_metricas_extra', { p_story: id }, sessao.token)
    .catch(() => ({ votos: {}, cliques_por: {} }))

/** Avisa no celular pelo painel de notificações que já existe (só quem tem acesso pleno dispara). */
export async function avisarNoCelular(sessao: SessaoTeeds, storyId: string, titulo: string, corpo: string, parceiro: string | null) {
  const r = await fetch(`${SUPABASE.url}/functions/v1/notificacoes`, {
    method: 'POST', headers: cab(sessao.token),
    body: JSON.stringify({ acao: 'disparo', marca: MARCA.id, titulo, corpo, destino: 'inicio', publico: 'ativos', parceiro }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro || 'O aviso no celular não foi enviado.')
  await rpc('teeds_story_avisado', { p_id: storyId }, sessao.token).catch(() => undefined)
  return (j.enviados ?? 0) as number
}

/* -------------------------------------------------------------- arquivos */

const BUCKET = 'stories'
export const LIMITE_SEGUNDOS = 60
const urlPublica = (caminho: string) => `${SUPABASE.url}/storage/v1/object/public/${BUCKET}/${caminho.split('/').map(encodeURIComponent).join('/')}`

/** Envia um arquivo ao bucket com barra de progresso. */
export function enviarArquivo(sessao: SessaoTeeds, caminho: string, arquivo: Blob, tipo: string, aoProgredir?: (f: number) => void) {
  const xhr = new XMLHttpRequest()
  const promessa = new Promise<string>((resolver, rejeitar) => {
    xhr.open('POST', `${SUPABASE.url}/storage/v1/object/${BUCKET}/${caminho.split('/').map(encodeURIComponent).join('/')}`)
    xhr.setRequestHeader('apikey', SUPABASE.anonKey)
    xhr.setRequestHeader('Authorization', `Bearer ${sessao.token}`)
    xhr.setRequestHeader('Content-Type', tipo)
    xhr.setRequestHeader('x-upsert', 'true')
    xhr.setRequestHeader('cache-control', 'max-age=31536000')
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) aoProgredir?.(e.loaded / e.total) }
    xhr.onerror = () => rejeitar(new Error('A conexão caiu no meio do envio. Tente de novo.'))
    xhr.onabort = () => rejeitar(new Error('Envio cancelado.'))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolver(urlPublica(caminho))
      let recado = `Erro ${xhr.status} ao enviar`
      try { recado = JSON.parse(xhr.responseText)?.message || recado } catch { /* sem detalhe */ }
      if (xhr.status === 413) recado = 'O arquivo passou de 100 MB. Mande um vídeo mais curto.'
      if (xhr.status === 403) recado = 'Sem permissão para enviar: só a equipe da plataforma publica stories.'
      rejeitar(new Error(recado))
    }
    xhr.send(arquivo)
  })
  return { promessa, cancelar: () => xhr.abort() }
}

export interface MidiaPronta {
  tipo: 'video' | 'imagem'
  arquivo: Blob
  mime: string
  duracao: number
  largura: number
  altura: number
  capa: Blob | null
  /** Foi convertido no navegador (false = vai o original). */
  convertido: boolean
  cortado: boolean
}

/** Lê duração e tamanho de um vídeo pelo próprio navegador. */
function lerVideo(url: string): Promise<{ duracao: number; largura: number; altura: number; video: HTMLVideoElement }> {
  return new Promise((resolver, rejeitar) => {
    const v = document.createElement('video')
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'
    v.onloadedmetadata = () => resolver({ duracao: v.duration, largura: v.videoWidth, altura: v.videoHeight, video: v })
    v.onerror = () => rejeitar(new Error('Este vídeo não abre neste navegador.'))
    v.src = url
  })
}

/** O quadro do meio segundo vira a capa (JPEG). */
async function capaDoVideo(blob: Blob): Promise<Blob | null> {
  const url = URL.createObjectURL(blob)
  try {
    const { video, largura, altura } = await lerVideo(url)
    await new Promise<void>((ok) => { video.onseeked = () => ok(); video.currentTime = Math.min(0.5, (video.duration || 1) / 2) })
    const escala = Math.min(1, 1080 / Math.max(1, Math.min(largura, altura)))
    const c = document.createElement('canvas')
    c.width = Math.round(largura * escala); c.height = Math.round(altura * escala)
    c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height)
    return await new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', 0.82))
  } catch { return null } finally { URL.revokeObjectURL(url) }
}

/** Foto: reduz para no máximo 1080 de lado curto, JPEG. HEIC do iPhone vira JPEG antes. */
async function prepararImagem(arquivo: File): Promise<MidiaPronta> {
  let fonte: Blob = arquivo
  if (/heic|heif/i.test(arquivo.type) || /\.hei[cf]$/i.test(arquivo.name)) {
    const heic2any = (await import('heic2any')).default
    fonte = (await heic2any({ blob: arquivo, toType: 'image/jpeg', quality: 0.9 })) as Blob
  }
  const bmp = await createImageBitmap(fonte)
  const escala = Math.min(1, 1080 / Math.min(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  const jpg = await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui ler a foto.'))), 'image/jpeg', 0.92))
  return { tipo: 'imagem', arquivo: jpg, mime: 'image/jpeg', duracao: 6, largura: c.width, altura: c.height, capa: null, convertido: true, cortado: false }
}

/**
 * Prepara o arquivo escolhido: foto vira JPEG; vídeo vira MP4 1080p (lado curto)
 * com no máximo 60 s. Sem WebCodecs (navegador antigo), vai o original.
 */
export async function prepararMidia(arquivo: File, aoProgredir?: (f: number) => void): Promise<MidiaPronta> {
  const ehImagem = arquivo.type.startsWith('image/') || /\.(hei[cf]|jpe?g|png|webp)$/i.test(arquivo.name)
  if (ehImagem) return prepararImagem(arquivo)

  const url = URL.createObjectURL(arquivo)
  let meta: { duracao: number; largura: number; altura: number } | null = null
  try { meta = await lerVideo(url) } catch { /* o Mediabunny ainda pode ler */ } finally { URL.revokeObjectURL(url) }

  try {
    const mb = await import('mediabunny')
    if (!(await mb.canEncodeVideo('avc'))) throw new Error('sem codificador')
    const input = new mb.Input({ source: new mb.BlobSource(arquivo), formats: mb.ALL_FORMATS })
    const total = await input.computeDuration()
    const trilha = await input.getPrimaryVideoTrack()
    if (!trilha) throw new Error('Este arquivo não tem vídeo.')
    const lw = trilha.displayWidth, la = trilha.displayHeight
    const curto = Math.min(lw, la)
    // 1080 no lado curto (09/11/2026, Tiago: "sem perder a qualidade da câmera do iPhone"): o tamanho do story no Instagram
    const escala = curto > 1080 ? 1080 / curto : 1
    // múltiplo de 2: o H.264 não aceita lado ímpar
    const par = (n: number) => Math.max(2, Math.round(n / 2) * 2)
    const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target: new mb.BufferTarget() })
    const cortado = total > LIMITE_SEGUNDOS + 0.5
    const conv = await mb.Conversion.init({
      input, output,
      video: { width: par(lw * escala), height: par(la * escala), fit: 'fill', codec: 'avc', bitrate: mb.QUALITY_HIGH, frameRate: 30, forceTranscode: true },
      audio: { codec: 'aac', bitrate: 128_000 },
      ...(cortado ? { trim: { start: 0, end: LIMITE_SEGUNDOS } } : {}),
    })
    if (!conv.isValid) throw new Error('formato')
    conv.onProgress = (p) => aoProgredir?.(p)
    await conv.execute()
    const buf = (output.target as InstanceType<typeof mb.BufferTarget>).buffer
    if (!buf) throw new Error('vazio')
    const mp4 = new Blob([buf], { type: 'video/mp4' })
    return {
      tipo: 'video', arquivo: mp4, mime: 'video/mp4', duracao: Math.min(total, LIMITE_SEGUNDOS),
      largura: par(lw * escala), altura: par(la * escala), capa: await capaDoVideo(mp4), convertido: true, cortado,
    }
  } catch (e) {
    if ((e as Error).message === 'Este arquivo não tem vídeo.') throw e
    // sem conversão: o original, se o navegador consegue ler e cabe no limite
    if (!meta) throw new Error('Não consegui abrir este vídeo. Mande em MP4 ou MOV.')
    if (arquivo.size > 100 * 1024 * 1024) throw new Error('Este navegador não converte vídeo e o arquivo passou de 100 MB. Tente pelo Chrome no computador.')
    return {
      tipo: 'video', arquivo, mime: arquivo.type || 'video/mp4', duracao: Math.min(meta.duracao, LIMITE_SEGUNDOS),
      largura: meta.largura, altura: meta.altura, capa: await capaDoVideo(arquivo), convertido: false, cortado: meta.duracao > LIMITE_SEGUNDOS + 0.5,
    }
  }
}

/** Sobe a mídia pronta (e a capa) e devolve as URLs. */
export function enviarMidia(sessao: SessaoTeeds, m: MidiaPronta, aoProgredir?: (f: number) => void) {
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
  const ext = m.tipo === 'imagem' ? 'jpg' : m.mime.includes('quicktime') ? 'mov' : m.mime.includes('webm') ? 'webm' : 'mp4'
  const caminho = `${MARCA.id}/${id}.${ext}`
  const envio = enviarArquivo(sessao, caminho, m.arquivo, m.mime, aoProgredir)
  const promessa = (async () => {
    const url = await envio.promessa
    let capa: string | null = m.tipo === 'imagem' ? url : null
    if (m.capa) capa = await enviarArquivo(sessao, caminho.replace(/\.[a-z0-9]+$/, '-capa.jpg'), m.capa, 'image/jpeg').promessa.catch(() => null)
    return { url, caminho, capa }
  })()
  return { promessa, cancelar: envio.cancelar }
}

/* ------------------------------------------------------------- apoio */

/** "agora", "há 5 min", "há 3 h", "há 2 d" */
export function haQuanto(iso: string): string {
  const t = Date.parse(iso)
  if (!isFinite(t)) return 'agora'
  const m = Math.max(0, Math.round((Date.now() - t) / 60000))
  return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.floor(m / 60)} h` : `há ${Math.floor(m / 1440)} d`
}

export const REACOES = ['🔥', '👏', '✈️', '💛'] as const

/** O texto do botão quando o admin não escreve um. */
export const BOTAO_PADRAO: Record<BotaoTipo, string> = {
  aula: 'Ver aula', ia: 'Ligar I.A.', deposito: 'Depositar na Deriv', aovivo: 'Entrar na live',
  gerenciamento: 'Abrir gerenciamento', marketplace: 'Conhecer os planos', link: 'Saiba mais',
}

/** O painel pede para abrir a aba Stories da Administração (a bolinha "Publicar" da Início). */
export const ABA_PEDIDA = 'adm.aba-pedida'
const STORY_PEDIDO = 'adm.story-pedido'
/** storyId: abre direto nas métricas dele (o "Ver métricas" do visualizador). */
export function pedirAbaStories(storyId?: string) {
  try { sessionStorage.setItem(ABA_PEDIDA, 'stories'); if (storyId) sessionStorage.setItem(STORY_PEDIDO, storyId) } catch { /* sem armazenamento */ }
}
export function storyPedido(): string | null {
  try { const a = sessionStorage.getItem(STORY_PEDIDO); sessionStorage.removeItem(STORY_PEDIDO); return a } catch { return null }
}
export function abaPedida(): string | null {
  try { const a = sessionStorage.getItem(ABA_PEDIDA); sessionStorage.removeItem(ABA_PEDIDA); return a } catch { return null }
}

/** Avisa a Início que os stories mudaram (o admin publicou): a fileira lê de novo. */
export const EVENTO_STORIES = 'stories:mudou'
