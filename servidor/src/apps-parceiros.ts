import { marcaPorId, MARCAS } from '../../src/marca/marcas'
import { appDoParceiroDoCliente, appsDosParceiros } from './supabase'

/**
 * Os apps da Deriv que o servidor aceita, por marca (27/10/2026).
 *
 * Antes, cada marca tinha um app só (o do build) e o servidor sempre usava
 * esse. Com os parceiros de divulgação, o cliente do parceiro conecta pelo app
 * DO PARCEIRO (o markup cai lá e a Deriv separa sozinha), então a autorização
 * guardada no cofre leva o app junto, e é com ele que se renova e se opera.
 *
 * Só vale app conhecido: o padrão da marca ou o de um parceiro dela (tabela
 * parceiros). Um app desconhecido vindo do navegador é ignorado e cai no
 * padrão, como era antes. A lista se atualiza a cada 5 minutos.
 */
let porMarca = new Map<string, Set<string>>()
let marcaDoAppParceiro = new Map<string, string>()
/** `${marca}:${codigo}` → app do parceiro (só app liberado). */
let appDoCodigo = new Map<string, string>()
let lidoEm = 0

async function atualizar(): Promise<void> {
  if (Date.now() - lidoEm < 5 * 60_000) return
  lidoEm = Date.now()
  try {
    const lista = await appsDosParceiros()
    const nova = new Map<string, Set<string>>(), marcas = new Map<string, string>(), codigos = new Map<string, string>()
    for (const l of lista) { nova.set(l.marca, (nova.get(l.marca) ?? new Set()).add(l.appId)); marcas.set(l.appId, l.marca); codigos.set(`${l.marca}:${l.codigo}`, l.appId) }
    porMarca = nova; marcaDoAppParceiro = marcas; appDoCodigo = codigos
  } catch (e) { console.warn('[apps] não li os apps dos parceiros:', (e as Error).message) }
}
void atualizar()
setInterval(() => { void atualizar() }, 5 * 60_000).unref()

/** O app que vale para uma autorização desta marca: o informado, se conhecido; senão o padrão. */
export function appValido(marca: string, appId: string | undefined | null): string {
  const padrao = marcaPorId(marca).appId
  if (!appId || appId === padrao) return padrao
  return porMarca.get(marcaPorId(marca).id)?.has(appId) ? appId : padrao
}

/** Para a atribuição de contratos: app de parceiro → marca dele. */
export function marcaDoApp(appId: string): string | undefined {
  return Object.values(MARCAS).find((m) => m.appId === appId)?.id ?? marcaDoAppParceiro.get(appId)
}
export const todasAsMarcasDosApps = () => new Map<string, string>([...Object.values(MARCAS).map((m) => [m.appId, m.id] as [string, string]), ...marcaDoAppParceiro])

/** O app com que este cliente deve conectar (o do parceiro, se liberado). */
export async function appParaConectar(userId: string, marca: string): Promise<string> {
  await atualizar()
  try { return appValido(marca, await appDoParceiroDoCliente(userId, marcaPorId(marca).id)) } catch { return marcaPorId(marca).appId }
}

/**
 * A vitrine do pedido (27/10/2026: o parceiro vale pela URL). O navegador diz
 * em qual endereço o cliente está: 'n', 'v' ou '' (direto). Código de fora da
 * lista vira direto. O app é o do parceiro daquela vitrine, ou o da marca.
 */
export function vitrineDoPedido(marca: string, codigo: unknown): string | undefined {
  if (typeof codigo !== 'string') return undefined
  const c = codigo.trim().toLowerCase()
  if (!c || c === 'direto') return ''
  return (marcaPorId(marca).parceiros ?? []).includes(c) ? c : ''
}
export async function appDaVitrine(marca: string, vitrine: string | undefined): Promise<string> {
  await atualizar()
  const m = marcaPorId(marca)
  if (!vitrine) return m.appId
  return appDoCodigo.get(`${m.id}:${vitrine}`) ?? m.appId
}
