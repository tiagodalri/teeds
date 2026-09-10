/**
 * Uma passada da sincronia de comissões, feita à mão.
 *
 *   cd servidor && npm run comissoes              # só lê e mostra: nada é gravado
 *   cd servidor && npm run comissoes -- --gravar  # lê e grava no banco
 *
 * Mostra, conta a conta, o que a Deriv devolve de hoje e de ontem e quanto
 * de comissão isso vale — para conferir com a tela antes de confiar no
 * número que a rotina automática vai gravar.
 */
import './ambiente'

import { sincronizarTudo } from './comissoes'

const gravar = process.argv.includes('--gravar')
console.log(gravar
  ? 'Lendo a tabela de lucros de cada conta real e GRAVANDO no banco…\n'
  : 'Lendo a tabela de lucros de cada conta real. Nada será gravado — use --gravar para gravar.\n')

const usd = (v: number) => v.toFixed(2)

const r = await sincronizarTudo({
  gravar,
  aoLer: (conta, dias) => {
    console.log(`${conta.accountId} (${conta.currency}, saldo ${usd(conta.balance)})`)
    for (const d of dias) {
      console.log(
        `  ${d.dia}: ${d.operacoes} operação(ões) · entradas ${usd(d.entradas)} · pagamentos ${usd(d.pagamentos)}` +
        ` · comissão ${d.comissao.toFixed(4)} · resultado ${usd(d.resultado)}` + (d.truncado ? ' · TRUNCADO' : ''),
      )
    }
  },
})

console.log(
  `\n${r.contas} conta(s) · ${r.dias} dia(s)` +
  (r.repetidas ? ` · ${r.repetidas} repetida(s)` : '') +
  (r.erros ? ` · ${r.erros} erro(s)` : '') +
  (r.ignorados ? ` · ${r.ignorados} cliente(s) sem autorização válida` : ''),
)
