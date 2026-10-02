/**
 * Quem abriu o site, e por qual caminho chegou.
 *
 * Os insights contavam só quem ENTRA: os acessos nascem de um user_id, então
 * quem abre teedscompany.com, olha e vai embora era invisível. Numa campanha
 * esse é justamente o número que importa — quantas pessoas o link alcançou.
 *
 * O que vai para o servidor: a marca, um id anônimo deste navegador, de onde
 * a pessoa veio (as marcações utm do link, ou o domínio do referenciador),
 * dispositivo, idioma e fuso. Nada de IP e nada de dado pessoal; o endereço
 * aparece no servidor só para o freio de repetição e morre lá.
 *
 * ATRIBUIÇÃO DE PRIMEIRO TOQUE. A marcação chega na URL, mas a pessoa clica
 * em outras coisas e a URL muda. Quem veio do Telegram hoje e volta amanhã
 * digitando o endereço continua sendo uma pessoa que o Telegram trouxe, e é
 * assim que a origem fica guardada: a primeira vista vale, e uma marcação
 * nova só substitui se vier explícita numa visita seguinte.
 *
 * UMA VISITA POR SESSÃO DO NAVEGADOR. Recarregar a página não conta de novo,
 * senão quem deixa a aba aberta o dia inteiro viraria cem visitas. Fechou a
 * aba e voltou, conta de novo — que é o significado honesto de "visita".
 */
import { MARCA } from '../../marca'
import { SERVIDOR } from './config'
import { dispositivoAtual } from './insights'

const CHAVE_VISITANTE = `${MARCA.id}.visitante`
const CHAVE_ORIGEM = `${MARCA.id}.origem`
const CHAVE_SESSAO = `${MARCA.id}.visita.sessao`

interface Origem { origem: string; meio: string; campanha: string; referencia: string }

const vazio = (): Origem => ({ origem: '', meio: '', campanha: '', referencia: '' })

function ler<T>(dep: Storage, chave: string): T | null {
  try { const v = dep.getItem(chave); return v ? (JSON.parse(v) as T) : null } catch { return null }
}
function guardar(dep: Storage, chave: string, valor: unknown) {
  try { dep.setItem(chave, JSON.stringify(valor)) } catch { /* navegador sem armazenamento: a visita ainda conta, só não se liga à anterior */ }
}

/** O id deste navegador. Aleatório, local, sem relação com a pessoa. */
function visitante(): string {
  const guardado = ler<string>(localStorage, CHAVE_VISITANTE)
  if (guardado && guardado.length >= 8) return guardado
  const novo = (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`)
    .replace(/[^a-zA-Z0-9]/g, '').slice(0, 32)
  guardar(localStorage, CHAVE_VISITANTE, novo)
  return novo
}

/** O domínio de quem mandou a pessoa para cá. O caminho não interessa. */
function dominioReferenciador(): string {
  try {
    const r = document.referrer
    if (!r) return ''
    const host = new URL(r).hostname.replace(/^www\./, '')
    return host === location.hostname.replace(/^www\./, '') ? '' : host
  } catch { return '' }
}

/** A marcação que veio na URL agora, se veio. */
function daURL(): Origem | null {
  const q = new URLSearchParams(location.search)
  const origem = (q.get('utm_source') ?? q.get('origem') ?? '').trim()
  if (!origem) return null
  return {
    origem,
    meio: (q.get('utm_medium') ?? '').trim(),
    campanha: (q.get('utm_campaign') ?? '').trim(),
    referencia: dominioReferenciador(),
  }
}

/**
 * Tira as marcações da barra de endereço depois de lidas.
 *
 * Duas razões: a pessoa não compartilha sem querer um link com a campanha de
 * outra pessoa colada nele, e um F5 não reescreve a origem. O histórico é
 * substituído, não empilhado, para o botão voltar continuar fazendo sentido.
 */
function limparURL() {
  try {
    const u = new URL(location.href)
    const sujas = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'origem']
    if (!sujas.some((s) => u.searchParams.has(s))) return
    for (const s of sujas) u.searchParams.delete(s)
    history.replaceState(null, '', u.pathname + (u.search || '') + u.hash)
  } catch { /* sem history: a URL fica como está, o que não quebra nada */ }
}

/** A origem que vale para esta pessoa: a de agora, ou a primeira que vimos. */
export function origemDoVisitante(): Origem {
  const agora = daURL()
  if (agora) { guardar(localStorage, CHAVE_ORIGEM, agora); return agora }
  const antes = ler<Origem>(localStorage, CHAVE_ORIGEM)
  if (antes?.origem) return antes
  const ref = dominioReferenciador()
  return { ...vazio(), referencia: ref }
}

/**
 * Anota a visita. Roda uma vez por sessão do navegador e falha em silêncio:
 * o site nunca espera por isto nem quebra se o motor estiver fora do ar.
 */
export function registrarVisita(): void {
  try {
    const o = origemDoVisitante()
    limparURL()
    if (sessionStorage.getItem(CHAVE_SESSAO)) return
    sessionStorage.setItem(CHAVE_SESSAO, '1')
    const corpo = {
      marca: MARCA.id, visitante: visitante(),
      origem: o.origem, meio: o.meio, campanha: o.campanha, referencia: o.referencia,
      dispositivo: dispositivoAtual(),
      idioma: navigator.language || '',
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      caminho: location.pathname,
    }
    // `keepalive` para a anotação sobreviver se a pessoa sair na mesma hora.
    void fetch(`${SERVIDOR.url}/publico/visita`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo), keepalive: true,
    }).catch(() => { /* porta pública fora do ar: a visita se perde, o site não */ })
  } catch { /* qualquer coisa aqui é telemetria, nunca o produto */ }
}
