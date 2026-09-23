import './ambiente'
import { MotorTeeds, type ConfigEstrategia, type Contexto } from '../../src/core/deriv/engine'
import { ESTRATEGIAS_LOCAIS, SUPERIOR_5, SMART_03, THE_PALM, FIRST_BLOCK, recuperacaoDoRobo, temModos, modoDaConfig, RECUPERACAO_POR_ROBO } from '../../src/core/deriv/strategies'
import { parametrosPadrao, mesclar, validar, avisos, recuperacaoDe, diferencas, descrever, configDeReferencia, ROBOS_COM_PADRAO, type ParametrosDoRobo } from '../../src/core/deriv/parametros'
import { proximaEntrada, tetoEfetivo } from '../../src/core/deriv/recuperacao'
import { escadaDoRobo, avaliarPlano, markupDaEscada, PAGAMENTO_POR_DOLAR } from '../../src/core/deriv/escada'
import { identidade } from '../../src/core/deriv/branding'

/**
 * Os parâmetros dos robôs, conferidos por linha de comando.
 *
 *   npm run parametros
 *
 * Roda sem servidor, sem banco e sem Deriv. O que se prova aqui:
 *  1. o padrão do código é o que os robôs sempre usaram (nada muda com o banco vazio);
 *  2. a conta da recuperação em recuperacao.ts é byte a byte a fórmula antiga;
 *  3. loss virtual e sequência vêm dos parâmetros da sessão;
 *  4. a tabela degrau a degrau, por multiplicador e por valor, com o piso da Deriv;
 *  5. o que acontece depois do último degrau (fórmula, repetir, parar);
 *  6. a escada que a tela mostra é a que o motor sobe — centavo a centavo;
 *  7. validar() recusa o que o gatilho SQL recusa; mesclar() é tolerante;
 *  8. The Palm lê os limites dos parâmetros; o teto da plataforma apara;
 *  9. descrever() gera a mesma frase da vitrine para o padrão;
 * 10. atualizarParametros: na hora sem contrato, pendente com contrato aberto,
 *     recalcula a sequência, nunca toca no stop/meta do cliente.
 */

let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

const BASE: ConfigEstrategia = { valorInicial: .35, valorAoVencer: .35, fatorGale: .05, galeApos: 1, valorMaximo: 0, takeProfit: 100, stopLoss: 100, maxOperacoes: 0 }
const ctx = (digitos: number[], config: ConfigEstrategia = BASE, memoria: Record<string, unknown> = {}): Contexto =>
  ({ digitos, perdasSeguidas: 0, vitoriasSeguidas: 0, operacoes: 0, resultado: 0, prejuizoDaSequencia: 0, memoria, config })
const com = (id: string, ajuste: (p: ParametrosDoRobo) => void, base = .35, modo: 'conservador' | 'agressivo' = 'conservador') => {
  const p = parametrosPadrao(id); ajuste(p)
  return { p, config: configDeReferencia(p, base, modo) }
}

/* ------------------------------------------------------------------ 1 */
console.log('\n1 · O PADRÃO É O QUE OS ROBÔS SEMPRE USARAM\n')
for (const e of ESTRATEGIAS_LOCAIS) {
  const p = parametrosPadrao(e.id)
  conferir(`${e.id}: contrato do padrão bate com a estratégia`, [p.contrato.contractType, p.contrato.barreira], [e.contractType, e.barreira])
  const r = RECUPERACAO_POR_ROBO[e.id]
  conferir(`${e.id}: recuperação do padrão bate com a tabela`, [p.recuperacao.galeApos, p.recuperacao.modos.conservador.margem, p.recuperacao.modos.agressivo], [r.galeApos, r.margem, r.agressivo ?? null])
  conferir(`${e.id}: padrão passa em validar()`, validar(p, e.id), [])
  conferir(`${e.id}: recuperacaoDoRobo com e sem parâmetros dá o mesmo`, recuperacaoDoRobo(e.id, 'agressivo', p), recuperacaoDoRobo(e.id, 'agressivo'))
  conferir(`${e.id}: temModos com e sem parâmetros dá o mesmo`, temModos(e.id, p), temModos(e.id))
}
conferir('ROBOS_COM_PADRAO cobre as estratégias', ESTRATEGIAS_LOCAIS.every((e) => ROBOS_COM_PADRAO.includes(e.id)), true)
conferir('lossVirtual padrão: 4 na família AG7, 2 nos Blocks, 0 no Smart/Göreme', ['superior5', 'omniover', 'firstblock', 'omnibear', 'smart03', 'goreme'].map((id) => parametrosPadrao(id).entrada.lossVirtual), [4, 4, 2, 2, 0, 0])
conferir('The Palm tem palm no padrão; os outros não', [parametrosPadrao('thepalm').palm?.limiteNove, parametrosPadrao('ag2').palm], [12, undefined])

/* ------------------------------------------------------------------ 2 */
console.log('\n2 · A CONTA DA RECUPERAÇÃO É A FÓRMULA ANTIGA, CENTAVO A CENTAVO\n')
{
  // A fórmula que vivia em strategies.ts, copiada literalmente.
  const antiga = (ganhou: boolean, valorAoVencer: number, perdasSeguidas: number, prejuizo: number, retorno: number, config: ConfigEstrategia) => {
    if (ganhou) return valorAoVencer
    if (perdasSeguidas < config.galeApos) return valorAoVencer
    const retornoSeguro = Math.max(0.01, retorno * 0.97)
    const lucroMinimo = Math.max(0.01, valorAoVencer * config.fatorGale, prejuizo * (config.lucroSobrePrejuizo ?? 0))
    return Math.ceil(((prejuizo + lucroMinimo) / retornoSeguro) * 100) / 100
  }
  // Gerador determinístico (sem Math.random: a prova precisa repetir igual).
  let semente = 20260922
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648 }
  let iguais = 0
  for (let i = 0; i < 200; i++) {
    const base = Math.round((0.35 + rnd() * 20) * 100) / 100
    const perdas = 1 + Math.floor(rnd() * 8)
    const prejuizo = Math.round(base * perdas * (1 + rnd() * 3) * 100) / 100
    const retorno = 0.06 + rnd() * 1.9
    const config: ConfigEstrategia = { ...BASE, valorAoVencer: base, valorInicial: base, galeApos: 1 + Math.floor(rnd() * 3), fatorGale: Math.round(rnd() * 100) / 100, lucroSobrePrejuizo: rnd() < 0.5 ? 0 : Math.round(rnd() * 30) / 100 }
    const a = antiga(false, base, perdas, prejuizo, retorno, config)
    const b = proximaEntrada({ ganhou: false, valorAoVencer: base, perdasSeguidas: perdas, prejuizoDaSequencia: prejuizo, retornoLiquidoPorUnidade: retorno, config })
    if (a === b) iguais++
  }
  conferir('200 casos: proximaEntrada sem parâmetros == fórmula antiga', iguais, 200)
  conferir('vitória volta à base', proximaEntrada({ ganhou: true, valorAoVencer: .35, perdasSeguidas: 0, prejuizoDaSequencia: 0, retornoLiquidoPorUnidade: 1.92, config: BASE }), .35)
}

/* ------------------------------------------------------------------ 3 */
console.log('\n3 · LOSS VIRTUAL E SEQUÊNCIA VÊM DOS PARÂMETROS DA SESSÃO\n')
{
  const { config: lv3 } = com('superior5', (p) => { p.entrada.lossVirtual = 3 })
  conferir('AG7 com loss virtual 3: dois dígitos que perderiam ainda esperam', SUPERIOR_5.entrar(ctx([3, 3], lv3)), false)
  conferir('AG7 com loss virtual 3: três liberam', SUPERIOR_5.entrar(ctx([3, 3, 3], lv3)), true)
  conferir('AG7 sem parâmetros continua exigindo quatro', [SUPERIOR_5.entrar(ctx([3, 3, 3])), SUPERIOR_5.entrar(ctx([3, 3, 3, 3]))], [false, true])
  conferir('medidor com config diz alvo 3; sem config, 4', [SUPERIOR_5.medidor!({ digitos: [3, 3], config: lv3 })?.alvo, SUPERIOR_5.medidor!({ digitos: [3, 3] })?.alvo], [3, 4])
  conferir('aguardando com config diz "/3"', SUPERIOR_5.aguardando(ctx([3], lv3)), 'esperando loss virtual — 1/3')
  const { config: lv0 } = com('superior5', (p) => { p.entrada.lossVirtual = 0 })
  conferir('AG7 com loss virtual 0 entra sempre e sem medidor', [SUPERIOR_5.entrar(ctx([8], lv0)), SUPERIOR_5.medidor!({ digitos: [8], config: lv0 })], [true, null])
  const { config: smart2 } = com('smart03', (p) => { p.entrada.lossVirtual = 2 })
  conferir('Smart 03 padrão entra sempre; com loss virtual 2 espera dois dígitos ≤ 3', [SMART_03.entrar(ctx([9])), SMART_03.entrar(ctx([2], smart2)), SMART_03.entrar(ctx([2, 1], smart2))], [true, false, true])
  conferir('Smart 03 padrão: sem medidor, texto do valor base', [SMART_03.medidor!({ digitos: [1] }), SMART_03.aguardando(ctx([1]))], [null, 'entrando na próxima'])
  const { config: semSeq } = com('superior5', (p) => { p.entrada.sequenciaSemAnalise = false })
  const memoria: Record<string, unknown> = {}
  SUPERIOR_5.aposResultado!({ ...ctx([3, 3, 3, 3], semSeq, memoria), ganhou: false, contractType: 'DIGITOVER', digitoSaida: 3 })
  conferir('sequência desligada: a perda NÃO abre sequência', memoria.emSequencia, false)
  const memoria2: Record<string, unknown> = {}
  SUPERIOR_5.aposResultado!({ ...ctx([3, 3, 3, 3], BASE, memoria2), ganhou: false, contractType: 'DIGITOVER', digitoSaida: 3 })
  conferir('sequência ligada (padrão): a perda mantém a sequência e entra sem contar', [memoria2.emSequencia, SUPERIOR_5.entrar(ctx([8, 8], BASE, memoria2))], [true, true])
  conferir('Blocks: loss virtual 3 via parâmetros', [FIRST_BLOCK.entrar(ctx([7, 9], com('firstblock', (p) => { p.entrada.lossVirtual = 3 }).config)), FIRST_BLOCK.entrar(ctx([7, 9, 8], com('firstblock', (p) => { p.entrada.lossVirtual = 3 }).config))], [false, true])
}

/* ------------------------------------------------------------------ 4 */
console.log('\n4 · TABELA DEGRAU A DEGRAU\n')
{
  const { config } = com('firstblock', (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 4 }, { multiplicador: 8 }], depoisDoUltimo: 'formula' } })
  const entrada = (perdas: number, prejuizo: number) => proximaEntrada({ ganhou: false, valorAoVencer: .35, perdasSeguidas: perdas, prejuizoDaSequencia: prejuizo, retornoLiquidoPorUnidade: .845, config })
  conferir('multiplicadores 2/4/8 sobre 0,35: 0,70 / 1,40 / 2,80', [entrada(1, .35), entrada(2, 1.05), entrada(3, 2.45)], [.7, 1.4, 2.8])
  const { config: fixos } = com('firstblock', (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ valor: 1 }, { valor: 2.5 }], depoisDoUltimo: 'formula' } })
  conferir('valores fixos 1,00 / 2,50', [1, 2].map((n) => proximaEntrada({ ganhou: false, valorAoVencer: .35, perdasSeguidas: n, prejuizoDaSequencia: n, retornoLiquidoPorUnidade: .845, config: fixos })), [1, 2.5])
  const { config: um } = com('superior5', (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 1 }], depoisDoUltimo: 'formula' } })
  conferir('multiplicador 1 com base 0,35 dá 0,35 (o piso), nunca 0,20', escadaDoRobo('superior5', .35, 2, 'conservador', um.parametros)[1].valor, .35)
  conferir('escada padrão do AG7 respeita o piso de 0,35 na 2ª entrada', escadaDoRobo('superior5', .35, 2)[1].valor >= .35, true)
  conferir('multiplicador com meio centavo sobe: 0,35 × 4,5 = 1,58', proximaEntrada({ ganhou: false, valorAoVencer: .35, perdasSeguidas: 1, prejuizoDaSequencia: .35, retornoLiquidoPorUnidade: 1.92, config: com('superior5', (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 4.5 }], depoisDoUltimo: 'formula' } }).config }), 1.58)
}

/* ------------------------------------------------------------------ 5 */
console.log('\n5 · DEPOIS DO ÚLTIMO DEGRAU\n')
{
  const tabela = (depois: 'formula' | 'repetir' | 'parar') => com('firstblock', (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 4 }, { multiplicador: 8 }], depoisDoUltimo: depois } }).config
  const quarta = (config: ConfigEstrategia) => proximaEntrada({ ganhou: false, valorAoVencer: .35, perdasSeguidas: 4, prejuizoDaSequencia: 5.25, retornoLiquidoPorUnidade: .845, config })
  conferir('repetir: a 4ª perda repete 2,80', quarta(tabela('repetir')), 2.8)
  conferir('parar: devolve infinito (o freio do motor cuida)', quarta(tabela('parar')), null)  // JSON de Infinity é null
  const pelaFormula = quarta(tabela('formula'))
  conferir('formula: cai na conta pelo payout e cobre o prejuízo', pelaFormula * .845 >= 5.25, true)
  const escada = escadaDoRobo('firstblock', .35, 10, 'conservador', tabela('parar').parametros)
  conferir('escada com "parar": 4 degraus + o marcador esgotado, e para aí', [escada.length, escada[4].esgotada, escada[3].valor], [5, true, 2.8])
  const plano = avaliarPlano('firstblock', .35, 100, 'conservador', tabela('parar').parametros)
  conferir('avaliarPlano avisa que a tabela para antes do stop', [plano.errosSeguidos, plano.paraAntesDoStop, plano.entradaAparada], [4, true, null])
}

/* ------------------------------------------------------------------ 7 */
console.log('\n7 · VALIDAR E MESCLAR\n')
{
  const p = parametrosPadrao('superior5')
  const erro = (ajuste: (x: any) => void) => { const x = JSON.parse(JSON.stringify(p)); ajuste(x); return validar(x, 'superior5').length > 0 }
  conferir('loss virtual 13 recusado', erro((x) => { x.entrada.lossVirtual = 13 }), true)
  conferir('loss virtual -1 recusado', erro((x) => { x.entrada.lossVirtual = -1 }), true)
  conferir('31 degraus recusados', erro((x) => { x.recuperacao.escada = { tipo: 'tabela', degraus: Array.from({ length: 31 }, () => ({ multiplicador: 2 })), depoisDoUltimo: 'formula' } }), true)
  conferir('multiplicador 0,5 recusado', erro((x) => { x.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: .5 }], depoisDoUltimo: 'formula' } }), true)
  conferir('valor fixo 0,30 recusado', erro((x) => { x.recuperacao.escada = { tipo: 'tabela', degraus: [{ valor: .3 }], depoisDoUltimo: 'formula' } }), true)
  conferir('margem 3 recusada', erro((x) => { x.recuperacao.modos.conservador.margem = 3 }), true)
  conferir('chave desconhecida recusada', erro((x) => { x.bonus = 1 }), true)
  conferir('teto 0,20 recusado; teto 0 (sem) e 50 aceitos', [erro((x) => { x.limites.valorMaximoPorEntrada = .2 }), erro((x) => { x.limites.valorMaximoPorEntrada = 0 }), erro((x) => { x.limites.valorMaximoPorEntrada = 50 })], [true, false, false])
  conferir('palm.janela 30 recusada', validar({ ...parametrosPadrao('thepalm'), palm: { ...parametrosPadrao('thepalm').palm!, janela: 30 } }, 'thepalm').length > 0, true)
  conferir('sem depoisDoUltimo na tabela recusado', erro((x) => { x.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }] } }), true)
  const mesclado = mesclar(p, { entrada: { lossVirtual: 3 }, estranha: 1, recuperacao: { modos: { agressivo: null } } })
  conferir('mesclar: chave nova preenchida, estranha ignorada, agressivo null vence', [mesclado.entrada.lossVirtual, mesclado.entrada.sequenciaSemAnalise, (mesclado as any).estranha, mesclado.recuperacao.modos.agressivo, mesclado.recuperacao.descontoRetorno], [3, true, undefined, null, .97])
  conferir('mesclar: tabela gravada vale inteira', mesclar(p, { recuperacao: { escada: { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { lixo: 1 }], depoisDoUltimo: 'parar' } } }).recuperacao.escada, { tipo: 'tabela', degraus: [{ multiplicador: 2 }, {}], depoisDoUltimo: 'parar' })
  conferir('mesclar: {} devolve o padrão', mesclar(p, {}), p)
  conferir('diferencas: o padrão contra ele mesmo não tem chips', diferencas(p, parametrosPadrao('superior5')), [])
  const d = diferencas(mesclar(p, { entrada: { lossVirtual: 3 }, limites: { valorMaximoPorEntrada: 50 } }), p)
  conferir('diferencas: loss virtual 3 e teto viram chips', d.map((x) => x.rotulo), ['loss virtual 3', 'teto US$ 50,00'])
  conferir('avisos: tabela com "parar" e 1 degrau avisa', avisos(mesclar(p, { recuperacao: { escada: { tipo: 'tabela', degraus: [{ multiplicador: 2 }], depoisDoUltimo: 'parar' } } }), 'superior5').length > 0, true)
  conferir('avisos: o padrão do AG7 não avisa nada', avisos(p, 'superior5'), [])
}

/* ------------------------------------------------------------------ 8 */
console.log('\n8 · THE PALM LÊ OS LIMITES; O TETO DA PLATAFORMA APARA\n')
{
  const janela = [...Array(12).fill(3), ...Array(13).fill(7)]   // 0–4 em 48%, último 7
  const memoria = { fasePalm: 'recuperacao-espera' }
  conferir('Palm padrão: 0–4 em 48% libera a recuperação', THE_PALM.entrar(ctx(janela, configDeReferencia(parametrosPadrao('thepalm')), { ...memoria })), true)
  const janela40 = [...Array(10).fill(3), ...Array(15).fill(7)]   // 40%
  conferir('Palm padrão: 40% ainda não libera', THE_PALM.entrar(ctx(janela40, configDeReferencia(parametrosPadrao('thepalm')), { ...memoria })), false)
  const { config: palm40 } = com('thepalm', (p) => { p.palm!.limiteBaixos = 40 })
  conferir('Palm com limiteBaixos 40: libera com 40%', THE_PALM.entrar(ctx(janela40, palm40, { ...memoria })), true)
  conferir('Palm: texto de espera interpola o limite', THE_PALM.aguardando(ctx(janela40, palm40, { fasePalm: 'recuperacao-espera' })).includes('40%'), true)
  const { config: teto1, p: pTeto } = com('firstblock', (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 4 }, { multiplicador: 8 }], depoisDoUltimo: 'formula' }; p.limites.valorMaximoPorEntrada = 1 })
  conferir('tetoEfetivo: 1,00 da plataforma (cliente sem teto)', tetoEfetivo(teto1), 1)
  conferir('teto do cliente menor vence', tetoEfetivo({ ...teto1, valorMaximo: .5 }), .5)
  conferir('escada com teto 1,00: o degrau que pedia 2,80 vira 1,00', escadaDoRobo('firstblock', .35, 4, 'conservador', pTeto).map((d) => d.valor), [.35, .7, 1, 1])
  // O pagamento da Deriv vem em centavos (2,92 para US$ 1 no AG7); o markup é 3% desse valor.
  conferir('markupDaEscada: 3% do pagamento (em centavos) de cada degrau', markupDaEscada('superior5', escadaDoRobo('superior5', 1, 2)).porDegrau[0], Math.round(Math.round(PAGAMENTO_POR_DOLAR.tresDigitos * 100) / 100 * 0.03 * 10000) / 10000)
}

/* ------------------------------------------------------------------ 9 */
console.log('\n9 · DESCREVER GERA A FRASE DA VITRINE\n')
for (const id of ['superior5', 'ag2', 'firstblock', 'secondblock', 'omniover', 'omnibull', 'omnibear', 'smart03', 'goreme', 'thepalm']) {
  const vitrine = identidade(id).descricao
  conferir(`${id}: descrever(padrão) == vitrine`, descrever(id, parametrosPadrao(id)), vitrine)
}
conferir('descrever com loss virtual 3 muda o número', descrever('omniover', mesclar(parametrosPadrao('omniover'), { entrada: { lossVirtual: 3 } })), 'Espera 3 dígitos seguidos que teriam perdido e entra; segue a sequência até fechá-la.')
conferir('modoDaConfig: config.modo explícito vence a inferência', modoDaConfig('superior5', 0.05, 0, { modo: 'agressivo' }), 'agressivo')
conferir('modoDaConfig: sem modo, infere pela margem', [modoDaConfig('superior5', 1, .2), modoDaConfig('superior5', .05, 0)], ['agressivo', 'conservador'])
conferir('recuperacaoDe: na tabela o gatilho é sempre 1', recuperacaoDe(mesclar(parametrosPadrao('superior5'), { recuperacao: { galeApos: 3, escada: { tipo: 'tabela', degraus: [{ multiplicador: 2 }], depoisDoUltimo: 'formula' } } })).galeApos, 1)

/* ------------------------------------------------------------------ 6 e 10: o motor de verdade, com uma Deriv de mentira */
const respirar = () => new Promise((r) => setTimeout(r, 4))
function derivFalsa(id: string) {
  const canais: Record<string, (m: any) => void> = {}
  const compras: Array<{ amount: number; barrier: number; tipo: string }> = []
  const porDolar = (tipo: string, barreira: number) => {
    if (id === 'thepalm') return barreira === 5 ? PAGAMENTO_POR_DOLAR.cincoDigitos : PAGAMENTO_POR_DOLAR.noveDigitos
    const ganham = tipo === 'DIGITOVER' ? 9 - barreira : barreira
    return ganham === 3 ? PAGAMENTO_POR_DOLAR.tresDigitos : ganham === 5 ? PAGAMENTO_POR_DOLAR.cincoDigitos : ganham === 6 ? PAGAMENTO_POR_DOLAR.seisDigitos : PAGAMENTO_POR_DOLAR.noveDigitos
  }
  const socket: any = {
    state: 'open', onStateChange: () => () => {}, reconectarAgora: () => {}, disconnect: () => {},
    subscribe: (req: any, cb: (m: any) => void) => { canais[req.ticks ? 'ticks' : 'contratos'] = cb; return () => {} },
    send: async (req: any) => {
      if (req.ticks_history) throw new Error('sem histórico no teste')
      if (req.buy) {
        const p = req.parameters
        compras.push({ amount: p.amount, barrier: Number(p.barrier), tipo: p.contract_type })
        return { buy: { contract_id: compras.length, transaction_id: compras.length, buy_price: p.amount, payout: Math.round(p.amount * porDolar(p.contract_type, Number(p.barrier)) * 100) / 100, balance_after: 100, purchase_time: 1 } }
      }
      return {}
    },
  }
  return { socket, canais, compras }
}
const digitoQuePerde = (e: { contractType: string; barreira?: number }) => e.contractType === 'DIGITOVER' ? 0 : 9
const tick = (canais: any, d: number, n: number) => canais.ticks({ tick: { symbol: 'R_75', quote: Number(`45189.000${d}`) + n * 0.001, epoch: n, pip_size: 4 } })
const perder = (canais: any, compras: any[], i: number) => canais.contratos({ proposal_open_contract: { contract_id: i + 1, status: 'lost', profit: -compras[i].amount, is_expired: 1, entry_spot: 1, exit_spot: 2, payout: 0, buy_price: compras[i].amount, contract_type: compras[i].tipo, barrier: compras[i].barrier } })

/** Liga o robô com os parâmetros e perde `n` vezes seguidas; devolve o que ele comprou. */
async function perderSeguidas(id: string, parametros: ParametrosDoRobo, n: number, base = .35, modo: 'conservador' | 'agressivo' = 'conservador', stop = 10_000_000, entrar = true) {
  const estrategia = ESTRATEGIAS_LOCAIS.find((e) => e.id === id)!
  const { socket, canais, compras } = derivFalsa(id)
  const config: ConfigEstrategia = { ...configDeReferencia(parametros, base, modo), takeProfit: 100_000, stopLoss: stop }
  const motor = new MotorTeeds({ socket, estrategia, config, symbol: 'R_75', moeda: 'USD', pipSize: 4 })
  motor.ligar(); await respirar()
  let t = 0
  const perde = digitoQuePerde(estrategia)
  // Até a primeira compra: o loss virtual (ou, no Palm, uma janela de 25 e um 9).
  if (!entrar) return { motor, compras, canais, config }
  if (id === 'thepalm') { for (let i = 0; i < 24; i++) tick(canais, 3, ++t); tick(canais, 9, ++t) }
  else for (let i = 0; i < 20 && compras.length === 0; i++) { tick(canais, perde, ++t); await respirar() }
  await respirar()
  for (let i = 0; i < n; i++) {
    if (compras.length <= i) { tick(canais, perde, ++t); await respirar(); await respirar() }
    if (compras.length <= i) break
    perder(canais, compras, i); await respirar(); await respirar()
  }
  return { motor, compras, canais, config }
}

async function provasDoMotor() {
  console.log('\n6 · A ESCADA DA TELA É A QUE O MOTOR SOBE\n')
  const conjuntos: Array<{ nome: string; ajuste: (p: ParametrosDoRobo) => void; modo: 'conservador' | 'agressivo' }> = [
    { nome: 'padrão', ajuste: () => {}, modo: 'conservador' },
    { nome: 'tabela 2/4,5/10 + fórmula', ajuste: (p) => { p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 4.5 }, { multiplicador: 10 }], depoisDoUltimo: 'formula' } }, modo: 'conservador' },
    { nome: 'agressivo margem 1,5', ajuste: (p) => { p.recuperacao.modos.agressivo = { margem: 1.5, sobrePrejuizo: .2 } }, modo: 'agressivo' },
  ]
  for (const e of ESTRATEGIAS_LOCAIS) {
    if (e.id === 'superior5fixo') continue
    for (const c of conjuntos) {
      const p = parametrosPadrao(e.id); c.ajuste(p)
      const { compras, motor } = await perderSeguidas(e.id, p, 7, .35, c.modo)
      const escada = escadaDoRobo(e.id, .35, 8, c.modo, p)
      // O Göreme explode (degrau 7 passa de 10 milhões) e o stop da prova apara: compara até onde cabe.
      const doMotor = compras.slice(0, e.id === 'goreme' ? 6 : 8).map((x) => x.amount)
      conferir(`${e.id} · ${c.nome}: ${doMotor.length} entradas do motor == escada`, doMotor, escada.slice(0, doMotor.length).map((d) => d.valor))
      motor.desligar('fim')
    }
  }

  console.log('\n5b · "PARAR" DESLIGA O ROBÔ NO FIM DA TABELA — E SÓ AÍ\n')
  {
    const p = parametrosPadrao('firstblock')
    p.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 4 }], depoisDoUltimo: 'parar' }
    const { motor, compras } = await perderSeguidas('firstblock', p, 3)
    conferir('comprou base, 2× e 4× (3 entradas) e não uma 4ª', compras.map((c) => c.amount), [.35, .7, 1.4])
    conferir('desligou com o motivo da tabela, sem valorMaximo', [motor.estadoAtual.rodando, motor.estadoAtual.motivoParada], [false, 'tabela de recuperação esgotada'])
    const p2 = parametrosPadrao('firstblock')
    p2.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 4 }, { multiplicador: 8 }], depoisDoUltimo: 'parar' }
    const { motor: m2 } = await perderSeguidas('firstblock', p2, 2)
    conferir('com 3 degraus, depois de 2 perdas ainda está rodando', m2.estadoAtual.rodando, true)
    m2.desligar('fim')
  }

  console.log('\n10 · PARÂMETROS NOVOS ENTRAM NA HORA (OU NA LIQUIDAÇÃO)\n')
  {
    // Sem contrato aberto, em sequência: recalcula a próxima entrada pela regra nova.
    const { motor, compras, canais, config } = await perderSeguidas('firstblock', parametrosPadrao('firstblock'), 2)
    conferir('cenário: 2 perdas, próxima entrada pela fórmula', [compras.length, motor.estadoAtual.perdasSeguidas, motor.estadoAtual.emOperacao], [2, 2, false])
    const antes = motor.estadoAtual.valorAtual
    const novos = parametrosPadrao('firstblock')
    novos.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 10 }], depoisDoUltimo: 'formula' }
    novos.entrada.lossVirtual = 3
    motor.atualizarParametros({ parametros: novos, versao: 7, testeDemo: false })
    conferir('aplicou na hora: versão 7 na config, próxima entrada = 10 × 0,35', [config.parametrosVersao, motor.estadoAtual.valorAtual, antes !== motor.estadoAtual.valorAtual], [7, 3.5, true])
    conferir('stop e meta do cliente intactos', [config.stopLoss, config.takeProfit, config.valorAoVencer], [10_000_000, 100_000, .35])
    conferir('registrou no diário da sessão', motor.estadoAtual.registros[0]?.texto.includes('versão 7'), true)
    conferir('a próxima contagem de loss virtual já usa 3', FIRST_BLOCK.medidor!({ digitos: [9], config })?.alvo, 3)
    // Agora com contrato aberto: fica pendente e entra na liquidação, antes da próxima entrada.
    tick(canais, 9, 100); await respirar(); await respirar()
    conferir('cenário: contrato aberto com a entrada de 3,50', [compras[2]?.amount, motor.estadoAtual.emOperacao], [3.5, true])
    const maisNovos = parametrosPadrao('firstblock')
    maisNovos.recuperacao.escada = { tipo: 'tabela', degraus: [{ multiplicador: 2 }, { multiplicador: 10 }, { multiplicador: 20 }], depoisDoUltimo: 'formula' }
    motor.atualizarParametros({ parametros: maisNovos, versao: 8, testeDemo: false })
    conferir('com contrato aberto: fica pendente, a config ainda é a 7', [motor.parametrosAguardando?.versao, config.parametrosVersao], [8, 7])
    perder(canais, compras, 2); await respirar(); await respirar()
    conferir('liquidou: a versão 8 entrou e a próxima entrada é 20 × 0,35', [config.parametrosVersao, motor.parametrosAguardando, motor.estadoAtual.valorAtual], [8, null, 7])
    // Fora de sequência: valorAtual volta à base; modo agressivo removido cai para conservador.
    const { motor: m3, config: c3 } = await perderSeguidas('superior5', parametrosPadrao('superior5'), 0, .35, 'agressivo', 10_000_000, false)
    const semAgressivo = parametrosPadrao('superior5'); semAgressivo.recuperacao.modos.agressivo = null
    m3.atualizarParametros({ parametros: semAgressivo, versao: 2, testeDemo: true })
    conferir('sem sequência: base; agressivo retirado → conservador; marca teste no demo', [m3.estadoAtual.valorAtual, c3.modo, c3.fatorGale, c3.parametrosTesteDemo], [.35, 'conservador', .05, true])
    motor.desligar('fim'); m3.desligar('fim')
  }
}

provasDoMotor().then(() => {
  console.log(`\n${passou} certos, ${falhou} errados\n`)
  process.exit(falhou ? 1 : 0)
}).catch((e) => { console.error(e); process.exit(1) })
