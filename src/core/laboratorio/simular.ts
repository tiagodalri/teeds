/**
 * O que o Laboratório de IA conta sobre uma receita, sem ligar nada:
 *  - `simular`: a receita rodando nos dígitos reais do histórico, pela mesma
 *    máquina da fita ao vivo (maquina.ts);
 *  - `escadaDaReceita`: o termômetro, quanto cada perda seguida pede de saldo;
 *  - `leituraDoPagamento`: o que o pagamento de um contrato quer dizer
 *    (quanto volta, a chance teórica e o ponto de equilíbrio).
 *
 * Histórico de dígitos não prevê o mercado: mostra como a regra se comporta.
 */
import { estadoInicial, faseAtiva, passo, valorDepoisDaPerda, type Ambiente } from './maquina'
import { chanceTeorica, type Contrato, type Receita } from './receita'

export interface ResultadoDaSimulacao {
  ticks: number
  entradas: number
  ganhas: number
  perdidas: number
  desistencias: number
  resultado: number
  /** Resultado acumulado depois de cada operação liquidada. */
  curva: number[]
  /** Quanto a curva chegou a cair do seu ponto mais alto. */
  piorQueda: number
  maiorSequenciaDePerdas: number
  maiorEntrada: number
  /** Quantas sequências de perdas de cada tamanho (1, 2, 3...). */
  sequencias: number[]
  /** Na base: quantas vezes entrou e quantas ganhou (a taxa real da compra). */
  base: { entradas: number; ganhas: number }
  recuperacao: { entradas: number; ganhas: number }
  /** Entradas por hora, pelos ~2 s por tick do 75 Index. */
  entradasPorHora: number
  /** O saldo de partida da simulação (0 = sem limite). */
  saldo: number
  /** A próxima compra não coube no saldo que sobrou: a conta quebrou aqui e a simulação parou. */
  quebrou: { noTick: number; operacao: number; resultado: number; compraQueFaltou: number } | null
}

const SEGUNDOS_POR_TICK = 2

/**
 * Roda a receita nos dígitos. Com `saldo`, a conta tem fundo: quando a próxima
 * compra passa do que sobrou, ela quebra ali e a simulação para (sem saldo,
 * toda escada parece fechar no lucro, porque nenhuma conta seria pequena demais).
 */
export function simular(r: Receita, digitos: number[], amb: Ambiente, saldo = 0): ResultadoDaSimulacao {
  const e = estadoInicial(amb.base)
  const s: ResultadoDaSimulacao = {
    ticks: digitos.length, entradas: 0, ganhas: 0, perdidas: 0, desistencias: 0, resultado: 0, curva: [], piorQueda: 0,
    maiorSequenciaDePerdas: 0, maiorEntrada: 0, sequencias: [], base: { entradas: 0, ganhas: 0 }, recuperacao: { entradas: 0, ganhas: 0 }, entradasPorHora: 0,
    saldo, quebrou: null,
  }
  let topo = 0, seq = 0
  const fechaSequencia = () => { if (seq > 0) { s.sequencias[seq - 1] = (s.sequencias[seq - 1] ?? 0) + 1; seq = 0 } }
  let lidos = 0
  fora: for (const d of digitos) {
    lidos++
    for (const ev of passo(r, e, d, amb)) {
      if (ev.tipo === 'entra') {
        if (saldo > 0 && ev.valor > Math.round((saldo + s.resultado) * 100) / 100 + 1e-9) {
          s.quebrou = { noTick: lidos, operacao: s.entradas + 1, resultado: s.resultado, compraQueFaltou: ev.valor }
          break fora
        }
        s.entradas++; s.maiorEntrada = Math.max(s.maiorEntrada, ev.valor)
        s[ev.fase === 'base' ? 'base' : 'recuperacao'].entradas++
      } else if (ev.tipo === 'ganhou' || ev.tipo === 'perdeu' || ev.tipo === 'desistiu') {
        s.resultado = Math.round((s.resultado + ev.lucro) * 100) / 100
        s.curva.push(s.resultado)
        topo = Math.max(topo, s.resultado)
        s.piorQueda = Math.max(s.piorQueda, Math.round((topo - s.resultado) * 100) / 100)
        if (ev.tipo === 'ganhou') { s.ganhas++; s[ev.fase === 'base' ? 'base' : 'recuperacao'].ganhas++; fechaSequencia() }
        else { s.perdidas++; seq++; s.maiorSequenciaDePerdas = Math.max(s.maiorSequenciaDePerdas, seq); if (ev.tipo === 'desistiu') { s.desistencias++; fechaSequencia() } }
      }
    }
  }
  fechaSequencia()
  for (let i = 0; i < s.sequencias.length; i++) s.sequencias[i] ??= 0
  s.ticks = lidos
  s.entradasPorHora = lidos ? Math.round((s.entradas / (lidos * SEGUNDOS_POR_TICK)) * 3600) : 0
  return s
}

/* ------------------------------------------------------------------ o termômetro da escada */

export interface DegrauDaEscada { perdas: number; proximaEntrada: number; perdaAcumulada: number; saldoParaAguentar: number }

/** A escada da receita: depois de N perdas seguidas, quanto é a próxima compra e quanto saldo isso pede. */
export function escadaDaReceita(r: Receita, base: number, porDolar: (c: Contrato) => number, passos = 12): DegrauDaEscada[] {
  const l: DegrauDaEscada[] = []
  let prejuizo = base
  for (let n = 1; n <= passos; n++) {
    if (r.escada.desistirApos > 0 && n >= r.escada.desistirApos) break
    const vaiPara = r.recuperacao && n >= r.escada.recuperarApos ? 'recuperacao' : 'base'
    const proxima = valorDepoisDaPerda(r, base, n, prejuizo, faseAtiva(r, vaiPara).contrato, porDolar)
    l.push({ perdas: n, proximaEntrada: proxima, perdaAcumulada: Math.round(prejuizo * 100) / 100, saldoParaAguentar: Math.round((prejuizo + proxima) * 100) / 100 })
    prejuizo = Math.round((prejuizo + proxima) * 100) / 100
  }
  return l
}

/* ------------------------------------------------------------------ o pagamento, em português */

export interface LeituraDoPagamento {
  /** Quanto volta por US$ 1 (com a entrada). */
  porDolar: number
  /** Lucro sobre a entrada, em % (porDolar − 1). */
  lucroPct: number
  /** Chance teórica de acerto (cada dígito 10%). */
  chance: number
  /** Acerto mínimo para não perder no longo prazo: 1 ÷ porDolar. */
  equilibrio: number
  /** De cada US$ 100 colocados, quanto volta na teoria (chance × pagamento). */
  volta: number
}

export function leituraDoPagamento(c: Contrato, porDolar: number): LeituraDoPagamento {
  const chance = chanceTeorica(c)
  return {
    porDolar, lucroPct: Math.round((porDolar - 1) * 10000) / 100, chance,
    equilibrio: porDolar > 0 ? 1 / porDolar : 1, volta: Math.round(chance * porDolar * 10000) / 100,
  }
}
