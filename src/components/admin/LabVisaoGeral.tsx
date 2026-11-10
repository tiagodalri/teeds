/** Laboratório (?tela=visao-geral(&cenario=real|vazio)): a Visão geral com números de exemplo, sem banco. */
import { VisaoGeralPainel } from './VisaoGeralPainel'

const hoje = new Date()
const dia = (n: number) => { const d = new Date(hoje); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10) }
function exemplo(cenario: string) {
  const vazio = cenario === 'vazio', real = cenario === 'real'
  return {
    agora: { na_plataforma: vazio ? 8 : 132, operando_real: vazio ? 0 : real ? 6 : 23, operando_demo: vazio ? 1 : 41, banca_operando_real: vazio ? 0 : real ? 904 : 48_320.55,
      ias_real: vazio ? 0 : 19, ias_demo: 41, manuais_real: vazio ? 0 : 7 },
    banca: { total: real ? 904 : 186_450.9, clientes_com_saldo: real ? 14 : 214, contas_reais: real ? 118 : 402, maior: real ? 625 : 25_400,
      faixas: [{ rotulo: 'Até US$ 50', clientes: real ? 9 : 48, soma: 0 }, { rotulo: 'US$ 50 a 200', clientes: real ? 3 : 61, soma: 0 }, { rotulo: 'US$ 200 a 1 mil', clientes: real ? 2 : 70, soma: 0 },
               { rotulo: 'US$ 1 mil a 5 mil', clientes: real ? 0 : 28, soma: 0 }, { rotulo: 'Mais de US$ 5 mil', clientes: real ? 0 : 7, soma: 0 }],
      top: ['Marcos Vinícius Andrade', 'Patrícia Lemos', 'Rafael Costa', 'Juliana Prado', 'Eduardo Nunes'].map((nome, i) => ({
        user_id: `t${i}`, nome, foto_url: null, parceiro: ['n', 'v', null, 'n', 'v'][i], saldo: real ? [625, 120, 80, 35, 20][i] : [25400, 18250.4, 12800, 9930, 7420][i], operando: i === 0 || i === 2, online: i < 3 })) },
    markup: { hoje: real ? 10.28 : 412.6, d7: real ? 10.28 : 2_318.4, d30: real ? 13.54 : 8_904.2, mes: real ? 10.63 : 3_210.8,
      serie: Array.from({ length: 30 }, (_, i) => ({ dia: dia(29 - i), markup: real ? (i === 29 ? 10.28 : i > 25 ? 0.8 : 0) : Math.round((180 + Math.sin(i / 3) * 90 + i * 9) * 100) / 100, operacoes: 400 + i * 12 })) },
    hoje: { operacoes: real ? 476 : 8_412, volume: real ? 209.94 : 41_220, resultado: real ? -24.14 : 1_280.4, operaram: real ? 5 : 64 },
    funil: { cadastrados: 1062, ativos: 1057, conectaram: real ? 158 : 640, conta_real: real ? 117 : 402, com_saldo: real ? 14 : 214, operaram_real: real ? 8 : 131, ativos_24h: 519 },
    dinheiro: { depositos_7d: real ? 942.37 : 32_400, saques_7d: real ? 85.44 : 6_120.5, depositos_30d: real ? 1070.77 : 98_300, saques_30d: real ? 99.24 : 21_450, depositantes_30d: real ? 12 : 188 },
    alertas: { expirados: real ? 0 : 3, vencem_7d: real ? 0 : 12 },
  }
}

export default function LabVisaoGeral() {
  const cenario = new URLSearchParams(location.search).get('cenario') ?? ''
  const f = window.fetch
  window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => String(u).includes('teeds_painel_visao_geral')
    ? new Response(JSON.stringify(exemplo(cenario)), { status: 200 }) : f(u, i)) as typeof fetch
  return (
    <div className="app workspace-app" style={{ minHeight: '100dvh' }}>
      <main className="admin-page" style={{ padding: 24 }}>
        <VisaoGeralPainel sessao={{ token: 'lab' } as never} marca="globalfly" parceiro="" aoIr={() => undefined} />
      </main>
    </div>
  )
}
