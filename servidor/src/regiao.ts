/**
 * De que cidade um cliente está acessando.
 *
 * Decisão do Tiago em 02/10/2026, entre duas opções: guardar o IP, ou ler o
 * IP e guardar só a cidade. Ele escolheu a segunda. Então este arquivo tem
 * uma regra que não pode ser quebrada depois: **o IP entra, a cidade sai, e
 * o endereço não é devolvido a ninguém nem gravado em lugar nenhum.**
 *
 * A consulta vai para um serviço público de geolocalização. O que sai daqui
 * é o IP e nada mais — sem nome, sem e-mail, sem id de cliente. O serviço
 * não tem como saber de quem é o endereço que recebeu.
 *
 * O cache existe por dois motivos: um cliente que recarrega a tela dez vezes
 * não gera dez consultas externas, e o serviço gratuito tem limite por
 * minuto. É memória do processo, some no reinício, e guarda cidade — não IP
 * como chave de nada que persista.
 */

export interface Lugar { cidade: string; regiao: string; pais: string }

const CACHE_MS = 12 * 60 * 60 * 1000
const CACHE_MAXIMO = 5_000
const cache = new Map<string, { lugar: Lugar; ate: number }>()

/** Endereço de rede interna ou de teste não tem cidade para consultar. */
export function enderecoPrivado(ip: string): boolean {
  if (!ip) return true
  if (ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.')) return true
  if (/^10\./.test(ip) || /^192\.168\./.test(ip)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true
  if (/^(fc|fd)/i.test(ip)) return true
  return false
}

/**
 * Cidade, estado e país de um IP. Null quando não dá para saber.
 *
 * Nunca lança e nunca demora: dois segundos de teto. Saber a cidade é um
 * detalhe da ficha; segurar o pedido do cliente por isso seria trocar o
 * essencial pelo acessório.
 */
export async function lugarDoEndereco(ip: string): Promise<Lugar | null> {
  if (enderecoPrivado(ip)) return null
  const agora = Date.now()
  const guardado = cache.get(ip)
  if (guardado && guardado.ate > agora) return guardado.lugar
  try {
    const r = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}?fields=success,city,region,country`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!r.ok) return null
    const d = await r.json() as { success?: boolean; city?: string; region?: string; country?: string }
    if (!d?.success) return null
    const lugar: Lugar = {
      cidade: String(d.city ?? '').slice(0, 80),
      regiao: String(d.region ?? '').slice(0, 80),
      pais: String(d.country ?? '').slice(0, 80),
    }
    if (!lugar.cidade && !lugar.regiao) return null
    if (cache.size >= CACHE_MAXIMO) {
      for (const [k, v] of cache) if (v.ate <= agora) cache.delete(k)
      if (cache.size >= CACHE_MAXIMO) cache.clear()
    }
    cache.set(ip, { lugar, ate: agora + CACHE_MS })
    return lugar
  } catch {
    return null
  }
}
