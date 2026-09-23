import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import { IDENTIDADES, identidade as identidadeDoRobo, type Identidade } from '../core/deriv/branding'
import type { ActiveSymbol } from '../core/deriv/types'
import { Emblema } from './RobotCard'
import { MODOS, NOME_DO_MODO, recuperacaoDoRobo, temModos, type Modo } from '../core/deriv/strategies'
import { RobotCatalog } from './RobotCatalog'
import { useParametrosDoRobo, useRobosDisponiveis } from '../core/teeds/catalogoRobos'
import { descrever, type ParametrosDoRobo } from '../core/deriv/parametros'
import { RobotDialog } from './RobotDialog'
import './robot-launch.css'
import { IconeFechar } from './IconeFechar'

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
export function lerPreparo(): { cfg?: Partial<ConfigEstrategia>; symbol?: string; modelo?: string; modo?: Modo } {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
  } catch { return {} }
}
type ChaveNumerica = Exclude<keyof ConfigEstrategia, 'lucroSobrePrejuizo' | 'parametros' | 'parametrosVersao' | 'parametrosTesteDemo' | 'modo'>
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


export const ETAPAS_PREPARO = [
  { key: 'valorAoVencer', titulo: 'Qual o valor de cada entrada?', ajuda: 'É a entrada base. A recuperação do modelo pode aumentar as entradas seguintes.', min: .35, max: 10_000, atalhos: [.35, 1, 2, 5] },
  { key: 'takeProfit', titulo: 'Qual é a meta de ganho?', ajuda: 'O robô para quando o resultado da sessão atingir esta meta. Zero desativa este limite.', min: 0, max: 10_000, atalhos: [5, 10, 25, 50] },
  { key: 'stopLoss', titulo: 'Qual é o limite de perda?', ajuda: 'O motor também verifica a próxima entrada: pode parar antes do limite para não ultrapassá-lo. Zero desativa este freio.', min: 0, max: 10_000, atalhos: [5, 10, 25, 50] },
  { key: 'maxOperacoes', titulo: 'Quantas operações no máximo?', ajuda: 'A sessão termina ao atingir essa quantidade ou um dos limites anteriores. Zero deixa a quantidade sem limite.', min: 0, max: 5_000, atalhos: [0, 50, 100, 200] },
] as const

export function valorDePreparo(texto: string, min: number, max: number, inteiro = false): number | null {
  if (!texto.trim() || !/^\d+(?:[.,]\d{0,2})?$/.test(texto.trim())) return null
  const n = Number(texto.replace(',', '.'))
  return Number.isFinite(n) && n >= min && n <= max && (!inteiro || Number.isInteger(n)) ? n : null
}

/** Os dois botões do passo de modo. */
export const OPCOES_DE_MODO: Array<{ id: Modo; nome: string; frase: string }> = [
  { id: 'conservador', nome: `Modo ${NOME_DO_MODO.conservador}`, frase: 'Recuperação de sempre: a sequência fecha recuperando as perdas.' },
  { id: 'agressivo', nome: `Modo ${NOME_DO_MODO.agressivo}`, frase: 'Recuperação maior: quanto mais fundo a sequência for, mais lucro ela devolve ao fechar.' },
]

/**
 * `parametros` são os publicados pelo painel para este robô (quando o
 * catálogo já carregou): a recuperação e o passo Modo saem deles. Não vão
 * dentro da config — o servidor é quem grava os vigentes por cima.
 */
export function configurarPreparo(inicial: ConfigEstrategia, valores: Record<string, string>, modeloId: string, modo: Modo = 'conservador', parametros?: ParametrosDoRobo): ConfigEstrategia | null {
  if (!ETAPAS_PREPARO.every(e => valorDePreparo(valores[e.key] ?? '', e.min, e.max, e.key === 'maxOperacoes') !== null)) return null
  const rec = recuperacaoDoRobo(modeloId, temModos(modeloId, parametros) ? modo : 'conservador', parametros)
  const cfg = { ...inicial, ...Object.fromEntries(ETAPAS_PREPARO.map(e => [e.key, valorDePreparo(valores[e.key], e.min, e.max, e.key === 'maxOperacoes')!])) } as ConfigEstrategia
  return { ...cfg, valorInicial: cfg.valorAoVencer, valorMaximo: 0, fatorGale: rec.margem, lucroSobrePrejuizo: rec.sobrePrejuizo, galeApos: rec.galeApos }
}

export function RobotSetup({ identidade, symbols, configInicial, moeda, isDemo, contaId, escolherModelo = false, onCancelar, onLigar, ligando = false, erro }: Props) {
  const disponiveis = useRobosDisponiveis()
  const [modelo, setModelo] = useState(() => {
    // Preferência já salva no próprio preparo; a calculadora não escreve aqui.
    const pedido = escolherModelo ? lerPreparo().modelo : undefined
    return pedido && IDENTIDADES.some((i) => i.id === pedido) ? identidadeDoRobo(pedido) : identidade
  })
  const inicial = useMemo(() => sanear({ ...configInicial, ...lerPreparo().cfg, valorMaximo: 0 }, configInicial), [])
  const [valores, setValores] = useState(() => Object.fromEntries(ETAPAS_PREPARO.map(e => [e.key, String(inicial[e.key])])))
  const [modo, setModo] = useState<Modo>(() => lerPreparo().modo === 'agressivo' ? 'agressivo' : 'conservador')
  // -1 is the model picker; when the model has modes, 0 is the mode choice;
  // then one input per step; the last step is the review.
  const [passo, setPasso] = useState(escolherModelo ? -1 : 0)
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
  const desloc = comModo ? 1 : 0
  const passoModo = comModo && passo === 0
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
  const voltar = () => { if (ligando) return; setConfirmaReal(false); setPasso(p => p - 1) }
  function iniciar() {
    if (submitted.current || ligando || !todasValidas || (!isDemo && !confirmaReal)) return
    submitted.current = true
    const cfg = configurarPreparo(inicial, valores, modelo.id, modo, parametros)
    if (!cfg) { submitted.current = false; return }
    try { localStorage.setItem(CHAVE, JSON.stringify({ cfg, symbol: ATIVO_DOS_ROBOS, modo })) } catch { /* optional browser preferences */ }
    onLigar(cfg, ATIVO_DOS_ROBOS, modelo)
  }
  return <RobotDialog label="Configurar robô" busy={ligando} onCancel={onCancelar}>
    <form className={`robot-launch ${passo === -1 ? 'picking' : ''}`} onSubmit={e => {
      e.preventDefault()
      // Enter in a value field advances once, but can never send an order.
      if (!revisao && valido && !ligando) setPasso(p => p + 1)
    }} onKeyDown={e => { if (e.key === 'Enter' && (e.repeat || e.nativeEvent.isComposing)) e.preventDefault() }}>
      <header className="robot-launch-top">
        <div className="robot-launch-title"><Emblema id={modelo} tamanho={32} /><div><b>{passo === -1 ? 'Novo robô' : modelo.nome}</b><span>Preparar sessão</span></div></div>
        <button type="button" className="robot-launch-close" onClick={onCancelar} disabled={ligando} aria-label="Cancelar configuração"><IconeFechar /></button>
      </header>
      <div className="robot-launch-progress" aria-label={`Etapa ${numero} de ${quantidade}`}><span style={{ width: `${numero / quantidade * 100}%` }} /></div>
      <div className="robot-launch-body" ref={scrollRef}>
        <span className="robot-launch-step">ETAPA {numero} DE {quantidade} · {passo === -1 ? 'MODELO' : passoModo ? 'MODO' : revisao ? 'REVISÃO' : 'SEUS LIMITES'}</span>
        <h3 ref={titleRef} tabIndex={-1}>{passo === -1 ? 'Escolha seu robô.' : passoModo ? 'Como o robô deve operar?' : revisao ? 'Revise. Depois, dê o play.' : etapa?.titulo}</h3>
        {passo === -1 ? <RobotCatalog selected={modelo.id} onSelect={setModelo} /> : passoModo ? <div className="robot-launch-question robot-launch-modos" role="radiogroup" aria-label="Modo de operação">
          {OPCOES_DE_MODO.map(o => <button type="button" key={o.id} role="radio" aria-checked={modo === o.id} className={`robot-launch-modo ${o.id}`} onClick={() => setModo(o.id)}>
            <strong>{o.nome}</strong><span>{o.frase}</span>
          </button>)}
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
          <p>{parametros ? descrever(modelo.id, parametros) : modelo.descricao}</p>
          <dl><div><dt>Ativo</dt><dd>{nomeAtivo.replace(' Index', '')}</dd></div>{comModo && <div><dt>Modo</dt><dd>{NOME_DO_MODO[modo]}<button type="button" onClick={() => { setConfirmaReal(false); setPasso(0) }} disabled={ligando} aria-label="Editar modo de operação">Editar</button></dd></div>}{ETAPAS_PREPARO.map((e, i) => <div key={e.key}><dt>{['Entrada base', 'Meta de ganho', 'Limite de perda', 'Máximo de operações'][i]}</dt><dd>{Number(valores[e.key].replace(',', '.')) === 0 ? 'Sem limite' : e.key === 'maxOperacoes' ? valores[e.key] : din(Number(valores[e.key].replace(',', '.')), moeda)}<button type="button" onClick={() => { setConfirmaReal(false); setPasso(i + desloc) }} disabled={ligando} aria-label={`Editar ${e.titulo}`}>Editar</button></dd></div>)}</dl>
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
        <span>{passo === -1 ? modelo.nome : revisao ? '' : 'Nada será operado ainda'}</span>
        {revisao ? <button type="button" className="robot-launch-next" disabled={ligando || !todasValidas || (!isDemo && !confirmaReal)} onClick={iniciar}>{ligando ? 'Iniciando…' : <span className="robot-launch-go"><svg className="icone-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor" /></svg>Iniciar robô</span>}</button>
          : <button type="submit" className="robot-launch-next" disabled={!valido || ligando}>Continuar <span aria-hidden="true">→</span></button>}
      </footer>
    </form>
  </RobotDialog>
}
