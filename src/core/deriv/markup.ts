import { DERIV } from './config'
import type { AuthSession } from './auth'

/**
 * Faturamento de markup da Teeds.
 *
 * O markup e a comissao do dono do app: uma porcentagem do PAGAMENTO
 * potencial de cada contrato negociado atraves da aplicacao. Teto de 3%.
 * Exige o escopo application_read no token.
 */

export interface MarkupResumo {
  comissao: number
  volume: number
  pagamentos: number
  contratos: number
  clientes: number
  porApp: Array<{ appId: string; nome: string; comissao: number; volume: number; contratos: number }>
}

export interface DiaMarkup {
  data: string
  comissao: number
  volume: number
  contratos: number
}

export class SemPermissao extends Error {
  constructor() {
    super('O login atual não tem permissão para ler estatísticas.')
    this.name = 'SemPermissao'
  }
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * A tabela de lucros devolve no maximo 500 por vez (o extrato aceita 999),
 * entao o teto por dia precisa de mais paginas para cobrir o mesmo volume.
 * 80 x 500 = 40 mil contratos num unico dia — o recorde ate hoje foi 15.893.
 */
const POR_PAGINA_LUCROS = 500
const MAX_PAGINAS_LUCROS = 80

/** Mesma janela, em epoch de segundos — o que o `statement` exige. */
export function janelaEpoch(dias: number): { de: number; ate: number } {
  const agora = new Date()
  const inicio = new Date()
  inicio.setDate(inicio.getDate() - (dias - 1))
  inicio.setHours(0, 0, 0, 0)
  return { de: Math.floor(inicio.getTime() / 1000), ate: Math.floor(agora.getTime() / 1000) + 60 }
}

export function periodo(dias: number): { de: string; ate: string } {
  const ate = new Date()
  const de = new Date()
  de.setDate(de.getDate() - (dias - 1))
  return { de: iso(de), ate: iso(ate) }
}

async function consultar(session: AuthSession, de: string, ate: string): Promise<any> {
  const url = `${DERIV.restBase}/applications/v1/markup-statistics?date_from=${de}&date_to=${ate}`
  const res = await fetch(url, {
    headers: {
      'Deriv-App-ID': session.appId ?? MARCA.appId,
      Authorization: `Bearer ${session.accessToken}`,
    },
  })
  if (res.status === 403) throw new SemPermissao()
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const first = body?.errors?.[0]
    throw new Error(first?.message || body?.message || `Erro ${res.status}`)
  }
  return body?.data ?? {}
}

/** Totais do periodo. */
export async function buscarResumo(session: AuthSession, de: string, ate: string): Promise<MarkupResumo> {
  const d = await consultar(session, de, ate)
  return {
    comissao: Number(d.total_app_markup_usd ?? 0),
    volume: Number(d.total_volume_usd ?? 0),
    pagamentos: Number(d.total_payout_usd ?? 0),
    contratos: Number(d.total_contract_count ?? 0),
    clientes: Number(d.total_client_count ?? 0),
    porApp: (d.breakdown ?? []).map((b: any) => ({
      appId: String(b.app_id ?? b.application_id ?? ''),
      nome: b.app_name ?? b.name ?? '',
      comissao: Number(b.app_markup_usd ?? b.total_app_markup_usd ?? 0),
      volume: Number(b.volume_usd ?? b.total_volume_usd ?? 0),
      contratos: Number(b.contract_count ?? b.total_contract_count ?? 0),
    })),
  }
}

/** Serie diaria, consultando dia a dia (a API so devolve totais por intervalo). */
export async function buscarSerieDiaria(session: AuthSession, dias: number): Promise<DiaMarkup[]> {
  const datas: string[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    datas.push(iso(d))
  }

  const saida: DiaMarkup[] = []
  const lote = 6 // respeita o limite de 60 requisicoes por minuto
  for (let i = 0; i < datas.length; i += lote) {
    const parte = datas.slice(i, i + lote)
    const res = await Promise.all(
      parte.map(async (data) => {
        try {
          const d = await consultar(session, data, data)
          return {
            data,
            comissao: Number(d.total_app_markup_usd ?? 0),
            volume: Number(d.total_volume_usd ?? 0),
            contratos: Number(d.total_contract_count ?? 0),
          }
        } catch (e) {
          if (e instanceof SemPermissao) throw e
          return { data, comissao: 0, volume: 0, contratos: 0 }
        }
      }),
    )
    saida.push(...res)
  }
  return saida
}

/**
 * Simulador de markup, calibrado com medicao real feita em 31/08/2026:
 * a 3%, o pagamento cai para 91,25% do valor sem markup, em qualquer entrada.
 * Interpolamos linearmente entre os dois pontos medidos (0% e 3%).
 */
const QUEDA_A_3 = 0.0875

export function simular(payoutSemMarkup: number, markupPct: number) {
  const m = Math.max(0, Math.min(3, markupPct)) / 100
  const fator = 1 - (m / 0.03) * QUEDA_A_3
  const payout = payoutSemMarkup * fator
  return {
    payoutCliente: payout,
    suaComissao: m * payout,
    clientePerde: payoutSemMarkup - payout,
  }
}

/* ------------------------------------------------------------------ */
/* Markup calculado a partir das operacoes reais da conta             */
/* ------------------------------------------------------------------ */

import type { TeedsSocket } from './client'
import { MARCA } from '../../marca'

export interface MarkupSimulado {
  operacoes: number
  /** Janela considerada, em dias. */
  dias: number
  /** Bateu no teto de paginas: ha operacoes mais antigas nao contadas. */
  truncado: boolean
  movimentado: number
  pagamentoTotal: number
  comissao: number
  comissaoMedia: number
  /** Soma das entradas (o que o cliente apostou) no periodo. */
  entradaTotal: number
  /** Lucro (+) ou prejuizo (-) do cliente no periodo. */
  resultado: number
  porDia: DiaDeComissao[]
  /** Dias que foram varridos agora (os demais vieram do banco). */
  diasCalculados?: string[]
  taxa: number
}

/** O que sabemos de um dia: quanto operou, quanto rendeu, quanto sobrou. */
export interface DiaDeComissao {
  data: string
  comissao: number
  operacoes: number
  pagamentos: number
  entradas: number
  resultado: number
}

/**
 * Calcula a comissao que as operacoes teriam gerado.
 *
 * A regra da Deriv, medida em 31/08/2026: markup = taxa x PAGAMENTO do
 * contrato. Percorremos as compras feitas pela Teeds (identificadas pelo
 * app_id no extrato) e aplicamos a taxa sobre o pagamento de cada uma.
 * Vale para conta demo tambem — a conta e ficticia, o calculo e o mesmo.
 */
/**
 * A partir deste instante, todo dia gravado em `comissoes_diarias` veio da
 * varredura POR DIA — completa por construcao. Registros mais antigos
 * nasceram do calculo em janela unica, que truncava em ~12 mil operacoes:
 * nao dao para confiar e sao recalculados uma vez.
 */
export const CALCULO_POR_DIA_DESDE = Date.parse('2026-09-03T00:00:00Z')

/**
 * A partir daqui cada dia tambem carrega ENTRADAS e RESULTADO, porque a
 * varredura passou a usar a tabela de lucros (entrada e saida na mesma
 * linha) no lugar do extrato de compras. Dias gravados antes disso tem
 * comissao correta mas resultado zerado — sao recalculados uma vez.
 */
export const CALCULO_COM_RESULTADO_DESDE = Date.parse('2026-09-04T00:00:00Z')

/** Dias do periodo, do mais recente para o mais antigo, em UTC (AAAA-MM-DD). */
export function diasDoPeriodo(dias: number): string[] {
  const hoje = new Date()
  const lista: string[] = []
  for (let i = 0; i < dias; i += 1) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - i))
    lista.push(d.toISOString().slice(0, 10))
  }
  return lista
}

/** Comeco e fim de um dia (UTC), em epoch de segundos. */
function janelaDoDia(dia: string): { de: number; ate: number } {
  const [a, m, d] = dia.split('-').map(Number)
  return {
    de: Math.floor(Date.UTC(a, m - 1, d, 0, 0, 0) / 1000),
    ate: Math.floor(Date.UTC(a, m - 1, d, 23, 59, 59) / 1000),
  }
}

export interface DiaJaGravado {
  comissao: number
  operacoes: number
  pagamentos: number
  entradas: number
  resultado: number
}

/**
 * Uma operacao fechada, como a tabela de lucros da Deriv devolve.
 *
 * Trocamos o extrato (`statement`, so compras) pela tabela de lucros
 * (`profit_table`) porque ela traz **entrada e saida na mesma linha** — e e
 * dai que sai o quanto o cliente ganhou ou perdeu. O extrato nunca soube
 * dizer isso: uma compra sozinha nao tem resultado.
 */
interface ContratoFechado {
  appId: string | null
  entrada: number
  pagamento: number
  saida: number
}

/**
 * Passou pela app desta marca?
 *
 * A API de trading nova nem sempre manda `app_id` na tabela de lucros
 * (medido em 10/09/2026: a linha vem sem o campo). Quando ele falta, a
 * compra e considerada da plataforma — e por ela que a conta opera aqui. E
 * por isso que este numero se chama "calculado": a Deriv confirma depois.
 */
const daApp = (appId: unknown) => appId == null || String(appId) === MARCA.appId

/** Todos os contratos fechados de um dia (UTC), paginando ate o fim. */
async function contratosDoDia(
  socket: TeedsSocket,
  dia: string,
): Promise<{ contratos: ContratoFechado[]; truncado: boolean }> {
  const { de, ate } = janelaDoDia(dia)
  const contratos: ContratoFechado[] = []
  let pular = 0
  let truncado = false

  for (let pagina = 0; pagina < MAX_PAGINAS_LUCROS; pagina += 1) {
    const res = await socket.send({
      profit_table: 1,
      description: 1,
      limit: POR_PAGINA_LUCROS,
      offset: pular,
      date_from: String(de),
      date_to: String(ate),
      sort: 'ASC',
    })
    const linhas = ((res.profit_table as any)?.transactions ?? []) as Array<Record<string, any>>
    for (const l of linhas) {
      contratos.push({
        appId: l.app_id != null ? String(l.app_id) : null,
        entrada: Number(l.buy_price ?? 0),
        pagamento: Number(l.payout ?? 0),
        saida: Number(l.sell_price ?? 0),
      })
    }
    if (linhas.length < POR_PAGINA_LUCROS) break
    pular += POR_PAGINA_LUCROS
    if (pagina === MAX_PAGINAS_LUCROS - 1) truncado = true
  }

  return { contratos, truncado }
}

/**
 * Comissao varrendo **um dia de cada vez**.
 *
 * A versao anterior pedia o periodo inteiro numa janela so e parava em 12
 * paginas de 999 (~12 mil compras). Com um robo de martingale isso se
 * esgota dentro do proprio dia de hoje: os dias anteriores nunca mais eram
 * recalculados e o total parecia congelado, sempre mentindo para baixo.
 *
 * Agora cada dia tem a sua propria paginacao — nenhum dia divide teto com
 * outro — e os dias ja gravados no banco (pelo calculo novo) sao
 * reaproveitados: a primeira conta e lenta, as seguintes sao instantaneas.
 */
export async function simularComissaoPorDia(
  socket: TeedsSocket,
  taxa = 0.03,
  dias = 30,
  jaGravados: Map<string, DiaJaGravado> = new Map(),
  aoProgredir?: (feitos: number, total: number) => void,
): Promise<MarkupSimulado> {
  const lista = diasDoPeriodo(dias)
  const hoje = new Date().toISOString().slice(0, 10)

  const porDia = new Map<string, Omit<DiaDeComissao, 'data'>>()
  let comissao = 0
  let movimentado = 0
  let pagamentoTotal = 0
  let entradaTotal = 0
  let resultado = 0
  let operacoes = 0
  let truncado = false
  const novos: string[] = []

  for (let i = 0; i < lista.length; i += 1) {
    const dia = lista[i]
    aoProgredir?.(i, lista.length)

    // dia fechado que o calculo novo ja gravou: nao se recalcula
    const gravado = dia !== hoje ? jaGravados.get(dia) : undefined
    if (gravado) {
      porDia.set(dia, { ...gravado })
      comissao += gravado.comissao
      pagamentoTotal += gravado.pagamentos
      entradaTotal += gravado.entradas
      resultado += gravado.resultado
      movimentado += gravado.entradas
      operacoes += gravado.operacoes
      continue
    }

    const { contratos, truncado: cortou } = await contratosDoDia(socket, dia)
    if (cortou) truncado = true

    let doDia = { comissao: 0, operacoes: 0, pagamentos: 0, entradas: 0, resultado: 0 }
    for (const c of contratos) {
      // so o que passou pela Teeds gera markup
      if (!daApp(c.appId) || !c.pagamento) continue
      doDia = {
        comissao: doDia.comissao + c.pagamento * taxa,
        operacoes: doDia.operacoes + 1,
        pagamentos: doDia.pagamentos + c.pagamento,
        entradas: doDia.entradas + c.entrada,
        // o que o cliente levou menos o que ele pos: e o ganho ou a perda dele
        resultado: doDia.resultado + (c.saida - c.entrada),
      }
    }

    porDia.set(dia, doDia)
    comissao += doDia.comissao
    pagamentoTotal += doDia.pagamentos
    entradaTotal += doDia.entradas
    resultado += doDia.resultado
    movimentado += doDia.entradas
    operacoes += doDia.operacoes
    novos.push(dia)
  }
  aoProgredir?.(lista.length, lista.length)

  return {
    operacoes,
    movimentado,
    pagamentoTotal,
    entradaTotal,
    resultado,
    comissao,
    comissaoMedia: operacoes ? comissao / operacoes : 0,
    taxa,
    dias,
    truncado,
    diasCalculados: novos,
    porDia: [...porDia.entries()]
      .map(([data, v]) => ({ data, ...v }))
      .sort((a, b) => a.data.localeCompare(b.data)),
  }
}

/* ------------------------------------------------------------------ */
/* Hoje, ao vivo                                                        */
/* ------------------------------------------------------------------ */

/**
 * O que ja sabemos dos contratos de hoje. Guarda entrada e pagamento de
 * cada um para que as varreduras seguintes so precisem olhar a primeira
 * pagina — a das operacoes mais novas — em vez de reler o dia inteiro.
 */
export interface HojeAoVivo {
  dia: string
  /** Todo contrato ja visto hoje, da Teeds ou nao: e o que diz onde parar. */
  vistos: Set<number>
  /** Entrada e pagamento dos contratos que passaram pela Teeds. */
  contratos: Map<number, { entrada: number; pagamento: number }>
  /** A primeira passada chegou ao fim do dia. */
  completo: boolean
  truncado: boolean
}

export interface ResumoHoje {
  comissao: number
  operacoes: number
  pagamentos: number
  entradas: number
  truncado: boolean
}

export function novoHojeAoVivo(): HojeAoVivo {
  return { dia: '', vistos: new Set(), contratos: new Map(), completo: false, truncado: false }
}

/**
 * Atualiza a comissao de hoje a partir da tabela de lucros da Deriv.
 *
 * A primeira passada le o dia inteiro, paginando. As seguintes leem so as
 * paginas mais novas e param assim que reencontram um contrato conhecido:
 * com robo ligado isso da uma requisicao a cada poucos segundos, nao o dia
 * inteiro a cada operacao. Contrato ainda aberto nao aparece — entra quando
 * liquida, como na propria estatistica da Deriv.
 */
export async function atualizarHoje(socket: TeedsSocket, estado: HojeAoVivo, taxa = 0.03): Promise<ResumoHoje> {
  const dia = diasDoPeriodo(1)[0]
  if (estado.dia !== dia) {
    estado.dia = dia
    estado.vistos = new Set()
    estado.contratos = new Map()
    estado.completo = false
    estado.truncado = false
  }
  const { de, ate } = janelaDoDia(dia)
  const jaConhecia = estado.completo
  let pular = 0

  for (let pagina = 0; pagina < MAX_PAGINAS_LUCROS; pagina += 1) {
    const res = await socket.send({
      profit_table: 1,
      description: 1,
      limit: POR_PAGINA_LUCROS,
      offset: pular,
      date_from: String(de),
      date_to: String(ate),
      sort: 'DESC',
    })
    const linhas = ((res.profit_table as any)?.transactions ?? []) as Array<Record<string, any>>
    let repetidos = 0
    for (const l of linhas) {
      const id = Number(l.contract_id)
      if (!id) continue
      if (estado.vistos.has(id)) { repetidos += 1; continue }
      estado.vistos.add(id)
      const pagamento = Number(l.payout ?? 0)
      // so o que passou pela Teeds gera markup
      if (daApp(l.app_id) && pagamento) {
        estado.contratos.set(id, { entrada: Number(l.buy_price ?? 0), pagamento })
      }
    }
    if (linhas.length < POR_PAGINA_LUCROS) { estado.completo = true; break }
    // o resto do dia ja era conhecido e esta pagina reencontrou contratos antigos
    if (jaConhecia && repetidos > 0) break
    pular += POR_PAGINA_LUCROS
    if (pagina === MAX_PAGINAS_LUCROS - 1) estado.truncado = true
  }

  let comissao = 0
  let pagamentos = 0
  let entradas = 0
  for (const c of estado.contratos.values()) {
    comissao += c.pagamento * taxa
    pagamentos += c.pagamento
    entradas += c.entrada
  }
  return { comissao, operacoes: estado.contratos.size, pagamentos, entradas, truncado: estado.truncado }
}
