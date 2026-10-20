import { useEffect } from 'react'
import { WorkspaceNav } from '../WorkspaceNav'
import { UserMenu } from '../UserMenu'
import { MeuPerfil } from './MeuPerfil'
import type { SessaoTeeds } from '../../core/teeds/conta'

/**
 * ?tela=perfil&caso=novo|completo&tema=escuro|claro — o "Meu perfil" dentro
 * da casca de verdade, com uma ficha de EXEMPLO (as chamadas ao banco são
 * respondidas aqui mesmo; nada sai do navegador).
 */
const EXEMPLO_COMPLETO = {
  nome: 'Lucas Andrade Ribeiro', cpf: '52998224725', telefone: '11987654321', email: 'lucas.andrade@exemplo.com',
  end_cep: '01310100', end_rua: 'Avenida Paulista', end_numero: '1578', end_complemento: 'Conj. 42', end_bairro: 'Bela Vista', end_cidade: 'São Paulo', end_uf: 'SP',
  foto_url: null, plano_id: 'treino', status_acesso: 'ativo', acesso_inicio: '2026-10-01T12:00:00Z', acesso_expira_em: '2026-11-30T12:00:00Z', criado_em: '2026-09-28T12:00:00Z', tour_visto_em: '2026-10-01T12:10:00Z',
}
const EXEMPLO_NOVO = {
  ...EXEMPLO_COMPLETO, nome: 'Lucas', cpf: null, telefone: null, end_cep: null, end_rua: null, end_numero: null, end_complemento: null, end_bairro: null, end_cidade: null, end_uf: null,
  acesso_expira_em: '2026-10-24T12:00:00Z',
}

export default function LabPerfil() {
  const q = new URLSearchParams(location.search)
  const ficha = q.get('caso') === 'completo' ? EXEMPLO_COMPLETO : EXEMPLO_NOVO
  useEffect(() => { const t = q.get('tema'); if (t) document.documentElement.dataset.tema = t }, []) // eslint-disable-line react-hooks/exhaustive-deps
  // responde as chamadas do perfil com a ficha de exemplo
  const original = window.fetch
  window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url)
    if (u.includes('/rest/v1/clientes')) return new Response((init?.method ?? 'GET') === 'GET' ? JSON.stringify([ficha]) : null, { status: (init?.method ?? 'GET') === 'GET' ? 200 : 204 })
    if (u.includes('/auth/v1/user') || u.includes('/storage/v1/')) return new Response('{}', { status: 200 })
    return original(url, init)
  }) as typeof fetch
  const sessao: SessaoTeeds = { token: 'lab', refresh: 'lab', expiraEm: Date.now() + 3_600_000, usuario: { id: 'lab', email: ficha.email, nome: ficha.nome, telefone: ficha.telefone, cpf: ficha.cpf, criadoEm: ficha.criado_em, trocarSenha: false } }
  const nada = () => undefined
  return (
    <div className="app workspace-app">
      <WorkspaceNav page="perfil" admin={false} mostrarInicio onNavigate={nada} />
      <header className="topbar">
        <div className="workspace-heading"><strong>Meu perfil</strong><span>Seus dados, seu plano e sua segurança</span></div>
        <div className="topbar-right">
          <div className="status status-open"><i /> Conectado</div>
          <UserMenu usuario={sessao.usuario} onSair={nada} onPerfil={nada} />
        </div>
      </header>
      <MeuPerfil sessao={sessao} contas={q.get('caso') === 'completo' ? [{ accountId: 'VRTC9001234', balance: 9241.79, currency: 'USD', group: 'row', status: 'active', type: 'demo' }, { accountId: 'CR5512345', balance: 312.4, currency: 'USD', group: 'row', status: 'active', type: 'real' }] : []}
        derivConectada={q.get('caso') === 'completo'} onConectarDeriv={nada} />
    </div>
  )
}
