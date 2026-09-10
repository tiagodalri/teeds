import { useState } from 'react'
import { IDENTIDADES, type Identidade } from '../core/deriv/branding'
import { Emblema } from './RobotCard'

/** Browse and compare in place. Selection never sends an order. */
export function RobotCatalog({ selected, onSelect, indisponivel = false }: {
  selected: string; onSelect: (modelo: Identidade) => void; indisponivel?: boolean
}) {
  const [search, setSearch] = useState('')
  const normalize = (v: string) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const modelos = IDENTIDADES.filter(i => normalize(`${i.nome} ${i.chamada} ${i.descricao}`).includes(normalize(search.trim())))
  const atual = IDENTIDADES.find(i => i.id === selected) ?? IDENTIDADES[0]
  return <section className="robot-picker" aria-label="Escolher robô">
    <div className="robot-picker-list">
      <input type="search" aria-label="Buscar modelo de robô" placeholder="Buscar robô…" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="robot-picker-options" role="group" aria-label="Modelos disponíveis">{modelos.map(i =>
        <button type="button" key={i.id} className={`robot-model ${selected === i.id ? 'selected' : ''}`} aria-pressed={selected === i.id} disabled={indisponivel} onClick={() => onSelect(i)}>
          <Emblema id={i} tamanho={32} /><span><strong>{i.nome}</strong><small>{i.chamada}</small></span><span className="robot-model-check" aria-hidden="true">{selected === i.id ? '✓' : '›'}</span>
        </button>)}
        {modelos.length === 0 && <p>Nenhum robô encontrado. <button type="button" onClick={() => setSearch('')}>Limpar busca</button></p>}
      </div>
    </div>
    <article className="robot-picker-detail" style={{ ['--model-color' as string]: atual.cor }} aria-live="polite">
      <div className="robot-picker-emblem"><Emblema id={atual} tamanho={56} /></div>
      <span className="robot-picker-kicker">{atual.chamada}</span><h4>{atual.nome}</h4>
      <p>{atual.descricao}</p>
      <div className="robot-picker-next"><b>Você define os limites</b><span>Na sequência, escolha a entrada e quando a sessão deve parar.</span></div>
      <small>Nenhuma estratégia garante resultado. Os robôs da mesma conta compartilham o saldo.</small>
    </article>
  </section>
}
