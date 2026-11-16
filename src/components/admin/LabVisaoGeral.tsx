/** Laboratório (?tela=visao-geral(&cenario=real|vazio)(&periodo=hoje|ontem|7|30|mes|personalizado)(&metas=nenhuma)(&ia=vazia|pronta|sem-ia|erro)(&negocio=vazio)): a Visão geral com números de exemplo, sem banco. */
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

/** O Inteligência do negócio de exemplo (16/11/2026): as quatro respostas, o pódio das lives e os detalhes nas gavetas. &negocio=vazio para o período sem operação. */
function exemploDoNegocio(corpo: string) {
  const { p_de, p_ate } = JSON.parse(corpo || '{}') as { p_de: string; p_ate: string }
  if (new URLSearchParams(location.search).get('negocio') === 'vazio') {
    return { de: p_de, ate: p_ate, origens: {}, perfis: [], faixas: [], rotulos: [], dias: [], horas: [], semana: [], top: [], lives: [],
      clientes: { lucrando: { pessoas: 0, markup: 0, resultado: 0, banca: 0 }, perdendo: { pessoas: 0, markup: 0, resultado: 0, banca: 0 }, zerados: 0, sem_saldo: 0, markup_sem_saldo: 0, um_dia_so: 0, tres_dias_ou_mais: 0, markup_tres_dias: 0 },
      lives_resumo: { lives: 0, horas_live: 0, horas_fora: 0, markup_live: 0, markup_fora: 0, tipico_live: 0 } }
  }
  const ate = Date.parse(p_ate) || Date.now()
  const nDias = Math.max(2, Math.min(14, Math.round((ate - (Date.parse(p_de) || ate)) / 86_400_000)))
  const diaBR = (n: number) => new Date(ate - n * 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10)
  const dias = Array.from({ length: nDias }, (_, i) => {
    const k = nDias - 1 - i, f = 0.55 + ((i * 7) % 5) / 6
    return { dia: diaBR(k), ia: Math.round(262 * f * 100) / 100, manual: Math.round(82 * (1.5 - f / 2) * 100) / 100, ia_ops: Math.round(6500 * f), manual_ops: Math.round(360 * (1.5 - f / 2)), ia_pessoas: 60 + i * 3, manual_pessoas: 40 + i * 2 }
  })
  const horas = Array.from({ length: 24 }, (_, h) => {
    const noite = Math.exp(-((h - 21) ** 2) / 5), tarde = 0.6 * Math.exp(-((h - 15) ** 2) / 4), manha = 0.45 * Math.exp(-((h - 10) ** 2) / 3)
    return { hora: h, ia: Math.round((noite + tarde + manha + 0.04) * 520 * 100) / 100, manual: Math.round((noite * 0.9 + tarde * 1.1 + manha * 1.3 + 0.01) * 150 * 100) / 100 }
  })
  const live = (diasAtras: number, hIni: number, min: number, markup: number, tipico: number, estimada: boolean, extra: Record<string, unknown> = {}) => {
    const ini = Date.parse(`${diaBR(diasAtras)}T${String(hIni).padStart(2, '0')}:10:00-03:00`)
    return { inicio: new Date(ini).toISOString(), fim: new Date(ini + min * 60_000).toISOString(), origem: estimada ? 'estimada' : 'link', estimada, markup, markup_ia: markup * 0.62, markup_manual: markup * 0.38,
      operacoes: Math.round(markup * 22), pessoas: Math.round(20 + markup / 4), volume: markup * 21, resultado: -markup * 1.4, tipico, depositos: Math.round(markup * 2.1), entraram: Math.round(12 + markup / 5), ...extra }
  }
  const nomes = ['Marcos Vinícius Andrade', 'Patrícia Lemos', 'Rafael Costa', 'Juliana Prado', 'Eduardo Nunes', 'Bruna Teixeira', 'Thiago Moreira', 'Camila Duarte', 'Leandro Pires', 'Sabrina Rocha']
  return {
    de: p_de, ate: p_ate, lido_em: new Date().toISOString(),
    origens: {
      ia: { operacoes: 71968, pessoas: 179, markup: 2883.49, volume: 60392.14, resultado: -4021.4, ganhos: 17060.58, perdas: -21081.98, ganhas: 49615, dias: 11, banca: 6971.55, com_saldo: 157, lucrando: 22, perdendo: 157, lucro: 100.98, prejuizo: -4122.38, depositos: 16292.52, dias_media: 2.49, markup_mediano: 6.91 },
      manual: { operacoes: 3990, pessoas: 150, markup: 901.18, volume: 16847.06, resultado: -2957, ganhos: 4392.29, perdas: -7349.29, ganhas: 2237, dias: 7, banca: 6709.16, com_saldo: 132, lucrando: 20, perdendo: 129, lucro: 152.94, prejuizo: -3109.94, depositos: 14366.62, dias_media: 2.99, markup_mediano: 1.79 },
    },
    perfis: [
      { perfil: 'duas', pessoas: 137, markup: 3377.42, markup_ia: 2490.25, markup_manual: 887.18, operacoes: 65366, volume: 68924.3, resultado: -6151.37, lucrando: 9, perdendo: 127, banca: 6074.2, depositos: 13624.77, saques: 1388.15, dias_media: 3.67 },
      { perfil: 'ia', pessoas: 42, markup: 393.24, markup_ia: 393.24, markup_manual: 0, operacoes: 10436, volume: 8050.37, resultado: -712.77, lucrando: 7, perdendo: 35, banca: 897.35, depositos: 2667.75, saques: 765.54, dias_media: 2.02 },
      { perfil: 'manual', pessoas: 13, markup: 14, markup_ia: 0, markup_manual: 14, operacoes: 156, volume: 264.53, resultado: -114.26, lucrando: 3, perdendo: 10, banca: 634.96, depositos: 741.85, saques: 0, dias_media: 1.85 },
    ],
    faixas: [
      { faixa: 0, pessoas: 23, banca: 0, markup: 538.08, markup_ia: 367.3, markup_manual: 170.78, resultado: -1098.03, volume: 10653.81, operacoes: 10835 },
      { faixa: 1, pessoas: 120, banca: 1525.6, markup: 2112.76, markup_ia: 1811.87, markup_manual: 300.9, resultado: -3379.68, volume: 44440.07, operacoes: 46732 },
      { faixa: 2, pessoas: 45, banca: 4451.94, markup: 735.18, markup_ia: 593.66, markup_manual: 141.52, resultado: -1176.84, volume: 14712.08, operacoes: 16393 },
      { faixa: 3, pessoas: 4, banca: 1628.97, markup: 398.64, markup_ia: 110.66, markup_manual: 287.98, resultado: -1323.85, volume: 7433.24, operacoes: 1998 },
    ],
    clientes: { lucrando: { pessoas: 19, markup: 122.09, resultado: 81.56, banca: 1043.99 }, perdendo: { pessoas: 172, markup: 3556.69, resultado: -7059.96, banca: 6562.52 },
      zerados: 1, sem_saldo: 23, markup_sem_saldo: 538.08, um_dia_so: 35, tres_dias_ou_mais: 108, markup_tres_dias: 2894.97 },
    rotulos: [
      { origem: 'ia', nome: 'GF Raptor', operacoes: 38405, pessoas: 149, markup: 1254.13, volume: 25903.61, resultado: -1795.65, ganhas: 29560 },
      { origem: 'ia', nome: 'GF Legacy', operacoes: 17777, pessoas: 145, markup: 912.12, volume: 19497.53, resultado: -1133.18, ganhas: 10656 },
      { origem: 'manual', nome: 'Sobe ou Desce', operacoes: 3780, pessoas: 150, markup: 895.92, volume: 16758.16, resultado: -2943.36, ganhas: 2121 },
      { origem: 'ia', nome: 'GF Falcon', operacoes: 15428, pessoas: 131, markup: 683.77, volume: 14609.33, resultado: -1088.31, ganhas: 9291 },
      { origem: 'ia', nome: 'GF Phenom', operacoes: 242, pessoas: 5, markup: 25.9, volume: 295.38, resultado: -23.93, ganhas: 69 },
      { origem: 'ia', nome: 'GF Gulf', operacoes: 116, pessoas: 4, markup: 7.56, volume: 86.29, resultado: 19.67, ganhas: 39 },
      { origem: 'manual', nome: 'Dígitos', operacoes: 210, pessoas: 9, markup: 5.26, volume: 88.9, resultado: -13.64, ganhas: 116 },
    ],
    dias, horas,
    semana: [1, 2, 3, 4, 5, 6, 7].map((dd) => ({ d: dd, ia: 420 - dd * 20, manual: 130 - dd * 6, vezes: 2 })),
    top: nomes.map((nome, i) => ({ user_id: `n${i}`, nome, foto_url: null, parceiro: ['n', 'v', null, 'n', 'v', 'n', null, 'v', 'n', 'v'][i], perfil: ['duas', 'duas', 'ia', 'duas', 'manual', 'duas', 'ia', 'duas', 'duas', 'ia'][i],
      markup: [412.3, 301.75, 188.4, 150.2, 131.9, 96.5, 80.1, 71.4, 60.3, 52.8][i], markup_ia: [300, 120.75, 188.4, 100.2, 0, 76.5, 80.1, 41.4, 30.3, 52.8][i], markup_manual: [112.3, 181, 0, 50, 131.9, 20, 0, 30, 30, 0][i],
      resultado: [-820.4, -410.1, 96.3, -150, -488.2, -60.5, 12.4, -95, -41.2, -33][i], saldo: [625.4, 0, 310.2, 48.9, 1210, 22.1, 75, 0, 130.4, 12][i], operacoes: [9100, 5200, 4100, 2600, 310, 2100, 1900, 1500, 1200, 1100][i], dias: [9, 7, 6, 5, 4, 5, 3, 4, 3, 2][i], depositos: [1500, 800, 300, 250, 2000, 100, 0, 150, 120, 50][i] })),
    lives: [
      live(0, 15, 62, 74.72, 5.79, false),
      live(0, 10, 73, 26.98, 8.04, true),
      live(1, 10, 154, 81.4, 20.61, true),
      live(2, 10, 96, 62.39, 11.16, true),
      live(3, 21, 69, 55.44, 13.29, true),
      live(3, 15, 104, 111.33, 9.75, true),
      live(4, 21, 103, 151.95, 20.32, true),
      live(6, 21, 221, 192.7, 25.33, true),
      live(7, 20, 166, 0, 29.25, false, { origem: 'lancamento', operacoes: 0, pessoas: 0, volume: 0, resultado: 0, depositos: 0, entraram: 155 }),
    ],
    lives_resumo: { lives: 9, horas_live: 17.5, horas_fora: 236, markup_live: 756.91, markup_fora: 2705.49, tipico_live: 143.54 },
  }
}

/** A leitura da I.A. de exemplo (&ia=vazia | pronta | sem-ia | erro): pedir leva 3 perguntas até ficar pronta. */
const LEITURA_DO_LAB = {
  resumo: 'Nos últimos 30 dias a plataforma gerou US$ 3.784,67 de markup em conta real: 76% vieram da I.A. (US$ 2.883,49) e 24% da manual (US$ 901,18). A manual faz 18 vezes menos operações, mas cada uma rende 5,6 vezes mais markup. Em live, o markup por hora foi mais de 5 vezes o do mesmo horário sem live.',
  veredito: { onde: 'as_duas', titulo: 'A I.A. dá o volume; a manual, feita em live, dá o salto', texto: 'A I.A. sustenta o dia a dia: 179 pessoas e US$ 16,11 por pessoa. A manual rende US$ 0,23 por operação contra US$ 0,04 da I.A. e quem opera dos dois jeitos volta 3,7 dias, quase o dobro de quem só usa a I.A. O melhor retorno está em levar quem só usa a I.A. para operar na manual durante as lives.' },
  recomendacoes: [
    { titulo: 'Leve quem só usa a I.A. para a manual nas lives', porque: 'Quem opera dos dois jeitos gera US$ 24,65 por pessoa; quem só usa a I.A., US$ 9,36.', como: 'Em cada live, reserve 15 minutos de operação manual guiada e chame pelo nome quem está só com a I.A. ligada.', categoria: 'manual', impacto: 'alto' },
    { titulo: 'Mantenha a live das 21h como a principal do dia', porque: 'As duas lives que mais renderam foram à noite: US$ 192,70 e US$ 151,95, cerca de 7 vezes o típico do horário.', como: 'Fixe 21h de segunda a quinta e avise às 20h30 por notificação e WhatsApp.', categoria: 'lives', impacto: 'alto' },
    { titulo: 'Divulgue a GF Raptor como a porta de entrada', porque: 'Ela gerou US$ 1.254,13 com 149 pessoas, 43% do markup da I.A.', como: 'Abra as lives com a Raptor ligada na tela e use-a nos conteúdos da semana.', categoria: 'ia', impacto: 'medio' },
    { titulo: 'Crie um horário forte à tarde', porque: 'Das 15h às 16h a manual rende quase o mesmo que à noite, e a live de sexta à tarde foi 11 vezes o típico.', como: 'Teste uma live fixa às 15h por duas semanas e compare o markup por hora.', categoria: 'horario', impacto: 'medio' },
    { titulo: 'Reative quem está sem saldo', porque: '23 pessoas zeraram a conta e, mesmo assim, geraram US$ 538,08 no período.', como: 'Mande uma mensagem individual com o convite para a próxima live e o link de depósito.', categoria: 'clientes', impacto: 'medio' },
  ],
  lives: 'As lives da noite (por volta de 21h) foram as que mais renderam, com US$ 192,70 e US$ 151,95. A de sexta à tarde rendeu US$ 111,33, 11 vezes o típico do horário. As da manhã rendem menos em valor, mas ainda de 3 a 5 vezes o normal.',
  alertas: ['O período tem só 11 dias com operação: as conclusões ainda podem mudar.', 'O horário de 7 das 9 lives é estimado pelos cliques no aviso.'],
}
let leituraDoLab: Record<string, unknown> | null = null
let perguntas = 0
function respostaDaIA(corpo: string) {
  const modo = new URLSearchParams(location.search).get('ia') ?? 'vazia'
  const { acao } = JSON.parse(corpo || '{}') as { acao: string }
  if (modo === 'sem-ia') return { status: acao === 'analisar' ? 409 : 200, corpo: acao === 'analisar' ? { semIA: true, erro: 'Falta a chave da I.A.' } : { temIA: false, analise: null } }
  const base = { id: 'lab', erro: null, criadoEm: new Date().toISOString(), prontaEm: null, quem: 'Tiago', de: '', ate: '' }
  if (acao === 'analisar') { leituraDoLab = { ...base, situacao: 'analisando', dados: null }; perguntas = 0 }
  else if (leituraDoLab?.situacao === 'analisando' && ++perguntas >= 2) {
    leituraDoLab = modo === 'erro' ? { ...base, situacao: 'erro', dados: null, erro: 'A resposta da I.A. veio cortada. Tente de novo.' } : { ...base, situacao: 'pronta', dados: LEITURA_DO_LAB, prontaEm: new Date().toISOString() }
  } else if (!leituraDoLab && modo === 'pronta') leituraDoLab = { ...base, situacao: 'pronta', dados: LEITURA_DO_LAB, prontaEm: new Date().toISOString() }
  return { status: 200, corpo: { temIA: true, analise: leituraDoLab } }
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
    if (url.includes('teeds_painel_negocio')) return new Response(JSON.stringify(exemploDoNegocio(String(i?.body ?? ''))), { status: 200 })
    if (url.includes('negocio-analise')) { const r = respostaDaIA(String(i?.body ?? '')); return new Response(JSON.stringify(r.corpo), { status: r.status }) }
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
