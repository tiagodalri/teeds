/**
 * Administração › Anúncios (02/11/2026, Tiago: "um dash mega completo dessa integração do Meta
 * Ads... acompanhar os números, cada detalhe, a performance de cada anúncio em detalhes...
 * inclusive os rastreios dos eventos do pixel").
 *
 * No topo, o funil 3D ao vivo (Funil3D). Embaixo: os números do período, o dia a dia, cada
 * anúncio (com criativo, rankings e o que ele trouxe de verdade para a plataforma), campanhas
 * e conjuntos, quem viu (idade, gênero, posicionamento, aparelho, estado) e o pixel.
 * A Meta vem da função meta-ads; o que aconteceu depois do clique vem do nosso banco
 * (teeds_meta_funil), que a Meta não enxerga. O cadastro de cada anúncio é ligado a ele pela
 * marcação utm_content={{ad.id}} no link do anúncio.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import { MARCA } from '../../marca'
import { API_DO_BANCO, CONTAS_DE_ANUNCIO, type ApiAnuncios, type Anuncio, type DetalheDoAnuncio, type FunilDoBanco, type Horarios as DadosDeHorario, type Metricas, type PainelDaMeta, type Quebra, type RespostaDaMeta } from '../../core/teeds/anuncios'
import { Alertas, Custos, Filtros, Horarios, METRICA, Relatorio, alertas, aplicar, formatar, somarLinhas, useColunas, type Base, type Linha, type Regra } from './Indicadores'
import { Funil3D, type EtapaDoFunil } from './Funil3D'
import './admin-anuncios.css'

const brl = (v: number, casas = 2) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: casas, maximumFractionDigits: casas })
const int = (v: number) => Math.round(v).toLocaleString('pt-BR')
const dec = (v: number, c = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: c, maximumFractionDigits: c })
const pc = (v: number, c = 2) => `${dec(v, c)}%`
const razao = (a: number, b: number) => (b > 0 ? a / b : 0)
const custo = (gasto: number, n: number) => (n > 0 ? brl(gasto / n) : '—')
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const diasAtras = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d) }
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const hora = (s: string) => new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const PERIODOS = [
  { id: 'hoje', nome: 'Hoje', de: () => iso(new Date()), ate: () => iso(new Date()) },
  { id: 'ontem', nome: 'Ontem', de: () => diasAtras(1), ate: () => diasAtras(1) },
  { id: '7', nome: '7 dias', de: () => diasAtras(6), ate: () => iso(new Date()) },
  { id: '14', nome: '14 dias', de: () => diasAtras(13), ate: () => iso(new Date()) },
  { id: '30', nome: '30 dias', de: () => diasAtras(29), ate: () => iso(new Date()) },
  { id: 'lancamento', nome: 'Lançamento', de: () => '2026-11-02', ate: () => iso(new Date()) },
  { id: 'personalizado', nome: 'Escolher datas', de: () => diasAtras(6), ate: () => iso(new Date()) },
] as const
/** O período anterior, do mesmo tamanho, logo antes (para as comparações). */
const anteriorA = (de: string, ate: string) => {
  const d0 = new Date(`${de}T12:00:00`), d1 = new Date(`${ate}T12:00:00`), dias = Math.round((+d1 - +d0) / 864e5) + 1
  const fim = new Date(d0); fim.setDate(fim.getDate() - 1)
  const ini = new Date(fim); ini.setDate(ini.getDate() - (dias - 1))
  return { de: iso(ini), ate: iso(fim) }
}
const dataBr = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
type IdPeriodo = (typeof PERIODOS)[number]['id']

const STATUS: Record<string, [string, string]> = {
  ACTIVE: ['No ar', 'ok'], PAUSED: ['Pausado', 'pausa'], CAMPAIGN_PAUSED: ['Campanha pausada', 'pausa'], ADSET_PAUSED: ['Conjunto pausado', 'pausa'],
  IN_PROCESS: ['Processando', 'aviso'], PENDING_REVIEW: ['Em análise', 'aviso'], DISAPPROVED: ['Reprovado', 'erro'], WITH_ISSUES: ['Com problema', 'erro'],
  PREAPPROVED: ['Pré-aprovado', 'aviso'], PENDING_BILLING_INFO: ['Falta pagamento', 'erro'], ARCHIVED: ['Arquivado', 'pausa'], DELETED: ['Apagado', 'pausa'],
}
const Status = ({ s }: { s: string }) => { const [nome, tipo] = STATUS[s] ?? [s.toLowerCase().replace(/_/g, ' '), 'pausa']; return <span className={`aa-status ${tipo}`}>{nome}</span> }
const RANK: Record<string, [string, string]> = { acima: ['Acima da média', 'ok'], media: ['Na média', 'media'], abaixo35: ['Abaixo (35% piores)', 'aviso'], abaixo20: ['Abaixo (20% piores)', 'erro'], abaixo10: ['Abaixo (10% piores)', 'erro'] }
const OTIMIZA: Record<string, string> = { OFFSITE_CONVERSIONS: 'Conversões no site', LANDING_PAGE_VIEWS: 'Visualizações da página', LINK_CLICKS: 'Cliques no link', REACH: 'Alcance', IMPRESSIONS: 'Impressões', THRUPLAY: 'Visualizações de vídeo', LEAD_GENERATION: 'Cadastros no Facebook', VALUE: 'Valor' }
const OBJETIVO: Record<string, string> = { OUTCOME_LEADS: 'Cadastros', OUTCOME_SALES: 'Vendas', OUTCOME_TRAFFIC: 'Tráfego', OUTCOME_ENGAGEMENT: 'Engajamento', OUTCOME_AWARENESS: 'Reconhecimento', OUTCOME_APP_PROMOTION: 'App' }
const PLATAFORMA: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', audience_network: 'Audience Network', messenger: 'Messenger', threads: 'Threads' }
const POSICAO: Record<string, string> = { feed: 'Feed', story: 'Stories', facebook_reels: 'Reels', instagram_reels: 'Reels', instagram_stories: 'Stories', facebook_stories: 'Stories', instagram_explore: 'Explorar', instagram_explore_grid_home: 'Explorar (início)', video_feeds: 'Vídeos', marketplace: 'Marketplace', search: 'Busca', right_hand_column: 'Coluna direita', instream_video: 'No meio do vídeo', an_classic: 'Apps e sites', rewarded_video: 'Vídeo premiado', facebook_reels_overlay: 'Reels (sobreposto)', profile_feed: 'Feed do perfil', instagram_profile_feed: 'Feed do perfil', notification: 'Notificações' }
const BOTAO: Record<string, string> = { SIGN_UP: 'Cadastre-se', LEARN_MORE: 'Saiba mais', SUBSCRIBE: 'Assinar', APPLY_NOW: 'Inscreva-se', REGISTER_NOW: 'Inscreva-se', WATCH_MORE: 'Assistir', GET_OFFER: 'Ver oferta', CONTACT_US: 'Fale conosco', SEND_WHATSAPP_MESSAGE: 'Enviar mensagem', DOWNLOAD: 'Baixar', BOOK_TRAVEL: 'Reservar', SHOP_NOW: 'Comprar', NO_BUTTON: 'Sem botão' }
const APARELHO: Record<string, string> = { mobile_app: 'Celular (app)', mobile_web: 'Celular (navegador)', desktop: 'Computador' }

// os eventos do nosso funil, com o nome que a gente usa (o pixel também recebe os do quiz da Universidade Trading)
const EVENTOS: Record<string, string> = {
  PageView: 'Visitas às páginas', ViewContent: 'Viu o formulário ou uma tela', ClicouCadastrar: 'Clicou em cadastrar', ComecouCadastro: 'Começou a preencher',
  Lead: 'Cadastro enviado', CompleteRegistration: 'Inscrição concluída', RespondeuQuestionario: 'Respondeu o questionário', Contact: 'Entrou na comunidade',
  Schedule: 'Pôs a live na agenda', AtivouNotificacoes: 'Ativou as notificações', BaixouApp: 'Baixou o app', EntrouNaPlataforma: 'Entrou na plataforma',
  Entrou: 'Entrou logado', AssistiuLive: 'Assistiu à live', AcessoLiberado: 'Acesso liberado',
}

const gancho = (m: Metricas) => razao(m.video3s, m.impressoes) * 100
const retencao = (m: Metricas) => razao(m.thruplay, m.video3s) * 100

/** O gráfico do dia a dia: barras do investimento, linhas dos cadastros. */
function GraficoDoDia({ dias }: { dias: Array<{ dia: string; gasto: number; meta: number; nosso: number }> }) {
  const [foco, setFoco] = useState<number | null>(null)
  // o desenho tem a largura real da caixa: o texto dos eixos fica sempre do mesmo tamanho
  const caixa = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(720)
  useEffect(() => {
    const el = caixa.current; if (!el) return
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))))
    ro.observe(el); return () => ro.disconnect()
  }, [])
  if (!dias.length) return <p className="aa-vazio">Sem números neste período.</p>
  const H = W < 500 ? 200 : 240, esq = 64, dir = 40, cima = 14, baixo = 26
  const largura = W - esq - dir, altura = H - cima - baixo
  const maxG = Math.max(1, ...dias.map((d) => d.gasto)), maxC = Math.max(1, ...dias.map((d) => Math.max(d.meta, d.nosso)))
  const passo = largura / dias.length, barra = Math.max(4, Math.min(34, passo * 0.56))
  const xg = (i: number) => esq + passo * i + passo / 2
  const yg = (v: number) => cima + altura - (v / maxG) * altura
  const yc = (v: number) => cima + altura - (v / maxC) * altura
  const linha = (k: 'meta' | 'nosso') => dias.map((d, i) => `${i ? 'L' : 'M'}${xg(i).toFixed(1)},${yc(d[k]).toFixed(1)}`).join('')
  const marcas = [0, 0.5, 1]
  const cadaQuantos = Math.ceil(dias.length / 10)
  const f = foco != null ? dias[foco] : null
  return (
    <div className="aa-grafico" ref={caixa}>
      <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Investimento e cadastros por dia" onMouseLeave={() => setFoco(null)}>
        {marcas.map((k) => (
          <g key={k}>
            <line x1={esq} x2={W - dir} y1={cima + altura * (1 - k)} y2={cima + altura * (1 - k)} className="aa-g-grade" />
            <text x={esq - 8} y={cima + altura * (1 - k) + 4} textAnchor="end" className="aa-g-eixo">{brl(maxG * k, 0)}</text>
            <text x={W - dir + 8} y={cima + altura * (1 - k) + 4} className="aa-g-eixo">{int(maxC * k)}</text>
          </g>
        ))}
        {dias.map((d, i) => (
          <g key={d.dia} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
            <rect x={esq + passo * i} y={cima} width={passo} height={altura} fill="transparent" />
            <rect x={xg(i) - barra / 2} y={yg(d.gasto)} width={barra} height={Math.max(0, cima + altura - yg(d.gasto))} rx={3} className={`aa-g-barra ${foco === i ? 'on' : ''}`} />
            {i % cadaQuantos === 0 && <text x={xg(i)} y={H - 8} textAnchor="middle" className="aa-g-eixo">{ddmm(d.dia)}</text>}
          </g>
        ))}
        <path d={linha('meta')} className="aa-g-linha meta" />
        <path d={linha('nosso')} className="aa-g-linha nosso" />
        {dias.map((d, i) => <circle key={d.dia} cx={xg(i)} cy={yc(d.nosso)} r={foco === i ? 4.5 : 3} className="aa-g-ponto" />)}
      </svg>
      <div className="aa-g-legenda">
        <span><i className="barra" />Investido</span><span><i className="nosso" />Cadastros na plataforma</span><span><i className="meta" />Cadastros que a Meta contou</span>
        {f && <b>{ddmm(f.dia)}: {brl(f.gasto)} · {int(f.nosso)} na plataforma · {int(f.meta)} pela Meta · {custo(f.gasto, f.nosso)} cada</b>}
      </div>
    </div>
  )
}

/** Barras horizontais de uma quebra (idade, posicionamento, aparelho, estado). */
function Barras({ titulo, linhas, nome }: { titulo: string; linhas: Quebra[]; nome: (q: Quebra) => string }) {
  const juntas = new Map<string, { gasto: number; impressoes: number; cliquesLink: number; cadastros: number }>()
  for (const q of linhas) {
    const k = nome(q), j = juntas.get(k) ?? { gasto: 0, impressoes: 0, cliquesLink: 0, cadastros: 0 }
    j.gasto += q.gasto; j.impressoes += q.impressoes; j.cliquesLink += q.cliquesLink; j.cadastros += q.cadastros; juntas.set(k, j)
  }
  const lista = [...juntas].sort((a, b) => b[1].gasto - a[1].gasto).slice(0, 8)
  const max = Math.max(1, ...lista.map(([, v]) => v.gasto))
  return (
    <section className="aa-quebra">
      <h4>{titulo}</h4>
      {!lista.length ? <p className="aa-vazio">Sem dados.</p> : (
        <ul>
          {lista.map(([k, v]) => (
            <li key={k}>
              <div><b>{k}</b><span>{brl(v.gasto)} · CTR {pc(razao(v.cliquesLink, v.impressoes) * 100)}{v.cadastros ? ` · ${int(v.cadastros)} cad.` : ''}</span></div>
              <i style={{ width: `${(v.gasto / max) * 100}%` }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** `intervalo`: de quanto em quanto tempo o nosso banco é lido (o laboratório acelera). */
export function AdminAnuncios({ sessao, api = API_DO_BANCO, intervalo = 10_000 }: { sessao: SessaoTeeds; api?: ApiAnuncios; intervalo?: number }) {
  const contas = CONTAS_DE_ANUNCIO[MARCA.id] ?? []
  const [parceiro, setParceiro] = useState(contas[0]?.codigo ?? '')
  const [periodo, setPeriodo] = useState<IdPeriodo>('lancamento')
  const [meta, setMeta] = useState<RespostaDaMeta | null>(null)
  const [funil, setFunil] = useState<FunilDoBanco | null>(null)
  const [aoVivo, setAoVivo] = useState<{ total: Metricas; em: string } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [origem, setOrigem] = useState<'todos' | 'anuncios'>('todos')
  const [campanha, setCampanha] = useState('')
  const [ordem, setOrdem] = useState<{ col: string; desc: boolean }>({ col: 'gasto', desc: true })
  const [conjunto, setConjunto] = useState('')
  const [busca, setBusca] = useState('')
  const [atalhos, setAtalhos] = useState<string[]>([])
  const [regras, setRegras] = useState<Regra[]>([])
  const [colunas, setColunas] = useColunas()
  const [relatorio, setRelatorio] = useState(false)
  const [escolha, setEscolha] = useState({ de: diasAtras(6), ate: iso(new Date()) })
  const [anterior, setAnterior] = useState<Base | null>(null)
  const [horarios, setHorarios] = useState<DadosDeHorario | null>(null)
  const [aberto, setAberto] = useState<Anuncio | null>(null)
  const [chave, setChave] = useState('')
  const [salvando, setSalvando] = useState<{ ok?: string; erro?: string; indo?: boolean }>({})
  const [banco, setBanco] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const p = PERIODOS.find((x) => x.id === periodo)!
  const de = periodo === 'personalizado' ? escolha.de : p.de(), ate = periodo === 'personalizado' ? escolha.ate : p.ate()
  const nomeDoPeriodo = de === ate ? dataBr(de) : `${dataBr(de)} a ${dataBr(ate)}`

  const carregar = async (forcar = false) => {
    if (!parceiro) return
    setCarregando(true); setErro(null)
    const [m, f] = await Promise.allSettled([api.painel(sessao, parceiro, de, ate, forcar), api.funil(sessao, parceiro, de, ate)])
    if (m.status === 'fulfilled') { setMeta(m.value); setAoVivo(null) } else setErro(m.reason?.message ?? 'Não consegui falar com a Meta agora.')
    if (f.status === 'fulfilled') { setFunil(f.value); setBanco(new Date().toISOString()) } else setErro((e) => e ?? f.reason?.message)
    setCarregando(false)
    // o período anterior e os horários vêm depois, sem segurar a tela
    const ant = anteriorA(de, ate)
    void Promise.allSettled([api.resumo(sessao, parceiro, ant.de, ant.ate), api.funil(sessao, parceiro, ant.de, ant.ate), api.horarios(sessao, parceiro, de, ate)]).then(([r, fa, h]) => {
      const fun = fa.status === 'fulfilled' ? fa.value : null
      setAnterior({ meta: r.status === 'fulfilled' && 'total' in r.value ? r.value.total : null, banco: fun ? (origemRef.current === 'anuncios' ? fun.anuncio : fun.total) : null, comecou: fun?.passos?.comecou ?? null })
      anteriorBruto.current = fun
      if (h.status === 'fulfilled') setHorarios(h.value)
    })
  }
  const origemRef = useRef(origem); origemRef.current = origem
  const anteriorBruto = useRef<FunilDoBanco | null>(null)
  useEffect(() => { setAnterior((a) => (a && anteriorBruto.current ? { ...a, banco: origem === 'anuncios' ? anteriorBruto.current.anuncio : anteriorBruto.current.total } : a)) }, [origem])
  useEffect(() => { setMeta(null); setFunil(null); setAnterior(null); setHorarios(null); void carregar() }, [parceiro, periodo, de, ate, sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps

  // ao vivo: o nosso banco a cada 10 s; a Meta (só o total) a cada 60 s
  const vivo = useRef({ de, ate, parceiro }); vivo.current = { de, ate, parceiro }
  useEffect(() => {
    const t1 = setInterval(() => {
      if (document.hidden) return
      const v = vivo.current
      api.funil(sessao, v.parceiro, v.de, v.ate).then((f) => { setFunil(f); setBanco(new Date().toISOString()) }).catch(() => { /* tenta de novo */ })
    }, intervalo)
    const t2 = setInterval(() => {
      if (document.hidden) return
      const v = vivo.current
      api.resumo(sessao, v.parceiro, v.de, v.ate).then((r) => { if ('total' in r) setAoVivo(r) }).catch(() => { /* idem */ })
    }, 60_000)
    const t3 = setInterval(() => setAgora(Date.now()), 1000)
    return () => { clearInterval(t1); clearInterval(t2); clearInterval(t3) }
  }, [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps

  const painel = meta && 'total' in meta ? meta as PainelDaMeta : null
  const total = aoVivo?.total ?? painel?.total ?? null
  const etapasDoBanco = funil ? (origem === 'anuncios' ? funil.anuncio : funil.total) : null
  const pixelEv = painel && 'eventos' in painel.pixel ? new Map(painel.pixel.eventos.map((e) => [e.nome, e.total])) : null
  const gasto = total?.gasto ?? 0
  const comCusto = origem === 'anuncios' && gasto > 0

  const etapas: EtapaDoFunil[] = [
    { id: 'imp', nome: 'Viram o anúncio', valor: total?.impressoes ?? 0, fonte: 'Meta', custo: total?.impressoes ? gasto / total.impressoes : null },
    { id: 'cli', nome: 'Clicaram no anúncio', valor: total?.cliquesLink ?? 0, fonte: 'Meta', custo: total?.cliquesLink ? gasto / total.cliquesLink : null },
    { id: 'lpv', nome: 'Chegaram na página', valor: total?.lpv ?? 0, fonte: 'Meta', custo: total?.lpv ? gasto / total.lpv : null },
    { id: 'com', nome: 'Começaram o cadastro', valor: funil?.passos?.comecou ?? pixelEv?.get('ComecouCadastro') ?? 0, fonte: 'Plataforma', custo: null },
    { id: 'cad', nome: 'Cadastrados', valor: etapasDoBanco?.cadastros ?? 0, fonte: 'Plataforma', custo: etapasDoBanco?.cadastros ? gasto / etapasDoBanco.cadastros : null },
    { id: 'que', nome: 'Questionário respondido', valor: etapasDoBanco?.questionario ?? 0, fonte: 'Plataforma', custo: etapasDoBanco?.questionario ? gasto / etapasDoBanco.questionario : null },
    { id: 'not', nome: 'Notificações ativadas', valor: etapasDoBanco?.notificacoes ?? 0, fonte: 'Plataforma', custo: etapasDoBanco?.notificacoes ? gasto / etapasDoBanco.notificacoes : null },
    { id: 'liv', nome: 'Assistiram à live', valor: etapasDoBanco?.live ?? 0, fonte: 'Plataforma', custo: etapasDoBanco?.live ? gasto / etapasDoBanco.live : null },
    { id: 'gfm', nome: 'GF Member', valor: etapasDoBanco?.liberados ?? 0, fonte: 'Plataforma', custo: etapasDoBanco?.liberados ? gasto / etapasDoBanco.liberados : null },
  ]

  const nossoPorAnuncio = useMemo(() => new Map((funil?.porAnuncio ?? []).map((a) => [a.id, a])), [funil])
  const linhas: Linha[] = useMemo(() => (painel?.anuncios ?? [])
    .filter((a) => (!campanha || a.campanhaId === campanha) && (!conjunto || a.conjuntoId === conjunto))
    .map((a) => ({ a, real: nossoPorAnuncio.get(a.id) })), [painel, campanha, conjunto, nossoPorAnuncio])
  const filtradas = useMemo(() => {
    const m = METRICA.get(ordem.col)
    const v = (l: Linha) => { const x = m?.valor(l); return x == null || !Number.isFinite(x) ? (ordem.desc ? -Infinity : Infinity) : x }
    return aplicar(linhas, busca, atalhos, regras).sort((x, y) => (ordem.desc ? v(y) - v(x) : v(x) - v(y)))
  }, [linhas, busca, atalhos, regras, ordem])
  const somaFiltrada = useMemo(() => (filtradas.length > 1 ? somarLinhas(filtradas) : null), [filtradas])
  const listaDeAlertas = useMemo(() => alertas(linhas, total, etapasDoBanco, anterior), [linhas, total, etapasDoBanco, anterior])
  const dias = useMemo(() => {
    const mapa = new Map<string, { dia: string; gasto: number; meta: number; nosso: number }>()
    for (let d = new Date(`${de}T12:00:00`); iso(d) <= ate; d.setDate(d.getDate() + 1)) mapa.set(iso(d), { dia: iso(d), gasto: 0, meta: 0, nosso: 0 })
    for (const d of painel?.porDia ?? []) { const x = mapa.get(d.dia); if (x) { x.gasto = d.gasto; x.meta = d.cadastros } }
    for (const d of funil?.porDia ?? []) { const x = mapa.get(d.dia); if (x) x.nosso = origem === 'anuncios' ? d.deAnuncio : d.cadastros }
    return [...mapa.values()]
  }, [painel, funil, de, ate, origem])

  const salvarChave = async (valor: string) => {
    setSalvando({ indo: true })
    try { await api.salvarChave(sessao, parceiro, valor); setChave(''); setSalvando({ ok: valor ? 'Conta conectada. Buscando os números…' : 'Chave removida.' }); void carregar(true) }
    catch (e) { setSalvando({ erro: (e as Error).message }) }
  }

  const nomeParceiro = contas.find((c) => c.codigo === parceiro)?.nome ?? ''
  const semChave = meta != null && 'semChave' in meta
  const chaveRuim = meta != null && 'chaveInvalida' in meta
  const atualizado = banco ? Math.max(0, Math.round((agora - Date.parse(banco)) / 1000)) : null
  const campanhaDe = (id: string) => painel?.campanhas.find((c) => c.id === id)?.nome ?? ''
  const cabecalho = (id: string) => {
    const m = METRICA.get(id)!
    return <th key={id} className="num"><button type="button" title={m.dica ?? m.nome} className={ordem.col === id ? 'on' : ''} onClick={() => setOrdem((o) => ({ col: id, desc: o.col === id ? !o.desc : !m.menorMelhor }))}>{m.curto}{ordem.col === id ? (ordem.desc ? ' ↓' : ' ↑') : ''}</button></th>
  }

  if (!contas.length) return <p className="aa-vazio">Nenhum parceiro desta plataforma tem conta de anúncios ligada.</p>

  return (
    <div className="aa">
      <div className="aa-topo">
        <div className="aa-conta">
          {contas.length > 1 && <select value={parceiro} onChange={(e) => setParceiro(e.target.value)} aria-label="Conta de anúncios">{contas.map((c) => <option key={c.codigo} value={c.codigo}>{c.nome}</option>)}</select>}
          <div><small>Conta de anúncios do {nomeParceiro}</small><b>{painel?.conta.nome || `Conta ${contas.find((c) => c.codigo === parceiro)?.conta}`}</b></div>
          {painel && <span className={`aa-status ${painel.conta.status === 1 ? 'ok' : 'erro'}`}>{painel.conta.status === 1 ? 'Conta ativa' : 'Conta com restrição'}</span>}
        </div>
        <div className="aa-periodo" role="tablist" aria-label="Período">
          {PERIODOS.map((x) => <button key={x.id} type="button" role="tab" aria-selected={periodo === x.id} className={periodo === x.id ? 'on' : ''} onClick={() => setPeriodo(x.id)}>{x.nome}</button>)}
        </div>
        {periodo === 'personalizado' && (
          <div className="aa-datas">
            <label>De <input type="date" value={escolha.de} max={escolha.ate} onChange={(e) => e.target.value && setEscolha((x) => ({ ...x, de: e.target.value }))} /></label>
            <label>Até <input type="date" value={escolha.ate} min={escolha.de} max={iso(new Date())} onChange={(e) => e.target.value && setEscolha((x) => ({ ...x, ate: e.target.value }))} /></label>
          </div>
        )}
        <button type="button" className="aa-atualizar" onClick={() => setRelatorio(true)}>Relatório</button>
        <button type="button" className="aa-atualizar" onClick={() => void carregar(true)} disabled={carregando}>{carregando ? 'Atualizando…' : 'Atualizar agora'}</button>
      </div>

      {erro && <div className="aa-erro">{erro}</div>}
      {(semChave || chaveRuim) && (
        <section className="aa-conectar">
          <div>
            <h3>{chaveRuim ? 'A chave da Meta parou de funcionar' : `Conectar a conta de anúncios do ${nomeParceiro}`}</h3>
            <p>{chaveRuim ? 'A Meta recusou a chave guardada (venceu ou foi trocada). Cole uma nova abaixo.' : 'O funil abaixo já mostra o que acontece dentro da plataforma. Para trazer investimento, cliques e cada anúncio, cole aqui a chave de acesso da conta de anúncios. A mesma chave liga também o envio do pixel pelo servidor.'}</p>
            <ol>
              <li>Em <b>business.facebook.com</b>, abrir <b>Configurações do negócio › Usuários do sistema</b> e criar um usuário (Administrador).</li>
              <li><b>Atribuir ativos</b>: a conta <b>CA - NAOR BEZERRA</b> (controle total) e o pixel <b>PIXEL - NAOR BEZERRA OFICIAL</b>.</li>
              <li><b>Gerar novo token</b>, validade <b>Nunca</b>, com as permissões <b>ads_read</b>, <b>ads_management</b> e <b>business_management</b>.</li>
            </ol>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (chave.trim()) void salvarChave(chave) }}>
            <label htmlFor="aa-chave">Chave de acesso da Meta</label>
            <input id="aa-chave" type="password" autoComplete="off" spellCheck={false} value={chave} onChange={(e) => setChave(e.target.value)} placeholder="Cole a chave que começa com EA" />
            <button type="submit" disabled={salvando.indo || !chave.trim()}>{salvando.indo ? 'Conectando…' : 'Conectar'}</button>
            {salvando.erro && <p className="aa-erro">{salvando.erro}</p>}
            {salvando.ok && <p className="aa-ok">{salvando.ok}</p>}
            <small>A chave fica guardada no servidor e não aparece de novo nem para quem salvou.</small>
          </form>
        </section>
      )}

      <section className="aa-cartao aa-funil">
        <header>
          <div><span className="rot">Ao vivo</span><h3>Funil do lançamento</h3></div>
          <div className="aa-funil-acoes">
            <span className="aa-vivo"><i />{atualizado == null ? 'Conectando…' : atualizado < 5 ? 'Atualizado agora' : `Atualizado há ${atualizado} s`}</span>
            <div className="aa-troca" role="group" aria-label="De onde vieram os cadastros">
              <button type="button" className={origem === 'todos' ? 'on' : ''} onClick={() => setOrigem('todos')}>Todo o /{parceiro}</button>
              <button type="button" className={origem === 'anuncios' ? 'on' : ''} onClick={() => setOrigem('anuncios')}>Só anúncios</button>
            </div>
          </div>
        </header>
        <Funil3D etapas={etapas} mostrarCusto={comCusto} />
        <p className="aa-nota">As três primeiras etapas vêm da Meta (a cada minuto) e o resto vem da plataforma, a cada 10 segundos. {origem === 'anuncios' ? 'Só anúncios: contam os cadastros que chegaram por um anúncio da Meta.' : `Todo o /${parceiro}: todos os cadastros da página, de anúncio ou não.`}</p>
      </section>

      {total && (
        <div className="aa-kpis">
          <div><small>Investido</small><b>{brl(total.gasto)}</b><span>{painel ? `${int(total.impressoes)} impressões` : ''}</span></div>
          <div className="destaque"><small>Cadastros na plataforma</small><b>{int(funil?.anuncio.cadastros ?? 0)}</b><span>vindos de anúncio · a Meta contou {int(total.cadastros)}</span></div>
          <div className="destaque"><small>Custo por cadastro</small><b>{custo(total.gasto, funil?.anuncio.cadastros ?? 0)}</b><span>pela Meta: {custo(total.gasto, total.cadastros)}</span></div>
          <div><small>Custo por GF Member</small><b>{custo(total.gasto, funil?.anuncio.liberados ?? 0)}</b><span>{int(funil?.anuncio.liberados ?? 0)} liberados vindos de anúncio</span></div>
          <div><small>CPM</small><b>{brl(total.cpm)}</b><span>mil impressões</span></div>
          <div><small>CTR no link</small><b>{pc(total.ctrLink)}</b><span>{int(total.cliquesLink)} cliques</span></div>
          <div><small>Custo por clique</small><b>{brl(total.cpcLink)}</b><span>no link</span></div>
          <div><small>Alcance</small><b>{int(total.alcance)}</b><span>frequência {dec(total.frequencia)}</span></div>
          <div><small>Página carregou</small><b>{pc(razao(total.lpv, total.cliquesLink) * 100, 1)}</b><span>{int(total.lpv)} de {int(total.cliquesLink)} cliques</span></div>
          <div><small>Página → cadastro</small><b>{pc(razao(funil?.anuncio.cadastros ?? 0, total.lpv) * 100, 1)}</b><span>de quem chegou pelo anúncio</span></div>
        </div>
      )}

      <section className="aa-cartao">
        <header><div><span className="rot">Indicadores de custo · comparados com {anteriorA(de, ate).de === anteriorA(de, ate).ate ? dataBr(anteriorA(de, ate).de) : `${dataBr(anteriorA(de, ate).de)} a ${dataBr(anteriorA(de, ate).ate)}`}</span><h3>Quanto custa cada passo</h3></div></header>
        <Custos atual={{ meta: total, banco: etapasDoBanco, comecou: funil?.passos?.comecou ?? null }} anterior={anterior} origem={origem} />
      </section>

      <section className="aa-cartao">
        <header><div><span className="rot">Indicadores inteligentes</span><h3>O que merece atenção</h3></div></header>
        <Alertas lista={listaDeAlertas} />
      </section>

      {painel && (
        <>
          <section className="aa-cartao">
            <header><div><span className="rot">Dia a dia</span><h3>Investimento e cadastros</h3></div></header>
            <GraficoDoDia dias={dias} />
          </section>

          <section className="aa-cartao">
            <header><div><span className="rot">Quando as pessoas se cadastram</span><h3>Melhores horários</h3></div></header>
            <Horarios dados={horarios} origem={origem} />
          </section>

          <section className="aa-cartao">
            <header>
              <div><span className="rot">{int(filtradas.length)} de {int(linhas.length)} {linhas.length === 1 ? 'anúncio' : 'anúncios'}</span><h3>Cada anúncio</h3></div>
              <div className="aa-selects">
                <select value={campanha} onChange={(e) => { setCampanha(e.target.value); setConjunto('') }} aria-label="Campanha">
                  <option value="">Todas as campanhas</option>
                  {painel.campanhas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <select value={conjunto} onChange={(e) => setConjunto(e.target.value)} aria-label="Conjunto de anúncios">
                  <option value="">Todos os conjuntos</option>
                  {painel.conjuntos.filter((c) => !campanha || c.campanhaId === campanha).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </header>
            <Filtros linhas={linhas} busca={busca} setBusca={setBusca} atalhos={atalhos} setAtalhos={setAtalhos} regras={regras} setRegras={setRegras} colunas={colunas} setColunas={setColunas} />
            {!filtradas.length ? <p className="aa-vazio">{linhas.length ? 'Nenhum anúncio passa por esses filtros.' : 'Nenhum anúncio com entrega neste período.'}</p> : (
              <div className="aa-tabela">
                <table>
                  <thead><tr><th>Anúncio</th>{colunas.map(cabecalho)}<th>Qualidade</th></tr></thead>
                  <tbody>
                    {filtradas.map((l) => (
                      <tr key={l.a.id} onClick={() => setAberto(l.a)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setAberto(l.a) }}>
                        <td className="aa-ad">
                          {l.a.criativo.miniatura ? <img src={l.a.criativo.miniatura} alt="" loading="lazy" /> : <span className="aa-sem-img" />}
                          <div><b>{l.a.nome}</b><small>{campanhaDe(l.a.campanhaId)}</small><Status s={l.a.status} /></div>
                        </td>
                        {colunas.map((id) => { const m = METRICA.get(id)!; return <td key={id} className={`num ${ordem.col === id ? 'aa-ordem' : ''}`}>{formatar(m.formato, m.valor(l))}</td> })}
                        <td>{l.a.ranking.qualidade ? <span className={`aa-rank ${RANK[l.a.ranking.qualidade]?.[1]}`}>{RANK[l.a.ranking.qualidade]?.[0]}</span> : <small className="aa-mudo">Poucos dados</small>}</td>
                      </tr>
                    ))}
                  </tbody>
                  {somaFiltrada && (
                    <tfoot><tr><td>Total dos {int(filtradas.length)} filtrados</td>{colunas.map((id) => {
                      const m = METRICA.get(id)!
                      return <td key={id} className="num">{id === 'frequencia' || id === 'alcance' ? '—' : formatar(m.formato, m.valor(somaFiltrada))}</td>
                    })}<td /></tr></tfoot>
                  )}
                </table>
              </div>
            )}
          </section>

          <section className="aa-cartao">
            <header><div><span className="rot">Estrutura</span><h3>Campanhas e conjuntos</h3></div></header>
            {!painel.campanhas.length ? <p className="aa-vazio">Nenhuma campanha neste período.</p> : (
              <div className="aa-tabela">
                <table>
                  <thead><tr><th>Campanha / conjunto</th><th>Orçamento</th><th>Otimiza para</th><th className="num">Investido</th><th className="num">Impressões</th><th className="num">CTR</th><th className="num">Cadastros (Meta)</th><th className="num">Custo/cad.</th></tr></thead>
                  <tbody>
                    {painel.campanhas.map((c) => (
                      <FragmentoCampanha key={c.id} c={c} conjuntos={painel.conjuntos.filter((s) => s.campanhaId === c.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="aa-cartao">
            <header><div><span className="rot">Quem viu</span><h3>Público e posicionamentos</h3></div></header>
            <div className="aa-quebras">
              <Barras titulo="Idade e gênero" linhas={painel.quebras.idadeGenero} nome={(q) => `${q.age} · ${q.gender === 'male' ? 'Homens' : q.gender === 'female' ? 'Mulheres' : 'Outros'}`} />
              <Barras titulo="Onde apareceu" linhas={painel.quebras.posicionamento} nome={(q) => `${PLATAFORMA[String(q.publisher_platform)] ?? q.publisher_platform} · ${POSICAO[String(q.platform_position)] ?? String(q.platform_position).replace(/_/g, ' ')}`} />
              <Barras titulo="Aparelho" linhas={painel.quebras.aparelho} nome={(q) => APARELHO[String(q.device_platform)] ?? String(q.device_platform)} />
              <Barras titulo="Estados" linhas={painel.quebras.regiao} nome={(q) => String(q.region)} />
            </div>
          </section>
        </>
      )}

      <div className="aa-dupla">
        <section className="aa-cartao">
          <header><div><span className="rot">Pixel {painel?.pixel.id ?? ''}</span><h3>Eventos que a Meta recebeu</h3></div></header>
          {!painel ? <p className="aa-vazio">{semChave ? 'Aparece quando a conta for conectada.' : 'Carregando…'}</p>
            : 'erro' in painel.pixel ? <p className="aa-erro">Não consegui ler o pixel com esta chave: {painel.pixel.erro}</p> : (
              <ul className="aa-eventos">
                {painel.pixel.eventos.map((e) => {
                  const max = Math.max(1, ...('eventos' in painel.pixel ? painel.pixel.eventos.map((x) => x.total) : [1]))
                  return (
                    <li key={e.nome} className={EVENTOS[e.nome] ? '' : 'fora'}>
                      <div><b>{EVENTOS[e.nome] ?? e.nome}</b><small>{EVENTOS[e.nome] ? e.nome : 'de outro site do pixel'}</small></div>
                      <strong>{int(e.total)}</strong>
                      <i style={{ width: `${(e.total / max) * 100}%` }} />
                    </li>
                  )
                })}
                {!painel.pixel.eventos.length && <li className="aa-vazio">Nenhum evento no período.</li>}
              </ul>
            )}
          <p className="aa-nota">Contagem da própria Meta, de todas as páginas que usam este pixel (o quiz da Universidade Trading também). Eventos da plataforma em destaque.</p>
        </section>
        <section className="aa-cartao">
          <header><div><span className="rot">Rastreio</span><h3>Pelo servidor e de onde vieram</h3></div></header>
          <dl className="aa-servidor">
            <div><dt>Conversões enviadas pelo servidor</dt><dd>{int(funil?.servidor.enviados ?? 0)}</dd></div>
            <div><dt>Esperando a chave</dt><dd>{int(funil?.servidor.semChave ?? 0)}</dd></div>
            <div><dt>Recusadas pela Meta</dt><dd className={funil?.servidor.erros ? 'ruim' : ''}>{int(funil?.servidor.erros ?? 0)}</dd></div>
          </dl>
          <h4 className="aa-sub">Cadastros por origem</h4>
          <ul className="aa-origens">
            {(funil?.porOrigem ?? []).map((o) => <li key={o.origem}><span>{o.origem === 'sem origem' ? 'Sem marcação (link direto, orgânico)' : o.origem}</span><b>{int(o.cadastros)}</b></li>)}
            {funil && !funil.porOrigem.length && <li className="aa-vazio">Nenhum cadastro no período.</li>}
          </ul>
        </section>
      </div>

      {painel?.avisos.length ? <p className="aa-nota">Algumas partes não vieram da Meta agora: {painel.avisos.join(' · ')}</p> : null}
      {painel && <p className="aa-nota">Números da Meta de {hora(painel.em)}{painel.doCache ? ' (guardados há menos de 5 minutos)' : ''}. A Meta pode levar até algumas horas para fechar os números do dia.</p>}

      {relatorio && <Relatorio fechar={() => setRelatorio(false)} periodo={nomeDoPeriodo} total={total} banco={etapasDoBanco} linhas={filtradas} colunas={colunas} lista={listaDeAlertas} comecou={funil?.passos?.comecou ?? null} />}
      {aberto && painel && <AnuncioAberto a={aberto} fechar={() => setAberto(null)} sessao={sessao} api={api} parceiro={parceiro} de={de} ate={ate} nosso={nossoPorAnuncio.get(aberto.id)} campanha={campanhaDe(aberto.campanhaId)} conjunto={painel.conjuntos.find((s) => s.id === aberto.conjuntoId)?.nome ?? ''} />}
    </div>
  )
}

function FragmentoCampanha({ c, conjuntos }: { c: PainelDaMeta['campanhas'][number]; conjuntos: PainelDaMeta['conjuntos'] }) {
  const orc = (d: number, t: number) => (d ? `${brl(d, 0)}/dia` : t ? `${brl(t, 0)} no total` : 'No conjunto')
  return (
    <>
      <tr className="aa-camp">
        <td><b>{c.nome}</b><small>{OBJETIVO[c.objetivo] ?? c.objetivo}</small><Status s={c.status} /></td>
        <td>{orc(c.orcDia, c.orcTotal)}</td><td>—</td>
        <td className="num"><b>{brl(c.m.gasto)}</b></td><td className="num">{int(c.m.impressoes)}</td><td className="num">{pc(c.m.ctrLink)}</td>
        <td className="num">{int(c.m.cadastros)}</td><td className="num">{custo(c.m.gasto, c.m.cadastros)}</td>
      </tr>
      {conjuntos.map((s) => (
        <tr key={s.id} className="aa-conj">
          <td><span>{s.nome}</span>{s.publico && <small>{s.publico}</small>}<Status s={s.status} /></td>
          <td>{s.orcDia || s.orcTotal ? orc(s.orcDia, s.orcTotal) : '—'}</td><td>{OTIMIZA[s.otimizacao] ?? s.otimizacao}</td>
          <td className="num">{brl(s.m.gasto)}</td><td className="num">{int(s.m.impressoes)}</td><td className="num">{pc(s.m.ctrLink)}</td>
          <td className="num">{int(s.m.cadastros)}</td><td className="num">{custo(s.m.gasto, s.m.cadastros)}</td>
        </tr>
      ))}
    </>
  )
}

function AnuncioAberto({ a, fechar, sessao, api, parceiro, de, ate, nosso, campanha, conjunto }: {
  a: Anuncio; fechar: () => void; sessao: SessaoTeeds; api: ApiAnuncios; parceiro: string; de: string; ate: string
  nosso?: FunilDoBanco['porAnuncio'][number]; campanha: string; conjunto: string
}) {
  const [det, setDet] = useState<DetalheDoAnuncio | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    api.anuncio(sessao, parceiro, a.id, de, ate).then((d) => vivo && setDet(d)).catch((e) => vivo && setErro((e as Error).message))
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar() }
    window.addEventListener('keydown', esc)
    return () => { vivo = false; window.removeEventListener('keydown', esc) }
  }, [a.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const m = a.m
  const marcado = /utm_content=\{\{ad\.id\}\}/.test(a.criativo.marcacoes)
  const video = [['3 s', m.video3s], ['25%', m.p25], ['50%', m.p50], ['75%', m.p75], ['95%', m.p95], ['100%', m.p100]] as const
  const maxV = Math.max(1, m.video3s)
  const dias = (det?.porDia ?? []).map((d) => ({ dia: d.dia, gasto: d.gasto, meta: d.cadastros, nosso: 0 }))
  return (
    <div className="aa-gaveta-fundo" onMouseDown={fechar}>
      <aside className="aa-gaveta" role="dialog" aria-modal="true" aria-labelledby="aa-gaveta-titulo" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <div><span className="rot">{campanha}{conjunto ? ` › ${conjunto}` : ''}</span><h3 id="aa-gaveta-titulo">{a.nome}</h3><Status s={a.status} /></div>
          <button type="button" onClick={fechar} aria-label="Fechar">×</button>
        </header>
        <div className="aa-criativo">
          {a.criativo.imagem || a.criativo.miniatura ? <img src={a.criativo.imagem || a.criativo.miniatura!} alt="Criativo do anúncio" /> : <span className="aa-sem-img grande" />}
          <div>
            <small>{a.criativo.tipo === 'video' ? 'Vídeo' : a.criativo.tipo === 'carrossel' ? 'Carrossel' : 'Imagem'}{a.criativo.cta ? ` · botão “${BOTAO[a.criativo.cta] ?? a.criativo.cta.replace(/_/g, ' ').toLowerCase()}”` : ''}</small>
            {a.criativo.titulo && <b>{a.criativo.titulo}</b>}
            {a.criativo.texto && <p>{a.criativo.texto}</p>}
            {!marcado && <p className="aa-aviso">Este anúncio não tem a marcação utm_content={'{{ad.id}}'} no link: os cadastros dele não aparecem como “reais” aqui.</p>}
          </div>
        </div>
        <div className="aa-kpis mini">
          <div><small>Investido</small><b>{brl(m.gasto)}</b></div>
          <div><small>Impressões</small><b>{int(m.impressoes)}</b></div>
          <div><small>Alcance</small><b>{int(m.alcance)}</b></div>
          <div><small>Frequência</small><b>{dec(m.frequencia)}</b></div>
          <div><small>CPM</small><b>{m.cpm ? brl(m.cpm) : '—'}</b></div>
          <div><small>CTR no link</small><b>{pc(m.ctrLink)}</b></div>
          <div><small>Custo por clique</small><b>{m.cpcLink ? brl(m.cpcLink) : '—'}</b></div>
          <div><small>Chegaram na página</small><b>{int(m.lpv)}</b></div>
          <div><small>Cadastros (Meta)</small><b>{int(m.cadastros)}</b></div>
          <div className="destaque"><small>Cadastros reais</small><b>{int(nosso?.cadastros ?? 0)}</b></div>
          <div className="destaque"><small>Custo por cadastro</small><b>{custo(m.gasto, nosso?.cadastros ?? 0)}</b></div>
          <div><small>Engajamento</small><b>{int(m.engajamento)}</b></div>
        </div>
        <section>
          <h4>O que esse anúncio trouxe para a plataforma</h4>
          <ol className="aa-trilha">
            {([['Cadastros', nosso?.cadastros], ['Questionário', nosso?.questionario], ['Notificações', nosso?.notificacoes], ['Assistiram à live', nosso?.live], ['GF Member', nosso?.liberados]] as const).map(([nome, v]) => (
              <li key={nome}><b>{int(v ?? 0)}</b><span>{nome}</span></li>
            ))}
          </ol>
        </section>
        {a.criativo.tipo === 'video' && (
          <section>
            <h4>Quanto do vídeo as pessoas assistiram</h4>
            <ul className="aa-video">
              {video.map(([nome, v]) => <li key={nome}><span>{nome}</span><i style={{ width: `${(v / maxV) * 100}%` }} /><b>{int(v)}</b></li>)}
            </ul>
            <p className="aa-nota">Gancho {pc(gancho(m), 1)} das impressões · retenção {pc(retencao(m), 1)} até o fim (ou 15 s).</p>
          </section>
        )}
        <section>
          <h4>Qualidade segundo a Meta</h4>
          <ul className="aa-ranks">
            {([['Qualidade', a.ranking.qualidade], ['Engajamento', a.ranking.engajamento], ['Conversão', a.ranking.conversao]] as const).map(([nome, r]) => (
              <li key={nome}><span>{nome}</span>{r ? <b className={`aa-rank ${RANK[r]?.[1]}`}>{RANK[r]?.[0]}</b> : <small className="aa-mudo">Precisa de 500 impressões</small>}</li>
            ))}
          </ul>
        </section>
        {erro && <p className="aa-erro">{erro}</p>}
        {!det && !erro && <p className="aa-vazio">Carregando o dia a dia…</p>}
        {det && (
          <>
            <section><h4>Dia a dia</h4><GraficoDoDia dias={dias} /></section>
            <div className="aa-quebras dupla">
              <Barras titulo="Idade e gênero" linhas={det.idadeGenero} nome={(q) => `${q.age} · ${q.gender === 'male' ? 'Homens' : q.gender === 'female' ? 'Mulheres' : 'Outros'}`} />
              <Barras titulo="Onde apareceu" linhas={det.posicionamento} nome={(q) => `${PLATAFORMA[String(q.publisher_platform)] ?? q.publisher_platform} · ${POSICAO[String(q.platform_position)] ?? String(q.platform_position).replace(/_/g, ' ')}`} />
            </div>
          </>
        )}
        <p className="aa-nota">Anúncio {a.id} · criado em {new Date(a.criadoEm).toLocaleDateString('pt-BR')}</p>
      </aside>
    </div>
  )
}
