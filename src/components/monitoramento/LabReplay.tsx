/**
 * Laboratório (?tela=replay): o replay de uma sessão encerrada, na visão do cliente, com o botão do MP4.
 * Lê uma sessão de exemplo de /lab-local/replay.json (fora do git) e responde as leituras do banco aqui mesmo.
 */
import { useEffect, useState } from 'react'
import { Replay } from '../MonitoramentoPanel'

type Dados = { mae: Record<string, any>; eventos: Array<Record<string, any>> }
let dados: Dados | null = null
if (typeof window !== 'undefined' && !(window as any).__labReplay) {
  ;(window as any).__labReplay = true
  const original = window.fetch.bind(window)
  const json = (v: unknown) => Promise.resolve(new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } }))
  window.fetch = (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    if (dados && url.includes('/rpc/teeds_auditar_monitoramento')) return json(1)
    if (dados && url.includes('/eventos_robos_ao_vivo')) { const de = Number(/seq=gt\.(\d+)/.exec(url)?.[1] ?? 0); return json(dados.eventos.filter((e) => Number(e.seq) > de)) }
    if (dados && url.includes('/sessoes_robos')) return json([dados.mae])
    return original(entrada, opcoes)
  }
}

export default function LabReplay() {
  const [pronto, setPronto] = useState(false)
  useEffect(() => { fetch('/lab-local/replay.json').then((r) => r.json()).then((d) => { dados = d; setPronto(true) }) }, [])
  if (!pronto || !dados) return <p style={{ padding: 24 }}>Carregando exemplo…</p>
  const m = dados.mae
  const encerrada = { id: m.id, userId: 'lab', sessaoRef: m.sessao_ref, contaId: m.conta_id, demo: m.demo, moeda: m.moeda, roboId: m.robo_id, roboNome: m.robo_nome, ativo: m.ativo, situacao: m.situacao, criadaEm: m.criada_em, marca: 'globalfly' } as any
  const clientes = new Map([['lab', { userId: 'lab', nome: 'Cliente Exemplo', email: 'cliente@exemplo.com', categoria: 'gold' } as any]])
  return (
    <div className="app workspace-app"><div className="ger monitoramento" style={{ padding: 24 }}>
      <Replay sessao={{ token: 'lab' } as never} encerrada={encerrada} clientes={clientes} marca="globalfly" aoFechar={() => {}} aoErro={(e) => console.error(e)} />
    </div></div>
  )
}
