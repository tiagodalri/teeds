/**
 * Estúdio de anúncios (03/11/2026): subir anúncios, testes A/B e ajustes do que está rodando,
 * sem abrir o Gerenciador. Fala com a função meta-estudio (a mesma chave do painel) e guarda os
 * rascunhos e o histórico no banco (supabase/migracoes/20261103120000_estudio_de_anuncios.sql).
 */
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

export type TipoMidia = 'imagem' | 'video'
/** O arquivo já na biblioteca da conta (hash da imagem ou id do vídeo) e o que a prévia precisa. */
export interface Midia {
  tipo: TipoMidia; nome: string; largura: number; altura: number; duracao?: number; tamanho: number
  hash?: string; videoId?: string; posterHash?: string
  /** quadro pequeno (JPEG em data:) para a prévia e para a lista de rascunhos */
  poster?: string
  /** só nesta sessão: o endereço local do arquivo, para a prévia tocar o vídeo */
  local?: string
}
export interface Texto { principal: string; titulo: string; descricao: string; botao: string }
export interface Publico { modo: 'padrao' | 'personalizado'; idadeMin: number; idadeMax: number; genero: 'todos' | 'homens' | 'mulheres' }
export type Variavel = 'criativo' | 'texto' | 'publico'
export interface DadosDoRascunho {
  nomeAnuncio: string; midia?: Midia; midiaB?: Midia; texto: Texto; textoB?: Texto; link: string
  destino: { campanha: string; nomeCampanha: string; conjunto: string; nomeConjunto: string }
  publico: Publico; publicoB?: Publico; diario: number
  teste?: { variavel: Variavel; dias: number }
}
export type Situacao = 'rascunho' | 'criando' | 'pausado' | 'ligado' | 'erro'
export interface Progresso {
  campanhaId?: string; campanhaNova?: boolean; conjuntoId?: string; conjuntoNovo?: boolean; conjuntoB?: string
  criativoId?: string; criativoB?: string; anuncioId?: string; anuncioB?: string
  estudoId?: string; testeSimples?: boolean; vencedor?: 'a' | 'b'; avisos?: string[]
}
export interface Rascunho {
  id: string; tipo: 'novo' | 'teste'; nome: string; dados: DadosDoRascunho; situacao: Situacao
  progresso: Progresso; erro: string | null; criadoEm: string; atualizadoEm: string
}
export interface ContextoDoEstudio {
  semChave?: boolean; conta: string; maxDia: number; link: string
  pagina: { id: string; nome: string; foto: string | null }
  instagram: { id: string; usuario: string; foto: string | null }
  campanhas: Array<{ id: string; nome: string; status: string; orcDia: number }>
  conjuntos: Array<{ id: string; nome: string; status: string; campanhaId: string; orcDia: number; publico: string }>
}
export interface ItemDoHistorico { id: number; quem: string; acao: string; alvoTipo: string; alvoId: string; alvoNome: string; detalhe: Record<string, unknown>; em: string }
export type RespostaDeCriar = { situacao: Situacao; progresso: Progresso; aguardando?: 'video' }

export const BOTOES: Array<{ id: string; nome: string }> = [
  { id: 'SIGN_UP', nome: 'Cadastre-se' }, { id: 'LEARN_MORE', nome: 'Saiba mais' }, { id: 'APPLY_NOW', nome: 'Inscreva-se' },
  { id: 'WATCH_MORE', nome: 'Assistir' }, { id: 'SUBSCRIBE', nome: 'Assinar' },
]
export const PUBLICO_PADRAO: Publico = { modo: 'padrao', idadeMin: 18, idadeMax: 65, genero: 'todos' }

async function funcao<T>(sessao: SessaoTeeds, corpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/functions/v1/meta-estudio`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ marca: MARCA.id, ...corpo }),
  })
  const d = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(String(d?.erro || `Não consegui falar com a Meta agora (${r.status}).`))
  return d as T
}
async function rpc<T>(sessao: SessaoTeeds, nome: string, corpo: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(String(e?.message || `Não consegui falar com o banco agora (${r.status}).`)) }
  return r.json() as Promise<T>
}

const paraBase64 = (b: Blob) => new Promise<string>((ok, falha) => {
  const f = new FileReader()
  f.onload = () => ok(String(f.result).split(',')[1] ?? '')
  f.onerror = () => falha(new Error('Não consegui ler o arquivo.'))
  f.readAsDataURL(b)
})

/** O que a tela usa; o laboratório troca por uma versão de mentira, sem a Meta. */
export interface ApiEstudio {
  contexto: (s: SessaoTeeds, parceiro: string) => Promise<ContextoDoEstudio>
  rascunhos: (s: SessaoTeeds, parceiro: string) => Promise<Rascunho[]>
  salvar: (s: SessaoTeeds, parceiro: string, id: string | null, tipo: 'novo' | 'teste', nome: string, dados: DadosDoRascunho) => Promise<string>
  arquivar: (s: SessaoTeeds, id: string) => Promise<unknown>
  historico: (s: SessaoTeeds, parceiro: string) => Promise<ItemDoHistorico[]>
  subirImagem: (s: SessaoTeeds, parceiro: string, arquivo: Blob, nome: string) => Promise<{ hash: string }>
  subirVideo: (s: SessaoTeeds, parceiro: string, arquivo: File, andamento: (fracao: number) => void) => Promise<{ videoId: string }>
  estadoVideo: (s: SessaoTeeds, parceiro: string, videoId: string) => Promise<{ estado: string; progresso: number }>
  criar: (s: SessaoTeeds, parceiro: string, id: string) => Promise<RespostaDeCriar>
  ligar: (s: SessaoTeeds, parceiro: string, id: string) => Promise<RespostaDeCriar>
  vencedor: (s: SessaoTeeds, parceiro: string, id: string, vencedor: 'a' | 'b') => Promise<RespostaDeCriar>
  status: (s: SessaoTeeds, parceiro: string, tipo: 'campanha' | 'conjunto' | 'anuncio', id: string, ligar: boolean, cascata?: boolean) => Promise<unknown>
  orcamento: (s: SessaoTeeds, parceiro: string, conjuntoId: string, diario: number) => Promise<unknown>
  escalar: (s: SessaoTeeds, parceiro: string, conjuntoId: string, aumento: number) => Promise<{ conjuntoId: string; diario: number }>
}

export const API_DO_ESTUDIO: ApiEstudio = {
  contexto: (s, parceiro) => funcao(s, { acao: 'contexto', parceiro }),
  rascunhos: (s, parceiro) => rpc(s, 'teeds_estudio_rascunhos', { p_marca: MARCA.id, p_parceiro: parceiro }),
  salvar: (s, parceiro, id, tipo, nome, dados) => {
    // o endereço local do arquivo só vale nesta aba: não vai para o banco
    const limpo = JSON.parse(JSON.stringify(dados, (k, v) => (k === 'local' ? undefined : v)))
    return rpc(s, 'teeds_estudio_salvar', { p_marca: MARCA.id, p_parceiro: parceiro, p_id: id, p_tipo: tipo, p_nome: nome, p_dados: limpo })
  },
  arquivar: (s, id) => rpc(s, 'teeds_estudio_arquivar', { p_marca: MARCA.id, p_id: id }),
  historico: (s, parceiro) => rpc(s, 'teeds_estudio_historico', { p_marca: MARCA.id, p_parceiro: parceiro, p_limite: 120 }),
  subirImagem: async (s, parceiro, arquivo, nome) => funcao(s, { acao: 'imagem', parceiro, base64: await paraBase64(arquivo), nome }),
  // o vídeo vai em partes, do tamanho que a própria Meta pede a cada volta
  subirVideo: async (s, parceiro, arquivo, andamento) => {
    const ini = await funcao<{ sessao: string; videoId: string; de: number; ate: number }>(s, { acao: 'video_inicio', parceiro, tamanho: arquivo.size, nome: arquivo.name })
    let de = ini.de, ate = ini.ate
    andamento(0)
    while (de < ate) {
      const r = await funcao<{ de: number; ate: number }>(s, { acao: 'video_parte', parceiro, sessao: ini.sessao, de, base64: await paraBase64(arquivo.slice(de, ate)) })
      de = r.de; ate = r.ate
      andamento(Math.min(1, de / arquivo.size))
    }
    await funcao(s, { acao: 'video_fim', parceiro, sessao: ini.sessao, nome: arquivo.name })
    andamento(1)
    return { videoId: ini.videoId }
  },
  estadoVideo: (s, parceiro, videoId) => funcao(s, { acao: 'video_estado', parceiro, videoId }),
  criar: (s, parceiro, id) => funcao(s, { acao: 'criar', parceiro, id }),
  ligar: (s, parceiro, id) => funcao(s, { acao: 'ligar', parceiro, id }),
  vencedor: (s, parceiro, id, vencedor) => funcao(s, { acao: 'vencedor', parceiro, id, vencedor }),
  status: (s, parceiro, tipo, id, ligar, cascata) => funcao(s, { acao: 'status', parceiro, tipo, id, ligar, cascata: !!cascata }),
  orcamento: (s, parceiro, conjuntoId, diario) => funcao(s, { acao: 'orcamento', parceiro, conjuntoId, diario }),
  escalar: (s, parceiro, conjuntoId, aumento) => funcao(s, { acao: 'escalar', parceiro, conjuntoId, aumento }),
}

/* ------------------------------------------------------------------ o semáforo do texto */

export type Cor = 'vermelho' | 'amarelo' | 'azul'
export interface Sinal { cor: Cor; trecho: string; motivo: string }

// bordas de palavra que entendem acento (o \b do JavaScript não entende "robô")
const palavra = (miolo: string) => new RegExp(`(?<!\\p{L})(?:${miolo})(?!\\p{L})`, 'giu')
/** Vermelho: a marca não usa (a função meta-estudio barra as mesmas). */
const VERMELHO: Array<[RegExp, string]> = [
  [palavra('apost\\p{L}*'), 'A GlobalFly não fala em aposta.'], // texto-ok: é a lista que barra essas palavras no anúncio
  [palavra('sorte'), 'Nada de sorte: é estratégia.'], // texto-ok: é a lista que barra essas palavras no anúncio
  [palavra('chut(?:e|ar|ando)'), 'Nada de chute: é estratégia.'], // texto-ok: é a lista que barra essas palavras no anúncio
  [palavra('jog(?:ar|o|ue|ando|ada)'), 'Evite "jogar": passa ideia de aposta.'], // texto-ok: é a lista que barra essas palavras no anúncio
  [palavra('rob[ôo]s?'), 'Na GlobalFly a palavra é "I.A.".'],
  [palavra('(?:lucro|ganho|retorno|renda)s? garantid[oa]s?|garantia de (?:lucro|ganho|retorno)'), 'Promessa de lucro garantido: a Meta reprova e a marca não promete.'],
  [palavra('(?:I\\.?A\\.?|intelig[êe]ncia artificial)[^.!?\\n]{0,40}(?<!\\p{L})(?:aprende|prev[êe]|acerta|garante)'), 'A I.A. não aprende, prevê, acerta nem garante: ela opera uma estratégia.'],
]
/** Amarelo: a Meta costuma reprovar em anúncio de mercado financeiro. */
const AMARELO: Array<[RegExp, string]> = [
  [palavra('\\d+(?:[.,]\\d+)?\\s?%\\s?(?:ao|por|de lucro|no) (?:dia|mês|mes|semana)'), 'Porcentagem de retorno por período costuma ser reprovada.'],
  [palavra('R\\$\\s?\\d[\\d.,]*\\s?(?:por|ao|todo) (?:dia|mês|mes|semana)'), 'Valor de ganho por período costuma ser reprovado.'],
  [palavra('dinheiro f[áa]cil|fique rico|ficar rico|milion[áa]ri[oa]s?|renda extra garantida|sem risco|nunca perde|não perde nunca|independ[êe]ncia financeira'), 'Promessa de enriquecimento: a Meta costuma reprovar.'],
  [palavra('voc[êe] (?:est[áa]|é) (?:endividad[oa]|desempregad[oa]|quebrad[oa]|pobre|sem dinheiro)'), 'A Meta não deixa apontar a situação da pessoa ("você está…").'],
  [palavra('dep[óo]sit\\p{L}*'), 'Falar de depósito pede o link da Deriv: deixe para dentro da plataforma.'],
]

export function sinaisDoTexto(t: Partial<Texto>): Sinal[] {
  const tudo = [t.principal, t.titulo, t.descricao].filter(Boolean).join('\n')
  const sinais: Sinal[] = []
  const achar = (lista: Array<[RegExp, string]>, cor: Cor) => {
    for (const [re, motivo] of lista) for (const m of tudo.matchAll(re)) sinais.push({ cor, trecho: m[0].trim(), motivo })
  }
  achar(VERMELHO, 'vermelho'); achar(AMARELO, 'amarelo')
  // azul: só aviso de leitura
  if ((t.principal ?? '').length > 125) sinais.push({ cor: 'azul', trecho: 'texto principal', motivo: `Depois de 125 letras o feed mostra "… mais". Você tem ${t.principal!.length}: o começo precisa prender.` })
  if ((t.titulo ?? '').length > 40) sinais.push({ cor: 'azul', trecho: 'título', motivo: `Títulos acima de 40 letras são cortados em alguns lugares (${t.titulo!.length}).` })
  const maiusculas = (t.principal ?? '').replace(/[^\p{L}]/gu, '')
  if (maiusculas.length > 30 && maiusculas.replace(/[^\p{Lu}]/gu, '').length / maiusculas.length > 0.5) sinais.push({ cor: 'azul', trecho: 'caixa alta', motivo: 'Texto quase todo em maiúsculas passa a impressão de grito e a Meta entrega menos.' })
  return sinais
}

/** A conta da certeza de um teste A/B: cadastros por real gasto, A contra B (comparação de taxas de Poisson). */
export function certezaDoTeste(a: { gasto: number; cadastros: number }, b: { gasto: number; cadastros: number }) {
  if (a.gasto <= 0 || b.gasto <= 0) return { lider: null as null | 'a' | 'b', certeza: 0, diferenca: 0, faltam: 20 }
  const ra = a.cadastros / a.gasto, rb = b.cadastros / b.gasto
  const erro = Math.sqrt(a.cadastros / (a.gasto * a.gasto) + b.cadastros / (b.gasto * b.gasto)) || 1e9
  const z = Math.abs(ra - rb) / erro
  // Φ(z) pela aproximação de Abramowitz–Stegun
  const t = 1 / (1 + 0.2316419 * z), dz = Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI)
  const fi = 1 - dz * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const lider: 'a' | 'b' | null = ra === rb ? null : ra > rb ? 'a' : 'b'
  const custoA = a.cadastros ? a.gasto / a.cadastros : Infinity, custoB = b.cadastros ? b.gasto / b.cadastros : Infinity
  const diferenca = Number.isFinite(custoA) && Number.isFinite(custoB) ? Math.abs(custoA - custoB) / Math.max(custoA, custoB) : 1
  // quantos cadastros ainda faltam (pelos dois lados) para chegar a 90% de certeza, mantendo o ritmo
  const faltam = z >= 1.2816 ? 0 : Math.max(5, Math.ceil((a.cadastros + b.cadastros) * ((1.2816 / Math.max(z, 0.2)) ** 2 - 1)))
  // certeza = chance de o líder ser mesmo o melhor (50% = empate, cara ou coroa)
  return { lider, certeza: lider ? fi : 0.5, diferenca, faltam }
}
