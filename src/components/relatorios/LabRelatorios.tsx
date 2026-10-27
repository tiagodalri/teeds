/** Laboratório (?tela=relatorios): a aba Relatórios com 30 dias de exemplo, sem banco nem corretora. */
import { RelatoriosPanel } from './RelatoriosPanel'
import type { Relatorio } from '../../core/teeds/relatorios'

function exemplo(): Relatorio {
  let semente = 7
  const rnd = () => { semente = (semente * 9301 + 49297) % 233280; return semente / 233280 }
  const hoje = new Date()
  const porDia = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 29 + i)
    const operacoes = rnd() < .15 ? 0 : Math.round(20 + rnd() * 90)
    const resultado = operacoes ? Math.round((rnd() - .38) * 6000) / 100 : 0
    return { dia: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, operacoes, ganhas: Math.round(operacoes * (.55 + rnd() * .2)), resultado, entradas: operacoes * 1.2 }
  })
  const soma = (k: 'operacoes' | 'ganhas' | 'resultado') => porDia.reduce((s, d) => s + d[k], 0)
  const resultado = Math.round(soma('resultado') * 100) / 100
  return {
    total: { operacoes: soma('operacoes'), ganhas: soma('ganhas'), resultado, entradas: soma('operacoes') * 1.2, pagamentos: 0, maiorGanho: 18.4, maiorPerda: -22.1, primeira: null, ultima: null },
    porDia,
    porOrigem: [
      { origem: 'ia', id: 'goreme', nome: 'GF Raptor', operacoes: 820, ganhas: 560, resultado: resultado * .6 },
      { origem: 'ia', id: 'falcon', nome: 'GF Falcon', operacoes: 610, ganhas: 380, resultado: resultado * .5 },
      { origem: 'ia', id: 'legacy', nome: 'GF Legacy', operacoes: 300, ganhas: 170, resultado: -resultado * .2 },
      { origem: 'manual', id: 'manual', nome: 'Manual', operacoes: 24, ganhas: 11, resultado: 12.5 },
    ],
    porAtivo: [{ ativo: 'R_75', operacoes: 1500, ganhas: 980, resultado: resultado * .9 }, { ativo: '1HZ100V', operacoes: 230, ganhas: 130, resultado: resultado * .1 }, { ativo: 'frxEURUSD', operacoes: 24, ganhas: 11, resultado: 12.5 }],
    porHora: Array.from({ length: 24 }, (_, h) => ({ hora: h, operacoes: h < 7 ? 0 : 40 + h * 3, ganhas: 30 + h, resultado: h < 7 ? 0 : Math.round((Math.sin(h) * 30 + 6) * 100) / 100 })).filter((x) => x.operacoes > 0),
    ultimas: Array.from({ length: 30 }, (_, i) => {
      const r = i % 3 === 1 ? -1 : Math.round((0.8 + i % 5 * .1) * 100) / 100
      return { quando: new Date(Date.now() - i * 95000).toISOString(), origem: i % 9 === 0 ? 'manual' as const : 'ia' as const, nome: i % 9 === 0 ? 'Manual' : ['GF Raptor', 'GF Falcon', 'GF Legacy'][i % 3], ativo: i % 9 === 0 ? 'frxEURUSD' : 'R_75', tipo: i % 9 === 0 ? 'CALL' : 'DIGITOVER', entrada: 1, pagamento: r > 0 ? 1 + r : 0, resultado: r, ganhou: r > 0 }
    }),
    mes: { inicio: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`, resultado: 236.4, operacoes: 1200 },
  }
}

export default function LabRelatorios() {
  const relatorio = exemplo()
  return (
    <div className="workspace-app" style={{ minHeight: '100vh', display: 'block', overflow: 'auto' }}>
      <RelatoriosPanel sessao={{ token: 'lab', usuario: { id: 'lab', email: 'ana@exemplo.com', nome: 'Ana' } } as never} socket={null}
        conectada contaDemo={false} saldo={1843.27} moeda="USD" aoIr={() => undefined}
        exemplo={{ relatorio, dinheiro: { depositos: 500, saques: 120, movimentos: [{ tipo: 'deposit', valor: 300, quando: Date.now() / 1000 - 86400 * 3 }, { tipo: 'withdrawal', valor: 120, quando: Date.now() / 1000 - 86400 * 9 }, { tipo: 'deposit', valor: 200, quando: Date.now() / 1000 - 86400 * 20 }] } }} />
    </div>
  )
}
