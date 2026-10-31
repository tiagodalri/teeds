/**
 * Estúdio da live (31/10/2026, escopo do Victor Dias): o OBS dentro da
 * Central ao vivo. Cenas com fontes, mixer de áudio, transição com o vídeo
 * do avião (stinger com máscara) e o modo estúdio (prévia e ao vivo).
 *
 * Tudo é desenhado numa tela de 1920×1080: posições e tamanhos das fontes
 * ficam nessa medida, igual à "resolução base" do OBS.
 */

export const LARGURA = 1920
export const ALTURA = 1080

export type TipoDeFonte = 'tela' | 'camera' | 'microfone' | 'video' | 'musica' | 'imagem' | 'texto' | 'cor'

/** Quanto cortar de cada lado, em pixels da imagem original. */
export interface Recorte { esq: number; topo: number; dir: number; baixo: number }

export interface EstiloDeTexto {
  conteudo: string
  tamanho: number
  cor: string
  negrito: boolean
  fonte: 'marca' | 'serifa' | 'mono'
  alinhamento: 'esquerda' | 'centro' | 'direita'
  /** Espaço entre as letras, em pixels. */
  espacamento: number
  caixaAlta: boolean
}

export interface Fonte {
  id: string
  tipo: TipoDeFonte
  nome: string
  visivel: boolean
  bloqueada: boolean
  /** Caixa na tela de 1920×1080 (já com o recorte). */
  x: number; y: number; w: number; h: number
  recorte: Recorte
  espelhar?: boolean
  /** Câmera e microfone: qual aparelho ('' = o padrão do computador). */
  dispositivo?: string
  /** Tela: leva junto o som do computador (quando o navegador deixa). */
  audioDaTela?: boolean
  /** Vídeo, música e imagem: arquivo guardado neste computador... */
  arquivo?: string
  /** ...ou que já vem com a plataforma (as cenas prontas). */
  url?: string
  nomeDoArquivo?: string
  /** Vídeo e música: repetir sem parar. */
  repetir?: boolean
  /** Vídeo e música: voltar ao começo sempre que a cena entra no ar. */
  reiniciar?: boolean
  texto?: EstiloDeTexto
  cor?: string
  /** Ao descobrir o tamanho real (câmera, tela, vídeo), encaixa na tela uma vez. */
  encaixar?: 'ajustar' | 'canto' | null
}

/** As fontes da cena: a primeira da lista é a que fica por cima. */
export interface Cena { id: string; nome: string; fontes: Fonte[] }

/** Para onde vai o som de um canal. */
export type Monitoramento = 'alunos' | 'fone' | 'ambos'

export interface Canal { volume: number; mudo: boolean; monitor: Monitoramento }

export type TipoDeTransicao = 'corte' | 'esmaecer' | 'stinger'

export type LayoutDoStinger = 'lado-a-lado' | 'empilhado' | 'so-mascara' | 'sem-mascara'

export interface ConfigDoStinger {
  arquivo?: string
  url?: string
  nomeDoArquivo?: string
  layout: LayoutDoStinger
  inverter: boolean
  /** Ponto da transição do áudio (com máscara) ou do corte (sem máscara), em ms. */
  pontoMs: number
  fadeAudio: 'cruzado' | 'saida-entrada'
  volume: number
  mudo: boolean
  monitor: Monitoramento
}

export interface ConfigDoEstudio {
  versao: 1
  cenas: Cena[]
  /** A cena no ar (o que os alunos recebem). */
  programa: string
  /** A cena sendo preparada (modo estúdio). */
  previa: string
  modoEstudio: boolean
  transicao: TipoDeTransicao
  /** Duração do esmaecer, em ms. */
  duracaoMs: number
  stinger: ConfigDoStinger
  /** Volume, mudo e monitoramento de cada canal de áudio. */
  canais: Record<string, Canal>
  /** Ouvir no fone o som da cena da prévia (nunca vai aos alunos). */
  ouvirPrevia: boolean
  /** Aparelho de saída do fone ('' = o padrão). */
  saidaDoFone: string
}

export const CANAL_PADRAO: Canal = { volume: 1, mudo: false, monitor: 'alunos' }

export const novoId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/** O canal de áudio de uma fonte: o mesmo microfone em várias cenas é um canal só. */
export function chaveDoAudio(f: Fonte): string | null {
  if (f.tipo === 'microfone') return `mic:${f.dispositivo || 'padrao'}`
  if (f.tipo === 'tela') return f.audioDaTela ? 'tela' : null
  if (f.tipo === 'video' || f.tipo === 'musica') return `arq:${f.id}`
  return null
}

/** A captura que a fonte usa (a mesma câmera em duas cenas abre uma vez só). */
export function chaveDaCaptura(f: Fonte): string | null {
  if (f.tipo === 'tela') return 'tela'
  if (f.tipo === 'camera') return `camera:${f.dispositivo || 'padrao'}`
  if (f.tipo === 'microfone') return `mic:${f.dispositivo || 'padrao'}`
  return null
}

export const NOME_DO_TIPO: Record<TipoDeFonte, string> = {
  tela: 'Tela ou janela', camera: 'Câmera', microfone: 'Microfone', video: 'Vídeo',
  musica: 'Música', imagem: 'Imagem', texto: 'Texto', cor: 'Cor de fundo',
}
