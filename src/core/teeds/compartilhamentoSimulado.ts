/**
 * Compartilhamento de receita no modo simulado (16/11/2026, Tiago: "preciso ter o modo simulado aí nessa parte
 * também"). Com o modo simulado geral ligado (só admin), a tela inteira do Compartilhamento (o palco, os cartões e
 * a tabela) passa a mostrar uma base de clientes montada aqui, a partir de quatro números que o admin regula:
 * quantos clientes operaram, quantos por cento fecharam no lucro, o lucro somado e o prejuízo somado.
 *
 * Os nomes são inventados (nunca o nome de um cliente de verdade com um número que não é dele), sem foto, e-mail
 * nem telefone. Nada daqui vai ao banco nem gera fatura. Os ajustes ficam no aparelho.
 */
import { MARCA } from '../../marca'
import type { Linha, Painel } from '../../components/admin/CompartilhamentoDeReceita'

export interface AjusteSimulado {
  /** clientes que operaram em conta real no mês */
  clientes: number
  /** fração dos clientes no lucro (0 a 1) */
  noLucro: number
  /** lucro somado de quem ficou no lucro (US$) */
  lucro: number
  /** prejuízo somado de quem ficou no prejuízo (US$, positivo) */
  prejuizo: number
  /** troca os clientes escolhidos ao acaso sem mexer nos totais */
  semente: number
}

export const LIMITES = {
  clientes: [5, 2000] as const,
  noLucro: [0.05, 0.95] as const,
  lucro: [50, 500_000] as const,
  prejuizo: [0, 250_000] as const,
}
export const AJUSTE_PADRAO: AjusteSimulado = { clientes: 240, noLucro: 0.68, lucro: 18_400, prejuizo: 3_900, semente: 7 }

const CHAVE = `${MARCA.id}.compartilhamento.simulado`
const limitar = (v: number, [a, b]: readonly [number, number]) => Math.min(b, Math.max(a, v))

export function lerAjusteSimulado(): AjusteSimulado {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null') as Partial<AjusteSimulado> | null
    if (v && typeof v === 'object') return corrigir({ ...AJUSTE_PADRAO, ...v })
  } catch { /* sem armazenamento: o padrão */ }
  return { ...AJUSTE_PADRAO }
}
export function guardarAjusteSimulado(a: AjusteSimulado): void {
  try { localStorage.setItem(CHAVE, JSON.stringify(a)) } catch { /* vale até recarregar */ }
}
export function corrigir(a: AjusteSimulado): AjusteSimulado {
  const n = (x: unknown, p: number) => (typeof x === 'number' && Number.isFinite(x) ? x : p)
  return {
    clientes: Math.round(limitar(n(a.clientes, AJUSTE_PADRAO.clientes), LIMITES.clientes)),
    noLucro: Math.round(limitar(n(a.noLucro, AJUSTE_PADRAO.noLucro), LIMITES.noLucro) * 1000) / 1000,
    lucro: Math.round(limitar(n(a.lucro, AJUSTE_PADRAO.lucro), LIMITES.lucro) * 100) / 100,
    prejuizo: Math.round(limitar(n(a.prejuizo, AJUSTE_PADRAO.prejuizo), LIMITES.prejuizo) * 100) / 100,
    semente: Math.round(n(a.semente, AJUSTE_PADRAO.semente)) >>> 0,
  }
}

/** Quantos no lucro e no prejuízo saem do ajuste (o que a tela mostra é exatamente isto). */
export function contagem(a: AjusteSimulado) {
  let ganham = Math.round(a.clientes * a.noLucro)
  ganham = Math.min(a.clientes, Math.max(a.lucro > 0 ? 1 : 0, ganham))
  // cada cliente no lucro precisa de pelo menos 1 centavo
  ganham = Math.min(ganham, Math.floor(a.lucro * 100))
  let perdem = a.clientes - ganham
  if (a.prejuizo <= 0) perdem = 0
  perdem = Math.min(perdem, Math.floor(a.prejuizo * 100))
  return { ganham, perdem, zerados: a.clientes - ganham - perdem }
}

/* ---------------------------------------------------------------- números ao acaso com semente (sempre igual) */
function gerador(semente: number) {
  let s = (semente * 2654435761) >>> 0 || 1
  const u = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s >>> 0) / 4294967296 }
  const normal = () => { const a = Math.max(1e-9, u()), b = u(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b) }
  return { u, normal }
}

const NOMES = ['Marcos', 'Patrícia', 'Rafael', 'Juliana', 'Eduardo', 'Camila', 'Bruno', 'Larissa', 'Diego', 'Fernanda', 'Gustavo', 'Aline',
  'Thiago', 'Renata', 'Lucas', 'Beatriz', 'Felipe', 'Mariana', 'Rodrigo', 'Vanessa', 'André', 'Carolina', 'Leandro', 'Priscila', 'Fábio',
  'Tatiane', 'Ricardo', 'Daniela', 'Vinícius', 'Letícia', 'Paulo', 'Gabriela', 'Henrique', 'Isabela', 'Matheus', 'Natália', 'Leonardo',
  'Bianca', 'Alexandre', 'Simone', 'Caio', 'Luana', 'Murilo', 'Débora', 'Igor', 'Elaine', 'Sérgio', 'Jéssica', 'Wesley', 'Michele',
  'Otávio', 'Raquel', 'Danilo', 'Sabrina', 'Júlio', 'Kelly', 'Renan', 'Cíntia', 'Hugo', 'Viviane', 'Márcio', 'Adriana', 'Rogério', 'Flávia']
const SOBRENOMES = ['Andrade', 'Lemos', 'Costa', 'Prado', 'Nunes', 'Rocha', 'Teixeira', 'Mendes', 'Farias', 'Alves', 'Pires', 'Barbosa',
  'Moura', 'Dias', 'Ribeiro', 'Carvalho', 'Gomes', 'Martins', 'Araújo', 'Melo', 'Cardoso', 'Correia', 'Cavalcanti', 'Monteiro', 'Freitas',
  'Batista', 'Vieira', 'Campos', 'Rezende', 'Duarte', 'Siqueira', 'Pacheco', 'Fonseca', 'Macedo', 'Tavares', 'Brandão', 'Sampaio', 'Queiroz',
  'Lacerda', 'Moraes', 'Peixoto', 'Bezerra', 'Xavier', 'Coelho', 'Antunes', 'Guimarães', 'Rangel', 'Viana', 'Paiva', 'Saraiva']

/** Reparte um total em n partes desiguais (poucos com muito, muitos com pouco), em centavos, somando exato. */
function repartir(total: number, n: number, espalhar: number, acaso: ReturnType<typeof gerador>): number[] {
  if (n <= 0) return []
  const centavos = Math.round(total * 100)
  const pesos = Array.from({ length: n }, () => Math.exp(espalhar * acaso.normal())).sort((a, b) => b - a)
  const soma = pesos.reduce((s, x) => s + x, 0)
  // 1 centavo garantido para cada um; o resto proporcional
  const livre = centavos - n
  const partes = pesos.map((p) => 1 + Math.floor(livre * p / soma))
  let falta = centavos - partes.reduce((s, x) => s + x, 0)
  for (let i = 0; falta > 0; i = (i + 1) % n) { partes[i]++; falta-- }
  return partes.map((c) => c / 100)
}

const mesAnterior = (mes: string, k: number) => {
  const [a, m] = mes.split('-').map(Number)
  const t = (a * 12 + (m - 1)) - k
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}-01`
}

/**
 * O painel simulado. `base` é o painel real (datas, percentuais dos planos, parceiros, se é o admin geral); sem
 * ele, os valores padrão. A semente mistura o mês: cada mês mostra outros clientes, com os mesmos totais.
 */
export function painelSimulado(ajuste: AjusteSimulado, mes: string, base: Painel | null, cotacao: number): Painel {
  const a = corrigir(ajuste)
  const acaso = gerador(a.semente * 7919 + Number(mes.slice(0, 4)) * 13 + Number(mes.slice(5, 7)))
  const { ganham, perdem, zerados } = contagem(a)
  const lucros = repartir(a.lucro, ganham, 0.95, acaso)
  const perdas = repartir(a.prejuizo, perdem, 1.05, acaso).map((v) => -v)
  const resultados = [...lucros, ...Array.from({ length: zerados }, () => 0), ...perdas]

  const percentuais = base?.percentuais && Object.keys(base.percentuais).length ? base.percentuais : { gold: 0.1, black: 0.05, prestige: 0 }
  // parceiros: os mesmos da base real (com o filtro de parceiro, só ele)
  const parceiros: Array<[string | null, string | null]> = base?.parceiro ? [[base.parceiro, base.clientes.find((c) => c.parceiro === base.parceiro)?.parceiro_nome ?? null]]
    : (() => {
      const m = new Map<string, [string | null, string | null]>()
      for (const c of base?.clientes ?? []) m.set(c.parceiro ?? '', [c.parceiro, c.parceiro_nome])
      const l = [...m.values()]
      return l.length ? l : [[null, null]]
    })()

  const usados = new Set<string>()
  const clientes: Linha[] = resultados.map((r, i) => {
    let nome = ''
    for (let t = 0; t < 40; t++) {
      nome = `${NOMES[Math.floor(acaso.u() * NOMES.length)]} ${SOBRENOMES[Math.floor(acaso.u() * SOBRENOMES.length)]}`
      if (!usados.has(nome) || usados.size >= NOMES.length * SOBRENOMES.length) break
    }
    usados.add(nome)
    const x = acaso.u()
    const subplano = x < 0.72 ? 'gold' : x < 0.9 ? 'black' : 'prestige'
    const percentual = percentuais[subplano] ?? 0
    // quem mais ganhou ou perdeu tende a ter operado mais
    const peso = Math.min(3, Math.sqrt(Math.abs(r) / Math.max(1, (a.lucro + a.prejuizo) / Math.max(1, a.clientes))))
    const operacoes = Math.max(6, Math.round(Math.exp(5.4 + 0.75 * acaso.normal()) * (0.6 + 0.5 * peso)))
    const acerto = r > 0 ? 0.56 + acaso.u() * 0.16 : r < 0 ? 0.38 + acaso.u() * 0.14 : 0.5
    const manuais = acaso.u() < 0.35 ? Math.round(operacoes * acaso.u() * 0.12) : 0
    const entrada = [0.35, 0.5, 1, 1, 2, 2, 3, 5][Math.floor(acaso.u() * 8)]
    const [parceiro, parceiro_nome] = parceiros[Math.floor(acaso.u() * parceiros.length)]
    return {
      user_id: `simulado-${a.semente}-${i}`, nome, email: null, telefone: null, foto_url: null, parceiro, parceiro_nome,
      subplano, percentual, operacoes, ganhas: Math.round(operacoes * acerto), manuais,
      volume: Math.round(operacoes * entrada * (1.4 + acaso.u()) * 100) / 100, resultado: r,
      valor_usd: r > 0 ? Math.round(r * percentual * 100) / 100 : 0, fatura: null, canceladas: 0, cancelada: null,
    }
  }).sort((x, y) => y.resultado - x.resultado)

  const hoje = base?.hoje ?? new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
  const mesAtual = base?.mes_atual ?? `${hoje.slice(0, 7)}-01`
  const proximo = mesAnterior(mes, -1)
  // compartilhamento do mês em reais e um histórico coerente com ele (meses anteriores pagos)
  const doMes = clientes.reduce((s, c) => s + c.valor_usd, 0) * (cotacao || 5.5)
  const meses = [3, 2, 1].map((k, j) => {
    const valor = Math.round(doMes * [0.48, 0.66, 0.84][j] * (0.92 + acaso.u() * 0.16) * 100) / 100
    const faturas = Math.max(1, Math.round(ganham * [0.55, 0.7, 0.86][j]))
    return { mes: mesAnterior(mes, k), faturas, valor_brl: valor, abertas: 0, pagas: faturas, recebido_brl: valor }
  }).reverse()
  return {
    agora: base?.agora ?? new Date().toISOString(), hoje, mes, mes_atual: mesAtual, fechado: mes < mesAtual,
    vencimento: proximo > hoje ? proximo : hoje, parceiro: base?.parceiro ?? null, geral: base?.geral ?? true, percentuais, clientes,
    carteira: {
      abertas: 0, a_receber_brl: 0, vencidas: 0, vencidas_brl: 0,
      pagas: meses.reduce((s, m) => s + m.pagas, 0), recebido_brl: Math.round(meses.reduce((s, m) => s + m.recebido_brl, 0) * 100) / 100,
    },
    meses,
  }
}
