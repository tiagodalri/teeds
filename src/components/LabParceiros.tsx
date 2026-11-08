import { AdminParceiros, type ApiParceiros } from './AdminParceiros'
import type { LinhaDoParceiro } from '../core/teeds/parceiro'
import type { SessaoTeeds } from '../core/teeds/conta'

/** Laboratório: Admin > Parceiros com números de exemplo (?tela=parceiros; &erro=1 mostra a falha). */
const cli = (nome: string, email: string, dias: number, ops: number, markup: number, fonte = 'cadastro') =>
  ({ userId: email, nome, email, criadoEm: new Date(Date.now() - dias * 864e5).toISOString(), status: 'ativo', fonte, operacoes: ops, markup, volume: ops * 2.1 })
const linhas: LinhaDoParceiro[] = [
  { codigo: 'n', nome: 'Naor Bezerra', cliques: 412, leads: 96, contasNovas: 41, clientes: 41, ativos: 38, operaram: 27, operacoes: 5320, volume: 11172, markup: 334.18, resultado: -812.4,
    lista: [cli('Mariana Souza', 'mariana@exemplo.com', 2, 1240, 88.12), cli('Carlos Lima', 'carlos@exemplo.com', 3, 860, 61.4), cli('Ana Paula Reis', 'ana@exemplo.com', 1, 410, 29.9, 'navegador'), cli('João Pedro', 'joao@exemplo.com', 0, 0, 0)] },
  { codigo: 'v', nome: 'Victor Cordeiro', cliques: 655, leads: 140, contasNovas: 58, clientes: 58, ativos: 55, operaram: 39, operacoes: 8110, volume: 17031, markup: 512.77, resultado: -1203.9,
    lista: [cli('Rafaela Dias', 'rafa@exemplo.com', 4, 2210, 140.3), cli('Bruno Alves', 'bruno@exemplo.com', 5, 990, 66.8, 'manual')] },
  { codigo: '', nome: 'Direto (sem link)', cliques: 0, leads: 12, contasNovas: 6, clientes: 14, ativos: 9, operaram: 3, operacoes: 220, volume: 462, markup: 13.9, resultado: -40,
    lista: [cli('Tiago Dal Ri', 'tiago@exemplo.com', 11, 120, 7.5, '')] },
]
export default function LabParceiros() {
  const erro = new URLSearchParams(location.search).has('erro')
  const api: ApiParceiros = {
    relatorio: async () => { await new Promise((r) => setTimeout(r, 400)); if (erro) throw new Error('Só o admin geral vê o relatório por parceiro.'); return linhas },
    trocar: async () => { await new Promise((r) => setTimeout(r, 400)); return null },
    // &chave=1: Naor com chave própria e envios; Victor usando a chave da conta, ainda sem envio. &chave=erro: Meta recusou.
    pixel: async (_s, codigo) => {
      const q = new URLSearchParams(location.search).get('chave')
      if (q === null) return { temChave: false, origemChave: null, chaveEm: null, enviados: 0, semChave: 12, ultimoEnvio: null, ultimoErro: null }
      const base = { temChave: true, chaveEm: new Date(Date.now() - 864e5).toISOString(), semChave: 0 }
      if (q === 'erro') return { ...base, origemChave: 'propria' as const, enviados: 3, ultimoEnvio: new Date(Date.now() - 7200e3).toISOString(), ultimoErro: { em: new Date(Date.now() - 600e3).toISOString(), detalhe: 'Invalid OAuth access token' } }
      return codigo === 'v'
        ? { ...base, origemChave: 'conta' as const, enviados: 0, ultimoEnvio: null, ultimoErro: null }
        : { ...base, origemChave: 'propria' as const, enviados: 607, ultimoEnvio: new Date(Date.now() - 600e3).toISOString(), ultimoErro: null }
    },
    salvarChave: async (_s, _p, chave) => { await new Promise((r) => setTimeout(r, 400)); if (chave && !/^EA/.test(chave)) throw new Error('Essa não parece a chave da Meta. Ela começa com EA e é bem comprida: copie de novo no Gerenciador de Eventos.'); return null },
  }
  const sessao = { token: 'lab', usuario: { id: 'lab' } } as unknown as SessaoTeeds
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24, boxSizing: 'border-box' }}><AdminParceiros sessao={sessao} api={api} /></div>
}
