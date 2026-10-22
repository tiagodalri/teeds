import { useEffect, useMemo, useRef, useState } from 'react'
import type { ConfigEstrategia } from '../core/deriv/engine'
import { ATIVO_DOS_ROBOS } from '../core/deriv/config'
import { IDENTIDADES, identidade as identidadeDoRobo, type Identidade } from '../core/deriv/branding'
import type { ActiveSymbol } from '../core/deriv/types'
import { Emblema } from './RobotCard'
import { NOME_DO_MODO, temModos, type Modo } from '../core/deriv/strategies'
import { ETAPAS_PREPARO, valorDePreparo, OPCOES_DE_MODO, configurarPreparo } from '../core/deriv/preparo'
import { RobotCatalog } from './RobotCatalog'
import { useParametrosDoRobo, useRobosDisponiveis } from '../core/teeds/catalogoRobos'
import { descrever, type ParametrosDoRobo } from '../core/deriv/parametros'
import { RobotDialog } from './RobotDialog'
import './robot-launch.css'
import './plano-de-voo.css'
import { nomeDoAtivo } from '../core/deriv/market'
import { planoDoDia } from '../core/teeds/planoDoDia'
import { MARCA } from '../marca'
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
  /** Acesso de demonstração: a conta virtual se apresenta como real (sem textos de demo). */
  demoComoReal?: boolean
  contaId?: string | null
  escolherModelo?: boolean
  onCancelar: () => void
  onLigar: (cfg: ConfigEstrategia, symbol: string, modelo?: Identidade) => void
  ligando?: boolean
  erro?: string | null
}
const CHAVE = 'teeds.robo.preparo'
// US$ em toda a tela (o mesmo símbolo dos mostradores)
const din = (v: number, m = 'USD') => `${m === 'USD' ? 'US$' : m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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

/* ------------------------------------------------------------------
   O "Plano de voo" (21/10/2026, aprovado em mockup pelo Tiago): o preparo
   saiu de 7 telas (uma pergunta por tela) para 3 passos:
     1. Escolha a I.A. (a frota em foto; quem veio da home já pula);
     2. Plano de voo: modo, loss virtual, entrada, meta e limite numa tela
        só, com o arco do limite à meta e o que o limite aguenta de verdade
        (a escada do próprio robô);
     3. Decolar: o cartão de embarque e o "Iniciar robô".
   O máximo de operações saiu (pedido do Tiago): a sessão para pela meta ou
   pelo limite de perda. Tudo o que já valia continua: conta real com
   confirmação, limite nunca menor que a entrada na real, loss virtual só
   quando o servidor aceita, preparo aberto no robô pedido pela home.
   ------------------------------------------------------------------ */
type Passo = 'escolha' | 'plano' | 'decolar'
const FOTOS = `${import.meta.env.BASE_URL}robos-globalfly/`
const TEM_FOTOS = MARCA.id === 'globalfly'
/** Nos campos, sem ponto de milhar ("1500,00"): é o formato que a validação do preparo aceita. */
const n2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })
const ler = (t: string) => { const v = Number(t.trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN }
/** O passo dos botões − e +: pequeno nos valores pequenos, maior nos grandes. */
const degrau = (v: number, entrada: boolean) => entrada ? (v < 2 ? 0.05 : v < 10 ? 0.5 : 1) : (v < 20 ? 1 : v < 100 ? 5 : 10)
/** Para ler (cartão de embarque): com ponto de milhar. */
const bonito = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nomeCurto = (nome: string) => nome.replace(/^(GF|GlobalFly|OMNI)\s+/i, '')

/* ------------------------------------------------------------------
   Os mostradores do plano (21/10/2026, refeitos a pedido do Tiago: "texto
   sem formato, números estranhos, experiência antiga"). Cada valor é um
   instrumento: rótulo em versalete na cor do papel (ouro a entrada, verde a
   meta, coral o limite), o número grande na fonte da marca e editável ali
   mesmo, e uma régua deslizante com os atalhos marcados nela. A régua é
   logarítmica nos valores em dinheiro: precisão nos pequenos, alcance nos
   grandes. O teclado continua valendo para qualquer número.
   ------------------------------------------------------------------ */
const simbolo = (m: string) => (m === 'USD' ? 'US$' : m)
const curto = (v: number) => (v < 1 ? n2(v) : Number.isInteger(v) ? String(v) : n2(v))

type Tom = 'ouro' | 'verde' | 'coral' | 'aco'
function Mostrador({ id, rotulo, etiqueta, ajuda, tom, valor, mudar, marcas, faixa, passoMin, moeda, erro, aoEnter }: {
  id: string; rotulo: string; etiqueta?: string; ajuda: React.ReactNode; tom: Tom; valor: string; mudar: (v: string) => void
  marcas: readonly number[]; faixa: [number, number]; passoMin: number; moeda: string; erro: string | null; aoEnter: () => void
}) {
  const [a, b] = faixa
  const atual = ler(valor)
  // régua logarítmica: posição 0–1000 ⇄ valor de a até b
  const paraPos = (v: number) => (v <= a ? 0 : v >= b ? 1000 : Math.round((Math.log(v / a) / Math.log(b / a)) * 1000))
  const paraValor = (p: number) => { const v = a * Math.pow(b / a, p / 1000); const q = v < 2 ? passoMin : v < 20 ? Math.max(passoMin, 0.5) : v < 100 ? 1 : 5; return Math.round(v / q) * q }
  const pos = Number.isFinite(atual) ? paraPos(atual) : 0
  const passo = (sinal: 1 | -1) => {
    const base = Number.isFinite(atual) ? atual : a
    const d = degrau(base, passoMin < 0.5)
    mudar(n2(Math.min(10_000, Math.max(0, Math.round((base + sinal * d) / d) * d))))
  }
  return (
    <div className={`plv-m tom-${tom} ${erro ? 'com-erro' : ''}`}>
      <div className="plv-m-topo">
        <label htmlFor={id}>{rotulo}</label>
        {etiqueta && <span className="plv-m-etiqueta">{etiqueta}</span>}
      </div>
      <div className="plv-m-valor">
        <button type="button" className="plv-m-passo" onClick={() => passo(-1)} aria-label={`Diminuir ${rotulo.toLowerCase()}`}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg></button>
        <div className="plv-m-num">
          <span aria-hidden="true">{simbolo(moeda)}</span>
          <input id={id} inputMode="decimal" autoComplete="off" value={valor} aria-invalid={!!erro} aria-describedby={`${id}-ajuda`}
            size={Math.max(4, valor.length)}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => mudar(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={() => { if (Number.isFinite(atual)) mudar(n2(Math.min(10_000, Math.max(0, atual)))) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aoEnter() } }} />
        </div>
        <button type="button" className="plv-m-passo" onClick={() => passo(1)} aria-label={`Aumentar ${rotulo.toLowerCase()}`}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg></button>
      </div>
      <div className="plv-m-regua">
        <input type="range" min={0} max={1000} step={1} value={pos} aria-label={`${rotulo}: arraste para ajustar`} style={{ ['--p' as string]: `${pos / 10}%` }}
          onChange={(e) => mudar(n2(paraValor(Number(e.target.value))))} />
        <div className="plv-m-marcas">
          {marcas.map((m) => (
            <button type="button" key={m} className={Math.abs(atual - m) < 0.001 ? 'on' : ''} style={{ left: `${paraPos(m) / 10}%` }}
              onClick={() => mudar(n2(m))} aria-label={`${rotulo}: ${curto(m)}`}>{curto(m)}</button>
          ))}
        </div>
      </div>
      <p className={erro ? 'plv-m-erro' : 'plv-m-ajuda'} id={`${id}-ajuda`} role={erro ? 'status' : undefined}>{erro ?? ajuda}</p>
    </div>
  )
}

/** O loss virtual como mostrador: o número de dígitos e uma régua de casas (Sem, 1, 2, …), as mesmas casas do radar da cabine. */
function MostradorDeDigitos({ valor, mudar, max, padrao }: { valor: number; mudar: (n: number) => void; max: number; padrao: number }) {
  const ate = Math.max(8, valor, padrao)
  return (
    <div className="plv-m tom-aco">
      <div className="plv-m-topo">
        <span id="plv-lv-rot">Loss virtual</span>
        {valor === padrao && <span className="plv-m-etiqueta">padrão da plataforma</span>}
      </div>
      <div className="plv-m-valor">
        <button type="button" className="plv-m-passo" onClick={() => mudar(Math.max(0, valor - 1))} disabled={valor <= 0} aria-label="Esperar um dígito a menos"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" /></svg></button>
        <div className="plv-m-num" aria-live="polite">
          {valor === 0 ? <output className="plv-m-texto">Sem</output> : <><output className="plv-m-texto">{valor}</output><span>{valor === 1 ? 'dígito' : 'dígitos'}</span></>}
        </div>
        <button type="button" className="plv-m-passo" onClick={() => mudar(Math.min(max, valor + 1))} disabled={valor >= max} aria-label="Esperar um dígito a mais"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" /></svg></button>
      </div>
      <div className="plv-m-casas" role="radiogroup" aria-labelledby="plv-lv-rot">
        {Array.from({ length: ate + 1 }, (_, n) => (
          <button type="button" key={n} role="radio" aria-checked={valor === n} className={`${n === 0 ? 'sem' : ''} ${n > 0 && n <= valor ? 'cheia' : ''} ${valor === n ? 'on' : ''}`}
            onClick={() => mudar(n)} aria-label={n === 0 ? 'Sem loss virtual' : `${n} ${n === 1 ? 'dígito' : 'dígitos'}`}>{n === 0 ? 'Sem' : n}</button>
        ))}
      </div>
      <p className="plv-m-ajuda">{valor === 0 ? 'Entra em toda operação, sem esperar a sequência.' : valor === 1 ? 'Espera 1 dígito que teria perdido e então entra.' : `Espera ${valor} dígitos seguidos que teriam perdido e então entra.`}</p>
    </div>
  )
}

export function RobotSetup({ identidade, symbols, configInicial, moeda, isDemo, demoComoReal = false, escolherModelo = false, onCancelar, onLigar, ligando = false, erro }: Props) {
  const disponiveis = useRobosDisponiveis()
  // Escolhido no cartão da vitrine/home: o preparo já abre nele (a escolha continua a um "Voltar").
  // (lê sem apagar: o React de desenvolvimento chama esta função duas vezes; apaga depois de montar)
  const [daVitrine] = useState(() => {
    const v = modeloDaVitrine
    return escolherModelo && v && IDENTIDADES.some((i) => i.id === v) ? v : null
  })
  useEffect(() => { modeloDaVitrine = null }, [])
  const [modelo, setModelo] = useState(() => {
    const pedido = daVitrine ?? (escolherModelo ? lerPreparo().modelo : undefined)
    return pedido && IDENTIDADES.some((i) => i.id === pedido) ? identidadeDoRobo(pedido) : identidade
  })
  const [passo, setPasso] = useState<Passo>(escolherModelo && !daVitrine ? 'escolha' : 'plano')
  // a home pediu outro robô com este preparo já aberto (bloco reaproveitado): troca aqui
  useEffect(() => {
    if (!escolherModelo) return
    const trocar = () => {
      const v = modeloDaVitrine
      if (!v || !IDENTIDADES.some((i) => i.id === v)) return
      modeloDaVitrine = null
      setModelo(identidadeDoRobo(v)); setPasso('plano'); setConfirmaReal(false)
    }
    window.addEventListener('robos:preparar', trocar)
    return () => window.removeEventListener('robos:preparar', trocar)
  }, [escolherModelo])
  useEffect(() => {
    if (escolherModelo && disponiveis?.length && !disponiveis.includes(modelo.id)) {
      setModelo(identidadeDoRobo(disponiveis[0])); setPasso('escolha')
    }
  }, [disponiveis, escolherModelo, modelo.id])

  // os valores: o último preparo; meta e limite do plano do dia da home, quando houver
  const inicial = useMemo(() => sanear({ ...configInicial, ...lerPreparo().cfg, valorMaximo: 0 }, configInicial), [])
  const plano = useMemo(() => { const p = planoDoDia(); return p && p.metaUsd > 0 && p.limiteUsd > 0 ? p : null }, [])
  const [valores, setValores] = useState(() => ({
    valorAoVencer: n2(inicial.valorAoVencer),
    takeProfit: n2(plano ? plano.metaUsd : inicial.takeProfit),
    stopLoss: n2(plano ? plano.limiteUsd : inicial.stopLoss),
  }))
  const mudar = (k: keyof typeof valores) => (v: string) => setValores((x) => ({ ...x, [k]: v }))
  const [modo, setModo] = useState<Modo>(() => lerPreparo().modo === 'agressivo' ? 'agressivo' : 'conservador')
  const [confirmaReal, setConfirmaReal] = useState(false)
  const submitted = useRef(false)
  const corpo = useRef<HTMLDivElement>(null)

  // O que este robô está rodando hoje na marca. Na conta demo vale a regra em
  // teste, quando houver — é a que o servidor vai aplicar nesta sessão.
  const dados = useParametrosDoRobo(modelo.id)
  const parametros = dados ? (isDemo && dados.testeDemo ? dados.testeDemo : dados.parametros) : undefined
  const comModo = temModos(modelo.id, parametros)
  /*
    Loss virtual à escolha do cliente: nos robôs que entram por loss virtual,
    sem ou com, e quantos. Só aparece quando o servidor avisa que aceita a
    escolha (`lossVirtualAjustavel` no catálogo): servidor antigo ignoraria.
  */
  const lvDoPainel = parametros?.entrada.lossVirtual ?? 0
  const comLV = !!dados?.lossVirtualAjustavel && lvDoPainel > 0
  const [lvEscolhido, setLvEscolhido] = useState<Record<string, number>>(() => ({
    ...(lerPreparo().lossVirtual ?? {}),
    ...(configInicial.lossVirtualCliente !== undefined ? { [identidade.id]: configInicial.lossVirtualCliente } : {}),
  }))
  const lv = Math.min(LOSS_VIRTUAL_MAXIMO, Math.max(0, Math.trunc(lvEscolhido[modelo.id] ?? lvDoPainel)))
  const escolherLv = (n: number) => setLvEscolhido((m) => ({ ...m, [modelo.id]: Math.min(LOSS_VIRTUAL_MAXIMO, Math.max(0, n)) }))
  const regra = parametros && comLV ? { ...parametros, entrada: { ...parametros.entrada, lossVirtual: lv } } : parametros

  // ------------------------------------------------ validação, campo a campo
  const entrada = valorDePreparo(valores.valorAoVencer, 0.35, 10_000)
  const meta = valorDePreparo(valores.takeProfit, 0, 10_000)
  const limite = valorDePreparo(valores.stopLoss, isDemo ? 0 : (entrada ?? 0.35), 10_000)
  const erroEntrada = entrada === null ? `A entrada vai de ${din(0.35, moeda)} a ${din(10_000, moeda)}.` : null
  const erroMeta = meta === null ? `Informe a meta em ${moeda} (zero desliga a meta).` : null
  const erroLimite = limite === null ? (!isDemo && entrada !== null && ler(valores.stopLoss) < entrada ? 'Na conta real, o limite não pode ser menor que a entrada.' : `Informe o limite em ${moeda}${isDemo ? ' (zero desliga o freio)' : ''}.`) : null
  const disponivel = disponiveis === null || disponiveis.includes(modelo.id)
  const planoValido = disponivel && entrada !== null && meta !== null && limite !== null

  useEffect(() => { corpo.current?.scrollTo({ top: 0 }) }, [passo])
  useEffect(() => { if (!ligando) submitted.current = false }, [ligando, erro])
  /*
    Os segundos correndo no botão. Quando a Deriv engasga, ligar demora — e
    um "Iniciando…" parado parece travado. (24/09/2026, a pedido do Tiago.)
  */
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    if (!ligando) { setSegundos(0); return }
    const inicio = Date.now()
    const id = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 1000)
    return () => clearInterval(id)
  }, [ligando])

  // o nome como a marca mostra (GlobalFly: "75 Index", sem o "Volatility")
  const nomeAtivo = nomeDoAtivo(symbols.find(s => s.symbol === ATIVO_DOS_ROBOS)?.name ?? `Volatility ${ATIVO_DOS_ROBOS.replace(/^R_/, '')} Index`)
  const primeiroPasso: Passo = escolherModelo ? 'escolha' : 'plano'
  const voltar = () => {
    if (ligando) return
    setConfirmaReal(false)
    if (passo === 'decolar') setPasso('plano')
    else if (passo === 'plano' && escolherModelo) setPasso('escolha')
    else onCancelar()
  }
  const avancar = () => {
    if (ligando) return
    if (passo === 'escolha') { if (disponivel) setPasso('plano'); return }
    if (passo === 'plano') { if (planoValido) setPasso('decolar'); return }
  }
  function iniciar() {
    if (submitted.current || ligando || !planoValido || (!isDemo && !confirmaReal)) return
    submitted.current = true
    // o máximo de operações saiu do preparo: a sessão para pela meta ou pelo limite
    const preparada = configurarPreparo(inicial, { ...valores, maxOperacoes: '0' }, modelo.id, modo, parametros)
    if (!preparada) { submitted.current = false; return }
    // sem a escolha de loss virtual (robô sem, painel em 0 ou servidor antigo), nada de escolha antiga indo junto
    const { lossVirtualCliente: _antigo, ...semEscolha } = preparada
    void _antigo
    const cfg: ConfigEstrategia = comLV ? { ...semEscolha, lossVirtualCliente: lv } : semEscolha
    const { lossVirtualCliente: _lv, ...paraGuardar } = cfg
    void _lv
    try { localStorage.setItem(CHAVE, JSON.stringify({ cfg: paraGuardar, symbol: ATIVO_DOS_ROBOS, modo, modelo: modelo.id, lossVirtual: lvEscolhido })) } catch { /* preferência do aparelho */ }
    onLigar(cfg, ATIVO_DOS_ROBOS, modelo)
  }

  const frota = (MARCA.robos as readonly string[]).filter((id) => IDENTIDADES.some((i) => i.id === id) && (!disponiveis || disponiveis.includes(id))).map(identidadeDoRobo)
  const PASSOS: Array<{ id: Passo; nome: string }> = [{ id: 'escolha', nome: 'Escolha a I.A.' }, { id: 'plano', nome: 'Plano de voo' }, { id: 'decolar', nome: 'Decolar' }]
  const ordem = PASSOS.findIndex((p) => p.id === passo)
  const opcaoModo = OPCOES_DE_MODO.find((o) => o.id === modo)

  return <RobotDialog label="Configurar robô" busy={ligando} onCancel={onCancelar}>
    <form className={`robot-launch plv plv-no-${passo}`} onSubmit={(e) => { e.preventDefault(); if (passo !== 'decolar') avancar() }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.repeat || e.nativeEvent.isComposing)) e.preventDefault() }}>
      {/* ------------------------------------------------ o topo azul */}
      <header className={`plv-topo ${TEM_FOTOS && passo === 'plano' ? 'com-foto' : ''}`}>
        {/* celular, no plano: a foto do jato vira o fundo do topo (o cartão de foto some) */}
        {TEM_FOTOS && passo === 'plano' && <img className="plv-topo-foto" src={`${FOTOS}${modelo.id}.webp`} alt="" decoding="async" />}
        <i className="plv-eixo" aria-hidden="true" />
        <div className="plv-topo-linha">
          {TEM_MONOGRAMA ? <Monograma tamanho={40} className="plv-mono" /> : <Emblema id={modelo} tamanho={34} />}
          <div className="plv-titulo">
            <small>Plano de voo</small>
            <b>{passo === 'escolha' ? 'Escolha a sua I.A.' : TEM_MONOGRAMA ? nomeCurto(modelo.nome) : modelo.nome}</b>
            {passo !== 'escolha' && <span className="plv-titulo-sub">{modelo.chamada} · {nomeAtivo}</span>}
          </div>
          <button type="button" className="plv-fechar" onClick={onCancelar} disabled={ligando} aria-label="Fechar o preparo"><IconeFechar /></button>
        </div>
        {/* computador: os 3 passos com nome */}
        <ol className="plv-passos" aria-label={`Passo ${ordem + 1} de 3`}>
          {PASSOS.map((p, i) => (
            <li key={p.id} className={i < ordem ? 'feito' : i === ordem ? 'agora' : ''} aria-current={i === ordem ? 'step' : undefined}>
              <i aria-hidden="true">{i < ordem ? '✓' : i + 1}</i><span>{p.nome}</span>
            </li>
          ))}
        </ol>
        {/* celular: a barra de 3 segmentos e o passo por extenso */}
        <div className="plv-progresso" aria-hidden="true">
          <span>Passo {ordem + 1} de 3 · <b>{PASSOS[ordem].nome}</b></span>
          <div>{PASSOS.map((p, i) => <i key={p.id} className={i < ordem ? 'feito' : i === ordem ? 'agora' : ''} />)}</div>
        </div>
      </header>

      <div className="plv-corpo" ref={corpo}>
        {/* ------------------------------------------------ 1. a frota */}
        {passo === 'escolha' && (TEM_FOTOS ? (
          <div className="plv-frota" role="radiogroup" aria-label="Escolha a I.A.">
            {frota.map((r) => (
              <button type="button" key={r.id} role="radio" aria-checked={r.id === modelo.id} className={`plv-jato ${r.id === modelo.id ? 'on' : ''}`}
                onClick={() => setModelo(r)} onDoubleClick={() => { setModelo(r); setPasso('plano') }}>
                <img src={`${FOTOS}${r.id}.webp`} alt="" loading="lazy" decoding="async" />
                {r.id === modelo.id && <span className="plv-jato-marca" aria-hidden="true">✓</span>}
                <span className="plv-jato-texto"><small>GF</small><b>{nomeCurto(r.nome)}</b><span>{r.chamada}</span></span>
              </button>
            ))}
          </div>
        ) : <RobotCatalog selected={modelo.id} onSelect={setModelo} />)}
        {passo === 'escolha' && TEM_FOTOS && (
          <section className="plv-ficha" aria-live="polite">
            <div className="plv-ficha-titulo">
              <span className="plv-rot">Selecionada</span>
              <b><NomeDoRobo nome={modelo.nome} /></b>
              <span>{modelo.chamada}</span>
            </div>
            {/* na escolha, a regra da plataforma (a escolha da pessoa vale no plano de voo) */}
            <p>{parametros ? descrever(modelo.id, parametros) : modelo.descricao}</p>
            <dl className="plv-ficha-fatos">
              <div><dt>Ativo</dt><dd>{nomeAtivo}</dd></div>
              <div><dt>Entrada</dt><dd>{lvDoPainel > 0 ? `após ${lvDoPainel} loss virtuais` : 'em toda operação'}</dd></div>
              <div><dt>Modos</dt><dd>{comModo ? 'Conservador e agressivo' : 'Conservador'}</dd></div>
            </dl>
          </section>
        )}

        {/* ------------------------------------------------ 2. o plano de voo */}
        {passo === 'plano' && (
          <div className="plv-plano">
            <aside className="plv-lado">
              {TEM_FOTOS ? (
                <div className="plv-capa">
                  <img src={`${FOTOS}${modelo.id}.webp`} alt="" decoding="async" />
                  <span className="plv-capa-ativo">{nomeAtivo}</span>
                  <div className="plv-capa-texto"><small>GF</small><b>{nomeCurto(modelo.nome)}</b><span>{modelo.chamada}</span></div>
                </div>
              ) : <div className="plv-capa sem-foto"><Emblema id={modelo} tamanho={56} /><b><NomeDoRobo nome={modelo.nome} /></b><span>{modelo.chamada}</span></div>}

              {comModo && (
                <div className="plv-grupo">
                  <span className="plv-rot" id="plv-modo">Modo</span>
                  <div className="plv-seg" role="radiogroup" aria-labelledby="plv-modo">
                    {OPCOES_DE_MODO.map((o) => <button type="button" key={o.id} role="radio" aria-checked={modo === o.id} className={modo === o.id ? 'on' : ''} onClick={() => setModo(o.id)}>{NOME_DO_MODO[o.id]}</button>)}
                  </div>
                  <p className="plv-dica"><b>{NOME_DO_MODO[modo]}:</b> {opcaoModo?.frase}</p>
                </div>
              )}

            </aside>

            <section className="plv-campos" aria-label="Valores da sessão">
              {comLV && <MostradorDeDigitos valor={lv} mudar={escolherLv} max={LOSS_VIRTUAL_MAXIMO} padrao={lvDoPainel} />}
              <Mostrador id="plv-entrada" rotulo="Entrada" tom="ouro" ajuda="O valor de cada operação." valor={valores.valorAoVencer} mudar={mudar('valorAoVencer')}
                marcas={[0.35, 1, 5, 25]} faixa={[0.35, 50]} passoMin={0.05} moeda={moeda} erro={erroEntrada} aoEnter={avancar} />
              <Mostrador id="plv-meta" rotulo="Meta de ganho" tom="verde" etiqueta={plano ? 'do plano do dia' : undefined} ajuda="O robô para ao alcançar este ganho." valor={valores.takeProfit} mudar={mudar('takeProfit')}
                marcas={[10, 25, 100, 500]} faixa={[5, 1000]} passoMin={1} moeda={moeda} erro={erroMeta} aoEnter={avancar} />
              <Mostrador id="plv-limite" rotulo="Limite de perda" tom="coral" etiqueta={plano ? 'do plano do dia' : undefined} ajuda="O robô para antes de passar desta perda." valor={valores.stopLoss} mudar={mudar('stopLoss')}
                marcas={[5, 15, 50, 250]} faixa={[2, 1000]} passoMin={1} moeda={moeda} erro={erroLimite} aoEnter={avancar} />
            </section>
          </div>
        )}

        {/* ------------------------------------------------ 3. decolar: o cartão de embarque */}
        {passo === 'decolar' && (
          <div className="plv-embarque">
            <section className="plv-passe" aria-label="Resumo da sessão">
              <div className={`plv-passe-topo ${TEM_FOTOS ? '' : 'sem-foto'}`}>
                {TEM_FOTOS && <img src={`${FOTOS}${modelo.id}.webp`} alt="" decoding="async" />}
                <div className="plv-passe-nome">
                  <small>{TEM_FOTOS ? 'GF · ' : ''}{nomeAtivo}</small>
                  <b>{TEM_FOTOS ? nomeCurto(modelo.nome) : <NomeDoRobo nome={modelo.nome} />}</b>
                </div>
              </div>
              <i className="plv-picote" aria-hidden="true" />
              {/* os três números do voo, em destaque */}
              <dl className="plv-passe-valores">
                <div><dt>Entrada</dt><dd><small>{moeda === 'USD' ? 'US$' : moeda}</small>{bonito(entrada ?? 0)}</dd></div>
                <div><dt>Meta</dt><dd className={meta ? 'ganho' : 'sem'}>{meta ? <><small>{moeda === 'USD' ? 'US$' : moeda}</small>+{bonito(meta)}</> : 'Sem meta'}</dd></div>
                <div><dt>Limite</dt><dd className={limite ? 'perda' : 'sem'}>{limite ? <><small>{moeda === 'USD' ? 'US$' : moeda}</small>−{bonito(limite)}</> : 'Sem limite'}</dd></div>
              </dl>
              {/* as regras do voo, como selos, e o atalho para editar */}
              <div className="plv-passe-rodape">
                <div className="plv-passe-regras">
                  {comModo && <span><small>Modo</small>{NOME_DO_MODO[modo]}</span>}
                  {comLV && <span><small>Loss virtual</small>{lv === 0 ? 'Sem' : `${lv} ${lv === 1 ? 'dígito' : 'dígitos'}`}</span>}
                </div>
                <button type="button" className="plv-editar" onClick={() => setPasso('plano')} disabled={ligando}>
                  <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z" /></svg>Editar plano
                </button>
              </div>
            </section>
            <aside className="plv-notas">
              <div className="plv-info">
                <section>
                  <span className="plv-info-rot"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" /><path d="M8 4.5V8l2.5 1.5" /></svg>Como opera</span>
                  <p>{regra ? descrever(modelo.id, regra) : modelo.descricao}</p>
                </section>
                <section>
                  <span className="plv-info-rot"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2l6 11H2z" /><path d="M8 6.5v3M8 11.5v.01" /></svg>Antes de decolar</span>
                  <p>A recuperação pode aumentar o valor das entradas. Os robôs desta conta compartilham o saldo. Não há garantia de lucro.</p>
                </section>
                {isDemo && !demoComoReal && dados?.testeDemo && <section><p>Este robô roda uma regra em teste nas contas demo.</p></section>}
              </div>
              {!isDemo && (
                <label className={`plv-real ${confirmaReal ? 'ok' : ''}`}>
                  <input type="checkbox" checked={confirmaReal} disabled={ligando} onChange={(e) => setConfirmaReal(e.target.checked)} />
                  <span>Entendo que esta sessão usa <b>dinheiro real</b> e confirmo os valores acima.</span>
                </label>
              )}
            </aside>
          </div>
        )}

        {erro && <p className="plv-erro-geral" role="alert">{erro}</p>}
        {!disponivel && passo !== 'escolha' && <p className="plv-erro-geral" role="alert">Esta I.A. está indisponível agora. Escolha outra.</p>}
      </div>

      {/* ------------------------------------------------ o rodapé */}
      <footer className="plv-rodape">
        <button type="button" className="plv-voltar" disabled={ligando} onClick={voltar}>{passo === primeiroPasso ? 'Cancelar' : '← Voltar'}</button>
        <span className="plv-rodape-dica">{ligando && segundos >= 12 ? 'A Deriv está lenta agora. Seguimos tentando. Não clique de novo.' : passo === 'decolar' ? 'Você acompanha a sessão de qualquer tela' : 'Nada será operado ainda'}</span>
        {passo === 'decolar'
          ? <button type="button" className="plv-principal" disabled={ligando || !planoValido || (!isDemo && !confirmaReal)} onClick={iniciar}>
              {ligando ? `Iniciando… ${segundos}s` : <><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z" fill="currentColor" /></svg>Iniciar robô</>}
            </button>
          : <button type="submit" className="plv-principal" disabled={ligando || (passo === 'plano' ? !planoValido : !disponivel)}>
              {passo === 'escolha' ? 'Continuar' : 'Revisar e decolar'}<span aria-hidden="true">→</span>
            </button>}
      </footer>
    </form>
  </RobotDialog>
}
