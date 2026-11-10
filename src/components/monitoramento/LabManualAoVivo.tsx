/**
 * Laboratório da cabine ao vivo da manual: ?tela=manual-ao-vivo, com o preço REAL da Deriv (cotação
 * pública) e uma operação de exemplo comprada há 40 s, vencendo em 2 min.
 * &tipo=PUT|DIGITOVER|DIGITEVEN… &barreira=4 &fim=ganhou|perdeu|vendida &real=1 &markup=1 &sem-entrada=1
 */
import { useMemo, useState } from 'react'
import { CabineDaManual, type ManualAoVivo } from './CabineDaManual'

export default function LabManualAoVivo() {
  const p = new URLSearchParams(location.search)
  const [aberta, setAberta] = useState(true)
  const op = useMemo<ManualAoVivo>(() => {
    const agora = Date.now()
    const fim = p.get('fim')
    const compra = fim ? agora - 5 * 60_000 : agora - 40_000
    return {
      userId: 'u1', contractId: 1, contaId: p.has('real') ? 'CR6124410' : 'VRTC9087123', demo: !p.has('real'),
      ativo: p.get('ativo') ?? 'R_75', tipo: p.get('tipo') ?? 'CALL', moeda: 'USD',
      entrada: 10, pagamento: 17.84, resultado: fim === 'ganhou' ? 7.84 : fim === 'perdeu' ? -10 : fim === 'vendida' ? 3.28 : 0, markup: 0.54,
      situacao: fim ?? 'aberta', compradaEm: new Date(compra).toISOString(), expiraEm: new Date(compra + 160_000).toISOString(),
      encerradaEm: fim ? new Date(compra + 160_000).toISOString() : null,
      precoEntrada: null, precoSaida: null, barreira: p.get('barreira') != null ? Number(p.get('barreira')) : null,
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="app workspace-app" style={{ minHeight: '100dvh', padding: 24 }}>
      <button type="button" onClick={() => setAberta(true)}>Abrir a cabine</button>
      {aberta && <CabineDaManual op={op} nome="Danyllo Oliveira Barbosa" email="danylloob@gmail.com" selo={{ texto: 'Naor /n', codigo: 'n' }}
        mostrarMarkup={p.has('markup')} aoFechar={() => setAberta(false)} />}
    </div>
  )
}
