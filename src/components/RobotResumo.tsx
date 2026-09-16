/**
 * As duas formas compactas de uma sessão na tela de Robôs.
 *
 * - RobotLinha: uma linha da vista "Em lista". Só uma linha abre a cabine
 *   completa (RobotLive) embaixo dela; as outras seguem operando na linha.
 * - RobotCartao: um cartão da vista "Mosaico": mini-cabine com os números,
 *   o contrato em andamento e as três últimas operações.
 *
 * Os dois leem o mesmo EstadoMotor que a cabine completa lê. Nada aqui
 * fala com o servidor: quem desliga, religa e fecha é o LocalRobotPanel.
 * (Desenho combinado com o Tiago em 16/09/2026: lista como padrão, mosaico
 * como segunda vista, foco só troca no clique.)
 */
import type { ConfigEstrategia, EstadoMotor } from '../core/deriv/engine'

export interface ResumoProps {
  estado: EstadoMotor
  config: ConfigEstrategia
  moeda: string
  /** Nome do robô na marca ("Teeds - AG7"). */
  nome: string
  cor: string
  /** "#1", "#2"… — o que diferencia dois robôs iguais na mesma tela. */
  numero: string
  /** Quando esta tela começou a acompanhar a sessão (ms). */
  inicio: number | null
  demo: boolean | null
  /** "agressivo" / "conservador", só nos robôs que têm modo. */
  modo?: string | null
  conexao?: string
  onDesligar?: () => void
  desligando?: boolean
  onLigarDeNovo?: () => void
  onRemover?: () => void
}

const num = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const assinado = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v))}`
const hora = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
const horaSeg = (ms: number) => new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** A fase da sessão em uma palavra, com a mesma régua da cabine completa. */
export function faseDoEstado(e: EstadoMotor, conexao = 'open'): { chave: 'parado' | 'sem-sinal' | 'recuperando' | 'operando' | 'cacando'; texto: string } {
  if (!e.rodando) return { chave: 'parado', texto: e.emOperacao ? 'Concluindo o contrato' : 'Encerrada' }
  if (conexao !== 'open') return { chave: 'sem-sinal', texto: conexao === 'connecting' || conexao === 'reconnecting' ? 'Reconectando' : 'Sem conexão' }
  if (e.perdasSeguidas >= 1) return { chave: 'recuperando', texto: `Recuperando · nível ${e.perdasSeguidas}` }
  if (e.emCurso) return { chave: 'operando', texto: 'Operando' }
  if (e.emOperacao) return { chave: 'operando', texto: 'Enviando ordem' }
  return { chave: 'cacando', texto: 'Analisando' }
}

/** A curva da sessão em miniatura. Sem eixo, sem número: só a forma. */
function Sparkline({ pontos, positivo }: { pontos: number[]; positivo: boolean }) {
  const serie = [0, ...pontos.slice(-80)]
  const L = 140, A = 30, m = 3
  const min = Math.min(0, ...serie), max = Math.max(0, ...serie)
  const faixa = max - min || 1
  const x = (i: number) => (serie.length === 1 ? L : (i / (serie.length - 1)) * L)
  const y = (v: number) => m + (1 - (v - min) / faixa) * (A - 2 * m)
  const d = serie.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  return (
    <svg className="rs-curva" viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" aria-hidden>
      <path d={`M0,${y(0).toFixed(1)} L${L},${y(0).toFixed(1)}`} className="rs-zero" />
      <path d={d} className={positivo ? 'up' : 'down'} />
    </svg>
  )
}

function Chip({ fase }: { fase: ReturnType<typeof faseDoEstado> }) {
  return <span className={`rs-chip ${fase.chave}`}>{fase.texto}</span>
}

function Quem({ p, fase }: { p: ResumoProps; fase: ReturnType<typeof faseDoEstado> }) {
  return (
    <div className="rs-quem">
      <i className={`rs-farol ${fase.chave}`} aria-hidden />
      <div>
        <b><span className="rs-nome">{p.nome}</span><Chip fase={fase} /></b>
        <small>
          {p.numero}
          {p.inicio ? ` · ${hora(p.inicio)}` : ''}
          {p.demo !== null && p.demo !== undefined && <> · <em className={p.demo ? 'demo' : 'real'}>{p.demo ? 'DEMO' : 'REAL'}</em></>}
          {p.modo ? ` · ${p.modo}` : ''}
          <span className="rs-contadores"> · <em className="up">{p.estado.vitorias} positivas</em> · <em className="down">{p.estado.derrotas} negativas</em></span>
        </small>
      </div>
    </div>
  )
}

function Acoes({ p, extra }: { p: ResumoProps; extra?: React.ReactNode }) {
  const e = p.estado
  return (
    <div className="rs-acoes" onClick={(ev) => ev.stopPropagation()}>
      {e.rodando && p.onDesligar && (
        <button type="button" className="tv-btn parar" onClick={p.onDesligar} disabled={p.desligando} aria-busy={p.desligando}>
          <span aria-hidden>■</span> {p.desligando ? 'Desligando…' : 'Desligar'}
        </button>
      )}
      {!e.rodando && p.onLigarDeNovo && (
        <button type="button" className="tv-btn ligar" onClick={p.onLigarDeNovo}><span aria-hidden>▶</span> Continuar</button>
      )}
      {extra}
      {p.onRemover && (
        <button type="button" className="tv-btn sair" onClick={p.onRemover} title="Fechar este bloco" aria-label="Fechar este bloco">×</button>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ em lista */

export function RobotLinha(p: ResumoProps & { aberta: boolean; onAbrir: () => void }) {
  const e = p.estado
  const fase = faseDoEstado(e, p.conexao)
  const positivo = e.resultado >= 0
  const entrada = e.emCurso?.valor ?? e.valorAtual
  return (
    <div className={`rl ${p.aberta ? 'aberta' : ''} ${fase.chave} ${e.rodando ? 'viva' : 'encerrada'}`}
      style={{ ['--robo' as string]: p.cor }}
      role="button" tabIndex={0} aria-expanded={p.aberta}
      onClick={p.onAbrir} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); p.onAbrir() } }}>
      <Quem p={p} fase={fase} />
      <span className="rs-kpi"><i>{e.rodando ? 'Entrada atual' : 'Última entrada'}</i><b>{p.moeda} {num(entrada)}</b></span>
      <span className="rs-kpi"><i>Operações</i><b>{e.operacoes}</b></span>
      <span className="rs-kpi"><i>Positivas</i><b className="up">{e.vitorias}</b></span>
      <span className="rs-kpi"><i>Negativas</i><b className="down">{e.derrotas}</b></span>
      <span className="rs-kpi rs-resultado"><i>{e.rodando ? 'Resultado' : 'Resultado final'}</i><b className={positivo ? 'up' : 'down'}>{assinado(e.resultado)} <small>{p.moeda}</small></b></span>
      <Sparkline pontos={e.curva} positivo={positivo} />
      <Acoes p={p} extra={
        <span className="tv-btn rs-abrir" aria-hidden>{p.aberta ? 'Fechar ▴' : 'Abrir ▾'}</span>
      } />
    </div>
  )
}

/* ------------------------------------------------------------ mosaico */

export function RobotCartao(p: ResumoProps & { onAbrirNaLista: () => void }) {
  const e = p.estado
  const fase = faseDoEstado(e, p.conexao)
  const positivo = e.resultado >= 0
  const entrada = e.emCurso?.valor ?? e.valorAtual
  const ultimas = e.historico.slice(0, 3)
  const emCurso = e.emCurso
  // O que a linha do contrato diz, em uma frase.
  const contrato = !e.rodando
    ? (e.emOperacao ? 'Concluindo o contrato em andamento' : e.motivoParada ? `Encerrada — ${e.motivoParada}` : 'Sessão encerrada')
    : emCurso ? `Contrato em andamento · ${p.moeda} ${num(emCurso.valor)}`
    : e.aguardando || 'Aguardando sinal da estratégia'
  return (
    <div className={`rc ${fase.chave} ${e.rodando ? 'viva' : 'encerrada'}`} style={{ ['--robo' as string]: p.cor }}>
      <header className="rc-topo">
        <Quem p={p} fase={fase} />
        <Acoes p={p} />
      </header>
      <div className="rc-kpis">
        <span className="rs-kpi rs-resultado"><i>{e.rodando ? 'Resultado' : 'Resultado final'}</i><b className={positivo ? 'up' : 'down'}>{assinado(e.resultado)}</b></span>
        <span className="rs-kpi"><i>Entrada</i><b>{p.moeda} {num(entrada)}</b></span>
        <span className="rs-kpi"><i>Operações</i><b>{e.operacoes}</b></span>
        <span className="rs-kpi"><i>Positivas</i><b className="up">{e.vitorias}</b></span>
        <span className="rs-kpi"><i>Negativas</i><b className="down">{e.derrotas}</b></span>
      </div>
      <div className={`rc-contrato ${emCurso ? 'aberto' : ''}`}>
        <span>{contrato}</span>
        <i aria-hidden><b /></i>
      </div>
      <div className="rc-ops">
        {ultimas.length === 0 && <span className="rc-vazio">{e.rodando ? 'Nenhuma operação ainda' : 'Sem operações nesta sessão'}</span>}
        {ultimas.map((o) => (
          <div key={o.contractId} className="rc-op">
            <span className="muted">{o.n} · {horaSeg(o.quando)}</span>
            <span>{num(o.valor)}{o.digitoSaida !== null && <em className={`rs-dig ${o.ganhou ? 'up' : 'down'}`}>{o.digitoSaida}</em>}</span>
            <b className={o.lucro >= 0 ? 'up' : 'down'}>{assinado(o.lucro)}</b>
          </div>
        ))}
      </div>
      <footer className="rc-rodape">
        <Sparkline pontos={e.curva} positivo={positivo} />
        <button type="button" className="tv-btn" onClick={p.onAbrirNaLista}>Abrir na lista ›</button>
      </footer>
    </div>
  )
}
