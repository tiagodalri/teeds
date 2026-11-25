import { restDoBanco as rest } from './supabase'

/**
 * O "cérebro" do Assistente e do Assessor (25/11/2026, Tiago: "o assessor precisa ter acesso total às infos
 * do cliente. Apenas daquele cliente: jamais pode entregar informação de adm ou de outro cliente").
 *
 * REGRA DE OURO: toda consulta daqui é presa ao `userId` de quem está conversando (vem do login ou do
 * WhatsApp confirmado, nunca da I.A.) e à marca. Nenhuma ferramenta aceita id de cliente, e-mail ou conta
 * vinda da conversa. Nada de markup, comissão, parceiro ou número da plataforma: só o que é do cliente.
 */

export type Periodo = 'hoje' | 'ontem' | '7_dias' | 'mes' | 'mes_passado' | '30_dias' | '90_dias' | 'ano' | 'tudo'
export const PERIODOS: Periodo[] = ['hoje', 'ontem', '7_dias', 'mes', 'mes_passado', '30_dias', '90_dias', 'ano', 'tudo']
export type QualConta = 'real' | 'demo' | 'todas'

/* ------------------------------------------------------------------ horário de Brasília */

const OFFSET_MS = 3 * 3600_000 // Brasília: UTC−3, sem horário de verão desde 2019
const brt = (ms: number) => new Date(ms - OFFSET_MS)
const meiaNoite = (ano: number, mes: number, dia: number) => Date.UTC(ano, mes, dia) + OFFSET_MS
const DATA = /^\d{4}-\d{2}-\d{2}$/
const ROTULO_DIA = (ms: number) => { const d = brt(ms); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}` }
export const quandoBrt = (iso: string | null | undefined) => {
  if (!iso) return null
  const d = brt(new Date(iso).getTime())
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}h${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** O intervalo [de, ate) do período, em horário de Brasília. Datas livres (AAAA-MM-DD) vencem o período. */
export function intervalo(periodo: unknown, de?: unknown, ate?: unknown, agora = Date.now()): { de: number; ate: number; rotulo: string } {
  const h = brt(agora)
  const hoje = meiaNoite(h.getUTCFullYear(), h.getUTCMonth(), h.getUTCDate())
  const dia = 86_400_000
  if (typeof de === 'string' && DATA.test(de)) {
    const [a, m, d] = de.split('-').map(Number)
    const ini = meiaNoite(a, m - 1, d)
    let fim = agora
    if (typeof ate === 'string' && DATA.test(ate)) { const [a2, m2, d2] = ate.split('-').map(Number); fim = Math.min(agora, meiaNoite(a2, m2 - 1, d2) + dia) }
    const fimSeguro = Math.max(fim, ini + 1)
    return { de: ini, ate: fimSeguro, rotulo: `de ${ROTULO_DIA(ini)} a ${ROTULO_DIA(fimSeguro - 1)}` }
  }
  switch (periodo) {
    case 'hoje': return { de: hoje, ate: agora, rotulo: `hoje (${ROTULO_DIA(hoje)})` }
    case 'ontem': return { de: hoje - dia, ate: hoje, rotulo: `ontem (${ROTULO_DIA(hoje - dia)})` }
    case '7_dias': return { de: hoje - 6 * dia, ate: agora, rotulo: 'nos últimos 7 dias' }
    case '30_dias': return { de: hoje - 29 * dia, ate: agora, rotulo: 'nos últimos 30 dias' }
    case '90_dias': return { de: hoje - 89 * dia, ate: agora, rotulo: 'nos últimos 90 dias' }
    case 'mes_passado': {
      const ini = meiaNoite(h.getUTCFullYear(), h.getUTCMonth() - 1, 1)
      return { de: ini, ate: meiaNoite(h.getUTCFullYear(), h.getUTCMonth(), 1), rotulo: `no mês passado (${MESES[brt(ini).getUTCMonth()]})` }
    }
    case 'ano': return { de: meiaNoite(h.getUTCFullYear(), 0, 1), ate: agora, rotulo: `em ${h.getUTCFullYear()}` }
    case 'tudo': return { de: Date.UTC(2026, 0, 1), ate: agora, rotulo: 'desde o começo' }
    case 'mes':
    default: return { de: meiaNoite(h.getUTCFullYear(), h.getUTCMonth(), 1), ate: agora, rotulo: `neste mês (${MESES[h.getUTCMonth()]})` }
  }
}
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const diaBrt = (iso: string) => { const d = brt(new Date(iso).getTime()); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}` }

/* ------------------------------------------------------------------ ajudantes */

const r2 = (v: number) => Math.round(v * 100) / 100
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const limiteDe = (v: unknown, padrao: number, teto: number) => Math.max(1, Math.min(teto, Math.floor(num(v) || padrao)))
const qualConta = (v: unknown): QualConta => (v === 'real' || v === 'demo' ? v : 'todas')
const filtroConta = (c: QualConta) => (c === 'real' ? '&demo=eq.false' : c === 'demo' ? '&demo=eq.true' : '')
const iso = (ms: number) => new Date(ms).toISOString()
/** O e-mail como a pessoa conhece (sem a etiqueta interna "+marca-globalfly"). */
const emailDeVerdade = (e: string) => e.replace(/\+marca-[a-z0-9-]+@/i, '@')
const nomeDaConta = (demo: boolean) => (demo ? 'demonstração' : 'real')

/** Lê tudo de uma consulta em páginas de 1000 (o PostgREST corta em 1000), até `teto`. */
async function todasAsLinhas<T>(caminho: string, teto = 20_000): Promise<T[]> {
  const saida: T[] = []
  for (let de = 0; de < teto; de += 1000) {
    const pagina = await rest<T[]>(caminho, { headers: { Range: `${de}-${de + 999}`, 'Range-Unit': 'items' } })
    saida.push(...pagina)
    if (pagina.length < 1000) break
  }
  return saida
}

/* ------------------------------------------------------------------ as ferramentas */

interface Quem { userId: string; marca: string }

/** Lucro/prejuízo do período: I.A. (pelas sessões) e manual, separados por conta real e demonstração. */
export async function meusResultados(q: Quem, args: any) {
  const p = intervalo(args?.periodo, args?.de, args?.ate)
  const conta = qualConta(args?.conta)
  const base = `user_id=eq.${encodeURIComponent(q.userId)}&marca=eq.${encodeURIComponent(q.marca)}${filtroConta(conta)}`
  const [sessoes, manuais] = await Promise.all([
    todasAsLinhas<{ robo_nome: string; demo: boolean; moeda: string; resultado: number; operacoes: number; ganhas: number; perdidas: number; criada_em: string; situacao: string }>(
      `/sessoes_robos?${base}&criada_em=gte.${iso(p.de)}&criada_em=lt.${iso(p.ate)}&select=robo_nome,demo,moeda,resultado,operacoes,ganhas,perdidas,criada_em,situacao&order=criada_em.asc`),
    todasAsLinhas<{ demo: boolean; moeda: string; resultado: number; situacao: string; comprada_em: string }>(
      `/operacoes_manuais?${base}&comprada_em=gte.${iso(p.de)}&comprada_em=lt.${iso(p.ate)}&situacao=neq.aberta&select=demo,moeda,resultado,situacao,comprada_em&order=comprada_em.asc`),
  ])
  const resumo = (demo: boolean) => {
    const s = sessoes.filter((x) => x.demo === demo)
    const m = manuais.filter((x) => x.demo === demo)
    if (!s.length && !m.length) return null
    const porIa = new Map<string, { total: number; sessoes: number }>()
    const porDia = new Map<string, number>()
    for (const x of s) {
      const i = porIa.get(x.robo_nome) ?? { total: 0, sessoes: 0 }; i.total += num(x.resultado); i.sessoes++; porIa.set(x.robo_nome, i)
      porDia.set(diaBrt(x.criada_em), (porDia.get(diaBrt(x.criada_em)) ?? 0) + num(x.resultado))
    }
    for (const x of m) porDia.set(diaBrt(x.comprada_em), (porDia.get(diaBrt(x.comprada_em)) ?? 0) + num(x.resultado))
    const dias = [...porDia.entries()].map(([d, v]) => ({ dia: d, resultado: r2(v) }))
    const ordem = [...dias].sort((a, b) => b.resultado - a.resultado)
    const totalIa = s.reduce((t, x) => t + num(x.resultado), 0)
    const totalManual = m.reduce((t, x) => t + num(x.resultado), 0)
    return {
      conta: nomeDaConta(demo),
      moeda: s[0]?.moeda ?? m[0]?.moeda ?? 'USD',
      resultado_total: r2(totalIa + totalManual),
      ia: s.length ? {
        resultado: r2(totalIa), sessoes: s.length,
        operacoes: s.reduce((t, x) => t + num(x.operacoes), 0), ganhas: s.reduce((t, x) => t + num(x.ganhas), 0), perdidas: s.reduce((t, x) => t + num(x.perdidas), 0),
        por_ia: [...porIa.entries()].map(([nome, v]) => ({ nome, resultado: r2(v.total), sessoes: v.sessoes })).sort((a, b) => b.resultado - a.resultado),
        rodando_agora: s.filter((x) => x.situacao === 'rodando').length,
      } : null,
      manual: m.length ? {
        resultado: r2(totalManual), operacoes: m.length,
        ganhas: m.filter((x) => num(x.resultado) > 0).length, perdidas: m.filter((x) => num(x.resultado) < 0).length,
      } : null,
      dias_com_operacao: dias.length, dias_positivos: dias.filter((d) => d.resultado > 0).length, dias_negativos: dias.filter((d) => d.resultado < 0).length,
      melhor_dia: ordem[0] ?? null, pior_dia: ordem.length > 1 ? ordem[ordem.length - 1] : null,
    }
  }
  const contas = (conta === 'demo' ? [true] : conta === 'real' ? [false] : [false, true]).map(resumo).filter(Boolean)
  return {
    periodo: p.rotulo,
    contas,
    observacao: contas.length ? 'Conta só o que foi operado pela plataforma (I.A. e manual), não o que foi feito direto na Deriv.' : `Nenhuma operação ${p.rotulo}.`,
  }
}

/** As sessões de I.A. do período, mais novas primeiro. */
export async function historicoDeSessoes(q: Quem, args: any) {
  const p = intervalo(args?.periodo ?? '7_dias', args?.de, args?.ate)
  const conta = qualConta(args?.conta)
  const lim = limiteDe(args?.limite, 10, 30)
  const l = await rest<any[]>(`/sessoes_robos?user_id=eq.${encodeURIComponent(q.userId)}&marca=eq.${encodeURIComponent(q.marca)}${filtroConta(conta)}` +
    `&criada_em=gte.${iso(p.de)}&criada_em=lt.${iso(p.ate)}&select=robo_nome,conta_id,demo,moeda,entrada_inicial,stop_loss,take_profit,situacao,operacoes,ganhas,perdidas,resultado,motivo_da_parada,criada_em,encerrada_em&order=criada_em.desc&limit=${lim}`)
  return {
    periodo: p.rotulo,
    sessoes: l.map((s) => ({
      ia: s.robo_nome, conta: `${nomeDaConta(s.demo)} ${s.conta_id}`, inicio: quandoBrt(s.criada_em), fim: quandoBrt(s.encerrada_em),
      situacao: s.situacao === 'rodando' ? 'operando agora' : s.situacao === 'erro' ? 'parou com erro' : 'encerrada',
      entrada: num(s.entrada_inicial), meta: num(s.take_profit), limite_de_perda: num(s.stop_loss),
      operacoes: num(s.operacoes), ganhas: num(s.ganhas), perdidas: num(s.perdidas), resultado: r2(num(s.resultado)), moeda: s.moeda,
      motivo: s.motivo_da_parada ? String(s.motivo_da_parada).replace(/\s*—\s*\[[^\]]+\].*$/, '') : null,
    })),
    observacao: l.length ? (l.length === lim ? `Mostrando as ${lim} mais novas.` : undefined) : `Nenhuma sessão de I.A. ${p.rotulo}.`,
  }
}

/** As operações uma a uma (I.A. e/ou manual), mais novas primeiro. */
export async function minhasOperacoes(q: Quem, args: any) {
  const p = intervalo(args?.periodo ?? 'hoje', args?.de, args?.ate)
  const conta = qualConta(args?.conta)
  const lim = limiteDe(args?.limite, 10, 30)
  const origem = args?.origem === 'ia' || args?.origem === 'manual' ? args.origem : 'todas'
  const so = args?.resultado === 'ganhas' ? '&resultado=gt.0' : args?.resultado === 'perdidas' ? '&resultado=lt.0' : ''
  const base = `user_id=eq.${encodeURIComponent(q.userId)}&marca=eq.${encodeURIComponent(q.marca)}${filtroConta(conta)}${so}`
  const [ia, manual] = await Promise.all([
    origem === 'manual' ? [] : rest<any[]>(`/operacoes_robos?${base}&executada_em=gte.${iso(p.de)}&executada_em=lt.${iso(p.ate)}&select=robo_nome,conta_id,demo,ativo,tipo_contrato,moeda,entrada,resultado,executada_em&order=executada_em.desc&limit=${lim}`),
    origem === 'ia' ? [] : rest<any[]>(`/operacoes_manuais?${base}&comprada_em=gte.${iso(p.de)}&comprada_em=lt.${iso(p.ate)}&select=conta_id,demo,ativo,tipo_contrato,moeda,entrada,resultado,situacao,comprada_em&order=comprada_em.desc&limit=${lim}`),
  ])
  const todas = [
    ...ia.map((o) => ({ quando_ms: new Date(o.executada_em).getTime(), quando: quandoBrt(o.executada_em), origem: `I.A. ${o.robo_nome}`, conta: `${nomeDaConta(o.demo)} ${o.conta_id}`, ativo: o.ativo, tipo: o.tipo_contrato, entrada: num(o.entrada), resultado: r2(num(o.resultado)), moeda: o.moeda })),
    ...manual.map((o) => ({ quando_ms: new Date(o.comprada_em).getTime(), quando: quandoBrt(o.comprada_em), origem: 'manual', conta: `${nomeDaConta(o.demo)} ${o.conta_id}`, ativo: o.ativo, tipo: o.tipo_contrato, entrada: num(o.entrada), resultado: o.situacao === 'aberta' ? null : r2(num(o.resultado)), situacao: o.situacao === 'aberta' ? 'aberta' : undefined, moeda: o.moeda })),
  ].sort((a, b) => b.quando_ms - a.quando_ms).slice(0, lim).map(({ quando_ms: _q, ...o }) => o)
  return { periodo: p.rotulo, operacoes: todas, observacao: todas.length ? undefined : `Nenhuma operação ${p.rotulo}.` }
}

/** Depósitos e saques da conta real (do extrato da Deriv, lido pela plataforma a cada ~10 min). */
export async function depositosESaques(q: Quem, args: any) {
  const p = intervalo(args?.periodo ?? '30_dias', args?.de, args?.ate)
  const l = await todasAsLinhas<{ tipo: string; valor: number; moeda: string; conta_id: string; ocorrida_em: string; demo: boolean }>(
    `/movimentacoes_deriv?user_id=eq.${encodeURIComponent(q.userId)}&marca=eq.${encodeURIComponent(q.marca)}&demo=eq.false&tipo=in.(deposit,withdrawal)` +
    `&ocorrida_em=gte.${iso(p.de)}&ocorrida_em=lt.${iso(p.ate)}&select=tipo,valor,moeda,conta_id,ocorrida_em,demo&order=ocorrida_em.desc`, 5000)
  const dep = l.filter((x) => x.tipo === 'deposit'); const saq = l.filter((x) => x.tipo === 'withdrawal')
  const soma = (a: typeof l) => r2(a.reduce((t, x) => t + Math.abs(num(x.valor)), 0))
  return {
    periodo: p.rotulo,
    depositos: { total: soma(dep), quantidade: dep.length },
    saques: { total: soma(saq), quantidade: saq.length },
    liquido: r2(soma(dep) - soma(saq)),
    moeda: l[0]?.moeda ?? 'USD',
    ultimos: l.slice(0, limiteDe(args?.limite, 10, 30)).map((x) => ({ quando: quandoBrt(x.ocorrida_em), tipo: x.tipo === 'deposit' ? 'depósito' : 'saque', valor: r2(Math.abs(num(x.valor))), conta: x.conta_id })),
    observacao: 'Vem do extrato da conta real na Deriv (atualiza a cada ~10 minutos). Transferência da Carteira (Wallet) para a conta Options conta como depósito; dinheiro parado na Wallet não aparece.' +
      (l.length ? '' : ` Nenhum depósito ou saque ${p.rotulo}.`),
  }
}

/** O cadastro, o plano, as contas, a confirmação do WhatsApp, as aulas e as faturas do compartilhamento. */
export async function meuCadastro(q: Quem) {
  const u = encodeURIComponent(q.userId); const m = encodeURIComponent(q.marca)
  const [fichas, contas, assessor, aulas, faturas] = await Promise.all([
    rest<any[]>(`/clientes?user_id=eq.${u}&marca=eq.${m}&select=nome,email,telefone,criado_em,plano_id,status_acesso,acesso_expira_em,categoria,data_nascimento,cidade&limit=1`),
    rest<any[]>(`/contas_deriv?user_id=eq.${u}&marca=eq.${m}&select=conta_id,tipo,moeda,saldo,vista_em&order=tipo.asc`),
    rest<any[]>(`/assessor_whatsapp_vinculos?user_id=eq.${u}&marca=eq.${m}&select=confirmado_em&limit=1`).catch(() => []),
    rest<any[]>(`/aulas_progresso?user_id=eq.${u}&marca=eq.${m}&select=concluida,ultima_vez`).catch(() => []),
    rest<any[]>(`/compartilhamento_faturas?user_id=eq.${u}&marca=eq.${m}&visivel_cliente=eq.true&select=numero,mes,lucro_usd,percentual,valor_usd,valor_brl,vencimento,situacao,paga_em,link_pagamento&order=mes.desc&limit=6`).catch(() => []),
  ])
  const f = fichas[0]
  if (!f) return { observacao: 'Não encontrei a ficha de cadastro deste login nesta plataforma.' }
  const sub = f.categoria ? await rest<any[]>(`/subplanos?marca=eq.${m}&id=eq.${encodeURIComponent(f.categoria)}&select=nome,compartilhamento,ias,simulador_horas,sala_extra,assessor,lab&limit=1`).then((l) => l[0]).catch(() => null) : null
  return {
    nome: f.nome, email: f.email ? emailDeVerdade(String(f.email)) : null, telefone: f.telefone, cliente_desde: f.criado_em ? ROTULO_DIA(new Date(f.criado_em).getTime()) : null,
    plano: sub ? {
      nome: `GF Member ${sub.nome}`,
      compartilhamento_do_lucro: `${r2(num(sub.compartilhamento) * 100)}% do lucro do mês na conta real`,
      ias_liberadas: Array.isArray(sub.ias) ? sub.ias : 'todas',
      simulador_por_dia: sub.simulador_horas === null ? 'sem limite' : `${num(sub.simulador_horas)} h`,
      sala_extra: !!sub.sala_extra, assessor_no_whatsapp: !!sub.assessor, laboratorio: !!sub.lab,
    } : { id: f.plano_id },
    acesso: f.status_acesso, acesso_valido_ate: f.acesso_expira_em ? ROTULO_DIA(new Date(f.acesso_expira_em).getTime()) : 'sem data de término',
    contas_deriv: contas.map((c) => ({ conta: c.conta_id, tipo: c.tipo === 'real' ? 'real' : 'demonstração', moeda: c.moeda, saldo_guardado: r2(num(c.saldo)), lido_em: quandoBrt(c.vista_em) })),
    whatsapp_do_assessor: assessor[0]?.confirmado_em ? 'confirmado' : 'não confirmado',
    aulas: { assistidas: aulas.length, concluidas: aulas.filter((a) => a.concluida).length, ultima: quandoBrt(aulas.map((a) => a.ultima_vez).sort().pop()) },
    faturas_do_compartilhamento: faturas.map((x) => ({ numero: x.numero, mes: x.mes, lucro_usd: num(x.lucro_usd), percentual: num(x.percentual), valor_usd: num(x.valor_usd), valor_brl: num(x.valor_brl), vencimento: x.vencimento, situacao: x.situacao, paga_em: quandoBrt(x.paga_em), link_pagamento: x.link_pagamento ?? undefined })),
    observacao: 'Para o saldo de agora, use minhas_contas (lê ao vivo na Deriv).',
  }
}

/** Abre um atendimento com a equipe, em nome da própria pessoa (aparece em Suporte, no painel da equipe). */
export async function falarComAEquipe(q: Quem, args: any, origem: string) {
  const texto = String(args?.mensagem ?? '').trim().slice(0, 2000)
  if (texto.length < 5) return { recusado: true, motivo: 'Peça ao cliente para contar, numa frase, o que precisa.' }
  const u = encodeURIComponent(q.userId)
  // uma conversa ainda aberta com a equipe recebe a mensagem nova (sem abrir um atendimento por mensagem)
  const abertas = await rest<any[]>(`/suporte_conversas?user_id=eq.${u}&marca=eq.${encodeURIComponent(q.marca)}&status=in.(aberta,respondida)&order=atualizada_em.desc&limit=1&select=id`)
  let id = abertas[0]?.id as string | undefined
  if (!id) {
    const [c] = await rest<any[]>('/suporte_conversas', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: q.userId, marca: q.marca, origem, assunto: texto.slice(0, 90), contexto: { canal: origem } }),
    })
    id = c?.id
  }
  if (!id) throw new Error('não consegui abrir o atendimento')
  await rest('/suporte_mensagens', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ conversa_id: id, autor: 'cliente', autor_id: q.userId, texto: `${texto}\n\n(enviado pelo ${origem === 'assessor-whatsapp' ? 'WhatsApp do Assessor' : 'Assistente'})` }) })
  return { enviado: true, protocolo: String(id).slice(0, 8).toUpperCase(), observacao: 'A equipe responde dentro da plataforma, em Suporte (o cliente é avisado lá).' }
}

/* ------------------------------------------------------------------ a ajuda (dúvidas de uso) */

/**
 * O que o Assistente sabe responder sem inventar. Só regra confirmada da plataforma; o que não estiver
 * aqui, a I.A. diz que não sabe e oferece falar com a equipe.
 */
const AJUDA_GF = `
DEPOSITAR: o dinheiro fica na sua conta da Deriv (corretora), nunca na GlobalFly. Na plataforma, toque em "Depositar" (Início ou Carteira): abre a página de depósito da Deriv. Se o dinheiro caiu na Carteira (Wallet) da Deriv, é preciso transferir para a conta Options, que é a que opera.
SACAR: o saque é feito na Deriv, na área de Caixa/Saque da sua conta. A GlobalFly não segura nem movimenta o seu dinheiro.
CONECTAR A CONTA DERIV: Início › Conectar (ou Carteira). Entre com o seu login da Deriv e autorize. Cada conta da Deriv tem um dono só na plataforma.
CONTA REAL x DEMONSTRAÇÃO: a demo usa dinheiro de treino (o simulador); a real usa o seu dinheiro. Dá para trocar a conta no topo da tela.
LIGAR UMA I.A.: escolha a I.A., defina entrada (valor de cada operação), meta (para ao ganhar esse valor) e limite de perda (para ao perder esse valor) e ligue. Ela para sozinha na meta ou no limite. Por aqui também dá: "liga a Raptor na demo com entrada 1, meta 5 e limite 10".
I.A. RECOMENDADA: o cartão da Início mostra, a cada meia hora, a I.A. cuja estratégia ficou mais alinhada com o mercado na última leitura. Não é promessa de resultado.
OPERAR NO MANUAL: aba Manual, escolha o contrato e o valor e confirme. O resultado sai quando o contrato termina.
RELATÓRIOS: Ferramentas › Relatórios mostra resultados por período, filtros e a planilha.
PLANOS (GF Member): Gold, Black e Prestige. O que cada um libera e o compartilhamento vêm de meu_cadastro (dados do banco); upgrade em Marketplace ou no selo do plano, no topo.
COMPARTILHAMENTO DE RECEITA: a plataforma cobra só uma parte do lucro do mês na conta real (a % depende do plano). Mês sem lucro, não paga nada. As faturas aparecem em meu_cadastro quando liberadas.
CONTA TRAVADA (Gold sem saldo real): para usar, deposite qualquer valor na conta real ou faça upgrade para Black/Prestige.
SIMULADOR: o tempo diário de demo depende do plano (ver meu_cadastro). Conta real não tem limite de tempo.
AULAS: menu Aulas. O progresso fica salvo.
WHATSAPP DO ASSESSOR: o número confirmado em Meu perfil é o login aqui no WhatsApp. Trocou o telefone, confirma de novo.
SENHA E E-MAIL: Meu perfil › E-mail de acesso / Senha. Esqueceu a senha: "Esqueci minha senha" na entrada.
NOTIFICAÇÕES E FACE ID: Meu perfil, nos botões de ativar.
SUPORTE: Ajuda › Suporte na plataforma, ou peça aqui para falar com a equipe.
`.trim()

export function ajudaDaPlataforma(marca: string) {
  return {
    ajuda: AJUDA_GF.replace(/GlobalFly/g, marca === 'globalfly' ? 'GlobalFly' : 'plataforma'),
    observacao: 'Responda só com o que está aqui. Se a dúvida não estiver coberta, diga que vai passar para a equipe e use falar_com_a_equipe se o cliente quiser.',
  }
}
