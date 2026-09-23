import './ambiente'
import { montarConfig, aplicarVigente, listarRobos } from './sessoes'
import { vigente, emTesteNoDemo, conferirRoboDaMarca, ErroDeValidacao, linhaDe } from './parametros'
import { parametrosPadrao } from '../../src/core/deriv/parametros'

/**
 * O lado do servidor dos parâmetros, sem banco (a memória começa vazia =
 * padrão do código):
 *  - vigente() devolve o padrão e versão null sem linha;
 *  - montarConfig SOBRESCREVE o que a tela manda (gatilho, margem, modo);
 *  - o robô precisa pertencer à marca;
 *  - listarRobos descreve pelo vigente.
 *
 *   npm run parametros   (roda junto com as provas do núcleo)
 */
let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

console.log('\nSERVIDOR · PARÂMETROS SEM BANCO = PADRÃO DO CÓDIGO\n')
const v = vigente('omni', 'omniover', false)
conferir('sem linha: padrão do código, versão null, sem teste', [v.versao, v.testeDemo, v.parametros.entrada.lossVirtual], [null, false, 4])
conferir('sem linha: demo também recebe o padrão', vigente('omni', 'omniover', true).versao, null)
conferir('sem linha: nada em teste', [emTesteNoDemo('omni', 'omniover'), linhaDe('omni', 'omniover')], [null, null])
let erro = ''
try { conferirRoboDaMarca('omni', 'superior5') } catch (e) { erro = e instanceof ErroDeValidacao ? e.erros[0] : 'outro' }
conferir('AG7 da Teeds não pertence à OMNI', erro, 'Este robô não pertence a esta plataforma.')
conferir('OMNI Over pertence à OMNI', (() => { try { conferirRoboDaMarca('omni', 'omniover'); return true } catch { return false } })(), true)

console.log('\nSERVIDOR · O QUE A TELA MANDA NÃO VENCE O PAINEL\n')
const daTela = { valorInicial: 1, valorAoVencer: 1, fatorGale: 0.5, galeApos: 3, lucroSobrePrejuizo: 0.9, valorMaximo: 0, takeProfit: 10, stopLoss: 20, maxOperacoes: 0 }
const config = montarConfig({ roboId: 'omniover', valorInicial: 1, stopLoss: 20, takeProfit: 10, config: daTela, modo: 'conservador' }, vigente('omni', 'omniover', false))
conferir('gatilho 3 e margem 0,5 da tela viram os do padrão (1 e 0,05)', [config.galeApos, config.fatorGale, config.lucroSobrePrejuizo], [1, 0.05, 0])
conferir('stop, meta e entrada continuam os do cliente', [config.stopLoss, config.takeProfit, config.valorInicial], [20, 10, 1])
conferir('a config leva os parâmetros e o modo explícito', [config.parametros?.entrada.lossVirtual, config.modo, config.parametrosVersao], [4, 'conservador', null])
const agressivo = montarConfig({ roboId: 'omniover', valorInicial: 1, stopLoss: 20, takeProfit: 10, modo: 'agressivo' }, vigente('omni', 'omniover', false))
conferir('modo agressivo pedido num robô que tem: margem 1, 20% do prejuízo', [agressivo.modo, agressivo.fatorGale, agressivo.lucroSobrePrejuizo], ['agressivo', 1, 0.2])
const bull = montarConfig({ roboId: 'omnibull', valorInicial: 1, stopLoss: 20, takeProfit: 10, modo: 'agressivo' }, vigente('omni', 'omnibull', false))
conferir('modo agressivo pedido num robô sem: cai para conservador', [bull.modo, bull.fatorGale], ['conservador', 0.05])
const semVigente = montarConfig({ roboId: 'omniover', valorInicial: 1, stopLoss: 20, takeProfit: 10, config: daTela })
conferir('montarConfig sem vigente (legado/testes) continua confiando na tela', semVigente.galeApos, 3)
const p3 = parametrosPadrao('omniover'); p3.entrada.lossVirtual = 3
const c3 = aplicarVigente({ ...daTela }, { modo: 'conservador' }, { parametros: p3, versao: 9, testeDemo: true })
conferir('aplicarVigente carrega versão e marca de teste', [c3.parametrosVersao, c3.parametrosTesteDemo, c3.parametros?.entrada.lossVirtual], [9, true, 3])

console.log('\nSERVIDOR · LISTAR ROBÔS DESCREVE PELO VIGENTE\n')
const omni = listarRobos('omni')
conferir('OMNI lista só os robôs dela', omni.map((r) => r.id).includes('superior5'), false)
conferir('descrição vem de descrever()', omni.find((r) => r.id === 'omniover')?.descricao, 'Espera 4 dígitos seguidos que teriam perdido e entra; segue a sequência até fechá-la.')

console.log(`\n${passou} certos, ${falhou} errados\n`)
process.exit(falhou ? 1 : 0)
