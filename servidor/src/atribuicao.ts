/**
 * De quem é cada contrato da conta do cliente.
 *
 * A conta Deriv de um cliente é dele, não nossa: ele pode operar pela Teeds,
 * pela OMNI, pelo app da própria Deriv ou por qualquer outro robô do
 * mercado. Até 30/09/2026 o cálculo somava 3% de TUDO o que aparecia no
 * extrato dele e chamava de comissão — e foi assim que um cliente que nunca
 * ligou um robô aqui apareceu com US$ 32,67 de comissão "nossa".
 *
 * Aqui cada contrato passa por três pistas, nesta ordem:
 *
 *  1. REGISTRO NOSSO — o contrato está em `operacoes_robos`. É prova direta:
 *     o robô comprou, guardamos o número do contrato, a marca e o robô.
 *  2. APP DA DERIV — o extrato (`statement`) diz qual app executou a compra.
 *     A tabela de lucros não traz esse campo; o extrato traz, e é por isso
 *     que a coleta lê os dois e cruza pelo número do contrato.
 *  3. HORÁRIO — sem registro e sem app, ainda resta perguntar: esta compra
 *     aconteceu enquanto uma sessão nossa estava aberta nesta conta? Se sim,
 *     é quase certo que é nossa (uma operação manual na nossa tela, por
 *     exemplo). Fica marcada como tal, e o motivo vai gravado.
 *
 * Nada aqui adivinha: o que não passa em nenhuma pista vira `sem-dono` e
 * NÃO entra na receita. Melhor um número menor e verdadeiro.
 */

/** Quem executou o contrato. As marcas são os ids de `MARCAS`. */
export type Origem = string | 'externo' | 'sem-dono'

export interface ContratoBruto {
  contractId: number
  /** Quanto o cliente pagou. */
  entrada: number
  /** Pagamento potencial contratado — a base do markup. */
  pagamento: number
  /** O que voltou (0 quando perdeu). */
  saida: number
  /** Quando a compra aconteceu, em epoch de segundos. Null = o extrato não disse. */
  compradoEm: number | null
}

export interface RegistroNosso {
  marca: string
  roboId: string | null
}

export interface JanelaDeSessao {
  marca: string
  /** Epoch de segundos. */
  de: number
  /** Epoch de segundos; sessão aberta = agora. */
  ate: number
}

export interface Pistas {
  /** contrato → app que executou, lido do extrato. */
  appPorContrato: Map<number, string>
  /** contrato → o que a plataforma registrou quando comprou. */
  nossosContratos: Map<number, RegistroNosso>
  /** Sessões que a plataforma abriu nesta conta, para a pista do horário. */
  janelas: JanelaDeSessao[]
  /** app id de cada marca: '34gMUQ…' → 'teeds'. */
  marcaDoApp: Map<string, string>
}

export interface Atribuicao {
  origem: Origem
  /** A marca quando o contrato é nosso; null quando não é. */
  marca: string | null
  /** O app que a Deriv informou, quando informou. */
  app: string | null
  /** Em português, por que ficou nesta origem. Vai para o banco. */
  motivo: string
  /** Qual pista decidiu: registro, app, horário ou nenhuma. */
  pista: 'registro' | 'app' | 'horario' | 'nenhuma'
}

/**
 * Uma compra dentro de uma sessão nossa conta como nossa, com esta folga em
 * segundos nas duas pontas: o relógio da Deriv e o nosso não são o mesmo, e
 * a sessão é gravada um instante depois de abrir.
 */
export const FOLGA_DA_JANELA_S = 45

export function atribuir(contrato: ContratoBruto, pistas: Pistas): Atribuicao {
  const registro = pistas.nossosContratos.get(contrato.contractId)
  if (registro) {
    return {
      origem: registro.marca,
      marca: registro.marca,
      app: pistas.appPorContrato.get(contrato.contractId) ?? null,
      motivo: registro.roboId
        ? `contrato ${contrato.contractId} registrado pela plataforma (robô ${registro.roboId})`
        : `contrato ${contrato.contractId} registrado pela plataforma`,
      pista: 'registro',
    }
  }

  const app = pistas.appPorContrato.get(contrato.contractId) ?? null
  if (app) {
    const marca = pistas.marcaDoApp.get(app)
    if (marca) {
      return { origem: marca, marca, app, motivo: `a Deriv informou o app da ${marca}`, pista: 'app' }
    }
    return { origem: 'externo', marca: null, app, motivo: `app ${app} não é nosso`, pista: 'app' }
  }

  if (contrato.compradoEm != null) {
    const janela = pistas.janelas.find((j) =>
      contrato.compradoEm! >= j.de - FOLGA_DA_JANELA_S && contrato.compradoEm! <= j.ate + FOLGA_DA_JANELA_S)
    if (janela) {
      return {
        origem: janela.marca,
        marca: janela.marca,
        app: null,
        motivo: 'comprado enquanto uma sessão nossa estava aberta nesta conta',
        pista: 'horario',
      }
    }
  }

  return {
    origem: 'sem-dono',
    marca: null,
    app: null,
    motivo: contrato.compradoEm == null
      ? 'sem app no extrato e sem horário para conferir'
      : 'sem app no extrato e fora de qualquer sessão nossa',
    pista: 'nenhuma',
  }
}

export interface BaldeDeOrigem {
  origem: Origem
  operacoes: number
  entradas: number
  pagamentos: number
  resultado: number
  /** 3% do pagamento — só faz sentido quando a origem é uma marca nossa. */
  markupEstimado: number
  /** Quantos contratos vieram de cada pista, para a tela poder explicar. */
  porPista: Record<Atribuicao['pista'], number>
  /** Os apps vistos nesta origem (no máximo os primeiros cinco). */
  apps: string[]
}

/** A taxa de markup configurada nas nossas apps da Deriv. */
export const TAXA_MARKUP = 0.03

/** Junta os contratos do dia em um balde por origem. */
export function separarPorOrigem(
  contratos: ContratoBruto[],
  pistas: Pistas,
): { baldes: Map<Origem, BaldeDeOrigem>; atribuicoes: Map<number, Atribuicao> } {
  const baldes = new Map<Origem, BaldeDeOrigem>()
  const atribuicoes = new Map<number, Atribuicao>()
  for (const c of contratos) {
    const a = atribuir(c, pistas)
    atribuicoes.set(c.contractId, a)
    const balde = baldes.get(a.origem) ?? {
      origem: a.origem, operacoes: 0, entradas: 0, pagamentos: 0, resultado: 0, markupEstimado: 0,
      porPista: { registro: 0, app: 0, horario: 0, nenhuma: 0 }, apps: [],
    }
    balde.operacoes += 1
    balde.entradas += c.entrada
    balde.pagamentos += c.pagamento
    balde.resultado += c.saida - c.entrada
    balde.markupEstimado += c.pagamento * TAXA_MARKUP
    balde.porPista[a.pista] += 1
    if (a.app && !balde.apps.includes(a.app) && balde.apps.length < 5) balde.apps.push(a.app)
    baldes.set(a.origem, balde)
  }
  return { baldes, atribuicoes }
}
