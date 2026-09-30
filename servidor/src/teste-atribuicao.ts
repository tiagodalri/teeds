/**
 * Provas de quem é cada contrato.
 *
 *   cd servidor && node dist/teste-atribuicao.mjs
 *
 * Sem rede, sem banco, sem credencial: só as três pistas (registro nosso,
 * app da Deriv e horário) decidindo casos que já aconteceram de verdade.
 */
import { atribuir, separarPorOrigem, FOLGA_DA_JANELA_S, type Pistas } from './atribuicao'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) { certos++; console.log(`  ok    ${nome}`) }
  else { errados++; console.error(`  FALHA ${nome}: esperava ${JSON.stringify(esperado)}, veio ${JSON.stringify(deu)}`) }
}

const APP_TEEDS = '34gMUQCaYNX1M93Q7aq5R'
const APP_OMNI = '34kKoxRsAd3xEcyFNw7v5'
const APP_DERIV = '2'
const marcaDoApp = new Map([[APP_TEEDS, 'teeds'], [APP_OMNI, 'omni']])
const meiaNoite = Math.floor(Date.parse('2026-09-24T00:00:00Z') / 1000)
const emSegundos = (h: number, m = 0) => meiaNoite + h * 3600 + m * 60

const contrato = (id: number, compradoEm: number | null = emSegundos(12)) =>
  ({ contractId: id, entrada: 1, pagamento: 2.92, saida: 0, compradoEm })

const pistas = (p: Partial<Pistas> = {}): Pistas => ({
  appPorContrato: new Map(),
  nossosContratos: new Map(),
  janelas: [],
  marcaDoApp,
  ...p,
})

console.log('\n1 · A PROVA DIRETA: O CONTRATO QUE A PLATAFORMA COMPROU\n')
{
  const p = pistas({ nossosContratos: new Map([[101, { marca: 'omni', roboId: 'omniover' }]]) })
  const a = atribuir(contrato(101), p)
  conferir('contrato registrado é da marca que o registrou', [a.origem, a.pista], ['omni', 'registro'])
  conferir('o motivo diz qual robô comprou', a.motivo.includes('omniover'), true)
}

console.log('\n2 · O APP DO EXTRATO DECIDE O RESTO\n')
{
  const p = pistas({ appPorContrato: new Map([[201, APP_TEEDS], [202, APP_OMNI], [203, APP_DERIV]]) })
  conferir('app da Teeds → teeds', atribuir(contrato(201), p).origem, 'teeds')
  conferir('app da OMNI → omni', atribuir(contrato(202), p).origem, 'omni')
  conferir('app da própria Deriv → externo', atribuir(contrato(203), p).origem, 'externo')
  conferir('o app fica guardado no externo', atribuir(contrato(203), p).app, APP_DERIV)
}

console.log('\n3 · O HORÁRIO, QUANDO NÃO HÁ APP NEM REGISTRO\n')
{
  const janela = { marca: 'teeds', de: emSegundos(10), ate: emSegundos(11) }
  const p = pistas({ janelas: [janela] })
  conferir('comprado no meio da nossa sessão é nosso', atribuir(contrato(301, emSegundos(10, 30)), p).origem, 'teeds')
  conferir('a pista fica registrada como horário', atribuir(contrato(301, emSegundos(10, 30)), p).pista, 'horario')
  conferir('logo antes da sessão, dentro da folga, ainda é nosso', atribuir(contrato(302, janela.de - FOLGA_DA_JANELA_S + 5), p).origem, 'teeds')
  conferir('fora da sessão não é nosso', atribuir(contrato(303, emSegundos(13)), p).origem, 'sem-dono')
  conferir('sem horário nenhum não é nosso', atribuir(contrato(304, null), p).origem, 'sem-dono')
}

console.log('\n4 · A ORDEM DAS PISTAS\n')
{
  // Aconteceu de verdade: a conta do cliente estava ligada às duas marcas.
  const p = pistas({
    nossosContratos: new Map([[401, { marca: 'omni', roboId: 'ag2' }]]),
    appPorContrato: new Map([[401, APP_TEEDS]]),
  })
  conferir('registro nosso vence o app', atribuir(contrato(401), p).origem, 'omni')
  const q = pistas({
    appPorContrato: new Map([[402, APP_DERIV]]),
    janelas: [{ marca: 'teeds', de: emSegundos(0), ate: emSegundos(23) }],
  })
  conferir('app de fora vence o horário: sessão aberta não torna o contrato nosso', atribuir(contrato(402), q).origem, 'externo')
}

console.log('\n5 · O CASO DO CLIENTE QUE NUNCA LIGOU UM ROBÔ AQUI\n')
{
  // 28/09/2026: 220 contratos num dia em que ele nem entrou na plataforma.
  const contratos = Array.from({ length: 220 }, (_, i) => contrato(500 + i, emSegundos(9, i % 60)))
  const p = pistas({ appPorContrato: new Map(contratos.map((c) => [c.contractId, APP_DERIV])) })
  const { baldes } = separarPorOrigem(contratos, p)
  conferir('nada vira receita nossa', baldes.get('teeds'), undefined)
  conferir('tudo vai para externo', baldes.get('externo')?.operacoes, 220)
  conferir('o markup do externo fica separado, não somado à receita', Number((baldes.get('externo')?.markupEstimado ?? 0).toFixed(2)), Number((220 * 2.92 * 0.03).toFixed(2)))
}

console.log('\n6 · UM DIA MISTURADO, COMO O DO MATHEUS EM 24/09\n')
{
  const nossos = Array.from({ length: 91 }, (_, i) => contrato(600 + i, emSegundos(20, i % 40)))
  const fora = Array.from({ length: 9 }, (_, i) => contrato(700 + i, emSegundos(21, i)))
  const p = pistas({
    nossosContratos: new Map(nossos.map((c) => [c.contractId, { marca: 'omni', roboId: 'ag2' }])),
    appPorContrato: new Map([...nossos.map((c) => [c.contractId, APP_OMNI] as const), ...fora.map((c) => [c.contractId, APP_DERIV] as const)]),
  })
  const { baldes } = separarPorOrigem([...nossos, ...fora], p)
  conferir('91 contratos da OMNI', baldes.get('omni')?.operacoes, 91)
  conferir('9 contratos de fora', baldes.get('externo')?.operacoes, 9)
  conferir('os 91 vieram da prova direta', baldes.get('omni')?.porPista.registro, 91)
  conferir('a receita da OMNI é 3% do pagamento dela', Number((baldes.get('omni')?.markupEstimado ?? 0).toFixed(4)), Number((91 * 2.92 * 0.03).toFixed(4)))
}

console.log(`\n${certos} certos, ${errados} errados`)
process.exit(errados ? 1 : 0)
