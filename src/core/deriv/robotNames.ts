/**
 * Nomes dos robos.
 *
 * A Deriv identifica cada execucao por um numero (run_id) e nao guarda
 * nome. A Teeds guarda o apelido no navegador, associado a esse numero.
 */

const CHAVE = 'teeds.robos.nomes'

type Mapa = Record<string, string>

function ler(): Mapa {
  try {
    return JSON.parse(localStorage.getItem(CHAVE) || '{}') as Mapa
  } catch {
    return {}
  }
}

function gravar(m: Mapa): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(m))
  } catch {
    /* navegador sem armazenamento: seguimos sem nomes salvos */
  }
}

export function nomeDoRobo(runId: string, padrao = ''): string {
  return ler()[runId] || padrao
}

export function batizarRobo(runId: string, nome: string): void {
  const m = ler()
  const limpo = nome.trim().slice(0, 40)
  if (limpo) m[runId] = limpo
  else delete m[runId]
  gravar(m)
}

export function todosOsNomes(): Mapa {
  return ler()
}

/** Sugere o proximo nome livre para um modelo: "Acima de 5", "Acima de 5 (2)"... */
export function sugerirNome(base: string): string {
  const usados = new Set(Object.values(ler()))
  if (!usados.has(base)) return base
  for (let i = 2; i < 100; i++) {
    const tentativa = `${base} (${i})`
    if (!usados.has(tentativa)) return tentativa
  }
  return base
}
