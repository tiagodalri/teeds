import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as PE } from 'react'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { PapelDoAdmin } from '../../core/teeds/parceiroEmFoco'
import { useParceirosDaMarca } from '../../core/teeds/parceiroEmFoco'
import { MARCA } from '../../marca'
import {
  alcanceDoPublico, avisarNoCelular, BOTAO_PADRAO, enviarArquivo, enviarMidia, EVENTO_STORIES, haQuanto, LIMITE_SEGUNDOS,
  linkDoStory, metricasDoStory, metricasExtras, painelDeStories, perfisDoPainel, prepararMidia, removerStory, salvarPerfil, salvarStory, situacao, storyPedido,
  type BotaoTipo, type Enquadramento, type LinhaDoPainel, type Metricas, type NovoStory, type PerfilDoPainel, type Publico, type SituacaoDoStory, type Story,
} from '../../core/teeds/stories'
import { Avatar, estiloDaMidia, VisualizadorDeStories } from './VisualizadorDeStories'
import { AvatarDoParceiro } from '../parceiros/FiltroDeParceiros'
import { CamadasDoStory } from './CamadasDoStory'
import { dominio, rotuloDasCamadas, type Camada } from '../../core/teeds/camadas'

// 09/11/2026: o "Novo story" abre o estúdio (câmera, editor e figurinhas); o formulário antigo fica para editar
const EstudioDeStories = lazy(() => import('./EstudioDeStories').then((m) => ({ default: m.EstudioDeStories })))
const rotulo = (l: LinhaDoPainel['story']) => l.titulo || l.chip || rotuloDasCamadas(l.camadas) || 'Story sem texto'
import './stories.css'
import './admin-stories.css'
import { SeloDoParceiro } from '../parceiros/SeloDoParceiro'

/**
 * Administração › Stories (08/11/2026). Três partes:
 *  - a lista (No ar, Agendados, Destaques, Encerrados) com o resumo de cada um;
 *  - o formulário de publicar, com a prévia do celular ao lado (arrastar para
 *    enquadrar, zoom, áreas seguras) e o alcance do público na hora;
 *  - as métricas de cada story (abre ao clicar no cartão).
 * O admin do parceiro publica e vê só os clientes dele (o banco garante).
 */

interface Props { sessao: SessaoTeeds; papel: PapelDoAdmin | null }

const ABAS: Array<{ id: SituacaoDoStory | 'todos'; nome: string }> = [
  { id: 'no-ar', nome: 'No ar' }, { id: 'agendado', nome: 'Agendados' }, { id: 'destaque', nome: 'Destaques' }, { id: 'encerrado', nome: 'Encerrados' }, { id: 'todos', nome: 'Todos' },
]
const ROTULO_SITUACAO: Record<SituacaoDoStory, string> = { 'no-ar': 'No ar', agendado: 'Agendado', destaque: 'Destaque', encerrado: 'Encerrado' }
const SUBPLANOS = [{ id: 'gold', nome: 'Gold' }, { id: 'black', nome: 'Black' }, { id: 'prestige', nome: 'Prestige' }]
const ETIQUETAS = ['Aula nova', 'Ao vivo hoje', 'Novidade', 'Passo a passo', 'Aviso', 'Dica do dia']
const BOTOES: Array<{ id: BotaoTipo | ''; nome: string }> = [
  { id: '', nome: 'Sem botão' }, { id: 'aula', nome: 'Abrir as aulas' }, { id: 'ia', nome: 'Abrir as I.A.' }, { id: 'deposito', nome: 'Depositar na Deriv' },
  { id: 'aovivo', nome: 'Abrir o Ao vivo' }, { id: 'gerenciamento', nome: 'Abrir o Gerenciamento' }, { id: 'marketplace', nome: 'Abrir os planos' }, { id: 'link', nome: 'Abrir um link' },
]

const n = (v: number) => v.toLocaleString('pt-BR')
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
/** "Hoje 14:32", "Ontem 09:10" ou "08/11 14:32": a hora exata de quem viu (10/11/2026, lista do Victor). */
function dataHoraCurta(iso: string): string {
  const d = new Date(iso)
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const dia = (x: Date) => x.toLocaleDateString('pt-BR')
  const hoje = new Date(), ontem = new Date(Date.now() - 86_400_000)
  if (dia(d) === dia(hoje)) return `Hoje ${hora}`
  if (dia(d) === dia(ontem)) return `Ontem ${hora}`
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${hora}`
}
const paraInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
const faltam = (iso: string) => {
  const m = Math.round((Date.parse(iso) - Date.now()) / 60000)
  return m <= 0 ? 'Saindo agora' : m < 60 ? `Sai em ${m} min` : `Sai em ${Math.floor(m / 60)} h`
}
function rotuloDoPublico(p: Publico, parceiros: Array<{ codigo: string; nome: string }>): string {
  if (p.so_admins) return 'Só admins (teste)'
  if (p.todos) return 'Todos os cadastrados'
  const partes: string[] = []
  if (p.subplanos?.length) partes.push(p.subplanos.map((s) => SUBPLANOS.find((x) => x.id === s)?.nome ?? s).join(', '))
  if (p.parceiros?.length) partes.push(p.parceiros.map((c) => (c === 'direto' ? 'Direto' : `${parceiros.find((x) => x.codigo === c)?.nome.split(' ')[0] ?? ''} /${c}`.trim())).join(', '))
  return partes.join(' · ') || 'Todos os cadastrados'
}

/** O story do painel no formato da tela do cliente (para a prévia e o "Ver como cliente"). */
function comoCliente(l: LinhaDoPainel['story']): Story {
  return {
    id: l.id, codigo: l.codigo, tipo: l.tipo, midia: l.midia_url, capa: l.capa_url, duracao: Number(l.duracao), enquadramento: l.enquadramento ?? {},
    chip: l.chip, titulo: l.titulo, subtitulo: l.subtitulo, quando: l.inicia_em, destaque: l.destaque, compartilhar: l.compartilhar, responder: l.responder,
    camadas: l.camadas ?? [], votos: null, meuVoto: null,
    visto: true, reacao: null, botao: l.botao_tipo ? { tipo: l.botao_tipo, texto: l.botao_texto, destino: l.botao_destino } : null, publico: l.publico,
  }
}

const Ico = ({ d }: { d: string }) => <svg viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
const IC = {
  mais: 'M12 5v14M5 12h14', olho: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', fechar: 'M6 6l12 12M18 6L6 18',
  enviar: 'M21.5 2.5L10.8 13.2M21.5 2.5l-7 19-3.7-8.3L2.5 9.5z', link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  lapis: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4', arquivo: 'M4 7h16M6 7v12h12V7M9 4h6', lixo: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  subir: 'M12 16V4M7 9l5-5 5 5M4 20h16', relogio: 'M12 7v5l3 2M12 21a9 9 0 100-18 9 9 0 000 18z', play: 'M8 5.5v13l10.5-6.5z', check: 'M5 12.5l4.2 4.2L19 7',
}

export function AdminStories({ sessao, papel }: Props) {
  const [linhas, setLinhas] = useState<LinhaDoPainel[] | null>(null)
  const [perfis, setPerfis] = useState<PerfilDoPainel[]>([])
  const [aba, setAba] = useState<SituacaoDoStory | 'todos'>('no-ar')
  const [aberto, setAberto] = useState<string | null>(() => storyPedido())
  const [compondo, setCompondo] = useState<{ editar?: LinhaDoPainel } | null>(null)
  const [vendo, setVendo] = useState<LinhaDoPainel | null>(null)
  const [estudio, setEstudio] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [perfilForm, setPerfilForm] = useState<Partial<PerfilDoPainel> | null>(null)
  const parceiros = useParceirosDaMarca(sessao, MARCA.id)
  const pleno = !!papel && (papel.geral || papel.total)
  const meuParceiro = papel && !papel.geral ? papel.parceiro : null

  const ler = useCallback(async () => {
    try {
      const [l, p] = await Promise.all([painelDeStories(sessao), perfisDoPainel(sessao)])
      setLinhas(l); setPerfis(p); setErro(null)
    } catch (e) { setErro((e as Error).message); setLinhas((x) => x ?? []) }
  }, [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    void ler()
    const t = window.setInterval(() => void ler(), 60_000)
    const mudou = () => void ler()
    window.addEventListener(EVENTO_STORIES, mudou)
    return () => { window.clearInterval(t); window.removeEventListener(EVENTO_STORIES, mudou) }
  }, [ler])

  const contagem = useMemo(() => {
    const c: Record<string, number> = { 'no-ar': 0, agendado: 0, destaque: 0, encerrado: 0, todos: 0 }
    for (const l of linhas ?? []) { c[situacao(l.story)]++; c.todos++ }
    return c
  }, [linhas])
  // abre na aba que tem algo, se a de "No ar" está vazia
  const primeiraVez = useRef(true)
  useEffect(() => {
    if (!linhas || !primeiraVez.current) return
    primeiraVez.current = false
    if (!contagem['no-ar'] && contagem.todos) setAba(contagem.destaque ? 'destaque' : contagem.agendado ? 'agendado' : 'todos')
  }, [linhas, contagem])

  const daAba = (linhas ?? []).filter((l) => aba === 'todos' || situacao(l.story) === aba)
  const noAr = (linhas ?? []).filter((l) => ['no-ar', 'destaque'].includes(situacao(l.story)))
  const pessoasNoAr = noAr.reduce((s, l) => s + l.pessoas, 0)
  const fimNoAr = noAr.reduce((s, l) => s + l.completos, 0)
  const linhaAberta = (linhas ?? []).find((l) => l.story.id === aberto) ?? null

  function mudou() { void ler(); window.dispatchEvent(new Event(EVENTO_STORIES)) }

  return (
    <div className="ast">
      {erro && <div className="ast-erro" role="alert">{erro}</div>}

      <section className="ast-resumo" aria-label="Resumo">
        <div><span>No ar agora</span><b>{n(contagem['no-ar'] + contagem.destaque)}</b><small>{contagem.destaque ? `${contagem.destaque} fixo${contagem.destaque > 1 ? 's' : ''}` : 'Somem 24 h depois'}</small></div>
        <div><span>Pessoas que viram</span><b>{n(pessoasNoAr)}</b><small>Nos stories no ar, sem contar admins</small></div>
        <div><span>Assistiram até o fim</span><b>{pessoasNoAr ? `${pct(fimNoAr, pessoasNoAr)}%` : '–'}</b><small>Média dos stories no ar</small></div>
        <div><span>Agendados</span><b>{n(contagem.agendado)}</b><small>Entram sozinhos na hora marcada</small></div>
      </section>

      <div className="ast-barra">
        <div className="ast-abas" role="tablist">
          {ABAS.map((a) => (
            <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={aba === a.id ? 'on' : ''} onClick={() => setAba(a.id)}>
              {a.nome}<span>{contagem[a.id]}</span>
            </button>
          ))}
        </div>
        <button type="button" className="ast-primario" onClick={() => setEstudio(true)}><Ico d={IC.mais} />Novo story</button>
      </div>

      {!linhas ? <div className="ast-grade">{[0, 1, 2, 3].map((i) => <div key={i} className="ast-cartao esqueleto" />)}</div>
        : !daAba.length ? (
          <div className="ast-vazio">
            <span className="sto-anel"><span className="ast-vazio-ico"><Ico d={IC.play} /></span></span>
            <h3>{aba === 'no-ar' ? 'Nenhum story no ar' : aba === 'agendado' ? 'Nenhum story agendado' : aba === 'destaque' ? 'Nenhum destaque fixo' : 'Nada por aqui'}</h3>
            <p>Suba um vídeo vertical ou uma foto. Ele aparece nas bolinhas do topo da Início de quem você escolher.</p>
            <button type="button" className="ast-primario" onClick={() => setEstudio(true)}><Ico d={IC.mais} />Publicar o primeiro</button>
          </div>
        ) : (
          <div className="ast-grade">
            {daAba.map((l) => {
              const sit = situacao(l.story)
              return (
                <button key={l.story.id} type="button" className="ast-cartao" onClick={() => setAberto(l.story.id)}>
                  <span className="ast-thumb">
                    {l.story.tipo === 'imagem' || l.story.capa_url ? <img src={l.story.capa_url ?? l.story.midia_url} alt="" style={estiloDaMidia(l.story.enquadramento)} loading="lazy" />
                      : <video src={l.story.midia_url} muted preload="metadata" style={estiloDaMidia(l.story.enquadramento)} />}
                    <i className="ast-thumb-sombra" />
                    <em className={`ast-sit ${sit}`}><i />{ROTULO_SITUACAO[sit]}</em>
                    {l.story.tipo === 'video' && <em className="ast-dur">{Math.round(l.story.duracao)}s</em>}
                    <span className="ast-thumb-pf"><Avatar foto={l.perfil.foto} nome={l.perfil.nome} tamanho={26} /></span>
                    {!!l.story.camadas?.length && <span className="ast-thumb-cam sto-quadro"><CamadasDoStory camadas={l.story.camadas} modo="editar" /></span>}
                    {!l.story.camadas?.length && <span className="ast-thumb-tx">{rotulo(l.story)}</span>}
                  </span>
                  <span className="ast-cartao-num">
                    <span><b>{n(l.pessoas)}</b>Pessoas</span>
                    <span><b>{l.pessoas ? `${pct(l.completos, l.pessoas)}%` : '–'}</b>Até o fim</span>
                  </span>
                  <span className="ast-cartao-pe">
                    {sit === 'agendado' ? `Entra ${dataHora(l.story.inicia_em)}` : sit === 'no-ar' && l.story.expira_em ? faltam(l.story.expira_em) : sit === 'destaque' ? 'Fixo até tirar' : `Publicado ${dataHora(l.story.inicia_em)}`}
                  </span>
                </button>
              )
            })}
          </div>
        )}

      <section className="ast-perfis">
        <header>
          <div><h3>Bolinhas</h3><p>Cada bolinha junta os stories de um perfil. A ordem vale para quem ainda não viu.</p></div>
          {pleno && <button type="button" className="ast-secundario" onClick={() => setPerfilForm({ nome: '', ordem: 100, oficial: false })}><Ico d={IC.mais} />Nova bolinha</button>}
        </header>
        <div className="ast-perfis-lista">
          {perfis.map((p) => (
            <button key={p.id} type="button" className="ast-perfil" onClick={() => pleno && setPerfilForm(p)} disabled={!pleno}>
              <Avatar foto={p.foto_url} nome={p.nome} tamanho={44} />
              <span><b>{p.nome}</b><small>{p.parceiro ? `Parceiro /${p.parceiro}` : 'Da plataforma'}{p.oficial ? ' · Oficial' : ''}</small></span>
            </button>
          ))}
        </div>
      </section>

      {linhaAberta && (
        <Detalhe sessao={sessao} linha={linhaAberta} parceiros={parceiros} pleno={pleno}
          aoFechar={() => setAberto(null)} aoVer={() => setVendo(linhaAberta)} aoEditar={() => { setCompondo({ editar: linhaAberta }); setAberto(null) }} aoMudar={mudou} />
      )}
      {compondo && (
        <Compositor sessao={sessao} perfis={perfis.filter((p) => !meuParceiro || !p.parceiro || p.parceiro === meuParceiro)} parceiros={parceiros}
          meuParceiro={meuParceiro} pleno={pleno} editar={compondo.editar}
          aoFechar={() => setCompondo(null)} aoPublicar={(id) => { setCompondo(null); mudou(); setAba('todos'); setAberto(id) }} />
      )}
      {estudio && <Suspense fallback={null}><EstudioDeStories sessao={sessao} papel={papel} aoFechar={() => setEstudio(false)} aoPublicado={(id) => { mudou(); setAba('todos'); setAberto(id) }} /></Suspense>}
      {perfilForm && <FormDePerfil sessao={sessao} inicial={perfilForm} parceiros={parceiros} aoFechar={() => setPerfilForm(null)} aoSalvar={() => { setPerfilForm(null); mudou() }} />}
      {vendo && (
        <VisualizadorDeStories perfis={[{ id: vendo.perfil.id, nome: vendo.perfil.nome, foto: vendo.perfil.foto, oficial: vendo.perfil.oficial, ordem: 0, parceiro: vendo.perfil.parceiro, itens: [comoCliente(vendo.story)] }]}
          perfilInicial={0} sessao={null} previa equipe aoFechar={() => setVendo(null)} linkDe={(s) => linkDoStory(s.codigo, vendo.perfil.parceiro ?? '')} />
      )}
    </div>
  )
}

/* =================================================================== métricas */

function Detalhe({ sessao, linha, parceiros, pleno, aoFechar, aoVer, aoEditar, aoMudar }: {
  sessao: SessaoTeeds; linha: LinhaDoPainel; parceiros: Array<{ codigo: string; nome: string }>; pleno: boolean
  aoFechar: () => void; aoVer: () => void; aoEditar: () => void; aoMudar: () => void
}) {
  const s = linha.story
  const [m, setM] = useState<Metricas | null>(null)
  const [extra, setExtra] = useState<{ votos: Record<string, number>; cliques_por: Record<string, number> } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  // filtro de "Quem viu" (10/11/2026, lista do Victor: quem curtiu, quem reagiu e com o quê, quem respondeu)
  const [filtro, setFiltro] = useState<string>('todos')
  const [confirmar, setConfirmar] = useState<'arquivar' | 'apagar' | null>(null)
  const [recado, setRecado] = useState<string | null>(null)
  const souDono = pleno || s.criado_por === sessao.usuario.id
  const sit = situacao(s)

  useEffect(() => {
    let vivo = true
    const ler = () => {
      void metricasExtras(sessao, s.id).then((x) => vivo && setExtra(x))
      return metricasDoStory(sessao, s.id).then((x) => { if (vivo) { setM(x); setErro(null) } }).catch((e) => vivo && setErro((e as Error).message))
    }
    void ler()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void ler() }, 30_000)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', esc)
    return () => { vivo = false; window.clearInterval(t); window.removeEventListener('keydown', esc) }
  }, [s.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function remover(apagar: boolean) {
    try { await removerStory(sessao, s.id, apagar); aoMudar(); if (apagar) aoFechar(); else { setConfirmar(null); setRecado('Story tirado do ar. As métricas ficam guardadas.') } }
    catch (e) { setRecado((e as Error).message) }
  }
  async function copiarLink() {
    const url = linkDoStory(s.codigo, linha.perfil.parceiro ?? '')
    try { await navigator.clipboard.writeText(url); setRecado('Link copiado') } catch { setRecado(url) }
  }

  const passa = (q: Metricas['quem'][number], f: string) =>
    f === 'todos' ? true : f === 'curtiram' ? !!q.curtiu : f === 'reagiram' ? !!q.reacao : f === 'responderam' ? !!q.respondeu
      : f === 'fim' ? q.completo : f === 'clicaram' ? q.clicou : f.startsWith('r:') ? q.reacao === f.slice(2) : true
  const termo = semAcento(busca.trim())
  const quem = (m?.quem ?? []).filter((q) => passa(q, filtro) && (!termo || semAcento(`${q.nome ?? ''} ${q.email}`).includes(termo)))
  const totalReacoes = m ? Object.values(m.reacoes).reduce((a, b) => a + b, 0) : 0
  const curtidas = m?.curtidas ?? (m?.quem ?? []).filter((q) => q.curtiu).length
  const reacoesOrdenadas = m ? Object.entries(m.reacoes).sort((a, b) => b[1] - a[1]) : []
  const filtros: Array<[string, string, number]> = m ? ([
    ['todos', 'Todos', m.quem.length],
    ['curtiram', '❤ Curtiram', m.quem.filter((q) => q.curtiu).length],
    ['reagiram', 'Reagiram', m.quem.filter((q) => q.reacao).length],
    ...reacoesOrdenadas.map(([e]) => [`r:${e}`, e, m.quem.filter((q) => q.reacao === e).length] as [string, string, number]),
    ['responderam', 'Responderam', m.quem.filter((q) => q.respondeu).length],
    ['fim', 'Até o fim', m.quem.filter((q) => q.completo).length],
    ...(s.botao_tipo || (s.camadas ?? []).some((c) => c.tipo === 'link') ? [['clicaram', 'Clicaram', m.quem.filter((q) => q.clicou).length] as [string, string, number]] : []),
  ] as Array<[string, string, number]>).filter(([id, , q]) => id === 'todos' || q > 0 || id === filtro) : []
  const enquete = (s.camadas ?? []).find((c) => c.tipo === 'enquete') as Extract<Camada, { tipo: 'enquete' }> | undefined
  const links = (s.camadas ?? []).filter((c) => c.tipo === 'link') as Array<Extract<Camada, { tipo: 'link' }>>
  const totalVotos = Object.values(extra?.votos ?? {}).reduce((a, b) => a + b, 0)

  return (
    <div className="ast-cortina" onClick={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <aside className="ast-gaveta" role="dialog" aria-modal="true" aria-label="Métricas do story">
        <header className="ast-gaveta-cab">
          <span className="ast-mini">{s.tipo === 'imagem' || s.capa_url ? <img src={s.capa_url ?? s.midia_url} alt="" style={estiloDaMidia(s.enquadramento)} /> : <video src={s.midia_url} muted preload="metadata" />}</span>
          <div>
            <span className={`ast-sit plano ${sit}`}><i />{ROTULO_SITUACAO[sit]}</span>
            <h2>{rotulo(s)}</h2>
            <p>{linha.perfil.nome} · publicado {haQuanto(s.inicia_em)}{s.criado_por_nome ? ` por ${s.criado_por_nome}` : ''} · {rotuloDoPublico(s.publico, parceiros)}
              {sit === 'no-ar' && s.expira_em ? ` · ${faltam(s.expira_em)}` : ''}{s.avisado_em ? ' · Aviso no celular enviado' : ''}</p>
          </div>
          <button type="button" className="ast-x" onClick={aoFechar} aria-label="Fechar"><Ico d={IC.fechar} /></button>
        </header>
        <div className="ast-acoes">
          <button type="button" className="ast-secundario" onClick={aoVer}><Ico d={IC.olho} />Ver como cliente</button>
          {s.compartilhar && <button type="button" className="ast-secundario" onClick={() => void copiarLink()}><Ico d={IC.link} />Copiar link</button>}
          {souDono && <button type="button" className="ast-secundario" onClick={aoEditar}><Ico d={IC.lapis} />Editar</button>}
          {souDono && sit !== 'encerrado' && <button type="button" className="ast-secundario" onClick={() => setConfirmar('arquivar')}><Ico d={IC.arquivo} />Tirar do ar</button>}
          {souDono && <button type="button" className="ast-secundario perigo" onClick={() => setConfirmar('apagar')}><Ico d={IC.lixo} />Apagar</button>}
        </div>
        {confirmar && (
          <div className="ast-confirma" role="alertdialog">
            <p>{confirmar === 'apagar' ? 'Apagar de vez? O vídeo e as métricas somem e não dá para desfazer.' : 'Tirar do ar agora? Some das bolinhas na hora; as métricas ficam guardadas.'}</p>
            <button type="button" className="ast-secundario" onClick={() => setConfirmar(null)}>Cancelar</button>
            <button type="button" className={confirmar === 'apagar' ? 'ast-perigo' : 'ast-primario'} onClick={() => void remover(confirmar === 'apagar')}>{confirmar === 'apagar' ? 'Apagar de vez' : 'Tirar do ar'}</button>
          </div>
        )}
        {recado && <div className="ast-recado" role="status" onAnimationEnd={() => setRecado(null)}>{recado}</div>}

        {erro && <div className="ast-erro">{erro}</div>}
        {!m ? <div className="ast-carregando">Lendo as métricas…</div> : (
          <div className="ast-metricas">
            <div className="ast-kpis">
              <div><span>Visualizações</span><b>{n(m.vistas)}</b><small>{m.pessoas ? `${(m.vistas / m.pessoas).toFixed(1).replace('.', ',')} por pessoa` : 'Ainda ninguém viu'}</small></div>
              <div><span>Pessoas alcançadas</span><b>{n(m.pessoas)}</b><small>{m.publico ? `${pct(m.pessoas, m.publico)}% de ${n(m.publico)} no público` : 'Público vazio'}</small></div>
              <div><span>Assistiram até o fim</span><b>{m.pessoas ? `${pct(m.completos, m.pessoas)}%` : '–'}</b><small>{n(m.completos)} pessoas</small></div>
              <div><span>Cliques no botão</span><b>{n(m.cliques)}</b><small>{s.botao_tipo ? (m.pessoas ? `${pct(m.pessoas_clique, m.pessoas)}% de quem viu` : '–') : 'Story sem botão'}</small></div>
              <div><span>Compartilhamentos</span><b>{n(m.compartilhamentos)}</b><small>{n(m.visitas_link)} abriram o link · {n(m.cadastros_link)} cadastros</small></div>
              <div><span>Curtidas</span><b>{n(curtidas)}</b><small>{m.pessoas ? `${pct(curtidas, m.pessoas)}% de quem viu` : 'Nenhuma ainda'}</small></div>
              <div><span>Reações</span><b>{n(totalReacoes)}</b><small>{reacoesOrdenadas.map(([e, q]) => `${e} ${q}`).join('   ') || 'Nenhuma ainda'}</small></div>
              <div><span>Respostas</span><b>{n(m.respostas)}</b><small>{m.respostas ? 'Chegam no Suporte' : 'Nenhuma ainda'}</small></div>
            </div>

            <div className="ast-blocos">
              <section className="ast-bloco largo">
                <h4>Quantos ainda assistiam, segundo a segundo</h4>
                <p className="sub">De {n(m.pessoas)} pessoas, em cada segundo do {s.tipo === 'video' ? 'vídeo' : 'story'}</p>
                <Retencao valores={m.retencao} total={m.pessoas} />
              </section>
              <section className="ast-bloco">
                <h4>O que fizeram</h4>
                <p className="sub">Toques e saídas, de todas as visualizações</p>
                <Barras itens={[['Avançou com um toque', m.navegacao.avancou], ['Pulou para a próxima bolinha', m.navegacao.pulou], ['Saiu dos stories', m.navegacao.saiu], ['Voltou para rever', m.navegacao.voltou], ['Segurou para pausar', m.navegacao.pausou]]} />
              </section>
              <section className="ast-bloco">
                <h4>Por plano</h4>
                <p className="sub">Quem viu, pelo plano do cliente</p>
                <Barras itens={SUBPLANOS.map((p) => [p.nome, m.por_subplano[p.id] ?? 0] as [string, number])} total={m.pessoas} />
                {parceiros.length > 0 && <>
                  <h4 className="seg">Por parceiro</h4>
                  <Barras itens={[...parceiros.map((p) => [`${p.nome.split(' ')[0]} /${p.codigo}`, m.por_parceiro[p.codigo] ?? 0] as [string, number]), ['Direto', m.por_parceiro.direto ?? 0]]} total={m.pessoas} />
                </>}
              </section>
              <section className={`ast-bloco ${m.ultimas_respostas.length ? '' : 'largo'}`}>
                <h4>Quando viram</h4>
                <p className="sub">Primeira visualização, por hora</p>
                <PorHora itens={m.por_hora} />
              </section>
              {enquete && (
                <section className="ast-bloco">
                  <h4>Enquete{enquete.pergunta ? `: ${enquete.pergunta}` : ''}</h4>
                  <p className="sub">{n(totalVotos)} {totalVotos === 1 ? 'voto' : 'votos'} de clientes</p>
                  <Barras itens={enquete.opcoes.map((o, i) => [o, extra?.votos[String(i)] ?? 0] as [string, number])} total={totalVotos || undefined} />
                </section>
              )}
              {links.length > 0 && (
                <section className="ast-bloco">
                  <h4>Cliques nos links</h4>
                  <p className="sub">Cada figurinha de link do story</p>
                  <Barras itens={links.map((c) => [c.texto.trim() || dominio(c.url), extra?.cliques_por[c.id] ?? 0] as [string, number])} />
                </section>
              )}
              {m.ultimas_respostas.length > 0 && (
                <section className="ast-bloco">
                  <h4>Respostas</h4>
                  <p className="sub">Chegam também no Suporte, para a equipe responder</p>
                  <ul className="ast-respostas">{m.ultimas_respostas.map((r, i) => <li key={i}><b>{r.nome ?? 'Cliente'}</b><span>{r.texto}</span><small>{haQuanto(r.quando)}</small></li>)}</ul>
                </section>
              )}
            </div>

            <section className="ast-bloco largo">
              <div className="ast-quem-cab">
                <div><h4>Quem viu</h4><p className="sub">{n(m.pessoas)} {m.pessoas === 1 ? 'pessoa' : 'pessoas'}{m.quem.length < m.pessoas ? `, as ${n(m.quem.length)} mais recentes` : ''}. Admins não entram na conta.</p></div>
                <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou e-mail" aria-label="Buscar quem viu" />
              </div>
              {m.quem.length > 0 && (
                <div className="ast-filtros" role="group" aria-label="Filtrar quem viu">
                  {filtros.map(([id, rotulo, q]) => (
                    <button key={id} type="button" className={filtro === id ? 'ativo' : ''} aria-pressed={filtro === id} onClick={() => setFiltro(id)}>{rotulo}<i>{n(q)}</i></button>
                  ))}
                </div>
              )}
              {quem.length ? (
                <div className="ast-tabela"><table>
                  <thead><tr><th>Cliente</th><th>Plano</th><th>Parceiro</th><th>Assistiu</th><th>Vezes</th><th>Fez</th><th>Quando viu</th></tr></thead>
                  <tbody>{quem.map((q) => {
                    const p = q.completo ? 100 : pct(q.segundos, Number(s.duracao))
                    return (
                      <tr key={q.user_id}>
                        <td><span className="ast-pessoa">{q.foto ? <img src={q.foto} alt="" loading="lazy" /> : <i>{(q.nome || q.email).slice(0, 1).toUpperCase()}</i>}<span><b>{q.nome || 'Sem nome'}</b><small>{q.email}</small></span></span></td>
                        <td><span className={`ast-plano ${q.subplano}`}>{SUBPLANOS.find((x) => x.id === q.subplano)?.nome ?? q.subplano}</span></td>
                        <td><SeloDoParceiro codigo={q.parceiro} nome={parceiros.find((x) => x.codigo === q.parceiro)?.nome} /></td>
                        <td><span className="ast-assistiu"><i><b style={{ width: `${p}%` }} /></i>{p}%</span></td>
                        <td className="num">{q.vezes}</td>
                        <td className="ast-fez">
                          {q.curtiu && <span className="curtiu" title={q.curtiu_em ? `Curtiu ${dataHoraCurta(q.curtiu_em)}` : 'Curtiu'}>❤</span>}
                          {q.reacao && <span title="Reagiu">{q.reacao}</span>}
                          {q.respondeu && <span title="Respondeu (a mensagem está no Suporte)">Respondeu</span>}
                          {q.clicou && <span title="Clicou no botão">Clicou</span>}
                          {q.compartilhou && <span title="Compartilhou">Compart.</span>}
                          {!q.curtiu && !q.reacao && !q.respondeu && !q.clicou && !q.compartilhou && '–'}
                        </td>
                        <td className="ast-quando" title={q.primeira && q.primeira !== q.quando ? `Primeira vez: ${dataHoraCurta(q.primeira)}` : undefined}>
                          <b>{dataHoraCurta(q.quando)}</b><small>{haQuanto(q.quando)}</small>
                        </td>
                      </tr>
                    )
                  })}</tbody>
                </table></div>
              ) : <div className="ast-vazio-tab">{busca ? 'Ninguém com esse nome.' : filtro !== 'todos' ? 'Ninguém neste filtro.' : 'Ninguém viu ainda. Os números aparecem aqui assim que os clientes abrirem.'}</div>}
            </section>
          </div>
        )}
      </aside>
    </div>
  )
}

function Retencao({ valores, total }: { valores: number[]; total: number }) {
  const W = 620, H = 200, L = 40, R = 14, T = 14, B = 26
  if (!total || valores.length < 2) return <div className="ast-vazio-tab">A curva aparece com as primeiras visualizações.</div>
  const ult = valores.length - 1
  const x = (i: number) => L + ((W - L - R) * i) / ult
  const y = (v: number) => T + (H - T - B) * (1 - v / total)
  const linha = valores.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  // a maior saída entre dois segundos
  let pior = 1, queda = 0
  for (let i = 1; i < valores.length; i++) { const d = valores[i - 1] - valores[i]; if (d > queda) { queda = d; pior = i } }
  const passo = ult <= 15 ? 5 : ult <= 30 ? 10 : 15
  const marcas = Array.from({ length: Math.floor(ult / passo) + 1 }, (_, i) => i * passo)
  return (
    <svg className="ast-curva" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Retenção por segundo">
      {[0, 25, 50, 75, 100].map((p) => <g key={p}><line x1={L} x2={W - R} y1={y((p / 100) * total)} y2={y((p / 100) * total)} /><text x={L - 8} y={y((p / 100) * total) + 3.5} textAnchor="end">{p}%</text></g>)}
      {marcas.map((sg) => <text key={sg} x={x(sg)} y={H - 7} textAnchor="middle">{sg}s</text>)}
      <path className="area" d={`${linha} L${x(ult)} ${y(0)} L${x(0)} ${y(0)} Z`} />
      <path className="linha" d={linha} />
      {queda > 0 && <g className="pior"><circle cx={x(pior)} cy={y(valores[pior])} r={4.5} /><text x={x(pior) + (pior > ult * 0.7 ? -8 : 8)} y={y(valores[pior]) - 9} textAnchor={pior > ult * 0.7 ? 'end' : 'start'}>Maior saída aos {pior}s</text></g>}
      <g className="fim"><circle cx={x(ult)} cy={y(valores[ult])} r={4.5} /><text x={x(ult) - 8} y={y(valores[ult]) + (valores[ult] / total > 0.8 ? 18 : -9)} textAnchor="end">{pct(valores[ult], total)}% até o fim</text></g>
    </svg>
  )
}

function Barras({ itens, total }: { itens: Array<[string, number]>; total?: number }) {
  const max = Math.max(1, ...itens.map((i) => i[1]))
  return (
    <div className="ast-barras">
      {itens.map(([t, v]) => (
        <div key={t}><span>{t}</span><i><b style={{ width: `${(v / (total || max)) * 100}%` }} /></i><em>{total ? `${pct(v, total)}%` : n(v)}</em></div>
      ))}
    </div>
  )
}

function PorHora({ itens }: { itens: Array<{ hora: string; n: number }> }) {
  if (!itens.length) return <div className="ast-vazio-tab">Sem visualizações ainda.</div>
  const max = Math.max(1, ...itens.map((i) => i.n))
  const ult = itens.slice(-12)
  return (
    <div className="ast-horas">
      {ult.map((h) => (
        <div key={h.hora} title={`${new Date(h.hora).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit' })}h: ${h.n}`}>
          <i style={{ height: `${Math.max(4, (h.n / max) * 100)}%` }} /><em>{h.n}</em>
          <span>{new Date(h.hora).getHours()}h</span>
        </div>
      ))}
    </div>
  )
}

/* =================================================================== publicar */

interface Arquivo { nome: string; preparando: number | null; enviando: number | null; pronto: { url: string; caminho: string; capa: string | null } | null; erro: string | null; local: string; tipo: 'video' | 'imagem'; duracao: number; aviso: string | null }

function Compositor({ sessao, perfis, parceiros, meuParceiro, pleno, editar, aoFechar, aoPublicar }: {
  sessao: SessaoTeeds; perfis: PerfilDoPainel[]; parceiros: Array<{ codigo: string; nome: string }>; meuParceiro: string | null; pleno: boolean
  editar?: LinhaDoPainel; aoFechar: () => void; aoPublicar: (id: string) => void
}) {
  const e = editar?.story
  const [arq, setArq] = useState<Arquivo | null>(e ? { nome: '', preparando: null, enviando: null, pronto: { url: e.midia_url, caminho: e.midia_caminho ?? '', capa: e.capa_url }, erro: null, local: e.midia_url, tipo: e.tipo, duracao: Number(e.duracao), aviso: null } : null)
  const [perfilId, setPerfilId] = useState(e?.perfil_id ?? perfis.find((p) => !p.parceiro || p.parceiro === meuParceiro)?.id ?? perfis[0]?.id ?? '')
  const [chip, setChip] = useState(e?.chip ?? '')
  const [titulo, setTitulo] = useState(e?.titulo ?? '')
  const [subtitulo, setSubtitulo] = useState(e?.subtitulo ?? '')
  const [botaoTipo, setBotaoTipo] = useState<BotaoTipo | ''>(e?.botao_tipo ?? '')
  const [botaoTexto, setBotaoTexto] = useState(e?.botao_texto ?? '')
  const [botaoLink, setBotaoLink] = useState(e?.botao_destino ?? '')
  const [modoPublico, setModoPublico] = useState<'todos' | 'escolher' | 'admins'>(e ? (e.publico.so_admins ? 'admins' : e.publico.todos ? 'todos' : 'escolher') : meuParceiro ? 'escolher' : 'todos')
  const [subplanos, setSubplanos] = useState<string[]>(e?.publico.subplanos ?? [])
  const [parcs, setParcs] = useState<string[]>(e?.publico.parceiros ?? [])
  const [quando, setQuando] = useState<'agora' | 'agendar'>(e && Date.parse(e.inicia_em) > Date.now() ? 'agendar' : 'agora')
  const [inicio, setInicio] = useState(e ? paraInput(new Date(e.inicia_em)) : paraInput(new Date(Date.now() + 3600_000)))
  const [duracaoNoAr, setDuracaoNoAr] = useState<'24h' | 'ate' | 'fixo'>(e ? (e.destaque ? 'fixo' : '24h') : '24h')
  const [ate, setAte] = useState(paraInput(new Date(Date.now() + 3 * 86400_000)))
  const [responder, setResponder] = useState(e?.responder ?? true)
  const [compartilhar, setCompartilhar] = useState(e?.compartilhar ?? true)
  const [avisar, setAvisar] = useState(false)
  const [enq, setEnq] = useState<Enquadramento>(e?.enquadramento ?? { zoom: 1, x: 50, y: 50 })
  const [guias, setGuias] = useState(true)
  const [alcance, setAlcance] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [cheia, setCheia] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const cancelar = useRef<(() => void) | null>(null)
  const prevRef = useRef<HTMLDivElement | null>(null)
  const arrasto = useRef<{ x: number; y: number; ex: number; ey: number } | null>(null)

  const publico: Publico = modoPublico === 'admins' ? { so_admins: true } : modoPublico === 'todos' ? { todos: true }
    : { subplanos, parceiros: meuParceiro ? [meuParceiro] : parcs }
  const perfil = perfis.find((p) => p.id === perfilId)

  // o alcance do público, na hora
  useEffect(() => {
    let vivo = true
    setAlcance(null)
    const t = window.setTimeout(() => { alcanceDoPublico(sessao, publico).then((x) => vivo && setAlcance(x)).catch(() => vivo && setAlcance(null)) }, 250)
    return () => { vivo = false; window.clearTimeout(t) }
  }, [JSON.stringify(publico)]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && !cheia) aoFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [cheia, aoFechar])
  useEffect(() => () => cancelar.current?.(), [])

  async function escolher(f: File | undefined) {
    if (!f) return
    cancelar.current?.()
    const local = URL.createObjectURL(f)
    const ehFoto = f.type.startsWith('image/') || /\.(hei[cf]|jpe?g|png|webp)$/i.test(f.name)
    setArq({ nome: f.name, preparando: 0, enviando: null, pronto: null, erro: null, local, tipo: ehFoto ? 'imagem' : 'video', duracao: 6, aviso: null })
    setEnq({ zoom: 1, x: 50, y: 50 })
    try {
      const m = await prepararMidia(f, (p) => setArq((a) => (a && a.local === local ? { ...a, preparando: p } : a)))
      const aviso = m.cortado ? `O vídeo tinha mais de ${LIMITE_SEGUNDOS} s: ficaram os primeiros ${LIMITE_SEGUNDOS}.` : !m.convertido && m.tipo === 'video' ? 'Este navegador não converte vídeo: vai o arquivo original.' : null
      const previa = URL.createObjectURL(m.arquivo)
      setArq((a) => (a && a.local === local ? { ...a, preparando: null, enviando: 0, duracao: m.duracao, tipo: m.tipo, aviso, local: previa } : a))
      const envio = enviarMidia(sessao, m, (p) => setArq((a) => (a && a.local === previa ? { ...a, enviando: p } : a)))
      cancelar.current = envio.cancelar
      const pronto = await envio.promessa
      setArq((a) => (a && a.local === previa ? { ...a, enviando: null, pronto } : a))
    } catch (err) {
      setArq((a) => (a && (a.local === local || a.preparando !== null || a.enviando !== null) ? { ...a, preparando: null, enviando: null, erro: (err as Error).message } : a))
    }
  }

  function arrastar(ev: PE<HTMLDivElement>) {
    if (!arq || ev.button !== 0) return
    ;(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId)
    arrasto.current = { x: ev.clientX, y: ev.clientY, ex: enq.x ?? 50, ey: enq.y ?? 50 }
    setArrastando(true)
  }
  function mover(ev: PE<HTMLDivElement>) {
    const a = arrasto.current, el = prevRef.current
    if (!a || !el) return
    const r = el.getBoundingClientRect()
    // arrastar para a direita mostra mais da esquerda (como mover a foto com o dedo)
    const nx = Math.min(100, Math.max(0, a.ex - ((ev.clientX - a.x) / r.width) * 100 * 1.2))
    const ny = Math.min(100, Math.max(0, a.ey - ((ev.clientY - a.y) / r.height) * 100 * 1.2))
    setEnq((q) => ({ ...q, x: Math.round(nx), y: Math.round(ny) }))
  }

  const ocupado = !!arq && (arq.preparando !== null || arq.enviando !== null)
  const linkInvalido = botaoTipo === 'link' && !/^https?:\/\/\S+\.\S+/.test(botaoLink.trim())
  const semPublico = modoPublico === 'escolher' && !subplanos.length && !(meuParceiro || parcs.length)
  const pronto = !!arq?.pronto && !!perfilId && !linkInvalido && !semPublico && !salvando

  async function publicar() {
    if (!arq?.pronto || !pronto) return
    setSalvando(true); setErro(null)
    try {
      const novo: NovoStory = {
        id: e?.id, perfil_id: perfilId, tipo: arq.tipo, midia_url: arq.pronto.url, midia_caminho: arq.pronto.caminho || null, capa_url: arq.pronto.capa,
        duracao: arq.tipo === 'imagem' ? 6 : Math.max(1, Math.round(arq.duracao * 10) / 10), enquadramento: enq,
        chip: chip.trim(), titulo: titulo.trim(), subtitulo: subtitulo.trim(), botao_tipo: botaoTipo, botao_texto: botaoTexto.trim(),
        botao_destino: botaoTipo === 'link' ? botaoLink.trim() : '', publico,
        inicia_em: quando === 'agendar' ? new Date(inicio).toISOString() : e ? e.inicia_em : null,
        expira_em: duracaoNoAr === 'ate' ? new Date(ate).toISOString() : null, destaque: duracaoNoAr === 'fixo', compartilhar, responder,
      }
      const salvo = await salvarStory(sessao, novo)
      if (avisar && pleno && quando === 'agora' && modoPublico !== 'admins') {
        const parceiro = publico.parceiros?.length === 1 && publico.parceiros[0] !== 'direto' ? publico.parceiros[0] : null
        await avisarNoCelular(sessao, salvo.id, `${perfil?.nome ?? MARCA.prosa} postou um story`, titulo.trim() || 'Toque para ver na Início.', parceiro).catch(() => undefined)
      }
      aoPublicar(salvo.id)
    } catch (err) { setErro((err as Error).message); setSalvando(false) }
  }

  const prev: Story = {
    id: 'previa', codigo: 'previa', camadas: e?.camadas ?? [], votos: null, meuVoto: null, tipo: arq?.tipo ?? 'imagem', midia: arq?.local ?? '', capa: null, duracao: arq?.tipo === 'video' ? arq.duracao : 6, enquadramento: enq,
    chip: chip.trim() || null, titulo: titulo.trim() || null, subtitulo: subtitulo.trim() || null, quando: new Date().toISOString(), destaque: false,
    compartilhar, responder, visto: false, reacao: null, botao: botaoTipo ? { tipo: botaoTipo, texto: botaoTexto.trim() || null, destino: botaoLink } : null, publico,
  }
  const progresso = arq?.preparando !== null && arq?.preparando !== undefined ? { rotulo: 'Convertendo para 1080p', f: arq.preparando }
    : arq?.enviando !== null && arq?.enviando !== undefined ? { rotulo: 'Enviando', f: arq.enviando } : null

  return (
    <div className="ast-cortina">
      <section className="ast-compor" role="dialog" aria-modal="true" aria-label={e ? 'Editar story' : 'Novo story'}>
        <header className="ast-compor-cab">
          <div><h2>{e ? 'Editar story' : 'Novo story'}</h2><p>{e ? 'O vídeo fica o mesmo; textos, botão, público e prazo mudam na hora.' : 'Vídeo vertical 9:16 ou foto. Até 60 s.'}</p></div>
          <button type="button" className="ast-x" onClick={aoFechar} aria-label="Fechar"><Ico d={IC.fechar} /></button>
        </header>

        <div className="ast-compor-corpo">
          {/* ------------------------------ a prévia */}
          <div className="ast-previa-col">
            <div className="ast-celular">
              <div ref={prevRef} className={`ast-tela ${arrastando ? 'arrastando' : ''} ${arq ? 'com-midia' : ''}`}
                onPointerDown={arrastar} onPointerMove={mover} onPointerUp={() => { arrasto.current = null; setArrastando(false) }} onPointerCancel={() => { arrasto.current = null; setArrastando(false) }}>
                {!arq ? (
                  <label className="ast-solte" onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { ev.preventDefault(); void escolher(ev.dataTransfer.files[0]) }}>
                    <input type="file" accept="video/*,image/*,.heic,.heif,.mov" onChange={(ev) => void escolher(ev.target.files?.[0])} />
                    <span className="ast-solte-ico"><Ico d={IC.subir} /></span>
                    <b>Escolha o vídeo ou a foto</b>
                    <small>Arraste aqui ou toque para escolher<br />MP4, MOV do iPhone, JPG, PNG ou HEIC</small>
                  </label>
                ) : (
                  <>
                    {arq.tipo === 'video'
                      ? <video key={arq.local} src={arq.local} autoPlay muted loop playsInline style={estiloDaMidia(enq)} />
                      : <img key={arq.local} src={arq.local} alt="" draggable={false} style={estiloDaMidia(enq)} />}
                    <i className="sto-sombra cima" /><i className="sto-sombra baixo" />
                    <div className="ast-p-topo">
                      <div className="ast-p-barra"><b /></div>
                      <div className="ast-p-cab">{perfil && <Avatar foto={perfil.foto_url} nome={perfil.nome} tamanho={24} />}<b>{perfil?.nome}</b><small>agora</small></div>
                    </div>
                    {(prev.chip || prev.titulo || prev.subtitulo) && (
                      <div className={`ast-p-texto ${prev.botao ? 'com-botao' : ''}`}>
                        {prev.chip && <span className="sto-chip">{prev.chip}</span>}
                        {prev.titulo && <h3>{prev.titulo}</h3>}
                        {prev.subtitulo && <p>{prev.subtitulo}</p>}
                      </div>
                    )}
                    {prev.botao && <span className="ast-p-cta">{prev.botao.texto || BOTAO_PADRAO[prev.botao.tipo]} ›</span>}
                    <div className="ast-p-pe"><span>Responder a {perfil?.nome}…</span><i>♡</i><i>➤</i></div>
                    {guias && <><i className="ast-guia cima">Área do nome</i><i className="ast-guia baixo">Área dos botões</i></>}
                    {progresso && (
                      <div className="ast-p-carga">
                        <span className="sto-anel girando"><span className="ast-p-carga-num">{Math.round(progresso.f * 100)}%</span></span>
                        <b>{progresso.rotulo}</b>
                        {arq.nome && <small>{arq.nome}</small>}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
            {arq && (
              <div className="ast-enq">
                <label>Zoom <input type="range" min={100} max={180} value={Math.round((enq.zoom ?? 1) * 100)} onChange={(ev) => setEnq((q) => ({ ...q, zoom: Number(ev.target.value) / 100 }))} /><em>{Math.round((enq.zoom ?? 1) * 100)}%</em></label>
                <div className="ast-enq-bts">
                  <button type="button" onClick={() => setEnq({ zoom: 1, x: 50, y: 50 })}>Centralizar</button>
                  <button type="button" className={guias ? 'on' : ''} onClick={() => setGuias((g) => !g)}>Áreas seguras</button>
                  {!e && <label className="ast-trocar">Trocar arquivo<input type="file" accept="video/*,image/*,.heic,.heif,.mov" onChange={(ev) => void escolher(ev.target.files?.[0])} /></label>}
                </div>
                <small className="ast-dica">Arraste a imagem para enquadrar.</small>
              </div>
            )}
            {arq?.erro && <div className="ast-erro">{arq.erro}</div>}
            {arq?.aviso && <div className="ast-aviso">{arq.aviso}</div>}
            {arq?.pronto && !arq.erro && !e && <div className="ast-ok"><Ico d={IC.check} />{arq.tipo === 'video' ? `Vídeo pronto · ${Math.round(arq.duracao)} s` : 'Foto pronta'}</div>}
          </div>

          {/* ------------------------------ os campos */}
          <div className="ast-campos">
            <fieldset>
              <legend>Bolinha</legend>
              <div className="ast-chips">
                {perfis.map((p) => (
                  <button key={p.id} type="button" className={perfilId === p.id ? 'on' : ''} onClick={() => setPerfilId(p.id)}>
                    <Avatar foto={p.foto_url} nome={p.nome} tamanho={22} />{p.nome}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend>Texto na tela <small>Opcional: deixe em branco se o vídeo já tem texto</small></legend>
              <div className="ast-etiquetas">
                {ETIQUETAS.map((t) => <button key={t} type="button" className={chip === t ? 'on' : ''} onClick={() => setChip(chip === t ? '' : t)}>{t}</button>)}
              </div>
              <label className="ast-campo"><span>Etiqueta</span><input value={chip} onChange={(ev) => setChip(ev.target.value)} maxLength={30} placeholder="Ex.: Aula nova" /><em>{chip.length}/30</em></label>
              <label className="ast-campo"><span>Título</span><input value={titulo} onChange={(ev) => setTitulo(ev.target.value)} maxLength={70} placeholder="Ex.: Primeiro depósito em 2 minutos" /><em>{titulo.length}/70</em></label>
              <label className="ast-campo"><span>Frase de apoio</span><input value={subtitulo} onChange={(ev) => setSubtitulo(ev.target.value)} maxLength={120} placeholder="Ex.: Direto no caixa da Deriv, pelo celular." /><em>{subtitulo.length}/120</em></label>
            </fieldset>

            <fieldset>
              <legend>Botão</legend>
              <div className="ast-duplo">
                <select value={botaoTipo} onChange={(ev) => { const v = ev.target.value as BotaoTipo | ''; setBotaoTipo(v); setBotaoTexto('') }} aria-label="O que o botão faz">
                  {BOTOES.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
                {botaoTipo && <input value={botaoTexto} onChange={(ev) => setBotaoTexto(ev.target.value)} maxLength={30} placeholder={BOTAO_PADRAO[botaoTipo]} aria-label="Texto do botão" />}
              </div>
              {botaoTipo === 'link' && <label className="ast-campo"><span>Endereço</span><input value={botaoLink} onChange={(ev) => setBotaoLink(ev.target.value)} placeholder="https://" inputMode="url" />{linkInvalido && botaoLink && <em className="erro">Endereço inválido</em>}</label>}
            </fieldset>

            <fieldset>
              <legend>Quem vê</legend>
              <div className="ast-seg">
                {!meuParceiro && <button type="button" className={modoPublico === 'todos' ? 'on' : ''} onClick={() => setModoPublico('todos')}>Todos</button>}
                <button type="button" className={modoPublico === 'escolher' ? 'on' : ''} onClick={() => setModoPublico('escolher')}>{meuParceiro ? 'Meus clientes' : 'Escolher'}</button>
                <button type="button" className={modoPublico === 'admins' ? 'on' : ''} onClick={() => setModoPublico('admins')}>Só admins (teste)</button>
              </div>
              {modoPublico === 'escolher' && (
                <div className="ast-publico">
                  <span>Planos <small>Nenhum marcado = todos os planos</small></span>
                  <div className="ast-chips">{SUBPLANOS.map((p) => <button key={p.id} type="button" className={subplanos.includes(p.id) ? 'on' : ''} onClick={() => setSubplanos((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))}>{p.nome}</button>)}</div>
                  {!meuParceiro && parceiros.length > 0 && <>
                    <span>Parceiros <small>Nenhum marcado = todos</small></span>
                    <div className="ast-chips">
                      {parceiros.map((p) => <button key={p.codigo} type="button" className={parcs.includes(p.codigo) ? 'on' : ''} onClick={() => setParcs((l) => (l.includes(p.codigo) ? l.filter((x) => x !== p.codigo) : [...l, p.codigo]))}>
                        <AvatarDoParceiro codigo={p.codigo} nome={p.nome} tamanho={20} />{p.nome.split(' ')[0]}</button>)}
                      <button type="button" className={parcs.includes('direto') ? 'on' : ''} onClick={() => setParcs((l) => (l.includes('direto') ? l.filter((x) => x !== 'direto') : [...l, 'direto']))}>Direto</button>
                    </div>
                  </>}
                  {meuParceiro && <p className="ast-nota">Vai só para os seus clientes (/{meuParceiro}).</p>}
                </div>
              )}
              <p className="ast-alcance">{semPublico ? 'Marque um plano ou um parceiro.' : <>Alcança <b>{alcance === null ? '…' : n(alcance)}</b> {modoPublico === 'admins' ? 'admins' : `${alcance === 1 ? 'pessoa' : 'pessoas'} com acesso ativo`}</>}</p>
            </fieldset>

            <fieldset className="ast-dois">
              <div>
                <legend>Quando entra</legend>
                <div className="ast-seg"><button type="button" className={quando === 'agora' ? 'on' : ''} onClick={() => setQuando('agora')}>Agora</button><button type="button" className={quando === 'agendar' ? 'on' : ''} onClick={() => setQuando('agendar')}>Agendar</button></div>
                {quando === 'agendar' && <input type="datetime-local" value={inicio} onChange={(ev) => setInicio(ev.target.value)} aria-label="Data e hora de entrada" />}
              </div>
              <div>
                <legend>Fica no ar</legend>
                <div className="ast-seg"><button type="button" className={duracaoNoAr === '24h' ? 'on' : ''} onClick={() => setDuracaoNoAr('24h')}>24 horas</button><button type="button" className={duracaoNoAr === 'ate' ? 'on' : ''} onClick={() => setDuracaoNoAr('ate')}>Até</button><button type="button" className={duracaoNoAr === 'fixo' ? 'on' : ''} onClick={() => setDuracaoNoAr('fixo')}>Fixo</button></div>
                {duracaoNoAr === 'ate' && <input type="datetime-local" value={ate} onChange={(ev) => setAte(ev.target.value)} aria-label="Sai do ar em" />}
                {duracaoNoAr === 'fixo' && <small className="ast-nota">Fica até alguém tirar do ar.</small>}
              </div>
            </fieldset>

            <fieldset className="ast-chaves">
              <label><input type="checkbox" checked={responder} onChange={(ev) => setResponder(ev.target.checked)} /><span><b>Permitir respostas</b><small>Caem no Suporte, como conversa do cliente</small></span></label>
              <label><input type="checkbox" checked={compartilhar} onChange={(ev) => setCompartilhar(ev.target.checked)} /><span><b>Permitir compartilhar</b><small>Link com o cadastro do parceiro de quem compartilha</small></span></label>
              {!e && <label className={!pleno || quando === 'agendar' || modoPublico === 'admins' ? 'off' : ''}><input type="checkbox" checked={avisar && pleno && quando === 'agora' && modoPublico !== 'admins'} disabled={!pleno || quando === 'agendar' || modoPublico === 'admins'} onChange={(ev) => setAvisar(ev.target.checked)} />
                <span><b>Avisar no celular</b><small>{!pleno ? 'Só o administrador geral dispara notificações' : quando === 'agendar' ? 'Só para story publicado agora' : 'Notificação para quem ativou no app'}</small></span></label>}
            </fieldset>
          </div>
        </div>

        <footer className="ast-compor-pe">
          {erro && <span className="ast-erro curto">{erro}</span>}
          {!erro && ocupado && <span className="ast-nota">Pode preencher enquanto o vídeo sobe.</span>}
          <button type="button" className="ast-secundario" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="ast-secundario" disabled={!arq?.local} onClick={() => setCheia(true)}><Ico d={IC.olho} />Ver em tela cheia</button>
          <button type="button" className="ast-primario" disabled={!pronto} onClick={() => void publicar()}>
            {salvando ? 'Publicando…' : e ? 'Salvar alterações' : quando === 'agendar' ? 'Agendar' : 'Publicar agora'}
          </button>
        </footer>
      </section>

      {cheia && arq && perfil && (
        <VisualizadorDeStories perfis={[{ id: perfil.id, nome: perfil.nome, foto: perfil.foto_url, oficial: perfil.oficial, ordem: 0, parceiro: perfil.parceiro, itens: [prev] }]}
          perfilInicial={0} sessao={null} previa equipe aoFechar={() => setCheia(false)} linkDe={() => linkDoStory('previa', perfil.parceiro ?? '')} />
      )}
    </div>
  )
}

/* =================================================================== bolinhas */

function FormDePerfil({ sessao, inicial, parceiros, aoFechar, aoSalvar }: {
  sessao: SessaoTeeds; inicial: Partial<PerfilDoPainel>; parceiros: Array<{ codigo: string; nome: string }>; aoFechar: () => void; aoSalvar: () => void
}) {
  const [nome, setNome] = useState(inicial.nome ?? '')
  const [foto, setFoto] = useState(inicial.foto_url ?? '')
  const [parceiro, setParceiro] = useState(inicial.parceiro ?? '')
  const [oficial, setOficial] = useState(!!inicial.oficial)
  const [ordem, setOrdem] = useState(inicial.ordem ?? 100)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function enviarFoto(f: File | undefined) {
    if (!f) return
    setOcupado(true); setErro(null)
    try {
      const bmp = await createImageBitmap(f)
      const lado = Math.min(bmp.width, bmp.height)
      const c = document.createElement('canvas'); c.width = 320; c.height = 320
      c.getContext('2d')!.drawImage(bmp, (bmp.width - lado) / 2, (bmp.height - lado) / 2, lado, lado, 0, 0, 320, 320)
      const blob = await new Promise<Blob>((ok, falha) => c.toBlob((b) => (b ? ok(b) : falha(new Error('Não consegui ler a foto.'))), 'image/jpeg', 0.88))
      const url = await enviarArquivo(sessao, `${MARCA.id}/perfis/${Date.now().toString(36)}.jpg`, blob, 'image/jpeg').promessa
      setFoto(url)
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  async function salvar(ativo = true) {
    if (!nome.trim()) { setErro('Dê um nome para a bolinha.'); return }
    setOcupado(true)
    try { await salvarPerfil(sessao, { id: inicial.id, nome: nome.trim(), foto_url: foto || null, parceiro: parceiro || null, oficial, ordem, ativo }); aoSalvar() }
    catch (e) { setErro((e as Error).message); setOcupado(false) }
  }

  return (
    <div className="ast-cortina" onClick={(e) => { if (e.target === e.currentTarget) aoFechar() }}>
      <section className="ast-perfil-form" role="dialog" aria-modal="true" aria-label="Bolinha">
        <header className="ast-compor-cab"><div><h2>{inicial.id ? 'Editar bolinha' : 'Nova bolinha'}</h2><p>O nome e a foto que aparecem no topo da Início.</p></div><button type="button" className="ast-x" onClick={aoFechar} aria-label="Fechar"><Ico d={IC.fechar} /></button></header>
        <div className="ast-perfil-corpo">
          <label className="ast-perfil-foto">
            <span className="sto-anel"><Avatar foto={foto || null} nome={nome || '?'} tamanho={84} /></span>
            <input type="file" accept="image/*" onChange={(e) => void enviarFoto(e.target.files?.[0])} />
            <small>{ocupado ? 'Enviando…' : 'Trocar foto'}</small>
          </label>
          <div className="ast-campos">
            <label className="ast-campo"><span>Nome</span><input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={30} placeholder="Ex.: Aulas" /></label>
            <label className="ast-campo"><span>Parceiro</span>
              <select value={parceiro} onChange={(e) => setParceiro(e.target.value)}>
                <option value="">Da plataforma (todos publicam)</option>
                {parceiros.map((p) => <option key={p.codigo} value={p.codigo}>{p.nome} /{p.codigo}</option>)}
              </select>
            </label>
            <label className="ast-campo"><span>Ordem</span><input type="number" value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} min={0} max={999} /></label>
            <label className="ast-chave-linha"><input type="checkbox" checked={oficial} onChange={(e) => setOficial(e.target.checked)} /><span>Selo de perfil oficial</span></label>
          </div>
        </div>
        {erro && <div className="ast-erro">{erro}</div>}
        <footer className="ast-compor-pe">
          {inicial.id && <button type="button" className="ast-secundario perigo" onClick={() => void salvar(false)} disabled={ocupado}>Desativar</button>}
          <button type="button" className="ast-secundario" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="ast-primario" onClick={() => void salvar()} disabled={ocupado}>Salvar</button>
        </footer>
      </section>
    </div>
  )
}
