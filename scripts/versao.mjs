// Anexa uma versao aos arquivos no index.html publicado, para que o navegador
// sempre pegue a versao nova mesmo com nomes de arquivo fixos.
//
// Le a marca do ambiente, igual ao vite.config.ts — sem isso, o build da OMNI
// carimbaria a versao no index.html da Teeds.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { versionarReferencias } from './versionar-assets.mjs'

const marca = process.env.MARCA === 'omni' ? 'omni' : 'teeds'
const pasta = marca === 'teeds' ? 'docs' : `docs-${marca}`
const arquivo = `${pasta}/index.html`

const v = Date.now().toString(36)
for (const nome of readdirSync(`${pasta}/assets`)) {
  if (!nome.endsWith('.js')) continue
  const caminho = `${pasta}/assets/${nome}`
  writeFileSync(caminho, versionarReferencias(readFileSync(caminho, 'utf8'), v))
}
writeFileSync(arquivo, versionarReferencias(readFileSync(arquivo, 'utf8'), v))
console.log(`versao publicada (${marca}):`, v)
