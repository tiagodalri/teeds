/** Laboratório: o menu da Administração em grupos (laboratorio.html?tela=menu-admin). Dados de mentira. */
import { useState } from 'react'
import { MenuDoAdmin, type GrupoDoMenu } from './MenuDoAdmin'
import { Icone, type NomeIcone } from './Icone'
import { SeletorDePlataforma } from './SeletorDePlataforma'
import './admin-topo.css'
import './suporte/admin-suporte.css'

export default function LabMenuAdmin() {
  const [aba, setAba] = useState('anuncios')
  const [parc, setParc] = useState('n')
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
    // como no painel de verdade: a aba Suporte vira o modo de atendimento (coluna de ícones)
    <div className={`admin-shell${aba === 'suporte' ? ' modo-suporte' : ''}`}>
      <aside className="admin-sidebar">
        <div><span className="rot">Painel de controle</span><h2>Administração</h2><p>Gestão completa da GlobalFly Trade</p></div>
        <MenuDoAdmin grupos={grupos} ativa={aba} />
        <small>Somente administradores podem visualizar e alterar estes dados.</small>
      </aside>
      <main className="admin-main"><header className="admin-top"><div><span className="rot">GlobalFly Trade Admin</span><h1>Anúncios e rastreio</h1><p>Do anúncio ao dinheiro: de onde vem cada pessoa, cada passo dela, o que cada anúncio e cada divulgação trazem, até o depósito e o markup.</p></div>
        <div className="admin-top-acoes"><SeletorDePlataforma valor="globalfly" opcoes={[{ id: 'globalfly', nome: 'GlobalFly Trade', papel: '' }]} onTrocar={() => undefined}
          parceiros={[{ codigo: 'n', nome: 'Naor Bezerra' }, { codigo: 'v', nome: 'Victor Cordeiro' }]} parceiro={parc} onParceiro={setParc} soParceiros />
          <button className="admin-refresh"><Icone nome="atualizar" />Atualizar</button></div></header>
        <div style={{ height: 1400 }} /></main>
    </div>
  )
}
