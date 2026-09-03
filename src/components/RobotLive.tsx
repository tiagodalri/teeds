import { useMemo, useState } from 'react'
import type { ConfigEstrategia, EstadoMotor } from '../core/deriv/engine'
import { useClock } from '../hooks/useClock'

interface Props {
  estado: EstadoMotor
  config: ConfigEstrategia
  moeda: string
  nomeEstrategia: string
  /** Nome do ativo, por extenso. */
  ativo: string
  /** Como este bloco se chama na tela: "Robô 1", "Robô 2"... */
  titulo: string
  /** A regra em uma frase: "maior que 5", "par"... */
  regra: string
  cor?: string
  /** Digitos que fazem a operacao ganhar, para pintar a fita. */
  ganhaCom: (d: number) => boolean
  /** Os parametros escolhidos, escondidos atras de um botao. */
  parametros?: Array<{ rot: string; valor: string }>
  /** Estado da conexao autenticada — se cair, o robo para de receber preco. */
  conexao?: string
  onDesligar?: () => void
  onLigarDeNovo?: () => void
  onRemover?: () => void
  expandido?: boolean
  onExpandir?: () => void
}

const num = (v: number) =>
  Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const assinado = (v: number) => `${v >= 0 ? '+' : '−'}${num(v)}`

const relogio = (ms: number) =>
  new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/* ------------------------------------------------------------------ curva */

function Curva({ pontos, positivo }: { pontos: number[]; positivo: boolean }) {
  const d = useMemo(() => {
    if (pontos.length < 2) return null
    const min = Math.min(...pontos, 0)
    const max = Math.max(...pontos, 0)
    const faixa = max - min || 1
    const L = 100, A = 34
    const px = (i: number) => (i / (pontos.length - 1)) * L
    const py = (v: number) => A - ((v - min) / faixa) * A
    const linha = pontos.map((v, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(2)} ${py(v).toFixed(2)}`).join(' ')
    return {
      linha,
      area: `${linha} L ${L} ${A} L 0 ${A} Z`,
      zero: py(0),
      temZero: min < 0 && max > 0,
      fimX: px(pontos.length - 1),
      fimY: py(pontos[pontos.length - 1]),
    }
  }, [pontos])

  if (!d) return <div className="tv-curva-vazia">a curva desenha na primeira operação</div>

  const cor = positivo ? 'var(--tv-up)' : 'var(--tv-down)'
  return (
    <svg className="tv-curva" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true">
      <path d={d.area} fill={cor} opacity="0.14" />
      {d.temZero && (
        <line x1="0" x2="100" y1={d.zero} y2={d.zero}
          stroke="var(--tv-linha)" strokeWidth="0.4" strokeDasharray="2 2" />
      )}
      <path d={d.linha} fill="none" stroke={cor} strokeWidth="1.5"
        strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={d.fimX} cy={d.fimY} r="1.6" fill={cor} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/* --------------------------------------------------- contador de segundos */

function Cronometro({ desde }: { desde: number }) {
  const s = Math.max(0, (useClock() - desde) / 1000)
  return <span className="tv-crono">{Math.floor(s)}s</span>
}

/* -------------------------------------------------------------- principal */

export function RobotLive({
  estado, config, moeda, nomeEstrategia, ativo, titulo, regra, ganhaCom,
  parametros = [], conexao = 'open', onDesligar, onLigarDeNovo, onRemover,
  expandido = false, onExpandir,
}: Props) {
  const [detalhes, setDetalhes] = useState(false)
  const [registroAberto, setRegistroAberto] = useState(false)
  const acerto = estado.operacoes ? (estado.vitorias / estado.operacoes) * 100 : 0
  const positivo = estado.resultado >= 0
  const fita = estado.digitos.slice(-30)
  const emCurso = estado.emCurso

  // acumulado por operacao, para a coluna da direita da tabela
  const acumulados = useMemo(() => {
    const antigas = [...estado.historico].reverse()
    let soma = 0
    const mapa = new Map<number, number>()
    for (const o of antigas) { soma += o.lucro; mapa.set(o.n, soma) }
    return mapa
  }, [estado.historico])

  const teto = config.takeProfit || 1
  const piso = config.stopLoss || 1
  const pos = positivo
    ? 50 + Math.min(50, (estado.resultado / teto) * 50)
    : 50 - Math.min(50, (Math.abs(estado.resultado) / piso) * 50)

  const fase = !estado.rodando
    ? { chave: 'parado', texto: 'Robô parado' }
    : emCurso
      ? { chave: 'operando', texto: 'Operação em andamento' }
      : estado.emOperacao
        ? { chave: 'operando', texto: 'Enviando ordem…' }
        : estado.perdasSeguidas >= 1
          ? { chave: 'recuperando', texto: 'Recuperando' }
          : { chave: 'cacando', texto: 'Procurando entrada' }

  return (
    <div className={`tv ${fase.chave} ${expandido ? 'tv-expandido' : ''}`}>
      {/* ===================== faixa de estado ===================== */}
      <header className="tv-topo">
        <div className="tv-quem">
          <i className="tv-farol" />
          <div>
            <b><span className="tv-nome">{titulo}</span><span className="tv-fase">{fase.texto}</span></b>
            <span className="tv-onde">{nomeEstrategia} · {ativo}</span>
          </div>
        </div>
        <div className="tv-resumo-fixo tv-resumo-sessao">
          <span><i>Operações realizadas</i><b>{estado.operacoes}</b></span>
          <span><i>Ganhadoras</i><b className="up">{estado.vitorias}</b></span>
          <span><i>Perdedoras</i><b className="down">{estado.derrotas}</b></span>
          <span className="tv-resultado-resumo"><i>Resultado da sessão</i><b className={positivo ? 'up' : 'down'}>{assinado(estado.resultado)} <small>{moeda}</small></b></span>
        </div>

        <div className="tv-acoes">
          {onExpandir && (
            <button className={`tv-btn ${expandido ? 'on' : ''}`} onClick={onExpandir}>
              {expandido ? 'Reduzir' : 'Expandir'}
            </button>
          )}
          {estado.rodando && onDesligar && (
            <button className="tv-btn parar" onClick={onDesligar}>Desligar</button>
          )}
          {!estado.rodando && onLigarDeNovo && (
            <button className="tv-btn ligar" onClick={onLigarDeNovo}>Ligar de novo</button>
          )}
          {onRemover && (
            <button className="tv-btn sair" onClick={onRemover}
              title="Fechar este bloco" aria-label="Fechar este bloco">×</button>
          )}
        </div>
      </header>

      <nav className="tv-abas tv-atalhos" aria-label={`Detalhes de ${titulo}`}>
        <span><i /> Acompanhamento ao vivo</span>
        <button className={detalhes ? 'on' : ''} onClick={() => setDetalhes((v) => !v)}>
          <i aria-hidden>⌁</i> {detalhes ? 'Ocultar estratégia' : 'Detalhes da estratégia'}
        </button>
        <button className={registroAberto ? 'on' : ''} onClick={() => setRegistroAberto((v) => !v)}>
          <i aria-hidden>▤</i> Registro
        </button>
      </nav>

      <div className="tv-corpo">
      <div className="tv-assinatura" aria-hidden>
        <img src={`${import.meta.env.BASE_URL}teeds-marca.png`} alt="" />
        <span>TEEDS ENGINE</span>
      </div>

      {/* Uma compra recusada precisa aparecer. Antes ela ia só para um
          registro que a tela não mostrava — e o robô parecia travado. */}
      {estado.falha && (
        <div className="tv-alerta grave">
          <i />
          <span>
            <b>A Deriv recusou a compra.</b> {estado.falha.texto}
            {!estado.rodando && ' O robô foi desligado.'}
          </span>
        </div>
      )}

      {/* Sem conexão da conta não chega preço nem dá para comprar: melhor
          dizer isso do que deixar a tela parecendo travada. */}
      {estado.rodando && conexao !== 'open' && (
        <div className="tv-alerta">
          <i />
          <span>
            {conexao === 'reconnecting' || conexao === 'connecting'
              ? 'Sem conexão com a sua conta na Deriv — reconectando. O robô volta a operar sozinho assim que o sinal voltar.'
              : 'A conexão com a sua conta caiu. O robô está parado até ela voltar.'}
          </span>
        </div>
      )}

      {detalhes && (
        <div className="tv-params">
          {parametros.length > 0 ? parametros.map((p) => (
            <span key={p.rot}><i>{p.rot}</i>{p.valor}</span>
          )) : <span>Nenhum parâmetro disponível.</span>}
        </div>
      )}

      {/* ===================== palco ===================== */}
      <div className="tv-painel-principal">
      <section className={`tv-fluxo ${emCurso ? 'aberto' : estado.historico.length ? 'fechado' : 'aguardando'}`}>
        <div className="tv-fluxo-etapa ativa">
          <i>{emCurso ? '●' : estado.historico.length ? '✓' : '1'}</i>
          <span><b>{emCurso ? 'Contrato aberto' : estado.historico.length ? 'Último contrato' : 'Aguardando entrada'}</b>
            <small>{emCurso ? relogio(emCurso.comprouEm) : estado.historico[0] ? relogio(estado.historico[0].quando) : 'monitorando o mercado'}</small>
          </span>
        </div>
        <div className="tv-fluxo-linha"><span /></div>
        <div className={`tv-fluxo-etapa ${!emCurso && estado.historico.length ? 'ativa concluida' : ''}`}>
          <i>{!emCurso && estado.historico.length ? '✓' : '2'}</i>
          <span><b>Contrato fechado</b>
            <small>{emCurso
              ? <>aguardando resultado · <Cronometro desde={emCurso.comprouEm} /></>
              : estado.historico[0]
                ? `${estado.historico[0].ganhou ? 'ganho' : 'perda'} ${assinado(estado.historico[0].lucro)} ${moeda}`
                : 'próxima etapa'}</small>
          </span>
        </div>
      </section>
      <section className={`tv-palco aposta tv-palco-fixo ${estado.emOperacao ? 'enviando' : ''}`}>
        <div className="tv-mesa">
          <div className="tv-jogo">
            <span className="tv-rot">{emCurso ? 'Entrada atual' : 'Próxima entrada'}</span>
            <b>{num(emCurso?.valor ?? estado.valorAtual)}<i>{moeda}</i></b>
            <span className={`tv-status-operacao ${emCurso ? 'ganho' : ''}`} aria-live="polite">
              {emCurso
                ? `ganha +${num(emCurso.payout - emCurso.valor)}`
                : estado.emOperacao
                  ? 'Comprando na Deriv…'
                  : estado.rodando
                    ? (estado.condicao?.rotulo ?? estado.aguardando ?? 'Aguardando entrada')
                    : estado.motivoParada
                      ? `Parado: ${estado.motivoParada}`
                      : 'Robô desligado'}
            </span>
          </div>

          <div className="tv-regra-bloco">
            <span className="tv-rot">O último dígito precisa ser {regra}</span>
            <div className="tv-escala">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
                <span key={d}
                  className={`tv-alvo ${ganhaCom(d) ? 'paga' : ''} ${
                    emCurso?.digitoAtual === d ? 'caiu' : ''}`}>
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>
        <div className={`tv-esteira ${estado.rodando && !emCurso ? 'ativa' : ''}`}><i /></div>
      </section>

      {/* ===================== fita de digitos ===================== */}
      {detalhes && <section className="tv-fita-bloco">
        <span className="tv-rot">Dígitos do mercado — os verdes fariam ganhar</span>
        <div className="tv-fita">
          {fita.map((d, i) => (
            <span key={i}
              className={`tv-d ${ganhaCom(d) ? 'up' : 'down'} ${i === fita.length - 1 ? 'agora' : ''}`}>
              {d}
            </span>
          ))}
          {fita.length === 0 && <span className="tv-nada">lendo o mercado…</span>}
        </div>
      </section>}

      {/* ===================== sessao ===================== */}
      <section className="tv-sessao">
        <div className="tv-curva-caixa">
          <div className="tv-meta-resumo">
            <span><i>Margem até o stop</i><b className="down">{moeda} {num(Math.max(0, config.stopLoss + estado.resultado))}</b></span>
            <span className="atual"><i>Resultado atual</i><b className={positivo ? 'up' : 'down'}>{assinado(estado.resultado)} {moeda}</b></span>
            <span><i>Falta para a meta</i><b className="up">{moeda} {num(Math.max(0, config.takeProfit - estado.resultado))}</b></span>
          </div>
          <Curva pontos={estado.curva} positivo={positivo} />
          <div className="tv-trilho">
            <span className="down">−{num(config.stopLoss)}</span>
            <div className="tv-barra">
              <u />
              <i style={{ left: `${pos}%` }} className={positivo ? 'up' : 'down'} />
            </div>
            <span className="up">+{num(config.takeProfit)}</span>
          </div>
        </div>
        <div className="tv-nums">
          <div>
            <span>Operações</span>
            <b>{estado.operacoes}</b>
            <em>{estado.vitorias}G · {estado.derrotas}P</em>
          </div>
          <div>
            <span>Acerto</span>
            <b>{acerto.toFixed(0)}%</b>
            <em>{estado.perdasSeguidas > 0 ? `${estado.perdasSeguidas} perdas seguidas` : 'sem sequência'}</em>
          </div>
          <div>
            <span>Próxima entrada</span>
            <b>{num(estado.valorAtual)}</b>
            <em>{config.fatorGale === 0
              ? 'valor fixo'
              : estado.perdasSeguidas >= config.galeApos
                ? 'martingale ligado'
                : `valor base · ${estado.perdasSeguidas}/${config.galeApos} perdas`}</em>
          </div>
          <div>
            <span>Movimentado</span>
            <b>{num(estado.movimentado)}</b>
            <em>{estado.latenciaMedia !== null ? `compra em ${estado.latenciaMedia} ms` : '—'}</em>
          </div>
        </div>
      </section>
      </div>

      {/* ===================== operacoes ===================== */}
      <section className="tv-ops">
        <div className="tv-ops-topo">
          <span className="tv-rot">Operações desta sessão</span>
          {estado.historico.length > 0 && <span className="tv-conta">{estado.historico.length}</span>}
        </div>

        {estado.historico.length === 0 ? (
          <p className="tv-nada-ops">
            Nenhuma ainda. Cada entrada aparece aqui assim que for liquidada.
          </p>
        ) : (
          <div className="tv-rolo">
            <table className="tv-tabela">
              <thead>
                <tr>
                  <th>#</th><th>Hora</th><th>Valor</th>
                  <th>Entrada</th><th>Saída</th><th>Resultado</th><th>Acumulado</th>
                </tr>
              </thead>
              <tbody>
                {estado.historico.map((o, indice) => {
                  const ac = acumulados.get(o.n) ?? 0
                  return (
                    <tr key={o.contractId} className={`${o.ganhou ? 'ganhou' : 'perdeu'} ${indice === 0 ? 'recente' : ''}`}>
                      <td className="tv-n" data-label="Operação">{o.n}</td>
                      <td className="tv-hora" data-label="Hora">{relogio(o.quando)}</td>
                      <td data-label="Valor">{num(o.valor)}</td>
                      <td data-label="Entrada">
                        <span className="tv-par">
                          {o.entrada !== null ? o.entrada.toFixed(2) : '—'}
                          {o.digitoEntrada !== null && <b className="tv-chip">{o.digitoEntrada}</b>}
                        </span>
                      </td>
                      <td data-label="Saída">
                        <span className="tv-par">
                          {o.saida !== null ? o.saida.toFixed(2) : '—'}
                          {o.digitoSaida !== null && (
                            <b className={`tv-chip ${o.ganhou ? 'up' : 'down'}`}>{o.digitoSaida}</b>
                          )}
                        </span>
                      </td>
                      <td data-label="Resultado" className={o.ganhou ? 'up forte' : 'down forte'}>{assinado(o.lucro)}</td>
                      <td data-label="Acumulado" className={ac >= 0 ? 'up' : 'down'}>{assinado(ac)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {registroAberto && (
        <section className="tv-registro-painel">
          <div className="tv-ops-topo"><span className="tv-rot">Registro técnico do robô</span></div>
          <div className="tv-rolo">
            <ul className="tv-registro">
              {estado.registros.map((r, i) => (
                <li key={i} className={r.tipo}><span>{relogio(r.hora * 1000)}</span><b>{r.texto}</b></li>
              ))}
            </ul>
          </div>
        </section>
      )}
      </div>
    </div>
  )
}
