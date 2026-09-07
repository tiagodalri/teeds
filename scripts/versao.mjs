// Anexa uma versao aos arquivos no index.html publicado, para que o navegador
// sempre pegue a versao nova mesmo com nomes de arquivo fixos.
//
// Le a marca do ambiente, igual ao vite.config.ts — sem isso, o build da OMNI
// carimbaria a versao no index.html da Teeds.
import { readFileSync, writeFileSync } from 'node:fs'

const marca = process.env.MARCA === 'omni' ? 'omni' : 'teeds'
const pasta = marca === 'teeds' ? 'docs' : `docs-${marca}`
const arquivo = `${pasta}/index.html`

const v = Date.now().toString(36)
let html = readFileSync(arquivo, 'utf8')
html = html.replace(
  new RegExp(`(assets/${marca}\\.(?:js|css))(\\?v=[^"']*)?`, 'g'),
  `$1?v=${v}`)
writeFileSync(arquivo, html)
console.log(`versao publicada (${marca}):`, v)
