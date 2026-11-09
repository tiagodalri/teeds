/** Laboratório (?tela=relatorios): a aba Relatórios com 30 dias de exemplo, sem banco nem corretora. */
import { useState } from 'react'
import { RelatoriosPanel } from './RelatoriosPanel'
import { BotaoSimular } from './SimuladorDeRelatorio'
import { useMenuAdminOculto } from '../../core/menuDeAdmin'
import type { RelatorioCompleto } from '../../core/teeds/relatorios'

function exemplo(): RelatorioCompleto {
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
  const de = porDia[0].dia, ate = porDia[porDia.length - 1].dia
  return {
    de, ate, contagem: 30,
    anterior: { de, ate, operacoes: 1400, ganhas: 900, entradas: 1600, resultado: resultado - 84.3 },
    sequencias: { ganhos: 31, perdas: 6 },
    queda: { maior: 96.4, pico: resultado + 40 },
    porTipo: [{ tipo: 'DIGITOVER', operacoes: 1300, ganhas: 900, resultado: resultado * .7 }, { tipo: 'DIGITUNDER', operacoes: 430, ganhas: 260, resultado: resultado * .3 }, { tipo: 'CALL', operacoes: 24, ganhas: 11, resultado: 12.5 }],
    porDiaSemana: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dow: d, operacoes: d === 0 ? 0 : 200 + d * 30, ganhas: 130 + d * 18, resultado: d === 0 ? 0 : Math.round((Math.cos(d) * 60 + 10) * 100) / 100 })).filter((x) => x.operacoes > 0),
    opcoes: {
      estrategias: [{ id: 'goreme', nome: 'GF Raptor', origem: 'ia', operacoes: 820 }, { id: 'falcon', nome: 'GF Falcon', origem: 'ia', operacoes: 610 }, { id: 'legacy', nome: 'GF Legacy', origem: 'ia', operacoes: 300 }, { id: 'manual', nome: 'Manual', origem: 'manual', operacoes: 24 }],
      ativos: [{ id: 'R_75', operacoes: 1500 }, { id: '1HZ100V', operacoes: 230 }, { id: 'frxEURUSD', operacoes: 24 }],
      tipos: [{ id: 'DIGITOVER', operacoes: 1300 }, { id: 'DIGITUNDER', operacoes: 430 }, { id: 'CALL', operacoes: 24 }], entradaMax: 42.5,
    },
    total: { operacoes: soma('operacoes'), ganhas: soma('ganhas'), resultado, entradas: soma('operacoes') * 1.2, pagamentos: 0, maiorGanho: 18.4, maiorPerda: -22.1, primeira: null, ultima: null, somaGanhos: resultado + 380, somaPerdas: -380 },
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
      return { quando: new Date(Date.now() - i * 95000).toISOString(), origem: i % 9 === 0 ? 'manual' as const : 'ia' as const, id: i % 9 === 0 ? 'manual' : ['goreme', 'falcon', 'legacy'][i % 3], nome: i % 9 === 0 ? 'Manual' : ['GF Raptor', 'GF Falcon', 'GF Legacy'][i % 3], ativo: i % 9 === 0 ? 'frxEURUSD' : 'R_75', tipo: i % 9 === 0 ? 'CALL' : 'DIGITOVER', entrada: 1, pagamento: r > 0 ? 1 + r : 0, resultado: r, ganhou: r > 0 }
    }),
    mes: { inicio: `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`, resultado: 236.4, operacoes: 1200 },
  }
}

/**
 * ?tela=relatorios: como o administrador vê (com o botão Simular relatório no topo);
 * &cliente=1: como o cliente vê (sem o botão).
 */
/** &caso=queda: como o print do Tiago (06/11/2026): 3 semanas paradas, um dia de queda grande e dias pequenos depois. */
function exemploQueda(): RelatorioCompleto {
  const r = exemplo()
  const pequenos = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -38.2, 0, 61.5, -8912.3, 0, -54.1, 22.8, 0, -71.4, 18.9, -11.7]
  const porDia = r.porDia.map((d, i) => ({ ...d, resultado: pequenos[i], operacoes: pequenos[i] ? (i === 22 ? 21000 : 900) : 0, ganhas: pequenos[i] ? (i === 22 ? 12800 : 560) : 0 }))
  const resultado = Math.round(pequenos.reduce((a, b) => a + b, 0) * 100) / 100
  return { ...r, porDia, anterior: { ...r.anterior, operacoes: 0, resultado: 0 }, total: { ...r.total, resultado, operacoes: 28760, ganhas: 17749 } }
}

export default function LabRelatorios() {
  const relatorio = new URLSearchParams(location.search).get('caso') === 'queda' ? exemploQueda() : exemplo()
  const cliente = new URLSearchParams(location.search).has('cliente')
  const [pedido, setPedido] = useState(0)
  const [ativo, setAtivo] = useState(false)
  const adminOculto = useMenuAdminOculto()
  return (
    <div className="workspace-app" style={{ minHeight: '100vh', display: 'block', overflow: 'auto' }}>
      <header className="topbar">
        <div className="workspace-heading"><strong>Relatórios</strong><span>O seu resultado, com os números da corretora</span></div>
        {!cliente && !adminOculto && <BotaoSimular className="rsim-abrir-topo" ativo={ativo} aoAbrir={() => setPedido((x) => x + 1)} />}
        <div className="topbar-right" />
      </header>
      <RelatoriosPanel sessao={{ token: 'lab', usuario: { id: 'lab', email: 'ana@exemplo.com', nome: 'Ana' } } as never} socket={null}
        conectada contaDemo={false} saldo={1843.27} moeda="USD" aoIr={() => undefined}
        podeSimular={!cliente} pedidoSimulacao={pedido} aoMudarSimulacao={setAtivo}
        exemplo={{ relatorio, dinheiro: { depositos: 500, saques: 120, movimentos: [{ tipo: 'deposit', valor: 300, quando: Date.now() / 1000 - 86400 * 3 }, { tipo: 'withdrawal', valor: 120, quando: Date.now() / 1000 - 86400 * 9 }, { tipo: 'deposit', valor: 200, quando: Date.now() / 1000 - 86400 * 20 }] } }} />
    </div>
  )
}
