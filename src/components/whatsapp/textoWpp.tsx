/** Texto e datas da central do WhatsApp, como o aplicativo mostra. */
import type { ReactNode } from 'react'

/** Só emoji (até 3): o WhatsApp mostra grande, sem balão apertado. */
export function soEmoji(texto: string | null): boolean {
  const t = (texto ?? '').trim()
  if (!t || t.length > 24) return false
  const semEmoji = t.replace(/\p{Extended_Pictographic}|‍|️|\p{Emoji_Modifier}|\s/gu, '')
  const qtd = [...t.matchAll(/\p{Extended_Pictographic}/gu)].length
  return !semEmoji && qtd > 0 && qtd <= 3
}

/** Destaca o termo buscado dentro de um pedaço de texto. */
function destacar(t: string, termo: string | undefined, chave: string): ReactNode[] {
  if (!termo) return [t]
  const re = new RegExp(`(${termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')
  return t.split(re).map((p, i) => (i % 2 ? <mark key={`${chave}-${i}`}>{p}</mark> : p))
}

/** *negrito*, _itálico_, ~riscado~ e links, como o WhatsApp mostra. */
export function formatar(texto: string, termo?: string): ReactNode[] {
  const saida: ReactNode[] = []
  const partes = texto.split(/(https?:\/\/[^\s]+)/g)
  partes.forEach((p, i) => {
    if (/^https?:\/\//.test(p)) { saida.push(<a key={i} href={p} target="_blank" rel="noreferrer noopener">{p.length > 60 ? `${p.slice(0, 57)}…` : p}</a>); return }
    const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g
    let ultimo = 0, m: RegExpExecArray | null, k = 0
    while ((m = re.exec(p))) {
      if (m.index > ultimo) saida.push(...destacar(p.slice(ultimo, m.index), termo, `${i}-t${k}`))
      const dentro = destacar(m[0].slice(1, -1), termo, `${i}-d${k}`)
      saida.push(m[0][0] === '*' ? <b key={`${i}-${k++}`}>{dentro}</b> : m[0][0] === '_' ? <em key={`${i}-${k++}`}>{dentro}</em> : <s key={`${i}-${k++}`}>{dentro}</s>)
      ultimo = m.index + m[0].length
    }
    if (ultimo < p.length) saida.push(...destacar(p.slice(ultimo), termo, `${i}-f`))
  })
  return saida
}

export const rotuloDoTipo = (t: string) => ({ imagem: '📷 Foto', audio: '🎤 Áudio', video: '🎬 Vídeo', documento: '📄 Arquivo', figurinha: 'Figurinha', localizacao: '📍 Localização', modelo: 'Modelo' } as Record<string, string>)[t] ?? 'Mensagem'
export const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
export const dataCurta = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
export const dataEHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const tamanho = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
export const duracao = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
export function horaOuDia(iso: string): string {
  const d = new Date(iso), hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return horaCurta(iso)
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Ontem'
  if (Date.now() - d.getTime() < 6 * 86_400_000) { const w = d.toLocaleDateString('pt-BR', { weekday: 'long' }); return w.charAt(0).toUpperCase() + w.slice(1).replace('-feira', '') }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
export function diaDaMensagem(iso: string): string {
  const d = new Date(iso), hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  if (d.toDateString() === new Date(Date.now() - 86_400_000).toDateString()) return 'Ontem'
  const r = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
  return r.charAt(0).toUpperCase() + r.slice(1)
}
export function haQuanto(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'agora'
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  const dd = Math.round(s / 86400)
  return `há ${dd} dia${dd > 1 ? 's' : ''}`
}

/** Cor fixa de cada etiqueta (a mesma etiqueta tem sempre a mesma cor). */
const CORES_ETIQUETA = ['#00A884', '#53BDEB', '#B78D39', '#9C6B9E', '#C2724F', '#5B7FA6', '#3E8E7E']
export function corDaEtiqueta(nome: string): string {
  let h = 0; for (const ch of nome.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return CORES_ETIQUETA[h % CORES_ETIQUETA.length]
}

/** Os emojis do teclado da central (os de atendimento primeiro). */
export const EMOJIS: Array<{ nome: string; lista: string[] }> = [
  { nome: 'Mais usados', lista: ['👍', '🙏', '😊', '😀', '😂', '❤️', '👏', '🙌', '✅', '🚀', '🔥', '💰', '📈', '✈️', '⭐', '🎉', '👋', '💪', '🤝', '😉'] },
  { nome: 'Rostos', lista: ['😃', '😄', '😁', '😅', '🤣', '🙂', '😍', '🤩', '😎', '🤔', '😮', '😯', '😢', '😭', '😤', '😬', '🙄', '😴', '🤗', '🤭', '😇', '🥳', '😌', '😐'] },
  { nome: 'Gestos', lista: ['👌', '✌️', '🤞', '👆', '👇', '👉', '👈', '☝️', '✋', '🤙', '👊', '✊', '🫶', '💯', '👀', '🧠'] },
  { nome: 'Coisas', lista: ['📱', '💻', '📊', '📉', '💵', '💳', '🏦', '🎯', '⏰', '📅', '📌', '📎', '🔒', '🔑', '💡', '📣', '🎥', '📚', '🛫', '🌎'] },
  { nome: 'Símbolos', lista: ['✔️', '❌', '⚠️', '❓', '❗', '➡️', '⬆️', '⬇️', '🔝', '🆗', '🆕', '🔴', '🟢', '🟡', '⚪', '⚫'] },
]
export const REACOES = ['👍', '❤️', '😂', '😮', '😢', '🙏']
