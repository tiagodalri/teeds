/**
 * Uma passada do fechamento das operações manuais vencidas, feita à mão.
 *
 *   cd servidor && npm run manuais              # só lê e mostra: nada é gravado
 *   cd servidor && npm run manuais -- --gravar  # lê e grava no banco
 *   … -- --dias=15                               # olha mais para trás (a rotina olha 3 dias)
 */
import './ambiente'

import { fecharManuaisVencidas } from './manuais-vencidas'

const gravar = process.argv.includes('--gravar')
const dias = Number((process.argv.find((a) => a.startsWith('--dias=')) ?? '').split('=')[1]) || 3
console.log(gravar ? 'Perguntando à Deriv e GRAVANDO o fim no banco…\n' : 'Perguntando à Deriv. Nada será gravado — use --gravar para gravar.\n')
const r = await fecharManuaisVencidas({ gravar, limite: 200, dias })
for (const d of r.detalhes) {
  console.log(`${d.demo ? 'demo' : 'REAL'} ${d.conta} contrato ${d.contrato}${d.tipo ? ` (${d.tipo}, ${d.status || 'sem status'})` : ''}: ${d.erro ? `erro — ${d.erro}` : d.fim ? `${d.fim.situacao} ${d.fim.resultado} às ${d.fim.encerrada_em}` : 'ainda aberto na Deriv'}`)
}
console.log(`\n${r.lidas} vencida(s) · ${r.fechadas} ${gravar ? 'fechada(s)' : 'fecharia(m)'} · ${r.aindaAbertas} ainda aberta(s) · ${r.semAutorizacao} sem autorização · ${r.falhas} falha(s)`)
process.exit(0)
