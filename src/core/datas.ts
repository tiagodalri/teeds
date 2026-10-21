/**
 * Datas da plataforma: SEMPRE dd/mm/aaaa (21/10/2026), pedido do Tiago em
 * 21/10/2026: mês por extenso ocupa espaço. Com hora: "21/10/2026 às 20:00".
 */
const valida = (v: string | number | Date | null | undefined): Date | null => {
  if (v === null || v === undefined || v === '') return null
  const d = v instanceof Date ? v : new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
export function dataCurta(v: string | number | Date | null | undefined, vazio = '—'): string {
  const d = valida(v)
  return d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : vazio
}
export function dataComHora(v: string | number | Date | null | undefined, vazio = '—'): string {
  const d = valida(v)
  return d ? `${dataCurta(d)} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : vazio
}
