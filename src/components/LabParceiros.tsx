import { AdminParceiros, type ApiParceiros } from './AdminParceiros'
import type { LinhaDoParceiro } from '../core/teeds/parceiro'
import type { SessaoTeeds } from '../core/teeds/conta'
import type { ApiDeAfiliados, CartaoDeAfiliado, ResumoDeAfiliado } from '../core/teeds/afiliados'

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

/* Afiliado na Deriv (09/11/2026). &afiliado=parceiro: a visão do Naor (só o /n); &afiliado=vazio: ninguém ligou ainda. */
const zero: ResumoDeAfiliado = { cadastros: 0, contasReais: 0, primeiroDeposito: 0, primeiraOperacao: 0, operaram: 0, comissaoPaga: 0, comissaoPendente: 0, subafiliadosAtivos: 0, ganhoSubafiliados: 0 }
const diasDeExemplo = (n: number, escala: number) => Array.from({ length: n }, (_, i) => {
  const dia = new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10)
  const onda = Math.max(0, Math.sin(i / 2.3) + 0.6)
  return { dia, ...zero, cadastros: Math.round(onda * 4 * escala), contasReais: Math.round(onda * 3 * escala), primeiroDeposito: Math.round(onda * 1.4 * escala), operaram: Math.round(onda * 2 * escala), comissaoPaga: i < n - 3 ? +(onda * 6.2 * escala).toFixed(2) : 0, comissaoPendente: i >= n - 3 ? +(onda * 6.2 * escala).toFixed(2) : 0 }
})
const somar = (d: CartaoDeAfiliado['dias']): ResumoDeAfiliado => d.reduce((t, x) => ({ ...t, cadastros: t.cadastros + x.cadastros, contasReais: t.contasReais + x.contasReais, primeiroDeposito: t.primeiroDeposito + x.primeiroDeposito, comissaoPaga: +(t.comissaoPaga + x.comissaoPaga).toFixed(2), comissaoPendente: +(t.comissaoPendente + x.comissaoPendente).toFixed(2), operaram: Math.max(t.operaram, x.operaram) }), { ...zero })
function cartoesDeExemplo(modo: string | null): CartaoDeAfiliado[] {
  const dn = diasDeExemplo(13, 1.2)
  const naor: CartaoDeAfiliado = modo === 'vazio'
    ? { codigo: 'n', nome: 'Naor Bezerra', conexao: null, total: zero, operaramNoPeriodo: null, dias: [] }
    : { codigo: 'n', nome: 'Naor Bezerra', conexao: { quem: 'Naor Bezerra Santos', souEu: modo === 'parceiro', desde: new Date(Date.now() - 2 * 864e5).toISOString(), situacao: 'ok', detalhe: null, coletadoEm: new Date(Date.now() - 40 * 6e4).toISOString() }, total: somar(dn), operaramNoPeriodo: 19, dias: dn }
  if (modo === 'parceiro') return [naor]
  return [
    naor,
    { codigo: 'v', nome: 'Victor Cordeiro', conexao: null, total: zero, operaramNoPeriodo: null, dias: [] },
    { codigo: 'd', nome: 'Douglas', conexao: null, total: zero, operaramNoPeriodo: null, dias: [] },
    modo === 'vazio'
      ? { codigo: '', nome: 'Direto', conexao: null, total: zero, operaramNoPeriodo: null, dias: [] }
      : { codigo: '', nome: 'Direto', conexao: { quem: 'Tiago Dal Ri', souEu: true, desde: new Date(Date.now() - 864e5).toISOString(), situacao: 'reconectar', detalhe: 'A conexão da Deriv desta conta venceu ou não tem a permissão de leitura. Na plataforma, clique em Conectar Deriv e autorize de novo.', coletadoEm: new Date(Date.now() - 864e5).toISOString() }, total: somar(diasDeExemplo(13, 0.4)), operaramNoPeriodo: null, dias: diasDeExemplo(13, 0.4) },
  ]
}
const espera = () => new Promise((r) => setTimeout(r, 500))
const afiliados: ApiDeAfiliados = {
  painel: async () => { await espera(); const m = new URLSearchParams(location.search).get('afiliado'); return { cartoes: cartoesDeExemplo(m), geral: m !== 'parceiro', meuCodigo: m === 'parceiro' ? 'n' : null } },
  vincular: async () => { await espera(); throw new Error('A Deriv conectada nesta conta não é uma conta de afiliado. Entre na plataforma com a Deriv que é dona do link de afiliado e tente de novo.') },
  desvincular: async () => { await espera(); return { ok: true } },
  atualizar: async () => { await espera(); return { ok: true, contas: 1, dias: 3, defeitos: 0 } },
}
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
  return <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)', padding: 24, boxSizing: 'border-box' }}><AdminParceiros sessao={sessao} api={api} afiliados={afiliados} /></div>
}
