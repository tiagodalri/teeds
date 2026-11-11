/**
 * A jornada do cadastro com planos na central de rastreio (Administração › Anúncios), 11/11/2026.
 *
 * Até 11/11 o /cadastro era a landing do lançamento (captura-globalfly/captura.js), que mandava cada
 * passo para gf_rastro. Agora o /cadastro, o /n/cadastro e o /v/cadastro abrem o cadastro com planos
 * da plataforma: este módulo manda os MESMOS eventos, com os mesmos nomes, para o funil continuar
 * inteiro (entrada → formulario → clicou → comecou → cadastro), além de rolagem, cliques, campos e saída.
 * O pixel da Meta é outro caminho (pixelDoParceiro.ts). Nunca em teste local.
 */
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import { vitrine } from './parceiro'
import { origemDoVisitante, visitante } from './visitas'

const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.|\[::1\])/.test(location.hostname)
const UA = typeof navigator !== 'undefined' ? navigator.userAgent || '' : ''
const NAVEGADOR = /Instagram/i.test(UA) ? 'instagram' : /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i.test(UA) ? 'facebook' : /Telegram/i.test(UA) ? 'telegram'
  : /musical_ly|BytedanceWebview|TikTok/i.test(UA) ? 'tiktok' : /WhatsApp/i.test(UA) ? 'whatsapp' : /Edg/i.test(UA) ? 'edge'
  : /CriOS|Chrome/i.test(UA) ? 'chrome' : /Safari/i.test(UA) ? 'safari' : /Firefox/i.test(UA) ? 'firefox' : ''
const DISPOSITIVO = /iPad|Tablet/i.test(UA) ? 'tablet' : /Mobi|Android|iPhone/i.test(UA) ? 'celular' : 'computador'

/** De onde a visita veio: a marcação guardada na chegada (a barra já foi limpa) e o navegador. */
function toque() {
  const o = origemDoVisitante()
  const q = new URLSearchParams(location.search)
  return {
    origem: o.origem, meio: o.meio, campanha: o.campanha, conteudo: o.conteudo ?? '', termo: o.termo ?? '',
    link: (q.get('o') ?? '').toLowerCase().slice(0, 40), ref: o.referencia, nav: NAVEGADOR, disp: DISPOSITIVO, fbclid: q.has('fbclid'),
  }
}

/** O endereço que a central mostra: o do parceiro, como na landing antiga. */
const pagina = (sufixo = '') => { const v = vitrine(); return `/${v ? `${v}/` : ''}cadastro${sufixo}` }

export function rastroDoCadastro(evento: string, detalhe?: Record<string, unknown>, email?: string, sufixo = ''): void {
  if (LOCAL || MARCA.id !== 'globalfly') return
  try {
    void fetch(`${SUPABASE.url}/rest/v1/rpc/gf_rastro`, {
      method: 'POST', keepalive: true,
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_marca: 'globalfly', p_parceiro: vitrine() || null, p_visitante: visitante(), p_evento: evento,
        p_pagina: pagina(sufixo), p_toque: toque(), p_detalhe: detalhe ?? null, p_email: email ?? null }),
    }).catch(() => { /* a central perde um passo, a página não */ })
  } catch { /* nunca atrapalha o cadastro */ }
}

/** Liga o acompanhamento da página: entrada, rolagem (25/50/75/100%), cliques, campos e saída. Devolve o desligar. */
export function acompanharCadastro(raiz: HTMLElement): () => void {
  let nova = true
  try { nova = !sessionStorage.getItem('gf.rastro.sessao'); sessionStorage.setItem('gf.rastro.sessao', '1') } catch { /* sem armazenamento */ }
  rastroDoCadastro(nova ? 'entrada' : 'pagina')
  const marcos = [25, 50, 75, 100]
  let maior = 0, pedido = false, saiu = 0
  const inicio = Date.now()
  const rolagem = () => {
    pedido = false
    const alto = Math.max(1, document.documentElement.scrollHeight - innerHeight), pc = Math.round(Math.min(1, scrollY / alto) * 100)
    if (pc > maior) maior = pc
    while (marcos.length && maior >= marcos[0]) rastroDoCadastro(`rolou-${marcos.shift()}`)
  }
  const aoRolar = () => { if (marcos.length && !pedido) { pedido = true; requestAnimationFrame(rolagem) } }
  const sair = () => {
    if (Date.now() - saiu < 5000) return
    saiu = Date.now()
    rastroDoCadastro('saiu', { segundos: Math.round((Date.now() - inicio) / 1000), rolou: maior })
  }
  const aoEsconder = () => { if (document.visibilityState === 'hidden') sair() }
  const aoClicar = (ev: MouseEvent) => {
    const alvo = (ev.target as HTMLElement | null)?.closest?.('a, button, [role="button"], summary') as HTMLElement | null
    if (!alvo || !raiz.contains(alvo)) return
    const nome = (alvo.getAttribute('data-rastro') || alvo.getAttribute('aria-label') || alvo.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50)
    let para = ''
    try { const href = (alvo as HTMLAnchorElement).href; if (href) { const u = new URL(href, location.href); para = u.hostname === location.hostname ? u.pathname + u.hash : u.hostname } } catch { /* sem destino */ }
    rastroDoCadastro('clique', { alvo: nome || '(sem texto)', ...(para ? { para } : {}) })
  }
  const campos = new Set<string>()
  const aoMudar = (ev: Event) => {
    const c = ev.target as HTMLInputElement | null
    const nome = c?.id?.replace(/^cpl-/, '')
    if (!nome || !c?.closest?.('form') || campos.has(nome) || /senha|repetir/.test(nome)) return
    campos.add(nome); rastroDoCadastro('campo', { campo: nome }, undefined, '/dados')
  }
  addEventListener('scroll', aoRolar, { passive: true })
  addEventListener('pagehide', sair)
  document.addEventListener('visibilitychange', aoEsconder)
  document.addEventListener('click', aoClicar, true)
  document.addEventListener('change', aoMudar, true)
  return () => {
    removeEventListener('scroll', aoRolar); removeEventListener('pagehide', sair)
    document.removeEventListener('visibilitychange', aoEsconder); document.removeEventListener('click', aoClicar, true); document.removeEventListener('change', aoMudar, true)
  }
}
