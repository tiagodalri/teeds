/** Laboratório (?tela=encerradas): filtro de dia/horário e totais das sessões encerradas, com sessões de exemplo, sem banco. */
import { useMemo, useState } from 'react'
import type { MarkupDaSessao, SessaoEncerrada } from '../../core/teeds/monitoramento'
import { FiltroDePeriodo, TotaisDasEncerradas, TEMPO_PADRAO, noPeriodo, rotuloDoPeriodo, type FiltroDeTempo } from './PeriodoDasEncerradas'

const MOTIVOS = ['meta de lucro atingida (USD 5.11)', 'limite de perda atingido (USD -9.00)', 'você pediu para parar', 'limite de perda protegido (USD 5.00)', 'limite de 200 operações']
const agora = Date.now()
const SESSOES: SessaoEncerrada[] = Array.from({ length: 420 }, (_, i) => {
  const fim = agora - ((i * 2654435761) % (30 * 24 * 60)) * 60_000
  const ops = 5 + ((i * 37) % 90), ganhas = Math.round(ops * (0.45 + ((i % 7) / 50)))
  return {
    id: `s${i}`, sessaoRef: `s${i}`, marca: 'globalfly', userId: `u${i % 40}`, contaId: `ROT${9000 + i}`, demo: i % 5 !== 0, moeda: 'USD',
    roboId: ['legacy', 'falcon', 'raptor'][i % 3], roboNome: ['GF Legacy', 'GF Falcon', 'GF Raptor'][i % 3], ativo: 'R_75', situacao: 'encerrada',
    operacoes: ops, ganhas, perdidas: ops - ganhas, resultado: Math.round((((i * 13) % 19) - 9) * 100) / 100,
    motivoDaParada: MOTIVOS[i % MOTIVOS.length], criadaEm: new Date(fim - 40 * 60_000).toISOString(), encerradaEm: new Date(fim).toISOString(), parceiro: 'v',
  }
})
const MARKUPS = new Map<string, MarkupDaSessao>(SESSOES.map((s) => [s.id, { operacoes: s.operacoes, markup: Math.round(s.operacoes * 4.3) / 100, markupDeriv: null }]))

export default function LabEncerradas() {
  const q = new URLSearchParams(location.search)
  const [tempo, setTempo] = useState<FiltroDeTempo>(TEMPO_PADRAO)
  const [conta, setConta] = useState(q.get('conta') ?? 'todas')
  const lista = useMemo(() => { const f = noPeriodo(tempo); return SESSOES.filter((s) => f(s) && (conta === 'todas' || (conta === 'real') !== s.demo)) }, [tempo, conta])
  return (
    <div className="monitoramento" style={{ padding: 24 }}>
      <section className="admin-card full mon-encerradas">
        <header><div><span className="rot">{rotuloDoPeriodo(tempo)}</span><h3>Sessões encerradas</h3></div><small>{lista.length} de {SESSOES.length} sessões</small></header>
        <div className="mon-filtros">
          <label className="mon-busca">⌕<input placeholder="Buscar nome, e-mail, conta ou I.A." /></label>
          <select value={conta} onChange={(e) => setConta(e.target.value)}><option value="todas">Demo e real</option><option value="real">Só real</option><option value="demo">Só demo</option></select>
          <select><option>Todas as I.A.</option></select>
          <select><option>Qualquer resultado</option></select>
          <select><option>Qualquer encerramento</option></select>
        </div>
        <FiltroDePeriodo valor={tempo} onTrocar={setTempo} temOutrosFiltros={conta !== 'todas'} onLimpar={() => { setTempo(TEMPO_PADRAO); setConta('todas') }} />
        <TotaisDasEncerradas lista={lista} markups={MARKUPS} somandoMarkup={q.has('somando')} mostrarMarkup={!q.has('normal')} />
      </section>
    </div>
  )
}
