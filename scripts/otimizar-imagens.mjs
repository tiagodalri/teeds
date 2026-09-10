// Conversão de formatos, sem alterar as artes originais.
// Use sharp instalado ou SHARP_MODULE_PATH apontando para o módulo existente.
import { createRequire } from 'node:module'
import { readdir, stat } from 'node:fs/promises'
import { resolve, join } from 'node:path'
const require = createRequire(import.meta.url)
const sharp = require(process.env.SHARP_MODULE_PATH || 'sharp')
const publicDir = resolve('public')
const arquivos = ['aulas-hero.png']
for (const pasta of ['aulas-teeds', 'aulas-especialista', 'marketplace']) {
  for (const nome of await readdir(join(publicDir, pasta))) {
    if (/\.(jpg|png)$/i.test(nome)) arquivos.push(`${pasta}/${nome}`)
  }
}
let original = 0, otimizado = 0, mobile = 0
for (const arquivo of arquivos) {
  const entrada = join(publicDir, arquivo)
  const saida = entrada.replace(/\.(jpg|png)$/i, '.webp')
  const pequena = entrada.replace(/\.(jpg|png)$/i, '-mobile.webp')
  const full = await sharp(entrada).webp({ quality: 88, effort: 6 }).toFile(saida)
  const small = await sharp(entrada).resize({ width: 768, withoutEnlargement: true }).webp({ quality: 88, effort: 6 }).toFile(pequena)
  original += (await stat(entrada)).size
  otimizado += full.size
  mobile += small.size
}
console.log(JSON.stringify({ imagens: arquivos.length, bytesOriginais: original, bytesWebp: otimizado, bytesMobile: mobile, reducaoDesktop: Math.round((1 - otimizado / original) * 100), reducaoMobile: Math.round((1 - mobile / original) * 100) }, null, 2))
