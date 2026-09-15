// Anexa uma versao aos arquivos no index.html publicado, para que o navegador
// sempre pegue a versao nova mesmo com nomes de arquivo fixos.
//
// Le a marca do ambiente, igual ao vite.config.ts — sem isso, o build da OMNI
// carimbaria a versao no index.html da Teeds.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { versionarReferencias } from './versionar-assets.mjs'

const marca = process.env.MARCA === 'omni' ? 'omni' : 'teeds'
const pasta = marca === 'teeds' ? 'docs' : `docs-${marca}`
const arquivo = `${pasta}/index.html`

// JS e CSS entram no carimbo: uma mudança só de estilo também precisa furar o cache.
const assets = readdirSync(`${pasta}/assets`).filter((nome) => /\.(?:js|css)$/.test(nome)).sort()
// Derivado do próprio build: duas montagens iguais geram a mesma versão.
// Isso mantém a proteção de cache sem criar alterações fantasmas no Git.
const hash = createHash('sha256')
for (const nome of assets) hash.update(readFileSync(`${pasta}/assets/${nome}`))
const v = hash.digest('hex').slice(0, 12)
for (const nome of assets.filter((nome) => nome.endsWith('.js'))) {
  const caminho = `${pasta}/assets/${nome}`
  writeFileSync(caminho, versionarReferencias(readFileSync(caminho, 'utf8'), v))
}
writeFileSync(arquivo, versionarReferencias(readFileSync(arquivo, 'utf8'), v))
// O service worker pré-carrega os mesmos assets: precisa do mesmo "?v=", senão o
// cache nunca casa com o que o index.html pede.
const sw = `${pasta}/sw.js`
if (existsSync(sw)) writeFileSync(sw, versionarReferencias(readFileSync(sw, 'utf8'), v))
console.log(`versao publicada (${marca}):`, v)
