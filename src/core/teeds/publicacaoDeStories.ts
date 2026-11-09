/**
 * A publicação dos stories em segundo plano (09/11/2026, Tiago: "quero sentir como se eu tivesse
 * postando no próprio instagram").
 *
 * Como no Instagram: a mídia começa a ser preparada e enviada assim que é escolhida; ao tocar em
 * Publicar o estúdio fecha na hora e o envio continua aqui, fora dele. A fileira da Início mostra
 * "Seu story" com o anel de progresso até virar "Publicado". Fica num módulo (e não num
 * componente) para sobreviver ao estúdio fechado e à troca de tela.
 */
import { useSyncExternalStore } from 'react'
import type { SessaoTeeds } from './conta'
import { MARCA } from '../../marca'
import {
  avisarNoCelular, enviarArquivo, enviarMidia, EVENTO_STORIES, prepararMidia, salvarStory, LIMITE_SEGUNDOS,
  type MidiaPronta, type NovoStory,
} from './stories'

export type Fase = 'preparando' | 'enviando' | 'pronto-para-publicar' | 'publicando' | 'publicado' | 'erro'

export interface Trabalho {
  id: string
  fase: Fase
  /** 0..1 da fase atual (preparar ou enviar). */
  f: number
  /** Progresso total 0..1 (preparar conta 45%, enviar 50%, salvar 5%). */
  total: number
  tipo: 'video' | 'imagem'
  duracao: number
  /** A miniatura para o anel da bolinha (objectURL local). */
  miniatura: string | null
  perfil: { nome: string; foto: string | null } | null
  /** O estúdio já mandou publicar (a fileira mostra "Seu story"). */
  publicar: boolean
  erro: string | null
  aviso: string | null
  storyId: string | null
}

interface Interno {
  t: Trabalho
  arquivo: Blob | null
  sessao: SessaoTeeds
  pronto: { url: string; caminho: string; capa: string | null } | null
  cancelar: (() => void) | null
  dados: Omit<NovoStory, 'tipo' | 'midia_url' | 'midia_caminho' | 'capa_url' | 'duracao'> | null
  avisar: { titulo: string; corpo: string; parceiro: string | null } | null
  fundo: (() => Promise<Blob>) | null
}

const trabalhos = new Map<string, Interno>()
const ouvintes = new Set<() => void>()
let foto: Trabalho[] = []
function avisarOuvintes() { foto = [...trabalhos.values()].map((i) => i.t); ouvintes.forEach((f) => f()) }
function mudar(id: string, patch: Partial<Trabalho>) {
  const i = trabalhos.get(id)
  if (!i) return
  i.t = { ...i.t, ...patch }
  const fase = i.t.fase
  i.t.total = fase === 'preparando' ? i.t.f * 0.45 : fase === 'enviando' ? 0.45 + i.t.f * 0.5 : fase === 'pronto-para-publicar' ? 0.95 : fase === 'publicando' ? 0.97 : fase === 'publicado' ? 1 : i.t.total
  avisarOuvintes()
}

const novoId = () => Math.random().toString(36).slice(2, 10)

/** Começa a preparar e enviar a mídia escolhida (antes mesmo de publicar). */
export function iniciarMidia(sessao: SessaoTeeds, arquivo: Blob, nome: string): string {
  const id = novoId()
  const f = arquivo instanceof File ? arquivo : new File([arquivo], nome, { type: arquivo.type })
  const ehFoto = f.type.startsWith('image/') || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name)
  trabalhos.set(id, {
    t: { id, fase: 'preparando', f: 0, total: 0, tipo: ehFoto ? 'imagem' : 'video', duracao: 6, miniatura: ehFoto ? URL.createObjectURL(f) : null, perfil: null, publicar: false, erro: null, aviso: null, storyId: null },
    arquivo: f, sessao, pronto: null, cancelar: null, dados: null, avisar: null, fundo: null,
  })
  avisarOuvintes()
  void processar(id)
  return id
}

/** O modo Texto: o fundo vira foto só na hora de publicar. */
export function iniciarFundo(sessao: SessaoTeeds, gerar: () => Promise<Blob>): string {
  const id = novoId()
  trabalhos.set(id, {
    t: { id, fase: 'pronto-para-publicar', f: 1, total: 0.4, tipo: 'imagem', duracao: 6, miniatura: null, perfil: null, publicar: false, erro: null, aviso: null, storyId: null },
    arquivo: null, sessao, pronto: null, cancelar: null, dados: null, avisar: null, fundo: gerar,
  })
  avisarOuvintes()
  return id
}

async function processar(id: string) {
  const i = trabalhos.get(id)
  if (!i || !i.arquivo) return
  try {
    mudar(id, { fase: 'preparando', f: 0, erro: null })
    const m: MidiaPronta = await prepararMidia(i.arquivo as File, (p) => mudar(id, { f: p }))
    if (!trabalhos.has(id)) return
    mudar(id, { fase: 'enviando', f: 0, tipo: m.tipo, duracao: m.duracao, aviso: m.cortado ? `Ficaram os primeiros ${LIMITE_SEGUNDOS} segundos do vídeo.` : null })
    if (!i.t.miniatura && m.capa) mudar(id, { miniatura: URL.createObjectURL(m.capa) })
    const envio = enviarMidia(i.sessao, m, (p) => mudar(id, { f: p }))
    i.cancelar = envio.cancelar
    i.pronto = await envio.promessa
    i.cancelar = null
    if (!trabalhos.has(id)) return
    mudar(id, { fase: 'pronto-para-publicar', f: 1 })
    if (i.t.publicar) await salvar(id)
  } catch (e) {
    if (!trabalhos.has(id)) return
    mudar(id, { fase: 'erro', erro: (e as Error).message })
  }
}

async function salvar(id: string) {
  const i = trabalhos.get(id)
  if (!i || !i.dados) return
  try {
    mudar(id, { fase: 'publicando' })
    if (i.fundo && !i.pronto) {
      const blob = await i.fundo()
      const caminho = `${MARCA.id}/${Date.now().toString(36)}-fundo.jpg`
      const url = await enviarArquivo(i.sessao, caminho, blob, 'image/jpeg').promessa
      i.pronto = { url, caminho, capa: url }
      if (!i.t.miniatura) mudar(id, { miniatura: URL.createObjectURL(blob) })
    }
    if (!i.pronto) throw new Error('A mídia ainda não subiu.')
    const tipo = i.t.tipo
    const salvo = await salvarStory(i.sessao, {
      ...i.dados, tipo, midia_url: i.pronto.url, midia_caminho: i.pronto.caminho, capa_url: i.pronto.capa,
      duracao: tipo === 'imagem' ? 6 : Math.max(1, Math.round(i.t.duracao * 10) / 10),
    } as NovoStory)
    if (i.avisar) await avisarNoCelular(i.sessao, salvo.id, i.avisar.titulo, i.avisar.corpo, i.avisar.parceiro).catch(() => undefined)
    mudar(id, { fase: 'publicado', storyId: salvo.id })
    window.dispatchEvent(new Event(EVENTO_STORIES))
    // "Publicado" fica um instante no anel e some (o story já está na fileira)
    window.setTimeout(() => descartar(id), 3500)
  } catch (e) {
    mudar(id, { fase: 'erro', erro: (e as Error).message })
  }
}

/** Tocou em Publicar: o estúdio fecha e o resto acontece aqui. */
export function publicar(id: string, dados: Interno['dados'], perfil: Trabalho['perfil'], avisar: Interno['avisar']) {
  const i = trabalhos.get(id)
  if (!i) return
  i.dados = dados; i.avisar = avisar
  mudar(id, { publicar: true, perfil })
  if (i.t.fase === 'pronto-para-publicar') void salvar(id)
}

/** Tentar de novo depois de um erro (do envio ou do salvar). */
export function tentarDeNovo(id: string) {
  const i = trabalhos.get(id)
  if (!i) return
  if (i.pronto || i.fundo) { if (i.dados) void salvar(id); else mudar(id, { fase: 'pronto-para-publicar', erro: null }) }
  else void processar(id)
}

/** Descarta (fechou o estúdio sem publicar, ou já publicou). */
export function descartar(id: string) {
  const i = trabalhos.get(id)
  if (!i) return
  i.cancelar?.()
  trabalhos.delete(id)
  avisarOuvintes()
}

function assinar(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export function useTrabalhos(): Trabalho[] { return useSyncExternalStore(assinar, () => foto, () => foto) }
export function useTrabalho(id: string | null): Trabalho | null {
  const l = useTrabalhos()
  return id ? l.find((t) => t.id === id) ?? null : null
}

/* fechar o app no meio do envio perde o story: o navegador avisa antes */
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if ([...trabalhos.values()].some((i) => i.t.publicar && i.t.fase !== 'publicado' && i.t.fase !== 'erro')) { e.preventDefault(); e.returnValue = '' }
  })
}
