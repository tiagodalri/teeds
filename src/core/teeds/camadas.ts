/**
 * As camadas de um story (09/11/2026, Tiago: "ferramentas de edição igual o insta, com
 * localização, emojis, texto, figurinha... adicionar link também, mesmo formato do insta").
 *
 * Tudo em coordenadas da tela 9:16 do story: x e y de 0 a 100 (o centro da camada), escala 1 =
 * tamanho base, rotação em graus. A tela cheia desenha as camadas por cima da mídia, então ficam
 * nítidas em qualquer aparelho e as figurinhas respondem ao toque (link, enquete, contagem).
 * O desenho guarda os traços num quadro de 100 x 177,78 (a mesma proporção 9:16).
 */
import type { BotaoTipo } from './stories'

export type FonteDoTexto = 'classico' | 'forte' | 'elegante' | 'maquina' | 'neon'
export type FundoDoTexto = 'nenhum' | 'cor' | 'claro'
export type EstiloDaFigurinha = 'branco' | 'ouro' | 'vidro' | 'azul'
export type Selo = 'gf' | 'aovivo' | 'novidade' | 'ia' | 'gold' | 'black' | 'prestige'

interface Base { id: string; x: number; y: number; escala: number; rotacao: number }
export type Camada = Base & (
  | { tipo: 'texto'; texto: string; fonte: FonteDoTexto; cor: string; fundo: FundoDoTexto; alinhar: 'center' | 'left' | 'right' }
  | { tipo: 'emoji'; emoji: string }
  | { tipo: 'local'; texto: string; estilo: EstiloDaFigurinha }
  | { tipo: 'link'; url: string; texto: string; acao: BotaoTipo | null; estilo: EstiloDaFigurinha }
  | { tipo: 'hora'; hora: string; estilo: EstiloDaFigurinha }
  | { tipo: 'contagem'; titulo: string; ate: string; estilo: EstiloDaFigurinha }
  | { tipo: 'enquete'; pergunta: string; opcoes: string[] }
  | { tipo: 'selo'; selo: Selo }
  | { tipo: 'desenho'; tracos: Traco[] }
)
export interface Traco { cor: string; largura: number; marcador?: boolean; d: string }

export type TipoDeCamada = Camada['tipo']
export const ALTURA_DO_QUADRO = 177.78

export const novoId = () => Math.random().toString(36).slice(2, 10)

/** As figurinhas que o toque troca de estilo (como no Instagram). */
export const ESTILOS: EstiloDaFigurinha[] = ['branco', 'ouro', 'vidro', 'azul']
export const proximoEstilo = (e: EstiloDaFigurinha): EstiloDaFigurinha => ESTILOS[(ESTILOS.indexOf(e) + 1) % ESTILOS.length]

/** A paleta do texto e do desenho: a família da GlobalFly primeiro, depois as cores livres. */
export const CORES = ['#FFFFFF', '#051528', '#B78D39', '#F7E3A1', '#9CB1C7', '#3B6FB0', '#22D66A', '#FF3B47', '#FF8A3D', '#E040A0', '#8B5CF6', '#000000']

export const FONTES: Array<{ id: FonteDoTexto; nome: string }> = [
  { id: 'classico', nome: 'Clássico' }, { id: 'forte', nome: 'Forte' }, { id: 'elegante', nome: 'Elegante' },
  { id: 'maquina', nome: 'Máquina' }, { id: 'neon', nome: 'Neon' },
]

/** Cor do texto sobre um fundo: preto ou branco, o que ler melhor. */
export function contraste(hex: string): string {
  const h = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
  return l > 0.6 ? '#051528' : '#FFFFFF'
}

/** O texto que identifica o story no painel quando ele não tem título (o 1º texto das camadas). */
export function rotuloDasCamadas(camadas: Camada[] | null | undefined): string | null {
  for (const c of camadas ?? []) {
    if (c.tipo === 'texto' && c.texto.trim()) return c.texto.trim().split('\n')[0].slice(0, 70)
    if (c.tipo === 'enquete' && c.pergunta.trim()) return c.pergunta.trim()
    if (c.tipo === 'contagem' && c.titulo.trim()) return c.titulo.trim()
  }
  return null
}

/** O domínio, para a figurinha de link sem texto próprio (como o Instagram mostra). */
export function dominio(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url.replace(/^https?:\/\//, '').split('/')[0] }
}

/** Fontes de terceiros usadas pelo texto dos stories: carregadas uma vez, só quando há stories na tela. */
let fontesPedidas = false
export function carregarFontesDosStories() {
  if (fontesPedidas || typeof document === 'undefined') return
  fontesPedidas = true
  const l = document.createElement('link')
  l.rel = 'stylesheet'
  l.href = 'https://fonts.googleapis.com/css2?family=Anton&family=Playfair+Display:ital,wght@1,700&family=Courier+Prime:wght@700&display=swap'
  document.head.appendChild(l)
}

/** Os emojis da bandeja: os da casa primeiro (avião, gráfico, dinheiro), depois os de sempre. */
export const EMOJIS: Array<{ grupo: string; lista: string[] }> = [
  { grupo: 'Da casa', lista: ['✈️', '🛫', '🛬', '🚀', '📈', '📉', '💹', '📊', '💰', '💵', '💸', '🤑', '🪙', '💎', '👑', '🏆', '🥇', '🎯', '⚡️', '🔥', '✨', '⭐️', '🌟', '💡', '🧠', '🤖', '🔔', '📢', '⏰', '📅', '📍', '✅', '❌', '⚠️', '🎁', '🎉', '🎊', '🏦', '🌎', '🛡️'] },
  { grupo: 'Rostos', lista: ['😀', '😁', '😂', '🤣', '😊', '😍', '🤩', '😎', '🥳', '😮', '😱', '🤯', '🥹', '😅', '😉', '🤔', '🫡', '🙄', '😴', '🤝', '👀', '🫶'] },
  { grupo: 'Gestos', lista: ['👍', '👎', '👏', '🙌', '🙏', '💪', '👊', '✌️', '🤞', '👌', '🫵', '👇', '👆', '👉', '👈', '☝️', '✍️', '🤙'] },
  { grupo: 'Corações', lista: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💯', '💥', '💫', '🎵', '☀️', '🌙', '🌈', '🍾', '🥂', '☕️'] },
]

/* --------------------------------------------------- camadas novas, com os padrões */
const base = (x = 50, y = 46): Base => ({ id: novoId(), x, y, escala: 1, rotacao: 0 })
export const nova = {
  texto: (texto = '', cor = '#FFFFFF'): Camada => ({ ...base(), tipo: 'texto', texto, fonte: 'classico', cor, fundo: 'nenhum', alinhar: 'center' }),
  emoji: (emoji: string): Camada => ({ ...base(50, 40), tipo: 'emoji', emoji }),
  local: (texto: string): Camada => ({ ...base(50, 30), tipo: 'local', texto, estilo: 'branco' }),
  link: (url: string, texto: string, acao: BotaoTipo | null): Camada => ({ ...base(50, 70), tipo: 'link', url, texto, acao, estilo: 'branco' }),
  hora: (): Camada => ({ ...base(50, 22), tipo: 'hora', hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), estilo: 'branco' }),
  contagem: (titulo: string, ate: string): Camada => ({ ...base(50, 58), tipo: 'contagem', titulo, ate, estilo: 'branco' }),
  enquete: (pergunta: string, opcoes: string[]): Camada => ({ ...base(50, 60), tipo: 'enquete', pergunta, opcoes }),
  selo: (selo: Selo): Camada => ({ ...base(50, 36), tipo: 'selo', selo }),
  desenho: (): Camada => ({ ...base(50, 50), tipo: 'desenho', tracos: [] }),
}

/** A próxima live às 20h30 (hoje, ou amanhã se já passou): o padrão da contagem regressiva. */
export function proximaLive(): string {
  const d = new Date(); d.setHours(20, 30, 0, 0)
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1)
  return d.toISOString()
}
