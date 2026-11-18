/**
 * Compartilhamento de receita no modo simulado.
 *
 * 16/11/2026 (1ª versão): base regulada por lucro e prejuízo somados.
 * 18/11/2026 (Tiago, para explicar ao aluno novo): a base parte de CADA cliente, como na vida real:
 *  - depósito inicial entre US$ 200 e US$ 20.000, misturado (muitos pequenos, alguns grandes);
 *  - resultado do mês (30 dias) entre 5% e 120% do próprio capital para quem lucrou;
 *  - uns 10 clientes no negativo (perda entre 3% e 35% do capital);
 *  - quantos no Gold (paga 10% do lucro), no Black (5%) e no Prestige (isento).
 * O admin regula tudo nos termômetros do palco; a tela inteira e a planilha Excel acompanham.
 *
 * Os nomes são inventados. Telefone e e-mail saem MASCARADOS ("(11) 9••••-4821", "marcos.a•••@gmail.com"),
 * para parecerem naturais na planilha sem apontar para uma pessoa de verdade. Nada daqui vai ao banco nem gera
 * fatura. Os ajustes ficam no aparelho.
 */
import { MARCA } from '../../marca'
import type { Linha, Painel } from '../../components/admin/CompartilhamentoDeReceita'

export interface AjusteSimulado {
  /** clientes que operaram em conta real no mês */
  clientes: number
  /** depósito inicial: menor e maior valor (US$) */
  depMin: number
  depMax: number
  /** resultado do mês de quem lucrou, em fração do depósito (0,05 = 5%) */
  lucroMin: number
  lucroMax: number
  /** quantos clientes fecharam o mês no negativo */
  negativos: number
  /** fatia de clientes no Gold e no Black (o resto é Prestige) */
  gold: number
  black: number
  /** troca os clientes sorteados sem mexer nas regras */
  semente: number
}

export const LIMITES = {
  clientes: [5, 2000] as const,
  dep: [50, 100_000] as const,
  lucro: [0.01, 3] as const,
  plano: [0, 1] as const,
}
export const AJUSTE_PADRAO: AjusteSimulado = {
  clientes: 100, depMin: 200, depMax: 20_000, lucroMin: 0.05, lucroMax: 1.2, negativos: 10, gold: 0.7, black: 0.2, semente: 7,
}

// v2: o modelo mudou em 18/11 (o ajuste antigo de lucro/prejuízo somados não vale mais)
const CHAVE = `${MARCA.id}.compartilhamento.simulado.v2`
const limitar = (v: number, [a, b]: readonly [number, number]) => Math.min(b, Math.max(a, v))

/** 18/11/2026: cada recorte (todos, /n, /v…) guarda a própria simulação — a do Naor não mexe na do Victor. */
const chaveDo = (recorte: string | null) => `${CHAVE}.${recorte || 'todos'}`
export function lerAjusteSimulado(recorte: string | null = null): AjusteSimulado {
  try {
    const v = JSON.parse(localStorage.getItem(chaveDo(recorte)) || 'null') as Partial<AjusteSimulado> | null
    if (v && typeof v === 'object') return corrigir({ ...AJUSTE_PADRAO, ...v })
  } catch { /* sem armazenamento: o padrão */ }
  return { ...AJUSTE_PADRAO }
}
export function guardarAjusteSimulado(a: AjusteSimulado, recorte: string | null = null): void {
  try { localStorage.setItem(chaveDo(recorte), JSON.stringify(a)) } catch { /* vale até recarregar */ }
}
export function corrigir(a: AjusteSimulado): AjusteSimulado {
  const n = (x: unknown, p: number) => (typeof x === 'number' && Number.isFinite(x) ? x : p)
  const clientes = Math.round(limitar(n(a.clientes, AJUSTE_PADRAO.clientes), LIMITES.clientes))
  let depMin = Math.round(limitar(n(a.depMin, AJUSTE_PADRAO.depMin), LIMITES.dep))
  let depMax = Math.round(limitar(n(a.depMax, AJUSTE_PADRAO.depMax), LIMITES.dep))
  if (depMax < depMin) [depMin, depMax] = [depMax, depMin]
  let lucroMin = Math.round(limitar(n(a.lucroMin, AJUSTE_PADRAO.lucroMin), LIMITES.lucro) * 1000) / 1000
  let lucroMax = Math.round(limitar(n(a.lucroMax, AJUSTE_PADRAO.lucroMax), LIMITES.lucro) * 1000) / 1000
  if (lucroMax < lucroMin) [lucroMin, lucroMax] = [lucroMax, lucroMin]
  const gold = Math.round(limitar(n(a.gold, AJUSTE_PADRAO.gold), LIMITES.plano) * 100) / 100
  const black = Math.round(Math.min(1 - gold, limitar(n(a.black, AJUSTE_PADRAO.black), LIMITES.plano)) * 100) / 100
  return {
    clientes, depMin, depMax, lucroMin, lucroMax,
    negativos: Math.round(limitar(n(a.negativos, AJUSTE_PADRAO.negativos), [0, clientes])),
    gold, black, semente: Math.round(n(a.semente, AJUSTE_PADRAO.semente)) >>> 0,
  }
}

/** Quantos no lucro, no prejuízo e em cada plano saem do ajuste (o que a tela mostra é exatamente isto). */
export function contagem(a: AjusteSimulado) {
  const perdem = Math.min(a.clientes, a.negativos)
  const gold = Math.round(a.clientes * a.gold)
  const black = Math.min(a.clientes - gold, Math.round(a.clientes * a.black))
  return { ganham: a.clientes - perdem, perdem, zerados: 0, gold, black, prestige: a.clientes - gold - black }
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
const DDD = ['11', '11', '11', '21', '31', '41', '47', '48', '51', '61', '62', '71', '81', '85', '19', '27', '24', '34']
const PROVEDOR = ['gmail.com', 'gmail.com', 'gmail.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'yahoo.com.br']
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** valor de depósito "de gente": 200, 350, 1.000, 2.500… */
function arredondarDeposito(v: number) {
  const passo = v < 1000 ? 50 : v < 5000 ? 100 : v < 10_000 ? 500 : 1000
  return Math.max(passo, Math.round(v / passo) * passo)
}

const mesAnterior = (mes: string, k: number) => {
  const [a, m] = mes.split('-').map(Number)
  const t = (a * 12 + (m - 1)) - k
  return `${Math.floor(t / 12)}-${String(t % 12 + 1).padStart(2, '0')}-01`
}

/**
 * O painel simulado. `base` é o painel real (datas, percentuais dos planos, parceiros, se é o admin geral); sem
 * ele, os valores padrão. A semente mistura o mês: cada mês mostra outros clientes com as mesmas regras.
 */
export function painelSimulado(ajuste: AjusteSimulado, mes: string, base: Painel | null, cotacao: number,
  /** o parceiro do recorte: todos os clientes simulados saem dele (mesmo antes do painel real chegar) */
  fixo: { codigo: string; nome: string | null } | null = null): Painel {
  const a = corrigir(ajuste)
  const acaso = gerador(a.semente * 7919 + Number(mes.slice(0, 4)) * 13 + Number(mes.slice(5, 7)))
  const { perdem, gold, black } = contagem(a)

  const percentuais = base?.percentuais && Object.keys(base.percentuais).length ? base.percentuais : { gold: 0.1, black: 0.05, prestige: 0 }
  // parceiros: os mesmos da base real (com o filtro de parceiro, só ele)
  const parceiros: Array<[string | null, string | null]> = fixo ? [[fixo.codigo, fixo.nome]] : base?.parceiro ? [[base.parceiro, base.clientes.find((c) => c.parceiro === base.parceiro)?.parceiro_nome ?? null]]
    : (() => {
      const m = new Map<string, [string | null, string | null]>()
      for (const c of base?.clientes ?? []) m.set(c.parceiro ?? '', [c.parceiro, c.parceiro_nome])
      const l = [...m.values()]
      return l.length ? l : [[null, null]]
    })()

  // quem fica no negativo e o plano de cada um: sorteados sem repetir (contagens exatas)
  const ordem = Array.from({ length: a.clientes }, (_, i) => i)
  for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(acaso.u() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]] }
  const negativo = new Set(ordem.slice(0, perdem))
  const planos = ordem.map(() => '')
  for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(acaso.u() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]] }
  ordem.forEach((k, i) => { planos[k] = i < gold ? 'gold' : i < gold + black ? 'black' : 'prestige' })

  const fimDoMes = new Date(`${mesAnterior(mes, -1)}T12:00:00Z`).getTime() - 86_400_000
  const usados = new Set<string>()
  const clientes: Linha[] = Array.from({ length: a.clientes }, (_, i) => {
    let nome = '', primeiro = '', ultimo = ''
    for (let t = 0; t < 40; t++) {
      primeiro = NOMES[Math.floor(acaso.u() * NOMES.length)]
      ultimo = SOBRENOMES[Math.floor(acaso.u() * SOBRENOMES.length)]
      // nome completo: às vezes com dois sobrenomes ("Caio Macedo Ribeiro")
      const meio = acaso.u() < 0.6 ? SOBRENOMES[Math.floor(acaso.u() * SOBRENOMES.length)] : ''
      nome = [primeiro, meio, ultimo].filter(Boolean).join(' ')
      if (!usados.has(nome) && meio !== ultimo) break
    }
    usados.add(nome)

    // depósito: escala de log puxada para os menores (muitos de 200–2.000, poucos de 10.000+)
    const deposito = Math.min(a.depMax, Math.max(a.depMin,
      arredondarDeposito(a.depMin * Math.pow(a.depMax / a.depMin, Math.pow(acaso.u(), 1.35)))))
    // resultado: quem lucrou fica entre o mínimo e o máximo, com mais gente perto do meio-baixo
    const taxa = negativo.has(i)
      ? -(0.03 + 0.32 * Math.pow(acaso.u(), 1.4))
      : a.lucroMin + (a.lucroMax - a.lucroMin) * Math.pow(acaso.u(), 1.6)
    const r = Math.round(deposito * taxa * 100) / 100

    const subplano = planos[i]
    const percentual = percentuais[subplano] ?? 0
    const operacoes = Math.max(12, Math.round(Math.exp(5.2 + 0.6 * acaso.normal()) * (0.7 + Math.min(1, deposito / 8000))))
    const acerto = r > 0 ? 0.56 + acaso.u() * 0.16 : 0.38 + acaso.u() * 0.14
    const manuais = acaso.u() < 0.35 ? Math.round(operacoes * acaso.u() * 0.12) : 0
    const entrada = Math.max(0.35, Math.round(deposito * (0.002 + acaso.u() * 0.006) * 100) / 100)
    const [parceiro, parceiro_nome] = parceiros[Math.floor(acaso.u() * parceiros.length)]
    // entrou entre 6 meses antes e o dia 10 do mês
    const entrou = new Date(fimDoMes - Math.floor((20 + acaso.u() * 160) * 86_400_000)).toISOString()
    const ddd = DDD[Math.floor(acaso.u() * DDD.length)]
    const fim = String(1000 + Math.floor(acaso.u() * 9000))
    const usuario = `${semAcento(primeiro)}.${semAcento(ultimo)[0]}`
    return {
      user_id: `simulado-${a.semente}-${i}`, nome, foto_url: null, parceiro, parceiro_nome,
      telefone: `(${ddd}) 9••••-${fim}`, email: `${usuario}•••@${PROVEDOR[Math.floor(acaso.u() * PROVEDOR.length)]}`,
      subplano, percentual, operacoes, ganhas: Math.round(operacoes * acerto), manuais,
      volume: Math.round(operacoes * entrada * (1.4 + acaso.u()) * 100) / 100, resultado: r,
      valor_usd: r > 0 ? Math.round(r * percentual * 100) / 100 : 0, fatura: null, canceladas: 0, cancelada: null,
      deposito_inicial: deposito, entrou_em: entrou, corretora: 'Deriv',
    }
  }).sort((x, y) => y.resultado - x.resultado)

  const hoje = base?.hoje ?? new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
  const mesAtual = base?.mes_atual ?? `${hoje.slice(0, 7)}-01`
  const proximo = mesAnterior(mes, -1)
  const ganham = clientes.filter((c) => c.resultado > 0).length
  // compartilhamento do mês em reais e um histórico coerente com ele (meses anteriores pagos)
  const doMes = clientes.reduce((s, c) => s + c.valor_usd, 0) * (cotacao || 5.5)
  const meses = [3, 2, 1].map((k, j) => {
    const valor = Math.round(doMes * [0.48, 0.66, 0.84][j] * (0.92 + acaso.u() * 0.16) * 100) / 100
    const faturas = Math.max(1, Math.round(ganham * [0.55, 0.7, 0.86][j]))
    return { mes: mesAnterior(mes, k), faturas, valor_brl: valor, abertas: 0, pagas: faturas, recebido_brl: valor }
  }).reverse()
  return {
    agora: base?.agora ?? new Date().toISOString(), hoje, mes, mes_atual: mesAtual, fechado: mes < mesAtual,
    vencimento: proximo > hoje ? proximo : hoje, parceiro: fixo?.codigo ?? base?.parceiro ?? null, geral: base?.geral ?? true, percentuais, clientes,
    carteira: {
      abertas: 0, a_receber_brl: 0, vencidas: 0, vencidas_brl: 0,
      pagas: meses.reduce((s, m) => s + m.pagas, 0), recebido_brl: Math.round(meses.reduce((s, m) => s + m.recebido_brl, 0) * 100) / 100,
    },
    meses,
  }
}
