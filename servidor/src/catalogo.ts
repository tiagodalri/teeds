import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs'
import { marcaPorId } from '../../src/marca/marcas'

const arquivo = new URL('../.robos-config.json', import.meta.url)
function ler(): Record<string, Record<string, boolean>> {
  if (!existsSync(arquivo)) return {}
  return JSON.parse(readFileSync(arquivo, 'utf8'))
}
export function catalogo(marca: string) {
  const m = marcaPorId(marca)
  const valores = ler()[m.id] ?? {}
  return m.robos.map(id => ({ id, ativo: valores[id] !== false }))
}
export function alterarRobo(marca: string, id: string, ativo: boolean) {
  const m = marcaPorId(marca)
  if (!m.robos.includes(id)) throw new Error('Modelo não pertence a esta plataforma.')
  const dados = ler()
  dados[m.id] = { ...dados[m.id], [id]: ativo }
  const temporario = new URL('../.robos-config.json.tmp', import.meta.url)
  writeFileSync(temporario, JSON.stringify(dados), { mode: 0o600 })
  renameSync(temporario, arquivo)
  return catalogo(marca)
}
