import { useMemo, useState } from 'react'
import { identidade } from '../core/deriv/branding'
import { escadaDoRobo } from '../core/deriv/escada'
import { MODOS, NOME_DO_MODO, temModos, type Modo } from '../core/deriv/strategies'
import { MARCA } from '../marca'

const dinheiro = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'USD' })
const ler = (s: string) => /^\d+(?:[.,]\d{0,2})?$/.test(s.trim()) ? Number(s.replace(',', '.')) : NaN

/** Exclusivamente consultiva: sem conta, armazenamento ou comandos. */
export function OperationalManagementPanel() {
  const [robo, setRobo] = useState(MARCA.robos[0])
  const [fixa, setFixa] = useState(false)
  const [modo, setModo] = useState<Modo>('conservador')
  const [banca, setBanca] = useState('1000')
  const [entrada, setEntrada] = useState('0,35')
  const [limite, setLimite] = useState('10')
  const [meta, setMeta] = useState('3')
  const [percentual, setPercentual] = useState(true)
  const saldo = ler(banca), base = ler(entrada), perda = ler(limite), ganho = ler(meta)
  const teto = percentual ? saldo * perda / 100 : perda
  const objetivo = percentual ? saldo * ganho / 100 : ganho
  const valido = [saldo, base, perda, ganho].every(Number.isFinite) && saldo > 0 && base >= .01 && perda >= 0 && ganho >= 0 && teto <= saldo
  const linhas = useMemo(() => {
    if (!valido) return []
    const todas = fixa ? Array.from({ length: 60 }, (_, i) => ({ n: i + 1, valor: base, perdido: Math.round(base * (i + 1) * 100) / 100 })) : escadaDoRobo(robo, base, 60, modo)
    const fora = todas.findIndex(d => d.perdido > teto + 1e-9)
    return fora < 0 ? todas : todas.slice(0, fora + 1)
  }, [valido, fixa, base, robo, teto, modo])
  const cabem = linhas.filter(d => d.perdido <= teto + 1e-9)
  const proxima = linhas.find(d => d.perdido > teto + 1e-9)
  const acumulado = cabem[cabem.length - 1]?.perdido ?? 0
  return <main className="go ger go-consultoria">
    <header className="go-hero"><div><span className="go-selo">Planejamento {MARCA.prosa}</span><h2>Gerenciamento</h2><p>Planilha interativa para calcular entradas, limites e objetivos.</p></div><div className="go-status">Somente simulação</div></header>
    <p className="go-consultivo">Esta área é exclusivamente consultiva. Não configura, inicia ou interrompe robôs. Nenhum valor é enviado às operações ou sincronizado com sua conta.</p>
    <section className="go-grade"><aside className="go-config"><h3>Seu cenário</h3><div className="go-campos">
      <label><span>Modelo de referência</span><select value={fixa ? 'fixa' : robo} onChange={e => { setFixa(e.target.value === 'fixa'); if (e.target.value !== 'fixa') setRobo(e.target.value) }}><option value="fixa">Entrada fixa</option>{MARCA.robos.map(id => <option key={id} value={id}>{identidade(id).nome}</option>)}</select></label>
      {!fixa && temModos(robo) && <label><span>Modo de operação</span><select value={modo} onChange={e => setModo(e.target.value as Modo)}>{MODOS.map(m => <option key={m} value={m}>{NOME_DO_MODO[m]}</option>)}</select></label>}
      <label><span>Banca de referência (USD)</span><div><input inputMode="decimal" value={banca} onChange={e => setBanca(e.target.value)} /></div></label>
      <label><span>Entrada inicial (USD)</span><div><input inputMode="decimal" value={entrada} onChange={e => setEntrada(e.target.value)} /></div></label>
      <label><span>Unidade dos limites</span><select value={percentual ? 'pct' : 'usd'} onChange={e => { setPercentual(e.target.value === 'pct'); setLimite(''); setMeta('') }}><option value="pct">Percentual da banca (%)</option><option value="usd">Valor em USD</option></select></label>
      <label><span>Limite de perda planejado ({percentual ? '%' : 'USD'})</span><div><input inputMode="decimal" value={limite} onChange={e => setLimite(e.target.value)} /></div></label>
      <label><span>Objetivo de ganho ({percentual ? '%' : 'USD'})</span><div><input inputMode="decimal" value={meta} onChange={e => setMeta(e.target.value)} /></div></label>
    </div><p className="go-banca-nota">O valor indicado para iniciar as operações é uma banca de pelo menos US$ 100. Porém, a partir de US$ 50, já é possível fazer boas operações seguindo o gerenciamento e, ainda assim, conseguir escalar.</p></aside>
    <div className="go-resultados">{!valido ? <p role="alert">Preencha valores válidos: banca positiva, entrada a partir de 0,01, limites não negativos e perda planejada até o valor da banca.</p> : <>
      <div className="go-veredito"><b>Resumo do cenário</b><p>Entrada inicial: {(base / saldo * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% da banca. Objetivo de ganho: {dinheiro(objetivo)}. Não é uma previsão de resultado.</p></div>
      <div className="go-cards tres"><article><span>Limite planejado</span><strong>{dinheiro(teto)}</strong><small>Sem parada automática</small></article><article><span>Perdas dentro do limite</span><strong>{cabem.length}{!proxima ? '+' : ''}</strong><small>Etapas completas simuladas</small></article><article><span>Perda acumulada</span><strong>{dinheiro(acumulado)}</strong><small>Antes de ultrapassar o limite</small></article></div>
      <section className="go-planilha go-consulta-tabela"><h3>Sequência de perdas hipotéticas</h3><p>Sem reduzir automaticamente a próxima entrada. Até 60 etapas.</p><div className="go-consulta-scroll"><div className="go-tabela-cab"><span>Etapa</span><span>Entrada</span><span>Perda acumulada</span><span>Saldo restante</span><span>Situação</span></div><div className="go-tabela-corpo">{linhas.map(d => <div key={d.n}><span>Etapa {d.n}</span><b>{dinheiro(d.valor)}</b><b>{dinheiro(d.perdido)}</b><b>{dinheiro(saldo - d.perdido)}</b><em className={d.perdido > teto + 1e-9 ? 'fora' : ''}>{d.perdido > teto + 1e-9 ? 'Ultrapassa o limite' : 'Dentro do limite'}</em></div>)}</div></div></section>
    </>}</div></section>
  </main>
}
