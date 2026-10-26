import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { subscribeTicks, fetchTickHistory } from '../../core/deriv/market'
import { publicSocket, type TeedsSocket } from '../../core/deriv/client'
import { ultimoDigito, type DigitContract } from '../../core/deriv/digits'
import {
  DIGITOS_VALIDOS, MODELOS, NOME_DO_CONTRATO, chaveDoContrato, chanceTeorica, cumpre, digitosQueGanham, frases, problemas, receitaNova,
  textoCondicao, textoContrato, textoTicks, usaDigito, type Condicao, type Contrato, type Gatilho, type Receita,
} from '../../core/laboratorio/receita'
import { estadoInicial, faseAtiva, passo, porDolarEstimado, type Estado, type Evento, type NomeDaFase } from '../../core/laboratorio/maquina'
import { escadaDaReceita, leituraDoPagamento, simular, type ResultadoDaSimulacao } from '../../core/laboratorio/simular'
import { ATIVO_DO_LAB, cotarPagamentos, historicoDeDigitos, type LabApi, type ReceitaGuardada, type Situacao } from '../../core/laboratorio/dados'
import './laboratorio.css'

/*
  Laboratório de IA (26/10/2026). Tiago: "construir um robô diretamente pela
  plataforma... digitos, análises, loss virtual, trocas de estratégias... tão
  intuitivo que até uma criança de 8 anos saberia". E depois: "todos admins da
  GF devem poder criar... falar sobre o payout... bem interativo".

  A tela monta uma RECEITA (core/laboratorio/receita.ts) em quatro perguntas.
  A fita ao vivo e a simulação rodam a mesma máquina (maquina.ts), com a
  escada do motor. O pagamento de cada compra é cotado na hora pela Deriv.
*/

const usd = (v: number, sinal = false) => `${sinal && v > 0 ? '+' : v < 0 ? '−' : ''}US$ ${Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const pct = (v: number, casas = 1) => `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`
const DIGITOS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const TIPOS: DigitContract[] = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF', 'DIGITEVEN', 'DIGITODD']
const PERIODOS = [{ ticks: 1800, nome: '1 hora' }, { ticks: 10800, nome: '6 horas' }, { ticks: 21600, nome: '12 horas' }, { ticks: 43200, nome: '24 horas' }]
const SITUACAO: Record<Situacao, string> = { rascunho: 'Rascunho', simulada: 'Simulada', ensaio: 'Em ensaio', publicada: 'Na vitrine' }
const copiar = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

interface Props {
  api: LabApi
  /** Conexão da conta (cota com o markup real); sem ela, a pública. */
  socket?: TeedsSocket | null
}

export function LaboratorioIA({ api, socket }: Props) {
  const [lista, setLista] = useState<ReceitaGuardada[] | null>(null)
  const [aberta, setAberta] = useState<ReceitaGuardada | null>(null)
  const [r, setR] = useState<Receita>(() => receitaNova())
  const [salvo, setSalvo] = useState<string>(() => JSON.stringify(receitaNova()))
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState<{ texto: string; erro?: boolean } | null>(null)
  const [confirmaApagar, setConfirmaApagar] = useState(false)
  const [verBiblioteca, setVerBiblioteca] = useState(false)
  const mudou = JSON.stringify(r) !== salvo
  const erros = useMemo(() => problemas(r), [r])

  useEffect(() => { api.listar().then(setLista).catch((e) => { setLista([]); setAviso({ texto: (e as Error).message, erro: true }) }) }, [api])
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 4500); return () => clearTimeout(t) }, [aviso])

  const mexer = useCallback((f: (x: Receita) => void) => setR((atual) => { const n = copiar(atual); f(n); return n }), [])

  /* ------------------------------------------------ pagamentos cotados na Deriv */
  const contratos = useMemo(() => [r.base.contrato, ...(r.recuperacao ? [r.recuperacao.contrato] : [])], [r.base.contrato, r.recuperacao])
  const [cotacoes, setCotacoes] = useState<Map<string, number>>(new Map())
  const chaves = contratos.map(chaveDoContrato).join('|')
  useEffect(() => {
    let vivo = true
    const t = setTimeout(() => { cotarPagamentos(contratos, socket ?? publicSocket).then((m) => vivo && setCotacoes((antes) => new Map([...antes, ...m]))) }, 300)
    return () => { vivo = false; clearTimeout(t) }
  }, [chaves, socket]) // eslint-disable-line react-hooks/exhaustive-deps
  const porDolar = useCallback((c: Contrato) => cotacoes.get(chaveDoContrato(c)) ?? porDolarEstimado(c), [cotacoes])
  const cotado = (c: Contrato) => cotacoes.has(chaveDoContrato(c))

  /* ------------------------------------------------ biblioteca */
  const abrir = (g: ReceitaGuardada | null, receita: Receita) => {
    if (mudou && !window.confirm('Há mudanças não salvas nesta receita. Abrir outra mesmo assim?')) return
    setAberta(g); setR(copiar(receita)); setSalvo(JSON.stringify(receita)); setConfirmaApagar(false); setVerBiblioteca(false); setSim(null)
  }
  const salvar = async (extra: { situacao?: Situacao; simulacao?: ReceitaGuardada['simulacao'] } = {}) => {
    if (erros.length) { setAviso({ texto: erros[0], erro: true }); return }
    setOcupado(true)
    try {
      const g = await api.salvar({ id: aberta?.id, receita: r, ...extra })
      setAberta(g); setSalvo(JSON.stringify(g.receita))
      setLista((l) => [g, ...(l ?? []).filter((x) => x.id !== g.id)])
      if (!extra.simulacao) setAviso({ texto: aberta ? 'Receita salva.' : 'Receita criada. Ela fica só para os admins.' })
      return g
    } catch (e) { setAviso({ texto: (e as Error).message, erro: true }) } finally { setOcupado(false) }
  }
  const duplicar = () => { setAberta(null); mexer((x) => { x.nome = `${x.nome} (cópia)`.slice(0, 60) }); setSalvo(''); setAviso({ texto: 'Cópia aberta. Salve para guardar.' }) }
  const apagar = async () => {
    if (!aberta) return
    setOcupado(true)
    try { await api.apagar(aberta.id); setLista((l) => (l ?? []).filter((x) => x.id !== aberta.id)); abrirNova(true); setAviso({ texto: 'Receita apagada.' }) }
    catch (e) { setAviso({ texto: (e as Error).message, erro: true }) } finally { setOcupado(false); setConfirmaApagar(false) }
  }
  const abrirNova = (forcar = false) => {
    if (!forcar && mudou && !window.confirm('Há mudanças não salvas nesta receita. Começar outra mesmo assim?')) return
    const n = receitaNova(); setAberta(null); setR(n); setSalvo(JSON.stringify(n)); setSim(null)
  }

  /* ------------------------------------------------ simulação */
  const [base, setBase] = useState(1)
  const [saldo, setSaldo] = useState(500)
  const [periodo, setPeriodo] = useState(PERIODOS[1].ticks)
  const [sim, setSim] = useState<{ res: ResultadoDaSimulacao; de: number | null; ate: number | null } | null>(null)
  const [carregandoSim, setCarregandoSim] = useState<number | null>(null)
  const historico = useRef<{ ticks: number; digitos: number[]; de: number | null; ate: number | null; quando: number } | null>(null)
  const rodarSimulacao = async () => {
    if (erros.length) { setAviso({ texto: erros[0], erro: true }); return }
    setCarregandoSim(0)
    try {
      let h = historico.current
      if (!h || h.ticks < periodo || Date.now() - h.quando > 10 * 60_000) {
        const veio = await historicoDeDigitos(periodo, (n) => setCarregandoSim(n), socket ?? publicSocket)
        h = { ticks: periodo, ...veio, quando: Date.now() }
        historico.current = h
      }
      const digitos = h.digitos.slice(-periodo)
      const res = simular(r, digitos, { base, porDolar }, saldo)
      setSim({ res, de: h.de, ate: h.ate })
      // a receita guardada sobe para "simulada" e leva o resumo
      if (aberta && !mudou) {
        const resumo = { quando: new Date().toISOString(), ticks: res.ticks, entradas: res.entradas, acerto: res.entradas ? res.ganhas / Math.max(1, res.ganhas + res.perdidas) : 0, resultado: res.resultado, maiorSequencia: res.maiorSequenciaDePerdas, quebrou: !!res.quebrou, saldo, base }
        await salvar({ situacao: aberta.situacao === 'rascunho' ? 'simulada' : undefined, simulacao: resumo })
      }
    } catch (e) { setAviso({ texto: (e as Error).message || 'A Deriv não entregou o histórico agora. Tente de novo.', erro: true }) } finally { setCarregandoSim(null) }
  }

  const escada = useMemo(() => escadaDaReceita(r, base, porDolar, 12), [r, base, porDolar])

  /* ------------------------------------------------ o passo a passo */
  const [passoAtual, setPassoAtual] = useState(1)
  const [avancado, setAvancado] = useState(false)
  const PASSOS = [
    { n: 1, nome: 'Quando entrar', resumo: resumoDoGatilho(r.base.gatilho) },
    { n: 2, nome: 'O que comprar', resumo: `${textoContrato(r.base.contrato)} · ${textoTicks(r.base.contrato.ticks)}` },
    { n: 3, nome: 'Se perder', resumo: r.recuperacao ? `troca para ${textoContrato(r.recuperacao.contrato)}` : 'recupera na mesma compra' },
    { n: 4, nome: 'Testar', resumo: sim ? (sim.res.quebrou ? 'a conta quebraria' : `${usd(sim.res.resultado, true)} no teste`) : 'nos dígitos reais' },
  ]
  const ir = (n: number) => { setPassoAtual(n); document.querySelector('.lb-palco')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  return (
    <div className="lb">
      {/* ------------------------------------------------ topo */}
      <header className="lb-topo">
        <div className="lb-titulo">
          <input id="lb-nome" className="lb-nome" value={r.nome} maxLength={60} aria-label="Nome do robô" onChange={(e) => mexer((x) => { x.nome = e.target.value })} />
          <div className="lb-situacao">
            <span className={`lb-pilula s-${aberta?.situacao ?? 'novo'}`}>{aberta ? SITUACAO[aberta.situacao] : 'Rascunho novo'}</span>
            {mudou && <span className="lb-mudou">mudanças não salvas</span>}
          </div>
        </div>
        <div className="lb-acoes">
          <div className="lb-abrir">
            <button type="button" className="lb-btn" aria-expanded={verBiblioteca} onClick={() => setVerBiblioteca((v) => !v)}>Minhas receitas{lista?.length ? ` (${lista.length})` : ''} <span aria-hidden="true">▾</span></button>
            {verBiblioteca && (
              <div className="lb-biblioteca" role="dialog" aria-label="Minhas receitas e modelos">
                <h2>Minhas receitas</h2>
                {lista === null ? <p className="lb-sutil">Carregando…</p> : lista.length === 0 ? <p className="lb-sutil">Nenhuma ainda. Salve a primeira.</p> : (
                  <ul className="lb-lista">
                    {lista.map((g) => (
                      <li key={g.id}>
                        <button type="button" className={aberta?.id === g.id ? 'on' : ''} onClick={() => abrir(g, g.receita)}>
                          <b>{g.nome}</b>
                          <small><i className={`lb-ponto s-${g.situacao}`} />{SITUACAO[g.situacao]}{g.simulacao ? ` · ${g.simulacao.quebrou ? 'quebrou no teste' : `${usd(g.simulacao.resultado, true)} no teste`}` : ''}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <h2>Começar de um modelo</h2>
                <ul className="lb-lista modelos">
                  {MODELOS.map((m) => <li key={m.id}><button type="button" onClick={() => { abrir(null, m.receita); setPassoAtual(1) }}><b>{m.nome}</b><small>{m.receita.resumo}</small></button></li>)}
                </ul>
                <button type="button" className="lb-btn lb-nova" onClick={() => { abrirNova(); setVerBiblioteca(false); setPassoAtual(1) }}>+ Começar do zero</button>
              </div>
            )}
          </div>
          {aberta && <button type="button" className="lb-btn" onClick={duplicar}>Duplicar</button>}
          {aberta && !confirmaApagar && <button type="button" className="lb-btn perigo" onClick={() => setConfirmaApagar(true)}>Apagar</button>}
          {aberta && confirmaApagar && <span className="lb-confirma">Apagar de vez? <button type="button" className="lb-btn perigo" disabled={ocupado} onClick={() => void apagar()}>Sim</button><button type="button" className="lb-btn" onClick={() => setConfirmaApagar(false)}>Não</button></span>}
          <button type="button" className="lb-btn principal" disabled={ocupado || (!mudou && !!aberta)} onClick={() => void salvar()}>{ocupado ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </header>
      {aviso && <p className={`lb-aviso ${aviso.erro ? 'erro' : ''}`} role="status">{aviso.texto}</p>}

      {/* ------------------------------------------------ os passos */}
      <nav className="lb-passos" aria-label="Passos do robô">
        {PASSOS.map((p) => (
          <button key={p.n} type="button" className={`${passoAtual === p.n ? 'on' : ''} ${p.n < passoAtual ? 'feito' : ''}`} aria-current={passoAtual === p.n ? 'step' : undefined} onClick={() => ir(p.n)}>
            <i>{p.n < passoAtual ? '✓' : p.n}</i>
            <span><b>{p.nome}</b><small>{p.resumo}</small></span>
          </button>
        ))}
      </nav>

      <div className="lb-mesa">
        <main className="lb-palco">
          {passoAtual === 1 && (
            <Etapa titulo="Quando o robô entra?" ajuda="Escolha a análise que ele faz antes de cada compra.">
              <EditorDeGatilho gatilho={r.base.gatilho} contrato={r.base.contrato} aoMudar={(g) => mexer((x) => { x.base.gatilho = g })} />
            </Etapa>
          )}

          {passoAtual === 2 && (
            <Etapa titulo="O que o robô compra?" ajuda="O contrato de dígito e quantos ticks ele dura.">
              <EditorDeContrato contrato={r.base.contrato} aoMudar={(c) => mexer((x) => { x.base.contrato = c })} />
              <CartaoDoPagamento contrato={r.base.contrato} porDolar={porDolar(r.base.contrato)} cotado={cotado(r.base.contrato)} />
            </Etapa>
          )}

          {passoAtual === 3 && (
            <Etapa titulo="E quando perde?" ajuda="Continua na mesma compra ou troca de estratégia até recuperar. Ganhou, volta ao começo.">
              <div className="lb-opcoes" role="radiogroup" aria-label="O que fazer depois de perder">
                <button type="button" role="radio" aria-checked={!r.recuperacao} className={!r.recuperacao ? 'on' : ''} onClick={() => mexer((x) => { x.recuperacao = null })}>
                  <b>Recupera na mesma compra</b><small>Continua em {textoContrato(r.base.contrato)}, com o valor da escada.</small>
                </button>
                <button type="button" role="radio" aria-checked={!!r.recuperacao} className={r.recuperacao ? 'on' : ''} onClick={() => mexer((x) => { x.recuperacao ??= { gatilho: { tipo: 'sempre' }, contrato: { tipo: 'DIGITOVER', digito: 6, ticks: 1 } } })}>
                  <b>Troca de estratégia</b><small>Passa para outra compra até recuperar e volta quando ganhar.</small>
                </button>
              </div>

              {r.recuperacao && (
                <div className="lb-bloco">
                  <h4><i className="lb-bola rec" /> A compra da recuperação</h4>
                  <EditorDeContrato contrato={r.recuperacao.contrato} aoMudar={(c) => mexer((x) => { x.recuperacao!.contrato = c })} compacto />
                  <CartaoDoPagamento contrato={r.recuperacao.contrato} porDolar={porDolar(r.recuperacao.contrato)} cotado={cotado(r.recuperacao.contrato)} recuperacao />
                  <MapaDasFases r={r} />
                </div>
              )}

              <div className="lb-bloco">
                <h4>A escada</h4>
                <div className="lb-campo"><span>Lucro ao fechar a sequência</span>
                  <div className="lb-faixa"><input id="lb-margem" type="range" min={0} max={50} step={1} value={Math.round(r.escada.margem * 100)} onChange={(e) => mexer((x) => { x.escada.margem = Number(e.target.value) / 100 })} /><b>{Math.round(r.escada.margem * 100)}% da entrada</b></div>
                </div>
                <div className="lb-campo"><span>Para proteger a conta, desiste depois de</span>
                  <Contador valor={r.escada.desistirApos} min={0} max={20} rotulo="perdas seguidas" zeroComo="nunca desiste" aoMudar={(n) => mexer((x) => { x.escada.desistirApos = n })} />
                </div>
                <button type="button" className="lb-link" aria-expanded={avancado} onClick={() => setAvancado((v) => !v)}>{avancado ? 'Esconder os ajustes finos' : 'Ajustes finos da escada'}</button>
                {avancado && (
                  <div className="lb-avancado">
                    <div className="lb-campo"><span>Começa a recuperar depois de</span><Contador valor={r.escada.recuperarApos} min={1} max={5} rotulo={r.escada.recuperarApos === 1 ? 'perda' : 'perdas'} aoMudar={(n) => mexer((x) => { x.escada.recuperarApos = n })} /></div>
                    <div className="lb-campo"><span>Modo</span>
                      <div className="lb-seg">
                        <button type="button" className={r.escada.sobrePrejuizo === 0 ? 'on' : ''} onClick={() => mexer((x) => { x.escada.sobrePrejuizo = 0 })}>Conservador</button>
                        <button type="button" className={r.escada.sobrePrejuizo > 0 ? 'on' : ''} onClick={() => mexer((x) => { x.escada.sobrePrejuizo = 0.2 })}>Agressivo</button>
                      </div>
                    </div>
                    {!r.recuperacao && (
                      <label className="lb-chave">
                        <input type="checkbox" id="lb-seguir" checked={r.seguirSemAnalise} onChange={(e) => mexer((x) => { x.seguirSemAnalise = e.target.checked })} />
                        <i aria-hidden="true" />
                        <span><b>Recupera sem esperar o sinal de novo</b><small>{r.seguirSemAnalise ? 'Perdeu, compra de novo no tick seguinte, até ganhar.' : 'Perdeu, espera a análise do passo 1 antes de recuperar.'}</small></span>
                      </label>
                    )}
                    {r.recuperacao && (
                      <div className="lb-campo"><span>Entra na recuperação</span>
                        <div className="lb-seg">
                          <button type="button" className={r.recuperacao.gatilho.tipo === 'sempre' ? 'on' : ''} onClick={() => mexer((x) => { x.recuperacao!.gatilho = { tipo: 'sempre' } })}>Na hora</button>
                          <button type="button" className={r.recuperacao.gatilho.tipo === 'lossVirtual' ? 'on' : ''} onClick={() => mexer((x) => { x.recuperacao!.gatilho = { tipo: 'lossVirtual', n: 2 } })}>Com loss virtual</button>
                        </div>
                        {r.recuperacao.gatilho.tipo === 'lossVirtual' && <Contador valor={r.recuperacao.gatilho.n} min={1} max={10} rotulo="dígitos" aoMudar={(n) => mexer((x) => { x.recuperacao!.gatilho = { tipo: 'lossVirtual', n } })} />}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Etapa>
          )}

          {passoAtual === 4 && (
            <Etapa titulo="Aguenta o mercado?" ajuda="A receita roda no histórico real do 75 Index, com a sua entrada e o saldo da conta. Mostra como a regra se comporta; não prevê o mercado.">
              <div className="lb-sim-controles">
                <label className="lb-campo"><span>Entrada</span><div className="lb-dinheiro"><b>US$</b><input id="lb-base" type="number" min={0.35} step={0.05} value={base} onChange={(e) => setBase(Math.max(0.35, Number(e.target.value) || 0.35))} /></div></label>
                <label className="lb-campo"><span>Saldo da conta</span><div className="lb-dinheiro"><b>US$</b><input id="lb-saldo" type="number" min={0} step={50} value={saldo} onChange={(e) => setSaldo(Math.max(0, Number(e.target.value) || 0))} /></div></label>
                <div className="lb-campo"><span>Período</span><div className="lb-seg">{PERIODOS.map((p) => <button key={p.ticks} type="button" className={periodo === p.ticks ? 'on' : ''} onClick={() => setPeriodo(p.ticks)}>{p.nome}</button>)}</div></div>
              </div>
              <button type="button" className="lb-btn principal lb-rodar" disabled={carregandoSim !== null} onClick={() => void rodarSimulacao()}>
                {carregandoSim !== null ? `Baixando os ticks… ${Math.min(100, Math.round((carregandoSim / periodo) * 100))}%` : sim ? 'Testar de novo' : 'Testar agora'}
              </button>
              {sim && <ResultadoSimulado s={sim.res} de={sim.de} ate={sim.ate} base={base} chanceBase={chanceTeorica(r.base.contrato)} equilibrioBase={1 / porDolar(r.base.contrato)} />}
              <Termometro escada={escada} saldo={saldo} base={base} />
            </Etapa>
          )}

          <footer className="lb-navegar">
            {passoAtual > 1 ? <button type="button" className="lb-btn" onClick={() => ir(passoAtual - 1)}>← Voltar</button> : <span />}
            {passoAtual < 4
              ? <button type="button" className="lb-btn principal" onClick={() => ir(passoAtual + 1)}>Próximo: {PASSOS[passoAtual].nome} →</button>
              : <button type="button" className="lb-btn principal" disabled={ocupado || (!mudou && !!aberta)} onClick={() => void salvar()}>{aberta ? 'Salvar a receita' : 'Salvar o robô'}</button>}
          </footer>
        </main>

        {/* ------------------------------------------------ seu robô */}
        <aside className="lb-lado" aria-label="Seu robô">
          <section className="lb-cartao lb-robo">
            <h3>Seu robô</h3>
            <ol className="lb-frases">
              {frases(r).map((f, i) => {
                const passo = i === 0 ? 1 : i === 1 ? 2 : 3
                return <li key={i}><button type="button" onClick={() => ir(passo)}><i>{passo}</i><span>{f}</span></button></li>
              })}
            </ol>
            {erros.length > 0 && <ul className="lb-erros">{erros.map((e) => <li key={e}>{e}</li>)}</ul>}
          </section>
          <FitaAoVivo receita={r} porDolar={porDolar} base={base} />
        </aside>
      </div>
    </div>
  )
}

/* ================================================================== peças da tela */

function Etapa({ titulo, ajuda, children }: { titulo: string; ajuda: string; children: React.ReactNode }) {
  return (
    <section className="lb-etapa" aria-label={titulo}>
      <header><h2>{titulo}</h2><p>{ajuda}</p></header>
      <div className="lb-etapa-corpo">{children}</div>
    </section>
  )
}


function resumoDoGatilho(g: Gatilho): string {
  switch (g.tipo) {
    case 'sempre': return 'a cada tick'
    case 'lossVirtual': return `loss virtual de ${g.n}`
    case 'sequencia': return `${g.n} seguidos ${textoCondicaoCurta(g.condicao)}`
    case 'ausencia': return `o ${g.digito} sumido há ${g.n} ticks`
    case 'frequencia': return `${textoCondicaoCurta(g.condicao)} < ${g.pct}% em ${g.janela}`
  }
}
const textoCondicaoCurta = (c: Condicao) => c.tipo === 'par' ? 'pares' : c.tipo === 'impar' ? 'ímpares' : `${({ menor: 'menores que', maior: 'maiores que', igual: 'iguais a', diferente: 'diferentes de' } as const)[c.tipo]} ${c.digito}`

function Contador({ valor, min, max, rotulo, aoMudar, zeroComo }: { valor: number; min: number; max: number; rotulo: string; aoMudar: (n: number) => void; zeroComo?: string }) {
  return (
    <span className="lb-contador">
      <button type="button" aria-label="Menos" disabled={valor <= min} onClick={() => aoMudar(Math.max(min, valor - 1))}>−</button>
      <b>{valor === 0 && zeroComo ? zeroComo : valor}</b>
      <button type="button" aria-label="Mais" disabled={valor >= max} onClick={() => aoMudar(Math.min(max, valor + 1))}>+</button>
      {!(valor === 0 && zeroComo) && <span>{rotulo}</span>}
    </span>
  )
}

const GATILHOS: Array<{ tipo: Gatilho['tipo']; nome: string; ajuda: string }> = [
  { tipo: 'lossVirtual', nome: 'Loss virtual', ajuda: 'Espera dígitos que teriam perdido' },
  { tipo: 'sequencia', nome: 'Sequência', ajuda: 'Dígitos seguidos de um jeito' },
  { tipo: 'ausencia', nome: 'Dígito sumido', ajuda: 'Um dígito que não aparece' },
  { tipo: 'frequencia', nome: 'Frequência', ajuda: 'Pouco frequentes na janela' },
  { tipo: 'sempre', nome: 'Sempre', ajuda: 'Entra a cada tick' },
]

/*
  Ajustar a análise (26/10/2026, Tiago: "melhorar essa experiência" sobre a
  frase com contador e dois menus suspensos). Agora a frase só LÊ o que foi
  escolhido; embaixo, cada pergunta tem a sua linha com todas as opções à
  vista (um clique, nada escondido em menu) e o teclado de dígitos mostra
  quais contam. Para sequência e loss virtual, um exemplo desenha os dígitos.
*/

const CONDICOES: Array<[Condicao['tipo'], string]> = [['menor', 'Menores que'], ['maior', 'Maiores que'], ['igual', 'Iguais a'], ['diferente', 'Diferentes de'], ['par', 'Pares'], ['impar', 'Ímpares']]
// o dígito que deixaria a condição vazia (nenhum menor que 0, nenhum maior que 9) não aparece para escolher
const digitoPossivel = (tipo: Condicao['tipo'], d: number) => !(tipo === 'menor' && d === 0) && !(tipo === 'maior' && d === 9)
const listaDeDigitos = (l: number[]) => l.length === 10 ? 'todos' : l.length > 1 ? `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}` : l.join('')

function Ajuste({ rotulo, ajuda, children }: { rotulo: string; ajuda?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="lb-ajuste">
      <div className="lb-ajuste-rot"><b>{rotulo}</b>{ajuda && <small>{ajuda}</small>}</div>
      <div className="lb-ajuste-ctl">{children}</div>
    </div>
  )
}

/** Números lado a lado (um clique) para as faixas curtas. */
function Escolha({ valores, valor, aoMudar, rotulo }: { valores: number[]; valor: number; aoMudar: (n: number) => void; rotulo: string }) {
  return (
    <div className="lb-chips grade" role="radiogroup" aria-label={rotulo} style={{ '--qtd': valores.length } as React.CSSProperties}>
      {valores.map((n) => <button key={n} type="button" role="radio" aria-checked={valor === n} className={valor === n ? 'on' : ''} onClick={() => aoMudar(n)}>{n}</button>)}
    </div>
  )
}

/** Para as faixas longas: atalhos comuns e o contador para o ajuste fino. */
function Quantidade({ valor, min, max, atalhos, rotulo, aoMudar }: { valor: number; min: number; max: number; atalhos: number[]; rotulo: string; aoMudar: (n: number) => void }) {
  return (
    <div className="lb-quantidade">
      <Contador valor={valor} min={min} max={max} rotulo={rotulo} aoMudar={aoMudar} />
      <div className="lb-chips leves" aria-label="Atalhos">
        {atalhos.map((n) => <button key={n} type="button" className={valor === n ? 'on' : ''} onClick={() => aoMudar(n)}>{n}</button>)}
      </div>
    </div>
  )
}

/** Teclado 0–9. `contam` acende os dígitos que entram na conta; `escolhido` leva a borda. */
function TecladoDeDigitos({ contam, escolhido, possivel, aoEscolher, rotulo }: { contam: Set<number>; escolhido?: number; possivel?: (d: number) => boolean; aoEscolher?: (d: number) => void; rotulo: string }) {
  return (
    <div className="lb-teclado lb-teclado-cond" role={aoEscolher ? 'radiogroup' : 'img'} aria-label={rotulo}>
      {DIGITOS.map((d) => {
        const pode = !!aoEscolher && (possivel?.(d) ?? true)
        return (
          <button key={d} type="button" disabled={!pode} role={aoEscolher ? 'radio' : undefined} aria-checked={aoEscolher ? escolhido === d : undefined}
            className={`${contam.has(d) ? 'conta' : 'fora'} ${escolhido === d ? 'sel' : ''} ${aoEscolher ? '' : 'leitura'}`} onClick={() => aoEscolher?.(d)}>{d}</button>
        )
      })}
    </div>
  )
}

function EditorDeCondicao({ c, aoMudar }: { c: Condicao; aoMudar: (c: Condicao) => void }) {
  const temDigito = c.tipo !== 'par' && c.tipo !== 'impar'
  const contam = DIGITOS.filter((d) => cumpre(c, d))
  const trocar = (t: Condicao['tipo']) => {
    if (t === 'par' || t === 'impar') return aoMudar({ tipo: t })
    const atual = 'digito' in c ? c.digito : 5
    aoMudar({ tipo: t, digito: digitoPossivel(t, atual) ? atual : t === 'menor' ? 1 : 8 })
  }
  return (
    <>
      <Ajuste rotulo="Como são esses dígitos">
        <div className="lb-seg lb-seg-cond" role="radiogroup" aria-label="Condição">
          {CONDICOES.map(([t, nome]) => <button key={t} type="button" role="radio" aria-checked={c.tipo === t} className={c.tipo === t ? 'on' : ''} onClick={() => trocar(t)}>{nome}</button>)}
        </div>
      </Ajuste>
      <Ajuste rotulo={temDigito ? 'Qual dígito' : 'Os que contam'} ajuda={<>Contam: <b>{listaDeDigitos(contam)}</b></>}>
        <TecladoDeDigitos rotulo={temDigito ? 'Dígito da condição' : 'Dígitos que contam'} contam={new Set(contam)} escolhido={temDigito ? (c as { digito: number }).digito : undefined}
          possivel={(d) => digitoPossivel(c.tipo, d)} aoEscolher={temDigito ? (d) => aoMudar({ ...(c as { tipo: 'menor'; digito: number }), digito: d }) : undefined} />
      </Ajuste>
    </>
  )
}

/** Um exemplo desenhado: alguns dígitos que não contam e, em seguida, os N que contam; aí o robô entra. */
function ExemploDaSequencia({ n, contam, contrato }: { n: number; contam: number[]; contrato: Contrato }) {
  const fora = DIGITOS.filter((d) => !contam.includes(d))
  if (!contam.length) return null
  const antes = fora.length ? [fora[(3 * 7) % fora.length], fora[(5 * 3) % fora.length]] : []
  const seguidos = Array.from({ length: n }, (_, i) => contam[(i * 7 + 3) % contam.length])
  return (
    <div className="lb-exemplo" aria-label="Exemplo">
      <span className="lb-ex-rot">Exemplo</span>
      <ol>
        {antes.map((d, i) => <li key={`a${i}`} className="fora">{d}</li>)}
        {seguidos.map((d, i) => <li key={`s${i}`} className="conta">{d}<small>{i + 1}</small></li>)}
      </ol>
      <span className="lb-ex-entra">entra com {textoContrato(contrato)}</span>
    </div>
  )
}

function EditorDeGatilho({ gatilho: g, contrato, aoMudar }: { gatilho: Gatilho; contrato: Contrato; aoMudar: (g: Gatilho) => void }) {
  const trocar = (tipo: Gatilho['tipo']) => {
    if (tipo === g.tipo) return
    if (tipo === 'sempre') aoMudar({ tipo })
    else if (tipo === 'lossVirtual') aoMudar({ tipo, n: 4 })
    else if (tipo === 'sequencia') aoMudar({ tipo, n: 3, condicao: { tipo: 'menor', digito: 3 } })
    else if (tipo === 'ausencia') aoMudar({ tipo, digito: 7, n: 15 })
    else aoMudar({ tipo, condicao: { tipo: 'maior', digito: 6 }, janela: 25, pct: 20 })
  }
  const perdem = DIGITOS.filter((d) => !digitosQueGanham(contrato).includes(d))
  const seguidos = (n: number) => `${n} ${n === 1 ? 'dígito' : 'dígitos seguidos'}`
  return (
    <div className="lb-gatilho">
      <div className="lb-cartoes" role="radiogroup" aria-label="Tipo de análise">
        {GATILHOS.map((x) => (
          <button key={x.tipo} type="button" role="radio" aria-checked={g.tipo === x.tipo} className={g.tipo === x.tipo ? 'on' : ''} onClick={() => trocar(x.tipo)}>
            <IconeGatilho tipo={x.tipo} /><b>{x.nome}</b><small>{x.ajuda}</small>
          </button>
        ))}
      </div>

      <div className="lb-regra">
        <p className="lb-frase" aria-live="polite">
          {g.tipo === 'sempre' && <>Entra <mark>a cada tick</mark>, sem esperar nenhum sinal.</>}
          {g.tipo === 'lossVirtual' && <>Entra depois de <mark>{g.n === 1 ? '1 dígito que teria perdido' : `${g.n} dígitos seguidos que teriam perdido`}</mark> a compra {textoContrato(contrato)}.</>}
          {g.tipo === 'sequencia' && <>Entra depois de <mark>{seguidos(g.n)} {textoCondicao(g.condicao, g.n !== 1)}</mark>.</>}
          {g.tipo === 'ausencia' && <>Entra quando o <mark>{g.digito}</mark> não aparece há <mark>{g.n} ticks</mark>.</>}
          {g.tipo === 'frequencia' && <>Entra quando os dígitos <mark>{textoCondicao(g.condicao)}</mark> forem <mark>menos de {g.pct}%</mark> dos <mark>últimos {g.janela} ticks</mark>.</>}
        </p>

        {g.tipo !== 'sempre' && (
          <div className="lb-ajustes">
            {g.tipo === 'lossVirtual' && <>
              <Ajuste rotulo="Quantos seguidos"><Escolha rotulo="Quantos seguidos" valores={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]} valor={g.n} aoMudar={(n) => aoMudar({ ...g, n })} /></Ajuste>
              <Ajuste rotulo="Os que contam" ajuda={<>Fariam {textoContrato(contrato)} perder: <b>{listaDeDigitos(perdem)}</b>. Muda no passo 2.</>}>
                <TecladoDeDigitos rotulo="Dígitos que teriam perdido" contam={new Set(perdem)} />
              </Ajuste>
            </>}
            {g.tipo === 'sequencia' && <>
              <Ajuste rotulo="Quantos seguidos"><Escolha rotulo="Quantos seguidos" valores={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]} valor={g.n} aoMudar={(n) => aoMudar({ ...g, n })} /></Ajuste>
              <EditorDeCondicao c={g.condicao} aoMudar={(condicao) => aoMudar({ ...g, condicao })} />
            </>}
            {g.tipo === 'ausencia' && <>
              <Ajuste rotulo="Qual dígito"><TecladoDeDigitos rotulo="Dígito sumido" contam={new Set([g.digito])} escolhido={g.digito} aoEscolher={(d) => aoMudar({ ...g, digito: d })} /></Ajuste>
              <Ajuste rotulo="Sumido há quanto tempo"><Quantidade valor={g.n} min={2} max={200} atalhos={[10, 15, 20, 30, 50]} rotulo="ticks" aoMudar={(n) => aoMudar({ ...g, n })} /></Ajuste>
            </>}
            {g.tipo === 'frequencia' && <>
              <EditorDeCondicao c={g.condicao} aoMudar={(condicao) => aoMudar({ ...g, condicao })} />
              <Ajuste rotulo="Abaixo de" ajuda={<>O normal seria {DIGITOS.filter((d) => cumpre(g.condicao, d)).length * 10}%.</>}><Quantidade valor={g.pct} min={1} max={99} atalhos={[10, 15, 20, 25, 30]} rotulo="%" aoMudar={(pct) => aoMudar({ ...g, pct })} /></Ajuste>
              <Ajuste rotulo="Olhando os últimos"><Quantidade valor={g.janela} min={10} max={500} atalhos={[10, 25, 50, 100, 200]} rotulo="ticks" aoMudar={(janela) => aoMudar({ ...g, janela })} /></Ajuste>
            </>}
          </div>
        )}

        {g.tipo === 'sequencia' && <ExemploDaSequencia n={g.n} contam={DIGITOS.filter((d) => cumpre(g.condicao, d))} contrato={contrato} />}
        {g.tipo === 'lossVirtual' && <ExemploDaSequencia n={g.n} contam={perdem} contrato={contrato} />}
      </div>

      {g.tipo === 'lossVirtual' && <p className="lb-dica">Loss virtual: o robô assiste sem comprar e conta os dígitos que teriam feito a compra perder. Quando a conta chega no número, é hora de entrar.</p>}
      {g.tipo === 'frequencia' && <p className="lb-dica">No longo prazo cada dígito aparece 10% das vezes. A frequência olha uma janela curta e entra quando um grupo de dígitos está abaixo do normal.</p>}
    </div>
  )
}

function EditorDeContrato({ contrato: c, aoMudar, compacto = false }: { contrato: Contrato; aoMudar: (c: Contrato) => void; compacto?: boolean }) {
  const ganham = new Set(digitosQueGanham(c))
  const trocarTipo = (tipo: DigitContract) => {
    const validos = DIGITOS_VALIDOS[tipo]
    aoMudar({ ...c, tipo, digito: validos.length && !validos.includes(c.digito) ? validos[Math.floor(validos.length / 2)] : c.digito })
  }
  return (
    <div className="lb-contrato">
      <div className="lb-tipos" role="radiogroup" aria-label="Tipo de contrato">
        {TIPOS.map((t) => <button key={t} type="button" role="radio" aria-checked={c.tipo === t} className={c.tipo === t ? 'on' : ''} onClick={() => trocarTipo(t)}>{NOME_DO_CONTRATO[t]}</button>)}
      </div>
      <div className="lb-teclado" role={usaDigito(c.tipo) ? 'radiogroup' : undefined} aria-label="Dígito">
        {DIGITOS.map((d) => {
          const valido = usaDigito(c.tipo) && DIGITOS_VALIDOS[c.tipo].includes(d)
          return (
            <button key={d} type="button" disabled={!usaDigito(c.tipo) || !valido} aria-checked={usaDigito(c.tipo) ? c.digito === d : undefined} role={usaDigito(c.tipo) ? 'radio' : undefined}
              className={`${usaDigito(c.tipo) && c.digito === d ? 'sel' : ''} ${ganham.has(d) ? 'ganha' : 'perde'}`} onClick={() => aoMudar({ ...c, digito: d })}>{d}</button>
          )
        })}
      </div>
      {!compacto && <p className="lb-sutil lb-legenda-teclado"><i className="lb-quad ganha" /> ganha com {[...ganham].join(', ')} <i className="lb-quad perde" /> perde com o resto</p>}
      <div className="lb-linha">
        <span>Duração</span>
        <div className="lb-ticks">{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => <button key={t} type="button" className={c.ticks === t ? 'on' : ''} onClick={() => aoMudar({ ...c, ticks: t })}>{t}</button>)}</div>
        <span className="lb-sutil">{textoTicks(c.ticks)}</span>
      </div>
    </div>
  )
}

/** O pagamento numa frase: quanto vira cada US$ 1, e a chance teórica contra o ponto de equilíbrio. */
function CartaoDoPagamento({ contrato, porDolar, cotado, recuperacao = false }: { contrato: Contrato; porDolar: number; cotado: boolean; recuperacao?: boolean }) {
  const l = leituraDoPagamento(contrato, porDolar)
  const [aberto, setAberto] = useState(false)
  const folga = l.chance - l.equilibrio
  return (
    <div className={`lb-pagamento ${recuperacao ? 'rec' : ''}`}>
      <div className="lb-pg-principal">
        <span>Cada US$ 1 vira</span>
        <b>{usd(porDolar)}</b>
        <small>quando ganha · {cotado ? 'cotado agora na Deriv' : 'estimado, cotando…'}</small>
      </div>
      <div className="lb-pg-regua">
        <div className="lb-pg-linha"><span>Chance teórica <b>{pct(l.chance, 0)}</b></span><span>Para empatar <b>{pct(l.equilibrio)}</b></span></div>
        <div className="lb-pg-trilho" aria-label={`Chance teórica ${pct(l.chance, 0)}; precisa de ${pct(l.equilibrio)} para empatar`}>
          <i className="chance" style={{ width: `${l.chance * 100}%` }} /><em style={{ left: `${Math.min(100, l.equilibrio * 100)}%` }} />
        </div>
        <small className="lb-sutil">{folga >= 0 ? 'A chance teórica passa do ponto de equilíbrio.' : `Faltam ${pct(-folga)} de acerto para empatar só com o pagamento: a análise e a gestão fazem a diferença.`}</small>
      </div>
      <button type="button" className="lb-link" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>{aberto ? 'Fechar' : 'Como ler o pagamento?'}</button>
      {aberto && (
        <div className="lb-pg-explica">
          <p><b>Cada US$ 1 vira {usd(porDolar)}</b>: é o que a Deriv paga quando ganha, com a entrada de volta (lucro de {l.lucroPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%). Quanto menos dígitos ganham, maior o pagamento.</p>
          <p><b>Para empatar, {pct(l.equilibrio)}</b>: é quanto o robô precisa acertar no longo prazo só com esse pagamento (1 ÷ {porDolar.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}).</p>
          <p><b>Na teoria, de cada US$ 100 voltam US$ {l.volta.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</b>. A diferença é a margem da corretora e do markup; por isso a estratégia mora na hora de entrar e na gestão.</p>
          <p className="lb-sutil">Cotado com US$ 10 no 75 Index ({ATIVO_DO_LAB}), {textoContrato(contrato)} por {textoTicks(contrato.ticks)}.</p>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------ a fita ao vivo */

interface Marca { d: number; tipo: 'nada' | 'conta' | 'entra' | 'aguarda' | 'ganhou' | 'perdeu' | 'desistiu'; fase: NomeDaFase; rotulo?: string }

function FitaAoVivo({ receita, porDolar, base }: { receita: Receita; porDolar: (c: Contrato) => number; base: number }) {
  const [marcas, setMarcas] = useState<Marca[]>([])
  const [estado, setEstado] = useState<{ fase: NomeDaFase; progresso: string; alvo: number; atual: number; valor: number; aberta: boolean }>({ fase: 'base', progresso: '', alvo: 1, atual: 0, valor: base, aberta: false })
  const [placar, setPlacar] = useState({ entradas: 0, ganhou: 0, perdeu: 0, resultado: 0 })
  const [conectado, setConectado] = useState(false)
  const maquina = useRef<Estado>(estadoInicial(base))
  const recentes = useRef<number[]>([])
  const chave = JSON.stringify(receita)
  const refs = useRef({ receita, porDolar, base })
  refs.current = { receita, porDolar, base }

  const aplicar = (d: number, desenhar: boolean) => {
    const { receita: r, porDolar: pd, base: b } = refs.current
    const evs: Evento[] = passo(r, maquina.current, d, { base: b, porDolar: pd })
    if (!desenhar) return
    const m: Marca = { d, tipo: 'nada', fase: maquina.current.fase }
    let delta = { entradas: 0, ganhou: 0, perdeu: 0, resultado: 0 }
    for (const ev of evs) {
      if (ev.tipo === 'ganhou') { m.tipo = 'ganhou'; m.rotulo = `+${ev.lucro.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; delta = { ...delta, ganhou: delta.ganhou + 1, resultado: delta.resultado + ev.lucro } }
      else if (ev.tipo === 'perdeu' || ev.tipo === 'desistiu') { m.tipo = ev.tipo; m.rotulo = `−${Math.abs(ev.lucro).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; delta = { ...delta, perdeu: delta.perdeu + 1, resultado: delta.resultado + ev.lucro } }
      else if (ev.tipo === 'entra') { if (m.tipo === 'nada') { m.tipo = 'entra'; m.rotulo = ev.fase === 'recuperacao' ? 'recupera' : 'entra' } delta.entradas++ }
      else if (ev.tipo === 'aguarda') m.tipo = 'aguarda'
      else if (ev.tipo === 'espera' && ev.progresso.atual > 0 && ev.progresso.alvo > 1) m.tipo = 'conta'
    }
    const prog = evs.find((e): e is Extract<Evento, { tipo: 'espera' }> => e.tipo === 'espera')?.progresso
    setEstado({ fase: maquina.current.fase, progresso: maquina.current.aberta ? `comprado: ${textoContrato(maquina.current.aberta.contrato)}` : prog?.texto ?? '', alvo: prog?.alvo ?? 1, atual: maquina.current.aberta ? (prog?.alvo ?? 1) : prog?.atual ?? 0, valor: maquina.current.aberta?.valor ?? maquina.current.valor, aberta: !!maquina.current.aberta })
    setMarcas((l) => [...l.slice(-15), m])
    if (delta.entradas || delta.ganhou || delta.perdeu) setPlacar((p) => ({ entradas: p.entradas + delta.entradas, ganhou: p.ganhou + delta.ganhou, perdeu: p.perdeu + delta.perdeu, resultado: Math.round((p.resultado + delta.resultado) * 100) / 100 }))
  }

  // a receita mudou: a máquina recomeça já "aquecida" com os últimos dígitos (sem desenhar)
  useEffect(() => {
    maquina.current = estadoInicial(base)
    for (const d of recentes.current) aplicar(d, false)
    // depois do aquecimento, uma compra que ficou aberta não conta para o placar novo
    maquina.current.aberta = null
    setPlacar({ entradas: 0, ganhou: 0, perdeu: 0, resultado: 0 })
    setMarcas(recentes.current.slice(-16).map((d) => ({ d, tipo: 'nada', fase: 'base' })))
  }, [chave, base]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let vivo = true
    fetchTickHistory(ATIVO_DO_LAB, 300).then((ticks) => {
      if (!vivo) return
      recentes.current = ticks.map((t) => ultimoDigito(t.quote, t.pipSize || 4))
      maquina.current = estadoInicial(refs.current.base)
      for (const d of recentes.current) aplicar(d, false)
      maquina.current.aberta = null
      setMarcas(recentes.current.slice(-16).map((d) => ({ d, tipo: 'nada', fase: 'base' })))
    }).catch(() => undefined)
    const parar = subscribeTicks(ATIVO_DO_LAB, (t) => {
      if (!vivo) return
      setConectado(true)
      const d = ultimoDigito(t.quote, t.pipSize || 4)
      recentes.current = [...recentes.current.slice(-599), d]
      aplicar(d, true)
    }, publicSocket)
    return () => { vivo = false; parar() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fase = faseAtiva(receita, estado.fase)
  const ganham = new Set(digitosQueGanham(fase.contrato))
  return (
    <section className="lb-cartao lb-aovivo" aria-label="O robô decidindo ao vivo">
      <header>
        <h3>Ao vivo no 75 Index</h3>
        <span className={`lb-ao-vivo ${conectado ? 'on' : ''}`}><i />{conectado ? 'ticks reais' : 'conectando…'}</span>
      </header>
      <div className={`lb-fase-agora ${estado.fase}`}>
        <span><i className={`lb-bola ${estado.fase === 'recuperacao' ? 'rec' : 'base'}`} />{estado.fase === 'recuperacao' ? 'Recuperação' : 'Base'} · {textoContrato(fase.contrato)}</span>
        <b>{usd(estado.valor)}</b>
      </div>
      <div className="lb-progresso" aria-label={estado.progresso}>
        <div className="lb-progresso-barra"><i style={{ width: `${Math.min(100, (estado.atual / Math.max(1, estado.alvo)) * 100)}%` }} /></div>
        <small>{estado.aberta ? `${estado.progresso} · esperando o resultado` : estado.progresso || 'olhando os dígitos'}</small>
      </div>
      <div className="lb-fita" aria-hidden="true">
        {marcas.map((m, i) => (
          <span key={`${i}-${marcas.length}`} className={`lb-d ${m.tipo} ${ganham.has(m.d) ? 'alvo' : ''} ${i === marcas.length - 1 ? 'novo' : ''}`}>
            {m.d}{m.rotulo && <small>{m.rotulo}</small>}
          </span>
        ))}
      </div>
      <div className="lb-placar">
        <div><span>Entradas</span><b>{placar.entradas}</b></div>
        <div><span>Ganhou</span><b className="up">{placar.ganhou}</b></div>
        <div><span>Perdeu</span><b className="down">{placar.perdeu}</b></div>
        <div className="resultado"><span>Resultado desde que abriu</span><b className={placar.resultado >= 0 ? 'up' : 'down'}>{usd(placar.resultado, true)}</b></div>
      </div>
      <p className="lb-sutil lb-pe">Só observando, sem comprar. Zera quando a receita muda.</p>
    </section>
  )
}

/* ------------------------------------------------ o mapa das fases */

function MapaDasFases({ r }: { r: Receita }) {
  return (
    <section className="lb-cartao lb-mapa" aria-label="Mapa das fases">
      <h3>Mapa das fases</h3>
      <svg viewBox="0 0 300 150" role="img" aria-label={r.recuperacao ? 'Base troca para recuperação quando perde e volta quando ganha' : 'Uma fase só: perdeu, recupera na mesma compra'}>
        {r.recuperacao ? (
          <>
            <rect x="6" y="40" width="118" height="70" rx="14" className="m-base" />
            <text x="65" y="68" textAnchor="middle" className="m-tit">Base</text>
            <text x="65" y="88" textAnchor="middle" className="m-sub">{textoContrato(r.base.contrato)}</text>
            <rect x="176" y="40" width="118" height="70" rx="14" className="m-rec" />
            <text x="235" y="68" textAnchor="middle" className="m-tit">Recuperação</text>
            <text x="235" y="88" textAnchor="middle" className="m-sub">{textoContrato(r.recuperacao.contrato)}</text>
            <path d="M124 58 C 145 30, 155 30, 174 58" className="m-perdeu" fill="none" /><path d="M168 52 L 176 60 L 166 62 Z" className="m-perdeu-f" />
            <text x="150" y="26" textAnchor="middle" className="m-perdeu-t">perdeu</text>
            <path d="M176 92 C 155 122, 145 122, 126 92" className="m-ganhou" fill="none" /><path d="M132 98 L 124 90 L 134 88 Z" className="m-ganhou-f" />
            <text x="150" y="138" textAnchor="middle" className="m-ganhou-t">ganhou</text>
          </>
        ) : (
          <>
            <rect x="90" y="40" width="120" height="70" rx="14" className="m-base" />
            <text x="150" y="68" textAnchor="middle" className="m-tit">Base</text>
            <text x="150" y="88" textAnchor="middle" className="m-sub">{textoContrato(r.base.contrato)}</text>
            <path d="M210 62 C 255 40, 255 110, 210 92" className="m-perdeu" fill="none" /><path d="M216 98 L 208 90 L 218 88 Z" className="m-perdeu-f" />
            <text x="262" y="80" textAnchor="middle" className="m-perdeu-t">perdeu</text>
            <text x="150" y="132" textAnchor="middle" className="m-sub">recupera na mesma compra</text>
          </>
        )}
      </svg>
    </section>
  )
}

/* ------------------------------------------------ resultado da simulação */

function ResultadoSimulado({ s, de, ate, base, chanceBase, equilibrioBase }: { s: ResultadoDaSimulacao; de: number | null; ate: number | null; base: number; chanceBase: number; equilibrioBase: number }) {
  const acertoBase = s.base.entradas ? s.base.ganhas / s.base.entradas : 0
  const horas = (s.ticks * 2) / 3600
  const quando = (t: number | null) => (t ? new Date(t * 1000).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—')
  return (
    <div className="lb-resultado">
      {s.quebrou ? (
        <div className="lb-alerta erro"><b>A conta de {usd(s.saldo)} quebraria.</b> Na {s.quebrou.operacao}ª compra a escada pediu {usd(s.quebrou.compraQueFaltou)} e não havia saldo para isso (resultado até ali: {usd(s.quebrou.resultado, true)}). Diminua a entrada, limite a escada em "Desiste depois de" ou aumente o saldo.</div>
      ) : (
        <div className="lb-alerta ok"><b>A conta de {s.saldo > 0 ? usd(s.saldo) : 'saldo livre'} aguentou {horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} horas.</b> Maior sequência de perdas: {s.maiorSequenciaDePerdas}, com a maior compra de {usd(s.maiorEntrada)}.</div>
      )}
      <div className="lb-kpis">
        <div><span>Resultado</span><b className={s.resultado >= 0 ? 'up' : 'down'}>{usd(s.resultado, true)}</b><small>entrada de {usd(base)}</small></div>
        <div><span>Entradas</span><b>{s.entradas.toLocaleString('pt-BR')}</b><small>{s.entradasPorHora} por hora</small></div>
        <div><span>Acerto na base</span><b>{pct(acertoBase)}</b><small>teórica {pct(chanceBase, 0)} · equilíbrio {pct(equilibrioBase)}</small></div>
        <div><span>Pior queda</span><b className="down">{usd(-s.piorQueda)}</b><small>do ponto mais alto até o fundo</small></div>
        <div><span>Maior sequência de perdas</span><b>{s.maiorSequenciaDePerdas}</b><small>{s.desistencias ? `${s.desistencias} desistência(s)` : 'sem desistências'}</small></div>
        <div><span>Maior compra</span><b>{usd(s.maiorEntrada)}</b><small>{(s.maiorEntrada / base).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× a entrada</small></div>
      </div>
      <Curva valores={s.curva} quebrou={!!s.quebrou} />
      <p className="lb-sutil lb-pe">{s.quebrou
        ? `Parou no tick ${s.ticks.toLocaleString('pt-BR')} (cerca de ${Math.max(1, Math.round((s.ticks * 2) / 60))} min), quando a conta quebrou. Histórico baixado: ${quando(de)} a ${quando(ate)}.`
        : `${s.ticks.toLocaleString('pt-BR')} ticks reais, de ${quando(de)} a ${quando(ate)}. Cada tick do 75 Index leva cerca de 2 segundos.`}</p>
      {s.sequencias.length > 0 && <Sequencias seq={s.sequencias} />}
    </div>
  )
}

function Curva({ valores, quebrou }: { valores: number[]; quebrou: boolean }) {
  if (valores.length < 2) return <p className="lb-vazio">Poucas operações para desenhar a curva.</p>
  const L = 640, A = 170, m = 8
  const passo = Math.max(1, Math.floor(valores.length / 320))
  const pontos = valores.filter((_, i) => i % passo === 0 || i === valores.length - 1)
  const min = Math.min(0, ...pontos), max = Math.max(0, ...pontos)
  const y = (v: number) => m + (A - 2 * m) * (1 - (v - min) / (max - min || 1))
  const x = (i: number) => (i / (pontos.length - 1)) * L
  const linha = pontos.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = `${linha} L${L} ${y(0)} L0 ${y(0)} Z`
  const final = pontos[pontos.length - 1]
  return (
    <figure className="lb-curva">
      <figcaption>Resultado acumulado, operação a operação</figcaption>
      <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" role="img" aria-label={`Curva do resultado: termina em ${usd(final, true)}`}>
        <line x1="0" x2={L} y1={y(0)} y2={y(0)} className="zero" />
        <path d={area} className={final >= 0 ? 'area up' : 'area down'} />
        <path d={linha} className={final >= 0 ? 'linha up' : 'linha down'} fill="none" />
        <circle cx={x(pontos.length - 1)} cy={y(final)} r="4" className={quebrou ? 'fim down' : final >= 0 ? 'fim up' : 'fim down'} />
      </svg>
      <div className="lb-curva-eixo"><span>{usd(max, true)}</span><span>{usd(min, true)}</span></div>
    </figure>
  )
}

function Sequencias({ seq }: { seq: number[] }) {
  const max = Math.max(...seq, 1)
  return (
    <div className="lb-seqs">
      <h4>Quantas vezes cada sequência de perdas aconteceu</h4>
      <div className="lb-barras">
        {seq.map((n, i) => (
          <div key={i} className={i + 1 >= 5 ? 'alto' : ''} title={`${n} vez(es) com ${i + 1} perda(s) seguida(s)`}>
            <em>{n}</em><i style={{ height: `${Math.max(3, (n / max) * 100)}%` }} /><b>{i + 1}</b>
          </div>
        ))}
      </div>
      <small className="lb-sutil">Perdas seguidas até ganhar ou desistir. As da direita são as que pesam na escada.</small>
    </div>
  )
}

function Termometro({ escada, saldo, base }: { escada: ReturnType<typeof escadaDaReceita>; saldo: number; base: number }) {
  const [aberto, setAberto] = useState(false)
  const aguenta = saldo > 0 ? escada.filter((d) => d.saldoParaAguentar <= saldo).length : escada.length
  const posicao = Math.min(100, (aguenta / Math.max(1, escada.length)) * 100)
  return (
    <div className="lb-termometro">
      <h4>O termômetro da escada</h4>
      <p className="lb-sutil">Com entrada de {usd(base)}{saldo > 0 ? <> e saldo de {usd(saldo)}, a conta aguenta <b>{aguenta} {aguenta === 1 ? 'perda seguida' : 'perdas seguidas'}</b>{aguenta >= escada.length ? ' ou mais' : ''}.</> : '.'} A mesma conta da escada do motor, com o pagamento cotado.</p>
      <div className="lb-term-barra" aria-hidden="true"><i style={{ left: `${posicao}%` }} /></div>
      <button type="button" className="lb-link" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>{aberto ? 'Esconder a escada' : 'Ver a escada passo a passo'}</button>
      {aberto && (
        <div className="lb-tabela">
          <table>
            <thead><tr><th>Perdas seguidas</th><th>Próxima compra</th><th>Perda acumulada</th><th>Saldo para aguentar</th></tr></thead>
            <tbody>
              {escada.map((d) => (
                <tr key={d.perdas} className={saldo > 0 && d.saldoParaAguentar > saldo ? 'estoura' : ''}>
                  <td>{d.perdas}</td><td>{usd(d.proximaEntrada)}</td><td>{usd(d.perdaAcumulada)}</td><td>{usd(d.saldoParaAguentar)}{saldo > 0 && d.saldoParaAguentar > saldo && <em> não cabe</em>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------ ícones */

function IconeGatilho({ tipo }: { tipo: Gatilho['tipo'] }) {
  const d: Record<Gatilho['tipo'], string> = {
    lossVirtual: 'M4 12h3l2-5 3 10 2-5h6',
    sequencia: 'M4 17h3V9H4zM10.5 17h3V5h-3zM17 17h3v-6h-3z',
    ausencia: 'M12 21a9 9 0 100-18 9 9 0 000 18zM5.6 5.6l12.8 12.8',
    frequencia: 'M4 20V10M9 20V4M14 20v-7M19 20v-4',
    sempre: 'M13 3L4 14h7l-1 7 9-11h-7z',
  }
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="lb-ic"><path d={d[tipo]} /></svg>
}

