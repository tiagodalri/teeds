import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { SessaoTeeds } from '../../core/teeds/conta'
import type { WorkspacePage } from '../WorkspaceNav'
import type { PapelDoAdmin } from '../../core/teeds/parceiroEmFoco'
import { DERIV } from '../../core/deriv/config'
import { vitrine } from '../../core/teeds/parceiro'
import { EVENTO_STORIES, linkDoStory, pedirAbaStories, storiesDoCliente, type PerfilDeStories, type Story } from '../../core/teeds/stories'
import { Avatar, VisualizadorDeStories } from './VisualizadorDeStories'
import { tentarDeNovo, useTrabalhos } from '../../core/teeds/publicacaoDeStories'
import { useArrastarParaCamera } from './useArrastarParaCamera'
import { assinarMudancas } from '../../core/teeds/realtime'
import { MARCA } from '../../marca'
import './stories.css'

// o estúdio (câmera e editor) só baixa quando alguém da equipe toca em Publicar
const carregarEstudio = () => import('./EstudioDeStories')
const EstudioDeStories = lazy(() => carregarEstudio().then((m) => ({ default: m.EstudioDeStories })))

/**
 * As bolinhas no topo da Início (08/11/2026). Anel com o degradê do Instagram
 * nas cores da GlobalFly (champanhe, ouro, aço, azul) = tem story novo; anel
 * fino = já visto, e a bolinha vai para o fim da fila. A bolinha "Ao vivo"
 * aparece primeiro quando há transmissão no ar; a "Publicar" só para a equipe.
 *
 * Ao tocar, o anel gira enquanto o primeiro story carrega (como no Instagram)
 * e só então a tela cheia abre: nunca abre preta esperando.
 */

interface Props {
  sessao: SessaoTeeds
  aoIr: (tela: WorkspacePage) => void
  equipe?: boolean
  /** O papel do admin (para o estúdio: parceiro, aviso no celular). */
  papel?: PapelDoAdmin | null
  aoVivo?: boolean
  /** Dados prontos (laboratório): não lê o banco. */
  exemplo?: PerfilDeStories[]
}

const LER_DE_NOVO = 5 * 60_000

/** Espera a primeira mídia carregar (no máximo 2,5 s). */
function preCarregar(s: Story): Promise<void> {
  return new Promise((ok) => {
    const fim = window.setTimeout(ok, 2500)
    const pronto = () => { window.clearTimeout(fim); ok() }
    if (s.tipo === 'imagem') { const i = new Image(); i.onload = pronto; i.onerror = pronto; i.src = s.midia; return }
    const v = document.createElement('video')
    v.preload = 'auto'; v.muted = true; v.oncanplay = pronto; v.onerror = pronto; v.src = s.midia
  })
}

export function BarraDeStories({ sessao, aoIr, equipe, papel, aoVivo, exemplo }: Props) {
  const [estudio, setEstudio] = useState(false)
  // os stories subindo em segundo plano (o estúdio já fechou): "Seu story" com o anel de progresso
  const enviando = useTrabalhos().filter((t) => t.publicar)
  // o "Seu story" aparece no começo da fileira, à vista
  useEffect(() => { if (enviando.length) fila.current?.scrollTo({ left: 0, behavior: 'smooth' }) }, [enviando.length]) // eslint-disable-line react-hooks/exhaustive-deps
  const [perfis, setPerfis] = useState<PerfilDeStories[] | null>(exemplo ?? null)
  const [aberto, setAberto] = useState<number | null>(null)
  const [girando, setGirando] = useState<string | null>(null)
  const [ordem, setOrdem] = useState<string[]>([])
  const fila = useRef<HTMLDivElement | null>(null)
  const [bordas, setBordas] = useState({ esq: false, dir: false })
  // arrastar da esquerda para a direita na Início abre a câmera (só admin: esta fileira só existe para admin)
  const puxada = useArrastarParaCamera(!estudio && aberto === null, () => setEstudio(true), () => { void carregarEstudio() })

  const ler = useCallback(() => {
    if (exemplo) return
    storiesDoCliente(sessao).then(setPerfis).catch(() => setPerfis((p) => p ?? []))
  }, [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ler()
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') ler() }, LER_DE_NOVO)
    const voltou = () => { if (document.visibilityState === 'visible') ler() }
    window.addEventListener(EVENTO_STORIES, ler)
    document.addEventListener('visibilitychange', voltou)
    return () => { window.clearInterval(t); window.removeEventListener(EVENTO_STORIES, ler); document.removeEventListener('visibilitychange', voltou) }
  }, [ler])

  // story novo na hora (10/11/2026, lista do Victor: "atualização automática para alunos conectados"): o banco toca
  // stories_sinal a cada mudança e a fileira pergunta de novo. Com um story aberto, espera fechar para não trocar
  // a fila embaixo de quem assiste. Os 5 min acima ficam de reserva (e cobrem os agendados).
  const abertoRef = useRef(false)
  abertoRef.current = aberto !== null || estudio
  const pendente = useRef(false)
  useEffect(() => {
    if (exemplo || !sessao.token) return
    let espera: number | undefined
    const canal = assinarMudancas({
      token: sessao.token, canal: `stories-sinal-${MARCA.id}`,
      tabelas: [{ tabela: 'stories_sinal', filtro: `marca=eq.${MARCA.id}` }],
      aoMudar: () => {
        if (abertoRef.current) { pendente.current = true; return }
        window.clearTimeout(espera)
        espera = window.setTimeout(ler, 600) // várias mudanças juntas viram uma leitura só
      },
    })
    return () => { window.clearTimeout(espera); canal.fechar() }
  }, [sessao.token]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (aberto === null && !estudio && pendente.current) { pendente.current = false; ler() } }, [aberto, estudio]) // eslint-disable-line react-hooks/exhaustive-deps

  // a ordem só muda com o story fechado: não visto primeiro (na ordem da casa), visto depois
  useEffect(() => {
    if (aberto !== null || !perfis) return
    const novos = perfis.filter((p) => p.itens.some((s) => !s.visto))
    const vistos = perfis.filter((p) => !p.itens.some((s) => !s.visto))
    setOrdem([...novos, ...vistos].map((p) => p.id))
  }, [perfis, aberto])

  const ordenados = useMemo(() => {
    if (!perfis) return []
    const mapa = new Map(perfis.map((p) => [p.id, p]))
    const l = ordem.map((id) => mapa.get(id)).filter((p): p is PerfilDeStories => !!p)
    return l.length === perfis.length ? l : perfis
  }, [perfis, ordem])

  const medirBordas = useCallback(() => {
    const f = fila.current
    if (!f) return
    setBordas({ esq: f.scrollLeft > 4, dir: f.scrollLeft + f.clientWidth < f.scrollWidth - 4 })
  }, [])
  useEffect(() => {
    medirBordas()
    window.addEventListener('resize', medirBordas)
    return () => window.removeEventListener('resize', medirBordas)
  }, [medirBordas, ordenados.length])

  async function abrir(i: number) {
    const p = ordenados[i]
    if (!p || girando) return
    setGirando(p.id)
    const s = p.itens.find((x) => !x.visto) ?? p.itens[0]
    await preCarregar(s)
    setGirando(null)
    setAberto(i)
  }

  function aoVer(perfilId: string, storyId: string) {
    setPerfis((l) => l?.map((p) => p.id !== perfilId ? p : { ...p, itens: p.itens.map((s) => s.id === storyId ? { ...s, visto: true } : s) }) ?? l)
  }

  function aoBotao(s: Story) {
    const b = s.botao
    if (!b) return
    const sair = (tela: WorkspacePage) => { setAberto(null); aoIr(tela) }
    switch (b.tipo) {
      case 'aula': sair('aulas'); break
      case 'ia': sair('robos'); break
      case 'aovivo': sair('aovivo'); break
      case 'gerenciamento': sair('gerenciamento'); break
      case 'marketplace': sair('marketplace'); break
      case 'deposito': window.open(DERIV.deposito, '_blank', 'noopener'); break
      case 'link': if (b.destino && /^https?:\/\//.test(b.destino)) window.open(b.destino, '_blank', 'noopener'); break
    }
  }

  if (!perfis) return <div className="sto-faixa"><div className="sto-fila carregando" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className="sto-bolha"><span className="sto-anel esqueleto"><i /></span><span className="sto-nome"><i /></span></span>)}</div></div>
  if (!ordenados.length && !equipe && !aoVivo) return null

  const rolar = (dir: 1 | -1) => fila.current?.scrollBy({ left: dir * fila.current.clientWidth * 0.7, behavior: 'smooth' })

  return (
    <div className={`sto-faixa ${bordas.esq ? 'tem-esq' : ''} ${bordas.dir ? 'tem-dir' : ''}`}>
      <div className="sto-fila" ref={fila} onScroll={medirBordas} role="list" aria-label="Stories">
        {aoVivo && (
          <button type="button" role="listitem" className="sto-bolha live" onClick={() => aoIr('aovivo')} aria-label="Transmissão ao vivo agora">
            <span className="sto-anel live"><span className="sto-ao-vivo-ico" aria-hidden="true"><i /><i /><i /></span></span>
            <em className="sto-tag-live">Ao vivo</em>
            <span className="sto-nome">Ao vivo</span>
          </button>
        )}
        {enviando.map((t) => (
          <button key={t.id} type="button" role="listitem" className={`sto-bolha enviando ${t.fase}`}
            onClick={() => { if (t.fase === 'erro') tentarDeNovo(t.id) }}
            aria-label={t.fase === 'erro' ? `O envio falhou: ${t.erro ?? ''}. Toque para tentar de novo` : t.fase === 'publicado' ? 'Story publicado' : `Enviando seu story, ${Math.round(t.total * 100)}%`}
            title={t.fase === 'erro' ? t.erro ?? undefined : undefined}>
            <span className="sto-anel progresso" style={{ ['--p' as string]: `${Math.round((t.fase === 'erro' ? 1 : t.total) * 360)}deg` }}>
              <span className="sto-av" style={{ width: 58, height: 58 }}>
                {t.miniatura ? <img src={t.miniatura} alt="" /> : <Avatar foto={t.perfil?.foto ?? null} nome={t.perfil?.nome ?? 'S'} tamanho={58} />}
                {t.fase === 'publicado' && <i className="sto-ok">✓</i>}
                {t.fase === 'erro' && <i className="sto-ok erro">↻</i>}
              </span>
            </span>
            <span className="sto-nome">{t.fase === 'erro' ? 'Tentar de novo' : t.fase === 'publicado' ? 'Publicado' : 'Enviando…'}</span>
          </button>
        ))}
        {equipe && (
          <button type="button" role="listitem" className="sto-bolha publicar" onClick={() => setEstudio(true)} aria-label="Publicar um story">
            <span className="sto-anel novo"><span className="sto-mais" aria-hidden="true">+</span></span>
            <span className="sto-nome">Publicar</span>
          </button>
        )}
        {ordenados.map((p, i) => {
          const novo = p.itens.some((s) => !s.visto)
          return (
            <button key={p.id} type="button" role="listitem" className={`sto-bolha ${novo ? '' : 'vista'}`} onClick={() => void abrir(i)}
              aria-label={`Stories de ${p.nome}${novo ? ', novo' : ''}`}>
              <span className={`sto-anel ${novo ? '' : 'visto'} ${girando === p.id ? 'girando' : ''}`}><Avatar foto={p.foto} nome={p.nome} tamanho={58} /></span>
              <span className="sto-nome">{p.nome}</span>
            </button>
          )
        })}
      </div>
      {bordas.esq && <button type="button" className="sto-rolar esq" onClick={() => rolar(-1)} aria-label="Ver anteriores">‹</button>}
      {bordas.dir && <button type="button" className="sto-rolar dir" onClick={() => rolar(1)} aria-label="Ver mais">›</button>}

      {typeof document !== 'undefined' && createPortal(
        <div className="sto-puxa" ref={puxada} aria-hidden="true">
          <span className="sto-puxa-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a4 4 0 100-8 4 4 0 000 8z" /></svg></span>
          <b>Story</b>
        </div>, document.body)}
      {estudio && <Suspense fallback={<div className="sto-v cel"><span className="sto-girando" /></div>}><EstudioDeStories sessao={sessao} papel={papel ?? null} aoFechar={() => setEstudio(false)} /></Suspense>}
      {aberto !== null && (
        <VisualizadorDeStories
          perfis={ordenados}
          perfilInicial={aberto}
          sessao={exemplo ? null : sessao}
          aoFechar={() => setAberto(null)}
          aoVer={aoVer}
          aoBotao={aoBotao}
          linkDe={(s) => linkDoStory(s.codigo, vitrine())}
          equipe={equipe}
          aoMetricas={(s) => { setAberto(null); pedirAbaStories(s.id); aoIr('gestao') }}
        />
      )}
    </div>
  )
}
