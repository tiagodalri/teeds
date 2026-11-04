/** Laboratório: o menu da Administração em grupos (laboratorio.html?tela=menu-admin). Dados de mentira. */
import { useState } from 'react'
import { MenuDoAdmin, type GrupoDoMenu } from './MenuDoAdmin'
import type { NomeIcone } from './Icone'

export default function LabMenuAdmin() {
  const [aba, setAba] = useState('anuncios')
  const it = (id: string, nome: string, icone: NomeIcone, extra: { n?: number; urgente?: boolean; sai?: boolean } = {}) =>
    ({ id, nome, icone, sai: extra.sai, selo: extra.n != null ? { n: extra.n, urgente: extra.urgente } : null, onClick: () => setAba(id) })
  const grupos: GrupoDoMenu[] = [
    { id: 'topo', titulo: null, itens: [it('visao', 'Visão geral', 'inicio'), it('suporte', 'Suporte', 'suporte', { n: 2, urgente: true }), it('organizacao', 'Organização', 'organizacao', { n: 5, urgente: true })] },
    { id: 'captacao', titulo: 'Captação', itens: [it('anuncios', 'Anúncios', 'megafone'), it('leads', 'Leads', 'leads'), it('parceiros', 'Parceiros', 'parceiros')] },
    { id: 'contato', titulo: 'Lançamento e contato', itens: [it('lancamento', 'Live de lançamento', 'aovivo'), it('central', 'Central ao vivo', 'aovivo', { sai: true }), it('notificacoes', 'Notificações', 'sino'), it('emails', 'E-mails', 'emails')] },
    { id: 'clientes', titulo: 'Clientes', itens: [it('clientes', 'Clientes', 'clientes', { n: 273 }), it('movimentacoes', 'Depósitos e saques', 'movimentacoes'), it('resultados', 'Resultados', 'resultados')] },
    { id: 'numeros', titulo: 'Números', itens: [it('inteligencia', 'Inteligência', 'inteligencia'), it('estudo', 'Centro de estudo', 'estudo'), it('comissoes', 'Comissões', 'comissoes'), it('insights', 'Insights', 'insights', { sai: true }), it('monitoramento', 'Monitoramento ao vivo', 'monitoramento', { sai: true })] },
    { id: 'config', titulo: 'Configurações da plataforma', itens: [it('aulas', 'Aulas', 'aulas'), it('robos', 'I.A.', 'robos'), it('planos', 'Planos', 'planos'), it('produtos', 'Produtos', 'produtos')] },
  ]
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div><span className="rot">Painel de controle</span><h2>Administração</h2><p>Gestão completa da GlobalFly Trade</p></div>
        <MenuDoAdmin grupos={grupos} ativa={aba} />
        <small>Somente administradores podem visualizar e alterar estes dados.</small>
      </aside>
      <main className="admin-main"><header className="admin-top"><div><span className="rot">GlobalFly Trade Admin</span><h1>{aba}</h1><p>Conteúdo de exemplo da aba.</p></div></header>
        <div style={{ height: 1400 }} /></main>
    </div>
  )
}
