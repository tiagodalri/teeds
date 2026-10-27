/**
 * Notificações no celular (27/10/2026, Tiago: "tem como aparecer notificação
 * no celular? mesmo sendo PWA? quero pra ontem").
 *
 * Web Push: Android (navegador e app instalado), iPhone a partir do iOS 16.4
 * SÓ com o app instalado na tela de início, e computador. O aparelho autoriza
 * uma vez; a inscrição vai para push_assinaturas e a função `notificacoes` do
 * Supabase avisa quando uma sessão de I.A. termina (meta, limite, recusa da
 * Deriv, manutenção). Quem para a própria I.A. não recebe aviso.
 *
 * No iPhone o pedido de permissão precisa nascer de um toque: `ativar` pede a
 * permissão ANTES de qualquer espera, senão o Safari ignora o pedido.
 */
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { aparelhoLegivel } from './termos'
import { MARCA } from '../../marca'

export type EstadoDasNotificacoes = 'sem-suporte' | 'instalar' | 'bloqueadas' | 'desligadas' | 'ligadas'

const ehIphone = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const instalado = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const temSuporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

const FUNCAO = `${SUPABASE.url}/functions/v1/notificacoes`

async function registro(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  const atual = await navigator.serviceWorker.getRegistration()
  if (atual) return atual
  // o service worker ainda não terminou de registrar (primeira abertura): espera um pouco
  return Promise.race([navigator.serviceWorker.ready, new Promise<null>((ok) => setTimeout(() => ok(null), 4000))])
}

export async function estadoDasNotificacoes(): Promise<EstadoDasNotificacoes> {
  if (ehIphone() && !instalado()) return 'instalar'
  if (!temSuporte()) return ehIphone() ? 'instalar' : 'sem-suporte'
  if (Notification.permission === 'denied') return 'bloqueadas'
  if (Notification.permission !== 'granted') return 'desligadas'
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'ligadas' : 'desligadas'
}

const paraBytes = (b64: string) => {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4))
  return Uint8Array.from(s, (c) => c.charCodeAt(0))
}

async function chavePublica(): Promise<string> {
  const r = await fetch(FUNCAO, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE.anonKey }, body: JSON.stringify({ acao: 'chave', marca: MARCA.id }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok || !j.chave) throw new Error('Não foi possível preparar as notificações agora. Tente de novo em instantes.')
  return j.chave
}

async function gravar(sessao: SessaoTeeds, sub: PushSubscription): Promise<void> {
  const j = sub.toJSON()
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_inscrever_aparelho`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth, p_aparelho: aparelhoLegivel(navigator.userAgent) }),
  })
  if (!r.ok) throw new Error('Não foi possível ligar as notificações neste aparelho.')
}

/** Pede a permissão, inscreve o aparelho e grava. Chame direto do toque no botão. */
export async function ativarNotificacoes(sessao: SessaoTeeds): Promise<void> {
  if (!temSuporte()) throw new Error('Este navegador não recebe notificações.')
  const permissao = await Notification.requestPermission()
  if (permissao === 'denied') throw new Error('As notificações ficaram bloqueadas. Libere nos ajustes do aparelho e tente de novo.')
  if (permissao !== 'granted') throw new Error('Toque em "Permitir" para receber os avisos.')
  const reg = await registro()
  if (!reg) throw new Error('O app ainda está terminando de carregar. Tente de novo em alguns segundos.')
  const chave = paraBytes(await chavePublica())
  let sub = await reg.pushManager.getSubscription()
  if (sub) {
    // inscrição antiga com outra chave: troca
    const atual = sub.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null
    if (atual && (atual.length !== chave.length || atual.some((b, i) => b !== chave[i]))) { await sub.unsubscribe(); sub = null }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chave })
  await gravar(sessao, sub)
}

/** Desliga neste aparelho (os outros aparelhos da pessoa continuam recebendo). */
export async function desligarNotificacoes(sessao: SessaoTeeds): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => undefined)
  await fetch(`${SUPABASE.url}/rest/v1/push_assinaturas?endpoint=eq.${encodeURIComponent(endpoint)}`, {
    method: 'DELETE', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
  }).catch(() => undefined)
}

/** Manda um aviso de teste para os aparelhos da pessoa. */
export async function testarNotificacoes(sessao: SessaoTeeds): Promise<number> {
  const r = await fetch(FUNCAO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
    body: JSON.stringify({ acao: 'teste', marca: MARCA.id }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.erro ?? 'Não foi possível enviar o teste.')
  return Number(j.enviados ?? 0)
}

/**
 * Ao abrir o app já autorizado: confirma a inscrição deste aparelho na conta
 * que está entrando (o mesmo celular pode trocar de conta).
 */
export async function confirmarInscricao(sessao: SessaoTeeds): Promise<void> {
  try {
    if (!temSuporte() || Notification.permission !== 'granted') return
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = await reg?.pushManager.getSubscription()
    if (sub) await gravar(sessao, sub)
  } catch { /* sem rede: tenta na próxima abertura */ }
}
