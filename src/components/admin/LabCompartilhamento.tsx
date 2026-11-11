/**
 * Laboratório (?tela=compartilhamento(&parceiro=1)(&vazio)): o Compartilhamento de receita com clientes de
 * exemplo, sem banco. Gerar, dar baixa, cancelar e reabrir funcionam em memória. &parceiro=1 mostra a visão
 * do admin do parceiro (vê, mas não mexe).
 */
import { CompartilhamentoDeReceita, type Fatura } from './CompartilhamentoDeReceita'

const NOMES = ['Marcos Vinícius Andrade', 'Patrícia Lemos', 'Rafael Costa', 'Juliana Prado', 'Eduardo Nunes', 'Camila Rocha', 'Bruno Teixeira',
  'Larissa Mendes', 'Diego Farias', 'Fernanda Alves', 'Gustavo Pires', 'Aline Barbosa', 'Thiago Moura', 'Renata Dias']
const PERC: Record<string, number> = { gold: 0.1, black: 0.05, prestige: 0 }
const faturas = new Map<string, Fatura>()
let numero = 120

const mesSp = () => `${new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 7)}-01`
const hojeSp = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
const proximo = (mes: string) => { const [a, m] = mes.split('-').map(Number); return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01` }

function clientes(mes: string, vazio: boolean) {
  if (vazio) return []
  const semente = Number(mes.slice(5, 7))
  return NOMES.map((nome, i) => {
    const sub = i === 2 || i === 9 ? 'black' : i === 5 ? 'prestige' : 'gold'
    const r = Math.round((Math.sin(i * 1.7 + semente) * 260 + (i % 3 === 0 ? 120 : -20)) * 100) / 100
    const ops = 40 + ((i * 37 + semente * 11) % 300)
    return {
      user_id: `u${i}`, nome, email: `${nome.split(' ')[0].toLowerCase()}@exemplo.com`, telefone: i % 2 ? '11987654321' : null, foto_url: null,
      parceiro: ['n', 'v', null][i % 3], parceiro_nome: ['Naor', 'Victor', null][i % 3], subplano: sub, percentual: PERC[sub],
      operacoes: ops, ganhas: Math.round(ops * (r > 0 ? 0.58 : 0.44)), manuais: i % 4 === 0 ? 6 : 0, volume: ops * 4.2,
      resultado: r, valor_usd: Math.round(Math.max(0, r) * PERC[sub] * 100) / 100,
    }
  }).sort((a, b) => b.resultado - a.resultado)
}

function painel(corpo: { p_mes: string }, vazio: boolean, geral: boolean) {
  const mes = corpo.p_mes.slice(0, 7) + '-01', atual = mesSp(), hoje = hojeSp()
  const vivas = [...faturas.values()].filter((f) => f.situacao !== 'cancelada')
  return {
    agora: new Date().toISOString(), hoje, mes, mes_atual: atual, fechado: mes < atual, vencimento: proximo(mes) > hoje ? proximo(mes) : hoje,
    parceiro: geral ? null : 'n', geral, percentuais: PERC,
    clientes: clientes(mes, vazio).map((c) => ({ ...c, fatura: vivas.find((f) => f.mes === mes && f.user_id === c.user_id) ?? null,
      canceladas: [...faturas.values()].filter((f) => f.mes === mes && f.situacao === 'cancelada' && f.user_id === c.user_id).length,
      cancelada: [...faturas.values()].filter((f) => f.mes === mes && f.situacao === 'cancelada' && f.user_id === c.user_id).pop() ?? null })),
    carteira: {
      abertas: vivas.filter((f) => f.situacao === 'aberta').length, a_receber_brl: vivas.filter((f) => f.situacao === 'aberta').reduce((s, f) => s + f.valor_brl, 0),
      vencidas: vivas.filter((f) => f.situacao === 'aberta' && f.vencimento < hoje).length,
      vencidas_brl: vivas.filter((f) => f.situacao === 'aberta' && f.vencimento < hoje).reduce((s, f) => s + f.valor_brl, 0),
      pagas: vivas.filter((f) => f.situacao === 'paga').length, recebido_brl: vivas.filter((f) => f.situacao === 'paga').reduce((s, f) => s + f.valor_brl, 0),
    },
    meses: [],
  }
}

function gerar(corpo: { p_mes: string; p_cotacao: number; p_fonte: string; p_cotacao_em: string; p_minimo_brl: number; p_usuarios: string[] | null; p_refazer_canceladas?: boolean }, vazio: boolean) {
  const mes = corpo.p_mes.slice(0, 7) + '-01', hoje = hojeSp()
  let n = 0, total = 0, abaixo = 0
  for (const c of clientes(mes, vazio)) {
    if (c.resultado <= 0 || c.percentual <= 0) continue
    if (corpo.p_usuarios && !corpo.p_usuarios.includes(c.user_id)) continue
    if (!corpo.p_refazer_canceladas && [...faturas.values()].some((f) => f.mes === mes && f.situacao === 'cancelada' && f.user_id === c.user_id)) continue
    const brl = Math.round(c.valor_usd * corpo.p_cotacao * 100) / 100
    if (brl < Math.max(corpo.p_minimo_brl, 0.01)) { abaixo++; continue }
    if ([...faturas.values()].some((f) => f.mes === mes && f.situacao !== 'cancelada' && f.user_id === c.user_id)) continue
    const f = {
      id: `f${++numero}`, numero, mes, situacao: 'aberta', subplano: c.subplano, percentual: c.percentual, operacoes: c.operacoes, lucro_usd: c.resultado,
      valor_usd: c.valor_usd, cotacao: corpo.p_cotacao, cotacao_fonte: corpo.p_fonte, cotacao_em: corpo.p_cotacao_em, valor_brl: brl,
      vencimento: proximo(mes) > hoje ? proximo(mes) : hoje, paga_em: null, baixa_forma: null, cancelada_em: null, motivo: null, gateway: null,
      pix_copia_cola: null, pix_qr: null, link_pagamento: null, visivel_cliente: false, gerada_em: new Date().toISOString(),
      historico: [{ acao: 'gerada', em: new Date().toISOString() }], nome: c.nome, email: c.email, user_id: c.user_id,
    } as unknown as Fatura
    faturas.set(f.id, f); n++; total += brl
  }
  return { geradas: n, total_brl: Math.round(total * 100) / 100, total_usd: 0, abaixo_minimo: abaixo }
}

function acao(corpo: { p_id: string; p_acao: string; p_motivo: string | null }) {
  const f = faturas.get(corpo.p_id)
  if (!f) return null
  const em = new Date().toISOString()
  if (corpo.p_acao === 'pagar') Object.assign(f, { situacao: 'paga', paga_em: em, baixa_forma: 'manual' })
  if (corpo.p_acao === 'cancelar') Object.assign(f, { situacao: 'cancelada', cancelada_em: em, motivo: corpo.p_motivo })
  if (corpo.p_acao === 'reabrir') Object.assign(f, { situacao: 'aberta', paga_em: null, baixa_forma: null, cancelada_em: null })
  f.historico = [...f.historico, { acao: corpo.p_acao, em, motivo: corpo.p_motivo }]
  return { ...f }
}

export default function LabCompartilhamento() {
  const busca = new URLSearchParams(location.search)
  const vazio = busca.has('vazio'), geral = !busca.has('parceiro')
  const original = window.fetch
  window.fetch = (async (u: RequestInfo | URL, i?: RequestInit) => {
    const url = String(u), corpo = JSON.parse(String(i?.body ?? '{}'))
    const json = (d: unknown) => new Response(JSON.stringify(d), { status: 200 })
    if (url.includes('teeds_compartilhamento')) return json(painel(corpo, vazio, geral))
    if (url.includes('teeds_gerar_faturas_compartilhamento')) return json(gerar(corpo, vazio))
    if (url.includes('teeds_fatura_compartilhamento_acao')) return json(acao(corpo))
    return original(u, i)
  }) as typeof fetch
  return (
    <div className="app workspace-app" style={{ minHeight: '100dvh' }}>
      <main className="admin-main" style={{ padding: 24 }}>
        <CompartilhamentoDeReceita sessao={{ token: 'lab' } as never} marca="globalfly" parceiro={null} onAbrirCliente={() => undefined} />
      </main>
    </div>
  )
}
