import { useSyncExternalStore } from 'react'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'

/*
 * Conta aguardando liberação (GlobalFly, 16/11/2026, Tiago e Victor).
 *
 * O GF Member Gold sem saldo em nenhuma conta real da Deriv só usa o Início
 * (para ver), o Suporte, o Meu perfil, os depósitos na Deriv e o Marketplace.
 * Qualquer outro botão abre a janela "Libere a sua conta". Black, Prestige e
 * administradores nunca travam. Qualquer saldo acima de zero libera.
 *
 * Quem decide é o banco (gf_minha_liberacao → teeds_conta_travada). O site só
 * trava com a resposta do banco dizendo "travada" E sem saldo ao vivo na Deriv:
 * erro, demora ou dúvida = liberado. Nunca travar quem tem saldo.
 */

/** As telas que o Gold sem saldo continua abrindo. */
export const TELAS_LIVRES: ReadonlySet<string> = new Set(['inicio', 'perfil', 'ajuda', 'marketplace'])

export type Liberacao = { travada: boolean; saldo: number; contaReal: boolean }

export async function lerMinhaLiberacao(sessao: SessaoTeeds, marca: string): Promise<Liberacao | null> {
  try {
    const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/gf_minha_liberacao`, {
      method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_marca: marca }),
    })
    if (!r.ok) return null
    const j = await r.json()
    if (!j || typeof j.travada !== 'boolean') return null
    return { travada: j.travada, saldo: Number(j.saldo ?? 0), contaReal: !!j.conta_real }
  } catch { return null }
}

/** O que a pessoa fez na janela (painel Admin › Contas travadas). Nunca atrapalha: erro é ignorado. */
export type EventoDaLiberacao = 'abriu' | 'depositar' | 'conectar' | 'verificar' | 'black' | 'prestige' | 'suporte' | 'fechar'
export function registrarLiberacao(sessao: SessaoTeeds, marca: string, tipo: EventoDaLiberacao, origem?: string) {
  try {
    void fetch(`${SUPABASE.url}/rest/v1/rpc/gf_registrar_liberacao`, {
      method: 'POST', keepalive: true,
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_marca: marca, p_tipo: tipo, p_origem: origem ?? null }),
    }).catch(() => undefined)
  } catch { /* sem registro, segue */ }
}

/* o estado "travada agora" que o App e a navegação leem */
let travadaAgora = false
const ouvintes = new Set<() => void>()
export function definirTravada(v: boolean) { if (v !== travadaAgora) { travadaAgora = v; ouvintes.forEach((f) => f()) } }
export const useContaTravada = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }, () => travadaAgora, () => travadaAgora)

/** Abre a janela "Libere a sua conta" (de qualquer lugar). */
export const EVENTO_LIBERAR = 'plataforma:liberar-conta'
export const abrirLiberarConta = () => window.dispatchEvent(new Event(EVENTO_LIBERAR))

/*
 * O que um clique pode fazer com a conta travada.
 * Livre: a própria janela, o que está marcado com data-livre (telas livres,
 * Conectar a Deriv, depósito, suporte), o seletor de contas e o menu do avatar,
 * o tema, o selo do plano, o menu e a barra de baixo para as telas livres,
 * links da Deriv (depósito, abrir conta) e as janelas que já estão abertas
 * (termos, suporte, carteira, plano). O resto abre a janela.
 */
// conversor e calculadora (topo, menu do celular e menu do avatar): usam a classe do botão de tema
const BLOQUEADO = '[data-trava], .ferramenta-btn, .workspace-link.so-celular, .menu-acao.so-celular'
const LIVRE = [
  '.lbc-fundo', '[data-livre]', '.btn-deriv', '.tema-btn', '.topbar .conta', '.selo-categoria', '.lsim-relogio',
  '.workspace-brand', '.workspace-mobile-toggle', '.workspace-shade', '.workspace-collapse',
  '[data-tour="nav-inicio"]', '[data-tour="nav-ajuda"]', '[data-tour="nav-marketplace"]', '[data-tour="nav-perfil"]',
  '.sp-lancador-area', '.sp-painel', '.sp-ampliada',
].join(', ')
const INTERATIVO = 'button, a[href], [role="button"], [role="link"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="option"], [role="switch"], [role="checkbox"], input, select, textarea, summary, label'
const FECHAR = /fechar|agora não|depois|dispensar|^×$|^x$/i

function elementoClicavel(alvo: Element): Element | null {
  const el = alvo.closest(INTERATIVO)
  if (el) return el
  // cartões com onClick (div com cursor de mãozinha)
  let atual: Element | null = alvo
  for (let i = 0; atual && i < 6; i++, atual = atual.parentElement) {
    if (atual === document.body) break
    if (getComputedStyle(atual).cursor === 'pointer') return atual
  }
  return null
}

/** As telas cujo conteúdo inteiro fica livre (o Início é só para ver). */
const CONTEUDO_LIVRE: ReadonlySet<string> = new Set(['perfil', 'ajuda', 'marketplace'])
const MOLDURA = '.workspace-sidebar, .workspace-mobile-toggle, .topbar, .barra-inferior, [role="dialog"], [aria-modal="true"]'

/** true = deixa o clique passar; false = abre a janela. */
export function cliqueLivre(alvo: Element, tela: string): boolean {
  const el = elementoClicavel(alvo)
  if (!el) return true                                  // clicou em texto/fundo: nada acontece mesmo
  if (el.closest('.lbc-fundo')) return true
  if (el.closest(BLOQUEADO)) return false
  if (el.closest(LIVRE)) return true
  // Meu perfil, Ajuda e Marketplace: tudo o que está na página (o menu, o topo e as janelas seguem as regras)
  if (CONTEUDO_LIVRE.has(tela) && !el.closest(MOLDURA)) return true
  const a = el.closest('a[href]') as HTMLAnchorElement | null
  if (a && /(^|\.)deriv\.(com|me)$/i.test(safeHost(a.href))) return true
  const janela = el.closest('[role="dialog"], [aria-modal="true"]')
  if (janela) {
    // o aviso da live (abre sozinho) é da sala ao vivo, que fica travada: só fechar
    if (janela.closest('.alv-janela')) {
      const rotulo = `${el.getAttribute('aria-label') ?? ''} ${(el.textContent ?? '').trim()}`.trim()
      return FECHAR.test(rotulo) || FECHAR.test((el.textContent ?? '').trim())
    }
    return true
  }
  return false
}
function safeHost(href: string) { try { return new URL(href).hostname } catch { return '' } }
