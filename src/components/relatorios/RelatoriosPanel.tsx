/**
 * Relatórios (27/10/2026; painel completo em 04/11/2026). O cliente, e o
 * Tiago, analisam o próprio resultado com os números da corretora.
 *
 * 04/11/2026 (Tiago: "não consigo filtrar o dia de hoje, ontem... intervalos
 * personalizados... filtros inteligentes... só ganhadoras, só perdedoras,
 * robôs específicos... análise completa... no mobile também"):
 *  - períodos prontos (hoje, ontem, 7, 30, 90 dias, este mês, mês passado) e
 *    intervalo livre de datas;
 *  - filtros: resultado, estratégias, ativos, tipo de contrato, dias da
 *    semana, faixa de horário e valor de entrada; cada filtro ativo vira um
 *    selo que sai com um toque;
 *  - atalhos inteligentes tirados dos próprios números;
 *  - comparação com o período anterior de mesmo tamanho, fator de lucro,
 *    média por operação, sequências e maior queda;
 *  - tocar numa estratégia, hora, dia, ativo ou tipo filtra.
 * O banco faz as contas (teeds_meu_relatorio_v2, sempre do próprio usuário).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { TeedsSocket } from '../../core/deriv/client'
import { MARCA } from '../../marca'
import { useMenuAdminOculto } from '../../core/menuDeAdmin'
import { dinheiro, dinheiroComSinal, simboloMoeda } from '../../core/dinheiro'
import { nomeDoSimbolo } from '../../core/deriv/simbolos'
import { MASCARA, useValoresOcultos } from '../../core/privacidade'
import { tipoNaTela } from '../../core/deriv/accountAccess'
import {
  dinheiroDoPeriodo, hojeLocal, intervalo, nomeDoTipo, PERIODOS, quantosFiltros, relatorioCompleto,
  type Dinheiro, type Filtros, type Intervalo, type Periodo, type RelatorioCompleto,
} from '../../core/teeds/relatorios'
import './relatorios.css'
import { GraficoDoResultado, type PontoDoGrafico } from './GraficoDoResultado'
import { NomeDoRobo } from '../NomeDoRobo'
import { DERIV } from '../../core/deriv/config'
import { subplanoAtual, useMeuSubplano } from '../../core/teeds/subplanos'
import { useCatalogoCompleto } from '../../core/teeds/catalogoRobos'
import { cenariosProntos, definirRegrasDasIas, dinheiroDoCenario, faixaDoCenario, hojeIso, lerCenario, operacoesDoCenario, relatorioDoCenario, type Cenario } from '../../core/teeds/relatorioSimulado'
import { BotaoSimular, EditorDoCenario } from './SimuladorDeRelatorio'

interface Props {
  sessao: SessaoTeeds
  socket: TeedsSocket | null
  conectada: boolean
  /** A conta conectada agora é demo (o tipo verdadeiro); null enquanto a Deriv não disse qual é. */
  contaDemo: boolean | null
  /** Rótulos trocados (acessos internos): só a etiqueta da tela muda. */
  rotulosTrocados?: boolean
  saldo: number | null
  moeda: string
  aoIr: (tela: 'robos' | 'operar') => void
  /** Laboratório: dados de exemplo no lugar do banco e da corretora. */
  exemplo?: { relatorio: RelatorioCompleto; dinheiro?: Dinheiro }
  /** 06/11/2026: administrador da marca pode montar um relatório simulado para as aulas. */
  podeSimular?: boolean
  /** Muda a cada toque no botão "Simular relatório" do topo da página. */
  pedidoSimulacao?: number
  aoMudarSimulacao?: (ativa: boolean) => void
}

const pct = (a: number, b: number) => (b !== 0 ? Math.round((a / b) * 100) : 0)
const classe = (v: number) => (v > 0 ? 'sobe' : v < 0 ? 'cai' : '')
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const DIAS_LONGOS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const FAIXAS: Array<{ nome: string; de: number; ate: number }> = [
  { nome: 'Madrugada', de: 0, ate: 5 }, { nome: 'Manhã', de: 6, ate: 11 }, { nome: 'Tarde', de: 12, ate: 17 }, { nome: 'Noite', de: 18, ate: 23 },
]
const diaCurto = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}` }
const diasEntre = (de: string, ate: string) => Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 864e5) + 1
const faixaDeHora = (de?: number | null, ate?: number | null) => (de != null && ate != null ? (de === ate ? `${de}h` : `${de}h às ${ate}h59`) : de != null ? `A partir de ${de}h` : ate != null ? `Até ${ate}h59` : '')

/* ---------------------------------------------- guardado neste aparelho */
const CHAVE = `${MARCA.id}.relatorio.filtros`
/* o último cenário simulado fica no aparelho; "ligado" só nesta aba (recarregar a página no meio da gravação não derruba a simulação) */
const CHAVE_SIM = `${MARCA.id}.relatorio.simulado`
const simLigada = () => { try { return sessionStorage.getItem(`${CHAVE_SIM}.ligado`) === '1' } catch { return false } }
/** O período do relatório que mostra o cenário: os botões prontos quando batem, senão as datas do cenário. */
const periodoDoCenario = (c: Cenario): { periodo: Periodo; personalizado: Intervalo | null } => {
  if (c.periodo.tipo === 'ultimos') return { periodo: c.periodo.dias === 7 ? '7d' : '30d', personalizado: null }
  const f = faixaDoCenario(c)
  if (f.de === f.ate && f.de === hojeIso()) return { periodo: 'hoje', personalizado: null }
  return { periodo: 'personalizado', personalizado: f }
}
interface Guardado { periodo: Periodo; personalizado: Intervalo | null; filtros: Filtros }
function lerGuardado(): Guardado {
  try {
    const g = JSON.parse(localStorage.getItem(CHAVE) || 'null') as Guardado | null
    if (g && (g.periodo === 'personalizado' || PERIODOS.some((p) => p.id === g.periodo))) return { periodo: g.periodo, personalizado: g.personalizado ?? null, filtros: g.filtros ?? {} }
  } catch { /* sem armazenamento */ }
  return { periodo: '30d', personalizado: null, filtros: {} }
}

/* ================================================================ painel */

export function RelatoriosPanel({ sessao, socket, conectada, contaDemo, rotulosTrocados = false, saldo, moeda, aoIr, exemplo, podeSimular = false, pedidoSimulacao = 0, aoMudarSimulacao }: Props) {
  const ocultos = useValoresOcultos()
  // a simulação: só existe para quem pode simular (o cliente nunca chega aqui, nem com o aparelho mexido)
  const [cenario, setCenario] = useState<Cenario | null>(() => (simLigada() ? lerCenario(CHAVE_SIM) : null))
  const [editando, setEditando] = useState(false)
  // olhinho dos itens de admin (09/11/2026, Tiago): com eles ocultos, o ícone e a tag "Relatório simulado" somem
  // para a gravação parecer a tela do cliente; a simulação em si continua na tela
  const adminOculto = useMenuAdminOculto()
  const sim = podeSimular ? cenario : null
  // as I.A. do simulador sobem a escada com as regras em vigor (catálogo); sem catálogo, o padrão do código
  const versaoRegras = definirRegrasDasIas(useCatalogoCompleto())
  const opsSim = useMemo(() => (sim ? operacoesDoCenario(sim) : null), [sim, versaoRegras])
  const inicial = useMemo(() => {
    const g = lerGuardado()
    return cenario ? { ...g, ...periodoDoCenario(cenario), filtros: {} } : g
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const [periodo, setPeriodo] = useState<Periodo>(inicial.periodo)
  const [personalizado, setPersonalizado] = useState<Intervalo | null>(inicial.personalizado)
  const [filtros, setFiltros] = useState<Filtros>(inicial.filtros)
  const antesDaSim = useRef<Guardado | null>(cenario ? lerGuardado() : null)
  const [painelAberto, setPainelAberto] = useState(false)
  const [datasAbertas, setDatasAbertas] = useState(false)
  // 30/10/2026: a conta do filtro só segue a conta conectada quando ela é conhecida
  const [escolhida, setDemo] = useState<boolean | null>(contaDemo)
  const demo = escolhida ?? false
  const [rel, setRel] = useState<RelatorioCompleto | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [dinheiroP, setDinheiroP] = useState<Dinheiro | null>(null)
  const [versao, setVersao] = useState(0)
  const [pulso, setPulso] = useState(0)
  const contaConhecida = useRef<boolean | null>(contaDemo)
  const montadoDe = useRef<string | null>(null)
  const versaoVista = useRef(0)

  const faixa = useMemo(() => intervalo(periodo, new Date(), personalizado), [periodo, personalizado, pulso]) // eslint-disable-line react-hooks/exhaustive-deps
  const umDia = faixa.de === faixa.ate
  const nFiltros = quantosFiltros(filtros)

  // na simulação os filtros não sobrescrevem os guardados do relatório de verdade
  useEffect(() => { if (cenario) return; try { localStorage.setItem(CHAVE, JSON.stringify({ periodo, personalizado, filtros })) } catch { /* sem armazenamento */ } }, [periodo, personalizado, filtros, cenario])
  // só um toque novo no botão abre o editor (voltar para a aba não reabre)
  const pedidoVisto = useRef(pedidoSimulacao)
  useEffect(() => {
    if (pedidoSimulacao === pedidoVisto.current) return
    pedidoVisto.current = pedidoSimulacao
    if (podeSimular) setEditando(true)
  }, [pedidoSimulacao]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { aoMudarSimulacao?.(!!sim) }, [!!sim]) // eslint-disable-line react-hooks/exhaustive-deps
  const mostrarCenario = (c: Cenario) => {
    if (!cenario) antesDaSim.current = { periodo, personalizado, filtros }
    try { localStorage.setItem(CHAVE_SIM, JSON.stringify(c)); sessionStorage.setItem(`${CHAVE_SIM}.ligado`, '1') } catch { /* sem armazenamento */ }
    const pc = periodoDoCenario(c)
    setCenario(c); setEditando(false); setPeriodo(pc.periodo); setPersonalizado(pc.personalizado); setFiltros({}); setDatasAbertas(false)
  }
  const sairDaSimulacao = () => {
    try { sessionStorage.removeItem(`${CHAVE_SIM}.ligado`) } catch { /* sem armazenamento */ }
    const a = antesDaSim.current ?? lerGuardado()
    antesDaSim.current = null
    setCenario(null); setEditando(false); setRel(null); setPeriodo(a.periodo); setPersonalizado(a.personalizado); setFiltros(a.filtros)
  }
  useEffect(() => {
    if (contaDemo === null || contaDemo === contaConhecida.current) return
    contaConhecida.current = contaDemo
    setDemo(contaDemo)
  }, [contaDemo])
  useEffect(() => {
    if (escolhida !== null) return
    const t = window.setTimeout(() => setDemo((d) => d ?? false), 4000)
    return () => window.clearTimeout(t)
  }, [escolhida])

  // fica em dia sozinho: a cada 30 s com a tela à mostra e ao voltar para ela
  useEffect(() => {
    if (exemplo) return
    const bater = () => { if (document.visibilityState === 'visible') setPulso((x) => x + 1) }
    const t = window.setInterval(bater, 30_000)
    document.addEventListener('visibilitychange', bater)
    window.addEventListener('focus', bater)
    return () => { window.clearInterval(t); document.removeEventListener('visibilitychange', bater); window.removeEventListener('focus', bater) }
  }, [exemplo])

  const chaveFiltros = JSON.stringify(filtros)
  useEffect(() => {
    if (escolhida === null && !opsSim) return
    let vivo = true
    const chave = `${faixa.de}|${faixa.ate}|${escolhida}|${chaveFiltros}`
    const mesmoFiltro = montadoDe.current === chave
    const pedido = !mesmoFiltro || versao !== versaoVista.current
    versaoVista.current = versao
    if (pedido) setCarregando(true)
    setErro(null)
    // relatório simulado: as contas são feitas aqui, com as operações do cenário; nada vai ao banco
    if (opsSim) { setRel(relatorioDoCenario(opsSim, { de: faixa.de, ate: faixa.ate, filtros })); setCarregando(false); montadoDe.current = chave; return }
    if (exemplo) { setRel(filtrarExemplo(exemplo.relatorio, filtros)); setCarregando(false); montadoDe.current = chave; return }
    // trocar o filtro mantém os números antigos na tela (esmaecidos) até os novos chegarem
    relatorioCompleto(sessao, { de: faixa.de, ate: faixa.ate, demo: escolhida ?? false, filtros })
      .then((r) => { if (vivo) { setRel(r); montadoDe.current = chave } })
      .catch((e) => { if (vivo && !mesmoFiltro) setErro(/400 dias|data final/.test((e as Error).message) ? (e as Error).message : 'Não foi possível montar o relatório agora. Toque em Atualizar para tentar de novo.') })
      .finally(() => { if (vivo) setCarregando(false) })
    return () => { vivo = false }
  }, [sessao.token, faixa.de, faixa.ate, escolhida, chaveFiltros, versao, pulso, opsSim]) // eslint-disable-line react-hooks/exhaustive-deps

  // depósitos e saques: ao vivo da Deriv, só quando a conta conectada é a do filtro
  const contaDoFiltro = !!sim || !!exemplo?.dinheiro || (conectada && socket && demo === contaDemo)
  useEffect(() => {
    setDinheiroP(sim ? dinheiroDoCenario(sim) : exemplo?.dinheiro ?? null)
    if (sim || exemplo || !contaDoFiltro || !socket || demo) return
    let vivo = true
    dinheiroDoPeriodo(socket, faixa).then((d) => { if (vivo) setDinheiroP(d) }).catch(() => undefined)
    return () => { vivo = false }
  }, [contaDoFiltro, faixa.de, faixa.ate, demo, versao, sim]) // eslint-disable-line react-hooks/exhaustive-deps
  const saldoNaTela = sim ? sim.saldo : saldo

  const v = (x: number) => (ocultos ? MASCARA : dinheiro(x, moeda))
  const vs = (x: number) => (ocultos ? MASCARA : dinheiroComSinal(x, moeda))
  const rotuloConta = (d: boolean) => (tipoNaTela(d ? 'demo' : 'real', rotulosTrocados) === 'demo' ? 'Demo' : 'Real')
  const mudar = (p: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...p }))
  const alternar = (campo: 'estrategias' | 'ativos' | 'tipos', id: string) => setFiltros((f) => {
    const l = f[campo] ?? []
    return { ...f, [campo]: l.includes(id) ? l.filter((x) => x !== id) : [...l, id] }
  })
  const nomeDaEstrategia = (id: string) => rel?.opcoes.estrategias.find((e) => e.id === id)?.nome ?? rel?.porOrigem.find((o) => o.id === id)?.nome ?? id
  const rotuloDoPeriodo = periodo === 'personalizado' ? (umDia ? diaCurto(faixa.de) : `${diaCurto(faixa.de)} a ${diaCurto(faixa.ate)}`) : PERIODOS.find((p) => p.id === periodo)!.rotulo
  const nomeDoAnterior = periodo === 'hoje' ? 'ontem' : periodo === 'ontem' ? 'anteontem' : umDia ? 'o dia anterior' : `os ${diasEntre(faixa.de, faixa.ate)} dias anteriores`
  // 06/11/2026: "em os 30 dias" e "a os 30 dias" viram "nos" e "aos"; "em ontem" vira "ontem"
  const relacaoAoAnterior = periodo === 'hoje' || periodo === 'ontem' ? `a ${nomeDoAnterior}` : umDia ? 'ao dia anterior' : `aos ${diasEntre(faixa.de, faixa.ate)} dias anteriores`
  const semNoAnterior = periodo === 'hoje' || periodo === 'ontem' ? nomeDoAnterior : umDia ? 'no dia anterior' : `nos ${diasEntre(faixa.de, faixa.ate)} dias anteriores`

  // a série do gráfico: por hora num dia só, por dia nos outros (com os dias sem operação)
  const serie = useMemo(() => {
    if (!rel) return { pontos: [] as PontoDoGrafico[] }
    if (umDia) {
      const ph = new Map(rel.porHora.map((h) => [h.hora, h]))
      const pontos: PontoDoGrafico[] = Array.from({ length: 24 }, (_, h) => ({ chave: `${h}h`, longo: `${h}h às ${h}h59`, valor: ph.get(h)?.resultado ?? 0, ops: ph.get(h)?.operacoes ?? 0 }))
      return { pontos }
    }
    const porDia = new Map(rel.porDia.map((d) => [d.dia, d]))
    const pontos: PontoDoGrafico[] = []
    const [a, m, d] = faixa.de.split('-').map(Number)
    for (let dia = new Date(a, m - 1, d); ; dia.setDate(dia.getDate() + 1)) {
      const k = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`
      const curto = `${String(dia.getDate()).padStart(2, '0')}/${String(dia.getMonth() + 1).padStart(2, '0')}`
      pontos.push({ chave: curto, longo: `${DIAS[dia.getDay()]}, ${curto}`, valor: porDia.get(k)?.resultado ?? 0, ops: porDia.get(k)?.operacoes ?? 0 })
      if (k >= faixa.ate || pontos.length > 400) break
    }
    return { pontos }
  }, [rel, umDia, faixa.de, faixa.ate])

  const t = rel?.total
  const vazio = !!rel && t!.operacoes === 0
  const diasComOp = rel?.porDia.filter((d) => d.operacoes > 0) ?? []
  const melhorDia = diasComOp.length ? diasComOp.reduce((a, b) => (b.resultado > a.resultado ? b : a)) : null
  const piorDia = diasComOp.length ? diasComOp.reduce((a, b) => (b.resultado < a.resultado ? b : a)) : null
  const diasPositivos = diasComOp.filter((d) => d.resultado > 0).length
  const maxOrigem = Math.max(1e-9, ...(rel?.porOrigem.map((o) => Math.abs(o.resultado)) ?? [0]))
  const maxHora = Math.max(1e-9, ...(rel?.porHora.map((h) => Math.abs(h.resultado)) ?? [0]))
  const maxDow = Math.max(1e-9, ...(rel?.porDiaSemana.map((h) => Math.abs(h.resultado)) ?? [0]))
  const porHora = new Map(rel?.porHora.map((h) => [h.hora, h]) ?? [])
  const porDow = new Map(rel?.porDiaSemana.map((h) => [h.dow, h]) ?? [])
  const mesNome = rel?.mes.inicio ? MESES[Number(rel.mes.inicio.slice(5, 7)) - 1] : ''
  // 05/11/2026: a taxa do subplano (Gold 10%, Black 5%, Prestige 0); sem subplano lido, a da marca
  const meuSub = subplanoAtual(useMeuSubplano())
  const taxa = meuSub ? meuSub.compartilhamento : MARCA.compartilhamento ?? 0
  const fator = t && t.somaPerdas < 0 ? t.somaGanhos / Math.abs(t.somaPerdas) : null
  const delta = rel && t ? t.resultado - rel.anterior.resultado : 0

  /* ------------------------------------------ atalhos inteligentes */
  const atalhos: Array<{ id: string; rotulo: ReactNode; aplicar: () => void }> = []
  if (rel && rel.total.operacoes) {
    if (!filtros.resultado) {
      atalhos.push({ id: 'ganhas', rotulo: 'Só ganhadoras', aplicar: () => mudar({ resultado: 'ganhas' }) })
      atalhos.push({ id: 'perdidas', rotulo: 'Só perdedoras', aplicar: () => mudar({ resultado: 'perdidas' }) })
    }
    const est = rel.porOrigem.filter((o) => o.operacoes >= 5)
    if (est.length > 1 && !filtros.estrategias?.length) {
      const melhor = est.reduce((a, b) => (b.resultado > a.resultado ? b : a))
      if (melhor.resultado > 0) atalhos.push({ id: 'melhor-est', rotulo: <>A que mais rendeu: <b>{melhor.nome}</b></>, aplicar: () => mudar({ estrategias: [melhor.id] }) })
      const pior = est.reduce((a, b) => (b.resultado < a.resultado ? b : a))
      if (pior.resultado < 0 && pior.id !== melhor.id) atalhos.push({ id: 'pior-est', rotulo: <>A que mais perdeu: <b>{pior.nome}</b></>, aplicar: () => mudar({ estrategias: [pior.id] }) })
      if (rel.porOrigem.some((o) => o.origem === 'manual') && rel.porOrigem.some((o) => o.origem === 'ia')) {
        const ias = rel.opcoes.estrategias.filter((e) => e.origem === 'ia').map((e) => e.id)
        atalhos.push({ id: 'so-ia', rotulo: MARCA.vocabularioIA ? 'Só as I.A.' : 'Só os robôs', aplicar: () => mudar({ estrategias: ias }) })
      }
    }
    const horas = rel.porHora.filter((h) => h.operacoes >= 5)
    if (horas.length > 1 && filtros.horaDe == null && filtros.horaAte == null) {
      const mh = horas.reduce((a, b) => (b.resultado > a.resultado ? b : a))
      if (mh.resultado > 0) atalhos.push({ id: 'melhor-hora', rotulo: <>Melhor horário: <b>{mh.hora}h</b></>, aplicar: () => mudar({ horaDe: mh.hora, horaAte: mh.hora }) })
      const ph = horas.reduce((a, b) => (b.resultado < a.resultado ? b : a))
      if (ph.resultado < 0) atalhos.push({ id: 'pior-hora', rotulo: <>Pior horário: <b>{ph.hora}h</b></>, aplicar: () => mudar({ horaDe: ph.hora, horaAte: ph.hora }) })
    }
  }

  /* ---------------------------------------- o que os números mostram */
  const leituras: Array<{ tom: 'sobe' | 'cai' | 'neutro'; texto: ReactNode }> = []
  if (rel && rel.total.operacoes) {
    if (rel.anterior.operacoes > 0) leituras.push({ tom: delta >= 0 ? 'sobe' : 'cai', texto: <>{delta >= 0 ? 'Melhor' : 'Pior'} que {nomeDoAnterior}: <b>{vs(delta)}</b> de diferença ({vs(rel.anterior.resultado)} naquele período).</> })
    const est = rel.porOrigem.filter((o) => o.operacoes >= 5)
    if (est.length > 1) {
      const m = est.reduce((a, b) => (b.resultado > a.resultado ? b : a))
      leituras.push({ tom: m.resultado >= 0 ? 'sobe' : 'cai', texto: <><b>{m.nome}</b> teve o melhor resultado: {vs(m.resultado)} em {m.operacoes.toLocaleString('pt-BR')} operações, {pct(m.ganhas, m.operacoes)}% de acerto.</> })
      const negativas = rel.porOrigem.filter((o) => o.resultado < 0).sort((a, b) => a.resultado - b.resultado)
      const totalNeg = negativas.reduce((s, o) => s + o.resultado, 0)
      if (negativas.length > 1) leituras.push({ tom: 'cai', texto: <><b>{negativas[0].nome}</b> foi a que mais pesou no negativo: {vs(negativas[0].resultado)}, {pct(negativas[0].resultado, totalNeg)}% das perdas entre as estratégias no vermelho.</> })
    }
    const dows = rel.porDiaSemana.filter((d) => d.operacoes >= 5)
    if (dows.length > 2) {
      const md = dows.reduce((a, b) => (b.resultado > a.resultado ? b : a))
      leituras.push({ tom: md.resultado >= 0 ? 'sobe' : 'cai', texto: <>O melhor dia da semana foi <b>{DIAS_LONGOS[md.dow]}</b>: {vs(md.resultado)}.</> })
    }
    if (rel.sequencias.perdas >= 3) leituras.push({ tom: 'neutro', texto: <>A maior sequência foi de <b>{rel.sequencias.ganhos} ganhos</b> seguidos; a de perdas, <b>{rel.sequencias.perdas}</b>. Vale conferir se o seu limite de perda cobre uma sequência assim.</> })
    if (rel.queda.maior > 0) leituras.push({ tom: 'neutro', texto: <>A maior queda do acumulado, de um pico até o fundo seguinte, foi de <b>{v(rel.queda.maior)}</b>.</> })
  }

  /* ------------------------------------------------- selos dos filtros */
  const selos: Array<{ id: string; texto: string; tirar: () => void }> = []
  if (filtros.resultado) selos.push({ id: 'res', texto: filtros.resultado === 'ganhas' ? 'Só ganhadoras' : 'Só perdedoras', tirar: () => mudar({ resultado: null }) })
  for (const e of filtros.estrategias ?? []) selos.push({ id: `e-${e}`, texto: nomeDaEstrategia(e), tirar: () => alternar('estrategias', e) })
  for (const a of filtros.ativos ?? []) selos.push({ id: `a-${a}`, texto: a ? nomeDoSimbolo(a) : 'Sem ativo', tirar: () => alternar('ativos', a) })
  for (const x of filtros.tipos ?? []) selos.push({ id: `t-${x}`, texto: nomeDoTipo(x) || 'Sem tipo', tirar: () => alternar('tipos', x) })
  if (filtros.dias?.length) selos.push({ id: 'dias', texto: [1, 2, 3, 4, 5, 6, 0].filter((d) => filtros.dias!.includes(d)).map((d) => DIAS[d]).join(', '), tirar: () => mudar({ dias: [] }) })
  if (filtros.horaDe != null || filtros.horaAte != null) selos.push({ id: 'hora', texto: faixaDeHora(filtros.horaDe, filtros.horaAte), tirar: () => mudar({ horaDe: null, horaAte: null }) })
  if (filtros.entradaMin != null || filtros.entradaMax != null) selos.push({ id: 'entrada', texto: `Entrada${filtros.entradaMin != null ? ` de ${simboloMoeda(moeda)} ${filtros.entradaMin}` : ''}${filtros.entradaMax != null ? ` até ${simboloMoeda(moeda)} ${filtros.entradaMax}` : ''}`, tirar: () => mudar({ entradaMin: null, entradaMax: null }) })

  return (
    <div className={`rel ${carregando && rel ? 'lendo' : ''} ${sim ? 'rel-simulado' : ''}`}>
      {/* no celular o topo da plataforma não tem espaço: o botão do admin fica aqui (sem faixa desde 09/11/2026: só o ícone) */}
      {podeSimular && !adminOculto && <div className="rsim-linha-celular"><BotaoSimular ativo={!!sim} aoAbrir={() => setEditando(true)} /></div>}
      {/* ------------------------------------------------ barra de filtros */}
      <div className="rel-barra-filtros">
        <div className="rel-faixa">
          <div className="rel-seg rel-periodos" role="tablist" aria-label="Período">
            {PERIODOS.map((p) => <button key={p.id} type="button" role="tab" aria-selected={periodo === p.id} className={periodo === p.id ? 'on' : ''} onClick={() => { setPeriodo(p.id); setDatasAbertas(false) }}>{p.rotulo}</button>)}
            <button type="button" role="tab" aria-selected={periodo === 'personalizado'} className={`rel-datas-btn ${periodo === 'personalizado' ? 'on' : ''}`} onClick={() => setDatasAbertas((x) => !x)} aria-expanded={datasAbertas}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
              {periodo === 'personalizado' ? rotuloDoPeriodo : 'Datas'}
            </button>
          </div>
          <div className="rel-linha">
            <div className="rel-seg rel-conta" role="tablist" aria-label="Conta">
              {[false, true].map((d) => <button key={String(d)} type="button" role="tab" aria-selected={demo === d} className={`${demo === d ? 'on' : ''} ${rotuloConta(d) === 'Real' ? 'real' : 'demo'}`} onClick={() => setDemo(d)}>{rotuloConta(d)}</button>)}
            </div>
            <button type="button" className={`rel-filtros-btn ${nFiltros ? 'com' : ''}`} onClick={() => setPainelAberto(true)} disabled={!rel}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>Filtros{nFiltros ? <b>{nFiltros}</b> : null}
            </button>
            <button type="button" className="rel-atualizar" onClick={() => setVersao((x) => x + 1)} disabled={carregando} aria-label="Atualizar" title="Atualizar">
              <svg className={carregando ? 'gira' : ''} viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4h-4" /></svg>
            </button>
          </div>
        </div>
        {datasAbertas && <EscolherDatas inicial={periodo === 'personalizado' ? faixa : null} aoAplicar={(i) => { setPersonalizado(i); setPeriodo('personalizado'); setDatasAbertas(false) }} aoFechar={() => setDatasAbertas(false)} />}
        {selos.length > 0 && (
          <div className="rel-selos" aria-label="Filtros ligados">
            {selos.map((x) => <button key={x.id} type="button" className="rel-selo on" onClick={x.tirar} aria-label={`Tirar o filtro ${x.texto}`}>{x.texto}<i aria-hidden="true">×</i></button>)}
            {selos.length > 1 && <button type="button" className="rel-selo limpar" onClick={() => setFiltros({})}>Limpar</button>}
          </div>
        )}
        {atalhos.length > 0 && (
          <div className="rel-selos rel-sugestoes" aria-label="Sugestões de filtro">
            <span className="rel-sugestoes-rot"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /></svg>Sugestões</span>
            {atalhos.map((a) => <button key={a.id} type="button" className="rel-selo atalho" onClick={a.aplicar}>{a.rotulo}</button>)}
          </div>
        )}
      </div>

      {erro && <p className="rel-erro" role="alert">{erro}</p>}
      {!rel && carregando && <div className="rel-esqueleto" aria-busy="true"><i /><i /><i /></div>}

      {rel && vazio && (
        <section className="rel-vazio">
          <h3>{nFiltros ? 'Nenhuma operação com esses filtros' : `Nenhuma operação na conta ${rotuloConta(demo)} neste período`}</h3>
          <p>{nFiltros ? 'Tire um filtro ou escolha outro período.' : `Assim que você operar pela ${MARCA.prosa}, cada resultado aparece aqui, com os números da corretora.`}</p>
          <div className="rel-vazio-acoes">
            {nFiltros ? <button type="button" className="rel-btn ouro" onClick={() => setFiltros({})}>Limpar filtros</button> : <>
              <button type="button" className="rel-btn ouro" onClick={() => aoIr('robos')}>{MARCA.vocabularioIA ? 'Ligar uma I.A.' : 'Ligar um robô'}</button>
              <button type="button" className="rel-btn" onClick={() => aoIr('operar')}>Operar no manual</button>
            </>}
          </div>
        </section>
      )}

      {rel && !vazio && t && <>
        {/* ------------------------------------------------ o resultado */}
        <section className={`rel-heroi ${classe(t.resultado)}`}>
          {sim && !adminOculto && <span className="rsim-tag rsim-tag-canto"><i aria-hidden="true" />Relatório simulado</span>}
          <div className="rel-heroi-topo">
            <div className="rel-heroi-txt">
              <span className="rel-rot">Resultado · {rotuloDoPeriodo.toLowerCase()} · conta {rotuloConta(demo).toLowerCase()}{nFiltros ? ` · ${nFiltros} ${nFiltros === 1 ? 'filtro' : 'filtros'}` : ''}</span>
              <b className={`rel-numero ${classe(t.resultado)}`}>{vs(t.resultado)}</b>
              {rel.anterior.operacoes > 0
                ? <span className={`rel-compara ${classe(delta)}`}><i aria-hidden="true">{delta >= 0 ? '▲' : '▼'}</i>{vs(delta)} <em>em relação {relacaoAoAnterior}</em></span>
                : <span className="rel-compara"><em>Sem operações {semNoAnterior} para comparar</em></span>}
            </div>
            <dl className="rel-heroi-mini">
              <div><dt>Operações</dt><dd>{t.operacoes.toLocaleString('pt-BR')}</dd><small><em className="sobe">{t.ganhas.toLocaleString('pt-BR')}</em> ganhas · <em className="cai">{(t.operacoes - t.ganhas).toLocaleString('pt-BR')}</em> perdidas</small></div>
              <div><dt>Acerto</dt><dd>{pct(t.ganhas, t.operacoes)}%</dd><i className="rel-trilho"><u style={{ width: `${pct(t.ganhas, t.operacoes)}%` }} /></i></div>
              <div><dt>Fator de lucro</dt><dd className={fator == null || fator >= 1 ? 'sobe' : 'cai'}>{fator == null ? 'Sem perdas' : fator.toLocaleString('pt-BR', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}</dd><small>{v(t.somaGanhos)} em ganhos ÷ {v(Math.abs(t.somaPerdas))} em perdas</small></div>
            </dl>
          </div>
          <GraficoDoResultado pontos={serie.pontos} ocultos={ocultos} moeda={moeda} porHora={umDia} />
        </section>

        <div className="rel-kpis cinco">
          <div><span>Média por operação</span><b className={classe(t.resultado)}>{vs(t.resultado / t.operacoes)}</b><small>{t.entradas ? `${((t.resultado / t.entradas) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% sobre ${v(t.entradas)} em entradas` : ''}</small></div>
          <div><span>{umDia ? 'Maior ganho' : 'Melhor dia'}</span><b className="sobe">{umDia ? vs(t.maiorGanho) : melhorDia ? vs(melhorDia.resultado) : '—'}</b><small>{umDia ? 'Numa operação' : melhorDia ? diaCurto(melhorDia.dia) : ''}</small></div>
          <div><span>{umDia ? 'Maior perda' : 'Pior dia'}</span><b className="cai">{umDia ? vs(t.maiorPerda) : piorDia ? vs(piorDia.resultado) : '—'}</b><small>{umDia ? 'Numa operação' : piorDia ? `${diaCurto(piorDia.dia)} · ${diasPositivos} de ${diasComOp.length} dias no positivo` : ''}</small></div>
          <div><span>Sequências</span><b><em className="sobe">{rel.sequencias.ganhos}</em><small> / </small><em className="cai">{rel.sequencias.perdas}</em></b><small>Mais ganhos e mais perdas seguidas</small></div>
          <div><span>Maior queda</span><b className={rel.queda.maior > 0 ? 'cai' : ''}>{rel.queda.maior > 0 ? (ocultos ? MASCARA : `−${dinheiro(rel.queda.maior, moeda)}`) : v(0)}</b><small>Do pico até o fundo seguinte</small></div>
        </div>

        {leituras.length > 0 && (
          <section className="rel-bloco rel-leituras">
            <h3>O que os números mostram</h3>
            <ul>{leituras.slice(0, 5).map((l, i) => <li key={i} className={l.tom}><i aria-hidden="true" /><span>{l.texto}</span></li>)}</ul>
          </section>
        )}

        {/* compartilhamento do mês: só na conta real e sem filtro (com filtro o número não é o do mês) */}
        {taxa > 0 && !demo && !nFiltros && (
          <section className="rel-comp">
            <div>
              <span className="rel-rot">Compartilhamento de {mesNome}</span>
              <p>{rel.mes.resultado > 0
                ? <>Lucro pela plataforma na conta real até agora: <b>{v(rel.mes.resultado)}</b>. Estimativa de {Math.round(taxa * 100)}%: <b className="ouro">{v(rel.mes.resultado * taxa)}</b>.</>
                : <>Até agora o mês está {rel.mes.operacoes ? 'sem lucro' : 'sem operações'} na conta real: <b>nada a pagar</b>.</>}</p>
            </div>
            <small>A plataforma é gratuita. Você só paga {Math.round(taxa * 100)}% do lucro do mês, apurado no início do mês seguinte. Mês sem lucro, nada a pagar.</small>
          </section>
        )}

        <div className="rel-duas">
          <section className="rel-bloco">
            <div className="rel-bloco-cab"><h3>Por estratégia</h3><small className="rel-dica">Toque para filtrar</small></div>
            <ul className="rel-lista">
              {rel.porOrigem.map((o) => {
                const on = !!filtros.estrategias?.includes(o.id)
                return (
                  <li key={`${o.origem}-${o.id}`}>
                    <button type="button" className={on ? 'on' : ''} onClick={() => alternar('estrategias', o.id)} aria-pressed={on}>
                      <span className="rel-lista-cab"><b>{o.origem === 'manual' ? o.nome : <NomeDoRobo nome={o.nome} id={o.id} />}</b><span className={classe(o.resultado)}>{vs(o.resultado)}</span></span>
                      <i className={`rel-barra ${classe(o.resultado)}`}><u style={{ width: `${(Math.abs(o.resultado) / maxOrigem) * 100}%` }} /></i>
                      <small>{o.operacoes.toLocaleString('pt-BR')} operações · {pct(o.ganhas, o.operacoes)}% de acerto · média {vs(o.resultado / Math.max(1, o.operacoes))}</small>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="rel-bloco">
            <div className="rel-bloco-cab"><h3>Seus horários</h3><small className="rel-dica">Toque numa hora para filtrar</small></div>
            <div className="rel-horas">
              {Array.from({ length: 24 }, (_, h) => {
                const x = porHora.get(h)
                const forca = x ? Math.max(.18, Math.abs(x.resultado) / maxHora) : 0
                const on = filtros.horaDe === h && filtros.horaAte === h
                return <button type="button" key={h} disabled={!x && !on} className={`${x ? classe(x.resultado) || 'neutro' : 'vazio'} ${on ? 'on' : ''}`} style={{ '--forca': forca } as CSSProperties}
                  onClick={() => mudar(on ? { horaDe: null, horaAte: null } : { horaDe: h, horaAte: h })}
                  title={x ? `${h}h: ${ocultos ? MASCARA : dinheiroComSinal(x.resultado, moeda)} · ${x.operacoes} operações · ${pct(x.ganhas, x.operacoes)}% de acerto` : `${h}h: sem operações`}
                  aria-label={x ? `${h} horas: ${ocultos ? 'valor oculto' : dinheiroComSinal(x.resultado, moeda)}, ${x.operacoes} operações` : `${h} horas: sem operações`} />
              })}
            </div>
            <div className="rel-horas-eixo"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>
            <p className="rel-nota">Verde é hora no positivo, vermelho no negativo. Quanto mais forte a cor, maior o valor.</p>

            <h3 className="rel-sub">Dias da semana</h3>
            <div className="rel-dows">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const x = porDow.get(d)
                const on = filtros.dias?.length === 1 && filtros.dias[0] === d
                const alt = x ? Math.max(6, (Math.abs(x.resultado) / maxDow) * 100) : 0
                return (
                  <button type="button" key={d} className={`${x ? classe(x.resultado) || 'neutro' : 'vazio'} ${on ? 'on' : ''}`} disabled={!x && !on} onClick={() => mudar({ dias: on ? [] : [d] })}
                    title={x ? `${DIAS_LONGOS[d]}: ${ocultos ? MASCARA : dinheiroComSinal(x.resultado, moeda)} · ${x.operacoes} operações` : `${DIAS_LONGOS[d]}: sem operações`}>
                    <span className="rel-dow-barra"><i style={{ height: `${alt}%` }} /></span>
                    <small>{DIAS[d]}</small>
                  </button>
                )
              })}
            </div>
          </section>
        </div>

        <div className="rel-duas">
          <section className="rel-bloco">
            <div className="rel-bloco-cab"><h3>Ativos</h3><small className="rel-dica">Toque para filtrar</small></div>
            <ul className="rel-ativos">
              {rel.porAtivo.slice(0, 8).map((a) => (
                <li key={a.ativo}><button type="button" className={filtros.ativos?.includes(a.ativo) ? 'on' : ''} onClick={() => alternar('ativos', a.ativo)}>
                  <b>{a.ativo ? nomeDoSimbolo(a.ativo) : '—'}</b><span>{a.operacoes.toLocaleString('pt-BR')} op. · {pct(a.ganhas, a.operacoes)}%</span><em className={classe(a.resultado)}>{vs(a.resultado)}</em>
                </button></li>
              ))}
            </ul>
          </section>
          <section className="rel-bloco">
            <div className="rel-bloco-cab"><h3>Tipos de contrato</h3><small className="rel-dica">Toque para filtrar</small></div>
            <ul className="rel-ativos">
              {rel.porTipo.slice(0, 8).map((a) => (
                <li key={a.tipo}><button type="button" className={filtros.tipos?.includes(a.tipo) ? 'on' : ''} onClick={() => alternar('tipos', a.tipo)}>
                  <b>{nomeDoTipo(a.tipo) || '—'}</b><span>{a.operacoes.toLocaleString('pt-BR')} op. · {pct(a.ganhas, a.operacoes)}%</span><em className={classe(a.resultado)}>{vs(a.resultado)}</em>
                </button></li>
              ))}
            </ul>
          </section>
        </div>
      </>}

      {/* ------------------------------------------------ dinheiro na corretora */}
      {rel && !demo && (
        <section className="rel-bloco rel-dinheiro">
          <div className="rel-bloco-cab">
            <h3>Na corretora</h3>
            <a className="rel-link" href={DERIV.deposito} target="_blank" rel="noopener noreferrer">Depositar na Deriv ↗</a>
          </div>
          {!contaDoFiltro ? <p className="rel-nota">{conectada ? `Para ver depósitos e saques, escolha a conta ${rotuloConta(false)} no topo da plataforma.` : 'Conecte a corretora para ver o saldo, os depósitos e os saques.'}</p> : <>
            <div className="rel-kpis tres">
              <div><span>Saldo agora</span><b>{saldoNaTela === null ? '—' : v(saldoNaTela)}</b><small>{sim ? 'Valor do cenário simulado' : 'Ao vivo da corretora'}</small></div>
              <div><span>Depósitos no período</span><b className="sobe">{dinheiroP ? v(dinheiroP.depositos) : '…'}</b><small>{dinheiroP ? (() => { const k = dinheiroP.movimentos.filter((x) => x.tipo === 'deposit').length; return `${k} ${k === 1 ? 'depósito' : 'depósitos'}` })() : 'Lendo o extrato…'}</small></div>
              <div><span>Saques no período</span><b>{dinheiroP ? v(dinheiroP.saques) : '…'}</b><small>{dinheiroP ? (() => { const k = dinheiroP.movimentos.filter((x) => x.tipo === 'withdrawal').length; return `${k} ${k === 1 ? 'saque' : 'saques'}` })() : 'Lendo o extrato…'}</small></div>
            </div>
            {dinheiroP && dinheiroP.movimentos.length > 0 && <ul className="rel-movs">
              {dinheiroP.movimentos.slice(0, 8).map((m, i) => (
                <li key={i}><span>{new Date(m.quando * 1000).toLocaleDateString('pt-BR')} · {new Date(m.quando * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span><b>{m.tipo === 'deposit' ? 'Depósito' : 'Saque'}</b><em className={m.tipo === 'deposit' ? 'sobe' : ''}>{m.tipo === 'deposit' ? '+' : '−'}{ocultos ? MASCARA : dinheiro(m.valor, moeda)}</em></li>
              ))}
            </ul>}
          </>}
        </section>
      )}

      {rel && !vazio && <TabelaDeOperacoes rel={rel} filtros={filtros} mudar={mudar} ocultos={ocultos} moeda={moeda} vs={vs} simulado={!!sim} />}

      {sim ? <p className="rel-fonte"><b>Relatório simulado.</b> Números preenchidos pela equipe da {MARCA.prosa} para as aulas, para mostrar cenários de gerenciamento. Não são operações reais, não foram gravados e não entram em nenhuma cobrança.</p> : <p className="rel-fonte">Números das operações feitas pela {MARCA.prosa}, como a corretora registrou cada contrato. Depósitos, saques e saldo vêm ao vivo da corretora. Valores em dólar. Resultados passados não garantem resultados futuros.</p>}

      {editando && podeSimular && !adminOculto && <EditorDoCenario inicial={cenario ?? lerCenario(CHAVE_SIM) ?? cenariosProntos()[0].cenario} aoMostrar={mostrarCenario} aoFechar={() => setEditando(false)} aoSair={sim ? sairDaSimulacao : undefined} />}
      {painelAberto && rel && <PainelDeFiltros rel={rel} filtros={filtros} moeda={moeda} aoAplicar={(f) => { setFiltros(f); setPainelAberto(false) }} aoFechar={() => setPainelAberto(false)} />}
    </div>
  )
}

/* ========================================================== datas livres */

function EscolherDatas({ inicial, aoAplicar, aoFechar }: { inicial: Intervalo | null; aoAplicar: (i: Intervalo) => void; aoFechar: () => void }) {
  const hoje = hojeLocal()
  const [de, setDe] = useState(inicial?.de ?? hoje)
  const [ate, setAte] = useState(inicial?.ate ?? hoje)
  const falha = !de || !ate ? 'Escolha as duas datas.' : ate < de ? 'A data final vem antes da inicial.' : diasEntre(de, ate) > 401 ? 'Escolha um período de até 400 dias.' : ''
  return (
    <div className="rel-datas" role="dialog" aria-label="Escolher as datas">
      <label><span>De</span><input id="rel-de" type="date" value={de} max={hoje} onChange={(e) => setDe(e.target.value)} /></label>
      <label><span>Até</span><input id="rel-ate" type="date" value={ate} max={hoje} onChange={(e) => setAte(e.target.value)} /></label>
      <div className="rel-datas-acoes">
        {falha ? <small className="cai">{falha}</small> : <small>{diasEntre(de, ate)} {diasEntre(de, ate) === 1 ? 'dia' : 'dias'}</small>}
        <button type="button" className="rel-btn" onClick={aoFechar}>Cancelar</button>
        <button type="button" className="rel-btn ouro" disabled={!!falha} onClick={() => aoAplicar({ de, ate })}>Ver período</button>
      </div>
    </div>
  )
}

/* ======================================================= painel de filtros */

function PainelDeFiltros({ rel, filtros, moeda, aoAplicar, aoFechar }: { rel: RelatorioCompleto; filtros: Filtros; moeda: string; aoAplicar: (f: Filtros) => void; aoFechar: () => void }) {
  const [f, setF] = useState<Filtros>(filtros)
  const mudar = (p: Partial<Filtros>) => setF((x) => ({ ...x, ...p }))
  const alternar = (campo: 'estrategias' | 'ativos' | 'tipos', id: string) => setF((x) => { const l = x[campo] ?? []; return { ...x, [campo]: l.includes(id) ? l.filter((y) => y !== id) : [...l, id] } })
  const alternarDia = (d: number) => setF((x) => { const l = x.dias ?? []; return { ...x, dias: l.includes(d) ? l.filter((y) => y !== d) : [...l, d] } })
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    document.body.classList.add('rel-painel-aberto')
    return () => { window.removeEventListener('keydown', esc); document.body.classList.remove('rel-painel-aberto') }
  }, [aoFechar])
  const numero = (v: string) => { const t = v.trim().replace(',', '.'); if (!t) return null; const x = Number(t); return Number.isFinite(x) && x >= 0 ? x : null }
  const n = quantosFiltros(f)
  const contagem = (l: string[] | undefined, m: string, fem = false) => (l?.length ? `${l.length} escolhid${fem ? 'a' : 'o'}${l.length > 1 ? 's' : ''}` : m)
  return (
    <div className="rel-painel-fundo" onMouseDown={aoFechar}>
      <section className="rel-painel" role="dialog" aria-modal="true" aria-label="Filtros do relatório" onMouseDown={(e) => e.stopPropagation()}>
        <header><b>Filtros</b><button type="button" onClick={aoFechar} aria-label="Fechar">×</button></header>
        <div className="rel-painel-corpo">
          <fieldset>
            <legend>Resultado</legend>
            <div className="rel-seg cheio">
              {([[null, 'Todas'], ['ganhas', 'Ganhadoras'], ['perdidas', 'Perdedoras']] as const).map(([id, nome]) => (
                <button key={nome} type="button" className={(f.resultado ?? null) === id ? 'on' : ''} onClick={() => mudar({ resultado: id })}>{nome}</button>
              ))}
            </div>
          </fieldset>
          {rel.opcoes.estrategias.length > 0 && (
            <fieldset>
              <legend>Estratégias <small>{contagem(f.estrategias, 'Todas', true)}</small></legend>
              <div className="rel-fichas">
                {rel.opcoes.estrategias.map((e) => <button key={e.id} type="button" className={f.estrategias?.includes(e.id) ? 'on' : ''} onClick={() => alternar('estrategias', e.id)}>{e.nome || e.id}<small>{e.operacoes.toLocaleString('pt-BR')}</small></button>)}
              </div>
            </fieldset>
          )}
          {rel.opcoes.ativos.length > 1 && (
            <fieldset>
              <legend>Ativos <small>{contagem(f.ativos, 'Todos')}</small></legend>
              <div className="rel-fichas">
                {rel.opcoes.ativos.map((a) => <button key={a.id} type="button" className={f.ativos?.includes(a.id) ? 'on' : ''} onClick={() => alternar('ativos', a.id)}>{a.id ? nomeDoSimbolo(a.id) : 'Sem ativo'}<small>{a.operacoes.toLocaleString('pt-BR')}</small></button>)}
              </div>
            </fieldset>
          )}
          {rel.opcoes.tipos.length > 1 && (
            <fieldset>
              <legend>Tipo de contrato <small>{contagem(f.tipos, 'Todos')}</small></legend>
              <div className="rel-fichas">
                {rel.opcoes.tipos.map((a) => <button key={a.id} type="button" className={f.tipos?.includes(a.id) ? 'on' : ''} onClick={() => alternar('tipos', a.id)}>{nomeDoTipo(a.id) || 'Sem tipo'}<small>{a.operacoes.toLocaleString('pt-BR')}</small></button>)}
              </div>
            </fieldset>
          )}
          <fieldset>
            <legend>Dias da semana <small>{f.dias?.length ? `${f.dias.length} escolhido${f.dias.length > 1 ? 's' : ''}` : 'Todos'}</small></legend>
            <div className="rel-fichas dias">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => <button key={d} type="button" className={f.dias?.includes(d) ? 'on' : ''} onClick={() => alternarDia(d)}>{DIAS[d]}</button>)}
            </div>
          </fieldset>
          <fieldset>
            <legend>Horário <small>{faixaDeHora(f.horaDe, f.horaAte) || 'O dia todo'}</small></legend>
            <div className="rel-fichas">
              {FAIXAS.map((x) => { const on = f.horaDe === x.de && f.horaAte === x.ate; return <button key={x.nome} type="button" className={on ? 'on' : ''} onClick={() => mudar(on ? { horaDe: null, horaAte: null } : { horaDe: x.de, horaAte: x.ate })}>{x.nome}<small>{x.de}h–{x.ate}h</small></button> })}
            </div>
            <div className="rel-duplo">
              <label><span>Das</span><select id="rel-hora-de" value={f.horaDe ?? ''} onChange={(e) => mudar({ horaDe: e.target.value === '' ? null : Number(e.target.value) })}><option value="">—</option>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}h</option>)}</select></label>
              <label><span>Até</span><select id="rel-hora-ate" value={f.horaAte ?? ''} onChange={(e) => mudar({ horaAte: e.target.value === '' ? null : Number(e.target.value) })}><option value="">—</option>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{h}h59</option>)}</select></label>
            </div>
            {f.horaDe != null && f.horaAte != null && f.horaDe > f.horaAte && <small className="rel-nota">Atravessa a meia-noite: das {f.horaDe}h até as {f.horaAte}h59.</small>}
          </fieldset>
          <fieldset>
            <legend>Valor de entrada <small>{simboloMoeda(moeda)}</small></legend>
            <div className="rel-duplo">
              <label><span>Mínimo</span><input id="rel-entrada-min" inputMode="decimal" placeholder="0,35" defaultValue={f.entradaMin ?? ''} onChange={(e) => mudar({ entradaMin: numero(e.target.value) })} /></label>
              <label><span>Máximo</span><input id="rel-entrada-max" inputMode="decimal" placeholder={rel.opcoes.entradaMax ? rel.opcoes.entradaMax.toLocaleString('pt-BR') : ''} defaultValue={f.entradaMax ?? ''} onChange={(e) => mudar({ entradaMax: numero(e.target.value) })} /></label>
            </div>
            <small className="rel-nota">Serve para separar as entradas de recuperação, que são maiores, das entradas normais.</small>
          </fieldset>
        </div>
        <footer>
          <button type="button" className="rel-btn" onClick={() => setF({})} disabled={!n}>Limpar</button>
          <button type="button" className="rel-btn ouro" onClick={() => aoAplicar(f)}>{n ? `Aplicar ${n} ${n === 1 ? 'filtro' : 'filtros'}` : 'Ver sem filtros'}</button>
        </footer>
      </section>
    </div>
  )
}

/* ================================================== a lista de operações */

type Ordem = 'recentes' | 'ganho' | 'perda' | 'entrada'
function TabelaDeOperacoes({ rel, filtros, mudar, ocultos, moeda, vs, simulado = false }: { rel: RelatorioCompleto; filtros: Filtros; mudar: (p: Partial<Filtros>) => void; ocultos: boolean; moeda: string; vs: (x: number) => string; simulado?: boolean }) {
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [mostrar, setMostrar] = useState(15)
  useEffect(() => setMostrar(15), [rel.de, rel.ate, rel.contagem])
  const lista = useMemo(() => {
    const l = rel.ultimas.slice()
    if (ordem === 'ganho') l.sort((a, b) => b.resultado - a.resultado)
    if (ordem === 'perda') l.sort((a, b) => a.resultado - b.resultado)
    if (ordem === 'entrada') l.sort((a, b) => b.entrada - a.entrada)
    return l
  }, [rel, ordem])
  const exportar = () => {
    const linhas = simulado ? ['"Relatório simulado: números preenchidos pela equipe para as aulas, não são operações reais"'] : []
    linhas.push(['Data', 'Hora', 'Estratégia', 'Ativo', 'Tipo', 'Entrada', 'Retorno', 'Resultado'].join(';'))
    for (const o of lista) {
      const d = new Date(o.quando)
      linhas.push([d.toLocaleDateString('pt-BR'), d.toLocaleTimeString('pt-BR'), o.nome, o.ativo ? nomeDoSimbolo(o.ativo) : '', nomeDoTipo(o.tipo), o.entrada.toFixed(2).replace('.', ','), o.pagamento.toFixed(2).replace('.', ','), o.resultado.toFixed(2).replace('.', ',')].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';'))
    }
    const url = URL.createObjectURL(new Blob([`﻿${linhas.join('\n')}`], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `relatorio-${simulado ? 'simulado-' : ''}${rel.de}-a-${rel.ate}.csv`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
  }
  return (
    <section className="rel-bloco">
      <div className="rel-bloco-cab">
        <h3>Operações <small className="rel-dica">{rel.contagem.toLocaleString('pt-BR')} no período{rel.contagem > rel.ultimas.length ? ` · as ${rel.ultimas.length} mais recentes aqui` : ''}</small></h3>
        {!ocultos && lista.length > 0 && <button type="button" className="rel-link" onClick={exportar}>Baixar planilha</button>}
      </div>
      <div className="rel-ops-controles">
        <div className="rel-seg">
          {([[null, 'Todas'], ['ganhas', 'Ganhas'], ['perdidas', 'Perdidas']] as const).map(([id, nome]) => <button key={nome} type="button" className={(filtros.resultado ?? null) === id ? 'on' : ''} onClick={() => mudar({ resultado: id })}>{nome}</button>)}
        </div>
        <label className="rel-ordem"><span>Ordenar</span>
          <select id="rel-ordem" value={ordem} onChange={(e) => setOrdem(e.target.value as Ordem)}>
            <option value="recentes">Mais recentes</option><option value="ganho">Maior ganho</option><option value="perda">Maior perda</option><option value="entrada">Maior entrada</option>
          </select>
        </label>
      </div>
      <div className="rel-ops">
        <div className="cab"><span>Quando</span><span>Estratégia</span><span>Ativo</span><span>Entrada</span><span>Resultado</span></div>
        {lista.slice(0, mostrar).map((o, i) => {
          const d = new Date(o.quando)
          return (
            <div className={`linha ${o.ganhou ? 'ganhou' : 'perdeu'}`} key={i}>
              <span>{d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} · {d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              <span><b>{o.origem === 'manual' ? o.nome : <NomeDoRobo nome={o.nome} id={o.id} />}</b><small>{nomeDoTipo(o.tipo)}</small></span>
              <span>{o.ativo ? nomeDoSimbolo(o.ativo) : '—'}</span>
              <span>{ocultos ? MASCARA : `${simboloMoeda(moeda)} ${o.entrada.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
              <span className={classe(o.resultado)}>{vs(o.resultado)}</span>
            </div>
          )
        })}
      </div>
      {lista.length > mostrar && <button type="button" className="rel-mais" onClick={() => setMostrar((x) => x + 30)}>Mostrar mais {Math.min(30, lista.length - mostrar)}</button>}
    </section>
  )
}

/* ====================================== laboratório: os filtros no exemplo */

function filtrarExemplo(r: RelatorioCompleto, f: Filtros): RelatorioCompleto {
  if (!quantosFiltros(f)) return r
  const ultimas = r.ultimas.filter((o) => (!f.resultado || (f.resultado === 'ganhas') === o.ganhou) && (!f.estrategias?.length || f.estrategias.includes(o.id)) && (!f.ativos?.length || f.ativos.includes(o.ativo)) && (!f.tipos?.length || f.tipos.includes(o.tipo)))
  const ganhas = ultimas.filter((o) => o.ganhou).length, resultado = ultimas.reduce((s, o) => s + o.resultado, 0)
  return {
    ...r, ultimas, contagem: ultimas.length,
    total: { ...r.total, operacoes: ultimas.length, ganhas, resultado, entradas: ultimas.reduce((s, o) => s + o.entrada, 0), somaGanhos: ultimas.filter((o) => o.resultado > 0).reduce((s, o) => s + o.resultado, 0), somaPerdas: ultimas.filter((o) => o.resultado < 0).reduce((s, o) => s + o.resultado, 0) },
    porOrigem: r.porOrigem.filter((o) => !f.estrategias?.length || f.estrategias.includes(o.id)),
  }
}
