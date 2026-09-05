import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { publicSocket } from '../core/deriv/client'
import {
  acompanharRobo, ligarRobo, listarRobos, matematica, MODELOS, pararRobo,
  pausarRobo, perdasAteOStop, retomarRobo,
  type ConfigRobo, type EstrategiaId, type ModeloRobo, type Robo,
} from '../core/deriv/robots'
import type { ActiveSymbol } from '../core/deriv/types'
import { LocalRobotPanel } from './LocalRobotPanel'
import { Emblema } from './RobotCard'
import { CapaAula, capaDoRobo } from './CapaAula'
import { ServerRobotLive } from './ServerRobotLive'
import { RobotScope } from './RobotScope'
import { IDENTIDADES, identidade, identidadePorContrato, type Identidade } from '../core/deriv/branding'
import { batizarRobo, nomeDoRobo, sugerirNome, todosOsNomes } from '../core/deriv/robotNames'
import { DerivDesconectada } from './DerivDesconectada'
import type { SessaoTeeds } from '../core/teeds/conta'
import { registrarOperacaoRobo } from '../core/teeds/clientes'
import { SessoesServidor } from './SessoesServidor'
import { acompanharVivas, type SessaoViva } from '../core/teeds/servidorRobos'

interface Props {
  socket: TeedsSocket | null
  logado: boolean
  isDemo: boolean
  moeda: string
  symbols: ActiveSymbol[]
  symbolPadrao: string | null
  /** Estado da conexao autenticada, para avisar quando o robo perde o sinal. */
  conexao?: string
  entrandoNaDeriv?: boolean
  onConectarDeriv?: () => void
  sessaoTeeds?: SessaoTeeds | null
  contaId?: string | null
}

/** Teto de robos simultaneos: cada um consome assinaturas da mesma conexao. */
const MAX_BLOCOS = 4

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const digitosDoModelo = (id: string): string[] => ({
  ag2: ['0', '1', '2'], superior5: ['7', '8', '9'],
  firstblock: ['0', '1', '2', '3', '4'], secondblock: ['5', '6', '7', '8', '9'],
}[id] ?? [])

const perfilDoModelo = (id: string) => ({
  ag2: 'Espelho', superior5: 'Insistente',
  firstblock: 'Bloco inferior', secondblock: 'Bloco superior',
}[id] ?? 'Automático')

export function RobotsPanel({
  socket, logado, isDemo, moeda, symbols, symbolPadrao, conexao = 'open',
  entrandoNaDeriv = false, onConectarDeriv, sessaoTeeds, contaId,
}: Props) {
  const [symbol, setSymbol] = useState<string>(symbolPadrao ?? '1HZ100V')
  const [valorInicial, setValorInicial] = useState(1)
  const [ticks, setTicks] = useState(1)
  const [estrategia, setEstrategia] = useState<EstrategiaId>('dalembert')
  const [multiplicador, setMultiplicador] = useState(2)
  const [unidade, setUnidade] = useState(1)
  const [valorMaximo, setValorMaximo] = useState(20)
  const [stopLoss, setStopLoss] = useState(20)
  const [takeProfit, setTakeProfit] = useState(20)
  const [maxContratos, setMaxContratos] = useState(50)

  const [robos, setRobos] = useState<Map<string, Robo>>(new Map())
  const [ligando, setLigando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [confirmaReal, setConfirmaReal] = useState(false)
  const [pagamento, setPagamento] = useState<number | null>(null)
  const [nome, setNome] = useState('')
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [nomes, setNomes] = useState<Record<string, string>>(todosOsNomes)
  const [ident, setIdent] = useState<Identidade>(IDENTIDADES[0])
  // Cada bloco e uma sessao de robo independente, com sua propria cabine.
  const [blocos, setBlocos] = useState<string[]>(['bloco-1'])
  const [blocoExpandido, setBlocoExpandido] = useState<string | null>(null)
  const [sessoesLocais, setSessoesLocais] = useState<Set<string>>(new Set())
  /**
   * O que está operando no servidor agora.
   *
   * Um robô ligado pelo chat — do celular, com o computador desligado —
   * aparece aqui sozinho e ganha o mesmo painel ao vivo do robô ligado no
   * botão. Antes ele só existia como um cartãozinho de resumo, como se
   * fosse outra categoria de robô. É o mesmo robô, no mesmo servidor.
   */
  const [vivasNoServidor, setVivasNoServidor] = useState<SessaoViva[]>([])
  /** Sessões que algum bloco desta tela já está mostrando — não duplicar. */
  const [adotadas, setAdotadas] = useState<Record<string, string | null>>({})
  const [vitrineAberta, setVitrineAberta] = useState(true)
  const [comparando, setComparando] = useState(false)
  const proximoBloco = useRef(2)
  const contratosEnviados = useRef(new Set<number>())

  useEffect(() => {
    if (!sessaoTeeds) { setVivasNoServidor([]); return }
    return acompanharVivas(sessaoTeeds, setVivasNoServidor)
  }, [sessaoTeeds?.token]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirBloco = () =>
    setBlocos((b) => (b.length >= MAX_BLOCOS ? b : [...b, `bloco-${proximoBloco.current++}`]))
  const fecharBloco = (id: string) => {
    setBlocos((b) => b.filter((x) => x !== id))
    setBlocoExpandido((atual) => atual === id ? null : atual)
  }
  const modelo: ModeloRobo = MODELOS.find((m) => m.contractType === ident.contrato) ?? MODELOS[0]

  useEffect(() => { if (symbolPadrao) setSymbol(symbolPadrao) }, [symbolPadrao])
  useEffect(() => { setNome(sugerirNome(modelo.nome)) }, [modelo])

  // cotacao do contrato configurado, para mostrar a matematica real
  useEffect(() => {
    let vivo = true
    const id = setTimeout(async () => {
      try {
        const conexao = socket ?? publicSocket
        const res = await conexao.send({
          proposal: 1, amount: valorInicial, basis: 'stake', currency: moeda,
          contract_type: modelo.contractType, duration: ticks, duration_unit: 't',
          underlying_symbol: symbol,
          ...(modelo.barreira !== undefined ? { barrier: String(modelo.barreira) } : {}),
        })
        if (vivo) setPagamento(Number((res.proposal as any).payout))
      } catch { if (vivo) setPagamento(null) }
    }, 400)
    return () => { vivo = false; clearTimeout(id) }
  }, [socket, modelo, symbol, ticks, valorInicial, moeda])

  // carrega e acompanha os robos existentes
  const carregar = useCallback(async () => {
    if (!socket) return
    try {
      const lista = await listarRobos(socket)
      setRobos(new Map(lista.map((r) => [r.runId, r])))
    } catch (e) { setErro((e as Error).message) }
  }, [socket])

  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    if (!socket) return
    const todos = [...robos.values()]
    const emCurso = todos.filter((r) => r.status !== 'stopped')
    const recente = todos.filter((r) => r.status === 'stopped').sort((a, b) => b.inicio - a.inicio)[0]
    const ativos = (emCurso.length ? emCurso : recente ? [recente] : []).slice(0, 6)
    const paradas = ativos.map((r) =>
      acompanharRobo(socket, r.runId, (novo) =>
        setRobos((prev) => new Map(prev).set(novo.runId, novo)),
      ),
    )
    return () => paradas.forEach((p) => p())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, [...robos.keys()].join(',')])

  const mat = useMemo(
    () => (pagamento ? matematica(modelo.digitosQueGanham, pagamento, valorInicial) : null),
    [modelo, pagamento, valorInicial],
  )
  const risco = useMemo(
    () => perdasAteOStop(estrategia, valorInicial,
      estrategia === 'martingale' ? multiplicador : unidade, valorMaximo, stopLoss),
    [estrategia, valorInicial, multiplicador, unidade, valorMaximo, stopLoss],
  )

  async function ligar() {
    if (!socket) return
    if (!isDemo && !confirmaReal) { setConfirmaReal(true); return }
    setConfirmaReal(false)
    setLigando(true)
    setErro(null)
    const config: ConfigRobo = {
      modelo, symbol, moeda, valorInicial, ticks, estrategia,
      multiplicador, unidade, valorMaximo, stopLoss, takeProfit, maxContratos,
    }
    try {
      const r = await ligarRobo(socket, config)
      const apelido = nome.trim() || sugerirNome(modelo.nome)
      batizarRobo(r.runId, apelido)
      setNomes((prev) => ({ ...prev, [r.runId]: apelido }))
      setNome(sugerirNome(modelo.nome))
      setRobos((prev) => new Map(prev).set(r.runId, r))
    } catch (e) { setErro((e as Error).message) }
    finally { setLigando(false) }
  }

  async function acao(runId: string, tipo: 'parar' | 'pausar' | 'retomar') {
    if (!socket) return
    try {
      const fn = tipo === 'parar' ? pararRobo : tipo === 'pausar' ? pausarRobo : retomarRobo
      const r = await fn(socket, runId)
      setRobos((prev) => new Map(prev).set(r.runId, r))
    } catch (e) { setErro((e as Error).message) }
  }

  const lista = [...robos.values()].sort((a, b) => b.inicio - a.inicio)
  useEffect(() => {
    if (!sessaoTeeds || !contaId) return
    for (const r of lista) for (const c of r.contratosDetalhe) {
      const id = Number(c.contract_id ?? c.id ?? 0)
      const encerrado = c.status && c.status !== 'open'
      if (!id || !encerrado || contratosEnviados.current.has(id)) continue
      contratosEnviados.current.add(id)
      const idr = identidadePorContrato(r.contrato.contract_type ?? '')
      const entrada = Number(c.buy_price ?? c.stake ?? 0), payout = Number(c.payout ?? c.payout_value ?? 0)
      const resultado = Number(c.profit ?? payout - entrada)
      void registrarOperacaoRobo(sessaoTeeds, { contractId:id, contaId, roboId:idr?.id ?? r.estrategia, roboNome:nomes[r.runId] ?? idr?.nome ?? 'Robô', ativo:r.contrato.underlying_symbol ?? r.contrato.symbol ?? '', tipoContrato:r.contrato.contract_type ?? '', moeda, demo:isDemo, entrada, pagamento:payout, resultado, markup:payout*.03, markupDeriv:(c as any).app_markup_amount ?? null, ganhou:resultado>0, executadaEm:new Date(Number(c.sell_time ?? c.date_expiry ?? Date.now()/1000)*1000).toISOString() })
    }
  }, [lista.map(r=>`${r.runId}:${r.contratos}`).join('|'), sessaoTeeds?.usuario.id, contaId]) // eslint-disable-line react-hooks/exhaustive-deps
  const rodando = lista.filter((r) => r.status === 'running' || r.status === 'paused')
  // além dos ativos, o teatro mostra a última corrida encerrada, para revisão
  const ultimaParada = lista.find((r) => r.status === 'stopped')
  const emDestaque = [...rodando, ...(rodando.length === 0 && ultimaParada ? [ultimaParada] : [])]
  const temSessaoLocal = sessoesLocais.size > 0
  // as que já estão dentro de um bloco não viram um segundo painel
  const jaNaTela = new Set(Object.values(adotadas).filter(Boolean) as string[])
  const doChat = vivasNoServidor.filter((v) => !jaNaTela.has(v.id))
  // tudo que já tem painel ao vivo nesta tela, para o resumo não repetir
  const comPainel = [...jaNaTela, ...doChat.map((v) => v.id)]

  useEffect(() => { if (temSessaoLocal) setVitrineAberta(false) }, [temSessaoLocal])

  if (!logado) {
    return (
      <div className="ger">
        <div className="ger-topo"><div><h2>Robôs</h2></div></div>
        <DerivDesconectada
          acao="Os robôs compram e vendem contratos de verdade."
          entrando={entrandoNaDeriv}
          onConectar={() => onConectarDeriv?.()} />
      </div>
    )
  }

  return (
    <div className="ger rob">
      <div className="ger-topo">
        <div>
          <h2>Robôs</h2>
          <p className="ger-sub">
            Ligue o robô e acompanhe cada entrada ao vivo. Ele pergunta os valores na hora.
          </p>
        </div>
        {!isDemo && <span className="badge badge-real">conta real selecionada</span>}
      </div>

      {/*
        O robô do chat vem primeiro, antes de tudo o mais.

        Se ele está operando agora, é a coisa mais importante desta tela.
        Quem abre Robôs com um robô rodando quer ver o que está acontecendo
        com o dinheiro — não rolar a página atrás disso. A vitrine de
        modelos serve a quem vai ligar um robô novo, e essa pessoa pode
        esperar dois palmos de rolagem; quem já tem robô operando, não.

        Fora da vitrine também de propósito: ele já existe e já tem
        estratégia. Qual cartão está selecionado embaixo não muda nada para
        ele — e esconder o painel porque a vitrine estava noutro cartão
        seria a tela fingindo que o robô não existe.
      */}
      {doChat.length > 0 && (
        <div className={`blocos ${doChat.length > 1 ? 'duplo' : ''} ${blocoExpandido ? 'tem-expandido' : ''}`}>
          {doChat.map((v, i) => (
            <LocalRobotPanel key={v.id}
              titulo={`Robô do chat${doChat.length > 1 ? ` ${i + 1}` : ''}`}
              socket={socket} isDemo={v.demo} moeda={v.moeda}
              symbols={symbols} symbolPadrao={symbolPadrao}
              identidade={identidade(v.roboId)}
              conexao={conexao}
              sessaoTeeds={sessaoTeeds} contaId={v.contaId}
              adotar={{ id: v.id, config: v.config, origem: v.origem }}
              expandido={blocoExpandido === v.id}
              onExpandir={() => setBlocoExpandido((atual) => atual === v.id ? null : v.id)} />
          ))}
        </div>
      )}

      {rodando.length > 0 && (
        <div className="resumo-robos">
          <div><b>{lista.length}</b><span>robôs criados</span></div>
          <div><b className={rodando.length ? 'ganho' : ''}>{rodando.length}</b><span>em operação</span></div>
          <div>
            <b className={lista.reduce((t, r) => t + r.resultado, 0) >= 0 ? 'ganho' : 'perda'}>
              {lista.reduce((t, r) => t + r.resultado, 0) >= 0 ? '+' : '−'}
              {din(Math.abs(lista.reduce((t, r) => t + r.resultado, 0)), moeda)}
            </b>
            <span>resultado somado</span>
          </div>
          <div><b>{din(lista.reduce((t, r) => t + r.totalMovimentado, 0), moeda)}</b><span>movimentado</span></div>
        </div>
      )}

      {/* Os robos que rodam no servidor. Um ligado pelo chat opera sem
          navegador nenhum aberto — sem isto aqui, a Teeds pareceria nao
          saber da propria operacao. O bloco some sozinho quando nao ha
          sessao alguma. */}
      {sessaoTeeds && <SessoesServidor sessao={sessaoTeeds} escondidas={comPainel} />}

      {/* A escolha do robo: cartas com a arte de cada um, como uma
          selecao de personagem — nada de quadradinhos. */}
      {IDENTIDADES.length > 1 && temSessaoLocal && (
        <div className="rv-galeria-cab">
          <span><b>{ident.nome}</b> selecionado</span>
          <button onClick={() => setVitrineAberta((v) => !v)}>
            {vitrineAberta ? 'Recolher modelos' : 'Trocar modelo'}
          </button>
        </div>
      )}
      {IDENTIDADES.length > 1 && (!temSessaoLocal || vitrineAberta) && <section className="rv-seletor">
        <div className="rv-seletor-topo">
          <div><span className="rot">Escolha sua estratégia</span><h3>Qual robô combina com a sua sessão?</h3></div>
          <button onClick={() => setComparando(true)}>Comparar robôs</button>
        </div>
        <div className="rv-galeria">
        {IDENTIDADES.map((i) => {
          const digitos = digitosDoModelo(i.id)
          const escolhido = ident.id === i.id
          return (
            <button key={i.id} className={`rv-carta ${escolhido ? 'on' : ''}`}
              style={{ ['--robo' as any]: i.cor }} onClick={() => setIdent(i)}>
              <span className="rv-arte" aria-hidden><CapaAula aula={capaDoRobo(i.id)} cor={i.cor} /></span>
              <span className="rv-veu" aria-hidden />
              <span className="rv-corpo">
                <span className="rv-chamada">{i.chamada}</span>
                <b>{i.nome}</b>
                <span className="rv-info">
                  {digitos.length > 0 && (
                    <span className="rv-digitos">
                      ganha no {digitos.map((d) => <i key={d}>{d}</i>)}
                    </span>
                  )}
                  <em>{i.chance}% de chance · paga mais por acerto</em>
                </span>
              </span>
              {escolhido && <span className="rv-sel">✓ escolhido</span>}
            </button>
          )
        })}
        </div>
      </section>}

      {comparando && (
        <div className="rv-compara-fundo" onMouseDown={(e) => e.target === e.currentTarget && setComparando(false)}>
          <section className="rv-compara" role="dialog" aria-modal="true" aria-label="Comparar robôs">
            <header><div><span className="rot">Comparativo Teeds</span><h3>Quatro estratégias, uma decisão simples</h3></div><button onClick={() => setComparando(false)} aria-label="Fechar">×</button></header>
            <div className="rv-compara-grade">
              {IDENTIDADES.map((i) => {
                const digitos = digitosDoModelo(i.id)
                return <article key={i.id} style={{ ['--robo' as any]: i.cor }}>
                  <Emblema id={i} tamanho={58} /><span>{i.chamada}</span><h4>{i.nome}</h4>
                  <dl><div><dt>Ganha com</dt><dd>{digitos.join(', ')}</dd></div><div><dt>Chance</dt><dd>{i.chance}%</dd></div><div><dt>Perfil</dt><dd>{perfilDoModelo(i.id)}</dd></div></dl>
                  <button onClick={() => { setIdent(i); setComparando(false) }}>Escolher {i.nome.replace('Teeds - ', '')}</button>
                </article>
              })}
            </div>
          </section>
        </div>
      )}

      {ident.onde === 'teeds' && (
        <>
          <div className={`blocos ${blocos.length > 1 ? 'duplo' : ''} ${blocoExpandido ? 'tem-expandido' : ''}`}>
            {blocos.map((idBloco, i) => (
              <LocalRobotPanel key={idBloco}
                titulo={`Robô ${i + 1}`}
                socket={socket} isDemo={isDemo} moeda={moeda}
                symbols={symbols} symbolPadrao={symbolPadrao} identidade={ident}
                conexao={conexao}
                sessaoTeeds={sessaoTeeds} contaId={contaId}
                expandido={blocoExpandido === idBloco}
                onExpandir={() => setBlocoExpandido((atual) => atual === idBloco ? null : idBloco)}
                onSessaoChange={(ativa, sessaoId) => {
                  setSessoesLocais((atuais) => {
                    const proximas = new Set(atuais)
                    ativa ? proximas.add(idBloco) : proximas.delete(idBloco)
                    return proximas
                  })
                  setAdotadas((atuais) => ({ ...atuais, [idBloco]: ativa ? sessaoId ?? null : null }))
                }}
                onRemover={() => fecharBloco(idBloco)} />
            ))}
            {blocos.length === 0 && (
              <div className="blocos-vazio">
                <span>◆</span><h3>Nenhum robô aberto</h3>
                <p>Escolha um modelo acima e abra uma nova cabine quando quiser operar.</p>
                <button onClick={abrirBloco}>+ Abrir robô</button>
              </div>
            )}
          </div>

          <div className="blocos-rodape">
            <button className="blocos-add" onClick={abrirBloco} disabled={blocos.length >= MAX_BLOCOS}>
              + Adicionar robô
            </button>
            <span className="blocos-nota">
              {blocos.length >= MAX_BLOCOS
                ? `Máximo de ${MAX_BLOCOS} robôs ao mesmo tempo.`
                : 'Cada bloco opera sozinho, com seu ativo e seus freios — mas todos gastam do mesmo saldo.'}
            </span>
          </div>
        </>
      )}

      {/* Modelos antigos saíram da vitrine, mas quem ficou ligado no servidor
          da Deriv precisa continuar podendo ser desligado daqui. */}
      {ident.onde !== 'servidor' && rodando.length > 0 && (
        <section className="ger-bloco">
          <div className="ger-bloco-topo">
            <span className="rot">Ainda ligados no servidor da Deriv</span>
            <span className="ger-tag">{rodando.length} em operação</span>
          </div>
          <p className="ger-nota">
            Robôs de modelos que saíram da vitrine. Você pode desligá-los por aqui.
          </p>
          <div className="rob-lista">
            {rodando.map((r) => {
              const identDele = identidadePorContrato(r.contrato.contract_type ?? '')
              const padrao = identDele?.nome ?? r.contrato.contract_type ?? 'Robô'
              return (
                <div key={r.runId} className={`rob-card ${r.status}`}>
                  <div className="rob-card-topo">
                    {identDele && <Emblema id={identDele} tamanho={26} />}
                    <b className="rob-apelido">{nomes[r.runId] ?? nomeDoRobo(r.runId, padrao)}</b>
                    <span className={`rob-status ${r.status}`}>
                      {r.status === 'running' ? 'operando' : 'pausado'}
                    </span>
                  </div>
                  <div className="rob-nums">
                    <div><span>Operações</span><b>{r.contratos}</b></div>
                    <div><span>Resultado</span>
                      <b className={r.resultado >= 0 ? 'ganho' : 'perda'}>
                        {r.resultado >= 0 ? '+' : '−'}{din(Math.abs(r.resultado), moeda)}
                      </b></div>
                  </div>
                  <div className="rob-acoes">
                    <button className="parar" onClick={() => acao(r.runId, 'parar')}>Desligar</button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {erro && ident.onde === 'servidor' && <div className="ger-erro">{erro}</div>}

      {ident.onde === 'servidor' && <>
      <div className="rob-grade config-robo" style={{ ['--robo' as any]: ident.cor, ['--robo-suave' as any]: ident.corSuave }}>
        {/* ---------------- configuração ---------------- */}
        <section className="ger-bloco">
          <div className="config-cab">
            <Emblema id={ident} tamanho={44} />
            <div>
              <b>{ident.nome}</b>
              <span>{ident.descricao}</span>
            </div>
          </div>

          <div className="rob-linha">
            <label><span className="rot">Ativo</span>
              <select value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {symbols.filter((s) => s.isOpen).map((s) => (
                  <option key={s.symbol} value={s.symbol}>{s.name}</option>
                ))}
              </select>
            </label>
            <label><span className="rot">Ticks</span>
              <select value={ticks} onChange={(e) => setTicks(Number(e.target.value))}>
                {[1,2,3,4,5,6,7,8,9,10].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label><span className="rot">Valor inicial</span>
              <input type="number" min={0.35} step={0.01} value={valorInicial}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setValorInicial(Math.max(0.35, Number(e.target.value) || 0.35))} />
            </label>
          </div>

          <span className="rot" style={{ marginTop: 16 }}>Gestão de banca</span>
          <div className="rob-estrat">
            <button className={estrategia === 'dalembert' ? 'on' : ''} onClick={() => setEstrategia('dalembert')}>
              <b>D'Alembert</b><span>soma uma unidade após perder, tira uma após ganhar</span>
            </button>
            <button className={estrategia === 'martingale' ? 'on' : ''} onClick={() => setEstrategia('martingale')}>
              <b>Martingale</b><span>multiplica o valor após cada perda</span>
            </button>
          </div>

          <div className="rob-linha">
            {estrategia === 'martingale' ? (
              <label><span className="rot">Multiplicador</span>
                <input type="number" min={1.1} step={0.1} value={multiplicador}
                  onChange={(e) => setMultiplicador(Math.max(1.1, Number(e.target.value) || 0))} /></label>
            ) : (
              <label><span className="rot">Unidade</span>
                <input type="number" min={0.1} step={0.1} value={unidade}
                  onChange={(e) => setUnidade(Math.max(0.1, Number(e.target.value) || 0))} /></label>
            )}
            <label><span className="rot">Valor máximo</span>
              <input type="number" min={valorInicial} value={valorMaximo}
                onChange={(e) => setValorMaximo(Number(e.target.value) || 0)} /></label>
            <label><span className="rot">Máx. operações</span>
              <input type="number" min={0} value={maxContratos}
                onChange={(e) => setMaxContratos(Number(e.target.value) || 0)} /></label>
          </div>

          <span className="rot" style={{ marginTop: 16 }}>Freios obrigatórios</span>
          <div className="rob-linha">
            <label><span className="rot">Parar se perder</span>
              <input type="number" min={1} value={stopLoss}
                onChange={(e) => setStopLoss(Math.max(1, Number(e.target.value) || 0))} /></label>
            <label><span className="rot">Parar se ganhar</span>
              <input type="number" min={1} value={takeProfit}
                onChange={(e) => setTakeProfit(Math.max(1, Number(e.target.value) || 0))} /></label>
          </div>

          <label className="rob-nome">
            <span className="rot">Nome do robô</span>
            <input value={nome} maxLength={40} placeholder={modelo.nome}
              onChange={(e) => setNome(e.target.value)} />
          </label>

          {confirmaReal && (
            <p className="rob-alerta">
              Você está na <strong>conta real</strong>. O robô vai operar com dinheiro de verdade.
              Clique de novo para confirmar.
            </p>
          )}

          <button className={`btn btn-ligar ${confirmaReal ? 'btn-confirmar' : ''}`}
            disabled={!socket || ligando} onClick={ligar}>
            {ligando ? 'ligando…' : confirmaReal ? 'Confirmar com dinheiro real' : `Ligar robô ${modelo.nome}`}
          </button>
        </section>

        <RobotScope
          symbol={symbol}
          pipSize={symbols.find((s) => s.symbol === symbol)?.pipSize ?? 2}
          ident={ident}
          ganhaCom={(d) => {
            switch (ident.contrato) {
              case 'DIGITOVER': return d > 5
              case 'DIGITUNDER': return d < 5
              case 'DIGITEVEN': return d % 2 === 0
              case 'DIGITODD': return d % 2 === 1
              default: return false
            }
          }}
          valor={valorInicial}
          ticks={ticks}
          moeda={moeda}
          socket={socket}
        />
      </div>

      {emDestaque.length > 0 && (
        <div className="teatros">
          {emDestaque.map((r) => {
            const idr = identidadePorContrato(r.contrato.contract_type ?? '') ?? ident
            return (
              <ServerRobotLive
                key={r.runId}
                robo={r}
                ident={idr}
                nome={nomes[r.runId] ?? nomeDoRobo(r.runId, idr.nome)}
                moeda={moeda}
                socket={socket}
                onPausar={() => acao(r.runId, 'pausar')}
                onRetomar={() => acao(r.runId, 'retomar')}
                onParar={() => acao(r.runId, 'parar')}
              />
            )
          })}
        </div>
      )}

      {/* ---------------- robôs em operação ---------------- */}
      <section className="ger-bloco">
        <div className="ger-bloco-topo">
          <span className="rot">Seus robôs</span>
          {rodando.length > 0 && <span className="ger-tag">{rodando.length} em operação</span>}
        </div>

        {lista.length === 0 && <p className="ger-nota">Nenhum robô criado ainda.</p>}

        <div className="rob-lista">
          {lista.filter((r) => r.status === 'stopped' && r.runId !== emDestaque[0]?.runId).map((r) => {
            const identDele = identidadePorContrato(r.contrato.contract_type ?? '')
            const padrao = identDele?.nome ?? r.contrato.contract_type ?? 'Robô'
            const apelido = nomes[r.runId] ?? nomeDoRobo(r.runId, padrao)
            const ativo = r.status === 'running'
            return (
              <div key={r.runId} className={`rob-card ${r.status}`}>
                <div className="rob-card-topo">
                  {identDele && <Emblema id={identDele} tamanho={26} />}
                  {renomeando === r.runId ? (
                    <input
                      className="rob-renomear" autoFocus defaultValue={apelido} maxLength={40}
                      onBlur={(e) => {
                        batizarRobo(r.runId, e.target.value)
                        setNomes((prev) => ({ ...prev, [r.runId]: e.target.value.trim() || padrao }))
                        setRenomeando(null)
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    />
                  ) : (
                    <b className="rob-apelido" title="clique para renomear"
                      onClick={() => setRenomeando(r.runId)}>{apelido}</b>
                  )}
                  <span className={`rob-status ${r.status}`}>
                    {r.status === 'running' ? 'operando' : r.status === 'paused' ? 'pausado' : 'parado'}
                  </span>
                </div>
                <div className="rob-nums">
                  {r.contratos > 0 && <div><span>Operações</span><b>{r.contratos}</b></div>}
                  <div><span>Movimentado</span><b>{din(r.totalMovimentado, moeda)}</b></div>
                  <div><span>Resultado</span>
                    <b className={r.resultado >= 0 ? 'ganho' : 'perda'}>
                      {r.resultado >= 0 ? '+' : '−'}{din(Math.abs(r.resultado), moeda)}
                    </b></div>
                </div>
                <p className="rob-tipo">{padrao}{r.contrato.duration ? ` · ${r.contrato.duration}t` : ''}</p>
                {r.motivoParada && (
                  <p className="rob-motivo">
                    parou: {r.motivoParada === 'user_stopped' ? 'você desligou'
                      : r.motivoParada === 'condition_triggered' ? 'bateu um dos freios'
                      : r.motivoParada}
                  </p>
                )}
                {r.status !== 'stopped' && (
                  <div className="rob-acoes">
                    {ativo
                      ? <button onClick={() => acao(r.runId, 'pausar')}>Pausar</button>
                      : <button onClick={() => acao(r.runId, 'retomar')}>Retomar</button>}
                    <button className="parar" onClick={() => acao(r.runId, 'parar')}>Desligar</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
      </>}
    </div>
  )
}
