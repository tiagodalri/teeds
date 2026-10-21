import type { WorkspacePage } from '../WorkspaceNav'
import './barra-inferior.css'

/**
 * A barra de baixo do celular e do app (20/10/2026), como nos apps de banco:
 * o polegar alcança as telas mais usadas sem abrir o menu. "Mais" abre o
 * menu completo (o mesmo do botão de cima). Some no computador (CSS) e
 * quando o teclado está aberto, para não subir junto com ele.
 */
const ITENS: Array<{ id: WorkspacePage | 'mais'; rotulo: string; d: string }> = [
  { id: 'inicio', rotulo: 'Início', d: 'M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5' },
  { id: 'robos', rotulo: 'I.A.', d: 'M5 7h14v13H5zM12 3v4M8 12h1m6 0h1M9 16h6' },
  { id: 'operar', rotulo: 'Manual', d: 'M3 17l5-6 4 3 9-11M16 3h5v5' },
  { id: 'aulas', rotulo: 'Aulas', d: 'M3 5h7l2 2 2-2h7v15h-7l-2 1-2-1H3zM12 7v14' },
  { id: 'mais', rotulo: 'Mais', d: 'M5 12h.01M12 12h.01M19 12h.01' },
]
const DO_MENU: WorkspacePage[] = ['inicio', 'robos', 'operar', 'aulas']

export function BarraInferior({ tela, irPara, aoVivoAgora = false }: { tela: WorkspacePage; irPara: (t: WorkspacePage) => void; aoVivoAgora?: boolean }) {
  return (
    <nav className="barra-inferior" aria-label="Navegação rápida">
      {ITENS.map((i) => {
        const ativo = i.id === 'mais' ? !DO_MENU.includes(tela) : tela === i.id
        return (
          <button key={i.id} type="button" className={ativo ? 'ativo' : ''} aria-current={ativo && i.id !== 'mais' ? 'page' : undefined}
            onClick={() => (i.id === 'mais' ? window.dispatchEvent(new Event('menu:abrir')) : irPara(i.id))}>
            <span className="barra-icone">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={i.d} /></svg>
              {i.id === 'mais' && aoVivoAgora && <i className="barra-ao-vivo" aria-label="Sala ao vivo agora" />}
            </span>
            <span className="barra-rotulo">{i.rotulo}</span>
          </button>
        )
      })}
    </nav>
  )
}
