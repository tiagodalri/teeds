/**
 * Provas da tabela de marcas.
 *
 *   cd servidor && npm run marcas
 *
 * Existe por causa de 07/09: uma troca de texto acertou a entrada errada da
 * tabela e a Teeds foi publicada com os quatro robos e os nomes da OMNI.
 * Passou por typecheck, build e trava de separacao — nenhum deles sabe o que
 * cada marca DEVE ter. Esta prova sabe, e roda antes de toda publicacao.
 */
import { MARCAS, marcaPorId } from '../../src/marca/marcas'
import { ESTRATEGIAS_LOCAIS, nomeDoRoboNaMarca } from '../../src/core/deriv/strategies'

let certos = 0, errados = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  if (JSON.stringify(deu) === JSON.stringify(esperado)) certos++
  else { errados++; console.error(`✕ ${nome}\n   esperava ${JSON.stringify(esperado)}\n   veio     ${JSON.stringify(deu)}`) }
}
const vitrine = (id: string) => {
  const m = marcaPorId(id)
  return m.robos.map((r) => nomeDoRoboNaMarca(ESTRATEGIAS_LOCAIS.find((e) => e.id === r)!, m))
}

conferir('Teeds: sete robos, incluindo o exclusivo The Palm', vitrine('teeds'),
  ['Teeds - AG7', 'Teeds - AG2', 'Teeds Smart 03', 'Teeds Göreme', 'First Block', 'Second Block', 'The Palm'])
conferir('OMNI: quatro robos, nomes da casa', vitrine('omni'),
  ['OMNI Under', 'OMNI Over', 'OMNI Bull', 'OMNI Bear'])
conferir('Teeds nao tem apelido nenhum', MARCAS.teeds.nomesDosRobos, undefined)
conferir('The Palm existe somente na Teeds', MARCAS.teeds.robos.includes('thepalm') && !MARCAS.omni.robos.includes('thepalm'), true)
for (const m of Object.values(MARCAS)) {
  for (const r of m.robos) conferir(`${m.prosa}: robo "${r}" existe no motor`, ESTRATEGIAS_LOCAIS.some((e) => e.id === r), true)
  conferir(`${m.prosa}: nenhum nome de outra marca`, vitrine(m.id).some((n) => Object.values(MARCAS).some((o) => o.id !== m.id && n.startsWith(o.nome))), false)
  conferir(`${m.prosa}: dominio do site = dominio do e-mail`, new URL(m.redirectUri).hostname, (m.email.remetente ?? '').split('@')[1]?.replace('>', ''))
}
console.log(`\n${certos} certos, ${errados} errados`)
process.exit(errados ? 1 : 0)
