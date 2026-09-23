import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import { ESTRATEGIAS_LOCAIS, nomeDoRoboNaMarca } from '../core/deriv/strategies'
import { identidade } from '../core/deriv/branding'
import { configDeReferencia, PALM_PADRAO, parametrosPadrao } from '../core/deriv/parametros'
import { useParametrosDoRobo } from '../core/teeds/catalogoRobos'
import { useDigits } from '../hooks/useDigits'
import { IconeFechar } from './IconeFechar'
import { MARCA } from '../marca'

/**
 * Painel flutuante "Dígitos ao vivo" da área dos robôs.
 *
 * A Deriv não manda porcentagem nenhuma: manda os preços. Quem conta o
 * último dígito de cada tick e monta as barras é a plataforma — e é isso
 * que os robôs fazem por dentro, com os últimos 25 dígitos. Este painel
 * mostra a MESMA memória (o hook de dígitos compartilha a linha pública do
 * gráfico e dos robôs; não abre assinatura nova na Deriv), com os dígitos
 * do grupo do robô acesos na cor dele e o gatilho ao vivo no rodapé.
 *
 * Desenha-se num portal, direto no <body>: dentro da central de robôs há
 * uma regra que estica todo filho direto para 100% da largura, e o painel
 * chegou a nascer com a tela inteira. Nasce compacto (300px), tudo à vista
 * sem rolar; a alça do canto inferior direito redimensiona (260–680px) e o
 * painel inteiro escala junto — barras, fita, textos. Arrastável pela faixa
 * do topo; no celular vira gaveta.
 *
 * Cores: os dígitos com que o robô acerta são VERDES (a cor de ganho da
 * plataforma), os demais ficam neutros; a cor do robô fica só no nome.
 */
const JANELAS = [25, 50, 100, 500, 1000] as const
/** Largura de referência: a escala visual é largura / LARGURA. */
const LARGURA = 300
const LARGURA_MIN = 260
const LARGURA_MAX = 680
const CHAVE_POS = `${MARCA.id}.digitos.posicao`
const CHAVE_JANELA = `${MARCA.id}.digitos.janela`
const CHAVE_LARGURA = `${MARCA.id}.digitos.largura`

interface Props {
  roboId: string
  nomeAtivo?: string
  aoFechar: () => void
}

function ler<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao } catch { return padrao }
}
function guardar(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)) } catch { /* sem armazenamento: vale ate recarregar */ }
}

/** Digitos que fazem o robo acertar (no The Palm, o modo normal: Under 9). */
function grupoDoRobo(roboId: string): Set<number> {
  const e = ESTRATEGIAS_LOCAIS.find((x) => x.id === roboId)
  const g = new Set<number>()
  if (!e) return g
  const b = e.barreira ?? 0
  for (let d = 0; d <= 9; d++) {
    const ok = e.contractType === 'DIGITOVER' ? d > b
      : e.contractType === 'DIGITUNDER' ? d < b
      : e.contractType === 'DIGITMATCH' ? d === b
      : e.contractType === 'DIGITDIFF' ? d !== b
      : e.contractType === 'DIGITEVEN' ? d % 2 === 0
      : e.contractType === 'DIGITODD' ? d % 2 === 1
      : false
    if (ok) g.add(d)
  }
  return g
}

export function DigitosFlutuante({ roboId, nomeAtivo, aoFechar }: Props) {
  const [janela, setJanela] = useState<number>(() => {
    const j = ler<number>(CHAVE_JANELA, 25)
    return (JANELAS as readonly number[]).includes(j) ? j : 25
  })
  const estat = useDigits(ATIVO_DOS_ROBOS, 2, janela)
  const ident = identidade(roboId)
  const estrategia = ESTRATEGIAS_LOCAIS.find((x) => x.id === roboId)
  const nome = estrategia ? nomeDoRoboNaMarca(estrategia, MARCA) : ident.nome
  const grupo = useMemo(() => grupoDoRobo(roboId), [roboId])
  // A regra vigente do robô na marca (o que o painel publicou); antes de
  // carregar, o padrão do código. O gatilho do rodapé é a mesma conta do
  // `entrar` da estratégia, dita pelo medidor — nada é recalculado à mão aqui.
  const dados = useParametrosDoRobo(roboId)
  const p = dados?.parametros ?? parametrosPadrao(roboId)

  // ------------------------------------------------ o que o robo esta vendo
  const memoria = estat.digitos.slice(-25)
  const pctDe = (aceita: (d: number) => boolean) => memoria.filter(aceita).length * 4
  const pctGrupoNaJanela = estat.total
    ? Math.round((estat.conta.reduce((t, c, d) => t + (grupo.has(d) ? c : 0), 0) / estat.total) * 100)
    : 0
  const gatilho = (() => {
    if (memoria.length < 25) return { texto: `lendo o mercado — ${memoria.length}/25 dígitos`, ok: null as boolean | null }
    if (roboId === 'thepalm') {
      const palm = p.palm ?? PALM_PADRAO
      const nove = pctDe((d) => d === 9)
      const baixos = pctDe((d) => d <= 4)
      return { texto: `Modo 1: 9 em ${nove}% (limite ${palm.limiteNove}%) · Modo 2: 0–4 em ${baixos}% (libera em ${palm.limiteBaixos}%)`, ok: nove <= palm.limiteNove }
    }
    const medidor = estrategia?.medidor?.({ digitos: estat.digitos, config: configDeReferencia(p) }) ?? null
    if (!medidor) return { texto: 'entra sempre — uma entrada por tick, sem gatilho', ok: null }
    if (medidor.tipo === 'contagem') {
      const alvo = medidor.alvo
      const espera = alvo === 1 ? '1 dígito que teria perdido' : `${alvo} dígitos seguidos que teriam perdido`
      return { texto: `loss virtual ${medidor.valor}/${alvo} — entra depois de ${espera}`, ok: medidor.valor >= alvo }
    }
    return { texto: `${medidor.rotulo}: ${medidor.valor}% (entra a partir de ${medidor.alvo}%)`, ok: medidor.valor >= medidor.alvo }
  })()

  // ------------------------------------------------------------ tamanho
  const larguraMaxima = () => Math.max(LARGURA_MIN, Math.min(LARGURA_MAX, window.innerWidth - 24))
  const [largura, setLargura] = useState<number>(() => {
    const l = ler<number>(CHAVE_LARGURA, LARGURA)
    return Number.isFinite(l) ? Math.min(Math.max(LARGURA_MIN, l), larguraMaxima()) : LARGURA
  })
  const escala = largura / LARGURA

  // ------------------------------------------------------------ arrastar
  const [movel, setMovel] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const ouvir = () => setMovel(mq.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])
  const caixa = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    const padrao = { x: Math.max(12, window.innerWidth - largura - 24), y: 120 }
    const g = ler<Partial<{ x: number; y: number }>>(CHAVE_POS, padrao)
    const x = typeof g?.x === 'number' && Number.isFinite(g.x) ? g.x : padrao.x
    const y = typeof g?.y === 'number' && Number.isFinite(g.y) ? g.y : padrao.y
    return {
      x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - largura)),
      y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - 120)),
    }
  })
  const arrasto = useRef<{ dx: number; dy: number } | null>(null)
  const dentroDaTela = (p: { x: number; y: number }) => {
    const h = caixa.current?.offsetHeight ?? 300
    return {
      x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - largura)),
      y: Math.min(Math.max(0, p.y), Math.max(0, window.innerHeight - Math.min(h, 120))),
    }
  }
  const comecar = (e: React.PointerEvent) => {
    if (movel || (e.target as HTMLElement).closest('button')) return
    arrasto.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const mover = (e: React.PointerEvent) => {
    if (!arrasto.current) return
    setPos(dentroDaTela({ x: e.clientX - arrasto.current.dx, y: e.clientY - arrasto.current.dy }))
  }
  const soltar = () => {
    if (!arrasto.current) return
    arrasto.current = null
    setPos((p) => { const q = dentroDaTela(p); guardar(CHAVE_POS, q); return q })
  }
  useEffect(() => {
    const ajustar = () => { setLargura((l) => Math.min(l, larguraMaxima())); setPos((p) => dentroDaTela(p)) }
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, [largura]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------- redimensionar
  const redimensao = useRef<{ x0: number; l0: number } | null>(null)
  const comecarRedimensao = (e: React.PointerEvent) => {
    if (movel) return
    e.preventDefault(); e.stopPropagation()
    redimensao.current = { x0: e.clientX, l0: largura }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const redimensionar = (e: React.PointerEvent) => {
    if (!redimensao.current) return
    const alvo = redimensao.current.l0 + (e.clientX - redimensao.current.x0)
    const maxAqui = Math.min(larguraMaxima(), window.innerWidth - pos.x - 8)
    setLargura(Math.round(Math.min(Math.max(LARGURA_MIN, alvo), Math.max(LARGURA_MIN, maxAqui))))
  }
  const soltarRedimensao = () => {
    if (!redimensao.current) return
    redimensao.current = null
    setLargura((l) => { guardar(CHAVE_LARGURA, l); return l })
  }
  const tamanhoPadrao = () => { setLargura(LARGURA); guardar(CHAVE_LARGURA, LARGURA); setPos((p) => dentroDaTela(p)) }
  const redimensionarPorTecla = (e: React.KeyboardEvent) => {
    const passo = e.shiftKey ? 40 : 10
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setLargura((l) => { const n = Math.min(larguraMaxima(), l + passo); guardar(CHAVE_LARGURA, n); return n }) }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setLargura((l) => { const n = Math.max(LARGURA_MIN, l - passo); guardar(CHAVE_LARGURA, n); return n }) }
    if (e.key === 'Home') { e.preventDefault(); tamanhoPadrao() }
  }
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])

  const trocarJanela = (j: number) => { setJanela(j); guardar(CHAVE_JANELA, j) }
  const maxPct = Math.max(...estat.pct, 1)
  const listaGrupo = [...grupo].sort((a, b) => a - b)
  const grupoTexto = listaGrupo.length > 3 ? `${listaGrupo[0]} a ${listaGrupo[listaGrupo.length - 1]}` : listaGrupo.join(', ')
  const ativoCurto = (nomeAtivo ?? ATIVO_DOS_ROBOS).replace(/\s*Index$/i, '')

  const painel = (
    <div ref={caixa} className={`pd ${movel ? 'pd-movel' : ''}`} role="dialog" aria-label="Dígitos ao vivo"
      style={movel ? { ['--robo' as string]: ident.cor } : { left: pos.x, top: pos.y, width: largura, ['--robo' as string]: ident.cor, ['--pd-escala' as string]: escala }}>
      <div className="pd-topo" onPointerDown={comecar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        {!movel && <span className="pd-grip" aria-hidden="true">⋮⋮</span>}
        <b>Dígitos ao vivo</b>
        <span className="pd-ativo">{ativoCurto}</span>
        <span className="pd-ultimo" title="último dígito que chegou">{estat.ultimo ?? '—'}</span>
        <button className="pd-fechar" onClick={aoFechar} aria-label="Fechar"><IconeFechar /></button>
      </div>

      <div className="pd-janela">
        <span>últimos</span>
        <div className="segmented mini" role="group" aria-label="Quantos ticks contar">
          {JANELAS.map((j) => (
            <button key={j} type="button" className={janela === j ? 'on' : ''} onClick={() => trocarJanela(j)}
              title={j === 25 ? 'a memória do robô' : undefined}>{j}</button>
          ))}
        </div>
        <span>ticks</span>
      </div>

      <div className="pd-barras" aria-label="Frequência de cada dígito">
        {/* a linha tracejada é o esperado de um dígito ao acaso: 10% */}
        <span className="pd-esperado" style={{ bottom: `${Math.min(96, (10 / maxPct) * 100)}%` }} aria-hidden="true" />
        {estat.pct.map((p, d) => (
          <div key={d} className={`pd-barra ${grupo.has(d) ? 'alvo' : ''} ${estat.ultimo === d ? 'ultimo' : ''} ${p >= maxPct - 0.01 && estat.total ? 'lider' : ''}`}
            title={`${estat.conta[d]} vezes em ${estat.total}`}>
            <em>{p.toFixed(0)}%</em>
            <i style={{ height: `${Math.max(3, (p / maxPct) * 100)}%` }} />
            <b>{d}</b>
          </div>
        ))}
      </div>

      <div className="pd-fita" aria-label="Últimos dígitos">
        {estat.recentes.slice(-12).map((d, i, arr) => (
          <span key={i} className={`${grupo.has(d) ? 'alvo' : ''} ${i === arr.length - 1 ? 'ultimo' : ''}`}>{d}</span>
        ))}
      </div>

      <div className="pd-resumo">
        <div className="pd-grupo">
          <span>Grupo do <b>{nome}</b><small> · {grupoTexto}</small></span>
          <strong>{pctGrupoNaJanela}%</strong>
          <small>esperado {grupo.size * 10}%</small>
        </div>
        <div className={`pd-gatilho ${gatilho.ok === true ? 'ok' : gatilho.ok === false ? 'nao' : ''}`}>
          <i /> {gatilho.texto}
        </div>
      </div>

      {!movel && (
        <button type="button" className="pd-alca" aria-label={`Redimensionar o painel (largura ${largura}px). Setas ajustam; Home volta ao padrão.`}
          title="Arraste para redimensionar · duplo clique volta ao tamanho padrão"
          onPointerDown={comecarRedimensao} onPointerMove={redimensionar} onPointerUp={soltarRedimensao} onPointerCancel={soltarRedimensao}
          onDoubleClick={tamanhoPadrao} onKeyDown={redimensionarPorTecla}>
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M11 1v10H1M11 5v6H5M11 9v2H9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
        </button>
      )}
    </div>
  )
  return createPortal(painel, document.body)
}
