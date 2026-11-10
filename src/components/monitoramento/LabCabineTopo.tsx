/**
 * Laboratório (?tela=cabine-topo): o cabeçalho da cabine espelho e o aviso "Em conta real agora" com dados
 * de exemplo, sem banco. A leitura do aviso é respondida aqui mesmo (fetch de mentira só nesta página).
 */
import { useRef } from 'react'
import { CabecalhoDaCabine } from './CabecalhoDaCabine'
import { EmContaRealAgora } from './EmContaRealAgora'

if (typeof window !== 'undefined' && !(window as any).__labCabineTopo) {
  ;(window as any).__labCabineTopo = true
  const original = window.fetch.bind(window)
  window.fetch = (entrada: RequestInfo | URL, opcoes?: RequestInit) => {
    const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
    if (url.includes('/rpc/teeds_painel_visao_geral')) {
      const vazio = new URLSearchParams(location.search).has('vazio')
      const agora = vazio
        ? { operando_real: 0, banca_operando_real: 0, ias_real: 0, manuais_real: 0 }
        : { operando_real: 1, banca_operando_real: 68.78, ias_real: 0, manuais_real: 1 }
      return Promise.resolve(new Response(JSON.stringify({ agora }), { headers: { 'Content-Type': 'application/json' } }))
    }
    return original(entrada, opcoes)
  }
}

const sessao = { token: 'lab' } as never
const nada = () => undefined

export default function LabCabineTopo() {
  const voltar = useRef<HTMLButtonElement>(null)
  const base = { aoFechar: nada, contaId: 'ROTN843639', moeda: 'USD', idade: 0.04, rtt: 50, desvio: null }
  return (
    <div className="monitoramento" style={{ padding: 24, display: 'grid', gap: 24, maxWidth: 1440, margin: '0 auto' }}>
      <EmContaRealAgora sessao={sessao} marcas={['globalfly']} parceiro="" sinal="" local={{ pessoas: 1, ias: 0, manuais: 1 }}
        soReal={false} onVerQuem={nada} onVerTodas={nada} />
      <CabecalhoDaCabine {...base} refVoltar={voltar} nome="Joao Carlos Gomes Ribeiro" email="carlos.ribeiro@gmail.com" demo={false}
        modo="ao-vivo" saude="ao-vivo" />
      <CabecalhoDaCabine {...base} nome="Maria Eduarda Souza" email="maria@gmail.com" demo modo="ao-vivo" saude="atencao" idade={6.2} rtt={180} />
      <CabecalhoDaCabine {...base} nome="Pedro Henrique" email={null} demo={false} modo="ao-vivo" saude="desatualizado" idade={42} rtt={null} desvio={3.4} />
      <CabecalhoDaCabine {...base} nome="Joao Carlos Gomes Ribeiro" email="carlos.ribeiro@gmail.com" demo={false} modo="replay" saude="encerrada"
        passo={{ indice: 41, total: 318, horaOriginal: Date.now() - 3_600_000, lacuna: 0 }} integridade="completo" />
    </div>
  )
}
