import { useEffect, useState } from 'react'
import { WorkspaceNav, type WorkspacePage } from '../WorkspaceNav'
import { UserMenu } from '../UserMenu'
import { SuporteWidget } from './SuporteWidget'
import { AdminSuporte } from './AdminSuporte'
import { AjudaPagina } from '../ajuda/AjudaPagina'
import { InicioPanel } from '../inicio/InicioPanel'
import type { SessaoTeeds } from '../../core/teeds/conta'

/**
 * ?tela=suporte&modo=cliente|novo|admin|ajuda&tema=escuro|claro — o suporte
 * com conversas de EXEMPLO. As chamadas ao banco são respondidas aqui mesmo:
 * nada sai do navegador.
 */
const agora = Date.now()
const iso = (minAtras: number) => new Date(agora - minAtras * 60000).toISOString()
const U = { lucas: '11111111-1111-4111-8111-111111111111', ana: '22222222-2222-4222-8222-222222222222', joao: '33333333-3333-4333-8333-333333333333', bia: '44444444-4444-4444-8444-444444444444' }
const conversa = (id: string, user: string, o: Record<string, unknown>) => ({
  id, marca: 'globalfly', user_id: user, status: 'aberta', prioridade: 'normal', etiquetas: [], assunto: null, responsavel: null, responsavel_nome: null, origem: 'inicio',
  contexto: { tela: 'robos', aparelho: 'iPhone/iPad', navegador: 'Safari', app: true }, criada_em: iso(40), atualizada_em: iso(3), ultima_mensagem: null, ultima_de: 'cliente', ultima_em: iso(3),
  aguardando_desde: iso(3), primeira_resposta_em: null, resolvida_em: null, nao_lidas_cliente: 0, nao_lidas_equipe: 1, avaliacao: null, avaliacao_comentario: null, ...o,
})
const CONVERSAS = [
  conversa('c1', U.lucas, { assunto: 'Fiz o saque na Deriv e ainda não caiu', ultima_mensagem: 'Fiz o saque na Deriv ontem e ainda não caiu na minha conta', prioridade: 'urgente', etiquetas: ['conta-deriv', 'saque'], aguardando_desde: iso(42), nao_lidas_equipe: 2,
    contexto: { tela: 'inicio', aparelho: 'iPhone/iPad', navegador: 'Safari', app: true, triagem: { tema: 'saque', rotulo: 'Saque', etiqueta: 'saque', alta: true, respostas: [{ pergunta: 'Qual é a situação?', resposta: 'Pedi o saque e não caiu' }, { pergunta: 'Há quanto tempo você pediu?', resposta: 'De 1 a 3 dias' }], faqVistas: ['deposito-nao-caiu'] } } }),
  conversa('c2', U.ana, { assunto: 'Como ligo o Falcon na demo?', ultima_mensagem: 'Como ligo o Falcon na conta demo?', etiquetas: ['conta-deriv', 'ia'], aguardando_desde: iso(6), contexto: { tela: 'robos', aparelho: 'Windows', navegador: 'Chrome', app: false } }),
  conversa('c3', U.joao, { assunto: 'Não consigo entrar', ultima_mensagem: 'Pronto, já consegui entrar. Valeu!', status: 'respondida', prioridade: 'alta', etiquetas: ['acesso'], ultima_de: 'cliente', aguardando_desde: null, primeira_resposta_em: iso(110), criada_em: iso(130), nao_lidas_equipe: 0, responsavel: 'lab', responsavel_nome: 'Tiago Dal Ri' }),
  conversa('c4', U.bia, { assunto: 'Quero renovar o meu plano', ultima_mensagem: 'Obrigada pela ajuda!', status: 'resolvida', etiquetas: ['plano'], ultima_de: 'cliente', aguardando_desde: null, primeira_resposta_em: iso(1400), criada_em: iso(1430), resolvida_em: iso(60), nao_lidas_equipe: 0, avaliacao: 5, avaliacao_comentario: 'Atendimento rápido e muito educado.' }),
]
const msg = (id: string, conversa_id: string, autor: string, texto: string, min: number, o: Record<string, unknown> = {}) => ({ id, conversa_id, marca: 'globalfly', autor, autor_id: null, autor_nome: autor === 'equipe' ? 'Tiago Dal Ri' : autor === 'sistema' ? 'GlobalFly Trade' : 'Lucas', texto, anexo: null, interna: false, criada_em: iso(min), ...o })
const MENSAGENS: Record<string, unknown[]> = {
  c1: [
    msg('m1', 'c1', 'cliente', 'Oi! Fiz o saque na Deriv ontem e ainda não caiu na minha conta', 43),
    msg('m2', 'c1', 'sistema', 'Recebemos sua mensagem! Alguém da equipe GlobalFly Trade responde por aqui mesmo, e você é avisado nesta janela. Se puder, conte o que aconteceu com o máximo de detalhes (e mande um print, se tiver): assim resolvemos mais rápido.', 43),
    msg('m3', 'c1', 'equipe', 'Cliente com saque via PIX pendente na Deriv. Ver se falta verificação.', 30, { interna: true }),
    msg('m4', 'c1', 'equipe', 'Olá, Lucas! Tudo bem? Aqui é da equipe GlobalFly Trade. Já estou vendo o seu caso. Consegue me mandar um print da área Caixa da Deriv?', 28),
    msg('m5', 'c1', 'cliente', 'Mando sim, só um minuto', 3),
  ],
  c2: [msg('m6', 'c2', 'cliente', 'Como ligo o Falcon na conta demo?', 6), msg('m7', 'c2', 'sistema', 'Recebemos sua mensagem!', 6)],
  c3: [msg('m8', 'c3', 'cliente', 'Não consigo entrar, esqueci a senha', 130), msg('m9', 'c3', 'equipe', 'Na tela de entrada, toque em "Esqueci a senha" e receba o link no seu e-mail.', 110), msg('m10', 'c3', 'cliente', 'Pronto, já consegui entrar. Valeu!', 100)],
  c4: [msg('m11', 'c4', 'cliente', 'Quero renovar o meu plano', 1430), msg('m12', 'c4', 'equipe', 'Claro, Bia! Já renovei por mais 30 dias.', 1400), msg('m13', 'c4', 'cliente', 'Obrigada pela ajuda!', 70)],
}
const FICHAS: Record<string, unknown> = {
  [U.lucas]: { user_id: U.lucas, nome: 'Lucas Andrade Ribeiro', email: 'lucas.andrade@exemplo.com', telefone: '11987654321', cpf: '52998224725', plano_id: 'treino', status_acesso: 'ativo', acesso_expira_em: iso(-60 * 24 * 12), criado_em: iso(60 * 24 * 20), visto_em: iso(2), foto_url: null, end_cidade: 'São Paulo', end_uf: 'SP' },
  [U.ana]: { user_id: U.ana, nome: 'Ana Paula Souza', email: 'ana.souza@exemplo.com', telefone: '21998765432', cpf: null, plano_id: 'treino', status_acesso: 'ativo', foto_url: null },
  [U.joao]: { user_id: U.joao, nome: 'João Pedro Lima', email: 'joao.lima@exemplo.com', plano_id: 'treino', status_acesso: 'ativo', foto_url: null },
  [U.bia]: { user_id: U.bia, nome: 'Beatriz Martins', email: 'bia.martins@exemplo.com', plano_id: 'treino', status_acesso: 'ativo', foto_url: null },
}
const RESPOSTAS = [
  { id: 'r1', titulo: 'Saudação', texto: 'Olá, {nome}! Tudo bem? Aqui é da equipe GlobalFly Trade. Já estou vendo o seu caso.', ordem: 10 },
  { id: 'r2', titulo: 'Pedir print', texto: '{nome}, consegue me mandar um print da tela onde aparece isso?', ordem: 20 },
  { id: 'r3', titulo: 'Depósito e saque na Deriv', texto: 'O depósito e o saque são feitos direto na sua conta da Deriv (em Caixa / Cashier), {nome}.', ordem: 30 },
]

let instalado = false
function instalarRespostas(modo: string) {
  if (instalado) return
  instalado = true
  const original = window.fetch.bind(window)
  const responder = (d: unknown, init: ResponseInit = {}) => new Response(d === null ? null : JSON.stringify(d), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
  window.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url); const metodo = init?.method ?? 'GET'
    if (u.includes('/rpc/teeds_suporte_status')) return responder({ online: true, minutos: 6 })
    if (u.includes('/rpc/teeds_suporte_apagar_conversa')) return responder([])
    if (u.includes('/suporte_conversas')) {
      if (metodo === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': '0-1/2' } })
      if (metodo === 'PATCH') return new Response(null, { status: 204 })
      if (metodo === 'POST') { const b = JSON.parse(String(init?.body ?? '{}')); return responder([conversa(`n${Date.now()}`, 'lab', { status: 'aberta', aguardando_desde: null, nao_lidas_equipe: 0, assunto: b.assunto, contexto: b.contexto })]) }
      if (u.includes('nao_lidas_cliente=gt.0')) return responder([])
      if (modo === 'novo') return responder([])
      if (u.includes('user_id=eq.lab')) return responder([{ ...CONVERSAS[0], user_id: 'lab', status: 'respondida', aguardando_desde: null, nao_lidas_cliente: 1 }, CONVERSAS[3]])
      return responder(u.includes('user_id=eq.') ? CONVERSAS.filter((c) => u.includes(c.user_id)) : CONVERSAS)
    }
    if (u.includes('/suporte_mensagens')) {
      if (metodo === 'POST') { const b = JSON.parse(String(init?.body ?? '{}')); return responder([{ ...b, id: `m${Date.now()}`, criada_em: new Date().toISOString(), autor_nome: b.autor_nome ?? 'Lucas' }]) }
      const id = /conversa_id=eq\.([^&]+)/.exec(u)?.[1] ?? ''
      const l = (MENSAGENS[id] ?? []) as Array<{ interna?: boolean }>
      return responder(modo === 'admin' ? l : l.filter((m) => !m.interna))
    }
    if (u.includes('/suporte_respostas')) return responder(RESPOSTAS)
    if (u.includes('/suporte_presenca')) return new Response(null, { status: 201 })
    if (u.includes('/rest/v1/clientes')) {
      const um = /user_id=eq\.([^&]+)/.exec(u)?.[1]
      return responder(um ? [FICHAS[um]].filter(Boolean) : Object.values(FICHAS))
    }
    return original(url, init)
  }) as typeof fetch
}

export default function LabSuporte() {
  const q = new URLSearchParams(location.search)
  const modo = q.get('modo') ?? 'cliente'
  instalarRespostas(modo)
  const [tela, setTela] = useState<WorkspacePage>(modo === 'ajuda' ? 'ajuda' : modo === 'admin' ? 'gestao' : 'inicio')
  useEffect(() => { const t = q.get('tema'); if (t) document.documentElement.dataset.tema = t }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const sessao: SessaoTeeds = { token: 'lab', refresh: 'lab', expiraEm: agora + 3_600_000, usuario: { id: 'lab', email: 'lucas.andrade@exemplo.com', nome: 'Lucas Andrade', telefone: null, cpf: null, criadoEm: '', trocarSenha: false } }
  const nada = () => undefined
  return (
    <div className="app workspace-app">
      <WorkspaceNav page={tela} admin={modo === 'admin'} mostrarInicio onNavigate={setTela} />
      <header className="topbar">
        <div className="workspace-heading"><strong>{tela === 'ajuda' ? 'Ajuda' : tela === 'gestao' ? 'Administração' : 'Início'}</strong><span>{tela === 'ajuda' ? 'Respostas rápidas e o suporte da equipe' : tela === 'gestao' ? 'Suporte ao cliente' : 'Sua mesa de operações'}</span></div>
        <div className="topbar-right"><div className="status status-open so-bolinha" role="status" aria-label="Conectado" title="Conectado"><i /></div><UserMenu usuario={sessao.usuario} onSair={nada} onPerfil={nada} /></div>
      </header>
      {tela === 'ajuda' ? <AjudaPagina aoIr={(t) => setTela(t as WorkspacePage)} /> : tela === 'gestao' ? (
        // a mesma casca do painel do admin (AdminPanel, modo suporte), para medir a altura de verdade
        <div className="admin-shell modo-suporte">
          <aside className="admin-sidebar"><div><span className="rot">Painel de controle</span><h2>Administração</h2></div>
            <nav>{['Suporte', 'Visão geral', 'Clientes', 'Leads', 'Robôs'].map((n, i) => <button key={n} className={i === 0 ? 'on' : ''} title={n}><i>{n[0]}</i><span>{n}</span>{i === 0 && <b className="admin-fila-suporte">1</b>}</button>)}</nav></aside>
          <main className="admin-main">
            <header className="admin-top"><div><span className="rot">GlobalFly Trade Admin</span><h1>Suporte ao cliente</h1><p>As conversas dos clientes, em tempo real: o mais urgente primeiro.</p></div><div className="admin-top-acoes"><button className="admin-refresh">Atualizar</button></div></header>
            <AdminSuporte sessao={sessao} marca="globalfly" nomeDaEquipe="Tiago Dal Ri" />
          </main>
        </div>
      ) : (
        <InicioPanel d={{ nome: 'Lucas Andrade', conta: { conectada: false, demo: true, saldo: 0, moeda: 'USD' }, hoje: null, plano: null, frota: [], cotacoes: [], manchetes: [], aula: null, treino: null, jornada: { deriv: false, demo: false, gestao: false, primeiraIa: false } }} aoIr={(t) => setTela(t)} aoSalvarPlano={() => undefined} aoPrepararRobo={() => undefined} />
      )}
      {modo !== 'admin' && <SuporteWidget sessao={sessao} nome="Lucas Andrade" telaAtual={tela} admin={false} irPara={(t) => setTela(t as WorkspacePage)} />}
    </div>
  )
}
