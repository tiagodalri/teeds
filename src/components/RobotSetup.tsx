import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import type { Identidade } from '../core/deriv/branding'
import type { ActiveSymbol } from '../core/deriv/types'
import { Emblema } from './RobotCard'
import { recuperacaoDoRobo } from '../core/deriv/strategies'
import { RobotCatalog } from './RobotCatalog'
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
export function lerPreparo(): { cfg?: Partial<ConfigEstrategia>; symbol?: string } {
  try {
    const valor = JSON.parse(localStorage.getItem(CHAVE) || '{}')
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : {}
  } catch { return {} }
}
const FAIXAS: Record<keyof ConfigEstrategia, [number, number]> = {
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
  for (const chave of Object.keys(FAIXAS) as Array<keyof ConfigEstrategia>) {
    const [min, max] = FAIXAS[chave]
    const v = Number(limpo[chave])
    if (!Number.isFinite(v) || v < min || v > max) limpo[chave] = padrao[chave]
  }
  if (limpo.valorMaximo > 0 && limpo.valorMaximo < limpo.valorAoVencer) limpo.valorMaximo = limpo.valorAoVencer
  // Migra a configuração antiga (70%/100% do prejuízo) para a nova margem
  // pequena sobre a entrada base, evitando manter uma progressão excessiva.
  if (limpo.fatorGale > 0.25) limpo.fatorGale = 0.05
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

export function configurarPreparo(inicial: ConfigEstrategia, valores: Record<string, string>, modeloId: string): ConfigEstrategia | null {
  if (!ETAPAS_PREPARO.every(e => valorDePreparo(valores[e.key] ?? '', e.min, e.max, e.key === 'maxOperacoes') !== null)) return null
  const rec = recuperacaoDoRobo(modeloId)
  const cfg = { ...inicial, ...Object.fromEntries(ETAPAS_PREPARO.map(e => [e.key, valorDePreparo(valores[e.key], e.min, e.max, e.key === 'maxOperacoes')!])) } as ConfigEstrategia
  return { ...cfg, valorInicial: cfg.valorAoVencer, valorMaximo: 0, fatorGale: rec.margem, galeApos: rec.galeApos }
}

export function RobotSetup({ identidade, symbols, configInicial, moeda, isDemo, contaId, escolherModelo = false, onCancelar, onLigar, ligando = false, erro }: Props) {
  const [modelo, setModelo] = useState(identidade)
  const inicial = useMemo(() => sanear({ ...configInicial, ...lerPreparo().cfg, valorMaximo: 0 }, configInicial), [])
  const [valores, setValores] = useState(() => Object.fromEntries(ETAPAS_PREPARO.map(e => [e.key, String(inicial[e.key])])))
  // -1 is the model picker; 0..3 contain exactly one input; 4 is review.
  const [passo, setPasso] = useState(escolherModelo ? -1 : 0)
  const [confirmaReal, setConfirmaReal] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const submitted = useRef(false)
  const etapa = passo >= 0 && passo < ETAPAS_PREPARO.length ? ETAPAS_PREPARO[passo] : null
  const revisao = passo === ETAPAS_PREPARO.length
  const minimo = etapa?.key === 'stopLoss' && !isDemo ? Number(valores.valorAoVencer.replace(',', '.')) : etapa?.min ?? 0
  const valido = !etapa || valorDePreparo(valores[etapa.key], minimo, etapa.max, etapa.key === 'maxOperacoes') !== null
  const nomeAtivo = symbols.find(s => s.symbol === ATIVO_DOS_ROBOS)?.name ?? ATIVO_DOS_ROBOS
  const todasValidas = ETAPAS_PREPARO.every(e => valorDePreparo(valores[e.key], e.min, e.max, e.key === 'maxOperacoes') !== null)
    && (isDemo || Number(valores.stopLoss.replace(',', '.')) >= Number(valores.valorAoVencer.replace(',', '.')))
  const quantidade = ETAPAS_PREPARO.length + 1 + (escolherModelo ? 1 : 0)
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
    const cfg = configurarPreparo(inicial, valores, modelo.id)
    if (!cfg) { submitted.current = false; return }
    try { localStorage.setItem(CHAVE, JSON.stringify({ cfg, symbol: ATIVO_DOS_ROBOS })) } catch { /* optional browser preferences */ }
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
        <span className="robot-launch-step">ETAPA {numero} DE {quantidade} · {passo === -1 ? 'MODELO' : revisao ? 'REVISÃO' : 'SEUS LIMITES'}</span>
        <h3 ref={titleRef} tabIndex={-1}>{passo === -1 ? 'Escolha seu robô.' : revisao ? 'Revise. Depois, dê o play.' : etapa?.titulo}</h3>
        {passo === -1 ? <RobotCatalog selected={modelo.id} onSelect={setModelo} /> : etapa ? <div className="robot-launch-question" key={etapa.key}>
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
          <p>{modelo.descricao}</p>
          <dl><div><dt>Ativo</dt><dd>{nomeAtivo.replace(' Index', '')}</dd></div>{ETAPAS_PREPARO.map((e, i) => <div key={e.key}><dt>{['Entrada base', 'Meta de ganho', 'Limite de perda', 'Máximo de operações'][i]}</dt><dd>{Number(valores[e.key].replace(',', '.')) === 0 ? 'Sem limite' : e.key === 'maxOperacoes' ? valores[e.key] : din(Number(valores[e.key].replace(',', '.')), moeda)}<button type="button" onClick={() => { setConfirmaReal(false); setPasso(i) }} disabled={ligando} aria-label={`Editar ${e.titulo}`}>Editar</button></dd></div>)}</dl>
          <p className="robot-launch-risk">A recuperação pode aumentar o valor das entradas. Os robôs desta conta compartilham o saldo. Não há garantia de lucro.</p>
          {!isDemo && <label className="robot-launch-consent"><input type="checkbox" checked={confirmaReal} disabled={ligando} onChange={e => setConfirmaReal(e.target.checked)} /><span>Entendo que esta sessão usará <strong>dinheiro real</strong> e confirmo os valores acima.</span></label>}
        </div>}
        {erro && <p className="robot-launch-error" role="alert">{erro}</p>}
        {revisao && !todasValidas && <p className="robot-launch-error" role="alert">Revise os valores acima. Na conta real, o limite de perda precisa ser pelo menos igual à entrada base.</p>}
      </div>
      <footer className="robot-launch-footer">
        <button type="button" className="robot-launch-back" disabled={ligando} onClick={passo === (escolherModelo ? -1 : 0) ? onCancelar : voltar}>{passo === (escolherModelo ? -1 : 0) ? 'Cancelar' : '← Voltar'}</button>
        <span>{passo === -1 ? modelo.nome : revisao ? '' : 'Nada será operado ainda'}</span>
        {revisao ? <button type="button" className="robot-launch-next" disabled={ligando || !todasValidas || (!isDemo && !confirmaReal)} onClick={iniciar}>{ligando ? 'Iniciando…' : <span className="robot-launch-go"><svg className="icone-play" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor" /></svg>Iniciar robô</span>}</button>
          : <button type="submit" className="robot-launch-next" disabled={!valido || ligando}>Continuar <span aria-hidden="true">→</span></button>}
      </footer>
    </form>
  </RobotDialog>
}
