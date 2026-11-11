/** Laboratório (?tela=visao-geral(&cenario=real|vazio)(&periodo=hoje|ontem|7|30|mes|personalizado)(&metas=nenhuma)): a Visão geral com números de exemplo, sem banco. */
import { VisaoGeralPainel } from './VisaoGeralPainel'
import { PERIODO_AGORA, type AtalhoDoPeriodo } from './PeriodoDaVisaoGeral'

const hoje = new Date()
const dia = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function exemplo(cenario: string) {
  const vazio = cenario === 'vazio', real = cenario === 'real'
  return {
    agora: { na_plataforma: vazio ? 8 : 132, operando_real: vazio ? 0 : real ? 6 : 23, operando_demo: vazio ? 1 : 41, banca_operando_real: vazio ? 0 : real ? 904 : 48_320.55,
      ias_real: vazio ? 0 : 19, ias_demo: 41, manuais_real: vazio ? 0 : 7 },
    banca: { total: real ? 904 : 186_450.9, clientes_com_saldo: real ? 14 : 214, contas_reais: real ? 118 : 402, maior: real ? 625 : 25_400,
      faixas: [{ rotulo: 'Até US$ 50', clientes: real ? 9 : 48, soma: 0 }, { rotulo: 'US$ 50 a 200', clientes: real ? 3 : 61, soma: 0 }, { rotulo: 'US$ 200 a 1 mil', clientes: real ? 2 : 70, soma: 0 },
               { rotulo: 'US$ 1 mil a 5 mil', clientes: real ? 0 : 28, soma: 0 }, { rotulo: 'Mais de US$ 5 mil', clientes: real ? 0 : 7, soma: 0 }],
      top: ['Marcos Vinícius Andrade', 'Patrícia Lemos', 'Rafael Costa', 'Juliana Prado', 'Eduardo Nunes'].map((nome, i) => ({
        user_id: `t${i}`, nome, foto_url: null, parceiro: ['n', 'v', null, 'n', 'v'][i], saldo: real ? [625, 120, 80, 35, 20][i] : [25400, 18250.4, 12800, 9930, 7420][i], operando: i === 0 || i === 2, online: i < 3 })) },
    markup: { hoje: real ? 10.28 : 412.6, d7: real ? 10.28 : 2_318.4, d30: real ? 13.54 : 8_904.2, mes: real ? 10.63 : 3_210.8,
      serie: Array.from({ length: 30 }, (_, i) => ({ dia: dia(29 - i), markup: real ? (i === 29 ? 10.28 : i > 25 ? 0.8 : 0) : Math.round((180 + Math.sin(i / 3) * 90 + i * 9) * 100) / 100, operacoes: 400 + i * 12 })) },
    hoje: { operacoes: real ? 476 : 8_412, volume: real ? 209.94 : 41_220, resultado: real ? -24.14 : 1_280.4, operaram: real ? 5 : 64 },
    funil: { cadastrados: 1062, ativos: 1057, conectaram: real ? 158 : 640, conta_real: real ? 117 : 402, com_saldo: real ? 14 : 214, operaram_real: real ? 8 : 131, ativos_24h: 519 },
    dinheiro: { depositos_7d: real ? 942.37 : 32_400, saques_7d: real ? 85.44 : 6_120.5, depositos_30d: real ? 1070.77 : 98_300, saques_30d: real ? 99.24 : 21_450, depositantes_30d: real ? 12 : 188 },
    alertas: { expirados: real ? 0 : 3, vencem_7d: real ? 0 : 12 },
  }
}

/** O período de exemplo: uma barra por hora (até 48 h) ou por dia, com números que crescem com o tamanho do período. */
function exemploDoPeriodo(corpo: string, cenario: string) {
  const { p_de, p_ate } = JSON.parse(corpo || '{}') as { p_de: string; p_ate: string }
  const de = Date.parse(p_de), ate = Date.parse(p_ate), horas = Math.max(1, (ate - de) / 3_600_000)
  const escala = horas <= 48 ? 'hora' : 'dia'
  const passo = escala === 'hora' ? 3_600_000 : 86_400_000
  const br = (ms: number) => new Date(ms - 3 * 3_600_000).toISOString().slice(0, 16)
  const ini = escala === 'hora' ? Math.floor((de - 0) / passo) * passo : Date.parse(`${br(de).slice(0, 10)}T00:00:00-03:00`)
  const serie: Array<{ ini: string; markup: number; operacoes: number }> = []
  for (let t = ini, i = 0; t < ate && i < 400; t += passo, i++) {
    const h = Number(br(t).slice(11, 13))
    const peso = escala === 'hora' ? (h < 6 ? 0.15 : h < 10 ? 0.5 : 1 + Math.sin(h / 3) * 0.4) : 1 + Math.sin(i / 3) * 0.35
    const markup = cenario === 'vazio' ? 0 : Math.round((escala === 'hora' ? 24 : 520) * peso * 100) / 100
    serie.push({ ini: br(t), markup, operacoes: Math.round(markup * 26) })
  }
  const total = serie.reduce((a, d) => a + d.markup, 0), ops = serie.reduce((a, d) => a + d.operacoes, 0)
  const dias = horas / 24
  return {
    escala, serie,
    markup: { total, ia: total * 0.9, manual: total * 0.1, ultima_em: new Date(Math.min(ate, Date.now()) - 120_000).toISOString() },
    operacoes: { total: ops, ia: Math.round(ops * 0.98), manual: Math.round(ops * 0.02), volume: ops * 0.84, resultado: -ops * 0.06, operaram: Math.round(Math.min(160, 60 + dias * 4)) },
    dinheiro: cenario === 'vazio' ? { depositos: 0, saques: 0, qtd_depositos: 0, qtd_saques: 0, depositantes: 0, sacaram: 0 }
      : { depositos: Math.round(1450 * Math.max(1, dias) * 100) / 100, saques: Math.round(60 * Math.max(1, dias) * 100) / 100,
          qtd_depositos: Math.round(18 * Math.max(1, dias)), qtd_saques: Math.round(2 * Math.max(1, dias)), depositantes: Math.round(Math.min(130, 14 * Math.max(1, dias))), sacaram: Math.round(Math.min(9, Math.max(1, dias))) },
  }
}

/** O mapa dia da semana × hora: noites e começo de semana mais fortes, madrugada fraca (só o desenho). */
function exemploDoMapa(cenario: string) {
  if (cenario === 'vazio') return { total: 0, operacoes: 0, celulas: [], dias: { 1: 5, 2: 5, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4 } }
  const celulas: Array<{ d: number; h: number; markup: number; operacoes: number }> = []
  for (let d = 1; d <= 7; d++) for (let h = 0; h < 24; h++) {
    const noite = Math.exp(-((h - 20.5) ** 2) / 8), tarde = 0.45 * Math.exp(-((h - 15) ** 2) / 6), madrugada = h < 7 ? 0.05 : 0
    const dia = [1.15, 1.25, 1.05, 1, 0.85, 0.5, 0.6][d - 1]
    const m = Math.round((noite + tarde + madrugada) * dia * 9 * (0.8 + ((d * 7 + h * 13) % 10) / 25) * 100) / 100
    if (m > 0.03) celulas.push({ d, h, markup: m, operacoes: Math.round(m * 23) })
  }
  return { total: celulas.reduce((a, c) => a + c.markup, 0), operacoes: celulas.reduce((a, c) => a + c.operacoes, 0), celulas, dias: { 1: 5, 2: 5, 3: 4, 4: 4, 5: 4, 6: 4, 7: 4 } }
}

/** As metas de exemplo (&metas=nenhuma para começar sem nenhuma): a do depósito do dia já batida, para ver o confete. */
const metasDoLab: Record<string, { deposito: number | null; markup: number | null }> =
  new URLSearchParams(location.search).get('metas') === 'nenhuma' ? {} : {
    dia: { deposito: 1200, markup: 600 }, semana: { deposito: 15000, markup: 3500 }, mes: { deposito: 60000, markup: 15000 },
  }

/** O detalhe de uma barra do mapa: monta a partir das células de exemplo, para bater com o gráfico. */
function exemploDoDetalhe(corpo: string, cenario: string) {
  const { p_de, p_ate, p_dia, p_hora } = JSON.parse(corpo || '{}') as { p_de: string; p_ate: string; p_dia: number | null; p_hora: number | null }
  const mapa = exemploDoMapa(cenario)
  const cel = mapa.celulas.filter((c) => (p_dia == null || c.d === p_dia) && (p_hora == null || c.h === p_hora))
  const markup = cel.reduce((a, c) => a + c.markup, 0), operacoes = cel.reduce((a, c) => a + c.operacoes, 0)
  const de = Date.parse(p_de), ate = Date.parse(p_ate)
  const por_data: Array<{ dia: string; markup: number; operacoes: number }> = []
  for (let t = de; t < ate; t += 86_400_000) {
    const dia = new Date(t - 3 * 3_600_000).toISOString().slice(0, 10)
    const dow = (new Date(`${dia}T12:00:00Z`).getUTCDay() + 6) % 7 + 1
    if (p_dia != null && dow !== p_dia) continue
    const base = cel.filter((c) => c.d === dow).reduce((a, c) => a + c.markup, 0) / Math.max(1, mapa.dias[dow as 1] ?? 1)
    const m = Math.round(base * (0.6 + ((t / 86_400_000) % 7) / 8) * 100) / 100
    por_data.push({ dia, markup: m, operacoes: Math.round(m * 23) })
  }
  const nomes = ['Marcos Vinícius Andrade', 'Patrícia Lemos', 'Rafael Costa', 'Juliana Prado', 'Eduardo Nunes', 'Bruna Teixeira']
  return {
    total_periodo: mapa.total, markup, operacoes, volume: operacoes * 0.85, resultado: -operacoes * 0.05, clientes: Math.max(1, Math.round(operacoes / 120)),
    ia: { markup: markup * 0.88, operacoes: Math.round(operacoes * 0.97) }, manual: { markup: markup * 0.12, operacoes: Math.round(operacoes * 0.03) },
    por_data,
    por_hora: Array.from({ length: 24 }, (_, h) => ({ h, markup: cel.filter((c) => c.h === h).reduce((a, c) => a + c.markup, 0), operacoes: cel.filter((c) => c.h === h).reduce((a, c) => a + c.operacoes, 0) })).filter((x) => x.markup > 0),
    por_dia_semana: Array.from({ length: 7 }, (_, i) => ({ d: i + 1, markup: cel.filter((c) => c.d === i + 1).reduce((a, c) => a + c.markup, 0), operacoes: cel.filter((c) => c.d === i + 1).reduce((a, c) => a + c.operacoes, 0) })).filter((x) => x.markup > 0),
    por_ia: [['GF Raptor', 0.42], ['GF Falcon', 0.27], ['GF Legacy', 0.16], ['GF Phenom', 0.02], ['GF Gulf', 0.01]].map(([nome, f], k) => ({ nome, markup: markup * (f as number), operacoes: Math.round(operacoes * (f as number)), clientes: 30 - k * 6 })),
    clientes_top: nomes.map((nome, k) => ({ user_id: `c${k}`, nome, foto_url: null, parceiro: ['n', 'v', null, 'n', 'v', 'n'][k], markup: markup * [0.18, 0.12, 0.09, 0.07, 0.05, 0.04][k], operacoes: Math.round(operacoes * [0.18, 0.12, 0.09, 0.07, 0.05, 0.04][k]), resultado: [-42.1, 18.3, -9.9, 4.2, -15, 2][k] })),
  }
}

/* &aovivo: uma operação em conta real a cada 1,5 s (US$ 0,04 de markup), para ver o markup subir a cada
   operação (markupAoVivo): as leituras grandes trazem lido_em e o que entrou até ali; teeds_markup_desde
   devolve o que entrou depois. */
const INICIO_DO_LAB = Date.now()
const OPS_ATE = (ms: number) => Math.max(0, Math.floor((ms - INICIO_DO_LAB) / 1500))
const MARKUP_POR_OP = 0.04
function comAoVivo<T extends { markup: any; lido_em?: string }>(d: T, campos: string[]): T {
  const agora = Date.now(), extra = OPS_ATE(agora) * MARKUP_POR_OP
  const markup = { ...d.markup }
  for (const c of campos) markup[c] = Number(markup[c] ?? 0) + extra
  return { ...d, markup, lido_em: new Date(agora).toISOString() }
}

export default function LabVisaoGeral() {
  const busca = new URLSearchParams(location.search)
  const cenario = busca.get('cenario') ?? ''
  const periodo = { ...PERIODO_AGORA, atalho: (busca.get('periodo') ?? 'agora') as AtalhoDoPeriodo }
  const f = window.fetch
  window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => {
    const url = String(u)
    const aoVivo = busca.has('aovivo')
    if (url.includes('teeds_painel_visao_geral')) return new Response(JSON.stringify(aoVivo ? comAoVivo(exemplo(cenario) as any, ['hoje', 'd7', 'd30', 'mes']) : exemplo(cenario)), { status: 200 })
    if (url.includes('teeds_markup_desde')) {
      const desde = Date.parse(JSON.parse(String(i?.body ?? '{}')).p_desde ?? '') || Date.now()
      const ops = aoVivo ? OPS_ATE(Date.now()) - OPS_ATE(desde) : 0
      return new Response(JSON.stringify({ markup: ops * MARKUP_POR_OP, operacoes: ops, ia_markup: ops * MARKUP_POR_OP, manual_markup: 0, ia_operacoes: ops, manual_operacoes: 0, ultima_em: ops ? new Date().toISOString() : null }), { status: 200 })
    }
    if (url.includes('teeds_metas_painel')) return new Response(JSON.stringify({ parceiro: '', metas: metasDoLab }), { status: 200 })
    if (url.includes('teeds_salvar_meta_painel')) {
      const c = JSON.parse(String(i?.body ?? '{}')) as { p_horizonte: 'dia' | 'semana' | 'mes'; p_deposito: number | null; p_markup: number | null }
      if (!c.p_deposito && !c.p_markup) delete metasDoLab[c.p_horizonte]
      else metasDoLab[c.p_horizonte] = { deposito: c.p_deposito, markup: c.p_markup }
      return new Response(JSON.stringify({ parceiro: '', metas: metasDoLab }), { status: 200 })
    }
    if (url.includes('teeds_painel_periodo')) return new Response(JSON.stringify(aoVivo ? comAoVivo(exemploDoPeriodo(String(i?.body ?? ''), cenario) as any, ['total', 'ia']) : exemploDoPeriodo(String(i?.body ?? ''), cenario)), { status: 200 })
    if (url.includes('teeds_markup_mapa_detalhe')) return new Response(JSON.stringify(exemploDoDetalhe(String(i?.body ?? ''), cenario)), { status: 200 })
    if (url.includes('teeds_markup_mapa')) return new Response(JSON.stringify(exemploDoMapa(cenario)), { status: 200 })
    return f(u, i)
  }) as typeof fetch
  return (
    <div className="app workspace-app" style={{ minHeight: '100dvh' }}>
      <main className="admin-page" style={{ padding: 24 }}>
        <VisaoGeralPainel sessao={{ token: 'lab' } as never} marca="globalfly" parceiro="" aoIr={() => undefined} periodoInicial={periodo} />
      </main>
    </div>
  )
}
