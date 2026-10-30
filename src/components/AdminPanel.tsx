import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { observarTabelas } from '../core/rotulosDeTabela'
import { ChaveModoCeo } from './ChaveModoCeo'
import type { ReactNode } from 'react'
import type { SessaoTeeds } from '../core/teeds/conta'
import {
  atualizarAcessoCliente, clientesPorId, criarAcessoCliente, definirProdutoCliente, idsDoParceiro, listarClientesPagina, listarComissoes, listarContasDeriv, listarMetricasRobos,
  type OrdemClientes,
  listarPlanos, listarProdutos, listarProdutosClientes, salvarProduto,
  definirMarcaAdmin, ehMaster, marcaAdmin, REDE,
  type ClienteProdutoRegistro, type ClienteRegistro, type ComissaoDia, type ContaDerivRegistro, type MetricaRoboRegistro, type PaginaClientes, type PlanoRegistro, type ProdutoRegistro,
} from '../core/teeds/clientes'
import { RelatorioClientes } from './RelatorioClientes'
import { AdminEmails } from './AdminEmails'
import { AdminLeads } from './AdminLeads'
import { AdminPendentes } from './AdminPendentes'
import { AdminPlanos } from './AdminPlanos'
import { Movimentacoes } from './Movimentacoes'
import { AdminAcessos } from './AdminAcessos'
import { AdminAulas } from './AdminAulas'
import { AdminRobos } from './AdminRobos'
import { AdminCentroDeEstudo } from './AdminCentroDeEstudo'
import { SeletorDePlataforma, opcoesDePlataforma } from './SeletorDePlataforma'
import { useMarcaEmFoco } from '../core/teeds/marcaEmFoco'
import { MARCAS } from '../marca/marcas'
import { MARCA } from '../marca'
import { IconeFechar } from './IconeFechar'
import { ExcluirCadastro } from './ExcluirCadastro'
import { Icone, type NomeIcone } from './Icone'
import { AdminParceiros } from './AdminParceiros'
import { souAdminGeral } from '../core/teeds/parceiro'
import { rotuloDoParceiro, SO_DO_ADMIN_GERAL, useMeuPapel, useParceiroEmFoco, useParceirosDaMarca } from '../core/teeds/parceiroEmFoco'
import { PerfilCliente, haQuantoTempo } from './FichaCliente'
import { horasLegiveis } from '../core/teeds/insights'
import { AdminSuporte } from './suporte/AdminSuporte'
import { aguardandoEquipe } from '../core/teeds/suporte'
import { pedirCentral } from '../core/live/treino'
import { hojeISO, orgDoBanco } from '../core/teeds/organizacao'
import { SUPABASE } from '../core/teeds/config'
import { NomeDoRobo } from './NomeDoRobo'
import './admin-base-clientes.css'
const Organizacao = lazy(() => import('./organizacao/Organizacao').then((m) => ({ default: m.Organizacao })))

type Aba = 'organizacao' | 'suporte' | 'emails' | 'estudo' | 'visao' | 'inteligencia' | 'leads' | 'clientes' | 'resultados' | 'movimentacoes' | 'acessos' | 'aulas' | 'planos' | 'produtos' | 'comissoes' | 'robos' | 'parceiros'
const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
const data = (iso?: string | null) => iso ? new Date(iso).toLocaleDateString('pt-BR') : 'Sem vencimento'
/* Na lista, "02/10/2026" responde pouco: o atendimento quer saber a que
   HORAS a pessoa esteve aqui, para cruzar com o que ela está relatando. */
const dataHora = (iso?: string | null) => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '—'
const dataInput = (iso?: string | null) => iso ? iso.slice(0, 10) : ''
const expirou = (c: ClienteRegistro) => !!c.acessoExpiraEm && Date.parse(c.acessoExpiraEm) < Date.now()
const status = (c: ClienteRegistro) => expirou(c) && c.statusAcesso === 'ativo' ? 'expirado' : c.statusAcesso
/** Quantos clientes cabem numa página da aba Clientes. */
const POR_PAGINA = 50
/**
 * Abas que só existem dentro de uma plataforma.
 *
 * Criar acesso, trocar o vídeo de uma aula, ligar um robô, mexer em plano ou
 * produto: tudo isso acontece em UMA marca, com o e-mail, o catálogo e os
 * robôs dela. Na visão da rede não há a quem aplicar — então a aba pede a
 * plataforma em vez de fingir que soma.
 */
const PRECISA_DE_UMA: Aba[] = ['acessos', 'aulas', 'robos', 'planos', 'produtos', 'emails', 'leads', 'parceiros']
/** O que a tela mostra enquanto a primeira página não chegou. */
const PAGINA_VAZIA: PaginaClientes = { total: 0, ativos: 0, expirados: 0, vencendo: 0, ativos24h: 0, acessaram: 0, filtrados: 0, porPlano: {}, pagina: [] }
/*
  A categoria é gravada como chave ("robo", "sala") e a tela a mostrava crua,
  com um `text-transform: capitalize` por cima: "Robo", sem acento. Os nomes
  aqui são os mesmos do seletor do editor de produto.
*/
const CATEGORIAS: Record<string, string> = { robo: 'Robô', mentoria: 'Mentoria', ferramenta: 'Ferramenta', indicador: 'Indicador', sala: 'Sala de sinais' }
const categoriaLegivel = (c: string) => CATEGORIAS[c] ?? (c.charAt(0).toUpperCase() + c.slice(1))
/** Número no formato brasileiro (vírgula decimal): "12,50", nunca "12.50". */
const dec = (v: number, casas = 2) => v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })
const moeda = (centavos: number | null) => centavos == null ? 'Grátis' : (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** "agora", "há 3 min", "há 2 h" — para dizer de quando é uma leitura. */
const haQuanto = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'agora' : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d` }

export function AdminPanel({ sessao, comissoes, onNavigate, mostrarMarkup = false, onMostrarMarkup, abrirSuporte = 0, nomeDaEquipe = '' }: { sessao: SessaoTeeds; comissoes?: ReactNode; onNavigate: (pagina: 'monitoramento' | 'insights' | 'aovivo') => void; mostrarMarkup?: boolean; onMostrarMarkup?: (valor: boolean) => void; abrirSuporte?: number; nomeDaEquipe?: string }) {
  const [aba, setAba] = useState<Aba>(abrirSuporte && MARCA.suporte ? 'suporte' : 'visao')
  // Organização: a central da equipe; o contador do menu mostra as minhas tarefas atrasadas ou para hoje
  const orgApi = useMemo(() => orgDoBanco(sessao), [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  const [minhasPendentes, setMinhasPendentes] = useState(0)
  // Parceiros de divulgação e excluir cadastro: só do admin geral (o banco confere de novo)
  const [souGeral, setSouGeral] = useState(false)
  useEffect(() => { void souAdminGeral(sessao).then(setSouGeral) }, [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let vivo = true
    const contar = () => fetch(`${SUPABASE.url}/rest/v1/org_tarefas?marca=eq.${MARCA.id}&responsavel=eq.${sessao.usuario.id}&status=neq.feito&prazo=lte.${hojeISO()}&select=id`, {
      headers: { apikey: SUPABASE.anonKey, Authorization: `Bearer ${sessao.token}` },
    }).then((r) => (r.ok ? r.json() : [])).then((l: unknown[]) => { if (vivo) setMinhasPendentes(Array.isArray(l) ? l.length : 0) }).catch(() => undefined)
    void contar()
    const t = window.setInterval(contar, 120_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [sessao.token, sessao.usuario.id, aba])
  // o botão flutuante do suporte pede a caixa de entrada (20/10/2026)
  useEffect(() => { if (abrirSuporte && MARCA.suporte) setAba('suporte') }, [abrirSuporte])
  /*
    A ABA ATIVA SEMPRE À VISTA (09/10/2026). No celular a barra de abas vira
    uma fila horizontal que rola, e quem estava em "Clientes" via "Visão geral"
    e "Centro de estudo" na barra, sem saber onde estava. Ao trocar de aba, a
    fila rola até a aba ativa. Só age quando a barra de fato rola de lado:
    no computador ela é a coluna lateral, e isto não faz nada.
  */
  const navAbas = useRef<HTMLElement | null>(null)
  // As tabelas viram cartões no celular; o rótulo de cada campo vem do
  // cabeçalho da própria tabela (ver core/rotulosDeTabela.ts).
  const mainAdmin = useRef<HTMLElement | null>(null)
  useEffect(() => (mainAdmin.current ? observarTabelas(mainAdmin.current) : undefined), [])
  useEffect(() => {
    const nav = navAbas.current
    if (!nav || nav.scrollWidth <= nav.clientWidth + 1) return
    const ativa = nav.querySelector<HTMLElement>('button.on')
    if (!ativa) return
    const alvo = ativa.offsetLeft - (nav.clientWidth - ativa.offsetWidth) / 2
    nav.scrollTo({ left: Math.max(0, alvo), behavior: 'smooth' })
  }, [aba])
  // Qual plataforma este painel está administrando (só a master troca).
  /*
    A plataforma que este painel administra (só a master troca).

    Cada tela de dentro busca os próprios dados quando monta. Sem trocar a
    chave delas, mudar a plataforma no topo trocava o filtro das consultas
    novas mas deixava na tela o que já tinha sido carregado da outra — foi
    assim que os depósitos da OMNI apareceram no painel da Teeds
    (30/09/2026). Com `key={marcaFoco}` cada uma renasce e busca de novo.
  */
  const [marcaFoco, trocarMarcaFoco] = useMarcaEmFoco()
  /** A plataforma onde as ações acontecem: a do seletor; na visão da rede, a do site. */
  const marcaDeTrabalho = marcaFoco === REDE ? MARCA.id : marcaFoco
  // parceiro de divulgação em foco (27/10/2026): só o admin geral recebe a lista; filtra a aba Clientes
  const parceirosDoFoco = useParceirosDaMarca(sessao, marcaFoco)
  const [parceiroFoco, trocarParceiroFoco] = useParceiroEmFoco()
  /* Admin do parceiro (27/10/2026): Naor só vê o /n, Victor só o /v. O banco
     já devolve só o que é dele; aqui somem as abas que mexem na plataforma
     inteira (e-mails, aulas, I.A., planos, produtos, comissões, estudo). */
  const papel = useMeuPapel(sessao, MARCA.id)
  const doParceiro = !!papel && !papel.geral && !!papel.parceiro
  // trocar o parceiro em foco refaz as leituras (o filtro vale no banco)
  const chaveDoFoco = `${marcaFoco}:${parceiroFoco}`
  const focoAnterior = useRef(parceiroFoco)
  useEffect(() => { if (focoAnterior.current !== parceiroFoco) { focoAnterior.current = parceiroFoco; void recarregar() } }, [parceiroFoco]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (doParceiro && (SO_DO_ADMIN_GERAL as readonly string[]).includes(aba)) setAba('visao') }, [doParceiro, aba])
  const [lista, setLista] = useState<PaginaClientes>(PAGINA_VAZIA)
  const [recentes, setRecentes] = useState<ClienteRegistro[]>([])
  const [topo, setTopo] = useState<Array<{ cliente: ClienteRegistro; comissao: number; operacoes: number }>>([])
  const [buscando, setBuscando] = useState(true)
  const [versao, setVersao] = useState(0)
  const [planos, setPlanos] = useState<PlanoRegistro[]>([])
  const [produtos, setProdutos] = useState<ProdutoRegistro[]>([])
  const [liberacoes, setLiberacoes] = useState<ClienteProdutoRegistro[]>([])
  const [contas, setContas] = useState<ContaDerivRegistro[]>([])
  const [movimento, setMovimento] = useState<ComissaoDia[]>([])
  const [metricasRobos, setMetricasRobos] = useState<MetricaRoboRegistro[]>([])
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [pagina, setPagina] = useState(0)
  const [ordem, setOrdem] = useState<OrdemClientes>('cadastro')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [cliente, setCliente] = useState<ClienteRegistro | null>(null)
  const [excluindo, setExcluindo] = useState(false)
  const [clienteForm, setClienteForm] = useState<{ planoId: string; status: string; expira: string; observacoes: string; categoria: 'silver' | 'gold' }>({ planoId: 'essencial', status: 'ativo', expira: '', observacoes: '', categoria: 'gold' })
  const [extras, setExtras] = useState<Set<string>>(new Set())
  const [novo, setNovo] = useState({ nome: '', email: '', telefone: '', cpf: '', senha: '', planoId: 'essencial', expira: '', stark: false })
  const [produtoForm, setProdutoForm] = useState<ProdutoRegistro | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Parceiro em foco (/n, /v, direto): as somas da conta (markup, operações, saldos) ficam só com
  // os clientes do parceiro, como a contagem de clientes (28/10/2026, Tiago: "as infos não estão
  // sendo atualizadas"). Sem isto, o markup do próprio admin aparecia em qualquer filtro.
  const parceiroAtivo = parceirosDoFoco.length ? parceiroFoco : ''
  const idsDoFoco = useRef<Set<string> | null>(null)
  const soDoFoco = <T extends { userId: string }>(l: T[]) => idsDoFoco.current ? l.filter((x) => idsDoFoco.current!.has(x.userId)) : l
  const carregar = async () => {
    setCarregando(true); setErro(null)
    try {
      const [p, pr, l, co, m, mr, rec, ids] = await Promise.all([listarPlanos(sessao), listarProdutos(sessao), listarProdutosClientes(sessao), listarContasDeriv(sessao), listarComissoes(sessao, 90), listarMetricasRobos(sessao, 90), listarClientesPagina(sessao, { limite: 5, parceiro: parceiroAtivo }), parceiroAtivo ? idsDoParceiro(sessao, parceiroAtivo) : Promise.resolve(null)])
      idsDoFoco.current = ids
      setPlanos(p); setProdutos(pr); setLiberacoes(l); setContas(soDoFoco(co)); setMovimento(soDoFoco(m)); setMetricasRobos(mr); setRecentes(rec.pagina)
    } catch (e) { setErro((e as Error).message) } finally { setCarregando(false) }
  }
  /** Recarrega tudo, inclusive a página de clientes — depois de salvar algo. */
  const recarregar = async () => { setVersao((v) => v + 1); await carregar() }
  useEffect(() => { void carregar() }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // A lista de clientes vem do banco já buscada, filtrada e paginada: 50 fichas
  // por vez em vez das 11 mil da base. Digitar espera 300 ms para não disparar
  // uma consulta por letra.
  useEffect(() => {
    let vivo = true
    const espera = setTimeout(() => {
      setBuscando(true)
      listarClientesPagina(sessao, { busca, status: filtro, ordem, limite: POR_PAGINA, deslocamento: pagina * POR_PAGINA, parceiro: parceirosDoFoco.length ? parceiroFoco : '' })
        .then((r) => { if (vivo) setLista(r) })
        .catch((e) => { if (vivo) setErro((e as Error).message) })
        .finally(() => { if (vivo) setBuscando(false) })
    }, busca ? 300 : 0)
    return () => { vivo = false; clearTimeout(espera) }
  }, [sessao.usuario.id, busca, filtro, ordem, pagina, versao, parceiroFoco, parceirosDoFoco.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // O ranking soma o movimento dos 90 dias e pede ao banco só as fichas dos
  // sete primeiros — nome e e-mail de sete pessoas, não da base inteira.
  useEffect(() => {
    const soma = new Map<string, { comissao: number; operacoes: number }>()
    for (const m of movimento) {
      const x = soma.get(m.userId) ?? { comissao: 0, operacoes: 0 }
      if (!m.demo) x.comissao += m.comissao
      x.operacoes += m.operacoes
      soma.set(m.userId, x)
    }
    const sete = [...soma.entries()].sort((a, b) => b[1].comissao - a[1].comissao).slice(0, 7)
    if (!sete.length) { setTopo([]); return }
    let vivo = true
    clientesPorId(sessao, sete.map(([id]) => id)).then((fichas) => {
      if (!vivo) return
      const porId = new Map(fichas.map((f) => [f.userId, f]))
      setTopo(sete.flatMap(([id, x]) => { const c = porId.get(id); return c ? [{ cliente: c, comissao: x.comissao, operacoes: x.operacoes }] : [] }))
    }).catch(() => {})
    return () => { vivo = false }
  }, [movimento]) // eslint-disable-line react-hooks/exhaustive-deps
  // O servidor refresca o saldo das contas reais a cada poucos minutos; a tela acompanha sem precisar de F5.
  useEffect(() => {
    const id = setInterval(() => { listarContasDeriv(sessao).then((c) => setContas(soDoFoco(c))).catch(() => {}) }, 60_000)
    return () => clearInterval(id)
  }, [sessao.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Os números do topo precisam olhar a base inteira, então quem os calcula é
  // o banco. "Ativos em 24h" conta só quem já entrou de verdade: a ficha nasce
  // com "visto agora", e sem esse corte cada conta criada (as 11 mil
  // importadas em 11/09, por exemplo) apareceria como ativa no dia do cadastro.
  const { total: totalClientes, ativos, expirados, vencendo, ativos24h } = lista
  // A mesma conta Deriv pode estar ligada a dois cadastros: conta uma vez só, pela leitura mais recente.
  const contasReais = useMemo(() => {
    const m = new Map<string, ContaDerivRegistro>()
    for (const c of contas) {
      if (c.tipo === 'demo') continue
      const j = m.get(c.contaId)
      if (!j || Date.parse(c.vistaEm) > Date.parse(j.vistaEm)) m.set(c.contaId, c)
    }
    return [...m.values()]
  }, [contas])
  const saldoReal = contasReais.reduce((s,c)=>s+(c.saldo??0),0)
  const saldoVistoEm = contasReais.reduce((t,c)=>Math.max(t, Date.parse(c.vistaEm) || 0), 0)
  const markup90 = movimento.filter(m=>!m.demo).reduce((s,m)=>s+m.comissao,0)
  const operacoes90 = movimento.reduce((s,m)=>s+m.operacoes,0)
  const clienteInfo = (id:string) => ({ contas: contas.filter(c=>c.userId===id), movimento: movimento.filter(m=>m.userId===id), extras: liberacoes.filter(x=>x.userId===id&&x.ativo) })
  const planosDist = planos.map(p=>({nome:p.nome,total:lista.porPlano[p.id] ?? 0})).filter(p=>p.total)
  const maxPlano = Math.max(1,...planosDist.map(p=>p.total))
  const porRobo = metricasRobos.map((r) => ({ id:r.roboId, nome:r.roboNome, ...r }))
  // Busca ou filtro novo volta para a primeira página: ficar na 40 de um
  // resultado que agora tem 2 páginas mostraria uma tela vazia.
  /* A ordem NÃO entra aqui: `ordenarPor` já zera a página no mesmo clique.
     Quando entrava, trocar a ordem estando na página 3 disparava DUAS
     consultas — primeiro a página 3 na ordem nova, depois a página 1 — e a
     primeira era jogada fora. O clique custava o dobro do tempo. */
  useEffect(() => { setPagina(0) }, [busca, filtro])

  /*
    Um clique no cabeçalho ordena por aquela coluna; o clique seguinte na
    MESMA coluna inverte. Datas e saldo começam do maior, que é o que se
    quer ver primeiro em "último acesso" e "maior saldo"; nome, status e
    plano começam de A, que é como se lê uma lista de palavras.
  */
  const COMECA_DESC = new Set(['cadastro', 'acesso', 'saldo'])
  const ordenarPor = (coluna: string) => {
    const primeira = coluna as OrdemClientes
    const invertida = `${coluna}${COMECA_DESC.has(coluna) ? '-asc' : '-desc'}` as OrdemClientes
    setOrdem(ordem === primeira ? invertida : primeira)
    setPagina(0)
  }
  /** A setinha do cabeçalho: cheia na coluna ativa, apagada nas outras. */
  const seta = (coluna: string) => {
    if (ordem === coluna) return COMECA_DESC.has(coluna) ? '↓' : '↑'
    if (ordem === `${coluna}-asc`) return '↑'
    if (ordem === `${coluna}-desc`) return '↓'
    return ''
  }
  const colunaAtiva = (coluna: string) => ordem === coluna || ordem.startsWith(`${coluna}-`)
  const naPagina = lista.pagina
  const totalPaginas = Math.max(1, Math.ceil(lista.filtrados / POR_PAGINA))
  const inteiro = (n: number) => n.toLocaleString('pt-BR')
  const paginacao = lista.filtrados > POR_PAGINA && <div className="adm-paginas"><span>{inteiro(pagina * POR_PAGINA + 1)}–{inteiro(Math.min(lista.filtrados, pagina * POR_PAGINA + naPagina.length))} de {inteiro(lista.filtrados)} clientes</span><div><button onClick={() => setPagina(0)} disabled={pagina === 0}>« Primeira</button><button onClick={() => setPagina(pagina - 1)} disabled={pagina === 0}>‹ Anterior</button><b>Página {inteiro(pagina + 1)} de {inteiro(totalPaginas)}</b><button onClick={() => setPagina(pagina + 1)} disabled={pagina >= totalPaginas - 1}>Próxima ›</button><button onClick={() => setPagina(totalPaginas - 1)} disabled={pagina >= totalPaginas - 1}>Última »</button></div></div>

  // O que o painel está olhando agora, em uma palavra — e o que fazer quando muda.
  const naRede = marcaFoco === REDE
  const [filaSuporte, setFilaSuporte] = useState(0)
  useEffect(() => {
    if (!MARCA.suporte || naRede) { setFilaSuporte(0); return }
    let vivo = true
    const ver = () => aguardandoEquipe(sessao, marcaFoco).then((n) => vivo && setFilaSuporte(n)).catch(() => undefined)
    ver()
    const t = window.setInterval(ver, 30_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [marcaFoco, naRede]) // eslint-disable-line react-hooks/exhaustive-deps
  const nomeDoFoco = naRede ? 'Rede' : (MARCAS[marcaFoco]?.prosa ?? marcaFoco)
  const opcoes = opcoesDePlataforma(ehMaster(), MARCA.id)
  const trocarPlataforma = (id: string) => {
    trocarMarcaFoco(id)
    setPagina(0)
    // Nas abas que só existem dentro de uma plataforma, a rede não tem o que
    // mostrar: volta para a visão geral em vez de deixar a tela pedindo.
    if (id === REDE && PRECISA_DE_UMA.includes(aba)) setAba('visao')
    void recarregar()
  }
  const pedirPlataforma = (
    <section className="admin-card adm-pede-marca">
      <div>
        <span className="rot">Escolha uma plataforma</span>
        <h3>Isto acontece dentro de uma marca</h3>
        <p>
          Criar acesso, trocar o vídeo de uma aula, ligar um robô ou mexer no catálogo tem um dono:
          o cliente entra por um endereço, recebe o e-mail de uma marca e opera pelos robôs dela.
          A visão da rede soma o que já aconteceu; para <b>mexer</b>, escolha onde.
        </p>
      </div>
      <div className="adm-pede-marca-botoes">
        {opcoes.filter((o) => o.id !== REDE).map((o) => (
          <button key={o.id} type="button" onClick={() => trocarPlataforma(o.id)}>
            <b>{o.nome}</b><small>{o.papel}</small>
          </button>
        ))}
      </div>
    </section>
  )

  const abrirCliente = (c: ClienteRegistro) => {
    setCliente(c); setExcluindo(false); setClienteForm({ planoId: c.planoId, status: status(c), expira: dataInput(c.acessoExpiraEm), observacoes: c.observacoes ?? '', categoria: c.categoria ?? 'gold' })
    setExtras(new Set(liberacoes.filter((x) => x.userId === c.userId && x.ativo).map((x) => x.produtoId)))
  }
  const salvarCliente = async () => {
    if (!cliente) return
    setSalvando(true); setErro(null)
    try {
      await atualizarAcessoCliente(sessao, cliente.userId, { planoId: clienteForm.planoId, statusAcesso: clienteForm.status as ClienteRegistro['statusAcesso'], acessoExpiraEm: clienteForm.expira ? new Date(`${clienteForm.expira}T23:59:59`).toISOString() : null, observacoes: clienteForm.observacoes || null, ...(MARCA.seloCategoria ? { categoria: clienteForm.categoria } : {}) })
      await Promise.all(produtos.filter(p=>p.id!=='simulador-treino').map((p) => definirProdutoCliente(sessao, cliente.userId, p.id, extras.has(p.id))))
      setCliente(null); setSucesso('Acesso atualizado com sucesso.'); await recarregar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const criar = async () => {
    if (!novo.nome.trim() || !novo.email.trim() || novo.senha.length < 6) { setErro('Preencha nome, e-mail e uma senha provisória com pelo menos 6 caracteres.'); return }
    setSalvando(true); setErro(null); setSucesso(null)
    try {
      // A conta nasce na plataforma em foco (o seletor do master), não na do site aberto.
      const r = await criarAcessoCliente(sessao, novo, marcaDeTrabalho)
      // GlobalFly: cliente da antiga Stark já pagou pelas 5 I.A. (o Gulf e o Phenom vêm liberados)
      if (r.userId && marcaDeTrabalho === 'globalfly' && novo.stark) await definirProdutoCliente(sessao, r.userId, 'gf-base-stark', true, marcaDeTrabalho)
      if (r.userId) await atualizarAcessoCliente(sessao, r.userId, { planoId: novo.planoId, statusAcesso: 'ativo', acessoExpiraEm: novo.expira ? new Date(`${novo.expira}T23:59:59`).toISOString() : null, observacoes: null }, marcaDeTrabalho)
      setNovo({ nome: '', email: '', telefone: '', cpf: '', senha: '', planoId: 'essencial', expira: '', stark: false })
      // A senha provisória não vai por e-mail: quem criou o acesso precisa passá-la ao cliente.
      setSucesso(r.precisaConfirmar
        ? 'Acesso criado. Passe ao cliente o e-mail e a senha provisória: ela não vai por e-mail. Antes de entrar, ele confirma o endereço pelo e-mail que recebeu.'
        : 'Acesso criado e liberado. Passe ao cliente o e-mail e a senha provisória: ela não vai por e-mail.')
      await recarregar(); setAba('clientes')
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const gravarProduto = async () => { if (!produtoForm?.nome.trim()) return; setSalvando(true); try { await salvarProduto(sessao, { ...produtoForm, id: produtoForm.id || slug(produtoForm.nome) }); setProdutoForm(null); setSucesso('Produto salvo.'); await recarregar() } catch(e){setErro((e as Error).message)} finally{setSalvando(false)} }

  const tabelaClientes = <><div className="adm-filtros"><label><Icone nome="buscar" /><input placeholder="Buscar nome, e-mail, telefone ou CPF" value={busca} onChange={(e) => setBusca(e.target.value)} /></label><select value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="todos">Todos os status</option><option value="ativo">Ativos</option><option value="suspenso">Suspensos</option><option value="expirado">Expirados</option><option value="cancelado">Cancelados</option></select></div><div className={`adm-tabela ${buscando ? 'carregando' : ''}`} aria-busy={buscando}><div className="adm-linha cab adm-cab-ordem">{([["nome","Cliente"],["plano","Plano"],["status","Status"],["acesso","Último acesso"],["saldo","Saldo real Deriv"],["cadastro","Cadastro"]] as [string,string][]).map(([col,rotulo]) => <span key={col}><button type="button" className={`${colunaAtiva(col) ? "on" : ""} ${colunaAtiva(col) && buscando ? "ordenando" : ""}`} onClick={() => ordenarPor(col)} title={`Ordenar por ${rotulo.toLowerCase()}`} aria-label={`Ordenar por ${rotulo.toLowerCase()}`}>{rotulo}<i aria-hidden>{seta(col) || "↕"}</i></button></span>)}<span /></div>{naPagina.map((c) => { const info=clienteInfo(c.userId); const reais=info.contas.filter(x=>x.tipo!=='demo'); const saldo=reais.reduce((s,x)=>s+(x.saldo??0),0); const demos=info.contas.filter(x=>x.tipo==='demo'); const saldoDemo=demos.reduce((s,x)=>s+(x.saldo??0),0); const st = status(c); return <button className="adm-linha" key={c.userId} onClick={() => abrirCliente(c)}><span className="adm-pessoa"><i>{(c.nome || c.email || '?')[0].toUpperCase()}</i><b>{c.nome || 'Sem nome'}<small>{c.email}</small></b></span><span>{planos.find((p) => p.id === c.planoId)?.nome ?? c.planoId}</span><span><em className={`adm-status ${st}`}>{st}</em></span><span className="adm-acesso">{c.totalAcessos > 0 ? <><b>{dataHora(c.vistoEm)}</b><small>{haQuantoTempo(c.vistoEm)} · {c.totalAcessos} acesso{c.totalAcessos === 1 ? '' : 's'} · {horasLegiveis(c.tempoTotalSegundos ?? 0)}</small></> : <em className="adm-nunca">Nunca acessou</em>}</span><span>{reais.length
              ? `${reais[0]?.moeda||'USD'} ${saldo.toLocaleString('pt-BR',{minimumFractionDigits:2})}`
              /* Três estados, não dois. Quem conectou SÓ a demo caía no mesmo
                 balde de quem nunca conectou nada, e a tela dizia "Não
                 conectada" para alguém que estava operando na nossa frente
                 (Tiago, 06/10/2026). São 7 clientes assim na Teeds hoje. */
              : demos.length
                ? <em className="adm-so-demo">Só demo<small>{demos[0]?.moeda||'USD'} {saldoDemo.toLocaleString('pt-BR',{minimumFractionDigits:2})}</small></em>
                : <em className="adm-nunca">Não conectada</em>}</span><span>{data(c.criadoEm)}</span><span className="adm-seta">›</span></button>})}{buscando && !naPagina.length && <div className="adm-vazio">Buscando…</div>}{!buscando && !naPagina.length && <div className="adm-vazio">Nenhum cliente encontrado.</div>}</div>{paginacao}</>

  // no suporte o painel vira um app de atendimento: menu só com ícones e a conversa na altura da tela
  return <div className={`admin-shell ${aba === 'suporte' && !naRede ? 'modo-suporte' : ''}`}>
    <aside className="admin-sidebar"><div><span className="rot">Painel de controle</span><h2>Administração</h2><p>{doParceiro ? `Os clientes e as operações do ${rotuloDoParceiro(papel!.nomeDoParceiro, papel!.parceiro!)}` : `Gestão completa da ${MARCA.prosa}`}</p></div><nav ref={navAbas}>{([...(MARCA.suporte ? [['suporte','Suporte','suporte']] : []),['visao','Visão geral','inicio'],['organizacao','Organização','organizacao'],['estudo','Centro de estudo','estudo'],['inteligencia','Inteligência','inteligencia'],['leads','Leads','leads'],...(souGeral && MARCA.parceiros?.length ? [['parceiros','Parceiros','parceiros']] : []),['emails','E-mails','emails'],['clientes','Clientes','clientes'],['resultados','Resultados','resultados'],['movimentacoes','Depósitos e saques','movimentacoes'],['acessos','Criar acesso','acesso'],['aulas','Aulas','aulas'],['robos','Robôs','robos'],['planos','Planos','planos'],['produtos','Produtos','produtos'],['comissoes','Comissões','comissoes']] as [Aba,string,NomeIcone][]).filter(([id]) => !doParceiro || !(SO_DO_ADMIN_GERAL as readonly string[]).includes(id)).map(([id,nome,ico]) => <button key={id} className={aba === id ? 'on' : ''} onClick={() => setAba(id)} title={nome}><i><Icone nome={ico} /></i><span>{nome}</span>{id === 'clientes' && <b>{totalClientes}</b>}{id === 'organizacao' && minhasPendentes > 0 && <b className="admin-fila-suporte" title="Suas tarefas atrasadas ou para hoje">{minhasPendentes}</b>}{id === 'suporte' && filaSuporte > 0 && <b className="admin-fila-suporte">{filaSuporte}</b>}</button>)}<div className="admin-submenus" aria-label="Ferramentas administrativas">{MARCA.aoVivo && <button onClick={() => { pedirCentral(); onNavigate('aovivo') }}><i><Icone nome="aovivo" /></i><span>Central ao vivo</span></button>}<button onClick={() => onNavigate('monitoramento')}><i><Icone nome="monitoramento" /></i><span>Monitoramento ao vivo</span></button>{!doParceiro && <button onClick={() => onNavigate('insights')}><i><Icone nome="insights" /></i><span>Insights</span></button>}</div></nav><small>Somente administradores podem visualizar e alterar estes dados.</small></aside>
    <main className="admin-main" ref={mainAdmin}><header className="admin-top"><div><span className="rot">{naRede ? `Rede ${MARCA.prosa}` : doParceiro ? `${nomeDoFoco} · Admin do parceiro ${rotuloDoParceiro(papel!.nomeDoParceiro, papel!.parceiro!)}` : `${nomeDoFoco} Admin`}</span><h1>{aba === 'organizacao' ? 'Organização' : aba === 'suporte' ? 'Suporte ao cliente' : aba === 'leads' ? 'Leads e interessados' : aba === 'parceiros' ? 'Parceiros de divulgação' : aba === 'emails' ? 'Central de e-mails' : aba === 'estudo' ? 'Centro de estudo' : aba === 'robos' ? 'Robôs da plataforma' : aba === 'visao' ? 'Visão geral' : aba === 'inteligencia' ? 'Inteligência do negócio' : aba === 'clientes' ? 'Gestão de clientes' : aba === 'resultados' ? 'Resultados por cliente' : aba === 'movimentacoes' ? 'Depósitos e saques' : aba === 'acessos' ? 'Criar novo acesso' : aba === 'aulas' ? 'Aulas e vídeos' : aba === 'planos' ? 'Planos e assinaturas' : aba === 'produtos' ? 'Catálogo de produtos' : 'Comissões e resultados'}</h1><p>{aba === 'organizacao' ? 'Tarefas, responsáveis, prazos e o calendário do lançamento. O que um muda aparece na hora para os outros.' : aba === 'suporte' ? 'As conversas dos clientes, em tempo real: o mais urgente primeiro.' : aba === 'leads' ? 'Quem se cadastrou, de onde veio e quão quente está.' : aba === 'parceiros' ? 'Quem trouxe cada cliente e quanto de markup cada parceiro gerou. Só você vê esta aba.' : aba === 'emails' ? 'Consulte os disparos e acompanhe os status de envio.' : aba === 'estudo' ? (naRede ? 'A rede somada: as plataformas lado a lado e o histórico de todas juntas.' : `Markup, volume e desempenho dos robôs da ${nomeDoFoco} no período.`) : aba === 'robos' ? 'Ligue, desligue e ajuste as regras de cada robô desta plataforma.' : aba === 'visao' ? (naRede ? 'Todas as plataformas somadas, em um só lugar.' : `Tudo da ${nomeDoFoco} que precisa de atenção, em um só lugar.`) : aba === 'inteligencia' ? 'Comportamento, carteira, atividade e receita organizados para decidir melhor.' : aba === 'clientes' ? 'Consulte, filtre e edite acessos existentes.' : aba === 'resultados' ? 'Quanto cada cliente operou, ganhou ou perdeu, e gerou de comissão — e o nosso número contra o da Deriv.' : aba === 'movimentacoes' ? 'Quanto entrou e quanto saiu das contas reais dos clientes na Deriv, dia a dia.' : aba === 'acessos' ? 'Cadastre uma pessoa e defina sua liberação inicial.' : aba === 'aulas' ? 'Envie ou troque o vídeo de cada aula. Entra no ar na hora, sem republicar o site.' : aba === 'planos' ? 'Configure as opções comerciais da plataforma.' : aba === 'produtos' ? 'Gerencie os itens e extras do Marketplace.' : 'Acompanhe volume, operações e comissões da sua conta.'}</p></div><div className="admin-top-acoes"><SeletorDePlataforma valor={marcaFoco} opcoes={opcoes} onTrocar={trocarPlataforma} parceiros={parceirosDoFoco} parceiro={parceiroFoco} onParceiro={(c) => { trocarParceiroFoco(c); setPagina(0) }} /><button className="admin-refresh" onClick={() => void recarregar()} disabled={carregando}><Icone nome="atualizar" />{carregando ? 'Atualizando…' : 'Atualizar'}</button></div></header>
      {naRede && PRECISA_DE_UMA.includes(aba) && pedirPlataforma}
      {aba === 'suporte' && !naRede && <AdminSuporte key={chaveDoFoco} sessao={sessao} marca={marcaFoco} nomeDaEquipe={nomeDaEquipe} />}
      {aba === 'suporte' && naRede && <section className="admin-card adm-pede-marca"><div><span className="rot">Suporte</span><h3>Escolha uma plataforma</h3><p>Cada plataforma tem a sua caixa de entrada. Troque a plataforma no topo para ver as conversas dela.</p></div></section>}
      {aba === 'emails' && !naRede && <AdminEmails key={chaveDoFoco} sessao={sessao} marca={marcaFoco} />}
      {aba === 'estudo' && <AdminCentroDeEstudo key={chaveDoFoco} sessao={sessao} marcaFoco={marcaFoco} onAbrirMarca={(id) => { trocarMarcaFoco(id); setPagina(0); void recarregar() }} />}
      {aba === 'robos' && !naRede && <AdminRobos key={chaveDoFoco} sessao={sessao} marca={marcaFoco} />}
      {aba === 'organizacao' && <Suspense fallback={<p className="og-carregando">Carregando a central…</p>}><Organizacao api={orgApi} semTitulo /></Suspense>}
      {onMostrarMarkup && aba !== 'organizacao' && <ChaveModoCeo ligado={mostrarMarkup} onTrocar={onMostrarMarkup}
        texto="Markup em cada operação e em cada robô, e o Centro de estudo com o histórico da plataforma. Fica só no seu acesso, neste navegador: nenhum cliente vê." />}
      {erro && <div className="ger-erro">{erro}<button onClick={() => setErro(null)}><IconeFechar /></button></div>}{sucesso && <div className="admin-sucesso"><span><Icone nome="certo" />{sucesso}</span><button onClick={() => setSucesso(null)}><IconeFechar /></button></div>}
      {aba === 'visao' && <><div className="adm-kpis admin-kpis-click"><button onClick={()=>setAba('clientes')}><span>Clientes cadastrados</span><strong>{totalClientes}</strong><small>Ver base completa →</small></button><button className="ok" onClick={()=>setAba('inteligencia')}><span>Ativos nas últimas 24h</span><strong>{ativos24h}</strong><small>{ativos} acessos liberados</small></button><button className="alerta" onClick={()=>setAba('comissoes')}><span>Markup real · 90 dias</span><strong>US$ {dec(markup90)}</strong><small>{operacoes90.toLocaleString('pt-BR')} operações</small></button><button className="perigo" onClick={()=>{setFiltro('expirado');setAba('clientes')}}><span>Expirados</span><strong>{expirados}</strong><small>{vencendo} vencem em 7 dias</small></button></div><div className="admin-grid"><section className="admin-card"><header><div><span className="rot">Clientes recentes</span><h3>Últimos cadastros</h3></div><button onClick={() => setAba('clientes')}>Ver todos →</button></header>{recentes.map(c=><button className="admin-mini" key={c.userId} onClick={()=>abrirCliente(c)}><span className="adm-pessoa"><i>{(c.nome||c.email||'?')[0].toUpperCase()}</i><b>{c.nome||'Sem nome'}<small>{c.email}</small></b></span><span className="admin-last">Último acesso<b>{data(c.vistoEm)}</b></span><em className={`adm-status ${status(c)}`}>{status(c)}</em></button>)}</section><section className="admin-card"><header><div><span className="rot">Atalhos</span><h3>Ações rápidas</h3></div></header><button className="admin-quick primary" onClick={()=>setAba('acessos')}><i><Icone nome="acesso" /></i><span><b>Criar novo acesso</b><small>Cadastrar e liberar um cliente</small></span></button><button className="admin-quick" onClick={()=>setAba('inteligencia')}><i><Icone nome="inteligencia" /></i><span><b>Analisar a base</b><small>Atividade, carteira e distribuição</small></span></button><button className="admin-quick" onClick={()=>setAba('comissoes')}><i><Icone nome="comissoes" /></i><span><b>Ver comissões</b><small>Markup, volume e evolução</small></span></button></section></div></>}
      {aba === 'inteligencia' && <><div className="adm-kpis"><article><span>Saldo real conectado</span><strong>US$ {saldoReal.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong><small>{contasReais.length} conta{contasReais.length === 1 ? '' : 's'} rea{contasReais.length === 1 ? 'l' : 'is'} · {saldoVistoEm ? `lido ${haQuanto(saldoVistoEm)}` : 'sem leitura ainda'}</small></article><article className="ok"><span>Taxa de atividade · 24h</span><strong>{totalClientes?Math.round(ativos24h/totalClientes*100):0}%</strong><small>{ativos24h} de {totalClientes} clientes</small></article><article className="alerta"><span>Operações · 90 dias</span><strong>{operacoes90.toLocaleString('pt-BR')}</strong><small>Reais e demonstração</small></article><article><span>Produtos liberados</span><strong>{liberacoes.filter(x=>x.ativo).length}</strong><small>Em todas as contas</small></article></div><div className="admin-analytics"><section className="admin-card"><header><div><span className="rot">Distribuição</span><h3>Clientes por plano</h3></div></header><div className="admin-bars">{planosDist.map(p=><div key={p.nome}><span>{p.nome}<b>{p.total}</b></span><i><em style={{width:`${p.total/maxPlano*100}%`}}/></i></div>)}</div></section><section className="admin-card"><header><div><span className="rot">Ranking real · 90 dias</span><h3>Markup por cliente</h3></div></header><div className="admin-ranking">{topo.map((r,i)=><button key={r.cliente.userId} onClick={()=>abrirCliente(r.cliente)}><i>{i+1}</i><span><b>{r.cliente.nome||r.cliente.email}</b><small>{r.operacoes.toLocaleString('pt-BR')} operações</small></span><strong>US$ {dec(r.comissao)}</strong></button>)}</div></section></div><section className="admin-card admin-data-note"><header><div><span className="rot">Qualidade dos dados</span><h3>Rastreabilidade dos indicadores</h3></div></header><div className="admin-data-grid"><div className="ok"><i><Icone nome="certo" /></i><span><b>Clientes e receita</b><small>Cadastro, último acesso, plano, validade, produtos, contas Deriv, saldo, operações e markup por cliente.</small></span></div><div className="ok"><i><Icone nome="certo" /></i><span><b>Desempenho por robô</b><small>Operações, acerto, clientes, volume, resultado e markup, agregados com segurança no banco.</small></span></div><div><i><Icone nome="info" /></i><span><b>Localização</b><small>Só a aproximada, pelo fuso horário e pelo idioma do navegador. Cidade exata dependeria de consentimento e política de privacidade.</small></span></div></div></section></>}
      {aba === 'inteligencia' && <section className="admin-card admin-robot-metrics"><header><div><span className="rot">Telemetria real · 90 dias</span><h3>Desempenho e markup por robô</h3></div><small>Resumo calculado no Supabase</small></header>{porRobo.length?<div className="admin-robo-table"><div className="cab"><span>Robô</span><span>Operações</span><span>Acerto</span><span>Clientes</span><span>Volume</span><span>Resultado</span><span>Markup real</span></div>{porRobo.map(r=><div key={r.id}><span><b><NomeDoRobo nome={r.nome} id={r.id} /></b><small>{r.id}</small></span><span>{r.operacoes.toLocaleString('pt-BR')}</span><span>{r.operacoes?dec(r.vitorias/r.operacoes*100,1):'0'}%</span><span>{r.clientes}</span><span>US$ {dec(r.volume)}</span><span className={r.resultado>=0?'positivo':'negativo'}>{r.resultado>=0?'+':''}{dec(r.resultado)}</span><strong>US$ {dec(r.markup)}</strong></div>)}</div>:<div className="adm-vazio">A coleta por robô está pronta. Os indicadores serão preenchidos conforme novos contratos forem concluídos.</div>}</section>}
      {aba === 'inteligencia' && <AdminAcessos key={chaveDoFoco} sessao={sessao} />}
      {aba === 'leads' && !naRede && <AdminLeads key={chaveDoFoco} sessao={sessao} marca={marcaFoco} />}
      {/* Aprovar é um ato de UMA marca: a conta nasce nela e o e-mail sai com a
          cara dela. Em "Rede" não há marca para aprovar, então o cartão sai do
          ar em vez de mostrar a lista de alguma marca por acaso. A lista de
          clientes abaixo continua, porque consultar a rede inteira faz sentido. */}
      {aba === 'clientes' && !naRede && <AdminPendentes key={chaveDoFoco} sessao={sessao} marca={marcaFoco} versao={versao} planos={planos} parceiros={parceirosDoFoco} onAprovado={()=>void recarregar()} />}
      {aba === 'clientes' && naRede && <section className="admin-card adm-pede-marca"><div><span className="rot">Aprovação de clientes</span><h3>Escolha uma plataforma para aprovar</h3><p>A conta nasce dentro de uma marca e o e-mail sai com a identidade dela. Na visão de Rede não há a quem aprovar — troque para {Object.values(MARCAS).map(m=>m.prosa).join(', ').replace(/, ([^,]*)$/, ' ou $1')} no topo.</p></div></section>}
      {aba === 'clientes' && <section className="admin-card full adm-base-clientes"><header><div><span className="rot">Base completa</span><h3>{totalClientes.toLocaleString('pt-BR')} clientes cadastrados</h3></div><button className="admin-primary" onClick={()=>setAba('acessos')}><Icone nome="mais" />Novo cliente</button></header>{tabelaClientes}</section>}
      {aba === 'acessos' && !naRede && <section className="admin-form-page"><div className="admin-form-intro"><span>01</span><h3>Dados do cliente</h3><p>O e-mail será usado para entrar na plataforma.</p></div><div className="admin-form-grid"><label><span>Nome completo *</span><input value={novo.nome} onChange={e=>setNovo({...novo,nome:e.target.value})} placeholder="Nome e sobrenome" /></label><label><span>E-mail de acesso *</span><input type="email" value={novo.email} onChange={e=>setNovo({...novo,email:e.target.value})} placeholder="cliente@email.com" /></label><label><span>Telefone</span><input value={novo.telefone} onChange={e=>setNovo({...novo,telefone:e.target.value})} placeholder="(00) 00000-0000" /></label><label><span>CPF</span><input value={novo.cpf} onChange={e=>setNovo({...novo,cpf:e.target.value})} placeholder="000.000.000-00" /></label><label><span>Senha provisória *</span><input type="password" value={novo.senha} onChange={e=>setNovo({...novo,senha:e.target.value})} placeholder="Mínimo de 6 caracteres" /></label><label><span>Plano inicial</span><select value={novo.planoId} onChange={e=>setNovo({...novo,planoId:e.target.value})}>{planos.filter(p=>p.ativo).map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><label><span>Validade do acesso</span><input type="date" value={novo.expira} onChange={e=>setNovo({...novo,expira:e.target.value})} /></label>{marcaDeTrabalho === 'globalfly' && <label className="admin-check admin-stark"><input type="checkbox" checked={novo.stark} onChange={e=>setNovo({...novo,stark:e.target.checked})} /><span><b>Cliente da antiga Stark</b><small>Já pagou: libera as 5 I.A., com Gulf e Phenom. Sem marcar, ficam Raptor, Falcon e Legacy.</small></span></label>}</div><footer><p>No primeiro acesso o cliente é obrigado a trocar a senha provisória pela própria.</p><button className="admin-primary" onClick={()=>void criar()} disabled={salvando}>{salvando?'Criando…':'Criar e liberar acesso'}</button></footer></section>}
      {aba === 'planos' && !naRede && <AdminPlanos key={chaveDoFoco} sessao={sessao} onMudou={() => void recarregar()} />}
      {aba === 'produtos' && !naRede && <section className="admin-catalogo"><header><button className="admin-primary" onClick={()=>setProdutoForm({id:'',nome:'',categoria:'robo',precoCentavos:19700,ativo:true})}><Icone nome="mais" />Criar produto</button></header><div>{produtos.map(p=><article key={p.id}><span className="admin-icon"><Icone nome="produtos" /></span><div><h3>{p.nome}</h3><p>{categoriaLegivel(p.categoria)} · {moeda(p.precoCentavos)}</p></div><em className={`adm-status ${p.ativo?'ativo':'cancelado'}`}>{p.ativo?'Ativo':'Inativo'}</em><button onClick={()=>setProdutoForm(p)}>Editar</button></article>)}</div></section>}
      {aba === 'aulas' && !naRede && <AdminAulas key={chaveDoFoco} sessao={sessao} marca={marcaFoco} />}
      {aba === 'resultados' && <RelatorioClientes key={chaveDoFoco} sessao={sessao} />}
      {aba === 'movimentacoes' && <Movimentacoes key={chaveDoFoco} sessao={sessao} />}
      {aba === 'parceiros' && !naRede && souGeral && <AdminParceiros key={chaveDoFoco} sessao={sessao} marca={marcaFoco} />}
      {aba === 'comissoes' && <section className="admin-commission" key={chaveDoFoco}>{comissoes}</section>}
    </main>
    {cliente && <div className="adm-modal-fundo" onMouseDown={()=>setCliente(null)}><section className="adm-modal adm-modal-ficha" onMouseDown={e=>e.stopPropagation()}><header><div className="adm-pessoa"><i>{(cliente.nome||cliente.email||'?')[0].toUpperCase()}</i><b>{cliente.nome||'Sem nome'}<small>{cliente.email}</small></b></div><button onClick={()=>setCliente(null)}><IconeFechar /></button></header><PerfilCliente sessao={sessao} userId={cliente.userId} /><div className="adm-detail-kpis adm-detail-antigo"><div><span>Último acesso</span><b>{data(cliente.vistoEm)}</b></div><div><span>Desde o cadastro</span><b>{Math.max(0,Math.floor((Date.now()-Date.parse(cliente.criadoEm))/864e5))} dias</b></div><div><span>Operações · 90d</span><b>{clienteInfo(cliente.userId).movimento.reduce((s,m)=>s+m.operacoes,0).toLocaleString('pt-BR')}</b></div><div><span>Markup real · 90d</span><b>US$ {dec(clienteInfo(cliente.userId).movimento.filter(m=>!m.demo).reduce((s,m)=>s+m.comissao,0))}</b></div></div><div className="adm-contas"><span className="rot">Contas conectadas na corretora</span>{clienteInfo(cliente.userId).contas.length?clienteInfo(cliente.userId).contas.map(c=><div key={c.contaId}><span><b>{c.contaId}</b><small>{c.tipo==='demo'?'Demonstração':'Conta real'} · vista em {data(c.vistaEm)}</small></span><strong>{c.moeda||'USD'} {(c.saldo??0).toLocaleString('pt-BR',{minimumFractionDigits:2})}</strong></div>):<p>Nenhuma conta Deriv conectada.</p>}</div><div className="adm-form"><label><span>Plano</span><select value={clienteForm.planoId} onChange={e=>setClienteForm({...clienteForm,planoId:e.target.value})}>{planos.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}</select></label><label><span>Status</span><select value={clienteForm.status} onChange={e=>setClienteForm({...clienteForm,status:e.target.value})}><option value="ativo">Ativo</option><option value="suspenso">Suspenso</option><option value="expirado">Expirado</option><option value="cancelado">Cancelado</option></select></label><label><span>Expira em</span><input type="date" value={clienteForm.expira} onChange={e=>setClienteForm({...clienteForm,expira:e.target.value})}/></label>{MARCA.seloCategoria&&<label><span>Categoria</span><select value={clienteForm.categoria} onChange={e=>setClienteForm({...clienteForm,categoria:e.target.value as 'silver'|'gold'})}><option value="gold">Gold</option><option value="silver">Silver</option></select></label>}</div><div className="adm-extras"><span className="rot">Produtos e extras liberados</span>{produtos.filter(p=>p.id!=='simulador-treino').map(p=><label key={p.id}><input type="checkbox" checked={extras.has(p.id)} onChange={()=>setExtras(x=>{const n=new Set(x);n.has(p.id)?n.delete(p.id):n.add(p.id);return n})}/><span><b>{p.nome}</b><small>{categoriaLegivel(p.categoria)}</small></span></label>)}</div><label className="adm-notas"><span>Observações internas</span><textarea value={clienteForm.observacoes} onChange={e=>setClienteForm({...clienteForm,observacoes:e.target.value})}/></label><footer><div className="adm-ficha-perigo"><button className="adm-cancelar" title="Muda o status para Cancelado; vale ao salvar" onClick={()=>setClienteForm({...clienteForm,status:'cancelado'})}>Marcar como cancelado</button>{souGeral&&<button className="adm-cancelar adm-excluir" onClick={()=>setExcluindo(true)}>Excluir cadastro</button>}</div><span>Cadastrado em {data(cliente.criadoEm)}</span><button onClick={()=>void salvarCliente()} disabled={salvando}>{salvando?'Salvando…':'Salvar alterações'}</button></footer></section></div>}
    {cliente && excluindo && <ExcluirCadastro sessao={sessao} marca={marcaFoco} cliente={cliente} fechar={()=>setExcluindo(false)} excluido={(aviso)=>{setExcluindo(false);setCliente(null);setErro(null);setSucesso(aviso);void recarregar()}} />}
    {produtoForm && <Editor titulo={produtoForm.id?'Editar produto':'Novo produto'} fechar={()=>setProdutoForm(null)} salvar={gravarProduto} salvando={salvando}><label><span>Nome</span><input value={produtoForm.nome} onChange={e=>setProdutoForm({...produtoForm,nome:e.target.value})}/></label><label><span>Categoria</span><select value={produtoForm.categoria} onChange={e=>setProdutoForm({...produtoForm,categoria:e.target.value})}><option value="robo">Robô</option><option value="mentoria">Mentoria</option><option value="ferramenta">Ferramenta</option><option value="indicador">Indicador</option><option value="sala">Sala de sinais</option></select></label><label><span>Preço (R$)</span><input type="number" min="0" step="0.01" value={(produtoForm.precoCentavos??0)/100} onChange={e=>setProdutoForm({...produtoForm,precoCentavos:Math.round(Number(e.target.value)*100)})}/></label><label className="admin-check"><input type="checkbox" checked={produtoForm.ativo} onChange={e=>setProdutoForm({...produtoForm,ativo:e.target.checked})}/> Produto disponível</label></Editor>}
  </div>
}

function Editor({titulo,fechar,salvar,salvando,children}:{titulo:string;fechar:()=>void;salvar:()=>void;salvando:boolean;children:ReactNode}) { return <div className="adm-modal-fundo" onMouseDown={fechar}><section className="adm-modal admin-editor" onMouseDown={e=>e.stopPropagation()}><header><h3>{titulo}</h3><button onClick={fechar}><IconeFechar /></button></header><div className="admin-editor-form">{children}</div><footer><span>As alterações entram em vigor imediatamente.</span><button onClick={salvar} disabled={salvando}>{salvando?'Salvando…':'Salvar'}</button></footer></section></div> }
