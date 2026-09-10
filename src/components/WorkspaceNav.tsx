import { useState } from 'react'
import { Brand } from './Brand'
import './workspace.css'

export type WorkspacePage = 'operar' | 'robos' | 'assistente' | 'gestao' | 'gerenciamento' | 'marketplace' | 'aulas'
export const PAGE_NAMES: Record<WorkspacePage, string> = { operar: 'Operar', robos: 'Robôs', assistente: 'Assistente', gestao: 'Administração', gerenciamento: 'Gerenciamento', marketplace: 'Marketplace', aulas: 'Aulas' }
const paths: Record<string, string> = {
  operar: 'M3 17l5-6 4 3 9-11M16 3h5v5', robos: 'M5 7h14v13H5zM12 3v4M8 12h1m6 0h1M9 16h6',
  assistente: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  operacoes: 'M5 4h14v17H5zM8 8h8M8 12h8M8 16h5', gerenciamento: 'M4 20V10m8 10V4m8 16v-7',
  marketplace: 'M4 8h16l-1 13H5zM8 8V6a4 4 0 018 0v2', aulas: 'M3 5h7l2 2 2-2h7v15h-7l-2 1-2-1H3zM12 7v14',
  gestao: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
}
export function WorkspaceNav({ page, admin, onNavigate }: { page: WorkspacePage; admin: boolean; onNavigate: (page: WorkspacePage) => void }) {
  const [compact, setCompact] = useState(false)
  const [open, setOpen] = useState(false)
  const navigate = (next: WorkspacePage) => { onNavigate(next); setOpen(false) }
  const item = (id: WorkspacePage) => <button key={id} className={`workspace-link ${page === id ? 'selected' : ''}`} aria-current={page === id ? 'page' : undefined} title={PAGE_NAMES[id]} onClick={() => navigate(id)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]} /></svg>
    <span className="workspace-label">{PAGE_NAMES[id]}</span>{id === 'assistente' && <small className="workspace-label">BETA</small>}
  </button>
  return <>
    <button className="workspace-mobile-toggle" aria-expanded={open} aria-controls="workspace-navigation" onClick={() => setOpen(!open)}>{open ? '× Fechar' : '☰ Menu'}</button>
    {open && <button className="workspace-shade" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
    <aside className={`workspace-sidebar ${compact ? 'compact' : ''} ${open ? 'mobile-open' : ''}`} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <button className="workspace-brand" aria-label="Página inicial" onClick={() => navigate('operar')}><Brand assinatura /></button>
      <nav id="workspace-navigation" aria-label="Navegação principal">
        <p className="workspace-label">Seu workspace</p>
        {item('operar')}{item('robos')}
        <button className="workspace-link" disabled title="Operações temporariamente indisponíveis"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d={paths.operacoes} /></svg><span className="workspace-label">Operações</span><small className="workspace-label">EM BREVE</small></button>
        <p className="workspace-label">Ferramentas</p>{item('gerenciamento')}{item('assistente')}
        <p className="workspace-label">Explore</p>{item('marketplace')}{item('aulas')}
        {admin && <div className="workspace-admin">{item('gestao')}</div>}
      </nav>
      <button className="workspace-collapse" onClick={() => setCompact(!compact)} aria-label={compact ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!compact}>{compact ? '»' : '«'}<span className="workspace-label"> Recolher menu</span></button>
    </aside>
  </>
}
