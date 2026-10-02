import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import { useDigits } from '../hooks/useDigits'
import { IconeFechar } from './IconeFechar'
import { MARCA } from '../marca'

/**
 * Painel flutuante "Dígitos ao vivo" da área dos robôs.
 *
 * A Deriv não manda porcentagem nenhuma: manda os preços. Quem conta o
 * último dígito de cada tick e monta as barras é a plataforma. Este painel
 * mostra a MESMA memória que os robôs leem (o hook de dígitos compartilha a
 * linha pública do gráfico e dos robôs; não abre assinatura nova na Deriv).
 *
 * O painel fala do ÍNDICE, não de robô nenhum (Tiago, 02/10/2026). Ele já
 * referenciou o grupo e o gatilho do robô de onde foi aberto, e isso estava
 * errado por dois motivos: quem opera com dois ou três robôs ao mesmo tempo
 * via a leitura de um só, e quem abria pelo The Palm lia os dígitos do AG7.
 * Aqui é o mercado, cru. O que cada robô faz com ele é assunto da cabine.
 *
 * O destaque é estatístico, não uma opinião. Cada dígito tem 10% de chance;
 * o que o painel acende é quem está ACIMA DISSO mais do que o acaso explica,
 * medido em desvios-padrão da própria amostra (ver `forcaDoDesvio`). Assim
 * 12% em 1000 ticks acende forte e 12% em 25 ticks quase não acende, que é
 * exatamente a diferença entre tendência e ruído.
 *
 * Desenha-se num portal, direto no <body>: dentro da central de robôs há
 * uma regra que estica todo filho direto para 100% da largura, e o painel
 * chegou a nascer com a tela inteira. Nasce compacto (300px), tudo à vista
 * sem rolar; a alça do canto inferior direito redimensiona (260–680px) e o
 * painel inteiro escala junto — barras, fita, textos. Arrastável pela faixa
 * do topo; no celular vira gaveta.
 */
const JANELAS = [25, 50, 100, 500, 1000] as const
/** Largura de referência: a escala visual é largura / LARGURA. */
const LARGURA = 300
const LARGURA_MIN = 260
const LARGURA_MAX = 680
const CHAVE_POS = `${MARCA.id}.digitos.posicao`
const CHAVE_JANELA = `${MARCA.id}.digitos.janela`
const CHAVE_LARGURA = `${MARCA.id}.digitos.largura`

/** Todo dígito tem a mesma chance: 10%. É a régua de tudo aqui. */
const ESPERADO = 10

interface Props {
  nomeAtivo?: string
  aoFechar: () => void
}

function ler<T>(chave: string, padrao: T): T {
  try { const v = localStorage.getItem(chave); return v ? (JSON.parse(v) as T) : padrao } catch { return padrao }
}
function guardar(chave: string, valor: unknown) {
  try { localStorage.setItem(chave, JSON.stringify(valor)) } catch { /* sem armazenamento: vale ate recarregar */ }
}

/**
 * Quanto um dígito está fora do esperado, em desvios-padrão da amostra.
 *
 * Sem isto o painel mentiria pelo tamanho da amostra: 16% em 25 ticks é
 * um dígito a mais que o normal, coisa que acontece o tempo todo, e 12% em
 * 1000 ticks é uma diferença que o acaso raramente produz. Os dois acenderiam
 * igual numa régua fixa de "acima de 10%". O desvio-padrão de uma proporção
 * de 10% em n sorteios é raiz(0,1 × 0,9 / n), e dividir por ele põe as duas
 * janelas na mesma escala.
 */
function forcaDoDesvio(pct: number, total: number): number {
  if (!total) return 0
  const sigma = Math.sqrt((0.1 * 0.9) / total) * 100
  return (pct - ESPERADO) / sigma
}

/** A partir de quantos desvios o painel acende (e onde a cor satura). */
const ACENDE = 0.75
const SATURA = 2

export function DigitosFlutuante({ nomeAtivo, aoFechar }: Props) {
  const [janela, setJanela] = useState<number>(() => {
    const j = ler<number>(CHAVE_JANELA, 25)
    return (JANELAS as readonly number[]).includes(j) ? j : 25
  })
  const estat = useDigits(ATIVO_DOS_ROBOS, 2, janela)

  // ----------------------------------------------- quem está fora da média
  // Um número por dígito: quantos desvios ele está acima (ou abaixo) dos 10%.
  const desvios = estat.pct.map((pct) => forcaDoDesvio(pct, estat.total))
  /** 0 a 1: o quanto a cor de um dígito deve saturar. */
  const brilho = (z: number) => Math.min(1, Math.max(0, (Math.abs(z) - ACENDE) / (SATURA - ACENDE)))
  const emAlta = desvios
    .map((z, d) => ({ d, z }))
    .filter((x) => x.z >= ACENDE)
    .sort((a, b) => b.z - a.z)

  // Duas divisões que dizem algo que as barras não mostram de cara. Ambas
  // valem 50% num mercado sem viés, e é contra esse 50 que a barrinha lê.
  const fatia = (aceita: (d: number) => boolean) => (estat.total
    ? (estat.conta.reduce((t, c, d) => t + (aceita(d) ? c : 0), 0) / estat.total) * 100
    : 50)
  const divisoes = [
    { a: 'Pares', b: 'Ímpares', pct: fatia((d) => d % 2 === 0) },
    { a: '0 a 4', b: '5 a 9', pct: fatia((d) => d <= 4) },
  ]
  const lendo = estat.total < 10
  // O contorno de "mais frequente" só faz sentido quando há UM mais
  // frequente: num empate (e começa tudo empatado em zero) marcar os dez é
  // o mesmo que não marcar nenhum, com ruído visual de brinde.
  const lider = (() => {
    if (!estat.total) return -1
    const topo = Math.max(...estat.pct)
    const empatados = estat.pct.filter((x) => x >= topo - 0.01)
    return empatados.length === 1 ? estat.pct.findIndex((x) => x >= topo - 0.01) : -1
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
  const ativoCurto = (nomeAtivo ?? ATIVO_DOS_ROBOS).replace(/\s*Index$/i, '')

  const painel = (
    <div ref={caixa} className={`pd ${movel ? 'pd-movel' : ''}`} role="dialog" aria-label="Dígitos ao vivo"
      style={movel ? undefined : { left: pos.x, top: pos.y, width: largura, ['--pd-escala' as string]: escala }}>
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
        <span className="pd-esperado" style={{ bottom: `${Math.min(96, (ESPERADO / maxPct) * 100)}%` }} aria-hidden="true" />
        {estat.pct.map((pct, d) => {
          const z = desvios[d]
          const estado = z >= ACENDE ? 'alta' : z <= -ACENDE ? 'baixa' : ''
          return (
            <div key={d} className={`pd-barra ${estado} ${estat.ultimo === d ? 'ultimo' : ''} ${d === lider ? 'lider' : ''}`}
              style={{ ['--brilho' as string]: brilho(z).toFixed(2) }}
              title={`${estat.conta[d]} vezes em ${estat.total} · esperado ${ESPERADO}%`}>
              <em>{pct.toFixed(0)}%</em>
              <i style={{ height: `${Math.max(3, (pct / maxPct) * 100)}%` }} />
              <b>{d}</b>
            </div>
          )
        })}
      </div>

      <div className="pd-fita" aria-label="Últimos dígitos">
        {estat.recentes.slice(-12).map((d, i, arr) => (
          <span key={i} className={`${desvios[d] >= ACENDE ? 'alta' : ''} ${i === arr.length - 1 ? 'ultimo' : ''}`}>{d}</span>
        ))}
      </div>

      <div className="pd-resumo">
        <div className="pd-alta">
          <span>Em alta</span>
          {lendo ? <small>lendo o mercado</small>
            : emAlta.length === 0 ? <small>nenhum dígito acima do esperado</small>
            : <div className="pd-chips">
                {emAlta.slice(0, 5).map(({ d, z }) => (
                  <b key={d} style={{ ['--brilho' as string]: brilho(z).toFixed(2) }}
                    title={`${estat.pct[d].toFixed(0)}% contra os ${ESPERADO}% esperados`}>{d}</b>
                ))}
              </div>}
        </div>
        {divisoes.map((x) => (
          <div className="pd-divisao" key={x.a}>
            <span>{x.a} <b>{x.pct.toFixed(0)}%</b></span>
            <i aria-hidden="true"><u style={{ width: `${x.pct}%` }} /></i>
            <span><b>{(100 - x.pct).toFixed(0)}%</b> {x.b}</span>
          </div>
        ))}
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
