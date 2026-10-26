/**
 * Parceiros de divulgação (27/10/2026): /n (Naur) e /v (Victor) na GlobalFly.
 *
 * O link chega como `?parceiro=n` (as páginas /n e /v encaminham assim). Aqui:
 *  - o código é guardado no navegador por 90 dias, PRIMEIRO TOQUE: quem já
 *    veio por um parceiro não troca de parceiro por clicar no link do outro;
 *  - o clique é anotado no banco (um por navegador, por dia), para o funil;
 *  - o cadastro leva o código dentro do endereço da página (ver leads.ts), e o
 *    banco liga o cliente ao parceiro quando a conta nasce;
 *  - quem entra já com conta nova (até 14 dias, sem parceiro) é ligado ao
 *    parceiro guardado, pelo banco, que confere tudo de novo.
 * A regra que vale é a do banco (supabase/migracoes/20261027120000_parceiros_de_divulgacao.sql):
 * aqui é só o transporte.
 */
import { MARCA } from '../../marca'
import { SUPABASE } from './config'
import type { SessaoTeeds } from './conta'
import { visitante } from './visitas'

const CHAVE = `${MARCA.id}.parceiro`
const VALIDADE_MS = 90 * 24 * 3600_000
const codigos = () => MARCA.parceiros ?? []

interface Guardado { codigo: string; em: number }

/** O parceiro deste navegador, se veio por um link há menos de 90 dias. */
export function parceiroGuardado(): string | null {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as Guardado | null
    if (g && codigos().includes(g.codigo) && Date.now() - g.em < VALIDADE_MS) return g.codigo
  } catch { /* sem armazenamento: sem parceiro */ }
  return null
}

/** Lê o `?parceiro=` do endereço, guarda (se ainda não há um) e anota o clique. Roda antes da visita. */
export function lerParceiroDoLink(): void {
  try {
    const q = new URLSearchParams(location.search)
    const codigo = (q.get('parceiro') ?? '').trim().toLowerCase()
    if (!codigo) return
    // tira da barra: um F5 ou um link copiado daqui não carrega o código adiante
    const u = new URL(location.href)
    u.searchParams.delete('parceiro')
    history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash)
    if (!codigos().includes(codigo)) return
    if (!parceiroGuardado()) localStorage.setItem(CHAVE, JSON.stringify({ codigo, em: Date.now() } satisfies Guardado))
    // o clique conta para o link que foi clicado (mesmo que o navegador já seja de outro parceiro)
    const link = (q.get('utm_source') ?? q.get('origem') ?? '').trim().slice(0, 60) || null
    void fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_toque_parceiro`, {
      method: 'POST', keepalive: true,
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${SUPABASE.anonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_marca: MARCA.id, p_codigo: codigo, p_visitante: visitante(), p_link: link }),
    }).catch(() => { /* o clique se perde, o cadastro não */ })
  } catch { /* nunca atrapalha a entrada */ }
}

/**
 * O endereço gravado no cadastro, com o parceiro na FRENTE (o servidor guarda
 * só os primeiros 300 caracteres: o código não pode ficar no fim e ser cortado).
 */
export function paginaComParceiro(pagina: URL): URL {
  const codigo = parceiroGuardado()
  if (!codigo) return pagina
  const nova = new URL(pagina.origin + pagina.pathname)
  nova.searchParams.set('parceiro', codigo)
  pagina.searchParams.forEach((v, k) => { if (k !== 'parceiro') nova.searchParams.append(k, v) })
  nova.hash = pagina.hash
  return nova
}

/** Conta nova que entrou por outro caminho (ex.: comprou direto): o banco liga ao parceiro guardado, se couber. */
export function vincularParceiro(sessao: SessaoTeeds): void {
  const codigo = parceiroGuardado()
  if (!codigo) return
  const chave = `${CHAVE}.vinculado.${sessao.usuario.id}`
  try { if (sessionStorage.getItem(chave)) return; sessionStorage.setItem(chave, '1') } catch { /* tenta mesmo assim */ }
  void fetch(`${SUPABASE.url}/rest/v1/rpc/teeds_vincular_parceiro`, {
    method: 'POST',
    headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_marca: MARCA.id, p_codigo: codigo }),
  }).catch(() => undefined)
}

/* ------------------------------------------------------------------ relatório (só o admin geral) */

export interface ClienteDoParceiro { userId: string; nome: string | null; email: string; criadoEm: string; status: string; fonte: string | null; operacoes: number; markup: number; volume: number }
export interface LinhaDoParceiro {
  codigo: string; nome: string; cliques: number; leads: number; contasNovas: number; clientes: number; ativos: number
  operaram: number; operacoes: number; volume: number; markup: number; resultado: number; lista: ClienteDoParceiro[]
}

const rpc = async <T>(sessao: SessaoTeeds, nome: string, corpo: unknown): Promise<T> => {
  const r = await fetch(`${SUPABASE.url}/rest/v1/rpc/${nome}`, {
    method: 'POST', headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(String(e?.message || `Não consegui falar com o banco agora (${r.status}).`)) }
  return r.json() as Promise<T>
}

export const souAdminGeral = (sessao: SessaoTeeds) => rpc<boolean>(sessao, 'teeds_sou_admin_geral', {}).catch(() => false)

export async function relatorioDosParceiros(sessao: SessaoTeeds, de: string, ate: string, marca: string = MARCA.id): Promise<LinhaDoParceiro[]> {
  const r = await rpc<{ parceiros: any[] }>(sessao, 'teeds_relatorio_parceiros', { p_marca: marca, p_de: de, p_ate: ate, p_fuso: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo' })
  const n = (v: unknown) => Number(v ?? 0) || 0
  return (r?.parceiros ?? []).map((p) => ({
    codigo: String(p.codigo ?? ''), nome: String(p.nome ?? ''), cliques: n(p.cliques), leads: n(p.leads), contasNovas: n(p.contas_novas),
    clientes: n(p.clientes), ativos: n(p.ativos), operaram: n(p.operaram), operacoes: n(p.operacoes), volume: n(p.volume), markup: n(p.markup), resultado: n(p.resultado),
    lista: (p.lista ?? []).map((c: any) => ({ userId: c.user_id, nome: c.nome ?? null, email: c.email, criadoEm: c.criado_em, status: c.status, fonte: c.fonte ?? null, operacoes: n(c.operacoes), markup: n(c.markup), volume: n(c.volume) })),
  }))
}

export const trocarParceiro = (sessao: SessaoTeeds, userId: string, codigo: string | null, motivo: string, marca: string = MARCA.id) =>
  rpc<null>(sessao, 'teeds_trocar_parceiro', { p_user: userId, p_marca: marca, p_codigo: codigo, p_motivo: motivo })
