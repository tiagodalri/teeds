import { useEffect, useMemo, useRef, useState } from 'react'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import { ESTRATEGIAS_LOCAIS, nomeDoRoboNaMarca } from '../core/deriv/strategies'
import { identidade } from '../core/deriv/branding'
import { useDigits } from '../hooks/useDigits'
import { MARCA } from '../marca'

/**
 * Painel flutuante "Dígitos ao vivo" da área dos robôs.
 *
 * A Deriv não manda porcentagem nenhuma: manda os preços. Quem conta o
 * último dígito de cada tick e monta as barras é a plataforma — e é isso
 * que os robôs fazem por dentro, com os últimos 25 dígitos. Este painel
 * mostra a MESMA memória (o hook de dígitos compartilha a linha pública do
 * gráfico e dos robôs; não abre assinatura nova na Deriv), com os dígitos
 * do grupo do robô acesos na cor dele e, no rodapé, o gatilho ao vivo dos
 * robôs que esperam padrão (AG2 e The Palm).
 *
 * Arrastável pela faixa do topo no computador; no celular vira uma gaveta
 * presa ao rodapé (arrastar janela no dedo é ruim). Posição e janela ficam
 * guardadas no navegador.
 */
const JANELAS = [25, 50, 100, 500, 1000] as const
const LARGURA = 360
const CHAVE_POS = `${MARCA.id}.digitos.posicao`
const CHAVE_JANELA = `${MARCA.id}.digitos.janela`

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

  // ------------------------------------------------ o que o robo esta vendo
  const memoria = estat.digitos.slice(-25)
  const pctDe = (aceita: (d: number) => boolean) => memoria.filter(aceita).length * 4
  const pctGrupoNaJanela = estat.total
    ? Math.round((estat.conta.reduce((t, c, d) => t + (grupo.has(d) ? c : 0), 0) / estat.total) * 100)
    : 0
  const gatilho = (() => {
    if (memoria.length < 25) return { texto: `lendo o mercado — ${memoria.length}/25 dígitos`, ok: null as boolean | null }
    if (roboId === 'ag2') {
      const p = pctDe((d) => d <= 2)
      return { texto: `0, 1 e 2 em ${p}% dos últimos 25 · entra a partir de 36%`, ok: p >= 36 }
    }
    if (roboId === 'thepalm') {
      const nove = pctDe((d) => d === 9)
      const baixos = pctDe((d) => d <= 4)
      return {
        texto: `Modo 1: dígito 9 em ${nove}% (limite 12%) · Modo 2: 0 a 4 em ${baixos}% (libera em 48%)`,
        ok: nove <= 12,
      }
    }
    return { texto: 'entra sempre — não usa gatilho, uma entrada por tick', ok: null }
  })()

  // ------------------------------------------------------------ arrastar
  const [movel, setMovel] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const ouvir = () => setMovel(mq.matches)
    mq.addEventListener('change', ouvir)
    return () => mq.removeEventListener('change', ouvir)
  }, [])
  const caixa = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number }>(() =>
    ler(CHAVE_POS, { x: Math.max(12, window.innerWidth - LARGURA - 24), y: 120 }))
  const arrasto = useRef<{ dx: number; dy: number } | null>(null)

  const dentroDaTela = (p: { x: number; y: number }) => {
    const h = caixa.current?.offsetHeight ?? 420
    return {
      x: Math.min(Math.max(0, p.x), Math.max(0, window.innerWidth - LARGURA)),
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
    const ajustar = () => setPos((p) => dentroDaTela(p))
    window.addEventListener('resize', ajustar)
    return () => window.removeEventListener('resize', ajustar)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar() }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [aoFechar])

  const trocarJanela = (j: number) => { setJanela(j); guardar(CHAVE_JANELA, j) }
  const maxPct = Math.max(...estat.pct, 1)
  const listaGrupo = [...grupo].sort((a, b) => a - b)
  const grupoTexto = listaGrupo.length > 3
    ? `${listaGrupo[0]} a ${listaGrupo[listaGrupo.length - 1]}`
    : listaGrupo.join(', ')

  return (
    <div ref={caixa} className={`df ${movel ? 'df-movel' : ''}`} role="dialog" aria-label="Dígitos ao vivo"
      style={movel ? { ['--robo' as string]: ident.cor } : { left: pos.x, top: pos.y, ['--robo' as string]: ident.cor }}>
      <div className="df-topo" onPointerDown={comecar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}>
        {!movel && <span className="df-grip" aria-hidden="true">⋮⋮</span>}
        <div>
          <b>Dígitos ao vivo</b>
          <small>{nomeAtivo ?? ATIVO_DOS_ROBOS} · último dígito <strong>{estat.ultimo ?? '—'}</strong></small>
        </div>
        <button className="df-fechar" onClick={aoFechar} aria-label="Fechar">×</button>
      </div>

      <div className="df-corpo">
        <div className="df-janela">
          <span className="rot">Janela</span>
          <div className="segmented mini" role="group" aria-label="Quantos ticks contar">
            {JANELAS.map((j) => (
              <button key={j} type="button" className={janela === j ? 'on' : ''} onClick={() => trocarJanela(j)}
                title={j === 25 ? 'o que o robô usa para decidir' : undefined}>{j}</button>
            ))}
          </div>
        </div>

        <div className="df-barras" aria-label="Frequência de cada dígito">
          {estat.pct.map((p, d) => (
            <div key={d} className={`df-barra ${grupo.has(d) ? 'alvo' : ''} ${estat.ultimo === d ? 'ultimo' : ''}`}
              title={`${estat.conta[d]} vezes em ${estat.total}`}>
              <em>{p.toFixed(0)}%</em>
              <span className="col" style={{ height: `${(p / maxPct) * 100}%` }} />
              <b>{d}</b>
            </div>
          ))}
        </div>

        <div className="df-fita" aria-label="Últimos dígitos">
          {estat.recentes.slice(-14).map((d, i, arr) => (
            <span key={i} className={`df-chip ${grupo.has(d) ? 'alvo' : ''} ${i === arr.length - 1 ? 'ultimo' : ''}`}>{d}</span>
          ))}
        </div>

        <div className="df-rodape">
          <div>
            Grupo do <b>{nome}</b> ({grupoTexto}): <b>{pctGrupoNaJanela}%</b> nos últimos {estat.total || janela}
            <span className="df-esperado"> · esperado {grupo.size * 10}%</span>
          </div>
          <div className={`df-gatilho ${gatilho.ok === true ? 'ok' : gatilho.ok === false ? 'nao' : ''}`}>
            {gatilho.ok === true ? '● ' : gatilho.ok === false ? '○ ' : ''}{gatilho.texto}
          </div>
        </div>
        {estat.carregando && <p className="df-nota">lendo o histórico…</p>}
      </div>
    </div>
  )
}
