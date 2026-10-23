import { useMemo } from 'react'
import { Organizacao } from './Organizacao'
import { hojeISO, somarDias, type Comentario, type Marco, type OrgApi, type Pessoa, type Tarefa } from '../../core/teeds/organizacao'

/** Laboratório: a central com dados de mentira em memória (?tela=organizacao). */
export default function LabOrganizacao() {
  const api = useMemo<OrgApi>(() => {
    const h = hojeISO()
    const equipe: Pessoa[] = [
      { id: 'tiago', nome: 'Tiago Dal Ri', email: 'tiago@exemplo.com' },
      { id: 'vc', nome: 'Victor Cordeiro', email: 'vc@exemplo.com' },
      { id: 'vd', nome: 'Victor Dias de Avila', email: 'vd@exemplo.com' },
    ]
    let n = 0
    const t = (titulo: string, area: Tarefa['area'], prazo: string | null, extra: Partial<Tarefa> = {}): Tarefa => ({
      id: `t${++n}`, titulo, descricao: '', area, status: 'a_fazer', prioridade: 'media', responsavel: null, prazo,
      checklist: [], ordem: n, criadoPor: 'tiago', criadoEm: new Date().toISOString(), atualizadoEm: new Date().toISOString(), concluidoEm: null, ...extra,
    })
    const tarefas: Tarefa[] = [
      t('Conteúdo do dia no canal do Telegram', 'conteudo', h, { responsavel: 'vc', checklist: [{ texto: 'Manhã: leitura do mercado', feito: true }, { texto: 'Tarde: operação ao vivo', feito: false }, { texto: 'Noite: dúvida ou bastidor', feito: false }] }),
      t('Definir a oferta da live de lançamento', 'comercial', somarDias(h, 1), { prioridade: 'urgente', responsavel: 'vd' }),
      t('Copy das páginas de captação, quiz e obrigado', 'marketing', somarDias(h, 2), { prioridade: 'alta', responsavel: 'vc', status: 'fazendo' }),
      t('Páginas de captação, quiz e obrigado no globalflytrade.com', 'desenvolvimento', somarDias(h, 3), { prioridade: 'urgente', responsavel: 'tiago', status: 'fazendo', checklist: [{ texto: 'Cadastro', feito: true }, { texto: 'Quiz', feito: false }, { texto: 'Obrigado', feito: false }] }),
      t('Finalizar o prompt do chat do ao vivo', 'desenvolvimento', h, { responsavel: 'tiago' }),
      t('Criativos para o tráfego pago', 'trafego', somarDias(h, 4), { prioridade: 'alta' }),
      t('Cakto: ajustes finais', 'desenvolvimento', somarDias(h, -1), { prioridade: 'alta', responsavel: 'tiago' }),
      t('Finalizar as aulas', 'desenvolvimento', somarDias(h, 7), { prioridade: 'alta', responsavel: 'tiago', status: 'revisao' }),
      t('Criar a comunidade do WhatsApp', 'marketing', somarDias(h, 3), { responsavel: 'vd' }),
      t('Selo Silver/Gold no topo', 'desenvolvimento', somarDias(h, -1), { responsavel: 'tiago', status: 'feito', concluidoEm: new Date().toISOString() }),
      t('Coletar depoimentos reais', 'conteudo', null),
    ]
    let m = 0
    const marco = (titulo: string, data: string, tipo: Marco['tipo'], hora: string | null = null): Marco => ({ id: `m${++m}`, titulo, descricao: '', data, hora, tipo })
    const marcos: Marco[] = [
      marco('Início do aquecimento nos canais', h, 'campanha'),
      marco('Captação: onda 1 de disparos', somarDias(h, 4), 'captacao'),
      marco('Início do tráfego pago', somarDias(h, 5), 'trafego'),
      marco('Mini-live de aquecimento', somarDias(h, 12), 'live', '20:00'),
      marco('Live de lançamento', somarDias(h, 16), 'lancamento', '20:00'),
    ]
    const coms: Comentario[] = [{ id: 'c1', tarefaId: 't3', autor: 'vc', texto: 'Primeira versão no ar até amanhã.', criadoEm: new Date().toISOString() }]
    const espera = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(v), 120))
    return {
      euId: 'tiago',
      carregar: () => espera({ tarefas: [...tarefas], marcos: [...marcos], equipe, contagemComentarios: { t3: 1 } }),
      criarTarefa: (x) => { const nova = t(x.titulo, x.area, x.prazo, x); tarefas.push(nova); return espera(nova) },
      alterarTarefa: (id, c) => { const i = tarefas.findIndex((x) => x.id === id); tarefas[i] = { ...tarefas[i], ...c, concluidoEm: c.status === 'feito' ? new Date().toISOString() : c.status ? null : tarefas[i].concluidoEm }; return espera(tarefas[i]) },
      apagarTarefa: (id) => { tarefas.splice(tarefas.findIndex((x) => x.id === id), 1); return espera(undefined) },
      criarMarco: (x) => { const novo = { ...x, id: `m${++m}` }; marcos.push(novo); return espera(novo) },
      alterarMarco: (id, c) => { const i = marcos.findIndex((x) => x.id === id); marcos[i] = { ...marcos[i], ...c }; return espera(marcos[i]) },
      apagarMarco: (id) => { marcos.splice(marcos.findIndex((x) => x.id === id), 1); return espera(undefined) },
      comentarios: (id) => espera(coms.filter((c) => c.tarefaId === id)),
      comentar: (id, texto) => { const c = { id: `c${coms.length + 1}`, tarefaId: id, autor: 'tiago', texto, criadoEm: new Date().toISOString() }; coms.push(c); return espera(c) },
      apagarComentario: (id) => { coms.splice(coms.findIndex((c) => c.id === id), 1); return espera(undefined) },
      acompanhar: () => () => undefined,
    }
  }, [])
  return (
    <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <main className="admin-main"><Organizacao api={api} /></main>
    </div>
  )
}
