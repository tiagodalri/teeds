import { useState } from 'react'
import { IDENTIDADES, type Identidade } from '../core/deriv/branding'
import { Emblema } from './RobotCard'

/** Selection only: starting an order still requires the existing setup. */
export function RobotCatalog({ selected, onSelect, onCompare, indisponivel = false }: {
  selected: string; onSelect: (modelo: Identidade) => void; onCompare: () => void; indisponivel?: boolean
}) {
  const [search, setSearch] = useState('')
  const normalizar = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const modelos = IDENTIDADES.filter(i => normalizar(`${i.nome} ${i.chamada} ${i.descricao}`).includes(normalizar(search.trim())))
  return <section className="robot-catalog" aria-label="Escolher robô">
    <header><div><span className="rob-eyebrow">ESCOLHA SUA ESTRATÉGIA</span><h3>Qual será seu próximo robô?</h3><p>Selecionar um modelo não altera robôs em execução.</p></div><button onClick={onCompare}>Comparar modelos</button></header>
    <div className="robot-catalog-tools"><ol aria-label="Etapas para iniciar"><li><b>1</b> Escolha o modelo</li><li><b>2</b> Defina os limites</li><li><b>3</b> Revise e ligue</li></ol><input type="search" aria-label="Buscar modelo de robô" placeholder="Buscar modelo…" value={search} onChange={e => setSearch(e.target.value)} /></div>
    <div className="robot-catalog-grid">{modelos.map(i => <button key={i.id} className={`robot-model ${selected === i.id ? 'selected' : ''}`} aria-pressed={selected === i.id} disabled={indisponivel} onClick={() => onSelect(i)}>
      <span className="robot-model-heading"><Emblema id={i} tamanho={38} /><span><small>{i.chamada}</small><strong>{i.nome}</strong></span>{selected === i.id && <span className="robot-model-check" aria-label="Selecionado">✓</span>}</span>
      <span className="robot-model-description">{i.descricao}</span>
      <span className="robot-model-footer">{selected === i.id ? 'Modelo selecionado' : 'Selecionar modelo'}<span aria-hidden="true">→</span></span>
    </button>)}</div>
    {modelos.length === 0 && <div className="robot-catalog-empty">Nenhum modelo encontrado. <button onClick={() => setSearch('')}>Limpar busca</button></div>}
    <small className="robot-catalog-note">{indisponivel ? 'Todos os painéis estão ocupados. Feche um painel encerrado para preparar outro robô. ' : ''}Os limites operacionais da conta continuam valendo. Nenhuma estratégia garante resultado.</small>
  </section>
}
