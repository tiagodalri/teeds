/**
 * Recalcula o passado com a separação por origem.
 *
 *   cd /root/teeds/servidor && node dist/recalculo.mjs 90          # de verdade
 *   cd /root/teeds/servidor && node dist/recalculo.mjs 90 ensaio   # só mostra
 *
 * Até 30/09/2026 a comissão de cada dia era 3% de TUDO o que aparecia no
 * extrato do cliente — inclusive o que ele operou por fora. Os dias já
 * gravados carregam esse erro. Aqui a gente lê de novo, dia a dia, com as
 * três pistas (contrato registrado, app do extrato e horário) e regrava:
 *
 *  - `comissoes_diarias` fica só com o que é da marca — a receita de verdade;
 *  - `contratos_por_origem` ganha o mapa completo, inclusive o externo.
 *
 * E arruma a contagem em dobro: a MESMA conta Deriv ligada a dois cadastros
 * da mesma marca gerava duas linhas iguais por dia, e qualquer soma contava
 * duas vezes. Depois de reler, as linhas dos cadastros que não são o dono
 * daquela leitura são apagadas no período.
 *
 * Uma pessoa pode ter várias contas: cada conta é lida e gravada em
 * separado, e nada se mistura.
 */
import './ambiente'
import { fetchAccounts, type TradingAccount } from '../../src/core/deriv/account'
import { autorizacaoDoCliente } from './cofre'
import { sincronizarConta, diasRecentes } from './comissoes'
import { clientesComAutorizacao, atualizarContaDeriv, apagarComissoesDeOutrosDonos } from './supabase'

const curto = (id: string) => `${id.slice(0, 8)}…`
const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface ResultadoRecalculo {
  contas: number
  dias: number
  erros: number
  ignorados: number
  repetidas: number
  duplicadasApagadas: number
}

export async function recalcularHistorico(diasParaTras: number, gravar: boolean): Promise<ResultadoRecalculo> {
  const r: ResultadoRecalculo = { contas: 0, dias: 0, erros: 0, ignorados: 0, repetidas: 0, duplicadasApagadas: 0 }
  const dias = diasRecentes(diasParaTras)
  const clientes = await clientesComAutorizacao()
  console.log(`[recalculo] ${clientes.length} cadastro(s) com autorização · ${dias.length} dia(s) · ${gravar ? 'GRAVANDO' : 'ensaio, sem gravar'}`)

  // A mesma conta pode estar ligada a dois cadastros da mesma marca: lê uma vez.
  const feitas = new Set<string>()

  for (const { user_id: userId, marca } of clientes) {
    const cofre = await autorizacaoDoCliente(userId)
    if (cofre.tipo !== 'ok') {
      r.ignorados += 1
      console.log(`[recalculo] ${curto(userId)} (${marca}): sem autorização utilizável (${cofre.tipo})`)
      continue
    }

    let contas: TradingAccount[]
    try {
      contas = await fetchAccounts(cofre.sessao)
    } catch (e) {
      r.erros += 1
      console.error(`[recalculo] ${curto(userId)}: não consegui listar as contas — ${(e as Error).message}`)
      continue
    }

    for (const conta of contas.filter((c) => c.type !== 'demo')) {
      const chave = `${marca}:${conta.accountId}`
      if (feitas.has(chave)) { r.repetidas += 1; continue }
      feitas.add(chave)
      try {
        if (gravar) {
          await atualizarContaDeriv({
            userId, marca, contaId: conta.accountId, tipo: conta.type,
            moeda: conta.currency, saldo: conta.balance,
          })
        }
        console.log(`[recalculo] ${marca} · ${conta.accountId} · ${curto(userId)}: lendo ${dias.length} dia(s)…`)
        const lidos = await sincronizarConta(cofre.sessao, userId, marca, conta, {
          gravar, dias, pausaEntreDiasMs: 1_200,
        })
        r.contas += 1
        r.dias += lidos.length
        const comOperacao = lidos.filter((d) => d.operacoes > 0)
        for (const d of comOperacao) {
          console.log(`   ${d.dia}: ${d.operacoes} contrato(s) nossos · markup ${d.comissao.toFixed(4)} · resultado ${d.resultado.toFixed(2)}`)
        }
        if (!comOperacao.length) console.log('   nenhum contrato nosso no período')

        if (gravar) {
          const apagadas = await apagarComissoesDeOutrosDonos(marca, conta.accountId, userId, dias[dias.length - 1], dias[0])
          if (apagadas) {
            r.duplicadasApagadas += apagadas
            console.log(`   ${apagadas} linha(s) duplicada(s) de outro cadastro apagada(s)`)
          }
        }
      } catch (e) {
        r.erros += 1
        console.error(`[recalculo] ${marca} · ${conta.accountId}: ${(e as Error).message}`)
      }
      await pausa(800)
    }
  }
  return r
}

const [diasArg, modo] = process.argv.slice(2)
const quantos = Math.max(1, Math.min(365, Number(diasArg) || 30))
const gravar = modo !== 'ensaio'
recalcularHistorico(quantos, gravar)
  .then((r) => {
    console.log(`\n[recalculo] contas ${r.contas} · dias ${r.dias} · duplicadas apagadas ${r.duplicadasApagadas} · repetidas ${r.repetidas} · ignorados ${r.ignorados} · erros ${r.erros}`)
    process.exit(r.erros ? 1 : 0)
  })
  .catch((e) => { console.error(e); process.exit(1) })
