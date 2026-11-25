import './ambiente'
import { restDoBanco as rest } from './supabase'
import { todas } from './sessoes'

/*
  A ficha completa do cliente na lateral do chat do Assessor (25/11/2026, Tiago: "dados do cliente tipo data de
  cadastro, saldo na Deriv, markup gerado, resultado dele até hoje… se já comprou algum produto ou upgrade, em
  quantas lives participou, se viu todas as aulas… TIPO PAINEL DA CIA, FICHA COMPLETA").

  Só para a administração geral (a rota confere). Tudo em paralelo e com teto: a ficha abre em ~1 s.
  O tipo da conta é o VERDADEIRO (tela do ADM), não o rótulo trocado dos admins.
*/

const MARCA = 'globalfly'
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const r2 = (v: number) => Math.round(v * 100) / 100
const OFFSET = 3 * 3600_000
const diaBrt = (iso: string) => new Date(new Date(iso).getTime() - OFFSET).toISOString().slice(0, 10)

async function paginas<T>(caminho: string, teto = 10_000): Promise<T[]> {
  const saida: T[] = []
  for (let de = 0; de < teto; de += 1000) {
    const p = await rest<T[]>(caminho, { headers: { Range: `${de}-${de + 999}`, 'Range-Unit': 'items' } }).catch(() => [] as T[])
    saida.push(...p)
    if (p.length < 1000) break
  }
  return saida
}

export interface FichaCompleta {
  pessoa: {
    userId: string; nome: string | null; email: string | null; telefone: string | null; cidade: string | null; uf: string | null
    nascimento: string | null; fotoPlataforma: string | null; parceiro: string | null; parceiroNome: string | null
    criadoEm: string | null; vistoEm: string | null; online: boolean; status: string | null; validade: string | null
    subplano: string; whatsappConfirmadoEm: string | null
  }
  dinheiro: {
    saldoReal: number | null; saldoDemo: number | null; contaReal: string | null; contaDemo: string | null; saldoLidoEm: string | null
    depositos: number; saques: number; qtdDepositos: number; qtdSaques: number; ultimoDeposito: string | null
    markupReal: number; markupMes: number
  }
  resultado: {
    real: { total: number; ia: number; manual: number; operacoes: number; ganhas: number; perdidas: number; sessoes: number }
    demo: { total: number; ia: number; manual: number; operacoes: number; ganhas: number; perdidas: number; sessoes: number }
    porIa: Array<{ nome: string; real: number; demo: number; sessoes: number }>
    dias30: Array<{ dia: string; real: number; demo: number }>
    primeiraOperacao: string | null; ultimaOperacao: string | null
  }
  agora: Array<{ ia: string; demo: boolean; resultado: number; operacoes: number; desde: string }>
  aulas: { total: number; vistas: number; concluidas: number; minutos: number; ultima: string | null; ultimaTitulo: string | null; faltam: string[] }
  lives: { plataforma: number; plataformaTotal: number; minutos: number; externasOnline: number; externasTotal: number; ultima: string | null }
  acessos: { total: number; diasAtivos: number; horas: number; dispositivo: string | null; ultimos7: number }
  compras: Array<{ quando: string; produto: string; valor: number | null; origem: string; situacao: string }>
  produtos: Array<{ nome: string; desde: string | null; ate: string | null; ativo: boolean; origem: string | null }>
  faturas: Array<{ mes: string; valor: number; situacao: string }>
  suporte: { conversas: number; abertas: number; ultima: string | null }
  assessor: { mensagens: number; desde: string | null; iasLigadas: number }
  linhaDoTempo: Array<{ quando: string; tipo: string; texto: string }>
}

/** A ficha de quem confirmou este número (ou null se o número não é de ninguém). */
export async function fichaCompleta(userId: string, numero: string): Promise<FichaCompleta | null> {
  const u = encodeURIComponent(userId)
  const base = `user_id=eq.${u}&marca=eq.${MARCA}`
  const agora = Date.now()
  const d30 = new Date(agora - 30 * 86_400_000).toISOString()
  const inicioMes = (() => { const b = new Date(agora - OFFSET); return new Date(Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), 1) + OFFSET).toISOString() })()

  const [fichas, contas, vinc, sessoes, manuais, robosMarkup, movs, aulasProg, grade, transm, livesHist, visitas, dias, compras, produtos, catalogo, faturas, suporte, msgs] = await Promise.all([
    rest<any[]>(`/clientes?${base}&select=nome,email,telefone,cidade,end_uf,data_nascimento,foto_url,parceiro,criado_em,visto_em,status_acesso,acesso_expira_em,categoria,total_acessos,tempo_total_segundos&limit=1`).catch(() => []),
    rest<any[]>(`/contas_deriv?${base}&select=conta_id,tipo,saldo,vista_em`).catch(() => []),
    rest<any[]>(`/assessor_whatsapp_vinculos?${base}&select=confirmado_em&limit=1`).catch(() => []),
    paginas<any>(`/sessoes_robos?${base}&select=robo_nome,demo,resultado,operacoes,ganhas,perdidas,criada_em,origem&order=criada_em.asc`),
    paginas<any>(`/operacoes_manuais?${base}&situacao=neq.aberta&select=demo,resultado,markup,comprada_em&order=comprada_em.asc`),
    paginas<any>(`/operacoes_robos?${base}&demo=eq.false&select=markup,executada_em`, 30_000),
    paginas<any>(`/movimentacoes_deriv?${base}&demo=eq.false&tipo=in.(deposit,withdrawal)&select=tipo,valor,ocorrida_em&order=ocorrida_em.desc`),
    rest<any[]>(`/aulas_progresso?${base}&select=aula_id,concluida,segundos,ultima_vez`).catch(() => []),
    rest<any[]>(`/aulas_grade?marca=eq.${MARCA}&select=publicada&limit=1`).catch(() => []),
    rest<any[]>(`/transmissoes?marca=eq.${MARCA}&teste=not.is.true&encerrada_em=not.is.null&select=iniciada_em,presencas&order=iniciada_em.desc&limit=200`).catch(() => []),
    rest<any[]>(`/lives_historico?marca=eq.${MARCA}&select=inicio,fim&order=inicio.desc&limit=200`).catch(() => []),
    paginas<any>(`/acessos_visitas?${base}&select=inicio,visto_em,dispositivo&order=inicio.desc`, 5000),
    rest<any[]>(`/acessos_diarios?${base}&select=dia,acessos,segundos,dispositivo&order=dia.desc&limit=400`).catch(() => []),
    rest<any[]>(`/compras_cakto?marca=eq.${MARCA}&user_id=eq.${u}&select=pedido,evento,produto,valor,acao,recebido_em&order=recebido_em.desc&limit=50`).catch(() => []),
    rest<any[]>(`/cliente_produtos?${base}&select=produto_id,concedido_em,expira_em,origem,ativo&order=concedido_em.desc`).catch(() => []),
    rest<any[]>(`/produtos?select=id,nome`).catch(() => []),
    rest<any[]>(`/compartilhamento_faturas?${base}&select=mes,valor_brl,valor_usd,situacao&order=mes.desc&limit=12`).catch(() => []),
    rest<any[]>(`/suporte_conversas?${base}&select=status,criada_em,atualizada_em&order=criada_em.desc&limit=100`).catch(() => []),
    rest<any[]>(`/assessor_whatsapp_mensagens?marca=eq.${MARCA}&numero=eq.${numero}&select=papel,texto,criado_em&order=criado_em.asc&limit=2000`).catch(() => []),
  ])
  const f = fichas[0]
  if (!f) return null
  const parceiroNome = f.parceiro ? await rest<any[]>(`/parceiros?marca=eq.${MARCA}&codigo=eq.${encodeURIComponent(f.parceiro)}&select=nome&limit=1`).then((l) => l[0]?.nome ?? null).catch(() => null) : null

  // ---- dinheiro
  const real = contas.find((c) => c.tipo === 'real'); const demo = contas.find((c) => c.tipo !== 'real')
  const dep = movs.filter((m) => m.tipo === 'deposit'); const saq = movs.filter((m) => m.tipo === 'withdrawal')
  const soma = (l: any[], k = 'valor') => r2(l.reduce((t, x) => t + Math.abs(n(x[k])), 0))
  const markupReal = r2(robosMarkup.reduce((t, x) => t + n(x.markup), 0) + manuais.filter((m) => !m.demo).reduce((t, x) => t + n(x.markup), 0))
  const markupMes = r2(robosMarkup.filter((x) => x.executada_em >= inicioMes).reduce((t, x) => t + n(x.markup), 0) + manuais.filter((m) => !m.demo && m.comprada_em >= inicioMes).reduce((t, x) => t + n(x.markup), 0))

  // ---- resultado
  const lado = (ehDemo: boolean) => {
    const s = sessoes.filter((x) => !!x.demo === ehDemo); const m = manuais.filter((x) => !!x.demo === ehDemo)
    const ia = r2(s.reduce((t, x) => t + n(x.resultado), 0)); const man = r2(m.reduce((t, x) => t + n(x.resultado), 0))
    return {
      total: r2(ia + man), ia, manual: man, sessoes: s.length,
      operacoes: s.reduce((t, x) => t + n(x.operacoes), 0) + m.length,
      ganhas: s.reduce((t, x) => t + n(x.ganhas), 0) + m.filter((x) => n(x.resultado) > 0).length,
      perdidas: s.reduce((t, x) => t + n(x.perdidas), 0) + m.filter((x) => n(x.resultado) < 0).length,
    }
  }
  const porIaMap = new Map<string, { real: number; demo: number; sessoes: number }>()
  for (const s of sessoes) { const i = porIaMap.get(s.robo_nome) ?? { real: 0, demo: 0, sessoes: 0 }; if (s.demo) i.demo += n(s.resultado); else i.real += n(s.resultado); i.sessoes++; porIaMap.set(s.robo_nome, i) }
  const dias30Map = new Map<string, { real: number; demo: number }>()
  for (let i = 29; i >= 0; i--) dias30Map.set(diaBrt(new Date(agora - i * 86_400_000).toISOString()), { real: 0, demo: 0 })
  for (const s of sessoes.filter((x) => x.criada_em >= d30)) { const d = dias30Map.get(diaBrt(s.criada_em)); if (d) { if (s.demo) d.demo += n(s.resultado); else d.real += n(s.resultado) } }
  for (const m of manuais.filter((x) => x.comprada_em >= d30)) { const d = dias30Map.get(diaBrt(m.comprada_em)); if (d) { if (m.demo) d.demo += n(m.resultado); else d.real += n(m.resultado) } }
  const datasOp = [...sessoes.map((x) => x.criada_em), ...manuais.map((x) => x.comprada_em)].filter(Boolean).sort()

  // ---- aulas (a grade publicada: módulos › assuntos › aulas)
  const titulos = new Map<string, string>()
  for (const m of grade[0]?.publicada?.modulos ?? []) for (const a of m?.assuntos ?? []) for (const x of a?.aulas ?? []) if (x?.id) titulos.set(String(x.id), String(x.titulo ?? x.id))
  const vistas = aulasProg.filter((a) => titulos.has(a.aula_id))
  const ultimaAula = [...aulasProg].sort((a, b) => String(b.ultima_vez ?? '').localeCompare(String(a.ultima_vez ?? '')))[0]

  // ---- lives: as da plataforma têm presença por pessoa; as de fora (Meet, YouTube) contam se estava online na hora
  const nasLives = transm.filter((t) => Array.isArray(t.presencas) && t.presencas.some((p: any) => p?.id === userId))
  const minutosLive = Math.round(nasLives.reduce((t, x) => t + n(x.presencas.find((p: any) => p?.id === userId)?.segundos), 0) / 60)
  const online = (ini: number, fim: number) => visitas.some((v) => new Date(v.inicio).getTime() <= fim && new Date(v.visto_em ?? v.inicio).getTime() >= ini)
  const externas = livesHist.filter((l) => l.inicio && online(new Date(l.inicio).getTime(), new Date(l.fim ?? l.inicio).getTime() + 60_000))
  const ultimaLive = [nasLives[0]?.iniciada_em, externas[0]?.inicio].filter(Boolean).sort().pop() ?? null

  // ---- compras e produtos
  const nomeProduto = new Map(catalogo.map((p) => [String(p.id), String(p.nome)]))
  const comprasL = compras.map((c) => ({
    quando: c.recebido_em, produto: nomeProduto.get(String(c.produto)) ?? String(c.produto ?? 'Produto'), valor: c.valor === null || c.valor === undefined ? null : n(c.valor),
    origem: 'Cakto', situacao: String(c.acao ?? c.evento ?? ''),
  }))
  const produtosL = produtos.map((p) => ({ nome: nomeProduto.get(String(p.produto_id)) ?? String(p.produto_id), desde: p.concedido_em, ate: p.expira_em, ativo: !!p.ativo && (!p.expira_em || new Date(p.expira_em).getTime() > agora), origem: p.origem ?? null }))

  // ---- acessos
  const ult7 = new Date(agora - 7 * 86_400_000).toISOString().slice(0, 10)
  const disp = new Map<string, number>(); for (const d of dias) disp.set(d.dispositivo ?? '?', (disp.get(d.dispositivo ?? '?') ?? 0) + n(d.acessos))
  const dispositivo = [...disp.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  // ---- linha do tempo
  const t: FichaCompleta['linhaDoTempo'] = []
  if (f.criado_em) t.push({ quando: f.criado_em, tipo: 'cadastro', texto: 'Criou a conta na GlobalFly' })
  if (datasOp[0]) t.push({ quando: datasOp[0], tipo: 'operacao', texto: 'Primeira operação' })
  if (dep.length) t.push({ quando: dep[dep.length - 1].ocorrida_em, tipo: 'deposito', texto: `Primeiro depósito · US$ ${Math.abs(n(dep[dep.length - 1].valor)).toFixed(2).replace('.', ',')}` })
  for (const c of comprasL.slice(0, 6)) t.push({ quando: c.quando, tipo: 'compra', texto: `${c.produto}${c.valor ? ` · R$ ${c.valor.toFixed(2).replace('.', ',')}` : ''}${c.situacao ? ` · ${c.situacao}` : ''}` })
  for (const l of nasLives.slice(0, 4)) t.push({ quando: l.iniciada_em, tipo: 'live', texto: 'Assistiu uma live na plataforma' })
  if (vinc[0]?.confirmado_em) t.push({ quando: vinc[0].confirmado_em, tipo: 'whatsapp', texto: 'Confirmou o WhatsApp do Assessor' })
  for (const a of aulasProg.filter((x) => x.concluida).sort((a, b) => String(b.ultima_vez).localeCompare(String(a.ultima_vez))).slice(0, 3)) t.push({ quando: a.ultima_vez, tipo: 'aula', texto: `Concluiu "${titulos.get(a.aula_id) ?? a.aula_id}"` })
  if (saq.length) t.push({ quando: saq[0].ocorrida_em, tipo: 'saque', texto: `Último saque · US$ ${Math.abs(n(saq[0].valor)).toFixed(2).replace('.', ',')}` })
  if (f.visto_em) t.push({ quando: f.visto_em, tipo: 'acesso', texto: 'Último acesso na plataforma' })
  t.sort((a, b) => String(b.quando).localeCompare(String(a.quando)))

  const msgsCli = msgs.filter((m) => m.papel === 'cliente')
  return {
    pessoa: {
      userId, nome: f.nome ?? null, email: f.email ? String(f.email).replace(/\+marca-[a-z0-9-]+@/i, '@') : null, telefone: f.telefone ?? null,
      cidade: f.cidade ?? null, uf: f.end_uf ?? null, nascimento: f.data_nascimento ?? null, fotoPlataforma: f.foto_url ?? null,
      parceiro: f.parceiro ?? null, parceiroNome, criadoEm: f.criado_em ?? null, vistoEm: f.visto_em ?? null,
      online: !!f.visto_em && agora - new Date(f.visto_em).getTime() < 3 * 60_000, status: f.status_acesso ?? null, validade: f.acesso_expira_em ?? null,
      subplano: String(f.categoria ?? 'gold'), whatsappConfirmadoEm: vinc[0]?.confirmado_em ?? null,
    },
    dinheiro: {
      saldoReal: real ? n(real.saldo) : null, saldoDemo: demo ? n(demo.saldo) : null, contaReal: real?.conta_id ?? null, contaDemo: demo?.conta_id ?? null,
      saldoLidoEm: real?.vista_em ?? demo?.vista_em ?? null,
      depositos: soma(dep), saques: soma(saq), qtdDepositos: dep.length, qtdSaques: saq.length, ultimoDeposito: dep[0]?.ocorrida_em ?? null,
      markupReal, markupMes,
    },
    resultado: {
      real: lado(false), demo: lado(true),
      porIa: [...porIaMap.entries()].map(([nome, v]) => ({ nome, real: r2(v.real), demo: r2(v.demo), sessoes: v.sessoes })).sort((a, b) => b.sessoes - a.sessoes),
      dias30: [...dias30Map.entries()].map(([dia, v]) => ({ dia, real: r2(v.real), demo: r2(v.demo) })),
      primeiraOperacao: datasOp[0] ?? null, ultimaOperacao: datasOp[datasOp.length - 1] ?? null,
    },
    agora: todas().filter((s) => s.parametros?.userId === userId && (s.estado?.rodando || s.estado?.emOperacao))
      .map((s) => ({ ia: s.roboNome, demo: s.demo, resultado: r2(s.estado?.resultado ?? 0), operacoes: s.estado?.operacoes ?? 0, desde: new Date(s.comecouEm).toISOString() })),
    aulas: {
      total: titulos.size, vistas: vistas.length, concluidas: vistas.filter((a) => a.concluida).length,
      minutos: Math.round(aulasProg.reduce((t2, a) => t2 + n(a.segundos), 0) / 60),
      ultima: ultimaAula?.ultima_vez ?? null, ultimaTitulo: ultimaAula ? titulos.get(ultimaAula.aula_id) ?? null : null,
      faltam: [...titulos.entries()].filter(([id]) => !aulasProg.some((a) => a.aula_id === id && a.concluida)).map(([, tt]) => tt).slice(0, 40),
    },
    lives: { plataforma: nasLives.length, plataformaTotal: transm.length, minutos: minutosLive, externasOnline: externas.length, externasTotal: livesHist.length, ultima: ultimaLive },
    acessos: {
      total: n(f.total_acessos), diasAtivos: dias.length, horas: Math.round(n(f.tempo_total_segundos) / 360) / 10, dispositivo,
      ultimos7: Math.min(7, dias.filter((d) => String(d.dia) > ult7).length),
    },
    compras: comprasL,
    produtos: produtosL,
    faturas: faturas.map((x) => ({ mes: x.mes, valor: n(x.valor_brl ?? x.valor_usd), situacao: x.situacao })),
    suporte: { conversas: suporte.length, abertas: suporte.filter((s) => s.status !== 'resolvida').length, ultima: suporte[0]?.atualizada_em ?? null },
    assessor: { mensagens: msgsCli.length, desde: msgs[0]?.criado_em ?? null, iasLigadas: sessoes.filter((s) => s.origem === 'chat').length },
    linhaDoTempo: t.slice(0, 14),
  }
}

/** Número não confirmado: quem do cadastro tem este telefone (sugestão para a equipe, nunca vira login). */
export async function talvezSeja(numero: string): Promise<Array<{ nome: string | null; email: string | null }>> {
  let d = numero.replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length < 10) return []
  const fim = d.slice(-8)
  const l = await rest<any[]>(`/clientes?marca=eq.${MARCA}&telefone=ilike.*${fim.slice(0, 4)}*${fim.slice(4)}*&select=nome,email,telefone&limit=5`).catch(() => [])
  return l.filter((x) => String(x.telefone ?? '').replace(/\D/g, '').endsWith(fim)).map((x) => ({ nome: x.nome ?? null, email: x.email ? String(x.email).replace(/\+marca-[a-z0-9-]+@/i, '@') : null }))
}
