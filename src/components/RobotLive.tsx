import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { markupDaOperacao } from '../core/deriv/markup'
import type { ConfigEstrategia, EstadoMotor } from '../core/deriv/engine'
import { MARCA } from '../marca'
import { IconeFechar } from './IconeFechar'
import { AnaliseAoVivo } from './AnaliseAoVivo'
import { modoDaConfig, NOME_DO_MODO, temModos } from '../core/deriv/strategies'
import './robot-cockpit.css'

interface Props {
  estado: EstadoMotor
  config: ConfigEstrategia
  moeda: string
  contaDaSessao?: { contaId: string; demo: boolean; moeda: string } | null
  estrategiaId?: string
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
  /** O pedido de desligar já saiu e ainda não voltou. */
  desligando?: boolean
  onLigarDeNovo?: () => void
  onRemover?: () => void
  expandido?: boolean
  onExpandir?: () => void
  /** Abre/fecha o painel flutuante de dígitos do ativo. */
  onDigitos?: () => void
  digitosAberto?: boolean
  /** Coluna de markup (3% do pagamento) nas últimas operações. */
  mostrarMarkup?: boolean
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

/* -------------------------------------------------------------- principal */

/**
 * A regra com que esta sessão está rodando, lida da config congelada
 * (22/09/2026): quando entra, como recupera e qual versão da plataforma.
 * Só existe quando o servidor mandou `parametros`; sessões antigas não mudam.
 */
function regraDaSessao(config: ConfigEstrategia, estrategiaId?: string): Array<{ rot: string; valor: string }> {
  const p = config.parametros
  if (!p || !estrategiaId) return []
  const n = p.entrada.lossVirtual
  const quandoEntra = estrategiaId === 'thepalm'
    ? 'após a análise de 25 dígitos'
    : n === 0 ? 'em toda operação' : n === 1 ? 'após 1 dígito que teria perdido' : `após ${n} dígitos seguidos que teriam perdido`
  const escada = p.recuperacao.escada
  const recuperacao = escada.tipo === 'tabela' ? `tabela, ${escada.degraus.length} ${escada.degraus.length === 1 ? 'degrau' : 'degraus'}` : 'calculada pelo payout'
  const modo = temModos(estrategiaId, p) ? ` · modo ${NOME_DO_MODO[modoDaConfig(estrategiaId, config.fatorGale, config.lucroSobrePrejuizo, config)].toLowerCase()}` : ''
  const versao = config.parametrosVersao ? `v${config.parametrosVersao}` : ''
  const regra = config.parametrosTesteDemo ? `${versao ? `${versao} · ` : ''}em teste no demo` : versao ? `${versao} da plataforma` : 'padrão da plataforma'
  return [
    { rot: 'Quando entra', valor: quandoEntra },
    { rot: 'Recuperação', valor: recuperacao + modo },
    { rot: 'Regra', valor: regra },
  ]
}

/** Junta a lista do chamador com a da regra: rótulo repetido só troca o valor, no mesmo lugar. */
function juntarDetalhes(base: Array<{ rot: string; valor: string }>, extra: Array<{ rot: string; valor: string }>): Array<{ rot: string; valor: string }> {
  const lista = base.map((p) => extra.find((e) => e.rot === p.rot) ?? p)
  return [...lista, ...extra.filter((e) => !base.some((p) => p.rot === e.rot))]
}

export function RobotLive({
  estado, config, moeda, estrategiaId, nomeEstrategia, ativo, titulo, regra, ganhaCom,
  parametros = [], conexao = 'open', onDesligar, desligando = false, onLigarDeNovo, onRemover,
  expandido = false, onExpandir, contaDaSessao, onDigitos, digitosAberto = false,
  mostrarMarkup = false,
}: Props) {
  const [detalhes, setDetalhes] = useState(false)
  // Os parâmetros do chamador mais a regra da sessão (quando entra, recuperação, versão).
  const detalhesDaSessao = juntarDetalhes(parametros, regraDaSessao(config, estrategiaId))
  const [registroAberto, setRegistroAberto] = useState(false)
  const [filtroHistorico, setFiltroHistorico] = useState('todas')
  const [analisesPalm, setAnalisesPalm] = useState<Array<{ id: number; hora: number; texto: string }>>([])
  const rolo = useRef<HTMLDivElement>(null)
  const raiz = useRef<HTMLDivElement>(null)
  const [novas, setNovas] = useState(0)
  const quantasAntes = useRef(estado.historico.length)
  const alturaAntes = useRef(0)
  const positivo = estado.resultado >= 0
  const historicoVisivel = estado.historico.filter(o => filtroHistorico === 'todas' || (filtroHistorico === 'ganhos' ? o.lucro > 0 : o.lucro < 0))
  const fita = estado.digitos.slice(-30)
  /*
    O markup de uma operação: o medido pela Deriv quando ele veio, senão os
    3% do pagamento — a mesma conta que a célula mostra.
  */
  const markupDe = markupDaOperacao
  const emCurso = estado.emCurso

  useEffect(() => {
    if (estrategiaId !== 'thepalm') return
    if (estado.ticksAnalisados === 0) {
      setAnalisesPalm([])
      return
    }
    if (!estado.rodando || emCurso) return

    const ultimo = estado.digitos[estado.digitos.length - 1]
    const leitura = estado.condicao?.rotulo ?? estado.aguardando
    const texto = ultimo === undefined
      ? leitura
      : `Dígito ${ultimo} recebido · ${leitura}`

    setAnalisesPalm((atuais) => {
      if (atuais[atuais.length - 1]?.id === estado.ticksAnalisados) return atuais
      return [...atuais, { id: estado.ticksAnalisados, hora: Date.now(), texto }].slice(-4)
    })
  }, [estrategiaId, estado.ticksAnalisados, estado.rodando, estado.aguardando, estado.condicao, estado.digitos, emCurso])

  // A coluna "Acumulado" saiu da tabela a pedido do Tiago (18/09/2026): ela
  // confundia mais do que ajudava. O total da sessão fica no cabeçalho.

  /*
    A lista de operações e a evolução ocupam o que sobra da cabine até o
    rodapé (22/09/2026). Antes tinham 300px fixos e, numa tela de notebook,
    o fim da cabine era cortado — "não consigo ver as infos lá de baixo".
    Se nem o mínimo couber, a cabine rola em vez de cortar.
  */
  useLayoutEffect(() => {
    const tv = raiz.current
    const corpo = tv?.querySelector<HTMLElement>(':scope > .tv-corpo')
    if (!tv || !corpo) return
    const medir = () => {
      const ops = corpo.querySelector<HTMLElement>('.tv-ops')
      if (!ops) return
      const fundo = corpo.getBoundingClientRect().bottom - parseFloat(getComputedStyle(corpo).paddingBottom || '0')
      const livre = Math.floor(fundo - ops.getBoundingClientRect().top + corpo.scrollTop) - 1
      tv.style.setProperty('--tv-altura-lista', `${Math.max(240, livre)}px`)
    }
    medir()
    const obs = new ResizeObserver(medir)
    obs.observe(corpo)
    const analise = corpo.querySelector('.tv-analise')
    if (analise) obs.observe(analise)
    return () => obs.disconnect()
  }, [])

  /*
    Quem rolou a lista para ler operações antigas não pode ser puxado para
    cima a cada operação nova (22/09/2026). A lista segura a posição e
    mostra "↑ novas"; um clique volta ao topo.
  */
  useLayoutEffect(() => {
    const el = rolo.current
    const antes = quantasAntes.current
    quantasAntes.current = estado.historico.length
    if (!el) return
    const chegaram = estado.historico.length - antes
    if (chegaram > 0 && el.scrollTop > 24) {
      el.scrollTop += el.scrollHeight - alturaAntes.current
      setNovas((n) => n + chegaram)
    }
    if (chegaram < 0) setNovas(0)
    alturaAntes.current = el.scrollHeight
  }, [estado.historico.length])

  const teto = config.takeProfit || 1
  const piso = config.stopLoss || 1
  const pos = positivo
    ? 50 + Math.min(50, (estado.resultado / teto) * 50)
    : 50 - Math.min(50, (Math.abs(estado.resultado) / piso) * 50)

  const fase = !estado.rodando
    ? { chave: 'parado', texto: estado.emOperacao ? 'Concluindo o contrato' : 'Robô parado' }
    : conexao !== 'open'
      ? { chave: 'sem-sinal', texto: conexao === 'connecting' || conexao === 'reconnecting' ? 'Reconectando' : 'Sem conexão' }
    : emCurso
      ? { chave: 'operando', texto: 'Operando' }
      : estado.emOperacao
        ? { chave: 'operando', texto: 'Enviando ordem' }
        : estado.perdasSeguidas >= 1
          ? { chave: 'recuperando', texto: 'Recuperando' }
          : { chave: 'cacando', texto: 'Analisando' }

  return (
    <div ref={raiz} className={`tv tv-cockpit ${fase.chave} ${expandido ? 'tv-expandido' : ''}`}>
      {/* ===================== faixa de estado ===================== */}
      <header className="tv-topo">
        <div className="tv-quem">
          <i className="tv-farol" />
          <div>
            <b><span className="tv-nome">{nomeEstrategia}</span><span className="tv-fase" title={fase.texto}>{fase.texto}</span></b>
            <span className="tv-onde">{titulo} · {ativo}</span>
          </div>
        </div>
        <div className="tv-resumo-fixo tv-resumo-sessao">
          <span className="tv-ativo-resumo"><i>Ativo</i><b>{ativo}</b></span>
          <span><i>Operações</i><b>{estado.operacoes}</b></span>
          <span><i>Positivas</i><b className="up">{estado.vitorias}</b></span>
          <span><i>Negativas</i><b className="down">{estado.derrotas}</b></span>
          <span className="tv-resultado-resumo"><i>Resultado da sessão</i><b className={positivo ? 'up' : 'down'}>{assinado(estado.resultado)} <small>{moeda}</small></b></span>
        </div>

        <div className="tv-acoes">
          {estado.rodando && onDesligar && <button className="tv-btn ligar" disabled title="O robô já está operando"><span aria-hidden>▶</span> Continuar</button>}
          {/* O botão "Focar" (modo foco de um robô só) foi retirado a pedido do Tiago em 15/09/2026:
              atrapalhava mais do que ajudava. O modo continua no código, sem porta de entrada. */}
          {estado.rodando && onDesligar && (
            <button className="tv-btn parar" onClick={onDesligar} disabled={desligando} aria-busy={desligando}><span aria-hidden>■</span> {desligando ? 'Desligando…' : 'Desligar'}</button>
          )}
          {!estado.rodando && onLigarDeNovo && (
            <button className="tv-btn ligar" onClick={onLigarDeNovo}><span aria-hidden>▶</span> Continuar</button>
          )}
          {onRemover && (
            <button className="tv-btn sair" onClick={onRemover}
              title="Fechar este bloco" aria-label="Fechar este bloco"><IconeFechar /></button>
          )}
        </div>
      </header>

      <nav className="tv-abas tv-atalhos" aria-label={`Detalhes de ${titulo}`}>
        <span><i /> {estado.rodando ? conexao === 'open' ? 'Acompanhamento ao vivo' : 'Aguardando conexão' : estado.emOperacao ? 'Desligado — concluindo o contrato' : 'Sessão encerrada'}</span>
        <button aria-expanded={detalhes} className={detalhes ? 'on' : ''} onClick={() => setDetalhes((v) => !v)}>
          <i aria-hidden>⌁</i> {detalhes ? 'Ocultar estratégia' : 'Detalhes da estratégia'}
        </button>
        <button aria-expanded={registroAberto} className={registroAberto ? 'on' : ''} onClick={() => setRegistroAberto((v) => !v)}>
          <i aria-hidden>▤</i> Registro
        </button>
      </nav>

      <div className="tv-corpo">
      {!estado.rodando && estado.motivoParada && <p className="ux-session-reason"><strong>Motivo do encerramento:</strong> {estado.motivoParada}</p>}
      <div className="tv-assinatura" aria-hidden>
        <img src={`${import.meta.env.BASE_URL}${MARCA.emblema}`} alt="" />
        <span>{MARCA.nome} ENGINE</span>
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
          {detalhesDaSessao.length > 0 ? detalhesDaSessao.map((p) => (
            <span key={p.rot}><i>{p.rot}</i>{p.valor}</span>
          )) : <span>Nenhum parâmetro disponível.</span>}
        </div>
      )}

      {/* ===================== palco ===================== */}
      <div className="tv-painel-principal">
      <AnaliseAoVivo estado={estado} estrategiaId={estrategiaId} nomeEstrategia={nomeEstrategia} config={config}
        moeda={moeda} ganhaCom={ganhaCom} onDigitos={onDigitos} digitosAberto={digitosAberto} />

      {estrategiaId === 'thepalm' && (
        <section className="tv-palm-analise" aria-label="Análises recentes do The Palm">
          <header>
            <span><i /> Análise ao vivo</span>
            <small>{estado.rodando ? `${estado.ticksAnalisados} ticks analisados` : 'análise pausada'}</small>
          </header>
          <div className="tv-palm-feed" aria-live="polite">
            {analisesPalm.length > 0 ? analisesPalm.map((aviso) => (
              <div key={aviso.id} className="tv-palm-aviso">
                <time>{relogio(aviso.hora)}</time>
                <span>{aviso.texto}</span>
              </div>
            )) : (
              <div className="tv-palm-vazio">
                {estado.rodando ? 'Preparando a leitura dos 25 dígitos…' : 'As últimas análises aparecerão aqui ao ligar o robô.'}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ===================== fita de digitos ===================== */}
      {detalhes && <section className="tv-fita-bloco">
        <span className="tv-rot">O último dígito precisa ser {regra}</span>
        <div className="tv-escala tv-escala-detalhes">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => (
            <span key={d} className={`tv-alvo ${ganhaCom(d) ? 'paga' : ''} ${emCurso?.digitoAtual === d ? 'caiu' : ''}`}>{d}</span>
          ))}
        </div>
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

      <section className="tv-curva-painel">
        <div className="tv-curva-caixa">
          <div className="tv-curva-legenda"><span>Evolução da sessão</span><b className={positivo ? 'up' : 'down'}>{assinado(estado.resultado)} {moeda}</b></div>
          <Curva pontos={estado.curva} positivo={positivo} />
          {config.takeProfit > 0 && <div className="tv-curva-meta"><span>Meta {moeda} {num(config.takeProfit)}</span><span>faltam <b>{num(Math.max(0, config.takeProfit - estado.resultado))}</b></span></div>}
          <div className="tv-trilho">
            <span className="down">−{num(config.stopLoss)}</span>
            <div className="tv-barra">
              <u />
              <i style={{ left: `${pos}%` }} className={positivo ? 'up' : 'down'} />
            </div>
            <span className="up">+{num(config.takeProfit)}</span>
          </div>
        </div>
      </section>
      </div>

      {/* ===================== operacoes ===================== */}
      <section className="tv-ops">
        <div className="tv-ops-topo">
          {/* A lista inteira fica na tabela, que rola: antes só as 5 últimas
              apareciam e o resto dependia de um botão que pouca gente via. */}
          <span className="tv-rot">Operações da sessão{estado.historico.length > 0 ? ` (${estado.historico.length})` : ''}</span>
          {estado.historico.length > 0 && <select className="ux-history-filter" aria-label={`Filtrar operações de ${titulo}`} value={filtroHistorico} onChange={e => setFiltroHistorico(e.target.value)}>
            <option value="todas">Todas</option><option value="ganhos">Ganhos</option><option value="perdas">Perdas</option>
          </select>}
        </div>

        {estado.historico.length === 0 ? (
          <p className="tv-nada-ops">
            Nenhuma ainda. Cada entrada aparece aqui assim que for liquidada.
          </p>
        ) : (
          <div className="tv-rolo" ref={rolo} onScroll={(ev) => { if (novas && ev.currentTarget.scrollTop < 20) setNovas(0) }}>
            {novas > 0 && (
              <button type="button" className="tv-novas" onClick={() => { rolo.current?.scrollTo({ top: 0, behavior: 'smooth' }); setNovas(0) }}>
                ↑ {novas} {novas > 1 ? 'novas' : 'nova'}
              </button>
            )}
            <table className="tv-tabela tv-tabela-enxuta">
              <thead>
                <tr>
                  <th>Hora</th><th>Valor</th><th>Dígito</th><th>Resultado</th>
                  {mostrarMarkup && <th>Markup</th>}
                </tr>
              </thead>
              <tbody>
                {historicoVisivel.length === 0 && <tr><td colSpan={mostrarMarkup ? 5 : 4}>Nenhuma operação neste filtro.</td></tr>}
                {historicoVisivel.map(o => {
                  // O preço de entrada e o de saída continuam à mão: passando o mouse no dígito.
                  const preco = (v: number | null) => v === null ? '—' : o.pipSize !== undefined ? v.toFixed(o.pipSize) : String(v)
                  return (
                    <tr key={o.contractId} className={`${o.ganhou ? 'ganhou' : 'perdeu'} ${o.contractId === estado.historico[0]?.contractId ? 'recente' : ''}`}>
                      <td className="tv-hora" data-label="Hora">{relogio(o.quando)}</td>
                      <td data-label="Valor">{num(o.valor)}</td>
                      <td data-label="Dígito" title={`Entrada ${preco(o.entrada)} · saída ${preco(o.saida)} · operação nº ${o.n}`}>
                        {o.digitoSaida !== null ? <b className={`tv-chip ${o.ganhou ? 'up' : 'down'}`}>{o.digitoSaida}</b> : '—'}
                      </td>
                      <td data-label="Resultado" className={o.ganhou ? 'up forte' : 'down forte'}>{assinado(o.lucro)}</td>
                      {mostrarMarkup && (
                        <td
                          data-label="Markup"
                          className="tv-markup"
                          title={o.markupDeriv != null
                            ? 'Markup medido pela Deriv neste contrato'
                            : `3% do pagamento de ${num(o.payout)}`}
                        >
                          {o.markupDeriv != null || o.payout ? num(markupDe(o)) : '—'}
                          {o.markupDeriv != null && <small>DERIV</small>}
                        </td>
                      )}
                    </tr>
                  )
                })}
                {filtroHistorico === 'todas' && estado.historico.length > 0 && (
                  <tr className="tv-inicio"><td colSpan={mostrarMarkup ? 5 : 4}>Primeira operação da sessão · {relogio(estado.historico[estado.historico.length - 1].quando)}</td></tr>
                )}
              </tbody>
              {/* A soma do markup só existe quando a coluna está à vista
                  (pedido do Tiago, 22/09/2026). Ela acompanha o filtro: com
                  "Ganhos" ou "Perdas", soma o que está na tela. */}
              {mostrarMarkup && historicoVisivel.length > 0 && (
                <tfoot className="tv-soma">
                  <tr>
                    <th colSpan={3} scope="row">Markup {filtroHistorico === 'todas' ? 'da sessão' : filtroHistorico === 'ganhos' ? 'das positivas' : 'das negativas'}</th>
                    <td>{historicoVisivel.length} {historicoVisivel.length === 1 ? 'operação' : 'operações'}</td>
                    <td className="tv-markup" title="Soma dos valores exatos. Cada linha aparece arredondada em centavos, então somar o que está na tela pode dar alguns centavos a menos.">{num(historicoVisivel.reduce((t, o) => t + markupDe(o), 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </section>
      {registroAberto && (
        <section className="tv-registro-painel">
          <div className="tv-ops-topo"><span className="tv-rot">Registro da sessão</span><small>{estado.registros.length} eventos</small></div>
          <div className="tv-rolo">
            {estado.registros.length === 0 && <p className="tv-registro-vazio">Os eventos da sessão aparecerão aqui conforme o robô operar.</p>}
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
