import { useState } from 'react'
import { AdminPlanos } from './AdminPlanos'
import type { SessaoTeeds } from '../core/teeds/conta'

/** Laboratório: Administração > Planos com o banco de mentira (?tela=planos). */
const linhas: any[] = [
  { id: 'essencial', nome: 'Sem simulador', descricao: 'Robôs, operar, aulas e gerenciamento, sem o simulador de treinamento.', duracao_dias: 30, ativo: true, padrao: true, recursos: { simulador: true, ao_vivo: true, sala_de_treino: false }, ordem: 1, criado_em: '2026-09-03T21:19:16Z', atualizado_em: '2026-10-26T15:00:00Z', clientes: 4, ativos: 3, expirados: 1, novos_30d: 2, pendentes: 0 },
  { id: 'pro', nome: 'Com simulador', descricao: 'Tudo do plano sem simulador, mais o simulador de treinamento.', duracao_dias: 30, ativo: true, padrao: false, recursos: { simulador: true, ao_vivo: true, sala_de_treino: false }, ordem: 2, criado_em: '2026-09-03T21:19:16Z', atualizado_em: null, clientes: 2, ativos: 2, expirados: 0, novos_30d: 1, pendentes: 0 },
  { id: 'treino', nome: 'GF Member', descricao: 'Quem assiste os ensaios da sala de treino. Não entra na live aberta.', duracao_dias: null, ativo: true, padrao: false, recursos: { simulador: true, ao_vivo: false, sala_de_treino: true }, ordem: 3, criado_em: '2026-10-18T20:38:48Z', atualizado_em: null, clientes: 1, ativos: 1, expirados: 0, novos_30d: 1, pendentes: 0 },
]
let instalado = false
function bancoDeMentira() {
  if (instalado) return; instalado = true
  const original = window.fetch.bind(window)
  window.fetch = async (url, init) => {
    const u = String(url)
    const corpo = init?.body ? JSON.parse(String(init.body)) : {}
    const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json' } })
    await new Promise((r) => setTimeout(r, 150))
    if (u.includes('/rpc/teeds_planos_painel')) return json(linhas)
    if (u.includes('/rpc/teeds_plano_salvar')) {
      const id = corpo.p_id || `globalfly-${String(corpo.p_nome).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}`
      if (corpo.p_padrao) linhas.forEach((l) => { if (l.id !== id) l.padrao = false })
      const r = { simulador: !!corpo.p_recursos.simulador, ao_vivo: corpo.p_recursos.ao_vivo !== false, sala_de_treino: !!corpo.p_recursos.sala_de_treino }
      const l = linhas.find((x) => x.id === id)
      if (l) Object.assign(l, { nome: corpo.p_nome, descricao: corpo.p_descricao, duracao_dias: corpo.p_duracao_dias, ativo: corpo.p_ativo, padrao: corpo.p_padrao, recursos: r, atualizado_em: new Date().toISOString() })
      else linhas.push({ id, nome: corpo.p_nome, descricao: corpo.p_descricao, duracao_dias: corpo.p_duracao_dias, ativo: corpo.p_ativo, padrao: corpo.p_padrao, recursos: r, ordem: linhas.length + 1, criado_em: new Date().toISOString(), atualizado_em: null, clientes: 0, ativos: 0, expirados: 0, novos_30d: 0, pendentes: 0 })
      return json(id)
    }
    if (u.includes('/rpc/teeds_plano_apagar')) {
      const i = linhas.findIndex((x) => x.id === corpo.p_id)
      if (linhas[i]?.clientes) return json({ message: 'Há clientes neste plano.' }, 400)
      linhas.splice(i, 1); return new Response(null, { status: 204 })
    }
    return original(url, init)
  }
}

export default function LabPlanos() {
  bancoDeMentira()
  const [sessao] = useState<SessaoTeeds>({ token: 'lab', refresh: '', expiraEm: Date.now() + 3600e3, usuario: { id: 'lab', email: 'lab@exemplo.com', nome: 'Laboratório' } as SessaoTeeds['usuario'] })
  return (
    <div className="workspace-app" style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <main className="admin-main"><AdminPlanos sessao={sessao} /></main>
    </div>
  )
}
