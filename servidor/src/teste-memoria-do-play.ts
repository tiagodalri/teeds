/**
 * A memória curta do play (13/11/2026): o que ela guarda, o que ela solta.
 * Roda sem banco: o fetch é trocado por um falso que conta as chamadas.
 */
process.env.SUPABASE_URL = 'https://falso.supabase.co'
process.env.SUPABASE_SECRET = 'falsa'

let chamadas: string[] = []
let resposta: (url: string) => unknown = () => true
let falhar = false
globalThis.fetch = (async (url: string) => {
  chamadas.push(String(url))
  if (falhar) return new Response(JSON.stringify({ message: 'caiu' }), { status: 500 })
  return new Response(JSON.stringify(resposta(String(url))), { status: 200 })
}) as typeof fetch

let agora = 1_000_000
Date.now = () => agora

const { roboLiberado, simuladorPermitido, contasDoUsuarioParaLigar, limitesDoCliente } = await import('./supabase')

let falhas = 0
function confere(nome: string, ok: boolean) {
  console.log(`${ok ? 'ok  ' : 'FALHOU'} ${nome}`)
  if (!ok) falhas++
}
const pausa = () => new Promise((r) => setTimeout(r, 0))

// 1. dois plays juntos dividem a mesma consulta
chamadas = []; resposta = () => true
const [a, b] = await Promise.all([roboLiberado('u1', 'globalfly', 'gulf'), roboLiberado('u1', 'globalfly', 'gulf')])
confere('dois pedidos juntos = 1 consulta', a === true && b === true && chamadas.length === 1)

// 2. "sim" vale 5 minutos
await pausa(); agora += 4 * 60_000
await roboLiberado('u1', 'globalfly', 'gulf')
confere('"sim" lembrado por 4 min', chamadas.length === 1)
agora += 2 * 60_000
await roboLiberado('u1', 'globalfly', 'gulf')
confere('"sim" pergunta de novo depois de 5 min', chamadas.length === 2)

// 3. "não" expira em 10 s (quem acabou de comprar não fica barrado)
chamadas = []; resposta = () => false
confere('"não" chega', (await simuladorPermitido('u2', 'globalfly')) === false)
await pausa(); agora += 5_000
await simuladorPermitido('u2', 'globalfly')
confere('"não" lembrado por 5 s', chamadas.length === 1)
resposta = () => true; agora += 6_000
confere('"não" expira em 10 s e vira "sim"', (await simuladorPermitido('u2', 'globalfly')) === true && chamadas.length === 2)

// 4. erro não fica guardado
chamadas = []; falhar = true
let deuErro = false
try { await roboLiberado('u3', 'globalfly', 'phenom') } catch { deuErro = true }
await pausa(); falhar = false; resposta = () => true
confere('erro chega a quem pediu', deuErro)
confere('depois do erro, pergunta de novo', (await roboLiberado('u3', 'globalfly', 'phenom')) === true && chamadas.length === 2)

// 5. conta recém-conectada: a lista lembrada não barra ninguém
chamadas = []; let contas = ['ROT1']
resposta = () => contas.map((c) => ({ conta_id: c }))
confere('contas: primeira leitura', (await contasDoUsuarioParaLigar('u4', 'globalfly', 'ROT1')).includes('ROT1'))
await pausa(); agora += 1_000
await contasDoUsuarioParaLigar('u4', 'globalfly', 'ROT1')
confere('contas: lembradas', chamadas.length === 1)
contas = ['ROT1', 'ROT2']
confere('contas: conta nova faz reler na hora', (await contasDoUsuarioParaLigar('u4', 'globalfly', 'ROT2')).includes('ROT2') && chamadas.length === 2)

// 6. limites: erro vira "sem ajuste", não derruba o play
chamadas = []; falhar = true
confere('limites: erro vira null', (await limitesDoCliente('u5')) === null)
falhar = false; resposta = () => [{ entrada_maxima: 10 }]
await pausa()
confere('limites: depois do erro lê de novo', (await limitesDoCliente('u5'))?.entradaMaxima === 10)

console.log(falhas ? `\n${falhas} falha(s)` : '\ntudo certo')
process.exit(falhas ? 1 : 0)
