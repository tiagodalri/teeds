import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AuthSession } from '../core/deriv/auth'
import { DERIV } from '../core/deriv/config'
import {
  atualizarHoje, buscarResumo, buscarSerieDiaria, diasDoPeriodo, novoHojeAoVivo, periodo, simular,
  simularComissaoPorDia, CALCULO_COM_RESULTADO_DESDE, SemPermissao, type DiaJaGravado,
  type DiaMarkup, type HojeAoVivo, type MarkupResumo, type MarkupSimulado, type ResumoHoje,
} from '../core/deriv/markup'
import type { TeedsSocket } from '../core/deriv/client'
import { enviarComissoes, enviarMarkupOficial, listarComissoes } from '../core/teeds/clientes'
import type { SessaoTeeds } from '../core/teeds/conta'
import { ClientesAdmin } from './ClientesAdmin'
import { DerivDesconectada } from './DerivDesconectada'
import { MARCA } from '../marca'

interface Props {
  session: AuthSession | null
  socket: TeedsSocket | null
  isDemo: boolean
  onReautorizar: () => void
  /** Pagamento de referencia sem markup, para o simulador. */
  payoutBase: number
  moeda: string
  /** Sobe a cada transacao na conta: dispara o recalculo ao vivo. */
  pulso?: number
  entrandoNaDeriv?: boolean
  onConectarDeriv?: () => void
  /** Sessao da conta Teeds — alimenta o cadastro de clientes no Supabase. */
  sessaoTeeds: SessaoTeeds | null
  /** Conta Deriv escolhida, para gravar a comissao no lugar certo. */
  contaId?: string | null
}

const PERIODOS = [
  { label: 'Hoje', dias: 1 },
  { label: '7 dias', dias: 7 },
  { label: '30 dias', dias: 30 },
  { label: '90 dias', dias: 90 },
]

const dinheiro = (v: number, moeda = 'USD') =>
  `${moeda} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function ManagementPanel({
  session, socket, isDemo, onReautorizar, payoutBase, moeda, pulso = 0,
  entrandoNaDeriv = false, onConectarDeriv, sessaoTeeds, contaId = null,
}: Props) {
  const [sim, setSim] = useState<MarkupSimulado | null>(null)
  const [simCarregando, setSimCarregando] = useState(false)
  const [simErro, setSimErro] = useState<string | null>(null)
  const [dias, setDias] = useState(30)
  const [resumo, setResumo] = useState<MarkupResumo | null>(null)
  const [serie, setSerie] = useState<DiaMarkup[]>([])
  const [carregando, setCarregando] = useState(false)
  const [semPermissao, setSemPermissao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [markupSim, setMarkupSim] = useState(3)
  const [progresso, setProgresso] = useState<{ feitos: number; total: number } | null>(null)

  useEffect(() => {
    if (!session) return
    let vivo = true
    setCarregando(true)
    setErro(null)
    setSemPermissao(false)
    const { de, ate } = periodo(dias)

    buscarResumo(session, de, ate)
      .then(async (r) => {
        if (!vivo) return
        setResumo(r)
        if (dias > 1 && dias <= 30) {
          const s = await buscarSerieDiaria(session, dias)
          if (vivo) setSerie(s)
          // so quem tem application_read chega aqui: e o dono do app. O total
          // oficial vai para o banco e a conferencia por cliente passa a ter
          // com o que se comparar.
          if (sessaoTeeds) void enviarMarkupOficial(sessaoTeeds, MARCA.appId, s)
        } else {
          setSerie([])
        }
      })
      .catch((e: Error) => {
        if (!vivo) return
        if (e instanceof SemPermissao) setSemPermissao(true)
        else setErro(e.message)
      })
      .finally(() => vivo && setCarregando(false))

    return () => { vivo = false }
  }, [session, dias])

  /**
   * Comissao ao vivo.
   *
   * Cada transacao na conta faz o pulso subir. Recalcular a cada uma seria
   * varrer o extrato inteiro varias vezes por segundo com um robo ligado —
   * entao o recalculo espera um respiro de 4 s depois da ultima movimentacao.
   */
  const ultimoCalculo = useRef(0)
  useEffect(() => {
    if (!socket) return
    let vivo = true

    const calcular = () => {
      if (!vivo) return
      ultimoCalculo.current = Date.now()
      setSimCarregando(true)
      setSimErro(null)
      // Dias que o calculo novo ja gravou nao precisam ser varridos de novo:
      // a primeira conta e lenta, as seguintes saem na hora.
      const cache = async () => {
        const mapa = new Map<string, DiaJaGravado>()
        if (!sessaoTeeds || !contaId) return mapa
        try {
          const linhas = await listarComissoes(sessaoTeeds, dias)
          for (const l of linhas) {
            if (l.contaId !== contaId) continue
            const quando = l.atualizadoEm ? Date.parse(l.atualizadoEm) : 0
            // o corte mais novo manda: dias gravados antes dele nao tem
            // resultado, e resultado zerado seria uma mentira silenciosa
            if (!quando || quando < CALCULO_COM_RESULTADO_DESDE) continue
            mapa.set(l.dia, {
              comissao: l.comissao, operacoes: l.operacoes, pagamentos: l.pagamentos,
              entradas: l.entradas, resultado: l.resultado,
            })
          }
        } catch { /* sem cache: calcula tudo */ }
        return mapa
      }

      cache()
        .then((jaGravados) =>
          simularComissaoPorDia(socket, 0.03, dias, jaGravados, (feitos, total) => {
            if (vivo) setProgresso({ feitos, total })
          }),
        )
        .then((r) => {
          if (!vivo) return
          setSim(r)
          setProgresso(null)
          // grava so os dias varridos agora — os demais ja estavam no banco
          if (sessaoTeeds && contaId) {
            const novos = r.diasCalculados
            const enviar = novos?.length
              ? r.porDia.filter((d) => novos.includes(d.data))
              : r.porDia
            if (enviar.length) void enviarComissoes(sessaoTeeds, contaId, isDemo, moeda, enviar)
          }
        })
        .catch((e: Error) => vivo && setSimErro(e.message))
        .finally(() => { if (vivo) { setSimCarregando(false); setProgresso(null) } })
    }

    // a primeira carga e imediata; as seguintes esperam o mercado acalmar
    const espera = ultimoCalculo.current === 0 ? 0 : 4000
    const id = setTimeout(calcular, espera)
    return () => { vivo = false; clearTimeout(id) }
  }, [socket, pulso, dias])

  /**
   * Hoje, ao vivo.
   *
   * O calculo grande espera o mercado acalmar — com robo ligado, ele pode
   * nunca acalmar. Esta leitura e a que faz o numero da plataforma subir a
   * cada contrato liquidado: no maximo uma a cada 2,5 s (compra e venda
   * disparam duas transacoes por operacao), e a proxima espera a atual acabar.
   */
  const [hoje, setHoje] = useState<ResumoHoje | null>(null)
  const hojeRef = useRef<HojeAoVivo>(novoHojeAoVivo())
  const hojeUltima = useRef(0)
  const hojeOcupado = useRef(false)
  const hojePendente = useRef(false)
  const socketRef = useRef(socket)
  socketRef.current = socket
  const montado = useRef(true)
  useEffect(() => () => { montado.current = false }, [])
  useEffect(() => { hojeRef.current = novoHojeAoVivo(); setHoje(null) }, [socket])

  const lerHoje = useCallback(async () => {
    const s = socketRef.current
    if (!s) return
    if (hojeOcupado.current) { hojePendente.current = true; return }
    hojeOcupado.current = true
    hojeUltima.current = Date.now()
    try {
      const r = await atualizarHoje(s, hojeRef.current)
      if (montado.current && socketRef.current === s) setHoje(r)
    } catch {
      /* a proxima transacao tenta de novo */
    } finally {
      hojeOcupado.current = false
      if (hojePendente.current && montado.current) { hojePendente.current = false; void lerHoje() }
    }
  }, [])

  useEffect(() => {
    if (!socket) return
    const espera = Math.max(0, 2500 - (Date.now() - hojeUltima.current))
    const id = setTimeout(() => { void lerHoje() }, espera)
    return () => clearTimeout(id)
  }, [socket, pulso, lerHoje])

  /**
   * O numero da plataforma: dias anteriores vem do calculo grande, hoje vem
   * da leitura ao vivo. E o que a Deriv vai confirmar depois, quando fechar
   * a conta dela.
   */
  const hojeIso = diasDoPeriodo(1)[0]
  const vivo = useMemo(() => {
    const simHoje = sim?.porDia.find((d) => d.data === hojeIso)
    const base = sim
      ? {
        comissao: sim.comissao - (simHoje?.comissao ?? 0),
        operacoes: sim.operacoes - (simHoje?.operacoes ?? 0),
        pagamentos: sim.pagamentoTotal - (simHoje?.pagamentos ?? 0),
        entradas: sim.movimentado - (simHoje?.entradas ?? 0),
      }
      : { comissao: 0, operacoes: 0, pagamentos: 0, entradas: 0 }
    // hoje: o que a leitura ao vivo souber; senao, o que o calculo grande achou
    const h = hoje ?? simHoje ?? null
    const comissao = base.comissao + (h?.comissao ?? 0)
    const operacoes = base.operacoes + (h?.operacoes ?? 0)
    return {
      comissao,
      operacoes,
      pagamentos: base.pagamentos + (h?.pagamentos ?? 0),
      movimentado: base.entradas + (h?.entradas ?? 0),
      media: operacoes ? comissao / operacoes : 0,
      pronto: !!(hoje || sim),
      // periodo maior que hoje e o calculo grande ainda nao chegou
      parcial: !sim && dias > 1,
    }
  }, [sim, hoje, hojeIso, dias])
  const derivAtrasada = vivo.pronto && resumo ? vivo.comissao - resumo.comissao : 0

  const [copiado, setCopiado] = useState(false)
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(MARCA.afiliado)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // sem permissao de area de transferencia: o link fica visivel para copiar a mao
    }
  }

  const simulacao = useMemo(() => simular(payoutBase, markupSim), [payoutBase, markupSim])
  const simAtual = useMemo(() => simular(payoutBase, 3), [payoutBase])
  const maxSerie = Math.max(0.01, ...serie.map((d) => d.comissao))

  // projecao simples: media diaria do periodo aplicada a 30 dias
  const projecao = resumo && dias > 1 ? (resumo.comissao / dias) * 30 : null

  if (!session) {
    return (
      <div className="ger">
        <div className="ger-topo"><div><h2>Painel de gestão</h2></div></div>
        <DerivDesconectada
          acao="A comissão é calculada sobre as operações da sua conta."
          entrando={entrandoNaDeriv}
          onConectar={() => onConectarDeriv?.()} />

        <ClientesAdmin sessao={sessaoTeeds} dias={dias} />

        <section className="ger-bloco convite">
          <div className="convite-texto">
            <span className="rot">Traga clientes para a {MARCA.prosa}</span>
            <p>
              Isto funciona mesmo sem a corretora conectada: toda conta aberta
              por este link fica ligada a você.
            </p>
          </div>
          <div className="convite-acao">
            <code>{MARCA.afiliado}</code>
            <div className="convite-botoes">
              <button onClick={copiarLink}>{copiado ? 'copiado!' : 'Copiar link'}</button>
              <a href={MARCA.afiliado} target="_blank" rel="noopener noreferrer">Abrir</a>
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="ger">
      <div className="ger-topo">
        <div>
          <h2>Painel de gestão</h2>
          <p className="ger-sub">Sua comissão sobre as operações feitas na {MARCA.prosa}</p>
        </div>
        <div className="segmented">
          {PERIODOS.map((p) => (
            <button key={p.dias} className={dias === p.dias ? 'on' : ''} onClick={() => setDias(p.dias)}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {semPermissao && (
        <div className="ger-aviso">
          <div>
            <strong>Falta uma permissão</strong>
            <p>
              Seu login atual autoriza negociar e gerenciar conta, mas não ler as estatísticas
              de faturamento. É um clique para liberar — você volta para a {MARCA.prosa} em seguida.
            </p>
          </div>
          <button className="btn-login" onClick={onReautorizar}>Liberar acesso</button>
        </div>
      )}

      {erro && <div className="ger-erro">{erro}</div>}

      {/* ---------------- números do período ---------------- */}
      <div className="kpis">
        <div className="kpi kpi-grande kpi-vivo">
          <span className="rot"><i className="ponto-vivo" aria-hidden />Sua comissão · calculada ao vivo</span>
          <strong>{vivo.pronto ? dinheiro(vivo.comissao, 'USD') : '…'}</strong>
          <span className="kpi-nota">
            3% do pagamento de cada contrato desta conta · {vivo.operacoes.toLocaleString('pt-BR')} operações
            {vivo.parcial && ' · dias anteriores ainda somando'}
          </span>
        </div>
        <div className="kpi kpi-grande kpi-deriv">
          <span className="rot">Sua comissão · informada pela Deriv</span>
          <strong>{carregando && !resumo ? '…' : dinheiro(resumo?.comissao ?? 0, 'USD')}</strong>
          <span className="kpi-nota">
            {derivAtrasada > 0.005
              ? `pelo menos ${dinheiro(derivAtrasada)} ainda não entraram na conta da Deriv — ela fecha com atraso`
              : projecao !== null
                ? `toda a aplicação, todos os clientes · ≈ ${dinheiro(projecao)} por mês neste ritmo`
                : 'toda a aplicação, todos os clientes · fecha com atraso'}
          </span>
        </div>
        <div className="kpi">
          <span className="rot">Volume negociado</span>
          <strong>{dinheiro(resumo?.volume ?? 0)}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Operações</span>
          <strong>{(resumo?.contratos ?? 0).toLocaleString('pt-BR')}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Clientes</span>
          <strong>{(resumo?.clientes ?? 0).toLocaleString('pt-BR')}</strong>
        </div>
      </div>

      <ClientesAdmin sessao={sessaoTeeds} dias={dias} />

      {/* -------- comissão calculada sobre as operações reais -------- */}
      <section className="ger-bloco">
        <div className="ger-bloco-topo">
          <span className="rot">Comissão gerada pelas suas operações</span>
          {isDemo && <span className="ger-tag">conta demo · simulação</span>}
        </div>
        <p className="ger-texto">
          Calculado operação por operação, com a regra real da Deriv: <b>3% do pagamento</b> de
          cada contrato comprado pela {MARCA.prosa}. {isDemo && 'Como a conta é demo, o dinheiro é fictício — mas o cálculo é o mesmo que valeria numa conta real.'}
          {' '}O período é o mesmo que você escolheu aí em cima.
        </p>

        {simErro && <div className="ger-erro">{simErro}</div>}
        {simCarregando && (
          <p className="ger-nota">
            {progresso
              ? `somando dia a dia — ${progresso.feitos} de ${progresso.total}…`
              : 'somando suas operações…'}
          </p>
        )}

        {sim && (
          <>
            <div className="kpis">
              <div className="kpi kpi-grande kpi-vivo">
                <span className="rot"><i className="ponto-vivo" aria-hidden />Comissão gerada</span>
                <strong>{dinheiro(vivo.comissao, 'USD')}</strong>
                <span className="kpi-nota">
                  em {vivo.operacoes.toLocaleString('pt-BR')} operações{' '}
                  {sim.dias === 1 ? 'hoje' : `nos últimos ${sim.dias} dias`}
                  {' · '}média de {dinheiro(vivo.media)} por operação
                </span>
              </div>
              <div className="kpi">
                <span className="rot">Movimentado</span>
                <strong>{dinheiro(vivo.movimentado)}</strong>
              </div>
              <div className="kpi">
                <span className="rot">Pagamentos contratados</span>
                <strong>{dinheiro(vivo.pagamentos)}</strong>
                <span className="kpi-nota">base do cálculo</span>
              </div>
            </div>

            {sim.truncado && (
              <p className="ger-nota">
                São tantas operações que parei em {sim.operacoes.toLocaleString('pt-BR')} —
                há mais coisa nesse período que não entrou nesta conta.
              </p>
            )}

            {sim.porDia.length > 0 && (
              <div className="sim-dias">
                <span className="rot">Por dia</span>
                {sim.porDia.map((d) => {
                  const maior = Math.max(...sim.porDia.map((x) => x.comissao), 0.01)
                  return (
                    <div key={d.data} className="sim-dia">
                      <span>{d.data.slice(8)}/{d.data.slice(5, 7)}</span>
                      <div className="sim-dia-barra">
                        <i style={{ width: `${(d.comissao / maior) * 100}%` }} />
                      </div>
                      <b>{dinheiro(d.comissao)}</b>
                      <em>{d.operacoes} op.</em>
                    </div>
                  )
                })}
              </div>
            )}

            {sim.operacoes === 0 && (
              <p className="ger-nota">
                Nenhuma compra pela {MARCA.prosa} ainda no período carregado. Opere um pouco
                (na demo mesmo) e os números aparecem aqui.
              </p>
            )}
          </>
        )}
      </section>

      {/* ---------------- gráfico diário ---------------- */}
      {serie.length > 0 && (
        <section className="ger-bloco">
          <span className="rot">Comissão por dia</span>
          <div className="serie">
            {serie.map((d) => (
              <div key={d.data} className="serie-col" title={`${d.data}: ${dinheiro(d.comissao)} · ${d.contratos} operações`}>
                <span style={{ height: `${(d.comissao / maxSerie) * 100}%` }} />
              </div>
            ))}
          </div>
          <div className="serie-eixo">
            <span>{serie[0]?.data.slice(8) + '/' + serie[0]?.data.slice(5, 7)}</span>
            <span>hoje</span>
          </div>
          {resumo?.contratos === 0 && (
            <p className="ger-nota">
              Nada ainda — o faturamento aparece quando clientes operarem com dinheiro real
              pela {MARCA.prosa}. Operações em conta demo não geram comissão.
            </p>
          )}
        </section>
      )}

      {/* ---------------- convite ---------------- */}
      <section className="ger-bloco convite">
        <div className="convite-texto">
          <span className="rot">Traga clientes para a {MARCA.prosa}</span>
          <p>
            Toda conta aberta por este link fica ligada a você. As operações
            que essas pessoas fizerem pela {MARCA.prosa} geram os 3% de comissão que
            aparecem aqui em cima.
          </p>
        </div>
        <div className="convite-acao">
          <code>{MARCA.afiliado}</code>
          <div className="convite-botoes">
            <button onClick={copiarLink}>{copiado ? 'copiado!' : 'Copiar link'}</button>
            <a href={MARCA.afiliado} target="_blank" rel="noopener noreferrer">Abrir</a>
          </div>
        </div>
      </section>

      {/* ---------------- simulador ---------------- */}
      <section className="ger-bloco">
        <div className="ger-bloco-topo">
          <span className="rot">Simulador de markup</span>
          <span className="ger-tag">medido na Deriv, não estimado no escuro</span>
        </div>
        <p className="ger-texto">
          Quanto maior sua comissão, menor o pagamento que seu cliente enxerga — e mais fácil
          ele comparar a {MARCA.prosa} com a concorrência. Arraste para ver os dois lados.
        </p>

        <div className="sim-controle">
          <input
            type="range" min={0} max={3} step={0.25}
            value={markupSim}
            onChange={(e) => setMarkupSim(Number(e.target.value))}
          />
          <div className="sim-valor">
            <strong>{markupSim.toFixed(2).replace('.', ',')}%</strong>
            {markupSim === 3 && <span className="sim-tag">seu ajuste atual</span>}
          </div>
        </div>

        <div className="sim-grade">
          <div className="sim-card">
            <span className="rot">Cliente opera</span>
            <strong>{dinheiro(10, moeda)}</strong>
          </div>
          <div className="sim-card">
            <span className="rot">Ele recebe se ganhar</span>
            <strong>{dinheiro(simulacao.payoutCliente, moeda)}</strong>
            <span className="sim-sub perda">
              −{dinheiro(simulacao.clientePerde, moeda)} vs. sem markup
            </span>
          </div>
          <div className="sim-card destaque">
            <span className="rot">Você ganha</span>
            <strong className="ganho">{dinheiro(simulacao.suaComissao, moeda)}</strong>
            <span className="sim-sub">por operação de {dinheiro(10, moeda)}</span>
          </div>
        </div>

        <div className="sim-escala">
          <div className="sim-linha">
            <span>A cada {dinheiro(10000)} movimentados</span>
            <strong className="ganho">{dinheiro(simulacao.suaComissao * 1000)}</strong>
          </div>
          <div className="sim-linha">
            <span>Diferença de pagamento que o cliente percebe</span>
            <strong>{((simulacao.clientePerde / (payoutBase || 1)) * 100).toFixed(1)}%</strong>
          </div>
        </div>

        {markupSim !== 3 && (
          <p className="ger-nota">
            Para valer, o ajuste precisa ser feito no painel da Deriv — aqui é só simulação.
            Hoje você está em 3%, rendendo {dinheiro(simAtual.suaComissao, moeda)} por operação de {dinheiro(10, moeda)}.
          </p>
        )}
      </section>

      {/* ---------------- ficha do app ---------------- */}
      <section className="ger-bloco">
        <span className="rot">Aplicação registrada</span>
        <dl className="ficha">
          <div><dt>Nome</dt><dd>{MARCA.prosa}</dd></div>
          <div><dt>App ID</dt><dd className="mono">{MARCA.appId}</dd></div>
          <div><dt>Markup</dt><dd>3,00%</dd></div>
          <div><dt>Endereço de retorno</dt><dd className="mono quebra">{MARCA.redirectUri}</dd></div>
          <div><dt>Permissões</dt><dd>{DERIV.scopes.join(', ')}</dd></div>
        </dl>
      </section>
    </div>
  )
}
