import { useEffect, useState } from 'react'

/**
 * Data e hora de Brasília, ao vivo (22/10/2026, pedido do Tiago): no topo do
 * computador, ao lado da conta, e no rodapé do menu no celular. Sempre no
 * fuso de Brasília, para todo cliente ver a mesma hora que a equipe fala nas
 * aulas e na sala ao vivo, esteja o aparelho no fuso que estiver.
 */
const FUSO = 'America/Sao_Paulo'

export function RelogioTopo({ className = '' }: { className?: string }) {
  const [agora, setAgora] = useState(() => new Date())
  useEffect(() => {
    // o tique cai na virada do segundo, para o relógio não andar "atrasado"
    let relogio = 0
    const tique = () => { setAgora(new Date()); relogio = window.setTimeout(tique, 1000 - (Date.now() % 1000) + 8) }
    relogio = window.setTimeout(tique, 1000 - (Date.now() % 1000) + 8)
    // o app voltando do segundo plano já mostra a hora certa, sem esperar o próximo tique
    const aoVoltar = () => { if (document.visibilityState === 'visible') setAgora(new Date()) }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { window.clearTimeout(relogio); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [])
  const data = agora.toLocaleDateString('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = agora.toLocaleTimeString('pt-BR', { timeZone: FUSO, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  return (
    <div className={`relogio-topo ${className}`} title="Horário de Brasília" aria-label={`${data}, ${hora}, horário de Brasília`}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" /><path d="M8 4.6V8l2.3 1.4" /></svg>
      <span className="relogio-data">{data}</span>
      <span className="relogio-hora">{hora}</span>
      <small>Brasília</small>
    </div>
  )
}
