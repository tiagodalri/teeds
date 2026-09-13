/** Offline authorization regressions. No credentials, production calls or trades. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'

const pasta = await mkdtemp(join(tmpdir(), 'teeds-demo-access-'))
const fetchOriginal = globalThis.fetch
try {
  const saida = join(pasta, 'access.mjs')
  await build({
    stdin: { contents: "export { usuarioDoToken, somenteDemoDoUsuario } from './servidor/src/supabase.ts'", resolveDir: resolve('.') },
    bundle: true, platform: 'node', format: 'esm', outfile: saida, logLevel: 'silent',
    define: {
      'process.env.SUPABASE_URL': '"https://auth.example"',
      'process.env.SUPABASE_SECRET': '"test-only-not-a-secret"',
    },
    // Do not read .env or initialize the trading runtime in a unit test.
    plugins: [{ name: 'no-runtime', setup(b) {
      b.onResolve({ filter: /^\.\/ambiente$/ }, () => ({ path: 'runtime', namespace: 'test-empty' }))
      b.onLoad({ filter: /.*/, namespace: 'test-empty' }, () => ({ contents: '' }))
    } }],
  })
  const { usuarioDoToken, somenteDemoDoUsuario } = await import(pathToFileURL(saida))
  const dono = { id: 'admin-test', email: 'teeds@gmail.com' }
  let consultas = 0
  globalThis.fetch = async (url, init) => {
    consultas++
    assert.equal(init.headers.Authorization, 'Bearer test-token')
    assert.ok(String(url).endsWith('/auth/v1/user'), 'A trava não consulta permissão no banco')
    return Response.json(dono)
  }
  assert.deepEqual(await usuarioDoToken('test-token'), dono)
  // A trava é do e-mail, vale em qualquer marca e não pergunta nada ao banco.
  // Até 13/09/2026 ela dependia de ser administrador DAQUELA marca — e o
  // mesmo login ficava preso à demo na Teeds e solto na OMNI.
  assert.equal(somenteDemoDoUsuario(dono), true)
  assert.equal(somenteDemoDoUsuario({ ...dono, email: ' TEEDS@gmail.com ' }), true)
  assert.equal(somenteDemoDoUsuario({ ...dono, email: 'cliente@example.com' }), false)
  assert.equal(consultas, 1, 'Só a identidade é consultada')
  globalThis.fetch = async () => new Response('', { status: 503 })
  assert.equal(await usuarioDoToken('test-token'), null)
  assert.equal(somenteDemoDoUsuario(dono), true, 'Banco fora do ar não solta a trava')
  const servidor = await readFile('servidor/src/servidor.ts', 'utf8')
  const rota = servidor.slice(servidor.indexOf("url.pathname === '/api/sessao'"), servidor.indexOf('// ---- guardar a autorizacao'))
  assert.ok(rota.indexOf('somenteDemoDoUsuario(dono)') < rota.indexOf('await iniciar('))
  assert.ok(rota.includes("conta.type !== 'demo'"))
  assert.ok(servidor.includes('conversar({ id: dono.id, somenteDemo }'))
  console.log('✓ Identidade verificada, trava de demo por e-mail em qualquer marca, isolamento de clientes, falhas fechadas e proteção antes do início do robô')
} finally {
  globalThis.fetch = fetchOriginal
  await rm(pasta, { recursive: true, force: true })
}
