import { useCallback, useEffect, useMemo, useState } from 'react'
import type { TeedsSocket } from '../core/deriv/client'
import { buscarOperacoes, paraCSV, resumir, type Operacao } from '../core/deriv/history'
import { MODELOS } from '../core/deriv/robots'
import { nomeDoRobo } from '../core/deriv/robotNames'
import { StatementPanel } from './StatementPanel'

interface Props {
  socket: TeedsSocket | null
  logado: boolean
  moeda: string
}

const NOMES: Record<string, string> = {
  DIGITOVER: 'Acima de', DIGITUNDER: 'Abaixo de', DIGITMATCH: 'Igual a',
  DIGITDIFF: 'Diferente de', DIGITEVEN: 'Par', DIGITODD: 'Ímpar',
  CALL: 'Subir', PUT: 'Descer', ONETOUCH: 'Toca', NOTOUCH: 'Não toca',
}

const din = (v: number, m = 'USD') =>
  `${m} ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const hora = (e: number) =>
  new Date(e * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

const dia = (e: number) =>
  new Date(e * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })

export function OperationsPanel({ socket, logado, moeda }: Props) {
  const [ops, setOps] = useState<Operacao[]>([])
  const [carregando, setCarregando] = useState(false)
  const [progresso, setProgresso] = useState<{ feitas: number; total: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroRobo, setFiltroRobo] = useState<string>('todos')
  const [filtroResultado, setFiltroResultado] = useState<'todos' | 'ganhos' | 'perdas'>('todos')
  const [limite, setLimite] = useState(60)
  const [aba, setAba] = useState<'contratos' | 'extrato'>('contratos')

  const carregar = useCallback(async () => {
    if (!socket) return
    setCarregando(true)
    setErro(null)
    setProgresso(null)
    try {
      const lista = await buscarOperacoes(socket, limite, (feitas, total) => setProgresso({ feitas, total }))
      setOps(lista)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
      setProgresso(null)
    }
  }, [socket, limite])

  useEffect(() => { carregar() }, [carregar])

  const robos = useMemo(() => {
    const set = new Map<string, number>()
    for (const o of ops) if (o.runId) set.set(o.runId, (set.get(o.runId) ?? 0) + 1)
    return [...set.entries()]
  }, [ops])

  const filtradas = useMemo(() => {
    return ops.filter((o) => {
      if (filtroRobo === 'manual' && o.runId) return false
      if (filtroRobo !== 'todos' && filtroRobo !== 'manual' && o.runId !== filtroRobo) return false
      if (filtroResultado === 'ganhos' && !o.ganhou) return false
      if (filtroResultado === 'perdas' && o.ganhou) return false
      return true
    })
  }, [ops, filtroRobo, filtroResultado])

  const r = useMemo(() => resumir(filtradas), [filtradas])

  function baixarCSV() {
    const blob = new Blob(['﻿' + paraCSV(filtradas)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `teeds-operacoes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!logado) {
    return <div className="ger-vazio"><h2>Operações</h2><p>Entre com sua conta Deriv para ver o histórico.</p></div>
  }

  return (
    <div className="ger ops">
      <div className="ger-topo">
        <div>
          <h2>Operações</h2>
          <p className="ger-sub">
            {aba === 'contratos'
              ? 'Cada contrato negociado — pelos robôs e por você'
              : 'Todo o dinheiro que entrou e saiu da conta'}
          </p>
          <div className="segmented sub-abas">
            <button className={aba === 'contratos' ? 'on' : ''} onClick={() => setAba('contratos')}>Contratos</button>
            <button className={aba === 'extrato' ? 'on' : ''} onClick={() => setAba('extrato')}>Extrato</button>
          </div>
        </div>
        <div className="ops-acoes" hidden={aba === 'extrato'}>
          <div className="segmented">
            {[30, 60, 120].map((n) => (
              <button key={n} className={limite === n ? 'on' : ''} onClick={() => setLimite(n)}>{n}</button>
            ))}
          </div>
          <button className="ops-btn" onClick={carregar} disabled={carregando}>
            {carregando ? 'buscando…' : 'Atualizar'}
          </button>
          <button className="ops-btn" onClick={baixarCSV} disabled={!filtradas.length}>Baixar CSV</button>
        </div>
      </div>

      {aba === 'extrato' && <StatementPanel socket={socket} moeda={moeda} />}

      {aba === 'contratos' && <>
      {erro && <div className="ger-erro">{erro}</div>}
      {progresso && (
        <div className="ops-progresso">
          buscando detalhes {progresso.feitas} de {progresso.total}
          <span style={{ width: `${(progresso.feitas / progresso.total) * 100}%` }} />
        </div>
      )}

      {/* -------- resumo -------- */}
      <div className="kpis ops-kpis">
        <div className="kpi">
          <span className="rot">Operações</span>
          <strong>{r.total}</strong>
          <span className="kpi-nota">{r.ganhos} ganhas · {r.perdas} perdidas</span>
        </div>
        <div className="kpi">
          <span className="rot">Taxa de acerto</span>
          <strong>{r.acerto.toFixed(1)}%</strong>
        </div>
        <div className="kpi">
          <span className="rot">Total movimentado</span>
          <strong>{din(r.movimentado, moeda)}</strong>
        </div>
        <div className="kpi">
          <span className="rot">Resultado</span>
          <strong className={r.resultado >= 0 ? 'ganho' : 'perda'}>
            {r.resultado >= 0 ? '+' : '−'}{din(Math.abs(r.resultado), moeda)}
          </strong>
          <span className="kpi-nota">{r.retorno >= 0 ? '+' : ''}{r.retorno.toFixed(1)}% do movimentado</span>
        </div>
        <div className="kpi">
          <span className="rot">Maior sequência</span>
          <strong className="seq">
            <em className="ganho">{r.maiorSequenciaGanho}</em>
            <i>/</i>
            <em className="perda">{r.maiorSequenciaPerda}</em>
          </strong>
          <span className="kpi-nota">ganhos seguidos / perdas seguidas</span>
        </div>
      </div>

      {/* -------- filtros -------- */}
      <div className="ops-filtros">
        <div className="segmented">
          <button className={filtroRobo === 'todos' ? 'on' : ''} onClick={() => setFiltroRobo('todos')}>Tudo</button>
          <button className={filtroRobo === 'manual' ? 'on' : ''} onClick={() => setFiltroRobo('manual')}>Manuais</button>
          {robos.map(([id, n]) => (
            <button key={id} className={filtroRobo === id ? 'on' : ''} onClick={() => setFiltroRobo(id)}>
              {nomeDoRobo(id, 'Robô ' + id.slice(-4))} ({n})
            </button>
          ))}
        </div>
        <div className="segmented">
          <button className={filtroResultado === 'todos' ? 'on' : ''} onClick={() => setFiltroResultado('todos')}>Todas</button>
          <button className={filtroResultado === 'ganhos' ? 'on' : ''} onClick={() => setFiltroResultado('ganhos')}>Ganhas</button>
          <button className={filtroResultado === 'perdas' ? 'on' : ''} onClick={() => setFiltroResultado('perdas')}>Perdidas</button>
        </div>
      </div>

      {/* -------- tabela -------- */}
      <div className="ops-tabela-caixa">
        <table className="ops-tabela">
          <thead>
            <tr>
              <th>Quando</th><th>Origem</th><th>Operação</th><th>Ativo</th>
              <th className="num">Valor</th><th>Entrada</th><th>Saída</th>
              <th>Resultado</th><th className="num">Lucro</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((o) => {
              const nome = NOMES[o.tipo] ?? o.tipo
              const comBarreira = ['DIGITOVER', 'DIGITUNDER', 'DIGITMATCH', 'DIGITDIFF'].includes(o.tipo)
              const ehDigito = o.tipo.startsWith('DIGIT')
              return (
                <tr key={o.contractId} className={o.ganhou ? 'venceu' : 'perdeu'}>
                  <td className="ops-quando">
                    <b>{hora(o.compra)}</b><span>{dia(o.compra)}</span>
                  </td>
                  <td>
                    {o.runId
                      ? <span className="tag-robo">{nomeDoRobo(o.runId, 'robô ' + o.runId.slice(-4))}</span>
                      : <span className="tag-manual">manual</span>}
                  </td>
                  <td className="ops-operação">
                    {nome}{comBarreira && o.barreira !== null ? ` ${o.barreira}` : ''}
                    {o.ticks > 0 && <em> · {o.ticks}t</em>}
                  </td>
                  <td className="ops-ativo">{o.ativo}</td>
                  <td className="num">{o.valor.toFixed(2)}</td>
                  <td className="num ops-spot">
                    {o.entrada?.toFixed(o.pipSize) ?? '—'}
                    {ehDigito && o.digitoEntrada !== null && <b className="dig-chip">{o.digitoEntrada}</b>}
                  </td>
                  <td className="num ops-spot">
                    {o.saida?.toFixed(o.pipSize) ?? '—'}
                    {ehDigito && o.digitoSaida !== null && (
                      <b className={`dig-chip ${o.ganhou ? 'ok' : 'nao'}`}>{o.digitoSaida}</b>
                    )}
                  </td>
                  <td>
                    <span className={`ops-res ${o.ganhou ? 'ok' : 'nao'}`}>
                      {o.ganhou ? 'ganhou' : 'perdeu'}
                    </span>
                  </td>
                  <td className={`num ${o.lucro >= 0 ? 'ganho' : 'perda'}`}>
                    {o.lucro >= 0 ? '+' : '−'}{Math.abs(o.lucro).toFixed(2)}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {!carregando && filtradas.length === 0 && (
          <p className="ger-nota" style={{ padding: 20, textAlign: 'center' }}>
            {ops.length === 0
              ? 'Nenhum contrato encontrado nesta conta ainda.'
              : `Nenhum contrato com esses filtros (${ops.length} carregados no total).`}
          </p>
        )}
      </div>
      </>}
    </div>
  )
}
