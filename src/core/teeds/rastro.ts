/**
 * Por onde o cliente andou dentro da plataforma.
 *
 * A casa sabia QUE a pessoa entrou e nada sobre o que ela fez lá dentro.
 * Isto anota duas coisas, e só estas duas:
 *
 *  - **página vista**, com quanto tempo ela ficou ali;
 *  - **clique**, com o rótulo visível do botão (o texto que a pessoa leu).
 *
 * O que NÃO anota, de propósito: nada do que foi digitado, nenhum valor de
 * campo, nenhum IP. Rótulo de botão é o que a pessoa escolheu fazer; o resto
 * é conteúdo dela.
 *
 * Soma no banco em vez de gravar linha por clique. São 11 mil clientes: uma
 * linha por clique viraria dezenas de milhões por mês para responder as
 * mesmas perguntas que a soma responde. A chave é (dia, página, alvo).
 *
 * Falha em silêncio sempre. Telemetria nunca pode segurar a tela.
 */
import { SUPABASE } from './config'
import { MARCA } from '../../marca'
import type { SessaoTeeds } from './conta'

/** Quanto tempo numa página conta como "ficou ali". Abaixo disso é passagem. */
const MINIMO_NA_PAGINA_S = 2
/** O mesmo botão, clicado de novo dentro desta janela, não vira outro passo. */
const DEBOUNCE_CLIQUE_MS = 1200

let paginaAtual: string | null = null
let entrouEm = 0
const ultimoClique = new Map<string, number>()

async function enviar(sessao: SessaoTeeds, pagina: string, alvo: string, segundos: number): Promise<void> {
  try {
    await fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_registrar_passo`, {
      method: 'POST',
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_marca: MARCA.id, p_pagina: pagina, p_alvo: alvo, p_segundos: Math.round(segundos) }),
      keepalive: true,
    })
  } catch { /* o rastro se perde; a tela não */ }
}

/**
 * A pessoa trocou de tela. Fecha o tempo da anterior e abre o da nova.
 *
 * Chamado também na saída (com `null`), para o último trecho não sumir quando
 * alguém fecha a aba — é justamente o trecho mais longo da sessão.
 */
export function marcarPagina(sessao: SessaoTeeds | null | undefined, pagina: string | null): void {
  if (!sessao) { paginaAtual = null; return }
  const agora = Date.now()
  if (paginaAtual && entrouEm) {
    const segundos = (agora - entrouEm) / 1000
    if (segundos >= MINIMO_NA_PAGINA_S) void enviar(sessao, paginaAtual, '', segundos)
  }
  paginaAtual = pagina
  entrouEm = pagina ? agora : 0
}

/** Um clique num botão, pelo rótulo que a pessoa leu na tela. */
export function marcarClique(sessao: SessaoTeeds | null | undefined, alvo: string): void {
  if (!sessao || !alvo) return
  const agora = Date.now()
  const ultimo = ultimoClique.get(alvo) ?? 0
  if (agora - ultimo < DEBOUNCE_CLIQUE_MS) return
  ultimoClique.set(alvo, agora)
  void enviar(sessao, paginaAtual ?? 'desconhecida', alvo, 0)
}

/**
 * O rótulo de um clique, lido do próprio elemento.
 *
 * Sobe pelo DOM até achar algo clicável e pega o texto visível, o aria-label
 * ou o title — nessa ordem. Devolve null quando não há rótulo: sem nome, o
 * registro não ajudaria ninguém a entender o que foi clicado.
 */
function rotuloDoClique(alvo: EventTarget | null): string | null {
  const el = (alvo as HTMLElement | null)?.closest?.('button, a, [role="tab"], [role="button"]')
  if (!el) return null
  const texto = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '')
    .replace(/\s+/g, ' ').trim()
  if (!texto || texto.length > 60) return texto ? texto.slice(0, 60) : null
  return texto
}

/**
 * Liga a escuta de cliques na página inteira.
 *
 * Um ouvinte só, na captura, em vez de um por botão: a plataforma tem
 * centenas de botões e vários nascem e morrem a cada troca de tela.
 */
export function ouvirCliques(sessao: SessaoTeeds | null | undefined): () => void {
  if (!sessao) return () => {}
  const aoClicar = (e: MouseEvent) => {
    const rotulo = rotuloDoClique(e.target)
    if (rotulo) marcarClique(sessao, rotulo)
  }
  const aoSair = () => marcarPagina(sessao, null)
  document.addEventListener('click', aoClicar, true)
  window.addEventListener('pagehide', aoSair)
  return () => {
    document.removeEventListener('click', aoClicar, true)
    window.removeEventListener('pagehide', aoSair)
  }
}
