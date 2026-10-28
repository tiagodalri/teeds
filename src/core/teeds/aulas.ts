/**
 * O catalogo de aulas da Teeds — a "sala de aula" da plataforma.
 *
 * ESTE E O UNICO ARQUIVO PARA MEXER quando os videos chegarem: cole o
 * link em `video` (YouTube, Vimeo ou .mp4 direto) e preencha `duracao`.
 * Aula sem video aparece como "em breve" — o cartao existe, mas nao abre
 * player.
 *
 * A ordem aqui e a ordem na tela. A numeracao ("Aula 1", "Aula 2"...) e
 * continua atraves dos modulos, calculada sozinha.
 */

export interface Aula {
  id: string
  titulo: string
  descricao: string
  /** YouTube (watch, youtu.be, shorts), Vimeo ou .mp4. Vazio = em breve. */
  video: string
  /** Ex.: "4 min". Pode ficar vazio ate o video existir. */
  duracao: string
  /** Arquivos para baixar junto da aula (e-book, planilha, PDF). */
  materiais?: Material[]
  /** Links extras da aula (além dos padrões da marca). */
  links?: LinkDaAula[]
}

/** Um link relacionado à aula: o nome do botão e o endereço. */
export interface LinkDaAula { nome: string; url: string }

/** Um arquivo para baixar na aula: o nome do botão e o endereço do arquivo. */
export interface Material {
  nome: string
  url: string
  /** Caminho no bucket `materiais`, quando foi enviado pelo painel. */
  arquivo?: string
  tipo?: string
  tamanho?: number
}

export interface Modulo {
  id: string
  titulo: string
  chamada: string
  /** Cor da capa dos cartoes deste modulo. */
  cor: string
  aulas: Aula[]
}

/** Placeholder oficial usado somente enquanto os vídeos Teeds não chegaram. */
export const VIDEO_DEMONSTRACAO = 'https://www.youtube.com/watch?v=M7lc1UVf-VE'

/*
  O catálogo mora em `modulosAulas.ts` para que cada marca possa ter o seu
  (a casca da marca troca o arquivo inteiro). A numeração, o player e o
  progresso continuam aqui, iguais para todas.
*/
export { MODULOS, SALA_EM_BREVE } from './modulosAulas'
import { DEMONSTRACAO_EM_AULA_SEM_VIDEO, MATERIAIS_DE_EXEMPLO, MODULOS, VIDEOS_DE_EXEMPLO } from './modulosAulas'

/** O vídeo de exemplo que entra numa aula sem vídeo (o da marca, se houver; senão o demonstrativo). */
const exemplo = (n: number) => (VIDEOS_DE_EXEMPLO.length ? VIDEOS_DE_EXEMPLO[(n - 1) % VIDEOS_DE_EXEMPLO.length] : VIDEO_DEMONSTRACAO)
/** É um vídeo de exemplo (não o da aula de verdade)? */
export const ehVideoDeExemplo = (video: string) => video === VIDEO_DEMONSTRACAO || VIDEOS_DE_EXEMPLO.includes(video)

/**
 * As aulas do GF Member (plano 'treino') abrem depois da live de lançamento
 * (28/10/2026, Tiago: "Disponível em 09 de novembro de 2026 após a live").
 * Até lá a sala mostra o catálogo com o aviso e nenhum vídeo toca. Se o
 * Tiago não liberar antes, abrem sozinhas no dia seguinte (10/11, 00h de Brasília).
 */
export const AVISO_GF_MEMBER = 'Disponível em 09 de novembro de 2026 após a live'
export const AVISO_GF_MEMBER_CURTO = 'Disponível em 09/11'
const GF_MEMBER_LIBERA_EM = Date.parse('2026-11-10T03:00:00Z')
export const aulasTravadasParaGfMember = (plano: string | null, admin: boolean | null) =>
  plano === 'treino' && admin !== true && Date.now() < GF_MEMBER_LIBERA_EM

/* ------------------------------------------------------------ numeração */

export interface AulaNumerada extends Aula {
  numero: number
  modulo: Modulo
}

/**
 * O que o painel gravou por cima do catálogo, por id de aula.
 *
 * Vem de `aulasVideos.ts` (tabela `aulas_videos`, por marca). Só o que está
 * preenchido sobrepõe: um vídeo sem título novo mantém o título do código.
 */
export interface SobreposicaoDaAula {
  video: string
  duracao?: string
  titulo?: string | null
  descricao?: string | null
  publicado?: boolean
  materiais?: Material[]
  links?: LinkDaAula[]
}

/**
 * Todas as aulas, na ordem, com o número contínuo ("Aula 1", "Aula 2"…).
 *
 * `videos` é o que o painel gravou: uma aula com vídeo publicado ali deixa
 * de ser demonstração e passa a abrir o vídeo de verdade.
 */
export function todasAsAulas(videos: Record<string, SobreposicaoDaAula> = {}): AulaNumerada[] {
  const lista: AulaNumerada[] = []
  let n = 1
  for (const m of MODULOS) {
    for (const a of m.aulas) {
      const gravado = videos[a.id]
      const vivo = gravado && gravado.publicado !== false && gravado.video.trim() ? gravado : null
      const video = vivo?.video || a.video || (DEMONSTRACAO_EM_AULA_SEM_VIDEO ? exemplo(n) : '')
      const doPainel = gravado && gravado.publicado !== false ? gravado.materiais ?? [] : []
      lista.push({
        ...a,
        titulo: vivo?.titulo || a.titulo,
        descricao: vivo?.descricao || a.descricao,
        video,
        duracao: vivo?.duracao || a.duracao || (DEMONSTRACAO_EM_AULA_SEM_VIDEO ? 'Vídeo de exemplo' : ''),
        // os materiais do painel; numa aula ainda de exemplo, os materiais de exemplo da marca
        materiais: doPainel.length ? doPainel : a.materiais?.length ? a.materiais : ehVideoDeExemplo(video) ? MATERIAIS_DE_EXEMPLO : [],
        links: gravado && gravado.publicado !== false && gravado.links?.length ? gravado.links : a.links ?? [],
        numero: n++, modulo: m,
      })
    }
  }
  return lista
}

/* ------------------------------------------------------------- player */

export type Player =
  | { tipo: 'youtube' | 'vimeo'; src: string }
  | { tipo: 'mp4'; src: string }
  | null

/** Transforma o link colado no catálogo no endereço que o player usa. */
export function playerDoVideo(url: string): Player {
  const u = url.trim()
  if (!u) return null
  const yt = u.match(
    /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{6,})/,
  )
  if (yt) return { tipo: 'youtube', src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0` }
  const vm = u.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vm) return { tipo: 'vimeo', src: `https://player.vimeo.com/video/${vm[1]}` }
  if (/\.(mp4|webm|m3u8)(\?|$)/i.test(u)) return { tipo: 'mp4', src: u }
  // link desconhecido: tenta como pagina embutivel
  return { tipo: 'youtube', src: u }
}

/* ------------------------------------------------------------ progresso */

const CHAVE = 'teeds.aulas.vistas'

export function aulasVistas(): Set<string> {
  try {
    const bruto = localStorage.getItem(CHAVE)
    return new Set(bruto ? (JSON.parse(bruto) as string[]) : [])
  } catch {
    return new Set()
  }
}

export function marcarVista(id: string, vista: boolean): Set<string> {
  const atual = aulasVistas()
  if (vista) atual.add(id)
  else atual.delete(id)
  try {
    localStorage.setItem(CHAVE, JSON.stringify([...atual]))
  } catch {
    /* sem armazenamento: o progresso vale so nesta aba */
  }
  return atual
}
