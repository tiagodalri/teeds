import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import { IDENTIDADES, identidade as identidadeDoRobo, type Identidade } from '../core/deriv/branding'
import type { ActiveSymbol } from '../core/deriv/types'
import { Emblema } from './RobotCard'
import { MODOS, NOME_DO_MODO, recuperacaoDoRobo, temModos, type Modo } from '../core/deriv/strategies'
import { ETAPAS_PREPARO, valorDePreparo, OPCOES_DE_MODO, configurarPreparo } from '../core/deriv/preparo'
import { RobotCatalog } from './RobotCatalog'
import { useParametrosDoRobo, useRobosDisponiveis } from '../core/teeds/catalogoRobos'
import { descrever, type ParametrosDoRobo } from '../core/deriv/parametros'
import { RobotDialog } from './RobotDialog'
import './robot-launch.css'
import { IconeFechar } from './IconeFechar'
import { NomeDoRobo } from './NomeDoRobo'
import { Monograma, TEM_MONOGRAMA } from './marca/Monograma'

interface Props {
  identidade: Identidade
  nomeEstrategia: string
  symbols: ActiveSymbol[]
  symbolInicial: string
  configInicial: ConfigEstrategia
  moeda: string
  isDemo: boolean
  contaId?: string | null
  escolherModelo?: boolean
  onCancelar: () => void
  onLigar: (cfg: ConfigEstrategia, symbol: string, modelo?: Identidade) => void
  ligando?: boolean
  erro?: string | null
}
const CHAVE = 'teeds.robo.preparo'
const din = (v: number, m = 'USD') => `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
export function lerPreparo(): { cfg?: Partial<ConfigEstrategia>; symbol?: string; modelo?: string; modo?: Modo; lossVirtual?: Record<string, number> } {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
  } catch { return {} }
}
type ChaveNumerica = Exclude<keyof ConfigEstrategia, 'lucroSobrePrejuizo' | 'parametros' | 'parametrosVersao' | 'parametrosTesteDemo' | 'modo' | 'lossVirtualCliente'>
/** O loss virtual que o cliente pode escolher: 0 (sem) até este teto (o mesmo do painel). */
const LOSS_VIRTUAL_MAXIMO = 12
const FAIXAS: Record<ChaveNumerica, [number, number]> = {
  valorInicial: [0.35, 10_000],
  valorAoVencer: [0.35, 10_000],
  fatorGale: [0, 3],
  galeApos: [1, 20],
  valorMaximo: [0, 50_000],   // 0 = sem teto
  takeProfit: [0, 10_000],
  stopLoss: [0, 10_000],
  maxOperacoes: [0, 5_000],   // 0 = sem limite
}

function sanear(cfg: ConfigEstrategia, padrao: ConfigEstrategia): ConfigEstrategia {
  const limpo = { ...cfg }
  for (const chave of Object.keys(FAIXAS) as ChaveNumerica[]) {
    const [min, max] = FAIXAS[chave]
    const v = Number(limpo[chave])
    if (!Number.isFinite(v) || v < min || v > max) limpo[chave] = padrao[chave]
  }
  if (limpo.valorMaximo > 0 && limpo.valorMaximo < limpo.valorAoVencer) limpo.valorMaximo = limpo.valorAoVencer
  // O fator de recuperação nunca vem daqui: configurarPreparo o tira da
  // tabela do robô, conforme o modo escolhido.
  return limpo
}


// A lógica pura do preparo mora em core/deriv/preparo.ts: o teste do servidor
// precisa dela e não pode arrastar o React junto (ver o cabeçalho de lá).
// Reexportado aqui para quem já importava deste arquivo.
export { ETAPAS_PREPARO, valorDePreparo, OPCOES_DE_MODO, configurarPreparo } from '../core/deriv/preparo'

/** O cartão da vitrine pede um robô; o próximo preparo que abrir já começa nele. */
let modeloDaVitrine: string | null = null
export const pedirModeloDaVitrine = (id: string) => { modeloDaVitrine = id }

export function RobotSetup({ identidade, symbols, configInicial, moeda, isDemo, contaId, escolherModelo = false, onCancelar, onLigar, ligando = false, erro }: Props) {
  const disponiveis = useRobosDisponiveis()
  // Escolhido no cartão da vitrine: o preparo já abre nele (o catálogo continua a um "Voltar").
  // (lê sem apagar: o React de desenvolvimento chama esta função duas vezes; apaga depois de montar)
  const [daVitrine] = useState(() => {
    const v = modeloDaVitrine
    return escolherModelo && v && IDENTIDADES.some((i) => i.id === v) ? v : null
  })
  useEffect(() => { modeloDaVitrine = null }, [])
  const [modelo, setModelo] = useState(() => {
    // Preferência já salva no próprio preparo; a calculadora não escreve aqui.
    const pedido = daVitrine ?? (escolherModelo ? lerPreparo().modelo : undefined)
    return pedido && IDENTIDADES.some((i) => i.id === pedido) ? identidadeDoRobo(pedido) : identidade
  })
  const inicial = useMemo(() => sanear({ ...configInicial, ...lerPreparo().cfg, valorMaximo: 0 }, configInicial), [])
  const [valores, setValores] = useState(() => Object.fromEntries(ETAPAS_PREPARO.map(e => [e.key, String(inicial[e.key])])))
  const [modo, setModo] = useState<Modo>(() => lerPreparo().modo === 'agressivo' ? 'agressivo' : 'conservador')
  // -1 is the model picker; when the model has modes, 0 is the mode choice;
  // then one input per step; the last step is the review.
  const [passo, setPasso] = useState(escolherModelo && !daVitrine ? -1 : 0)
  useEffect(() => {
    if (escolherModelo && disponiveis?.length && !disponiveis.includes(modelo.id)) {
      setModelo(identidadeDoRobo(disponiveis[0])); setPasso(-1)
    }
  }, [disponiveis, escolherModelo, modelo.id])
  const [confirmaReal, setConfirmaReal] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const submitted = useRef(false)
  // O que este robô está rodando hoje na marca. Na conta demo vale a regra em
  // teste, quando houver — é a que o servidor vai aplicar nesta sessão.
  const dados = useParametrosDoRobo(modelo.id)
  const parametros = dados ? (isDemo && dados.testeDemo ? dados.testeDemo : dados.parametros) : undefined
  const comModo = temModos(modelo.id, parametros)
  /*
    Loss virtual à escolha do cliente (21/10/2026, pedido do Tiago): nos robôs
    que entram por loss virtual, a pessoa escolhe sem ou com, e quantos (de 1
    para cima). Só aparece quando o servidor avisa que aceita a escolha
    (`lossVirtualAjustavel` no catálogo): servidor antigo ignoraria o número.
  */
  const lvDoPainel = parametros?.entrada.lossVirtual ?? 0
  const comLV = !!dados?.lossVirtualAjustavel && lvDoPainel > 0
  const [lvEscolhido, setLvEscolhido] = useState<Record<string, number>>(() => lerPreparo().lossVirtual ?? {})
  const lv = Math.min(LOSS_VIRTUAL_MAXIMO, Math.max(0, Math.trunc(lvEscolhido[modelo.id] ?? lvDoPainel)))
  const escolherLv = (n: number) => setLvEscolhido((m) => ({ ...m, [modelo.id]: Math.min(LOSS_VIRTUAL_MAXIMO, Math.max(0, n)) }))
  // a regra que a revisão descreve já com a escolha da pessoa
  const regra = parametros && comLV ? { ...parametros, entrada: { ...parametros.entrada, lossVirtual: lv } } : parametros
  const posLV = comModo ? 1 : 0
  const desloc = (comModo ? 1 : 0) + (comLV ? 1 : 0)
  const passoModo = comModo && passo === 0
  const passoLV = comLV && passo === posLV
  const etapa = passo - desloc >= 0 && passo - desloc < ETAPAS_PREPARO.length ? ETAPAS_PREPARO[passo - desloc] : null
  const revisao = passo === ETAPAS_PREPARO.length + desloc
  const minimo = etapa?.key === 'stopLoss' && !isDemo ? Number(valores.valorAoVencer.replace(',', '.')) : etapa?.min ?? 0
  const valido = !etapa || valorDePreparo(valores[etapa.key], minimo, etapa.max, etapa.key === 'maxOperacoes') !== null
  const nomeAtivo = symbols.find(s => s.symbol === ATIVO_DOS_ROBOS)?.name ?? ATIVO_DOS_ROBOS
  const todasValidas = (disponiveis === null || disponiveis.includes(modelo.id)) && ETAPAS_PREPARO.every(e => valorDePreparo(valores[e.key], e.min, e.max, e.key === 'maxOperacoes') !== null)
    && (isDemo || Number(valores.stopLoss.replace(',', '.')) >= Number(valores.valorAoVencer.replace(',', '.')))
  const quantidade = ETAPAS_PREPARO.length + 1 + desloc + (escolherModelo ? 1 : 0)
  const numero = passo + (escolherModelo ? 2 : 1)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
    if (inputRef.current) { inputRef.current.focus(); inputRef.current.select() } else titleRef.current?.focus()
  }, [passo])
  useEffect(() => { if (!ligando) submitted.current = false }, [ligando, erro])
  /*
    Os segundos correndo no botão.

    Quando a Deriv engasga, ligar demora — e um "Iniciando…" parado parece
    travado. O relógio mostra que a tela continua esperando, e depois de 12 s
    ela diz por quê. (24/09/2026, a pedido do Tiago.)
  */
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    if (!ligando) { setSegundos(0); return }
    const inicio = Date.now()
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000)
    return () => clearInterval(id)
  }, [ligando])
  const voltar = () => { if (ligando) return; setConfirmaReal(false); setPasso(p => p - 1) }
  function iniciar() {
    if (submitted.current || ligando || !todasValidas || (!isDemo && !confirmaReal)) return
    submitted.current = true
    const preparada = configurarPreparo(inicial, valores, modelo.id, modo, parametros)
    if (!preparada) { submitted.current = false; return }
    const cfg: ConfigEstrategia = comLV ? { ...preparada, lossVirtualCliente: lv } : preparada
    const { lossVirtualCliente: _lv, ...paraGuardar } = cfg
    void _lv
    try { localStorage.setItem(CHAVE, JSON.stringify({ cfg: paraGuardar, symbol: ATIVO_DOS_ROBOS, modo, lossVirtual: lvEscolhido })) } catch { /* optional browser preferences */ }
    onLigar(cfg, ATIVO_DOS_ROBOS, modelo)
  }
  return <RobotDialog label="Configurar robô" busy={ligando} onCancel={onCancelar}>
    <form className={`robot-launch ${passo === -1 ? 'picking' : ''}`} onSubmit={e => {
      e.preventDefault()
      // Enter in a value field advances once, but can never send an order.
      if (!revisao && valido && !ligando) setPasso(p => p + 1)
    }} onKeyDown={e => { if (e.key === 'Enter' && (e.repeat || e.nativeEvent.isComposing)) e.preventDefault() }}>
      <header className="robot-launch-top">
        <div className="robot-launch-title"><Emblema id={modelo} tamanho={32} /><div><b>{passo === -1 ? 'Novo robô' : <NomeDoRobo nome={modelo.nome} />}</b><span className="robot-launch-sub">Preparar sessão</span></div></div>
        <button type="button" className="robot-launch-close" onClick={onCancelar} disabled={ligando} aria-label="Cancelar configuração"><IconeFechar /></button>
      </header>
      <div className="robot-launch-progress" role="progressbar" aria-label={`Etapa ${numero} de ${quantidade}`} aria-valuemin={1} aria-valuemax={quantidade} aria-valuenow={numero}>
        {Array.from({ length: quantidade }, (_, i) => <i key={i} className={i < numero ? 'feito' : ''} />)}
      </div>
      {TEM_MONOGRAMA && <Monograma variante="marca-dagua" tamanho={240} className="robot-launch-dagua" />}
      <div className="robot-launch-body" ref={scrollRef}>
        <span className="robot-launch-step">ETAPA {numero} DE {quantidade} · {passo === -1 ? 'MODELO' : passoModo ? 'MODO' : passoLV ? 'LOSS VIRTUAL' : revisao ? 'REVISÃO' : 'SEUS LIMITES'}</span>
        <h3 ref={titleRef} tabIndex={-1}>{passo === -1 ? 'Escolha seu robô.' : passoModo ? 'Como o robô deve operar?' : passoLV ? 'Quando o robô deve entrar?' : revisao ? 'Revise. Depois, dê o play.' : etapa?.titulo}</h3>
        {passo === -1 ? <RobotCatalog selected={modelo.id} onSelect={setModelo} /> : passoModo ? <div className="robot-launch-question robot-launch-modos" role="radiogroup" aria-label="Modo de operação">
          {OPCOES_DE_MODO.map(o => <button type="button" key={o.id} role="radio" aria-checked={modo === o.id} className={`robot-launch-modo ${o.id}`} onClick={() => setModo(o.id)}>
            <strong>{o.nome}</strong><span>{o.frase}</span>
          </button>)}
        </div> : passoLV ? <div className="robot-launch-question robot-launch-lv">
          <p id="robot-step-help">O loss virtual é a análise antes da entrada: o robô observa o mercado e só entra depois de uma sequência de dígitos que teriam perdido, sem operar dinheiro nenhum nessa espera.</p>
          <div className="robot-launch-modos" role="radiogroup" aria-label="Loss virtual">
            <button type="button" role="radio" aria-checked={lv === 0} className="robot-launch-modo sem-lv" onClick={() => escolherLv(0)}>
              <strong>Sem loss virtual</strong><span>Entra em toda operação, sem esperar a sequência.</span>
            </button>
            <button type="button" role="radio" aria-checked={lv > 0} className="robot-launch-modo com-lv" onClick={() => escolherLv(lv > 0 ? lv : lvDoPainel || 1)}>
              <strong>Com loss virtual</strong><span>Analisa e só entra depois dos dígitos seguidos que você escolher.</span>
            </button>
          </div>
          {lv > 0 && <div className="robot-launch-lv-qtd">
            <div className="robot-launch-lv-linha">
              <span id="robot-lv-rotulo">Quantos dígitos seguidos esperar</span>
              <div className="robot-launch-stepper" role="group" aria-labelledby="robot-lv-rotulo">
                <button type="button" onClick={() => escolherLv(lv - 1)} disabled={lv <= 1} aria-label="Esperar um dígito a menos">−</button>
                <output aria-live="polite">{lv}</output>
                <button type="button" onClick={() => escolherLv(lv + 1)} disabled={lv >= LOSS_VIRTUAL_MAXIMO} aria-label="Esperar um dígito a mais">+</button>
              </div>
            </div>
            <div className="robot-launch-casas" aria-hidden="true">{Array.from({ length: lv }, (_, i) => <i key={i} />)}</div>
            <p className="robot-launch-hint">{lv === lvDoPainel ? `${lv} é o padrão da plataforma para este robô.` : `O padrão da plataforma para este robô é ${lvDoPainel}.`} Quanto mais dígitos, mais o robô espera e menos vezes ele entra.</p>
          </div>}
        </div> : etapa ? <div className="robot-launch-question" key={etapa.key}>
          <p id="robot-step-help">{etapa.key === 'stopLoss' && !isDemo ? 'Na conta real, o limite de perda é obrigatório e não pode ser menor que a entrada. O motor pode parar antes para impedir que a próxima entrada ultrapasse esse valor.' : etapa.ajuda}</p>
          <label className="robot-launch-number"><span className="sr-only">{etapa.titulo}</span>
            <input ref={inputRef} aria-describedby="robot-step-help" aria-invalid={!valido} autoComplete="off" inputMode={etapa.key === 'maxOperacoes' ? 'numeric' : 'decimal'}
              value={valores[etapa.key]} onFocus={e => e.currentTarget.select()}
              onChange={e => setValores(v => ({ ...v, [etapa.key]: e.target.value }))} />
            <span>{etapa.key === 'maxOperacoes' ? 'operações' : moeda}</span>
          </label>
          <div className="robot-launch-presets">{etapa.atalhos.map(v => <button type="button" key={v} aria-pressed={Number(valores[etapa.key].replace(',', '.')) === v}
            onClick={() => setValores(prev => ({ ...prev, [etapa.key]: String(v) }))}>{etapa.key === 'maxOperacoes' ? v === 0 ? 'Sem limite' : v : din(v, '')}</button>)}</div>
          <p className={valido ? 'robot-launch-hint' : 'robot-launch-error'} role={!valido ? 'status' : undefined}>
            {valido ? etapa.key === 'valorAoVencer' ? `Mínimo: ${din(.35, moeda)} por entrada.` : Number(valores[etapa.key].replace(',', '.')) === 0 ? 'Este limite está desativado.' : 'Você pode voltar e ajustar antes de iniciar.' : `Informe ${etapa.key === 'maxOperacoes' ? 'um número inteiro' : 'um valor'} de ${minimo.toLocaleString('pt-BR')} a ${etapa.max.toLocaleString('pt-BR')}.`}
          </p>
        </div> : <div className="robot-launch-review">
          <p>{regra ? descrever(modelo.id, regra) : modelo.descricao}</p>
          <div className="robot-launch-bilhete">
          <div className="robot-launch-bilhete-topo">
            {TEM_MONOGRAMA ? <Monograma tamanho={30} /> : <Emblema id={modelo} tamanho={26} />}
            <span><small>Sessão</small><b>{TEM_MONOGRAMA ? modelo.nome.replace(/^(GF|GlobalFly)\s+/i, '') : <NomeDoRobo nome={modelo.nome} />}</b></span>
            <span className="robot-launch-bilhete-conta"><small>Conta</small><b>{isDemo ? 'Demo' : 'Real'}</b></span>
          </div>
          <i className="robot-launch-picote" aria-hidden="true" />
          <dl><div><dt>Ativo</dt><dd>{nomeAtivo.replace(' Index', '')}</dd></div>{comModo && <div><dt>Modo</dt><dd>{NOME_DO_MODO[modo]}<button type="button" onClick={() => { setConfirmaReal(false); setPasso(0) }} disabled={ligando} aria-label="Editar modo de operação">Editar</button></dd></div>}{comLV && <div><dt>Loss virtual</dt><dd>{lv === 0 ? 'Sem' : `${lv} ${lv === 1 ? 'dígito' : 'dígitos'}`}<button type="button" onClick={() => { setConfirmaReal(false); setPasso(posLV) }} disabled={ligando} aria-label="Editar loss virtual">Editar</button></dd></div>}{ETAPAS_PREPARO.map((e, i) => <div key={e.key}><dt>{['Entrada base', 'Meta de ganho', 'Limite de perda', 'Máximo de operações'][i]}</dt><dd>{Number(valores[e.key].replace(',', '.')) === 0 ? 'Sem limite' : e.key === 'maxOperacoes' ? valores[e.key] : din(Number(valores[e.key].replace(',', '.')), moeda)}<button type="button" onClick={() => { setConfirmaReal(false); setPasso(i + desloc) }} disabled={ligando} aria-label={`Editar ${e.titulo}`}>Editar</button></dd></div>)}</dl>
          </div>
          <p className="robot-launch-risk">A recuperação pode aumentar o valor das entradas. Os robôs desta conta compartilham o saldo. Não há garantia de lucro.</p>
          {isDemo && dados?.testeDemo && <p className="robot-launch-risk">Este robô roda uma regra em teste nas contas demo.</p>}
        </div>}
        {erro && <p className="robot-launch-error" role="alert">{erro}</p>}
        {revisao && !todasValidas && <p className="robot-launch-error" role="alert">Revise os valores acima. Na conta real, o limite de perda precisa ser pelo menos igual à entrada base.</p>}
      </div>
      {/* A confirmação de conta real vive FORA da área que rola (22/09/2026):
          escondida embaixo do texto, ela fazia o botão "Iniciar robô" parecer
          travado — ninguém adivinha que precisa rolar para achá-la. */}
      {revisao && !isDemo && (
        <label className="robot-launch-consent">
          <input type="checkbox" checked={confirmaReal} disabled={ligando} onChange={e => setConfirmaReal(e.target.checked)} />
          <span>Entendo que esta sessão usará <strong>dinheiro real</strong> e confirmo os valores acima.</span>
        </label>
      )}
      <footer className="robot-launch-footer">
        <button type="button" className="robot-launch-back" disabled={ligando} onClick={passo === (escolherModelo ? -1 : 0) ? onCancelar : voltar}>{passo === (escolherModelo ? -1 : 0) ? 'Cancelar' : '← Voltar'}</button>
        <span>{ligando && segundos >= 12 ? 'A Deriv está lenta agora. Seguimos tentando — não clique de novo.' : passo === -1 ? modelo.nome : revisao ? '' : 'Nada será operado ainda'}</span>
        {revisao ? <button type="button" className="robot-launch-next" disabled={ligando || !todasValidas || (!isDemo && !confirmaReal)} onClick={iniciar}>{ligando ? `Iniciando… ${segundos}s` : <span className="robot-launch-go"><svg className="icone-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor" /></svg>Iniciar robô</span>}</button>
          : <button type="submit" className="robot-launch-next" disabled={!valido || ligando}>Continuar <span aria-hidden="true">→</span></button>}
      </footer>
    </form>
  </RobotDialog>
}
