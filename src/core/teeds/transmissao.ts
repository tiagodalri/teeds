/*
  Transmissão ao vivo pelo painel (12/11/2026, Tiago: "no menu de ADM, uma opção pra eu colocar um link
  da transmissão ao vivo... criar uma função para os próprios adms fazerem isso").

  Um administrador cola o link (Google Meet, YouTube, Zoom…) em Administração › Transmissão ao vivo e
  aperta Iniciar. Daí em diante, para todo mundo que abre a plataforma: o popup "a nossa transmissão ao
  vivo começou" com o botão para entrar, e o Ao vivo do menu piscando em vermelho (o clique reabre o
  popup). Encerrar tira do ar; se ninguém encerrar, ela sai sozinha 6 horas depois (banco:
  teeds_transmissao_no_ar). Substitui o horário fixo no código da call de 10/11.

  Quem lê: o aviso (AvisoDaLive, montado fora do App, também na tela de entrar) pergunta ao banco de
  30 em 30 s, sem login (teeds_transmissao_publica). O App e o menu leem daqui, sem perguntar de novo.
*/
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

/** Só a GlobalFly tem o aviso montado (main.tsx). */
export const TEM_TRANSMISSAO = MARCA.id === 'globalfly'

export interface TransmissaoNoAr { noAr: boolean; link: string | null; iniciadaEm: string | null; linkTrocadoEm: string | null }
const FORA: TransmissaoNoAr = { noAr: false, link: null, iniciadaEm: null, linkTrocadoEm: null }

let atual: TransmissaoNoAr = FORA
const ouvintes = new Set<() => void>()
const avisar = () => ouvintes.forEach((f) => f())
export const transmissaoAtual = () => atual
export function assinarTransmissao(f: () => void) { ouvintes.add(f); return () => { ouvintes.delete(f) } }
/** No ar agora, com link: o Ao vivo do menu pisca e o clique abre o popup. */
export const transmissaoNoAr = () => atual.noAr && !!atual.link

function guardar(t: TransmissaoNoAr) {
  if (t.noAr === atual.noAr && t.link === atual.link && t.iniciadaEm === atual.iniciadaEm && t.linkTrocadoEm === atual.linkTrocadoEm) return
  atual = t
  avisar()
}

/** Pergunta ao banco (sem login). Uma falha de rede mantém o que já se sabia. */
export async function lerTransmissao(): Promise<TransmissaoNoAr> {
  if (!TEM_TRANSMISSAO) return FORA
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_transmissao_publica`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id }),
  }).catch(() => null)
  if (!res?.ok) return atual
  const d = (await res.json().catch(() => null)) as Partial<TransmissaoNoAr> | null
  const t: TransmissaoNoAr = d?.noAr
    ? { noAr: true, link: d.link ?? null, iniciadaEm: d.iniciadaEm ?? null, linkTrocadoEm: d.linkTrocadoEm ?? null }
    : FORA
  guardar(t)
  return t
}

/** De 30 em 30 s com a aba aberta (60 s escondida) e na hora em que a pessoa volta para a aba. */
export function acompanharTransmissao(): () => void {
  if (!TEM_TRANSMISSAO) return () => undefined
  let vivo = true
  let t = 0
  const uma = () => {
    window.clearTimeout(t)
    void lerTransmissao().finally(() => {
      if (vivo) t = window.setTimeout(uma, document.visibilityState === 'hidden' ? 60_000 : 30_000)
    })
  }
  const aoVoltar = () => { if (document.visibilityState === 'visible') uma() }
  uma()
  document.addEventListener('visibilitychange', aoVoltar)
  return () => { vivo = false; window.clearTimeout(t); document.removeEventListener('visibilitychange', aoVoltar) }
}

/* ------------------------------------------------------------------ o painel do administrador */

export interface PainelDaTransmissao {
  noAr: boolean
  link: string | null
  iniciadaEm: string | null
  iniciadaPor: string | null
  encerradaEm: string | null
  encerradaPor: string | null
  linkTrocadoEm: string | null
  saiSozinhaEm: string | null
}
export type AcaoDaTransmissao = 'iniciar' | 'trocar_link' | 'encerrar'

async function rpc<T>(nome: string, sessao: SessaoTeeds, corpo: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!res.ok) {
    const e = await res.json().catch(() => ({}))
    throw new Error(e?.message || `Erro ${res.status} ao falar com o banco da ${MARCA.prosa}`)
  }
  return (await res.json().catch(() => null)) as T
}

export const painelDaTransmissao = (sessao: SessaoTeeds) =>
  rpc<PainelDaTransmissao>('teeds_transmissao_painel', sessao, { p_marca: MARCA.id })

/** Inicia, troca o link ou encerra; em seguida o aviso deste aparelho relê na hora. */
export async function controlarTransmissao(sessao: SessaoTeeds, acao: AcaoDaTransmissao, link?: string): Promise<PainelDaTransmissao> {
  const nome = (sessao.usuario.nome || sessao.usuario.email.split('@')[0].split('+')[0] || '').trim()
  const r = await rpc<PainelDaTransmissao>('teeds_transmissao_controlar', sessao, { p_marca: MARCA.id, p_acao: acao, p_link: link ?? null, p_nome: nome || null })
  void lerTransmissao()
  return r
}

/** Google Meet, YouTube, Zoom: o nome que aparece no popup ("entrar na call pelo Google Meet"). */
export function ondeEhATransmissao(link: string | null | undefined): string | null {
  try {
    const h = new URL(link ?? '').hostname
    if (/(^|\.)meet\.google\.com$/.test(h)) return 'Google Meet'
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(h)) return 'YouTube'
    if (/(^|\.)zoom\.us$/.test(h)) return 'Zoom'
    if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram'
    return null
  } catch { return null }
}
