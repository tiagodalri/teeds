/** Laboratório (?tela=quem-online): a gaveta "Quem está online" com gente de exemplo, sem banco. */
import { useState } from 'react'
import { QuemEstaOnline, type Operando, type PessoaOnline } from './QuemEstaOnline'
import type { SessaoEspelho } from '../../core/teeds/espelho'

const NOMES = ['Ana Paula Ribeiro', 'Bruno Carvalho', 'Carla Mendes', 'Diego Fernandes', 'Elaine Souza', 'Fábio Martins', 'Gabriela Lima', 'Henrique Alves', 'Isabela Rocha', 'João Pedro Silva', 'Karina Duarte', 'Lucas Andrade']
const agora = Date.now()
const PESSOAS: PessoaOnline[] = NOMES.map((nome, i) => ({
  user_id: `u${i}`, nome, email: `${nome.split(' ')[0].toLowerCase()}@exemplo.com`, foto_url: null,
  plano_id: 'treino', plano: i % 4 === 0 ? 'GF Member · Black' : 'GF Member', categoria: 'gold', parceiro: i % 3 === 0 ? 'n' : i % 3 === 1 ? 'v' : null,
  visto_em: new Date(agora - i * 17_000).toISOString(), criado_em: new Date(agora - (i + 2) * 864e5).toISOString(), acesso_expira_em: '2027-11-10T02:59:59Z',
  cidade: ['São Paulo', 'Curitiba', 'Recife', null][i % 4], regiao: ['SP', 'PR', 'PE', null][i % 4],
  dispositivo: i % 3 === 2 ? 'computador' : 'celular', segundos_hoje: 300 + i * 410, acessos_hoje: 1 + (i % 4),
  real: i % 2 === 0 ? { saldo: [1250, 380.5, 5020, 90, 15700, 640][i / 2], moeda: 'USD', conta: `CR${5004000 + i}` } : null, tem_demo: true, ias: [],
}))
const sessao = (id: string, userId: string, robo: string, demo: boolean, resultado: number, minutos: number): SessaoEspelho => ({
  sessaoId: id, sessaoRef: id, marca: 'globalfly', userId, contaId: 'CR1', demo, moeda: 'USD', roboId: robo, roboNome: robo, ativo: 'R_75',
  config: {} as never, seq: 1, origemDoSeq: 'foto' as never, estado: { resultado, rodando: true } as never, situacao: 'rodando',
  emitidoEm: agora, recebidoEm: agora, atualizadaEm: new Date(agora).toISOString(), criadaEm: new Date(agora - minutos * 6e4).toISOString(), parceiro: null,
})
const OPERANDO: Operando[] = [
  { userId: 'u0', sessoes: [sessao('s1', 'u0', 'GF Raptor', false, 12.4, 18)], manual: false },
  { userId: 'u4', sessoes: [sessao('s2', 'u4', 'GF Falcon', false, -3.2, 6), sessao('s3', 'u4', 'GF Legacy', true, 7.9, 44)], manual: false },
  { userId: 'u7', sessoes: [], manual: true },
]

export default function LabQuemEstaOnline() {
  const [aberto, setAberto] = useState(true)
  // o banco de mentira: a consulta devolve as pessoas de exemplo
  const f = window.fetch
  window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('teeds_quem_esta_online')
    ? new Response(JSON.stringify(new URLSearchParams(location.search).has('vazio') ? [] : PESSOAS), { status: 200 })
    : f(u, i)) as typeof fetch
  const parceiros: Record<string, { texto: string; codigo: string }> = { n: { texto: 'Naor', codigo: 'n' }, v: { texto: 'Victor', codigo: 'v' } }
  return (
    <div className="app workspace-app" style={{ minHeight: '100dvh', padding: 24 }}>
      <button type="button" onClick={() => setAberto(true)}>Abrir</button>
      {aberto && <QuemEstaOnline sessao={{ token: 'lab' } as never} marcas={['globalfly']} parceiro="" operando={OPERANDO} clientes={new Map()}
        selo={(id) => { const p = PESSOAS.find((x) => x.user_id === id)?.parceiro; return p ? parceiros[p] : { texto: 'Direto', codigo: 'direto' } }}
        aoAbrirSessao={() => undefined} aoFechar={() => setAberto(false)} abaInicial={new URLSearchParams(location.search).get('aba') === 'operando' ? 'operando' : 'plataforma'} />}
    </div>
  )
}
