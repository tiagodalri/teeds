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
import { escadaDoRobo } from '../core/deriv/escada'
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

/** Um valor do plano: o número grande no meio, − e + nas pontas, atalhos e o aviso logo abaixo. */
function CampoDoPlano({ id, rotulo, ajuda, cor, valor, mudar, atalhos, min, max, entrada = false, moeda, erro, aoEnter }: {
  id: string; rotulo: string; ajuda: string; cor?: 'verde' | 'coral'; valor: string; mudar: (v: string) => void
  atalhos: readonly number[]; min: number; max: number; entrada?: boolean; moeda: string; erro: string | null; aoEnter: () => void
}) {
  const atual = ler(valor)
  const passo = (sinal: 1 | -1) => {
    const base = Number.isFinite(atual) ? atual : min
    const d = degrau(base, entrada)
    const novo = Math.min(max, Math.max(min, Math.round((base + sinal * d) / d) * d))
    mudar(n2(novo))
  }
  return (
    <div className={`plv-campo ${erro ? 'com-erro' : ''}`}>
      <label className="plv-campo-nome" htmlFor={id}>
        <b>{cor && <i className={cor} aria-hidden="true" />}{rotulo}</b>
        <small>{ajuda}</small>
      </label>
      <div className="plv-campo-valor">
        <button type="button" className="plv-mm" onClick={() => passo(-1)} aria-label={`Diminuir ${rotulo.toLowerCase()}`}>−</button>
        <div className="plv-num">
          <span aria-hidden="true">{moeda}</span>
          <input id={id} inputMode="decimal" autoComplete="off" value={valor} aria-invalid={!!erro} aria-describedby={erro ? `${id}-erro` : undefined}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => mudar(e.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={() => { if (Number.isFinite(atual)) mudar(n2(Math.min(max, Math.max(0, atual)))) }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); aoEnter() } }} />
        </div>
        <button type="button" className="plv-mm" onClick={() => passo(1)} aria-label={`Aumentar ${rotulo.toLowerCase()}`}>+</button>
      </div>
      <div className="plv-atalhos" role="group" aria-label={`Atalhos de ${rotulo.toLowerCase()}`}>
        {atalhos.map((a) => <button type="button" key={a} className={Math.abs(atual - a) < 0.001 ? 'on' : ''} aria-pressed={Math.abs(atual - a) < 0.001} onClick={() => mudar(n2(a))}>{a < 1 ? n2(a) : a}</button>)}
      </div>
      {erro && <p className="plv-erro" id={`${id}-erro`} role="status">{erro}</p>}
    </div>
  )
}

/** O loss virtual no mesmo desenho dos valores: − e + nas pontas, o número no meio, atalhos ao lado. */
function CampoDeDigitos({ valor, mudar, max, padrao }: { valor: number; mudar: (n: number) => void; max: number; padrao: number }) {
  const atalhos = [0, 2, 3, 4, 5].includes(padrao) ? [0, 2, 3, 4, 5] : [0, 2, 3, padrao, 5].sort((a, b) => a - b)
  return (
    <div className="plv-campo">
      <div className="plv-campo-nome" id="plv-lv-nome">
        <b>Loss virtual</b>
        <small>{valor === 0 ? 'entra em toda operação' : `espera ${valor} ${valor === 1 ? 'dígito' : 'dígitos'} que teriam perdido`}{valor === padrao ? ' · padrão' : ''}</small>
      </div>
      <div className="plv-campo-valor" role="group" aria-labelledby="plv-lv-nome">
        <button type="button" className="plv-mm" onClick={() => mudar(Math.max(0, valor - 1))} disabled={valor <= 0} aria-label="Esperar um dígito a menos">−</button>
        <div className="plv-num" aria-live="polite">
          {valor === 0 ? <output className="plv-num-texto">Sem</output> : <><output className="plv-num-texto">{valor}</output><span>{valor === 1 ? 'dígito' : 'dígitos'}</span></>}
        </div>
        <button type="button" className="plv-mm" onClick={() => mudar(Math.min(max, valor + 1))} disabled={valor >= max} aria-label="Esperar um dígito a mais">+</button>
      </div>
      <div className="plv-atalhos" role="group" aria-label="Atalhos de loss virtual">
        {atalhos.map((a) => <button type="button" key={a} className={valor === a ? 'on' : ''} aria-pressed={valor === a} onClick={() => mudar(a)}>{a === 0 ? 'Sem' : a}</button>)}
      </div>
    </div>
  )
}

const CAMINHO_AVIAO = 'M62 20C61.6 18.4 58.5 17.6 54 17.6H38L25 3.5h-4l8 14.3-16 .4-5.5-6.2H5l2 6.6-3 .6v1.6l3 .6-2 6.6h2.5l5.5-6.2 16 .4-8 14.3h4l13-14.1h16c4.5 0 7.6-.8 8-2.4Z'
/** O arco do plano (limite à esquerda, meta à direita, o avião no zero, prestes a decolar). */
function ArcoDoPlano({ meta, limite }: { meta: number; limite: number }) {
  const ponto = (p: number) => { const a = Math.PI * (1 - p); return { x: 150 + 120 * Math.cos(a), y: 150 - 120 * Math.sin(a) } }
  const arco = (de: number, ate: number) => { const a = ponto(de), b = ponto(ate); return `M${a.x.toFixed(1)} ${a.y.toFixed(1)} A120 120 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}` }
  const temMeta = meta > 0, temLimite = limite > 0
  const zero = temMeta && temLimite ? limite / (limite + meta) : temLimite ? 0.75 : temMeta ? 0.25 : 0.5
  const z = ponto(zero)
  return (
    <svg className="plv-arco" viewBox="0 0 300 160" aria-hidden="true">
      {[0, 0.25, 0.5, 0.75, 1].map((p) => { const a = ponto(p), b = { x: 150 + 134 * Math.cos(Math.PI * (1 - p)), y: 150 - 134 * Math.sin(Math.PI * (1 - p)) }; return <line key={p} x1={a.x + (b.x - a.x) * 1.1} y1={a.y + (b.y - a.y) * 1.1} x2={b.x} y2={b.y} className="marca" /> })}
      <path d={arco(0, zero)} className={`faixa perda ${temLimite ? '' : 'sem'}`} />
      <path d={arco(zero, 1)} className={`faixa ganho ${temMeta ? '' : 'sem'}`} />
      <g transform={`translate(${z.x.toFixed(1)} ${z.y.toFixed(1)})`}><circle r="16" className="selo" /><g transform="rotate(-32) translate(-11 -7) scale(.34)"><path className="aviao" d={CAMINHO_AVIAO} /></g></g>
    </svg>
  )
}

export function RobotSetup({ identidade, symbols, configInicial, moeda, isDemo, escolherModelo = false, onCancelar, onLigar, ligando = false, erro }: Props) {
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

  // o que o limite aguenta, pela escada do próprio robô (no modo escolhido)
  const folego = useMemo(() => {
    if (entrada === null || limite === null || limite <= 0) return null
    const escada = escadaDoRobo(modelo.id, entrada, 40, comModo ? modo : 'conservador', parametros)
    const cabem = escada.filter((d) => d.perdido <= limite + 1e-9)
    return { perdas: cabem.length, maior: cabem.length ? Math.max(...cabem.map((d) => d.valor)) : entrada }
  }, [entrada, limite, modelo.id, modo, comModo, parametros])

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

  const nomeAtivo = (symbols.find(s => s.symbol === ATIVO_DOS_ROBOS)?.name ?? ATIVO_DOS_ROBOS).replace(/\s*Index$/i, '')
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
  const metaTexto = meta && meta > 0 ? <b className="ganho">ganhar {din(meta, moeda)}</b> : <b>sem meta de ganho</b>
  const limiteTexto = limite && limite > 0 ? <b className="perda">perder {din(limite, moeda)}</b> : <b>sem limite de perda</b>

  return <RobotDialog label="Configurar robô" busy={ligando} onCancel={onCancelar}>
    <form className={`robot-launch plv plv-no-${passo}`} onSubmit={(e) => { e.preventDefault(); if (passo !== 'decolar') avancar() }}
      onKeyDown={(e) => { if (e.key === 'Enter' && (e.repeat || e.nativeEvent.isComposing)) e.preventDefault() }}>
      {/* ------------------------------------------------ o topo azul */}
      <header className="plv-topo">
        <i className="plv-eixo" aria-hidden="true" />
        <div className="plv-topo-linha">
          {TEM_MONOGRAMA ? <Monograma tamanho={40} className="plv-mono" /> : <Emblema id={modelo} tamanho={34} />}
          <div className="plv-titulo">
            <small>Plano de voo</small>
            <b>{passo === 'escolha' ? 'Escolha a sua I.A.' : `${TEM_MONOGRAMA ? nomeCurto(modelo.nome) : modelo.nome} · conta ${isDemo ? 'demo' : 'real'}`}</b>
          </div>
          <button type="button" className="plv-fechar" onClick={onCancelar} disabled={ligando} aria-label="Fechar o preparo"><IconeFechar /></button>
        </div>
        <ol className="plv-passos" aria-label={`Passo ${ordem + 1} de 3`}>
          {PASSOS.map((p, i) => (
            <li key={p.id} className={i < ordem ? 'feito' : i === ordem ? 'agora' : ''} aria-current={i === ordem ? 'step' : undefined}>
              <i aria-hidden="true">{i < ordem ? '✓' : i + 1}</i><span>{p.nome}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className="plv-corpo" ref={corpo}>
        {/* ------------------------------------------------ 1. a frota */}
        {passo === 'escolha' && (TEM_FOTOS ? (
          <div className="plv-frota" role="radiogroup" aria-label="Escolha a I.A.">
            {frota.map((r) => (
              <button type="button" key={r.id} role="radio" aria-checked={r.id === modelo.id} className={`plv-jato ${r.id === modelo.id ? 'on' : ''}`}
                onClick={() => setModelo(r)} onDoubleClick={() => { setModelo(r); setPasso('plano') }}>
                <img src={`${FOTOS}${r.id}.webp`} alt="" loading="lazy" />
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
            <p>{regra ? descrever(modelo.id, regra) : modelo.descricao}</p>
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
                  <img src={`${FOTOS}${modelo.id}.webp`} alt="" />
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
              {comLV && <CampoDeDigitos valor={lv} mudar={escolherLv} max={LOSS_VIRTUAL_MAXIMO} padrao={lvDoPainel} />}
              <CampoDoPlano id="plv-entrada" rotulo="Entrada" ajuda="o valor de cada operação" valor={valores.valorAoVencer} mudar={mudar('valorAoVencer')}
                atalhos={[0.35, 1, 2, 5]} min={0.35} max={10_000} entrada moeda={moeda} erro={erroEntrada} aoEnter={avancar} />
              <CampoDoPlano id="plv-meta" rotulo="Meta de ganho" ajuda={plano ? 'para ao ganhar · do seu plano do dia' : 'o robô para ao ganhar'} cor="verde" valor={valores.takeProfit} mudar={mudar('takeProfit')}
                atalhos={[10, 25, 50, 100]} min={0} max={10_000} moeda={moeda} erro={erroMeta} aoEnter={avancar} />
              <CampoDoPlano id="plv-limite" rotulo="Limite de perda" ajuda={plano ? 'para ao perder · do seu plano do dia' : 'o robô para ao perder'} cor="coral" valor={valores.stopLoss} mudar={mudar('stopLoss')}
                atalhos={[5, 15, 25, 50]} min={0} max={10_000} moeda={moeda} erro={erroLimite} aoEnter={avancar} />

              <div className="plv-voo" aria-live="polite">
                <ArcoDoPlano meta={meta ?? 0} limite={limite ?? 0} />
                <div className="plv-voo-texto">
                  {entrada === null ? <p>Ajuste a entrada para ver o plano.</p>
                    : <p>Entra com <b>{din(entrada, moeda)}</b>. Para ao {metaTexto} ou ao {limiteTexto}{meta && limite ? ', o que vier primeiro' : ''}.</p>}
                  {folego && (
                    <p className={`plv-folego ${folego.perdas <= 2 ? 'curto' : ''}`}>
                      {folego.perdas === 0 ? 'O limite é menor que a primeira entrada: o robô não chega a entrar.'
                        : <>Este limite aguenta <b>{folego.perdas} {folego.perdas === 1 ? 'perda seguida' : 'perdas seguidas'}</b>; a maior entrada seria <b>{din(folego.maior, moeda)}</b>.</>}
                    </p>
                  )}
                  {limite === 0 && <p className="plv-folego curto">Sem limite de perda, o robô só para pela meta ou por você.</p>}
                </div>
              </div>
            </section>
          </div>
        )}

        {/* ------------------------------------------------ 3. decolar: o cartão de embarque */}
        {passo === 'decolar' && (
          <div className="plv-embarque">
            <section className="plv-passe" aria-label="Resumo da sessão">
              <div className={`plv-passe-topo ${TEM_FOTOS ? '' : 'sem-foto'}`}>
                {TEM_FOTOS && <img src={`${FOTOS}${modelo.id}.webp`} alt="" />}
                <div className="plv-passe-nome">
                  <div><small>{TEM_FOTOS ? 'GF · ' : ''}{nomeAtivo}</small><b>{TEM_FOTOS ? nomeCurto(modelo.nome) : <NomeDoRobo nome={modelo.nome} />}</b></div>
                  <span className={isDemo ? 'demo' : 'real'}>Conta {isDemo ? 'demo' : 'real'}</span>
                </div>
              </div>
              <i className="plv-picote" aria-hidden="true" />
              <dl className="plv-passe-grade">
                {comModo && <div><dt>Modo</dt><dd>{NOME_DO_MODO[modo]}</dd></div>}
                {comLV && <div><dt>Loss virtual</dt><dd>{lv === 0 ? 'Sem' : `${lv} ${lv === 1 ? 'dígito' : 'dígitos'}`}</dd></div>}
                <div><dt>Entrada</dt><dd>{din(entrada ?? 0, moeda)}</dd></div>
                <div><dt>Meta</dt><dd className="ganho">{meta ? `+${bonito(meta)}` : 'Sem meta'}</dd></div>
                <div><dt>Limite</dt><dd className="perda">{limite ? `−${bonito(limite)}` : 'Sem limite'}</dd></div>
                {folego && folego.perdas > 0 && <div><dt>Aguenta</dt><dd>{folego.perdas} {folego.perdas === 1 ? 'perda' : 'perdas'}</dd></div>}
              </dl>
              <button type="button" className="plv-editar" onClick={() => setPasso('plano')} disabled={ligando}>Editar o plano</button>
            </section>
            <aside className="plv-notas">
              <p className="plv-nota"><b>Como opera.</b> {regra ? descrever(modelo.id, regra) : modelo.descricao}</p>
              <p className="plv-nota">A recuperação pode aumentar o valor das entradas. Os robôs desta conta compartilham o saldo. Não há garantia de lucro.</p>
              {isDemo && dados?.testeDemo && <p className="plv-nota">Este robô roda uma regra em teste nas contas demo.</p>}
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
        <span className="plv-rodape-dica">{ligando && segundos >= 12 ? 'A Deriv está lenta agora. Seguimos tentando — não clique de novo.' : passo === 'decolar' ? 'Você acompanha a sessão de qualquer tela' : 'Nada será operado ainda'}</span>
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
