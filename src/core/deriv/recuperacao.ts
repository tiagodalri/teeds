/**
 * A escada de recuperação — uma implementação só para o motor, a tela e as
 * provas.
 *
 * Antes a conta da próxima entrada vivia em strategies.ts (para o motor) e
 * era copiada em escada.ts (para o Gerenciamento). Duas cópias da mesma
 * fórmula é uma promessa que envelhece: bastava um centavo diferente para a
 * cabine subir uma escada e a planilha do aluno mostrar outra. Agora quem
 * quiser saber "quanto entra depois de n perdas" chama daqui.
 *
 * SEM `config.parametros`, `proximaEntrada` é byte a byte a fórmula que o
 * motor sempre usou (a prova 2 de teste-parametros confere 200 casos contra
 * a fórmula antiga copiada literalmente). Com parâmetros, a escada pode ser
 * uma TABELA ditada pelo admin, degrau a degrau, e cada número da conta
 * (segurança do payout, lucro mínimo) vem do que foi publicado.
 */
import type { ConfigEstrategia } from './engine'
import { DESCONTO_RETORNO, LUCRO_MINIMO, PALM_PADRAO, type EscadaConfigurada } from './parametros'

export interface ArgsEntrada {
  ganhou: boolean
  /** A entrada base do cliente (o valor ao vencer). */
  valorAoVencer: number
  /** Já contando a perda que acabou de acontecer (o motor incrementa antes de perguntar). */
  perdasSeguidas: number
  /** Soma das perdas da sequência atual, em positivo. */
  prejuizoDaSequencia: number
  /** Lucro por US$ 1 do último contrato comprado. */
  retornoLiquidoPorUnidade: number
  config: ConfigEstrategia
}

/** Meio centavo sobe: 0,35 × 2 = 0,70 exato, 0,35 × 4,5 = 1,575 → 1,58. */
const centavosParaCima = (v: number) => Math.ceil(v * 100 - 1e-9) / 100

/**
 * O degrau `i` da tabela (i = perdasSeguidas − 1: o índice 0 é a entrada
 * após a 1ª perda). Null quando a sequência passou do último degrau.
 */
function degrauDaTabela(escada: Extract<EscadaConfigurada, { tipo: 'tabela' }>, i: number, base: number): number | null {
  const d = escada.degraus[i]
  if (!d) return null
  return 'valor' in d ? d.valor : centavosParaCima(base * d.multiplicador)
}

/**
 * Se a tabela responde por esta perda, o valor dela; se não há tabela, ou a
 * tabela acabou e manda cair na fórmula, undefined. Infinity = "parar": o
 * motor tem um freio explícito para esse valor.
 */
function pelaTabela(a: ArgsEntrada): number | undefined {
  const escada = a.config.parametros?.recuperacao.escada
  if (!escada || escada.tipo !== 'tabela') return undefined
  const d = degrauDaTabela(escada, a.perdasSeguidas - 1, a.valorAoVencer)
  if (d !== null) return d
  if (escada.depoisDoUltimo === 'repetir') return degrauDaTabela(escada, escada.degraus.length - 1, a.valorAoVencer)!
  if (escada.depoisDoUltimo === 'parar') return Number.POSITIVE_INFINITY
  return undefined   // 'formula': cai na conta pelo payout real
}

/**
 * A próxima entrada dos robôs de dígito.
 *
 * Ganhou: volta à base. Perdeu dentro do gatilho: repete a base. Senão,
 * recupera pelo payout realmente comprado: o que falta cobrir mais o lucro
 * exigido, dividido pelo retorno com a segurança descontada, arredondado
 * para cima no centavo. Com tabela, o degrau vale no lugar da conta.
 */
export function proximaEntrada(a: ArgsEntrada): number {
  if (a.ganhou) return a.valorAoVencer
  const rec = a.config.parametros?.recuperacao
  const desconto = rec?.descontoRetorno ?? DESCONTO_RETORNO
  const lucroMin = rec?.lucroMinimo ?? LUCRO_MINIMO
  const daTabela = pelaTabela(a)
  if (daTabela !== undefined) return daTabela
  // Na tabela o gatilho não existe (o degrau 1 já é recuperação); só a fórmula o respeita.
  if (rec?.escada.tipo !== 'tabela' && a.perdasSeguidas < a.config.galeApos) return a.valorAoVencer
  // A segurança absorve pequenas oscilações do retorno entre um contrato e o seguinte.
  const retornoSeguro = Math.max(0.01, a.retornoLiquidoPorUnidade * desconto)
  // Piso: uma fração da base. No modo agressivo, o alvo cresce com o
  // buraco: uma parte do prejuízo da sequência vira lucro exigido.
  const lucroMinimo = Math.max(lucroMin, a.valorAoVencer * a.config.fatorGale, a.prejuizoDaSequencia * (a.config.lucroSobrePrejuizo ?? 0))
  return Math.ceil(((a.prejuizoDaSequencia + lucroMinimo) / retornoSeguro) * 100) / 100
}

/**
 * A próxima entrada do The Palm. A tabela vale igual (a partir da 2ª
 * entrada); sem tabela, a conta de sempre: antes da primeira compra Under 5
 * o último payout conhecido ainda é o pequeno retorno do Under 9, então o
 * robô presume o retorno inicial configurado; depois usa a cotação
 * realmente comprada.
 */
export function proximaEntradaPalm(a: ArgsEntrada & { contractType: string }): number {
  if (a.ganhou) return a.valorAoVencer
  const daTabela = pelaTabela(a)
  if (daTabela !== undefined) return daTabela
  const palm = a.config.parametros?.palm ?? PALM_PADRAO
  const retornoObservado = a.contractType === 'DIGITUNDER' && a.retornoLiquidoPorUnidade > 0.5
    ? a.retornoLiquidoPorUnidade
    : palm.retornoInicial
  const retornoSeguro = Math.max(0.01, retornoObservado * palm.desconto)
  const lucroAlvo = Math.max(0.01, a.valorAoVencer * palm.margem)
  return Math.ceil(((a.prejuizoDaSequencia + lucroAlvo) / retornoSeguro) * 100) / 100
}

/**
 * O teto de UMA entrada: o menor entre o teto do cliente (valorMaximo) e o
 * teto da plataforma para o robô. 0 = sem teto. O admin só pode ADICIONAR
 * freio — nunca aumenta o que o cliente definiu.
 */
export function tetoEfetivo(config: ConfigEstrategia): number {
  const doCliente = config.valorMaximo > 0 ? config.valorMaximo : Number.POSITIVE_INFINITY
  const daPlataforma = config.parametros?.limites.valorMaximoPorEntrada ?? 0
  const teto = Math.min(doCliente, daPlataforma > 0 ? daPlataforma : Number.POSITIVE_INFINITY)
  return Number.isFinite(teto) ? teto : 0
}
