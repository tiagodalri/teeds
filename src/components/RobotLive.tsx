import { useMemo } from 'react'
import type { ConfigEstrategia, EstadoMotor } from '../core/deriv/engine'

interface Props {
  estado: EstadoMotor
  config: ConfigEstrategia
  moeda: string
  nomeEstrategia: string
  /** Dígitos que fazem a operação ganhar, para pintar a fita. */
  ganhaCom: (d: number) => boolean
}

const din = (v: number, m = 'USD') =>
  `${m} ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hora = (e: number) =>
  new Date(e * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** Curva do resultado acumulado, desenhada como um traço só. */
function Curva({ pontos, positivo }: { pontos: number[]; positivo: boolean }) {
  const d = useMemo(() => {
    if (pontos.length < 2) return null
    const min = Math.min(...pontos, 0)
    const max = Math.max(...pontos, 0)
    const faixa = max - min || 1
    const L = 100, A = 42
    const px = (i: number) => (i / (pontos.length - 1)) * L
    const py = (v: number) => A - ((v - min) / faixa) * A
    const linha = pontos.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(2)} ${py(v).toFixed(2)}`).join(' ')
    const area = `${linha} L ${L} ${A} L 0 ${A} Z`
    return { linha, area, zero: py(0), temZero: min < 0 && max > 0 }
  }, [pontos])

  if (!d) return <div className="curva-vazia">a curva aparece na primeira operação</div>

  const cor = positivo ? 'var(--up)' : 'var(--down)'
  return (
    <svg className="curva" viewBox="0 0 100 42" preserveAspectRatio="none" aria-hidden="true">
      <path d={d.area} fill={cor} opacity="0.12" />
      {d.temZero && (
        <line x1="0" x2="100" y1={d.zero} y2={d.zero} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="2 2" />
      )}
      <path d={d.linha} fill="none" stroke={cor} strokeWidth="1.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function RobotLive({ estado, config, moeda, nomeEstrategia, ganhaCom }: Props) {
  const acerto = estado.operacoes ? (estado.vitorias / estado.operacoes) * 100 : 0
  const positivo = estado.resultado >= 0
  const fita = estado.digitos.slice(-20)

  // posição entre o limite de perda e a meta de lucro
  const teto = config.takeProfit || 1
  const piso = config.stopLoss || 1
  const pos = estado.resultado >= 0
    ? 50 + Math.min(50, (estado.resultado / teto) * 50)
    : 50 - Math.min(50, (Math.abs(estado.resultado) / piso) * 50)

  const situacao = !estado.rodando
    ? { chave: 'parado', texto: 'Parado' }
    : estado.emOperacao
      ? { chave: 'operando', texto: 'Em operação' }
      : estado.perdasSeguidas >= 1
        ? { chave: 'recuperando', texto: 'Recuperando' }
        : { chave: 'cacando', texto: 'Caçando entrada' }

  return (
    <div className="viv">
      {/* ---------- cabeçalho ---------- */}
      <div className={`viv-cab ${situacao.chave}`}>
        <div className="viv-situacao">
          <i className="viv-pulso" />
          <div>
            <b>{situacao.texto}</b>
            <span>{nomeEstrategia}</span>
          </div>
        </div>
        <div className="viv-resultado">
          <span className="rot">Resultado</span>
          <strong className={positivo ? 'ganho' : 'perda'}>
            {positivo ? '+' : '−'}{din(estado.resultado, moeda)}
          </strong>
        </div>
      </div>

      {/* ---------- curva + trilho dos freios ---------- */}
      <div className="viv-curva">
        <Curva pontos={estado.curva} positivo={positivo} />
        <div className="viv-trilho">
          <span className="lado perda">−{din(config.stopLoss, '')}</span>
          <div className="barra">
            <i style={{ left: `${pos}%` }} className={positivo ? 'ganho' : 'perda'} />
            <u style={{ left: '50%' }} />
          </div>
          <span className="lado ganho">+{din(config.takeProfit, '')}</span>
        </div>
      </div>

      {/* ---------- condição de entrada ---------- */}
      {estado.rodando && estado.condicao && !estado.emOperacao && (
        <div className="viv-condicao">
          <span className="rot">{estado.condicao.rotulo}</span>
          <div className="viv-slots">
            {estado.condicao.itens.map((it, i) => (
              <span key={i} className={`slot ${it.ok ? 'ok' : it.valor === '–' ? 'vazio' : 'nao'}`}>
                {it.valor}
              </span>
            ))}
            <em className="viv-seta">→</em>
            <span className={`slot alvo ${estado.condicao.itens.every((i) => i.ok) ? 'pronto' : ''}`}>
              {estado.condicao.itens.every((i) => i.ok) ? 'entra' : 'espera'}
            </span>
          </div>
        </div>
      )}

      {estado.emOperacao && (
        <div className="viv-operando">
          <i /> operação em andamento — aguardando o resultado
        </div>
      )}

      {!estado.rodando && estado.motivoParada && (
        <div className="viv-parado">Parou porque {estado.motivoParada}.</div>
      )}

      {/* ---------- fita de dígitos ---------- */}
      <div className="viv-fita-bloco">
        <span className="rot">Últimos dígitos</span>
        <div className="viv-fita">
          {fita.map((d, i) => (
            <span key={i} className={`vd ${ganhaCom(d) ? 'alvo' : ''} ${i === fita.length - 1 ? 'agora' : ''}`}>{d}</span>
          ))}
          {fita.length === 0 && <span className="viv-nada">lendo o mercado…</span>}
        </div>
      </div>

      {/* ---------- números ---------- */}
      <div className="viv-nums">
        <div>
          <span className="rot">Operações</span>
          <b>{estado.operacoes}</b>
          <em>{estado.vitorias}G · {estado.derrotas}P</em>
        </div>
        <div>
          <span className="rot">Acerto</span>
          <b>{acerto.toFixed(0)}%</b>
          <em>{estado.perdasSeguidas > 0 ? `${estado.perdasSeguidas} perdas seguidas` : 'sem sequência'}</em>
        </div>
        <div>
          <span className="rot">Próxima entrada</span>
          <b>{din(estado.valorAtual, moeda)}</b>
          <em>{estado.valorAtual > config.valorAoVencer ? 'progressão ativa' : 'valor base'}</em>
        </div>
        <div>
          <span className="rot">Movimentado</span>
          <b>{din(estado.movimentado, moeda)}</b>
          <em>{estado.ultimoLucro !== null
            ? `última: ${estado.ultimoLucro >= 0 ? '+' : '−'}${din(estado.ultimoLucro, '')}`
            : '—'}</em>
        </div>
      </div>

      {/* ---------- histórico ---------- */}
      <div className="viv-log">
        {estado.registros.map((r, i) => (
          <div key={i} className={`viv-linha ${r.tipo}`}>
            <span>{hora(r.hora)}</span>
            <b>{r.texto}</b>
          </div>
        ))}
      </div>
    </div>
  )
}
