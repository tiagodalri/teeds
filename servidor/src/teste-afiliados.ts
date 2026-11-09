import './ambiente'
import {
  dataOuPadrao, diasParaColetar, lerDaDeriv, lerResumo, NAO_E_AFILIADO, podeVincular, somarDias, somarDiasA,
  RESUMO_VAZIO, type Dependencias,
} from './afiliados'

/**
 * A conta de afiliado da Deriv por parceiro (09/11/2026).
 *
 *   npm run afiliados
 */
let passou = 0, falhou = 0
const conferir = (nome: string, deu: unknown, esperado: unknown) => {
  const ok = JSON.stringify(deu) === JSON.stringify(esperado)
  ok ? passou++ : falhou++
  console.log(`${ok ? '  ok  ' : ' FALHA'}  ${nome}${ok ? '' : `\n        esperava ${JSON.stringify(esperado)}, deu ${JSON.stringify(deu)}`}`)
}

console.log('\nAFILIADOS · A RESPOSTA DA DERIV NO NOSSO FORMATO\n')
const exemplo = {
  period: { start_date: '2026-11-01', end_date: '2026-11-01' }, currency: 'USD', has_lifetime_referred_client: true,
  signups: { total: 12, real_accounts: 9, first_time_depositors: 4, first_time_traders: 3 },
  master_partner: { earnings_occurred: 1.234, active_subpartners: 0 },
  activity: { paid: 10.005, pending: 2.5, active_traders: 7 },
}
conferir('lê todos os campos', lerResumo(exemplo), {
  cadastros: 12, contasReais: 9, primeiroDeposito: 4, primeiraOperacao: 3, operaram: 7,
  comissaoPaga: 10.01, comissaoPendente: 2.5, subafiliadosAtivos: 0, ganhoSubafiliados: 1.23,
})
conferir('também dentro de "data"', lerResumo({ data: exemplo }).cadastros, 12)
conferir('campo faltando vira zero (a API é Beta)', lerResumo({ signups: {} }), RESUMO_VAZIO)
conferir('lixo vira zero', lerResumo({ signups: { total: 'x' }, activity: { paid: null } }).cadastros, 0)

console.log('\nAFILIADOS · SOMAR OS DIAS\n')
const d1 = { ...RESUMO_VAZIO, cadastros: 2, operaram: 5, comissaoPaga: 1.1 }
const d2 = { ...RESUMO_VAZIO, cadastros: 3, operaram: 4, comissaoPaga: 2.2 }
const t = somarDias([d1, d2])
conferir('cadastros somam', t.cadastros, 5)
conferir('comissão soma sem erro de centavo', t.comissaoPaga, 3.3)
conferir('"operaram" não soma: fica o maior dia', t.operaram, 5)
conferir('sem dias, tudo zero', somarDias([]), RESUMO_VAZIO)

console.log('\nAFILIADOS · QUAIS DIAS LER\n')
conferir('soma de dias atravessa o mês', somarDiasA('2026-11-01', -1), '2026-10-31')
const primeira = diasParaColetar('2026-11-09', new Set(), 60)
conferir('primeira vez: 60 dias', primeira.length, 60)
conferir('do mais novo ao mais velho', [primeira[0], primeira[59]], ['2026-11-09', '2026-09-11'])
const todos = new Set(primeira)
conferir('com tudo guardado, relê só os 3 últimos', diasParaColetar('2026-11-09', todos, 60), ['2026-11-09', '2026-11-08', '2026-11-07'])
todos.delete('2026-10-01')
conferir('e o buraco que faltar', diasParaColetar('2026-11-09', todos, 60), ['2026-11-09', '2026-11-08', '2026-11-07', '2026-10-01'])

console.log('\nAFILIADOS · QUEM PODE LIGAR QUAL CONTA\n')
conferir('o geral liga qualquer código', podeVincular({ geral: true, parceiro: null }, 'n'), true)
conferir('o geral liga o Direto', podeVincular({ geral: true, parceiro: null }, ''), true)
conferir('o Naor liga o /n', podeVincular({ geral: false, parceiro: 'n' }, 'n'), true)
conferir('o Naor NÃO liga o /v', podeVincular({ geral: false, parceiro: 'n' }, 'v'), false)
conferir('o parceiro NÃO liga o Direto', podeVincular({ geral: false, parceiro: 'v' }, ''), false)

console.log('\nAFILIADOS · DATAS DO PEDIDO\n')
conferir('data boa passa', dataOuPadrao('2026-11-01', 'x'), '2026-11-01')
conferir('texto qualquer vira o padrão', dataOuPadrao('ontem', 'x'), 'x')
conferir('injeção vira o padrão', dataOuPadrao('2026-11-01&end_date=1', 'x'), 'x')

console.log('\nAFILIADOS · A LEITURA NA DERIV (sem rede)\n')
const sessao = { accessToken: 'segredo-de-teste', appId: 'APP' } as any
let pedido: { url: string; auth: string } | null = null
const comResposta = (status: number, corpo: unknown): Dependencias => ({
  autorizacao: async () => ({ tipo: 'ok', sessao }),
  buscar: (async (url: string, init: RequestInit) => {
    pedido = { url, auth: String((init.headers as Record<string, string>).Authorization) }
    return new Response(JSON.stringify(corpo), { status })
  }) as unknown as typeof fetch,
})
const ok = await lerDaDeriv('u1', '2026-11-01', '2026-11-02', comResposta(200, exemplo))
conferir('200: lê o resumo', ok.ok && ok.resumo.cadastros, 12)
conferir('pede o período certo', pedido!.url, 'https://api.derivws.com/partners/analytics/v1/overview?start_date=2026-11-01&end_date=2026-11-02')
conferir('a autorização vai só no cabeçalho', pedido!.auth, 'Bearer segredo-de-teste')
const n404 = await lerDaDeriv('u1', '2026-11-01', '2026-11-01', comResposta(404, { error: 'no partner' }))
conferir('404: não é conta de afiliado', n404.ok ? null : [n404.situacao, n404.detalhe], ['nao-e-afiliado', NAO_E_AFILIADO])
const n403 = await lerDaDeriv('u1', '2026-11-01', '2026-11-01', comResposta(403, {}))
conferir('403 (sem a permissão de leitura): reconectar', n403.ok ? null : n403.situacao, 'reconectar')
const n500 = await lerDaDeriv('u1', '2026-11-01', '2026-11-01', comResposta(500, {}))
conferir('500: erro, tenta depois', n500.ok ? null : n500.situacao, 'erro')
const vencida = await lerDaDeriv('u1', '2026-11-01', '2026-11-01', { ...comResposta(200, exemplo), autorizacao: async () => ({ tipo: 'vencido' }) })
conferir('autorização vencida: reconectar, sem chamar a Deriv', vencida.ok ? null : vencida.situacao, 'reconectar')
const caiu = await lerDaDeriv('u1', '2026-11-01', '2026-11-01', { autorizacao: async () => ({ tipo: 'ok', sessao }), buscar: (async () => { throw new Error('rede') }) as unknown as typeof fetch })
conferir('rede caiu: erro, sem derrubar nada', caiu.ok ? null : caiu.situacao, 'erro')
conferir('nenhuma mensagem leva a autorização', [n404, n403, n500, vencida, caiu].some((x) => JSON.stringify(x).includes('segredo-de-teste')), false)

console.log(`\n${passou} ok · ${falhou} falha(s)\n`)
process.exit(falhou ? 1 : 0)
