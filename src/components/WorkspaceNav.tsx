import { useState } from 'react'
import { Brand } from './Brand'
import { MARCA } from '../marca'
import './workspace.css'

export type WorkspacePage = 'inicio' | 'operar' | 'robos' | 'assistente' | 'gestao' | 'insights' | 'monitoramento' | 'gerenciamento' | 'marketplace' | 'aulas' | 'aovivo' | 'noticias'
export const PAGE_NAMES: Record<WorkspacePage, string> = { inicio: 'Início', operar: 'Manual', robos: 'Robôs', assistente: 'Assistente', gestao: 'Administração', insights: 'Insights', monitoramento: 'Monitoramento ao vivo', gerenciamento: 'Gerenciamento', marketplace: 'Marketplace', aulas: 'Aulas', aovivo: 'Ao vivo', noticias: 'Notícias', ...(MARCA.menu?.nomes ?? {}) }
const paths: Record<string, string> = {
  inicio: 'M3 11l9-7 9 7M5 9.5V20h5v-6h4v6h5V9.5',
  operar: 'M3 17l5-6 4 3 9-11M16 3h5v5', robos: 'M5 7h14v13H5zM12 3v4M8 12h1m6 0h1M9 16h6',
  assistente: 'M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z',
  gerenciamento: 'M4 20V10m8 10V4m8 16v-7',
  marketplace: 'M4 8h16l-1 13H5zM8 8V6a4 4 0 018 0v2', aulas: 'M3 5h7l2 2 2-2h7v15h-7l-2 1-2-1H3zM12 7v14',
  gestao: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6',
  insights: 'M4 19h16M6 16V10m4 6V6m4 10v-4m4 4V8',
  monitoramento: 'M3 5h18v11H3zM8 20h8M12 16v4M6 13l3-3 2 2 4-5 3 3',
  aovivo: 'M12 12h.01M8.5 15.5a5 5 0 010-7M15.5 8.5a5 5 0 010 7M5.6 18.4a9 9 0 010-12.8M18.4 5.6a9 9 0 010 12.8',
  // jornal dobrado com a linha do gráfico
  noticias: 'M4 5h13v14a1 1 0 001 1H6a2 2 0 01-2-2zM17 9h3v9a2 2 0 01-2 2M7 9h7M7 12.5h7M7 16h4',
  // a marca pode trocar o desenho de um item (ver `menu` em marcas.ts)
  ...(MARCA.menu?.icones ?? {}),
}
export function WorkspaceNav({ page, admin, onNavigate, aoVivoAgora = false, mostrarAoVivo = true, mostrarInicio = false }: { page: WorkspacePage; admin: boolean; onNavigate: (page: WorkspacePage) => void; aoVivoAgora?: boolean; mostrarAoVivo?: boolean; mostrarInicio?: boolean }) {
  const [compact, setCompact] = useState(false)
  const [open, setOpen] = useState(false)
  const navigate = (next: WorkspacePage) => { onNavigate(next); setOpen(false) }
  const estaSelecionado = (id: WorkspacePage) => page === id || (id === 'gestao' && (page === 'monitoramento' || page === 'insights'))
  const item = (id: WorkspacePage) => <button key={id} className={`workspace-link ${estaSelecionado(id) ? 'selected' : ''} ${id === 'aovivo' && aoVivoAgora ? 'no-ar' : ''}`} aria-current={estaSelecionado(id) ? 'page' : undefined} title={PAGE_NAMES[id]} onClick={() => navigate(id)}>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[id]} /></svg>
    <span className="workspace-label">{PAGE_NAMES[id]}</span>{id === 'aovivo' && aoVivoAgora && <i className="workspace-aovivo" aria-label="Transmissão no ar agora" title="Transmissão no ar agora"><b className="workspace-label">ao vivo</b></i>}{id === 'assistente' && <small className="workspace-lock workspace-label" aria-label="Acesso restrito" title="Acesso restrito"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></svg></small>}
  </button>
  return <>
    <button className={`workspace-mobile-toggle ${aoVivoAgora && !open ? 'no-ar' : ''}`} aria-expanded={open} aria-controls="workspace-navigation" aria-label={open ? 'Fechar menu' : 'Abrir menu'} title={open ? 'Fechar menu' : 'Menu'} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">{open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}</svg>
    </button>
    {open && <button className="workspace-shade" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
    <aside className={`workspace-sidebar ${compact ? 'compact' : ''} ${open ? 'mobile-open' : ''}`} onKeyDown={e => { if (e.key === 'Escape') setOpen(false) }}>
      <button className="workspace-brand" aria-label="Página inicial" onClick={() => navigate('operar')}><Brand assinatura /></button>
      <nav id="workspace-navigation" aria-label="Navegação principal">
        {/* Robôs primeiro, e o terminal manual depois (Tiago, 02/10/2026):
            quem entra na plataforma vem para ligar um robô; operar na mão é a
            exceção. O id da tela continua 'operar' de propósito — trocar o id
            quebraria o que já está gravado em sessões e links. */}
        {/* a home (20/10/2026): primeiro item, quando a marca liga */}
        {mostrarInicio && item('inicio')}
        <p className="workspace-label">Operações</p>
        {item('robos')}{item('operar')}
        <p className="workspace-label">Ferramentas</p>{item('gerenciamento')}{item('assistente')}
        <p className="workspace-label">Explore</p>{MARCA.aoVivo && mostrarAoVivo && item('aovivo')}{MARCA.noticias && item('noticias')}{item('marketplace')}{item('aulas')}
        {admin && <div className="workspace-admin">{item('gestao')}</div>}
      </nav>
      <button className="workspace-collapse" onClick={() => setCompact(!compact)} aria-label={compact ? 'Expandir menu' : 'Recolher menu'} aria-expanded={!compact}>{compact ? '»' : '«'}<span className="workspace-label"> Recolher menu</span></button>
    </aside>
  </>
}
