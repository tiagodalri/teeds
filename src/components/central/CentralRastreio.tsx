/**
 * Administração › Central de rastreio (04/11/2026). Tiago: "uma central de inteligência que
 * rastreia tudo, cada passo, cada evento, cada clique, jornada detalhada, tipo BBB... preciso
 * saber a origem pra metrificar (mandei link no canal do Telegram, postei nos stories)" e
 * "métricas dos criativos: qual performa melhor, quantos % assistiram de cada um, divididos por
 * faixas, uma inteligência sobre isso para me apoiar nas decisões".
 *
 * Abas: Origens (cada canal e cada link marcado, do primeiro clique até a live), Criativos (a
 * retenção dos vídeos por faixa, da Meta, ao lado dos cadastros reais do nosso banco), Ao vivo
 * (cada passo de cada pessoa, na hora), Pessoas (a ficha e a jornada de cada uma) e Links (os
 * links marcados para Telegram, stories, WhatsApp...). Dados: teeds_central_* (banco) e a
 * função meta-ads (a mesma da aba Anúncios).
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { API_DO_BANCO, CONTAS_DE_ANUNCIO, type Anuncio, type ApiAnuncios, type Metricas, type PainelDaMeta } from '../../core/teeds/anuncios'
import {
  API_DA_CENTRAL, CANAIS_DE_LINK, codigoDoNome, enderecoDoLink, nomeDoCanal,
  type ApiCentral, type EventoAoVivo, type FichaDaPessoa, type LinhaDoResumo, type LinkDeRastreio, type PessoaDaLista, type ResumoDaCentral,
} from '../../core/teeds/central'
import { MARCA } from '../../marca'
import '../anuncios/admin-anuncios.css'
import './central.css'

const int = (v: number) => Math.round(v).toLocaleString('pt-BR')
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const pc = (v: number, c = 1) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })}%`
const razao = (a: number, b: number) => (b > 0 ? a / b : 0)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const hora = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const quando = (s: string) => {
  const d = new Date(s), hoje = iso(new Date()) === iso(d), ontem = diasAtras(1) === iso(d)
  const h = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return hoje ? `hoje, ${h}` : ontem ? `ontem, ${h}` : `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${h}`
}
const haQuanto = (s: string) => {
  const seg = Math.max(0, Math.round((Date.now() - +new Date(s)) / 1000))
  return seg < 60 ? 'agora' : seg < 3600 ? `há ${Math.round(seg / 60)} min` : seg < 86400 ? `há ${Math.round(seg / 3600)} h` : quando(s)
}

const PERIODOS = [
  { id: 'hoje', nome: 'Hoje', de: () => iso(new Date()) },
  { id: 'ontem', nome: 'Ontem', de: () => diasAtras(1), ate: () => diasAtras(1) },
  { id: '7', nome: '7 dias', de: () => diasAtras(6) },
  { id: 'lancamento', nome: 'Lançamento', de: () => '2026-11-02' },
  { id: '30', nome: '30 dias', de: () => diasAtras(29) },
] as const
type IdPeriodo = (typeof PERIODOS)[number]['id']

const ABAS = [
  { id: 'origens', nome: 'Origens' }, { id: 'criativos', nome: 'Criativos' }, { id: 'aovivo', nome: 'Ao vivo' },
  { id: 'pessoas', nome: 'Pessoas' }, { id: 'links', nome: 'Links' },
] as const
type IdAba = (typeof ABAS)[number]['id']
const lembrar = <T extends string>(chave: string, validos: readonly T[], padrao: T): T => {
  try { const v = localStorage.getItem(chave); return v != null && (validos as readonly string[]).includes(v) ? v as T : padrao } catch { return padrao }
}
const guardar = (chave: string, v: string) => { try { localStorage.setItem(chave, v) } catch { /* sem armazenamento: só não lembra */ } }

const PARCEIROS = [{ id: 'n', nome: 'Naor /n' }, { id: 'v', nome: 'Victor /v' }, { id: '', nome: 'Todos' }] as const

// ------------------------------------------------------------------ como cada passo aparece
const CAMPO: Record<string, string> = { nome: 'o nome', email: 'o e-mail', telefone: 'o WhatsApp', cliente: 'a resposta', produto: 'um produto', outro: 'o “outro”' }
const PAGINA = (p: string | null) => !p ? 'a página' : /obrigado/.test(p) ? 'a página de obrigado' : /questionario/.test(p) ? 'o questionário' : /cadastro/.test(p) ? 'a página de cadastro' : p
const segundos = (s: number) => s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`
/** O que a pessoa fez, numa frase. */
function frase(e: { evento: string; pagina: string | null; detalhe: Record<string, unknown> | null }): string {
  const d = e.detalhe ?? {}
  switch (e.evento) {
    case 'entrada': return `Chegou em ${PAGINA(e.pagina)}`
    case 'pagina': return `Abriu ${PAGINA(e.pagina)}`
    case 'formulario': return 'Viu o formulário'
    case 'clicou': return 'Clicou para se cadastrar'
    case 'comecou': return 'Começou a preencher'
    case 'campo': return `Preencheu ${CAMPO[String(d.campo)] ?? String(d.campo ?? 'um campo')}`
    case 'enviou': return 'Enviou o cadastro'
    case 'erro-campos': return `Faltou corrigir: ${String(d.campos ?? '').split(',').filter(Boolean).map((c) => CAMPO[c] ?? c).join(', ') || 'campos'}`
    case 'erro-cadastro': return `O cadastro não passou: ${String(d.erro ?? '')}`
    case 'cadastro': return 'Se cadastrou'
    case 'questionario': return 'Abriu o questionário'
    case 'respondeu': return d.exCliente === true ? 'Respondeu: já foi cliente' : d.exCliente === false ? 'Respondeu: nunca foi cliente' : 'Respondeu o questionário'
    case 'obrigado': return 'Chegou na página de obrigado'
    case 'comunidade': return 'Entrou na comunidade do WhatsApp'
    case 'agenda': return 'Pôs a live na agenda'
    case 'notificacoes': return 'Ativou as notificações'
    case 'baixou-app': return 'Instalou o app'
    case 'plataforma': return 'Foi para a plataforma'
    case 'saiu': return `Saiu depois de ${segundos(Number(d.segundos ?? 0))}${d.rolou != null ? ` (rolou ${d.rolou}%)` : ''}`
    case 'clique': return `Clicou em “${String(d.alvo ?? '')}”`
    case 'app-entrou': return 'Entrou logado na plataforma'
    case 'app-tela': return `Abriu a tela ${String(e.pagina ?? '').split(' · ')[1] ?? ''}`.trim()
    case 'app-cadastro': return 'Criou a conta pela plataforma'
    case 'app-notificacoes': return 'Ativou as notificações na plataforma'
    case 'app-live': return 'Assistiu à live'
    case 'app-liberado': return 'Teve o acesso liberado'
    default: return e.evento.startsWith('rolou-') ? `Rolou ${e.evento.slice(6)}% da página` : e.evento
  }
}
/** Os passos que contam muito (ficam em destaque). */
const GRANDES = new Set(['cadastro', 'respondeu', 'comunidade', 'notificacoes', 'app-live', 'app-liberado', 'app-entrou'])
const MIUDOS = (ev: string) => ev.startsWith('rolou-') || ev === 'clique' || ev === 'campo' || ev === 'saiu' || ev === 'pagina'
/** Até onde a pessoa foi, do primeiro passo ao último. */
const DEGRAUS: Array<{ nome: string; passos: string[] }> = [
  { nome: 'Chegou', passos: ['entrada', 'pagina'] }, { nome: 'Viu o formulário', passos: ['formulario'] }, { nome: 'Começou', passos: ['comecou', 'campo'] },
  { nome: 'Cadastrou', passos: ['cadastro', 'app-cadastro'] }, { nome: 'Questionário', passos: ['respondeu'] }, { nome: 'Comunidade', passos: ['comunidade'] },
  { nome: 'Plataforma', passos: ['app-entrou', 'plataforma'] }, { nome: 'Notificações', passos: ['notificacoes', 'app-notificacoes'] }, { nome: 'Live', passos: ['app-live'] },
]
const degrau = (passos: string[] | null) => { let n = -1; DEGRAUS.forEach((d, i) => { if (d.passos.some((p) => passos?.includes(p))) n = i }); return n }
const NAVEGADOR: Record<string, string> = { instagram: 'Instagram (app)', facebook: 'Facebook (app)', telegram: 'Telegram (app)', tiktok: 'TikTok (app)', whatsapp: 'WhatsApp (app)', chrome: 'Chrome', safari: 'Safari', edge: 'Edge', firefox: 'Firefox' }
const quem = (nome: string | null, visitante: string) => nome || `Visitante ${visitante.slice(-4).toUpperCase()}`

// ------------------------------------------------------------------ criativos (os anúncios da Meta, agrupados)
/** "GF | NB3 | Quente" → criativo NB3, público Quente. */
const partesDoNome = (nome: string) => { const p = nome.split('|').map((x) => x.trim()).filter(Boolean); return p.length >= 3 ? { criativo: p[1], publico: p.slice(2).join(' · ') } : { criativo: nome, publico: '' } }
interface Criativo { chave: string; nome: string; publico: string; miniatura: string | null; ids: string[]; m: Metricas; reais: LinhaDoResumo; marcado: boolean }
const SOMA: Array<keyof Metricas> = ['gasto', 'impressoes', 'alcance', 'cliques', 'cliquesLink', 'lpv', 'viewContent', 'leads', 'cadastros', 'video3s', 'videoPlay', 'thruplay', 'p25', 'p50', 'p75', 'p95', 'p100']
const zerado = (): LinhaDoResumo => ({ chave: '', visitantes: 0, formulario: 0, clicou: 0, comecou: 0, convertidos: 0, cadastros: 0, questionario: 0, notificacoes: 0, live: 0, liberados: 0 })
function agrupar(anuncios: Anuncio[], reais: LinhaDoResumo[], separar: boolean): Criativo[] {
  const porId = new Map(reais.map((r) => [r.chave, r]))
  const mapa = new Map<string, Criativo>()
  for (const a of anuncios) {
    const { criativo, publico } = partesDoNome(a.nome)
    const chave = separar ? `${criativo} · ${publico}` : criativo
    const c = mapa.get(chave) ?? { chave, nome: criativo, publico: separar ? publico : '', miniatura: a.criativo.miniatura, ids: [], m: { ...a.m, ...Object.fromEntries(SOMA.map((k) => [k, 0])) } as Metricas, reais: zerado(), marcado: true }
    c.ids.push(a.id)
    // sem utm_content={{ad.id}} no link o banco não liga cadastros a este anúncio
    if (a.criativo.marcacoes != null && !/utm_content=\{\{ad\.id\}\}/.test(a.criativo.marcacoes)) c.marcado = false
    for (const k of SOMA) (c.m[k] as number) += a.m[k] as number
    const r = porId.get(a.id)
    if (r) for (const k of Object.keys(c.reais) as Array<keyof LinhaDoResumo>) if (k !== 'chave') (c.reais[k] as number) += r[k] as number
    if (!c.miniatura) c.miniatura = a.criativo.miniatura
    mapa.set(chave, c)
  }
  for (const c of mapa.values()) { c.m.ctrLink = razao(c.m.cliquesLink, c.m.impressoes) * 100; c.m.cpcLink = razao(c.m.gasto, c.m.cliquesLink) }
  return [...mapa.values()].sort((a, b) => b.m.gasto - a.m.gasto)
}
/** As faixas de retenção: % de quem deu play que chegou até ali. */
const FAIXAS: Array<{ id: string; nome: string; v: (m: Metricas) => number }> = [
  { id: 'play', nome: 'Play', v: () => 100 },
  { id: '3s', nome: '3 s', v: (m) => razao(m.video3s, m.videoPlay) * 100 },
  { id: 'p25', nome: '25%', v: (m) => razao(m.p25, m.videoPlay) * 100 },
  { id: 'p50', nome: '50%', v: (m) => razao(m.p50, m.videoPlay) * 100 },
  { id: 'p75', nome: '75%', v: (m) => razao(m.p75, m.videoPlay) * 100 },
  { id: 'p95', nome: '95%', v: (m) => razao(m.p95, m.videoPlay) * 100 },
  { id: 'p100', nome: '100%', v: (m) => razao(m.p100, m.videoPlay) * 100 },
]
const CORES = ['#D9A441', '#5FC48C', '#6EA2FF', '#E07A9B', '#A78BFA', '#F59E5B', '#4CC9D6', '#C9D660']
const gancho = (m: Metricas) => razao(m.video3s, m.impressoes) * 100

/** O que os números dizem sobre os criativos, em frases (só com amostra que sustente a conclusão). */
function lerCriativos(lista: Criativo[]): Array<{ tipo: 'ok' | 'atencao' | 'info'; texto: string }> {
  const com = lista.filter((c) => c.m.impressoes >= 300 && c.m.videoPlay >= 50)
  const saida: Array<{ tipo: 'ok' | 'atencao' | 'info'; texto: string }> = []
  if (com.length < 2) return [{ tipo: 'info', texto: 'Ainda há pouco dado para comparar os criativos (cada um precisa de umas 300 impressões e 50 plays). As conclusões aparecem aqui sozinhas assim que os números crescerem.' }]
  const melhor = <T,>(l: T[], f: (x: T) => number) => [...l].sort((a, b) => f(b) - f(a))[0]
  const pior = <T,>(l: T[], f: (x: T) => number) => [...l].sort((a, b) => f(a) - f(b))[0]
  const g = melhor(com, (c) => gancho(c.m)), gp = pior(com, (c) => gancho(c.m))
  saida.push({ tipo: 'ok', texto: `${g.chave} segura melhor no começo: ${pc(gancho(g.m))} de quem viu passou dos 3 segundos.` })
  if (gp !== g && gancho(gp.m) < gancho(g.m) * 0.7) saida.push({ tipo: 'atencao', texto: `${gp.chave} perde gente logo no início (${pc(gancho(gp.m))} passam dos 3 s). Vale trocar os primeiros segundos ou a capa.` })
  const fim = melhor(com, (c) => razao(c.m.p75, c.m.videoPlay)), fimP = pior(com, (c) => razao(c.m.p75, c.m.videoPlay))
  saida.push({ tipo: 'ok', texto: `${fim.chave} é o mais assistido até o fim: ${pc(razao(fim.m.p75, fim.m.videoPlay) * 100)} chegam a 75% do vídeo.` })
  if (fimP !== fim) {
    // onde o pior perde mais gente: a maior queda entre duas faixas seguidas
    // do 3 s em diante: a queda do play para os 3 s existe em todo vídeo (rolagem do feed, reprodução automática)
    const v = FAIXAS.map((f) => f.v(fimP.m)); let qual = 2
    for (let i = 3; i < v.length; i++) if (v[i - 1] - v[i] > v[qual - 1] - v[qual]) qual = i
    saida.push({ tipo: 'atencao', texto: `${fimP.chave} perde mais gente entre ${FAIXAS[qual - 1].nome} e ${FAIXAS[qual].nome} do vídeo (cai ${pc(v[qual - 1] - v[qual], 0)}). É o trecho para rever.` })
  }
  const cli = melhor(com, (c) => c.m.ctrLink)
  saida.push({ tipo: 'ok', texto: `${cli.chave} é o que mais faz clicar: ${pc(cli.m.ctrLink, 2)} de quem viu clicou no link.` })
  // custo por cadastro: só criativos com link marcado e com 3+ cadastros reais, e só comparando 2 ou mais
  const marcados = com.filter((c) => c.marcado)
  const comCad = marcados.filter((c) => c.reais.cadastros >= 3)
  const gastoM = marcados.reduce((s, c) => s + c.m.gasto, 0), cadM = marcados.reduce((s, c) => s + c.reais.cadastros, 0)
  const medio = cadM >= 5 ? gastoM / cadM : null
  if (comCad.length >= 2 && medio != null) {
    const barato = pior(comCad, (c) => c.m.gasto / c.reais.cadastros), cb = barato.m.gasto / barato.reais.cadastros
    if (cb <= medio * 0.8) saida.push({ tipo: 'ok', texto: `${barato.chave} traz o cadastro real mais barato: ${brl(cb)} cada (${int(barato.reais.cadastros)} no banco), ${pc((1 - cb / medio) * 100, 0)} abaixo da média de ${brl(medio)}. Candidato a receber mais verba.` })
  }
  // sem cadastro: só depois de gastar 1,5 vez o custo médio (e nunca menos de R$ 30), com o link marcado
  if (medio != null) for (const c of marcados.filter((x) => x.reais.cadastros === 0 && x.m.gasto >= Math.max(30, medio * 1.5)).slice(0, 2))
    saida.push({ tipo: 'atencao', texto: `${c.chave} já gastou ${brl(c.m.gasto)} (1,5 vez o custo médio por cadastro, de ${brl(medio)}) e não trouxe nenhum cadastro real. Vale pausar ou trocar o criativo.` })
  const semMarca = lista.filter((c) => !c.marcado)
  if (semMarca.length) saida.push({ tipo: 'info', texto: `${semMarca.map((c) => c.chave).join(', ')}: o link não tem a marcação do anúncio, então os cadastros dele não aparecem aqui.` })
  const assisteNaoClica = com.find((c) => razao(c.m.p75, c.m.videoPlay) >= razao(fim.m.p75, fim.m.videoPlay) * 0.8 && c.m.ctrLink < cli.m.ctrLink * 0.6)
  if (assisteNaoClica) saida.push({ tipo: 'info', texto: `${assisteNaoClica.chave} prende a atenção, mas pouca gente clica: reforçar a chamada para o cadastro no fim do vídeo pode destravar.` })
  return saida
}

/** O que os números dizem sobre os canais. */
function lerCanais(r: ResumoDaCentral): Array<{ tipo: 'ok' | 'atencao' | 'info'; texto: string }> {
  const saida: Array<{ tipo: 'ok' | 'atencao' | 'info'; texto: string }> = []
  // conversão = visitantes rastreados que se cadastraram ÷ visitantes rastreados (o mesmo grupo nos dois lados);
  // só canais com 30+ visitantes, e só se fala em "melhor" quando há pelo menos dois para comparar
  const rast = r.porCanal.filter((c) => c.visitantes >= 30 && c.chave !== 'sem-origem')
  const conv = (c: LinhaDoResumo) => razao(c.convertidos, c.visitantes)
  if (rast.length >= 2) {
    const ord = [...rast].sort((a, b) => conv(b) - conv(a)), melhor = ord[0], pior = ord[ord.length - 1]
    if (conv(melhor) > 0 && conv(melhor) >= conv(pior) * 1.3) saida.push({ tipo: 'ok', texto: `${nomeDoCanal(melhor.chave)} converte melhor: ${pc(conv(melhor) * 100)} de quem chega se cadastra (${nomeDoCanal(pior.chave)}: ${pc(conv(pior) * 100)}).` })
    const maisGente = [...rast].sort((a, b) => b.visitantes - a.visitantes)[0]
    saida.push({ tipo: 'info', texto: `${nomeDoCanal(maisGente.chave)} traz mais gente: ${int(maisGente.visitantes)} visitantes no período.` })
  }
  const abandona = rast.filter((c) => c.comecou >= 10 && razao(c.convertidos, c.comecou) < 0.5).sort((a, b) => (b.comecou - b.convertidos) - (a.comecou - a.convertidos))[0]
  if (abandona) saida.push({ tipo: 'atencao', texto: `No ${nomeDoCanal(abandona.chave)}, ${int(abandona.comecou - abandona.convertidos)} de ${int(abandona.comecou)} pessoas começaram a preencher e não terminaram.` })
  const sem = r.porCanal.find((c) => c.chave === 'sem-origem'), dir = r.porCanal.find((c) => c.chave === 'direto')
  if ((sem?.cadastros ?? 0) + (dir?.cadastros ?? 0) > 0) saida.push({ tipo: 'info', texto: `${int((sem?.cadastros ?? 0) + (dir?.cadastros ?? 0))} cadastros sem origem conhecida: são de antes da central ou de links sem marcação. Use os links da aba Links em toda divulgação para eles entrarem no canal certo.` })
  if (!saida.length) saida.push({ tipo: 'info', texto: 'Ainda há poucas visitas rastreadas para comparar os canais (cada um precisa de umas 30). As conclusões aparecem aqui sozinhas quando os números crescerem.' })
  return saida
}

function Leitura({ itens, titulo }: { itens: Array<{ tipo: 'ok' | 'atencao' | 'info'; texto: string }>; titulo: string }) {
  return (
    <section className="aa-cartao cr-leitura">
      <header><div><span className="rot">Inteligência</span><h3>{titulo}</h3></div></header>
      <ul>{itens.map((x, i) => <li key={i} className={x.tipo}><i aria-hidden="true" />{x.texto}</li>)}</ul>
    </section>
  )
}

// ------------------------------------------------------------------ a tela
export function CentralRastreio({ sessao, api = API_DA_CENTRAL, apiAnuncios = API_DO_BANCO }: { sessao: SessaoTeeds; api?: ApiCentral; apiAnuncios?: ApiAnuncios }) {
  const [aba, setAba] = useState<IdAba>(() => lembrar('cr-aba', ABAS.map((a) => a.id), 'origens'))
  const [parceiro, setParceiro] = useState<string>(() => lembrar('cr-parceiro', ['n', 'v', ''], 'n'))
  const [periodo, setPeriodo] = useState<IdPeriodo>(() => lembrar('cr-periodo', PERIODOS.map((p) => p.id), 'hoje'))
  const p = PERIODOS.find((x) => x.id === periodo)!
  const de = p.de(), ate = 'ate' in p ? p.ate() : iso(new Date())
  const [resumo, setResumo] = useState<ResumoDaCentral | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [links, setLinks] = useState<LinkDeRastreio[]>([])
  const [ficha, setFicha] = useState<string | null>(null)
  // os anúncios da Meta (nomes, capas, gasto e as faixas do vídeo), das contas do parceiro escolhido
  const [meta, setMeta] = useState<{ anuncios: Anuncio[]; falha: string | null; carregando: boolean }>({ anuncios: [], falha: null, carregando: false })

  useEffect(() => { guardar('cr-aba', aba) }, [aba])
  useEffect(() => { guardar('cr-parceiro', parceiro) }, [parceiro])
  useEffect(() => { guardar('cr-periodo', periodo) }, [periodo])

  const carregarResumo = async () => {
    try { setResumo(await api.resumo(sessao, parceiro, de, ate)); setErro(null) } catch (e) { setErro((e as Error).message) }
  }
  useEffect(() => {
    setResumo(null); void carregarResumo()
    const t = setInterval(() => { if (document.visibilityState === 'visible') void carregarResumo() }, 30000)
    return () => clearInterval(t)
  }, [parceiro, de, ate, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { api.links(sessao).then(setLinks).catch(() => { /* a aba Links mostra o erro */ }) }, [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const contas = (CONTAS_DE_ANUNCIO[MARCA.id] ?? []).filter((c) => !parceiro || c.codigo === parceiro)
    if (!contas.length) { setMeta({ anuncios: [], falha: null, carregando: false }); return }
    let vivo = true
    setMeta((m) => ({ ...m, carregando: true }))
    void Promise.allSettled(contas.map((c) => apiAnuncios.painel(sessao, c.codigo, de, ate))).then((rs) => {
      if (!vivo) return
      const anuncios: Anuncio[] = []; let falha: string | null = null
      rs.forEach((r) => {
        if (r.status === 'fulfilled' && 'anuncios' in r.value) anuncios.push(...(r.value as PainelDaMeta).anuncios)
        else if (r.status === 'rejected') falha = (r.reason as Error).message
        else if (r.status === 'fulfilled' && !('anuncios' in r.value)) falha = falha ?? 'A conta de anúncios ainda não está conectada (Administração › Anúncios).'
      })
      setMeta({ anuncios, falha: anuncios.length ? null : falha, carregando: false })
    })
    return () => { vivo = false }
  }, [parceiro, de, ate, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps

  const nomeDoAnuncio = useMemo(() => new Map(meta.anuncios.map((a) => [a.id, a])), [meta.anuncios])
  const nomeDoLink = useMemo(() => new Map(links.map((l) => [l.codigo, l.nome])), [links])

  return (
    <div className="aa cr">
      <div className="aa-topo cr-topo">
        <div className="aa-troca" role="group" aria-label="Parceiro">
          {PARCEIROS.map((x) => <button key={x.id} type="button" className={parceiro === x.id ? 'on' : ''} onClick={() => setParceiro(x.id)}>{x.nome}</button>)}
        </div>
        {aba !== 'aovivo' && aba !== 'links' && (
          <div className="aa-periodo" role="group" aria-label="Período">
            {PERIODOS.map((x) => <button key={x.id} type="button" className={periodo === x.id ? 'on' : ''} onClick={() => setPeriodo(x.id)}>{x.nome}</button>)}
          </div>
        )}
      </div>
      {erro && <p className="aa-erro">{erro}</p>}

      <nav className="aa-abas cr-abas" role="tablist" aria-label="Partes da central">
        {ABAS.map((x) => (
          <button key={x.id} type="button" role="tab" aria-selected={aba === x.id} className={aba === x.id ? 'on' : ''} onClick={() => setAba(x.id)}>
            {x.id === 'aovivo' && <span className="cr-pulso" aria-hidden="true" />}{x.nome}
          </button>
        ))}
      </nav>

      {aba === 'origens' && <Origens resumo={resumo} nomeDoLink={nomeDoLink} nomeDoAnuncio={nomeDoAnuncio} irParaLinks={() => setAba('links')} />}
      {aba === 'criativos' && <Criativos meta={meta} resumo={resumo} />}
      {aba === 'aovivo' && <AoVivo sessao={sessao} api={api} parceiro={parceiro} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} abrir={setFicha} />}
      {aba === 'pessoas' && <Pessoas sessao={sessao} api={api} parceiro={parceiro} de={de} ate={ate} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} abrir={setFicha} />}
      {aba === 'links' && <Links sessao={sessao} api={api} links={links} setLinks={setLinks} parceiro={parceiro} />}

      {ficha && <Ficha sessao={sessao} api={api} visitante={ficha} fechar={() => setFicha(null)} abrir={setFicha} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} />}
    </div>
  )
}

/** De onde veio, numa etiqueta: o canal e, se houver, o anúncio ou o link. */
function Origem({ canal, conteudo, link, nomeDoAnuncio, nomeDoLink }: { canal: string; conteudo: string | null; link: string | null; nomeDoAnuncio: Map<string, Anuncio>; nomeDoLink: Map<string, string> }) {
  const ad = conteudo ? nomeDoAnuncio.get(conteudo) : undefined
  const extra = link ? nomeDoLink.get(link) ?? link : canal === 'anuncio-meta' && conteudo ? (ad ? ad.nome.replace(/^GF \| /, '') : `anúncio ${conteudo.slice(-5)}`) : null
  return <span className={`cr-canal c-${canal}`}><i aria-hidden="true" />{nomeDoCanal(canal)}{extra && <small>{extra}</small>}</span>
}

// ------------------------------------------------------------------ Origens
function Origens({ resumo, nomeDoLink, nomeDoAnuncio, irParaLinks }: { resumo: ResumoDaCentral | null; nomeDoLink: Map<string, string>; nomeDoAnuncio: Map<string, Anuncio>; irParaLinks: () => void }) {
  if (!resumo) return <p className="aa-vazio">Carregando…</p>
  const t = resumo.total
  const maxCad = Math.max(1, ...resumo.porCanal.map((c) => c.cadastros))
  return (
    <>
      <div className="aa-kpis cr-kpis">
        <div><small>Visitantes</small><b>{int(t.visitantes)}</b><span>pessoas que abriram as páginas</span></div>
        <div><small>Viram o formulário</small><b>{int(t.formulario)}</b><span>{pc(razao(t.formulario, t.visitantes) * 100)} dos visitantes</span></div>
        <div><small>Começaram</small><b>{int(t.comecou)}</b><span>tocaram em algum campo</span></div>
        <div className="destaque"><small>Cadastros</small><b>{int(t.cadastros)}</b><span>{t.visitantes >= 30 ? `${pc(razao(t.convertidos, t.visitantes) * 100)} dos visitantes rastreados` : 'no período'}</span></div>
        <div><small>Questionário</small><b>{int(t.questionario)}</b><span>{pc(razao(t.questionario, t.cadastros) * 100, 0)} dos cadastros</span></div>
        <div><small>Na live</small><b>{int(t.live)}</b><span>{int(t.notificacoes)} com notificação ligada</span></div>
      </div>

      <Leitura itens={lerCanais(resumo)} titulo="O que as origens dizem" />

      <section className="aa-cartao">
        <header><div><span className="rot">De onde vem cada pessoa</span><h3>Por canal</h3></div></header>
        {resumo.porCanal.length ? (
          <div className="cr-linhas">
            <div className="cr-linha cab" aria-hidden="true"><span>Canal</span><span>Visitantes</span><span>Começaram</span><span>Cadastros</span><span>Conversão</span><span>Questionário</span><span>Live</span></div>
            {resumo.porCanal.map((c) => (
              <div key={c.chave} className="cr-linha">
                <span className="cr-nome"><Origem canal={c.chave} conteudo={null} link={null} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} /><em style={{ width: `${(c.cadastros / maxCad) * 100}%` }} aria-hidden="true" /></span>
                <span data-rot="Visitantes">{c.chave === 'sem-origem' ? '—' : int(c.visitantes)}</span>
                <span data-rot="Começaram">{c.chave === 'sem-origem' ? '—' : int(c.comecou)}</span>
                <span data-rot="Cadastros"><b>{int(c.cadastros)}</b></span>
                <span data-rot="Conversão">{c.visitantes >= 10 ? pc(razao(c.convertidos, c.visitantes) * 100) : '—'}</span>
                <span data-rot="Questionário">{int(c.questionario)}</span>
                <span data-rot="Live">{int(c.live)}</span>
              </div>
            ))}
          </div>
        ) : <p className="aa-vazio">Nada neste período.</p>}
        <p className="aa-nota">Cada pessoa conta no canal do último link marcado por onde chegou. “Direto ou sem marcação” é quem abriu sem link marcado (um link copiado do WhatsApp, por exemplo). “Sem origem” são cadastros de antes da central, que só têm a marcação gravada no cadastro.</p>
      </section>

      <section className="aa-cartao">
        <header>
          <div><span className="rot">Divulgações</span><h3>Por link marcado</h3></div>
          <button type="button" className="aa-atualizar" onClick={irParaLinks}>Criar link</button>
        </header>
        {resumo.porLink.length ? (
          <div className="cr-linhas">
            <div className="cr-linha cab" aria-hidden="true"><span>Link</span><span>Visitantes</span><span>Começaram</span><span>Cadastros</span><span>Conversão</span><span>Questionário</span><span>Live</span></div>
            {resumo.porLink.map((c) => (
              <div key={c.chave} className="cr-linha">
                <span className="cr-nome"><b>{nomeDoLink.get(c.chave) ?? c.chave}</b><small>?o={c.chave}</small></span>
                <span data-rot="Visitantes">{int(c.visitantes)}</span><span data-rot="Começaram">{int(c.comecou)}</span>
                <span data-rot="Cadastros"><b>{int(c.cadastros)}</b></span><span data-rot="Conversão">{c.visitantes >= 10 ? pc(razao(c.convertidos, c.visitantes) * 100) : '—'}</span>
                <span data-rot="Questionário">{int(c.questionario)}</span><span data-rot="Live">{int(c.live)}</span>
              </div>
            ))}
          </div>
        ) : <p className="aa-vazio">Nenhum link marcado trouxe visitas neste período. Crie um link para cada divulgação (Telegram, stories, WhatsApp) na aba Links.</p>}
      </section>

      {resumo.porAnuncio.length > 0 && (
        <section className="aa-cartao">
          <header><div><span className="rot">Anúncios da Meta</span><h3>O que cada anúncio trouxe de verdade</h3></div></header>
          <div className="cr-linhas">
            <div className="cr-linha cab" aria-hidden="true"><span>Anúncio</span><span>Visitantes</span><span>Começaram</span><span>Cadastros</span><span>Conversão</span><span>Questionário</span><span>Live</span></div>
            {resumo.porAnuncio.map((c) => {
              const a = nomeDoAnuncio.get(c.chave)
              return (
                <div key={c.chave} className="cr-linha">
                  <span className="cr-nome cr-ad">{a?.criativo.miniatura ? <img src={a.criativo.miniatura} alt="" /> : <i className="cr-sem-img" />}<span><b>{a ? a.nome.replace(/^GF \| /, '') : `Anúncio ${c.chave}`}</b>{!a && <small>fora do período da Meta ou de outra conta</small>}</span></span>
                  <span data-rot="Visitantes">{int(c.visitantes)}</span><span data-rot="Começaram">{int(c.comecou)}</span>
                  <span data-rot="Cadastros"><b>{int(c.cadastros)}</b></span><span data-rot="Conversão">{c.visitantes >= 10 ? pc(razao(c.convertidos, c.visitantes) * 100) : '—'}</span>
                  <span data-rot="Questionário">{int(c.questionario)}</span><span data-rot="Live">{int(c.live)}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}
    </>
  )
}

// ------------------------------------------------------------------ Criativos
function CurvaDeRetencao({ lista }: { lista: Criativo[] }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(760)
  const [foco, setFoco] = useState<string | null>(null)
  useEffect(() => {
    const el = caixa.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  const H = W < 520 ? 220 : 260, esq = 40, dir = 14, cima = 12, baixo = 26
  const x = (i: number) => esq + (i / (FAIXAS.length - 1)) * (W - esq - dir)
  const y = (v: number) => cima + (1 - v / 100) * (H - cima - baixo)
  return (
    <div className="aa-grafico" ref={caixa}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Retenção dos vídeos por faixa">
        {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={esq} x2={W - dir} y1={y(v)} y2={y(v)} className="aa-g-grade" /><text x={esq - 6} y={y(v) + 4} textAnchor="end" className="aa-g-eixo">{v}%</text></g>)}
        {FAIXAS.map((f, i) => <text key={f.id} x={x(i)} y={H - 8} textAnchor="middle" className="aa-g-eixo">{f.nome}</text>)}
        {lista.map((c, k) => {
          const pts = FAIXAS.map((f, i) => `${x(i).toFixed(1)},${y(Math.min(100, f.v(c.m))).toFixed(1)}`).join(' ')
          const apagado = foco != null && foco !== c.chave
          return (
            <g key={c.chave} opacity={apagado ? 0.18 : 1} onMouseEnter={() => setFoco(c.chave)} onMouseLeave={() => setFoco(null)}>
              <polyline points={pts} fill="none" stroke={CORES[k % CORES.length]} strokeWidth={foco === c.chave ? 3.2 : 2.2} strokeLinejoin="round" strokeLinecap="round" />
              {FAIXAS.map((f, i) => <circle key={f.id} cx={x(i)} cy={y(Math.min(100, f.v(c.m)))} r={foco === c.chave ? 4 : 2.6} fill={CORES[k % CORES.length]} />)}
            </g>
          )
        })}
      </svg>
      <div className="aa-g-legenda">
        {lista.map((c, k) => (
          <button key={c.chave} type="button" className={`cr-leg ${foco === c.chave ? 'on' : ''}`} onMouseEnter={() => setFoco(c.chave)} onMouseLeave={() => setFoco(null)} onFocus={() => setFoco(c.chave)} onBlur={() => setFoco(null)} onClick={() => setFoco(foco === c.chave ? null : c.chave)}>
            <i style={{ background: CORES[k % CORES.length] }} />{c.chave}
          </button>
        ))}
      </div>
    </div>
  )
}

function Criativos({ meta, resumo }: { meta: { anuncios: Anuncio[]; falha: string | null; carregando: boolean }; resumo: ResumoDaCentral | null }) {
  const [separar, setSeparar] = useState(() => lembrar('cr-separar', ['1', '0'], '0') === '1')
  useEffect(() => { guardar('cr-separar', separar ? '1' : '0') }, [separar])
  const lista = useMemo(() => agrupar(meta.anuncios.filter((a) => a.m.impressoes > 0 || a.m.gasto > 0), resumo?.porAnuncio ?? [], separar), [meta.anuncios, resumo, separar])
  const videos = lista.filter((c) => c.m.videoPlay > 0)
  if (meta.carregando && !meta.anuncios.length) return <p className="aa-vazio">Buscando os criativos na Meta…</p>
  if (meta.falha) return <p className="aa-erro">{meta.falha}</p>
  if (!lista.length) return <p className="aa-vazio">Nenhum anúncio com entrega neste período.</p>
  // a cor de cada célula de faixa: mais forte quanto mais gente ficou
  const tom = (v: number) => ({ background: `color-mix(in srgb, var(--up) ${Math.round(Math.min(100, v) * 0.55)}%, transparent)` })
  return (
    <>
      <div className="cr-barra-criativos">
        <div className="aa-troca" role="group" aria-label="Como juntar">
          <button type="button" className={!separar ? 'on' : ''} onClick={() => setSeparar(false)}>Por criativo</button>
          <button type="button" className={separar ? 'on' : ''} onClick={() => setSeparar(true)}>Criativo e público</button>
        </div>
        <p className="aa-nota">Faixas = % de quem deu play no vídeo e chegou até aquele ponto. Gancho = % de quem viu o anúncio e passou dos 3 segundos.</p>
      </div>

      <Leitura itens={lerCriativos(lista)} titulo="O que os criativos dizem" />

      {videos.length > 0 && (
        <section className="aa-cartao">
          <header><div><span className="rot">Retenção</span><h3>Até onde cada vídeo segura</h3></div></header>
          <CurvaDeRetencao lista={videos} />
        </section>
      )}

      <section className="aa-cartao">
        <header><div><span className="rot">Lado a lado</span><h3>Cada criativo, da tela ao cadastro</h3></div></header>
        <div className="cr-criativos">
          {lista.map((c, k) => {
            const v = c.m.videoPlay > 0
            return (
              <article key={c.chave} className="cr-criativo">
                <header>
                  {c.miniatura ? <img src={c.miniatura} alt="" /> : <i className="cr-sem-img" />}
                  <div><b><i style={{ background: CORES[k % CORES.length] }} />{c.nome}</b><small>{c.publico || `${c.ids.length} anúncio${c.ids.length > 1 ? 's' : ''}`}</small></div>
                  <strong>{brl(c.m.gasto)}<small>investido</small></strong>
                </header>
                {v ? (
                  <div className="cr-faixas" role="list" aria-label="Retenção por faixa">
                    {FAIXAS.slice(1).map((f) => { const p = f.v(c.m); return <span key={f.id} role="listitem" style={tom(p)}><small>{f.nome}</small><b>{pc(p, 0)}</b></span> })}
                  </div>
                ) : <p className="aa-mudo">Sem vídeo (imagem ou carrossel).</p>}
                <dl className="cr-numeros">
                  <div><dt>Impressões</dt><dd>{int(c.m.impressoes)}</dd></div>
                  <div><dt>Gancho</dt><dd>{v ? pc(gancho(c.m)) : '—'}</dd></div>
                  <div><dt>ThruPlay</dt><dd>{v ? int(c.m.thruplay) : '—'}</dd></div>
                  <div><dt>Cliques no link</dt><dd>{int(c.m.cliquesLink)} <small>({pc(c.m.ctrLink, 2)})</small></dd></div>
                  <div><dt>Custo por clique</dt><dd>{c.m.cliquesLink ? brl(c.m.cpcLink) : '—'}</dd></div>
                  <div><dt>Chegaram na página</dt><dd>{int(c.reais.visitantes)}</dd></div>
                  <div className="forte"><dt>Cadastros reais</dt><dd>{int(c.reais.cadastros)}</dd></div>
                  <div className="forte"><dt>Custo por cadastro</dt><dd>{c.reais.cadastros ? brl(c.m.gasto / c.reais.cadastros) : '—'}</dd></div>
                  <div><dt>Questionário</dt><dd>{int(c.reais.questionario)}</dd></div>
                  <div><dt>Live</dt><dd>{int(c.reais.live)}</dd></div>
                </dl>
              </article>
            )
          })}
        </div>
        <p className="aa-nota">Os números da tela (impressões, faixas, cliques) são da Meta. Os cadastros, o questionário e a live são do nosso banco, ligados a cada anúncio pela marcação do link.</p>
      </section>
    </>
  )
}

// ------------------------------------------------------------------ Ao vivo
function AoVivo({ sessao, api, parceiro, nomeDoAnuncio, nomeDoLink, abrir }: { sessao: SessaoTeeds; api: ApiCentral; parceiro: string; nomeDoAnuncio: Map<string, Anuncio>; nomeDoLink: Map<string, string>; abrir: (v: string) => void }) {
  const [eventos, setEventos] = useState<EventoAoVivo[] | null>(null)
  const [tudo, setTudo] = useState(() => lembrar('cr-tudo', ['1', '0'], '1') === '1')
  const [falha, setFalha] = useState<string | null>(null)
  const [, setTique] = useState(0)
  const ultimo = useRef<number | null>(null)
  useEffect(() => { guardar('cr-tudo', tudo ? '1' : '0') }, [tudo])
  useEffect(() => {
    let vivo = true, ocupado = false; ultimo.current = null; setEventos(null)
    const puxar = async () => {
      if (ocupado || (document.visibilityState !== 'visible' && ultimo.current != null)) return
      ocupado = true
      try {
        const novos = await api.aoVivo(sessao, parceiro, ultimo.current)
        if (!vivo) return
        setFalha(null)
        if (novos.length) ultimo.current = Math.max(ultimo.current ?? 0, ...novos.map((e) => e.id))
        setEventos((ant) => { const vistos = new Set((ant ?? []).map((e) => e.id)); return [...novos.filter((e) => !vistos.has(e.id)), ...(ant ?? [])].slice(0, 400) })
      } catch (e) { if (vivo) setFalha((e as Error).message) } finally { ocupado = false }
    }
    void puxar()
    const t = setInterval(puxar, 4000), r = setInterval(() => setTique((x) => x + 1), 15000)
    return () => { vivo = false; clearInterval(t); clearInterval(r) }
  }, [parceiro, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  const agora = useMemo(() => new Set((eventos ?? []).filter((e) => Date.now() - +new Date(e.quando) < 5 * 60e3).map((e) => e.visitante)).size, [eventos])
  const lista = (eventos ?? []).filter((e) => tudo || !MIUDOS(e.evento))
  return (
    <section className="aa-cartao cr-aovivo">
      <header>
        <div><span className="rot">Ao vivo</span><h3><span className="aa-vivo"><i />{agora === 1 ? '1 pessoa' : `${int(agora)} pessoas`} nas páginas nos últimos 5 minutos</span></h3></div>
        <div className="aa-troca" role="group" aria-label="O que mostrar">
          <button type="button" className={tudo ? 'on' : ''} onClick={() => setTudo(true)}>Cada clique</button>
          <button type="button" className={!tudo ? 'on' : ''} onClick={() => setTudo(false)}>Só os passos</button>
        </div>
      </header>
      {falha && <p className="aa-erro">{falha}</p>}
      {!eventos ? <p className="aa-vazio">Carregando…</p> : !lista.length ? <p className="aa-vazio">Ninguém passou pelas páginas nos últimos 3 dias.</p> : (
        <ol className="cr-feed">
          {lista.map((e) => (
            <li key={e.id} className={GRANDES.has(e.evento) ? 'grande' : MIUDOS(e.evento) ? 'miudo' : ''}>
              <time dateTime={e.quando} title={quando(e.quando)}>{hora(e.quando)}</time>
              <button type="button" className="cr-quem" onClick={() => abrir(e.visitante)}>
                <b>{quem(e.nome, e.visitante)}</b>
                <small>{[e.dispositivo, e.navegador ? NAVEGADOR[e.navegador] ?? e.navegador : null, e.visitas > 1 ? `${e.visitas}ª visita` : null].filter(Boolean).join(' · ')}</small>
              </button>
              <span className="cr-fez">{frase(e)}</span>
              <Origem canal={e.canal} conteudo={e.conteudo} link={e.link} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} />
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ Pessoas
function Pessoas({ sessao, api, parceiro, de, ate, nomeDoAnuncio, nomeDoLink, abrir }: { sessao: SessaoTeeds; api: ApiCentral; parceiro: string; de: string; ate: string; nomeDoAnuncio: Map<string, Anuncio>; nomeDoLink: Map<string, string>; abrir: (v: string) => void }) {
  const [lista, setLista] = useState<PessoaDaLista[] | null>(null)
  const [busca, setBusca] = useState('')
  const [canal, setCanal] = useState('')
  const [so, setSo] = useState<'todos' | 'cadastrados' | 'nao'>('todos')
  const [falha, setFalha] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => {
      api.pessoas(sessao, parceiro, de, ate, canal, busca.trim()).then((l) => { if (vivo) { setLista(l); setFalha(null) } }).catch((e) => vivo && setFalha((e as Error).message))
    }, busca ? 350 : 0)
    return () => { vivo = false; clearTimeout(t) }
  }, [parceiro, de, ate, canal, busca, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  const canais = useMemo(() => [...new Set((lista ?? []).map((p) => p.canal))].sort(), [lista])
  const vistos = (lista ?? []).filter((p) => so === 'todos' || (so === 'cadastrados' ? p.cadastrado : !p.cadastrado))
  return (
    <section className="aa-cartao">
      <header>
        <div><span className="rot">Pessoas</span><h3>{lista ? `${int(vistos.length)} ${vistos.length === 1 ? 'pessoa' : 'pessoas'} no período` : 'Pessoas no período'}</h3></div>
      </header>
      <div className="cr-filtros">
        <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar por nome ou e-mail" />
        <select value={canal} onChange={(e) => setCanal(e.target.value)} aria-label="Canal">
          <option value="">Todos os canais</option>
          {[...new Set([...canais, canal].filter(Boolean))].map((c) => <option key={c} value={c}>{nomeDoCanal(c)}</option>)}
        </select>
        <div className="aa-troca" role="group" aria-label="Quem mostrar">
          <button type="button" className={so === 'todos' ? 'on' : ''} onClick={() => setSo('todos')}>Todos</button>
          <button type="button" className={so === 'cadastrados' ? 'on' : ''} onClick={() => setSo('cadastrados')}>Cadastrados</button>
          <button type="button" className={so === 'nao' ? 'on' : ''} onClick={() => setSo('nao')}>Não cadastrados</button>
        </div>
      </div>
      {falha && <p className="aa-erro">{falha}</p>}
      {!lista ? <p className="aa-vazio">Carregando…</p> : !vistos.length ? <p className="aa-vazio">Ninguém com esse filtro no período.</p> : (
        <ul className="cr-pessoas">
          {vistos.map((p) => {
            const n = degrau(p.passos)
            return (
              <li key={p.visitante}>
                <button type="button" onClick={() => abrir(p.visitante)}>
                  <span className="cr-quem"><b>{quem(p.nome, p.visitante)}</b><small>{p.email ?? [p.dispositivo, p.navegador ? NAVEGADOR[p.navegador] ?? p.navegador : null].filter(Boolean).join(' · ')}</small></span>
                  <Origem canal={p.canal} conteudo={p.conteudo} link={p.link} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} />
                  <span className="cr-degraus" aria-label={`Chegou até: ${n >= 0 ? DEGRAUS[n].nome : 'nada'}`}>
                    {DEGRAUS.map((d, i) => <i key={d.nome} className={i <= n ? 'on' : ''} title={d.nome} />)}
                    <small>{n >= 0 ? DEGRAUS[n].nome : '—'}</small>
                  </span>
                  <span className="cr-quando"><b>{haQuanto(p.ultima_em)}</b><small>{p.visitas > 1 ? `${p.visitas} visitas` : '1 visita'} · {int(p.eventos)} passos</small></span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

// ------------------------------------------------------------------ a ficha de uma pessoa
function Ficha({ sessao, api, visitante, fechar, abrir, nomeDoAnuncio, nomeDoLink }: { sessao: SessaoTeeds; api: ApiCentral; visitante: string; fechar: () => void; abrir: (v: string) => void; nomeDoAnuncio: Map<string, Anuncio>; nomeDoLink: Map<string, string> }) {
  const [f, setF] = useState<FichaDaPessoa | null | undefined>(undefined)
  const [falha, setFalha] = useState<string | null>(null)
  const [tudo, setTudo] = useState(false)
  const painel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let vivo = true; setF(undefined)
    api.pessoa(sessao, visitante).then((x) => vivo && setF(x)).catch((e) => vivo && setFalha((e as Error).message))
    return () => { vivo = false }
  }, [visitante, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    addEventListener('keydown', tecla); painel.current?.focus()
    return () => removeEventListener('keydown', tecla)
  }, [fechar])
  const passos = f?.eventos.map((e) => e.evento) ?? []
  if (f?.conta?.notificacoes) passos.push('notificacoes')
  if (f?.conta && f.conta.minutosNaLive > 0) passos.push('app-live')
  if (f?.lead) passos.push('cadastro')
  if (f?.lead?.questionario) passos.push('respondeu')
  // os eventos agrupados por visita (uma visita começa em cada "entrada")
  const visitas: Array<Array<FichaDaPessoa['eventos'][number]>> = []
  for (const e of f?.eventos ?? []) { if (e.evento === 'entrada' || !visitas.length) visitas.push([]); visitas[visitas.length - 1].push(e) }
  const v = f?.visitante
  return (
    <div className="cr-janela" role="dialog" aria-modal="true" aria-label="Jornada da pessoa" onClick={(e) => { if (e.target === e.currentTarget) fechar() }}>
      <div className="cr-ficha" ref={painel} tabIndex={-1}>
        <header>
          <div>
            <span className="rot">Jornada</span>
            <h3>{f ? quem(f.lead?.nome ?? null, visitante) : 'Carregando…'}</h3>
            {f?.lead && <p>{f.lead.email} · {f.lead.telefone}</p>}
          </div>
          <button type="button" className="cr-fechar" onClick={fechar} aria-label="Fechar">×</button>
        </header>
        {falha && <p className="aa-erro">{falha}</p>}
        {f === null && <p className="aa-vazio">Não achei essa pessoa.</p>}
        {f && v && (
          <>
            <ol className="cr-escada" aria-label="Até onde chegou">
              {/* cada passo aceso só se a pessoa fez aquele passo (não é uma escada: dá para pular a comunidade e ir à live) */}
              {DEGRAUS.map((d) => <li key={d.nome} className={d.passos.some((x) => passos.includes(x)) ? 'on' : ''}><i />{d.nome}</li>)}
            </ol>
            <dl className="cr-numeros cr-dados">
              <div><dt>Chegou por</dt><dd><Origem canal={v.p_canal} conteudo={v.p_conteudo} link={v.p_link} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} /></dd></div>
              {(v.u_canal !== v.p_canal || v.u_link !== v.p_link || v.u_conteudo !== v.p_conteudo) && <div><dt>Voltou por</dt><dd><Origem canal={v.u_canal} conteudo={v.u_conteudo} link={v.u_link} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} /></dd></div>}
              <div><dt>Primeira visita</dt><dd>{quando(v.primeira_em)}</dd></div>
              <div><dt>Visitas</dt><dd>{int(v.visitas)} · {int(v.eventos)} passos</dd></div>
              <div><dt>Aparelho</dt><dd>{[v.dispositivo, v.navegador ? NAVEGADOR[v.navegador] ?? v.navegador : null].filter(Boolean).join(' · ') || '—'}</dd></div>
              {v.p_ref && <div><dt>Veio do site</dt><dd>{v.p_ref}</dd></div>}
              {f.lead && <div><dt>Questionário</dt><dd>{f.lead.questionario ? (f.lead.exCliente ? 'Já foi cliente' : 'Nunca foi cliente') : 'Não respondeu'}</dd></div>}
              {f.conta && <div><dt>Na plataforma</dt><dd>{f.conta.acessos ? `${int(f.conta.acessos)} acessos` : 'conta criada'}{f.conta.minutosNaLive ? ` · ${int(f.conta.minutosNaLive)} min na live` : ''}</dd></div>}
            </dl>
            {f.outros.length > 0 && <p className="aa-nota">O mesmo e-mail também aparece em {f.outros.length === 1 ? 'outro aparelho' : `${f.outros.length} outros aparelhos`}: {f.outros.map((o) => <button key={o} type="button" className="cr-link" onClick={() => abrir(o)}>{`Visitante ${o.slice(-4).toUpperCase()}`}</button>)}</p>}
            <div className="cr-ficha-barra">
              <b>Passo a passo</b>
              <div className="aa-troca" role="group" aria-label="O que mostrar">
                <button type="button" className={!tudo ? 'on' : ''} onClick={() => setTudo(false)}>Só os passos</button>
                <button type="button" className={tudo ? 'on' : ''} onClick={() => setTudo(true)}>Cada clique</button>
              </div>
            </div>
            {visitas.map((lista, i) => (
              <section key={i} className="cr-visita">
                <h4>{i + 1}ª visita · {quando(lista[0].quando)} <Origem canal={lista[0].canal} conteudo={lista[0].conteudo} link={lista[0].link} nomeDoAnuncio={nomeDoAnuncio} nomeDoLink={nomeDoLink} /></h4>
                <ol className="cr-feed compacto">
                  {lista.filter((e) => tudo || !MIUDOS(e.evento)).map((e) => (
                    <li key={e.id} className={GRANDES.has(e.evento) ? 'grande' : MIUDOS(e.evento) ? 'miudo' : ''}><time dateTime={e.quando}>{hora(e.quando)}</time><span className="cr-fez">{frase(e)}</span></li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Links
function Links({ sessao, api, links, setLinks, parceiro }: { sessao: SessaoTeeds; api: ApiCentral; links: LinkDeRastreio[]; setLinks: (l: LinkDeRastreio[]) => void; parceiro: string }) {
  const [nome, setNome] = useState('')
  const [canal, setCanal] = useState<string>('telegram')
  const [para, setPara] = useState(parceiro || 'n')
  const [codigo, setCodigo] = useState('')
  const [mexeuNoCodigo, setMexeuNoCodigo] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [falha, setFalha] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  const [arquivados, setArquivados] = useState(false)
  const cod = mexeuNoCodigo ? codigo : codigoDoNome(nome)
  const recarregar = () => api.links(sessao).then(setLinks).catch((e) => setFalha((e as Error).message))
  useEffect(() => { void recarregar() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const copiar = (url: string) => { void navigator.clipboard?.writeText(url).then(() => { setCopiado(url); setTimeout(() => setCopiado(null), 1600) }) }
  const criar = async (ev: React.FormEvent) => {
    ev.preventDefault(); setFalha(null)
    if (nome.trim().length < 2) { setFalha('Dê um nome ao link (por exemplo: Telegram, canal do Naor, 04/11).'); return }
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(cod)) { setFalha('O código só pode ter letras minúsculas, números e hífen.'); return }
    setOcupado(true)
    try {
      const novo = await api.criarLink(sessao, para, nome.trim(), canal, cod)
      setLinks([novo, ...links]); setNome(''); setCodigo(''); setMexeuNoCodigo(false)
      copiar(enderecoDoLink(novo.parceiro, novo.codigo))
    } catch (e) { setFalha((e as Error).message) } finally { setOcupado(false) }
  }
  const vistos = links.filter((l) => l.arquivado === arquivados)
  return (
    <>
      <section className="aa-cartao">
        <header><div><span className="rot">Novo link</span><h3>Um link para cada divulgação</h3></div></header>
        <p className="aa-nota">Crie um link para cada lugar onde você divulga (o canal do Telegram, cada stories, o grupo do WhatsApp, a bio). Ele abre a página de cadastro normal, e a central passa a saber quem veio por ele, até a live.</p>
        <form className="cr-form" onSubmit={(e) => void criar(e)}>
          <label><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Telegram, canal do Naor, 04/11" maxLength={80} /></label>
          <label><span>Canal</span>
            <select value={canal} onChange={(e) => setCanal(e.target.value)}>{CANAIS_DE_LINK.map((c) => <option key={c} value={c}>{nomeDoCanal(c)}</option>)}</select>
          </label>
          <label><span>Página</span>
            <select value={para} onChange={(e) => setPara(e.target.value)}><option value="n">Naor /n</option><option value="v">Victor /v</option></select>
          </label>
          <label><span>Código</span><input value={cod} onChange={(e) => { setMexeuNoCodigo(true); setCodigo(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')) }} placeholder="telegram-0411" maxLength={40} /></label>{/* texto-ok: o código do link é sempre minúsculo */}
          <div className="cr-form-fim">
            <code>{enderecoDoLink(para, cod || 'codigo')}</code>
            <button type="submit" className="cr-principal" disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar e copiar'}</button>
          </div>
        </form>
        {falha && <p className="aa-erro">{falha}</p>}
      </section>

      <section className="aa-cartao">
        <header>
          <div><span className="rot">Seus links</span><h3>{arquivados ? 'Arquivados' : `${int(vistos.length)} ${vistos.length === 1 ? 'link ativo' : 'links ativos'}`}</h3></div>
          <div className="aa-troca" role="group" aria-label="Quais mostrar">
            <button type="button" className={!arquivados ? 'on' : ''} onClick={() => setArquivados(false)}>Ativos</button>
            <button type="button" className={arquivados ? 'on' : ''} onClick={() => setArquivados(true)}>Arquivados</button>
          </div>
        </header>
        {!vistos.length ? <p className="aa-vazio">{arquivados ? 'Nenhum link arquivado.' : 'Nenhum link ainda. Crie o primeiro acima.'}</p> : (
          <ul className="cr-links">
            {vistos.map((l) => {
              const url = enderecoDoLink(l.parceiro, l.codigo)
              return (
                <li key={l.id}>
                  <div className="cr-link-texto"><b>{l.nome}</b><small>{nomeDoCanal(l.canal)} · {l.parceiro ? `/${l.parceiro}` : 'sem parceiro'} · criado {quando(l.criado_em)}</small><code title={url}>{url.replace(/^https:\/\//, '')}</code></div>
                  <div className="cr-link-num"><span><b>{int(l.visitantes)}</b><small>visitantes</small></span><span><b>{int(l.cadastros)}</b><small>cadastros</small></span><span><b>{l.visitantes >= 10 ? pc(razao(l.cadastros, l.visitantes) * 100) : '—'}</b><small>conversão</small></span></div>
                  <div className="cr-link-acoes">
                    <button type="button" className={copiado === url ? 'ok' : 'cr-principal'} onClick={() => copiar(url)}>{copiado === url ? 'Copiado' : 'Copiar'}</button>
                    <button type="button" onClick={() => void api.arquivarLink(sessao, l.id, !l.arquivado).then(recarregar).catch((e) => setFalha((e as Error).message))}>{l.arquivado ? 'Reativar' : 'Arquivar'}</button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="aa-nota">Arquivar só tira o link desta lista: quem clicar nele continua chegando na página e sendo contado.</p>
      </section>
    </>
  )
}
