import { afiliadoDaDeriv, comunidadeDaVitrine } from '../core/rotas'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AVISO_GF_MEMBER, AVISO_GF_MEMBER_CURTO, aulasVistas, ehVideoDeExemplo, marcarVista, MODULOS, playerDoVideo, SALA_EM_BREVE, todasAsAulas, usarModulosDaGrade, VIDEO_DEMONSTRACAO,
  type AulaNumerada, type Modulo,
} from '../core/teeds/aulas'
import { cursosParaSala, gradePublicadaEmCache, meusCursosEmCache, modulosParaSala, segundosDoTempo, type GradeAulas } from '../core/teeds/gradeAulas'
import { JanelaDoCursoTrancado, VitrineDeCursos } from './aulas/VitrineDeCursos'
import { CapaDaAula } from './aulas/CapaDaAula'
import { listarVideosDasAulas, tamanhoLegivel, type VideoDaAula } from '../core/teeds/aulasVideos'
import type { SessaoTeeds } from '../core/teeds/conta'
import { MARCA } from '../marca'
import { Destaques, bannersDaMarca } from './aulas/Destaques'
import { IconeFechar } from './IconeFechar'
import { Icone } from './Icone'
import { PlayerAula } from './PlayerAula'
import { registrarAula } from '../core/teeds/insights'
import { DERIV } from '../core/deriv/config'
import './aulas/aviso-liberacao.css'
import './aulas/sala-de-aula.css'

/** Onde a pessoa parou em cada aula (segundos), neste navegador. */
const CHAVE_POSICAO = `${MARCA.id}.aulas.posicao`
function posicoesGuardadas(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CHAVE_POSICAO) || '{}') as Record<string, number> } catch { return {} }
}
function guardarPosicao(id: string, segundos: number) {
  try { const p = posicoesGuardadas(); p[id] = Math.floor(segundos); localStorage.setItem(CHAVE_POSICAO, JSON.stringify(p)) } catch { /* sem armazenamento */ }
}
/** "Minha jornada" (03/11/2026): a última aula aberta e a duração de cada vídeo (para a barra de onde parou). */
const CHAVE_ULTIMA = `${MARCA.id}.aulas.ultima`, CHAVE_DURACAO = `${MARCA.id}.aulas.duracao`
const ultimaAberta = (): string | null => { try { return localStorage.getItem(CHAVE_ULTIMA) } catch { return null } }
function guardarUltima(id: string) { try { localStorage.setItem(CHAVE_ULTIMA, id) } catch { /* sem armazenamento */ } }
function duracoesGuardadas(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CHAVE_DURACAO) || '{}') as Record<string, number> } catch { return {} }
}
function guardarDuracao(id: string, segundos: number) {
  try { const d = duracoesGuardadas(); if (d[id] === Math.round(segundos)) return; d[id] = Math.round(segundos); localStorage.setItem(CHAVE_DURACAO, JSON.stringify(d)) } catch { /* sem armazenamento */ }
}
/** "12:30", "1:02:10" ou "12 min" em segundos (0 se não der para ler). */
function segundosDe(texto: string | undefined): number {
  if (!texto) return 0
  const relogio = texto.match(/^(\d+):(\d{2})(?::(\d{2}))?$/)
  if (relogio) return relogio[3] != null ? +relogio[1] * 3600 + +relogio[2] * 60 + +relogio[3] : +relogio[1] * 60 + +relogio[2]
  const minutos = texto.match(/(\d+)\s*min/)
  return minutos ? +minutos[1] * 60 : 0
}
const relogio = (s: number) => { const t = Math.max(0, Math.floor(s)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}` }

/** Anel de progresso do curso, na trilha. */
function Anel({ fracao, cor }: { fracao: number; cor: string }) {
  const r = 20, c = 2 * Math.PI * r
  return (
    <svg className="cine-anel" viewBox="0 0 48 48" width="48" height="48" aria-hidden>
      <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="4" />
      <circle cx="24" cy="24" r={r} fill="none" stroke={cor} strokeWidth="4" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, fracao)))} transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">{Math.round(fracao * 100)}%</text>
    </svg>
  )
}

function Fileira({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [limites, setLimites] = useState({ anterior: false, proxima: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setLimites({ anterior: el.scrollLeft > 2, proxima: el.scrollWidth - el.clientWidth - el.scrollLeft > 2 })
    const observer = new ResizeObserver(medir)
    observer.observe(el)
    for (const child of el.children) observer.observe(child)
    el.addEventListener('scroll', medir, { passive: true })
    medir()
    return () => { observer.disconnect(); el.removeEventListener('scroll', medir) }
  }, [children])
  const mover = (direcao: -1 | 1) => ref.current?.scrollBy({
    left: direcao * Math.max(280, ref.current.clientWidth * .82), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
  })

  return (
    <div className="aulas-carrossel">
      <div className="aulas-fileira" ref={ref}>{children}</div>
      {(limites.anterior || limites.proxima) && <div className="aulas-fileira-controles">
        <span>Mais aulas</span>
        <button className="aulas-navegar" disabled={!limites.anterior} onClick={() => mover(-1)} aria-label={`Voltar em ${rotulo}`}>←</button>
        <button className="aulas-navegar" disabled={!limites.proxima} onClick={() => mover(1)} aria-label={`Avançar em ${rotulo}`}>→</button>
      </div>}
    </div>
  )
}

/** A sala rola por dentro (.ger.aulas): trocar de curso volta ao topo dela e da janela. */
function subirAoTopo() {
  requestAnimationFrame(() => {
    window.scrollTo({ top: 0 })
    document.querySelectorAll<HTMLElement>('.ger.aulas, .workspace-app > main, .tela-viva').forEach((e) => { if (e.scrollTop) e.scrollTop = 0 })
  })
}

/** Por marca, em `core/teeds/modulosAulas.ts` (a GlobalFly abre a vitrine já). */
const AULAS_EM_BREVE = SALA_EM_BREVE

/**
 * A sala fechada, enquanto as aulas não foram gravadas.
 *
 * Pedido do Tiago em 02/10/2026: as aulas ainda não existem, e até existirem
 * ninguém deve ver os cartões. Nem as capas, nem os módulos, nem a barra de
 * progresso. Quem abre "Aulas" encontra um recado, e não um curso vazio, que
 * é pior do que não ter curso nenhum.
 *
 * PARA REABRIR A SALA quando os vídeos estiverem prontos: troque
 * SALA_EM_BREVE para false em core/teeds/modulosAulas.ts. É a única linha. Nada da vitrine
 * foi removido, de propósito, e o painel do admin segue aceitando os vídeos
 * enquanto isso: quando o último entrar, é só virar a chave.
 *
 * Vale para as duas marcas. Este é o arquivo compartilhado e a OMNI não tem
 * casca própria da sala de aula, então uma chave fecha as duas.
 *
 * O recado não diz o que está acontecendo nos bastidores (Tiago, 02/10/2026):
 * promete a liberação, não a gravação. Prazo nenhum, por motivo óbvio.
 *
 * Classe própria (`aulas-breve`) em vez de reaproveitar a capa da vitrine:
 * `.ger.aulas` carrega uma pilha de regras aqui e em ux-refinements.css, e
 * não herdar nada é mais barato do que desfazer.
 */
/** O tour guiado fica aqui para rever quando quiser (GlobalFly, 20/10/2026). */
function CartaoDoTour({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <section className="aulas-tour" data-tour="rever-tour">
      <span className="aulas-tour-icone" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M12 21s-7-5.5-7-11a7 7 0 0114 0c0 5.5-7 11-7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
      </span>
      <div>
        <b>Tour guiado pela plataforma</b>
        <p>Em 2 minutos, onde fica cada coisa e por onde começar. Reveja quando quiser.</p>
      </div>
      <button type="button" onClick={aoAbrir}>Rever o tour</button>
    </section>
  )
}

function SalaEmBreve({ aoReverTour, aoIr }: { aoReverTour?: () => void; aoIr?: (tela: string) => void }) {
  return (
    <div className="ger aulas-breve">
      {aoReverTour && <CartaoDoTour aoAbrir={aoReverTour} />}
      <section className="breve-cartao">
        <span className="breve-selo">Treinamento original {MARCA.prosa}</span>
        <h2>As aulas chegam em breve</h2>
        <p>Quando forem liberadas, aparecem aqui sozinhas.</p>
        <p className="breve-nota">Enquanto isso, os robôs seguem disponíveis na plataforma.</p>
        {aoIr && <button type="button" className="breve-ir" onClick={() => aoIr('robos')}>Ver os robôs</button>}
      </section>
    </div>
  )
}

/** A porta da sala: o recado enquanto não há vídeo, a vitrine quando houver. */
interface PropsDaSala {
  nome?: string | null; sessao?: SessaoTeeds | null; aoReverTour?: () => void; aoIr?: (tela: string) => void; treino?: { noAr: boolean } | null; travadas?: boolean
  /** O plano da pessoa e se é admin: valem para as aulas de um plano só ou com data de liberação (grade do painel). */
  plano?: string | null; admin?: boolean | null
  /** Prévia do painel (04/11/2026): a grade em edição, ainda não publicada. Nada é gravado no progresso. */
  previa?: GradeAulas | null
}

export function AulasPanel(props: PropsDaSala) {
  if (AULAS_EM_BREVE && !props.previa) return <SalaEmBreve aoReverTour={props.aoReverTour} aoIr={props.aoIr} />
  return <SalaDeAulas {...props} />
}

/**
 * A sala de aula da Teeds, no estilo de vitrine de filmes: trilhas por
 * modulo, cartoes com capa e numero, player com a lista do modulo ao lado.
 * Aula sem video existe no catalogo mas se apresenta como "em breve".
 */
/** Os assuntos de um módulo, cada um com as suas aulas (assunto sem título = sem agrupamento). */
function gruposDoModulo(m: Modulo, doModulo: AulaNumerada[]) {
  if (!m.assuntos?.length) return [{ id: m.id, titulo: '', descricao: '', aulas: doModulo }]
  return m.assuntos.map((s) => ({ id: s.id, titulo: s.titulo, descricao: s.descricao ?? '', aulas: doModulo.filter((a) => a.assunto?.id === s.id) }))
    .filter((g) => g.aulas.length)
    // assuntos sem título seguidos viram um grupo só (as aulas aparecem direto no módulo)
    .reduce<Array<{ id: string; titulo: string; descricao: string; aulas: AulaNumerada[] }>>((l, g) => {
      const ult = l[l.length - 1]
      if (ult && !ult.titulo && !g.titulo) { ult.aulas = [...ult.aulas, ...g.aulas]; return l }
      return [...l, g]
    }, [])
}

function SalaDeAulas({ nome, sessao, aoReverTour, aoIr, treino, travadas = false, plano = null, admin = null, previa }: PropsDaSala) {
  // A grade publicada no painel (04/11/2026). undefined = lendo; null = não há (vale o catálogo do código).
  const [grade, setGrade] = useState<GradeAulas | null | undefined>(previa !== undefined ? previa : undefined)
  useEffect(() => {
    if (previa !== undefined) { setGrade(previa); return }
    let vivo = true
    gradePublicadaEmCache(sessao).then((g) => { if (vivo) setGrade(g) })
    return () => { vivo = false }
  }, [previa, sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // os cursos que a pessoa comprou (06/11/2026); na prévia, ninguém comprou nada
  const [meusCursos, setMeusCursos] = useState<Set<string> | undefined>(previa !== undefined ? new Set() : undefined)
  useEffect(() => {
    if (previa !== undefined) return
    let vivo = true
    meusCursosEmCache(sessao).then((m) => { if (vivo) setMeusCursos(m) })
    return () => { vivo = false }
  }, [previa, sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const ctxSala = useMemo(() => ({ plano, admin: previa ? false : admin, meusCursos }), [plano, admin, previa, meusCursos])
  const cursos = useMemo(() => (grade ? cursosParaSala(grade, ctxSala) : null), [grade, ctxSala])
  // o curso aberto: com um curso só, é ele; com vários, a vitrine escolhe (e lembra o último)
  const CHAVE_CURSO = `${MARCA.id}.aulas.curso`
  const [cursoId, setCursoIdBruto] = useState<string | null>(() => { try { return sessionStorage.getItem(CHAVE_CURSO) } catch { return null } })
  const setCursoId = (id: string | null) => { setCursoIdBruto(id); try { if (id) sessionStorage.setItem(CHAVE_CURSO, id); else sessionStorage.removeItem(CHAVE_CURSO) } catch { /* ok */ } }
  const [trancadoId, setTrancadoId] = useState<string | null>(null)
  const variosCursos = (cursos?.length ?? 0) > 1
  const cursoAtual = cursos ? (variosCursos ? cursos.find((c) => c.id === cursoId) ?? null : cursos[0] ?? null) : null
  const modulos = useMemo(() => (grade ? (cursoAtual ? cursoAtual.modulos : []) : MODULOS), [grade, cursoAtual])
  // o início, a ficha e os insights leem os módulos de todos os cursos
  useEffect(() => { if (!previa && grade !== undefined && meusCursos !== undefined) usarModulosDaGrade(grade ? modulosParaSala(grade, ctxSala) : null) }, [grade, ctxSala, previa, meusCursos])
  const [irPara, setIrPara] = useState<{ segundos: number; vez: number } | null>(null)
  // Os vídeos que o painel gravou no banco. Enquanto não chegam (ou se o
  // banco não responder), a sala abre com o catálogo do código.
  const [videos, setVideos] = useState<Record<string, VideoDaAula>>({})
  useEffect(() => {
    let vivo = true
    listarVideosDasAulas(sessao).then((v) => { if (vivo) setVideos(v) })
    return () => { vivo = false }
  }, [sessao?.usuario.id]) // eslint-disable-line react-hooks/exhaustive-deps
  // GF Member antes da live de lançamento: o catálogo aparece, nenhum vídeo toca
  const aulas = useMemo(() => { const l = todasAsAulas(videos, modulos); return travadas ? l.map((a) => ({ ...a, video: '' })) : l }, [videos, travadas, modulos])
  const [vistas, setVistas] = useState<Set<string>>(() => aulasVistas())
  const [abertaId, setAbertaId] = useState<string | null>(null)
  const [detalheId, setDetalheId] = useState<string | null>(null)
  const [moduloAberto, setModuloAberto] = useState<string | null>(null)
  const [tocando, setTocando] = useState(false)
  const ultimaGravacao = useRef(0)

  // Enquanto o vídeo toca, a plataforma escurece em volta (modo cinema).
  useEffect(() => {
    document.body.classList.toggle('aula-tocando', tocando && !!abertaId)
    return () => document.body.classList.remove('aula-tocando')
  }, [tocando, abertaId])

  const aberta = aulas.find((a) => a.id === abertaId) ?? null
  const comVideo = aulas.filter((a) => a.video)
  const proxima = aulas.find((a) => a.video && !vistas.has(a.id)) ?? comVideo[0] ?? null
  const assistidas = aulas.filter((a) => vistas.has(a.id)).length
  const destaque = proxima ?? aulas[0] ?? null
  const detalhe = aulas.find((a) => a.id === detalheId) ?? null

  const alternarVista = (id: string) => {
    setVistas(new Set(marcarVista(id, !vistas.has(id))))
  }

  // Telemetria: segundos realmente assistidos (contados pela cadência do
  // vídeo, não pelo relógio), enviados em lotes; nunca condição para assistir.
  const assistido = useRef({ acumulado: 0, ultimoTempo: -1, concluidaEnviada: false, duracao: 0 })
  const despachar = useCallback((aulaId: string, posicao: number, concluida = false) => {
    const t = assistido.current
    if (t.acumulado <= 0 && !concluida) return
    const segundos = Math.round(t.acumulado); t.acumulado = 0
    if (!previa) void registrarAula(sessao, aulaId, { segundos, posicao, concluida, duracao: t.duracao })
  }, [sessao, previa])
  const abrir = (a: AulaNumerada, doInicio = false) => {
    if (!a.video) return
    if (doInicio) guardarPosicao(a.id, 0)
    guardarUltima(a.id)
    if (abertaId && abertaId !== a.id) despachar(abertaId, 0)
    assistido.current = { acumulado: 0, ultimoTempo: -1, concluidaEnviada: false, duracao: 0 }
    setAbertaId(a.id); setModuloAberto(a.modulo.id); setIrPara(null)
    if (!previa) void registrarAula(sessao, a.id, { abriu: true })
    window.scrollTo({ top: 0 })
  }
  // Ao sair da aula (ou da tela), o que ficou acumulado vai para o banco.
  useEffect(() => () => { if (abertaId) despachar(abertaId, 0) }, [abertaId, despachar])
  // Aos 90% a aula conta como assistida; a posição é guardada a cada ~5 s.
  const aoAvancar = useCallback((fracao: number, segundos: number) => {
    if (!abertaId) return
    const agora = Date.now()
    const t = assistido.current
    const delta = t.ultimoTempo >= 0 ? segundos - t.ultimoTempo : 0
    if (delta > 0 && delta < 2.5) t.acumulado += delta   // pulo ou retrocesso não conta
    t.ultimoTempo = segundos
    // a duração do vídeo (para o admin ver quanto da aula a pessoa de fato assistiu)
    if (fracao > 0.02 && !t.duracao) { t.duracao = Math.round(segundos / fracao); guardarDuracao(abertaId, t.duracao) }
    if (agora - ultimaGravacao.current > 5000) { ultimaGravacao.current = agora; guardarPosicao(abertaId, segundos) }
    if (t.acumulado >= 20) despachar(abertaId, fracao)
    if (fracao >= 0.9 && !t.concluidaEnviada) { t.concluidaEnviada = true; despachar(abertaId, fracao, true) }
    if (fracao >= 0.9 && !aulasVistas().has(abertaId)) setVistas(new Set(marcarVista(abertaId, true)))
  }, [abertaId, despachar])

  // a grade do painel ainda chegando: não pisca o catálogo antigo antes da grade nova
  if ((grade === undefined || (grade && meusCursos === undefined)) && sessao) return <div className="ger aulas"><div className="adm-vazio">Abrindo as aulas…</div></div>

  /* -------------------------------------------- a vitrine dos cursos */
  const trancado = cursos?.find((c) => c.id === trancadoId) ?? null
  const janelaTrancado = trancado && <JanelaDoCursoTrancado curso={trancado} aoFechar={() => setTrancadoId(null)} aoVerConteudo={() => { setTrancadoId(null); setCursoId(trancado.id); subirAoTopo() }} />
  if (variosCursos && !cursoAtual && cursos) {
    return (
      <div className={`ger aulas${travadas ? ' aulas-travadas' : ''}`}>
        {/* os cursos primeiro (no celular os destaques ocupavam a primeira tela inteira) */}
        <VitrineDeCursos cursos={cursos} vistas={vistas} nome={nome} aoAbrir={(id) => { setCursoId(id); subirAoTopo() }} aoVerTrancado={setTrancadoId} />
        {MARCA.inicio && <Destaques banners={bannersDaMarca({ treino: !!treino, noAr: !!treino?.noAr })} aoIr={aoIr} />}
        {aoReverTour && <CartaoDoTour aoAbrir={aoReverTour} />}
        {janelaTrancado}
      </div>
    )
  }
  if (grade && !cursoAtual) return <div className="ger aulas"><div className="adm-vazio">Nenhum curso disponível por enquanto.</div></div>
  const migalhaDoCurso = variosCursos && cursoAtual && (
    <nav className="vc-migalha" aria-label="Curso">
      <button type="button" className="vc-voltar" onClick={() => { setCursoId(null); subirAoTopo() }}>← Todos os cursos</button>
      <b>{cursoAtual.titulo}</b><small>{cursoAtual.modulos.length} {cursoAtual.modulos.length === 1 ? 'módulo' : 'módulos'} · {cursoAtual.aulas} aulas</small>
    </nav>
  )
  const faixaTrancado = cursoAtual && !cursoAtual.liberado && (
    <section className="vc-faixa-trancado" role="status">
      <span><b>{cursoAtual.motivo}</b><small>Veja o que o curso ensina. As aulas abrem quando o seu acesso for liberado.</small></span>
      {cursoAtual.checkout && <a className="vc-comprar" href={cursoAtual.checkout} target="_blank" rel="noopener noreferrer">Liberar meu acesso</a>}
    </section>
  )

  /* ----------------------------------------------------------- player */
  if (aberta) {
    const player = playerDoVideo(aberta.video)
    const idx = aulas.findIndex((a) => a.id === aberta.id)
    const seguinte = aulas.slice(idx + 1).find((a) => a.video) ?? null
    const anterior = aulas.slice(0, idx).reverse().find((a) => a.video) ?? null
    const vista = vistas.has(aberta.id)
    const posicao = posicoesGuardadas()[aberta.id] ?? 0
    const numModulo = modulos.findIndex((m) => m.id === aberta.modulo.id) + 1

    return (
      <div className={`ger aulas cine ${tocando ? 'tocando' : ''}`} style={{ ['--aula' as any]: aberta.modulo.cor }}>
        <div className="cine-topo">
          <button className="aulas-voltar" onClick={() => { setAbertaId(null); setTocando(false) }}>← Todas as aulas</button>
          <span className="cine-migalha">{variosCursos && cursoAtual ? `${cursoAtual.titulo} · ` : ''}Módulo {String(numModulo).padStart(2, '0')} · {aberta.modulo.titulo} · Aula {aberta.numero} de {aulas.length}</span>
        </div>

        <div className="cine-palco">
          <div className="cine-principal">
            <div className="cine-video">
              {player?.tipo === 'mp4' || (player?.tipo === 'youtube' && player.id) ? (
                <PlayerAula key={aberta.id} src={player.tipo === 'mp4' ? player.src : ''} youtube={player.tipo === 'youtube' ? player.id : undefined}
                  repetir={!!aberta.repetir} vertical={!!aberta.vertical} titulo={aberta.titulo} posicaoInicial={posicao}
                  aoAvancar={aoAvancar} aoTocar={setTocando} pularPara={irPara}
                  proxima={seguinte ? { titulo: seguinte.titulo, abrir: () => abrir(seguinte) } : null} />
              ) : player ? (
                <iframe src={player.src} title={aberta.titulo} allowFullScreen
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" />
              ) : (
                <div className="aula-embreve-palco">
                  <CapaDaAula aula={aberta} cor={aberta.modulo.cor} numero={aberta.numero} alt="" />
                  <span>{aberta.bloqueio ?? 'em breve'}</span>
                </div>
              )}
            </div>

            <div className="cine-ficha">
              <div className="cine-ficha-texto">
                <span className="aula-num">Aula {aberta.numero}{aberta.assunto?.titulo ? ` · ${aberta.assunto.titulo}` : ''}</span>
                <h2>{aberta.titulo}</h2>
                <p>{aberta.descricao}</p>
                <div className="cine-chips">
                  <span>{aberta.nivel || 'Iniciante'}</span>
                  {!ehVideoDeExemplo(aberta.video) && aberta.duracao && <span>{aberta.duracao}</span>}
                  {ehVideoDeExemplo(aberta.video) && <span className="demo">Vídeo de exemplo</span>}
                </div>
              </div>
              <div className="cine-ficha-acoes">
                <button className={`aula-check ${vista ? 'on' : ''}`} onClick={() => alternarVista(aberta.id)}>
                  {vista ? '✓ Assistida' : 'Marcar como assistida'}
                </button>
                <div className="cine-navegar">
                  <button disabled={!anterior} onClick={() => anterior && abrir(anterior)} title={anterior?.titulo}>← Anterior</button>
                  <button className="aula-proxima" disabled={!seguinte} onClick={() => seguinte && abrir(seguinte)}>
                    {seguinte ? `Próxima: ${seguinte.titulo} →` : 'Última aula do curso'}
                  </button>
                </div>
              </div>
            </div>

            {!!aberta.topicos?.length && (
              <section className="cine-topicos" aria-label="O que você vai ver nesta aula">
                <h3>O que você vai ver nesta aula <small>{aberta.topicos.length} {aberta.topicos.length === 1 ? 'tópico' : 'tópicos'}</small></h3>
                <ol>
                  {aberta.topicos.map((t, i) => {
                    const seg = segundosDoTempo(t.tempo)
                    const pula = seg != null && (player?.tipo === 'mp4' || (player?.tipo === 'youtube' && !!player.id))
                    return (
                      <li key={i}>
                        {pula
                          ? <button type="button" onClick={() => setIrPara({ segundos: seg, vez: Date.now() })}><time>{t.tempo}</time><span>{t.titulo}</span><em aria-hidden="true">▶</em></button>
                          : <div>{t.tempo ? <time>{t.tempo}</time> : <i aria-hidden="true">{i + 1}</i>}<span>{t.titulo}</span></div>}
                      </li>
                    )
                  })}
                </ol>
              </section>
            )}

            {(() => {
              // os links relacionados: os padrões da marca e os extras que o painel cadastrou nesta aula.
              // GlobalFly (08/11/2026, Victor): os três atalhos embaixo de TODA aula pareciam outras aulas
              // misturadas ("por card, tinha que ser uma aula"). Lá cada atalho só aparece na aula do assunto.
              const soNaAula = MARCA.id === 'globalfly'
              const abrirConta = afiliadoDaDeriv() && (!soNaAula || aberta.id === 'conta-deriv')
              const depositar = !soNaAula || aberta.id === 'primeiro-deposito'
              const comunidade = MARCA.comunidade && !soNaAula
              const links: Array<{ nome: string; url: string; dica?: string }> = [
                ...(abrirConta ? [{ nome: 'Abrir conta na Deriv', url: afiliadoDaDeriv(), dica: 'Gratuito, em poucos minutos' }] : []),
                ...(depositar ? [{ nome: 'Depositar na Deriv', url: DERIV.deposito, dica: 'Pela área Caixa da sua conta' }] : []),
                ...(comunidade ? [{ nome: 'Comunidade no WhatsApp', url: comunidadeDaVitrine()!, dica: 'Avisos e agenda das transmissões' }] : []),
                ...(aberta.links ?? []).filter((l) => !/deriv\.com\/dashboard\/deposit/.test(l.url)),
              ]
              const materiais = aberta.materiais ?? []
              if (!links.length && !materiais.length) return null
              return (
                <div className={`cine-extras ${materiais.length ? '' : 'so-links'}`}>
                  {materiais.length > 0 && (
                    <section className="cine-materiais" aria-label="Materiais da aula">
                      <h3>Materiais da aula <small>{materiais.length} {materiais.length === 1 ? 'arquivo' : 'arquivos'}</small></h3>
                      <div className="cine-materiais-lista">
                        {materiais.map((m) => (
                          <a key={m.url} className="cine-material" href={m.url} target="_blank" rel="noopener noreferrer" download>
                            <i aria-hidden="true">{(m.tipo || m.url.split('.').pop() || 'arq').slice(0, 4).toUpperCase()}</i>
                            <span><b>{m.nome}</b><small>{[m.tipo, tamanhoLegivel(m.tamanho)].filter(Boolean).join(' · ') || 'Arquivo'}</small></span>
                            <em>Baixar</em>
                          </a>
                        ))}
                      </div>
                    </section>
                  )}
                  {links.length > 0 && <section className="cine-materiais cine-links" aria-label="Links relacionados">
                    <h3>Links relacionados</h3>
                    <div className="cine-materiais-lista">
                      {links.map((l) => (
                        <a key={l.url + l.nome} className="cine-material cine-link" href={l.url} target="_blank" rel="noopener noreferrer">
                          <i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" /></svg></i>
                          <span><b>{l.nome}</b><small>{l.dica ?? l.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}</small></span>
                          <em>Abrir</em>
                        </a>
                      ))}
                    </div>
                  </section>}
                </div>
              )
            })()}
          </div>

          <aside className="cine-trilha" aria-label="Seu progresso no curso">
            <div className="cine-trilha-topo">
              <Anel fracao={assistidas / aulas.length} cor={aberta.modulo.cor} />
              <div>
                <b>Seu progresso</b>
                <small>{assistidas} de {aulas.length} aulas assistidas · {modulos.length} {modulos.length === 1 ? 'módulo' : 'módulos'}</small>
              </div>
            </div>
            <div className="cine-trilha-modulos">
              {modulos.map((m, mi) => {
                const doModulo = aulas.filter((a) => a.modulo.id === m.id)
                const feitas = doModulo.filter((a) => vistas.has(a.id)).length
                const abertoAqui = (moduloAberto ?? aberta.modulo.id) === m.id
                return (
                  <section key={m.id} className={`cine-modulo ${abertoAqui ? 'aberto' : ''} ${m.id === aberta.modulo.id ? 'atual' : ''}`} style={{ ['--aula' as any]: m.cor }}>
                    <button className="cine-modulo-cab" onClick={() => setModuloAberto(abertoAqui ? '' : m.id)} aria-expanded={abertoAqui}>
                      <i>{String(mi + 1).padStart(2, '0')}</i>
                      <span>
                        <small className="cine-modulo-rot">Módulo {mi + 1}</small>
                        <b>{m.titulo}</b>
                        <span className="cine-modulo-barra" aria-hidden="true"><u style={{ width: `${doModulo.length ? (feitas / doModulo.length) * 100 : 0}%` }} /></span>
                        <small>{feitas} de {doModulo.length} concluídas</small>
                      </span>
                      <em aria-hidden>{abertoAqui ? '−' : '+'}</em>
                    </button>
                    {abertoAqui && (
                      <ol className="cine-modulo-aulas">
                        {doModulo.map((a, ai) => (
                          <li key={a.id} data-assunto={a.assunto?.titulo && a.assunto.id !== doModulo[ai - 1]?.assunto?.id ? a.assunto.titulo : undefined}>
                            <button
                              className={`aula-item ${a.id === aberta.id ? 'on' : ''} ${a.video ? '' : 'sem'} ${vistas.has(a.id) ? 'vista' : ''}`}
                              onClick={() => abrir(a)} disabled={!a.video} aria-current={a.id === aberta.id ? 'true' : undefined}>
                              <i>{a.id === aberta.id ? '▶' : vistas.has(a.id) ? '✓' : a.numero}</i>
                              <span>{a.titulo}<small>{a.id === aberta.id ? 'Assistindo agora' : vistas.has(a.id) ? 'Assistida' : a.video ? (ehVideoDeExemplo(a.video) ? 'Vídeo de exemplo' : a.duracao) : a.bloqueio ?? 'Em breve'}</small></span>
                            </button>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                )
              })}
            </div>
            {(player?.tipo === 'mp4' || (player?.tipo === 'youtube' && !!player.id)) && <p className="cine-atalhos">Atalhos: <kbd>espaço</kbd> tocar ou pausar · <kbd>←</kbd> <kbd>→</kbd> 10 s · <kbd>F</kbd> tela cheia</p>}
          </aside>
        </div>
      </div>
    )
  }

  /* ---------------------------------------------------------- vitrine */
  return (
    <div className={`ger aulas${travadas ? ' aulas-travadas' : ''}`}>
      {travadas && (
        <section className="aulas-liberacao" role="status">
          <span className="aulas-liberacao-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4M12 13.5v3l2 1.2" /></svg>
          </span>
          <span className="aulas-liberacao-texto">
            <b>Suas aulas abrem em 09/11, depois da live</b>
            <small>Até lá, veja os módulos e o que você vai aprender.</small>
          </span>
        </section>
      )}
      {/* 03/11/2026 (Tiago): os destaques no topo, de ponta a ponta; embaixo, a minha jornada */}
      {MARCA.inicio && !variosCursos && <Destaques banners={bannersDaMarca({ treino: !!treino, noAr: !!treino?.noAr })} aoIr={aoIr} />}
      {migalhaDoCurso}
      {faixaTrancado}

      {(() => {
        // a última aula aberta: se não terminou, é de onde a pessoa parou; se terminou, a próxima
        const posicoes = posicoesGuardadas(), duracoes = duracoesGuardadas()
        const ultima = aulas.find((a) => a.id === ultimaAberta() && a.video) ?? null
        const seguinteDe = (a: AulaNumerada) => aulas.slice(aulas.indexOf(a) + 1).find((x) => x.video && !vistas.has(x.id)) ?? null
        const parou = ultima && !vistas.has(ultima.id) && (posicoes[ultima.id] ?? 0) > 5 ? ultima : null
        const aula = parou ?? (ultima ? seguinteDe(ultima) : null) ?? destaque
        if (!aula || (cursoAtual && !cursoAtual.liberado)) return null
        const onde = parou ? posicoes[parou.id] ?? 0 : 0
        const total = parou ? duracoes[parou.id] || segundosDe(parou.duracao) : 0
        const fracaoAula = total ? Math.min(1, onde / total) : 0
        const estado = travadas ? 'travada' : parou ? 'parou' : assistidas > 0 || ultima ? 'proxima' : 'inicio'
        const titulo = estado === 'parou' ? 'Continue de onde parou' : estado === 'proxima' ? 'A sua próxima aula' : estado === 'travada' ? 'O seu treinamento' : `Comece por aqui${nome ? `, ${nome.split(' ')[0]}` : ''}`
        return (
          <section className="aulas-jornada" style={{ ['--aula' as string]: aula.modulo.cor }} aria-labelledby="aulas-jornada-titulo">
            <div className="aulas-jornada-texto">
              <span className="aulas-jornada-rot">Minha jornada</span>
              <h2 id="aulas-jornada-titulo">{titulo}</h2>
              <p className="aulas-jornada-aula"><b>Aula {aula.numero} de {aulas.length} · {aula.titulo}</b><small>{aula.modulo.titulo}</small></p>
              {estado === 'parou' && <p className="aulas-jornada-onde">Você parou em <b>{relogio(onde)}</b>{total ? <> de {relogio(total)}</> : null}.</p>}
              <div className="aulas-jornada-curso" aria-label={`${assistidas} de ${aulas.length} aulas concluídas`}>
                <span className="aulas-barra"><i style={{ width: `${(assistidas / aulas.length) * 100}%` }} /></span>
                <small>{assistidas} de {aulas.length} aulas concluídas · {Math.round((assistidas / aulas.length) * 100)}%</small>
              </div>
              <div className="aulas-hero-acoes">
                {estado === 'travada' ? (
                  <span className="aulas-abre-em" role="note"><Icone nome="info" />{AVISO_GF_MEMBER_CURTO}, depois da live</span>
                ) : estado === 'parou' ? (
                  <>
                    <button className="aulas-continuar" onClick={() => abrir(aula)}><Icone nome="play" />Continuar de onde parei</button>
                    <button className="aulas-detalhes" onClick={() => abrir(aula, true)}><span aria-hidden="true">↺</span>Assistir do início</button>
                  </>
                ) : aula.video ? (
                  <>
                    <button className="aulas-continuar" onClick={() => abrir(aula)}><Icone nome="play" />{estado === 'proxima' ? `Assistir a aula ${aula.numero}` : 'Começar agora'}</button>
                    {estado === 'proxima' && ultima && vistas.has(ultima.id)
                      ? <button className="aulas-detalhes" onClick={() => abrir(ultima, true)}><span aria-hidden="true">↺</span>Rever a aula {ultima.numero}</button>
                      : <button className="aulas-detalhes" onClick={() => setDetalheId(aula.id)}><Icone nome="info" />Mais informações</button>}
                  </>
                ) : (
                  <button className="aulas-continuar indisponivel" onClick={() => setDetalheId(aula.id)}><Icone nome="play" />Ver apresentação</button>
                )}
              </div>
            </div>
            <button type="button" className="aulas-jornada-capa" onClick={() => (aula.video && !travadas ? abrir(aula) : setDetalheId(aula.id))} aria-label={`Abrir a aula ${aula.titulo}`}>
              <CapaDaAula aula={aula} cor={aula.modulo.cor} numero={aula.numero} alt="" />
              {aula.video && !travadas && <span className="aula-play">▶</span>}
              {estado === 'parou' && <span className="aulas-jornada-ondeBarra" aria-hidden="true"><i style={{ width: `${Math.max(3, fracaoAula * 100)}%` }} /></span>}
              {aula.duracao && !travadas && <span className="aula-dur">{estado === 'parou' && total ? `Faltam ${relogio(total - onde)}` : aula.duracao}</span>}
            </button>
          </section>
        )
      })()}

      {aoReverTour && <CartaoDoTour aoAbrir={aoReverTour} />}

      {modulos.map((m, mi) => {
        const doModulo = aulas.filter((a) => a.modulo.id === m.id)
        const grupos = gruposDoModulo(m, doModulo)
        const cartao = (a: AulaNumerada) => (
          <button key={a.id} data-num={String(a.numero).padStart(2, '0')}
            className={`aula-cartao ${a.video ? '' : 'sem'}`}
            onClick={() => a.video ? abrir(a) : setDetalheId(a.id)}>
            <span className="aula-cartao-capa" data-num={String(a.numero).padStart(2, '0')}>
              <CapaDaAula aula={a} cor={m.cor} numero={a.numero} alt={`Capa da aula ${a.titulo}`} loading="lazy" />
              {vistas.has(a.id) && <i className="aula-vista">✓</i>}
              {!a.video && <em>{travadas ? 'Em 09/11' : a.bloqueio ?? 'Em breve'}</em>}
              {a.video && <span className="aula-play">▶</span>}
              {a.duracao && !travadas && <span className="aula-dur">{a.duracao}</span>}
              <span className="aula-hover-info"><b>{a.titulo}</b><small>{a.descricao}</small></span>
            </span>
            <span className="aula-cartao-corpo">
              <span className="aula-num">Aula {a.numero}</span>
              <b>{a.titulo}</b>
              {/* a duração já aparece na capa: aqui só o que a capa não diz (revisão visual, 29/10/2026) */}
              {!travadas && <span className="aula-card-meta"><i>{a.video ? 'Disponível' : a.bloqueio ? 'Trancada' : 'Em breve'}</i>{!a.duracao && <i>Duração a definir</i>}</span>}
            </span>
          </button>
        )
        return (
          <section key={m.id} className="aulas-modulo" style={{ ['--aula' as any]: m.cor }}>
            <div className="aulas-modulo-topo">
              <span className="aulas-trilha-num">{String(mi + 1).padStart(2, '0')}</span>
              <div>
                <h3>{m.titulo}</h3>
                <p>{m.chamada}</p>
                {m.descricao && <p className="aulas-modulo-descricao">{m.descricao}</p>}
              </div>
              <span className="aulas-conta">
                {doModulo.filter((a) => vistas.has(a.id)).length}/{doModulo.length}
              </span>
            </div>
            {grupos.map((g) => (
              <div key={g.id} className={g.titulo ? 'aulas-assunto' : undefined}>
                {g.titulo && <div className="aulas-assunto-topo"><h4>{g.titulo}</h4>{g.descricao && <p>{g.descricao}</p>}<small>{g.aulas.length} {g.aulas.length === 1 ? 'aula' : 'aulas'}</small></div>}
                <Fileira rotulo={g.titulo || m.titulo}>{g.aulas.map(cartao)}</Fileira>
              </div>
            ))}
          </section>
        )
      })}

      {janelaTrancado}
      {detalhe && (
        <div className="aula-modal-fundo" role="presentation" onClick={() => setDetalheId(null)}>
          <section className="aula-modal" role="dialog" aria-modal="true" aria-label={detalhe.titulo}
            style={{ ['--aula' as any]: detalhe.modulo.cor }} onClick={(e) => e.stopPropagation()}>
            <button className="aula-modal-fechar" onClick={() => setDetalheId(null)} aria-label="Fechar"><IconeFechar /></button>
            <div className="aula-modal-capa"><CapaDaAula aula={detalhe} cor={detalhe.modulo.cor} numero={detalhe.numero} alt={`Capa da aula ${detalhe.titulo}`} /></div>
            <div className="aula-modal-corpo">
              <span className="aula-num">Aula {detalhe.numero} · {detalhe.modulo.titulo}</span>
              <h2>{detalhe.titulo}</h2>
              <p>{detalhe.descricao}</p>
              {!!detalhe.topicos?.length && (
                <ul className="aula-modal-topicos">{detalhe.topicos.slice(0, 6).map((t, i) => <li key={i}>{t.titulo}</li>)}</ul>
              )}
              <div className="aulas-meta"><b>{detalhe.nivel || 'Iniciante'}</b>{!travadas && <span>{detalhe.duracao || 'Duração a definir'}</span>}</div>
              {detalhe.video ? (
                <button className="aulas-continuar" onClick={() => { setDetalheId(null); abrir(detalhe) }}><Icone nome="play" /> Assistir agora</button>
              ) : <span className="aula-modal-breve">{travadas ? `${AVISO_GF_MEMBER}.` : detalhe.bloqueio ? `${detalhe.bloqueio}.` : 'Esta aula será liberada em breve.'}</span>}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
