import { usuarioDoToken } from './supabase'

/**
 * A memória de um minuto do crachá, conferida por linha de comando.
 *
 * Roda sem servidor e sem banco: a conferência no Supabase é trocada por
 * uma de mentira que conta quantas vezes foi chamada, e o relógio é
 * injetado para o minuto passar sem esperar.
 *
 *   npm run cracha
 */

let passou = 0, falhou = 0
function caso(nome: string, certo: boolean, detalhe = '') {
  certo ? passou++ : falhou++
  console.log(`${certo ? '  ok  ' : ' FALHA'}  ${nome}${!certo && detalhe ? `\n        ${detalhe}` : ''}`)
}

let relogio = 1_000_000
const agora = () => relogio
let idas = 0
const validos: Record<string, { id: string; email: string }> = {
  'cracha-ana': { id: 'ana', email: 'ana@x' },
  'cracha-bia': { id: 'bia', email: 'bia@x' },
}
const conferir = async (t: string) => { idas++; return validos[t] ?? null }
const pedir = (t: string, lembrar: boolean) => usuarioDoToken(t, { lembrar, agora, conferir })

async function rodar() {
  console.log('\nMEMÓRIA DO CRACHÁ — 1 minuto, só para leitura\n')

  idas = 0
  const a1 = await pedir('cracha-ana', true)
  const a2 = await pedir('cracha-ana', true)
  caso('a primeira leitura confere no Supabase; a segunda, 2 s depois, não', a1?.id === 'ana' && a2?.id === 'ana' && idas === 1, `idas=${idas}`)

  idas = 0
  for (let i = 0; i < 29; i++) { relogio += 2_000; await pedir('cracha-ana', true) }
  caso('uma tela consultando a cada 2 s por 58 s: nenhuma ida a mais', idas === 0, `idas=${idas}`)

  idas = 0
  relogio += 3_000
  await pedir('cracha-ana', true)
  caso('passado o minuto, confere de novo', idas === 1, `idas=${idas}`)

  idas = 0
  await pedir('cracha-ana', false)
  await pedir('cracha-ana', false)
  caso('ligar, desligar e chat (sem lembrar) conferem a cada pedido', idas === 2, `idas=${idas}`)

  const b = await pedir('cracha-bia', true)
  const a = await pedir('cracha-ana', true)
  caso('cada crachá tem o seu dono — um cliente nunca vira outro', b?.id === 'bia' && a?.id === 'ana')

  idas = 0
  const r1 = await pedir('cracha-falso', true)
  const r2 = await pedir('cracha-falso', true)
  caso('crachá recusado nunca é lembrado', r1 === null && r2 === null && idas === 2, `idas=${idas}`)

  // a Bia saiu da conta: o próximo pedido que confere de verdade apaga a memória
  delete validos['cracha-bia']
  const pedidoQueMuda = await pedir('cracha-bia', false)
  idas = 0
  const leitura = await pedir('cracha-bia', true)
  caso('crachá que deixou de valer num pedido conferido some da memória na hora', pedidoQueMuda === null && leitura === null && idas === 1, `idas=${idas}`)

  caso('crachá vazio é recusado sem ir ao Supabase', (await pedir('', true)) === null)

  console.log(`\n${passou} certos, ${falhou} errados\n`)
  process.exit(falhou ? 1 : 0)
}
void rodar()
