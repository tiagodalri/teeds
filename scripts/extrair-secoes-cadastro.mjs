import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(process.argv[2] + '/package.json')
const postcss = require('postcss')
const css = fs.readFileSync(process.argv[3], 'utf8')
const raiz = postcss.parse(css)
const QUERO = /\.(lp-rotulo|lp-cab\b|lp-cab-|lp-oque|lp-real|lp-notif|lp-iphone|lp-prints?\b|lp-print-|lp-selo-meta|lp-curva|lp-manual|lp-cabine|lp-op-|lp-hangar|lp-libera|lp-vidro|lp-anima|lp-visto|lp-faixa)/
const NAO = /\.(lp-checkin|lp-voo|lp-comando|lp-presentes|lp-rota|lp-porque|lp-final|lp-heroi|lp-imac|lp-ingresso|lp-piloto|lp-aviso-real|v-barra|lp-canhoto)|^(html|body)|:root/
const kf = new Set()
raiz.walkRules((r) => {
  if (r.parent.type === 'atrule' && /keyframes/.test(r.parent.name)) return
  const sels = r.selectors.filter((s) => QUERO.test(s) && !NAO.test(s))
  if (!sels.length) { r.remove(); return }
  r.selectors = sels.map((s) => '.cpl-lp ' + s)
  r.walkDecls(/^animation(-name)?$/, (d) => d.value.split(/[ ,]+/).forEach((w) => /^lp-/.test(w) && kf.add(w)))
})
raiz.walkAtRules(/keyframes/, (a) => { if (!kf.has(a.params)) a.remove() })
raiz.walkAtRules('media', (a) => { if (!a.nodes || !a.nodes.length) a.remove() })
raiz.walkComments((c) => c.remove())
const vars = `.cpl-lp { --azul: #051528; --azul-2: #0A2038; --azul-3: #12304F; --marfim: #F3F0E9; --aco: #9CB1C7; --ouro: #B78D39; --ouro-claro: #D4A64A; --linha: rgba(156, 177, 199, .18); --erro: #F1828A; --raio: 16px; }\n`
let out = raiz.toString().replace(/\n{2,}/g, '\n')
fs.writeFileSync(process.argv[4], '/* Seções da antiga globalflytrade.com/cadastro reaproveitadas no cadastro com planos (11/11/2026).\n   Geradas de captura-globalfly/estilo.css com o escopo .cpl-lp (scripts/extrair-secoes-cadastro.mjs). */\n' + vars + out)
console.log('regras', (out.match(/\{/g) || []).length, 'keyframes', [...kf].join(' '))
