/**
 * Uma passada da coleta de depósitos e saques, feita à mão.
 *
 *   cd servidor && npm run extrato              # só lê e mostra: nada é gravado
 *   cd servidor && npm run extrato -- --gravar  # lê e grava no banco
 *
 * Existe para a primeira vez não ser no escuro: antes de ligar a coleta
 * automática, dá para ver conta a conta o que a Deriv devolve e conferir
 * com o extrato na tela do cliente.
 */
import './ambiente'

import { coletarTudo } from './extrato'

const gravar = process.argv.includes('--gravar')
console.log(gravar
  ? 'Lendo o extrato de cada conta real e GRAVANDO no banco…\n'
  : 'Lendo o extrato de cada conta real. Nada será gravado — use --gravar para gravar.\n')

const quando = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'UTC' }) + ' UTC'

const r = await coletarTudo({
  gravar,
  aoLer: (conta, linhas) => {
    console.log(`── ${conta.accountId} (${conta.currency}) · ${linhas.length} movimentação(ões)`)
    for (const l of [...linhas].sort((a, b) => a.ocorrida_em.localeCompare(b.ocorrida_em))) {
      const sinal = l.tipo === 'deposit' ? '+' : '-'
      console.log(`   ${quando(l.ocorrida_em)}  ${sinal}${l.valor.toFixed(2)} ${l.moeda}  saldo ${l.saldo_depois ?? '?'}  ${l.descricao ?? ''}`)
    }
  },
})

console.log(
  `\n${r.contas} conta(s) real(is) · ${r.novas} movimentação(ões) ${gravar ? 'nova(s) gravada(s)' : 'encontrada(s)'}` +
  ` · ${r.erros} erro(s) · ${r.ignorados} cliente(s) sem autorização válida`,
)
process.exit(r.erros ? 1 : 0)
