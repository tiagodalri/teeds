import { useEffect, useMemo, useRef, useState } from 'react'
import { identidade } from '../core/deriv/branding'
import { CampoComLogotipo } from './marca/LogotipoDaIA'
import { escadaDoRobo } from '../core/deriv/escada'
import { MODOS, NOME_DO_MODO, temModos, type Modo } from '../core/deriv/strategies'
import { useParametrosDoRobo, useRobosDisponiveis } from '../core/teeds/catalogoRobos'
import { MARCA } from '../marca'
import { guardarPlanoDoDia, planoDoDia } from '../core/teeds/planoDoDia'
import './gerenciamento.css'

const dinheiro = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })
const ler = (s: string) => /^\d+(?:[.,]\d{0,2})?$/.test(s.trim()) ? Number(s.replace(',', '.')) : NaN
/** Uma linha da planilha; `cobre` é null na entrada fixa (não há sequência a cobrir). */
interface Linha { n: number; valor: number; perdido: number; cobre: boolean | null }

/** Exclusivamente consultiva: sem conta, armazenamento ou comandos. */
export function OperationalManagementPanel() {
  // Só os robôs que estão ativos no catálogo da marca (Administração › Robôs).
  // Um robô desativado lá some daqui também, como some da escolha de robô.
  const disponiveis = useRobosDisponiveis()
  const robosAtivos = MARCA.robos.filter((id) => disponiveis === null || disponiveis.includes(id))
  const [roboEscolhido, setRobo] = useState(MARCA.robos[0])
  const robo = robosAtivos.includes(roboEscolhido) ? roboEscolhido : (robosAtivos[0] ?? roboEscolhido)
  const [fixaEscolhida, setFixa] = useState(false)
  const fixa = fixaEscolhida || robosAtivos.length === 0
  const [modo, setModo] = useState<Modo>('conservador')
  // A escada segue a regra publicada pelo painel para este robô (a mesma da
  // cabine); antes do catálogo carregar, o padrão do código.
  const dados = useParametrosDoRobo(robo)
  const parametros = dados?.parametros
  const comModos = temModos(robo, parametros)
  const modoEfetivo: Modo = comModos ? modo : 'conservador'
  // o último cenário desta pessoa volta preenchido (e a home mostra a meta e o limite)
  const guardado = useRef(planoDoDia()).current
  const [banca, setBanca] = useState(guardado?.banca ?? '1000')
  const [entrada, setEntrada] = useState(guardado?.entrada ?? '0,35')
  const [limite, setLimite] = useState(guardado?.limite ?? '10')
  const [meta, setMeta] = useState(guardado?.meta ?? '3')
  const [percentual, setPercentual] = useState(guardado?.percentual ?? true)
  const saldo = ler(banca), base = ler(entrada), perda = ler(limite), ganho = ler(meta)
  const teto = percentual ? saldo * perda / 100 : perda
  const objetivo = percentual ? saldo * ganho / 100 : ganho
  // trocar % ↔ USD converte os valores (antes apagava os campos e acendia o alerta vermelho)
  const trocarUnidade = (paraPct: boolean) => {
    if (paraPct === percentual) return
    const conv = (v: number) => {
      if (!Number.isFinite(v) || !(saldo > 0)) return ''
      const n = paraPct ? (v / saldo) * 100 : (saldo * v) / 100
      return (Math.round(n * 100) / 100).toLocaleString('pt-BR', { maximumFractionDigits: 2, useGrouping: false })
    }
    setLimite(conv(perda)); setMeta(conv(ganho)); setPercentual(paraPct)
  }
  const valido = [saldo, base, perda, ganho].every(Number.isFinite) && saldo > 0 && base >= .01 && perda >= 0 && ganho >= 0 && teto <= saldo
  // Guarda só depois que a pessoa mexe (abrir a tela não conta como "definiu a meta").
  const mexeu = useRef(false)
  useEffect(() => {
    if (!mexeu.current) { mexeu.current = true; return }
    if (valido) guardarPlanoDoDia({ banca, entrada, limite, meta, percentual, metaUsd: objetivo, limiteUsd: teto })
  }, [banca, entrada, limite, meta, percentual]) // eslint-disable-line react-hooks/exhaustive-deps
  const linhas = useMemo(() => {
    if (!valido) return []
    const todas: Linha[] = fixa ? Array.from({ length: 60 }, (_, i) => ({ n: i + 1, valor: base, perdido: Math.round(base * (i + 1) * 100) / 100, cobre: null })) : escadaDoRobo(robo, base, 60, modoEfetivo, parametros)
    const fora = todas.findIndex(d => d.perdido > teto + 1e-9)
    return fora < 0 ? todas : todas.slice(0, fora + 1)
  }, [valido, fixa, base, robo, teto, modoEfetivo, parametros])
  const cabem = linhas.filter(d => d.perdido <= teto + 1e-9)
  const proxima = linhas.find(d => d.perdido > teto + 1e-9)
  const acumulado = cabem[cabem.length - 1]?.perdido ?? 0
  return <main className="go ger go-consultoria">
    <header className="go-hero"><div><span className="go-selo">Planejamento {MARCA.prosa}</span><h2>Gerenciamento</h2><p>Planilha interativa para calcular entradas, limites e objetivos.</p></div><div className="go-status">Somente simulação</div></header>
    <p className="go-consultivo">Esta área é exclusivamente consultiva. Não configura, inicia ou interrompe robôs. Nenhum valor é enviado às operações ou sincronizado com sua conta.{MARCA.inicio && ' A meta e o limite viram o plano do dia da tela Início.'}</p>
    <section className="go-grade"><aside className="go-config"><h3>Seu cenário</h3><div className="go-campos">
      <label><span>Modelo de referência</span><CampoComLogotipo nome={fixa ? '' : identidade(robo).nome} id={fixa ? null : robo}><select value={fixa ? 'fixa' : robo} onChange={e => { setFixa(e.target.value === 'fixa'); if (e.target.value !== 'fixa') setRobo(e.target.value) }}><option value="fixa">Entrada fixa</option>{robosAtivos.map(id => <option key={id} value={id}>{identidade(id).nome}</option>)}</select></CampoComLogotipo></label>
      {!fixa && comModos && <label><span>Modo de operação</span><select value={modo} onChange={e => setModo(e.target.value as Modo)}>{MODOS.map(m => <option key={m} value={m}>{NOME_DO_MODO[m]}</option>)}</select></label>}
      <label><span>Banca de referência (USD)</span><div><input inputMode="decimal" value={banca} onChange={e => setBanca(e.target.value)} /></div></label>
      <label><span>Entrada inicial (USD)</span><div><input inputMode="decimal" value={entrada} onChange={e => setEntrada(e.target.value)} /></div></label>
      <label><span>Unidade dos limites</span><select value={percentual ? 'pct' : 'usd'} onChange={e => trocarUnidade(e.target.value === 'pct')}><option value="pct">Percentual da banca (%)</option><option value="usd">Valor em USD</option></select></label>
      <label><span>Limite de perda planejado ({percentual ? '%' : 'USD'})</span><div><input inputMode="decimal" value={limite} onChange={e => setLimite(e.target.value)} /></div></label>
      <label><span>Objetivo de ganho ({percentual ? '%' : 'USD'})</span><div><input inputMode="decimal" value={meta} onChange={e => setMeta(e.target.value)} /></div></label>
    </div><p className="go-banca-nota">Sugerimos começar com pelo menos US$ 100. Com US$ 50 também dá para seguir o gerenciamento, com entradas menores.</p></aside>
    <div className="go-resultados">{!valido ? <p role="alert">Confira os valores: a banca precisa ser maior que zero, a entrada de pelo menos 0,01 e o limite de perda até o valor da banca.</p> : <>
      <div className="go-veredito"><b>Resumo do cenário</b><p>Entrada inicial: {(base / saldo * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da banca. Objetivo de ganho: {dinheiro(objetivo)}. Não é uma previsão de resultado.</p></div>
      <div className="go-cards tres"><article><span>Limite planejado</span><strong>{dinheiro(teto)}</strong><small>Sem parada automática</small></article><article><span>Perdas dentro do limite</span><strong>{cabem.length}{!proxima ? '+' : ''}</strong><small>Etapas completas simuladas</small></article><article><span>Perda acumulada</span><strong>{dinheiro(acumulado)}</strong><small>Antes de ultrapassar o limite</small></article></div>
      <section className="go-planilha go-consulta-tabela"><h3>Sequência de perdas hipotéticas</h3><p>Sem reduzir automaticamente a próxima entrada. Até 60 etapas.</p><div className="go-consulta-scroll go-tabela-seis"><div className="go-tabela-cab"><span>Etapa</span><span>Entrada</span><span>Perda acumulada</span><span>Saldo restante</span><span title="Ganhar nesta etapa cobre tudo o que foi perdido antes dela?">Cobre as perdas?</span><span>Situação</span></div><div className="go-tabela-corpo">{linhas.map(d => <div key={d.n}><span>Etapa {d.n}</span><b>{dinheiro(d.valor)}</b><b>{dinheiro(d.perdido)}</b><b>{dinheiro(saldo - d.perdido)}</b>{d.cobre === null ? <b>—</b> : <em className={d.cobre ? '' : 'fora'} title={d.cobre ? 'Ganhar nesta etapa cobre tudo o que foi perdido antes dela' : 'Ganhar nesta etapa não cobre o que foi perdido antes dela'}>{d.cobre ? '✓' : 'não cobre'}</em>}<em className={d.perdido > teto + 1e-9 ? 'fora' : ''}>{d.perdido > teto + 1e-9 ? 'Ultrapassa o limite' : 'Dentro do limite'}</em></div>)}</div></div></section>
    </>}</div></section>
  </main>
}
