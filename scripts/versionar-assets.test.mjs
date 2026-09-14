import test from 'node:test'
import assert from 'node:assert/strict'
import { versionarReferencias } from './versionar-assets.mjs'

test('entrada, import estático, lazy e preload usam a mesma versão', () => {
  const v = 'regressao'
  for (const marca of ['teeds', 'omni']) {
    const html = versionarReferencias(`<script src="/assets/${marca}.js"></script>`, v)
    const chunk = versionarReferencias(`import {r} from "./${marca}.js";import('./MonitoramentoPanel.js');const preload=["assets/${marca}.js","assets/${marca}.css"]`, v)
    assert.ok(html.includes(`${marca}.js?v=${v}`))
    assert.ok(chunk.includes(`./${marca}.js?v=${v}`))
    assert.ok(chunk.includes('./MonitoramentoPanel.js?v=regressao'))
    assert.ok(chunk.includes(`assets/${marca}.css?v=${v}`))
    assert.equal(new URL(`./${marca}.js?v=${v}`, 'https://site.test/assets/MonitoramentoPanel.js').href,
      new URL(`/assets/${marca}.js?v=${v}`, 'https://site.test').href)
  }
})
test('reexecução troca a versão sem duplicar parâmetros; não altera terceiros ou imagens', () => {
  const s = 'import "./main.js?v=antiga";const url="https://other.test/a.js",img="/assets/logo.png"'
  const esperado = 'import "./main.js?v=nova";const url="https://other.test/a.js",img="/assets/logo.png"'
  assert.equal(versionarReferencias(s, 'nova'), esperado)
  assert.equal(versionarReferencias(esperado, 'nova'), esperado)
})
