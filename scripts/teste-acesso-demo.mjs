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
    if (String(url).endsWith('/auth/v1/user')) return Response.json(dono)
    assert.ok(String(url).includes('user_id=eq.admin-test'))
    assert.ok(String(url).includes('marca=eq.teeds'))
    return Response.json([{ user_id: dono.id }])
  }
  assert.deepEqual(await usuarioDoToken('test-token'), dono)
  assert.equal(await somenteDemoDoUsuario('test-token', dono, 'teeds'), true)
  assert.equal(await somenteDemoDoUsuario('test-token', { ...dono, email: 'cliente@example.com' }, 'teeds'), false)
  assert.equal(consultas, 2, 'Other users do not need an extra permission query')
  globalThis.fetch = async () => Response.json([])
  assert.equal(await somenteDemoDoUsuario('test-token', dono, 'omni'), false, 'Admin permission stays brand scoped')
  globalThis.fetch = async () => Response.json([{ user_id: 'another-admin' }])
  assert.equal(await somenteDemoDoUsuario('test-token', dono, 'teeds'), false)
  globalThis.fetch = async () => new Response('', { status: 503 })
  await assert.rejects(somenteDemoDoUsuario('test-token', dono, 'teeds'))
  assert.equal(await usuarioDoToken('test-token'), null)
  globalThis.fetch = async () => Response.json({ unexpected: true })
  await assert.rejects(somenteDemoDoUsuario('test-token', dono, 'teeds'))
  globalThis.fetch = async () => { throw new Error('offline') }
  await assert.rejects(somenteDemoDoUsuario('test-token', dono, 'teeds'))
  const servidor = await readFile('servidor/src/servidor.ts', 'utf8')
  const rota = servidor.slice(servidor.indexOf("url.pathname === '/api/sessao'"), servidor.indexOf('// ---- guardar a autorizacao'))
  assert.ok(rota.indexOf('somenteDemoDoUsuario(cracha, dono, marcaDoPedido)') < rota.indexOf('await iniciar('))
  assert.ok(rota.includes("conta.type !== 'demo'"))
  assert.ok(servidor.includes('conversar({ id: dono.id, somenteDemo }'))
  console.log('✓ Identidade verificada, ADM por marca, isolamento de clientes, falhas fechadas e proteção antes do início do robô')
} finally {
  globalThis.fetch = fetchOriginal
  await rm(pasta, { recursive: true, force: true })
}
